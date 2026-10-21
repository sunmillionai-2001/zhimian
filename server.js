// 职面 ZhiMian · 本地服务（静态托管 + 大模型代理 + 本地数据存储）
// 可移植：所有路径基于本文件所在目录，换设备/换目录都能跑。
// 用法：node server.js   然后浏览器打开 http://127.0.0.1:8123/app.html
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createReviewStore } = require('./review-store');
const { runAi } = require('./ai-service');
const { importDocument } = require('./document-import');
const { createAuthStore } = require('./auth-store');
const { createModelService } = require('./model-service');
const { BUILTIN } = require('./model-store');

const ROOT = __dirname;                              // 本目录即站点根，含 app.html
const CONFIG_FILE = path.join(ROOT, 'server.config.json');   // 大模型配置（已在 .gitignore）
const DATA_DIR = path.join(ROOT, 'data');                    // 本地数据（已在 .gitignore）
const PORT = Number(process.env.PORT || 8123);
const localMode=process.env.ZM_LOCAL_MODE==='1';
const authStore=localMode?null:createAuthStore(DATA_DIR);
const localReviews=createReviewStore(DATA_DIR);
const publicOrigin=process.env.PUBLIC_ORIGIN||'http://127.0.0.1:'+PORT;
const cookieSecure=new URL(publicOrigin).protocol==='https:';
const failures=new Map();
function throttle(req){const key=req.socket.remoteAddress,now=Date.now();for(const [k,v] of failures)if(v.until<now)failures.delete(k);const entry=failures.get(key)||{count:0,until:now+600000};if(++entry.count>30||failures.size>10000)throw Object.assign(new Error('尝试过于频繁，请稍后重试'),{status:429});failures.set(key,entry);}
function tokenOf(req){return /(?:^|;\s*)zm_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];}
function sessionCookie(res,token){res.setHeader('Set-Cookie','zm_session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+(token?604800:0)+(cookieSecure?'; Secure':''));}

const DEFAULT_CONFIG = {
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-flash',
  apiKey: ''
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8'
};

function ensureDirs() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}
function readConfig() {
  try { return Object.assign({}, DEFAULT_CONFIG, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))); }
  catch (e) { return Object.assign({}, DEFAULT_CONFIG); }
}
function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '', size = 0, tooLarge = false;
    req.on('data', c => {
      size += c.length;
      if (size > 5e6) { tooLarge = true; raw = ''; }
      else if (!tooLarge) raw += c;
    });
    req.on('end', () => {
      try {
        if (tooLarge) throw Object.assign(new Error('请求体过大'), { status: 413 });
        const body = raw ? JSON.parse(raw) : {};
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('需要 JSON 对象');
        resolve(body);
      } catch (e) { reject(Object.assign(e, { status: e.status || 400 })); }
    });
    req.on('error', reject);
    req.on('aborted', () => reject(new Error('请求已中止')));
  });
}
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function storeFileName(key) {
  return 'store-' + String(key).replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
}

const modelService=localMode?null:createModelService(DATA_DIR,readConfig());

