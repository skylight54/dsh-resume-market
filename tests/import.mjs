/**
 * tests/import.mjs —— 多来源模板导入（doc / docx / pdf）的离线测试。
 *
 * 不依赖真实用户文件：docx 用自己拼的最小 zip，pdf 用手写对象表 + 内容流，
 * doc 用 Word 另存 HTML 的典型结构。全部只走 node 内置模块。
 */
import assert from 'node:assert/strict';
import { deflateRawSync, deflateSync } from 'node:zlib';

import {
  IMPORT_MAX_BYTES,
  ImportError,
  detectKind,
  importTemplateFile,
  mapModelToDraft,
  parseDoc,
  parseDocx,
  parsePdf,
} from '../src/template-import.js';
import { PREFIX, createHandler } from '../src/routes.js';

let checks = 0;
const failures = [];
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

/* ---------------- fixture：最小 zip / docx ---------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let k = 0; k < 8; k++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

/** 拼一个最小 zip（deflate 压缩），只包含解析器需要的结构。 */
function makeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  files.forEach((file) => {
    const name = Buffer.from(file.name, 'utf8');
    const data = Buffer.from(file.data);
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + compressed.length;
  });
  const centralBuffer = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([Buffer.concat(locals), centralBuffer, eocd]);
}

function makeDocx() {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="56"/><w:color w:val="1F4E79"/><w:rFonts w:ascii="Calibri"/></w:rPr><w:t>张三</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>邮箱：zhang.san@example.com 电话：138 0000 1234</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="1F4E79"/></w:rPr><w:t>工作经历</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>负责产品从 0 到 1 的规划与落地，主导三个版本迭代。</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>把续费率提升 18%</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;
  return makeZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types/>' },
    { name: 'word/document.xml', data: documentXml },
  ]);
}

