const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),T=require('../vendor/three.min.js');
const context=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('client/map-object-models.js','utf8'),context);
const models=context.window.MapObjectModels,map=require('../../shared/map.json');
for(const shop of map.shopUnits){const kind=models.stationKind(shop);assert(models.build(T,kind,{item:shop.item}),'Every shop has a dedicated model: '+shop.id);}
const silhouettes=new Set();
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