const server = http.createServer(async (req, res) => {
  try {
  let url;
  try { url = decodeURIComponent((req.url || '/').split('?')[0]); }
  catch (e) { return sendJson(res, 400, { error: '非法 URL 编码' }); }
  if (url.includes('\\') || url.includes('\0') || url.split('/').some(p => p === '.' || p === '..')) {
    return sendJson(res, 403, { error: '禁止访问该路径' });
  }
  if (['POST','DELETE'].includes(req.method) && req.headers.origin && req.headers.origin !== publicOrigin) {
    return sendJson(res, 403, { error: '只允许同源请求' });
  }

  if(['POST','DELETE'].includes(req.method)&&req.headers['sec-fetch-site']==='cross-site')return sendJson(res,403,{error:'只允许同源请求'});
  const account=authStore?.authenticate(tokenOf(req));
  if(!localMode&&url.startsWith('/api/')&&req.headers['x-zm-account']&&req.headers['x-zm-account']!==account?.id)return sendJson(res,409,{error:'账号已变化，请重新打开工作台',code:'ACCOUNT_CHANGED'});
  if(url==='/api/auth/me'&&req.method==='GET')return sendJson(res,200,{enabled:!localMode,user:account||null});
  if(!localMode&&['/api/auth/register','/api/auth/login'].includes(url)&&req.method==='POST'){
    throttle(req);const body=await readBody(req);const result=await authStore[url.endsWith('register')?'register':'login'](body.username,body.password);sessionCookie(res,result.token);return sendJson(res,200,{user:result.user});
  }
  if(!localMode&&url==='/api/auth/logout'&&req.method==='POST'){authStore.logout(tokenOf(req));sessionCookie(res,'');return sendJson(res,200,{ok:true});}
  if(!localMode&&url==='/api/auth/redeem'&&req.method==='POST'){if(!account)return sendJson(res,401,{error:'请先登录'});throttle(req);const body=await readBody(req);return sendJson(res,200,{user:authStore.redeem(account.id,body.code)});}
  if(!localMode&&url.startsWith('/api/admin/')){
    if(!account)return sendJson(res,401,{error:'请先登录'});if(account.role!=='admin')return sendJson(res,403,{error:'需要管理员权限'});
    if(url==='/api/admin/codes'&&req.method==='GET')return sendJson(res,200,{codes:authStore.codes()});
    if(url==='/api/admin/codes'&&req.method==='POST')return sendJson(res,200,{codes:authStore.issue(await readBody(req),account.id)});
    if(url.startsWith('/api/admin/codes/')&&req.method==='DELETE'){authStore.revoke(url.slice('/api/admin/codes/'.length),account.id);return sendJson(res,200,{ok:true});}
    if(url==='/api/admin/models'&&req.method==='GET')return sendJson(res,200,{profiles:modelService.store.list(BUILTIN)});
    if(url==='/api/admin/models'&&req.method==='POST')return sendJson(res,200,{profile:await modelService.save(BUILTIN,await readBody(req))});
    const modelMatch=/^\/api\/admin\/models\/([a-zA-Z0-9-]+)(\/test|\/verify)?$/.exec(url);
    if(modelMatch){const id=modelMatch[1];if(modelMatch[2]&&req.method==='POST')return sendJson(res,200,await modelService[modelMatch[2]==='/verify'?'verify':'test'](BUILTIN,id,account.id));if(!modelMatch[2]&&req.method==='POST')return sendJson(res,200,{profile:await modelService.save(BUILTIN,await readBody(req),id)});if(!modelMatch[2]&&req.method==='DELETE'){modelService.store.remove(BUILTIN,id);return sendJson(res,200,{ok:true});}}
    return sendJson(res,404,{error:'接口不存在'});
  }
  if(!localMode&&url.startsWith('/api/')){
    if(!account)return sendJson(res,401,{error:'请先登录'});
    if(url==='/api/config'||url==='/api/chat'||url==='/api/ai/test'){if(account.role!=='admin')return sendJson(res,403,{error:'需要管理员权限'});}
    else if(!account.active)return sendJson(res,403,{error:'请兑换工作台使用权限，或续期后继续'});
  }
  if(!localMode){
    if(url==='/api/models'&&req.method==='GET')return sendJson(res,200,modelService.list(account.id));
    if(url==='/api/models'&&req.method==='POST')return sendJson(res,200,{profile:await modelService.save(account.id,await readBody(req))});
    if(url==='/api/models/selection'&&req.method==='POST'){const b=await readBody(req);modelService.store.select(account.id,b.profileId??null);return sendJson(res,200,modelService.list(account.id));}
    const m=/^\/api\/models\/([a-zA-Z0-9-]+)(\/test|\/verify)?$/.exec(url);
    if(m){if(m[2]&&req.method==='POST')return sendJson(res,200,await modelService[m[2]==='/verify'?'verify':'test'](account.id,m[1]));if(!m[2]&&req.method==='POST')return sendJson(res,200,{profile:await modelService.save(account.id,await readBody(req),m[1])});if(!m[2]&&req.method==='DELETE'){modelService.store.remove(account.id,m[1]);return sendJson(res,200,{ok:true});}}
  }
  const userDirectory=localMode?DATA_DIR:path.join(DATA_DIR,'users',account?.id||'none');
  const reviewStore=localMode?localReviews:createReviewStore(userDirectory);
  if(!localMode&&['/','/app.html','/index.html','/index-sidebar.html'].includes(url)&&!account?.active){res.writeHead(302,{Location:'/account.html','Cache-Control':'no-store'});return res.end();}
  // ---------- 面试复盘：记录与首页统计使用同一份服务端数据 ----------
  if (url === '/api/reviews' && req.method === 'GET') return sendJson(res, 200, reviewStore.list());
  if (url === '/api/reviews' && req.method === 'POST') {
    return sendJson(res, 200, reviewStore.add(await readBody(req)));
  }
  if (url === '/api/reviews/import' && req.method === 'POST') {
    const body = await readBody(req);
    return sendJson(res, 200, reviewStore.import(body.records));
  }
  if (url.startsWith('/api/reviews/') && req.method === 'DELETE') {
    const id = url.slice('/api/reviews/'.length);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return sendJson(res, 400, { error: '复盘 ID 格式错误' });
    return sendJson(res, 200, reviewStore.remove(id));
  }

  if (url === '/api/resume/import' && req.method === 'POST') return sendJson(res, 200, await importDocument(await readBody(req)));

  if(url==='/api/resume/source'&&req.method==='POST')return sendJson(res,200,await require('./resume-layout').createSourceStore(userDirectory).import(await readBody(req)));
  if(url==='/api/resume/preview'&&req.method==='POST'){
    const body=await readBody(req);return sendJson(res,200,await require('./resume-layout').createSourceStore(userDirectory).page(body.sourceId,body.page||1,body.text));
  }
  const pageMatch=/^\/api\/resume\/source\/([a-f0-9]{32})\/page\/(\d+)$/.exec(url);
  if(pageMatch&&req.method==='GET'){
    const r=await require('./resume-layout').createSourceStore(userDirectory).page(pageMatch[1],Number(pageMatch[2]));res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(Buffer.from(r.base64,'base64'));
  }
  const sourceMatch=/^\/api\/resume\/source\/([a-f0-9]{32})\/(preview|original)$/.exec(url);
  if(sourceMatch&&req.method==='GET'){
    const {buffer,ext}=require('./resume-layout').createSourceStore(userDirectory).read(sourceMatch[1],sourceMatch[2]==='original');
    res.writeHead(200,{'Content-Type':ext==='.pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':(sourceMatch[2]==='original'?'attachment':'inline')+'; filename="resume'+ext+'"'});return res.end(buffer);
  }

  // 简历导出接口（懒加载 resume-export，避免 server 启动即依赖第三方库）
  if (url === '/api/resume/export/word' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.text || typeof body.text !== 'string') {
      return sendJson(res, 400, { error: '缺少简历文本' });
    }
    if (body.text.length > 30000) {
      return sendJson(res, 400, { error: '简历文本过长，请控制在 30000 字以内' });
    }
    try {
      if(typeof body.sourceId !== 'string' || !body.sourceId.trim()) return sendJson(res,409,{code:'RESUME_SOURCE_REQUIRED',error:'请先导入原简历文件，才能按原模板导出。正文和改写已保留。'});
      const buffer = await require('./resume-layout').createSourceStore(userDirectory).render(body.sourceId,body.text,'word',true);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="zhimian-resume.docx"',
        'Content-Length': buffer.length
      });
      return res.end(buffer);
    } catch (err) {
      return sendJson(res, err.status||500, { error: 'Word 生成失败：' + err.message });
    }
  }

  if (url === '/api/resume/export/pdf' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.text || typeof body.text !== 'string') {
      return sendJson(res, 400, { error: '缺少简历文本' });
    }
    if (body.text.length > 30000) {
      return sendJson(res, 400, { error: '简历文本过长，请控制在 30000 字以内' });
    }
    try {
      if(typeof body.sourceId !== 'string' || !body.sourceId.trim()) return sendJson(res,409,{code:'RESUME_SOURCE_REQUIRED',error:'请先导入原简历文件，才能按原模板导出。正文和改写已保留。'});
      const buffer = await require('./resume-layout').createSourceStore(userDirectory).render(body.sourceId,body.text,'pdf',true);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="zhimian-resume.pdf"',
        'Content-Length': buffer.length
      });
      return res.end(buffer);
    } catch (err) {
      return sendJson(res, err.status||500, { error: 'PDF 生成失败：' + err.message });
    }
  }

  if (url.startsWith('/api/ai/') && req.method === 'POST') {
    const task=url.slice('/api/ai/'.length),body=await readBody(req);
    return sendJson(res,200,localMode?await runAi(task,body,readConfig()):await modelService.execute(account.id,task,body));
  }

  // ---------- 大模型代理（浏览器直连大模型常被 CORS 拦，这里由服务端转发）----------
  if (url === '/api/chat' && req.method === 'POST') {
    const body = await readBody(req);
    const cfg = readConfig();
    if (!cfg.apiKey) return sendJson(res, 400, { error: '未配置 API Key，请打开「AI 设置」填写，或编辑 server.config.json。' });
    const payload = {
      model: body.model || cfg.model,
      messages: body.messages || [],
      temperature: typeof body.temperature === 'number' ? body.temperature : 0.7,
      stream: false
    };
    if (body.json) payload.response_format = { type: 'json_object' };
    try {
      const upstream = await fetch(cfg.baseUrl.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(60000),
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
        body: JSON.stringify(payload)
      });
      const text = await upstream.text();
      if (!upstream.ok) return sendJson(res, 502, { error: '上游返回 ' + upstream.status, detail: text.slice(0, 800) });
      let data;
      try { data = JSON.parse(text); } catch (e) { return sendJson(res, 502, { error: '上游返回非 JSON', detail: text.slice(0, 500) }); }
      const content = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      return sendJson(res, 200, { content, usage: data.usage || null });
    } catch (e) {
      return sendJson(res, 502, { error: '调用失败：' + e.message });
    }
  }

  // ---------- 配置读写（不回传 apiKey 明文）----------
  if (url === '/api/config' && req.method === 'GET') {
    const cfg = readConfig();
    return sendJson(res, 200, { hasKey: !!cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model });
  }
  if (url === '/api/config' && req.method === 'POST') {
    const body = await readBody(req);
    const cfg = readConfig();
    if (body.baseUrl !== undefined) {
      let parsed;
      try { parsed = new URL(body.baseUrl); } catch (e) { return sendJson(res, 400, { error: '接口地址格式错误' }); }
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) return sendJson(res, 400, { error: '接口地址需要 HTTP(S)，且不含凭据、查询参数或片段' });
      cfg.baseUrl = parsed.href.replace(/\/$/, '');
    }
    if (body.model !== undefined) {
      if (typeof body.model !== 'string' || !body.model.trim() || body.model.length > 200) return sendJson(res, 400, { error: '模型名称格式错误' });
      cfg.model = body.model.trim();
    }
    if (body.apiKey !== undefined) {
      if (typeof body.apiKey !== 'string' || body.apiKey.length > 1000) return sendJson(res, 400, { error: 'Key 格式错误' });
      if (body.apiKey.trim()) cfg.apiKey = body.apiKey.trim();
    }
    if (body.clearKey === true) cfg.apiKey = '';
    writeConfig(cfg);
    return sendJson(res, 200, { ok: true, hasKey: !!cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model });
  }

  // ---------- 本地数据持久化（让数据不只在浏览器 localStorage）----------
  if (url === '/api/store' && req.method === 'GET') {
    ensureDirs();
    const out = {};
    try {
      fs.mkdirSync(userDirectory,{recursive:true});
      fs.readdirSync(userDirectory).filter(f => f.startsWith('store-') && f.endsWith('.json')).forEach(f => {
        try { out[f.slice(6, -5)] = JSON.parse(fs.readFileSync(path.join(userDirectory, f), 'utf8')); } catch (e) {}
      });
    } catch (e) {}
    return sendJson(res, 200, out);
  }
  if (url === '/api/store' && req.method === 'POST') {
    ensureDirs();
    const body = await readBody(req);
    if (!body || typeof body.key !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.key)) return sendJson(res, 400, { error: 'missing key' });
    try {
      fs.mkdirSync(userDirectory,{recursive:true});
      fs.writeFileSync(path.join(userDirectory, storeFileName(body.key)), JSON.stringify(body.value), 'utf8');
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // 只发布明确允许的页面，配置、数据、源码和 Git 文件均不可读取。
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: '不支持的请求方法' });
  const rel = url === '/' ? '/app.html' : url;
  const publicFiles = new Set(['/app.html', '/index.html', '/index-sidebar.html', '/skill-learning.js', '/account.html', '/account-session.js', '/model-settings.js', '/interview-policy.js', '/formal-interview.js']);
  if (!publicFiles.has(rel)) return sendJson(res, 404, { error: '页面不存在' });
  const abs = path.resolve(ROOT, '.' + rel);
  let real;
  try { real = fs.realpathSync(abs); } catch (e) { return sendJson(res, 404, { error: '页面不存在' }); }
  if (real !== path.join(fs.realpathSync(ROOT), rel)) return sendJson(res, 403, { error: '禁止访问该路径' });
  let data = await fs.promises.readFile(real);
  if(rel==='/app.html'&&!localMode)data=Buffer.from(data.toString().replace('</head>','<script>window.ZM_ACCOUNT='+JSON.stringify(account).replace(/</g,'\\u003c')+';</script><script src="/account-session.js"></script></head>'));
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(real)] || 'application/octet-stream',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(req.method === 'HEAD' ? undefined : data);
  } catch (e) {
    if (!res.headersSent && !res.destroyed) sendJson(res, e.status || 500, { error: e.status ? e.message : '服务处理失败' });
  }
});

ensureDirs();
if (!fs.existsSync(CONFIG_FILE)) writeConfig(DEFAULT_CONFIG);
if(process.env.HOST&&process.env.HOST!=='127.0.0.1'&&!process.env.PUBLIC_ORIGIN)throw Error('非 loopback 监听必须设置 PUBLIC_ORIGIN');
if(localMode&&process.env.HOST&&process.env.HOST!=='127.0.0.1')throw Error('本地兼容模式只能监听 loopback');
server.listen(PORT, process.env.HOST||'127.0.0.1', () => {
  console.log('职面 ZhiMian 服务已启动: http://127.0.0.1:' + PORT + '/app.html');
  console.log('配置文件: ' + CONFIG_FILE);
  console.log('数据目录: ' + DATA_DIR);
});
