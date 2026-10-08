const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
function extract(name) {
    const begin = source.indexOf('function ' + name + '(');
    const end = source.indexOf('\nfunction ', begin + 1);
    return source.slice(begin, end < 0 ? undefined : end);
}
const labels = [], bars = [], bodies = [], vertices = [], fills = [];
const ctx = {
    beginPath() {}, fill() { fills.push(this.fillStyle); }, stroke() {}, save() {}, restore() {},
    moveTo(x, y) { vertices.push([x, y]); }, lineTo(x, y) { vertices.push([x, y]); }, closePath() {},
    arc(x, y, radius, start, end) { bodies.push({ radius, color: this.fillStyle, start, end }); },
    fillText(text) { labels.push(text); },
};
const context = vm.createContext({ ctx, Math, hitEffects: [],
    performance: { now: () => 1000 }, smoothEntity: (_kind, enemy) => enemy,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    drawBar: (...args) => bars.push(args), state: { enemies: [] },
});
vm.runInContext(extract('enemyRadius'), context);
vm.runInContext(extract('drawEnemies'), context);
for (const type of ['grunt', 'runner', 'brute', 'boss', 'armored', 'hunter', 'siege', 'champion', 'warlord', 'titan', 'tiny', 'shield', 'bomber', 'artillery']) {
    labels.length = bars.length = bodies.length = 0;
    context.state.enemies = [{ type, x: 100, y: 100, hp: 500, maxHp: 1000 }];
    vm.runInContext('drawEnemies()', context);
    assert(bodies[0].radius > 0);
    if (type !== 'grunt' && type !== 'tiny') assert(labels.includes(type.toUpperCase()));
    if (type === 'tiny') {
        assert.equal(bodies[0].radius, 3);
        assert(bodies.slice(1).every(eye => eye.radius < 1));
        assert.equal(labels.length, 0);
    }
    if (type === 'shield') {
        assert.equal(bodies[0].radius, 24);
        assert(bodies.some(part => part.radius === 28));
        assert.notEqual(bodies[0].color, '#707070');
    }
    if (type === 'artillery') {
        assert.equal(bodies[0].radius, 22);
        assert(bodies.some(part => part.radius === 9 && part.color === '#cce76b'));
    }
    const isBoss = ['boss', 'warlord', 'titan'].includes(type);
    assert.equal(bars.length, isBoss ? 1 : 0);
    if (isBoss) {
        assert(labels.includes('500 / 1000'));
        assert.equal(bars[0][4], .5);
    }
    if (['armored', 'hunter', 'siege', 'champion', 'warlord', 'titan'].includes(type)) {
        assert.notEqual(bodies[0].color, '#707070');
    }
}
for (const [facingX, facingY] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    bodies.length = 0;
    context.state.enemies = [{ type: 'shield', x: 100, y: 100, hp: 500, maxHp: 1000, facingX, facingY }];
    vm.runInContext('drawEnemies()', context);
    const shield = bodies.find(part => part.radius === 28);
    assert(Math.abs((shield.start + shield.end) / 2 - Math.atan2(facingY, facingX)) < 1e-9);
    assert(Math.abs(shield.end - shield.start - 2 * Math.PI / 3) < 1e-9);
}
console.log('Enemy display passed: fourteen enemy types, artillery sac, frontal shield, tiny body and eyes, distinct elite visuals and boss health bars');
context.state.enemies = [{ type: 'explosionBoss', x: 100, y: 100, hp: 1e9, maxHp: 1e9, fuse: -1 }];
vertices.length = fills.length = bodies.length = 0;
vm.runInContext('drawEnemies()', context);
assert.equal(vertices.length, 6);
for (const [x, y] of vertices) assert(Math.abs(Math.hypot(x - 100, y - 100) - 42) < 1e-9);
assert.equal(fills[0], '#080808');
assert(bodies.every(eye => eye.color === '#ff1527'));
function transitions(start, end) {
    let previous, count = 0;
    for (let elapsed = start; elapsed < end; elapsed += .01) {
        context.state.enemies[0].fuse = 30 - elapsed;
        fills.length = 0;
        vm.runInContext('drawEnemies()', context);
        if (previous !== undefined && previous !== fills[0]) count++;
        previous = fills[0];
    }
    return count;
}
assert(transitions(25, 30) > transitions(0, 5) * 3);
console.log('Explosion boss display passed: black hexagon, red eyes, accelerating countdown flashes');

// A neighboring body must never inherit another enemy's hit flash.
context.state.enemies = [
    { id: 9800, type: 'grunt', x: 1120, y: 1900, hp: 1974, maxHp: 2000 },
    { id: 9801, type: 'grunt', x: 1120, y: 1930, hp: 2000, maxHp: 2000 },
];
function flashes(effects) {
    context.hitEffects = effects;
    fills.length = 0;
    vm.runInContext('drawEnemies()', context);
    return fills.filter(color => color === '#ff3b48').length;
}
const hit = { effect: 'hit', enemyId: 9800, damage: 26, x: 1120, y: 1900, started: 1000 };
assert.equal(flashes([hit]), 1, 'Only the damaged enemy flashes');
context.state.enemies[0].x = 900;
assert.equal(flashes([hit]), 1, 'Movement or knockback does not lose the target flash');
context.state.enemies[1].x = 900;
context.state.enemies[1].y = 1900;
assert.equal(flashes([hit]), 1, 'Even overlapping enemies remain distinct');
assert.equal(flashes([{ ...hit, damage: 0 }]), 0, 'Trajectories and misses do not flash');
assert.equal(flashes([{ ...hit, enemyId: null }]), 0, 'An untargeted event does not flash');
assert.equal(flashes([{ ...hit, enemyId: 9999 }]), 0, 'A missing or defeated target does not flash neighbors');
assert.equal(flashes([{ ...hit, started: 700 }]), 0, 'Expired hits do not flash');
assert.equal(flashes([hit, { ...hit, enemyId: 9801 }]), 2, 'Area attacks flash each damaged target');
context.state.enemies[0].hp = 0;
assert.equal(flashes([hit]), 0, 'Dead targets do not transfer their flash');
console.log('Enemy hit effects passed: exact target, adjacent and overlapping enemies, movement, misses, expiration and area damage');
