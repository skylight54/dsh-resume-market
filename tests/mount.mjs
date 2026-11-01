/**
 * Resume Market — client panel mount test (jsdom).
 *
 * Loads lib/client.js exactly like the Web host, mounts the main panel into a
 * jsdom document with a stubbed Host API, and drives the four tabs plus the
 * publish dialog. This exercises the real data flow
 * (fetch -> rmApi -> draft -> editor/preview) and catches render-time errors.
 *
 * Run: node tests/mount.mjs
 */
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TEMPLATES, DEMO_RESUME_DATA, SECTION_ORDER } from '../src/shared/doc.js';
import { seedMarket } from '../src/seed.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const localRequire = createRequire(join(root, '.devrender', 'package.json'));
const React = localRequire('react');
const ReactDOMClient = localRequire('react-dom/client');
const { JSDOM } = localRequire('jsdom');
const act = React.act || localRequire('react-dom/test-utils').act;
// jsdom 里原生 input 事件不会触发 React 18 的 onChange，用 test-utils 的 Simulate 驱动受控输入。
const { Simulate } = localRequire('react-dom/test-utils');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const resume = {
  id: 'r_test_render',
  title: '林知夏 · 高级产品经理',
  templateId: 'business-minimal',
  lang: 'zh',
  sections: SECTION_ORDER.slice(),
  data: JSON.parse(JSON.stringify(DEMO_RESUME_DATA)),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const state = {
  settings: { author: '我', marketUrl: '', marketToken: '', includeSampleByDefault: false },
  resumes: [resume],
  templates: TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    en: t.en,
    tagline: t.tagline,
    tags: t.tags,
    accent: t.accent,
    desc: t.desc,
    css: t.css,
    builtin: true,
  })).concat([
    {
      id: 'my-fixture-template',
      name: '我的模板',
      en: '',
      tagline: '测试自定义模板',
      tags: ['测试'],
      accent: '#445566',
      desc: '',
      cls: 'rm-t-my-fixture-template',
      css: '.rm-t-my-fixture-template{padding:40px}',
      style: { accent: '#445566', nameSize: 32 },
      source: 'custom',
      sample: JSON.parse(JSON.stringify(DEMO_RESUME_DATA)),
      author: '我',
      addedAt: new Date().toISOString(),
    },
  ]),
  market: seedMarket(),
  deleted: [
    {
      id: 'r_trashed',
      title: '我的简历 · 10-30 21:10',
      templateId: 'business-minimal',
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revisions: 2,
    },
  ],
  storeFile: 'C:/tmp/resume-market/store.json',
};

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1:59568/',
  pretendToBeVisual: true,
});
const { window } = dom;
const { document } = window;

// react-dom reads these as bare globals when it schedules updates.
const defineGlobal = (name, value) =>
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
defineGlobal('window', window);
defineGlobal('document', document);
defineGlobal('navigator', window.navigator);
defineGlobal('location', window.location);
defineGlobal('HTMLElement', window.HTMLElement);
defineGlobal('Node', window.Node);

