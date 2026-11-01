/**
 * 真正的 Word 文档（.docx）生成器 —— 零依赖，手写 OOXML + zip。
 *
 * 背景：之前导出的是「Word 兼容 HTML」（src/shared/doc.js 的 buildWordHtml），
 * Word / WPS 打开后会丢弃 grid / flex / clip-path，只剩文字和勉强近似的表格。
 * 这里改为生成货真价实的 .docx：zip 容器 + WordprocessingML，版式用段落、
 * 表格、底纹、边框来表达，Word 与 WPS 都能原样还原，也能被 LibreOffice 转
 * PDF / PNG 做视觉验收（不依赖 Microsoft Word / COM）。
 *
 * 用法：
 *   import { buildDocx } from './word-docx.js';
 *   const buf = buildDocx(resume, template); // Buffer
 *
 * resume / template 的结构与 src/shared/doc.js 完全一致：
 *  - resume.data.basics{name,role,phone,email,city,wechat,github,website,photo,photoSide,photoShape}
 *  - resume.data.summary / experience[] / projects[] / education[](含 courses) / skills[] / awards[]
 *  - resume.sections 决定模块顺序，resume.lang 决定中英文标签
 *  - template.style 是结构化样式（单栏 / 侧栏、页眉形态、标题装饰……）；
 *    内置模板只有 .css 文本，则从 CSS 特征做最小嗅探（与 doc.js 的规则一致）。
 *
 * 说明：这个文件是 Host 侧 Node 模块（用了 node:zlib），**不会**被
 * build/build.mjs 拼进客户端 bundle，所以可以放心使用 ESM import。
 */
import { deflateRawSync } from 'node:zlib';
import { normalizeResume, templateById } from './shared/doc.js';

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */

/** A4 纸（twips，1/20 pt）。 */
const A4_W = 11906;
const A4_H = 16838;
/** 页边距：上 1.15cm、右 1.45cm、下 1.2cm、左 1.45cm（与 HTML 版一致）。 */
const MARGIN = { top: 652, right: 822, bottom: 680, left: 822 };
/** 版心宽度。 */
const CONTENT_W = A4_W - MARGIN.left - MARGIN.right; // 10262
/** 96dpi 下 1px = 9525 EMU。 */
const EMU_PER_PX = 9525;
/** 照片边长（px），与 HTML 版一致。 */
const PHOTO_PX = 86;

const FONT_SANS = 'Microsoft YaHei';
const FONT_SERIF = 'Georgia';
const FONT_SERIF_EA = 'SimSun';

const SECTION_ORDER = ['summary', 'experience', 'projects', 'education', 'skills', 'awards'];
const CONTACT_FIELDS = ['phone', 'email', 'city', 'wechat', 'github', 'website'];

/** 中英文标签（与 doc.js 的 LABELS 保持一致；doc.js 未导出 labelsOf，这里保留一份）。 */
const LABELS = {
  zh: {
    summary: '个人简介',
    experience: '工作经历',
    projects: '项目经历',
    education: '教育背景',
    skills: '专业技能',
    awards: '荣誉奖项',
    phone: '电话',
    email: '邮箱',
    city: '城市',
    wechat: '微信',
    github: 'GitHub',
    website: '主页',
    namePlaceholder: '你的名字',
    courses: '主修课程',
  },
  en: {
    summary: 'SUMMARY',
    experience: 'EXPERIENCE',
    projects: 'PROJECTS',
    education: 'EDUCATION',
    skills: 'SKILLS',
    awards: 'AWARDS',
    phone: 'Phone',
    email: 'Email',
    city: 'Location',
    wechat: 'WeChat',
    github: 'GitHub',
    website: 'Website',
    namePlaceholder: 'Your Name',
    courses: 'Key courses',
  },
};

/* ------------------------------------------------------------------ */
/* 小工具：颜色 / 尺寸 / 文本                                          */
/* ------------------------------------------------------------------ */

/** #rgb / #rrggbb / #rrggbbaa → #rrggbb，非法值回落。 */
function hex(value, fallback) {
  const s = String(value == null ? '' : value).trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3].toLowerCase();
  if (/^#[0-9a-fA-F]{8}$/.test(s)) return s.slice(0, 7).toLowerCase();
  return fallback;
}

/** OOXML 数值（不带 #、大写）。 */
function val(color) {
  return String(color || '#000000').replace('#', '').toUpperCase();
}

