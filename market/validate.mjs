/**
 * 公共市场内容校验（零依赖）：node market/validate.mjs
 *
 * 校验 market/index.json 与 market/templates/*.json：
 *   - 字段齐全、类型正确、id / file / cls 互相对应
 *   - 模板 CSS 以 .rm-t-* 为根选择器，且只用自己这个根（不污染别的模板）
 *   - CSS 自包含：不引用外部资源（@import / url(http…)）
 *   - sample 是 normalizeData 结构，示例数据里不放真实联系方式
 *   - 没有多余/缺失的模板文件
 *
 * 只读本地文件，不发网络请求；CI 或 PR 前跑一遍即可。
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const INDEX_FILE = join(here, 'index.json');
const TEMPLATES_DIR = join(here, 'templates');
/** 单文件上限：插件发布链路对 css 的上限是 100KB，这里留一点余量。 */
const MAX_CSS_BYTES = 100 * 1024;
/** 示例数据统一使用的虚构联系方式。 */
const SAMPLE_PHONE = '138 0013 8000';

const errors = [];
const warnings = [];
const checkedFiles = [];

function fail(where, message) {
  errors.push(where + '：' + message);
}

function warn(where, message) {
  warnings.push(where + '：' + message);
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isText(value) {
  return typeof value === 'string';
}

function isIsoDate(value) {
  return typeof value === 'string' && value.length >= 20 && Number.isFinite(Date.parse(value));
}

/** 必填字符串字段（允许空串时传 allowEmpty）。 */
function requireText(where, object, key, { allowEmpty = false } = {}) {
  const value = object[key];
  if (!isText(value)) {
    fail(where, '缺少字符串字段 ' + key);
    return;
  }
  if (!allowEmpty && !value.trim()) fail(where, key + ' 不能为空');
}

function requireTags(where, object, { max = 6, maxLength = 12 } = {}) {
  const tags = object.tags;
  if (!Array.isArray(tags)) {
    fail(where, '缺少字符串数组 tags');
    return;
  }
  if (!tags.length) warn(where, 'tags 为空，市场里会没有筛选标签');
  if (tags.length > max) fail(where, 'tags 最多 ' + max + ' 个，当前 ' + tags.length);
  tags.forEach((tag, index) => {
    if (!isText(tag) || !tag.trim()) fail(where, 'tags[' + index + '] 必须是非空字符串');
    else if (tag.length > maxLength) fail(where, 'tags[' + index + '] 超过 ' + maxLength + ' 字');
  });
}

/** 校验 CSS：根选择器、纯净度、自包含。 */
function checkCss(where, css, cls) {
  if (!isText(css)) {
    fail(where, '缺少字符串字段 css');
    return;
  }
  if (!css.trim()) {
    fail(where, 'css 是空的');
    return;
  }
  if (Array.from(css).length > MAX_CSS_BYTES) fail(where, 'css 超过 ' + MAX_CSS_BYTES + ' 字符上限');

  const rootPattern = new RegExp('\\.' + cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{');
  if (!rootPattern.test(css)) {
    fail(where, 'css 里没有以 .' + cls + '{ 开头的根规则');
  }
  // 不引用远程资源
  if (/@import\b/i.test(css)) fail(where, 'css 里不能有 @import（必须自包含）');
  if (/url\(\s*['"]?(?:https?:)?\/\//i.test(css)) fail(where, 'css 里不能有远程 url()（必须自包含）');
  if (/@font-face\b/i.test(css)) warn(where, 'css 里有 @font-face，请确认字体是系统字体而不是远程字体');

  // 每条规则的选择器都必须以自己这个根开头（可逗号并列），否则会污染其他模板
  const blocks = [];
  let cursor = 0;
  while (cursor < css.length) {
    const open = css.indexOf('{', cursor);
    if (open === -1) break;
    const selector = css.slice(cursor, open).trim();
    const close = css.indexOf('}', open + 1);
    if (close === -1) {
      fail(where, 'css 花括号没有闭合');
      break;
    }
    blocks.push(selector);
    cursor = close + 1;
  }
  if (!blocks.length) fail(where, 'css 里没有解析到任何规则');
  for (const selector of blocks) {
    if (!selector) continue;
    if (selector.startsWith('@')) {
      fail(where, '不支持 @ 规则（' + selector.slice(0, 40) + '），公共市场模板保持单一根选择器');
      continue;
    }
    for (const part of selector.split(',')) {
      const one = part.trim();
      if (!one) continue;
      if (!one.startsWith('.' + cls)) {
        fail(where, '选择器必须写在 .' + cls + ' 下，发现：' + one.slice(0, 60));
        break;
      }
    }
  }
}

/** 校验 sample（normalizeData 结构 + 去个人化）。 */
function checkSample(where, sample) {
  if (!isObject(sample)) {
    fail(where, '缺少对象字段 sample');
    return;
  }
  const basics = sample.basics;
  if (!isObject(basics)) fail(where, 'sample.basics 必须是对象');
  else {
    for (const key of ['name', 'role', 'phone', 'email', 'city', 'wechat', 'github', 'website']) {
      if (!isText(basics[key])) fail(where, 'sample.basics.' + key + ' 必须是字符串');
    }
    if (isText(basics.phone) && basics.phone && basics.phone !== SAMPLE_PHONE) {
      fail(where, 'sample.basics.phone 请用虚构号码 ' + SAMPLE_PHONE + '，当前：' + basics.phone);
    }
    if (isText(basics.email) && basics.email) {
      const email = basics.email;
      if (!/@(example\.(com|org|net)|[\w.-]*\.example)$/i.test(email)) {
        fail(where, 'sample.basics.email 必须是 example.com 之类的示例邮箱，当前：' + email);
      }
    }
  }
  if (!isText(sample.summary)) fail(where, 'sample.summary 必须是字符串');

  const listKeys = ['experience', 'projects', 'education', 'skills', 'awards'];
  for (const key of listKeys) {
    if (!Array.isArray(sample[key])) fail(where, 'sample.' + key + ' 必须是数组');
  }
  if (Array.isArray(sample.experience)) {
    sample.experience.forEach((item, index) => {
      const at = where + '.sample.experience[' + index + ']';
      if (!isObject(item)) return fail(at, '必须是对象');
      for (const key of ['company', 'role', 'period', 'location']) requireText(at, item, key, { allowEmpty: true });
      if (!Array.isArray(item.bullets)) fail(at, 'bullets 必须是数组');
      else item.bullets.forEach((line, i) => { if (!isText(line)) fail(at, 'bullets[' + i + '] 必须是字符串'); });
    });
  }
  if (Array.isArray(sample.projects)) {
    sample.projects.forEach((item, index) => {
      const at = where + '.sample.projects[' + index + ']';
      if (!isObject(item)) return fail(at, '必须是对象');
      requireText(at, item, 'name', { allowEmpty: true });
      if (!Array.isArray(item.bullets)) fail(at, 'bullets 必须是数组');
    });
  }
  if (Array.isArray(sample.education)) {
    sample.education.forEach((item, index) => {
      const at = where + '.sample.education[' + index + ']';
      if (!isObject(item)) return fail(at, '必须是对象');
      for (const key of ['school', 'degree', 'major', 'period', 'gpa']) requireText(at, item, key, { allowEmpty: true });
    });
  }
  if (Array.isArray(sample.skills)) {
    sample.skills.forEach((item, index) => {
      const at = where + '.sample.skills[' + index + ']';
      if (!isObject(item)) return fail(at, '必须是对象');
      requireText(at, item, 'group');
      requireText(at, item, 'items');
    });
  }
  if (Array.isArray(sample.awards)) {
    sample.awards.forEach((item, index) => {
      const at = where + '.sample.awards[' + index + ']';
      if (!isObject(item)) return fail(at, '必须是对象');
      for (const key of ['title', 'date', 'desc']) requireText(at, item, key, { allowEmpty: true });
    });
  }

  // 明确提示常见的小红点：真名之外，不要出现看起来像真实身份证/手机号的长串数字
  const raw = JSON.stringify(sample);
  const phones = raw.match(/1[3-9]\d{9}/g) || [];
  phones.forEach((phone) => fail(where, 'sample 里出现了像是真实手机号的数字串：' + phone));
}

/** 读 JSON，报错时给出文件名。 */
async function readJson(file, where) {
  const text = await readFile(file, 'utf8');
  try {
    checkedFiles.push(file);
    return JSON.parse(text);
  } catch (error) {
    fail(where, 'JSON 解析失败：' + error.message);
    return null;
  }
}

function checkIndexEntry(where, entry) {
  if (!isObject(entry)) return fail(where, '必须是对象');
  requireText(where, entry, 'id');
  if (isText(entry.id) && !/^rm-[a-z0-9][a-z0-9-]{1,58}$/.test(entry.id)) {
    fail(where, 'id 必须是小写字母/数字/连字符的 rm-* 形式，当前：' + entry.id);
  }
  for (const key of ['name', 'en', 'tagline', 'author', 'accent', 'cls', 'file']) requireText(where, entry, key);
  if (isText(entry.cls) && !/^rm-t-[a-z0-9-]{1,40}$/.test(entry.cls)) {
    fail(where, 'cls 必须是 rm-t-* 形式，当前：' + entry.cls);
  }
  if (isText(entry.accent) && !/^#[0-9a-fA-F]{6}$/.test(entry.accent)) {
    fail(where, 'accent 必须是 #rrggbb，当前：' + entry.accent);
  }
  requireTags(where, entry);
  if (typeof entry.installs !== 'number' || !Number.isFinite(entry.installs) || entry.installs < 0) {
    fail(where, 'installs 必须是非负数字');
  }
  if (!isIsoDate(entry.updatedAt)) fail(where, 'updatedAt 必须是 ISO 时间字符串');
  if (isText(entry.id)) {
    const expectedFile = 'templates/' + entry.id + '.json';
    if (entry.file !== expectedFile) fail(where, 'file 必须与 id 对应：' + expectedFile + '，当前：' + entry.file);
  }
}

function checkTemplateFile(where, template, entry) {
  if (!isObject(template)) return fail(where, '必须是对象');
  if (template.schema !== 1) fail(where, 'schema 必须是 1');
  if (template.id !== entry.id) fail(where, 'id 与 index.json 不一致（' + template.id + ' vs ' + entry.id + '）');
  for (const key of ['name', 'en', 'tagline', 'author', 'accent', 'cls', 'templateId']) requireText(where, template, key);
  for (const key of ['name', 'en', 'tagline', 'author', 'accent', 'cls']) {
    if (isText(template[key]) && template[key] !== entry[key]) {
      fail(where, key + ' 与 index.json 不一致（' + template[key] + ' vs ' + entry[key] + '）');
    }
  }
  if (isText(template.templateId) && !/^[a-z0-9][a-z0-9-]{1,59}$/i.test(template.templateId)) {
    fail(where, 'templateId 只能是小写字母/数字/连字符');
  }
  requireTags(where, template);
  if (!isIsoDate(template.createdAt)) fail(where, 'createdAt 必须是 ISO 时间字符串');
  checkCss(where, template.css, entry.cls);
  checkSample(where, template.sample);
}

async function main() {
  let index;
  try {
    index = await readJson(INDEX_FILE, 'market/index.json');
  } catch (error) {
    console.error('✗ 读不到 market/index.json：' + error.message);
    console.error('  先跑 node market/build.mjs 生成内容。');
    process.exit(1);
  }
  if (!isObject(index)) {
    console.error('✗ market/index.json 不是对象');
    process.exit(1);
  }
  if (index.schema !== 1) fail('market/index.json', 'schema 必须是 1');
  if (!isIsoDate(index.updatedAt)) fail('market/index.json', 'updatedAt 必须是 ISO 时间字符串');
  if (!Array.isArray(index.templates)) {
    console.error('✗ market/index.json 缺少 templates 数组');
    process.exit(1);
  }
  if (!index.templates.length) fail('market/index.json', 'templates 不能为空');

  const seenIds = new Set();
  index.templates.forEach((entry, index0) => {
    const where = 'index.templates[' + index0 + ']';
    checkIndexEntry(where, entry);
    if (isText(entry.id)) {
      if (seenIds.has(entry.id)) fail(where, 'id 重复：' + entry.id);
      seenIds.add(entry.id);
    }
  });

  const files = (await readdir(TEMPLATES_DIR).catch(() => []))
    .filter((name) => name.endsWith('.json'))
    .sort();
  if (!files.length) fail('market/templates/', '目录里没有 .json 模板文件');
  const indexedFiles = new Set(index.templates.map((entry) => (isText(entry.file) ? entry.file.split('/').pop() : '')));
  for (const name of files) {
    if (!indexedFiles.has(name)) fail('market/templates/' + name, '文件没有被 index.json 引用');
  }

  for (const entry of index.templates) {
    if (!isObject(entry) || !isText(entry.id)) continue;
    const where = 'market/templates/' + entry.id + '.json';
    let template;
    try {
      template = await readJson(join(TEMPLATES_DIR, entry.id + '.json'), where);
    } catch (error) {
      fail(where, '读不到文件（index 里引用了它）：' + error.message);
      continue;
    }
    checkTemplateFile(where, template, entry);
  }

  for (const warning of warnings) console.warn('! ' + warning);
  if (errors.length) {
    for (const error of errors) console.error('✗ ' + error);
    console.error('\n✗ 公共市场校验失败：' + errors.length + ' 个问题');
    process.exit(1);
  }
  console.log('✓ market/index.json：' + index.templates.length + ' 个模板，updatedAt ' + index.updatedAt);
  for (const entry of index.templates) {
    console.log('✓ ' + entry.file + '（' + entry.name + ' · ' + entry.cls + ' · by ' + entry.author + '）');
  }
  console.log('\n✓ 公共市场校验通过（' + index.templates.length + ' 个模板，' + checkedFiles.length + ' 个文件）');
}

main().catch((error) => {
  console.error('✗ 校验脚本自身出错：' + (error && error.stack ? error.stack : error));
  process.exit(1);
});
