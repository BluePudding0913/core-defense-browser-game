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

// Settings retain only the normal preview and drawing API.
assert.equal(initial.api.drawHit,undefined);assert(!initial.styles.has('--reticle-preview-hit'));assert(!initial.styles.has('--reticle-preview-headshot'));
assert(!fs.readFileSync('client/menu-ui.js','utf8').includes('is-headshot'));assert(!source.includes('ctx.fill('),'Circle remains hollow');

// Exercise the real FPS overlay through active play, failure and menus.
const app=fs.readFileSync('client/app.js','utf8');const start=app.indexOf('function drawFirstPerson()'),end=app.indexOf('\nfunction drawDamageEdges()',start);
let reticles=0,menuOpen=false;const circles=[];const player={id:'me',x:100,y:100,weapon:'sniper'};
const noOp=()=>{},canvasCtx=new Proxy({},{get:(o,k)=>o[k]??noOp,set:(o,k,v)=>(o[k]=v,true)});
const hiddenMenu={classList:{contains:()=>true}};
const context=vm.createContext({window:{coreReticleSettings:{draw:(ctx,x,y)=>{assert.equal(x,400);assert.equal(y,300);reticles++;}},coreMenu:{settingsOpen:()=>menuOpen}},getMe:()=>player,droneCameraView:()=>null,predictedLocal:player,camera:{},fpsInput:{view:{zoom:false,yaw:0,pitch:0},setActive:noOp,setLookFrozen:noOp,locked:()=>true,facing:()=>({x:0,y:-1})},state:{phase:'wave',players:[player],enemies:[],core:{x:100,y:100},slots:[]},DEBUG_MODE:false,WEAPON_FIELDS:{pistol:{spreadSlope:.04}},exitDialog:{open:false},actionMenu:hiddenMenu,inventoryMenu:hiddenMenu,howToMenu:hiddenMenu,firingPointer:null,secondaryHeld:false,send:noOp,keys:new Set(),joystick:null,sendMovement:noOp,placementSelection:()=>null,labRenderer:{render:noOp,project:()=>({visible:false})},TILE_MAP:{},reachableFloorTiles:()=>new Set(),scale:1,myPlayerId:'me',smoothEntity:noOp,enemyRadius:()=>10,labStations:()=>[],hitEffects:[],worldFromScreen:()=>({x:0,y:0}),localMove:{x:0,y:0},ctx:canvasCtx,canvas:{width:800,height:600},innerWidth:800,innerHeight:600,performance:{now:()=>100},smoothed:new Map(),findNearestInteraction:()=>null,drawDamageEdges:noOp,drawJoystick:noOp,drawRewindScreen:noOp});
vm.runInContext(fs.readFileSync("client/key-settings.js","utf8"),context);
vm.runInContext(fs.readFileSync("client/sniper-aim.js","utf8"),context);
context.window.SniperAim.draw=(ctx,x,y,h,fov,sample,color)=>circles.push(color);
vm.runInContext(fs.readFileSync("client/aim-control.js","utf8"),context);
vm.runInContext(app.slice(start,end),context);
context.drawFirstPerson();assert.equal(reticles,1);
context.state.phase='lost';context.drawFirstPerson();assert.equal(reticles,1,'Failure hides the aiming mark');
context.state.phase='won';context.drawFirstPerson();assert.equal(reticles,1);
context.state.phase='wave';menuOpen=true;context.drawFirstPerson();assert.equal(reticles,1,'Settings hide the aiming mark');
menuOpen=false;context.fpsInput.view.zoom=true;context.drawFirstPerson();assert.equal(reticles,1,'Standing sniper ADS replaces the normal reticle');assert.equal(circles.pop(),'#e1e8e5','Standing sniper ADS shows breathing circle');
context.fpsInput.view.zoom=false;context.drawFirstPerson();assert.equal(reticles,2,'Hip fire preserves the configured reticle');
assert.equal(circles.length,0,'Standing sniper hides its internal cone');
player.sniper={fixed:true,elapsed:1,cycle:0};context.drawFirstPerson();assert.equal(reticles,2);assert.equal(circles.pop(),'#e1e8e5');
context.fpsInput.view.zoom=true;context.drawFirstPerson();assert.equal(reticles,2,'Prone scope hides the normal reticle');assert.equal(circles.pop(),'#e1e8e5');
player.sniper.fixed=false;player.weapon='pistol';context.fpsInput.view.zoom=false;context.drawFirstPerson();assert.equal(circles.length,0,'Ordinary weapons hide cones during hip fire');context.fpsInput.view.zoom=true;context.drawFirstPerson();assert.equal(circles.pop(),'#e1e8e5','Ordinary ADS shows breathing circle');context.fpsInput.view.zoom=false;
context.DEBUG_MODE=true;context.drawFirstPerson();assert.equal(circles.pop(),'#438fff','Debug shows the server cone in blue');
player.weapon='sniper';context.drawFirstPerson();assert.equal(circles.pop(),'#438fff','Debug can inspect the hidden standing sniper cone');
player.sniper.fixed=true;context.drawFirstPerson();assert.equal(circles.pop(),'#438fff');
assert(!fs.existsSync('client/pointer-settings.js'));assert(!fs.readFileSync('client/index.html','utf8').includes('pointer-settings'));
console.log('Reticle settings passed: geometry, live preview, persistence, validation, no custom cursor, play/failure/menu/scope lifecycle');
