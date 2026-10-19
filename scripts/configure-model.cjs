// 运维工具：把 server.config.json 的模型配置写入账号模式的内置连接（models.sqlite）。
// 用于管理员在本机配置/启用内置模型，避免依赖浏览器管理界面。
// 从 server.config.json 读取 Key（该文件已 gitignore）；本脚本不含任何密钥。
// 用法：node scripts/configure-model.cjs [preset]
const fs = require('node:fs');
const path = require('node:path');
const { createModelStore, BUILTIN } = require('../model-store');
const { createModelService } = require('../model-service');

const root = path.join(__dirname, '..');
const configFile = path.join(root, 'server.config.json');
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
if (!config.apiKey) { console.error('server.config.json 未配置 API Key'); process.exit(1); }

const store = createModelStore(path.join(root, 'data'), config);
const service = createModelService(path.join(root, 'data'), config);
const target = store.list(BUILTIN).find(p => p.preset === (process.argv[2] || 'deepseek'));
if (!target) { console.error('未找到预设：' + (process.argv[2] || 'deepseek')); process.exit(1); }

(async () => {
  console.log('配置内置连接：', target.name, '| model =', target.model, '| id =', target.id);
  const saved = store.save(BUILTIN, { apiKey: config.apiKey, enabled: true }, target.id);
  console.log('已保存并启用：', saved.name, '| enabled =', saved.enabled, '| hasKey =', saved.hasKey);

  console.log('\n测试连接（GET /models）……');
  try {
    const t = await service.test(BUILTIN, target.id, 'admin');
    console.log('连接测试：', t.ok ? '✓ 通过 · ' + t.elapsedMs + 'ms' : '失败', t.message || '');
  } catch (e) { console.log('连接测试失败：', e.message); }

  console.log('\n验证 AI 输出（JSON 生成）……');
  try {
    const v = await service.verify(BUILTIN, target.id, 'admin');
    console.log('输出验证：', v.ok ? '✓ 通过 · model = ' + v.model : '失败', v.message || '');
  } catch (e) { console.log('输出验证失败：', e.message); }

  service.close();
})();
