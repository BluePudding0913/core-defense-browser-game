const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const THREE = require('../vendor/three.min.js');
let scene, camera, viewScene, viewCamera, webglRenderer, now=1000;
THREE.WebGLRenderer = class {
    constructor() { this.domElement={width:0,height:0,addEventListener(){}};this.shadowMap={};webglRenderer=this; }
    setSize(w,h) { this.domElement.width=w;this.domElement.height=h; }
    clearDepth() {}
    render(s,c) { if(c.near===.01){viewScene=s;viewCamera=c;viewScene.updateMatrixWorld(true);viewCamera.updateMatrixWorld(true);return;}scene=s;camera=c;scene.updateMatrixWorld(true);camera.updateMatrixWorld(true); }
};
const context=vm.createContext({window:{THREE},document:{body:{classList:{add(){}}}},performance:{now:()=>now},console});
for (const file of ['aim-control.js','soldier-model.js','sniper-stance.js','organic-enemy-models.js','lab-enemy-models.js','wall-impacts.js','block-terrain.js','map-object-models.js','hit-presentation.js','lab3d.js']) vm.runInContext(fs.readFileSync('client/'+file,'utf8'),context);
const renderer=context.window.Lab3D.create({width:900,height:500,before(){}});
assert.equal(webglRenderer.shadowMap.enabled, true, 'previews without settings keep shadows');
vm.runInContext(fs.readFileSync('client/graphics-settings.js','utf8'),context);
const player={id:'me',x:100,y:100,facingX:0,facingY:-1};
const state={core:{x:60,y:60},players:[player],enemies:[{id:1,type:'shield',x:180,y:100,hp:100,facingX:1,facingY:0}],slots:[
    {id:'turret',x:100,y:160,defense:{type:'turret'}},
    {id:'wire',x:140,y:160,defense:{type:'wire'}},
    {id:'mine',x:180,y:160,defense:{type:'mine'}},
    ...['barricade','copperBarricade','silverBarricade'].map((type,i)=>({id:type,x:60+i*40,y:200,defense:{type}}))
],resources:[{id:'ore',type:'ore',x:200,y:200,available:true},{id:'empty',type:'wood',x:220,y:220,available:false}],drops:[{id:1,type:'medkit',x:240,y:240}]};
const frame={map:{tileSize:40,rows:['#####','#...#','#...#','#...#','#####']},reachable:new Set(['1:1','1:2','1:3','2:1','2:2','2:3','3:1','3:2','3:3']),center:{x:140,y:140},scale:1,state,localId:'me',predicted:player,smooth:(_,p)=>p,radius:()=>24,stations:[[{id:'breaker',x:40,y:100},'', '#ff5964','breaker'],[{id:'unlock',x:40,y:140},'UNLOCK','#79d8ff','terminal']],aim:{x:200,y:100},effects:[]};
renderer.render(frame);
context.window.coreGraphicsSettings.setShadows(false);
renderer.render(frame);
assert.equal(webglRenderer.shadowMap.enabled, false, 'next frame disables shadow rendering');
context.window.coreGraphicsSettings.setShadows(true);
renderer.render(frame);
assert.equal(webglRenderer.shadowMap.enabled, true, 'next frame restores shadow rendering');
const initialGunBore=new THREE.Vector3(0,0,1).transformDirection(viewScene.getObjectByName('Rifle').matrixWorld);
const find=name=>{const result=scene.getObjectByName(name);assert(result,name);return result;};
const soldier=scene.children.find(o=>o.getObjectByName('Muzzle'));
assert(Math.abs(soldier.rotation.y-Math.PI/2)<1e-8,'Local actor faces pointer instead of movement');
const turret=find('defense:turret:turret'), head=turret.children.find(o=>o.type==='Group');
assert.equal(head.rotation.y,0,'New turret faces screen down (+Z)');
const muzzle=head.children.find(o=>o.type==='Object3D');assert(muzzle.position.z>0);
const wire=find('defense:wire:wire');assert(wire.children.some(o=>o.geometry?.type==='TubeGeometry'),'Wire has a barbed coil');
assert(!wire.children.some(o=>o.geometry?.type==='CylinderGeometry'),'Wire does not reuse mine disk');
assert(find('defense:mine:mine').children.some(o=>o.geometry?.type==='CylinderGeometry'));
for (const type of ['barricade','copperBarricade','silverBarricade']) {
    const block=find('defense:'+type+':'+type),size=new THREE.Box3().setFromObject(block).getSize(new THREE.Vector3());
    assert(size.x<=36 && size.z<=36 && size.y<=30,'Detailed barricades stay inside one tile and below the eye line');
    assert(block.children.length>=7,'Barricades have separate slats and supports');
}
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
for(const [i,type] of ['grunt','runner','carrier','shield','bomber','hunter','armored','artillery','coreHunter','seeker','blackout','siege','champion','warden','ghost'].entries()) {
    state.enemies=[{id:200+i,type,x:180,y:100,hp:100,facingX:-.6,facingY:-.8}];frame.effects=[];renderer.render(frame);
    assert(Math.abs(scene.getObjectByName('enemy:'+(200+i)).rotation.y-Math.atan2(-.6,-.8))<1e-8,'All enemy models use transmitted facing');
    const gear={shield:'Containment shield',bomber:'Demolition charge_-1',carrier:'Specimen backpack',hunter:'Torn patient gown',armored:'Protective vest',artillery:'Open launcher tube',coreHunter:'Recovery vest',seeker:'Seeker long coat',blackout:'Looped power cable',siege:'Crushing gauntlet',champion:'Supervisor coat',warden:'Hanging restraint chain'}[type];
    if(gear)assert(scene.getObjectByName('enemy:'+(200+i)).getObjectByName(gear),'Live enemy uses its assigned lab equipment');
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
const panel=find('station:wall-panel:terminal');assert.equal(panel.position.z,43);assert.equal(panel.position.x,100);
const panelLabel=renderer.stationPosition(wallTerminal);assert.equal(panelLabel.y,43);assert(renderer.project(panelLabel.x,panelLabel.y,38).visible);
for(const owner of ['a','b'])assert(find('decoy:'+owner).getObjectByName('Soldier'),'Each decoy has its own soldier, not terminal geometry');
assert.equal(find('decoy:a').rotation.y,Math.PI/2);assert.equal(find('decoy:b').rotation.y,Math.PI);
const stableMuzzle=viewScene.getObjectByName('Muzzle'),gunSignatures=new Set();
for(const weapon of ['bat','pistol','shotgun','smg','rifle','sniper','ricochet','revolver','railgun','rocket','flamethrower','lmg','hook','laserCannon','poisonGas','repulsor','freezeGun','plasmaBlade']) {
    player.weapon=weapon;renderer.render(frame);const gun=viewScene.getObjectByName('Rifle');assert.equal(gun.userData.weapon,weapon);
    assert.equal(viewScene.getObjectByName('Muzzle'),stableMuzzle,'Weapon swaps keep the tracer muzzle node');
    const signature=[];gun.traverse(c=>{if(c.isMesh)signature.push([c.geometry.type,c.geometry.parameters,c.geometry.attributes.position.count,c.position.toArray(),c.material.color.getHex()]);});
    gunSignatures.add(JSON.stringify(signature));
}
assert.equal(gunSignatures.size,18,'Every weapon has a distinct minimal model');
state.decoys=[];renderer.render(frame);assert(!scene.getObjectByName('decoy:a'));assert(!scene.getObjectByName('decoy:b'));
console.log('FPS visual models passed: visible wall panel and UI anchor, independent soldier decoys, all 18 weapon shapes and stable muzzle on swaps');
now+=400;player.weapon='pistol';state.enemies=[{id:77,type:'grunt',x:140,y:100,hp:100,facingX:0,facingY:1}];
frame.effects=[{effect:'hit',weapon:'pistol',playerId:'me',fromX:100,fromY:140,x:128,y:112,hitHeight:27.3,damage:0,enemyId:null,started:now},{effect:'hit',weapon:'pistol',playerId:'me',fromX:100,fromY:140,x:128,y:112,hitHeight:27.3,damage:26,enemyId:77,started:now}];renderer.render(frame);
const authoritativeTrace=scene.children.find(o=>o.name==='muzzle-tracer'),impactParticles=scene.children.find(o=>o.name==='enemy-hit-particles');
assert(Math.abs(authoritativeTrace.geometry.attributes.position.getY(1)-27.3)<1e-5,'Tracer uses server impact height');
assert.equal(impactParticles,undefined,'Enemy hits no longer create red particles');
console.log('FPS authoritative impact passed: tracer uses server XYZ impact without red particles');

// Motion and shape regressions use the rendered scene, including scope magnification.
frame.eye=player;frame.motion={moving:false};frame.effects=[];player.healRemaining=3;player.healHalfSize=60;player.healX=100;player.healY=100;now+=500;renderer.render(frame);
const heal=find('heal:me');assert.equal(heal.geometry.type,'PlaneGeometry');assert.equal(heal.scale.x*2,120);assert.equal(heal.scale.y*2,120);
player.weapon='sniper';frame.view={yaw:0,pitch:0,zoom:true};frame.scoped=true;renderer.render(frame);assert.equal(camera.fov,16);
frame.scoped=false;frame.view.zoom=false;player.jumpHeight=24;renderer.render(frame);assert.equal(camera.position.y,50);player.jumpHeight=0;
const gunPoseBeforeBat=viewScene.getObjectByName('Rifle').quaternion.clone();
player.weapon='bat';frame.effects=[];renderer.render(frame);const batRest=viewScene.getObjectByName('Rifle').quaternion.clone();
frame.effects=[{effect:'hit',weapon:'bat',playerId:'me',fromX:100,fromY:100,x:100,y:60,damage:0,started:now}];renderer.render(frame);
assert(!scene.children.some(o=>o.name.startsWith('special:')),'Bat never creates a blue beam');now+=180;renderer.render(frame);assert(viewScene.getObjectByName('Rifle').quaternion.angleTo(batRest)>.5,'Bat sweeps through the view');assert.equal(viewScene.getObjectByName('Soldier').rotation.z,0,'Swing never rolls the entire player');
now+=500;frame.effects=[];renderer.render(frame);assert(viewScene.getObjectByName('Rifle').quaternion.angleTo(batRest)<1e-6,'Bat returns smoothly to ready');player.weapon='sniper';
frame.effects=[{effect:'hit',weapon:'sniper',playerId:'me',fromX:100,fromY:100,x:100,y:60,damage:0,started:now+30}];now+=30;renderer.render(frame);assert(viewCamera.rotation.x<0,'Shot produces slight viewmodel recoil');
assert.deepEqual(viewScene.getObjectByName('Rifle').quaternion.toArray(),gunPoseBeforeBat.toArray(),'Switching from bat restores the original gun pose');
const boreAfterBat=new THREE.Vector3(0,0,1).transformDirection(viewScene.getObjectByName('Rifle').matrixWorld);assert(boreAfterBat.distanceTo(initialGunBore)<1e-6,'Gun barrel restores its original direction after a bat swing');
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

// New enemies share their rendered body dimensions with server FPS hit rules.
now+=500;frame.effects=[];state.enemies=[{id:501,type:'finalBoss',x:180,y:100,hp:140000,bossAction:'PULSE_WARNING',pulseRadius:260},{id:502,type:'poisoner',x:140,y:100,hp:400},{id:503,type:'artilleryElite',x:220,y:100,hp:900}];
state.poisonClouds=[{x:140,y:100,radius:55,remaining:4,hostile:true}];frame.radius=e=>({finalBoss:58,poisoner:20,artilleryElite:27})[e.type]||21;renderer.render(frame);
for(const e of state.enemies){const root=find('enemy:'+e.id);if(e.type==='poisoner'){assert(root.getObjectByName('Reagent tank_-1'));assert(Math.abs(new THREE.Box3().setFromObject(root).max.y-frame.radius(e)*1.55)<.01);}else assert.equal(root.children[0].scale.x,frame.radius(e)*.9);}
assert.equal(find('boss-warning:501').scale.x,260,'Final boss pulse has a visible 3D warning');
assert.equal(find('gas:0').scale.x,55);assert(find('gas:0').material.color.equals(new THREE.Color('#a6ce46')),'Small hostile poison uses its own radius and color');
console.log('FPS new enemies passed: body sizes, final boss warning and hostile poison');

// Handheld devices use their actual silhouette, not a recolored rifle.
frame.motion={moving:false};frame.effects=[];player.weapon='poisonGas';renderer.render(frame);
const bottle=viewScene.getObjectByName('BottleBody');assert(bottle);assert.equal(bottle.material.color.getHex(),0x974be0);assert.equal(bottle.geometry.type,'CylinderGeometry');assert(viewScene.getObjectByName('BottleCap'));
player.weapon='repulsor';renderer.render(frame);assert(viewScene.getObjectByName('RemoteBody'));assert(viewScene.getObjectByName('RemoteScreen'));assert(!viewScene.getObjectByName('RemoteAntenna'));assert(!viewScene.getObjectByName('BottleBody'));
now+=1000;const pressure={effect:'hit',weapon:'repulsor',playerId:'me',fromX:100,fromY:100,x:260,y:100,damage:0,started:now-350};frame.effects=[pressure];renderer.render(frame);
const wave=find('repulsor-longitudinal-wave'),positions=wave.geometry.attributes.position,beforePressure=Array.from(positions.array);assert.equal(wave.geometry.drawRange.count,90);assert(!scene.children.some(o=>o.name.startsWith('blast:')),'Repulsor creates no ground impact ring');
now+=25;renderer.render(frame);assert.notEqual(positions.getX(20),beforePressure[60],'Pressure particles oscillate along propagation');for(let i=0;i<90;i++){assert.equal(positions.getY(i),beforePressure[i*3+1]);assert.equal(positions.getZ(i),beforePressure[i*3+2],'No transverse oscillation');}
state.missiles=[{x:100,y:60,radius:100,remaining:1}];renderer.render(frame);assert.equal(find('missile-beacon:0').scale.y,98);assert(find('missile-inner:0'));
state.missiles=[];now+=100;frame.effects=[{effect:'missile-impact',x:100,y:60,started:now}];renderer.render(frame);assert(find('missile-impact-flash').material.opacity>0);assert(scene.children.some(o=>o.name.startsWith('missile-flash-column:')));assert(!scene.getObjectByName('repulsor-longitudinal-wave'),'Expired pressure wave removed');
now+=700;renderer.render(frame);assert(!scene.getObjectByName('missile-impact-flash'),'Impact fades and is disposed');
player.railgunRemaining=1;frame.view.pitch=.2;frame.view.yaw=.3;frame.motion={moving:true};renderer.render(frame);assert.equal(camera.rotation.x,.2);assert.equal(camera.rotation.z,0,'Railgun camera has no bob or recoil drift');player.railgunRemaining=0;
console.log('Weapon FX passed: purple bottle, remote, longitudinal compression, no repulsor impact, missile beacon/flash/expiry and stable railgun view');

const precisionModel=context.window.buildSoldier(THREE),precisionMuzzle=precisionModel.root.getObjectByName('Muzzle');
precisionModel.setWeapon('sniper');
const precision=precisionModel.root.getObjectByName('PrecisionSniper');
assert(precision && precision.children.length<=7,'Detailed rifle is batched to at most seven material draws');
const bounds=new THREE.Box3().setFromObject(precision);
assert(bounds.max.z>1.24 && bounds.min.z<-.50,'Long barrel and adjustable stock have full-size silhouettes');
assert(precisionMuzzle.position.z>bounds.max.z,'Shared tracer muzzle stays ahead of the open crown');
const bodyView=precision.clone();bodyView.updateMatrixWorld(true);
const throughBody=(y,z)=>new THREE.Raycaster(new THREE.Vector3(-.2,y,z),new THREE.Vector3(1,0,0)).intersectObject(bodyView,true);
assert.equal(throughBody(-.028,.385).length,0,'Handguard slots are real openings through both side walls');
assert(throughBody(-.055,.385).length>0,'Handguard keeps structural material around the opening');
assert.equal(throughBody(-.055,-.30).length,0,'Stock frame has an open center rather than a painted recess');
assert(throughBody(-.096,-.30).length>0,'Stock lower frame remains solid');
const outerHit=(y,z)=>throughBody(y,z)[0];
assert(outerHit(-.035,.17).distance-outerHit(-.010,.17).distance>.01,'Chassis pocket has a bottom physically recessed more than 10mm');
const topAt=x=>new THREE.Raycaster(new THREE.Vector3(x,.2,-.30),new THREE.Vector3(0,-1,0)).intersectObject(bodyView,true)[0].point.y;
assert(topAt(0)-topAt(.040)>.005,'Cheek rest has a curved cross-section rather than a flat extrusion');
const paintSurface=bodyView.getObjectByName('SniperSandSurface');
assert.equal(paintSurface.geometry.attributes.color.count,paintSurface.geometry.attributes.position.count,'Cavity shading survives material batching');
assert.equal(throughBody(-.028,.78).length,0,'Mk II fore-end keeps its forward vent open');
const crownRay=new THREE.Raycaster(new THREE.Vector3(0,.01,1.8),new THREE.Vector3(0,0,-1)).intersectObject(bodyView,true);
assert(!crownRay.some(h=>h.point.z>1.11),'Extended muzzle assembly has an open bore');
const shroudRay=throughBody(.01,1.30);assert(shroudRay.length>0 && shroudRay[0].face.normal.x<0,'Muzzle hull has an outward-facing surface');
const barrelHit=new THREE.Raycaster(new THREE.Vector3(0,.15,1.0),new THREE.Vector3(0,-1,0)).intersectObject(bodyView,true)[0];
assert(barrelHit.face.normal.y>0,'Fluted barrel normals point outwards');
let detailTriangles=0;
for(const surface of precision.children){
 const a=surface.geometry.attributes;
 assert.equal(a.position.count,a.normal.count);assert.equal(a.position.count,a.uv.count);
 assert([...a.position.array,...a.normal.array].every(Number.isFinite),'Batched geometry has finite positions and normals');
 detailTriangles+=surface.geometry.index.count/3;
}
assert(detailTriangles<25000,'Precision detail stays within the game triangle budget');
assert.notEqual(precisionModel.materials.SniperGlass.roughness,precisionModel.materials.SniperRubber.roughness);
assert(precisionModel.materials.SniperSteel.normalMap && precisionModel.materials.SniperSteel.envMap);
const sniperMaterials=precisionModel.materials;
let disposed=0;precision.children.forEach(o=>o.geometry.addEventListener('dispose',()=>disposed++));
precisionModel.setWeapon('pistol');assert.equal(disposed,7,'All batched weapon surfaces are released on swap');
assert.equal(precisionModel.root.getObjectByName('Muzzle'),precisionMuzzle);
precisionModel.setWeapon('sniper');assert.equal(precisionModel.materials,sniperMaterials,'Material maps are reused when re-equipping');
let textureDisposals=0;
for(const t of [sniperMaterials.SniperSteel.normalMap,sniperMaterials.SniperSteel.roughnessMap,sniperMaterials.SniperSteel.envMap,sniperMaterials.SniperSand.roughnessMap])t.addEventListener('dispose',()=>textureDisposals++);
Object.values(sniperMaterials).forEach(m=>m.dispose());assert.equal(textureDisposals,4,'Weapon-specific textures are released with their actor');
console.log('Precision sniper passed: silhouette, batched geometry budget, distinct PBR surfaces, muzzle stability and geometry/texture lifetime');

// Extended Mk II muzzle still lines up between the hand camera and world tracer.
now+=1000;player.weapon='sniper';frame.scoped=false;frame.view={yaw:.3,pitch:.12};frame.motion=undefined;frame.effects=[];renderer.render(frame);
const mk2MuzzleNdc=viewScene.getObjectByName('Muzzle').getWorldPosition(new THREE.Vector3()).project(viewCamera);
frame.effects=[{effect:'hit',weapon:'sniper',playerId:'me',fromX:player.x,fromY:player.y,x:player.x+70,y:player.y-200,hitHeight:35,damage:0,started:now}];
renderer.render(frame);
const mk2Trace=scene.children.find(o=>o.name==='muzzle-tracer');
const mk2OriginNdc=new THREE.Vector3().fromBufferAttribute(mk2Trace.geometry.attributes.position,0).project(camera);
assert(Math.hypot(mk2OriginNdc.x-mk2MuzzleNdc.x,mk2OriginNdc.y-mk2MuzzleNdc.y)<1e-4,'Mk II tracer starts at the extended visible muzzle');
console.log('Mk II integration passed: extended hand-model muzzle aligns with the world shot');

// A fast sprint cannot speed the vertical bob beyond a natural stride.
frame.effects=[];frame.scoped=false;frame.view={yaw:0,pitch:0};frame.motion={moving:false};
player.weapon='pistol';for(let i=0;i<90;i++){now+=1000/60;renderer.render(frame);}
const standardViewDepth=viewCamera.position.z;player.weapon='sniper';renderer.render(frame);
assert(viewCamera.position.z<standardViewDepth,'Long sniper sits farther from the eye to expose more receiver');
assert.equal(viewCamera.fov,62);player.weapon='pistol';renderer.render(frame);assert.equal(viewCamera.fov,58,'Other weapons retain their perspective');
frame.motion={moving:true,dashing:true};
let lastBobSign=0,crossings=0;
for(let i=0;i<180;i++){
    player.y-=400/60;now+=1000/60;renderer.render(frame);
    const sign=Math.sign(camera.position.y-26);
    if(sign && lastBobSign && sign!==lastBobSign)crossings++;
    if(sign)lastBobSign=sign;
}
assert(crossings>=8 && crossings<=12,'Sprint bob stays below two vertical cycles per second, rather than following dash speed');
frame.motion.moving=false;
for(let i=0;i<90;i++){now+=1000/60;renderer.render(frame);}
assert(Math.abs(camera.position.y-26)<1e-7,'Sprint bob settles after stopping');
console.log('FPS comfort passed: natural sprint cadence, smooth settling and visible sniper receiver');

// Four cardinal mounts: backs touch the wall and the screen faces accessible floor.
frame.motion={moving:false};frame.effects=[];frame.view={yaw:0,pitch:0};frame.scoped=false;
frame.map={tileSize:40,rows:Array(7).fill('.......')};frame.stations=[];
for(const [dx,dz] of [[0,1],[1,0],[0,-1],[-1,0]]) {
 for(const kind of ['terminal','breaker']) {
  const point={id:'mount-'+kind+'-'+dx+'-'+dz,x:100,y:100};
  frame.reachable=new Set([(2+dz)+':'+(2+dx)]);frame.stations=[[point,'', '#79d8ff',kind]];now+=16;renderer.render(frame);
  const model=scene.getObjectByName('station:'+point.id+':'+kind),depth=kind==='breaker'?4.5:3;
  assert(model.userData.wallMounted);
  assert(Math.abs(Math.sin(model.rotation.y)-dx)<1e-8);assert(Math.abs(Math.cos(model.rotation.y)-dz)<1e-8);
  const back=new THREE.Vector3(0,0,-depth).applyMatrix4(model.matrixWorld);
  assert(Math.abs(back.x-(100+dx*20))<1e-8);assert(Math.abs(back.z-(100+dz*20))<1e-8,'Panel back is flush with wall');
 }
 const point={id:'inside-'+dx+'-'+dz,x:100,y:100};frame.reachable=new Set();
 for(let r=0;r<7;r++)for(let c=0;c<7;c++)if(r!==2+dz||c!==2+dx)frame.reachable.add(r+':'+c);
 frame.stations=[[point,'','#89cbd8','breaker']];renderer.render(frame);
 const model=scene.getObjectByName('station:'+point.id+':breaker');
 assert(Math.abs(Math.sin(model.rotation.y)+dx)<1e-8);assert(Math.abs(Math.cos(model.rotation.y)+dz)<1e-8,'Floor-side breaker faces away from wall');
}
frame.stations=[];frame.reachable=new Set();for(let r=0;r<7;r++)for(let c=0;c<7;c++)frame.reachable.add(r+':'+c);
player.x=140;player.y=220;frame.eye=player;frame.predicted=player;state.blackoutActive=true;player.drone=null;renderer.render(frame);
assert(scene.fog && scene.fog.near===48 && scene.fog.far===160,'Blackout has a bounded nearby view');
assert.equal(scene.getObjectByName('enemy-readability-fill').visible,false,'Enemy fill cannot bypass blackout');
const nearbyLight=scene.getObjectByName('blackout-nearby-light');assert(nearbyLight.visible);assert.deepEqual(nearbyLight.position.toArray(),camera.position.toArray());
assert.equal(renderer.project(140,40,26).visible,false,'Distant labels do not float in darkness');
assert.equal(renderer.project(140,180,26).visible,true,'Nearby points remain visible');
player.x+=15;renderer.render(frame);assert.equal(nearbyLight.position.x,player.x,'Near illumination follows the player');
player.drone={controlled:true};renderer.render(frame);assert.equal(scene.fog,null,'Drone retains night vision');assert(!nearbyLight.visible);
player.drone=null;frame.nightVision=true;renderer.render(frame);assert.equal(scene.fog,null,'Drone aftermath retains night vision');
frame.nightVision=false;state.blackoutActive=false;renderer.render(frame);assert.equal(scene.fog,null);assert(!nearbyLight.visible);
assert.equal(scene.children.find(c=>c.isHemisphereLight).intensity,.75,'Lighting restores after power returns');
const enemyFill=scene.getObjectByName('enemy-readability-fill');assert(enemyFill.visible&&enemyFill.layers.mask===2);
assert(Math.abs(enemyFill.position.y-camera.position.y-30)<1e-6,'Enemy fill follows the viewing position');
state.enemies=[{id:688,type:'runner',x:140,y:160,hp:100,facingY:1}];renderer.render(frame);
const litEnemy=scene.getObjectByName('enemy:688');litEnemy.traverse(o=>{if(o.isMesh)assert(o.layers.mask&2,'Enemy meshes receive the soft fill');});
assert.equal(terrain.children.find(o=>o.isInstancedMesh).layers.mask,1,'Room surfaces do not receive the enemy-only fill');
const skinColor=litEnemy.getObjectByName('Anatomical head').material.color;
assert(Math.abs(skinColor.r-new THREE.Color('#9b9f8d').r)<1e-10,'Live renderer uses skin color converted once');
console.log('Lab visibility passed: flush panels, four-way breakers, nearby blackout vision, moving light and drone/restoration lifecycle');

// A sniper posture lowers both the camera and the remote body, and restores standing afterwards.
frame.motion={moving:false};frame.effects=[];frame.scoped=true;frame.view={yaw:0,pitch:0};player.weapon='sniper';
player.sniper={fixed:true,pitch:0,facingX:0,facingY:1};
const observer={...player,id:'prone-other',x:player.x+30,y:player.y-50};state.players.push(observer);now+=16;renderer.render(frame);
assert.equal(camera.position.y,6.2,'Prone camera matches the authoritative firing height');
const remote=scene.children.find(o=>o!==soldier && o.getObjectByName('Hips') && o.visible);
assert(remote,'Other players see the prone soldier');
assert(Math.abs(remote.getObjectByName('Hips').position.y-.18)<1e-8);
observer.sniper={fixed:false};player.sniper={fixed:false};frame.scoped=false;now+=100;renderer.render(frame);
assert(Math.abs(camera.position.y-26)<1e-6);assert(remote.getObjectByName('Hips').position.y>.8,'Leaving the stance restores standing animation');
frame.motion={moving:false};frame.effects=[{effect:'hit',weapon:'sniper',playerId:'me',fromX:player.x,fromY:player.y,x:player.x+100,y:player.y,hitHeight:26,damage:0,started:now}];renderer.render(frame);
assert(frame.view.pitch>.04,'Sniper recoil actually changes the player aim');const kickedPitch=frame.view.pitch,kickedYaw=frame.view.yaw;
assert(Math.abs(frame.view.recoilPitch)<1e-8,'Persistent sniper kick is not counted twice');
frame.effects=[];for(let i=0;i<120;i++){now+=1000/60;renderer.render(frame);}assert.equal(frame.view.pitch,kickedPitch,'Aim stays displaced after the gun animation settles');assert.equal(frame.view.yaw,kickedYaw,'No repeated recoil for the same shot');
frame.scoped=true;frame.view.zoom=true;renderer.render(frame);assert.equal(camera.fov,16);frame.scoped=false;frame.view.zoom=false;renderer.render(frame);assert.equal(camera.fov,72);
console.log('Sniper integration passed: prone camera/body, standing restore and strong recoil recovery');

// The mixer caches constant tracks. Repeated procedural overrides must not survive a swap.
frame.scoped=false;frame.view.zoom=false;frame.effects=[];
for(const weapon of ['pistol','rifle','shotgun','sniper','railgun'])for(const scoped of [false,true]) {
 player.weapon='bat';frame.scoped=false;now+=20;renderer.render(frame);
 frame.effects=[{effect:'hit',weapon:'bat',playerId:'me',damage:0,fromX:player.x,fromY:player.y,x:player.x,y:player.y-60,started:now}];renderer.render(frame);now+=180;renderer.render(frame);
 player.weapon=weapon;frame.effects=[];frame.scoped=scoped;now+=20;renderer.render(frame);
 viewScene.updateMatrixWorld(true);const bore=new THREE.Vector3(0,0,1).transformDirection(viewScene.getObjectByName('Rifle').matrixWorld);
 assert(bore.distanceTo(initialGunBore)<1e-6,weapon+' restores its forward bore on the first frame, scope='+scoped);
 now+=20;renderer.render(frame);viewScene.updateMatrixWorld(true);assert(new THREE.Vector3(0,0,1).transformDirection(viewScene.getObjectByName('Rifle').matrixWorld).distanceTo(initialGunBore)<1e-6,'Next frame retains the restored bore');
}
console.log('Bat-to-gun regression passed: first-frame restore, repeated switches, five guns, scope and cached constant tracks');

// Confirmed local hits tint only that enemy, then restore frozen/original materials.
frame.effects=[];state.enemies=[{id:901,type:'grunt',x:100,y:120,hp:100},{id:902,type:'grunt',x:140,y:120,hp:100}];now+=500;renderer.render(frame);
const hitZombie=scene.getObjectByName('enemy:901'),otherZombie=scene.getObjectByName('enemy:902'),normalCoat=hitZombie.getObjectByName('Open lab coat').material;
frame.effects=[{effect:'hit',enemyId:901,playerId:'other',damage:20,started:now}];renderer.render(frame);const allyRed=hitZombie.getObjectByName('Open lab coat').material.color.r;assert(allyRed>normalCoat.color.r,'Ally hits tint the target lightly');
now+=180;
frame.effects=[{effect:'hit',enemyId:901,playerId:'me',damage:0,started:now}];renderer.render(frame);assert.equal(hitZombie.getObjectByName('Open lab coat').material,normalCoat,'Misses do not flash');
frame.effects=[{effect:'hit',enemyId:901,playerId:'me',damage:20,started:now}];renderer.render(frame);assert(hitZombie.getObjectByName('Open lab coat').material.color.r>allyRed,'Own hits are much redder than ally hits');assert.equal(otherZombie.getObjectByName('Open lab coat').material,normalCoat,'Shared materials never tint another enemy');
now+=180;state.enemies[0].frozenRemaining=1;renderer.render(frame);assert.equal(hitZombie.getObjectByName('Open lab coat').material.color.getHexString(),'95dded','Freeze state wins after flash expiry');state.enemies[0].frozenRemaining=0;renderer.render(frame);assert.equal(hitZombie.getObjectByName('Open lab coat').material,normalCoat);assert(hitZombie.children.length>0);
console.log('Hit tint passed: stronger own hits, faint ally hits, shared material isolation, freeze restoration and expiry');

// Every ordinary gun displaces actual aim, once per discharge, including scatter pellets.
for(const weapon of ['pistol','smg','rifle','revolver','lmg','shotgun','ricochet','freezeGun','sniper']) {
 player.weapon=weapon;frame.view={yaw:0,pitch:0};frame.scoped=false;now+=200;
 const shot={effect:'hit',weapon,playerId:'me',damage:0,started:now,fromX:player.x,fromY:player.y,x:player.x,y:player.y-100};
 frame.effects=Array.from({length:weapon==='shotgun'?6:1},()=>({...shot}));renderer.render(frame);
 const pitch=context.window.AimControl.recoilPitch(weapon);assert.equal(frame.view.pitch,pitch,weapon+' kicks actual aim once');
 renderer.render(frame);assert.equal(frame.view.pitch,pitch,'Rendering cannot repeat kick');
 frame.effects=[];now+=2000;renderer.render(frame);assert.equal(frame.view.pitch,pitch,'Gun settling cannot restore aim');assert.equal(frame.view.recoilPitch,0,'No additional temporary aim displacement');
}
console.log('Common recoil passed: nine guns, shotgun discharge deduplication and persistent aim displacement');

// Spawn markers are unlit wall recesses on each of the four cardinal wall faces.
frame.effects=[];frame.map={tileSize:40,rows:Array(5).fill('.....')};
for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
 frame.map={tileSize:40,rows:Array(5).fill('.....')};const cells=frame.map.rows[2+dz].split('');cells[2+dx]='#';frame.map.rows[2+dz]=cells.join('');
 frame.reachable=new Set(['2:2','2:3','2:1','1:2','3:2']);frame.reachable.delete((2+dz)+':'+(2+dx));
 frame.stations=[[{id:'entry-'+dx+'-'+dz,x:100,y:100},'','#222b30','spawn']];now+=20;renderer.render(frame);
 const portal=scene.getObjectByName('station:entry-'+dx+'-'+dz+':spawn');assert(portal.userData.wallMounted);
 assert(Math.abs(portal.position.x-(100+dx*19.65))<1e-8);assert(Math.abs(portal.position.z-(100+dz*19.65))<1e-8);
 assert(Math.abs(Math.sin(portal.rotation.y)+dx)<1e-8);assert(Math.abs(Math.cos(portal.rotation.y)+dz)<1e-8);
 assert.equal(portal.children.length,4);assert(portal.children.every(m=>m.material.emissiveIntensity===0),'No glowing gate or floor decoration');
}
frame.stations=[];frame.reachable=new Set(['2:2']);now+=20;renderer.render(frame);
const marks=scene.getObjectByName('wall-impact-marks'),shot={effect:'hit',weapon:'pistol',playerId:'me',damage:0,enemyId:null,fromX:100,fromY:100,fromHeight:26,x:116,y:100,hitHeight:26,started:now};
frame.effects=[shot];renderer.render(frame);assert.equal(marks.count,1);const hitMatrix=new THREE.Matrix4();marks.getMatrixAt(0,hitMatrix);const wallPoint=new THREE.Vector3().setFromMatrixPosition(hitMatrix);assert(Math.abs(wallPoint.x-119.95)<.00001);assert.equal(wallPoint.y,26);
renderer.render(frame);assert.equal(marks.count,1,'Same shot cannot create repeated marks');
frame.view.yaw+=1;renderer.render(frame);marks.getMatrixAt(0,hitMatrix);assert(new THREE.Vector3().setFromMatrixPosition(hitMatrix).distanceTo(wallPoint)<1e-8,'Marks stay on the wall as camera turns');
frame.effects=Array.from({length:50},()=>({...shot}));renderer.render(frame);assert.equal(marks.count,32,'Instanced mark budget is capped');
frame.effects=[];now+=2000;renderer.render(frame);assert.equal(marks.count,0,'Marks expire independently of event retention');
console.log('Simple spawn and wall impact integration passed: four faces, no glow, stable world placement, deduplication, 32-mark cap and expiry');

