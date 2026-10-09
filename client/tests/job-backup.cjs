const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("client/app.js","utf8");
const extract=name=>{const a=source.indexOf("function "+name+"("),b=source.indexOf("\nfunction ",a+1);return source.slice(a,b<0?undefined:b);};
let menu;const me={job:"hacker",credits:100000};const hidden={classList:{contains:()=>true}};
const context=vm.createContext({getMe:()=>me,state:{phase:"preparing",backupCost:100000},inventoryMenu:hidden,howToMenu:hidden,actionMenu:hidden,
 openNearbyActionMenu:(title,options)=>menu={title,options},send(){},openDroneLaunch(){}});
vm.runInContext(extract("useJobAbility"),context);vm.runInContext("useJobAbility()",context);
assert.equal(menu.title,"BACKUP");assert.equal(menu.options[0].command,"HACKER_BACKUP");assert(!menu.options[0].disabled);
me.credits=99999;vm.runInContext("useJobAbility()",context);assert(menu.options[0].disabled);
menu=null;context.state.phase="wave";vm.runInContext("useJobAbility()",context);assert.equal(menu,null);
context.state.phase="preparing";context.state.backupUsed=true;vm.runInContext("useJobAbility()",context);assert.equal(menu,null);
console.log("Hacker backup menu passed: preparation, price and once-per-match restriction");
