const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('client/app.js','utf8');
const calls=[]; let now=0;
const ctx = new Proxy({}, {get:(o,k)=>k in o?o[k]:(...args)=>calls.push([k,...args]),set:(o,k,v)=>{o[k]=v;calls.push([k,v]);return true;}});
const state={phase:'wave',artilleryReceivedAt:0,enemies:[
 {id:1,type:'poisoner',x:150,y:320,hp:400,maxHp:400},
 {id:2,type:'artilleryElite',x:420,y:320,hp:900,maxHp:900},
 {id:3,type:'finalBoss',x:920,y:320,hp:200000,maxHp:200000,bossAction:'PULSE_WARNING',pulseRadius:260,actionRemaining:.6,actionDuration:1.2}
],poisonClouds:[{x:150,y:320,radius:55,remaining:4,hostile:true}]};
const context=vm.createContext({state,ctx,performance:{now:()=>now},Math,hitEffects:[],smoothEntity:(_,e)=>e,
 clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),drawBar:(...args)=>calls.push(['bar',...args]),WardenUI:require('../warden-ui.js')});
for(const name of ['enemyRadius','drawEnemies','drawPoisonGas']) {
 const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);
 vm.runInContext(source.slice(start,end),context);
}
vm.runInContext('drawEnemies();drawPoisonGas();',context);
assert(calls.some(c=>c[0]==='fillText'&&c[1]==='OVERLORD'));
assert(calls.some(c=>c[0]==='fillText'&&c[1]==='ARTILLERY ELITE'));
assert(calls.some(c=>c[0]==='fillText'&&c[1]==='POISONER'));
assert(calls.some(c=>c[0]==='bar'&&c[3]===88&&c[5]===1));
assert(calls.some(c=>c[0]==='arc'&&c[3]===58));
assert.equal(calls.filter(c=>c[0]==='arc'&&c[3]===260).length,2);
assert(calls.some(c=>c[0]==='arc'&&c[3]===55));
assert.equal(ctx.strokeStyle,'#a6ce46');
calls.length=0; now=4000;vm.runInContext('drawPoisonGas()',context);assert.equal(calls.length,0);
state.poisonClouds=[{x:150,y:320,radius:120,remaining:6}];now=0;
vm.runInContext('drawPoisonGas()',context);assert.equal(ctx.strokeStyle,'rgb(180 110 235 / 65%)');
console.log('Enemy expansion display passed: names, boss HP/warning, small hostile poison, expiry and friendly gas');
