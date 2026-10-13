const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),T=require('../vendor/three.min.js');
const context=vm.createContext({window:{}});
for(const file of ['organic-enemy-models.js','lab-enemy-models.js'])vm.runInContext(fs.readFileSync('client/'+file,'utf8'),context);
const pool=context.window.createLabEnemyModels(T);
assert.equal(pool.create('hunter',21),null);
for(const type of ['grunt','runner','brute','poisoner','shield','bomber','carrier']){
 const a=pool.create(type,21),b=pool.create(type,21);
 const meshes=[];a.rig.traverse(o=>{if(o.isMesh)meshes.push(o);});
 let count=0;b.rig.traverse(o=>{if(o.isMesh){assert.equal(o.geometry,meshes[count].geometry);assert.equal(o.material,meshes[count++].material);}});
 a.update({x:0,y:0},1000,false);b.update({x:0,y:0},1000,false);
 let stride=0;for(let i=1;i<=30;i++){a.update({x:i,y:0},1000+i*50,false);b.update({x:0,y:0},1000+i*50,false);stride=Math.max(stride,Math.abs(a.rig.getObjectByName('Thigh_L').rotation.x-b.rig.getObjectByName('Thigh_L').rotation.x));}
 const left=a.rig.getObjectByName('Thigh_L'),idle=b.rig.getObjectByName('Thigh_L');assert(stride>.01,'Walking and idle actors retain independent motion');
 const stopped=left.quaternion.toArray();a.update({x:31,y:0},2600,true);assert.deepEqual(left.quaternion.toArray(),stopped,'Freeze holds the current pose');
 const original=meshes[0].material,tint=new T.MeshBasicMaterial({color:'#95dded'});a.tint(tint);assert.equal(meshes[0].material,tint);assert.equal(b.rig.getObjectByName(meshes[0].name).material,original);a.tint(null);assert.equal(meshes[0].material,original);
 a.root.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(a.root);assert(Math.abs(bounds.min.y)<.08&&bounds.max.y<21*1.63);
 if(type==='grunt'){
  const head=new T.Box3().setFromObject(a.rig.getObjectByName('Anatomical head')),center=head.getCenter(new T.Vector3()).divideScalar(21);
  assert(Math.abs(center.y-1.39)<.04&&Math.abs(center.z-.25)<.04,'Visible head stays at the server head volume');
 }
 let disposed=0;meshes[0].geometry.addEventListener('dispose',()=>disposed++);a.dispose();assert.equal(disposed,0,'A surviving actor keeps shared geometry');b.dispose();assert.equal(disposed,1);b.dispose();assert.equal(disposed,1);
 const replacement=pool.create(type,21);assert.notEqual(replacement.rig.getObjectByName(meshes[0].name).geometry,meshes[0].geometry);replacement.dispose();tint.dispose();
}
console.log('Lab enemy assignments passed: seven types, shared assets, individual gait, freeze, tint, head alignment and final-owner disposal');
