// Directory labels must come from the user's source text, never a fixed resume template.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ZhiMianResumeNav=api;})(typeof window==='object'?window:globalThis,()=>{
  const clean=s=>s.replace(/^[\s•●▪\-—·]+/u,'').replace(/\s+/g,' ').trim();
  const heading=s=>(s=/[\u4e00-\u9fff]/.test(s)?s.replace(/\s/g,''):s).length<=32&&/^(?:[一二三四五六七八九十\d]+[、.．)）\s]+)?(?:工作经历|工作经验|实习经历|项目经历|项目经验|教育经历|教育背景|学习经历|专业技能|技能特长|技能专长|技能|个人总结|自我评价|个人简介|荣誉奖项|获奖经历|开源贡献|开源与社区|志愿经历|科研经历|研究经历|社团经历|社会实践|职业经历|职业技能|职业优势|培训经历|资格证书|证书|兴趣爱好|基本信息|个人信息|Work Experience|Professional Experience|Experience|Employment|Projects?|Selected Projects|Education|Skills|Summary|About(?: Me)?|Research|Volunteer(?:ing)?|Awards|Publications|Open Source|Portfolio)[：:]?$/i.test(s);
  const company=s=>/公司|集团|研究院|事务所|工作室|实验室|(?:\b(?:Inc\.?|Ltd\.?|LLC|Corp\.?|GmbH|Company)\b)/i.test(s);
  const action=s=>/^(?:负责|参与|主导|推动|协助|完成|通过|基于|针对|实现|维护|开发了|设计了|在此|作为|Developed\b|Led\b|Built\b|Supported\b|Maintained\b|Implemented\b|Worked\b|Managed\b)/i.test(s);
  const isDate=s=>/^(?:(?:19|20)\d{2}[.年/\-]?\d{0,2}[月]?(?:\s*(?:[-–—~至]|to)\s*(?:(?:19|20)\d{2}[.年/\-]?\d{0,2}[月]?|今|至今|现在|Present|Current))?|\d{1,2}岁|\d{1,3}[kKwW](?:[-~]\d+[kKwW])?)$/i.test(s);
  const excerpt=s=>clean(s).split(/[。！？!?；;\n]/u)[0]||clean(s);
  const clip=(s,n=30)=>Array.from(s).length>n?Array.from(s).slice(0,n).join('')+'…':s;
  function build(text,sections){
    const lines=[];let offset=0;
    for(const raw of text.split('\n')){const value=clean(raw);if(value)lines.push({value,start:offset,end:offset+raw.length});offset+=raw.length+1;}
    const output=sections.map((section,index)=>{
      const start=Number.isInteger(section.start)?section.start:text.indexOf(section.original);
      const preceding=lines.filter(l=>l.start<start),headIndex=preceding.findLastIndex(l=>heading(l.value));
      let category=headIndex>=0?preceding[headIndex].value.replace(/[：:]$/,''):'';
      const context=preceding.slice(Math.max(headIndex+1,preceding.length-16));
      const candidates=context.map(l=>l.value).filter(v=>v.length>=2&&v.length<=90&&!heading(v)&&!isDate(v)&&!action(v)&&!/[，,。！？!?；;]/.test(v)&&!/@|https?:\/\//i.test(v)&&!/^\+?[\d\s-]{7,}$/.test(v)&&!/^[-–—]+$/.test(v)&&!/^TOP\s*\d|^业[绩内]\s*TOP|^在职$|^实习$|^男$|^女$/i.test(v));
      const nearest=predicate=>candidates.findLast(predicate);
      let entity='';
      if(/项目|project|portfolio/i.test(category))entity=nearest(v=>!company(v)&&/项目|系统|平台|工具|产品|Project|Platform|System|Tool|App\b/i.test(v))||nearest(v=>!company(v));
      else if(/工作|实习|职业经历|experience|employment/i.test(category))entity=nearest(company)||candidates.at(-1);
      else if(/教育|学习|education/i.test(category))entity=nearest(v=>/大学|学院|学校|University|College|School|Institute/i.test(v))||candidates.at(-1);
      if(!entity){const contextual=nearest(v=>company(v)||/项目|系统|平台|大学|Project|Platform|University/i.test(v));if(contextual){entity=contextual;if(/技能|skills|summary|个人|about/i.test(category))category='';}}
      // For non-standard headings, use source context or an excerpt; never invent a category.
      if(/^(?:具备|熟悉|擅长|拥有|多年|本人|Experienced\b|Skilled\b)/i.test(clean(section.original))){
        const summaryHeading=lines.find(l=>/^(?:个人总结|自我评价|个人简介|Summary|About(?: Me)?)[：:]?$/i.test(l.value));
        if(summaryHeading){category=summaryHeading.value.replace(/[：:]$/,'');entity='';}
      }
      const summary=clip(excerpt(section.original)||'原文片段');
      let label=category&&entity?clip(category,16)+' · '+clip(entity):category?clip(category,16)+' · '+summary:entity?clip(entity,24)+' · '+clip(summary,14):summary;
      return {label,category,excerpt:summary,index};
    });
    const counts=new Map();for(const item of output)counts.set(item.label,(counts.get(item.label)||0)+1);
    const sequence=new Map();for(const item of output)if(counts.get(item.label)>1){const label=item.label,n=(sequence.get(label)||0)+1;sequence.set(label,n);item.label=label+'（'+n+'）';}
    return output;
  }
  // A separate outline uses original offsets. Visual sorting must never change editing anchors.
  function outlineBlocks(text,blocks){
    if(!Array.isArray(blocks)||!blocks.length){let offset=0;return text.split('\n').flatMap(raw=>{const start=offset;offset+=raw.length+1;return raw.trim()?[{text:raw,start,end:start+raw.length,lane:'text'}]:[];});}
    const rows=blocks.filter(b=>Number.isInteger(b.start)&&Number.isInteger(b.end)&&b.start>=0&&b.end<=text.length).map(b=>({...b,text:text.slice(b.start,b.end)}));
    if(!rows.some(b=>b.rect))return rows;
    const heads=rows.filter(b=>heading(clean(b.text))&&b.positioned!==false);
    const columns=[];for(const x of heads.map(b=>b.rect[0]).sort((a,b)=>a-b))if(!columns.length||x-columns.at(-1)>80)columns.push(x);
    const sizes=rows.filter(b=>b.fontSize>0).map(b=>b.fontSize).sort((a,b)=>a-b),median=sizes[Math.floor(sizes.length/2)]||12;
    for(const b of rows){
      b.lane=columns.filter(x=>x<=b.rect[0]+20).length-1;
      b.heading=b.heading||b.positioned!==false&&b.fontSize>=median*1.3&&clean(b.text).length<=24&&/(?:经历|背景|技能|优势|总结|评价|奖项|证书|成果|实践|贡献|爱好|概况|能力|履历|作品|资质|Experience|Projects|Skills|Education|Awards|Summary|Research)$/i.test(clean(b.text))&&!action(clean(b.text))&&!company(b.text)&&!isDate(clean(b.text));
    }
    return rows.filter(b=>b.positioned!==false).sort((a,b)=>a.lane-b.lane||a.page-b.page||(Math.abs(a.rect[1]-b.rect[1])>3?a.rect[1]-b.rect[1]:a.rect[0]-b.rect[0]));
  }
  function hierarchy(text,sections,blocks){
    const rows=outlineBlocks(text,blocks),modules=[],assignments=new Map();let current=null,entry=null,lane=null;
    const titleLike=v=>v.length>=2&&v.length<=90&&!action(v)&&!isDate(v)&&!/[，,。！？!?；;@]/.test(v)&&!/https?:\/\//i.test(v)&&!/^\+?[\d\s-]{7,}$/.test(v)&&!/^[-–—]+$/.test(v);
    const role=v=>/^(?:项目经理|项目负责人|售后技术支持|项目介绍|项目职责|项目描述|项目成果|项目背景|项目规模|项目时间|项目名称|本科|硕士|博士|实习|在职)[：:]?$/.test(v);
    function moduleFor(label,source){let m=modules.find(m=>m.label===label&&m.lane===lane);if(!m){m={key:'m'+modules.length,label,lane,source,entries:[]};modules.push(m);}return m;}
    function newEntry(label){const e={key:current.key+'e'+current.entries.length,label:clip(label,52),detail:'',indices:[],ranges:[],hasBody:false};current.entries.push(e);return e;}
    rows.forEach((row,i)=>{
      const v=clean(row.text);if(!v)return;
      if(lane!==row.lane){lane=row.lane;current=null;entry=null;}
      if(heading(v)||row.heading){current=moduleFor(v.replace(/[：:]$/,''),true);entry=null;return;}
      if(!current)current=moduleFor('待归类内容',false);
      const kind=/项目|project|portfolio/i.test(current.label)?'project':/教育|学习|education/i.test(current.label)?'school':/工作|实习|职业经历|experience|employment/i.test(current.label)?'work':'other';
      const eligible=titleLike(v)&&!role(v);
      const following=rows.slice(i+1,i+4).filter(r=>r.lane===lane&&!heading(clean(r.text)));
      const dated=following.some(r=>isDate(clean(r.text)))||/(?:19|20)\d{2}.*(?:至今|Present|(?:19|20)\d{2})/i.test(v);
      let starts=false;
      if(eligible){
        if(kind==='work')starts=company(v)||dated&&(!entry||entry.hasBody);
        else if(kind==='project')starts=!company(v)&&(/项目|系统|平台|工具|产品|Project|Platform|System|Tool|App\b/i.test(v)||!entry||dated);
        else if(kind==='school')starts=/大学|学院|学校|University|College|School|Institute/i.test(v)&&(!entry||dated);
        else if(!current.source)starts=company(v)||/^(?:Project|项目)\s*[^经理负责人介绍职责描述成果背景时间规模]/i.test(v);
      }
      if(starts){entry=newEntry(v);if(dated)entry.detail=clean(following.find(r=>isDate(clean(r.text)))?.text||'');}
      if(!entry)entry=newEntry(kind==='other'&&current.source?'全部内容':'未识别经历');
      entry.ranges.push({start:row.start,end:row.end});assignments.set(row,entry);if(!titleLike(v)&&!isDate(v))entry.hasBody=true;
    });
    const items=sections.map((s,index)=>{
      const start=Number.isInteger(s.start)?s.start:text.indexOf(s.original),end=start+s.original.length;
      // Pick the block containing the anchor, then the largest overlap; never guess by nearby company.
      const row=rows.find(r=>r.start<=start&&r.end>start)||rows.filter(r=>r.start<end&&start<r.end).sort((a,b)=>(Math.min(end,b.end)-Math.max(start,b.start))-(Math.min(end,a.end)-Math.max(start,a.start)))[0];
      let e=assignments.get(row),m=modules.find(m=>m.entries.includes(e));
      if(!e){lane='unmapped';m=moduleFor('待归类内容',false);current=m;e=newEntry('未识别经历');}
      e.indices.push(index);
      return {index,position:rows.indexOf(row),module:m.key,entry:e.key,category:m.label,entity:e.label,excerpt:clip(excerpt(s.original),24)};
    });
    const visible=modules.filter(m=>m.source||m.entries.some(e=>e.indices.length));
    for(const m of visible)m.entries=m.entries.filter(e=>e.label!=='未识别经历'||e.indices.length||m.entries.length===1);
    for(const m of visible)for(const e of m.entries){
      e.indices.sort((a,b)=>items[a].position-items[b].position);
      e.indices.forEach((index,n)=>{const item=items[index];item.ordinal=n+1;item.label=m.label+' / '+(e.label==='全部内容'?'':e.label+' / ')+'建议 '+(n+1);});
    }
    return {modules:visible,items,order:visible.flatMap(m=>m.entries.flatMap(e=>e.indices))};
  }
  return {build,hierarchy};
});
