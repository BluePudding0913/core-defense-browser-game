// Run after building server/target/core-defense-server.jar. Requires Node.js 22+.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
// Use the JVM directly so Windows launcher shims cannot leave a child behind.
const java = process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    : 'java';
const server = spawn(java, ['-jar', 'server/target/core-defense-server.jar', '0', '127.0.0.1'],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const sockets = [];
function stopServer() {
    server.kill();
}
let output = '';
server.stderr.on('data', data => { output += data; });
function client(url) {
    const ws = new WebSocket(url);
    sockets.push(ws);
    const messages = [];
    const waiters = [];
    ws.addEventListener('message', ({ data }) => {
        const message = JSON.parse(data);
        const index = waiters.findIndex(waiter => waiter.matches(message));
        if (index < 0) messages.push(message);
        else waiters.splice(index, 1)[0].resolve(message);
    });
    return {
        ws,
        opened: new Promise((resolve, reject) => {
            ws.addEventListener('open', resolve, { once: true });
            ws.addEventListener('error', reject, { once: true });
        }),
        next(matches) {
            const index = messages.findIndex(matches);
            return index >= 0 ? Promise.resolve(messages.splice(index, 1)[0])
                : new Promise(resolve => waiters.push({ matches, resolve }));
        }
    };
}
const deadline = setTimeout(() => {
    console.error('Room server test timed out:', output);
    for (const socket of sockets) socket.close();
    stopServer();
    process.exitCode = 1;
}, 20000);
(async () => {
    const port = await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.once('exit', code => reject(new Error(`Server exited (${code}): ${output}`)));
        server.stdout.on('data', data => {
            output += data;
            const match = output.match(/ws:\/\/127\.0\.0\.1:(\d+)/);
            if (match) resolve(match[1]);
        });
    });
    const session = randomUUID();
    const base = `ws://127.0.0.1:${port}/?`;
    const directory = client(`${base}session=${session}&directory=1`);
    await directory.opened;
    directory.ws.send('CREATE_ROOM:あ');
    const created = await directory.next(m => m.type === 'room-created');
    assert(created.roomId);
    directory.ws.close();
    const host = client(`${base}session=${session}&room=${created.roomId}`);
    await host.opened;
    const map = await host.next(m => m.type === 'map');
    assert.equal(map.map.version, 5);
    const definition = JSON.parse(require('node:fs').readFileSync('shared/map.json', 'utf8'));
    for (const field of ['tileMap', 'areas', 'trapSlots', 'resourceNodes', 'shopUnits', 'workbenchUnits',
        'breakerTerminals', 'prepConsole']) {
        assert.deepEqual(map.map[field], definition[field], `${field} must reach the browser without relocation`);
    }
    const welcome = await host.next(m => m.type === 'welcome');
    host.ws.send('INPUT:1:HELLO:あ');
    const lobby = await host.next(m => m.type === 'state' && m.phase === 'lobby'
        && m.players.some(p => p.id === welcome.playerId && p.ackInput >= 1));
    assert.equal(lobby.roomOwnerId, welcome.playerId);
    assert(lobby.allReady, 'the owner can start alone without a ready command');
    const guestSession = randomUUID();
    const listing = client(`${base}session=${guestSession}&directory=1`);
    await listing.opened;
    const rooms = await listing.next(m => m.type === 'rooms'
        && m.rooms.some(room => room.id === created.roomId && room.joinable));
    assert.equal(rooms.rooms.find(room => room.id === created.roomId).owner, 'あ');
    listing.ws.close();
    const guest = client(`${base}session=${guestSession}&room=${created.roomId}`);
    await guest.opened;
    await guest.next(m => m.type === 'welcome');
    guest.ws.send('INPUT:1:HELLO:い');
    guest.ws.send('INPUT:2:ROOM_READY:1');
    await host.next(m => m.type === 'state' && m.allReady
        && m.players.filter(p => p.human).length === 2);
    host.ws.send('INPUT:3:START');
    await host.next(m => m.type === 'state' && m.phase === 'preparing');
    const phrase = '友達 : & <秘密>';
    async function directoryClient() {
        const session = randomUUID();
        const peer = client(`${base}session=${session}&directory=1`);
        await peer.opened;
        return { session, peer };
    }
    async function match(directory, action, password = '') {
        directory.peer.ws.send('MATCH:' + JSON.stringify({ action, password, name: 'Host' }));
        return directory.peer.next(m => m.type === 'room-created' || m.type === 'error');
    }
    async function enter(directory, roomId, password = '') {
        const peer = client(`${base}session=${directory.session}&room=${roomId}&phrase=${encodeURIComponent(password)}`);
        await peer.opened;
        return peer;
    }
    async function close(peer) {
        const closed = new Promise(resolve => peer.ws.addEventListener('close', resolve, { once: true }));
        peer.ws.close();
        await closed;
    }
    const privateDirectory = await directoryClient();
    assert.equal((await match(privateDirectory, 'create', ' ')).type, 'error');
    const privateRoom = await match(privateDirectory, 'create', phrase);
    assert(privateRoom.roomId);
    const privateHost = await enter(privateDirectory, privateRoom.roomId, phrase);
    const privateWelcome = await privateHost.next(m => m.type === 'welcome');
    const privateState = await privateHost.next(m => m.type === 'state');
    assert(privateState.privateRoom);
    assert.equal(privateState.players.find(p => p.id === privateWelcome.playerId).name, 'Host',
        'private room names are set before the first snapshot');
    assert(privateState.allReady, 'host can start with automatic CPUs');
    assert.equal(privateState.players.length, 4);
    assert.equal(privateState.players.filter(p => !p.human).length, 3);
    const friendDirectory = await directoryClient();
    friendDirectory.peer.ws.send('LIST_ROOMS');
    const publicList = await friendDirectory.peer.next(m => m.type === 'rooms');
    assert(!publicList.rooms.some(r => r.id === privateRoom.roomId));
    assert(!JSON.stringify(publicList).includes(phrase));
    assert.equal((await match(friendDirectory, 'create', phrase)).type, 'error');
    assert.equal((await match(friendDirectory, 'join', 'wrong')).type, 'error');
    const denied = await enter(friendDirectory, privateRoom.roomId, 'wrong');
    assert.equal((await denied.next(m => m.type === 'error')).type, 'error');
    assert.equal((await match(friendDirectory, 'join', ` ${phrase} `)).roomId, privateRoom.roomId);
    const friend = await enter(friendDirectory, privateRoom.roomId, phrase);
    const friendWelcome = await friend.next(m => m.type === 'welcome');
    friend.ws.send('START');
    const guestState = await friend.next(m => m.type === 'state' && m.roomPlayers === 2);
    assert.equal(guestState.players.find(p => p.id === friendWelcome.playerId).name, 'Host',
        'joining by phrase sets the name before broadcasting');
    assert.equal(guestState.players.length, 4);
    assert.equal(guestState.players.filter(p => !p.human).length, 2);
    assert(!guestState.allReady);
    assert.equal(guestState.phase, 'lobby');
    friend.ws.send('ROOM_READY:1');
    await privateHost.next(m => m.type === 'state' && m.allReady);
    privateHost.ws.close();
    await friend.next(m => m.type === 'state' && m.roomOwnerId === friendWelcome.playerId);
    await friend.next(m => m.type === 'state' && m.roomOwnerId === friendWelcome.playerId && m.allReady);
    friend.ws.send('START');
    const automaticMatch = await friend.next(m => m.type === 'state' && m.phase === 'preparing');
    assert.equal(automaticMatch.players.length, 4);
    assert.equal(automaticMatch.players.filter(p => !p.human).length, 3);
    assert.equal((await match(privateDirectory, 'join', phrase)).type, 'error', 'playing rooms reject search');
    const quickDirectory = await directoryClient();
    const quickRoom = await match(quickDirectory, 'quick');
    assert.notEqual(quickRoom.roomId, privateRoom.roomId);
    const quickHost = await enter(quickDirectory, quickRoom.roomId);
    const quickWelcome = await quickHost.next(m => m.type === 'welcome');
    const quickState = await quickHost.next(m => m.type === 'state');
    assert.equal(quickState.roomOwnerId, quickWelcome.playerId);
    assert.equal(quickState.players.find(p => p.id === quickWelcome.playerId).name, 'Host',
        'quick match never publishes the default Player 1 name');
    assert(!quickState.privateRoom);
    assert(quickState.allReady);
    const quickGuestDirectory = await directoryClient();
    assert.equal((await match(quickGuestDirectory, 'quick')).roomId, quickRoom.roomId);
    const quickGuest = await enter(quickGuestDirectory, quickRoom.roomId);
    const quickGuestWelcome = await quickGuest.next(m => m.type === 'welcome');
    const quickGuestState = await quickGuest.next(m => m.type === 'state');
    assert.equal(quickGuestState.players.find(p => p.id === quickGuestWelcome.playerId).name, 'Host',
        'quick match guests also have their name in the first snapshot');
    const finalDirectory = await directoryClient();
    assert.equal((await match(finalDirectory, 'quick')).roomId, quickRoom.roomId);
    const extraDirectory = await directoryClient();
    assert.equal((await match(extraDirectory, 'quick')).roomId, quickRoom.roomId,
        'automatic CPU slots remain available for humans');
    const overflowDirectory = await directoryClient();
    assert.notEqual((await match(overflowDirectory, 'quick')).roomId, quickRoom.roomId,
        'pending reservations count toward capacity');
    // Replacing a socket must not delete the room when the old socket closes.
    const replacement = await enter(quickDirectory, quickRoom.roomId);
    const replacementWelcome = await replacement.next(m => m.type === 'welcome');
    assert.equal(replacementWelcome.playerId, quickWelcome.playerId);
    await replacement.next(m => m.type === 'state' && m.roomPlayers === 2);
    await close(replacement);
    await quickGuest.next(m => m.type === 'state' && m.roomPlayers === 1);
    const observer = await directoryClient();
    const remaining = await observer.peer.next(m => m.type === 'rooms');
    assert(remaining.rooms.some(r => r.id === quickRoom.roomId), 'keep the room while a guest remains');
    await close(quickGuest);
    await observer.peer.next(m => m.type === 'rooms' && !m.rooms.some(r => r.id === quickRoom.roomId));
    const missingPublic = await enter(observer, quickRoom.roomId);
    assert.equal((await missingPublic.next(m => m.type === 'error')).type, 'error',
        'the last exit removes the room even with outstanding reservations');
    await close(friend);
    assert.equal((await match(privateDirectory, 'join', phrase)).type, 'error');
    const reusedPhrase = await match(privateDirectory, 'create', phrase);
    assert(reusedPhrase.roomId, 'free the passphrase immediately after the last exit during play');
    assert.notEqual(reusedPhrase.roomId, privateRoom.roomId);
    console.log('Empty room cleanup passed: last exit, remaining guest, socket replacement, reservations, passphrase reuse');
    console.log('Live matching passed: private phrases, isolation, errors, quick matching, automatic CPUs, owner transfer, start, reservations');
    console.log('Live server passed: create, owner lobby, room listing, guest join, ready, start');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    clearTimeout(deadline);
    for (const socket of sockets) socket.close();
    stopServer();
});
