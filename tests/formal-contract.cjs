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
