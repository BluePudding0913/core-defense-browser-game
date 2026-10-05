const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
function extract(name) {
    const begin = source.indexOf('function ' + name + '(');
    const end = source.indexOf('\nfunction ', begin + 1);
    return source.slice(begin, end < 0 ? undefined : end);
}
const rectangles = [], labels = [], circles = [];
const ctx = {
    save() {}, restore() {}, beginPath() {}, fill() {}, stroke() {},
    fillRect(...args) { rectangles.push(args); },
    strokeRect(...args) { rectangles.push(args); },
    fillText(...args) { labels.push(args); },
    arc(...args) { circles.push(args); },
};
const context = vm.createContext({ ctx, Math, performance: { now: () => 1000 },
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    state: { core: { x: 100, y: 100, hp: 1000, maxHp: 1000, shield: 0, maxShield: 180 }, players: [] },
    coreHitStarted: 0, myPlayerId: 'me', hitEffects: [],
});
for (const name of ['drawBar', 'drawDefense', 'drawCore', 'drawHitEffects']) {
    vm.runInContext(extract(name), context);
}
vm.runInContext('drawDefense({x:100,y:100,defense:{type:"barricade",hp:600,maxHp:1200}})', context);
for (const [x, y, w, h] of rectangles) {
    assert(x >= 80 && y >= 80 && x + w <= 120 && y + h <= 120,
        'barricade including its health bar must fit its one 40px tile');
}
assert(rectangles.some(rect => rect[2] === 14), 'half-health bar must show half of 28px');
vm.runInContext('drawCore()', context);
assert(labels.some(([label]) => label === 'SHIELD 0 / 180'), 'depleted shield still shows capacity');
context.state.core.shield = 91.2;
vm.runInContext('drawCore()', context);
assert(labels.some(([label]) => label === 'SHIELD 92 / 180'));
context.hitEffects = [{ effect: 'explosion', x: 100, y: 100, radius: 140, started: 820 }];
vm.runInContext('drawHitEffects()', context);
assert(circles.some(([x, y, r]) => x === 100 && y === 100 && r === 87.5), 'blast ring grows around impact');
assert(fs.readFileSync('client/style.css', 'utf8').includes("fill='%230078ff'"), 'pointer stays blue');
console.log('Defense display passed: one-tile barricade, shield counters, blast ring and blue pointer');
