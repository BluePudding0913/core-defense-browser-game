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
assert.equal(settings.getMaxFps(), 60);
settings.setMaxFps(30);
assert.equal(load().getMaxFps(), 30, '30 FPS survives reload');
settings.setMaxFps('60');
assert.equal(load().getMaxFps(), 60, '60 FPS can be restored');
for (const value of ['', '0', '120', 'NaN', '{broken']) {
    saved.set('core-defense-max-fps', value);
    assert.equal(load().getMaxFps(), 60, 'invalid FPS storage retains the default');
    settings.setMaxFps(value);
    assert.equal(settings.getMaxFps(), 60, 'unsupported FPS falls back to 60');
}
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
assert.equal(settings.getMaxFps(), 60);
settings.setMaxFps('30');
assert.equal(settings.getMaxFps(), 30, 'FPS switching works without storage');
assert.equal(settings.getShadows(), true);
settings.setShadows(false);
assert.equal(settings.getShadows(), false, 'unavailable storage does not prevent switching');
settings.setShadows(true);
assert.equal(settings.getShadows(), true);
console.log('Graphics settings passed: defaults, persistence, restoration and unavailable storage.');

saved.clear();
settings = load();
assert.equal(settings.getFov(), 72);
assert.equal(settings.setFov(90), 90);
assert.equal(load().getFov(), 90);
assert.equal(settings.setFov(999), 110);
assert.equal(settings.setFov(0), 60);
for (const value of ['', 'broken', 'NaN', 'Infinity']) {
    saved.set('core-defense-fov', value);
    assert.equal(load().getFov(), 72);
}
settings = load({getItem() {throw Error('blocked');}, setItem() {throw Error('blocked');}});
assert.equal(settings.getFov(), 72);
assert.equal(settings.setFov(95), 95);
