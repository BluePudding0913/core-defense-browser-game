const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync('client/reconnect-session.js', 'utf8');
const persistent = new Map();
function storage(map) {
    return { getItem: key => map.get(key) ?? null,
        setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) };
}
function tab(search = '', localStorage = storage(persistent), sessionStorage = storage(new Map())) {
    const context = { window: {}, location: { search }, URLSearchParams, Uint8Array,
        crypto: webcrypto, localStorage, sessionStorage };
    vm.runInNewContext(source, context);
    return context.window.coreReconnect;
}
const first = tab();
const firstId = first.session();
assert.match(firstId, /^[a-f0-9]{48}$/);
assert.equal(first.session(), firstId);
first.remember(firstId, 'room123', '友達', 'Host');
const reopened = tab();
assert.notEqual(reopened.session(), firstId, 'opening a new tab must not steal the active player');
assert.equal(reopened.saved().sessionId, firstId, 'browser restart retains the resume credential');
assert.equal(reopened.saved().phrase, '友達');
assert.equal(reopened.adopt(reopened.saved().sessionId), firstId);
assert.equal(reopened.session(), firstId, 'explicit resume persists across reloads');
assert.equal(tab('?serverPort=9999').saved(), null, 'isolate game servers');
const otherId = first.newSession();
assert.notEqual(otherId, firstId);
first.forget(otherId, 'room123');
assert(reopened.saved(), 'a replaced tab cannot erase the new owner resume information');
reopened.forget(firstId, 'room123');
assert.equal(first.saved(), null, 'explicit exit clears persistent resume information');
const oldTab = tab('', storage(persistent), storage(new Map([['core-defense-session', 'existing-session-123']])));
assert.equal(oldTab.session(), 'existing-session-123', 'retain existing tab sessions during upgrade');
persistent.set('core-defense-return-room:8887', '{broken');
assert.equal(tab().saved(), null);
persistent.set('core-defense-return-room:8887', JSON.stringify({ sessionId: firstId, roomId: '../bad', phrase: '', name: '' }));
assert.equal(tab().saved(), null);
const denied = { getItem() { throw new Error('disabled'); }, setItem() { throw new Error('disabled'); }, removeItem() { throw new Error('disabled'); } };
const privateTab = tab('', denied, denied);
assert.match(privateTab.session(), /^[a-f0-9]{48}$/);
assert.equal(privateTab.saved(), null);
assert.doesNotThrow(() => privateTab.remember(firstId, 'room123', '', 'Host'));
console.log('Browser resume storage passed: reopen, independent tabs, adoption/exit, ports, migration, disabled storage');
