#!/usr/bin/env node
/**
 * 免费简历模板市场 · 零依赖 HTTP 服务
 * ---------------------------------------------------------------------------
 * 供 dsh-plugin-resume-market 的 marketUrl 云端市场使用。
 * 仅使用 Node 内置模块（node:http / node:fs / node:crypto / node:path / node:url），
 * 无任何第三方依赖，Node >= 18（开发验证环境 Node v22）。
 *
 * 环境变量：
 *   PORT               监听端口，默认 7701
 *   HOST               监听地址，默认 127.0.0.1
 *   RM_DB              JSON 数据库文件路径，默认 <本文件目录>/market-data.json
 *   RM_TOKEN           可选 Bearer 令牌；配置后 DELETE 接口必须携带
 *   RM_PROTECT_PUBLISH 设为 "1" 时，发布（POST /api/templates）也要求 Bearer 令牌
 *
 * 数据持久化：整个库写 JSON 文件；写入采用「同目录临时文件 + fsync + rename」原子替换，
 * 所有写操作串行排队，避免并发写坏文件。
 *
 * 统一响应信封：
 *   成功 { ok:true,  value:... }
 *   失败 { ok:false, error:{ code, message } }
 *
 * 例外：GET /api/templates/:id/pack 直接返回分享包 JSON（kind/version/...），
 * 不套信封，因为它本身就是可被用户下载、被插件导入的独立文件格式。
 */
import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(MODULE_DIR, 'market-data.json');
const DEFAULT_PUBLIC_DIR = path.join(MODULE_DIR, 'public');

const SERVICE_NAME = 'resume-market';
const SERVICE_VERSION = '1';
const PACK_KIND = 'resume-market-pack';
const PACK_VERSION = 1;

/** 全局限制（字节 / 字符） */
export const LIMITS = Object.freeze({
  bodyBytes: 512 * 1024, // 请求体 ≤ 512KB
  itemBytes: 200 * 1024, // 单个条目 ≤ 200KB
  cssBytes: 100 * 1024, // template.css ≤ 100KB
  htmlBytes: 100 * 1024, // template.html（可选）≤ 100KB
  maxItems: 500, // 库内最多 500 条
  title: 80,
  author: 40,
  note: 300,
  tagLength: 20,
  tagCount: 8,
  templateId: 64,
  name: 60,
  listLimitDefault: 20,
  listLimitMax: 100,
  listOffsetMax: 1_000_000,
  indexCardLimit: 100, // 服务端渲染首页时最多渲染多少张卡片
  hardBodyBytes: 16 * 1024 * 1024, // 防御性硬上限：超过后直接断开连接
});

const SORT_VALUES = new Set(['newest', 'oldest', 'downloads', 'likes']);

const CORS_HEADERS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Max-Age': '86400',
});

const JSON_TYPE = 'application/json; charset=utf-8';

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
});

