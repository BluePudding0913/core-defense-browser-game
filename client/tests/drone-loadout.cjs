const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const extract = name => {
    const start = source.indexOf(`function ${name}(`);
    return source.slice(start, source.indexOf('\nfunction ', start + 1));
};
const me = { id: 'me', job: 'drone', x: 100, y: 100, selectedBuild: 'drone', buildItems: { drone: 1 },
    ownsPistol: true, ownsSmg: true, ownsRocket: true, droneRecoveryRange: 45 };
const commands = [], lines = [], numbers = [], menus = [];
const context = vm.createContext({
    MISSILE_COMPUTER: null, JOB_STATION: null,
    me, getMe: () => me, myPlayerId: 'me', send: c => commands.push(c), performance: { now: () => 50 },
    equipmentOrder: [], BUILD_INFO: { drone: { name: 'DRONE' }, teleporter: { name: 'TP' } },
    WEAPON_FIELDS: {
        pistol: { owned: 'ownsPistol', capacity: 0, droneMountable: true },
        smg: { owned: 'ownsSmg', capacity: 240, droneMountable: true },
        rocket: { owned: 'ownsRocket', capacity: 8, droneMountable: false },
    },
    WeaponUI: require('../weapon-ui.js'),
    openNearbyActionMenu: (title, options, target, range, layout, refresh) => menus.push({title, options, refresh}),
    closeActionMenu() {}, actionMenu: { classList: { contains: () => true } },
    inventoryMenu: { classList: { add() {} } },
    state: { phase: 'wave', players: [me] },
    distance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y), hasInteractionPath: () => true,
    hitEffects: [], ctx: { save() {}, restore() {}, beginPath() {}, stroke() {},
        moveTo(x, y) { lines.push([x, y]); }, lineTo(x, y) { lines.push([x, y]); },
        fillText(text) { numbers.push(text); } },
});
for (const name of ['equipmentEntries', 'placementSelection', 'placeSelectedInFront', 'findNearestInteraction', 'openDroneLaunch', 'toggleNearestInteraction', 'useNearestInteraction', 'drawHitEffects'])
    vm.runInContext(extract(name), context);
