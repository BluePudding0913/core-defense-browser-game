const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const me = { weapon: 'bat' };
const rectangles = [], rings = [];
const context = vm.createContext({
    state: { phase: 'wave', rules: { weapons: { bat: { range: 115, width: 26 } } }, enemies: [] },
    WORLD: { width: 400, height: 400 },
    TILE_MAP: { tileSize: 40, rows: Array(10).fill('..........'), legend: { '.': { solid: false }, '#': { solid: true } } },
    predictedLocal: { x: 100, y: 100 }, localFacing: { x: 1, y: 0 },
    weaponPointer: null, firingPointer: null, getMe: () => me,
    worldFromScreen: (x, y) => ({ x, y }), smoothEntity: (_, entity) => entity,
    ctx: { save() {}, restore() {}, translate() {}, rotate() {}, beginPath() {}, stroke() {},
        fillRect(...args) { rectangles.push(args); }, strokeRect() {}, arc(...args) { rings.push(args); } },
});
for (const name of ['enemyRadius', 'attackDistanceToWall', 'batReachTarget', 'drawBatReach']) {
    const begin = source.indexOf('function ' + name + '(');
    vm.runInContext(source.slice(begin, source.indexOf('\nfunction ', begin + 1)), context);
}
const run = script => vm.runInContext(script, context);
const enemy = (x, y, type = 'grunt', hp = 100) => ({ x, y, type, hp });
context.origin = { x: 100, y: 100 }; context.direction = { x: 1, y: 0 };
const target = enemies => {
    context.enemies = enemies;
    return run('batReachTarget(origin, direction, attackDistanceToWall(origin, direction, 115), 26, enemies)');
};
const edge = enemy(215, 147);
assert.equal(target([edge]), edge, 'range and width include exact boundary and enemy body');
assert.equal(target([enemy(215.01, 100)]), null, 'body radius does not extend forward reach');
assert.equal(target([enemy(150, 147.01)]), null, 'outside lateral reach');
assert.equal(target([enemy(99, 100)]), null, 'behind player');
assert.equal(target([enemy(150, 100, 'grunt', 0)]), null, 'dead enemy');
assert.equal(target([enemy(150, 130, 'tiny')]), null, 'tiny body has narrower reach');
const nearest = enemy(130, 100);
assert.equal(target([edge, nearest]), nearest, 'bat only hits first candidate');
context.direction = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
assert(target([enemy(170, 170)]), 'diagonal attack');
context.direction = { x: 1, y: 0 };
context.TILE_MAP.rows[2] = '....#.....';
assert.equal(run('attackDistanceToWall(origin, direction, 115)'), 55);
assert.equal(target([enemy(170, 100)]), null, 'wall blocks reach');
context.TILE_MAP.rows[2] = '..........';
context.origin = { x: 159, y: 100 };
context.TILE_MAP.rows[3] = '....#.....';
assert.equal(target([enemy(179, 140)]), null, 'enemy center behind lateral wall cannot be hit');
context.TILE_MAP.rows[3] = '..........';
context.state.enemies = [enemy(180, 100)];
run('drawBatReach()');
assert.deepEqual(rectangles.pop(), [0, -26, 115, 52]);
assert.equal(rings.pop()[2], 26, 'in-range enemy gets glow outline');
context.state.enemies = [enemy(216, 100)];
run('drawBatReach()');
assert.equal(rings.length, 0, 'out-of-range enemy has no glow');
context.predictedLocal.x = 110;
run('drawBatReach()');
assert.equal(rings.length, 1, 'preview follows predicted player movement');
rectangles.length = 0;
for (const change of [{ down: true }, { movingCore: true }, { selectedBuild: 'block' }, { weapon: 'pistol' }]) {
    Object.assign(me, { weapon: 'bat', down: false, movingCore: false, selectedBuild: null }, change);
    run('drawBatReach()');
    assert.equal(rectangles.length, 0, 'inactive weapon hides preview');
}
Object.assign(me, { weapon: 'bat', selectedBuild: null });
context.state.phase = 'lobby';
run('drawBatReach()');
assert.equal(rectangles.length, 0);
console.log('Bat reach passed: boundaries, enemy size, walls, direction, target priority and drawing states');
context.performance = { now: () => 50 };
context.myPlayerId = 'me';
context.hitEffects = [{ effect: 'hit', weapon: 'bat', damage: 0, fromX: 100, fromY: 100, x: 215, y: 100, started: 0 }];
const hitBegin = source.indexOf('function drawHitEffects(');
vm.runInContext(source.slice(hitBegin, source.indexOf('\nfunction ', hitBegin + 1)), context);
rings.length = 0;
run('drawHitEffects()');
assert.equal(rings[0][2], 115, 'swing effect uses server trajectory length');
assert.equal(rings[0][3], -.4);
assert.equal(rings[0][4], .4);
context.hitEffects[0].damage = 20;
rings.length = 0;
run('drawHitEffects()');
assert.equal(rings.length, 0, 'impact event does not duplicate swing');
