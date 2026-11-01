/**
 * 模板导入：把用户上传的 doc / docx / pdf / 图片解析成「统一文档模型」，
 * 再由模型生成一套模板初稿（style + 示例数据）。
 *
 * 设计约定：
 *  - 零依赖，只用 Node 内置模块（zlib）；浏览器侧图片仍走 canvas 取色。
 *  - 所有解析失败都抛 ImportError（带 code / status），路由层直接映射成 import/* 错误码，
 *    绝不让未捕获异常冒到 HTTP 层。
 *  - 模型是「排版可参考的文本块」而不是完整排版还原：块里有文本/角色/字号/颜色/位置，
 *    足够 mapModelToDraft 推出一套 style，再由 AI 优化接口（后续）继续修。
 *
 * 统一模型（model）：
 *   {
 *     kind: 'docx' | 'doc' | 'pdf' | 'image',
 *     sourceName,
 *     page: { width, height },              // px（按 96dpi 换算）
 *     blocks: [{ text, role, size, bold, color, left, top, width }],
 *     colors: ['#rrggbb', ...],             // 按出现频次排序
 *     fonts: ['Calibri', ...],
 *     text: '全部文本，按块换行',
 *     note: '解析局限说明（可选）',
 *   }
 * role 取值：name | subtitle | contact | heading | body | bullet
 */

import { inflateRawSync, inflateSync } from 'node:zlib';

/** 支持的文件上限（与路由保持一致）。 */
export const IMPORT_MAX_BYTES = 8 * 1024 * 1024;

/** 解析/导入错误：带错误码与 HTTP 状态，路由层直接映射。 */
export class ImportError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'ImportError';
    this.code = code || 'import/parse-failed';
    this.status = typeof status === 'number' ? status : 422;
  }
}

const A4_PX = { width: 794, height: 1123 };

/* ---------------- 文件类型识别 ---------------- */

const IMAGE_SIGNATURES = [
  [Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image'],
  [Buffer.from([0xff, 0xd8, 0xff]), 'image'],
  [Buffer.from('GIF8', 'latin1'), 'image'],
  [Buffer.from('BM', 'latin1'), 'image'],
];

/** 判断缓冲区是不是某类文件；返回 'docx' | 'doc' | 'pdf' | 'image' | 'unsupported'。 */
export function detectKind(buf, filename) {
  if (!Buffer.isBuffer(buf) || !buf.length) return 'unsupported';
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0x504b0304) return 'docx';
  if (buf.length >= 5 && buf.slice(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0xd0cf11e0 && buf.readUInt32BE(4) === 0xa1b11ae1) return 'doc';
  for (const [sig, kind] of IMAGE_SIGNATURES) {
    if (buf.length >= sig.length && buf.slice(0, sig.length).equals(sig)) return 'image';
  }
  if (buf.length >= 12 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') {
    return 'image';
  }
  // Word 存出来的「.doc」其实常常是 HTML：看开头一小段的文本特征。
  const head = buf.slice(0, Math.min(buf.length, 2048)).toString('utf8');
  const headLower = head.toLowerCase();
  if (headLower.indexOf('<!doctype html') !== -1 || headLower.indexOf('<html') !== -1 || headLower.indexOf('mime-version') !== -1) {
    return 'doc';
  }
  // 扩展名兜底：内容没有特征时，按用户选的文件类型再试一次（图省事的 .doc 下载很常见）。
  const ext = String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  if (ext) {
    if (ext[1] === 'docx') return 'docx';
    if (ext[1] === 'doc') return 'doc';
    if (ext[1] === 'pdf') return 'pdf';
    if (ext[1] === 'png' || ext[1] === 'jpg' || ext[1] === 'jpeg' || ext[1] === 'webp' || ext[1] === 'gif' || ext[1] === 'bmp') {
      return 'image';
    }
  }
  return 'unsupported';
}

/* ---------------- 通用工具 ---------------- */

const COLOR_NAMES = {
  black: '#000000',
  white: '#ffffff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  red: '#ff0000',
  maroon: '#800000',
  blue: '#0000ff',
  navy: '#000080',
  teal: '#008080',
  green: '#008000',
  olive: '#808000',
  purple: '#800080',
  orange: '#ffa500',
  gold: '#ffd700',
  brown: '#a52a2a',
  pink: '#ffc0cb',
};

function normalizeColor(value) {
  if (!value) return '';
  let v = String(value).trim().toLowerCase();
  const rgbMatch = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (rgbMatch) {
    const toHex = (n) => Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, '0');
    return '#' + toHex(rgbMatch[1]) + toHex(rgbMatch[2]) + toHex(rgbMatch[3]);
  }
  if (COLOR_NAMES[v]) return COLOR_NAMES[v];
  v = v.replace(/^#/, '');
  if (/^[0-9a-f]{3}$/.test(v)) return '#' + v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
  if (/^[0-9a-f]{6}$/.test(v)) return '#' + v;
  return '';
}

function parseCssDeclarations(text) {
  const out = {};
  String(text || '')
    .split(';')
    .forEach((part) => {
      const idx = part.indexOf(':');
      if (idx <= 0) return;
      const key = part.slice(0, idx).trim().toLowerCase();
      const value = part.slice(idx + 1).trim();
      if (key) out[key] = value;
    });
  return out;
}

function cssSizeToPx(value) {
  const m = String(value || '')
    .trim()
    .match(/^([\d.]+)\s*(pt|px|em|rem)?$/i);
  if (!m) return 0;
  const num = Number(m[1]);
  if (!Number.isFinite(num) || num <= 0) return 0;
  const unit = (m[2] || 'px').toLowerCase();
  if (unit === 'pt') return Math.round((num * 4) / 3);
  if (unit === 'em' || unit === 'rem') return Math.round(num * 16);
  return Math.round(num);
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function stripTags(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|td|th)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function hexToRgb(hex) {
  const v = normalizeColor(hex).replace('#', '');
  if (v.length !== 6) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) };
}

