const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const listeners={},globalListeners={},documentListeners={};let lockRequests=0;
let reject=false,deferred=false;
const classes=new Set();
const document={pointerLockElement:null,addEventListener(t,f){documentListeners[t]=f;},exitPointerLock(){this.pointerLockElement=null;documentListeners.pointerlockchange();}};
const canvas={classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},addEventListener(t,f){listeners[t]=f;},requestPointerLock(){
    lockRequests++;
    if(reject)throw Error('Denied');
    if(!deferred){document.pointerLockElement=canvas;documentListeners.pointerlockchange();}
}};
const context=vm.createContext({document,window:{addEventListener(t,f){globalListeners[t]=f;}},innerWidth:1000});
vm.runInContext(fs.readFileSync('client/fps-input.js','utf8'),context);let escaped=0;const input=context.window.FPSInput.create(canvas,{onEscape:()=>escaped++});
const move=(x,y=0)=>listeners.mousemove({movementX:x,movementY:y,clientX:999,clientY:499});
input.setActive(true);assert(input.locked(),'Entering a game captures look without an extra click');input.release();move(1000);assert.equal(input.view.yaw,0,'Uncaptured cursor never changes view');
assert(input.capture());assert(input.locked());assert(!input.capture(),'Captured click can fire');
move(1000,-1000);assert.equal(input.view.yaw,0,'Ignore capture coordinate jump');
move(Math.PI/2/.0024);assert(Math.abs(input.view.yaw-Math.PI/2)<1e-8);
const direction=input.movement(0,-1);assert(Math.abs(direction.x-1)<1e-8);assert(Math.abs(direction.y)<1e-8);
const turn=input.view.yaw;for(let i=0;i<100;i++)move(100);
assert(Math.abs(input.view.yaw-turn-24)<1e-8,'Repeated relative motion at the same screen edge supports multiple full turns');
move(0,-10000);assert.equal(input.view.pitch,1.2);
input.setActive(false,true);assert(!input.locked());assert(!classes.has('fps-looking'));
const saved={...input.view};move(500,500);assert.deepEqual({...input.view},saved);
input.setActive(true);assert(input.locked(),'Closing UI reacquires previous capture');move(10000,10000);assert.deepEqual({...input.view},saved,'UI restoration preserves angles');
move(10,10);assert(input.view.yaw>saved.yaw);
const before={...input.view};listeners.pointermove({pointerType:'mouse',movementX:1000,movementY:1000});assert.deepEqual({...input.view},before);
move(NaN,Infinity);assert.deepEqual({...input.view},before);
input.view.scoped=true;move(10);assert(Math.abs(input.view.yaw-before.yaw-.0084)<1e-8);
input.view.scoped=false;
input.setLookFrozen(true);const frozen={...input.view};move(100,100);move(100,100);assert.deepEqual({...input.view},frozen);
listeners.pointerdown({pointerType:'touch',pointerId:9,clientX:750,clientY:300});listeners.pointermove({pointerType:'touch',pointerId:9,clientX:790,clientY:350});assert.deepEqual({...input.view},frozen);
input.setLookFrozen(false);move(1000,1000);assert.deepEqual({...input.view},frozen);move(10);assert(input.view.yaw>frozen.yaw);
const beforeEscape=escaped;document.exitPointerLock();assert.equal(escaped,beforeEscape+1,'Native Esc reports one user unlock');const requests=lockRequests,unlocked={...input.view};
input.setActive(true);assert.equal(lockRequests,requests,'Native Esc never auto recaptures');move(1000);assert.deepEqual({...input.view},unlocked);
input.setActive(false,true);input.setActive(true);assert.equal(lockRequests,requests,'UI opened after Esc does not recapture');
listeners.pointerdown({pointerType:'touch',pointerId:5,clientX:750,clientY:300});const yaw=input.view.yaw;
listeners.pointermove({pointerType:'touch',pointerId:5,clientX:760,clientY:320});assert(Math.abs(input.view.yaw-yaw-.06)<1e-8);
globalListeners.pointerup({pointerId:5});const stopped=input.view.yaw;listeners.pointermove({pointerType:'touch',pointerId:5,clientX:800,clientY:320});assert.equal(input.view.yaw,stopped);
input.capture();input.setActive(false,true);input.release();input.setActive(true);assert(!input.locked(),'Blur while UI open cancels resume');
reject=true;assert(input.capture());assert(!input.locked());reject=false;assert(input.capture());assert(input.locked(),'A rejected capture can be retried by clicking');
const beforeRelease=escaped;input.release();assert.equal(escaped,beforeRelease,'UI/blur release never opens exit confirmation');deferred=true;input.capture();const pending=lockRequests;input.capture();assert.equal(lockRequests,pending,'Only one pending request');
input.release();document.pointerLockElement=canvas;documentListeners.pointerlockchange();assert(!input.locked(),'Late capture after release is immediately relinquished');
input.setActive(false);assert(!input.capture());assert(!classes.has('fps-looking'));
console.log('FPS input passed: unbounded relative look, capture/retry, UI restore, Esc/blur, entry warp, scope, touch and railgun freeze');

input.setActive(true);deferred=false;input.capture();document.hasFocus=()=>false;
const beforeBlur=escaped;document.exitPointerLock();assert.equal(escaped,beforeBlur,'Focus loss is not treated as Escape');

input.view.zoom=true;input.release();assert(!input.view.zoom);assert.equal(input.cycleScope,undefined,'No toggle scope remains');

// Mouse settings multiply relative deltas, with scope scaling retained and touch unchanged.
input.setActive(true);input.capture();move(0);input.view.scoped=false;
context.window.coreMouseSettings={get:()=>2};let startYaw=input.view.yaw;move(10);assert(Math.abs(input.view.yaw-startYaw-.048)<1e-8);
input.view.scoped=true;startYaw=input.view.yaw;move(10);assert(Math.abs(input.view.yaw-startYaw-.0168)<1e-8);

// A new match gets one automatic attempt; denied requests never retry every frame.
input.setActive(false);reject=true;const entryRequests=lockRequests;
input.setActive(true);assert.equal(lockRequests,entryRequests+1);assert(!input.locked());
for(let i=0;i<20;i++)input.setActive(true);assert.equal(lockRequests,entryRequests+1);
input.setActive(false,true);input.setActive(true);assert.equal(lockRequests,entryRequests+1,'Uncaptured UI close does not steal focus');
reject=false;input.setActive(false);input.setActive(true);assert(input.locked(),'Next match automatically captures again');
