/**
 * 把简历导出成真正落盘的文件：HTML / Word(.doc) / PDF。
 *
 * 为什么不靠浏览器下载：DSH 是 Electron 壳，面板里 window.open + Content-Disposition
 * 不一定触发下载（会被吞掉），用户点完「导出」找不到文件。由 Host 直接写文件、
 * 再把完整路径告诉面板，最稳。
 *
 * PDF 也不靠「打印对话框」：直接用本机 Chrome / Edge 的无头打印把 HTML 转成 PDF，
 * 用户点一下就拿到文件，不用在对话框里再选「另存为 PDF」。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildHtml, buildWordHtml } from './shared/doc.js';

const requireFromHere = createRequire(import.meta.url);

export const EXPORT_FORMATS = ['html', 'doc', 'pdf'];

const FORMAT_EXT = { html: 'html', doc: 'doc', pdf: 'pdf' };
const FORMAT_LABEL = { html: 'HTML', doc: 'Word 文档', pdf: 'PDF' };
const PDF_TIMEOUT_MS = 60 * 1000;

/** 最近一次 Electron 打印失败的原因，用于把真实错误带回面板。 */
let lastElectronPdfError = '';

export function exportsDir() {
  return join(homedir(), '.dsh', 'resume-market', 'exports');
}

export function formatLabel(format) {
  return FORMAT_LABEL[format] || String(format || '');
}

/**
 * 把面板/工具传来的格式收敛成 html|doc|pdf。
 * 认不出来的返回 null，由调用方报 400（而不是悄悄导成 html）。
 */
export function resolveFormat(raw) {
  const value = String(raw == null ? '' : raw)
    .trim()
    .toLowerCase()
    .replace(/^\./, '');
  if (!value) return 'html';
  if (value === 'htm' || value === 'html') return 'html';
  if (value === 'word' || value === 'doc' || value === 'docx' || value === 'msword') return 'doc';
  if (value === 'pdf') return 'pdf';
  return null;
}

function makeError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

/** 文件名里不能带 Windows 保留字符，留个能认出来的名字就够了。 */
export function safeFileName(input, ext) {
  const raw = String(input || '')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  const base = raw || 'resume';
  return ext ? base + '.' + ext : base;
}

function unusedPath(dir, name, ext) {
  const base = name;
  let target = join(dir, base + '.' + ext);
  for (let i = 2; i <= 99 && existsSync(target); i += 1) {
    target = join(dir, base + '-' + i + '.' + ext);
  }
  return target;
}

const BROWSER_CANDIDATES = [
  process.env.RM_BROWSER_PATH,
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

/** 找本机可用的 Chrome/Edge（无头转 PDF 用）。找不到返回 null。 */
export function findBrowser() {
  for (const candidate of BROWSER_CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

function runToExit(command, args, timeoutMs) {
  return new Promise((resolvePromise) => {
    let stderr = '';
    let settled = false;
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    const finish = (code, timedOut) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ code, timedOut: !!timedOut, stderr });
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch (error) {
        void error;
      }
      finish(-1, true);
    }, timeoutMs);
    child.on('error', (error) => {
      stderr += String((error && error.message) || error);
      finish(-2, false);
    });
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
        if (stderr.length > 4000) stderr = stderr.slice(-4000);
      });
    }
    child.on('close', (code) => finish(typeof code === 'number' ? code : -3, false));
  });
}

/**
 * 首选：用 DSH 自己的 Electron Chromium 打印（printToPDF）。
 * 插件就跑在 Electron 主进程里，这条路不需要另起浏览器进程，沙箱环境下也能出 PDF。
 * 失败返回 false，交给下面的外部浏览器兜底。
 */
