const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runAi,validateInterview,validateDiagnosis,validateRewrite,validateQuestionPlan,resumeParagraphs}=require('../ai-service');
const cfg={baseUrl:'http://controlled.local/v1',model:'test-model',apiKey:'fake-key'};
const evaluation={scores:{relevance:4,structure:3,evidence:3,depth:2},strengths:['行动清楚'],gaps:['补验证方法'],suggestions:['描述对比'],evidenceQuotes:['优化缓存'],followUp:'你如何验证？'};
test('interview scores and quotes must be grounded in the actual answer',()=>{
  assert.equal(validateInterview(evaluation,'我优化缓存').followUp,'你如何验证？');
  assert.throws(()=>validateInterview({...evaluation,evidenceQuotes:['没有说过']},'我优化缓存'),/原回答不符/);
  assert.throws(()=>validateInterview({...evaluation,scores:{...evaluation.scores,depth:6}},'我优化缓存'),/分数/);
  assert.equal(validateInterview(evaluation,'我优化缓存',true).followUp,'');
});
test('resume diagnosis validates source excerpts and merges repeated feedback',()=>{
  const result={overview:'缺少结果',matched:[],missing:['证据'],sections:[{original:'维护报表',issue:'需要行动',questions:['做了什么？']}]};
  assert.equal(validateDiagnosis(result,'我维护报表').sections.length,1);
  assert.throws(()=>validateDiagnosis(result,'我负责销售'),/分析未能整理完成/);
  const merged=validateDiagnosis({...result,sections:[...result.sections,...result.sections]},'我维护报表');assert.equal(merged.sections.length,1);assert.equal(merged.sections[0].start,1);assert.deepEqual(merged.sections[0].questions,['做了什么？']);
});
test('numbered paragraphs distinguish identical source text and retain every merged issue and question',()=>{
 const resume='  维护报表。\n项目乙\n  维护报表。',parts=resumeParagraphs(resume);
 assert.equal(parts.length,3);assert.equal(parts[0].original,parts[2].original);assert.notEqual(parts[0].start,parts[2].start);
 const result=validateDiagnosis({overview:'补事实',matched:[],missing:[],sections:[{paragraphId:'p3',issue:'缺少行动',questions:['怎么维护？']},{paragraphId:'p3',issue:'缺少结果',questions:['如何验证？']},{paragraphId:'p1',issue:'说明职责',questions:['负责什么？']}]},resume);
 assert.equal(result.sections.length,2);assert.equal(result.sections[1].start,parts[2].start);assert.equal(result.sections[1].issue,'缺少行动；缺少结果');assert.deepEqual(result.sections[1].questions,['怎么维护？','如何验证？']);
 for(const section of result.sections)assert.equal(resume.slice(section.start,section.start+section.original.length),section.original);
});
test('nested and transitively overlapping legacy excerpts merge to one exact source span',()=>{
 const resume='甲乙丙丁戊己庚辛';const sections=[['甲乙丙丁','问题一','问题1？'],['丙丁戊己','问题二','问题2？'],['己庚辛','问题三','问题3？'],['乙丙','问题四','问题4？']].map(([original,issue,q])=>({original,issue,questions:[q]}));
 const output=validateDiagnosis({overview:'补充事实',matched:[],missing:[],sections},resume);
 assert.equal(output.sections.length,1);assert.equal(output.sections[0].original,resume);assert.equal(output.sections[0].questions.length,4);assert.equal(output.sections[0].start,0);
});
test('invalid IDs, ambiguous legacy quotes, invented quotes and missing questions fail safely',()=>{
 const base={overview:'诊断',matched:[],missing:[]},resume='同一句。\n同一句。';
 for(const section of [{paragraphId:'p9',issue:'问题',questions:['补什么？']},{original:'同一句。',issue:'问题',questions:['补什么？']},{paragraphId:'p1',original:'编造',issue:'问题',questions:['补什么？']},{paragraphId:'p1',issue:'问题',questions:[]}]){
  assert.throws(()=>validateDiagnosis({...base,sections:[section]},resume),e=>e.status===502&&/无需调整原文/.test(e.message)&&!/重复或重叠/.test(e.message));
 }
 const long='甲'.repeat(1200);for(const p of resumeParagraphs(long))assert.ok(p.original.length<=500);
});
test('diagnosis offsets stay relative to the original input including leading whitespace',async()=>{
 const resume='\n  维护报表。\n';
 const out=await runAi('resume-diagnose',{resume,jd:''},{...cfg,transport:async(_c,payload)=>{
  const body=JSON.parse(payload.messages[1].content);assert.equal(body.resume,resume);
  return {choices:[{message:{content:JSON.stringify({overview:'待补充',matched:[],missing:[],sections:[{paragraphId:'p1',issue:'说明行动',questions:['做了什么？']}]})}}]};
 }});
 assert.equal(out.result.sections[0].start,3);assert.equal(resume.slice(out.result.sections[0].start,out.result.sections[0].start+out.result.sections[0].original.length),'维护报表。');assert.equal(out.meta.promptVersion,'2026-10-20.paragraphs.v2');
});
test('rewrite cannot introduce unsupported numbers or fabricated source quotes',()=>{
  const result={rewritten:'优化响应时间 20%',evidence:[{claim:'20%',source:'下降 20%'}]};
  assert.equal(validateRewrite(result,'响应时间下降 20%').rewritten,result.rewritten);
  assert.throws(()=>validateRewrite({...result,rewritten:'优化响应时间 50%',evidence:[{claim:'50%',source:'下降 20%'}]},'下降 20%'),/没有的数字/);
  assert.throws(()=>validateRewrite({...result,evidence:[{claim:'20%',source:'假的证据'}]},'下降 20%'),/材料不符/);
});
test('unconfirmed facts and missing Key stop before any model call',async()=>{
  const previous=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw new Error();};
  try{
    await assert.rejects(runAi('resume-rewrite',{confirmedFacts:false},cfg),/先确认/);
    await assert.rejects(runAi('test',{}, {...cfg,apiKey:''}),/未配置/);assert.equal(calls,0);
  }finally{global.fetch=previous;}
});
test('shared transport uses task-specific prompts, metadata and one follow-up',async()=>{
  const previous=global.fetch,calls=[];global.fetch=async(url,options)=>{
    const body=JSON.parse(options.body);calls.push({url,options,body});
    const user=JSON.parse(body.messages[1].content);
    const result=body.messages[0].content.includes('诊断简历')?{overview:'待补事实',matched:[],missing:['结果'],sections:[{original:'维护报表',issue:'缺少结果',questions:['如何验证？']}]}:{...evaluation,evidenceQuotes:[user.followUp?user.followUp.answer:user.answer]};
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(result)}}]})};
  };
  try{
    const a=await runAi('interview',{question:'项目是什么？',answer:'优化缓存',jd:'后端',role:'后端'},cfg);
    const b=await runAi('interview',{question:'项目是什么？',answer:'优化缓存',role:'后端',followUp:{question:a.result.followUp,answer:'通过压测验证'}},cfg);
    const c=await runAi('resume-diagnose',{resume:'维护报表',jd:'数据运营'},cfg);
    assert.equal(b.result.followUp,'');assert.equal(c.meta.model,'test-model');assert.equal(a.meta.promptVersion,'2026-10-13.v1');
    assert.deepEqual(JSON.parse(calls[2].body.messages[1].content).paragraphs,[{id:'p1',text:'维护报表'}]);assert.match(calls[2].body.messages[0].content,/paragraphId/);
    assert.match(calls[0].body.messages[0].content,/relevance/);assert.match(calls[2].body.messages[0].content,/个人贡献/);
    assert.equal(calls[0].options.headers.Authorization,'Bearer fake-key');assert.equal(calls[0].body.stream,false);
  }finally{global.fetch=previous;}
});
test('bad model JSON and upstream failure are clear errors without leaking credentials',async()=>{
  const previous=global.fetch;
  try{
    global.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:'{bad'}}]})});
    await assert.rejects(runAi('interview',{question:'项目？',answer:'回答',role:'通用'},cfg),/格式异常/);
    global.fetch=async()=>({ok:false,status:401});await assert.rejects(runAi('test',{},cfg),e=>e.status===502&&!e.message.includes('fake-key'));
    global.fetch=async()=>{throw Object.assign(new Error('fake-key'),{name:'TimeoutError'});};await assert.rejects(runAi('test',{},cfg),/超时/);
  }finally{global.fetch=previous;}
});
test('adopted sections replace original offsets without rewriting another candidate',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const html=fs.readFileSync(require('node:path').join(__dirname,'../app.html'),'utf8');
  const source=html.match(/  function composedResume\(\)\{[^\n]+\}/)[0];
  const context=vm.createContext({resumeState:{text:'原段甲\n原段乙',sections:[{original:'原段甲',adopted:'改写中引用原段乙'},{original:'原段乙',adopted:'第二段改写'}]}});
  vm.runInContext(source,context);assert.equal(context.composedResume(),'改写中引用原段乙\n第二段改写');
  context.resumeState={text:'相同原文\n中间内容\n相同原文',sections:[{original:'相同原文',start:10,adopted:'仅修改最后一段'}]};assert.equal(context.composedResume(),'相同原文\n中间内容\n仅修改最后一段');
});

