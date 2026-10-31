/**
 * 公共市场契约测试：把 raw.githubusercontent.com 映射到仓库里的 market/ 目录，
 * 真跑 Host 的 /github/* 路由，确认 index.json 与模板文件和插件读取逻辑对得上。
 *
 * 不联网、不写用户真实数据目录。
 * 运行：node tests/github-market.mjs
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const marketDir = join(root, 'market');

const dir = await mkdtemp(join(tmpdir(), 'resume-market-gh-'));
process.env.RESUME_MARKET_FILE = join(dir, 'store.json');
process.env.USERPROFILE = dir;
process.env.HOME = dir;

const index = JSON.parse(await readFile(join(marketDir, 'index.json'), 'utf8'));
assert.ok(Array.isArray(index.templates), 'market/index.json 必须有 templates 数组');
assert.equal(index.templates.length, 5, 'index 里应有 5 个模板');

// 把 GitHub raw URL 映射到本地 market/，其余请求直接失败（避免意外联网）。
globalThis.fetch = async (input) => {
  const url = String(input && input.url ? input.url : input);
  const marker = 'raw.githubusercontent.com/';
  const at = url.indexOf(marker);
  if (at < 0) throw new Error('unexpected fetch: ' + url);
  const rest = decodeURIComponent(url.slice(at + marker.length));
  const file = rest.split('/').slice(3).join('/'); // 去掉 <owner>/<repo>/<branch>/
  assert.ok(file.startsWith('market/'), '只应读取 market/ 下的文件：' + file);
  const text = await readFile(join(root, file), 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(text) };
};

const { apply } = await import('../src/index.js');

const routes = [];
const tools = [];
const ctx = {
  logger: { info() {}, warn() {}, log() {} },
  effect(fn) {
    fn();
    return () => {};
  },
  get(name) {
    if (name === 'webRuntime') return { trustedHosts: [] };
    return undefined;
  },
  webServer: {
    register(route) {
      routes.push(route);
      return () => {};
    },
    getOrigin() {
      return 'http://127.0.0.1:59568';
    },
  },
  tools: {
    register(definition) {
      tools.push(definition);
      return () => {};
    },
  },
};

apply(ctx, {});
await new Promise((resolve) => setTimeout(resolve, 120));

assert.equal(routes.length, 1);
const handle = routes[0].handler;

function call(method, path, body) {
  return new Promise((resolve) => {
    const data = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
    const listeners = { data: [], end: [], error: [] };
    const req = {
      method,
      url: '/resume-market/api' + path,
      headers: { host: '127.0.0.1:59568' },
      on(event, fn) {
        (listeners[event] || (listeners[event] = [])).push(fn);
        return req;
      },
      destroy() {},
    };
    const res = {
      status: 0,
      headers: {},
      body: '',
      writeHead(status, headers) {
        res.status = status;
        Object.assign(res.headers, headers || {});
      },
      setHeader(name, value) {
        res.headers[name] = value;
      },
      write(chunk) {
        res.body += chunk;
      },
      end(chunk) {
        if (chunk) res.body += chunk;
        let json = null;
        try {
          json = JSON.parse(res.body);
        } catch {
          json = null;
        }
        resolve({ status: res.status, headers: res.headers, body: res.body, json });
      },
    };
    handle(req, res).catch((error) => {
      resolve({ status: 500, body: String(error && error.message), json: null });
    });
    setTimeout(() => {
      for (const fn of listeners.data) fn(data.length ? data[0] : Buffer.alloc(0));
      for (const fn of listeners.end) fn();
    }, 0);
  });
}

// 1) /github/state 强制刷新 → 5 条
let res = await call('GET', '/github/state?force=1');
assert.equal(res.status, 200, res.body);
assert.equal(res.json.value.items.length, 5, '公共市场应有 5 个模板');
assert.equal(res.json.value.stale, false);
assert.equal(res.json.value.repo, 'skylight54/dsh-resume-market');

// 1b) 列表条目自带 css/sample，市场卡片才能渲染真实 A4 缩略图（与安装后的预览一致）
const firstItem = res.json.value.items[0];
assert.ok(firstItem && firstItem.id, '列表应有条目');
assert.ok(String(firstItem.css || '').includes('.rm-t-'), '列表条目应内联 css');
assert.ok(firstItem.sample && firstItem.sample.basics, '列表条目应内联 sample');
assert.ok(/^rm-t-/.test(firstItem.cls || ''), '列表条目应带 cls');
assert.ok(firstItem.templateId, '列表条目应带 templateId');

// 2) index 字段与模板文件一一对应，逐个安装
const seen = new Set();
for (const item of index.templates) {
  seen.add(item.id);
  res = await call('POST', '/github/install', { id: item.id });
  assert.equal(res.status, 200, item.id + ' 安装失败：' + res.body);
  const template = res.json.value.template;
  assert.ok(template.id, item.id + ' 安装后应有模板 id');
  assert.ok(String(template.css || '').includes('.' + item.cls), item.id + ' 的 CSS 应包含根选择器 .' + item.cls);
}

// 3) 安装后模板库 = 6 内置 + 5 公共
res = await call('GET', '/state');
assert.equal(res.status, 200);
assert.equal(res.json.value.templates.length, 11, '模板库应为 6 内置 + 5 公共');
const names = res.json.value.templates.map((item) => item.name);
for (const item of index.templates) assert.ok(names.includes(item.name), '模板库缺少 ' + item.name);

// 4) 投稿 payload 的 id/file 与 index 约定一致
res = await call('POST', '/resume', {
  title: '公共市场契约测试',
  templateId: 'quiet-luxury',
  data: { basics: { name: 'Contract Test', phone: '138 0013 8000' }, summary: '契约测试' },
});
assert.equal(res.status, 200, res.body);
const resumeId = res.json.value.resume.id;
res = await call('POST', '/github/publish', { resumeId, name: '契约测试模板', tagline: '测试', tags: '测试' });
assert.equal(res.status, 200, res.body);
const published = res.json.value;
const payload = JSON.parse(published.json);
assert.ok(/^rm-[a-z0-9-]+-[a-z0-9]{4}$/.test(payload.id), '投稿 id 必须符合市场 id 规则：' + payload.id);
assert.equal(published.filename, payload.id + '.json');
assert.equal(published.repoPath, 'market/templates/' + payload.id + '.json');
assert.ok(published.issueUrl.startsWith('https://github.com/skylight54/dsh-resume-market/issues/new'));
assert.equal(payload.schema, 1);
assert.ok(String(payload.css || '').includes('.rm-t-'), '投稿 css 应带 .rm-t-* 根选择器');
assert.ok(payload.cls && /^rm-t-[a-z0-9-]+$/.test(payload.cls), '投稿应带合法 cls');
assert.equal(payload.sample.basics.phone, '138 0013 8000');

// 5) 三个公共市场工具已注册
for (const name of ['resume_market_public', 'resume_install_public', 'resume_publish_public']) {
  assert.ok(tools.some((tool) => tool.name === name), '缺少工具 ' + name);
}

await rm(dir, { recursive: true, force: true });
console.log('✓ 公共市场契约测试通过（index / 5 个模板安装 / 投稿 JSON / 3 个工具）');
