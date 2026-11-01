/**
 * 共享文档层：模板定义、结构化数据规范化、A4 简历 HTML 渲染。
 *
 * 这个文件同时被两处使用：
 *  - Host（src/index.js 侧）：导出 PDF、agent 工具生成文件；
 *  - Client（lib/client.js）：面板内的实时预览。
 * 构建脚本 build/build.mjs 会把本文件去掉 `export` 关键字后内联进客户端 bundle，
 * 因此这里只允许出现纯 JS / 字符串，不要 import、不要依赖 Node API。
 */

/** A4 纸在 96dpi 下的像素尺寸。 */
const PAPER_W = 794;
const PAPER_H = 1123;

const SECTION_ORDER = ['summary', 'experience', 'projects', 'education', 'skills', 'awards'];

const LABELS = {
  zh: {
    summary: '个人简介',
    experience: '工作经历',
    projects: '项目经历',
    education: '教育背景',
    skills: '专业技能',
    awards: '荣誉奖项',
    phone: '电话',
    email: '邮箱',
    city: '城市',
    wechat: '微信',
    github: 'GitHub',
    website: '主页',
    role: '求职意向',
    namePlaceholder: '你的名字',
    empty: '（待填写）',
    present: '至今',
    courses: '主修课程',
  },
  en: {
    summary: 'SUMMARY',
    experience: 'EXPERIENCE',
    projects: 'PROJECTS',
    education: 'EDUCATION',
    skills: 'SKILLS',
    awards: 'AWARDS',
    phone: 'Phone',
    email: 'Email',
    city: 'Location',
    wechat: 'WeChat',
    github: 'GitHub',
    website: 'Website',
    role: 'Target role',
    namePlaceholder: 'Your Name',
    empty: '(to fill)',
    present: 'Present',
    courses: 'Key courses',
  },
};

/** 基础纸张/排版规则，模板 CSS 在其后覆盖。 */
const BASE_CSS = `
.rm-paper{width:${PAPER_W}px;min-height:${PAPER_H}px;background:#ffffff;}
.rm-doc{box-sizing:border-box;background:#ffffff;color:#1d2129;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Noto Sans SC","Segoe UI",sans-serif;font-size:13.5px;line-height:1.62;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-wrap:break-word;}
.rm-doc *{box-sizing:border-box;}
.rm-doc .rm-head{display:block;}
.rm-doc .rm-head.rm-has-photo{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:26px;align-items:start;}
.rm-doc .rm-head.rm-has-photo.rm-photo-left{grid-template-columns:auto minmax(0,1fr);}
.rm-doc .rm-head-main{min-width:0;}
.rm-doc .rm-photo{flex:0 0 auto;width:96px;height:96px;overflow:hidden;background:#f2f4f7;border:1px solid #e3e7ee;}
.rm-doc .rm-photo img{display:block;width:100%;height:100%;object-fit:cover;}
.rm-doc .rm-photo-circle{border-radius:50%;}
.rm-doc .rm-photo-square{border-radius:6px;}
.rm-doc .rm-head.rm-has-photo .rm-contact{grid-template-columns:repeat(2,minmax(0,1fr));flex:none;width:auto;margin-top:12px;}
.rm-doc .rm-id{min-width:0;}
.rm-doc .rm-name{margin:0;}
.rm-doc .rm-role{margin:6px 0 0;}
.rm-doc .rm-contact{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 28px;margin:14px 0 0;padding:0;list-style:none;}
.rm-doc .rm-c{display:flex;align-items:baseline;gap:8px;min-width:0;}
.rm-doc .rm-k{flex:0 0 auto;font-size:10.5px;letter-spacing:.06em;color:#8b929c;white-space:nowrap;}
.rm-doc .rm-v{min-width:0;font-size:12.5px;overflow-wrap:anywhere;}
.rm-doc .rm-body{display:block;}
.rm-doc .rm-sec{margin-top:20px;break-inside:avoid;}
.rm-doc .rm-sec-h{display:flex;align-items:baseline;gap:8px;margin:0 0 9px;}
.rm-doc .rm-sec-t{display:inline-block;}
.rm-doc .rm-items{display:block;}
.rm-doc .rm-item{margin:0 0 11px;break-inside:avoid;}
.rm-doc .rm-item:last-child{margin-bottom:0;}
.rm-doc .rm-row{display:flex;justify-content:space-between;align-items:baseline;gap:14px;}
.rm-doc .rm-item-main{min-width:0;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;}
.rm-doc .rm-item-t{font-weight:600;}
.rm-doc .rm-item-role{color:#5a616c;font-size:12.5px;}
.rm-doc .rm-date{flex:0 0 auto;font-size:11.5px;color:#8b929c;font-variant-numeric:tabular-nums;letter-spacing:.02em;white-space:nowrap;}
.rm-doc .rm-item-sub{margin-top:2px;font-size:12px;color:#6b7280;}
.rm-doc .rm-edu-courses{margin:2px 0 0;font-size:11.5px;line-height:1.55;color:#6b7280;overflow-wrap:anywhere;}
.rm-doc .rm-edu-courses .rm-k{margin-right:8px;font-size:10.5px;letter-spacing:.06em;color:#8b929c;white-space:nowrap;}
.rm-doc .rm-bullets{margin:4px 0 0;padding-left:16px;}
.rm-doc .rm-bullets li{margin:2px 0;}
.rm-doc .rm-bullets li::marker{color:#9aa1ab;}
.rm-doc .rm-summary{margin:0;}
.rm-doc .rm-tags{display:flex;flex-wrap:wrap;gap:6px;}
.rm-doc .rm-tag{display:inline-block;border:1px solid #dfe3e8;background:#fbfcfd;border-radius:999px;padding:1px 9px;font-size:11.5px;line-height:1.7;color:#4b5563;}
.rm-doc .rm-skill-row{display:grid;grid-template-columns:104px minmax(0,1fr);gap:10px;margin:0 0 6px;align-items:baseline;}
.rm-doc .rm-skill-k{color:#5a616c;font-size:12.5px;}
.rm-doc .rm-award-row{display:flex;justify-content:space-between;gap:14px;margin:0 0 6px;align-items:baseline;}
.rm-doc .rm-award-t{font-weight:500;}
.rm-doc .rm-award-desc{color:#6b7280;font-size:12px;}
.rm-doc .rm-para{margin:0 0 6px;}
.rm-doc strong{font-weight:650;color:#111827;}
`;

