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
assert.deepEqual({...initial.api.get()},{color:'#0088ff',size:20,shape:'plus'},'Obsolete pointer preferences do not control the reticle');
assert(!initial.styles.has('--game-pointer'),'Settings never create a mouse cursor');
const strokes=[],dots=[];const ctx={save(){},restore(){},beginPath(){},moveTo(x,y){strokes.push([x,y]);},lineTo(x,y){strokes.push([x,y]);},stroke(){},arc(...p){dots.push(p);},fill(){}};
initial.api.draw(ctx,400,300);
assert.deepEqual(strokes,[[396,300],[390,300],[404,300],[410,300],[400,296],[400,290],[400,304],[400,310]],'Default reticle is centered with an open center');
initial.api.update({color:'#FFAA00',size:24,shape:'cross'});strokes.length=0;initial.api.draw(ctx,400,300);
assert.equal(ctx.strokeStyle,'#ffaa00');assert.equal(strokes[1][0],388);assert.equal(strokes[1][1],288);
const svg=decodeURIComponent(initial.styles.get('--reticle-preview'));
assert(svg.includes('stroke="#ffaa00"'));assert(svg.includes('M35.2 35.2L28 28'),'Preview uses the same shape geometry');
assert.equal(load(initial.stored.get('core-defense-reticle')).api.get().shape,'cross');
initial.api.update({shape:'dot',size:8});initial.api.draw(ctx,400,300);assert.equal(initial.api.get().shape,'plus');assert.equal(dots.length,0,'Retired circle never draws an arc');
const retired=load('{"shape":"dot","color":"#123456","size":16}');assert.deepEqual({...retired.api.get()},{shape:'plus',color:'#123456',size:16},'Retired circle preserves color and size');
assert(!fs.readFileSync('client/menu-ui.js','utf8').includes('["dot", "○"]'),'Circle is absent from settings');
const copy=initial.api.get();copy.size=32;assert.equal(initial.api.get().size,8);
for(const value of ['{broken','null','{"color":"url(bad)","size":"32","shape":"bad"}'])assert.deepEqual({...load(value).api.get()},{color:'#0088ff',size:20,shape:'plus'});
initial.api.update({size:100});assert.equal(initial.api.get().size,32);
initial.api.update({size:-1});assert.equal(initial.api.get().size,4);
initial.api.update({size:NaN,shape:'bad'});assert.equal(initial.api.get().size,20);assert.equal(initial.api.get().shape,'plus');
const blocked=load(null,true);blocked.api.update({color:'#123456'});assert.equal(blocked.api.get().color,'#123456');

// Settings retain only the normal preview and drawing API.
assert.equal(initial.api.drawHit,undefined);assert(!initial.styles.has('--reticle-preview-hit'));assert(!initial.styles.has('--reticle-preview-headshot'));
assert(!fs.readFileSync('client/menu-ui.js','utf8').includes('is-headshot'));assert(!source.includes('ctx.fill('),'Reticle center remains open');

