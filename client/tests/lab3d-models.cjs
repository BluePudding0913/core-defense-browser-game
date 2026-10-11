const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const THREE = require('../vendor/three.min.js');
let scene, camera, viewScene, viewCamera, now=1000;
THREE.WebGLRenderer = class {
    constructor() { this.domElement={width:0,height:0,addEventListener(){}};this.shadowMap={}; }
    setSize(w,h) { this.domElement.width=w;this.domElement.height=h; }
    clearDepth() {}
    render(s,c) { if(!s.children.some(o=>o.isDirectionalLight)){viewScene=s;viewCamera=c;viewScene.updateMatrixWorld(true);viewCamera.updateMatrixWorld(true);return;}scene=s;camera=c;scene.updateMatrixWorld(true);camera.updateMatrixWorld(true); }
};
const context=vm.createContext({window:{THREE},document:{body:{classList:{add(){}}}},performance:{now:()=>now},console});
for (const file of ['soldier-model.js','lab3d.js']) vm.runInContext(fs.readFileSync('client/'+file,'utf8'),context);
const renderer=context.window.Lab3D.create({width:900,height:500,before(){}});
const player={id:'me',x:100,y:100,facingX:0,facingY:-1};
const state={core:{x:60,y:60},players:[player],enemies:[{id:1,type:'shield',x:180,y:100,hp:100,facingX:1,facingY:0}],slots:[
    {id:'turret',x:100,y:160,defense:{type:'turret'}},
    {id:'wire',x:140,y:160,defense:{type:'wire'}},
    {id:'mine',x:180,y:160,defense:{type:'mine'}},
    ...['barricade','copperBarricade','silverBarricade'].map((type,i)=>({id:type,x:60+i*40,y:200,defense:{type}}))
],resources:[{id:'ore',type:'ore',x:200,y:200,available:true},{id:'empty',type:'wood',x:220,y:220,available:false}],drops:[{id:1,type:'medkit',x:240,y:240}]};
const frame={map:{tileSize:40,rows:['#####','#...#','#...#','#...#','#####']},reachable:new Set(['1:1','1:2','1:3','2:1','2:2','2:3','3:1','3:2','3:3']),center:{x:140,y:140},scale:1,state,localId:'me',predicted:player,smooth:(_,p)=>p,radius:()=>24,stations:[[{id:'breaker',x:40,y:100},'', '#ff5964','breaker'],[{id:'unlock',x:40,y:140},'UNLOCK','#79d8ff','terminal']],aim:{x:200,y:100},effects:[]};
renderer.render(frame);
const find=name=>{const result=scene.getObjectByName(name);assert(result,name);return result;};
const soldier=scene.children.find(o=>o.getObjectByName('Muzzle'));
assert(Math.abs(soldier.rotation.y-Math.PI/2)<1e-8,'Local actor faces pointer instead of movement');
const turret=find('defense:turret:turret'), head=turret.children.find(o=>o.type==='Group');
assert.equal(head.rotation.y,0,'New turret faces screen down (+Z)');
const muzzle=head.children.find(o=>o.type==='Object3D');assert(muzzle.position.z>0);
const wire=find('defense:wire:wire');assert(wire.children.some(o=>o.geometry?.type==='TubeGeometry'),'Wire has a barbed coil');
assert(!wire.children.some(o=>o.geometry?.type==='CylinderGeometry'),'Wire does not reuse mine disk');
assert(find('defense:mine:mine').children.some(o=>o.geometry?.type==='CylinderGeometry'));
for (const type of ['barricade','copperBarricade','silverBarricade']) { const block=find('defense:'+type+':'+type).children[0];assert.deepEqual(block.scale.toArray(),[36,24,36],'Barricades are low solid blocks'); }
find('station:breaker:breaker'); find('station:unlock:terminal');find('resource:ore:ore');find('drop:1:medkit');
assert(!scene.getObjectByName('resource:empty:wood'));
const terrain=scene.children.find(o=>o.children.some(c=>c.isInstancedMesh));
assert(!terrain.getObjectByName('lab-floor-strips'),'No blue decoration on floor');const m=new THREE.Matrix4(),pos=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3();
frame.effects=[{effect:'hit',weapon:'turret',fromX:100,fromY:160,x:200,y:160,damage:10,enemyId:1,started:now},
 {effect:'hit',weapon:'pistol',playerId:'me',fromX:100,fromY:100,x:250,y:100,damage:0,started:now}];
