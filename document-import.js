// Import runs in an isolated short-lived process; no uploaded file is persisted.
const {fork}=require('node:child_process');
const path=require('node:path');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function validateUpload(body){
  if(typeof body.name!=='string'||body.name.length>240||typeof body.base64!=='string'||!body.base64.length||body.base64.length>4194304||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.base64))throw fail('文件内容无效或超过 3 MB');
  const ext=path.extname(body.name).toLowerCase(),buffer=Buffer.from(body.base64,'base64');
  if(!['.pdf','.docx'].includes(ext))throw fail('仅支持 PDF 和 Word .docx；旧 .doc 请先另存为 .docx。');
  if(!buffer.length||buffer.length>3*1024*1024)throw fail('文件超过 3 MB');
  if(ext==='.pdf'&&!buffer.subarray(0,1024).includes(Buffer.from('%PDF-')))throw fail('文件不是有效的 PDF');
  if(ext==='.docx'&&(buffer.length<4||buffer.readUInt32LE(0)!==0x04034b50))throw fail('文件不是有效的 Word .docx');
  return {ext,buffer};
}
function importDocument(body){
  const {ext}=validateUpload(body);
  return new Promise((resolve,reject)=>{
    const child=fork(path.join(__dirname,'document-worker.js'),[],{stdio:['ignore','ignore','ignore','ipc'],execArgv:['--max-old-space-size=192']});
    let done=false;const finish=(err,result)=>{if(done)return;done=true;clearTimeout(timer);child.kill();err?reject(err):resolve(result);};
    const timer=setTimeout(()=>finish(fail('文件解析超时，请简化文件或粘贴正文。',422)),20000);
    child.on('error',()=>finish(fail('无法启动文件解析服务',500)));
    child.on('exit',()=>finish(fail('文件解析失败，请检查文件或粘贴正文。',422)));
    child.on('message',data=>data.error?finish(fail(data.error,422)):finish(null,data));
    child.send({ext,base64:body.base64});
  });
}
module.exports={importDocument,validateUpload};
