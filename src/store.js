/**
 * 本地数据层：一份 JSON 文件保存「我的简历 / 已安装模板 / 市场条目 / 设置」。
 *
 * 为什么不用数据库：数据量小、要能一键备份和分享，JSON 文件最直接。
 * 写入用「临时文件 + rename」原子替换，避免崩溃时留下半个文件。
 */
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  DEMO_RESUME_DATA,
  TEMPLATES,
  emptyResume,
  normalizeData,
  normalizeResume,
  normalizeTemplate,
  templateById,
  templateClass,
} from './shared/doc.js';
import { seedMarket } from './seed.js';

const STATE_VERSION = 1;
const MAX_RESUMES = 200;
const MAX_TEMPLATES = 100;
const MAX_MARKET = 500;
/** 每份简历保留的历史版本数（自动保存会节流，不会每 900ms 生成一个）。 */
const MAX_REVISIONS = 20;
/** 至少间隔这么久才留一个历史版本，避免自动保存把历史刷满。 */
const SNAPSHOT_INTERVAL_MS = 3 * 60 * 1000;
/** 回收站最多保留多少份，超了要求用户先彻底删除。 */
const MAX_TRASH = 50;

const SETTINGS_DEFAULTS = {
  author: '我',
  marketUrl: '',
  marketToken: '',
  includeSampleByDefault: false,
  // AI 对话填写（DeepSeek 兼容 API）
  chatApiKey: '',
  chatModel: 'deepseek-chat',
  chatBaseUrl: 'https://api.deepseek.com',
  // 公共市场：把一个 GitHub 仓库当作模板市场（市场内容是仓库里的 market/ 目录）。
  githubRepo: 'skylight54/dsh-resume-market',
  githubBranch: 'main',
  // 国内直连 raw.githubusercontent.com 常常被重置；可填一个 GitHub 加速前缀（如 https://gh-proxy.com/）。
  githubProxy: 'https://gh-proxy.com/',
};

/** 公共市场缓存条目（来自仓库 market/index.json，只存轻量元数据）。 */
function normalizeGithubItem(raw) {
  const item = raw && typeof raw === 'object' ? raw : {};
  return {
    id: String(item.id || '').slice(0, 60),
    name: String(item.name || '未命名模板').slice(0, 40),
    en: String(item.en || '').slice(0, 40),
    tagline: String(item.tagline || '').slice(0, 160),
    tags: Array.isArray(item.tags) ? item.tags.slice(0, 6).map((t) => String(t).slice(0, 12)) : [],
    author: String(item.author || '匿名').slice(0, 40),
    accent: /^#[0-9a-fA-F]{3,8}$/.test(String(item.accent || '')) ? String(item.accent) : '#2f6fde',
    cls: /^rm-t-[a-z0-9-]{1,40}$/.test(String(item.cls || '')) ? String(item.cls) : '',
    file: String(item.file || '').slice(0, 200),
    installs: Number(item.installs) || 0,
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
  };
}

