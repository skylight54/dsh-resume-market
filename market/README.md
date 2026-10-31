# 公共模板市场（GitHub 托管）

这个目录**本身就是插件的公共市场数据源**——不需要服务器、不需要账号：

- 插件读 `https://raw.githubusercontent.com/skylight54/dsh-resume-market/main/market/index.json` 拿列表（默认仓库 / 分支见下），本地缓存 10 分钟；
- 用户点「安装」时，再读 `market/templates/<id>.json` 拿完整模板（CSS + 示例数据）；
- 所以**提 PR 合入 = 上架**，所有装了插件的人刷新一下就能看到。

## 目录结构

```
market/
├── index.json                   # 市场列表（元数据 + 预览用 css/sample，插件一次只读这个）
├── templates/
│   ├── rm-academia.json         # 学术科研 · 大肥鱼
│   ├── rm-finance.json          # 金融投行 · 大肥鱼
│   ├── rm-vibrant.json          # 活力橙 · 大肥鱼
│   ├── rm-quiet-luxury.json     # 静奢蓝灰 · 简历市场
│   └── rm-tech-grid.json        # 科技网格 · 简历市场
├── build.mjs                    # 维护者工具：从 src/ 重新生成上面这 5 条（投稿不需要跑）
└── validate.mjs                 # 投稿前自检：node market/validate.mjs
```

> 手动改过 `market/templates/*.json` 之后**不要**再跑 `node market/build.mjs`，它会把内置那 5 条覆盖回源码版本。

## index.json 字段

```json
{
  "schema": 1,
  "updatedAt": "2026-10-31T12:00:00.000Z",
  "templates": [
    {
      "id": "rm-academia",
      "name": "学术科研",
      "en": "Academia",
      "tagline": "衬线字与双线分割，像论文扉页一样克制。适合博士、科研与教职申请。",
      "tags": ["学术", "科研", "教职"],
      "author": "大肥鱼",
      "accent": "#6f6880",
      "cls": "rm-t-academia",
      "templateId": "mkt-academia",
      "css": ".rm-t-academia{padding:60px 66px 54px;…}",
      "sample": { "basics": { "name": "周慕云" }, "summary": "…", "experience": [], "…": [] },
      "file": "templates/rm-academia.json",
      "installs": 0,
      "updatedAt": "2026-09-12T02:10:00.000Z"
    }
  ]
}
```

| 字段 | 要求 |
| --- | --- |
| `id` | `rm-` + 小写字母/数字/连字符，总长 2–60；必须和文件名一致（`rm-xxx.json`） |
| `name` | 中文名，≤ 40 字 |
| `en` | 英文名，可空 |
| `tagline` | 一句话卖点，≤ 160 字 |
| `tags` | ≤ 6 个，每个 ≤ 12 字（插件用来筛选/展示） |
| `author` | 署名，市场卡片显示「by 作者」 |
| `accent` | `#rrggbb` 主题色，用于卡片/缩略图 |
| `cls` | 必须是 `rm-t-*`，**必须和模板 CSS 的根选择器一致** |
| `file` | 固定 `templates/<id>.json` |
| `templateId` | 安装后在本地模板库使用的 id，建议 `mkt-<去掉 rm- 后的 id>` |
| `css` | 可选但**强烈建议**内联模板 CSS：市场卡片直接渲染真实 A4 缩略图，不用再拉一次详情 |
| `sample` | 可选但**强烈建议**内联示例简历数据：同卡片缩略图使用；格式同 `templates/<id>.json` 的 `sample` |
| `installs` | 新条目填 `0`；这个数只是展示，插件不做服务端统计 |
| `updatedAt` | ISO 时间字符串，条目有改动时更新 |

> `css` / `sample` 写在 index 里与写在模板文件里是同一份内容，`node market/build.mjs` 会自动同步；手写投稿时两处保持一致即可（`validate.mjs` 会比对）。

`templates` 数组最多 500 条（插件上限）。多余的未知字段会被插件忽略。

## templates/&lt;id&gt;.json 字段

```json
{
  "schema": 1,
  "id": "rm-academia",
  "name": "学术科研",
  "en": "Academia",
  "tagline": "……",
  "tags": ["学术", "科研"],
  "author": "大肥鱼",
  "accent": "#6f6880",
  "cls": "rm-t-academia",
  "templateId": "mkt-academia",
  "css": "\n.rm-t-academia{padding:60px 66px 54px;……}",
  "sample": { "basics": { "…": "…" }, "summary": "…", "experience": [], "…": [] },
  "createdAt": "2026-09-12T02:10:00.000Z"
}
```

- `templateId`：安装后在本地的模板 id，建议 `mkt-<slug>`（如 `mkt-quiet-luxury`）。不要用内置模板的 id（`business-minimal` / `quiet-luxury` 等），否则插件会自动改名。
- `css`：模板样式，见下方「CSS 规范」。
- `sample`：示例简历数据，结构见下方「sample 规范」。
- `createdAt`：ISO 时间字符串。
- 顶层字段要和 `index.json` 里对应条目保持一致（`name` / `en` / `tagline` / `author` / `accent` / `cls`）；`validate.mjs` 会逐项比对。

