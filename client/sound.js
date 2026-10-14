"use strict";

// Firearm samples share decoded buffers; other effects and loading fallbacks are synthesized locally.
(() => {
    const scriptUrl=typeof document!=="undefined"?document.currentScript?.src:null;
    function embeddedSample(key) {
        try {return typeof window[key]==="string"
            ? Uint8Array.from(atob(window[key]),char=>char.charCodeAt(0)).buffer:null;}
        catch {return null;}
    }
    // HTTP uses the WAV directly. Only file pages need a script carrying identical bytes.
    const localFile=scriptUrl && new URL(scriptUrl).protocol==="file:";
    function sampleAsset(file,key,gain) {
        const url=scriptUrl?new URL(`assets/sounds/${file}.wav`,scriptUrl).href:`assets/sounds/${file}.wav`;
        const bytes=localFile?new Promise(resolve=>{
            const embedded=embeddedSample(key);if(embedded){resolve(embedded);return;}
            const script=document.createElement("script");
            script.src=new URL(`assets/sounds/${file}.js`,scriptUrl).href;
            script.onload=()=>resolve(embeddedSample(key));script.onerror=()=>resolve(null);
            document.head.append(script);
        }):typeof fetch==="function"
            ? fetch(url).then(response=>response.ok?response.arrayBuffer():null).catch(()=>null)
            : Promise.resolve(null);
        return {bytes,gain,buffer:null,load:null};
    }
    const samples={
        pistol:sampleAsset("pistol_shot","coreAudioPistolWav",.35),
        sniper:sampleAsset("sniper_shot","coreAudioSniperWav",.45)
    };
    function preloadSample(name,audio) {
        const sample=samples[name];
        if(!sample)return Promise.resolve(false);
        if(!audio || typeof audio.decodeAudioData!=="function")return Promise.resolve(false);
        if(!sample.load)sample.load=sample.bytes.then(bytes=>bytes?audio.decodeAudioData(bytes):null)
            .then(buffer=>{sample.buffer=buffer;return !!buffer;}).catch(()=>false);
        return sample.load;
    }
    const effects = {
        "system-restore": { pitch: 95, end: 1000, duration: 6, noise: .82, glitch: true, amplitude: .14 },
        "system-online": { notes: [330, 660, 990], duration: .6, amplitude: .14 },
        pistol: { pitch: 210, end: 75, duration: .16, pistolShot: true, amplitude: .22 },
        ricochet: { pitch: 260, end: 110, duration: .095, softImpact: true, amplitude: .14 },
        shotgun: { pitch: 180, end: 35, duration: .25, noise: .85 },
        smg: { pitch: 520, end: 100, duration: .065, noise: .55 },
        rifle: { pitch: 400, end: 65, duration: .11, noise: .65 },
        sniper: { pitch: 240, end: 35, duration: .32, noise: .65 },
        revolver: { pitch: 320, end: 50, duration: .19, noise: .6 },
        lmg: { pitch: 220, end: 55, duration: .095, noise: .7 },
        laserCannon: { pitch: 1400, end: 160, duration: .28, noise: .08, amplitude: .18 },
        poisonGas: { pitch: 140, end: 70, duration: .38, noise: .75, whoosh: true, amplitude: .14 },
        repulsor: { pitch: 90, end: 45, duration: .12, noise: .15, amplitude: .06 },
        freezeGun: { pitch: 1200, end: 340, duration: .22, noise: .25 },
        plasmaBlade: { pitch: 750, end: 120, duration: .22, noise: .2 },
        rocket: { pitch: 140, end: 28, duration: .42, noise: .8 },
        "missile-launch": { pitch: 1100, end: 220, duration: 1.6, noise: .72, whoosh: true },
        "missile-impact": { pitch: 55, end: 18, duration: 1.05, noise: .88, rumble: true },
        "drone-self-destruct": { pitch: 95, end: 22, duration: .7, noise: .7, rumble: true, amplitude: .24 },
        flamethrower: { pitch: 80, end: 60, duration: .18, noise: .2, rumble: true, amplitude: .24 },
        bat: { pitch: 150, end: 40, duration: .14, noise: .4 },
        medkit: { notes: [440, 554, 659, 880], duration: .36 },
        heal: { notes: [523, 659, 784], duration: .24 },
        build: { notes: [180, 270, 360], duration: .18, noise: .12 },
        purchase: { notes: [659, 988, 1318], duration: .18 },
        refill: { notes: [330, 440, 660], duration: .2, noise: .12 },
        damage: { pitch: 220, end: 55, duration: .1, noise: .35, rumble: true },
        "round-start": { notes: [130, 195], duration: .6, noise: .15, rumble: true, amplitude: .24 },
        pickup: { notes: [880, 1320], duration: .12 },
        item: { notes: [660, 880], duration: .16 },
        railgun: { pitch: 220, end: 220, duration: .4, noise: .35, sustain: true },
        "railgun-charge": { pitch: 180, end: 650, duration: 1.2, charge: true }
    };
    const active = new Set();
    const important = new Set(["round-start", "drone-self-destruct", "system-restore", "system-online"]);
    const railguns = new Map();
    const buffers = new Map();
    let rewindVoice, rewindPending = false, rewindVersion;
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
        for(const name of Object.keys(samples))preloadSample(name,audio);
    }
    // Retry on later gestures if the browser suspended audio again.
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    function bufferFor(name, audio) {
        if (buffers.has(name)) return buffers.get(name);
        const effect = effects[name];
        const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * effect.duration), audio.sampleRate);
        const samples = buffer.getChannelData(0);
        let phase = 0, noise = 0, filteredNoise = 0, seed = 123456789;
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
            filteredNoise += (noise - filteredNoise) * (effect.rumble ? .035 : .12);
            const pulse = effect.whoosh || effect.rumble ? Math.sin(phase * Math.PI * 2) : phase % 1 < .25 ? 1 : -1;
            const mix = effect.noise || 0;
            const attack = effect.sustain ? 1 : Math.min(1, t / (effect.whoosh ? .08 : .003));
            const release = effect.sustain ? 1 : Math.min(1, (effect.duration - t) / .012);
            const envelope = effect.whoosh ? Math.pow(Math.sin(progress * Math.PI), .7)
                : effect.rumble ? Math.pow(1 - progress, 1.3) : effect.charge ? .25 + progress * .75
                : effect.notes ? .7 : effect.sustain ? .8 : Math.pow(1 - progress, 2);
            const air = effect.whoosh || effect.rumble ? Math.max(-1, Math.min(1, filteredNoise * (effect.rumble ? 3 : 1.7))) : noise;
            if (effect.glitch) {
                // Irregular static bursts and short carrier tones give way to a boot sweep.
                const packet = Math.floor(t * 13);
                const gate = packet % 7 === 0 ? .06 : packet % 3 === 0 ? .8 : .3;
                const tone = Math.sin(phase * Math.PI * 2) * (packet % 4 === 0 ? .5 : .12);
                const fade = Math.min(1, t / .15, (effect.duration - t) / .25);
                samples[i] = (noise * gate * .65 + tone) * Math.max(0, fade) * effect.amplitude;
            } else if (effect.pistolShot) {
                const crack=(noise-filteredNoise)*.65*Math.exp(-t*45);
                const body=Math.sin(phase*Math.PI*2)*.35*Math.exp(-t*22);
                samples[i]=(crack+body)*attack*release*effect.amplitude;
            } else if (effect.softImpact) {
                const body = Math.sin(phase * Math.PI * 2) * .35 + filteredNoise * .65;
                samples[i] = body * attack * release * envelope * effect.amplitude;
            } else samples[i] = (pulse * (1 - mix) + air * mix) * attack * release * envelope * (effect.amplitude ?? .16);
        }
        buffers.set(name, buffer);
        return buffer;
    }
    window.coreAudio = {
        preloadSamples(name="pistol") { return preloadSample(name,context()); },
        syncRewind(remaining, version) {
            const pending = remaining > 0;
            if (pending && !rewindPending) {
                this.stopRailguns();
                rewindVoice = this.play("system-restore");
            } else if (!pending && rewindPending) {
                rewindVoice?.stop(); rewindVoice = null;
                if (version !== rewindVersion) this.play("system-online");
            }
            rewindPending = pending; rewindVersion = version;
        },
        resetRewind() {
            rewindVoice?.stop(); rewindVoice = null; rewindPending = false; rewindVersion = undefined;
        },
        getVolume() { return masterVolume; },
        setVolume(value) {
            masterVolume = normalizeVolume(value);
            if (masterGain) masterGain.gain.value = masterVolume;
            try { localStorage.setItem(storageKey, JSON.stringify(masterVolume)); } catch { /* Optional storage. */ }
        },
        stopRailgun(id) { const current = railguns.get(id); current?.voice?.stop(); railguns.delete(id); },
        stopRailguns() { for (const id of railguns.keys()) this.stopRailgun(id); },
        syncRailguns(players, listener, localId, localFiring, secondaryFiring) {
            const live = new Set();
            for (const owner of players) {
              const hands = [{ ...owner, held: localFiring }];
              if (owner.job === "attacker") hands.push({ ...owner, id: owner.id + ":right",
                  weapon: owner.secondaryWeapon, railgunCharge: owner.secondaryRailgunCharge,
                  railgunRemaining: owner.secondaryRailgunRemaining, held: secondaryFiring });
              for (const player of hands) {
                if (owner.id === localId && player.held === false) continue;
                const name = !player.down && player.weapon === "railgun" ? player.railgunRemaining > 0 ? "railgun" : player.railgunCharge > 0 ? "railgun-charge" : null : null;
                if (!name || !listener) continue;
                live.add(player.id);
                const distance = owner.id === localId ? 0 : Math.hypot(listener.x - player.x, listener.y - player.y);
                if (railguns.get(player.id)?.name !== name) {
                    this.stopRailgun(player.id);
                    const voice = this.play(name, distance, name === "railgun");
                    if (voice) railguns.set(player.id, { name, voice });
                }
                railguns.get(player.id)?.voice?.setDistance(distance);
              }
            }
            for (const id of railguns.keys()) if (!live.has(id)) this.stopRailgun(id);
        },
        play(name, distance = 0, loop = false) {
            if (!unlocked || masterVolume === 0 || !Object.hasOwn(effects, name)) return;
            if (!Number.isFinite(distance)) return;
            const volume = Math.pow(Math.max(0, 1 - Math.max(0, distance) / 600), 2);
            if (volume === 0) return;
            const audio = context();
            if (!audio || audio.state !== "running") return;
            if (active.size >= 8) {
                if (!important.has(name)) return;
                // Make room for important cues, preferring a one-shot over a sustained beam.
                const oldest = [...active].find(source => !source.loop) || active.values().next().value;
                active.delete(oldest);
                oldest.stop();
            }
            const source = audio.createBufferSource();
            source.effectName = name;
            const sample=samples[name]?.buffer;
            const sampleGain=sample ? samples[name].gain : 1;
            const gain = audio.createGain();
            gain.gain.value = volume*sampleGain;
            source.buffer = sample || bufferFor(name, audio);
            source.loop = loop;
            source.connect(gain);
            gain.connect(masterGain);
            active.add(source);
            let stopped = false;
            const voice = {
                stop() { if (stopped) return; stopped = true; source.stop(); },
                setDistance(value) { gain.gain.value = Math.pow(Math.max(0, 1 - value / 600), 2)*sampleGain; }
            };
            source.onended = () => {
                stopped = true;
                active.delete(source); source.disconnect(); gain.disconnect();
                for (const [id, current] of railguns) if (current.voice === voice) railguns.delete(id);
            };
            source.start();
            return voice;
        }
    };
})();
