/**
 * 「框选预览元素 → 让 AI 改」的 Host 侧实现。
 *
 * 设计要点：
 *  - 内容修改直接落到 resume.data（换模板后仍然有效）；
 *  - 样式修改落到 resume.styleOverride + styleOverrideCss（换模板时保留覆盖，可一键清除）；
 *  - AI 只负责「改哪一段文字 / 给哪几个样式字段」，落盘与白名单校验都在这里做，
 *    模型给的路径必须命中白名单，否则整条忽略，避免把数据结构写坏。
 */
import { hostComplete } from './chat.js';
import { SECTION_ORDER, normalizeData } from './shared/doc.js';

const MAX_INSTRUCTION = 1200;
const MAX_EDITS = 24;
const MAX_VALUE = 2000;
const MAX_OVERRIDE_CSS = 20000;

const BASIC_FIELDS = ['name', 'role', 'phone', 'email', 'city', 'wechat', 'github', 'website'];
const ENTRY_FIELDS = {
  experience: ['company', 'role', 'period', 'location'],
  projects: ['name', 'role', 'period'],
  education: ['school', 'degree', 'major', 'period', 'gpa', 'courses'],
};
const SKILL_FIELDS = ['group', 'items'];
const AWARD_FIELDS = ['title', 'date', 'desc'];

const STYLE_NUMERIC = ['nameSize', 'headingSize', 'bodySize', 'lineHeight', 'padX', 'padY', 'sectionGap', 'contactCols'];
const STYLE_ENUM = {
  headingStyle: ['rule', 'bar', 'underline', 'plain', 'banner', 'tab', 'pill', 'icon', 'leftbar'],
  layout: ['single', 'sidebar'],
  headerStyle: ['plain', 'band', 'split', 'ribbon'],
  contentStyle: ['plain', 'card'],
  fontFamily: ['sans', 'serif', 'mono'],
  headerAlign: ['left', 'center'],
};
const STYLE_COLORS = ['accent', 'nameColor', 'headingColor', 'bodyColor', 'background', 'bandColor', 'gold'];

function fail(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status || 400;
  return error;
}

function short(value, limit) {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return text.length > limit ? text.slice(0, limit) + '…' : text;
}

/** 选中范围的人类可读标签（也回传前端做 toast）。 */
export function descriptorLabel(descriptor) {
  const d = descriptor && typeof descriptor === 'object' ? descriptor : {};
  const scope = String(d.scope || '');
  if (scope === 'basics') return '基本信息 · ' + (d.field || '字段');
  if (scope === 'summary') return '个人简介';
  if (scope === 'sectionTitle') return '模块标题 · ' + (d.section || '');
  if (scope === 'entry') return '条目 · ' + (d.section || '') + ' #' + (Number(d.index) + 1 || 1);
  if (scope === 'bullet') return '要点 · ' + (d.section || '') + ' #' + (Number(d.index) + 1 || 1) + ' · ' + (Number(d.bulletIndex) + 1 || 1);
  if (scope === 'section') return '整个模块 · ' + (d.section || '');
  return '选区';
}

/** 取选区当前文字，给模型做「改前/改后」参考。 */
export function textOfSelection(resume, descriptor) {
  const data = (resume && resume.data) || {};
  const d = descriptor && typeof descriptor === 'object' ? descriptor : {};
  const section = String(d.section || '');
  const index = Number(d.index);
  const bulletIndex = Number(d.bulletIndex);
  if (d.scope === 'basics') return String((data.basics || {})[d.field] || '');
  if (d.scope === 'summary') return String(data.summary || '');
  if (d.scope === 'sectionTitle') return String((resume && resume.sectionTitles && resume.sectionTitles[section]) || '');
  if (d.scope === 'entry' || d.scope === 'bullet') {
    const list = Array.isArray(data[section]) ? data[section] : [];
    const entry = list[index];
    if (!entry) return '';
    if (d.scope === 'entry') return JSON.stringify(entry);
    const bullets = Array.isArray(entry.bullets) ? entry.bullets : [];
    return String(bullets[bulletIndex] || '');
  }
  if (d.scope === 'section') {
    const list = Array.isArray(data[section]) ? data[section] : [];
    return short(JSON.stringify(list), 1200);
  }
  return '';
}

