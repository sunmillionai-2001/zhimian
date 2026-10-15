const dns=require('node:dns').promises,net=require('node:net'),https=require('node:https');
const {endpoint}=require('./model-store');
const blockedV6=new net.BlockList();for(const [address,prefix] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]])blockedV6.addSubnet(address,prefix,'ipv6');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function publicAddress(ip){
 if(net.isIP(ip)===4){const p=ip.split('.').map(Number),[a,b,c]=p;return !(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);}
 if(net.isIP(ip)===6){const v=ip.toLowerCase(),first=parseInt(v.split(':')[0],16);return first>=0x2000&&first<=0x3fff&&!blockedV6.check(v,'ipv6');}return false;
}
async function resolvePublic(baseUrl,lookup=dns.lookup.bind(dns)){
 const u=new URL(endpoint(baseUrl)),host=u.hostname.replace(/^\[|\]$/g,'');
 if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||!host.includes('.')&&!net.isIP(host))throw fail('不能使用本机或内网模型地址');
 let rows,timer;try{rows=net.isIP(host)?[{address:host,family:net.isIP(host)}]:await Promise.race([lookup(host,{all:true,verbatim:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('模型域名解析超时',502)),2000);})]);}catch(e){if(e.status)throw e;throw fail('模型域名无法解析',502);}finally{clearTimeout(timer);}
 if(!rows.length||rows.some(r=>!publicAddress(r.address)))throw fail('模型地址必须解析为公网地址，不能访问内网或云元数据');
 const selected=rows.find(r=>r.family===4)||rows[0];return {url:u,address:selected.address,family:selected.family};
}
async function secureModelRequest(cfg,payload,operation='generate'){
 const checking=operation==='models';
 const target=await resolvePublic(cfg.baseUrl);return new Promise((resolve,reject)=>{
  let done=false,receivedHeaders=false,receivedContent=false;const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);};
  const req=https.request(new URL(target.url.href.replace(/\/$/,'')+(checking?'/models':'/chat/completions')),{method:checking?'GET':'POST',agent:false,lookup:(_host,options,callback)=>callback(null,options?.all?[{address:target.address,family:target.family}]:target.address,target.family),headers:{'Content-Type':'application/json',Accept:'application/json','User-Agent':'zhimian-workbench/0.5',Authorization:'Bearer '+cfg.apiKey}},res=>{
   receivedHeaders=true;
   if(res.statusCode<200||res.statusCode>=300){res.resume();const reasons={401:'API Key 鉴权失败，请检查 Key 与服务商是否匹配',402:'模型服务商账户余额不足，请前往服务商检查',400:'模型服务拒绝了请求参数，请检查模型名称与接口兼容性',404:checking?'接口不支持模型列表检查，请核对基础地址，或使用验证 AI 输出':'模型或接口不存在，请检查模型名称和接口地址',422:'模型服务不支持当前请求参数',429:'模型服务限流，请稍后重试'};return finish(fail('模型服务返回 HTTP '+res.statusCode+'：'+(reasons[res.statusCode]||'服务暂时不可用，请稍后重试'),502));}
   let size=0,parts=[];res.on('data',chunk=>{size+=chunk.length;if(chunk.toString('utf8').trim())receivedContent=true;if(size>1024*1024){finish(fail('模型响应过大，请缩短材料后重试',502));res.destroy();req.destroy();}else parts.push(chunk);});res.on('aborted',()=>finish(fail('模型连接中断，请重试',502)));res.on('error',()=>finish(fail('模型连接中断，请重试',502)));res.on('end',()=>{try{finish(null,JSON.parse(Buffer.concat(parts).toString('utf8')));}catch{finish(fail('模型响应格式异常',502));}});
  });
  const timer=setTimeout(()=>{finish(fail(checking?'连接检查超时，请检查网络或服务商状态':receivedHeaders&&!receivedContent?'已连接模型服务，但服务商仍未返回生成结果，可能正在排队，请稍后重试':receivedHeaders?'模型生成结果等待超时，请稍后重试':'连接模型服务超时，请检查网络或接口地址',502));req.destroy();},Math.max(100,Math.min(cfg.timeoutMs||90000,90000)));
  req.on('error',()=>finish(fail('无法连接模型服务，请稍后重试',502)));req.end(checking?undefined:JSON.stringify(payload));
 });
}
module.exports={publicAddress,resolvePublic,secureModelRequest};
