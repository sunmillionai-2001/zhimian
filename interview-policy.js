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
 const taskOutcome=status=>({met:'verified',missing:'needs_more',unknown:'unknown'})[status];
 function deriveTasks(r){
  if(!r.blueprint)return [];const previous=r.formal.tasks||[],tasks=[];
  for(let index=1;index<6;index++)for(const c of r.formal.evaluations[index]?.result.criteria||[]){
   if(c.status==='met')continue;const standard=r.questions[index].criteria.find(x=>x.id===c.id),id=r.id+':'+index+':'+c.id,old=previous.find(t=>t.id===id);
   tasks.push(old||{id,index,competencyId:r.questions[index].competencyId,criterionId:c.id,title:standard.description,reason:c.reason,sourceQuote:c.quote||r.formal.evaluations[index].result.evidenceQuotes[0],status:'suggested',carry:false,attempts:[]});
  }return tasks;
 }
 function verifyTask(task,envelope,answer){
  if(!validCriteriaEnvelope(envelope,answer)||envelope.meta.competencyVersion!==competencyVersion||envelope.meta.competencyId!==task.competencyId)throw Error('重答与原任务的评价标准不一致');
  const criterion=envelope.result.criteria.find(c=>c.id===task.criterionId);if(!criterion)throw Error('重答缺少本任务的评价');
  return {outcome:taskOutcome(criterion.status),criterion:{...criterion}};
 }
 function validTasks(r){
  const tasks=r.formal.tasks;if(!Array.isArray(tasks)||tasks.length>10||tasks.filter(t=>t?.carry).length>2||new Set(tasks.map(t=>t?.id)).size!==tasks.length)return false;
  for(const t of tasks){
   if(!t||!Number.isInteger(t.index)||t.index<1||t.index>5||!r.blueprint)return false;
   const q=r.questions[t.index],e=r.formal.evaluations[t.index],c=Array.isArray(e?.result.criteria)?e.result.criteria.find(c=>c.id===t.criterionId):null,standard=Array.isArray(q?.criteria)?q.criteria.find(c=>c.id===t.criterionId):null;
   if(!c||c.status==='met'||!standard||t.id!==r.id+':'+t.index+':'+c.id||t.competencyId!==q.competencyId||t.title!==standard.description||t.reason!==c.reason||t.sourceQuote!==(c.quote||e.result.evidenceQuotes?.[0])||typeof t.carry!=='boolean'||!['suggested','selected','practicing','verified','needs_more','unknown'].includes(t.status)||!Array.isArray(t.attempts)||t.attempts.length>20)return false;
   const seen=new Set();for(const a of t.attempts){
    if(!a||!bounded(a.recordId,100)||!a.recordId||seen.has(a.recordId)||!bounded(a.date,100)||!bounded(a.answer,12000)||!a.answer.trim()||a.answer.trim()===combined(r,t.index).trim()||!bounded(a.model,200)||a.version!==r.blueprint.version||a.criterion?.id!==t.criterionId||!validCriteria([a.criterion],{criteria:[standard]},a.answer)||a.outcome!==taskOutcome(a.criterion.status))return false;seen.add(a.recordId);
   }
   if(['verified','needs_more','unknown'].includes(t.status)&&t.attempts.at(-1)?.outcome!==t.status)return false;
  }return true;
 }
 function validPractice(r){
  if(r.origin!==undefined&&(!r.origin||!bounded(r.origin.recordId,100)||!Number.isInteger(r.origin.index)||r.origin.index<0||r.origin.index>11||r.origin.taskId!==undefined&&!bounded(r.origin.taskId,200)))return false;
  const t=r.practiceTask;if(t===undefined)return true;
  const q=r.questions?.[0],c=Array.isArray(q?.criteria)?q.criteria.find(c=>c.id===t?.criterionId):null;
  if(!t||!r.origin||!q||!c||!Array.isArray(r.answers)||typeof r.answers[0]!=='string')return false;
  return !!r.blueprint&&r.mode==='coaching'&&r.count===1&&bounded(t.id,200)&&!!t.id&&t.id===r.origin.taskId&&t.id===t.recordId+':'+t.index+':'+t.criterionId&&t.recordId===r.origin.recordId&&t.index===r.origin.index&&t.competencyId===q.competencyId&&c.description===t.title&&bounded(t.reason,500)&&bounded(t.sourceQuote,2000)&&!!t.sourceQuote.trim()&&r.answers[0].includes(t.sourceQuote);
 }
 function validFocus(r){
  if(r.selectedFocus===undefined)return true;const rows=r.selectedFocus;
  return !!r.blueprint&&Array.isArray(r.blueprint.competencies)&&Array.isArray(rows)&&rows.length<=2&&new Set(rows.map(x=>x?.criterionId)).size===rows.length&&rows.every(x=>x&&x.goalId===r.goalId&&bounded(x.taskId,200)&&bounded(x.recordId,100)&&bounded(x.reason,500)&&bounded(x.sourceQuote,500)&&bounded(x.previousQuestion,1000)&&['verified','needs_more','unknown','suggested','selected','practicing'].includes(x.previousOutcome)&&r.blueprint.competencies.some(a=>Array.isArray(a?.criteria)&&a.criteria.some(c=>c?.id===x.criterionId)));
 }
 function validResumeDocument(d){return !!d&&typeof d.id==='string'&&/^[a-f0-9]{32}$/.test(d.id)&&bounded(d.name,240)&&['.pdf','.docx'].includes(d.ext)&&(d.pages===undefined||d.pages===null||Number.isInteger(d.pages)&&d.pages>=1&&d.pages<=30);}
 function validSetup(s){return !!s&&bounded(s.jd,10000)&&bounded(s.resume,30000)&&['hr','business'].includes(s.interviewer)&&['formal','coaching'].includes(s.mode)&&bounded(s.roleSelection,100)&&['manual','resume-current','resume-version'].includes(s.resumeSource)&&(s.resumeVersionId===null||bounded(s.resumeVersionId,100))&&bounded(s.resumeLabel,200)&&(s.resumeDocument===undefined||validResumeDocument(s.resumeDocument));}
 function validGoals(s){
  if(!s||s.schemaVersion!==1||!Array.isArray(s.goals)||s.goals.length>1000||!(s.activeId===null||bounded(s.activeId,100)))return false;
  const ids=new Set(),jobs=new Set();
  for(const g of s.goals){if(!g||!bounded(g.id,100)||!g.id||ids.has(g.id)||!bounded(g.name,200)||!(g.jobId===null||bounded(g.jobId,100))||!validSetup(g.working)||!validSetup(g.defaults))return false;ids.add(g.id);if(g.jobId){if(jobs.has(g.jobId))return false;jobs.add(g.jobId);}}
  return s.activeId===null||ids.has(s.activeId);
 }
 function validPreparation(r){
  if(r.goalId!==undefined&&(!bounded(r.goalId,100)||!r.goalId))return false;
  const p=r.preparation;if(p===undefined)return true;
  return !!p&&p.goalId===r.goalId&&bounded(p.goalName,200)&&['goal_default','session'].includes(p.origin)&&['manual','resume-current','resume-version'].includes(p.resumeSource)&&(p.resumeVersionId===null||bounded(p.resumeVersionId,100))&&bounded(p.resumeLabel,200)&&typeof p.confirmed==='boolean'&&(p.resumeDocument===undefined||validResumeDocument(p.resumeDocument));
 }
 function validFormal(record,envelope){
  if(!validPreparation(record)||!validPractice(record)||!validFocus(record))return false;
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
  if(f.tasks!==undefined&&!validTasks(record))return false;
  if(f.control!==undefined){
   const c=f.control;if(!c||typeof c.paused!=='boolean'||!Array.isArray(c.skipped)||c.skipped.length>7||!Array.isArray(c.clarifications)||c.clarifications.length>17||new Set(c.skipped.map(x=>x?.index)).size!==c.skipped.length||new Set(c.clarifications.map(x=>x?.key)).size!==c.clarifications.length)return false;
   if(c.skipped.some(x=>!x||!Number.isInteger(x.index)||x.index<0||x.index>6||!['skip','unknown'].includes(x.reason)))return false;
   if(c.clarifications.some(x=>!x||!Number.isInteger(x.index)||x.index<0||x.index>6||!str(x.key,100)||!str(x.question,5000)||!str(x.explanation,1000)||!str(x.quote,500)||!x.quote.trim()||!x.question.includes(x.quote)||![record.questions[x.index].q,...f.turns.filter(t=>t.index===x.index).map(t=>t.question),...(record.index===x.index&&f.pending?[f.pending.question]:[])].includes(x.question)))return false;
   if(f.phase==='report'&&c.paused)return false;
  }
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
 return {validResumeDocument,profiles,profile,combined,sameGoal,homeState,validSetup,validGoals,validPreparation,blueprint,ability,validBlueprint,validCriteria,validCriteriaEnvelope,competencyVersion,deriveTasks,verifyTask,validTasks,validPractice,validFocus,validFormal,version:'2026-10-15.roles.v1'};
});