function parseJsonObject(text) {
  const raw = String(text || '');
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const candidate = fenced ? fenced[1] : raw;
  try {
    const value = JSON.parse(candidate.trim());
    return value && typeof value === 'object' ? value : null;
  } catch {
    // 退化：截取最外层花括号（模型偶尔会带前言）。
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      const value = JSON.parse(candidate.slice(start, end + 1));
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** 白名单校验 + 应用一条编辑；非法路径返回 null。 */
function applyEdit(data, sectionTitles, edit) {
  if (!edit || typeof edit !== 'object') return null;
  const path = String(edit.path || '').trim();
  if (!path) return null;
  const value = String(edit.value == null ? '' : edit.value).slice(0, MAX_VALUE);
  const parts = path.split('.');
  const head = parts[0];

  if (head === 'basics' && parts.length === 2 && BASIC_FIELDS.indexOf(parts[1]) !== -1) {
    data.basics = data.basics || {};
    data.basics[parts[1]] = value;
    return path;
  }
  if (head === 'summary' && parts.length === 1) {
    data.summary = value;
    return path;
  }
  if (head === 'sectionTitles' && parts.length === 2 && SECTION_ORDER.indexOf(parts[1]) !== -1) {
    sectionTitles[parts[1]] = value;
    return path;
  }
  if (head === 'skills' && parts.length === 3) {
    const index = Number(parts[1]);
    const field = parts[2];
    const list = Array.isArray(data.skills) ? data.skills : (data.skills = []);
    if (!Number.isInteger(index) || index < 0 || index >= list.length) return null;
    if (SKILL_FIELDS.indexOf(field) === -1) return null;
    list[index] = { ...list[index], [field]: value };
    return path;
  }
  if (head === 'awards' && parts.length === 3) {
    const index = Number(parts[1]);
    const field = parts[2];
    const list = Array.isArray(data.awards) ? data.awards : (data.awards = []);
    if (!Number.isInteger(index) || index < 0 || index >= list.length) return null;
    if (AWARD_FIELDS.indexOf(field) === -1) return null;
    list[index] = { ...list[index], [field]: value };
    return path;
  }
  const fields = ENTRY_FIELDS[head];
  if (fields && parts.length === 3) {
    const index = Number(parts[1]);
    const field = parts[2];
    const list = Array.isArray(data[head]) ? data[head] : (data[head] = []);
    if (!Number.isInteger(index) || index < 0 || index >= list.length) return null;
    if (fields.indexOf(field) === -1) return null;
    list[index] = { ...list[index], [field]: value };
    return path;
  }
  if (fields && parts.length === 4 && parts[2] === 'bullets') {
    const index = Number(parts[1]);
    const bulletIndex = Number(parts[3]);
    const list = Array.isArray(data[head]) ? data[head] : [];
    const entry = list[index];
    if (!entry || !Array.isArray(entry.bullets)) return null;
    if (!Number.isInteger(bulletIndex) || bulletIndex < 0 || bulletIndex >= entry.bullets.length) return null;
    entry.bullets[bulletIndex] = value;
    return path;
  }
  return null;
}

/** 收敛 AI 给的样式补丁（只留已知字段，范围夹取）。 */
export function sanitizeStylePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return null;
  const out = {};
  const colors = patch.colors && typeof patch.colors === 'object' ? patch.colors : patch;
  for (const key of STYLE_COLORS) {
    const value = colors[key] != null ? colors[key] : patch[key];
    if (typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value)) {
      out.colors = out.colors || {};
      out.colors[key] = value;
    }
  }
  for (const key of STYLE_NUMERIC) {
    const value = Number(patch[key]);
    if (Number.isFinite(value) && value > 0 && value <= 400) out[key] = value;
  }
  for (const key of Object.keys(STYLE_ENUM)) {
    if (STYLE_ENUM[key].indexOf(patch[key]) !== -1) out[key] = patch[key];
  }
  if (typeof patch.headerBand === 'boolean') out.headerBand = patch.headerBand;
  return Object.keys(out).length ? out : null;
}

function safeCss(css) {
  if (typeof css !== 'string') return '';
  const text = css.trim();
  if (!text || text.length > MAX_OVERRIDE_CSS) return '';
  // 只允许样式片段：出现 </style> 或脚本一律丢弃，避免注入到导出 HTML。
  if (/<\/style|<script|javascript:/i.test(text)) return '';
  return text;
}

