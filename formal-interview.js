// Formal simulation UI. The shared policy validates imported records; existing stores own persistence.
window.FormalInterview=(()=>{
 const $=id=>document.getElementById(id),key='zm_interview_setup_v1',goalsKey='zm_interview_goals_v1';
 let ready=false,reviewBusy=false,setupConfirmed='',goalsBlocked=false,goalState={schemaVersion:1,activeId:null,goals:[]};
 let resumeMeta={resumeSource:'manual',resumeVersionId:null,resumeLabel:'手动填写'};
 const label=r=>r.jobSnapshot?[r.jobSnapshot.company,r.jobSnapshot.role].filter(Boolean).join(' · '):(r.jd||'尚未设置目标岗位').split('\n')[0].slice(0,100);
 const profile=r=>InterviewPolicy.profile(r.interviewer||'business');
 let roomPhase='prepare',roomSerial=0,roomAnimation=null,roomEntry='',roomQuestion='',modelHomes=[];
 const roomWrap=()=>document.querySelector('#mock .mock-wrap');
 const roomVisible=()=>$('mock')?.classList.contains('active');
 const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 function roomScroll(){if(roomVisible()){$('mock').style.scrollMarginTop=(Math.max(0,document.querySelector('.topbar').getBoundingClientRect().bottom)+16)+'px';$('mock').scrollIntoView({block:'start',behavior:'instant'});}}
 function roomPhaseTo(phase){
  roomPhase=phase;const wrap=roomWrap();if(!wrap)return;wrap.dataset.phase=phase;wrap.classList.toggle('is-preparing',phase==='prepare'||phase==='leaving');wrap.classList.remove('is-formal');
  document.querySelector('#mock .mock-setup').inert=phase!=='prepare';wrap.setAttribute('aria-busy',String(phase==='loading'||phase.startsWith('leaving')));
  $('mockStage').inert=phase==='loading'||phase.startsWith('leaving');
  $('mockRoomBack').hidden=phase==='prepare'||phase.startsWith('leaving')||phase==='loading';
  $('mockRoomContinue').hidden=phase!=='prepare'||!mockStore.draft;$('mockRoomContinue').textContent=mockStore.draft?.status==='report'?'查看上场复盘':'继续上场练习';
 }
 function roomAnimate(el,keyframes,duration){if(!el||reducedMotion()||!roomVisible())return Promise.resolve();const animation=el.animate(keyframes,{duration,easing:'cubic-bezier(.22,1,.36,1)'});return animation.finished.catch(()=>{});}
 async function leavePreparation(){
  const fromSetup=roomPhase==='prepare'||roomPhase==='leaving',element=fromSetup?document.querySelector('#mock .mock-setup'):$('mockStage');
  const serial=++roomSerial;roomPhaseTo(fromSetup?'leaving':'leaving-room');roomScroll();
  roomAnimation=element.animate(reducedMotion()?[]:[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-40px)'}],{duration:reducedMotion()?0:650,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});
  await roomAnimation.finished.catch(()=>{});if(serial!==roomSerial)return false;roomAnimation.cancel();roomAnimation=null;return true;
 }
 async function beginRoom(material){
  if(!await leavePreparation())return false;roomPhaseTo('loading');
  const interviewer=InterviewPolicy.profile(material?.interviewer||$('mockInterviewer').value);$('mockLoadingRole').textContent=interviewer.name+' · '+((material?.jd??$('mockJd').value).trim().split('\n')[0]||'本场面试');
  $('mockLoadingHeading').focus({preventScroll:true});roomAnimate($('mockLoading'),[{opacity:0},{opacity:1}],350);return true;
 }
 function setStageMode(formal,screen){
  const phase=screen||(mockSession&&['report','saved'].includes(mockSession.status)?'report':'session'),stamp=(mockSession?.id||'history')+':'+phase;
  const enter=()=>{const animate=roomPhase!==phase||roomEntry!==stamp;roomPhaseTo(phase);roomEntry=stamp;if(animate){roomScroll();roomAnimate($('mockStage'),[{opacity:0,transform:'translateY(22px)'},{opacity:1,transform:'translateY(0)'}],800);requestAnimationFrame(()=>{if(roomPhase!==phase||!roomVisible())return;const focus=$('mockA')||$('mockStage').querySelector('h3');if(focus){if(focus.tagName==='H3')focus.tabIndex=-1;focus.focus({preventScroll:true});}});}};
  if(ready&&roomPhase==='prepare'&&roomVisible()){const serial=roomSerial+1;leavePreparation().then(ok=>{if(ok&&serial===roomSerial)enter();});}else enter();
 }
 function roomQuestionMotion(){
  const key=mockSession?.id+':'+mockIdx+':'+(mockSession?.formal?.pending?.question||'main');if(key===roomQuestion)return;roomQuestion=key;
  const el=$('mockStage').querySelector('.formal-question,.q-card');roomAnimate(el,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],220);
 }
 function showSetup(){
  if(mockAiBusy||mockPlanBusy)return;
  if(ready&&mockSession?.mode==='formal'&&mockSession.status==='active')pause(true);else if(ready&&mockSession&&mockSession.status!=='saved'){stopMockVoice();stopTimer();persistDraft();}
  ++roomSerial;roomAnimation?.cancel();roomAnimation=null;const changed=roomPhase!=='prepare';roomPhaseTo('prepare');
  if(ready)renderGoalCard();if(changed){roomScroll();roomAnimate(document.querySelector('#mock .mock-setup'),[{opacity:0,transform:'translateY(-12px)'},{opacity:1,transform:'translateY(0)'}],450);}$('mockGoalSelect')?.focus({preventScroll:true});
 }
 function positionRoomTools(){const main=document.querySelector('.main').getBoundingClientRect(),top=document.querySelector('.topbar').getBoundingClientRect().bottom,left=Math.max(0,main.left),right=Math.min(innerWidth,main.right),bottom=innerHeight;const d=$('mockToolsDialog');d.style.setProperty('--room-dialog-x',(left+right)/2+'px');d.style.setProperty('--room-dialog-y',(Math.max(0,top)+bottom)/2+'px');d.style.setProperty('--room-dialog-width',Math.max(200,right-left-24)+'px');d.style.setProperty('--room-dialog-height',Math.max(160,bottom-Math.max(0,top)-24)+'px');}
 function openRoomTools(force=false){if(!force&&(mockAiBusy||mockPlanBusy))return;const dialog=$('mockToolsDialog');for(const id of ['aiSettings','modelSettings']){const panel=$(id);if(panel&&!modelHomes.some(x=>x.panel===panel)){const anchor=document.createComment(id+' home');panel.before(anchor);modelHomes.push({panel,anchor});$('mockModelSettingsHost').append(panel);}}positionRoomTools();if(!dialog.open)dialog.showModal();}
 function restoreModelHomes(){for(const {panel,anchor}of modelHomes)if(anchor.parentNode)anchor.replaceWith(panel);modelHomes=[];}
 function closeRoomTools(){if($('mockToolsDialog').open)$('mockToolsDialog').close();restoreModelHomes();}
 const emptySetup=()=>({jd:'',resume:'',interviewer:'business',mode:'formal',roleSelection:'auto',resumeSource:'manual',resumeVersionId:null,resumeLabel:'手动填写'});
 const activeGoal=()=>goalState.goals.find(g=>g.id===goalState.activeId);
 const fromRecord=r=>({...emptySetup(),jd:r.jd||'',resume:r.resume||'',interviewer:r.interviewer||'business',mode:r.mode||'coaching',roleSelection:r.roleSelection||'auto',...(r.preparation?resumeMetadata(r.preparation):{})});
 function readSetup(){return {jd:$('mockJd').value,resume:$('mockProfile').value,interviewer:$('mockInterviewer').value,mode:$('mockMode').value,roleSelection:$('mockRole').value||'auto',...resumeMeta};}
 function writeGoals(next){if(goalsBlocked)return false;try{if(!InterviewPolicy.validGoals(next))throw Error('准备材料格式不符或超过长度限制');localStorage.setItem(goalsKey,JSON.stringify(next));goalState=next;return true;}catch(e){storageMsg('目标准备未能保存：'+e.message+'。当前输入和原存储保留，请先导出。');return false;}}
 function createGoal(setup=emptySetup(),association={}){
  const goal={id:association.goalId||crypto.randomUUID(),jobId:association.jobId||null,name:(association.jobSnapshot?label(association):(setup.jd.trim().split('\n')[0]||'新的目标岗位')).slice(0,200),working:{...setup},defaults:{...setup}};
  if(!writeGoals({...goalState,activeId:goal.id,goals:[...goalState.goals,goal]}))return null;return goal;
 }
 function applySetup(s){$('mockJd').value=s.jd;$('mockProfile').value=s.resume;$('mockMode').value=s.mode;$('mockInterviewer').value=s.interviewer;$('mockRole').value=s.roleSelection;resumeMeta=resumeMetadata(s);setupConfirmed='';$('mockConfirmResume').checked=false;parseJd();updateControls();renderGoalCard();}
 function restoreControls(r){
  if(!ready)return;let goal=goalState.goals.find(g=>g.id===r.goalId)||goalState.goals.find(g=>InterviewPolicy.sameGoal({goalId:g.id,jobId:g.jobId,jd:g.working.jd},r));
  if(!goal)goal=createGoal(fromRecord(r),r);else writeGoals({...goalState,activeId:goal.id});
  $('mockMode').value=r.mode||'coaching';$('mockInterviewer').value=r.interviewer||'business';resumeMeta=fromRecord(r);resumeMeta=resumeMetadata(resumeMeta);setupConfirmed=r.resume||'';$('mockConfirmResume').checked=!!r.resume;updateControls();renderGoalCard();refreshHome();
 }
 function context(){const g=activeGoal();if(!g)return {};const s=readSetup();return {goalId:g.id,preparation:{goalId:g.id,goalName:g.name,origin:JSON.stringify(s)===JSON.stringify(g.defaults)?'goal_default':'session',...resumeMeta,confirmed:!s.resume.trim()||$('mockConfirmResume').checked&&setupConfirmed===s.resume.trim()}};}
 function useResume(value,jd=''){
  if(!ready||mockAiBusy||goalsBlocked)return;if(jd.trim()&&jd.trim()!==$('mockJd').value.trim()){
   saveSetup();const match=goalState.goals.find(g=>g.working.jd.trim()===jd.trim()),g=match||createGoal({...emptySetup(),jd,mode:$('mockMode').value,interviewer:$('mockInterviewer').value});if(!g)return;activateGoal(g.id);
  }
  setResumeMetadata(value);
  $('mockProfile').value=value;$('mockConfirmResume').checked=false;setupConfirmed='';showSetup();saveSetup();
 }
 function activateGoal(id){
  if(mockAiBusy||mockPlanBusy||goalsBlocked)return;const g=goalState.goals.find(g=>g.id===id);if(!g||!writeGoals({...goalState,activeId:id}))return;
  stopMockVoice();stopTimer();if(mockSession&&mockSession.status!=='saved')persistDraft();
  if(g.jobId&&!Array.from($('mockJob').options).some(o=>o.value===g.jobId))$('mockJob').add(new Option('原关联岗位（已删除）',g.jobId));$('mockJob').value=g.jobId||'';applySetup(g.working);showSetup();
  $('mockStage').innerHTML='<div class="stage-empty"><h3>准备你的这一场面试</h3><p>核对目标材料与面试方式后开始，也可继续上场练习。</p></div>';refreshHome();
 }
 function selectJob(id){
  if(!ready||mockAiBusy||mockPlanBusy||goalsBlocked)return;saveSetup();const existing=goalState.goals.find(g=>id&&g.jobId===id);if(existing){activateGoal(existing.id);return;}
  const j=jobs.find(j=>j.id===id),s=j?{...emptySetup(),jd:j.jd||j.role,mode:$('mockMode').value,interviewer:$('mockInterviewer').value}:readSetup();const goal=createGoal(s,j?{jobId:j.id,jobSnapshot:j}:{});if(goal)activateGoal(goal.id);
 }
 function renderTarget(){
  if(!ready||!$('targetList'))return;
  const g=activeGoal(),busy=mockAiBusy||mockPlanBusy,blocked=goalsBlocked||busy;
  $('targetHeading').textContent=g?.name||'准备你的第一个目标';
  if(document.activeElement!==$('targetJd'))$('targetJd').value=$('mockJd').value;
  for(const id of ['targetJd','targetNew','targetResume','targetMock','targetImport'])$(id).disabled=blocked;
  for(const id of ['targetDefault','targetReset'])$(id).disabled=blocked||!g;
  $('targetMsg').textContent=goalsBlocked?'目标存储异常，原数据保留。请先导出原始备份检查。':busy?'面试正在处理，请稍后调整目标。':'';
  $('targetList').innerHTML=goalState.goals.length?goalState.goals.map(x=>`<button class="target-item" type="button" data-target-id="${esc(x.id)}" aria-pressed="${x.id===g?.id}" ${blocked?'disabled':''}><b>${esc(x.name)}</b><small>${x.id===g?.id?'当前准备 · ':''}${x.working.jd.trim()?'已填写岗位要求':'待补充岗位要求'}${x.working.resume.trim()?' · 已有面试材料':''}</small></button>`).join(''):'<p class="mock-note">还没有目标。在左侧填写岗位名称与要求即可创建，也可以点击「新建目标」。</p>';
  $('targetList').querySelectorAll('[data-target-id]').forEach(b=>b.onclick=()=>{
   if(!saveSetup()){$('targetMsg').textContent='当前目标未能保存，请先导出备份后再切换。';return;}
   activateGoal(b.dataset.targetId);renderTarget();
  });
 }
 function targetToResume(){
  if(mockAiBusy||mockPlanBusy||goalsBlocked)return;
  const jd=$('mockJd').value.trim();
  if(!jd){$('targetMsg').textContent='先填写岗位名称与要求，再继续准备。';$('targetJd').focus();return;}
  if(!saveSetup()){$('targetMsg').textContent='目标未能保存，请先导出备份。';return;}
  if(resumeBlocked){$('targetMsg').textContent='简历存储异常，请到简历助手导出原始备份后再继续。';return;}
  if(resumeState.jd.trim()!==jd){
   if(resumeState.jd.trim()&&!confirm('将简历助手切换到这个目标岗位？已采用的改写会保留为当前正文，诊断需重新生成。'))return;
   const previous=structuredClone(resumeState);
   resumeState={...resumeState,text:composedResume(),jd,diagnosis:null,sections:[]};
   if(!saveResume()){resumeState=previous;$('targetMsg').textContent='简历目标未能保存，原材料保留，请先到简历助手导出备份。';return;}
   $('resumeJd').value=jd;$('resumeText').value=resumeState.text;renderResume();
  }
  go('resume');resumeMsg('已带入目标岗位：'+activeGoal().name+'。导入或完善简历后，可继续模拟面试。');
 }
  // Page images are rendered locally from the exact interview snapshot, never the original download.
 let resumePreview=null,previewPage=1;
 const documentOf=s=>InterviewPolicy.validResumeDocument(s?.resumeDocument)?s.resumeDocument:null;
 const resumeMetadata=s=>({resumeSource:s.resumeSource,resumeVersionId:s.resumeVersionId,resumeLabel:s.resumeLabel,...(documentOf(s)?{resumeDocument:{...s.resumeDocument}}:{})});
 function materialFor(s){
  const text=s.resume;if(!text.trim()||resumeBlocked)return null;
  let source=documentOf(s);
  if(!source){
   const version=resumeState.versions.find(v=>v.id===s.resumeVersionId&&v.text===text);
   const accepted=currentAcceptedResume();
   source=version?.source||(accepted?.text===text?accepted.source:null);
  }
  if(!source||!validResumeSource(source))return null;
  return {text,source:{...source},key:JSON.stringify([source.id,text])};
 }
 function setResumeMetadata(value,version){
  const accepted=currentAcceptedResume(),v=version||(accepted?.text===value?accepted:resumeState.versions.find(v=>v.text===value));
  const label=v&&(v.kind==='confirmed-resume'||v.id===accepted?.id)?'已确认简历':'已保存简历';
  resumeMeta={resumeSource:v?'resume-version':'resume-current',resumeVersionId:v?.id||null,resumeLabel:v?label+' · '+displayMockDate(v.date):'简历助手正文（未优化）',...(validResumeSource(v?.source)?{resumeDocument:{...v.source}}:{})};
 }
 function prepareResumePreview(s){
  const material=materialFor(s);
  if(resumePreview?.key!==material?.key){resumePreview?.controller?.abort();resumePreview=material?{...material,images:[],total:0,busy:false,error:'',controller:null}:null;if($('mockResumeDialog').open)$('mockResumeDialog').close();}
  paintResumeThumbnails();
 }
 function paintResumeThumbnails(){
  const host=$('mockResumePages'),status=$('mockResumePreviewStatus'),retry=$('mockResumePreviewRetry');if(!host||!status)return;
  const p=resumePreview;
  if(!p){host.replaceChildren();status.textContent=$('mockProfile').value.trim()?'这份材料尚未关联可预览的原文件。可使用已确认简历，或展开本场经历核对。':'带入已确认的简历后，这里会显示原模板的分页预览。';retry.hidden=true;return;}
  host.innerHTML=p.images.map((url,i)=>`<button type="button" class="mock-resume-thumb" data-resume-page="${i+1}" aria-label="放大查看简历第 ${i+1} 页"><img src="${esc(url)}" alt="本场简历第 ${i+1} 页"/><span>第 ${i+1} 页 · 点击放大</span></button>`).join('');
  host.querySelectorAll('[data-resume-page]').forEach(b=>b.onclick=()=>openResumePage(Number(b.dataset.resumePage)));
  status.textContent=p.error|| (p.busy?'正在生成本场简历预览：'+p.images.length+(p.total?' / '+p.total:'')+' 页…':p.images.length?'本场简历共 '+p.total+' 页，内容与本场使用的简历一致。点击任意一页可放大查看。':'展开后生成本场简历的版式预览。');
  retry.hidden=!p.error;
  if($('mockResumeDialog').open)paintResumePage();
 }
 async function loadResumePreview(){
  const p=resumePreview;if(!p||p.busy||p.images.length===p.total&&p.total>0)return;
  p.controller=new AbortController();p.busy=true;p.error='';paintResumeThumbnails();
  try{
   for(let page=p.images.length+1;page<=(p.total||1);page++){
    const r=await fetch('/api/resume/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId:p.source.id,text:p.text,page}),signal:AbortSignal.any([p.controller.signal,AbortSignal.timeout(65000)])});
    const data=await r.json();if(!r.ok)throw Error(data.error||'预览生成失败');
    if(!Number.isInteger(data.pages)||data.pages<1||data.pages>30||typeof data.base64!=='string'||p.total&&p.total!==data.pages)throw Error('分页预览结果异常');
    const url='data:image/png;base64,'+data.base64,img=new Image();img.src=url;await img.decode();
    if(resumePreview!==p)return;p.total=data.pages;p.images.push(url);paintResumeThumbnails();
   }
  }catch(e){if(resumePreview===p&&!p.controller.signal.aborted)p.error='暂时无法生成这份简历的版式预览。'+(e.name==='TimeoutError'?'请稍后重试。':e.message+'。')+' 本场材料已保留。';}
  finally{p.busy=false;if(resumePreview===p)paintResumeThumbnails();}
 }
 function positionResumePage(){
  const d=$('mockResumeDialog');if(!d.open)return;const main=document.querySelector('.main'),r=main.getBoundingClientRect(),s=getComputedStyle(main),bar=document.querySelector('.topbar').getBoundingClientRect();
  const l=Math.max(12,r.left+parseFloat(s.paddingLeft)),right=Math.min(innerWidth-12,r.right-parseFloat(s.paddingRight)),top=Math.min(Math.max(12,bar.bottom+12),Math.max(12,innerHeight-200)),bottom=innerHeight-12;
  for(const [key,value] of Object.entries({'--mock-page-x':(l+right)/2,'--mock-page-y':(top+bottom)/2,'--mock-page-width':right-l-12,'--mock-page-height':bottom-top-12,'--mock-page-left':l,'--mock-page-right':innerWidth-right,'--mock-page-top':top,'--mock-page-bottom':12}))d.style.setProperty(key,Math.max(0,value)+'px');
 }
 function paintResumePage(){
  const p=resumePreview;if(!p)return;const img=$('mockResumePageImage'),url=p.images[previewPage-1];
  if(img.getAttribute('src')!==url){if(url)img.src=url;else img.removeAttribute('src');$('mockResumePageScroll').scrollTop=0;$('mockResumePageScroll').scrollLeft=0;}
  img.alt='本场简历第 '+previewPage+' 页';$('mockResumePageNumber').textContent='第 '+previewPage+' / '+p.total+' 页';
  $('mockResumePagePrevious').disabled=previewPage<=1;$('mockResumePageNext').disabled=previewPage>=p.total||!p.images[previewPage];
 }
 function openResumePage(page){
  if(!resumePreview?.images[page-1])return;previewPage=page;const d=$('mockResumeDialog');if(!d.open)d.showModal();paintResumePage();positionResumePage();
 }
 function bindResumePreview(){
  $('mockResumePageClose').onclick=()=>$('mockResumeDialog').close();$('mockResumePagePrevious').onclick=()=>openResumePage(previewPage-1);$('mockResumePageNext').onclick=()=>openResumePage(previewPage+1);
  window.addEventListener('resize',positionResumePage);
  $('mockResumeDialog').addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();openResumePage(previewPage+(e.key==='ArrowLeft'?-1:1));}});
 }

 function renderGoalCard(){
  if(!ready||!$('mockGoalCard'))return;const g=activeGoal(),s=readSetup();
  const material=materialFor(s),accepted=currentAcceptedResume();
  const latest=accepted&&s.resume===accepted.text&&s.resumeVersionId===accepted.id&&documentOf(s)?.id===accepted.source?.id;
  const choices=goalState.goals.filter(x=>x.working.jd.trim());
  $('mockGoalOverviewContent').innerHTML=`<h4>本场目标与简历</h4><div class="mock-goal-overview"><div class="field mock-goal-choice"><div class="mock-goal-label-row"><label for="mockGoalSelect">选择要练习的目标岗位</label><button type="button" class="btn btn-ghost" id="mockManageTargets">${choices.length?'管理目标岗位 ↗':'创建目标岗位 ↗'}</button></div><select id="mockGoalSelect" title="${esc(g?.name||'请选择目标岗位')}" ${goalsBlocked||mockAiBusy||mockPlanBusy?'disabled':''}><option value="" ${!g?.working.jd.trim()?'selected':''} disabled>请选择目标岗位</option>${choices.map(x=>`<option value="${esc(x.id)}" ${x.id===g?.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select><p class="mock-note mock-goal-hint">${choices.length?'自动带入该目标的岗位要求和准备材料':'还没有目标，请先创建目标岗位'}</p></div><div class="mock-goal-resume"><span class="mock-note">本场简历</span><p>${s.resume.trim()?esc(resumeMeta.resumeLabel):'尚未带入简历'}</p><span class="mock-note">${s.resume.trim()?($('mockConfirmResume').checked?'已核对本场材料':'展开下方材料，核对后确认'):'可仅按 JD 开练，或添加经历'}</span></div></div>`;
  $('mockMaterialContent').innerHTML=`<p>岗位要求</p><blockquote style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(s.jd||'尚未选择，请先选择目标岗位')}</blockquote><p><b>简历 / 经历 · 分页预览</b></p><p id="mockResumePreviewStatus" class="mock-note" role="status" aria-live="polite"></p><div id="mockResumePages" class="mock-resume-pages"></div><button type="button" class="btn btn-ghost" id="mockResumePreviewRetry" hidden>重试版式预览</button>${latest?'<p class="mock-note" id="mockResumeLatest">已使用最新已确认简历</p>':''}${!material&&s.resume.trim()?`<details class="mock-resume-text"><summary>查看本场经历</summary><blockquote style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(s.resume)}</blockquote></details>`:''}`;
  $('mockManageTargets').onclick=e=>{e.preventDefault();go('target');};
  prepareResumePreview(s);$('mockMaterialDetails').ontoggle=()=>{if($('mockMaterialDetails').open)loadResumePreview();};$('mockResumePreviewRetry').onclick=loadResumePreview;if($('mockMaterialDetails').open)loadResumePreview();
  $('mockGoalSelect').onchange=e=>{const id=e.target.value;if(!id)return;if(saveSetup())activateGoal(id);else e.target.value=g?.id||'';};
  const select=$('mockResumeVersion');if(select){const value=select.value;select.innerHTML='<option value="">选择版本后带入</option>'+resumeState.versions.map(v=>`<option value="${esc(v.id)}">${esc(displayMockDate(v.date))} · ${v.text.length} 字</option>`).join('');select.value=value;}
  $('mockResumeConfirmation').hidden=!s.resume.trim();
  renderTarget();
 }
 function updateControls(){const formal=$('mockMode').value==='formal';$('formalStartControls').hidden=!formal;$('coachingStartControls').hidden=formal;$('mockQuestionCount').hidden=formal;$('mockCountHint').hidden=!formal;$('mockModeHint').textContent=formal?'连续问答，练习完整面试节奏':'单题练习，查看点评后再重答';$('mockInterviewerFocus').textContent='重点考察：'+InterviewPolicy.profile($('mockInterviewer').value).focus;renderBlueprint();renderFocus();$('mockResumeCheck').textContent=$('mockProfile').value.trim()?'本场使用这份材料，后续修改不会改变已开始的面试。':'可以先用目标 JD 开练；缺少经历时，个性化程度会有限。';}
 function renderBlueprint(){const el=$('mockBlueprint');if(!el)return;const b=InterviewPolicy.blueprint($('mockInterviewer').value,mockRole);el.innerHTML='<summary>本轮考察范围 · '+esc(b.role)+'</summary><p class="mock-note">围绕岗位要求与真实经历覆盖以下能力。先了解标准，具体问题在开练后出现。</p>'+b.competencies.map(a=>'<details><summary>'+esc(a.name)+'</summary><ul>'+a.criteria.map(c=>'<li>'+esc(c.description)+'</li>').join('')+'</ul></details>').join('');}
 function rubricContext(r,index){return r.blueprint&&r.questions[index]?.competencyId?{blueprintVersion:r.blueprint.version,competencyId:r.questions[index].competencyId}:{};}
 function criteriaHtml(e){if(!e.result.criteria)return '';const a=InterviewPolicy.ability(e.meta.interviewer,e.meta.competencyId),labels={met:'有回答依据',missing:'需要补充',unknown:'尚不能判断'};return '<h4>'+esc(a.name)+' · 标准核对</h4>'+e.result.criteria.map(c=>'<p><b>'+esc(a.criteria.find(x=>x.id===c.id).description)+'</b> · '+labels[c.status]+'</p><p>'+esc(c.reason)+'</p>'+(c.quote?'<blockquote>'+esc(c.quote)+'</blockquote>':'')).join('');}
 const taskLabels={suggested:'待选择',selected:'已选为重点',practicing:'重练中',verified:'本题缺口已补上',needs_more:'还需补充',unknown:'尚不能判断'};
 function taskPool(scope={...context(),jd:$('mockJd').value,...selectedJobAssociation('mockJob'),interviewer:$('mockInterviewer').value}){
  const records=[...(mockStore.draft?.mode==='formal'?[mockStore.draft]:[]),...mockStore.records],seen=new Set(),rows=[];
  for(const r of records){if(r.mode!=='formal'||r.interviewer!==scope.interviewer||!InterviewPolicy.sameGoal(r,scope))continue;for(const t of r.formal.tasks||[])rows.push({record:r,task:t});}
  return rows.sort((a,b)=>Number(b.task.carry)-Number(a.task.carry)).filter(x=>{if(seen.has(x.task.criterionId))return false;seen.add(x.task.criterionId);return true;});
 }
 const toAiFocus=rows=>rows.map(({criterionId,reason,sourceQuote,previousQuestion})=>({criterionId,reason,sourceQuote,previousQuestion}));
 function focusSnapshot(){return taskPool().filter(x=>x.task.carry).slice(0,2).map(({record:r,task:t})=>({goalId:activeGoal()?.id,recordId:r.id,taskId:t.id,criterionId:t.criterionId,reason:t.reason,sourceQuote:t.sourceQuote.slice(0,500),previousQuestion:r.questions[t.index].q,previousOutcome:t.status}));}
 function saveReportCopy(r){
  const next=r.status==='saved'?{...mockStore,records:mockStore.records.map(x=>x.id===r.id?r:x)}:{...mockStore,draft:r};
  if(!validStore(next)||!writeMockStore(next))return false;if(mockSession?.id===r.id)mockSession=r;return true;
 }
 function toggleCarry(r,id,value){
  if(mockAiBusy)return false;const original=r.id===mockSession?.id&&mockSession.status!=='saved'?mockSession:mockStore.records.find(x=>x.id===r.id);if(!original)return false;
  const pool=taskPool(original);if(value&&pool.filter(x=>x.task.carry&&x.task.id!==id).length>=2){storageMsg('每场最多选择两项重点，请先取消另一项。');return false;}
  const copy=JSON.parse(JSON.stringify(original)),t=copy.formal.tasks?.find(x=>x.id===id);if(!t)return false;t.carry=value;if(t.status==='suggested'&&value)t.status='selected';else if(t.status==='selected'&&!value)t.status='suggested';if(!saveReportCopy(copy))return false;renderFocus();refreshHome();return true;
 }
 function renderFocus(){
  const el=$('mockFocus');if(!ready||!el)return;const pool=taskPool();$('mockExtraSummary').textContent='更多练习设置'+(pool.some(x=>x.task.carry)?' · 已选 '+pool.filter(x=>x.task.carry).length+' 项训练重点':'');el.innerHTML='<summary>下一场重点 · 由你选择（'+pool.filter(x=>x.task.carry).length+'/2）</summary><p class="mock-note">最多两项，仅来自当前目标与同类面试。选中后本场开始时冻结；新问题会换角度验证。</p>'+(pool.length?pool.map(({record:r,task:t})=>`<label class="resume-confirm"><input type="checkbox" data-focus-record="${esc(r.id)}" data-focus-task="${esc(t.id)}" ${t.carry?'checked':''}> <span>${esc(t.title)} · ${taskLabels[t.status]}</span></label>`).join(''):'<p class="mock-note">还没有可带入的训练任务，先完成一次正式复盘。</p>');
  if(pool.some(x=>x.task.carry))el.open=true;el.querySelectorAll('[data-focus-task]').forEach(input=>input.onchange=()=>{const r=mockStore.records.find(r=>r.id===input.dataset.focusRecord);if(!r||!toggleCarry(r,input.dataset.focusTask,input.checked))input.checked=!input.checked;});
 }
 function taskCard(r,t,primary=false){return `<div class="ai-feedback"><h4>${primary?'先练这一项：':''}${esc(t.title)}</h4><p>${esc(t.reason)}</p><p class="mock-note">状态：${taskLabels[t.status]} · 第 ${t.index+1} 题 · ${t.attempts.length} 次重练</p><blockquote>${esc(t.sourceQuote)}</blockquote><p><b>达标条件：</b>${esc(t.title)}，并能从你的重答中找到具体依据。</p><div class="paste-actions"><button class="btn btn-primary" data-formal-practice="${t.index}" data-task-id="${esc(t.id)}">${t.status==='verified'?'再练一次，巩固这一点':'针对这一点重练 →'}</button><button class="btn btn-ghost" data-formal-locate="${t.index}">查看原回答</button><button class="btn btn-ghost" data-resume-task="${esc(t.id)}">去简历助手补事实</button></div><label class="resume-confirm"><input type="checkbox" data-task-carry="${esc(t.id)}" ${t.carry?'checked':''}> 下一场换个问题再验证</label>${t.attempts.length?'<details><summary>历次重练的证据</summary>'+t.attempts.map(a=>`<p>${esc(displayMockDate(a.date))} · ${taskLabels[a.outcome]}</p><p>${esc(a.criterion.reason)}</p><blockquote>${esc(a.criterion.quote||'本次回答中尚无充分依据')}</blockquote>`).join('')+'</details>':''}</div>`;}
 function taskSection(r){if(reviewable(r).length===1&&r.formal.evaluations[0])return '<p>本场仅完成开场介绍，尚未评估岗位能力。可先查看开场点评，再完成岗位问题。</p>';const tasks=r.formal.tasks;if(!tasks?.length)return r.blueprint?'<p>已评价的能力暂未形成待补任务；未回答、未覆盖的能力不代表已经掌握。</p>':'';const pending=tasks.filter(t=>t.status!=='verified'),primary=pending.find(t=>t.carry)||pending.find(t=>t.status==='needs_more')||pending[0],rest=tasks.filter(t=>t!==primary);return (primary?taskCard(r,primary,true):'<p>本轮记录的缺口已有重答依据，可换一个新问题验证迁移。</p>')+(rest.length?'<details><summary>其他训练项（'+rest.length+'）</summary>'+rest.map(t=>taskCard(r,t)).join('')+'</details>':'');}
 function practiceHtml(r){
  const t=r.practiceTask;if(!t)return '';const parent=mockStore.records.find(x=>x.id===t.recordId),task=parent?.formal?.tasks?.find(x=>x.id===t.id),last=task?.attempts.find(a=>a.recordId===r.id);
  return `<div class="ai-feedback" id="practiceTaskPanel"><h4>本次只练这一点</h4><p>${esc(t.title)}</p><p>${esc(t.reason)}</p><p><b>原回答依据</b></p><blockquote>${esc(t.sourceQuote)}</blockquote><p><b>达标条件：</b>${esc(t.title)}，让新回答提供具体依据。</p>${last?`<h4>${taskLabels[last.outcome]}</h4><p>${esc(last.criterion.reason)}</p><blockquote>${esc(last.criterion.quote||'仍缺少可核对的回答证据')}</blockquote>`:'<p class="mock-note">补充真实事实后完整重答；不会因为练过一次就标记掌握。</p>'}<div class="paste-actions"><button class="btn btn-ghost" id="practiceParent">查看原报告</button><button class="btn btn-ghost" id="practiceResumeFacts">去简历补事实</button>${last?'<button class="btn btn-primary" id="practiceContinue">'+(last.outcome==='verified'?'下一场换题验证':'再练一次这一点')+'</button>':''}</div></div>`;
 }
 function bindPractice(){
  const r=mockSession,t=r?.practiceTask;if(!t)return;const parent=()=>mockStore.records.find(x=>x.id===t.recordId);
  $('practiceParent')?.addEventListener('click',()=>{if(!mockAiBusy)viewHistory(mockStore.records.findIndex(x=>x.id===t.recordId));});
  $('practiceResumeFacts')?.addEventListener('click',()=>{const p=parent();if(p)openResumeTask(p,p.formal.tasks.find(x=>x.id===t.id));});
  $('practiceContinue')?.addEventListener('click',()=>{if(mockAiBusy)return;const p=parent(),task=p?.formal.tasks.find(x=>x.id===t.id);if(!task)return;if(r.status!=='saved'){saveMock();if(mockSession.status!=='saved')return;}if(task.status==='verified'){if(!toggleCarry(p,t.id,true))return;showSetup();$('mockMode').value='formal';saveSetup();}else practice(p,t.index,t.id);});
 }
 function completePractice(envelope,answer){
  const child=mockSession,t=child.practiceTask,parent=mockStore.records.find(r=>r.id===t.recordId);if(!parent)throw Error('未找到原报告，请先导入包含原报告的面试备份');
  const copy=JSON.parse(JSON.stringify(parent)),task=copy.formal.tasks.find(x=>x.id===t.id);if(!task||task.attempts.length>=20)throw Error('该任务的重练记录已达上限，请导出备份后开始新一场模拟');
  const outcome=InterviewPolicy.verifyTask(task,envelope,answer);if(task.attempts.some(a=>a.recordId===child.id))throw Error('这次重答已经记录，请查看原报告');
  task.status=outcome.outcome;task.attempts.push({recordId:child.id,date:envelope.meta.createdAt,answer,model:envelope.meta.model,version:envelope.meta.competencyVersion,...outcome});
  const draft=JSON.parse(JSON.stringify(snapshot()));draft.ai[0].retry.evaluation=envelope;const next={...mockStore,records:mockStore.records.map(r=>r.id===parent.id?copy:r),draft};
  if(!validStore(next)||!writeMockStore(next))return false;mockSession=draft;mockQuestions=draft.questions;mockAnswers=draft.answers;renderFocus();refreshHome();return true;
 }
 function cancelPractice(){const t=mockSession?.practiceTask;if(!t)return true;const parent=mockStore.records.find(r=>r.id===t.recordId);if(!parent)return true;const copy=JSON.parse(JSON.stringify(parent)),task=copy.formal.tasks.find(x=>x.id===t.id);if(!task)return true;task.status=task.attempts.at(-1)?.outcome||'selected';return saveReportCopy(copy);}
 function openResumeTask(r,t){
  if(!t||mockAiBusy)return;go('resume');let box=$('resumeTrainingHint');if(!box){box=document.createElement('aside');box.id='resumeTrainingHint';box.className='ai-feedback';$('resume').prepend(box);}
  const quote=r.questions[t.index].source?.kind==='resume'?r.questions[t.index].source.quote:'',locatable=quote&&resumeState.text.includes(quote);
  box.innerHTML=`<h4>从模拟面试带来的事实补充任务</h4><p>${esc(t.title)}</p><p>${esc(t.reason)}</p><blockquote>${esc(t.sourceQuote)}</blockquote><p class="mock-note">请在相关经历中补充你确实做过的事实。采用新稿只影响后续场次，原面试材料与回答保留。</p>${locatable?'<button class="btn btn-ghost" id="resumeTaskLocate">定位相关简历原文</button>':'<p class="mock-note">当前稿没有可精确定位的原文，请自行选择相关经历；不会自动改写或替换整份简历。</p>'}<button class="btn btn-ghost" id="resumeTaskReturn">返回这道题重练</button>`;
  $('resumeTaskLocate')?.addEventListener('click',()=>{const el=$('resumeText'),start=el.value.indexOf(quote);if(start>=0){el.focus();el.setSelectionRange(start,start+quote.length);el.scrollIntoView({block:'center'});}});$('resumeTaskReturn').onclick=()=>{go('mock');practice(r,t.index,t.id);};
 }
 function saveSetup(){
  if(!ready||goalsBlocked)return false;parseJd();const s=readSetup();let g=activeGoal();
  if(!g&&(s.jd.trim()||s.resume.trim()))g=createGoal(s,selectedJobAssociation('mockJob'));
  if(g&&!writeGoals({...goalState,goals:goalState.goals.map(x=>x.id===g.id?{...x,name:x.jobId?x.name:(s.jd.trim().split('\n')[0]||x.name).slice(0,200),working:s}:x)}))return false;
  updateControls();renderGoalCard();refreshHome();return true;
 }
 function homeState(){
  const current={...context(),jd:$('mockJd').value,...selectedJobAssociation('mockJob')};
  return InterviewPolicy.homeState(current,mockStore);
 }
 function refreshHome(){
  if(!ready||!$('overviewTraining'))return;
  const {context:goalContext,draft,last}=homeState(),r=draft||last||goalContext;
  const goal=r?label(r):($('mockJd').value.trim().split('\n')[0]||'还没有目标岗位');
  const reviews=last?.formal?.evaluations.filter(Boolean)||[],weak=last?.formal?.tasks!==undefined?last.formal.tasks.find(t=>t.status!=='verified')?.title:reviews.flatMap(e=>e.result.gaps)[0];
  $('overviewTraining').innerHTML=`<span class="eyebrow">Your next interview</span><h3>${esc(goal)}</h3><p>${draft?(draft.status==='active'?'有一场尚未完成的'+(draft.mode==='formal'?'正式模拟':'专项练习')+'，可以接着上次的位置继续。':'上次面试已结束，可以查看并完善复盘。'):'确认目标岗位与简历，完整练一场，再针对薄弱点重练。'}</p><p class="mock-note">${weak?'上次优先改进：'+esc(weak):'准备流程：目标岗位 → 简历确认 → 正式模拟 → 统一复盘 → 专项练习'}</p><div class="paste-actions">${draft?'<button class="btn btn-primary" id="homeContinue">继续上次练习 / 复盘 →</button>':''}<button class="btn ${draft?'btn-ghost':'btn-primary'}" id="homePrepare">准备正式模拟 →</button>${last?'<button class="btn btn-ghost" id="homeLastReport">查看上次正式复盘</button>':''}</div>`;
  $('homeContinue')?.addEventListener('click',()=>{if(mockAiBusy)return;go('mock');resumeDraft();});
  $('homePrepare').onclick=()=>{if(mockAiBusy)return;go('mock');showSetup();$('mockMode').value='formal';updateControls();};
  $('homeLastReport')?.addEventListener('click',()=>{go('mock');viewHistory(mockStore.records.indexOf(last));});
 }
 function init(){
  ready=true;bindResumePreview();$('mockRoomBack').onclick=showSetup;$('mockRoomContinue').onclick=()=>{if(!mockAiBusy&&!mockPlanBusy)resumeDraft();};$('mockRoomTools').onclick=()=>openRoomTools();$('mockToolsClose').onclick=closeRoomTools;$('mockToolsDialog').addEventListener('close',()=>{if(!$('mockToolsDialog').open)restoreModelHomes();});window.addEventListener('resize',()=>{if($('mockToolsDialog').open)positionRoomTools();});
  try{const raw=localStorage.getItem(goalsKey);if(raw){const data=JSON.parse(raw);if(!InterviewPolicy.validGoals(data))throw Error();goalState=data;}else{const legacy=JSON.parse(localStorage.getItem(key)||'null');if(legacy&&InterviewPolicy.validSetup({...emptySetup(),...legacy}))createGoal({...emptySetup(),...legacy},legacy);else if(mockStore.draft)createGoal(fromRecord(mockStore.draft),mockStore.draft);}}catch{goalsBlocked=true;storageMsg('目标准备存储异常，原数据保留，请导出检查；已保存的面试仍可查看和导出。');}
  const g=activeGoal();if(mockStore.draft&&g&&InterviewPolicy.sameGoal({goalId:g.id,jobId:g.jobId,jd:g.working.jd},mockStore.draft))restoreControls(mockStore.draft);else if(g)activateGoal(g.id);
  for(const id of ['mockMode','mockInterviewer','mockRole'])$(id).addEventListener('change',saveSetup);
  $('mockJd').addEventListener('input',saveSetup);
  $('mockProfile').addEventListener('input',()=>{$('mockConfirmResume').checked=false;setupConfirmed='';resumeMeta={resumeSource:'manual',resumeVersionId:null,resumeLabel:'手动填写'};saveSetup();});
  $('mockConfirmResume').onchange=()=>{setupConfirmed=$('mockConfirmResume').checked?$('mockProfile').value.trim():'';renderGoalCard();};
  $('mockUseResume').onclick=()=>{const notice=text=>{$('mockPlanMsg').textContent=text;$('mockResumeToolMsg').textContent=text;};if(resumeBlocked){notice('简历助手存储异常，请先导出检查。');return;}const accepted=currentAcceptedResume();if(!accepted){notice('请先在简历助手预览并确认整份新简历，再带入面试；也可以直接填写经历开练。');return;}const value=accepted.text;if(value.length>30000){notice('简历当前版本超过 30000 字，请先精简或仅粘贴相关经历。');return;}if(!value.trim()){notice('简历助手还没有正文，可先直接粘贴经历。');return;}
   if($('mockProfile').value.trim()&&$('mockProfile').value.trim()!==value.trim()&&!confirm('用简历助手的当前版本替换本次准备材料？已保存的面试不变。'))return;
   setResumeMetadata(value);
   $('mockProfile').value=value;if(!$('mockJd').value.trim())$('mockJd').value=accepted.jd;$('mockConfirmResume').checked=false;setupConfirmed='';saveSetup();notice('已带入已确认简历，请核对预览并确认。');$('mockResumeTools').open=false;};
  $('mockResumeVersion').onchange=e=>{const v=resumeState.versions.find(v=>v.id===e.target.value);if(!v||mockAiBusy)return;if(v.text.length>30000){$('mockResumeToolMsg').textContent='该版本超过 30000 字，请先精简。';return;}setResumeMetadata(v.text,v);$('mockProfile').value=v.text;$('mockConfirmResume').checked=false;setupConfirmed='';saveSetup();$('mockResumeTools').open=false;};
  $('targetJd').oninput=()=>{
   if(goalsBlocked||mockAiBusy||mockPlanBusy)return;
   $('mockJd').value=$('targetJd').value;
   const saved=saveSetup();$('targetMsg').textContent=saved?'已自动保存，后续准备使用这个目标。':'未能保存，当前输入保留，请先导出备份。';
  };
  $('targetNew').onclick=()=>{if(goalsBlocked||mockAiBusy||mockPlanBusy)return;if(!saveSetup()){$('targetMsg').textContent='当前目标未能保存，请先导出备份。';return;}const g=createGoal();if(g){activateGoal(g.id);renderTarget();$('targetJd').focus();}};
  $('targetResume').onclick=targetToResume;
  $('targetMock').onclick=()=>{if(goalsBlocked||mockAiBusy||mockPlanBusy)return;if(!$('mockJd').value.trim()){$('targetMsg').textContent='先填写岗位名称与要求，再继续准备。';return;}if(!saveSetup()){$('targetMsg').textContent='目标未能保存，请先导出备份。';return;}go('mock');showSetup();};
  $('targetDefault').onclick=()=>{const g=activeGoal();if(mockAiBusy||mockPlanBusy||!g)return;if(writeGoals({...goalState,goals:goalState.goals.map(x=>x.id===g.id?{...x,working:readSetup(),defaults:readSetup()}:x)})){renderGoalCard();$('targetMsg').textContent='已保存当前目标的准备配置。';}};
  $('targetReset').onclick=()=>{const g=activeGoal();if(mockAiBusy||mockPlanBusy||!g)return;if(JSON.stringify(readSetup())!==JSON.stringify(g.defaults)&&!confirm('恢复已保存的准备配置？本场临时调整将被替换，已开始的面试不变。'))return;applySetup(g.defaults);if(saveSetup())$('targetMsg').textContent='已恢复当前目标的准备配置。';};
  $('targetExport').onclick=()=>downloadAsset(goalsBlocked?{recovery:true,raw:localStorage.getItem(goalsKey)}:goalState,'zhimian-goal-preparation.json');
  $('targetImport').onclick=()=>{if(!mockAiBusy)$('targetGoalFile').click();};$('targetGoalFile').onchange=async e=>{try{if(goalsBlocked)throw Error('原目标准备存储异常，请先导出检查');const file=e.target.files[0];if(!file)return;if(file.size>5e6)throw Error('备份超过 5 MB');const data=JSON.parse(await file.text());if(!InterviewPolicy.validGoals(data))throw Error('目标备份格式错误');const added=data.goals.filter(x=>!goalState.goals.some(g=>g.id===x.id||g.jobId&&g.jobId===x.jobId));const wasEmpty=!activeGoal();if(writeGoals({...goalState,activeId:goalState.activeId||data.activeId,goals:[...goalState.goals,...added]})){if(wasEmpty&&activeGoal())activateGoal(goalState.activeId);renderGoalCard();storageMsg('已合并目标准备，同目标保留现有材料。');$('targetMsg').textContent='已合并目标准备，同目标保留现有材料。';}else{$('targetMsg').textContent='目标导入未能保存，原数据保留。';}}catch(err){storageMsg(err.message+'，原数据保留。');$('targetMsg').textContent=err.message+'，原数据保留。';}finally{e.target.value='';}};
  $('formalStart').onclick=start;$('overviewPrepareTarget').onclick=()=>go('target');updateControls();renderGoalCard();refreshHome();
  document.addEventListener('zm-leave-mock',()=>{closeRoomTools();if(roomPhase.startsWith('leaving')){++roomSerial;roomAnimation?.cancel();roomAnimation=null;roomPhaseTo('prepare');}if(mockSession?.status==='active'){stopMockVoice();stopTimer();if(mockSession.mode==='formal')ensureControl(mockSession).paused=true;persistDraft();if(mockSession.mode==='formal'&&!mockAiBusy)renderQuestion();}});
 }
 async function start(){
  if(mockAiBusy||mockPlanBusy||mockStorageBlocked)return;
  const message=$('mockPlanMsg'),jd=$('mockJd').value.trim(),resume=$('mockProfile').value.trim();
  if(!jd){message.textContent='请先选择目标岗位；还没有目标时，请到「目标岗位」创建。';return;}
  if(jd.length>10000){message.textContent='目标 JD 最多 10000 字，请精简后开始。';return;}
  if(resume.length>30000){message.textContent='简历 / 经历最多 30000 字，请精简后开始。';return;}
  if(resume&&(!$('mockConfirmResume').checked||setupConfirmed!==resume)){message.textContent='请先核对本次简历 / 经历并勾选确认。';$('mockMaterialDetails').open=true;$('mockConfirmResume').focus();return;}
  if(mockSession?.status==='report'||mockSession?.practiceTask&&mockSession.ai?.[0]?.retry?.evaluation&&mockSession.status!=='saved'){saveMock();if(mockSession.status!=='saved'){message.textContent='上场报告尚未保存，请先导出备份。';return;}}
  if(mockStore.draft&&!confirm('开始新的正式模拟会替换当前草稿，已保存记录保留。继续吗？'))return;
  stopMockVoice();stopTimer();if(mockSession?.status==='active'&&!persistDraft()){message.textContent='草稿保存失败，请先导出备份。';return;}
  parseJd();if(!saveSetup())return;const runContext={...context(),jd,resume,role:mockRole,roleSelection:$('mockRole').value,interviewer:$('mockInterviewer').value,...selectedJobAssociation('mockJob')};
  let roomStarted=false;const controls=[...document.querySelectorAll('#mock .mock-setup input,#mock .mock-setup textarea,#mock .mock-setup select,#mock .mock-setup button')],disabled=controls.map(el=>el.disabled);
  controls.forEach(el=>el.disabled=true);mockPlanBusy=true;setMockAiBusy(true);message.textContent='面试官正在根据岗位与经历准备问题，原材料和草稿会保留…';
  try{
   if(!await beginRoom())return;runContext.selectedFocus=focusSnapshot();const frozenBlueprint=InterviewPolicy.blueprint(runContext.interviewer,runContext.role);
   const plan=await requestAi('interview-plan',{...runContext,count:5,blueprintVersion:frozenBlueprint.version,focus:toAiFocus(runContext.selectedFocus)});
   if(plan.result?.questions?.length!==5||!plan.result.questions.every(q=>q&&typeof q.q==='string'&&typeof q.topic==='string'&&Array.isArray(q.points)&&q.points.length>0&&q.points.every(x=>typeof x==='string')&&q.source&&['resume','jd'].includes(q.source.kind)&&typeof q.source.quote==='string'&&q.source.quote.trim()&&(q.source.kind==='resume'?resume:jd).includes(q.source.quote)))throw Error('题目或材料依据异常，请重试。');
   const questions=[{kind:'intro',topic:'开场介绍',q:'请用两分钟介绍与你目标岗位最相关的经历，以及这次求职的方向。',points:['相关经历','个人职责','求职方向']},...plan.result.questions.map(q=>({...q,kind:'main'})),{kind:'closing',topic:'候选人反问',q:'面试接近结束，你有什么想向面试官了解的问题？也可以直接结束。',points:[]}];
   const session={schemaVersion:2,id:crypto.randomUUID(),date:new Date().toISOString(),...runContext,blueprint:frozenBlueprint,mode:'formal',questionPlan:plan.meta,questions,answers:Array(7).fill(''),durations:Array(7).fill(0),ai:Array(7).fill(null),count:7,index:0,rate:'未评',keywords:mockFound.slice(),status:'active',formal:{phase:'active',turns:[],pending:null,draft:'',decisionPending:false,evaluations:Array(7).fill(null),control:{paused:false,clarifications:[],skipped:[]}}};
   if(!validRecord(session,true))throw Error('本场材料或考察标准异常，请重新准备');
   if(!writeMockStore({...mockStore,draft:session})){message.textContent='新场次保存失败，原草稿仍保留，请先导出备份。';return;}
   mockSession=session;mockQuestions=session.questions;mockAnswers=session.answers;mockIdx=0;mockSec=0;mockSelfRate='';message.textContent='已准备好，正式模拟开始。';roomStarted=true;renderQuestion();renderMockHistory();
  }catch(e){message.textContent=e.message+' 材料和原草稿已保留，可重试或切换专项练习。';}
  finally{mockPlanBusy=false;setMockAiBusy(false);controls.forEach((el,i)=>el.disabled=disabled[i]);renderMockHistory();if(!roomStarted)showSetup();else if(mockSession?.status==='active')startTimer();}
 }
 function ensureControl(r){return r.formal.control||(r.formal.control={paused:false,clarifications:[],skipped:[]});}
 function questionKey(){return mockIdx+':'+(mockSession.formal.pending?'followup':'main')+':'+mockSession.formal.turns.filter(t=>t.index===mockIdx).length;}
 function syncControls(){if(mockSession?.mode!=='formal'||mockSession.status!=='active')return;const f=mockSession.formal,c=ensureControl(mockSession);for(const id of ['formalNext','formalSkip','formalUnknown'])if($(id))$(id).disabled=mockAiBusy||c.paused;if($('formalClarify'))$('formalClarify').disabled=mockAiBusy||c.paused||f.decisionPending||c.clarifications.some(x=>x.key===questionKey());}
 function pause(value){if(mockAiBusy||mockSession?.mode!=='formal'||mockSession.status!=='active')return;stopMockVoice();stopTimer();ensureControl(mockSession).paused=value;persistDraft();renderQuestion();}
 function skip(unknown=false){
  if(mockAiBusy||ensureControl(mockSession).paused)return;const f=mockSession.formal,c=f.control;stopMockVoice();c.skipped=c.skipped.filter(x=>x.index!==mockIdx);c.skipped.push({index:mockIdx,reason:unknown?'unknown':'skip'});
  if(f.pending){f.turns.push({index:mockIdx,...f.pending,answer:f.draft});f.pending=null;f.draft='';}advance();
 }
 async function clarify(){
  if(mockAiBusy||ensureControl(mockSession).paused||mockSession.formal.decisionPending)return;const r=mockSession,f=r.formal,q=f.pending?.question||mockQuestions[mockIdx].q,index=mockIdx,key=questionKey();
  if(f.control.clarifications.some(c=>c.key===key))return;stopMockVoice();stopTimer();persistDraft();setMockAiBusy(true);let failure='';
  try{const out=await requestAi('interview-clarify',{sessionId:r.id,turnId:key,question:q,interviewer:r.interviewer});const v=out.result;if(mockSession?.id!==r.id||mockIdx!==index)return;if(typeof v?.explanation!=='string'||v.explanation.length>1000||typeof v.quote!=='string'||!v.quote.trim()||!q.includes(v.quote))throw Error('题意说明依据异常');f.control.clarifications.push({index,key,question:q,explanation:v.explanation,quote:v.quote});persistDraft();}
  catch(e){failure=e.message+'，原问题和回答保留，可重试澄清或直接作答。';}
  finally{setMockAiBusy(false);renderQuestion();$('formalMessage').textContent=failure||'已澄清题意，不计入实质追问次数。';}
 }
 function renderQuestion(){
  const r=mockSession,f=r.formal,p=profile(r),q=f.pending?.question||mockQuestions[mockIdx].q,closing=mockIdx===6,control=ensureControl(r),paused=control.paused,clarification=control.clarifications.find(c=>c.key===questionKey());
  setStageMode(true);$('mockStage').innerHTML=`<div class="formal-stage"><div class="stage-bar"><div class="who">${r.interviewer==='hr'?'HR':'面'}</div><div><div class="who-name">${esc(p.name)} · 正式模拟</div><div class="who-sub">${esc(label(r))}</div></div><div class="stage-timer"><span class="step">${mockIdx===0?'开场':closing?'候选人反问':'岗位问题 '+mockIdx+'/5'}</span><span class="t" id="mockClock"></span></div></div><div class="stage-body"><div class="formal-toolbar"><span class="formal-status" id="formalStatus">${paused?'已暂停，回答已保存':f.decisionPending?'回答已保存，等待面试官判断下一步':'轮到你回答'}</span><button class="btn btn-ghost" id="formalEnd">提前结束并复盘</button><button class="btn btn-ghost" id="formalPause">${paused?'继续面试':'暂停'}</button><button class="btn btn-ghost" id="formalClarify">澄清题意</button><button class="btn btn-ghost" id="formalUnknown">不会，换下一题</button></div><div class="formal-progress"><span style="width:${Math.round(mockIdx/7*100)}%"></span></div>${mockIdx===0?`<p>你好，我是本场的${esc(p.name)}。我们重点聊${esc(p.focus)}。预计约 15 分钟，结束后会统一整理复盘。</p>`:''}<div class="q-topic">${f.pending?'针对刚才回答的追问':esc(mockQuestions[mockIdx].topic)}</div><div class="formal-question">${esc(q)}</div>${clarification?'<div class="ai-feedback"><b>题意说明</b><p>'+esc(clarification.explanation)+'</p></div>':''}<p class="mock-note">${closing?'你的反问会保留在报告中。模拟面试官不代表真实企业，不会编造公司政策。':'正式模拟中不展示评分与参考答案，回答后根据内容继续追问或进入下一题。'}</p></div><div class="stage-foot"><div id="mockVoiceTools"></div><label for="mockA">${closing?'你想了解的问题':'本次回答'}</label><textarea id="mockA" maxlength="12000" ${f.decisionPending||paused?'readonly':''} aria-label="本题回答"></textarea><div class="formal-toolbar"><button class="btn btn-primary" id="formalNext">${f.decisionPending?'重试面试官回应':closing?'结束面试，查看复盘':'我答完了 →'}</button><button class="btn btn-ghost" id="formalSkip">${f.decisionPending?'先进入下一题':closing?'没有问题，结束面试':'跳过本题'}</button></div><p id="formalMessage" class="mock-note" role="status" aria-live="polite"></p></div><details class="formal-transcript"><summary>已记录的回答（${mockAnswers.filter(a=>a.trim()).length} 道主问题，含开场）</summary>${mockQuestions.slice(0,mockIdx+1).map((q,i)=>`<p><b>${esc(q.topic)}</b> · ${esc(q.q)}</p><blockquote>${esc(mockAnswers[i]||'尚未作答')}</blockquote>`+f.turns.filter(t=>t.index===i).map(t=>`<p>追问：${esc(t.question)}</p><blockquote>${esc(t.answer||'跳过追问')}</blockquote>`).join('')).join('')}</details></div>`;
  const input=$('mockA');input.value=f.pending?f.draft:mockAnswers[mockIdx];input.oninput=()=>{if(f.pending)f.draft=input.value;else mockAnswers[mockIdx]=input.value;persistDraft();};
  $('formalNext').onclick=submit;$('formalSkip').onclick=()=>skip();$('formalPause').onclick=()=>pause(!paused);$('formalUnknown').onclick=()=>skip(true);$('formalClarify').onclick=clarify;
  for(const id of ['formalNext','formalSkip','formalUnknown','formalClarify'])$(id).disabled=paused;$('formalClarify').disabled=paused||f.decisionPending||!!clarification;
  $('formalEnd').onclick=()=>{if(mockAiBusy)return;if(confirm('提前结束这场面试？已填写的回答会进入复盘，未答题不会计为零分。'))finish();};
  roomQuestionMotion();if(!f.decisionPending&&!paused)mountMockVoice('mockA','mockVoiceTools');if(!paused)startTimer();else stopTimer();
 }
 function elapsed(){return mockSession.durations.reduce((sum,n,i)=>sum+(i===mockIdx?mockSec:n),0);}
 function clock(){const el=$('mockClock');if(!el||mockSession?.mode!=='formal'||mockSession.status!=='active')return;const n=Math.max(0,900-elapsed());el.textContent=n?String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'):'建议时间已到';}
 async function submit(){
  if(mockAiBusy||!mockSession||mockSession.status!=='active'||ensureControl(mockSession).paused)return;stopMockVoice();
  const r=mockSession,f=r.formal,index=mockIdx,id=r.id,message=t=>{if($('formalMessage'))$('formalMessage').textContent=t;};
  if(!f.decisionPending){const answer=f.pending?f.draft:mockAnswers[index];if(!answer.trim()){message('请先回答，或选择跳过。');return;}
   if(f.pending){f.turns.push({index,...f.pending,answer});f.pending=null;f.draft='';}f.decisionPending=true;
  }
  if(!persistDraft()){message('回答未能保存，请先导出备份。');return;}
  if(index===0||index===6||f.turns.filter(t=>t.index===index).length===2){advance();return;}
  stopTimer();setMockAiBusy(true);message('面试官正在思考下一步，回答已保存…');$('formalStatus').textContent='面试官思考中';
  try{
   const turns=f.turns.filter(t=>t.index===index),out=await requestAi('interview-turn',{sessionId:r.id,turnId:index+':answer:'+turns.length,...rubricContext(r,index),focus:toAiFocus((r.selectedFocus||[]).filter(t=>t.criterionId.startsWith(mockQuestions[index].competencyId+'.'))),history:r.questions.slice(0,index).map((q,i)=>({question:q.q,answer:InterviewPolicy.combined(r,i).slice(0,1500),competencyId:q.competencyId||'',truncated:InterviewPolicy.combined(r,i).length>1500})),question:mockQuestions[index].q,answer:mockAnswers[index],followUps:turns.map(t=>({question:t.question,answer:t.answer})),jd:r.jd,resume:r.resume,interviewer:r.interviewer});
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
  stopMockVoice();stopTimer();const f=mockSession.formal;ensureControl(mockSession).paused=false;if(f.pending){f.turns.push({index:mockIdx,...f.pending,answer:f.draft});}f.pending=null;f.draft='';f.decisionPending=false;f.phase='report';mockSession.status='report';persistDraft();renderReport();renderMockHistory();evaluateReport();
 }
 function reviewable(r){return r.questions.map((q,i)=>i).filter(i=>i<6&&InterviewPolicy.combined(r,i).trim());}
 function baseReportHtml(r){
  const f=r.formal,entries=reviewable(r),done=entries.filter(i=>f.evaluations[i]),strengths=[...new Set(done.flatMap(i=>f.evaluations[i].result.strengths))].slice(0,3),seen=new Set(),gaps=[...done.filter(i=>i>0),...done.filter(i=>i===0)].flatMap(i=>f.evaluations[i].result.gaps.map(text=>({text,index:i}))).filter(g=>{if(seen.has(g.text))return false;seen.add(g.text);return true;}).slice(0,3);
  return `<h3>正式模拟复盘 · ${esc(profile(r).name)}</h3><p>${esc(label(r))} · ${esc(displayMockDate(r.date))}</p><p class="mock-note">${entries.length} 道回答有内容 · ${done.length} 道完成 AI 复盘 · 候选人反问单独记录、不评分。分数仅供练习参考。</p><div class="formal-review-grid"><div><h4>哪里讲清楚了</h4>${strengths.length?'<ul>'+strengths.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>':'<p>完成复盘后，根据你的原话展示具体优点。</p>'}</div><div><h4>下一次优先练什么</h4>${r.blueprint?taskSection(r):(gaps.length?gaps.map(g=>`<p>${esc(g.text)}</p><button class="btn btn-ghost" data-formal-locate="${g.index}">查看回答依据</button><button class="btn btn-ghost" data-formal-practice="${g.index}">专项重练第 ${g.index+1} 题 →</button>`).join(''):'<p>有内容的回答会逐项复盘；未回答的题目不填零分。</p>')}</div></div><p id="formalReviewStatus" role="status" class="mock-note"></p>${entries.some(i=>!f.evaluations[i]?.result.review)?'<button class="btn btn-primary" id="formalEvaluate">'+(done.length?'补全逐句点评与参考回答':'生成统一复盘')+'</button>':''}${resumeFactsHtml(r)}<div class="paste-actions"><button class="btn btn-ghost" data-formal-setup>准备下一场正式模拟</button></div><h4>回答与评价依据</h4>${r.questions.map((q,i)=>`<details class="report-item" id="formalAnswer${i}"><summary>${i+1}. ${esc(q.topic)} · ${i===6?'候选人反问':!r.answers[i].trim()?'跳过 / 未回答':f.evaluations[i]?'已复盘':'尚未复盘'}</summary><p>${esc(q.q)}</p>${questionSource(q)}<blockquote style="white-space:pre-wrap">${esc(r.answers[i]||'未回答，不评分')}</blockquote>${f.turns.filter(t=>t.index===i).map(t=>`<p><b>追问</b> ${esc(t.question)}</p><blockquote style="white-space:pre-wrap">${esc(t.answer||'未回答追问')}</blockquote>`).join('')}${f.evaluations[i]?aiFeedbackHtml(f.evaluations[i],'依据本题全部回答的点评',InterviewPolicy.combined(r,i))+`<button class="btn btn-primary" data-formal-practice="${i}">把这道题再练一次 →</button>`:''}</details>`).join('')}`;
 }
 function reportHtml(r){return baseReportHtml(r)+interviewRepeatHtml(r);}
 function bindReport(r){
  bindInterviewRepeats(r);
  document.querySelectorAll('[data-formal-locate]').forEach(b=>b.onclick=()=>{const item=$('formalAnswer'+b.dataset.formalLocate);item.open=true;item.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
  document.querySelectorAll('[data-formal-practice]').forEach(b=>b.onclick=()=>practice(r,Number(b.dataset.formalPractice),b.dataset.taskId||null));
  document.querySelectorAll('[data-resume-task]').forEach(b=>b.onclick=()=>openResumeTask(r,r.formal.tasks.find(t=>t.id===b.dataset.resumeTask)));
  document.querySelectorAll('[data-task-carry]').forEach(b=>b.onchange=()=>{if(!toggleCarry(r,b.dataset.taskCarry,b.checked)){b.checked=!b.checked;return;}if(mockSession?.id===r.id)renderReport();else{const latest=mockStore.records.find(x=>x.id===r.id);$('mockStage').innerHTML='<div class="report formal-stage">'+reportHtml(latest)+'</div>';bindReport(latest);}});
  document.querySelectorAll('[data-formal-resume]').forEach(b=>b.onclick=()=>openResumeFacts(r));
  document.querySelectorAll('[data-formal-setup]').forEach(b=>b.onclick=()=>{showSetup();$('mockMode').value='formal';updateControls();});
  if($('formalEvaluate'))$('formalEvaluate').onclick=()=>evaluateReport(r);
 }
 function renderReport(){setStageMode(true,'report');const r=snapshot(),saved=mockSession.status==='saved';$('mockStage').innerHTML=`<div class="report formal-stage">${reportHtml(r)}<div class="report-actions"><button class="btn btn-primary" id="mockSave" ${saved||mockAiBusy?'disabled':''}>${saved?'已保存 ✓':'保存正式模拟记录'}</button><button class="btn btn-ghost" id="formalExport">导出面试备份</button></div></div>`;bindReport(r);$('mockSave').onclick=saveMock;$('formalExport').onclick=exportMock;if($('formalEvaluate'))$('formalEvaluate').disabled=mockAiBusy;}
 function resumeFacts(r){return reviewable(r).flatMap(index=>(r.formal.evaluations[index]?.result.review?.missingFacts||[]).map(f=>({...f,index})));}
 function resumeFactsHtml(r){return resumeFacts(r).length?'<details class="formal-resume-facts"><summary>需要把经历细节补进简历？（可选）</summary><p class="mock-note">如果点评提醒你补充的项目、个人行动或成果也需要写进简历，可回简历助手完善。只练口头表达时，可直接重答，无需修改简历。</p><button class="btn btn-ghost" data-formal-resume>去简历助手完善经历 ↗</button></details>':'';}
 function openResumeFacts(r){
  if(mockAiBusy)return;const facts=resumeFacts(r);if(!facts.length)return;go('resume');let box=$('resumeTrainingHint');if(!box){box=document.createElement('aside');box.id='resumeTrainingHint';box.className='ai-feedback';$('resume').prepend(box);}
  box.innerHTML='<h4>面试中可以补充的经历细节</h4><p>仅当这些细节也需要写进简历时，再选择相关经历进行修改。这里不会自动改写简历，本场材料、回答与点评均保留。</p><ul>'+facts.slice(0,6).map(f=>'<li><b>'+esc(r.questions[f.index].topic)+'</b>：'+esc(f.question)+'</li>').join('')+'</ul><button class="btn btn-ghost" id="resumeFactsReturn">返回本场复盘</button>';
  $('resumeFactsReturn').onclick=()=>go('mock');box.scrollIntoView({block:'center',behavior:reducedMotion()?'instant':'smooth'});
 }
 function paintFormalReview(r,message=''){
  const scroll=window.scrollY,open=[...document.querySelectorAll('#mockStage details[open][id]')].map(el=>el.id);
  if(mockSession?.id===r.id)renderReport();else{$('mockStage').innerHTML='<div class="report formal-stage">'+reportHtml(r)+'</div>';bindReport(r);}
  for(const id of open)if($(id))$(id).open=true;
  if($('formalReviewStatus'))$('formalReviewStatus').textContent=message;
  $('mockStage').setAttribute('aria-busy',String(reviewBusy));
  if(reviewBusy){setMockAiBusy(true);if($('formalEvaluate'))$('formalEvaluate').textContent='正在生成复盘…';}
  window.scrollTo({top:scroll,behavior:'instant'});
 }
 async function evaluateReport(record=mockSession){
  if(reviewBusy||mockAiBusy||!record||record.mode!=='formal'||record.status==='active')return;
  // History reports may be completed without replacing the current draft.
  let target=record.id===mockSession?.id?mockSession:mockStore.records.find(r=>r.id===record.id);if(!target)return;
  const todo=reviewable(target).filter(i=>!target.formal.evaluations[i]?.result.review);if(!todo.length)return;
  reviewBusy=true;setMockAiBusy(true);const failures=[];
  try{for(const index of todo){try{
    paintFormalReview(target,'正在复盘第 '+(index+1)+' 题，已完成 '+reviewable(target).filter(i=>target.formal.evaluations[i]?.result.review).length+' 道；回答已保留…');
    const out=await requestAi('interview',{...rubricContext(target,index),question:target.questions[index].q,answer:target.answers[index],followUps:target.formal.turns.filter(t=>t.index===index&&t.answer.trim()).map(t=>({question:t.question,answer:t.answer})),jd:target.jd,resume:target.resume,role:target.role,interviewer:target.interviewer,reviewOnly:true,detailedReview:true},{openSettings:false});
    if(!isInterviewEnvelope(out)||!InterviewPolicy.validAnswerReview(out.result.review,InterviewPolicy.combined(target,index),InterviewPolicy.combined(target,index)+'\n'+(target.resume||''),true)||!out.result.evidenceQuotes.length||!out.result.evidenceQuotes.every(q=>InterviewPolicy.combined(target,index).includes(q)))throw Error('复盘引用与原回答不符');
    if(!InterviewPolicy.validCriteriaEnvelope(out,InterviewPolicy.combined(target,index))||target.blueprint&&index>0&&(out.meta.competencyId!==target.questions[index].competencyId||out.meta.competencyVersion!==target.blueprint.version))throw Error('点评能力标准与本题不一致');
    const candidate=JSON.parse(JSON.stringify(target));candidate.formal.evaluations[index]=out;if(candidate.blueprint)candidate.formal.tasks=InterviewPolicy.deriveTasks(candidate);
    if(!validRecord(candidate,candidate.status!=='saved'))throw Error('复盘结果未通过保存检查，原记录已保留');
    if(!saveReportCopy(candidate))throw Error('复盘保存失败，请导出备份');target=candidate;
   }catch(e){failures.push({index,message:e.message.replace(/[。.\s]+$/,'')});if(e.code!=='ANSWER_REVIEW_INCOMPLETE')break;}}}
  finally{reviewBusy=false;setMockAiBusy(false);paintFormalReview(target,failures.length?'第 '+failures.map(f=>f.index+1).join('、')+' 题：'+failures.at(-1).message+'。已完成的点评和全部回答已保留，可继续生成剩余复盘。':'本场已作答题目的复盘已整理；未作答题不评分。可展开查看点评，再选择一个问题重练。');renderMockHistory();refreshHome();}
 }

 function practice(record,index,taskId=null){
  if(mockAiBusy||reviewBusy)return;const original=record.id===mockSession?.id?mockSession:mockStore.records.find(r=>r.id===record.id);if(!original?.formal?.evaluations[index])return;
  if(mockSession?.practiceTask&&mockSession.ai?.[0]?.retry?.evaluation&&mockSession.status!=='saved'){saveMock();if(mockSession.status!=='saved')return;}
  const task=original.formal.tasks?.find(t=>taskId?t.id===taskId:t.index===index&&t.status!=='verified');if(taskId&&(!task||task.index!==index))return;
  if(task?.attempts.length>=20){storageMsg('该任务已保留 20 次重练，请导出备份后开始新一场正式模拟。');return;}
  if(mockSession&&mockSession.status!=='saved'&&mockSession.id!==original.id&&!persistDraft())return;
  if(original.status!=='saved'){
   if(!writeMockStore({...mockStore,records:[{...original,status:'saved'},...mockStore.records.filter(r=>r.id!==original.id)],draft:mockStore.draft?.id===original.id?null:mockStore.draft}))return;original.status='saved';
  }
  if(mockStore.draft&&mockStore.draft.id!==original.id&&!confirm('开始这道专项练习会替换当前草稿；正式模拟报告保留。继续吗？'))return;
  const answer=InterviewPolicy.combined(original,index),session={schemaVersion:2,id:crypto.randomUUID(),date:new Date().toISOString(),jd:original.jd,resume:original.resume,role:original.role,roleSelection:original.roleSelection||'auto',...(original.goalId?{goalId:original.goalId,preparation:original.preparation}:{}),...(original.blueprint?{blueprint:original.blueprint}:{}),...(original.jobId?{jobId:original.jobId,jobSnapshot:original.jobSnapshot}:{}),mode:'coaching',interviewer:original.interviewer,origin:{recordId:original.id,index},questions:[original.questions[index]],answers:[answer],durations:[0],ai:[{sourceAnswer:answer,initial:original.formal.evaluations[index],followUpAnswer:'',final:null,retry:{answer:'',evaluation:null}}],count:1,index:0,rate:'未评',keywords:original.keywords.slice(),status:'active'};
  let records=mockStore.records;
  if(task){session.origin.taskId=task.id;session.practiceTask={id:task.id,recordId:original.id,index,competencyId:task.competencyId,criterionId:task.criterionId,title:task.title,reason:task.reason,sourceQuote:task.sourceQuote};records=records.map(r=>r.id===original.id?{...r,formal:{...r.formal,tasks:r.formal.tasks.map(t=>t.id===task.id?{...t,status:'practicing'}:t)}}:r);}
  const next={...mockStore,records,draft:session};if(!validStore(next)||!writeMockStore(next))return;mockSession=session;mockQuestions=session.questions;mockAnswers=session.answers;mockIdx=0;mockSec=0;mockSelfRate='';restoreControls(session);window.renderQuestion();renderMockHistory();$('mockRetryAnswer')?.focus();
 }
 return {init,showSetup,restoreControls,saveSetup,selectJob,useResume,context,homeState,renderTarget,rubricContext,criteriaHtml,syncControls,practiceHtml,bindPractice,completePractice,cancelPractice,refreshPreparation:()=>{if(ready){if(!mockAiBusy&&!mockPlanBusy)showSetup();renderGoalCard();renderFocus();}},refreshHome,setStageMode,beginRoom,roomQuestionMotion,openRoomTools,closeRoomTools,renderQuestion,renderReport,reportHtml,bindReport,clock};
})();
