const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const paths = [], arcs = [];
const player = { id: 'me', weapon: 'railgun', x: 100, y: 200,
    railgunRemaining: 3, railgunDx: 0, railgunDy: 1, railgunRange: 1200 };
const context = vm.createContext({ state: { players: [player] }, myPlayerId: 'me',
    predictedLocal: { x: 110, y: 220 }, TILE_MAP: { tileSize: 40 },
    smoothEntity: (_, entity) => entity,
    ctx: { save() {}, restore() {}, beginPath() {},
        moveTo(x, y) { this.start = [x, y]; }, lineTo(x, y) { this.end = [x, y]; },
        stroke() { if (this.start) paths.push({ start: this.start, end: this.end, width: this.lineWidth }); },
        arc(...values) { arcs.push(values); } },
});
const begin = source.indexOf('function drawRailguns(');
vm.runInContext(source.slice(begin, source.indexOf('\nfunction ', begin + 1)), context);
vm.runInContext('drawRailguns()', context);
assert.deepEqual(paths[0], { start: [110, 220], end: [110, 1420], width: 40 });
assert.equal(paths.length, 2, 'outer glow and white core');
paths.length = 0; context.predictedLocal.x = 130;
vm.runInContext('drawRailguns()', context);
assert.equal(paths[0].start[0], 130); assert.equal(paths[0].end[0], 130);
paths.length = 0; player.railgunRemaining = 0; player.railgunCharge = .6;
vm.runInContext('drawRailguns()', context);
assert.equal(arcs.length, 1);
assert(Math.abs(arcs[0][4] - arcs[0][3] - Math.PI) < 1e-9);
player.down = true; arcs.length = 0; paths.length = 0;
vm.runInContext('drawRailguns()', context);
assert.equal(arcs.length, 0); assert.equal(paths.length, 0);
player.down = false; player.job = 'attacker'; player.weapon = 'smg'; player.secondaryWeapon = 'railgun';
player.secondaryRailgunRemaining = 1; player.secondaryRailgunDx = 1; player.secondaryRailgunDy = 0; player.secondaryRailgunRange = 500;
vm.runInContext('drawRailguns()', context);
assert.deepEqual(paths[0], { start: [130, 220], end: [630, 220], width: 40 });
paths.length = 0; player.secondaryRailgunRemaining = 0; player.secondaryRailgunCharge = .6;
vm.runInContext('drawRailguns()', context); assert.equal(arcs.length, 1);
console.log('Railgun drawing passed: beam width, fixed direction, moving origin, charge and down state');
