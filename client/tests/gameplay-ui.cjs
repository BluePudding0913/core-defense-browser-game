const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
function extract(name) {
    const start = source.indexOf('function ' + name + '(');
    const end = source.indexOf('\nfunction ', start + 1);
    return source.slice(start, end < 0 ? undefined : end).split('\ninteractButton.addEventListener')[0];
}
let timer, menuOpens = 0;
const commands = [];
const me = { down: false };
const context = vm.createContext({
    state: { phase: 'wave' }, getMe: () => me, interactionHold: null, SHOP_UNITS: [],
    inventoryMenu: { classList: { contains: () => true } },
    howToMenu: { classList: { contains: () => true } },
    actionMenu: { classList: { contains: () => true } },
    findNearestInteraction: () => ({ kind: 'defense', target: { id: 'trap-123' } }),
    placementSelection: () => null, send: c => commands.push(c),
    setTimeout: fn => { timer = fn; return 1; }, clearTimeout: () => { timer = null; },
    toggleNearestInteraction: () => { menuOpens++; },
});
for (const name of ['beginInteractionHold', 'endInteractionHold']) vm.runInContext(extract(name), context);
const run = text => vm.runInContext(text, context);
run('beginInteractionHold(); endInteractionHold()');
assert.equal(menuOpens, 1); assert.equal(commands.length, 0);
run('beginInteractionHold(); beginInteractionHold()');
timer(); run('endInteractionHold()');
assert.deepEqual(commands, ['CARRY_NEAREST:trap-123']); assert.equal(menuOpens, 1);
run('beginInteractionHold(); endInteractionHold(true)');
assert.equal(timer, null); assert.equal(menuOpens, 1);
me.down = true; run('beginInteractionHold()'); assert.equal(timer, null);
me.down = false; context.placementSelection = () => ({ forCore: true });
run('beginInteractionHold(); endInteractionHold()');
assert.equal(menuOpens, 2); assert.equal(commands.length, 1);

context.WEAPON_FIELDS = { smg: {} }; context.BUILD_INFO = {}; context.WEAPON_AMMO_REFILL_COST = undefined;
vm.runInContext(extract('applyRules'), context);
run('applyRules({rules:{recipes:{silverTurret:{silver:7}},shop:{ammo:137},weapons:{smg:{capacity:987}}}})');
assert.equal(context.WEAPON_FIELDS.smg.capacity, 987);
assert.equal(context.WEAPON_AMMO_REFILL_COST, 137);
assert.equal(context.BUILD_INFO.silverTurret.silver, 7);
run('applyRules({rules:{recipes:{},shop:{ammo:19},weapons:{smg:{capacity:321}}}})');
assert.equal(context.WEAPON_FIELDS.smg.capacity, 321, 'server changes replace displayed limits');

// Gameplay routes shot events to the synthesized audio API; sound.cjs verifies synthesis.
const played = [];
context.window = { coreAudio: { play: (...args) => played.push(args) } };
context.myPlayerId = 'self';
context.state.players = [];
vm.runInContext(extract('playSoundEffect'), context);
run('playSoundEffect({effect:"shot",playerId:"self",weapon:"shotgun"})');
assert.deepEqual(played, [['shotgun', 0]]);
console.log('Gameplay UI passed: tap/hold/cancel/down/placement, authoritative rules and shot audio');

const entranceLines = [];
context.TILE_MAP = { tileSize: 40, rows: ['###', '#.#', '###'], legend: { '#': { solid: true }, '.': { solid: false } } };
context.state = { phase: 'wave', activeSpawns: ['area-room'], areas: { room: true } };
context.ctx = { save() {}, restore() {}, beginPath() {}, moveTo(x, y) { entranceLines.push([x, y]); }, lineTo() {}, stroke() {} };
vm.runInContext(extract('drawSpawnEntrance'), context);
run('drawSpawnEntrance({id:"area-room", x:60, y:60})');
assert.equal(entranceLines.length, 1);
assert.equal(context.ctx.strokeStyle, '#ff5964');
context.state.areas.room = false;
run('drawSpawnEntrance({id:"area-room", x:60, y:60})');
assert.equal(entranceLines.length, 1, 'locked rooms hide their wall markers');

