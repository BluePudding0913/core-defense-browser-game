const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const FlameParticles=require('../flame-particles.js');
const squares=[],stack=[];
const ctx={globalAlpha:1,save(){stack.push(this.globalAlpha)},restore(){this.globalAlpha=stack.pop()},
    fillRect(x,y,w,h){squares.push({x,y,w,h,color:this.fillStyle,alpha:this.globalAlpha})}};
const effect={effect:'hit',weapon:'flamethrower',damage:0,fromX:0,fromY:0,x:220,y:0,started:0};
FlameParticles.draw(ctx,effect,180,Math.PI/7);
assert.equal(squares.length,16); assert(squares.every(p=>p.w===p.h));
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
context.drawHitEffects();assert.equal(squares.length,16,'target hit events never duplicate a flame burst');
assert.equal(ctx.globalAlpha,1);
console.log('Flame particles passed: square orange/red fan, stable motion, expiry, walls and single burst');
