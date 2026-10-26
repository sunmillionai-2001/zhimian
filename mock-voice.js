// Microphone capture + same-origin transcription. Never uses browser cloud recognition.
window.MockVoice=(()=>{
 let active=null;
 const ids=['mockNext','mockSkip','mockAiEvaluate','mockAiFollowUp','mockRetryEvaluate','mockBeginRetry','formalNext','formalSkip','formalEnd','formalPause','formalClarify','formalUnknown','mockRoomBack','mockRoomContinue','mockRoomTools','mockSave','coachingEvaluate'];
 const key=options=>JSON.stringify(options.context());
 const valid=s=>active===s&&!s.controller.signal.aborted&&s.target.isConnected&&!s.disclosures.some(d=>!d.open)&&key(s.options)===s.context;
 function lock(s){
  s.fields=new Map();for(const el of new Set([s.target,...['mockA','mockFollowUpAnswer','mockRetryAnswer'].map(id=>document.getElementById(id)),...document.querySelectorAll('[data-report-retry-input]')]))if(el){s.fields.set(el,el.readOnly);el.readOnly=true;}s.locks=new Map();
  for(const el of [...ids.map(id=>document.getElementById(id)),...document.querySelectorAll('[data-voice],[data-report-retry-evaluate],[data-answer-record],[data-interview-repeat],[data-report-control],[data-practice-unanswered]')])if(el&&el!==s.button){s.locks.set(el,el.disabled);el.disabled=true;}
 }
 function unlock(s){if(s.locks){for(const [el,disabled]of s.locks)if(el.isConnected)el.disabled=disabled;s.locks=null;for(const [el,readOnly]of s.fields)if(el.isConnected)el.readOnly=readOnly;s.fields=null;}}
 function closeAudio(s){clearInterval(s.timer);s.stream?.getTracks().forEach(t=>t.stop());try{s.node?.disconnect();s.source?.disconnect();s.gain?.disconnect();}catch{}if(s.audioContext&&s.audioContext.state!=='closed')s.audioContext.close().catch(()=>{});}
 function stop(){const s=active;if(!s)return;active=null;s.observer?.disconnect();s.controller.abort();closeAudio(s);unlock(s);s.chunks=[];s.audio=null;s.pendingText=null;if(s.button.isConnected){s.button.disabled=false;s.button.textContent='语音作答';s.cancel.hidden=true;s.notice.textContent='本段录音已取消，原回答保留。';}}
 async function pcm(s){
  const length=Math.min(s.frames,s.sampleRate*s.maxSeconds),input=new Float32Array(length);let at=0;
  for(const part of s.chunks){if(at===length)break;const n=Math.min(part.length,length-at);input.set(part.subarray(0,n),at);at+=n;}
  if(length/s.sampleRate<.2)throw Error('录音太短，请重新录音后再转写。');
  let samples=input;
  if(s.sampleRate!==16000){const context=new OfflineAudioContext(1,Math.floor(length*16000/s.sampleRate),16000),buffer=context.createBuffer(1,length,s.sampleRate);buffer.copyToChannel(input,0);const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);source.start();samples=(await context.startRendering()).getChannelData(0);}
  const bytes=new Uint8Array(samples.length*2),view=new DataView(bytes.buffer);for(let i=0;i<samples.length;i++)view.setInt16(i*2,Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),true);
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);
 }
 function append(s,text){
  if(!valid(s))return;if(s.options.blocked())throw Error('请等待当前操作结束后再重试转写。');
  const next=s.target.value+(s.target.value?'\n':'')+text;if(next.length>(s.target.maxLength>0?s.target.maxLength:12000))throw Error('加上本段语音后超过回答字数上限，请先精简原回答，再点击重试。');
  s.target.value=next;s.target.dispatchEvent(new Event('input',{bubbles:true}));active=null;s.observer?.disconnect();unlock(s);s.chunks=[];s.audio=null;s.pendingText=null;s.button.disabled=false;s.button.textContent='语音作答';s.cancel.hidden=true;s.notice.textContent='已转写并填入回答，请核对文字后再提交。';s.target.focus({preventScroll:true});
 }
 async function transcribe(s){
  if(!valid(s))return;lock(s);s.phase='transcribing';s.button.disabled=true;s.button.textContent='正在转写…';s.cancel.hidden=false;s.cancel.textContent='取消转写';s.notice.textContent='正在识别本段语音，原回答保留…';
  try{
   let text=s.pendingText;
   if(!text){const response=await fetch('/api/voice/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sampleRate:16000,pcm16:s.audio}),signal:AbortSignal.any([s.controller.signal,AbortSignal.timeout(100000)])});let data;try{data=await response.json();}catch{throw Error('语音识别响应异常，请重试。');}if(!response.ok)throw Error(data.error||'语音转写失败，请重试。');if(typeof data.text!=='string'||!data.text.trim())throw Error('没有识别到清晰的语音，请重新录音。');text=s.pendingText=data.text.trim();}
   append(s,text);
  }catch(e){if(!valid(s))return;unlock(s);s.phase='retry';s.button.disabled=false;s.button.textContent='重试转写';s.cancel.textContent='取消本段';s.notice.textContent=(e.name==='TimeoutError'?'语音转写超时。':e.message==='Failed to fetch'?'暂时连不上工作台。':e.message)+' 录音保留在当前页，可重试；原回答未改变。';}
 }
 async function finish(s){
  if(!valid(s)||s.phase!=='recording')return;s.phase='stopping';clearInterval(s.timer);s.button.disabled=true;s.button.textContent='正在结束录音…';
  try{
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('录音未能正常结束，请重新录音。')),2000);s.flushed=()=>{clearTimeout(timer);resolve();};s.node.port.postMessage('flush');});
   closeAudio(s);if(!valid(s))return;s.audio=await pcm(s);s.chunks=[];unlock(s);if(valid(s))await transcribe(s);
  }catch(e){if(!valid(s))return;closeAudio(s);active=null;s.observer?.disconnect();unlock(s);s.button.disabled=false;s.button.textContent='语音作答';s.cancel.hidden=true;s.notice.textContent=e.message+' 原回答保留。';}
 }
 async function begin(target,button,cancel,notice,options){
  if(active||options.blocked())return;
  const disclosures=[];for(let el=target.parentElement;el;el=el.parentElement)if(el.tagName==='DETAILS')disclosures.push(el);
  const s={target,button,cancel,notice,options,disclosures,context:key(options),controller:new AbortController(),phase:'starting',chunks:[],frames:0};active=s;lock(s);s.observer=new MutationObserver(()=>{if(active===s&&(!target.isConnected||disclosures.some(d=>!d.open)))stop();});s.observer.observe(document.getElementById('mockStage'),{childList:true,subtree:true,attributes:true,attributeFilter:['open']});button.disabled=true;cancel.hidden=false;cancel.textContent='取消';notice.textContent='正在准备语音作答…';
  try{
   const response=await fetch('/api/voice/status',{signal:AbortSignal.any([s.controller.signal,AbortSignal.timeout(12000)])});const status=await response.json();if(!response.ok||!status.enabled)throw Error(status.error||'语音识别尚未启用，请联系管理员。');s.maxSeconds=Math.min(status.maxSeconds||180,180);
   s.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});if(!valid(s)){closeAudio(s);return;}
   const Context=window.AudioContext||window.webkitAudioContext;try{s.audioContext=new Context({sampleRate:16000});}catch{s.audioContext=new Context();}await s.audioContext.resume();await s.audioContext.audioWorklet.addModule('/voice-recorder-worklet.js');if(!valid(s)){closeAudio(s);return;}
   s.sampleRate=s.audioContext.sampleRate;s.node=new AudioWorkletNode(s.audioContext,'zhimian-recorder');s.node.port.onmessage=e=>{if(!valid(s))return;if(e.data.samples){s.chunks.push(e.data.samples);s.frames+=e.data.samples.length;if(s.frames>=s.sampleRate*s.maxSeconds&&s.phase==='recording')finish(s);}if(e.data.done)s.flushed?.();};
   s.source=s.audioContext.createMediaStreamSource(s.stream);s.gain=s.audioContext.createGain();s.gain.gain.value=0;s.source.connect(s.node);s.node.connect(s.gain);s.gain.connect(s.audioContext.destination);s.phase='recording';s.started=Date.now();button.disabled=false;button.textContent='停止并转写';cancel.textContent='取消录音';
   const tick=()=>{const seconds=Math.floor((Date.now()-s.started)/1000);notice.textContent='正在录音 '+String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')+'，说完后点击「停止并转写」。';if(seconds>=s.maxSeconds)finish(s);};tick();s.timer=setInterval(tick,250);
  }catch(e){closeAudio(s);if(!valid(s))return;active=null;s.observer?.disconnect();unlock(s);button.disabled=false;cancel.hidden=true;notice.textContent=(({'NotAllowedError':'麦克风权限未允许，请在浏览器地址栏开启麦克风后重试。','NotFoundError':'没有找到麦克风，请连接设备后重试。','NotReadableError':'麦克风正被其他程序占用，请关闭占用后重试。'})[e.name]||(e.name==='TimeoutError'?'连接工作台超时，请重试。':e.message==='Failed to fetch'?'暂时连不上工作台，请检查本地服务。':e.message))+' 原回答保留。';}
 }
 function mount(target,host,options){
  if(active?.target===target)stop();
  host.innerHTML='<div class="paste-actions"><button type="button" class="btn btn-ghost" data-voice>语音作答</button><button type="button" class="btn btn-ghost" data-voice-cancel hidden>取消录音</button></div><p class="mock-note" role="status" aria-live="polite" data-voice-status></p>';
  const button=host.querySelector('[data-voice]'),cancel=host.querySelector('[data-voice-cancel]'),notice=host.querySelector('[data-voice-status]');
  const supported=!!(window.isSecureContext&&navigator.mediaDevices?.getUserMedia&&(window.AudioContext||window.webkitAudioContext)&&window.AudioWorkletNode);button.disabled=!supported;notice.textContent=supported?'说完后停止转写，文字会追加到回答中；每段最多 3 分钟。':'当前环境无法录音，请使用 HTTPS 或本机地址打开，并允许麦克风。';
  button.onclick=()=>{if(options.blocked()||target.disabled)return;if(active){if(active.button!==button)return;if(active.phase==='recording')finish(active);else if(active.phase==='retry')transcribe(active);return;}begin(target,button,cancel,notice,options);};cancel.onclick=stop;
 }
 return {mount,stop};
})();
