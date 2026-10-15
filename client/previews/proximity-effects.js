/* Presentation study only. No combat, networking, or saved settings. */
'use strict';
window.ProximityEffects = (() => {
    const range = 120; // Three 40-unit tiles, measured between entity centers.
    function sample(eye, enemies, yaw = 0) {
        let nearest = null;
        for (const enemy of enemies) {
            // Preserve GHOST's concealed presentation.
            if (!(enemy.hp > 0) || enemy.type === 'ghost') continue;
            const dx = enemy.x - eye.x, dy = enemy.y - eye.y;
            const distance = Math.hypot(dx, dy);
            if (distance >= range || nearest && distance >= nearest.distance) continue;
            const angle = Math.atan2(dx, -dy) - yaw;
            nearest = {distance, angle: Math.atan2(Math.sin(angle), Math.cos(angle)),
                strength: Math.min(1, (range - distance) / 80)};
        }
        return nearest;
    }
    function draw(ctx, width, height, mode, threat, now, reducedMotion = false) {
        if (!threat || mode === 'off') return;
        const pulse = reducedMotion ? 1 : .83 + .17 * Math.sin(now * Math.PI * 2 / 1400);
        const alpha = threat.strength * pulse;
        const cx = width / 2, cy = height / 2;
        ctx.save();
        if (mode === 'edge') {
            const depth = Math.min(width, height) * .18;
            for (const [x0,y0,x1,y1,x,y,w,h] of [
                [0,0,depth,0,0,0,depth,height],
                [width,0,width-depth,0,width-depth,0,depth,height],
                [0,0,0,depth,0,0,width,depth],
                [0,height,0,height-depth,0,height-depth,width,depth]]) {
                const gradient = ctx.createLinearGradient(x0,y0,x1,y1);
                gradient.addColorStop(0, `rgba(255,58,50,${alpha * .38})`);
                gradient.addColorStop(1, 'rgba(255,58,50,0)');
                ctx.fillStyle = gradient; ctx.fillRect(x,y,w,h);
            }
        } else if (mode === 'arc') {
            // Front / right / back / left map to top / right / bottom / left.
            const a = threat.angle - Math.PI / 2;
            ctx.translate(cx,cy);
            ctx.scale(Math.max(1,cx-45),Math.max(1,cy-65));
            ctx.strokeStyle = `rgba(255,95,70,${alpha * .9})`;
            ctx.lineWidth = 7 / Math.min(cx,cy);
            ctx.lineCap = 'round';
            ctx.beginPath(); ctx.arc(0,0,1,a-.23,a+.23); ctx.stroke();
            ctx.strokeStyle = `rgba(255,195,135,${alpha})`;
            ctx.lineWidth = 2 / Math.min(cx,cy);
            ctx.beginPath(); ctx.arc(0,0,.974,a-.13,a+.13); ctx.stroke();
        } else if (mode === 'ring') {
            const r = Math.min(74,Math.min(width,height)*.16);
            ctx.lineCap = 'round'; ctx.lineWidth = 3;
            ctx.strokeStyle = `rgba(255,95,70,${alpha * .9})`;
            // Four separated arcs leave the aiming point clear.
            for (let i=0;i<4;i++) {
                const a=i*Math.PI/2;
                ctx.beginPath();ctx.arc(cx,cy,r,a+.16,a+Math.PI/2-.16);ctx.stroke();
            }
            ctx.fillStyle = `rgba(255,190,150,${alpha})`;
            ctx.font = '600 11px system-ui';ctx.textAlign='center';
            ctx.fillText('NEAR',cx,cy+r+21);
        }
        ctx.restore();
    }
    return {range, sample, draw};
})();
