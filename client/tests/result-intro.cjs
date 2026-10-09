const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const formatTime = require('../match-time.js');
assert.equal(formatTime(59.9), '0:59');
assert.equal(formatTime(60), '1:00');
assert.equal(formatTime(3661), '1:01:01');
assert.equal(formatTime(undefined), '0:00');
function extract(name) {
    const start = source.indexOf(`function ${name}(`);
    return source.slice(start, source.indexOf('\nfunction ', start + 1));
}
const classes = new Set();
let starts = 0, timer, timerDelay, now = 0;
const sounds = [];
const context = vm.createContext({
    formatMatchTime: require('../match-time.js'),
    roundIntro: { textContent: '', dataset: {}, offsetWidth: 1, classList: {
        remove: name => classes.delete(name),
        add: name => { classes.add(name); starts++; }
    } },
    setTimeout: (fn, delay) => { timerDelay = delay; timer = fn; return 1; },
    clearTimeout: () => { timer = null; },
    performance: { now: () => now },
    applyRules() {}, keepEndArea: () => now < 10000,
    window: {coreAudio:{play:name=>sounds.push(name)}}, reconcileEnemySmoothing() {}, reconcileDroneSmoothing() {}, getMe: () => ({}), endInteractionHold() {}, endJobHold() {},
    CORE: {}, reconcileLocalPrediction() {}, receiveLog() {}, updateHud() {},
    updateWorkbenchMaterials() {}, updateRoomLobby() {}, closeActionMenu() {},
    menu: { classList: { add() {}, remove() {} } },
    hud: { classList: { add() {}, remove() {}, toggle() {} } },
    inventoryMenu: { classList: { add() {} } }
});
vm.runInContext('let roundIntroTimer, previousPhase, previousRound, lastCoreHp, state; let activeMenuAccess = null;'
    + ['showRoundIntro', 'showScreenIntro', 'hideScreenIntro', 'receiveState'].map(extract).join('\n'), context);
function receive(phase, round = 5, extra = {}) {
    context.next = { phase, round, elapsedSeconds: 125, players: [], core: { hp: 100, x: 0, y: 0 }, ...extra };
    vm.runInContext('receiveState(next)', context);
}
receive('wave');
assert.equal(context.roundIntro.textContent, 'ROUND 5');
assert.equal(timerDelay, 2400);
receive('wave');
assert.equal(starts, 1);
assert.deepEqual(sounds, ['round-start']);
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
    assert.equal(context.roundIntro.dataset.detail, 'TIME 2:05');
    assert(classes.has('show'));
    assert.equal(context.roundIntro.dataset.result, phase);
    const before = starts, scheduled = timer;
    receive(phase);
    assert.equal(starts, before, 'repeated snapshots must not replay the result');
    assert.equal(timer, scheduled, 'repeated snapshots must not reset the timer');
    now = 9000; receive(phase);
    assert(classes.has('show'), 'Result remains visible until the scene changes');
    now = 10000;
    receive(phase);
    assert(!classes.has('show'), 'Result clears when the menu replaces the game');
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
const fadeClasses = new Set(), tasks = [];
let changedUnderFade = false;
const fade = vm.createContext({
    screenFade: {classList:{add:name=>fadeClasses.add(name),remove:name=>fadeClasses.delete(name)}},
    state:{phase:'lost'}, setTimeout:(fn,delay)=>{ tasks.push({fn,delay}); return tasks.length; }, clearTimeout(){},
    receiveState:()=>{ changedUnderFade=fadeClasses.has('show'); },
});
vm.runInContext('let endAreaPhase=null,endAreaVisible=false,endAreaTimer;' + extract('keepEndArea'), fade);
assert.equal(vm.runInContext('keepEndArea(state)', fade), true);
assert.equal(tasks[0].delay, 10000); tasks[0].fn();
assert(fadeClasses.has('show')); assert.equal(tasks[1].delay,350);
assert.equal(vm.runInContext('keepEndArea(state)', fade), true, 'Snapshots during fade keep the original scene');
tasks[1].fn(); assert(changedUnderFade, 'Menu changes underneath the opaque fade');
assert.equal(vm.runInContext('keepEndArea(state)', fade), false);
assert(!fadeClasses.has('show'), 'New scene fades in after the switch');
vm.runInContext('keepEndArea({phase:"preparing"})', fade);
assert(!fadeClasses.has('show'));
console.log('Result intro passed: persistent result, result color, delayed display, replay, cancellation and coordinated scene fade');

now = 0; receive("wave");
receive("lost", 5, { rewindDelayRemaining: 1.5, rewindRemaining: 0 });
assert(!classes.has("show"), "backup pause does not show a defeat banner");
assert.notEqual(context.roundIntro.textContent, "防衛失敗");
receive("lost", 5, { rewindDelayRemaining: .5, rewindRemaining: 0 });
assert(!classes.has("show"), "defeat stays hidden throughout the pause");
receive("lost", 5, { rewindDelayRemaining: 0, rewindRemaining: 6 });
assert(!classes.has("show"), "restore effect replaces defeat only after the pause");
