"use strict";
window.SniperAim = (() => {
    const PERIOD=2.8,RECOVERY=.9,PIXEL_SLOPE=Math.tan(Math.PI/18)/425;
    const shots=new Map(),clocks=new Map();
    const stability=time=>1-.65*Math.min(1,Math.max(0,time)/180);
    function phase(clock,now){const age=Math.max(0,(now-clock.at)/1000);return clock.elapsed+age+clock.offset*Math.exp(-age/.2); }
    function shot(id,now){shots.set(id,now);}
    function sync(players,now) {
        const ids=new Set(players.map(p=>p.id));
        for(const id of clocks.keys())if(!ids.has(id)){clocks.delete(id);shots.delete(id);}
        for(const p of players)if(p.sniper){
            const old=clocks.get(p.id),s=p.sniper;
            const continuous=s.fixed && old?.fixed && s.elapsed>=old.elapsed-.2;
            const offset=continuous?Math.max(-.05,Math.min(.05,phase(old,now)-s.elapsed)):0;
            clocks.set(p.id,{elapsed:s.elapsed || 0,offset,at:now,fixed:s.fixed});p.sniperReceivedAt=now;
        }
    }
    function sample(player,now) {
        const s=player?.sniper || {},age=Math.max(0,(now-(player?.sniperReceivedAt ?? now))/1000);
        const clock=clocks.get(player?.id);
        const elapsed=s.fixed?Math.min(((s.cycle || 0)+2)*PERIOD-1e-6,clock?phase(clock,now):(s.elapsed || 0)+age):(s.elapsed || 0),recovery=Math.max(0,(s.recovery || 0)-age,RECOVERY-(now-(shots.get(player?.id) ?? -Infinity))/1000);
        let radius=90;
        if(s.fixed) {
            const cycle=Math.floor(elapsed/PERIOD),wave=Math.sin(elapsed%PERIOD/PERIOD*Math.PI*2);
            const special=cycle<(s.cycle || 0)?s.previousPrecision:cycle>(s.cycle || 0)?s.nextPrecision:s.precision;
            const warning=cycle<(s.cycle || 0)?s.precision:cycle===(s.cycle || 0) && s.nextPrecision;
            radius=(38+21*wave-wave*wave-(special && wave<0?12.5*wave*wave:0)+(warning && wave>0?3.48*wave*wave:0))*stability(elapsed);
            radius+=70*Math.max(0,1-elapsed/.7)**2;
        }
        radius+=48*(recovery/RECOVERY)**2;
        return {elapsed,radius,slope:radius*PIXEL_SLOPE,fixed:!!s.fixed};
    }
    function draw(ctx,x,y,height,fov,sample,color='#e1e8e5') {
        const r=sample.slope*height/(2*Math.tan(fov*Math.PI/360));
        ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1.4;ctx.shadowColor='#0b1418';ctx.shadowBlur=2;
        ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.restore();return r;
    }
    return {sample,sync,draw,shot,stability};
})();
