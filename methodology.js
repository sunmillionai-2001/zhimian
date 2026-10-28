/* 面试方法论诊断引擎：档位推断 → 横向信号 → 追问决策 → 锚点判定。
   纯函数、无浏览器依赖，可在 Node 直接测试。
   设计依据见 interview-assistant/方法论模块-可开发规格-v0.4.md */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ZmMethod=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';

/* ========== 档位 ========== */
// 四档命名刻意避开大厂职级（阿里/腾讯/字节那套）：它只在大厂内部通用，
// 传统行业、国企、外企、创业公司各有各的体系且互不相通，用户看不懂。
const STAGES=[
  {id:'executor',name:'执行者',desc:'把明确的任务做好，需要有人定方向'},
  {id:'owner',name:'独当一面',desc:'自己定方向、扛指标，能解决模糊问题'},
  {id:'lead',name:'带人带事',desc:'通过别人拿结果，能推动无汇报关系的人'},
  {id:'strategy',name:'定战略',desc:'定义问题而不只是解决问题'}
];
const STAGE_IDS=STAGES.map(s=>s.id);
const YEARS=[
  {id:'y0',label:'0–2 年',stage:'executor'},
  {id:'y1',label:'3–6 年',stage:'owner'},
  {id:'y2',label:'6–10 年',stage:'lead'},
  {id:'y3',label:'10 年以上',stage:'strategy'}
];
// 面试轮次：HR 面和业务面考的东西不一样，不能出同一套题。
const INTERVIEW_ROUNDS=[
  {id:'all',name:'都要练',desc:'六个维度全上'},
  {id:'hr',name:'HR 初面',desc:'动机、稳定性、协作'},
  {id:'business',name:'业务面',desc:'项目、判断、推动'}
];
const ROUND_IDS=INTERVIEW_ROUNDS.map(r=>r.id);

// 带人状态：年限推不出「有没有带过人」。
// 8 年的资深工程师、设计师很可能一直是个人贡献者，从没带过下属。
const REPORTS=[
  {id:'none',label:'没有，一直是个人贡献者'},
  {id:'small',label:'带过 1–3 人 / 小组'},
  {id:'team',label:'带过团队或部门'}
];
const REPORTS_IDS=REPORTS.map(r=>r.id);

// 每个档位「合格」对应的锚点等级：执行者=中性(2)、独当一面=是(3)、带人带事/定战略=强是(4)
const STAGE_REQUIRED={executor:2,owner:3,lead:4,strategy:4};

function stageName(id){return (STAGES.find(s=>s.id===id)||STAGES[0]).name;}

// 各轮次考哪些维度。动机题只进 HR 面——业务面不会问你为什么离职。
const ROUND_DIMENSIONS={
  all:['D1','D2','D3','D4','D5'],
  hr:['D3','D4','D5'],
  business:['D1','D2','D3','D4']
};
const ROUND_HAS_MOTIVE={all:true,hr:true,business:false};
function dimensionsForRound(round){
  return (ROUND_DIMENSIONS[round]||ROUND_DIMENSIONS.all).slice();
}
function roundHasMotive(round){return ROUND_HAS_MOTIVE[round]!==false;}
function stageIndex(id){const i=STAGE_IDS.indexOf(id);return i<0?1:i;}

/* 年限 → 你的档位（推断表 A） */
function inferSelfStage(yearsId){
  const row=YEARS.find(y=>y.id===yearsId);
  return row?row.stage:'owner';
}

/* JD / 岗位名 → 岗位要求的档位（推断表 B）。从高到低判，先命中先返回。 */
const JOB_RULES=[
  {stage:'strategy',re:/(负责业务线|业务线整体|整体规划|制定策略|战略规划|从\s*0\s*到\s*1|从零到一|定义问题|业务方向)/},
  {stage:'lead',re:/(带过团队|带团队|团队管理|管理团队|跨部门推动|统筹|带领\d*\s*人|下属|管理经验|5\s*年以上|五\s*年以上)/},
  {stage:'owner',re:/(独立负责|独立完成|独当一面|3\s*年以上|三年以上|3\s*[-–—]\s*5\s*年|负责.{0,6}模块|owner|自驱)/i},
  {stage:'executor',re:/(1\s*[-–—]\s*3\s*年|1\s*年以上|协助|配合|执行|专员|助理|实习|应届|校招|无经验)/}
];
function inferJobStage(jd,roleName){
  const text=String(jd||'')+'\n'+String(roleName||'');
  if(!text.trim())return '';
  for(const rule of JOB_RULES)if(rule.re.test(text))return rule.stage;
  return '';
}

/* 标尺永远用「岗位要求的档位」，不是「用户自己的档位」。
   JD 没填时用年限兜底，并标记来源，界面据此提示「填 JD 可提高精度」。 */
function resolveScale({years,jd,roleName,manualSelf,manualJob,reports}){
  let selfStage=manualSelf&&STAGE_IDS.includes(manualSelf)?manualSelf:inferSelfStage(years);
  // 没带过人，自我档位封顶在「独当一面」：年限再长也不能算「带人带事」。
  // 岗位要求仍可高于此——那是「冲高」，由 flag 提示。
  if(reports==='none'&&stageIndex(selfStage)>stageIndex('owner'))selfStage='owner';
  const inferredJob=inferJobStage(jd,roleName);
  const jobStage=manualJob&&STAGE_IDS.includes(manualJob)?manualJob:(inferredJob||selfStage);
  const jobSource=manualJob?'manual':(inferredJob?'jd':'fallback');
  const gap=stageIndex(jobStage)-stageIndex(selfStage);
  return {
    selfStage,jobStage,jobSource,
    flag:gap>0?'stretch':gap<0?'below':'match',
    note:jobSource==='fallback'?'未填岗位要求，先按你的年限当标尺。填 JD 后诊断会更准。':''
  };
}

/* ========== 锚点等级 ========== */
const LEVELS=[
  {id:'strong_no',name:'强否',score:0},
  {id:'no',name:'否',score:1},
  {id:'neutral',name:'中性',score:2},
  {id:'yes',name:'是',score:3},
  {id:'strong_yes',name:'强是',score:4}
];
const LEVEL_IDS=LEVELS.map(l=>l.id);
function levelByScore(n){return LEVELS[Math.max(0,Math.min(4,Math.round(n)))];}
function levelName(id){return (LEVELS.find(l=>l.id===id)||LEVELS[0]).name;}

/* ========== 维度 D2：推动与影响力 ========== */
const D2={
  id:'D2',
  name:'推动与影响力',
  definition:'在没有直接汇报关系、甚至存在明确反对的情况下，识别真实阻力、选择推动方式、让对方改变立场并交付结果。',
  // 题目一律问「已经发生过的事」，不用「你需要……」这种假设语气：
  // 行为面试要的是具体事件，假设语气会让用户不知道该讲哪段经历。
  // 每题配一句「去哪儿找例子」：题目抽象时，用户卡住的往往不是不会答，
  // 而是不知道从自己哪段经历里取。hint 只指路，不给答案。
  questions:[
    {id:'D2-Q1',minStage:'executor',
     q:'讲一次你说服平级同事或别的部门配合你做事，而你并没有权力直接安排他们的经历。',
     hint:'想一想：你需要别的部门、客户或者平级同事配合，但他们不归你管，你得想办法让他们愿意做。'},
    {id:'D2-Q2',minStage:'owner',
     q:'讲一次有人明确反对你的方案，你最后还是把它推动落地的经历。',
     hint:'想一想：你的方案在会上被否过、被质疑过，或者有人当面说“这样不行”，后来这件事还是做成了。'},
    {id:'D2-Q3',minStage:'lead',
     q:'讲一次你改变了一个已经沿用很久的做法或流程的经历。',
     hint:'想一想：团队一直按老办法做事，你觉得不对，推动大家换了个做法。哪怕只是周会怎么开、报表怎么填。'}
  ],
  // 锚点带档位刻度：同一行为，执行者做到是「是」，带人带事的人做到只是「否」。
  anchors:[
    {id:'strong_no',text:'全程被动执行（"领导让我推"），或把阻力描述成"对方不配合"而自己没有任何动作。'},
    {id:'no',text:'有推动动作，但只有"沟通 / 协调 / 对接"这类无具体动作的动词，说不清阻力在哪。'},
    {id:'neutral',text:'有具体动作和具体阻力，但推动方式单一（只靠开会 / 只靠催），且未说明对方为何改变立场。'},
    {id:'yes',text:'识别出真实利益分歧，用数据 / 试点 / 换位 / 共同指标等方式让对方改变立场，结果可验证。'},
    {id:'strong_yes',text:'在无授权甚至被反对时，主动建立可复用的推动机制（固定例会、共同 KPI、流程改造），结果可量化。'}
  ]
};
/* ========== 维度 D1：业务判断与决策 ========== */
// 和 D2 的关键差异：D2 的证据是「对方改变了立场」，D1 的证据是「你放弃了什么」。
// 最需要防的错是「伪取舍」——用户讲了一个选择，但细看当时根本没得选。
const D1={
  id:'D1',
  name:'业务判断与决策',
  definition:'在信息不全、目标冲突或资源受限的情况下，能拆解问题、识别关键约束、做出可解释的取舍，并推动落地。',
  weight_default:0.25,
  questions:[
    {id:'D1-Q1',minStage:'executor',
     q:'讲一次你在信息不全的情况下做了判断，后来证明这个判断是对的经历。',
     hint:'想一想：当时拿不到完整数据或需求还没定，你必须先做决定，不能一直等。'},
    {id:'D1-Q2',minStage:'owner',
     q:'讲一次你在两个都有道理的选择之间做了取舍的经历。',
     hint:'想一想：两个方案各有好处，选了一个就得放弃另一个，或者资源只够做一件。'},
    {id:'D1-Q3',minStage:'lead',
     q:'讲一次你判断某件事不该做、并说服别人放弃它的经历。',
     hint:'想一想：有人要做一件你觉得不划算的事（做功能、投渠道、接客户），你说服他们停下来。'}
  ],
  anchors:[
    {id:'strong_no',text:'只是执行了别人的决定，或把"当时只能这样"说成判断。'},
    {id:'no',text:'有选择动作，但说不清选项是什么、放弃了什么，或事后才总结出理由。'},
    {id:'neutral',text:'说清了选项和取舍，但依据是直觉或"感觉这样更好"，没有可验证的支撑。'},
    {id:'yes',text:'说清选项与放弃的代价，取舍依据是数据 / 约束 / 目标优先级，结果可验证。'},
    {id:'strong_yes',text:'在信息不全时主动建立判断标准，取舍被结果验证，且这套标准后来被复用。'}
  ]
};

