'use strict';
// Renderer-scoped pool: geometry/materials are shared, transforms and gait are per actor.
window.createLabEnemyModels = T => {
 let nextActor=0;
 const assignments={warlord:'lab-warlord',titan:'lab-titan',artilleryElite:'lab-artilleryelite',explosionBoss:'lab-explosionboss',finalBoss:'lab-finalboss',boss:'lab-boss',grunt:'researcher',runner:'lab-runner',brute:'lab-brute',poisoner:'lab-poisoner',shield:'lab-shield',bomber:'lab-bomber',carrier:'lab-carrier',hunter:'lab-hunter',armored:'lab-armored',artillery:'lab-artillery',coreHunter:'lab-corehunter',seeker:'lab-seeker',blackout:'lab-blackout',siege:'lab-siege',champion:'lab-champion',warden:'lab-warden',tiny:'lab-tiny',gilded:'lab-gilded',blueAce:'lab-blueace'},pool=new Map();
 function create(type,radius){
  const id=assignments[type];if(!id)return null;
  let entry=pool.get(id);
  if(!entry){
   const model=window.buildOrganicEnemy(T,id);model.root.updateMatrixWorld(true);
   const height=new T.Box3().setFromObject(model.root).max.y,nodes=[];model.root.traverse(o=>nodes.push(o));
   entry={model,nodes,height,refs:0};pool.set(id,entry);
  }
  entry.refs++;
  const root=new T.Group(),rig=entry.model.root.clone(true),nodes=[],materials=new Map();
  rig.traverse(o=>{nodes.push(o);if(o.isMesh)materials.set(o,o.material);});root.add(rig);
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
    entry.nodes.forEach((o,i)=>{nodes[i].position.copy(o.position);nodes[i].quaternion.copy(o.quaternion);nodes[i].scale.copy(o.scale);});
    lastPoseAt=now;
    // Spread sparse updates across frames instead of refreshing an entire wave together.
    nextPoseAt=interval>0?(Math.floor(now/interval+phaseOffset)+1-phaseOffset)*interval:now;
   }
   lastInterval=interval;wasFrozen=frozen;
   point={x:next.x,y:next.y};lastAt=now;
  },tint(material){for(const [mesh,original]of materials)mesh.material=material||original;},dispose(){
   if(disposed)return;disposed=true;if(--entry.refs===0){entry.model.dispose();pool.delete(id);}
  }};
 }
 return {create,assignments};
};
