const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('client/app.js','utf8');
const extract=name=>{const a=source.indexOf('function '+name+'('),b=source.indexOf('\nfunction ',a+1);return source.slice(a,b<0?undefined:b);};
const shapes=[],labels=[];
const ctx=new Proxy({}, {get:(o,k)=>k in o?o[k]:(...args)=>{if(['fillRect','strokeRect','arc','moveTo','lineTo'].includes(k))shapes.push({k,args});if(k==='fillText')labels.push(args[0]);},set:(o,k,v)=>(o[k]=v,true)});
const context=vm.createContext({labRenderer:{},ctx,performance:{now:()=>1000},scale:1,myPlayerId:'me',
 TILE_MAP:{tileSize:40},STARTING_AREA:null,AREAS:[{id:'room',terminalX:40,terminalY:40}],reachableFloorTiles:()=>new Set(['1:1']),
 BREAKER_TERMINALS:[{id:'breaker',x:100,y:100}],smoothEntity:(_,p)=>p,enemyRadius:()=>24,hitEffects:[],
 state:{areas:{},resources:[{id:1,type:'wood',available:true,x:80,y:80}],drops:[{id:1,type:'medkit',x:120,y:80}],enemies:[{id:1,type:'shield',hp:100,x:180,y:100},{id:2,type:'artillery',hp:100,x:220,y:100}]}});
for(const fn of ['drawAreas','drawBreakers','drawResources','drawDroppedResources','drawEnemies','drawHitEffects'])vm.runInContext(extract(fn),context);
vm.runInContext('drawAreas();drawBreakers();drawResources();drawDroppedResources();drawEnemies()',context);
assert.equal(shapes.length,0,'3D terminals, breakers, items and enemy equipment do not retain flat body geometry');
assert(labels.includes('UNLOCK'));assert(labels.includes('MEDKIT'));
context.hitEffects=[{effect:'hit',weapon:'pistol',damage:0,playerId:'me',fromX:100,fromY:100,x:200,y:100,started:1000}];
vm.runInContext('drawHitEffects()',context);assert.equal(shapes.length,0,'3D gunfire does not duplicate a ground-level red line');
context.labRenderer=null;vm.runInContext('drawAreas();drawBreakers();drawResources();drawDroppedResources();drawEnemies();drawHitEffects()',context);
assert(shapes.length>0,'Fallback still draws the original 2D bodies and shot paths');
console.log('3D overlay passed: no duplicate breaker/unlock/loot/shield/artillery bodies or ground traces; labels and fallback retained');
