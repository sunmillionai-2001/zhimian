const {parentPort,workerData}=require('node:worker_threads'),path=require('node:path'),sherpa=require('sherpa-onnx-node');
const recognizer=new sherpa.OfflineRecognizer({featConfig:{sampleRate:16000,featureDim:80},modelConfig:{senseVoice:{model:path.join(workerData.modelDir,'model.int8.onnx'),language:'zh',useInverseTextNormalization:1},tokens:path.join(workerData.modelDir,'tokens.txt'),numThreads:2,provider:'cpu'}});
parentPort.postMessage({ready:true});
parentPort.on('message',({id,audio})=>{
 try{
  const raw=new DataView(audio.buffer,audio.byteOffset,audio.byteLength),samples=new Float32Array(audio.length/2);for(let i=0;i<samples.length;i++)samples[i]=raw.getInt16(i*2,true)/32768;
  const text=[];let start=0;
  while(start<samples.length){
   let end=Math.min(start+480000,samples.length);
   // Prefer a quiet boundary near 30 seconds instead of chopping a word in half.
   if(end<samples.length){let best=Infinity;const limit=end;for(let at=limit-32000;at<limit;at+=1600){let energy=0;for(let n=at;n<at+1600;n++)energy+=samples[n]*samples[n];if(energy<best){best=energy;end=at+800;}}}
   const stream=recognizer.createStream();stream.acceptWaveform({samples:samples.subarray(start,end),sampleRate:16000});recognizer.decode(stream);const result=recognizer.getResult(stream).text.replace(/<\|[^|]*\|>/g,'').trim();if(result)text.push(result);start=end;
  }
  parentPort.postMessage({id,text:text.join('')});
 }catch{parentPort.postMessage({id,error:true});}
});
