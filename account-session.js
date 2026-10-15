// 服务端只向已登录且有权限的工作台注入账号；不接管原离线数据。
(()=>{
 const account=window.ZM_ACCOUNT;if(!account)return;
 const raw=window.localStorage,prefix='zm_account:'+account.id+':';
 const scoped={getItem:key=>raw.getItem(prefix+key),setItem:(key,value)=>raw.setItem(prefix+key,String(value)),removeItem:key=>raw.removeItem(prefix+key),clear(){for(const key of Object.keys(raw))if(key.startsWith(prefix))raw.removeItem(key);},key(index){return Object.keys(raw).filter(k=>k.startsWith(prefix))[index]?.slice(prefix.length)||null;},get length(){return Object.keys(raw).filter(k=>k.startsWith(prefix)).length;}};
 Object.defineProperty(window,'localStorage',{value:scoped});
 addEventListener('DOMContentLoaded',()=>{
  const name=document.querySelector('.sb-user-name'),sub=document.querySelector('.sb-user-sub');if(name)name.textContent=account.username;if(sub)sub.textContent=account.role==='admin'?'工作台管理员':'已开通工作台';
  const foot=document.querySelector('.sb-foot');if(foot){const link=document.createElement('a');link.href='/account.html';link.textContent='账号与兑换 →';link.className='btn btn-ghost';foot.prepend(link);}
  document.getElementById('aiSettings').hidden=true;
 });
 const originalFetch=window.fetch.bind(window);window.fetch=async(...args)=>{if(typeof args[0]==='string'&&args[0].startsWith('/api/')){const options=args[1]||{},headers=new Headers(options.headers);headers.set('X-ZM-Account',account.id);args[1]={...options,headers};}const response=await originalFetch(...args);if(response.status===409){try{if((await response.clone().json()).code==='ACCOUNT_CHANGED')location.replace('/account.html');}catch{}}if(response.status===401&&String(args[0]).startsWith('/api/'))location.replace('/account.html');return response;};
 setInterval(async()=>{try{const r=await originalFetch('/api/auth/me',{cache:'no-store'});if(!r.ok)return;const result=await r.json();if(!result.user||result.user.id!==account.id||!result.user.active)location.replace('/account.html');}catch{}},60000);
 if('BroadcastChannel' in window){const channel=new BroadcastChannel('zhimian-account');channel.onmessage=()=>location.reload();}
})();