const defaultLogger = {
  info: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

/** 带 HTTP 状态码的业务错误 */
class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// 通用小工具
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function charLength(value) {
  return Array.from(String(value)).length;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 单行文本清洗：去掉控制字符，折叠空白，首尾去空格 */
function sanitizeSingleLine(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 多行文本清洗：保留换行与制表符，去掉其余控制字符 */
function sanitizeMultiline(value) {
  return String(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim();
}

/** HTML 转义（服务端渲染画廊卡片、属性时使用） */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/** 把 JSON 安全地塞进 <script> 里：转义 < > & 与行分隔符，防 </script> 截断 */
function jsonForInlineScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** 稳定的 JSON 序列化（对象键排序），用于去重哈希 */
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

/** 同一模板内容的去重指纹：sha256(templateId + css + data) */
function computeItemHash({ templateId, template, data }) {
  const css = isPlainObject(template) && typeof template.css === 'string' ? template.css : '';
  return crypto
    .createHash('sha256')
    .update(`${templateId}\u0000${css}\u0000${canonicalJson(data ?? null)}`, 'utf8')
    .digest('hex');
}

function newItemId(items) {
  const used = new Set(items.map((item) => item && item.id));
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = `rm_${crypto.randomBytes(9).toString('hex')}`;
    if (!used.has(id)) return id;
  }
  throw new HttpError(500, 'internal_error', '生成模板 ID 失败');
}

function sortItems(items, sort) {
  const copy = items.slice();
  const byCreated = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  const byId = (a, b) => String(b.id || '').localeCompare(String(a.id || ''));
  if (sort === 'downloads') {
    copy.sort((a, b) => (b.downloads || 0) - (a.downloads || 0) || byCreated(a, b) || byId(a, b));
  } else if (sort === 'likes') {
    copy.sort((a, b) => (b.likes || 0) - (a.likes || 0) || byCreated(a, b) || byId(a, b));
  } else if (sort === 'oldest') {
    copy.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || byId(a, b));
  } else {
    copy.sort((a, b) => byCreated(a, b) || byId(a, b));
  }
  return copy;
}

function formatDate(iso) {
  if (typeof iso !== 'string' || iso.length < 10) return '';
  return iso.slice(0, 10);
}

function safeFilename(value) {
  return String(value).replace(/[^\w.-]+/g, '_').slice(0, 96) || 'resume-template';
}

// ---------------------------------------------------------------------------
// 响应输出
// ---------------------------------------------------------------------------

function sendJson(req, res, status, payload, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'Content-Type': JSON_TYPE,
    'Content-Length': String(body.length),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...CORS_HEADERS,
    ...extraHeaders,
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function sendHtml(req, res, status, html, extraHeaders = {}) {
  const body = Buffer.from(html, 'utf8');
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': String(body.length),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...CORS_HEADERS,
    ...extraHeaders,
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function handleRequestError(err, req, res, logger) {
  if (res.writableEnded || res.destroyed) return;
  let httpError;
  if (err instanceof HttpError) {
    httpError = err;
  } else {
    httpError = new HttpError(500, 'internal_error', '服务器内部错误');
    logger.error('[market-server] 未处理的异常:', err);
  }
  const extra = httpError.status === 413 ? { Connection: 'close' } : {};
  if (res.headersSent) {
    try {
      res.end();
    } catch {
      /* 忽略 */
    }
    return;
  }
  try {
    sendJson(
      req,
      res,
      httpError.status,
      { ok: false, error: { code: httpError.code, message: httpError.message } },
      extra,
    );
  } catch {
    try {
      res.destroy();
    } catch {
      /* 忽略 */
    }
    return;
  }
  if (httpError.status === 413 && !req.complete && !req.destroyed) {
    res.once('finish', () => {
      try {
        req.destroy();
      } catch {
        /* 忽略 */
      }
    });
  }
}

function requireMethod(req, res, allowed) {
  if (allowed.includes(req.method)) return;
  res.setHeader('Allow', allowed.join(', '));
  throw new HttpError(405, 'method_not_allowed', `该接口仅支持 ${allowed.join(' / ')} 方法`);
}

function requireBearer(req, expectedToken) {
  const header = req.headers.authorization || '';
  const matched = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  const provided = matched ? matched[1].trim() : '';
  if (!provided || !timingSafeEqual(provided, expectedToken)) {
    throw new HttpError(401, 'unauthorized', '需要有效的 Bearer 令牌（Authorization: Bearer <token>）');
  }
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

// ---------------------------------------------------------------------------
// 请求体读取
// ---------------------------------------------------------------------------

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;
    let tooLarge = false;
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > LIMITS.hardBodyBytes) {
        tooLarge = true;
        chunks.length = 0;
        req.destroy();
        finish(reject, new HttpError(413, 'body_too_large', '请求体过大，连接已断开'));
        return;
      }
      if (received > limit) {
        tooLarge = true;
        chunks.length = 0;
        return; // 继续排空，等请求结束后再返回 413，避免客户端收到连接重置
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (tooLarge) {
        finish(reject, new HttpError(413, 'body_too_large', `请求体超过 ${formatBytes(limit)} 上限`));
        return;
      }
      finish(resolve, Buffer.concat(chunks));
    });

    req.on('error', (err) => {
      finish(reject, new HttpError(400, 'bad_request', `读取请求体失败：${err.message}`));
    });

    req.on('aborted', () => {
      finish(reject, new HttpError(400, 'bad_request', '请求被中断'));
    });
  });
}

