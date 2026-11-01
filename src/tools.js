/**
 * agent 工具：让「大肥鱼」能直接用结构化数据做简历，而不是自由发挥。
 *
 * 注册方式说明：这里不 import @deepseek-ai/dsh-tools 的 defineTool。插件以
 * link: 方式装进 profile，裸 import @deepseek-ai/* 在路径装载下解析不到；
 * 而 ctx.tools.register 接受的只是普通定义对象（{name,description,parameters,
 * output:{schema,render},execute}），parameters 用已规范化的 JSON Schema 即可。
 */
import { templateById } from './shared/doc.js';
import { resolveFormat, writeResumeExport } from './export-file.js';
import { createGithubMarket } from './github-market.js';

const str = (description) => ({ type: 'string', description });
const bool = (description) => ({ type: 'boolean', description });
const textArray = (description) => ({ type: 'array', items: { type: 'string' }, description });
const obj = (properties, description) => ({
  type: 'object',
  properties,
  additionalProperties: false,
  ...(description ? { description } : {}),
});

const RESUME_DATA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  description: '简历内容。按字段填，不要把所有信息塞进一段文字。',
  properties: {
    basics: obj(
      {
        name: str('姓名'),
        role: str('求职意向，例如「高级产品经理 · 8 年 B 端经验」'),
        phone: str('手机号'),
        email: str('邮箱'),
        city: str('所在城市'),
        wechat: str('微信号'),
        github: str('GitHub 主页'),
        website: str('个人主页 / 作品集'),
      },
      '个人信息。八个字段各自独立，前端会分栏展示，不要写成一整段。',
    ),
    summary: str('个人简介，2-4 句话，用**加粗**强调关键数字'),
    experience: {
      type: 'array',
      description: '工作经历，按时间倒序',
      items: obj({
        company: str('公司名'),
        role: str('职位'),
        period: str('时间段，例如 2021.06 — 至今'),
        location: str('城市'),
        bullets: textArray('职责与成果，每条以动词开头并带量化结果，支持 **加粗**'),
      }),
    },
    projects: {
      type: 'array',
      description: '项目经历，按时间倒序',
      items: obj({
        name: str('项目名'),
        role: str('担任角色'),
        period: str('时间段'),
        bullets: textArray('项目亮点，每条一行'),
      }),
    },
    education: {
      type: 'array',
      description: '教育背景',
      items: obj({
        school: str('学校'),
        degree: str('学历，例如 硕士'),
        major: str('专业'),
        period: str('时间段'),
        gpa: str('GPA / 排名'),
      }),
    },
    skills: {
      type: 'array',
      description: '技能分组，每组一行',
      items: obj({
        group: str('分组名，例如 产品能力 / 工具'),
        items: str('技能点，用「、」分隔'),
      }),
    },
    awards: {
      type: 'array',
      description: '荣誉奖项',
      items: obj({
        title: str('奖项名称'),
        date: str('时间'),
        desc: str('颁发机构或补充说明'),
      }),
    },
  },
};

const OUTPUT_OK = { type: 'object', additionalProperties: true };

function textResult(lines) {
  return [{ type: 'text', text: lines.filter(Boolean).join('\n') }];
}

