"use strict";
window.JumpMovement = (() => {
    const blocks = slot => slot.defense && ['block','barricade','copperBarricade','silverBarricade'].includes(slot.defense.type);
    const overlaps = (p,slot) => Math.hypot(p.x-slot.x,p.y-slot.y)<23;
    function support(p,slots,map) {
        const ground=map?Math.max(0,window.BlockTerrain.compile(map).support(p.x,p.y,p.jumpHeight || 0)):0;
        return (p.jumpHeight || 0)>=23.99 && slots.some(slot=>blocks(slot)&&overlaps(p,slot)) ? Math.max(24,ground) : ground;
    }
    function ceiling(map,x,y,feet=0) { return window.BlockTerrain.compile(map).ceiling(x,y,feet); }
    function start(p,slots,map) { if((p.jumpVelocity || 0)===0 && Math.abs((p.jumpHeight || 0)-support(p,slots,map))<.01){p.jumpVelocity=196;return true;}return false; }
    function advance(p,dt,slots,map) {
        const ground=support(p,slots,map),limit=ceiling(map,p.x,p.y,p.jumpHeight || 0)-32;
        let h=(p.jumpHeight || 0)+(p.jumpVelocity || 0)*dt-313.6*dt*dt,v=(p.jumpVelocity || 0)-627.2*dt;
        if(h>limit){h=limit;v=Math.min(0,v);}
        if(h<=ground && v<=0){h=ground;v=0;}
        p.jumpHeight=h;p.jumpVelocity=v;
    }
    return {support,ceiling,start,advance};
})();
