const {test}=require('node:test'),assert=require('node:assert/strict');
const {runAi}=require('../ai-service.js');

// 受控模型：把模型返回固定成我们想看的内容，验证契约而不是验证模型。
function cfgOf(content,{fail}={}){
  const cfg={baseUrl:'https://example.test/v1',model:'fake-model',apiKey:'test-key',timeoutMs:5000};
  cfg.transport=async()=>{
    if(fail)throw Object.assign(new Error('模型失败'),{status:502});
    return {model:'fake-model',usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30},choices:[{message:{content:JSON.stringify(content)}}]};
  };
  return cfg;
}

const ANSWER='我们团队一起做了个跨部门项目，中间遇到很多困难，最后成功了，领导很认可。';

test('method-probe 只做措辞润色，返回追问与逐字依据',async()=>{
  const cfg=cfgOf({probe:'你说的"我们"里，哪一部分是你亲自做的？',quote:'我们团队一起做了个跨部门项目'});
  const out=await runAi('method-probe',{gap:'G1',base:'你刚才说的"我们"里，哪一部分是你亲自做的？',answer:ANSWER,history:[]},cfg);
  assert.equal(out.result.probe,'你说的"我们"里，哪一部分是你亲自做的？');
  assert.equal(out.result.quote,'我们团队一起做了个跨部门项目');
  assert.ok(out.meta.model);
});

test('method-probe 拒绝不在回答里的依据，防止模型自己编原话',async()=>{
  const cfg=cfgOf({probe:'你亲自做了什么？',quote:'我主导了整个跨部门项目'});
  await assert.rejects(()=>runAi('method-probe',{gap:'G1',base:'x',answer:ANSWER,history:[]},cfg),/追问依据不在回答中/);
});

test('method-probe 拒绝引入回答里没有的数字，这是最需要防的编造',async()=>{
  const cfg=cfgOf({probe:'你说的提升 40% 是怎么算的？',quote:'我们团队一起做了个跨部门项目'});
  await assert.rejects(()=>runAi('method-probe',{gap:'G4',base:'这个结果有数字吗？',answer:ANSWER,history:[]},cfg),/追问引入了回答中没有的数字/);
});

test('回答里本来就有数字时，追问可以复用',async()=>{
  const answer='我推动三个部门共用一套指标，对账时间从三天降到半天。';
  const cfg=cfgOf({probe:'半天是怎么算出来的？',quote:'对账时间从三天降到半天'});
  const out=await runAi('method-probe',{gap:'G4',base:'这个结果有数字吗？',answer,history:[]},cfg);
  assert.equal(out.result.probe,'半天是怎么算出来的？');
});

test('method-probe 拒绝重复已问过的追问，避免同一题反复问同一句',async()=>{
  const cfg=cfgOf({probe:'你亲自做了什么？',quote:'我们团队一起做了个跨部门项目'});
  await assert.rejects(()=>runAi('method-probe',{gap:'G1',base:'x',answer:ANSWER,history:['你亲自做了什么？']},cfg),/追问与已有问题重复/);
});

test('method-probe 拒绝未知缺口类型，避免客户端传错还能过',async()=>{
  const cfg=cfgOf({probe:'x',quote:'我们团队'});
  await assert.rejects(()=>runAi('method-probe',{gap:'G9',base:'x',answer:ANSWER,history:[]},cfg),/未知的缺口类型/);
});

test('method-probe 拒绝过长追问，保持现场口语感',async()=>{
  const cfg=cfgOf({probe:'你'.repeat(201),quote:'我们团队一起做了个跨部门项目'});
  await assert.rejects(()=>runAi('method-probe',{gap:'G1',base:'x',answer:ANSWER,history:[]},cfg),/追问为空或超过长度限制/);
});

test('追问历史超长时拒绝，防止无界输入',async()=>{
  const cfg=cfgOf({probe:'x',quote:'我们团队'});
  await assert.rejects(()=>runAi('method-probe',{gap:'G1',base:'x',answer:ANSWER,history:['a','b','c','d','e']},cfg),/追问历史过长/);
});

test('模型失败时向上抛错，由客户端静默回退到规则底稿',async()=>{
  const cfg=cfgOf(null,{fail:true});
  await assert.rejects(()=>runAi('method-probe',{gap:'G1',base:'x',answer:ANSWER,history:[]},cfg));
});

test('method-probe 不进入面试评价分支，不产出分数',async()=>{
  const cfg=cfgOf({probe:'你亲自做了什么？',quote:'我们团队一起做了个跨部门项目'});
  const out=await runAi('method-probe',{gap:'G1',base:'x',answer:ANSWER,history:[]},cfg);
  assert.equal(out.result.scores,undefined,'追问任务不应返回评分');
  assert.equal(out.meta.interviewer,undefined);
});

/* ===== 回答改写 method-rewrite ===== */
const RW_ANSWER='我们团队一起做了个跨部门项目，中间遇到很多困难，最后成功了。我拿了两周的灰度数据给财务看，对账时间从三天变成半天，他同意先试一个部门。';
const rwCfg=payload=>{
  const cfg={baseUrl:'https://example.test/v1',model:'fake',apiKey:'k',timeoutMs:5000};
  cfg.transport=async()=>({model:'fake',choices:[{message:{content:JSON.stringify(payload)}}]});
  return cfg;
};