export class StoreError extends Error {
  /**
   * @param {string} code 机器可读错误码
   * @param {string} message 给用户看的中文说明
   * @param {number} [status] HTTP 状态码
   */
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
    this.status = status;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return prefix + '_' + Date.now().toString(36) + randomBytes(3).toString('hex');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** 默认标题带上时间，避免多份简历全叫「我的简历」分不清。 */
function defaultTitle() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return '我的简历 · ' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function normalizeRevision(raw) {
  const base = normalizeResume(raw || {});
  return {
    id: String((raw && raw.id) || newId('v')).slice(0, 40),
    at: String((raw && raw.at) || nowIso()),
    title: base.title,
    templateId: base.templateId,
    lang: base.lang,
    sections: base.sections,
    data: base.data,
  };
}

/** 在修改前留一份历史快照；force 用于删除/恢复这种关键操作。 */
function rememberVersion(resume, force) {
  const history = Array.isArray(resume.history) ? resume.history : (resume.history = []);
  const last = history[history.length - 1];
  if (!force && last && Date.now() - Date.parse(last.at) < SNAPSHOT_INTERVAL_MS) return false;
  history.push({
    id: newId('v'),
    at: nowIso(),
    title: resume.title,
    templateId: resume.templateId,
    lang: resume.lang,
    sections: clone(resume.sections),
    data: clone(resume.data),
  });
  while (history.length > MAX_REVISIONS) history.shift();
  return true;
}

function sanitizeSettings(input) {
  const out = { ...SETTINGS_DEFAULTS };
  if (!input || typeof input !== 'object') return out;
  if (typeof input.author === 'string' && input.author.trim()) out.author = input.author.trim().slice(0, 40);
  if (typeof input.marketUrl === 'string' && /^https?:\/\//.test(input.marketUrl.trim())) {
    out.marketUrl = input.marketUrl.trim().slice(0, 300);
  }
  if (typeof input.marketToken === 'string') out.marketToken = input.marketToken.trim().slice(0, 200);
  if (typeof input.includeSampleByDefault === 'boolean') out.includeSampleByDefault = input.includeSampleByDefault;
  // AI 对话：Key 只在本地存（真机不发到任何地方），模型与 Base URL 允许自填。
  if (typeof input.chatApiKey === 'string') out.chatApiKey = input.chatApiKey.trim().slice(0, 200);
  if (typeof input.chatModel === 'string' && input.chatModel.trim()) out.chatModel = input.chatModel.trim().slice(0, 80);
  if (typeof input.chatBaseUrl === 'string' && /^https?:\/\//.test(input.chatBaseUrl.trim())) {
    out.chatBaseUrl = input.chatBaseUrl.trim().replace(/\/+$/, '').slice(0, 300);
  }
  // 公共市场仓库：owner/repo，避免把任意 URL 拼进 raw.githubusercontent.com。
  if (typeof input.githubRepo === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.githubRepo.trim())) {
    out.githubRepo = input.githubRepo.trim().slice(0, 120);
  }
  if (typeof input.githubBranch === 'string' && /^[A-Za-z0-9_./-]{1,80}$/.test(input.githubBranch.trim())) {
    out.githubBranch = input.githubBranch.trim();
  }
  // 加速前缀：可留空；填了就必须是 http(s) 地址，用完后拼在原始 GitHub 地址前面。
  if (typeof input.githubProxy === 'string') {
    const proxy = input.githubProxy.trim().replace(/\/+$/, '');
    if (!proxy) out.githubProxy = '';
    else if (/^https?:\/\/[^\s]{1,200}$/.test(proxy)) out.githubProxy = proxy.slice(0, 200);
  }
  return out;
}

function stateFilePath() {
  const override = process.env.RESUME_MARKET_FILE;
  if (override && override.trim()) return override.trim();
  return join(homedir(), '.dsh', 'resume-market', 'store.json');
}

function freshState() {
  return {
    version: STATE_VERSION,
    settings: { ...SETTINGS_DEFAULTS },
    resumes: [],
    templates: [],
    market: seedMarket(),
    github: { fetchedAt: '', items: [], likes: {} },
  };
}

