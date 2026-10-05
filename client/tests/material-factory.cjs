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
    open(); assert(options[0].disabled); assert.equal(options[0].label, '稼働中');
    assert.equal(options[0].detail, '在庫 7/20');
    state.factories = [];
}
console.log('Material factory purchase UI passed');
