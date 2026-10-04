const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const html = fs.readFileSync('client/index.html', 'utf8');
function extract(name) {
    const begin = source.indexOf('function ' + name + '(');
    const end = source.indexOf('\nfunction ', begin + 1);
    return source.slice(begin, end < 0 ? undefined : end);
}
function element() {
    const classes = new Set();
    const handlers = {};
    return {
        value: '', disabled: true, dataset: {}, textContent: '', innerHTML: '',
        closest: () => null, // The name field deliberately has no label wrapper.
        classList: {
            add: c => classes.add(c), remove: c => classes.delete(c),
            contains: c => classes.has(c),
            toggle: (c, on) => on ? classes.add(c) : classes.delete(c)
        },
        addEventListener: (type, handler) => { handlers[type] = handler; },
        fire: type => handlers[type]?.(),
        click() { if (!this.disabled) handlers.click?.(); }
    };
}
class Socket {
    static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
    constructor(url) { this.url = url; this.readyState = 0; this.handlers = {}; this.sent = []; }
    addEventListener(type, handler) { this.handlers[type] = handler; }
    send(message) { this.sent.push(message); }
    open() { this.readyState = 1; this.handlers.open(); }
    close() { this.readyState = 3; this.handlers.close?.(); }
    message(message) { this.handlers.message({ data: JSON.stringify(message) }); }
}
const context = {
    WebSocket: Socket, URLSearchParams, console,
    window: { location: { hostname: 'localhost', protocol: 'http:' } },
    URL_PARAMETERS: new URLSearchParams(), clientSessionId: 'room-regression-session',
    socket: undefined, connectionTarget: { mode: 'directory', roomId: null },
    creatingRoom: false, connectionAttemptTimer: null, reconnectTimer: null,
    setTimeout: () => 1, clearTimeout: () => {}, smoothed: new Map(),
    predictedLocal: null, localMove: {}, dashRequested: false, pendingInputs: [], lastMove: '',
    hitEffects: [], state: undefined, myPlayerId: undefined,
    closeActionMenu: () => {}, renderRoomList: () => {}, showFeedback: () => {},
    send: () => {}, getMe: () => null, escapeHtml: s => s
};
for (const name of ['nameInput', 'createRoomButton', 'joinRoomsButton', 'refreshRoomsButton',
    'startButton', 'readyRoomButton', 'leaveRoomButton', 'menu', 'menuStatus', 'hud',
    'roomBrowser', 'roomLobby', 'roomCode', 'roomMembers', 'roomOwner']) context[name] = element();
context.document = { querySelector: () => element() };
vm.createContext(context);
for (const name of ['connect', 'switchConnection', 'enterRoom', 'leaveRoom', 'updateRoomLobby']) {
    vm.runInContext(extract(name), context);
}
// Load the actual listener registrations as well as the state-update functions.
vm.runInContext(source.slice(source.indexOf('function setMenuView('),
    source.indexOf('leaveRoomButton.addEventListener("click", leaveRoom);')
        + 'leaveRoomButton.addEventListener("click", leaveRoom);'.length), context);
assert.match(html, /id="join-rooms"[^>]*disabled/);
assert.match(html, /id="create-room"[^>]*disabled/);
const run = code => vm.runInContext(code, context);
run('connect()');
let directory = context.socket;
directory.open();
assert(context.createRoomButton.disabled && context.joinRoomsButton.disabled);
context.nameInput.value = 'あ'; context.nameInput.fire('input');
assert(!context.createRoomButton.disabled && !context.joinRoomsButton.disabled);
context.nameInput.value = ''; context.nameInput.fire('input');
assert(context.createRoomButton.disabled && context.joinRoomsButton.disabled);
context.nameInput.value = '　 '; context.nameInput.fire('input');
assert(context.createRoomButton.disabled && context.joinRoomsButton.disabled);
context.nameInput.value = 'あ'; context.nameInput.fire('input');
context.joinRoomsButton.click(); assert.equal(context.menu.dataset.view, 'join');
assert.equal(directory.sent.at(-1), 'LIST_ROOMS');
run('setMenuView("home")');
context.createRoomButton.click(); context.createRoomButton.click();
assert.equal(directory.sent.filter(s => s.startsWith('CREATE_ROOM:')).length, 1);
assert.equal(context.menu.dataset.view, 'home', 'wait for success before opening lobby');
assert(context.createRoomButton.disabled && context.joinRoomsButton.disabled);
directory.message({ type: 'error', message: '上限' });
assert(!context.createRoomButton.disabled && !context.joinRoomsButton.disabled);
context.createRoomButton.click();
directory.message({ type: 'room-created', roomId: 'abc123' });
assert.equal(context.connectionTarget.mode, 'room');
assert.equal(context.menu.dataset.view, 'lobby');
assert(context.nameInput.classList.contains('hidden'));
assert.match(context.socket.url, /room=abc123/);
context.socket.open();
context.myPlayerId = 1;
context.snapshot = { phase: 'lobby', roomId: 'abc123', roomOwnerId: 1, allReady: true,
    players: [{ id: 1, name: 'あ', human: true, ready: true }] };
run('updateRoomLobby(snapshot)');
assert.equal(context.roomOwner.textContent, '作成者: あ');
assert(!context.startButton.disabled);
run('leaveRoom()');
assert(!context.nameInput.classList.contains('hidden'));
assert.equal(context.nameInput.value, 'あ');
assert(context.createRoomButton.disabled && context.joinRoomsButton.disabled);
context.socket.open();
assert(!context.createRoomButton.disabled && !context.joinRoomsButton.disabled);
run('enterRoom("other-room")');
assert.equal(context.connectionTarget.roomId, 'other-room');
run('leaveRoom()'); context.socket.open(); context.socket.close();
assert(context.createRoomButton.disabled && context.joinRoomsButton.disabled);
context.nameInput.fire('input');
assert(context.createRoomButton.disabled && context.joinRoomsButton.disabled);
console.log('Room regressions passed: name gating, create/retry, join, lobby, leave, disconnect');
