const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("client/app.js","utf8");
const extract=name=>{const a=source.indexOf("function "+name+"("),b=source.indexOf("\nfunction ",a+1);return source.slice(a,b<0?undefined:b);};
let now=1000;const strokes=[],rects=[],texts=[],paths=[];
const ctx=new Proxy({}, {get:(target,key)=>{
 if(key==="stroke") return ()=>strokes.push(target.strokeStyle);
 if(key==="fillRect") return (...args)=>rects.push({color:target.fillStyle,args});
 if(key==="fillText") return value=>texts.push(value);
 if(key==="moveTo"||key==="lineTo")return (...args)=>paths.push(args);
 return key in target?target[key]:()=>{};
},set:(target,key,value)=>(target[key]=value,true)});
const state={projectiles:[{id:"enemy-1",source:"enemy",x:100,y:100,angle:0},{id:"ally-1",source:"ally",x:200,y:100,angle:Math.PI/2}],enemies:[
 {id:1,type:"blackout",powerCut:true,hp:100,x:200,y:100},{id:2,type:"blackout",powerCut:false,hp:100},
 {id:3,type:"blackout",powerCut:true,hp:0},{id:4,type:"grunt",hp:100}]};
let missileControl=false;
const context=vm.createContext({state,ctx,canvas:{width:800,height:600},smoothed:new Map(),camera:{x:400,y:300},scale:1,
 performance:{now:()=>now},smoothEntity:(_,p)=>p,enemyRadius:()=>21,getMe:()=>({missileControl}),clamp:(v,a,b)=>Math.max(a,Math.min(b,v))});
for(const name of ["drawProjectiles","drawBlackoutEnemyGlow","drawRewindScreen"])vm.runInContext(extract(name),context);
vm.runInContext("drawProjectiles()",context);assert.deepEqual(strokes,["#ff7050","#69dfff"]);assert.deepEqual(paths[0],[80,100]);
rects.length=0;vm.runInContext("drawBlackoutEnemyGlow()",context);assert.equal(rects.length,2,"Only active living disruptor has glowing eyes");
missileControl=true;vm.runInContext("drawBlackoutEnemyGlow()",context);assert.equal(rects.length,2,"Map view stays readable");
state.rewindRemaining=3.4;vm.runInContext("drawRewindScreen()",context);assert(texts.includes("BACKUP DETECTED"));
texts.length=0;state.rewindRemaining=1.7;vm.runInContext("drawRewindScreen()",context);assert(texts.includes("RESTORING SYSTEM..."));
texts.length=0;state.rewindRemaining=.2;vm.runInContext("drawRewindScreen()",context);assert(texts.includes("REBOOTING..."));
state.rewindRemaining=0;vm.runInContext("rewindFinishedAt=900",context);rects.length=0;vm.runInContext("drawRewindScreen()",context);assert.equal(rects.length,1,"Restoration ends with a flash");
now=1800;rects.length=0;vm.runInContext("drawRewindScreen()",context);assert.equal(rects.length,0,"Overlay expires");
console.log("Enemy/rewind visuals passed: source colors, trajectories, living disruptors, map view, automatic stages and fade");

