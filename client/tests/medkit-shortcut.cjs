const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const commands = [];
let handler;
const me = { hp: 40, medkits: 2, down: false };
const context = vm.createContext({
    window: { addEventListener: (name, fn) => { handler = fn; } },
    isTypingTarget: target => target?.typing,
    howToMenu: { classList: { contains: () => true } },
    state: { phase: 'wave' }, getMe: () => me,
    send: command => commands.push(command),
});
const start = source.indexOf('window.addEventListener("keydown"');
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
console.log('Medkit shortcut checks passed');
