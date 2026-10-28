// 画像验收：不同「年限 × 带人状态 × 面试轮次」组合下，题目是否真的合适。
// 单独成文件的原因：这是产品可用性的底线——给一个从没带过人的资深用户
// 出「你带的人出了什么问题」，他答不出来，整轮就废了。
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {spawn}=require('node:child_process');
const M=require('../methodology.js');

// 假设有下属的措辞。没带过人的用户不该在任何一题里看到这些。
const MANAGEMENT_WORDS=/你带的人|你的下属|你管理的团队|你带的团队/;

const SCENARIOS=[
  {round:'all',reports:'none',count:6,label:'都要练 × 没带过人'},
  {round:'all',reports:'team',count:6,label:'都要练 × 带过团队'},
  {round:'hr',reports:'none',count:4,label:'HR 初面 × 没带过人'},
  {round:'hr',reports:'team',count:4,label:'HR 初面 × 带过团队'},
  {round:'business',reports:'none',count:4,label:'业务面 × 没带过人'},
  {round:'business',reports:'team',count:4,label:'业务面 × 带过团队'}
];

(async()=>{
 const root=path.join(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'zhimian-persona-'));
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
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.route('https://fonts.googleapis.com/**',r=>r.abort());
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>{try{localStorage.setItem('zm_guide_seen_v1','1');}catch(e){}});

  // 设定画像并返回落库的 profile。JD 统一要求带团队，这是最容易踩雷的组合：
  // 岗位要「带人带事」，但用户没带过人，题目必须自动降级。
  async function setup(scenario){
   await page.goto(base+'/app.html#method');
   await page.evaluate(()=>localStorage.removeItem('zm_method_state_v1'));
   await page.reload();
   await page.waitForSelector('#methodStart');
   // 轮次/带人收在折叠区里，先展开（真实用户也要点一下）
   await page.evaluate(()=>{const d=document.getElementById('mdAdvanced');if(d)d.open=true;});
   await page.waitForTimeout(80);
   await page.selectOption('#mdYears','y2');                 // 6–10 年
   await page.locator(`#mdReports [data-md-reports="${scenario.reports}"]`).click();
   await page.locator(`#mdRounds [data-md-round="${scenario.round}"]`).click();
   await page.fill('#mdRole','产品经理');
   await page.fill('#mdJd','5 年以上经验，带过团队，能跨部门推动复杂项目落地');
   await page.click('#mdSaveProfile');
   await page.waitForFunction(()=>!document.getElementById('mdPanelAnswer').hidden);
   await page.waitForTimeout(200);
   return page.evaluate(()=>JSON.parse(localStorage.getItem('zm_method_state_v1')).profile);
  }

  // 把这一轮所有题的文字取出来（动机题走另一个面板）
  async function collectQuestions(count){
   const out=[];
   for(let i=0;i<count;i++){
    await page.evaluate(k=>{mdRound.index=k;mdShowRoundQuestion();},i);
    await page.waitForTimeout(80);
    const isMotive=await page.evaluate(()=>!document.getElementById('mdPanelMotive').hidden);
    out.push(isMotive
      ?{kind:'动机',dimensionId:'M',text:await page.locator('#mdMotiveQ').innerText()}
      :{kind:'行为',dimensionId:await page.evaluate(()=>mdRound.questions[mdRound.index].dimensionId),
        text:await page.locator('#mdQuestion').innerText()});
   }
   return out;
  }

  for(const s of SCENARIOS){
   const profile=await setup(s);

   // ① 档位封顶：没带过人，自我档位不得高于「独当一面」
   if(s.reports==='none'){
    assert.equal(profile.selfStage,'owner',`${s.label}：没带过人，自我档位应封顶在独当一面，实际 ${profile.selfStage}`);
   }else{
    assert.equal(profile.selfStage,'lead',`${s.label}：带过团队 + 8 年，自我档位应是带人带事，实际 ${profile.selfStage}`);
   }
   // 岗位要求始终来自 JD，不受带人状态影响
   assert.equal(profile.jobStage,'lead',`${s.label}：JD 要求带团队，岗位档位应是带人带事`);

   // ② 题数符合该轮次
   const questions=await collectQuestions(s.count);
   assert.equal(questions.length,s.count,`${s.label}：题数应为 ${s.count}`);

   // ③ 题目内容：没带过人不得出现管理措辞；带过人应保留管理版
   for(const q of questions){
    if(q.kind==='动机')continue;
    if(s.reports==='none'){
      assert.ok(!MANAGEMENT_WORDS.test(q.text),
        `${s.label}：${q.dimensionId} 不该出现「${MANAGEMENT_WORDS.source}」这类措辞，实际：${q.text}`);
    }
   }
   if(s.reports==='team'){
    const d4=questions.find(q=>q.dimensionId==='D4');
    assert.ok(d4&&/你带的人/.test(d4.text),
      `${s.label}：带过团队的人应保留管理版问法，实际：${d4&&d4.text}`);
   }
   // ④ 同一轮内题目不重复
   const texts=questions.map(q=>q.text);
   assert.equal(new Set(texts).size,texts.length,`${s.label}：同一轮不应出现重复题目`);
  }

  // ⑤ 单题模式：五个维度逐个检查，没带过人时同样不得出现管理措辞
  await setup(SCENARIOS[0]);
  for(const dimId of ['D1','D2','D3','D4','D5']){
   const text=await page.evaluate(d=>{
    mdMode='single';mdDimId=d;mdStartAnswer();
    return new Promise(r=>setTimeout(()=>r(document.getElementById('mdQuestion').textContent),120));
   },dimId);
   assert.ok(!MANAGEMENT_WORDS.test(text),`单题模式 ${dimId} 不该出现管理措辞，实际：${text}`);
  }

  // ⑥ 引擎层静态守卫：凡是需要带人的题，必须配一个不带人的替代版本。
  //    这条防的是以后新增题目时忘了写 alt。
  for(const d of M.DIMENSIONS){
   for(const q of d.questions){
    if(!q.needsReports)continue;
    assert.ok(q.alt&&q.alt.length>10,`${q.id} 需要带人，必须提供 alt 替代问法`);
    assert.ok(q.altHint&&q.altHint.length>10,`${q.id} 的替代问法也要有提示`);
    assert.ok(!MANAGEMENT_WORDS.test(q.alt),`${q.id} 的替代问法里不该再出现管理措辞：${q.alt}`);
   }
  }

  assert.deepEqual(errors,[],'不应有 JS 报错：'+errors.join(' | '));
  console.log(`画像验收通过：${SCENARIOS.length} 种组合 + 单题模式 + 引擎静态守卫`);
 }finally{
  if(browser)await browser.close();
  if(app)app.kill();
  fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
