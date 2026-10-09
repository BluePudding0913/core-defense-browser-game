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
    secondaryCooldown:.4,secondaryCooldownMax:.8,silverAmmo:8};
const fields = new Map();
const field = id => {
    if (!fields.has(id)) fields.set(id, {style:{setProperty:(key,value) => fields.get(id)[key] = value},classList:{toggle:(_, value) => fields.get(id).hidden = value}});
    return fields.get(id);
};
const context = vm.createContext({WeaponUI, WEAPON_FIELDS:definitions, equipmentOrder:[], BUILD_INFO:{},
    document:{querySelector:field}, ammoForWeapon:(p,id)=>WeaponUI.ammo(p,id,definitions)});
vm.runInContext(extract('updateSecondaryHud') + extract('equipmentEntries'), context);
context.updateSecondaryHud(me);
assert.equal(field('#secondary-hud').hidden, false);
assert.equal(field('#secondary-name').textContent, 'SMG');
me.enchantments = {smg: 2}; context.updateSecondaryHud(me);
assert.equal(field('#secondary-name').textContent, 'SMG +2');
assert(context.equipmentEntries(me).some(entry => entry.label === 'SMG +2'), 'inventory uses the same upgrade suffix');
assert(WeaponUI.ammoStock(me, definitions).includes('SMG +2'), 'ammo stock shows the upgraded weapon name');
delete me.enchantments; context.updateSecondaryHud(me);
assert.equal(field('#secondary-icon').className, 'weapon-icon smg');
assert.equal(field('#secondary-hud')['--cooldown-progress'], '50%');
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
assert.deepEqual(WeaponUI.jobCooldowns({job:'spy',jobCooldown:18,decoyCooldown:2}).map(timer=>timer.seconds), ['18.0','2.0']);
assert.deepEqual(WeaponUI.jobCooldowns({job:'healer',jobCooldown:0}), []);
assert.deepEqual(WeaponUI.jobCooldowns({job:'scout',jobCooldown:0,scoutDashRemaining:.2}), [], 'active burst is not a cooldown');
assert.deepEqual(WeaponUI.jobCooldowns({job:'tank',jobCooldown:4,down:true}), []);
for (const [job, field, label] of [['tp','tpInvulnerableRemaining','TP無敵'],['healer','healRemaining','回復エリア'],['spy','spyRemaining','偽装']]) {
    const player = {job,jobCooldown:19,[field]:4};
    assert.deepEqual(WeaponUI.jobCooldowns(player), [{label,seconds:'4.0'}], 'active effect replaces cooldown in the same orb');
    player[field]=0; player.jobCooldown=15;
    assert.deepEqual(WeaponUI.jobCooldowns(player), [{label:'ジョブ能力の再使用',seconds:'15.0'}]);
    player.jobCooldown=0;
    assert.deepEqual(WeaponUI.jobCooldowns(player), []);
}
assert.equal(WeaponUI.jobCooldowns({job:'tp',jobCooldown:19,tpInvulnerableRemaining:4,teleportCooldown:2}).length,2,'independent TP travel keeps its own timer');
assert.equal(WeaponUI.jobCooldowns({job:'spy',jobCooldown:25,spyRemaining:3,decoyCooldown:.3}).length,2,'decoy is independent of disguise');
assert.equal(WeaponUI.cooldownLabel(0, 1.2), 'CHARGE 1.2s');
assert.equal(WeaponUI.cooldownLabel(0, 0, .7), 'FIRE 0.7s');
console.log('HUD status passed: sub weapon stock, equipment visibility, cooldown seconds and silver ammo eligibility');
