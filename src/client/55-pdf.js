/**
 * 在浏览器里把简历纸面渲染成真正的 PDF 文件。
 *
 * 为什么不叫 Host 起浏览器：这台机器上 DSH 沙箱不允许 Edge/Chrome 无头进程正常
 * 打印，Host 里也没有 Electron 的 printToPDF（Host 是独立 Node 进程）。所以 PDF
 * 改成前端生成：把预览用的 HTML 塞进 SVG foreignObject，画到 2 倍分辨率画布，
 * 再按 A4 页高切片、包成多页 PDF，最后让 Host 把字节写到导出目录 —— 用户
 * 点「导出 PDF」就能直接拿到文件，不需要打印对话框。
 *
 * 多页：简历内容超过一页时，先量出纸张实际高度，再按 A4 页高逐页切片，
 * 不再像旧版那样把超出部分直接裁掉。
 *
 * 代价是 PDF 里的文字是图片（不可选中），换来的是和预览完全一致的观感，且不依赖
 * 任何外部程序。
 */

/**
 * 把若干页 JPEG 包成 A4 PDF（字节数组）。
 *
 * 兼容旧调用：`rmBuildPdf(jpegDataUrl, width, height)` 生成单页；
 * 新调用：`rmBuildPdf([{ jpeg, width, height }, ...])` 生成多页。
 * @param {string|Array} pageInput
 * @param {number} [width]
 * @param {number} [height]
 * @returns {Uint8Array}
 */
function rmBuildPdf(pageInput, width, height) {
  const inputs = Array.isArray(pageInput) ? pageInput : [{ jpeg: pageInput, width: width, height: height }];
  const pages = inputs.map(function (item) {
    const dataUrl = typeof item === 'string' ? item : item && item.jpeg;
    const imageWidth = Number((item && item.width) || width) || 0;
    const imageHeight = Number((item && item.height) || height) || 0;
    const comma = dataUrl.indexOf(',');
    const binary = atob(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    const imageBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) imageBytes[i] = binary.charCodeAt(i);
    return { imageBytes: imageBytes, width: imageWidth, height: imageHeight };
  });
  if (!pages.length) throw new Error('pdf/no-pages');

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const chunks = [];
  const offsets = [0];
  let length = 0;

  const pushText = (text) => {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
    chunks.push(bytes);
    length += bytes.length;
    return bytes;
  };
  const pushBytes = (bytes) => {
    chunks.push(bytes);
    length += bytes.length;
  };
  const startObject = (num, dict) => {
    offsets[num] = length;
    pushText(num + ' 0 obj\n' + dict + '\n');
  };

  const pageCount = pages.length;
  const totalObjects = 2 + pageCount * 3;
  const kids = [];
  for (let i = 0; i < pageCount; i += 1) kids.push(3 + i * 3 + ' 0 R');

  pushText('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
  startObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  startObject(2, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pageCount + ' >>');

  for (let i = 0; i < pageCount; i += 1) {
    const page = pages[i];
    const pageNum = 3 + i * 3;
    const imageNum = pageNum + 1;
    const contentNum = pageNum + 2;
    startObject(
      pageNum,
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageWidth + ' ' + pageHeight +
        '] /Resources << /XObject << /Im' + i + ' ' + imageNum + ' 0 R >> >> /Contents ' + contentNum + ' 0 R >>',
    );
    startObject(
      imageNum,
      '<< /Type /XObject /Subtype /Image /Width ' + page.width + ' /Height ' + page.height +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + page.imageBytes.length + ' >>',
    );
    pushText('stream\n');
    pushBytes(page.imageBytes);
    pushText('\nendstream\nendobj\n');

    const content = 'q\n' + pageWidth + ' 0 0 ' + pageHeight + ' 0 0 cm\n/Im' + i + ' Do\nQ\n';
    startObject(contentNum, '<< /Length ' + content.length + ' >>');
    pushText('stream\n' + content + 'endstream\nendobj\n');
  }

  const xrefAt = length;
  let xref = 'xref\n0 ' + (totalObjects + 1) + '\n0000000000 65535 f \n';
  for (let i = 1; i <= totalObjects; i += 1) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pushText(xref);
  pushText('trailer\n<< /Size ' + (totalObjects + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefAt + '\n%%EOF\n');

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

function rmBytesToBase64(bytes) {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function rmLoadImage(src) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    img.onload = function () {
      resolve(img);
    };
    img.onerror = function () {
      reject(new Error('pdf/image-failed'));
    };
    img.src = src;
  });
}

/** 等一张图加载完（照片是内嵌 dataURL，通常已经缓存，只需兜底）。 */
function rmImageReady(src) {
  return new Promise(function (resolve) {
    if (!src) return resolve();
    const img = new Image();
    let done = false;
    const finish = function () {
      if (done) return;
      done = true;
      resolve();
    };
    img.onload = finish;
    img.onerror = finish;
    img.src = src;
    if (img.complete) finish();
  });
}

/**
 * 在真实 DOM 里量出这张 A4 纸的实际内容高度（可能超过一页）。
 * 用一个不可见容器承载同样的 CSS + HTML，量完即删。
 * @returns {Promise<number>}
 */
async function rmMeasurePaperHeight(parts, paperClass) {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:absolute;left:-100000px;top:0;width:' + PAPER_W + 'px;visibility:hidden;pointer-events:none;';
  const style = document.createElement('style');
  style.textContent = parts.css;
  const paper = document.createElement('div');
  paper.className = 'rm-doc rm-paper ' + paperClass;
  paper.innerHTML = parts.html;
  host.appendChild(style);
  host.appendChild(paper);
  document.body.appendChild(host);
  try {
    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch (error) {
        /* 字体没加载完也继续，只是可能差几像素 */
      }
    }
    const images = paper.querySelectorAll('img');
    for (let i = 0; i < images.length; i += 1) {
      await rmImageReady(images[i].getAttribute('src'));
    }
    await new Promise(function (resolve) {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { resolve(); });
      else setTimeout(resolve, 16);
    });
    const rect = paper.getBoundingClientRect ? paper.getBoundingClientRect() : { height: 0 };
    return Math.max(PAPER_H, Math.ceil(paper.scrollHeight || 0), Math.ceil(rect.height || 0));
  } finally {
    if (host.parentNode) host.parentNode.removeChild(host);
  }
}

