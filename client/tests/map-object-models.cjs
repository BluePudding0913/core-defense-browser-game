const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),T=require('../vendor/three.min.js');
const context=vm.createContext({window:{}});for(const file of ['soldier-model.js','map-object-models.js'])vm.runInContext(fs.readFileSync('client/'+file,'utf8'),context);
const models=context.window.MapObjectModels,map=require('../../shared/map.json');
const displayAssets=new Map();
for(const shop of map.shopUnits){
 const kind=models.stationKind(shop),root=models.build(T,kind,{item:shop.item,displayAssets});assert(root,'Every shop has a dedicated model: '+shop.id);
 if(['weapon','medkit','factoryShop','ammo'].includes(kind)) {
  assert.equal(root.children.filter(o=>o.name==='showcase-glass').length,5,'Five transparent showcase faces: '+shop.id);
  const display=root.getObjectByName(kind==='weapon'?'ShowcaseWeapon':kind==='factoryShop'?'ShowcaseFactory':kind==='ammo'?'ShowcaseAmmo':'MedicalKit');assert(display);
  const bounds=new T.Box3().setFromObject(display);assert(bounds.min.x>=-14 && bounds.max.x<=14 && bounds.min.z>=-10 && bounds.max.z<=10 && bounds.min.y>=21 && bounds.max.y<43,'Displayed product fits inside glass: '+shop.id);
  assert(bounds.min.y<=33 && bounds.max.y>=26,'Display is near standing eye height: '+shop.id);
  if(kind==='weapon')assert.equal(display.userData.item,shop.item,'Display matches the sold weapon');
 }
}
const first=models.build(T,'weapon',{item:'shotgun',displayAssets}),second=models.build(T,'weapon',{item:'shotgun',displayAssets});
const a=first.getObjectByName('ShowcaseWeapon'),b=second.getObjectByName('ShowcaseWeapon');
assert.equal(a.rotation.y,Math.PI,'Shotgun display is rotated a further 90 degrees');
assert.notEqual(a,b);assert.equal(a.children[0].children[0].geometry,b.children[0].children[0].geometry,'Repeated displays reuse weapon geometry');
assert.equal(first.getObjectByName('showcase-glass').material,second.getObjectByName('showcase-glass').material,'Repeated displays reuse glass material');
for(const weapon of ['bat','pistol','shotgun','smg','rifle','sniper','ricochet','revolver','railgun','rocket','flamethrower','lmg','hook','laserCannon','poisonGas','repulsor','freezeGun','plasmaBlade']) {
 const showcase=models.build(T,'weapon',{item:weapon,displayAssets}),gun=showcase.getObjectByName('ShowcaseWeapon');showcase.updateMatrixWorld(true);
 const supports=showcase.children.filter(o=>o.name==='weapon-support');assert.equal(supports.length,2);
 for(const name of ['weapon-rest','weapon-support','weapon-saddle']) {
  const pair=showcase.children.filter(o=>o.name===name);
  assert(!new T.Box3().setFromObject(pair[0]).intersectsBox(new T.Box3().setFromObject(pair[1])),'Support pair must not overlap: '+weapon+' '+name);
 }
 const floor=new T.Box3().setFromObject(showcase.getObjectByName('case-display-bed'));
 for(const support of supports) {
  const box=new T.Box3().setFromObject(support),ray=new T.Raycaster(new T.Vector3(support.position.x,floor.max.y,support.position.z),new T.Vector3(0,1,0));
  const hit=ray.intersectObject(gun,true)[0];assert(hit,'Support is directly below real weapon geometry: '+weapon);
  assert(box.min.y<=floor.max.y && box.max.y>=hit.point.y && box.max.y-hit.point.y<.3,'Support connects the display floor and weapon underside: '+weapon);
 }
}
console.log('All 18 weapons: both supports contact actual geometry and the display floor');
assert.equal(models.stationKind({item:'medkit'}),'medkit');assert.equal(models.stationKind({item:'oreFactory'}),'factoryShop');
assert(models.build(T,'medical').getObjectByName('healing-core'));assert(!models.build(T,'medical').getObjectByName('bed-frame'));
assert(!models.build(T,'workbench').getObjectByName('tool-board'));assert(models.build(T,'workbench').getObjectByName('hammer-handle'));assert(models.build(T,'workbench').getObjectByName('wrench-handle'));
for(const [kind,topName] of [['workbench','worktop'],['advanced','worktop'],['woodcutter','saw-table'],['command','console-desk'],['missile','launch-desk']]) {
 const table=models.build(T,kind),top=new T.Box3().setFromObject(table.getObjectByName(topName)),legs=table.children.filter(o=>o.name==='foot');
 assert.equal(legs.length,4);
 for(const leg of legs){const box=new T.Box3().setFromObject(leg);assert.equal(box.min.y,0,'Leg rests on the ground');assert(box.max.y>top.min.y && box.max.y<top.max.y,'Leg joins inside the tabletop: '+kind);assert(box.min.x>=top.min.x && box.max.x<=top.max.x && box.min.z>=top.min.z && box.max.z<=top.max.z,'Leg remains underneath the tabletop: '+kind);}
}
const silhouettes=new Set();
for(const kind of ['command','missile']) {
 const root=models.build(T,kind),box=name=>new T.Box3().setFromObject(root.getObjectByName(name));
 const top=box(kind==='command'?'console-desk':'launch-desk'),base=box('monitor-base'),stand=box('monitor-stand'),frame=box('screen-frame');
 assert(base.min.y<=top.max.y && base.max.y>=top.max.y,'Monitor base contacts desktop');
 assert(stand.min.y<=base.max.y && stand.max.y>=frame.min.y,'Monitor stem connects base and frame');
 assert.equal(root.getObjectByName('keyboard-keys').count,40,'Keyboard has individual key rows');
 assert(box('keyboard').min.y<=top.max.y && box('mouse-pad').min.y<=top.max.y,'Input devices rest on desktop');
 assert(root.getObjectByName('mouse-wheel'));assert.equal(root.children.filter(o=>o.name==='mouse-button').length,2);
 if(kind==='missile'){assert(!root.getObjectByName('missile-body'));assert(root.getObjectByName('blueprint-nose'));assert(root.getObjectByName('status-value'));}
}
for(const kind of Object.keys(models.colors)){
 const root=models.build(T,kind),bounds=new T.Box3().setFromObject(root),size=bounds.getSize(new T.Vector3());
 assert(size.x<=36 && size.z<=36 && bounds.min.y>=0 && bounds.max.y<=55,'Facility fits its footprint: '+kind);
 let count=0;root.traverse(o=>{if(o.isMesh){count++;assert(o.material);}});assert(count<=55,'Bounded model complexity: '+kind);
 silhouettes.add(root.children.map(o=>o.name+':'+o.scale.toArray().join(',')).join('|'));
}
assert.equal(silhouettes.size,Object.keys(models.colors).length,'Every facility family has a distinct silhouette');
assert.equal(models.build(T,'terminal'),null,'Wall panels keep their wall-mount renderer');
const source=fs.readFileSync('client/app.js','utf8'),start=source.indexOf('function labStations()'),end=source.indexOf('\nfunction ',start+1);
Object.assign(context,{state:{areas:Object.fromEntries(map.areas.map(a=>[a.id,true])),factories:[{id:'placed',item:'silverFactory',x:100,y:100}]},
 SHOP_UNITS:map.shopUnits,MEDBAYS:[map.stations.medBay,...map.medBayUnits],WOODCUTTER:map.stations.woodcutter,QUARRY:map.stations.quarry,WORKBENCHES:map.workbenchUnits,PREP_CONSOLE:map.prepConsole,MISSILE_COMPUTER:map.missileComputer,JOB_STATION:map.jobStation,BREAKER_TERMINALS:map.breakerTerminals,SPAWN_POINTS:map.spawnPoints,AREAS:map.areas,TILE_MAP:map.tileMap,isUnlockedPoint:()=>true,reachableFloorTiles:()=>new Set()});
vm.runInContext(source.slice(start,end<0?undefined:end),context);
const stations=context.labStations(),kindOf=id=>stations.find(([p])=>p.id===id)?.[3];
assert.equal(kindOf('woodcutter'),'woodcutter');assert.equal(kindOf('quarry'),'quarry');assert.equal(kindOf('prep-console'),'time');assert.equal(kindOf('job-station'),'job');assert.equal(kindOf('placed'),'factory');assert.equal(kindOf('last-overclock'),'advanced');
for(const [p,,color,kind] of stations)assert(color && kind,'Valid presentation data: '+p.id);
context.state.areas={};assert(!context.labStations().some(([p])=>p.id==='prep-console'),'Locked facilities stay hidden');
console.log('Map objects passed: all shops, distinct silhouettes, footprint/height/mesh budgets, facility routing, placed factory and unlock filtering');