function plainBasics(basics) {
  const src = basics && typeof basics === 'object' ? basics : {};
  const out = {};
  for (const key of BASIC_FIELDS) {
    if (src[key]) out[key] = short(src[key], 160);
  }
  // 照片是 base64 dataURL：绝不能进提示词，会把上下文撑爆，也可能被模型改坏。
  if (src.photo) out.photo = '[已上传照片]';
  return out;
}

function buildContext(resume, descriptor, instruction) {
  const data = (resume && resume.data) || {};
  const plain = {
    basics: plainBasics(data.basics),
    summary: short(data.summary, 400),
    experience: (Array.isArray(data.experience) ? data.experience : []).map((item) => ({
      company: short(item.company, 60),
      role: short(item.role, 60),
      period: short(item.period, 40),
      bullets: (Array.isArray(item.bullets) ? item.bullets : []).map((b) => short(b, 160)),
    })),
    projects: (Array.isArray(data.projects) ? data.projects : []).map((item) => ({
      name: short(item.name, 60),
      role: short(item.role, 60),
      period: short(item.period, 40),
      bullets: (Array.isArray(item.bullets) ? item.bullets : []).map((b) => short(b, 160)),
    })),
    education: (Array.isArray(data.education) ? data.education : []).map((item) => ({
      school: short(item.school, 60),
      degree: short(item.degree, 40),
      major: short(item.major, 60),
      period: short(item.period, 40),
      gpa: short(item.gpa, 40),
      courses: short(item.courses, 200),
    })),
    skills: (Array.isArray(data.skills) ? data.skills : []).map((item) => ({
      group: short(item.group, 40),
      items: short(item.items, 200),
    })),
    awards: (Array.isArray(data.awards) ? data.awards : []).map((item) => ({
      title: short(item.title, 60),
      date: short(item.date, 40),
      desc: short(item.desc, 80),
    })),
  };
  return JSON.stringify({ data: plain, selection: descriptorLabel(descriptor), instruction: instruction }, null, 1);
}

const SYSTEM_PROMPT = [
  '你是一份中文简历的改稿助手。用户会在预览里框选一段内容，然后用一句话告诉你「想怎么改」。',
  '你只能改用户选中的那一处（必要时顺带把紧邻的 1-2 条要点一起改顺），不要重写整份简历，不要编造用户没提供的经历或数字。',
  '',
  '先判断这次修改属于哪一类：',
  '1) 文字/内容修改：输出 kind="text"，并用 edits 数组给出要改的路径与新值。',
  '   允许的 path 白名单（大小写敏感、下标 0 起）：',
  '   basics.name | basics.role | basics.phone | basics.email | basics.city | basics.wechat | basics.github | basics.website',
  '   summary',
  '   sectionTitles.<summary|education|experience|projects|skills|awards>',
  '   experience.<i>.company|role|period|location ；experience.<i>.bullets.<j>',
  '   projects.<i>.name|role|period ；projects.<i>.bullets.<j>',
  '   education.<i>.school|degree|major|period|gpa|courses',
  '   skills.<i>.group|items ；awards.<i>.title|date|desc',
  '2) 样式/版式修改（字号、颜色、加粗、间距等）：输出 kind="style"，并在 stylePatch 里只写要改的字段：',
  '   nameSize / headingSize / bodySize / lineHeight / sectionGap / contactCols（数字，px 或列数）',
  '   headingStyle: rule|bar|underline|plain|banner|tab|pill|icon|leftbar；layout: single|sidebar；',
  '   headerStyle: plain|band|split|ribbon；contentStyle: plain|card；fontFamily: sans|serif|mono',
  '   colors: {accent,nameColor,headingColor,bodyColor,background,bandColor,gold}（#rrggbb）',
  '',
  '只输出一个 ```json 代码块，内容形如：',
  '{"kind":"text","summary":"一句话说明改了什么","note":"可选补充说明","edits":[{"path":"experience.0.bullets.1","value":"新的要点"}]}',
  '或',
  '{"kind":"style","summary":"把姓名调大","note":"","stylePatch":{"nameSize":46}}',
].join('\n');

/**
 * 执行一次「框选修改」。
 * @returns {{resume?:object, change:object}}
 */
