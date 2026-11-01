/**
 * Host 侧的 HTTP API：面板（浏览器）与 agent 工具以外的外部调用都走这里。
 *
 * 安全基线照抄 Host 现有的约定：
 *  - 只接受 loopback / 受信 Host；
 *  - 拒绝跨站（sec-fetch-site: cross-site）；
 *  - 有 Origin 时要求与 Host 同源；
 *  - 请求体有上限。
 * 面板与 Host 同源，因此不需要 CORS。
 */
import { buildHtml, templateById } from './shared/doc.js';
import { createChatService } from './chat.js';
import { installPlugin, listStatus } from './compat.js';
import { resolveFormat, revealExport, saveRenderedPdf, writeResumeExport } from './export-file.js';
import { createGithubMarket } from './github-market.js';
import { StoreError } from './store.js';

export const PREFIX = '/resume-market/api';
const MAX_BODY_BYTES = 12 * 1024 * 1024;

function ok(value) {
  return { ok: true, value };
}

function fail(code, message) {
  return { ok: false, error: { code, message } };
}

function getService(ctx, name) {
  try {
    return typeof ctx.get === 'function' ? ctx.get(name) : undefined;
  } catch {
    return undefined;
  }
}

function messageOf(error) {
  return (error && error.message) || String(error);
}

function logWarn(scope, error) {
  const logger = (scope && scope.logger) || console;
  if (typeof logger.warn === 'function') logger.warn(`resume-market: ${messageOf(error)}`);
}

function isLoopbackHostname(hostname) {
  if (!hostname) return false;
  const host = String(hostname).toLowerCase();
  return host === 'localhost' || host === '[::1]' || host === '::1' || /^127\.\d+\.\d+\.\d+$/.test(host);
}

function parseAuthority(authority) {
  const value = String(authority || '').trim().toLowerCase();
  if (!value) return null;
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    if (end === -1) return null;
    return { hostname: value.slice(0, end + 1), port: value.slice(end + 2) };
  }
  const colon = value.lastIndexOf(':');
  if (colon === -1) return { hostname: value, port: '' };
  return { hostname: value.slice(0, colon), port: value.slice(colon + 1) };
}

function trustedHosts(ctx) {
  const webRuntime = getService(ctx, 'webRuntime');
  const list = webRuntime && Array.isArray(webRuntime.trustedHosts) ? webRuntime.trustedHosts : [];
  return list.map((entry) => String(entry).toLowerCase());
}

function isTrustedAuthority(ctx, authority) {
  const parsed = parseAuthority(authority);
  if (!parsed) return false;
  if (isLoopbackHostname(parsed.hostname)) return true;
  const normalized = parsed.port ? parsed.hostname + ':' + parsed.port : parsed.hostname;
  return trustedHosts(ctx).includes(normalized) || trustedHosts(ctx).includes(parsed.hostname);
}

