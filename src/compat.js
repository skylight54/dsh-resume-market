/**
 * 「兼容插件」：与本插件互补的简历相关 DSH 插件清单 + 安装状态检测 + 一键安装。
 *
 * 这些插件都是**独立的 DSH 插件包**，装不装由用户自己决定。本模块只做三件事：
 *  - 维护一份静态目录（COMPAT_CATALOG，想加条目改这里即可）；
 *  - 读 `~/.dsh/profiles/*\/package.json`，判断某个包在哪个 profile、装没装；
 *  - 调 DSH 自带 CLI（`dsh plugin --profile <p> add <包名>`）完成安装。
 *
 * 约束：零运行时依赖；不联网；不读写插件自己的数据文件。安装动作完全交给 DSH 插件管理器，
 * 装完需要重启 DSH 或刷新页面才会生效（插件在启动时加载）。
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** 本插件自己的包名：用来找出「已经装了简历市场」的那个 profile。 */
export const SELF_PACKAGE = 'dsh-plugin-resume-market';

/**
 * 可兼容插件目录（首批）。
 *
 * 字段：
 *  - id          接口里用的稳定 id（客户端按钮回传它）
 *  - name        npm 包名（也是判断「装没装」的依据）
 *  - kind        分类标签
 *  - tags        关键词（展示用）
 *  - blurb       一句话说明
 *  - homepage    文档 / npm 页面
 *  - installSpec 传给 `dsh plugin add` 的包名（一般等于 name）
 *  - planned     true = 还没发布，只展示不提供安装按钮
 */
export const COMPAT_CATALOG = [
  {
    id: 'resume-skills',
    name: 'dsh-resume-skills',
    kind: '技能扩展',
    tags: ['岗位关键词', '技能分级', 'ATS'],
    blurb: '简历内容与技能的检索增强：按目标岗位补关键词、把技能按熟练度分级，配合本插件写「工作经历」更省事。',
    homepage: 'https://www.npmjs.com/package/dsh-resume-skills',
    installSpec: 'dsh-resume-skills',
  },
  {
    id: 'resume-expert',
    name: 'dsh-resume-expert',
    kind: 'AI 顾问',
    tags: ['HR 视角', '简历诊断', '改写建议'],
    blurb: '资深 HR 视角的简历诊断与改写建议：逐条挑毛病，给出可以直接替换的表述。',
    homepage: 'https://www.npmjs.com/package/dsh-resume-expert',
    installSpec: 'dsh-resume-expert',
  },
  {
    id: 'cover-letter',
    name: 'dsh-cover-letter',
    kind: '求职信',
    tags: ['求职信', '邮件模板'],
    blurb: '根据简历和目标岗位生成求职信 / 自荐邮件（规划中，发布后会出现在这里）。',
    homepage: 'https://www.npmjs.com/search?q=dsh-cover-letter',
    installSpec: 'dsh-cover-letter',
    planned: true,
  },
];

/** 安装超时：pnpm 拉依赖可能很慢，给 5 分钟。 */
export const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;
/** 返回给前端的日志上限。 */
export const MAX_LOG_LINES = 400;

/** 带 HTTP 语义的错误：routes.js 会按 status 映射响应码。 */
export class CompatError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'CompatError';
    this.code = code;
    this.status = status || 500;
  }
}

/** 定位 DSH 数据目录（`~/.dsh`），支持注入以便测试。 */
export function resolveDshHome(explicit) {
  if (explicit) return String(explicit);
  if (process.env.DSH_HOME) return process.env.DSH_HOME;
  if (process.env.USERPROFILE) return join(process.env.USERPROFILE, '.dsh');
  if (process.env.HOME) return join(process.env.HOME, '.dsh');
  return join(homedir(), '.dsh');
}

