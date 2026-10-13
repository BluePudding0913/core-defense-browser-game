"use strict";
window.MiniMap = (() => {
    const rangeTiles=9;
    function sample({map,player,state,spawns=[],breakers=[]}) {
        const range=rangeTiles*map.tileSize;
        const nearby=p=>Math.hypot(p.x-player.x,p.y-player.y)<=range;
        const unlocked=p=>!p.requiredArea || state.areas?.[p.requiredArea];
        const activeSpawns=new Set(state.phase==='wave'?state.activeSpawns || []:[]);
        const trippedBreakers=new Set(state.blackoutActive?state.trippedBreakers || []:[]);
        return {range,enemies:(state.enemies || []).filter(p=>p.hp>0 && nearby(p)),
            spawns:spawns.filter(p=>activeSpawns.has(p.id) && nearby(p) && (!p.id.startsWith('area-') || state.areas?.[p.id.slice(5).split(':')[0]])),
            breakers:breakers.filter(p=>unlocked(p) && trippedBreakers.has(p.id))};
    }
    function draw(ctx,frame) {
        const {map,reachable,player,state,yaw=0,width,height}=frame;
        if(!player || !map.tileSize)return;
        const data=sample(frame),size=Math.min(172,Math.max(112,height*.29),width*.25),r=size/2,cx=18+r,cy=68+r,k=(r-8)/data.range;
        const pos=p=>({x:cx+(p.x-player.x)*k,y:cy+(p.y-player.y)*k});
        ctx.save();ctx.shadowBlur=0;ctx.textAlign='center';ctx.font='bold 10px system-ui';
        ctx.fillStyle='rgba(7,16,22,.86)';ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
        ctx.save();ctx.beginPath();ctx.arc(cx,cy,r-5,0,Math.PI*2);ctx.clip();
        const tile=map.tileSize;
        for(let row=Math.floor(player.y/tile)-10;row<=Math.floor(player.y/tile)+10;row++)for(let column=Math.floor(player.x/tile)-10;column<=Math.floor(player.x/tile)+10;column++) {
            const symbol=map.rows[row]?.[column],p=pos({x:column*tile,y:row*tile});
            if(!symbol)continue;
            ctx.fillStyle=reachable.has(row+':'+column)?'#2d3d43':'#111e26';
            if(map.legend?.[symbol]?.solid)ctx.fillStyle='#43545c';
            ctx.fillRect(p.x,p.y,tile*k+.3,tile*k+.3);
        }
        for(const slot of state.slots || [])if(slot.defense && ['block','barricade','copperBarricade','silverBarricade'].includes(slot.defense.type)) {
            const p=pos(slot);ctx.fillStyle='#847d70';ctx.fillRect(p.x-1.5,p.y-1.5,3,3);
        }
        for(const spawn of data.spawns) {
            const p=pos(spawn);ctx.strokeStyle='#c18c66';ctx.lineWidth=1.5;
            ctx.beginPath();ctx.moveTo(p.x-3,p.y-2);ctx.lineTo(p.x,p.y+2);ctx.lineTo(p.x+3,p.y-2);ctx.stroke();
        }
        ctx.fillStyle='#ff6973';
        for(const enemy of data.enemies){const p=pos(enemy);ctx.beginPath();ctx.arc(p.x,p.y,1.8,0,Math.PI*2);ctx.fill();}
        for(const breaker of data.breakers) {
            const p=pos(breaker);
            const dx=p.x-cx,dy=p.y-cy,d=Math.hypot(dx,dy),f=Math.min(1,(r-14)/Math.max(1,d)),x=cx+dx*f,y=cy+dy*f;
            ctx.fillStyle='#ffd280';ctx.font='bold 12px system-ui';ctx.fillText('!',x,y+4);
            if(d>r-14){ctx.strokeStyle='#ffd280';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx/d*5,y+dy/d*5);ctx.stroke();}
        }
        ctx.restore();
        ctx.save();ctx.translate(cx,cy);ctx.rotate(yaw);ctx.fillStyle='#e9f9ff';ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(-4,4);ctx.lineTo(0,2);ctx.lineTo(4,4);ctx.closePath();ctx.fill();ctx.restore();
        ctx.strokeStyle='#536c78';ctx.lineWidth=1;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
        ctx.fillStyle='#e9f9ff';ctx.font='bold 10px system-ui';ctx.fillText('N',cx,cy-r+12);
        ctx.restore();
    }
    return {sample,draw,rangeTiles};
})();
