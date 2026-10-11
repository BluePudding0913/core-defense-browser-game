"use strict";
window.SniperAim = (() => {
    const PERIOD=2.8,RECOVERY=.9,PIXEL_SLOPE=Math.tan(Math.PI/18)/425;
    const shots=new Map();
    function shot(id,now){shots.set(id,now);}
    function sync(players,now) { for(const p of players) if(p.sniper)p.sniperReceivedAt=now; }
    function sample(player,now) {
        const s=player?.sniper || {},age=Math.max(0,Math.min(.2,(now-(player?.sniperReceivedAt ?? now))/1000));
        const elapsed=(s.elapsed || 0)+(s.fixed?age:0),recovery=Math.max(0,(s.recovery || 0)-age,RECOVERY-(now-(shots.get(player?.id) ?? -Infinity))/1000);
        let radius=90;
        if(s.fixed) {
            const cycle=Math.floor(elapsed/PERIOD),wave=Math.sin(elapsed%PERIOD/PERIOD*Math.PI*2);
            const special=cycle>(s.cycle || 0)?s.nextPrecision:s.precision;
            const warning=cycle===(s.cycle || 0) && s.nextPrecision;
            radius=38+(wave>=0?58*(warning?1.03:1)-38:38-(special?3.5:16))*wave*Math.abs(wave);
            radius+=70*Math.max(0,1-elapsed/.7);
        }
        radius+=48*(recovery/RECOVERY)**2;
        return {elapsed,radius,slope:radius*PIXEL_SLOPE,fixed:!!s.fixed};
    }
    function draw(ctx,x,y,height,fov,sample) {
        const r=sample.slope*height/(2*Math.tan(fov*Math.PI/360));
        ctx.save();ctx.strokeStyle='#e1e8e5';ctx.lineWidth=1.4;ctx.shadowColor='#0b1418';ctx.shadowBlur=2;
        ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.restore();return r;
    }
    return {sample,sync,draw,shot};
})();