test('personal interview plan requires exact count, unique questions and literal evidence from both supplied sources',()=>{
 const resume='维护运营报表，核对指标口径',jd='岗位要求：指标分析、跨团队沟通';
 const questions=Array.from({length:5},(_,i)=>({topic:'指标分析',q:'问题 '+i,points:['说明个人行动'],source:{kind:i%2?'jd':'resume',quote:i%2?'指标分析':'维护运营报表'}}));
 assert.equal(validateQuestionPlan({questions},resume,jd,5).questions.length,5);
 assert.throws(()=>validateQuestionPlan({questions:questions.slice(1)},resume,jd,5),/数量/);
 assert.throws(()=>validateQuestionPlan({questions:[questions[0],...questions.slice(0,4)]},resume,jd,5),/重复/);
 assert.throws(()=>validateQuestionPlan({questions:questions.map(q=>({...q,source:{kind:'resume',quote:'虚构项目'}}))},resume,jd,5),/依据/);
 assert.throws(()=>validateQuestionPlan({questions:questions.map(q=>({...q,source:{kind:'resume',quote:'维护运营报表'}}))},resume,jd,5),/同时覆盖/);
});
test('plan validates inputs before transport and retry evaluates only the new answer without another follow-up',async()=>{
 let calls=0;const configuration={...cfg,transport:async(c,p)=>{calls++;const user=JSON.parse(p.messages[1].content);assert.equal(user.retry,true);return {choices:[{message:{content:JSON.stringify({...evaluation,evidenceQuotes:[user.answer]})}}]};}};
 await assert.rejects(runAi('interview-plan',{resume:'',jd:'',count:5},configuration),/先填写/);
 await assert.rejects(runAi('interview-plan',{resume:'维护报表',count:99},configuration),/请选择/);assert.equal(calls,0);
 const r=await runAi('interview',{question:'如何验证？',answer:'我核对口径并交付周报',retry:true},configuration);assert.equal(r.result.followUp,'');assert.deepEqual(r.result.evidenceQuotes,['我核对口径并交付周报']);
});

