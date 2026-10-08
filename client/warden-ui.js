"use strict";

const WardenUI = (() => {
    function draw(ctx, enemy) {
        if (enemy.type !== "warden") return;
        const pulse = enemy.bossAction === "PULSE_WARNING";
        const charge = enemy.bossAction === "CHARGE_WARNING" || enemy.bossAction === "CHARGING";
        if (!pulse && !charge) return;
        ctx.save();
        ctx.strokeStyle = "#ffac70";
        ctx.fillStyle = "rgb(255 139 75 / 12%)";
        if (pulse) {
            const radius = enemy.pulseRadius;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(enemy.x, enemy.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            const progress = Math.max(0, Math.min(1, 1 - enemy.actionRemaining / 1.2));
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(enemy.x, enemy.y, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2); ctx.stroke();
        } else {
            ctx.strokeStyle = "rgb(255 139 75 / 12%)"; ctx.lineWidth = 84;
            ctx.beginPath(); ctx.moveTo(enemy.x, enemy.y); ctx.lineTo(enemy.targetX, enemy.targetY); ctx.stroke();
            ctx.strokeStyle = "#ffac70"; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
            ctx.beginPath(); ctx.moveTo(enemy.x, enemy.y); ctx.lineTo(enemy.targetX, enemy.targetY); ctx.stroke();
        }
        ctx.restore();
    }
    return { draw };
})();
if (typeof module !== "undefined") module.exports = WardenUI;