function rgb(color) {
  const h = hex(color, '#000000');
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/** 相对亮度 0~1，用来决定深底配白字还是浅底配深字。 */
function lum(color) {
  const c = rgb(color);
  return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
}

function mix(a, b, t) {
  const x = rgb(a);
  const y = rgb(b);
  const to2 = (n) => (n < 16 ? '0' : '') + n.toString(16);
  return (
    '#' +
    to2(Math.round(x[0] + (y[0] - x[0]) * t)) +
    to2(Math.round(x[1] + (y[1] - x[1]) * t)) +
    to2(Math.round(x[2] + (y[2] - x[2]) * t))
  );
}

/** 底色上的前景色。 */
function onColor(bg) {
  return lum(bg) < 0.62 ? '#ffffff' : '#1d2129';
}

/** CSS px → 半磅（w:sz / w:szCs 的单位）。 */
function sz(px) {
  return Math.max(2, Math.round(px * 0.75 * 2));
}

/** CSS px → twips（1px = 15 twips）。 */
function tw(px) {
  return Math.round(px * 15);
}

/** pt → twips。 */
function ptTw(pt) {
  return Math.round(pt * 20);
}

/** 去掉 XML 非法控制字符并转义。 */
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 单字的相对宽度（以字号为单位），用于估算标题色块 / 时间列的宽度。 */
function charWidth(ch) {
  const code = ch.codePointAt(0);
  if (code > 0x2e80) return 1;
  if (ch === ' ' || ch === '　') return 0.5;
  if (/[0-9]/.test(ch)) return 0.56;
  if (/[A-Z]/.test(ch)) return 0.7;
  if (/[a-z]/.test(ch)) return 0.54;
  if (/[—…、，。；：！？（）【】《》.,:;!?()\[\]-]/.test(ch)) return 0.42;
  return 0.6;
}

/** 估算一段文字的宽度（px）。 */
function measure(text, px) {
  const s = String(text == null ? '' : text);
  let units = 0;
  for (const ch of s) units += charWidth(ch);
  return units * px;
}

const labelsOf = (resume) => LABELS[resume && resume.lang === 'en' ? 'en' : 'zh'];

/* ------------------------------------------------------------------ */
/* OOXML 基础片段                                                      */
/* ------------------------------------------------------------------ */

function rFonts(font, eaFont) {
  const ea = eaFont || font;
  return (
    '<w:rFonts w:ascii="' + font + '" w:hAnsi="' + font + '" w:eastAsia="' + ea +
    '" w:cs="' + font + '"/>'
  );
}

/**
 * 一个 run。参数：
 *  - text      文本（\n 会变成换行）
 *  - size      CSS px（内部换算成半磅）
 *  - color     #rrggbb
 *  - bold / italic / underline
 *  - spacingPx 字间距（CSS px，对应 w:spacing 的 twentieths pt）
 *  - font / eaFont
 */
function run(text, opts) {
  const o = opts || {};
  const font = o.font || FONT_SANS;
  const rPr = [rFonts(font, o.eaFont || (o.font === FONT_SERIF ? FONT_SERIF_EA : undefined))];
  if (o.bold) rPr.push('<w:b/><w:bCs/>');
  if (o.italic) rPr.push('<w:i/><w:iCs/>');
  if (o.color) rPr.push('<w:color w:val="' + val(o.color) + '"/>');
  if (o.spacingPx) rPr.push('<w:spacing w:val="' + Math.round(o.spacingPx * 15) + '"/>');
  if (o.size) rPr.push('<w:sz w:val="' + sz(o.size) + '"/><w:szCs w:val="' + sz(o.size) + '"/>');
  if (o.underline) rPr.push('<w:u w:val="single"/>');
  const rPrXml = '<w:rPr>' + rPr.join('') + '</w:rPr>';
  return String(text == null ? '' : text)
    .split('\n')
    .map((line) => '<w:r>' + rPrXml + '<w:t xml:space="preserve">' + esc(line) + '</w:t></w:r>')
    .join('<w:r>' + rPrXml + '<w:br/></w:r>');
}

/** 支持 **加粗** 的 run 列表。 */
function richRuns(text, opts) {
  const out = [];
  String(text == null ? '' : text)
    .split(/(\*\*[^*]+\*\*)/g)
    .forEach((part) => {
      if (!part) return;
      const bold = /^\*\*([^*]+)\*\*$/.exec(part);
      if (bold) out.push(run(bold[1], Object.assign({}, opts, { bold: true })));
      else out.push(run(part, opts));
    });
  return out.join('');
}

/** 段落边框（下划线用）。 */
function pBdr(side, szEighth, color, spacePt) {
  return (
    '<w:pBdr><w:' + side + ' w:val="single" w:sz="' + szEighth + '" w:space="' +
    (spacePt || 0) + '" w:color="' + val(color) + '"/></w:pBdr>'
  );
}

/**
 * 段落。
 *  - beforePt / afterPt      段前段后（pt）
 *  - lineMultiple            行距倍数（默认 1）
 *  - lineExactPt             固定行高（pt），用于空白间隔段
 *  - align                   left / center / right / both
 *  - tabs                    右对齐制表位（twips，数字）
 *  - border                  pBdr 片段（下划线等）
 *  - indent                  { left, hanging, firstLine }（twips）
 *  - keepNext                与下段同页
 */
function para(content, opts) {
  const o = opts || {};
  const parts = [];
  if (o.border) parts.push(o.border);
  if (o.tabs) parts.push('<w:tabs><w:tab w:val="right" w:pos="' + Math.round(o.tabs) + '"/></w:tabs>');
  let spacing =
    '<w:spacing w:before="' + Math.round((o.beforePt || 0) * 20) +
    '" w:after="' + Math.round((o.afterPt || 0) * 20) + '"';
  if (o.lineExactPt != null) spacing += ' w:line="' + Math.round(o.lineExactPt * 20) + '" w:lineRule="exact"';
  else spacing += ' w:line="' + Math.round((o.lineMultiple || 1) * 240) + '" w:lineRule="auto"';
  spacing += '/>';
  parts.push(spacing);
  if (o.indent) {
    const ind = [];
    if (o.indent.left != null) ind.push('w:left="' + Math.round(o.indent.left) + '"');
    if (o.indent.hanging != null) ind.push('w:hanging="' + Math.round(o.indent.hanging) + '"');
    if (o.indent.firstLine != null) ind.push('w:firstLine="' + Math.round(o.indent.firstLine) + '"');
    if (ind.length) parts.push('<w:ind ' + ind.join(' ') + '/>');
  }
  if (o.align) parts.push('<w:jc w:val="' + o.align + '"/>');
  if (o.keepNext) parts.push('<w:keepNext/>');
  return '<w:p><w:pPr>' + parts.join('') + '</w:pPr>' + (content || '') + '</w:p>';
}

/** 固定高度的空白段：既当间隔，也用来隔开相邻表格（Word 会把相邻表格并成一张）。 */
function gapPara(px) {
  return para('', { lineExactPt: Math.max(1, (Number(px) || 0) * 0.75) });
}

function microGap() {
  return para('', { lineExactPt: 1 });
}

/** 表格边框片段。 */
function tblBorders(spec) {
  const sides = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'];
  return (
    '<w:tblBorders>' +
    sides
      .map((side) => {
        const v = spec && spec[side];
        if (!v) return '<w:' + side + ' w:val="none" w:sz="0" w:space="0" w:color="auto"/>';
        return (
          '<w:' + side + ' w:val="single" w:sz="' + v.sz + '" w:space="0" w:color="' +
          val(v.color) + '"/>'
        );
      })
      .join('') +
    '</w:tblBorders>'
  );
}

/**
 * 单元格。
 *  - width                twips
 *  - shd                  底纹色
 *  - borders              { top/left/bottom/right: {sz,color} }
 *  - margin               { top/left/bottom/right }（twips）
 *  - valign               top / center / bottom
 *  - content              块级 XML（w:p / w:tbl）
 */
function cell(content, opts) {
  const o = opts || {};
  const pr = ['<w:tcW w:w="' + Math.round(o.width || 0) + '" w:type="dxa"/>'];
  if (o.borders) {
    const sides = ['top', 'left', 'bottom', 'right'];
    const bd = sides
      .map((side) => {
        const v = o.borders[side];
        if (!v) return '';
        return (
          '<w:' + side + ' w:val="single" w:sz="' + v.sz + '" w:space="0" w:color="' +
          val(v.color) + '"/>'
        );
      })
      .join('');
    if (bd) pr.push('<w:tcBorders>' + bd + '</w:tcBorders>');
  }
  if (o.shd) pr.push('<w:shd w:val="clear" w:color="auto" w:fill="' + val(o.shd) + '"/>');
  if (o.margin) {
    pr.push(
      '<w:tcMar>' +
        ['top', 'left', 'bottom', 'right']
          .map((side) =>
            o.margin[side] != null ? '<w:' + side + ' w:w="' + Math.round(o.margin[side]) + '" w:type="dxa"/>' : ''
          )
          .join('') +
        '</w:tcMar>'
    );
  }
  if (o.valign) pr.push('<w:vAlign w:val="' + o.valign + '"/>');
  let body = content || '';
  // Word 要求单元格以段落收尾，且表格后面必须跟段落，否则会提示「内容有问题」。
  if (!/<\/w:p>$/.test(body)) body += microGap();
  return '<w:tc><w:tcPr>' + pr.join('') + '</w:tcPr>' + body + '</w:tc>';
}

/**
 * 表格。
 *  - cols     每列宽度（twips）
 *  - rows     [[cellXml, ...], ...]
 *  - width    tblW（默认各列之和）
 *  - align    表格对齐 left / center / right
 *  - borders  外框/内框（见 tblBorders）
 */
function table(cols, rows, opts) {
  const o = opts || {};
  const width = o.width != null ? Math.round(o.width) : Math.round(cols.reduce((a, b) => a + b, 0));
  const pr = [
    '<w:tblW w:w="' + width + '" w:type="dxa"/>',
    '<w:jc w:val="' + (o.align || 'left') + '"/>',
    tblBorders(o.borders),
    '<w:tblLayout w:type="fixed"/>',
    '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/>' +
      '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>',
    '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>',
  ];
  return (
    '<w:tbl><w:tblPr>' + pr.join('') + '</w:tblPr>' +
    '<w:tblGrid>' + cols.map((w) => '<w:gridCol w:w="' + Math.round(w) + '"/>').join('') + '</w:tblGrid>' +
    rows.map((cells) => '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + cells.join('') + '</w:tr>').join('') +
    '</w:tbl>'
  );
}

/** 依次拼接块，相邻两张表格之间插一个 1pt 空段（否则 Word 会并表）。 */
function stack(blocks) {
  let out = '';
  let prevTable = false;
  for (const block of blocks) {
    if (!block) continue;
    const isTable = block.indexOf('<w:tbl>') === 0;
    if (isTable && prevTable) out += microGap();
    out += block;
    prevTable = isTable;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 模板样式：结构化 style 优先，其次从内置模板 CSS 里最小嗅探          */
/* ------------------------------------------------------------------ */

/** 内置模板只有 CSS：认 .rm-sec-t 的特征，与 doc.js 的 wordHeadingFromCss 同规则。 */
function headingFromCss(css) {
  const text = String(css || '');
  const secT = /\.rm-sec-t\{([^}]*)\}/.exec(text);
  const secTBefore = /\.rm-sec-t::before\{([^}]*)\}/.exec(text);
  const secH = /\.rm-sec-h\{([^}]*)\}/.exec(text);
  if (secT && /background/.test(secT[1])) return 'tab';
  if (secTBefore && /(width:4px|width:5px)/.test(secTBefore[1]) && /background/.test(secTBefore[1])) {
    return 'leftbar';
  }
  if (secH && /border-bottom/.test(secH[1])) return 'rule';
  if (secT && /padding-left:12px/.test(secT[1])) return 'leftbar';
  return 'rule';
}

/** 内置模板的页眉形态：gradient → 色带，flex → 左右分栏，否则素页眉。 */
function headerFromCss(css) {
  const text = String(css || '');
  const head = /\.rm-head\{([^}]*)\}/.exec(text);
  if (head && /background:(linear-)?gradient/.test(head[1])) return 'band';
  if (head && /display:flex/.test(head[1])) return 'split';
  return 'plain';
}

