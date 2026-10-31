# 简历市场 · DSH 插件

免费简历模板市场：6 套好看的简历模板、按字段分栏的个人信息编辑、A4 实时预览、一键导出 HTML / Word / PDF；
做好的简历可以直接**发布到市场**，分享给其他装了这个插件的用户。

> 起因：模型直接生成的简历「个人信息全坨在一起」。这个插件把个人信息拆成 8 个独立字段
> （姓名 / 岗位 / 电话 / 邮箱 / 城市 / 微信 / GitHub / 主页），在简历上以两列网格呈现，
> 每个字段一个小标签 + 值，不会再糊成一段文字。

## 功能

- **左侧栏入口**：DSH 侧栏出现「简历市场」图标，点开就是完整面板。
- **模板库**：6 套内置（商务极简 / 静奢蓝灰 / 清新创意 / 紧凑单栏 / 时间轴 / 科技网格），
  可重命名后使用；模板缩略图为真实 A4 渲染，不是示意图。
- **结构化编辑器**：基本信息 8 字段两列网格；工作经历 / 项目 / 教育 / 技能 / 奖项均为
  可排序、可增删的条目列表，自动保存（900ms 防抖）。
- **可选照片**：基本信息里可上传照片（自动裁到最长边 480px 的 JPEG），位置可选左侧 / 右侧，
  形状可选圆形 / 方形；预览与 HTML / Word / PDF 导出都会保留。
- **模块顺序可调**：工作经历 / 项目经历 / 教育背景 / 专业技能 / 荣誉奖项可以上下移动（如把
  「教育背景」挪到「项目经历」前面），编辑器、预览与导出使用同一顺序。
- **A4 实时预览**：右侧按 794×1123 等比缩放预览。
- **三格式导出**：工具栏「导出 ▾」可选 HTML / Word(.doc) / PDF。三种都由 Host 直接写文件到
  `~/.dsh/resume-market/exports/`，导出对话框给出完整路径 + 「打开所在文件夹」。PDF 由面板在本机
  渲染成 A4 单页（不需要打印对话框，也不依赖系统装 Chrome/LibreOffice；浏览器渲染失败时才退回打印视图）。
- **我的简历 / 回收站 / 历史版本**：「我的简历」标签页可切换、重命名、复制、删除；删除进回收站可恢复；
  每次编辑超过 3 分钟自动留一个历史快照，随时可以「恢复到这里」找回旧内容。
- **AI 对话填写**：「AI 对话」标签页里用自然语言描述自己，插件把对话发给 DeepSeek；
  回复里出现结构化 JSON 时可以一键「应用到当前简历」（没有简历会自动新建一份）。
  需要先在「设置」页填自己的 DeepSeek API Key。
- **模板市场**：把简历版式发布到本地市场（可勾选是否携带自己的内容），其他用户「安装」后可直接用；
  支持点赞、下架、自建远端市场服务器同步。
- **AI 协作**：给「大肥鱼」提供 6 个工具，直接用结构化数据生成/修改/导出/发布简历。

> 文档：[安装说明](docs/INSTALL.md) · [发布步骤](docs/RELEASE.md) · [贡献指南](CONTRIBUTING.md) ·
> [更新日志](CHANGELOG.md) · [MIT License](LICENSE)

## 安装

插件目录就是本仓库根目录，直接在 DSH 里安装：

```
plugin_manager install_bundle  target = <本目录绝对路径>
```

或用 CLI：

```
dsh plugin add file:<本目录绝对路径>
```

安装后重启 / 刷新 DSH Web 页面，侧栏会出现「简历市场」。

## 给 AI（大肥鱼）的工具

| 工具 | 作用 |
| --- | --- |
| `resume_market_list` | 列出模板 / 市场条目 / 我的简历 |
| `resume_save` | 新建或更新简历，个人信息必须按 8 个字段分别填 |
| `resume_export` | 导出 A4 文件到 `~/.dsh/resume-market/exports/`，`format` 可选 html / doc / pdf |
| `resume_publish` | 把简历版式发布到市场（默认不携带真实内容） |
| `resume_import_template` | 导入外部模板 JSON（对象或文件路径） |
| `resume_list_templates` | 精简模板清单（id｜名称｜来源｜卖点） |

