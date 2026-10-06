const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const handlers = {}, commands = [];
class HTMLInputElement {}
class HTMLTextAreaElement {}
const context = vm.createContext({
    window: { addEventListener: (type, handler) => { handlers[type] = handler; } },
    HTMLInputElement, HTMLTextAreaElement,
    exitDialog: { open: false }, howToMenu: { classList: { contains: () => true } },
    state: { phase: 'wave' }, keys: new Set(), joystick: null,
    localMove: {}, localFacing: 0, quantizeFacing: () => 0,
    send: command => commands.push(command),
});
vm.runInContext(fs.readFileSync('client/key-settings.js', 'utf8'), context);
vm.runInContext(source.slice(source.indexOf('let lastMove ='), source.indexOf('window.addEventListener("blur",')), context);
function key(type, overrides) {
    handlers[type]({ key: 'Process', code: 'KeyW', target: null, preventDefault() {}, ...overrides });
}
key('keydown');
assert.equal(commands.at(-1), 'MOVE:0.00:-1.00', 'IME Process still moves with W');
key('keyup', { key: 'w' });
assert.equal(commands.at(-1), 'MOVE:0.00:0.00', 'changing IME state releases movement');
key('keydown', { key: 'ｗ' });
assert.equal(commands.at(-1), 'MOVE:0.00:-1.00', 'full-width input still moves');
key('keyup', { target: new HTMLInputElement() });
assert.equal(commands.at(-1), 'MOVE:0.00:0.00', 'focus changes do not leave movement held');
const count = commands.length;
key('keydown', { target: new HTMLInputElement() });
key('keydown', { target: new HTMLTextAreaElement() });
key('keydown', { target: { isContentEditable: true } });
assert.equal(commands.length, count, 'typing does not control gameplay');
key('keydown', { key: 'ArrowRight', code: 'ArrowRight' });
assert.equal(commands.at(-1), 'MOVE:1.00:0.00');
key('keyup', { key: 'ArrowRight', code: 'ArrowRight' });
key('keydown', { key: 'W', code: '' });
assert.equal(commands.at(-1), 'MOVE:0.00:-1.00', 'key fallback supports missing code');
key('keyup', { key: 'W', code: '' });
let focused = false, captured = false;
context.canvas = {
    addEventListener: (type, handler) => { handlers[type] = handler; },
    focus: () => { focused = true; }, setPointerCapture: () => { captured = true; },
};
context.getMe = () => ({});
context.startFiring = () => assert(focused && captured, 'canvas takes focus before shooting');
const pointerStart = source.indexOf('canvas.addEventListener("pointerdown",');
vm.runInContext(source.slice(pointerStart, source.indexOf('canvas.addEventListener("pointermove",', pointerStart)), context);
handlers.pointerdown({ pointerType: 'mouse', button: 0, pointerId: 1 });
assert(focused);
assert.match(fs.readFileSync('client/index.html', 'utf8'), /<canvas id="game" tabindex="-1"/);
console.log('Keyboard input passed: IME, release, typing, arrows, fallback, canvas focus');
