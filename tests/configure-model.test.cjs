const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createModelStore,BUILTIN}=require('../model-store');
const {configureModel}=require('../scripts/configure-model.cjs');
const candidate={apiKey:'new-test-key',model:'configured-model',baseUrl:'https://example.com/v1'};
function sandbox(fn){return async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'zhimian-configure-test-'));
 let store;
 try{
  fs.writeFileSync(path.join(root,'server.config.json'),JSON.stringify(candidate));
  store=createModelStore(path.join(root,'data'));
  const target=store.list(BUILTIN).find(p=>p.preset==='deepseek');
  store.save(BUILTIN,{apiKey:'original-test-key',enabled:true},target.id);
  store.markChecked(BUILTIN,target.id);store.markTested(BUILTIN,target.id);store.select('alice',target.id);
  await fn(root,store,target.id);
 }finally{store?.close();fs.rmSync(root,{recursive:true,force:true});}
};}
test('configuration verifies an isolated disabled candidate and only then enables the exact tested configuration',sandbox(async(root,store,id)=>{
 const before=store.connection(BUILTIN,id),calls=[],logs=[];
 const saved=await configureModel({root,log:s=>logs.push(s),serviceOptions:{checkEndpoint:async url=>assert.equal(url,candidate.baseUrl),transport:async(c,body,operation)=>{
  assert.deepEqual(store.connection(BUILTIN,id),before); // Existing connection stays usable throughout validation.
  assert.equal(c.enabled,false);assert.equal(c.apiKey,candidate.apiKey);assert.equal(c.baseUrl,candidate.baseUrl);assert.equal(c.model,candidate.model);
  calls.push(operation||'generate');
  if(operation==='models')return {data:[{id:candidate.model}]};
  assert.equal(body.response_format.type,'json_object');
  return {model:'actual-served-model',choices:[{message:{content:'{"ok":true}'}}]};
 }}});
 assert.deepEqual(calls,['models','generate']);assert.equal(saved.id,id);assert.equal(saved.enabled,true);assert.ok(saved.checkedAt);assert.ok(saved.testedAt);
 assert.equal(store.connection(BUILTIN,id).apiKey,candidate.apiKey);assert.equal(saved.model,candidate.model);assert.equal(saved.baseUrl,candidate.baseUrl);assert.equal(store.selected('alice'),id);
 assert.ok(logs.some(s=>s.includes('JSON 输出验证通过 · model = actual-served-model')));assert.ok(logs.every(s=>!s.includes(candidate.apiKey)));
}));
for(const failure of ['connection','missing-model','invalid-json'])test('failed '+failure+' validation preserves original configuration and user selection',sandbox(async(root,store,id)=>{
 const before=store.connection(BUILTIN,id),logs=[],calls=[];
 await assert.rejects(configureModel({root,log:s=>logs.push(s),serviceOptions:{checkEndpoint:async()=>{},transport:async(c,body,operation)=>{
  calls.push(operation||'generate');
  if(failure==='connection')throw Error('test connection failure');
  if(operation==='models')return {data:failure==='missing-model'?[]:[{id:candidate.model}]};
  return {choices:[{message:{content:'{"ok":false}'}}]};
 }}}));
 assert.deepEqual(store.connection(BUILTIN,id),before);assert.equal(store.selected('alice'),id);
 assert.equal(calls.length,failure==='invalid-json'?2:1);assert.ok(logs.every(s=>!s.includes('已保存并启用')));
}));
test('a failed first configuration cannot create an enabled legacy connection',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'zhimian-configure-first-'));let store;
 try{
  fs.writeFileSync(path.join(root,'server.config.json'),JSON.stringify(candidate));
  await assert.rejects(configureModel({root,log:()=>{},serviceOptions:{checkEndpoint:async()=>{},transport:async()=>{throw Error('unavailable');}}}));
  store=createModelStore(path.join(root,'data'));assert.equal(store.list(BUILTIN).length,3);assert.ok(store.list(BUILTIN).every(p=>!p.enabled&&!p.hasKey));
 }finally{store?.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('CLI exits nonzero on configuration failure without printing success',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'zhimian-configure-cli-'));
 try{
  fs.mkdirSync(path.join(root,'scripts'));
  for(const name of ['model-store.js','model-service.js','model-network.js','ai-service.js','interview-policy.js'])fs.copyFileSync(path.join(__dirname,'..',name),path.join(root,name));
  const script=path.join(root,'scripts/configure-model.cjs');fs.copyFileSync(path.join(__dirname,'../scripts/configure-model.cjs'),script);
  fs.writeFileSync(path.join(root,'server.config.json'),JSON.stringify({}));
  const run=spawnSync(process.execPath,[script],{encoding:'utf8'});
  assert.equal(run.status,1);assert.match(run.stderr,/未配置 API Key/);assert.doesNotMatch(run.stdout,/已保存并启用/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
