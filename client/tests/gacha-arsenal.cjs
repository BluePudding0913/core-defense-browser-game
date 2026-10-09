const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('client/app.js','utf8');
const extract=name=>{const a=source.indexOf('function '+name+'('),b=source.indexOf('\nfunction ',a+1);return source.slice(a,b<0?undefined:b);};
let now=1000;const strokes=[],arcs=[],fills=[];
const ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},
 stroke(){strokes.push({color:this.strokeStyle,width:this.lineWidth})},
 fill(){fills.push(this.fillStyle)},arc(...args){arcs.push(args)}};
const context=vm.createContext({ctx,Math,performance:{now:()=>now},state:{rules:{weapons:{laserCannon:{width:10}}},
 artilleryReceivedAt:1000,poisonClouds:[{x:100,y:100,radius:120,remaining:6}]}});
for(const name of ['drawPoisonGas','drawGachaWeaponEffect'])vm.runInContext(extract(name),context);
vm.runInContext('drawPoisonGas()',context);assert.equal(arcs[0][2],120);assert.equal(arcs.length,11);
arcs.length=0;now=7001;vm.runInContext('drawPoisonGas()',context);assert.equal(arcs.length,0);
context.effect={weapon:'laserCannon',started:900,damage:0,fromX:100,fromY:100,x:500,y:100};
vm.runInContext('drawGachaWeaponEffect(effect,1000)',context);
assert.equal(strokes.at(-2).color,'#50d7ff');assert.equal(strokes.at(-2).width,20);assert.equal(strokes.at(-1).width,4);
let before=strokes.length;context.effect.damage=650;context.effect.enemyId=1;
vm.runInContext('drawGachaWeaponEffect(effect,1000)',context);assert.equal(strokes.length,before,'impacts must not create extra beams');
context.effect={weapon:'repulsor',started:900,damage:0,fromX:100,fromY:100,x:420,y:100};
vm.runInContext('drawGachaWeaponEffect(effect,1000)',context);
assert.equal(arcs.at(-1)[2],160);assert.equal(arcs.at(-1)[3],-Math.PI/2);assert.equal(arcs.at(-1)[4],Math.PI/2);
before=strokes.length;vm.runInContext('drawGachaWeaponEffect(effect,1200)',context);assert.equal(strokes.length,before);
const WeaponUI=vm.runInNewContext(fs.readFileSync('client/weapon-ui.js','utf8')+';WeaponUI');
let menu;const me={credits:10000,ownsPistol:true,ownsLaserCannon:false,ownsPoisonGas:false,ownsRepulsor:false};
Object.assign(context,{WeaponUI,WEAPON_FIELDS:{
 pistol:{capacity:0,owned:'ownsPistol'},laserCannon:{name:'LASER CANNON',capacity:30,owned:'ownsLaserCannon',ammo:'laserCannonAmmo'},
 poisonGas:{name:'POISON GAS',capacity:12,owned:'ownsPoisonGas',ammo:'poisonGasAmmo'},
 repulsor:{name:'REPULSOR',capacity:0,owned:'ownsRepulsor'}},
 getMe:()=>me,INTERACTION_RANGE:{shop:70},openNearbyActionMenu:(title,options)=>menu={title,options}});
context.state.rules.weaponLimit=3;context.shop={cost:10000,label:'GACHA'};
vm.runInContext(extract('openGachaShop'),context);
for(const [id,name,owned] of [['laserCannon','LASER CANNON','ownsLaserCannon'],['poisonGas','POISON GAS','ownsPoisonGas'],['repulsor','REPULSOR','ownsRepulsor']]){
 me.gachaWeapon=id;vm.runInContext('openGachaShop(shop)',context);
 assert.equal(menu.title,name);assert.equal(menu.options[0].command,'BUY:gacha:take');assert.equal(menu.options[1].command,'BUY:gacha:skip');
 me[owned]=true;vm.runInContext('openGachaShop(shop)',context);assert.equal(menu.options[0].label,'REFILL');
 assert.equal(Boolean(menu.options[0].disabled),id==='repulsor');me[owned]=false;
}
console.log('Gacha arsenal UI passed: exclusive names, claim/refill/skip, gas expiry, laser beam and repulsor wave');

context.WEAPON_FIELDS.freezeGun={name:"FREEZE GUN",capacity:60,owned:"ownsFreezeGun",ammo:"freezeGunAmmo"};
context.WEAPON_FIELDS.plasmaBlade={name:"PLASMA BLADE",capacity:0,owned:"ownsPlasmaBlade",meleeSlot:true};
me.ownsLaserCannon=me.ownsPoisonGas=true;me.gachaWeapon="silverAmmo200";vm.runInContext("openGachaShop(shop)",context);
assert.equal(menu.title,"SILVER AMMO ×200");assert.equal(menu.options[0].command,"BUY:gacha:take");assert.equal(menu.options[1].command,"BUY:gacha:skip");
me.ownsPlasmaBlade=false;me.gachaWeapon="plasmaBlade";vm.runInContext("openGachaShop(shop)",context);assert.equal(menu.options[0].label,"BATと交換");assert.equal(menu.options[0].command,"BUY:gacha:take");
me.ownsPlasmaBlade=true;vm.runInContext("openGachaShop(shop)",context);assert(menu.options[0].disabled);
me.ownsLaserCannon=false;assert(!WeaponUI.atLimit(me,context.WEAPON_FIELDS,3),"melee slot does not count toward ranged capacity");
for(const weapon of ["freezeGun","plasmaBlade"]) {context.effect={weapon,started:900,damage:0,fromX:100,fromY:100,x:220,y:100};before=strokes.length;
 vm.runInContext("drawGachaWeaponEffect(effect,1000)",context);assert(strokes.length>before);}
console.log("New gacha UI passed: silver ammo at full inventory, BAT exchange and freeze/plasma effects");
