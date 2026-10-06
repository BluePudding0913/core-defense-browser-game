const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/key-settings.js', 'utf8');
function load(stored, blocked = false) {
    const context = { window: {}, localStorage: {
        getItem() { if (blocked) throw Error('blocked'); return stored; },
        setItem(key, value) { if (blocked) throw Error('blocked'); stored = value; },
    } };
    vm.runInNewContext(source, context);
    return { api: context.window.coreKeySettings, stored: () => stored };
}
const settings = load(null);
assert.equal(settings.api.getMedkit(), 'h');
assert(settings.api.setMedkit('Q'));
assert.equal(load(settings.stored()).api.getMedkit(), 'q');
for (const key of ['w', 'a', 's', 'd', 'e', 'r', '1', '9', 'Shift', 'Escape', 'ArrowUp', ' ', 'Tab']) {
    assert.equal(settings.api.setMedkit(key), false);
    assert.equal(settings.api.getMedkit(), 'q');
}
for (const key of ['j', '0', ';', 'F2']) assert(settings.api.setMedkit(key));
assert.equal(load('invalid').api.getMedkit(), 'h');
const blocked = load(null, true);
assert(blocked.api.setMedkit('q'));
assert.equal(blocked.api.getMedkit(), 'q');
console.log('Key settings checks passed');