/* ========== 维度 D3：协作与冲突 ========== */
// 最需要防的错：把冲突讲成「我是对的、他是错的」。
// 成熟的做法是先承认对方的合理性，再讲你怎么推动共识。
const D3={
  id:'D3',
  name:'协作与冲突',
  definition:'在与同事、上级或跨部门出现分歧时，能理解对方立场、对事不对人地推进，并维持可继续合作的关系。',
  weight_default:0.20,
  questions:[
    {id:'D3-Q1',minStage:'executor',
     q:'讲一次你和同事意见不一致，最后把事情推进下去的经历。',
     hint:'想一想：你和别人对怎么做有不同看法，可能还争过，但最后得一起把活干完。'},
    {id:'D3-Q2',minStage:'owner',
     q:'讲一次你和上级或强势的合作方有分歧，你没有简单服从、也没有硬顶的经历。',
     hint:'想一想：你不认同上面的决定，但没有直接对抗，而是想办法让对方改变或折中。'},
    {id:'D3-Q3',minStage:'lead',needsReports:true,
     q:'讲一次你处理团队里两个人长期不和的经历。',
     hint:'想一想：不是你自己的冲突，而是你要让两个合不来的人继续合作。',
     // 没带过人的用户走这版：矛盾可以发生在平级或跨团队之间
     alt:'讲一次你处理两个团队（或两位平级同事）之间长期矛盾的经历。',
     altHint:'想一想：两边各有立场、互相不配合，你夹在中间或者主动去协调。'}
  ],
  anchors:[
    {id:'strong_no',text:'把分歧归因为对方能力或态度问题，自己只是受害者或旁观者。'},
    {id:'no',text:'有处理动作，但只有"沟通了一下"，说不清分歧点在哪，也没说对方为何让步。'},
    {id:'neutral',text:'说清了分歧和处理方式，但把对方写成完全不讲理，或结果只是"领导拍板"。'},
    {id:'yes',text:'先承认对方立场中的合理部分，再用事实 / 目标 / 试点推动，关系未受损。'},
    {id:'strong_yes',text:'不只解决这次分歧，还建立了减少同类冲突的机制（分工边界、决策规则、同步节奏）。'}
  ]
};

/* ========== 维度 D4：复盘与成长 ========== */
// 最需要防的错：凡尔赛式缺点（把优点包装成缺点）。
// 真复盘必须包含「代价」和「改变」，缺一个都不算。
const D4={
  id:'D4',
  name:'复盘与成长',
  definition:'能诚实面对自己的失误，说清代价与原因，并把教训转化为可复用的做法。',
  weight_default:0.20,
  questions:[
    {id:'D4-Q1',minStage:'executor',
     q:'讲一次你做得不够好、后来改进了的经历。',
     hint:'想一想：有件事结果不理想，你复盘过，之后遇到类似情况换了做法。'},
    {id:'D4-Q2',minStage:'owner',
     q:'讲一次你做的判断后来被证明是错的经历。',
     hint:'想一想：你当时觉得对，结果不对，而且这个错是你自己的判断造成的，不是别人害的。'},
    {id:'D4-Q3',minStage:'lead',needsReports:true,
     q:'讲一次你带的人或团队出了问题、你从中看到自己责任的经历。',
     hint:'想一想：下属或团队出了状况，你复盘时发现根子在自己的决策、要求或节奏上。',
     alt:'讲一次你参与的项目出了问题、你复盘时发现自己哪一步判断错了的经历。',
     altHint:'想一想：不怪别人，是你当时某个判断或安排埋下了坑。'}
  ],
  anchors:[
    {id:'strong_no',text:'凡尔赛式缺点（追求完美 / 太拼 / 要求太高），或把责任全部推给外部。'},
    {id:'no',text:'承认了失误，但说不出具体代价，也说不清后来改了什么。'},
    {id:'neutral',text:'有具体失误和代价，改变停留在"以后会更注意"这类决心。'},
    {id:'yes',text:'失误具体、代价具体，改变是某个可观察的做法，且说明后来验证过。'},
    {id:'strong_yes',text:'不只自己改，还把教训变成团队可用的规则、清单或流程，并被他人复用。'}
  ]
};

/* ========== 维度 D5：压力与稳定性 ========== */
// 最需要防的错：把「硬扛」当成「抗压」。
// 真正的稳定性是能识别压力、主动调整资源或预期，而不是一个人撑到崩。
const D5={
  id:'D5',
  name:'压力与稳定性',
  definition:'在时间紧、资源少或目标冲突时，能识别压力来源、主动调整做法或预期，并把事情交付出去。',
  weight_default:0.10,
  questions:[
    {id:'D5-Q1',minStage:'executor',
     q:'讲一次你在时间很紧的情况下把任务做完的经历。',
     hint:'想一想：截止时间压得很死，你必须决定先做什么、后做什么。'},
    {id:'D5-Q2',minStage:'owner',
     q:'讲一次你同时扛了好几件事、最后做了取舍的经历。',
     hint:'想一想：几件事都很急，你没法全做好，必须找人说清楚并放弃一部分。'},
    {id:'D5-Q3',minStage:'lead',needsReports:true,
     q:'讲一次你发现团队已经扛不住、你做了调整的经历。',
     hint:'想一想：你看出大家撑不住了，主动减范围、加人或改节奏，而不是继续压。',
     alt:'讲一次你发现手上的事情已经扛不住、你主动调整了范围或排期的经历。',
     altHint:'想一想：你判断按原计划做不完，主动砍范围、要资源或者跟人摊牌。'}
  ],
  anchors:[
    {id:'strong_no',text:'把硬扛当美德（连续通宵 / 一个人顶住），或把压力全归为外部、自己没做任何调整。'},
    {id:'no',text:'只说了"加班赶完"，没有说明怎么取舍、有没有求助或调整。'},
    {id:'neutral',text:'有调整动作（减范围 / 求助 / 改节奏），但没说明判断依据，或结果是靠运气过关。'},
    {id:'yes',text:'识别出压力来源，主动调整资源或预期，说清取舍依据，结果可验证。'},
    {id:'strong_yes',text:'不只这次扛过去，还建立了预警或缓冲机制（提前暴露风险、留 buffer、分级响应），后来避免过同类问题。'}
  ]
};

const DIMENSIONS=[D1,D2,D3,D4,D5];
function dimension(id){return DIMENSIONS.find(d=>d.id===id)||D2;}

// 选题：档位决定难度，带人状态决定用哪个版本。
// 没带过人的资深用户不该被问「你带的人出了什么问题」——那不是他的经历。
function pickQuestion(jobStage,dimId,opts){
  const d=dimension(dimId||'D2');
  const idx=Math.min(stageIndex(jobStage),d.questions.length-1);
  const q=d.questions[idx];
  // 只有明确说了「没带过人」才换版本；没说就按原题（档位本身已暗示带人）。
  const noReports=opts&&opts.hasReports===false;
  if(q.needsReports&&noReports&&q.alt){
    return Object.assign({},q,{q:q.alt,hint:q.altHint||q.hint,usingAlt:true});
  }
  return q;
}