function parseJsonBody(buffer) {
  if (!buffer || buffer.length === 0) {
    throw new HttpError(400, 'bad_json', '请求体为空，需要 JSON 对象');
  }
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch (err) {
    throw new HttpError(400, 'bad_json', `请求体不是合法 JSON：${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 输入校验与规范化
// ---------------------------------------------------------------------------

function invalidField(field, message) {
  return new HttpError(400, 'invalid_field', `${field} ${message}`);
}

function normalizeSingleLine(value, field, max, { required = false, fallback = '' } = {}) {
  if (value === undefined || value === null) {
    if (required) throw invalidField(field, '不能为空');
    return fallback;
  }
  if (typeof value !== 'string') throw invalidField(field, '必须是字符串');
  const clean = sanitizeSingleLine(value);
  const length = charLength(clean);
  if (length === 0) {
    if (required) throw invalidField(field, '不能为空');
    return fallback;
  }
  if (length > max) throw invalidField(field, `长度不能超过 ${max} 个字符（当前 ${length} 个）`);
  return clean;
}

function normalizeMultiline(value, field, max) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw invalidField(field, '必须是字符串');
  const clean = sanitizeMultiline(value);
  const length = charLength(clean);
  if (length > max) throw invalidField(field, `长度不能超过 ${max} 个字符（当前 ${length} 个）`);
  return clean;
}

function normalizeTags(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalidField('tags', '必须是字符串数组');
  if (value.length > LIMITS.tagCount) throw invalidField('tags', `最多 ${LIMITS.tagCount} 个标签`);
  const seen = new Set();
  const tags = [];
  for (const raw of value) {
    if (typeof raw !== 'string') throw invalidField('tags', '每个标签必须是字符串');
    const tag = sanitizeSingleLine(raw).replace(/^#+/, '').trim();
    if (!tag) continue;
    const length = charLength(tag);
    if (length > LIMITS.tagLength) {
      throw invalidField('tags', `单个标签不能超过 ${LIMITS.tagLength} 个字符（当前「${tag.slice(0, 24)}」）`);
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

function normalizeTemplateId(value) {
  if (typeof value !== 'string') throw invalidField('templateId', '必须是字符串');
  const clean = sanitizeSingleLine(value);
  if (!clean) throw invalidField('templateId', '不能为空');
  if (clean.length > LIMITS.templateId) {
    throw invalidField('templateId', `长度不能超过 ${LIMITS.templateId} 个字符`);
  }
  if (/[\s/\\?#]/.test(clean)) throw invalidField('templateId', '不能包含空白、斜杠或问号');
  return clean;
}

function normalizeTemplateInput(value) {
  if (!isPlainObject(value)) throw invalidField('template', '必须是对象');
  const css = value.css;
  if (typeof css !== 'string' || css.trim() === '') {
    throw invalidField('template.css', '必填且不能为空');
  }
  if (css.includes('\u0000')) throw invalidField('template.css', '包含非法空字符');
  const cssBytes = Buffer.byteLength(css, 'utf8');
  if (cssBytes > LIMITS.cssBytes) {
    throw new HttpError(413, 'css_too_large', `template.css 超过 ${formatBytes(LIMITS.cssBytes)} 上限（当前 ${formatBytes(cssBytes)}）`);
  }
  const template = { ...value, css };
  if (template.html !== undefined) {
    if (typeof template.html !== 'string') throw invalidField('template.html', '必须是字符串');
    const htmlBytes = Buffer.byteLength(template.html, 'utf8');
    if (htmlBytes > LIMITS.htmlBytes) {
      throw new HttpError(413, 'html_too_large', `template.html 超过 ${formatBytes(LIMITS.htmlBytes)} 上限（当前 ${formatBytes(htmlBytes)}）`);
    }
  }
  return template;
}

function normalizeData(value) {
  if (value === undefined) throw invalidField('data', '不能为空');
  if (value === null || typeof value !== 'object') throw invalidField('data', '必须是对象或数组');
  return value;
}

/** 校验并规范化 POST 请求里的 item，返回待入库记录 */
function normalizeItemInput(input) {
  if (!isPlainObject(input)) throw invalidField('item', '必须是对象 {title,author,tags,note,templateId,template,data}');
  const title = normalizeSingleLine(input.title, 'title', LIMITS.title, { required: true });
  const author = normalizeSingleLine(input.author, 'author', LIMITS.author, { fallback: '匿名' });
  const note = normalizeMultiline(input.note, 'note', LIMITS.note);
  const tags = normalizeTags(input.tags);
  const templateId = normalizeTemplateId(input.templateId);
  const name = normalizeSingleLine(input.name, 'name', LIMITS.name, { fallback: templateId });
  const template = normalizeTemplateInput(input.template);
  const data = normalizeData(input.data);

  const record = { title, author, tags, note, name, templateId, template, data };
  const bytes = Buffer.byteLength(JSON.stringify(record), 'utf8');
  if (bytes > LIMITS.itemBytes) {
    throw new HttpError(413, 'item_too_large', `模板条目超过 ${formatBytes(LIMITS.itemBytes)} 上限（当前 ${formatBytes(bytes)}）`);
  }
  return record;
}

// ---------------------------------------------------------------------------
// 数据库（JSON 文件）
// ---------------------------------------------------------------------------

function normalizeLoadedItem(raw) {
  if (!isPlainObject(raw)) return null;
  const item = { ...raw };
  item.id = typeof item.id === 'string' && item.id ? item.id : newItemId([]);
  item.title = typeof item.title === 'string' && item.title ? item.title : '未命名模板';
  item.author = typeof item.author === 'string' && item.author ? item.author : '匿名';
  item.tags = Array.isArray(item.tags) ? item.tags.filter((tag) => typeof tag === 'string') : [];
  item.note = typeof item.note === 'string' ? item.note : '';
  item.templateId = typeof item.templateId === 'string' && item.templateId ? item.templateId : item.id;
  item.name = typeof item.name === 'string' && item.name ? item.name : item.templateId;
  item.template = isPlainObject(item.template) ? item.template : { css: '' };
  item.data = item.data === undefined ? {} : item.data;
  item.downloads = Number.isFinite(item.downloads) && item.downloads >= 0 ? Math.floor(item.downloads) : 0;
  item.likes = Number.isFinite(item.likes) && item.likes >= 0 ? Math.floor(item.likes) : 0;
  item.createdAt = typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : new Date().toISOString();
  item.updatedAt = typeof item.updatedAt === 'string' && item.updatedAt ? item.updatedAt : item.createdAt;
  if (typeof item.hash !== 'string' || !/^[a-f0-9]{64}$/.test(item.hash)) {
    item.hash = computeItemHash(item);
  }
  return item;
}

async function loadDatabase(dbPath, logger) {
  let raw;
  try {
    raw = await fsp.readFile(dbPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { version: 1, items: [] };
    throw new HttpError(500, 'db_unavailable', `无法读取数据库文件（${dbPath}）：${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const backupPath = `${dbPath}.corrupt-${Date.now()}`;
    await fsp.rename(dbPath, backupPath).catch(() => {});
    logger.warn(`[market-server] 数据库 JSON 解析失败，已备份为 ${backupPath}，本次以空库启动`);
    return { version: 1, items: [] };
  }

  if (!isPlainObject(parsed)) {
    logger.warn('[market-server] 数据库顶层不是对象，已按空库处理');
    return { version: 1, items: [] };
  }
  if (!Array.isArray(parsed.items)) {
    logger.warn('[market-server] 数据库缺少 items 数组，已按空库处理');
    return { version: 1, items: [] };
  }

  const items = [];
  const seenIds = new Set();
  for (const rawItem of parsed.items) {
    const item = normalizeLoadedItem(rawItem);
    if (!item) continue;
    if (seenIds.has(item.id)) item.id = newItemId(items);
    seenIds.add(item.id);
    items.push(item);
  }
  return { version: 1, items };
}

async function renameWithRetry(from, to, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await fsp.rename(from, to);
      return;
    } catch (err) {
      const retryable = err && ['EPERM', 'EACCES', 'EBUSY'].includes(err.code);
      if (!retryable || attempt === attempts - 1) throw err;
      await delay(30 * (attempt + 1)); // Windows 上偶发文件占用，退避重试
    }
  }
}