player.weapon='sniper';frame.effects=[];frame.scoped=true;frame.view={yaw:0,pitch:0,zoom:true,sniperAds:.5};now+=1000;renderer.render(frame);
assert.equal(camera.fov,44,'World zoom follows scope animation');
assert(viewScene.getObjectByName('Rifle').parent.visible,'Gun stays visible while moving toward scope');
const midEye=viewCamera.position.clone();frame.view.sniperAds=0;renderer.render(frame);
assert(midEye.distanceTo(viewCamera.position)>.1,'Eye moves toward physical scope');
frame.view.sniperAds=1;renderer.render(frame);assert.equal(camera.fov,16);
console.log('Eye-to-scope transition passed');

const actual=JSON.parse(fs.readFileSync('shared/map.json','utf8')).tileMap;frame.map=actual;frame.reachable=new Set();
for(let r=0;r<actual.rows.length;r++)for(let col=0;col<actual.rows[r].length;col++)if(actual.rows[r][col]==='.')frame.reachable.add(r+':'+col);
frame.scoped=false;frame.view={yaw:0,pitch:.3};frame.eye={x:1260,y:1100};renderer.render(frame);
const actualRoof=scene.getObjectByName('lab-ceilings');
for(let r=23;r<=29;r++)for(let col=29;col<=36;col++)if(actual.rows[r][col]==='.') {
 let found=false;for(let i=0;i<actualRoof.count;i++){actualRoof.getMatrixAt(i,m);m.decompose(pos,q,scale);if(Math.abs(pos.x-(col+.5)*40)<.01&&Math.abs(pos.z-(r+.5)*40)<.01){assert.equal(pos.y-scale.y/2,130);found=true;}}
 assert(found,'Explicit ceiling is rendered in transit hall');
}
const terrainInstances=['lab-floors','lab-walls','lab-ceilings','lab-bulkheads','lab-ceiling-lights'].reduce((n,name)=>n+scene.getObjectByName(name).count,0);assert(terrainInstances<5000,'No per-voxel geometry expansion');
console.log('Shared 3D map render passed: flat transit ceiling, compressed terrain '+terrainInstances+' instances');

