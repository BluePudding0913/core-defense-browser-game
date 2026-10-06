const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const listeners = {}, sources = [], buffers = [];
let contexts = 0;
class AudioContext {
    constructor() { contexts++; this.sampleRate = 48000; this.state = 'suspended'; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createBuffer(channels, length) {
        const data = new Float32Array(length);
        const buffer = { getChannelData: () => data };
        buffers.push(buffer); return buffer;
    }
    createBufferSource() {
        const source = { connect() {}, disconnect() { this.disconnected = true; }, start() { this.started = true; } };
        sources.push(source); return source;
    }
}
const window = { AudioContext, addEventListener: (name, fn) => listeners[name] = fn };
vm.runInNewContext(fs.readFileSync('client/sound.js', 'utf8'), { window });
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
console.log('Synthesized SE passed: all effects, gesture unlock, cached buffers, bounded volume and voice limit');
