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
const me = { id: 'self', x: 1140, y: 1900, droneRecoveryRange: 45, drone: { active: true, controlled: true, x: 1300, y: 1900, hp: 45, maxHp: 45 } };
let cameraUsesDrone = false, droneBodies = 0;
const context = vm.createContext({ labRenderer: null, worldYScale: () => 1,
    window: {}, droneAftermath: null, placementSelection: () => null, BREAKER_TERMINALS: [], getMe: () => me, state: { phase: 'wave', players: [me] }, myPlayerId: 'self',
    predictedLocal: { x: 1200, y: 1900, dashing: true }, smoothed: new Map(),
    smoothEntity: (kind, p) => { cameraUsesDrone ||= kind === 'drone'; return p; },
    camera: { x: 1140, y: 1900 }, scale: 1, WORLD: { width: 4000, height: 4000 },
    canvas: { width: 800, height: 600 }, performance: { now: () => 100 },
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    ctx: new Proxy({}, { get: (_, k) => (...args) => { if (k === 'fillRect' && args[2] === 8) droneBodies++; } }),
    drawBar() {},
    distance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y), hasInteractionPath: () => true,
});
for (const name of ['updateLocalPrediction', 'findNearestInteraction', 'canUseNearby', 'reconcileDroneSmoothing', 'droneRecoveryAvailable', 'drawKeyPrompt', 'receiveDroneSelfDestruct', 'droneCameraView', 'drawDrones']) {
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
for (const name of ['drawWorld', 'drawAreas', 'drawBreakers', 'drawPlacementPreview', 'drawCore', 'drawShops', 'drawResources', 'drawDroppedResources', 'drawTrapSlots', 'drawTeleportPads', 'drawArtilleryShells', 'drawProjectiles', 'drawBlackoutEnemyGlow', 'drawRewindScreen', 'drawMissiles', 'drawPoisonGas', 'drawEnemies', 'drawHooks', 'drawRailguns', 'drawPlayers', 'drawInteractionPrompt', 'drawHitEffects', 'drawDamageEdges', 'drawJoystick']) context[name] = () => {};
vm.runInContext(extract('draw'), context);
vm.runInContext(extract('drawHealingAreas'), context);
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
    save() {}, restore() {},
    createRadialGradient(...args) { gradients.push(args); return { addColorStop() {} }; },
    fillRect(...args) { overlays.push(args); },
};
vm.runInContext(extract('drawBlackout'), context);
vm.runInContext('drawBlackout()', context);
assert.equal(overlays.length, 1, 'piloting drone has a full-screen night vision tint');
assert.equal(context.ctx.fillStyle, 'rgba(60, 255, 110, .12)');
assert.equal(gradients.length, 0, 'night vision does not restrict visibility');
me.drone.controlled = false;
vm.runInContext('drawBlackout()', context);
assert.equal(overlays.length, 2, 'switching to the body restores blackout while the drone remains deployed');
assert.equal(gradients[0][0], (context.predictedLocal.x - context.camera.x) + 400);
assert.equal(gradients[0][1], (context.predictedLocal.y - context.camera.y) + 300);
me.drone.active = false;
vm.runInContext('drawBlackout()', context);
assert.equal(overlays.length, 3, 'recall or destruction restores blackout');
me.drone = null;
context.state.players.push({ id: 'ally', drone: { active: true } });
vm.runInContext('drawBlackout()', context);
assert.equal(overlays.length, 4, 'another player piloting does not remove local blackout');
console.log('Drone UI passed: selection, stationary operator, interactions, camera, rendering, relaunch and blackout immunity with restored player vision');

const hints = [];
context.ctx = new Proxy({}, { get: (_, key) => (...args) => { if (key === 'fillText') hints.push(args[0]); } });
context.window.coreKeySettings = { getJobEffect: () => 'v' };
const hidden = { classList: { contains: () => true } };
context.actionMenu = context.inventoryMenu = context.howToMenu = hidden;
context.state = { phase: 'wave', players: [me] };
me.job = 'drone'; me.drone = { active: true, hp: 35, maxHp: 45, x: me.x + 45, y: me.y };
for (const controlled of [false, true]) {
    me.drone.controlled = controlled; hints.length = 0;
    vm.runInContext('drawDrones()', context);
    assert.deepEqual(hints, ['V'], 'Both views show only the configured key, in the shared round prompt');
}
for (const change of [
    () => { me.drone.x = me.x + 46; },
    () => { me.drone.x = me.x + 45; context.hasInteractionPath = () => false; },
    () => { context.hasInteractionPath = () => true; me.down = true; },
    () => { me.down = false; me.job = 'healer'; },
    () => { me.job = 'drone'; me.drone.active = false; },
]) {
    change(); hints.length = 0; vm.runInContext('drawDrones()', context);
    assert.equal(hints.length, 0, 'Unavailable recovery hides its prompt');
}
console.log('Drone recovery hint passed: both views, custom key, distance boundary, walls, down, other jobs and inactive drone');

let now = 100;
context.performance = { now: () => now };
me.job = 'drone'; me.drone = { active: true, controlled: true, hp: 45, x: 1300, y: 1900 };
context.state.phase = 'wave'; context.camera = { x: 1290, y: 1900 };
context.event = { playerId: 'self', piloted: true, x: 1300, y: 1900 };
vm.runInContext('receiveDroneSelfDestruct(event)', context);
me.drone.active = me.drone.controlled = false; me.drone.hp = 0;
now = 1599;
assert.equal(vm.runInContext('droneCameraView().x', context), 1290, 'Holds the last camera frame after the server destroys the drone');
context.ctx = { save() {}, restore() {}, fillRect() {} };
vm.runInContext('drawBlackout()', context);
assert.equal(context.ctx.fillStyle, 'rgba(60, 255, 110, .12)', 'Night vision stays for the held drone view');
now = 1600;
assert.equal(vm.runInContext('droneCameraView()', context), null, 'Returns to the player after 1500ms');
for (const event of [ {playerId:'ally',piloted:true,x:1,y:2}, {playerId:'self',piloted:false,x:1,y:2} ]) {
    context.event = event; vm.runInContext('receiveDroneSelfDestruct(event)', context);
    assert.equal(context.droneAftermath, null, 'Other players and body-view detonation do not move the camera');
}
for (const interrupt of [() => {me.down=true;}, () => {me.job='healer';}, () => {context.state.phase='lost';}, () => {me.drone=null;}]) {
    me.down=false; me.job='drone'; me.drone={hp:0}; context.state.phase='wave';
    context.event={playerId:'self',piloted:true,x:1300,y:1900};
    vm.runInContext('receiveDroneSelfDestruct(event)', context); interrupt();
    assert.equal(vm.runInContext('droneCameraView()', context), null, 'Down, job changes, match end and restart cancel the held view');
}
console.log('Drone aftermath camera passed: 1500ms, night vision, owner-only, body view and interruption');
