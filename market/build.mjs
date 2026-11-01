/**
 * 维护者工具：从 src/ 里的现有模板生成 GitHub 公共市场内容。
 *
 * 用法：node market/build.mjs
 *
 * 只读 src/，不改任何源码；生成：
 *   market/index.json            轻量元数据列表（插件读它）
 *   market/templates/<id>.json   单个模板完整内容（css + sample）
 *
 * 为什么用脚本而不是手抄：CSS 必须与 src/ 完全一致（插件用同一套 .rm-* 选择器），
 * 手抄迟早漂移；模板改了以后重跑这个脚本即可同步。
 *
 * 注意：手动改 market/templates/*.json 之后不要再跑本脚本，会被覆盖。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEMO_RESUME_DATA, TEMPLATES, normalizeData } from '../src/shared/doc.js';
import { seedMarket } from '../src/seed.js';

/** 公共市场这一批内容的更新时间（index.json 的 updatedAt，也让构建可复现）。 */
const MARKET_UPDATED_AT = '2026-10-31T12:00:00.000Z';
/** 公共市场示例数据统一用这个虚构号码 + example.com 邮箱，不要放看起来像真人的联系方式。 */
const SAMPLE_PHONE = '138 0013 8000';

const here = dirname(fileURLToPath(import.meta.url));

/** 从 CSS 里取 .rm-t-* 根选择器，保证 cls 和 CSS 永远对得上。 */
function clsOf(css) {
  const match = String(css || '').match(/\.(rm-t-[a-z0-9-]+)\s*\{/);
  if (!match) throw new Error('模板 CSS 里找不到 .rm-t-* 根选择器');
  return match[1];
}

const seed = seedMarket();

function seedEntry(seedId) {
  const found = seed.find((entry) => entry.id === seedId);
  if (!found) throw new Error('src/seed.js 里找不到市场条目 ' + seedId);
  return found;
}

function builtinTemplate(sourceId) {
  const found = TEMPLATES.find((template) => template.id === sourceId);
  if (!found) throw new Error('src/shared/doc.js 的 TEMPLATES 里找不到内置模板 ' + sourceId);
  return found;
}

/** 示例数据去个人化：只把电话换成虚构号码，其余（姓名/公司/经历）保留原样方便对照。 */
function safeSample(sample) {
  const data = JSON.parse(JSON.stringify(sample || {}));
  if (data.basics && data.basics.phone) data.basics.phone = SAMPLE_PHONE;
  return data;
}

/** 从 seed.js 的市场条目导出成公共市场模板（css 原样，示例数据去除真实联系方式）。 */
function fromSeed(seedId, id) {
  const source = seedEntry(seedId);
  return {
    schema: 1,
    id,
    name: source.name,
    en: source.en,
    tagline: source.tagline,
    tags: source.tags.slice(),
    author: source.author,
    accent: source.accent,
    cls: source.cls,
    templateId: source.templateId,
    css: source.css,
    sample: safeSample(source.sample),
    createdAt: source.createdAt,
  };
}

/** 从内置模板导出：CSS 原样，示例数据用内置 demo（林知夏 / 138 0013 8000）。 */
function fromBuiltin(sourceId, id, author) {
  const source = builtinTemplate(sourceId);
  return {
    schema: 1,
    id,
    name: source.name,
    en: source.en,
    tagline: source.tagline,
    tags: source.tags.slice(),
    author,
    accent: source.accent,
    cls: clsOf(source.css),
    templateId: 'mkt-' + id.replace(/^rm-/, ''),
    css: source.css,
    sample: normalizeData(DEMO_RESUME_DATA),
    createdAt: MARKET_UPDATED_AT,
  };
}

const entries = [
  fromSeed('seed-academia', 'rm-academia'),
  fromSeed('seed-finance', 'rm-finance'),
  fromSeed('seed-vibrant', 'rm-vibrant'),
  fromBuiltin('quiet-luxury', 'rm-quiet-luxury', '简历市场'),
  fromBuiltin('tech-grid', 'rm-tech-grid', '简历市场'),
  fromBuiltin('banner-exec', 'rm-banner-exec', '大肥鱼'),
];

const index = {
  schema: 1,
  updatedAt: MARKET_UPDATED_AT,
  templates: entries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    en: entry.en,
    tagline: entry.tagline,
    tags: entry.tags.slice(),
    author: entry.author,
    accent: entry.accent,
    cls: entry.cls,
    templateId: entry.templateId,
    // 内联 css + sample：插件只读一次 index.json 就能渲染真实 A4 缩略图，
    // 不需要为了「看一眼长什么样」再逐个拉模板文件。模板详情接口仍然保留。
    css: entry.css,
    sample: entry.sample,
    file: 'templates/' + entry.id + '.json',
    installs: 0,
    updatedAt: entry.createdAt,
  })),
};

async function writeJson(file, value) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

for (const entry of entries) {
  await writeJson(join(here, 'templates', entry.id + '.json'), entry);
}
await writeJson(join(here, 'index.json'), index);

console.log('✓ 已生成 market/index.json 与 ' + entries.length + ' 份 market/templates/*.json');
for (const entry of entries) {
  console.log('  - ' + entry.id + '（' + entry.name + ' · ' + entry.cls + '）');
}
