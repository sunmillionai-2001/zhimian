// Shared, versioned interview roles and record invariants; no browser or model dependencies.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.InterviewPolicy=factory();})(typeof globalThis==='object'?globalThis:this,()=>{
 const profiles=Object.freeze({
  hr:Object.freeze({id:'hr',name:'HR 初面',focus:'求职动机、个人职责、协作沟通、岗位预期',instruction:'你是 HR 初面面试官，围绕求职动机、职责边界、协作沟通与岗位预期提问。用具体经历核实，不强行转成技术考试，不捏造公司政策或薪资。'}),
  business:Object.freeze({id:'business',name:'业务面试',focus:'项目贡献、专业能力、决策取舍、结果验证',instruction:'你是业务主管，围绕 JD 对应的项目贡献、专业能力、决策取舍和结果验证提问。根据用户真实经历追问，不强行要求材料中没有的数据，不把 JD 当作已掌握的经历。'})
 });
 function profile(id){if(!Object.hasOwn(profiles,id))throw Object.assign(Error('请选择 HR 初面或业务面试'),{status:400});return profiles[id];}
 function combined(record,index){return [record.answers[index],...(record.formal?.turns||[]).filter(t=>t.index===index).map(t=>t.answer)].filter(Boolean).join('\n');}
 function validFormal(record,envelope){
  if(record.mode!==undefined&&!['formal','coaching'].includes(record.mode))return false;
  if(record.interviewer!==undefined&&!Object.hasOwn(profiles,record.interviewer))return false;
  if(record.mode!=='formal')return record.formal===undefined;
  const f=record.formal,str=(x,n)=>typeof x==='string'&&x.length<=n;
  if(!Array.isArray(record.answers)||!Number.isInteger(record.index)||!f||!Object.hasOwn(profiles,record.interviewer)||record.count!==7||!['active','report'].includes(f.phase)||!Array.isArray(f.turns)||f.turns.length>10||f.turns.some(t=>!t||typeof t!=='object')||!str(f.draft,12000)||typeof f.decisionPending!=='boolean'||!Array.isArray(f.evaluations)||f.evaluations.length!==record.count)return false;
  if(record.questions[0]?.kind!=='intro'||record.questions[6]?.kind!=='closing'||record.questions.slice(1,6).some(q=>q.kind!=='main'))return false;
  for(let i=0;i<record.count;i++){
   const turns=f.turns.filter(t=>t.index===i);
   if(turns.length>2||turns.some((t,j)=>!Number.isInteger(t.index)||i<1||i>5||!str(t.question,1000)||!t.question.trim()||!str(t.quote,500)||!t.quote.trim()||![record.answers[i],...turns.slice(0,j).map(x=>x.answer)].join('\n').includes(t.quote)||!str(t.answer,12000)))return false;
   const e=f.evaluations[i];if(e!==null&&(!envelope(e)||!e.result.evidenceQuotes.length||!e.result.evidenceQuotes.every(q=>combined(record,i).includes(q))))return false;
  }
  if(f.evaluations[6]!==null)return false;
  if(f.turns.some(t=>!Number.isInteger(t.index)||t.index<1||t.index>5))return false;
  if(f.pending!==null){const t=f.pending;if(!t||record.index<1||record.index>5||f.turns.filter(x=>x.index===record.index).length>=2||!str(t.question,1000)||!t.question.trim()||!str(t.quote,500)||!t.quote.trim()||!combined(record,record.index).includes(t.quote)||f.decisionPending)return false;}
  return f.phase==='active'?record.status==='active':record.status!=='active'&&f.pending===null&&!f.decisionPending;
 }
 return {profiles,profile,combined,validFormal,version:'2026-10-15.roles.v1'};
});