/** 打印/导出专用：A4 无边距，避免内容被分页切开。 */
const PRINT_CSS = `
@page{size:A4;margin:0;}
html,body{margin:0;padding:0;background:#ffffff;}
body.rm-export{display:flex;justify-content:center;}
.rm-export .rm-paper{width:${PAPER_W}px;min-height:${PAPER_H}px;margin:0 auto;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
@media print{
  html,body{width:210mm;height:297mm;}
  .rm-export .rm-paper{width:210mm;min-height:297mm;box-shadow:none;}
  .rm-doc .rm-sec,.rm-doc .rm-item{break-inside:avoid;}
}
`;

const TEMPLATES = [
  {
    id: 'business-minimal',
    name: '商务极简',
    en: 'Business Minimal',
    tagline: '黑白灰，字号与留白说话。招聘官最熟悉的那一类安全牌。',
    tags: ['通用', '互联网', '外企'],
    accent: '#1f2328',
    desc: '单栏 · 信息密度中等 · 适合社招与跳槽',
    css: `
.rm-t-business{padding:54px 60px 46px;}
.rm-t-business .rm-head{padding-bottom:18px;border-bottom:1px solid #d8dce2;}
.rm-t-business .rm-name{font-size:34px;line-height:1.16;font-weight:600;letter-spacing:.14em;}
.rm-t-business .rm-role{margin:7px 0 0;font-size:13px;color:#5b626d;letter-spacing:.08em;}
.rm-t-business .rm-contact{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 44px;margin-top:16px;}
.rm-t-business .rm-k{font-size:10px;letter-spacing:.16em;color:#9ba1ab;text-transform:uppercase;}
.rm-t-business .rm-v{font-size:12.5px;color:#333941;}
.rm-t-business .rm-sec{margin-top:24px;}
.rm-t-business .rm-sec-h{margin:0 0 10px;padding-bottom:6px;border-bottom:1px solid #e6e9ee;}
.rm-t-business .rm-sec-t{font-size:12.5px;font-weight:600;letter-spacing:.24em;color:#111827;}
.rm-t-business .rm-tag{border:0;background:transparent;padding:0;border-radius:0;color:#4b5563;font-size:12px;}
.rm-t-business .rm-skill-row{grid-template-columns:92px minmax(0,1fr);}
.rm-t-business .rm-tags{gap:2px 10px;}
`,
  },
  {
    id: 'quiet-luxury',
    name: '静奢蓝灰',
    en: 'Quiet Luxury',
    tagline: '低饱和蓝灰 + 编号章节，安静但有分量。适合产品、咨询、品牌。',
    tags: ['产品', '咨询', '资深'],
    accent: '#5f7896',
    desc: '单栏 · 编号章节 · 适合 5 年以上经验',
    css: `
.rm-t-luxury{padding:56px 62px 50px;counter-reset:rmsec;color:#2a3442;}
.rm-t-luxury .rm-head{display:flex;justify-content:space-between;align-items:flex-end;gap:34px;padding-bottom:20px;border-bottom:2px solid #c8d3e0;}
.rm-t-luxury .rm-name{font-family:Georgia,"Songti SC","Noto Serif SC",serif;font-size:34px;font-weight:500;letter-spacing:.1em;color:#1f2b3d;line-height:1.2;}
.rm-t-luxury .rm-role{margin:8px 0 0;font-size:12px;color:#7d8a9c;letter-spacing:.18em;text-transform:uppercase;}
.rm-t-luxury .rm-contact{flex:0 0 300px;grid-template-columns:1fr 1fr;gap:5px 18px;margin:0;}
.rm-t-luxury .rm-k{font-size:9.5px;letter-spacing:.12em;color:#93a2b8;text-transform:uppercase;}
.rm-t-luxury .rm-v{font-size:12px;color:#33405a;}
.rm-t-luxury .rm-sec{margin-top:23px;}
.rm-t-luxury .rm-sec-h{margin:0 0 10px;gap:10px;}
.rm-t-luxury .rm-sec-h::before{content:"0" counter(rmsec);counter-increment:rmsec;font-family:Georgia,serif;font-size:11px;color:#9db0c6;letter-spacing:.1em;}
.rm-t-luxury .rm-sec-t{font-size:12px;font-weight:600;letter-spacing:.32em;color:#3d4c61;text-transform:uppercase;}
.rm-t-luxury .rm-item-role{color:#6e7d92;}
.rm-t-luxury .rm-date{color:#8193aa;}
.rm-t-luxury .rm-tag{border-color:#dbe3ee;background:#f7f9fc;color:#44536b;}
.rm-t-luxury .rm-skill-k{color:#6e7d92;}
.rm-t-luxury .rm-skill-row{grid-template-columns:112px minmax(0,1fr);}
`,
  },
  {
    id: 'fresh-creative',
    name: '清新创意',
    en: 'Fresh Creative',
    tagline: '淡青渐层色带，轻快但不幼稚。适合设计、运营与应届同学。',
    tags: ['设计', '运营', '应届'],
    accent: '#7ccab6',
    desc: '单栏 · 整幅色带页眉 · 适合作品型岗位',
    css: `
.rm-t-fresh{padding:0 0 44px;color:#22343a;}
.rm-t-fresh .rm-head{padding:38px 48px 26px;background:linear-gradient(125deg,#e4f6f1 0%,#f3fbf8 55%,#ffffff 100%);border-bottom:3px solid #7ccab6;}
.rm-t-fresh .rm-name{font-size:36px;font-weight:700;letter-spacing:.06em;color:#135c4f;line-height:1.18;}
.rm-t-fresh .rm-role{margin:7px 0 0;color:#3c8e7c;font-size:13px;letter-spacing:.04em;}
.rm-t-fresh .rm-contact{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 16px;margin-top:16px;}
.rm-t-fresh .rm-k{padding:0 6px;border-radius:4px;background:#d9f0e9;color:#2b7d6c;font-size:10px;letter-spacing:.02em;}
.rm-t-fresh .rm-v{font-size:12px;color:#2c4a46;}
.rm-t-fresh .rm-body{padding:0 48px;}
.rm-t-fresh .rm-sec{margin-top:23px;}
.rm-t-fresh .rm-sec-h{margin:0 0 10px;gap:8px;}
.rm-t-fresh .rm-sec-t{font-size:13px;font-weight:700;color:#175e52;letter-spacing:.1em;position:relative;padding-left:12px;}
.rm-t-fresh .rm-sec-t::before{content:"";position:absolute;left:0;top:3px;bottom:3px;width:4px;border-radius:2px;background:#7ccab6;}
.rm-t-fresh .rm-tag{border-color:#bfe4d9;background:#f2fbf8;color:#2f7a6b;}
.rm-t-fresh .rm-item-t{color:#135c4f;}
.rm-t-fresh .rm-date{color:#7c9b94;}
.rm-t-fresh .rm-bullets li::marker{color:#7ccab6;}
`,
  },
  {
    id: 'compact-one',
    name: '紧凑单栏',
    en: 'Compact One',
    tagline: '信息密度拉满，一页装下十年经历。资深候选人与转岗同学友好。',
    tags: ['资深', '转岗', '多段经历'],
    accent: '#3f4753',
    desc: '单栏 · 高密度 · 适合经历多的候选人',
    css: `
.rm-t-compact{padding:38px 44px 34px;font-size:12.2px;line-height:1.55;}
.rm-t-compact .rm-head{display:flex;justify-content:space-between;align-items:flex-start;gap:28px;padding-bottom:12px;border-bottom:1px solid #dfe3e8;}
.rm-t-compact .rm-name{font-size:27px;font-weight:600;letter-spacing:.08em;}
.rm-t-compact .rm-role{margin:4px 0 0;font-size:12px;color:#5f6670;}
.rm-t-compact .rm-contact{flex:0 0 336px;grid-template-columns:1fr 1fr;gap:3px 14px;margin:0;}
.rm-t-compact .rm-k{font-size:9.5px;color:#98a0aa;}
.rm-t-compact .rm-v{font-size:11.5px;}
.rm-t-compact .rm-sec{margin-top:15px;}
.rm-t-compact .rm-sec-h{margin:0 0 6px;gap:0;}
.rm-t-compact .rm-sec-t{font-size:11.5px;font-weight:700;letter-spacing:.16em;color:#2c3138;}
.rm-t-compact .rm-sec-h::after{content:"";flex:1;height:1px;margin-left:10px;background:#eceef1;align-self:center;}
.rm-t-compact .rm-item{margin-bottom:9px;}
.rm-t-compact .rm-date{font-size:11px;}
.rm-t-compact .rm-item-role{font-size:12px;}
.rm-t-compact .rm-tag{border:0;background:transparent;padding:0;font-size:12px;color:#4b5563;}
.rm-t-compact .rm-tags{gap:1px 8px;}
.rm-t-compact .rm-skill-row{grid-template-columns:88px minmax(0,1fr);gap:8px;margin-bottom:3px;}
`,
  },
  {
    id: 'timeline-pro',
    name: '时间轴',
    en: 'Timeline',
    tagline: '左侧细时间轴把经历串成线，节奏清楚，跳槽与晋升一眼可见。',
    tags: ['职业成长', '技术', '管理'],
    accent: '#2f6fde',
    desc: '单栏 · 时间轴 · 适合有明显成长线的人',
    css: `
.rm-t-timeline{padding:50px 56px 46px;color:#1f2937;}
.rm-t-timeline .rm-head{padding-left:20px;border-left:3px solid #2f6fde;}
.rm-t-timeline .rm-name{font-size:32px;font-weight:650;letter-spacing:.08em;color:#1f3352;}
.rm-t-timeline .rm-role{margin:6px 0 0;font-size:12.5px;color:#4b6a95;}
.rm-t-timeline .rm-contact{grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 34px;margin-top:16px;}
.rm-t-timeline .rm-k{font-size:10px;letter-spacing:.1em;color:#8ba3c6;}
.rm-t-timeline .rm-v{font-size:12.5px;color:#2b3b53;}
.rm-t-timeline .rm-sec{margin-top:22px;}
.rm-t-timeline .rm-sec-h{margin:0 0 8px;padding-bottom:5px;border-bottom:1px solid #dfe7f4;}
.rm-t-timeline .rm-sec-t{font-size:12.5px;font-weight:700;letter-spacing:.18em;color:#1f3352;}
.rm-t-timeline .rm-items{position:relative;margin-left:4px;padding-left:18px;border-left:1px solid #dbe4f1;}
.rm-t-timeline .rm-item{position:relative;margin-bottom:12px;}
.rm-t-timeline .rm-item::before{content:"";position:absolute;left:-23px;top:6px;width:8px;height:8px;border-radius:50%;background:#2f6fde;box-shadow:0 0 0 3px #eaf0fb;}
.rm-t-timeline .rm-tag{border-color:#d5e2f5;background:#f5f9ff;color:#31598f;}
.rm-t-timeline .rm-skill-row{grid-template-columns:100px minmax(0,1fr);}
`,
  },
  {
    id: 'tech-grid',
    name: '科技网格',
    en: 'Tech Grid',
    tagline: '蓝黑网格与等宽小标签，克制、精确，研发与数据岗的舒适区。',
    tags: ['研发', '数据', '算法'],
    accent: '#2c5f96',
    desc: '单栏 · 网格线 · 适合工程与数据岗位',
    css: `
.rm-t-tech{padding:48px 54px 44px;color:#16202e;background:linear-gradient(180deg,#fbfdff 0%,#ffffff 260px);}
.rm-t-tech .rm-head{display:flex;justify-content:space-between;align-items:flex-end;gap:30px;padding-bottom:16px;border-bottom:2px solid #14233a;}
.rm-t-tech .rm-name{font-size:31px;font-weight:600;letter-spacing:.06em;color:#10213a;}
.rm-t-tech .rm-role{margin:6px 0 0;font-size:12.5px;color:#3d6ea8;}
.rm-t-tech .rm-contact{flex:0 0 338px;grid-template-columns:1fr 1fr;gap:4px 16px;margin:0;}
.rm-t-tech .rm-k{font-family:Consolas,"SFMono-Regular",monospace;font-size:9.5px;color:#5d7fa8;letter-spacing:.06em;}
.rm-t-tech .rm-v{font-size:11.5px;color:#1d3350;}
.rm-t-tech .rm-sec{margin-top:19px;}
.rm-t-tech .rm-sec-h{margin:0 0 8px;padding-bottom:5px;border-bottom:1px solid #d9e3f0;gap:8px;}
.rm-t-tech .rm-sec-t{font-size:12px;font-weight:700;letter-spacing:.14em;color:#133a63;}
.rm-t-tech .rm-sec-t::before{content:"#";color:#7ba7d8;margin-right:4px;font-family:Consolas,monospace;}
.rm-t-tech .rm-tag{border-color:#cddff2;background:#f4f9ff;color:#2c5f96;font-size:11px;}
.rm-t-tech .rm-date{font-family:Consolas,"SFMono-Regular",monospace;font-size:11px;color:#6889ae;}
.rm-t-tech .rm-skill-row{grid-template-columns:104px minmax(0,1fr);}
.rm-t-tech .rm-item-t{color:#10213a;}
`,
  },
  {
    id: 'banner-exec',
    name: '青金分栏',
    en: 'Banner Exec',
    tagline: '斜切色带标题 + 金色细线分栏，稳重又不呆板；行政、国企与综合管理岗很吃这套。',
    tags: ['行政', '国企', '综合管理'],
    accent: '#2c6474',
    desc: '斜切色带 · 双色分栏 · 大标题页眉',
    css: `
.rm-t-banner-exec{padding:0 0 52px;color:#26343a;background:#fff;font-family:Georgia,"Songti SC","Noto Serif SC",serif;}
.rm-t-banner-exec .rm-head{position:relative;padding:46px 58px 34px;background:linear-gradient(180deg,#edf4f6 0%,#f9fcfd 76%,#ffffff 100%);}
.rm-t-banner-exec .rm-head::before{content:"";position:absolute;right:62px;top:40px;width:44px;height:44px;border-radius:50%;background:linear-gradient(145deg,#dcbf58,#b8912c);box-shadow:-66px 0 0 -4px rgba(201,162,39,.92);}
.rm-t-banner-exec .rm-head::after{content:"";position:absolute;left:0;right:0;bottom:0;height:13px;background:linear-gradient(90deg,#2c6474 0 52%,#c9a227 52% 100%);clip-path:polygon(0 0,100% 0,calc(100% - 54px) 100%,0 100%);}
.rm-t-banner-exec .rm-name{padding-right:150px;font-size:42px;font-weight:600;letter-spacing:.22em;color:#1d3d4d;line-height:1.16;}
.rm-t-banner-exec .rm-name::after{content:"";display:inline-block;width:2px;height:40px;margin-left:24px;vertical-align:-5px;background:linear-gradient(180deg,#c9a227,#e9d7a0);}
.rm-t-banner-exec .rm-role{margin:7px 0 0 3px;font-family:Georgia,"Songti SC",serif;font-size:12px;letter-spacing:.42em;color:#4f7d90;text-transform:uppercase;}
.rm-t-banner-exec .rm-contact{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 40px;margin:24px 0 0;max-width:566px;}
.rm-t-banner-exec .rm-k{font-size:9.5px;letter-spacing:.3em;color:#8aa3ac;}
.rm-t-banner-exec .rm-v{font-size:12.5px;color:#22323a;}
.rm-t-banner-exec .rm-sec{margin-top:26px;padding:0 58px;}
.rm-t-banner-exec .rm-sec-h{position:relative;margin:0 0 12px;padding-bottom:3px;border-bottom:1px solid #c9a227;}
.rm-t-banner-exec .rm-sec-t{display:inline-block;padding:7px 46px 7px 20px;background:linear-gradient(100deg,#2c6474 0%,#3d7d8f 100%);color:#fff;font-size:13px;font-weight:600;letter-spacing:.3em;clip-path:polygon(0 0,100% 0,calc(100% - 18px) 100%,0 100%);}
.rm-t-banner-exec .rm-sec-h::before{content:"";position:absolute;left:-10px;top:2px;width:5px;height:calc(100% - 8px);background:#c9a227;}
.rm-t-banner-exec .rm-item{margin-bottom:13px;}
.rm-t-banner-exec .rm-item-t{font-weight:600;color:#1d3d4d;}
.rm-t-banner-exec .rm-date{font-size:11.5px;color:#6b8b94;}
.rm-t-banner-exec .rm-bullets li{margin:4px 0;}
.rm-t-banner-exec .rm-bullets li::marker{color:#c9a227;}
.rm-t-banner-exec .rm-tag{border:1px solid #d7e3e6;border-radius:2px;background:#f6fafb;color:#35626f;}
.rm-t-banner-exec .rm-edu-courses .rm-k{color:#8aa3ac;}
.rm-t-banner-exec .rm-skill-row{grid-template-columns:104px minmax(0,1fr);}
.rm-t-banner-exec .rm-item-main{color:#1d3d4d;}
`,
  },
];

