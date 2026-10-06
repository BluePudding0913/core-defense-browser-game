const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
function extract(name) {
    const begin = source.indexOf('function ' + name + '(');
    const end = source.indexOf('\nfunction ', begin + 1);
    return source.slice(begin, end < 0 ? undefined : end);
}
const labels = [], bars = [], bodies = [];
const ctx = {
    beginPath() {}, fill() {}, stroke() {}, save() {}, restore() {},
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
