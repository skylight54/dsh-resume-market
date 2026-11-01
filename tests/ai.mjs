/**
 * 模板 AI 优化（src/template-ai.js + /template/refine）的离线测试。
 *
 * 宿主 llm 用假实现：给定一段模型回复，验证
 *  - prompt 里带上了源文档摘要与初稿 style；
 *  - 输出被收敛到合法枚举/颜色/字号；
 *  - 模型返回垃圾/空时的错误码；
 *  - 缺 source 的入参校验。
 */
import assert from 'node:assert/strict';
import { refineTemplate, parseRefineJson, sanitizeRefineStyle } from '../src/template-ai.js';

function fakeHost(replyChunks) {
  const seen = [];
  const llm = {
    stream(options) {
      seen.push(options);
      return (async function* () {
        for (const chunk of replyChunks) yield chunk;
      })();
    },
  };
  const ctx = {
    logger: { info() {}, warn() {}, log() {} },
    get(name) {
      if (name === 'llm') return llm;
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'p', model: 'm' }) };
      return undefined;
    },
  };
  return { ctx, seen };
}

function textChunks(text) {
  return [
    { type: 'text-delta', index: 0, text: text.slice(0, 12) },
    { type: 'text-delta', index: 0, text: text.slice(12) },
    { type: 'finish', reason: { kind: 'stop' } },
  ];
}

const source = {
  kind: 'pdf',
  sourceName: 'sample.pdf',
  page: { width: 595, height: 842 },
  colors: { accent: '#2c6474', background: '#ffffff' },
  blocks: [
    { text: '全民简历', role: 'name', size: 30, color: '#1d3d4d', left: 120, top: 60 },
    { text: '教育背景', role: 'heading', size: 14, color: '#2c6474', left: 120, top: 240 },
    { text: '语言能力：大学英语6级证书', role: 'body', size: 12, left: 40, top: 500 },
    { text: '兴趣爱好', role: 'heading', size: 13, left: 40, top: 700 },
  ],
  text: '全民简历 教育背景 语言能力 兴趣爱好',
};

const draft = {
  style: {
    layout: 'single',
    headerStyle: 'plain',
    headingStyle: 'rule',
    contentStyle: 'plain',
    colors: { accent: '#2c6474', bodyColor: '#1d2939' },
    nameSize: 30,
    headingSize: 13,
    bodySize: 13.5,
  },
};

