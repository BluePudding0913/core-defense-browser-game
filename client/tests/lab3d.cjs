const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('client/app.js','utf8');
const context=vm.createContext({labRenderer:{groundScale:1/Math.sqrt(1+.7*.7)},canvas:{width:1800,height:1000,getBoundingClientRect:()=>({left:20,top:30,width:900,height:500})},scale:2,camera:{x:1000,y:800}});
for(const name of ['worldYScale','worldFromScreen']) {const a=source.indexOf('function '+name+'('), b=source.indexOf('\nfunction ',a+1);vm.runInContext(source.slice(a,b),context);}
for(const [x,y] of [[1000,800],[1100,650],[800,1000]]){
 const factor=context.labRenderer.groundScale;
 context.screenX=20+450+(x-1000);context.screenY=30+250+(y-800)*factor;
 const p=vm.runInContext('worldFromScreen(screenX,screenY)',context);
 assert(Math.abs(p.x-x)<1e-8);assert(Math.abs(p.y-y)<1e-8);
}
context.labRenderer=null;
const p=vm.runInContext('worldFromScreen(570,330)',context);assert.equal(p.x,1100);assert.equal(p.y,850);
console.log('3D projection passed: aim and placement round trip at DPR 2, tilted and fallback views');
