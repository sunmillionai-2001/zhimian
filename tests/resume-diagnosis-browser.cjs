// End-to-end diagnosis recovery using fictional material and a controlled local model.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),{spawn}=require('node:child_process');
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'zhimian-diagnosis-'));let app,browser,upstream,mode='numbered';
 try{
  upstream=http.createServer((req,res)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{
   const payload=JSON.parse(raw),system=payload.messages[0].content,user=JSON.parse(payload.messages[1].content);let result;
   if(system.includes('诊断简历')){
    assert.ok(user.paragraphs.every(p=>p.id&&p.text));
    const sections=mode==='invalid'?[{paragraphId:'p999',issue:'无法定位',questions:['做了什么？']}]:mode==='legacy'?[
     {original:user.resume,issue:'补充行动',questions:['怎么维护？']},
     {original:'维护报表',issue:'补充结果',questions:['如何验证？']}
    ]:[{paragraphId:'p3',issue:'补充行动',questions:['怎么维护？']},{paragraphId:'p3',issue:'补充结果',questions:['如何验证？']}];
    result={overview:'请补充行动与结果',matched:['有项目经历'],missing:['验证依据'],sections};
   }else result={rewritten:'维护报表，核对口径并完成交付验证。',evidence:[{claim:'核对口径',source:user.facts[0].answer},{claim:'完成交付验证',source:user.facts[1].answer}]};
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}));
  });});
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  for(const f of ['app.html','model-settings.js','skill-learning.js','server.js','auth-store.js','model-store.js','model-network.js','model-service.js','review-store.js','ai-service.js','interview-policy.js','formal-interview.js','resume-navigation.js','document-import.js','document-worker.js'])fs.copyFileSync(path.join(__dirname,'..',f),path.join(temp,f));
  fs.writeFileSync(path.join(temp,'server.config.json'),JSON.stringify({baseUrl:`http://127.0.0.1:${upstream.address().port}/v1`,model:'controlled',apiKey:'test-only-key'}));
  const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
  app=spawn(process.execPath,['server.js'],{cwd:temp,env:{...process.env,ZM_LOCAL_MODE:'1',PORT:String(port)},stdio:['ignore','pipe','pipe']});
  await new Promise((r,j)=>{const t=setTimeout(()=>j(Error('startup timeout')),5000);app.stdout.once('data',()=>{clearTimeout(t);r();});});
  browser=await chromium.launch(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{});
  const c=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});await c.route('**/fonts.googleapis.com/**',r=>r.abort());
  await c.addInitScript(()=>localStorage.setItem('zm_guide_seen_v1','1'));const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(`http://127.0.0.1:${port}/app.html#resume`);
  const original='维护报表。\n项目乙\n维护报表。';await p.locator('#resumeText').fill(original);await p.locator('#resumeJd').fill('运营岗位');
  await p.locator('#resumeDiagnose').click();await p.locator('#resumeFact0_1').waitFor();assert.equal(await p.locator('.resume-section').count(),1);assert.match(await p.locator('#resumeWorkspaceMessage').innerText(),/分析完成/);
  assert.match(await p.locator('.resume-section').innerText(),/补充行动；补充结果/);
  await p.locator('#resumeFact0_0').fill('核对口径');await p.locator('#resumeFact0_1').fill('完成交付验证');await p.locator('[data-confirm="0"]').check();await p.locator('[data-rewrite="0"]').click();await p.locator('#resumeCandidate0').waitFor();assert.equal(await p.locator('.resume-version').count(),0);await p.locator('#resumePreviewDraft').click();await p.locator('#resumeConfirmVersion').click();
  const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('zm_resume_store_v1')));assert.equal(saved.sections[0].start,10);assert.equal(saved.versions[0].text,'维护报表。\n项目乙\n维护报表，核对口径并完成交付验证。');
  await p.reload();assert.equal(await p.locator('.resume-version').count(),1);assert.equal(await p.locator('#resumeFact0_0').inputValue(),'核对口径');
  await p.locator('.export-menu summary').click();const download=p.waitForEvent('download');await p.locator('#resumeExportTxt').click();assert.equal(fs.readFileSync(await (await download).path(),'utf8'),saved.versions[0].text);
  const before=await p.evaluate(()=>localStorage.getItem('zm_resume_store_v1'));mode='invalid';await p.locator('#resumeSetupDetails>summary').click();await p.locator('#resumeDiagnose').click();await p.locator('#resumeMsg[data-status="error"]').waitFor();
  const message=await p.locator('#resumeMsg').innerText();assert.match(message,/分析没有完成/);assert.match(message,/无需修改简历/);assert.doesNotMatch(message,/段落重复|重叠|JSON|paragraphId/);assert.equal(await p.locator('#resumeDiagnose').innerText(),'重新诊断 →');assert.equal(await p.locator('#resumeDiagnose').isEnabled(),true);assert.equal(await p.evaluate(()=>localStorage.getItem('zm_resume_store_v1')),before);assert.equal(await p.locator('#resumeText').inputValue(),original);
  mode='legacy';await p.locator('#resumeText').fill('我维护报表并核对口径。');await p.locator('#resumeDiagnose').click();await p.locator('#resumeWorkspaceMessage[data-status="success"]').waitFor();assert.equal(await p.locator('.resume-section').count(),1);assert.equal(await p.locator('#resumeFact0_1').count(),1);
  for(const width of [320,390,820]){await p.setViewportSize({width,height:900});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  assert.deepEqual(errors,[]);console.log('PASS: duplicate feedback merges; exact repeated-text rewrite survives reload/export; failed diagnosis keeps material, previous results and versions; plain-language recovery; legacy overlap and mobile layout');
 }finally{await browser?.close();app?.kill();if(upstream)await new Promise(r=>upstream.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