/* ========== 文本分析：句子切分与信号 ========== */
function sentences(text){
  return String(text||'').split(/[。！？；\n]+/).map(s=>s.trim()).filter(Boolean);
}

// 第一人称主动句 / (第一人称 + 复数主语) 句。注意「我们」含「我」，必须先排除。
const RE_PLURAL=/我们|咱们|大家|团队|小组|部门|组里|公司/;
const RE_SELF=/我(?!们)|自己|本人|我这边/;

function ownRatio(text){
  const rows=sentences(text);
  if(!rows.length)return 0;
  let own=0,plural=0;
  for(const s of rows){
    const hasSelf=RE_SELF.test(s);
    const hasPlural=RE_PLURAL.test(s);
    if(hasSelf)own++;
    else if(hasPlural)plural++;
  }
  return own+plural?own/(own+plural):0;
}

// 结果指标 = 数字 + 可度量的单位。
// 中文数字只认强单位（人/天/周/月/年/小时/次/条/倍/成/万/亿），
// 不认「个/分/场/位」这类泛量词——否则「三个部门」「一个部门」这种范围描述
// 会被当成结果量化，从而错误地抬高 X-QUANT。
const STRONG_UNIT='人|天|周|月|年|小时|分钟|秒|次|条|倍|成|万|亿|千|百|元|块|单|家|页|轮|场';
const RE_NUM=new RegExp(
  '(?:\\d+(?:\\.\\d+)?\\s*(?:%|％|'+STRONG_UNIT+'|个|位|k|K|w|W|qps|QPS|ppm))'+
  '|(?:[一二两三四五六七八九十半]+\\s*(?:'+STRONG_UNIT+'))'
);
function quantDensity(text){
  const rows=sentences(text);
  if(!rows.length)return 0;
  return rows.filter(s=>RE_NUM.test(s)).length/rows.length;
}

// 摩擦力 = 有障碍标记 + 有细节（具体的人 / 资源 / 数字）。只有「很多困难」不算。
const RE_FRICTION=/(?:困难|阻力|反对|不同意|不认可|不配合|质疑|资源(?:不足|不够|紧张)|时间(?:紧|不够|来不)|预算(?:被)?(?:砍|削|不够)|冲突|争执|分歧|卡住|卡在|差点|几乎|延期|推迟|崩|事故|故障|投诉|被拒|拒绝|砍掉|砍了|缩减|压缩|缺人|没人|抢资源|插队|推不动|僵持)/;
// 具体化证据：要么有因果说明，要么有数字，要么是「具体角色 + 具体的反对/施压动作」。
// 泛泛的「团队」「领导」不构成细节——否则「我们团队遇到很多困难」会被误判成有摩擦力。
const RE_DETAIL=/(?:因为|原因是|具体是|指的是|主要是|理由是|原因是)|(?:\d+\s*(?:个|人|天|周|月|万|千|百|%|％|倍))|(?:领导|老板|上级|总监|经理|产品|运营|设计|研发|销售|财务|法务|客户|甲方|乙方|供应商|部门|团队)(?:那边|这边|那边的人)?\s*(?:明确|直接|一开始|当场|死活)?\s*(?:反对|不同意|不认可|不配合|拒绝|质疑|坚持|担心|不同意|压|砍|卡)/;
function hasFriction(text){const t=String(text||'');return RE_FRICTION.test(t)&&RE_DETAIL.test(t);}

const RE_DECISION=/(?:因为|所以|于是|权衡|取舍|放弃|选择|决定|判断|优先|宁可|代价|换成|改成|替代|方案[AB12甲乙]|如果.{0,12}就|我倾向|我判断|我建议|我决定|说服|谈判|交换|换来|换取|说了风险|说了|讲清|讲明|汇报|同步风险|提前暴露)/;
function hasDecision(text){return RE_DECISION.test(String(text||''));}

// 机制类信号：区分「是」和「强是」的唯一依据
const RE_MECHANISM=/(?:机制|流程|SOP|规范|标准|例会|看板|制度|固化|复用|模板|清单|checklist|自动化|沉淀|推广到|复制到|沿用|周会|日报|共享文档)/i;
function hasMechanism(text){return RE_MECHANISM.test(String(text||''));}

const RE_REFLECT=/(?:如果重来|重来一次|再选一次|学到|下次|复盘|反思|教训|改进|改变了|调整了|后来我|现在我会)/;
function hasReflection(text){return RE_REFLECT.test(String(text||''));}

// 只有空泛动词，没有可观察动作
const RE_VAGUE_ONLY=/(?:沟通|协调|对接|跟进|推动|配合|参与|协助|帮忙|支持|推进)/;
// 具体动作必须挂在第一人称上。第三人称 / 无主语的「做了一套」「出了方案」
// 无法证明是本人做的，不能算个人动作——否则流水账会被判成有具体动作。
const VERBS='写|改|拉|拆|算|画|发|约|找|谈|列|定|推|建|梳理|对齐|说服|争取|拒绝|拍板|带着|拉通|拆解|列出|整理|搭|测|比|做|跑|落|上|搬|扛|谈下|拿下|要来|要到|申请|砍|删|压|换|优化|重构|简化|合并|拆分|降|提升|提高|缩短|减少|降低|重写|引入|接入|迁移|替换|盘|摆|摊|给|展示|汇报|说明|解释|拆|算|盘了一下';
// 「我们」是复数主语，不是第一人称动作。必须用 (?!们) 排掉，否则
// 「我们团队一起做了个」会被当成「我做了」。
// 窗口放宽到 14 字：「我拿了两周的灰度数据给他看」中间隔了 9 个字，
// 太窄会把真实的个人动作判成没有。
const RE_CONCRETE=new RegExp('我(?!们)(?:这边|自己)?[^，。；！？\\n]{0,14}(?:'+VERBS+')');
// 主动动作：我提出 / 我建议 / 我决定 / 我主动……这是区分「被指派」的关键。
const RE_INITIATIVE=/我(?:主动|提出|建议|决定|判断|发现|想到|拍板|争取|要求|发起|牵头|提议)/;
function hasInitiative(text){return RE_INITIATIVE.test(String(text||''));}

// 第一人称主动句：句中出现了「我 + 动词」
function hasSelfAction(text){
  const rows=sentences(text);
  return rows.some(r=>RE_CONCRETE.test(r));
}
// 只认「被指派 / 纯执行」的语义。「按他说的做」是执行方式，不是被指派，不能算强否。
const RE_PASSIVE=/(?:领导让我|领导要求我|老板让我|公司安排|上级安排|被安排|领导指示|要求我做|交给我做|安排我|派我|让我去|吩咐|听从安排)/;

function analyze(text){
  const t=String(text||'').trim();
  const own=ownRatio(t),quant=quantDensity(t);
  return {
    length:t.length,
    sentenceCount:sentences(t).length,
    ownRatio:own,
    quantDensity:quant,
    friction:hasFriction(t),
    decision:hasDecision(t),
    mechanism:hasMechanism(t),
    reflection:hasReflection(t),
    concrete:hasSelfAction(t),
    vagueOnly:RE_VAGUE_ONLY.test(t)&&!RE_CONCRETE.test(t),
    passive:RE_PASSIVE.test(t)
  };
}

/* ========== 缺口检测（G1–G5，按诊断价值排序） ========== */
// G1 人称 > G2 摩擦力 > G3 决策 > G4 量化 > G5 反思
// 排序理由：不知道他做了什么，后面全是空的；故事不成立，问下去也没意义。
// 通用缺口（两个维度共用）
const GAPS=[
  {code:'G1',priority:100,name:'人称',label:'"我们"太多，看不出你做了什么',test:s=>s.ownRatio<0.4},
  {code:'G2',priority:90,name:'摩擦力',label:'故事里没有真实的障碍',test:s=>!s.friction},
  {code:'G3',priority:80,name:'决策',label:'听不出你的取舍和判断',test:s=>!s.decision},
  {code:'G4',priority:70,name:'量化',label:'结果没有数字',test:s=>s.quantDensity<0.3},
  {code:'G5',priority:50,name:'反思',label:'没有复盘',test:s=>!s.reflection}
];
// D1 专用缺口：业务判断维度问的是「取舍」，光有决策词不够，
// 还要说清选项、代价，以及这个取舍是不是真的成立。
const GAPS_D1=[
  {code:'G6',priority:95,name:'选项',label:'没说清当时有哪几个选项',test:(s,t)=>!RE_OPTION.test(t)},
  {code:'G7',priority:85,name:'代价',label:'没说你放弃了什么',test:(s,t)=>!RE_TRADEOFF.test(t)},
  {code:'G8',priority:88,name:'伪取舍',label:'听起来当时没得选，或选项优劣悬殊',test:(s,t)=>(RE_NO_CHOICE.test(t)&&!RE_OPTION.test(t))||(RE_OBVIOUS.test(t)&&!RE_TRADEOFF.test(t))}
];
// D3 专用：冲突里有没有承认对方合理、有没有把对方写成坏人
const GAPS_D3=[
  {code:'G9',priority:92,name:'对方立场',label:'没看出你理解对方的立场',test:(s,t)=>!RE_UNDERSTAND.test(t)},
  {code:'G10',priority:86,name:'归因',label:'把分歧归成对方能力或态度问题',test:(s,t)=>RE_BLAME.test(t)&&!RE_UNDERSTAND.test(t)}
];
// D4 专用：凡尔赛式缺点、没说代价
const GAPS_D4=[
  {code:'G11',priority:96,name:'伪缺点',label:'这是优点包装，不是真缺点',test:(s,t)=>RE_HUMBLEBRAG.test(t)},
  {code:'G12',priority:84,name:'责任',label:'没看出你承认这是自己的判断失误',test:(s,t)=>!RE_OWN_FAULT.test(t)&&RE_COST.test(t)}
];
// D5 专用：硬扛、没调整
const GAPS_D5=[
  {code:'G13',priority:94,name:'硬扛',label:'听起来是硬扛下来的，没有做任何调整',test:(s,t)=>RE_HARD_ENDURE.test(t)&&!RE_ADJUST.test(t)},
  {code:'G14',priority:82,name:'调整',label:'没说清你做了什么调整或取舍',test:(s,t)=>!RE_ADJUST.test(t)}
];

