const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {createVoiceService,decodeAudio}=require('../voice-service');
const sound=(seconds=1)=>{const data=Buffer.alloc(32000*seconds);for(let i=0;i<data.length/2;i++)data.writeInt16LE(Math.round(Math.sin(i*.1)*4000),i*2);return {sampleRate:16000,pcm16:data.toString('base64')};};
function fixture(factory,timeoutMs=1000){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zm-voice-contract-'));fs.closeSync(fs.openSync(path.join(dir,'model.int8.onnx'),'w'));fs.truncateSync(path.join(dir,'model.int8.onnx'),100000001);fs.writeFileSync(path.join(dir,'tokens.txt'),'a'.repeat(1001));const service=createVoiceService(dir,{workerFactory:factory,timeoutMs});return {dir,service,close(){service.close();fs.rmSync(dir,{recursive:true,force:true});}};}
class FakeWorker extends EventEmitter{constructor(){super();queueMicrotask(()=>this.emit('message',{ready:true}));}postMessage(m){setTimeout(()=>this.emit('message',{id:m.id,text:'我整理需求并核对交付。'}),5);}terminate(){}}
test('voice PCM validates exact encoding, duration, sample rate and silence before recognition',()=>{
 assert.equal(decodeAudio(sound()).length,32000);for(const body of [{}, {...sound(),sampleRate:48000},{...sound(),pcm16:'not audio'}, {...sound(),pcm16:'YQ=='},sound(181),{sampleRate:16000,pcm16:Buffer.alloc(32000).toString('base64')}])assert.throws(()=>decodeAudio(body),/录音|人声/);
});
test('voice worker reuses one engine, isolates concurrent owners and returns the original duration',async()=>{
 let starts=0;const f=fixture(()=>{starts++;return new FakeWorker();});try{const a=f.service.transcribe(sound(),'a');assert.throws(()=>f.service.transcribe(sound(),'a'),e=>e.status===429);const b=f.service.transcribe(sound(2),'b');assert.deepEqual((await a).text,'我整理需求并核对交付。');assert.equal((await b).durationSeconds,2);assert.equal(starts,1);}finally{f.close();}
});
test('voice cancellation and timeouts reject without saving audio or stranding the owner',async()=>{
 class Stuck extends FakeWorker{postMessage(){}}
 const f=fixture(()=>new Stuck());try{const controller=new AbortController(),pending=f.service.transcribe(sound(),'a',controller.signal);await new Promise(setImmediate);controller.abort();await assert.rejects(pending,e=>e.status===499);assert.deepEqual(fs.readdirSync(f.dir).sort(),['model.int8.onnx','tokens.txt']);}finally{f.close();}const timeout=fixture(()=>new Stuck(),25);try{await assert.rejects(timeout.service.transcribe(sound(),'a'),e=>e.status===504);}finally{timeout.close();}
});
test('missing or failed voice engine is explicit and never starts an infinite worker retry loop',async()=>{
 const absent=createVoiceService(path.join(os.tmpdir(),'missing-voice-model-'+Date.now()));try{assert.equal(absent.status().enabled,false);assert.throws(()=>absent.transcribe(sound(),'a'),e=>e.status===503);}finally{absent.close();}
 let starts=0;const f=fixture(()=>{starts++;const w=new EventEmitter();w.terminate=()=>{};queueMicrotask(()=>w.emit('error',Error('engine failure')));return w;});try{await assert.rejects(f.service.transcribe(sound(),'a'),e=>e.status===503);await new Promise(r=>setTimeout(r,10));assert.equal(starts,1);}finally{f.close();}
});
test('cancelled native workers must exit before another engine can be started',async()=>{
 let starts=0,release;class SlowExit extends FakeWorker{postMessage(){}terminate(){return new Promise(r=>release=r);}}
 const f=fixture(()=>++starts===1?new SlowExit():new FakeWorker());try{const controller=new AbortController(),first=f.service.transcribe(sound(),'a',controller.signal);await new Promise(setImmediate);controller.abort();await assert.rejects(first,e=>e.status===499);const second=f.service.transcribe(sound(),'b');await new Promise(setImmediate);assert.equal(starts,1);release();assert.equal((await second).text,'我整理需求并核对交付。');assert.equal(starts,2);}finally{f.close();}
});
