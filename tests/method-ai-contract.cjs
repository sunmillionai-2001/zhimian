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