/** 内置模板示例数据：用于模板缩略图与市场里「大肥鱼」的样张。 */
const DEMO_RESUME_DATA = {
  basics: {
    name: '林知夏',
    role: '高级产品经理 · 8 年 B 端产品经验',
    phone: '138 0013 8000',
    email: 'zhixia.lin@example.com',
    city: '上海',
    wechat: 'linzhixia-pm',
    github: 'github.com/linzhixia',
    website: 'zhixia.design',
  },
  summary:
    '8 年 B 端产品经验，主导 3 个从 0 到 1 的 SaaS 产品，其中 2 个年营收过千万。擅长把模糊的业务诉求拆成可落地的方案，推动设计、研发、运营跨团队协作。',
  experience: [
    {
      company: '星野科技',
      role: '高级产品经理',
      period: '2021.06 — 至今',
      location: '上海',
      bullets: [
        '负责企业协作平台产品线，MAU 从 12 万提升至 58 万，续费率 **+18%**。',
        '重构权限与工作流引擎，交付周期缩短 40%，支撑 200+ 企业客户的自定义配置。',
        '搭建产品数据看板，把需求评审到上线的平均周期从 21 天压缩到 12 天。',
      ],
    },
    {
      company: '云枢网络',
      role: '产品经理',
      period: '2018.03 — 2021.05',
      location: '杭州',
      bullets: [
        '从 0 到 1 设计客户成功 SaaS，首年签约 120 家企业，ARR 突破 1800 万。',
        '主导移动端改版，核心任务完成率提升 27%，客服咨询量下降 22%。',
      ],
    },
  ],
  projects: [
    {
      name: '企业工作流引擎 2.0',
      role: '产品负责人',
      period: '2022.03 — 2022.11',
      bullets: [
        '抽象 5 类可视化节点，让非技术人员也能自己配置审批流。',
        '上线 6 个月覆盖 78% 付费客户，相关工单下降 63%。',
      ],
    },
  ],
  education: [
    {
      school: '华东师范大学',
      degree: '硕士',
      major: '信息管理',
      period: '2015.09 — 2018.01',
      gpa: '3.8 / 4.0',
    },
  ],
  skills: [
    { group: '产品能力', items: '需求分析、产品规划、数据驱动、用户研究' },
    { group: '工具', items: 'Axure、Figma、SQL、Mixpanel、Jira' },
  ],
  awards: [
    { title: '年度最佳产品奖', date: '2023.12', desc: '星野科技' },
    { title: '中国 SaaS 产品创新大赛 银奖', date: '2020.09', desc: '' },
  ],
};

