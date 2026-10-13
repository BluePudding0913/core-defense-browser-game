/* Core damage alerts travel across the whole map independently of later hits. */
const CoreFeedback = (() => {
    const duration = 2800;
    let waves = [],lastDamageAt=-Infinity;
    function add(core, now) {
        lastDamageAt=now;
        waves = waves.filter(wave => now - wave.started < duration);
        waves.push({x:core.x, y:core.y, started:now});
        if (waves.length > 8) waves.shift();
    }
    function draw(ctx, now, world, scale = 1) {
        waves = waves.filter(wave => now - wave.started < duration);
        const reach = Math.hypot(world.width, world.height) + 100;
        for (const wave of waves) {
            const age = now - wave.started;
            if (age < 0) continue;
            ctx.save();
            ctx.globalAlpha = .8 * Math.min(1, (duration - age) / 600);
            ctx.strokeStyle = "#ff4e58";
            ctx.lineWidth = 4 / scale;
            ctx.beginPath();
            ctx.arc(wave.x, wave.y, 40 + reach * age / duration, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }
    function updateHud(element,core,now) {
        if(!element)return;
        const age=now-lastDamageAt,alpha=core && age>=0?Math.max(0,Math.min(1,1-(age-10000)/400)):0;
        if(element.hidden!==(alpha<=0))element.hidden=alpha<=0;
        if(alpha<=0)return;
        if(element.style.opacity!==String(alpha))element.style.opacity=String(alpha);
        const transform=`scale(${Number((1+.14*Math.max(0,1-age/220)**2).toFixed(3))})`;
        if(element.style.transform!==transform)element.style.transform=transform;
        const maximum=Math.max(1,core.maxHp || 1),hp=Math.max(0,core.hp || 0);
        const fill=element.querySelector('.core-hud-fill');
        const width=`${Math.max(0,Math.min(100,hp/maximum*100))}%`;
        if(fill.style.width!==width)fill.style.width=width;
    }
    return {add, draw, updateHud, reset(keepHud=false) { waves = [];if(!keepHud)lastDamageAt=-Infinity; }};
})();
if (typeof module !== "undefined") module.exports = CoreFeedback;
