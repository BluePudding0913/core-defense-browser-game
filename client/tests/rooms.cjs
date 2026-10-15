const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const html = fs.readFileSync('client/index.html', 'utf8');
assert.equal((html.match(/id="job-select"/g) || []).length, 1, 'job choices exist only inside the expandable panel');
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
    close(code, reason) { this.closeCode = code; this.closeReason = reason; this.readyState = 3; this.handlers.close?.({ code }); }
    message(message) { this.handlers.message({ data: JSON.stringify(message) }); }
}
const context = {
    keys: new Set(['w']), joystick: {}, dashKey: true, pendingMove: null, firingPointer: {},
    closeHowTo: () => {}, inventoryMenu: element(), keepEndArea: () => false,
    roundIntro: element(), roundIntroTimer: null, previousPhase: 'lost', previousRound: 5,
    WebSocket: Socket, URLSearchParams, console,
    window: { location: { hostname: 'localhost', protocol: 'http:' } },
    URL_PARAMETERS: new URLSearchParams(), clientSessionId: 'room-regression-session',
    socket: undefined, connectionTarget: { mode: 'directory', roomId: null },
    creatingRoom: false, connectionAttemptTimer: null, reconnectTimer: null,
    setTimeout: () => 1, clearTimeout: () => {}, smoothed: new Map(),
    predictedLocal: null, localMove: {}, dashRequested: false, pendingInputs: [], lastMove: '',
    hitEffects: [], state: undefined, myPlayerId: undefined,
    closeActionMenu: () => {}, endInteractionHold: () => {}, endJobHold: () => {}, renderRoomList: () => {}, showFeedback: () => {},
    send: () => {}, getMe: () => null, escapeHtml: s => s
};
for (const name of ['nameInput', 'createRoomButton', 'joinRoomsButton', 'refreshRoomsButton',
    'startButton', 'readyRoomButton', 'leaveRoomButton', 'menu', 'menuStatus', 'hud',
    'roomBrowser', 'roomLobby', 'roomCode', 'roomMembers', 'roomOwner', 'jobSelect', 'jobToggle']) context[name] = element();
context.document = { querySelector: () => element() };
context.window.JobUI = { render: () => "" };
context.requestJobChange = () => {};
context.jobSelect.querySelector = () => element();
context.JOBS = { healer: { name: "ヒーラー", detail: "蘇生 2秒" }, scout: { name: "スカウト", detail: "ダッシュ UP" } };
vm.createContext(context);
for (const name of ['connect', 'switchConnection', 'enterRoom', 'leaveRoom', 'updateRoomLobby', 'hideScreenIntro']) {
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
    players: [{ id: 1, name: 'あ', human: true, ready: false }] };
run('updateRoomLobby(snapshot)');
assert.equal(context.roomOwner.textContent, '作成者: あ');
assert(!context.startButton.disabled);
assert(context.readyRoomButton.classList.contains('hidden'));
assert(context.readyRoomButton.disabled);
assert.match(context.roomMembers.innerHTML, /room-member ready/);
assert(!context.roomMembers.innerHTML.includes('準備完了'));
assert(!context.roomMembers.innerHTML.includes('準備中'));
context.snapshot.players.push({ id: 2, name: 'い', human: true, ready: false });
context.snapshot.allReady = false;
run('updateRoomLobby(snapshot)');
assert(context.startButton.disabled, 'the owner must wait for guests');
context.myPlayerId = 2;
run('updateRoomLobby(snapshot)');
assert(!context.readyRoomButton.classList.contains('hidden'));
assert(!context.readyRoomButton.disabled);
assert.equal(context.readyRoomButton.textContent, '準備OK');
assert.match(context.roomMembers.innerHTML, /room-member ready[\s\S]*あ <small>Healer<\/small><\/strong>\s*<span>host<\/span>[\s\S]*?<\/div>/);
assert.equal((context.roomMembers.innerHTML.match(/<span>/g) || []).length, 2,
    'host and guest each have a status label, including when viewed by a guest');
