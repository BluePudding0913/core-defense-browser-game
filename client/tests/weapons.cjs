const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const map = JSON.parse(fs.readFileSync('shared/map.json', 'utf8'));
function extract(name) {
    const begin = source.indexOf('function ' + name + '(');
    const end = source.indexOf('\nfunction ', begin + 1);
    return source.slice(begin, end < 0 ? undefined : end);
}
let options;
const me = { ownsRevolver: true, revolverAmmo: 36, ownsLmg: true, lmgAmmo: 150, credits: 2000 };
const context = vm.createContext({ me, getMe: () => me, BUILD_INFO: {}, equipmentOrder: [],
    WEAPON_AMMO_REFILL_COST: 120, INTERACTION_RANGE: { shop: 100 },
    openNearbyActionMenu: (title, entries) => { options = entries; }
});
const start = source.indexOf('const WEAPON_FIELDS =');
vm.runInContext(source.slice(start, source.indexOf('\n});', start) + 4), context);
for (const name of ['equipmentEntries', 'ammoForWeapon', 'openShopPurchase']) {
    vm.runInContext(extract(name), context);
}
for (const [weapon, capacity] of [['revolver', 36], ['lmg', 150]]) {
    context.weapon = weapon;
    context.shop = map.shopUnits.find(shop => shop.item === weapon);
    assert(context.shop);
    assert(vm.runInContext('equipmentEntries(me).some(entry => entry.value === weapon)', context));
    assert.equal(vm.runInContext('ammoForWeapon(me, weapon)', context), String(capacity));
    vm.runInContext('openShopPurchase(shop)', context);
    assert.equal(options[0].label, 'FULL');
    assert(options[0].disabled);
    me[weapon + 'Ammo'] = 0;
    vm.runInContext('openShopPurchase(shop)', context);
    assert.equal(options[0].label, 'REFILL');
    assert.equal(options[0].command, 'BUY:' + weapon);
    assert(!options[0].disabled);
}
context.shop = map.shopUnits.find(shop => shop.item === 'ammo');
vm.runInContext('openShopPurchase(shop)', context);
assert.equal(options[0].label, 'REFILL');
me.revolverAmmo = 36; me.lmgAmmo = 150;
vm.runInContext('openShopPurchase(shop)', context);
assert.equal(options[0].label, 'FULL');
assert(options[0].disabled);
me.ownsRevolver = me.ownsLmg = false;
vm.runInContext('openShopPurchase(shop)', context);
assert.equal(options[0].label, 'LOCKED');
assert(options[0].disabled);
console.log('Weapon UI passed: weapon caps, full/empty AMMO unit, equipment and refills');
