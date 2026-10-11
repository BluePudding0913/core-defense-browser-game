const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('client/reticle-settings.js','utf8');
function load(saved,blocked=false) {
 const styles=new Map(),stored=new Map([['core-defense-reticle',saved],['core-defense-pointer','{"color":"#ff0000","size":32,"shape":"dot"}']]);
 const context={window:{},document:{documentElement:{style:{setProperty:(k,v)=>styles.set(k,v)}}},localStorage:{
  getItem(k){if(blocked)throw Error('blocked');return stored.get(k);},
  setItem(k,v){if(blocked)throw Error('blocked');stored.set(k,v);}
 }};
 vm.runInNewContext(source,context);return {api:context.window.coreReticleSettings,styles,stored};
}
const initial=load(null);
assert.deepEqual({...initial.api.get()},{color:'#e8f4f8',size:20,shape:'plus'},'Obsolete pointer preferences do not control the reticle');
assert(!initial.styles.has('--game-pointer'),'Settings never create a mouse cursor');
const strokes=[],dots=[];const ctx={save(){},restore(){},beginPath(){},moveTo(x,y){strokes.push([x,y]);},lineTo(x,y){strokes.push([x,y]);},stroke(){},arc(...p){dots.push(p);},fill(){}};
initial.api.draw(ctx,400,300);
assert.deepEqual(strokes,[[396,300],[390,300],[404,300],[410,300],[400,296],[400,290],[400,304],[400,310]],'Default reticle is centered with an open center');
initial.api.update({color:'#FFAA00',size:24,shape:'cross'});strokes.length=0;initial.api.draw(ctx,400,300);
assert.equal(ctx.strokeStyle,'#ffaa00');assert.equal(strokes[1][0],388);assert.equal(strokes[1][1],288);
const svg=decodeURIComponent(initial.styles.get('--reticle-preview'));
assert(svg.includes('stroke="#ffaa00"'));assert(svg.includes('M35.2 35.2L28 28'),'Preview uses the same shape geometry');
assert.equal(load(initial.stored.get('core-defense-reticle')).api.get().shape,'cross');
initial.api.update({shape:'dot',size:8});initial.api.draw(ctx,400,300);assert.deepEqual(dots[0].slice(0,3),[400,300,4]);
assert(decodeURIComponent(initial.styles.get('--reticle-preview')).includes('fill='),'Circle preview is hollow');
const copy=initial.api.get();copy.size=32;assert.equal(initial.api.get().size,8);
for(const value of ['{broken','null','{"color":"url(bad)","size":"32","shape":"bad"}'])assert.deepEqual({...load(value).api.get()},{color:'#e8f4f8',size:20,shape:'plus'});
initial.api.update({size:100});assert.equal(initial.api.get().size,32);
initial.api.update({size:-1});assert.equal(initial.api.get().size,4);
initial.api.update({size:NaN,shape:'bad'});assert.equal(initial.api.get().size,20);assert.equal(initial.api.get().shape,'plus');
const blocked=load(null,true);blocked.api.update({color:'#123456'});assert.equal(blocked.api.get().color,'#123456');

// All three selections have distinct hit and HS shapes, from the same drawing API used by previews.
const signatures=new Set();
for(const shape of ['dot','cross','plus']) {
 initial.api.update({shape,size:20});strokes.length=0;dots.length=0;
 initial.api.drawHit(ctx,400,300,{headshot:false,age:80,alpha:1});
 const normal=JSON.stringify({strokes:[...strokes],dots:[...dots]});assert.equal(ctx.strokeStyle,'#f1f8fb');
 signatures.add(normal);strokes.length=0;dots.length=0;
 initial.api.drawHit(ctx,400,300,{headshot:true,age:80,alpha:1});
 assert.equal(ctx.strokeStyle,'#ffc45c');assert.notEqual(JSON.stringify({strokes,dots}),normal,'HS differs in shape as well as color');
 assert(initial.styles.has('--reticle-preview-hit'));assert(initial.styles.has('--reticle-preview-headshot'));
}
assert.equal(signatures.size,3,'Each reticle has its own hit shape');
assert(!source.includes('ctx.fill('),'No reticle or confirmation fills the aiming center');

// Exercise the real FPS overlay through active play, failure and menus.
const app=fs.readFileSync('client/app.js','utf8');const start=app.indexOf('function drawFirstPerson()'),end=app.indexOf('\nfunction drawDamageEdges()',start);
let reticles=0,menuOpen=false;const player={id:'me',x:100,y:100,weapon:'sniper'};
const noOp=()=>{},canvasCtx=new Proxy({},{get:(o,k)=>o[k]??noOp,set:(o,k,v)=>(o[k]=v,true)});
const hiddenMenu={classList:{contains:()=>true}};
const context=vm.createContext({window:{coreReticleSettings:{draw:(ctx,x,y)=>{assert.equal(x,400);assert.equal(y,300);reticles++;}},coreMenu:{settingsOpen:()=>menuOpen}},getMe:()=>player,droneCameraView:()=>null,predictedLocal:player,camera:{},fpsInput:{view:{zoom:false},setActive:noOp,setLookFrozen:noOp,locked:()=>true},state:{phase:'wave',players:[player],enemies:[],core:{x:100,y:100},slots:[]},exitDialog:{open:false},actionMenu:hiddenMenu,inventoryMenu:hiddenMenu,howToMenu:hiddenMenu,firingPointer:null,secondaryHeld:false,keys:new Set(),joystick:null,sendMovement:noOp,placementSelection:()=>null,labRenderer:{render:noOp,project:()=>({visible:false})},TILE_MAP:{},reachableFloorTiles:()=>new Set(),scale:1,myPlayerId:'me',smoothEntity:noOp,enemyRadius:()=>10,labStations:()=>[],hitEffects:[],worldFromScreen:()=>({x:0,y:0}),localMove:{x:0,y:0},ctx:canvasCtx,canvas:{width:800,height:600},innerWidth:800,innerHeight:600,performance:{now:()=>100},smoothed:new Map(),findNearestInteraction:()=>null,drawDamageEdges:noOp,drawJoystick:noOp,drawRewindScreen:noOp});
vm.runInContext(app.slice(start,end),context);
context.drawFirstPerson();assert.equal(reticles,1);
context.state.phase='lost';context.drawFirstPerson();assert.equal(reticles,1,'Failure hides the aiming mark');
context.state.phase='won';context.drawFirstPerson();assert.equal(reticles,1);
context.state.phase='wave';menuOpen=true;context.drawFirstPerson();assert.equal(reticles,1,'Settings hide the aiming mark');
menuOpen=false;context.fpsInput.view.zoom=true;context.drawFirstPerson();assert.equal(reticles,1,'Scope keeps its own sight');
context.fpsInput.view.zoom=false;context.drawFirstPerson();assert.equal(reticles,2,'Returning to play restores the configured reticle');
assert(!fs.existsSync('client/pointer-settings.js'));assert(!fs.readFileSync('client/index.html','utf8').includes('pointer-settings'));
console.log('Reticle settings passed: geometry, live preview, persistence, validation, no custom cursor, play/failure/menu/scope lifecycle');