const HEADING_STYLES = ['rule', 'bar', 'underline', 'plain', 'banner', 'tab', 'pill', 'icon', 'leftbar'];
const HEADER_STYLES = ['plain', 'band', 'split', 'ribbon'];

/** 版式参数：保证与 doc.js wordStyleOf 的取值规则一致（自定义模板的 bandColor 等）。 */
function styleOf(template) {
  const tpl = template || {};
  const raw = tpl.style && typeof tpl.style === 'object' ? tpl.style : {};
  // doc.js sanitizeStyle 把颜色收在 style.colors 里；也兼容平铺写法。
  const colors = raw.colors && typeof raw.colors === 'object' ? raw.colors : raw;
  const accent = hex(colors.accent, hex(tpl.accent, '#1f2328'));
  const hasHeaderStyle = HEADER_STYLES.indexOf(raw.headerStyle) !== -1;
  const hasHeadingStyle = HEADING_STYLES.indexOf(raw.headingStyle) !== -1;
  const headerStyle = hasHeaderStyle ? raw.headerStyle : headerFromCss(tpl.css);
  const headingStyle = hasHeadingStyle ? raw.headingStyle : headingFromCss(tpl.css);
  const bandColor = hex(colors.bandColor, mix(accent, '#ffffff', 0.82));
  // 与 wordStyleOf 一致：内置模板（没有 headerStyle）的色带是 accent 冲淡 84%。
  const bandBg = hasHeaderStyle ? bandColor : mix(accent, '#ffffff', 0.84);
  const serif = raw.fontFamily === 'serif' || /Georgia/.test(String(tpl.css || ''));
  const num = (value, fallback, max) => {
    const n = Number(value);
    return n > 0 ? Math.min(max, n) : fallback;
  };
  return {
    accent: accent,
    bandBg: bandBg,
    headingColor: hex(colors.headingColor, accent),
    nameColor: hex(colors.nameColor, '#1d2129'),
    bodyColor: hex(colors.bodyColor, '#1d2129'),
    background: hex(colors.background, '#ffffff'),
    gold: hex(colors.gold, accent),
    layout: raw.layout === 'sidebar' ? 'sidebar' : 'single',
    headerStyle: headerStyle,
    headingStyle: headingStyle,
    contentStyle: raw.contentStyle === 'card' ? 'card' : 'plain',
    headerAlign: raw.headerAlign === 'center' ? 'center' : 'left',
    nameSize: num(raw.nameSize, 32, 64),
    headingSize: num(raw.headingSize, 12.5, 24),
    bodySize: num(raw.bodySize, 13.5, 20),
    lineHeight: num(raw.lineHeight, 1.62, 3),
    sectionGap: num(raw.sectionGap, 16, 60),
    contactCols: raw.contactCols === 1 ? 1 : 2,
    serif: serif,
  };
}

