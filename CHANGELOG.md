# 更新日志

本文件记录简历市场插件的版本变化。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## v0.11.1 — 2026-11-01

- 修「AI 对话读不到正在编辑的简历」：`buildSystemPrompt()` 之前把整份 `resume` 直接 `JSON.stringify` 塞进 system，而上下文上限 6000 字——简历里 `basics.photo` 是几百 KB 的 base64 dataURL，一条就把预算吃光，模型只看得到基本信息，项目/工作/教育全被截掉。现在新增 `compactResume()`：照片换成「[已上传照片]」占位、每个字段与要点各自截断（要点 240 字、字段 400 字、简介 1200 字）、列表限 16 条/每条 12 条要点；同时前置「模块概览」（工作/项目/教育/技能/奖项的名称与时间线），这样即使 JSON 真的被截断，模型也知道有哪些经历。上限提到 16000 字，够放下一份完整简历。
- `tests/chat.mjs` 增加回归断言：带 40KB 照片 dataURL + 工作/项目/教育/技能的简历进上下文后，必须包含公司名、项目名、要点原文、`【模块概览】`，且**不能**包含 `data:image`、必须有 `[已上传照片]`，总长度 < 20000。

## v0.11.0 — 2026-11-01

- 修「A4 预览的『适合宽度』『100%』按钮点一下变成纯白色色块」：`.rm-zoom-btn.is-on` 原本用 `background: var(--dsw-alias-brand-primary, #2f6fde)`，在浅色主题下该 token 解析成浅色，白字配浅底就成了「白块」。改为固定品牌蓝 `#2f6fde` + 白色文字/描边，并补 `:focus-visible` 焦点环（选中态在键盘聚焦时仍有对比度）。
- 新增「框选修改」：A4 预览工具条多一个开关，打开后鼠标 hover 出现虚线框、点击选中一个元素（姓名 / 某个联系方式 / 模块标题 / 某条要点 / 一整段经历），右下角小面板写一句指令（Enter 提交、Shift+Enter 换行、Esc 取消），插件把「结构化位置 + 指令」发给 AI，只改这一处。新增 `src/selection-edit.js` + `POST /resume-market/api/selection/edit`：内容改动按路径白名单落到 `resume.data` / `sectionTitles`（换模板也保留）；样式改动返回 stylePatch，由客户端用 `rmStyleToCss` 生成覆盖 CSS，再二次提交落成 `resume.styleOverride` + `styleOverrideCss`（预览/PDF/HTML 生效，Word 导出回退模板默认样式并明确告知）。危险 CSS（`</style>`、`<script>`、`javascript:`）直接丢弃。切模板时清掉样式覆盖并提示「内容修改都保留」，避免用户以为改丢了。
- 新增「档案 + 按 JD 定制」：顶栏多一个「档案」标签，可把当前简历存成长期档案（也可从空白档案逐项填），选档案 + 粘贴 JD → AI 按 JD 重写简介、重排裁剪要点（禁止编造），返回匹配度评分、改动说明、能力缺口，一键生成新简历进编辑器。新增 `src/archive.js`（`archiveMeta` / `normalizeArchive` / `tailorArchive`）+ `src/client/65-archive.js`（ArchiveView），store 新增 `archives`（上限 50、reconcile 清洗、原子写盘）+ 接口 `/archive`、`/archive/from-resume`、`/archive/tailor`、`DELETE /archive?id=`；`/state` 带上 archives。
- 证件照两种压缩方式：基本信息照片上传新增「压缩方式」单选——**正方形**（1:1 居中裁切，证件照标准）与**等比**（保持原比例不裁切）。`basics.photoFit` 贯穿预览（object-fit + 浅灰底）、HTML、Word `.docx`（cover 固定 86×86 + srcRect，contain 等比 ≤86×86）、PDF；顺带修好 quiet-luxury / compact-one / tech-grid 三套 split 页眉在 Word 里不显示照片的问题。
- 测试：新增 `tests/selection.mjs`（7 组：内容/样式两阶段、白名单、CSS 消毒、错误码）、`tests/archive.mjs`（6 组：meta、tailor、score 夹取、错误码）；`tests/smoke.mjs` 增加 `/state.archives` 与 `/archive` 全流程；`tests/docx.mjs` 扩到 21 组（cover/contain 两态）。`src/store.js` 的 `createArchiveFromResume` 曾因 `mutate` 返回 Promise 未 await 导致响应 `{}`，已修。