/**
 * 照片字段只收内嵌图片或 http(s) 链接，避免 javascript: / data:text 之类的注入。
 * 编辑器上传时会先缩到 480px 再转 JPEG，这里再兜一次长度上限。
 */
function normalizePhoto(value) {
  if (typeof value !== 'string') return '';
  const s = value.trim();
  if (!s || s.length > 3000000) return '';
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(s)) return s;
  if (/^https?:\/\/[^\s"'<>]+$/i.test(s) && s.length <= 1000) return s;
  return '';
}

/**
 * 把简历数据规范化成渲染器认识的形状。
 * agent 工具和前端编辑都可能传进任意 JSON，这里做一次收敛与长度保护。
 * @param {object} raw
 * @returns {object}
 */
function normalizeData(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const basicsSrc = src.basics && typeof src.basics === 'object' ? src.basics : {};
  const str = (v, max) => {
    if (v === null || v === undefined) return '';
    let s = typeof v === 'string' ? v.trim() : String(v).trim();
    if (max && s.length > max) s = s.slice(0, max);
    return s;
  };
  const list = (v, max) => {
    if (!Array.isArray(v)) return [];
    const out = [];
    for (let i = 0; i < Math.min(v.length, max); i++) {
      const item = v[i];
      if (item === null || item === undefined) continue;
      if (typeof item === 'string') {
        const s = str(item, 800);
        if (s) out.push(s);
      }
    }
    return out;
  };
  const arr = (v, max) => {
    if (!Array.isArray(v)) return [];
    return v.filter((x) => x && typeof x === 'object').slice(0, max);
  };
  return {
    basics: {
      name: str(basicsSrc.name, 40),
      role: str(basicsSrc.role, 80),
      phone: str(basicsSrc.phone, 40),
      email: str(basicsSrc.email, 80),
      city: str(basicsSrc.city, 40),
      wechat: str(basicsSrc.wechat, 40),
      github: str(basicsSrc.github, 80),
      website: str(basicsSrc.website, 80),
      // 可选照片：只接受内嵌图片或 http(s) 链接；位置 / 形状控制排版。
      photo: normalizePhoto(basicsSrc.photo),
      photoSide: basicsSrc.photoSide === 'left' ? 'left' : 'right',
      photoShape: basicsSrc.photoShape === 'square' ? 'square' : 'circle',
    },
    summary: str(src.summary, 1200),
    experience: arr(src.experience, 12).map((it) => ({
      company: str(it.company, 60),
      role: str(it.role, 60),
      period: str(it.period, 40),
      location: str(it.location, 40),
      bullets: list(it.bullets, 10),
    })),
    projects: arr(src.projects, 10).map((it) => ({
      name: str(it.name, 80),
      role: str(it.role, 60),
      period: str(it.period, 40),
      bullets: list(it.bullets, 10),
    })),
    education: arr(src.education, 6).map((it) => ({
      school: str(it.school, 60),
      degree: str(it.degree, 30),
      major: str(it.major, 60),
      period: str(it.period, 40),
      gpa: str(it.gpa, 30),
      // 可选主修课程：一行字符串（用顿号/逗号分隔），空字符串表示不展示。
      courses: str(it.courses, 200),
    })),
    skills: arr(src.skills, 10).map((it) => ({
      group: str(it.group, 30),
      items: Array.isArray(it.items) ? str(it.items.join('、'), 300) : str(it.items, 300),
    })),
    awards: arr(src.awards, 10).map((it) => ({
      title: str(it.title, 100),
      date: str(it.date, 30),
      desc: str(it.desc, 160),
    })),
  };
}

/** 新建一份空白简历（还没入库，id 由 store 分配）。 */
function emptyResume(templateId) {
  return {
    id: null,
    title: '我的简历',
    templateId: templateById(templateId).id,
    lang: 'zh',
    sections: SECTION_ORDER.slice(),
    data: normalizeData({}),
    createdAt: null,
    updatedAt: null,
  };
}

function templateById(id) {
  for (let i = 0; i < TEMPLATES.length; i++) {
    if (TEMPLATES[i].id === id) return TEMPLATES[i];
  }
  return TEMPLATES[0];
}

function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 转义后支持 **加粗**，其余按纯文本处理。 */
function rich(value) {
  return esc(value).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function richLines(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return text
    .split(/\r?\n/)
    .map((line) => rich(line))
    .join('<br/>');
}

function labelsOf(resume) {
  return LABELS[resume && resume.lang === 'en' ? 'en' : 'zh'];
}

const CONTACT_FIELDS = ['phone', 'email', 'city', 'wechat', 'github', 'website'];

function renderHead(data, L) {
  const b = data.basics || {};
  const fields = [];
  for (let i = 0; i < CONTACT_FIELDS.length; i++) {
    const key = CONTACT_FIELDS[i];
    const value = b[key];
    if (value) fields.push({ key: key, label: L[key] || key, value: value });
  }
  const idHtml = ['<div class="rm-id">'];
  idHtml.push('<h1 class="rm-name">' + esc(b.name || L.namePlaceholder) + '</h1>');
  if (b.role) idHtml.push('<p class="rm-role">' + esc(b.role) + '</p>');
  idHtml.push('</div>');
  const contactHtml = [];
  if (fields.length) {
    contactHtml.push('<ul class="rm-contact">');
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      contactHtml.push(
        '<li class="rm-c rm-c-' + f.key + '"><span class="rm-k">' + esc(f.label) +
          '</span><span class="rm-v">' + esc(f.value) + '</span></li>',
      );
    }
    contactHtml.push('</ul>');
  }
  const contact = contactHtml.join('');

  // 可选照片：有照片时把姓名 / 联系方式收进 .rm-head-main，照片放在左或右。
  if (b.photo) {
    const side = b.photoSide === 'left' ? 'left' : 'right';
    const shape = b.photoShape === 'square' ? 'square' : 'circle';
    const photo =
      '<div class="rm-photo rm-photo-' + shape + '"><img alt="" src="' + esc(b.photo) + '"></div>';
    const main = '<div class="rm-head-main">' + idHtml.join('') + contact + '</div>';
    return (
      '<header class="rm-head rm-has-photo rm-photo-' + side + '">' +
      (side === 'left' ? photo + main : main + photo) +
      '</header>'
    );
  }
  return '<header class="rm-head">' + idHtml.join('') + contact + '</header>';
}

function renderSummary(data, L) {
  if (!data.summary) return '';
  return (
    '<section class="rm-sec rm-sec-summary"><h2 class="rm-sec-h"><span class="rm-sec-t">' +
    esc(L.summary) +
    '</span></h2><p class="rm-summary">' +
    richLines(data.summary) +
    '</p></section>'
  );
}

function renderExperience(data, L) {
  const items = data.experience || [];
  if (!items.length) return '';
  const rows = items.map(function (it) {
    const h = ['<div class="rm-item"><div class="rm-row"><div class="rm-item-main">'];
    if (it.company) h.push('<span class="rm-item-t">' + esc(it.company) + '</span>');
    if (it.role) h.push('<span class="rm-item-role">' + esc(it.role) + '</span>');
    h.push('</div>');
    if (it.period) h.push('<div class="rm-date">' + esc(it.period) + '</div>');
    h.push('</div>');
    if (it.location) h.push('<div class="rm-item-sub">' + esc(it.location) + '</div>');
    if (it.bullets && it.bullets.length) {
      h.push('<ul class="rm-bullets">');
      for (let i = 0; i < it.bullets.length; i++) h.push('<li>' + rich(it.bullets[i]) + '</li>');
      h.push('</ul>');
    }
    h.push('</div>');
    return h.join('');
  });
  return (
    '<section class="rm-sec rm-sec-experience"><h2 class="rm-sec-h"><span class="rm-sec-t">' +
    esc(L.experience) +
    '</span></h2><div class="rm-items">' + rows.join('') + '</div></section>'
  );
}

function renderProjects(data, L) {
  const items = data.projects || [];
  if (!items.length) return '';
  const rows = items.map(function (it) {
    const h = ['<div class="rm-item"><div class="rm-row"><div class="rm-item-main">'];
    if (it.name) h.push('<span class="rm-item-t">' + esc(it.name) + '</span>');
    if (it.role) h.push('<span class="rm-item-role">' + esc(it.role) + '</span>');
    h.push('</div>');
    if (it.period) h.push('<div class="rm-date">' + esc(it.period) + '</div>');
    h.push('</div>');
    if (it.bullets && it.bullets.length) {
      h.push('<ul class="rm-bullets">');
      for (let i = 0; i < it.bullets.length; i++) h.push('<li>' + rich(it.bullets[i]) + '</li>');
      h.push('</ul>');
    }
    h.push('</div>');
    return h.join('');
  });
  return (
    '<section class="rm-sec rm-sec-projects"><h2 class="rm-sec-h"><span class="rm-sec-t">' +
    esc(L.projects) +
    '</span></h2><div class="rm-items">' + rows.join('') + '</div></section>'
  );
}

function renderEducation(data, L) {
  const items = data.education || [];
  if (!items.length) return '';
  const rows = items.map(function (it) {
    const sub = [it.degree, it.major].filter(Boolean).join(' · ');
    const h = ['<div class="rm-item"><div class="rm-row"><div class="rm-item-main">'];
    if (it.school) h.push('<span class="rm-item-t">' + esc(it.school) + '</span>');
    if (sub) h.push('<span class="rm-item-role">' + esc(sub) + '</span>');
    h.push('</div>');
    if (it.period) h.push('<div class="rm-date">' + esc(it.period) + '</div>');
    h.push('</div>');
    if (it.courses) {
      h.push(
        '<p class="rm-edu-courses"><span class="rm-k">' +
          esc(L.courses) +
          '</span>' +
          esc(it.courses) +
          '</p>'
      );
    }
    if (it.gpa) h.push('<div class="rm-item-sub">GPA ' + esc(it.gpa) + '</div>');
    h.push('</div>');
    return h.join('');
  });
  return (
    '<section class="rm-sec rm-sec-education"><h2 class="rm-sec-h"><span class="rm-sec-t">' +
    esc(L.education) +
    '</span></h2><div class="rm-items">' + rows.join('') + '</div></section>'
  );
}

function splitSkills(text) {
  return String(text || '')
    .split(/[、,，/|]+/)
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
}

function renderSkills(data, L) {
  const items = data.skills || [];
  if (!items.length) return '';
  const rows = items.map(function (it) {
    const tags = splitSkills(it.items)
      .map(function (s) {
        return '<span class="rm-tag">' + esc(s) + '</span>';
      })
      .join('');
    return (
      '<div class="rm-skill-row"><div class="rm-skill-k">' + esc(it.group || '') +
      '</div><div class="rm-tags">' + tags + '</div></div>'
    );
  });
  return (
    '<section class="rm-sec rm-sec-skills"><h2 class="rm-sec-h"><span class="rm-sec-t">' +
    esc(L.skills) +
    '</span></h2><div class="rm-items">' + rows.join('') + '</div></section>'
  );
}

function renderAwards(data, L) {
  const items = data.awards || [];
  if (!items.length) return '';
  const rows = items.map(function (it) {
    const h = ['<div class="rm-award-row"><div class="rm-award-main">'];
    if (it.title) h.push('<span class="rm-award-t">' + esc(it.title) + '</span>');
    if (it.desc) h.push('<span class="rm-award-desc"> · ' + esc(it.desc) + '</span>');
    h.push('</div>');
    if (it.date) h.push('<div class="rm-date">' + esc(it.date) + '</div>');
    h.push('</div>');
    return h.join('');
  });
  return (
    '<section class="rm-sec rm-sec-awards"><h2 class="rm-sec-h"><span class="rm-sec-t">' +
    esc(L.awards) +
    '</span></h2><div class="rm-items">' + rows.join('') + '</div></section>'
  );
}

/** 渲染整份简历正文（不含样式与外壳）。 */
function renderBody(resume) {
  const data = resume && resume.data ? resume.data : normalizeData({});
  const L = labelsOf(resume);
  const order =
    resume && Array.isArray(resume.sections) && resume.sections.length
      ? resume.sections
      : SECTION_ORDER;
  const html = [renderHead(data, L)];
  const body = [];
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    if (id === 'summary') body.push(renderSummary(data, L));
    else if (id === 'experience') body.push(renderExperience(data, L));
    else if (id === 'projects') body.push(renderProjects(data, L));
    else if (id === 'education') body.push(renderEducation(data, L));
    else if (id === 'skills') body.push(renderSkills(data, L));
    else if (id === 'awards') body.push(renderAwards(data, L));
  }
  html.push('<div class="rm-body">' + body.join('') + '</div>');
  return html.join('');
}

