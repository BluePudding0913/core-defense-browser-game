"use strict";
const FlameParticles = Object.freeze({
    createBudget() {
        return { remaining: 48, emitters: new Map() };
    },
    draw(ctx, effect, now, halfAngle, canReach = () => true, budget = FlameParticles.createBudget()) {
        const age = now - effect.started;
        if (age < 0 || age >= 360) return;
        const range = Math.hypot(effect.x - effect.fromX, effect.y - effect.fromY);
        if (!(range > 0)) return;
        const emitter = effect.playerId || "";
        const available = budget.emitters.get(emitter) ?? 12;
        const count = Math.min(8, available, budget.remaining);
        if (count <= 0) return;
        // Reserve work before checking walls so hidden flames cannot exceed the budget either.
        budget.remaining -= count;
        budget.emitters.set(emitter, available - count);
        const aim = Math.atan2(effect.y - effect.fromY, effect.x - effect.fromX);
        const progress = age / 360;
        ctx.save();
        for (let i = 0; i < count; i++) {
            const spread = (count === 1 ? 0 : i / (count - 1) * 2 - 1) * halfAngle;
            const speed = .7 + ((i * 7) % 11) / 36;
            const travel = range * Math.min(1, (.08 + progress * .92) * speed);
            const x = effect.fromX + Math.cos(aim + spread) * travel;
            const y = effect.fromY + Math.sin(aim + spread) * travel;
            if (!canReach({x:effect.fromX, y:effect.fromY}, {x,y})) continue;
            const size = (3 + i % 4) * (1 + progress * .8);
            ctx.globalAlpha = (1 - progress) * .85;
            ctx.fillStyle = i % 3 === 0 ? "#ff4e3a" : "#ff9c38";
            ctx.fillRect(x - size / 2, y - size / 2, size, size);
        }
        ctx.restore();
    }
});
if (typeof module !== "undefined") module.exports = FlameParticles;