/** 修复/迁移磁盘上的状态；坏数据尽量救回来而不是整份丢掉。 */
function reconcile(raw) {
  const state = freshState();
  if (!raw || typeof raw !== 'object') return state;
  state.settings = sanitizeSettings(raw.settings);
  if (raw.github && typeof raw.github === 'object') {
    const likes = raw.github.likes && typeof raw.github.likes === 'object' ? raw.github.likes : {};
    state.github = {
      fetchedAt: typeof raw.github.fetchedAt === 'string' ? raw.github.fetchedAt : '',
      items: Array.isArray(raw.github.items) ? raw.github.items.slice(0, 500).map(normalizeGithubItem) : [],
      likes: Object.fromEntries(
        Object.entries(likes)
          .slice(0, 500)
          .map(([key, value]) => [String(key).slice(0, 120), Number(value) || 0]),
      ),
    };
  }
  if (Array.isArray(raw.resumes)) {
    state.resumes = raw.resumes
      .filter((r) => r && typeof r === 'object')
      .slice(0, MAX_RESUMES)
      .map((r) => {
        const resume = normalizeResume(r);
        return {
          ...resume,
          id: resume.id || newId('r'),
          deletedAt: typeof r.deletedAt === 'string' ? r.deletedAt : null,
          history: Array.isArray(r.history) ? r.history.slice(-MAX_REVISIONS).map(normalizeRevision) : [],
        };
      });
  }
  if (Array.isArray(raw.templates)) {
    state.templates = raw.templates
      .filter((t) => t && typeof t === 'object')
      .slice(0, MAX_TEMPLATES)
      .map((t) => ({ ...normalizeTemplate(t), author: String(t.author || '').slice(0, 40), addedAt: String(t.addedAt || nowIso()) }));
  }
  if (Array.isArray(raw.market)) {
    const saved = raw.market.filter((m) => m && typeof m === 'object');
    const byId = new Map(saved.map((m) => [String(m.id), m]));
    // 内置种子始终存在（用户删不掉），但保留已累计的安装/点赞数。
    for (const seed of state.market) {
      const prior = byId.get(seed.id);
      if (prior) {
        seed.installs = Number(prior.installs) || seed.installs;
        seed.likes = Number(prior.likes) || seed.likes;
      }
      byId.delete(seed.id);
    }
    const local = [...byId.values()]
      .filter((m) => m.source !== 'seed')
      .slice(0, MAX_MARKET)
      .map((m) => ({
        id: String(m.id || newId('m')).slice(0, 60),
        kind: 'template',
        templateId: String(m.templateId || m.id).slice(0, 40),
        name: String(m.name || '未命名模板').slice(0, 40),
        en: String(m.en || '').slice(0, 40),
        tagline: String(m.tagline || '').slice(0, 120),
        tags: Array.isArray(m.tags) ? m.tags.slice(0, 5).map((t) => String(t).slice(0, 12)) : [],
        accent: /^#[0-9a-fA-F]{3,8}$/.test(String(m.accent || '')) ? String(m.accent) : '#2f6fde',
        desc: String(m.desc || '').slice(0, 120),
        css: String(m.css || '').slice(0, 100 * 1024),
        author: String(m.author || '匿名').slice(0, 40),
        source: m.source === 'local' ? 'local' : 'local',
        installs: Number(m.installs) || 0,
        likes: Number(m.likes) || 0,
        createdAt: String(m.createdAt || nowIso()),
        sample: normalizeData(m.sample),
      }));
    state.market = state.market.concat(local);
  }
  return state;
}

/**
 * 打开（必要时创建）本地存储。
 * @param {object} [options]
 * @param {string} [options.file] 覆盖状态文件路径（测试用）
 * @param {(msg: string) => void} [options.log] 日志回调
 */