frame.effects=[];frame.stations=[[{id:'locked-neighbor-spawn',x:100,y:100},'','#222b30','spawn']];
frame.map={tileSize:40,rows:['#####','#...#','##..#','#...#','#####']};frame.reachable=new Set(['2:2','2:3','1:2']);renderer.render(frame);
const stablePortal=scene.getObjectByName('station:locked-neighbor-spawn:spawn'),portalBefore=stablePortal.position.clone(),rotationBefore=stablePortal.rotation.y;
assert(Math.abs(portalBefore.x-80.35)<1e-8,'Spawn mounts on permanent west wall, not the locked south gate');
frame.reachable=new Set(['1:1','1:2','1:3','2:2','2:3','3:1','3:2','3:3']);renderer.render(frame);
const openedPortal=scene.getObjectByName('station:locked-neighbor-spawn:spawn');assert(openedPortal.position.distanceTo(portalBefore)<1e-8);assert.equal(openedPortal.rotation.y,rotationBefore,'Unlock cannot turn or move a spawn recess');
console.log('Spawn orientation regression passed: same permanent wall before/after unlocking adjacent sector');
// Downed players crawl on their elbows, stop smoothly, and fully restore after revival.
{
frame.effects=[];observer.down=true;observer.sniper={fixed:true,pitch:.2,facingX:1,facingY:0};
observer.facingX=1;observer.facingY=0;now+=16;renderer.render(frame);
assert.equal(remote.rotation.x,0,'The actor is not a rotated standing model');
assert(Math.abs(remote.rotation.y-Math.PI/2)<1e-8,'Down overrides the sniper facing');
assert.equal(remote.getObjectByName('Rifle').visible,false,'Downed players free both hands');
const bounds=new THREE.Box3();remote.updateMatrixWorld(true);
remote.traverseVisible(part=>{if(part.isMesh)bounds.union(new THREE.Box3().setFromObject(part));});
assert(bounds.min.y>-.5 && bounds.max.y<12,'Crawling body stays low and above the floor');
const hand=side=>remote.getObjectByName('LowerArm_'+side).localToWorld(new THREE.Vector3(0,-.33,0));
assert(hand('L').y<3 && hand('R').y<3,'Both hands rest near the floor');
const crawlModel=context.window.buildSoldier(THREE);
for(let i=0;i<24;i++) {
    crawlModel.poseDown(i*Math.PI/12,1);crawlModel.root.updateMatrixWorld(true);
    const cycleBounds=new THREE.Box3();
    crawlModel.root.traverseVisible(part=>{if(part.isMesh)cycleBounds.union(new THREE.Box3().setFromObject(part));});
    assert(cycleBounds.min.y>-.03 && cycleBounds.max.y<.75,'Entire crawl cycle remains grounded and low');
}
const firstArm=remote.getObjectByName('UpperArm_L').quaternion.clone();
for(let i=0;i<20;i++){observer.x+=.75;now+=1000/60;renderer.render(frame);}
assert(firstArm.angleTo(remote.getObjectByName('UpperArm_L').quaternion)>.1,'Travel drives the crawling stroke');
for(let i=0;i<100;i++){now+=1000/60;renderer.render(frame);}
const stopped=remote.getObjectByName('UpperArm_L').quaternion.clone();
now+=16;renderer.render(frame);assert(stopped.angleTo(remote.getObjectByName('UpperArm_L').quaternion)<.001,'Stopped crawl settles instead of walking in place');
observer.down=false;observer.sniper={fixed:false};now+=16;renderer.render(frame);
assert(remote.getObjectByName('Hips').position.y>.8,'Revival immediately restores standing');
assert.equal(remote.getObjectByName('Rifle').visible,true,'Revival restores the held weapon');
observer.sniper={fixed:true,pitch:0,facingX:0,facingY:1};now+=16;renderer.render(frame);
assert.equal(remote.getObjectByName('Rifle').visible,true,'Sniper stance after revival keeps the rifle');
assert(Math.abs(remote.getObjectByName('Rifle').scale.x-.86)<1e-8);
observer.sniper={fixed:false};now+=16;renderer.render(frame);
assert.equal(remote.getObjectByName('Rifle').scale.x,1,'Leaving prone restores the gun scale on the first frame');
console.log('Down crawl passed: grounded anatomy, facing, traveling strokes, smooth stop, revival and sniper transitions');

}

