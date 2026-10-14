"use strict";
// A screen-space anchor: independent of camera motion, recoil and zoom.
window.coreComfortFrame = (() => {
    const key = "core-defense-comfort-frame";
    let enabled = false;
    try { enabled = localStorage.getItem(key) === "true"; } catch { /* Optional storage. */ }
    const apply = () => document.documentElement.classList.toggle("comfort-frame-enabled", enabled);
    apply();
    return {
        get: () => enabled,
        set(value) {
            enabled = value === true;
            apply();
            try { localStorage.setItem(key, String(enabled)); } catch { /* Keep working without storage. */ }
            return enabled;
        }
    };
})();
