// 按账号保存模型连接；密钥单独加密，不进入 API 列表或浏览器存储。
const {DatabaseSync}=require('node:sqlite');
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const BUILTIN='__builtin__';
const PRESETS=[
 {preset:'qwen',name:'Qwen Flash',baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',model:'qwen-flash',note:'低价候选 · 管理员配置后可用'},
 {preset:'glm',name:'GLM Flash',baseUrl:'https://api.z.ai/api/paas/v4',model:'glm-4.7-flash',note:'免费候选 · 以服务商实时政策为准'},
 {preset:'deepseek',name:'DeepSeek Flash',baseUrl:'https://api.deepseek.com',model:'deepseek-flash',note:'备用候选 · 按服务商标准计费'}
];
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function endpoint(value){let u;try{u=new URL(value);}catch{throw fail('接口地址格式错误');}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port&&u.port!=='443'||u.hostname.endsWith('.')||u.href.length>500)throw fail('接口需为不含凭据、查询参数的 HTTPS 地址，使用标准 443 端口');return u.href.replace(/\/$/,'');}
function createModelStore(directory,legacy={}){
 fs.mkdirSync(directory,{recursive:true});const keyFile=path.join(directory,'model-secret.key');
 if(!fs.existsSync(keyFile)&&fs.existsSync(path.join(directory,'models.sqlite')))throw Error('模型加密密钥缺失，请恢复与数据库配套的 model-secret.key');
 if(!fs.existsSync(keyFile)){try{fs.writeFileSync(keyFile,crypto.randomBytes(32),{mode:0o600,flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}}
 const secret=fs.readFileSync(keyFile);if(secret.length!==32)throw Error('模型密钥文件异常，原文件保留');fs.chmodSync(keyFile,0o600);
 const dbFile=path.join(directory,'models.sqlite'),db=new DatabaseSync(dbFile);fs.chmodSync(dbFile,0o600);
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,base_url TEXT NOT NULL,model TEXT NOT NULL,secret TEXT NOT NULL,preset TEXT NOT NULL,enabled INTEGER NOT NULL,position INTEGER NOT NULL,tested_at INTEGER,created_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS profile_owner ON profiles(owner,position,created_at);
 CREATE TABLE IF NOT EXISTS selections(owner TEXT PRIMARY KEY,profile_id TEXT);
 CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
 function seal(text,owner,id){if(!text)return '';const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',secret,iv);cipher.setAAD(Buffer.from(owner+':'+id));return JSON.stringify({iv:iv.toString('hex'),value:Buffer.concat([cipher.update(text,'utf8'),cipher.final()]).toString('hex'),tag:cipher.getAuthTag().toString('hex')});}
 function unseal(value,owner,id){if(!value)return '';try{const p=JSON.parse(value),decipher=crypto.createDecipheriv('aes-256-gcm',secret,Buffer.from(p.iv,'hex'));decipher.setAAD(Buffer.from(owner+':'+id));decipher.setAuthTag(Buffer.from(p.tag,'hex'));return Buffer.concat([decipher.update(Buffer.from(p.value,'hex')),decipher.final()]).toString('utf8');}catch{throw fail('模型密钥无法读取，请重新保存该连接的 Key',503);}}
 const rows=owner=>db.prepare('SELECT * FROM profiles WHERE owner=? ORDER BY position,created_at,id').all(owner);
 const find=(owner,id)=>db.prepare('SELECT * FROM profiles WHERE owner=? AND id=?').get(owner,id);
 const publicRow=p=>({id:p.id,name:p.name,baseUrl:p.base_url,model:p.model,preset:p.preset,enabled:!!p.enabled,priority:p.position,hasKey:!!p.secret,testedAt:p.tested_at});
 function save(owner,input,id){
  const old=id?find(owner,id):null;if(id&&!old)throw fail('模型连接不存在',404);if(!id&&rows(owner).length>=10)throw fail('最多保存 10 个模型连接');
  if(!input||typeof input!=='object')throw fail('模型配置格式错误');
  const name=input.name??old?.name,model=input.model??old?.model,baseUrl=endpoint(input.baseUrl??old?.base_url),preset=input.preset??old?.preset??'custom';
  if(typeof name!=='string'||!name.trim()||name.length>80||typeof model!=='string'||!model.trim()||model.length>200||!['qwen','glm','deepseek','custom'].includes(preset))throw fail('请填写有效的连接名称和模型名称');
  const priority=input.priority??old?.position??0;if(!Number.isInteger(priority)||priority<0||priority>99)throw fail('切换顺序需为 0–99');
  if(input.enabled!==undefined&&typeof input.enabled!=='boolean')throw fail('启用状态格式错误');
  const profileId=id||crypto.randomUUID();let encrypted=old?.secret||'';
  if(input.clearKey===true)encrypted='';else if(input.apiKey!==undefined){if(typeof input.apiKey!=='string'||input.apiKey.length>2000||/[^\x21-\x7E]/.test(input.apiKey.trim()))throw fail('Key 格式错误');if(input.apiKey.trim())encrypted=seal(input.apiKey.trim(),owner,profileId);}
  const enabled=input.enabled??!!old?.enabled;if(enabled&&!encrypted)throw fail('启用前请先保存 Key');
  const changed=!old||baseUrl!==old.base_url||model.trim()!==old.model||encrypted!==old.secret||preset!==old.preset;
  db.prepare('INSERT INTO profiles VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,base_url=excluded.base_url,model=excluded.model,secret=excluded.secret,preset=excluded.preset,enabled=excluded.enabled,position=excluded.position,tested_at=excluded.tested_at').run(profileId,owner,name.trim(),baseUrl,model.trim(),encrypted,preset,Number(enabled),priority,changed?null:old?.tested_at??null,old?.created_at??Date.now());
  return publicRow(find(owner,profileId));
 }
 // 只初始化一次，删除的预设和旧配置不会在重启后复活。
 if(!db.prepare("SELECT key FROM meta WHERE key='initialized'").get()){
  db.exec('BEGIN IMMEDIATE');try{for(const [i,p] of PRESETS.entries())save(BUILTIN,{...p,priority:i,enabled:false});if(legacy.apiKey&&String(legacy.baseUrl).startsWith('https://'))save(BUILTIN,{name:'原有内置连接',model:legacy.model,baseUrl:legacy.baseUrl,apiKey:legacy.apiKey,preset:'custom',priority:0,enabled:true});db.prepare('INSERT INTO meta VALUES(?,?)').run('initialized','1');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 }
 return {
  list:owner=>rows(owner).map(publicRow),save,
  remove(owner,id){if(!find(owner,id))throw fail('模型连接不存在',404);db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM profiles WHERE owner=? AND id=?').run(owner,id);db.prepare('UPDATE selections SET profile_id=NULL WHERE owner=? AND profile_id=?').run(owner,id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},
  selected:owner=>db.prepare('SELECT profile_id FROM selections WHERE owner=?').get(owner)?.profile_id||null,
  select(owner,id){if(id!==null){const p=find(owner,id);if(!p||!p.enabled||!p.secret)throw fail('请先保存并启用个人模型');}db.prepare('INSERT INTO selections VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET profile_id=excluded.profile_id').run(owner,id);},
  connection(owner,id){const p=find(owner,id);if(!p)throw fail('模型连接不存在',404);return {...publicRow(p),apiKey:unseal(p.secret,owner,p.id)};},
  markTested(owner,id){db.prepare('UPDATE profiles SET tested_at=? WHERE owner=? AND id=?').run(Date.now(),owner,id);},
  close(){db.close();}
 };
}
module.exports={createModelStore,PRESETS,BUILTIN,endpoint};
