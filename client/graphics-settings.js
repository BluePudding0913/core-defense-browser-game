"use strict";
window.coreGraphicsSettings = (() => {
    const key = "core-defense-shadows";
    let shadows = true;
    const fpsKey = "core-defense-max-fps";
    let maxFps = 60;
    try { shadows = localStorage.getItem(key) !== "false"; } catch { /* Optional storage. */ }
    try { maxFps = localStorage.getItem(fpsKey) === "30" ? 30 : 60; } catch { /* Optional storage. */ }
    return {
        getMaxFps: () => maxFps,
        setMaxFps(value) {
            maxFps = Number(value) === 30 ? 30 : 60;
            try { localStorage.setItem(fpsKey, String(maxFps)); } catch { /* Keep working without storage. */ }
            return maxFps;
        },
        getShadows: () => shadows,
        setShadows(value) {
            shadows = value === true;
            try { localStorage.setItem(key, String(shadows)); } catch { /* Keep working without storage. */ }
            return shadows;
        }
    };
})();
