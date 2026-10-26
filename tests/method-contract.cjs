const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const M=require('../methodology.js');
const html=fs.readFileSync(path.join(__dirname,'..','app.html'),'utf8');

test('档位四档跨行业可用，不出现 P 级职级',()=>{
  assert.deepEqual(M.STAGES.map(s=>s.name),['执行者','独当一面','带人带事','定战略']);
  const text=fs.readFileSync(path.join(__dirname,'..','methodology.js'),'utf8');
  assert.ok(!/P[5-9]\b/.test(text),'引擎里不应出现 P 级职级');
});

test('年限推断四档，未知输入不崩且给安全默认',()=>{
  assert.equal(M.inferSelfStage('y0'),'executor');
  assert.equal(M.inferSelfStage('y1'),'owner');
  assert.equal(M.inferSelfStage('y2'),'lead');
  assert.equal(M.inferSelfStage('y3'),'strategy');
  assert.equal(M.inferSelfStage('不存在'),'owner');
});

test('JD 从高到低识别岗位档位，未识别时不猜',()=>{
  assert.equal(M.inferJobStage('负责业务线整体规划'),'strategy');
  assert.equal(M.inferJobStage('带过团队，5 年以上'),'lead');
  assert.equal(M.inferJobStage('3 年以上，独立负责模块'),'owner');
  assert.equal(M.inferJobStage('1-3 年，协助完成'),'executor');
  assert.equal(M.inferJobStage(''),'');
});

test('标尺永远用岗位档位；JD 缺失时用年限兜底并提示',()=>{
  const stretch=M.resolveScale({years:'y1',jd:'带过团队，跨部门推动'});
  assert.equal(stretch.selfStage,'owner');assert.equal(stretch.jobStage,'lead');
  assert.equal(stretch.flag,'stretch');
  const fallback=M.resolveScale({years:'y1',jd:''});
  assert.equal(fallback.jobSource,'fallback');assert.ok(fallback.note.length>0);
  const manual=M.resolveScale({years:'y1',jd:'',manualJob:'strategy'});
  assert.equal(manual.jobStage,'strategy');assert.equal(manual.jobSource,'manual');
});

test('横向信号：中文数字带量词才算量化，"一起""一下"不算',()=>{
  assert.ok(M.quantDensity('我们一起去了一下')===0);
  assert.ok(M.quantDensity('两周内覆盖三个部门')>0);
  assert.ok(M.quantDensity('提升 30%')>0);
});

test('横向信号：只有"团队""领导"不构成摩擦力细节',()=>{
  assert.equal(M.analyze('我们团队遇到很多困难').friction,false);
  assert.equal(M.analyze('财务明确反对，因为口径要变').friction,true);
});

test('个人动作必须挂在第一人称上，「我们做了」不算',()=>{
  assert.equal(M.analyze('我们团队一起做了个跨部门项目').concrete,false);
  assert.equal(M.analyze('我拉了三方会议，我写了方案').concrete,true);
});

test('五档判定与锚点一一对应',()=>{
  const rows=[
    ['我们团队一起做了个跨部门项目，中间遇到很多困难，最后成功了。','no'],
    ['我当时负责推动这个事，我写了方案，我拉了会，我改了流程，最后上线了。','neutral'],
    ['我推的是三个部门共用一套指标。财务明确反对，因为口径要变。我拿两周灰度数据说服他先试一个部门，对账时间从三天变成半天。','yes'],
    ['我推动三个部门共用一套指标。财务明确反对，我拿两周灰度数据说服他先试一个部门。跑通后我把这套口径固化成了周会机制，对账时间从三天降到半天。','strong_yes']
  ];
  for(const [text,level] of rows)assert.equal(M.judge(text,{jobStage:'owner'}).level,level,text);
});

test('全程被动判强否；被指派但主动破局不算被动',()=>{
  assert.equal(M.judge('领导让我推这个事，我就按他说的做，最后完成了。',{jobStage:'owner'}).level,'strong_no');
  const active=M.judge('领导让我推这个事，但我主动提出先做两周试点，我拉了三个部门开会。',{jobStage:'owner'});
  assert.notEqual(active.level,'strong_no');
  assert.equal(M.hasInitiative('领导让我推这个事，我就按他说的做'),false);
});