/** 页头前景色：按页眉底色实际亮度反推（浅底深字、深底白字）。 */
function headTone(st) {
  const bg = st.bandBg;
  const dark = lum(bg) < 0.62;
  const base = dark ? '#ffffff' : '#1d2430';
  return {
    dark: dark,
    on: base,
    role: mix(base, bg, dark ? 0.24 : 0.34),
    label: mix(base, bg, dark ? 0.34 : 0.48),
    value: dark ? '#ffffff' : '#1d2430',
    rule: mix(bg, st.accent, 0.42),
  };
}

function bodyFonts(st) {
  return st.serif
    ? { font: FONT_SERIF, eaFont: FONT_SERIF_EA }
    : { font: FONT_SANS, eaFont: FONT_SANS };
}

/* ------------------------------------------------------------------ */
/* 照片（data URL → word/media/photo.ext）                             */
/* ------------------------------------------------------------------ */

/** 只接受内嵌 png/jpeg；http(s) 外链不抓取（零依赖、不联网）。 */
function imageSize(buf) {
  if (!buf || buf.length < 24) return null;
  // PNG：8 字节签名 + IHDR（宽高在 16..24，大端）
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  // JPEG：扫描 SOFn 段（0xC0..0xCF，排除 C4/C8/CC），段内长度 + 精度 + 高 + 宽
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) return null;
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** 只接受内嵌 png/jpeg；http(s) 外链不抓取（零依赖、不联网）。 */
function decodePhoto(data) {
  const basics = (data && data.basics) || {};
  const photo = typeof basics.photo === 'string' ? basics.photo.trim() : '';
  const m = /^data:image\/(png|jpeg|jpg);base64,([a-z0-9+/=\s]+)$/i.exec(photo);
  if (!m) return null;
  const ext = m[1].toLowerCase() === 'png' ? 'png' : 'jpeg';
  const buf = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
  if (!buf.length || buf.length > 2 * 1024 * 1024) return null;
  const dim = imageSize(buf) || { w: 0, h: 0 };
  return {
    ext: ext,
    data: buf,
    w: dim.w || 0,
    h: dim.h || 0,
    shape: basics.photoShape === 'square' ? 'square' : 'circle',
    // cover = 正方形居中裁切（srcRect）；contain = 等比完整显示、不裁切。
    fit: basics.photoFit === 'contain' ? 'contain' : 'cover',
  };
}

/** 居中裁成正方形：与 CSS object-fit:cover 观感一致（源图非正方形时）。 */
function photoCrop(media) {
  const w = media.w || 0;
  const h = media.h || 0;
  if (!w || !h || w === h) return '';
  if (w > h) {
    const l = Math.round(((w - h) / w) * 50000);
    return '<a:srcRect l="' + l + '" r="' + l + '"/>';
  }
  const t = Math.round(((h - w) / h) * 50000);
  return '<a:srcRect t="' + t + '" b="' + t + '"/>';
}

function photoDrawing(media) {
  const geom = media.shape === 'square' ? 'roundRect' : 'ellipse';
  let cx;
  let cy;
  let crop = '';
  if (media.fit === 'contain') {
    // 等比完整：按比例缩进 86×86 的框内，不裁切（宽高可能小于 86px）。
    const w = media.w || 0;
    const h = media.h || 0;
    const k = w && h ? Math.min(PHOTO_PX / w, PHOTO_PX / h) : 0;
    const outW = w && h ? Math.max(1, Math.round(w * k)) : PHOTO_PX;
    const outH = w && h ? Math.max(1, Math.round(h * k)) : PHOTO_PX;
    cx = String(outW * EMU_PER_PX);
    cy = String(outH * EMU_PER_PX);
  } else {
    // 正方形居中裁切：固定 86×86 画框，用 srcRect 裁掉溢出部分。
    cx = String(PHOTO_PX * EMU_PER_PX);
    cy = String(PHOTO_PX * EMU_PER_PX);
    crop = photoCrop(media);
  }
  const a = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const pic = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
  return (
    '<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
    '<wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
    '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
    '<wp:docPr id="1" name="photo"/>' +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="' + a + '" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="' + a + '"><a:graphicData uri="' + pic + '">' +
    '<pic:pic xmlns:pic="' + pic + '">' +
    '<pic:nvPicPr><pic:cNvPr id="1" name="photo.' + media.ext + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
    '<pic:blipFill><a:blip r:embed="rIdPhoto"/>' + crop +
    '<a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
    '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
    '<a:prstGeom prst="' + geom + '"><a:avLst/></a:prstGeom>' +
    '<a:ln w="9525"><a:solidFill><a:srgbClr val="DFE5EC"/></a:solidFill></a:ln>' +
    '</pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>'
  );
}

/* ------------------------------------------------------------------ */
/* 页眉 / 联系方式                                                    */
/* ------------------------------------------------------------------ */

/**
 * 联系方式：Word 里只能用表格排两列（与 HTML 版一致：每列等宽、标签 8pt 灰 + 值 9.5pt）。
 * @param {number} width 可用宽度（twips）
 * @param {object} tone  页头配色
 * @param {boolean} dark 深色底（侧栏）时用白系
 */
function contactTable(data, L, st, width, tone, dark) {
  const b = (data && data.basics) || {};
  const fields = [];
  for (const key of CONTACT_FIELDS) {
    if (b[key]) fields.push({ key: key, label: L[key] || key, value: b[key] });
  }
  if (!fields.length) return '';
  const t = tone || headTone(st);
  const labelColor = dark ? mix('#ffffff', st.bandBg, 0.32) : t.label;
  const valueColor = dark ? '#ffffff' : t.value;
  const cols = dark || st.contactCols === 1 ? 1 : 2;
  const colW = Math.max(900, Math.min(4513, Math.floor(width / cols)));
  const grid = [];
  for (let i = 0; i < cols; i++) grid.push(colW);
  const rows = [];
  for (let r = 0; r < fields.length; r += cols) {
    const cells = [];
    for (let c = 0; c < cols; c++) {
      const f = fields[r + c];
      if (!f) {
        cells.push(cell(para('', { lineExactPt: 2 }), { width: colW }));
        continue;
      }
      cells.push(
        cell(
          para(
            run(f.label, { size: 8, color: labelColor, spacingPx: 0.4 }) +
              run('  ', { size: 8, color: valueColor }) +
              run(f.value, { size: 9.5, color: valueColor }),
            { beforePt: 1, afterPt: 1, lineMultiple: 1.2 }
          ),
          { width: colW, valign: 'top', margin: { right: c < cols - 1 ? 240 : 0 } }
        )
      );
    }
    rows.push(cells);
  }
  return table(grid, rows, { width: cols * colW });
}

