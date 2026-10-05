const assert = require('node:assert/strict');
const { MenuPreview } = require('../menu-ui.js');
const menu = new MenuPreview();
assert.throws(() => menu.setName('　 '));
menu.setName('  Player  ');
assert.equal(menu.name, 'Player');
for (const stage of ['any', '1', '2', '3']) {
    const room = menu.quickMatch(stage);
    assert.equal(room.visibility, 'public');
    if (stage !== 'any') assert.equal(room.stage, stage);
    assert.equal(room.members.length, 4);
    assert.equal(room.members[room.selfSlot], 'Player');
    assert.equal(room.owner, false);
    const members = [...room.members];
    menu.toggleCpu(2);
    assert.deepEqual(room.members, members, 'guests cannot manage CPU slots');
    menu.leave();
}
assert.throws(() => menu.joinPassword('wrong'));
assert.equal(menu.joinPassword(' CORE ').visibility, 'private');
assert.throws(() => menu.join({ members: ['A', 'B', 'C', 'CPU'] }));
assert.throws(() => menu.create({ stage: '1', visibility: 'private', password: ' ' }));
menu.create({ stage: '2', visibility: 'private', password: 'test' });
assert.deepEqual(menu.room.members, ['Player', null, null, null]);
menu.toggleCpu(1);
assert.equal(menu.room.members[1], 'CPU');
menu.toggleCpu(1);
assert.equal(menu.room.members[1], null);
menu.toggleCpu(0);
assert.equal(menu.room.members[0], 'Player');
for (const slot of [1, 2, 3]) menu.toggleCpu(slot);
assert.deepEqual(menu.room.members, ['Player', 'CPU', 'CPU', 'CPU']);
menu.toggleCpu(2);
assert.deepEqual(menu.room.members, ['Player', 'CPU', null, 'CPU']);
menu.leave();
assert.equal(menu.room, null);
menu.rooms = menu.rooms.filter(room => room.visibility === 'private');
assert.throws(() => menu.quickMatch('any'), /公開ルーム/);
console.log('Menu preview checks passed: name, matching, passwords, capacity, host permissions, manual CPU management');

// Exercise actual screen rendering and delegated form/click handlers without a server.
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/menu-ui.js', 'utf8');
function mount(saved = {}) {
    const handlers = {};
    const fields = new Map();
    const storage = new Map(Object.entries(saved));
    let now = 1000;
    let timer;
    const field = selector => {
        if (!fields.has(selector)) fields.set(selector, { dataset: {}, textContent: '', focus() {},
            querySelector: () => field('password-input') });
        return fields.get(selector);
    };
    const root = { innerHTML: '', addEventListener: (name, handler) => handlers[name] = handler,
        querySelector: selector => field(selector) };
    const context = {
        document: { querySelector: () => root, activeElement: null },
        location: { search: '' }, URLSearchParams,
        localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, String(value)) },
        FormData: class { constructor(form) { this.data = form.data; } get(key) { return this.data[key] ?? null; } has(key) { return key in this.data; } },
        Date: { now: () => now }, setInterval: callback => timer = callback,
        WebSocket: () => { throw new Error('UI must not connect to server'); },
        fetch: () => { throw new Error('UI must not request server data'); }
    };
    vm.runInNewContext(source, context);
    return { root, storage, field,
        submit: (name, data) => handlers.submit({ preventDefault() {}, target: { dataset: { form: name }, data } }),
        click: (action, slot) => handlers.click({ target: { closest: () => ({ dataset: { action, slot } }) } }),
        change: target => handlers.change({ target }),
        tick: time => { now = time; timer?.(); }
    };
}
const ui = mount();
assert.match(ui.root.innerHTML, /ゲストプレイヤー名/);
ui.submit('guest', { name: '   ' });
assert.match(ui.field('#ui-message').textContent, /名を入力/);
ui.submit('guest', { name: '<Guest>' });
ui.click('settings');
assert.match(ui.root.innerHTML, /&lt;Guest&gt;/);
ui.click('home');
assert.equal(ui.storage.get('core-defense-guest-name'), '<Guest>');
assert.match(mount(Object.fromEntries(ui.storage)).root.innerHTML, /メインメニュー/);
ui.click('create');
assert.doesNotMatch(ui.root.innerHTML, /autoFill|自動補充|秒後/);
ui.change({ name: 'visibility', value: 'private' });
assert.equal(ui.field('#ui-create-password').hidden, false);
assert.equal(ui.field('password-input').required, true);
ui.submit('create', { stage: '3', visibility: 'private', password: '<phrase>' });
assert.match(ui.root.innerHTML, /&lt;phrase&gt;/);
assert.doesNotMatch(ui.root.innerHTML, /ui-auto-fill|ui-countdown|自動補充/);
assert.equal((ui.root.innerHTML.match(/<li class=/g) || []).length, 4);
assert.match(ui.root.innerHTML, /data-action="start" disabled/);
ui.click('cpu', '1');
assert.match(ui.root.innerHTML, /CPUを削除/);
ui.tick(61000);
assert.match(ui.root.innerHTML, /data-action="start" disabled/);
assert.equal((ui.root.innerHTML.match(/is-empty/g) || []).length, 2);
ui.click('cpu', '2');
ui.click('cpu', '3');
assert.doesNotMatch(ui.root.innerHTML, /data-action="start" disabled/);
ui.click('cpu', '2');
ui.tick(121000);
assert.match(ui.root.innerHTML, /data-action="start" disabled/);
assert.equal((ui.root.innerHTML.match(/is-empty/g) || []).length, 1);
ui.click('cpu', '2');
ui.click('start');
assert.match(ui.field('#ui-message').textContent, /ゲームは開始しません/);
ui.click('leave');
ui.click('password');
ui.submit('password', { password: 'wrong' });
assert.match(ui.field('#ui-message').textContent, /見つかりません/);
ui.submit('password', { password: 'CORE' });
assert.doesNotMatch(ui.root.innerHTML, /data-action="cpu"/);
assert.match(ui.root.innerHTML, /data-action="ready"/);
ui.click('ready');
assert.match(ui.root.innerHTML, /準備完了/);
ui.click('leave');
ui.click('settings');
assert.doesNotMatch(ui.root.innerHTML, /CPU補充|name="wait"/);
ui.submit('settings', { name: 'NewName' });
assert.equal(ui.storage.get('core-defense-guest-name'), 'NewName');
ui.click('quick');
assert.match(ui.root.innerHTML, /どれでも/);
ui.submit('quick', { stage: '2' });
assert.match(ui.root.innerHTML, /ステージ2/);
assert.match(ui.root.innerHTML, /公開ルーム/);
console.log('Menu screen checks passed: forms, storage, escaping, navigation, manual CPU slots, host/guest controls');
