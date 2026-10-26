/* Real interview recollections and their immutable feedback sources. Shared by browser/server. */
(function(root){
 'use strict';
 const policy=typeof module!=='undefined'&&module.exports?require('./interview-policy'):root.InterviewPolicy;
 const copy=v=>JSON.parse(JSON.stringify(v)),fail=m=>Object.assign(Error(m),{status:400});
 const text=(v,max,name,empty=true)=>{if(typeof v!=='string'||v.length>max||!empty&&!v.trim())throw fail(name+'格式不符或超过长度限制');return v;};
 const id=(v,name)=>text(v,100,name,false);
 function envelope(e,answer,resume){
  const list=v=>Array.isArray(v)&&v.length<=8&&v.every(x=>typeof x==='string'&&x.length<=2000);
  return !!(e?.meta&&['model','promptVersion','createdAt'].every(k=>typeof e.meta[k]==='string'&&e.meta[k].length<=200)&&e.result&&['relevance','structure','evidence','depth'].every(k=>Number.isInteger(e.result.scores?.[k])&&e.result.scores[k]>=0&&e.result.scores[k]<=5)&&['strengths','gaps','suggestions','evidenceQuotes'].every(k=>list(e.result[k]))&&e.result.evidenceQuotes.length&&e.result.evidenceQuotes.every(q=>q.trim()&&answer.includes(q))&&typeof e.result.followUp==='string'&&e.result.followUp.length<=2000&&policy.validCriteriaEnvelope(e,answer)&&policy.validAnswerReview(e.result.review,answer,answer+'\n'+resume,true));
 }
 function normalize(real){
  if(!real||real.schemaVersion!==1||!real.context||!Array.isArray(real.questions)||real.questions.length>30)throw fail('逐题复盘格式错误');
  const c=real.context;
  if(c.goalId!==null)id(c.goalId,'目标岗位');text(c.goalName,200,'目标名称');text(c.jd,10000,'岗位要求');if(!['hr','business'].includes(c.interviewer))throw fail('请选择面试类型');
  let resume=null;
  if(c.resume!==null){const r=c.resume;if(!r||!id(r.id,'简历')||!id(r.versionId,'简历版本'))throw fail('简历版本格式错误');resume={id:r.id,versionId:r.versionId,name:text(r.name,100,'简历名称'),label:text(r.label,200,'简历版本名称'),text:text(r.text,30000,'简历正文')};if(r.document!==undefined){if(!policy.validResumeDocument(r.document))throw fail('原件引用错误');resume.document=copy(r.document);}}
  const context={goalId:c.goalId,goalName:c.goalName,jd:c.jd,interviewer:c.interviewer,resume},seen=new Set();let total=0;
  const questions=real.questions.map(q=>{
   if(!q||!id(q.id,'题目')||seen.has(q.id)||!['complete','partial','unknown'].includes(q.recall)||!Array.isArray(q.feedback)||q.feedback.length>20)throw fail('题目或回忆状态错误');seen.add(q.id);
   const question=text(q.question,5000,'面试问题'),answer=text(q.answer,12000,'回忆的回答');
   const feedback=q.feedback.map(f=>{if(!f||!['complete','partial'].includes(f.recall))throw fail('点评来源不完整');text(f.question,5000,'原问题',false);text(f.answer,12000,'原回答',false);if(!envelope(f.envelope,f.answer,resume?.text||''))throw fail('点评与回答的原话依据不符');if(++total>100)throw fail('本场点评已达 100 次，请备份后另建记录');return {question:f.question,answer:f.answer,recall:f.recall,envelope:copy(f.envelope)};});
   return {id:q.id,question,answer,recall:q.recall,feedback};
  });
  return {schemaVersion:1,context,questions};
 }
 function current(q){return q?.feedback.find(f=>f.question===q.question&&f.answer===q.answer&&f.recall===q.recall)||null;}
 function compatible(old,next){
  if(!old)return true;
  if(old.questions.some(q=>q.feedback.length)&&JSON.stringify(old.context)!==JSON.stringify(next.context))return false;
  return old.questions.every(q=>!q.feedback.length||next.questions.some(x=>x.id===q.id&&q.feedback.every(f=>x.feedback.some(n=>JSON.stringify(n)===JSON.stringify(f)))));
 }
 function linked(record,q,r){const c=record.real?.context;return !!(c&&r.realReviewOrigin?.reviewId===record.id&&r.realReviewOrigin.questionId===q.id&&r.realReviewOrigin.questionKey===policy.questionFingerprint(q.question)&&r.jd===c.jd&&r.resume===(c.resume?.text||'')&&r.interviewer===c.interviewer);}
 function summary(record,mockStore={records:[],draft:null}){
  const qs=record.real?.questions||[],runs=[mockStore.draft,...mockStore.records,...(mockStore.parked||[])].filter(Boolean),answered=qs.filter(q=>q.answer.trim()),reviewed=qs.filter(q=>current(q));
  const related=q=>runs.filter(r=>linked(record,q,r));
  return {questions:qs.length,answered:answered.length,eligible:answered.filter(q=>q.recall!=='unknown'&&q.question.trim()).length,reviewed:reviewed.length,practice:qs.filter(q=>related(q).some(r=>r.answers.some(a=>a.trim()))).length,practiceReviewed:qs.filter(q=>related(q).some(r=>r.ai?.some(a=>a?.report?.result.review||a?.initial?.result.review||a?.retry?.evaluation?.result.review))).length,missing:reviewed.flatMap(q=>current(q).envelope.result.review.missingFacts.map(f=>({questionId:q.id,question:q.question,...f}))).slice(0,6)};
 }
 function practice(record,q,id,date){
  if(!record.real||!q.question.trim())return null;const c=record.real.context;if(!c.goalId||!c.jd.trim())return null;
  const origin={reviewId:record.id,questionId:q.id,revision:record.revision||0,questionKey:policy.questionFingerprint(q.question)};
  return {schemaVersion:2,id,date,status:'active',mode:'coaching',interviewer:c.interviewer,role:record.role.slice(0,100)||'通用',roleSelection:'auto',jd:c.jd,resume:c.resume?.text||'',goalId:c.goalId,preparation:{goalId:c.goalId,goalName:c.goalName,origin:'session',resumeSource:c.resume?'resume-version':'manual',resumeVersionId:c.resume?.versionId||null,resumeLabel:c.resume?.label||'未记录所用简历',...(c.resume?{resumeId:c.resume.id}:{}),...(c.resume?.document?{resumeDocument:copy(c.resume.document)}:{}),confirmed:true},questions:[{topic:'真实面试重练',q:q.question,points:['讲清问题、个人行动和结果；事实不确定时如实说明。']}],count:1,keywords:[],answers:[''],durations:[0],index:0,rate:'未评',ai:[null],realReviewOrigin:origin};
 }
 const api={normalize,envelope,current,compatible,summary,practice,linked};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RealReviewModel=api;
})(typeof window==='undefined'?globalThis:window);
