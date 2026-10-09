const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync('client/app.js', 'utf8'), commands = [];
const me = {hp:40, medkits:3, down:false};
let click;
const context = vm.createContext({inventoryItems:{addEventListener:(_,callback)=>{click=callback;}},
    getMe:()=>me, inventorySuppressClickUntil:0, performance:{now:()=>100},
    send:command=>commands.push(command)});
const begin = source.indexOf('inventoryItems.addEventListener("click"');
const end = source.indexOf('\nfunction resourceInventoryCard',begin);
vm.runInContext(source.slice(begin,end),context);
const press = dataset => click({target:{closest:()=>({dataset,hasAttribute:()=>false})}});
press({dropItem:'medkit',amount:'1'}); assert.equal(commands.at(-1),'DROP_ITEM:medkit:1');
me.medkits=2; press({dropItem:'medkit',amount:'all'}); assert.equal(commands.at(-1),'DROP_ITEM:medkit:2');
press({use:'medkit'}); assert.equal(commands.at(-1),'USE:medkit');
me.hp=100; press({use:'medkit'}); assert.equal(commands.length,3);
press({dropItem:'medkit',amount:'1'}); assert.equal(commands.length,4,'full HP still allows dropping');
me.medkits=0; press({dropItem:'medkit',amount:'all'}); press({use:'medkit'}); assert.equal(commands.length,4);
me.medkits=2; me.down=true; press({dropItem:'medkit',amount:'1'}); press({use:'medkit'}); assert.equal(commands.length,4);
me.down=false; me.wood=8; press({drop:'wood',amount:'all'}); assert.equal(commands.at(-1),'DROP_RESOURCE:wood:8');
me.wood=0; press({drop:'wood',amount:'1'}); assert.equal(commands.length,5);
console.log('Inventory actions passed: latest quantities, use, full HP, empty and down guards');
