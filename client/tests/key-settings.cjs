const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/key-settings.js', 'utf8');
function load(stored, blocked = false) {
    const context = { window: {}, localStorage: {
        getItem(key) { if (key !== "core-defense-medkit-key") return null; if (blocked) throw Error('blocked'); return stored; },
        setItem(key, value) { if (blocked) throw Error('blocked'); stored = value; },
    } };
    vm.runInNewContext(source, context);
    return { api: context.window.coreKeySettings, stored: () => stored };
}
const settings = load(null);
assert.equal(settings.api.getMedkit(), 'c');
assert(settings.api.setMedkit('Q'));
assert.equal(load(settings.stored()).api.getMedkit(), 'q');
for (const key of ['w', 'a', 's', 'd', 'e', 'r', '1', '9', 'Shift', 'Escape', 'ArrowUp', ' ', 'Tab']) {
    assert.equal(settings.api.setMedkit(key), false);
    assert.equal(settings.api.getMedkit(), 'q');
}
for (const key of ['j', '0', ';', 'F2']) assert(settings.api.setMedkit(key));
assert.equal(load('invalid').api.getMedkit(), 'c');
const blocked = load(null, true);
assert(blocked.api.setMedkit('q'));
assert.equal(blocked.api.getMedkit(), 'q');
console.log('Key settings checks passed');

assert.equal(settings.api.getJobEffect(), "f");
assert.equal(settings.api.setMedkit("f"), false);
assert.equal(settings.api.setJobEffect("F2"), false);
assert.equal(settings.api.getDroneSelfDestruct(), "g");
assert.equal(settings.api.setJobEffect("g"), false);
assert.equal(settings.api.setJobEffect("j"), true);
assert.equal(settings.api.setMedkit("j"), false);
const savedKeys = new Map([
    ['core-defense-job-key','g'], ['core-defense-medkit-key','h'],
]);
const persisted = {window:{},localStorage:{getItem:key=>savedKeys.get(key),setItem:(key,value)=>savedKeys.set(key,value)}};
vm.runInNewContext(source,persisted);
assert.equal(persisted.window.coreKeySettings.getJobEffect(),'g', 'existing assignments survive the new default');
assert.equal(persisted.window.coreKeySettings.getDroneSelfDestruct(),'j');
assert(persisted.window.coreKeySettings.setDroneSelfDestruct('x'));
assert.equal(persisted.window.coreKeySettings.setMedkit('x'),false);
assert.equal(persisted.window.coreKeySettings.setJobEffect('x'),false);
vm.runInNewContext(source,persisted);
assert.equal(persisted.window.coreKeySettings.getDroneSelfDestruct(),'x', 'self-destruct binding survives restart');

assert.equal(load(null).api.getSniperStance(),'v');
assert.equal(settings.api.setSniperStance('w'),false);
assert.equal(settings.api.setSniperStance(settings.api.getMedkit()),false);
assert(settings.api.setSniperStance('v'));
assert.equal(settings.api.setJobEffect('v'),false);
assert.equal(settings.api.setDroneSelfDestruct('v'),false);
assert.equal(settings.api.setMedkit('v'),false);
savedKeys.set('core-defense-job-key','c');savedKeys.set('core-defense-sniper-stance-key','c');
vm.runInNewContext(source,persisted);
assert.equal(persisted.window.coreKeySettings.getJobEffect(),'c');
assert.equal(persisted.window.coreKeySettings.getSniperStance(),'v','Old bindings take priority over prone default');
assert(persisted.window.coreKeySettings.setSniperStance('b'));
vm.runInNewContext(source,persisted);
assert.equal(persisted.window.coreKeySettings.getSniperStance(),'b');

const oldProne = {window:{},localStorage:{getItem:key=>key==='core-defense-sniper-stance-key'?'c':null}};
vm.runInNewContext(source, oldProne);
assert.equal(oldProne.window.coreKeySettings.getSniperStance(), 'c', 'saved prone key takes priority over new medkit default');
assert.equal(oldProne.window.coreKeySettings.getMedkit(), 'h');
