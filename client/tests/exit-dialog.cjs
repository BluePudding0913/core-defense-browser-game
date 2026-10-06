const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const handlers = {};
let exits = 0, frames = 0, draws = 0;
const dialog = { open: false, showModal() { this.open = true; },
    addEventListener(type, fn) { handlers[type] = fn; } };
const context = vm.createContext({
    document: { querySelector(selector) { return selector === '#exit-dialog' ? dialog
        : { addEventListener(type, fn) { handlers[type] = fn; } }; } },
    endInteractionHold() {}, keys: new Set(['w']), joystick: {}, dashKey: true,
    setDash() {}, pendingMove: null, firingPointer: null, sendMovement() {},
    leaveRoom() { exits++; }, window: { confirm() { throw Error('Blocking confirmation'); } },
    performance: { now: () => 100 }, lastFrameAt: 0, updateLocalPrediction() {},
    draw() { draws++; }, requestAnimationFrame() { frames++; },
});
vm.runInContext(source.slice(source.indexOf('const exitDialog ='), source.indexOf('let equipmentOrder =')), context);
const start = source.indexOf('function animate(');
vm.runInContext(source.slice(start, source.indexOf('\nfunction draw(', start)), context);
handlers.click();
assert(dialog.open);
assert.equal(context.keys.size, 0);
vm.runInContext('animate()', context);
assert.equal(draws, 1, 'confirmation leaves drawing active');
assert.equal(frames, 1, 'confirmation schedules the next frame');
handlers.close();
assert.equal(exits, 0, 'cancel keeps the player in the room');
dialog.returnValue = 'exit'; handlers.close();
assert.equal(exits, 1);
handlers.click(); handlers.close();
assert.equal(exits, 1, 'reopening resets the previous exit choice');
assert.match(fs.readFileSync('client/index.html', 'utf8'), /id="leave-game"[^>]*>EXIT<\/button>/);
assert.match(fs.readFileSync('client/menu-ui.js', 'utf8'), /button\("leave", "EXIT"\)/);
console.log('Exit confirmation passed: drawing, cancel, exit, reopen, input reset, labels');