/** 预览用：返回 { css, html }，调用方用 templateClass(tpl) 取纸面根 class。 */
function buildPreviewParts(resume, template) {
  const tpl = template || templateById(resume && resume.templateId);
  return { css: BASE_CSS + '\n' + (tpl.css || ''), html: renderBody(resume) };
}

/**
 * 模板在纸面上的根 class。
 *
 * 模板 CSS 都是按 `.rm-t-<名字>` 写的，但模板 id（business-minimal 等）和
 * CSS 里的类名（.rm-t-business）不是一回事。优先取显式 cls，其次从 CSS 里
 * 推断第一个 .rm-t-* 选择器，最后才退回 id —— 这样导入的市场模板也能生效。
 */
function templateClass(template) {
  if (!template) return 'rm-t-business';
  if (typeof template.cls === 'string' && /^rm-t-[a-z0-9-]{1,40}$/.test(template.cls)) return template.cls;
  if (typeof template.css === 'string') {
    const found = /\.rm-t-[a-z0-9-]{1,40}/.exec(template.css);
    if (found) return found[0].slice(1);
  }
  const id = typeof template.id === 'string' && /^[a-z0-9][a-z0-9-]{1,39}$/.test(template.id) ? template.id : 'business';
  return 'rm-t-' + id;
}

