/**
 * Resume Market — 「兼容插件」测试（Host 侧）。
 *
 * 覆盖三块，全程零网络、零真实安装：
 *  1) profile 检测：临时 ~/.dsh 里造 profile，验证 detectProfiles / findActiveProfile / statusOf / listStatus；
 *  2) 安装逻辑：注入假 run，验证命令拼接、成功/失败/超时/找不到 CLI/未知 id/未发布/已装跳过；
 *  3) 路由：假 ctx + 假 store 驱动 GET /compat/state 与 POST /compat/install 的 200/400/404。
 *
 * Run: node tests/compat.mjs
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  COMPAT_CATALOG,
  CompatError,
  INSTALL_TIMEOUT_MS,
  OWN_TOOL_NAMES,
  SELF_PACKAGE,
  capabilitiesOf,
  detectProfiles,
  findActiveProfile,
  installCommand,
  installPlugin,
  listStatus,
  resolveDshCli,
  statusOf,
} from '../src/compat.js';
import { createHandler, PREFIX } from '../src/routes.js';

const itemById = (id) => COMPAT_CATALOG.find((item) => item.id === id);

/** 写一个 profile 的 package.json（+ 可选 node_modules 里的包）。 */
async function makeProfile(root, name, pkg, installed = {}) {
  const dir = join(root, 'profiles', name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  for (const [depName, version] of Object.entries(installed)) {
    const depDir = join(dir, 'node_modules', depName);
    await mkdir(depDir, { recursive: true });
    await writeFile(join(depDir, 'package.json'), JSON.stringify({ name: depName, version }));
  }
  return dir;
}

async function expectCompatError(promise, code, status) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof CompatError, '应该抛 CompatError，实际：' + error);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  });
}

/** 假 HTTP 请求：readJsonBody 监听 data/end，所以异步发出请求体。 */
function makeReq({ method = 'GET', url = '', headers = {}, body = null } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = Object.assign({ host: '127.0.0.1:59568' }, headers);
  req.destroy = () => {};
  setTimeout(() => {
    if (body !== null) {
      req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
    }
    req.emit('end');
  }, 0);
  return req;
}

function makeRes() {
  const out = { status: 0, headers: null, body: '' };
  return {
    out,
    res: {
      writeHead(status, headers) {
        out.status = status;
        out.headers = headers;
      },
      end(chunk) {
        out.body = chunk ? String(chunk) : '';
      },
    },
  };
}

function makeCtx() {
  return {
    get: () => undefined,
    logger: { warn: () => {}, info: () => {} },
  };
}

function makeStore() {
  return {
    file: 'C:/tmp/resume-market/store.json',
    whenReady: async () => {},
    settings: () => ({}),
    snapshot: () => ({ settings: {} }),
    listTemplates: () => [],
    githubState: () => ({ likes: {} }),
  };
}

const tempDirs = [];
async function makeDshHome() {
  const root = await mkdtemp(join(tmpdir(), 'rm-compat-'));
  tempDirs.push(root);
  return root;
}