// High-detail models preserve world tracer alignment at several aim angles.
{
frame.effects=[];frame.scoped=false;frame.motion=undefined;frame.eye=player;
for(const weapon of ['pistol','shotgun'])for(const angle of [{yaw:0,pitch:0},{yaw:.6,pitch:.35}]) {
    player.weapon=weapon;frame.view={...angle,zoom:false};now+=100;renderer.render(frame);
    frame.effects=[{effect:'hit',weapon,playerId:'me',fromX:player.x,fromY:player.y,x:player.x+Math.sin(angle.yaw)*250,y:player.y-Math.cos(angle.yaw)*250,damage:0,started:now}];
    renderer.render(frame);
    const shot=scene.children.find(o=>o.name==='muzzle-tracer'),a=shot.geometry.attributes.position;
    const origin=new THREE.Vector3().fromBufferAttribute(a,0).project(camera);
    const visibleMuzzle=viewScene.getObjectByName('Muzzle').getWorldPosition(new THREE.Vector3()).project(viewCamera);
    assert(Math.hypot(origin.x-visibleMuzzle.x,origin.y-visibleMuzzle.y)<1e-5,'Detailed weapon tracer starts at its visible muzzle');
    const end=new THREE.Vector3().fromBufferAttribute(a,1).project(camera);assert(Math.hypot(end.x,end.y)<1e-5,'Weapon details do not displace the shot aim');
    frame.effects=[];now+=500;renderer.render(frame);
}
console.log('Detailed pistol/shotgun FPS tracer alignment passed');
}