test('formal HR/business policies change the prompt; turn responses expose only grounded decisions',async()=>{
 const seen=[],configuration={...cfg,transport:async(c,p)=>{seen.push(p);return {choices:[{message:{content:JSON.stringify({action:'followup',question:'你具体负责哪一部分？',quote:'整理需求',scores:{depth:0}})}}]};}};
 for(const interviewer of ['hr','business']){const out=await runAi('interview-turn',{interviewer,question:'项目职责是什么？',answer:'我整理需求并核对交付',jd:'产品经理'},configuration);assert.deepEqual(Object.keys(out.result).sort(),['action','question','quote']);assert.equal(out.meta.interviewer,interviewer);}
 assert.match(seen[0].messages[0].content,/求职动机/);assert.match(seen[1].messages[0].content,/业务主管/);
 await assert.rejects(runAi('interview-turn',{interviewer:'unknown',question:'职责？',answer:'回答'},configuration),/请选择/);
 await assert.rejects(runAi('interview-turn',{question:'职责？',answer:'回答',followUps:Array(3).fill({question:'追问',answer:'补充'})},configuration),/最多两次/);
 const invalid={...cfg,transport:async()=>({choices:[{message:{content:JSON.stringify({action:'followup',question:'为什么？',quote:'虚构原话'})}}]})};
 await assert.rejects(runAi('interview-turn',{question:'职责？',answer:'我整理需求'},invalid),/依据/);
});
test('formal end-of-session evaluation includes all follow-up evidence and suppresses further questions',async()=>{
 const configuration={...cfg,transport:async(c,p)=>{const u=JSON.parse(p.messages[1].content);assert.equal(u.followUps.length,2);return {choices:[{message:{content:JSON.stringify({...evaluation,evidenceQuotes:['核对交付记录']})}}]};}};
 const out=await runAi('interview',{interviewer:'hr',question:'如何验证？',answer:'我整理需求',followUps:[{question:'具体职责？',answer:'我列出边界'},{question:'如何验证？',answer:'核对交付记录'}],reviewOnly:true},configuration);assert.equal(out.result.followUp,'');assert.equal(out.meta.interviewer,'hr');
});
test('formal blueprint enforces competency coverage and rejects rubric drift before transport',async()=>{
 const {blueprint,competencyVersion}=require('../interview-policy'),b=blueprint('hr','产品');let calls=0;
 const configuration={...cfg,transport:async(c,p)=>{calls++;const u=JSON.parse(p.messages[1].content);assert.deepEqual(u.blueprint,b.competencies);return {choices:[{message:{content:JSON.stringify({questions:u.blueprint.map((a,i)=>({competencyId:a.id,topic:'任意文字',q:'具体问题'+i,points:['提示'],source:{kind:'jd',quote:'产品经理'}}))})}}]};}};
 const out=await runAi('interview-plan',{interviewer:'hr',role:'产品',jd:'产品经理',count:5,blueprintVersion:competencyVersion},configuration);assert.equal(out.result.questions[0].topic,'求职动机');assert.deepEqual(out.result.questions[0].criteria,b.competencies[0].criteria);
 await assert.rejects(runAi('interview-plan',{blueprintVersion:'invented',jd:'产品经理',count:5},configuration),/版本/);assert.equal(calls,1);
 assert.throws(()=>validateQuestionPlan({questions:out.result.questions.map(q=>({...q,competencyId:'hr.ownership'}))},'','产品经理',5,b),/考察能力/);
});
test('competency grading keeps the same criteria for retry and requires literal evidence for met judgments',async()=>{
 const {blueprint,competencyVersion}=require('../interview-policy'),a=blueprint('business').competencies[1];let forged=false;
 const configuration={...cfg,transport:async(c,p)=>{const u=JSON.parse(p.messages[1].content);assert.equal(u.competency.id,a.id);return {choices:[{message:{content:JSON.stringify({...evaluation,evidenceQuotes:['整理需求'],criteria:a.criteria.map(x=>({id:x.id,status:'met',quote:forged?'没说过':'整理需求',reason:'说明具体行动'}))})}}]};}};
 for(const retry of [false,true]){const out=await runAi('interview',{interviewer:'business',question:'职责？',answer:'我整理需求',blueprintVersion:competencyVersion,competencyId:a.id,reviewOnly:true,retry},configuration);assert.equal(out.meta.competencyId,a.id);assert.equal(out.result.criteria.length,2);}
 forged=true;await assert.rejects(runAi('interview',{question:'职责？',answer:'我整理需求',blueprintVersion:competencyVersion,competencyId:a.id,reviewOnly:true},configuration),/标准或回答依据/);
 await assert.rejects(runAi('interview',{interviewer:'hr',competencyId:a.id,blueprintVersion:competencyVersion,question:'职责？',answer:'整理需求'},configuration),/不属于/);
});
test('turn decisions carry bounded prior coverage and stop repeated questions or explicit unknown answers',async()=>{
 let calls=0;const c={...cfg,transport:async(c,p)=>{calls++;const u=JSON.parse(p.messages[1].content);assert.equal(u.history[0].answer,'我整理需求');assert.match(p.messages[0].content,/不要重复索取/);return {choices:[{message:{content:JSON.stringify({action:'followup',question:'你的职责是什么？',quote:'负责整理'})}}]};}};
 const body={question:'方案是什么？',answer:'我负责整理需求',history:[{question:'你的职责是什么',answer:'我整理需求'}]};const out=await runAi('interview-turn',body,c);assert.equal(out.result.action,'next');assert.equal(calls,1);
 assert.equal((await runAi('interview-turn',{question:'方案？',answer:'我不知道，下一题'},c)).meta.decisionSource,'rules');assert.equal(calls,1);
 await assert.rejects(runAi('interview-turn',{...body,history:Array(7).fill(body.history[0])},c),/摘要过长/);assert.equal(calls,1);
});
test('clarification is based on the question only and rejects ungrounded source quotes',async()=>{
 let forged=false;const c={...cfg,transport:async(c,p)=>{const u=JSON.parse(p.messages[1].content);assert.deepEqual(Object.keys(u).sort(),['interviewer','question']);assert.match(p.messages[0].content,/不提供解法/);return {choices:[{message:{content:JSON.stringify({explanation:'请说明备选方案之间的选择原因',quote:forged?'虚构题目':'取舍'})}}]};}};
 assert.equal((await runAi('interview-clarify',{question:'请解释方案取舍'},c)).result.quote,'取舍');forged=true;await assert.rejects(runAi('interview-clarify',{question:'请解释方案取舍'},c),/不在原问题/);
});
test('only user-selected in-scope focus is passed to a new plan, without treating old evidence as current answers',async()=>{
 const {competencyVersion}=require('../interview-policy');let calls=0;const c={...cfg,transport:async(c,p)=>{calls++;const u=JSON.parse(p.messages[1].content);assert.equal(u.focus[0].standard.id,'hr.motivation.direction');assert.match(p.messages[0].content,/既往片段不能作为本题已经回答/);return {choices:[{message:{content:JSON.stringify({questions:u.blueprint.map((a,i)=>({competencyId:a.id,topic:'考察',q:'新问题'+i,points:['标准'],source:{kind:'jd',quote:'产品经理'}}))})}}]};}};
 const focus=[{criterionId:'hr.motivation.direction',reason:'没讲清方向',sourceQuote:'整理需求',previousQuestion:'你为什么应聘？'}];await runAi('interview-plan',{interviewer:'hr',jd:'产品经理',count:5,blueprintVersion:competencyVersion,focus},c);assert.equal(calls,1);
 await assert.rejects(runAi('interview-plan',{interviewer:'business',jd:'产品经理',count:5,focus},c),/不属于/);assert.equal(calls,1);
 await assert.rejects(runAi('interview-plan',{jd:'产品经理',count:5,focus:[...focus,...focus,...focus]},c),/最多选择两项/);
});
