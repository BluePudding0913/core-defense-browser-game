const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({window:{}});for(const f of ['sniper-aim.js','aim-control.js'])vm.runInContext(fs.readFileSync('client/'+f,'utf8'),c);const api=c.window.AimControl;
const definitions={rifle:{spreadSlope:.03,aimControl:true},sniper:{spreadSlope:.04,aimControl:true},rocket:{spreadSlope:.08,aimControl:false}};
const player={id:'p',weapon:'rifle',aimControl:{elapsed:0,movement:0,speedRatio:0,turn:0,airborne:false}};
assert(Math.abs(api.sample(player,0,definitions).slope-.03)<1e-12);player.aimControl.elapsed=.5;assert(Math.abs(api.sample(player,0,definitions).slope-.03*1.35)<1e-12);player.aimControl.elapsed=1.5;assert(Math.abs(api.sample(player,0,definitions).slope-.03*.65)<1e-12);
player.aimControl.elapsed=0;player.aimControl.movement=1;player.aimControl.speedRatio=1;assert.equal(api.sample(player,0,definitions).penalty,2.25);api.sync([player],1000);assert.equal(api.sample(player,1500,definitions).penalty,2.25,'Holding movement has no snapshot sawtooth');player.aimControl.speedRatio=0;assert(api.sample(player,1750,definitions).penalty<1.063);
player.aimControl.turn=1;player.aimControl.airborne=true;assert(api.sample(player,1000,definitions).penalty>4);
assert(api.visible(player,{zoom:true},definitions));assert(!api.visible(player,{zoom:false},definitions));player.weapon='sniper';assert(api.visible(player,{zoom:true},definitions));player.sniper={fixed:true,elapsed:1.5,cycle:0,precision:true,nextPrecision:false,recovery:0};assert(!api.visible(player,{zoom:false},definitions),"Prone hip fire keeps internal spread but hides the circle");
player.aimControl={elapsed:0,movement:0,turn:0};assert(Math.abs(api.sample(player,1000,definitions).slope-c.window.SniperAim.sample(player,1000).slope)<1e-12,'Prone retains the special sniper curve');player.weapon='rocket';assert(!api.visible(player,{zoom:true},definitions));assert.equal(api.sample(player,1000,definitions).slope,.08);
player.weapon='rifle';api.sync([player],2000);const a=api.sample(player,2100,definitions);player.aimControl.elapsed=.09;api.sync([player],2100);assert(Math.abs(api.sample(player,2100,definitions).slope-a.slope)<1e-12,'Snapshot correction is continuous');assert(api.sample(player,2200,definitions).elapsed>api.sample(player,2199,definitions).elapsed,'Clock never stalls');
console.log('Aim control passed: breathing, server penalties, movement continuity, ADS/prone/hip visibility, deferred weapons and smooth clock');
const shotgun={id:'compact-shotgun',weapon:'shotgun',aimControl:{elapsed:.5}},shotgunFields={shotgun:{spreadSlope:.21,aimControl:true}};
assert(Math.abs(api.displaySample(shotgun,0,shotgunFields).slope/api.sample(shotgun,0,shotgunFields).slope-.35)<1e-12,'Shotgun breathing cue is 35% of pellet cone');
assert.equal(api.sample(shotgun,0,shotgunFields).slope,.21*1.35,'Shotgun firing spread is unchanged');

// The displayed penalty is continuous at snapshots; authoritative sampling remains immediate.
const smooth={id:'smooth',weapon:'rifle',aimControl:{elapsed:0,movement:0,speedRatio:0,turn:0,airborne:false}};
api.sync([smooth],0);assert.equal(api.displaySample(smooth,0,definitions).penalty,1);
smooth.aimControl={elapsed:.05,movement:1,speedRatio:1,turn:1,airborne:false};api.sync([smooth],50);
const raised=api.displaySample(smooth,50,definitions).penalty;assert(raised>1&&raised<3.75);assert.equal(api.sample(smooth,50,definitions).penalty,3.75,'Display filter never weakens server-derived shot sampling');
const same=api.displaySample(smooth,50,definitions);assert.equal(same.penalty,raised,'Same frame stays continuous');
const beforeDrop=api.displaySample(smooth,100,definitions).penalty;assert(beforeDrop>raised);
smooth.aimControl={elapsed:.1,movement:0,speedRatio:0,turn:0,airborne:false};api.sync([smooth],100);
assert.equal(api.displaySample(smooth,100,definitions).penalty,beforeDrop,'A new snapshot at the same frame cannot jump the displayed radius');
assert(api.displaySample(smooth,400,definitions).penalty<1.05,'Stop recovery converges within a short bounded lag');
console.log('Smooth visual aim passed: continuous movement/turn snapshots, bounded recovery and unchanged firing time/radius');

assert.equal(api.scopeFov('sniper'),16);assert.equal(api.scopeFov('rifle'),32);assert.equal(api.scopeFov('railgun'),26);

const prone={id:'prone-turn',weapon:'sniper',sniper:{fixed:true,elapsed:1.5,cycle:0,precision:true,recovery:0},aimControl:{elapsed:0,turn:.3,movement:0,speedRatio:0,airborne:false}};
const base=c.window.SniperAim.sample(prone,1000).slope;
assert(Math.abs(api.sample(prone,1000,definitions).slope/base-1.9)<1e-9,'Small prone tracking noticeably widens displayed and fired circle');
prone.aimControl.turn=1.5;assert.equal(api.sample(prone,1000,definitions).penalty,5.5);
prone.sniper.fixed=false;assert.equal(api.sample(prone,1000,definitions).penalty,3.25,'Standing sniper retains shared sensitivity');
prone.sniper.fixed=true;prone.weapon='rifle';assert.equal(api.sample(prone,1000,definitions).penalty,3.25,'Other weapons retain shared sensitivity');
prone.weapon='sniper';api.sync([prone],1000);assert(api.sample(prone,1660,definitions).penalty<1.225,'Server turn state decays at original rate');

const jitter={id:'jitter',weapon:'rifle',aimControl:{elapsed:.1,movement:0,turn:0}};api.sync([jitter],0);api.displaySample(jitter,0,definitions);
const beforeJitter=api.displaySample(jitter,100,definitions);jitter.aimControl.elapsed=.4;api.sync([jitter],100);
assert(Math.abs(api.sample(jitter,100,definitions).slope-beforeJitter.slope)>1e-4,'Fixture creates a real clock/radius discontinuity');
assert.equal(api.displaySample(jitter,100,definitions).slope,beforeJitter.slope,'Snapshot does not jump the visible circle');
const afterJitter=api.displaySample(jitter,116,definitions);assert(Number.isFinite(afterJitter.slope));assert(afterJitter.slope>beforeJitter.slope,'Display follows the faster breathing smoothly');
const weapons=['pistol','smg','rifle','revolver','lmg','shotgun','ricochet','freezeGun','sniper'];
for(const weapon of weapons){const p={id:'period-'+weapon,weapon,aimControl:{elapsed:.5,turn:0,movement:0},sniper:{fixed:false,recovery:0}};const max=api.sample(p,0).slope;p.aimControl.elapsed=1.5;const min=api.sample(p,0).slope;assert(Math.abs(max/min-1.35/.65)<1e-9,weapon+' has 2-second breathing');}
