const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const map = JSON.parse(fs.readFileSync('shared/map.json', 'utf8'));
const context = vm.createContext({TILE_MAP:map.tileMap, AREAS:map.areas, WORLD:map.world,
 state:{areas:{}, slots:[], players:[]}, distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)});
function extract(name) {
 const begin = source.indexOf('function '+name+'(');
 const end = source.indexOf('\nfunction ',begin+1);
 return source.slice(begin,end < 0 ? undefined : end);
}
vm.runInContext('let visibleFloorCache=null; let floorOrigin={x:1020,y:1900};'+extract('reachableFloorTiles')+extract('canPredictOccupy')+extract('hasInteractionPath'), context);
const floors=()=>vm.runInContext('reachableFloorTiles()',context);
assert(floors().has('47:25'));
assert(!floors().has('30:25'), 'Corridor beyond locked entry must be dark');
context.state.areas['entry-room']=true;
assert(floors().has('30:25'), 'Opening entry must reveal corridor');
for(const area of map.areas) context.state.areas[area.id]=true;
for(let row=0;row<map.tileMap.rows.length;row++) for(let col=0;col<map.tileMap.rows[row].length;col++) {
 if(map.tileMap.rows[row][col]==='.') assert(floors().has(row+':'+col), 'All unlocked floor should be visible');
}
context.state.areas['relay-gallery']=false;
assert(vm.runInContext('hasInteractionPath({x:1425,y:365},{x:1380,y:340})',context));
assert(!vm.runInContext('hasInteractionPath({x:1380,y:435},{x:1380,y:340})',context));
let bars=[];
context.ctx=new Proxy({}, {get:(_,key)=>()=>{}});
context.myPlayerId='me'; context.predictedLocal=null;
context.smoothEntity=(_,p)=>p;
context.drawLocalWeaponCooldown=()=>{};
context.drawReviveEffect=(...args)=>bars.push(args);
vm.runInContext(extract('drawPlayers'),context);
for(const [rescuer,target,expected] of [['ally','other',0],['me','other',1],['ally','me',1]]) {
 bars=[]; context.state.players=[{id:rescuer,action:target,actionProgress:2,x:0,y:0},{id:target,down:true,x:10,y:10}];
 vm.runInContext('drawPlayers()',context); assert.equal(bars.length,expected);
}
console.log('UI regressions passed: revive visibility, locked floors, terminal paths');
