#!/usr/bin/env node
/**
 * 样例简历图 → 风格识别 → 生成模板预览
 *
 * 用法：
 *   node tools/analyze-samples.mjs "C:/Users/你/Desktop/test"
 *   node tools/analyze-samples.mjs "C:/path/a.png" "C:/path/b.png"
 *
 * 做什么：
 * 1. 纯 JS 解码 PNG（8bit，RGB/RGBA，非隔行）；
 * 2. 调用客户端里的 rmAnalyzePixels(pixels) 做风格识别；
 * 3. rmStyleFromAnalysis → style，rmStyleToCss → CSS；
 * 4. 用 buildHtml 生成预览到 previews/samples/<文件名>.html，并在终端打印识别结果表。
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { basename, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/** 解码 8bit RGB/RGBA 非隔行 PNG。返回 { width, height, data: RGBA Buffer }。 */
function decodePng(buffer) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (buffer[i] !== sig[i]) throw new Error('不是 PNG 文件');
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  let bitDepth = 8;
  let interlace = 0;
  const idat = [];
  while (pos < buffer.length) {
    const len = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
      if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error('只支持 8bit RGB/RGBA 非隔行 PNG（当前 depth=' + bitDepth + ' type=' + colorType + ' interlace=' + interlace + '）');
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4, 255);
  let prev = Buffer.alloc(stride);
  let off = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[off++];
    const line = Buffer.from(raw.subarray(off, off + stride));
    off += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = value & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      out[dst] = line[src];
      out[dst + 1] = line[src + 1];
      out[dst + 2] = line[src + 2];
      out[dst + 3] = channels === 4 ? line[src + 3] : 255;
    }
    prev = line;
  }
  return { width, height, data: out };
}

/** 在 Node 里加载 lib/client.js，拿 window.__resumeMarket 调试句柄。 */
function loadClient() {
  const code = readFileSync(join(ROOT, 'lib/client.js'), 'utf8');
  let captured = null;
  const fakeWindow = {
    __ModuleLoader__: {
      load(entry) {
        captured = entry;
      },
    },
    addEventListener() {},
    removeEventListener() {},
    matchMedia() {
      return { matches: false, addEventListener() {}, removeEventListener() {} };
    },
  };
  const doc = {
    createElement() {
      return { style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, getContext() { return null; } };
    },
    createElementNS() {
      return { style: {}, setAttribute() {}, appendChild() {} };
    },
    addEventListener() {},
    removeEventListener() {},
    head: { appendChild() {} },
    body: { appendChild() {} },
    querySelector() {
      return null;
    },
  };
  let fakeReact;
  try {
    const req = createRequire(join(ROOT, '.devrender/package.json'));
    fakeReact = req('react');
  } catch (err) {
    throw new Error('需要先安装 .devrender 里的 react：cd .devrender && npm install');
  }
  const fakeRequire = (name) => {
    if (name === 'react') return fakeReact;
    throw new Error('unexpected require: ' + name);
  };
  globalThis.window = fakeWindow;
  globalThis.document = doc;
  globalThis.location = { hash: '' };
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true, writable: true });
  // eslint-disable-next-line no-new-func
  new Function('window', 'require', 'navigator', 'location', 'document', 'globalThis', code)(
    fakeWindow,
    fakeRequire,
    globalThis.navigator,
    globalThis.location,
    doc,
    globalThis,
  );
  if (!captured || !captured.factory) throw new Error('客户端 bundle 没有 __ModuleLoader__.load 调用');
  const mod = captured.factory(fakeRequire);
  const registrations = [];
  const fakeCtx = {
    effect(fn) {
      return typeof fn === 'function' ? fn() : undefined;
    },
    locale: { register() {}, bind() {} },
    slots: {
      inject() {},
      register(...args) {
        registrations.push(args.length === 2 ? { name: args[0].name } : args[0]);
        return { dispose() {} };
      },
    },
    layout: { selectPanel() {} },
  };
  mod.apply(fakeCtx, {});
  return fakeWindow.__resumeMarket;
}

const COLOR_KEYS = ['accent', 'nameColor', 'headingColor', 'bodyColor', 'background', 'bandColor', 'gold'];

function pickStyle(analysis) {
  return analysis && analysis.style ? analysis.style : null;
}

function styleColors(style) {
  const flat = style.colors && typeof style.colors === 'object' ? style.colors : style;
  return COLOR_KEYS.filter((k) => flat[k]).map((k) => k + ':' + flat[k]).join(',');
}

function summarize(handle, analysis) {
  const style = pickStyle(analysis);
  if (!style) return '(未识别到 style)';
  const parts = [];
  parts.push('layout=' + (style.layout || 'single'));
  parts.push('header=' + (style.headerStyle || 'plain') + (style.headerBand ? '+band' : ''));
  parts.push('heading=' + style.headingStyle);
  parts.push('content=' + (style.contentStyle || 'plain'));
  parts.push('font=' + style.fontFamily);
  parts.push('align=' + style.headerAlign);
  parts.push('contactCols=' + style.contactCols);
  parts.push('colors=' + styleColors(style));
  if (analysis.layout) {
    parts.push('bands=' + (analysis.layout.headingBands == null ? '?' : analysis.layout.headingBands));
  }
  return parts.join(' | ');
}