// Exercise the real FPS overlay through active play, failure and menus.
const app=fs.readFileSync('client/app.js','utf8');const start=app.indexOf('function drawFirstPerson()'),end=app.indexOf('\nfunction drawDamageEdges()',start);
let reticles=0,menuOpen=false;const circles=[];const player={id:'me',x:100,y:100,weapon:'sniper'};
const noOp=()=>{},canvasCtx=new Proxy({},{get:(o,k)=>o[k]??noOp,set:(o,k,v)=>(o[k]=v,true)});
const hiddenMenu={classList:{contains:()=>true}};
const context=vm.createContext({window:{coreReticleSettings:{draw:(ctx,x,y)=>{assert.equal(x,400);assert.equal(y,300);reticles++;}},coreMenu:{settingsOpen:()=>menuOpen}},getMe:()=>player,droneCameraView:()=>null,predictedLocal:player,camera:{},fpsInput:{view:{zoom:false,yaw:0,pitch:0},setActive:noOp,setLookFrozen:noOp,locked:()=>true,facing:()=>({x:0,y:-1})},state:{phase:'wave',players:[player],enemies:[],core:{x:100,y:100},slots:[]},DEBUG_MODE:false,WEAPON_FIELDS:{pistol:{spreadSlope:.04}},exitDialog:{open:false},actionMenu:hiddenMenu,inventoryMenu:hiddenMenu,howToMenu:hiddenMenu,firingPointer:null,secondaryHeld:false,send:noOp,keys:new Set(),joystick:null,sendMovement:noOp,placementSelection:()=>null,labRenderer:{render:noOp,project:()=>({visible:false})},TILE_MAP:{},reachableFloorTiles:()=>new Set(),scale:1,myPlayerId:'me',smoothEntity:noOp,enemyRadius:()=>10,labStations:()=>[],hitEffects:[],worldFromScreen:()=>({x:0,y:0}),localMove:{x:0,y:0},ctx:canvasCtx,canvas:{width:800,height:600},innerWidth:800,innerHeight:600,performance:{now:()=>100},smoothed:new Map(),findNearestInteraction:()=>null,drawDamageEdges:noOp,drawJoystick:noOp,drawRewindScreen:noOp});
vm.runInContext(fs.readFileSync("client/key-settings.js","utf8"),context);
vm.runInContext(fs.readFileSync("client/sniper-aim.js","utf8"),context);
context.window.SniperAim.draw=(ctx,x,y,h,fov,sample,color='rgba(190,224,246,.55)')=>circles.push(color);
vm.runInContext(fs.readFileSync("client/aim-control.js","utf8"),context);
vm.runInContext(fs.readFileSync("client/proximity-warning.js","utf8"),context);
vm.runInContext(app.slice(start,end),context);
context.drawFirstPerson();assert.equal(reticles,1);
context.state.phase='lost';context.drawFirstPerson();assert.equal(reticles,1,'Failure hides the aiming mark');
context.state.phase='won';context.drawFirstPerson();assert.equal(reticles,1);
context.state.phase='wave';menuOpen=true;context.drawFirstPerson();assert.equal(reticles,1,'Settings hide the aiming mark');
menuOpen=false;context.fpsInput.view.zoom=true;context.drawFirstPerson();assert.equal(reticles,2,'Standing sniper ADS preserves the normal reticle');assert.equal(circles.pop(),'rgba(190,224,246,.55)','Standing sniper ADS shows breathing circle');
context.fpsInput.view.zoom=false;context.drawFirstPerson();assert.equal(reticles,3,'Hip fire preserves the configured reticle');
assert.equal(circles.length,0,'Standing sniper hides its internal cone');
player.sniper={fixed:true,elapsed:1,cycle:0};context.drawFirstPerson();assert.equal(reticles,4);assert.equal(circles.length,0,'Prone hip fire hides the breathing circle');
context.fpsInput.view.zoom=true;context.drawFirstPerson();assert.equal(reticles,5,'Prone scope preserves the normal reticle');assert.equal(circles.pop(),'rgba(190,224,246,.55)');
player.sniper.fixed=false;
for(const debug of [false,true])for(const weapon of ['pistol','smg','rifle','revolver','lmg','shotgun','ricochet','freezeGun','sniper','railgun']) {
 context.DEBUG_MODE=debug;player.weapon=weapon;context.fpsInput.view.zoom=false;
 context.drawFirstPerson();assert.equal(circles.length,0,weapon+' hip fire hides breathing circle');
 context.fpsInput.view.zoom=true;const before=reticles;context.drawFirstPerson();
 assert.equal(reticles,before+1,weapon+' ADS preserves the normal reticle');
 if(weapon==='rifle'||weapon==='sniper')assert.equal(circles.pop(),'rgba(190,224,246,.55)',weapon+' ADS shows breathing circle');
 else assert.equal(circles.length,0,weapon+' ADS hides breathing circle, including debug');
}
player.weapon='pistol';context.fpsInput.view.zoom=false;
context.DEBUG_MODE=true;context.drawFirstPerson();assert.equal(circles.length,0,'Debug hip fire hides the internal cone');
player.weapon='sniper';context.drawFirstPerson();assert.equal(circles.length,0,'Debug standing sniper hides its internal cone');
player.sniper.fixed=true;context.drawFirstPerson();assert.equal(circles.length,0,'Debug prone hip fire also hides the circle');
assert(!fs.existsSync('client/pointer-settings.js'));assert(!fs.readFileSync('client/index.html','utf8').includes('pointer-settings'));
console.log('Reticle settings passed: geometry, live preview, persistence, validation, no custom cursor, play/failure/menu/scope lifecycle');

for(const weapon of ['rifle','railgun']) {player.weapon=weapon;player.sniper.fixed=false;context.fpsInput.view.zoom=true;const before=reticles;context.drawFirstPerson();assert.equal(reticles,before+1,weapon+' scope preserves the configured reticle');}
const before=reticles;player.down=true;context.drawFirstPerson();assert.equal(reticles,before,'Downed player has no reticle');player.down=false;player.selectedBuild='turret';context.drawFirstPerson();assert.equal(reticles,before,'Placement has no weapon reticle');player.selectedBuild=null;player.drone={controlled:true};context.drawFirstPerson();assert.equal(reticles,before,'Drone retains its own UI');

player.drone=null;player.weapon='pistol';
const prompts=[],texts=[];
context.clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
context.drawKeyPrompt=(...args)=>prompts.push(args);
context.ctx.fillText=(...args)=>texts.push(args);
context.findNearestInteraction=()=>({target:{x:100,y:120}});
context.labRenderer.stationPosition=p=>p;
context.labRenderer.project=()=>({visible:true,x:200,y:160});
context.drawFirstPerson();assert.deepEqual(prompts.splice(0),[['R',200,160]],'R is anchored only to the device');
context.labRenderer.project=()=>({visible:false});
context.drawFirstPerson();assert.equal(prompts.length,0,'Offscreen device does not put R beside the reticle');
context.placementSelection=()=>({type:'turret'});context.frontPlacementTile=()=>({x:100,y:120});context.canBuildAt=()=>true;
context.labRenderer.project=()=>({visible:true,x:200,y:160});
context.drawFirstPerson();assert.deepEqual(prompts,[['R',200,160]]);
assert(!texts.some(([text])=>text==='R PLACE'),'Valid placement does not duplicate R at the reticle');

// Secondary fire must not request aim on frames where its send interval has not elapsed.
let tick=1000,aimReads=0;const sent=[];
context.performance.now=()=>tick;
context.worldFromScreen=()=>{aimReads++;return {x:123,y:456};};
context.send=message=>sent.push(message);
context.findNearestInteraction=()=>null;context.placementSelection=()=>null;
context.secondaryHeld=true;context.drawFirstPerson.secondaryAt=1000;
context.drawFirstPerson();assert.equal(aimReads,1,'Only render pose asks for aim before secondary send is due');
tick=1070;context.drawFirstPerson();assert.equal(aimReads,2,'Exactly 70ms retains the previous send behavior');
tick=1071;context.drawFirstPerson();assert.equal(aimReads,4,'Due secondary fire requests aim once in addition to render pose');
assert.deepEqual(sent.filter(m=>m.startsWith('SECONDARY_FIRE:')),['SECONDARY_FIRE:123.0:456.0:1']);
tick=1080;context.drawFirstPerson();assert.equal(aimReads,5,'Held right fire does not keep querying between sends');
