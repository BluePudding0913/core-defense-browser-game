const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const source=fs.readFileSync('client/app.js','utf8');
function extract(name){const start=source.indexOf('function '+name+'(');return source.slice(start,source.indexOf('\nfunction ',start+1));}
const rectangles=[],labels=[];
let placing=false;
const node={x:1660,y:620,available:false,type:'wood'};
const context=vm.createContext({state:{resources:[node]}, getMe:()=>({}),
    placementSelection:()=>placing?{forCore:false}:null, frontPlacementTile:()=>node, canBuildAt:()=>false,
    TILE_MAP:{tileSize:40}, distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),
    ctx:{save(){},restore(){},strokeRect:(...args)=>rectangles.push(args),fillRect(){},fillText:text=>labels.push(text)},
});
vm.runInContext(extract('drawResources')+'\n'+extract('drawPlacementPreview'),context);
vm.runInContext('drawResources()',context);assert.equal(rectangles.length,0);
placing=true;vm.runInContext('drawResources(); drawPlacementPreview()',context);
assert.deepEqual(rectangles[0],[1652,614,16,12]);assert.equal(labels.pop(),'RESOURCE');
context.frontPlacementTile=()=>({x:1700,y:620});
vm.runInContext('drawPlacementPreview()',context);assert.equal(labels.pop(),'BLOCKED');
console.log('Hidden resource placement positions are visible while building');
