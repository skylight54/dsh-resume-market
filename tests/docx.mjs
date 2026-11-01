/**
 * .docx 生成器测试：真正 OOXML（zip + XML），零依赖。
 *
 * 覆盖 7 个内置模板 + 2 个自定义 style（sidebar / band+pill+centered），
 * 照片（内嵌 png 数据 URL）、多语言、sections 顺序、转义与边界数据。
 * 运行：node tests/docx.mjs
 * 产物：.shot/docx-<模板>.docx、.shot/docx-check.docx（供 LibreOffice 转 PDF/PNG 验收）
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync, inflateRawSync } from 'node:zlib';
import { DEMO_RESUME_DATA, TEMPLATES, emptyResume } from '../src/shared/doc.js';
import { buildDocx } from '../src/word-docx.js';

/* ------------------------------------------------------------------ */
/* 断言与工具                                                          */
/* ------------------------------------------------------------------ */

let passed = 0;
function ok(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    console.error('✗ ' + name);
    console.error('  ' + (err && err.message ? err.message.split('\n')[0] : err));
    process.exitCode = 1;
  }
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** 解析 zip 中央目录，返回 Map<name, {text, data, crc}>；顺带校验每条 CRC。 */
function readZip(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 66000; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  assert.ok(eocd >= 0, 'zip 缺少 EOCD');
  const count = buffer.readUInt16LE(eocd + 10);
  let pos = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i += 1) {
    assert.equal(buffer.readUInt32LE(pos), 0x02014b50, '中央目录条目签名错误');
    const method = buffer.readUInt16LE(pos + 10);
    const crc = buffer.readUInt32LE(pos + 16);
    const compSize = buffer.readUInt32LE(pos + 20);
    const nameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const cmtLen = buffer.readUInt16LE(pos + 32);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const name = buffer.toString('utf8', pos + 46, pos + 46 + nameLen);
    assert.equal(buffer.readUInt32LE(localOffset), 0x04034b50, name + ' 本地头签名错误');
    const start =
      localOffset +
      30 +
      buffer.readUInt16LE(localOffset + 26) +
      buffer.readUInt16LE(localOffset + 28);
    const raw = buffer.subarray(start, start + compSize);
    const data = method === 0 ? raw : inflateRawSync(raw);
    assert.equal(crc32(data), crc, name + ' CRC 不匹配');
    entries.set(name, { data, text: data.toString('utf8') });
    pos += 46 + nameLen + extraLen + cmtLen;
  }
  return entries;
}

/** 简易 XML 良构检查：标签必须成对、属性引号成对、无孤立的 < 或 &。 */
function xmlBalanced(xml, label) {
  const body = String(xml)
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const stack = [];
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
  let last = 0;
  let m;
  while ((m = re.exec(body))) {
    assert.ok(m.index >= last, label + '：标签顺序异常');
    const between = body.slice(last, m.index);
    assert.ok(!/[<>]/.test(between), label + '：文本里出现裸 < 或 >');
    assert.ok(!/&(?!(?:amp|lt|gt|quot|apos);)/.test(between), label + '：文本里有未转义的 &');
    last = m.index + m[0].length;
    if (m[1] === '/') {
      const open = stack.pop();
      assert.equal(open, m[2], label + '：</' + m[2] + '> 与 <' + open + '> 不匹配');
    } else if (!m[4]) {
      stack.push(m[2]);
    }
  }
  assert.equal(stack.length, 0, label + '：仍有未闭合标签 ' + stack.join(','));
  const tail = body.slice(last);
  assert.ok(!/[<>]/.test(tail), label + '：结尾出现裸 < 或 >');
}

/** w:t 文本节点里不允许控制字符，也不允许未转义 &（Word 会修复提示）。 */
function textNodesOk(xml, label) {
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let m;
  while ((m = re.exec(xml))) {
    const t = m[1];
    assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(t), label + '：w:t 有非法控制字符');
    assert.ok(!/&(?!(?:amp|lt|gt|quot|apos);)/.test(t), label + '：w:t 有未转义 &');
    assert.ok(!/[<>]/.test(t), label + '：w:t 有裸尖括号');
  }
}

