const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync('client/app.js','utf8');
const me={walkSpeed:125,dashSpeed:205,staminaMax:100},context=vm.createContext({getMe:()=>me,gameplayUiOpen:()=>false,window:{},state:{phase:'wave'},predictedLocal:null,localMove:{x:1,y:0},dashRequested:false,WORLD:{width:2080,height:2080},clamp:(x,min,max)=>Math.max(min,Math.min(max,x)),canPredictOccupy:()=>true});
const start=source.indexOf('function updateLocalPrediction(');vm.runInContext(source.slice(start,source.indexOf('\nfunction ',start+1)),context);
for(const [patch,dash,expected] of [[{},false,12.5],[{},true,20.5],[{railgunCharge:1},true,7.5],[{railgunRemaining:1},true,3.75],[{down:true,downSpeed:45},true,4.5],[{movingCore:true},true,8.2]]){
 Object.keys(me).forEach(k=>delete me[k]);Object.assign(me,{walkSpeed:125,dashSpeed:205,staminaMax:100},patch);
 context.predictedLocal={x:100,y:100,stamina:100};context.dashRequested=dash;context.updateLocalPrediction(.1);
 assert(Math.abs(context.predictedLocal.x-100-expected)<1e-8,'Prediction follows the authoritative speed for '+JSON.stringify(patch));
}
console.log('Movement prediction passed: walk, sprint, railgun, down and core carry');

Object.assign(me,{sniper:{fixed:true},down:false,movingCore:false});context.predictedLocal={x:100,y:100,stamina:100};context.updateLocalPrediction(.1);assert.equal(context.predictedLocal.x,100);
const sent=[],movement=vm.createContext({getMe:()=>me,gameplayUiOpen:()=>false,keys:new Set(['w']),joystick:null,predictedLocal:null,localMove:{x:0,y:0},localFacing:null,lastMove:'',quantizeFacing:()=>0,send:s=>sent.push(s)});
const moveStart=source.indexOf('function sendMovement(');vm.runInContext(source.slice(moveStart,source.indexOf('\nfunction ',moveStart+1)),movement);
movement.sendMovement();assert.equal(sent.pop(),'MOVE:0.00:0.00');me.sniper.fixed=false;movement.sendMovement();assert.equal(sent.pop(),'MOVE:0.00:-1.00','Held movement resumes when prone is released');
