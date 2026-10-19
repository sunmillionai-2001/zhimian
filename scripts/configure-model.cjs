// 用法：node scripts/configure-model.cjs [preset]
// 在隔离临时库验证配置，全部通过后才更新正式内置连接；不会输出 Key。
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createModelStore, BUILTIN } = require('../model-store');
const { createModelService } = require('../model-service');

async function configureModel({ root, preset = 'deepseek', serviceOptions = {}, log = console.log }) {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'server.config.json'), 'utf8'));
  if (typeof config.apiKey !== 'string' || !config.apiKey.trim()) throw Error('server.config.json 未配置 API Key');
  let store, service, temporary;
  try {
    // 不传 legacy 配置，避免建库时自动迁移并启用尚未验证的连接。
    store = createModelStore(path.join(root, 'data'));
    const target = store.list(BUILTIN).find(p => p.preset === preset);
    if (!target) throw Error('未找到预设：' + preset);
    const candidate = {
      name: target.name, preset: target.preset, priority: target.priority,
      baseUrl: config.baseUrl ?? target.baseUrl, model: config.model ?? target.model,
      apiKey: config.apiKey, enabled: false
    };
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'zhimian-model-check-'));
    service = createModelService(temporary, {}, serviceOptions);
    const staged = await service.save(BUILTIN, candidate);
    log('正在验证内置连接：' + target.name);
    const connection = await service.test(BUILTIN, staged.id, 'admin');
    if (connection.ok !== true) throw Error('连接测试未通过');
    log('连接测试通过：' + connection.elapsedMs + 'ms');
    const output = await service.verify(BUILTIN, staged.id, 'admin');
    if (output.ok !== true) throw Error('JSON 输出验证未通过');
    log('JSON 输出验证通过 · model = ' + output.model);

    store.save(BUILTIN, { ...candidate, enabled: true }, target.id);
    store.markChecked(BUILTIN, target.id);
    store.markTested(BUILTIN, target.id);
    log('已保存并启用：' + target.name);
    return store.list(BUILTIN).find(p => p.id === target.id);
  } finally {
    try { service?.close(); } finally {
      try { store?.close(); } finally {
        if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
      }
    }
  }
}

if (require.main === module) {
  configureModel({ root: path.join(__dirname, '..'), preset: process.argv[2] || 'deepseek' })
    .catch(error => {
      console.error('配置失败，未启用本次配置：', error.message);
      process.exitCode = 1;
    });
}
module.exports = { configureModel };