export async function editSelection({ ctx, store, resumeId, descriptor, instruction, styleOverride, styleOverrideCss }) {
  const id = String(resumeId || '').trim();
  if (!id) throw fail('selection/no-resume-id', '缺少 resumeId', 400);
  let resume;
  try {
    resume = store.getResume(id);
  } catch {
    resume = null;
  }
  if (!resume) throw fail('selection/no-resume', '找不到这份简历，可能已经被删除', 404);

  const text = String(instruction || '').trim();
  if (!text) throw fail('selection/no-instruction', '请先写一句想怎么改', 400);
  if (text.length > MAX_INSTRUCTION) throw fail('selection/instruction-too-long', '修改描述太长了，控制在 ' + MAX_INSTRUCTION + ' 字以内', 400);
  const desc = descriptor && typeof descriptor === 'object' ? descriptor : {};
  if (!desc.scope) throw fail('selection/unsupported', '没有识别出选中的内容范围', 400);

  // 第二阶段：客户端已经把样式补丁算成 CSS 传回来了，直接落盘，不再调模型。
  if (styleOverride && typeof styleOverride === 'object') {
    const patch = sanitizeStylePatch(styleOverride);
    if (!patch) throw fail('selection/unsupported', '样式补丁里没有可用的字段', 400);
    const merged = { ...(resume.styleOverride || {}), ...patch };
    const css = safeCss(styleOverrideCss);
    const saved = await store.updateResume(id, {
      styleOverride: merged,
      styleOverrideCss: css,
    });
    return { resume: saved, change: { kind: 'style', summary: '已应用样式修改', note: '预览与 PDF 已生效；导出 Word 会回退到模板默认样式。' } };
  }

  const user = [
    '当前简历（节选，JSON）：',
    buildContext(resume, desc, text),
    '',
    '用户选中的范围：' + descriptorLabel(desc),
    '选中的原文：' + short(textOfSelection(resume, desc), 1500),
    '用户的修改要求：' + text,
  ].join('\n');

  let reply;
  try {
    reply = await hostComplete({ ctx, system: SYSTEM_PROMPT, user: user, temperature: 0.2, maxTokens: 1600, timeoutMs: 90000 });
  } catch (error) {
    const message = String((error && error.message) || error || '');
    if (/没有可用的 AI 模型|no-key|API Key/i.test(message)) {
      throw fail('selection/no-ai', '没有可用的 AI 模型：请确认 DSH 已配置默认模型，或到设置页填写 DeepSeek API Key', 400);
    }
    if (error && error.code) {
      const wrapped = fail('selection/upstream', message, 502);
      throw wrapped;
    }
    throw fail('selection/upstream', 'AI 修改失败：' + short(message, 160), 502);
  }

  const parsed = parseJsonObject(reply.text);
  if (!parsed) throw fail('selection/bad-json', 'AI 返回的内容不是可用的 JSON，请再试一次', 502);

  if (parsed.kind === 'style' || (parsed.stylePatch && !Array.isArray(parsed.edits))) {
    const patch = sanitizeStylePatch(parsed.stylePatch);
    if (!patch) throw fail('selection/bad-json', 'AI 没给出可用的样式字段，请换种说法再试', 502);
    return {
      change: {
        kind: 'style',
        summary: short(parsed.summary || '建议调整样式', 120),
        note: short(parsed.note || '', 200),
        stylePatch: patch,
        label: descriptorLabel(desc),
      },
    };
  }

  const edits = (Array.isArray(parsed.edits) ? parsed.edits : []).slice(0, MAX_EDITS);
  if (!edits.length) throw fail('selection/bad-json', 'AI 没有给出要改的内容，请把要求写得更具体一点', 502);

  const data = normalizeData(clone(resume.data || {}));
  const sectionTitles = { ...(resume.sectionTitles || {}) };
  const applied = [];
  for (const edit of edits) {
    const path = applyEdit(data, sectionTitles, edit);
    if (path) applied.push(path);
  }
  if (!applied.length) throw fail('selection/unsupported', '这次的要求没有落在可修改的范围内，请选中具体的一段再试', 400);

  const saved = await store.updateResume(id, { data: normalizeData(data), sectionTitles: sectionTitles });
  return {
    resume: saved,
    change: {
      kind: 'text',
      summary: short(parsed.summary || '已按你的要求修改', 120),
      note: short(parsed.note || '', 200),
      paths: applied,
      label: descriptorLabel(desc),
    },
  };
}
