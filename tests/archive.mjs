/**
 * 个人档案 + 按 JD 定制（src/archive.js）的离线测试。
 *
 * 宿主 llm 用假实现，store 用内存桩，验证：
 *  - archiveMeta：工作年限、技能摘要、标题；
 *  - tailorArchive：正常生成候选简历、score 夹取、gaps 截断；
 *  - 错误码：档案不存在 / 缺 JD / JD 太短 / JSON 坏 / 无模型。
 */
import assert from 'node:assert/strict';
import { archiveMeta, normalizeArchive, tailorArchive } from '../src/archive.js';

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

function archiveData() {
  return {
    basics: { name: '程好', role: '后端开发', city: '北京', phone: '13800000000', email: 'a@b.com' },
    summary: '6 年后端开发经验，做过工单与 Agent 系统。',
    experience: [
      { company: 'A 公司', role: '后端开发', period: '2020-2024', bullets: ['做过工单系统'] },
      { company: 'B 公司', role: '实习生', period: '2019-2020', bullets: ['写过脚本'] },
    ],
    projects: [],
    education: [{ school: '某大学', degree: '本科', major: '计算机', period: '2015-2019' }],
    skills: [{ group: '语言', items: 'Python、Go' }, { group: '框架', items: 'FastAPI' }],
    awards: [],
  };
}

function fakeStore(archive) {
  return {
    getArchive(id) {
      return id === archive.id ? structuredClone(archive) : null;
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
  // 1) meta 摘要
  {
    const meta = archiveMeta(archiveData());
    assert.equal(meta.name, '程好');
    assert.equal(meta.title, '后端开发');
    assert.equal(meta.years, 6);
    assert.deepEqual(meta.skillsTop, ['Python', 'Go', 'FastAPI']);

    const shortMeta = archiveMeta({ basics: { name: '甲' }, skills: [], experience: [{}, {}] });
    assert.equal(shortMeta.years, 4, '没有年限文本时按经历条数估算');
    assert.deepEqual(shortMeta.skillsTop, []);
  }

  // 2) normalizeArchive 默认名与保底
  {
    const a = normalizeArchive({ id: 'a_1', data: archiveData() });
    assert.equal(a.name, '程好');
    assert.equal(a.meta.years, 6);
    const b = normalizeArchive({ data: {} });
    assert.equal(b.name, '我的档案');
    assert.equal(b.id, null);
  }

  // 3) tailor 成功
  {
    const reply = {
      title: '后端开发 · 定制简历',
      score: 82,
      notes: '突出了工单与 Agent 相关经历。',
      gaps: ['缺少 K8s 经验', '缺少大规模并发'],
      data: {
        ...archiveData(),
        summary: '针对该 JD 重写的简介',
        experience: [{ company: 'A 公司', role: '后端开发', period: '2020-2024', bullets: ['用 FastAPI 搭了工单系统，支撑 130 项自动化测试'] }],
      },
    };
    const { ctx, seen } = fakeHost(textChunks('```json\n' + JSON.stringify(reply) + '\n```'));
    const archive = { id: 'a_1', name: '后端档案', templateId: 'banner-exec', data: archiveData() };
    const out = await tailorArchive({ ctx, store: fakeStore(archive), archiveId: 'a_1', jd: '招聘后端开发，要求熟悉 Python、FastAPI、SQL，有工单系统经验优先。' });
    assert.equal(out.score, 82);
    assert.equal(out.notes, reply.notes);
    assert.equal(out.gaps.length, 2);
    assert.equal(out.model, 'm');
    assert.equal(out.archiveId, 'a_1');
    assert.equal(out.resume.templateId, 'banner-exec', '沿用档案的模板');
    assert.equal(out.resume.data.summary, '针对该 JD 重写的简介');
    assert.equal(out.resume.data.experience.length, 1);
    assert.equal(out.resume.data.basics.name, '程好');
    assert.equal(out.resume.id, null);
    assert.equal(seen.length, 1);
    assert.match(String(seen[0].system || ''), /不许编造/);
    assert.match(String(seen[0].messages[0].content[0].text || ''), /招聘后端开发/);
  }

  // 4) score 越界会被夹到 0-100
  {
    const reply = { title: 't', score: 180, notes: 'n', gaps: [], data: archiveData() };
    const { ctx } = fakeHost(textChunks(JSON.stringify(reply)));
    const out = await tailorArchive({ ctx, store: fakeStore({ id: 'a_1', data: archiveData() }), archiveId: 'a_1', jd: '这是一段足够长的职位描述文本，用于测试 score 夹取。' });
    assert.equal(out.score, 100);
    assert.equal(out.resume.templateId, 'business-minimal', '档案没模板时用默认模板');
  }

  // 5) 错误码
  {
    const archive = { id: 'a_1', data: archiveData() };
    const store = fakeStore(archive);
    const { ctx } = fakeHost([]);
    const longJd = '岗'.repeat(12001);
    await expectError('archive/no-archive-id', () => tailorArchive({ ctx, store, archiveId: '', jd: '一段足够长的 JD 文本啊啊啊' }));
    await expectError('archive/no-archive', () => tailorArchive({ ctx, store, archiveId: 'a_x', jd: '一段足够长的 JD 文本啊啊啊' }));
    await expectError('archive/no-jd', () => tailorArchive({ ctx, store, archiveId: 'a_1', jd: '' }));
    await expectError('archive/jd-too-short', () => tailorArchive({ ctx, store, archiveId: 'a_1', jd: '太短' }));
    await expectError('archive/jd-too-long', () => tailorArchive({ ctx, store, archiveId: 'a_1', jd: longJd }));
    await expectError('archive/no-ai', () =>
      tailorArchive({ ctx: noModelCtx(), store, archiveId: 'a_1', jd: '这是一段足够长的职位描述文本，用于测试无模型报错。' }),
    );
  }

  // 6) 坏 JSON
  {
    const store = fakeStore({ id: 'a_1', data: archiveData() });
    const bad = fakeHost(textChunks('好的，我帮你调整简历。'));
    await expectError('archive/bad-json', () =>
      tailorArchive({ ctx: bad.ctx, store, archiveId: 'a_1', jd: '这是一段足够长的职位描述文本，用于测试坏 JSON 报错。' }),
    );
    const partial = fakeHost(textChunks('{"title":"x","score":50}'));
    await expectError('archive/bad-json', () =>
      tailorArchive({ ctx: partial.ctx, store, archiveId: 'a_1', jd: '这是一段足够长的职位描述文本，用于测试缺 data 报错。' }),
    );
  }

  console.log('✓ archive 测试全部通过（meta / tailor / score 夹取 / 错误码 6 组）');
}

main().catch((error) => {
  console.error('✗ archive 测试失败：', error);
  process.exit(1);
});
