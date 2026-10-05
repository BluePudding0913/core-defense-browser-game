const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const start = source.indexOf('function drawHitEffects(');
const end = source.indexOf('\nfunction ', start + 1);
let now = 400;
let circles = [];
const context = vm.createContext({
    performance: { now: () => now }, myPlayerId: 'me',
    hitEffects: [{ effect: 'player-down', x: 100, y: 200, started: 0 }],
    ctx: { save() {}, restore() {}, beginPath() {}, stroke() {},
        arc: (x, y, radius) => circles.push({ x, y, radius }) },
});
vm.runInContext(source.slice(start, end), context);
vm.runInContext('drawHitEffects()', context);
assert.equal(circles.length, 3);
assert(circles.every(c => c.x === 100 && c.y === 200));
assert.equal(context.ctx.strokeStyle, '#ff5964');
const firstRadius = circles[0].radius;
now = 800; circles = [];
vm.runInContext('drawHitEffects()', context);
assert(circles[0].radius > firstRadius, 'rings expand over time');
now = 1200; circles = [];
vm.runInContext('drawHitEffects()', context);
assert.equal(circles.length, 0);
assert.equal(context.hitEffects.length, 0);
