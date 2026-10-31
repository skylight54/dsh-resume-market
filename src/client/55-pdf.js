/**
 * 在浏览器里把简历纸面渲染成真正的 PDF 文件。
 *
 * 为什么不叫 Host 起浏览器：这台机器上 DSH 沙箱不允许 Edge/Chrome 无头进程正常
 * 打印，Host 里也没有 Electron 的 printToPDF（Host 是独立 Node 进程）。所以 PDF
 * 改成前端生成：把预览用的 HTML 塞进 SVG foreignObject，画到 2 倍分辨率画布，
 * 再包成一张 A4 页面、内嵌 JPEG 的 PDF，最后让 Host 把字节写到导出目录 —— 用户
 * 点「导出 PDF」就能直接拿到文件，不需要打印对话框。
 *
 * 代价是 PDF 里的文字是图片（不可选中），换来的是和预览完全一致的观感，且不依赖
 * 任何外部程序。
 */

/** 把 JPEG dataURL 包成一张 A4 页面的单页 PDF（字节数组）。 */
function rmBuildPdf(jpegDataUrl, width, height) {
  const comma = jpegDataUrl.indexOf(',');
  const binary = atob(comma >= 0 ? jpegDataUrl.slice(comma + 1) : jpegDataUrl);
  const imageBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) imageBytes[i] = binary.charCodeAt(i);

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

  pushText('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
  startObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  startObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  startObject(
    3,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageWidth + ' ' + pageHeight +
      '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>',
  );
  startObject(
    4,
    '<< /Type /XObject /Subtype /Image /Width ' + width + ' /Height ' + height +
      ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + imageBytes.length + ' >>',
  );
  pushText('stream\n');
  pushBytes(imageBytes);
  pushText('\nendstream\nendobj\n');

  const content = 'q\n' + pageWidth + ' 0 0 ' + pageHeight + ' 0 0 cm\n/Im0 Do\nQ\n';
  startObject(5, '<< /Length ' + content.length + ' >>');
  pushText('stream\n' + content + 'endstream\nendobj\n');

  const xrefAt = length;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i += 1) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pushText(xref);
  pushText('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xrefAt + '\n%%EOF\n');

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

/**
 * 把简历渲染成 PDF 的 base64（不含 dataURL 前缀）。
 * @returns {Promise<string>}
 */
async function rmPdfBase64(resume, template) {
  const parts = buildPreviewParts(resume, template);
  const doc = document.implementation.createHTMLDocument('resume-pdf');
  const root = doc.createElement('div');
  root.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  const style = doc.createElement('style');
  style.textContent = parts.css;
  root.appendChild(style);
  const paper = doc.createElement('div');
  paper.className = 'rm-doc rm-paper ' + templateClass(template);
  paper.innerHTML = parts.html;
  root.appendChild(paper);
  const xhtml = new XMLSerializer().serializeToString(root);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + PAPER_W + '" height="' + PAPER_H + '">' +
    '<foreignObject width="' + PAPER_W + '" height="' + PAPER_H + '">' + xhtml + '</foreignObject></svg>';
  const img = await rmLoadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = PAPER_W * scale;
  canvas.height = PAPER_H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('pdf/no-canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const jpeg = canvas.toDataURL('image/jpeg', 0.92);
  return rmBytesToBase64(rmBuildPdf(jpeg, canvas.width, canvas.height));
}
