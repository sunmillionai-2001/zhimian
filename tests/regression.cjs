const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function engine() {
  const els = { mockJd: { value: '' }, mockRole: { value: 'auto' }, mockKeywords: {}, mockStorageMsg: {} };
  let stored = new Map(), failWrite = false;
  const ctx = vm.createContext({ document: { getElementById: id => els[id] }, localStorage: {
    getItem: k => stored.get(k) ?? null,
    setItem: (k,v) => { if (failWrite) throw new Error('quota'); stored.set(k,v); }
  }, InterviewPolicy:require('../interview-policy'),FormalInterview:{setStageMode(){},refreshHome(){}},Date, crypto: require('node:crypto').webcrypto });
  vm.runInContext(script.slice(script.indexOf('  const QUIZ_BANK'), script.indexOf("  document.getElementById('mockSample')")), ctx);
  return { els, stored, run: s => vm.runInContext(s, ctx), fail: () => { failWrite = true; } };
}
test('inline JS compiles', () => new vm.Script(script));
test('product JD never fills technical questions; all supported counts are complete', () => {
  const e = engine();e.els.mockJd.value = '产品经理\n用户需求分析、PRD、团队协作';
  e.run('parseJd()');
  for (const n of [5,8,12]) {
    const topics = e.run(`mockCount=${n};buildQuestions().map(q=>q.topic)`);
    assert.equal(topics.length,n);
    assert.ok(topics.includes('产品思维'));
    assert.ok(!topics.some(t=>['Redis','MySQL','Java / JVM','Python'].includes(t)));
    assert.equal(topics.at(-1),'收尾 · 反问');
  }
});
test('changed JD clears stale keywords; empty/unknown JD uses only general questions', () => {
  const e = engine();e.els.mockJd.value='后端开发\nJava Redis MySQL';e.run('parseJd()');
  assert.ok(e.run('mockFound.includes("Redis")'));
  e.els.mockJd.value='销售经理\n客户拜访';e.run('parseJd()');assert.equal(e.run('mockFound.length'),0);
  e.els.mockJd.value='';e.run('parseJd()');assert.equal(e.run('buildQuestions().some(q=>q.topic==="Redis")'),false);
});
test('role selector rejects unrelated skills mentioned in a JD',()=>{
  const e=engine();e.els.mockJd.value='产品经理：与后端团队协作，了解 Java Redis';e.run('parseJd()');
  assert.equal(e.run('mockFound.includes("Redis")'),false);
  e.els.mockRole.value='后端';e.run('parseJd()');assert.equal(e.run('mockFound.includes("Redis")'),true);
});
test('legacy summaries survive migration without deleting the old storage key',()=>{
  const e=engine(),raw=JSON.stringify([{date:'2026/10/12',count:8,rate:'良好',keywords:['Redis']}]);
  e.stored.set('zm_mock_history',raw);e.run('loadMockStore()');
  assert.equal(e.run('mockStore.records[0].legacy'),true);
  assert.equal(e.run('validStore(mockStore)'),true);
  assert.equal(e.stored.get('zm_mock_history'),raw);
});
test('corrupt storage is retained and writes are blocked; quota failure never reports success',()=>{
  const e=engine();e.stored.set('zm_mock_store_v2','{broken');e.run('loadMockStore()');
  assert.equal(e.run('writeMockStore(mockStore)'),false);assert.equal(e.stored.get('zm_mock_store_v2'),'{broken');
  const q=engine();q.fail();assert.equal(q.run('writeMockStore(mockStore)'),false);assert.match(q.els.mockStorageMsg.textContent,/保存失败/);
});
test('backup validation rejects broken answer counts and allows escaped text as data',()=>{
  const e=engine();e.run(`mockQuestions=buildQuestions();mockAnswers=mockQuestions.map(()=>'<img src=x onerror=alert(1)>');mockSession={schemaVersion:2,id:'test',date:new Date().toISOString(),jd:'JD',role:'通用',count:mockQuestions.length,keywords:[],durations:mockQuestions.map(()=>0),status:'report'};`);
  assert.equal(e.run('validRecord(snapshot(),true)'),true);
  assert.equal(e.run('reportHtml(snapshot()).includes("<img src=x")'),false);
  assert.equal(e.run('validRecord({...snapshot(),answers:[]})'),false);
});
test('complete history keeps more than eight sessions and a failed save retains the draft',()=>{
  const e=engine();
  e.run(`mockQuestions=buildQuestions();mockAnswers=mockQuestions.map(()=> '完整回答');
    for(let i=0;i<10;i++){mockSession={schemaVersion:2,id:'session-'+i,date:new Date().toISOString(),jd:'JD',role:'通用',count:mockQuestions.length,keywords:[],durations:mockQuestions.map(()=>0),status:'report'};saveMock();}`);
  assert.equal(e.run('mockStore.records.length'),10);
  assert.equal(e.run('mockStore.records[9].answers[0]'),'完整回答');
  e.run(`mockSession={...mockStore.records[0],id:'pending',status:'report'};persistDraft();`);
  e.fail();e.run('saveMock()');
  assert.equal(e.run('mockSession.status'),'report');
  assert.equal(e.run('mockStore.draft.id'),'pending');
  assert.equal(e.run('mockStore.records.length'),10);
});
let temp, child, port;
function request(url, method='GET', body, headers={}) {
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,path:url,method,headers},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>resolve({status:res.statusCode,data}));});
    req.on('error',reject);req.end(body);
  });
}
before(async()=>{
  temp=fs.mkdtempSync(path.join(os.tmpdir(),'zhimian-test-'));
  for(const f of ['skill-learning.js','server.js','auth-store.js','model-store.js','model-network.js','model-service.js','review-store.js','real-review-model.js','real-review-ui.js','mock-voice.js','voice-recorder-worklet.js','ai-service.js','interview-policy.js','formal-interview.js','resume-navigation.js','resume-library.js','document-import.js','document-worker.js'])fs.copyFileSync(path.join(root,f),path.join(temp,f));
  for(const f of ['app.html','index.html','index-sidebar.html'])fs.writeFileSync(path.join(temp,f),'test page');
  fs.writeFileSync(path.join(temp,'server.config.json'),JSON.stringify({apiKey:'fake-regression-secret'}));
  const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));port=reserve.address().port;await new Promise(r=>reserve.close(r));
  child=spawn(process.execPath,['server.js'],{cwd:temp,env:{...process.env,ZM_LOCAL_MODE:'1',PORT:String(port)},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('server startup timeout')),5000);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('error',reject);});
});
after(()=>{child?.kill();if(temp)fs.rmSync(temp,{recursive:true,force:true});});
test('only public pages are served; private configuration, data, Git and source stay private',async()=>{
  for(const url of ['/','/app.html','/index.html','/index-sidebar.html','/skill-learning.js','/resume-navigation.js','/resume-library.js'])assert.equal((await request(url)).status,200);
  for(const url of ['/server.config.json','/data/store-x.json','/.git/config','/server.js','/README.md'])assert.equal((await request(url)).status,404);
  const config=await request('/api/config');assert.equal(config.status,200);assert.ok(!config.data.includes('fake-regression-secret'));
});
test('malformed encoding, traversal and symlink escapes are rejected without crashing',async()=>{
  for(const url of ['/%zz','/%E0%A4%A'])assert.equal((await request(url)).status,400);
  for(const url of ['/../server.config.json','/%2e%2e/server.config.json','/..%5cserver.config.json','/%00'])assert.equal((await request(url)).status,403);
  fs.unlinkSync(path.join(temp,'index.html'));fs.symlinkSync(path.join(root,'README.md'),path.join(temp,'index.html'));
  assert.equal((await request('/index.html')).status,403);
  fs.unlinkSync(path.join(temp,'index.html'));fs.symlinkSync(path.join(temp,'server.config.json'),path.join(temp,'index.html'));
  assert.equal((await request('/index.html')).status,403);assert.equal((await request('/app.html')).status,200);
});
test('invalid, oversized and cross-origin writes cannot mutate configuration',async()=>{
  for(const body of ['{','null','[]'])assert.equal((await request('/api/config','POST',body)).status,400);
  assert.equal((await request('/api/config','POST',' '.repeat(5000001))).status,413);
  assert.equal((await request('/api/config','POST','{}',{Origin:'https://example.com'})).status,403);
  assert.equal((await request('/app.html','POST','{}')).status,405);
  assert.equal((await request('/app.html')).status,200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(temp,'server.config.json'))).apiKey,'fake-regression-secret');
});