let prepMenu;
context.PREP_CONSOLE = { cost: 100 };
context.openNearbyActionMenu = (title, actions) => { prepMenu = actions[0]; };
context.getMe = () => ({ credits: 199 });
vm.runInContext(extract('openPrepConsoleMenu'), context);
context.state = { phase: 'preparing', prepExtensionCost: 200 };
run('openPrepConsoleMenu()');
assert.equal(prepMenu.detail, '200G');
assert.equal(prepMenu.disabled, true);
context.getMe = () => ({ credits: 200 });
context.state = { phase: 'wave', prepExtensionCost: 200, nextPrepBonus: 60 };
run('openPrepConsoleMenu()');
assert.equal(prepMenu.detail, '200G / 予約 +1:00');
assert.equal(prepMenu.disabled, false);
assert.equal(prepMenu.command, 'EXTEND_PREP');

// Teleporter R taps travel; only the owner gets a recovery hold.
context.placementSelection = () => null;
let teleportTarget = { kind: 'teleporter', target: { x: 1180, y: 1900 }, owned: true,
    action: () => commands.push('TELEPORT') };
context.findNearestInteraction = () => teleportTarget;
const beforeTeleport = commands.length;
run('beginInteractionHold(); endInteractionHold()');
assert.equal(commands.at(-1), 'TELEPORT');
run('beginInteractionHold()'); timer(); run('endInteractionHold()');
assert.equal(commands.at(-1), 'PICKUP_TELEPORT:1180:1900');
assert.equal(commands.length, beforeTeleport + 2, 'recovery release must not also teleport');
teleportTarget.owned = false;
run('beginInteractionHold()'); assert.equal(timer, null); run('endInteractionHold()');
assert.equal(commands.at(-1), 'TELEPORT');
teleportTarget.owned = true;
run('beginInteractionHold(); endInteractionHold(true)');
assert.equal(commands.length, beforeTeleport + 3);
console.log('Teleporter input passed: tap, owner hold, ally access and cancellation');

// R falls back to disguise, while nearby facilities retain their interaction.
const spyCommands = [];
const spy = { id: 1, job: 'spy', x: 0, y: 0, spyRemaining: 0, jobCooldown: 0 };
const spyContext = vm.createContext({
    getMe: () => spy,
    state: { phase: 'wave', players: [spy], areas: {}, factories: [], slots: [], core: { x: 1000, y: 1000 } },
    MISSILE_COMPUTER: null, JOB_STATION: null, PREP_CONSOLE: null,
    SHOP_UNITS: [], WORKBENCHES: [], BREAKER_TERMINALS: [], AREAS: [],
    INTERACTION_RANGE: { core: 70, trapSlot: 70, shop: 70, workbench: 70 },
    distance: (a, b) => Math.hypot(a.x-b.x, a.y-b.y), hasInteractionPath: () => true,
    placementSelection: () => null, send: command => spyCommands.push(command),
    openCoreMenu() {}, openJobStation() {}, openShopPurchase() {},
});
vm.runInContext(extract('findNearestInteraction') + '\n' + extract('useNearestInteraction'), spyContext);
assert.equal(vm.runInContext('findNearestInteraction().kind', spyContext), 'spy');
vm.runInContext('useNearestInteraction()', spyContext);
assert.deepEqual(spyCommands, ['JOB_ABILITY']);
spyContext.state.core = { x: 20, y: 0 };
assert.equal(vm.runInContext('findNearestInteraction().kind', spyContext), 'core');
spyContext.state.core = { x: 1000, y: 1000 };
spy.down = true;
assert.equal(vm.runInContext('findNearestInteraction()', spyContext), null);
spy.down = false; spy.job = 'healer';
assert.equal(vm.runInContext('findNearestInteraction()', spyContext), null);
console.log('Spy interaction passed: R disguise, nearby facility priority, down and other jobs');
