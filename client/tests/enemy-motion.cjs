const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
let now = 0;
const context = vm.createContext({ performance: { now: () => now }, smoothed: new Map(), state: null });
for (const name of ['recordEnemyMotion', 'interpolateEnemyMotion', 'reconcileEnemySmoothing', 'smoothEntity']) {
    const start = source.indexOf(`function ${name}(`);
    const end = source.indexOf('\nfunction ', start + 1);
    vm.runInContext(source.slice(start, end), context);
}
function receive(time, x, y = 0, roomId = 'one', round = 1) {
    now = time;
    context.next = { phase: 'wave', round, roomId, enemies: [{ id: 1, x, y }] };
    vm.runInContext('reconcileEnemySmoothing(next); state = next;', context);
}
function position(time) {
    now = time;
    return vm.runInContext('smoothEntity("enemy", state.enemies[0]).x', context);
}
// 10Hz packets should produce constant motion at different rendering frame rates.
for (const fps of [30, 60, 144]) {
    context.smoothed.clear(); context.state = null;
    receive(0, 0);
    let nextPacket = 100;
    for (let time = 0; time < 1000; time += 1000 / fps) {
        while (nextPacket <= time + 1e-8) { receive(nextPacket, nextPacket / 10); nextPacket += 100; }
        assert(Math.abs(position(time) - Math.max(0, time - 120) / 10) < 1e-8, `constant speed at ${fps}fps, t=${time}`);
        assert.equal(position(time), position(time), 'rendering twice must not advance the enemy');
    }
}
// Packet batching and modest jitter retain the timestamp-based interpolation.
context.smoothed.clear(); context.state = null;
receive(0, 0); receive(100, 10); receive(215, 20);
assert(Math.abs(position(265) - (10 + 10 * 45 / 115)) < 1e-8);
assert.equal(position(1000), 20, 'a stalled connection must not extrapolate through walls');
receive(1100, 25);
assert.equal(position(1100), 25, 'resume after a long stall resets old history');
receive(1200, 500);
assert.equal(position(1200), 500, 'teleports reset history');
receive(1300, 10, 0, 'two');
assert.equal(position(1300), 10, 'room changes cannot reuse an enemy from the previous room');
for (let i = 0; i < 100; i++) receive(1400 + i * 100, 10 + i);
assert(context.smoothed.get('enemy-1').history.length <= 6, 'history has a fixed bound');
context.next = { ...context.state, enemies: [] };
vm.runInContext('reconcileEnemySmoothing(next); state = next;', context);
assert(!context.smoothed.has('enemy-1'), 'dead/despawned enemies release their history');
receive(12000, 99, 0, 'two', 0);
assert.equal(position(12000), 99, 'reused IDs start at their actual spawn');
console.log('Enemy motion passed: steady 30/60/144fps, jitter, no extrapolation, stalls, teleport, room/reset cleanup and bounded history');