renderer.render(frame);
assert(Math.abs(head.rotation.y-Math.PI/2)<1e-8,'Turret turns toward its shot');
const traces=scene.children.filter(o=>o.name==='muzzle-tracer');assert.equal(traces.length,2);
const turretOrigin=muzzle.getWorldPosition(new THREE.Vector3());
const soldierTrace=traces.find(line=>{const p=line.geometry.attributes.position;return Math.hypot(p.getX(0)-turretOrigin.x,p.getY(0)-turretOrigin.y,p.getZ(0)-turretOrigin.z)>1;});
const soldierOrigin=new THREE.Vector3().fromBufferAttribute(soldierTrace.geometry.attributes.position,0);
assert.equal(soldier.visible,false,'Local third-person body hidden in FPS');
assert(camera.isPerspectiveCamera);assert.equal(camera.position.y,26);
assert.equal(renderer.project(100,150,26).visible,false,'Behind-camera labels are hidden');
assert(renderer.aimPoint());
assert.equal(viewScene.getObjectByName('Head').visible,false,'Viewmodel excludes the head');
const startingAim=renderer.aimPoint();frame.view={yaw:Math.PI/2,pitch:0};renderer.render(frame);assert(Math.abs(camera.rotation.y+Math.PI/2)<1e-8);assert.notDeepEqual(renderer.aimPoint(),startingAim,'Reticle ray follows mouse yaw');frame.view={yaw:0,pitch:0};renderer.render(frame);
for(const expected of [turretOrigin,soldierOrigin]) assert(traces.some(line=>{const p=line.geometry.attributes.position;return Math.hypot(p.getX(0)-expected.x,p.getY(0)-expected.y,p.getZ(0)-expected.z)<1e-4;}),'Tracer starts at actual muzzle');
const ground=renderer.project(100,60,0),raised=renderer.project(100,60,40);assert(raised.y<ground.y,'Floating labels project above ground');
now+=400;frame.effects=[];state.drops=[];state.resources[0].available=false;renderer.render(frame);
assert.equal(scene.children.filter(o=>o.name==='muzzle-tracer').length,0,'Expired shots removed');
assert(!scene.getObjectByName('drop:1:medkit'));assert(!scene.getObjectByName('resource:ore:ore'));
assert(Math.abs(head.rotation.y-Math.PI/2)<1e-8,'Turret retains last firing direction');
console.log('3D models passed: pointer facing, default/shot turret direction, muzzle origins, wire/mine/barricade models, terminals, loot, expiry and raised projection');


// Test projected positions rather than repeating the coordinate conversion under test.
for(const view of [{yaw:0,pitch:0,zoom:false},{yaw:.7,pitch:.4,zoom:false},{yaw:-.8,pitch:-.6,zoom:true}]) {
    now+=300;frame.view=view;frame.effects=[];renderer.render(frame);
    const before=renderer.aimPoint();
    frame.effects=[{effect:'hit',weapon:'pistol',playerId:'me',fromX:player.x,fromY:player.y,
        x:player.x+Math.sin(view.yaw)*250,y:player.y-Math.cos(view.yaw)*250,damage:0,started:now}];
    renderer.render(frame);
    const shot=scene.children.find(o=>o.name==='muzzle-tracer'),attribute=shot.geometry.attributes.position;
    const start=new THREE.Vector3().fromBufferAttribute(attribute,0).project(camera);
    const muzzle=viewScene.getObjectByName('Muzzle').getWorldPosition(new THREE.Vector3()).project(viewCamera);
    assert(Math.hypot(start.x-muzzle.x,start.y-muzzle.y)<1e-5,'Tracer visually starts at the muzzle despite different FOV/zoom/rotation');
    const end=new THREE.Vector3().fromBufferAttribute(attribute,1).project(camera);
    assert(Math.hypot(end.x,end.y)<1e-5,'Firing upward/downward retains the shot pitch');
    assert.deepEqual(renderer.aimPoint(),before,'A red line cannot intercept the next aim ray');
    const fixed=Array.from(attribute.array);
    frame.view={yaw:view.yaw+.5,pitch:view.pitch-.2,zoom:view.zoom};renderer.render(frame);
    assert.deepEqual(Array.from(attribute.array),fixed,'Camera turns cannot drag an existing shot into a fan');
}
for(const [i,type] of ['grunt','runner','carrier','shield','warden','ghost'].entries()) {
    state.enemies=[{id:200+i,type,x:180,y:100,hp:100,facingX:-.6,facingY:-.8}];frame.effects=[];renderer.render(frame);
    assert(Math.abs(scene.getObjectByName('enemy:'+(200+i)).rotation.y-Math.atan2(-.6,-.8))<1e-8,'All enemy models use transmitted facing');
}
console.log('FPS trajectory regressions passed: muzzle screen alignment, pitch, zoom, fixed fired segments, aim excludes red lines, all enemy facing');

