/**
 * 档案（Archive）：把「个人关键信息」抽出来存一份，之后按 JD 快速生成定制简历。
 *
 * 这里的 tailor 只做「生成一份候选简历」，不直接落盘——
 * 让用户在面板里先看匹配度与说明，点「载入编辑器」再决定保存，避免糊里糊涂多出一堆简历。
 */
import { hostComplete } from './chat.js';
import { SECTION_ORDER, normalizeData } from './shared/doc.js';

const MAX_JD = 12000;
const MAX_ARCHIVE_DATA = 200 * 1024;

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

/** 从档案数据里推一份摘要，列表页不用展开看全文。 */
export function archiveMeta(data) {
  const source = data && typeof data === 'object' ? data : {};
  const basics = source.basics && typeof source.basics === 'object' ? source.basics : {};
  const skills = Array.isArray(source.skills) ? source.skills : [];
  const topSkills = [];
  for (const group of skills) {
    const items = String((group && group.items) || '')
      .split(/[、,，/·|]/)
      .map((item) => item.trim())
      .filter(Boolean);
    for (const item of items) {
      if (topSkills.length >= 5) break;
      if (topSkills.indexOf(item) === -1) topSkills.push(item);
    }
  }
  // 工作年限：优先取「N 年经验」这类文本，其次按经历条数估。
  const text = [basics.role, source.summary, JSON.stringify(source.experience || []), basics.workYears || ''].join(' ');
  const years = /(\d{1,2})\s*年/.exec(text);
  const experience = Array.isArray(source.experience) ? source.experience : [];
  return {
    title: short(basics.role || '', 40),
    years: years ? Number(years[1]) : Math.min(experience.length * 2, 20),
    skillsTop: topSkills,
    name: short(basics.name || '', 20),
  };
}

export function normalizeArchive(raw, fallbackName) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const data = normalizeData(src.data && typeof src.data === 'object' ? src.data : {});
  return {
    id: typeof src.id === 'string' && src.id ? src.id.slice(0, 40) : null,
    name: String(src.name || fallbackName || (data.basics && data.basics.name) || '我的档案').slice(0, 40).trim() || '我的档案',
    templateId: String(src.templateId || '').slice(0, 40) || null,
    createdAt: typeof src.createdAt === 'string' ? src.createdAt : null,
    updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : null,
    data,
    meta: archiveMeta(data),
  };
}

