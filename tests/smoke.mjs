/**
 * Host 侧冒烟测试：真实 apply() + 假 ctx，把 HTTP handler 当函数驱动。
 *
 * 不启动网络端口、不写用户真实数据目录（用临时 RESUME_MARKET_FILE）。
 * 运行：node tests/smoke.mjs
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'resume-market-smoke-'));
process.env.RESUME_MARKET_FILE = join(dir, 'store.json');
// 导出工具会写 ~/.dsh/resume-market/exports，这里把「家目录」也指到临时目录，避免污染真实数据。
process.env.USERPROFILE = dir;
process.env.HOME = dir;

const { apply } = await import('../src/index.js');
const { TEMPLATES, buildHtml, DEMO_RESUME_DATA, SECTION_ORDER, templateClass } = await import('../src/shared/doc.js');
const { findBrowser } = await import('../src/export-file.js');

// GitHub 公共市场用 fetch 取 raw.githubusercontent.com；测试里换成确定性的假实现。
const GH_INDEX = {
  schema: 1,
  updatedAt: '2026-10-31T00:00:00.000Z',
  templates: [
    {
      id: 'rm-demo',
      name: '演示公共模板',
      en: 'Demo Public',
      tagline: '来自公共市场的测试模板',
      tags: ['演示', '公共'],
      author: '社区',
      accent: '#334455',
      cls: 'rm-t-demo',
      file: 'templates/rm-demo.json',
      installs: 3,
      updatedAt: '2026-10-31T00:00:00.000Z',
    },
  ],
};
const GH_TEMPLATE = {
  schema: 1,
  id: 'rm-demo',
  name: '演示公共模板',
  en: 'Demo Public',
  tagline: '来自公共市场的测试模板',
  tags: ['演示', '公共'],
  author: '社区',
  accent: '#334455',
  cls: 'rm-t-demo',
  templateId: 'pub-demo',
  css: '.rm-t-demo{padding:24px 0;border-top:3px solid #334455}',
  sample: null,
};
globalThis.fetch = async (input) => {
  const url = String(input && input.url ? input.url : input);
  const body = url.endsWith('market/index.json') ? GH_INDEX : GH_TEMPLATE;
  return { ok: true, status: 200, json: async () => body };
};

const routes = [];
const tools = [];
const disposers = [];
const ctx = {
  logger: { info() {}, warn() {}, log() {} },
  effect(fn) {
    const dispose = fn();
    if (typeof dispose === 'function') disposers.push(dispose);
    return dispose;
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

assert.equal(routes.length, 1, '应该注册一个 prefix 路由');
assert.equal(routes[0].kind, 'prefix');
assert.equal(tools.length, 9, '应该注册 9 个 resume_* 工具，实际 ' + tools.length);

const handle = routes[0].handler;

function call(method, path, body, headers) {
  return new Promise((resolve) => {
    const data = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
    const listeners = { data: [], end: [], error: [] };
    const req = {
      method,
      url: '/resume-market/api' + path,
      headers: Object.assign({ host: '127.0.0.1:59568' }, headers || {}),
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
        this.status = status;
        this.headers = headers || {};
      },
      end(chunk) {
        this.body = chunk === undefined ? '' : String(chunk);
      },
    };
    const pending = handle(req, res);
    setTimeout(() => {
      for (const chunk of data) for (const fn of listeners.data) fn(chunk);
      for (const fn of listeners.end) fn();
    }, 0);
    pending.then(() => {
      let json = null;
      try {
        json = JSON.parse(res.body);
      } catch {
        json = null;
      }
      resolve({ status: res.status, headers: res.headers, body: res.body, json });
    });
  });
}

// 1) 健康检查
let res = await call('GET', '/health');
assert.equal(res.status, 200);
assert.equal(res.json.ok, true);
assert.equal(res.json.value.app, 'resume-market');

// 2) 初始 state：6 套内置模板 + 3 条种子市场内容
res = await call('GET', '/state');
assert.equal(res.status, 200);
assert.equal(res.json.value.templates.length, 7, '内置模板应为 7 套');
const builtinFlags = res.json.value.templates.map((t) => t.builtin);
assert.ok(builtinFlags.every((flag) => flag === true), '内置模板必须带 builtin:true 标记（客户端据此渲染「复制为新模板」）');
assert.equal(res.json.value.market.length, 3, '种子市场应有 3 条');
assert.equal(res.json.value.resumes.length, 0);

// 3) 新建简历（个人信息用结构化字段，而不是一整段）
res = await call('POST', '/resume', {
  title: '产品经理_上海_林知夏',
  templateId: 'business-minimal',
  data: {
    basics: {
      name: '林知夏',
      role: '高级产品经理',
      phone: '138 0013 8000',
      email: 'lin@example.com',
      city: '上海',
      wechat: 'lin_zhixia',
      github: 'github.com/linzhixia',
      website: 'linzhixia.dev',
    },
    summary: '8 年 B 端产品经验',
    experience: [{ company: '云启科技', role: '产品经理', period: '2021.06 — 至今', location: '上海', bullets: ['把续费率提升 **18%**'] }],
    projects: [],
    education: [{ school: '复旦', degree: '本科', major: '信管', period: '2014 — 2018', gpa: '3.8/4.0', courses: '数据结构、计量经济学' }],
    skills: [{ group: '产品能力', items: '需求分析、数据分析' }],
    awards: [],
  },
});
assert.equal(res.status, 200, res.body);
const resumeId = res.json.value.resume.id;
assert.ok(resumeId);
assert.equal(res.json.value.resume.data.basics.phone, '138 0013 8000');
assert.equal(res.json.value.resume.data.education[0].courses, '数据结构、计量经济学', '主修课程应被保存');

// 4) 更新简历
res = await call('POST', '/resume', { resume: { id: resumeId, title: '产品经理_上海_林知夏 v2' } });
assert.equal(res.status, 200);
assert.equal(res.json.value.resume.title, '产品经理_上海_林知夏 v2');

// 5) 导出 HTML：个人信息必须是「字段网格」而不是一段文字
res = await call('GET', '/export?id=' + encodeURIComponent(resumeId));
assert.equal(res.status, 200);
assert.match(res.body, /rm-contact/, '导出 HTML 应包含个人信息网格');
assert.match(res.body, /class="rm-doc rm-paper rm-t-business[\s"]/, '导出 HTML 根 class 必须命中模板 CSS 选择器');

// 5b) 每个内置模板：CSS 的根选择器必须和导出 HTML 的根 class 一致（防再次退回纯白）
for (const tpl of TEMPLATES) {
  const cls = templateClass(tpl);
  assert.ok(
    tpl.css.includes('.' + cls + '{') || tpl.css.includes('.' + cls + ' '),
    '模板 ' + tpl.id + ' 的 CSS 缺少根选择器 .' + cls,
  );
  const html = buildHtml({ templateId: tpl.id, data: DEMO_RESUME_DATA, sections: SECTION_ORDER.slice(), lang: 'zh' }, tpl);
  assert.ok(
    html.includes('class="rm-doc rm-paper ' + cls + '"'),
    '模板 ' + tpl.id + ' 导出 HTML 的根 class 未命中 .' + cls,
  );
}
assert.match(res.body, /rm-k/, '每个字段应有独立标签');
assert.match(res.body, /138 0013 8000/);
// 主修课程：HTML 导出要带上独立一行（标签 + 内容）
assert.match(res.body, /class="rm-edu-courses"/, '导出 HTML 应包含主修课程行');
assert.match(res.body, /主修课程/, '导出 HTML 应包含主修课程标签');
assert.match(res.body, /数据结构、计量经济学/, '导出 HTML 应包含主修课程内容');

// 5c) 可选照片：上传后应渲染在页眉，并受位置 / 形状控制
const tinyPhoto = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
const customOrder = ['summary', 'experience', 'education', 'projects', 'skills', 'awards'];
res = await call('POST', '/resume', {
  resume: {
    id: resumeId,
    sections: customOrder,
    data: {
      ...DEMO_RESUME_DATA,
      basics: { ...DEMO_RESUME_DATA.basics, photo: tinyPhoto, photoSide: 'left', photoShape: 'square' },
    },
  },
});
assert.equal(res.status, 200, res.body);
assert.deepEqual(res.json.value.resume.sections, customOrder, '自定义模块顺序应被保存');
assert.equal(res.json.value.resume.data.basics.photo, tinyPhoto, '照片应被保存');
res = await call('GET', '/export?id=' + encodeURIComponent(resumeId));
assert.match(res.body, /class="rm-photo rm-photo-square"/, '导出应渲染方形照片');
assert.match(res.body, /class="rm-head rm-has-photo rm-photo-left"/, '照片位置应为左侧');
const eduPos = res.body.indexOf('rm-sec-education');
const projPos = res.body.indexOf('rm-sec-projects');
assert.ok(eduPos > 0 && projPos > 0 && eduPos < projPos, '教育背景应排在项目经历之前');

// 5d) 危险协议的照片必须被清掉，不能出现在导出 HTML 里
res = await call('POST', '/resume', {
  resume: {
    id: resumeId,
    data: {
      ...DEMO_RESUME_DATA,
      basics: { ...DEMO_RESUME_DATA.basics, photo: 'javascript:alert(1)' },
      education: [{ ...DEMO_RESUME_DATA.education[0], courses: '数据结构、计量经济学' }],
    },
  },
});
assert.equal(res.status, 200, res.body);
assert.equal(res.json.value.resume.data.basics.photo, '', '非图片协议的照片应被清洗');
assert.equal(res.json.value.resume.sections.length, 6, '只改 data 时模块顺序应保持不变');

// 回到导出 HTML，供后面的页眉 / 分页断言使用
res = await call('GET', '/export?id=' + encodeURIComponent(resumeId));
assert.equal(res.status, 200, res.body);
assert.match(res.body, /@page/);
assert.equal(res.headers['content-type'].includes('text/html'), true);
assert.match(res.body, /class="rm-edu-courses"/, '清空危险照片后主修课程仍应保留在导出里');

// 5c) Host 落盘导出：返回真实路径，文件内容可读（浏览器下载在 Electron 里可能被吞）
res = await call('POST', '/export', { id: resumeId });
assert.equal(res.status, 200, res.body);
const exportedPath = res.json.value.path;
assert.equal(res.json.value.format, 'html');
assert.ok(exportedPath && exportedPath.endsWith('.html'), 'POST /export 应返回 html 路径');
assert.equal(existsSync(exportedPath), true, '导出文件应真实写到磁盘');
assert.match(await readFile(exportedPath, 'utf8'), /rm-contact/);
assert.match(await readFile(exportedPath, 'utf8'), /主修课程/, '落盘 HTML 应带主修课程');

// 5c-2) Word(.doc) 导出：Word 兼容 HTML，A4 页面设置 + 模板样式都在
res = await call('POST', '/export', { id: resumeId, format: 'doc' });
assert.equal(res.status, 200, res.body);
const docPath = res.json.value.path;
assert.equal(res.json.value.format, 'doc');
assert.ok(docPath.endsWith('.doc'), 'doc 导出应为 .doc 文件');
const docText = await readFile(docPath, 'utf8');
assert.match(docText, /xmlns:w="urn:schemas-microsoft-com:office:word"/);
assert.match(docText, /WordSection1/);
assert.match(docText, /rm-contact/);
assert.match(docText, /class="rm-edu-courses"/, 'Word 导出也应带主修课程行');
assert.match(docText, /数据结构、计量经济学/);

// 5c-3) PDF 导出（Host 兜底路径）：能转换就出文件，不能转换也要给明确的错误码
res = await call('POST', '/export', { id: resumeId, format: 'pdf' });
if (res.status === 200) {
  const pdfPath = res.json.value.path;
  assert.ok(pdfPath.endsWith('.pdf'), 'pdf 导出应为 .pdf 文件');
  const pdfHead = await readFile(pdfPath, 'utf8');
  assert.equal(pdfHead.slice(0, 5), '%PDF-', 'PDF 文件头应为 %PDF-');
} else {
  assert.ok(res.status === 501 || res.status === 502, 'PDF 转换不可用时状态码应为 501/502，实际 ' + res.status);
  assert.ok(['export/no-browser', 'export/pdf-failed'].includes(res.json.error.code), '错误码不明确：' + JSON.stringify(res.body));
}

// 5c-3b) 面板生成的 PDF 字节：Host 只负责落盘，必须有文件、有 %PDF- 头、不能越权
const tinyPdf = '%PDF-1.4\n%' + 'A'.repeat(900) + '\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n';
res = await call('POST', '/export/pdf', { id: resumeId, data: Buffer.from(tinyPdf, 'latin1').toString('base64') });
assert.equal(res.status, 200, res.body);
const savedPdf = res.json.value.path;
assert.equal(res.json.value.format, 'pdf');
assert.ok(savedPdf.endsWith('.pdf'), '保存的 PDF 应有 .pdf 后缀');
assert.equal(existsSync(savedPdf), true, '保存的 PDF 应真实写到磁盘');
assert.equal((await readFile(savedPdf, 'utf8')).slice(0, 5), '%PDF-');

res = await call('POST', '/export/pdf', { id: resumeId, data: Buffer.from('not a pdf', 'latin1').toString('base64') });
assert.equal(res.status, 400, '非 PDF 字节必须被拒绝');
assert.equal(res.json.error.code, 'export/bad-pdf');

// 5c-4) 不认识的格式直接 400，不悄悄导成 html
res = await call('POST', '/export', { id: resumeId, format: 'rtf' });
assert.equal(res.status, 400, '未知格式应 400');
assert.equal(res.json.error.code, 'export/bad-format');

// 5d) 「打开所在文件夹」只允许导出目录内的路径
res = await call('POST', '/export/reveal', { path: 'C:/Windows/System32/drivers/etc/hosts' });
assert.equal(res.status, 403, '越权路径必须被拒绝');

// 5e) 编辑留历史版本；删除进回收站，可恢复
res = await call('GET', '/resume/revisions?id=' + encodeURIComponent(resumeId));
assert.equal(res.status, 200, res.body);
const revisions = res.json.value.revisions;
assert.ok(revisions.length >= 1, '编辑后应至少有一个历史版本');
res = await call('POST', '/resume/restore-revision', { id: resumeId, revisionId: revisions[0].id });
assert.equal(res.status, 200, res.body);
res = await call('DELETE', '/resume?id=' + encodeURIComponent(resumeId));
assert.equal(res.status, 200, res.body);
res = await call('GET', '/state');
assert.equal(res.json.value.resumes.length, 0, '删除后活动列表应为空');
assert.equal(res.json.value.deleted.length, 1, '删除后应进回收站而不是直接消失');
res = await call('POST', '/resume/restore', { id: resumeId });
assert.equal(res.status, 200, res.body);
res = await call('GET', '/state');
assert.equal(res.json.value.resumes.length, 1, '恢复后应回到我的简历');

// 6) 发布到本地市场
res = await call('POST', '/publish', { resumeId, title: '极简商务 · 产品经理版', tagline: '两列个人信息', tags: '商务,产品经理' });
assert.equal(res.status, 200, res.body);
const entryId = res.json.value.entry.id;
assert.equal(res.json.value.entry.author, '我');

// 7) 安装市场模板 → 模板数 +1，并可用它新建简历
res = await call('POST', '/template/install', { id: entryId });
assert.equal(res.status, 200, res.body);
const installedTemplateId = res.json.value.template.id;
res = await call('GET', '/state');
assert.equal(res.json.value.templates.length, 8);

// 8) 点赞 / 下架
res = await call('POST', '/market/like', { id: entryId });
assert.equal(res.status, 200);
res = await call('POST', '/market/unpublish', { id: entryId });
assert.equal(res.status, 200);

// 8a) 模板库：新建 / 编辑 / 发布模板（发布主语是模板，不是简历）
res = await call('POST', '/template/save', {
  template: {
    name: '我的测试模板',
    tagline: '模板库新建',
    tags: ['测试'],
    accent: '#445566',
    style: { accent: '#445566', nameSize: 32, headingStyle: 'bar', fontFamily: 'serif' },
  },
});
assert.equal(res.status, 200, res.body);
const customTemplate = res.json.value.template;
assert.ok(/^my-[a-z0-9-]+$/.test(customTemplate.id), '新模板 id 应合法：' + customTemplate.id);
assert.equal(customTemplate.cls, 'rm-t-' + customTemplate.id);
assert.equal(customTemplate.style.nameSize, 32);
assert.equal(customTemplate.style.headingStyle, 'bar');
assert.ok(customTemplate.sample && customTemplate.sample.basics, '新模板应带示例数据');
res = await call('POST', '/template/save', {
  template: {
    name: '青金分栏测试',
    style: { headingStyle: 'banner', colors: { gold: '#c9a227', accent: '#2c6474' }, nameSize: 44, fontFamily: 'serif' },
  },
});
assert.equal(res.status, 200, res.body);
const bannerTemplate = res.json.value.template;
assert.equal(bannerTemplate.style.headingStyle, 'banner', '应接受斜切色带标题样式');
assert.equal(bannerTemplate.style.gold, '#c9a227', '应接受嵌套 colors.gold');
assert.equal(bannerTemplate.style.accent, '#2c6474', '应接受嵌套 colors.accent');
assert.equal(bannerTemplate.style.nameSize, 44);
res = await call('POST', '/template/save', {
  template: {
    name: '版式字段测试',
    style: { layout: 'sidebar', headerStyle: 'band', contentStyle: 'card', headingStyle: 'pill', contactCols: 1 },
  },
});
assert.equal(res.status, 200, res.body);
const layoutTemplate = res.json.value.template;
assert.equal(layoutTemplate.style.layout, 'sidebar', '应接受左侧栏布局');
assert.equal(layoutTemplate.style.headerStyle, 'band', '应接受整宽色带页眉');
assert.equal(layoutTemplate.style.contentStyle, 'card', '应接受卡片内容块');
assert.equal(layoutTemplate.style.headingStyle, 'pill', '应接受胶囊标题');
res = await call('POST', '/template/save', {
  template: { id: customTemplate.id, name: '我的测试模板 v2', css: '.' + customTemplate.cls + '{padding:40px;color:#111}' },
});
assert.equal(res.status, 200, res.body);
assert.equal(res.json.value.template.name, '我的测试模板 v2');
assert.ok(res.json.value.template.css.includes(customTemplate.cls), '保存的 CSS 应保留模板根 class');
res = await call('POST', '/template/save', { template: { id: 'business-minimal', name: '想改内置' } });
assert.equal(res.status, 409, '内置模板不能直接改');
assert.equal(res.json.error.code, 'template/builtin');
res = await call('POST', '/template/publish', { templateId: customTemplate.id, title: '模板库发布测试' });
assert.equal(res.status, 200, res.body);
const templateEntry = res.json.value.entry;
assert.equal(templateEntry.templateId, customTemplate.id);
assert.equal(templateEntry.cls, customTemplate.cls);
assert.ok(templateEntry.sample && templateEntry.sample.basics, '发布条目应带示例数据');
assert.ok(templateEntry.css.includes(customTemplate.cls), '发布条目应带模板 CSS');
res = await call('POST', '/github/publish-template', { templateId: customTemplate.id, name: '模板库发布测试' });
assert.equal(res.status, 200, res.body);
assert.ok(res.json.value.repoPath.startsWith('market/templates/'), res.json.value.repoPath);
assert.ok(res.json.value.json.includes(customTemplate.cls), '模板投稿 JSON 应带模板 class');
assert.ok(res.json.value.payload.style && res.json.value.payload.style.nameSize === 32, '投稿应保留 style');
res = await call('POST', '/template/publish', { templateId: 'business-minimal' });
assert.equal(res.status, 409, '内置模板不能直接发布');

// 8b) GitHub 公共市场：index / 安装 / 点赞 / 投稿
res = await call('GET', '/github/state');
assert.equal(res.status, 200, res.body);
assert.equal(res.json.value.repo, 'skylight54/dsh-resume-market');
assert.equal(res.json.value.items.length, 1);
assert.equal(res.json.value.items[0].name, '演示公共模板');
res = await call('POST', '/github/install', { id: 'rm-demo' });
assert.equal(res.status, 200, res.body);
assert.ok(res.json.value.template && res.json.value.template.id, '公共模板应安装成功');
res = await call('GET', '/state');
assert.ok(res.json.value.templates.some((item) => item.name === '演示公共模板'), '安装后模板库应有公共模板');
res = await call('POST', '/github/like', { id: 'rm-demo' });
assert.equal(res.status, 200);
assert.equal(res.json.value.likes, 1);
res = await call('POST', '/github/publish', { resumeId, name: '公共投稿测试', tagline: '测试', tags: '演示', includeSample: false });
assert.equal(res.status, 200, res.body);
assert.ok(res.json.value.repoPath.startsWith('market/templates/'), res.json.value.repoPath);
assert.ok(res.json.value.issueUrl.includes('skylight54/dsh-resume-market'), res.json.value.issueUrl);
assert.ok(res.json.value.json.includes('rm-t-'), '投稿 JSON 里应有模板 class');

// 9) 设置
res = await call('POST', '/settings', { author: '测试作者', marketUrl: 'http://127.0.0.1:8787' });
assert.equal(res.status, 200);
assert.equal(res.json.value.settings.author, '测试作者');

// 10) 安全围栏：非 loopback Host / cross-site 必须 403
res = await call('GET', '/state', undefined, { host: 'evil.example.com' });
assert.equal(res.status, 403);
res = await call('GET', '/state', undefined, { 'sec-fetch-site': 'cross-site' });
assert.equal(res.status, 403);

// 11) 未知接口 404
res = await call('GET', '/nope');
assert.equal(res.status, 404);

// 12) agent 工具：resume_market_list + resume_save 真能用
const byName = new Map(tools.map((tool) => [tool.name, tool]));
for (const name of ['resume_market_list', 'resume_save', 'resume_export', 'resume_publish', 'resume_import_template', 'resume_list_templates', 'resume_market_public', 'resume_install_public', 'resume_publish_public']) {
  assert.ok(byName.has(name), '缺少工具 ' + name);
}
// 模型服务商要求 parameters 根必须是 object schema（否则整条请求会 400，插件装上就报错）
for (const tool of tools) {
  assert.equal(tool.parameters.type, 'object', tool.name + ' 的 parameters 根必须是 object');
  assert.ok(tool.parameters.properties && typeof tool.parameters.properties === 'object', tool.name + ' 缺少 properties');
  if (tool.parameters.required !== undefined) assert.ok(Array.isArray(tool.parameters.required), tool.name + ' 的 required 必须是数组');
  for (const [field, schema] of Object.entries(tool.parameters.properties)) {
    assert.equal(schema.required, undefined, tool.name + '.' + field + ' 字段级不允许 required: true');
  }
  assert.ok(['object', 'array'].includes(tool.output.schema.type), tool.name + ' 的 output.schema 类型不受支持');
}
const listed = await byName.get('resume_market_list').execute({ include: 'all' });
assert.equal(listed.templates.length, 12, '7 内置 + 1 市场安装 + 1 公共市场安装 + 3 模板库新建');
const saved = await byName.get('resume_save').execute({
  title: 'AI 直出简历',
  templateId: 'quiet-luxury',
  data: { basics: { name: '大肥鱼' }, summary: '由工具写入' },
});
assert.ok(saved.resume.id);
const exported = await byName.get('resume_export').execute({ resumeId: saved.resume.id });
const html = await readFile(exported.path, 'utf8');
assert.match(html, /大肥鱼/);

// 收尾：释放 store 并清理临时目录
for (const dispose of disposers.reverse()) {
  try {
    dispose();
  } catch {
    /* ignore */
  }
}
await new Promise((resolve) => setTimeout(resolve, 60));
await rm(dir, { recursive: true, force: true });

console.log('✓ Host 冒烟测试全部通过（路由 / 导出 / 市场 / 工具 / 安全围栏）');
