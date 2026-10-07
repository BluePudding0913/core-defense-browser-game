const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const WeaponUI = require('../weapon-ui.js');
const source = fs.readFileSync('client/app.js', 'utf8');
let saved = '[]';
const me = { ownsShotgun: true, buildItems: { block: 2 } };
const context = vm.createContext({ WeaponUI, WEAPON_FIELDS: { bat: { capacity: 0 }, pistol: { capacity: 0 }, shotgun: { capacity: 50, owned: "ownsShotgun" }, lmg: { capacity: 600, owned: "ownsLmg" } }, equipmentOrder: [], BUILD_INFO: { block: { name: 'BLOCK' } },
    getMe: () => me, me, localStorage: { getItem: () => saved, setItem: (_, value) => { saved = value; } } });
for (const name of ['loadEquipmentOrder', 'reorderEquipment', 'equipmentEntries']) {
    const start = source.indexOf(`function ${name}(`);
    const end = source.indexOf('\nfunction ', start + 1);
    vm.runInContext(source.slice(start, end), context);
}
const run = code => vm.runInContext(code, context);
const order = () => JSON.parse(run('JSON.stringify(equipmentEntries(me).map(e => e.key))'));
assert(run('reorderEquipment("build:block", "weapon:bat")'));
assert.deepEqual(order(), ['build:block', 'weapon:bat', 'weapon:pistol', 'weapon:shotgun']);
assert(run('reorderEquipment("weapon:bat", "weapon:shotgun")'));
assert.deepEqual(order(), ['build:block', 'weapon:pistol', 'weapon:shotgun', 'weapon:bat']);
assert(!run('reorderEquipment("absent", "weapon:bat")'));
assert(!run('reorderEquipment("weapon:bat", "weapon:bat")'));
me.buildItems.block = 0;
assert.equal(order()[0], 'weapon:pistol');
me.buildItems.block = 1;
assert.equal(order()[0], 'build:block', 'reacquired equipment keeps its place');
me.ownsLmg = true;
assert.equal(order().at(-1), 'weapon:lmg', 'new equipment is appended');
run('equipmentOrder = loadEquipmentOrder()');
assert.equal(order()[0], 'build:block', 'order survives reload');
saved = 'not json';
assert.equal(run('loadEquipmentOrder().length'), 0);
saved = '["weapon:bat","weapon:bat",null]';
assert.equal(run('loadEquipmentOrder().length'), 1);
console.log('Inventory ordering passed: both directions, persistence, new and reacquired items, invalid drops');