async function atomicWriteFile(filePath, text) {
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  const tmpPath = path.join(
    dir,
    `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
  );
  let handle = null;
  try {
    handle = await fsp.open(tmpPath, 'w');
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await renameWithRetry(tmpPath, filePath);
  } catch (err) {
    if (handle) {
      try {
        await handle.close();
      } catch {
        /* 忽略 */
      }
    }
    await fsp.unlink(tmpPath).catch(() => {});
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 视图映射
// ---------------------------------------------------------------------------

function toPublicItem(item) {
  return {
    id: item.id,
    title: item.title,
    author: item.author,
    tags: Array.isArray(item.tags) ? [...item.tags] : [],
    note: item.note,
    name: item.name,
    templateId: item.templateId,
    template: item.template,
    data: item.data,
    downloads: item.downloads,
    likes: item.likes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/** 列表摘要：不含 template/data（体积大），需要完整内容请用 GET /:id 或 /:id/pack */
function toListItem(item) {
  return {
    id: item.id,
    title: item.title,
    author: item.author,
    tags: Array.isArray(item.tags) ? [...item.tags] : [],
    note: item.note,
    name: item.name,
    templateId: item.templateId,
    downloads: item.downloads,
    likes: item.likes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function buildPack(item) {
  return {
    kind: PACK_KIND,
    version: PACK_VERSION,
    name: item.name || item.templateId || item.title,
    title: item.title,
    author: item.author,
    tags: Array.isArray(item.tags) ? [...item.tags] : [],
    template: item.template,
    data: item.data,
  };
}

function matchesQuery(item, query) {
  if (!query) return true;
  const haystack = [
    item.title,
    item.author,
    item.note,
    item.templateId,
    item.name,
    ...(Array.isArray(item.tags) ? item.tags : []),
  ]
    .join('\n')
    .toLowerCase();
  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

function parseQueryInt(raw, field, fallback, min, max) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return fallback;
  const text = String(raw).trim();
  if (!/^-?\d+$/.test(text)) throw new HttpError(400, 'invalid_query', `查询参数 ${field} 必须是整数`);
  const value = Number(text);
  if (!Number.isSafeInteger(value)) throw new HttpError(400, 'invalid_query', `查询参数 ${field} 超出范围`);
  return Math.min(Math.max(value, min), max);
}

// ---------------------------------------------------------------------------
// 路由处理
// ---------------------------------------------------------------------------

async function routeRequest(req, res, ctx) {
  let url;
  try {
    url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  } catch {
    throw new HttpError(400, 'bad_request', '请求地址不合法');
  }

  // CORS 预检：任意路径都直接 204
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Content-Length': '0',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
    });
    res.end();
    return;
  }

  let segments;
  try {
    segments = url.pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
  } catch {
    throw new HttpError(400, 'bad_request', 'URL 编码不合法');
  }

  if (segments[0] === 'api') {
    await routeApi(req, res, ctx, segments.slice(1), url);
    return;
  }
  await serveStatic(req, res, ctx, segments, url);
}

async function routeApi(req, res, ctx, parts, url) {
  if (parts.length === 0) throw new HttpError(404, 'route_not_found', '接口不存在');

  if (parts[0] === 'health') {
    if (parts.length !== 1) throw new HttpError(404, 'route_not_found', '接口不存在');
    requireMethod(req, res, ['GET']);
    req.resume();
    sendJson(req, res, 200, {
      ok: true,
      value: { name: SERVICE_NAME, version: SERVICE_VERSION, items: ctx.getDb().items.length },
    });
    return;
  }

  if (parts[0] === 'templates') {
    await routeTemplates(req, res, ctx, parts.slice(1), url);
    return;
  }

  throw new HttpError(404, 'route_not_found', '接口不存在');
}

async function routeTemplates(req, res, ctx, parts, url) {
  const db = ctx.getDb();

  // /api/templates
  if (parts.length === 0) {
    if (req.method === 'GET') {
      req.resume();
      listTemplates(req, res, ctx, url);
      return;
    }
    if (req.method === 'POST') {
      await createTemplate(req, res, ctx);
      return;
    }
    res.setHeader('Allow', 'GET, POST');
    throw new HttpError(405, 'method_not_allowed', '该接口仅支持 GET / POST 方法');
  }

  const id = parts[0];
  const item = db.items.find((entry) => entry.id === id);

  // /api/templates/:id
  if (parts.length === 1) {
    if (req.method === 'GET') {
      req.resume();
      if (!item) throw new HttpError(404, 'not_found', `模板不存在：${id}`);
      sendJson(req, res, 200, { ok: true, value: { item: toPublicItem(item) } });
      return;
    }
    if (req.method === 'DELETE') {
      req.resume();
      if (ctx.config.token) requireBearer(req, ctx.config.token);
      if (!item) throw new HttpError(404, 'not_found', `模板不存在：${id}`);
      db.items.splice(db.items.indexOf(item), 1);
      await ctx.persist();
      sendJson(req, res, 200, { ok: true, value: { deleted: true, id } });
      return;
    }
    res.setHeader('Allow', 'GET, DELETE');
    throw new HttpError(405, 'method_not_allowed', '该接口仅支持 GET / DELETE 方法');
  }

  // /api/templates/:id/(download|like|pack)
  if (parts.length === 2) {
    const action = parts[1];

    if (action === 'download' || action === 'like') {
      requireMethod(req, res, ['POST']);
      req.resume();
      if (!item) throw new HttpError(404, 'not_found', `模板不存在：${id}`);
      const field = action === 'download' ? 'downloads' : 'likes';
      item[field] = (Number.isFinite(item[field]) ? item[field] : 0) + 1;
      await ctx.persist();
      sendJson(req, res, 200, { ok: true, value: { [field]: item[field] } });
      return;
    }

    if (action === 'pack') {
      requireMethod(req, res, ['GET']);
      req.resume();
      if (!item) throw new HttpError(404, 'not_found', `模板不存在：${id}`);
      const pack = buildPack(item);
      const body = Buffer.from(JSON.stringify(pack), 'utf8');
      res.writeHead(200, {
        'Content-Type': JSON_TYPE,
        'Content-Length': String(body.length),
        'Content-Disposition': `attachment; filename="${safeFilename(item.id)}.resume-market-pack.json"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...CORS_HEADERS,
      });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
  }

  throw new HttpError(404, 'route_not_found', '接口不存在');
}