assert(context.roomMembers.innerHTML.includes('準備中'));
context.snapshot.players[1].ready = true;
context.snapshot.allReady = true;
run('updateRoomLobby(snapshot)');
assert.equal(context.readyRoomButton.textContent, '取り消す');
assert.equal((context.roomMembers.innerHTML.match(/準備完了/g) || []).length, 1);
context.myPlayerId = 1;
run('updateRoomLobby(snapshot)');
assert(!context.startButton.disabled);
assert(context.readyRoomButton.classList.contains('hidden'));
context.roundIntro.classList.add('show');
const leavingSocket = context.socket;
run('leaveRoom()');
assert.equal(leavingSocket.closeCode, 1000);
assert.equal(leavingSocket.closeReason, 'leave-room', 'explicit exits release the reconnect reservation');
assert(!context.roundIntro.classList.contains('show'));
assert.equal(context.previousPhase, undefined);
assert.equal(context.previousRound, undefined);
assert.equal(context.keys.size, 0);
assert.equal(context.joystick, null);
assert.equal(context.firingPointer, null);
assert.equal(context.dashKey, false);
assert(context.inventoryMenu.classList.contains('hidden'));
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

let savedRoom = { sessionId: 'persistent-session-123', roomId: 'return-room', phrase: '友達', name: 'Returning' };
context.window.coreReconnect = {
    saved: () => savedRoom, adopt: id => id, newSession: () => 'independent-session-123',
    remember: (sessionId, roomId, phrase, name) => { savedRoom = { sessionId, roomId, phrase, name }; },
    forget: (id, room) => { if (savedRoom?.sessionId === id && savedRoom.roomId === room) savedRoom = null; }
};
const statuses = [];
context.window.coreMenu = { phrase: '', refreshResume() {}, connected() {}, disconnected() {}, rejected() {}, exited() {}, status: text => statuses.push(text) };
context.acknowledgeInputs = () => {};
context.lastAcknowledgedInput = 5;
context.nextInputSequence = 1;
context.sendMovement = () => {};
vm.runInContext(source.slice(source.indexOf('window.coreGame = {'), source.indexOf('\ninitialize();')), context);
context.window.coreGame.resume();
const resumed = context.socket;
const resumeUrl = new URL(resumed.url);
assert.equal(resumeUrl.searchParams.get('session'), 'persistent-session-123');
assert.equal(resumeUrl.searchParams.get('phrase'), '友達');
assert.equal(resumeUrl.searchParams.get('resume'), '1');
assert.equal(context.nameInput.value, 'Returning');
resumed.open();
resumed.message({ type: 'welcome', playerId: 'player-1', roomId: 'return-room', ackInput: 5 });
assert.equal(savedRoom.sessionId, 'persistent-session-123');
assert.equal(context.nextInputSequence, 6, 'resume continues the authoritative input sequence');
resumed.close(4000, 'reconnected');
assert.equal(context.connectionTarget.mode, 'directory');
assert.match(context.socket.url, /session=independent-session-123/);
assert.equal(savedRoom.sessionId, 'persistent-session-123', 'replacement preserves the active tab resume record');
assert.match(statuses.at(-1), /別のタブ/);
context.window.coreGame.resume();
context.socket.open();
context.socket.message({ type: 'error', message: '復帰期限が切れました' });
assert.equal(savedRoom, null);
assert.equal(context.connectionTarget.mode, 'directory');
assert.equal(statuses.at(-1), '復帰期限が切れました');
console.log('Resume transport passed: saved identity/phrase, input sequence, replacement, rejected resume cleanup');
let received;
context.receiveState = next => { received = next; };
assert.match(context.socket.url, /rules=once/);
context.socket.message({type:'rules',rules:{weapons:{pistol:{damage:10}},recipes:{},shop:{ammo:120}}});
context.socket.message({type:'state',rules:{coreCosts:{hp:300}}});
assert.equal(received.rules.weapons.pistol.damage,10);
assert.equal(received.rules.coreCosts.hp,300);
context.socket.message({type:'state',rules:{coreCosts:{hp:600}}});
assert.equal(received.rules.weapons.pistol.damage,10);
assert.equal(received.rules.coreCosts.hp,600,'Dynamic prices keep updating');
const oldSocket=context.socket;
run('connect()');
context.socket.message({type:'state',rules:{weapons:{pistol:{damage:20}}}});
assert.equal(received.rules.weapons.pistol.damage,20,'Legacy full snapshots remain accepted');
context.socket.message({type:'state',rules:{coreCosts:{hp:900}}});
assert.equal(received.rules.weapons,undefined,'New sockets never reuse old definitions');
oldSocket.message({type:'rules',rules:{weapons:{pistol:{damage:99}}}});
context.socket.message({type:'rules',rules:{weapons:{pistol:{damage:30}}}});
context.socket.message({type:'state',rules:{coreCosts:{hp:900}}});
assert.equal(received.rules.weapons.pistol.damage,30,'Reconnect uses fresh socket definitions');
console.log('Rule transport passed: once per connection, dynamic prices, legacy full state, reconnect isolation');