/** 导出的独立 HTML 文档。 */
function buildHtml(resume, template, opts) {
  const tpl = template || templateById(resume && resume.templateId);
  const data = (resume && resume.data) || {};
  const name = (data.basics && data.basics.name) || '我的简历';
  const lang = resume && resume.lang === 'en' ? 'en' : 'zh-CN';
  const autoPrint = opts && opts.autoPrint ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},250);});<\/script>' : '';
  return (
    '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc(name) + ' · ' + esc(tpl.name) + '</title>' +
    '<style>' + BASE_CSS + '\n' + (tpl.css || '') + PRINT_CSS + '</style>' +
    '</head><body class="rm-export"><main class="rm-doc rm-paper ' + esc(templateClass(tpl)) + '">' +
    renderBody(resume) + '</main>' + autoPrint + '</body></html>'
  );
}

/**
 * Word（.doc）用的页面设置。
 *
 * Word 不认裸 @page{size}，只认带名字的 @page WordSection1 + 一个
 * .WordSection1 容器；套上这一层，打开就是 A4 无边距，跟预览基本一致。
 */
const WORD_CSS = `
@page WordSection1{size:21cm 29.7cm;mso-page-orientation:portrait;margin:0;}
div.WordSection1{page:WordSection1;}
body{margin:0;padding:0;background:#ffffff;}
.rm-paper{width:21cm;min-height:29.7cm;box-shadow:none;}
.rm-doc .rm-sec,.rm-doc .rm-item{page-break-inside:avoid;}
`;

