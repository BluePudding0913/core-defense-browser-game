const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const listeners = {}, sources = [], buffers = [];
let contexts = 0;
class AudioContext {
    constructor() { contexts++; this.sampleRate = 48000; this.state = 'suspended'; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createGain() { return { gain: { value: 1 }, connect(node) { this.output = node; }, disconnect() { this.disconnected = true; } }; }
    createBuffer(channels, length) {
        const data = new Float32Array(length);
        const buffer = { getChannelData: () => data };
        buffers.push(buffer); return buffer;
    }
    createBufferSource() {
        const source = { connect(node) { this.output = node; }, disconnect() { this.disconnected = true; }, start() { this.started = true; }, stop() { this.stopped = true; this.onended?.(); } };
        sources.push(source); return source;
    }
}
const window = { AudioContext, addEventListener: (name, fn) => listeners[name] = fn };
const saved = new Map();
const localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
vm.runInNewContext(fs.readFileSync('client/sound.js', 'utf8'), { window, localStorage });
window.coreAudio.play('pistol'); assert.equal(contexts, 0);
listeners.pointerdown(); assert.equal(contexts, 1);
const names = ['pistol', 'ricochet', 'shotgun', 'smg', 'rifle', 'sniper', 'revolver', 'lmg', 'rocket', 'bat', 'medkit', 'heal', 'build', 'pickup', 'item', 'railgun', 'railgun-charge'];
const demo = [];
for (const name of names) {
    window.coreAudio.play(name);
    const source = sources.at(-1), data = source.buffer.getChannelData(0);
    assert(source.started, name);
    assert(data.some(value => Math.abs(value) > .01), `${name} is audible`);
    assert(data.every(value => Number.isFinite(value) && Math.abs(value) <= .161), `${name} stays within volume limit`);
    demo.push(data, new Float32Array(12000));
    source.onended(); assert(source.disconnected);
}
const count = buffers.length;
window.coreAudio.play('pistol'); sources.at(-1).onended();
assert.equal(buffers.length, count, 'reuses synthesized buffers');
for (let i = 0; i < 12; i++) window.coreAudio.play('smg');
assert.equal(sources.length, names.length + 9, 'limits overlapping voices to eight');
const before = sources.length;
window.coreAudio.play('unknown'); window.coreAudio.play('constructor');
assert.equal(sources.length, before);
for (const source of sources) source.onended();
for (const name of names) {
    window.coreAudio.play(name, 0);
    assert.equal(sources.at(-1).output.gain.value, 1);
    sources.at(-1).onended();
    window.coreAudio.play(name, 300);
    assert.equal(sources.at(-1).output.gain.value, .25, `${name} attenuates with distance`);
    const gain = sources.at(-1).output;
    sources.at(-1).onended(); assert(gain.disconnected);
    const count = sources.length;
    for (const distance of [600, 1000, NaN, Infinity]) window.coreAudio.play(name, distance);
    assert.equal(sources.length, count, `${name} is silent beyond hearing range`);
}

window.coreAudio.play('pistol');
const master = sources.at(-1).output.output;
window.coreAudio.setVolume(.35);
assert.equal(master.gain.value, .35, 'changes already playing voices');
assert.equal(saved.get('core-defense-volume'), '0.35');
window.coreAudio.setVolume(0);
const mutedCount = sources.length;
window.coreAudio.play('heal');
assert.equal(sources.length, mutedCount, 'zero volume mutes all effects');
const reloaded = { addEventListener() {} };
vm.runInNewContext(fs.readFileSync('client/sound.js', 'utf8'), { window: reloaded, localStorage });
assert.equal(reloaded.coreAudio.getVolume(), 0, 'saved mute survives reload');
for (const [value, expected] of [[2, 1], [-1, 0], [NaN, 1]]) {
    window.coreAudio.setVolume(value);
    assert.equal(window.coreAudio.getVolume(), expected);
}
sources.at(-1).onended();

const app = fs.readFileSync('client/app.js', 'utf8');
const start = app.indexOf('function playSoundEffect(');
const played = [];
const me = { id: 'me', x: 0, y: 0 }, other = { id: 'other', x: 300, y: 0 };
const game = vm.createContext({
    getMe: () => me, myPlayerId: 'me', state: { players: [me, other] },
    predictedLocal: null, BUILD_INFO: { wall: {} },
    distance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    window: { coreAudio: { play: (...args) => played.push(args) } }
});
vm.runInContext(app.slice(start, app.indexOf('\nfunction ', start + 1)), game);
function effect(message) { game.message = message; vm.runInContext('playSoundEffect(message)', game); }
effect({ effect: 'pickup', playerId: 'other', x: 10, y: 0 });
assert.equal(played.length, 0, 'other players cannot trigger pickup SE');
effect({ effect: 'pickup', playerId: 'me', x: 10, y: 0 });
assert.deepEqual(played.pop(), ['pickup', 0]);
effect({ effect: 'shot', playerId: 'other', weapon: 'rifle' });
assert.deepEqual(played.pop(), ['rifle', 300]);
game.predictedLocal = { x: 100, y: 0 };
effect({ effect: 'item-use', playerId: 'other', item: 'wall', x: 400, y: 0 });
assert.deepEqual(played.pop(), ['build', 300]);
effect({ effect: 'item-use', playerId: 'other', item: 'medkit' });
assert.deepEqual(played.pop(), ['medkit', 200]);
effect({ effect: 'shot', playerId: 'me', weapon: 'railgun', item: 'railgun-charge' });
assert.equal(played.length, 0, 'railgun sounds follow continuous state instead of one-shot events');
effect({ effect: 'shot', playerId: 'missing', weapon: 'pistol' });
assert.equal(played.length, 0, 'unknown source cannot trigger full-volume audio');
vm.runInNewContext(fs.readFileSync('client/sound.js', 'utf8'), { window: { addEventListener() {} } });
if (process.argv[2]) {
    const length = demo.reduce((sum, data) => sum + data.length, 0);
    const wav = Buffer.alloc(44 + length * 2);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(96000, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
    wav.writeUInt32LE(length * 2, 40);
    let offset = 44;
    for (const data of demo) for (const value of data) { wav.writeInt16LE(Math.round(value * 32767), offset); offset += 2; }
    fs.writeFileSync(process.argv[2], wav);
}
// Charge cancellation, loop lifetime, transitions and multiple shooters.
window.coreAudio.setVolume(1);
const railPlayer = { id: 'rail', x: 0, y: 0, weapon: 'railgun', railgunCharge: .2, railgunRemaining: 0 };
window.coreAudio.syncRailguns([railPlayer], railPlayer, 'rail');
const charging = sources.at(-1);
assert.equal(charging.loop, false);
window.coreAudio.syncRailguns([railPlayer], railPlayer, 'rail');
assert.equal(sources.at(-1), charging, 'charge does not restart every frame');
railPlayer.railgunCharge = 0;
window.coreAudio.syncRailguns([railPlayer], railPlayer, 'rail');
assert(charging.stopped, 'cancelled charge stops immediately');
railPlayer.railgunRemaining = 3;
window.coreAudio.syncRailguns([railPlayer], railPlayer, 'rail');
const beam = sources.at(-1);
assert.equal(beam.loop, true, 'beam loops throughout irradiation');
window.coreAudio.syncRailguns([railPlayer], railPlayer, 'rail');
assert.equal(sources.at(-1), beam);
railPlayer.down = true;
window.coreAudio.syncRailguns([railPlayer], railPlayer, 'rail');
assert(beam.stopped, 'down state stops beam');
railPlayer.down = false;
window.coreAudio.syncRailguns([railPlayer], railPlayer, 'rail');
const disconnected = sources.at(-1);
window.coreAudio.stopRailguns();
assert(disconnected.stopped, 'disconnect stops all tracked sounds');
console.log('Synthesized SE passed: all effects, gesture unlock, cached buffers, bounded volume and voice limit');