function listTemplates(req, res, ctx, url) {
  const db = ctx.getDb();
  const q = sanitizeSingleLine(url.searchParams.get('q') || '').toLowerCase();
  const limit = parseQueryInt(
    url.searchParams.get('limit'),
    'limit',
    LIMITS.listLimitDefault,
    1,
    LIMITS.listLimitMax,
  );
  const offset = parseQueryInt(url.searchParams.get('offset'), 'offset', 0, 0, LIMITS.listOffsetMax);
  const sort = sanitizeSingleLine(url.searchParams.get('sort') || 'newest');
  if (!SORT_VALUES.has(sort)) {
    throw new HttpError(400, 'invalid_query', `sort 只能是 ${[...SORT_VALUES].join(' / ')}，当前为「${sort}」`);
  }
  const include = (url.searchParams.get('include') || url.searchParams.get('fields') || '').trim();
  // 默认返回完整条目（含 template/data），便于客户端“一键安装”；
  // 需要轻量列表时用 ?include=summary / ?summary=1。
  const summary = include === 'summary' || url.searchParams.get('summary') === '1';

  const filtered = sortItems(db.items.filter((item) => matchesQuery(item, q)), sort);
  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit).map((item) => (summary ? toListItem(item) : toPublicItem(item)));

  sendJson(req, res, 200, {
    ok: true,
    value: { items: page, total, limit, offset },
  });
}

