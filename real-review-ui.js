/* Real interview UI. Drafts remain separate from saved recollections and mock practice. */
window.RealReviewUI=(()=>{
 const KEY='zm_real_review_drafts_v1',clone=v=>JSON.parse(JSON.stringify(v)),M=RealReviewModel;
 function create(h){
  const $=id=>document.getElementById(id),esc=h.esc;let drafts={schemaVersion:1,items:[]},raw=null,blocked=false,editing=null,baseRevision=0,dirty=false,busy=false,active=0,tab='record',message='',pendingOpen=null;
  const current=()=>editing?.real.questions[active];
  const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
  const status=t=>{message=t;for(const id of ['realReviewStatus','realReviewHomeStatus'])if($(id))$(id).textContent=t;};
  function validRecord(r){try{return h.validRecords([r])&&(!r.real||!!M.normalize(r.real));}catch{return false;}}
  function validDrafts(d){return d?.schemaVersion===1&&Array.isArray(d.items)&&d.items.length<=100&&new Set(d.items.map(x=>x?.record?.id)).size===d.items.length&&d.items.every(x=>x&&validRecord(x.record)&&Number.isInteger(x.baseRevision)&&x.baseRevision>=0);}
  function writeDrafts(next){if(blocked)return false;try{if(localStorage.getItem(KEY)!==raw){status('另一页面已更新复盘草稿。请先备份当前内容，再刷新查看。');return false;}const value=JSON.stringify(next);localStorage.setItem(KEY,value);drafts=next;raw=value;return true;}catch{status('草稿暂存失败，当前文字仍保留。请先下载备份，再重试。');return false;}}
  function saveLocal(){if(!editing||!dirty)return true;const next=clone(drafts),item={record:clone(editing),baseRevision};next.items=next.items.filter(x=>x.record.id!==editing.id);next.items.push(item);if(next.items.length>100){status('未完成草稿已达 100 份，请先保存或备份整理。');return false;}return writeDrafts(next);}
  function changed(){dirty=true;const saved=saveLocal();if(saved)status('草稿已暂存。保存面试记录后可跨页面查看；只有主动点击才会调用 AI。');renderNav();sync();}
  function show(which){$('realReviewHome').hidden=which!=='home';$('realReviewEditor').hidden=which!=='editor';if(which==='home')renderHome();else renderEditor();}
  function enter(){if(busy)return;if(!saveLocal())return;MockVoice.stop();show('home');}
  function open(id){if(busy||!saveLocal())return false;MockVoice.stop();const draft=drafts.items.find(x=>x.record.id===id),saved=h.records().find(r=>r.id===id),source=draft?.record||saved;if(!source){if(!h.ready())pendingOpen=id;return false;}pendingOpen=null;editing=clone(source);baseRevision=draft?.baseRevision??(source.revision||0);dirty=!!draft;
   if(!editing.real)editing.real={schemaVersion:1,context:{goalId:null,goalName:'',jd:'',interviewer:editing.stage==='HR面'?'hr':'business',resume:null},questions:[]};if(!editing.real.questions.length)addQuestion(false);active=0;tab='record';message=draft?'已恢复这份未保存草稿；原有记录和点评保留。':'已打开保存的记录。';show('editor');$('realReviewMeta').open=!editing.real.context.goalId;h.scroll();return true;
  }
  function newRecord(job){if(busy||blocked||!saveLocal())return;MockVoice.stop();const goals=h.goals(),selected=goals.find(g=>g.id===h.activeGoalId()),c={goalId:selected?.id||null,goalName:selected?.name||'',jd:selected?.jd||'',interviewer:'business',resume:null};editing={id:crypto.randomUUID(),company:'',role:selected?.name||'',stage:'初面',result:'待定',date:today(),tags:[],note:'',revision:0,real:{schemaVersion:1,context:c,questions:[]}};if(job?.id){const matched=goals.find(g=>g.jd===job.jd);editing.real.context={...editing.real.context,goalId:matched?.id||null,goalName:matched?.name||'',jd:matched?.jd||''};editing.company=job.company;editing.role=job.role;editing.jobId=job.id;editing.jobSnapshot={company:job.company,role:job.role,jd:job.jd};}baseRevision=0;active=0;tab='record';dirty=true;addQuestion(false);saveLocal();status('先核对这场面试的目标和所用简历，再记录当时的问题与回答。');show('editor');$('realReviewMeta').open=true;h.scroll();}
  function addQuestion(render=true){if(!editing||busy||editing.real.questions.length>=30)return;MockVoice.stop();editing.real.questions.push({id:crypto.randomUUID(),question:'',answer:'',recall:'partial',feedback:[]});active=editing.real.questions.length-1;tab='record';dirty=true;if(render){saveLocal();renderEditor();}}
  function records(){const rows=h.records().map(r=>({r,draft:false}));for(const d of drafts.items){const i=rows.findIndex(x=>x.r.id===d.record.id);if(i>=0)rows[i]={r:d.record,draft:true};else rows.unshift({r:d.record,draft:true});}return rows;}
  function renderHome(){
   const rows=records();$('realReviewCount').textContent=h.ready()?h.records().length+' 次已保存面试 · '+drafts.items.length+' 份待保存草稿':'正在连接复盘记录，草稿可先在本页暂存';$('realReviewNew').disabled=blocked||busy;
   $('realReviewCards').innerHTML=rows.map(({r,draft})=>{const s=M.summary(r,h.mockStore());return `<article class="real-review-card"><div class="resume-card-folio">${esc(r.stage)} <span>${esc(r.date)}</span></div><h3>${esc(r.company||'尚未填写公司')}</h3><p>${esc(r.real?.context.goalName||r.role||'尚未关联目标')}</p><p class="mock-note">${r.real?s.answered+' 道记录了回答 · '+s.reviewed+' 道有点评 · '+s.practice+' 道已重练':'原有复盘笔记 · 内容已保留'}</p><div class="paste-actions"><button class="btn ${draft?'btn-primary':'btn-ghost'}" data-real-open="${esc(r.id)}" data-real-control>${draft?'继续未保存草稿':'查看 / 完善复盘'} →</button><button class="btn btn-ghost" data-real-delete="${esc(r.id)}" ${!h.ready()?'disabled':''}>删除</button></div></article>`;}).join('')||'<div class="resume-library-empty"><h3>把刚面完的这一场记下来</h3><p>先记录你记得的问题与回答，再让 AI 帮你找出值得改进的表达。</p></div>';
   $('realReviewCards').querySelectorAll('[data-real-open]').forEach(b=>b.onclick=()=>open(b.dataset.realOpen));$('realReviewCards').querySelectorAll('[data-real-delete]').forEach(b=>b.onclick=()=>remove(b.dataset.realDelete));$('realReviewHomeStatus').textContent=message;$('realLegacyInsight').innerHTML=h.insight();
  }
  function versions(){return h.versions().filter(v=>v.kind==='confirmed-resume');}
  const locked=()=>editing.real.questions.some(q=>q.feedback.length);
  function renderMeta(){
   const r=editing,c=r.real.context,goals=h.goals(),all=versions(),fixed=locked();
   $('realReviewTitle').textContent=(r.company||'记录真实面试')+' · '+r.stage;
   const selects={realGoal:'<option value="">请选择这场面试对应的目标</option>'+goals.map(g=>`<option value="${esc(g.id)}">${esc(g.name)}</option>`).join(''),realResume:'<option value="">未记录 / 不确定所用版本</option>'+all.map(v=>`<option value="${esc(v.id)}">${esc(h.versionLabel(v))}</option>`).join('')};
   if(c.goalId&&!goals.some(g=>g.id===c.goalId))selects.realGoal+=`<option value="${esc(c.goalId)}">${esc(c.goalName)}（原目标）</option>`;
   if(c.resume&&!all.some(v=>v.id===c.resume.versionId))selects.realResume+=`<option value="${esc(c.resume.versionId)}">${esc(c.resume.label)}（本场快照）</option>`;
   for(const [id,html]of Object.entries(selects))$(id).innerHTML=html;$('realGoal').value=c.goalId||'';$('realResume').value=c.resume?.versionId||'';$('realInterviewer').value=c.interviewer;
   for(const [id,key]of Object.entries({realCompany:'company',realRole:'role',realStage:'stage',realResult:'result',realDate:'date',realNote:'note'}))$(id).value=r[key];
   for(const id of ['realGoal','realResume','realInterviewer'])$(id).disabled=busy||fixed;
   $('realMaterialHint').textContent=fixed?'本场已点评，所用材料已固定。修改回答仍可保存；另一场面试请新建记录。':'请选实际使用的简历；不确定就保留“未记录”，不会自动替你选最新版本。';
   $('realFrozenMaterial').textContent='目标：'+(c.goalName||'未关联')+'；所用简历：'+(c.resume?.label||'未记录 / 不确定');
   $('realOriginalJd').textContent=c.jd||'尚未关联岗位要求';
  }
  function renderNav(){
   if(!editing)return;const qs=editing.real.questions;
   const state=q=>q.recall==='unknown'?'记不清 · 不评分':M.current(q)?'已点评':q.feedback.length?'回答有修改':q.answer.trim()?'待点评':'待记录';
   $('realQuestionNav').innerHTML=qs.map((q,i)=>`<button type="button" data-real-question="${i}" data-real-control data-real-read aria-current="${i===active}"><strong>${i+1}. ${esc(q.question.trim().slice(0,46)||'待记录的问题')}</strong><small>${state(q)}</small></button>`).join('');
   $('realQuestionNav').querySelectorAll('button').forEach(b=>b.onclick=()=>selectQuestion(Number(b.dataset.realQuestion)));
   $('realQuestionSelect').innerHTML=qs.map((q,i)=>`<option value="${i}">${i+1}. ${esc(q.question.trim().slice(0,36)||'待记录的问题')} · ${state(q)}</option>`).join('');$('realQuestionSelect').value=String(active);
   const stats=M.summary(editing,h.mockStore());$('realReviewStats').textContent=stats.answered+' 道有回答 · '+stats.reviewed+' 道已有本版点评 · '+stats.practice+' 道已在模拟面试重练';
   $('realQuestionPosition').textContent=(active+1)+' / '+qs.length;
  }
  function renderEditor(){if(!editing)return;renderMeta();renderNav();renderQuestion();status(message);sync();}
  function selectQuestion(index){if(!editing||!Number.isInteger(index)||index<0||index>=editing.real.questions.length||!saveLocal())return;MockVoice.stop();active=index;tab='record';renderNav();renderQuestion();sync();}
  function renderQuestion(){
   const q=current();if(!q)return;MockVoice.stop();const box=$('realQuestionBody');box.dataset.tab=tab;
   document.querySelectorAll('[data-real-tab]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.realTab===tab));});
   if(tab==='record'){
    box.innerHTML=`<div class="field"><label for="realQuestion">面试官问了什么？</label><div id="realQuestionVoice"></div><textarea id="realQuestion" data-real-control maxlength="5000" rows="3" placeholder="按你记得的意思记录，记不清原话也没关系。"></textarea></div><div class="field"><label for="realRecall">这道题记得有多清楚？</label><select id="realRecall" data-real-control><option value="complete">问题和当时的回答基本完整</option><option value="partial">只记得部分，可能有遗漏</option><option value="unknown">记不清当时怎么回答的</option></select></div><div class="field"><label for="realAnswer">你当时怎么回答的？</label><div id="realAnswerVoice"></div><textarea id="realAnswer" data-real-control maxlength="12000" rows="7" placeholder="尽量还原当时的回答。现在想到的新说法，可以去模拟面试中重练。"></textarea></div><p class="mock-note">这是面试后的回忆，不是现场逐字稿。语音会追加到当前输入框，请核对后再点评。</p>`;
    $('realQuestion').value=q.question;$('realAnswer').value=q.answer;$('realRecall').value=q.recall;
    for(const [id,key]of [['realQuestion','question'],['realAnswer','answer']]){$(id).oninput=e=>{q[key]=e.target.value;changed();};MockVoice.mount($(id),$(id==='realQuestion'?'realQuestionVoice':'realAnswerVoice'),{root:$('realReviewEditor'),onAppend:sync,fields:()=>[$('realQuestion'),$('realAnswer'),$('realNote')],controls:()=>[...document.querySelectorAll('#realReviewEditor [data-real-control]')].filter(el=>el.tagName!=='TEXTAREA'),context:()=>[editing?.id,current()?.id,key],blocked:()=>busy||blocked});}
    $('realRecall').onchange=e=>{q.recall=e.target.value;changed();};
   }else if(tab==='history'){
    box.innerHTML=q.feedback.length?q.feedback.map((f,i)=>`<details class="feedback-disclosure"><summary>${esc(h.date(f.envelope.meta.createdAt))} · ${esc(f.envelope.meta.model)} · ${f.answer===q.answer&&f.question===q.question&&f.recall===q.recall?'当前内容':'此前内容'}</summary><p><b>当时记录的问题：</b>${esc(f.question)}</p>${h.feedback(f.envelope,'基于此前回忆的点评',f.answer)}</details>`).join(''):'<p class="rv-empty">尚无点评历史。修改回答后，之前的点评仍会保留在这里。</p>';
   }else{
    const f=M.current(q);box.innerHTML=f?'<p class="real-recall-notice">'+(q.recall==='partial'?'你选择了“只记得部分”。下面仅评价记录下来的内容，遗漏部分需要继续回忆。':'点评依据是你事后记录的回答，供准备下一次面试参考。')+'</p>'+h.feedback(f.envelope,'本次回答可以怎样改进',f.answer):'<p class="rv-empty">'+(q.feedback.length?'当前问题或回答已修改，请重新点评。之前的结果仍在“历史点评”中。':'先记录当时的问题和回答，再点击下方“AI 点评本题”。记不清的回答不评分。')+'</p>';
    if(f)box.querySelectorAll('.ai-feedback').forEach(el=>{for(const child of el.children)if(tab==='reference')child.hidden=child.dataset.reviewPart!=='reference';else if(child.dataset.reviewPart==='reference')child.hidden=true;});
   }
   if(tab!=='record')box.insertAdjacentHTML('afterbegin','<h3 class="real-current-question">'+esc(q.question||'尚未记录问题')+'</h3>');box.scrollTop=0;sync();
  }
  function sync(){
   if(!editing)return;const q=current(),fixed=locked();document.querySelectorAll('#realReviewEditor [data-real-control]').forEach(el=>el.disabled=blocked||busy&&!el.hasAttribute('data-real-read'));for(const id of ['realGoal','realResume','realInterviewer'])$(id).disabled=busy||blocked||fixed;
   $('realPrevQuestion').disabled=active===0;$('realNextQuestion').disabled=active>=editing.real.questions.length-1;$('realAddQuestion').disabled=busy||blocked||editing.real.questions.length>=30;
   $('realEvaluate').disabled=busy||blocked||!q?.question.trim()||!q?.answer.trim()||q.recall==='unknown';$('realEvaluate').textContent=M.current(q)?'查看本题点评':'AI 点评本题';$('realPractice').disabled=busy||blocked||!q?.question.trim();
   $('realReviewSave').disabled=busy||blocked||!h.ready();$('realReviewAll').disabled=busy||blocked||!h.ready()||!editing.real.questions.some(q=>q.question.trim()&&q.answer.trim()&&q.recall!=='unknown'&&!M.current(q));
   for(const b of document.querySelectorAll('#realReviewEditor [data-voice]'))b.disabled=busy||blocked||!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||!window.AudioWorkletNode;const run=latestPractice();$('realPracticeResult').hidden=!run;$('realPracticeResult').disabled=busy||!run;$('realReviewEditor').setAttribute('aria-busy',String(busy));
  }
  async function saveServer(){
   if(!editing||blocked)throw Error('草稿存储异常，请先备份');if(!h.ready())throw Error('复盘服务尚未连接，请先重新连接');
   const record=clone(editing);record.real=M.normalize(record.real);if(!/^\d{4}-\d{2}-\d{2}$/.test(record.date))throw Error('请补充这场面试的完整日期，原有记录仍保留');if(!record.real.context.goalId)throw Error('请先关联这场面试的目标岗位');if(!record.company.trim()&&!record.note.trim()&&!record.real.questions.some(q=>q.question.trim()))throw Error('请先填写公司或记录一道面试问题');
   const response=await h.request(baseRevision?'/api/reviews/'+encodeURIComponent(record.id):h.records().some(r=>r.id===record.id)?'/api/reviews/'+encodeURIComponent(record.id):'/api/reviews','POST',h.records().some(r=>r.id===record.id)?{record,baseRevision}:record);
   const saved=response.records.find(r=>r.id===record.id);if(!saved)throw Error('保存结果异常，请保留当前页面');h.apply(response);editing.revision=saved.revision||0;for(const k of ['company','role','note','date','tags'])editing[k]=clone(saved[k]);baseRevision=saved.revision||0;dirty=false;
   const next=clone(drafts);next.items=next.items.filter(x=>x.record.id!==saved.id);writeDrafts(next);status('面试记录已保存。原回答、已有点评和本次材料快照均保留。');h.changed();return true;
  }
  async function saveButton(){if(busy)return;MockVoice.stop();busy=true;sync();try{await saveServer();renderMeta();}catch(e){status(e.message+'，当前填写内容保留。');}finally{busy=false;sync();}}
  async function evaluate(all=false){
   if(busy||blocked)return;const q=current();if(!all&&M.current(q)){tab='feedback';renderQuestion();return;}
   MockVoice.stop();busy=true;sync();let failed=[];
   try{await saveServer();$('realReviewMeta').open=false;const indices=editing.real.questions.flatMap((q,i)=>q.question.trim()&&q.answer.trim()&&q.recall!=='unknown'&&!M.current(q)&&(all||i===active)?[i]:[]);
    for(const index of indices){const source=clone(editing.real.questions[index]),c=editing.real.context;status('正在点评第 '+(index+1)+' 题；完成后逐题保存，请稍候…');
     try{if(source.feedback.length>=20||editing.real.questions.reduce((n,q)=>n+q.feedback.length,0)>=100)throw Error('本场点评历史已达上限，请备份后另建记录');const e=await h.ai({question:source.question,answer:source.answer,jd:c.jd,resume:c.resume?.text||'',role:editing.role.slice(0,100)||'通用',interviewer:c.interviewer,detailedReview:true,reviewOnly:true,realInterview:true,recall:source.recall});if(!M.envelope(e,source.answer,c.resume?.text||''))throw Object.assign(Error('本题点评未整理完整'),{code:'ANSWER_REVIEW_INCOMPLETE'});
      if(editing.real.questions[index].feedback.length>=20)throw Error('本题已保留 20 次点评，请备份后另建记录');editing.real.questions[index].feedback.unshift({question:source.question,answer:source.answer,recall:source.recall,envelope:e});dirty=true;saveLocal();await saveServer();renderNav();if(index===active){tab='feedback';renderQuestion();}
     }catch(e){failed.push(index+1);status('第 '+(index+1)+' 题：'+e.message+'。回答和已完成点评保留。');if(e.code!=='ANSWER_REVIEW_INCOMPLETE')throw e;}
    }
    status(failed.length?'第 '+failed.join('、')+' 题点评未完成，可以只重试这些题；其余结果已保存。':'已完成可点评回答的复盘。记不清、未回答的题目不评分，可以继续补充或去重练。');
   }catch(e){status(e.message+'。当前回答和已完成点评保留；有待保存内容时可点击“保存记录”继续，不必重新生成。');}
   finally{busy=false;renderNav();renderMeta();sync();}
  }
  async function practice(){if(busy)return;MockVoice.stop();busy=true;sync();try{const qid=current().id;await saveServer();const q=editing.real.questions.find(q=>q.id===qid);if(!h.practice(editing,q))status('尚未开始新练习，原复盘和面试草稿保留。');}catch(e){status(e.message+'，原记录保留。');}finally{busy=false;sync();}}
  function latestPractice(){if(!editing)return null;const q=current(),c=editing.real.context;return [h.mockStore().draft,...h.mockStore().records,...(h.mockStore().parked||[])].filter(Boolean).find(r=>M.linked(editing,q,r))||null;}
  async function remove(id){if(busy||blocked)return;const saved=h.records().some(r=>r.id===id);if(!confirm('删除这场面试记录及本地草稿？已有模拟重练记录仍保留。建议先下载备份。'))return;busy=true;try{if(saved){if(!h.ready())throw Error('请先重新连接复盘服务');h.apply(await h.request('/api/reviews/'+encodeURIComponent(id),'DELETE'));}const next=clone(drafts);next.items=next.items.filter(d=>d.record.id!==id);if(!writeDrafts(next))return;if(editing?.id===id){editing=null;dirty=false;}status('已删除该记录；已有模拟练习保留。');h.changed();}catch(e){status(e.message+'，未删除的内容保留。');}finally{busy=false;renderHome();}}
  function update(){if(pendingOpen&&h.ready()){const id=pendingOpen;pendingOpen=null;open(id);}if(!$('realReviewHome').hidden)renderHome();if(editing)sync();}
  function progressHtml(goal,interviewer){
   const records=h.records().filter(r=>r.real?.context.goalId===goal.id&&r.real.context.interviewer===interviewer);if(!records.length)return '<section class="real-goal-progress"><h4>真实面试 → 针对性重练</h4><p class="mock-note">本目标还没有关联的真实面试复盘。</p><button class="btn btn-ghost" data-real-new-goal="'+esc(goal.id)+'">记录真实面试 ↗</button></section>';
   return '<section class="real-goal-progress"><h4>真实面试 → 针对性重练</h4><p class="mock-note">只汇总当前目标与同类面试；已练不代表已经掌握。</p>'+records.slice(0,5).map(r=>{const s=M.summary(r,h.mockStore());return '<div class="target-progress-row"><b>'+esc(r.company||r.role)+' · '+esc(r.stage)+'</b><p class="mock-note">'+s.reviewed+' / '+s.eligible+' 道可点评回答已点评 · '+s.practice+' 道已重练 · '+s.practiceReviewed+' 道重练有点评</p>'+(s.missing.length?'<details><summary>还要补清楚哪些事实（'+s.missing.length+'）</summary><ul>'+s.missing.map(f=>'<li>'+esc(f.question)+'<p class="mock-note">'+esc(f.reason)+'</p></li>').join('')+'</ul></details>':'')+'<button class="btn btn-ghost" data-real-progress="'+esc(r.id)+'">查看复盘与待补事实 ↗</button></div>';}).join('')+'</section>';
  }
  function bindProgress(host){host.querySelectorAll('[data-real-progress]').forEach(b=>b.onclick=()=>{h.go('review');open(b.dataset.realProgress);});host.querySelectorAll('[data-real-new-goal]').forEach(b=>b.onclick=()=>{h.go('review');newRecord();const g=h.goals().find(g=>g.id===b.dataset.realNewGoal);if(g){editing.real.context={...editing.real.context,goalId:g.id,goalName:g.name,jd:g.jd};editing.role=g.name;changed();renderEditor();}});}
  function init(){
   try{raw=localStorage.getItem(KEY);if(raw!==null){drafts=JSON.parse(raw);if(!validDrafts(drafts))throw Error();}}catch{blocked=true;drafts={schemaVersion:1,items:[]};message='复盘草稿存储异常，原数据保留，请先下载备份检查。';}
   $('realReviewNew').onclick=()=>newRecord();$('realReviewBack').onclick=enter;$('realReviewSave').onclick=saveButton;$('realReviewAll').onclick=()=>evaluate(true);$('realEvaluate').onclick=()=>evaluate();$('realPractice').onclick=practice;$('realPracticeResult').onclick=()=>{const run=latestPractice();if(run&&!busy)h.openMock(run.id);};
   $('realReady').onclick=()=>{if(saveLocal()){$('realReviewMeta').open=false;document.querySelector('.real-review-workspace').scrollIntoView({block:'start',behavior:'smooth'});}};
   $('realAddQuestion').onclick=()=>addQuestion();$('realQuestionSelect').onchange=e=>selectQuestion(Number(e.target.value));$('realPrevQuestion').onclick=()=>selectQuestion(active-1);$('realNextQuestion').onclick=()=>selectQuestion(active+1);
   document.querySelectorAll('[data-real-tab]').forEach(b=>b.onclick=()=>{MockVoice.stop();tab=b.dataset.realTab;renderQuestion();});
   for(const [id,key]of Object.entries({realCompany:'company',realRole:'role',realStage:'stage',realResult:'result',realDate:'date',realNote:'note'}))$(id).oninput=e=>{if(busy)return;editing[key]=e.target.value;changed();};
   $('realGoal').onchange=e=>{if(locked())return;const g=h.goals().find(g=>g.id===e.target.value);editing.real.context={...editing.real.context,goalId:g?.id||null,goalName:g?.name||'',jd:g?.jd||''};if(g&&!editing.role)editing.role=g.name;changed();renderMeta();};
   $('realResume').onchange=e=>{if(locked())return;const v=versions().find(v=>v.id===e.target.value);editing.real.context.resume=v?{id:v.resumeId,versionId:v.id,name:v.resumeName,label:h.versionLabel(v),text:v.text,...(v.source?{document:clone(v.source)}:{})}:null;changed();renderMeta();};
   $('realInterviewer').onchange=e=>{if(!locked()){editing.real.context.interviewer=e.target.value;changed();}};
   $('realManageGoals').onclick=()=>{if(saveLocal())h.go('target');};$('realReconnect').onclick=h.reconnect;
   const backup=()=>h.download({schemaVersion:1,records:h.records(),drafts:clone(drafts),visibleDraft:editing?{record:clone(editing),baseRevision}:null,...(blocked?{raw}:{} )},'zhimian-real-interview-backup.json');$('realReviewBackup').onclick=backup;$('realReviewHomeBackup').onclick=backup;
   $('realReviewReload').onclick=async()=>{if(busy||!editing)return;if(dirty&&!confirm('重新载入会放弃本页未保存修改。请先下载备份。继续吗？'))return;const id=editing.id;busy=true;sync();try{await h.reconnect();if(!h.ready())throw Error('复盘服务未连接，当前内容保留');const saved=h.records().find(r=>r.id===id);if(!saved)throw Error('尚无已保存记录，请先保存当前草稿');const latestRaw=localStorage.getItem(KEY),latest=latestRaw===null?{schemaVersion:1,items:[]}:JSON.parse(latestRaw);if(!validDrafts(latest))throw Error('草稿存储异常，请保留备份后检查');drafts=latest;raw=latestRaw;const next=clone(drafts);next.items=next.items.filter(x=>x.record.id!==id);if(!writeDrafts(next))return;dirty=false;busy=false;open(id);}catch(e){status(e.message+'，当前内容未清空。');}finally{busy=false;sync();}};
   document.addEventListener('zm-leave-review',()=>{MockVoice.stop();saveLocal();});show('home');
  }
  return {init,enter,open,update,progressHtml,bindProgress,newRecord};
 }
 return {create};
})();
