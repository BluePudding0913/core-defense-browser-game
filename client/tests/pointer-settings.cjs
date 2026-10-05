const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/pointer-settings.js', 'utf8');
function load(stored, unavailable = false) {
    const styles = new Map();
    const context = { window: {}, document: { documentElement: { style: {
        setProperty: (key, value) => styles.set(key, value)
    } } }, localStorage: {
        getItem() { if (unavailable) throw Error('blocked'); return stored; },
        setItem(key, value) { if (unavailable) throw Error('blocked'); stored = value; }
    } };
    vm.runInNewContext(source, context);
    return { api: context.window.corePointerSettings, styles, stored: () => stored };
}
const initial = load(null);
assert.equal(initial.styles.get('--pointer-color'), '#0078ff');
assert.equal(initial.styles.get('--pointer-size'), '6px');
initial.api.update({ color: '#FFAA00', size: 21 });
assert.equal(initial.styles.get('--pointer-color'), '#ffaa00');
const cursor = initial.styles.get('--game-pointer');
assert.match(cursor, /\) 13.5 13.5, crosshair$/);
const svg = decodeURIComponent(cursor.match(/data:image\/svg\+xml,([^" ]+)/)[1]);
assert.match(svg, /width="27" height="27"/);
assert.match(svg, /cx="13.5" cy="13.5" r="10.5" fill="#ffaa00"/);
const reloaded = load(initial.stored());
assert.equal(reloaded.styles.get('--pointer-color'), '#ffaa00');
assert.equal(reloaded.styles.get('--pointer-size'), '21px');
const copy = reloaded.api.get(); copy.size = 100;
assert.equal(reloaded.api.get().size, 21);
for (const stored of ['{broken', 'null', JSON.stringify({ color: 'url(bad)', size: '32' })]) {
    const settings = load(stored);
    assert.equal(settings.styles.get('--pointer-color'), '#0078ff');
    assert.equal(settings.styles.get('--pointer-size'), '6px');
}
reloaded.api.update({ size: 100 });
assert.equal(reloaded.api.get().size, 32);
reloaded.api.update({ size: -1 });
assert.equal(reloaded.api.get().size, 4);
reloaded.api.update({ size: NaN });
assert.equal(reloaded.api.get().size, 6);
const blocked = load(null, true);
blocked.api.update({ color: '#ffffff', size: 32 });
assert.equal(blocked.styles.get('--pointer-size'), '32px');
assert.equal(blocked.styles.get('--pointer-color'), '#ffffff');
console.log('Pointer preferences passed: defaults, live cursor, persistence, validation and unavailable storage');
