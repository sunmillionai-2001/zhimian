const {test}=require('node:test'),assert=require('node:assert/strict'),{validFormal,profiles}=require('../interview-policy');
function record(){return {mode:'formal',interviewer:'business',count:7,index:1,status:'active',answers:['介绍','我整理需求','','','','',''],questions:[{kind:'intro'},...Array.from({length:5},()=>({kind:'main'})),{kind:'closing'}],formal:{phase:'active',turns:[],pending:null,draft:'',decisionPending:false,evaluations:Array(7).fill(null)}};}
test('formal state validates follow-up provenance, limits, phases and malformed imports without throwing',()=>{
 const r=record();assert.ok(validFormal(r,()=>true));r.formal.pending={question:'具体是什么？',quote:'整理需求'};assert.ok(validFormal(r,()=>true));r.formal.pending.quote='虚构原话';assert.equal(validFormal(r,()=>true),false);r.formal.pending=null;
 r.formal.turns=[{index:1,question:'职责？',quote:'整理需求',answer:'核对交付'}];r.formal.pending={question:'怎么核对？',quote:'核对交付'};assert.ok(validFormal(r,()=>true));r.formal.pending=null;r.formal.turns.push({index:1,question:'怎么验证？',quote:'核对交付',answer:'比较记录'});assert.ok(validFormal(r,()=>true));r.formal.turns.push({...r.formal.turns[1]});assert.equal(validFormal(r,()=>true),false);
 for(const patch of [{turns:[null]},{pending:undefined},{evaluations:[]},{phase:'invented'}]){const x=record();Object.assign(x.formal,patch);assert.doesNotThrow(()=>validFormal(x,()=>true));assert.equal(validFormal(x,()=>true),false);}
 const saved=record();saved.status='saved';assert.equal(validFormal(saved,()=>true),false);saved.formal.phase='report';assert.ok(validFormal(saved,()=>true));saved.formal.evaluations[1]={result:{evidenceQuotes:['伪造']}};assert.equal(validFormal(saved,()=>true),false);
 assert.ok(profiles.hr.focus!==profiles.business.focus);assert.ok(validFormal({count:5},()=>true));
});