/**
 * 导出的 Word 文档（.doc）。
 *
 * 用 Word 兼容的 HTML 而不是二进制 docx：零依赖、样式还能跟着模板走。
 * Word 与 WPS 都能直接打开，另存为 .docx 也只是点一下的事。
 */
function buildWordHtml(resume, template) {
  const tpl = template || templateById(resume && resume.templateId);
  const data = (resume && resume.data) || {};
  const name = (data.basics && data.basics.name) || '我的简历';
  const lang = resume && resume.lang === 'en' ? 'en' : 'zh-CN';
  return (
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:w="urn:schemas-microsoft-com:office:word" ' +
    'xmlns="http://www.w3.org/TR/REC-html40" lang="' + lang + '"><head>' +
    '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">' +
    '<meta name="ProgId" content="Word.Document">' +
    '<meta name="Generator" content="resume-market">' +
    '<title>' + esc(name) + ' · ' + esc(tpl.name) + '</title>' +
    '<style>' + BASE_CSS + '\n' + (tpl.css || '') + PRINT_CSS + WORD_CSS + '</style>' +
    '</head><body><div class="WordSection1"><main class="rm-doc rm-paper ' + esc(templateClass(tpl)) + '">' +
    renderBody(resume) + '</main></div></body></html>'
  );
}

