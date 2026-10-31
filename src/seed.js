/**
 * 内置市场内容：首次启动时由「大肥鱼」放出的 3 套模板。
 *
 * 这些模板不出现在内置模板格里，只存在于市场（源码在 seed.js 里，用户可导入、
 * 导入后落到 store 的 templates 里）。这样即使没有网络，市场也有真内容可看。
 */
import { DEMO_RESUME_DATA, normalizeData } from './shared/doc.js';

function demo(overrides) {
  const data = JSON.parse(JSON.stringify(DEMO_RESUME_DATA));
  Object.assign(data.basics, (overrides && overrides.basics) || {});
  if (overrides && overrides.summary) data.summary = overrides.summary;
  if (overrides && overrides.experience) data.experience = overrides.experience;
  if (overrides && overrides.skills) data.skills = overrides.skills;
  return normalizeData(data);
}

const ACADEMIA_CSS = `
.rm-t-academia{padding:60px 66px 54px;color:#23202b;font-family:Georgia,"Songti SC","Noto Serif SC",serif;}
.rm-t-academia .rm-head{padding-bottom:18px;border-bottom:3px double #8a8296;}
.rm-t-academia .rm-name{font-size:32px;font-weight:600;letter-spacing:.16em;color:#3a3348;line-height:1.25;}
.rm-t-academia .rm-role{margin:8px 0 0;font-size:12.5px;color:#6f6880;letter-spacing:.08em;font-style:italic;}
.rm-t-academia .rm-contact{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px 18px;margin-top:16px;}
.rm-t-academia .rm-k{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;font-size:9.5px;letter-spacing:.14em;color:#9b93a8;text-transform:uppercase;}
.rm-t-academia .rm-v{font-size:12px;color:#413a4e;}
.rm-t-academia .rm-sec{margin-top:22px;}
.rm-t-academia .rm-sec-h{margin:0 0 10px;padding-bottom:4px;border-bottom:1px solid #ded8e6;}
.rm-t-academia .rm-sec-t{font-size:13px;font-weight:600;letter-spacing:.22em;color:#4a3f5e;}
.rm-t-academia .rm-item-t{font-weight:600;color:#2f2839;}
.rm-t-academia .rm-date{font-family:Georgia,serif;font-style:italic;color:#8b8299;}
.rm-t-academia .rm-tag{border:0;background:transparent;padding:0;color:#5a5068;font-size:12px;}
.rm-t-academia .rm-tags{gap:2px 8px;}
.rm-t-academia .rm-skill-row{grid-template-columns:92px minmax(0,1fr);}
.rm-t-academia .rm-bullets li::marker{color:#a99fbb;}
`;

const FINANCE_CSS = `
.rm-t-finance{padding:46px 52px 40px;color:#12212f;font-size:12.5px;line-height:1.55;}
.rm-t-finance .rm-head{padding-bottom:14px;border-bottom:3px solid #0f2b46;}
.rm-t-finance .rm-name{font-size:30px;font-weight:700;letter-spacing:.02em;color:#0f2b46;}
.rm-t-finance .rm-role{margin:5px 0 0;font-size:12px;color:#3d5a75;letter-spacing:.08em;text-transform:uppercase;}
.rm-t-finance .rm-contact{grid-template-columns:repeat(3,minmax(0,1fr));gap:5px 18px;margin-top:12px;padding:9px 12px;background:#f2f5f8;border-left:3px solid #0f2b46;}
.rm-t-finance .rm-k{font-size:9.5px;letter-spacing:.1em;color:#7a8ea1;text-transform:uppercase;}
.rm-t-finance .rm-v{font-size:11.5px;color:#1b3348;}
.rm-t-finance .rm-sec{margin-top:18px;}
.rm-t-finance .rm-sec-h{margin:0 0 8px;padding-bottom:3px;border-bottom:1px solid #cfd9e3;}
.rm-t-finance .rm-sec-t{font-size:11.5px;font-weight:700;letter-spacing:.22em;color:#0f2b46;text-transform:uppercase;}
.rm-t-finance .rm-item-t{color:#0f2b46;font-weight:700;}
.rm-t-finance .rm-item-role{color:#3d5a75;}
.rm-t-finance .rm-tag{border-radius:2px;border-color:#d3dde7;background:#f7f9fb;color:#2b4761;font-size:11px;}
.rm-t-finance .rm-date{color:#5b7288;}
.rm-t-finance .rm-skill-row{grid-template-columns:96px minmax(0,1fr);gap:8px;margin-bottom:4px;}
`;