/** 页头正文块：姓名 + 职位 + 联系方式（有照片时照片在左/右）。 */
function headerInner(data, L, st, tone, width, media) {
  const b = (data && data.basics) || {};
  const fonts = bodyFonts(st);
  const align = st.headerAlign;
  const nameSize = Math.min(34, st.nameSize);
  const buildId = (innerWidth) => {
    const namePara = para(
      run(b.name || L.namePlaceholder, {
        size: nameSize,
        bold: true,
        color: tone.on,
        spacingPx: nameSize * 0.12,
        font: fonts.font,
        eaFont: fonts.eaFont,
      }),
      { align: align, lineMultiple: 1.16 }
    );
    const rolePara = b.role
      ? para(run(b.role, { size: 12.5, color: tone.role, spacingPx: 0.6, font: fonts.font, eaFont: fonts.eaFont }), {
          align: align,
          beforePt: 4,
        })
      : '';
    const contact = contactTable(data, L, st, innerWidth, tone, false);
    return stack([namePara, rolePara, contact]);
  };

  if (!media) return buildId(width);

  const photoW = Math.round(tw(PHOTO_PX)) + 300; // 照片列（86px → 1290 twips + 间距）
  const mainW = width - photoW;
  // 内联图片必须包在 run 里（<w:r><w:drawing>…</w:drawing></w:r>），否则 Word/LibreOffice 直接丢弃。
  const photoCell = cell(para('<w:r>' + photoDrawing(media) + '</w:r>', { align: 'center' }), {
    width: photoW,
    valign: 'top',
    margin: { right: 180 },
  });
  const mainCell = cell(buildId(mainW), { width: mainW, valign: 'top' });
  const left = b.photoSide === 'left';
  // tblGrid 的列顺序必须与单元格顺序一致，否则 Word/LibreOffice 按固定布局会把内容挤扁。
  return table(
    left ? [photoW, mainW] : [mainW, photoW],
    [left ? [photoCell, mainCell] : [mainCell, photoCell]],
    { width: width }
  );
}

/** 页眉：色带（band / ribbon）/ 左名右联系（split）/ 素页眉一条细线（plain）。 */
function headerBlock(data, L, st, tone, media) {
  const style = st.headerStyle;
  if (style === 'band' || style === 'ribbon') {
    const padX = 360;
    const innerW = CONTENT_W - padX * 2;
    const borders =
      style === 'band' ? { bottom: { sz: 18, color: st.accent } } : { top: { sz: 64, color: st.accent } };
    return table(
      [CONTENT_W],
      [
        [
          cell(headerInner(data, L, st, tone, innerW, media), {
            width: CONTENT_W,
            shd: st.bandBg,
            borders: borders,
            margin: { top: 320, left: padX, bottom: 240, right: padX },
          }),
        ],
      ],
      { width: CONTENT_W }
    );
  }
  if (style === 'split') {
    const leftW = Math.round(CONTENT_W * 0.58);
    const rightW = CONTENT_W - leftW;
    const b = (data && data.basics) || {};
    const fonts = bodyFonts(st);
    const nameSize = Math.min(34, st.nameSize);
    const namePara = para(
      run(b.name || L.namePlaceholder, {
        size: nameSize,
        bold: true,
        color: st.nameColor,
        spacingPx: nameSize * 0.12,
        font: fonts.font,
        eaFont: fonts.eaFont,
      }),
      { lineMultiple: 1.16 }
    );
    const rolePara = b.role
      ? para(run(b.role, { size: 12.5, color: '#5a616c', font: fonts.font, eaFont: fonts.eaFont }), {
          beforePt: 4,
        })
      : '';
    const contact = contactTable(data, L, st, rightW - 240, tone, false);
    // split 页眉也要带照片：左侧单元格里再套一张「姓名/职位 + 照片」的小表格。
    let idBlock = stack([namePara, rolePara]);
    if (media) {
      const photoW = Math.round(tw(PHOTO_PX)) + 300;
      const nameW = Math.max(1200, leftW - 240 - photoW);
      const photoCell = cell(para('<w:r>' + photoDrawing(media) + '</w:r>', { align: 'center' }), {
        width: photoW,
        valign: 'top',
        margin: { right: 180 },
      });
      const nameCell = cell(idBlock, { width: nameW, valign: 'top' });
      const left = b.photoSide === 'left';
      idBlock = table(
        left ? [photoW, nameW] : [nameW, photoW],
        [left ? [photoCell, nameCell] : [nameCell, photoCell]],
        { width: leftW - 240 }
      );
    }
    const cells = [
      cell(idBlock, { width: leftW, valign: 'bottom', margin: { bottom: 160 } }),
      cell(contact, { width: rightW, valign: 'bottom', margin: { left: 240, bottom: 160 } }),
    ];
    return table([leftW, rightW], [cells], {
      width: CONTENT_W,
      borders: { bottom: { sz: 12, color: st.accent } },
    });
  }
  // plain：姓名 + 联系 + 一条细下划线
  const innerW = CONTENT_W - 240;
  return table(
    [CONTENT_W],
    [
      [
        cell(headerInner(data, L, st, tone, innerW, media), {
          width: CONTENT_W,
          borders: { bottom: { sz: 6, color: tone.rule } },
          margin: { top: 120, left: 120, bottom: 180, right: 120 },
        }),
      ],
    ],
    { width: CONTENT_W }
  );
}

/* ------------------------------------------------------------------ */
/* 模块标题                                                            */
/* ------------------------------------------------------------------ */

/**
 * 模块标题：色块 / 竖条 / 圆点 / 下划线 / 纯文字。
 * width 是可用宽度（卡片内容时会更窄）。
 */