// Continuous rail effects follow the muzzle and release all transient meshes.
{
frame.effects=[];frame.view={yaw:.4,pitch:.2,zoom:false};player.down=false;
now=Math.ceil(now/625)*625;
Object.assign(player,{weapon:'railgun',railgunCharge:.3,railgunRemaining:0});
renderer.render(frame);
const railCore=find('rail:memain:charge-core');
const muzzleNdc=viewScene.getObjectByName('Muzzle').getWorldPosition(new THREE.Vector3()).project(viewCamera);
const chargeNdc=railCore.position.clone().project(camera);
assert(Math.hypot(muzzleNdc.x-chargeNdc.x,muzzleNdc.y-chargeNdc.y)<1e-5,'Charge gathers at the visible FPS muzzle');
const particles=scene.children.filter(o=>o.name.startsWith('rail:memain:particle:'));
assert.equal(particles.length,12);
const firstDistance=particles[0].position.distanceTo(railCore.position),firstSize=railCore.scale.x;
now+=100;renderer.render(frame);
assert(particles[0].position.distanceTo(railCore.position)<firstDistance,'Blue particles converge toward the muzzle: '+firstDistance+' -> '+particles[0].position.distanceTo(railCore.position));
player.railgunCharge=.9;renderer.render(frame);
assert(railCore.scale.x>firstSize,'Charge core grows with charge progress');
Object.assign(player,{railgunCharge:0,railgunRemaining:1,railgunDx:0,railgunDy:-1,railgunRange:1200,railgunPitch:.2});
renderer.render(frame);
assert(!scene.getObjectByName('rail:memain:charge-core'),'Charge disappears on discharge');
const halo=find('rail:memain:halo'),core=find('rail:memain:core');
assert(halo.scale.x>=10 && core.scale.x>2,'Beam has a broad blue halo and readable white core');
assert(halo.material.color.equals(new THREE.Color('#247aff')));assert(core.material.color.equals(new THREE.Color('#e5f7ff')));
assert.equal(core.material.toneMapped,false,'Beam stays bright regardless of room lighting');
const endpoint=core.position.clone().add(new THREE.Vector3(0,core.scale.y/2,0).applyQuaternion(core.quaternion));
assert(endpoint.distanceTo(new THREE.Vector3(player.x,26+Math.tan(.2)*1200,player.y-1200))<1e-5,'Wider beam preserves authoritative direction, range and pitch');
player.down=true;renderer.render(frame);assert(!scene.children.some(o=>o.name.startsWith('rail:me')),'Down state clears beam and charge');
player.down=false;player.weapon='pistol';player.railgunRemaining=0;player.job='attacker';
player.secondaryWeapon='railgun';player.secondaryRailgunCharge=.5;renderer.render(frame);
assert(find('rail:mesub:charge-core'));assert(!scene.getObjectByName('rail:memain:charge-core'));
player.secondaryRailgunCharge=0;renderer.render(frame);assert(!scene.children.some(o=>o.name.startsWith('rail:me')),'Cancellation clears secondary charge');
const remote={id:'rail-remote',x:140,y:100,weapon:'railgun',railgunCharge:.6,facingX:1,facingY:0};state.players.push(remote);renderer.render(frame);
const remoteBody=scene.children.find(o=>o.userData.entity?.x===140 && o.userData.entity?.y===100 && o.getObjectByName('Muzzle'));
const remoteMuzzle=remoteBody.getObjectByName('Muzzle').getWorldPosition(new THREE.Vector3());
assert(find('rail:rail-remotemain:charge-core').position.distanceTo(remoteMuzzle)<1e-5,'Remote charge uses actual gun muzzle');
state.players.pop();renderer.render(frame);assert(!scene.getObjectByName('rail:rail-remotemain:charge-core'),'Disconnect clears charge');
console.log('Railgun light passed: blue-white beam, muzzle alignment, converging charge, range/pitch, secondary hand and lifecycle');
}

