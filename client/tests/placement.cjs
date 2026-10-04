const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
function extract(name) {
    const begin = source.indexOf('function ' + name + '(');
    const end = source.indexOf('\nfunction ', begin + 1);
    return source.slice(begin, end < 0 ? undefined : end);
}
const messages = [];
const feedback = [];
let options;
const me = { id: 'me', x: 1119, y: 1900, selectedBuild: 'block', buildItems: { block: 2 },
    ownsShotgun: true, shotgunAmmo: 5, credits: 1000 };
const context = vm.createContext({
    TILE_MAP: { tileSize: 40 }, myPlayerId: 'me', localFacing: { x: 1, y: 0 }, me,
    getMe: () => me, send: command => messages.push(command),
    showFeedback: text => feedback.push(text), findNearestInteraction: () => null,
    canBuildAt: () => false,
    WEAPON_FIELDS: { shotgun: { owned: 'ownsShotgun', ammo: 'shotgunAmmo', capacity: 30 } },
    WEAPON_AMMO_REFILL_COST: 120, INTERACTION_RANGE: { shop: 100 },
    openNearbyActionMenu: (title, entries) => { options = entries; }
});
for (const name of ['snapToTile', 'quantizeFacing', 'frontPlacementTile', 'placementSelection',
    'placeSelectedInFront', 'useNearestInteraction', 'openShopPurchase']) {
    vm.runInContext(extract(name), context);
}
const run = code => vm.runInContext(code, context);
let point = run('frontPlacementTile(me)');
assert.equal(point.x, 1180, 'skip the adjacent tile when it intersects the player');
assert.equal(point.y, 1900);
for (const [x, y] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
    me.x = 1100 + x * 19; me.y = 1900 + y * 19;
    context.localFacing = { x, y };
    point = run('frontPlacementTile(me)');
    assert.equal(point.x, 1100 + x * 80);
    assert.equal(point.y, 1900 + y * 80);
}
me.x = 1100; me.y = 1900; context.localFacing = { x: 1, y: 0 };
assert.equal(run('frontPlacementTile(me).x'), 1140, 'centered placement stays adjacent');
me.x = 1119; me.movingCore = true;
assert.equal(run('frontPlacementTile(me).x'), 1140, 'carried CORE retains its placement rules');
me.movingCore = false;
context.localFacing = { x: undefined, y: undefined };
assert(Number.isFinite(run('frontPlacementTile(me).y')));
assert(run('placeSelectedInFront()'));
assert.deepEqual(messages, ['PLACE_FRONT'], 'stale client blockers must not suppress server validation');
assert.deepEqual(feedback, []);
me.selectedBuild = null;
assert(!run('placeSelectedInFront()'));
run('useNearestInteraction()');
assert.deepEqual(feedback, [], 'no interaction should be silent');
context.shop = { label: 'SHOTGUN', item: 'shotgun', cost: 450 };
run('openShopPurchase(shop)'); assert.equal(options[0].label, 'REFILL');
me.shotgunAmmo = 30;
run('openShopPurchase(shop)'); assert.equal(options[0].label, 'FULL'); assert(options[0].disabled);
me.ownsShotgun = false;
run('openShopPurchase(shop)'); assert.equal(options[0].label, 'BUY');
console.log('Placement/shop regressions passed: edges, directions, server validation, silent interaction, English labels');
