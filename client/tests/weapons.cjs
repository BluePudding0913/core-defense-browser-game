const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const WeaponUI = require('../weapon-ui.js');
const source = fs.readFileSync('client/app.js', 'utf8');
const map = JSON.parse(fs.readFileSync('shared/map.json', 'utf8'));
function extract(name) {
    const begin = source.indexOf('function ' + name + '(');
    const end = source.indexOf('\nfunction ', begin + 1);
    return source.slice(begin, end < 0 ? undefined : end);
}
let options;
// Synthetic received rules test UI behavior independently of production balance.
const me = { ownsRailgun: true, railgunAmmo: 2, ownsRicochet: true, ricochetAmmo: 60, ownsSmg: true, smgAmmo: 300, ownsRevolver: true, revolverAmmo: 36, ownsLmg: true, lmgAmmo: 150, ownsRocket: true, rocketAmmo: 12, credits: 2000 };
const context = vm.createContext({ WeaponUI, me, getMe: () => me, BUILD_INFO: {}, equipmentOrder: [], SHOP_UNITS: map.shopUnits,
    state: { rules: { weaponLimit: 3 } },
    WEAPON_AMMO_REFILL_COST: 120, INTERACTION_RANGE: { shop: 100 },
    openNearbyActionMenu: (title, entries) => { options = entries; }
});
const start = source.indexOf('const WEAPON_FIELDS =');
vm.runInContext('const WEAPON_FIELDS = {};', context);
for (const name of ['applyRules', 'equipmentEntries', 'ammoForWeapon', 'openShopPurchase']) {
    vm.runInContext(extract(name), context);
}
context.rules = { recipes: {}, shop: { ammo: 500 }, weapons: Object.fromEntries(
    ['railgun', 'ricochet', 'shotgun', 'smg', 'rifle', 'sniper', 'revolver', 'lmg', 'rocket'].map(w => [w, { owned: 'owns' + w[0].toUpperCase() + w.slice(1), ammo: w + 'Ammo', capacity: me[w + 'Ammo'] || 111, refillCost: 120 }])) };