export function openStore(options = {}) {
  const file = options.file || stateFilePath();
  const log = typeof options.log === 'function' ? options.log : () => {};
  let state = freshState();
  let loaded = false;
  let chain = Promise.resolve();
  let disposed = false;

  async function load() {
    try {
      const text = await readFile(file, 'utf8');
      state = reconcile(JSON.parse(text));
      loaded = true;
      log(`resume-market: 已加载 ${file}（${state.resumes.length} 份简历 / ${state.market.length} 个市场条目）`);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        state = freshState();
        loaded = true;
        await persist();
        log(`resume-market: 首次运行，已创建 ${file}`);
        return;
      }
      // 文件坏了：不覆盖原文件，让用户还能手工抢救。
      log(`resume-market: 读取 ${file} 失败（${error && error.message}），本次以空数据启动，原文件未改动`);
      state = freshState();
      loaded = true;
    }
  }

  async function persist() {
    const dir = dirname(file);
    await mkdir(dir, { recursive: true });
    // 写入前把上一份文件留成 .bak：误删/崩溃时还能手工救回来。
    try {
      const previous = await readFile(file, 'utf8');
      if (previous) await writeFile(file + '.bak', previous, 'utf8');
    } catch (error) {
      if (error && error.code !== 'ENOENT') log(`resume-market: 备份 ${file}.bak 失败（${error && error.message}）`);
    }
    const text = JSON.stringify(state, null, 2);
    const tmp = file + '.' + process.pid + '.tmp';
    await writeFile(tmp, text, 'utf8');
    try {
      await rename(tmp, file);
    } catch (error) {
      await unlink(tmp).catch(() => {});
      throw error;
    }
  }

  /** 串行化所有写操作，并把失败原样抛给调用方。 */
  function enqueue(job) {
    const run = chain.then(job, job);
    chain = run.then(() => undefined, () => undefined);
    return run;
  }

  function ensureLoaded() {
    if (!loaded) throw new StoreError('store/not-ready', '存储尚未就绪，请稍后重试', 503);
    if (disposed) throw new StoreError('store/disposed', '插件已卸载', 503);
  }

  async function mutate(fn) {
    ensureLoaded();
    return enqueue(async () => {
      const result = fn();
      await persist();
      return result;
    });
  }

  const ready = load();

  function findResume(id) {
    const resume = state.resumes.find((r) => r.id === id);
    if (!resume) throw new StoreError('resume/not-found', '找不到这份简历，可能已经被删除', 404);
    return resume;
  }

  function getTemplate(id) {
    const builtin = TEMPLATES.find((t) => t.id === id);
    if (builtin) return builtin;
    const custom = state.templates.find((t) => t.id === id);
    if (custom) return custom;
    return null;
  }

  function findEntry(id) {
    const entry = state.market.find((m) => m.id === id);
    if (!entry) throw new StoreError('market/not-found', '市场上找不到这个条目', 404);
    return entry;
  }

  function templateForResume(resume) {
    return getTemplate(resume.templateId) || templateById(resume.templateId);
  }

  return {
    file,
    ready: () => ready,
    whenReady: () => ready.then(() => undefined),

    snapshot() {
      const active = state.resumes.filter((r) => !r.deletedAt);
      const trashed = state.resumes.filter((r) => r.deletedAt);
      return {
        settings: clone(state.settings),
        resumes: clone(active),
        deleted: clone(
          trashed.map((r) => ({
            id: r.id,
            title: r.title,
            templateId: r.templateId,
            deletedAt: r.deletedAt,
            updatedAt: r.updatedAt,
            revisions: Array.isArray(r.history) ? r.history.length : 0,
          })),
        ),
        templates: clone(state.templates),
        market: clone(state.market),
        github: clone(state.github),
      };
    },

    settings() {
      return clone(state.settings);
    },

    listResumes() {
      return clone(state.resumes.filter((r) => !r.deletedAt)).map((r) => ({
        id: r.id,
        title: r.title,
        templateId: r.templateId,
        lang: r.lang,
        sections: r.sections,
        updatedAt: r.updatedAt,
        createdAt: r.createdAt,
        data: r.data,
      }));
    },

    getResume(id) {
      return clone(findResume(id));
    },

    templateForResume,

    listTemplates() {
      return TEMPLATES.map((t) => ({ ...t, source: 'builtin' })).concat(
        state.templates.map((t) => ({ ...t, source: 'custom' })),
      );
    },

    listMarket() {
      return clone(state.market);
    },

    createResume(input = {}) {
      const base = emptyResume(input.templateId);
      const resume = normalizeResume({
        ...base,
        title: input.title || defaultTitle(),
        templateId: input.templateId || base.templateId,
        lang: input.lang || base.lang,
        sections: input.sections || base.sections,
        data: input.data || DEMO_RESUME_DATA,
      });
      resume.id = newId('r');
      resume.createdAt = nowIso();
      resume.updatedAt = resume.createdAt;
      return mutate(() => {
        if (state.resumes.length >= MAX_RESUMES) {
          throw new StoreError('resume/limit', `最多只能保存 ${MAX_RESUMES} 份简历，请先删除旧的`, 409);
        }
        state.resumes.unshift(resume);
        return clone(resume);
      });
    },

    updateResume(id, patch = {}) {
      return mutate(() => {
        const resume = findResume(id);
        rememberVersion(resume, false);
        const next = normalizeResume({ ...resume, ...patch, id: resume.id });
        next.createdAt = resume.createdAt;
        next.updatedAt = nowIso();
        if (patch.title !== undefined) next.title = String(patch.title).slice(0, 80).trim() || resume.title;
        Object.assign(resume, next);
        return clone(resume);
      });
    },

    deleteResume(id) {
      return mutate(() => {
        const index = state.resumes.findIndex((r) => r.id === id);
        if (index === -1) throw new StoreError('resume/not-found', '找不到这份简历，可能已经被删除', 404);
        const resume = state.resumes[index];
        rememberVersion(resume, true);
        if (state.resumes.filter((r) => r.deletedAt).length >= MAX_TRASH) {
          throw new StoreError('resume/trash-full', `回收站最多保留 ${MAX_TRASH} 份，请先彻底删除一些`, 409);
        }
        resume.deletedAt = nowIso();
        return { id: resume.id, deletedAt: resume.deletedAt };
      });
    },

    restoreResume(id) {
      return mutate(() => {
        const resume = findResume(id);
        if (!resume.deletedAt) return clone(resume);
        if (state.resumes.filter((r) => !r.deletedAt).length >= MAX_RESUMES) {
          throw new StoreError('resume/limit', `最多只能保存 ${MAX_RESUMES} 份简历，请先删除旧的`, 409);
        }
        resume.deletedAt = null;
        resume.updatedAt = nowIso();
        return clone(resume);
      });
    },

    purgeResume(id) {
      return mutate(() => {
        const index = state.resumes.findIndex((r) => r.id === id);
        if (index === -1) throw new StoreError('resume/not-found', '找不到这份简历', 404);
        const [removed] = state.resumes.splice(index, 1);
        return { id: removed.id };
      });
    },

    listRevisions(id) {
      const resume = findResume(id);
      return clone(
        (resume.history || []).map((v) => ({ id: v.id, at: v.at, title: v.title, templateId: v.templateId, data: v.data })),
      );
    },

    restoreRevision(id, revisionId) {
      return mutate(() => {
        const resume = findResume(id);
        const list = Array.isArray(resume.history) ? resume.history : [];
        const target = list.find((v) => v.id === revisionId);
        if (!target) throw new StoreError('resume/no-revision', '找不到这个历史版本', 404);
        rememberVersion(resume, true);
        Object.assign(resume, normalizeResume({ ...target, id: resume.id }));
        resume.updatedAt = nowIso();
        return clone(resume);
      });
    },

    duplicateResume(id) {
      return mutate(() => {
        const source = findResume(id);
        const copy = normalizeResume({
          ...clone(source),
          id: null,
          title: source.title + ' 副本',
          data: { ...source.data, basics: { ...source.data.basics, name: source.data.basics.name } },
        });
        copy.id = newId('r');
        copy.createdAt = nowIso();
        copy.updatedAt = copy.createdAt;
        if (state.resumes.length >= MAX_RESUMES) {
          throw new StoreError('resume/limit', `最多只能保存 ${MAX_RESUMES} 份简历，请先删除旧的`, 409);
        }
        state.resumes.unshift(copy);
        return clone(copy);
      });
    },

    updateSettings(patch = {}) {
      return mutate(() => {
        state.settings = sanitizeSettings({ ...state.settings, ...patch });
        return clone(state.settings);
      });
    },

    /** 把一份市场条目安装成本地模板（重复安装幂等）。 */
    installFromMarket(entryId) {
      return mutate(() => {
        const entry = findEntry(entryId);
        const existing = state.templates.find((t) => t.id === entry.templateId);
        if (existing) return clone(existing);
        const template = normalizeTemplate(
          {
            id: entry.templateId,
            name: entry.name,
            en: entry.en,
            tagline: entry.tagline,
            tags: entry.tags,
            accent: entry.accent,
            desc: entry.desc,
            css: entry.css,
            cls: entry.cls,
          },
          entry.templateId,
        );
        const record = { ...template, author: entry.author, addedAt: nowIso() };
        if (state.templates.length >= MAX_TEMPLATES) {
          throw new StoreError('template/limit', `最多只能安装 ${MAX_TEMPLATES} 个模板，请先清理`, 409);
        }
        state.templates.push(record);
        entry.installs = (Number(entry.installs) || 0) + 1;
        return clone(record);
      });
    },

    /** 导入外部模板包（分享文件 / JSON）。 */
    importTemplate(raw) {
      return mutate(() => {
        const template = normalizeTemplate(raw, TEMPLATES[0].id);
        if (TEMPLATES.some((t) => t.id === template.id) || state.templates.some((t) => t.id === template.id)) {
          template.id = newId('mkt') + '-' + template.id.slice(0, 20);
        }
        const record = {
          ...template,
          author: String((raw && raw.author) || '外部导入').slice(0, 40),
          addedAt: nowIso(),
        };
        if (state.templates.length >= MAX_TEMPLATES) {
          throw new StoreError('template/limit', `最多只能安装 ${MAX_TEMPLATES} 个模板，请先清理`, 409);
        }
        state.templates.push(record);
        return clone(record);
      });
    },

    removeTemplate(id) {
      return mutate(() => {
        if (TEMPLATES.some((t) => t.id === id)) {
          throw new StoreError('template/builtin', '内置模板不能删除', 409);
        }
        const index = state.templates.findIndex((t) => t.id === id);
        if (index === -1) throw new StoreError('template/not-found', '找不到这个模板', 404);
        const users = state.resumes.filter((r) => r.templateId === id).length;
        if (users > 0) {
          throw new StoreError('template/in-use', `还有 ${users} 份简历在用这个模板，先换掉再删`, 409);
        }
        state.templates.splice(index, 1);
        return { id };
      });
    },

    /**
     * 发布简历到市场：把当前模板的 CSS 打包成可安装的市场模板。
     * 默认不携带作者本人的简历内容，只用示例数据。
     */
    publish({ resumeId, title, tagline, tags, desc, includeSample, author }) {
      return mutate(() => {
        const resume = findResume(resumeId);
        const template = templateForResume(resume);
        const shareContent = includeSample === true;
        const marketId = newId('m');
        const entryName = String(title || resume.title || template.name).slice(0, 40).trim() || '未命名模板';
        const entry = {
          id: marketId,
          kind: 'template',
          templateId: marketId,
          name: entryName,
          en: template.en || '',
          tagline: String(tagline || template.tagline || '').slice(0, 120),
          tags: Array.isArray(tags)
            ? tags.map((t) => String(t).slice(0, 12)).filter(Boolean).slice(0, 5)
            : template.tags.slice(0, 5),
          accent: template.accent,
          desc: String(desc || template.desc || '').slice(0, 120),
          css: String(template.css || '').slice(0, 100 * 1024),
          cls: templateClass(template),
          author: String(author || state.settings.author || '我').slice(0, 40),
          source: 'local',
          installs: 0,
          likes: 0,
          createdAt: nowIso(),
          sample: shareContent
            ? normalizeData(resume.data)
            : normalizeData({
                basics: { ...DEMO_RESUME_DATA.basics, name: '示例候选人', role: resume.data.basics.role || DEMO_RESUME_DATA.basics.role },
                summary: resume.data.summary || DEMO_RESUME_DATA.summary,
                experience: resume.data.experience,
                projects: resume.data.projects,
                education: resume.data.education,
                skills: resume.data.skills,
                awards: resume.data.awards,
              }),
        };
        if (state.market.length >= MAX_MARKET) {
          throw new StoreError('market/limit', `市场里最多 ${MAX_MARKET} 个条目`, 409);
        }
        state.market.unshift(entry);
        return clone(entry);
      });
    },

    unpublish(entryId) {
      return mutate(() => {
        const index = state.market.findIndex((m) => m.id === entryId);
        if (index === -1) throw new StoreError('market/not-found', '市场上找不到这个条目', 404);
        if (state.market[index].source === 'seed') {
          throw new StoreError('market/seed', '「大肥鱼」的内置模板不能下架', 409);
        }
        state.market.splice(index, 1);
        return { id: entryId };
      });
    },

    like(entryId) {
      return mutate(() => {
        const entry = findEntry(entryId);
        entry.likes = (Number(entry.likes) || 0) + 1;
        return { id: entry.id, likes: entry.likes };
      });
    },

    /** 公共市场缓存（index.json 的元数据 + 本地点赞数）。 */
    githubState() {
      return clone(state.github);
    },

    /** 用刚拉到的 index 覆盖缓存，并把时间戳写进去。 */
    setGithubItems(items) {
      return mutate(() => {
        state.github.items = Array.isArray(items) ? items.slice(0, 500).map(normalizeGithubItem) : [];
        state.github.fetchedAt = nowIso();
        return clone({ fetchedAt: state.github.fetchedAt, count: state.github.items.length });
      });
    },

    /** GitHub 模式下没有服务端计数，点赞只记在本地。 */
    likeGithub(id) {
      return mutate(() => {
        const key = String(id || '').slice(0, 120);
        state.github.likes[key] = (Number(state.github.likes[key]) || 0) + 1;
        return { id: key, likes: state.github.likes[key] };
      });
    },

    dispose() {
      disposed = true;
      return chain.then(() => undefined);
    },
  };
}
