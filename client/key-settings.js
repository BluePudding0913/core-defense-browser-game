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
        gameKey(event) {
            // Gameplay follows physical keys even while Windows IME is active.
            if (/^Key[A-Z]$/.test(event.code || "")) return event.code.slice(3).toLowerCase();
            if (/^Digit[1-9]$/.test(event.code || "")) return event.code.slice(5);
            if (/^Arrow(Up|Down|Left|Right)$/.test(event.code || "")) return event.code.toLowerCase();
            if (event.code === "ShiftLeft" || event.code === "ShiftRight") return "shift";
            if (event.code === "Escape") return "escape";
            return event.key.toLowerCase();
        },
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
