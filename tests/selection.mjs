/**
 * 框选 AI 编辑（src/selection-edit.js）的离线测试。
 *
 * 宿主 llm 用假实现，store 用内存桩，验证：
 *  - 内容级修改按白名单落到 resume.data / sectionTitles；
 *  - 样式级修改先返回 stylePatch（客户端算 CSS），第二阶段带 styleOverride 直接落盘；
 *  - 错误码：缺 resume / 缺指令 / JSON 坏 / 无事可做 / 无模型；
 *  - 覆盖 CSS 里的危险片段会被丢掉。
 */
import assert from 'node:assert/strict';
import { editSelection, descriptorLabel, sanitizeStylePatch } from '../src/selection-edit.js';

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

function noModelCtx() {
  return { logger: { info() {}, warn() {}, log() {} }, get() { return undefined; } };
}

function textChunks(text) {
  return [{ type: 'text-delta', index: 0, text: text.slice(0, 10) }, { type: 'text-delta', index: 0, text: text.slice(10) }, { type: 'finish', reason: { kind: 'stop' } }];
}

function baseResume() {
  return {
    id: 'r_1',
    title: '测试简历',
    templateId: 'business-minimal',
    lang: 'zh',
    sections: ['summary', 'experience', 'education', 'skills'],
    data: {
      basics: { name: '程好', role: '后端开发', phone: '13800000000', email: 'a@b.com', city: '北京' },
      summary: '原来的简介',
      experience: [
        { company: 'A 公司', role: '实习生', period: '2024-2025', bullets: ['做了甲', '做了乙'] },
      ],
      education: [{ school: '某大学', degree: '本科', major: '计算机', period: '2020-2024' }],
      skills: [{ group: '语言', items: 'Python、Go' }],
      awards: [],
      projects: [],
    },
  };
}

function fakeStore(resume) {
  const calls = [];
  return {
    calls,
    getResume(id) {
      if (id !== resume.id) return null;
      return structuredClone(resume);
    },
    async updateResume(id, patch) {
      calls.push({ id, patch });
      return { ...structuredClone(resume), ...patch, id };
    },
  };
}

async function expectError(code, run) {
  try {
    await run();
  } catch (error) {
    assert.equal(error.code, code, '期望错误码 ' + code + '，实际 ' + error.code);
    return error;
  }
  assert.fail('期望抛错 ' + code + '，但成功了');
}