function hexToRgb(hex) {
  const v = String(hex || '').replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

function mixHex(a, b, t) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return x
    .map((v, i) => Math.round(v * (1 - t) + y[i] * t).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/** 生成一张真实的小 PNG（用于 data URL 照片）。 */
function pngBuffer(w, h) {
  const chunks = [];
  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length, 0);
    const head = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(head), 0);
    return Buffer.concat([len, head, crc]);
  };
  chunks.push(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  chunks.push(chunk('IHDR', ihdr));
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 3 + 1)] = 0; // filter none
    for (let x = 0; x < w; x += 1) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = 60 + x * 20;
      raw[o + 1] = 120 + y * 40;
      raw[o + 2] = 200;
    }
  }
  // PNG 的 IDAT 是 zlib 数据流（带 zlib 头），不是 raw deflate。
  chunks.push(chunk('IDAT', deflateSync(raw)));
  chunks.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

function photoDataUrl(w, h) {
  return 'data:image/png;base64,' + pngBuffer(w, h).toString('base64');
}

function resumeOf(data, extra) {
  return Object.assign({ title: (data.basics && data.basics.name) || '测试', templateId: TEMPLATES[0].id, lang: 'zh', data: data }, extra || {});
}

function coursesData() {
  const data = JSON.parse(JSON.stringify(DEMO_RESUME_DATA));
  data.education[0].courses = '数据结构、计量经济学';
  return data;
}

function docOf(resume, template) {
  const buf = buildDocx(resume, template);
  assert.ok(Buffer.isBuffer(buf), 'buildDocx 应返回 Buffer');
  return { buf, zip: readZip(buf), xml: readZip(buf).get('word/document.xml').text };
}

const REQUIRED = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/styles.xml'];

/* ------------------------------------------------------------------ */
/* 1. 7 个内置模板                                                      */
/* ------------------------------------------------------------------ */

for (const tpl of TEMPLATES) {
  ok('内置模板 ' + tpl.id + '：包结构 + A4 + 字体 + 内容', () => {
    const { buf, zip, xml } = docOf(resumeOf(coursesData()), tpl);
    assert.ok(buf.length > 3000, tpl.id + ' 文件过小：' + buf.length);
    for (const name of REQUIRED) assert.ok(zip.has(name), tpl.id + ' 缺少 ' + name);
    assert.ok(xml.includes('<w:body>'), tpl.id + ' 缺少 w:body');
    assert.ok(xml.includes('<w:sectPr'), tpl.id + ' 缺少 w:sectPr');
    assert.ok(xml.includes('<w:pgSz w:w="11906" w:h="16838"/>'), tpl.id + ' 缺少 A4 尺寸');
    assert.ok(
      xml.includes('<w:pgMar w:top="652" w:right="822" w:bottom="680" w:left="822" w:header="0" w:footer="0" w:gutter="0"/>'),
      tpl.id + ' 页边距不对'
    );
    assert.ok(xml.includes('Microsoft YaHei'), tpl.id + ' 缺少微软雅黑');
    assert.ok(zip.get('word/styles.xml').text.includes('<w:docDefaults>'), tpl.id + ' 缺少 docDefaults');
    assert.ok(zip.get('[Content_Types].xml').text.includes('wordprocessingml.document.main+xml'), tpl.id + ' 内容类型缺失');
    for (const title of ['个人简介', '工作经历', '项目经历', '教育背景', '专业技能', '荣誉奖项']) {
      assert.ok(xml.includes(title), tpl.id + ' 缺少模块标题 ' + title);
    }
    assert.ok(xml.includes('林知夏'), tpl.id + ' 缺少姓名');
    assert.ok(xml.includes('主修课程'), tpl.id + ' 缺少主修课程');
    assert.ok(xml.includes('数据结构、计量经济学'), tpl.id + ' 缺少课程内容');
    assert.ok(xml.includes('• '), tpl.id + ' 要点缺少圆点');
    xmlBalanced(xml, tpl.id + ' document.xml');
    xmlBalanced(zip.get('word/styles.xml').text, tpl.id + ' styles.xml');
    xmlBalanced(zip.get('[Content_Types].xml').text, tpl.id + ' [Content_Types].xml');
    textNodesOk(xml, tpl.id);
    // 模块顺序：个人简介 → 工作经历 → 项目经历 → 教育背景 → 专业技能 → 荣誉奖项
    let last = -1;
    for (const title of ['个人简介', '工作经历', '项目经历', '教育背景', '专业技能', '荣誉奖项']) {
      const at = xml.indexOf(title);
      assert.ok(at > last, tpl.id + ' 模块顺序不对：' + title);
      last = at;
    }
  });
}

