const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
function extract(name) {
    const start = source.indexOf(`function ${name}(`);
    return source.slice(start, source.indexOf('\nfunction ', start + 1));
}
const classes = new Set(['hidden']);
const actionMenu = { classList: {
    add: name => classes.add(name), remove: name => classes.delete(name),
    toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
} };
const actionOptions = { children: [],
    replaceChildren() { this.children = []; }, append(button) { this.children.push(button); } };
const me = { credits: 500, medkits: 0, ownsShotgun: false, shotgunAmmo: 0 };
const commands = [];
const materials = { hidden: true, textContent: '' };
let nearby = true;
const context = vm.createContext({
    actionMenu, actionOptions, actionTitle: {}, activeMenuAccess: null,
    document: { querySelector: () => materials, createElement: () => ({
        dataset: {}, innerHTML: '', click() { this.onclick?.(); },
    }) },
    getMe: () => me, canUseNearby: () => nearby, escapeHtml: value => value,
    send: command => commands.push(command),
    WeaponUI: require('../weapon-ui.js'),
    WEAPON_FIELDS: { shotgun: { owned: 'ownsShotgun', ammo: 'shotgunAmmo', capacity: 12, refillCost: 120 } },
    WEAPON_AMMO_REFILL_COST: 120, INTERACTION_RANGE: { shop: 70, workbench: 70 },
    RESOURCE_NAMES: { wood: 'WOOD', ore: 'ORE' },
    BUILD_INFO: {
        block: { name: 'BLOCK', description: 'Wall', wood: 2 },
        turret: { name: 'TURRET', description: 'Defense', ore: 3 },
        woodFactory: { name: 'FACTORY', shopOnly: true },
    },
    state: { rules: { medkitCapacity: 3, silverAmmo: { cost: 1, amount: 10, damageMultiplier: 1.3 } } },
    applyRules() {}, keepEndArea: () => false, hideScreenIntro() {}, window: {},
    previousPhase: 'preparing', previousRound: 1, lastCoreHp: 100,
    performance: { now: () => 0 }, reconcileEnemySmoothing() {}, reconcileDroneSmoothing() {}, endInteractionHold() {}, endJobHold() {},
    CORE: {}, reconcileLocalPrediction() {}, receiveLog() {}, updateHud() {}, updateRoomLobby() {},
    menu: { classList: { add() {} } }, hud: { classList: { remove() {} } },
    inventoryMenu: { classList: { add() {} } },
});
for (const name of ['openActionMenu', 'openNearbyActionMenu', 'closeActionMenu', 'openShopPurchase',
    'openWorkbenchMenu', 'updateWorkbenchMaterials', 'receiveState', 'openCoreMenu', 'option']) {
    vm.runInContext(extract(name), context);
}
const run = code => vm.runInContext(code, context);
const snapshot = () => {
    context.next = { phase: 'preparing', round: 1, players: [], core: { hp: 100 }, rules: {
        medkitCapacity: 3, weaponLimit: 3, silverAmmo: { cost: 1, amount: 10, damageMultiplier: 1.3 },
    } };
    run('receiveState(next)');
};
const click = () => { const button = actionOptions.children[0]; if (!button.disabled) button.click(); };
context.shop = { label: 'SHOTGUN', item: 'shotgun', cost: 450, x: 0, y: 0 };
run('openShopPurchase(shop)');
const weaponButton = actionOptions.children[0];
assert(!context.actionTitle.innerHTML, "new weapon has no stock label");
click();
assert.equal(commands.at(-1), 'BUY:shotgun');
assert(!classes.has('hidden'), 'purchase keeps the shop open');
me.ownsShotgun = true; me.shotgunAmmo = 12; me.credits = 50;
snapshot();
assert.equal(actionOptions.children[0], weaponButton, 'snapshots preserve the button and its focus');
assert.equal(weaponButton.innerHTML, 'FULL<small>120G</small>');
assert(weaponButton.disabled);
assert(context.actionTitle.innerHTML.includes('SHOTGUN<span class="shop-ammo">12 / 12'));
me.shotgunAmmo = 0; me.credits = 120;
snapshot();
assert.equal(weaponButton.innerHTML, 'REFILL<small>120G</small>');
assert(!weaponButton.disabled);
click();
const refillStart = source.indexOf('if (message.type === "ammo-refilled") {');
const refillEnd = source.indexOf('\n        if (message.type === "error"', refillStart);
context.message = { type: 'ammo-refilled' };
vm.runInContext(source.slice(refillStart, refillEnd), context);
assert(!classes.has('hidden'), 'refill notification keeps the shop open');
me.shotgunAmmo = 12;
snapshot();
assert(weaponButton.disabled);
context.shop = { label: 'KIT', item: 'medkit', cost: 50, x: 0, y: 0 };
run('openShopPurchase(shop)');
assert.equal(actionOptions.children[0].innerHTML,
    '回復キット<small>50G</small><span class="action-stock">所持 0 / 3</span>');
