const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('client/app.js','utf8');
const extract=name=>{const start=source.indexOf(`function ${name}(`);return source.slice(start,source.indexOf('\nfunction ',start+1));};
let now=1000; const commands=[];
const me={id:'me',x:100,y:100,stamina:100,down:true};
const context=vm.createContext({state:{phase:'wave',players:[me]},myPlayerId:'me',getMe:()=>me,
    predictedLocal:{x:120,y:100,stamina:100,down:true},localMove:{x:1,y:0},localFacing:{x:1,y:0},
    pendingInputs:[],acknowledgeInputs(){},keys:new Set(['d']),joystick:null,lastMove:'MOVE:1.00:0.00',
    performance:{now:()=>now},send:message=>commands.push(message),dashRequested:false,
    WORLD:{width:4000,height:4000},canPredictOccupy:()=>true,clamp:(v,min,max)=>Math.max(min,Math.min(max,v)),
    quantizeFacing:(x,y)=>({x,y})});
for(const name of ['reconcileLocalPrediction','sendMovement','updateLocalPrediction']) vm.runInContext(extract(name),context);
me.down=false;context.reconcileLocalPrediction(context.state);
assert.equal(context.predictedLocal.x,100);assert.equal(commands.at(-1),'MOVE:0.00:0.00');
context.updateLocalPrediction(.05);assert.equal(context.predictedLocal.x,100);
now=1119;context.sendMovement();assert.equal(context.localMove.x,0);
now=1120;context.updateLocalPrediction(.02);
assert.equal(commands.at(-1),'MOVE:1.00:0.00');assert.equal(context.predictedLocal.x,103.1);
context.sendMovement();assert.equal(commands.length,2,'movement resumes once even with the key held');
console.log('Revive movement passed: authoritative reset, brief pause and automatic held-key resume');
