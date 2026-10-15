"use strict";
window.coreGraphicsSettings = (() => {
    const key = "core-defense-shadows";
    const fovKey = "core-defense-fov";
    const normalizeFov = value => Number.isFinite(value) ? Math.max(60, Math.min(110, Math.round(value))) : 72;
    let fov = 72;
    try {
        const saved = localStorage.getItem(fovKey);
        if (saved !== null && saved !== undefined && saved.trim() !== "") fov = normalizeFov(Number(saved));
    } catch { /* Optional storage. */ }
    let shadows = true;
    try { shadows = localStorage.getItem(key) !== "false"; } catch { /* Optional storage. */ }
    return {
        getFov: () => fov,
        setFov(value) {
            fov = normalizeFov(value);
            try { localStorage.setItem(fovKey, String(fov)); } catch { /* Optional storage. */ }
            return fov;
        },
        getShadows: () => shadows,
        setShadows(value) {
            shadows = value === true;
            try { localStorage.setItem(key, String(shadows)); } catch { /* Keep working without storage. */ }
            return shadows;
        }
    };
})();
