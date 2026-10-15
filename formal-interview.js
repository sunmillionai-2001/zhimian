// Formal simulation UI. The shared policy validates imported records; existing stores own persistence.
window.FormalInterview=(()=>{
 const $=id=>document.getElementById(id),key='zm_interview_setup_v1';
 let ready=false,reviewBusy=false,setupBlocked=false,setupConfirmed='';
 const label=r=>r.jobSnapshot?[r.jobSnapshot.company,r.jobSnapshot.role].filter(Boolean).join(' · '):(r.jd||'尚未设置目标岗位').split('\n')[0].slice(0,100);
 const profile=r=>InterviewPolicy.profile(r.interviewer||'business');
 function setStageMode(formal){document.querySelector('#mock .mock-wrap')?.classList.toggle('is-formal',formal);}
 function showSetup(){setStageMode(false);$('mockJd')?.focus({preventScroll:true});}
 function restoreControls(r){if(!ready)return;$('mockMode').value=r.mode||'coaching';$('mockInterviewer').value=r.interviewer||'business';setupConfirmed=r.resume||'';$('mockConfirmResume').checked=!!r.resume;updateControls();}
 function updateControls(){const formal=$('mockMode').value==='formal';$('formalStartControls').hidden=!formal;$('coachingStartControls').hidden=formal;$('mockAdvanced').open=!formal;$('mockInterviewerFocus').textContent='重点考察：'+InterviewPolicy.profile($('mockInterviewer').value).focus;$('mockResumeCheck').textContent=$('mockProfile').value.trim()?'本场会使用上方这份简历快照，后续修改不会改变旧报告。':'可以先用目标 JD 开练；缺少经历时，个性化程度会有限。';}
 function saveSetup(){
  if(!ready||setupBlocked)return;
  try{localStorage.setItem(key,JSON.stringify({jd:$('mockJd').value,resume:$('mockProfile').value,jobId:$('mockJob').value,interviewer:$('mockInterviewer').value,mode:$('mockMode').value}));}catch{storageMsg('准备材料未能写入浏览器，当前输入仍保留。');}
  updateControls();refreshHome();
 }
 function refreshHome(){
  if(!ready||!$('overviewTraining'))return;
  const current={jd:$('mockJd').value,...selectedJobAssociation('mockJob')};
  const {context,draft,last}=InterviewPolicy.homeState(current,mockStore),r=draft||last||context;
  const goal=r?label(r):($('mockJd').value.trim().split('\n')[0]||'还没有目标岗位');
  const reviews=last?.formal?.evaluations.filter(Boolean)||[],weak=reviews.flatMap(e=>e.result.gaps)[0];
  $('overviewTraining').innerHTML=`<span class="eyebrow">Your next interview</span><h3>${esc(goal)}</h3><p>${draft?(draft.status==='active'?'有一场尚未完成的'+(draft.mode==='formal'?'正式模拟':'专项练习')+'，可以接着上次的位置继续。':'上次面试已结束，可以查看并完善复盘。'):'确认目标岗位与简历，完整练一场，再针对薄弱点重练。'}</p><p class="mock-note">${weak?'上次优先改进：'+esc(weak):'准备流程：目标岗位 → 简历确认 → 正式模拟 → 统一复盘 → 专项练习'}</p><div class="paste-actions">${draft?'<button class="btn btn-primary" id="homeContinue">继续上次练习 / 复盘 →</button>':''}<button class="btn ${draft?'btn-ghost':'btn-primary'}" id="homePrepare">准备正式模拟 →</button>${last?'<button class="btn btn-ghost" id="homeLastReport">查看上次正式复盘</button>':''}</div>`;
  $('homeContinue')?.addEventListener('click',()=>{if(mockAiBusy)return;go('mock');resumeDraft();});
  $('homePrepare').onclick=()=>{if(mockAiBusy)return;go('mock');showSetup();$('mockMode').value='formal';updateControls();};
  $('homeLastReport')?.addEventListener('click',()=>{go('mock');viewHistory(mockStore.records.indexOf(last));});
 }
 function init(){
  ready=true;
  try{const raw=localStorage.getItem(key);if(raw){const data=JSON.parse(raw);if(!data||typeof data.jd!=='string'||data.jd.length>10000||typeof data.resume!=='string'||data.resume.length>30000||!['formal','coaching'].includes(data.mode)||!Object.hasOwn(InterviewPolicy.profiles,data.interviewer))throw Error();
   if(!mockStore.draft){$('mockJd').value=data.jd;$('mockProfile').value=data.resume;if(Array.from($('mockJob').options).some(o=>o.value===data.jobId))$('mockJob').value=data.jobId;$('mockMode').value=data.mode;$('mockInterviewer').value=data.interviewer;parseJd();}
  }}catch{setupBlocked=true;storageMsg('上次准备材料格式异常，原数据保留；本次可重新填写并开始面试。');}
  if(mockStore.draft)restoreControls(mockStore.draft);
  for(const id of ['mockMode','mockInterviewer','mockJd','mockJob'])$(id).addEventListener('change',saveSetup);
  $('mockProfile').addEventListener('input',()=>{$('mockConfirmResume').checked=false;setupConfirmed='';saveSetup();});
  $('mockConfirmResume').onchange=()=>{setupConfirmed=$('mockConfirmResume').checked?$('mockProfile').value.trim():'';};
  $('mockUseResume').onclick=()=>{if(resumeBlocked){$('mockPlanMsg').textContent='简历助手存储异常，请先导出检查。';return;}const value=composedResume();if(value.length>30000){$('mockPlanMsg').textContent='简历当前版本超过 30000 字，请先精简或仅粘贴相关经历。';return;}if(!value.trim()){$('mockPlanMsg').textContent='简历助手还没有正文，可先直接粘贴经历。';return;}
   if($('mockProfile').value.trim()&&$('mockProfile').value.trim()!==value.trim()&&!confirm('用简历助手的当前版本替换本次准备材料？已保存的面试不变。'))return;
   $('mockProfile').value=value;if(!$('mockJd').value.trim())$('mockJd').value=resumeState.jd;$('mockConfirmResume').checked=false;setupConfirmed='';saveSetup();$('mockPlanMsg').textContent='已带入当前采用的简历，请核对后勾选确认。';};
  $('formalStart').onclick=start;$('overviewPrepareTarget').onclick=()=>{if(mockAiBusy)return;go('mock');showSetup();$('mockMode').value='formal';updateControls();};updateControls();refreshHome();
 }
 async function start(){
  if(mockAiBusy||mockPlanBusy||mockStorageBlocked)return;
  const message=$('mockPlanMsg'),jd=$('mockJd').value.trim(),resume=$('mockProfile').value.trim();
  if(!jd){message.textContent='正式模拟需要目标岗位，请先选择岗位或粘贴 JD。';return;}
  if(jd.length>10000){message.textContent='目标 JD 最多 10000 字，请精简后开始。';return;}
  if(resume.length>30000){message.textContent='简历 / 经历最多 30000 字，请精简后开始。';return;}
  if(resume&&(!$('mockConfirmResume').checked||setupConfirmed!==resume)){message.textContent='请先核对本次简历 / 经历并勾选确认。';return;}
  if(mockStore.draft&&!confirm('开始新的正式模拟会替换当前草稿，已保存记录保留。继续吗？'))return;
  stopMockVoice();stopTimer();if(mockSession?.status==='active'&&!persistDraft()){message.textContent='草稿保存失败，请先导出备份。';return;}
  parseJd();saveSetup();const context={jd,resume,role:mockRole,roleSelection:$('mockRole').value,interviewer:$('mockInterviewer').value,...selectedJobAssociation('mockJob')};
  const controls=[...document.querySelectorAll('#mock .mock-setup input,#mock .mock-setup textarea,#mock .mock-setup select,#mock .mock-setup button')],disabled=controls.map(el=>el.disabled);
  controls.forEach(el=>el.disabled=true);mockPlanBusy=true;setMockAiBusy(true);message.textContent='面试官正在根据岗位与经历准备问题，原材料和草稿会保留…';
  try{
   const plan=await requestAi('interview-plan',{...context,count:5});
   if(plan.result?.questions?.length!==5||!plan.result.questions.every(q=>q&&typeof q.q==='string'&&typeof q.topic==='string'&&Array.isArray(q.points)&&q.points.length>0&&q.points.every(x=>typeof x==='string')&&q.source&&['resume','jd'].includes(q.source.kind)&&typeof q.source.quote==='string'&&q.source.quote.trim()&&(q.source.kind==='resume'?resume:jd).includes(q.source.quote)))throw Error('题目或材料依据异常，请重试。');
   const questions=[{kind:'intro',topic:'开场介绍',q:'请用两分钟介绍与你目标岗位最相关的经历，以及这次求职的方向。',points:['相关经历','个人职责','求职方向']},...plan.result.questions.map(q=>({...q,kind:'main'})),{kind:'closing',topic:'候选人反问',q:'面试接近结束，你有什么想向面试官了解的问题？也可以直接结束。',points:[]}];
   const session={schemaVersion:2,id:crypto.randomUUID(),date:new Date().toISOString(),...context,mode:'formal',questionPlan:plan.meta,questions,answers:Array(7).fill(''),durations:Array(7).fill(0),ai:Array(7).fill(null),count:7,index:0,rate:'未评',keywords:mockFound.slice(),status:'active',formal:{phase:'active',turns:[],pending:null,draft:'',decisionPending:false,evaluations:Array(7).fill(null)}};
   if(!writeMockStore({...mockStore,draft:session})){message.textContent='新场次保存失败，原草稿仍保留，请先导出备份。';return;}
   mockSession=session;mockQuestions=session.questions;mockAnswers=session.answers;mockIdx=0;mockSec=0;mockSelfRate='';message.textContent='已准备好，正式模拟开始。';renderQuestion();renderMockHistory();
  }catch(e){message.textContent=e.message+' 材料和原草稿已保留，可重试或切换专项练习。';}
  finally{mockPlanBusy=false;setMockAiBusy(false);controls.forEach((el,i)=>el.disabled=disabled[i]);renderMockHistory();if(mockSession?.status==='active')startTimer();}
 }
 function renderQuestion(){
  const r=mockSession,f=r.formal,p=profile(r),q=f.pending?.question||mockQuestions[mockIdx].q,closing=mockIdx===6;
  setStageMode(true);$('mockStage').innerHTML=`<div class="formal-stage"><div class="stage-bar"><div class="who">${r.interviewer==='hr'?'HR':'面'}</div><div><div class="who-name">${esc(p.name)} · 正式模拟</div><div class="who-sub">${esc(label(r))}</div></div><div class="stage-timer"><span class="step">${mockIdx===0?'开场':closing?'候选人反问':'岗位问题 '+mockIdx+'/5'}</span><span class="t" id="mockClock"></span></div></div><div class="stage-body"><div class="formal-toolbar"><span class="formal-status" id="formalStatus">${f.decisionPending?'回答已保存，等待面试官判断下一步':'轮到你回答'}</span><button class="btn btn-ghost" id="formalEnd">提前结束并复盘</button><button class="btn btn-ghost" id="formalSetup">查看准备材料</button></div><div class="formal-progress"><span style="width:${Math.round(mockIdx/7*100)}%"></span></div>${mockIdx===0?`<p>你好，我是本场的${esc(p.name)}。我们重点聊${esc(p.focus)}。预计约 15 分钟，结束后会统一整理复盘。</p>`:''}<div class="q-topic">${f.pending?'针对刚才回答的追问':esc(mockQuestions[mockIdx].topic)}</div><div class="formal-question">${esc(q)}</div><p class="mock-note">${closing?'你的反问会保留在报告中。模拟面试官不代表真实企业，不会编造公司政策。':'正式模拟中不展示评分与参考答案，回答后根据内容继续追问或进入下一题。'}</p></div><div class="stage-foot"><div id="mockVoiceTools"></div><label for="mockA">${closing?'你想了解的问题':'本次回答'}</label><textarea id="mockA" maxlength="12000" ${f.decisionPending?'readonly':''} aria-label="本题回答"></textarea><div class="formal-toolbar"><button class="btn btn-primary" id="formalNext">${f.decisionPending?'重试面试官回应':closing?'结束面试，查看复盘':'我答完了 →'}</button><button class="btn btn-ghost" id="formalSkip">${f.decisionPending?'先进入下一题':closing?'没有问题，结束面试':'跳过本题'}</button></div><p id="formalMessage" class="mock-note" role="status" aria-live="polite"></p></div><details class="formal-transcript"><summary>已记录的回答（${mockAnswers.filter(a=>a.trim()).length} 道主问题，含开场）</summary>${mockQuestions.slice(0,mockIdx+1).map((q,i)=>`<p><b>${esc(q.topic)}</b> · ${esc(q.q)}</p><blockquote>${esc(mockAnswers[i]||'尚未作答')}</blockquote>`+f.turns.filter(t=>t.index===i).map(t=>`<p>追问：${esc(t.question)}</p><blockquote>${esc(t.answer||'跳过追问')}</blockquote>`).join('')).join('')}</details></div>`;
  const input=$('mockA');input.value=f.pending?f.draft:mockAnswers[mockIdx];input.oninput=()=>{if(f.pending)f.draft=input.value;else mockAnswers[mockIdx]=input.value;persistDraft();};
  $('formalNext').onclick=submit;$('formalSkip').onclick=()=>{if(mockAiBusy)return;stopMockVoice();if(f.pending){f.turns.push({index:mockIdx,...f.pending,answer:f.draft});f.pending=null;f.draft='';}advance();};
  $('formalEnd').onclick=()=>{if(mockAiBusy)return;if(confirm('提前结束这场面试？已填写的回答会进入复盘，未答题不会计为零分。'))finish();};
  $('formalSetup').onclick=showSetup;if(!f.decisionPending)mountMockVoice('mockA','mockVoiceTools');startTimer();
 }
 function elapsed(){return mockSession.durations.reduce((sum,n,i)=>sum+(i===mockIdx?mockSec:n),0);}
 function clock(){const el=$('mockClock');if(!el||mockSession?.mode!=='formal'||mockSession.status!=='active')return;const n=Math.max(0,900-elapsed());el.textContent=n?String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'):'建议时间已到';}
 async function submit(){
  if(mockAiBusy||!mockSession||mockSession.status!=='active')return;stopMockVoice();
  const r=mockSession,f=r.formal,index=mockIdx,id=r.id,message=t=>{if($('formalMessage'))$('formalMessage').textContent=t;};
  if(!f.decisionPending){const answer=f.pending?f.draft:mockAnswers[index];if(!answer.trim()){message('请先回答，或选择跳过。');return;}
   if(f.pending){f.turns.push({index,...f.pending,answer});f.pending=null;f.draft='';}f.decisionPending=true;
  }
  if(!persistDraft()){message('回答未能保存，请先导出备份。');return;}
  if(index===0||index===6||f.turns.filter(t=>t.index===index).length===2){advance();return;}
  stopTimer();setMockAiBusy(true);message('面试官正在思考下一步，回答已保存…');$('formalStatus').textContent='面试官思考中';
  try{
   const turns=f.turns.filter(t=>t.index===index),out=await requestAi('interview-turn',{question:mockQuestions[index].q,answer:mockAnswers[index],followUps:turns.map(t=>({question:t.question,answer:t.answer})),jd:r.jd,resume:r.resume,interviewer:r.interviewer});
   if(mockSession?.id!==id||mockIdx!==index)return;const v=out.result;if(!v||!['next','followup'].includes(v.action))throw Error('面试官回应格式异常');
   if(v.action==='followup'){
    if(typeof v.question!=='string'||!v.question.trim()||v.question.length>1000||typeof v.quote!=='string'||!v.quote.trim()||!InterviewPolicy.combined(snapshot(),index).includes(v.quote))throw Error('追问依据异常');
    f.pending={question:v.question,quote:v.quote};f.decisionPending=false;persistDraft();renderQuestion();
   }else advance();
  }catch(e){renderQuestion();message(e.message+' 回答已保存，可重试或进入下一题。');}
  finally{setMockAiBusy(false);if(mockSession?.id===id&&r.status==='active')startTimer();}
 }
 function advance(){const f=mockSession.formal;stopMockVoice();stopTimer();f.pending=null;f.draft='';f.decisionPending=false;if(mockIdx===6){finish();return;}mockIdx++;mockSec=mockSession.durations[mockIdx];persistDraft();renderQuestion();}
 function finish(){
  stopMockVoice();stopTimer();const f=mockSession.formal;if(f.pending){f.turns.push({index:mockIdx,...f.pending,answer:f.draft});}f.pending=null;f.draft='';f.decisionPending=false;f.phase='report';mockSession.status='report';persistDraft();renderReport();renderMockHistory();evaluateReport();
 }
 function reviewable(r){return r.questions.map((q,i)=>i).filter(i=>i<6&&InterviewPolicy.combined(r,i).trim());}
 function reportHtml(r){
  const f=r.formal,entries=reviewable(r),done=entries.filter(i=>f.evaluations[i]),strengths=[...new Set(done.flatMap(i=>f.evaluations[i].result.strengths))].slice(0,3),seen=new Set(),gaps=[...done.filter(i=>i>0),...done.filter(i=>i===0)].flatMap(i=>f.evaluations[i].result.gaps.map(text=>({text,index:i}))).filter(g=>{if(seen.has(g.text))return false;seen.add(g.text);return true;}).slice(0,3);
  return `<h3>正式模拟复盘 · ${esc(profile(r).name)}</h3><p>${esc(label(r))} · ${esc(displayMockDate(r.date))}</p><p class="mock-note">${entries.length} 道回答有内容 · ${done.length} 道完成 AI 复盘 · 候选人反问单独记录、不评分。分数仅供练习参考。</p><div class="formal-review-grid"><div><h4>哪里讲清楚了</h4>${strengths.length?'<ul>'+strengths.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>':'<p>完成复盘后，根据你的原话展示具体优点。</p>'}</div><div><h4>下一次优先练什么</h4>${gaps.length?gaps.map(g=>`<p>${esc(g.text)}</p><button class="btn btn-ghost" data-formal-locate="${g.index}">查看回答依据</button><button class="btn btn-ghost" data-formal-practice="${g.index}">专项重练第 ${g.index+1} 题 →</button>`).join(''):'<p>有内容的回答会逐项复盘；未回答的题目不填零分。</p>'}</div></div><p id="formalReviewStatus" role="status" class="mock-note"></p>${done.length<entries.length?'<button class="btn btn-primary" id="formalEvaluate">'+(done.length?'继续生成剩余复盘':'生成统一复盘')+'</button>':''}<div class="paste-actions"><button class="btn btn-ghost" data-formal-resume>去简历助手补充事实</button><button class="btn btn-ghost" data-formal-setup>准备下一场正式模拟</button></div><h4>回答与评价依据</h4>${r.questions.map((q,i)=>`<details class="report-item" id="formalAnswer${i}"><summary>${i+1}. ${esc(q.topic)} · ${i===6?'候选人反问':!r.answers[i].trim()?'跳过 / 未回答':f.evaluations[i]?'已复盘':'尚未复盘'}</summary><p>${esc(q.q)}</p>${questionSource(q)}<blockquote style="white-space:pre-wrap">${esc(r.answers[i]||'未回答，不评分')}</blockquote>${f.turns.filter(t=>t.index===i).map(t=>`<p><b>追问</b> ${esc(t.question)}</p><blockquote style="white-space:pre-wrap">${esc(t.answer||'未回答追问')}</blockquote>`).join('')}${f.evaluations[i]?aiFeedbackHtml(f.evaluations[i],'依据本题全部回答的点评')+`<button class="btn btn-primary" data-formal-practice="${i}">把这道题再练一次 →</button>`:''}</details>`).join('')}`;
 }
 function bindReport(r){
  document.querySelectorAll('[data-formal-locate]').forEach(b=>b.onclick=()=>{const item=$('formalAnswer'+b.dataset.formalLocate);item.open=true;item.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
  document.querySelectorAll('[data-formal-practice]').forEach(b=>b.onclick=()=>practice(r,Number(b.dataset.formalPractice)));
  document.querySelectorAll('[data-formal-resume]').forEach(b=>b.onclick=()=>{go('resume');resumeMsg('请根据正式模拟中缺少的事实完善经历；本场面试材料与原回答会保留。');});
  document.querySelectorAll('[data-formal-setup]').forEach(b=>b.onclick=()=>{showSetup();$('mockMode').value='formal';updateControls();});
  if($('formalEvaluate'))$('formalEvaluate').onclick=()=>evaluateReport(r);
 }
 function renderReport(){setStageMode(true);const r=snapshot(),saved=mockSession.status==='saved';$('mockStage').innerHTML=`<div class="report formal-stage">${reportHtml(r)}<div class="report-actions"><button class="btn btn-primary" id="mockSave" ${saved||mockAiBusy?'disabled':''}>${saved?'已保存 ✓':'保存正式模拟记录'}</button><button class="btn btn-ghost" id="formalExport">导出面试备份</button></div></div>`;bindReport(r);$('mockSave').onclick=saveMock;$('formalExport').onclick=exportMock;if($('formalEvaluate'))$('formalEvaluate').disabled=mockAiBusy;}
 async function evaluateReport(record=mockSession){
  if(reviewBusy||mockAiBusy||!record||record.mode!=='formal'||record.status==='active')return;const isCurrent=record.id===mockSession?.id;
  // History reports may be completed without replacing the current draft.
  const target=isCurrent?mockSession:mockStore.records.find(r=>r.id===record.id);if(!target)return;
  reviewBusy=true;setMockAiBusy(true);const todo=reviewable(target).filter(i=>!target.formal.evaluations[i]);let failure='';
  try{for(const index of todo){if($('formalReviewStatus'))$('formalReviewStatus').textContent='正在复盘第 '+(index+1)+' 题，已完成 '+reviewable(target).filter(i=>target.formal.evaluations[i]).length+' 道；回答已保留…';
    const out=await requestAi('interview',{question:target.questions[index].q,answer:target.answers[index],followUps:target.formal.turns.filter(t=>t.index===index&&t.answer.trim()).map(t=>({question:t.question,answer:t.answer})),jd:target.jd,resume:target.resume,role:target.role,interviewer:target.interviewer,reviewOnly:true});
    if(!isInterviewEnvelope(out)||!out.result.evidenceQuotes.length||!out.result.evidenceQuotes.every(q=>InterviewPolicy.combined(target,index).includes(q)))throw Error('复盘引用与原回答不符');
    target.formal.evaluations[index]=out;
    if(target.status==='saved'){if(!writeMockStore({...mockStore,records:mockStore.records.map(r=>r.id===target.id?{...target}:r)}))throw Error('复盘保存失败，请导出备份');}
    else if(!persistDraft())throw Error('复盘保存失败，请导出备份');
   }}catch(e){failure=e.message;}
  finally{reviewBusy=false;setMockAiBusy(false);if(isCurrent)renderReport();else{$('mockStage').innerHTML='<div class="report formal-stage">'+reportHtml(target)+'</div>';bindReport(target);}if($('formalReviewStatus'))$('formalReviewStatus').textContent=failure?failure+' 已完成的点评和回答会保留，可继续生成剩余复盘。':reviewable(target).length?'本场复盘已整理，可展开查看依据，再选择一个薄弱问题重练。':'本场没有可评价的回答，已保留题目与反问，可准备下一场。';refreshHome();}
 }
 function practice(record,index){
  if(mockAiBusy||reviewBusy)return;const original=record.id===mockSession?.id?mockSession:mockStore.records.find(r=>r.id===record.id);if(!original?.formal?.evaluations[index])return;
  if(mockSession&&mockSession.status!=='saved'&&mockSession.id!==original.id&&!persistDraft())return;
  if(original.status!=='saved'){
   if(!writeMockStore({...mockStore,records:[{...original,status:'saved'},...mockStore.records.filter(r=>r.id!==original.id)],draft:mockStore.draft?.id===original.id?null:mockStore.draft}))return;original.status='saved';
  }
  if(mockStore.draft&&mockStore.draft.id!==original.id&&!confirm('开始这道专项练习会替换当前草稿；正式模拟报告保留。继续吗？'))return;
  const answer=InterviewPolicy.combined(original,index),session={schemaVersion:2,id:crypto.randomUUID(),date:new Date().toISOString(),jd:original.jd,resume:original.resume,role:original.role,roleSelection:original.roleSelection||'auto',...(original.jobId?{jobId:original.jobId,jobSnapshot:original.jobSnapshot}:{}),mode:'coaching',interviewer:original.interviewer,origin:{recordId:original.id,index},questions:[original.questions[index]],answers:[answer],durations:[0],ai:[{sourceAnswer:answer,initial:original.formal.evaluations[index],followUpAnswer:'',final:null,retry:{answer:'',evaluation:null}}],count:1,index:0,rate:'未评',keywords:original.keywords.slice(),status:'active'};
  if(!writeMockStore({...mockStore,draft:session}))return;mockSession=session;mockQuestions=session.questions;mockAnswers=session.answers;mockIdx=0;mockSec=0;mockSelfRate='';restoreControls(session);window.renderQuestion();renderMockHistory();$('mockRetryAnswer')?.focus();
 }
 return {init,showSetup,restoreControls,saveSetup,refreshHome,setStageMode,renderQuestion,renderReport,reportHtml,bindReport,clock};
})();
