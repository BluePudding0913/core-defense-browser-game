const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const handlers = {}, fields = new Map(), calls = [];
const field = selector => {
    if (!fields.has(selector)) fields.set(selector, { textContent: '', focus() {} });
    return fields.get(selector);
};
let markup = '', renderCount = 0;
const matchButton = { disabled: true };
const input = { value: '', focus() {} };
let activeForm;
const root = { get innerHTML() { return markup; }, set innerHTML(value) {
    markup = value; renderCount++;
    const formType = markup.match(/data-form="([^"]+)"/)?.[1];
    input.value = markup.match(/value="([^"]*)"/)?.[1] || '';
    activeForm = formType ? { dataset: { form: formType },
        querySelector: selector => selector === 'input' ? input : matchButton } : null;
},
    hidden: false, querySelector: selector => selector === '.ui-search-result' && !markup.includes('ui-search-result') ? null : field(selector),
    querySelectorAll: selector => selector === 'form' && activeForm ? [activeForm] : [],
    addEventListener: (event, handler) => handlers[event] = handler };
const body = { classList: { add() {}, remove() {}, toggle() {} }, append(script) { assert.equal(script.src, 'app.js'); } };
const context = { document: { querySelector: () => root, body, createElement: () => ({}) },
    location: { search: '' }, URLSearchParams, localStorage: { getItem() {}, setItem() {} },
    FormData: class { constructor(form) { this.data = form.data; } get(key) { return this.data[key]; } },
    window: { coreGame: { match: (...args) => calls.push(args), send: command => calls.push(command), leave: () => calls.push('leave') } } };
vm.runInNewContext(fs.readFileSync('client/menu-ui.js', 'utf8'), context);
const submit = (form, data = {}) => handlers.submit({ preventDefault() {}, target: { dataset: { form }, data } });
const click = (action, slot) => handlers.click({ target: { closest: () => ({ dataset: { action, slot } }) } });
function edit(value) { input.value = value; handlers.input({ target: input }); }
function assertEmptyGating(label, valid = '入力') {
    for (const value of ['', '　 ']) {
        edit(value);
        assert(matchButton.disabled, `${label}: blank and whitespace-only inputs disable confirmation`);
    }
    edit(valid);
    assert(!matchButton.disabled, `${label}: typing enables confirmation`);
}
function assertInputSurvivesReconnects(label, hasMatchButton = false) {
    const before = renderCount;
    for (let attempt = 0; attempt < 3; attempt++) {
        context.window.coreMenu.disconnected();
        if (hasMatchButton) assert(matchButton.disabled, `${label}: disable matching while disconnected`);
        context.window.coreMenu.connected();
        if (hasMatchButton) assert(!matchButton.disabled, `${label}: enable matching after reconnect`);
        context.window.coreMenu.status('connection error');
    }
    assert.equal(renderCount, before, `${label}: preserve the input DOM, draft, focus, selection and composition`);
}
assert.match(root.innerHTML, /ゲストプレイヤー名/);
assert.match(root.innerHTML, /placeholder="ゲストプレイヤー名"/);
assert.match(root.innerHTML, /<button>決定<\/button>/);
assert.doesNotMatch(root.innerHTML, /<label|\brequired\b/);
assert(matchButton.disabled, 'initial empty name disables confirmation');
assertEmptyGating('initial player name');
assertInputSurvivesReconnects('initial player name');
submit('name', { name: ' ' });
assert.doesNotMatch(root.innerHTML, /ui-message/);
submit('name', { name: '<Host>' });
assert.match(root.innerHTML, /クイックマッチ/);
assert.match(root.innerHTML, />合言葉</);
assert.doesNotMatch(root.innerHTML, /ルーム作成|ルーム検索/);
click('phrase');
assert.doesNotMatch(root.innerHTML, /<h2>/, 'passphrase menu has no heading');
assert.match(root.innerHTML, /ルーム作成/);
assert.match(root.innerHTML, /ルーム検索/);
click('create');
assert.doesNotMatch(root.innerHTML, /<h2>/, 'creation form has no heading');
assert.match(root.innerHTML, /name="password"[^>]*placeholder="合言葉"/);
assert.doesNotMatch(root.innerHTML, /<label|\brequired\b/);
assert.doesNotMatch(root.innerHTML, /visibility|公開/);
context.window.coreMenu.connected();
assert(matchButton.disabled, 'connecting does not enable an empty password');
assertEmptyGating('create room password');
assertInputSurvivesReconnects('create room password', true);
submit('create', { password: ' ' });
assert.equal(calls.length, 0, 'blank input quietly stays on the form');
submit('create', { password: ' 合言葉<&> ' });
assert(matchButton.disabled, 'disable matching while the request is pending');
submit('create', { password: 'duplicate' });
assert.deepEqual(calls, [['create', '合言葉<&>', '<Host>']]);
assert.doesNotMatch(root.innerHTML, /ui-members/, 'must wait for server response');
const state = { phase: 'lobby', privateRoom: true, roomOwnerId: 'p1', allReady: true,
    players: [1, 2, 3, 4].map(i => ({ id: 'p' + i, name: i === 1 ? '<Host>' : 'CPU', human: i === 1, ready: false })) };