async function electronToPdf(html, targetPath) {
  if (!process.versions || !process.versions.electron) return false;
  let electron;
  try {
    electron = requireFromHere('electron');
  } catch (error) {
    void error;
    return false;
  }
  if (!electron || typeof electron.BrowserWindow !== 'function') return false;
  const workDir = await mkdtemp(join(tmpdir(), 'resume-market-pdf-'));
  const htmlPath = join(workDir, 'resume.html');
  let win;
  try {
    await writeFile(htmlPath, html, 'utf8');
    win = new electron.BrowserWindow({
      show: false,
      width: 794,
      height: 1123,
      webPreferences: { sandbox: true, contextIsolation: true, javascript: false },
    });
    await win.loadFile(htmlPath);
    const buffer = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    if (!buffer || buffer.length < 800) return false;
    await writeFile(targetPath, buffer);
    return true;
  } catch (error) {
    lastElectronPdfError = (error && (error.message || String(error))) || '';
    return false;
  } finally {
    if (win) {
      try {
        win.destroy();
      } catch (error) {
        void error;
      }
    }
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * 兜底：用无头 Chrome/Edge 把 HTML 打成 PDF。
 * 不打页眉页脚、无头模式、独立临时 profile（避免和用户正在开的浏览器抢锁）。
 */
async function writePdf(html, targetPath) {
  if (await electronToPdf(html, targetPath)) return;
  const browser = findBrowser();
  if (!browser) {
    throw makeError(
      'export/no-browser',
      '暂时没能生成 PDF。可以改用「导出 HTML / Word」，或安装 Edge 后在设置里用 RM_BROWSER_PATH 指定浏览器路径。',
      501,
    );
  }
  const workDir = await mkdtemp(join(tmpdir(), 'resume-market-pdf-'));
  const htmlPath = join(workDir, 'resume.html');
  const profileDir = join(workDir, 'profile');
  try {
    await mkdir(profileDir, { recursive: true });
    await writeFile(htmlPath, html, 'utf8');
    let result;
    try {
      result = await runToExit(
        browser,
        [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--user-data-dir=' + profileDir,
        '--no-pdf-header-footer',
        '--print-to-pdf-no-header',
        '--virtual-time-budget=3000',
          '--print-to-pdf=' + targetPath,
          pathToFileURL(htmlPath).href,
        ],
        PDF_TIMEOUT_MS,
      );
    } catch (error) {
      throw makeError(
        'export/pdf-failed',
        '暂时没能生成 PDF（' + ((error && (error.message || String(error))) || '浏览器启动失败') + '）。可以先用「导出 HTML」或「导出 Word」。',
        502,
      );
    }
    let size = 0;
    try {
      size = (await stat(targetPath)).size;
    } catch (error) {
      void error;
    }
    if (size > 800) return;
    const detail = (result.stderr || '').trim().split(/\r?\n/).slice(-3).join(' ');
    throw makeError(
      'export/pdf-failed',
      '没能生成 PDF（Electron：' + (lastElectronPdfError || '不可用') + '；浏览器 exit ' + result.code + (result.timedOut ? '，超时' : '') + '）' + (detail ? '：' + detail : '') + '。可以先用「导出 HTML」或「导出 Word」。',
      502,
    );
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * 保存前端渲染好的 PDF 字节（面板「导出 PDF」走这条路）。
 * @param {{data: string, name?: string}} payload data 是 base64 的 PDF
 */
export async function saveRenderedPdf(payload) {
  const buffer = Buffer.from(String((payload && payload.data) || ''), 'base64');
  if (buffer.length < 800) throw makeError('export/bad-pdf', 'PDF 数据不完整，请重试', 400);
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw makeError('export/bad-pdf', '收到的数据不是 PDF', 400);
  }
  const dir = exportsDir();
  await mkdir(dir, { recursive: true });
  const base = safeFileName((payload && payload.name) || 'resume');
  const target = unusedPath(dir, base, 'pdf');
  await writeFile(target, buffer);
  return { path: target, name: basename(target), dir, format: 'pdf' };
}

/**
 * 写一份导出文件。
 * @param {{format?: 'html'|'doc'|'pdf', autoPrint?: boolean}} options
 * @returns {Promise<{path:string,name:string,dir:string,format:string}>}
 */
export async function writeResumeExport(resume, template, options = {}) {
  const format = resolveFormat(options.format) || 'html';
  const dir = exportsDir();
  await mkdir(dir, { recursive: true });
  const data = (resume && resume.data) || {};
  const base = safeFileName((data.basics && data.basics.name) || (resume && resume.title) || 'resume');
  const ext = FORMAT_EXT[format];
  const target = unusedPath(dir, base, ext);

  if (format === 'html') {
    const html = buildHtml(resume, template, { autoPrint: options.autoPrint === true });
    await writeFile(target, html, 'utf8');
  } else if (format === 'doc') {
    await writeFile(target, buildWordHtml(resume, template), 'utf8');
  } else {
    await writePdf(buildHtml(resume, template, {}), target);
  }

  return { path: target, name: basename(target), dir, format };
}

function openWith(command, args) {
  return new Promise((resolvePromise, reject) => {
    try {
      const child = spawn(command, args, { detached: true, stdio: 'ignore' });
      child.on('error', reject);
      child.unref();
      resolvePromise();
    } catch (error) {
      reject(error);
    }
  });
}

/** 只允许打开导出目录里的文件，避免面板传个任意路径把别的文件夹弹出来。 */
export function assertInsideExports(targetPath) {
  const base = resolve(exportsDir());
  const resolved = resolve(String(targetPath || ''));
  const rel = relative(base, resolved);
  if (!resolved || isAbsolute(rel) || rel.startsWith('..') || rel.split(sep).includes('..')) {
    const error = new Error('只能打开导出目录里的文件');
    error.code = 'export/forbidden';
    error.status = 403;
    throw error;
  }
  return resolved;
}

/** 在系统文件管理器里选中这个文件（Windows 用 explorer /select,）。 */
export async function revealExport(targetPath) {
  const resolved = assertInsideExports(targetPath);
  if (process.platform === 'win32') {
    await openWith('explorer.exe', ['/select,' + resolved]);
  } else if (process.platform === 'darwin') {
    await openWith('open', ['-R', resolved]);
  } else {
    await openWith('xdg-open', [dirname(resolved)]);
  }
  return { dir: dirname(resolved) };
}