ok('内置模板：页眉色带底纹（band 模板）', () => {
  const accented = { 'fresh-creative': '#7ccab6', 'banner-exec': '#2c6474' };
  for (const [id, accent] of Object.entries(accented)) {
    const tpl = TEMPLATES.find((t) => t.id === id);
    const { xml } = docOf(resumeOf(coursesData()), tpl);
    const fill = mixHex(accent, '#ffffff', 0.84);
    assert.ok(xml.includes('<w:shd w:val="clear" w:color="auto" w:fill="' + fill + '"/>'), id + ' 页眉底纹应为 ' + fill);
  }
});

ok('内置模板：模块标题随 headingStyle 变化', () => {
  // business-minimal：下划线标题（段落下边框）
  const { xml: minimal } = docOf(resumeOf(coursesData()), TEMPLATES.find((t) => t.id === 'business-minimal'));
  assert.ok(minimal.includes('<w:pBdr>') && minimal.includes('1F2328'), 'business-minimal 应有标题下边框色');
  // fresh-creative：左竖条（45 twips 色条）
  const { xml: fresh } = docOf(resumeOf(coursesData()), TEMPLATES.find((t) => t.id === 'fresh-creative'));
  assert.ok(fresh.includes('<w:gridCol w:w="45"/>'), 'fresh-creative 应有 45 twips 竖条');
  // banner-exec：tab 色块标题
  const { xml: banner } = docOf(resumeOf(coursesData()), TEMPLATES.find((t) => t.id === 'banner-exec'));
  assert.ok(banner.includes('<w:shd w:val="clear" w:color="auto" w:fill="2C6474"/>'), 'banner-exec 应有标题色块');
  // split 页眉：时间/联系分列 + accent 下边框
  const { xml: split } = docOf(resumeOf(coursesData()), TEMPLATES.find((t) => t.id === 'quiet-luxury'));
  assert.ok(split.includes('5F7896'), 'quiet-luxury 应有 accent 装饰线');
});

/* ------------------------------------------------------------------ */
/* 2. 自定义 style：sidebar + tab + bandColor                          */
/* ------------------------------------------------------------------ */

const SIDEBAR_TPL = {
  id: 'custom-sidebar',
  name: '深色侧栏',
  accent: '#334155',
  css: '',
  style: {
    layout: 'sidebar',
    headerStyle: 'band',
    headingStyle: 'tab',
    colors: { accent: '#334155', bandColor: '#1f2937' },
  },
};

ok('自定义 style：sidebar 两列 + 深色左栏', () => {
  const { buf, zip, xml } = docOf(resumeOf(coursesData()), SIDEBAR_TPL);
  assert.ok(buf.length > 3000);
  for (const name of REQUIRED) assert.ok(zip.has(name), '缺少 ' + name);
  assert.ok(xml.includes('<w:gridCol w:w="2000"/>'), 'sidebar 左列应为 2000 twips');
  assert.ok(xml.includes('<w:gridCol w:w="8262"/>'), 'sidebar 右列应为 8262 twips');
  assert.ok(xml.includes('<w:tblLayout w:type="fixed"/>'), 'sidebar 应为固定布局');
  assert.ok(xml.includes('<w:shd w:val="clear" w:color="auto" w:fill="1F2937"/>'), '左栏底色应为 bandColor');
  assert.ok(xml.includes('<w:shd w:val="clear" w:color="auto" w:fill="334155"/>'), '标题色块应为 accent');
  // 左栏技能在右栏工作经历之前
  const skill = xml.indexOf('专业技能');
  const work = xml.indexOf('工作经历');
  assert.ok(skill >= 0 && work >= 0 && skill < work, 'sidebar 技能应在左栏（工作经历之前）');
  xmlBalanced(xml, 'sidebar document.xml');
  textNodesOk(xml, 'sidebar');
});

/* ------------------------------------------------------------------ */
/* 3. 自定义 style：band + pill + 居中页眉                              */
/* ------------------------------------------------------------------ */

const PILL_TPL = {
  id: 'custom-pill',
  name: '琥珀胶囊',
  accent: '#b45309',
  css: '',
  style: {
    headerStyle: 'band',
    headingStyle: 'pill',
    headerAlign: 'center',
    colors: { accent: '#b45309' },
  },
};

