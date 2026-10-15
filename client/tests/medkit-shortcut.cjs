const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const commands = [];
let handler;
const me = { hp: 40, medkits: 2, down: false };
const context = vm.createContext({
    exitDialog: { open: false },
    window: { addEventListener: (name, fn) => { handler = fn; } },
    isTypingTarget: target => target?.typing,
    howToMenu: { classList: { contains: () => true } },
    actionMenu: { classList: { contains: () => true } },
    inventoryMenu: { classList: { contains: () => true } },
    menu: { classList: { contains: () => true } },
    state: { phase: 'wave' }, getMe: () => me,
    send: command => commands.push(command),
});
const start = source.indexOf('window.addEventListener("keydown"');
vm.runInContext(fs.readFileSync('client/key-settings.js', 'utf8'), context);
const uiStart = source.indexOf('function gameplayUiOpen()');
vm.runInContext(source.slice(uiStart, source.indexOf('\nfunction ', uiStart + 1)), context);
const end = source.indexOf('window.addEventListener("keyup"', start);
vm.runInContext(source.slice(start, end), context);
function press(overrides = {}) {
    handler({ key: 'h', repeat: false, target: null, preventDefault() {}, ...overrides });
}
press(); press({ key: 'H' });
assert.deepEqual(commands, ['USE:medkit', 'USE:medkit']);
commands.length = 0;
press({ repeat: true }); press({ target: { typing: true } });
me.hp = 100; press();
me.hp = 40; me.medkits = 0; press();
me.medkits = 2; me.down = true; press();
me.down = false; context.state.phase = 'lobby'; press();
context.state.phase = 'lost'; press();
assert.equal(commands.length, 0);
context.state.phase = 'preparing'; press();
assert.deepEqual(commands, ['USE:medkit']);
commands.length = 0;
assert(context.window.coreKeySettings.setMedkit('Q'));
press(); press({ key: 'q' }); press({ key: 'Q' });
assert.deepEqual(commands, ['USE:medkit', 'USE:medkit']);
commands.length = 0; me.maxHp = 150; me.hp = 120;
press({ key: 'q' }); assert.deepEqual(commands, ['USE:medkit']);
me.hp = 150; press({ key: 'q' }); assert.equal(commands.length, 1);
commands.length = 0; me.hp = 40;
for (const name of ['actionMenu', 'inventoryMenu', 'howToMenu', 'menu']) {
    context[name].classList.contains = () => false;
    press({ key: 'q' });
    assert.equal(commands.length, 0, name + ' blocks healing');
    context[name].classList.contains = () => true;
}
context.exitDialog.open = true; press({ key: 'q' }); context.exitDialog.open = false;
context.window.coreMenu = { settingsOpen: () => true }; press({ key: 'q' });
context.window.coreMenu.settingsOpen = () => false;
context.window.JobUI = { isConfirming: () => true }; press({ key: 'q' });
context.window.JobUI.isConfirming = () => false;
me.missileControl = true; press({ key: 'q' }); me.missileControl = false;
assert.equal(commands.length, 0, 'dialogs, settings and missile control block healing');
press({ key: 'q' }); assert.deepEqual(commands, ['USE:medkit'], 'closing UI restores healing');
console.log('Medkit shortcut checks passed');
