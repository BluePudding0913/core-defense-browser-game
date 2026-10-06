const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
let now = 0;
const circles = [];
const context = vm.createContext({
    performance: { now: () => now },
    state: { blackoutActive: true, trippedBreakers: ['outside', 'inside', 'locked'], areas: { room: true } },
    BREAKER_TERMINALS: [
        { id: 'outside', x: 100, y: 200 },
        { id: 'inside', x: 300, y: 400, requiredArea: 'room' },
        { id: 'locked', x: 500, y: 600, requiredArea: 'closed' },
        { id: 'working', x: 700, y: 800 },
    ],
    camera: { x: 50, y: 100 }, scale: 2, canvas: { width: 900, height: 500 },
    ctx: { save() {}, restore() {}, beginPath() {}, stroke() {},
        arc(x, y, radius) { circles.push({ x, y, radius, alpha: this.globalAlpha }); } },
});
const start = source.indexOf('function drawBlackoutSignals(');
const end = source.indexOf('\nfunction ', start + 1);
vm.runInContext(source.slice(start, end), context);
function draw() {
    circles.length = 0;
    vm.runInContext('drawBlackoutSignals()', context);
}
draw();
assert.equal(circles.length, 6, 'only the two accessible tripped breakers emit signals');
assert(circles.slice(0, 3).every(c => c.x === 550 && c.y === 450), 'rings share the projected breaker center');
assert(circles.slice(3).every(c => c.x === 950 && c.y === 850));
assert.equal(new Set(circles.slice(0, 3).map(c => c.radius)).size, 3, 'three distinct concentric rings');
const initial = circles.map(c => ({ ...c }));
now = 300;
draw();
assert(circles[0].radius > initial[0].radius, 'signal expands');
assert(circles[0].alpha < initial[0].alpha, 'signal fades while expanding');
now = 2400;
draw();
assert.deepEqual(circles, initial, 'signal repeats while power remains off');
context.state.trippedBreakers = ['inside'];
draw();
assert.equal(circles.length, 3, 'reset breaker immediately stops emitting');
assert(circles.every(c => c.x === 950 && c.y === 850));
context.state.blackoutActive = false;
draw();
assert.equal(circles.length, 0, 'restored power stops all signals');
const renderStart = source.indexOf('function draw()');
const renderEnd = source.indexOf('\nfunction ', renderStart + 1);
const render = source.slice(renderStart, renderEnd);
assert(render.indexOf('ctx.setTransform(1, 0, 0, 1, 0, 0);', render.indexOf('drawWorld();')) < render.indexOf('drawBlackoutSignals();'));
assert(render.indexOf('drawBlackout();') < render.indexOf('drawBlackoutSignals();'), 'signals render above blackout darkness');
console.log('Blackout signal checks passed');
