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
    exitDialog: { open: false }, actionMenu:{classList:{contains:()=>true}},inventoryMenu:{classList:{contains:()=>true}},menu:{classList:{contains:()=>true}}, howToMenu: { classList: { contains: () => true } },
    state: { phase: 'wave' }, keys: new Set(), joystick: null, predictedLocal: null,
    localMove: {}, localFacing: 0, quantizeFacing: () => 0, getMe: () => null,
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
context.window.coreMenu = { settingsOpen: () => true };
const settingsCommandCount = commands.length;
key('keydown', { key: 'w', code: 'KeyW' });
key('keydown', { key: 'r', code: 'KeyR' });
assert.equal(commands.length, settingsCommandCount, 'in-game settings block movement and interaction');
context.window.coreMenu.settingsOpen = () => false;
let settingsClosed=0;
context.window.coreMenu.closeSettings=()=>settingsClosed++;
context.window.coreMenu.settingsOpen=()=>true;
key('keydown',{code:'KeyE'});assert.equal(settingsClosed,1,'E also closes unfocused game settings');
context.window.coreMenu.settingsOpen=()=>false;
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
context.useJobAbility = () => commands.push('JOB_ABILITY');
commands.length = 0;
key('keydown', {code: 'KeyF'});
key('keydown', {code: 'KeyF', repeat: true});
key('keyup', {code: 'KeyF'});
assert.deepEqual(commands, ['JOB_ABILITY'], 'One press fires immediately, repeats and release do not fire again');
assert(context.window.coreKeySettings.setJobEffect('j'));
commands.length = 0;
key('keydown', {code: 'KeyF'}); key('keyup', {code: 'KeyF'});
assert(!commands.some(c => c.startsWith('JOB_')), 'old key is released after remapping');
commands.length = 0;
key('keydown', {code: 'KeyJ'}); key('keyup', {code: 'KeyJ'});
assert.deepEqual(commands, ['JOB_ABILITY']);
commands.length=0;
context.getMe=()=>({job:'drone',drone:{active:true,hp:45},down:false});
key('keydown',{code:'KeyG'}); key('keydown',{code:'KeyG',repeat:true});
assert.deepEqual(commands,['DRONE_SELF_DESTRUCT'], 'default G sends one command under IME');
assert(context.window.coreKeySettings.setDroneSelfDestruct('x'));
key('keydown',{code:'KeyG'}); assert.equal(commands.length,1);
key('keydown',{code:'KeyX'}); assert.equal(commands.at(-1),'DRONE_SELF_DESTRUCT');
context.getMe=()=>({job:'drone',drone:{active:true,hp:45},down:true});
const droneCount=commands.length; key('keydown',{code:'KeyX'}); assert.equal(commands.length,droneCount);
context.window.coreMenu.settingsOpen=()=>true; key('keydown',{code:'KeyX'}); assert.equal(commands.length,droneCount);
context.window.coreMenu.settingsOpen=()=>false;
let shopOpen = true, mapOpen = false;
context.actionMenu = {classList:{contains:()=>!shopOpen}};
context.closeActionMenu = () => {shopOpen=false;commands.push('CLOSE_SHOP');};
context.toggleInventory = () => commands.push('TOGGLE_INVENTORY');
context.getMe = () => ({missileControl:mapOpen});
commands.length=0;
key('keydown',{code:'KeyE'});assert.deepEqual(commands,['CLOSE_SHOP'],'E closes a shop without opening inventory');
key('keydown',{code:'KeyE',repeat:true});assert.equal(commands.length,1,'held E does not open another UI');
key('keydown',{code:'KeyE'});assert.equal(commands.at(-1),'TOGGLE_INVENTORY');
mapOpen=true;key('keydown',{code:'KeyE'});assert.equal(commands.at(-1),'COMPUTER','unfocused map also closes with E');
mapOpen=false;context.exitDialog.open=true;
context.exitDialog.close=value=>{assert.equal(value,'cancel');context.exitDialog.open=false;commands.push('CANCEL_EXIT');};
key('keydown',{code:'KeyE'});assert.equal(commands.at(-1),'CANCEL_EXIT');
const beforeTyping=commands.length;
key('keydown',{code:'KeyE',target:new HTMLInputElement()});assert.equal(commands.length,beforeTyping);