click();
assert(!classes.has('hidden'));
me.medkits = 3;
snapshot();
assert(actionOptions.children[0].disabled, 'kit capacity updates while the menu stays open');
assert.equal(actionOptions.children[0].innerHTML,
    '回復キット<small>50G</small><span class="action-stock">所持 3 / 3</span>');
me.medkits = 2;
snapshot();
assert(actionOptions.children[0].innerHTML.includes('所持 2 / 3'), 'using a kit updates the open menu');
Object.assign(context.WEAPON_FIELDS, {
    smg: { name: 'SMG', capacity: 300, owned: 'ownsSmg', ammo: 'smgAmmo' },
    pistol: { name: 'Pistol', capacity: 0, owned: 'ownsPistol' },
});
Object.assign(me, { ownsSmg: true, smgAmmo: 25, ownsPistol: true, credits: 500 });
context.shop = { label: 'AMMO', item: 'ammo', cost: 500, x: 0, y: 0 };
run('openShopPurchase(shop)');
const ammoButton = actionOptions.children[0];
assert.equal(ammoButton.innerHTML,
    'REFILL<small>500G</small><span class="ammo-refill-row">SHOTGUN<span class="shop-ammo">12 / 12</span></span><span class="ammo-refill-row">SMG<span class="shop-ammo">25 / 300</span></span>');