function readJsonFile(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** 读一个 profile 目录的 package.json → {name, dir, dependencies, bundles}；读不到返回 null。 */
export function readProfile(dir, name) {
  const pkg = readJsonFile(join(dir, 'package.json'));
  if (!pkg || typeof pkg !== 'object') return null;
  const dependencies = pkg.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {};
  const bundles = pkg.dsh && pkg.dsh.profile && Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles : [];
  return { name: String(name || pkg.name || ''), dir, dependencies, bundles };
}

/** 扫 `~/.dsh/profiles/*\/package.json`，返回读得到的 profile 列表（按名字排序）。 */
export function detectProfiles(options = {}) {
  const dshHome = resolveDshHome(options.dshHome);
  const root = join(dshHome, 'profiles');
  let names = [];
  try {
    names = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
  const list = [];
  for (const name of names) {
    const profile = readProfile(join(root, name), name);
    if (profile) list.push(profile);
  }
  return list;
}

/**
 * 选「当前 profile」：
 *  1) 依赖或 bundles 里出现 dsh-plugin-resume-market 的那个（本插件就装在这儿）；
 *  2) 环境变量 DSH_PROFILE 指定的那个；
 *  3) 第一个。
 */
export function findActiveProfile(options = {}) {
  const profiles = Array.isArray(options.profiles) ? options.profiles : detectProfiles(options);
  const env = options.env || process.env;
  const self = profiles.find((p) => SELF_PACKAGE in p.dependencies || p.bundles.includes(SELF_PACKAGE));
  if (self) return self;
  const wanted = env.DSH_PROFILE ? String(env.DSH_PROFILE) : '';
  if (wanted) {
    const hit = profiles.find((p) => p.name === wanted);
    if (hit) return hit;
  }
  return profiles[0] || null;
}

function nodeModulesVersion(profile, name) {
  const pkg = readJsonFile(join(profile.dir, 'node_modules', name, 'package.json'));
  return pkg && typeof pkg.version === 'string' ? pkg.version : '';
}

/** 单个条目在某个 profile 里的安装状态。 */
export function statusOf(profile, item) {
  if (!profile) return { installed: false, version: '', source: '', planned: !!item.planned };
  const spec = profile.dependencies[item.name];
  const inDeps = Object.prototype.hasOwnProperty.call(profile.dependencies, item.name);
  const inBundles = profile.bundles.includes(item.name);
  const onDisk = !!nodeModulesVersion(profile, item.name);
  const version = nodeModulesVersion(profile, item.name) || (typeof spec === 'string' ? spec : '');
  return {
    installed: inDeps || inBundles || onDisk,
    version,
    source: onDisk ? 'node_modules' : inDeps ? 'dependency' : inBundles ? 'bundle' : '',
    planned: !!item.planned,
  };
}

/** 找 dsh CLI：DSH_CLI 环境变量 → 从进程可执行文件推导 DSH 安装目录 → PATH 里的 dsh。 */
export function resolveDshCli(options = {}) {
  const env = options.env || process.env;
  const exists = typeof options.exists === 'function' ? options.exists : existsSync;
  const execPath = options.execPath || process.execPath;
  const win = options.platform ? options.platform === 'win32' : process.platform === 'win32';
  if (env.DSH_CLI && exists(env.DSH_CLI)) return { command: String(env.DSH_CLI), from: 'env' };
  if (execPath) {
    const bin = join(dirname(String(execPath)), 'resources', 'runtime', 'cli', 'bin');
    const candidate = join(bin, win ? 'dsh.cmd' : 'dsh');
    if (exists(candidate)) return { command: candidate, from: 'runtime' };
  }
  return { command: win ? 'dsh.cmd' : 'dsh', from: 'path' };
}

function messageOf(error) {
  return (error && error.message) || String(error);
}

/** 默认的命令执行器：spawn + 5 分钟超时，stdout/stderr 逐行收集（最多 MAX_LOG_LINES 行）。 */
export function defaultRunner({ command, args, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const log = [];
    const push = (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (!line.trim()) continue;
        log.push(line);
        if (log.length > MAX_LOG_LINES) log.shift();
      }
    };
    const shell = process.platform === 'win32';
    // Windows 上 .cmd 必须走 shell；安装路径里可能有空格，自己加引号再交给 shell。
    const file = shell && /\s/.test(command) ? '"' + command + '"' : command;
    let child;
    try {
      child = spawn(file, args, { shell, windowsHide: true, env: process.env });
    } catch (error) {
      reject(error);
      return;
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    child.stdout.on('data', push);
    child.stderr.on('data', push);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: !timedOut && code === 0, code: timedOut ? -1 : code == null ? 1 : code, timedOut, log });
    });
  });
}

