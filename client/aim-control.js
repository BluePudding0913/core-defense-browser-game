"use strict";
window.AimControl = (() => {
    const PERIOD=2.8,PIXEL_SLOPE=Math.tan(Math.PI/18)/425,clocks=new Map();
    const weapons=['pistol','smg','rifle','revolver','lmg','shotgun','ricochet','freezeGun','sniper'];
    const supported=(weapon,definitions)=>definitions?.[weapon]?.aimControl ?? weapons.includes(weapon);
    const phase=(clock,now)=>{const age=Math.max(0,(now-clock.at)/1000);return clock.elapsed+age+clock.offset*Math.exp(-age/.2);};
    function sync(players,now) {
        const ids=new Set(players.map(p=>p.id));for(const id of clocks.keys())if(!ids.has(id))clocks.delete(id);
        for(const p of players)if(p.aimControl) {
            const s=p.aimControl,old=clocks.get(p.id),continuous=old&&s.elapsed>=old.elapsed-.2;
            const offset=continuous?Math.max(-.05,Math.min(.05,phase(old,now)-s.elapsed)):0;
            clocks.set(p.id,{elapsed:s.elapsed,at:now,offset});p.aimControlReceivedAt=now;
        }
    }
    function sample(player,now,definitions={},weapon=player?.weapon) {
        const s=player?.aimControl || {},clock=clocks.get(player?.id),age=Math.max(0,(now-(player?.aimControlReceivedAt ?? now))/1000);
        const elapsed=clock?phase(clock,now):(s.elapsed || 0)+age;
        if(!supported(weapon,definitions))return {elapsed,slope:definitions[weapon]?.spreadSlope || 0};
        const penalty=1+1.25*Math.max(s.speedRatio || 0,(s.movement || 0)*Math.exp(-age/.25))+(s.turn || 0)*Math.exp(-age/.22)+(s.airborne?.8:0);
        let slope;
        if(weapon==='sniper' && player?.sniper?.fixed)slope=window.SniperAim.sample(player,now).slope;
        else {
            slope=(definitions[weapon]?.spreadSlope ?? (weapon==='sniper'?90:100)*PIXEL_SLOPE)*(1+.35*Math.sin(elapsed/PERIOD*Math.PI*2));
            if(weapon==='sniper')slope+=Math.max(0,(player.sniper?.recovery || 0)-age)**2/.9**2*48*PIXEL_SLOPE;
        }
        return {elapsed,slope:slope*penalty,penalty};
    }
    function visible(player,view,definitions) {return supported(player?.weapon,definitions) && (!!view.zoom || player?.weapon==='sniper' && !!player.sniper?.fixed);}
    const recoil={pistol:.009,smg:.003,rifle:.015,revolver:.023,lmg:.004,shotgun:.018,ricochet:.012,freezeGun:.009,sniper:.045};
    const recoilPitch=weapon=>recoil[weapon] || 0;
    return {supported,sync,sample,visible,recoilPitch};
})();
