/**
 * 模板 AI 优化：程序先跑一遍初版（文件/图片解析 + 版式识别），
 * 再把「源文档摘要 + 初稿 style」交给当前模型比对，产出修正后的 style。
 *
 * 设计取舍：
 *  - 不猜、不编：只让模型在**既有枚举**里挑值和微调颜色/字号，越界字段直接丢弃；
 *  - 一次调用、纯 JSON 输出，失败就退回程序初稿（不阻塞用户「套用初稿」）；
 *  - 源文档只发摘要（文本 + 文本块的行级特征），不把整份文件塞进上下文。
 */
import { hostComplete } from './chat.js';

/** 允许模型调的值域，跟 src/client/33-template-editor.js 的枚举保持一致。 */
const ENUMS = {
  layout: ['single', 'sidebar'],
  headerStyle: ['plain', 'band', 'split', 'ribbon'],
  contentStyle: ['plain', 'card'],
  headingStyle: ['rule', 'bar', 'underline', 'plain', 'banner', 'tab', 'pill', 'icon', 'leftbar'],
};
const SECTIONS = ['summary', 'education', 'experience', 'projects', 'skills', 'awards'];
const COLORS = ['accent', 'nameColor', 'headingColor', 'bodyColor', 'background', 'bandColor', 'gold'];
const MAX_TEXT_CHARS = 6000;
const MAX_BLOCK_LINES = 120;
const MAX_NOTES_CHARS = 600;

const SYSTEM_PROMPT = [
  '你是简历模板版式分析专家。程序已经从一个简历文件里提取出文本块与版式特征，并生成了一份模板样式初稿（style JSON）。',
  '你的任务是：比对「源文档摘要」和「初稿」，输出修正后的 style，让渲染出来的模板更接近原文档的版式。',
  '',
  '判断依据（按重要性）：',
  '1. 布局：左栏放联系方式和额外模块 → layout=sidebar；整页单栏 → single。',
  '2. 页眉：整宽底色块 → band；左名右联系方式两栏 → split；左上角斜标签 → ribbon；只有上下细线 → plain。',
  '3. 模块标题：填充色块/胶囊 → tab 或 pill；左侧竖条 → leftbar；圆点/图标 → icon；下划线 → rule / underline；无装饰 → plain。',
  '4. 内容块：每个模块有独立边框/底纹 → card；否则 plain。',
  '5. 侧栏模块（仅 sidebar）：左栏除了联系方式还放了技能/语言/兴趣 → sidebarSections 至少含 "skills"；奖项也可放。',
  '6. 颜色：从源文档的主色/强调色来，accents 用 6 位十六进制；不确定就保留初稿的值。',
  '',
  '输出要求：',
  '- 只输出一个 ```json 代码块，内容严格是：',
  '{"style": {"layout": "single|sidebar", "headerStyle": "plain|band|split|ribbon", "headingStyle": "rule|bar|underline|plain|banner|tab|pill|icon|leftbar", "contentStyle": "plain|card", "sidebarSections": ["skills"], "contactCols": 1, "colors": {"accent": "#2c6474", "bandColor": "#edf4f6", "headingColor": "#2c6474", "nameColor": "#1d2430", "bodyColor": "#1d2939", "background": "#ffffff"}, "nameSize": 30, "headingSize": 13, "bodySize": 13.5, "sectionGap": 16}, "demoText": {"name": "", "role": ""}, "notes": "不超过 200 字的中文说明：你改了哪些、依据是什么、还有哪里不确定"}',
  '- 字段可以省略（省略 = 保留初稿），但不要输出上面没有的字段；颜色必须是 #rrggbb。',
  '- 不要编造简历内容；demoText 只用于示例姓名/岗位占位，没有依据就留空。',
  '- 只在有明确视觉证据时改；不确定就保留原值，并在 notes 里说明。',
].join('\n');

function short(text, max) {
  const value = String(text == null ? '' : text).replace(/\r\n/g, '\n');
  return value.length <= max ? value : value.slice(0, max) + '…';
}

/** 源文档摘要：文本 + 行级版式特征（不给模型看像素）。 */
function buildSourceDigest(source) {
  const src = source && typeof source === 'object' ? source : {};
  const blocks = Array.isArray(src.blocks) ? src.blocks.slice(0, MAX_BLOCK_LINES) : [];
  const lines = blocks.map(function (block, index) {
    const text = short(String((block && block.text) || '').replace(/\s+/g, ' ').trim(), 80);
    if (!text) return '';
    const bits = [];
    if (block.role) bits.push('role=' + block.role);
    if (Number(block.size) > 0) bits.push('size=' + Math.round(block.size));
    if (block.bold) bits.push('bold');
    if (block.color) bits.push('color=' + block.color);
    if (Number.isFinite(Number(block.left))) bits.push('x=' + Math.round(Number(block.left)));
    if (Number.isFinite(Number(block.top))) bits.push('y=' + Math.round(Number(block.top)));
    return index + '. ' + (bits.length ? '[' + bits.join(',') + '] ' : '') + text;
  });
  const blockText = lines.filter(Boolean).join('\n');
  const page = src.page && typeof src.page === 'object' ? src.page : {};
  const meta = [
    '来源类型：' + String(src.kind || 'unknown'),
    '文件名：' + String(src.sourceName || src.name || '(未命名)'),
    page.width ? '页面：' + page.width + 'x' + page.height : '',
    src.colors && typeof src.colors === 'object' ? '主色候选：' + JSON.stringify(src.colors).slice(0, 400) : '',
    src.fonts ? '字体倾向：' + String(src.fonts).slice(0, 120) : '',
  ]
    .filter(Boolean)
    .join('\n');
  return (
    meta +
    '\n\n文本块（' + blocks.length + ' 条' + (src.blocks && src.blocks.length > blocks.length ? '，已截断' : '') + '）：\n' +
    (blockText || '(解析不到文本块，只能靠版式特征判断)') +
    '\n\n全文摘要（前 ' + MAX_TEXT_CHARS + ' 字符）：\n' +
    short(String(src.text || ''), MAX_TEXT_CHARS)
  );
}

