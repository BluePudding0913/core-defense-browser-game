'use strict';
(() => {
    const overlay=document.querySelector('#overlay'), ctx=overlay.getContext('2d'), lab=Lab3D.create(overlay);
    if (!lab) throw new Error('3Dプレビューを初期化できませんでした');
    const map={tileSize:40,rows:['#################',...Array(15).fill('#...............#'),'#################']};
    const reachable=new Set();for(let y=1;y<16;y++)for(let x=1;x<16;x++)reachable.add(y+':'+x);
    const eye={x:340,y:340},view={yaw:0,pitch:-.09};
    const me={id:'preview',...eye,hp:100,maxHp:100,gold:500000,weapon:'pistol',facingX:0,facingY:-1};
    const enemy={id:1,type:'grunt',x:340,y:268,hp:100,maxHp:100,facingX:0,facingY:1};
    const state={core:{x:460,y:140},players:[me],enemies:[enemy],slots:[],resources:[],drops:[],blackoutActive:false};
    const distance=document.querySelector('#distance'),direction=document.querySelector('#direction');
    const captions={edge:['A / 画面端の発光','近いほど赤く。中央の視界を広く残す。'],arc:['B / 方向アーク','視界外の左右・背後を通知。正面は表示なし。'],ring:['C / 警告リング','照準の周囲に接近警告。近いほど強く発光。'],off:['エフェクトなし','同じ距離・方向で比較。']};
    let mode='edge',auto=false,elapsed=0,last=null,threat=null;
    const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
    document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{
        mode=button.dataset.mode;
        document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
        document.querySelector('#name').textContent=captions[mode][0];document.querySelector('#description').textContent=captions[mode][1];
    });
    function setAuto(on){auto=on;const b=document.querySelector('#auto');b.setAttribute('aria-pressed',String(on));b.textContent=on?'接近を停止':'接近を再生';}
    document.querySelector('#auto').onclick=()=>{elapsed=Math.acos(Math.max(-1,Math.min(1,(Number(distance.value)-157.5)/122.5)))/.65;setAuto(!auto);};
    distance.oninput=()=>setAuto(false);
    document.querySelector('#light').onclick=e=>{state.blackoutActive=!state.blackoutActive;e.target.setAttribute('aria-pressed',String(state.blackoutActive));e.target.textContent=state.blackoutActive?'通常照明':'停電';};
    function draw(now){
        const dt=last===null?0:Math.min(.1,(now-last)/1000);last=now;
        if(auto){elapsed+=dt;distance.value=String(Math.round(157.5+122.5*Math.cos(elapsed*.65)));}
        const d=Number(distance.value),degrees=Number(direction.value),a=degrees*Math.PI/180;
        enemy.x=eye.x+Math.sin(a)*d;enemy.y=eye.y-Math.cos(a)*d;enemy.facingX=-Math.sin(a);enemy.facingY=Math.cos(a);
        document.querySelector('#distance-value').textContent=(d/40).toFixed(1)+' マス';
        document.querySelector('#direction-value').textContent=degrees===0?'正面':Math.abs(degrees)===180?'背後':(degrees<0?'左 ':'右 ')+Math.abs(degrees)+'°';
        threat=mode==='arc'?ProximityWarning.sample(eye,state.enemies,{yaw:view.yaw,fov:72,aspect:innerWidth/innerHeight}):ProximityEffects.sample(eye,state.enemies,view.yaw);
        document.querySelector('#threat-state').textContent=threat?'近接警告':d>ProximityWarning.range?'範囲外':'視界内';
        if(overlay.width!==innerWidth || overlay.height!==innerHeight){overlay.width=innerWidth;overlay.height=innerHeight;}
        lab.render({map,reachable,center:eye,eye,view,scale:1,state,localId:me.id,smooth:(_,p)=>p,radius:()=>18,stations:[],effects:[]});
        ctx.clearRect(0,0,overlay.width,overlay.height);
        ProximityEffects.draw(ctx,overlay.width,overlay.height,mode,threat,now,reducedMotion.matches);
        window.previewReady=true;requestAnimationFrame(draw);
    }
    window.proximityPreview={state,get mode(){return mode;},get threat(){return threat;}};
    requestAnimationFrame(draw);
})();