## v0.10.0 — 2026-11-01

- 修复「导出 doc 还是没有预期格式」：v0.9.0 的 Word 兼容 HTML 在真实 Word 里仍会走样（页眉浅灰字配浅灰底看不清、正文贴边、模块标题与内容粘连）。这一版彻底换方案：新增 `src/word-docx.js`，零依赖手写 OOXML（Node 内置 `zlib` 打 zip + XML），直接产出**真正的 .docx**。A4 页边距、页眉色带、模块标题色块（banner/tab/pill/bar/icon/leftbar 各自近似）、左栏侧边栏、联系方式两列、条目左右对齐、照片内嵌 `word/media/`，Word / WPS 都能正确还原；生成失败才回退旧的 `.doc`。导出格式 id 仍是 `doc`，文件名后缀变为 `.docx`。`tests/smoke.mjs` 增加 zip 签名 + `word/document.xml` + A4 `w:sectPr` 断言，新增 `tests/docx.mjs`（19 组）。
- 模板生成不再只吃图片：新增 `src/template-import.js`（零依赖解析）——`.docx` 解 zip 读 `word/document.xml` 抽段落与 run 样式；Word 兼容 HTML 的 `.doc` 按 HTML 解析；`.pdf` 解对象表 + FlateDecode 内容流按坐标聚行。统一成 `{model, draft}`，路由 `POST /template/import`（base64、≤8MB），客户端「从图片生成」升级为「**从文件生成**」（accept 图片/`.doc`/`.docx`/`.pdf`），解析结果直接进初稿预览。新增 `tests/import.mjs`（65 组断言）。已知限制：加密 PDF / 扫描件 / 旧版二进制 .doc 会明确报错。
- 初稿接 AI 二次优化：新增 `src/template-ai.js` + 路由 `POST /template/refine`，把程序初稿（style）与源文件摘要（文本块、字号、颜色、栏位）发给当前 DSH 模型，让它在合法枚举内修正版式、补 `sidebarSections`、调字号与颜色，返回 `style` + `notes`；界面上「AI 优化」有 loading / 说明 / 「恢复程序初稿」。宿主没配模型或调用失败时保留初稿，不影响使用。新增 `tests/ai.mjs`（7 组）。
- 侧栏布局支持模块进左栏：`style.sidebarSections`（默认 `['skills']`，可选 summary / education / experience / projects / skills / awards），模板编辑器侧栏布局下出现「侧栏模块」多选；图片识别新增 `leftColumn`（栏宽 / 块数 / 是否延伸到页头以下），识别到左栏承载多组文字时自动建议（样例图 `101957` 识别出 9 组块 → 自动勾上）。
- 上架材料：新增 `docs/MARKET.md`（awesome-dsh-plugin 收录要求对照表、可粘贴 YAML 条目、fork → `data/plugins/*.yml` → `node scripts/generate-readme.mjs` → PR 流程、CI 三关、npm 发布清单）；`package.json` 移除 `"private": true` 并补齐 description；README 安装段、导出说明、模板创作流程全部同步。
- 测试补强：`tests/docx.mjs` / `tests/import.mjs` / `tests/ai.mjs` 三个新测试，`tests/smoke.mjs` 的 Word 断言从 HTML 版式改为 docx 结构，`tests/mount.mjs` 导出菜单文案改为「导出 Word (.docx)」。

## v0.9.0 — 2026-11-01

