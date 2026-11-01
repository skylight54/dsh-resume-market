# 简历市场 · DSH 插件

免费简历模板市场：7 套好看的简历模板、按字段分栏的个人信息编辑、A4 实时预览、一键导出 HTML / Word / PDF；
做好的简历可以直接**发布到市场**，分享给其他装了这个插件的用户。

> 起因：模型直接生成的简历「个人信息全坨在一起」。这个插件把个人信息拆成 8 个独立字段
> （姓名 / 岗位 / 电话 / 邮箱 / 城市 / 微信 / GitHub / 主页），在简历上以两列网格呈现，
> 每个字段一个小标签 + 值，不会再糊成一段文字。

## 功能

- **左侧栏入口**：DSH 侧栏出现「简历市场」图标，点开就是完整面板。
- **模板库**：7 套内置（商务极简 / 静奢蓝灰 / 清新创意 / 紧凑单栏 / 时间轴 / 科技网格 / 青金分栏），
  可重命名后使用；模板缩略图为真实 A4 渲染，不是示意图。
- **在模板库里创作模板**：「模板库」里可以「+ 新建模板」或复制内置模板，在编辑器里调颜色、
  字号、行距、页边距、标题样式、页眉色带等元素格式，右侧 A4 实时预览；也可以「从图片生成」——
  选一张喜欢的简历截图，插件用 canvas 取色 + 版式启发式生成一版初稿，再手动微调。
  保存后可一键「发布」到本地市场（可选是否携带示例内容）或生成 GitHub 公共投稿。
- **结构化编辑器**：基本信息 8 字段两列网格；工作经历 / 项目 / 教育 / 技能 / 奖项均为
  可排序、可增删的条目列表，自动保存（900ms 防抖）；教育背景可选填「主修课程」，导出时单独
  一行跟在学历 / 专业下面（HTML / Word / PDF 都带上）。
- **可选照片**：基本信息里可上传照片（自动裁到最长边 480px 的 JPEG），位置可选左侧 / 右侧，
  形状可选圆形 / 方形；预览与 HTML / Word / PDF 导出都会保留。
- **模块顺序与显隐**：每行一个紧凑小按钮（↑ / ↓）调整顺序，也可以直接拖动右侧把手
  （HTML5 拖拽，悬停行会显示插入位置）；点眼睛按钮可以隐藏 / 显示整节，隐藏的模块变灰但
  仍留在列表里。顺序与显隐实时驱动预览和导出（如把「教育背景」挪到「项目经历」前面）。
- **A4 实时预览**：右侧按 794×1123 等比缩放预览。
- **三格式导出**：工具栏「导出 ▾」可选 HTML / Word(.doc) / PDF。三种都由 Host 直接写文件到
  `~/.dsh/resume-market/exports/`，导出对话框给出完整路径 + 「打开所在文件夹」。PDF 由面板在本机
  渲染成 A4 单页（不需要打印对话框，也不依赖系统装 Chrome/LibreOffice；浏览器渲染失败时才退回打印视图）。
- **我的简历 / 回收站 / 历史版本**：「我的简历」标签页可切换、重命名、复制、删除；删除进回收站可恢复；
  每次编辑超过 3 分钟自动留一个历史快照，随时可以「恢复到这里」找回旧内容。
- **AI 对话填写（浮动窗）**：编辑界面右下角有「● AI 对话」胶囊按钮，点开是浮动对话面板，
  用自然语言描述自己即可；回复里出现结构化 JSON 时可以一键「应用到当前简历」（没有简历会自动新建）。
  **默认不用填 Key**：直接用你当前在 DSH 里使用的模型；想独立计费/换模型再填自己的 DeepSeek API Key。
- **模板市场**：发布的是「模板」本身——在「模板库」里做好模板 → 点「发布」发到本地市场
  （可勾选是否带示例内容），其他用户「安装」后即可用；支持点赞、下架、自建远端市场服务器同步。
