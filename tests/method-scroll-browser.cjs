// 换题回弹的独立验收：多种窗口高度 × 方法卡保持展示。
// 单独成文件的原因：这个 bug 出现过两次，都是因为只测了一种视口高度。
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {spawn}=require('node:child_process');

const VIEWPORTS=[960,800,700,620];

(async()=>{
 const root=path.join(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'zhimian-scroll-'));
 let app,browser;
 try{
  const files=['app.html','methodology.js','model-settings.js','skill-learning.js','server.js','auth-store.js','model-store.js','model-network.js','model-service.js','review-store.js','real-review-model.js','real-review-ui.js','mock-voice.js','voice-recorder-worklet.js','ai-service.js','interview-policy.js','formal-interview.js','resume-navigation.js','resume-library.js','document-import.js','document-worker.js'];
  for(const f of files)if(fs.existsSync(path.join(root,f)))fs.copyFileSync(path.join(root,f),path.join(temp,f));
  fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
  const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
  app=spawn(process.execPath,['server.js'],{cwd:temp,env:{...process.env,ZM_LOCAL_MODE:'1',PORT:String(port)},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),8000);app.stdout.once('data',()=>{clearTimeout(t);resolve();});});
  const base=`http://127.0.0.1:${port}`;
  browser=await chromium.launch({channel:'chrome'});

  // 走完一题拿到诊断，然后进换位模式连点两次「下一题」。
  async function runAt(vh){
   const context=await browser.newContext({viewport:{width:1440,height:vh},reducedMotion:'reduce'});
   await context.route('https://fonts.googleapis.com/**',r=>r.abort());
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('dialog',d=>d.accept());
   await page.addInitScript(()=>{try{localStorage.setItem('zm_guide_seen_v1','1');}catch(e){}});
   await page.goto(base+'/app.html#method');
   await page.evaluate(()=>localStorage.removeItem('zm_method_state_v1'));
   await page.reload();
   await page.waitForSelector('#methodStart');
   await page.selectOption('#mdYears','y1');
   await page.fill('#mdRole','产品经理');
   await page.fill('#mdJd','5 年以上经验，带过团队');
   await page.click('#mdSaveProfile');
   await page.waitForFunction(()=>!document.getElementById('mdPanelAnswer').hidden);
   await page.fill('#mdAnswer','我推动三个部门共用一套指标。财务明确反对，我拿两周灰度数据说服他先试一个部门，对账时间从三天降到半天。');
   await page.click('#mdSubmit');
   await page.waitForTimeout(400);
   if(await page.evaluate(()=>!document.getElementById('mdPanelProbe').hidden))await page.click('#mdProbeSkip');
   await page.waitForFunction(()=>!document.getElementById('mdPanelVerdict').hidden);

   // 模拟真实用户：先滚到页面底部读方法卡，再点「换位模式」
   await page.evaluate(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'instant'}));
   await page.waitForTimeout(200);
   await page.locator('#mdSwapOpen').scrollIntoViewIfNeeded();
   await page.locator('#mdSwapOpen').click();
   await page.waitForFunction(()=>!document.getElementById('mdPanelSwap').hidden);

   // 连换两题，每次都要回弹且方法卡不能被藏
   for(const round of [2,3]){
    await page.locator('[data-md-pick="yes"]').click();
    await page.locator('#mdSwapSubmit').click();
    await page.waitForSelector('#mdSwapNext');
    await page.locator('#mdSwapNext').click().catch(()=>{});
    await page.waitForTimeout(900);
    const state=await page.evaluate(()=>{
     const title=document.getElementById('mdSwapDim').getBoundingClientRect();
     const cards=document.getElementById('mdCards');
     return {titleTop:Math.round(title.top),vh:window.innerHeight,cardsHidden:cards.hidden,
             cardsTop:Math.round(cards.getBoundingClientRect().top),dim:document.getElementById('mdSwapDim').textContent};
    });
    assert.equal(state.cardsHidden,false,`视口 ${vh}：方法卡必须保持展示`);
    assert.ok(state.titleTop>=0&&state.titleTop<state.vh*0.35,
      `视口 ${vh}：换到第 ${round} 题后标题应落在视口上半部分，实际 top=${state.titleTop} / vh=${state.vh}`);
    assert.match(state.dim,new RegExp('第 '+round+' / 3'),`视口 ${vh}：应切到第 ${round} 题，实际 ${state.dim}`);
    // 方法卡应当在题目下方（正常文档流），不是被塞到别处
    assert.ok(state.cardsTop>0,`视口 ${vh}：方法卡应仍在题目下方正常位置`);
   }
   assert.deepEqual(errors,[],`视口 ${vh}：不应有 JS 报错：`+errors.join(' | '));
   await context.close();
   return true;
  }

  for(const vh of VIEWPORTS)await runAt(vh);
  console.log('换题回弹验收通过：'+VIEWPORTS.join(' / ')+' 四种视口高度，方法卡均保持展示');
 }finally{
  if(browser)await browser.close();
  if(app)app.kill();
  fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