const run = code => vm.runInContext(code, context);
assert.ok(run('equipmentEntries(me)').some(e => e.key === 'build:drone'));
assert.equal(run('placementSelection(me)'), null, 'drone does not draw a building tile preview');
assert.equal(run('placeSelectedInFront()'), true);
assert.equal(commands.length, 0, 'R opens the preflight picker without launching');
assert.deepEqual(Array.from(menus.at(-1).options, option => option.command), ['DRONE_LAUNCH:pistol', 'DRONE_LAUNCH:smg', 'DRONE_LAUNCH:none']);
assert.equal(menus.at(-1).title, 'DRONE');
me.drone = { active: false, hp: 0 }; me.droneRepairOre = 5; me.droneRepairCopper = 2;
me.ore = 0; me.copper = 0;
run('openDroneLaunch()'); assert.ok(menus.at(-1).options.every(option => option.disabled));
me.ore = 5; me.copper = 2;
menus.at(-1).refresh(); assert.ok(menus.at(-1).options.every(option => !option.disabled));
let facilityUsed = 0;
const realInteraction = context.findNearestInteraction;
context.findNearestInteraction = () => ({ kind: 'workbench', action: () => facilityUsed++ });
const menuCount = menus.length;
run('toggleNearestInteraction()'); assert.equal(facilityUsed, 1);
assert.equal(menus.length, menuCount, 'broken selected drone does not intercept workbench R');
context.findNearestInteraction = () => null;
run('toggleNearestInteraction()'); assert.equal(menus.length, menuCount + 1, 'away from facilities R opens repair preflight');
context.findNearestInteraction = realInteraction;
me.drone = { active: true, controlled: true, weapon: 'smg', x: 200, y: 100 };
me.selectedBuild = null; me.buildItems.drone = 0;
assert.ok(!run('equipmentEntries(me)').some(e => e.key === 'build:drone'));
assert.ok(!run('equipmentEntries(me)').some(e => e.key === 'weapon:smg'), 'mounted gun is unavailable in player equipment');
me.drone.controlled = false;
assert.ok(!run('equipmentEntries(me)').some(e => e.key === 'weapon:smg'), 'switching views does not release the gun');
me.drone.active = false;
assert.ok(run('equipmentEntries(me)').some(e => e.key === 'weapon:smg'), 'recovery returns the gun to player equipment');
me.drone.active = me.drone.controlled = true;
assert.equal(run('findNearestInteraction()'), null, 'no remote recovery');
me.drone.x = 145;
run('findNearestInteraction().action()'); assert.equal(commands.pop(), 'DRONE_RECOVER');
context.hasInteractionPath = () => false;
assert.equal(run('findNearestInteraction()'), null, 'wall blocks recovery');
context.hitEffects = [
    { effect: 'hit', playerId: 'me', weapon: 'smg', damage: 0, fromX: 200, fromY: 100, x: 240, y: 100, started: 0 },
    { effect: 'hit', playerId: 'me', weapon: 'smg', damage: 18, enemyId: 1, x: 260, y: 100, started: 0 },
];
run('drawHitEffects()');
assert.deepEqual(lines, [[200, 100], [240, 100]], 'mounted gun produces a visible trajectory from the drone');
assert.deepEqual(numbers, [], 'damage quantities stay hidden as in the original game');
assert.equal(context.ctx.strokeStyle, '#ff5964');
assert.ok(!source.includes('drone-loadout'), 'mount selection is no longer in inventory');
context.worldFromScreen = (x, y) => ({x, y}); context.firingPointer = null;
for (const name of ['startFiring', 'updateFiringAim', 'fireOnce']) vm.runInContext(extract(name), context);
me.selectedBuild = 'drone'; commands.length = 0;
run('startFiring(1, 200, 100); fireOnce(200, 100)');
assert.equal(commands.length, 0, 'mouse and touch cannot shoot the previous weapon while drone is selected');
context.firingPointer = {id: 1}; run('updateFiringAim(200, 100)');
assert.equal(context.firingPointer, null); assert.equal(commands.length, 0);
me.selectedBuild = null;
run('startFiring(2, 200, 100)'); assert.equal(commands.pop(), 'FIRE:200.0:100.0:1', 'piloting still allows drone fire');
Object.assign(context, {
    SHOP_UNITS: [], WORKBENCHES: [{x: 110, y: 100}], PREP_CONSOLE: null, BREAKER_TERMINALS: [], AREAS: [],
    INTERACTION_RANGE: {workbench: 70, core: 70}, hasInteractionPath: () => true,
    openWorkbenchMenu: () => commands.push('WORKBENCH'),
    openCoreMenu() {},
});
context.state.slots = []; context.state.areas = {}; context.state.core = {x: 1000, y: 1000};
me.drone.controlled = false;
assert.equal(run('findNearestInteraction().kind'), 'drone', 'nearby drone recovery wins over facilities');
run('toggleNearestInteraction()'); assert.equal(commands.pop(), 'DRONE_RECOVER');
me.drone.x = 200;
assert.equal(run('findNearestInteraction().kind'), 'craft', 'facility wins over remote drone view switching');
run('toggleNearestInteraction()'); assert.equal(commands.pop(), 'WORKBENCH');
me.drone.controlled = true;
assert.equal(run('findNearestInteraction()'), null, 'remote piloting still uses drone controls');
run('toggleNearestInteraction()'); assert.equal(commands.pop(), 'JOB_ABILITY');
me.drone.active = me.drone.controlled = false; me.drone.hp = 45;
me.selectedBuild = 'drone'; me.buildItems.drone = 1;
run('toggleNearestInteraction()'); assert.equal(commands.pop(), 'WORKBENCH', 'healthy drone item does not intercept facilities either');
console.log('Drone loadout UI passed: preflight selection, repair affordability, facility priority, nearby recovery, trajectory without damage quantities');
