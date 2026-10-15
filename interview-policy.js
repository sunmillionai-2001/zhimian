// Shared, versioned interview roles and record invariants; no browser or model dependencies.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.InterviewPolicy=factory();})(typeof globalThis==='object'?globalThis:this,()=>{
 const profiles=Object.freeze({
  hr:Object.freeze({id:'hr',name:'HR 初面',focus:'求职动机、个人职责、协作沟通、岗位预期',instruction:'你是 HR 初面面试官，围绕求职动机、职责边界、协作沟通与岗位预期提问。用具体经历核实，不强行转成技术考试，不捏造公司政策或薪资。'}),
  business:Object.freeze({id:'business',name:'业务面试',focus:'项目贡献、专业能力、决策取舍、结果验证',instruction:'你是业务主管，围绕 JD 对应的项目贡献、专业能力、决策取舍和结果验证提问。根据用户真实经历追问，不强行要求材料中没有的数据，不把 JD 当作已掌握的经历。'})
 });
 function profile(id){if(!Object.hasOwn(profiles,id))throw Object.assign(Error('请选择 HR 初面或业务面试'),{status:400});return profiles[id];}
 function combined(record,index){return [record.answers[index],...(record.formal?.turns||[]).filter(t=>t.index===index).map(t=>t.answer)].filter(Boolean).join('\n');}
 function sameGoal(a,b){
  if(!a||!b)return false;
  if(a.jobId||b.jobId)return !!a.jobId&&a.jobId===b.jobId;
  if(a.goalId&&b.goalId)return a.goalId===b.goalId;
  const normalize=s=>(s||'').trim().replace(/\s+/g,' ').toLowerCase();
  return !!normalize(a.jd)&&normalize(a.jd)===normalize(b.jd);
 }
 function homeState(current,store){
  const context=current?.goalId||current?.jobId||current?.jd?.trim()?current:store.draft||store.records.find(r=>r.mode==='formal');
  return {context,draft:sameGoal(context,store.draft)?store.draft:null,last:store.records.find(r=>r.mode==='formal'&&sameGoal(context,r))||null};
 }
 const bounded=(v,n)=>typeof v==='string'&&v.length<=n;
 const competencyVersion='2026-10-15.competencies.v1';
 const competencyDefinitions={
  hr:[
   ['motivation','求职动机',[['direction','讲清这次求职方向与原因'],['fit','用真实经历说明与岗位的联系']]],
   ['ownership','个人职责',[['action','说明本人采取的具体行动'],['boundary','区分个人职责与团队成果']]],
   ['collaboration','协作沟通',[['difference','说清协作中的分歧或阻碍'],['alignment','说明怎样沟通并确认共同结果']]],
   ['learning','学习与调整',[['change','说明遇到的问题与调整动作'],['validation','用后续反馈说明调整是否有效']]],
   ['expectations','岗位预期',[['priority','结合 JD 说明希望承担的工作'],['plan','说明入职后的学习或协作安排及边界']]]
  ],
  business:[
   ['problem','问题判断',[['scope','说明问题、目标和限制条件'],['context','结合岗位要求说明判断依据']]],
   ['ownership','个人贡献',[['action','说清本人负责的工作与具体行动'],['boundary','区分个人贡献与团队职责']]],
   ['tradeoff','决策取舍',[['options','说明考虑过的备选方案'],['reason','说明选择依据与接受的代价']]],
   ['delivery','推动落地',[['steps','说明实施步骤、协作与依赖'],['risk','说明风险及应对或调整方式']]],
   ['validation','结果验证',[['method','说明验证方式，定性反馈或定量证据均可'],['limit','说明结果的边界与尚不能确定的部分']]]
  ]
 };
 function blueprint(interviewer,role='通用'){
  profile(interviewer);return {version:competencyVersion,interviewer,role,competencies:competencyDefinitions[interviewer].map(([key,name,criteria])=>({id:interviewer+'.'+key,name,criteria:criteria.map(([id,description])=>({id:interviewer+'.'+key+'.'+id,description}))}))};
 }
 function ability(interviewer,id){return blueprint(interviewer).competencies.find(a=>a.id===id);}
 function validBlueprint(b){
  if(!b||b.version!==competencyVersion||!Object.hasOwn(profiles,b.interviewer)||!bounded(b.role,100)||!Array.isArray(b.competencies))return false;
  const known=blueprint(b.interviewer,b.role);return b.competencies.length===5&&b.competencies.every((a,i)=>a?.id===known.competencies[i].id&&a.name===known.competencies[i].name&&JSON.stringify(a.criteria)===JSON.stringify(known.competencies[i].criteria));
 }
 function validCriteria(rows,a,source){return !!a&&Array.isArray(rows)&&rows.length===a.criteria.length&&rows.every((c,i)=>c?.id===a.criteria[i].id&&['met','missing','unknown'].includes(c.status)&&bounded(c.reason,500)&&!!c.reason.trim()&&bounded(c.quote,1000)&&(c.status!=='met'||!!c.quote.trim())&&(source===undefined||!c.quote||source.includes(c.quote)));}
 function validCriteriaEnvelope(e,source){
  if(e?.result?.criteria===undefined)return !e?.meta?.competencyVersion;
  if(e.meta?.competencyVersion!==competencyVersion||!Object.hasOwn(profiles,e.meta.interviewer))return false;
  return validCriteria(e.result.criteria,ability(e.meta.interviewer,e.meta.competencyId),source);
 }
 function validSetup(s){return !!s&&bounded(s.jd,10000)&&bounded(s.resume,30000)&&['hr','business'].includes(s.interviewer)&&['formal','coaching'].includes(s.mode)&&bounded(s.roleSelection,100)&&['manual','resume-current','resume-version'].includes(s.resumeSource)&&(s.resumeVersionId===null||bounded(s.resumeVersionId,100))&&bounded(s.resumeLabel,200);}
 function validGoals(s){
  if(!s||s.schemaVersion!==1||!Array.isArray(s.goals)||s.goals.length>1000||!(s.activeId===null||bounded(s.activeId,100)))return false;
  const ids=new Set(),jobs=new Set();
  for(const g of s.goals){if(!g||!bounded(g.id,100)||!g.id||ids.has(g.id)||!bounded(g.name,200)||!(g.jobId===null||bounded(g.jobId,100))||!validSetup(g.working)||!validSetup(g.defaults))return false;ids.add(g.id);if(g.jobId){if(jobs.has(g.jobId))return false;jobs.add(g.jobId);}}
  return s.activeId===null||ids.has(s.activeId);
 }
 function validPreparation(r){
  if(r.goalId!==undefined&&(!bounded(r.goalId,100)||!r.goalId))return false;
  const p=r.preparation;if(p===undefined)return true;
  return !!p&&p.goalId===r.goalId&&bounded(p.goalName,200)&&['goal_default','session'].includes(p.origin)&&['manual','resume-current','resume-version'].includes(p.resumeSource)&&(p.resumeVersionId===null||bounded(p.resumeVersionId,100))&&bounded(p.resumeLabel,200)&&typeof p.confirmed==='boolean';
 }
 function validFormal(record,envelope){
  if(!validPreparation(record))return false;
  if(record.blueprint!==undefined){
   if(!validBlueprint(record.blueprint)||record.blueprint.interviewer!==record.interviewer||record.blueprint.role!==record.role)return false;
   if(record.questions.some(q=>q.competencyId&&(!ability(record.interviewer,q.competencyId)||JSON.stringify(q.criteria)!==JSON.stringify(ability(record.interviewer,q.competencyId).criteria))))return false;
   if(record.ai?.some((entry,i)=>entry&&[entry.initial,entry.final,entry.retry?.evaluation].filter(Boolean).some(e=>e.meta?.competencyId!==record.questions[i].competencyId||e.meta?.competencyVersion!==record.blueprint.version)))return false;
  }
  if(record.mode!==undefined&&!['formal','coaching'].includes(record.mode))return false;
  if(record.interviewer!==undefined&&!Object.hasOwn(profiles,record.interviewer))return false;
  if(record.mode!=='formal')return record.formal===undefined;
  const f=record.formal,str=(x,n)=>typeof x==='string'&&x.length<=n;
  if(!Array.isArray(record.answers)||!Number.isInteger(record.index)||!f||!Object.hasOwn(profiles,record.interviewer)||record.count!==7||!['active','report'].includes(f.phase)||!Array.isArray(f.turns)||f.turns.length>10||f.turns.some(t=>!t||typeof t!=='object')||!str(f.draft,12000)||typeof f.decisionPending!=='boolean'||!Array.isArray(f.evaluations)||f.evaluations.length!==record.count)return false;
  if(record.questions[0]?.kind!=='intro'||record.questions[6]?.kind!=='closing'||record.questions.slice(1,6).some(q=>q.kind!=='main'))return false;
  if(record.blueprint&&record.questions.slice(1,6).some((q,i)=>q.competencyId!==record.blueprint.competencies[i].id))return false;
  for(let i=0;i<record.count;i++){
   const turns=f.turns.filter(t=>t.index===i);
   if(turns.length>2||turns.some((t,j)=>!Number.isInteger(t.index)||i<1||i>5||!str(t.question,1000)||!t.question.trim()||!str(t.quote,500)||!t.quote.trim()||![record.answers[i],...turns.slice(0,j).map(x=>x.answer)].join('\n').includes(t.quote)||!str(t.answer,12000)))return false;
   const e=f.evaluations[i];if(e!==null&&(!envelope(e)||!e.result.evidenceQuotes.length||!e.result.evidenceQuotes.every(q=>combined(record,i).includes(q))||!validCriteriaEnvelope(e,combined(record,i))||record.blueprint&&i>0&&i<6&&(e.meta.competencyId!==record.questions[i].competencyId||e.meta.competencyVersion!==record.blueprint.version)))return false;
  }
  if(f.evaluations[6]!==null)return false;
  if(f.turns.some(t=>!Number.isInteger(t.index)||t.index<1||t.index>5))return false;
  if(f.pending!==null){const t=f.pending;if(!t||record.index<1||record.index>5||f.turns.filter(x=>x.index===record.index).length>=2||!str(t.question,1000)||!t.question.trim()||!str(t.quote,500)||!t.quote.trim()||!combined(record,record.index).includes(t.quote)||f.decisionPending)return false;}
  return f.phase==='active'?record.status==='active':record.status!=='active'&&f.pending===null&&!f.decisionPending;
 }
 return {profiles,profile,combined,sameGoal,homeState,validSetup,validGoals,validPreparation,blueprint,ability,validBlueprint,validCriteria,validCriteriaEnvelope,competencyVersion,validFormal,version:'2026-10-15.roles.v1'};
});
