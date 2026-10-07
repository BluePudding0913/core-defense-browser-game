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
const commands = [], buttons = [], lines = [], numbers = [];
let clickHandler;
const grid = { querySelectorAll: () => buttons, append: button => buttons.push(button) };
const section = { classList: { remove() {} }, querySelector: () => grid };
const context = vm.createContext({
    me, getMe: () => me, myPlayerId: 'me', send: c => commands.push(c), performance: { now: () => 50 },
    equipmentOrder: [], BUILD_INFO: { drone: { name: 'DRONE' }, teleporter: { name: 'TP' } },
    WEAPON_FIELDS: {
        pistol: { owned: 'ownsPistol', capacity: 0, droneMountable: true },
        smg: { owned: 'ownsSmg', capacity: 240, droneMountable: true },
        rocket: { owned: 'ownsRocket', capacity: 8, droneMountable: false },
    },
    WeaponUI: require('../weapon-ui.js'), inventorySuppressClickUntil: 0,
    inventoryItems: { querySelector: () => section, addEventListener: (_, fn) => { clickHandler = fn; } },
    document: { createElement: () => ({ dataset: {}, classList: { toggle() {} },
        remove() { buttons.splice(buttons.indexOf(this), 1); } }) },
    state: { phase: 'wave', players: [me] },
    distance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y), hasInteractionPath: () => true,
    hitEffects: [], ctx: { save() {}, restore() {}, beginPath() {}, stroke() {},
        moveTo(x, y) { lines.push([x, y]); }, lineTo(x, y) { lines.push([x, y]); },
        fillText(text) { numbers.push(text); } },
});
for (const name of ['equipmentEntries', 'placementSelection', 'placeSelectedInFront', 'findNearestInteraction', 'updateDroneLoadout', 'drawHitEffects'])
    vm.runInContext(extract(name), context);
const run = code => vm.runInContext(code, context);
assert.ok(run('equipmentEntries(me)').some(e => e.key === 'build:drone'));
assert.equal(run('placementSelection(me)'), null, 'drone does not draw a building tile preview');
assert.equal(run('placeSelectedInFront()'), true);
assert.equal(commands.pop(), 'PLACE_FRONT', 'R uses same item command as TP');
run('updateDroneLoadout(me)');
assert.deepEqual(buttons.map(b => b.dataset.mount), ['pistol', 'smg']);
const clickStart = source.indexOf('inventoryItems.addEventListener("click",');
vm.runInContext(source.slice(clickStart, source.indexOf('\nfunction resourceInventoryCard', clickStart)), context);
clickHandler({ target: { closest: () => buttons[1] } });
assert.equal(commands.pop(), 'DRONE_MOUNT:smg');
me.drone = { active: true, controlled: true, weapon: 'smg', x: 200, y: 100 };
me.selectedBuild = null; me.buildItems.drone = 0;
assert.ok(!run('equipmentEntries(me)').some(e => e.key === 'build:drone'));
run('updateDroneLoadout(me)'); assert.ok(buttons.every(b => b.disabled));
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
assert.ok(numbers.includes('18'), 'impact damage number is visible');
assert.equal(context.ctx.strokeStyle, '#ff5964');
console.log('Drone loadout UI passed: inventory, R launch, owned mountable weapons, flight locking, nearby recovery, trajectory and damage');
