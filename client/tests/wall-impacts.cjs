const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('client/wall-impacts.js','utf8'),c);const api=c.window.WallImpacts,map={tileSize:40},reachable=new Set(['1:1']);
const base={effect:'hit',weapon:'rifle',damage:0,enemyId:null,fromX:60,fromY:60,fromHeight:26,x:76,y:60,hitHeight:26};
for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
 const p=api.surface({...base,x:60+dx*16,y:60+dz*16},map,reachable);assert(p);assert.equal(p.nx,-dx);assert.equal(p.nz,-dz);assert.equal(p.x,60+dx*19.95);assert.equal(p.z,60+dz*19.95);assert.equal(p.y,26);
}
assert.equal(api.surface({...base,x:65},map,reachable),null,'Range expiry in open floor is not a wall hit');
assert.equal(api.surface({...base,x:100},map,reachable),null,'Do not guess marks deep inside walls');
assert.equal(api.surface({...base,x:76,hitHeight:150},map,reachable),null);
for(const invalid of [{enemyId:4},{damage:5},{weapon:'bat'},{weapon:'repulsor'},{weapon:'rocket'},{x:NaN},{fromHeight:undefined}])assert.equal(api.surface({...base,...invalid},map,reachable),null);
const floor=api.surface({...base,fromY:100,x:60,y:60,hitHeight:0},map,reachable);assert.equal(floor.ny,1);assert.equal(floor.y,.05);
const rising=api.surface({...base,hitHeight:28},map,reachable);assert.equal(rising.y,28.5,'Wall placement follows actual vertical slope');
const open=new Set(['1:1','1:2']);assert.equal(api.surface(base,map,open),null,'Open cell never receives a floating mark');
assert.equal(api.capacity,32);assert.equal(api.lifetime,2000);
console.log('Wall impacts passed: four wall normals, floor, authoritative height, nearby-only bounds, special/enemy exclusions and bounded lifetime');

const corner=api.surface({...base,fromY:140,x:80,y:44},map,new Set(['1:1','1:2','2:1','2:2','3:1']));assert(corner&&corner.nz===1&&corner.x>80,'A diagonal segment may cross a floor cell edge before striking a neighboring wall');
