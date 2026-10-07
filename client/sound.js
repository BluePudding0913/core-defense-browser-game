"use strict";

// Synthesized locally: no downloads or sound files are required.
(() => {
    const effects = {
        pistol: { pitch: 720, end: 90, duration: .12, noise: .45 },
        ricochet: { pitch: 1600, end: 380, duration: .18, noise: .15 },
        shotgun: { pitch: 180, end: 35, duration: .25, noise: .85 },
        smg: { pitch: 520, end: 100, duration: .065, noise: .55 },
        rifle: { pitch: 400, end: 65, duration: .11, noise: .65 },
        sniper: { pitch: 240, end: 35, duration: .32, noise: .65 },
        revolver: { pitch: 320, end: 50, duration: .19, noise: .6 },
        lmg: { pitch: 220, end: 55, duration: .095, noise: .7 },
        rocket: { pitch: 140, end: 28, duration: .42, noise: .8 },
        bat: { pitch: 150, end: 40, duration: .14, noise: .4 },
        medkit: { notes: [440, 554, 659, 880], duration: .36 },
        heal: { notes: [523, 659, 784], duration: .24 },
        build: { notes: [180, 270, 360], duration: .18, noise: .12 },
        pickup: { notes: [880, 1320], duration: .12 },
        item: { notes: [660, 880], duration: .16 },
        railgun: { pitch: 900, end: 45, duration: .45, noise: .35 },
        "railgun-charge": { pitch: 180, end: 650, duration: 1.2, charge: true }
    };
    const active = new Set();
    const buffers = new Map();
    let synth;
    let masterGain;
    let masterVolume = 1;
    const storageKey = "core-defense-volume";
    const normalizeVolume = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
    try {
        const saved = localStorage.getItem(storageKey);
        if (saved !== null) masterVolume = normalizeVolume(JSON.parse(saved));
    } catch { /* Optional storage. */ }
    let unlocked = false;
    function context() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        try {
            if (!synth) {
                synth = new AudioContext();
                masterGain = synth.createGain();
                masterGain.gain.value = masterVolume;
                masterGain.connect(synth.destination);
            }
        } catch { return null; }
        return synth;
    }
    function unlock() {
        unlocked = true;
        const audio = context();
        if (audio?.state === "suspended") audio.resume().catch(() => {});
    }
    // Retry on later gestures if the browser suspended audio again.
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    function bufferFor(name, audio) {
        if (buffers.has(name)) return buffers.get(name);
        const effect = effects[name];
        const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * effect.duration), audio.sampleRate);
        const samples = buffer.getChannelData(0);
        let phase = 0, noise = 0, seed = 123456789;
        for (let i = 0; i < samples.length; i++) {
            const t = i / audio.sampleRate, progress = i / samples.length;
            const frequency = effect.notes
                ? effect.notes[Math.min(effect.notes.length - 1, Math.floor(progress * effect.notes.length))]
                : effect.pitch * Math.pow(effect.end / effect.pitch, progress);
            phase += frequency / audio.sampleRate;
            // Sample-and-hold noise gives impacts a crunchy, low-bit texture.
            if (i % Math.max(1, Math.round(audio.sampleRate / 8000)) === 0) {
                seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
                noise = (seed >>> 0) / 2147483648 - 1;
            }
            const pulse = phase % 1 < .25 ? 1 : -1;
            const mix = effect.noise || 0;
            const attack = Math.min(1, t / .003);
            const release = Math.min(1, (effect.duration - t) / .012);
            const envelope = effect.charge ? .25 + progress * .75
                : effect.notes ? .7 : Math.pow(1 - progress, 2);
            samples[i] = (pulse * (1 - mix) + noise * mix) * attack * release * envelope * .16;
        }
        buffers.set(name, buffer);
        return buffer;
    }
    window.coreAudio = {
        getVolume() { return masterVolume; },
        setVolume(value) {
            masterVolume = normalizeVolume(value);
            if (masterGain) masterGain.gain.value = masterVolume;
            try { localStorage.setItem(storageKey, JSON.stringify(masterVolume)); } catch { /* Optional storage. */ }
        },
        play(name, distance = 0) {
            if (!unlocked || masterVolume === 0 || !Object.hasOwn(effects, name) || active.size >= 8) return;
            if (!Number.isFinite(distance)) return;
            const volume = Math.pow(Math.max(0, 1 - Math.max(0, distance) / 600), 2);
            if (volume === 0) return;
            const audio = context();
            if (!audio || audio.state !== "running") return;
            const source = audio.createBufferSource();
            const gain = audio.createGain();
            gain.gain.value = volume;
            source.buffer = bufferFor(name, audio);
            source.connect(gain);
            gain.connect(masterGain);
            active.add(source);
            source.onended = () => { active.delete(source); source.disconnect(); gain.disconnect(); };
            source.start();
        }
    };
})();
