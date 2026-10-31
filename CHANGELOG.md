# 更新日志

本文件记录简历市场插件的版本变化。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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