// Lethal notifications can arrive with a snapshot that already removed the enemy.
now+=1000;frame.effects=[];state.enemies=[{id:3001,type:'grunt',x:player.x,y:player.y-80,hp:100,facingX:0,facingY:1}];renderer.render(frame);
const victim=scene.getObjectByName('enemy:3001'),headBounds=new THREE.Box3().setFromObject(victim.getObjectByName('Anatomical head'));
const lethal={effect:'hit',weapon:'rifle',enemyId:3001,playerId:'me',damage:100,defeated:true,headshot:true,x:player.x,y:player.y-80,fromX:player.x,fromY:player.y,started:now};
state.enemies=[];frame.effects=[lethal];renderer.render(frame);
assert.equal(scene.getObjectByName('enemy:3001'),victim,'Death retains the actual model after snapshot removal');
assert(victim.userData.presentationOnly,'Death is excluded from the aiming ray');
const blood=scene.getObjectByName('hit-blood-particles'),particleMatrix=new THREE.Matrix4();assert.equal(blood.count,24);blood.getMatrixAt(0,particleMatrix);
assert(Math.abs(new THREE.Vector3().setFromMatrixPosition(particleMatrix).y-headBounds.getCenter(new THREE.Vector3()).y)<1e-5,'HS burst starts at the visible head, not the neck joint');
const deathPose=victim.quaternion.clone(),deathPosition=victim.position.clone();
frame.effects=[];now+=65;renderer.render(frame);assert.equal(scene.getObjectByName('enemy:3001'),victim,'Fade survives removal of the notification');
assert(victim.quaternion.equals(deathPose) && victim.position.equals(deathPosition),'Enemy fades in place without falling');
assert(Math.abs(victim.getObjectByName('Open lab coat').material.opacity-.5)<1e-6,'Enemy fades halfway at 65ms');
now+=70;renderer.render(frame);assert(!scene.getObjectByName('enemy:3001'),'Enemy is removed after its quick fade');
now+=300;renderer.render(frame);assert.equal(blood.count,0,'Blood expires independently');
console.log('Death integration passed: snapshot removal, actual head origin, no aim targeting, stationary fade, notification removal and cleanup');
// Plasma uses a handle-driven swing, poison has a real airborne bottle, and pressure is bounded.
now+=1000;frame.effects=[];frame.motion={moving:false};player.weapon='plasmaBlade';renderer.render(frame);
const plasmaReady=viewScene.getObjectByName('Rifle').quaternion.clone();
const slash={effect:'hit',weapon:'plasmaBlade',playerId:'me',fromX:player.x,fromY:player.y,x:player.x,y:player.y-120,damage:0,started:now};frame.effects=[slash];renderer.render(frame);now+=230;renderer.render(frame);
assert(viewScene.getObjectByName('Rifle').quaternion.angleTo(plasmaReady)>.5);assert(!scene.getObjectByName('fired-special-beam'));assert(!scene.getObjectByName('muzzle-tracer'));
now+=600;renderer.render(frame);assert(viewScene.getObjectByName('Rifle').quaternion.angleTo(plasmaReady)<1e-6);
player.weapon='poisonGas';frame.effects=[];renderer.render(frame);assert(viewScene.getObjectByName('BottleGrip').visible);assert(!viewScene.getObjectByName('Hand_R').visible);
const toss={effect:'hit',weapon:'poisonGas',playerId:'me',fromX:player.x,fromY:player.y,x:player.x,y:player.y-160,damage:0,started:now};frame.effects=[toss];renderer.render(frame);now+=300;renderer.render(frame);
const flying=find('thrown-poison-bottle'),air=flying.position.clone();assert(air.y>0);assert(!viewScene.getObjectByName('BottleBody').visible);assert(viewScene.getObjectByName('BottleGrip').visible);
now+=200;renderer.render(frame);assert(flying.position.distanceTo(air)>10);now+=310;renderer.render(frame);assert(!scene.getObjectByName('thrown-poison-bottle'));assert(viewScene.getObjectByName('BottleBody').visible);
player.weapon='pistol';frame.effects=[];renderer.render(frame);assert(viewScene.getObjectByName('Hand_R').visible);assert(!viewScene.getObjectByName('BottleGrip').visible);
frame.effects=Array.from({length:30},(_,i)=>({effect:'hit',weapon:'repulsor',playerId:'owner'+i%10,fromX:100,fromY:100,x:260,y:100,damage:0,started:now-i}));renderer.render(frame);
const pressureMeshes=scene.children.filter(o=>o.name==='repulsor-longitudinal-wave');assert.equal(pressureMeshes.length,4);assert(pressureMeshes.reduce((n,o)=>n+o.geometry.attributes.position.count,0)<=360);
const pressureReuse=pressureMeshes[0].geometry;
frame.effects=frame.effects.map(e=>({...e,started:now}));renderer.render(frame);assert(scene.children.some(o=>o.name==='repulsor-longitudinal-wave' && o.geometry===pressureReuse),'Continuous fire reuses owner buffers');
const laser=context.window.buildWeaponModel(THREE,'laserCannon');let blue=false,red=false;laser.root.traverse(o=>{if(o.isMesh){blue ||= o.material.name==='Cyan';red ||= o.material.name==='Red';}});assert(blue && !red);laser.dispose();
const css=fs.readFileSync('client/style.css','utf8');assert(!css.includes('.weapon .weapon-icon.plasmaBlade'));assert(css.includes('.weapon-icon.plasmaBlade::before { background-image:'));
console.log('Blade, bottle, shared icons, blue laser and pressure budget passed');

