// Uses a controlled local model server; never sends real data to external providers.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {spawn}=require('node:child_process');
(async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'zhimian-ai-'));let app,browser,upstream;
  const calls=[];let mode='good';
  try{
    upstream=http.createServer((req,res)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{
      const body=JSON.parse(raw);calls.push(body);
      if(mode==='failure'){res.writeHead(503);return res.end('unavailable');}
      const system=body.messages[0].content;let content='OK';
      if(!system.includes('仅回复')){
        const user=JSON.parse(body.messages[1].content);let result;
        if(system.includes('诊断简历'))result={overview:'需要补充个人行动与交付证据。',matched:['有报表维护经历'],missing:['缺少验证方式'],sections:[{original:user.resume.split('\n')[0],issue:'说明个人行动与结果',questions:['你具体如何维护报表？','如何验证交付结果？']}]};
        else if(system.includes('仅改写这一段'))result={rewritten:'维护运营报表，每周核对口径，并完成交付验证。',evidence:[{claim:'每周核对口径',source:user.facts[0].answer},{claim:'完成交付验证',source:user.facts[1].answer}]};
        else result={scores:{relevance:4,structure:3,evidence:3,depth:3},strengths:['明确了个人行动'],gaps:['可补充比较方法'],suggestions:['说明验证过程'],evidenceQuotes:[user.followUp?user.followUp.answer:user.answer.slice(0,10)],followUp:user.followUp?'':'你是如何验证优化效果的？'};
        if(mode==='badquote')result.evidenceQuotes=['材料里没有的回答'];
        content=mode==='malformed'?'{broken':JSON.stringify(result);
      }
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content}}]}));
    });});
    await new Promise(r=>upstream.listen(0,'127.0.0.1',r));const modelUrl=`http://127.0.0.1:${upstream.address().port}/v1`;
    const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
    for(const f of ['app.html','skill-learning.js','server.js','review-store.js','ai-service.js','document-import.js','document-worker.js'])fs.copyFileSync(path.join(__dirname,'..',f),path.join(temp,f));
    app=spawn(process.execPath,['server.js'],{cwd:temp,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('startup timeout')),5000);app.stdout.once('data',()=>{clearTimeout(timer);resolve();});});
    browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route('**/fonts.googleapis.com/**',r=>r.abort());
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const base=`http://127.0.0.1:${port}`;
    await page.goto(base+'/app.html#resume');await page.waitForFunction(()=>window.scrollY===0);await page.locator('#resumeText').fill('负责运营报表维护\n教育经历：统计学。');await page.locator('#resumeJd').fill('数据运营：报表维护、交付验证');
    await page.locator('#resumeDiagnose').click();await page.waitForFunction(()=>document.getElementById('resumeMsg').textContent.includes('未配置'));
    assert.equal(await page.locator('#resumeText').inputValue(),'负责运营报表维护\n教育经历：统计学。');assert.ok(await page.locator('#aiSettings').evaluate(el=>el.open));
    await page.locator('#aiBaseUrl').fill(modelUrl);await page.locator('#aiModel').fill('controlled-model');await page.locator('#aiKey').fill('fake-test-key');await page.locator('#aiConfigSave').click();
    await page.waitForFunction(()=>document.getElementById('aiConfigMsg').textContent.includes('配置已保存'));assert.equal(await page.locator('#aiKey').inputValue(),'');
    const config=await(await page.request.get(base+'/api/config')).json();assert.equal(config.hasKey,true);assert.ok(!JSON.stringify(config).includes('fake-test-key'));
    await page.locator('#aiConfigTest').click();await page.waitForFunction(()=>document.getElementById('aiConfigMsg').textContent.includes('测试成功'));await page.locator('#aiSettings summary').click();
    await page.locator('#resumeDiagnose').click();await page.locator('#resumeFact0_0').waitFor();await page.locator('#resumeFact0_0').fill('每周核对口径');await page.locator('#resumeFact0_1').fill('完成交付验证');
    const countBefore=calls.length;await page.locator('[data-rewrite="0"]').click();assert.equal(calls.length,countBefore);assert.match(await page.locator('#resumeMsg').innerText(),/勾选确认/);
    await page.locator('[data-confirm="0"]').check();await page.locator('[data-rewrite="0"]').click();await page.locator('#resumeCandidate0').waitFor();
    assert.match(await page.locator('#resumeResults .comparison').innerText(),/改写前/);assert.match(await page.locator('#resumeResults .comparison').innerText(),/改写后/);
    assert.equal(await page.locator('#resumeCandidate0').inputValue(),'维护运营报表，每周核对口径，并完成交付验证。');
    await page.locator('[data-adopt="0"]').click();assert.equal(await page.locator('.resume-version').count(),1);
    await page.reload();assert.ok(await page.locator('#resume').evaluate(el=>el.classList.contains('active')));assert.equal(await page.locator('#resumeFact0_0').inputValue(),'每周核对口径');
    await page.locator('#resumeCandidate0').fill('维护运营报表，每周核对口径，完成交付验证。');await page.locator('[data-adopt="0"]').click();assert.equal(await page.locator('.resume-version').count(),2);
    const downloadPromise=page.waitForEvent('download');await page.locator('#resumeExport').click();const download=await downloadPromise;
    const exported=fs.readFileSync(await download.path(),'utf8');assert.ok(exported.includes('教育经历：统计学。'));assert.ok(exported.includes('每周核对口径'));
    if(process.env.RESUME_SCREENSHOT){await page.evaluate(()=>{document.querySelectorAll('*').forEach(el=>el.style.animation='none');window.scrollTo({top:0,behavior:'instant'});});await page.screenshot({path:process.env.RESUME_SCREENSHOT,fullPage:true});}
    await page.locator('#resumePractice').click();assert.ok((await page.locator('#mockProfile').inputValue()).includes('每周核对口径'));assert.equal(await page.locator('#mockJd').inputValue(),'数据运营：报表维护、交付验证');
    await page.locator('#mockCount [data-n="5"]').click();await page.locator('#mockStart').click();await page.locator('#mockA').fill('我负责优化缓存，用压测验证响应时间。');
    mode='failure';await page.locator('#mockAiEvaluate').click();await page.waitForFunction(()=>document.getElementById('mockAiMsg').textContent.includes('HTTP 503'));assert.equal(await page.locator('#mockA').inputValue(),'我负责优化缓存，用压测验证响应时间。');
    mode='badquote';await page.locator('#mockAiEvaluate').click();await page.waitForFunction(()=>document.getElementById('mockAiMsg').textContent.includes('原回答不符'));
    mode='good';await page.locator('#mockAiEvaluate').click();await page.locator('#mockFollowUpAnswer').waitFor();
    assert.ok(calls.some(c=>c.messages[1].content.includes('每周核对口径')));
    await page.locator('#mockFollowUpAnswer').fill('我通过压测比较了优化前后的响应时间。');await page.locator('#mockAiFollowUp').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('zm_mock_store_v2')).draft.ai[0].final!==null);
    assert.equal(await page.locator('#mockAiFollowUp').count(),0);await page.reload();assert.equal(await page.locator('#mockFollowUpAnswer').inputValue(),'我通过压测比较了优化前后的响应时间。');
    if(process.env.INTERVIEW_SCREENSHOT){await page.evaluate(()=>{document.querySelectorAll('*').forEach(el=>el.style.animation='none');window.scrollTo({top:0,behavior:'instant'});});await page.screenshot({path:process.env.INTERVIEW_SCREENSHOT,fullPage:true});}
    await page.locator('#mockNext').click();for(let i=0;i<4;i++)await page.locator('#mockSkip').click();assert.match(await page.locator('#mockStage').innerText(),/追问后的点评/);await page.locator('#mockSave').click();
    await page.reload();await page.locator('#mockHistory [data-history="0"]').click();assert.match(await page.locator('#mockStage').innerText(),/我通过压测比较/);
    // Resume failures preserve old diagnosis and adopted versions.
    await page.locator('.nav-item[data-view="resume"]').click();mode='malformed';await page.locator('#resumeDiagnose').click();await page.waitForFunction(()=>document.getElementById('resumeMsg').textContent.includes('格式异常'));
    assert.equal(await page.locator('.resume-version').count(),2);assert.equal(await page.locator('#resumeFact0_0').inputValue(),'每周核对口径');
    for(const width of [320,390,820]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`resume overflow ${width}`);}
    // Facts changed after a candidate must invalidate it and require a new confirmation.
    await page.locator('#resumeFact0_0').fill('重新核对口径');assert.equal(await page.locator('#resumeCandidate0').count(),0);assert.ok(!(await page.locator('[data-confirm="0"]').isChecked()));assert.equal(await page.locator('.resume-version').count(),2);
    // Quota failure does not pretend that adopting a new version succeeded.
    mode='good';await page.locator('#resumeFact0_0').fill('每周核对口径');await page.locator('[data-confirm="0"]').check();await page.locator('[data-rewrite="0"]').click();await page.locator('#resumeCandidate0').waitFor();
    await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError');};});await page.locator('[data-adopt="0"]').click();assert.match(await page.locator('#resumeMsg').innerText(),/保存失败/);assert.equal(await page.locator('.resume-version').count(),2);
    await page.reload();await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('zm_resume_store_v1'));s.versions[0].sections=[{answers:42}];localStorage.setItem('zm_resume_store_v1',JSON.stringify(s));});await page.reload();assert.match(await page.locator('#resumeMsg').innerText(),/无法读取/);assert.ok(await page.locator('#resumeDiagnose').isDisabled());assert.ok(await page.locator('#resumeExport').isEnabled());
    assert.deepEqual(errors,[]);console.log('PASS: shared settings/connection, missing key, resume diagnose/facts/confirmation/rewrite/versions/export/transfer, interview errors/retry/grounded followup/save/reload, malformed output, 320/390/820px, quota protection');
  }finally{await browser?.close();app?.kill();if(upstream)await new Promise(r=>upstream.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
