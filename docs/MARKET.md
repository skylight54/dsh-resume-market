# 上架 DSH 插件市场（awesome-dsh-plugin 收录指南）

> 面向维护者。用户向的「公共模板市场」说明见 [文末附录](#附录公共模板市场用户向说明)。
>
> 一句话：收录 = 在 [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
> 里放**一个 YAML 文件** + 开**一个 PR**，README 由脚本生成。本仓库现在只差三件事：
> ① 仓库满 1 天；② GitHub 仓库打 `dsh-plugin` topic；③（推荐，非必须）发布到 npm。

## 收录是怎么发生的

1. DSH 内置插件市场（profile 里的 `dshmarket` 插件）每次打开时实时拉
   `https://awesome-dsh-plugin.com/plugins.json`；
2. 这份 registry 由上游仓库 `data/plugins/*.yml` 经 CI 构建（README、站点、清单一起生成）；
3. 条目合并后，站点与插件市场**通常一天内**自动收录，网站自动重建，不需要再做什么。

所以「收录」不是发邮件、不是填表、不是在本插件里点按钮，而是给上游仓库提一个
`data/plugins/skylight54__dsh-resume-market.yml`。

### 出处（schema 与要求的原文位置）

- 收录规则与 YAML 字段：[`awesome-dsh-plugin/awesome-dsh-plugin/contributing.md`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)
  （同一份文档也解释了 CI 三关与评审标准）
- 条目目录：[`data/plugins/`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/tree/main/data/plugins)
  （文件名 `<owner>__<repo>.yml`；README 由 `scripts/generate-readme.mjs` 生成）
- 截图：[`data/screenshots.json`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/data/screenshots.json)
- 市场侧读取逻辑与安装来源限制：本机 `~/.dsh/profiles/<profile>/node_modules/dshmarket/`
  的 `README.md`（「数据源」「提交你的插件」两节）、`lib/types/registry.d.ts`、`lib/registry.js`。
  dshmarket **只允许从这份 curated registry**（`https://awesome-dsh-plugin.com/plugins.json`）安装，
  不支持任意仓库直装；它读到的 `npm` / `tarball` / `stars` / `version` / `icon` / `capabilities`
  等字段是上游 CI 对 `data/plugins/*.yml` 补齐后的产物。**手填的只有 YAML 里的 `url` / `name` /
  `category` / `description` / 可选 `npm` / 可选 `tarball`。**


## 收录要求清单（逐条对照本仓库现状）

| # | 要求 | 说明 | 本仓库 | 证据 / 备注 |
| --- | --- | --- | --- | --- |
| 1 | `package.json` 声明 `dsh.bundle` | 只声明 `dsh.client` **不能安装**，这是最常见的被拒原因 | ✅ | `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` |
| 2 | 仓库根有 `cordis.patch.yml` | 内含 `insert` 与插件 id / 包名 | ✅ | `- id: resume-market` / `name: 'dsh-plugin-resume-market'` |
| 3 | 有真实可用代码 | 占位仓库、纯 README 不收 | ✅ | `src/`（Host + 客户端 + 共享模块）、`lib/` 构建产物、`tests/` |
| 4 | 仓库创建满 **1 天** | CI 自动查 `createdAt` | ⏳ | 首个提交 2026-10-31 20:15 +0800 → **2026-11-01 20:15 之后**才满足 |
| 5 | 提交数 **≥ 10** | CI 自动查 | ✅ | `git rev-list --count HEAD`（截至本文件写作时为 13） |
| 6 | 仓库打 `dsh-plugin` topic | 没打不会被抓取，也不会出现在任何市场 | ⏳ | GitHub 仓库页 → About 齿轮 → Topics |
| 7 | 描述属实、无营销词 | 描述里的数字/命令/API 都要能在源码里找到；夸大是打回主因 | ⚠️ 已修 | 原 `package.json` description 写「6 套内置模板」，实际 **7 套**，本任务已改 |
| 8 | 分类贴合功能 | 20 选 1，选错不打回、维护者会改 | ✅ | `ui`（备选 `market`，见下文） |
| 9 | `peerDependencies` 带预发布分支 | 范围里若含 `@deepseek-ai/*` 预发布，必须显式写 `\|\|` 分支，否则用户 `ERESOLVE` | ✅ | 当前 `"@deepseek-ai/cordis": "~4.0.4"`，无预发布范围 |
| 10 | 活跃维护 | 长期无提交会被标跟踪 issue 并移除 | ✅ | 持续开发中 |
| 11 | （可选，推荐）发布到 npm | 预构建安装免 `allowBuilds` 构建授权，体验明显更好 | ❌ 本任务已解锁 | 原 `"private": true` 阻塞 `npm publish`，已删除 |
| 12 | （可选，推荐）`data/screenshots.json` 截图 | 只接受 GitHub 托管的 https 图片，第三方图床会被构建拒绝 | ❌ | 本仓库目前只有 `previews/*.html` 静态预览，没有 PNG；不交则市场从 README 自动抽图 |

### 提交前自检（在本仓库根目录跑一遍）

```bash
# ① 必填：dsh.bundle 声明 + cordis.patch.yml
grep -q '"bundle"' package.json && echo "OK dsh.bundle" || echo "FAIL: 缺 dsh.bundle"
test -f cordis.patch.yml && echo "OK cordis.patch.yml" || echo "FAIL: 缺 cordis.patch.yml"

# ② 提交数与仓库年龄（换成你自己的仓库后跑）
git rev-list --count HEAD        # 要 ≥ 10
git log --reverse --format=%cI | head -1   # 首个提交时间，要早于今天 - 24h

# ③ 描述准确性：把条目里的数字逐个对照源码
node -e "const m=await import('./src/shared/doc.js');console.log('templates:',m.TEMPLATES.length,'basics:',Object.keys(m.DEMO_RESUME_DATA.basics).length)"
grep -c "name: 'resume_" src/tools.js   # agent 工具数

# ④ 本仓库既有检查（改动后必跑）
node tools/check.mjs
node tests/smoke.mjs
```

## 可直接粘贴的注册表条目

文件路径：`data/plugins/skylight54__dsh-resume-market.yml`
（文件名规则：`<owner>__<repo>.yml`，双下划线；monorepo 子包用 `--<子路径>`。）

**npm 已发布时**（推荐，`npm:` 字段）：

```yaml
url: https://github.com/skylight54/dsh-resume-market
name: skylight54/dsh-resume-market
category: ui
description:
  en: "Resume builder panel: seven A4 templates, personal info split into eight fields, live preview, HTML/Word/PDF export, a GitHub-backed template market, and nine agent tools for editing resumes by chat."
  zh: "简历面板：7 套 A4 模板、个人信息按 8 个字段分栏编辑、A4 实时预览、HTML/Word/PDF 导出，自带 GitHub 模板市场，并提供 9 个 agent 工具让 AI 直接改简历。"
npm: dsh-plugin-resume-market
```

**暂不发 npm 时**（用 GitHub Release 的 .tgz 兜底；两者填一个即可，也可以都不填）：

```yaml
url: https://github.com/skylight54/dsh-resume-market
name: skylight54/dsh-resume-market
category: ui
description:
  en: "Resume builder panel: seven A4 templates, personal info split into eight fields, live preview, HTML/Word/PDF export, a GitHub-backed template market, and nine agent tools for editing resumes by chat."
  zh: "简历面板：7 套 A4 模板、个人信息按 8 个字段分栏编辑、A4 实时预览、HTML/Word/PDF 导出，自带 GitHub 模板市场，并提供 9 个 agent 工具让 AI 直接改简历。"
tarball: https://github.com/skylight54/dsh-resume-market/releases/latest/download/dsh-plugin-resume-market.tgz
```

写法要点：

- `description.en` 是**唯一必填**描述，一句话、以句号结尾；`zh` 可以空着让维护者补；
- 描述里含 `: `（冒号+空格）必须给整个字符串加引号，否则 YAML 解析失败；
- `url` 必须与仓库**完全一致**（大小写、不要 `.git`、不要 `/tree/main`）；
- **不要写「怎么安装」**——列表只说「做什么」，安装方式市场自动生成；
- `category` 选最贴近的一个即可，选错维护者会直接改，不会因此打回。本项目是「简历编辑面板」，
  选 `ui`；如果将来定位成「模板/插件分发」，可改 `market`（`market` 专指插件市场 / 管理器 / 注册表）。

## 提 PR 的完整步骤

```bash
# 0. 前提：仓库已满 1 天、提交数 ≥ 10、GitHub 上打了 dsh-plugin topic

# 1. fork 并克隆上游仓库
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --remote=true
git clone https://github.com/<你的 GitHub 用户名>/awesome-dsh-plugin.git
cd awesome-dsh-plugin
npm ci                                   # 安装 scripts/generate-readme.mjs 的依赖
git checkout -b add-skylight54-dsh-resume-market

# 2. 新建条目文件（内容见上一节）
mkdir -p data/plugins
#   写入 data/plugins/skylight54__dsh-resume-market.yml

# 3.（可选，推荐）加截图：data/screenshots.json 里以条目 URL 为 key 追加
#    { "https://github.com/skylight54/dsh-resume-market": [
#        "https://raw.githubusercontent.com/skylight54/dsh-resume-market/main/previews/xxx.png" ] }
#    只接受 GitHub 托管的 https 图片，第三方图床会被构建拒绝

# 4. 重新生成两个 README（禁止手改）
node scripts/generate-readme.mjs
git diff README.md README.zh.md        # 确认只有自己那一行变动

# 5. 提交（只 add 自己的文件，别动别人的条目）
git add data/plugins/skylight54__dsh-resume-market.yml README.md README.zh.md
git commit -m "Add skylight54/dsh-resume-market - category: ui - dsh.bundle: present"
git push origin add-skylight54-dsh-resume-market

# 6. 开 PR
gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin \
  --title "Add skylight54/dsh-resume-market" \
  --body "Adds my plugin: dsh-plugin-resume-market
- Resume builder panel: 7 A4 templates, 8-field personal info, live preview, HTML/Word/PDF export, GitHub template market, 9 agent tools
- dsh.bundle declared, cordis.patch.yml in repo root
- Repo: https://github.com/skylight54/dsh-resume-market"
```

PR 标题保持 `Add <owner>/<repo>` 形式，正文只写「插件做什么 + 自检通过的项目」。

### CI 三关与被打回怎么办

1. **`dsh.bundle` 检查**：根包或 `packages/`、`plugins/`、`apps/` 子包的 `package.json` 里找
   `dsh.bundle`；缺失直接挂（最常见）。
2. **仓库年龄 / 提交数**：`createdAt` ≥ 1 天、`commit count` ≥ 10；不到就先把功能做完再提，
   重新提交不会有任何影响。
3. **awesome-lint + 站点构建**：YAML 格式、双语文案（不含 `:` 引号错误）、分类是否合法、
   截图 URL 是否 GitHub 托管。

失败会在 PR 评论里指到具体哪一行；**在同一个分支上改完再 push** 即可，不需要重开 PR。
分类不对、措辞风格不合口味都**不会**打回，只有「描述夸大（源码里找不到对应数字/API）」才是真问题。

合并后：网站自动重建 → 插件市场（`dshmarket`）下一次拉清单就能搜到，用户点「安装」即可。

## 本次为收录做的仓库改动

- `package.json`：删掉阻塞发布的 `"private": true`；`description` 从「6 套内置模板」改成实际的
  **7 套**并补上导出格式（其余字段未动）。
- `README.md`：安装段补一行「发布到 npm 后可从 DSH 插件市场安装」，并指向本文件。
- `docs/MARKET.md`：新增这篇收录指南；原来的「公共模板市场」用户向说明保留为附录（README 与
  CHANGELOG 里的旧链接继续有效）。
- 未改动 `src/`、`lib/`、`tests/`、`market/`。

## 发布到 npm 前的检查清单

- [x] `package.json` 删掉 `"private": true`（否则 `npm publish` 直接报
      `This package has been marked as private`）；
- [ ] `npm view dsh-plugin-resume-market` 确认包名没被占用（本机网络受限时可在 npm 网站搜）；
- [ ] `npm pack --dry-run` 检查包内容：`files` 白名单是 `src`、`lib`、`locale`、`server`、
      `icon.svg`、`cordis.patch.yml`、`README.md`、`package.json`；`LICENSE` 由 npm 自动包含；
      `market/`、`docs/`、`previews/`、`tests/` 不进包（README 里指向 `docs/` 的链接在 npm 页面上不可点，
      这是已知取舍）；
- [ ] 版本号：本次沿用 `0.9.0`；之后按功能走 semver，打 tag 与 GitHub Release；
- [ ] `npm login`（需要 2FA）后 `npm publish --access public`；
- [ ] 发布成功后，把条目 YAML 的 `npm:` 字段填成 `dsh-plugin-resume-market`；
- [ ]（可选）打 `v0.9.0` tag + GitHub Release，附 `npm pack` 生成的 `.tgz`，作为 `tarball:` 兜底。

## 常见问题

**收录后多久能在插件市场看到？**
合并 PR 之后网站自动重建，通常一天内；插件市场有缓存，重开 DSH 或点刷新即可。

**会被打回吗？哪些情况会被打回？**
缺 `dsh.bundle`、仓库不满 1 天、提交数 < 10、没打 `dsh-plugin` topic、描述与代码不符、
YAML 写坏、截图 URL 非 GitHub 托管。分类不合适、措辞不好看都不打回。

**能被动下架吗？**
长期不维护、仓库归档、插件不可用会被维护者标跟踪 issue 并移除。被收录不是永久权益。

**本插件的「公共模板市场」和这个收录是一回事吗？**
不是。`market/` 是本插件自己的**简历模板**池（见附录）；DSH 插件市场收录的是**插件本身**。

---

## 附录：公共模板市场（用户向说明）

> 用户向说明。想直接投稿/维护数据？技术细节在 [`market/README.md`](../market/README.md)。

### 这是什么

「公共市场」是插件里那个**不经过任何服务器、由 GitHub 托管**的模板池：所有模板都是 `skylight54/dsh-resume-market` 仓库 [`market/`](../market/) 目录里的 JSON 文件。插件启动后从 GitHub 拉一份列表（本地缓存 10 分钟），点「安装」时再拉对应模板文件。

好处：模板可以大家一起攒，装插件就能用，作者能留名，也不需要谁维护一台服务器。

### 怎么用

1. 侧栏打开 **简历市场** → **模板市场** 页签；
2. 顶部把视图从「本地面板」切到 **公共市场**（标题是「公共市场 · GitHub」）；
3. 第一次进入会自动拉列表，之后 10 分钟内用缓存；想立刻同步新投稿就点 **刷新**；
4. 卡片右下角 **安装**，安装后的模板出现在 **模板** 页签，新建/换模板时直接选；
5. 卡片上的 ♥ 只记在你本机（公共市场没有账号体系，不做服务端计数）；
6. 网络不通时会显示上次缓存，并标注「当前显示离线缓存」。

不想点界面也可以直接跟 AI 说：

- 「列出公共市场有哪些模板」→ 插件里的 `resume_market_public`
- 「从公共市场安装 rm-tech-grid」→ `resume_install_public`
- 「把当前简历投稿到公共市场，署名 小明」→ `resume_publish_public`（生成投稿文件 + 两个 GitHub 链接）

### 现在有哪些模板

| id | 名称 | 作者 | 适合 |
| --- | --- | --- | --- |
| `rm-academia` | 学术科研 | 大肥鱼 | 博士、科研、教职申请 |
| `rm-finance` | 金融投行 | 大肥鱼 | 投行、券商、咨询 |
| `rm-vibrant` | 活力橙 | 大肥鱼 | 互联网、运营、设计 |
| `rm-quiet-luxury` | 静奢蓝灰 | 简历市场 | 产品、咨询、资深岗位 |
| `rm-tech-grid` | 科技网格 | 简历市场 | 研发、数据、算法 |

每套模板在仓库 `previews/` 下都有对应的静态预览页（如 `previews/seed-academia.html`），打开就能看排版效果。

<!-- 截图占位：公共市场页面截图补充到 docs/images/market-public.png 后，
     把上面这段替换为 ![公共市场](images/market-public.png)（截图请用示例数据，不要截图真实简历）。 -->

### 怎么投稿

投稿就是**往仓库里提一个文件**。两种路径，选顺手的：

#### 路径 A：发 GitHub Issue（推荐，不用懂 Git）

1. 在插件里把一份简历调成你想要的样子（版式/字体/配色都算模板的一部分）；
2. 打开「发布到市场」对话框，生成**公共投稿**数据（或让 AI 调用 `resume_publish_public`）；
3. 到 [新建 Issue](https://github.com/skylight54/dsh-resume-market/issues/new)：
   - 标题：`[模板投稿] 你的模板名`
   - 正文：贴生成的 JSON（放在代码块里），再补两句话——这个模板适合谁、有什么特点；
4. 维护者审核后会加进仓库并合并。合并后所有人在市场里点 **刷新** 就能看到。

> 投稿 JSON 里的示例简历数据请保持虚构（电话 `138 0013 8000`、邮箱 `@example.com`），不要贴自己或别人的真实简历。

#### 路径 B：提 Pull Request（熟悉 Git 用这个）

1. Fork `https://github.com/skylight54/dsh-resume-market`，在 `main` 上操作；
2. 把投稿 JSON 存成 `market/templates/<id>.json`（`id` 形如 `rm-your-style`）；
3. 在 `market/index.json` 的 `templates` 数组里追加一条（`file` 指向上面的文件、`installs` 填 `0`、`updatedAt` 填当前时间）；
4. 本地跑 `node market/validate.mjs`，必须通过；
5. 发 PR：说明模板定位、排版特点，示例数据是虚构的。

插件「发布到市场」对话框生成的投稿里已经带了 `repoPath`（该放哪个路径）和「新建文件」链接，省得手拼。

两句话的投稿规则（详细版见 [`market/README.md`](../market/README.md)）：

- **版式**：A4 一页能读完；字号/留白协调；CSS 必须自包含（系统字体、不引外链资源）；
- **不要放真实个人信息**：姓名、电话、邮箱、公司内部信息、真人照片都换成示例/留空；
- **不要抄**：CSS 和示例内容得是你自己写的或允许再分发的；投稿即同意以 MIT 许可随插件分发。

截图放在 Issue/PR 描述里就行，用示例数据截图，别截真实简历。

### 更新或下架

- **改自己的模板**：再发一个 Issue/PR，更新 `market/templates/<id>.json` 并把 `index.json` 里该条的 `updatedAt` 改掉；
- **撤下模板**：发 Issue 说明 id 和原因，维护者删除文件和列表条目。已经安装到别人本机的副本不受影响（那是用户的本地数据）。

### 常见问题

**刷新失败/一直是缓存？**
先确认网络能打开 GitHub；GitHub 对匿名请求有频率限制，碰到 403 等一会儿再点刷新即可。默认读的是 `skylight54/dsh-resume-market` 的 `main` 分支。

**安装完模板在哪？**
「简历市场 → 模板」页签。之后新建简历或在编辑器里换模板都能选到它。

**公共市场和「本地面板」有什么区别？**
「本地面板」是**你本机已经有的**模板（内置的 + 已安装的 + 你自己发布的）；「公共市场」是 GitHub 上**还没装到你机器上**的模板池，装下来才会进本地面板。

**能用自己团队的私有市场吗？**
可以，插件设置里市场仓库（`githubRepo`）和分支（`githubBranch`）默认指向官方仓库，改成你 fork 的仓库和分支即可（这两项目前没有设置界面输入框，可让 AI 助手或维护者协助修改）。

**为什么点赞数不涨？**
点赞/安装数目前只是卡片展示信息，不联网统计——没有服务端，也没有账号体系。

### 相关文档

- [插件安装与卸载](INSTALL.md)
- [参与开发](../CONTRIBUTING.md)
- [版本历史](../CHANGELOG.md)
- [投稿技术规范](../market/README.md)