const DIM_GAPS={D1:GAPS_D1,D3:GAPS_D3,D4:GAPS_D4,D5:GAPS_D5};
// 按维度组装缺口表：通用缺口 + 该维度的专用缺口。
function gapsFor(dimId){
  const extra=DIM_GAPS[dimId];
  if(!extra)return GAPS;
  return [...GAPS,...extra].sort((a,b)=>b.priority-a.priority);
}

// text 参与判定：G6–G8 需要看原文，不只是聚合信号。
function detectGaps(signals,text,dimId){
  const src=String(text||'');
  return gapsFor(dimId)
    .filter(g=>g.test(signals,src))
    .sort((a,b)=>b.priority-a.priority)
    .map(g=>({code:g.code,name:g.name,label:g.label,priority:g.priority}));
}

/* 每轮只问 1 条；命中多个取最高优先级；最多 2 轮。
   全部通过 → 返回 null，直接进诊断（不要为了追问而追问）。 */
const MAX_TURNS=2;
function nextProbe(gaps,turn){
  if(turn>=MAX_TURNS)return null;
  return gaps.length?gaps[0]:null;
}

/* ========== 话术库（20 条，社招语域：更直接、更平等、可轻微施压） ========== */
const UTTERANCES={
  G1:[
    '你刚才说的"我们"里，哪一部分是你亲自做的？',
    '如果把你从这个项目里拿掉，结果会有什么不同？',
    '这个方案是你提的，还是团队一起定的？',
    '你说的"负责"，具体是决策、执行，还是协调？',
    '这个决定如果做错了，是谁承担责任？'
  ],
  G2:[
    '这件事最难的地方具体是什么？是人不配合、资源不够，还是时间不够？',
    '有没有人明确反对过？他反对的理由是什么？',
    '如果不推动，最坏的后果是什么？',
    '这个项目里有没有出现过"差点做不成"的时刻？'
  ],
  G3:[
    '当时你有几个选项？为什么选这个不选那个？',
    '你放弃了什么？',
    '这个判断是你做的，还是你上级做的？',
    '做这个决定的时候，你手上有什么信息？缺什么信息？',
    '如果当时数据和你直觉相反，你会怎么选？'
  ],
  G4:[
    '这个结果有数字吗？比如周期缩短了多少、覆盖了多少人。',
    '怎么衡量这件事做成了？',
    '做之前是什么水平？做完之后呢？',
    '这个数字是怎么统计的？有别人能佐证吗？'
  ],
  G5:[
    '如果重来一次，你会在哪一步做得不一样？',
    '这件事之后，你改变了什么做法？',
    '你从这个项目里学到的最反直觉的一件事是什么？',
    '当时有没有人提醒过你？你为什么没听？'
  ],
  // D1 专用：追问取舍的三件套
  G6:[
    '当时你手上有几个选项？分别是什么？',
    '除了这个方案，还有别的做法吗？',
    '如果当时不做这件事，会有什么后果？'
  ],
  G7:[
    '选了它，你放弃了什么？',
    '为了做这件事，你牺牲了哪一块？',
    '这个决定的代价是什么？'
  ],
  G8:[
    '当时真的没得选吗？还是其实有别的路但你没考虑？',
    '你说 A 明显更好——好在哪？当时是怎么判断的？',
    '如果当时选另一个，会差在哪里？'
  ],
  // D3 协作与冲突
  G9:[
    '他当时为什么坚持那个做法？他担心的是什么？',
    '站在他的位置上，他的顾虑合理在哪？',
    '你有没有先问过他为什么要这样？'
  ],
  G10:[
    '这件事里对方有没有哪部分是对的？',
    '如果换个角度看，他的做法解决了什么问题？',
    '你刚才说的这些，有多少是立场不同造成的？'
  ],
  // D4 复盘与成长
  G11:[
    '这个"缺点"让你付出过什么代价？举一个具体的。',
    '有没有哪次因为这个"缺点"真的搞砸了事？',
    '换成你的同事，他会怎么评价你这个短板？'
  ],
  G12:[
    '这件事里，哪一部分是你自己的判断出了问题？',
    '如果当时你多想一步，会不一样吗？',
    '除了外部原因，你自己哪里可以做得不同？'
  ],
  // D5 压力与稳定性
  G13:[
    '除了硬扛，当时有没有别的做法？比如砍范围或者找人？',
    '如果再来一次，你还会选择一个人扛吗？',
    '当时有没有提前跟人说过这个风险？'
  ],
  G14:[
    '压力最大的时候，你具体调整了什么？',
    '你放弃了哪部分，为什么是那部分？',
    '有没有找谁帮忙，或者要求延期？'
  ]
};
function utteranceCount(){return Object.values(UTTERANCES).reduce((n,a)=>n+a.length,0);}
// seed 让同一用户连续两次不撞同一句。
// 只靠 seed 不够：用户每次新开一轮 seed 都从 0 开始，第二轮还会拿到第一句。
// 所以再传一个 used 列表（该用户已经听过的句子），优先挑没听过的。
function pickUtterance(code,seed,used){
  const pool=UTTERANCES[code];
  if(!pool||!pool.length)return '';
  const heard=Array.isArray(used)?used:[];
  const fresh=pool.filter(u=>!heard.includes(u));
  // 全部听过就回到轮换，不能因为都听过就不给追问。
  const from=fresh.length?fresh:pool;
  const i=Math.abs(Number(seed)||0)%from.length;
  return from[i];
}

// 记录已用话术，最多留最近 200 条，避免无限增长。
function rememberUtterance(used,utterance){
  const list=Array.isArray(used)?used.slice():[];
  if(utterance&&!list.includes(utterance))list.push(utterance);
  return list.slice(-200);
}

/* ========== 结构检查器（S/T/A/R） ========== */
const RE_S=/(?:当时|那时|那年|去年|今年|上半年|下半年|Q[1-4]|\d{4}\s*年|\d+\s*月|期间|项目|阶段|团队\s*\d+\s*人|\d+\s*人(?:的)?团队)/;
const RE_T=/(?:我的任务|我负责|我承担|目标是|要求是|需要我|指标是|我的角色|我被要求|负责的是)/;
const RE_R=/(?:结果|最终|最后|上线|交付|提升|下降|降低|增长|达成|完成|超额|拿到|省了|减少了|提高了)/;

function starCheck(text){
  const t=String(text||'');
  const s=analyze(t);
  const rows=sentences(t);
  const hasS=RE_S.test(t);
  const hasT=RE_T.test(t);
  const actionHits=rows.filter(r=>RE_CONCRETE.test(r)).length;
  const hasA=actionHits>=2;
  const hasR=RE_R.test(t)&&s.quantDensity>=0.15;
  const status=(ok,partial)=>ok?'ok':partial?'warn':'miss';
  return [
    {key:'S',label:'情境',status:status(hasS,RE_S.test(t)&&t.length>60),hint:'交代背景：什么场景、多大规模、你的角色'},
    {key:'T',label:'任务',status:status(hasT,s.decision),hint:'说清目标是谁定的、你要交付什么'},
    {key:'A',label:'行动',status:status(hasA,s.concrete),hint:'落到"我"的具体动作，不是"我们"'},
    {key:'R',label:'结果',status:status(hasR,s.quantDensity>0),hint:'用数字证明，并说清怎么衡量的'}
  ];
}

