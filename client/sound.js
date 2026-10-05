"use strict";

// Replace the empty MP3 files with actual sound assets; no code changes needed.
(() => {
    const names = ["pistol", "ricochet", "shotgun", "smg", "rifle", "sniper", "revolver", "lmg", "bat", "medkit", "heal", "build", "pickup", "item"];
    const active = new Set();
    let unlocked = false;
    const unlock = () => { unlocked = true; };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.coreAudio = {
        play(name) {
            if (name === "rocket") name = "shotgun";
            if (!unlocked || !names.includes(name) || active.size >= 8) return;
            const audio = new Audio(`sounds/${name}.mp3`);
            audio.volume = .35;
            active.add(audio);
            const release = () => active.delete(audio);
            audio.addEventListener("ended", release, { once: true });
            audio.addEventListener("error", release, { once: true });
            const playing = audio.play();
            if (playing?.catch) playing.catch(release); // Empty placeholders are intentionally silent.
        }
    };
})();
