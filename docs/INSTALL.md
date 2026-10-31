# 安装指南 · Installation

把「简历市场」插件装进 DSH（DeepSeek Harness）。插件目录就是仓库根目录，DSH 直接从这个
目录装载，**不需要**编译客户端（`lib/client.js` 已随仓库提交）。

## 前置要求

- 已安装 DSH（Web 或 TUI 版）
- Node.js **>= 20**（`node -v` 确认；仓库用 Node 22 验证）
- Git（想用 `git clone` 更新时才需要；也可以直接下载 ZIP）

## 方式一：从 GitHub 克隆后安装（推荐）

```bash
git clone https://github.com/skylight54/dsh-resume-market.git
cd dsh-resume-market

# 包形状自检，应当输出「✓ 包形状检查通过」（只读检查，不改任何东西）
node tools/check.mjs
```

Windows（Git Bash 或 PowerShell）：

```powershell
git clone https://github.com/skylight54/dsh-resume-market.git D:\plugins\dsh-resume-market
cd D:\plugins\dsh-resume-market
node tools\check.mjs
```

> `skylight54` 是仓库所有者的 GitHub 用户名，克隆地址以项目主页实际地址为准。
> 克隆目录里可以顺便放在任意位置，安装时要用它的**绝对路径**。
> 如果 `lib/client.js` 缺失（比如下载的是源码包），先执行一次 `node build/build.mjs`。

### 装进 DSH

**图形界面（推荐）**：在 DSH 对话里让模型安装插件，等价于调用
`plugin_manager` 工具的 `install_bundle`，`target` 传克隆目录的绝对路径：

| 平台 | target 示例 |
| --- | --- |
| Windows | `D:\plugins\dsh-resume-market` |
| Windows（用户目录） | `C:\Users\<你的用户名>\Documents\dsh-resume-market` |
| macOS / Linux | `/Users/<you>/plugins/dsh-resume-market` |

**命令行**（`dsh` 在 PATH 上时；`--profile` 填你正在用的 profile，Web 版一般是 `web`）：

```bash
# Windows（Git Bash 用正斜杠；PowerShell / cmd 里写 file:D:\plugins\dsh-resume-market 也行）
dsh plugin --profile web add file:D:/plugins/dsh-resume-market
# macOS / Linux
dsh plugin --profile web add file:/Users/you/plugins/dsh-resume-market
```

安装完成后**刷新 DSH Web 页面**（`Ctrl+R`，或重新打开 DSH）。左侧栏会出现「简历市场」图标，
点开即主面板。

### 验证安装

1. 左侧栏出现「简历市场」图标，能打开面板；
2. `plugin_manager list_plugins` 里能看到 `dsh-plugin-resume-market` 且为启用状态；
3. agent 侧有 6 个 `resume_*` 工具（`resume_market_list` / `resume_save` / `resume_export` /
   `resume_publish` / `resume_import_template` / `resume_list_templates`）；
4. 面板里随便建一份简历，能预览、能导出（导出文件在 `~/.dsh/resume-market/exports/`）。

## 方式二：从 GitHub Release 的 ZIP 安装

1. 在仓库的 Releases 页下载 `dsh-resume-market-<version>.zip`（或 Source code (zip)）；
2. 解压到固定目录，例如 `D:\plugins\dsh-resume-market`；
3. 按照上面「装进 DSH」的步骤，用该目录的绝对路径安装。

## 更新

```bash
cd D:/plugins/dsh-resume-market
git pull
node tools/check.mjs   # 可选：确认包形状没问题
```

然后在 DSH 里重新执行一次 `plugin_manager install_bundle`（或重启 DSH），并刷新页面。
本地数据（简历、设置、市场缓存）在 `~/.dsh/resume-market/`，`git pull` 不会动它。

## 卸载

- 图形界面：`plugin_manager` 的 `remove_bundle`，`target` 填 `dsh-plugin-resume-market`；
  只想临时停用就 `set_bundle` / `set_plugin` 设 `enabled: false`。
- 命令行：`dsh plugin --profile web remove dsh-plugin-resume-market`。
- 卸载**不会**删除你的简历数据。要彻底清干净，再手动删除 `~/.dsh/resume-market/`
  （Windows 下是 `C:\Users\<你的用户名>\.dsh\resume-market\`）。

## 常见问题

- **侧栏没有图标**：安装后没刷新页面；或 `plugin_manager list_plugins` 里是 disabled。
- **`node tools/check.mjs` 报 client 产物缺失**：仓库里应有 `lib/client.js`，缺失时跑
  `node build/build.mjs` 生成。
- **安装时提示路径不存在**：`target` 要用绝对路径，不要写 `~` 或相对路径；
  Git Bash 里 `/d/plugins/...` 这类路径要换成 `D:\plugins\...` 或 `D:/plugins/...`。
- **模板市场连不上**：远端市场是可选的自建服务，默认用本地种子市场；
  需要远端时在插件「设置」页填市场地址（见 `server/README.md`）。
