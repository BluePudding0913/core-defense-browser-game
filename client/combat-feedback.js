/* Each local hit keeps its own reward label, independently from hit animations. */
const CombatFeedback = (() => {
    let popups = [], marker = null;
    function add(effect, now, playerId, debugMode = false) {
        if(effect.effect==='hit' && effect.playerId===playerId && effect.enemyId!=null && Number.isFinite(effect.damage) && effect.damage>0) {
            marker={at:now,headshotAt:effect.headshot ? now : marker?.headshotAt ?? -Infinity};
        }
        const damage = debugMode && Number.isFinite(effect.damage) && effect.damage > 0 ? effect.damage : 0;
        if (effect.effect !== "hit" || effect.playerId !== playerId
                || !(effect.credits > 0 || damage > 0)) return;
        popups = popups.filter(popup => now - popup.updated < 900);
        popups.push({x:effect.x, y:effect.y, enemyId:effect.enemyId,
            credits:Math.max(0, effect.credits || 0), damage, created:now, updated:now});
        if (popups.length > 30) popups.shift();
    }
    function layout(now, project) {
        popups = popups.filter(popup => now - popup.updated < 900);
        let placed = [];
        for (const popup of popups) {
            const text = popup.credits > 0 ? `+${popup.credits}G` : "";
            const damageText = popup.damage > 0 ? String(Number(popup.damage.toFixed(2))) + " DMG" : "";
            const lineWidth = (text.length + damageText.length) * 7 + (text && damageText ? 8 : 0);
            if (!text && !damageText) continue;
            const width = lineWidth, height = 14;
            const age = now - popup.updated;
            const anchor = project ? project(popup) : popup;
            const baseY = anchor.y - 26 - Math.min(1, (now - popup.created) / 900) * 12;
            const overlaps = (other, y) => Math.abs(other.x - anchor.x) < (other.width + width) / 2 + 8
                && Math.abs(other.y - y) < (other.height + height) / 2 + 2;
            if (popup.labelOffset == null) {
                const offset = [0, -20, -40].find(offset => !placed.some(other => overlaps(other, baseY + offset)));
                popup.labelOffset = offset ?? 0;
                if (offset == null) {
                    // A full group replaces old labels instead of growing upward forever.
                    placed = placed.filter(other => {
                        if (!overlaps(other, baseY)) return true;
                        other.source.retired = true;
                        return false;
                    });
                }
            }
            const y = baseY + popup.labelOffset;
            placed.push({...popup, source:popup, x:anchor.x, y, width, height, text, damageText, lineWidth, alpha:Math.min(1, (900 - age) / 250)});
        }
        popups = popups.filter(popup => !popup.retired);
        return placed.map(({source, ...label}) => label);
    }
    function draw(ctx, now, project) {
        for (const popup of layout(now, project)) {
            ctx.save(); ctx.globalAlpha = popup.alpha;
            ctx.textAlign = "center";
            if (popup.damageText) {
                ctx.font = "900 11px ui-monospace, monospace";
                ctx.fillStyle = "#ffffff";
                ctx.fillText(popup.damageText, popup.x - popup.lineWidth / 2 + popup.damageText.length * 7 / 2, popup.y);
            }
            if (popup.text) {
                ctx.font = "900 11px ui-monospace, monospace";
                ctx.fillStyle = "#79d8ff";
                ctx.fillText(popup.text, popup.x + (popup.damageText ? popup.damageText.length * 7 / 2 + 4 : 0), popup.y);
            }
            ctx.restore();
        }
    }
    function hitMarker(now) {return marker && now-marker.at>=0 && now-marker.at<160 ? {headshot:now-marker.headshotAt<160,alpha:1-(now-marker.at)/160} : null;}
    function drawHitMarker(ctx,now,x,y) {
        const hit=hitMarker(now);if(!hit)return;
        ctx.save();ctx.globalAlpha=hit.alpha;ctx.strokeStyle=hit.headshot?'#ff5964':'#f1f8fb';ctx.lineWidth=2;
        ctx.beginPath();for(const [dx,dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){ctx.moveTo(x+dx*5,y+dy*5);ctx.lineTo(x+dx*10,y+dy*10);}ctx.stroke();ctx.restore();
    }
    return {add, layout, draw, hitMarker, drawHitMarker, reset() {popups = [];marker=null;} };
})();
if (typeof module !== "undefined") module.exports = CombatFeedback;
