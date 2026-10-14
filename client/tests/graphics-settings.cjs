const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/graphics-settings.js', 'utf8');
const saved = new Map();
const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
function load(localStorage = storage) {
    const window = {};
    vm.runInNewContext(source, { window, localStorage });
    return window.coreGraphicsSettings;
}
let settings = load();
assert.equal(settings.getShadows(), true);
settings.setShadows(false);
assert.equal(load().getShadows(), false, 'shadow-free mode survives reload');
settings.setShadows(true);
assert.equal(load().getShadows(), true, 'shadows can be restored');
for (const value of ['', 'off', '0', '{broken']) {
    saved.set('core-defense-shadows', value);
    assert.equal(load().getShadows(), true, 'invalid storage retains the default');
}
settings = load({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
assert.equal(settings.getShadows(), true);
settings.setShadows(false);
assert.equal(settings.getShadows(), false, 'unavailable storage does not prevent switching');
settings.setShadows(true);
assert.equal(settings.getShadows(), true);
console.log('Graphics settings passed: defaults, persistence, restoration and unavailable storage.');