// A room opening into a two-tile passage must have a sealed, lower ceiling.
frame.map={tileSize:40,rows:['###########','#....######','#.........#','#.........#','#....######','###########']};
frame.reachable=new Set();for(let r=0;r<frame.map.rows.length;r++)for(let c=0;c<frame.map.rows[r].length;c++)if(frame.map.rows[r][c]==='.')frame.reachable.add(r+':'+c);
frame.eye={x:100,y:160};frame.view={yaw:0,pitch:0};renderer.render(frame);
const roof=find('lab-ceilings'),heightAt=(x,z)=>{
    for(let i=0;i<roof.count;i++){roof.getMatrixAt(i,m);m.decompose(pos,q,scale);if(pos.x===x&&pos.z===z)return pos.y-scale.y/2;}
    assert.fail('Missing ceiling tile');
};
assert.equal(roof.count,frame.reachable.size,'Every accessible floor tile has a ceiling');
assert.equal(heightAt(100,100),camera.position.y*5,'Room ceiling is five times standing eye height');
assert.equal(heightAt(260,100),64,'Two-tile passages have lower ceilings');
assert.equal(find('lab-bulkheads').count,2,'The full passage entrance is closed above the low ceiling');
assert.equal(renderer.project(100,100,150).visible,false,'Labels cannot be seen through the ceiling');
const farLabel=renderer.project(100,40,38);frame.eye={x:100,y:100};renderer.render(frame);
const nearLabel=renderer.project(100,40,38);assert(nearLabel.pixelsPerUnit>farLabel.pixelsPerUnit,'Projected label scale increases when approaching');
frame.view.zoom=true;renderer.render(frame);assert(renderer.project(100,40,38).pixelsPerUnit>nearLabel.pixelsPerUnit,'Label scale follows camera zoom');
console.log('Lab ceilings passed: room/passage heights, full coverage, sealed transitions, occlusion, label distance and zoom scale');

// Wall-mounted panels remain visible from the accessible side, with projected UI at that location.
const wallTerminal={id:'wall-panel',x:100,y:20};frame.stations=[[wallTerminal,'UNLOCK','#79d8ff','terminal']];
state.decoys=[{ownerId:'a',x:140,y:100,hp:45,facingX:1,facingY:0},{ownerId:'b',x:180,y:100,hp:45,facingX:0,facingY:-1}];
frame.eye={x:100,y:140};frame.view={yaw:0,pitch:0};renderer.render(frame);
const panel=find('station:wall-panel:terminal');assert.equal(panel.position.z,44);assert.equal(panel.position.x,100);
const panelLabel=renderer.stationPosition(wallTerminal);assert.equal(panelLabel.y,44);assert(renderer.project(panelLabel.x,panelLabel.y,38).visible);
for(const owner of ['a','b'])assert(find('decoy:'+owner).getObjectByName('Soldier'),'Each decoy has its own soldier, not terminal geometry');
assert.equal(find('decoy:a').rotation.y,Math.PI/2);assert.equal(find('decoy:b').rotation.y,Math.PI);
const stableMuzzle=viewScene.getObjectByName('Muzzle'),gunSignatures=new Set();
for(const weapon of ['bat','pistol','shotgun','smg','rifle','sniper','ricochet','revolver','railgun','rocket','flamethrower','lmg','hook','laserCannon','poisonGas','repulsor','freezeGun','plasmaBlade']) {
    player.weapon=weapon;renderer.render(frame);const gun=viewScene.getObjectByName('Rifle');assert.equal(gun.userData.weapon,weapon);
    assert.equal(viewScene.getObjectByName('Muzzle'),stableMuzzle,'Weapon swaps keep the tracer muzzle node');
    gunSignatures.add(JSON.stringify(gun.children.filter(c=>c.isMesh).map(c=>[c.geometry.type,c.geometry.parameters,c.position.toArray(),c.material.color.getHex()])));
}
assert.equal(gunSignatures.size,18,'Every weapon has a distinct minimal model');
state.decoys=[];renderer.render(frame);assert(!scene.getObjectByName('decoy:a'));assert(!scene.getObjectByName('decoy:b'));
console.log('FPS visual models passed: visible wall panel and UI anchor, independent soldier decoys, all 18 weapon shapes and stable muzzle on swaps');
now+=400;player.weapon='pistol';state.enemies=[{id:77,type:'grunt',x:140,y:100,hp:100,facingX:0,facingY:1}];
frame.effects=[{effect:'hit',weapon:'pistol',playerId:'me',fromX:100,fromY:140,x:128,y:112,hitHeight:27.3,damage:0,enemyId:null,started:now},{effect:'hit',weapon:'pistol',playerId:'me',fromX:100,fromY:140,x:128,y:112,hitHeight:27.3,damage:26,enemyId:77,started:now}];renderer.render(frame);
const authoritativeTrace=scene.children.find(o=>o.name==='muzzle-tracer'),impactParticles=scene.children.find(o=>o.name==='enemy-hit-particles');
assert(Math.abs(authoritativeTrace.geometry.attributes.position.getY(1)-27.3)<1e-5,'Tracer uses server impact height');
assert.deepEqual(impactParticles.position.toArray(),[128,27.3,112],'Particles start at the server impact, rather than the enemy center');
console.log('FPS authoritative impact passed: tracer endpoint and red particles use server XYZ impact');

