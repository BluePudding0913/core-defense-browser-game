'use strict';
// Local HUD presentation; combat and enemy state remain authoritative on the server.
window.ProximityWarning = (() => {
    const range = 200; // Five 40-unit tiles.
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    function sample(eye, enemies, {yaw=0, fov=72, aspect=1, smooth}={}) {
        if (!eye) return null;
        // Three.js supplies vertical FOV; derive the horizontal screen boundary.
        const halfView = Math.atan(Math.tan(fov*Math.PI/360)*aspect);
        let nearest = null, nearestSquared = range*range;
        for (const enemy of enemies) {
            if (!(enemy.hp>0) || enemy.type==='ghost') continue;
            const p = smooth ? smooth('enemy',enemy) : enemy;
            const dx=p.x-eye.x, dy=p.y-eye.y, squared=dx*dx+dy*dy;
            if (squared>range*range || nearest && squared>=nearestSquared) continue;
            const bearing=Math.atan2(dx,-dy)-yaw;
            const angle=Math.atan2(Math.sin(bearing),Math.cos(bearing));
            if (Math.abs(angle)<=halfView) continue;
            const distance=Math.sqrt(squared);
            nearestSquared=squared;
            nearest={distance,angle,strength:(.15+.85*Math.min(1,(range-distance)/(range-40)))
                *Math.min(1,(Math.abs(angle)-halfView)/.08)};
        }
        return nearest;
    }
    function draw(ctx,width,height,threat,now) {
        if (!threat || width<=0 || height<=0) return;
        const pulse=reducedMotion?.matches?1:.83+.17*Math.sin(now*Math.PI*2/1400);
        const alpha=threat.strength*pulse, cx=width/2, cy=height/2;
        const rx=Math.max(1,cx-Math.min(45,width*.08));
        const ry=Math.max(1,cy-Math.min(65,height*.12));
        const a=threat.angle-Math.PI/2;
        ctx.save();ctx.lineCap='round';
        ctx.strokeStyle=`rgba(255,95,70,${alpha*.9})`;ctx.lineWidth=6;
        ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,a-.23,a+.23);ctx.stroke();
        ctx.strokeStyle=`rgba(255,195,135,${alpha})`;ctx.lineWidth=2;
        ctx.beginPath();ctx.ellipse(cx,cy,rx*.974,ry*.974,0,a-.13,a+.13);ctx.stroke();
        ctx.restore();
    }
    return {range,sample,draw};
})();