function rgbToHex(r, g, b) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const ratio = Math.max(0, Math.min(1, Number(t) || 0));
  return rgbToHex(ca.r + (cb.r - ca.r) * ratio, ca.g + (cb.g - ca.g) * ratio, ca.b + (cb.b - ca.b) * ratio);
}

function colorSaturation(hex) {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

function colorLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return Math.max(0, Math.min(1, (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255));
}

function colorHue(hex) {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let hue;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

function clamp(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, num));
}

function median(values) {
  const nums = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!nums.length) return 0;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

/* ---------------- 角色标注（docx / doc / pdf 共用） ---------------- */

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(?:\+?\d[\d\s\-()]{6,}\d)/;
const URL_RE = /(?:https?:\/\/|www\.)[^\s，,；;]+|(?:[a-z0-9-]+\.)+(?:com|cn|dev|me|io|net|org|top|cc|xyz)(?:\/[^\s，,；;]*)?/i;
const CITY_RE = /(北京|上海|广州|深圳|杭州|成都|武汉|南京|西安|苏州|天津|重庆|长沙|郑州|青岛|厦门|合肥|福州|济南|大连|宁波|无锡|东莞|佛山)/;
const BULLET_RE = /^\s*(?:[•·∙◦▪▫■□●○◆◇\-–—*?>]|\d{1,2}[.、)）]|[（(]\d{1,2}[)）])\s*/;

function looksLikeContact(text) {
  const t = String(text || '');
  if (!t) return false;
  if (EMAIL_RE.test(t) || PHONE_RE.test(t) || URL_RE.test(t)) return true;
  return /(电话|手机|邮箱|邮件|地址|城市|现居|求职意向|工作年限|微信|出生|年龄|籍贯|性别)/.test(t) && t.length <= 120;
}

function annotateBlocks(blocks, page) {
  const list = blocks.filter((block) => block && String(block.text || '').trim());
  if (!list.length) return list;
  const pageWidth = (page && page.width) || A4_PX.width;
  const bodySizeGuess = median(list.map((block) => block.size)) || 13.5;
  const bodyColorGuess = mostCommonTextColor(list) || '#1f2937';
  let nameAssigned = false;
  let nameIndex = -1;
  let subtitleAssigned = false;
  list.forEach((block, index) => {
    const text = String(block.text).trim();
    block.text = text;
    block.color = normalizeColor(block.color) || bodyColorGuess;
    if (!block.size) block.size = bodySizeGuess;
    block.width = block.width || pageWidth - 144;
    // 解析器已经标好的列表项（docx 的 numPr、doc 的 <li>）优先保留
    if (block.role === 'bullet') {
      block.text = text.replace(BULLET_RE, '').trim() || text;
      return;
    }
    // 1) 姓名：前 6 块里字号最大、且不含联系方式特征的那块
    if (!nameAssigned && index < 6 && block.size >= Math.max(20, bodySizeGuess * 1.6) && text.length <= 24 && !looksLikeContact(text)) {
      block.role = 'name';
      nameAssigned = true;
      nameIndex = index;
      return;
    }
    // 2) 职位/副标题：必须紧跟姓名（中间不能夹联系方式/模块标题）
    if (nameAssigned && !subtitleAssigned && index === nameIndex + 1 && block.size >= bodySizeGuess * 1.05 && text.length <= 40 && !looksLikeContact(text)) {
      block.role = 'subtitle';
      subtitleAssigned = true;
      return;
    }
    if (looksLikeContact(text)) {
      block.role = 'contact';
      return;
    }
    if (BULLET_RE.test(text)) {
      block.role = 'bullet';
      block.text = text.replace(BULLET_RE, '').trim() || text;
      return;
    }
    // 3) 模块标题：字号明显大于正文、短、通常加粗
    if (block.size >= bodySizeGuess * 1.12 && text.length <= 28) {
      block.role = 'heading';
      return;
    }
    block.role = 'body';
  });
  // 「姓名」还没有的话，退而求其次挑前 4 块里最短、字号最大的
  if (!nameAssigned && list.length) {
    const candidates = list.slice(0, 4).filter((block) => block.role === 'body' || block.role === 'subtitle');
    candidates.sort((a, b) => b.size - a.size || a.text.length - b.text.length);
    if (candidates[0] && candidates[0].text.length <= 24) candidates[0].role = 'name';
  }
  return list;
}

function mostCommonTextColor(blocks) {
  const counts = new Map();
  blocks.forEach((block) => {
    const color = normalizeColor(block.color);
    if (!color) return;
    counts.set(color, (counts.get(color) || 0) + 1);
  });
  let best = '';
  let bestCount = 0;
  counts.forEach((count, color) => {
    if (count > bestCount) {
      best = color;
      bestCount = count;
    }
  });
  return best;
}

