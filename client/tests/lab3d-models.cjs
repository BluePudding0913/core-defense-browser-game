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
for (const type of ['barricade','copperBarricade','silverBarricade']) assert(find('defense:'+type+':'+type).children.length>=7,'Barricades use posts and rails');
find('station:breaker:breaker'); find('station:unlock:terminal');find('resource:ore:ore');find('drop:1:medkit');
assert(!scene.getObjectByName('resource:empty:wood'));
const terrain=scene.children.find(o=>o.children.some(c=>c.isInstancedMesh));
const accents=terrain.children.at(-1);const m=new THREE.Matrix4(),pos=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3();
for(let i=0;i<accents.count;i++){accents.getMatrixAt(i,m);m.decompose(pos,q,scale);assert(pos.y<1,'No decorative line on wall top');}
frame.effects=[{effect:'hit',weapon:'turret',fromX:100,fromY:160,x:200,y:160,damage:10,enemyId:1,started:now},
 {effect:'hit',weapon:'pistol',playerId:'me',fromX:100,fromY:100,x:250,y:100,damage:0,started:now}];
renderer.render(frame);
assert(Math.abs(head.rotation.y-Math.PI/2)<1e-8,'Turret turns toward its shot');
const traces=scene.children.filter(o=>o.name==='muzzle-tracer');assert.equal(traces.length,2);
const turretOrigin=muzzle.getWorldPosition(new THREE.Vector3());
const soldierOrigin=viewScene.getObjectByName('Muzzle').getWorldPosition(new THREE.Vector3()).applyMatrix4(viewCamera.matrixWorldInverse).applyMatrix4(camera.matrixWorld);
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

