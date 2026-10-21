// Repair the legacy one-font pdf-lib resume without changing pages or text placement.
// The source PDF is read-only; write with wx to avoid overwriting any existing file.
const fs=require('node:fs'),path=require('node:path');
const {PDFDocument,PDFName,PDFArray,decodePDFRawStream}=require('pdf-lib');
const {embedResumeFont}=require('../pdf-font');
async function repair(buffer){
 const pdf=await PDFDocument.load(buffer),font=await embedResumeFont(pdf);let repaired=0,streams=0;
 const pages = pdf.getPages().map(page => ({page, fonts: page.node.Resources()?.lookup(PDFName.of('Font'))}));
 const replacements = [];
 for(const {page, fonts} of pages){
  if(!fonts||new Set(fonts.entries().map(([,r])=>r.toString())).size!==1)throw Error('Only the legacy single-font resume export is supported');
  const [,ref]=fonts.entries()[0],old=pdf.context.lookup(ref);
  if(!old.get(PDFName.of('BaseFont'))?.toString().startsWith('/NotoSansCJKsc-Regular-'))throw Error('Not a legacy resume font');
  const cmap=Buffer.from(decodePDFRawStream(pdf.context.lookup(old.get(PDFName.of('ToUnicode')))).decode()).toString('utf8'),map=new Map();
  for(const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))for(const m of block[1].matchAll(/<([\dA-Fa-f]{4})>\s*<([\dA-Fa-f]+)>/g)){const bytes=Buffer.from(m[2],'hex');if(bytes.length%2)throw Error('Invalid character map');map.set(m[1].toUpperCase(),Buffer.from(bytes).swap16().toString('utf16le'));}
  if(!map.size)throw Error('No recoverable character mapping');
  const contents=page.node.Contents(),refs=contents instanceof PDFArray?contents.asArray():[contents];
  const next=refs.map(r=>{
   const raw=Buffer.from(decodePDFRawStream(pdf.context.lookup(r)).decode()).toString('latin1');
   if(/\bTJ\b|\([^\n]*\)\s*Tj/.test(raw))throw Error('Unsupported text encoding');
   const changed=raw.replace(/<([\dA-Fa-f]+)>\s*Tj/g,(_,hex)=>{if(hex.length%4)throw Error('Invalid text codes');let text='';for(let i=0;i<hex.length;i+=4){const v=map.get(hex.slice(i,i+4).toUpperCase());if(v===undefined)throw Error('Missing character map entry');text+=v;}repaired+=text.length;return font.encodeText(text).toString()+' Tj';});
   streams++;return pdf.context.register(pdf.context.flateStream(Buffer.from(changed,'latin1')));
  });
  replacements.push(fonts);page.node.set(PDFName.of('Contents'),pdf.context.obj(next));
 }
 for(const fonts of replacements)for(const [key] of fonts.entries())fonts.set(key,font.ref);
 if(!repaired)throw Error('No text repaired');return {buffer:Buffer.from(await pdf.save()),pages:pdf.getPageCount(),characters:repaired,streams};
}
if(require.main===module)(async()=>{const [input,output]=process.argv.slice(2);if(!input||!output||path.resolve(input)===path.resolve(output))throw Error('Usage: node scripts/repair-resume-pdf.cjs input.pdf new-output.pdf');const r=await repair(fs.readFileSync(input));fs.writeFileSync(output,r.buffer,{flag:'wx'});console.log(JSON.stringify({pages:r.pages,characters:r.characters,output}));})().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={repair};
