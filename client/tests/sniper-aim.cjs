const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),T=require('../vendor/three.min.js');
const c={window:{}};vm.runInNewContext(fs.readFileSync('client/sniper-aim.js','utf8'),c);const api=c.window.SniperAim;
let serial=0;
function at(elapsed,precision=false,nextPrecision=false){return {id:'sample-'+serial++,sniperReceivedAt:1000,sniper:{fixed:true,elapsed,cycle:Math.floor(elapsed/2.8),precision,nextPrecision,recovery:0}};}
const p=at(2.1,true);
assert(Math.abs(api.sample(at(.7,true,false),1000).radius-69.6*api.stability(.7))<1e-8,'Expansion immediately before special contraction grows by 20%');
assert(Math.abs(api.sample(p,1000).radius-3.5*api.stability(2.1))<1e-8);
assert(Math.abs(api.sample(at(2.1),1000).radius-16*api.stability(2.1))<1e-8);
assert.equal(api.stability(90),.675);assert(Math.abs(api.stability(180)-.35)<1e-8);
for(const t of [1.4,2.8,4.2]){const p=at(t,true);const speed=(api.sample(p,1000.1).radius-api.sample(p,999.9).radius)/.0002;assert(Math.abs(speed)>20,'No pause in the middle');}
const moving=at(1);api.sync([moving],1000);assert(api.sample(moving,1400).elapsed>api.sample(moving,1300).elapsed,'No freeze after 200ms between snapshots');
const before=api.sample(moving,1400);const next={...moving,sniper:{...moving.sniper,elapsed:1.38}};api.sync([next],1400);
assert(Math.abs(api.sample(next,1400).elapsed-before.elapsed)<1e-8,'Snapshot time correction is continuous');assert(Math.abs(api.sample(next,1400).radius-before.radius)<1e-8);
assert(api.sample(next,1500).elapsed>before.elapsed);
assert(api.sample(next,10000).elapsed<5.6,'Never guess an unknown breathing cycle');
api.shot(p.id,1000);assert(api.sample(p,1000).radius>50,'Shot opens ring immediately');
const clean={...p,id:'clean'};assert.equal(api.sample(p,1900).radius,api.sample(clean,1900).radius,'Recovery ends without freezing the breathing clock');
let drawnRadius;const ctx={save(){},restore(){},beginPath(){},arc(x,y,r){drawnRadius=r;},stroke(){},fill(){this.filled=(this.filled || 0)+1;}};
const sample={slope:58*Math.tan(Math.PI/18)/425};api.draw(ctx,0,0,850,20,sample);assert(Math.abs(drawnRadius-58)<1e-8);assert.equal(ctx.strokeStyle,'rgba(190,224,246,.55)');assert.equal(ctx.fillStyle,'rgba(190,224,246,.07)');assert.equal(ctx.filled,1,'Breathing disk has a faint translucent fill');const fills=ctx.filled;api.draw(ctx,0,0,850,20,sample,'#438fff',null);assert.equal(ctx.filled,fills,'Debug cone remains an unfilled blue ring');
api.draw(ctx,0,0,1700,20,sample);assert(Math.abs(drawnRadius-116)<1e-8,'Circle scales with screen height');
api.draw(ctx,0,0,850,72,sample);assert(drawnRadius<58,'Unscoped disk uses the same angular cone');
for(const file of ['soldier-model.js','sniper-stance.js'])vm.runInNewContext(fs.readFileSync('client/'+file,'utf8'),c);
const model=c.window.buildSoldier(T);model.setWeapon('sniper');c.window.applySniperStance(T,model);model.root.updateMatrixWorld(true);
const bounds=new T.Box3().setFromObject(model.root);assert(bounds.min.y>-.025);assert(bounds.max.y<.7,'Prone model stays low');
for(const [side,sign]of [['L',1],['R',-1]]){const leg=model.root.getObjectByName('LowerLeg_'+side);assert(leg.localToWorld(new T.Vector3(0,-.38,.04)).x*sign>.2,'Feet spread gently outward');}
model.root.scale.setScalar(16);model.root.rotation.y=.7;c.window.applySniperStance(T,model,.2);model.root.updateMatrixWorld(true);
const rifle=model.root.getObjectByName('Rifle'),q=rifle.getWorldQuaternion(new T.Quaternion()),direction=new T.Vector3(0,0,1).applyQuaternion(q);
assert(Math.abs(Math.asin(direction.y)-.2)<1e-8,'Prone rifle follows look pitch independently of model scale and facing');
const source=fs.readFileSync('client/app.js','utf8'),start=source.indexOf('function send(message)'),end=source.indexOf('\nfunction ',start+1),sent=[];
const fire=vm.createContext({window:{SniperAim:api},getMe:()=>p,performance:{now:()=>1000},socket:{readyState:1,send:s=>sent.push(s)},WebSocket:{OPEN:1},DEBUG_MODE:false,fpsInput:{view:{pitch:.1}},nextInputSequence:1,pendingInputs:[]});
vm.runInContext(source.slice(start,end),fire);vm.runInContext("send('FIRE:100:200:1')",fire);assert(sent[0].endsWith(':0.100000:2.100000'),'Fire sends bounded phase time, not a success boolean');
console.log('Sniper client passed: subtle cue, random-cycle interpolation, angular projection, shot recovery, prone anatomy and timestamp protocol');

vm.runInNewContext(fs.readFileSync('client/previews/sniper-breathing.js','utf8'),c);
const preview=c.window.createBreathingPreview(()=>.1);assert(Math.abs(preview.sample(700).radius-69.6)<1e-8);assert(Math.abs(preview.sample(1401).radius-preview.sample(1399).radius)>.08,'Preview also passes the middle without pausing');

const view={zoom:false};api.updateScope(view,'sniper',0);view.zoom=true;
assert.equal(api.updateScope(view,'sniper',0),0);
assert(Math.abs(api.updateScope(view,'sniper',110)-.5)<1e-8,'Halfway eye-to-scope motion');
assert.equal(api.updateScope(view,'sniper',220),1);
view.zoom=false;assert(Math.abs(api.updateScope(view,'sniper',300)-.5)<1e-8);
view.zoom=true;assert.equal(api.updateScope(view,'sniper',410),1,'Reversal starts from current position');
assert.equal(api.updateScope(view,'sniper',420,false),0,'Menus reset scope motion');
assert.equal(api.updateScope(view,'pistol',430),0,'Switching weapons clears the animation');

assert(Math.abs(api.sample(at(.7,false,true),1000).radius-58*api.stability(.7))<1e-8,'No warning one cycle early');
const future=at(2.7,false,true);assert(Math.abs(api.sample(future,1800).radius-69.6*api.stability(3.5))<1e-8,'Known next cycle predicts its own warning');
const past=at(.7,false,true);past.sniper.cycle=1;past.sniper.previousPrecision=true;
assert(Math.abs(api.sample(past,1000).radius-69.6*api.stability(.7))<1e-8,'Previous-cycle samples use that cycle special state');
const rolls=[.9,.1,.9,.9],timeline=c.window.createBreathingPreview(()=>rolls.shift() ?? .9);
assert.equal(timeline.sample(700).warning,false);assert(Math.abs(timeline.sample(700).radius-58)<1e-8);
assert.equal(timeline.sample(3500).warning,true);assert(Math.abs(timeline.sample(3500).radius-69.6)<1e-8);
assert(Math.abs(timeline.sample(4900).radius-3.5)<1e-8,'Warning is followed directly by special minimum 1.4s later');
assert.equal(timeline.sample(6300).warning,false);assert(Math.abs(timeline.sample(6300).radius-58)<1e-8);
