// Directory labels must come from the user's source text, never a fixed resume template.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ZhiMianResumeNav=api;})(typeof window==='object'?window:globalThis,()=>{
  const clean=s=>s.replace(/^[\s•●▪\-—·]+/u,'').replace(/\s+/g,' ').trim();
  const heading=s=>s.length<=32&&/^(?:[一二三四五六七八九十\d]+[、.．)）\s]+)?(?:工作经历|工作经验|实习经历|项目经历|项目经验|教育经历|教育背景|学习经历|专业技能|技能特长|技能|个人总结|自我评价|个人简介|荣誉奖项|获奖经历|开源贡献|开源与社区|志愿经历|科研经历|研究经历|社团经历|社会实践|职业经历|职业技能|Work Experience|Professional Experience|Experience|Employment|Projects?|Selected Projects|Education|Skills|Summary|About(?: Me)?|Research|Volunteer(?:ing)?|Awards|Publications|Open Source|Portfolio)[：:]?$/i.test(s);
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
  return {build};
});
