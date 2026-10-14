const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const weapon=process.argv[2] || 'pistol', gain=weapon==='sniper'?.45:.35;
const stem=weapon+'_shot', key=weapon==='sniper'?'coreAudioSniperWav':'coreAudioPistolWav';
const source=fs.readFileSync('client/sound.js','utf8');
const wav=fs.readFileSync('client/assets/sounds/'+stem+'.wav');
const bundle=fs.readFileSync('client/assets/sounds/'+stem+'.js','utf8');
const assetWindow={};vm.runInNewContext(bundle,{window:assetWindow});
assert.equal(Buffer.from(assetWindow[key],'base64').compare(wav),0,'Local-file bundle is byte-identical to the original WAV');
assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');
assert.equal(wav.readUInt16LE(20),1);assert.equal(wav.readUInt16LE(22),1);assert.equal(wav.readUInt32LE(24),48000);assert.equal(wav.readUInt16LE(34),16);
assert.equal(wav.readUInt32LE(40)/wav.readUInt32LE(28),weapon==='sniper'?1.8:.46,'Bundled sample has the intended duration');
if(weapon==='sniper') {
 const pcm=Array.from({length:(wav.length-44)/2},(_,i)=>wav.readInt16LE(44+i*2)/32767);
 assert.equal(pcm[0],0);assert.equal(pcm.at(-1),0,'Release ends at zero to avoid clicks');
 const peak=pcm.reduce((max,v)=>Math.max(max,Math.abs(v)),0);
 assert(Math.abs(20*Math.log10(peak)+1.5)<.01,'Processed peak has headroom');
 const energy=(a,b)=>pcm.slice(a,b).reduce((sum,v)=>sum+v*v,0)/(b-a);
 assert(energy(0,4800)>energy(pcm.length-4800,pcm.length)*100,'Long report decays into a quiet tail');
 assert(pcm.slice(0,480).some(v=>Math.abs(v)>.05),'Shot starts within 10ms');
 const crypto=require('node:crypto');
 assert.equal(crypto.createHash('sha256').update(wav.subarray(44,44+26400*2)).digest('hex'),
  '16317a195d1ab3c9feb11d5b03340d4b720068b7f9ba9d7c2bddd77ec8cb5a42',
  'First 550ms preserves the original gunshot exactly');
 const parts=[['sniper_bolt.wav',.55,-10],['sniper_casing.wav',.90,-15]].map(([file,offset,db])=>{
  const data=fs.readFileSync('client/assets/sounds/'+file);
  assert.equal(data.readUInt32LE(24),48000);assert.equal(data.readUInt16LE(22),1);assert.equal(data.readUInt16LE(34),16);
  const samples=Array.from({length:(data.length-44)/2},(_,i)=>data.readInt16LE(44+i*2)/32767);
  assert(samples.length>48000*.65 && samples.length<48000*.8,'Mechanism retains its rhythm and removes trailing silence');
  assert.equal(samples[0],0);assert.equal(samples.at(-1),0);
  const peak=samples.reduce((max,v)=>Math.max(max,Math.abs(v)),0);
  assert(Math.abs(20*Math.log10(peak)-db)<.01,'Mechanical details stay below the gunshot');
  return {samples,start:Math.round(offset*48000)};
 });
 // Correctly aligned component subtraction leaves only the quiet gunshot tail.
 // Shifting either component by 20ms must leave substantially more energy.
 function residual(shiftPart,shifted) {
  let sum=0;
  for(let i=parts[shiftPart].start;i<pcm.length;i++) {
   let value=pcm[i];
   parts.forEach((part,index)=>{value-=part.samples[i-part.start-(shifted && index===shiftPart?960:0)] || 0;});
   sum+=value*value;
  }
  return sum;
 }
 assert(residual(0,true)>residual(0,false)*1.5,'Bolt is mixed at 550ms');
 assert(residual(1,true)>residual(1,false)*1.5,'Casing is mixed at 900ms');
}
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
 const fetch=url=>{if(!url.endsWith(stem+'.wav'))return Promise.resolve({ok:false});assert(!local,'file:// playback must never depend on fetch');requests.push(url);return mode==='network-fail'?Promise.reject(Error('offline')):new Promise(resolve=>finish=()=>resolve({ok:mode!=='http-fail',arrayBuffer:async()=>wav.buffer.slice(wav.byteOffset,wav.byteOffset+wav.length)}));};
 if(mode==='embedded')vm.runInNewContext(bundle,{window});
 const document={currentScript:{src:local?'file:///D:/td/td-dev-pistolwav/client/sound.js':'https://game.test/client/sound.js'},createElement:()=>({}),head:{append(script){if(!script.src.endsWith(stem+'.js')){script.onerror();return;}scripts.push(script.src);finishScript=()=>{if(mode==='file-fail')script.onerror();else{vm.runInNewContext(bundle,{window});script.onload();}};}}};
 vm.runInNewContext(source,{window,fetch,URL,atob:b64=>Buffer.from(b64,'base64').toString('binary'),document,localStorage:{getItem:()=>null,setItem(){}}});
 return {window,decoded,sources,listeners,requests,scripts,finish:()=>{finish?.();finishScript?.();},contexts:()=>contexts,decodes:()=>decodes};
}
(async()=>{
 const game=setup();assert.deepEqual(game.requests,['https://game.test/client/assets/sounds/'+stem+'.wav']);assert.equal(game.scripts.length,0,'Published HTTP game never downloads the local-file bundle');assert.equal(game.contexts(),0,'Preloading bytes does not open an audio context');
 game.window.coreAudio.play(weapon);assert.equal(game.sources.length,0,'Gesture unlock is still required');
 game.listeners.pointerdown();game.window.coreAudio.play(weapon);assert(!game.sources.at(-1).buffer.sample,'Pending download plays fallback immediately');game.sources.at(-1).onended();
 const ready=game.window.coreAudio.preloadSamples(weapon);game.finish();assert.equal(await ready,true);assert.equal(game.sources.length,1,'Loading does not replay a past shot');
 for(let i=0;i<5;i++)game.listeners.keydown();await game.window.coreAudio.preloadSamples(weapon);assert.equal(game.decodes(),1);assert.equal(game.requests.length,1,'Gestures and firing reuse one fetch/decode');
 const voice=game.window.coreAudio.play(weapon);assert.equal(game.sources.at(-1).buffer,game.decoded);assert.equal(game.sources.at(-1).output.gain.value,gain);
 voice.setDistance(300);assert.equal(game.sources.at(-1).output.gain.value,gain*.25,'Sample gain survives distance updates');
 const master=game.sources.at(-1).output.output;game.window.coreAudio.setVolume(.2);assert.equal(master.gain.value,.2);voice.stop();
 game.window.coreAudio.play(weapon,300);assert.equal(game.sources.at(-1).output.gain.value,gain*.25);game.sources.at(-1).onended();
 game.window.coreAudio.setVolume(0);const muted=game.sources.length;game.window.coreAudio.play(weapon);assert.equal(game.sources.length,muted);game.window.coreAudio.setVolume(1);
 for(let i=0;i<12;i++)game.window.coreAudio.play(weapon);assert.equal(game.sources.length,muted+8,'Sample still respects eight-voice limit');
 assert(game.sources.slice(-8).every(s=>s.buffer===game.decoded),'Every repeated shot shares decoded data');
 for(const mode of ['embedded','file']){
  const local=setup(mode);local.listeners.pointerdown();const ready=local.window.coreAudio.preloadSamples(weapon);local.finish();assert.equal(await ready,true);local.window.coreAudio.play(weapon);
  assert.equal(local.requests.length,0);assert.equal(local.sources.at(-1).buffer,local.decoded,'file:// shots play the supplied WAV');
  if(mode==='file')assert.deepEqual(local.scripts,['file:///D:/td/td-dev-pistolwav/client/assets/sounds/'+stem+'.js']);
 }
 for(const mode of ['http-fail','network-fail','decode-fail','file-fail']){
  const fail=setup(mode);fail.listeners.pointerdown();fail.finish();await fail.window.coreAudio.preloadSamples(weapon);fail.window.coreAudio.play(weapon);
  assert(fail.sources.at(-1).started);assert(!fail.sources.at(-1).buffer.sample,mode+' falls back without a delayed shot');
 }
 console.log(weapon+' WAV passed: identical bytes over HTTP/file, script-relative URLs, no extra HTTP bundle, one fetch/decode, fallback, shared sample, volume/distance/mute, voice limit and failures');
})().catch(error=>{console.error(error);process.exitCode=1;});