- 修复「导出 Word(.doc) 后格式全没了」：以前 `buildWordHtml()` 把 BASE_CSS + 模板 CSS + PRINT_CSS 全塞进 `<style>`，Word/WPS 的 HTML 导入会整段丢掉 `display:grid/flex`、`gap`、`clip-path`、`transform`，只剩裸文字。新增 `renderWordBody()`：纯 `<table>` + 行内 style 重排页头（含照片两列）/联系方式两列/模块标题（按 banner·tab·pill·icon·leftbar·rule 近似上色）/条目左右对齐/`<ul>` 要点/sidebar 两栏；`WORD_CSS` 只留 `@page` A4 与表格基础样式；内置 7 套模板没有结构化 style 时从模板 CSS 嗅探页眉与标题样式。已知退化：斜切角退化成矩形填充、胶囊圆角变直角、渐变变纯色。
- 修复「预览/导出 PDF 超过一页被截断」：`rmPdfBase64()` 先量内容真实高度、按 A4 高算页数（1–8 页），把整份内容一次性渲染后按页切片成独立 canvas，`rmBuildPdf()` 支持多页 PDF（多页 `/Kids`、`/Count`、逐页对象与 xref）；`tests/pdf.mjs` 增加多页结构断言。
- A4 预览不再裁切并支持缩放：`PreviewScaled` 新增 `multiPage` 逻辑，按内容高度展开页数、画虚线页线与「第 N 页」标签、可滚动；`PreviewPanel` 新增 `[−][百分比][+][适合宽度][100%]` 工具条（40%–200%、10% 一档）与「共 N 页」pill；缩略图与模板编辑器预览仍保持单页裁切。
- AI 对话浮窗可自由拖动：按住标题栏或折叠小条拖动，clamp 在窗口内（8px 边距、3px 阈值防误触），窗口 resize 自动收回，关闭/折叠保留位置；标题栏按钮点击不被拖动吞掉。
- 测试补强：`tests/smoke.mjs` 断言 Word 导出产物为 `<table>` 版式、关键样式行内化、不残留 `display:grid/flex`/`clip-path`/`transform`/`gap`；`tests/mount.mjs` 断言预览缩放工具条四个按钮、「适合宽度」、百分比与点「+」后比例上升。README 同步更新预览/导出/浮窗说明。

## v0.8.0 — 2026-11-01