/** 从回复里取 JSON（优先 ```json 代码块，其次第一个平衡的 {...}）。 */
export function parseRefineJson(text) {
  const source = String(text == null ? '' : text);
  const fenced = [...source.matchAll(/```(?:json)?\s*\n?([\s\S]*?)```/g)];
  const candidates = fenced.map(function (match) {
    return match[1].trim();
  });
  const braceStart = source.indexOf('{');
  if (braceStart !== -1) {
    let depth = 0;
    for (let i = braceStart; i < source.length; i++) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          candidates.push(source.slice(braceStart, i + 1));
          break;
        }
      }
    }
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      /* 试下一个候选 */
    }
  }
  return null;
}

function clampSize(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function colorOf(value) {
  const text = String(value == null ? '' : value).trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(text)) {
    return ('#' + text[1] + text[1] + text[2] + text[2] + text[3] + text[3]).toLowerCase();
  }
  return '';
}

/** 把模型输出收敛回安全的 style 对象（越界字段直接丢弃，不报错）。 */
export function sanitizeRefineStyle(input, fallback) {
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  const raw = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const key of Object.keys(base)) out[key] = base[key];
  for (const key of ['layout', 'headerStyle', 'contentStyle', 'headingStyle']) {
    const value = typeof raw[key] === 'string' ? raw[key].trim() : '';
    if (ENUMS[key].indexOf(value) !== -1) out[key] = value;
  }
  if (Array.isArray(raw.sidebarSections)) {
    const picked = [];
    for (const item of raw.sidebarSections) {
      const id = typeof item === 'string' ? item.trim() : '';
      if (SECTIONS.indexOf(id) !== -1 && picked.indexOf(id) === -1) picked.push(id);
    }
    if (picked.length) out.sidebarSections = picked.slice(0, 4);
  }
  if (raw.contactCols === 1 || raw.contactCols === 2) out.contactCols = raw.contactCols;
  const colorsIn = raw.colors && typeof raw.colors === 'object' ? raw.colors : raw;
  const colors = {};
  const baseColors = base.colors && typeof base.colors === 'object' ? base.colors : {};
  for (const key of COLORS) {
    const value = colorOf(colorsIn[key]);
    if (value) colors[key] = value;
    else if (baseColors[key]) colors[key] = baseColors[key];
  }
  if (Object.keys(colors).length) out.colors = colors;
  const sizes = {
    nameSize: [14, 64],
    headingSize: [9, 24],
    bodySize: [10, 20],
    sectionGap: [6, 60],
  };
  for (const key of Object.keys(sizes)) {
    const baseValue = base[key] != null ? base[key] : undefined;
    const value = raw[key] != null ? raw[key] : baseValue;
    if (value == null) continue;
    out[key] = clampSize(value, Number(baseValue) || sizes[key][0], sizes[key][0], sizes[key][1]);
  }
  return out;
}

/**
 * 跑一次 AI 优化。
 * @param {{ctx?: object, source: object, draft: object, lang?: string}} input
 * @returns {Promise<{style: object, demoText: object, notes: string, model: string, durationMs: number, raw: string}>}
 */
export async function refineTemplate(input) {
  const { ctx, source, draft } = input || {};
  if (!source || typeof source !== 'object') {
    const error = new Error('缺少源文档解析结果（source）');
    error.code = 'template/no-source';
    error.status = 400;
    throw error;
  }
  const draftObj = draft && typeof draft === 'object' ? draft : {};
  const draftStyle = draftObj.style && typeof draftObj.style === 'object' ? draftObj.style : draftObj;
  const user = [
    '源文档摘要：',
    buildSourceDigest(source),
    '',
    '程序生成的模板初稿（style）：',
    JSON.stringify(draftStyle, null, 2).slice(0, 4000),
    '',
    '请比对后输出修正版 JSON。',
  ].join('\n');
  const result = await hostComplete({
    ctx,
    system: SYSTEM_PROMPT,
    user,
    maxTokens: 1600,
    temperature: 0.15,
    timeoutMs: 120000,
  });
  const parsed = parseRefineJson(result.text);
  if (!parsed) {
    const error = new Error('AI 没有返回可解析的 JSON，请重试或直接使用程序初稿');
    error.code = 'template/bad-json';
    error.status = 502;
    throw error;
  }
  const style = sanitizeRefineStyle(parsed.style, draftStyle);
  const demoIn = parsed.demoText && typeof parsed.demoText === 'object' ? parsed.demoText : {};
  const demoText = {};
  if (typeof demoIn.name === 'string' && demoIn.name.trim()) demoText.name = demoIn.name.trim().slice(0, 40);
  if (typeof demoIn.role === 'string' && demoIn.role.trim()) demoText.role = demoIn.role.trim().slice(0, 60);
  return {
    style,
    demoText,
    notes: short(String(parsed.notes || ''), MAX_NOTES_CHARS),
    model: result.model,
    durationMs: result.durationMs,
    raw: short(result.text, 2000),
  };
}
