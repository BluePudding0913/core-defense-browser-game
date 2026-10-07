const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
let now = 50;
const arcs = [];
const context = vm.createContext({
    performance: { now: () => now }, myPlayerId: 'me', hitEffects: [],
    ctx: { save() {}, restore() {}, beginPath() {}, stroke() {}, arc(...args) { arcs.push(args); } },
});
const begin = source.indexOf('function drawHitEffects(');
vm.runInContext(source.slice(begin, source.indexOf('\nfunction ', begin + 1)), context);
const draw = () => { arcs.length = 0; vm.runInContext('drawHitEffects()', context); };
const effect = { effect: 'hit', weapon: 'bat', damage: 0, fromX: 100, fromY: 100, x: 140, y: 120, started: 0 };
context.hitEffects = [effect];
draw();
assert.equal(arcs.length, 1);
assert.deepEqual(arcs[0].slice(0, 2), [140, 120], 'effect is centered at authoritative click position');
assert(arcs[0][2] >= 4 && arcs[0][2] < 8, 'small effect radius');
assert.equal(arcs[0][3], 0);
assert.equal(arcs[0][4], Math.PI * 2);
effect.x = 196; effect.y = 100;
draw();
assert.deepEqual(arcs[0].slice(0, 2), [196, 100], 'same compact effect at reach limit');
effect.damage = 20;
draw();
assert.equal(arcs.length, 0, 'impact event does not duplicate attack effect');
effect.damage = 0;
now = 210;
draw();
assert.equal(arcs.length, 0, 'effect ends within 200 ms');
context.hitEffects = [];
draw();
assert.equal(arcs.length, 0, 'no idle effect');
console.log('Bat effect passed: click position, compact size, single effect and expiry');