/* ========== 档位判定 ========== */
// 判定顺序：先看有没有个人动作，再看有没有具体阻力，再看有没有取舍，最后看有没有机制。
// 三个横向信号作为调节因子封顶，不单独计分。
function judge(text,options){
  const opt=options||{};
  const dimId=opt.dimension||'D2';
  const s=analyze(text);
  const gaps=detectGaps(s,text,dimId);
  let score;
  if(dimId==='D1'){
    // 业务判断维度按「取舍是否成立」判，不按「有没有阻力」判。
    score=judgeDecision(text).score;
  }else if(dimId==='D3'){
    score=judgeCollab(text).score;
  }else if(dimId==='D4'){
    score=judgeGrowth(text).score;
  }else if(dimId==='D5'){
    score=judgePressure(text).score;
  }else{
    // 强否：被指派且没有主动动作。「领导让我推」+「我按他说的做」= 全程被动，
    // 即使句子里有「做」也不算个人动作。
    if(s.passive&&!hasInitiative(text))score=0;
    else if(s.vagueOnly)score=1;                       // 否：只有空泛动词
    else if(s.concrete&&s.friction)score=s.decision?3:2; // 有具体动作+阻力：中性；再加取舍：是
    else if(s.concrete)score=2;                        // 有动作但故事没有真实障碍
    else score=1;
    if(score>=3&&s.mechanism)score=4;                  // 是 → 强是：需要机制证据
  }
  const caps=[];
  if(s.ownRatio<0.4&&score>2){score=2;caps.push({code:'X-OWN',reason:'"我们"太多，个人贡献无法确认，封顶「中性」'});}
  if(s.quantDensity<0.3&&score>3){score=3;caps.push({code:'X-QUANT',reason:'结果没有数字，封顶「是」'});}
  const level=levelByScore(score);
  const jobStage=opt.jobStage&&STAGE_IDS.includes(opt.jobStage)?opt.jobStage:'owner';
  const required=STAGE_REQUIRED[jobStage];
  const alignment=score>=required?'met':'below';
  return {
    level:level.id,levelName:level.name,score,
    required,requiredName:levelName(LEVEL_IDS[required]),
    jobStage,jobStageName:stageName(jobStage),
    alignment,
    signals:s,gaps,caps,
    star:starCheck(text),
    evidence:evidenceFor(text,gaps),
    nextStep:nextStepFor(gaps,caps,alignment,dimId)
  };
}

// 每条缺口挂一句用户原话，让判定可核对（"因为你说过这句话"）
// 证据去重：多个缺口常常引用同一句话（回答很短时尤其明显）。
// 同一句原文只保留一条，缺口名合并，否则界面上会出现五行一模一样的引用。
function evidenceFor(text,gaps){
  const rows=sentences(text);
  const seen=new Map();
  const raw=gaps.map(g=>{
    let quote='';
    if(g.code==='G1')quote=rows.find(r=>RE_PLURAL.test(r)&&!RE_SELF.test(r))||rows[0]||'';
    else if(g.code==='G2')quote=rows.find(r=>/困难|挑战|难|问题/.test(r))||'';
    else if(g.code==='G3')quote=rows.find(r=>/然后|后来|就|于是/.test(r))||'';
    else if(g.code==='G4')quote=rows.find(r=>RE_R.test(r)&&!RE_NUM.test(r))||'';
    else if(g.code==='G5')quote=rows[rows.length-1]||'';
    else if(g.code==='G6')quote=rows.find(r=>/方案|选项|选择|做/.test(r))||'';
    else if(g.code==='G7')quote=rows.find(r=>/选了|决定|采用/.test(r))||'';
    else if(g.code==='G8')quote=rows.find(r=>RE_NO_CHOICE.test(r)||RE_OBVIOUS.test(r))||'';
    else if(g.code==='G9'||g.code==='G10')quote=rows.find(r=>RE_BLAME.test(r))||rows[0]||'';
    else if(g.code==='G11')quote=rows.find(r=>RE_HUMBLEBRAG.test(r))||'';
    else if(g.code==='G12')quote=rows.find(r=>RE_COST.test(r))||'';
    else if(g.code==='G13')quote=rows.find(r=>RE_HARD_ENDURE.test(r))||'';
    else if(g.code==='G14')quote=rows[0]||'';
    return {code:g.code,name:g.name,quote:quote.slice(0,120)};
  }).filter(e=>e.quote);
  for(const e of raw){
    const hit=seen.get(e.quote);
    if(hit){if(!hit.names.includes(e.name))hit.names.push(e.name);}
    else seen.set(e.quote,{code:e.code,name:e.name,names:[e.name],quote:e.quote});
  }
  return [...seen.values()].map(e=>({code:e.code,name:e.names.join(' / '),quote:e.quote}));
}

// 每次只给 1 条可执行动作（给 5 条用户一条都记不住）。
// 已达标时优先「推进」而不是继续挑毛病——否则用户会觉得怎么答都不对。
// D1 维度里，「伪取舍」比人称更致命——如果当时根本没得选，
// 把"我们"改成"我"也没有意义，整段故事仍然不成立。
// 每个维度都有「最致命」的缺口，要优先修，不能一律按通用优先级。
const DIM_PRIORITY={
  D1:['G8','G6','G7','G3','G1','G2','G4','G5'],
  D3:['G10','G9','G3','G1','G2','G4','G5'],
  D4:['G11','G12','G4','G5','G1','G2','G3'],
  D5:['G13','G14','G3','G4','G1','G2','G5']
};
function nextStepFor(gaps,caps,alignment,dimId){
  if(caps.length)return caps[0].reason+'。先补一个"我亲自做了什么"的句子。';
  const prio=DIM_PRIORITY[dimId];
  if(prio&&gaps.length){
    const order=prio.map(c=>gaps.find(g=>g.code===c)).filter(Boolean);
    if(order.length)gaps=[order[0],...order.slice(1)];
  }
  if(alignment==='met'){
    if(!gaps.length)return '这题的结构和证据都够，可以换下一题。';
    const bonus={G5:'已经达标。想更稳可以再补一句复盘：如果重来，你会在哪一步做得不一样。'};
    if(bonus[gaps[0].code])return bonus[gaps[0].code];
    return '已经达标。可以换下一题，或把这段打磨成你的标准故事。';
  }
  if(gaps.length){
    const map={
      G1:'把这段话里的"我们"逐个换成"我"，只保留你真正做过的部分。',
      G2:'补一句具体的障碍：谁反对、反对什么、当时最坏会怎样。',
      G3:'补一句你的取舍：当时有几个选项，你为什么选这个。',
      G4:'补一个数字：做之前是什么水平，做完之后是多少。',
      G5:'补一句复盘：如果重来，你会在哪一步做得不一样。',
      G6:'先把选项摆出来：当时有几个方案，分别是什么。',
      G7:'补一句代价：选了它，你放弃了什么。',
      G8:'这个取舍可能不成立——当时是真的有别的选择吗？如果有，说清另一个为什么不行。',
      G9:'补一句对方当时担心什么：他为什么坚持那个做法。',
      G10:'这段把对方写成了不讲理的人。补一句他哪部分是对的。',
      G11:'这是优点包装。换一个真的让你付出过代价的短板。',
      G12:'补一句你自己哪里判断错了，而不是只讲外部原因。',
      G13:'这段听起来是硬扛。补一句你当时做的调整：砍了什么、找了谁、说了什么风险。',
      G14:'补一句具体调整：你砍掉了什么、找谁帮了忙、或者跟谁说了风险。'
    };
    return map[gaps[0].code]||'';
  }
  return '结构已经完整。但这个岗位要求「'+levelName(LEVEL_IDS[STAGE_REQUIRED.owner])+'」以上的证据，你需要再补一个"把这件事变成机制"的细节。';
}

/* ========== D1 专项判定：真取舍 vs 伪取舍 ========== */
// 这个维度最需要防的错是「伪取舍」：用户讲了一个选择，但细看当时根本没得选。
// 三种典型：
//   ① 只有一个选项（"我们就这一个方案"）
//   ② 选项优劣悬殊（"A 明显更好，当然选 A"）
//   ③ 事后编理由（"后来想想可能是因为……"）
const RE_NO_CHOICE=/(?:只能|不得不|没办法|没有其他选择|就这一个|唯一(?:的)?(?:选择|方案)|非做不可|上面定的|领导定的|必须)/;
const RE_OBVIOUS=/(?:显然|明显(?:更好|更优)|当然选|肯定选|不用说|毫无悬念|想都不用想)/;
const RE_RETRO=/(?:后来想|事后想|回过头看|现在想想|当时没想那么多|凭感觉|直觉|说不上来)/;
// 取舍的正面证据：说清选项 + 说清放弃的代价
// 选项标记要容忍标点：「方案：A」「方案 A」「A 和 B」都算。
const RE_OPTION=/(?:方案\s*[:：]?\s*[AB甲乙12]|[AB甲乙]\s*方案|一个方案|另一个|要么|两种|三条路|备选|选项|替代方案|[AB]\s*和\s*[AB])/;
const RE_TRADEOFF=/(?:放弃|牺牲|代价|换来|换取|不做|砍掉|舍掉|先不做|推到下一期|优先级|取舍|权衡)/;
// 判断依据的质量
const RE_BASIS_STRONG=/(?:数据|指标|测算|ROI|成本|转化率|留存|样本|调研|验证|试点|灰度|A\/B|对比|实验)/;
const RE_BASIS_WEAK=/(?:感觉|觉得|应该|大概|差不多|经验判断|直觉)/;

