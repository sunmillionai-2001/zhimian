// 账号、会话与一次兑换：SQLite 事务是权限的唯一真源。
const {DatabaseSync}=require('node:sqlite');
const {randomBytes,randomUUID,scrypt:derive,timingSafeEqual,createHash}=require('node:crypto');
const {promisify}=require('node:util');
const fs=require('node:fs'),path=require('node:path');
const scrypt=promisify(derive),hash=s=>createHash('sha256').update(s).digest('hex');
const fail=(s,status=400)=>Object.assign(new Error(s),{status});
function createAuthStore(dir){
 fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'accounts.sqlite');const db=new DatabaseSync(file);fs.chmodSync(file,0o600);
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,salt TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS codes(id TEXT PRIMARY KEY,digest TEXT UNIQUE NOT NULL,batch TEXT NOT NULL,days INTEGER NOT NULL,created_at INTEGER NOT NULL,redeem_by INTEGER,used_by TEXT REFERENCES users(id),used_at INTEGER,revoked INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,created_at INTEGER NOT NULL);`);
 const query=(sql,...args)=>db.prepare(sql).all(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
 function audit(actor,action,target){run('INSERT INTO audit(actor,action,target,created_at) VALUES(?,?,?,?)',actor,action,target,Date.now());}
 function user(id){const u=db.prepare('SELECT id,username,role FROM users WHERE id=?').get(id);if(!u)return null;
  let until=0;for(const c of query('SELECT days,used_at FROM codes WHERE used_by=? AND revoked=0 ORDER BY used_at,id',id))until=Math.max(until,c.used_at)+c.days*86400000;
  return {...u,accessUntil:until||null,active:u.role==='admin'||until>Date.now()};
 }
 const username=v=>{if(typeof v!=='string'||! /^[a-zA-Z0-9_\-]{3,40}$/.test(v.trim()))throw fail('账号需为 3–40 位字母、数字、下划线或短横线');return v.trim().toLowerCase();};
 const password=v=>{if(typeof v!=='string'||v.length<10||v.length>128)throw fail('密码需为 10–128 个字符');return v;};
 function session(id){const token=randomBytes(32).toString('hex');run('INSERT INTO sessions VALUES(?,?,?)',hash(token),id,Date.now()+7*86400000);run('DELETE FROM sessions WHERE expires_at<?',Date.now());return token;}
 return {
  user,
  async register(name,pass){name=username(name);password(pass);const salt=randomBytes(16).toString('hex'),p=(await scrypt(pass,salt,64)).toString('hex'),id=randomUUID();try{run('INSERT INTO users VALUES(?,?,?,?,?,?)',id,name,p,salt,'user',Date.now());}catch(e){if(String(e.message).includes('UNIQUE'))throw fail('该账号已注册',409);throw e;}audit(id,'register',id);return {user:user(id),token:session(id)};},
  async login(name,pass){name=username(name);password(pass);const u=db.prepare('SELECT * FROM users WHERE username=?').get(name);const p=await scrypt(pass,u?.salt||'invalid-account-salt',64);if(!u||!timingSafeEqual(p,Buffer.from(u.password,'hex')))throw fail('账号或密码错误',401);return {user:user(u.id),token:session(u.id)};},
  authenticate(token){if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token))return null;const s=db.prepare('SELECT user_id FROM sessions WHERE token=? AND expires_at>?').get(hash(token),Date.now());return s?user(s.user_id):null;},
  logout(token){if(token)run('DELETE FROM sessions WHERE token=?',hash(token));},
  issue({count=1,days,batch='工作台',redeemBy=null},actor='cli'){
   if(!Number.isInteger(count)||count<1||count>100||!Number.isInteger(days)||days<1||days>3650||typeof batch!=='string'||batch.length>100||!batch.trim())throw fail('数量需为 1–100，使用天数需为 1–3650，批次名称不能为空');
   let deadline=null;if(redeemBy!==null){deadline=Date.parse(redeemBy);if(!Number.isFinite(deadline)||deadline<=Date.now())throw fail('兑换截止时间需在未来');}
   const out=[];db.exec('BEGIN IMMEDIATE');try{for(let i=0;i<count;i++){const code='ZM-'+randomBytes(15).toString('hex').toUpperCase(),id=randomUUID();run('INSERT INTO codes(id,digest,batch,days,created_at,redeem_by) VALUES(?,?,?,?,?,?)',id,hash(code),batch.trim(),days,Date.now(),deadline);audit(actor,'issue',id);out.push({id,code,days,batch,redeemBy:deadline});}db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}
  },
  redeem(id,value){if(typeof value!=='string'||value.length>100)throw fail('兑换码格式错误');const digest=hash(value.trim().toUpperCase());db.exec('BEGIN IMMEDIATE');try{
   const c=db.prepare('SELECT * FROM codes WHERE digest=?').get(digest);if(!c||c.revoked||c.redeem_by&&c.redeem_by<Date.now())throw fail('兑换码无效、已停用或已过期');
   if(c.used_by){if(c.used_by!==id)throw fail('兑换码已被使用',409);db.exec('COMMIT');return {...user(id),alreadyRedeemed:true};}
   if(!user(id))throw fail('请先登录',401);const result=run('UPDATE codes SET used_by=?,used_at=? WHERE id=? AND used_by IS NULL AND revoked=0',id,Date.now(),c.id);if(result.changes!==1)throw fail('兑换码已被使用',409);audit(id,'redeem',c.id);db.exec('COMMIT');return user(id);
  }catch(e){db.exec('ROLLBACK');throw e;}},
  codes(){return query('SELECT c.id,c.batch,c.days,c.created_at,c.redeem_by,c.used_at,c.revoked,u.username AS usedBy FROM codes c LEFT JOIN users u ON u.id=c.used_by ORDER BY c.created_at DESC LIMIT 1000');},
  revoke(id,actor='cli'){const r=run('UPDATE codes SET revoked=1 WHERE id=?',id);if(!r.changes)throw fail('兑换码不存在',404);audit(actor,'revoke',id);},
  setAdmin(name){const r=run("UPDATE users SET role='admin' WHERE username=?",username(name));if(!r.changes)throw fail('账号不存在',404);audit('cli','admin',name);},
  async resetPassword(name,pass){password(pass);const u=db.prepare('SELECT id FROM users WHERE username=?').get(username(name));if(!u)throw fail('账号不存在',404);const salt=randomBytes(16).toString('hex'),p=(await scrypt(pass,salt,64)).toString('hex');db.exec('BEGIN IMMEDIATE');try{run('UPDATE users SET password=?,salt=? WHERE id=?',p,salt,u.id);run('DELETE FROM sessions WHERE user_id=?',u.id);audit('cli','reset-password',u.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},
  close(){db.close();}
 };
}
module.exports={createAuthStore};
