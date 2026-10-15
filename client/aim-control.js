"use strict";
window.AimControl = (() => {
    const TURN_WEIGHT=1.5,PRONE_TURN_WEIGHT=3,PERIOD=window.SniperAim?.period ?? 2,PIXEL_SLOPE=Math.tan(Math.PI/18)/425,clocks=new Map(),visuals=new Map();
    const weapons=['pistol','smg','rifle','revolver','lmg','shotgun','ricochet','freezeGun','sniper'];
    const supported=(weapon,definitions)=>definitions?.[weapon]?.aimControl ?? weapons.includes(weapon);
    const phase=(clock,now)=>{const age=Math.max(0,(now-clock.at)/1000);return clock.elapsed+age+clock.offset*Math.exp(-age/.2);};
    function sync(players,now) {
        const ids=new Set(players.map(p=>p.id));for(const id of clocks.keys())if(!ids.has(id)){clocks.delete(id);visuals.delete(id);}
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
        const penalty=1+1.25*Math.max(s.speedRatio || 0,(s.movement || 0)*Math.exp(-age/.25))+(weapon==='sniper' && player?.sniper?.fixed?PRONE_TURN_WEIGHT:TURN_WEIGHT)*(s.turn || 0)*Math.exp(-age/.22)+(s.airborne?.8:0);
        let slope;
        if(weapon==='sniper' && player?.sniper?.fixed)slope=window.SniperAim.sample(player,now).slope;
        else {
            slope=(definitions[weapon]?.spreadSlope ?? (weapon==='shotgun'?72.8:weapon==='sniper'?90:100)*PIXEL_SLOPE)*(1+.35*Math.sin(elapsed/PERIOD*Math.PI*2));
            if(weapon==='sniper')slope+=Math.max(0,(player.sniper?.recovery || 0)-age)**2/.9**2*48*PIXEL_SLOPE;
        }
        return {elapsed,slope:slope*penalty,penalty};
    }
    // Display-only filters remove snapshot/shot radius jumps; FIRE keeps authoritative sampling.
    function displaySample(player,now,definitions={},weapon=player?.weapon) {
        const raw=sample(player,now,definitions,weapon);
        if(!raw.penalty)return raw;
        const previous=visuals.get(player.id),reset=!previous || now<previous.at || now-previous.at>500 || raw.elapsed<previous.elapsed-.2 || previous.weapon!==weapon || previous.fixed!==!!player?.sniper?.fixed;
        const penalty=reset?raw.penalty:previous.penalty+(raw.penalty-previous.penalty)*(1-Math.exp(-(now-previous.at)/75));
        const base=raw.slope/raw.penalty;
        const baseSlope=reset?base:previous.baseSlope+(base-previous.baseSlope)*(1-Math.exp(-(now-previous.at)/35));
        visuals.set(player.id,{penalty,baseSlope,at:now,elapsed:raw.elapsed,weapon,fixed:!!player?.sniper?.fixed});
        // Shotgun uses the full authoritative cone; other weapons retain their compact cue.
        return {...raw,slope:baseSlope*penalty*(weapon==='shotgun'?1:weapon==='sniper'?.64:.8),penalty};
    }
    function visible(player,view,definitions) {return (player?.weapon==='rifle' || player?.weapon==='sniper') && supported(player.weapon,definitions) && !!view.zoom;}
    const scopeFov=weapon=>weapon==='sniper'?16:weapon==='rifle'?32:26;
    const viewFov=(weapon,view,scoped)=>{
        const base=window.coreGraphicsSettings?.getFov?.() ?? 72;
        return weapon==='sniper' && Number.isFinite(view.sniperAds)
            ? base+(scopeFov(weapon)-base)*view.sniperAds : scoped?scopeFov(weapon):view.zoom?48:base;
    };
    const recoil={pistol:.009,smg:.003,rifle:.015,revolver:.023,lmg:.004,shotgun:.018,ricochet:.012,freezeGun:.009,sniper:.045};
    const recoilPitch=weapon=>recoil[weapon] || 0;
    return {supported,sync,sample,displaySample,visible,scopeFov,viewFov,recoilPitch};
})();