/** 模板样式对象（模板编辑器用的结构化字段）白名单收敛。 */
function sanitizeStyle(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const out = {};
  const flatColors = raw.colors && typeof raw.colors === 'object' ? raw.colors : raw;
  const colors = ['accent', 'nameColor', 'headingColor', 'bodyColor', 'background', 'bandColor', 'gold'];
  for (const key of colors) {
    const value = flatColors[key] != null ? flatColors[key] : raw[key];
    if (/^#[0-9a-fA-F]{3,8}$/.test(String(value || ''))) out[key] = String(value);
  }
  const nums = ['nameSize', 'headingSize', 'bodySize', 'lineHeight', 'padX', 'padY', 'sectionGap', 'contactCols'];
  for (const key of nums) {
    const value = Number(raw[key]);
    if (Number.isFinite(value) && value > 0 && value <= 400) out[key] = value;
  }
  if (['rule', 'bar', 'underline', 'plain', 'banner'].indexOf(raw.headingStyle) !== -1) out.headingStyle = raw.headingStyle;
  if (['sans', 'serif', 'mono'].indexOf(raw.fontFamily) !== -1) out.fontFamily = raw.fontFamily;
  if (['left', 'center'].indexOf(raw.headerAlign) !== -1) out.headerAlign = raw.headerAlign;
  if (raw.headerBand === true) out.headerBand = true;
  return Object.keys(out).length ? out : undefined;
}

/** 校验/收敛模板对象（导入市场包时用）。 */
function normalizeTemplate(raw, fallbackId) {
  if (!raw || typeof raw !== 'object') return templateById(fallbackId);
  const css = typeof raw.css === 'string' ? raw.css.slice(0, 100 * 1024) : '';
  const base = templateById(fallbackId || raw.id);
  const id = /^[a-z0-9][a-z0-9-]{1,39}$/.test(String(raw.id || '')) ? String(raw.id) : base.id;
  const cls = /^rm-t-[a-z0-9-]{1,40}$/.test(String(raw.cls || ''))
    ? String(raw.cls)
    : base && base.cls
      ? base.cls
      : 'rm-t-' + id;
  return {
    id: id,
    cls: cls,
    name: String(raw.name || base.name).slice(0, 40),
    en: String(raw.en || base.en || '').slice(0, 40),
    tagline: String(raw.tagline || base.tagline || '').slice(0, 120),
    tags: Array.isArray(raw.tags)
      ? raw.tags.slice(0, 5).map((t) => String(t).slice(0, 12)).filter(Boolean)
      : base.tags.slice(),
    accent: /^#[0-9a-fA-F]{3,8}$/.test(String(raw.accent || '')) ? String(raw.accent) : base.accent,
    desc: String(raw.desc || '').slice(0, 120),
    css: css || base.css,
    style: sanitizeStyle(raw.style),
    sample: raw.sample && typeof raw.sample === 'object' ? normalizeData(raw.sample) : undefined,
  };
}

/** 校验/收敛一份简历记录（导入、保存时用）。 */
function normalizeResume(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const sections = Array.isArray(src.sections)
    ? src.sections.filter((s) => SECTION_ORDER.indexOf(s) !== -1)
    : SECTION_ORDER.slice();
  return {
    id: typeof src.id === 'string' && src.id ? src.id : null,
    title: String(src.title || '我的简历').slice(0, 80).trim() || '我的简历',
    templateId:
      typeof src.templateId === 'string' && src.templateId
        ? src.templateId.slice(0, 40)
        : TEMPLATES[0].id,
    lang: src.lang === 'en' ? 'en' : 'zh',
    sections: sections.length ? sections : SECTION_ORDER.slice(),
    data: normalizeData(src.data),
    createdAt: typeof src.createdAt === 'string' ? src.createdAt : null,
    updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : null,
  };
}

// ---- 供 Host 侧（Node ESM）导入的具名导出 ----
// 客户端走 build/build.mjs 内联，构建时会把下面这一行也去掉。
export {
  templateClass,
  PAPER_W,
  PAPER_H,
  SECTION_ORDER,
  TEMPLATES,
  DEMO_RESUME_DATA,
  normalizeData,
  emptyResume,
  templateById,
  buildPreviewParts,
  buildHtml,
  buildWordHtml,
  normalizeTemplate,
  normalizeResume,
};
