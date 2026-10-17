// 简历导出功能测试（单元测试：直接验证生成函数，避开账号认证）
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateWordResume, generatePdfResume } = require('../resume-export');

const sampleResume = `张三
手机：138****1234 | 邮箱：zhangsan@example.com

个人信息
5 年前端开发经验，熟悉 React/Vue 技术栈

工作经历
2020.01 - 至今 · ABC 科技有限公司 · 高级前端工程师
- 负责公司核心产品的前端架构设计与开发
- 优化首屏加载速度，从 3.2s 降至 1.1s
- 带领 5 人前端团队完成重构项目

教育背景
2015.09 - 2019.06 · 某某大学 · 计算机科学与技术 · 本科

专业技能
- 前端框架：React、Vue、Angular
- 工程化：Webpack、Vite、Rollup
- 语言：JavaScript、TypeScript、HTML/CSS`;

test('Word 导出 - 生成有效 docx 文件', async () => {
  const buffer = await generateWordResume(sampleResume, { title: '个人简历' });

  assert.ok(Buffer.isBuffer(buffer), '应返回 Buffer');
  assert.ok(buffer.length > 1000, 'Word 文件应有实质内容');
  // docx 是 ZIP 格式，以 PK 开头
  assert.equal(buffer[0], 0x50, '应为 ZIP 格式 (P)');
  assert.equal(buffer[1], 0x4B, '应为 ZIP 格式 (K)');
});

test('PDF 导出 - 生成含中文的有效 PDF', async () => {
  const buffer = await generatePdfResume(sampleResume, { title: '个人简历' });

  assert.ok(Buffer.isBuffer(buffer), '应返回 Buffer');
  assert.ok(buffer.length > 500, 'PDF 文件应有实质内容');
  // PDF 以 %PDF- 开头
  assert.equal(buffer.slice(0, 5).toString(), '%PDF-', 'PDF 文件头应为 %PDF-');
});

test('Word 导出 - 空文本返回空段落文档', async () => {
  const buffer = await generateWordResume('   \n  \n  ', { title: '个人简历' });
  assert.ok(buffer.length > 500, '空文本也应生成有效文档框架');
});

test('PDF 导出 - 空文本仍生成有效 PDF', async () => {
  const buffer = await generatePdfResume('', { title: '个人简历' });
  assert.equal(buffer.slice(0, 5).toString(), '%PDF-', '空文本应生成有效 PDF');
});

test('Word 导出 - 特殊字符不崩溃', async () => {
  const specialText = '测试简历\n包含特殊字符："引号" & <尖括号>\nemoji 😀 🎉\n换行测试';
  const buffer = await generateWordResume(specialText);
  assert.ok(buffer.length > 1000, '特殊字符应能正常生成');
});

test('PDF 导出 - 长文本自动分页', async () => {
  const longText = Array.from({ length: 200 }, (_, i) => `第 ${i + 1} 段：这是一段用于测试分页的中文内容，包含工作经历、项目经验和技能描述。`).join('\n');
  const buffer = await generatePdfResume(longText, { title: '个人简历' });
  assert.equal(buffer.slice(0, 5).toString(), '%PDF-', '长文本应能正常生成');
  assert.ok(buffer.length > 1000, '长文本生成的文件应包含多页内容');
});

test('PDF 导出 - 章节标题识别（工作经历等）', async () => {
  const text = '张三\n工作经历\n2020 年至今在某公司\n教育背景\n某大学';
  const buffer = await generatePdfResume(text);
  assert.equal(buffer.slice(0, 5).toString(), '%PDF-', '含章节标题应正常生成');
});