function parseJsonObject(text) {
  const raw = String(text || '');
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const candidate = fenced ? fenced[1] : raw;
  try {
    const value = JSON.parse(candidate.trim());
    return value && typeof value === 'object' ? value : null;
  } catch {
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

const SYSTEM_PROMPT = [
  '你是一名资深的中文简历顾问。用户有一份「个人档案」（他真实经历的结构化记录），现在给你一段目标岗位的 JD（职位描述）。',
  '请基于档案里真实存在的信息，产出一份**针对这个 JD 定制**的简历数据，并做匹配度评估。',
  '',
  '硬性规则：',
  '1) 不许编造档案里没有的公司、学校、时间、证书或数字；可以改写措辞、调整条目顺序、突出与 JD 相关的部分。',
  '2) 与 JD 无关或明显减分的条目可以删减（保留档案里最核心的经历）。',
  '3) summary（个人简介）要针对该 JD 重写，2-4 句，突出匹配的关键能力。',
  '4) bullets 用「动词开头 + 具体做法 + 量化结果」的句式；没有数字的不要硬凑。',
  '5) experience / projects / education / skills / awards 的数量不要超过档案里原有的。',
  '',
  '只输出一个 ```json 代码块：',
  '{"title":"<这份简历的标题，含岗位名>","score":<0-100 的匹配度整数>,"notes":"<2-3 句说明你怎么定制的>","gaps":["<与 JD 相比还缺的关键点>"],"data":{"basics":{"name":"","role":"","phone":"","email":"","city":"","wechat":"","github":"","website":""},"summary":"","experience":[{"company":"","role":"","period":"","location":"","bullets":[""]}],"projects":[{"name":"","role":"","period":"","bullets":[""]}],"education":[{"school":"","degree":"","major":"","period":"","gpa":"","courses":""}],"skills":[{"group":"","items":""}],"awards":[{"title":"","date":"","desc":""}]}}',
].join('\n');

/**
 * 按 JD 生成一份候选简历（不落盘）。
 * @returns {{resume:object, notes:string, score:number, gaps:string[], model:string}}
 */
export async function tailorArchive({ ctx, store, archiveId, jd, title }) {
  const id = String(archiveId || '').trim();
  if (!id) throw fail('archive/no-archive-id', '缺少 archiveId', 400);
  const archive = store.getArchive(id);
  if (!archive) throw fail('archive/no-archive', '找不到这份档案，可能已经被删除', 404);

  const text = String(jd || '').trim();
  if (!text) throw fail('archive/no-jd', '请先粘贴目标岗位的 JD', 400);
  if (text.length < 20) throw fail('archive/jd-too-short', 'JD 太短了，至少粘贴一段职位描述', 400);
  if (text.length > MAX_JD) throw fail('archive/jd-too-long', 'JD 太长了，请截取到 ' + MAX_JD + ' 字以内', 400);
  const size = Buffer.byteLength(JSON.stringify(archive.data || {}), 'utf8');
  if (size > MAX_ARCHIVE_DATA) throw fail('archive/too-large', '档案内容太大了，请精简后再试', 400);

/**
 * 档案进提示词前的收敛：照片是 base64 dataURL，塞进去既烧 token 又可能被模型改坏，
 * 这里只留占位；定制完成后再把原照片贴回新简历。
 */
function digestData(data) {
  const plain = JSON.parse(JSON.stringify(data && typeof data === 'object' ? data : {}));
  if (plain.basics && typeof plain.basics === 'object') {
    if (plain.basics.photo) plain.basics.photo = '[已上传照片]';
    delete plain.basics.photoFit;
    delete plain.basics.photoShape;
    delete plain.basics.photoSide;
  }
  return plain;
}

  const user = [
    '目标岗位 JD：',
    '"""',
    text,
    '"""',
    '',
    '个人档案（JSON）：',
    JSON.stringify(digestData(archive.data), null, 1),
    title ? '\n期望的简历标题：' + title : '',
  ].join('\n');

  let reply;
  try {
    reply = await hostComplete({ ctx, system: SYSTEM_PROMPT, user: user, temperature: 0.3, maxTokens: 3200, timeoutMs: 120000 });
  } catch (error) {
    const message = String((error && error.message) || error || '');
    if (/没有可用的 AI 模型|no-key|API Key/i.test(message)) {
      throw fail('archive/no-ai', '没有可用的 AI 模型：请确认 DSH 已配置默认模型，或到设置页填写 DeepSeek API Key', 400);
    }
    throw fail('archive/upstream', 'AI 定制失败：' + short(message, 160), 502);
  }

  const parsed = parseJsonObject(reply.text);
  if (!parsed || !parsed.data || typeof parsed.data !== 'object') {
    throw fail('archive/bad-json', 'AI 返回的内容不是可用的 JSON，请再试一次', 502);
  }
  const data = normalizeData(parsed.data);
  // 照片/照片设置以档案里的原始值为准：模型不参与，也就不可能被改成坏图。
  const archiveBasics = (archive.data && archive.data.basics) || {};
  data.basics = data.basics || {};
  if (archiveBasics.photo) data.basics.photo = archiveBasics.photo;
  for (const key of ['photoFit', 'photoShape', 'photoSide']) {
    if (archiveBasics[key]) data.basics[key] = archiveBasics[key];
  }
  const basics = data.basics || {};
  const resume = {
    id: null,
    title: String(title || parsed.title || (basics.name ? basics.name + ' · 定制简历' : '定制简历')).slice(0, 80),
    templateId: archive.templateId || 'business-minimal',
    lang: 'zh',
    sections: SECTION_ORDER.slice(),
    data,
  };
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
  const gaps = (Array.isArray(parsed.gaps) ? parsed.gaps : []).slice(0, 8).map((item) => short(item, 80)).filter(Boolean);
  return {
    resume,
    notes: short(parsed.notes || '', 400),
    score,
    gaps,
    model: reply.model,
    archiveId: id,
  };
}
