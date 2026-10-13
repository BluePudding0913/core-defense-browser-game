const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),T=require('../vendor/three.min.js');
const context=vm.createContext({window:{}});
for(const file of ['organic-enemy-models.js','lab-enemy-models.js'])vm.runInContext(fs.readFileSync('client/'+file,'utf8'),context);
const pool=context.window.createLabEnemyModels(T);
// A color must reach the same linear value in the studio and the game.
const legacy=T.ColorManagement.legacyMode;
try{
 T.ColorManagement.legacyMode=true;const studio=context.window.buildOrganicEnemy(T,'researcher');
 const expected=studio.root.getObjectByName('Anatomical head').material.color.clone();
 T.ColorManagement.legacyMode=false;const game=context.window.buildOrganicEnemy(T,'researcher');
 const actual=game.root.getObjectByName('Anatomical head').material.color;
 assert(Math.abs(actual.r-expected.r)+Math.abs(actual.g-expected.g)+Math.abs(actual.b-expected.b)<1e-10,'Studio and game convert skin color exactly once');
 assert(Math.abs(actual.r-new T.Color('#8f9a87').r)<1e-10,'Game skin retains its intended brightness');studio.dispose();game.dispose();
}finally{T.ColorManagement.legacyMode=legacy;}
assert.equal(pool.create('ghost',21),null);
for(const [type,detail] of [['tiny','Broken wrist restraint'],['gilded','Gold specimen canister_-1'],['blueAce','Blue response helmet']]) {
 const actor=pool.create(type,type==='tiny'?10:21);assert(actor.rig.getObjectByName(detail),'New role has its own equipment: '+type);assert(actor.rig.getObjectByName('Anatomical head'));actor.dispose();
}
for(const type of ['grunt','runner','brute','poisoner','shield','bomber','carrier','hunter','armored','artillery','coreHunter','seeker','blackout','siege','champion','warden','tiny','gilded','blueAce']){
 const a=pool.create(type,21),b=pool.create(type,21);
 const meshes=[];a.rig.traverse(o=>{if(o.isMesh)meshes.push(o);});
 let count=0;b.rig.traverse(o=>{if(o.isMesh){assert.equal(o.geometry,meshes[count].geometry);assert.equal(o.material,meshes[count++].material);}});
 a.update({x:0,y:0},1000,false);b.update({x:0,y:0},1000,false);
 let stride=0;const min=[Infinity,Infinity],max=[-Infinity,-Infinity];for(let i=1;i<=80;i++){
  a.update({x:i,y:0},1000+i*50,false);b.update({x:0,y:0},1000+i*50,false);
  stride=Math.max(stride,Math.abs(a.rig.getObjectByName('Thigh_L').rotation.x-b.rig.getObjectByName('Thigh_L').rotation.x));
  for(const [j,name]of ['L','R'].entries()){const angle=a.rig.getObjectByName('Thigh_'+name).rotation.x;min[j]=Math.min(min[j],angle);max[j]=Math.max(max[j],angle);}
 }
 assert(max[0]-min[0]>.45,'Left leg has a visible stride');assert(max[1]-min[1]>(type==='grunt'?.18:.45),'Both legs move visibly; only grunt deliberately drags one leg');
 const left=a.rig.getObjectByName('Thigh_L'),idle=b.rig.getObjectByName('Thigh_L');assert(stride>.01,'Walking and idle actors retain independent motion');
 const stopped=left.quaternion.toArray();a.update({x:81,y:0},5100,true);assert.deepEqual(left.quaternion.toArray(),stopped,'Freeze holds the current pose');
 const original=meshes[0].material,tint=new T.MeshBasicMaterial({color:'#95dded'});a.tint(tint);assert.equal(meshes[0].material,tint);assert.equal(b.rig.getObjectByName(meshes[0].name).material,original);a.tint(null);assert.equal(meshes[0].material,original);
 a.root.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(a.root);assert(Math.abs(bounds.min.y)<.08&&bounds.max.y<21*1.63);
 if(type==='grunt'){
  const head=new T.Box3().setFromObject(a.rig.getObjectByName('Anatomical head')),center=head.getCenter(new T.Vector3()).divideScalar(21);
  assert(Math.abs(center.y-1.39)<.04&&Math.abs(center.z-.25)<.04,'Visible head stays at the server head volume');
 }
 let disposed=0;meshes[0].geometry.addEventListener('dispose',()=>disposed++);a.dispose();assert.equal(disposed,0,'A surviving actor keeps shared geometry');b.dispose();assert.equal(disposed,1);b.dispose();assert.equal(disposed,1);
 const replacement=pool.create(type,21);assert.notEqual(replacement.rig.getObjectByName(meshes[0].name).geometry,meshes[0].geometry);replacement.dispose();tint.dispose();
}
const slow=pool.create('grunt',21),fast=pool.create('grunt',21),crossings=[0,0],previous=[0,0];
for(let i=0;i<=140;i++)for(const [j,actor]of [slow,fast].entries()){
 actor.update({x:i*(j?1:.5),y:0},1000+i*50,false);
 const value=actor.rig.getObjectByName('Thigh_L').rotation.x+.14;
 if(i>10&&value*previous[j]<0)crossings[j]++;previous[j]=value;
}
assert(crossings[1]>crossings[0]*1.5&&crossings[1]>5,'Faster ground travel produces more steps');slow.dispose();fast.dispose();
console.log('Lab enemy assignments passed: nineteen types, shared assets, individual gait, freeze, tint, head alignment and final-owner disposal');