function collectModel(blocks, kind, sourceName, page, fonts, note) {
  const annotated = annotateBlocks(blocks, page);
  const colorCounts = new Map();
  annotated.forEach((block) => {
    const color = normalizeColor(block.color);
    if (!color) return;
    colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
  });
  const colors = Array.from(colorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map((entry) => entry[0]);
  const model = {
    kind,
    sourceName: String(sourceName || '').slice(0, 160),
    page: { width: (page && page.width) || A4_PX.width, height: (page && page.height) || A4_PX.height },
    blocks: annotated.map((block) => ({
      text: block.text,
      role: block.role,
      size: Math.round(clamp(block.size || 13.5, 6, 96) * 10) / 10,
      bold: !!block.bold,
      color: normalizeColor(block.color) || '#333333',
      left: Math.round(clamp(block.left || 0, 0, model_page_width(page))),
      top: Math.round(clamp(block.top || 0, 0, 100000)),
      width: Math.round(clamp(block.width || 0, 0, model_page_width(page))),
    })),
    colors,
    fonts: Array.from(new Set((fonts || []).filter(Boolean))).slice(0, 8),
    text: annotated
      .map((block) => block.text)
      .join('\n')
      .slice(0, 20000),
  };
  if (note) model.note = note;
  return model;
}

function model_page_width(page) {
  return (page && page.width) || A4_PX.width;
}

/* ---------------- docx（zip + word/document.xml） ---------------- */

function findEocd(buf) {
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function readZipEntries(buf) {
  const eocd = findEocd(buf);
  if (eocd < 0) throw new ImportError('import/parse-failed', '不是有效的 .docx（找不到 zip 目录）');
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buf.readUInt16LE(offset + 10);
    const compSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.slice(offset + 46, offset + 46 + nameLen).toString('utf8');
    entries.push({ name, method, compSize, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  if (!entries.length) throw new ImportError('import/parse-failed', '不是有效的 .docx（zip 目录为空）');
  return entries;
}

function readZipEntry(buf, entry) {
  const lo = entry.localOffset;
  if (lo + 30 > buf.length || buf.readUInt32LE(lo) !== 0x04034b50) {
    throw new ImportError('import/parse-failed', '.docx 内部结构损坏（本地文件头不合法）');
  }
  const nameLen = buf.readUInt16LE(lo + 26);
  const extraLen = buf.readUInt16LE(lo + 28);
  const start = lo + 30 + nameLen + extraLen;
  const raw = buf.slice(start, start + entry.compSize);
  if (entry.method === 0) return raw;
  if (entry.method === 8) {
    try {
      return inflateRawSync(raw);
    } catch {
      throw new ImportError('import/parse-failed', '.docx 解压失败（文件可能已损坏）');
    }
  }
  throw new ImportError('import/parse-failed', '.docx 使用了不支持的压缩方式（' + entry.method + '）');
}

function decodeXml(text) {
  return decodeEntities(text);
}

function runText(runXml) {
  let text = '';
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g;
  let m;
  while ((m = re.exec(runXml))) {
    if (m[1] !== undefined) text += decodeXml(m[1]);
    else text += ' ';
  }
  return text;
}

function parseDocxXml(xml) {
  const blocks = [];
  const fonts = [];
  const paraRe = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
  let paragraph;
  let cursorY = 96;
  while ((paragraph = paraRe.exec(xml))) {
    const body = paragraph[1];
    const pPrMatch = body.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/);
    const pPr = pPrMatch ? pPrMatch[1] : '';
    const centered = /<w:jc\s+w:val="(?:center|both)"/.test(pPr);
    const isList = /<w:numPr\s*>/.test(pPr);
    const runs = [];
    const runRe = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g;
    let run;
    while ((run = runRe.exec(body))) {
      const runXml = run[1];
      const text = runText(runXml);
      if (!text) continue;
      const rPrMatch = runXml.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
      const rPr = rPrMatch ? rPrMatch[1] : '';
      const sz = rPr.match(/<w:sz\s+w:val="(\d+)"/);
      const color = rPr.match(/<w:color\s+w:val="([0-9a-fA-F]{6})"/);
      const bold = /<w:b(?:\s+w:val="(?:1|true|on)")?\s*\/>/.test(rPr);
      const font = rPr.match(/<w:rFonts[^>]*w:ascii="([^"]+)"/);
      if (font) fonts.push(font[1]);
      runs.push({
        text,
        size: sz ? Math.round((Number(sz[1]) / 2) * (96 / 72)) : 0,
        color: color ? normalizeColor(color[1]) : '',
        bold,
      });
    }
    const text = runs
      .map((item) => item.text)
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    const sized = runs.filter((item) => item.size);
    const size = sized.length ? Math.max.apply(null, sized.map((item) => item.size)) : 13.5;
    const colorRun = runs.filter((item) => item.color)[0];
    const height = Math.max(size, 12) * 1.7 + 8;
    blocks.push({
      text,
      size,
      color: colorRun ? colorRun.color : '',
      bold: runs.some((item) => item.bold),
      left: 72,
      top: cursorY,
      width: A4_PX.width - 144,
      role: isList ? 'bullet' : undefined,
    });
    if (centered) blocks[blocks.length - 1].centered = true;
    cursorY += height;
  }
  return { blocks, fonts };
}

/** 解析 .docx：自己读 zip 中央目录 + inflateRawSync 解 word/document.xml。 */
export function parseDocx(buf, sourceName) {
  const entries = readZipEntries(buf);
  const docEntry =
    entries.find((entry) => entry.name === 'word/document.xml') ||
    entries.find((entry) => /^word\/document\d*\.xml$/.test(entry.name));
  if (!docEntry) throw new ImportError('import/parse-failed', '.docx 里找不到 word/document.xml（可能不是 Word 文档）');
  const xml = readZipEntry(buf, docEntry).toString('utf8');
  const parsed = parseDocxXml(xml);
  if (!parsed.blocks.length) throw new ImportError('import/parse-failed', '这份 .docx 里没有可读文本（可能是纯图片/扫描件）');
  return collectModel(parsed.blocks, 'docx', sourceName, A4_PX, parsed.fonts);
}

/* ---------------- doc（Word 另存的 HTML） ---------------- */

function decodeDocBuffer(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le');
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf);
    for (let i = 0; i + 1 < swapped.length; i += 2) {
      const tmp = swapped[i];
      swapped[i] = swapped[i + 1];
      swapped[i + 1] = tmp;
    }
    return swapped.toString('utf16le');
  }
  return buf.toString('utf8');
}

