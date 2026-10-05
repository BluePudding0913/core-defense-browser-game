"use strict";

// Preferences belong to this browser, independent of the game connection.
window.corePointerSettings = (() => {
    const storageKey = "core-defense-pointer";
    const defaults = { color: "#0078ff", size: 6 };
    const normalize = value => ({
        color: /^#[0-9a-f]{6}$/i.test(value?.color) ? value.color.toLowerCase() : defaults.color,
        size: Number.isFinite(value?.size) ? Math.max(4, Math.min(32, Math.round(value.size))) : defaults.size
    });
    let settings = { ...defaults };
    try { settings = normalize(JSON.parse(localStorage.getItem(storageKey))); } catch { /* Optional storage. */ }
    function apply() {
        const { color, size } = settings;
        const extent = size + 6, center = extent / 2;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${extent}" height="${extent}"><circle cx="${center}" cy="${center}" r="${size / 2}" fill="${color}"/></svg>`;
        const style = document.documentElement.style;
        style.setProperty("--game-pointer", `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${center} ${center}, crosshair`);
        style.setProperty("--pointer-color", color);
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
