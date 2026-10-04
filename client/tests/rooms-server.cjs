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
    const welcome = await host.next(m => m.type === 'welcome');
    host.ws.send('INPUT:1:HELLO:あ');
    const lobby = await host.next(m => m.type === 'state' && m.phase === 'lobby');
    assert.equal(lobby.roomOwnerId, welcome.playerId);
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
    host.ws.send('INPUT:2:ROOM_READY:1');
    guest.ws.send('INPUT:2:ROOM_READY:1');
    await host.next(m => m.type === 'state' && m.allReady
        && m.players.filter(p => p.human).length === 2);
    host.ws.send('INPUT:3:START');
    await host.next(m => m.type === 'state' && m.phase === 'preparing');
    console.log('Live server passed: create, owner lobby, room listing, guest join, ready, start');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    clearTimeout(deadline);
    for (const socket of sockets) socket.close();
    stopServer();
});
