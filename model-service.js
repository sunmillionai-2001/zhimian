const {createModelStore,BUILTIN,PRESETS}=require('./model-store');
const {secureModelRequest,resolvePublic}=require('./model-network');
const {runAi}=require('./ai-service');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function createModelService(directory,legacy={},options={}){
 const store=createModelStore(directory,legacy),transport=options.transport||secureModelRequest,check=options.checkEndpoint||resolvePublic;
 const running=new Map(),recent=new Map();let total=0;
 function start(owner){const now=Date.now();for(const [key,value] of recent)if(value.reset<=now)recent.delete(key);const r=recent.get(owner)||{count:0,reset:now+60000};if(r.count>=20)throw fail('操作较频繁，请稍等一分钟再试',429);if((running.get(owner)||0)>=2||total>=12)throw fail('AI 正在处理其他请求，请稍后再试',429);r.count++;recent.set(owner,r);running.set(owner,(running.get(owner)||0)+1);total++;return()=>{total--;const n=running.get(owner)-1;if(n)running.set(owner,n);else running.delete(owner);};}
 const list=owner=>({profiles:store.list(owner),selectedId:store.selected(owner),builtin:store.list(BUILTIN).filter(p=>p.enabled&&p.hasKey).map(({id,name,model})=>({id,name,model})),presets:PRESETS});
 async function execute(owner,task,body){
  const end=start(owner);try{
   const selected=store.selected(owner),candidates=selected?[store.connection(owner,selected)]:store.list(BUILTIN).filter(p=>p.enabled&&p.hasKey).slice(0,3).map(p=>store.connection(BUILTIN,p.id));
   if(!candidates.length)throw fail('内置 AI 暂未配置，可联系管理员，或在「模型设置」添加个人模型',503);
   const deadline=Date.now()+42000;let last;
   for(let i=0;i<candidates.length;i++){
    const c=candidates[i];if(!c.enabled||!c.apiKey)throw fail('个人模型已停用，请选择内置 AI 或其他个人模型');
    try{const result=await runAi(task,body,{...c,transport,timeoutMs:Math.min(12000,Math.max(100,deadline-Date.now()-2000)),maxTokens:task==='resume-diagnose'?8192:4096,connectionJson:true});return {...result,meta:{...result.meta,model:result.meta?.model||c.model,requestedModel:c.model,connectionName:c.name,source:selected?'personal':'builtin',fallback:i>0,attempts:i+1}};}
    catch(e){last=e;if(e.status!==502||selected||Date.now()>=deadline)throw e;}
   }
   throw fail('内置 AI 暂时不可用，请稍后重试；填写内容已保留',last?.status||503);
  }finally{end();}
 }
 return {store,list,execute,
  async save(owner,input,id){const end=start(owner);try{if(!input||typeof input!=='object')throw fail('模型配置格式错误');const old=id?store.connection(owner,id):null;await check(input.baseUrl||old?.baseUrl);return store.save(owner,input,id);}finally{end();}},
  async test(owner,id,actor){const end=start(actor||owner);try{const cfg=store.connection(owner,id);if(!cfg.apiKey)throw fail('请先保存 API Key');const result=await runAi('test',{}, {...cfg,transport,maxTokens:64,connectionJson:true,timeoutMs:12000});store.markTested(owner,id);return result;}finally{end();}},
  close(){store.close();}
 };
}
module.exports={createModelService};