async function main() {
  // 1) 内容级修改
  {
    const { ctx, seen } = fakeHost(textChunks('```json\n{"kind":"text","summary":"把要点写得更具体","edits":[{"path":"experience.0.bullets.0","value":"用 FastAPI 搭了 3 个接口"},{"path":"summary","value":"针对 JD 重写的简介"},{"path":"sectionTitles.education","value":"学习经历"}]}\n```'));
    const store = fakeStore(baseResume());
    const out = await editSelection({
      ctx,
      store,
      resumeId: 'r_1',
      descriptor: { scope: 'bullet', section: 'experience', index: 0, bulletIndex: 0, text: '做了甲' },
      instruction: '写具体一点',
    });
    assert.equal(out.change.kind, 'text');
    assert.equal(out.change.label, descriptorLabel({ scope: 'bullet', section: 'experience', index: 0, bulletIndex: 0 }));
    assert.equal(store.calls.length, 1);
    const patch = store.calls[0].patch;
    assert.equal(patch.data.summary, '针对 JD 重写的简介');
    assert.equal(patch.data.experience[0].bullets[0], '用 FastAPI 搭了 3 个接口');
    assert.equal(patch.sectionTitles.education, '学习经历');
    assert.ok(seen.length === 1, '应调用一次模型');
    assert.match(String(seen[0].system || ''), /kind="text"/);
    assert.match(String(seen[0].messages[0].content[0].text || ''), /写具体一点/);
  }

  // 2) 样式级：第一阶段只返回 stylePatch，不落盘
  {
    const { ctx } = fakeHost(textChunks('{"kind":"style","summary":"姓名调大","stylePatch":{"nameSize":46,"colors":{"accent":"#123456"},"headingStyle":"pill","bad":"x"}}'));
    const store = fakeStore(baseResume());
    const out = await editSelection({ ctx, store, resumeId: 'r_1', descriptor: { scope: 'basics', field: 'name' }, instruction: '名字大一点' });
    assert.equal(out.change.kind, 'style');
    assert.equal(out.change.stylePatch.nameSize, 46);
    assert.equal(out.change.stylePatch.colors.accent, '#123456');
    assert.equal(out.change.stylePatch.headingStyle, 'pill');
    assert.equal(out.change.stylePatch.bad, undefined);
    assert.equal(out.resume, undefined, '样式阶段不该直接改简历');
    assert.equal(store.calls.length, 0);
  }

  // 3) 样式级：第二阶段带 styleOverride 直接落盘
  {
    const { ctx } = fakeHost([]);
    const store = fakeStore(baseResume());
    const out = await editSelection({
      ctx,
      store,
      resumeId: 'r_1',
      descriptor: { scope: 'basics', field: 'name' },
      instruction: '应用刚才的样式修改',
      styleOverride: { nameSize: 46 },
      styleOverrideCss: '.rm-t-business .rm-name{font-size:46px}',
    });
    assert.equal(out.change.kind, 'style');
    assert.equal(store.calls.length, 1);
    assert.equal(store.calls[0].patch.styleOverride.nameSize, 46);
    assert.match(store.calls[0].patch.styleOverrideCss, /font-size:46px/);
    assert.equal(out.resume.id, 'r_1');
  }

  // 4) 覆盖 CSS 里的危险片段被丢弃
  {
    const { ctx } = fakeHost([]);
    const store = fakeStore(baseResume());
    await editSelection({
      ctx,
      store,
      resumeId: 'r_1',
      descriptor: { scope: 'basics', field: 'name' },
      instruction: '应用刚才的样式修改',
      styleOverride: { bodySize: 14 },
      styleOverrideCss: 'a{}</style><script>alert(1)</script>',
    });
    assert.equal(store.calls[0].patch.styleOverrideCss, '');
  }

  // 5) 错误码
  {
    const { ctx } = fakeHost([]);
    const store = fakeStore(baseResume());
    await expectError('selection/no-instruction', () =>
      editSelection({ ctx, store, resumeId: 'r_1', descriptor: { scope: 'summary' }, instruction: '  ' }),
    );
    await expectError('selection/unsupported', () => editSelection({ ctx, store, resumeId: 'r_1', descriptor: {}, instruction: '改' }));
    await expectError('selection/no-resume', () =>
      editSelection({ ctx, store, resumeId: 'r_missing', descriptor: { scope: 'summary' }, instruction: '改' }),
    );
    await expectError('selection/no-resume-id', () => editSelection({ ctx, store, resumeId: '', descriptor: { scope: 'summary' }, instruction: '改' }));
    await expectError('selection/no-ai', () =>
      editSelection({ ctx: noModelCtx(), store, resumeId: 'r_1', descriptor: { scope: 'summary' }, instruction: '改' }),
    );
  }

  // 6) 坏 JSON / 空 edits
  {
    const store = fakeStore(baseResume());
    const bad = fakeHost(textChunks('抱歉，我做不到。'));
    await expectError('selection/bad-json', () =>
      editSelection({ ctx: bad.ctx, store, resumeId: 'r_1', descriptor: { scope: 'summary' }, instruction: '改' }),
    );
    const empty = fakeHost(textChunks('{"kind":"text","summary":"x","edits":[]}'));
    await expectError('selection/bad-json', () =>
      editSelection({ ctx: empty.ctx, store, resumeId: 'r_1', descriptor: { scope: 'summary' }, instruction: '改' }),
    );
    const noHit = fakeHost(textChunks('{"kind":"text","edits":[{"path":"basics.name.length","value":"x"}]}'));
    await expectError('selection/unsupported', () =>
      editSelection({ ctx: noHit.ctx, store, resumeId: 'r_1', descriptor: { scope: 'basics', field: 'name' }, instruction: '改' }),
    );
  }

  // 7) sanitizeStylePatch 白名单
  {
    assert.equal(sanitizeStylePatch({}), null);
    assert.equal(sanitizeStylePatch(null), null);
    const patch = sanitizeStylePatch({ nameSize: 999, layout: 'weird', layout2: 'sidebar', headerStyle: 'band', gold: '#abc' });
    assert.equal(patch.nameSize, undefined, '越界数值应被丢弃');
    assert.equal(patch.layout, undefined);
    assert.equal(patch.headerStyle, 'band');
    assert.equal(patch.colors.gold, '#abc');
  }

  console.log('✓ selection-edit 测试全部通过（内容/样式两阶段、白名单、错误码 7 组）');
}

main().catch((error) => {
  console.error('✗ selection-edit 测试失败：', error);
  process.exit(1);
});
