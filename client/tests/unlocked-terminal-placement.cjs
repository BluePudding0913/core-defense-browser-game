const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const map=require('../../shared/map.json'),source=fs.readFileSync('client/app.js','utf8');
const point={x:1620,y:700},ammo=map.shopUnits.find(shop=>shop.item==='ammo');
assert.equal(point.x,ammo.x-3*map.tileMap.tileSize);assert.equal(point.y,ammo.y+map.tileMap.tileSize);
const context=vm.createContext({state:{areas:Object.fromEntries(map.areas.map(a=>[a.id,true])),
    core:{x:1000,y:1900},resources:map.resourceNodes,players:[],enemies:[],slots:[]},
    TILE_MAP:map.tileMap,AREAS:map.areas,SHOP_UNITS:map.shopUnits,WORKBENCHES:map.workbenchUnits,
    BREAKER_TERMINALS:map.breakerTerminals,MEDBAYS:[map.stations.medBay,...map.medBayUnits],PREP_CONSOLE:map.prepConsole,
    MISSILE_COMPUTER:map.missileComputer,JOB_STATION:map.jobStation,SPAWN_POINTS:map.spawnPoints,
    ARMORY:map.stations.armory,WOODCUTTER:map.stations.woodcutter,QUARRY:map.stations.quarry,
    snapToTile:p=>p,canPredictOccupy:()=>true,distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),myPlayerId:'me'});
const start=source.indexOf('function canBuildAt(');
vm.runInContext(source.slice(start,source.indexOf('\nfunction ',start+1)),context);
assert(context.canBuildAt(point));assert(context.canBuildAt(point,true));
context.state.areas.forest=false;assert(!context.canBuildAt(point));
console.log('Unlocked FOREST LAB terminal allows defense and core placement at AMMO left 3, down 1');
