// Recheck public script identities and bounded anchors; never execute fetched code.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run=promisify(execFile);
const manifest=JSON.parse(await fs.readFile(new URL('./evidence.json',import.meta.url),'utf8'));
const live=process.argv.includes('--live');
const allowed=['https://appv2.huru.ai/assets/','https://app.yoodli.ai/static/js/'];
let failures=0;
const ids=new Set();
for(const source of manifest.sources){
  const url=new URL(source.url);
  if(!allowed.some(prefix=>source.url.startsWith(prefix))||url.username||url.password||url.search||url.hash||!/^[a-f0-9]{64}$/.test(source.sha256))throw Error('Invalid public script metadata');
  for(const a of source.anchors){
    if(ids.has(a.id)||!a.literal||!Number.isSafeInteger(a.offset_utf16)||a.offset_utf16<0||!Number.isInteger(a.line)||a.line<1)throw Error('Invalid anchor metadata');
    ids.add(a.id);
  }
  if(!live)continue;
  try{
    // No redirect following: a moved artifact is evidence drift, not an equivalent file.
    const {stdout}=await run('curl',['--fail','--silent','--show-error','--proto','=https','--max-time','30','--max-filesize','12000000',source.url],{encoding:'buffer',maxBuffer:12000000,timeout:35000});
    const digest=createHash('sha256').update(stdout).digest('hex');
    if(digest!==source.sha256||stdout.length!==source.bytes){
      failures++;console.log(JSON.stringify({source:source.id,status:'changed',expectedSha256:source.sha256,actualSha256:digest}));continue;
    }
    const text=stdout.toString('utf8');
    const invalid=source.anchors.filter(a=>{
      if(text.slice(a.offset_utf16,a.offset_utf16+a.literal.length)!==a.literal)return true;
      const prefix=text.slice(0,a.offset_utf16);
      const line=prefix.split('\n').length,column=prefix.length-prefix.lastIndexOf('\n')-1;
      return a.line!==line||a.column_utf16!==column;
    });
    if(invalid.length)failures++;
    console.log(JSON.stringify({source:source.id,status:invalid.length?'anchor_mismatch':'verified',bytes:stdout.length,anchors:source.anchors.length,invalid:invalid.map(a=>a.id)}));
  }catch(error){failures++;console.log(JSON.stringify({source:source.id,status:'unavailable',reason:error.code??'download_failed'}));}
}
if(!live)console.log(JSON.stringify({status:'metadata_valid',sources:manifest.sources.length,anchors:ids.size,note:'Use --live to re-fetch public scripts; metadata checks do not prove current site behavior.'}));
process.exitCode=failures?1:0;