/**
 * 把简历渲染成 PDF 的 base64（不含 dataURL 前缀）。
 * 内容超过一页时自动切成多页，不再裁切。
 * @returns {Promise<string>}
 */
async function rmPdfBase64(resume, template) {
  const parts = buildPreviewParts(resume, template);
  const paperClass = templateClass(template);
  const contentHeight = await rmMeasurePaperHeight(parts, paperClass);
  const maxPages = 8;
  const pageCount = Math.max(1, Math.min(maxPages, Math.ceil(contentHeight / PAPER_H)));
  const documentHeight = pageCount * PAPER_H;

  const doc = document.implementation.createHTMLDocument('resume-pdf');
  const root = doc.createElement('div');
  root.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  const style = doc.createElement('style');
  style.textContent = parts.css;
  root.appendChild(style);
  const paper = doc.createElement('div');
  paper.className = 'rm-doc rm-paper ' + paperClass;
  paper.innerHTML = parts.html;
  root.appendChild(paper);
  const xhtml = new XMLSerializer().serializeToString(root);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + PAPER_W + '" height="' + documentHeight + '">' +
    '<foreignObject width="' + PAPER_W + '" height="' + documentHeight + '">' + xhtml + '</foreignObject></svg>';
  const img = await rmLoadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));

  // 画布高度有上限（Chrome/Electron 约 16000px），页多时降一点分辨率。
  const maxCanvasSide = 16000;
  const scale = Math.max(1.25, Math.min(2, maxCanvasSide / documentHeight));
  const pageWidthPx = Math.round(PAPER_W * scale);
  const pageHeightPx = Math.round(PAPER_H * scale);
  const canvas = document.createElement('canvas');
  canvas.width = pageWidthPx;
  canvas.height = Math.round(documentHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('pdf/no-canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const pages = [];
  for (let page = 0; page < pageCount; page += 1) {
    const slice = document.createElement('canvas');
    slice.width = pageWidthPx;
    slice.height = pageHeightPx;
    const sliceCtx = slice.getContext('2d');
    if (!sliceCtx) throw new Error('pdf/no-canvas');
    sliceCtx.fillStyle = '#ffffff';
    sliceCtx.fillRect(0, 0, pageWidthPx, pageHeightPx);
    sliceCtx.drawImage(canvas, 0, page * pageHeightPx, pageWidthPx, pageHeightPx, 0, 0, pageWidthPx, pageHeightPx);
    pages.push({ jpeg: slice.toDataURL('image/jpeg', 0.92), width: pageWidthPx, height: pageHeightPx });
  }
  return rmBytesToBase64(rmBuildPdf(pages));
}

/**
 * 把模板 + 示例数据渲染成一张 A4 预览 PNG（dataURL），给「投稿 Issue」当预览图。
 * 和 PDF 同一条 foreignObject → canvas 路径，只是单页、1.5 倍分辨率。
 * @returns {Promise<string>}
 */
async function rmPreviewPng(template, resume, scale) {
  const parts = buildPreviewParts(resume, template);
  const paperClass = templateClass(template);
  const doc = document.implementation.createHTMLDocument('template-preview');
  const root = doc.createElement('div');
  root.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  const style = doc.createElement('style');
  style.textContent = parts.css;
  root.appendChild(style);
  const paper = doc.createElement('div');
  paper.className = 'rm-doc rm-paper ' + paperClass;
  paper.innerHTML = parts.html;
  root.appendChild(paper);
  const xhtml = new XMLSerializer().serializeToString(root);
  const factor = Number(scale) > 0 ? Number(scale) : 1.5;
  const width = Math.round(PAPER_W * factor);
  const height = Math.round(PAPER_H * factor);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
    '<foreignObject width="' + width + '" height="' + height + '">' +
    xhtml +
    '</foreignObject></svg>';
  const img = await rmLoadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('preview/no-canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}
