"use strict";
window.JumpMovement = (() => {
    const blocks = slot => slot.defense && ['block','barricade','copperBarricade','silverBarricade'].includes(slot.defense.type);
    const overlaps = (p,slot) => Math.hypot(p.x-slot.x,p.y-slot.y)<23;
    function support(p,slots) { return (p.jumpHeight || 0)>=23.99 && slots.some(slot=>blocks(slot)&&overlaps(p,slot)) ? 24 : 0; }
    function ceiling(map,x,y) {
        const r=Math.floor(y/map.tileSize),c=Math.floor(x/map.tileSize);
        const floor=(r,c)=>{const symbol=map.rows[r]?.[c];return symbol!=null && map.legend[symbol]?.solid===false;};
        const span=(dr,dc)=>{let count=1;for(const sign of [-1,1])for(let n=1;floor(r+dr*n*sign,c+dc*n*sign);n++)count++;return count;};
        return Math.min(span(1,0),span(0,1))<=2?64:130;
    }
    function start(p,slots) { if((p.jumpVelocity || 0)===0 && Math.abs((p.jumpHeight || 0)-support(p,slots))<.01){p.jumpVelocity=140;return true;}return false; }
    function advance(p,dt,slots,map) {
        const ground=support(p,slots),limit=ceiling(map,p.x,p.y)-32;
        let h=(p.jumpHeight || 0)+(p.jumpVelocity || 0)*dt-160*dt*dt,v=(p.jumpVelocity || 0)-320*dt;
        if(h>limit){h=limit;v=Math.min(0,v);}
        if(h<=ground && v<=0){h=ground;v=0;}
        p.jumpHeight=h;p.jumpVelocity=v;
    }
    return {support,ceiling,start,advance};
})();
