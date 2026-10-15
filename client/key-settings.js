"use strict";

window.coreKeySettings = (() => {
    const storageKey = "core-defense-medkit-key";
    const jobStorageKey = "core-defense-job-key";
    const droneStorageKey = "core-defense-drone-self-destruct-key";
    const sniperStorageKey = "core-defense-sniper-stance-key";
    const reserved = new Set(["w", "a", "s", "d", "e", "r", " ", ..."123456789"]);
    const valid = key => typeof key === "string"
        && (key.length === 1 || /^f([1-9]|1[0-2])$/.test(key)) && !reserved.has(key);
    const bindings = [
        {storage: storageKey, fallback: ["c", "h", "j", "k"]},
        {storage: jobStorageKey, fallback: ["f", "j", "k", "l"]},
        {storage: droneStorageKey, fallback: ["g", "j", "k", "l"]},
        {storage: sniperStorageKey, fallback: ["v", "z", "c", "b"]}
    ];
    const used = new Set();
    for (const binding of bindings) {
        try {
            const saved = localStorage.getItem(binding.storage);
            if (valid(saved) && !used.has(saved)) {
                binding.value = saved;
                used.add(saved);
            }
        } catch { /* Optional storage. */ }
    }
    for (const binding of bindings) {
        if (!binding.value) {
            binding.value = binding.fallback.find(key => !used.has(key));
            used.add(binding.value);
        }
    }
    let [medkit, jobEffect, droneSelfDestruct, sniperStance] = bindings.map(binding => binding.value);
    return {
        gameKey(event) {
            // Gameplay follows physical keys even while Windows IME is active.
            if (/^Key[A-Z]$/.test(event.code || "")) return event.code.slice(3).toLowerCase();
            if (/^Digit[1-9]$/.test(event.code || "")) return event.code.slice(5);
            if (/^Arrow(Up|Down|Left|Right)$/.test(event.code || "")) return event.code.toLowerCase();
            if (event.code === "ShiftLeft" || event.code === "ShiftRight") return "shift";
            if (event.code === "Space") return " ";
            if (event.code === "Escape") return "escape";
            return event.key.toLowerCase();
        },
        getSniperStance:()=>sniperStance,
        setSniperStance(key) {
            key=key.toLowerCase();
            if(!valid(key) || [medkit,jobEffect,droneSelfDestruct].includes(key))return false;
            sniperStance=key;
            try{localStorage.setItem(sniperStorageKey,key);}catch{}
            return true;
        },
        getMedkit: () => medkit,
        getJobEffect: () => jobEffect,
        getDroneSelfDestruct: () => droneSelfDestruct,
        setDroneSelfDestruct(key) {
            key = key.toLowerCase();
            if (!valid(key) || key === sniperStance || key === medkit || key === jobEffect) return false;
            droneSelfDestruct = key;
            try { localStorage.setItem(droneStorageKey, key); } catch { /* Optional storage. */ }
            return true;
        },
        setJobEffect(key) {
            key = key.toLowerCase();
            if (!valid(key) || key === sniperStance || key === medkit || key === droneSelfDestruct) return false;
            jobEffect = key;
            try { localStorage.setItem(jobStorageKey, jobEffect); } catch { /* Optional storage. */ }
            return true;
        },
        setMedkit(key) {
            key = key.toLowerCase();
            if (!valid(key) || key === sniperStance || key === jobEffect || key === droneSelfDestruct) return false;
            medkit = key;
            try { localStorage.setItem(storageKey, medkit); } catch { /* Optional storage. */ }
            return true;
        },
    };
})();