try {
  // ── 1. profile 检测 ──────────────────────────────────────────────────────
  const dshHome = await makeDshHome();
  await makeProfile(dshHome, 'alpha', { name: 'alpha-profile', dependencies: { 'dsh-resume-screening': '^0.3.0' } }, {
    'dsh-resume-screening': '0.3.1',
  });
  const betaDir = await makeProfile(
    dshHome,
    'beta',
    {
      name: 'beta-profile',
      dependencies: { [SELF_PACKAGE]: 'link:C:/work/resume-market' },
      dsh: { profile: { bundles: [SELF_PACKAGE] } },
    },
    { '@xrxs-ai/dsh-resume-migrator': '1.2.3' },
  );
  // 坏 profile（没有 package.json）应被跳过
  await mkdir(join(dshHome, 'profiles', 'broken'), { recursive: true });

  const profiles = detectProfiles({ dshHome });
  assert.deepEqual(
    profiles.map((p) => p.name),
    ['alpha', 'beta'],
    'detectProfiles 应按名字排序并跳过读不到 package.json 的目录',
  );
  assert.equal(profiles[1].dir, betaDir);

  const active = findActiveProfile({ profiles, env: {} });
  assert.equal(active.name, 'beta', '装了本插件的 profile 优先');
  assert.deepEqual(profiles[1].bundles, [SELF_PACKAGE], 'bundles 应从 dsh.profile.bundles 读');

  // 没有 self 包时：DSH_PROFILE → 第一个
  const plainHome = await makeDshHome();
  await makeProfile(plainHome, 'gamma', { name: 'gamma', dependencies: {} });
  await makeProfile(plainHome, 'zulu', { name: 'zulu', dependencies: {} });
  const plainProfiles = detectProfiles({ dshHome: plainHome });
  assert.deepEqual(plainProfiles.map((p) => p.name), ['gamma', 'zulu']);
  assert.equal(findActiveProfile({ profiles: plainProfiles, env: {} }).name, 'gamma', '没有 self 包时取第一个');
  assert.equal(
    findActiveProfile({ profiles: plainProfiles, env: { DSH_PROFILE: 'zulu' } }).name,
    'zulu',
    'DSH_PROFILE 生效',
  );
  assert.equal(
    findActiveProfile({ profiles: plainProfiles, env: { DSH_PROFILE: 'nope' } }).name,
    'gamma',
    'DSH_PROFILE 指向不存在的 profile 时回退第一个',
  );

  // statusOf：依赖 + node_modules 版本
  const skills = itemById('resume-screening');
  const expert = itemById('resume-migrator');
  const cover = itemById('resume-core');
  const beta = profiles[1];
  const expertStatus = statusOf(beta, expert);
  assert.equal(expertStatus.installed, true, 'node_modules 里有包就算已安装');
  assert.equal(expertStatus.version, '1.2.3');
  assert.equal(expertStatus.source, 'node_modules');
  assert.equal(statusOf(beta, skills).installed, false, 'beta 没装 resume-screening');
  assert.equal(statusOf(null, cover).planned, true);

  // listStatus：当前 profile + 条目状态
  const snapshot = listStatus({ dshHome, env: {} });
  assert.equal(snapshot.profile, 'beta');
  assert.equal(snapshot.dshHome, dshHome);
  assert.equal(snapshot.items.length, COMPAT_CATALOG.length);
  assert.deepEqual(
    snapshot.items.map((item) => item.id),
    ['resume-screening', 'resume-migrator', 'resume-warehouse', 'resume-core'],
  );
  assert.equal(snapshot.items.find((item) => item.id === 'resume-migrator').installed, true);
  assert.equal(snapshot.items.find((item) => item.id === 'resume-core').planned, true);
  assert.deepEqual(snapshot.profiles.map((p) => p.name), ['alpha', 'beta']);
  assert.equal(snapshot.toolsKnown, 0, '没传 tools 时 capabilities 为空、toolsKnown=0');

  // ── 1b. 能力发现：从宿主工具清单里认出兼容插件提供的工具 ──────────────────
  const hostTools = [
    // 本插件自己的工具：必须被排除
    { name: 'resume_save', description: '保存简历到本地' },
    { name: 'resume_export', description: '导出简历为 HTML / Word / PDF' },
    // 兼容插件注册的工具
    { name: 'resume_screen_upload', description: '批量筛选简历：把候选人简历入库并按技能分类' },
    { name: 'resume_import_batch', description: '批量导入 / 迁移旧简历，带迁移队列' },
    { name: 'resume_warehouse_health', description: '本地简历仓库：读取本地服务健康状态' },
    { name: 'unrelated_weather', description: '查天气，跟简历无关' },
  ];
  const screeningCaps = capabilitiesOf(itemById('resume-screening'), hostTools);
  assert.deepEqual(
    screeningCaps.map((cap) => cap.name),
    ['resume_screen_upload'],
    '应该只认出筛选插件自己的工具',
  );
  assert.deepEqual(
    capabilitiesOf(itemById('resume-migrator'), hostTools).map((cap) => cap.name),
    ['resume_import_batch'],
  );
  assert.deepEqual(
    capabilitiesOf(itemById('resume-warehouse'), hostTools).map((cap) => cap.name),
    ['resume_warehouse_health'],
  );
  assert.equal(
    capabilitiesOf(itemById('resume-screening'), hostTools).some((cap) => OWN_TOOL_NAMES.includes(cap.name)),
    false,
    '本插件自己的工具不能被算成兼容能力',
  );
  assert.equal(capabilitiesOf(itemById('resume-screening'), []).length, 0);
  assert.equal(capabilitiesOf(itemById('resume-screening'), null).length, 0);
  assert.equal(capabilitiesOf(null, hostTools).length, 0);

  const withTools = listStatus({ dshHome, env: {}, profiles, tools: hostTools });
  assert.equal(withTools.toolsKnown, hostTools.length);
  const migrator = withTools.items.find((item) => item.id === 'resume-migrator');
  assert.equal(migrator.installed, true);
  assert.equal(migrator.hasTools, true, '已安装且能对上工具时 hasTools=true');
  assert.deepEqual(migrator.capabilities.map((cap) => cap.name), ['resume_import_batch']);
  const notInstalled = withTools.items.find((item) => item.id === 'resume-screening');
  assert.equal(notInstalled.installed, false);
  assert.equal(notInstalled.hasTools, false, '没安装就不该显示能力');
  assert.deepEqual(notInstalled.capabilities, []);
  assert.match(notInstalled.toolsHint, /装完需要重启 DSH|^$/, '未安装时 toolsHint 为空');
  const warehouse = withTools.items.find((item) => item.id === 'resume-warehouse');
  assert.equal(warehouse.toolsHint.includes('重启 DSH'), false, '未安装条目不提示重启');

  // ── 2. CLI 定位 + 安装逻辑 ────────────────────────────────────────────────
  assert.deepEqual(
    resolveDshCli({ env: { DSH_CLI: 'C:/custom/dsh.cmd' }, exists: () => true, platform: 'win32' }),
    { command: 'C:/custom/dsh.cmd', from: 'env' },
  );
  const runtimeCli = join('C:', 'DSH', 'resources', 'runtime', 'cli', 'bin', 'dsh.cmd');
  assert.deepEqual(
    resolveDshCli({
      env: {},
      platform: 'win32',
      execPath: join('C:', 'DSH', 'DeepSeek Harness.exe'),
      exists: (path) => path === runtimeCli,
    }),
    { command: runtimeCli, from: 'runtime' },
  );
  assert.deepEqual(resolveDshCli({ env: {}, platform: 'linux', execPath: '/opt/dsh/dsh', exists: () => false }), {
    command: 'dsh',
    from: 'path',
  });

  const cli = { command: 'dsh.cmd', from: 'path' };
  assert.deepEqual(
    installCommand({ cli, profile: 'beta', installSpec: 'dsh-resume-screening' }),
    { command: 'dsh.cmd', args: ['plugin', '--profile', 'beta', 'add', 'dsh-resume-screening'] },
    '安装命令 = dsh plugin --profile <p> add <包名>',
  );

  const calls = [];
  const okRun = async (args) => {
    calls.push(args);
    return { ok: true, code: 0, log: ['scope: all 3 workspace projects', 'Progress: resolved 1, reused 1, downloaded 0'] };
  };
  const installed = await installPlugin({
    id: 'resume-screening',
    dshHome,
    profiles,
    env: {},
    cli,
    run: okRun,
    timeoutMs: INSTALL_TIMEOUT_MS,
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['plugin', '--profile', 'beta', 'add', 'dsh-resume-screening']);
  assert.equal(calls[0].command, 'dsh.cmd');
  assert.equal(calls[0].timeoutMs, INSTALL_TIMEOUT_MS);
  assert.equal(installed.ok, true);
  assert.equal(installed.code, 0);
  assert.equal(installed.profile, 'beta');
  assert.equal(installed.id, 'resume-screening');
  assert.equal(installed.name, 'dsh-resume-screening');
  assert.match(installed.command, /^dsh\.cmd plugin --profile beta add dsh-resume-screening$/);
  assert.equal(installed.log.length, 2);

  const failed = await installPlugin({
    id: 'resume-screening',
    dshHome,
    profiles,
    env: {},
    cli,
    run: async () => ({ ok: false, code: 1, log: ['ERR_PNPM_FETCH_404  not found'] }),
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 1);
  assert.deepEqual(failed.log, ['ERR_PNPM_FETCH_404  not found']);

  // 已装：跳过，不再执行命令
  const skippedCalls = [];
  const skipped = await installPlugin({
    id: 'resume-migrator',
    dshHome,
    profiles,
    env: {},
    cli,
    run: async () => {
      skippedCalls.push(1);
      return { ok: true, code: 0, log: [] };
    },
  });
  assert.equal(skipped.skipped, true);
  assert.equal(skipped.ok, true);
  assert.equal(skippedCalls.length, 0, '已安装不该再跑安装命令');

  await expectCompatError(
    installPlugin({
      id: 'resume-screening',
      dshHome,
      profiles,
      env: {},
      cli,
      run: async () => ({ ok: false, code: -1, timedOut: true, log: ['Progress: resolved 12', 'still downloading'] }),
    }),
    'compat/install-failed',
    502,
  );
  const enoent = new Error('spawn dsh.cmd ENOENT');
  enoent.code = 'ENOENT';
  await expectCompatError(
    installPlugin({ id: 'resume-screening', dshHome, profiles, env: {}, cli, run: async () => { throw enoent; } }),
    'compat/no-cli',
    500,
  );
  await expectCompatError(
    installPlugin({ id: 'resume-screening', dshHome, profiles, env: {}, cli, run: async () => { throw new Error('boom'); } }),
    'compat/install-failed',
    502,
  );

  await expectCompatError(installPlugin({ id: 'nope', dshHome, profiles, env: {} }), 'compat/unknown', 404);
  await expectCompatError(installPlugin({ id: 'resume-core', dshHome, profiles, env: {} }), 'compat/planned', 400);

  const emptyHome = await makeDshHome();
  await expectCompatError(installPlugin({ id: 'resume-screening', dshHome: emptyHome, env: {} }), 'compat/no-profile', 500);

  // ── 3. 路由：GET /compat/state、POST /compat/install ──────────────────────
  const handler = createHandler({ ctx: makeCtx(), store: makeStore() });
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = dshHome;

  async function call(reqInit) {
    const { res, out } = makeRes();
    await handler(makeReq(reqInit), res);
    return { status: out.status, body: out.body ? JSON.parse(out.body) : null };
  }

  try {
    const stateRes = await call({ url: PREFIX + '/compat/state' });
    assert.equal(stateRes.status, 200);
    assert.equal(stateRes.body.ok, true);
    assert.equal(stateRes.body.value.profile, 'beta');
    assert.equal(stateRes.body.value.items.length, COMPAT_CATALOG.length);
    assert.equal(
      stateRes.body.value.items.find((item) => item.id === 'resume-migrator').installed,
      true,
    );

    const unknown = await call({ method: 'POST', url: PREFIX + '/compat/install', body: { id: 'nope' } });
    assert.equal(unknown.status, 404, '未知插件 → 404');
    assert.equal(unknown.body.ok, false);
    assert.equal(unknown.body.error.code, 'compat/unknown');

    const planned = await call({ method: 'POST', url: PREFIX + '/compat/install', body: { id: 'resume-core' } });
    assert.equal(planned.status, 400, '未发布插件 → 400');
    assert.equal(planned.body.error.code, 'compat/planned');

    const missing = await call({ method: 'POST', url: PREFIX + '/compat/install', body: {} });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error.code, 'http/bad-request');

    const forbidden = await call({ url: PREFIX + '/compat/state', headers: { host: 'evil.example.com' } });
    assert.equal(forbidden.status, 403, '非 loopback Host 应被拒绝');
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  }

  console.log('✓ 兼容插件：profile 检测 / 安装逻辑 / 路由校验全部通过');
} finally {
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
