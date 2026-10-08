const assert = require('node:assert/strict'), fs = require('fs'), vm = require('vm');
const source = fs.readFileSync('client/app.js','utf8');
function extract(name) { const begin=source.indexOf('function '+name+'('); return source.slice(begin,source.indexOf('\nfunction ',begin+1)); }
// View distance remains capped under browser zoom, high DPI, and very wide/tall windows.
const viewport = vm.createContext({window:{devicePixelRatio:1},canvas:{style:{}},VIEW:{width:900,height:500},scale:1,innerWidth:1280,innerHeight:720});
vm.runInContext(extract('resize').split('window.addEventListener')[0],viewport);
for(const [w,h,dpr] of [[1280,720,1],[2560,1440,.5],[5120,1440,2],[720,1280,3]]) {
    Object.assign(viewport,{innerWidth:w,innerHeight:h});viewport.window.devicePixelRatio=dpr;
    vm.runInContext('resize()',viewport);
    assert(viewport.canvas.width/viewport.scale <= 900.001);
    assert(viewport.canvas.height/viewport.scale <= 500.001);
}
// Missile map shows the complete world during a blackout and converts letterboxed clicks accurately.
const map=JSON.parse(fs.readFileSync('shared/map.json','utf8'));
let click, keydown, draws=0, sent=[];
const draw = new Proxy({}, {get:()=>()=>{draws++;},set:()=>true});
const canvas={width:300,height:150,getContext:()=>draw,addEventListener:(name,fn)=>click=fn,getBoundingClientRect:()=>({left:0,top:0,width:1000,height:500})};
const label={}, button={focus(){},onclick:null};
const panel={hidden:false,setAttribute(){},querySelector:s=>s==='canvas'?canvas:s==='span'?label:button,addEventListener:(name,fn)=>keydown=fn};
const window={}, document={createElement:()=>panel,body:{append(){}}};
vm.runInNewContext(fs.readFileSync('client/terminal-ui.js','utf8'),{window,document,Math,Set});
const me={missileControl:true,missileCooldown:0};
const state={phase:'wave',blackoutActive:true,areas:Object.fromEntries(map.areas.map(a=>[a.id,true])),core:map.core,players:[],enemies:[],missiles:[]};
window.TerminalUI.update(state,me,{map,send:cmd=>sent.push(cmd)});
assert.equal(canvas.width,map.world.width); assert.equal(canvas.height,map.world.height);assert(draws>100);
click({clientX:500,clientY:250});assert.equal(sent.pop(),'MISSILE:1040.0:1040.0');
click({clientX:10,clientY:250});assert.equal(sent.length,0,'letterbox is not targetable');
me.missileCooldown=4;click({clientX:500,clientY:250});assert.equal(sent.length,0);
button.onclick();assert.equal(sent.pop(),'COMPUTER');
me.missileControl=false;window.TerminalUI.update(state,me,{map,send(){}});assert(panel.hidden);
console.log('Hacker UI passed: bounded zoom, night vision map, target conversion, cooldown, exit');
