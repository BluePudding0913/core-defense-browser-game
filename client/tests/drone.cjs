const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
function extract(name) {
    const start = source.indexOf('function ' + name + '(');
    assert.ok(start >= 0);
    const end = source.indexOf('\nfunction ', start + 1);
    return source.slice(start, end < 0 ? undefined : end);
}
const me = { id: 'self', x: 1140, y: 1900, drone: { active: true, x: 1300, y: 1900, hp: 60, maxHp: 60 } };
let cameraUsesDrone = false, droneBodies = 0;
const context = vm.createContext({
    window: {}, getMe: () => me, state: { phase: 'wave', players: [me] }, myPlayerId: 'self',
    predictedLocal: { x: 1200, y: 1900, dashing: true }, smoothed: new Map(),
    smoothEntity: (kind, p) => { cameraUsesDrone ||= kind === 'drone'; return p; },
    camera: { x: 1140, y: 1900 }, scale: 1, WORLD: { width: 4000, height: 4000 },
    canvas: { width: 800, height: 600 }, performance: { now: () => 100 },
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    ctx: new Proxy({}, { get: (_, k) => (...args) => { if (k === 'fillRect' && args[2] === 8) droneBodies++; } }),
    drawBar() {},
});
for (const name of ['updateLocalPrediction', 'findNearestInteraction', 'canUseNearby', 'reconcileDroneSmoothing', 'drawDrones']) {
    vm.runInContext(extract(name), context);
}
vm.runInContext(fs.readFileSync('client/job-ui.js', 'utf8'), context);
assert.equal(context.window.JobUI.catalog.drone.name, 'Drone Operator');
vm.runInContext('updateLocalPrediction(.1)', context);
assert.equal(context.predictedLocal.x, me.x);
assert.equal(context.predictedLocal.dashing, false);
assert.equal(vm.runInContext('findNearestInteraction()', context), null);
assert.equal(vm.runInContext('canUseNearby({}, 100, false)', context), false);
context.state = { players: [{ id: 'self', drone: null }] };
context.next = { players: [me] };
vm.runInContext('reconcileDroneSmoothing(next)', context);
assert.equal(context.smoothed.get('drone-self').x, 1300);
context.state = { players: [me] };
for (const name of ['drawWorld', 'drawAreas', 'drawBreakers', 'drawPlacementPreview', 'drawCore', 'drawShops', 'drawResources', 'drawDroppedResources', 'drawTrapSlots', 'drawTeleportPads', 'drawArtilleryShells', 'drawEnemies', 'drawRailguns', 'drawPlayers', 'drawInteractionPrompt', 'drawHitEffects', 'drawDamageEdges', 'drawJoystick']) context[name] = () => {};
vm.runInContext(extract('draw'), context);
vm.runInContext('draw()', context);
assert.ok(cameraUsesDrone);
assert.ok(context.camera.x > 1140);
assert.equal(droneBodies, 1);
context.next = { players: [{ ...me, drone: { active: false } }] };
vm.runInContext('reconcileDroneSmoothing(next)', context);
assert.equal(context.smoothed.has('drone-self'), false);
console.log('Drone UI passed: job selection, stationary operator, blocked interactions, camera, rendering and relaunch smoothing');
