// Capture PCM only. No browser cloud speech service or audio playback.
class ZhimianRecorder extends AudioWorkletProcessor{
 constructor(){super();this.buffer=new Float32Array(4096);this.used=0;this.enabled=true;this.port.onmessage=e=>{if(e.data==='flush'){this.enabled=false;this.flush();this.port.postMessage({done:true});}};}
 flush(){if(this.used){const samples=this.buffer.slice(0,this.used);this.port.postMessage({samples},[samples.buffer]);this.used=0;}}
 process(inputs){const channels=inputs[0];if(!this.enabled||!channels?.length)return true;for(let i=0;i<channels[0].length;i++){let sample=0;for(const channel of channels)sample+=channel[i]||0;this.buffer[this.used++]=sample/channels.length;if(this.used===this.buffer.length)this.flush();}return true;}
}
registerProcessor('zhimian-recorder',ZhimianRecorder);
