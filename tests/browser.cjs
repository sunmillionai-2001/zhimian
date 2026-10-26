// Optional real-browser regression: requires Playwright and its Chromium runtime.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
(async () => {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'zhimian-browser-'));
  let server,browser;
  try {
    for(const f of ['app.html','model-settings.js','skill-learning.js','server.js','auth-store.js','model-store.js','model-network.js','model-service.js','review-store.js','real-review-model.js','real-review-ui.js','mock-voice.js','voice-recorder-worklet.js','ai-service.js','interview-policy.js','formal-interview.js','resume-navigation.js','resume-library.js','document-import.js','document-worker.js'])fs.copyFileSync(path.join(__dirname,'..',f),path.join(temp,f));
    const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
    server=spawn(process.execPath,['server.js'],{cwd:temp,env:{...process.env,ZM_LOCAL_MODE:'1',PORT:String(port)},stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('startup timeout')),5000);server.stdout.once('data',()=>{clearTimeout(timer);resolve();});});
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    await context.route('**/fonts.googleapis.com/**',r=>r.abort());await context.addInitScript(()=>localStorage.setItem('zm_guide_seen_v1','1'));
    await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const mode=document.getElementById('mockMode');if(mode){mode.value='coaching';mode.dispatchEvent(new Event('change'));}const advanced=document.getElementById('mockAdvanced');if(advanced)advanced.open=true;}));const page=await context.newPage(),errors=[];const tools=async p=>{if(!await p.locator('#mockToolsDialog').evaluate(e=>e.open))await p.locator('#mockRoomTools').click();};page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/app.html#mock`);
    await page.locator('.nav-item[data-view="target"]').click();await page.locator('#targetJd').fill('产品经理\n用户需求分析、PRD、团队协作');await page.locator('#targetMock').click();
    await page.locator('#mockExtraSummary').click();await page.locator('#mockCount [data-n="5"]').click();await page.locator('#mockStart').click();
    assert.match(await page.locator('#mockKeywords').innerText(),/产品/);
    await page.locator('#mockA').fill('第一题回答\n<script>alert(1)</script>');
    await page.waitForTimeout(1100);await page.reload();
    assert.equal(await page.locator('#mockA').inputValue(),'第一题回答\n<script>alert(1)</script>');
    assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('zm_mock_store_v2')).draft.durations[0]>=1));
    assert.equal(await page.locator('#mockRole').inputValue(),'auto');
    await page.locator('#mockNext').click();await page.locator('#mockA').fill('第二题项目经历');await page.reload();
    assert.equal(await page.locator('#mockA').inputValue(),'第二题项目经历');
    assert.match(await page.locator('.stage-timer .step').innerText(),/第 2\/5 题/);
    await page.locator('#mockNext').click();await page.locator('#mockSkip').click();await page.locator('#mockNext').click();await page.locator('#mockNext').click();
    await page.locator('#mockRate [data-rate="良好"]').click();await page.reload();
    assert.equal(await page.locator('#mockRate .on').innerText(),'良好');
    await page.locator('#mockSave').click();await page.reload();await tools(page);await page.locator('#mockHistory [data-history="0"]').click();
    await page.locator('[data-report-tab="original"]').click();assert.match(await page.locator('#mockStage').innerText(),/第一题回答/);
    await page.locator('[data-report-question="1"]').click();await page.locator('[data-report-tab="original"]').click();assert.match(await page.locator('#mockStage').innerText(),/第二题项目经历/);
    assert.match(await page.locator('#mockStage').innerText(),/自评：良好/);
    assert.equal(await page.locator('#mockStage script').count(),0);
    const store=await page.evaluate(()=>JSON.parse(localStorage.getItem('zm_mock_store_v2')));
    assert.equal(store.records.length,1);assert.equal(store.draft,null);assert.equal(store.records[0].questions.length,5);assert.ok(store.records[0].durations[0]>=1);
    await tools(page);const downloadPromise=page.waitForEvent('download');await page.locator('#mockExport').click();const download=await downloadPromise;
    const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.deepEqual(exported.records,store.records);
    const second=await browser.newContext({reducedMotion:'reduce'});await second.addInitScript(()=>localStorage.setItem('zm_guide_seen_v1','1'));await second.route('**/fonts.googleapis.com/**',r=>r.abort());const p2=await second.newPage();await p2.goto(`http://127.0.0.1:${port}/app.html#mock`);
    await p2.locator('#mockImportFile').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});
    await p2.waitForFunction(()=>JSON.parse(localStorage.getItem('zm_mock_store_v2')).records.length===1);
    await p2.locator('#mockImportFile').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});
    await p2.waitForFunction(()=>document.getElementById('mockStorageMsg').textContent.includes('已导入 0'));
    await p2.locator('#mockImportFile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad')});
    await p2.waitForFunction(()=>document.getElementById('mockStorageMsg').textContent.includes('导入失败'));
    assert.equal(await p2.evaluate(()=>JSON.parse(localStorage.getItem('zm_mock_store_v2')).records.length),1);
    // Switching JD after an earlier parse must change actual questions.
    await p2.locator('.nav-item[data-view="target"]').click();await p2.locator('#targetJd').fill('后端开发\nRedis Java MySQL');await p2.locator('#targetJd').fill('产品经理\nPRD 用户需求分析');await p2.locator('#targetMock').click();await p2.locator('#mockMode').selectOption('coaching');await p2.locator('#mockStart').click();
    const topics=await p2.evaluate(()=>JSON.parse(localStorage.getItem('zm_mock_store_v2')).draft.questions.map(q=>q.topic));
    assert.ok(!topics.some(t=>['Redis','MySQL','Java / JVM'].includes(t)));
    // A new start must not silently erase a pending draft.
    await p2.locator('#mockRoomBack').click();p2.once('dialog',d=>d.dismiss());await p2.locator('#mockStart').click();assert.equal(await p2.locator('#mockA').count(),1);
    await p2.setViewportSize({width:390,height:844});
    assert.ok(await p2.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile overflow');
    if(process.env.QA_SCREENSHOT){await p2.screenshot({path:process.env.QA_SCREENSHOT,fullPage:true});}
    await p2.locator('#mockRoomContinue').click();
    // Quota failure is visible, and the unsaved session can still be exported.
    await p2.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError');};});
    await p2.locator('#mockA').fill('存储失败时仍可导出的回答');assert.match(await p2.locator('#mockStorageMsg').innerText(),/保存失败/);
    await tools(p2);const salvagePromise=p2.waitForEvent('download');await p2.locator('#mockExport').click();const salvage=await salvagePromise;
    assert.equal(JSON.parse(fs.readFileSync(await salvage.path(),'utf8')).draft.answers[0],'存储失败时仍可导出的回答');

    // Review API -> overview -> new browser -> delete -> overview: isolated business fixtures.
    const reviewPage=await context.newPage();reviewPage.on('pageerror',e=>errors.push(e.message));
    await reviewPage.goto(`http://127.0.0.1:${port}/app.html#overview`);
    await reviewPage.waitForFunction(()=>document.getElementById('overviewTotal').textContent==='0');
    assert.ok(await reviewPage.locator('#reviewRetry').isHidden());
    assert.equal(await reviewPage.locator('#overviewPassRate').innerText(),'0');
    assert.equal(await reviewPage.locator('#overviewWeakCount').innerText(),'0');
    assert.ok(!(await reviewPage.locator('#overview').innerText()).includes('字节后端'));
    await reviewPage.locator('.nav-item[data-view="review"]').click();
    await reviewPage.locator('#realReviewNew').click();await reviewPage.locator('#realCompany').fill('浏览器 API 测试');await reviewPage.locator('#realRole').fill('产品经理');
    await reviewPage.locator('#realResult').selectOption('通过');await reviewPage.locator('#realNote').evaluate(e=>e.closest('details').open=true);
    await reviewPage.locator('#realNote').fill('真实回答 <script>不可执行</script>');await reviewPage.locator('#realReviewSave').click();
    await reviewPage.waitForFunction(()=>document.getElementById('overviewTotal').textContent==='1');
    assert.equal(await reviewPage.locator('#overviewPassRate').innerText(),'100');assert.equal(await reviewPage.locator('#overviewWeakCount').innerText(),'0');
    await reviewPage.locator('.nav-item[data-view="overview"]').click();await reviewPage.locator('#overviewReviews [data-open-review]').click();
    assert.ok(await reviewPage.locator('#review').evaluate(el=>el.classList.contains('active')));
    assert.equal(await reviewPage.locator('#realQuestionBody script').count(),0);
    const shared=await browser.newContext();await shared.addInitScript(()=>localStorage.setItem('zm_guide_seen_v1','1'));const sharedPage=await shared.newPage();
    await sharedPage.goto(`http://127.0.0.1:${port}/app.html#overview`);
    await sharedPage.waitForFunction(()=>document.getElementById('overviewTotal').textContent==='1');
    await sharedPage.locator('.nav-item[data-view="review"]').click();sharedPage.once('dialog',d=>d.accept());await sharedPage.locator('[data-real-delete]').click();
    await sharedPage.waitForFunction(()=>document.getElementById('overviewTotal').textContent==='0');
    await reviewPage.reload();await reviewPage.waitForFunction(()=>document.getElementById('overviewTotal').textContent==='0');
    // Migration preserves the legacy key and cannot resurrect deleted rows even in another browser.
    const legacy={id:1234567,company:'旧浏览器记录',role:'前端开发',stage:'二面',result:'待定',date:'10/12',tags:['基础知识'],note:'旧记录'};
    await reviewPage.evaluate(r=>localStorage.setItem('zm_reviews',JSON.stringify([r])),legacy);await reviewPage.reload();
    await reviewPage.waitForFunction(()=>document.getElementById('overviewTotal').textContent==='1');
    assert.equal(await reviewPage.evaluate(()=>JSON.parse(localStorage.getItem('zm_reviews'))[0].note),'旧记录');
    await reviewPage.locator('.nav-item[data-view="review"]').click();reviewPage.once('dialog',d=>d.accept());await reviewPage.locator('[data-real-delete="1234567"]').click();await reviewPage.waitForFunction(()=>document.getElementById('overviewTotal').textContent==='0');
    await reviewPage.evaluate(()=>localStorage.removeItem('zm_reviews_api_migrated_v1'));await reviewPage.reload();
    await reviewPage.waitForFunction(()=>document.getElementById('overviewTotal').textContent==='0');
    // API errors preserve the filled form and cached stats; retry re-establishes the data path.
    await reviewPage.route('**/api/reviews',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'测试连接失败'})}));
    await reviewPage.locator('#realReviewNew').click();await reviewPage.locator('#realCompany').fill('失败时保留');await reviewPage.locator('#realNote').evaluate(e=>e.closest('details').open=true);await reviewPage.locator('#realNote').fill('不可丢失的复盘');await reviewPage.locator('#realReviewSave').click();
    await reviewPage.waitForFunction(()=>document.getElementById('realReviewStatus').textContent.includes('当前填写内容保留'));
    assert.equal(await reviewPage.locator('#realNote').inputValue(),'不可丢失的复盘');
    await reviewPage.reload();await reviewPage.waitForFunction(()=>document.getElementById('overviewDataStatus').textContent.includes('复盘连接失败'));
    await reviewPage.locator('[data-real-open]').click();assert.ok(await reviewPage.locator('#realReviewSave').isDisabled());
    await reviewPage.unroute('**/api/reviews');await reviewPage.locator('.nav-item[data-view="overview"]').click();await reviewPage.locator('#reviewRetry').click();
    await reviewPage.waitForFunction(()=>document.getElementById('overviewDataStatus').textContent.includes('已连接'));
    if(process.env.OVERVIEW_SCREENSHOT)await reviewPage.screenshot({path:process.env.OVERVIEW_SCREENSHOT,fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS: review zero state, save/summary/detail, cross-browser persistence/delete, legacy migration, failed API form/cache/retry');

    console.log('PASS: draft reload, timer, report reload, save/history, escaped answers, export/import/dedup, invalid import, JD reparse, draft guard, 390px viewport, quota fallback');
  } finally {
    await browser?.close();server?.kill();fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
