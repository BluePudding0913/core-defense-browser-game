const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const WeaponUI = require('../weapon-ui.js');
const source = fs.readFileSync('client/app.js', 'utf8');
function extract(name) {
    const start = source.indexOf(`function ${name}(`);
    return source.slice(start, source.indexOf('\nfunction ', start + 1));
}
const definitions = {
    pistol: {name:'PISTOL',capacity:0,silverAmmoEligible:true},
    smg: {name:'SMG',capacity:240,owned:'ownsSmg',ammo:'smgAmmo',silverAmmoEligible:true},
    rocket: {name:'LAUNCHER',capacity:8,owned:'ownsRocket',ammo:'rocketAmmo',silverAmmoEligible:false},
};
const me = {job:'attacker',weapon:'pistol',secondaryWeapon:'smg',ownsSmg:true,smgAmmo:173,
    secondaryCooldown:.4,silverAmmo:8};
const fields = new Map();
const field = id => {
    if (!fields.has(id)) fields.set(id, {classList:{toggle:(_, value) => fields.get(id).hidden = value}});
    return fields.get(id);
};
const context = vm.createContext({WeaponUI, WEAPON_FIELDS:definitions, equipmentOrder:[], BUILD_INFO:{},
    document:{querySelector:field}, ammoForWeapon:(p,id)=>WeaponUI.ammo(p,id,definitions)});
vm.runInContext(extract('updateSecondaryHud') + extract('equipmentEntries'), context);
context.updateSecondaryHud(me);
assert.equal(field('#secondary-hud').hidden, false);
assert.equal(field('#secondary-name').textContent, 'SMG');
assert.equal(field('#secondary-ammo').textContent, '173');
assert.equal(field('#secondary-cooldown').textContent, '0.4s');
assert.equal(field('#secondary-silver').textContent, '銀弾 8');
assert(!field('#secondary-silver').hidden);
assert(context.equipmentEntries(me).some(entry => entry.value === 'smg'), 'equipped sub remains visible in EQUIPMENT');
me.secondaryCooldown = 0; me.silverAmmo = 0;
context.updateSecondaryHud(me);
assert.equal(field('#secondary-cooldown').textContent, '');
assert(field('#secondary-silver').hidden);
me.secondaryWeapon = 'rocket'; me.silverAmmo = 8;
context.updateSecondaryHud(me);
assert(field('#secondary-silver').hidden, 'excluded weapons never imply silver ammo is active');
me.job = 'healer'; context.updateSecondaryHud(me);
assert(field('#secondary-hud').hidden);
assert.equal(WeaponUI.jobCooldownLabel({job:'spy',jobCooldown:18,decoyCooldown:2}), '18.0s · DECOY 2.0s');
assert.equal(WeaponUI.jobCooldownLabel({job:'healer',jobCooldown:0}), '');
assert.equal(WeaponUI.jobCooldownLabel({job:'tank',jobCooldown:4,down:true}), '');
assert.equal(WeaponUI.cooldownLabel(0, 1.2), 'CHARGE 1.2s');
assert.equal(WeaponUI.cooldownLabel(0, 0, .7), 'FIRE 0.7s');
console.log('HUD status passed: sub weapon stock, equipment visibility, cooldown seconds and silver ammo eligibility');
