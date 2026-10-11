const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('client/app.js','utf8'),start=source.indexOf('function send(message)'),end=source.indexOf('\nfunction ',start+1),sent=[];
const context=vm.createContext({socket:{readyState:1,send:m=>sent.push(m)},WebSocket:{OPEN:1},DEBUG_MODE:false,fpsInput:{view:{pitch:-.3}},nextInputSequence:1,pendingInputs:[]});
vm.runInContext(source.slice(start,end),context);
vm.runInContext("send('FIRE:100:200:1');send('SECONDARY_FIRE:100:200:1');send('SECONDARY_FIRE:0:0:0')",context);
assert.equal(sent[0],'INPUT:1:FIRE:100:200:1:-0.300000');assert.equal(sent[1],'INPUT:2:SECONDARY_FIRE:100:200:1:-0.300000');assert.equal(sent[2],'INPUT:3:SECONDARY_FIRE:0:0:0:-0.300000');
context.fpsInput=null;vm.runInContext("send('FIRE:100:200:1')",context);assert.equal(sent[3],'INPUT:4:FIRE:100:200:1');assert.equal(context.pendingInputs.length,4);
console.log('FPS fire protocol passed: pitch on both hands and release, legacy fallback and sequenced input envelope');

context.fpsInput={view:{pitch:1.199,recoilPitch:.006}};vm.runInContext("send('FIRE:100:200:1')",context);assert.equal(sent.at(-1),'INPUT:5:FIRE:100:200:1:1.200000','Recoil affects authoritative pitch and stays inside validated limits');
