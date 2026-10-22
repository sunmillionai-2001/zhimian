const {test}=require('node:test'),assert=require('node:assert/strict');
const {build}=require('../resume-navigation');
const parts=(text,needle)=>{const out=[];let start=text.indexOf(needle);while(start>=0){out.push({original:needle,start});start=text.indexOf(needle,start+needle.length);}return out;};
test('paragraph names use each source company and project instead of a fixed template',()=>{
 const text='工作经历\n云杉科技有限公司\n2021.01-2024.06\n负责客户问题排查。\n项目经历\n星河排班系统 - 项目负责人\n云杉科技有限公司\n2024.07-至今\n负责客户问题排查。';
 const names=build(text,parts(text,'负责客户问题排查。')).map(v=>v.label);
 assert.match(names[0],/工作经历.*云杉科技/);assert.match(names[1],/项目经历.*星河排班系统/);
});
test('English titles, school names and missing headings remain grounded in source text',()=>{
 const english='Experience\nCedar Labs LLC\n2023-2025\nMaintained reports.\nProjects\nOrbit Project\nMaintained reports.';
 const names=build(english,parts(english,'Maintained reports.'));
 assert.match(names[0].label,/Cedar Labs/);assert.match(names[1].label,/Orbit Project/);
 const school='教育经历\n北辰大学\n课程研究与实验。';assert.match(build(school,parts(school,'课程研究与实验。'))[0].label,/北辰大学/);
 const raw='独立维护开源工具，处理社区反馈。';assert.equal(build(raw,parts(raw,raw))[0].label,raw.replace(/。$/,''));
});
test('unknown headings and duplicate snippets fall back to excerpts with unique labels',()=>{
 const text='自由探索\n整理资料。\n整理资料。';const names=build(text,parts(text,'整理资料。'));
 assert.equal(names[0].label,'整理资料（1）');assert.equal(names[1].label,'整理资料（2）');
 const unsafe='<img src=x onerror=alert(1)>。';assert.ok(build(unsafe,[{original:unsafe,start:0}])[0].label.includes('<img'));
});
test('narrative sentences are not entities and late-painted summary headings remain usable',()=>{
 const text='项目经历\n北辰科技有限公司\n与客户沟通，了解平台需求。\n整理项目交付资料。\n具备多年服务经验。\n个人总结';
 const names=build(text,[...parts(text,'整理项目交付资料。'),...parts(text,'具备多年服务经验。')]);
 assert.doesNotMatch(names[0].label,/与客户沟通/);
 assert.match(names[1].label,/个人总结/);assert.doesNotMatch(names[1].label,/项目经历/);
});
const {hierarchy}=require('../resume-navigation');
test('hierarchy uses actual modules, separates dated stints and groups multiple suggestions per experience',()=>{
 const text='教育背景\n北辰大学\n2016-2020\n工作经历\n青松有限公司\n2020-2022\n负责交付。\n完成验收。\n青松有限公司\n2023-至今\n推动培训。\n项目经历\n星河平台\n2024-至今\n协调实施。\n自我评价\n善于协作。';
 const r=hierarchy(text,['负责交付。','完成验收。','推动培训。','协调实施。'].map(v=>parts(text,v)[0]));
 assert.deepEqual(r.modules.map(m=>m.label),['教育背景','工作经历','项目经历','自我评价']);
 const jobs=r.modules[1].entries;assert.equal(jobs.length,2);assert.deepEqual(jobs.map(e=>e.detail),['2020-2022','2023-至今']);assert.deepEqual(jobs[0].indices,[0,1]);assert.equal(r.items[1].ordinal,2);assert.equal(r.modules[0].entries[0].indices.length,0);
});
test('PDF visual heading order classifies late-painted titles without changing original anchors',()=>{
 const strings=['Cedar LLC','Maintained reports.','Orbit Project','Built pipeline.','Work Experience','Projects'];
 const text=strings.join('\n\n');const ys=[90,120,190,220,60,160];
 const blocks=strings.map((v,i)=>({start:text.indexOf(v),end:text.indexOf(v)+v.length,page:1,rect:[40,ys[i],400,ys[i]+12],fontSize:12,positioned:true}));
 const sections=[parts(text,'Built pipeline.')[0],parts(text,'Maintained reports.')[0]],copy=JSON.stringify(sections),r=hierarchy(text,sections,blocks);
 assert.equal(r.items[0].category,'Projects');assert.equal(r.items[0].entity,'Orbit Project');assert.equal(r.items[1].category,'Work Experience');assert.deepEqual(r.order,[1,0]);assert.equal(JSON.stringify(sections),copy);
});
test('Word table cells and PDF columns do not borrow an unrelated sidebar heading',()=>{
 const strings=['Skills','SQL','Work Experience','Cedar LLC','Maintained reports.'];const text=strings.join('\n\n');
 const rows=strings.map((v,i)=>({start:text.indexOf(v),end:text.indexOf(v)+v.length,lane:i<2?'left':'right'}));
 assert.equal(hierarchy(text,parts(text,'Maintained reports.'),rows).items[0].category,'Work Experience');
 const pdf=rows.map((b,i)=>({...b,page:1,rect:[i<2?30:220,[30,65,30,65,95][i],i<2?180:550,110],fontSize:12,positioned:true}));
 assert.equal(hierarchy(text,parts(text,'Maintained reports.'),pdf).items[0].entity,'Cedar LLC');
});
test('custom styled headings survive and absent standard modules are not fabricated',()=>{
 const text='职业亮点\n搭建客户反馈闭环。';const r=hierarchy(text,parts(text,'搭建客户反馈闭环。'),[{start:0,end:4,lane:'body',heading:true},{start:5,end:text.length,lane:'body'}]);
 assert.deepEqual(r.modules.map(m=>m.label),['职业亮点']);assert.equal(r.items[0].entity,'全部内容');
 const raw='负责运营。\n推进交付。';assert.deepEqual(hierarchy(raw,parts(raw,'推进交付。')).modules.map(m=>m.label),['待归类内容']);
});

test('short employer names without a company suffix remain separate dated experiences',()=>{
 const text='工作经历\n青松科技\n2020-2022\n负责交付。\n星河云\n2023-至今\n维护系统。';const r=hierarchy(text,[...parts(text,'负责交付。'),...parts(text,'维护系统。')]);assert.deepEqual(r.items.map(i=>i.entity),['青松科技','星河云']);
});
