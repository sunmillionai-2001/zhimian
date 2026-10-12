# 职面 ZhiMian · 求职工作台

面向所有求职者的一站式求职工作台。单文件前端 + 可选本地服务。

🔗 远程仓库：https://github.com/sunmillionai-2001/zhimian

---

## 快速开始

### 方式一：直接打开（最简，功能全可用）

双击 `app.html`，或用浏览器打开它即可。**零依赖、可离线**（字体联网加载，断网回退系统字体）。

### 方式二：启动本地服务（推荐，为 AI 与数据持久化准备）

```bash
node server.js
```

然后打开：**http://127.0.0.1:8123/app.html**

- 端口可用环境变量覆盖：`PORT=9000 node server.js`
- 服务提供：静态托管 + 大模型代理（`/api/chat`）+ 本地数据存储（`/api/store`）

---

## 目录结构

```
zhimian/
├── app.html            # 主应用（单文件，含全部模块，是核心交付物）
├── server.js           # 本地服务（静态托管 + 大模型代理 + 数据存储）
├── PLAN.md             # 产品规划与阶段进度
├── README.md           # 本文件
├── index.html          # 早期版本（卡片版，保留备查）
├── index-sidebar.html  # 早期版本（侧栏版，保留备查）
├── server.config.json  # 大模型配置（含 Key，已 gitignore，不会提交）
└── data/               # 本地数据（已 gitignore）
```

---

## 六大模块现状

| 模块 | 状态 |
|---|---|
| 工作台总览 | ✅ 模块入口 + 状态卡 |
| **面试方法论** | ✅ **38 篇**，覆盖 9 个岗位方向（通用/销售/售前/产品经理/后端研发/项目经理/前端/数据分析/运营）；双维度筛选（岗位 + 类型）、搜索、详情、收藏、STAR 练习器 |
| 岗位 → 技能地图 | ✅ 6 个岗位技能图谱（技能点/怎么学/去哪学/达标），进度标记 + 本地保存 |
| 模拟面试 | ✅ 贴 JD → 关键词解析 → 结构化组题 → 逐题作答计时 → 报告 + 答题要点 |
| 面试复盘 | ✅ 记录/删除、通过率统计、薄弱点频次分析、补强建议 |
| 招聘信息 | ✅ 岗位池：贴 JD 存卡片 → 筛选 → 一键跳模拟面试 / 技能地图 |

所有数据存浏览器 `localStorage`（服务启动后可通过 `/api/store` 落盘）。

---

## 接入大模型（AI 能力，待完成）

服务端已就绪，前端尚未接线。配置方式二选一：

**方式 A：编辑 `server.config.json`**

```json
{
  "baseUrl": "https://api.deepseek.com/v1",
  "model": "deepseek-chat",
  "apiKey": "你的 Key"
}
```

**方式 B：调接口写入**

```bash
curl -X POST http://127.0.0.1:8123/api/config \
  -H "Content-Type: application/json" \
  -d "{\"apiKey\":\"你的 Key\"}"
```

支持的接口：任何 **OpenAI 兼容** 的 `/chat/completions`（DeepSeek、Moonshot、OpenAI、SiliconFlow 等）。

> ⚠️ `server.config.json` 已在 `.gitignore` 中，**不会被提交**。切勿把 Key 写进 `app.html` 或任何会入库的文件。

**计划中的 AI 功能**：模拟面试实时追问 + 逐题点评打分；任意岗位 AI 生成技能地图。

---

## 开发约定

- 前端是**单文件** `app.html`（内联 CSS/JS），改动集中在其中。
- 新增方法论条目：在 `app.html` 的 `const METHOD = { list: [...] }` 中追加对象：
  ```js
  { id:'唯一id', role:'销售', type:'专业面', tag:'SPIN', title:'…',
    summary:'…', steps:[['1','…'],['2','…']], lead:'…', detail:'…',
    example:'…', pitfalls:['…','…','…'], usage:'…', source:'出处（可选）' }
  ```
  早期条目若缺 `role`/`type`，代码会自动补默认值。
- 改动后建议检查 JS 语法：
  ```bash
  node --check <(提取出的 script 片段)
  ```

---

## 进度

见 [PLAN.md](./PLAN.md)。已完成：设计定稿 → 六大模块功能实现 → 面试方法论内容扩充。
待办：前端接入 AI（模拟面试智能追问与点评）、账号与云端同步、真实招聘数据源（需评估合规）。
