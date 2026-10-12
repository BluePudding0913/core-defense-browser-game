const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),T=require('../vendor/three.min.js');
const context=vm.createContext({window:{},TextEncoder,Uint32Array});for(const f of ['enemy-models.js','enemy-model-export.js'])vm.runInContext(fs.readFileSync('client/'+f,'utf8'),context);
fs.mkdirSync('client/assets/enemies',{recursive:true});
for(const {id}of context.window.EnemyModels.variants){
 const m=context.window.EnemyModels.build(T,id);m.root.updateMatrixWorld(true);const b=new T.Box3().setFromObject(m.root);assert(b.min.y>-.015&&b.min.y<.02);assert(b.max.y>1.74&&b.max.y<1.9);let triangles=0,meshes=0;
 m.root.traverse(o=>{if(!o.isMesh)return;meshes++;const p=o.geometry.attributes.position,n=o.geometry.attributes.normal;triangles+=(o.geometry.index?.count??p.count)/3;for(let i=0;i<p.count;i++){assert(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)));assert(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<.001);}const ix=o.geometry.index?.array;if(ix)for(let i=0;i<ix.length;i++)assert(ix[i]<p.count);});assert(triangles<22000);
 m.pose(0);m.pose(.1);assert(Math.abs(m.legs[0].rotation.x)>0);m.reset();assert.equal(m.legs[0].rotation.x,0);
 const bytes=context.window.exportEnemyGLB(T,m.root),dv=new DataView(bytes.buffer);assert.equal(dv.getUint32(0,true),0x46546c67);assert.equal(dv.getUint32(8,true),bytes.length);const length=dv.getUint32(12,true),j=JSON.parse(new TextDecoder().decode(bytes.slice(20,20+length)));assert.equal(j.meshes.length,meshes);assert.equal(j.nodes[0].name,'Enemy_'+id);for(const a of j.accessors){const v=j.bufferViews[a.bufferView];assert(v.byteOffset+v.byteLength<=j.buffers[0].byteLength);}fs.writeFileSync('client/assets/enemies/enemy-'+id+'.glb',bytes);
 let disposed=0;m.root.traverse(o=>{if(o.isMesh)o.geometry.addEventListener('dispose',()=>disposed++);});m.dispose();assert.equal(disposed,meshes);console.log(id+': '+triangles+' triangles / '+meshes+' meshes / height '+b.max.y.toFixed(3)+'m / GLB '+bytes.length+' bytes');
}

