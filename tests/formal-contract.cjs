const {test}=require('node:test'),assert=require('node:assert/strict'),{validFormal,profiles}=require('../interview-policy');
test('overview isolates weaknesses, report and draft to the selected target, including legacy unlinked JDs',()=>{
 const {homeState,sameGoal}=require('../interview-policy');
 const a={mode:'formal',jobId:'a',jd:'相同职位要求'},b={mode:'formal',jobId:'b',jd:'相同职位要求'};
 const store={draft:b,records:[b,a]};assert.equal(homeState(a,store).last,a);assert.equal(homeState(a,store).draft,null);
 assert.equal(homeState({jobId:'new',jd:'新岗位'},store).last,null);assert.equal(homeState(b,store).draft,b);
 assert.equal(sameGoal({jd:'产品经理\n 需求分析'},{jd:' 产品经理 需求分析 '}),true);
 assert.equal(sameGoal({jd:'产品经理'},{jd:'后端开发'}),false);assert.equal(sameGoal({jd:'相同职位要求'},a),false);
 assert.equal(sameGoal({goalId:'one',jd:'同样 JD'},{goalId:'two',jd:'同样 JD'}),false);
 assert.equal(homeState({},store).last,b);
});
function record(){return {mode:'formal',interviewer:'business',count:7,index:1,status:'active',answers:['介绍','我整理需求','','','','',''],questions:[{kind:'intro'},...Array.from({length:5},()=>({kind:'main'})),{kind:'closing'}],formal:{phase:'active',turns:[],pending:null,draft:'',decisionPending:false,evaluations:Array(7).fill(null)}};}
test('unanswered practice retains snapshots and only resumes the missing role questions',()=>{
 const p=require('../interview-policy'),r=record();Object.assign(r,{id:'parent',date:'2026-10-25',status:'saved',jd:'产品经理',resume:'项目经历',role:'产品',goalId:'g'});r.formal.phase='report';r.questions.forEach((q,i)=>Object.assign(q,{q:'问题'+i,topic:'能力'+i,points:['标准']}));
 const baseline=JSON.stringify(r),child=p.unansweredSession(r,'child','2026-10-26');assert.deepEqual(child.continuation.indices,[2,3,4,5]);assert.equal(child.mode,'coaching');assert.equal(child.count,4);assert.equal(child.resume,r.resume);assert.deepEqual(child.questions,r.questions.slice(2,6));assert.ok(child.answers.every(x=>!x));assert.equal(child.formal,undefined);assert.ok(p.validPractice(child));assert.equal(JSON.stringify(r),baseline);
 for(const c of [{...child.continuation,indices:[2,2,4,5]},{...child.continuation,indices:[0,3,4,5]},{...child.continuation,recordId:'child'},{...child.continuation,questionKeys:['forged',...child.continuation.questionKeys.slice(1)]}])assert.equal(p.validPractice({...child,continuation:c}),false);
 r.answers.fill('完整回答');assert.equal(p.unansweredSession(r,'none','2026-10-26'),null);assert.equal(p.unansweredSession({...r,status:'active'},'none','2026-10-26'),null);
});
test('goal progress isolates goals and interviewer, counts continuation coverage without rewriting parent',()=>{
 const p=require('../interview-policy'),r=record();Object.assign(r,{id:'parent',date:'2026-10-25',status:'saved',jd:'同样 JD',resume:'经历',role:'产品',goalId:'g'});r.formal.phase='report';r.questions.forEach((q,i)=>Object.assign(q,{q:'问题'+i,topic:'能力'+i,points:['标准']}));const c=p.unansweredSession(r,'child','2026-10-26');c.answers[0]='补练回答';const store={draft:c,records:[r,{...r,id:'other-goal',goalId:'other'},{...r,id:'other-role',interviewer:'hr'}]},original=JSON.stringify(store);
 let result=p.goalProgress({goalId:'g',jd:r.jd,interviewer:'business'},store);assert.equal(result.sessions,1);assert.deepEqual(result.unanswered,[3,4,5]);assert.equal(result.draft.id,'child');assert.equal(result.reviewed,0);assert.equal(result.improved.length,0);assert.equal(JSON.stringify(store),original);
 assert.equal(p.goalProgress({goalId:'g',jd:r.jd,interviewer:'hr'},store).draft,null);assert.equal(p.goalProgress({goalId:'missing',jd:r.jd,interviewer:'business'},store).sessions,0);
 const e=(model,score,facts=[])=>({meta:{model,promptVersion:'v1'},result:{scores:{relevance:score,structure:score,evidence:score,depth:score},review:{missingFacts:facts}}});c.ai[0]={initial:e('a',2),retry:{answer:'更具体的回答',evaluation:e('b',4)}};result=p.goalProgress({goalId:'g',interviewer:'business'},store);assert.equal(result.improved.length,0,'different models are not compared');c.ai[0].retry.evaluation.meta.model='a';assert.equal(p.goalProgress({goalId:'g',interviewer:'business'},store).improved.length,1);
});
test('goal preparation validates distinct identities, material provenance and immutable run references',()=>{
 const {validGoals,validPreparation}=require('../interview-policy');
 const setup={jd:'产品经理',resume:'整理需求',interviewer:'hr',mode:'formal',roleSelection:'auto',resumeSource:'resume-version',resumeVersionId:'v1',resumeLabel:'版本一'};
 const goal={id:'a',name:'A岗位',jobId:'job-a',defaults:setup,working:{...setup,resume:'临时材料'}};
 const state={schemaVersion:1,activeId:'a',goals:[goal]};assert.ok(validGoals(state));
 assert.equal(validGoals({...state,goals:[goal,{...goal,id:'b'}]}),false);assert.equal(validGoals({...state,activeId:'missing'}),false);
 assert.equal(validGoals({...state,goals:[{...goal,working:{...setup,resumeSource:'forged'}}]}),false);
 const run={goalId:'a',preparation:{goalId:'a',goalName:'A岗位',origin:'session',resumeSource:'resume-version',resumeVersionId:'v1',resumeLabel:'版本一',confirmed:true}};assert.ok(validPreparation(run));
 assert.equal(validPreparation({...run,preparation:{...run.preparation,goalId:'b'}}),false);
 assert.ok(validPreparation({}));assert.equal(state.goals[0].defaults.resume,'整理需求');
});
test('formal state validates follow-up provenance, limits, phases and malformed imports without throwing',()=>{
 const r=record();assert.ok(validFormal(r,()=>true));r.formal.pending={question:'具体是什么？',quote:'整理需求'};assert.ok(validFormal(r,()=>true));r.formal.pending.quote='虚构原话';assert.equal(validFormal(r,()=>true),false);r.formal.pending=null;
 r.formal.turns=[{index:1,question:'职责？',quote:'整理需求',answer:'核对交付'}];r.formal.pending={question:'怎么核对？',quote:'核对交付'};assert.ok(validFormal(r,()=>true));r.formal.pending=null;r.formal.turns.push({index:1,question:'怎么验证？',quote:'核对交付',answer:'比较记录'});assert.ok(validFormal(r,()=>true));r.formal.turns.push({...r.formal.turns[1]});assert.equal(validFormal(r,()=>true),false);
 for(const patch of [{turns:[null]},{pending:undefined},{evaluations:[]},{phase:'invented'}]){const x=record();Object.assign(x.formal,patch);assert.doesNotThrow(()=>validFormal(x,()=>true));assert.equal(validFormal(x,()=>true),false);}
 const saved=record();saved.status='saved';assert.equal(validFormal(saved,()=>true),false);saved.formal.phase='report';assert.ok(validFormal(saved,()=>true));saved.formal.evaluations[1]={result:{evidenceQuotes:['伪造']}};assert.equal(validFormal(saved,()=>true),false);
 assert.ok(profiles.hr.focus!==profiles.business.focus);assert.ok(validFormal({count:5},()=>true));
});
test('frozen blueprint rejects changed criteria and capability swaps while legacy records remain valid',()=>{
 const p=require('../interview-policy'),r=record();r.role='产品';r.blueprint=p.blueprint('business','产品');r.questions.slice(1,6).forEach((q,i)=>Object.assign(q,{competencyId:r.blueprint.competencies[i].id,criteria:r.blueprint.competencies[i].criteria}));assert.ok(p.validFormal(r,()=>true));
 const changed=JSON.parse(JSON.stringify(r));changed.blueprint.competencies[0].criteria[0].description='临时换标准';assert.equal(p.validFormal(changed,()=>true),false);
 const swapped=JSON.parse(JSON.stringify(r));swapped.questions[1].competencyId=r.blueprint.competencies[1].id;assert.equal(p.validFormal(swapped,()=>true),false);
 delete r.blueprint;r.questions.forEach(q=>{delete q.competencyId;delete q.criteria;});assert.ok(p.validFormal(r,()=>true));
});
test('practice tasks preserve baseline evidence and only verify a matching criterion with new quoted evidence',()=>{
 const p=require('../interview-policy'),r=record();r.id='parent';r.role='产品';r.status='saved';r.formal.phase='report';r.blueprint=p.blueprint('business','产品');r.questions.slice(1,6).forEach((q,i)=>Object.assign(q,{q:'问题'+i,competencyId:r.blueprint.competencies[i].id,criteria:r.blueprint.competencies[i].criteria}));
 const a=r.blueprint.competencies[0],envelope={meta:{interviewer:'business',competencyVersion:p.competencyVersion,competencyId:a.id,model:'m',createdAt:'2026-10-15'},result:{evidenceQuotes:['整理需求'],criteria:a.criteria.map((c,i)=>({id:c.id,status:i?'met':'missing',quote:i?'整理需求':'',reason:i?'已说明':'缺少目标与约束'}))}};r.formal.evaluations[1]=envelope;r.formal.tasks=p.deriveTasks(r);assert.equal(r.formal.tasks.length,1);assert.ok(p.validTasks(r));
 const task=r.formal.tasks[0],answer='我先确定需求目标，列出时间和资源约束',evaluation=JSON.parse(JSON.stringify(envelope));evaluation.result.criteria[0]={...evaluation.result.criteria[0],status:'met',quote:'确定需求目标',reason:'重答增加了目标与约束'};evaluation.result.criteria[1].quote='资源约束';
 const result=p.verifyTask(task,evaluation,answer);assert.equal(result.outcome,'verified');assert.equal(task.status,'suggested');
 task.status='verified';task.attempts.push({recordId:'practice',date:'2026-10-15',answer,model:'m',version:p.competencyVersion,...result});assert.ok(p.validTasks(r));
 const forged=JSON.parse(JSON.stringify(r));forged.formal.tasks[0].attempts[0].criterion.quote='没说过';assert.equal(p.validTasks(forged),false);
 const wrong=JSON.parse(JSON.stringify(evaluation));wrong.meta.competencyVersion='new';assert.throws(()=>p.verifyTask(task,wrong,answer),/不一致/);
 const uncertain=JSON.parse(JSON.stringify(evaluation));uncertain.result.criteria[0]={...uncertain.result.criteria[0],status:'unknown',quote:''};assert.equal(p.verifyTask(task,uncertain,answer).outcome,'unknown');
 const missing=JSON.parse(JSON.stringify(evaluation));missing.result.criteria[0]={...missing.result.criteria[0],status:'missing',quote:''};assert.equal(p.verifyTask(task,missing,answer).outcome,'needs_more');
});
test('resume document references are optional for legacy materials and validated in goal/run snapshots',()=>{
 const {validSetup,validPreparation}=require('../interview-policy'),setup={jd:'产品经理',resume:'已确认的新简历',interviewer:'hr',mode:'formal',roleSelection:'auto',resumeSource:'resume-version',resumeVersionId:'v1',resumeLabel:'已确认版本'},doc={id:'a'.repeat(32),name:'resume.pdf',ext:'.pdf',pages:2};
 assert.ok(validSetup(setup));assert.ok(validSetup({...setup,resumeDocument:doc}));assert.equal(validSetup({...setup,resumeDocument:{...doc,id:'../other'}}),false);assert.equal(validSetup({...setup,resumeDocument:{...doc,pages:31}}),false);
 const run={goalId:'g',preparation:{goalId:'g',goalName:'目标',origin:'session',resumeSource:setup.resumeSource,resumeVersionId:'v1',resumeLabel:setup.resumeLabel,confirmed:true,resumeDocument:doc}};assert.ok(validPreparation(run));assert.equal(validPreparation({...run,preparation:{...run.preparation,resumeDocument:{...doc,ext:'.html'}}}),false);
});
