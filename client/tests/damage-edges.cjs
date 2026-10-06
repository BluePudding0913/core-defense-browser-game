const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
let now = 0;
const fills = [];
const context = vm.createContext({
    performance: { now: () => now }, myPlayerId: 'me',
    hitEffects: [], canvas: { width: 900, height: 500 },
    ctx: { save() {}, restore() {},
        createLinearGradient() { return { addColorStop() {} }; },
        fillRect(x, y, w, h) { fills.push({ x, y, w, h, alpha: this.globalAlpha }); },
    },
});
for (const name of ['drawDamageEdges', 'drawHitEffects']) {
    const start = source.indexOf(`function ${name}(`);
    const end = source.indexOf('\nfunction ', start + 1);
    vm.runInContext(source.slice(start, end), context);
}
function draw() { fills.length = 0; vm.runInContext('drawHitEffects(); drawDamageEdges()', context); }
context.hitEffects = [{ effect: 'player-hit', playerId: 'other', started: 0 }];
draw(); assert.equal(fills.length, 0, 'teammate damage does not flash the screen');
context.hitEffects.push({ effect: 'player-hit', playerId: 'me', started: 0 });
draw(); assert.equal(fills.length, 4);
assert(fills.every(r => !(r.x < 450 && r.x + r.w > 450 && r.y < 250 && r.y + r.h > 250)), 'center remains clear');
const initialAlpha = fills[0].alpha;
now = 450; draw();
assert.equal(fills.length, 4, 'flash survives world effect cleanup until 600ms');
assert(fills[0].alpha < initialAlpha, 'flash fades');
context.hitEffects.push({ effect: 'player-hit', playerId: 'me', started: now });
draw(); assert.equal(fills[0].alpha, initialAlpha, 'another hit restarts the flash');
now = 1050; draw(); assert.equal(fills.length, 0, 'flash expires');
console.log('Damage edge checks passed');
