// 职面 ZhiMian · 本地服务（静态托管 + 大模型代理 + 本地数据存储）
// 可移植：所有路径基于本文件所在目录，换设备/换目录都能跑。
// 用法：node server.js   然后浏览器打开 http://127.0.0.1:8123/app.html
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createReviewStore } = require('./review-store');
const { runAi } = require('./ai-service');

const ROOT = __dirname;                              // 本目录即站点根，含 app.html
const CONFIG_FILE = path.join(ROOT, 'server.config.json');   // 大模型配置（已在 .gitignore）
const DATA_DIR = path.join(ROOT, 'data');                    // 本地数据（已在 .gitignore）
const PORT = Number(process.env.PORT || 8123);
const reviewStore = createReviewStore(DATA_DIR);

const DEFAULT_CONFIG = {
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
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

const server = http.createServer(async (req, res) => {
  try {
  let url;
  try { url = decodeURIComponent((req.url || '/').split('?')[0]); }
  catch (e) { return sendJson(res, 400, { error: '非法 URL 编码' }); }
  if (url.includes('\\') || url.includes('\0') || url.split('/').some(p => p === '.' || p === '..')) {
    return sendJson(res, 403, { error: '禁止访问该路径' });
  }
  if (['POST','DELETE'].includes(req.method) && req.headers.origin && req.headers.origin !== 'http://' + req.headers.host) {
    return sendJson(res, 403, { error: '只允许同源请求' });
  }

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

  if (url.startsWith('/api/ai/') && req.method === 'POST') {
    return sendJson(res, 200, await runAi(url.slice('/api/ai/'.length), await readBody(req), readConfig()));
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
      fs.readdirSync(DATA_DIR).filter(f => f.startsWith('store-') && f.endsWith('.json')).forEach(f => {
        try { out[f.slice(6, -5)] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch (e) {}
      });
    } catch (e) {}
    return sendJson(res, 200, out);
  }
  if (url === '/api/store' && req.method === 'POST') {
    ensureDirs();
    const body = await readBody(req);
    if (!body || typeof body.key !== 'string') return sendJson(res, 400, { error: 'missing key' });
    try {
      fs.writeFileSync(path.join(DATA_DIR, storeFileName(body.key)), JSON.stringify(body.value), 'utf8');
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // 只发布明确允许的页面，配置、数据、源码和 Git 文件均不可读取。
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: '不支持的请求方法' });
  const rel = url === '/' ? '/app.html' : url;
  const publicFiles = new Set(['/app.html', '/index.html', '/index-sidebar.html']);
  if (!publicFiles.has(rel)) return sendJson(res, 404, { error: '页面不存在' });
  const abs = path.resolve(ROOT, '.' + rel);
  let real;
  try { real = fs.realpathSync(abs); } catch (e) { return sendJson(res, 404, { error: '页面不存在' }); }
  if (real !== path.join(fs.realpathSync(ROOT), rel)) return sendJson(res, 403, { error: '禁止访问该路径' });
  const data = await fs.promises.readFile(real);
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(real)] || 'application/octet-stream',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(req.method === 'HEAD' ? undefined : data);
  } catch (e) {
    if (!res.headersSent && !res.destroyed) sendJson(res, e.status || 500, { error: e.status ? e.message : '服务处理失败' });
  }
});

ensureDirs();
if (!fs.existsSync(CONFIG_FILE)) writeConfig(DEFAULT_CONFIG);
server.listen(PORT, '127.0.0.1', () => {
  console.log('职面 ZhiMian 服务已启动: http://127.0.0.1:' + PORT + '/app.html');
  console.log('配置文件: ' + CONFIG_FILE);
  console.log('数据目录: ' + DATA_DIR);
});
