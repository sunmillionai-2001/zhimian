// Fictional records; no application data or live model.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const M=require('../real-review-model'),P=require('../interview-policy'),{createReviewStore}=require('../review-store'),{runAi}=require('../ai-service'),fixture=require('./review-fixture.cjs');
const copy=x=>structuredClone(x),answer='我先整理需求，再和研发核对交付范围。';
const envelope=(a=answer)=>({meta:{model:'fixture',promptVersion:'fixture',createdAt:'2026-10-26T00:00:00Z'},result:{scores:{relevance:3,structure:3,evidence:2,depth:2},strengths:['有个人行动'],gaps:['缺结果'],suggestions:['核对验证过程'],evidenceQuotes:[a],followUp:'',review:fixture(a)}});
function record(){return {id:'review-1',company:'虚构公司',role:'产品经理',stage:'初面',result:'待定',date:'2026-10-26',tags:['原有标签'],note:'原有笔记',real:{schemaVersion:1,context:{goalId:'goal-1',goalName:'产品经理',jd:'产品经理：分析需求，验证方案。',interviewer:'business',resume:{id:'resume-1',versionId:'v1',name:'产品岗位版',label:'产品岗位版 · V1',text:'我负责项目交付。'}},questions:[{id:'q1',question:'请讲一个需求取舍的例子？',answer,recall:'partial',feedback:[]}]}};}
function reviewed(){const r=record(),q=r.real.questions[0];q.feedback=[{question:q.question,answer:q.answer,recall:q.recall,envelope:envelope()}];return r;}
test('real recollection contract preserves exact answers, historical feedback and unknown recall without invented scoring',()=>{
 const r=reviewed();assert.deepEqual(M.normalize(r.real),r.real);assert.equal(M.current(r.real.questions[0]).answer,answer);
 const q=r.real.questions[0];q.answer+='后来补想起的细节。';assert.equal(M.current(q),null);assert.equal(q.feedback.length,1);q.answer=answer;q.recall='unknown';assert.equal(M.current(q),null);assert.equal(M.summary(r).reviewed,0);
 for(const patch of [{questions:[null]},{questions:[{...q,recall:'invalid'}]},{context:{...r.real.context,interviewer:'ceo'}},{questions:[{...q,feedback:[{...q.feedback[0],envelope:{...envelope(),result:{...envelope().result,evidenceQuotes:['材料外的引用']}}}]}]},{questions:[q,q]}])assert.throws(()=>M.normalize({...r.real,...patch}));
 const bad=reviewed();bad.real.questions[0].feedback[0].envelope.result.review.referenceAnswer+='我带来999%的增长。';assert.throws(()=>M.normalize(bad.real),/原话依据/);
 const unknown=record();unknown.real.questions[0].recall='unknown';assert.deepEqual(M.normalize(unknown.real),unknown.real);
});
test('durable updates are revision guarded and idempotent, preserving legacy notes, frozen materials and feedback history',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'real-store-'));try{const store=createReviewStore(dir),old={...record()};delete old.real;old.id='old-note';store.add(old);const original=copy(store.list().records[0]);
 const one=store.add(reviewed()).records[0];assert.equal(one.revision,1);assert.deepEqual(store.list().records.find(r=>r.id==='old-note'),original);
 const update=copy(one);update.real.questions[0].answer+='补充了方法。';const two=store.update(one.id,update,1).records[0];assert.equal(two.revision,2);assert.equal(two.real.questions[0].feedback.length,1);assert.deepEqual(store.update(one.id,update,1).records[0],two,'Retry after lost ACK is idempotent');
 assert.throws(()=>store.update(one.id,{...one,note:'另一标签页'},1),e=>e.status===409);assert.equal(store.list().records[0].revision,2);
 for(const modify of [r=>r.real.context.jd+='新要求',r=>r.real.questions[0].feedback=[],r=>r.real.questions=[]]){const next=copy(two);modify(next);assert.throws(()=>store.update(one.id,next,2),e=>e.status===409);}
 const r=copy(two);r.real.questions[0].feedback.unshift({question:r.real.questions[0].question,answer:r.real.questions[0].answer,recall:'partial',envelope:envelope(r.real.questions[0].answer)});assert.equal(store.update(r.id,r,2).records[0].revision,3);
 const disk=fs.readFileSync(path.join(dir,'reviews.json'),'utf8');assert.equal(createReviewStore(dir).list().records[0].real.questions[0].feedback.length,2);assert.equal(store.list().records.find(r=>r.id==='old-note').note,original.note);assert.ok(disk.includes(original.note));
 fs.writeFileSync(path.join(dir,'reviews.json'),'{broken');assert.throws(()=>store.update(r.id,r,3),e=>e.status===500);assert.equal(fs.readFileSync(path.join(dir,'reviews.json'),'utf8'),'{broken');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('practice is a blank separate coaching run with frozen source; progress requires matching target materials',()=>{
 const r=reviewed(),before=JSON.stringify(r),q=r.real.questions[0],run=M.practice(r,q,'practice-1','2026-10-26T00:00:00Z');assert.ok(P.validFormal(run,()=>true));assert.equal(run.count,1);assert.deepEqual(run.answers,['']);assert.equal(run.jd,r.real.context.jd);assert.equal(run.resume,r.real.context.resume.text);assert.equal(run.preparation.resumeVersionId,'v1');assert.equal(JSON.stringify(r),before);
 run.answers[0]='我核对了范围和验证方法。';let summary=M.summary(r,{records:[],draft:null,parked:[run]});assert.equal(summary.practice,1);assert.equal(summary.practiceReviewed,0);
 run.ai=[{report:envelope(run.answers[0])}];summary=M.summary(r,{records:[run],draft:null});assert.equal(summary.practiceReviewed,1);assert.equal(summary.missing.length,1);
 const changed=copy(r);changed.real.context.jd+='另一个岗位';assert.equal(M.summary(changed,{records:[run],draft:null}).practice,0);changed.real.context.jd=r.real.context.jd;changed.real.questions[0].question='不同问题';assert.equal(M.summary(changed,{records:[run],draft:null}).practice,0);
 assert.equal(P.validPractice({...run,realReviewOrigin:{...run.realReviewOrigin,questionKey:'wrong'}}),false);assert.equal(P.validPractice({...run,mode:'formal'}),false);assert.equal(M.practice({...r,real:{...r.real,context:{...r.real.context,goalId:null}}},q,'no','2026-10-26'),null);
});
test('real review AI sees recollection state and uses the existing source-ID validation with one bounded repair',async()=>{
 let calls=0;const cfg={baseUrl:'http://controlled.local/v1',model:'fixture',apiKey:'fake',transport:async(c,p)=>{calls++;const data=JSON.parse(p.messages[1].content);assert.equal(data.recollection,'partial');assert.match(p.messages[0].content,/不能把遗漏当作现场没答出来/);assert.match(p.messages[0].content,/不推断未记录的表现/);const review=fixture(answer);review.version=P.answerReviewVersion;review.annotations=[{segmentId:'a1',reason:'补充验证细节',rewrite:'我核对了【待补充：验证结果】。'}];review.referenceEvidence=[{sourceId:'a1'}];return {choices:[{message:{content:JSON.stringify({...envelope().result,review,evidenceQuotes:undefined,answerEvidenceIds:[calls===1?'r999':'a1']})}}]};}};
 const body={realInterview:true,recall:'partial',question:'例子？',answer,resume:'背景',jd:'产品',role:'产品经理',detailedReview:true,reviewOnly:true};const out=await runAi('interview',body,cfg);assert.equal(calls,2);assert.equal(out.meta.reviewRepairAttempts,1);assert.ok(M.envelope(out,answer,'背景'));
 for(const recall of ['unknown','',null])await assert.rejects(runAi('interview',{...body,recall},cfg),/记不清/);assert.equal(calls,2,'Unknown recollection makes no provider call');
});
