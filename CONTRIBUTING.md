# 参与贡献 · Contributing

欢迎给「简历市场」提 PR：新模板、导出格式、面板体验、市场服务、agent 工具都欢迎。
本仓库是 DSH（DeepSeek Harness）插件，Host 侧是零依赖 ESM，客户端是「零构建依赖」的
React 拼接产物（`lib/client.js` 由 `build/build.mjs` 生成）。

## 环境要求

- Node.js **>= 20**（`package.json` 的 `engines` 规定；CI / 本地都用 Node 22 验证）
- npm（只有测试专用依赖需要安装）
- Git；Windows / macOS / Linux 均可，Windows 下用 Git Bash 或 PowerShell 都行

## 本地开发

```bash
git clone https://github.com/skylight54/-dsh-resume-market.git
cd dsh-resume-market

# 1) 构建客户端产物（改过 src/client/*.js 或 src/shared/doc.js 后必须重跑）
node build/build.mjs

# 2) 包形状检查：exports / dsh.bundle / dsh.client / locale / icon / cordis.patch.yml / 客户端产物
node tools/check.mjs

# 3) Host 侧冒烟测试：路由 / 导出 / 市场 / 工具 / 安全围栏（不占端口、不写真实数据）
node tests/smoke.mjs

# 4) 客户端 PDF 生成器测试：xref / A4 页面 / 图片流
node tests/pdf.mjs
```

`tests/render.mjs` 与 `tests/mount.mjs` 需要测试专用依赖（react / react-dom / jsdom）。
它们只装在 `.devrender/`，**不进插件包**，所以先装一次：

```bash
cd .devrender && npm install
cd ..

node tests/render.mjs   # 客户端 bundle 渲染测试：侧栏图标 + 面板首屏
node tests/mount.mjs    # jsdom 挂载测试：编辑 / 预览 / 模板库 / 市场 / 设置 / 发布弹窗
```

市场服务（`server/`）自测：

```bash
node server/smoke.mjs   # 随机端口 + 临时数据库，跑完自动清理
```

一次跑完整套（提交 PR 前建议全绿）：

```bash
node build/build.mjs \
  && node tools/check.mjs \
  && node tests/smoke.mjs \
  && node tests/pdf.mjs \
  && node tests/render.mjs \
  && node tests/mount.mjs \
  && node server/smoke.mjs
```

> 注意：`lib/client.js` 是**提交进仓库的构建产物**（`package.json` 的 `files` 会带上它）。
> 改了 `src/client/` 或 `src/shared/doc.js` 之后，请重跑 `node build/build.mjs` 并把
> `lib/client.js`、`lib/client.meta.json` 一起提交，否则插件装上去还是旧代码。

## 目录速览

```
src/
  index.js          Host 入口：注册 HTTP 路由 + agent 工具
  routes.js         /resume-market/api/*
  store.js          本地 JSON 数据层（~/.dsh/resume-market/store.json）
  seed.js           内置市场条目（「大肥鱼」等）
  tools.js          resume_* agent 工具
  shared/doc.js     文档渲染层（Host / Client 共用：模板 CSS + HTML 渲染）
  client/           面板（React，按 file 顺序拼接进 lib/client.js）
server/             独立零依赖模板市场服务（可选自建）
lib/client.js       构建产物（勿手改）
previews/           node tools/previews.mjs 生成的模板预览（HTML）
.devrender/         仅测试用依赖（jsdom / react），不进包
```

## 模板开发约定（重要）

1. 模板 CSS 的**根选择器必须是 `.rm-t-<名字>`**，例如：

   ```css
   .rm-t-business { padding: 54px 60px; font-family: ...; }
   .rm-t-business h1 { ... }
   ```

   插件会把这个 class 加到 A4 纸面容器上。根选择器与 `cls` 对不上，纸面就只剩基础排版
   （一张白纸），这是最常见的「模板不生效」原因。

2. 发布到市场时**建议显式带 `cls` 字段**（如 `cls: 'rm-t-business'`）；缺省时插件会从 CSS 里
   推断第一个 `.rm-t-*` 选择器，但显式写更稳：

   ```js
   { id: 'my-template', name: '我的模板', cls: 'rm-t-my', css: '.rm-t-my{...}', ... }
   ```

3. 改完模板跑一次 `node tools/previews.mjs`，用浏览器打开 `previews/index.html` 肉眼检查 9 套
   模板的 A4 排版；提交模板改动时附一张截图会更方便 review。

## 数据与隐私

- **不要提交**用户数据：`~/.dsh/resume-market/store.json`（可用 `RESUME_MARKET_FILE` 覆盖）、
  `server/market-data.json`、`server/market-data.json.*` 及其临时文件。
- 插件本体保持**零运行时依赖**：不要往 `package.json` 的 `dependencies` 里加包；
  测试依赖只装在 `.devrender/`。
- 涉及 AI 调用时不要把 API Key 写进代码、测试或 issue；Key 只存在本地设置里。

## 提交 PR

- 一个 PR 只做一件事（修 bug 或加功能或加模板），描述里写清楚动机与影响范围。
- **必须附命令输出结论**：把 `node tools/check.mjs` 和相关测试的实际输出摘要贴进 PR 模板
  （不要只写「已测试」）。
- 行为变化（新功能 / 修复 / 破坏性改动）请同步更新 `CHANGELOG.md`。
- UI / 模板改动附截图（可以是 `previews/` 里的页面截图）。
- commit message 建议 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：
  `feat: ...` / `fix: ...` / `docs: ...` / `test: ...` / `chore: ...`。
- 不要提交 `node_modules/`、`.devrender/node_modules/`、`.devrender/.npmcache/`、`*.log`、
  临时文件（`.gitignore` 已覆盖）。

## 报告问题

用仓库的 Issue 模板（`.github/ISSUE_TEMPLATE/`）：
[Bug 报告](.github/ISSUE_TEMPLATE/bug_report.yml) / [功能建议](.github/ISSUE_TEMPLATE/feature_request.yml)。
请附 DSH 版本、操作系统、Node 版本、复现步骤，以及控制台报错文本。

## 许可证

提交即表示你同意以仓库的 [MIT 许可证](LICENSE) 发布你的贡献。
