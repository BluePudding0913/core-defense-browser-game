const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const saved={};const ctx=vm.createContext({window:{},localStorage:{getItem:k=>saved[k]??null,setItem:(k,v)=>saved[k]=v}});
const load=f=>vm.runInContext(fs.readFileSync('client/'+f,'utf8'),ctx);
load('mouse-settings.js');const mouse=ctx.window.coreMouseSettings;assert.equal(mouse.get(),1);assert.equal(mouse.set(.05),.2);assert.equal(mouse.set(99),3);mouse.set(.65);load('mouse-settings.js');assert.equal(ctx.window.coreMouseSettings.get(),.65);assert.equal(mouse.set(NaN),1);
load('minimap.js');const frame={map:{tileSize:40},player:{x:400,y:400},state:{enemies:[{id:'edge',x:760,y:400,hp:10},{id:'outside',x:761,y:400,hp:10},{id:'diagonal',x:700,y:700,hp:10},{id:'dead',x:400,y:400,hp:0}],blackoutActive:true,trippedBreakers:['far','locked'],areas:{open:true}},spawns:[{id:'main',x:400,y:400},{id:'area-open:1',x:420,y:400},{id:'area-locked:1',x:420,y:400},{id:'farspawn',x:800,y:400}],breakers:[{id:'far',x:1200,y:400},{id:'locked',x:400,y:400,requiredArea:'closed'},{id:'ok',x:440,y:400}]};
const data=ctx.window.MiniMap.sample(frame);assert.equal(data.range,360);assert.deepEqual(Array.from(data.enemies,e=>e.id),['edge']);assert.deepEqual(Array.from(data.spawns,e=>e.id),['main','area-open:1']);assert.deepEqual(Array.from(data.breakers,e=>e.id),['far','ok']);
// Closing either menu (including the asynchronous purchase-complete path) activates look immediately.
const src=fs.readFileSync('client/app.js','utf8');const extract=name=>{const a=src.indexOf('function '+name+'(');return src.slice(a,src.indexOf('\nfunction ',a+1));};
let captures=0,active=false;const menu=()=>({hidden:true,classList:{contains(){return this.owner.hidden},add(name){if(name==='hidden')this.owner.hidden=true},remove(name){if(name==='hidden')this.owner.hidden=false}}});const inv=menu(),action=menu(),how=menu();for(const m of [inv,action,how])m.classList.owner=m;
const c=vm.createContext({fpsInput:{setActive:on=>active=on,capture:()=>captures++},state:{phase:'wave'},exitDialog:{open:false},actionMenu:action,inventoryMenu:inv,howToMenu:how,window:{},getMe:()=>({weapon:'sniper'}),closeInventoryPopover(){},activeMenuAccess:{}});
for(const name of ['resumeGameLook','closeInventory','closeActionMenu'])vm.runInContext(extract(name),c);
inv.hidden=false;c.closeInventory();assert(active);assert.equal(captures,1);
action.hidden=false;active=false;c.closeActionMenu();assert(active);assert.equal(captures,2,'Buying a sniper resumes free look without stance activation');
c.exitDialog.open=true;c.closeActionMenu();assert.equal(captures,2,'Exit UI must retain the cursor');c.exitDialog.open=false;c.state.phase='lost';c.closeInventory();assert.equal(captures,2,'Failure does not capture');
console.log('FPS UI passed: persistent sensitivity, radius9 enemy radar, entry/breaker filtering and purchase/inventory capture lifecycle');
