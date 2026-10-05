"use strict";

// Preferences belong to this browser, independent of the game connection.
window.corePointerSettings = (() => {
    const storageKey = "core-defense-pointer";
    const defaults = { color: "#0078ff", size: 6, shape: "dot" };
    const normalize = value => ({
        color: /^#[0-9a-f]{6}$/i.test(value?.color) ? value.color.toLowerCase() : defaults.color,
        size: Number.isFinite(value?.size) ? Math.max(4, Math.min(32, Math.round(value.size))) : defaults.size,
        shape: ["dot", "cross", "plus"].includes(value?.shape) ? value.shape : defaults.shape
    });
    let settings = { ...defaults };
    try { settings = normalize(JSON.parse(localStorage.getItem(storageKey))); } catch { /* Optional storage. */ }
    function apply() {
        const { color, size, shape } = settings;
        const extent = size + 6, center = extent / 2;
        const lo = 3, hi = size + 3, stroke = Math.max(1.5, size / 7);
        const mark = shape === "dot" ? `<circle cx="${center}" cy="${center}" r="${size / 2}" fill="${color}"/>`
            : shape === "cross" ? `<path d="M${lo} ${lo}L${hi} ${hi}M${hi} ${lo}L${lo} ${hi}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"/>`
            : `<path d="M${center} ${lo}V${hi}M${lo} ${center}H${hi}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"/>`;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${extent}" height="${extent}">${mark}</svg>`;
        const style = document.documentElement.style;
        style.setProperty("--game-pointer", `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${center} ${center}, crosshair`);
        style.setProperty("--pointer-color", color);
        style.setProperty("--pointer-preview", `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
        style.setProperty("--pointer-size", `${size}px`);
    }
    apply();
    return {
        get() { return { ...settings }; },
        update(value) {
            settings = normalize({ ...settings, ...value });
            apply();
            try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* Optional storage. */ }
        }
    };
})();
