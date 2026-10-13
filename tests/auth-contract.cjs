const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {spawn}=require('node:child_process'),{createAuthStore}=require('../auth-store'),{DatabaseSync}=require('node:sqlite');
const root=path.join(__dirname,'..');let tmp,child,base,admin,alice,bob,store;
async function request(url,method='GET',body,cookie,extra={}){const r=await fetch(base+url,{method,redirect:'manual',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...extra},body:body?JSON.stringify(body):undefined});const text=await r.text();let data;try{data=JSON.parse(text);}catch{}return {status:r.status,data,text,headers:r.headers,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
before(async()=>{
 tmp=fs.mkdtempSync(path.join(os.tmpdir(),'zhimian-accounts-'));for(const f of ['app.html','account.html','account-session.js','skill-learning.js','server.js','auth-store.js','review-store.js','ai-service.js','document-import.js','document-worker.js'])fs.copyFileSync(path.join(root,f),path.join(tmp,f));
 fs.writeFileSync(path.join(tmp,'server.config.json'),JSON.stringify({apiKey:'test-private-key'}));
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));base='http://127.0.0.1:'+port;
 child=spawn(process.execPath,['server.js'],{cwd:tmp,env:{...process.env,ZM_LOCAL_MODE:'0',PORT:String(port),PUBLIC_ORIGIN:base},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),6000);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('error',reject);});store=createAuthStore(path.join(tmp,'data'));
});
after(()=>{child?.kill();store?.close();if(tmp)fs.rmSync(tmp,{recursive:true,force:true});});
test('anonymous and unactivated users cannot access paid API or workbench',async()=>{
 assert.equal((await request('/app.html')).status,302);assert.equal((await request('/account.html')).status,200);for(const route of ['/api/reviews','/api/store','/api/config','/api/admin/codes'])assert.equal((await request(route)).status,401);
 alice=await request('/api/auth/register','POST',{username:'alice',password:'alice-test-password',role:'admin'});assert.equal(alice.status,200);assert.equal(alice.data.user.role,'user');assert.equal(alice.data.user.active,false);assert.match(alice.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
 assert.equal((await request('/api/reviews','GET',null,alice.cookie)).status,403);assert.equal((await request('/api/config','POST',{},alice.cookie)).status,403);assert.equal((await request('/api/admin/codes','GET',null,alice.cookie)).status,403);
 assert.equal((await request('/api/ai/interview','POST',{},alice.cookie)).status,403);
 assert.equal((await request('/api/auth/login','POST',{username:'alice',password:'incorrect-password'})).status,401);assert.equal((await request('/api/auth/register','POST',{username:'ALICE',password:'alice-test-password'})).status,409);
 const db=new DatabaseSync(path.join(tmp,'data/accounts.sqlite'));const u=db.prepare('SELECT password,salt FROM users WHERE username=?').get('alice');assert.notEqual(u.password,'alice-test-password');assert.equal(u.password.length,128);assert.equal(db.prepare('SELECT token FROM sessions LIMIT 1').get().token.includes(alice.cookie.split('=')[1]),false);db.close();
});
test('admin issue, one-time redemption, renewal, concurrency and code secrecy',async()=>{
 admin=await request('/api/auth/register','POST',{username:'manager',password:'manager-test-password'});store.setAdmin('manager');
 let issued=await request('/api/admin/codes','POST',{days:30,count:2,batch:'测试批次'},admin.cookie);assert.equal(issued.status,200);const [one,two]=issued.data.codes;
 const redemption=await request('/api/auth/redeem','POST',{code:one.code.toLowerCase()},alice.cookie);assert.equal(redemption.status,200);const until=redemption.data.user.accessUntil;assert.ok(until>Date.now()+29*86400000);
 const repeat=await request('/api/auth/redeem','POST',{code:one.code},alice.cookie);assert.equal(repeat.data.user.accessUntil,until);assert.equal(repeat.data.user.alreadyRedeemed,true);
 bob=await request('/api/auth/register','POST',{username:'bob',password:'bob-test-password'});assert.equal((await request('/api/auth/redeem','POST',{code:one.code},bob.cookie)).status,409);
 const racing=await Promise.all([request('/api/auth/redeem','POST',{code:two.code},alice.cookie),request('/api/auth/redeem','POST',{code:two.code},bob.cookie)]);assert.deepEqual(racing.map(r=>r.status).sort(),[200,409]);
 const list=await request('/api/admin/codes','GET',null,admin.cookie);assert.ok(!list.text.includes(one.code));assert.ok(!list.text.includes('digest'));assert.equal(list.data.codes.filter(c=>c.usedBy).length,2);
 const reopened=createAuthStore(path.join(tmp,'data'));assert.equal(reopened.authenticate(alice.cookie.split('=')[1]).active,true);reopened.close();
 const app=await request('/app.html','GET',null,alice.cookie);assert.equal(app.status,200);assert.match(app.text,/window.ZM_ACCOUNT=/);assert.ok(!app.text.includes('test-private-key'));
 const renewed=await request('/api/admin/codes','POST',{days:7,count:1,batch:'续期'},admin.cookie);const previous=store.user(alice.data.user.id).accessUntil;const r=await request('/api/auth/redeem','POST',{code:renewed.data.codes[0].code},alice.cookie);assert.equal(r.data.user.accessUntil,previous+7*86400000);
});
test('review and generic store are isolated by authenticated account, never body user ID',async()=>{
 if(!store.user(bob.data.user.id).active){const [c]=store.issue({days:30});assert.equal((await request('/api/auth/redeem','POST',{code:c.code},bob.cookie)).status,200);}
 assert.equal((await request('/api/reviews','GET',null,bob.cookie,{'X-ZM-Account':alice.data.user.id})).status,409);
 const record={id:'same-id',company:'Alice公司',role:'产品经理',stage:'初面',result:'待定',date:'2026-10-14',tags:[],note:'私有记录'};
 assert.equal((await request('/api/reviews','POST',record,alice.cookie)).status,200);assert.equal((await request('/api/reviews','GET',null,bob.cookie)).data.records.length,0);await request('/api/reviews/same-id','DELETE',{},bob.cookie);assert.equal((await request('/api/reviews','GET',null,alice.cookie)).data.records.length,1);
 await request('/api/store','POST',{key:'zm_resume_store_v1',value:{text:'alice私有简历'},userId:bob.data.user.id},alice.cookie);assert.deepEqual((await request('/api/store','GET',null,bob.cookie)).data,{});assert.equal((await request('/api/store','GET',null,alice.cookie)).data.zm_resume_store_v1.text,'alice私有简历');assert.equal((await request('/api/store','POST',{key:'../escape',value:{}},alice.cookie)).status,400);
});
test('expiry, revocation, cross-origin, logout and password reset invalidate access',async()=>{
 const [c]=store.issue({days:1});const user=await store.register('expired','expired-test-password');store.redeem(user.user.id,c.code);const db=new DatabaseSync(path.join(tmp,'data/accounts.sqlite'));db.prepare('UPDATE codes SET used_at=? WHERE id=?').run(Date.now()-2*86400000,c.id);db.close();assert.equal((await request('/api/reviews','GET',null,'zm_session='+user.token)).status,403);
 const [deadline]=store.issue({days:1,redeemBy:new Date(Date.now()+60000).toISOString()});const db2=new DatabaseSync(path.join(tmp,'data/accounts.sqlite'));db2.prepare('UPDATE codes SET redeem_by=? WHERE id=?').run(Date.now()-1,deadline.id);db2.close();assert.equal((await request('/api/auth/redeem','POST',{code:deadline.code},alice.cookie)).status,400);
 const a=store.codes().filter(c=>c.usedBy==='alice');for(const code of a)await request('/api/admin/codes/'+code.id,'DELETE',{},admin.cookie);assert.equal((await request('/api/reviews','GET',null,alice.cookie)).status,403);
 assert.equal((await request('/api/auth/login','POST',{username:'bob',password:'bob-test-password'},null,{Origin:'https://foreign.example'})).status,403);
 await request('/api/auth/logout','POST',{},bob.cookie);assert.equal((await request('/api/auth/me','GET',null,bob.cookie)).data.user,null);
 const login=await request('/api/auth/login','POST',{username:'bob',password:'bob-test-password'});await store.resetPassword('bob','bob-new-test-password');assert.equal((await request('/api/auth/me','GET',null,login.cookie)).data.user,null);assert.equal((await request('/api/auth/login','POST',{username:'bob',password:'bob-test-password'})).status,401);
});
test('auth endpoints rate-limit repeated login and redemption attempts',async()=>{let status;for(let i=0;i<35;i++)status=(await request('/api/auth/login','POST',{username:'missing',password:'missing-test-password'})).status;assert.equal(status,429);});
