const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('client/app.js','utf8'),start=source.indexOf('function send(message)'),end=source.indexOf('\nfunction ',start+1),sent=[];
const context=vm.createContext({socket:{readyState:1,send:m=>sent.push(m)},WebSocket:{OPEN:1},DEBUG_MODE:false,fpsInput:{view:{pitch:-.3}},nextInputSequence:1,pendingInputs:[]});
vm.runInContext(source.slice(start,end),context);
vm.runInContext("send('FIRE:100:200:1');send('SECONDARY_FIRE:100:200:1');send('SECONDARY_FIRE:0:0:0')",context);
assert.equal(sent[0],'INPUT:1:FIRE:100:200:1:-0.300000');assert.equal(sent[1],'INPUT:2:SECONDARY_FIRE:100:200:1:-0.300000');assert.equal(sent[2],'INPUT:3:SECONDARY_FIRE:0:0:0:-0.300000');
context.fpsInput=null;vm.runInContext("send('FIRE:100:200:1')",context);assert.equal(sent[3],'INPUT:4:FIRE:100:200:1');assert.equal(context.pendingInputs.length,4);
console.log('FPS fire protocol passed: pitch on both hands and release, legacy fallback and sequenced input envelope');

context.fpsInput={view:{pitch:1.199,recoilPitch:.006}};vm.runInContext("send('FIRE:100:200:1')",context);assert.equal(sent.at(-1),'INPUT:5:FIRE:100:200:1:1.200000','Recoil affects authoritative pitch and stays inside validated limits');

// Use the current yaw even when the rendered target belongs to the preceding frame.
context.fpsInput={view:{yaw:Math.PI/2,pitch:.2}};
vm.runInContext("send('FIRE:100:200:1');send('SECONDARY_FIRE:100:200:1');send('FIRE:100:200:0')",context);
for(const message of sent.slice(-3)) {
 const fields=message.split(':').slice(2);
 assert.equal(fields[4],'0.200000');assert.equal(fields[5],'');
 assert.equal(fields[6],(Math.PI/2).toFixed(9));
}
context.window={AimControl:{supported:()=>true,sample:()=>({elapsed:3.25})}};
context.getMe=()=>({weapon:'rifle',secondaryWeapon:'sniper',aimControl:{}});
context.WEAPON_FIELDS={};context.performance={now:()=>1000};vm.runInContext("send('FIRE:100:200:1');send('SECONDARY_FIRE:100:200:1')",context);
for(const message of sent.slice(-2)){const fields=message.split(':').slice(2);assert.equal(fields[5],'3.250000');assert.equal(fields[6],(Math.PI/2).toFixed(9));}
context.window.SniperAim={sample:()=>({elapsed:1.5})};context.getMe=()=>({weapon:'sniper',sniper:{fixed:true}});
vm.runInContext("send('FIRE:100:200:1')",context);
assert.equal(sent.at(-1).split(':').slice(-2).join(':'),'1.500000:'+(Math.PI/2).toFixed(9));