- **公共市场（GitHub）**：市场页可在「本地面板」和「公共市场 · GitHub」之间切换。公共市场直接读
  本仓库 `market/index.json`，不需要服务器和账号；安装时只拉那一套模板的 JSON，10 分钟内走本地缓存，
  GitHub 不可达时退回上次缓存。发布弹窗勾选「同时生成 GitHub 公共投稿」会生成规范 JSON + Issue /
  新建文件链接，提交 PR 合并进 `market/` 即对所有用户上架。
- **AI 协作**：给「大肥鱼」提供 9 个工具，直接用结构化数据生成/修改/导出/发布简历，浏览与安装公共市场模板。

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

## AI 对话填写（默认免 Key）

编辑界面右下角常驻「● AI 对话」胶囊按钮，点开就是浮动对话面板（可折叠 / 可关闭，切标签页不丢对话）。
用自然语言描述自己，信息足够时模型会输出一个结构化 JSON 块，插件解析后出现「应用到当前简历」按钮，
点一下就会 merge 进当前简历并保存。面板头部可以清空对话。

- **默认不用填 Key**：`chatApiKey` 为空时，插件直接调用 DSH Host 的 `llm` 服务，用你当前
  在 DSH 里选的模型聊（不额外配置、不单独计费）。Host 没配置默认模型时才会报 `chat/no-key`。
- 想独立计费 / 指定模型 / 走自建网关：在设置页填 **DeepSeek API Key**（`sk-...`，只存在本机
  `store.json`，不随简历/模板上传），并可选 **模型**（默认 `deepseek-chat`）与 **Base URL**
  （默认 `https://api.deepseek.com`）。填了 Key 后才走 DeepSeek HTTP 路径。
- 免 Key 模式单轮最多 120 秒超时；API 模式单次最多 40 条消息、单条 ≤8000 字、60 秒超时。
  只发送「聊天消息 + 当前简历（精简后）」，不发送模板与市场数据。
- 常见错误：`chat/no-key` → 填 Key，或确认 DSH 已配置默认模型；401 → Key 无效或额度不足；
  其它上游错误会给出简短原因。

## 数据与隐私

- 本地数据只有一份 JSON：`~/.dsh/resume-market/store.json`（可用 `RESUME_MARKET_FILE` 覆盖），
  原子写入，备份 / 迁移直接拷文件即可。
- 发布到市场默认**只分享版式**，样张使用示例候选人；只有发布弹窗里勾选「附带我的简历内容」才分享真实数据。
- HTTP API 只监听本机，带 loopback + Host/Origin 围栏，跨站请求一律 403。

## 在模板库创作模板

「模板库」页底部按钮：

```
+ 新建模板     从空白开始，默认继承当前主题色和标准版式
复制为新模板   在任一内置模板上点「复制」——保留它的 CSS 根类名和版式，再微调
从图片生成     选一张简历截图，自动取色 + 识别版式并生成初稿（不依赖视觉模型，纯本地 canvas）
```

编辑器里能改的「元素格式」：强调色 / 姓名色 / 区块标题色 / 正文色 / 纸张底色 / 页眉色带 / 金色辅助色、
姓名字号 / 标题字号 / 正文字号 / 行距 / 左右与上下页边距 / 区块间距、字体（sans / serif / mono）、
页眉对齐、联系信息列数。

### 从图片生成能识别什么

识别只看像素，不联网、不上传，纯本地 canvas：

| 维度 | 可选值 | 说明 |
| --- | --- | --- |
| 布局 layout | single / sidebar | sidebar = 左侧整列深色信息栏（照片、联系方式在左栏） |
| 页眉 headerStyle | plain / band / split / ribbon | 纯文字 / 整宽色带 / 姓名与联系方式左右分栏 / 左上角斜角标签 |
| 标题 headingStyle | rule / bar / underline / plain / banner / tab / pill / icon / leftbar | 细线 / 竖条 / 粗下划线 / 无装饰 / 斜切色带 / 斜角标签块 / 圆角胶囊 / 圆形图标位 / 左侧竖条 |
| 内容块 contentStyle | plain / card | 无边框 / 每节独立细边框卡片 |
| 颜色 | accent / nameColor / headingColor / bodyColor / background / bandColor / gold | 从图中取主色、深色、底色、暖色（金色） |
| 字体倾向 | sans / serif / mono | 依据大标题笔画粗细与行高判断 |

