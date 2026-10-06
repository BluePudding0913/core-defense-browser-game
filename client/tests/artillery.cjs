const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
let now = 0;
const circles = [];
const context = vm.createContext({
    state: { phase: 'wave', artilleryReceivedAt: 0, artilleryShells: [
        { sourceX: 100, sourceY: 200, x: 300, y: 200, remaining: 1.5, duration: 1.5, radius: 64 },
    ] },
    performance: { now: () => now }, Math,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    myPlayerId: 'me', hitEffects: [],
    ctx: { save() {}, restore() {}, beginPath() {}, fill() {}, stroke() {},
        arc(x, y, radius, start, end) { circles.push({ x, y, radius, start, end }); } },
});
for (const name of ['drawArtilleryShells', 'drawHitEffects']) {
    const start = source.indexOf(`function ${name}(`);
    const end = source.indexOf('\nfunction ', start + 1);
    vm.runInContext(source.slice(start, end), context);
}
function draw(time) {
    now = time; circles.length = 0;
    vm.runInContext('drawArtilleryShells()', context);
}
draw(0);
assert.equal(circles[0].x, 300); assert.equal(circles[0].radius, 64);
assert.equal(circles[2].x, 100);
draw(750);
assert.equal(circles[0].x, 300, 'aim point stays fixed');
assert.equal(circles[2].x, 200);
assert(circles[2].y < 200, 'shell follows a raised arc');
assert(Math.abs(circles[1].end - circles[1].start - Math.PI) < 1e-9);
draw(1500);
assert.equal(circles.length, 0, 'warning expires at impact');
context.state.phase = 'preparing'; draw(0);
assert.equal(circles.length, 0, 'no warnings after the wave');
context.state.phase = 'wave'; delete context.state.artilleryShells; draw(0);
assert.equal(circles.length, 0, 'older snapshots are supported');
context.hitEffects = [{ effect: 'acid-impact', x: 300, y: 200, radius: 64, started: 0 }];
now = 180;
vm.runInContext('drawHitEffects()', context);
assert.equal(context.ctx.strokeStyle, '#d5f06a');
assert.equal(circles[0].radius, 40);
now = 360; circles.length = 0;
vm.runInContext('drawHitEffects()', context);
assert.equal(circles.length, 0);
console.log('Artillery display passed: fixed warning, countdown, arced shell, expiry and acid impact');
