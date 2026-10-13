'use strict';
// Renderer-scoped pool: geometry/materials are shared, transforms and gait are per actor.
window.createLabEnemyModels = T => {
 const assignments={grunt:'researcher',runner:'lab-runner',brute:'lab-brute',poisoner:'lab-poisoner',shield:'lab-shield',bomber:'lab-bomber',carrier:'lab-carrier'},pool=new Map();
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
  let point=null,lastAt=null,time=0,disposed=false,motion=[null,0,0];
  return {root,rig,update(next,now,frozen){
   const dt=lastAt===null?0:Math.max(0,Math.min(.1,(now-lastAt)/1000));
   const moving=point&&Math.hypot(next.x-point.x,next.y-point.y)>.01;
   entry.model.setMotion(motion);
   if(!frozen){time+=dt;entry.model.pose(time,!!moving);}
   else entry.model.pose(time,false);
   motion=entry.model.getMotion();
   entry.nodes.forEach((o,i)=>{nodes[i].position.copy(o.position);nodes[i].quaternion.copy(o.quaternion);nodes[i].scale.copy(o.scale);});
   point={x:next.x,y:next.y};lastAt=now;
  },tint(material){for(const [mesh,original]of materials)mesh.material=material||original;},dispose(){
   if(disposed)return;disposed=true;if(--entry.refs===0){entry.model.dispose();pool.delete(id);}
  }};
 }
 return {create,assignments};
};
