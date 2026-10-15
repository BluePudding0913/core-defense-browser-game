'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),T=require('../vendor/three.min.js');
function pool(legacy){
 const context=vm.createContext({window:{}});
 vm.runInContext(fs.readFileSync('client/organic-enemy-models.js','utf8'),context);
 let source=fs.readFileSync('client/lab-enemy-models.js','utf8');
 if(legacy)source=source.replace('batched=batchStaticParts(model.root)','batched=[]');
 vm.runInContext(source,context);return context.window.createLabEnemyModels(T);
}
function signature(root){
 root.updateMatrixWorld(true);const sums=[0,0,0,0],point=new T.Vector3();let vertices=0,meshes=0,shadows=0;
 root.traverseVisible(mesh=>{if(!mesh.isMesh)return;meshes++;if(mesh.castShadow)shadows++;
  const g=mesh.geometry,position=g.attributes.position,count=g.index?.count || position.count;
  for(let i=0;i<count;i++){
   point.fromBufferAttribute(position,g.index?g.index.getX(i):i).applyMatrix4(mesh.matrixWorld);
   sums[0]+=point.x;sums[1]+=point.y;sums[2]+=point.z;sums[3]+=point.lengthSq();vertices++;
  }
 });return {sums,vertices,meshes,shadows};
}
const current=pool(false),legacy=pool(true);
for(const type of Object.keys(current.assignments)){
 const a=current.create(type,21),b=legacy.create(type,21);
 for(let i=0;i<3;i++){
  a.update({x:i*3,y:0},1000+i*90,i===2);b.update({x:i*3,y:0},1000+i*90,i===2);
  const actual=signature(a.root),before=signature(b.root);assert.equal(actual.vertices,before.vertices,type);
  const bounds=new T.Box3().setFromObject(a.root,true),oldBounds=new T.Box3().setFromObject(b.root,true);
  assert(bounds.min.distanceTo(oldBounds.min)<1e-4 && bounds.max.distanceTo(oldBounds.max)<1e-4,type+' physical bounds');
  actual.sums.forEach((value,j)=>assert(Math.abs(value-before.sums[j])/Math.max(1,Math.abs(before.sums[j]))<1e-6,type+' world geometry '+j));
  if(type==='grunt'){assert(actual.meshes<before.meshes);assert(actual.shadows<before.shadows);}
 }
 let freed=0;a.rig.traverse(o=>{if(o.userData.staticBatch)o.geometry.addEventListener('dispose',()=>freed++);});
 const second=current.create(type,21);a.dispose();assert.equal(freed,0);second.dispose();b.dispose();
 if(type==='grunt')assert(freed>0,'Shared batches freed by final owner');
}
console.log('Enemy batching passed: all types preserve visible triangles and posed world geometry; GRUNT draw/shape shadows reduced; shared geometry disposal');
