const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('client/sound.js','utf8');
const wav=fs.readFileSync('client/assets/sounds/pistol_shot.wav');
const bundle=fs.readFileSync('client/assets/sounds/pistol_shot.js','utf8');
const assetWindow={};vm.runInNewContext(bundle,{window:assetWindow});
assert.equal(Buffer.from(assetWindow.coreAudioPistolWav,'base64').compare(wav),0,'Local-file bundle is byte-identical to the original WAV');
assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');
assert.equal(wav.readUInt16LE(20),1);assert.equal(wav.readUInt16LE(22),1);assert.equal(wav.readUInt32LE(24),48000);assert.equal(wav.readUInt16LE(34),16);
assert.equal(wav.readUInt32LE(40)/wav.readUInt32LE(28),.46,'Bundled source is the 460ms reference sample');
function setup(mode='ok') {
 const sources=[],listeners={},requests=[],scripts=[];let contexts=0,decodes=0,finish,finishScript;
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
 const local=mode==='embedded'||mode==='file'||mode==='file-fail';
 const fetch=url=>{assert(!local,'file:// playback must never depend on fetch');requests.push(url);return mode==='network-fail'?Promise.reject(Error('offline')):new Promise(resolve=>finish=()=>resolve({ok:mode!=='http-fail',arrayBuffer:async()=>wav.buffer.slice(wav.byteOffset,wav.byteOffset+wav.length)}));};
 if(mode==='embedded')vm.runInNewContext(bundle,{window});
 const document={currentScript:{src:local?'file:///D:/td/td-dev-pistolwav/client/sound.js':'https://game.test/client/sound.js'},createElement:()=>({}),head:{append(script){scripts.push(script.src);finishScript=()=>{if(mode==='file-fail')script.onerror();else{vm.runInNewContext(bundle,{window});script.onload();}};}}};
 vm.runInNewContext(source,{window,fetch,URL,atob:b64=>Buffer.from(b64,'base64').toString('binary'),document,localStorage:{getItem:()=>null,setItem(){}}});
 return {window,decoded,sources,listeners,requests,scripts,finish:()=>{finish?.();finishScript?.();},contexts:()=>contexts,decodes:()=>decodes};
}
(async()=>{
 const game=setup();assert.deepEqual(game.requests,['https://game.test/client/assets/sounds/pistol_shot.wav']);assert.equal(game.scripts.length,0,'Published HTTP game never downloads the local-file bundle');assert.equal(game.contexts(),0,'Preloading bytes does not open an audio context');
 game.window.coreAudio.play('pistol');assert.equal(game.sources.length,0,'Gesture unlock is still required');
 game.listeners.pointerdown();game.window.coreAudio.play('pistol');assert(!game.sources.at(-1).buffer.sample,'Pending download plays fallback immediately');game.sources.at(-1).onended();
 const ready=game.window.coreAudio.preloadSamples();game.finish();assert.equal(await ready,true);
 for(let i=0;i<5;i++)game.listeners.keydown();await game.window.coreAudio.preloadSamples();assert.equal(game.decodes(),1);assert.equal(game.requests.length,1,'Gestures and firing reuse one fetch/decode');
 const voice=game.window.coreAudio.play('pistol');assert.equal(game.sources.at(-1).buffer,game.decoded);assert.equal(game.sources.at(-1).output.gain.value,.35);
 voice.setDistance(300);assert.equal(game.sources.at(-1).output.gain.value,.35*.25,'Sample gain survives distance updates');
 const master=game.sources.at(-1).output.output;game.window.coreAudio.setVolume(.2);assert.equal(master.gain.value,.2);voice.stop();
 game.window.coreAudio.play('pistol',300);assert.equal(game.sources.at(-1).output.gain.value,.35*.25);game.sources.at(-1).onended();
 game.window.coreAudio.setVolume(0);const muted=game.sources.length;game.window.coreAudio.play('pistol');assert.equal(game.sources.length,muted);game.window.coreAudio.setVolume(1);
 for(let i=0;i<12;i++)game.window.coreAudio.play('pistol');assert.equal(game.sources.length,muted+8,'Sample still respects eight-voice limit');
 assert(game.sources.slice(-8).every(s=>s.buffer===game.decoded),'Every repeated shot shares decoded data');
 for(const mode of ['embedded','file']){
  const local=setup(mode);local.listeners.pointerdown();const ready=local.window.coreAudio.preloadSamples();local.finish();assert.equal(await ready,true);local.window.coreAudio.play('pistol');
  assert.equal(local.requests.length,0);assert.equal(local.sources.at(-1).buffer,local.decoded,'file:// shots play the supplied WAV');
  if(mode==='file')assert.deepEqual(local.scripts,['file:///D:/td/td-dev-pistolwav/client/assets/sounds/pistol_shot.js']);
 }
 for(const mode of ['http-fail','network-fail','decode-fail','file-fail']){
  const fail=setup(mode);fail.listeners.pointerdown();fail.finish();await fail.window.coreAudio.preloadSamples();fail.window.coreAudio.play('pistol');
  assert(fail.sources.at(-1).started);assert(!fail.sources.at(-1).buffer.sample,mode+' falls back without a delayed shot');
 }
 console.log('Pistol WAV passed: identical bytes over HTTP/file, script-relative URLs, no extra HTTP bundle, one fetch/decode, fallback, shared sample, volume/distance/mute, voice limit and failures');
})().catch(error=>{console.error(error);process.exitCode=1;});
