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
    state.factories = [{ item: shop.item, purchased: true, stock: 7, capacity: 20 }];
    open(); assert(options[0].disabled); assert.equal(options[0].label, '購入済み');
    assert.equal(options[0].detail, '設置・回収して移動できます');
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
    me.buildItems = { [shop.item]: 1 };
    me.selectedBuild = shop.item;
    context.shop = shop;
    assert(vm.runInContext('equipmentEntries(getMe()).some(entry => entry.value === shop.item && entry.label === shop.label)', context));
    assert.equal(vm.runInContext('placementSelection(getMe()).type', context), shop.item);
    assert.equal(context.BUILD_INFO[shop.item].shopOnly, true);
    me.buildItems[shop.item] = 0;
    assert.equal(vm.runInContext('placementSelection(getMe())', context), null);
}
console.log('Portable quarry inventory and placement UI passed');