## AI 对话填写（DeepSeek）

「AI 对话」标签页把聊天消息发给 DeepSeek，信息足够时模型会输出一个结构化 JSON 块，
插件解析后出现「应用到当前简历」按钮，点一下就会 merge 进当前简历并保存。

- 设置页需要填自己的 **DeepSeek API Key**（`sk-...`，只存在本机 `store.json`，不随简历/模板上传）。
- 可改 **模型**（默认 `deepseek-chat`）与 **Base URL**（默认 `https://api.deepseek.com`，
  也能指向自建网关 / 代理）。
- 单次最多 40 条消息、单条 ≤8000 字，请求 60 秒超时；只有「聊天消息 + 当前简历（精简后）」
  会发给 DeepSeek，不发送模板与市场数据。
- 常见错误：`chat/no-key` → 去设置页填 Key；401 → Key 无效或额度不足；其它上游错误会给出简短原因。

## 数据与隐私

- 本地数据只有一份 JSON：`~/.dsh/resume-market/store.json`（可用 `RESUME_MARKET_FILE` 覆盖），
  原子写入，备份 / 迁移直接拷文件即可。
- 发布到市场默认**只分享版式**，样张使用示例候选人；只有发布弹窗里勾选「附带我的简历内容」才分享真实数据。
- HTTP API 只监听本机，带 loopback + Host/Origin 围栏，跨站请求一律 403。

## 自建模板市场（可选，零依赖）

`server/` 是一个独立的零依赖 Node 服务，提供公开的模板市场 API 和画廊页面：

```
node server/market-server.js            # 默认 http://127.0.0.1:8787
PORT=9000 RM_DB=./my-market.json node server/market-server.js
RM_TOKEN=secret node server/market-server.js   # 开启发布/删除鉴权
```

画廊：`http://127.0.0.1:8787/`；API 文档见 `server/README.md`。
插件「设置」页填写市场地址（如 `http://127.0.0.1:8787`）即可浏览远端条目、下载安装、点赞、发布，
需要鉴权时再填 Token。

## 开发

```
node build/build.mjs     # 把 src/client/*.js + src/shared/doc.js 拼成 lib/client.js
node tools/check.mjs     # 包形状检查（exports / dsh.bundle / dsh.client / locale / icon / patch）
node tests/smoke.mjs     # Host 侧冒烟测试（路由 / 导出 / 市场 / 工具 / 安全围栏）
node tests/render.mjs    # 客户端 bundle 渲染测试（侧栏图标 + 面板首屏）
node tests/pdf.mjs       # 客户端 PDF 生成器测试（xref / A4 页面 / 图片流）
node tests/mount.mjs     # jsdom 挂载测试（真实数据流：编辑 / 预览 / 模板库 / 市场 / 设置 / 发布弹窗）
node tools/previews.mjs  # 生成 9 套模板的静态预览 → previews/index.html
node server/smoke.mjs    # 市场服务 43 项测试
```

模板作者注意：模板 CSS 必须用 `.rm-t-<名字>` 作为根选择器（例如
`.rm-t-business{padding:54px 60px}`），插件会把这个 class 加到 A4 纸面容器上；
发布市场时最好同时带 `cls: 'rm-t-xxx'`，没有时会自动从 CSS 里推断第一个
`.rm-t-*` 选择器。根选择器和 CSS 对不上，纸面就只剩基础排版（一张白纸）。

`tests/render.mjs` 与 `tests/mount.mjs` 需要测试专用依赖（react / react-dom / jsdom），
它们只装在 `.devrender/`，不会进入插件包：

```
cd .devrender && npm install
```

目录：

```
src/
  index.js            Host 入口：注册 HTTP 路由 + agent 工具
  routes.js           /resume-market/api/*
  store.js            本地 JSON 数据层
  seed.js             「大肥鱼」内置市场条目
  tools.js            resume_* 工具
  shared/doc.js       文档渲染层（Host / Client 共用：模板 CSS + HTML 渲染）
  client/             面板（React，零构建依赖，拼接后由 __ModuleLoader__ 加载）
server/               独立市场服务（零依赖）
lib/client.js         构建产物
```
