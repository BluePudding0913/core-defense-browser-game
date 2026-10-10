const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8');
const extract = name => { const start=source.indexOf('function '+name+'('), end=source.indexOf('\nfunction ',start+1); return source.slice(start,end<0?undefined:end); };
const WeaponUI=vm.runInNewContext(fs.readFileSync('client/weapon-ui.js','utf8')+';WeaponUI');
const fields={bat:{capacity:0,owned:'ownsBat'},pistol:{capacity:0,owned:'ownsPistol'},hook:{capacity:0,owned:'ownsHook'},
    rifle:{capacity:30,owned:'ownsRifle',ammo:'rifleAmmo'},smg:{capacity:240,owned:'ownsSmg'}};
const me={ownsBat:true,ownsPistol:true,ownsHook:false,credits:10000};
let menu;
const context=vm.createContext({WeaponUI, WEAPON_FIELDS:fields, getMe:()=>me, state:{rules:{weaponLimit:3}},
    INTERACTION_RANGE:{shop:70},openNearbyActionMenu:(title,options)=>{menu={title,options}}});
for(const name of ['openGachaShop','openShopPurchase'])vm.runInContext(extract(name),context);
context.shop={item:'gacha',label:'GACHA',cost:10000};
const open=()=>vm.runInContext('openShopPurchase(shop)',context);
open();assert.equal(menu.options[0].command,'BUY:gacha:roll');assert(!menu.options[0].disabled);
me.credits=9999;open();assert(menu.options[0].disabled);
me.gachaWeapon='hook';open();assert.equal(menu.title,'HOOK');assert.equal(menu.options[0].command,'BUY:gacha:take');
assert.equal(menu.options[1].command,'BUY:gacha:skip');assert(!menu.options[0].disabled);
me.ownsRifle=true;me.gachaWeapon='rifle';me.rifleAmmo=1;open();assert.equal(menu.options[0].label,'REFILL');
me.drone={active:true,weapon:'rifle'};open();assert(menu.options[0].disabled);me.drone=null;
me.ownsSmg=true;me.gachaWeapon='hook';open();assert.equal(menu.options[0].command,undefined);
menu.options[0].onSelect();assert(menu.options.some(o=>o.command==='BUY:gacha:pistol'));
assert(!menu.options.some(o=>o.command==='BUY:gacha:bat'));
me.weaponLimit=4;open();assert.equal(menu.options[0].command,'BUY:gacha:take');
context.shop={item:'hook',label:'HOOK',cost:100};
vm.runInContext('openShopPurchase(shop)',context);assert.equal(menu.options[0].command,'BUY:hook');
me.weaponLimit=3;vm.runInContext('openShopPurchase(shop)',context);assert.equal(menu.options[0].command,undefined);
context.shop={item:'gacha',label:'GACHA',cost:10000};
me.ownsHook=true;open();assert(menu.options[0].disabled);assert.equal(menu.options.at(-1).command,'BUY:gacha:skip');
const labels=[],paths=[];
const ctx={save(){},restore(){},beginPath(){},closePath(){},fill(){},stroke(){},arc(){},
    moveTo(x,y){paths.push([x,y])},lineTo(x,y){paths.push([x,y])},fillText(text){labels.push(text)}};
Object.assign(context,{ctx,Math,performance:{now:()=>1000},hitEffects:[],smoothEntity:(_,e)=>e,
    clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),drawBar(){}});
context.state.enemies=[{id:1,type:'blueAce',x:100,y:100,hp:100,maxHp:100},
    {id:2,type:'carrier',x:200,y:200,hp:100,maxHp:100,bagHp:600,bagX:174,bagY:200,releaseProgress:1},
    {id:3,type:'boss',x:300,y:300,hp:100,maxHp:100,chargeWarning:.7,chargeDx:1,chargeDy:0}];
for(const name of ['enemyRadius','drawEnemies','drawHooks'])vm.runInContext(extract(name),context);
vm.runInContext('drawEnemies()',context);
assert(paths.some(([x,y])=>x===91&&y===91));assert(labels.includes('12'));
assert(paths.some(([x,y])=>x===586&&y===300));
context.state.players=[{x:0,y:0,hookTargetId:2,hookReeling:true}];
vm.runInContext('drawHooks()',context);assert(paths.some(([x,y])=>x===200&&y===200));
console.log('Gacha and special enemy UI passed: roll/take/refill/skip/exchange, backpack, blue square, charge warning and hook rope');
