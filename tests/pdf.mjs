/**
 * Resume Market — client-side PDF writer test.
 *
 * Loads lib/client.js the way the Web host does, applies it against a fake
 * client ctx, then exercises the pure PDF builder (no canvas, no DOM needed).
 * The builder turns a JPEG into a one-page A4 PDF; this checks the structure so
 * a broken xref/stream cannot ship silently.
 *
 * Run: node tests/pdf.mjs
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const localRequire = createRequire(join(root, '.devrender', 'package.json'));
const React = localRequire('react');

const code = await readFile(join(root, 'lib', 'client.js'), 'utf8');

let loaded = null;
const fakeWindow = {
  __ModuleLoader__: {
    load(entry) {
      loaded = entry;
    },
  },
};
const requireShim = (name) => {
  if (name === 'react' || name === 'react/jsx-runtime') return React;
  throw new Error('client bundle required unexpected module: ' + name);
};

const run = new Function('window', 'require', 'navigator', 'location', 'document', code);
run(fakeWindow, requireShim, { language: 'zh-CN' }, { hash: '' }, { createElement: () => ({}) });

const mod = loaded.factory(requireShim);
const fakeCtx = {
  effect(fn) {
    const dispose = fn();
    if (typeof dispose === 'function') dispose();
  },
  locale: { register: () => ({}) },
  slots: { inject: (_name, fn) => fn(), register: () => () => {} },
  layout: { selectPanel: () => {} },
};
mod.apply(fakeCtx);

if (!fakeWindow.__resumeMarket || typeof fakeWindow.__resumeMarket.buildPdf !== 'function') {
  throw new Error('window.__resumeMarket.buildPdf missing');
}

// 1x1 white JPEG.
const jpeg =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDs0NDT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

const bytes = fakeWindow.__resumeMarket.buildPdf('data:image/jpeg;base64,' + jpeg, 1588, 2245);
if (!(bytes instanceof Uint8Array)) throw new Error('buildPdf did not return bytes');
const text = Buffer.from(bytes).toString('latin1');
if (!text.startsWith('%PDF-1.4')) throw new Error('pdf header missing');
if (!text.endsWith('%%EOF\n')) throw new Error('pdf trailer missing');
if (!text.includes('/DCTDecode')) throw new Error('image filter missing');
if (!text.includes('/MediaBox [0 0 595.28 841.89]')) throw new Error('A4 mediabox missing');
if (!text.includes('stream\n')) throw new Error('content stream missing');

// xref offsets must point at "<n> 0 obj".
const xref = text.slice(text.lastIndexOf('\nxref\n') + 1);
const lines = xref.split('\n').filter((line) => /^\d{10} \d{5} [nf] $/.test(line));
if (lines.length !== 6) throw new Error('unexpected xref entries: ' + lines.length);
for (let i = 1; i < 6; i += 1) {
  const offset = Number(lines[i].slice(0, 10));
  if (!text.startsWith(i + ' 0 obj', offset)) {
    throw new Error('xref offset for object ' + i + ' is wrong: ' + offset);
  }
}

console.log('pdf ok:', { bytes: bytes.length, objects: 5, page: 'A4' });