function titleXml(title, st, width) {
  const size = st.headingSize;
  const color = st.headingColor;
  const fonts = bodyFonts(st);
  const text = String(title || '');
  const base = {
    size: size,
    bold: true,
    color: color,
    spacingPx: size * 0.14,
    font: fonts.font,
    eaFont: fonts.eaFont,
  };
  const colored = ['tab', 'pill', 'bar', 'banner'].indexOf(st.headingStyle) !== -1;

  if (colored) {
    const textW = measure(text, size) + text.length * size * 0.14;
    let leftW = Math.round(tw(textW) + 480);
    leftW = Math.max(1200, Math.min(width - 600, leftW));
    const rightW = width - leftW;
    const fill = st.accent;
    const labelRun = run(text, Object.assign({}, base, { color: onColor(fill) }));
    return table(
      [leftW, rightW],
      [
        [
          cell(para(labelRun, { lineMultiple: 1.15 }), {
            width: leftW,
            shd: fill,
            margin: { top: 70, bottom: 70, left: 240, right: 240 },
            valign: 'center',
          }),
          cell(para('', { lineExactPt: 2 }), {
            width: rightW,
            borders: { bottom: { sz: 6, color: st.accent } },
          }),
        ],
      ],
      { width: width }
    );
  }
  if (st.headingStyle === 'icon') {
    const dotW = 240;
    return table(
      [dotW, width - dotW],
      [
        [
          cell(para(run('●', { size: size * 0.9, color: st.accent }), { lineMultiple: 1 }), {
            width: dotW,
            valign: 'center',
          }),
          cell(para(run(text, base), { border: pBdr('bottom', 6, st.accent, 2.5), lineMultiple: 1.2 }), {
            width: width - dotW,
          }),
        ],
      ],
      { width: width }
    );
  }
  if (st.headingStyle === 'leftbar') {
    const barW = 45;
    return table(
      [barW, width - barW],
      [
        [
          cell(para('', { lineExactPt: 2 }), { width: barW, shd: st.accent }),
          cell(para(run(text, base), { lineMultiple: 1.2 }), {
            width: width - barW,
            margin: { left: 140 },
          }),
        ],
      ],
      { width: width }
    );
  }
  if (st.headingStyle === 'underline') {
    return para(run(text, Object.assign({}, base, { underline: true })), { lineMultiple: 1.2 });
  }
  if (st.headingStyle === 'plain') {
    return para(run(text, base), { lineMultiple: 1.2 });
  }
  // 默认 rule：文字 + 一条 accent 细下划线
  return para(run(text, base), { border: pBdr('bottom', 6, st.accent, 3), lineMultiple: 1.2 });
}

/* ------------------------------------------------------------------ */
/* 模块内容                                                            */
/* ------------------------------------------------------------------ */

/** 条目行：左边标题（公司/学校/项目 + 职位），右边时间右对齐。 */
function entryPara(leftRuns, rightText, width, st) {
  const fonts = bodyFonts(st);
  const content =
    leftRuns +
    '<w:r><w:tab/></w:r>' +
    (rightText ? run(rightText, { size: 9, color: '#6b7280', font: fonts.font, eaFont: fonts.eaFont }) : '');
  return para(content, { tabs: width, lineMultiple: 1.12 });
}

/** 一条要点：悬挂缩进 + 圆点。 */
function bulletPara(text, st) {
  const fonts = bodyFonts(st);
  return para(
    run('• ', { size: st.bodySize, color: st.accent, font: fonts.font, eaFont: fonts.eaFont }) +
      richRuns(text, { size: st.bodySize, color: st.bodyColor, font: fonts.font, eaFont: fonts.eaFont }),
    { indent: { left: 284, hanging: 142 }, beforePt: 1, lineMultiple: 1.5 }
  );
}

function summaryBlocks(data, L, st) {
  if (!data.summary) return [];
  const fonts = bodyFonts(st);
  return String(data.summary)
    .split(/\r?\n/)
    .filter((line) => line !== '')
    .map((line) =>
      para(richRuns(line, { size: st.bodySize, color: st.bodyColor, font: fonts.font, eaFont: fonts.eaFont }), {
        lineMultiple: st.lineHeight,
      })
    );
}

function experienceBlocks(data, L, st, width) {
  const list = data.experience || [];
  if (!list.length) return [];
  const fonts = bodyFonts(st);
  const out = [];
  list.forEach((it, i) => {
    if (i) out.push(gapPara(7));
    const left = [
      it.company
        ? run(it.company, { size: st.bodySize, bold: true, color: st.bodyColor, font: fonts.font, eaFont: fonts.eaFont })
        : '',
      it.role ? run('　' + it.role, { size: 12, color: '#5a616c', font: fonts.font, eaFont: fonts.eaFont }) : '',
    ].join('');
    out.push(entryPara(left, it.period, width, st));
    if (it.location) {
      out.push(
        para(run(it.location, { size: 12, color: '#6b7280', font: fonts.font, eaFont: fonts.eaFont }), {
          beforePt: 1,
        })
      );
    }
    for (const bullet of it.bullets || []) out.push(bulletPara(bullet, st));
  });
  return out;
}

function projectBlocks(data, L, st, width) {
  const list = data.projects || [];
  if (!list.length) return [];
  const fonts = bodyFonts(st);
  const out = [];
  list.forEach((it, i) => {
    if (i) out.push(gapPara(7));
    const left = [
      it.name
        ? run(it.name, { size: st.bodySize, bold: true, color: st.bodyColor, font: fonts.font, eaFont: fonts.eaFont })
        : '',
      it.role ? run('　' + it.role, { size: 12, color: '#5a616c', font: fonts.font, eaFont: fonts.eaFont }) : '',
    ].join('');
    out.push(entryPara(left, it.period, width, st));
    for (const bullet of it.bullets || []) out.push(bulletPara(bullet, st));
  });
  return out;
}

function educationBlocks(data, L, st, width) {
  const list = data.education || [];
  if (!list.length) return [];
  const fonts = bodyFonts(st);
  const out = [];
  list.forEach((it, i) => {
    if (i) out.push(gapPara(7));
    const sub = [it.degree, it.major].filter(Boolean).join(' · ');
    const left = [
      it.school
        ? run(it.school, { size: st.bodySize, bold: true, color: st.bodyColor, font: fonts.font, eaFont: fonts.eaFont })
        : '',
      sub ? run('　' + sub, { size: 12, color: '#5a616c', font: fonts.font, eaFont: fonts.eaFont }) : '',
    ].join('');
    out.push(entryPara(left, it.period, width, st));
    if (it.courses) {
      out.push(
        para(
          run(L.courses, { size: 9, color: '#8b929c', font: fonts.font, eaFont: fonts.eaFont }) +
            run('　' + it.courses, { size: 9, color: '#6b7280', font: fonts.font, eaFont: fonts.eaFont }),
          { beforePt: 1.5 }
        )
      );
    }
    if (it.gpa) {
      out.push(
        para(run('GPA ' + it.gpa, { size: 9, color: '#6b7280', font: fonts.font, eaFont: fonts.eaFont }), {
          beforePt: 1,
        })
      );
    }
  });
  return out;
}