vm.runInContext('applyRules({rules})', context);
for (const [weapon, {capacity}] of Object.entries(context.rules.weapons).filter(([,rule]) => me[rule.owned])) {
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
assert.equal(options[0].detail, '500G');
me.credits = 499;
vm.runInContext('openShopPurchase(shop)', context);
assert(options[0].disabled);
me.credits = 500;
vm.runInContext('openShopPurchase(shop)', context);
assert(!options[0].disabled);
for (const rule of Object.values(context.rules.weapons)) if (me[rule.owned]) me[rule.ammo] = rule.capacity;
vm.runInContext('openShopPurchase(shop)', context);
assert.equal(options[0].label, 'FULL');
assert(options[0].disabled);
me.ownsRailgun = me.ownsRicochet = me.ownsSmg = me.ownsRevolver = me.ownsLmg = me.ownsRocket = false;
vm.runInContext('openShopPurchase(shop)', context);
assert.equal(options[0].label, 'LOCKED');
assert(options[0].disabled);
console.log('Weapon UI passed: weapon caps, full/empty AMMO unit, equipment and refills');

// A previously unknown weapon is listed, counted and refilled using only server rules.
context.rules.weapons.pulse = { name: 'pulse', capacity: 7, owned: 'ownsPulse', ammo: 'pulseAmmo', refillCost: 33 };
context.rules.weapons.bat = { capacity: 0 };
context.rules.weapons.pistol = { capacity: 0 };
me.ownsPulse = true; me.pulseAmmo = 2; me.credits = 100;
vm.runInContext('applyRules({rules})', context);
assert(vm.runInContext('equipmentEntries(me).some(entry => entry.value === "pulse" && entry.label === "PULSE")', context));
assert.equal(vm.runInContext('ammoForWeapon(me, "pulse")', context), '2');
assert.equal(vm.runInContext('ammoForWeapon(me, "pistol")', context), '∞');
context.shop = { item: 'pulse', label: 'PULSE', cost: 99 };
vm.runInContext('openShopPurchase(shop)', context);
assert.equal(options[0].command, 'BUY:pulse');
assert.equal(options[0].detail, '33G');
me.pulseAmmo = 7;
vm.runInContext('openShopPurchase(shop)', context);
assert(options[0].disabled);
delete context.rules.weapons.pulse;
vm.runInContext('applyRules({rules})', context);
assert(!vm.runInContext('equipmentEntries(me).some(entry => entry.value === "pulse")', context));
console.log('Catalog-driven UI passed: unknown weapon, unlimited ammo and removed definitions');

context.rules.weapons.pistol.owned = 'ownsPistol';
me.ownsPistol = true; me.ownsSmg = true; me.ownsRevolver = true; me.credits = 100000;
vm.runInContext('applyRules({rules})', context);
context.shop = map.shopUnits.find(shop => shop.item === 'rifle');
vm.runInContext('openShopPurchase(shop)', context);
assert.equal(options.length, 1);
assert.equal(options[0].label, 'BUY');
assert.equal(options[0].detail, context.shop.cost + 'G');
assert.equal(options[0].command, undefined);
assert(!options[0].disabled);
options[0].onSelect();
assert.equal(options.length, 3);
assert.deepEqual(Array.from(options, option => option.command).sort(), ['BUY:rifle:pistol', 'BUY:rifle:revolver', 'BUY:rifle:smg']);
assert(options.every(option => !option.disabled));
me.credits = 0;
vm.runInContext('openShopPurchase(shop)', context);
assert(options.every(option => option.disabled));
me.credits = 100000;
vm.runInContext('openShopPurchase(shop)', context);
const purchase = options[0];
me.ownsRevolver = false;
purchase.onSelect();
assert.equal(options.length, 1);
assert.equal(options[0].command, 'BUY:rifle');
me.ownsPistol = false;
assert(!vm.runInContext('equipmentEntries(me).some(entry => entry.value === "pistol")', context));
console.log('Weapon exchange UI passed: selection, bat exclusion, cost and removed pistol');

// Exercise the real button handlers: BUY opens selection without sending or closing.
const sent = [];
let buttons = [], closed = 0;
const classes = new Set(['hidden']);
Object.assign(context, {
    actionTitle: {}, actionOptions: {
        get children() { return buttons; },
        replaceChildren() { buttons = []; }, append(button) { buttons.push(button); },
    },
    actionMenu: { classList: {
        toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
        remove(name) { classes.delete(name); },
    } },
    document: { querySelector: () => ({}), createElement: () => ({
        dataset: {}, click() { this.onclick?.(); },
    }) },
    updateWorkbenchMaterials() {}, escapeHtml: value => value,
    canUseNearby: () => true, send: command => sent.push(command),
    closeActionMenu() { closed++; classes.add('hidden'); },
});
vm.runInContext(extract('openActionMenu') + extract('openNearbyActionMenu'), context);
me.ownsPistol = true; me.ownsRevolver = true;
vm.runInContext('openShopPurchase(shop)', context);
assert.equal(buttons.length, 1);
assert(buttons[0].innerHTML.startsWith('BUY'));
assert(classes.has('single-action'));
buttons[0].click();
assert.equal(buttons.length, 3);
assert.equal(sent.length, 0);
assert.equal(closed, 0);
assert(!classes.has('hidden'));
assert(!classes.has('single-action'));
buttons[0].click();
assert.equal(sent.length, 1);
assert(sent[0].startsWith('BUY:rifle:'));
assert.equal(closed, 0);
assert(!classes.has('hidden'), 'exchange purchase keeps the shop open');
console.log('Weapon purchase flow passed: BUY click, exchange selection, then purchase');
