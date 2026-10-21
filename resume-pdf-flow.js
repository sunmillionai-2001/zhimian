// Preserve the original painted template as horizontal bands. Expanded text
// inserts space, moves subsequent bands, and paginates only at safe boundaries.
const {PDFDocument}=require('pdf-lib');
const {createCanvas,GlobalFonts}=require('@napi-rs/canvas');
const path=require('node:path');
const {embedResumeFont}=require('./pdf-font');
const fail=m=>Object.assign(new Error(m),{userMessage:m});
function wrap(text,font,size,width){
 const lines=[''];
 for(const c of text.replace(/\n\n/g,'\n')){
  if(c==='\n'){lines.push('');continue;}
  const i=lines.length-1;
  if(lines[i]&&font.widthOfTextAtSize(lines[i]+c,size)>width)lines.push(c);else lines[i]+=c;
 }
 return lines;
}
function lastPaint(canvas){
 const ctx=canvas.getContext('2d');
 for(let y=canvas.height-1;y>=0;y--){const d=ctx.getImageData(0,y,canvas.width,1).data;for(let x=0;x<d.length;x+=4)if(d[x]<245||d[x+1]<245||d[x+2]<245)return y+1;}
 return 1;
}
async function exportFlow(opened,blocks,changes,renderPage){
 const pdf=await PDFDocument.create(),font=await embedResumeFont(pdf),scale=2;
 GlobalFonts.registerFromPath(path.join(__dirname,'assets/fonts/ZhiMianSansSC-Regular.ttf'),'ZhiMianExport');
 const fragments=[],labels=[],pictures=[];let total=0,width,height;
 for(let p=1;p<=opened.doc.numPages;p++){
  const page=await opened.doc.getPage(p),vp=page.getViewport({scale:1});
  if(p===1){width=vp.width;height=vp.height;}else if(Math.abs(width-vp.width)>1||Math.abs(height-vp.height)>1)throw fail('不同尺寸的 PDF 页面暂不支持跨页重排，请使用 Word 原稿。');
  const edits=[...changes].filter(([b])=>b.page===p), hidden=new Set(edits.flatMap(([b])=>b.ops));
  const rendered=await renderPage(page,opened.api,hidden,scale);
  const original=await renderPage(page,opened.api,new Set(),scale,true);
  const plans=edits.map(([b,text])=>{
   if(!b.positioned||b.rotated)throw fail('无法准确定位这段文字，原文件和优化内容已保留。');
   const [x,y,x2,y2]=b.rect,size=b.fontSize,leading=Math.max(size*1.6, b.lastLine?(b.lastLine.baseline[1]-b.baseline[1])/Math.max(1,b.text.split('\n\n').length-1):size*1.6);
   const lines=wrap(text,font,size,x2-x+2), first=b.baseline[1];
   const end=first+(lines.length-1)*leading+size*0.3;
   const cut=Math.ceil((y2+1)*scale),extra=Math.max(0,Math.ceil((end-y2)*scale));
   const ox=Math.max(0,Math.floor(x*scale)),oy=Math.max(0,Math.floor(y*scale));
   const w=Math.min(rendered.canvas.width-ox,Math.ceil((x2-x)*scale)),h=Math.min(rendered.canvas.height-oy,Math.ceil((y2-y)*scale));
   if(w<=0||h<=0)throw fail('文字区域无法识别，原稿已保留。');
   const a=original.canvas.getContext('2d').getImageData(ox,oy,w,h).data,bg=rendered.canvas.getContext('2d').getImageData(ox,oy,w,h).data;
   if(!a.some((v,i)=>Math.abs(v-bg[i])>10))throw fail('图片中的文字无法可靠替换，请使用 Word 原稿。');
   return {b,text,lines,size,leading,first,cut,extra};
  }).sort((a,b)=>a.cut-b.cut);
  // Same-row changes share a single inserted band; do not stretch neighbouring text.
  const bands=[];
  for(const plan of plans){
   let band=bands.find(b=>Math.abs(b.cut-plan.cut)<3);
   if(!band){band={cut:plan.cut,extra:0};bands.push(band);}
   band.extra=Math.max(band.extra,plan.extra);plan.band=band;
  }
  if(bands.some(b=>b.extra && original.images.some(im=>im.top+2<b.cut&&im.bottom-2>b.cut)))throw fail('扩写区域与图片重叠，无法安全移动图片；原稿与改写已保留。');
  const outHeight=rendered.canvas.height+bands.reduce((n,b)=>n+b.extra,0);
  if(rendered.canvas.width*outHeight>24000000)throw fail('优化后的页面内容过长，请分段精简后再导出。');
  const canvas=createCanvas(rendered.canvas.width,outHeight),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  let from=0,shift=0;
  for(const band of bands){
   const cut=Math.min(band.cut,rendered.canvas.height);
   if(cut>from)ctx.drawImage(rendered.canvas,0,from,canvas.width,cut-from,0,from+shift,canvas.width,cut-from);
   if(band.extra){
    // Copy a clean background row to continue column colours and vertical rules.
    ctx.drawImage(rendered.canvas,0,Math.min(cut,rendered.canvas.height-1),canvas.width,1,0,cut+shift,canvas.width,band.extra);
   }
   from=cut;shift+=band.extra;
  }
  if(from<rendered.canvas.height)ctx.drawImage(rendered.canvas,0,from,canvas.width,rendered.canvas.height-from,0,from+shift,canvas.width,rendered.canvas.height-from);
  const shifted=y=>y*scale+bands.filter(b=>b.cut<=y*scale).reduce((n,b)=>n+b.extra,0);
  const pageLabels=[];
  for(const b of blocks.filter(b=>b.page===p&&!changes.has(b))){
   pageLabels.push({text:b.text,x:b.rect[0]*scale,y:shifted(b.baseline?.[1]||b.rect[1]+(b.fontSize||9)),top:shifted(b.positioned?b.rect[1]:(b.baseline?.[1]||b.rect[1])),bottom:shifted(b.positioned?b.rect[3]:(b.baseline?.[1]||b.rect[1])+9),size:b.fontSize||9});
  }
  for(const plan of plans){
   const x=plan.b.rect[0]*scale,offset=bands.filter(b=>b.cut<=plan.b.rect[1]*scale).reduce((n,b)=>n+b.extra,0);
   ctx.fillStyle=plan.b.color||'#222';ctx.font=`${plan.size*scale}px ZhiMianExport`;ctx.textBaseline='alphabetic';
   plan.lines.forEach((text,i)=>{const y=(plan.first+i*plan.leading)*scale+offset;ctx.fillText(text,x,y);pageLabels.push({text,x,y,top:y-plan.size*scale,bottom:y+plan.size*scale*.25,size:plan.size});});
  }
  const used=Math.min(canvas.height,lastPaint(canvas)+12);
  fragments.push({canvas,start:total,height:used});
  for(const im of original.images)pictures.push({top:shifted(im.top/scale)+total,bottom:shifted(im.bottom/scale)+total});
  for(const l of pageLabels)labels.push({...l,y:l.y+total,top:l.top+total,bottom:l.bottom+total});
  total+=used;
 }
 const pixelWidth=Math.ceil(width*scale);
 if(pixelWidth*total>48000000)throw fail('重排内容超过处理上限，原稿与改写已保留。');
 const full=createCanvas(pixelWidth,total),fullCtx=full.getContext('2d');fullCtx.fillStyle='#fff';fullCtx.fillRect(0,0,pixelWidth,total);
 for(const f of fragments)fullCtx.drawImage(f.canvas,0,0,pixelWidth,f.height,0,f.start,pixelWidth,f.height);
 const margin=24*scale,capacity=Math.floor(height*scale)-margin*2;
 let start=0,index=0;
 while(start<total){
  const top=index===0?0:margin,limit=Math.min(total,start+Math.floor(height*scale)-margin-top);let end=limit;
  if(limit<total){
   let found=false;
   for(let y=limit;y>start+capacity*.35;y--){
    if(labels.some(l=>l.top-2<y&&l.bottom+2>y)||pictures.some(im=>im.top-2<y&&im.bottom+2>y))continue;
    const row=fullCtx.getImageData(0,y,pixelWidth,1).data,above=fullCtx.getImageData(0,Math.max(0,y-3),pixelWidth,1).data,below=fullCtx.getImageData(0,Math.min(total-1,y+3),pixelWidth,1).data;let ink=0;
    for(let x=0;x<row.length;x+=4)if([0,1,2].some(k=>Math.abs(row[x+k]-above[x+k])>12||Math.abs(row[x+k]-below[x+k])>12))ink++;
    if(ink/pixelWidth<.015){end=y;found=true;break;}
   }
   if(!found)throw fail('这一页找不到不切断文字或图形的分页位置，原稿和改写已保留。');
  }
  const piece=createCanvas(pixelWidth,end-start),c=piece.getContext('2d');c.drawImage(full,0,start,pixelWidth,end-start,0,0,pixelWidth,end-start);
  const out=pdf.addPage([width,height]);out.drawImage(await pdf.embedPng(piece.toBuffer('image/png')),{x:0,y:height-(top+end-start)/scale,width,height:(end-start)/scale});
  for(const l of labels.filter(l=>l.y>=start&&l.y<end))out.drawText(l.text,{x:l.x/scale,y:height-(top+l.y-start)/scale,size:l.size,font,opacity:0});
  start=end;index++;if(index>30)throw fail('优化后超过 30 页，请精简内容。');
 }
 return Buffer.from(await pdf.save());
}
module.exports={exportFlow,wrap};
