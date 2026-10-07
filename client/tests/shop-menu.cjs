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
let nearby = true;
const context = vm.createContext({
    actionMenu, actionOptions, actionTitle: {}, activeMenuAccess: null,
    document: { querySelector: () => ({}), createElement: () => ({
        dataset: {}, innerHTML: '', addEventListener(event, handler) { this[event] = handler; },
    }) },
    getMe: () => me, canUseNearby: () => nearby, escapeHtml: value => value,
    send: command => commands.push(command), updateWorkbenchMaterials() {},
    WeaponUI: require('../weapon-ui.js'),
    WEAPON_FIELDS: { shotgun: { owned: 'ownsShotgun', ammo: 'shotgunAmmo', capacity: 12, refillCost: 120 } },
    WEAPON_AMMO_REFILL_COST: 120, INTERACTION_RANGE: { shop: 70 },
    state: { rules: { medkitCapacity: 3 } },
    applyRules() {}, keepEndArea: () => false, hideScreenIntro() {}, window: {},
    previousPhase: 'preparing', previousRound: 1, lastCoreHp: 100,
    performance: { now: () => 0 }, reconcileEnemySmoothing() {}, endInteractionHold() {},
    CORE: {}, reconcileLocalPrediction() {}, receiveLog() {}, updateHud() {}, updateRoomLobby() {},
    menu: { classList: { add() {} } }, hud: { classList: { remove() {} } },
    inventoryMenu: { classList: { add() {} } },
});
for (const name of ['openActionMenu', 'openNearbyActionMenu', 'closeActionMenu', 'openShopPurchase', 'receiveState']) {
    vm.runInContext(extract(name), context);
}
const run = code => vm.runInContext(code, context);
const snapshot = () => {
    context.next = { phase: 'preparing', round: 1, core: { hp: 100 }, rules: { medkitCapacity: 3 } };
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
console.log('Shop menu passed: purchases/refills stay open, live availability, stable buttons and closing');