const VIBRANT_CSS = `
.rm-t-vibrant{padding:50px 56px 46px;color:#2b2420;}
.rm-t-vibrant .rm-head{padding:22px 26px;border-radius:14px;background:linear-gradient(120deg,#fff2e8 0%,#ffe3cf 60%,#ffd6b8 100%);}
.rm-t-vibrant .rm-name{font-size:33px;font-weight:800;letter-spacing:.02em;color:#7a3812;line-height:1.2;}
.rm-t-vibrant .rm-role{margin:6px 0 0;font-size:13px;color:#b4571f;font-weight:600;}
.rm-t-vibrant .rm-contact{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px 14px;margin-top:16px;}
.rm-t-vibrant .rm-k{font-size:10px;color:#b8612b;font-weight:600;}
.rm-t-vibrant .rm-v{font-size:12px;color:#4a3629;}
.rm-t-vibrant .rm-sec{margin-top:20px;}
.rm-t-vibrant .rm-sec-h{margin:0 0 9px;gap:6px;}
.rm-t-vibrant .rm-sec-t{font-size:13px;font-weight:800;letter-spacing:.08em;color:#8a3d12;}
.rm-t-vibrant .rm-sec-h::after{content:"";flex:1;height:3px;border-radius:2px;background:linear-gradient(90deg,#f2711c,#ffc27a);align-self:center;margin-left:8px;}
.rm-t-vibrant .rm-tag{border-color:#ffd2ad;background:#fff7ef;color:#a64d16;}
.rm-t-vibrant .rm-bullets li::marker{color:#f2711c;}
.rm-t-vibrant .rm-skill-row{grid-template-columns:96px minmax(0,1fr);}
`;

const ACADEMIA_SAMPLE = demo({
  basics: { name: '周慕云', role: '社会学博士 · 城市研究方向', phone: '139 0011 2233', email: 'muyun.zhou@example.com', city: '北京', wechat: 'zhou-muyun', github: '', website: 'muyun.academia.example' },
  summary: '社会学博士，研究城市更新与社区治理。博士期间主持 1 项省级课题，发表 CSSCI 论文 3 篇，其中 1 篇被《人大复印资料》全文转载。',
  experience: [
    { company: '某大学社会学系', role: '博士研究生 / 助教', period: '2019.09 — 2024.06', location: '北京', bullets: ['主持省级课题「老旧小区改造中的居民参与机制」，覆盖 6 个社区、428 份问卷。', '协助讲授《城市社会学》课程 4 学期，独立带教 32 名本科生。'] },
  ],
  skills: [
    { group: '研究方法', items: '深度访谈、参与式观察、问卷设计、SPSS、NVivo' },
    { group: '语言', items: '英语（学术写作）、日语（N2）' },
  ],
});

const FINANCE_SAMPLE = demo({
  basics: { name: '沈砚', role: '投资银行部分析师 · 消费与零售组', phone: '137 0099 2211', email: 'yan.shen@example.com', city: '深圳', wechat: '', github: '', website: '' },
  summary: '3 年投行经验，参与 6 单 IPO 与 2 单并购项目，累计交易规模约 48 亿元。熟悉消费行业财务模型与尽调流程。',
  experience: [
    { company: '某证券投资银行部', role: '分析师', period: '2022.07 — 至今', location: '深圳', bullets: ['参与 3 单消费类 IPO 项目，负责财务核查与招股书财务章节撰写。', '搭建 DCF 与可比公司估值模型，支持 2 单并购交易的定价讨论。'] },
  ],
  skills: [
    { group: '专业能力', items: '财务建模、尽职调查、估值分析、招股书撰写' },
    { group: '工具', items: 'Excel（VBA）、Wind、Bloomberg、PPT' },
  ],
});

/** @returns {object[]} 市场条目（每次调用返回新对象，可直接写进 store）。 */
export function seedMarket() {
  return [
    {
      id: 'seed-academia',
      kind: 'template',
      templateId: 'mkt-academia',
      cls: 'rm-t-academia',
      name: '学术科研',
      en: 'Academia',
      tagline: '衬线字与双线分割，像论文扉页一样克制。适合博士、科研与教职申请。',
      tags: ['学术', '科研', '教职'],
      accent: '#6f6880',
      desc: '单栏 · 衬线排版 · 三列信息 · 适合论文/教职简历',
      css: ACADEMIA_CSS,
      author: '大肥鱼',
      source: 'seed',
      installs: 168,
      likes: 132,
      createdAt: '2026-09-12T02:10:00.000Z',
      sample: ACADEMIA_SAMPLE,
    },
    {
      id: 'seed-finance',
      kind: 'template',
      templateId: 'mkt-finance',
      cls: 'rm-t-finance',
      name: '金融投行',
      en: 'Finance',
      tagline: '深海军蓝色块 + 紧凑行距，把「能扛住加班」写在版面上。',
      tags: ['金融', '投行', '咨询'],
      accent: '#0f2b46',
      desc: '单栏 · 高密度 · 蓝灰信息条 · 适合投行/咨询/审计',
      css: FINANCE_CSS,
      author: '大肥鱼',
      source: 'seed',
      installs: 241,
      likes: 205,
      createdAt: '2026-09-18T09:40:00.000Z',
      sample: FINANCE_SAMPLE,
    },
    {
      id: 'seed-vibrant',
      kind: 'template',
      templateId: 'mkt-vibrant',
      cls: 'rm-t-vibrant',
      name: '活力橙',
      en: 'Vibrant',
      tagline: '暖橙色圆角页眉，友好但不轻浮。适合运营、增长与内容岗位。',
      tags: ['运营', '增长', '内容'],
      accent: '#f2711c',
      desc: '单栏 · 圆角色块 · 强调标题 · 适合互联网运营/市场',
      css: VIBRANT_CSS,
      author: '大肥鱼',
      source: 'seed',
      installs: 97,
      likes: 88,
      createdAt: '2026-09-26T13:05:00.000Z',
      sample: demo({}),
    },
  ];
}