function isTrustedRequest(ctx, req) {
  const headers = req.headers || {};
  const host = headers.host;
  if (!isTrustedAuthority(ctx, host)) return false;
  if (String(headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return false;
  const origin = headers.origin;
  if (origin) {
    try {
      const originUrl = new URL(String(origin));
      if (!isTrustedAuthority(ctx, host)) return false;
      if (parseAuthority(host).hostname !== parseAuthority(originUrl.host).hostname) return false;
      if (parseAuthority(originUrl.host).port !== parseAuthority(host).port) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new StoreError('http/too-large', '请求体太大', 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new StoreError('http/bad-json', '请求体不是合法的 JSON', 400));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sendHtml(res, status, html, downloadName) {
  const headers = {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html),
    'cache-control': 'no-store',
  };
  if (downloadName) {
    headers['content-disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
  }
  res.writeHead(status, headers);
  res.end(html);
}

/** 构造路由处理器（纯函数，方便 tests/smoke.mjs 直接驱动）。 */
export function createHandler({ ctx, store }) {
  const chatService = createChatService({ store, ctx, log: (message) => logWarn(ctx, message) });
  const githubMarket = createGithubMarket({ store, log: (message) => logWarn(ctx, message) });

  async function dispatch(req) {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname;
    if (!pathname.startsWith(PREFIX)) return { status: 404, body: fail('http/not-found', '未知接口') };
    const suffix = pathname.slice(PREFIX.length) || '/';
    const query = url.searchParams;
    const method = String(req.method || 'GET').toUpperCase();

    if (suffix === '/health' && method === 'GET') {
      return { status: 200, body: ok({ app: 'resume-market', file: store.file }) };
    }

    if (suffix === '/state' && method === 'GET') {
      const snapshot = store.snapshot();
      return {
        status: 200,
        body: ok({
          settings: snapshot.settings,
          resumes: snapshot.resumes,
          deleted: snapshot.deleted,
          templates: store.listTemplates(),
          market: snapshot.market,
          storeFile: store.file,
        }),
      };
    }

    if (suffix === '/resume' && method === 'GET') {
      const id = query.get('id');
      if (!id) return { status: 400, body: fail('http/bad-request', '缺少 id') };
      return { status: 200, body: ok({ resume: store.getResume(id) }) };
    }

    if (suffix === '/resume' && method === 'POST') {
      const body = await readJsonBody(req);
      const input = body && body.resume ? body.resume : body;
      if (!input || typeof input !== 'object') {
        return { status: 400, body: fail('http/bad-request', '缺少简历内容') };
      }
      const resume = input.id ? await store.updateResume(String(input.id), input) : await store.createResume(input);
      return { status: 200, body: ok({ resume }) };
    }

    if (suffix === '/resume' && method === 'DELETE') {
      const id = query.get('id');
      if (!id) return { status: 400, body: fail('http/bad-request', '缺少 id') };
      return { status: 200, body: ok(await store.deleteResume(id)) };
    }

    if (suffix === '/resume/restore' && method === 'POST') {
      const body = await readJsonBody(req);
      if (!body || !body.id) return { status: 400, body: fail('http/bad-request', '缺少 id') };
      return { status: 200, body: ok({ resume: await store.restoreResume(String(body.id)) }) };
    }

    if (suffix === '/resume/purge' && method === 'POST') {
      const body = await readJsonBody(req);
      if (!body || !body.id) return { status: 400, body: fail('http/bad-request', '缺少 id') };
      return { status: 200, body: ok(await store.purgeResume(String(body.id))) };
    }

    if (suffix === '/resume/revisions' && method === 'GET') {
      const id = query.get('id');
      if (!id) return { status: 400, body: fail('http/bad-request', '缺少 id') };
      return { status: 200, body: ok({ revisions: store.listRevisions(id) }) };
    }

    if (suffix === '/resume/restore-revision' && method === 'POST') {
      const body = await readJsonBody(req);
      if (!body || !body.id || !body.revisionId) {
        return { status: 400, body: fail('http/bad-request', '缺少 id 或 revisionId') };
      }
      return { status: 200, body: ok({ resume: await store.restoreRevision(String(body.id), String(body.revisionId)) }) };
    }

    if (suffix === '/resume/duplicate' && method === 'POST') {
      const body = await readJsonBody(req);
      if (!body || !body.id) return { status: 400, body: fail('http/bad-request', '缺少 id') };
      return { status: 200, body: ok({ resume: await store.duplicateResume(String(body.id)) }) };
    }

    if (suffix === '/template/install' && method === 'POST') {
      const body = await readJsonBody(req);
      if (body && body.template) {
        return { status: 200, body: ok({ template: await store.importTemplate(body.template) }) };
      }
      if (!body || !body.id) return { status: 400, body: fail('http/bad-request', '缺少市场条目 id') };
      return { status: 200, body: ok({ template: await store.installFromMarket(String(body.id)) }) };
    }

    if (suffix === '/template' && method === 'DELETE') {
      const id = query.get('id');
      if (!id) return { status: 400, body: fail('http/bad-request', '缺少 id') };
      return { status: 200, body: ok(await store.removeTemplate(id)) };
    }

    if (suffix === '/publish' && method === 'POST') {
      const body = await readJsonBody(req);
      if (!body || !body.resumeId) return { status: 400, body: fail('http/bad-request', '缺少 resumeId') };
      const entry = await store.publish({
        resumeId: String(body.resumeId),
        title: body.title,
        tagline: body.tagline,
        tags: body.tags,
        desc: body.desc,
        includeSample: body.includeSample === true,
        author: body.author,
      });
      return { status: 200, body: ok({ entry }) };
    }

    if (suffix === '/market/unpublish' && method === 'POST') {
      const body = await readJsonBody(req);
      if (!body || !body.id) return { status: 400, body: fail('http/bad-request', '缺少 id') };
      return { status: 200, body: ok(await store.unpublish(String(body.id))) };
    }

    if (suffix === '/market/like' && method === 'POST') {
      const body = await readJsonBody(req);
      if (!body || !body.id) return { status: 400, body: fail('http/bad-request', '缺少 id') };
      return { status: 200, body: ok(await store.like(String(body.id))) };
    }

    if (suffix === '/settings' && method === 'POST') {
      const body = await readJsonBody(req);
      return { status: 200, body: ok({ settings: await store.updateSettings(body || {}) }) };
    }

    // 兼容插件：设置页列出可兼容的简历相关插件；「下载安装」直接交给 DSH 插件管理器。
    if (suffix === '/compat/state' && method === 'GET') {
      return { status: 200, body: ok(listStatus()) };
    }

    if (suffix === '/compat/install' && method === 'POST') {
      const body = await readJsonBody(req);
      if (!body || !body.id) return { status: 400, body: fail('http/bad-request', '缺少插件 id') };
      return { status: 200, body: ok(await installPlugin({ id: String(body.id) })) };
    }

    // 模板库：新建 / 编辑模板、把模板发布到市场（发布主语是模板，不是简历）。
    if (suffix === '/template/save' && method === 'POST') {
      const body = await readJsonBody(req);
      const input = body && body.template ? body.template : body;
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { status: 400, body: fail('http/bad-request', '缺少模板内容') };
      }
      const template = input.id
        ? await store.updateTemplate(String(input.id), input)
        : await store.createTemplate(input);
      return { status: 200, body: ok({ template }) };
    }

    if (suffix === '/template/publish' && method === 'POST') {
      const body = await readJsonBody(req);
      if (!body || !body.templateId) return { status: 400, body: fail('http/bad-request', '缺少 templateId') };
      return { status: 200, body: ok({ entry: await store.publishTemplate(body) }) };
    }

    // 公共市场（GitHub 仓库当市场）：读 index、安装模板、本地点赞、生成投稿内容。
    if (suffix === '/github/state' && method === 'GET') {
      const settings = store.settings();
      const force = query.get('force') === '1';
      let index;
      try {
        index = await githubMarket.loadIndex({ force });
      } catch (error) {
        return {
          status: 200,
          body: ok({
            repo: settings.githubRepo,
            branch: settings.githubBranch,
            items: [],
            likes: store.githubState().likes,
            fetchedAt: '',
            stale: true,
            error: { code: (error && error.code) || 'github/offline', message: messageOf(error) },
          }),
        };
      }
      return {
        status: 200,
        body: ok({
          ...index,
          repo: settings.githubRepo,
          branch: settings.githubBranch,
          likes: store.githubState().likes,
        }),
      };
    }

    if (suffix === '/github/refresh' && method === 'POST') {
      const settings = store.settings();
      const index = await githubMarket.loadIndex({ force: true });
      return {
        status: 200,
        body: ok({ ...index, repo: settings.githubRepo, branch: settings.githubBranch, likes: store.githubState().likes }),
      };
    }

    if (suffix === '/github/install' && method === 'POST') {
      const body = await readJsonBody(req);
      if (!body || !body.id) return { status: 400, body: fail('http/bad-request', '缺少模板 id') };
      return { status: 200, body: ok({ template: await githubMarket.install(String(body.id)) }) };
    }

    if (suffix === '/github/like' && method === 'POST') {
      const body = await readJsonBody(req);
      if (!body || !body.id) return { status: 400, body: fail('http/bad-request', '缺少模板 id') };
      return { status: 200, body: ok(await store.likeGithub(String(body.id))) };
    }

    if (suffix === '/github/publish' && method === 'POST') {
      const body = await readJsonBody(req);
      if (!body || !body.resumeId) return { status: 400, body: fail('http/bad-request', '缺少 resumeId') };
      return { status: 200, body: ok(await githubMarket.publishPayload(body)) };
    }

    // 模板投稿：把模板库里的自定义模板生成一份可直接提交到 GitHub 的 JSON。
    if (suffix === '/github/publish-template' && method === 'POST') {
      const body = await readJsonBody(req);
      if (!body || !body.templateId) return { status: 400, body: fail('http/bad-request', '缺少 templateId') };
      return { status: 200, body: ok(await githubMarket.publishTemplatePayload(body)) };
    }

    // AI 对话：把用户历史消息（可选带上当前简历）转发给上游模型，返回纯文本回复。
    // 填了 DeepSeek Key 走 DeepSeek API；没填就走宿主 llm（DSH 当前模型，免 Key）。
    // 面板负责解析回复里的 ```json 代码块并渲染「应用到当前简历」。
    if (suffix === '/chat' && method === 'POST') {
      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { status: 400, body: fail('chat/bad-request', '请求体必须是 JSON 对象') };
      }
      const messages = body.messages;
      if (!Array.isArray(messages) || messages.length === 0) {
        return { status: 400, body: fail('chat/bad-messages', 'messages 必须是非空数组') };
      }
      if (messages.length > 40) {
        return { status: 400, body: fail('chat/too-long', '对话太长了（最多 40 条），请清空后开始新一轮') };
      }
      for (const item of messages) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return { status: 400, body: fail('chat/bad-messages', '每条消息必须是对象') };
        }
        if (item.role !== 'user' && item.role !== 'assistant') {
          return { status: 400, body: fail('chat/bad-role', '消息 role 只能是 user 或 assistant') };
        }
        if (typeof item.content !== 'string' || !item.content.trim()) {
          return { status: 400, body: fail('chat/bad-content', '消息 content 必须是非空字符串') };
        }
        if (item.content.length > 8000) {
          return { status: 400, body: fail('chat/too-long', '单条消息最多 8000 字') };
        }
      }
      // 当前简历只取渲染需要的三个字段；历史版本等大字段不塞进上下文。
      let resume = null;
      if (body.resumeId) {
        try {
          const found = store.getResume(String(body.resumeId));
          if (found && typeof found === 'object' && found.data) {
            resume = { title: found.title, templateId: found.templateId, data: found.data };
          }
        } catch {
          resume = null; // 简历不在了就只做纯对话，不阻断
        }
      }
      const result = await chatService.chat({ messages, resume });
      return {
        status: 200,
        body: ok({
          reply: result.reply,
          model: result.model,
          mode: result.mode,
          usage: result.usage,
        }),
      };
    }

    if (suffix === '/export' && method === 'POST') {
      const body = await readJsonBody(req);
      if (!body || !body.id) return { status: 400, body: fail('http/bad-request', '缺少 id') };
      const format = resolveFormat(body.format);
      if (!format) {
        return { status: 400, body: fail('export/bad-format', '不支持的导出格式，可选 html / doc / pdf') };
      }
      const resume = store.getResume(String(body.id));
      const template = store.templateForResume(resume) || templateById(resume.templateId);
      const written = await writeResumeExport(resume, template, { format, autoPrint: body.print === true });
      return { status: 200, body: ok(written) };
    }

    if (suffix === '/export/pdf' && method === 'POST') {
      const body = await readJsonBody(req);
      if (!body || !body.data) return { status: 400, body: fail('http/bad-request', '缺少 data') };
      const resume = body.id ? store.getResume(String(body.id)) : null;
      const name = (resume && resume.data && resume.data.basics && resume.data.basics.name) || body.name || 'resume';
      return { status: 200, body: ok(await saveRenderedPdf({ data: body.data, name })) };
    }

    if (suffix === '/export/reveal' && method === 'POST') {
      const body = await readJsonBody(req);
      if (!body || !body.path) return { status: 400, body: fail('http/bad-request', '缺少 path') };
      return { status: 200, body: ok(await revealExport(String(body.path))) };
    }

    if (suffix === '/export' && method === 'GET') {
      const id = query.get('id');
      if (!id) return { status: 400, body: fail('http/bad-request', '缺少 id') };
      const resume = store.getResume(id);
      const template = store.templateForResume(resume) || templateById(resume.templateId);
      const html = buildHtml(resume, template, { autoPrint: query.get('print') === '1' });
      const name = (resume.data.basics.name || resume.title || 'resume') + '.html';
      return { status: 200, html, downloadName: query.get('download') === '1' ? name : undefined };
    }

    return { status: 404, body: fail('http/not-found', '未知接口') };
  }

  return async function handle(req, res) {
    try {
      if (!isTrustedRequest(ctx, req)) {
        sendJson(res, 403, fail('http/forbidden', '仅允许本机同源访问'));
        return;
      }
      await store.whenReady();
      const result = await dispatch(req);
      if (result.html !== undefined) {
        sendHtml(res, result.status, result.html, result.downloadName);
        return;
      }
      sendJson(res, result.status, result.body);
    } catch (error) {
      const code = (error && error.code) || 'http/internal';
      const explicit = typeof error.status === 'number' ? error.status : null;
      const status =
        explicit || (code === 'github/not-found' || code === 'github/bad-id' ? 404 : /^github\//.test(code) ? 502 : 500);
      if (status >= 500) logWarn(ctx, error);
      sendJson(res, status, fail(code, messageOf(error)));
    }
  };
}

export function registerRoutes(ctx, { store }) {
  const handler = createHandler({ ctx, store });
  return ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: PREFIX, handler }),
    'resume-market: /resume-market/api routes',
  );
}
