'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('client/app.js','utf8');
const start=source.indexOf('    if(state.blackoutActive && !droneCameraView()){');
const end=source.indexOf('\n    if(playing && !menusOpen',start);
assert(start>=0 && end>start);
const block=source.slice(start,end);
let gradients=0,fills=0,detailed=true,drone=false;
const ctx={createRadialGradient(...args){gradients++;return {args,stops:[],addColorStop(...stop){this.stops.push(stop);}};},
 fillRect(){fills++;}};
const sandbox={state:{blackoutActive:true},droneCameraView:()=>drone,
 window:{coreGraphicsSettings:{getShadows:()=>detailed}},drawFirstPerson(){},ctx,
 canvas:{width:1280,height:720}};
vm.createContext(sandbox);
const render=()=>vm.runInContext(block,sandbox);
render();const first=sandbox.drawFirstPerson.blackoutShade.gradient;
assert.equal(gradients,1);assert.equal(first.stops[1][1],'rgba(0,5,10,.45)');
for(let i=0;i<60;i++)render();
assert.equal(gradients,1,'Fixed-size detailed blackout reuses its gradient');
assert.equal(fills,61,'Cached shade is still drawn every frame');
detailed=false;render();const simple=sandbox.drawFirstPerson.blackoutShade.gradient;
assert.equal(gradients,2);assert.equal(simple.stops[0][1],'rgba(0,5,10,.12)');
assert.equal(simple.stops[1][1],'rgba(0,5,10,.9)','Simplified lighting uses stronger peripheral darkness');
render();assert.equal(gradients,2);
sandbox.canvas.width=1920;sandbox.canvas.height=1080;render();
assert.equal(gradients,3,'Resize invalidates the cached gradient');
assert.deepEqual(ctx.fillStyle.args,[960,540,0,960,540,1248]);
const beforeExempt=fills;
drone=true;render();assert.equal(fills,beforeExempt,'Drone night vision draws no blackout overlay');
drone=false;sandbox.state.blackoutActive=false;render();assert.equal(fills,beforeExempt);
sandbox.state.blackoutActive=true;detailed=true;render();assert.equal(gradients,4);
sandbox.window.coreGraphicsSettings=undefined;render();assert.equal(gradients,4,'Preview default matches detailed rendering');
console.log('Blackout overlay passed: cached frames, resize, both graphics modes, toggles, restoration and drone exemption');
