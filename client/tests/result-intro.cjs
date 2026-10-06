const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
function extract(name) {
    const start = source.indexOf(`function ${name}(`);
    return source.slice(start, source.indexOf('\nfunction ', start + 1));
}
const classes = new Set();
let starts = 0, timer, timerDelay, now = 0;
const context = vm.createContext({
    roundIntro: { textContent: '', offsetWidth: 1, classList: {
        remove: name => classes.delete(name),
        add: name => { classes.add(name); starts++; }
    } },
    setTimeout: (fn, delay) => { timerDelay = delay; timer = fn; return 1; },
    clearTimeout: () => { timer = null; },
    performance: { now: () => now },
    applyRules() {}, keepEndArea: () => now < 10000,
    window: {}, reconcileEnemySmoothing() {}, getMe: () => ({}), endInteractionHold() {},
    CORE: {}, reconcileLocalPrediction() {}, receiveLog() {}, updateHud() {},
    updateWorkbenchMaterials() {}, updateRoomLobby() {}, closeActionMenu() {},
    menu: { classList: { add() {}, remove() {} } },
    hud: { classList: { add() {}, remove() {}, toggle() {} } },
    inventoryMenu: { classList: { add() {} } }
});
vm.runInContext('let roundIntroTimer, previousPhase, previousRound, lastCoreHp, state; let activeMenuAccess = null;'
    + ['showRoundIntro', 'showScreenIntro', 'hideScreenIntro', 'receiveState'].map(extract).join('\n'), context);
function receive(phase, round = 5) {
    context.next = { phase, round, core: { hp: 100, x: 0, y: 0 } };
    vm.runInContext('receiveState(next)', context);
}
receive('wave');
assert.equal(context.roundIntro.textContent, 'ROUND 5');
assert.equal(timerDelay, 2400);
receive('wave');
assert.equal(starts, 1);
for (const [phase, text] of [['won', '防衛成功'], ['lost', '防衛失敗']]) {
    receive('preparing');
    assert(!classes.has('show'));
    receive('wave');
    receive(phase);
    assert(!classes.has('show'), 'result must wait after the match ends');
    assert.equal(timerDelay, 2000);
    const pending = timer, waitingStarts = starts;
    receive(phase);
    assert.equal(timer, pending, 'repeated snapshots must not restart the wait');
    assert.equal(starts, waitingStarts);
    pending();
    assert.equal(context.roundIntro.textContent, text);
    assert(classes.has('show'));
    assert.equal(timerDelay, 2400);
    const before = starts, scheduled = timer;
    receive(phase);
    assert.equal(starts, before, 'repeated snapshots must not replay the result');
    assert.equal(timer, scheduled, 'repeated snapshots must not reset the timer');
    scheduled();
    assert(!classes.has('show'));
    now = 10000;
    receive(phase);
    assert.equal(starts, before, 'returning to the menu must not replay the result');
    now = 0;
    receive('preparing');
    receive('wave');
    receive(phase);
    assert.equal(starts, before + 1, 'another match must wait before showing its result');
    timer();
    assert.equal(starts, before + 2, 'another match must show its round and result');
    receive('lobby');
    assert(!classes.has('show'));
    assert.equal(timer, null);
    receive('wave');
    receive(phase);
    receive('preparing');
    assert.equal(timer, null, 'restarting during the wait must cancel the result');
    assert(!classes.has('show'));
    receive('wave');
    receive(phase);
    receive('lobby');
    assert.equal(timer, null, 'leaving during the wait must cancel the result');
}
console.log('Result intro passed: rounds, delayed win/loss, repeated snapshots, expiry, replay and cancellation');
