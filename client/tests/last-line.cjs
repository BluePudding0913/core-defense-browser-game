const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const map = JSON.parse(fs.readFileSync('shared/map.json', 'utf8'));
const WeaponUI = require('../weapon-ui.js');
const me = {credits: 20000, ownsPistol: true, pistolAmmo: 0, buildItems: {silverTurret: 31}};
const state = {rules: {upgrades: {enchantMax: 3, enchantStep: .25, enchantCosts: [20000,40000,80000],
    bottomsCost: 15000, topsCost: 25000, bottomsReduction: .1, topsReduction: .2, compressionCost: 32,
    teamCost: 50000, teamDuration: 120, teamDamage: 1.25, teamDefense: .8}, weaponLimit: 3}, teamBuffRemaining: 0};
let menu;
const context = vm.createContext({getMe: () => me, state, WeaponUI, WEAPON_AMMO_REFILL_COST: 120,
    WEAPON_FIELDS: {pistol: {owned: 'ownsPistol', ammo: 'pistolAmmo', capacity: 100, refillCost: 120},
        railgun: {owned: 'ownsRailgun', ammo: 'railgunAmmo', capacity: 8, refillCost: 3000}},
    INTERACTION_RANGE: {shop: 70}, openNearbyActionMenu(title, options, shop) {menu = {title, options, shop};}});
for (const name of ['openShopPurchase', 'openUpgradeShop']) {
    const start = source.indexOf(`function ${name}(`), end = source.indexOf('\nfunction ', start + 1);
    vm.runInContext(source.slice(start, end), context);
}
function open(item) {context.shop = map.shopUnits.find(shop => shop.item === item); vm.runInContext('openShopPurchase(shop)', context); return menu.options;}
let options = open('enchant'); assert.equal(options[0].command, 'BUY:enchant:pistol'); assert(!options[0].disabled);
assert.equal(menu.title, 'ULTIMATE'); assert.equal(options[0].label, 'PISTOL');
me.enchantments = {pistol: 1}; options = open('enchant'); assert(options[0].disabled); assert(options[0].detail.includes('40000G'));
assert.equal(options[0].label, 'PISTOL +1');
me.credits = 40000; assert(!open('enchant')[0].disabled);
me.drone = {active: true, weapon: 'pistol'}; assert(open('enchant')[0].disabled); me.drone = null;
me.enchantments.pistol = 2; me.credits = 79999; options = open('enchant'); assert(options[0].disabled); assert(options[0].detail.includes('80000G'));
me.credits = 80000; assert(!open('enchant')[0].disabled); assert(open('enchant')[0].detail.includes('AUTO AIM'), 'last tier advertises auto aim');
me.enchantments.pistol = 3; assert(open('enchant')[0].disabled); assert.equal(menu.options[0].detail, 'MAX · AUTO AIM');
assert.equal(menu.options[0].label, 'PISTOL +3');
options = open('armor'); assert.equal(options.length, 2); assert.equal(options[0].command, 'BUY:armor:bottoms');
assert(options[1].detail.includes('25000G')); me.armorTops = true; assert(open('armor')[1].disabled);
assert(open('overclockSilver')[0].disabled); me.buildItems.silverTurret = 32;
assert(!open('overclockSilver')[0].disabled); assert.equal(menu.options[0].command, 'BUY:overclockSilver');
me.credits = 50000; assert(!open('teamMachine')[0].disabled); state.teamBuffRemaining = 119.2;
assert(open('teamMachine')[0].disabled); assert.equal(menu.options[0].label, '120s');
me.ownsRailgun = true; me.railgunAmmo = 0; me.credits = 2999;
options = open('ammo'); assert(options[0].disabled); assert.equal(options[0].detail, '3000G');
me.credits = 3000; options = open('ammo'); assert(!options[0].disabled); assert.equal(options[0].command, 'BUY:ammo');
assert.equal(open('ammo')[0].detail, '3000G', 'ordinary AMMO also uses heavy weapon refill prices');
const ammoShops = map.shopUnits.filter(shop => shop.item === 'ammo'); assert.equal(ammoShops.length, 2);
for (const shop of ammoShops) {
    context.shop = shop; vm.runInContext('openShopPurchase(shop)', context);
    assert.equal(menu.options[0].detail, '3000G'); assert.equal(menu.options[0].command, 'BUY:ammo');
    me.ownsRailgun = false; vm.runInContext('openShopPurchase(shop)', context);
    assert.equal(menu.options[0].detail, '250G', 'both stations have the same ordinary base price');
    me.ownsRailgun = true;
}
console.log('Last-line UI passed: tier costs, mounted weapons, owned armor, compression stock, active team buff and heavy ammo pricing');
