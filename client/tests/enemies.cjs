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
    beginPath() {}, fill() {}, stroke() {},
    arc(x, y, radius) { bodies.push({ radius, color: this.fillStyle }); },
    fillText(text) { labels.push(text); },
};
const context = vm.createContext({ ctx, Math, hitEffects: [],
    performance: { now: () => 1000 }, smoothEntity: (_kind, enemy) => enemy,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    drawBar: (...args) => bars.push(args), state: { enemies: [] },
});
vm.runInContext(extract('enemyRadius'), context);
vm.runInContext(extract('drawEnemies'), context);
for (const type of ['grunt', 'runner', 'brute', 'boss', 'armored', 'hunter', 'siege', 'champion', 'warlord', 'titan']) {
    labels.length = bars.length = bodies.length = 0;
    context.state.enemies = [{ type, x: 100, y: 100, hp: 500, maxHp: 1000 }];
    vm.runInContext('drawEnemies()', context);
    assert(bodies[0].radius > 0);
    if (type !== 'grunt') assert(labels.includes(type.toUpperCase()));
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
console.log('Enemy display passed: ten enemy types, distinct elite visuals and upgraded boss health bars');