/**
 * 兼容插件本地市场条目的字段名（name / tagline / desc / css / sample），
 * 让 POST 既能接收服务端标准写法 {title, template:{css}, data}，
 * 也能直接接收插件导出的市场条目或分享包。
 */
function normalizeCompatItem(raw) {
  const input = { ...raw };
  if (input.title === undefined && typeof input.name === 'string') input.title = input.name;
  if (input.note === undefined) input.note = input.desc !== undefined ? input.desc : input.tagline;
  if (!isPlainObject(input.template) && typeof input.css === 'string') {
    input.template = { css: input.css };
    if (typeof input.html === 'string') input.template.html = input.html;
  }
  if (input.data === undefined && input.sample !== undefined) input.data = input.sample;
  return input;
}

async function createTemplate(req, res, ctx) {
  if (ctx.config.token && ctx.config.protectPublish) {
    requireBearer(req, ctx.config.token);
  }

  const buffer = await readBody(req, LIMITS.bodyBytes);
  const payload = parseJsonBody(buffer);
  if (!isPlainObject(payload)) {
    throw new HttpError(400, 'invalid_body', '请求体必须是 { item: {...} } 形式的 JSON 对象');
  }
  const rawItem = isPlainObject(payload.item) ? payload.item : payload;
  const record = normalizeItemInput(normalizeCompatItem(rawItem));
  const hash = computeItemHash(record);

  const db = ctx.getDb();
  const existing = db.items.find((item) => item.hash === hash);
  if (existing) {
    throw new HttpError(409, 'duplicate', `相同模板与数据已存在（id: ${existing.id}）`);
  }
  if (db.items.length >= LIMITS.maxItems) {
    throw new HttpError(409, 'market_full', `市场已满（最多 ${LIMITS.maxItems} 条），请先删除旧模板`);
  }

  const now = new Date().toISOString();
  const item = {
    id: newItemId(db.items),
    ...record,
    downloads: 0,
    likes: 0,
    createdAt: now,
    updatedAt: now,
    hash,
  };
  db.items.push(item);
  await ctx.persist();

  sendJson(req, res, 201, { ok: true, value: { item: toPublicItem(item) } });
}