// Motion and shape regressions use the rendered scene, including scope magnification.
frame.eye=player;frame.motion={moving:false};frame.effects=[];player.healRemaining=3;player.healHalfSize=60;player.healX=100;player.healY=100;now+=500;renderer.render(frame);
const heal=find('heal:me');assert.equal(heal.geometry.type,'PlaneGeometry');assert.equal(heal.scale.x*2,120);assert.equal(heal.scale.y*2,120);
player.weapon='sniper';frame.view={yaw:0,pitch:0,zoom:true};frame.scoped=true;renderer.render(frame);assert.equal(camera.fov,20);
frame.scoped=false;frame.view.zoom=false;player.jumpHeight=24;renderer.render(frame);assert.equal(camera.position.y,50);player.jumpHeight=0;
frame.effects=[{effect:'hit',weapon:'bat',playerId:'me',fromX:100,fromY:100,x:100,y:60,damage:0,started:now}];renderer.render(frame);
assert(!scene.children.some(o=>o.name.startsWith('special:')),'Bat never creates a blue beam');assert(viewScene.getObjectByName('Soldier').rotation.z<0,'Bat swings the viewmodel');
frame.effects=[{effect:'hit',weapon:'sniper',playerId:'me',fromX:100,fromY:100,x:100,y:60,damage:0,started:now+30}];now+=30;renderer.render(frame);assert(viewCamera.rotation.x<0,'Shot produces slight viewmodel recoil');
const thick=scene.children.find(o=>o.name==='muzzle-tracer');assert(thick.children[0].isMesh);assert.equal(thick.children[0].scale.x,.35,'Visible thick red tracer');
frame.effects=[];frame.motion.moving=true;player.y-=4;now+=50;renderer.render(frame);assert(Math.abs(camera.rotation.z)>0,'Walking gently sways camera');
frame.motion.moving=false;now+=2000;for(let i=0;i<60;i++){now+=50;renderer.render(frame);}assert(Math.abs(camera.rotation.z)<1e-8,'Sway settles smoothly after stopping');
console.log('FPS motion models passed: square heal area, scope, jump height, bat swing, recoil, thicker tracer and settling head bob');

// Effect origin is captured at arrival, even if movement precedes the next render.
now+=500;frame.motion={moving:false};frame.view={yaw:0,pitch:0};frame.eye=player;frame.effects=[];renderer.render(frame);
const fixedEffect={effect:'hit',weapon:'freezeGun',playerId:'me',fromX:player.x,fromY:player.y,x:player.x,y:player.y-100,hitHeight:26,damage:0,started:now};
renderer.captureEffect(fixedEffect);player.x+=40;frame.effects=[fixedEffect];renderer.render(frame);
const frozenBeam=scene.getObjectByName('fired-special-beam');assert(frozenBeam);const fixedPosition=frozenBeam.position.toArray(),fixedRotation=frozenBeam.quaternion.toArray();
player.x+=30;frame.view.yaw=.5;now+=30;renderer.render(frame);assert.deepEqual(frozenBeam.position.toArray(),fixedPosition);assert.deepEqual(frozenBeam.quaternion.toArray(),fixedRotation);
now+=300;frame.effects=Array.from({length:20},(_,i)=>({effect:'hit',weapon:'flamethrower',playerId:i<10?'me':'other'+i,fromX:100,fromY:100,x:100,y:0,damage:0,started:now}));renderer.render(frame);
const flames=scene.children.filter(o=>o.name==='flame-particles');assert(flames.length>0);assert(flames.every(o=>o.isPoints),'Flame emits particles, never cylinders or lines');assert(flames.reduce((n,o)=>n+o.geometry.drawRange.count,0)<=48);
assert(!scene.getObjectByName('fired-special-beam'));assert(find('heal:me').material.opacity>=.4);
console.log('FPS requested fixes passed: captured special shot origins, movement/turn stability, bounded flame particles and stronger heal area');
