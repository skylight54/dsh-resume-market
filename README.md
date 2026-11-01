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
  字号、行距、页边距、标题样式、页眉色带等元素格式，右侧 A4 实时预览；也可以「从文件生成」——
  丢一张简历截图、一份 Word（.doc/.docx）或 PDF 进去，插件先在本地解析出颜色 / 版式 / 文本块
  跑一版初稿，再让 AI 对着原文件和初稿比对、补全版式细节（AI 不可用时保留初稿，一样能用）。
  保存后可一键「发布」到本地市场（可选是否携带示例内容）或生成 GitHub 公共投稿（JSON + 预览图 + Issue 表单，署名只需填一次）。
- **结构化编辑器**：基本信息 8 字段两列网格；工作经历 / 项目 / 教育 / 技能 / 奖项均为
  可排序、可增删的条目列表，自动保存（900ms 防抖）；教育背景可选填「主修课程」，导出时单独
  一行跟在学历 / 专业下面（HTML / Word / PDF 都带上）。
- **可选照片 + 两种压缩方式**：基本信息里可上传照片（自动裁到最长边 480px 的 JPEG），位置可选
  左侧 / 右侧，形状可选圆形 / 方形；压缩方式可选 **正方形**（1:1 居中裁掉多余部分，适合证件照）
  或 **等比**（保持原比例、不裁切，适合生活照）；预览与 HTML / Word / PDF 导出都会保留。
- **模块顺序与显隐**：每行一个紧凑小按钮（↑ / ↓）调整顺序，也可以直接拖动右侧把手
  （HTML5 拖拽，悬停行会显示插入位置）；点眼睛按钮可以隐藏 / 显示整节，隐藏的模块变灰但
  仍留在列表里。顺序与显隐实时驱动预览和导出（如把「教育背景」挪到「项目经历」前面）。
- **A4 实时预览 + 点哪改哪**：右侧按 794×1123 等比缩放预览；内容超过一页时自动分页（虚线页线 +
  「第 N 页」），工具条可缩放：[−][百分比][+][适合宽度][100%]，40%–200%、10% 一档。打开工具条
  的「框选修改」后，直接在预览上点住某个元素（姓名 / 联系方式 / 某个模块标题 / 某条要点 / 一整段
  经历），写一句「改成高级产品经理」或「这条太啰嗦，删掉一半」，AI 就只改这一处。
- **三格式导出**：工具栏「导出 ▾」可选 HTML / Word(.docx) / PDF。三种都由 Host 直接写文件到
  `~/.dsh/resume-market/exports/`，导出对话框给出完整路径 + 「打开所在文件夹」。
  Word 导出现在是**真正的 OOXML .docx**（零依赖手写 zip + XML，Word / WPS 都能正确还原：
  A4 页边距、页眉色带、模块标题色块、左栏侧边栏、联系方式两列、条目左右对齐），不再是 Word
  兼容 HTML；生成失败才回退 .doc。PDF 由面板在本机渲染，自动按页数切片生成**多页 PDF**
  （不需要打印对话框，也不依赖系统装 Chrome/LibreOffice；浏览器渲染失败时才退回打印视图）。
- **我的简历 / 回收站 / 历史版本**：「我的简历」标签页可切换、重命名、复制、删除；删除进回收站可恢复；
  每次编辑超过 3 分钟自动留一个历史快照，随时可以「恢复到这里」找回旧内容。
- **档案 + 按 JD 定制**：「档案」标签页保存一份完整的个人档案（基本信息 / 简介 / 各段经历），
  粘贴目标岗位 JD 后，AI 会据此重写简介、挑最相关的经历与要点，输出匹配度评分、改动说明和
  能力缺口，一键载入编辑器再微调——同一份档案可以对着不同 JD 生成不同版本简历。
- **AI 对话填写（浮动窗）**：编辑界面右下角有「● AI 对话」胶囊按钮，点开是浮动对话面板，
  用自然语言描述自己即可；回复里出现结构化 JSON 时可以一键「应用到当前简历」（没有简历会自动新建）。
  **默认不用填 Key**：直接用你当前在 DSH 里使用的模型；想独立计费/换模型再填自己的 DeepSeek API Key。
  浮窗可按住标题栏（或折叠后的小条）自由拖动，位置限制在窗口内，缩放浏览器窗口会自动收回。
- **模板市场**：发布的是「模板」本身——在「模板库」里做好模板 → 点「发布」发到本地市场
  （可勾选是否带示例内容），其他用户「安装」后即可用；支持点赞、下架、自建远端市场服务器同步。
