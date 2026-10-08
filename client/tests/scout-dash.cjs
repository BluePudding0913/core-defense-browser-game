const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const handlers = {}, commands = [];
const hidden = { classList: { contains: () => true } };
const me = { job: 'scout', stamina: 100, scoutDashStamina: 20, scoutDashSpeed: 800, scoutDashStep: 4 };
const context = vm.createContext({ window: {}, getMe: () => me, state: { phase: 'wave' },
    exitDialog: { open: false }, howToMenu: hidden, inventoryMenu: hidden, actionMenu: hidden,
    canvas: { addEventListener: (name, handler) => handlers[name] = handler, focus() {} },
    worldFromScreen: (x, y) => ({ x, y }), send: command => commands.push(command),
    predictedLocal: { x: 940, y: 1900, stamina: 80, scoutDashRemaining: .2, scoutDashDx: 1, scoutDashDy: 0 },
    canPredictOccupy: () => true,
});
vm.runInContext(fs.readFileSync('client/scout-movement.js', 'utf8'), context);
const start = source.indexOf('function requestScoutDash(');
vm.runInContext(source.slice(start, source.indexOf('canvas.addEventListener("pointerdown",', start)), context);
const rightClick = () => handlers.mousedown({ button: 2, clientX: 1500, clientY: 1900, preventDefault() {} });
rightClick(); assert.equal(commands.at(-1), 'SCOUT_DASH:1500.0:1900.0');
const count = commands.length;
handlers.mousedown({ button: 0 }); assert.equal(commands.length, count, 'left click does not dash');
for (const blocked of [{ job: 'spy' }, { down: true }, { movingCore: true }, { selectedBuild: 'block' },
    { jobCooldown: 1 }, { stamina: 19 }, { railgunCharge: 1 }]) {
    const before = { ...me }; Object.assign(me, blocked); rightClick();
    assert.equal(commands.length, count); Object.keys(me).forEach(key => delete me[key]); Object.assign(me, before);
}
context.state.phase = 'lobby'; rightClick(); assert.equal(commands.length, count); context.state.phase = 'wave';
context.exitDialog.open = true; rightClick(); assert.equal(commands.length, count); context.exitDialog.open = false;
const predictionStart = source.indexOf('function updateLocalPrediction(');
vm.runInContext(source.slice(predictionStart, source.indexOf('\nfunction ', predictionStart + 1)), context);
vm.runInContext('updateLocalPrediction(.05)', context);
assert.equal(context.predictedLocal.x, 980); assert.equal(context.predictedLocal.stamina, 80);
context.canPredictOccupy = x => x < 1000;
vm.runInContext('updateLocalPrediction(.3)', context);
assert.equal(context.predictedLocal.x, 996); assert.equal(context.predictedLocal.scoutDashRemaining, 0);
const advance = context.window.ScoutMovement.advance;
const diagonal = advance({ x: 0, y: 0 }, Math.SQRT1_2, Math.SQRT1_2, 160, 4, () => true);
assert(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 160) < 1e-6);
// Snapshot parameters drive movement immediately on the first authoritative burst update.
context.acknowledgeInputs = () => {}; context.pendingInputs = []; context.localMove = { x: 0, y: 0 };
context.myPlayerId = 'me'; context.predictedLocal = null;
const reconcileStart = source.indexOf('function reconcileLocalPrediction(');
vm.runInContext(source.slice(reconcileStart, source.indexOf('\nfunction ', reconcileStart + 1)), context);
context.snapshot = { phase: 'wave', players: [{ ...me, id: 'me', x: 940, y: 1900,
    scoutDashRemaining: .2, scoutDashDx: 1, scoutDashDy: 0 }] };
vm.runInContext('reconcileLocalPrediction(snapshot)', context);
assert.equal(context.predictedLocal.scoutDashRemaining, .2);
context.canPredictOccupy = () => true; vm.runInContext('updateLocalPrediction(.2)', context);
assert.equal(context.predictedLocal.x, 1100); assert.equal(context.predictedLocal.scoutDashRemaining, 0);
context.dashRequested = false;
context.WORLD = { width: 3000, height: 3000 };
context.clamp = (value, min, max) => Math.max(min, Math.min(max, value));
me.staminaMax = 150; me.staminaRecovery = 40;
context.predictedLocal.stamina = 145;
vm.runInContext('updateLocalPrediction(1)', context);
assert.equal(context.predictedLocal.stamina, 150, 'prediction uses the server stamina capacity above 100');
me.staminaMax = 100;
vm.runInContext('updateLocalPrediction(1)', context);
assert.equal(context.predictedLocal.stamina, 100, 'prediction respects a lower capacity after changing job');
console.log('Scout dash passed: right click, rejection states, snapshot prediction, stamina, collision sweep, normalized range');
