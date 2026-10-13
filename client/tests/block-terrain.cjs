const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({window:{}});for(const file of ['block-terrain.js','jump-movement.js'])vm.runInContext(fs.readFileSync('client/'+file,'utf8'),c);
const api=c.window.BlockTerrain,map=JSON.parse(fs.readFileSync('shared/map.json','utf8')).tileMap;
api.validate(map);const t=api.compile(map);assert.equal(t,api.compile(map),'Spatial index is built once');
for(let r=23;r<=29;r++)for(let col=29;col<=36;col++)if(map.rows[r][col]==='.')assert.equal(t.ceiling((col+.5)*40,(r+.5)*40),130,'Flat time-control/transit ceiling');
const custom={tileSize:40,legend:{'.':{solid:false}},rows:['.'],blockMap:{blockSize:2,regions:[{kind:'floor',from:[0,-2,0],to:[20,0,20]},{kind:'ceiling',from:[0,45,0],to:[20,48,20]},{kind:'floor',from:[0,65,0],to:[20,68,20]},{kind:'ceiling',from:[0,100,0],to:[20,103,20]}]}};
api.validate(custom);const upper=api.compile(custom);assert.equal(upper.ceiling(20,20),90,'Height is independent of room/corridor shape');assert.equal(upper.support(20,20,136),136);assert.equal(upper.ceiling(20,20,136),200,'Upper floor remains distinct');
assert.equal(c.window.JumpMovement.ceiling(custom,20,20),90,'Jump prediction reads explicit terrain');
for(const mutate of [m=>m.blockMap.regions[0].from[0]=-1,m=>m.blockMap.regions[0].to[0]=0,m=>m.blockMap.regions[0].kind='missing',m=>m.blockMap.regions[0].to[2]=21,m=>m.blockMap.blockSize=3,m=>m.blockMap.regions.splice(1)]){const invalid=structuredClone(custom);mutate(invalid);assert.throws(()=>api.validate(invalid));}
const refs=t.buckets.reduce((n,b)=>n+b.length,0);assert(refs<12000,'Index stores cuboid references, not millions of blocks');
console.log('3D block terrain passed: explicit heights, flat transit ceiling, stacked floors, jump integration, validation, caching; ranges='+t.boxes.length+', bucket references='+refs);

assert(upper.clearBody(20,20,5,0,32));assert(!upper.clearBody(20,20,5,70,32),'Body cannot pass through ceiling');assert(upper.clearBody(20,20,5,136,32),'Upper-floor body has independent clearance');
const raised={x:20,y:20,jumpHeight:136,jumpVelocity:0};assert(c.window.JumpMovement.start(raised,[],custom),'Can jump from a stacked floor');c.window.JumpMovement.advance(raised,.8,[],custom);assert.equal(raised.jumpHeight,136,'Lands on stacked floor');

for(const [x,z] of [[1100,1140],[1140,1180],[1020,1220],[1060,1260]]) {
 assert.equal(t.ceiling(x,z),130,'Entry approach has the normal ceiling height');
 assert(t.clearBody(x,z,10,64,32),'No leftover bulkheads across the raised ceiling');
}
