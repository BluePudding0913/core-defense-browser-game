const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
let now = 0, timer, menuReturns = 0;
const context = vm.createContext({
    performance: { now: () => now }, state: null,
    setTimeout: (callback, delay) => { assert.equal(delay, 10000); timer = callback; return 1; },
    clearTimeout: () => { timer = null; },
    receiveState: next => { assert(!run(next.phase)); menuReturns++; }
});
vm.runInContext(source.slice(source.indexOf('let endAreaPhase ='), source.indexOf('function receiveState(')), context);
const run = phase => vm.runInContext(`keepEndArea({phase: '${phase}'})`, context);
for (const phase of ['won', 'lost']) {
    run('wave'); now = 0;
    assert(run(phase));
    const scheduled = timer;
    now = 9999;
    assert(run(phase));
    assert.equal(timer, scheduled, 'repeated snapshots must not restart the delay');
    context.state = { phase }; now = 10000; scheduled();
    assert(!run(phase));
    assert(!run(phase), 'later snapshots must not reopen the area');
}
assert.equal(menuReturns, 2);
run('wave'); now = 20000; run('lost');
const stale = timer;
run('lobby'); context.state = { phase: 'lobby' }; stale();
assert.equal(menuReturns, 2, 'leaving or restarting cancels the result callback');
assert.equal(timer, null);
console.log('End area passed: win/loss, ten seconds, repeated snapshots, cancellation');
