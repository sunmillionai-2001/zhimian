const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const skill=require('../skill-learning.js');
const html=fs.readFileSync(path.join(__dirname,'..','app.html'),'utf8');
const ctx=vm.createContext({});vm.runInContext(html.slice(html.indexOf('  const SKILLMAP ='),html.indexOf('  const SKILL_ROLES='))+';globalThis.map=SKILLMAP;',ctx);const map=ctx.map;
test('six roles provide 24 unique learning modules with exercises, criteria and verified HTTPS resources',()=>{
 const modules=Object.keys(map).flatMap(r=>skill.modules(map,r));assert.equal(modules.length,24);assert.equal(new Set(modules.map(m=>m.id)).size,24);
 for(const m of modules){assert.equal(m.criteria.length,3);assert.ok(m.exercise.length>20);assert.ok(m.abilities.length>=2);assert.ok(skill.recommendations(m).length>=1);assert.ok(skill.recommendations(m).every(r=>skill.validResource(r)));}
});
test('JD matching has source evidence, distinguishes required/bonus, avoids JavaScript and negated requirements',()=>{
 const r=skill.analyze(map,'后端开发','后端工程师\n熟悉 MySQL，Redis 经验加分；不要求 MQ；只使用 JavaScript');
 assert.ok(r.requirements.some(a=>a.name==='MySQL'&&a.kind==='required'&&a.quote==='熟悉 MySQL'));assert.ok(r.requirements.some(a=>a.name==='Redis'&&a.kind==='bonus'));
 assert.ok(!r.requirements.some(a=>['Java','Java/Go','MQ'].includes(a.name)));assert.ok(r.unmatched.includes('只使用 JavaScript'));
});
test('unknown roles never default to AGI and keyword collisions do not create false matches',()=>{
 assert.equal(skill.resolveRole('销售经理'),'');assert.deepEqual(skill.modules(map,'toString'),[]);assert.equal(skill.resolveRole('chairman'),'');assert.equal(skill.resolveRole('后端研发工程师'),'后端开发');assert.equal(skill.resolveRole('AI 工程师'),'AGI 工程师');assert.deepEqual(skill.analyze(map,'销售经理','销售线索跟进').requirements,[]);
});
test('legacy level migration keeps individual assessments with explicit legacy marker',()=>{
 const old={'后端开发':[2]};const s=skill.migrate(map,old);const m=skill.modules(map,'后端开发').find(m=>m.lv===2);
 assert.ok(skill.validate(s));assert.ok(m.abilities.every(a=>s.skills[a.id].level===3&&s.skills[a.id].legacy));assert.deepEqual(old,{'后端开发':[2]});assert.throws(()=>skill.migrate(map,{'后端开发':'bad'}));
});
test('priority uses required gaps before bonus gaps; practice record never changes ability level',()=>{
 const s=skill.empty(),p={requirements:[{id:'bonus',kind:'bonus'},{id:'done',kind:'required'},{id:'gap',kind:'required'}]};s.skills.done={level:3,evidence:'项目'};s.exercises.example={answer:'产出',checks:[true,true,true],updatedAt:new Date().toISOString()};
 assert.deepEqual(skill.gaps(p,s).map(r=>r.id),['gap','done','bonus']);assert.equal(s.skills.gap,undefined);
});
test('backup schema rejects malformed exercises and oversized evidence without losing valid plans',()=>{
 const s=skill.empty();assert.ok(skill.validate(s));s.skills.a={level:2,evidence:'x'.repeat(3001)};assert.equal(skill.validate(s),false);delete s.skills.a;s.exercises.a={answer:'done',checks:[true],updatedAt:''};assert.equal(skill.validate(s),false);assert.equal(skill.validate(JSON.parse('{"schemaVersion":1,"skills":{"__proto__":{"level":1,"evidence":""}},"exercises":{},"plan":null}')),false);
});
test('sponsored resource must identify partner and cannot alter organic recommendation order',()=>{
 const m=skill.modules(map,'后端开发')[1],organic=skill.recommendations(m),sponsor={moduleId:m.id,title:'合作课程',url:'https://example.com/course',meta:'课程',reason:'练习缓存',sponsored:true,sponsor:'合作方'};
 assert.deepEqual(skill.recommendations(m,[sponsor]).slice(0,organic.length),organic);assert.equal(skill.recommendations(m,[sponsor]).at(-1).sponsored,true);
 for(const r of [{...sponsor,sponsor:''},{...sponsor,url:'javascript:alert(1)'},{...sponsor,url:'https://name:password@example.com'},{...sponsor,url:'http://example.com'}])assert.equal(skill.validResource(r),false);
});