识别结果直接落到编辑器里，可以继续改任意一项再保存。仓库还带了 `tools/analyze-samples.mjs`：
给一段截图目录，批量识别并输出 `previews/samples/*.html` 预览（开发调试用）。
右侧是真实 A4 实时预览；保存后回到模板库，点「发布」发到市场（本地）或生成 GitHub 投稿。

> 内置模板是只读的：直接编辑会提示「先复制为新模板」，复制后再改、再发布。
> 模板 CSS 必须以 `.rm-t-<类名>` 为根选择器；保存时会按类名自动校验，不用手写。

## 公共市场（GitHub）

不需要自建服务器：本仓库的 `market/` 就是一个公共模板市场。

```
market/index.json                 元数据列表 + 内联 css / sample（卡片直接渲染真实 A4 缩略图）
market/templates/<id>.json        单套模板的完整内容（css + sample 示例数据）
market/validate.mjs               投稿前校验：字段、id 与文件对应、cls 根选择器、隐私
market/README.md                  投稿规范（字段表、审核标准、维护者流程）
docs/MARKET.md                    使用与投稿的用户向说明
```

插件读取链路：

1. 「模板市场」页切到「公共市场 · GitHub」→ `GET raw.githubusercontent.com/<repo>/<branch>/market/index.json`；
2. 10 分钟内直接用本机缓存，过期才重新拉；仓库改名/改分支在「设置」页改；
3. 一个地址失败会依次回退：加速前缀（设置页可填，如 `https://gh-proxy.com/`）→ 官方 raw →
   `cdn.jsdelivr.net/gh/<repo>@<branch>/`，成功后记住可用源；
4. 点「安装」只下载 `market/templates/<id>.json`，存进本地模板库（之后离线可用）；
5. GitHub 不可达且本地有缓存时，界面显示「离线缓存」并继续可用。

> 国内直连 `raw.githubusercontent.com` 经常被重置，所以默认会先走 `https://gh-proxy.com/`
> 这个加速前缀；不想走第三方代理，到「设置」页把「GitHub 加速前缀」清空即可
> （之后依次试官方 raw、jsDelivr）。

投稿（两种都行，改完提交 PR 即可）：

1. 在「模板库」里选中自己做的模板 → 点「发布」→ 勾选「同时生成 GitHub 公共投稿」→ 弹窗里「打开 Issue」，把 JSON 贴进去提交；
2. 或点「新建模板文件」，文件名和路径已带好，直接提交 PR。

合并进 `market/` 后，所有装了插件的人在公共市场里就能看到并安装。投稿规范见
[`market/README.md`](market/README.md)；只想给自己团队用时，在「设置」页把公共市场仓库改成
自己的 `owner/repo` 即可——读的是同一个目录结构。

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
node tests/github-market.mjs # 公共市场契约测试（index / 模板安装 / 投稿 JSON / 工具）
node tests/render.mjs    # 客户端 bundle 渲染测试（侧栏图标 + 面板首屏）
node tests/pdf.mjs       # 客户端 PDF 生成器测试（xref / A4 页面 / 图片流）
node tests/mount.mjs     # jsdom 挂载测试（真实数据流：编辑 / 预览 / 模板库 / 市场 / 设置 / 发布弹窗）
node tools/previews.mjs  # 生成 9 套模板的静态预览 → previews/index.html
node market/validate.mjs # 校验公共市场 market/ 目录（index / 模板文件 / cls / 隐私）
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
