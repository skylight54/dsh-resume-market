# 发布流程 · Release

本文档把「简历市场」插件从本地工程发到 GitHub 的完整步骤。仓库地址已经按
`skylight54/dsh-resume-market` 填好；如果你把仓库建在别的账号/名字下，先把全文的
`skylight54/dsh-resume-market` 换成实际地址。

## 0. 一次性准备

1. **核对仓库地址**：`package.json` 的 `repository` / `homepage` / `bugs`，以及
   `README.md`、`docs/INSTALL.md`、`CONTRIBUTING.md` 里的克隆地址都指向
   `github.com/skylight54/dsh-resume-market`。换账号时搜索替换即可：

   ```bash
   grep -rn 'skylight54/dsh-resume-market' --exclude-dir=node_modules --exclude-dir=.devrender .
   ```

2. **配置 git 身份**（只需一次，全局或本仓库）：

   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"
   ```

3. 确认 `node -v` >= 20。

## 1. 首次发布前检查清单

逐项打勾后再提交：

- [ ] `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'));console.log('json ok')"`
      输出 `json ok`
- [ ] 改过 `src/client/` 或 `src/shared/doc.js` 时已重跑 `node build/build.mjs`，
      且 `lib/client.js`、`lib/client.meta.json` 是新的
- [ ] `node tools/check.mjs` 输出「✓ 包形状检查通过」
- [ ] `node tests/smoke.mjs`、`node tests/pdf.mjs` 全绿
- [ ] 装了 `.devrender` 依赖时：`node tests/render.mjs`、`node tests/mount.mjs` 全绿
- [ ] `node server/smoke.mjs` 全绿
- [ ] `CHANGELOG.md` 有当前版本条目（顶部 `## vX.Y.Z — YYYY-MM-DD`），内容与实际功能一致
- [ ] `LICENSE` 存在且版权行正确（`Copyright (c) 2026 Resume Market contributors`）
- [ ] `README.md` 的安装命令、截图路径、功能列表已更新
- [ ] 仓库地址统一为 `github.com/skylight54/dsh-resume-market`（改过账号/仓库名的话全局搜一遍）
- [ ] `git status` 里**没有** `node_modules/`、`.devrender/node_modules/`、`.devrender/.npmcache/`、
      `*.log`、`.tmp-*`、`~/.dsh/resume-market/` 数据、`server/market-data.json`
- [ ] `previews/` 里的模板预览是最新的（改过模板时重跑 `node tools/previews.mjs`）

## 2. 初始化仓库并提交

工程根就是仓库根目录：

```bash
cd resume-market

git init -b main
git add -A
git status --short        # 对照上面的清单过一遍，确认没有误加文件
git commit -m "feat: resume market plugin v0.1.0"
```

> 如果目录已经在一个 git 仓库里（`git rev-parse --show-toplevel` 能返回路径），
> 就跳过 `git init`，直接 `git add` / `git commit`，不要嵌套建仓。

## 3. 创建 GitHub 仓库并推送

1. 在 GitHub 新建 **public** 仓库 `dsh-resume-market`。
   **不要**勾选「Add a README file / .gitignore / license」——任何初始化提交都会让首次 push
   需要先 pull 合并。仓库有了但为空即可。
2. 加远端并推送：

   ```bash
   git remote add origin https://github.com/skylight54/dsh-resume-market.git
   git branch -M main
   git push -u origin main
   ```

3. 检查 GitHub 页面：文件齐、`LICENSE` 被识别为 MIT、图片（如有）能正常显示。

## 4. 打 tag 并发布 Release

```bash
git tag -a v0.1.0 -m "resume market plugin v0.1.0"
git push origin v0.1.0
```

在 GitHub 的 Releases 页 `Draft a new release`：

- Tag：选 `v0.1.0`；Release title：`v0.1.0 — 简历市场首个版本`
- 说明可以直接粘贴 `CHANGELOG.md` 的 `v0.1.0` 段落
- 可选附件：从仓库导出一个 zip，方便不熟悉 git 的用户直接下载安装：

  ```bash
  git archive --format=zip --prefix=dsh-resume-market-0.1.0/ -o dsh-resume-market-0.1.0.zip HEAD
  ```

  上传这个 zip 即可（GitHub 自动生成的 Source code (zip) 也能用）。

## 5. 别人怎么安装

发布后，任何 DSH 用户：

```bash
git clone https://github.com/skylight54/dsh-resume-market.git
cd dsh-resume-market
node tools/check.mjs
```

然后在 DSH 里用 `plugin_manager install_bundle`，`target` 填克隆目录的绝对路径
（如 `D:\plugins\dsh-resume-market`）；或 CLI：

```bash
dsh plugin --profile web add file:D:/plugins/dsh-resume-market
```

装完刷新 DSH Web 页面，左侧栏出现「简历市场」。
完整步骤（含 Windows 路径、更新、卸载）见 [INSTALL.md](INSTALL.md)。

## 6. 发布后验证（强烈建议）

在**干净环境**里走一遍：

1. 新目录 `git clone` 仓库；
2. `node tools/check.mjs` 通过；
3. `plugin_manager install_bundle` 安装 → 刷新页面 → 侧栏图标出现；
4. 新建一份简历 → A4 预览正常 → 导出 HTML / Word / PDF 各一次；
5. 打开「模板市场」→ 本地种子条目可见；
6. agent 侧 `resume_list_templates` 能返回模板清单。

## 7. 版本号规则

- 遵循语义化版本：新功能 `0.x.0`、修 bug `0.x.y`；`1.0.0` 之后再谈稳定 API。
- 改动同时更新 `package.json` 的 `version` 和 `CHANGELOG.md` 顶部条目，再打同名 tag。
- `package.json` 的 `files` 白名单决定装进插件包的内容；新增运行时文件记得加进去
  （测试、`previews/`、`.devrender/`、`docs/` 不需要进包）。

## 常见问题

- **`git push` 被拒（non-fast-forward）**：建仓时勾选了自动初始化文件。先
  `git pull --rebase origin main` 合并，再 push；或者删库重建空仓库。
- **check.mjs 报 client 产物缺失 / id 不一致**：先 `node build/build.mjs`；`package.json`
  的 `name` 不要改（`lib/client.js` 里的 module id 和 `cordis.patch.yml` 都依赖它）。
- **Windows 上换行警告**：可设 `git config core.autocrlf true`；`.gitattributes` 暂未启用。
- **想用私有仓库 / 自建分发**：把 `github.com/skylight54/dsh-resume-market` 换成企业主机地址即可，
  `plugin_manager install_bundle` 支持任意本地目录路径。
