// 面试复盘的数据契约：服务端为真源；浏览器旧记录只做一次合并迁移。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const realModel=require('./real-review-model');
const stages = ['初面','二面','三面','HR面'];
const results = ['待定','通过','未通过'];
const error = (message, status=400) => Object.assign(new Error(message), { status });
function normalizeReview(record, legacy=false) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw error('复盘记录格式错误');
  const text=(key,max)=>{ const value=record[key] ?? ''; if(typeof value!=='string'||value.length>max)throw error(key+' 字段格式错误');return value.trim(); };
  const id=String(record.id ?? '');
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw error('复盘 ID 格式错误');
  const company=text('company',200),role=text('role',200),note=text('note',200000),date=text('date',30);
  if(!company&&!note&&!(Array.isArray(record.real?.questions)&&record.real.questions.some(q=>typeof q?.question==='string'&&q.question.trim())))throw error('请至少填写公司或复盘内容');
  const iso=/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
  if(!iso&&!(legacy&&/^\d{1,2}\/\d{1,2}$/.test(date)))throw error('日期需为有效的 YYYY-MM-DD');
  if(!stages.includes(record.stage)||!results.includes(record.result))throw error('面试轮次或结果错误');
  if(!Array.isArray(record.tags)||record.tags.length>30||!record.tags.every(t=>typeof t==='string'&&t.length>0&&t.length<=100))throw error('薄弱点格式错误');
  const association={};
  if(record.jobId!=null){if(typeof record.jobId!=='string'||! /^[a-zA-Z0-9_-]{1,100}$/.test(record.jobId))throw error('关联岗位 ID 格式错误');association.jobId=record.jobId;
    const snap=record.jobSnapshot;if(!snap||!['company','role','jd'].every(k=>typeof snap[k]==='string'&&snap[k].length<=(k==='jd'?30000:200)))throw error('岗位快照格式错误');association.jobSnapshot={company:snap.company,role:snap.role,jd:snap.jd};}
  const real=record.real===undefined?{}:{real:realModel.normalize(record.real)};
  if(record.revision!==undefined&&(!Number.isSafeInteger(record.revision)||record.revision<0))throw error('复盘版本错误');
  return {id,company,role,...association,stage:record.stage,result:record.result,date,tags:[...new Set(record.tags)],note,...real,...(record.revision===undefined?{}:{revision:record.revision})};
}
function summary(records) {
  const total=records.length,passed=records.filter(r=>r.result==='通过').length,failed=records.filter(r=>r.result==='未通过').length;
  const pending=total-passed-failed,decided=passed+failed,freq=Object.create(null);
  records.forEach(r=>r.tags.forEach(t=>{freq[t]=(freq[t]||0)+1;}));
  const weaknesses=Object.entries(freq).map(([tag,count])=>({tag,count})).sort((a,b)=>b.count-a.count||a.tag.localeCompare(b.tag,'zh-CN'));
  return {total,passed,failed,pending,decided,passRate:decided?Math.round(passed/decided*100):0,weaknesses};
}
function createReviewStore(directory) {
  const file=path.join(directory,'reviews.json');
  function read() {
    if(!fs.existsSync(file))return {schemaVersion:1,records:[],importBatches:[]};
    try {
      const data=JSON.parse(fs.readFileSync(file,'utf8'));
      if(data.schemaVersion!==1||!Array.isArray(data.records)||!Array.isArray(data.importBatches))throw new Error('format');
      data.records=data.records.map(r=>normalizeReview(r,true));
      if(new Set(data.records.map(r=>r.id)).size!==data.records.length||!data.importBatches.every(s=>typeof s==='string'))throw new Error('format');
      return data;
    }catch(e){throw error('复盘数据文件异常，原文件已保留，请检查后重试',500);}
  }
  function write(data) {
    fs.mkdirSync(directory,{recursive:true});
    const temporary=file+'.'+crypto.randomUUID()+'.tmp';
    try {fs.writeFileSync(temporary,JSON.stringify(data,null,2),'utf8');fs.renameSync(temporary,file);}
    catch(e){throw error('复盘写入失败，请重试',500);}
    finally {if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  }
  const equivalent=(a,b)=>{const strip=x=>{const v={...x};delete v.revision;return JSON.stringify(v);};return strip(a)===strip(b);};
  const response=data=>({schemaVersion:1,records:data.records,summary:summary(data.records)});
  return {
    list:()=>response(read()),
    add:record=>{
      const item=normalizeReview(record),data=read(),existing=data.records.find(r=>r.id===item.id);
      if(existing){if(!equivalent(existing,item))throw error('复盘 ID 已存在',409);return response(data);}
      data.records.unshift(item.real?{...item,revision:1}:item);write(data);return response(data);
    },
    update:(id,record,baseRevision)=>{
      const item=normalizeReview(record),data=read(),existing=data.records.find(r=>r.id===id);
      if(!existing)throw error('复盘记录不存在',404);if(item.id!==id)throw error('复盘 ID 不一致');
      if(equivalent(existing,item))return response(data);
      if(!Number.isSafeInteger(baseRevision)||baseRevision!==(existing.revision||0))throw error('这份复盘已在另一页面更新，当前草稿保留。请先备份草稿再重新载入。',409);
      if(existing.real&&(!item.real||!realModel.compatible(existing.real,item.real)))throw error('已点评的材料和旧点评需要保留；更换所用材料请新建一场复盘',409);
      data.records=data.records.map(r=>r.id===id?{...item,revision:(existing.revision||0)+1}:r);write(data);return response(data);
    },
    remove:id=>{const data=read(),length=data.records.length;data.records=data.records.filter(r=>r.id!==id);if(data.records.length!==length)write(data);return response(data);},
    import:records=>{
      if(!Array.isArray(records)||records.length>10000)throw error('旧复盘记录格式错误');
      const items=records.map(r=>normalizeReview(r,true)),batch=crypto.createHash('sha256').update(JSON.stringify(items)).digest('hex'),data=read();
      if(data.importBatches.includes(batch))return response(data);
      const ids=new Set(data.records.map(r=>r.id));
      const added=items.filter(r=>{if(ids.has(r.id))return false;ids.add(r.id);return true;});
      data.records.push(...added);data.importBatches.push(batch);write(data);return response(data);
    }
  };
}
module.exports={createReviewStore,normalizeReview,summary};
