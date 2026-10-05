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
const me = { ownsRicochet: true, ricochetAmmo: 60, ownsSmg: true, smgAmmo: 300, ownsRevolver: true, revolverAmmo: 36, ownsLmg: true, lmgAmmo: 150, ownsRocket: true, rocketAmmo: 12, credits: 2000 };
const context = vm.createContext({ me, getMe: () => me, BUILD_INFO: {}, equipmentOrder: [], SHOP_UNITS: map.shopUnits,
    WEAPON_AMMO_REFILL_COST: 120, INTERACTION_RANGE: { shop: 100 },
    openNearbyActionMenu: (title, entries) => { options = entries; }
});
const start = source.indexOf('const WEAPON_FIELDS =');
vm.runInContext(source.slice(start, source.indexOf('\n});', start) + 4), context);
for (const name of ['applyRules', 'equipmentEntries', 'ammoForWeapon', 'openShopPurchase']) {
    vm.runInContext(extract(name), context);
}
context.rules = { recipes: {}, shop: { ammo: 1000 }, weapons: Object.fromEntries(
    ['ricochet', 'shotgun', 'smg', 'rifle', 'sniper', 'revolver', 'lmg', 'rocket'].map(w => [w, { capacity: me[w + 'Ammo'] || 111, refillCost: 120 }])) };
vm.runInContext('applyRules({rules})', context);
for (const [weapon, capacity] of [['ricochet', 60], ['smg', 300], ['revolver', 36], ['lmg', 150], ['rocket', 12]]) {
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
    assert.equal(options[0].detail, '120G');
    assert.equal(options[0].command, 'BUY:' + weapon);
    assert(!options[0].disabled);
}
context.shop = map.shopUnits.find(shop => shop.item === 'ammo');
vm.runInContext('openShopPurchase(shop)', context);
assert.equal(options[0].label, 'REFILL');
assert.equal(options[0].detail, '1000G');
me.credits = 999;
vm.runInContext('openShopPurchase(shop)', context);
assert(options[0].disabled);
me.credits = 1000;
vm.runInContext('openShopPurchase(shop)', context);
assert(!options[0].disabled);
me.ricochetAmmo = 60; me.smgAmmo = 300; me.revolverAmmo = 36; me.lmgAmmo = 150; me.rocketAmmo = 12;
vm.runInContext('openShopPurchase(shop)', context);
assert.equal(options[0].label, 'FULL');
assert(options[0].disabled);
me.ownsRicochet = me.ownsSmg = me.ownsRevolver = me.ownsLmg = me.ownsRocket = false;
vm.runInContext('openShopPurchase(shop)', context);
assert.equal(options[0].label, 'LOCKED');
assert(options[0].disabled);
console.log('Weapon UI passed: weapon caps, full/empty AMMO unit, equipment and refills');
