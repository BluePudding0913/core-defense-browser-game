const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const animate = source.slice(source.indexOf('function animate('), source.indexOf('\nfunction receiveDroneSelfDestruct'));
function loop(maxFps) {
    const draws = [], predictions = [];
    let now = 0, queued = 0;
    const window = { coreGraphicsSettings: { getMaxFps: () => maxFps } };
    const context = vm.createContext({ window, performance: { now: () => now },
        socket: null, WebSocket: { OPEN: 1 }, state: null, predictedLocal: null,
        getMe: () => null, myPlayerId: null, firingPointer: null, secondaryHeld: false,
        updateLocalPrediction: (dt, elapsed) => predictions.push({ dt, elapsed }),
        draw: () => draws.push(now), requestAnimationFrame: () => queued++ });
    vm.runInContext(`let lastFrameAt = 0, lastDrawAt = null; ${animate}`, context);
    return { draws, predictions, window, setFps: value => maxFps = value,
        tick(time) { now = time; context.animate(time); }, queued: () => queued };
}
for (const refresh of [30, 60, 120, 144, 165, 240]) {
    for (const maxFps of [30, 60]) {
        const run = loop(maxFps);
        const ticks = refresh * 10;
        for (let i = 0; i < ticks; i++) run.tick(i * 1000 / refresh);
        assert.equal(run.draws.length, Math.min(refresh, maxFps) * 10, `${maxFps} FPS on ${refresh} Hz`);
        assert.equal(run.predictions.length, ticks, 'prediction continues on every callback');
        assert.equal(run.queued(), ticks, 'exactly one next callback is scheduled');
        const totalElapsed = run.predictions.reduce((sum, p) => sum + p.elapsed, 0);
        assert(Math.abs(totalElapsed - (ticks - 1) / refresh) < 1e-8, 'prediction retains elapsed time');
    }
}
const run = loop(60);
run.tick(0); run.tick(1000 / 60);
run.setFps(30);
run.tick(2000 / 60);
assert.equal(run.draws.length, 2, 'switching to 30 skips the next 60 Hz frame');
run.tick(3000 / 60);
assert.equal(run.draws.length, 3);
run.setFps(60);
run.tick(4000 / 60);
assert.equal(run.draws.length, 4, 'switching to 60 applies on the next callback');
run.tick(10000);
assert.equal(run.draws.length, 5, 'a long pause renders once without replay');
run.tick(10000);
assert.equal(run.draws.length, 5, 'same timestamp does not render again');
assert.equal(run.predictions.at(-2).dt, .05, 'long-pause prediction delta remains clamped');
const fallback = loop(60);
delete fallback.window.coreGraphicsSettings;
fallback.tick(0); fallback.tick(8); fallback.tick(17);
assert.equal(fallback.draws.length, 2, 'missing settings uses 60 FPS');
console.log('Frame rate passed: 30/60 FPS, refresh rates, live switching, pauses and uninterrupted prediction.');