assert(!ammoButton.innerHTML.includes('PISTOL'), 'unlimited weapons do not appear in ammo stock');
click();
assert.equal(commands.at(-1), 'BUY:ammo');
me.smgAmmo = 300;
snapshot();
assert.equal(actionOptions.children[0], ammoButton, 'ammo stock updates preserve the focused button');
assert(ammoButton.disabled);
assert(ammoButton.innerHTML.includes('SMG<span class="shop-ammo">300 / 300'), 'refilled ammo stays visible at full capacity');
me.ownsSmg = false;
me.shotgunAmmo = 4;
me.credits = 0;
snapshot();
assert(!ammoButton.innerHTML.includes('SMG'), 'unowned weapons are omitted');
assert(ammoButton.innerHTML.includes('SHOTGUN<span class="shop-ammo">4 / 12'), 'stock stays visible with insufficient funds');
assert(ammoButton.disabled);
me.credits = 50;
delete context.WEAPON_FIELDS.smg;
delete context.WEAPON_FIELDS.pistol;
context.shop = { label: 'FACTORY', item: 'woodFactory', cost: 50, x: 0, y: 0 };
run('openShopPurchase(shop)');
click(); click();
assert.deepEqual(commands.slice(-2), ['BUY:woodFactory', 'BUY:woodFactory']);
me.credits = 0;
snapshot();
assert(actionOptions.children[0].disabled, 'insufficient funds update while the menu stays open');
nearby = false;
snapshot();
assert(classes.has('hidden'), 'moving away still closes the shop');
nearby = true;
run('openNearbyActionMenu("CORE", [{label:"UPGRADE", command:"UPGRADE:hp"}], {x:0,y:0}, 100)');
click();
assert(!classes.has('hidden'), 'core upgrades keep the menu open');
run('closeActionMenu()');
run('openShopPurchase(shop); closeActionMenu()');
assert.equal(context.activeMenuAccess, null);
context.window.coreAudio = { play(name) { assert.equal(name, 'purchase'); } };
const purchaseStart = source.indexOf('if (message.type === "purchase-complete") {');
const purchaseEnd = source.indexOf('if (message.type === "ammo-refilled") {', purchaseStart);
me.credits = 500; nearby = true;
run('openShopPurchase(shop)');
context.message = { type: 'purchase-complete', closeMenu: false };
vm.runInContext(source.slice(purchaseStart, purchaseEnd), context);
assert(!classes.has('hidden'), 'repeatable purchases stay open after success');
context.message.closeMenu = true;
vm.runInContext(source.slice(purchaseStart, purchaseEnd), context);
assert(classes.has('hidden'), 'new weapon closes only after purchase succeeds');
assert(classes.has('hidden'), 'manual close clears the refresh callback');
me.wood = 4; me.ore = 3;
context.workbench = { x: 0, y: 0 };
run('openWorkbenchMenu(workbench)');
assert.equal(actionOptions.children.length, 2, 'shop-only items stay out of the workbench');
assert.equal(materials.textContent, '所持材料：WOOD 4 / ORE 3');
assert(!materials.hidden);
const craftButton = actionOptions.children[0];
const turretButton = actionOptions.children[1];
click();
assert.equal(commands.at(-1), 'CRAFT:block');
assert(!classes.has('hidden'), 'crafting keeps the workbench open');
me.wood = 2;
snapshot();
assert.equal(actionOptions.children[0], craftButton, 'craft refresh preserves buttons and focus');
assert(!craftButton.disabled);
assert.equal(materials.textContent, '所持材料：WOOD 2 / ORE 3');
click();
me.wood = 0;
snapshot();
assert(craftButton.disabled, 'spent materials disable only the unavailable recipe');
assert(!turretButton.disabled);
const commandCount = commands.length;
click();
assert.equal(commands.length, commandCount, 'unavailable recipes do not send commands');
turretButton.click();
assert.equal(commands.at(-1), 'CRAFT:turret');
assert(!classes.has('hidden'));
me.ore = 0;
snapshot();
assert(turretButton.disabled);
me.wood = 2;
snapshot();
assert(!craftButton.disabled, 'new materials re-enable crafting without reopening');
nearby = false;
snapshot();
assert(classes.has('hidden'), 'moving away still closes the workbench');
assert.equal(context.activeMenuAccess, null);
nearby = true;
run('openWorkbenchMenu(workbench); closeActionMenu()');
snapshot();
assert(classes.has('hidden'), 'snapshots do not reopen a manually closed workbench');
assert.equal(context.activeMenuAccess, null);
Object.assign(context.WEAPON_FIELDS, {
    bat: { name: 'Bat', capacity: 0 },
    pistol: { name: 'Pistol', capacity: 0, owned: 'ownsPistol' },
    smg: { name: 'SMG', capacity: 10, owned: 'ownsSmg', ammo: 'smgAmmo' },
    rifle: { name: 'Rifle', capacity: 10, owned: 'ownsRifle', ammo: 'rifleAmmo' },
});
Object.assign(me, { ownsShotgun: false, ownsPistol: true, ownsSmg: true, ownsRifle: true, credits: 500 });
context.shop = { label: 'SHOTGUN', item: 'shotgun', cost: 450, x: 0, y: 0 };
run('openShopPurchase(shop)');
assert.equal(actionOptions.children.length, 1, 'weapon limit initially shows BUY');
snapshot();
const beforeExchange = commands.length;
click();
assert.equal(commands.length, beforeExchange, 'BUY opens exchange choices without purchasing');
assert.equal(actionOptions.children.length, 3, 'exchange choices omit the bat');
const exchangeButton = actionOptions.children[0];
snapshot();
assert.equal(actionOptions.children[0], exchangeButton, 'snapshots preserve exchange selection');
click();
assert.equal(commands.at(-1), 'BUY:shotgun:pistol');
assert(!classes.has('hidden'), 'exchange purchase keeps the shop open');
Object.assign(me, { ownsShotgun: true, ownsPistol: false, shotgunAmmo: 12, credits: 50 });
snapshot();
assert.equal(actionOptions.children.length, 1, 'successful exchange returns to the owned weapon');
assert.equal(actionOptions.children[0].innerHTML, 'FULL<small>120G</small>');
assert(actionOptions.children[0].disabled);
// Server recipe object order must not change the workbench's presentation order.
const craftOrder = ['block', 'barricade', 'wire', 'mine', 'turret', 'copperTurret', 'silverTurret'];
context.BUILD_INFO = Object.fromEntries([...craftOrder].reverse().map(type => [type, { name: type, wood: 1 }]));
context.BUILD_INFO.silverFactory = { name: 'QUARRY S', shopOnly: true };
me.wood = 10;
run('openWorkbenchMenu(workbench)');
assert.deepEqual(actionOptions.children.map(button => button.dataset.command), craftOrder.map(type => `CRAFT:${type}`));
const orderedButtons = [...actionOptions.children];
snapshot();
assert.deepEqual(actionOptions.children, orderedButtons, 'refresh keeps the ordered buttons and focus');
actionOptions.children[1].click();
assert.equal(commands.at(-1), 'CRAFT:barricade', 'sorted buttons still craft the selected item');
context.shop = { label: 'AMMO', item: 'ammo', cost: 500, x: 0, y: 0 };
me.credits = 0; me.silver = 1; me.silverAmmo = 0;
run('openShopPurchase(shop)');
assert.equal(actionOptions.children.length, 2);
const silverButton = actionOptions.children[1];
assert.equal(silverButton.innerHTML,
    '銀弾 +10<small>銀 1</small><span class="action-stock">所持 0発 · 火力 ×1.3</span>');
