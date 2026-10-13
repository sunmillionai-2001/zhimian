// 管理命令在服务器本机执行；不存在公开的管理员注册入口。
const {createAuthStore}=require('./auth-store');const path=require('node:path');
(async()=>{const store=createAuthStore(path.join(__dirname,'data'));try{
 const [command,value,extra,batch]=process.argv.slice(2);
 if(command==='admin')store.setAdmin(value);
 else if(command==='issue')console.log(JSON.stringify(store.issue({count:Number(value),days:Number(extra),batch:batch||'工作台'}),null,2));
 else if(command==='list')console.log(JSON.stringify(store.codes(),null,2));
 else if(command==='revoke')store.revoke(value);
 else if(command==='reset-password'){if(!process.env.ZM_NEW_PASSWORD)throw Error('通过环境变量 ZM_NEW_PASSWORD 提供新密码');await store.resetPassword(value,process.env.ZM_NEW_PASSWORD);}
 else throw Error('用法：node account-cli.js admin <账号> | issue <数量> <天数> [批次] | list | revoke <ID> | reset-password <账号>');
 }finally{store.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
