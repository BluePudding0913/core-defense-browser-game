const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('client/sound.js','utf8');
const wav=fs.readFileSync('client/assets/sounds/pistol_shot.wav');
assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');
assert.equal(wav.readUInt16LE(20),1);assert.equal(wav.readUInt16LE(22),1);assert.equal(wav.readUInt32LE(24),48000);assert.equal(wav.readUInt16LE(34),16);
assert.equal(wav.readUInt32LE(40)/wav.readUInt32LE(28),.46,'Bundled source is the 460ms reference sample');
function setup(mode='ok') {
 const sources=[],listeners={},requests=[];let contexts=0,decodes=0,finish;
 const decoded={sample:true};
 class AudioContext {
  constructor(){contexts++;this.state='suspended';this.sampleRate=48000;}
  resume(){this.state='running';return Promise.resolve();}
  createGain(){return {gain:{value:1},connect(node){this.output=node;},disconnect(){}};}
  createBuffer(_,length){const data=new Float32Array(length);return {getChannelData:()=>data};}
  createBufferSource(){const s={connect(node){this.output=node;},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;this.onended?.();}};sources.push(s);return s;}
  decodeAudioData(bytes){decodes++;assert.equal(Buffer.from(bytes).compare(wav),0,'Decoder receives the actual reference WAV');return mode==='decode-fail'?Promise.reject(Error('bad sample')):Promise.resolve(decoded);}
 }
 const window={AudioContext,addEventListener:(name,handler)=>listeners[name]=handler};
 const fetch=url=>{requests.push(url);return mode==='network-fail'?Promise.reject(Error('offline')):new Promise(resolve=>finish=()=>resolve({ok:mode!=='http-fail',arrayBuffer:async()=>wav.buffer.slice(wav.byteOffset,wav.byteOffset+wav.length)}));};
 vm.runInNewContext(source,{window,fetch,URL,document:{currentScript:{src:'https://game.test/client/sound.js'}},localStorage:{getItem:()=>null,setItem(){}}});
 return {window,decoded,sources,listeners,requests,finish:()=>finish?.(),contexts:()=>contexts,decodes:()=>decodes};
}
(async()=>{
 const game=setup();assert.deepEqual(game.requests,['https://game.test/client/assets/sounds/pistol_shot.wav']);assert.equal(game.contexts(),0,'Preloading bytes does not open an audio context');
 game.window.coreAudio.play('pistol');assert.equal(game.sources.length,0,'Gesture unlock is still required');
 game.listeners.pointerdown();game.window.coreAudio.play('pistol');assert(!game.sources.at(-1).buffer.sample,'Pending download plays fallback immediately');game.sources.at(-1).onended();
 const ready=game.window.coreAudio.preloadSamples();game.finish();await ready;
 for(let i=0;i<5;i++)game.listeners.keydown();await game.window.coreAudio.preloadSamples();assert.equal(game.decodes(),1);assert.equal(game.requests.length,1,'Gestures and firing reuse one fetch/decode');
 const voice=game.window.coreAudio.play('pistol');assert.equal(game.sources.at(-1).buffer,game.decoded);assert.equal(game.sources.at(-1).output.gain.value,.35);
 voice.setDistance(300);assert.equal(game.sources.at(-1).output.gain.value,.35*.25,'Sample gain survives distance updates');
 const master=game.sources.at(-1).output.output;game.window.coreAudio.setVolume(.2);assert.equal(master.gain.value,.2);voice.stop();
 game.window.coreAudio.play('pistol',300);assert.equal(game.sources.at(-1).output.gain.value,.35*.25);game.sources.at(-1).onended();
 game.window.coreAudio.setVolume(0);const muted=game.sources.length;game.window.coreAudio.play('pistol');assert.equal(game.sources.length,muted);game.window.coreAudio.setVolume(1);
 for(let i=0;i<12;i++)game.window.coreAudio.play('pistol');assert.equal(game.sources.length,muted+8,'Sample still respects eight-voice limit');
 assert(game.sources.slice(-8).every(s=>s.buffer===game.decoded),'Every repeated shot shares decoded data');
 for(const mode of ['http-fail','network-fail','decode-fail']){
  const fail=setup(mode);fail.listeners.pointerdown();fail.finish();await fail.window.coreAudio.preloadSamples();fail.window.coreAudio.play('pistol');
  assert(fail.sources.at(-1).started);assert(!fail.sources.at(-1).buffer.sample,mode+' falls back without a delayed shot');
 }
 console.log('Pistol WAV passed: actual asset, script-relative URL, one fetch/decode, immediate fallback, shared sample, volume/distance/mute, voice limit and network/decode failures');
})().catch(error=>{console.error(error);process.exitCode=1;});