class ResizeObserverStub {
  constructor(cb) {
    this.cb = cb;
  }
  observe() {
    setTimeout(() => this.cb([{ contentRect: { width: 720, height: 1000 } }]), 0);
  }
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub;
globalThis.ResizeObserver = ResizeObserverStub;
window.open = () => null;
window.confirm = () => true;

const json = (value) => ({ json: async () => ({ ok: true, value }) });
const fetchCalls = [];
globalThis.fetch = async (url, init = {}) => {
  const target = String(url);
  fetchCalls.push((init.method || 'GET') + ' ' + target);
  if (target.includes('/github/state') || target.includes('/github/refresh')) {
    return json({
      repo: 'skylight54/dsh-resume-market',
      branch: 'main',
      fetchedAt: new Date().toISOString(),
      stale: false,
      items: [
        {
          id: 'rm-academia',
          name: '学术科研',
          tagline: '衬线字与双线分割',
          tags: ['学术'],
          author: '大肥鱼',
          accent: '#6f6880',
          cls: 'rm-t-academia',
          templateId: 'pub-rm-academia',
          css: '.rm-t-academia{padding:60px 66px;color:#23202b}',
          sample: {
            basics: { name: '周慕云', role: '社会学博士', email: 'zhou@example.com', phone: '138 0013 8000' },
            summary: '研究城市与记忆。',
          },
          file: 'templates/rm-academia.json',
          installs: 2,
          updatedAt: new Date().toISOString(),
        },
      ],
      likes: {},
    });
  }
  if (target.includes('/template/save')) {
    const body = init.body ? JSON.parse(init.body) : {};
    const tpl = body.template || {};
    return json({
      template: {
        ...tpl,
        id: tpl.id || 'my_test_1',
        cls: tpl.cls || 'rm-t-my-test-1',
        source: 'custom',
        style: tpl.style || {},
        sample: tpl.sample || state.templates[0].sample,
      },
    });
  }
  if (target.includes('/template/publish')) {
    const body = init.body ? JSON.parse(init.body) : {};
    return json({
      entry: {
        id: 'm_test_1',
        templateId: body.templateId,
        name: body.title || '我的模板',
        tagline: body.tagline || '',
        cls: 'rm-t-my-test-1',
        css: '.rm-t-my-test-1{padding:20px}',
        sample: state.templates[0].sample,
        source: 'local',
      },
    });
  }
  if (target.includes('/github/publish-template')) {
    return json({
      repo: 'skylight54/dsh-resume-market',
      branch: 'main',
      filename: 'rm-x.json',
      repoPath: 'market/templates/rm-x.json',
      json: '{}',
      payload: {},
      issueUrl: 'https://github.com/skylight54/dsh-resume-market/issues/new',
      newFileUrl: 'https://github.com/skylight54/dsh-resume-market/new/main/market/templates',
    });
  }
  // Host 的兼容插件检测（含已安装插件通过 tools 服务发现的工具）
  if (target.includes('/compat/state')) {
    return json({
      dshHome: 'C:/Users/test/.dsh',
      profile: 'desktop',
      profiles: [{ name: 'desktop', dependencies: 3 }],
      cli: { command: 'dsh.cmd', from: 'path' },
      items: [
        {
          id: 'resume-screening',
          name: 'dsh-resume-screening',
          kind: '筛选',
          tags: ['批量筛选'],
          blurb: '按关键词批量筛选简历。',
          homepage: 'https://www.npmjs.com/package/dsh-resume-screening',
          installSpec: 'dsh-resume-screening',
          installed: true,
          version: '0.2.0',
          source: 'dependency',
          planned: false,
          capabilities: [{ name: 'resume_screen', description: '筛选简历' }],
          hasTools: true,
        },
        {
          id: 'resume-migrator',
          name: '@xrxs-ai/dsh-resume-migrator',
          kind: '迁移',
          tags: ['导入'],
          blurb: '把旧格式简历迁进来。',
          homepage: 'https://www.npmjs.com/package/@xrxs-ai/dsh-resume-migrator',
          installSpec: '@xrxs-ai/dsh-resume-migrator',
          installed: false,
          version: '',
          source: '',
          planned: false,
          capabilities: [],
          hasTools: false,
        },
        {
          id: 'cover-letter',
          name: 'dsh-cover-letter',
          kind: '求职信',
          tags: ['求职信'],
          blurb: '生成配套求职信。',
          homepage: 'https://www.npmjs.com/package/dsh-cover-letter',
          installSpec: 'dsh-cover-letter',
          installed: false,
          version: '',
          source: '',
          planned: true,
          capabilities: [],
          hasTools: false,
        },
      ],
    });
  }
  if (target.endsWith('/state')) return json(state);
  if (target.includes('/resume/duplicate')) return json({ resume: { ...resume, id: 'r_copy' } });
  if (target.includes('/resume/revisions')) {
    return json({ revisions: [{ id: 'v_1', at: new Date().toISOString(), title: resume.title, templateId: resume.templateId, data: resume.data }] });
  }
  if (target.includes('/resume/restore-revision')) return json({ resume });
  if (target.includes('/resume/restore') || target.includes('/resume/purge')) return json({ resume });
  if (target.includes('/export/reveal')) return json({ dir: 'C:/Users/test/.dsh/resume-market/exports' });
  if (target.includes('/export')) {
    const body = init.body ? JSON.parse(init.body) : {};
    const format = body.format || 'html';
    const name = '林知夏.' + format;
    return json({ path: 'C:/Users/test/.dsh/resume-market/exports/' + name, name, dir: 'C:/Users/test/.dsh/resume-market/exports', format });
  }
  if (target.includes('/resume')) {
    const body = init.body ? JSON.parse(init.body) : {};
    return json({ resume: body.resume || { ...resume, ...body } });
  }
  if (target.includes('/settings')) return json({ settings: state.settings });
  return json({ items: [] });
};
window.fetch = globalThis.fetch;

const consoleErrors = [];
const originalConsoleError = console.error;
console.error = (...args) => {
  const text = args.map((a) => (a && a.message ? a.message : String(a))).join(' ');
  consoleErrors.push(text);
  originalConsoleError.apply(console, args);
};

// Load the built client bundle the way window.__ModuleLoader__ does.
const code = await readFile(join(root, 'lib', 'client.js'), 'utf8');
let loaded = null;
window.__ModuleLoader__ = { load: (entry) => (loaded = entry) };
const requireShim = (name) => {
  if (name === 'react') return React;
  throw new Error('unexpected require: ' + name);
};
// eslint-disable-next-line no-new-func
new Function('window', 'require', 'navigator', 'location', 'document', code)(
  window,
  requireShim,
  window.navigator,
  window.location,
  window.document
);
if (!loaded) throw new Error('bundle did not register a module');

const mod = loaded.factory(requireShim);
const registered = [];
const selectedPanels = [];
mod.apply({
  effect(fn) {
    fn();
  },
  locale: { register: () => ({}) },
  slots: {
    inject: (_name, fn) => fn(),
    register: (definition, component) => {
      registered.push({ definition, component });
      return () => {};
    },
  },
  layout: { selectPanel: (key) => { selectedPanels.push(key); } },
});
const panel = registered.find((r) => r.definition.name === 'main');
if (!panel) throw new Error('panel registration missing');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const container = document.getElementById('root');
const reactRoot = ReactDOMClient.createRoot(container);

const byText = (selector, text) => [...document.querySelectorAll(selector)].find((el) => el.textContent.trim() === text);
const text = () => container.textContent || '';

const fail = [];
const check = (ok, message) => {
  if (!ok) fail.push(message);
};

await act(async () => {
  // real host 会把 inject 的返回值作为面板 props（含 layout），这里照同样方式挂载
  const panelProps = panel.definition.inject ? panel.definition.inject() : {};
  reactRoot.render(React.createElement(panel.component, panelProps));
  await sleep(60);
});

// --- editor tab: structured fields, not one blob -------------------------
check(!!container.querySelector('.rm-root'), 'panel root missing');
check(!!container.querySelector('.rm-editor'), 'editor layout missing');
const fields = [...container.querySelectorAll('.rm-fields .rm-field')];
check(fields.length >= 8, 'expected >=8 basic-info fields, got ' + fields.length);
for (const label of ['姓名', '求职意向', '电话', '邮箱', '城市', '微信', 'GitHub', '主页']) {
  check(text().includes(label), 'basic-info label missing: ' + label);
}
const values = fields.map((el) => {
  const input = el.querySelector('input, textarea');
  return input ? input.value : '';
});
check(values.includes(DEMO_RESUME_DATA.basics.name), 'name field missing value: ' + DEMO_RESUME_DATA.basics.name);
check(values.includes(DEMO_RESUME_DATA.basics.phone), 'phone field missing value');
check(values.includes(DEMO_RESUME_DATA.basics.email), 'email field missing value');

// --- photo block: 可选照片 + 位置 / 形状控制 ------------------------------
check(!!container.querySelector('.rm-photo-edit'), 'photo upload block missing');
check(text().includes('上传照片'), 'photo upload button missing');
check(text().includes('左侧') && text().includes('右侧'), 'photo position toggles missing');
check(text().includes('圆形') && text().includes('方形'), 'photo shape toggles missing');

// --- section order: 教育背景可以移到项目经历前面 -------------------------
const orderRows = () => [...container.querySelectorAll('.rm-order-row')];
const rowName = (row) => row.querySelector('.rm-order-name').textContent.trim();
check(orderRows().length === 8, 'section order rows expected 8, got ' + orderRows().length);
check(rowName(orderRows()[0]) === '个人简介', 'first section should be 个人简介, got ' + (rowName(orderRows()[0]) || ''));
for (let i = 0; i < 2; i++) {
  const row = orderRows().find((r) => rowName(r) === '教育背景');
  const up = row && row.querySelectorAll('.rm-item-tools .rm-mini')[0];
  await act(async () => {
    if (up) up.click();
    await sleep(30);
  });
}
const orderNames = orderRows().map(rowName);
check(
  orderNames.indexOf('教育背景') >= 0 && orderNames.indexOf('教育背景') < orderNames.indexOf('项目经历'),
  'education should move before projects, got: ' + orderNames.join(',')
);
const previewSecs = [...container.querySelectorAll('.rm-preview-col .rm-sec')].map((el) => String(el.className));
const eduIdx = previewSecs.findIndex((c) => c.includes('rm-sec-education'));
const projIdx = previewSecs.findIndex((c) => c.includes('rm-sec-projects'));
check(eduIdx >= 0 && projIdx >= 0 && eduIdx < projIdx, 'preview order should follow editor order: ' + JSON.stringify(previewSecs));

// --- 拖动把手：HTML5 draggable + grab 光标 --------------------------------
const grips = [...container.querySelectorAll('.rm-order-row .rm-order-grip')];
check(grips.length === 8, 'section rows should each have a drag grip, got ' + grips.length);
check(grips.every((g) => g.getAttribute('draggable') === 'true'), 'visible section grips should be draggable');
check(
  grips.length > 0 && dom.window.getComputedStyle(grips[0]).cursor === 'grab',
  'drag grip cursor should be grab, got ' + (grips[0] ? dom.window.getComputedStyle(grips[0]).cursor : 'none')
);
const sectionTools = orderRows().map((r) => r.querySelectorAll('.rm-item-tools .rm-mini').length);
check(sectionTools.every((n) => n === 3), 'section rows should have 3 compact buttons (↑ ↓ eye), got ' + JSON.stringify(sectionTools));

// --- 主修课程：教育背景里的可选字段，实时进预览 ---------------------------
const coursesInput = container.querySelector('input[placeholder="数据结构、计量经济学"]');
check(!!coursesInput, 'education 主修课程 input missing');
check(text().includes('主修课程'), 'education 主修课程 label missing');
if (coursesInput) {
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  const courseText = '数据结构、计量经济学';
  await act(async () => {
    valueSetter.call(coursesInput, courseText);
    Simulate.change(coursesInput, { target: { value: courseText } });
    await sleep(50);
  });
  const eduCourses = container.querySelector('.rm-preview-col .rm-edu-courses');
  check(!!eduCourses, 'preview should render 主修课程 row');
  check(
    !!eduCourses && eduCourses.textContent.includes(courseText),
    'preview 主修课程 content wrong: ' + (eduCourses ? eduCourses.textContent : 'missing')
  );
}

// --- 隐藏 / 显示：点眼睛后预览立刻少一节，再点恢复 ------------------------
const sectionRow = (name) => orderRows().find((r) => rowName(r) === name);
const eyeOf = (row) => row.querySelectorAll('.rm-item-tools .rm-mini')[2];
let eduRow = sectionRow('教育背景');
check(!!eduRow && !!eyeOf(eduRow), 'education section eye button missing');
await act(async () => {
  eyeOf(eduRow).click();
  await sleep(40);
});
check(orderRows().length === 8, 'hidden section should stay in the list, got ' + orderRows().length);
const hiddenRow = sectionRow('教育背景');
check(!!hiddenRow && hiddenRow.className.includes('is-hidden'), 'hidden section row should be greyed (is-hidden)');
check(!container.querySelector('.rm-preview-col .rm-sec-education'), 'hidden section should leave the preview');
check(text().includes('灰色模块已隐藏'), 'hidden sections hint missing');
await act(async () => {
  eyeOf(sectionRow('教育背景')).click();
  await sleep(40);
});
const shownRow = sectionRow('教育背景');
check(!!shownRow && !shownRow.className.includes('is-hidden'), 'restored section row should be visible again');
check(!!container.querySelector('.rm-preview-col .rm-sec-education'), 'restored section should come back to the preview');
check(!!container.querySelector('.rm-preview-col .rm-edu-courses'), '主修课程 should still render after restore');

// --- preview: paper + contact grid ---------------------------------------
const contactCells = container.querySelectorAll('.rm-preview-col .rm-contact .rm-k');
check(!!container.querySelector('.rm-preview-col .rm-paper'), 'A4 preview paper missing');
check(contactCells.length === 6, 'preview contact cells expected 6, got ' + contactCells.length);

// --- preview: 模板 class 与模板 CSS 必须对上（否则就是一张纯白纸） ---
const paper = container.querySelector('.rm-preview-col .rm-paper');
check(!!paper, 'preview paper element missing');
const paperClass = paper ? String(paper.className) : '';
check(paperClass.includes('rm-t-business'), 'paper root class should be rm-t-business, got: ' + paperClass);
const paperStyle = paper ? dom.window.getComputedStyle(paper) : null;
check(paperStyle && paperStyle.paddingTop === '54px', 'business template padding not applied, got: ' + (paperStyle ? JSON.stringify(paperStyle.paddingTop) : 'no style'));
const primaryBtn = container.querySelector('.rm-btn-primary') || byText('.rm-btn', '导出 ▾');
check(!!primaryBtn, 'primary action button missing');
check(text().includes('工作经历'), 'preview/editor missing experience section');

// --- preview: 缩放工具条（缩小/适合宽度/100%/放大） ---
const zoomBar = container.querySelector('.rm-preview-zoom');
check(!!zoomBar, 'preview zoom toolbar missing');
const zoomBtns = zoomBar ? [...zoomBar.querySelectorAll('button')] : [];
check(zoomBtns.length === 4, 'zoom toolbar should have 4 buttons, got ' + zoomBtns.length);
const pctEl = zoomBar ? zoomBar.querySelector('.rm-zoom-pct') : null;
check(!!pctEl && /^\d+%$/.test(pctEl.textContent.trim()), 'zoom percentage missing, got: ' + (pctEl ? pctEl.textContent : 'none'));
check(!!byText('.rm-preview-zoom .rm-btn', '适合宽度'), '适合宽度 button missing');
const zoomIn = zoomBtns.find((b) => b.getAttribute('aria-label') === '放大');
check(!!zoomIn, '放大 button missing');
const beforePct = pctEl ? parseInt(pctEl.textContent, 10) : 0;
await act(async () => { if (zoomIn) zoomIn.click(); await sleep(20); });
const afterPct = pctEl ? parseInt(pctEl.textContent, 10) : 0;
check(afterPct > beforePct, 'zoom-in should raise percentage, got ' + beforePct + ' -> ' + afterPct);

// --- templates tab --------------------------------------------------------
await act(async () => {
  byText('.rm-tab', '模板库').click();
  await sleep(40);
});
const templateCards = container.querySelectorAll('.rm-stage .rm-tpl');
check(templateCards.length === 8, 'expected 7 builtin + 1 custom template cards, got ' + templateCards.length);
check(text().includes('内置'), 'template builtin pill missing');
check(
  Array.prototype.some.call(templateCards, (card) => String(card.className).includes('is-clickable')),
  'template card should be clickable',
);

// --- 点整张模板卡应直接套用（这是用户报告的「模板库点不了模板」） ---
const cardCallsBefore = fetchCalls.filter((c) => c.includes('/resume-market/api/resume')).length;
await act(async () => {
  templateCards[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(120);
});
const cardCallsAfter = fetchCalls.filter((c) => c.includes('/resume-market/api/resume')).length;
check(cardCallsAfter > cardCallsBefore, 'clicking template card should apply it (POST /resume), got: ' + JSON.stringify(fetchCalls.slice(-3)));

// --- market tab -----------------------------------------------------------
await act(async () => {
  byText('.rm-tab', '模板市场').click();
  await sleep(60);
});
const marketCards = container.querySelectorAll('.rm-stage .rm-tpl');
check(marketCards.length === 3, 'expected 3 seeded market cards, got ' + marketCards.length);
check(text().includes('大肥鱼'), 'market author 大肥鱼 missing');

// --- 公共市场（GitHub）切换 ----------------------------------------------
await act(async () => {
  byText('.rm-seg-btn', '公共市场').click();
  await sleep(90);
});
const pubCards = container.querySelectorAll('.rm-stage .rm-tpl');
check(pubCards.length === 1, 'expected 1 public market card, got ' + pubCards.length);
check(text().includes('公共市场 · GitHub'), 'public market title missing');
check(text().includes('学术科研'), 'public market item name missing');
check(
  fetchCalls.some((call) => call.includes('/github/state')),
  'github state was not fetched'
);
// 公共市场卡片必须是真实 A4 缩略预览（index 内联 css + sample），不是色块兜底
const pubThumb = pubCards[0].querySelector('.rm-tpl-thumb .rm-scaled');
check(!!pubThumb, 'public market card is missing real A4 thumbnail');
const pubPaper = pubThumb && pubThumb.querySelector('.rm-paper.rm-t-academia');
check(!!pubPaper, 'public market thumbnail is not using template cls');
check(!!(pubPaper && pubPaper.querySelector('.rm-contact')), 'public market thumbnail sample resume missing');

// --- 我的简历 tab：列表 + 回收站 -----------------------------------------
await act(async () => {
  byText('.rm-tab', '我的简历').click();
  await sleep(50);
});
const resumeRows = [...container.querySelectorAll('.rm-stage .rm-resume-row')];
check(resumeRows.length === 2, 'expected 1 active + 1 trashed resume row, got ' + resumeRows.length);
check(!!container.querySelector('.rm-stage .rm-resume-row.is-trash'), 'trash row missing');
check(text().includes('回收站'), 'trash section missing');
check(text().includes('恢复'), 'restore button missing');
check(text().includes('彻底删除'), 'purge button missing');

// --- settings tab ---------------------------------------------------------
await act(async () => {
  byText('.rm-tab', '设置').click();
  await sleep(140);
});
check(text().includes('数据'), 'settings view missing');

// --- 兼容插件卡片：插件市场跳转 + 已安装能力 chips + AI 工具开关 ---------
check(fetchCalls.some((call) => call.includes('/compat/state')), 'compat state 未被请求');
check(!!byText('.rm-btn', '打开插件市场'), '兼容插件卡片缺少「打开插件市场」');
check(!!byText('.rm-btn', '重新检测'), '兼容插件卡片缺少「重新检测」');
check(!!byText('.rm-btn', '去插件市场'), '未安装插件缺少「去插件市场」');
check(!!byText('.rm-btn', '直接安装'), '未安装插件缺少「直接安装」');
check(text().includes('已安装 · 已启用'), '已安装插件缺少「已安装 · 已启用」pill');
check(text().includes('工具：resume_screen'), '已安装插件的能力 chip missing');
check(text().includes('允许 AI 对话调用已安装插件的工具'), 'chatTools 勾选框 missing');
check(!!byText('.rm-btn', '暂未上线'), 'planned 插件缺少「暂未上线」禁用按钮');
const marketBtn = byText('.rm-btn', '打开插件市场');
await act(async () => {
  marketBtn.click();
  await sleep(40);
});
check(selectedPanels.includes('dsh-market'), '「打开插件市场」没有调用 layout.selectPanel(dsh-market)，got: ' + JSON.stringify(selectedPanels));
check(text().includes('已切到插件市场面板'), '「打开插件市场」缺少 toast 提示');

// --- 模板库：新建 / 编辑 / 图片生成 / 发布 -------------------------------
await act(async () => {
  byText('.rm-tab', '模板库').click();
  await sleep(40);
});
check(!!byText('.rm-btn', '+ 新建模板'), '模板库缺少「+ 新建模板」');
check(!!byText('.rm-btn', '从文件生成'), '模板库缺少「从文件生成」');
check(!!byText('.rm-btn', '复制为新模板'), '内置模板应提供「复制为新模板」');
await act(async () => {
  byText('.rm-btn', '+ 新建模板').click();
  await sleep(70);
});
check(!!container.querySelector('.rm-tpl-editor-form'), '模板编辑器表单未打开');
check(!!container.querySelector('.rm-modal .rm-paper'), '模板编辑器缺少 A4 实时预览');
check(!!container.querySelector('.rm-tpl-editor-form input[type="color"]'), '编辑器缺少颜色输入');
await act(async () => {
  const nameInput = container.querySelector('.rm-tpl-editor-form input.rm-input');
  if (nameInput) Simulate.change(nameInput, { target: { value: '验收模板' } });
  await sleep(60);
});
const editedNameInput = container.querySelector('.rm-tpl-editor-form input.rm-input');
check(
  editedNameInput && editedNameInput.value === '验收模板',
  '模板名称输入未受控更新'
);
await act(async () => {
  byText('.rm-btn', '保存').click();
  await sleep(150);
});
check(
  fetchCalls.some((c) => c.startsWith('POST ') && c.includes('/template/save')),
  '保存模板请求未发出'
);
check(!container.querySelector('.rm-tpl-editor-form'), '保存后模板编辑器应关闭');
await act(async () => {
  byText('.rm-btn', '从文件生成').click();
  await sleep(70);
});
check(!!container.querySelector('input[type="file"]'), '图片导入弹窗未出现文件选择');
await act(async () => {
  byText('.rm-btn', '取消').click();
  await sleep(30);
});

// --- 模板发布弹窗 ---------------------------------------------------------
const publishTemplateButton = byText('.rm-btn', '发布');
check(!!publishTemplateButton, '自定义模板应提供「发布」按钮');
if (publishTemplateButton) {
  await act(async () => {
    publishTemplateButton.click();
    await sleep(60);
  });
  check(!!container.querySelector('.rm-modal'), '模板发布弹窗未打开');
  await act(async () => {
    byText('.rm-btn', '取消').click();
    await sleep(30);
  });
}

// --- export menu：三种格式可选，导出后显示落盘路径 ------------------------
await act(async () => {
  byText('.rm-tab', '编辑简历').click();
  await sleep(40);
});
check(!byText('.rm-btn', '打印 / PDF'), '旧版「打印 / PDF」按钮应已移除');
await act(async () => {
  byText('.rm-btn', '导出 ▾').click();
  await sleep(40);
});
const menuItems = Array.from(container.querySelectorAll('.rm-menu .rm-menu-item')).map((el) => el.textContent);
check(menuItems.length === 3, 'export menu should offer 3 formats, got ' + JSON.stringify(menuItems));
check(menuItems.some((t) => t.includes('HTML')) && menuItems.some((t) => t.includes('Word')) && menuItems.some((t) => t.includes('PDF')), 'export menu labels wrong: ' + JSON.stringify(menuItems));
await act(async () => {
  byText('.rm-menu-item', '导出 Word (.docx)').click();
  await sleep(80);
});
check(!!container.querySelector('.rm-modal .rm-path'), 'export dialog path missing');
check(text().includes('exports') && text().includes('.doc'), 'export dialog should show the .doc path');
check(text().includes('打开所在文件夹'), 'export dialog reveal button missing');
check(text().includes('换个格式再导一份'), 'export dialog should offer other formats');
const exportCall = fetchCalls.filter((c) => c.startsWith('POST ') && c.includes('/resume-market/api/export')).pop();
check(!!exportCall, 'export request missing');
await act(async () => {
  byText('.rm-btn', '知道了').click();
  await sleep(20);
});
check(!container.querySelector('.rm-modal'), 'export dialog did not close');

// --- revisions dialog ----------------------------------------------------
await act(async () => {
  byText('.rm-btn', '历史版本').click();
  await sleep(80);
});
check(!!container.querySelector('.rm-modal .rm-rev-row'), 'revisions dialog rows missing');
check(text().includes('恢复到这里'), 'revision restore button missing');
await act(async () => {
  byText('.rm-btn', '关闭').click();
  await sleep(20);
});

const fatalErrors = consoleErrors.filter(
  (line) => !/not wrapped in act|ReactDOMTestUtils.act|Warning: ReactDOMTestUtils/.test(line)
);
check(fatalErrors.length === 0, 'console errors: ' + JSON.stringify(fatalErrors.slice(0, 5)));

console.error = originalConsoleError;
const htmlBytes = container.innerHTML.length;
await act(async () => {
  reactRoot.unmount();
});
dom.window.close();

if (fail.length) {
  console.error('mount test FAILED');
  for (const message of fail) console.error(' - ' + message);
  process.exit(1);
}

console.log('mount ok:', {
  html: htmlBytes + 'b',
  fetchCalls,
  editorFields: fields.length,
  previewContactCells: contactCells.length,
  templateCards: templateCards.length,
  marketCards: marketCards.length,
  consoleErrors: consoleErrors.length,
});
