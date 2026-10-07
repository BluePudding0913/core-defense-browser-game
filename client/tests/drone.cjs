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
const me = { id: 'self', x: 1140, y: 1900, droneRecoveryRange: 45, drone: { active: true, controlled: true, x: 1300, y: 1900, hp: 60, maxHp: 60 } };
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
    distance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y), hasInteractionPath: () => true,
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

// Only the local drone camera ignores blackout; returning restores the body view immediately.
const gradients = [], overlays = [];
context.state.blackoutActive = true;
context.state.trippedBreakers = ['breaker'];
context.state.blackoutBreakerTotal = 1;
context.ctx = {
    createRadialGradient(...args) { gradients.push(args); return { addColorStop() {} }; },
    fillRect(...args) { overlays.push(args); },
};
vm.runInContext(extract('drawBlackout'), context);
vm.runInContext('drawBlackout()', context);
assert.equal(overlays.length, 0, 'piloting drone has no blackout overlay');
me.drone.controlled = false;
vm.runInContext('drawBlackout()', context);
assert.equal(overlays.length, 1, 'switching to the body restores blackout while the drone remains deployed');
assert.equal(gradients[0][0], (context.predictedLocal.x - context.camera.x) + 400);
assert.equal(gradients[0][1], (context.predictedLocal.y - context.camera.y) + 300);
me.drone.active = false;
vm.runInContext('drawBlackout()', context);
assert.equal(overlays.length, 2, 'recall or destruction restores blackout');
me.drone = null;
context.state.players.push({ id: 'ally', drone: { active: true } });
vm.runInContext('drawBlackout()', context);
assert.equal(overlays.length, 3, 'another player piloting does not remove local blackout');
console.log('Drone UI passed: selection, stationary operator, interactions, camera, rendering, relaunch and blackout immunity with restored player vision');
