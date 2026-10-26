/* Independent resume workspaces. The legacy key is retained as a migration backup. */
(function(root){
 'use strict';
 const KEY='zm_resume_library_v1',clone=v=>JSON.parse(JSON.stringify(v));
 const compose=s=>{let text=s.text;for(const x of s.sections.filter(x=>x.adopted!==null).map(x=>({...x,start:x.start===undefined?s.text.indexOf(x.original):x.start})).sort((a,b)=>b.start-a.start))if(x.start>=0)text=text.slice(0,x.start)+x.adopted+text.slice(x.start+x.original.length);return text;};
 const empty=()=>({schemaVersion:1,workflowVersion:2,text:'',jd:'',diagnosis:null,sections:[],versions:[],accepted:null,draftBackups:[]});
 const versionNumber=v=>Number.isInteger(v?.number)&&v.number>0?v.number:1;
 const intentionRange=text=>{const re=/^[ \t]*(?:求职意向|意向岗位|目标岗位|求职岗位|应聘岗位)(?:[ \t]*[：:][ \t]*|[ \t]+|\r?\n[ \t]*)(?:\r?\n[ \t]*)?([^\r\n|｜\t]{1,100})/gm,m=re.exec(text);if(!m)return null;const value=m[1].trim();return value?{start:m.index+m[0].lastIndexOf(m[1])+m[1].indexOf(value),text:value}:null;};
 function validate(data,validState){
  const str=(x,n)=>typeof x==='string'&&x.length<=n;
  if(!data||data.schemaVersion!==1||!Array.isArray(data.resumes)||data.resumes.length>100||!Array.isArray(data.originals)||data.originals.length>200||!(data.activeId===null||str(data.activeId,100)))return false;
  const ids=new Set(),originalIds=new Set();
  for(const r of data.resumes){if(!r||!str(r.id,100)||!r.id||ids.has(r.id)||!str(r.name,100)||!r.name.trim()||!str(r.role,100)||!(r.goalId===null||str(r.goalId,100))||!str(r.createdAt,100)||!str(r.updatedAt,100)||!r.state||typeof r.state!=='object'||!validState(r.state))return false;ids.add(r.id);if(r.notice!==undefined&&!str(r.notice,1000))return false;}
  for(const o of data.originals){const s=o?.source;if(!s||!str(s.id,32)||!/^[a-f0-9]{32}$/.test(s.id)||!str(s.name,240)||!['.pdf','.docx'].includes(s.ext)||(s.pages!==undefined&&(!Number.isInteger(s.pages)||s.pages<1||s.pages>30))||originalIds.has(s.id)||!(o.text===null||str(o.text,30000)))return false;originalIds.add(s.id);}
  return data.activeId===null||ids.has(data.activeId);
 }
 function migrate(legacy,{id,date}){
  const data={schemaVersion:1,activeId:null,resumes:[],originals:[]};
  if(!legacy)return data;
  const state=clone(legacy);state.workflowVersion=2;state.draftBackups||=[];state.accepted||=null;
  const add=source=>{if(source&&!data.originals.some(o=>o.source.id===source.id))data.originals.push({source:clone(source),text:null});};
  add(state.source);for(const v of [...state.versions,...state.draftBackups])add(v.source);
  if(!state.text.trim()&&!state.source&&!state.versions.length&&!state.draftBackups.length)return data;
  const role=state.jd.trim().split('\n')[0].slice(0,80),r={id,name:(role||'我的简历')+' · 原有编辑稿',role,goalId:null,createdAt:date,updatedAt:date,state};
  // Historical paragraph snapshots are records, never new confirmed delivery versions.
  if(!state.accepted&&state.text.trim())r.notice='原有内容已保留为待核对草稿；旧优化记录在本简历的历史版本中。请先预览，核对后确认投递版。';
  let number=state.versions.filter(v=>v.kind==='confirmed-resume').length;for(const v of state.versions)if(v.kind==='confirmed-resume')v.number=number--;
  if(state.accepted){state.accepted.resumeId=id;state.accepted.resumeName=r.name;state.accepted.number=state.versions.filter(v=>v.kind==='confirmed-resume').length||1;}
  data.resumes.push(r);data.activeId=id;return data;
 }
 function create(h){
  const $=id=>document.getElementById(id),esc=h.esc;let data=null,view='library',editing=null,previewSerial=0,previewMode='draft',target=null,lastRaw=null,previewController=null;
  const now=()=>new Date().toISOString(),uid=()=>crypto.randomUUID(),busy=()=>h.busy()||h.blocked();
  const current=()=>data?.resumes.find(r=>r.id===data.activeId)||null;
  const message=t=>{$('resumeLibraryMsg').textContent=t;h.message(t);};
  function persist(next){try{if(localStorage.getItem(KEY)!==lastRaw){message('另一标签页已更新简历。请先下载当前草稿备份，再刷新查看，避免覆盖。');return false;}if(!validate(next,h.validate))throw Error('简历资料格式异常');const raw=JSON.stringify(next);localStorage.setItem(KEY,raw);lastRaw=raw;data=next;return true;}catch(e){message('未能保存，当前内容和原数据保留。请先下载备份，再重试。');return false;}}
  function save(state=h.getState()){
   if(h.blocked())return false;const r=current();if(!r)return !state.text.trim();if(JSON.stringify(r.state)===JSON.stringify(state)){renderIdentity();return true;}
   const next=clone(data),x=next.resumes.find(x=>x.id===r.id);x.state=clone(state);x.updatedAt=now();if(state.accepted)delete x.notice;
   if(!persist(next))return false;renderIdentity();return true;
  }
  function load(r){const state=clone(r?.state||empty());if(state.accepted&&!state.versions.some(v=>v.id===state.accepted.id))state.versions.unshift({...clone(state.accepted),kind:'confirmed-resume'});h.setState(state);h.reset();h.render();renderIdentity();}
  function show(which){view=which;$('resumeLibraryHome').hidden=which!=='library';$('resumeEditorShell').hidden=which!=='editor';if(which==='library')render();else renderIdentity();}
  function open(id){if(busy())return false;if(!save())return false;const r=data.resumes.find(r=>r.id===id);if(!r)return false;const next={...data,activeId:id};if(!persist(next))return false;load(current());show('editor');const hint=$('resumeTrainingHint');if(hint&&!hint.hidden)$('resumeEditorShell').prepend(hint);h.scroll();$('resumeEditorTitle').focus({preventScroll:true});return true;}
  function enter(){if(busy()&&view==='editor')return false;if(!h.blocked()&&!save())return false;target=null;$('resumeLibraryContext').hidden=true;const hint=$('resumeTrainingHint');if(hint)hint.hidden=true;show('library');return true;}
  function versionLabel(v,r){return (v.resumeName||r?.name||'历史简历')+' · '+(v.kind==='confirmed-resume'||v.id===r?.state.accepted?.id?'投递版 V'+versionNumber(v):'旧版记录')+' · '+h.date(v.date);}
  function versions(scope){
   if(!data||h.blocked())return [];
   const rows=[];for(const r of data.resumes){const vs=r.state.versions.slice();if(r.state.accepted&&!vs.some(v=>v.id===r.state.accepted.id))vs.unshift(r.state.accepted);for(const v of vs)rows.push({...clone(v),...(v.id===r.state.accepted?.id?{kind:'confirmed-resume',number:versionNumber(r.state.accepted)}:{}),resumeId:r.id,resumeName:r.name,goalId:r.goalId,role:r.role});}
   return scope?rows.filter(v=>v.goalId===scope.id||!v.goalId&&v.jd.trim()===scope.jd.trim()):rows;
  }
  const acceptedFor=scope=>{const rows=versions(scope),r=current();return rows.filter(v=>v.kind==='confirmed-resume'||data.resumes.find(r=>r.id===v.resumeId)?.state.accepted?.id===v.id).sort((a,b)=>b.date.localeCompare(a.date))[0]||(!scope&&r?.state.accepted?{...r.state.accepted,resumeId:r.id,resumeName:r.name}:null);};
  function renderIdentity(){
   const r=current();if(!r)return;const s=h.getState(),v=s.accepted,changed=!v||compose(s)!==v.text||s.jd!==v.jd;
   $('resumeEditorTitle').textContent=r.name;$('resumeIdentityRole').textContent=r.role||'通用简历';
   $('resumeIdentityStatus').textContent=v?(changed?'投递版 V'+versionNumber(v)+' 已保留 · 草稿有修改':'投递版 V'+versionNumber(v)+' · 草稿与投递版一致'):'待核对草稿 · 尚未确认投递版';
   $('resumeIdentityNotice').textContent=r.notice||'';$('resumeIdentityNotice').hidden=!r.notice;
   $('resumeIdentityIntention').textContent='简历内求职意向：'+(intentionRange(compose(s))?.text||'未识别，可在正文中核对');
   const picker=$('resumeEditorSelect');picker.innerHTML=data.resumes.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');picker.value=r.id;
   $('resumeHeadConfirmed').disabled=busy()||!v;$('resumeHeadConfirmed').textContent=v?'查看投递版 V'+versionNumber(v):'尚无投递版';$('resumeHeadPreview').disabled=busy()||!s.text.trim();
   $('resumeHeadHistory').textContent='历史版本（'+s.versions.length+'）';$('resumePractice').textContent=v?'用投递版 V'+versionNumber(v)+' 模拟面试 →':'先确认投递版再模拟面试';
   $('resumeDraftHeading').textContent=r.name+' · '+(previewMode==='confirmed'?'投递版 V'+versionNumber(v):'整份草稿预览');
  }
  function render(){
   if(!data)return;const disabled=busy()?'disabled':'';
   $('resumeLibraryCount').textContent=data.resumes.length+' 份岗位简历 · '+data.originals.length+' 份原件';
   $('resumeLibraryCards').innerHTML=data.resumes.map((r,i)=>{const s=r.state,v=s.accepted,changed=!v||compose(s)!==v.text||s.jd!==v.jd;return `<article class="resume-library-card"><div class="resume-card-folio">RESUME ${String(i+1).padStart(2,'0')} <span>${esc(r.role||'通用简历')}</span></div><h3>${esc(r.name)}</h3><p class="resume-card-state">${v?'投递版 V'+versionNumber(v):'待核对草稿'}${v&&changed?' <span>有新修改</span>':''}</p><p class="mock-note">${v?'上次确认：'+esc(h.date(v.date)):'预览整份简历后，统一确认投递版'}</p><p class="mock-note resume-card-source">原件：${esc(s.source?.name||'仅正文，尚未关联原文件')}</p><div class="paste-actions"><button type="button" class="btn btn-primary" data-resume-open="${esc(r.id)}" ${disabled}>${changed?'继续编辑':'查看 / 编辑'} →</button><button type="button" class="btn btn-ghost" data-resume-copy="${esc(r.id)}" ${disabled}>复制</button></div></article>`;}).join('')||'<div class="resume-library-empty"><h3>先导入原简历，再为不同岗位分别完善</h3><p>每份简历独立保存草稿、投递版和历史；上传的原件始终保留。</p><button type="button" class="btn btn-primary" id="resumeEmptyNew">新建岗位简历 →</button></div>';
   $('resumeLibraryCards').querySelectorAll('[data-resume-open]').forEach(b=>b.onclick=()=>open(b.dataset.resumeOpen));$('resumeLibraryCards').querySelectorAll('[data-resume-copy]').forEach(b=>b.onclick=()=>settings('copy',b.dataset.resumeCopy));$('resumeEmptyNew')?.addEventListener('click',()=>settings('new'));
   $('resumeOriginalCards').innerHTML=data.originals.map(o=>`<article class="resume-original-card"><div><b>${esc(o.source.name)}</b><p class="mock-note">原始文件 · 只读保留</p></div><div class="paste-actions"><button class="btn btn-ghost" type="button" data-original-view="${o.source.id}">查看原件</button><a class="btn btn-ghost" href="/api/resume/source/${o.source.id}/original" download>下载</a><button class="btn btn-ghost" type="button" data-original-new="${o.source.id}" ${disabled}>从原件新建</button></div></article>`).join('')||'<p class="mock-note">导入 PDF / Word 后，原文件会保存在这里。</p>';
   $('resumeOriginalCards').querySelectorAll('[data-original-view]').forEach(b=>b.onclick=()=>originalPreview(b.dataset.originalView));$('resumeOriginalCards').querySelectorAll('[data-original-new]').forEach(b=>b.onclick=()=>fromOriginal(b.dataset.originalNew));
  }
  function settings(mode,id=data?.activeId){
   if(busy())return;editing={mode,id};const r=data.resumes.find(r=>r.id===id);$('resumeSettingsHeading').textContent=mode==='edit'?'简历名称与目标':mode==='copy'?'复制为另一份岗位简历':'新建岗位简历';
   $('resumeSettingName').value=mode==='edit'?r.name:mode==='copy'?r.name+' · 副本':'';$('resumeSettingRole').value=mode==='edit'?r.role:'';
   const goals=h.goals();$('resumeSettingGoal').innerHTML='<option value="">通用 / 暂不关联</option>'+goals.map(g=>`<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');$('resumeSettingGoal').value=mode==='edit'?(r.goalId||''):(target?.id||'');
   if(target&&mode!=='edit')$('resumeSettingRole').value=target.name.slice(0,100);
   const range=r&&mode!=='new'?intentionRange(compose(mode==='edit'?h.getState():r.state)):null;$('resumeSettingIntention').value=range?.text||'';$('resumeSettingIntention').disabled=!range;$('resumeSettingIntentionHint').textContent=range?'只修改当前简历已识别的求职意向，不改动工作经历中的历史职位。':'未识别到明确的求职意向字段。请在编辑页的正文中核对；不会替换经历中的职位名称。';
   $('resumeSettingIntentionField').hidden=mode==='new';$('resumeSettingText').hidden=mode!=='new';$('resumeSettingTextInput').value='';$('resumeSettingsMessage').textContent='';$('resumeSettingsDialog').showModal();
  }
  function applyIntention(state,value){
   const text=compose(state),range=intentionRange(text);if(!range||!value.trim()||value.trim()===range.text)return;
   const base=intentionRange(state.text),replacement=value.trim(),end=base?base.start+base.text.length:0;
   if(base&&base.text===range.text&&state.sections.every(x=>{const start=x.start===undefined?state.text.indexOf(x.original):x.start;return start>=end||start+x.original.length<=base.start;})){
    const delta=replacement.length-base.text.length;state.text=state.text.slice(0,base.start)+replacement+state.text.slice(end);
    for(const x of state.sections)if(Number.isInteger(x.start)&&x.start>=end)x.start+=delta;
    if(state.diagnosis)for(const x of state.diagnosis.result.sections)if(Number.isInteger(x.start)&&x.start>=end)x.start+=delta;
   }else{state.draftBackups.unshift(h.snapshot(state));state.text=text.slice(0,range.start)+replacement+text.slice(range.start+range.text.length);state.sections=[];state.diagnosis=null;state.activeSection=0;}
  }
  function saveSettings(){
   if(busy()||!editing)return;const name=$('resumeSettingName').value.trim(),role=$('resumeSettingRole').value.trim(),goalId=$('resumeSettingGoal').value||null;
   if(!name){$('resumeSettingsMessage').textContent='请为这份简历取个名称。';return;}if(!save()){$('resumeSettingsMessage').textContent='当前草稿未能保存，请先备份。';return;}
   const next=clone(data),original=next.resumes.find(r=>r.id===editing.id),goal=h.goals().find(g=>g.id===goalId);let r;
   if(editing.mode==='edit'){r=original;r.name=name;r.role=role;r.goalId=goalId;}
   else{if(next.resumes.length>=100){$('resumeSettingsMessage').textContent='简历已达 100 份，请先备份整理。';return;}const state=editing.mode==='copy'?{...empty(),text:compose(original.state),jd:original.state.jd,source:original.state.source||null}:empty();if(editing.mode==='new')state.text=$('resumeSettingTextInput').value;r={id:uid(),name,role,goalId,createdAt:now(),updatedAt:now(),state};next.resumes.push(r);}
   if(goal)r.state.jd=goal.jd;
   applyIntention(r.state,$('resumeSettingIntention').value);r.updatedAt=now();next.activeId=r.id;
   if(!persist(next)){$('resumeSettingsMessage').textContent='保存失败，原简历和草稿均保留。';return;}
   target=null;$('resumeSettingsDialog').close();load(current());show('editor');h.scroll();if(editing.mode==='new'&&!r.state.text.trim()){$('resumeSetupDetails').open=true;h.message('导入原简历文件，或粘贴正文后开始诊断。');}h.changed();
  }
  function importSource(imported,text){
   if(busy())return false;if(!save())return false;const next=clone(data);if(next.resumes.length>=100)return message('简历已达上限，请先备份整理。'),false;
   if(!next.originals.some(o=>o.source.id===imported.source.id))next.originals.push({source:clone(imported.source),text:imported.text});
   const prev=current(),state={...empty(),text,source:clone(imported.source),jd:prev?.state.jd||''},role=prev?.role||'',r={id:uid(),name:imported.source.name.replace(/\.(pdf|docx)$/i,'').slice(0,80)+' · 岗位版',role,goalId:prev?.goalId||null,createdAt:now(),updatedAt:now(),state};
   // An empty workspace is filled once; importing over a populated one always creates a new resume.
   if(prev&&!prev.state.text.trim()&&!prev.state.source&&!prev.state.versions.length){Object.assign(r,{id:prev.id,name:prev.name});next.resumes=next.resumes.map(x=>x.id===prev.id?r:x);}else next.resumes.push(r);
   next.activeId=r.id;if(!persist(next))return false;load(current());show('editor');h.changed();return true;
  }
  async function fromOriginal(id){
   if(busy())return;const o=data.originals.find(o=>o.source.id===id);if(!o)return;
   h.setBusy(true);let text=o.text;try{if(text===null){const response=await fetch('/api/resume/source/'+id+'/outline',{signal:AbortSignal.timeout(65000)}),body=await response.json();if(!response.ok||typeof body.text!=='string'||!body.text.trim()||body.text.length>30000)throw Error('暂时无法读取原件，请重新导入原文件。');text=body.text;}}catch(e){message(e.message);return;}finally{h.setBusy(false);}
   if(!save())return;const next=clone(data);if(next.resumes.length>=100)return message('简历已达上限。');const r={id:uid(),name:o.source.name.replace(/\.(pdf|docx)$/i,'').slice(0,80)+' · 新岗位版',role:target?.name.slice(0,100)||'',goalId:target?.id||null,createdAt:now(),updatedAt:now(),state:{...empty(),text,jd:target?.jd||'',source:clone(o.source)}};next.resumes.push(r);next.activeId=r.id;if(!persist(next))return;load(current());show('editor');settings('edit');
  }
  function originalPreview(id,page=1){const o=data.originals.find(o=>o.source.id===id);if(!o)return;const d=$('resumeOriginalDialog');d.dataset.sourceId=id;d.dataset.page=page;$('resumeOriginalTitle').textContent=o.source.name+' · 原件';$('resumeOriginalImage').src='/api/resume/source/'+id+'/page/'+page;$('resumeOriginalPage').textContent='第 '+page+' / '+(o.source.pages||1)+' 页';$('resumeOriginalPrev').disabled=page<=1;$('resumeOriginalNext').disabled=page>=(o.source.pages||1);if(!d.open)d.showModal();}
  async function preview(confirmed=false){
   if(busy())return;if(!confirmed){previewMode='draft';renderIdentity();return h.previewDraft();}
   const r=current(),v=h.getState().accepted;if(!v)return;previewMode='confirmed';const serial=++previewSerial,d=$('resumeDraftDialog');previewController=new AbortController();d.showModal();renderIdentity();$('resumePreviewKind').textContent='已确认的完整投递版';$('resumePreviewPagesTitle').textContent='投递版预览';$('resumeConfirmVersion').hidden=true;$('resumeRefreshDraft').hidden=true;$('resumeDraftStatus').textContent='已确认投递版 V'+versionNumber(v)+' · '+h.date(v.date);$('resumeDraftPages').replaceChildren();$('resumeDraftPreview').hidden=true;$('resumeDraftMessage').textContent='正在读取投递版预览…';h.setBusy(true);$('resumeCloseDraft').disabled=false;
   try{if(v.source){let total=1;for(let page=1;page<=total;page++){const response=await fetch('/api/resume/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:v.text,sourceId:v.source.id,page}),signal:AbortSignal.any([previewController.signal,AbortSignal.timeout(65000)])}),body=await response.json();if(!response.ok||typeof body.base64!=='string'||!Number.isInteger(body.pages)||body.pages<1||body.pages>30)throw Error(body.error||'预览失败');if(serial!==previewSerial)return;total=body.pages;const frame=document.createElement('div'),img=document.createElement('img');frame.className='resume-document-frame';img.alt=r.name+' 投递版第 '+page+' 页';img.src='data:image/png;base64,'+body.base64;frame.append(img);$('resumeDraftPages').append(frame);await img.decode();}}else{const pre=document.createElement('pre');pre.className='resume-plain-preview';pre.textContent=v.text;$('resumeDraftPages').append(pre);}$('resumeDraftPreview').hidden=false;$('resumeDraftMessage').textContent='这是已确认的投递版。继续编辑草稿，不会改变这份快照。';}catch(e){if(serial!==previewSerial)return;$('resumeDraftMessage').textContent=e.message+'，已确认内容保留，可关闭后重试。';}finally{h.setBusy(false);$('resumeDraftStatus').textContent='已确认投递版 V'+versionNumber(v)+' · '+h.date(v.date);}
  }
  function forReport(r){const matches=data.resumes.filter(x=>x.id===r.preparation?.resumeId||x.state.versions.some(v=>v.id===r.preparation?.resumeVersionId));if(matches.length===1)return open(matches[0].id);const linked=data.resumes.filter(x=>x.goalId===r.goalId);if(linked.length===1)return open(linked[0].id);enter();$('resumeLibraryContext').hidden=false;$('resumeLibraryContext').textContent='请先选择要补充经历的岗位简历；原面试中的材料和回答保持保留。';return false;}
  function forGoal(g){if(busy()||!enter())return false;target=g;$('resumeLibraryContext').hidden=false;$('resumeLibraryContext').textContent='为「'+g.name+'」准备简历：选择已有关联简历，或复制一份并关联这个目标。';const match=data.resumes.filter(r=>r.goalId===g.id);if(match.length===1)open(match[0].id);else if(!data.resumes.length)settings('new');return true;}
  function init(){
   try{const raw=localStorage.getItem(KEY);lastRaw=raw;if(raw!==null){data=JSON.parse(raw);if(!validate(data,h.validate))throw Error('存储格式异常');}else{if(h.blocked())throw Error('旧简历无法读取');data=migrate(h.getState(),{id:uid(),date:now()});if(!persist(data))throw Error('保存迁移失败');}load(current());}
   catch(e){h.block();data={schemaVersion:1,activeId:null,resumes:[],originals:[]};$('resumeLibraryMsg').textContent='简历资料暂时无法读取或保存，原数据保留。请下载备份后检查，暂不覆盖任何内容。';}
   show('library');$('resumeLibraryNew').onclick=()=>settings('new');$('resumeBackLibrary').onclick=()=>{if(save()){show('library');h.scroll();}};$('resumeEditorSelect').onchange=e=>{if(!open(e.target.value))e.target.value=data.activeId||'';};$('resumeHeadSettings').onclick=()=>settings('edit');$('resumeHeadCopy').onclick=()=>settings('copy');$('resumeHeadPreview').onclick=()=>preview();$('resumeHeadConfirmed').onclick=()=>preview(true);$('resumeHeadHistory').onclick=()=>$('resumeOpenHistory').click();
   $('resumeSettingsCancel').onclick=()=>$('resumeSettingsDialog').close();$('resumeSettingsSave').onclick=saveSettings;$('resumeSettingGoal').onchange=e=>{const g=h.goals().find(g=>g.id===e.target.value);if(g&&!$('resumeSettingRole').value.trim())$('resumeSettingRole').value=g.name.slice(0,100);};
   $('resumeOriginalClose').onclick=()=>$('resumeOriginalDialog').close();$('resumeOriginalPrev').onclick=()=>originalPreview($('resumeOriginalDialog').dataset.sourceId,Number($('resumeOriginalDialog').dataset.page)-1);$('resumeOriginalNext').onclick=()=>originalPreview($('resumeOriginalDialog').dataset.sourceId,Number($('resumeOriginalDialog').dataset.page)+1);
   $('resumeOriginalImage').onerror=()=>{$('resumeOriginalPage').textContent='原件预览暂不可用，可下载查看。';};
   $('resumeHeadBackup').onclick=$('resumeLibraryBackup').onclick=()=>{let raw;try{raw=localStorage.getItem(KEY);}catch{}const body=h.blocked()?{libraryRaw:raw,legacyRaw:localStorage.getItem('zm_resume_store_v1'),currentDraft:h.getState()}:clone(data);if(!h.blocked()&&current())body.resumes.find(r=>r.id===data.activeId).state=clone(h.getState());h.download(body,'zhimian-resume-library-backup.json');};
   $('resumeLibraryRestore').onclick=()=>$('resumeLibraryBackupFile').click();$('resumeLibraryBackupFile').onchange=async e=>{const file=e.target.files[0];try{if(!file||busy())return;if(file.size>20e6)throw Error('备份超过 20 MB');const incoming=JSON.parse(await file.text());if(!validate(incoming,h.validate))throw Error('备份格式不符');if(!save())return;const next=clone(data);for(const r of incoming.resumes)if(!next.resumes.some(x=>x.id===r.id))next.resumes.push(r);for(const o of incoming.originals)if(!next.originals.some(x=>x.source.id===o.source.id))next.originals.push(o);next.activeId||=incoming.activeId;if(persist(next)){load(current());render();message('已合并备份。同一份简历保留当前内容；原文件须在此工作台服务中存在，才能预览。');}}catch(e){message(e.message+'，原资料保留。');}finally{e.target.value='';}};
   $('resumeDraftDialog').addEventListener('close',()=>{previewMode='draft';++previewSerial;previewController?.abort();previewController=null;$('resumePreviewKind').textContent='03 · 整份简历草稿';$('resumePreviewPagesTitle').textContent='整份草稿预览';$('resumeConfirmVersion').hidden=false;$('resumeRefreshDraft').hidden=false;h.invalidatePreview();});
   if(h.blocked()){$('resumeLibraryNew').disabled=true;$('resumeLibraryRestore').disabled=true;}
  }
  return {init,save,enter,open,current,render,renderIdentity,settings,importSource,forGoal,forReport,versions,acceptedFor,versionLabel,preview,isConfirmedPreview:()=>previewMode==='confirmed',confirmedVersion:()=>{const r=current();return r?{resumeId:r.id,resumeName:r.name,goalId:r.goalId,number:Math.max(r.state.accepted?versionNumber(r.state.accepted):0,...r.state.versions.filter(v=>v.kind==='confirmed-resume').map(versionNumber))+1}:{};},backupKey:KEY};
 }
 const api={KEY,empty,compose,intentionRange,validate,migrate,create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ZhiMianResumeLibrary=api;
})(typeof window==='undefined'?globalThis:window);
