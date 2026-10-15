# REA 取证与复核说明

配套报告：[模拟面试二次拆解](../../mock-interview-rea-2026-10-15.md)。日期：2026-10-15。

## 保存了什么

`evidence.json` 是筛选后的研究清单，包含 11 条 REA 操作记录、3 个公开脚本的 SHA-256，以及 27 个有定位的锚点。每条 REA 记录保留原始 Evidence ID、原始文件摘要和限制。

这不是可直接导入 REA 的完整 Evidence 包。完整第三方脚本和大型原始结果仅用于临时本地分析，不放入本项目仓库。锚点只保留与结论有关的短标识；没有账号、凭据、用户材料、请求体或授权头。

坐标采用 1 起始行号、0 起始 UTF-16 列号和偏移，适用于 JavaScript 字符串定位。`literal` 是定位用途，不是将竞品代码用于职面实现。

## 快速复核公开脚本

在项目根目录运行，Node 22+、系统 `curl` 即可：

```bash
node research/rea/2026-10-15/verify-public-evidence.mjs
node research/rea/2026-10-15/verify-public-evidence.mjs --live
```

第一条只验证清单元数据。第二条重新读取三个固定来源的公开脚本，检查文件摘要、字节数、锚点及坐标；不执行下载代码，不探测业务 API，也不写入文件。文件改变或不可达时明确报出，不能把新版本视作旧版本相同证据。

本次 `--live` 的三个文件摘要、字节数和全部 27 个锚点通过。它证明公开脚本与采集版本一致，不证明登录后功能成功、模型质量或后端设计。

## 用 REA 重新取证

本轮通过 `npx --yes --ignore-scripts --omit=optional rea-agents@6.5.0 --help` 取得并实际运行 CLI。`--omit=optional` 未安装本轮不需要的 Frida；没有运行 `setup`，也没有写入 Codex MCP 配置。若以后将 REA 配为持久工具，应另按官方 setup 流程处理。

Node 需要符合 REA 的版本范围。本次为 `24.12.0`；Chrome 路径适用于本机，其他机器须调整。

先在独立 Chrome 进程与临时 profile 打开公开页面，避免附着日常浏览器：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9331 \
  --user-data-dir=/tmp/zhimian-rea-recheck \
  https://appv2.huru.ai/
```

然后执行；`TARGET_ID` 必须使用本轮 discovery 返回值，不能复制旧会话的 ID：

```bash
NO_PROXY=127.0.0.1,localhost npx --yes rea-agents@6.5.0 \
  list-browser-targets http://127.0.0.1:9331 --json

NO_PROXY=127.0.0.1,localhost npx --yes rea-agents@6.5.0 \
  inspect-web-page http://127.0.0.1:9331 TARGET_ID \
  --include-accessibility-text --include-script-sources --json > /tmp/rea-page.json

NO_PROXY=127.0.0.1,localhost npx --yes rea-agents@6.5.0 \
  analyze-web-bundle http://127.0.0.1:9331 TARGET_ID --json > /tmp/rea-bundle.json

npx --yes rea-agents@6.5.0 export-web-scripts \
  /tmp/rea-page.json /tmp/rea-recheck-export --json

npx --yes rea-agents@6.5.0 analyze-javascript-application \
  /tmp/rea-recheck-export/files --analysis-timeout-ms 60000 --max-heap-mb 1024 \
  --json > /tmp/rea-application.json
```

导出目录必须原本不存在。默认同源范围会排除第三方脚本；这不是“网页没有调用第三方”。静态图也可能部分截断，要保留 REA 给出的覆盖说明。页面结构与脚本会更新，不保证旧坐标永久有效。

## 本轮两个浏览器场景

```bash
npx --yes rea-agents@6.5.0 capture-browser-scenario \
  research/rea/2026-10-15/huru-auth-scenario.json --json

npx --yes rea-agents@6.5.0 capture-browser-scenario \
  research/rea/2026-10-15/huru-tabs-scenario.json --json
```

第一个直接访问受保护的准备页，实际落在登录页。第二个在官网点击岗位导入说明。两者动作完成，最终 DOM / accessibility / URL 已捕获；网络事件整体标记 incomplete，不用于证明全量网络行为。官网按钮不是已完成的真实岗位导入。

Yoodli 初次 headless 兼容提示与标准 Chrome UA 登录页属于两个不同观察条件，不能把初次提示当作该产品普遍不可用。没有创建账号、发登录邮件或开始付费会话。

复核结束应关闭专用浏览器并删除本轮临时 profile 和大型原始脚本 / 分析文件。不要关闭用户日常浏览器或职面本地服务。