ok('自定义 style：band + pill + 居中', () => {
  const { xml } = docOf(resumeOf(coursesData()), PILL_TPL);
  const fill = mixHex('#b45309', '#ffffff', 0.82);
  assert.ok(xml.includes('<w:shd w:val="clear" w:color="auto" w:fill="' + fill + '"/>'), '页眉底纹应为 bandColor 默认值 ' + fill);
  assert.ok(xml.includes('<w:shd w:val="clear" w:color="auto" w:fill="B45309"/>'), '胶囊标题应为 accent');
  assert.ok(xml.includes('<w:jc w:val="center"/>'), '居中页眉应生成 jc=center');
  xmlBalanced(xml, 'pill document.xml');
});

/* ------------------------------------------------------------------ */
/* 4. 照片：data URL → word/media + inline drawing                     */
/* ------------------------------------------------------------------ */

ok('照片：内嵌 png → media + 关系 + 圆形裁切', () => {
  const data = coursesData();
  data.basics.photo = photoDataUrl(80, 40); // 2:1，应左右裁切
  data.basics.photoShape = 'circle';
  const { zip, xml } = docOf(resumeOf(data), TEMPLATES.find((t) => t.id === 'business-minimal'));
  assert.ok(zip.has('word/media/photo.png'), '缺少 word/media/photo.png');
  assert.ok(zip.get('[Content_Types].xml').text.includes('image/png'), '缺少 png 内容类型');
  const rels = zip.get('word/_rels/document.xml.rels').text;
  assert.ok(/Id="rIdPhoto"[^>]*Target="media\/photo\.png"/.test(rels), '缺少照片关系');
  assert.ok(rels.includes('relationships/image'), '照片关系类型不对');
  assert.ok(xml.includes('<w:r><w:drawing>') && xml.includes('<wp:inline'), '缺少 run 内的 inline drawing');
  assert.ok(xml.includes('r:embed="rIdPhoto"'), '缺少 blip r:embed');
  assert.ok(xml.includes('cx="819150"') && xml.includes('cy="819150"'), '照片应为 86px = 819150 EMU');
  assert.ok(xml.includes('<a:prstGeom prst="ellipse">'), '圆形照片应为 ellipse');
  assert.ok(xml.includes('<a:srcRect l="25000" r="25000"/>'), '2:1 照片应左右各裁 25%');
  xmlBalanced(xml, 'photo document.xml');
});

ok('照片：方角 + 纵向裁切', () => {
  const data = coursesData();
  data.basics.photo = photoDataUrl(40, 80);
  data.basics.photoShape = 'square';
  const { xml } = docOf(resumeOf(data), TEMPLATES[0]);
  assert.ok(xml.includes('<a:prstGeom prst="roundRect">'), '方角照片应为 roundRect');
  assert.ok(xml.includes('<a:srcRect t="25000" b="25000"/>'), '1:2 照片应上下各裁 25%');
});

ok('照片：photoFit=contain 等比完整（不裁切、按比例缩小）', () => {
  const data = coursesData();
  data.basics.photo = photoDataUrl(80, 40); // 2:1
  data.basics.photoShape = 'square';
  data.basics.photoFit = 'contain';
  const { zip, xml } = docOf(resumeOf(data), TEMPLATES[0]);
  assert.ok(zip.has('word/media/photo.png'), 'contain 仍应写入 media');
  assert.ok(!xml.includes('<a:srcRect'), 'contain 不应出现 srcRect 裁切');
  // 86×86 框内等比：宽 86px=819150 EMU，高 43px=409575 EMU。
  assert.ok(xml.includes('cx="819150"'), 'contain 宽应撑满 86px');
  assert.ok(xml.includes('cy="409575"'), 'contain 高应按 2:1 等比缩到 43px');
  assert.ok(xml.includes('<a:stretch><a:fillRect/></a:stretch>'), 'contain 应保留 fillRect 填充');
  xmlBalanced(xml, 'contain photo document.xml');
});

