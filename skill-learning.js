/* Shared learning catalog and deterministic JD matching. Works offline and in Node tests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ZmSkill=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const roles={'AGI 工程师':'agi','前端开发':'frontend','后端开发':'backend','产品经理':'product','数据分析':'data','算法工程师':'algorithm'};
  const resources={
    d2l:['动手学深度学习','https://zh.d2l.ai/','开放课程 · 中文','数学、模型与可运行代码一起学'],
    mdn:['MDN Web 开发教程','https://developer.mozilla.org/zh-CN/docs/Learn_web_development','官方教程 · 中文','从页面结构到脚本交互逐步练习'],
    react:['React Learn','https://react.dev/learn','官方教程 · 英文','跟着交互案例练组件、状态与数据流'],
    chrome:['Chrome 性能分析','https://developer.chrome.com/docs/devtools/performance','官方教程 · 英文','学习用录制与性能面板定位瓶颈'],
    actions:['GitHub Actions','https://docs.github.com/en/actions','官方文档 · 多语言','把测试与发布写成可重复执行的工作流'],
    java:['Learn Java','https://dev.java/learn/','官方教程 · 英文','练语言、集合、异常与 JVM 基础'],
    go:['Learn Go','https://go.dev/learn/','官方教程 · 英文','使用 Go 路线时，从语言与可运行示例入手'],
    http:['MDN HTTP 指南','https://developer.mozilla.org/zh-CN/docs/Web/HTTP','官方文档 · 中文','理解请求响应、协议与缓存机制'],
    mysql:['MySQL 优化指南','https://dev.mysql.com/doc/refman/8.4/en/optimization.html','官方文档 · 英文','理解执行计划、索引与查询优化'],
    redis:['Redis 开发指南','https://redis.io/docs/latest/develop/','官方文档 · 英文','练数据结构、缓存与服务集成'],
    mq:['RabbitMQ Tutorials','https://www.rabbitmq.com/tutorials','官方教程 · 英文','从生产消费到确认、重试与路由'],
    monitor:['Prometheus 入门','https://prometheus.io/docs/introduction/overview/','官方文档 · 英文','理解指标采集、查询与监控体系'],
    hf:['Hugging Face LLM Course','https://huggingface.co/learn/llm-course/zh-CN/chapter1/1','开放课程 · 中文','从模型与数据集入手练大模型工具链'],
    torch:['PyTorch Tutorials','https://docs.pytorch.org/tutorials/','官方教程 · 英文','用可运行示例练训练、推理与部署'],
    interview:['用户访谈入门','https://www.nngroup.com/articles/user-interviews/','专业指南 · 英文','学习访谈设计与避免诱导提问'],
    figma:['Figma Design 学习中心','https://help.figma.com/hc/en-us/categories/360002042553-Figma-Design','官方教程 · 英文','学习原型、交互与协作设计'],
    agile:['敏捷项目管理','https://www.atlassian.com/agile/project-management','官方指南 · 英文','理解需求拆分、迭代与团队协作'],
    analytics:['Amplitude Analytics','https://amplitude.com/docs/analytics','官方文档 · 英文','理解事件、漏斗与留存分析'],
    excel:['Excel 帮助和学习','https://support.microsoft.com/zh-cn/excel/','官方教程 · 中文','练汇总、图表与透视表'],
    sql:['PostgreSQL SQL 教程','https://www.postgresql.org/docs/current/tutorial.html','官方教程 · 英文','用查询、连接与聚合练取数'],
    pandas:['pandas 入门教程','https://pandas.pydata.org/docs/getting_started/intro_tutorials/','官方教程 · 英文','练数据清洗、分组与可视化'],
    sklearn:['scikit-learn 入门','https://scikit-learn.org/stable/getting_started.html','官方教程 · 英文','练预处理、训练与评估的完整流程']
  };
  // Each module has a concrete deliverable and three self-review criteria; no execution or automatic grading.
  const curriculum={
    agi:[
      ['agi-foundation',['d2l','torch'],'用 Python 实现线性回归：划分训练/验证数据，记录 loss，并解释一次学习率调整。',['数据划分没有泄漏','代码可复现且有 loss 曲线','解释梯度、形状及学习率影响']],
      ['agi-models',['d2l','torch'],'在同一数据集比较一个基线与神经网络，记录调参过程和过拟合现象。',['固定相同数据划分','记录指标与超参数','解释过拟合及至少一种缓解方法']],
      ['agi-llm',['hf','d2l'],'设计一个小型文档问答：写出检索、生成、引用与拒答流程，并准备 10 条评测问题。',['区分检索与生成失败','答案能追溯文档且有拒答','评测覆盖正确答案与无答案场景']],
      ['agi-delivery',['torch','monitor'],'为模型服务写上线方案：输入校验、延迟指标、异常处理与回滚。',['定义延迟和质量指标','描述异常与资源限制','有可执行部署及回滚步骤']]
    ],
    frontend:[
      ['frontend-web',['mdn'],'实现一个可搜索、可键盘操作的列表页，并在手机宽度检查布局。',['语义结构和输入标签完整','空结果与异常状态明确','键盘可操作且无横向溢出']],
      ['frontend-framework',['react','mdn'],'实现含列表、详情和编辑的应用，处理加载、失败和重复提交。',['解释组件和状态边界','路由与刷新行为明确','覆盖加载、失败及重复提交']],
      ['frontend-performance',['chrome','react'],'分析一个页面的交互卡顿，保留优化前后录制并说明取舍。',['能定位具体耗时来源','同条件对比前后数据','解释收益及潜在副作用']],
      ['frontend-quality',['actions','mdn'],'为列表应用增加关键流程测试与 CI，模拟一次失败构建。',['测试覆盖用户流程','CI 失败能阻止错误发布','有复现步骤与修复说明']]
    ],
    backend:[
      ['backend-foundation',['java','go'],'实现一个去重与分页接口，说明数据结构、边界和复杂度；可使用 Java 或 Go。',['空输入和重复数据有处理','解释时间与空间复杂度','给出运行方式和测试样例']],
      ['backend-database',['mysql','redis','http'],'设计订单表和缓存读取流程：给出一条慢查询的 EXPLAIN、索引调整与缓存失效方案。',['有表结构、查询与执行计划','解释索引收益及写入成本','缓存失效、穿透与一致性有方案']],
      ['backend-distributed',['mq'],'设计订单消息消费：处理重复消息、失败重试与死信，画出流程。',['消费幂等可验证','重试有次数和退避边界','解释一致性与失败恢复']],
      ['backend-system',['redis','monitor'],'设计秒杀服务：估算流量，拆缓存、限流、降级与监控，再写压测计划。',['容量估算有依据','故障时有降级和恢复路径','定义压测指标、告警及瓶颈验证']]
    ],
    product:[
      ['product-discovery',['interview'],'为一个求职痛点写访谈提纲，访谈后区分事实、推断和需求假设。',['问题不诱导用户','事实与推断分开','需求有频率、影响和证据']],
      ['product-design',['figma','agile'],'为岗位收藏写一页 PRD 与可点击原型，包含正常、空白和失败流程。',['目标、范围与验收明确','原型覆盖异常路径','说明权限、数据及依赖']],
      ['product-growth',['analytics','sql'],'设计简历导入漏斗与一次 A/B 实验，说明指标口径及停止条件。',['事件与分母口径一致','实验有假设与对照','说明样本不足和负向指标']],
      ['product-delivery',['agile'],'为简历助手上线制定迭代计划，列依赖、风险、责任人和复盘问题。',['里程碑有可验收产出','依赖、责任与沟通明确','延期应对和复盘机制可执行']]
    ],
    data:[
      ['data-foundation',['excel'],'整理一份订单表，处理空值和重复值，用透视表说明渠道与客单价差异。',['记录清洗规则','统计口径和样本量明确','图表能回答业务问题']],
      ['data-sql',['sql'],'编写按周、渠道统计订单与复购率的 SQL，并用小样本手算验证。',['连接不会重复计数','窗口及时间口径正确','手算样例与 SQL 结果一致']],
      ['data-python',['pandas'],'用 pandas 完成订单清洗、分组和图表，输出可复现的分析笔记。',['输入、清洗和输出可复现','异常与缺失值有说明','结论能追溯计算步骤']],
      ['data-insight',['analytics','sql'],'分析转化率下降：先验数据，再拆渠道、用户与版本，写结论和下一步验证。',['排除口径和采集异常','定位贡献最大的维度','结论区分相关与因果']]
    ],
    algorithm:[
      ['algorithm-foundation',['d2l','java'],'用 Python 实现矩阵运算和一个基础算法，解释公式、形状与复杂度。',['公式与代码对应','边界样例完整','解释维度和复杂度']],
      ['algorithm-ml',['sklearn'],'完成分类任务：建立基线、特征处理、交叉验证并分析错误样本。',['预处理没有数据泄漏','基线与评估指标合理','错误分析支持下一步改进']],
      ['algorithm-dl',['d2l','torch'],'复现一个小型神经网络，记录基线、消融实验和训练成本。',['模型与训练设置可复现','消融每次只改一个因素','比较质量、耗时与资源']],
      ['algorithm-serving',['torch','monitor'],'比较模型推理优化前后的延迟与质量，并设计灰度与回滚。',['输入和硬件条件一致','量化质量与延迟取舍','灰度、监控和回滚完整']]
    ]
  };
  const aliases={'Java/Go':['Java','Go','Golang'],'Go':['Go','Golang'],'Vue/React':['Vue','React'],'Vite/Webpack':['Vite','Webpack'],'Axure/Figma':['Axure','Figma'],'MQ':['MQ','Kafka','RabbitMQ','消息队列'],'LoRA 微调':['LoRA','微调'],'CI/CD':['CI/CD','持续集成','持续交付'],'单测':['单测','单元测试'],'缓存设计':['缓存','缓存设计'],'监控告警':['监控','告警'],'A/B 测试':['A/B','AB测试','实验'],'A/B 评估':['A/B','AB测试'],'数学':['数学','线性代数','概率'],'可视化':['可视化','图表'],'归因分析':['归因'],'专题报告':['分析报告','专题报告'],'报告':['分析报告','报告'],'CNN':['CNN','卷积'],'RNN':['RNN','循环神经'],'模型部署':['部署','模型部署'],'推理部署':['部署','推理部署']};
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k),plain=o=>!!o&&typeof o==='object'&&!Array.isArray(o),str=(s,n)=>typeof s==='string'&&s.length<=n;
  const validId=id=>str(id,200)&&id.trim().length>0&&!['__proto__','constructor','prototype'].includes(id);
  function skillId(role,name){return (roles[role]||'custom')+':'+name.toLowerCase().replace(/\s+/g,'-');}
  const splitAbilities={'Java/Go':['Java','Go'],'Vue/React':['Vue','React'],'Vite/Webpack':['Vite','Webpack'],'Axure/Figma':['Axure','Figma']};
  function modules(map,role){return (own(map,role)?map[role].levels:[]).map((l,i)=>{const c=curriculum[roles[role]][i];return {...l,id:c[0],resources:c[1],exercise:c[2],criteria:c[3],abilities:l.skills.flatMap(name=>splitAbilities[name]||[name]).map(name=>({id:skillId(role,name),name}))};});}
  function resolveRole(text){const t=(text||'').trim().toLowerCase();if(!t)return '';return Object.keys(roles).find(r=>t.includes(r.toLowerCase()))||(/前端/.test(t)?'前端开发':/后端|服务端/.test(t)?'后端开发':/产品/.test(t)?'产品经理':/数据分析|分析师/.test(t)?'数据分析':/算法/.test(t)?'算法工程师':/agi|大模型|人工智能|\bai\b/.test(t)?'AGI 工程师':'');}
  function contains(text,word){const escaped=word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp((/^[a-z]/i.test(word)?'(?<![a-z0-9_])':'')+escaped+(/[a-z0-9]$/i.test(word)?'(?![a-z0-9_])':''),'i').test(text);}
  function analyze(map,role,jd){const abilities=[...new Map(modules(map,role).flatMap(m=>m.abilities).map(a=>[a.id,a])).values()],clauses=jd.split(/[\n；;，,。]/).map(s=>s.trim()).filter(Boolean),requirements=[];
    for(const a of abilities){const hits=clauses.filter(line=>!(new RegExp('(?:不要求|无需|不需要)\\s*(?:掌握|了解|熟悉)?\\s*(?:'+(aliases[a.name]||[a.name]).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')','i')).test(line)&&(aliases[a.name]||[a.name]).some(w=>contains(line,w)));if(hits.length)requirements.push({...a,kind:hits.some(h=>!/加分|优先|更佳|plus|preferred|nice.to.have/i.test(h))?'required':'bonus',quote:hits.join('；').slice(0,3000)});}
    return {requirements,unmatched:clauses.filter(c=>!requirements.some(r=>r.quote.includes(c))).slice(0,80)};
  }
  function empty(){return {schemaVersion:1,skills:{},exercises:{},plan:null};}
  function validate(s){if(!plain(s)||s.schemaVersion!==1||!plain(s.skills)||!plain(s.exercises)||Object.keys(s.skills).length>1000||Object.keys(s.exercises).length>100)return false;
    if(!Object.entries(s.skills).every(([id,v])=>validId(id)&&plain(v)&&Number.isInteger(v.level)&&v.level>=0&&v.level<=3&&str(v.evidence,3000)&&(v.legacy===undefined||typeof v.legacy==='boolean')))return false;
    if(!Object.entries(s.exercises).every(([id,v])=>validId(id)&&plain(v)&&str(v.answer,6000)&&Array.isArray(v.checks)&&v.checks.length===3&&v.checks.every(b=>typeof b==='boolean')&&str(v.updatedAt,80)))return false;
    const p=s.plan;return p===null||(plain(p)&&str(p.role,100)&&str(p.jobId,200)&&str(p.jobLabel,300)&&str(p.jd,30000)&&Array.isArray(p.requirements)&&p.requirements.length<=200&&new Set(p.requirements.map(r=>r?.id)).size===p.requirements.length&&p.requirements.every(r=>plain(r)&&validId(r.id)&&str(r.name,100)&&['required','bonus'].includes(r.kind)&&str(r.quote,3000)&&(r.manual===undefined||typeof r.manual==='boolean')));
  }
  function migrate(map,old){if(!plain(old)||!Object.entries(old).every(([role,levels])=>own(map,role)&&Array.isArray(levels)&&levels.every(n=>[1,2,3,4].includes(n))))throw Error('旧进度格式异常');const s=empty();for(const [role,levels]of Object.entries(old))for(const m of modules(map,role))if(levels.includes(m.lv))for(const a of m.abilities)s.skills[a.id]={level:3,evidence:'',legacy:true};return s;}
  function gaps(plan,state){return (plan?.requirements||[]).map(r=>({...r,level:state.skills[r.id]?.level||0,evidence:state.skills[r.id]?.evidence||''})).sort((a,b)=>(a.kind==='required'?0:1)-(b.kind==='required'?0:1)||a.level-b.level);}
  function validResource(r){try{const u=new URL(r.url);return u.protocol==='https:'&&!u.username&&!u.password&&str(r.title,200)&&str(r.reason,500)&&str(r.meta,200)&&typeof r.sponsored==='boolean'&&(!r.sponsored||str(r.sponsor,200)&&r.sponsor.trim().length>0);}catch(e){return false;}}
  // Future paid placements are attached to a module; they never change ability priorities or organic order.
  const sponsors=[];
  function recommendations(m,paid=sponsors){const organic=m.resources.map(id=>{const r=resources[id];return {title:r[0],url:r[1],meta:r[2],reason:r[3],sponsored:false};});return [...organic,...paid.filter(r=>r.moduleId===m.id&&r.sponsored&&validResource(r)).slice(0,1)].filter(validResource);}
  return {modules,resolveRole,skillId,analyze,empty,validate,migrate,gaps,recommendations,validResource};
});
