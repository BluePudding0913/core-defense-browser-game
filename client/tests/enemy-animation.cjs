const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),T=require('../vendor/three.min.js');
let now=1000,scene,camera,poses=0;
const context=vm.createContext({window:{THREE:T},document:{body:{classList:{add(){}}}},performance:{now:()=>now},console});
T.WebGLRenderer=class {
 constructor(){this.domElement={width:0,height:0,addEventListener(){}};this.shadowMap={};}
 setSize(w,h){this.domElement.width=w;this.domElement.height=h;}
 clearDepth(){}
 render(s,c){s.updateMatrixWorld(true);c.updateMatrixWorld(true);if(c.near!==.01){scene=s;camera=c;}}
};
for(const file of ['aim-control.js','soldier-model.js','sniper-stance.js','organic-enemy-models.js','lab-enemy-models.js','wall-impacts.js','block-terrain.js','map-object-models.js','hit-presentation.js','lab3d.js'])vm.runInContext(fs.readFileSync('client/'+file,'utf8'),context);
const build=context.window.buildOrganicEnemy;
context.window.buildOrganicEnemy=(...args)=>{
 const model=build(...args),apply=model.applyPose;model.applyPose=()=>{poses++;apply();};return model;
};
const pool=context.window.createLabEnemyModels(T);
const snapshot=root=>{const a=[];root.traverse(o=>a.push(...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()));return a;};
const equalPose=(a,b,label)=>{
 const x=snapshot(a.rig),y=snapshot(b.rig);assert.equal(x.length,y.length);
 assert(x.every((v,i)=>Math.abs(v-y[i])<1e-10),label);
};
// Sparse frames must retain exactly the full-rate gait phase, including stop/start and teleport caps.
for(const type of Object.keys(pool.assignments)) {
 const full=pool.create(type,21),sparse=pool.create(type,21);let sparsePoses=0;
 for(let i=0;i<150;i++) {
  const point={x:i<30?i:i<55?30:i<90?30+(i-55)*2:500+(i-90),y:0},at=1000+i*16;
  full.update(point,at,false);const before=poses;sparse.update(point,at,false,250);
  if(poses>before){sparsePoses++;equalPose(full,sparse,type+': sparse update matches full-rate motion');}
 }
 assert(sparsePoses>=9 && sparsePoses<=12,type+': sparse cadence bounded');
 full.update({x:561,y:0},3400,false);sparse.update({x:561,y:0},3400,false,0);
 equalPose(full,sparse,type+': immediate full-detail promotion has no accumulated gait jump');
 // Freezing after a skipped frame must hold the visible pose, not an unseen intermediate pose.
 sparse.update({x:562,y:0},3416,false,250);const visible=snapshot(sparse.rig);
 sparse.update({x:563,y:0},3432,true,250);assert.deepEqual(snapshot(sparse.rig),visible,type+': freeze holds displayed pose');
 for(let i=0;i<30;i++)sparse.update({x:563,y:0},3448+i*16,true,250);
 assert.deepEqual(snapshot(sparse.rig),visible,type+': frozen pose stays fixed through scheduled refreshes');
 const before=poses;sparse.update({x:564,y:0},4000,false,250);assert.equal(poses,before+1,type+': thaw updates immediately');
 sparse.root.updateMatrixWorld(true);assert(new T.Box3().setFromObject(sparse.root).min.y>-.1,type+': resumed pose stays grounded');
 full.dispose();sparse.dispose();
}
console.log('Enemy animation state passed: all assigned types, full-rate phase parity, sparse cadence, stop/start, teleport, promotion, freeze/thaw and grounded pose');

const renderer=context.window.Lab3D.create({width:900,height:500,before(){}});
const me={id:'me',x:500,y:1000,weapon:'pistol',facingY:-1};
const frame={map:{tileSize:40,rows:['.']},reachable:new Set(),center:me,eye:me,predicted:me,localId:'me',scale:1,
 smooth:(_,p)=>p,radius:()=>21,stations:[],effects:[],view:{yaw:0,pitch:0},
 state:{core:{x:2000,y:2000},players:[me],enemies:[],resources:[],drops:[],slots:[]}};
