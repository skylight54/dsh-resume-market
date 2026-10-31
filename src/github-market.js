/**
 * 公共市场：把一个 GitHub 仓库当模板市场。
 *
 * 为什么用 GitHub：不用服务器、不用账号体系，作者提 PR/Issue 就能上架，
 * 所有人读到的是同一份 market/index.json。插件只负责「读 + 装 + 生成投稿内容」。
 *
 * 仓库结构（见仓库 market/README.md）：
 *   market/index.json                 轻量元数据列表
 *   market/templates/<id>.json        单个模板完整内容（css + sample）
 */
import { DEMO_RESUME_DATA, normalizeData } from './shared/doc.js';

/** 兜底仓库地址（设置页可以改成自己的 fork）。 */
const DEFAULT_REPO = 'skylight54/dsh-resume-market';
const DEFAULT_BRANCH = 'main';
/** index.json 的缓存时间：10 分钟内直接读本地，避免每次打开面板都打 GitHub。 */
const CACHE_TTL_MS = 10 * 60 * 1000;
const INDEX_LIMIT = 500;

/** 允许的仓库名：owner/repo，两段都只含字母数字和 . _ -。 */
export function normalizeRepo(value) {
  const text = String(value || '').trim();
  if (!/^[A-Za-z0-9_.-]{1,60}\/[A-Za-z0-9_.-]{1,80}$/.test(text)) return DEFAULT_REPO;
  return text;
}

export function normalizeBranch(value) {
  const text = String(value || '').trim();
  if (!/^[A-Za-z0-9_./-]{1,80}$/.test(text)) return DEFAULT_BRANCH;
  return text;
}

function rawUrl(repo, branch, file) {
  return 'https://raw.githubusercontent.com/' + repo + '/' + branch + '/' + file;
}

function webUrl(repo, path) {
  return 'https://github.com/' + repo + (path || '');
}

function templateFileFor(item) {
  if (item && typeof item.file === 'string' && /^templates\/[a-z0-9][a-z0-9-]{0,59}\.json$/.test(item.file)) {
    return item.file;
  }
  return 'templates/' + String((item && item.id) || '').replace(/[^a-z0-9-]/gi, '') + '.json';
}

/** 从简历标题/姓名生成一个稳定的 ASCII id（GitHub 文件路径要 ASCII）。 */
function makeTemplateId(resume) {
  const basics = (resume && resume.data && resume.data.basics) || {};
  const raw = String(basics.name || resume.title || 'template')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 26);
  const suffix = Math.random().toString(36).slice(2, 6);
  return 'rm-' + (raw || 'template') + '-' + suffix;
}

