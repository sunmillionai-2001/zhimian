const path=require('node:path');
// Inspect ZIP directory sizes before Mammoth inflates Word XML.
function checkZip(buffer){
  let end=-1;for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--){if(buffer.readUInt32LE(i)===0x06054b50){end=i;break;}}
  if(end<0)throw new Error('Word 文件结构损坏');
  const count=buffer.readUInt16LE(end+10);let offset=buffer.readUInt32LE(end+16),total=0;
  if(count>1000)throw new Error('Word 文件内容过多');
  for(let i=0;i<count;i++){
    if(offset+46>buffer.length||buffer.readUInt32LE(offset)!==0x02014b50)throw new Error('Word 文件结构损坏');
    if(buffer.readUInt16LE(offset+8)&1)throw new Error('加密 Word 请解密后导入');
    total+=buffer.readUInt32LE(offset+24);if(total>20*1024*1024)throw new Error('Word 解压后超过 20 MB，请精简文件');
    offset+=46+buffer.readUInt16LE(offset+28)+buffer.readUInt16LE(offset+30)+buffer.readUInt16LE(offset+32);
  }
}
async function extract(ext,buffer){
  let value='',pages=null,warnings=[];
  if(ext==='.docx'){
    checkZip(buffer);const mammoth=require('mammoth');
    const result=await mammoth.extractRawText({buffer},{externalFileAccess:false});value=result.value;
    warnings=result.messages.length?['部分文档元素可能未提取，请核对正文。']:[];
  }else{
    const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
    const root=path.dirname(require.resolve('pdfjs-dist/package.json'));
    const task=getDocument({data:new Uint8Array(buffer),isEvalSupported:false,useSystemFonts:true,cMapUrl:path.join(root,'cmaps')+path.sep,cMapPacked:true,standardFontDataUrl:path.join(root,'standard_fonts')+path.sep,verbosity:0});
    let doc;
    try{
      doc=await task.promise;pages=doc.numPages;if(pages>30)throw new Error('PDF 超过 30 页，请仅导入简历部分');
      for(let i=1;i<=pages;i++){
        const page=await doc.getPage(i),content=await page.getTextContent();
        value+=content.items.map(item=>typeof item.str==='string'?item.str+(item.hasEOL?'\n':' '):'').join('')+'\n';
        if(value.length>60000)throw new Error('提取文字过长，请精简简历');page.cleanup();
      }
      warnings=['PDF 分栏和表格的阅读顺序可能变化，请核对提取文字。'];
    }finally{await task.destroy();}
  }
  const text=value.replace(/\r\n?/g,'\n').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  if(!text)throw new Error('没有可提取的文字；扫描版或图片简历请先 OCR，或粘贴正文。');
  if(text.length>30000)throw new Error('提取文字超过 30000 字，请精简简历');
  return {text,pages,warnings};
}
if(require.main===module)process.on('message',async body=>{
  try{process.send(await extract(body.ext,Buffer.from(body.base64,'base64')));}
  catch(e){const message=e.code==='MODULE_NOT_FOUND'||e.code==='ERR_MODULE_NOT_FOUND'?'缺少解析依赖，请在项目目录运行 npm ci。':e.name==='PasswordException'?'加密 PDF 请解密后导入。':e.message.startsWith('没有')||e.message.includes('超过')||e.message.includes('Word')?e.message:'无法解析该文件，请检查文件或粘贴正文。';process.send({error:message});}
});

module.exports={checkZip};
