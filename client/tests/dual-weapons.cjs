const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const canvasHandlers = {}, windowHandlers = {}, commands = [];
const hidden = { classList: { contains: () => true } };
const me = { job: 'attacker', weapon: 'smg', secondaryWeapon: 'shotgun', ownsSmg: true, ownsShotgun: true };
const selects = ['left', 'right'].map(hand => ({dataset:{hand}, innerHTML:''}));
let panelHidden, change;
const panel = {classList:{toggle:(_, hidden)=>panelHidden=hidden}, querySelectorAll:()=>selects,
    addEventListener:(_, handler)=>change=handler};
const context = vm.createContext({ fpsInput:null, state: {phase:'wave'}, getMe:()=>me, firingPointer:null,
    myPlayerId:'me', exitDialog:{open:false}, howToMenu:hidden, actionMenu:hidden, inventoryMenu:hidden,
    canvas:{addEventListener:(name, handler)=>canvasHandlers[name]=handler, focus(){}},
    window:{addEventListener:(name, handler)=>windowHandlers[name]=handler},
    document:{querySelector:()=>panel}, performance:{now:()=>100},
    worldFromScreen:(x,y)=>({x,y}), send:command=>commands.push(command),
    WeaponUI:require('../weapon-ui.js'), WEAPON_FIELDS:{
        pistol:{name:'PISTOL',capacity:0}, bat:{name:'BAT',capacity:0},
        smg:{name:'SMG',owned:'ownsSmg',capacity:100},shotgun:{name:'SHOTGUN',owned:'ownsShotgun',capacity:30},
        rocket:{name:'LAUNCHER',owned:'ownsRocket',capacity:10}},
    escapeHtml:s=>s, showFeedback(){}, requestScoutDash(){}, requestDecoy(){},
});
for(const name of ['startFiring','updateFiringAim','stopFiring']) {
    const start=source.indexOf(`function ${name}(`);
    vm.runInContext(source.slice(start,source.indexOf('\nfunction ',start+1)),context);
}
let start=source.indexOf('canvas.addEventListener("mousedown"');
vm.runInContext(source.slice(start,source.indexOf('canvas.addEventListener("pointerdown"',start)),context);
start=source.indexOf('let secondaryHeld = false;');
vm.runInContext(source.slice(start,source.indexOf('canvas.addEventListener("contextmenu"',start)),context);
const mouse = button => ({button, clientX:1400,clientY:1900, preventDefault(){}});
canvasHandlers.mousedown(mouse(0)); canvasHandlers.mousedown(mouse(2));
assert.deepEqual(commands.slice(-2),['FIRE:1400.0:1900.0:1','SECONDARY_FIRE:1400.0:1900.0:1']);
windowHandlers.mouseup(mouse(0));
assert.equal(commands.at(-1),'FIRE:1400.0:1900.0:0');
assert(vm.runInContext('secondaryHeld',context),'left release keeps right held');
windowHandlers.mouseup(mouse(2));
assert.equal(commands.at(-1),'SECONDARY_FIRE:0:0:0');
canvasHandlers.mousedown(mouse(2)); canvasHandlers.mousedown(mouse(0));
assert.deepEqual(commands.slice(-2),['SECONDARY_FIRE:1400.0:1900.0:1','FIRE:1400.0:1900.0:1']);
windowHandlers.mouseup(mouse(2)); assert(context.firingPointer,'right release keeps left held');
windowHandlers.mouseup(mouse(0)); assert.equal(context.firingPointer,null);
start=source.indexOf('function updateAttackerLoadout(');
vm.runInContext(source.slice(start,source.indexOf('// Keep button nodes alive',start)),context);
context.updateAttackerLoadout(me);
assert.equal(panelHidden,false); assert.equal(selects[0].value,'smg'); assert.equal(selects[1].value,'shotgun');
assert(!selects[1].innerHTML.includes('LAUNCHER'),'only owned weapons can be assigned');
assert(!selects[1].innerHTML.includes('value="smg"')); assert(!selects[0].innerHTML.includes('value="shotgun"'));
selects[1].value='bat'; change({target:{closest:()=>selects[1]}});
assert.equal(commands.at(-1),'SECONDARY_WEAPON:bat');
selects[0].value='pistol'; change({target:{closest:()=>selects[0]}});
assert.equal(commands.at(-1),'WEAPON:pistol');
me.down=true; context.updateAttackerLoadout(me); assert(selects.every(s=>s.disabled));
const count=commands.length; change({target:{closest:()=>selects[1]}}); assert.equal(commands.length,count);
me.down=false; me.job='healer'; context.updateAttackerLoadout(me); assert.equal(panelHidden,true);
console.log('Dual weapon controls passed: either press order, independent release, owned loadouts and down guard');