function makeDocHtml() {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>李四的简历</title>
<style>body{font-family:"Times New Roman"} p{margin:0}</style></head>
<body>
<h1 style="color:#1f2d3d;font-size:24pt;font-weight:bold">李四</h1>
<p style="font-size:11pt;color:#555555">邮箱：li.si@example.com｜电话：139 0000 8888｜北京</p>
<h2 style="color:#1f2d3d;font-size:16pt">技能</h2>
<table><tr><td>Axure</td><td>SQL / Python</td></tr></table>
<p style="font-size:12pt;color:#333333">负责增长业务，年度 GMV 提升 40%。</p>
</body></html>`;
  return Buffer.from(html, 'utf8');
}

function makePdf(options) {
  const compress = !!(options && options.compress);
  const lines = [
    'BT',
    '/F1 24 Tf',
    '0.12 0.31 0.47 rg',
    '1 0 0 1 72 760 Tm',
    '(Zhang San) Tj',
    'ET',
    'BT',
    '/F1 10 Tf',
    '0.2 0.2 0.2 rg',
    '1 0 0 1 72 730 Tm',
    '(Email: zhang.san@example.com) Tj',
    'ET',
    'BT',
    '/F1 10 Tf',
    '1 0 0 1 72 700 Tm',
    '(Phone: +86 138 0000 1234) Tj',
    'ET',
    'BT',
    '/F1 13 Tf',
    '1 0 0 1 72 660 Tm',
    '(Work Experience) Tj',
    'ET',
  ];
  const plain = Buffer.from(lines.join('\n'), 'latin1');
  const stream = compress ? deflateSync(plain) : plain;
  const filter = compress ? ' /Filter /FlateDecode' : '';
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];
  const streamObject = Buffer.concat([
    Buffer.from('5 0 obj\n<< /Length ' + stream.length + filter + ' >>\nstream\n', 'latin1'),
    stream,
    Buffer.from('\nendstream\nendobj\n', 'latin1'),
  ]);
  return Buffer.concat([
    Buffer.from('%PDF-1.4\n', 'latin1'),
    ...objects.map((item) => Buffer.from(item, 'latin1')),
    streamObject,
    Buffer.from('%%EOF\n', 'latin1'),
  ]);
}

/* ---------------- fixture：路由驱动（照 tests/smoke.mjs 的 fake ctx 写法） ---------------- */

function makeHandler() {
  const store = {
    file: 'memory-store.json',
    whenReady: async () => {},
    settings: () => ({}),
    snapshot: () => ({ settings: {}, resumes: [], deleted: [] }),
    listTemplates: () => [],
  };
  const ctx = {
    logger: { info() {}, warn() {}, log() {} },
    effect(fn) {
      return typeof fn === 'function' ? fn() : fn;
    },
    get(name) {
      if (name === 'webRuntime') return { trustedHosts: [] };
      return undefined;
    },
    webServer: { register() { return () => {}; }, getOrigin() { return 'http://127.0.0.1:59568'; } },
    tools: { register() {} },
  };
  return createHandler({ ctx, store });
}

function call(handle, method, path, body) {
  return new Promise((resolve, reject) => {
    const listeners = { data: [], end: [], error: [], destroy: [] };
    const req = {
      method,
      url: PREFIX + path,
      headers: { host: '127.0.0.1:59568', 'content-type': 'application/json' },
      on(event, fn) {
        (listeners[event] = listeners[event] || []).push(fn);
        return req;
      },
      destroy() {},
    };
    let status = 0;
    const headers = {};
    const chunks = [];
    const res = {
      writeHead(code, extra) {
        status = code;
        Object.assign(headers, extra || {});
      },
      setHeader(name, value) {
        headers[String(name).toLowerCase()] = value;
      },
      end(chunk) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      },
    };
    const pending = handle(req, res);
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    setTimeout(() => {
      if (payload) listeners.data.forEach((fn) => fn(payload));
      listeners.end.forEach((fn) => fn());
    }, 0);
    pending
      .then(() => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
        resolve({ status, headers, body: text, json });
      })
      .catch(reject);
  });
}

function expectImportError(fn, code, label) {
  let caught = null;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  check(caught instanceof ImportError, label + ' 应抛 ImportError');
  check(caught && caught.code === code, label + ' 错误码应为 ' + code + '（实际 ' + (caught && caught.code) + '）');
}

const docxBuffer = makeDocx();
const docBuffer = makeDocHtml();
const pdfBuffer = makePdf({ compress: false });
const pdfFlateBuffer = makePdf({ compress: true });

/* ---------------- 1. 类型识别 ---------------- */
check(detectKind(docxBuffer) === 'docx', 'detectKind: docx');
check(detectKind(docBuffer) === 'doc', 'detectKind: doc(HTML)');
check(detectKind(pdfBuffer) === 'pdf', 'detectKind: pdf');
check(detectKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) === 'image', 'detectKind: png');
check(detectKind(Buffer.from('hello world')) === 'unsupported', 'detectKind: 随机文本 = unsupported');
check(detectKind(Buffer.alloc(0)) === 'unsupported', 'detectKind: 空 buffer = unsupported');
const oleDoc = Buffer.alloc(16);
oleDoc.writeUInt32BE(0xd0cf11e0, 0);
oleDoc.writeUInt32BE(0xa1b11ae1, 4);
check(detectKind(oleDoc) === 'doc', 'detectKind: 旧版 .doc OLE 头');

/* ---------------- 2. docx 解析 ---------------- */
const docxModel = parseDocx(docxBuffer, '我的简历.docx');
check(docxModel.kind === 'docx', 'docx: kind');
check(docxModel.sourceName === '我的简历.docx', 'docx: sourceName');
check(docxModel.blocks.length >= 4, 'docx: 至少 4 个文本块（实际 ' + docxModel.blocks.length + '）');
const docxName = docxModel.blocks.find((block) => block.role === 'name');
check(!!docxName && docxName.text === '张三', 'docx: 识别出姓名「张三」');
check(!!docxName && docxName.color.toLowerCase() === '#1f4e79', 'docx: 姓名颜色 #1f4e79');
check(!!docxName && docxName.size >= 30, 'docx: 姓名字号放大（实际 ' + (docxName && docxName.size) + 'px）');
check(
  docxModel.blocks.some((block) => block.role === 'contact' && /zhang\.san@example\.com/.test(block.text)),
  'docx: 联系方式块识别',
);
check(docxModel.blocks.some((block) => block.role === 'heading' && block.text === '工作经历'), 'docx: 模块标题识别');
check(docxModel.blocks.some((block) => block.role === 'bullet' && block.text.indexOf('续费率') !== -1), 'docx: 列表项识别');
check(docxModel.colors.indexOf('#1f4e79') !== -1, 'docx: colors 收集到强调色');
check(/Calibri/.test(docxModel.fonts.join(' ')), 'docx: fonts 收集到 Calibri');

/* ---------------- 3. doc(HTML) 解析 ---------------- */
const docModel = parseDoc(docBuffer, '李四.doc');
check(docModel.kind === 'doc', 'doc: kind');
const docName = docModel.blocks.find((block) => block.role === 'name');
check(!!docName && docName.text === '李四', 'doc: 识别出姓名「李四」');
check(!!docName && docName.color === '#1f2d3d', 'doc: h1 内联颜色 #1f2d3d');
check(docModel.blocks.some((block) => block.role === 'contact'), 'doc: 联系方式块识别');
check(docModel.text.indexOf('Axure') !== -1 && docModel.text.indexOf('SQL / Python') !== -1, 'doc: 表格单元格文本');
check(/Times New Roman/.test(docModel.fonts.join(' ')), 'doc: 内联 font-family 收集');
expectImportError(() => parseDoc(oleDoc, '旧简历.doc'), 'import/legacy-doc', 'doc: 旧版二进制');

/* ---------------- 4. pdf 解析（含 FlateDecode） ---------------- */
const pdfModel = parsePdf(pdfBuffer, 'resume.pdf');
check(pdfModel.kind === 'pdf', 'pdf: kind');
check(pdfModel.text.indexOf('Zhang San') !== -1, 'pdf: 提取到姓名文本');
check(pdfModel.blocks.find((block) => block.role === 'name') !== undefined, 'pdf: 姓名角色');
check(pdfModel.blocks.some((block) => block.role === 'contact'), 'pdf: 联系方式角色');
check(pdfModel.page.width > 760 && pdfModel.page.width < 820, 'pdf: 页面宽度按 A4 换算（实际 ' + pdfModel.page.width + '）');
const pdfFlateModel = parsePdf(pdfFlateBuffer, 'resume-flate.pdf');
check(pdfFlateModel.text.indexOf('Zhang San') !== -1, 'pdf: FlateDecode 内容流可解');
expectImportError(
  () => parsePdf(Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Encrypt << /Filter /Standard >> >>\nendobj\n'), 'locked.pdf'),
  'import/encrypted',
  'pdf: 加密文档',
);

/* ---------------- 5. 模型 → 初稿 ---------------- */
const draft = mapModelToDraft(docxModel);
check(/^#[0-9a-f]{6}$/.test(draft.style.colors.accent), 'draft: accent 是合法 hex（' + draft.style.colors.accent + '）');
check(draft.style.colors.accent.toLowerCase() === '#1f4e79', 'draft: accent 采纳文档强调色');
check(draft.sample.basics.name === '张三', 'draft: 示例数据姓名');
check(typeof draft.name === 'string' && draft.name.indexOf('初稿') !== -1, 'draft: 名称带初稿后缀');
check(
  ['rule', 'bar', 'underline', 'plain', 'banner', 'tab', 'pill', 'icon', 'leftbar'].indexOf(draft.style.headingStyle) !== -1,
  'draft: headingStyle 合法',
);
check(['single', 'sidebar'].indexOf(draft.style.layout) !== -1, 'draft: layout 合法');
check(['plain', 'band', 'split', 'ribbon'].indexOf(draft.style.headerStyle) !== -1, 'draft: headerStyle 合法');
check(draft.style.nameSize >= 20 && draft.style.nameSize <= 52, 'draft: nameSize 在范围内');
check(draft.style.bodySize >= 10 && draft.style.bodySize <= 18, 'draft: bodySize 在范围内');
const emptyDraft = mapModelToDraft({ kind: 'image', sourceName: 'k.png', page: { width: 794, height: 1123 }, blocks: [], colors: [], fonts: [], text: '' });
check(/^#[0-9a-f]{6}$/.test(emptyDraft.style.colors.accent), 'draft: 空模型仍给默认 accent');
check(emptyDraft.sample.basics.name === '', 'draft: 空模型 sample 不编造姓名');

/* ---------------- 6. importTemplateFile 统一入口 ---------------- */
const imported = importTemplateFile({ name: '张三.docx', buffer: docxBuffer });
check(imported.model.kind === 'docx' && imported.draft.style, 'importTemplateFile: 返回 model + draft');
expectImportError(
  () => importTemplateFile({ name: 'a.pdf', buffer: Buffer.alloc(IMPORT_MAX_BYTES + 1) }),
  'import/too-large',
  'importTemplateFile: 超限',
);
expectImportError(() => importTemplateFile({ name: 'a.txt', buffer: Buffer.from('hello world') }), 'import/unsupported', 'importTemplateFile: 不支持');
expectImportError(() => importTemplateFile({ name: 'a.docx', buffer: Buffer.alloc(0) }), 'import/empty', 'importTemplateFile: 空文件');
const imageImport = importTemplateFile({ name: 'shot.png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]) });
check(imageImport.model.kind === 'image' && imageImport.model.note, 'importTemplateFile: 图片返回说明性空模型');

/* ---------------- 7. 路由 POST /template/import ---------------- */
const handle = makeHandler();
const docxB64 = docxBuffer.toString('base64');
const routeOk = await call(handle, 'POST', '/template/import', { name: '张三.docx', data: docxB64 });
check(routeOk.status === 200, 'route: 200（实际 ' + routeOk.status + '）');
check(!!routeOk.json && routeOk.json.ok === true, 'route: ok 信封');
check(!!routeOk.json && routeOk.json.value && routeOk.json.value.model.kind === 'docx', 'route: value.model.kind');
check(!!routeOk.json && !!routeOk.json.value.draft && /^#[0-9a-f]{6}$/.test(routeOk.json.value.draft.style.colors.accent), 'route: value.draft.style');
check(routeOk.json && routeOk.json.value.model.blocks.length >= 4, 'route: 模型带文本块');

const routeMissing = await call(handle, 'POST', '/template/import', { name: 'x.docx' });
check(routeMissing.status === 400 && routeMissing.json.error.code === 'import/missing-data', 'route: 缺 data → 400 import/missing-data');
const routeBadType = await call(handle, 'POST', '/template/import', { name: 'x.txt', data: Buffer.from('hello world').toString('base64') });
check(routeBadType.status === 400 && routeBadType.json.error.code === 'import/unsupported', 'route: 不支持类型 → 400 import/unsupported');
const routeTooLarge = await call(handle, 'POST', '/template/import', { name: 'big.pdf', data: Buffer.alloc(8.5 * 1024 * 1024).toString('base64') });
check(routeTooLarge.status === 413 && routeTooLarge.json.error.code === 'import/too-large', 'route: 超限 → 413 import/too-large');
const routeLegacy = await call(handle, 'POST', '/template/import', { name: 'old.doc', data: oleDoc.toString('base64') });
check(routeLegacy.status === 422 && routeLegacy.json.error.code === 'import/legacy-doc', 'route: 旧版 .doc → 422 import/legacy-doc');
const routePdf = await call(handle, 'POST', '/template/import', { name: 'r.pdf', data: pdfFlateBuffer.toString('base64') });
check(routePdf.status === 200 && routePdf.json.value.model.text.indexOf('Zhang San') !== -1, 'route: pdf（Flate）解析成功');
const routeDoc = await call(handle, 'POST', '/template/import', { name: 'r.doc', data: docBuffer.toString('base64') });
check(routeDoc.status === 200 && routeDoc.json.value.draft.sample.basics.name === '李四', 'route: doc 解析并生成初稿');
const routeBadB64 = await call(handle, 'POST', '/template/import', { name: 'x.pdf', data: '!!!not-base64!!!' });
check(routeBadB64.status === 400 || routeBadB64.status === 422, 'route: 坏 base64 → 4xx（实际 ' + routeBadB64.status + '）');

/* ---------------- 结果 ---------------- */
if (failures.length) {
  assert.fail('import 测试失败 ' + failures.length + '/' + checks + ' 项：\n- ' + failures.join('\n- '));
}
console.log('import ok: ' + checks + ' 项断言通过（docx / doc / pdf / 路由 / 初稿映射）');