assert(!silverButton.disabled, 'silver ammo can be purchased with silver and no gold');
silverButton.click();
assert.equal(commands.at(-1), 'BUY:silverAmmo');
assert(!classes.has('hidden'), 'silver ammo purchase keeps the shop open');
me.silver = 0; me.silverAmmo = 10;
snapshot();
assert.equal(actionOptions.children[1], silverButton, 'silver purchase refresh preserves button focus');
assert(silverButton.disabled);
assert(silverButton.innerHTML.includes('所持 10発'), 'purchased silver stock updates');
me.silverAmmo = 9; snapshot();
assert(silverButton.innerHTML.includes('所持 9発'), 'firing updates remaining silver stock');
const weaponUI = context.WeaponUI;
const definitions = { pistol: { capacity: 0, silverAmmoEligible: true }, rocket: { capacity: 8, silverAmmoEligible: false } };
assert.equal(weaponUI.silverAmmoLabel(me, 'pistol', definitions), '銀弾 9');
assert.equal(weaponUI.silverAmmoLabel(me, 'rocket', definitions), '');
me.silverAmmo = 0;
assert.equal(weaponUI.silverAmmoLabel(me, 'pistol', definitions), '');
console.log('Shop/workbench menu passed: purchases/refills/crafts stay open, live availability, stable buttons, craft order, silver ammo and closing');

context.state.core = {x:120,y:80,hp:1000,maxHp:1000,shield:0,maxShield:180,defense:0,regen:0};
context.state.rules.coreCosts = {hp:100,shield:100,defense:100,regen:100};
context.INTERACTION_RANGE.core = 130; me.credits = 200;
run('openCoreMenu()');
const coreButton = actionOptions.children[0];
click(); assert.equal(commands.at(-1),'UPGRADE:hp'); assert(!classes.has('hidden'));
assert.equal(context.activeMenuAccess.target.x,120);
context.state.core.maxHp = 1250; me.credits = 0;
context.activeMenuAccess.refresh();
assert.equal(actionOptions.children[0],coreButton); assert(coreButton.disabled);
assert(context.actionTitle.textContent.includes('1250'));
actionOptions.children.at(-1).click();
assert.equal(commands.at(-1),'EQUIP_CORE'); assert(classes.has('hidden'),'carry closes the core menu');
