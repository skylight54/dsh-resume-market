#!/usr/bin/env node
/**
 * 免费简历模板市场 · 冒烟测试
 * ---------------------------------------------------------------------------
 * 用法：node resume-market/server/smoke.mjs
 *
 * 测试会自行启动服务（随机端口 + 临时数据库目录），跑完自动清理，
 * 不会读写真实的 market-data.json，也不会占用 7701 端口。
 */
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMarketServer } from './market-server.js';

const TOKEN = 'smoke-token';
const silentLogger = { info() {}, warn() {}, error() {} };

const results = [];
let app = null;
let base = '';

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err });
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err && err.stack ? err.stack.split('\n').slice(0, 4).join('\n        ') : err}`);
  }
}

async function request(pathname, options = {}) {
  const { method = 'GET', body, headers = {}, rawBody = false } = options;
  const init = { method, headers: { ...headers }, signal: AbortSignal.timeout(15000) };
  if (body !== undefined) {
    init.body = rawBody || typeof body === 'string' ? body : JSON.stringify(body);
    if (!init.headers['Content-Type']) init.headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(base + pathname, init);
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, headers: res.headers, text, data };
}

function expectOk(response, status = 200) {
  assert.equal(
    response.status,
    status,
    `期望 HTTP ${status}，实际 ${response.status}，响应：${String(response.text).slice(0, 200)}`,
  );
  assert.equal(response.data && response.data.ok, true, `期望 ok:true，实际：${String(response.text).slice(0, 200)}`);
  return response.data.value;
}

function expectError(response, status, code) {
  assert.equal(
    response.status,
    status,
    `期望 HTTP ${status}，实际 ${response.status}，响应：${String(response.text).slice(0, 200)}`,
  );
  assert.equal(response.data && response.data.ok, false);
  assert.equal(response.data.error && response.data.error.code, code);
  assert.equal(typeof response.data.error.message, 'string');
  assert.ok(response.data.error.message.length > 0);
  return response.data.error;
}

function makeItem(overrides = {}) {
  return {
    item: {
      title: '简洁单页简历',
      author: '小明',
      tags: ['极简', '蓝色'],
      note: '适合互联网岗位',
      templateId: 'modern-blue',
      template: { css: 'body{font-family:sans-serif}' },
      data: { name: '张三', job: '前端工程师' },
      ...overrides,
    },
  };
}

const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'resume-market-smoke-'));
const dbPath = path.join(tmpDir, 'market-data.json');
const created = {};

try {
  app = await createMarketServer({ host: '127.0.0.1', port: 0, dbPath, token: TOKEN, logger: silentLogger });
  base = app.url;
  console.log(`\n临时数据库：${dbPath}\n服务地址：${base}\n`);

  // ---------------------------------------------------------------- 基础 ----
  await test('GET /api/health 初始为 0 条', async () => {
    const r = await request('/api/health');
    const value = expectOk(r, 200);
    assert.equal(value.name, 'resume-market');
    assert.equal(value.version, '1');
    assert.equal(value.items, 0);
    assert.match(r.headers.get('content-type') || '', /application\/json/);
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
  });

  await test('OPTIONS 预检返回 204 与 CORS 头', async () => {
    const r = await request('/api/templates', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    assert.equal(r.status, 204);
    assert.equal(r.text, '');
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    assert.match(r.headers.get('access-control-allow-methods') || '', /POST/);
    assert.match(r.headers.get('access-control-allow-headers') || '', /Content-Type/i);
  });

  // ---------------------------------------------------------------- 创建 ----
  await test('POST /api/templates 创建成功（201）', async () => {
    const value = expectOk(await request('/api/templates', { method: 'POST', body: makeItem() }), 201);
    assert.ok(value.item && typeof value.item.id === 'string' && value.item.id.length > 0);
    assert.equal(value.item.title, '简洁单页简历');
    assert.equal(value.item.author, '小明');
    assert.deepEqual(value.item.tags, ['极简', '蓝色']);
    assert.equal(value.item.downloads, 0);
    assert.equal(value.item.likes, 0);
    assert.equal(value.item.template.css, 'body{font-family:sans-serif}');
    assert.deepEqual(value.item.data, { name: '张三', job: '前端工程师' });
    created.firstId = value.item.id;
  });

  await test('重复内容创建返回 409 duplicate', async () => {
    const error = expectError(await request('/api/templates', { method: 'POST', body: makeItem() }), 409, 'duplicate');
    assert.ok(error.message.includes('已存在'));
  });

  await test('创建第二个模板（不同标题/数据）', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10)); // 让 createdAt 拉开，便于排序断言
    const body = makeItem({
      title: '双栏技术简历',
      tags: ['技术', '双栏'],
      note: '后端 / 全栈岗位',
      templateId: 'tech-two-column',
      template: { css: '.two{display:grid}' },
      data: { name: '李四', job: '后端工程师' },
    });
    const value = expectOk(await request('/api/templates', { method: 'POST', body }), 201);
    assert.equal(value.item.title, '双栏技术简历');
    created.secondId = value.item.id;
  });

  // ---------------------------------------------------------------- 列表 ----
  await test('GET /api/templates 列表 + total（默认返回完整条目）', async () => {
    const value = expectOk(await request('/api/templates'), 200);
    assert.equal(value.total, 2);
    assert.equal(value.items.length, 2);
    assert.equal(value.items[0].title, '双栏技术简历'); // 默认最新在前
    assert.equal(typeof value.items[0].template, 'object');
    assert.equal(value.items[0].template.css, '.two{display:grid}');
    assert.equal(typeof value.items[0].downloads, 'number');
    assert.equal(value.limit, 20);
    assert.equal(value.offset, 0);
  });

  await test('?include=summary 返回轻量摘要', async () => {
    const value = expectOk(await request('/api/templates?include=summary'));
    assert.equal(value.total, 2);
    assert.equal(value.items[0].template, undefined);
    assert.equal(value.items[0].data, undefined);
    assert.equal(typeof value.items[0].title, 'string');
  });

  await test('?q= 标题搜索', async () => {
    const value = expectOk(await request('/api/templates?q=' + encodeURIComponent('双栏')));
    assert.equal(value.total, 1);
    assert.equal(value.items[0].title, '双栏技术简历');
  });

  await test('?q= 标签搜索', async () => {
    const value = expectOk(await request('/api/templates?q=' + encodeURIComponent('极简')));
    assert.equal(value.total, 1);
    assert.equal(value.items[0].title, '简洁单页简历');
  });

  await test('?limit=&offset= 分页', async () => {
    const value = expectOk(await request('/api/templates?limit=1&offset=1'));
    assert.equal(value.total, 2);
    assert.equal(value.items.length, 1);
    assert.equal(value.items[0].title, '简洁单页简历');
    assert.equal(value.limit, 1);
    assert.equal(value.offset, 1);
  });

  await test('非法 limit 返回 400', async () => {
    expectError(await request('/api/templates?limit=abc'), 400, 'invalid_query');
  });

  await test('非法 sort 返回 400', async () => {
    expectError(await request('/api/templates?sort=bogus'), 400, 'invalid_query');
  });

  await test('?sort=oldest 最早在前', async () => {
    const value = expectOk(await request('/api/templates?sort=oldest'));
    assert.equal(value.items[0].title, '简洁单页简历');
  });

  await test('?include=full 返回 template/data', async () => {
    const value = expectOk(await request('/api/templates?include=full&q=' + encodeURIComponent('简洁')));
    const item = value.items[0];
    assert.equal(item.template.css, 'body{font-family:sans-serif}');
    assert.deepEqual(item.data, { name: '张三', job: '前端工程师' });
  });

  // ---------------------------------------------------------------- 单条 ----
  await test('GET /api/templates/:id 返回完整条目', async () => {
    const value = expectOk(await request('/api/templates/' + created.firstId));
    assert.equal(value.item.id, created.firstId);
    assert.equal(value.item.template.css, 'body{font-family:sans-serif}');
    assert.deepEqual(value.item.data, { name: '张三', job: '前端工程师' });
  });

  await test('GET /api/templates/不存在 返回 404', async () => {
    expectError(await request('/api/templates/rm_not_exists'), 404, 'not_found');
  });

  // -------------------------------------------------------- 下载 / 点赞 ----
  await test('POST /:id/download 累加下载数', async () => {
    let value = expectOk(await request(`/api/templates/${created.firstId}/download`, { method: 'POST' }));
    assert.equal(value.downloads, 1);
    value = expectOk(await request(`/api/templates/${created.firstId}/download`, { method: 'POST' }));
    assert.equal(value.downloads, 2);
    const got = expectOk(await request('/api/templates/' + created.firstId));
    assert.equal(got.item.downloads, 2);
  });

  await test('POST /:id/like 累加点赞数', async () => {
    const value = expectOk(await request(`/api/templates/${created.firstId}/like`, { method: 'POST' }));
    assert.equal(value.likes, 1);
  });

  await test('不存在条目的 download 返回 404', async () => {
    expectError(await request('/api/templates/rm_missing/download', { method: 'POST' }), 404, 'not_found');
  });

  // ---------------------------------------------------------------- 分享包 ----
  await test('GET /:id/pack 返回分享包（裸 JSON）', async () => {
    const r = await request(`/api/templates/${created.firstId}/pack`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') || '', /application\/json/);
    assert.match(r.headers.get('content-disposition') || '', /resume-market-pack\.json/);
    assert.equal(r.data.kind, 'resume-market-pack');
    assert.equal(r.data.version, 1);
    assert.equal(r.data.name, 'modern-blue');
    assert.equal(r.data.title, '简洁单页简历');
    assert.equal(r.data.author, '小明');
    assert.deepEqual(r.data.tags, ['极简', '蓝色']);
    assert.equal(r.data.template.css, 'body{font-family:sans-serif}');
    assert.deepEqual(r.data.data, { name: '张三', job: '前端工程师' });
  });

  // ---------------------------------------------------------------- 校验 ----
  await test('非法 JSON 返回 400 bad_json', async () => {
    expectError(await request('/api/templates', { method: 'POST', body: '{bad json' }), 400, 'bad_json');
  });

  await test('缺少 title 返回 400', async () => {
    const body = { item: { ...makeItem().item, title: '' } };
    expectError(await request('/api/templates', { method: 'POST', body }), 400, 'invalid_field');
  });

  await test('title 超过 80 字符返回 400', async () => {
    const body = makeItem({ title: 'a'.repeat(81), templateId: 'too-long-title' });
    expectError(await request('/api/templates', { method: 'POST', body }), 400, 'invalid_field');
  });

  await test('tags 超过 8 个返回 400', async () => {
    const body = makeItem({ templateId: 'too-many-tags', tags: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] });
    expectError(await request('/api/templates', { method: 'POST', body }), 400, 'invalid_field');
  });

  await test('template.css 缺失返回 400', async () => {
    const body = makeItem({ templateId: 'no-css', template: {} });
    expectError(await request('/api/templates', { method: 'POST', body }), 400, 'invalid_field');
  });

  await test('template.css 超过 100KB 返回 413', async () => {
    const body = makeItem({
      templateId: 'big-css',
      template: { css: 'a'.repeat(101 * 1024) },
      data: { name: '王五' },
    });
    expectError(await request('/api/templates', { method: 'POST', body }), 413, 'css_too_large');
  });

  await test('单个 item 超过 200KB 返回 413', async () => {
    const body = makeItem({
      templateId: 'big-item',
      template: { css: '.x{color:red}' },
      data: { blob: 'x'.repeat(210 * 1024) },
    });
    expectError(await request('/api/templates', { method: 'POST', body }), 413, 'item_too_large');
  });

  await test('请求体超过 512KB 返回 413', async () => {
    const r = await request('/api/templates', { method: 'POST', body: 'x'.repeat(600 * 1024) });
    assert.equal(r.status, 413);
    assert.equal(r.data.error.code, 'body_too_large');
  });

  await test('未知路径返回 404', async () => {
    expectError(await request('/api/unknown'), 404, 'route_not_found');
  });

  await test('错误方法返回 405 并带 Allow 头', async () => {
    const r = await request('/api/health', { method: 'POST' });
    assert.equal(r.status, 405);
    assert.match(r.headers.get('allow') || '', /GET/);
  });

  // ---------------------------------------------------------- 删除 / 令牌 ----
  await test('DELETE 缺少令牌返回 401', async () => {
    expectError(await request('/api/templates/' + created.secondId, { method: 'DELETE' }), 401, 'unauthorized');
  });

  await test('DELETE 错误令牌返回 401', async () => {
    expectError(
      await request('/api/templates/' + created.secondId, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer wrong-token' },
      }),
      401,
      'unauthorized',
    );
  });

  await test('DELETE 正确令牌删除成功', async () => {
    const value = expectOk(
      await request('/api/templates/' + created.secondId, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
    );
    assert.equal(value.deleted, true);
    expectError(await request('/api/templates/' + created.secondId), 404, 'not_found');
  });

  // ---------------------------------------------------------------- 静态页 ----
  await test('GET / 返回画廊页并包含已有模板', async () => {
    const r = await request('/');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') || '', /text\/html/);
    assert.ok(r.text.includes('免费简历模板市场'));
    assert.ok(r.text.includes('简洁单页简历'));
    assert.ok(r.text.includes('复制导入 JSON'));
    assert.ok(r.text.includes('boot-data'));
  });

  await test('HEAD / 返回 200 且无响应体', async () => {
    const r = await request('/', { method: 'HEAD' });
    assert.equal(r.status, 200);
    assert.equal(r.text, '');
  });

  await test('GET /assets/不存在 返回 404', async () => {
    expectError(await request('/assets/missing.css'), 404, 'route_not_found');
  });

  await test('GET /assets 目录穿越被拦截', async () => {
    expectError(await request('/assets/%2e%2e%2fmarket-server.js'), 404, 'route_not_found');
  });

  await test('未知静态路径返回 404', async () => {
    expectError(await request('/no-such-page'), 404, 'route_not_found');
  });

  // ---------------------------------------------------------- HTML 转义 ----
  await test('HTML 转义：恶意标题/标签不会注入画廊页', async () => {
    const body = makeItem({
      title: '<script>alert(1)</script>',
      author: '<b>黑客</b>',
      tags: ['"><svg/onload=1>'],
      note: '<img src=x onerror=alert(1)>',
      templateId: 'xss-test',
      template: { css: '.x{}' },
      data: { name: 'XSS' },
    });
    const created2 = expectOk(await request('/api/templates', { method: 'POST', body }), 201);
    created.xssId = created2.item.id;

    const page = await request('/');
    assert.equal(page.status, 200);
    assert.ok(!page.text.includes('<script>alert(1)</script>'), '原始 <script> 不应出现在页面中');
    assert.ok(!page.text.includes('<img src=x onerror=alert(1)>'), '原始 <img onerror> 不应出现在页面中');
    assert.ok(!page.text.includes('<svg/onload=1>'), '原始 <svg onload> 不应出现在页面中');
    assert.ok(page.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), '标题应被 HTML 转义');
    assert.ok(page.text.includes('&lt;img src=x onerror=alert(1)&gt;'), '说明应被 HTML 转义');
  });

  await test('兼容插件市场条目字段（name/css/sample/desc）', async () => {
    const entry = {
      name: '插件条目模板',
      en: 'plugin-entry',
      tagline: '插件市场标签',
      desc: '来自插件市场的说明',
      tags: ['插件', '兼容'],
      css: '.pe{color:#0af}',
      author: '插件作者',
      sample: { name: '示例用户' },
      templateId: 'plugin-entry',
    };
    const value = expectOk(await request('/api/templates', { method: 'POST', body: entry }), 201);
    assert.equal(value.item.title, '插件条目模板');
    assert.equal(value.item.author, '插件作者');
    assert.equal(value.item.template.css, '.pe{color:#0af}');
    assert.equal(value.item.note, '来自插件市场的说明');
    assert.deepEqual(value.item.data, { name: '示例用户' });
    // 清理，避免影响后续计数断言
    expectOk(
      await request('/api/templates/' + value.item.id, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
    );
  });

  await test('health 条目数随创建/删除变化', async () => {
    const value = expectOk(await request('/api/health'));
    assert.equal(value.items, 2); // 简洁单页简历 + XSS 测试条目
  });

  // ---------------------------------------------------------------- 持久化 ----
  await test('重启后数据从 JSON 文件恢复', async () => {
    await app.close();
    app = null;
    app = await createMarketServer({ host: '127.0.0.1', port: 0, dbPath, token: TOKEN, logger: silentLogger });
    base = app.url;
    const health = expectOk(await request('/api/health'));
    assert.equal(health.items, 2);
    const got = expectOk(await request('/api/templates/' + created.firstId));
    assert.equal(got.item.title, '简洁单页简历');
    assert.equal(got.item.downloads, 2);
    assert.equal(got.item.likes, 1);
    const page = await request('/');
    assert.ok(page.text.includes('简洁单页简历'));
  });

  // ------------------------------------------------------------ 容量上限 ----
  await test('库满 500 条后拒绝创建（409 market_full）', async () => {
    await app.close();
    app = null;

    const seedPath = path.join(tmpDir, 'seed-data.json');
    const seedItems = Array.from({ length: 500 }, (_, index) => ({
      id: `seed_${String(index).padStart(4, '0')}`,
      title: `种子模板 ${index}`,
      author: '种子作者',
      tags: ['种子'],
      note: '',
      name: `seed-${index}`,
      templateId: `seed-${index}`,
      template: { css: '.seed{color:#333}' },
      data: { name: '张三' },
      downloads: index,
      likes: index,
      createdAt: new Date(1700000000000 + index * 1000).toISOString(),
      updatedAt: new Date(1700000000000 + index * 1000).toISOString(),
    }));
    await fsp.writeFile(seedPath, JSON.stringify({ version: 1, items: seedItems }, null, 2), 'utf8');

    app = await createMarketServer({ host: '127.0.0.1', port: 0, dbPath: seedPath, logger: silentLogger });
    base = app.url;

    const health = expectOk(await request('/api/health'));
    assert.equal(health.items, 500);

    const list = expectOk(await request('/api/templates?limit=100'));
    assert.equal(list.total, 500);
    assert.equal(list.items.length, 100);

    expectError(
      await request('/api/templates', { method: 'POST', body: makeItem({ templateId: 'overflow-test' }) }),
      409,
      'market_full',
    );

    // 未配置 RM_TOKEN 时允许直接删除（删除后即可继续创建）
    expectOk(await request('/api/templates/seed_0000', { method: 'DELETE' }));
    expectOk(
      await request('/api/templates', { method: 'POST', body: makeItem({ templateId: 'overflow-test' }) }),
      201,
    );
  });
} finally {
  if (app) {
    try {
      await app.close();
    } catch {
      /* 忽略清理异常 */
    }
  }
  await fsp.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
}

const failed = results.filter((entry) => !entry.ok);
const total = results.length;
if (failed.length > 0) {
  console.error(`\n✗ ${failed.length}/${total} 项测试失败：`);
  for (const entry of failed) console.error(`  - ${entry.name}`);
  process.exitCode = 1;
} else {
  console.log(`\n✓ 全部通过：${total}/${total} 项测试\n`);
}
