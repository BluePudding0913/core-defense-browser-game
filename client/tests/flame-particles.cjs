const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const FlameParticles=require('../flame-particles.js');
const squares=[],stack=[];
const ctx={globalAlpha:1,save(){stack.push(this.globalAlpha)},restore(){this.globalAlpha=stack.pop()},
    fillRect(x,y,w,h){squares.push({x,y,w,h,color:this.fillStyle,alpha:this.globalAlpha})}};
const effect={effect:'hit',weapon:'flamethrower',damage:0,fromX:0,fromY:0,x:220,y:0,started:0};
FlameParticles.draw(ctx,effect,180,Math.PI/7);
assert.equal(squares.length,8); assert(squares.every(p=>p.w===p.h));
assert(squares.some(p=>p.color==='#ff4e3a')&&squares.some(p=>p.color==='#ff9c38'));
assert(Math.min(...squares.map(p=>p.y))<-30 && Math.max(...squares.map(p=>p.y))>30);
const first=JSON.stringify(squares);squares.length=0;
FlameParticles.draw(ctx,effect,180,Math.PI/7);assert.equal(JSON.stringify(squares),first,'particles do not flicker between frames');
squares.length=0;FlameParticles.draw(ctx,effect,360,Math.PI/7);assert.equal(squares.length,0);
FlameParticles.draw(ctx,effect,180,Math.PI/7,()=>false);assert.equal(squares.length,0,'walls stop particles');
const source=fs.readFileSync('client/app.js','utf8'),start=source.indexOf('function drawHitEffects(');
const context=vm.createContext({FlameParticles,ctx,performance:{now:()=>180},myPlayerId:'me',
    state:{rules:{flameHalfAngle:Math.PI/7}},hasInteractionPath:()=>true,canPredictOccupy:()=>true,
    hitEffects:[effect,{...effect,damage:60,enemyId:1},{...effect,enemyId:2}]});
vm.runInContext(source.slice(start,source.indexOf('\nfunction ',start+1)),context);
context.drawHitEffects();assert.equal(squares.length,8,'target hit events never duplicate a flame burst');
assert.equal(ctx.globalAlpha,1);
console.log('Flame particles passed: square orange/red fan, stable motion, expiry, walls and single burst');

// Continuous fire from four shooters shares one frame budget, including rejected wall samples.
squares.length=0;
let checks=0;
const budget=FlameParticles.createBudget();
for(let burst=0;burst<20;burst++) for(let player=0;player<4;player++)
    FlameParticles.draw(ctx,{...effect,playerId:String(player)},180,Math.PI/7,()=>{checks++;return true},budget);
assert.equal(squares.length,48);assert.equal(checks,48);
assert.deepEqual([...budget.emitters.values()],[0,0,0,0]);
squares.length=0;checks=0;
const blocked=FlameParticles.createBudget();
for(let burst=0;burst<100;burst++) FlameParticles.draw(ctx,{...effect,playerId:String(burst%4)},180,Math.PI/7,()=>{checks++;return false},blocked);
assert.equal(squares.length,0);assert.equal(checks,48,'wall checks share the particle cap');
const frameEffects=Array.from({length:80},(_,i)=>({...effect,playerId:String(i%4)}));
context.hitEffects=frameEffects;context.drawHitEffects();assert.equal(squares.length,48,'app shares budget across every flame burst');
squares.length=0;context.drawHitEffects();assert.equal(squares.length,48,'next frame restores the budget');
context.hitEffects=[effect];squares.length=0;context.drawHitEffects();assert.equal(squares.length,8,'light scenes retain particles after a busy frame');
console.log('Flame limits passed: 8 per burst, 12 per shooter, 48 per frame, bounded wall checks and frame reset');
