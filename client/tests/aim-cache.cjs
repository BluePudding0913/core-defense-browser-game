const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const THREE=require('../vendor/three.min.js');
const source=fs.readFileSync('client/lab3d.js','utf8');
// Frozen pre-cache algorithm: compare real geometry intersections, not mocked coordinates.
const originalAim=`function aimPoint() {
    if (!latestFrame) return null;
    raycaster.setFromCamera(new T.Vector2(0,0), camera);
    const origin=raycaster.ray.origin, direction=raycaster.ray.direction;
    let distance=2400, result=null;
    const hits=raycaster.intersectObjects([...objects.values()].filter(o=>o.root.visible && o.root.isGroup && !o.root.userData.presentationOnly).map(o=>o.root),true);
    const wallHits=raycaster.intersectObject(terrain,true);
    for (const hit of [...hits,...wallHits].sort((a,b)=>a.distance-b.distance)) {
        if (hit.distance<2 || hit.distance>distance) continue;
        let root=hit.object; while(root.parent && root.parent!==scene) root=root.parent;
        if (root.name?.startsWith('player:'+latestFrame.localId)) continue;
        result={x:hit.point.x,y:hit.point.z};distance=hit.distance;break;
    }
    if (result) return result;
    const horizontal=Math.hypot(direction.x,direction.z)||1;
    return {x:origin.x+direction.x/horizontal*2400,y:origin.z+direction.z/horizontal*2400};
}`;
function engine(legacy=false) {
    const counts={objects:0,terrain:0};let tracking=false,now=1000;
    const T={...THREE,WebGLRenderer:class {
        constructor(){this.domElement={width:0,height:0,addEventListener(){}};this.shadowMap={};}
        setSize(w,h){this.domElement.width=w;this.domElement.height=h;}
        clearDepth(){}
        render(scene,camera){scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);}
    },Raycaster:class extends THREE.Raycaster {
        intersectObjects(...args){if(tracking)counts.objects++;return super.intersectObjects(...args);}
        intersectObject(...args){if(tracking)counts.terrain++;return super.intersectObject(...args);}
    }};
    const context=vm.createContext({window:{THREE:T},document:{body:{classList:{add(){}}}},performance:{now:()=>now},console});
    for(const file of ['aim-control.js','soldier-model.js','sniper-stance.js','organic-enemy-models.js','lab-enemy-models.js','wall-impacts.js','block-terrain.js','map-object-models.js','hit-presentation.js'])vm.runInContext(fs.readFileSync('client/'+file,'utf8'),context);
    const a=source.indexOf('function aimPoint()'),b=source.indexOf('function fpsMuzzleWorld()',a);
    vm.runInContext(legacy?source.slice(0,a)+originalAim+'\n'+source.slice(b):source,context);
    const overlay={width:900,height:500,before(){}},renderer=context.window.Lab3D.create(overlay);
    return {renderer,overlay,counts,render(frame){now+=16;renderer.render(frame);},aim(){tracking=true;try{return renderer.aimPoint();}finally{tracking=false;}}};
}
function frame() {
    const me={id:'me',x:100,y:140,facingX:0,facingY:-1,weapon:'pistol'};
    return {map:{tileSize:40,rows:['#######','#.....#','#.....#','#.....#','#.....#','#.....#','#######']},
        reachable:new Set(Array.from({length:25},(_,i)=>(1+Math.floor(i/5))+':'+(1+i%5))),
        center:{x:100,y:140},eye:me,scale:1,localId:'me',predicted:me,
        smooth:(_,p)=>p,radius:()=>24,stations:[],view:{yaw:0,pitch:0},effects:[],
        state:{core:{x:180,y:180},players:[me],enemies:[{id:1,type:'grunt',x:100,y:75,hp:100,facingX:0,facingY:1}],slots:[],resources:[],drops:[]}};
}
const cached=engine(),legacy=engine(true);
assert.equal(cached.aim(),null,'Before first render no aim exists');
const equivalent=(label)=>{
    const a=cached.aim(),b=legacy.aim();
    assert(Number.isFinite(a.x)&&Number.isFinite(a.y),label);
    assert(Math.hypot(a.x-b.x,a.y-b.y)<1e-7,label+': cached aim matches pre-change geometry');
    return a;
};
const first=frame(),oldFirst=frame();cached.render(first);legacy.render(oldFirst);
const initial=equivalent('Enemy in front');
for(let i=0;i<20;i++)equivalent('Repeated reads on same render');
assert.equal(cached.counts.objects,1);assert.equal(cached.counts.terrain,1);
assert.equal(legacy.counts.objects,21);assert.equal(legacy.counts.terrain,21);
const modified=cached.aim();modified.x=NaN;modified.y=Infinity;
assert.deepEqual(JSON.parse(JSON.stringify(cached.aim())),JSON.parse(JSON.stringify(initial)),'Callers cannot corrupt shared coordinates');
cached.renderer.project(100,75,30);legacy.renderer.project(100,75,30);
equivalent('Label occlusion uses the shared raycaster between aim reads');
assert.equal(cached.counts.objects,1,'Label visibility queries do not invalidate or corrupt cached aim');
first.state.enemies[0].x=180;oldFirst.state.enemies[0].x=180;
cached.render(first);legacy.render(oldFirst);
const moved=equivalent('Enemy moves with stationary camera');
assert(Math.hypot(moved.x-initial.x,moved.y-initial.y)>1,'New render cannot reuse previous target');
assert.equal(cached.counts.objects,2);
const scenarios=[
    ['enemy removed',f=>f.state.enemies=[]],
    ['enemy death fade',f=>{f.state.enemies=[];f.effects=[{effect:'hit',weapon:'pistol',playerId:'me',enemyId:1,damage:100,killed:true,headshot:true,x:100,y:75,started:1000}];}],
    ['new enemy',f=>f.state.enemies=[{id:2,type:'shield',x:100,y:90,hp:100}]],
    ['yaw',f=>f.view.yaw=.7],['pitch',f=>f.view.pitch=.4],
    ['prone sniper',f=>{f.state.players[0].weapon='sniper';f.state.players[0].sniper={fixed:true,elapsed:1};f.scoped=true;f.view.zoom=true;f.view.sniperAds=1;}],
    ['standing rifle ADS',f=>{f.state.players[0].weapon='rifle';f.scoped=true;f.view.zoom=true;}],
    ['weapon switch',f=>f.state.players[0].weapon='shotgun'],
    ['jump',f=>f.eye.jumpHeight=20],['down',f=>f.state.players[0].down=true],
    ['teleport',f=>{f.eye.x=180;f.eye.y=180;}],
    ['drone view',f=>{f.state.players[0].drone={active:true,controlled:true,x:160,y:160,hp:100};f.eye={x:160,y:160};}],
    ['missile UI',f=>f.state.players[0].missileControl=true],
    ['blackout',f=>f.state.blackoutActive=true],
    ['placed wall',f=>f.state.slots=[{id:'wall',x:100,y:110,defense:{type:'barricade'}}]],
    ['resource',f=>f.state.resources=[{id:'ore',type:'ore',x:100,y:110,available:true}]],
    ['ally',f=>f.state.players.push({id:'ally',x:100,y:110,weapon:'pistol',facingY:1})],
    ['local player changed',f=>{f.localId='ally';f.state.players.push({id:'ally',x:120,y:150,weapon:'pistol'});}],
    ['different map',f=>{f.map={...f.map,rows:['#######','#..#..#','#..#..#','#.....#','#.....#','#.....#','#######']};}],
    ['empty scene',f=>{f.state=null;f.map={tileSize:40,rows:['.......']};f.reachable=new Set();}],
];
for(const [label,change] of scenarios) {
    const a=frame(),b=frame();change(a);change(b);
    cached.render(a);legacy.render(b);const before=cached.counts.objects;
    for(let i=0;i<5;i++)equivalent(label);
    assert.equal(cached.counts.objects,before+1,label+': one query per new render');
}
// Deterministic camera/target sweep catches stale results without relying on one fixture.
for(let i=0;i<60;i++) {
    const a=frame(),b=frame();
    for(const f of [a,b]){f.view.yaw=(i*.271)%6.28;f.view.pitch=Math.sin(i*.39)*1.2;f.eye.x=60+(i%5)*30;f.eye.y=60+(i%4)*40;f.state.enemies[0].x=60+(i%6)*25;}
    cached.render(a);legacy.render(b);equivalent('Sweep '+i);equivalent('Sweep repeat '+i);
}
cached.overlay.width=1200;cached.overlay.height=600;legacy.overlay.width=1200;legacy.overlay.height=600;
cached.render(frame());legacy.render(frame());equivalent('Resize');
console.log('Aim cache passed: original algorithm parity across targets, walls, camera, weapons, UI, death, map, empty scene and resize; 21 repeated queries reduced to 1');