ok('照片：缺省/旧数据视为 cover，contain+圆形仍用 ellipse', () => {
  const legacy = coursesData();
  legacy.basics.photo = photoDataUrl(80, 40);
  legacy.basics.photoShape = 'square';
  const { xml: coverXml } = docOf(resumeOf(legacy), TEMPLATES[0]);
  assert.ok(coverXml.includes('<a:srcRect l="25000" r="25000"/>'), '没有 photoFit 时应按 cover 裁切');

  const round = coursesData();
  round.basics.photo = photoDataUrl(80, 40);
  round.basics.photoShape = 'circle';
  round.basics.photoFit = 'contain';
  const { xml: roundXml } = docOf(resumeOf(round), TEMPLATES[0]);
  assert.ok(roundXml.includes('<a:prstGeom prst="ellipse">'), 'contain 圆形照片仍应是 ellipse');
  assert.ok(!roundXml.includes('<a:srcRect'), 'contain 圆形照片不裁切');
});

ok('照片：http 外链不抓取', () => {
  const data = coursesData();
  data.basics.photo = 'https://example.com/avatar.png';
  const { zip, xml } = docOf(resumeOf(data), TEMPLATES[0]);
  assert.ok(!zip.has('word/media/photo.png'), '外链照片不应写入 media');
  assert.ok(!xml.includes('<w:drawing>'), '外链照片不应生成 drawing');
});

/* ------------------------------------------------------------------ */
/* 5. 多语言 / sections 顺序 / 转义 / 边界                              */
/* ------------------------------------------------------------------ */

ok('英文简历使用英文标签', () => {
  const data = JSON.parse(JSON.stringify(DEMO_RESUME_DATA));
  data.education[0].courses = 'Data Structures';
  const { xml } = docOf(resumeOf(data, { lang: 'en' }), TEMPLATES[0]);
  for (const label of ['SUMMARY', 'EXPERIENCE', 'PROJECTS', 'EDUCATION', 'SKILLS', 'AWARDS', 'Key courses']) {
    assert.ok(xml.includes(label), 'en 缺少 ' + label);
  }
  assert.ok(!xml.includes('个人简介'), 'en 不应出现中文标签');
});

ok('校园经历 / 兴趣爱好 渲染', () => {
  const data = coursesData();
  data.campus = [
    {
      name: '某某大学学生会',
      role: '外联部部长',
      period: '2016.09 – 2017.06',
      bullets: ['组织迎新晚会，协调 12 个社团'],
    },
    {
      name: '全国大学生创业大赛',
      role: '队长',
      period: '2017.03 – 2017.05',
      bullets: ['带队完成商业计划书，获华东赛区二等奖'],
    },
  ];
  data.hobbies = '篮球、摄影、旅行';
  const { xml } = docOf(resumeOf(data), TEMPLATES[0]);
  assert.ok(xml.includes('校园经历'), '缺少校园经历标题');
  assert.ok(xml.includes('某某大学学生会') && xml.includes('外联部部长'), '缺少校园经历内容');
  assert.ok(xml.includes('组织迎新晚会，协调 12 个社团'), '缺少校园要点');
  assert.ok(xml.includes('w:left="284"') && xml.includes('w:hanging="142"'), '校园要点应有悬挂缩进');
  assert.ok(xml.includes('兴趣爱好'), '缺少兴趣爱好标题');
  for (const tag of ['篮球', '摄影', '旅行']) assert.ok(xml.includes(tag), '缺少兴趣标签 ' + tag);
  assert.ok(xml.includes('> 篮球 <'), '兴趣标签应各自独立成 run');
  assert.ok(xml.includes('<w:shd w:val="clear" w:color="auto" w:fill="'), '兴趣标签应有底纹');
  // 顺序：教育背景 → 校园经历 → 专业技能 → 荣誉奖项 → 兴趣爱好（与 doc.js SECTION_ORDER 一致）
  const pos = ['教育背景', '校园经历', '专业技能', '荣誉奖项', '兴趣爱好'].map((t) => xml.indexOf(t));
  assert.ok(pos.every((v) => v >= 0), '新模块位置缺失');
  assert.deepEqual(pos, pos.slice().sort((a, b) => a - b), '新模块顺序不对');
  // 空数据的时候不渲染这两个模块
  const plain = docOf(resumeOf(coursesData()), TEMPLATES[0]).xml;
  assert.ok(!plain.includes('校园经历') && !plain.includes('兴趣爱好'), '空模块不应出现标题');
  xmlBalanced(xml, 'campus document.xml');
  textNodesOk(xml, 'campus');
});

