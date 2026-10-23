// Same-origin PCM transcription. Audio lives in memory; model work stays off the HTTP thread.
const fs=require('node:fs'),path=require('node:path'),{Worker}=require('node:worker_threads');
const MAX_SECONDS=180,SAMPLE_RATE=16000;
const fail=(message,status=400)=>Object.assign(Error(message),{status});
function decodeAudio(body){
 if(body?.sampleRate!==SAMPLE_RATE||typeof body.pcm16!=='string'||!body.pcm16.length||body.pcm16.length>7680000||body.pcm16.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.pcm16))throw fail('录音格式不正确，请重新录音。');
 const audio=Buffer.from(body.pcm16,'base64');if(audio.toString('base64')!==body.pcm16||audio.length%2||audio.length<6400||audio.length>SAMPLE_RATE*2*MAX_SECONDS)throw fail('录音时长需在 0.2 秒至 3 分钟之间。');
 let square=0,peak=0;for(let i=0;i<audio.length;i+=2){const n=audio.readInt16LE(i)/32768;square+=n*n;peak=Math.max(peak,Math.abs(n));}
 if(peak<.008||Math.sqrt(square/(audio.length/2))<.001)throw fail('没有听到清晰的人声，请靠近麦克风重新录音。',422);
 return Uint8Array.from(audio);
}
function createVoiceService(modelDir,{workerFactory=(file,options)=>new Worker(file,options),timeoutMs=90000}={}){
 let worker=null,ready=false,serial=0,running=null,closed=false,retiring=false;const queue=[],owners=new Set();
 function status(){let installed=false;try{installed=fs.statSync(path.join(modelDir,'model.int8.onnx')).size>100000000&&fs.statSync(path.join(modelDir,'tokens.txt')).size>1000;require.resolve('sherpa-onnx-node');}catch{}return {enabled:installed&&!closed,maxSeconds:MAX_SECONDS,engine:'local-sensevoice'};}
 function finish(job,error,text){if(job.done)return;job.done=true;clearTimeout(job.timer);job.signal?.removeEventListener('abort',job.cancel);owners.delete(job.owner);error?job.reject(error):job.resolve({text,durationSeconds:job.audio.length/2/SAMPLE_RATE});}
 function reset(error,retry=true){const old=worker;worker=null;ready=false;if(running){finish(running,error);running=null;}if(old){retiring=true;Promise.resolve().then(()=>old.terminate()).catch(()=>{}).finally(()=>{retiring=false;pump();});}retry?pump():rejectQueue();}
 function pump(){
  if(closed||retiring||running||!queue.length)return;
  if(!worker){try{worker=workerFactory(path.join(__dirname,'voice-worker.js'),{workerData:{modelDir}});}catch{return rejectQueue();}const current=worker;
   current.on('message',m=>{if(worker!==current)return;if(m.ready){ready=true;pump();return;}if(!running||m.id!==running.id)return;const job=running;running=null;if(m.error)finish(job,fail('语音识别未完成，请重试本段录音。',502));else if(typeof m.text!=='string'||!m.text.trim())finish(job,fail('没有识别到清晰的语音，请重新录音。',422));else if(m.text.length>12000)finish(job,fail('本段语音过长，请分段作答。',422));else finish(job,null,m.text.trim());pump();});
   current.on('error',()=>{if(worker===current){reset(fail('语音识别暂时不可用，请重试。',503),false);}});current.on('exit',()=>{if(worker===current)reset(fail('语音识别连接已中断，请重试。',503),false);});return;
  }
  if(!ready)return;running=queue.shift();worker.postMessage({id:running.id,audio:running.audio});
 }
 function rejectQueue(){while(queue.length)finish(queue.shift(),fail('语音识别尚未启用，请联系管理员。',503));}
 function transcribe(body,owner,signal){
  if(!status().enabled)throw fail('语音识别尚未启用，请联系管理员。',503);
  if(owners.has(owner)||queue.length+(running?1:0)>=3)throw fail('语音识别正在处理，请稍后重试。',429);
  const audio=decodeAudio(body);if(signal?.aborted)throw fail('本段转写已取消。',499);
  return new Promise((resolve,reject)=>{const job={id:++serial,audio,owner,signal,resolve,reject,done:false};owners.add(owner);job.cancel=()=>{const index=queue.indexOf(job);if(index>=0)queue.splice(index,1);if(running===job)reset(fail('本段转写已取消。',499));else finish(job,fail('本段转写已取消。',499));};job.timer=setTimeout(()=>{const index=queue.indexOf(job);if(index>=0)queue.splice(index,1);if(running===job)reset(fail('语音转写超时，录音仍可重试。',504));else finish(job,fail('语音转写超时，录音仍可重试。',504));},timeoutMs);signal?.addEventListener('abort',job.cancel,{once:true});queue.push(job);pump();});
 }
 function close(){closed=true;const error=fail('语音识别已停止。',503);if(running)finish(running,error);running=null;while(queue.length)finish(queue.shift(),error);const old=worker;worker=null;old?.terminate();}
 return {status,transcribe,close};
}
module.exports={createVoiceService,decodeAudio,MAX_SECONDS,SAMPLE_RATE};
