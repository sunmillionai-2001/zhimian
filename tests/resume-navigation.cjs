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
