"use strict";

window.ScoutMovement = Object.freeze({
    advance(position, dx, dy, travel, maxStep, canOccupy) {
        let { x, y } = position;
        const steps = Math.ceil(travel / maxStep);
        for (let i = 0; i < steps; i++) {
            const step = Math.min(maxStep, travel - i * maxStep);
            const nextX = x + dx * step, nextY = y + dy * step;
            if (!canOccupy(nextX, nextY, 5)) return { x, y, blocked: true };
            x = nextX; y = nextY;
        }
        return { x, y, blocked: false };
    }
});