## CSS 规范

1. **必须有且只用一条根规则**，选择器就是 `cls`：`.rm-t-xxx{…}`。插件会把 `cls` 挂在 A4 容器上，不需要自己写 `.rm-doc`。
2. **所有选择器都写在这个根下面**：`.rm-t-xxx .rm-name{…}`。不要写全局 `body{}` / `h2{}` / `*{}`，会污染其他模板和插件界面。
3. **必须自包含**：不允许 `@import`、远程 `url()`、远程字体 `@font-face`；字体只用系统字体（`-apple-system` / `PingFang SC` / `Microsoft YaHei` / `Georgia` / `Consolas` 等）。图片也别外链。
4. **不要写 `position:fixed`、`@page`、影响整页尺寸的规则**——A4 尺寸、分页、打印样式由插件统一控制。
5. CSS 文本 ≤ 100KB（插件发布链路的上限）。

渲染器会输出的 class（在根下面写它们即可）：

```
.rm-head .rm-head-main .rm-name .rm-role .rm-contact .rm-k .rm-v
.rm-photo .rm-photo-left .rm-photo-circle .rm-photo-square
.rm-sec .rm-sec-h .rm-sec-t .rm-sec-summary .rm-sec-experience .rm-sec-projects
.rm-sec-education .rm-sec-skills .rm-sec-awards
.rm-items .rm-item .rm-item-t .rm-item-role .rm-item-sub .rm-item-main .rm-date
.rm-tag .rm-tags .rm-bullets .rm-para .rm-summary
.rm-skill-row .rm-skill-k
.rm-award-row .rm-award-t .rm-award-main .rm-award-desc
```

## sample 规范

`sample` 是「简历数据」而不是完整简历对象，结构由 `src/shared/doc.js` 的 `normalizeData()` 定义：

```
basics: { name, role, phone, email, city, wechat, github, website }   // 8 个字段都要有（可以是空串）
summary: string
experience: [{ company, role, period, location, bullets: [string] }]
projects:   [{ name, role, period, bullets: [string] }]
education:  [{ school, degree, major, period, gpa }]
skills:     [{ group, items }]
awards:     [{ title, date, desc }]
```

**示例数据必须是虚构的**：

- 电话统一 `138 0013 8000`，邮箱用 `@example.com`；
- 不要放真实姓名、真实联系方式、真实公司内部信息、真人照片（`photo` 留空）；
- 示例内容要贴合模板定位（学术模板用科研经历，投行模板用金融经历），不然缩略图会显得很怪；
- `validate.mjs` 会拦截不像示例的邮箱/手机号。

## 投稿方式（二选一）

### 路径 A：GitHub Issue（最省事）

1. 在插件里把版式调好 → 「发布到市场」→ 生成公共投稿 JSON（或在 AI 对话里让它调用 `resume_publish_public`）；
2. 打开 [新建 Issue](https://github.com/skylight54/dsh-resume-market/issues/new)，标题写 `[模板投稿] 模板名`；
3. 把生成的 JSON 贴进正文（代码块），有截图更好（用示例数据，不要真实简历）；
4. 维护者审核后代为添加文件，合并后大家刷新即可看到。

### 路径 B：Pull Request（熟悉 Git）

1. Fork 仓库并切到 `main`；
2. 新建 `market/templates/<id>.json`，把投稿 JSON 原样放进去；
3. 在 `market/index.json` 的 `templates` 数组里追加对应条目（`file`、`installs: 0`、`updatedAt` 别忘）；
4. 本地跑 `node market/validate.mjs`，必须全绿；
5. 提 PR，描述里写：模板适合谁 / 排版特点 / 示例数据来源（必须虚构）。

插件「发布到市场」对话框里的「新文件链接」可以直接打开 GitHub 的新建文件页，省得手拼路径。

## 审核标准

- A4 一页能读完（明确两页的也可以，但要在 PR 里说明）；
- 字号、留白、配色协调，截图/预览不糊；CSS 自包含、无外部依赖；
- 符合「CSS 规范」「sample 规范」，`node market/validate.mjs` 通过；
- 示例数据全部虚构，无真实个人信息、无真人照片；
- 无版权争议：CSS 自己写或来自可再分发来源，不要整段抄别人的模板；
- 维护者可能会微调 `tagline` / `tags` / `sample` 以统一市场风格。

## 维护者发布流程

1. 收到投稿 JSON → 存为 `market/templates/<id>.json`（内置那 5 条由 `node market/build.mjs` 从 `src/` 生成）；
2. 在 `market/index.json` 追加/更新条目；
3. `node market/validate.mjs` 全绿；
4. 合并到 `main`。用户端 10 分钟内自动拿到新列表（或在市场里点「刷新」强制刷新）。

## 许可

本仓库以 [MIT](../LICENSE) 发布。投稿即表示你同意该模板以 MIT 许可随插件分发；请在 PR/Issue 里确认 CSS 与示例数据由你自己创作或允许再分发。
