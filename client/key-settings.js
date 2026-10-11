"use strict";

window.coreKeySettings = (() => {
    const storageKey = "core-defense-medkit-key";
    const jobStorageKey = "core-defense-job-key";
    const droneStorageKey = "core-defense-drone-self-destruct-key";
    const sniperStorageKey = "core-defense-sniper-stance-key";
    const reserved = new Set(["w", "a", "s", "d", "e", "r", " ", ..."123456789"]);
    const valid = key => typeof key === "string"
        && (key.length === 1 || /^f([1-9]|1[0-2])$/.test(key)) && !reserved.has(key);
    let sniperStance = "c";
    let medkit = "h";
    let jobEffect = "f";
    let droneSelfDestruct = "g";
    try {
        const saved = localStorage.getItem(storageKey);
        if (valid(saved)) medkit = saved;
        const savedJob = localStorage.getItem(jobStorageKey);
        if (valid(savedJob)) jobEffect = savedJob;
        if (medkit === jobEffect) medkit = jobEffect === "h" ? "j" : "h";
        const savedDrone = localStorage.getItem(droneStorageKey);
        if (valid(savedDrone)) droneSelfDestruct = savedDrone;
        if ([medkit, jobEffect].includes(droneSelfDestruct))
            droneSelfDestruct = ["g", "j", "k"].find(key => ![medkit, jobEffect].includes(key));
        const savedSniper=localStorage.getItem(sniperStorageKey);
        if(valid(savedSniper))sniperStance=savedSniper;
    } catch { /* Optional storage. */ }
    if([medkit,jobEffect,droneSelfDestruct].includes(sniperStance))
        sniperStance=["c","z","v","b"].find(key=>![medkit,jobEffect,droneSelfDestruct].includes(key));
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
