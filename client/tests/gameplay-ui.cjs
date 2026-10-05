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
    state: { phase: 'wave' }, getMe: () => me, interactionHold: null,
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

const activeAudio = [];
const soundContext = vm.createContext({ window: { addEventListener: (_, fn) => fn() },
    Audio: class { constructor(path) { this.path = path; activeAudio.push(this); } addEventListener() {} play() { return Promise.reject(new Error('empty placeholder')); } }
});
vm.runInContext(fs.readFileSync('client/sound.js', 'utf8'), soundContext);
soundContext.window.coreAudio.play('shotgun');
assert.equal(activeAudio[0].path, 'sounds/shotgun.mp3');
for (const file of fs.readdirSync('client/sounds')) assert.equal(fs.statSync('client/sounds/' + file).size, 0);
console.log('Gameplay UI passed: tap/hold/cancel/down/placement, authoritative rules, silent audio placeholders');

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