test('同一回答在不同岗位档位下得到不同结论',()=>{
  const text='我推的是三个部门共用一套指标。财务明确反对，因为口径要变。我拿两周灰度数据说服他先试一个部门，对账时间从三天变成半天。';
  assert.equal(M.judge(text,{jobStage:'owner'}).alignment,'met');
  assert.equal(M.judge(text,{jobStage:'lead'}).alignment,'below');
});

test('横向信号作为调节因子封顶，不单独计分',()=>{
  // 个人贡献不足 → 封顶中性。需要一段「本可以判到是、但大部分是我们」的回答。
  const mixed='我推的是三个部门共用一套指标。我们团队开了很多会。我们跑了数据。我们做了方案。财务明确反对，因为口径要变。我们说服他先试一个部门，对账时间从三天变成半天。';
  const a=M.judge(mixed,{jobStage:'owner'});
  assert.ok(a.signals.ownRatio<0.4,'用例本身要满足低个人贡献');
  assert.equal(a.score,2,'ownRatio 低时应封顶中性');
  assert.ok(a.caps.some(c=>c.code==='X-OWN'));
  // 无量化 → 封顶是（不能到强是）
  const noQ='我推的是三个部门共用指标。财务明确反对，因为口径要变。我说服他先试一个部门，跑通后我把这套口径固化成了周会机制。';
  const b=M.judge(noQ,{jobStage:'owner'});
  assert.ok(b.score<=3);
  assert.ok(b.caps.some(c=>c.code==='X-QUANT'));
});

test('缺口按诊断价值排序：人称 > 摩擦力 > 决策 > 量化 > 反思',()=>{
  const gaps=M.detectGaps(M.analyze('我们团队做完了，效果不错。'));
  assert.deepEqual(gaps.map(g=>g.code),['G1','G2','G3','G4','G5']);
  assert.deepEqual(gaps.map(g=>g.priority),[100,90,80,70,50]);
});

test('每轮只问一条、最多两轮、全通过不追问',()=>{
  const gaps=[{code:'G1'},{code:'G2'}];
  assert.equal(M.nextProbe(gaps,0).code,'G1');
  assert.equal(M.nextProbe(gaps,2),null);
  assert.equal(M.nextProbe([],0),null,'全部通过时不应为了追问而追问');
  assert.equal(M.MAX_TURNS,2);
});

test('话术库覆盖 G1–G5 且每类至少 4 条，同一 seed 不撞句',()=>{
  assert.equal(M.utteranceCount(),22);
  for(const code of ['G1','G2','G3','G4','G5'])assert.ok(M.UTTERANCES[code].length>=4,code);
  const a=M.pickUtterance('G1',0),b=M.pickUtterance('G1',1);
  assert.notEqual(a,b);
});

test('结构检查器四段状态齐全且给出缺失提示',()=>{
  const star=M.starCheck('我们团队一起做了个跨部门项目，中间遇到很多困难，最后成功了。');
  assert.deepEqual(star.map(s=>s.key),['S','T','A','R']);
  assert.equal(star.find(s=>s.key==='A').status,'miss');
  assert.equal(star.find(s=>s.key==='R').status,'miss');
});

test('判定必须给原话证据，且证据来自用户原文',()=>{
  const text='我们团队一起做了个跨部门项目，中间遇到很多困难，最后成功了。';
  const r=M.judge(text,{jobStage:'owner'});
  assert.ok(r.evidence.length>0);
  for(const e of r.evidence)assert.ok(text.includes(e.quote),'证据必须是原文片段：'+e.quote);
});

test('已达标时优先推进，不再挑毛病',()=>{
  const strong='我推动三个部门共用一套指标。财务明确反对，我拿两周灰度数据说服他先试一个部门。跑通后我把这套口径固化成了周会机制，对账时间从三天降到半天。';
  for(const st of ['executor','owner','lead']){
    const r=M.judge(strong,{jobStage:st});
    assert.equal(r.alignment,'met');
    assert.match(r.nextStep,/已经达标/,'达标后应先肯定再推进：'+r.nextStep);
  }
});

