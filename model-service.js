const {createModelStore,BUILTIN,PRESETS}=require('./model-store');
const {secureModelRequest,resolvePublic}=require('./model-network');
const {runAi}=require('./ai-service');
const {createHash}=require('node:crypto');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function createModelService(directory,legacy={},options={}){
 const store=createModelStore(directory,legacy),transport=options.transport||secureModelRequest,check=options.checkEndpoint||resolvePublic;
 const running=new Map(),recent=new Map();let total=0;
 const decisions=new Map(),digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 function start(owner){const now=Date.now();for(const [key,value] of recent)if(value.reset<=now)recent.delete(key);const r=recent.get(owner)||{count:0,reset:now+60000};if(r.count>=20)throw fail('操作较频繁，请稍等一分钟再试',429);if((running.get(owner)||0)>=2||total>=12)throw fail('AI 正在处理其他请求，请稍后再试',429);r.count++;recent.set(owner,r);running.set(owner,(running.get(owner)||0)+1);total++;return()=>{total--;const n=running.get(owner)-1;if(n)running.set(owner,n);else running.delete(owner);};}
 const list=owner=>({profiles:store.list(owner),selectedId:store.selected(owner),builtin:store.list(BUILTIN).filter(p=>p.enabled&&p.hasKey).map(({id,name,model})=>({id,name,model})),presets:PRESETS});
 function routeFor(owner){
  const selected=store.selected(owner),builtin=store.list(BUILTIN);
  if(!selected)return {source:'builtin',pinned:false,candidates:builtin.filter(p=>p.enabled&&p.hasKey).slice(0,3).map(p=>store.connection(BUILTIN,p.id))};
  const shared=builtin.find(p=>p.id===selected);if(shared&&(!shared.enabled||!shared.hasKey))throw fail('所选内置模型已停用，请选择其他模型或自动选择');
  return {source:shared?'builtin':'personal',pinned:true,candidates:[store.connection(shared?BUILTIN:owner,selected)]};
 }
 async function perform(owner,task,body){
  const end=start(owner);try{
   const {source,pinned,candidates}=routeFor(owner);
   if(!candidates.length)throw fail('内置 AI 暂未配置，可联系管理员，或在「模型设置」添加个人模型',503);
   const deadline=Date.now()+96000;let last;
   for(let i=0;i<candidates.length;i++){
    const c=candidates[i];if(!c.enabled||!c.apiKey)throw fail('个人模型已停用，请选择内置 AI 或其他个人模型');
    try{const result=await runAi(task,body,{...c,transport,timeoutMs:Math.min(source==='personal'?90000:30000,Math.max(100,deadline-Date.now()-2000)),maxTokens:['resume-diagnose','interview-plan'].includes(task)?8192:4096,connectionJson:true});return {...result,meta:{...result.meta,model:result.meta?.model||c.model,requestedModel:c.model,connectionName:c.name,source,fallback:i>0,attempts:i+1}};}
    catch(e){last=e;if(e.status!==502||pinned||Date.now()>=deadline)throw e;}
   }
   throw fail('内置 AI 暂时不可用，请稍后重试；填写内容已保留',last?.status||503);
  }finally{end();}
 }
 async function execute(owner,task,body){
  if(!['interview-turn','interview-clarify'].includes(task)||body.sessionId===undefined&&body.turnId===undefined)return perform(owner,task,body);
  if(typeof body.sessionId!=='string'||typeof body.turnId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(body.sessionId)||!/^[a-zA-Z0-9_:-]{1,100}$/.test(body.turnId))throw fail('面试轮次标识不正确');
  const now=Date.now();for(const [k,v] of decisions)if(v.expires<=now)decisions.delete(k);
  const {source,pinned,candidates:route}=routeFor(owner);
  const key=digest([owner,task,body.sessionId,body.turnId]),fingerprint=digest([body,source,pinned,route.map(c=>[c.id,c.model,c.baseUrl,c.apiKey,c.enabled])]),old=decisions.get(key);
  if(old){if(old.fingerprint!==fingerprint)throw fail('这轮材料或模型已变化，请进入下一题或重新准备本场面试',409);const result=await old.promise;return {...structuredClone(result),meta:{...result.meta,reusedDecision:true}};}
  if(decisions.size>=500)throw fail('面试处理中，请稍后再试',429);
  const entry={fingerprint,expires:now+15*60000};entry.promise=perform(owner,task,body);decisions.set(key,entry);
  try{return await entry.promise;}catch(e){if(decisions.get(key)===entry)decisions.delete(key);throw e;}
 }
 return {store,list,execute,
  async save(owner,input,id){const end=start(owner);try{if(!input||typeof input!=='object')throw fail('模型配置格式错误');const old=id?store.connection(owner,id):null;await check(input.baseUrl||old?.baseUrl);return store.save(owner,input,id);}finally{end();}},
  async test(owner,id,actor){const end=start(actor||owner);try{const cfg=store.connection(owner,id);if(!cfg.apiKey)throw fail('请先保存 API Key');const begun=Date.now(),raw=await transport({...cfg,timeoutMs:8000},undefined,'models');if(!Array.isArray(raw?.data)||raw.data.some(p=>typeof p?.id!=='string'))throw fail('模型列表格式异常，连接检查未通过',502);if(!raw.data.some(p=>p.id===cfg.model))throw fail('接口与 Key 已连通，但服务商模型列表中没有当前模型，请检查模型名称',502);store.markChecked(owner,id);return {ok:true,kind:'connection',model:cfg.model,elapsedMs:Date.now()-begun,message:'连接测试通过：接口与 Key 可用，模型在列表中；AI 输出尚需单独验证。'};}finally{end();}},
  async verify(owner,id,actor){const end=start(actor||owner);try{const cfg=store.connection(owner,id);if(!cfg.apiKey)throw fail('请先保存 API Key');const result=await runAi('test',{}, {...cfg,transport,maxTokens:64,connectionJson:true,timeoutMs:15000});store.markTested(owner,id);return result;}finally{end();}},
  close(){decisions.clear();store.close();}
 };
}
module.exports={createModelService};
