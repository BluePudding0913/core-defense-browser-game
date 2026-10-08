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
    state: { rules: { medkitCapacity: 3 } },
    applyRules() {}, keepEndArea: () => false, hideScreenIntro() {}, window: {},
    previousPhase: 'preparing', previousRound: 1, lastCoreHp: 100,
    performance: { now: () => 0 }, reconcileEnemySmoothing() {}, reconcileDroneSmoothing() {}, endInteractionHold() {},
    CORE: {}, reconcileLocalPrediction() {}, receiveLog() {}, updateHud() {}, updateRoomLobby() {},
    menu: { classList: { add() {} } }, hud: { classList: { remove() {} } },
    inventoryMenu: { classList: { add() {} } },
});
for (const name of ['openActionMenu', 'openNearbyActionMenu', 'closeActionMenu', 'openShopPurchase',
    'openWorkbenchMenu', 'updateWorkbenchMaterials', 'receiveState']) {
    vm.runInContext(extract(name), context);
}
const run = code => vm.runInContext(code, context);
const snapshot = () => {
    context.next = { phase: 'preparing', round: 1, players: [], core: { hp: 100 }, rules: { medkitCapacity: 3, weaponLimit: 3 } };
    run('receiveState(next)');
};
const click = () => { const button = actionOptions.children[0]; if (!button.disabled) button.click(); };
context.shop = { label: 'SHOTGUN', item: 'shotgun', cost: 450, x: 0, y: 0 };
run('openShopPurchase(shop)');
const weaponButton = actionOptions.children[0];
click();
assert.equal(commands.at(-1), 'BUY:shotgun');
assert(!classes.has('hidden'), 'purchase keeps the shop open');
me.ownsShotgun = true; me.shotgunAmmo = 12; me.credits = 50;
snapshot();
assert.equal(actionOptions.children[0], weaponButton, 'snapshots preserve the button and its focus');
assert.equal(weaponButton.innerHTML, 'FULL<small>120G</small>');
assert(weaponButton.disabled);
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
click();
assert(!classes.has('hidden'));
me.medkits = 3;
snapshot();
assert(actionOptions.children[0].disabled, 'kit capacity updates while the menu stays open');
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
assert(classes.has('hidden'), 'other actions keep their existing close behavior');
run('openShopPurchase(shop); closeActionMenu()');
assert.equal(context.activeMenuAccess, null);
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
console.log('Shop/workbench menu passed: purchases/refills/crafts stay open, live availability, stable buttons and closing');