async function main() {
  // 1) parseRefineJson：fenced / 裸对象 / 垃圾
  assert.deepEqual(parseRefineJson('说明\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseRefineJson('前缀 {"b":{"c":2}} 后缀'), { b: { c: 2 } });
  assert.equal(parseRefineJson('没有 json'), null);

  // 2) sanitizeRefineStyle：合法值保留、越界值丢弃、颜色归一、字号夹取
  const cleaned = sanitizeRefineStyle(
    {
      layout: 'sidebar',
      headerStyle: 'bogus',
      headingStyle: 'pill',
      contentStyle: 'card',
      sidebarSections: ['skills', 'awards', 'bogus', 'skills'],
      contactCols: 1,
      colors: { accent: '#ABC', bandColor: 'red', nameColor: '#112233' },
      nameSize: 999,
      headingSize: 2,
      bodySize: 13,
      sectionGap: 18,
      unknownField: 'x',
    },
    draft.style
  );
  assert.equal(cleaned.layout, 'sidebar');
  assert.equal(cleaned.headerStyle, 'plain', '非法 headerStyle 应保留初稿值');
  assert.equal(cleaned.headingStyle, 'pill');
  assert.equal(cleaned.contentStyle, 'card');
  assert.deepEqual(cleaned.sidebarSections, ['skills', 'awards']);
  assert.equal(cleaned.contactCols, 1);
  assert.equal(cleaned.colors.accent, '#aabbcc');
  assert.equal(cleaned.colors.nameColor, '#112233');
  assert.ok(!('unknownField' in cleaned));
  assert.equal(cleaned.nameSize, 64, 'nameSize 上限 64');
  assert.equal(cleaned.headingSize, 9, 'headingSize 下限 9');

  // 3) refineTemplate 正常路径：prompt 带源摘要与初稿，返回收敛后的 style
  const reply = [
    '比对完了：左栏有语言能力/兴趣爱好，属于 sidebar；标题是胶囊块。',
    '```json',
    JSON.stringify({
      style: {
        layout: 'sidebar',
        headerStyle: 'band',
        headingStyle: 'pill',
        contentStyle: 'plain',
        sidebarSections: ['skills', 'awards'],
        colors: { accent: '#2C6474', bandColor: '#EDF4F6' },
        nameSize: 31,
        headingSize: 13.5,
      },
      demoText: { name: '全民简历', role: '' },
      notes: '左栏放技能与兴趣；页眉是整宽浅色带。',
    }),
    '```',
  ].join('\n');
  const host = fakeHost(textChunks(reply));
  const refined = await refineTemplate({ ctx: host.ctx, source, draft });
  assert.equal(refined.style.layout, 'sidebar');
  assert.equal(refined.style.headerStyle, 'band');
  assert.equal(refined.style.headingStyle, 'pill');
  assert.deepEqual(refined.style.sidebarSections, ['skills', 'awards']);
  assert.equal(refined.style.colors.accent, '#2c6474');
  assert.equal(refined.style.colors.bandColor, '#edf4f6');
  assert.equal(refined.style.colors.bodyColor, '#1d2939', '未提到的颜色保留初稿');
  assert.equal(refined.style.nameSize, 31);
  assert.equal(refined.demoText.name, '全民简历');
  assert.ok(refined.notes.indexOf('左栏') !== -1);
  assert.equal(refined.model, 'm');
  assert.ok(typeof refined.durationMs === 'number');

  const options = host.seen[0];
  assert.equal(options.provider, 'p');
  assert.equal(options.model, 'm');
  assert.ok(options.system.indexOf('模板版式') !== -1 || options.system.indexOf('版式分析') !== -1, 'system 应是版式分析提示');
  assert.equal(options.messages.length, 1);
  const userText = options.messages[0].content[0].text;
  assert.ok(userText.indexOf('sample.pdf') !== -1, 'prompt 应带文件名');
  assert.ok(userText.indexOf('语言能力') !== -1, 'prompt 应带文本块内容');
  assert.ok(userText.indexOf('"layout": "single"') !== -1, 'prompt 应带初稿 style');

  // 4) 模型返回非 JSON：template/bad-json + 502
  const badHost = fakeHost(textChunks('我觉得应该改成侧栏，但我懒得给你 JSON。'));
  await assert.rejects(
    () => refineTemplate({ ctx: badHost.ctx, source, draft }),
    (err) => {
      assert.equal(err.code, 'template/bad-json');
      assert.equal(err.status, 502);
      return true;
    }
  );

  // 5) 缺 source：template/no-source + 400
  await assert.rejects(
    () => refineTemplate({ ctx: host.ctx, draft }),
    (err) => {
      assert.equal(err.code, 'template/no-source');
      assert.equal(err.status, 400);
      return true;
    }
  );

  // 6) 宿主没有可用模型：chat/no-key 透传
  const noModelCtx = { logger: {}, get() { return undefined; } };
  await assert.rejects(
    () => refineTemplate({ ctx: noModelCtx, source, draft }),
    (err) => {
      assert.equal(err.code, 'chat/no-key');
      assert.equal(err.status, 400);
      return true;
    }
  );

  // 7) 源文档没有任何文本块时也能跑（靠版式特征），prompt 要有兜底说明
  const emptyHost = fakeHost(
    textChunks('```json\n{"style":{"layout":"single"},"notes":"没有文本块，按单栏处理"}\n```')
  );
  const emptyResult = await refineTemplate({
    ctx: emptyHost.ctx,
    source: { kind: 'image', blocks: [], text: '' },
    draft,
  });
  assert.equal(emptyResult.style.layout, 'single');
  assert.ok(emptyHost.seen[0].messages[0].content[0].text.indexOf('解析不到文本块') !== -1);

  console.log('✓ template-ai 测试全部通过（解析 / 收敛 / prompt / 错误码 7 组）');
}

main().catch((error) => {
  console.error('✗ template-ai 测试失败：', error);
  process.exit(1);
});
