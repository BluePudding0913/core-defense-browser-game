'use strict';
// Renderer-scoped pool: geometry/materials are shared, transforms and gait are per actor.
window.createLabEnemyModels = T => {
 let nextActor=0;
 const assignments={ghost:'lab-ghost',warlord:'lab-warlord',titan:'lab-titan',artilleryElite:'lab-artilleryelite',explosionBoss:'lab-explosionboss',finalBoss:'lab-finalboss',boss:'lab-boss',grunt:'researcher',runner:'lab-runner',brute:'lab-brute',poisoner:'lab-poisoner',shield:'lab-shield',bomber:'lab-bomber',carrier:'lab-carrier',hunter:'lab-hunter',armored:'lab-armored',artillery:'lab-artillery',coreHunter:'lab-corehunter',seeker:'lab-seeker',blackout:'lab-blackout',siege:'lab-siege',champion:'lab-champion',warden:'lab-warden',tiny:'lab-tiny',gilded:'lab-gilded',blueAce:'lab-blueace'},pool=new Map();
 // Named source meshes remain available to hit/head inspection and exact rays.
 // Only fixed opaque leaf siblings are batched; animated joints/tails stay separate.
 function batchStaticParts(root){
  const owned=[],animated=new Set(['Split coat tails','Command coat tails','Supervisor coat tails','Seeker coat tails','Hanging restraint chain']);
  const parents=[];root.traverse(o=>parents.push(o));
  for(const parent of parents){
   const groups=new Map();
   for(const mesh of parent.children){
    if(!mesh.isMesh || mesh.children.length || !mesh.visible || animated.has(mesh.name) || Array.isArray(mesh.material) || mesh.material.transparent)continue;
    const attributes=Object.keys(mesh.geometry.attributes).sort();
    const key=[mesh.material.uuid,mesh.castShadow,mesh.receiveShadow,mesh.layers.mask,mesh.renderOrder,...attributes.map(k=>k+':'+mesh.geometry.attributes[k].itemSize)].join('/');
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(mesh);
   }
   for(const meshes of groups.values())if(meshes.length>1){
    const parts=meshes.map(mesh=>{mesh.updateMatrix();return mesh.geometry.clone().applyMatrix4(mesh.matrix);});
    const geometry=new T.BufferGeometry();
    for(const name of Object.keys(parts[0].attributes)){
     const first=parts[0].attributes[name],data=new Float32Array(parts.reduce((n,g)=>n+g.attributes[name].array.length,0));let offset=0;
     for(const part of parts){data.set(part.attributes[name].array,offset);offset+=part.attributes[name].array.length;}
     geometry.setAttribute(name,new T.BufferAttribute(data,first.itemSize,first.normalized));
    }
    const indices=[];let vertexOffset=0;
    for(const part of parts){const count=part.index?.count || part.attributes.position.count;for(let i=0;i<count;i++)indices.push(vertexOffset+(part.index?part.index.getX(i):i));vertexOffset+=part.attributes.position.count;}
    geometry.setIndex(indices);
    parts.forEach(g=>g.dispose());owned.push(geometry);
    const first=meshes[0],batch=new T.Mesh(geometry,first.material);batch.name='Batched '+parent.name+' '+owned.length;
    batch.castShadow=first.castShadow;batch.receiveShadow=first.receiveShadow;batch.layers.mask=first.layers.mask;batch.renderOrder=first.renderOrder;
    batch.raycast=()=>{};batch.userData.staticBatch=true;batch.matrixAutoUpdate=false;parent.add(batch);
    for(const mesh of meshes){mesh.visible=false;mesh.matrixAutoUpdate=false;mesh.userData.batchedSource=true;}
   }
  }
  return owned;
 }
 function create(type,radius){
  const id=assignments[type];if(!id)return null;
  let entry=pool.get(id);
  if(!entry){
   const model=window.buildOrganicEnemy(T,id);model.root.updateMatrixWorld(true);
   // Preserve original sizing: merged local bounds can be more conservative.
   const height=new T.Box3().setFromObject(model.root).max.y,batched=batchStaticParts(model.root),nodes=[];model.root.traverse(o=>nodes.push(o));
   entry={model,nodes,height,batched,refs:0};pool.set(id,entry);
  }
  entry.refs++;
  const root=new T.Group(),rig=entry.model.root.clone(true),nodes=[],materials=new Map(),tints=new Map();
  rig.traverse(o=>{nodes.push(o);if(o.isMesh){materials.set(o,o.material);if(o.userData.staticBatch)o.raycast=()=>{};}});root.add(rig);
  root.scale.setScalar(radius*1.55/entry.height);
  const phaseOffset=(nextActor++*.61803398875)%1;
  let point=null,lastAt=null,time=0,disposed=false,motion=[null,0,0],posedMotion=null,lastPoseAt=null,nextPoseAt=0,lastInterval=0,wasFrozen=false;
  return {root,rig,update(next,now,frozen,interval=0){
   const dt=lastAt===null?0:Math.max(0,Math.min(.1,(now-lastAt)/1000));
   const distance=point?Math.hypot(next.x-point.x,next.y-point.y):0,moving=distance>.01;
   // Freeze the pose actually shown, including when intermediate poses were skipped.
   if(frozen && !wasFrozen && posedMotion){motion=posedMotion;time=motion[0];}
   entry.model.setMotion(motion);
   if(!frozen)time+=dt;
   entry.model.advance(time,!frozen&&moving,!frozen&&moving?distance/root.scale.x:0);
   motion=entry.model.getMotion();
   const updatePose=lastPoseAt===null || interval===0 || interval<lastInterval || frozen!==wasFrozen || now>=nextPoseAt || now<lastPoseAt;
   if(updatePose){
    entry.model.applyPose();
    posedMotion=motion;
    entry.nodes.forEach((o,i)=>{if(o.userData.staticBatch || o.userData.batchedSource)return;nodes[i].position.copy(o.position);nodes[i].quaternion.copy(o.quaternion);nodes[i].scale.copy(o.scale);});
    lastPoseAt=now;
    // Spread sparse updates across frames instead of refreshing an entire wave together.
    nextPoseAt=interval>0?(Math.floor(now/interval+phaseOffset)+1-phaseOffset)*interval:now;
   }
   lastInterval=interval;wasFrozen=frozen;
   point={x:next.x,y:next.y};lastAt=now;
  },tint(material){for(const [mesh,original]of materials){
   if(!material || !original.transparent){mesh.material=material||original;continue;}
   let copy=tints.get(original);
   if(!copy){copy=original.clone();tints.set(original,copy);}
   copy.color.copy(material.color);if(copy.emissive)copy.emissive.set(0);
   mesh.material=copy;
  }},dispose(){
   if(disposed)return;disposed=true;for(const m of tints.values())m.dispose();tints.clear();if(--entry.refs===0){entry.batched.forEach(g=>g.dispose());entry.model.dispose();pool.delete(id);}
  }};
 }
 return {create,assignments};
};
