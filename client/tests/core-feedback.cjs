const assert = require('node:assert/strict');
const feedback = require('../core-feedback.js');
const arcs = [];
const ctx = {save(){},restore(){},beginPath(){},stroke(){},arc(...args){arcs.push(args);}};
const core = {x:1020,y:1900};
const world = {width:2080,height:2080};
feedback.add(core, 0); feedback.draw(ctx, 900, world);
const radius = arcs[0][2];
feedback.add(core, 900); arcs.length = 0; feedback.draw(ctx, 1800, world);
assert.equal(arcs.length, 2, 'repeated hits preserve the earlier travelling alert');
assert(arcs[0][2] > radius && arcs[0][2] > arcs[1][2]);
arcs.length = 0; feedback.draw(ctx, 2500, world, 2);
assert(arcs[0][2] >= Math.hypot(1020,1900), 'alert reaches the farthest corner');
assert.equal(ctx.lineWidth, 2, 'visible line width stays stable when zoomed');
arcs.length = 0; feedback.draw(ctx, 2800, world);
assert.equal(arcs.length, 1, 'each hit expires independently');
feedback.reset(); arcs.length = 0; feedback.draw(ctx, 2900, world);
assert.equal(arcs.length, 0, 'new match or rewind clears alerts');
console.log('Core alert passed: map-wide reach, independent hits, zoom and reset');

const value={textContent:''},fill={style:{}},element={hidden:true,style:{},querySelector:s=>s==='.core-hud-value'?value:fill};
Object.assign(core,{hp:700,maxHp:1000});
feedback.updateHud(element,core,3000);assert(element.hidden,'No HUD before actual damage');
feedback.add(core,4000);feedback.updateHud(element,core,4000);assert(!element.hidden);assert.equal(element.style.opacity,'1');assert.equal(value.textContent,'700 / 1000');assert.equal(fill.style.width,'70%');
core.hp=500;feedback.updateHud(element,core,13999);assert.equal(value.textContent,'500 / 1000');assert.equal(element.style.opacity,'1','HUD persists for ten seconds');
feedback.updateHud(element,core,14200);assert.equal(element.style.opacity,'0.5');
feedback.add(core,14200);feedback.updateHud(element,core,14200);assert.equal(element.style.opacity,'1','Further damage restores full opacity and restarts the timer');
feedback.updateHud(element,core,24600);assert(element.hidden,'HUD hides after its 400ms fade');
feedback.add(core,25000);feedback.reset();feedback.updateHud(element,core,25000);assert(element.hidden,'Rewind/new match clears HUD');
feedback.updateHud(null,core,25000);
console.log('Core HUD passed: damage trigger, latest HP, ten-second hold, fade, repeated damage and reset');

// Exercise the real snapshot detection: shield damage counts, healing does not.
const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync('client/app.js','utf8');
const start=source.indexOf('    const resetCoreAlerts ='),end=source.indexOf('\n    const incomingMe',start);
let now=30000;
const c=vm.createContext({CoreFeedback:feedback,performance:{now:()=>now},state:undefined,next:undefined,lastCoreHp:undefined,lastCoreShield:0,coreHitStarted:0});
vm.runInContext('function snapshot(){'+source.slice(start,end)+'}',c);feedback.reset();
function snapshot(hp,shield,phase='wave',rewindVersion=0){c.next={core:{...core,hp,shield},phase,rewindVersion};c.snapshot();c.state=c.next;feedback.updateHud(element,c.next.core,now);}
snapshot(1000,100);assert(element.hidden,'Initial damaged snapshot is a baseline');
now+=100;snapshot(1000,90);assert(!element.hidden,'Shield damage triggers HUD at any distance');
now+=100;snapshot(900,90);assert.equal(value.textContent,'900 / 1000');
now+=100;snapshot(950,90);assert.equal(value.textContent,'950 / 1000','Healing updates the displayed HP');
now=40400;snapshot(950,90);assert.equal(element.style.opacity,'0.5','Healing never restarts the damage timer');
now=40401;snapshot(950,90,'preparing');assert(!element.hidden,'Round transition retains HUD timeout');
now=40402;snapshot(950,90,'preparing',1);assert(element.hidden,'Rewind clears the damage HUD');
console.log('Core snapshot integration passed: baseline, shield/HP damage, repair, round continuity and rewind');
