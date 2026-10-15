const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite'),{createModelStore,BUILTIN}=require('../model-store'),{createModelService}=require('../model-service');
const {publicAddress,resolvePublic,secureModelRequest}=require('../model-network');
const profile=(name='连接')=>({name,model:'test-model',baseUrl:'https://example.com/v1',apiKey:'private-test-key',enabled:true,preset:'custom'});
function sandbox(fn){return async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zhimian-model-'));let resource;try{resource=await fn(dir);}finally{resource?.close();fs.rmSync(dir,{recursive:true,force:true});}};}
const evaluation={scores:{relevance:4,structure:3,evidence:3,depth:2},strengths:['行动清楚'],gaps:['补证据'],suggestions:['说明验证'],evidenceQuotes:['优化缓存'],followUp:'如何验证？'};
const body={question:'项目是什么？',answer:'我优化缓存',role:'后端'};
const result=(value=evaluation)=>({choices:[{message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}});
test('model secrets are encrypted, scoped, retained on blank edit and durable; missing master key fails closed',sandbox(async dir=>{
 let store=createModelStore(dir),p=store.save('alice',profile()),other=store.save('bob',profile('Bob'));
 assert.equal(store.list('alice')[0].apiKey,undefined);assert.equal(store.connection('alice',p.id).apiKey,'private-test-key');assert.throws(()=>store.connection('bob',p.id),/不存在/);assert.throws(()=>store.remove('bob',p.id),/不存在/);assert.throws(()=>store.select('alice',other.id),/启用/);
 const db=new DatabaseSync(path.join(dir,'models.sqlite'));const secret=db.prepare('SELECT secret FROM profiles WHERE id=?').get(p.id).secret;assert.ok(!secret.includes('private-test-key'));db.close();
 store.save('alice',{...profile('更名'),apiKey:''},p.id);assert.equal(store.connection('alice',p.id).apiKey,'private-test-key');store.select('alice',p.id);store.close();store=createModelStore(dir);assert.equal(store.selected('alice'),p.id);assert.equal(store.connection('alice',p.id).apiKey,'private-test-key');store.remove('alice',p.id);assert.equal(store.selected('alice'),null);store.close();fs.unlinkSync(path.join(dir,'model-secret.key'));assert.throws(()=>createModelStore(dir),/密钥缺失/);
}));
test('legacy config migrates only once and disabled or deleted presets stay changed after restart',sandbox(async dir=>{
 let s=createModelStore(dir,{...profile(),apiKey:'legacy-test'});assert.equal(s.list(BUILTIN).length,4);const p=s.list(BUILTIN).find(p=>p.name==='原有内置连接');s.remove(BUILTIN,p.id);s.close();s=createModelStore(dir,{...profile(),apiKey:'legacy-test'});assert.equal(s.list(BUILTIN).length,3);assert.equal(s.list(BUILTIN).some(p=>p.enabled),false);return s;
}));
test('builtin fallback validates task results, preserves source, reports actual model and token usage',sandbox(async dir=>{
 const calls=[],s=createModelService(dir,{}, {checkEndpoint:async()=>{},transport:async(c,p)=>{calls.push({name:c.name,p});if(c.name==='first')throw Object.assign(Error('upstream failure'),{status:502});return {...result(),model:'served-version'};}});
 s.store.save(BUILTIN,{...profile('first'),priority:0});s.store.save(BUILTIN,{...profile('second'),model:'fallback-model',priority:1});
 const out=await s.execute('alice','interview',body);assert.equal(out.meta.fallback,true);assert.equal(out.meta.model,'served-version');assert.equal(out.meta.requestedModel,'fallback-model');assert.equal(out.meta.connectionName,'second');assert.equal(out.meta.usage.total_tokens,150);assert.equal(out.meta.source,'builtin');assert.equal(calls.length,2);assert.deepEqual(calls[0].p.messages,calls[1].p.messages);assert.ok(calls.every(c=>c.p.max_tokens===4096));
 const previous=calls.length;await assert.rejects(s.execute('alice','resume-rewrite',{confirmedFacts:false}),/先确认/);assert.equal(calls.length,previous);return s;
}));
test('unsupported JSON, hallucinated evidence and invalid provider output cannot pass by skipping validation',sandbox(async dir=>{
 const calls=[],s=createModelService(dir,{}, {checkEndpoint:async()=>{},transport:async(c)=>{calls.push(c.name);return c.name==='bad'?result({...evaluation,evidenceQuotes:['编造的引用']}):result();}});
 s.store.save(BUILTIN,{...profile('bad'),priority:0});s.store.save(BUILTIN,{...profile('good'),priority:1});assert.equal((await s.execute('alice','interview',body)).meta.connectionName,'good');assert.deepEqual(calls,['bad','good']);return s;
}));
test('personal failures never send material to builtins; deleting selected profile returns to default',sandbox(async dir=>{
 const calls=[],s=createModelService(dir,{}, {checkEndpoint:async()=>{},transport:async(c)=>{calls.push(c.name);throw Object.assign(Error('private upstream unavailable'),{status:502});}});
 s.store.save(BUILTIN,profile('builtin'));const p=s.store.save('alice',profile('personal'));s.store.select('alice',p.id);await assert.rejects(s.execute('alice','interview',body),/unavailable/);assert.deepEqual(calls,['personal']);assert.equal(s.list('bob').selectedId,null);assert.equal(s.list('bob').profiles.length,0);assert.equal(JSON.stringify(s.list('bob')).includes('private-test-key'),false);s.store.remove('alice',p.id);assert.equal(s.store.selected('alice'),null);return s;
}));
test('connection test requires actual JSON support and records success without activating a disabled profile',sandbox(async dir=>{
 const s=createModelService(dir,{}, {checkEndpoint:async()=>{},transport:async(c,p)=>{assert.equal(p.response_format.type,'json_object');assert.equal(p.max_tokens,64);return result(c.name==='good'?{ok:true}:{ok:false});}});
 const p=s.store.save('alice',{...profile('good'),enabled:false});await s.test('alice',p.id);assert.ok(s.list('alice').profiles[0].testedAt);assert.equal(s.list('alice').profiles[0].enabled,false);const testedAt=s.list('alice').profiles[0].testedAt;s.store.save('alice',{enabled:true,priority:1},p.id);assert.equal(s.list('alice').profiles[0].testedAt,testedAt);const bad=s.store.save('alice',profile('bad'));await assert.rejects(s.test('alice',bad.id),/JSON/);assert.equal(s.list('alice').profiles.find(p=>p.id===bad.id).testedAt,null);return s;
}));
test('per-account and global concurrency are bounded and released on failure; no balance or recharge required',sandbox(async dir=>{
 let release;const wait=new Promise(r=>release=r),s=createModelService(dir,{}, {checkEndpoint:async()=>{},transport:async()=>{await wait;return result();}});s.store.save(BUILTIN,profile());const a=s.execute('alice','interview',body),b=s.execute('alice','interview',body);await assert.rejects(s.execute('alice','interview',body),e=>e.status===429);release();await Promise.all([a,b]);assert.equal((await s.execute('alice','interview',body)).result.followUp,'如何验证？');const pending=Array.from({length:12},(_,i)=>s.execute('parallel-'+i,'interview',body));await assert.rejects(s.execute('overflow','interview',body),e=>e.status===429);await Promise.all(pending);for(let i=0;i<20;i++)await s.execute('rate','interview',body);await assert.rejects(s.execute('rate','interview',body),e=>e.status===429);return s;
}));
test('SSRF protection rejects loopback, private, link-local, mapped IPv6 and mixed DNS answers',async()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','100.100.100.200','172.16.1.1','192.168.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1','2002:7f00:1::','2001::1','3fff::1'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
 for(const url of ['http://example.com','https://user:pass@example.com','https://example.com?key=secret','https://example.com:8443','https://127.1/v1','https://[::1]','https://localhost'])await assert.rejects(resolvePublic(url),/HTTPS|本机|公网/);
 await assert.rejects(resolvePublic('https://example.com',async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]),/公网/);
});
test('HTTPS transport pins the validated DNS address, never follows redirects, and bounds payload size',async t=>{
 const dns=require('node:dns').promises,https=require('node:https'),{EventEmitter}=require('node:events');let mode='redirect',calls=0;
 t.mock.method(dns,'lookup',async()=>[{address:'8.8.8.8',family:4}]);t.mock.method(https,'request',(url,options,cb)=>{calls++;assert.equal(url.hostname,'example.com');options.lookup('example.com',{},(error,ip)=>assert.equal(ip,'8.8.8.8'));const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{const response=new EventEmitter();response.resume=()=>{};response.destroy=()=>{};response.statusCode=mode==='redirect'?302:200;cb(response);if(mode==='large')response.emit('data',Buffer.alloc(1024*1024+1));});return req;});
 await assert.rejects(secureModelRequest(profile(),{}),/HTTP 302/);assert.equal(calls,1);mode='large';await assert.rejects(secureModelRequest(profile(),{}),/过大/);
});