- 修复「兼容插件下载装不上」：旧目录里的包名是编造的（`dsh-resume-skills` 等在 npm 上不存在，pnpm 直接 404）。换成真实存在的包：`dsh-resume-screening`（简历筛选 / 人才库）、`@xrxs-ai/dsh-resume-migrator`（批量迁移）、`dsh-plugin-resume-warehouse`（本地简历仓库），`dsh-resume` 因名字已占用且未发布标为「规划中」。
- 兼容语义从「只检测 + 安装」升级为「能力真接入」：Host 读 `ctx.get('tools').schemas()`，按目录关键词认出发行插件注册了哪些工具，`/compat/state` 每条返回 `capabilities` / `hasTools` / `toolsHint`，设置页显示成 `工具：xxx` 标签（排除本插件自己的 `resume_*` 工具）。
- AI 对话新增「工具桥」（`chatTools`，默认关）：打开后 system prompt 带上可用工具清单，模型输出 ```tool 代码块时由 Host 用 `tools.execute()` 执行一次（60 秒超时），把结果回灌再生成最终回答；返回 `toolUsed` / `toolPreview`，执行失败降级为 `bridgeError`，清单外工具拒绝执行。
- 设置页兼容插件卡片新增「打开插件市场」（切到 DSH 自带市场面板 `dsh-market`），未安装条目提供「去插件市场」主按钮 + 「直接安装」次按钮；已安装显示版本与能力标签。
- 测试补强：`tests/compat.mjs` 真实目录 + 能力匹配断言，`tests/chat.mjs` 新增 5 组工具桥用例，`tests/smoke.mjs` 覆盖 `/compat/state` 字段与 `chatTools` 设置往返；README「兼容插件」章节重写。

## v0.7.0 — 2026-11-01

- 修复「模板库点不了模板」：内置模板改为返回 `builtin: true`（以前缺这个标记，卡片被当成自定义模板渲染、点击行为错乱）；模板列表与下拉改用复合 key，并在加载旧数据时自动给与内置模板同 id 的自定义条目改名（如 `-copy2`），避免 React key 冲突导致点击/选中错位。
- 模板卡片整张可点：点卡片任意空白处直接套用该模板（按钮点击不会误触发），卡片有 hover 高亮与「点击直接套用这套模板」提示。
- 新增「兼容插件」：设置页可查看与本插件互补的简历相关插件（dsh-resume-skills、dsh-resume-expert 等），自动检测当前 profile 是否已安装、显示版本；未安装可一键调用 `dsh plugin add` 下载安装，并提示安装后重启 DSH 生效。README 增加「兼容插件」章节。

## v0.6.0 — 2026-11-01

- 「从图片生成模板」升级为版式识别：新增布局（单栏 / 左侧栏）、页眉样式（纯文字 / 整宽色带 / 左右分栏 / 左上角标签）、内容块（无边框 / 卡片）、标题样式（新增斜角标签 tab / 圆角胶囊 pill / 圆形图标 icon / 左侧竖条 leftbar）。
- 模板编辑器新增「布局 / 页眉 / 内容块」三行选项与 4 个对应预设（侧栏深蓝 / 蓝色胶囊 / 蓝色圆形图标 / 浅灰卡片）；CSS 生成覆盖全部组合。
- 新增开发工具 `tools/analyze-samples.mjs`：批量把样例截图识别成模板并生成预览画廊（纯 JS 解码 PNG，不依赖浏览器）。

## v0.5.0 — 2026-10-31

- 新增内置模板「青金分栏」（banner-exec）：大号衬线标题 + 金色竖线 / 圆形徽章 + 青→金斜切色带页眉，模块标题为深青斜切平行四边形色带（左侧金竖条 + 下方金色细线），联系信息两列网格。
- 模板编辑器新增标题样式「斜切色带」（banner）与金色辅助色（colors.gold），并提供「一键套用『青金斜切』」预设（编辑器版式卡 / 图片导入弹窗均可）。
- 「从图片生成模板」升级：自动识别分块色带标题（条带检测）、衬线大标题、顶部彩色/强调色页眉带与金色系主色，生成初稿后可继续在编辑器微调。
- 公共市场同步新模板：market/index.json 现为 6 个模板，index 内联 css/sample 让市场卡片直接渲染真实 A4 缩略图。

## v0.4.0 — 2026-10-31

### 新增

- **模板库创作闭环**：模板库支持「+ 新建模板」「复制为新模板」「编辑」「发布」「删除」，
  不再只能发布简历。发布的对象是模板本身（含 css / style / 示例数据），可在弹窗里选择是否
  携带示例内容，并可直接生成 GitHub 公共投稿。
- **模板元素格式编辑器**：强调色 / 姓名色 / 标题色 / 正文色 / 纸张底色 / 页眉色带、姓名 /
  标题 / 正文字号、行距、左右与上下页边距、区块间距、标题样式（rule/bar/underline/plain）、
  字体（sans/serif/mono）、页眉对齐、联系信息列数、页眉色带开关；右侧 A4 实时预览。
- **从图片生成模板初稿**：选一张简历截图，本地 canvas 取色 + 版式启发式生成一套模板初稿
  （强调色、字号、边距、标题样式、页眉色带），再在编辑器里微调，不依赖视觉模型。
- 后端：`POST /template/save`、`POST /template/publish`、`POST /github/publish-template`；
  `store` 新增 `getTemplateById` / `createTemplate` / `updateTemplate` / `publishTemplate`；
  `normalizeTemplate` 保留 `style` 白名单与 `sample`；市场条目补 `cls`。

### 变更

- 「发布到市场」入口从顶部工具栏移到「模板库」，顶部改为提示「发布模板请到模板库」；
  市场页不再提供简历发布入口。
- 内置模板只读：编辑/发布内置模板时提示先「复制为新模板」。
- 版本号 0.3.0 → 0.4.0；mount 测试增加模板库新建 / 编辑 / 图片导入 / 发布弹窗覆盖。

## v0.3.0 — 2026-10-31

### 新增

- **教育经历·主修课程（可选）**：每条教育经历可填「主修课程」，留空不渲染；填了会在预览、
  HTML、Word、PDF 四种输出里单独一行展示（HTML 导出含 `rm-edu-courses`）。
- **模块顺序拖拽 + 显隐**：「模块顺序与显示」改成紧凑小按钮（↑ / ↓ / 眼睛）+ HTML5 拖动把手，
  拖动时显示插入位置；隐藏的模块变灰留在列表里，点眼睛恢复。顺序与显隐实时驱动预览与导出。
- **AI 对话浮动窗**：从顶部标签页改成编辑界面右下角的「● AI 对话」胶囊按钮，点开是浮动面板，
  可折叠 / 关闭，切换标签页不丢对话；保留一键「应用到当前简历」。
- **AI 对话免 Key**：`chatApiKey` 为空时直接调用 DSH Host 的 `llm` 服务，用当前 DSH 模型聊，
  不用配置、不单独计费；填了 DeepSeek API Key 仍走原来的 DeepSeek HTTP 路径（`mode:'api'`）。

### 变更

- 公共市场 `market/index.json` 内联 `templateId` / `css` / `sample`，公共市场卡片改成真实 A4 缩略预览
  （之前只有 accent 色块，和安装后的简历预览观感不一致）；`market/build.mjs` 会同步生成。
- 设置页 AI 卡片文案改为「免 Key 默认用当前 DSH 模型」，Key / 模型 / Base URL 标为可选。
- README 更新浮动对话、免 Key、主修课程、模块拖拽与公共市场缩略预览说明。
- 版本号 0.2.1 → 0.3.0；`market/validate.mjs` 与 `tests/github-market.mjs` 覆盖 index 的 css / sample 字段。

## v0.2.1 — 2026-10-31

### 修复

- 公共市场默认先走 `https://gh-proxy.com/` 加速前缀：国内直连 `raw.githubusercontent.com`
  会被重置，默认配置下开箱即可加载公共市场；不想走第三方代理可在设置页把前缀清空
  （之后依次尝试官方 raw 与 jsDelivr）。

