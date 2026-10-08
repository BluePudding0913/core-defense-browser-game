/* Local combat labels are grouped independently from individual hit animations. */
const CombatFeedback = (() => {
    let popups = [];
    function add(effect, now, playerId) {
        if (effect.effect !== "hit" || effect.playerId !== playerId
                || !(effect.credits > 0 || effect.headshot)) return;
        popups = popups.filter(popup => now - popup.updated < 900);
        const matches = popup => now - popup.updated < 350 && now - popup.created < 1200;
        const nearby = popup => Math.hypot(popup.x - effect.x, popup.y - effect.y) < 48;
        let popup = popups.findLast(popup => matches(popup) && popup.enemyId != null && popup.enemyId === effect.enemyId)
            || popups.findLast(popup => matches(popup) && popup.enemyId == null && effect.enemyId == null && nearby(popup));
        if (!popup) {
            popup = {x:effect.x, y:effect.y, enemyId:effect.enemyId, credits:0, headshot:false, created:now};
            popups.push(popup);
        }
        popup.credits += Math.max(0, effect.credits || 0);
        popup.headshot ||= Boolean(effect.headshot);
        if (effect.headshot) popup.headshotAt = now;
        popup.x = effect.x; popup.y = effect.y; popup.updated = now;
        if (popups.length > 30) popups.shift();
    }
    function layout(now) {
        popups = popups.filter(popup => now - popup.updated < 900);
        const placed = [];
        for (const popup of popups) {
            const text = popup.credits > 0 ? `+${popup.credits}G` : "";
            const headshot = popup.headshot && now - popup.headshotAt < 650;
            if (!text && !headshot) continue;
            const width = Math.max(text.length * 7, headshot ? 18 : 0);
            const age = now - popup.updated;
            let y = popup.y - 26 - Math.min(1, (now - popup.created) / 900) * 20;
            while (placed.some(other => Math.abs(other.x - popup.x) < (other.width + width) / 2 + 8
                    && Math.abs(other.y - y) < 30)) y -= 30;
            placed.push({...popup, headshot, x:popup.x, y, width, text, alpha:Math.min(1, (900 - age) / 250)});
        }
        return placed;
    }
    function draw(ctx, now) {
        for (const popup of layout(now)) {
            ctx.save(); ctx.globalAlpha = popup.alpha;
            ctx.textAlign = "center";
            if (popup.text) {
                ctx.font = "900 11px ui-monospace, monospace";
                ctx.fillStyle = "#79d8ff";
                ctx.fillText(popup.text, popup.x, popup.y);
            }
            if (popup.headshot) {
                ctx.font = "900 9px ui-monospace, monospace";
                ctx.fillStyle = "#ff5964";
                ctx.fillText("HS", popup.x, popup.y - (popup.text ? 14 : 0));
            }
            ctx.restore();
        }
    }
    return {add, layout, draw, reset() {popups = [];} };
})();
if (typeof module !== "undefined") module.exports = CombatFeedback;
