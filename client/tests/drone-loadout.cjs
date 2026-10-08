const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const extract = name => {
    const start = source.indexOf(`function ${name}(`);
    return source.slice(start, source.indexOf('\nfunction ', start + 1));
};
const me = { id: 'me', job: 'drone', x: 100, y: 100, buildItems: {}, ownsPistol: true, ownsSmg: true, ownsRocket: true };
const commands = [], menus = [];

const hidden = { classList: { contains: () => true, add() {} } };
const context = vm.createContext({
    MISSILE_COMPUTER: null, JOB_STATION: null, getMe: () => me, myPlayerId: 'me',
    send: c => commands.push(c), equipmentOrder: [], BUILD_INFO: {teleporter: {name: 'TP'}},
    WEAPON_FIELDS: {
        pistol: { owned: 'ownsPistol', capacity: 0, droneMountable: true },
        smg: { owned: 'ownsSmg', capacity: 240, droneMountable: true },
        rocket: { owned: 'ownsRocket', capacity: 8, droneMountable: false },
    }, WeaponUI: require('../weapon-ui.js'),
    openNearbyActionMenu: (title, options, target, range, layout, refresh) => menus.push({title, options, refresh}),
    closeActionMenu() {}, actionMenu: hidden, inventoryMenu: hidden, howToMenu: hidden,
    interactionHold: null,

    state: { phase: 'wave', players: [me], slots: [], areas: {}, core: {x: 1000, y: 1000} },
    SHOP_UNITS: [], WORKBENCHES: [], PREP_CONSOLE: null, BREAKER_TERMINALS: [], AREAS: [],
    INTERACTION_RANGE: {core: 70, workbench: 70, breaker: 95}, openCoreMenu() {},
    distance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y), hasInteractionPath: () => true,
});
for (const name of ['equipmentEntries', 'placementSelection', 'placeSelectedInFront', 'findNearestInteraction',
        'openDroneLaunch', 'toggleNearestInteraction', 'useNearestInteraction', 'useJobAbility'])
    vm.runInContext(extract(name), context);
const run = code => vm.runInContext(code, context);
assert.ok(!run('equipmentEntries(getMe())').some(e => ['drone', 'controller'].includes(e.value)));
assert.equal(run('placementSelection(getMe())'), null);
assert.equal(run('placeSelectedInFront()'), false);
run('useJobAbility()'); assert.equal(menus.length, 1);

assert.equal(commands.length, 0);
assert.deepEqual(Array.from(menus.at(-1).options, option => option.command),
    ['DRONE_LAUNCH:pistol', 'DRONE_LAUNCH:smg', 'DRONE_LAUNCH:none']);
me.drone = {active: false, hp: 0}; me.droneRepairOre = 5; me.droneRepairCopper = 2;
me.ore = 0; me.copper = 0;
run('openDroneLaunch()'); assert.ok(menus.at(-1).options.every(option => option.disabled));
me.ore = 5; me.copper = 2; menus.at(-1).refresh(); assert.ok(menus.at(-1).options.every(option => !option.disabled));
me.drone = {active: true, controlled: true, weapon: 'smg', x: 200, y: 100};
assert.ok(!run('equipmentEntries(getMe())').some(e => e.value === 'smg'));
run('useJobAbility()'); assert.equal(commands.pop(), 'JOB_ABILITY');
me.drone.controlled = false;
context.WORKBENCHES = [{x: 110, y: 100}]; context.openWorkbenchMenu = () => commands.push('CRAFT');
assert.equal(run('findNearestInteraction().kind'), 'craft');
run('toggleNearestInteraction()'); assert.equal(commands.pop(), 'CRAFT');
me.drone.controlled = true;
assert.equal(run('findNearestInteraction()'), null, 'R does not toggle drone view or use ordinary facilities');
context.BREAKER_TERMINALS = [{id: 'breaker', x: 230, y: 100, requiredArea: 'room'}];
context.state.blackoutActive = true; context.state.trippedBreakers = ['breaker']; context.state.areas.room = true;
assert.equal(run('findNearestInteraction().kind'), 'breaker');
run('toggleNearestInteraction()'); assert.equal(commands.pop(), 'BREAKER:breaker');
context.hasInteractionPath = () => false; assert.equal(run('findNearestInteraction()'), null);
context.hasInteractionPath = () => true; context.state.areas.room = false;
assert.equal(run('findNearestInteraction()'), null, 'locked breakers remain inaccessible');
me.drone.active = me.drone.controlled = false;
assert.ok(run('equipmentEntries(getMe())').some(e => e.value === 'smg'));
for (const job of ['healer', 'spy', 'tp']) {
    me.job = job; run('useJobAbility()'); assert.equal(commands.pop(), 'JOB_ABILITY');
}
me.job = 'tank'; run('useJobAbility()'); assert.equal(commands.length, 0);
context.exitDialog = {open:false};
const wallSource = extract('requestTankWall');
vm.runInContext(wallSource.slice(0, wallSource.indexOf('\n}') + 2), context);
run('requestTankWall()'); assert.equal(commands.pop(), 'TANK_WALL');
run('requestTankWall({x:120,y:240})'); assert.equal(commands.pop(), 'TANK_WALL:120.0:240.0');
me.jobCooldown = 1; run('requestTankWall()'); assert.equal(commands.length, 0);
me.jobCooldown = 0;
me.down = true; run('useJobAbility()'); assert.equal(commands.length, 0);
me.down = false; me.job = 'tp'; me.buildItems.teleporter = 2;
assert(run('equipmentEntries(getMe())').some(entry => entry.value === 'teleporter'));
console.log('Job controls passed: single press, launch, repair, abilities and drone breaker interaction');