// Every reflected segment starts at its authoritative wall point, never the gun muzzle.
state.enemies=[];frame.effects=[];player.weapon='ricochet';player.down=false;player.drone=null;frame.view={yaw:0,pitch:0};frame.motion={moving:false};frame.scoped=false;now+=1000;renderer.render(frame);
const bounce={effect:'hit',weapon:'ricochet',playerId:'me',damage:0,reflected:true,fromX:player.x+100,fromY:player.y,fromHeight:31,x:player.x-60,y:player.y,hitHeight:37,started:now};
renderer.captureEffect(bounce);frame.effects=[bounce];renderer.render(frame);
const reflectedTrace=scene.children.find(o=>o.name==='muzzle-tracer'),reflectedPoints=reflectedTrace.geometry.attributes.position;
assert.deepEqual([reflectedPoints.getX(0),reflectedPoints.getY(0),reflectedPoints.getZ(0)],[bounce.fromX,31,bounce.fromY]);
assert.deepEqual([reflectedPoints.getX(1),reflectedPoints.getY(1),reflectedPoints.getZ(1)],[bounce.x,37,bounce.y]);
assert.equal(frame.view.pitch,0,'A reflection does not apply another firing recoil');
const fixedStart=[reflectedPoints.getX(0),reflectedPoints.getY(0),reflectedPoints.getZ(0)];frame.view.yaw=.8;now+=30;renderer.render(frame);
assert.deepEqual([reflectedPoints.getX(0),reflectedPoints.getY(0),reflectedPoints.getZ(0)],fixedStart,'Turning does not move the rebound point');
frame.effects=[];now+=250;renderer.render(frame);assert(!scene.children.some(o=>o.name==='muzzle-tracer'),'Reflected paths expire normally');
console.log('Ricochet trail passed: wall-origin segment, server heights/endpoints, stationary path, single firing recoil and expiry');