context.getMe=()=>({down:false});context.actionMenu={classList:{contains:()=>true}};context.inventoryMenu={classList:{contains:()=>true}};
key('keydown',{code:'Space',key:'Process',repeat:false});assert.equal(commands.at(-1),'JUMP');
const beforeJumpRepeat=commands.length;key('keydown',{code:'Space',key:' ',repeat:true});assert.equal(commands.length,beforeJumpRepeat,'Holding Space does not restart jump');
context.actionMenu.classList.contains=()=>false;key('keydown',{code:'Space',key:' ',repeat:false});assert.equal(commands.length,beforeJumpRepeat,'Menus block jumps');
// Every gameplay key stays blocked, including key repeats and an already-held move.
context.dashKey=false;context.dashRequested=false;context.pendingMove=null;context.setDash=active=>{context.dashRequested=active;commands.push('DASH:'+(active?1:0));};
context.clearTimeout=()=>{};
context.endInteractionHold=()=>{};context.closeActionMenu=()=>{};context.closeInventory=()=>{};
for(const panel of ['actionMenu','inventoryMenu','howToMenu','menu']) {
 for(const name of ['actionMenu','inventoryMenu','howToMenu','menu'])context[name]={classList:{contains:()=>name!==panel}};
 commands.length=0;context.keys.clear();
 for(const code of ['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','Digit1','KeyJ','KeyR'])key('keydown',{code,repeat:false});
 assert.equal(commands.length,0,panel+' blocks all gameplay commands');assert.equal(context.keys.size,0);
 context.keys.add('w');context.sendMovement(true);assert.equal(commands.at(-1),'MOVE:0.00:0.00','Held movement cannot leak through '+panel);
}
for(const name of ['actionMenu','inventoryMenu','howToMenu','menu'])context[name]={classList:{contains:()=>true}};
context.keys.add('w');context.dashRequested=true;context.dashKey=true;context.joystick={x:40,y:0,originX:0,originY:0};
context.sendMovement(true);context.stopGameplayMovement();assert.equal(context.keys.size,0);assert.equal(context.joystick,null);assert.equal(context.dashRequested,false);assert.equal(commands.at(-1),'MOVE:0.00:0.00','UI opening immediately cancels held movement and dash');
console.log('UI input isolation passed: inventory, shops, instructions, menus, jump/dash/abilities, held movement and immediate stop');
// Use the real Scout ability path through the keyboard handler, including remapping and UI gates.
const extractFunction = name => {
    const start = source.indexOf('function ' + name + '(');
    return source.slice(start, source.indexOf('\nfunction ', start + 1));
};
vm.runInContext(extractFunction('useJobAbility'), context);
vm.runInContext(extractFunction('requestScoutDash'), context);
const scout = {job:'scout',stamina:100,scoutDashStamina:20,credits:1000};
context.getMe=()=>scout;
context.aimPointer=null;
context.worldFromScreen=()=>({x:1500,y:1900});
assert(context.window.coreKeySettings.setJobEffect('f'));
commands.length=0;
key('keydown',{code:'KeyF'});key('keydown',{code:'KeyF',repeat:true});key('keyup',{code:'KeyF'});
assert.deepEqual(commands,['SCOUT_DASH:1500.0:1900.0'],'default F dashes once toward the FPS aim');
assert(context.window.coreKeySettings.setJobEffect('j'));
commands.length=0;
key('keydown',{code:'KeyF'});key('keyup',{code:'KeyF'});
assert(!commands.some(c=>c.startsWith('SCOUT_DASH:')),'old key no longer dashes');
context.aimPointer={x:320,y:240};
context.worldFromScreen=(x,y)=>({x,y});
key('keydown',{code:'KeyJ'});
assert.equal(commands.at(-1),'SCOUT_DASH:320.0:240.0','remapped key uses the cursor in the overhead view');
const scoutCount=commands.length;
for(const blocked of [{down:true},{movingCore:true},{selectedBuild:'block'},{stamina:19},{railgunCharge:1},{missileControl:true}]) {
    const previous={...scout};Object.assign(scout,blocked);key('keydown',{code:'KeyJ'});
    assert.equal(commands.length,scoutCount);
    Object.keys(scout).forEach(key=>delete scout[key]);Object.assign(scout,previous);
}
for(const panel of ['actionMenu','inventoryMenu','howToMenu','menu']) {
    context[panel].classList.contains=()=>false;key('keydown',{code:'KeyJ'});
    assert.equal(commands.length,scoutCount,panel+' blocks Scout dash');
    context[panel].classList.contains=()=>true;
}
context.window.coreMenu.settingsOpen=()=>true;key('keydown',{code:'KeyJ'});
context.window.coreMenu.settingsOpen=()=>false;
key('keydown',{code:'KeyJ',target:new HTMLInputElement()});
context.exitDialog.open=true;key('keydown',{code:'KeyJ'});context.exitDialog.open=false;
context.state.phase='lobby';key('keydown',{code:'KeyJ'});context.state.phase='wave';
assert.equal(commands.length,scoutCount,'settings, typing, exit dialog and lobby block Scout dash');
scout.scoutDashRemaining=.2;key('keydown',{code:'KeyJ'});
assert.equal(commands.length,scoutCount+1,'another press can restart an active dash');
console.log('Scout keyboard passed: F, remapping, IME, aim, repeat, active dash and gameplay/UI restrictions');
let inventoryOpen=false;
let inventoryRefreshes=0;
context.updateInventory=me=>{assert.deepEqual(me,context.getMe());inventoryRefreshes++;};
Object.assign(context,{fpsInput:null,firingPointer:null,secondaryHeld:false,closeInventoryPopover(){},endInteractionHold(){},closeActionMenu(){},closeInventory(){inventoryOpen=false;}});
context.inventoryMenu={classList:{contains:()=>!inventoryOpen,remove:()=>{inventoryOpen=true;}}};
const inventoryStart=source.indexOf('function toggleInventory(');
vm.runInContext(source.slice(inventoryStart,source.indexOf('\nfunction ',inventoryStart+1)),context);
context.keys.add('w');context.sendMovement(true);assert.equal(commands.at(-1),'MOVE:0.00:-1.00');
context.toggleInventory();assert(inventoryOpen);assert.equal(commands.at(-1),'MOVE:0.00:0.00','Inventory stops movement immediately, before the next frame');
assert.equal(inventoryRefreshes,1,'Opening refreshes the latest inventory immediately');
const blockedCount=commands.length;key('keydown',{code:'KeyW'});key('keydown',{code:'Space'});assert.equal(commands.length,blockedCount);
context.toggleInventory();assert(!inventoryOpen);assert.equal(context.keys.size,0,'Closing inventory does not replay the blocked keys');
assert.equal(inventoryRefreshes,1,'Closing does not redraw hidden inventory');
console.log('Inventory integration passed: immediate stop on opening, blocked movement/jump and no held-key replay');
inventoryOpen=true;
key('keydown',{code:'KeyR',repeat:true});assert(inventoryOpen,'Repeated R does not close the inventory');
key('keydown',{code:'KeyR'});assert(!inventoryOpen,'R closes the inventory before gameplay input is blocked');
let interactions=0;context.beginInteractionHold=()=>interactions++;
key('keyup',{code:'KeyR'});assert.equal(interactions,0,'Closing the inventory does not start a facility interaction');