function judgeDecision(text){
  const t=String(text||'');
  const s=analyze(t);
  let score;
  const hasOption=RE_OPTION.test(t);
  const hasTradeoff=RE_TRADEOFF.test(t);
  const strongBasis=RE_BASIS_STRONG.test(t);
  const weakBasis=RE_BASIS_WEAK.test(t);
  if(RE_NO_CHOICE.test(t)&&!hasOption)score=0;             // 强否：当时没得选
  else if(RE_OBVIOUS.test(t)&&!hasTradeoff)score=1;        // 否：选项优劣悬殊，不算判断
  else if(!hasOption||!hasTradeoff)score=1;                // 否：没说清选项或没付出代价
  else if(RE_RETRO.test(t)||weakBasis&&!strongBasis)score=2; // 中性：有取舍但依据是直觉
  else if(strongBasis&&hasSelfAction(t))score=3;           // 是：有数据依据 + 个人动作
  else score=2;
  if(score>=3&&hasMechanism(t))score=4;                    // 强是：判断标准被复用
  return {score,signals:s,hasOption,hasTradeoff,strongBasis};
}

/* ========== D3 专项判定：协作与冲突 ========== */
// 核心不是「有没有解决」，而是「有没有承认对方合理」。
// 把对方写成完全不讲理的人，即使结果做成了也不加分——这种人进团队会持续制造摩擦。
// 覆盖面要够：「对方完全不讲理，水平也差」这类说法必须能识别，
// 否则会把贬低对方的回答判成中性。
const RE_BLAME=/(?:他|对方|那人)[^，。；！？\n]{0,10}(?:不专业|不懂|不行|瞎指挥|固执|不讲理|水平(?:差|不行|一般)|能力(?:差|不行)|不配合|沟通不了|没法沟通|莫名其妙|离谱|蠢|菜)/;
const RE_UNDERSTAND=/(?:我理解|我能理解|他的顾虑|他的立场|站在他角度|换位|他担心|他压力|他的 KPI|他也有道理|确实有道理|他的出发点)/;
const RE_ESCALATE=/(?:领导拍板|让领导定|上报|交给上级|最后领导|老板决定)/;
const RE_MECH_COLLAB=/(?:分工边界|职责边界|决策规则|谁拍板|升级机制|同步节奏|例会|对齐机制|接口人|SLA|协作规范)/;

function judgeCollab(text){
  const t=String(text||'');
  const s=analyze(t);
  let score;
  const understands=RE_UNDERSTAND.test(t);
  const blame=RE_BLAME.test(t);
  const escalated=RE_ESCALATE.test(t)&&!hasSelfAction(t);
  if(blame&&!understands)score=0;                        // 强否：把对方写成坏人
  else if(s.vagueOnly)score=1;                            // 否：只有"沟通了一下"
  else if(escalated)score=2;                              // 中性：靠领导拍板解决
  else if(understands&&s.concrete&&hasDecision(t))score=3; // 是：先理解再用事实推动
  else if(s.concrete)score=2;                             // 中性：有动作但没体现理解对方
  else score=1;
  if(score>=3&&RE_MECH_COLLAB.test(t))score=4;            // 强是：建立了减少冲突的机制
  return {score,signals:s,understands,blame};
}

/* ========== D4 专项判定：复盘与成长 ========== */
// 复用缺点题的凡尔赛识别；这里额外要求「代价 + 改变」两个都具体。
// 「预估不足」「想当然」都是自认失误的常见说法，原表里漏了。
// 「我」和自认失误的动词之间常夹着别的字（我有一次低估了…），
// 所以留 6 字窗口，不能要求紧跟。
const RE_OWN_FAULT=/(?:我[^，。；！？\n]{0,6}(?:判断错|估计错|决定错|低估|高估|没想到|疏忽|漏了|错在|以为|预估不足|想当然|大意|看错|太乐观|过于乐观|太自信|过于自信)|是我(?:的)?(?:问题|责任|失误)|(?:我)?预估(?:不足|错了))/;
const RE_SPECIFIC_CHANGE=/(?:后来我(?:改成|建立|加|固定|开始)|现在我会|我加了个|我定了|我要求|我改成|下次遇到.{0,10}我)/;

function judgeGrowth(text){
  const t=String(text||'');
  const s=analyze(t);
  let score;
  if(RE_HUMBLEBRAG.test(t))score=0;                        // 强否：凡尔赛式缺点
  else if(!RE_COST.test(t))score=1;                        // 否：承认失误但说不出代价
  else if(!RE_OWN_FAULT.test(t))score=1;                   // 否：代价说了但不认为是自己的判断
  else if(!RE_SPECIFIC_CHANGE.test(t))score=2;             // 中性：有代价有责任，改变只是"会更注意"
  else if(hasSelfAction(t))score=3;                        // 是：具体可观察的改变
  else score=2;
  if(score>=3&&hasMechanism(t))score=4;                    // 强是：教训变成团队可用的规则
  return {score,signals:s};
}

/* ========== D5 专项判定：压力与稳定性 ========== */
// 最需要防的错：把「硬扛」当「抗压」。
// 连续通宵、一个人顶住，在成熟团队里反而是风险信号——说明他不会提前暴露问题。
const RE_HARD_ENDURE=/(?:连续(?:加班|通宵)|通宵|熬了(?:几|好)?(?:天|夜)|一个人(?:扛|顶)|硬扛|咬牙|撑下来|没日没夜|几乎没睡)/;
// 「说」本身不算调整——「从没跟领导说过压力」也含"跟领导说"，
// 会被误判成做了调整。必须是实质动作：砍范围、加人、改排期、求助。
const RE_ADJUST=/(?:砍掉|缩减|减(?:少)?范围|降级|推迟|延后|加人|借调|求助|找(?:人|资源)(?:帮忙|支持)|调整(?:范围|预期|节奏|排期)|重新排期|分阶段|先做核心|先保核心|提前暴露|同步风险|说了风险|报了风险)/;

function judgePressure(text){
  const t=String(text||'');
  const s=analyze(t);
  let score;
  const adjusts=RE_ADJUST.test(t);
  const hardEndure=RE_HARD_ENDURE.test(t);
  // 硬扛优先：只要出现「通宵 / 一个人扛」且没有实质调整动作，就是风险信号。
  // 注意不能靠 decision 判断——「跟领导说了压力」里的"说了"会误触发决策词。
  if(hardEndure&&!adjusts)score=0;                         // 强否：只有硬扛，没有任何调整
  else if(!adjusts)score=1;                                // 否：说了加班赶完，没说怎么取舍
  else if(!hasDecision(t))score=2;                         // 中性：有调整但没说明依据
  else score=3;                                            // 是：识别压力来源并主动调整
  if(score>=3&&RE_MECH_COLLAB.test(t))score=4;             // 强是：建立预警或缓冲机制
  return {score,signals:s,adjusts,hardEndure};
}

/* ========== 换位模式（极轻版 3 题） ========== */
// 换位模式每题有自己的判定口径：S2 是「缺点题」、S3 是「结果题」，
// 都不能套 D2 推动力的锚点，否则引擎判定会和专家判定打架。
const SWAP=[
  {
    id:'S1',dimension:'推动力',rule:'D2',
    answer:'我们团队一起推动了一个跨部门项目，中间有很多困难，最后成功了，领导也很认可。',
    commonPick:'yes',commonReason:'完整、有难度、有结果',
    expertLevel:'no',
    why:[
      '全程"我们"，无法判断个人贡献',
      '"很多困难"零细节，没有具体障碍',
      '"领导认可"不是结果指标',
      '三个横向信号全不达标，任何维度的锚点都够不上「中性」'
    ],
    punch:'你觉得"完整"，是因为它形式完整；面试官判"否"，是因为它没有一处可验证。'
  },
  {
    id:'S2',dimension:'复盘成长',rule:'weakness',
    answer:'我最大的缺点是我太追求完美，有时候会因为抠细节影响进度。',
    commonPick:'neutral',commonReason:'很坦诚、有自我认知',
    expertLevel:'strong_no',
    why:[
      '这是"凡尔赛式缺点"，本质是优点包装',
      '没有具体事件、没有代价、没有改变',
      '面试官的真实解读是"你不愿意暴露真实短板"'
    ],
    punch:'这题考的不是"你有没有缺点"，是"你敢不敢说一个真的让你付出过代价的缺点"。'
  },
  {
    id:'S3',dimension:'结果导向',rule:'result',
    answer:'我负责的模块上线后效果很好，用户反馈不错，后来还推广到了其他团队。',
    commonPick:'yes',commonReason:'有结果、有影响面扩大',
    expertLevel:'no',
    why:[
      '"效果很好"无基准、无数字',
      '"反馈不错"无法验证',
      '"推广到其他团队"是结果，但没说是谁推动的'
    ],
    punch:'面试官听到"效果很好"时，脑子里想的是"好到什么程度，和谁比"。'
  }
];