ok('英文简历的校园 / 兴趣标签', () => {
  const data = coursesData();
  data.campus = [{ name: 'Student Union', role: 'Head of Outreach', period: '2016 – 2017', bullets: ['Ran orientation'] }];
  data.hobbies = 'Basketball, Photography';
  const { xml } = docOf(resumeOf(data, { lang: 'en' }), TEMPLATES[0]);
  for (const label of ['CAMPUS', 'INTERESTS', 'Student Union', 'Basketball', 'Photography']) {
    assert.ok(xml.includes(label), 'en 缺少 ' + label);
  }
});

ok('resume.sections 顺序驱动文档顺序', () => {
  const { xml } = docOf(
    resumeOf(coursesData(), { sections: ['education', 'experience', 'projects', 'summary'] }),
    TEMPLATES[0]
  );
  const order = ['教育背景', '工作经历', '项目经历', '个人简介'].map((t) => xml.indexOf(t));
  assert.ok(order.every((v) => v >= 0), '缺少模块');
  assert.deepEqual(order, order.slice().sort((a, b) => a - b), 'sections 顺序未生效');
  // 与 doc.js renderBody 一致：sections 非空时只渲染列出的模块（隐藏 = 移出 sections）
  assert.ok(!xml.includes('专业技能'), '未列出的模块不应出现');
});

ok('XML 转义', () => {
  const data = JSON.parse(JSON.stringify(DEMO_RESUME_DATA));
  data.basics.name = 'A&B <测试> "引号"';
  data.basics.email = 'a&b@x.com';
  data.education[0].courses = 'A&B <课程>';
  const { xml } = docOf(resumeOf(data), TEMPLATES[0]);
  assert.ok(xml.includes('A&amp;B &lt;测试&gt; &quot;引号&quot;'), '姓名未正确转义');
  assert.ok(xml.includes('a&amp;b@x.com'), '邮箱未正确转义');
  assert.ok(xml.includes('A&amp;B &lt;课程&gt;'), '课程未正确转义');
  textNodesOk(xml, 'escape');
  xmlBalanced(xml, 'escape document.xml');
});

ok('加粗 markdown 拆成多 run', () => {
  const data = JSON.parse(JSON.stringify(DEMO_RESUME_DATA));
  data.summary = '普通**加粗**普通';
  const { xml } = docOf(resumeOf(data), TEMPLATES[0]);
  assert.ok(xml.includes('<w:b/><w:bCs/>'), '缺少加粗 run');
  assert.ok(xml.includes('<w:t xml:space="preserve">加粗</w:t>'), '加粗文本未独立成 run');
});

ok('空数据与 null 不崩且包合法', () => {
  const empty = buildDocx(resumeOf(emptyResume().data));
  assert.ok(Buffer.isBuffer(empty) && empty.length > 1500, '空简历包过小');
  const nul = buildDocx(null);
  const zip = readZip(nul);
  assert.ok(zip.has('word/document.xml'));
  xmlBalanced(zip.get('word/document.xml').text, 'null document.xml');
  const noTpl = buildDocx({ title: '无模板', data: coursesData() });
  assert.ok(readZip(noTpl).get('word/document.xml').text.includes('林知夏'), '缺省模板应回落到内置第一个');
});

/* ------------------------------------------------------------------ */
/* 6. 写出验收产物                                                     */
/* ------------------------------------------------------------------ */

const shotDir = new URL('../.shot/', import.meta.url);
await mkdir(shotDir, { recursive: true });

for (const tpl of TEMPLATES) {
  const buf = buildDocx(resumeOf(coursesData()), tpl);
  await writeFile(new URL('docx-' + tpl.id + '.docx', shotDir), buf);
}
const photoData = coursesData();
photoData.basics.photo = photoDataUrl(240, 240);
await writeFile(new URL('docx-photo.docx', shotDir), buildDocx(resumeOf(photoData), TEMPLATES[0]));
await writeFile(new URL('docx-sidebar.docx', shotDir), buildDocx(resumeOf(coursesData()), SIDEBAR_TPL));
await writeFile(new URL('docx-pill.docx', shotDir), buildDocx(resumeOf(coursesData()), PILL_TPL));
const check = buildDocx(resumeOf(coursesData()), TEMPLATES[0]);
await writeFile(new URL('docx-check.docx', shotDir), check);
console.log('docx 产物：' + shotDir.pathname + 'docx-*.docx（' + (TEMPLATES.length + 4) + ' 个）');

if (process.exitCode) {
  console.error('✗ docx 测试有失败项（通过 ' + passed + ' 项）');
} else {
  console.log('✓ docx 测试通过（' + passed + ' 项断言）');
}
