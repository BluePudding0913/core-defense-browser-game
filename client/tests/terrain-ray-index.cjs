'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const T=require('../vendor/three.min.js'),context=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync('client/block-terrain.js','utf8'),context);
let seed=173;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const items=Array.from({length:180},()=>[(random()-.5)*900,random()*120,(random()-.5)*900,5+random()*180,3+random()*80,5+random()*180]);
items.push([0,-2,0,1000,4,1000],[0,140,0,1000,8,1000],[0,45,0,2,90,300]);
const mesh=new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial(),items.length),dummy=new T.Object3D();
items.forEach(([x,y,z,w,h,d],i)=>{dummy.position.set(x,y,z);dummy.scale.set(w,h,d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
context.window.BlockTerrain.indexInstances(T,mesh,items);
const indexed=mesh.raycast,legacy=T.InstancedMesh.prototype.raycast;
const canonical=hits=>hits.map(h=>[h.instanceId,h.faceIndex,h.distance,h.point.x,h.point.y,h.point.z]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
let cases=0;
for(const transformed of [false,true]){
 mesh.position.set(transformed?50:0,transformed?-20:0,transformed?100:0);mesh.rotation.set(.0,transformed?.6:0,0);mesh.scale.set(transformed?1.3:1,transformed?.8:1,transformed?1.1:1);mesh.updateMatrixWorld(true);
 for(const side of [T.FrontSide,T.BackSide,T.DoubleSide])for(let i=0;i<400;i++){
  mesh.material.side=side;mesh.count=i%9===0?60:items.length;
  const origin=new T.Vector3((random()-.5)*1100,random()*220-40,(random()-.5)*1100);
  const direction=i%4===0?new T.Vector3(0,-1,0):new T.Vector3(random()-.5,random()-.5,random()-.5).normalize();
  const ray=new T.Raycaster(origin,direction,i%3===0?20:0,i%5===0?200:Infinity),a=[],b=[];
  indexed.call(mesh,ray,a);legacy.call(mesh,ray,b);
  const actual=canonical(a),expected=canonical(b);assert.equal(actual.length,expected.length);
  actual.forEach((hit,j)=>hit.forEach((v,k)=>assert(Math.abs(v-expected[j][k])<1e-7,`case ${cases}, ${j}/${k}`)));
  assert(a.every(hit=>hit.object===mesh));cases++;
 }
}
console.log(`Terrain ray index passed: ${cases} rays match Three.js across sides, inside origins, transforms, near/far and instance counts`);
