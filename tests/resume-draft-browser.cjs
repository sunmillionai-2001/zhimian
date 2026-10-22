// Whole-document confirmation with independent editable paragraphs and real layout exports.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
const {styledWord}=require('./layout-fixtures.cjs'),{openWord}=require('../resume-layout-engine');
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'zm-whole-draft-'));let app,browser;
 try{
  const root=path.join(__dirname,'..');
  for(const f of fs.readdirSync(root).filter(f=>/\.(js|html)$/.test(f)))fs.copyFileSync(path.join(root,f),path.join(temp,f));
  for(const dir of ['node_modules','assets'])fs.symlinkSync(path.join(root,dir),path.join(temp,dir),'dir');
  fs.writeFileSync(path.join(temp,'server.config.json'),'{}');
  const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
  app=spawn(process.execPath,['server.js'],{cwd:temp,env:{...process.env,ZM_LOCAL_MODE:'1',PORT:String(port)},stdio:['ignore','pipe','pipe']});
  await new Promise((r,j)=>{const t=setTimeout(()=>j(Error('startup timeout')),5000);app.stdout.once('data',()=>{clearTimeout(t);r();});});
  browser=await chromium.launch(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{});
  const context=await browser.newContext({viewport:{width:1280,height:950},reducedMotion:'reduce'});
  await context.route('**/fonts.googleapis.com/**',r=>r.abort());await context.addInitScript(()=>localStorage.setItem('zm_guide_seen_v1','1'));
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  const meta={model:'controlled',promptVersion:'test',createdAt:new Date().toISOString()};
  await p.route('**/api/ai/resume-diagnose',r=>{const {resume}=r.request().postDataJSON(),original='Maintained weekly reports.';r.fulfill({json:{meta,result:{overview:'Two independent paragraphs',matched:[],missing:[],sections:[resume.indexOf(original),resume.lastIndexOf(original)].map(start=>({start,original,issue:'Clarify action',questions:['What did you do?']}))}}});});
  await p.route('**/api/ai/resume-rewrite',r=>{const text=r.request().postDataJSON().facts[0].answer;r.fulfill({json:{meta,result:{rewritten:text,evidence:[{claim:text,source:text}]}}});});
  let failPreview=false;const previewTexts=[];
  await p.route('**/api/resume/preview',r=>{previewTexts.push(r.request().postDataJSON().text);return failPreview?r.fulfill({status:422,json:{error:'Controlled layout failure'}}):r.continue();});
  await p.goto(`http://127.0.0.1:${port}/app.html#resume`);
  const word=await styledWord();await p.locator('#resumeFile').setInputFiles({name:'draft.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:word});
  await p.locator('#resumeImportApply').waitFor({state:'visible',timeout:60000});await p.locator('#resumeImportApply').click();
  await p.locator('#resumeDiagnose').click();await p.locator('#resumeFact0_0').waitFor();
  const edit=async(i,tab='draft')=>{await p.locator(`[data-resume-section="${i}"]`).click();await p.locator(`#resume${tab==='facts'?'Facts':'Draft'}Tab${i}`).click();};
  assert.equal(await p.locator('.resume-section:visible').count(),1);
  assert.equal(await p.locator('#resumeSetupDetails').evaluate(el=>el.open),false);
  const labels=await p.locator('[data-resume-section] strong').allTextContents();assert.match(labels[0],/Project Alpha/);assert.match(labels[1],/Project Beta/);
  for(const [i,text] of ['Validated Alpha reports.','Validated Beta reports.'].entries()){
   await edit(i,'facts');await p.locator(`#resumeFact${i}_0`).fill(text);await p.locator(`[data-confirm="${i}"]`).check();await p.locator(`[data-rewrite="${i}"]`).click();await p.locator(`#resumeCandidate${i}`).waitFor();
   assert.equal(await p.locator('.resume-version').count(),0,'Generating each paragraph must not create a version');
  }
  await edit(0);await p.locator('#resumeCandidate0').fill('Validated Alpha reports with source checks.');
  await p.reload();
  assert.equal(await p.locator('#resumeCandidate0').inputValue(),'Validated Alpha reports with source checks.');
  assert.equal(await p.locator('#resumeCandidate1').inputValue(),'Validated Beta reports.');
  assert.equal(await p.locator('.resume-version').count(),0);assert.equal(await p.locator('#resumeExportWord').isDisabled(),true);
  assert.equal(await p.locator('#resumeConfirmVersion').isDisabled(),true);
  await p.locator('#resumePreviewDraft').click();await p.locator('#resumeConfirmVersion').waitFor({state:'visible'});
  await p.waitForFunction(()=>!document.getElementById('resumeConfirmVersion').disabled);
  assert.ok(await p.locator('#resumeDraftPages img').count()>=1);
  assert.match(previewTexts.at(-1),/Validated Alpha reports with source checks/);assert.match(previewTexts.at(-1),/Validated Beta reports/);
  await p.locator('#resumeCloseDraft').click();await edit(1);await p.locator('#resumeCandidate1').fill('Validated Beta reports and delivery.');
  assert.equal(await p.locator('#resumeConfirmVersion').isDisabled(),true);assert.equal(await p.locator('#resumeDraftPreview').isVisible(),false);
  await p.locator('#resumePreviewDraft').click();await p.waitForFunction(()=>!document.getElementById('resumeConfirmVersion').disabled);
  await p.locator('#resumeConfirmVersion').click();
  assert.equal(await p.locator('.resume-version').count(),1);assert.equal(await p.locator('#resumeConfirmVersion').isDisabled(),true);
  const confirmed=await p.evaluate(()=>JSON.parse(localStorage.getItem('zm_resume_store_v1')));
  assert.equal(confirmed.versions.length,1);assert.equal(confirmed.accepted.text,confirmed.versions[0].text);
  await p.locator('.export-menu summary').click();let download=p.waitForEvent('download');await p.locator('#resumeExportWord').click();
  assert.equal((await openWord(fs.readFileSync(await(await download).path()))).text,confirmed.accepted.text);
  // Later draft changes must not silently alter the confirmed export.
  await edit(0);await p.locator('#resumeCandidate0').fill('Pending Alpha update.');
  await p.reload();assert.match(await p.locator('#resumeExportState').innerText(),/上次已确认/);
  if(!(await p.locator('#resumeExportWord').isVisible()))await p.locator('.export-menu summary').click();
  download=p.waitForEvent('download');await p.locator('#resumeExportWord').click();
  assert.equal((await openWord(fs.readFileSync(await(await download).path()))).text,confirmed.accepted.text);
  const pending=await p.evaluate(()=>JSON.parse(localStorage.getItem('zm_resume_store_v1')));
  assert.equal(pending.sections[0].adopted,'Pending Alpha update.');assert.equal(pending.accepted.text,confirmed.accepted.text);assert.equal(pending.versions.length,1);
  failPreview=true;await p.locator('#resumePreviewDraft').click();await p.waitForFunction(()=>document.getElementById('resumeDraftMessage').textContent.includes('Controlled layout failure'));
  assert.equal(await p.locator('#resumeConfirmVersion').isDisabled(),true);assert.equal(await p.locator('.resume-version').count(),1);
  failPreview=false;await p.locator('#resumeRefreshDraft').click();await p.waitForFunction(()=>!document.getElementById('resumeConfirmVersion').disabled);
  // Failed storage must not commit a new accepted version in memory or on disk.
  await p.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError');};});
  await p.locator('#resumeConfirmVersion').click();assert.match(await p.locator('#resumeDraftMessage').innerText(),/保存失败/);
  assert.equal(await p.locator('.resume-version').count(),1);await p.reload();
  assert.equal((await p.evaluate(()=>JSON.parse(localStorage.getItem('zm_resume_store_v1')))).accepted.text,confirmed.accepted.text);
  // Legacy per-paragraph records remain unchanged and the current accepted content migrates.
  const legacy={...confirmed};delete legacy.workflowVersion;delete legacy.accepted;delete legacy.draftBackups;
  const legacyContext=await browser.newContext();await legacyContext.route('**/fonts.googleapis.com/**',r=>r.abort());
  await legacyContext.addInitScript(state=>{localStorage.setItem('zm_resume_store_v1',JSON.stringify(state));localStorage.setItem('zm_guide_seen_v1','1');},legacy);
  const old=await legacyContext.newPage();await old.goto(`http://127.0.0.1:${port}/app.html#resume`);assert.equal(await old.locator('.resume-version').count(),1);assert.equal(await old.locator('#resumeExportWord').isEnabled(),true);assert.equal(await old.locator('#resumeConfirmVersion').isDisabled(),true);
  await old.locator('#resumePreviewDraft').click();await old.waitForFunction(()=>document.getElementById('resumeDraftMessage').textContent.includes('无需重复采用'));assert.equal(await old.locator('#resumeConfirmVersion').isDisabled(),true);assert.equal(await old.locator('.resume-version').count(),1);
  for(const width of [320,390,820]){await p.setViewportSize({width,height:950});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.locator('#resumeParagraphSelect').selectOption('1');assert.equal(await p.locator('#resumeSection1').isVisible(),true);assert.equal(await p.locator('#resumeSection0').isVisible(),false);}
  await p.setViewportSize({width:1280,height:950});
  if(process.env.RESUME_NAV_SCREENSHOT){await p.locator('#resumeResults').scrollIntoViewIfNeeded();await p.screenshot({path:process.env.RESUME_NAV_SCREENSHOT});}
  // Hierarchical UI: one module can contain multiple experiences and multiple suggestions.
  const outlineText='教育经历\n北辰大学\n2016-2020\n工作经历\n云杉科技有限公司\n2020-2022\n负责客户交付。\n推动验收闭环。\n云杉科技有限公司\n2023-至今\n带领支持团队。\n项目经历\n星河培训管理平台\n2024-至今\n协调实施上线。\n晨光数据分析系统\n2025-至今\n完善数据流程。\n个人总结\n善于沟通协作。';
  const originals=['完善数据流程。','负责客户交付。','推动验收闭环。','协调实施上线。'];
  const outlineSections=originals.map(original=>({original,start:outlineText.indexOf(original),issue:'请补充交付结果',questions:['实际完成了什么？'],answers:[''],confirmedFacts:false,candidate:null,candidateText:'',adopted:null}));
  const treeState={schemaVersion:1,workflowVersion:2,text:outlineText,jd:'技术支持',sections:outlineSections,diagnosis:{meta,result:{overview:'按经历核对事实',matched:[],missing:[],sections:outlineSections.map(({original,start,issue,questions})=>({original,start,issue,questions}))}},versions:[],accepted:null,draftBackups:[],activeSection:1};
  const treeContext=await browser.newContext({viewport:{width:1280,height:950},reducedMotion:'reduce'});
  await treeContext.route('**/fonts.googleapis.com/**',r=>r.abort());await treeContext.addInitScript(state=>{localStorage.setItem('zm_resume_store_v1',JSON.stringify(state));localStorage.setItem('zm_guide_seen_v1','1');},treeState);
  const tree=await treeContext.newPage();tree.on('pageerror',e=>errors.push(e.message));await tree.goto(`http://127.0.0.1:${port}/app.html#resume`);
  assert.deepEqual(await tree.locator('.resume-nav-module>summary').allTextContents(),['教育经历 暂无修改建议','工作经历 0/2 已有草稿','项目经历 0/2 已有草稿','个人总结 暂无修改建议']);
  assert.equal(await tree.locator('.resume-nav-entry [data-resume-section]').count(),2);
  assert.match(await tree.locator('.resume-nav-entry>summary').innerText(),/云杉科技有限公司/);
  assert.match(await tree.locator('.resume-nav-empty').allTextContents().then(x=>x.join(' ')),/2023-至今/);
  await tree.locator('#resumeFact1_0').fill('交付结果已暂存');await tree.locator('#resumeNextSection').click();assert.equal(await tree.locator('#resumeSection2').isVisible(),true);
  await tree.locator('#resumePreviousSection').click();assert.equal(await tree.locator('#resumeFact1_0').inputValue(),'交付结果已暂存');
  await tree.locator('#resumeNextSection').click();await tree.locator('#resumeNextSection').click();assert.equal(await tree.locator('#resumeSection3').isVisible(),true,'Next follows source outline rather than AI response order');
  assert.match(await tree.locator('#resumeSection3 h4').innerText(),/星河培训管理平台/);
  for(const width of [320,390,820]){await tree.setViewportSize({width,height:950});await tree.locator('#resumeParagraphSelect').selectOption('0');assert.equal(await tree.locator('#resumeSection0').isVisible(),true);assert.equal(await tree.locator('#resumeParagraphSelect optgroup').count(),4);assert.ok(await tree.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await tree.setViewportSize({width:1280,height:950});if(!await tree.locator('.resume-nav-module').filter({hasText:'工作经历'}).evaluate(el=>el.open))await tree.locator('.resume-nav-module').filter({hasText:'工作经历'}).locator('summary').first().click();
  await tree.locator('#resumeResults').scrollIntoViewIfNeeded();if(process.env.RESUME_NAV_SCREENSHOT)await tree.screenshot({path:process.env.RESUME_NAV_SCREENSHOT});
  assert.deepEqual(errors,[]);
  console.log('PASS: multiple paragraph drafts, refresh, complete preview, invalidation, single final version, immutable accepted export, failed preview/storage, legacy migration, hierarchical modules/experiences, source-order navigation and mobile layout');
 }finally{await browser?.close();app?.kill();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
