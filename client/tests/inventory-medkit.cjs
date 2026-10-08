const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const commands = [];
const me = { hp: 40, medkits: 3, down: false };
const use = { dataset: { use: 'medkit' } };
const one = { dataset: { dropItem: 'medkit', amount: '1' } };
const all = { dataset: { dropItem: 'medkit', amount: 'all' } };
const count = {}, health = {};
const card = { querySelector: () => count, querySelectorAll: () => [use, one, all] };
const grid = { querySelectorAll: () => [] };
let click;
const inventoryItems = {
    querySelector: selector => selector === '.equipment-grid' ? grid
        : selector === '.drone-loadout' ? null
        : selector === '.inventory-health' ? health : card,
    addEventListener: (_, callback) => { click = callback; },
};
const context = vm.createContext({ inventoryItems, getMe: () => me,
    equipmentEntries: () => [], RESOURCE_NAMES: {}, inventorySuppressClickUntil: 0,
    performance: { now: () => 100 }, send: command => commands.push(command) });
const begin = source.indexOf('function updateInventory(me) {');
const end = source.indexOf('\nfunction resourceInventoryCard', begin);
vm.runInContext(source.slice(begin, end), context);
const render = () => context.updateInventory(me);
const press = button => click({ target: { closest: () => button } });
render();
assert.equal(count.textContent, '×3');
press(one);
assert.equal(commands.at(-1), 'DROP_ITEM:medkit:1');
me.medkits = 2; render(); press(all);
assert.equal(commands.at(-1), 'DROP_ITEM:medkit:2', 'all uses the latest snapshot quantity');
press(use);
assert.equal(commands.at(-1), 'USE:medkit');
me.hp = 100; render();
assert(use.disabled);
assert(!one.disabled && !all.disabled, 'full health still allows dropping');
press(use); assert.equal(commands.length, 3);
me.medkits = 0; render(); press(one); press(all);
assert(one.disabled && all.disabled);
assert.equal(commands.length, 3);
me.medkits = 2; me.down = true; render(); press(one); press(all); press(use);
assert(use.disabled && one.disabled && all.disabled);
assert.equal(commands.length, 3);
console.log('Medkit inventory passed: counts, use, single/all drops, latest quantity, full HP, empty and down guards');
