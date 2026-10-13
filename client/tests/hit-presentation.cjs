const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),T=require('../vendor/three.min.js');
const c=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('client/hit-presentation.js','utf8'),c);
const scene=new T.Scene(),fx=c.window.createHitPresentation(T,scene),items=new Map(),kept=new Set();
const shared=new T.MeshStandardMaterial({color:'#aaaabb'});
for(let id=0;id<60;id++){
 const root=new T.Group(),body=new T.Mesh(new T.BoxGeometry(10,24,8),shared),head=new T.Object3D();head.name='Head';head.position.set(0,27,0);body.position.y=12;root.add(body,head);root.position.x=id*12;scene.add(root);items.set(id,{root,body});
}
const lookup=id=>items.get(id),keep=item=>kept.add(item),blood=scene.getObjectByName('hit-blood-particles');
const hit=(id,extra={})=>({effect:'hit',enemyId:id,damage:20,playerId:'me',started:100,x:id*12,y:0,fromX:id*12,fromY:100,...extra});
function update(effects,now){kept.clear();for(const i of items.values())fx.restore(i);fx.update(effects,now,'me',lookup,keep);}
update([hit(0,{playerId:'ally'})],100);const ally=items.get(0).body.material.color.r;
assert(ally>shared.color.r);assert.equal(items.get(1).body.material,shared,'Unhit enemy shares unchanged material');
update([hit(0,{started:110})],110);assert(items.get(0).body.material.color.r>ally,'Own hit is stronger');assert.equal(blood.count,0,'Body hits do not emit blood');
const hs=hit(1,{headshot:true,started:120});update([hs],120);assert.equal(blood.count,9);
const m=new T.Matrix4(),position=new T.Vector3();blood.getMatrixAt(0,m);position.setFromMatrixPosition(m);assert.equal(position.y,27,'HS particles originate at actual head');
update([hs],130);assert.equal(blood.count,9,'Repeated frames do not re-emit');
update([hit(1,{headshot:true,started:140})],140);assert.equal(blood.count,9,'Rapid pellet impacts are throttled per target');
update([],400);assert.equal(items.get(0).body.material,shared,'Tint restores original material');
fx.reset();
const kills=Array.from({length:60},(_,id)=>hit(id,{headshot:true,defeated:true,started:500}));update(kills,500);
assert.equal(blood.count,384,'Particle count is capped');assert.equal(kept.size,8,'Death count is capped');
update(kills,800);assert.equal(kept.size,8,'Deaths survive event/snapshot removal');assert([...kept].every(i=>i.root.userData.presentationOnly),'Corpses are tagged for aim exclusion');
assert([...kept].some(i=>Math.abs(i.root.quaternion.x)>.1),'Bodies fall without physics');
update([],1250);assert.equal(kept.size,0);assert.equal(blood.count,0,'Particles and corpses expire');
let disposed=0;for(const i of items.values())for(const mat of i.hitTints?.values() || [])mat.addEventListener('dispose',()=>disposed++);
for(const i of items.values())fx.release(i);assert(disposed>0,'Per-enemy tint materials are released');
assert([...items.values()].every(i=>i.body.material===shared),'Disposal never changes shared materials');
fx.reset();assert.equal(blood.count,0);
console.log('Hit presentation passed: ownership, original materials, head origin, throttle, deduplication, particle/death caps, falling, expiry and material disposal');