function styleAttributeOf(attrText) {
  const match = String(attrText || '').match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  if (!match) return '';
  return match[1] !== undefined ? match[1] : match[2] || '';
}

function readInlineStyle(attrText, innerHtml) {
  const decl = parseCssDeclarations(styleAttributeOf(attrText));
  const color =
    normalizeColor(decl['color']) ||
    normalizeColor((innerHtml.match(/<font[^>]*color\s*=\s*"?([^"\s>]+)"?/i) || [])[1]) ||
    '';
  const family = decl['font-family'] || (innerHtml.match(/<font[^>]*face\s*=\s*"?([^"\s>]+)"?/i) || [])[1] || '';
  return {
    color,
    family,
    size: cssSizeToPx(decl['font-size']),
    bold: /bold|700|800|900/.test(String(decl['font-weight'] || '')),
  };
}

/** 解析 Word 另存的 HTML（.doc）：标题/段落/表格行 + 内联颜色/字号。 */
export function parseDoc(buf, sourceName) {
  if (detectKind(buf) === 'doc' && buf.slice(0, 4).readUInt32BE(0) === 0xd0cf11e0) {
    throw new ImportError('import/legacy-doc', '这是旧版二进制 .doc，暂不支持；请在 Word 里另存为 .docx 或 PDF 后重试');
  }
  const html = decodeDocBuffer(buf);
  // Word 另存 HTML 时字体常常只写在 <style> 里（p.MsoNormal{font-family:...}），先抽出来再清样式。
  const styleFonts = [];
  (html.match(/<style[\s\S]*?<\/style>/gi) || []).forEach((styleBlock) => {
    const fontRe = /font-family\s*:\s*["']?([^;"'}]+)/gi;
    let fontMatch;
    while ((fontMatch = fontRe.exec(styleBlock))) {
      const family = fontMatch[1].trim();
      if (family) styleFonts.push(family);
    }
  });
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');
  const blocks = [];
  const fonts = styleFonts.slice(0, 4);
  let cursorY = 96;
  let cellIndex = 0;
  let lastRowEnd = -1;
  const tagRe = /<(h[1-6]|p|li|td|th|div)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = tagRe.exec(cleaned))) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    const inner = match[3];
    if (tag === 'div' && /<(p|h[1-6]|li|td|tr|div)\b/i.test(inner)) continue;
    const style = readInlineStyle(attrs, inner);
    if (style.family) fonts.push(style.family);
    const text = stripTags(inner).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const headingTag = /^h([1-6])$/.exec(tag);
    const defaultSize = headingTag ? [0, 28, 22, 18, 16, 15, 14][Number(headingTag[1])] || 14 : 13.5;
    const size = style.size || defaultSize;
    let left = 72;
    let width = A4_PX.width - 144;
    if (tag === 'td' || tag === 'th') {
      // 简单表格：同一行内按 cell 顺序估算列位置。
      if (match.index > lastRowEnd + 6) cellIndex = 0;
      left = 72 + Math.min(cellIndex, 3) * 180;
      width = 180;
      cellIndex += 1;
      const rowEnd = cleaned.indexOf('</tr>', tagRe.lastIndex);
      if (rowEnd !== -1) lastRowEnd = rowEnd;
    } else if (tag === 'li') {
      left = 96;
    }
    const lines = text.split('\n').filter(Boolean);
    lines.forEach((line) => {
      const block = {
        text: line,
        size,
        color: style.color,
        bold: style.bold || !!headingTag,
        left,
        top: cursorY,
        width,
      };
      blocks.push(block);
      cursorY += Math.max(size, 12) * 1.7 + 6;
    });
  }
  if (!blocks.length) {
    // 结构识别不出来时退化为纯文本：至少让用户能看到解析出的内容。
    const plain = stripTags(cleaned);
    if (!plain) throw new ImportError('import/parse-failed', '这份 .doc 里没有可读文本');
    const fallbackBlocks = plain
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 200)
      .map((line, index) => ({ text: line, size: 13.5, color: '', bold: false, left: 72, top: 96 + index * 26, width: A4_PX.width - 144 }));
    return collectModel(fallbackBlocks, 'doc', sourceName, A4_PX, fonts, '文档结构比较特殊，已退化为纯文本抽取');
  }
  return collectModel(blocks, 'doc', sourceName, A4_PX, fonts);
}

/* ---------------- pdf（对象表 + FlateDecode 内容流） ---------------- */

function pdfColorFromOperands(r, g, b) {
  return rgbToHex(Number(r) * 255, Number(g) * 255, Number(b) * 255);
}

function pdfColorFromGray(gray) {
  const value = Number(gray) * 255;
  return rgbToHex(value, value, value);
}

function pdfColorFromCmyk(c, m, y, k) {
  const cc = Number(c) || 0;
  const mm = Number(m) || 0;
  const yy = Number(y) || 0;
  const kk = Number(k) || 0;
  return rgbToHex(255 * (1 - cc) * (1 - kk), 255 * (1 - mm) * (1 - kk), 255 * (1 - yy) * (1 - kk));
}