/* 缺点题：凡尔赛式缺点（把优点包装成缺点）判「强否」；
   真缺点但没有代价、没有改变，判「否」；有具体代价且说清改变，才给到「中性」以上。 */
const RE_HUMBLEBRAG=/(?:太追求完美|追求完美|完美主义|太认真|太拼|工作狂|太较真|对自己要求(?:太)?高|不懂得拒绝|太注重细节|抠细节|太在意结果|有点固执)/;
const RE_COST=/(?:导致|造成|结果|代价|延期|返工|出错|错过|被投诉|被批评|挨批|损失|扣了|黄了|丢单|吵过|闹僵)/;
const RE_CHANGE=/(?:后来我|现在我会|我改成|我学会了|我建立了|我开始|从那以后|我调整了|我做了.{0,6}(?:清单|机制|流程|模板))/;
function judgeWeakness(text){
  const t=String(text||'');
  const s=analyze(t);
  let score;
  if(RE_HUMBLEBRAG.test(t))score=0;                       // 强否：优点包装
  else if(!RE_COST.test(t))score=1;                       // 否：说了缺点但没有代价
  else if(!RE_CHANGE.test(t))score=2;                     // 中性：有真实代价，但说不出改变
  else score=3;                                           // 是：代价 + 改变都具体
  return {score,signals:s};
}

/* 结果题：没有基准、没有数字、没有推动者，判「否」；
   有数字但没基准，判「中性」；有基准对比，才给「是」。 */
const RE_BASELINE=/(?:之前|原来|从.{0,8}到|对比|相比|比原来|提升到|降到|变成|基准)/;
function judgeResult(text){
  const t=String(text||'');
  const s=analyze(t);
  let score;
  if(s.quantDensity===0)score=1;                          // 否：无数字
  else if(!RE_BASELINE.test(t))score=2;                   // 中性：有数字但没基准
  else if(!hasSelfAction(t))score=2;                      // 中性：有基准但说不清谁推动
  else score=3;                                           // 是：基准 + 数字 + 个人动作
  return {score,signals:s};
}

// 按 rule 分派，供换位模式与未来扩维度时复用
function judgeByRule(rule,text,options){
  const wrap=r=>Object.assign(judge(text,options),{score:r.score,level:levelByScore(r.score).id,levelName:levelByScore(r.score).name});
  if(rule==='weakness')return wrap(judgeWeakness(text));
  if(rule==='result')return wrap(judgeResult(text));
  if(rule==='decision')return wrap(judgeDecision(text));
  if(rule==='collab')return wrap(judgeCollab(text));
  if(rule==='growth')return wrap(judgeGrowth(text));
  if(rule==='pressure')return wrap(judgePressure(text));
  return judge(text,options);
}

/* ========== 动机题：不走 BARS，走风险扫描 ========== */
// 动机是内部状态，没有可观察的行为可锚定——硬套五档锚点会产出
// 「你的动机只有 60 分」这种既无法验证也无法执行的话。
// 所以这里评的不是「动机好不好」，而是「这段话在面试官眼里有没有风险信号」。
// 前者是道德判断，后者是技术判断；只有后者能给出可行动的建议。
const MOTIVE={
  id:'M',
  name:'动机与稳定性',
  definition:'离职原因、岗位选择与稳定性——不评动机纯不纯，只看表达里有没有会被读成风险的地方。',
  questions:[
    {id:'M-Q1',q:'你为什么离开上一份工作？',hint:'想一想：说事实，不说人。把「受不了什么」换成「发生了什么」。'},
    {id:'M-Q2',q:'你为什么选择我们这个岗位 / 公司？',hint:'想一想：能不能说出一个只有做过功课才知道的细节。'},
    {id:'M-Q3',q:'你未来三年希望自己在什么位置上？',hint:'想一想：你想要的东西，这个岗位能不能给。'}
  ]
};

// 每条红旗都配一条可行动建议——只说「有风险」而不说「怎么改」等于没说。
const MOTIVE_FLAGS=[
  {
    code:'M1',priority:95,name:'贬低前雇主',
    label:'听起来在说前公司或前领导的不是',
    test:t=>/(?:领导|老板|上级|公司|团队)[^，。；！？\n]{0,12}(?:不行|烂|差|混乱|傻|坑|画饼|甩锅|不讲理|官僚|内斗|PUA)/.test(t),
    advice:'改成描述事实：发生了什么、对你的工作造成了什么影响。不评价人。'
  },
  {
    code:'M2',priority:80,name:'归因外部',
    label:'离职原因全指向外部，没提自己的选择',
    test:t=>{
      const external=/(?:公司|领导|团队|业务|部门|老板)[^，。；！？\n]{0,10}(?:调整|变动|裁员|倒闭|不行|问题)/.test(t);
      const self=/(?:我想|我希望|我决定|我判断|我选择|我主动)/.test(t);
      return external&&!self;
    },
    advice:'补一句你自己的判断：你为什么选择离开，而不是只讲公司发生了什么。'
  },
  {
    code:'M3',priority:75,name:'说不出想要什么',
    label:'只说了不想怎样，没说要什么',
    test:t=>{
      const want=/(?:我想做|我希望|我看重|我想要|吸引我|我期待|能让我)/.test(t);
      const notWant=/(?:不想|不希望|不想再|受不了|厌倦)/.test(t);
      return notWant&&!want;
    },
    advice:'把「不想要什么」翻译成「想要什么」：你希望下一份工作给你什么。'
  },
  {
    code:'M4',priority:85,name:'没做功课',
    label:'看不出对这个岗位做过了解',
    test:t=>{
      const specific=/(?:贵司|咱们|你们|公司)[^，。；！？\n]{0,20}(?:产品|业务|技术|团队|方向|阶段|客户|线)/.test(t)
        ||/(?:我看到|了解到|注意到|听说)[^，。；！？\n]{0,20}(?:在做|已经|正在|最近)/.test(t);
      return !specific&&t.length>20;
    },
    advice:'补一个只有做过功课才知道的细节：他们在做什么业务、遇到什么问题。'
  },
  {
    code:'M5',priority:90,name:'稳定性存疑',
    label:'短期内多次跳槽，没有主动解释',
    test:(t,ctx)=>{
      if(!ctx||!ctx.shortStints)return false;
      return !/(?:因为|原因是|当时|那段时间|特殊情况|公司(?:调整|裁员|倒闭))/.test(t);
    },
    advice:'主动给一个解释，别等面试官问。短期多次变动最容易被读成不稳定。'
  }
];

// 风险扫描：返回命中的红旗 + 建议，不给分数、不给档位。
function scanMotive(text,ctx){
  const t=String(text||'');
  const hits=MOTIVE_FLAGS.filter(f=>f.test(t,ctx||{}))
    .map(f=>({code:f.code,name:f.name,label:f.label,advice:f.advice}));
  return {
    // 明确不给 level / score：动机题不该有档位。
    flags:hits,
    riskCount:hits.length,
    // 一句话结论，只说风险等级，不说好坏。
    headline:hits.length===0?'这段话没有明显风险信号。'
      :hits.length<=1?'有 '+hits.length+' 处可能被读成风险，改掉更稳。'
      :'有 '+hits.length+' 处可能被读成风险，建议逐条改。'
  };
}

/* ========== 一轮练习：组题与小结 ========== */
// 单题诊断只能回答「这题答得怎样」，一轮才能回答「我哪个维度最弱」。
// 后者才是用户真正需要的——它直接决定下一次练什么。
// 一轮 = 五个行为维度 + 一道动机题。
// 动机题放在最后：它不参与达标统计，但社招最常挂在这里，
// 放在末尾能确保前面五个维度先练完，不会因为动机题卡住就放弃整轮。
const ROUND_SIZE=DIMENSIONS.length+1;
// 一轮实际题数随轮次变化：HR 面四题、业务面四题、都要练六题。
function roundSize(round){
  return dimensionsForRound(round).length+(roundHasMotive(round)?1:0);
}

