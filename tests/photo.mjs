import assert from 'node:assert/strict';
import { photoCropRect } from '../src/shared/doc.js';

console.log('photo crop tests');

// cover：大横图 → 正方形居中裁切；源矩形必须是原图像素，画布才缩到 480
{
  const box = photoCropRect(4000, 3000, 'cover', 480);
  assert.equal(box.sw, 3000, 'cover 源宽取短边原像素');
  assert.equal(box.sh, 3000, 'cover 源高取短边原像素');
  assert.equal(box.sx, 500, '横向居中：左侧裁掉 (4000-3000)/2');
  assert.equal(box.sy, 0, '纵向不裁');
  assert.equal(box.dw, 480, '目标画布最长边 480');
  assert.equal(box.dh, 480, 'cover 输出正方形');
}

// cover：大竖图 → 上下居中裁
{
  const box = photoCropRect(2000, 5000, 'cover', 480);
  assert.equal(box.sw, 2000);
  assert.equal(box.sh, 2000);
  assert.equal(box.sx, 0);
  assert.equal(box.sy, 1500);
  assert.equal(box.dw, 480);
}

// contain：保持原比例，不裁切
{
  const box = photoCropRect(4000, 3000, 'contain', 480);
  assert.deepEqual([box.sx, box.sy, box.sw, box.sh], [0, 0, 4000, 3000], 'contain 用整张原图');
  assert.equal(box.dw, 480);
  assert.equal(box.dh, 360);
}

// 小图不放大
{
  const box = photoCropRect(200, 150, 'cover', 480);
  assert.equal(box.sw, 150);
  assert.equal(box.dw, 150);
  assert.equal(box.sx, 25);
}

// 回归：老实现把「缩放后的边长」当源矩形，大图会切出左上角一小块
{
  const box = photoCropRect(4000, 3000, 'cover', 480);
  assert.ok(box.sw > 480, '源矩形应远大于目标画布（否则就是只截了左上角）');
  assert.ok(box.sw / box.dw > 6, '4000px 原图缩到 480 时应约 6.25 倍');
}

console.log('✓ photo crop 测试全部通过（cover 居中 / contain 保比例 / 小图不放大 / 老 bug 回归）');