const enemy=(id,x,y)=>({id,type:'grunt',x,y,hp:100,facingY:1});
function render(){renderer.render(frame);}
function cadence(point,weapon='pistol',secondary,moving=true) {
 frame.state.enemies=[enemy(1,...point)];me.weapon=weapon;me.job=secondary?'attacker':'scout';me.secondaryWeapon=secondary;
 frame.view={yaw:0,pitch:0};now+=1000;render();const before=poses;
 for(let i=0;i<60;i++){now+=1000/60;if(moving)frame.state.enemies[0].x+=.05;render();}
 return poses-before;
}
assert.equal(cadence([500,900]),60,'Nearby onscreen enemy updates every frame');
const far=cadence([500,300]);assert(far>=9&&far<=11,'Far visible enemy updates at 10Hz');
const outside=cadence([500,1200]);assert(outside>=3&&outside<=5,'Offscreen enemy updates at 4Hz');
assert.equal(cadence([500,300],'sniper'),60,'Equipped sniper bypasses distance throttling without requiring ADS');
assert.equal(cadence([500,1200],'sniper'),60,'Equipped sniper bypasses offscreen throttling');
assert.equal(cadence([500,1200],'pistol','sniper'),60,'Attacker secondary sniper also bypasses throttling');
assert.equal(cadence([500,520],'pistol',null,false),60,'480-unit threshold remains full rate');
// Sphere intersection allows a partly visible body whose center is outside the screen.
frame.state.enemies=[enemy(1,500,900)];me.weapon='pistol';me.job='scout';me.secondaryWeapon=null;now+=1000;render();
const side=100*Math.tan(camera.fov*Math.PI/360)*camera.aspect;
frame.state.enemies[0].x=500+side+10;now+=16;const edge=poses;render();assert.equal(poses,edge+1,'Partially visible nearby enemy remains full rate');
// A turn or distance promotion resumes detail in the very next frame.
frame.state.enemies[0].x=500;frame.state.enemies[0].y=1200;now+=1000;render();
frame.view.yaw=Math.PI;now+=1;let before=poses;render();assert.equal(poses,before+1,'Turning toward a nearby enemy promotes immediately');
frame.view.yaw=0;frame.state.enemies[0].y=300;now+=1000;render();
me.weapon='sniper';now+=1;before=poses;render();assert.equal(poses,before+1,'Switching to sniper promotes immediately');
me.weapon='pistol';now+=1;render();now+=1;before=poses;render();assert.equal(poses,before,'Switching away restores sparse updates');
frame.state.enemies[0].y=900;now+=1;before=poses;render();assert.equal(poses,before+1,'Approaching near range promotes immediately');
// Position/facing remain current even on a skipped pose frame, preserving world aim and hit effects.
frame.state.enemies[0].y=1200;now+=1000;render();now+=1;
frame.state.enemies[0].x=505;frame.state.enemies[0].facingX=1;frame.state.enemies[0].facingY=0;before=poses;render();
assert.equal(poses,before);const root=scene.getObjectByName('enemy:1');assert.equal(root.position.x,505);assert.equal(root.rotation.y,Math.PI/2);
const hit={effect:'hit',weapon:'pistol',playerId:'me',enemyId:1,damage:10,x:505,y:1200,started:now};
const body=root.getObjectByName('Open lab coat'),base=body.material;
frame.effects=[hit];now+=1;render();assert.notEqual(body.material,base,'Hit tint is not throttled with animation');
frame.effects=[{...hit,defeated:true,headshot:true,started:now}];frame.state.enemies=[];now+=1;render();
assert(root.userData.presentationOnly,'Death fade begins immediately while offscreen');
frame.effects=[];now+=140;render();assert(!scene.getObjectByName('enemy:1'),'Throttled enemy still releases after death fade');
frame.state.enemies=[enemy(1,500,900)];now+=1;before=poses;render();assert.equal(poses,before+1,'Recreated actor cannot inherit an old timer');
console.log(`Enemy animation integration passed: near 60/60, far ${far}/60, offscreen ${outside}/60; main/sub sniper, screen edges, view/range/weapon promotion, position/facing, hit tint and death cleanup`);

if(process.argv.includes('--benchmark')) {
 const {performance}=require('node:perf_hooks');
 function measure(interval){
  const actors=Array.from({length:60},()=>pool.create('grunt',21)),before=poses,start=performance.now();
  for(let i=0;i<120;i++)for(let j=0;j<actors.length;j++)actors[j].update({x:i*.7,y:j},1000+i*1000/60,false,interval);
  const ms=performance.now()-start,count=poses-before;actors.forEach(a=>a.dispose());return {ms:+ms.toFixed(2),poses:count};
 }
 measure(0);measure(250);
 console.log(JSON.stringify({actors:60,frames:120,full:measure(0),sparse:measure(250),note:'CPU animation update only; excludes GPU, renderer, shadows and server.'}));
 frame.state.enemies=Array.from({length:60},(_,i)=>enemy(i+100,450+(i%10)*10,1200+Math.floor(i/10)*15));frame.effects=[];frame.view={yaw:0,pitch:0};
 function measureRender(weapon){
  me.weapon=weapon;now+=1000;render();for(let i=0;i<10;i++){now+=1000/60;render();}
  const before=poses,start=performance.now();
  for(let i=0;i<120;i++){now+=1000/60;for(const e of frame.state.enemies)e.x+=.1;render();}
  return {ms:+(performance.now()-start).toFixed(2),poses:poses-before};
 }
 console.log(JSON.stringify({actors:60,frames:120,fullSniper:measureRender('sniper'),sparsePistol:measureRender('pistol'),note:'Lab3D CPU including visibility checks and scene transforms, mocked WebGL; excludes actual GPU and server.'}));
}
