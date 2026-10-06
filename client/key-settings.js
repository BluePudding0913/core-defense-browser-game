"use strict";

window.coreKeySettings = (() => {
    const storageKey = "core-defense-medkit-key";
    const reserved = new Set(["w", "a", "s", "d", "e", "r", " ", ..."123456789"]);
    const valid = key => typeof key === "string"
        && (key.length === 1 || /^f([1-9]|1[0-2])$/.test(key)) && !reserved.has(key);
    let medkit = "h";
    try {
        const saved = localStorage.getItem(storageKey);
        if (valid(saved)) medkit = saved;
    } catch { /* Optional storage. */ }
    return {
        getMedkit: () => medkit,
        setMedkit(key) {
            key = key.toLowerCase();
            if (!valid(key)) return false;
            medkit = key;
            try { localStorage.setItem(storageKey, medkit); } catch { /* Optional storage. */ }
            return true;
        },
    };
})();