// 按档位为每个维度各出一题，组成一轮。
function buildRound(jobStage,dimIds,opts){
  const o=opts||{};
  const ids=Array.isArray(dimIds)&&dimIds.length?dimIds:dimensionsForRound(o.round);
  const round=ids.map(id=>{
    const d=dimension(id);
    const q=pickQuestion(jobStage,id,{hasReports:o.hasReports});
    return {dimensionId:d.id,dimensionName:d.name,questionId:q.id,question:q.q,hint:q.hint,kind:'behavior'};
  });
  // 动机题只在完整一轮且该轮包含动机时追加（业务面不问离职原因）
  const full=!Array.isArray(dimIds)||!dimIds.length;
  if(full&&roundHasMotive(o.round)){
    const mq=MOTIVE.questions[0];
    round.push({dimensionId:'M',dimensionName:MOTIVE.name,questionId:mq.id,question:mq.q,hint:mq.hint,kind:'motive'});
  }
  return round;
}

// 整轮小结：按维度汇总档位，找出最该补的那一个。
// 判定「最弱」不只看分数，还要看离达标差多少——差两档比差一档更紧急。
function roundSummary(items,jobStage){
  const all=items||[];
  // 动机题没有档位，单独拆出来：不进达标统计，但要在小结里占一行。
  const motive=all.find(it=>it.dimensionId==='M')||null;
  const rows=all.filter(it=>it.dimensionId!=='M').map(it=>{
    const level=it.level||'strong_no';
    const score=LEVEL_IDS.indexOf(level);
    const required=STAGE_REQUIRED[jobStage]||3;
    return {
      dimensionId:it.dimensionId,
      dimensionName:it.dimensionName||dimension(it.dimensionId).name,
      level,
      levelName:levelName(level),
      score,
      required,
      gap:Math.max(0,required-score),
      met:score>=required,
      nextStep:it.nextStep||''
    };
  });
  const metCount=rows.filter(r=>r.met).length;
  // 排序：先按差距大的，再按权重高的（同样差一档，业务判断比压力稳定更值得先补）
  const weakest=[...rows].sort((a,b)=>{
    if(b.gap!==a.gap)return b.gap-a.gap;
    return (dimension(b.dimensionId).weight_default||0)-(dimension(a.dimensionId).weight_default||0);
  })[0]||null;
  const motiveRow=motive?{
    dimensionId:'M',
    dimensionName:MOTIVE.name,
    riskCount:Number.isInteger(motive.riskCount)?motive.riskCount:0,
    nextStep:motive.nextStep||''
  }:null;
  const base=rows.length?(metCount===rows.length
    ?'这一轮 '+rows.length+' 个维度都达标了。可以换更高的岗位标准再练一遍。'
    :'这一轮 '+metCount+' / '+rows.length+' 个维度达标。最该补的是「'+weakest.dimensionName+'」。'):'还没有可汇总的题目。';
  // 动机题有风险时补一句——行为维度都过了但离职原因讲了前公司坏话，是社招最常见的挂法。
  const motiveNote=motiveRow&&motiveRow.riskCount>0
    ?'另外，动机题有 '+motiveRow.riskCount+' 处可能被读成风险，建议先改这一块。':'';
  return {
    rows,
    total:rows.length,
    metCount,
    metRate:rows.length?metCount/rows.length:0,
    weakest,
    motive:motiveRow,
    headline:base+motiveNote
  };
}

/* ========== 方法卡：在用户卡住的那一刻给他需要的那一张 ========== */
// 不做成课程目录。用户不需要知道一共有多少张卡，
// 只在他正好需要的那一秒看到那一张——这是 OPM 那条结论的产品化：
// 用户天然讨厌结构化，越系统地教他跑得越快。
const CARDS=[
  {
    id:'C1',title:'STAR 是什么（30 秒版）',
    when:'首次答完第一题',
    body:'把一段经历切成四段：当时什么场景（S）、你要交付什么（T）、你具体做了什么（A）、结果如何（R）。重点在 A 要落到"我"，R 要能验证。'
  },
  {
    id:'C2',title:'怎么把结果量化',
    when:'连续两题结果没有数字',
    body:'不用编数字。三个来源就够：做之前是什么水平、做完之后是什么水平、中间隔了多久。哪怕是"从三天变成半天"也比"效果很好"强。'
  },
  {
    id:'C5',title:'"我"和"我们"的边界',
    when:'连续两题个人贡献不足',
    body:'讲团队做的事时，"我们"可以保留背景，但每个关键节点都要说清：这个决定是谁拍的、这个动作是谁做的、出了问题谁承担。'
  },
  {
    id:'C6',title:'怎么讲一个真实的失败',
    when:'复盘维度被判强否',
    body:'不要讲"追求完美"这类优点包装。挑一件真的搞砸过的事：说清代价、承认是自己的判断问题、说明后来改了什么做法。'
  }
];

// 触发判定：只看当前状态，不看用户主动点击。
// 返回最该弹的那一张；没有合适的就返回 null——不该弹的时候绝不弹。
function pickCard(ctx){
  const c=ctx||{};
  const shown=Array.isArray(c.shown)?c.shown:[];
  const ready=id=>!shown.includes(id);
  // 优先级：重复犯错 > 首次引导。
  // 只保留真正有检测来源的触发条件——写一个永远不成立的判定等于死代码。
  if(c.weaknessStrongNo&&ready('C6'))return CARDS.find(x=>x.id==='C6');
  if((c.quantMissStreak||0)>=2&&ready('C2'))return CARDS.find(x=>x.id==='C2');
  if((c.ownMissStreak||0)>=2&&ready('C5'))return CARDS.find(x=>x.id==='C5');
  if((c.answeredCount||0)===1&&ready('C1'))return CARDS.find(x=>x.id==='C1');
  return null;
}

/* ========== 存储 ========== */
function empty(){return {schemaVersion:1,profile:null,sessions:[],usedUtterances:[],metrics:{started:0,completed:0,probeOffered:0,probeAccepted:0,swapDone:0}};}

const isPlain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const isStr=(v,max)=>typeof v==='string'&&v.length<=max;

function validate(state){
  if(!isPlain(state)||state.schemaVersion!==1)return false;
  if(state.profile!==null){
    const p=state.profile;
    if(!isPlain(p)||!isStr(p.years,20)||!isStr(p.jd,30000)||!isStr(p.selfStage,20)||!isStr(p.jobStage,20))return false;
    if(!STAGE_IDS.includes(p.selfStage)||!STAGE_IDS.includes(p.jobStage))return false;
    if(!['inferred','manual'].includes(p.stageSource))return false;
    // round / reports 是后加的字段，旧存档没有也要能读。
    if(p.round!==undefined&&!ROUND_IDS.includes(p.round))return false;
    if(p.reports!==undefined&&!REPORTS_IDS.includes(p.reports))return false;
  }
  if(!Array.isArray(state.sessions)||state.sessions.length>500)return false;
  for(const s of state.sessions){
    if(!isPlain(s)||!isStr(s.id,100)||!isStr(s.date,100)||!isStr(s.questionId,40))return false;
    if(!Array.isArray(s.turns)||s.turns.length>MAX_TURNS+1)return false;
    if(!s.turns.every(t=>isPlain(t)&&isStr(t.answer,30000)))return false;
    if(!isPlain(s.verdict)||!LEVEL_IDS.includes(s.verdict.level))return false;
    if(!STAGE_IDS.includes(s.verdict.jobStage))return false;
  }
  // usedUtterances 是后加的字段，旧存档没有也要能读。
  if(state.usedUtterances!==undefined){
    if(!Array.isArray(state.usedUtterances)||state.usedUtterances.length>200)return false;
    if(!state.usedUtterances.every(u=>isStr(u,300)))return false;
  }
  const m=state.metrics;
  if(!isPlain(m))return false;
  if(!['started','completed','probeOffered','probeAccepted','swapDone'].every(k=>Number.isSafeInteger(m[k])&&m[k]>=0&&m[k]<=1e9))return false;
  // rounds 是后加的字段，旧存档没有也要能读。
  return m.rounds===undefined||(Number.isSafeInteger(m.rounds)&&m.rounds>=0&&m.rounds<=1e9);
}

/* ========== 对外接口 ========== */
return {
  STAGES,STAGE_IDS,YEARS,STAGE_REQUIRED,LEVELS,LEVEL_IDS,D1,D2,DIMENSIONS,dimension,GAPS,UTTERANCES,SWAP,MAX_TURNS,
  INTERVIEW_ROUNDS,ROUND_IDS,REPORTS,REPORTS_IDS,dimensionsForRound,roundHasMotive,
  stageName,stageIndex,inferSelfStage,inferJobStage,resolveScale,
  levelByScore,levelName,pickQuestion,
  analyze,detectGaps,nextProbe,pickUtterance,rememberUtterance,utteranceCount,
  ownRatio,quantDensity,hasFriction,hasDecision,hasMechanism,hasReflection,hasSelfAction,hasInitiative,
  starCheck,judge,judgeByRule,judgeWeakness,judgeResult,judgeDecision,judgeCollab,judgeGrowth,judgePressure,gapsFor,evidenceFor,
  MOTIVE,MOTIVE_FLAGS,scanMotive,
  CARDS,pickCard,
  buildRound,roundSummary,ROUND_SIZE,roundSize,
  empty,validate
};
});