test('改写只重排原话时通过，并给出覆盖率',async()=>{
  const out=await runAi('method-rewrite',{answer:RW_ANSWER,level:'no',gaps:['取舍']},rwCfg({
    rewritten:'我拿了两周的灰度数据给财务看，对账时间从三天变成半天，他同意先试一个部门。这是跨部门项目，中间遇到很多困难，最后成功了。',
    sentences:[
      {text:'我拿了两周的灰度数据给财务看，对账时间从三天变成半天，他同意先试一个部门。',from:'我拿了两周的灰度数据给财务看，对账时间从三天变成半天，他同意先试一个部门'},
      {text:'这是跨部门项目，中间遇到很多困难，最后成功了。',from:'我们团队一起做了个跨部门项目，中间遇到很多困难，最后成功了'}
    ]
  }));
  assert.ok(out.result.coverage>0.8,'正常重排覆盖率应较高');
  assert.equal(out.result.rewritten.includes('40%'),false);
});

test('改写里出现原文没有的数字必须拒绝',async()=>{
  await assert.rejects(()=>runAi('method-rewrite',{answer:RW_ANSWER,level:'no',gaps:[]},rwCfg({
    rewritten:'我拿了两周灰度数据，效率提升了 40%。',
    sentences:[{text:'我拿了两周灰度数据，效率提升了 40%。',from:''}]
  })),/改写出现原文没有的数字/);
});

test('改写里出现原文没有的英文名词必须拒绝',async()=>{
  await assert.rejects(()=>runAi('method-rewrite',{answer:RW_ANSWER,level:'no',gaps:[]},rwCfg({
    rewritten:'我用 Tableau 做了看板。',
    sentences:[{text:'我用 Tableau 做了看板。',from:''}]
  })),/改写出现原文没有的名词/);
});

test('改写里出现原文没有的中文数量必须拒绝',async()=>{
  await assert.rejects(()=>runAi('method-rewrite',{answer:RW_ANSWER,level:'no',gaps:[]},rwCfg({
    rewritten:'我主导了三次跨部门评审。',
    sentences:[{text:'我主导了三次跨部门评审。',from:''}]
  })),/改写出现原文没有的数量/);
});

test('模型伪造原文引用必须拒绝',async()=>{
  await assert.rejects(()=>runAi('method-rewrite',{answer:RW_ANSWER,level:'no',gaps:[]},rwCfg({
    rewritten:'我主导了整个跨部门项目。',
    sentences:[{text:'我主导了整个跨部门项目。',from:'我主导了整个跨部门项目'}]
  })),/改写引用了原文中不存在的内容/);
});

test('不编数字名词、只编事实时，靠覆盖率兜底拦住',async()=>{
  await assert.rejects(()=>runAi('method-rewrite',{answer:RW_ANSWER,level:'no',gaps:[]},rwCfg({
    rewritten:'我拿了两周的灰度数据给财务看，对账时间从三天变成半天。他当场拍板，还主动要求把这个方案推广到全公司所有业务线，并且写进了年度规划。',
    sentences:[
      {text:'我拿了两周的灰度数据给财务看，对账时间从三天变成半天。',from:'我拿了两周的灰度数据给财务看，对账时间从三天变成半天'},
      {text:'他当场拍板，还主动要求把这个方案推广到全公司所有业务线，并且写进了年度规划。',from:''}
    ]
  })),/覆盖率/);
});

test('未知事实用占位符表达时允许通过',async()=>{
  const out=await runAi('method-rewrite',{answer:RW_ANSWER,level:'no',gaps:[]},rwCfg({
    rewritten:'我拿了两周的灰度数据给财务看，对账时间从三天变成半天。【待补充：当时财务具体担心什么】',
    sentences:[
      {text:'我拿了两周的灰度数据给财务看，对账时间从三天变成半天。',from:'我拿了两周的灰度数据给财务看，对账时间从三天变成半天'},
      {text:'【待补充：当时财务具体担心什么】',from:''}
    ]
  }));
  assert.match(out.result.rewritten,/待补充/);
});

test('逐句说明必须与改写内容一致，防止模型漏报句子',async()=>{
  await assert.rejects(()=>runAi('method-rewrite',{answer:RW_ANSWER,level:'no',gaps:[]},rwCfg({
    rewritten:'我拿了两周的灰度数据给财务看。另外我还推动了组织变革。',
    sentences:[{text:'我拿了两周的灰度数据给财务看。',from:'我拿了两周的灰度数据给财务看'}]
  })),/逐句说明与改写不一致/);
});

test('改写不产出评分或档位',async()=>{
  const out=await runAi('method-rewrite',{answer:RW_ANSWER,level:'no',gaps:[]},rwCfg({
    rewritten:'我拿了两周的灰度数据给财务看。',
    sentences:[{text:'我拿了两周的灰度数据给财务看。',from:'我拿了两周的灰度数据给财务看'}]
  }));
  assert.equal(out.result.scores,undefined);
  assert.equal(out.result.level,undefined);
});