function skillsBlocks(data, L, st, width) {
  const list = data.skills || [];
  if (!list.length) return [];
  const fonts = bodyFonts(st);
  const groupW = 960;
  const rows = list.map((it) => {
    const tags = String(it.items || '')
      .split(/[、,，/|]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(' · ');
    return [
      cell(
        para(run(it.group || '', { size: 9.5, color: '#5a616c', font: fonts.font, eaFont: fonts.eaFont }), {
          beforePt: 1.5,
          afterPt: 1.5,
        }),
        { width: groupW, valign: 'top' }
      ),
      cell(
        para(run(tags, { size: 9.5, color: '#3f4753', font: fonts.font, eaFont: fonts.eaFont }), {
          beforePt: 1.5,
          afterPt: 1.5,
        }),
        { width: width - groupW, valign: 'top' }
      ),
    ];
  });
  return [table([groupW, width - groupW], rows, { width: width })];
}

function awardsBlocks(data, L, st, width) {
  const list = data.awards || [];
  if (!list.length) return [];
  const fonts = bodyFonts(st);
  const out = [];
  list.forEach((it, i) => {
    if (i) out.push(gapPara(4));
    const left = [
      it.title
        ? run(it.title, { size: st.bodySize, bold: true, color: st.bodyColor, font: fonts.font, eaFont: fonts.eaFont })
        : '',
      it.desc ? run('　' + it.desc, { size: 12, color: '#6b7280', font: fonts.font, eaFont: fonts.eaFont }) : '',
    ].join('');
    out.push(entryPara(left, it.date, width, st));
  });
  return out;
}

function contentBlocks(id, data, L, st, width) {
  if (id === 'summary') return summaryBlocks(data, L, st);
  if (id === 'experience') return experienceBlocks(data, L, st, width);
  if (id === 'projects') return projectBlocks(data, L, st, width);
  if (id === 'education') return educationBlocks(data, L, st, width);
  if (id === 'skills') return skillsBlocks(data, L, st, width);
  if (id === 'awards') return awardsBlocks(data, L, st, width);
  return [];
}

/** 一个模块：标题 + 内容；contentStyle=card 时整块包一层描边。 */
function sectionBlock(id, data, L, st, width) {
  // 先用完整宽度判空（内容是否为空与宽度无关），再按卡片留白重算。
  if (!contentBlocks(id, data, L, st, width).length) return '';
  const card = st.contentStyle === 'card';
  const innerW = card ? width - 400 : width;
  const title = titleXml(L[id] || id, st, innerW);
  const body = stack([title, microGap()].concat(contentBlocks(id, data, L, st, innerW)));
  if (!card) return body;
  const edge = mix(st.accent, '#ffffff', 0.74);
  const borders = {
    top: { sz: 6, color: edge },
    left: { sz: 6, color: edge },
    bottom: { sz: 6, color: edge },
    right: { sz: 6, color: edge },
  };
  return table(
    [width],
    [
      [
        cell(body, {
          width: width,
          borders: borders,
          margin: { top: 140, bottom: 140, left: 200, right: 200 },
        }),
      ],
    ],
    { width: width }
  );
}

/* ------------------------------------------------------------------ */
/* 整页版式                                                            */
/* ------------------------------------------------------------------ */

function orderOf(record) {
  const sections = Array.isArray(record.sections) ? record.sections : [];
  const order = sections.filter((id) => SECTION_ORDER.indexOf(id) !== -1);
  return order.length ? order : SECTION_ORDER.slice();
}

/** 单栏：页眉 + 依 resume.sections 顺序排模块。 */
function singleBody(data, L, st, order, media) {
  const tone = headTone(st);
  let out = headerBlock(data, L, st, tone, media);
  let first = true;
  for (const id of order) {
    const block = sectionBlock(id, data, L, st, CONTENT_W);
    if (!block) continue;
    out += gapPara(first ? Math.max(8, st.sectionGap - 4) : st.sectionGap);
    out += block;
    first = false;
  }
  return out;
}

/** 侧栏：左栏深色底（照片/姓名/职位/联系方式/技能），右栏正文。 */
function sidebarBody(data, L, st, order, media) {
  const leftW = 2000;
  const rightW = CONTENT_W - leftW;
  const leftPad = 240;
  const leftInner = leftW - leftPad * 2;
  const rightPad = 360;
  const rightInner = rightW - rightPad;
  const b = (data && data.basics) || {};
  const fonts = bodyFonts(st);

  const left = [];
  if (media) {
    left.push(para(photoDrawing(media), { align: 'center', beforePt: 2, afterPt: 10 }));
  }
  left.push(
    para(
      run(b.name || L.namePlaceholder, {
        size: Math.min(24, st.nameSize),
        bold: true,
        color: '#ffffff',
        spacingPx: 0.6,
        font: fonts.font,
        eaFont: fonts.eaFont,
      }),
      { lineMultiple: 1.2 }
    )
  );
  if (b.role) {
    left.push(para(run(b.role, { size: 12, color: '#dbe6ef', font: fonts.font, eaFont: fonts.eaFont }), { beforePt: 4 }));
  }
  const contact = contactTable(data, L, st, leftInner, null, true);
  if (contact) left.push(contact);

  const hasSkills = order.indexOf('skills') !== -1 && (data.skills || []).length > 0;
  if (hasSkills) {
    const skills = data.skills || [];
    left.push(gapPara(14));
    const headingTitle = para(
      run(L.skills, {
        size: st.headingSize,
        bold: true,
        color: '#ffffff',
        spacingPx: st.headingSize * 0.14,
        font: fonts.font,
        eaFont: fonts.eaFont,
      }),
      { border: pBdr('bottom', 6, mix('#ffffff', st.bandBg, 0.55), 3), lineMultiple: 1.2 }
    );
    left.push(headingTitle);
    for (const it of skills) {
      left.push(
        para(run(it.group || '', { size: 11, color: mix('#ffffff', st.bandBg, 0.28), font: fonts.font, eaFont: fonts.eaFont }), {
          beforePt: 6,
        })
      );
      const tags = String(it.items || '')
        .split(/[、,，/|]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .join(' · ');
      left.push(para(run(tags, { size: 12, color: '#ffffff', font: fonts.font, eaFont: fonts.eaFont }), { beforePt: 1 }));
    }
  }

  const right = [];
  let first = true;
  for (const id of order) {
    if (id === 'skills') continue;
    const block = sectionBlock(id, data, L, st, rightInner);
    if (!block) continue;
    right.push(gapPara(first ? 4 : st.sectionGap));
    right.push(block);
    first = false;
  }

  const leftCell = cell(stack(left), {
    width: leftW,
    shd: st.bandBg,
    margin: { top: 400, bottom: 400, left: leftPad, right: leftPad },
    valign: 'top',
  });
  const rightCell = cell(stack(right), {
    width: rightW,
    margin: { top: 400, left: rightPad, right: 0, bottom: 0 },
    valign: 'top',
  });
  return table([leftW, rightW], [[leftCell, rightCell]], { width: CONTENT_W });
}

/* ------------------------------------------------------------------ */
/* 包内其它部件                                                        */
/* ------------------------------------------------------------------ */

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function contentTypesXml(media) {
  const defaults = [
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
  ];
  if (media) {
    defaults.push('<Default Extension="' + media.ext + '" ContentType="image/' + media.ext + '"/>');
  }
  const overrides = [
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
  ];
  return (
    XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    defaults.join('') +
    overrides.join('') +
    '</Types>'
  );
}

function rootRelsXml() {
  return (
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>'
  );
}

function documentRelsXml(media) {
  return (
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    (media
      ? '<Relationship Id="rIdPhoto" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/photo.' +
        media.ext + '"/>'
      : '') +
    '</Relationships>'
  );
}

function stylesXml(st) {
  const fonts = bodyFonts(st);
  const line = Math.round(st.lineHeight * 240);
  const size = sz(st.bodySize);
  return (
    XML_HEAD +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr>' +
    rFonts(fonts.font, fonts.eaFont) +
    '<w:sz w:val="' + size + '"/><w:szCs w:val="' + size + '"/>' +
    '</w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="' + line + '" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
    '</w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/>' +
    '<w:pPr><w:spacing w:after="0" w:line="' + line + '" w:lineRule="auto"/></w:pPr>' +
    '<w:rPr>' + rFonts(fonts.font, fonts.eaFont) +
    '<w:sz w:val="' + size + '"/><w:szCs w:val="' + size + '"/>' +
    '<w:color w:val="' + val(st.bodyColor) + '"/></w:rPr></w:style>' +
    '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/>' +
    '<w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/>' +
    '<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar>' +
    '<w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/>' +
    '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
    '</w:styles>'
  );
}

function coreXml(data) {
  const name = (data.basics && data.basics.name) || '我的简历';
  return (
    XML_HEAD +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + esc(name) + '</dc:title>' +
    '<dc:creator>resume-market</dc:creator>' +
    '<cp:lastModifiedBy>resume-market</cp:lastModifiedBy>' +
    '<dcterms:created xsi:type="dcterms:W3CDTF">2024-01-01T00:00:00Z</dcterms:created>' +
    '<dcterms:modified xsi:type="dcterms:W3CDTF">2024-01-01T00:00:00Z</dcterms:modified>' +
    '</cp:coreProperties>'
  );
}

function appXml() {
  return (
    XML_HEAD +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
    'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<Application>resume-market</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>' +
    '<Company></Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc>' +
    '<HyperlinksChanged>false</HyperlinksChanged><AppVersion>1.0</AppVersion></Properties>'
  );
}

function documentXml(body) {
  return (
    XML_HEAD +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>' +
    body +
    para('', { lineExactPt: 1 }) +
    '<w:sectPr>' +
    '<w:pgSz w:w="' + A4_W + '" w:h="' + A4_H + '"/>' +
    '<w:pgMar w:top="' + MARGIN.top + '" w:right="' + MARGIN.right + '" w:bottom="' + MARGIN.bottom +
    '" w:left="' + MARGIN.left + '" w:header="0" w:footer="0" w:gutter="0"/>' +
    '<w:cols w:space="720"/>' +
    '</w:sectPr>' +
    '</w:body></w:document>'
  );
}

/* ------------------------------------------------------------------ */
/* zip（store / deflate，只写不用读）                                  */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 固定时间戳，保证同样的数据生成同样的字节（方便 diff / 测试）。 */
const DOS_TIME = 0;
const DOS_DATE = ((2024 - 1980) << 9) | (1 << 5) | 1;

/**
 * 打 zip。
 * @param {Array<{name:string, data:Buffer}>} files
 * @returns {Buffer}
 */
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const raw = file.data;
    const comp = deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 文件名
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    locals.push(local, nameBuf, comp);
    centrals.push({ name: nameBuf, crc: crc, csize: comp.length, usize: raw.length, offset: offset });
    offset += local.length + nameBuf.length + comp.length;
  }

  const centralParts = [];
  for (const item of centrals) {
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(20, 4); // version made by
    head.writeUInt16LE(20, 6); // version needed
    head.writeUInt16LE(0x0800, 8);
    head.writeUInt16LE(8, 10);
    head.writeUInt16LE(DOS_TIME, 12);
    head.writeUInt16LE(DOS_DATE, 14);
    head.writeUInt32LE(item.crc, 16);
    head.writeUInt32LE(item.csize, 20);
    head.writeUInt32LE(item.usize, 24);
    head.writeUInt16LE(item.name.length, 28);
    head.writeUInt16LE(0, 30); // extra
    head.writeUInt16LE(0, 32); // comment
    head.writeUInt16LE(0, 34); // disk start
    head.writeUInt16LE(0, 36); // internal attrs
    head.writeUInt32LE(0, 38); // external attrs
    head.writeUInt32LE(item.offset, 42);
    centralParts.push(head, item.name);
  }
  const central = Buffer.concat(centralParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(centrals.length, 8);
  eocd.writeUInt16LE(centrals.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat(locals.concat([central, eocd]));
}

/* ------------------------------------------------------------------ */
/* 对外接口                                                            */
/* ------------------------------------------------------------------ */

function toBuffer(text) {
  return Buffer.from(text, 'utf8');
}

/**
 * 生成一份 .docx。
 * @param {object} resume  简历记录（结构见文件头注释）
 * @param {object} [template] 模板（缺省时按 resume.templateId 取内置模板）
 * @returns {Buffer} 完整 .docx 字节
 */
export function buildDocx(resume, template) {
  const record = normalizeResume(resume || {});
  const tpl = template && typeof template === 'object' ? template : templateById(record.templateId);
  const st = styleOf(tpl);
  const data = record.data;
  const L = labelsOf(record);
  const media = decodePhoto(data);
  const order = orderOf(record);

  const body =
    st.layout === 'sidebar'
      ? sidebarBody(data, L, st, order, media)
      : singleBody(data, L, st, order, media);
  const doc = documentXml(body);

  const files = [
    { name: '[Content_Types].xml', data: toBuffer(contentTypesXml(media)) },
    { name: '_rels/.rels', data: toBuffer(rootRelsXml()) },
    { name: 'word/document.xml', data: toBuffer(doc) },
    { name: 'word/_rels/document.xml.rels', data: toBuffer(documentRelsXml(media)) },
    { name: 'word/styles.xml', data: toBuffer(stylesXml(st)) },
    { name: 'docProps/core.xml', data: toBuffer(coreXml(data)) },
    { name: 'docProps/app.xml', data: toBuffer(appXml()) },
  ];
  if (media) files.push({ name: 'word/media/photo.' + media.ext, data: media.data });

  return zip(files);
}

export default buildDocx;
