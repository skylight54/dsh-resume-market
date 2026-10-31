/**
 * 包形状自检：不启动 DSH，只校验「能被 DSH 当插件装上」的必要条件。
 *
 * 运行：node tools/check.mjs
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const warn = (msg) => problems.push('✗ ' + msg);

const read = (rel) => readFile(join(root, rel), 'utf8');
const exists = async (rel) => {
  try {
    await stat(join(root, rel));
    return true;
  } catch {
    return false;
  }
};

// 1) package.json
const pkg = JSON.parse(await read('package.json'));
if (!pkg.name) warn('package.json 缺少 name');
if (pkg.type !== 'module') warn('package.json type 必须是 module');
if (!pkg.exports || !pkg.exports['.']) warn('exports 缺少 "."');
if (!pkg.exports || !pkg.exports['./client']) warn('exports 缺少 "./client"');
if (!pkg.exports || !pkg.exports['./icon']) warn('exports 缺少 "./icon"');
if (!pkg.dsh || !pkg.dsh.bundle || !pkg.dsh.bundle.patch) warn('package.json 缺少 dsh.bundle.patch');
if (!pkg.dsh || !pkg.dsh.client || pkg.dsh.client.platform !== 'web') warn('package.json 缺少 dsh.client.platform=web');
if (!Array.isArray(pkg.dsh && pkg.dsh.client && pkg.dsh.client.inject)) warn('dsh.client.inject 必须是数组');
if (!Array.isArray(pkg.files) || !pkg.files.length) warn('package.json 缺少 files 列表');
if (pkg.name !== 'dsh-plugin-resume-market') warn('包名与 cordis.patch.yml / 预期不一致：' + pkg.name);

// files 里提到的路径必须真实存在（目录/文件都算）
for (const item of pkg.files || []) {
  if (item === 'package.json' || item === 'README.md') continue;
  if (!(await exists(item))) warn('files 中的 ' + item + ' 不存在');
}

// 2) 入口 / 客户端产物
const entry = pkg.exports['.'];
const client = pkg.exports['./client'];
if (!(await exists(entry))) warn('Host 入口不存在：' + entry);
if (!(await exists(client))) warn('client 产物不存在：' + client + '（先跑 node build/build.mjs）');

const entrySrc = await read(entry);
for (const name of ['export function apply', 'export const name', 'export const inject']) {
  if (!entrySrc.includes(name)) warn('Host 入口缺少 ' + name);
}
if (/export\s+default/.test(entrySrc)) warn('Host 入口不允许 export default');

const clientSrc = await read(client);
if (!clientSrc.includes('window.__ModuleLoader__.load(')) warn('client 产物缺少 __ModuleLoader__.load');
if (!clientSrc.includes('factory(require)')) warn('client 产物缺少 factory(require)');
if (!clientSrc.includes('module.exports.apply =')) warn('client 产物缺少 module.exports.apply');
if (!clientSrc.includes('module.exports.inject =')) warn('client 产物缺少 module.exports.inject');
if (!clientSrc.includes(JSON.stringify(pkg.name))) warn('client 产物里的 id 与包名不一致');

const metaPath = client.replace(/client\.js$/, 'client.meta.json');
if (!(await exists(metaPath))) warn('缺少 ' + metaPath);
else {
  const meta = JSON.parse(await read(metaPath));
  if (!Array.isArray(meta.files) || !meta.files.length) warn('client.meta.json 缺少 files');
}

// 3) cordis.patch.yml：必须 insert 本插件 id + 包名
const patch = await read(pkg.dsh.bundle.patch);
if (!/insert:/.test(patch)) warn('cordis.patch.yml 缺少 insert');
if (!patch.includes(pkg.name)) warn('cordis.patch.yml 缺少包名 ' + pkg.name);
if (!/id:\s*resume-market/.test(patch)) warn('cordis.patch.yml 缺少 id: resume-market');

// 4) locale：meta.title / meta.description
for (const lang of ['zh', 'en']) {
  const rel = `locale/${lang}.json`;
  if (!(await exists(rel))) {
    warn('缺少 ' + rel);
    continue;
  }
  const loc = JSON.parse(await read(rel));
  if (!loc.meta || !loc.meta.title || !loc.meta.description) warn(rel + ' 缺少 meta.title/description');
}

// 5) 图标：包内、体积受限
const iconRel = pkg.exports['./icon'].replace(/^\.\//, '');
if (!(await exists(iconRel))) warn('图标不存在：' + iconRel);
else {
  const size = (await stat(join(root, iconRel))).size;
  if (size > 256 * 1024) warn('图标超过 256KiB：' + size);
  if (!/\.(svg|png|jpe?g|webp)$/i.test(iconRel)) warn('图标格式不支持：' + iconRel);
}

// 6) 源码结构提示（非致命）
for (const rel of ['src/index.js', 'src/routes.js', 'src/tools.js', 'src/store.js', 'src/seed.js', 'src/shared/doc.js', 'build/build.mjs']) {
  if (!(await exists(rel))) warn('缺少源文件 ' + rel);
}

// 7) 意外残留（临时文件）
for (const name of await readdir(root)) {
  if (name.startsWith('.tmp-') || name.endsWith('.py')) warn('残留临时文件：' + name);
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n检查失败：${problems.length} 项`);
  process.exitCode = 1;
} else {
  console.log('✓ 包形状检查通过：exports / dsh.bundle / dsh.client / locale / icon / patch / 客户端产物都符合要求');
}