// ---------------------------------------------------------------------------
// 静态页面与资源
// ---------------------------------------------------------------------------

const FALLBACK_INDEX_HTML = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>免费简历模板市场</title></head>
<body style="font-family:system-ui,sans-serif;padding:40px;line-height:1.7">
<h1>免费简历模板市场 API 运行中</h1>
<p>尚未找到画廊页 <code>public/index.html</code>，API 接口不受影响。</p>
<p>健康检查：<a href="/api/health">/api/health</a></p>
</body></html>`;

function renderTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  return `<div class="tags">${tags.map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join('')}</div>`;
}

function renderCardsHtml(items) {
  if (!items.length) {
    return '<p class="empty">市场里还没有模板，发布第一个吧。</p>';
  }
  return items
    .map((item) => {
      const note = item.note ? `<p class="note">${escapeHtml(item.note)}</p>` : '';
      const date = formatDate(item.createdAt);
      const meta = `作者：${escapeHtml(item.author || '匿名')}${date ? ` · ${escapeHtml(date)}` : ''}`;
      const id = escapeHtml(item.id);
      return `<article class="card" data-id="${id}">
  <div class="card-head">
    <h2 class="card-title">${escapeHtml(item.title)}</h2>
    <span class="badge">${escapeHtml(item.templateId)}</span>
  </div>
  <p class="meta">${meta}</p>
  ${renderTags(item.tags)}
  ${note}
  <div class="actions">
    <button type="button" data-action="copy" data-id="${id}">复制导入 JSON</button>
    <button type="button" class="ghost" data-action="like" data-id="${id}">赞 <span data-field="likes">${item.likes}</span></button>
    <button type="button" class="ghost" data-action="download" data-id="${id}">下载 <span data-field="downloads">${item.downloads}</span></button>
  </div>
</article>`;
    })
    .join('\n');
}

function renderIndexHtml(ctx) {
  const db = ctx.getDb();
  const summaries = sortItems(db.items, 'newest').slice(0, LIMITS.indexCardLimit).map(toListItem);
  const boot = { items: summaries, total: db.items.length, rendered: summaries.length };
  const cards = renderCardsHtml(summaries);
  return ctx.indexHtml
    .replace(/\{\{COUNT\}\}/g, () => String(db.items.length))
    .replace(/\{\{CARDS\}\}/g, () => cards)
    .replace(/\{\{BOOT_JSON\}\}/g, () => jsonForInlineScript(boot));
}

async function serveStatic(req, res, ctx, segments, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    throw new HttpError(405, 'method_not_allowed', '静态页面仅支持 GET / HEAD 方法');
  }

  if (segments.length === 0) {
    sendHtml(req, res, 200, renderIndexHtml(ctx));
    return;
  }
  if (segments.length === 1 && (segments[0] === 'index.html' || segments[0] === 'index.htm')) {
    sendHtml(req, res, 200, renderIndexHtml(ctx));
    return;
  }
  if (segments[0] === 'assets' && segments.length >= 2) {
    await serveAsset(req, res, ctx, segments.slice(1));
    return;
  }
  // 兼容 ?format=json 之类的误访问：未知静态路径统一 404
  void url;
  throw new HttpError(404, 'route_not_found', `页面不存在：/${segments.join('/')}`);
}

async function serveAsset(req, res, ctx, relativeSegments) {
  const assetsRoot = path.resolve(ctx.config.publicDir, 'assets');
  const filePath = path.resolve(assetsRoot, ...relativeSegments);
  if (filePath !== assetsRoot && !filePath.startsWith(assetsRoot + path.sep)) {
    throw new HttpError(404, 'route_not_found', '资源不存在');
  }
  let stat = null;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    stat = null;
  }
  if (!stat || !stat.isFile()) {
    throw new HttpError(404, 'route_not_found', '资源不存在');
  }
  const data = await fsp.readFile(filePath);
  const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': String(data.length),
    'Cache-Control': 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    ...CORS_HEADERS,
  });
  res.end(req.method === 'HEAD' ? undefined : data);
}

// ---------------------------------------------------------------------------
// 配置与服务启动
// ---------------------------------------------------------------------------

function parsePort(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) throw new Error(`PORT 必须是 0-65535 的整数，当前为「${value}」`);
  const port = Number(text);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT 必须是 0-65535 的整数，当前为「${value}」`);
  }
  return port;
}

