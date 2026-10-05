const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const map = JSON.parse(fs.readFileSync('shared/map.json', 'utf8'));
const shops = map.shopUnits.filter(shop => shop.item.endsWith('Factory'));
const me = { credits: 10000 };
let options;
const state = { factories: [] };
const context = vm.createContext({ state, getMe: () => me,
    INTERACTION_RANGE: { shop: 70 },
    openNearbyActionMenu: (title, entries) => { options = entries; } });
const start = source.indexOf('function openShopPurchase(');
const end = source.indexOf('\nfunction ', start + 1);
vm.runInContext(source.slice(start, end), context);
assert.equal(shops.length, 4);
for (const shop of shops) {
    context.shop = shop;
    const open = () => vm.runInContext('openShopPurchase(shop)', context);
    me.credits = shop.cost - 1;
    open(); assert(options[0].disabled);
    me.credits = shop.cost;
    open(); assert.equal(options[0].label, 'BUY'); assert(!options[0].disabled);
    assert.equal(options[0].command, 'BUY:' + shop.item);
    assert(options[0].detail.includes(shop.cost + 'G'));
    assert.equal(options[0].detail, shop.cost + 'G');
    state.factories = [{ item: shop.item, id: 'quarry-1', x: 980, y: 1820 }];
    open(); assert(!options[0].disabled); assert.equal(options[0].label, 'BUY');
    assert.equal(options[0].detail, shop.cost + 'G');
    state.factories = [];
}
console.log('Material factory purchase UI passed');

context.SHOP_UNITS = shops;
context.BUILD_INFO = {};
context.WEAPON_FIELDS = {};
context.equipmentOrder = [];
for (const name of ['applyRules', 'equipmentEntries', 'placementSelection']) {
    const start = source.indexOf('function ' + name + '(');
    const end = source.indexOf('\nfunction ', start + 1);
    vm.runInContext(source.slice(start, end), context);
}
vm.runInContext('applyRules({rules:{recipes:{block:{name:"BLOCK"}},shop:{ammo:1000},weapons:{}}})', context);
for (const shop of shops) {
    me.buildItems = { [shop.item]: 2 };
    me.selectedBuild = shop.item;
    context.shop = shop;
    assert(vm.runInContext('equipmentEntries(getMe()).some(entry => entry.value === shop.item && entry.label === shop.label)', context));
    assert.equal(vm.runInContext('placementSelection(getMe()).type', context), shop.item);
    assert.equal(context.BUILD_INFO[shop.item].shopOnly, true);
    me.buildItems[shop.item] = 0;
    assert.equal(vm.runInContext('placementSelection(getMe())', context), null);
}
console.log('Portable quarry inventory and placement UI passed');

context.distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
context.hasInteractionPath = () => true;
context.SHOP_UNITS = [];
context.WORKBENCHES = [];
context.AREAS = [];
context.PREP_CONSOLE = null;
context.MED = { x: 10000, y: 10000 };
context.openMedMenu = () => {};
context.openCoreMenu = () => {};
context.INTERACTION_RANGE = { shop: 70, medBay: 95, core: 100 };
state.phase = 'preparing'; state.slots = []; state.core = { x: 10000, y: 10000 };
state.factories = [{ id: 'quarry-1', item: 'woodFactory', x: 980, y: 1820 },
    { id: 'quarry-2', item: 'woodFactory', x: 1060, y: 1820 }];
const interactionStart = source.indexOf('function findNearestInteraction(');
const interactionEnd = source.indexOf('\nfunction ', interactionStart + 1);
vm.runInContext(source.slice(interactionStart, interactionEnd), context);
for (const unit of state.factories) {
    me.x = unit.x; me.y = unit.y;
    vm.runInContext('findNearestInteraction().action()', context);
    assert.equal(options[0].command, 'PICKUP_FACTORY:' + unit.id);
}
console.log('Quarry pickup UI targets individual instances');
