const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('client/jump-movement.js','utf8'),context);
const jump=context.window.JumpMovement,map={tileSize:40,legend:{'#':{solid:true},'.':{solid:false}},rows:['#######','#.....#','#.....#','#.....#','#.....#','#.....#','#######']};
let p={x:100,y:100,jumpHeight:0,jumpVelocity:0};assert(jump.start(p,[]));jump.advance(p,.2,[],map);assert(Math.abs(p.jumpHeight-26.656)<1e-10);assert(!jump.start(p,[]),'No double jump');
for(let n=0;n<40;n++)jump.advance(p,.02,[],map);assert.equal(p.jumpHeight,0);assert.equal(p.jumpVelocity,0);
const slots=[{x:100,y:100,defense:{type:'barricade'}}];p.jumpHeight=30;p.jumpVelocity=-20;
for(let n=0;n<20;n++)jump.advance(p,.02,slots,map);assert.equal(p.jumpHeight,24,'Land on block');assert(jump.start(p,slots),'Can jump off block');
p.x=180;for(let n=0;n<80;n++)jump.advance(p,.02,slots,map);assert.equal(p.jumpHeight,0,'Fall to floor after leaving block');
assert.equal(jump.ceiling(map,100,100),130);const hall={...map,rows:['#######','#.....#','#######']};assert.equal(jump.ceiling(hall,100,60),64);
p={x:100,y:60,jumpHeight:30,jumpVelocity:140};jump.advance(p,.05,[],hall);assert.equal(p.jumpHeight,32);assert.equal(p.jumpVelocity,0);
// Reconciliation corrects gameplay coordinates without a sudden camera displacement.
const source=fs.readFileSync('client/app.js','utf8'),a=source.indexOf('function reconcileLocalPrediction('),b=source.indexOf('\nfunction ',a+1);
Object.assign(context,{myPlayerId:'me',pendingInputs:[],acknowledgeInputs(){},performance:{now:()=>1000},localMove:{x:0,y:0},localFacing:{},predictedLocal:{x:120,y:100,stamina:100,down:false},sendMovement(){}});
vm.runInContext(source.slice(a,b),context);context.reconcileLocalPrediction({phase:'wave',slots:[],players:[{id:'me',x:100,y:100,stamina:100,down:false}]});
assert.equal(context.predictedLocal.x+context.predictedLocal.renderOffsetX,120,'Camera remains continuous at a server correction');assert(context.predictedLocal.x<120,'Collision state still corrects to server');
console.log('Jump prediction passed: airtime, no double jump, obstacle landing, falling, low ceiling and continuous camera correction');

for(const dt of [1/30,1/60,1/120]){
 const player={x:100,y:100,jumpHeight:0,jumpVelocity:0};let airtime=0,peak=0;
 assert(jump.start(player,[]));do{jump.advance(player,dt,[],map);airtime+=dt;peak=Math.max(peak,player.jumpHeight);}while(player.jumpHeight>0);
 assert(Math.abs(airtime-.625)<=dt+1e-8,'Shorter airtime is stable at 30/60/120 fps');
 assert(Math.abs(peak-30.625)<.1,'Jump still clears a 24-unit barricade');
}
const server=fs.readFileSync('server/src/main/java/example/JumpRules.java','utf8');
assert(server.includes('SPEED = 196, GRAVITY = 627.2'),'Server and client use the same jump trajectory');
