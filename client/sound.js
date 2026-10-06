"use strict";

// Replace the empty MP3 files with actual sound assets; no code changes needed.
(() => {
    const names = ["pistol", "ricochet", "shotgun", "smg", "rifle", "sniper", "revolver", "lmg", "bat", "medkit", "heal", "build", "pickup", "item"];
    const active = new Set();
    let unlocked = false;
    let synth;
    function playRailgun(charge) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        synth ||= new AudioContext();
        synth.resume().catch(() => {});
        const oscillator = synth.createOscillator(), gain = synth.createGain();
        const now = synth.currentTime, duration = charge ? 1.2 : .45;
        oscillator.type = charge ? "sine" : "sawtooth";
        oscillator.frequency.setValueAtTime(charge ? 180 : 160, now);
        oscillator.frequency.exponentialRampToValueAtTime(charge ? 650 : 45, now + duration);
        gain.gain.setValueAtTime(.0001, now);
        gain.gain.exponentialRampToValueAtTime(charge ? .035 : .07, now + .025);
        gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
        oscillator.connect(gain); gain.connect(synth.destination);
        oscillator.start(now); oscillator.stop(now + duration);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
    const unlock = () => { unlocked = true; };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.coreAudio = {
        play(name) {
            if (unlocked && (name === "railgun" || name === "railgun-charge")) {
                playRailgun(name === "railgun-charge");
                return;
            }
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
