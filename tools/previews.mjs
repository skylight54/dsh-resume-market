/**
 * 生成 6 套内置模板 + 3 套市场模板的静态预览，便于在浏览器里肉眼检查排版。
 * 运行：node tools/previews.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMPLATES, DEMO_RESUME_DATA, SECTION_ORDER, buildHtml, templateClass, normalizeData } from '../src/shared/doc.js';
import { seedMarket } from '../src/seed.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'previews');
await mkdir(outDir, { recursive: true });

const resume = {
  id: 'preview',
  title: '林知夏 · 高级产品经理',
  templateId: 'business-minimal',
  lang: 'zh',
  sections: SECTION_ORDER.slice(),
  data: DEMO_RESUME_DATA,
};

const index = [];
for (const tpl of TEMPLATES) {
  const html = buildHtml({ ...resume, templateId: tpl.id }, tpl);
  const file = tpl.id + '.html';
  await writeFile(join(outDir, file), html, 'utf-8');
  index.push({ id: tpl.id, name: tpl.name, file, accent: tpl.accent });
}
for (const entry of seedMarket()) {
  const tpl = { id: entry.templateId, cls: entry.cls, css: entry.css, name: entry.name, en: entry.en };
  const data = normalizeData(entry.sample || DEMO_RESUME_DATA);
  const html = buildHtml({ ...resume, templateId: entry.templateId, data }, tpl);
  const file = entry.id + '.html';
  await writeFile(join(outDir, file), html, 'utf-8');
  index.push({ id: entry.id, name: entry.name, file, accent: entry.accent });
}

const gallery = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>简历模板预览 · Resume Market</title>
<style>
body{margin:0;padding:40px;background:#eef1f5;font:14px/1.6 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#1f2328}
h1{font-size:22px;letter-spacing:.08em;margin:0 0 6px}
p.sub{margin:0 0 28px;color:#6b7280}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:22px}
.card{background:#fff;border:1px solid #dfe3e8;border-radius:12px;padding:16px;box-shadow:0 2px 10px rgba(15,23,42,.06)}
.card h2{font-size:15px;margin:0 0 4px}
.card .bar{height:4px;border-radius:2px;margin:0 0 12px}
.card a{display:inline-block;font-size:12.5px;color:#2f6fde;text-decoration:none;border:1px solid #cbd5e1;background:#f8fafc;border-radius:7px;padding:4px 10px}
.card a:hover{border-color:#2f6fde}
</style></head><body>
<h1>简历模板预览</h1>
<p class="sub">9 套模板 · 点开即 A4 打印版（Ctrl/Cmd + P 可存 PDF）</p>
<div class="grid">
${index.map((t) => `<div class="card"><div class="bar" style="background:${t.accent}"></div><h2>${t.name}</h2><a href="./${t.file}">打开预览</a></div>`).join('\n')}
</div></body></html>`;
await writeFile(join(outDir, 'index.html'), gallery, 'utf-8');

console.log('✅ previews:', index.length, 'files + index.html ->', outDir);
for (const t of index) console.log(' -', t.file, templateClass(TEMPLATES.find((x) => x.id === t.id) || {}) || t.id);