test('题目问的是已发生的事，不用「你需要……」的假设语气',()=>{
  for(const q of M.D2.questions){
    assert.ok(!/需要(推动|改变)/.test(q.q),'行为题不应使用假设语气：'+q.q);
    assert.match(q.q,/讲一次|经历/,'应是行为事件题：'+q.q);
    assert.ok(q.hint&&q.hint.length>10,'每题都要有「去哪儿找例子」的提示：'+q.id);
  }
});

test('同一维度按档位出题，档位越高题越难',()=>{
  assert.equal(M.pickQuestion('executor').id,'D2-Q1');
  assert.equal(M.pickQuestion('owner').id,'D2-Q2');
  assert.equal(M.pickQuestion('lead').id,'D2-Q3');
  assert.equal(M.pickQuestion('strategy').id,'D2-Q3','最高档复用最难那题');
});

test('每次只给一条下一步，且不返回总分',()=>{
  const r=M.judge('我们团队做完了，效果不错。',{jobStage:'owner'});
  assert.equal(typeof r.nextStep,'string');
  assert.ok(r.nextStep.length>0);
  assert.equal(r.total,undefined,'不应输出总分');
});

test('换位模式三道题的引擎判定与专家判定一致',()=>{
  for(const s of M.SWAP){
    const r=M.judgeByRule(s.rule,s.answer,{jobStage:'owner'});
    assert.equal(r.level,s.expertLevel,s.id+' '+s.dimension);
    assert.ok(s.why.length>=3);
    assert.ok(s.punch.length>0);
    assert.ok(M.LEVEL_IDS.includes(s.commonPick));
  }
});

test('缺点题：凡尔赛式缺点判强否，有真实代价但没改变只到中性',()=>{
  assert.equal(M.judgeWeakness('我最大的缺点是我太追求完美，会因为抠细节影响进度。').score,0);
  assert.equal(M.judgeWeakness('我有一次预估不足，导致项目延期两周。').score,2);
  assert.equal(M.judgeWeakness('我有一次预估不足，导致项目延期两周，后来我建立了风险清单。').score,3);
});

test('结果题：无数字判否，有数字无基准判中性，有基准才给是',()=>{
  assert.equal(M.judgeResult('效果很好，反馈不错。').score,1);
  assert.equal(M.judgeResult('我优化了流程，效率提升了 30%。').score,2);
  assert.equal(M.judgeResult('我优化了流程，处理时间从三天降到半天，提升 85%。').score,3);
});

test('存储 schema 校验拒绝越界与非法档位',()=>{
  const s=M.empty();
  assert.ok(M.validate(s));
  s.profile={years:'y1',jd:'',selfStage:'owner',jobStage:'owner',stageSource:'inferred'};
  assert.ok(M.validate(s));
  s.profile.jobStage='P7';
  assert.equal(M.validate(s),false,'非法档位必须拒绝');
  const t=M.empty();t.sessions.push({id:'a',date:'2026-01-01',questionId:'D2-Q1',turns:[],verdict:{level:'yes',jobStage:'owner'}});
  assert.ok(M.validate(t));
  t.sessions[0].verdict.level='great';
  assert.equal(M.validate(t),false);
  const u=M.empty();u.metrics.started=-1;
  assert.equal(M.validate(u),false);
});

test('引擎不依赖浏览器全局，可在 Node 直接 require',()=>{
  assert.equal(typeof M.judge,'function');
  assert.equal(typeof window,'undefined');
});

test('methodology.js 在浏览器中以 ZmMethod 暴露',()=>{
  const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'..','methodology.js'),'utf8'),ctx);
  assert.equal(typeof ctx.ZmMethod.judge,'function');
  assert.equal(ctx.ZmMethod.STAGES.length,4);
});

test('app.html 引入 methodology.js 且视图与导航已接线',()=>{
  assert.ok(html.includes('<script src="methodology.js"></script>'));
  assert.ok(html.includes('data-view="method"'));
  assert.ok(html.includes('id="method"'));
  assert.ok(html.includes("'method':'面试方法论'"));
});
