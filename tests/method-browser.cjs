// 方法论诊断工作台浏览器验收：真实 Chrome + 真实本地服务，隔离存储，不调用任何模型。
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {spawn}=require('node:child_process');
(async()=>{
 const root=path.join(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'zhimian-method-'));
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
  const context=await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'});
  await context.route('https://fonts.googleapis.com/**',r=>r.abort());
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept());

  // 首次进入会弹新手指引，先关掉，否则会挡住点击
  await page.addInitScript(()=>{try{localStorage.setItem('zm_guide_seen_v1','1');}catch(e){}});
  // 轮次/带人/模式收在折叠区里，交互前要先展开（真实用户也要点一下）
  const openAdv=async()=>{await page.evaluate(()=>{const d=document.getElementById('mdAdvanced');if(d)d.open=true;});await page.waitForTimeout(80);};
  await page.goto(base+'/app.html#method');
  await page.waitForSelector('#methodStart');
  await openAdv();
  if(await page.locator('#guideModal.open').isVisible().catch(()=>false))await page.locator('#guideModal [data-guide-close]').click();

  // 01 定标尺：年限 + JD 推断出岗位档位
  assert.equal(await page.locator('#mdPanelProfile').isVisible(),true,'首次进入应停在定标尺');
  await page.locator('#mdYears').selectOption('y1');
  await page.locator('#mdRole').fill('产品经理');
  await page.locator('#mdJd').fill('5 年以上，带过团队，能跨部门推动');
  await page.locator('#mdSaveProfile').click();
  await page.waitForFunction(()=>!document.getElementById('mdScale').hidden);
  const scaleText=await page.locator('#mdScale').innerText();
  assert.match(scaleText,/带人带事/,'JD 里的「带过团队 / 跨部门推动」应推断为带人带事');
  assert.match(scaleText,/独当一面/,'年限 3–6 年应推断为独当一面');
  assert.match(scaleText,/更高/,'岗位高于年限时应给出冲高提示');

  // 02 答题：一段只有「我们」的流水账
  await page.waitForFunction(()=>!document.getElementById('mdPanelAnswer').hidden);
  const question=await page.locator('#mdQuestion').innerText();
  assert.ok(question.length>10,'应显示题目');
  await page.locator('#mdAnswer').fill('我们团队一起做了个跨部门项目，中间遇到很多困难，最后成功了，领导很认可。');
  await page.locator('#mdSubmit').click();

  // 03 追问：第一条必须是人称（G1 优先级最高）
  await page.waitForFunction(()=>!document.getElementById('mdPanelProbe').hidden);
  const probe=await page.locator('#mdProbeText').innerText();
  assert.match(probe,/我们|拿掉|谁亲自/, '首轮追问应针对「我们」，实际：'+probe);
  assert.match(await page.locator('#mdProbeRound').innerText(),/1 \/ 2/,'最多两轮');

  // 补充个人动作后，第二轮应转向摩擦力
  await page.locator('#mdProbeAnswer').fill('我拉了两个部门的会，我写了方案，但财务那边明确反对，因为口径要改。');
  await page.locator('#mdProbeSubmit').click();
  await page.waitForTimeout(200);
  const stillProbe=await page.locator('#mdPanelProbe').isVisible();
  if(stillProbe){
    assert.match(await page.locator('#mdProbeRound').innerText(),/2 \/ 2/,'第二轮');
    await page.locator('#mdProbeAnswer').fill('我拿了两周灰度数据给他看，对账时间从三天变成半天，他同意先试一个部门。');
    await page.locator('#mdProbeSubmit').click();
  }

  // 04 诊断：档位 + 四段骨架 + 原话证据 + 只给一条下一步
  await page.waitForFunction(()=>!document.getElementById('mdPanelVerdict').hidden,{timeout:5000});
  const verdict=await page.locator('#mdVerdictBody').innerText();
  assert.match(verdict,/强否|否|中性|是|强是/,'应显示档位');
  assert.match(verdict,/按「带人带事」标准评/,'判定要标出用的是岗位档位');
  assert.equal(await page.locator('.md-star-cell').count(),4,'结构检查器应有四段');
  assert.match(verdict,/下一步只做这一件事/,'必须给出下一步');
  assert.match(verdict,/判定依据/,'必须引用原话');
  assert.equal(await page.locator('.md-next').count(),1,'只给一条建议，不是一堆');

  // 记录已落库
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('zm_method_state_v1')));
  assert.equal(stored.sessions.length,1);
  assert.equal(stored.metrics.completed,1);
  assert.ok(stored.metrics.probeOffered>=1);
  assert.equal(stored.profile.jobStage,'lead');

  // 换位模式：引擎判定与专家判定必须一致
  await page.locator('#mdSwapOpen').click();
  await page.waitForFunction(()=>!document.getElementById('mdPanelSwap').hidden);
  await page.locator('[data-md-pick="yes"]').click();
  await page.locator('#mdSwapReason').fill('感觉挺完整的');
  await page.locator('#mdSwapSubmit').click();
  const swap=await page.locator('#mdSwapResult').innerText();
  assert.match(swap,/否/,'第一题专家判定应为否');
  assert.match(swap,/差在哪/);
  assert.match(swap,/形式完整/,'应给出一句话点破');

  // 换位模式：点「下一题」后必须把视图带到新题，且不能影响方法卡的正常展示。
  // 这两件事必须分开断言——之前把方法卡隐藏掉来"解决"滚动，是拿错方案换问题。
  await page.locator('#mdSwapBack').click();
  await page.waitForFunction(()=>!document.getElementById('mdPanelVerdict').hidden);
  await page.locator('#mdSwapOpen').click();
  await page.waitForFunction(()=>!document.getElementById('mdPanelSwap').hidden);
  // 先把页面滚到下方（模拟用户读方法卡后点进来）
  await page.evaluate(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'instant'}));
  await page.waitForTimeout(200);
  await page.locator('[data-md-pick="yes"]').click();
  await page.locator('#mdSwapSubmit').click();
  await page.waitForSelector('#mdSwapNext');
  await page.locator('#mdSwapNext').click();
  await page.waitForTimeout(900);
  // 关键断言：新题标题要落在视口上半部分。
  // 不比较 scrollY——页面总高度会随内容变化，scrollY 变大也可能只是文档变高了。
  const pos=await page.evaluate(()=>{
    const title=document.getElementById('mdSwapDim').getBoundingClientRect();
    const cards=document.getElementById('mdCards');
    return {titleTop:Math.round(title.top),vh:window.innerHeight,cardsHidden:cards.hidden,cardsTop:Math.round(cards.getBoundingClientRect().top)};
  });
  assert.ok(pos.titleTop>=0&&pos.titleTop<pos.vh*0.35,
    '点下一题后新题标题应落在视口上半部分，实际 top='+pos.titleTop+' / vh='+pos.vh);
  assert.equal(pos.cardsHidden,false,'方法卡必须保持展示，不能靠隐藏它来解决滚动问题');
  assert.match(await page.locator('#mdSwapDim').innerText(),/2 \/ 3/,'应切到第二题');

  // 历史记录入口可达（此前没有任何入口能打开这个面板）
  await page.locator('#mdSwapBack').click();
  await page.waitForFunction(()=>!document.getElementById('mdPanelVerdict').hidden);
  await page.locator('#mdHistoryOpen').click();
  await page.waitForFunction(()=>!document.getElementById('mdPanelHistory').hidden);
  assert.ok((await page.locator('#mdHistoryList').innerText()).length>0,'应显示历史记录');
  await page.locator('#mdHistoryBack').click();
  await page.waitForFunction(()=>!document.getElementById('mdPanelVerdict').hidden);

  // 刷新后记录仍在（有档案时直接进答题，不再回到定标尺）
  await page.reload();
  await page.waitForSelector('#methodStart');
  await openAdv();
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('zm_method_state_v1')));
  assert.equal(after.sessions.length,1,'刷新后记录应保留');

  // AI 路径一：模型返回更好措辞时替换底稿，且依据来自原话
  await page.evaluate(()=>{document.getElementById('mdAgain').click();});
  await page.waitForFunction(()=>!document.getElementById('mdPanelAnswer').hidden);
  await page.locator('#mdAnswer').fill('我们团队一起做了个跨部门项目，中间遇到很多困难，最后成功了。');
  await page.route('**/api/ai/method-probe',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({result:{probe:'AI 追问：你说的"我们"里，哪一部分是你亲自做的？',quote:'我们团队一起做了个跨部门项目'},meta:{model:'fake'}})}));
  await page.locator('#mdSubmit').click();
  await page.waitForFunction(()=>!document.getElementById('mdPanelProbe').hidden);
  await page.waitForFunction(()=>document.getElementById('mdProbeText').textContent.includes('AI 追问'),{timeout:5000});
  assert.match(await page.locator('#mdProbeWhy').innerText(),/依据你说的/,'AI 返回后应展示逐字依据');

  // AI 路径二：模型失败时静默回退到规则底稿，流程照常走完
  await page.unroute('**/api/ai/method-probe');
  await page.route('**/api/ai/method-probe',route=>route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'模型服务返回 HTTP 502'})}));
  await page.locator('#mdProbeAnswer').fill('我拉了两个部门的会，我写了方案。');
  await page.locator('#mdProbeSubmit').click();
  await page.waitForTimeout(400);
  const stillProbe2=await page.evaluate(()=>!document.getElementById('mdPanelProbe').hidden);
  if(stillProbe2){
    const baseText=await page.locator('#mdProbeText').innerText();
    assert.ok(baseText.length>5,'AI 失败后应保留规则底稿，实际：'+baseText);
    assert.ok(!baseText.includes('AI 追问'),'AI 失败不应残留上次的润色结果');
    await page.locator('#mdProbeSkip').click();
  }
  await page.waitForFunction(()=>!document.getElementById('mdPanelVerdict').hidden,{timeout:5000});

  // 维度切换：D1 与 D2 出不同的题，切回 D1 题目要变
  await page.evaluate(()=>localStorage.removeItem('zm_method_state_v1'));
  await page.reload();
  await page.waitForSelector('#methodStart');
  await openAdv();
  assert.equal(await page.locator('#mdDims .chip').count(),5,'应有五个维度可选');
  const dimNames=await page.locator('#mdDims .chip').allInnerTexts();
  for(const want of ['推动与影响力','业务判断与决策','协作与冲突','复盘与成长','压力与稳定性']){
    assert.ok(dimNames.some(n=>n.includes(want)),'应有维度：'+want+'，实际：'+dimNames.join('/'));
  }
  await page.selectOption('#mdYears','y1');
  await page.fill('#mdRole','产品经理');
  await page.fill('#mdJd','5 年以上，带过团队');
  // 切单题模式再验维度切换（一轮模式下题目由轮次决定，不随维度切换）
  await page.locator('[data-md-mode="single"]').click();
  await page.waitForTimeout(200);
  // 默认 D2
  await page.click('#mdSaveProfile');
  await page.waitForFunction(()=>!document.getElementById('mdPanelAnswer').hidden);
  const qD2=await page.locator('#mdQuestion').innerText();
  const dimD2=await page.locator('#mdQuestionDim').innerText();
  assert.match(dimD2,/推动与影响力/,'默认应是推动与影响力');
  // 切到 D1：维度选择器在定标尺面板里，先回去
  await page.locator('#methodStart').click();
  await page.waitForFunction(()=>!document.getElementById('mdPanelProfile').hidden);
  await page.locator('#mdDims [data-md-dim="D1"]').click();
  await page.waitForFunction(()=>!document.getElementById('mdPanelAnswer').hidden);
  await page.waitForTimeout(300);
  const qD1=await page.locator('#mdQuestion').innerText();
  const dimD1=await page.locator('#mdQuestionDim').innerText();
  assert.match(dimD1,/业务判断/,'切换后应是业务判断与决策');
  assert.notEqual(qD1,qD2,'两个维度应出不同的题');
  assert.match(qD1,/取舍|判断|不该做/,'D1 的题应问取舍或判断');
  // D1 走完一题，判定按取舍口径
  await page.locator('#mdAnswer').fill('领导定的方案，我们只能这么做，后来执行得不错。');
  await page.locator('#mdSubmit').click();
  await page.waitForTimeout(400);
  if(await page.evaluate(()=>!document.getElementById('mdPanelProbe').hidden))await page.locator('#mdProbeSkip').click();
  await page.waitForFunction(()=>!document.getElementById('mdPanelVerdict').hidden);
  const verdictD1=await page.locator('#mdVerdictBody').innerText();
  assert.match(verdictD1,/强否|否/,'没得选的回答应判低档，实际：'+verdictD1.slice(0,40));
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('zm_method_state_v1')).sessions.at(-1));
  assert.match(saved.questionId,/^D1-/,'记录里应保存 D1 的题号，实际 '+saved.questionId);

  // 五个维度逐个切过去，每题都要能出、且维度名与题目对得上
  await page.evaluate(()=>localStorage.removeItem('zm_method_state_v1'));
  await page.reload();
  await page.waitForSelector('#methodStart');
  await openAdv();
  await page.selectOption('#mdYears','y1');
  await page.fill('#mdRole','产品经理');
  await page.fill('#mdJd','5 年以上，带过团队');
  await page.locator('[data-md-mode="single"]').click();
  await page.waitForTimeout(200);
  await page.click('#mdSaveProfile');
  await page.waitForFunction(()=>!document.getElementById('mdPanelAnswer').hidden);
  const seen=new Set();
  for(const [dimId,dimName] of [['D1','业务判断与决策'],['D2','推动与影响力'],['D3','协作与冲突'],['D4','复盘与成长'],['D5','压力与稳定性']]){
    await page.locator('#methodStart').click();
    await page.waitForFunction(()=>!document.getElementById('mdPanelProfile').hidden);
    await page.locator(`#mdDims [data-md-dim="${dimId}"]`).click();
    await page.waitForFunction(()=>!document.getElementById('mdPanelAnswer').hidden);
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#mdQuestionDim').innerText(),dimName,dimId+' 维度名应对应');
    const q=await page.locator('#mdQuestion').innerText();
    assert.ok(q.length>10,dimId+' 应出题');
    assert.ok(!seen.has(q),dimId+' 题目不应与其他维度重复：'+q);
    seen.add(q);
  }
  assert.equal(seen.size,5,'五个维度应给出五道不同的题');

  // 完整跑一轮：五个维度各一题，最后出整轮小结
  await page.evaluate(()=>localStorage.removeItem('zm_method_state_v1'));
  await page.reload();
  await page.waitForSelector('#methodStart');
  await openAdv();
  await page.selectOption('#mdYears','y1');
  await page.fill('#mdRole','产品经理');
  await page.fill('#mdJd','5 年以上，带过团队');
  // 默认就是「练一轮」
  assert.equal(await page.locator('[data-md-mode="round"]').getAttribute('class'),'chip active','默认应是一轮模式');
  assert.equal(await page.evaluate(()=>document.getElementById('mdDimField').hidden),true,'一轮模式不需要选维度');
  await page.click('#mdSaveProfile');
  await page.waitForFunction(()=>!document.getElementById('mdPanelAnswer').hidden);
  assert.match(await page.locator('#mdRoundBar').innerText(),/第 1 \/ 6 题/,'一轮应是六题（五维度 + 动机）');
  const roundDims=[];
  // 前五道行为题
  for(let i=0;i<5;i++){
    roundDims.push(await page.locator('#mdQuestionDim').innerText());
    if(i===0)assert.match(await page.locator('#mdRoundBar').innerText(),/第 1 \/ 6 题/);
    await page.locator('#mdAnswer').fill('我们团队一起做了个事情，中间有些困难，最后完成了，效果还不错。');
    await page.locator('#mdSubmit').click();
    await page.waitForTimeout(350);
    if(await page.evaluate(()=>!document.getElementById('mdPanelProbe').hidden))await page.locator('#mdProbeSkip').click();
    await page.waitForFunction(()=>!document.getElementById('mdPanelVerdict').hidden);
    const btnText=await page.locator('#mdAgain').innerText();
    assert.match(btnText,/下一题/,'第 '+(i+1)+' 题后应显示下一题，实际：'+btnText);
    await page.locator('#mdAgain').click();
    await page.waitForTimeout(350);
  }
  assert.equal(new Set(roundDims).size,5,'五个行为维度的题都应出现，实际：'+roundDims.join('/'));
  // 第 6 题是动机题：走风险扫描，不出档位
  await page.waitForFunction(()=>!document.getElementById('mdPanelMotive').hidden);
  assert.match(await page.locator('#mdRoundBar').innerText(),/第 6 \/ 6 题/,'第 6 题应是动机题');
  assert.match(await page.locator('#mdMotiveQ').innerText(),/离开|选择|未来/,'第 6 题应是动机题');
  // 轮内不给「换一题」：一轮的题是固定组好的，换题会打乱轮次与小结
  assert.equal(await page.evaluate(()=>document.getElementById('mdMotiveNext').hidden),true,'轮内不应出现「换一题」');
  await page.locator('#mdMotiveAnswer').fill('我上一份工作的领导水平不行，团队也混乱，实在待不下去。');
  await page.locator('#mdMotiveSubmit').click();
  await page.waitForTimeout(400);
  assert.ok(await page.locator('.md-motive-flag').count()>=2,'动机题应给风险扫描');
  const roundBtn=await page.locator('#mdMotiveRoundNext').innerText();
  assert.match(roundBtn,/整轮结果/,'最后一题后应显示看整轮结果，实际：'+roundBtn);
  await page.locator('#mdMotiveRoundNext').click();
  await page.waitForTimeout(400);
  // 小结页
  await page.waitForFunction(()=>!document.getElementById('mdPanelSummary').hidden,{timeout:5000});
  assert.equal(await page.locator('.md-sum-row').count(),6,'小结应列出五个维度 + 动机题');
  assert.equal(await page.locator('.md-sum-row.motive').count(),1,'动机题应单独一行');
  const head=await page.locator('#mdSummaryHead').innerText();
  assert.match(head,/\d+ \/ 5/,'达标数只统计五个行为维度，实际：'+head);
  assert.match(head,/最该补/, '未全达标时应指出最该补的维度');
  assert.match(head,/动机题有/, '动机题有风险时结论要点出来');
  const saved2=await page.evaluate(()=>JSON.parse(localStorage.getItem('zm_method_state_v1')));
  assert.equal(saved2.sessions.length,6,'一轮应记录六条（五行为 + 一动机）');
  assert.equal(saved2.metrics.rounds,1,'应记一轮');
  const motiveSession=saved2.sessions.at(-1);
  assert.equal(motiveSession.questionId,'M-Q1','最后一条应是动机题');
  assert.equal(motiveSession.verdict.motive,true,'动机题记录应标记 motive');

  // 只补最弱那一项：应切到单题模式并出对应维度的题
  await page.locator('#mdSummaryWeak').click();
  await page.waitForFunction(()=>!document.getElementById('mdPanelAnswer').hidden);
  assert.equal(await page.locator('[data-md-mode="single"]').getAttribute('class'),'chip active','应切到单题模式');
  assert.equal(await page.evaluate(()=>document.getElementById('mdDimField').hidden),false,'单题模式要显示维度选择');
  assert.equal(await page.evaluate(()=>document.getElementById('mdRoundBar').hidden),true,'单题模式不显示进度条');

  // 动机题：风险扫描，不给分数
  await page.evaluate(()=>localStorage.removeItem('zm_method_state_v1'));
  await page.reload();
  await page.waitForSelector('#methodStart');
  await openAdv();
  assert.equal(await page.locator('[data-md-mode="motive"]').count(),1,'应有动机题模式');
  await page.locator('[data-md-mode="motive"]').click();
  await page.waitForFunction(()=>!document.getElementById('mdPanelMotive').hidden);
  const motiveQ=await page.locator('#mdMotiveQ').innerText();
  assert.ok(motiveQ.length>5,'应显示动机题');
  assert.ok(/离开|选择|未来/.test(motiveQ),'应是动机类题目，实际：'+motiveQ);
  // 一段有明显风险的回答
  await page.locator('#mdMotiveAnswer').fill('我上一份工作的领导水平不行，团队也混乱，实在待不下去，所以想换个环境。');
  await page.locator('#mdMotiveSubmit').click();
  await page.waitForTimeout(400);
  const motiveResult=await page.locator('#mdMotiveResult').innerText();
  assert.match(motiveResult,/风险扫描/,'应显示风险扫描');
  assert.ok(await page.locator('.md-motive-flag').count()>=2,'应标出多条红旗');
  assert.match(motiveResult,/怎么改/,'每条红旗都要给改法');
  assert.match(motiveResult,/不给分数/,'必须说明不给分数');
  // 不能出现档位字样
  assert.ok(!/强否|中性|强是/.test(motiveResult),'动机题不应出现行为锚点档位');
  // 健康回答
  await page.locator('#mdMotiveAnswer').fill('上一份工作我负责内部工具，做了两年，我想转到面向用户的产品，所以开始看机会。我了解到你们正在做企业协作工具，这块和我之前的经验比较接近。');
  await page.locator('#mdMotiveSubmit').click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.md-motive-ok').count(),1,'健康回答应给正向结论');
  assert.equal(await page.locator('.md-motive-flag').count(),0,'健康回答不该有红旗');
  // 换一题
  const before=await page.locator('#mdMotiveQ').innerText();
  await page.locator('#mdMotiveNext').click();
  await page.waitForTimeout(300);
  assert.notEqual(await page.locator('#mdMotiveQ').innerText(),before,'换一题应切换题目');
  // 合规声明
  assert.ok(await page.locator('.md-disclaimer').count()>=1,'应有合规声明');
  const disc=await page.locator('.md-disclaimer').first().innerText();
  assert.match(disc,/不代表任何公司的招聘标准/,'声明要说明不代表招聘标准');
  assert.match(disc,/不构成录用判断/,'声明要说明不构成录用判断');
  assert.match(disc,/本机浏览器/,'声明要说明数据存储位置');

  // 方法卡提示：首题诊断后应弹「STAR 是什么」，且只弹一次
  await page.evaluate(()=>{localStorage.removeItem('zm_method_state_v1');localStorage.removeItem('zm_method_cards_v1');});
  await page.reload();
  await page.waitForSelector('#methodStart');
  await openAdv();
  await page.selectOption('#mdYears','y1');
  await page.fill('#mdRole','产品经理');
  await page.fill('#mdJd','5 年以上，带过团队');
  await page.locator('[data-md-mode="single"]').click();
  await page.waitForTimeout(200);
  await page.click('#mdSaveProfile');
  await page.waitForFunction(()=>!document.getElementById('mdPanelAnswer').hidden);
  await page.locator('#mdAnswer').fill('我们团队一起做了个事情，最后完成了。');
  await page.locator('#mdSubmit').click();
  await page.waitForTimeout(400);
  if(await page.evaluate(()=>!document.getElementById('mdPanelProbe').hidden))await page.locator('#mdProbeSkip').click();
  await page.waitForFunction(()=>!document.getElementById('mdPanelVerdict').hidden);
  await page.waitForTimeout(400);
  const cardShown=await page.evaluate(()=>!document.getElementById('mdCardHint').hidden);
  assert.equal(cardShown,true,'首题诊断后应弹方法卡');
  const cardText=await page.locator('#mdCardHint').innerText();
  assert.match(cardText,/顺手说一句/,'方法卡应是轻提示，不是课程');
  assert.match(cardText,/STAR/,'首题应给 STAR 那张');
  // 点知道了就收起
  await page.locator('#mdCardOk').click();
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>document.getElementById('mdCardHint').hidden),true,'点知道了应收起');
  // 已弹过的不再弹
  const shown=await page.evaluate(()=>JSON.parse(localStorage.getItem('zm_method_cards_v1')).shown);
  assert.ok(shown.includes('C1'),'应记住已弹过');

  // 面试轮次与带人状态
  await page.evaluate(()=>localStorage.removeItem('zm_method_state_v1'));
  await page.reload();
  await page.waitForSelector('#methodStart');
  await openAdv();
  assert.equal(await page.locator('#mdRounds .chip').count(),3,'应有三个轮次可选');
  assert.equal(await page.locator('#mdReports .chip').count(),3,'应有三个带人状态可选');
  // 选「HR 初面」+「没带过人」+ 6–10 年，应封顶在独当一面
  await page.locator('#mdRounds [data-md-round="hr"]').click();
  await page.locator('#mdReports [data-md-reports="none"]').click();
  await page.selectOption('#mdYears','y2');
  await page.fill('#mdRole','产品经理');
  await page.fill('#mdJd','');
  await page.click('#mdSaveProfile');
  await page.waitForFunction(()=>!document.getElementById('mdPanelAnswer').hidden);
  const hrScale=await page.locator('#mdScale').innerText();
  assert.match(hrScale,/独当一面/,'8 年但没带过人，标准应封顶在独当一面，实际：'+hrScale);
  // 答题页要保留一行标尺说明，否则用户不知道自己被按什么标准判
  assert.equal(await page.evaluate(()=>document.getElementById('mdScaleLine').hidden),false,'答题页应显示标尺行');
  assert.match(await page.locator('#mdScaleLine').innerText(),/独当一面/,'标尺行应写明按什么标准评');
  // HR 轮四题：三个维度 + 动机
  assert.match(await page.locator('#mdRoundBar').innerText(),/第 1 \/ 4 题/,'HR 轮应是四题');
  const hrDims=[];
  for(let i=0;i<3;i++){
    hrDims.push(await page.locator('#mdQuestionDim').innerText());
    await page.locator('#mdAnswer').fill('我们团队一起做了个事情，最后完成了。');
    await page.locator('#mdSubmit').click();
    await page.waitForTimeout(300);
    if(await page.evaluate(()=>!document.getElementById('mdPanelProbe').hidden))await page.locator('#mdProbeSkip').click();
    await page.waitForFunction(()=>!document.getElementById('mdPanelVerdict').hidden);
    await page.locator('#mdAgain').click();
    await page.waitForTimeout(300);
  }
  assert.ok(!hrDims.some(d=>/业务判断/.test(d)),'HR 轮不该考业务判断，实际：'+hrDims.join('/'));
  await page.waitForFunction(()=>!document.getElementById('mdPanelMotive').hidden);
  assert.match(await page.locator('#mdRoundBar').innerText(),/第 4 \/ 4 题/,'HR 轮第四题是动机题');

  // 切到业务面：不出动机题，出业务判断
  await page.locator('#methodStart').click();
  await page.waitForFunction(()=>!document.getElementById('mdPanelProfile').hidden);
  await page.locator('#mdRounds [data-md-round="business"]').click();
  // 在定标尺步骤切换轮次只记设置、不抢跑，需要再点一次确认
  await page.click('#mdSaveProfile');
  await page.waitForFunction(()=>!document.getElementById('mdPanelAnswer').hidden);
  await page.waitForTimeout(300);
  assert.match(await page.locator('#mdRoundBar').innerText(),/第 1 \/ 4 题/,'业务面应是四题');
  assert.match(await page.locator('#mdQuestionDim').innerText(),/业务判断/,'业务面第一题应是业务判断');

  // 没带过人时的替代问法
  await page.locator('#methodStart').click();
  await page.waitForFunction(()=>!document.getElementById('mdPanelProfile').hidden);
  await page.locator('#mdReports [data-md-reports="none"]').click();
  await page.locator('#mdRounds [data-md-round="all"]').click();
  await page.selectOption('#mdYears','y2');
  await page.click('#mdSaveProfile');
  await page.waitForFunction(()=>!document.getElementById('mdPanelAnswer').hidden);
  // 跳到第 3 题（协作冲突，lead 档会用到管理题）
  await page.evaluate(()=>{mdRound.index=2;mdShowRoundQuestion();});
  await page.waitForTimeout(300);
  const q3=await page.locator('#mdQuestion').innerText();
  assert.ok(!/你带的人/.test(q3),'没带过人时不该问「你带的人」，实际：'+q3);

  // 回答改写：只重排原话，占位符高亮，失败不影响规则结论
  await page.evaluate(()=>{localStorage.removeItem('zm_method_state_v1');localStorage.removeItem('zm_method_cards_v1');});
  await page.reload();
  await page.waitForSelector('#methodStart');
  await openAdv();
  await page.selectOption('#mdYears','y1');
  await page.fill('#mdRole','产品经理');
  await page.fill('#mdJd','');
  await page.locator('[data-md-mode="single"]').click();
  await page.waitForTimeout(200);
  await page.click('#mdSaveProfile');
  await page.waitForFunction(()=>!document.getElementById('mdPanelAnswer').hidden);
  await page.locator('#mdAnswer').fill('我们团队一起做了个跨部门项目，中间遇到很多困难。我拿了两周的灰度数据给财务看，对账时间从三天变成半天。');
  await page.route('**/api/ai/method-rewrite',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
    result:{rewritten:'我拿了两周的灰度数据给财务看，对账时间从三天变成半天。【待补充：财务当时具体担心什么】这是跨部门项目，中间遇到很多困难。',sentences:[],coverage:0.82},
    meta:{model:'fake'}
  })}));
  await page.locator('#mdSubmit').click();
  await page.waitForTimeout(350);
  if(await page.evaluate(()=>!document.getElementById('mdPanelProbe').hidden))await page.locator('#mdProbeSkip').click();
  await page.waitForFunction(()=>!document.getElementById('mdPanelVerdict').hidden);
  assert.equal(await page.locator('#mdRewriteBtn').count(),1,'诊断页应有「看改写示例」');
  const levelBefore=await page.locator('#mdVerdictBody .md-level').first().innerText();
  await page.locator('#mdRewriteBtn').click();
  await page.waitForFunction(()=>!document.getElementById('mdRewriteBox').hidden);
  await page.waitForTimeout(500);
  const rwText=await page.locator('#mdRewriteBox').innerText();
  assert.match(rwText,/改写示例/);
  assert.match(rwText,/待补充/,'应展示占位符');
  assert.equal(await page.locator('#mdRewriteBox mark').count(),1,'占位符应高亮');
  assert.match(rwText,/不是标准答案/,'必须说明这不是标准答案');
  assert.match(rwText,/需要你自己补真实事实/,'必须提示占位符要自己补');
  assert.match(rwText,/没有出现你原话之外的数字、名词或事实/,'必须说明做过校验');
  // 改写不影响规则判定
  assert.equal(await page.locator('#mdVerdictBody .md-level').first().innerText(),levelBefore,'改写不应改变档位');

  // 改写失败时保留规则结论，只提示改写不可用
  await page.unroute('**/api/ai/method-rewrite');
  await page.route('**/api/ai/method-rewrite',route=>route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'改写新增了过多原文没有的内容'})}));
  await page.evaluate(()=>document.getElementById('mdAgain').click());
  await page.waitForFunction(()=>!document.getElementById('mdPanelAnswer').hidden);
  await page.locator('#mdAnswer').fill('我们团队一起做了个事情，最后完成了。');
  await page.locator('#mdSubmit').click();
  await page.waitForTimeout(350);
  if(await page.evaluate(()=>!document.getElementById('mdPanelProbe').hidden))await page.locator('#mdProbeSkip').click();
  await page.waitForFunction(()=>!document.getElementById('mdPanelVerdict').hidden);
  const level2=await page.locator('#mdVerdictBody .md-level').first().innerText();
  await page.locator('#mdRewriteBtn').click();
  await page.waitForTimeout(600);
  const failText=await page.locator('#mdRewriteBox').innerText();
  assert.match(failText,/没能生成改写/,'失败应给出提示');
  assert.match(failText,/规则诊断结果不受影响/,'失败不能影响规则结论');
  assert.equal(await page.locator('#mdVerdictBody .md-level').first().innerText(),level2,'失败后档位不变');
  await page.unroute('**/api/ai/method-rewrite');

  // 窄屏不溢出
  await page.setViewportSize({width:320,height:720});
  await page.waitForTimeout(150);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=1,'320px 不应横向溢出，实际 '+overflow);

  assert.deepEqual(errors,[],'不应有 JS 报错：'+errors.join(' | '));
  console.log('方法论诊断工作台浏览器验收通过');
 }finally{
  if(browser)await browser.close();
  if(app)app.kill();
  fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