- **公共市场（GitHub）**：市场页可在「本地面板」和「公共市场 · GitHub」之间切换。公共市场直接读
  本仓库 `market/index.json`，不需要服务器和账号；安装时只拉那一套模板的 JSON，10 分钟内走本地缓存，
  GitHub 不可达时退回上次缓存。发布弹窗勾选「同时生成 GitHub 公共投稿」会生成规范 JSON + Issue /
  新建文件链接，提交 PR 合并进 `market/` 即对所有用户上架。
- **兼容插件**：设置页列出真实存在的简历相关插件（`dsh-resume-screening`、`@xrxs-ai/dsh-resume-migrator`、
  `dsh-plugin-resume-warehouse`），自动检测装没装；没装的可以「去插件市场」跳转安装或「直接安装」，
  装上后它们注册的工具会显示成能力标签，并能被本插件的 AI 对话调用（`chatTools` 开关）。
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

发布到 npm 之后也可以像其他插件一样从 **DSH 内置插件市场** 搜索安装（`dsh-plugin-resume-market`）。
想把这个插件收录进官方插件市场（awesome-dsh-plugin / awesome-dsh-plugin.com），
收录要求、可直接粘贴的注册表条目和提 PR 步骤见 [`docs/MARKET.md`](docs/MARKET.md)。

## 兼容插件

设置页（侧栏「简历市场」→「设置」）底部有一张「兼容插件」卡片，用来接上与本插件互补的独立插件。
这里的「兼容」不是只装个包，而是**把对方注册到 DSH 的工具接进本插件**：装上后，本插件的 AI 对话可以
直接调用它们的能力（例如把一批旧简历批量入库、迁移、检索本地简历仓库）。

- **真实清单**（`src/compat.js` → `COMPAT_CATALOG`）：

  | 包名 | 用途 | 装好后接进来的能力 |
  | --- | --- | --- |
  | `dsh-resume-screening` | HR 视角的简历筛选 / 人才库：Word、PDF、Excel 批量入库，按技能和分类检索、去重 | 筛选、入库类工具 |
  | `@xrxs-ai/dsh-resume-migrator` | 批量迁移：带队列的批量导入 + 分类导出 | 导入、迁移类工具 |
  | `dsh-plugin-resume-warehouse` | 本地优先的简历仓库：数据不离开本机 | 仓库、检索类工具 |
  | `dsh-resume` | 通用简历包（npm 名字已占用，尚未正式发布，条目只展示） | — |

- **能力发现**：Host 读 `ctx.get('tools').schemas()` 拿到 DSH 里当前注册的全部工具，按目录条目的关键词
  匹配出「这个插件提供了哪些工具」，在卡片上显示成 `工具：xxx` 标签。本插件自己的 `resume_*` 工具会被
  排除，不算成兼容能力。插件是在 DSH 启动时加载的，所以**装完要重启 DSH** 才会出现能力标签。
- **两种安装方式**：
  - 「去插件市场」：切到 DSH 自带的插件市场面板（`layout.selectPanel('dsh-market')`），在市场里搜索安装；
  - 「直接安装」：Host 执行 `dsh plugin --profile <profile> add <包名>`，命令输出回填到卡片上；已装过的会跳过。