function sampleList(args) {
  if (args.length) {
    return args.map((p) => {
      const abs = resolve(p);
      if (statSync(abs).isDirectory()) {
        return readdirSync(abs)
          .filter((f) => /\.png$/i.test(f))
          .sort()
          .map((f) => join(abs, f));
      }
      return [abs];
    }).flat();
  }
  const def = 'C:/Users/35521/Desktop/test';
  try {
    return readdirSync(def)
      .filter((f) => /\.png$/i.test(f))
      .sort()
      .map((f) => join(def, f));
  } catch (err) {
    return [];
  }
}

function main() {
  const files = sampleList(process.argv.slice(2));
  if (!files.length) {
    console.error('没找到 PNG 样例，请传目录或文件路径');
    process.exit(1);
  }
  const handle = loadClient();
  if (!handle || typeof handle.analyzePixels !== 'function') {
    console.error('客户端还没暴露 analyzePixels（需要 33-template-editor.js 实现 rmAnalyzePixels 并在 70-entry.js 暴露）');
    process.exit(2);
  }
  const outDir = join(ROOT, 'previews/samples');
  mkdirSync(outDir, { recursive: true });
  const rows = [];
  for (const file of files) {
    const buf = readFileSync(file);
    let pixels;
    try {
      pixels = decodePng(buf);
    } catch (err) {
      console.error('[skip] ' + basename(file) + ': ' + err.message);
      continue;
    }
    let analysis;
    try {
      analysis = handle.analyzePixels(pixels);
    } catch (err) {
      console.error('[fail] ' + basename(file) + ': ' + err.message);
      continue;
    }
    const style = pickStyle(analysis);
    const css = style && handle.styleToCss ? handle.styleToCss(style, 'rm-t-sample') : '';
    const html = css && handle.buildHtml
      ? handle.buildHtml(
          {
            lang: 'zh',
            sections: ['summary', 'experience', 'projects', 'education', 'skills', 'awards'],
            data: handle.demoData,
          },
          { id: 'sample', name: '样例生成', cls: 'rm-t-sample', css },
        )
      : '';
    const outName = basename(file).replace(/\.png$/i, '').replace(/[^\w\u4e00-\u9fa5.-]+/g, '_') + '.html';
    if (html) writeFileSync(join(outDir, outName), html, 'utf8');
    rows.push({
      file: basename(file),
      size: pixels.width + 'x' + pixels.height,
      style: summarize(handle, analysis),
      cssRules: (css.match(/\{/g) || []).length,
      preview: html ? 'previews/samples/' + outName : '',
    });
  }
  if (rows.length) {
    const cards = rows
      .map(
        (row) =>
          '<figure class="card"><iframe src="' + encodeURI(row.preview.split('/').pop()) + '" loading="lazy"></iframe>' +
          '<figcaption><b>' + row.file + '</b><span>' + row.style.replace(/\|/g, ' · ') + '</span></figcaption></figure>',
      )
      .join('');
    const gallery =
      '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>样例识别画廊</title><style>' +
      'body{margin:0;padding:28px;background:#f4f6f9;font:14px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#1f2937;}' +
      'h1{font-size:18px;margin:0 0 4px}p.hint{margin:0 0 20px;color:#6b7280;font-size:13px}' +
      '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px}' +
      '.card{margin:0;background:#fff;border:1px solid #e3e7ee;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.06)}' +
      '.card iframe{display:block;width:794px;height:1123px;border:0;transform:scale(.38);transform-origin:top left;}' +
      '.card{width:100%;} .card .frame-wrap{width:100%;height:428px;overflow:hidden}' +
      'figcaption{padding:10px 12px;border-top:1px solid #eef1f6;display:flex;flex-direction:column;gap:2px}' +
      'figcaption b{font-size:13px}figcaption span{font-size:11.5px;color:#6b7280;word-break:break-all}' +
      '</style></head><body><h1>样例识别画廊</h1><p class="hint">由 <code>node tools/analyze-samples.mjs</code> 生成：每张样例图 → 识别风格 → 生成模板预览。</p><div class="grid">' +
      cards.replace(/<iframe /g, '<div class="frame-wrap"><iframe ') +
      '</div></body></html>';
    writeFileSync(join(outDir, 'index.html'), gallery.replace(/<\/iframe>/g, '</iframe></div>'), 'utf8');
  }
  for (const row of rows) {
    console.log('— ' + row.file + ' (' + row.size + ')');
    console.log('  ' + row.style);
    console.log('  css 规则数: ' + row.cssRules + (row.preview ? ' · 预览: ' + row.preview : ''));
  }
  console.log('\n共处理 ' + rows.length + ' 张图');
}

main();
