/* Core damage alerts travel across the whole map independently of later hits. */
const CoreFeedback = (() => {
    const duration = 2800;
    let waves = [];
    function add(core, now) {
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
    return {add, draw, reset() { waves = []; }};
})();
if (typeof module !== "undefined") module.exports = CoreFeedback;
