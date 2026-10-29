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

test('话术库覆盖全部缺口且每类至少 3 条，同一 seed 不撞句',()=>{
  // G1–G5 通用 + G6–G8 是 D1 专用的取舍三件套
  assert.equal(M.utteranceCount(),49);
  for(const code of ['G1','G2','G3','G4','G5'])assert.ok(M.UTTERANCES[code].length>=4,code);
  for(const code of ['G6','G7','G8','G9','G10','G11','G12','G13','G14'])assert.ok(M.UTTERANCES[code].length>=3,code);
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

/* ===== D1 业务判断与决策 ===== */
test('D1 与 D2 是两个独立维度，各有三题五锚点',()=>{
  assert.equal(M.DIMENSIONS.length,5);
  for(const d of M.DIMENSIONS){
    assert.equal(d.questions.length,3,d.id);
    assert.equal(d.anchors.length,5,d.id);
    for(const q of d.questions)assert.ok(q.hint&&q.hint.length>10,d.id+' 每题都要有找例子的提示');
  }
  assert.equal(M.dimension('D1').name,'业务判断与决策');
  assert.equal(M.dimension('不存在').id,'D2','未知维度回落到 D2');
});

test('D1 按档位出题，最高档复用最难那题',()=>{
  assert.equal(M.pickQuestion('executor','D1').id,'D1-Q1');
  assert.equal(M.pickQuestion('owner','D1').id,'D1-Q2');
  assert.equal(M.pickQuestion('lead','D1').id,'D1-Q3');
  assert.equal(M.pickQuestion('strategy','D1').id,'D1-Q3');
});

test('D1 判定核心是取舍是否成立，不是有没有阻力',()=>{
  const rows=[
    ['领导定的方案，我们只能这么做。','strong_no'],
    ['A 方案明显更好，当然选 A，没什么好纠结的。','no'],
    ['我们选了一个方案，最后做成了。','no'],
    ['两个方案各有好处，我选了 A，放弃了 B，当时凭感觉觉得 A 更好。','no'],
    ['两个方案：A 上线快但功能少，B 功能全但要两个月。我测算过 A 能提前三周拿到数据，所以先做 A，放弃 B，上线后转化提升 12%。','yes'],
    ['两个方案：A 上线快，B 功能全。我测算过 A 能提前三周拿到数据，所以先做 A，放弃 B。上线后转化提升 12%。之后我把这套测算方式固化成了评审模板，团队一直在用。','strong_yes']
  ];
  for(const [text,level] of rows){
    assert.equal(M.judge(text,{jobStage:'owner',dimension:'D1'}).level,level,text.slice(0,30));
  }
});

test('同一段回答在 D1 和 D2 下可能得到不同结论',()=>{
  // 这段有真实阻力（D2 看重）但没有取舍（D1 看重）
  const text='我推动三个部门配合，财务明确反对，因为口径要变。我拿两周灰度数据说服他先试一个部门。';
  const d1=M.judge(text,{jobStage:'owner',dimension:'D1'});
  const d2=M.judge(text,{jobStage:'owner',dimension:'D2'});
  assert.notEqual(d1.score,d2.score,'两个维度应按各自标准判定，实际 D1='+d1.score+' D2='+d2.score);
});

test('D1 专用缺口 G6 选项 / G7 代价 / G8 伪取舍',()=>{
  const none='领导定的方案，我们只能这么做。';
  const codes=M.detectGaps(M.analyze(none),none,'D1').map(g=>g.code);
  assert.ok(codes.includes('G6'),'没说选项应触发 G6');
  assert.ok(codes.includes('G7'),'没说代价应触发 G7');
  assert.ok(codes.includes('G8'),'没得选应触发 G8');
  // D2 不应出现这三个缺口
  const d2codes=M.detectGaps(M.analyze(none),none,'D2').map(g=>g.code);
  assert.ok(!d2codes.some(c=>['G6','G7','G8'].includes(c)),'D2 不应出现取舍三件套');
});

test('取舍齐全时不触发 G6/G7，也不误报 G8',()=>{
  const good='两个方案：A 上线快但功能少，B 功能全但要两个月。我测算过 A 能提前三周拿到数据，所以先做 A，放弃 B，上线后转化提升 12%。';
  const codes=M.detectGaps(M.analyze(good),good,'D1').map(g=>g.code);
  assert.ok(!codes.includes('G6'),'已说清选项不应触发 G6');
  assert.ok(!codes.includes('G7'),'已说清代价不应触发 G7');
  assert.ok(!codes.includes('G8'),'有真实取舍不应误报 G8');
});

test('D1 缺口有对应的追问话术和下一步建议',()=>{
  for(const code of ['G6','G7','G8']){
    assert.ok(M.UTTERANCES[code]&&M.UTTERANCES[code].length>=3,code+' 至少三条话术');
  }
  const bad='领导定的方案，我们只能这么做。';
  const r=M.judge(bad,{jobStage:'owner',dimension:'D1'});
  assert.ok(r.nextStep.length>0);
  // 下一步应针对最高优先级缺口给出可执行动作
  assert.ok(!/^$/.test(r.nextStep));
});

test('D1 的证据引用必须来自原文',()=>{
  const text='领导定的方案，我们只能这么做。';
  const r=M.judge(text,{jobStage:'owner',dimension:'D1'});
  for(const e of r.evidence)assert.ok(text.includes(e.quote),'证据必须是原文片段：'+e.quote);
});

test('证据去重：多个缺口引用同一句时只保留一条并合并缺口名',()=>{
  const short='领导定的方案，我们只能这么做。';
  const r=M.judge(short,{jobStage:'lead',dimension:'D1'});
  assert.equal(r.evidence.length,1,'短回答里多个缺口引用同一句，应合并成一条');
  assert.ok(r.evidence[0].name.includes('/'),'合并后应显示多个缺口名：'+r.evidence[0].name);
  assert.ok(short.includes(r.evidence[0].quote),'引用必须是原文片段：'+r.evidence[0].quote);
});

test('D1 的下一步优先指向伪取舍，而不是人称',()=>{
  // 这段同时缺人称和取舍，但"当时没得选"才是致命问题：
  // 把"我们"改成"我"也救不了这个故事。
  const text='领导定的方案，我们只能这么做，后来执行得不错。';
  const d1=M.judge(text,{jobStage:'lead',dimension:'D1'});
  assert.match(d1.nextStep,/取舍|别的选择/,'D1 应先修取舍，实际：'+d1.nextStep);
  // D2 同样的话仍应先修人称
  const d2=M.judge(text,{jobStage:'lead',dimension:'D2'});
  assert.match(d2.nextStep,/"我们"|"我"/,'D2 仍应先修人称，实际：'+d2.nextStep);
});

test('证据去重不影响不同原话的多条证据',()=>{
  const text='我们团队一起做了个跨部门项目，中间遇到很多困难，最后成功了。我拿了两周灰度数据给财务看。';
  const r=M.judge(text,{jobStage:'owner',dimension:'D2'});
  assert.ok(r.evidence.length>=2,'不同原话应保留多条证据');
  const quotes=r.evidence.map(e=>e.quote);
  assert.equal(new Set(quotes).size,quotes.length,'不应出现重复引用');
});

/* ===== D3 协作与冲突 ===== */
test('D3 判定核心是「有没有承认对方合理」，不是「有没有解决」',()=>{
  const rows=[
    ['他就是不专业，瞎指挥，最后我没办法只能听他的。','strong_no'],
    ['我们有分歧，后来让领导拍板解决了。','neutral'],
    ['我理解他担心的是排期风险，因为他的 KPI 挂在交付上。我拿了两周的灰度数据给他看，说明分阶段上线风险可控，他同意先试一个模块。','yes']
  ];
  for(const [text,level] of rows)assert.equal(M.judge(text,{jobStage:'owner',dimension:'D3'}).level,level,text.slice(0,24));
});

test('D3 把对方写成坏人是强否，即使结果做成了',()=>{
  const text='对方完全不讲理，水平也差，最后我硬推着做完了，效果很好。';
  const r=M.judge(text,{jobStage:'owner',dimension:'D3'});
  assert.equal(r.level,'strong_no','贬低对方应压到最低档，不能因为结果好就给分');
});

test('D3 专用缺口 G9 立场 / G10 归因',()=>{
  const blame='他就是不专业，瞎指挥。';
  const codes=M.detectGaps(M.analyze(blame),blame,'D3').map(g=>g.code);
  assert.ok(codes.includes('G9'),'没体现理解对方应触发 G9');
  assert.ok(codes.includes('G10'),'贬低对方应触发 G10');
  const good='我理解他担心排期风险。我拿灰度数据给他看，说明风险可控，他同意先试一个模块。';
  const goodCodes=M.detectGaps(M.analyze(good),good,'D3').map(g=>g.code);
  assert.ok(!goodCodes.includes('G10'),'已体现理解对方不应触发 G10');
});

/* ===== D4 复盘与成长 ===== */
test('D4 判定核心是「代价 + 自认责任 + 具体改变」',()=>{
  const rows=[
    ['我最大的缺点就是太追求完美。','strong_no'],
    ['我有一次预估不足，导致项目延期两周。','neutral'],
    ['我有一次低估了复杂度，导致项目延期两周，返工了一轮。后来我改成每个需求先做技术评审，留三天 buffer。','yes']
  ];
  for(const [text,level] of rows)assert.equal(M.judge(text,{jobStage:'owner',dimension:'D4'}).level,level,text.slice(0,24));
});

test('D4 凡尔赛式缺点一律强否，不管包装得多好',()=>{
  for(const t of ['我最大的缺点就是太追求完美。','我的缺点是对自己要求太高，经常加班。','我太拼了，经常忽略休息。']){
    assert.equal(M.judge(t,{jobStage:'owner',dimension:'D4'}).level,'strong_no',t);
  }
});

test('D4 只说外部原因不给分',()=>{
  // 有代价，但不承认是自己判断失误
  const text='项目延期了两周，因为需求一直在变，公司流程也有问题。';
  const r=M.judge(text,{jobStage:'owner',dimension:'D4'});
  assert.ok(r.score<=1,'把责任全推外部应判低档，实际 '+r.levelName);
});

/* ===== D5 压力与稳定性 ===== */
test('D5 判定核心是「主动调整」，不是「硬扛」',()=>{
  const rows=[
    ['项目很急，我连续通宵三天，一个人扛下来，最后按时上线了。','strong_no'],
    ['时间很紧，我加班赶完了。','no'],
    ['时间很紧，我盘了一下发现做不完，就跟领导说了风险，砍掉了两个非核心功能，先保核心链路，最后按时上线。','yes']
  ];
  for(const [text,level] of rows)assert.equal(M.judge(text,{jobStage:'owner',dimension:'D5'}).level,level,text.slice(0,24));
});

test('D5 硬扛是风险信号，不该被当成抗压加分',()=>{
  const hardEndure='我连续通宵一周，一个人顶住了整个项目，从没跟领导说过压力。';
  const adjusted='我发现进度有风险，提前跟领导说了，砍掉两个非核心功能，还借调了一个人。';
  const a=M.judge(hardEndure,{jobStage:'owner',dimension:'D5'});
  const b=M.judge(adjusted,{jobStage:'owner',dimension:'D5'});
  assert.equal(a.level,'strong_no','只有硬扛应判强否');
  assert.ok(b.score>a.score,'主动调整的得分必须高于硬扛');
});

test('五个维度各有三题五锚点，题目都带找例子的提示',()=>{
  assert.deepEqual(M.DIMENSIONS.map(d=>d.id),['D1','D2','D3','D4','D5']);
  for(const d of M.DIMENSIONS){
    assert.equal(d.questions.length,3,d.id);
    assert.equal(d.anchors.length,5,d.id);
    for(const q of d.questions){
      assert.ok(q.hint&&q.hint.length>10,d.id+' 每题要有提示');
      assert.ok(!/需要(推动|改变)/.test(q.q),d.id+' 不能用假设语气');
    }
  }
});

test('每个维度都有专用缺口与优先级表',()=>{
  for(const dim of ['D1','D3','D4','D5']){
    const codes=M.gapsFor(dim).map(g=>g.code);
    assert.ok(codes.length>5,dim+' 应有专用缺口，实际 '+codes.length);
  }
  assert.equal(M.gapsFor('D2').length,5,'D2 只用通用五类缺口');
});

test('各维度下一步优先修自己的致命缺口',()=>{
  const cases=[
    ['D3','他就是不专业，瞎指挥。','对方|合理|担心'],
    ['D4','我最大的缺点就是太追求完美。','优点包装|真的让你付出'],
    ['D5','我连续通宵三天，一个人扛下来。','调整|砍|找了谁']
  ];
  for(const [dim,text,re] of cases){
    const r=M.judge(text,{jobStage:'owner',dimension:dim});
    assert.match(r.nextStep,new RegExp(re),dim+' 下一步应指向致命缺口，实际：'+r.nextStep);
  }
});

/* ===== 一轮练习：组题与小结 ===== */
test('一轮是五个行为维度加一道动机题，题目不重复',()=>{
  assert.equal(M.ROUND_SIZE,6);
  const round=M.buildRound('owner');
  assert.equal(round.length,6);
  assert.equal(new Set(round.map(r=>r.questionId)).size,6,'六道题都不重复');
  assert.equal(new Set(round.map(r=>r.dimensionId)).size,6);
  assert.equal(round.filter(r=>r.kind==='behavior').length,5);
  assert.equal(round.at(-1).kind,'motive','动机题放最后，避免卡住整轮');
  assert.equal(round.at(-1).dimensionId,'M');
  for(const r of round){
    assert.ok(r.dimensionName&&r.questionId&&r.question&&r.hint,r.dimensionId+' 组题信息要完整');
  }
});

test('一轮组题按档位变难',()=>{
  const low=M.buildRound('executor').filter(r=>r.kind==='behavior').map(r=>r.questionId);
  const high=M.buildRound('lead').filter(r=>r.kind==='behavior').map(r=>r.questionId);
  assert.notDeepEqual(low,high,'不同档位应出不同的题');
  assert.ok(low.every(q=>q.endsWith('-Q1')),'执行者档应全是最基础的 Q1');
  assert.ok(high.every(q=>q.endsWith('-Q3')),'带人带事档应全是 Q3');
});

test('整轮小结给出达标数与最该补的维度',()=>{
  const sum=M.roundSummary([
    {dimensionId:'D1',level:'yes'},
    {dimensionId:'D2',level:'neutral'},
    {dimensionId:'D3',level:'no'},
    {dimensionId:'D4',level:'yes'},
    {dimensionId:'D5',level:'neutral'}
  ],'owner');
  assert.equal(sum.total,5);
  assert.equal(sum.metCount,2,'yes 才算达标（owner 需要到「是」）');
  assert.equal(sum.weakest.dimensionId,'D3','差距最大的应被标为最弱');
  assert.match(sum.headline,/2 \/ 5/);
  assert.match(sum.headline,/协作与冲突/);
});

test('同样差距时按权重挑最弱的，业务判断优先于压力稳定',()=>{
  const sum=M.roundSummary([
    {dimensionId:'D1',level:'no'},
    {dimensionId:'D5',level:'no'}
  ],'owner');
  assert.equal(sum.weakest.dimensionId,'D1','权重 0.25 的业务判断应优先于 0.10 的压力稳定');
});

test('全部达标时给正向结论，不硬找最弱',()=>{
  const sum=M.roundSummary([
    {dimensionId:'D1',level:'strong_yes'},
    {dimensionId:'D2',level:'strong_yes'}
  ],'executor');
  assert.equal(sum.metCount,2);
  assert.match(sum.headline,/都达标/);
});

test('小结对空输入不崩',()=>{
  const sum=M.roundSummary([],'owner');
  assert.equal(sum.total,0);
  assert.equal(sum.weakest,null);
  assert.ok(sum.headline.length>0);
});

test('小结里每个维度的达标线按岗位档位算',()=>{
  const rows=[{dimensionId:'D2',level:'neutral'}];
  // 执行者到「中性」就算达标
  assert.equal(M.roundSummary(rows,'executor').rows[0].met,true);
  // 带人带事需要「强是」
  assert.equal(M.roundSummary(rows,'lead').rows[0].met,false);
  assert.equal(M.roundSummary(rows,'lead').rows[0].gap,2);
});

test('存档允许 rounds 计数，且兼容没有该字段的旧数据',()=>{
  const st=M.empty();
  assert.ok(M.validate(st),'新档应通过');
  st.metrics.rounds=2;
  assert.ok(M.validate(st),'带 rounds 应通过');
  st.metrics.rounds=-1;
  assert.equal(M.validate(st),false,'负数应拒绝');
});

/* ===== 动机题：风险扫描，不给分 ===== */
test('动机题有三道高频题，每题带提示',()=>{
  assert.equal(M.MOTIVE.questions.length,3);
  for(const q of M.MOTIVE.questions){
    assert.ok(q.q.length>5&&q.hint.length>10,q.id);
  }
});

test('动机题只返回风险标记，绝不返回分数或档位',()=>{
  const r=M.scanMotive('我上一份工作的领导水平不行，团队也混乱。');
  assert.equal(r.level,undefined,'动机题不该有档位');
  assert.equal(r.score,undefined,'动机题不该有分数');
  assert.ok(Array.isArray(r.flags));
  assert.ok(typeof r.riskCount==='number');
  assert.ok(r.headline.length>0);
});

test('贬低前雇主会被标出来，并给出可行动建议',()=>{
  const r=M.scanMotive('我上家公司领导不行，画饼严重，团队也混乱。');
  const m1=r.flags.find(f=>f.code==='M1');
  assert.ok(m1,'应命中 M1 贬低前雇主');
  assert.ok(m1.advice.length>10,'每条红旗都要给改法');
  assert.match(m1.advice,/事实/,'建议应指向「描述事实」');
});

test('全推外部、没提自己的选择会被标出来',()=>{
  const r=M.scanMotive('公司业务调整，整个部门都被裁了。');
  assert.ok(r.flags.some(f=>f.code==='M2'),'应命中 M2 归因外部');
});

test('只说不要什么、没说要什么会被标出来',()=>{
  const r=M.scanMotive('我不想再做重复性的工作了。');
  assert.ok(r.flags.some(f=>f.code==='M3'),'应命中 M3 说不出想要什么');
});

test('说不出岗位具体信息会被标成没做功课',()=>{
  const r=M.scanMotive('我觉得贵公司平台大，发展前景好，所以想来试试。');
  assert.ok(r.flags.some(f=>f.code==='M4'),'应命中 M4 没做功课');
});

test('健康回答不应误报任何红旗',()=>{
  const good='上一份工作我负责内部工具，做了两年，我想转到面向用户的产品，所以开始看机会。我了解到你们正在做企业协作工具，这块和我之前的经验比较接近。';
  const r=M.scanMotive(good);
  assert.equal(r.riskCount,0,'健康回答不该有红旗，实际：'+r.flags.map(f=>f.code).join(','));
  assert.match(r.headline,/没有明显风险/);
});

test('稳定性信号只在明确传入时才判定，不凭空猜测',()=>{
  const text='我最近换了两份工作。';
  assert.equal(M.scanMotive(text).flags.some(f=>f.code==='M5'),false,'没有上下文不该判 M5');
  assert.equal(M.scanMotive(text,{shortStints:true}).flags.some(f=>f.code==='M5'),true,'有上下文才判');
});

test('主动解释了短期变动的回答不再判稳定性风险',()=>{
  const text='最近两次变动是因为公司裁员，一次是业务线整体关停，一次是团队被合并。';
  const r=M.scanMotive(text,{shortStints:true});
  assert.equal(r.flags.some(f=>f.code==='M5'),false,'已给解释就不该再判 M5');
});

test('风险条数越多，结论语气越强',()=>{
  const one=M.scanMotive('我不想再做重复性工作。');
  const many=M.scanMotive('我上家公司领导不行，团队混乱，公司业务也有问题。');
  assert.ok(many.riskCount>one.riskCount);
  assert.notEqual(many.headline,one.headline);
});

test('指定维度子集时不追加动机题，只组行为题',()=>{
  const r=M.buildRound('owner',['D1','D3']);
  assert.equal(r.length,2);
  assert.ok(r.every(x=>x.kind==='behavior'));
});

test('小结里动机题单独一行，不计入达标统计',()=>{
  const sum=M.roundSummary([
    {dimensionId:'D1',level:'yes'},
    {dimensionId:'D2',level:'yes'},
    {dimensionId:'M',riskCount:2,nextStep:'改成描述事实'}
  ],'owner');
  assert.equal(sum.total,2,'动机题不应计入行为维度总数');
  assert.equal(sum.metCount,2);
  assert.ok(sum.motive,'应单独返回动机行');
  assert.equal(sum.motive.riskCount,2);
  assert.equal(sum.rows.some(r=>r.dimensionId==='M'),false,'动机题不应混进行为维度行');
});

test('行为维度全达标但动机题有风险时，结论要点出来',()=>{
  const sum=M.roundSummary([
    {dimensionId:'D1',level:'yes'},{dimensionId:'D2',level:'yes'},
    {dimensionId:'M',riskCount:3}
  ],'owner');
  assert.match(sum.headline,/都达标/);
  assert.match(sum.headline,/动机题有 3 处/,'行为维度全过也要提醒动机风险');
});

test('动机题没风险时不啰嗦',()=>{
  const sum=M.roundSummary([
    {dimensionId:'D1',level:'yes'},
    {dimensionId:'M',riskCount:0}
  ],'owner');
  assert.ok(!/动机题有/.test(sum.headline),'没有风险就不该提');
  assert.equal(sum.motive.riskCount,0);
});

test('没有动机题时小结照常工作',()=>{
  const sum=M.roundSummary([{dimensionId:'D1',level:'no'}],'owner');
  assert.equal(sum.motive,null);
  assert.equal(sum.total,1);
});

/* ===== H2 话术轮换 ===== */
test('话术优先给没听过的，避免连续两轮撞同一句',()=>{
  const used=['你刚才说的"我们"里，哪一部分是你亲自做的？'];
  const next=M.pickUtterance('G1',0,used);
  assert.notEqual(next,used[0],'已听过的句子不该再给');
});

test('全部听过时回到轮换，不能因为都听过就不给追问',()=>{
  const all=M.UTTERANCES.G2.slice();
  const r=M.pickUtterance('G2',0,all);
  assert.ok(r&&r.length>0,'都听过也要给一句');
  assert.ok(all.includes(r));
});

test('rememberUtterance 去重并限制长度',()=>{
  let list=[];
  list=M.rememberUtterance(list,'a');
  list=M.rememberUtterance(list,'a');
  assert.deepEqual(list,['a'],'重复不应追加');
  for(let i=0;i<250;i++)list=M.rememberUtterance(list,'x'+i);
  assert.equal(list.length,200,'最多保留 200 条');
});

test('存档接受 usedUtterances，且兼容没有该字段的旧数据',()=>{
  const st=M.empty();
  assert.ok(Array.isArray(st.usedUtterances),'新档应有空数组');
  st.usedUtterances=['一句'];
  assert.ok(M.validate(st));
  st.usedUtterances='不是数组';
  assert.equal(M.validate(st),false);
  const old=M.empty();delete old.usedUtterances;
  assert.ok(M.validate(old),'旧档没有该字段也要能读');
});

/* ===== F2 方法卡触发 ===== */
test('方法卡四张，每张都有触发时机和正文',()=>{
  // 只保留有真实检测来源的触发条件：写一个永远不成立的判定等于死代码
  assert.equal(M.CARDS.length,4);
  for(const c of M.CARDS){
    assert.ok(c.id&&c.title&&c.when&&c.body,c.id);
    assert.ok(c.body.length>30,c.id+' 正文要够说明白');
  }
});

test('方法卡按诊断价值排序：重复犯错优先于首次引导',()=>{
  // 同时满足两题无量化和其他条件时，先给量化
  assert.equal(M.pickCard({answeredCount:3,quantMissStreak:2,ownMissStreak:2}).id,'C2');
  // 复盘强否优先于首次引导
  assert.equal(M.pickCard({answeredCount:1,weaknessStrongNo:true}).id,'C6');
});

test('方法卡不该弹的时候绝不弹',()=>{
  assert.equal(M.pickCard({answeredCount:5}),null,'没有触发条件时不弹');
  assert.equal(M.pickCard({}),null,'空状态不弹');
});

test('看过的卡不再重复弹',()=>{
  assert.equal(M.pickCard({answeredCount:1,shown:['C1']}),null);
  assert.equal(M.pickCard({answeredCount:3,quantMissStreak:2,shown:['C2']}),null);
});

test('每张方法卡都有真实可触发的条件，不存在死卡',()=>{
  // 逐个用最小上下文触发，确保没有「定义了但永远不弹」的卡
  const contexts={
    C1:{answeredCount:1},
    C2:{answeredCount:3,quantMissStreak:2},
    C5:{answeredCount:3,ownMissStreak:2},
    C6:{answeredCount:3,weaknessStrongNo:true}
  };
  for(const c of M.CARDS){
    const ctx=contexts[c.id];
    assert.ok(ctx,c.id+' 缺少可触发它的上下文，可能是死卡');
    assert.equal(M.pickCard(ctx).id,c.id,c.id+' 应能被触发');
  }
  assert.equal(Object.keys(contexts).length,M.CARDS.length,'不应有多余的触发上下文');
});

/* ===== 面试轮次 ===== */
test('三个轮次各含不同维度，动机题只进 HR 面',()=>{
  assert.deepEqual(M.ROUND_IDS,['all','hr','business']);
  assert.deepEqual(M.dimensionsForRound('all'),['D1','D2','D3','D4','D5']);
  assert.deepEqual(M.dimensionsForRound('hr'),['D3','D4','D5']);
  assert.deepEqual(M.dimensionsForRound('business'),['D1','D2','D3','D4']);
  assert.equal(M.roundHasMotive('hr'),true);
  assert.equal(M.roundHasMotive('business'),false,'业务面不会问离职原因');
});

test('未知轮次回落到「都要练」，不崩也不给空卷',()=>{
  assert.deepEqual(M.dimensionsForRound('不存在'),['D1','D2','D3','D4','D5']);
  assert.ok(M.roundHasMotive('不存在'));
});

test('各轮次题数正确：HR 四题、业务面四题、都要练六题',()=>{
  assert.equal(M.roundSize('hr'),4);
  assert.equal(M.roundSize('business'),4);
  assert.equal(M.roundSize('all'),6);
  assert.equal(M.buildRound('owner',null,{round:'hr'}).length,4);
  assert.equal(M.buildRound('owner',null,{round:'business'}).length,4);
});

test('HR 轮不出业务判断题，业务轮不出动机题',()=>{
  const hr=M.buildRound('owner',null,{round:'hr'}).map(r=>r.dimensionId);
  assert.ok(!hr.includes('D1'),'HR 面不考业务判断');
  assert.ok(hr.includes('M'),'HR 面要考动机');
  const biz=M.buildRound('owner',null,{round:'business'}).map(r=>r.dimensionId);
  assert.ok(biz.includes('D1'),'业务面要考业务判断');
  assert.ok(!biz.includes('M'),'业务面不考动机');
});

/* ===== 带人状态 ===== */
test('没带过人时自我档位封顶在独当一面，岗位要求仍可更高',()=>{
  const noReports=M.resolveScale({years:'y2',jd:'',reports:'none'});
  assert.equal(noReports.selfStage,'owner','8 年没带过人不应算带人带事');
  const withTeam=M.resolveScale({years:'y2',jd:'',reports:'team'});
  assert.equal(withTeam.selfStage,'lead');
  // 岗位要求高于封顶值 → 冲高提示
  const stretch=M.resolveScale({years:'y2',jd:'带过团队，5 年以上',reports:'none'});
  assert.equal(stretch.selfStage,'owner');
  assert.equal(stretch.jobStage,'lead');
  assert.equal(stretch.flag,'stretch','没带过人但投管理岗应提示冲高');
});

test('没带过人时，三道管理题自动换成平级版本',()=>{
  for(const [dim,oldWord] of [['D3','两个团队'],['D4','参与的项目'],['D5','手上的事情']]){
    const alt=M.pickQuestion('lead',dim,{hasReports:false});
    assert.ok(alt.q.includes(oldWord),dim+' 应换成平级问法，实际：'+alt.q);
    assert.equal(alt.usingAlt,true,dim+' 应标记用了替代版本');
    assert.ok(alt.hint.length>10,dim+' 替代版本也要有找例子的提示');
  }
});

test('带过人时仍用原题，不做无谓替换',()=>{
  const q=M.pickQuestion('lead','D4',{hasReports:true});
  assert.match(q.q,/你带的人/, '带过人应保留管理版问法');
  assert.ok(!q.usingAlt);
  // 不传 hasReports 时也按原题（档位本身已暗示带人）
  assert.match(M.pickQuestion('lead','D4').q,/你带的人/);
});

test('替代版本只影响需要带人的那三题，其他题不受影响',()=>{
  const a=M.pickQuestion('lead','D1',{hasReports:false});
  const b=M.pickQuestion('lead','D1',{hasReports:true});
  assert.equal(a.q,b.q,'业务判断的 Q3 本来就不假设带人，不该被替换');
  const c=M.pickQuestion('owner','D4',{hasReports:false});
  assert.match(c.q,/判断后来被证明是错的/,'独当一面档的题不该被替换');
});

test('组卷时带人状态会传递到每一题',()=>{
  const round=M.buildRound('lead',null,{round:'all',hasReports:false});
  const d4=round.find(r=>r.dimensionId==='D4');
  assert.match(d4.question,/参与的项目/,'没带过人时组卷应使用平级版本');
});

test('存档接受 round 与 reports，并兼容旧数据',()=>{
  const st=M.empty();
  st.profile={years:'y1',jd:'',selfStage:'owner',jobStage:'owner',stageSource:'inferred',round:'hr',reports:'none'};
  assert.ok(M.validate(st));
  st.profile.round='不存在';
  assert.equal(M.validate(st),false);
  st.profile.round='hr';st.profile.reports='乱填';
  assert.equal(M.validate(st),false);
  const old=M.empty();
  old.profile={years:'y1',jd:'',selfStage:'owner',jobStage:'owner',stageSource:'inferred'};
  assert.ok(M.validate(old),'旧存档没有新字段也要能读');
});

/* ===== 画像守卫：静态检查，不需要浏览器 ===== */
test('凡需要带人的题都必须配不带人版，且替代问法里不能再出现管理措辞',()=>{
  const MGMT=/你带的人|你的下属|你管理的团队|你带的团队/;
  const need=[];
  for(const d of M.DIMENSIONS){
    for(const q of d.questions){
      if(!q.needsReports)continue;
      need.push(q.id);
      assert.ok(q.alt&&q.alt.length>10,q.id+' 需要带人，必须提供 alt 替代问法');
      assert.ok(q.altHint&&q.altHint.length>10,q.id+' 的替代问法也要有找例子的提示');
      assert.ok(!MGMT.test(q.alt),q.id+' 的替代问法里不该再出现管理措辞：'+q.alt);
    }
  }
  assert.deepEqual(need.sort(),['D3-Q3','D4-Q3','D5-Q3'],'目前只有这三题假设带人，新增时要同步补 alt');
});

test('没带过人时这三题全部换成平级问法',()=>{
  const MGMT=/你带的人|你的下属|你管理的团队|你带的团队/;
  for(const id of ['D3-Q3','D4-Q3','D5-Q3']){
    const dim=id.split('-')[0];
    const q=M.pickQuestion('lead',dim,{hasReports:false});
    assert.equal(q.id,id);
    assert.ok(!MGMT.test(q.q),id+' 换成平级版后不该有管理措辞：'+q.q);
    assert.equal(q.usingAlt,true,id+' 应标记用了替代版本');
  }
});

test('六种画像组合下，题目都不含不该有的管理措辞',()=>{
  const MGMT=/你带的人|你的下属|你管理的团队|你带的团队/;
  for(const round of ['all','hr','business']){
    for(const hasReports of [true,false]){
      const qs=M.buildRound('lead',null,{round,hasReports});
      if(hasReports)continue;  // 带过人时允许出现管理版
      for(const q of qs){
        if(q.kind==='motive')continue;
        assert.ok(!MGMT.test(q.question),`${round}/${hasReports} 的 ${q.dimensionId} 出现了管理措辞：${q.question}`);
      }
    }
  }
});

test('带过人时保留管理版问法，不做无谓替换',()=>{
  const qs=M.buildRound('lead',null,{round:'all',hasReports:true});
  const d4=qs.find(q=>q.dimensionId==='D4');
  assert.match(d4.question,/你带的人/,'带过团队应保留管理版问法');
});

test('小结能容忍结果里的空位，不崩溃',()=>{
  // 中途跳过或数据不完整时 results 里可能有 undefined，不能让整轮小结崩掉
  const sum=M.roundSummary([{dimensionId:'D1',level:'yes'},undefined,{dimensionId:'D3',level:'no'}],'owner');
  assert.equal(sum.total,2,'空位应被跳过');
  assert.equal(sum.metCount,1);
  assert.ok(sum.headline.length>0);
  assert.equal(M.roundSummary([undefined,null],'owner').total,0);
  assert.match(M.roundSummary([],'owner').headline,/还没有/);
});

/* ===== 阶段三：能力曲线 / 错题本 / 专项复练 / 故事库 ===== */
const mkSession=(id,date,qid,level,align,txt)=>({id,date,questionId:qid,question:'题',turns:[{answer:txt||'这是一段足够长的回答内容用于测试'}],verdict:{level,alignment:align,jobStage:'owner'},nextStep:'下一步'});

test('题号能解析出维度，动机题识别为 M',()=>{
  assert.equal(M.questionDimension('D2-Q3'),'D2');
  assert.equal(M.questionDimension('D1-Q1'),'D1');
  assert.equal(M.questionDimension('M-Q1'),'M');
  assert.equal(M.questionDimension(''),'');
});

test('能力曲线按维度分组并按时间排序，算出进步量',()=>{
  const ss=[
    mkSession('a','2026-10-22T10:00:00Z','D2-Q2','neutral','below'),
    mkSession('b','2026-10-20T10:00:00Z','D2-Q2','no','below'),
    mkSession('c','2026-10-24T10:00:00Z','D2-Q3','yes','met')
  ];
  const d2=M.progressSeries(ss,'owner').find(x=>x.dimensionId==='D2');
  assert.equal(d2.count,3);
  assert.deepEqual(d2.points.map(p=>p.level),['no','neutral','yes'],'必须按时间排序，不能按传入顺序');
  assert.equal(d2.first,1);
  assert.equal(d2.latest,3);
  assert.equal(d2.delta,2);
});

test('能力曲线不统计动机题，空维度返回空点',()=>{
  const ss=[mkSession('a','2026-10-20T10:00:00Z','M-Q1','neutral','met')];
  const series=M.progressSeries(ss,'owner');
  assert.ok(series.every(s=>s.count===0),'动机题没有档位，不该进曲线');
  const d1=series.find(s=>s.dimensionId==='D1');
  assert.equal(d1.latest,null);
  assert.equal(d1.delta,0);
});

test('错题本只列未达标的题，同题只留最近一次',()=>{
  const ss=[
    mkSession('a','2026-10-20T10:00:00Z','D2-Q2','no','below'),
    mkSession('b','2026-10-22T10:00:00Z','D2-Q2','yes','met'),   // 同题后来达标了
    mkSession('c','2026-10-21T10:00:00Z','D1-Q2','no','below')
  ];
  const rows=M.mistakes(ss,'owner');
  assert.equal(rows.length,1,'D2-Q2 最新已达标，不该出现在错题本');
  assert.equal(rows[0].questionId,'D1-Q2');
  assert.equal(rows[0].gap,2);
});

test('错题本按「差几档」排序，差距大的在前面',()=>{
  const ss=[
    mkSession('a','2026-10-20T10:00:00Z','D1-Q2','neutral','below'), // 差1
    mkSession('b','2026-10-21T10:00:00Z','D2-Q2','no','below')       // 差2
  ];
  const rows=M.mistakes(ss,'owner');
  assert.deepEqual(rows.map(r=>r.questionId),['D2-Q2','D1-Q2']);
});

test('专项复练是同一维度三个难度各一题',()=>{
  const qs=M.drillRound('D2','owner',{hasReports:true});
  assert.equal(qs.length,3);
  assert.ok(qs.every(q=>q.dimensionId==='D2'));
  assert.ok(qs.every(q=>q.drill===true));
  assert.deepEqual(qs.map(q=>M.stageName(q.minStage)),['执行者','独当一面','带人带事']);
  assert.equal(new Set(qs.map(q=>q.questionId)).size,3,'三道题不能重复');
});

test('专项复练尊重「没带过人」，不出管理题',()=>{
  const qs=M.drillRound('D4','lead',{hasReports:false});
  assert.ok(qs.every(q=>!/你带的人/.test(q.question)),'专项复练也要换平级版本');
});

test('专项复练的小结文案按「题」说，不按「维度」说',()=>{
  const rows=[{dimensionId:'D2',level:'yes'},{dimensionId:'D2',level:'yes'},{dimensionId:'D2',level:'yes'}];
  const sum=M.roundSummary(rows,'owner');
  assert.match(sum.headline,/这个维度/);
  assert.match(sum.headline,/3 道题/);
  assert.ok(!/3 个维度/.test(sum.headline),'不能把三道同维度的题说成三个维度');
});

test('stage_gap：声称带人但零达标时给出提示',()=>{
  const ss=[mkSession('a','2026-10-20T10:00:00Z','D2-Q2','no','below'),mkSession('b','2026-10-21T10:00:00Z','D1-Q2','no','below'),mkSession('c','2026-10-22T10:00:00Z','D3-Q2','neutral','below')];
  const g=M.stageGap(ss,{reports:'team'});
  assert.ok(g,'应给出提示');
  assert.match(g.detail,/更高的期待/);
});

test('stage_gap 不该误报：没带人 / 样本不足 / 有达标',()=>{
  const ss=[mkSession('a','2026-10-20T10:00:00Z','D2-Q2','no','below'),mkSession('b','2026-10-21T10:00:00Z','D1-Q2','no','below'),mkSession('c','2026-10-22T10:00:00Z','D3-Q2','no','below')];
  assert.equal(M.stageGap(ss,{reports:'none'}),null,'没带人不该提示');
  assert.equal(M.stageGap(ss.slice(0,2),{reports:'team'}),null,'样本不足不该下结论');
  assert.equal(M.stageGap(ss.concat([mkSession('d','2026-10-23T10:00:00Z','D2-Q3','yes','met')]),{reports:'team'}),null,'有达标就不该提示');
});

test('故事库：从一次诊断能提取故事并打上维度与缺口',()=>{
  const s1=mkSession('a','2026-10-20T10:00:00Z','D2-Q2','no','below','我们团队一起做了个跨部门项目，中间遇到很多困难，最后成功了。');
  s1.verdict.gaps=[{code:'G1'},{code:'G4'}];
  const st=M.storyFromSession(s1);
  assert.ok(st);
  assert.deepEqual(st.dimensions,['D2']);
  assert.deepEqual(st.gaps,['G1','G4']);
  assert.equal(st.sourceSessionId,'a');
  assert.ok(M.validStory(st));
});

test('故事库：太短的回答不值得存',()=>{
  const s1=mkSession('a','2026-10-20T10:00:00Z','D2-Q2','no','below','太短');
  assert.equal(M.storyFromSession(s1),null);
});

test('故事×问题矩阵只按已打标签算，不猜',()=>{
  const st={id:'x',title:'t',text:'内容内容内容内容内容内容',dimensions:['D2'],gaps:[],createdAt:'2026-10-20',updatedAt:'2026-10-20'};
  const mtx=M.storyMatrix(st);
  assert.equal(mtx.length,3,'D2 有三道题');
  assert.ok(mtx.every(x=>x.dimensionId==='D2'));
  assert.deepEqual(M.storyMatrix({...st,dimensions:[]}),[],'没打标签就不该匹配任何题');
});

test('故事校验拒绝非法维度、超长与缺字段',()=>{
  const base={id:'x',title:'t',text:'内容',dimensions:['D2'],gaps:[],createdAt:'a',updatedAt:'b'};
  assert.ok(M.validStory(base));
  assert.equal(M.validStory({...base,dimensions:['D9']}),false,'非法维度要拒绝');
  assert.equal(M.validStory({...base,dimensions:['D1','D2','D3','D4','D5','D1']}),false,'超过 5 个标签要拒绝');
  assert.equal(M.validStory({...base,text:''}),true,'空正文目前允许（用户可能先建后填）');
  assert.equal(M.validStory({...base,title:undefined}),false);
});

test('存档接受 stories 并兼容旧数据',()=>{
  const st=M.empty();
  assert.ok(Array.isArray(st.stories));
  st.stories=[{id:'s1',title:'t',text:'内容',dimensions:['D2'],gaps:[],createdAt:'a',updatedAt:'b'}];
  assert.ok(M.validate(st));
  st.stories=[{id:'bad'}];
  assert.equal(M.validate(st),false);
  const old=M.empty();delete old.stories;
  assert.ok(M.validate(old),'旧存档没有 stories 也要能读');
});

/* ===== 阶段四：校招赛道 ===== */
test('两个赛道，校招用另一套档位名',()=>{
  assert.deepEqual(M.TRACK_IDS,['experienced','campus']);
  assert.equal(M.stageName('owner','experienced'),'独当一面');
  assert.equal(M.stageName('owner','campus'),'有项目');
  assert.equal(M.stageName('lead','campus'),'能独立');
  assert.equal(M.stageName('executor','campus'),'起步');
  // 不传赛道默认社招
  assert.equal(M.stageName('owner'),'独当一面');
});

test('五个维度都有校招题库，题目与社招不重复',()=>{
  for(const d of M.DIMENSIONS){
    assert.equal(d.campusQuestions.length,3,d.id+' 校招应有三题');
    const campusTexts=d.campusQuestions.map(q=>q.q);
    const expTexts=d.questions.map(q=>q.q);
    for(const t of campusTexts){
      assert.ok(!expTexts.includes(t),d.id+' 校招题不应与社招题完全相同');
      assert.ok(!/你带的人|下属/.test(t),d.id+' 校招题不该出现管理措辞');
    }
  }
});

test('校招按经历档选难度，不按工作年限',()=>{
  assert.equal(M.inferCampusStage('e0'),'executor');
  assert.equal(M.inferCampusStage('e1'),'owner');
  assert.equal(M.inferCampusStage('e2'),'owner');
  assert.equal(M.inferCampusStage('e3'),'lead');
  assert.equal(M.inferCampusStage('不存在'),'owner');
  assert.equal(M.pickQuestion('executor','D2',{track:'campus'}).id,'D2-C1');
  assert.equal(M.pickQuestion('owner','D2',{track:'campus'}).id,'D2-C2');
  assert.equal(M.pickQuestion('lead','D2',{track:'campus'}).id,'D2-C3');
});

test('校招动机题不提「上一份工作」',()=>{
  assert.equal(M.MOTIVE.campusQuestions.length,3);
  for(const q of M.MOTIVE.campusQuestions)assert.ok(!/上一份工作|离职/.test(q.q),'校招不该问离职');
  assert.match(M.MOTIVE.campusQuestions[0].q,/行业/);
});

test('校招 JD 不把「校招 / 应届 / 培训生」当成低职级',()=>{
  // 社招逻辑里「校招」会被判成执行者，校招逻辑里不该
  assert.equal(M.inferJobStage('2027届校招，产品经理培训生','','experienced'),'executor');
  assert.equal(M.inferJobStage('2027届校招，产品经理培训生','','campus'),'owner');
  assert.equal(M.inferJobStage('管培生项目','','campus'),'lead');
});

test('校招标尺：实习经历投校招岗，不会误报「岗位低于你的经验」',()=>{
  const s=M.resolveScale({track:'campus',exp:'e2',jd:'2027届校招，产品经理培训生'});
  assert.equal(s.selfStage,'owner');
  assert.equal(s.jobStage,'owner');
  assert.equal(s.flag,'match','实习投校招应是匹配，不是降级');
});

test('校招一轮六题，全部使用校招问法',()=>{
  const round=M.buildRound('owner',null,{round:'all',track:'campus'});
  assert.equal(round.length,6);
  for(const q of round){
    if(q.kind==='motive'){assert.match(q.question,/行业/,'校招动机题应问行业');continue;}
    assert.match(q.questionId,/-C\d$/,'校招题号应以 -C 结尾：'+q.questionId);
  }
});

test('校招专项复练也走校招题库',()=>{
  const qs=M.drillRound('D2','owner',{track:'campus'});
  assert.equal(qs.length,3);
  assert.ok(qs.every(q=>/-C\d$/.test(q.questionId)),'专项复练应用校招题');
});

test('校招小结显示校招档位名',()=>{
  const sum=M.roundSummary([{dimensionId:'D1',level:'no'}],'owner','campus');
  assert.equal(sum.rows[0].jobStageName,'有项目');
});

/* ===== 多轮上下文与跨故事一致性 ===== */
const STORY_A='我推动三个部门共用一套指标，财务明确反对，我拿两周灰度数据说服他先试一个部门，对账时间从三天变成半天。';
const STORY_B='我推动三个部门共用一套指标，财务一开始反对，我拿两周的灰度数据说服他先试一个部门，对账时间从三天变成半天，后来推广了。';
const STORY_C='我在课程项目里负责前端开发，用 React 搭了组件库，最后拿了优秀作业。';

test('文本相似度：同一段经历高、不同经历低',()=>{
  assert.ok(M.similarity(STORY_A,STORY_B)>0.7,'同一段改写应高度相似');
  assert.ok(M.similarity(STORY_A,STORY_C)<0.2,'不同经历应几乎不相似');
});

test('轮内重复用同一个故事会被识别',()=>{
  const rep=M.repeatedStory([{questionId:'D2-Q2',answer:STORY_A}],STORY_B);
  assert.ok(rep,'应识别出重复');
  assert.equal(rep.questionId,'D2-Q2');
  assert.ok(rep.similarity>=0.5);
});

test('正常的另一个故事不会被误报成重复',()=>{
  assert.equal(M.repeatedStory([{questionId:'D2-Q2',answer:STORY_A}],STORY_C),null);
});

test('太短的回答不参与重复检测，避免误判',()=>{
  assert.equal(M.repeatedStory([{questionId:'D2-Q2',answer:STORY_A}],'我做了个项目。'),null);
});

test('跨故事一致性：同段经历数字对不上会报出来',()=>{
  const s1={id:'a',title:'推动指标统一',text:STORY_A,dimensions:['D2'],gaps:[],createdAt:'x',updatedAt:'x'};
  const s2={id:'b',title:'推动指标统一（另一版）',text:'我推动三个部门共用一套指标，财务明确反对，我拿三周灰度数据说服他先试两个部门，对账时间从五天变成一天。',dimensions:['D2'],gaps:[],createdAt:'x',updatedAt:'x'};
  const c=M.storyConflicts([s1,s2]);
  assert.equal(c.length,1);
  assert.ok(c[0].numbers.length>=2);
  assert.ok(c[0].numbers.includes('三周'));
});

test('跨故事一致性：数字一致或不是同一段经历时不报',()=>{
  const s1={id:'a',title:'x',text:STORY_A,dimensions:['D2'],gaps:[],createdAt:'x',updatedAt:'x'};
  const same={id:'b',title:'y',text:STORY_A.replace('我推动','我还推动'),dimensions:['D2'],gaps:[],createdAt:'x',updatedAt:'x'};
  assert.deepEqual(M.storyConflicts([s1,same]),[],'数字一致不该报');
  const other={id:'c',title:'z',text:STORY_C,dimensions:['D1'],gaps:[],createdAt:'x',updatedAt:'x'};
  assert.deepEqual(M.storyConflicts([s1,other]),[],'不同经历不该比');
});

test('中文数量也能被识别为差异，不只阿拉伯数字',()=>{
  const a={id:'1',title:'x',text:'我拿两周数据说服了财务，最后试点两个部门。',dimensions:['D2'],gaps:[],createdAt:'x',updatedAt:'x'};
  const b={id:'2',title:'y',text:'我拿三周数据说服了财务，最后试点两个部门。',dimensions:['D2'],gaps:[],createdAt:'x',updatedAt:'x'};
  const c=M.storyConflicts([a,b]);
  assert.equal(c.length,1);
  assert.ok(c[0].numbers.includes('两周')||c[0].numbers.includes('三周'));
});