context.window.coreMenu.snapshot(state, 'p1');
assert.match(root.innerHTML, /&lt;Host&gt;<\/strong><span>host<\/span>/);
assert.doesNotMatch(root.innerHTML, / · HOST/);
assert.doesNotMatch(root.innerHTML, /CORE DEFENSE|クイックマッチ|合言葉|ホスト設定|data-action="cpu"|空席|CPU/);
assert.equal((root.innerHTML.match(/class="room-member/g) || []).length, 1);
assert.doesNotMatch(root.innerHTML, /data-action="start" disabled/, 'host can start with automatic CPU fill');
click('start'); assert.equal(calls.at(-1), 'START');
context.window.coreMenu.snapshot({ ...state, phase: 'preparing' }, 'p1');
assert(root.hidden);
state.privateRoom = false;
state.players[1].human = true; state.players[1].name = 'Guest'; state.allReady = false;
context.window.coreMenu.snapshot(state, 'p1');
assert(!root.hidden);
assert.match(root.innerHTML, /data-action="start" disabled/, 'host must wait for human guests');
context.window.coreMenu.snapshot(state, 'p2');
assert.doesNotMatch(root.innerHTML, /data-action="start"|data-action="cpu"/);
click('ready'); assert.equal(calls.at(-1), 'ROOM_READY:1');
state.players[1].ready = true; state.allReady = true;
context.window.coreMenu.snapshot(state, 'p1');
assert.match(root.innerHTML, /room-member ready[\s\S]*準備完了/);
state.roomOwnerId = 'p2';
context.window.coreMenu.snapshot(state, 'p2');
assert.match(root.innerHTML, /Guest<\/strong><span>host<\/span>/);
assert.match(root.innerHTML, /data-action="start"/);
context.window.coreMenu.disconnected('切断されました');
assert.match(root.innerHTML, /data-action="start" disabled/);
click('leave'); assert.equal(calls.at(-1), 'leave');
context.window.coreMenu.connected();
const beforeQuick = calls.length;
click('quick');
assert.equal(calls.length, beforeQuick + 1, 'one click immediately starts matching');
assert.match(root.innerHTML, /メインメニュー/);
assert.doesNotMatch(root.innerHTML, /検索して参加|空いているルームへ参加/);
click('quick');
assert.equal(calls.length, beforeQuick + 1, 'ignore duplicate clicks while matching');
assert.deepEqual(calls.at(-1), ['quick', '', '<Host>']);
context.window.coreMenu.status('満員'); context.window.coreMenu.rejected();
assert.match(root.innerHTML, /クイックマッチ/);
assert.match(root.innerHTML, /接続できません/);
assert.match(root.innerHTML, /再試行/);
click('home');
assert.doesNotMatch(root.innerHTML, /接続できません/);
const originalMatch = context.window.coreGame.match;
context.window.coreGame.match = () => { throw new Error('サーバーへの接続を待ってください'); };
click('quick');
assert.match(root.innerHTML, /接続できません/);
assert.doesNotMatch(root.innerHTML, /ui-message|サーバーへの接続を待ってください/);
click('home');
context.window.coreGame.match = originalMatch;
click('quick');
context.window.coreMenu.disconnected('ルーム一覧から切断されました。再接続します…');
assert.match(root.innerHTML, /接続できません/);
assert.doesNotMatch(root.innerHTML, /ルーム一覧から切断|ui-message/);
click('home');
context.window.coreMenu.connected();
click('phrase'); click('search');
assert.doesNotMatch(root.innerHTML, /<h2>/, 'search heading is replaced by results');
const result = field('.ui-search-result');
assert.equal(result.textContent, '', 'result space is empty before searching');
assert.match(root.innerHTML, />決定<\/button>/);
assert.doesNotMatch(root.innerHTML, /検索して参加|<label|\brequired\b/);
assert(matchButton.disabled, 'search starts with disabled confirmation');
assertEmptyGating('search room password');
assertInputSurvivesReconnects('search room password', true);
const beforeRejection = renderCount;
context.window.coreMenu.phrase = '合言葉';
context.window.coreMenu.rejected();
assert.equal(renderCount, beforeRejection, 'preserve search password when room entry is rejected');
context.window.coreMenu.connected();
const error = '参加できるルームが見つかりません。合言葉・満員・プレイ中でないか確認してください';
context.window.coreMenu.status(error);
assert.equal(result.textContent, '見つかりませんでした');
assert(!result.hidden);
assert.equal(renderCount, beforeRejection, 'results do not replace the input DOM');
context.window.coreMenu.connected();
assert.equal(result.textContent, '見つかりませんでした', 'reconnection preserves the result');
edit('別の合言葉');
assert.equal(result.textContent, '', 'editing clears the old result');
submit('search', { password: '別の合言葉' });
assert.equal(result.textContent, '検索中…');
assert(!result.hidden);
assert(matchButton.disabled);
context.window.coreMenu.status('<接続エラー>');
assert.equal(result.textContent, '<接続エラー>', 'errors are rendered as text');
assert(!matchButton.disabled, 'failed search allows retry');
submit('search', { password: '別の合言葉' });
context.window.coreMenu.disconnected();
assert.equal(result.textContent, '接続できません', 'disconnection ends the searching message');
assert(matchButton.disabled);
context.window.coreMenu.connected();
click('phrase');
assert.doesNotMatch(root.innerHTML, /参加できるルームが見つかりません/);
click('create');
assert.doesNotMatch(root.innerHTML, /参加できるルームが見つかりません/);
context.window.coreMenu.status(error);
click('phrase'); click('search');
assert.equal(result.textContent, '', 'reopening search clears its previous result');
click('home'); click('settings');
assert(!matchButton.disabled, 'saved name enables confirmation even without a connection');
assertEmptyGating('saved player name settings', '<Host>');
assertInputSurvivesReconnects('saved player name settings');
assert.doesNotMatch(root.innerHTML, /参加できるルームが見つかりません/);
context.window.coreMenu.status(error);
submit('name', { name: 'Host' });
assert.doesNotMatch(root.innerHTML, /参加できるルームが見つかりません/);
console.log('Live menu passed: navigation, server requests, snapshots, permissions, disconnect, gameplay');