function sampleReview(id, result='待定', tags=[]) {
  return {id,company:'测试公司',role:'产品经理',stage:'初面',result,date:'2026-10-13',tags,note:'具体项目复盘'};
}
function resetReviews(){fs.rmSync(path.join(temp,'data','reviews.json'),{force:true});}
async function addReview(item){return request('/api/reviews','POST',JSON.stringify(item));}
test('review API returns real zero state, durable records and matching summary',async()=>{
  resetReviews();const empty=JSON.parse((await request('/api/reviews')).data);
  assert.equal(empty.summary.total,0);assert.equal(empty.summary.passRate,0);assert.deepEqual(empty.records,[]);
  await addReview(sampleReview('passed','通过',['项目表达']));await addReview(sampleReview('pending','待定',['项目表达','心态紧张']));
  const result=JSON.parse((await request('/api/reviews')).data);
  assert.equal(result.summary.total,2);assert.equal(result.summary.passRate,100);assert.equal(result.summary.pending,1);
  assert.equal(result.summary.weaknesses[0].count,2);assert.equal(result.records[0].date,'2026-10-13');
  assert.equal(JSON.parse(fs.readFileSync(path.join(temp,'data','reviews.json'))).records.length,2);
  const deleted=JSON.parse((await request('/api/reviews/passed','DELETE')).data);
  assert.equal(deleted.summary.total,1);assert.equal(deleted.summary.passRate,0);
  assert.equal((await request('/api/reviews/passed','DELETE')).status,200);
});
test('review writes are idempotent; invalid data and foreign deletes cannot change records',async()=>{
  resetReviews();const item=sampleReview('stable','通过');await addReview(item);await addReview(item);
  assert.equal(JSON.parse((await request('/api/reviews')).data).records.length,1);
  assert.equal((await addReview({...item,note:'changed'})).status,409);
  for(const bad of [{...item,id:'bad',date:'2026-02-30'},{...item,id:'bad',tags:'x'},{...item,id:'bad',result:'未知'},{...item,id:'../../config'}])assert.equal((await addReview(bad)).status,400);
  assert.equal((await request('/api/reviews/stable','DELETE',undefined,{Origin:'https://example.com'})).status,403);
  assert.equal(JSON.parse((await request('/api/reviews')).data).records.length,1);
});
test('legacy import keeps old dates, deduplicates and never resurrects a deleted migrated batch',async()=>{
  resetReviews();const records=[{...sampleReview('legacy-1'),date:'10/12'}],body=JSON.stringify({records});
  assert.equal((await request('/api/reviews/import','POST',body)).status,200);
  assert.equal((await request('/api/reviews/import','POST',body)).status,200);
  assert.equal(JSON.parse((await request('/api/reviews')).data).records.length,1);
  await request('/api/reviews/legacy-1','DELETE');await request('/api/reviews/import','POST',body);
  assert.equal(JSON.parse((await request('/api/reviews')).data).records.length,0);
  assert.equal((await request('/api/reviews/import','POST',JSON.stringify({records:[{...sampleReview('invalid'),tags:5}]}))).status,400);
});
test('parallel review additions preserve both records and unusual tags remain data',async()=>{
  resetReviews();await Promise.all([addReview(sampleReview('parallel-1','通过',['__proto__'])),addReview(sampleReview('parallel-2','未通过',['<img src=x>']))]);
  const data=JSON.parse((await request('/api/reviews')).data);
  assert.equal(data.records.length,2);assert.equal(data.summary.passRate,50);assert.equal(data.summary.weaknesses.length,2);
  assert.ok(data.summary.weaknesses.some(w=>w.tag==='__proto__'&&w.count===1));
});
test('corrupt review file is never silently replaced or exposed as a zero state',async()=>{
  fs.mkdirSync(path.join(temp,'data'),{recursive:true});fs.writeFileSync(path.join(temp,'data','reviews.json'),'{broken');
  assert.equal((await request('/api/reviews')).status,500);assert.equal((await addReview(sampleReview('no-overwrite'))).status,500);
  assert.equal(fs.readFileSync(path.join(temp,'data','reviews.json'),'utf8'),'{broken');resetReviews();
});
