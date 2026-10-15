const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),T=require('../vendor/three.min.js');
const context=vm.createContext({window:{},TextEncoder,Uint32Array});for(const f of ['organic-enemy-models.js','enemy-models.js','enemy-model-export.js'])vm.runInContext(fs.readFileSync('client/'+f,'utf8'),context);
fs.mkdirSync('client/assets/enemies',{recursive:true});
for(const {id}of context.window.EnemyModels.variants){
 const m=context.window.EnemyModels.build(T,id);m.root.updateMatrixWorld(true);const b=new T.Box3().setFromObject(m.root);assert(b.min.y>-.015&&b.min.y<.02);assert(b.max.y>(id==='lab-tiny'?1.3:1.60)&&b.max.y<1.95);let triangles=0,meshes=0;
 m.root.traverse(o=>{if(!o.isMesh)return;meshes++;const p=o.geometry.attributes.position,n=o.geometry.attributes.normal;triangles+=(o.geometry.index?.count??p.count)/3;for(let i=0;i<p.count;i++){assert(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)));assert(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<.001);}const ix=o.geometry.index?.array;if(ix)for(let i=0;i<ix.length;i++)assert(ix[i]<p.count);});assert(triangles<22000);
 if(m.root.getObjectByName('Thumb_L')){
  for(const [name,radial] of [['L',1],['R',-1]]){
   const thumb=m.root.getObjectByName('Thumb_'+name),index=m.root.getObjectByName('Finger_'+name+'_0'),little=m.root.getObjectByName('Finger_'+name+'_3'),palm=m.root.getObjectByName('Palm_'+name),flesh=m.root.getObjectByName('Thumb flesh_'+name);
   assert(thumb.position.x*radial>0&&index.position.x*radial>0&&little.position.x*radial<0,'Thumb and index occupy the radial side of each mirrored hand');
   palm.geometry.computeBoundingBox();flesh.geometry.computeBoundingBox();thumb.updateMatrix();assert(palm.geometry.boundingBox.intersectsBox(flesh.geometry.boundingBox.clone().applyMatrix4(thumb.matrix)),'Thumb base is embedded in the palm');
   for(let f=0;f<4;f++){
    const finger=m.root.getObjectByName('Finger_'+name+'_'+f),mesh=m.root.getObjectByName('Curled finger_'+name+'_'+f),p=mesh.geometry.attributes.position,tip=p.count-2,base=p.count-1;
    assert(p.getZ(tip)<p.getZ(base)-.015&&p.getY(tip)<p.getY(base)-.035,'Fingers bend toward the palm and extend beyond their knuckles');
    mesh.geometry.computeBoundingBox();finger.updateMatrix();assert(palm.geometry.boundingBox.intersectsBox(mesh.geometry.boundingBox.clone().applyMatrix4(finger.matrix)),'Finger roots meet the palm');
   }
  }
 }
 if(id==='lab-artilleryelite'){
  for(const side of [-1,1]){
   const tube=m.root.getObjectByName('Elite shoulder launcher_'+side);
   const origin=tube.localToWorld(new T.Vector3(0,1,0)),direction=new T.Vector3(0,-1,0).transformDirection(tube.matrixWorld);
   assert.equal(new T.Raycaster(origin,direction).intersectObject(tube,true)[0]?.object.name,'Elite bore floor_'+side,'Both elite muzzles are hollow');
  }
 }
 if(id==='lab-seeker'){
  const launcher=m.root.getObjectByName('Seeker guided launcher');
  assert.equal(launcher.parent,m.torso,'Launcher follows the torso independently of scanning head and swinging arms');
  assert(m.root.getObjectByName('Red tracking lens')&&m.root.getObjectByName('Seeker ammunition case'));
  const origin=launcher.localToWorld(new T.Vector3(0,.6,0)),direction=new T.Vector3(0,-1,0).transformDirection(launcher.matrixWorld);
  assert.equal(new T.Raycaster(origin,direction).intersectObject(launcher,true)[0]?.object.name,'Guided launcher rear breech','Guided launcher has a recessed open muzzle');
  const forward=new T.Vector3(0,1,0).transformDirection(launcher.matrixWorld);assert(forward.z>.9,'Guided launcher aims forward rather than upward');
 }
 if(id==='lab-artillery'){
  const tube=m.root.getObjectByName('Shoulder launcher');m.root.updateMatrixWorld(true);
  const origin=tube.localToWorld(new T.Vector3(0,1,0)),direction=new T.Vector3(0,-1,0).transformDirection(tube.matrixWorld);
  const hit=new T.Raycaster(origin,direction).intersectObject(tube,true)[0];
  assert.equal(hit?.object.name,'Launcher bore floor','Launcher muzzle is hollow rather than capped');
 }
 if(id==='lab-shield'){
  const shield=m.root.getObjectByName('Containment shield'),hand=m.root.getObjectByName('Hand_L'),p=new T.Vector3();
  for(let k=0;k<40;k++){
   m.pose(k*.05);m.root.updateMatrixWorld(true);const inverse=shield.matrixWorld.clone().invert();
   hand.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){p.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).applyMatrix4(inverse);assert(p.z<-.02,'Shield hand stays behind the panel throughout walking');}});
  }m.reset();
 }
 const rest=m.legs[0].rotation.x;m.pose(0);m.pose(.1);assert(Math.abs(m.legs[0].rotation.x-rest)>0);m.reset();assert.equal(m.legs[0].rotation.x,rest);
 if(['researcher','lab-assistant','lab-pathologist'].includes(id)){
  assert(m.torso.rotation.x>=.30,'Researcher retains a hunched resting pose');assert(m.head.position.z<.025,'Skull pivot stays over the cervical base');const neck=m.root.getObjectByName('Neck');assert.equal(neck.parent,m.torso,'Neck is rooted in the shoulder girdle');assert(new T.Box3().setFromObject(neck).intersectsBox(new T.Box3().setFromObject(m.root.getObjectByName('Chest'))),'Neck overlaps the upper chest');assert(new T.Box3().setFromObject(neck).intersectsBox(new T.Box3().setFromObject(m.root.getObjectByName('Anatomical head'))),'Neck overlaps the skull base');
  const coat=m.root.getObjectByName('Open lab coat');assert(coat&&m.root.getObjectByName('Split coat tails')&&m.root.getObjectByName('Research ID'));
  m.root.updateMatrixWorld(true);const origin=m.torso.localToWorld(new T.Vector3(0,.18,1)),direction=new T.Vector3(0,0,-1).transformDirection(m.torso.matrixWorld),hit=new T.Raycaster(origin,direction).intersectObject(coat)[0];assert(hit,'Ray reaches the back of the coat');assert(m.torso.worldToLocal(hit.point).z<0,'Coat front is an actual opening');
  m.pose(0);let left=0,right=0;for(let k=1;k<=100;k++){m.pose(k*.05);left=Math.max(left,Math.abs(m.legs[0].rotation.x+.14));right=Math.max(right,Math.abs(m.legs[1].rotation.x-.19));}assert(left>right*2,'Dragging leg has a distinctly shorter stride');m.reset();
 }
 const bytes=context.window.exportEnemyGLB(T,m.root),dv=new DataView(bytes.buffer);assert.equal(dv.getUint32(0,true),0x46546c67);assert.equal(dv.getUint32(8,true),bytes.length);const length=dv.getUint32(12,true),j=JSON.parse(new TextDecoder().decode(bytes.slice(20,20+length)));assert.equal(j.meshes.length,meshes);assert.equal(j.nodes[0].name,'Enemy_'+id);if(['lab-warlord','lab-titan','lab-artilleryelite','rasp','rush','hollow','researcher','lab-assistant','lab-pathologist','lab-runner','lab-brute','lab-poisoner','lab-shield','lab-bomber','lab-carrier','lab-hunter','lab-armored','lab-artillery','lab-corehunter','lab-seeker','lab-blackout','lab-siege','lab-champion','lab-warden','lab-tiny','lab-gilded','lab-blueace'].includes(id)){assert(j.meshes.every(mesh=>mesh.primitives[0].attributes.COLOR_0!==undefined),'Skin and fabric shading survive GLB export');assert(j.materials.every(mat=>mat.name==='Tarnished brass' || mat.pbrMetallicRoughness.metallicFactor===0),'Flesh and cloth have no metallic finish');for(let i=0;i<60;i++){m.pose(i*.05);m.root.updateMatrixWorld(true);const movingBounds=new T.Box3().setFromObject(m.root);assert(movingBounds.min.y>-.006&&movingBounds.min.y<.02,'Soles stay on the studio floor');assert(Number.isFinite(movingBounds.max.y));}m.reset();}for(const a of j.accessors){const v=j.bufferViews[a.bufferView];assert(v.byteOffset+v.byteLength<=j.buffers[0].byteLength);}fs.writeFileSync('client/assets/enemies/enemy-'+id+'.glb',bytes);
 let disposed=0;m.root.traverse(o=>{if(o.isMesh)o.geometry.addEventListener('dispose',()=>disposed++);});m.dispose();assert.equal(disposed,meshes);console.log(id+': '+triangles+' triangles / '+meshes+' meshes / height '+b.max.y.toFixed(3)+'m / GLB '+bytes.length+' bytes');
}