- **能力真正用起来**：设置页 AI 对话卡片里的「允许 AI 对话调用已安装插件的工具（实验）」（`chatTools`）。
  打开后，对话的 system prompt 会带上可用工具清单；模型需要时会输出一个 ```tool 代码块，
  Host 用 `tools.execute()` 执行一次（60 秒超时）并把结果回灌，再让模型给出最终回答。
  默认关闭；模型点名清单外的工具会被忽略，不会越权执行。
- **检测**：读 `~/.dsh/profiles/*/package.json`（`dependencies` 与 `dsh.profile.bundles`）以及
  `node_modules/<包名>/package.json`，自动选中装了本插件的 profile，也可用 `DSH_PROFILE` 指定。
- **找不到 `dsh` 命令**：把环境变量 `DSH_CLI` 指向可执行文件，或按卡片提示手动执行安装命令。
- 接口（只本机同源可访问）：`GET /resume-market/api/compat/state`（含 `capabilities` / `hasTools`）、
  `POST /resume-market/api/compat/install`（body：`{"id": "resume-screening"}`）。
- **想加条目**：改 `COMPAT_CATALOG`（`id` / `name` / `installSpec` / `hints` 四项必填）；`hints` 用来匹配
  工具名和描述，写宽一点更容易认出来。这是 Host 侧文件，不进客户端 bundle。

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

## 档案与按 JD 定制

「档案」标签页（顶栏第二个标签）放的是**长期资料**，不是某一版简历：

- 「从当前简历建档案」一键把正在编辑的简历存成档案；也可以从空白档案开始，8 个基本信息字段 + 简介 / 经历 / 项目 / 教育 / 技能 / 奖项逐项填写。
- 选一份档案，粘贴目标岗位的 JD（≥20 字），点「按 JD 定制」：AI 会按 JD 重写简介、重排并裁剪要点、保留所有事实（不允许编造），返回**匹配度评分**、**改动说明**和**能力缺口**提示。
- 结果点「把这份简历载入编辑器」就生成一份新简历（原档案不动），再手动补两笔即可投递。
- 接口：`GET /resume-market/api/archive`、`POST /archive`、`DELETE /archive?id=`、`POST /archive/from-resume`、`POST /archive/tailor`；错误码 `archive/no-archive`、`archive/no-jd`、`archive/jd-too-short`、`archive/no-ai`、`archive/bad-json`。

## 框选改一处（AI 直接改预览）

A4 预览工具条上的「框选修改」开关打开后，预览里的元素都能点：

1. 鼠标悬停出现浅蓝虚线框，点一下选中（实线 + 右上角范围标签）；
2. 选区右下角弹出小面板，写一句话（Enter 提交、Shift+Enter 换行、Esc 取消）；
3. 插件把它对应的结构化位置（`basics.phone` / `experience.0.bullets.1` / `summary` / 某模块标题…）连同指令发给 AI，AI 只返回**这一处**的新值或样式补丁；
4. 内容改动直接写回简历数据（换模板也保留）；样式改动（字号 / 颜色 / 间距）存成一份覆盖 CSS，预览和 PDF 立刻生效。

切模板时内容改动一定保留；样式覆盖因为绑在原模板的 class 上会自动失效并提示你，想保留就先别换模板。

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
从文件生成     丢进简历截图 / Word(.doc/.docx) / PDF：图片走本地 canvas 取色 + 版式识别，
               Word / PDF 由 Host 解析出文本块、字号、颜色和栏位，先出一版程序初稿
```

编辑器里能改的「元素格式」：强调色 / 姓名色 / 区块标题色 / 正文色 / 纸张底色 / 页眉色带 / 金色辅助色、
姓名字号 / 标题字号 / 正文字号 / 行距 / 左右与上下页边距 / 区块间距、字体（sans / serif / mono）、
页眉对齐、联系信息列数。

### 图片 / 文件生成能识别什么

识别只看像素，不联网、不上传，纯本地 canvas：

| 维度 | 可选值 | 说明 |
| --- | --- | --- |
| 布局 layout | single / sidebar | sidebar = 左侧整列深色信息栏（照片、联系方式在左栏） |
| 页眉 headerStyle | plain / band / split / ribbon | 纯文字 / 整宽色带 / 姓名与联系方式左右分栏 / 左上角斜角标签 |
| 标题 headingStyle | rule / bar / underline / plain / banner / tab / pill / icon / leftbar | 细线 / 竖条 / 粗下划线 / 无装饰 / 斜切色带 / 斜角标签块 / 圆角胶囊 / 圆形图标位 / 左侧竖条 |
| 内容块 contentStyle | plain / card | 无边框 / 每节独立细边框卡片 |
| 颜色 | accent / nameColor / headingColor / bodyColor / background / bandColor / gold | 从图中取主色、深色、底色、暖色（金色） |
| 字体倾向 | sans / serif / mono | 依据大标题笔画粗细与行高判断 |

识别结果直接落到编辑器里，可以继续改任意一项再保存。

侧栏布局还能选「侧栏模块」：把技能特长 / 语言能力 / 兴趣爱好这些模块放进深色左栏，右栏只留
正文（默认放技能特长；识别到左栏在页头之后还有多组文字时会自动勾上）。

### 从文件生成：程序初稿 → AI 优化

1. 模板库点「从文件生成」，选图片 / Word / PDF（单文件 ≤8MB）。
2. Host 先解析：图片用 canvas 取色与版式启发式；Word 解 `word/document.xml` 抽段落与 run 样式；
   PDF 解对象表 + FlateDecode 内容流，按坐标把文字聚成行。输出统一的 `model`（页面尺寸、文本块、
   颜色、字体）和 `draft`（模板名、卖点、style、sample）。
3. 弹窗里能看到取色板、版式摘要（布局 / 页眉 / 标题 / 内容块）、可折叠的文本块。
4. 点「AI 优化」：把 model 摘要 + 程序初稿发给当前 DSH 模型，让它在合法枚举内修正版式、
   补 `sidebarSections`、调字号与颜色，返回 `style` 与 `notes`；不满意可「恢复程序初稿」。
   宿主没配模型或调用失败时保留初稿，不影响继续用。
5. 「套用初稿」进模板编辑器，再手动微调、保存、发布。

后端接口：`POST /template/import`（base64 → `{model,draft}`，错误码 `import/*`）、
`POST /template/refine`（`{source,draft}` → `{style,notes}`，错误码 `template/no-source`、
`template/bad-json`、`chat/no-key`）。解析失败会明确报错（加密 PDF、旧版二进制 .doc、扫描件无文本层）。仓库还带了 `tools/analyze-samples.mjs`：
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
docs/MARKET.md                    上架 DSH 插件市场的收录指南 + 公共模板市场使用与投稿说明
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

投稿走 Issue（推荐，不用手动贴 JSON）：

1. 在「模板库」里选中自己做的模板 →「发布」→ 勾选「同时生成 GitHub 公共投稿」；
2. 弹窗里先「下载投稿 JSON」和「下载预览图」，再点「打开投稿 Issue」——会打开带表单的 Issue 页面；
3. 第一次投稿填一个 GitHub 用户名（之后会记住），把两个文件拖进 Issue 评论框，提交即可；
4. 维护者把 JSON 放进 `market/templates/<id>.json`、在 `market/index.json` 加索引、跑 `node market/validate.mjs` 后合并。

> 「维护者直连（需要仓库写权限）」那个入口折叠在弹窗里，只给有写权限的人用：**main 分支已按
> 该流程保护，普通用户推不上去**，详见下面「分支保护」。

合并进 `market/` 后，所有装了插件的人在公共市场里就能看到并安装。投稿规范见
[`market/README.md`](market/README.md)；只想给自己团队用时，在「设置」页把公共市场仓库改成
自己的 `owner/repo` 即可——读的是同一个目录结构。

### 分支保护（main 只接受 PR）

仓库的 `main` 走 GitHub Ruleset 保护，任何人不带 PR 直推都会被拒绝，合并前必须过 CI：

- Required status checks：`ci / build + tests`（构建产物一致、包形状、全部测试、市场校验）
- PR 触碰 `market/**` 时额外跑 `market / 市场模板校验`
- 维护者自己在 Ruleset 里可以开 bypass；给贡献者的路径只有「Issue 投稿」与「fork → PR」

开启方式：仓库 Settings → Rules → New ruleset → Target `main` → 勾选
`Require a pull request before merging`、`Require status checks to pass`（选 `ci` 与 `market`）、
`Block force pushes`。没开之前，及时在仓库设置里补上。


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
node tests/pdf.mjs       # 客户端 PDF 生成器测试（xref / A4 页面 / 图片流 / 多页切片）
node tests/docx.mjs      # Word .docx 生成器测试（zip 结构 / OOXML / 7 套模板）
node tests/import.mjs    # 多来源解析测试（docx / Word HTML / PDF / 路由 / 初稿映射）
node tests/ai.mjs        # AI 优化测试（JSON 解析 / 枚举收敛 / 错误码）
node tests/selection.mjs  # 框选 AI 修改测试（两阶段 / 路径白名单 / CSS 消毒 / 错误码）
node tests/archive.mjs    # 档案与按 JD 定制测试（meta / tailor / score 夹取 / 错误码）
node tests/photo.mjs      # 照片裁剪测试（正方形居中 / 等比不裁 / 小图不放大）
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
  word-docx.js        Word .docx 生成器（手写 OOXML + zip，零依赖）
  template-import.js  模板文件解析（docx / Word HTML / PDF → 统一文档模型）
  template-ai.js      AI 优化初稿（调宿主模型修正 style）
  selection-edit.js   框选修改：把选区 + 指令变成一处内容/样式改动
  archive.js          档案与按 JD 定制（tailorArchive）
  client/             面板（React，零构建依赖，拼接后由 __ModuleLoader__ 加载）
server/               独立市场服务（零依赖）
lib/client.js         构建产物
```
