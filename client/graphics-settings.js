"use strict";
window.coreGraphicsSettings = (() => {
    const key = "core-defense-shadows";
    let shadows = true;
    try { shadows = localStorage.getItem(key) !== "false"; } catch { /* Optional storage. */ }
    return {
        getShadows: () => shadows,
        setShadows(value) {
            shadows = value === true;
            try { localStorage.setItem(key, String(shadows)); } catch { /* Keep working without storage. */ }
            return shadows;
        }
    };
})();