## v0.2.0 — 2026-10-31

### 新增

- **公共市场（GitHub）**：「模板市场」页新增「本地面板 / 公共市场 · GitHub」切换，直接读
  `market/index.json`，10 分钟本地缓存，离线时退回缓存；安装只拉单套模板 JSON。
- **投稿闭环**：发布弹窗新增「同时生成 GitHub 公共投稿」，生成规范 JSON + Issue 链接 +
  「新建模板文件」链接，PR 合并进 `market/` 即对所有用户上架。
- **公共市场内容目录**：`market/index.json` + `market/templates/*.json`（首批 5 套：
  学术科研 / 金融投行 / 活力橙 / 静奢蓝灰 / 科技网格）、`market/validate.mjs` 校验脚本、
  `market/README.md` 投稿规范、`docs/MARKET.md` 用户指南。
- **可配置市场源**：设置页新增「公共市场仓库 / 分支」，可指向自己的 fork 或团队仓库。
- **AI 工具**：新增 `resume_market_public` / `resume_install_public` / `resume_publish_public`
  三个工具（共 9 个），大肥鱼可以直接浏览、安装、投稿公共市场模板。

### 变更

- 发布弹窗增加公共投稿 checkbox；设置页增加 GitHub 仓库与分支两项。
- README 增加「公共市场（GitHub）」章节与 `market/validate.mjs` 开发命令。

## v0.1.1 — 2026-10-31

### 修复

- 仓库改名后同步 GitHub 地址（`package.json` 的 `repository` / `homepage` / `bugs`，
  `CONTRIBUTING.md`、`docs/INSTALL.md`、`docs/RELEASE.md` 里的克隆与远程地址），
  版本号同步为 `0.1.1`，避免 v0.1.0 里残留旧仓库名。

## v0.1.0 — 2026-10-31

首个公开发布。

### 新增

- **左侧栏入口 + 主面板**：DSH 侧栏出现「简历市场」图标，点开就是完整面板（我的简历 / 模板库 / 市场 / 设置）。
- **6 套内置模板**：商务极简、静奢蓝灰、清新创意、紧凑单栏、时间轴、科技网格，缩略图为真实 A4 渲染。
- **结构化编辑器**：个人信息拆成 8 个独立字段（姓名 / 岗位 / 电话 / 邮箱 / 城市 / 微信 / GitHub / 主页），以两列网格呈现，彻底解决「个人信息坨在一起」；工作经历 / 项目 / 教育 / 技能 / 奖项均为可排序、可增删的条目列表，自动保存（900ms 防抖）。
- **A4 实时预览**：右侧按 794×1123 比例等比缩放，编辑即刷新。
- **HTML / Word(.doc) / PDF 三格式导出**：Host 直接写文件到 `~/.dsh/resume-market/exports/`；PDF 由面板在本地渲染成 A4 单页，不依赖打印对话框或系统 Chrome / LibreOffice。
- **我的简历 / 回收站 / 历史版本**：切换、重命名、复制、删除，删除进回收站可恢复；编辑超过 3 分钟自动留历史快照，可「恢复到这里」。
- **模板市场**：本地种子市场 + 零依赖 `server/` 远端市场服务（发布 / 浏览 / 下载 / 点赞 / 下架，可配置市场地址与发布 Token）。
- **6 个 `resume_*` agent 工具**：`resume_market_list`、`resume_save`、`resume_export`、`resume_publish`、`resume_import_template`、`resume_list_templates`，让模型直接用结构化数据生成 / 修改 / 导出 / 发布简历。
- **AI 对话填写**：面板「AI 对话」标签页，用自然语言描述经历，模型返回结构化简历 JSON，一键应用到当前简历；DeepSeek API Key / 模型 / 接口地址在设置页配置。