function safeFileName(name) {
  return String(name || 'resume')
    .replace(/[\\/:*?"<>|\r\n]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || 'resume';
}

function summariseResume(resume) {
  const b = resume.data.basics;
  return {
    id: resume.id,
    title: resume.title,
    templateId: resume.templateId,
    lang: resume.lang,
    name: b.name || '(未填姓名)',
    updatedAt: resume.updatedAt,
  };
}

/**
 * 注册所有 resume_* 工具。
 * @param {object} ctx cordis context
 * @param {object} deps
 * @param {object} deps.store openStore() 的返回值
 */
export function registerTools(ctx, { store }) {
  if (!ctx.tools || typeof ctx.tools.register !== 'function') {
    return () => {};
  }

  const tools = [];
  const githubMarket = createGithubMarket({ store });
  /**
   * 把「字段名 → 字段 schema」的简写规范成模型服务商要求的 JSON Schema：
   * 根必须是 { type: 'object', properties, required? }，且字段级不能出现 required: true。
   * （不包这一层的话，模型 API 会报 schema must be 'type: "object"', got 'type: null'，
   *   整条请求都会失败——插件刚装上时的报错就是这个。）
   */
  const normalizeParameters = (fields) => {
    const source = fields && typeof fields === 'object' ? fields : {};
    const properties = {};
    const required = [];
    for (const name of Object.keys(source)) {
      const schema = source[name];
      if (!schema || typeof schema !== 'object') continue;
      const copy = { ...schema };
      delete copy.required;
      properties[name] = copy;
      if (schema.required === true) required.push(name);
    }
    const parameters = { type: 'object', properties, additionalProperties: false };
    if (required.length) parameters.required = required;
    return parameters;
  };

  const add = (definition) => {
    const normalized = { ...definition, parameters: normalizeParameters(definition.parameters) };
    tools.push(
      ctx.effect(() => ctx.tools.register(normalized), 'resume-market: tool ' + definition.name),
    );
  };

  add({
    name: 'resume_market_list',
    description:
      '列出简历市场里的模板与条目，以及用户已保存的简历。做简历前先用它看看有哪些模板可用（business-minimal 商务极简 / quiet-luxury 静奢蓝灰 / fresh-creative 清新创意 / compact-one 紧凑单栏 / timeline-pro 时间轴 / tech-grid 科技网格，另有市场模板）。',
    parameters: {
      include: {
        type: 'string',
        enum: ['all', 'templates', 'market', 'resumes'],
        description: '要看哪一部分，默认 all',
      },
    },
    output: {
      schema: OUTPUT_OK,
      render: (_args, value) =>
        textResult([
          `模板 ${value.templates.length} 个、市场条目 ${value.market.length} 个、我的简历 ${value.resumes.length} 份`,
          ...value.templates.slice(0, 12).map((t) => `· 模板 ${t.id}｜${t.name}｜${t.tagline || t.desc || ''}`),
          ...value.market.slice(0, 8).map((m) => `· 市场 ${m.id}｜${m.name}（${m.author}）｜${m.tagline || ''}`),
          ...value.resumes.slice(0, 12).map((r) => `· 简历 ${r.id}｜${r.title}｜模板 ${r.templateId}`),
        ]),
    },
    async execute(args) {
      const include = (args && args.include) || 'all';
      const snapshot = store.snapshot();
      return {
        templates:
          include === 'market' || include === 'resumes'
            ? []
            : store.listTemplates().map((t) => ({
                id: t.id,
                name: t.name,
                tagline: t.tagline || '',
                desc: t.desc || '',
                tags: t.tags || [],
                source: t.source,
              })),
        market:
          include === 'templates' || include === 'resumes'
            ? []
            : snapshot.market.map((m) => ({
                id: m.id,
                name: m.name,
                tagline: m.tagline || '',
                author: m.author,
                tags: m.tags || [],
                installs: m.installs || 0,
                source: m.source,
                installed: snapshot.templates.some((t) => t.id === m.templateId),
              })),
        resumes: include === 'templates' || include === 'market' ? [] : store.listResumes().map(summariseResume),
      };
    },
  });

  add({
    name: 'resume_save',
    description:
      '新建或更新一份结构化简历。个人信息必须按 basics 的字段分别填写（name/phone/email/city/wechat/github/website），不要合成一段文字——之前「个人信息坨在一起」就是这个原因。不传 resumeId 就是新建。',
    parameters: {
      resumeId: str('要更新的简历 id；不传则新建'),
      title: str('简历标题，例如「产品经理_上海_林知夏」'),
      templateId: str('模板 id，可先用 resume_market_list 查；默认 business-minimal'),
      lang: { type: 'string', enum: ['zh', 'en'], description: '语言，默认 zh' },
      data: RESUME_DATA_SCHEMA,
    },
    output: {
      schema: OUTPUT_OK,
      render: (_args, value) =>
        textResult([`已保存：${value.resume.title}（id ${value.resume.id}，模板 ${value.resume.templateId}）`]),
    },
    async execute(args) {
      const input = args || {};
      const data = input.data || {};
      if (!input.data || typeof input.data !== 'object') {
        throw new Error('resume_save 需要 data 对象；请按工具参数里的字段填写简历内容');
      }
      let resume;
      if (input.resumeId) {
        const patch = { data };
        if (input.title) patch.title = input.title;
        if (input.templateId) patch.templateId = input.templateId;
        if (input.lang) patch.lang = input.lang;
        resume = await store.updateResume(String(input.resumeId), patch);
      } else {
        resume = await store.createResume({
          title: input.title,
          templateId: input.templateId,
          lang: input.lang,
          data,
        });
      }
      return { resume: summariseResume(resume) };
    },
  });

  add({
    name: 'resume_export',
    description:
      '把简历导出成本机文件并返回绝对路径。format 可选 html（默认）、doc（真正的 Word .docx，Word/WPS 都能正确还原版式）、pdf（用本机 Chrome/Edge 无头打印，直接得到可投递的 PDF）。',
    parameters: {
      resumeId: { type: 'string', description: '简历 id', required: true },
      format: {
        type: 'string',
        enum: ['html', 'doc', 'pdf'],
        description: '导出格式：html | doc（Word 文档 .docx）| pdf；不传默认 html',
      },
    },
    output: {
      schema: OUTPUT_OK,
      render: (_args, value) =>
        textResult([
          `已导出 ${String(value.format || 'html').toUpperCase()}：${value.path}`,
          '文件已写在本机导出目录，可直接打开或发给别人。',
        ]),
    },
    async execute(args) {
      const id = args && args.resumeId;
      if (!id) throw new Error('resume_export 需要 resumeId');
      const format = resolveFormat(args.format);
      if (!format) throw new Error('resume_export 的 format 只支持 html / doc / pdf');
      const resume = store.getResume(String(id));
      const template = store.templateForResume(resume) || templateById(resume.templateId);
      const written = await writeResumeExport(resume, template, { format, autoPrint: false });
      return { path: written.path, dir: written.dir, format: written.format, templateId: template.id, title: resume.title };
    },
  });

  add({
    name: 'resume_publish',
    description:
      '把用户的一份简历发布到市场，其他装了本插件的用户就能安装这个模板。默认不携带用户本人的简历内容（用示例数据生成样张）；只有 includeSample=true 时才把内容一起分享。',
    parameters: {
      resumeId: { type: 'string', description: '简历 id', required: true },
      title: str('市场上显示的模板名'),
      tagline: str('一句话介绍，建议 15-40 字'),
      tags: textArray('标签，最多 5 个'),
      desc: str('补充说明'),
      includeSample: bool('是否连简历内容一起分享（默认 false，只分享版式）'),
    },
    output: {
      schema: OUTPUT_OK,
      render: (_args, value) =>
        textResult([`已发布到市场：${value.entry.name}（条目 ${value.entry.id}）`]),
    },
    async execute(args) {
      const input = args || {};
      if (!input.resumeId) throw new Error('resume_publish 需要 resumeId');
      const entry = await store.publish({
        resumeId: String(input.resumeId),
        title: input.title,
        tagline: input.tagline,
        tags: input.tags,
        desc: input.desc,
        includeSample: input.includeSample === true,
        author: store.settings().author,
      });
      return { entry: { id: entry.id, name: entry.name, templateId: entry.templateId } };
    },
  });

  add({
    name: 'resume_import_template',
    description:
      '导入一个外部模板包（JSON，字段 id/name/tagline/tags/accent/desc/css）。可以传对象，也可以传 .json 文件路径。导入后可以直接用在简历上。',
    parameters: {
      template: { type: 'object', additionalProperties: true, description: '模板对象，与 path 二选一' },
      path: str('模板 JSON 文件的绝对路径，与 template 二选一'),
    },
    output: {
      schema: OUTPUT_OK,
      render: (_args, value) => textResult([`已导入模板：${value.template.name}（id ${value.template.id}）`]),
    },
    async execute(args) {
      const input = args || {};
      let raw = input.template;
      if (!raw && input.path) {
        const { readFile } = await import('node:fs/promises');
        raw = JSON.parse(await readFile(String(input.path), 'utf8'));
      }
      if (!raw || typeof raw !== 'object') throw new Error('resume_import_template 需要 template 对象或 path');
      const template = await store.importTemplate(raw);
      return { template: { id: template.id, name: template.name } };
    },
  });

  add({
    name: 'resume_list_templates',
    description: '快速列出可用的模板 id（内置 6 个 + 已安装的市场模板），做简历选模板时用。',
    parameters: {},
    output: {
      schema: { type: 'array', items: { type: 'string' } },
      render: (_args, value) => textResult(value.map((line) => '· ' + line)),
    },
    async execute() {
      return store.listTemplates().map((t) => `${t.id}｜${t.name}｜${t.source === 'builtin' ? '内置' : '市场安装'}｜${t.tagline || ''}`);
    },
  });

  add({
    name: 'resume_market_public',
    description:
      '查看 GitHub 公共市场里大家分享的简历模板（别人发布、维护者合并进仓库 market/ 目录的模板）。安装某个模板用 resume_install_public。',
    parameters: {
      refresh: bool('是否强制刷新（绕过 10 分钟缓存），默认 false'),
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const lines = [
          `公共市场：${value.repo}（${value.items.length} 个模板${value.stale ? '，当前显示本地缓存' : ''}）`,
        ];
        for (const item of value.items.slice(0, 20)) {
          lines.push(`· ${item.id}｜${item.name}｜by ${item.author}｜${item.tagline || ''}`);
        }
        if (value.error) lines.push(`提示：${value.error.message}`);
        return textResult(lines);
      },
    },
    async execute(args) {
      const index = await githubMarket.loadIndex({ force: !!(args && args.refresh) });
      return {
        repo: index.repo,
        branch: index.branch,
        stale: index.stale,
        fetchedAt: index.fetchedAt,
        error: index.error || null,
        items: index.items.map((item) => ({
          id: item.id,
          name: item.name,
          tagline: item.tagline,
          tags: item.tags,
          author: item.author,
          installs: item.installs,
        })),
      };
    },
  });

  add({
    name: 'resume_install_public',
    description:
      '从 GitHub 公共市场安装一个模板（先 resume_market_public 看 id），装好后就能用 resume_save 的 templateId 指定它。',
    parameters: {
      id: str('公共市场模板 id，例如 rm-quiet-luxury'),
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => textResult([`已安装公共模板：${value.template.name}（模板 id ${value.template.id}）`]),
    },
    async execute(args) {
      const id = args && args.id;
      if (!id) throw new Error('resume_install_public 需要 id');
      const template = await githubMarket.install(String(id));
      return { template: { id: template.id, name: template.name, cls: template.cls || '' } };
    },
  });

  add({
    name: 'resume_publish_public',
    description:
      '生成「投稿到 GitHub 公共市场」所需的 JSON 与链接。默认不带用户真实简历内容（示例数据为演示候选人）；includeSample=true 才会把本人内容作为样例分享。把返回的 json 内容存成文件或贴到 GitHub Issue/PR 即可上架。',
    parameters: {
      resumeId: str('要投稿的简历 id（必填）'),
      name: str('模板名，例如「静奢蓝灰」'),
      tagline: str('一句话介绍'),
      tags: textArray('标签，最多 6 个'),
      includeSample: bool('是否把自己的简历内容作为样例一起分享，默认 false'),
      author: str('作者署名，默认用设置里的作者'),
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) =>
        textResult([
          `投稿文件：${value.repoPath}`,
          `新文件链接：${value.newFileUrl}`,
          `Issue 链接：${value.issueUrl}`,
          '把 json 字段的内容贴进新文件/Issue 即可（CSS 和示例数据都已在里面）。',
        ]),
    },
    async execute(args) {
      const input = args || {};
      if (!input.resumeId) throw new Error('resume_publish_public 需要 resumeId');
      const result = await githubMarket.publishPayload(input);
      return {
        repo: result.repo,
        branch: result.branch,
        filename: result.filename,
        repoPath: result.repoPath,
        issueUrl: result.issueUrl,
        newFileUrl: result.newFileUrl,
        json: result.json,
      };
    },
  });

  return () => {
    for (const dispose of tools) {
      try {
        dispose();
      } catch {
        /* 卸载时忽略 */
      }
    }
  };
}