async function fetchJson(fetchImpl, url, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'dsh-resume-market' },
      redirect: 'follow',
    });
    if (response.status === 404) {
      const error = new Error('github/not-found');
      error.code = 'github/not-found';
      throw error;
    }
    if (!response.ok) {
      const error = new Error('github/http-' + response.status);
      error.code = 'github/http-' + response.status;
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (error && error.name === 'AbortError') {
      const timeout = new Error('github/timeout');
      timeout.code = 'github/timeout';
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} options
 * @param {object} options.store openStore 返回的存储
 * @param {(msg: string) => void} [options.log]
 * @param {typeof fetch} [options.fetchImpl] 测试注入用
 */
export function createGithubMarket({ store, log, fetchImpl }) {
  const doFetch = typeof fetchImpl === 'function' ? fetchImpl : globalThis.fetch;
  const say = typeof log === 'function' ? log : () => {};
  /** 上一次成功的地址。国内直连 raw 常被重置，记住可用源能少等一次超时。 */
  let lastGoodUrl = '';

  /** 同一份文件的多个下载地址：加速前缀 → 官方 raw → jsDelivr CDN。 */
  function sourceUrls(path) {
    const { repo, branch } = source();
    const raw = rawUrl(repo, branch, path);
    const proxy = String(store.settings().githubProxy || '').replace(/\/+$/, '');
    const urls = [];
    if (proxy) urls.push(proxy + '/' + raw);
    urls.push(raw);
    urls.push('https://cdn.jsdelivr.net/gh/' + repo + '@' + branch + '/' + path);
    if (lastGoodUrl && urls.includes(lastGoodUrl)) {
      urls.splice(urls.indexOf(lastGoodUrl), 1);
      urls.unshift(lastGoodUrl);
    }
    return urls;
  }

  async function fetchFirst(path, timeoutMs) {
    const urls = sourceUrls(path);
    let lastError = null;
    for (const url of urls) {
      try {
        const value = await fetchJson(doFetch, url, timeoutMs);
        lastGoodUrl = url;
        return value;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('github/offline');
  }

  function source() {
    const settings = store.settings();
    return {
      repo: normalizeRepo(settings.githubRepo),
      branch: normalizeBranch(settings.githubBranch),
    };
  }

  function isFresh(fetchedAt) {
    const time = Date.parse(fetchedAt || '');
    return Number.isFinite(time) && Date.now() - time < CACHE_TTL_MS;
  }

  /**
   * 读公共市场的 index。
   * 网络失败时退回本地缓存（stale=true），缓存也没有才抛错。
   */
  async function loadIndex({ force = false } = {}) {
    if (typeof doFetch !== 'function') {
      throw new Error('github/unsupported', { cause: '当前运行时不支持 fetch' });
    }
    const { repo, branch } = source();
    const cached = store.githubState();
    if (!force && cached.fetchedAt && isFresh(cached.fetchedAt)) {
      return { repo, branch, items: cached.items, fetchedAt: cached.fetchedAt, stale: false, source: 'cache' };
    }
    try {
      const raw = await fetchFirst('market/index.json');
      const list = raw && Array.isArray(raw.templates) ? raw.templates.slice(0, INDEX_LIMIT) : [];
      await store.setGithubItems(list);
      const fresh = store.githubState();
      say('resume-market: 公共市场已刷新（' + fresh.items.length + ' 个模板）');
      return { repo, branch, items: fresh.items, fetchedAt: fresh.fetchedAt, stale: false, source: 'network' };
    } catch (error) {
      const code = (error && error.code) || 'github/offline';
      if (cached.items && cached.items.length) {
        say('resume-market: 公共市场刷新失败（' + code + '），使用本地缓存');
        return {
          repo,
          branch,
          items: cached.items,
          fetchedAt: cached.fetchedAt,
          stale: true,
          source: 'cache',
          error: { code, message: messageOf(error) },
        };
      }
      throw error;
    }
  }

  /** 拉单个模板的完整 JSON。 */
  async function loadTemplate(id) {
    const clean = String(id || '').trim();
    if (!/^[a-z0-9][a-z0-9-]{1,59}$/i.test(clean)) {
      const error = new Error('模板 id 不合法');
      error.code = 'github/bad-id';
      throw error;
    }
    const { repo, branch } = source();
    const index = await loadIndex({});
    const item = index.items.find((entry) => entry.id === clean);
    const file = templateFileFor(item || { id: clean });
    const raw = await fetchFirst('market/' + file, 15000);
    if (!raw || typeof raw !== 'object') {
      const error = new Error('模板文件内容不是对象');
      error.code = 'github/bad-template';
      throw error;
    }
    return raw;
  }

  /** 安装公共市场模板：拉完整条目后交给本地 importTemplate。 */
  async function install(id) {
    const raw = await loadTemplate(id);
    const templateId = String(raw.templateId || '').trim() || 'pub-' + String(id).slice(0, 30);
    const template = await store.importTemplate({
      ...raw,
      id: templateId,
      author: raw.author || '公共市场',
    });
    return template;
  }

  /** 把「一份模板 + 一份示例数据」打包成 GitHub 投稿 JSON 与几个直达链接。 */
  function buildSubmission(input) {
    const { repo, branch } = source();
    const id = makeTemplateId({ title: input.slug || input.name, data: { basics: { name: input.slug || input.name } } });
    const name = String(input.name || '我的简历模板').slice(0, 40);
    const tagline = String(input.tagline || '').slice(0, 160) || '我的简历模板';
    const tags = Array.isArray(input.tags)
      ? input.tags.map((t) => String(t).slice(0, 12)).filter(Boolean).slice(0, 6)
      : String(input.tags || '')
          .split(/[,，\s]+/)
          .filter(Boolean)
          .slice(0, 6);
    const sampleData = normalizeData(input.sample || DEMO_RESUME_DATA);
    const payload = {
      schema: 1,
      id,
      name,
      en: String(input.en || '').slice(0, 40),
      tagline,
      tags,
      author: String(input.author || store.settings().author || '匿名').slice(0, 40),
      accent: /^#[0-9a-fA-F]{3,8}$/.test(String(input.accent)) ? input.accent : '#2f6fde',
      cls: input.cls || 'rm-t-' + id,
      templateId: 'pub-' + id.slice(3, 23),
      css: String(input.css || '').slice(0, 100 * 1024),
      style: input.style && typeof input.style === 'object' ? input.style : undefined,
      sample: sampleData,
      createdAt: new Date().toISOString(),
    };
    const filename = payload.id + '.json';
    const repoPath = 'market/templates/' + filename;
    const title = '[模板投稿] ' + name;
    const body = [
      '## 模板：' + name,
      '',
      '- 作者：' + payload.author,
      '- 一句话：' + tagline,
      '- 标签：' + (tags.join(' / ') || '（无）'),
      '- 模板 id：`' + payload.id + '`',
      '',
      '投稿方式（二选一）：',
      '1. 在 PR 里新建 `' + repoPath + '`，把下面的 JSON 贴进去；',
      '2. 把 JSON 附在本 Issue 里，维护者会代为添加。',
      '',
      '> JSON 已由插件生成，包含模板 CSS 与示例数据（示例数据不是真实个人信息）。',
    ].join('\n');
    const issueUrl = webUrl(repo, '/issues/new?labels=template-submission&title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body));
    const newFileUrl = webUrl(repo, '/new/' + branch + '/market/templates?filename=' + encodeURIComponent(filename));
    return {
      repo,
      branch,
      filename,
      repoPath,
      json: JSON.stringify(payload, null, 2),
      payload,
      issueUrl,
      newFileUrl,
    };
  }

  /**
   * 生成投稿用的 JSON 与 GitHub 链接（简历版，兼容旧入口）。
   * 默认不包含用户真实简历内容（sample 用示例数据），includeSample=true 才带自己的。
   */
  async function publishPayload(input = {}) {
    const resume = store.getResume(String(input.resumeId || ''));
    const template = store.templateForResume(resume);
    return buildSubmission({
      name: String(input.name || resume.title || '我的简历模板'),
      en: input.en || (template && template.en),
      tagline: input.tagline || (template && template.tagline),
      tags: input.tags && input.tags.length ? input.tags : template && template.tags,
      author: input.author || (template && template.author),
      accent: template && template.accent,
      cls: template && template.cls,
      css: template && template.css,
      style: template && template.style,
      sample: input.includeSample === true ? resume.data : DEMO_RESUME_DATA,
    });
  }

  /**
   * 模板投稿：发布主语是模板库里的自定义模板。
   * 示例数据优先用模板自带的 sample；includeSample 时用调用方给的。
   */
  async function publishTemplatePayload(input = {}) {
    const template = store.getTemplateById(String(input.templateId || ''));
    if (!template) {
      const error = new Error('找不到这个模板');
      error.code = 'template/not-found';
      throw error;
    }
    return buildSubmission({
      slug: String(template.id || '').replace(/^my-/, ''),
      name: String(input.name || template.name || '我的模板'),
      en: input.en || template.en,
      tagline: input.tagline || template.tagline,
      tags: input.tags && input.tags.length ? input.tags : template.tags,
      author: input.author || template.author,
      accent: template.accent,
      cls: template.cls,
      css: template.css,
      style: template.style,
      sample:
        input.includeSample === true && input.sample
          ? input.sample
          : template.sample || input.sample || DEMO_RESUME_DATA,
    });
  }

  return { source, loadIndex, loadTemplate, install, publishPayload, publishTemplatePayload };
}

function messageOf(error) {
  const code = error && error.code;
  if (code === 'github/not-found') return '仓库里没有这个文件（可能还没发布，或仓库地址写错了）';
  if (code === 'github/timeout') return '连接 GitHub 超时了，请检查网络后重试';
  if (code === 'github/offline') return '连不上 GitHub，请检查网络';
  if (code === 'github/http-' + 403) return 'GitHub 拒绝了请求（可能触发了限流，稍后再试）';
  return (error && error.message) || '公共市场请求失败';
}