function resolveConfig(options = {}) {
  const logger = options.logger || defaultLogger;
  const port = parsePort(options.port ?? process.env.PORT, 7701);
  const host = String(options.host ?? process.env.HOST ?? '127.0.0.1').trim() || '127.0.0.1';
  const dbPath = path.resolve(options.dbPath ?? process.env.RM_DB ?? DEFAULT_DB_PATH);
  const token = String(options.token ?? process.env.RM_TOKEN ?? '').trim();
  const protectPublish =
    options.protectPublish ?? String(process.env.RM_PROTECT_PUBLISH ?? '').trim() === '1';
  const publicDir = path.resolve(options.publicDir ?? DEFAULT_PUBLIC_DIR);
  return { port, host, dbPath, token, protectPublish: Boolean(protectPublish), publicDir, logger };
}

async function loadIndexHtml(publicDir, logger) {
  const indexPath = path.join(publicDir, 'index.html');
  try {
    return await fsp.readFile(indexPath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') logger.warn(`[market-server] 读取画廊页失败：${err.message}`);
    logger.warn(`[market-server] 未找到画廊页 ${indexPath}，使用内置降级页面`);
    return FALLBACK_INDEX_HTML;
  }
}

/**
 * 创建（并启动）市场服务。
 * @param {object} [options]
 * @param {number} [options.port]        监听端口，0 表示随机端口
 * @param {string} [options.host]        监听地址
 * @param {string} [options.dbPath]      JSON 数据库路径
 * @param {string} [options.token]       Bearer 令牌（可选）
 * @param {boolean}[options.protectPublish] 是否保护发布接口
 * @param {object} [options.logger]      {info,warn,error}
 * @param {string} [options.publicDir]   静态资源目录
 * @returns {Promise<object>} 服务句柄：{ server, config, url, address, db, close() }
 */
export async function createMarketServer(options = {}) {
  const config = resolveConfig(options);
  const db = await loadDatabase(config.dbPath, config.logger);
  const indexHtml = await loadIndexHtml(config.publicDir, config.logger);

  let writeChain = Promise.resolve();
  const persist = () => {
    const text = JSON.stringify({ version: 1, items: db.items }, null, 2);
    const run = writeChain.then(() => atomicWriteFile(config.dbPath, text));
    writeChain = run.catch((err) => {
      config.logger.error('[market-server] 持久化失败:', err);
    });
    return run;
  };

  const ctx = {
    config,
    getDb: () => db,
    persist,
    indexHtml,
  };

  const server = http.createServer((req, res) => {
    routeRequest(req, res, ctx).catch((err) => handleRequestError(err, req, res, config.logger));
  });
  server.on('clientError', (err, socket) => {
    if (socket && socket.writable) {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    }
  });

  await new Promise((resolve, reject) => {
    const onError = (err) => reject(err);
    server.once('error', onError);
    server.listen(config.port, config.host, () => {
      server.off('error', onError);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = address && typeof address === 'object' ? address.port : config.port;
  config.port = actualPort;
  const displayHost = config.host === '0.0.0.0' || config.host === '::' ? '127.0.0.1' : config.host;

  return {
    server,
    config,
    address,
    url: `http://${displayHost}:${actualPort}`,
    get db() {
      return db;
    },
    async close() {
      const closed = new Promise((resolve) => server.close(() => resolve()));
      if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
      const forceTimer = setTimeout(() => {
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      }, 50);
      if (typeof forceTimer.unref === 'function') forceTimer.unref();
      await closed;
      clearTimeout(forceTimer);
      await writeChain.catch(() => {});
    },
  };
}

function isMainModule(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return path.resolve(fileURLToPath(metaUrl)).toLowerCase() === path.resolve(process.argv[1]).toLowerCase();
  } catch {
    return false;
  }
}

async function main() {
  const logger = defaultLogger;
  const config = resolveConfig({ logger });
  const app = await createMarketServer({ logger });
  logger.info(
    `[market-server] ${SERVICE_NAME} v${SERVICE_VERSION} 已启动：${app.url}  ` +
      `（DB: ${config.dbPath}；令牌：${config.token ? '已启用' : '未启用'}）`,
  );

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    logger.info(`[market-server] 收到 ${signal}，正在关闭…`);
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      logger.error('[market-server] 关闭失败:', err);
      process.exit(1);
    }
  };
  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('[market-server] 启动失败:', err);
    process.exitCode = 1;
  });
}
