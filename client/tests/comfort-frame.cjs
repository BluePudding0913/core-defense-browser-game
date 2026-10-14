const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/comfort-frame.js', 'utf8');
const key = 'core-defense-comfort-frame';
function load(storage) {
    const classes = new Set();
    const context = { window: {}, localStorage: storage, document: { documentElement: { classList: {
        toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }
    } } } };
    vm.runInNewContext(source, context);
    return { api: context.window.coreComfortFrame, classes };
}
const saved = new Map();
const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
let { api, classes } = load(storage);
assert.equal(api.get(), false);
assert.equal(classes.size, 0);
api.set(true);
assert(classes.has('comfort-frame-enabled'));
assert.equal(load(storage).api.get(), true, 'saved selection survives reload');
api.set(false);
assert.equal(classes.size, 0);
assert.equal(load(storage).api.get(), false);
for (const invalid of ['false', 'on', '1', '{broken']) {
    saved.set(key, invalid);
    assert.equal(load(storage).api.get(), false, 'only explicit true enables the frame');
}
({ api, classes } = load({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } }));
assert.equal(api.get(), false);
api.set(true);
assert(classes.has('comfort-frame-enabled'), 'unavailable storage does not prevent toggling');
api.set(false);
assert.equal(classes.size, 0);
console.log('Comfort frame passed: default off, persistence, invalid saved values, unavailable storage.');