function pdfHexToString(hex) {
  const clean = String(hex || '').replace(/[^0-9a-fA-F]/g, '');
  if (!clean) return '';
  if (clean.length % 2) return '';
  const bytes = Buffer.from(clean, 'hex');
  if (bytes.every((byte) => byte < 128)) return bytes.toString('latin1');
  const utf8 = bytes.toString('utf8');
  if (!utf8.includes('\uFFFD')) return utf8;
  return bytes.length % 2 === 0 ? bytes.toString('utf16le').replace(/\u0000/g, '') : bytes.toString('latin1');
}

function pdfLiteralToString(raw) {
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '\\') {
      out.push(ch);
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) break;
    i += 1;
    if (next === 'n') out.push('\n');
    else if (next === 'r') out.push('\r');
    else if (next === 't') out.push('\t');
    else if (next === 'b') out.push('\b');
    else if (next === 'f') out.push('\f');
    else if (next === '(' || next === ')' || next === '\\') out.push(next);
    else if (/[0-7]/.test(next)) {
      let oct = next;
      while (oct.length < 3 && i + 1 < raw.length && /[0-7]/.test(raw[i + 1])) {
        i += 1;
        oct += raw[i];
      }
      out.push(String.fromCharCode(parseInt(oct, 8) & 255));
    } else if (next === '\n') {
      // 行续接：忽略
    } else out.push(next);
  }
  const text = out.join('');
  if (/^[\x00-\x7f]*$/.test(text)) return text;
  const bytes = Buffer.from(text, 'latin1');
  const utf8 = bytes.toString('utf8');
  return utf8.includes('\uFFFD') ? text : utf8;
}

function pdfTokens(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '%') {
      while (i < src.length && src[i] !== '\n' && src[i] !== '\r') i += 1;
      continue;
    }
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t' || ch === '\f' || ch === '\u0000') {
      i += 1;
      continue;
    }
    if (ch === '(') {
      let depth = 1;
      let j = i + 1;
      let out = '';
      while (j < src.length) {
        const c = src[j];
        if (c === '\\') {
          out += c;
          if (j + 1 < src.length) {
            out += src[j + 1];
            j += 2;
            continue;
          }
          j += 1;
          continue;
        }
        if (c === '(') depth += 1;
        if (c === ')') {
          depth -= 1;
          if (depth === 0) {
            j += 1;
            break;
          }
        }
        out += c;
        j += 1;
      }
      tokens.push({ type: 'str', value: pdfLiteralToString(out) });
      i = j;
      continue;
    }
    if (ch === '<') {
      if (src[i + 1] === '<') {
        tokens.push({ type: 'op', value: '<<' });
        i += 2;
        continue;
      }
      const j = src.indexOf('>', i);
      tokens.push({ type: 'hex', value: src.slice(i + 1, j < 0 ? src.length : j) });
      i = j < 0 ? src.length : j + 1;
      continue;
    }
    if (ch === '[' || ch === ']') {
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }
    if (ch === '/' ) {
      let j = i + 1;
      while (j < src.length && !/[\s\/\[\]<>(){}%]/.test(src[j])) j += 1;
      tokens.push({ type: 'name', value: src.slice(i + 1, j) });
      i = j;
      continue;
    }
    const numMatch = /^[+-]?(?:\d+\.?\d*|\.\d+)/.exec(src.slice(i, i + 32));
    if (numMatch) {
      tokens.push({ type: 'num', value: Number(numMatch[0]) });
      i += numMatch[0].length;
      continue;
    }
    let j = i;
    while (j < src.length && !/[\s\[\]<>(){}\/%]/.test(src[j])) j += 1;
    if (j === i) j += 1;
    tokens.push({ type: 'op', value: src.slice(i, j) });
    i = j;
  }
  return tokens;
}

function parsePdfContentStream(src, page) {
  const runs = [];
  const tokens = pdfTokens(src);
  const stack = [];
  let fontSize = 10;
  let color = '#333333';
  let textX = 0;
  let textY = 0;
  let leading = 12;
  const nums = () => stack.filter((item) => item.type === 'num').map((item) => item.value);
  const popStrings = () => stack.filter((item) => item.type === 'str' || item.type === 'hex');
  function flush(text) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value) return;
    runs.push({ text: value, x: textX, y: textY, size: fontSize, color });
  }
  for (let idx = 0; idx < tokens.length; idx++) {
    const token = tokens[idx];
    if (token.type !== 'op') {
      stack.push(token);
      continue;
    }
    const op = token.value;
    if (op === 'rg') {
      const list = nums();
      if (list.length >= 3) color = pdfColorFromOperands(list[list.length - 3], list[list.length - 2], list[list.length - 1]);
    } else if (op === 'g') {
      const list = nums();
      if (list.length >= 1) color = pdfColorFromGray(list[list.length - 1]);
    } else if (op === 'k') {
      const list = nums();
      if (list.length >= 4) color = pdfColorFromCmyk(list[list.length - 4], list[list.length - 3], list[list.length - 2], list[list.length - 1]);
    } else if (op === 'Tf') {
      const list = nums();
      if (list.length) fontSize = list[list.length - 1] || fontSize;
    } else if (op === 'TL') {
      const list = nums();
      if (list.length) leading = list[list.length - 1] || leading;
    } else if (op === 'Td' || op === 'TD') {
      const list = nums();
      if (list.length >= 2) {
        textX += list[list.length - 2];
        textY += list[list.length - 1];
        if (op === 'TD') leading = -list[list.length - 1] || leading;
      }
    } else if (op === 'Tm') {
      const list = nums();
      if (list.length >= 6) {
        textX = list[list.length - 2];
        textY = list[list.length - 1];
      }
    } else if (op === 'T*') {
      textY -= leading;
      textX = page.left || 0;
    } else if (op === 'BT') {
      textX = 0;
      textY = 0;
    } else if (op === 'Tj' || op === "'" || op === '"') {
      const strings = popStrings();
      if (strings.length) flush(strings.map((item) => (item.type === 'str' ? item.value : pdfHexToString(item.value))).join(''));
      if (op === "'" || op === '"') textY -= leading;
    } else if (op === 'TJ') {
      // TJ 的字符串与字距数字在 stack 里；用负字距 > 60 当空格。
      const parts = [];
      for (const item of stack) {
        if (item.type === 'str') parts.push(item.value);
        else if (item.type === 'hex') parts.push(pdfHexToString(item.value));
      }
      flush(parts.join(''));
    }
    stack.length = 0;
  }
  return runs;
}

