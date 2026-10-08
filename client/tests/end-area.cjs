const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
let now = 0, timer, timerDelay, menuReturns = 0;
const fadeClasses = new Set();
const context = vm.createContext({
    performance: { now: () => now }, state: null,
    screenFade: {classList:{add:name=>fadeClasses.add(name),remove:name=>fadeClasses.delete(name)}},
    setTimeout: (callback, delay) => { timerDelay = delay; timer = callback; return 1; },
    clearTimeout: () => { timer = null; },
    receiveState: next => { assert(!run(next.phase)); assert(fadeClasses.has('show')); menuReturns++; }
});
vm.runInContext(source.slice(source.indexOf('let endAreaPhase ='), source.indexOf('function receiveState(')), context);
const run = phase => vm.runInContext(`keepEndArea({phase: '${phase}'})`, context);
for (const phase of ['won', 'lost']) {
    run('wave'); now = 0;
    assert(run(phase));
    assert.equal(timerDelay, 10000);
    const scheduled = timer;
    now = 9999;
    assert(run(phase));
    assert.equal(timer, scheduled, 'repeated snapshots must not restart the delay');
    context.state = { phase }; now = 10000; scheduled();
    assert(run(phase), 'Ending scene remains while it fades out');
    assert(fadeClasses.has('show')); assert.equal(timerDelay,350);
    timer(); assert(!fadeClasses.has('show'));
    assert(!run(phase));
    assert(!run(phase), 'later snapshots must not reopen the area');
}
assert.equal(menuReturns, 2);
run('wave'); now = 20000; run('lost');
const stale = timer;
run('lobby'); context.state = { phase: 'lobby' }; stale();
assert.equal(menuReturns, 2, 'leaving or restarting cancels the result callback');
assert.equal(timer, null);
console.log('End area passed: win/loss, ten seconds, scene fade, repeated snapshots, cancellation');
