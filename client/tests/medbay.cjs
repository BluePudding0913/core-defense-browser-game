const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const map = JSON.parse(fs.readFileSync('shared/map.json', 'utf8'));
const shop = map.shopUnits.find(s => s.item === 'medkit');
const me = { credits: 120, medkits: 0 };
let entries;
const context = vm.createContext({ shop, getMe: () => me,
    state: { rules: { medkitHeal: 60, medkitCapacity: 5 } },
    INTERACTION_RANGE: { shop: 70 },
    openNearbyActionMenu: (title, options) => { entries = options; } });
const start = source.indexOf('function openShopPurchase(');
const end = source.indexOf('\nfunction ', start + 1);
vm.runInContext(source.slice(start, end), context);
const open = () => vm.runInContext('openShopPurchase(shop)', context);
open();
assert.equal(entries.length, 1);
assert.equal(entries[0].command, 'BUY:medkit');
assert.equal(entries[0].disabled, false);
me.credits = 119;
open(); assert(entries[0].disabled);
me.credits = 120; me.medkits = 5;
open(); assert(entries[0].disabled);
assert(!source.includes('BUY:heal'));
assert(!source.includes('openMedMenu'));
console.log('Medbay UI passed: independent kit shop, funds/capacity and passive recovery');

let drawn = 0;
context.state.areas = { 'recovery-room': false };
context.state.phase = 'prep';
context.TILE_MAP = map.tileMap;
context.ctx = { save() { drawn++; }, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} };
context.spawn = { id: 'area-recovery-room:2', x: 220, y: 1740 };
const entranceStart = source.indexOf('function drawSpawnEntrance(');
const entranceEnd = source.indexOf('\nfunction ', entranceStart + 1);
vm.runInContext(source.slice(entranceStart, entranceEnd), context);
vm.runInContext('drawSpawnEntrance(spawn)', context);
assert.equal(drawn, 0);
context.state.areas['recovery-room'] = true;
vm.runInContext('drawSpawnEntrance(spawn)', context);
assert.equal(drawn, 1, 'numbered entrances use the room unlock state');