// Exercise the real app firing functions against the cached renderer.
const app=fs.readFileSync('client/app.js','utf8'),sent=[];let time=2000;
const f=frame();cached.render(f);const queries=cached.counts.objects;
const game=vm.createContext({getMe:()=>f.state.players[0],fpsInput:{},labRenderer:{aimPoint:()=>cached.aim()},
    performance:{now:()=>time},firingPointer:null,aimPointer:null,
    send:message=>sent.push(message),window:{coreAudio:{stopRailgun(){}}},myPlayerId:'me'});
for(const name of ['worldFromScreen','startFiring','updateFiringAim','stopFiring','fireOnce']) {
    const a=app.indexOf('function '+name+'('),b=app.indexOf('\nfunction ',a+1);
    vm.runInContext(app.slice(a,b),game);
}
game.startFiring('mouse',400,300);const fire=sent.at(-1);
const right=game.worldFromScreen(400,300);game.send(`SECONDARY_FIRE:${right.x.toFixed(1)}:${right.y.toFixed(1)}:1`);
assert.equal(sent.at(-1),fire.replace('FIRE:','SECONDARY_FIRE:'),'Both hands use identical coordinates on the same render');
sent.pop();
game.updateFiringAim(410,300);assert.equal(sent.length,1,'Held fire retains its send throttle');
time+=70;game.updateFiringAim(410,300);assert.equal(sent.at(-1),fire);
game.stopFiring(410,300);assert.equal(sent.at(-1),fire.slice(0,-1)+'0');
game.fireOnce(410,300);assert.equal(sent.at(-2),fire);assert.equal(sent.at(-1),fire.slice(0,-1)+'0');
assert.equal(cached.counts.objects,queries+1,'Start, held updates, release and tap share the same rendered aim');
f.view.yaw=1;cached.render(f);game.startFiring('mouse',400,300);
assert.notEqual(sent.at(-1),fire,'New rendered view sends a fresh target');
assert.equal(cached.counts.objects,queries+2);
const beforeBlocked=sent.length;f.state.players[0].selectedBuild='turret';game.updateFiringAim(400,300);
assert.equal(game.firingPointer,null);assert.equal(sent.length,beforeBlocked,'Selecting a build still cancels held fire');
console.log('Aim cache firing integration passed: start, held-fire throttle, release, tap, new camera and build cancellation');

if(process.argv.includes('--benchmark')) {
    const a=frame(),b=frame();
    for(const f of [a,b])f.state.enemies=Array.from({length:60},(_,i)=>({id:i+1,type:'grunt',x:60+(i%10)*12,y:50+Math.floor(i/10)*18,hp:100,facingY:1}));
    cached.render(a);legacy.render(b);equivalent('Benchmark scene');
    const {performance}=require('node:perf_hooks');
    function measure(engine){const start=performance.now();for(let i=0;i<300;i++)engine.aim();return performance.now()-start;}
    const oldMs=measure(legacy),newMs=measure(cached);
    console.log(JSON.stringify({queries:300,enemies:60,uncachedMs:+oldMs.toFixed(2),cachedMs:+newMs.toFixed(2),note:'Repeated reads of one rendered scene; excludes rendering, first query and server work.'}));
}