/** 把同一 y 坐标附近的 Tj 合并成一行（PDF 里一行常被拆成多个文本 run）。 */
function clusterPdfRuns(runs) {
  const sorted = runs.slice().sort((a, b) => b.y - a.y);
  const lines = [];
  sorted.forEach((run) => {
    const tolerance = Math.max(2.5, (run.size || 10) * 0.5);
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - run.y) <= tolerance) {
      line.runs.push(run);
      line.y = (line.y * (line.runs.length - 1) + run.y) / line.runs.length;
    } else {
      lines.push({ y: run.y, runs: [run] });
    }
  });
  return lines.map((line) => {
    const ordered = line.runs.slice().sort((a, b) => a.x - b.x);
    let text = '';
    ordered.forEach((run, index) => {
      if (index > 0) {
        const prev = ordered[index - 1];
        const prevEnd = prev.x + String(prev.text).length * (prev.size || 10) * 0.5;
        if (run.x - prevEnd > (run.size || 10) * 0.18) text += ' ';
      }
      text += run.text;
    });
    const first = ordered[0];
    return { text, size: first.size, color: first.color, x: first.x, y: line.y };
  });
}

/** 解析 PDF：对象表 → FlateDecode 内容流 → Tf/Td/Tm/Tj/TJ + rg/g/k。 */
export function parsePdf(buf, sourceName) {
  const raw = buf.toString('latin1');
  if (raw.indexOf('%PDF') === -1) throw new ImportError('import/parse-failed', '不是有效的 PDF 文件');
  if (/\/Encrypt\s*<<|\/Encrypt\s+\d+\s+\d+\s+R/.test(raw)) {
    throw new ImportError('import/encrypted', '这份 PDF 加密了，暂不支持；请先解除密码保护再导入');
  }
  const objects = [];
  const objectRe = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;
  let objMatch;
  while ((objMatch = objectRe.exec(raw))) objects.push(objMatch[3]);
  if (!objects.length) throw new ImportError('import/parse-failed', 'PDF 结构无法识别（找不到对象表）');
  let pageWidthPt = 595.28;
  let pageHeightPt = 841.89;
  let objectStreams = 0;
  const fonts = [];
  const streams = [];
  for (const body of objects) {
    if (/\/Type\s*\/ObjStm/.test(body)) {
      objectStreams += 1;
      continue;
    }
    if (!fonts.length) {
      const fontMatches = body.match(/\/BaseFont\s*\/([A-Za-z0-9+#,._-]+)/g) || [];
      fontMatches.forEach((item) => fonts.push(item.replace(/^\/BaseFont\s*\//, '')));
    }
    const mediaBox = body.match(/\/MediaBox\s*\[\s*([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s*\]/);
    if (mediaBox) {
      const w = Math.abs(Number(mediaBox[3]) - Number(mediaBox[1]));
      const h = Math.abs(Number(mediaBox[4]) - Number(mediaBox[2]));
      if (w > 100 && h > 100) {
        pageWidthPt = w;
        pageHeightPt = h;
      }
    }
    if (/\bstream\b/.test(body)) {
      const streamIdx = body.search(/\bstream\b/);
      const dictionary = body.slice(0, streamIdx);
      let dataStart = streamIdx + 'stream'.length;
      if (body[dataStart] === '\r') dataStart += 1;
      if (body[dataStart] === '\n') dataStart += 1;
      const endIdx = body.indexOf('endstream', dataStart);
      let data = body.slice(dataStart, endIdx === -1 ? body.length : endIdx);
      if (data.endsWith('\r\n')) data = data.slice(0, -2);
      else if (data.endsWith('\n') || data.endsWith('\r')) data = data.slice(0, -1);
      const filterFlate = /\/Filter\s*(?:\[\s*)?\/FlateDecode/.test(dictionary);
      const otherFilter = /\/Filter\s*(?:\[\s*)?\/(?!FlateDecode)[A-Za-z0-9]+/.test(dictionary);
      if (!filterFlate) {
        if (!otherFilter) streams.push(data);
        continue;
      }
      try {
        streams.push(inflateSync(Buffer.from(data, 'latin1')).toString('latin1'));
      } catch {
        // 单个流坏掉不影响其它页，跳过即可
      }
    }
  }
  const page = { width: Math.round((pageWidthPt * 96) / 72), height: Math.round((pageHeightPt * 96) / 72) };
  const content = streams.join('\n');
  if (content && /BT[\s\S]*ET/.test(content)) {
    const runs = parsePdfContentStream(content, { left: 0 });
    if (runs.length) {
      const lines = clusterPdfRuns(runs);
      const scaled = lines.map((line) => ({
        text: line.text,
        size: Math.round((line.size * 96) / 72 * 10) / 10,
        color: line.color,
        left: Math.round((line.x * 96) / 72),
        top: Math.round(((pageHeightPt - line.y) * 96) / 72),
        width: 0,
      }));
      return collectModel(scaled, 'pdf', sourceName, page, fonts, objectStreams ? 'PDF 使用了对象流（ObjStm），只有部分内容被解析' : '');
    }
  }
  // 退化：从所有内容流里抽 (…) 文本，至少给用户一个「可以继续用」的初稿。
  const plainBlocks = [];
  const textRe = /\((?:\\.|[^\\()])*\)/g;
  let textMatch;
  let line = 0;
  while ((textMatch = textRe.exec(content))) {
    const value = pdfLiteralToString(textMatch[0].slice(1, -1)).replace(/\s+/g, ' ').trim();
    if (!value || value.length < 2 || /^[\d\s.]+$/.test(value)) continue;
    plainBlocks.push({ text: value, size: 13.5, color: '', bold: false, left: 72, top: 96 + line * 26, width: page.width - 144 });
    line += 1;
    if (line >= 200) break;
  }
  if (!plainBlocks.length) {
    throw new ImportError(
      'import/parse-failed',
      objectStreams
        ? '这份 PDF 使用了对象流（ObjStm）且没有可解析的文本层，暂不支持；可以先用截图生成模板'
        : 'PDF 里没有可读文本（可能是扫描件），暂不支持；可以先用截图生成模板',
    );
  }
  return collectModel(plainBlocks, 'pdf', sourceName, page, fonts, 'PDF 结构复杂，已退化为纯文本抽取');
}

/* ---------------- 模型 → 模板初稿 ---------------- */

function kindLabel(kind) {
  if (kind === 'docx' || kind === 'doc') return 'Word 文档';
  if (kind === 'pdf') return 'PDF 文档';
  if (kind === 'image') return '图片';
  return '文件';
}

function draftStyleDefaults() {
  return {
    colors: {
      accent: '#2f6fde',
      nameColor: '#10213a',
      headingColor: '#133a63',
      bodyColor: '#1f2937',
      background: '#ffffff',
      bandColor: '#eef3fb',
      gold: '#c9a227',
    },
    nameSize: 32,
    headingSize: 12.5,
    bodySize: 13.5,
    lineHeight: 1.62,
    padX: 56,
    padY: 48,
    sectionGap: 18,
    contactCols: 2,
    headingStyle: 'rule',
    fontFamily: 'sans',
    headerAlign: 'left',
    headerBand: false,
    layout: 'single',
    headerStyle: 'plain',
    contentStyle: 'plain',
  };
}

function colorFrequency(blocks) {
  const counts = new Map();
  blocks.forEach((block) => {
    const color = normalizeColor(block.color);
    if (!color) return;
    counts.set(color, (counts.get(color) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map((entry) => ({ color: entry[0], count: entry[1], saturation: colorSaturation(entry[0]), luminance: colorLuminance(entry[0]) }));
}

function pickAccent(blocks) {
  const stats = colorFrequency(blocks).filter((item) => item.saturation >= 0.18 && item.luminance >= 0.08 && item.luminance <= 0.82);
  if (!stats.length) return '';
  stats.sort((a, b) => b.count * (0.5 + b.saturation) - a.count * (0.5 + a.saturation));
  return stats[0].color;
}

function sampleFromModel(model) {
  const blocks = model.blocks || [];
  const basics = { name: '', role: '', phone: '', email: '', city: '', wechat: '', github: '', website: '' };
  const nameBlock = blocks.find((block) => block.role === 'name');
  const subtitleBlock = blocks.find((block) => block.role === 'subtitle');
  if (nameBlock) basics.name = nameBlock.text;
  if (subtitleBlock) basics.role = subtitleBlock.text;
  const contactTexts = blocks.filter((block) => block.role === 'contact').map((block) => block.text);
  contactTexts.forEach((text) => {
    const email = text.match(EMAIL_RE);
    if (email && !basics.email) basics.email = email[0];
    const phone = text.match(PHONE_RE);
    if (phone && !basics.phone) basics.phone = phone[0].replace(/\s+/g, ' ').trim();
    const city = text.match(CITY_RE);
    if (city && !basics.city) basics.city = city[1];
    const url = text.match(URL_RE);
    if (url && !basics.website) basics.website = url[0];
  });
  const bodyLines = blocks
    .filter((block) => block.role === 'body' || block.role === 'bullet')
    .map((block) => block.text)
    .filter(Boolean);
  const summary = bodyLines.slice(0, 3).join('；').slice(0, 400);
  const rest = bodyLines.slice(3, 23).join('\n').slice(0, 1200);
  return {
    basics,
    summary: rest ? summary + (summary ? '\n' : '') + rest : summary,
    experience: [],
    projects: [],
    education: [],
    skills: [],
    awards: [],
  };
}

/** 模型 → 模板初稿：style 与示例数据。解析不到内容时用内置示例兜底。 */
export function mapModelToDraft(model) {
  const style = draftStyleDefaults();
  const blocks = (model && model.blocks) || [];
  const page = (model && model.page) || A4_PX;
  const kind = (model && model.kind) || 'docx';
  const accent = pickAccent(blocks);
  const named = blocks.find((block) => block.role === 'name');
  const headings = blocks.filter((block) => block.role === 'heading');
  const bodyBlocks = blocks.filter((block) => block.role === 'body' || block.role === 'bullet');
  const freq = colorFrequency(blocks);
  if (accent) {
    style.colors.accent = accent;
    style.colors.headingColor = accent;
    style.colors.bandColor = mixHex(accent, '#ffffff', 0.86);
    const warm = freq
      .filter((item) => {
        const hue = colorHue(item.color);
        return item.saturation >= 0.28 && hue >= 25 && hue <= 70 && item.count >= 1;
      })
      .map((item) => item.color);
    if (warm.length) style.colors.gold = warm[0];
  }
  if (named) style.colors.nameColor = named.color && colorLuminance(named.color) < 0.75 ? named.color : style.colors.nameColor;
  if (!accent) {
    const headingColor = headings.length ? headings[0].color : '';
    if (headingColor && colorLuminance(headingColor) < 0.75) style.colors.headingColor = headingColor;
  }
  const bodyColor = bodyBlocks.length ? mostCommonTextColor(bodyBlocks) : '';
  if (bodyColor && colorLuminance(bodyColor) < 0.8) style.colors.bodyColor = bodyColor;
  // 版式：左侧栏 = 有一批块长期贴左边、同时右侧还有正文
  const leftLimit = page.width * 0.32;
  const leftBlocks = blocks.filter((block) => block.left < leftLimit);
  const rightBlocks = blocks.filter((block) => block.left >= page.width * 0.35);
  const leftSpan = leftBlocks.length ? Math.max.apply(null, leftBlocks.map((block) => block.top)) - Math.min.apply(null, leftBlocks.map((block) => block.top)) : 0;
  if (leftBlocks.length >= 3 && rightBlocks.length >= 2 && leftSpan >= page.height * 0.25) {
    style.layout = 'sidebar';
    style.headerStyle = 'plain';
  }
  const topBlocks = blocks.filter((block) => block.top <= page.height * 0.24);
  if (style.layout !== 'sidebar' && topBlocks.length) {
    const accentTop = topBlocks.filter((block) => normalizeColor(block.color) === accent);
    if (accentTop.length >= 2) style.headerStyle = 'band';
    const ribbon = blocks.filter((block) => block.left < page.width * 0.32 && block.top < page.height * 0.14);
    if (ribbon.length >= 1 && accent === normalizeColor(ribbon[0].color)) style.headerStyle = 'ribbon';
  }
  style.headerBand = style.headerStyle === 'band';
  // 标题装饰：标题块颜色多数等于强调色 → 色块/斜切；只有一两个 → 下划线
  if (headings.length) {
    const accentHeadings = headings.filter((block) => normalizeColor(block.color) === accent);
    if (accentHeadings.length >= 3) style.headingStyle = 'tab';
    else if (accentHeadings.length >= 1) style.headingStyle = 'underline';
    else style.headingStyle = 'bar';
  }
  // 字体：PDF 字体名或 docx rFonts 里出现衬线字体时用衬线
  const fonts = ((model && model.fonts) || []).join(' ').toLowerCase();
  if (/serif|song|simsun|times|georgia|garamond|cambria|宋体|楷体/.test(fonts)) style.fontFamily = 'serif';
  if (/mono|courier|consolas/.test(fonts)) style.fontFamily = 'mono';
  // 字号与留白：用块的实际大小位置反推
  if (named) style.nameSize = clamp(Math.round(named.size), 20, 52);
  const headingSizes = headings.map((block) => block.size).filter(Boolean);
  if (headingSizes.length) style.headingSize = clamp(Math.round(median(headingSizes) * 10) / 10, 9.5, 22);
  const bodySizes = bodyBlocks.map((block) => block.size).filter(Boolean);
  if (bodySizes.length) style.bodySize = clamp(Math.round(median(bodySizes) * 10) / 10, 10, 18);
  const lefts = blocks.map((block) => block.left).filter((value) => Number.isFinite(value));
  if (lefts.length) style.padX = clamp(Math.round(Math.min.apply(null, lefts)), 24, 110);
  const tops = blocks.map((block) => block.top).filter((value) => Number.isFinite(value));
  if (tops.length) style.padY = clamp(Math.round(Math.min.apply(null, tops)), 20, 110);
  const sample = sampleFromModel({ blocks });
  const baseName = String((model && model.sourceName) || '导入的文件').replace(/\.[a-z0-9]+$/i, '').slice(0, 20);
  return {
    name: (baseName || '导入模板') + ' 初稿',
    tagline: '从' + kindLabel(kind) + '解析生成的初稿',
    style,
    sample,
  };
}

/** 一步到位：识别 → 解析 → 生成初稿。路由层只需要这个。 */
export function importTemplateFile({ name, buffer }) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new ImportError('import/empty', '文件内容为空', 400);
  }
  if (buffer.length > IMPORT_MAX_BYTES) {
    throw new ImportError('import/too-large', '文件超过 8MB 上限，请压缩或截取需要的部分', 413);
  }
  const kind = detectKind(buffer, name);
  if (kind === 'unsupported') {
    throw new ImportError('import/unsupported', '不支持的文件类型，请上传 .doc / .docx / .pdf / 图片', 400);
  }
  let model;
  if (kind === 'docx') model = parseDocx(buffer, name);
  else if (kind === 'doc') model = parseDoc(buffer, name);
  else if (kind === 'pdf') model = parsePdf(buffer, name);
  else {
    // 图片没有文本层：交给客户端 canvas 取色，这里只返回一个带限制说明的空模型。
    model = collectModel([], 'image', name, A4_PX, [], '图片请在浏览器端用 canvas 取色（本机不跑视觉模型）');
  }
  const draft = mapModelToDraft(model);
  return { model, draft };
}