/**
 * 兼容插件总览：当前 profile、DSH 目录、CLI、每个条目的安装状态。
 * 纯读操作，不会写任何文件。
 */
export function listStatus(options = {}) {
  const dshHome = resolveDshHome(options.dshHome);
  const profiles = Array.isArray(options.profiles) ? options.profiles : detectProfiles({ dshHome });
  const active = findActiveProfile({ profiles, env: options.env });
  const cli = resolveDshCli(options);
  return {
    dshHome,
    profile: active ? active.name : '',
    profiles: profiles.map((p) => ({ name: p.name, dependencies: Object.keys(p.dependencies).length })),
    cli,
    items: COMPAT_CATALOG.map((item) => Object.assign({}, item, statusOf(active, item))),
  };
}

/** 拼出安装命令（测试与日志都用它）。 */
export function installCommand({ cli, profile, installSpec }) {
  return { command: cli.command, args: ['plugin', '--profile', profile, 'add', installSpec] };
}

/**
 * 安装一个兼容插件：`dsh plugin --profile <p> add <spec>`（转发给 profile 目录下的 pnpm）。
 *
 * 返回 { ok, code, log, skipped?, command, id, name, profile }；
 * 失败不抛错（让前端展示日志），只有「找不到 CLI / 找不到 profile / 超时」抛 CompatError。
 * `run` 可注入以便测试。
 */
export async function installPlugin(options = {}) {
  const id = options.id ? String(options.id) : '';
  const item = COMPAT_CATALOG.find((entry) => entry.id === id);
  if (!item) throw new CompatError('compat/unknown', '没有这个兼容插件：' + (id || '(空)'), 404);
  if (item.planned) {
    throw new CompatError('compat/planned', item.name + ' 还没发布，等它上线后再来装。', 400);
  }

  const dshHome = resolveDshHome(options.dshHome);
  const profiles = Array.isArray(options.profiles) ? options.profiles : detectProfiles({ dshHome });
  const active = options.profile
    ? profiles.find((p) => p.name === options.profile) || null
    : findActiveProfile({ profiles, env: options.env });
  if (!active) {
    throw new CompatError(
      'compat/no-profile',
      '没找到 DSH profile，无法自动安装。可以先在 DSH 里装任意插件生成 profile，或手动执行：' +
        'dsh plugin --profile <profile> add ' +
        item.installSpec,
      500,
    );
  }

  const status = statusOf(active, item);
  if (status.installed && !options.force) {
    return {
      ok: true,
      skipped: true,
      code: 0,
      log: [item.name + ' 已经装在 profile「' + active.name + '」里了，跳过安装。'],
      command: '',
      id: item.id,
      name: item.name,
      installSpec: item.installSpec,
      profile: active.name,
    };
  }

  const cli = resolveDshCli(options);
  const { command, args } = installCommand({ cli, profile: active.name, installSpec: item.installSpec });
  const timeoutMs = options.timeoutMs || INSTALL_TIMEOUT_MS;
  const run = typeof options.run === 'function' ? options.run : defaultRunner;

  let result;
  try {
    result = await run({ command, args, timeoutMs });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new CompatError(
        'compat/no-cli',
        '找不到 dsh 命令（' + command + '）。可以设置环境变量 DSH_CLI 指向 dsh 可执行文件，或手动执行：dsh plugin --profile ' + active.name + ' add ' + item.installSpec,
        500,
      );
    }
    throw new CompatError('compat/install-failed', '启动安装命令失败：' + messageOf(error), 502);
  }

  const log = Array.isArray(result && result.log) ? result.log.slice(-MAX_LOG_LINES) : [];
  if (result && result.timedOut) {
    const tail = log.slice(-5).join(' | ');
    throw new CompatError('compat/install-failed', '安装超时（' + Math.round(timeoutMs / 1000) + ' 秒），pnpm 可能还在下载依赖。' + (tail ? '最近输出：' + tail : ''), 502);
  }

  return {
    ok: !!(result && result.code === 0),
    code: result && typeof result.code === 'number' ? result.code : 1,
    log,
    command: command + ' ' + args.join(' '),
    id: item.id,
    name: item.name,
    installSpec: item.installSpec,
    profile: active.name,
  };
}
