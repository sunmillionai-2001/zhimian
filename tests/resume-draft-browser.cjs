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
  let failPreview=false;
  await p.route('**/api/resume/preview',r=>failPreview?r.fulfill({status:422,json:{error:'Controlled layout failure'}}):r.continue());
  await p.goto(`http://127.0.0.1:${port}/app.html#resume`);
  const word=await styledWord();await p.locator('#resumeFile').setInputFiles({name:'draft.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:word});
  await p.locator('#resumeImportApply').waitFor({state:'visible',timeout:60000});await p.locator('#resumeImportApply').click();
  await p.locator('#resumeDiagnose').click();await p.locator('#resumeFact1_0').waitFor();
  for(const [i,text] of ['Validated Alpha reports.','Validated Beta reports.'].entries()){
   await p.locator(`#resumeFact${i}_0`).fill(text);await p.locator(`[data-confirm="${i}"]`).check();await p.locator(`[data-rewrite="${i}"]`).click();await p.locator(`#resumeCandidate${i}`).waitFor();
   assert.equal(await p.locator('.resume-version').count(),0,'Generating each paragraph must not create a version');
  }
  await p.locator('#resumeCandidate0').fill('Validated Alpha reports with source checks.');
  await p.reload();
  assert.equal(await p.locator('#resumeCandidate0').inputValue(),'Validated Alpha reports with source checks.');
  assert.equal(await p.locator('#resumeCandidate1').inputValue(),'Validated Beta reports.');
  assert.equal(await p.locator('.resume-version').count(),0);assert.equal(await p.locator('#resumeExportWord').isDisabled(),true);
  assert.equal(await p.locator('#resumeConfirmVersion').isDisabled(),true);
  await p.locator('#resumePreviewDraft').click();await p.locator('#resumeConfirmVersion').waitFor({state:'visible'});
  await p.waitForFunction(()=>!document.getElementById('resumeConfirmVersion').disabled);
  assert.ok(await p.locator('#resumeDraftPages img').count()>=1);
  const full=await p.locator('#resumeDraftFullText').innerText();assert.match(full,/Validated Alpha reports with source checks/);assert.match(full,/Validated Beta reports/);
  await p.locator('#resumeCandidate1').fill('Validated Beta reports and delivery.');
  assert.equal(await p.locator('#resumeConfirmVersion').isDisabled(),true);assert.equal(await p.locator('#resumeDraftPreview').isVisible(),false);
  await p.locator('#resumePreviewDraft').click();await p.waitForFunction(()=>!document.getElementById('resumeConfirmVersion').disabled);
  await p.locator('#resumeConfirmVersion').click();
  assert.equal(await p.locator('.resume-version').count(),1);assert.equal(await p.locator('#resumeConfirmVersion').isDisabled(),true);
  const confirmed=await p.evaluate(()=>JSON.parse(localStorage.getItem('zm_resume_store_v1')));
  assert.equal(confirmed.versions.length,1);assert.equal(confirmed.accepted.text,confirmed.versions[0].text);
  await p.locator('.export-menu summary').click();let download=p.waitForEvent('download');await p.locator('#resumeExportWord').click();
  assert.equal((await openWord(fs.readFileSync(await(await download).path()))).text,confirmed.accepted.text);
  // Later draft changes must not silently alter the confirmed export.
  await p.locator('#resumeCandidate0').fill('Pending Alpha update.');
  await p.reload();assert.match(await p.locator('#resumeExportState').innerText(),/上次已确认/);
  if(!(await p.locator('#resumeExportWord').isVisible()))await p.locator('.export-menu summary').click();
  download=p.waitForEvent('download');await p.locator('#resumeExportWord').click();
  assert.equal((await openWord(fs.readFileSync(await(await download).path()))).text,confirmed.accepted.text);
  const pending=await p.evaluate(()=>JSON.parse(localStorage.getItem('zm_resume_store_v1')));
  assert.equal(pending.sections[0].adopted,'Pending Alpha update.');assert.equal(pending.accepted.text,confirmed.accepted.text);assert.equal(pending.versions.length,1);
  failPreview=true;await p.locator('#resumePreviewDraft').click();await p.waitForFunction(()=>document.getElementById('resumeDraftMessage').textContent.includes('Controlled layout failure'));
  assert.equal(await p.locator('#resumeConfirmVersion').isDisabled(),true);assert.equal(await p.locator('.resume-version').count(),1);
  failPreview=false;await p.locator('#resumePreviewDraft').click();await p.waitForFunction(()=>!document.getElementById('resumeConfirmVersion').disabled);
  // Failed storage must not commit a new accepted version in memory or on disk.
  await p.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError');};});
  await p.locator('#resumeConfirmVersion').click();assert.match(await p.locator('#resumeMsg').innerText(),/保存失败/);
  assert.equal(await p.locator('.resume-version').count(),1);await p.reload();
  assert.equal((await p.evaluate(()=>JSON.parse(localStorage.getItem('zm_resume_store_v1')))).accepted.text,confirmed.accepted.text);
  // Legacy per-paragraph records remain unchanged and the current accepted content migrates.
  const legacy={...confirmed};delete legacy.workflowVersion;delete legacy.accepted;delete legacy.draftBackups;
  const legacyContext=await browser.newContext();await legacyContext.route('**/fonts.googleapis.com/**',r=>r.abort());
  await legacyContext.addInitScript(state=>{localStorage.setItem('zm_resume_store_v1',JSON.stringify(state));localStorage.setItem('zm_guide_seen_v1','1');},legacy);
  const old=await legacyContext.newPage();await old.goto(`http://127.0.0.1:${port}/app.html#resume`);assert.equal(await old.locator('.resume-version').count(),1);assert.equal(await old.locator('#resumeExportWord').isEnabled(),true);assert.equal(await old.locator('#resumeConfirmVersion').isDisabled(),true);
  await old.locator('#resumePreviewDraft').click();await old.waitForFunction(()=>document.getElementById('resumeDraftMessage').textContent.includes('无需重复采用'));assert.equal(await old.locator('#resumeConfirmVersion').isDisabled(),true);assert.equal(await old.locator('.resume-version').count(),1);
  for(const width of [320,390,820]){await p.setViewportSize({width,height:950});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  assert.deepEqual(errors,[]);
  console.log('PASS: multiple paragraph drafts, refresh, complete preview, invalidation, single final version, immutable accepted export, failed preview/storage, legacy migration and mobile layout');
 }finally{await browser?.close();app?.kill();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
