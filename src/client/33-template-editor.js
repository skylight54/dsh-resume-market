/**
 * 简历市场 client — 33 模板库编辑器。
 *
 * 三件事：
 *   1) 模板「元素格式」：颜色 / 字号 / 行距 / 页边距 / 标题样式 / 字体 / 页眉 / 联系信息列数，
 *      任何一项改动都即时重算成一整段模板 CSS（根选择器 .rm-t-<cls>），右侧 A4 实时预览；
 *   2) 保存走 /template/save，发布走 /template/publish（本地市场）或 /github/publish-template（公共投稿）；
 *   3) 从文件生成模板初稿：Word/PDF 交 Host 解析，图片走 FileReader + canvas 本地取色。
 *
 * style 的字段形状与后端白名单一一对应（多出来的字段服务端会裁掉）：
 *   colors:{accent,nameColor,headingColor,bodyColor,background,bandColor,gold}
 *   nameSize,headingSize,bodySize,lineHeight,padX,padY,sectionGap,contactCols
 *   headingStyle:'rule'|'bar'|'banner'|'underline'|'plain'  fontFamily:'sans'|'serif'|'mono'
 *   headerAlign:'left'|'center'  headerBand:boolean
 *
 * 'banner'（斜切色带）复刻参考图的风格：大号衬线标题 + 金色细线 + 斜切色带分块标题，
 * 金色辅助色存在 colors.gold（默认 #c9a227）。
 */

/* ---------------- 颜色与数值工具 ---------------- */

function rmHexToRgb(hex) {
  var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex == null ? '' : hex).trim());
  if (!m) return null;
  var v = m[1];
  if (v.length === 3) v = v.charAt(0) + v.charAt(0) + v.charAt(1) + v.charAt(1) + v.charAt(2) + v.charAt(2);
  return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) };
}

function rmRgbToHex(rgb) {
  function part(n) {
    var v = Math.max(0, Math.min(255, Math.round(Number(n) || 0))).toString(16);
    return v.length === 1 ? '0' + v : v;
  }
  return '#' + part(rgb.r) + part(rgb.g) + part(rgb.b);
}

function rmHexIsValid(hex) {
  return !!rmHexToRgb(hex);
}

function rmNormalizeHex(hex) {
  var rgb = rmHexToRgb(hex);
  return rgb ? rmRgbToHex(rgb) : '';
}

/** 两个颜色按 t（0~1）线性混合，越界自动夹紧。 */
function rmMixHex(a, b, t) {
  var ca = rmHexToRgb(a);
  var cb = rmHexToRgb(b);
  if (!ca) return rmNormalizeHex(b) || '#000000';
  if (!cb) return rmNormalizeHex(a) || '#000000';
  var k = Math.max(0, Math.min(1, Number(t) || 0));
  return rmRgbToHex({
    r: ca.r + (cb.r - ca.r) * k,
    g: ca.g + (cb.g - ca.g) * k,
    b: ca.b + (cb.b - ca.b) * k,
  });
}

function rmRgba(hex, alpha) {
  var c = rmHexToRgb(hex);
  if (!c) return 'rgba(47,111,222,' + alpha + ')';
  return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
}

function rmLuminance(hex) {
  var c = rmHexToRgb(hex);
  if (!c) return 1;
  return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
}

function rmClampNum(value, min, max) {
  var n = typeof value === 'number' ? value : parseFloat(String(value == null ? '' : value));
  if (!isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

/* ---------------- style 默认值 / 预设 / 校验 ---------------- */

var RM_STYLE_NUM_RANGES = {
  nameSize: [18, 56],
  headingSize: [9, 24],
  bodySize: [10, 20],
  lineHeight: [1.2, 2.4],
  padX: [24, 120],
  padY: [20, 120],
  sectionGap: [8, 48],
  contactCols: [1, 4],
  // 版式细项里的数值（和后端 sanitizeStyle 的夹取范围保持一致）。
  photoSize: [56, 160],
  itemGap: [0, 40],
  titleGap: [0, 40],
};

var RM_HEADING_STYLES = [
  ['rule', '细线'],
  ['bar', '色块'],
  ['banner', '斜切色带'],
  ['underline', '下划线'],
  ['tab', '斜角标签'],
  ['pill', '胶囊标签'],
  ['icon', '圆形图标'],
  ['leftbar', '左侧竖条'],
  ['plain', '无装饰'],
];

var RM_LAYOUTS = [
  ['single', '单栏'],
  ['sidebar', '左侧栏'],
];

var RM_HEADER_STYLES = [
  ['plain', '纯文字'],
  ['band', '整宽色带'],
  ['split', '左右分栏'],
  ['ribbon', '左上角标签'],
];

var RM_CONTENT_STYLES = [
  ['plain', '无边框'],
  ['card', '卡片'],
];

/** 模块标题下的分隔线样式（默认 line = 沿用各标题样式自带的线）。 */
var RM_SECTION_DIVIDERS = [
  ['line', '细线'],
  ['dashed', '虚线'],
  ['double', '双线'],
  ['accent', '强调色'],
  ['none', '无'],
];

/** 要点列表的符号。 */
var RM_BULLET_STYLES = [
  ['dot', '圆点'],
  ['dash', '短横线'],
  ['square', '方块'],
  ['ring', '空心圆'],
];

/** 姓名对齐。 */
var RM_NAME_ALIGNS = [
  ['left', '左对齐'],
  ['center', '居中'],
];

/** 联系方式的排布。 */
var RM_CONTACT_STYLES = [
  ['grid', '网格'],
  ['inline', '单行'],
  ['pills', '胶囊'],
];

/** 技能 / 兴趣标签的样式。 */
var RM_TAG_STYLES = [
  ['pill', '胶囊'],
  ['plain', '纯文字'],
  ['underline', '下划线'],
];

/** 照片位置与形状（left/right 管位置，circle 管圆形，none 隐藏）。 */
var RM_PHOTO_FRAMES = [
  ['left', '靠左'],
  ['right', '靠右'],
  ['circle', '圆形'],
  ['none', '不显示'],
];

/** 照片边长的参照值：等于它时沿用模板原有尺寸，不动 CSS。 */
var RM_PHOTO_SIZE_BASE = 96;

/** 左侧栏布局时，哪些模块搬到左栏（顺序即左栏里的上下顺序）。 */
var RM_SIDEBAR_SECTIONS = [
  ['summary', '自我评价'],
  ['education', '教育背景'],
  ['experience', '工作经历'],
  ['projects', '项目经历'],
  ['skills', '技能特长'],
  ['awards', '荣誉证书'],
];

/** doc.js renderBody 里模块的固定顺序（左栏搬移时按它判断左右栏首个模块）。 */
var RM_SECTION_ORDER = ['summary', 'experience', 'projects', 'education', 'skills', 'awards'];

/** 枚举字段收敛：只认白名单里的值，否则回落到 fallback。 */
function rmStylePickEnum(value, options, fallback) {
  if (typeof value !== 'string') return fallback;
  for (var i = 0; i < options.length; i++) {
    if (options[i][0] === value) return value;
  }
  return fallback;
}

/** 版式细项的枚举字段 → 白名单（clone / merge 共用一张表）。 */
var RM_STYLE_ENUM_FIELDS = [
  ['sectionDivider', RM_SECTION_DIVIDERS],
  ['bulletStyle', RM_BULLET_STYLES],
  ['nameAlign', RM_NAME_ALIGNS],
  ['contactStyle', RM_CONTACT_STYLES],
  ['tagStyle', RM_TAG_STYLES],
  ['photoFrame', RM_PHOTO_FRAMES],
];

/** 把 source 上的版式细项枚举收敛进 out（非法值保留 out 原值）。 */
function rmPickStyleEnums(out, source) {
  if (!source || typeof source !== 'object') return out;
  for (var i = 0; i < RM_STYLE_ENUM_FIELDS.length; i++) {
    var key = RM_STYLE_ENUM_FIELDS[i][0];
    out[key] = rmStylePickEnum(source[key], RM_STYLE_ENUM_FIELDS[i][1], out[key]);
  }
  return out;
}

/** 侧栏模块收敛：只留白名单 id，按白名单顺序去重；不是数组时返回 null（表示沿用原值）。 */
function rmNormalizeSidebarSections(value) {
  if (!Array.isArray(value)) return null;
  var out = [];
  for (var i = 0; i < RM_SIDEBAR_SECTIONS.length; i++) {
    var id = RM_SIDEBAR_SECTIONS[i][0];
    if (value.indexOf(id) >= 0) out.push(id);
  }
  return out;
}

/** sidebarSections → 侧栏模块中文名（导入弹窗文案用）。 */
function rmSidebarSectionsLabel(value) {
  var list = Array.isArray(value) ? value : [];
  var names = [];
  for (var i = 0; i < RM_SIDEBAR_SECTIONS.length; i++) {
    if (list.indexOf(RM_SIDEBAR_SECTIONS[i][0]) >= 0) names.push(RM_SIDEBAR_SECTIONS[i][1]);
  }
  return names;
}

var RM_FONT_FAMILIES = [
  ['sans', '黑体'],
  ['serif', '衬线'],
  ['mono', '等宽'],
];

var RM_HEADER_ALIGNS = [
  ['left', '左对齐'],
  ['center', '居中'],
];

var RM_FONT_STACKS = {
  sans: '',
  serif: "Georgia,'Songti SC','SimSun',serif",
  mono: "ui-monospace,'SFMono-Regular',Consolas,'Courier New',monospace",
};

function rmStyleDefaults() {
  return {
    colors: {
      accent: '#2f6fde',
      nameColor: '#10213a',
      headingColor: '#133a63',
      bodyColor: '#1f2937',
      background: '#ffffff',
      bandColor: '#eef3fb',
      gold: '#c9a227',
    },
    nameSize: 32,
    headingSize: 12.5,
    bodySize: 13.5,
    lineHeight: 1.62,
    padX: 56,
    padY: 48,
    sectionGap: 18,
    contactCols: 2,
    headingStyle: 'rule',
    fontFamily: 'sans',
    headerAlign: 'left',
    headerBand: false,
    layout: 'single',
    headerStyle: 'plain',
    contentStyle: 'plain',
    // 左侧栏布局时左栏承载的模块（默认把技能特长放左栏，和常见「深色侧栏」简历一致）。
    sidebarSections: ['skills'],
    // 版式细项：默认值都等于「沿用模板原有样式」，只有改动后才额外生成规则。
    sectionDivider: 'line',
    bulletStyle: 'dot',
    nameAlign: 'left',
    contactStyle: 'grid',
    tagStyle: 'pill',
    photoFrame: 'right',
    photoSize: 96,
    itemGap: 0,
    titleGap: 0,
  };
}

/** 六套内置模板对应的元素格式预设：复制内置模板时从这套值开始微调。 */
var RM_STYLE_PRESETS = {
  'business-minimal': {
    colors: { accent: '#1f2328', nameColor: '#111827', headingColor: '#111827', bodyColor: '#333941', background: '#ffffff', bandColor: '#f3f4f6', gold: '#b8912c' },
    nameSize: 34, headingSize: 12, bodySize: 13.5, lineHeight: 1.62, padX: 60, padY: 54, sectionGap: 18,
    headingStyle: 'rule', fontFamily: 'sans', headerAlign: 'left', headerBand: false, contactCols: 2, layout: 'single', headerStyle: 'plain', contentStyle: 'plain',
    // 极简黑白：单行联系方式 + 纯文字标签 + 短横线要点，更像一份干净的 Word 简历。
    bulletStyle: 'dash', contactStyle: 'inline', tagStyle: 'plain', nameAlign: 'left',
  },
  'quiet-luxury': {
    colors: { accent: '#5f7896', nameColor: '#1f2b3d', headingColor: '#3d4c61', bodyColor: '#2a3442', background: '#ffffff', bandColor: '#f1f4f8', gold: '#b8912c' },
    nameSize: 34, headingSize: 12, bodySize: 13.2, lineHeight: 1.68, padX: 62, padY: 56, sectionGap: 20,
    headingStyle: 'underline', fontFamily: 'serif', headerAlign: 'left', headerBand: false, contactCols: 2, layout: 'single', headerStyle: 'plain', contentStyle: 'plain',
    // 静奢：双线分隔 + 纯文字标签，克制的细线条。
    sectionDivider: 'double', tagStyle: 'plain', bulletStyle: 'ring',
  },
  'fresh-creative': {
    colors: { accent: '#7ccab6', nameColor: '#135c4f', headingColor: '#175e52', bodyColor: '#22343a', background: '#ffffff', bandColor: '#e6f6f2', gold: '#c9a227' },
    nameSize: 36, headingSize: 12.5, bodySize: 13.5, lineHeight: 1.64, padX: 48, padY: 38, sectionGap: 18,
    headingStyle: 'bar', fontFamily: 'sans', headerAlign: 'left', headerBand: true, contactCols: 3, layout: 'single', headerStyle: 'band', contentStyle: 'plain',
  },
  'compact-one': {
    colors: { accent: '#3f4753', nameColor: '#1d2129', headingColor: '#2c3138', bodyColor: '#2c3138', background: '#ffffff', bandColor: '#f1f2f4', gold: '#b8912c' },
    nameSize: 27, headingSize: 11.5, bodySize: 12.2, lineHeight: 1.55, padX: 44, padY: 38, sectionGap: 14,
    headingStyle: 'underline', fontFamily: 'sans', headerAlign: 'left', headerBand: false, contactCols: 2, layout: 'single', headerStyle: 'plain', contentStyle: 'plain',
  },
  'timeline-pro': {
    colors: { accent: '#2f6fde', nameColor: '#1f3352', headingColor: '#1f3352', bodyColor: '#1f2937', background: '#ffffff', bandColor: '#eaf1fc', gold: '#c9a227' },
    nameSize: 32, headingSize: 12.5, bodySize: 13.5, lineHeight: 1.62, padX: 56, padY: 50, sectionGap: 18,
    headingStyle: 'rule', fontFamily: 'sans', headerAlign: 'left', headerBand: false, contactCols: 2, layout: 'single', headerStyle: 'plain', contentStyle: 'plain',
    // 时间轴：方块要点 + 强调色分隔线，一眼能看出「条目感」。
    bulletStyle: 'square', sectionDivider: 'accent',
  },
  'tech-grid': {
    colors: { accent: '#2c5f96', nameColor: '#10213a', headingColor: '#133a63', bodyColor: '#16202e', background: '#ffffff', bandColor: '#eef2f7', gold: '#c9a227' },
    nameSize: 31, headingSize: 12.5, bodySize: 13.2, lineHeight: 1.6, padX: 54, padY: 48, sectionGap: 18,
    headingStyle: 'underline', fontFamily: 'mono', headerAlign: 'left', headerBand: false, contactCols: 2, layout: 'single', headerStyle: 'plain', contentStyle: 'plain',
  },
  'sidebar-deep': {
    colors: { accent: '#1f3a5f', nameColor: '#0f2540', headingColor: '#1f3a5f', bodyColor: '#1f2937', background: '#ffffff', bandColor: '#f1f5f9', gold: '#c9a227' },
    nameSize: 26, headingSize: 12.5, bodySize: 13, lineHeight: 1.6, padX: 40, padY: 34, sectionGap: 16,
    headingStyle: 'icon', fontFamily: 'sans', headerAlign: 'left', headerBand: false, contactCols: 1,
    layout: 'sidebar', headerStyle: 'plain', contentStyle: 'plain', sidebarSections: ['skills'],
    // 侧栏模板：标题本来就没有下划线（leftbar），圆形头像更像常见深色侧栏简历。
    sectionDivider: 'none', photoFrame: 'circle',
  },
  'pill-blue': {
    colors: { accent: '#2f6fde', nameColor: '#10213a', headingColor: '#1f3352', bodyColor: '#1f2937', background: '#ffffff', bandColor: '#1f4b7a', gold: '#c9a227' },
    nameSize: 30, headingSize: 12.5, bodySize: 13.4, lineHeight: 1.62, padX: 54, padY: 44, sectionGap: 18,
    headingStyle: 'pill', fontFamily: 'sans', headerAlign: 'left', headerBand: false, contactCols: 2,
    layout: 'single', headerStyle: 'band', contentStyle: 'plain',
  },
  'icon-blue': {
    colors: { accent: '#3978a3', nameColor: '#10213a', headingColor: '#133a63', bodyColor: '#1f2937', background: '#ffffff', bandColor: '#3978a3', gold: '#c9a227' },
    nameSize: 32, headingSize: 12.5, bodySize: 13.4, lineHeight: 1.62, padX: 54, padY: 44, sectionGap: 18,
    headingStyle: 'icon', fontFamily: 'sans', headerAlign: 'left', headerBand: false, contactCols: 2,
    layout: 'single', headerStyle: 'band', contentStyle: 'plain',
  },
  'card-light': {
    colors: { accent: '#284967', nameColor: '#10213a', headingColor: '#284967', bodyColor: '#1f2937', background: '#ffffff', bandColor: '#284967', gold: '#c9a227' },
    nameSize: 30, headingSize: 12.5, bodySize: 13.2, lineHeight: 1.6, padX: 50, padY: 40, sectionGap: 14,
    headingStyle: 'leftbar', fontFamily: 'sans', headerAlign: 'left', headerBand: false, contactCols: 2,
    layout: 'single', headerStyle: 'band', contentStyle: 'card',
  },
  // 兼容短名
  business: null,
  luxury: null,
  fresh: null,
  compact: null,
  timeline: null,
  tech: null,
};

/** 短名映射到内置 id。 */
var RM_STYLE_PRESET_ALIASES = {
  business: 'business-minimal',
  luxury: 'quiet-luxury',
  fresh: 'fresh-creative',
  compact: 'compact-one',
  timeline: 'timeline-pro',
  tech: 'tech-grid',
};

function rmStylePreset(id) {
  var key = String(id == null ? '' : id).trim().replace(/^rm-t-/, '');
  if (RM_STYLE_PRESET_ALIASES[key]) key = RM_STYLE_PRESET_ALIASES[key];
  var patch = RM_STYLE_PRESETS[key];
  return rmStyleMerge(rmStyleDefaults(), patch || {});
}

/**
 * 「青金斜切」一键预设：复刻参考图那套风格（大号衬线标题 + 金色细线 + 斜切色带分块标题）。
 * 只做 style 层，不改模板名/根类名；编辑器里点一下就能整体换成这套。
 */
var RM_BANNER_PRESET = {
  colors: {
    accent: '#2c6474',
    nameColor: '#1d3d4d',
    headingColor: '#1d3d4d',
    bodyColor: '#26343a',
    background: '#ffffff',
    bandColor: '#eef4f6',
    gold: '#c9a227',
  },
  nameSize: 42,
  headingSize: 13,
  bodySize: 13.2,
  lineHeight: 1.62,
  padX: 58,
  padY: 46,
  sectionGap: 24,
  contactCols: 2,
  headingStyle: 'banner',
  fontFamily: 'serif',
  headerAlign: 'left',
  headerBand: true,
};

/** 「青金斜切」预设的合法 style（入口：编辑器按钮 / 导入弹窗按钮）。 */
function rmBannerPresetStyle() {
  return rmStyleMerge(rmStyleDefaults(), RM_BANNER_PRESET);
}

/** 把「青金斜切」预设包装成一份图片分析结果，好让导入弹窗沿用同一条 onGenerated 通路。 */
function rmBannerPresetAnalysis() {
  var st = rmBannerPresetStyle();
  return {
    palette: {
      accent: st.colors.accent,
      nameColor: st.colors.nameColor,
      headingColor: st.colors.headingColor,
      bodyColor: st.colors.bodyColor,
      background: st.colors.background,
      bandColor: st.colors.bandColor,
      gold: st.colors.gold,
    },
    layout: {
      headerBand: st.headerBand,
      headerAlign: st.headerAlign,
      headingStyle: st.headingStyle,
      contactCols: st.contactCols,
      fontFamily: st.fontFamily,
      headingBands: 3,
      preset: 'banner',
    },
    size: { width: 0, height: 0 },
    note: '青金斜切预设：大号衬线标题 + 金色细线 + 斜切色带分块标题',
    preset: 'banner',
    style: st,
    fallback: false,
  };
}

/** headingStyle 枚举值 → 中文名（导入弹窗的版式初判文案用）。 */
function rmHeadingStyleLabel(value) {
  for (var i = 0; i < RM_HEADING_STYLES.length; i++) {
    if (RM_HEADING_STYLES[i][0] === value) return RM_HEADING_STYLES[i][1];
  }
  return RM_HEADING_STYLES[0][1];
}

/** 复制一份合法 style 底稿：只校验不递归，供 rmStyleMerge 作为起点。 */
function rmCloneStyle(base) {
  var out = rmStyleDefaults();
  if (!base || typeof base !== 'object') return out;
  var source = base.colors && typeof base.colors === 'object' ? base.colors : base;
  Object.keys(out.colors).forEach(function (key) {
    if (rmHexIsValid(source[key])) out.colors[key] = rmNormalizeHex(source[key]);
  });
  Object.keys(RM_STYLE_NUM_RANGES).forEach(function (key) {
    if (base[key] == null) return;
    var range = RM_STYLE_NUM_RANGES[key];
    var n = rmClampNum(base[key], range[0], range[1]);
    if (n != null) out[key] = n;
  });
  if (typeof base.headingStyle === 'string') {
    for (var i = 0; i < RM_HEADING_STYLES.length; i++) {
      if (RM_HEADING_STYLES[i][0] === base.headingStyle) out.headingStyle = base.headingStyle;
    }
  }
  if (typeof base.fontFamily === 'string') {
    for (var j = 0; j < RM_FONT_FAMILIES.length; j++) {
      if (RM_FONT_FAMILIES[j][0] === base.fontFamily) out.fontFamily = base.fontFamily;
    }
  }
  if (typeof base.headerAlign === 'string') {
    for (var k = 0; k < RM_HEADER_ALIGNS.length; k++) {
      if (RM_HEADER_ALIGNS[k][0] === base.headerAlign) out.headerAlign = base.headerAlign;
    }
  }
  out.layout = rmStylePickEnum(base.layout, RM_LAYOUTS, out.layout);
  out.headerStyle = rmStylePickEnum(base.headerStyle, RM_HEADER_STYLES, out.headerStyle);
  out.contentStyle = rmStylePickEnum(base.contentStyle, RM_CONTENT_STYLES, out.contentStyle);
  rmPickStyleEnums(out, base);
  var baseSections = rmNormalizeSidebarSections(base.sidebarSections);
  if (baseSections) out.sidebarSections = baseSections;
  if (typeof base.headerBand === 'boolean') out.headerBand = base.headerBand;
  else out.headerBand = out.headerStyle === 'band';
  return out;
}

/** 按后端白名单校验并合并 style：非法 hex / 越界数值 / 未知枚举会被夹回合法范围。 */
function rmStyleMerge(base, patch) {
  var out = rmCloneStyle(base);
  if (!patch || typeof patch !== 'object') return out;
  var hexKeys = ['accent', 'nameColor', 'headingColor', 'bodyColor', 'background', 'bandColor', 'gold'];
  var source = patch.colors && typeof patch.colors === 'object' ? patch.colors : {};
  hexKeys.forEach(function (key) {
    var value = source[key];
    if (!rmHexIsValid(value)) value = patch[key];
    if (rmHexIsValid(value)) out.colors[key] = rmNormalizeHex(value);
  });
  Object.keys(RM_STYLE_NUM_RANGES).forEach(function (key) {
    if (patch[key] == null) return;
    var range = RM_STYLE_NUM_RANGES[key];
    var n = rmClampNum(patch[key], range[0], range[1]);
    if (n != null) out[key] = n;
  });
  if (patch.headingStyle) {
    for (var i = 0; i < RM_HEADING_STYLES.length; i++) {
      if (RM_HEADING_STYLES[i][0] === patch.headingStyle) out.headingStyle = patch.headingStyle;
    }
  }
  if (patch.fontFamily) {
    for (var j = 0; j < RM_FONT_FAMILIES.length; j++) {
      if (RM_FONT_FAMILIES[j][0] === patch.fontFamily) out.fontFamily = patch.fontFamily;
    }
  }
  if (patch.headerAlign) {
    for (var k = 0; k < RM_HEADER_ALIGNS.length; k++) {
      if (RM_HEADER_ALIGNS[k][0] === patch.headerAlign) out.headerAlign = patch.headerAlign;
    }
  }
  out.layout = rmStylePickEnum(patch.layout, RM_LAYOUTS, out.layout);
  out.headerStyle = rmStylePickEnum(patch.headerStyle, RM_HEADER_STYLES, out.headerStyle);
  out.contentStyle = rmStylePickEnum(patch.contentStyle, RM_CONTENT_STYLES, out.contentStyle);
  rmPickStyleEnums(out, patch);
  var patchSections = rmNormalizeSidebarSections(patch.sidebarSections);
  if (patchSections) out.sidebarSections = patchSections;
  if (typeof patch.headerBand === 'boolean') out.headerBand = patch.headerBand;
  else if (patch.headerStyle) out.headerBand = out.headerStyle === 'band';
  return out;
}

/** 把任意来源（旧模板、市场条目、手写对象）的 style / 平铺字段收敛成合法 style。 */
function rmNormalizeStyle(raw) {
  if (!raw || typeof raw !== 'object') return rmStyleDefaults();
  return rmStyleMerge(rmStyleDefaults(), raw);
}

/** 模板对象对应的 style：优先模板自带 style，其次按内置 id 取预设，最后用默认值。 */
function rmTemplateStyle(template) {
  if (!template) return rmStyleDefaults();
  if (template.style && typeof template.style === 'object') return rmNormalizeStyle(template.style);
  return rmStylePreset(template.id);
}

/* ---------------- 元素格式 → 模板 CSS ---------------- */

/** 规范成合法根类名 rm-t-[a-z0-9-]{1,40}。 */
function rmStyleClass(value) {
  var raw = String(value == null ? '' : value).trim().toLowerCase();
  if (/^rm-t-[a-z0-9-]{1,40}$/.test(raw)) return raw;
  var slug = raw
    .replace(/^rm-t-/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
  return 'rm-t-' + (slug || 'custom');
}

/** 新建模板时生成一个不会被内置模板撞上的根类名（服务端会保留客户端传来的合法 cls）。 */
function rmNewStyleClass(name) {
  var base = String(name == null ? '' : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 18);
  if (!base) base = 'tpl';
  var alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var suffix = '';
  for (var i = 0; i < 4; i++) suffix += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  return rmStyleClass('rm-t-' + base + '-' + suffix);
}

/** 把一段模板 CSS 的根选择器从 fromCls 改写成 toCls（复制内置模板时保留原样式）。 */
function rmRewriteCssRoot(css, fromCls, toCls) {
  if (!css || typeof css !== 'string') return '';
  var from = rmStyleClass(fromCls);
  var to = rmStyleClass(toCls);
  if (from === to) return css;
  var escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.replace(new RegExp('\\.' + escaped + '(?![a-z0-9-])', 'g'), '.' + to);
}

/** 保证模板 css 的根选择器与 templateClass(template) 一致，否则按 style 重新生成。 */
function rmEnsureTemplateCss(template, style) {
  if (!template) return '';
  var root = '.' + templateClass(template);
  var css = typeof template.css === 'string' ? template.css : '';
  if (css && css.indexOf(root) >= 0) return css;
  return rmStyleToCss(style || template.style || null, templateClass(template));
}

/**
 * 元素格式 → 完整模板 CSS。根选择器固定 .rm-t-<cls>；
 * 生成出来的规则全部排在 BASE_CSS 之后（PreviewScaled 里 css = BASE_CSS + template.css），
 * 所以同权重下能覆盖内置样式。
 */
function rmStyleToCss(style, cls) {
  var st = rmNormalizeStyle(style);
  var c = st.colors;
  var root = '.' + rmStyleClass(cls);
  var lines = [];

  function rule(selector, body) {
    lines.push(selector + '{' + body + '}');
  }

  var rootBody = 'padding:' + st.padY + 'px ' + st.padX + 'px;background:' + c.background + ';color:' + c.bodyColor + ';font-size:' + st.bodySize + 'px;line-height:' + st.lineHeight + ';';
  var stack = RM_FONT_STACKS[st.fontFamily];
  if (stack) rootBody += 'font-family:' + stack + ';';
  rule(root, rootBody);

  // 左侧栏布局：页眉整块搬进左栏，正文在右栏；栏宽固定 268px 保证和 A4 比例合适。
  var railBg = st.layout === 'sidebar' ? (st.headerStyle === 'band' ? c.bandColor : c.accent) : c.accent;
  var sideSections = st.layout === 'sidebar' ? rmNormalizeSidebarSections(st.sidebarSections) || [] : [];
  var rightIds = [];
  var railIds = [];
  var si;
  for (si = 0; si < RM_SECTION_ORDER.length; si++) {
    if (sideSections.indexOf(RM_SECTION_ORDER[si]) >= 0) railIds.push(RM_SECTION_ORDER[si]);
    else rightIds.push(RM_SECTION_ORDER[si]);
  }
  function rmSecSel(list) {
    var parts = [];
    for (var k2 = 0; k2 < list.length; k2++) parts.push(root + ' .rm-sec-' + list[k2]);
    return parts.join(',');
  }
  var railSel = rmSecSel(railIds);
  var rightSel = rmSecSel(rightIds);
  var railFirstSel = railIds.length ? root + ' .rm-sec-' + railIds[0] + ':first-of-type' : '';
  var rightFirstSel = rightIds.length ? root + ' .rm-sec-' + rightIds[0] + ':first-of-type' : '';
  if (st.layout === 'sidebar') {
    rule(root, 'display:grid;grid-template-columns:268px minmax(0,1fr);padding:0;align-items:start;grid-auto-flow:row dense;background:linear-gradient(90deg,' + railBg + ' 0 268px,' + c.background + ' 268px);');
    rule(
      root + ' .rm-head',
      'display:block;grid-column:1;grid-row:1;align-self:start;padding:' + Math.max(24, st.padY) + 'px 24px ' + Math.max(30, st.padY + 6) + 'px;background:' + railBg + ';color:#ffffff;'
    );
    rule(root + ' .rm-head .rm-name', 'color:#ffffff;font-size:' + Math.max(20, Math.round(st.nameSize * 0.82)) + 'px;letter-spacing:.02em;');
    rule(root + ' .rm-head .rm-role', 'color:' + rmRgba('#ffffff', 0.84) + ';letter-spacing:.06em;');
    rule(root + ' .rm-head .rm-contact', 'grid-template-columns:minmax(0,1fr);gap:7px;margin:16px 0 0;');
    rule(root + ' .rm-head .rm-contact .rm-k', 'color:' + rmRgba('#ffffff', 0.6) + ';');
    rule(root + ' .rm-head .rm-contact .rm-v', 'color:#ffffff;');
    rule(root + ' .rm-head .rm-photo', 'width:84px;height:84px;margin:0 auto 18px;');
    if (sideSections.length) {
      // 左栏承载额外模块：.rm-body 拆成 grid 的直接子项，左右两栏各自按列排布。
      var railInk = rmLuminance(railBg) < 0.62 ? '#ffffff' : c.bodyColor;
      var railSoft = rmRgba(railInk, 0.78);
      rule(root + ' .rm-body', 'display:contents;');
      if (rightSel) {
        rule(rightSel, 'grid-column:2;grid-row:auto;align-self:start;padding-left:' + st.padX + 'px;padding-right:' + st.padX + 'px;');
        if (rightFirstSel) rule(rightFirstSel, 'padding-top:' + st.padY + 'px;');
      }
      rule(
        railSel,
        'grid-column:1;grid-row:auto;align-self:start;padding:0 24px;margin-top:' + Math.max(16, st.sectionGap) + 'px;color:' + railInk + ';'
      );
      if (railFirstSel) rule(railFirstSel, 'margin-top:0;');
      rule(railSel + ' .rm-sec-h', 'border-bottom:1px solid ' + rmRgba(railInk, 0.34) + ';');
      rule(railSel + ' .rm-sec-t', 'color:' + railInk + ';');
      rule(railSel + ' .rm-sec-h::before', 'background:' + rmRgba(railInk, 0.92) + ';');
      rule(railSel + ' .rm-summary,' + railSel + ' .rm-para,' + railSel + ' .rm-v,' + railSel + ' .rm-item-t', 'color:' + railInk + ';');
      rule(railSel + ' .rm-item-role,' + railSel + ' .rm-date', 'color:' + rmRgba(railInk, 0.8) + ';');
      rule(railSel + ' .rm-k,' + railSel + ' .rm-skill-k', 'color:' + rmRgba(railInk, 0.72) + ';');
      rule(railSel + ' .rm-tag', 'border:1px solid ' + rmRgba(railInk, 0.45) + ';background:' + rmRgba(railInk, 0.1) + ';color:' + railInk + ';');
      rule(railSel + ' .rm-bullets li::marker', 'color:' + rmRgba(railInk, 0.8) + ';');
      rule(railSel + ' .rm-skill-row', 'display:block;margin:0 0 8px;');
      rule(railSel + ' .rm-skill-k', 'display:block;margin:0 0 3px;letter-spacing:.08em;');
      rule(railSel + ' .rm-edu-courses', 'color:' + railSoft + ';');
      rule(railSel + ' .rm-bullets', 'padding-left:16px;');
      /* 侧栏观感优化：左栏层级、间距、分隔线、标签样式 */
      rule(root + ' .rm-head', 'padding:' + Math.max(26, st.padY + 2) + 'px 22px ' + Math.max(28, st.padY + 8) + 'px;');
      rule(root + ' .rm-head .rm-name', 'font-weight:700;letter-spacing:.01em;line-height:1.18;margin:0;');
      rule(root + ' .rm-head .rm-role', 'margin:8px 0 0;font-size:' + Math.max(11, Math.round(st.bodySize * 0.86)) + 'px;text-transform:none;');
      rule(root + ' .rm-head .rm-contact .rm-c', 'display:flex;gap:8px;align-items:baseline;line-height:1.5;');
      rule(root + ' .rm-head .rm-contact .rm-k', 'min-width:34px;font-size:10.5px;letter-spacing:.04em;');
      rule(root + ' .rm-head .rm-contact .rm-v', 'font-size:' + Math.max(10.5, Math.round(st.bodySize * 0.84)) + 'px;word-break:break-all;');
      rule(root + ' .rm-head .rm-photo', 'border-radius:6px;box-shadow:0 6px 16px rgba(9,17,28,.22);');
      rule(railSel, 'padding-bottom:' + Math.max(14, st.sectionGap) + 'px;font-size:' + Math.max(11, Math.round(st.bodySize * 0.94)) + 'px;line-height:' + Math.max(1.45, st.lineHeight) + ';');
      rule(railSel + ' + ' + railSel.replace(/,/g, ' + '), 'border-top:1px solid ' + rmRgba(railInk, 0.22) + ';padding-top:' + Math.max(8, Math.round(st.sectionGap * 0.55)) + 'px;');
      rule(railSel + ' .rm-sec-t', 'font-size:' + Math.max(9.5, Math.round(st.headingSize * 0.78)) + 'px;letter-spacing:.14em;font-weight:700;');
      rule(railSel + ' .rm-sec-h', 'margin:0 0 ' + Math.max(6, Math.round(st.sectionGap * 0.4)) + 'px;padding-bottom:5px;');
      rule(railSel + ' .rm-item-path, ' + railSel + ' .rm-item-line', 'margin:0 0 3px;line-height:1.5;');
      rule(railSel + ' .rm-tag', 'display:inline-block;padding:2px 9px;border-radius:999px;font-size:10.5px;letter-spacing:.02em;margin:0 6px 6px 0;');
      rule(rightSel, 'padding-bottom:' + Math.max(18, st.padY) + 'px;');
    } else {
      rule(root + ' .rm-body', 'grid-column:2;grid-row:1;padding:' + st.padY + 'px ' + st.padX + 'px;');
    }
  }
  rule(root + ' .rm-name', 'color:' + c.nameColor + ';font-size:' + st.nameSize + 'px;font-weight:700;letter-spacing:.04em;');
  rule(root + ' .rm-role', 'color:' + rmMixHex(c.accent, c.nameColor, 0.25) + ';font-size:' + Math.max(11, Math.round(st.bodySize * 108) / 100) + 'px;');
  rule(root + ' .rm-contact', 'grid-template-columns:repeat(' + Math.round(st.contactCols) + ',minmax(0,1fr));color:' + c.bodyColor + ';');
  rule(root + ' .rm-c .rm-k', 'color:' + rmMixHex(c.bodyColor, c.background, 0.42) + ';');
  rule(root + ' .rm-v', 'color:' + c.bodyColor + ';');
  rule(root + ' .rm-item-t', 'color:' + c.headingColor + ';');
  rule(root + ' .rm-item-role,' + root + ' .rm-date', 'color:' + rmMixHex(c.accent, c.headingColor, 0.5) + ';');
  rule(root + ' .rm-edu-courses .rm-k,' + root + ' .rm-skill-k', 'color:' + rmMixHex(c.headingColor, c.background, 0.15) + ';');
  rule(root + ' .rm-sec', 'margin-top:' + st.sectionGap + 'px;');
  rule(root + ' .rm-sec-t', 'color:' + c.headingColor + ';font-size:' + st.headingSize + 'px;font-weight:700;letter-spacing:.14em;');
  rule(root + ' .rm-tag', 'border:1px solid ' + rmRgba(c.accent, 0.34) + ';background:' + rmRgba(c.accent, 0.06) + ';color:' + rmMixHex(c.accent, c.bodyColor, 0.3) + ';');
  rule(root + ' .rm-bullets li::marker', 'color:' + c.accent + ';');
  rule(root + ' .rm-summary', 'color:' + c.bodyColor + ';');

  if (st.headingStyle === 'rule') {
    rule(root + ' .rm-sec-h', 'border-bottom:1px solid ' + rmRgba(c.accent, 0.32) + ';padding-bottom:4px;');
  } else if (st.headingStyle === 'bar') {
    rule(root + ' .rm-sec-h', 'border-bottom:0;padding-left:9px;position:relative;');
    rule(root + ' .rm-sec-h::before', 'content:"";position:absolute;left:0;top:3px;bottom:3px;width:4px;border-radius:2px;background:' + c.accent + ';');
  } else if (st.headingStyle === 'banner') {
    // 斜切色带分块标题：深青 → 强调色的斜切平行四边形 + 左侧金色竖条 + 下方金色细线。
    rule(root + ' .rm-sec-h', 'position:relative;margin:0 0 12px;padding-bottom:3px;border-bottom:1px solid ' + c.gold + ';');
    rule(
      root + ' .rm-sec-t',
      'display:inline-block;padding:7px 46px 7px 20px;background:linear-gradient(100deg,' + c.headingColor + ' 0%,' + c.accent + ' 100%);color:#ffffff;font-size:' + st.headingSize + 'px;font-weight:600;letter-spacing:.3em;clip-path:polygon(0 0,100% 0,calc(100% - 18px) 100%,0 100%);'
    );
    rule(root + ' .rm-sec-h::before', 'content:"";position:absolute;left:-10px;top:2px;width:5px;height:calc(100% - 8px);background:' + c.gold + ';');
  } else if (st.headingStyle === 'underline') {
    rule(root + ' .rm-sec-h', 'border-bottom:2px solid ' + c.accent + ';padding-bottom:3px;');
  } else if (st.headingStyle === 'tab') {
    rule(root + ' .rm-sec-h', 'border-bottom:1px solid ' + rmRgba(c.accent, 0.48) + ';padding-bottom:2px;');
    rule(
      root + ' .rm-sec-t',
      'display:inline-block;padding:6px 40px 6px 18px;background:linear-gradient(100deg,' + c.headingColor + ' 0%,' + c.accent + ' 100%);color:#ffffff;font-size:' + st.headingSize + 'px;font-weight:700;letter-spacing:.14em;clip-path:polygon(0 0,100% 0,calc(100% - 14px) 100%,0 100%);'
    );
  } else if (st.headingStyle === 'pill') {
    rule(root + ' .rm-sec-h', 'border-bottom:1px solid ' + rmRgba(c.accent, 0.42) + ';padding-bottom:3px;');
    rule(root + ' .rm-sec-t', 'display:inline-block;padding:5px 22px;border-radius:999px;background:' + c.accent + ';color:#ffffff;font-size:' + st.headingSize + 'px;font-weight:600;letter-spacing:.12em;');
  } else if (st.headingStyle === 'icon') {
    rule(root + ' .rm-sec-h', 'position:relative;padding-left:34px;border-bottom:1px solid ' + rmRgba(c.accent, 0.42) + ';padding-bottom:3px;');
    rule(root + ' .rm-sec-h::before', 'content:"";position:absolute;left:0;top:1px;width:22px;height:22px;border-radius:50%;background:' + c.accent + ';');
  } else if (st.headingStyle === 'leftbar') {
    rule(root + ' .rm-sec-h', 'border-bottom:0;padding-left:11px;position:relative;');
    rule(root + ' .rm-sec-h::before', 'content:"";position:absolute;left:0;top:2px;bottom:2px;width:4px;border-radius:2px;background:' + c.accent + ';');
    rule(root + ' .rm-sec-t', 'color:' + c.headingColor + ';font-size:' + st.headingSize + 'px;font-weight:700;letter-spacing:.08em;');
  } else {
    rule(root + ' .rm-sec-h', 'border-bottom:1px solid transparent;padding-bottom:2px;');
  }

  if (st.headerAlign === 'center') {
    rule(root + ' .rm-head', 'text-align:center;');
    rule(root + ' .rm-contact', 'max-width:640px;margin-left:auto;margin-right:auto;');
  }

  if (st.headerBand && st.layout !== 'sidebar') {
    rule(
      root + ' .rm-head',
      'margin:' + -st.padY + 'px ' + -st.padX + 'px ' + Math.max(10, Math.round(st.sectionGap * 0.7)) + 'px;padding:' + st.padY + 'px ' + st.padX + 'px 18px;background:' + c.bandColor + ';border-bottom:1px solid ' + rmRgba(c.accent, 0.24) + ';'
    );
  }

  if (st.headerStyle === 'band' && st.layout !== 'sidebar') {
    // 整宽页眉底色：底色偏深时整块反白，偏浅时保持深字。
    var bandBg = rmLuminance(c.bandColor) > 0.9 ? rmMixHex('#ffffff', c.accent, 0.18) : c.bandColor;
    var bandDark = rmLuminance(bandBg) < 0.6;
    rule(
      root + ' .rm-head',
      'margin:' + -st.padY + 'px ' + -st.padX + 'px ' + Math.max(10, Math.round(st.sectionGap * 0.7)) + 'px;padding:' + (st.padY + 8) + 'px ' + st.padX + 'px ' + (st.padY + 2) + 'px;background:' + bandBg + ';border-bottom:1px solid ' + rmRgba(c.accent, 0.24) + ';' + (bandDark ? 'color:#ffffff;' : '')
    );
    if (bandDark) {
      rule(root + ' .rm-head .rm-name', 'color:#ffffff;');
      rule(root + ' .rm-head .rm-role', 'color:' + rmRgba('#ffffff', 0.84) + ';');
      rule(root + ' .rm-head .rm-contact .rm-k', 'color:' + rmRgba('#ffffff', 0.64) + ';');
      rule(root + ' .rm-head .rm-contact .rm-v', 'color:#ffffff;');
    }
  } else if (st.headerStyle === 'split' && st.layout !== 'sidebar') {
    // 名字占左、联系信息占右的两栏页眉，底下一条强调色横线。
    rule(root + ' .rm-head', 'display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;column-gap:26px;border-bottom:2px solid ' + c.accent + ';padding-bottom:12px;');
    rule(root + ' .rm-head .rm-id', 'grid-column:1;grid-row:1;');
    rule(root + ' .rm-head .rm-contact', 'grid-column:2;grid-row:1;grid-template-columns:repeat(' + Math.min(2, Math.max(1, Math.round(st.contactCols))) + ',minmax(0,1fr));gap:4px 18px;margin:0;');
    rule(root + ' .rm-head.rm-has-photo', 'grid-template-columns:minmax(0,1fr) auto auto;');
    rule(root + ' .rm-head .rm-photo', 'grid-column:3;grid-row:1;');
  } else if (st.headerStyle === 'ribbon') {
    // 左上角斜角标签：页眉给标签让出上边距。
    rule(root + ' .rm-head', 'position:relative;padding-top:' + Math.max(st.padY + 22, 56) + 'px;');
    rule(root + ' .rm-head::before', 'content:"";position:absolute;left:0;top:0;width:132px;height:34px;background:' + c.accent + ';clip-path:polygon(0 0,100% 0,100% 76%,0 100%);');
  }

  if (st.contentStyle === 'card') {
    // 左侧栏搬走模块后，卡片只落在右栏（左栏深底上用白字，卡片底色会打架）。
    var cardSel = st.layout === 'sidebar' && sideSections.length && rightSel ? rightSel : root + ' .rm-sec';
    var cardHeadSel = st.layout === 'sidebar' && sideSections.length && rightSel ? rightSel + ' .rm-sec-h' : root + ' .rm-sec-h';
    rule(cardSel, 'margin-top:' + st.sectionGap + 'px;border:1px solid ' + rmRgba(c.accent, 0.2) + ';border-radius:6px;padding:10px 14px 12px;background:' + c.background + ';');
    rule(cardHeadSel, 'border-bottom:1px solid ' + rmRgba(c.accent, 0.22) + ';padding-bottom:6px;margin-bottom:9px;');
  }

  // 斜切色带的页眉强调：底部青→金斜切色带 + 名字右侧金色竖线 + 角色行拉宽字距。
  // 放在 headerBand 之后，保证 padding-bottom 能覆盖页眉色带那条统一 padding。
  if (st.headingStyle === 'banner') {
    rule(root + ' .rm-head', 'position:relative;padding-bottom:34px;');
    rule(
      root + ' .rm-head::after',
      'content:"";position:absolute;left:0;right:0;bottom:0;height:13px;background:linear-gradient(90deg,' + c.accent + ' 0 52%,' + c.gold + ' 52% 100%);clip-path:polygon(0 0,100% 0,calc(100% - 54px) 100%,0 100%);'
    );
    rule(
      root + ' .rm-name',
      'color:' + c.nameColor + ';font-size:' + st.nameSize + 'px;font-weight:700;letter-spacing:.22em;' + (st.fontFamily === 'serif' ? 'font-family:' + RM_FONT_STACKS.serif + ';' : '')
    );
    rule(root + ' .rm-name::after', 'content:"";display:inline-block;width:2px;height:.9em;margin-left:22px;vertical-align:-2px;background:linear-gradient(180deg,' + c.gold + ',#e9d7a0);');
    rule(root + ' .rm-role', 'letter-spacing:.4em;text-transform:uppercase;color:' + c.headingColor + ';');
  }

  /* ---- 版式细项：分隔线 / 要点符号 / 姓名对齐 / 联系方式 / 标签 / 照片 / 间距 ---- */
  // 这些字段的默认值都等于「不改动」：只有用户真改过才生成规则，避免动到内置模板原有外观。
  var dividerBody = '';
  if (st.sectionDivider === 'dashed') dividerBody = 'border-bottom:1px dashed ' + rmRgba(c.accent, 0.48) + ';padding-bottom:4px;';
  else if (st.sectionDivider === 'double') dividerBody = 'border-bottom:3px double ' + rmRgba(c.accent, 0.55) + ';padding-bottom:4px;';
  else if (st.sectionDivider === 'accent') dividerBody = 'border-bottom:2px solid ' + c.accent + ';padding-bottom:5px;';
  else if (st.sectionDivider === 'none') dividerBody = 'border-bottom:0;padding-bottom:2px;';
  if (dividerBody) {
    rule(root + ' .rm-sec-h', dividerBody);
    // 左栏里的模块标题是深底白字，单独给一条（选择器更具体，能盖过上一条）。
    if (st.layout === 'sidebar' && sideSections.length && railSel) {
      var railDividerInk = rmLuminance(railBg) < 0.62 ? '#ffffff' : c.bodyColor;
      rule(
        railSel + ' .rm-sec-h',
        st.sectionDivider === 'none'
          ? 'border-bottom:0;padding-bottom:2px;'
          : 'border-bottom:' + (st.sectionDivider === 'double' ? '3px double ' : st.sectionDivider === 'accent' ? '2px solid ' : '1px dashed ') + rmRgba(railDividerInk, 0.42) + ';padding-bottom:4px;'
      );
    }
  }

  if (st.bulletStyle === 'square') {
    rule(root + ' .rm-bullets li', 'list-style-type:square;');
  } else if (st.bulletStyle === 'ring') {
    rule(root + ' .rm-bullets li', 'list-style-type:circle;');
  } else if (st.bulletStyle === 'dash') {
    // 短横线要点：::marker 只认很少的取值，这里自己画一个，兼容性最好。
    rule(root + ' .rm-bullets li', 'list-style:none;position:relative;padding-left:14px;');
    rule(root + ' .rm-bullets li::before', 'content:"–";position:absolute;left:0;top:0;color:' + c.accent + ';');
  }

  if (st.nameAlign === 'center') {
    rule(root + ' .rm-id', 'text-align:center;');
    rule(root + ' .rm-name', 'text-align:center;');
  }

  var contactSel = root + ' .rm-contact,' + root + ' .rm-head.rm-has-photo .rm-contact';
  if (st.contactStyle === 'inline') {
    // 一行排开、用 · 分隔：窄屏会自然换行，不会挤成一列。
    rule(contactSel, 'display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 0;');
    rule(root + ' .rm-contact .rm-c', 'display:inline-flex;align-items:baseline;gap:5px;margin:0 16px 0 0;');
    rule(root + ' .rm-contact .rm-c + .rm-c::before', 'content:"·";margin-right:8px;color:' + rmRgba(c.accent, 0.5) + ';');
  } else if (st.contactStyle === 'pills') {
    rule(contactSel, 'display:flex;flex-wrap:wrap;align-items:center;gap:6px;');
    rule(
      root + ' .rm-contact .rm-c',
      'display:inline-flex;align-items:baseline;gap:6px;padding:2px 10px;border-radius:999px;background:' + rmRgba(c.accent, 0.08) + ';border:1px solid ' + rmRgba(c.accent, 0.18) + ';'
    );
  }

  if (st.tagStyle === 'plain') {
    rule(root + ' .rm-tag', 'border:0;background:transparent;padding:0;border-radius:0;color:' + c.bodyColor + ';');
  } else if (st.tagStyle === 'underline') {
    rule(root + ' .rm-tag', 'border:0;background:transparent;padding:0 0 1px;border-radius:0;border-bottom:1px solid ' + rmRgba(c.accent, 0.5) + ';color:' + rmMixHex(c.accent, c.bodyColor, 0.3) + ';');
  }

  // 照片：.rm-head .rm-photo 的选择器要压过左侧栏那几条固定尺寸的规则。
  var photoSel = root + ' .rm-head .rm-photo';
  if (st.photoFrame === 'none') {
    rule(photoSel, 'display:none;');
    rule(root + ' .rm-head.rm-has-photo', 'grid-template-columns:minmax(0,1fr);');
  } else if (st.photoFrame === 'circle') {
    rule(photoSel, 'border-radius:50%;');
  } else if (st.photoFrame === 'left') {
    // 强制照片在左：靠 order 把照片排到第一格（grid 也认 order）。
    rule(root + ' .rm-head.rm-has-photo', 'grid-template-columns:auto minmax(0,1fr);');
    rule(photoSel, 'order:-1;grid-column:1;grid-row:1;');
  }
  if (st.photoSize !== RM_PHOTO_SIZE_BASE) rule(photoSel, 'width:' + st.photoSize + 'px;height:' + st.photoSize + 'px;');

  if (st.itemGap > 0) {
    rule(root + ' .rm-item', 'margin-bottom:0;');
    rule(root + ' .rm-item + .rm-item', 'margin-top:' + st.itemGap + 'px;');
  }
  if (st.titleGap > 0) rule(root + ' .rm-sec-h', 'margin-bottom:' + st.titleGap + 'px;');

  return lines.join('\n');
}

/* ---------------- 从图片生成模板初稿（纯本地 canvas 取色） ---------------- */

/** 读不到图片时给一套默认初稿，保证流程能继续。 */
function rmAnalysisFallback(note) {
  var st = rmStyleDefaults();
  return {
    palette: {
      accent: st.colors.accent,
      nameColor: st.colors.nameColor,
      headingColor: st.colors.headingColor,
      bodyColor: st.colors.bodyColor,
      background: st.colors.background,
      bandColor: st.colors.bandColor,
      gold: st.colors.gold,
    },
    layout: {
      layout: 'single',
      headerStyle: 'plain',
      contentStyle: 'plain',
      headerBand: false,
      headerAlign: 'left',
      headingStyle: 'rule',
      contactCols: 2,
      headingBands: 0,
      fontFamily: 'sans',
      sidebarSections: [],
      leftColumn: { width: 0, blockCount: 0, extendsBelowHeader: false },
    },
    sidebarSections: [],
    leftColumn: { width: 0, blockCount: 0, extendsBelowHeader: false },
    size: { width: 0, height: 0 },
    note: note || '没有从图片里读到可用颜色，已用默认初稿',
    fallback: true,
  };
}

/** 选图 → FileReader → Image → canvas 取样。onDone(analysis) / onFail(Error)。 */
function rmAnalyzeImageFile(file, onDone, onFail) {
  function fail(message) {
    if (onFail) onFail(new Error(message));
  }
  if (!file) {
    fail('先选择一张简历截图或排版参考图');
    return;
  }
  var type = String(file.type || '');
  if (type && !/^image\//.test(type)) {
    fail('只支持图片文件（PNG / JPG / WebP）');
    return;
  }
  if (typeof FileReader === 'undefined' || typeof Image === 'undefined' || typeof document === 'undefined') {
    if (onDone) onDone(rmAnalysisFallback('当前环境不支持读取图片，已用默认初稿'));
    return;
  }
  var reader = new FileReader();
  reader.onerror = function () {
    fail('图片读取失败，换一张试试');
  };
  reader.onload = function () {
    var img = new Image();
    img.onerror = function () {
      fail('这张图片无法识别，换一张试试');
    };
    img.onload = function () {
      var analysis;
      try {
        analysis = rmAnalyzeImageElement(img);
      } catch (err) {
        fail((err && err.message) || '图片分析失败');
        return;
      }
      if (onDone) onDone(analysis);
    };
    img.src = String(reader.result || '');
  };
  reader.readAsDataURL(file);
}

/** 量化色桶里出现次数最多的颜色。 */
function rmTopBucketColor(buckets) {
  var best = null;
  Object.keys(buckets).forEach(function (key) {
    var bucket = buckets[key];
    if (!best || bucket.n > best.n) best = bucket;
  });
  if (!best || !best.n) return null;
  return { r: Math.round(best.r / best.n), g: Math.round(best.g / best.n), b: Math.round(best.b / best.n) };
}

/** RGB → 色相角（0~360；灰度返回 0）。判金色这类暖色用。 */
function rmHueOf(r, g, b) {
  var max = Math.max(r, g, b);
  var min = Math.min(r, g, b);
  if (max === min) return 0;
  var d = max - min;
  var hue;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return hue;
}

/** 色桶里挑「亮度最高且面积够大」的颜色（纸张底色用，避免被大片文字色带偏）。 */
function rmLightestBigBucketColor(buckets, minCount) {
  var best = null;
  var bestLum = -1;
  Object.keys(buckets).forEach(function (key) {
    var bucket = buckets[key];
    if (!bucket || bucket.n < minCount) return;
    var rgb = { r: Math.round(bucket.r / bucket.n), g: Math.round(bucket.g / bucket.n), b: Math.round(bucket.b / bucket.n) };
    var lum = rmLuminance(rmRgbToHex(rgb));
    if (lum > bestLum) {
      bestLum = lum;
      best = rgb;
    }
  });
  return best;
}

/**
 * 图片像素 → { palette, layout, size, note }。纯函数：只读 pixels.data（RGBA），
 * 不碰 canvas / DOM / 全局对象，所以能在 node 里拿真实样图跑回归（tools/analyze-samples.mjs）。
 *
 * 统计口径（阈值全部用 w / h 的比例，不依赖固定像素尺寸）：
 * - 颜色：饱和且不算太暗的像素里最常见的颜色当强调色；最暗的一撮当姓名色；
 *   整图最常见且够亮的颜色当纸张底色；暖色（金色）单独统计给「青金斜切」用。
 * - 布局：左侧 12%~45% 宽、贯穿大半页的深色竖栏 → sidebar；
 *   顶部整宽单色填充 → band；左上角贴左边的高饱和色块 → ribbon；顶部明显的左右两栏 → split。
 * - 标题装饰：先给彩色像素做 3x3 腐蚀（去掉 Windows ClearType 给文字加的彩色毛边），
 *   再把「实心彩色」按连通行块量几何：近正方形小块 → icon；窄长条 → tab / pill（两端是否收窄）；
 *   整宽高条 → banner；贴着标题行左边 4px 的窄竖条 → leftbar；只剩 1~2px 长横线 → underline。
 * - 内容块：成片的浅灰细线（长横线 + 长竖线同时出现）→ card。
 */
function rmAnalyzePixels(pixels) {
  var data = pixels && pixels.data;
  var w = pixels ? Math.round(pixels.width || 0) : 0;
  var h = pixels ? Math.round(pixels.height || 0) : 0;
  if (!data || w < 8 || h < 8) return rmAnalysisFallback('读不到图片像素，已用默认初稿');
  var total = w * h;
  var i;
  var x;
  var y;

  var rowInk = new Int32Array(h);
  var rowDark = new Int32Array(h);
  var rowColorful = new Int32Array(h);
  var rowWarm = new Int32Array(h);
  var colInk = new Int32Array(w);
  var colorMask = new Uint8Array(total);
  var lightMask = new Uint8Array(total);
  var bgBuckets = {};
  var accentBuckets = {};
  var warmBuckets = {};
  var darkBuckets = {};
  var darkSum = { r: 0, g: 0, b: 0, n: 0 };
  var inkTopY = Math.round(h * 0.06);
  var inkBotY = Math.round(h * 0.96);
  var inkRows = Math.max(1, inkBotY - inkTopY);
  var bandInkRows = Math.max(2, Math.round(h * 0.26));
  var bandInk = 0;
  var bandInkX = 0;

  for (y = 0; y < h; y++) {
    var rowBase = y * w;
    for (x = 0; x < w; x++) {
      i = (rowBase + x) * 4;
      if (data[i + 3] < 24) continue;
      var r = data[i];
      var g = data[i + 1];
      var b = data[i + 2];
      var max = Math.max(r, g, b);
      var min = Math.min(r, g, b);
      var sat = max - min;
      var lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 150 || sat > 40) {
        rowInk[y]++;
        if (y >= inkTopY && y < inkBotY) colInk[x]++;
        if (y < bandInkRows) {
          bandInk++;
          bandInkX += x;
        }
      }
      if (sat > 42 && max < 235 && lum > 34) {
        rowColorful[y]++;
        colorMask[rowBase + x] = 1;
      }
      if (sat < 20 && lum > 200 && lum < 250) lightMask[rowBase + x] = 1;
      if (lum < 120) {
        rowDark[y]++;
        var darkBucket = darkBuckets[(r >> 4) + '-' + (g >> 4) + '-' + (b >> 4)];
        if (!darkBucket) {
          darkBucket = { n: 0, r: 0, g: 0, b: 0 };
          darkBuckets[(r >> 4) + '-' + (g >> 4) + '-' + (b >> 4)] = darkBucket;
        }
        darkBucket.n++;
        darkBucket.r += r;
        darkBucket.g += g;
        darkBucket.b += b;
      }
      if (sat > 45 && lum > 60 && lum < 232 && (x & 1) === 0) {
        var warmHue = rmHueOf(r, g, b);
        if (warmHue >= 28 && warmHue <= 70) rowWarm[y]++;
      }
      if ((x & 1) || (y & 1)) continue;
      var key = (r >> 4) + '-' + (g >> 4) + '-' + (b >> 4);
      var bgBucket = bgBuckets[key];
      if (!bgBucket) {
        bgBucket = { n: 0, r: 0, g: 0, b: 0 };
        bgBuckets[key] = bgBucket;
      }
      bgBucket.n++;
      bgBucket.r += r;
      bgBucket.g += g;
      bgBucket.b += b;
      if (sat > 42 && max < 252 && lum > 34) {
        var accentBucket = accentBuckets[key];
        if (!accentBucket) {
          accentBucket = { n: 0, r: 0, g: 0, b: 0 };
          accentBuckets[key] = accentBucket;
        }
        accentBucket.n++;
        accentBucket.r += r;
        accentBucket.g += g;
        accentBucket.b += b;
      }
      if (sat > 30 && lum > 40 && lum < 244) {
        var hue = rmHueOf(r, g, b);
        if (hue >= 30 && hue <= 65) {
          var warmBucket = warmBuckets[key];
          if (!warmBucket) {
            warmBucket = { n: 0, r: 0, g: 0, b: 0 };
            warmBuckets[key] = warmBucket;
          }
          warmBucket.n++;
          warmBucket.r += r;
          warmBucket.g += g;
          warmBucket.b += b;
        }
      }
      if (lum < 92) {
        darkSum.r += r;
        darkSum.g += g;
        darkSum.b += b;
        darkSum.n++;
      }
    }
  }

  /* ---- 颜色：底色 / 强调色 / 姓名色 / 金色 ---- */
  var bgAvg = rmTopBucketColor(bgBuckets);
  var accentAvg = rmTopBucketColor(accentBuckets);
  var bigBg = rmLightestBigBucketColor(bgBuckets, Math.max(4, Math.round(total * 0.02)));
  var background = bigBg ? rmRgbToHex(bigBg) : bgAvg ? rmRgbToHex(bgAvg) : '#ffffff';
  var darkPaper = rmLuminance(background) < 0.45;
  var accent = accentAvg ? rmRgbToHex(accentAvg) : darkPaper ? '#7ccab6' : '#2f6fde';
  if (rmLuminance(accent) > 0.72) accent = rmMixHex(accent, '#1f2937', 0.45);
  if (rmLuminance(accent) < 0.14) accent = rmMixHex(accent, '#ffffff', 0.32);

  var nameColor;
  var darkestBucket = null;
  var darkestLum = 2;
  Object.keys(darkBuckets).forEach(function (bucketKey) {
    var bucket = darkBuckets[bucketKey];
    if (!bucket || bucket.n < Math.max(3, total * 0.0005)) return;
    var rgb = { r: Math.round(bucket.r / bucket.n), g: Math.round(bucket.g / bucket.n), b: Math.round(bucket.b / bucket.n) };
    var lum = rmLuminance(rmRgbToHex(rgb));
    if (lum < darkestLum) {
      darkestLum = lum;
      darkestBucket = rgb;
    }
  });
  if (darkestBucket) {
    nameColor = rmRgbToHex(darkestBucket);
  } else if (darkSum.n > total * 0.0015) {
    nameColor = rmRgbToHex({ r: darkSum.r / darkSum.n, g: darkSum.g / darkSum.n, b: darkSum.b / darkSum.n });
  } else {
    nameColor = darkPaper ? '#f3f6fa' : '#10213a';
  }
  if (!darkPaper && rmLuminance(nameColor) > 0.55) nameColor = '#111827';
  var warmAvg = rmTopBucketColor(warmBuckets);
  var gold = warmAvg ? rmRgbToHex(warmAvg) : darkPaper ? '#d8c07a' : '#c9a227';
  if (rmLuminance(gold) > 0.8) gold = rmMixHex(gold, '#8a6d14', 0.45);
  if (rmLuminance(gold) < 0.18) gold = rmMixHex(gold, '#ffffff', 0.32);
  var headingColor = nameColor;
  if (rmLuminance(headingColor) < 0.1 && !darkPaper) headingColor = rmMixHex(accent, nameColor, 0.55);
  var bodyColor = darkPaper ? '#e6ebf2' : '#1f2937';
  var bandColor = darkPaper ? rmMixHex(background, accent, 0.3) : rmMixHex(background, accent, 0.12);

  /* ---- 布局：左栏侧边栏 ---- */
  var colFrac = [];
  for (x = 0; x < w; x++) colFrac[x] = colInk[x] / inkRows;
  var layoutMode = 'single';
  var bodyX0 = 0;
  var sideColor = null;
  var sideLimit = Math.round(w * 0.55);
  var firstSideX = -1;
  for (x = 0; x < Math.round(w * 0.5); x++) {
    if (colFrac[x] >= 0.55) {
      firstSideX = x;
      break;
    }
  }
  if (firstSideX >= 0 && firstSideX <= Math.round(w * 0.05)) {
    var lastSideX = firstSideX;
    for (x = firstSideX; x < sideLimit; x++) {
      if (colFrac[x] >= 0.42) lastSideX = x;
      else if (x - lastSideX > Math.round(w * 0.03)) break;
    }
    var sideW = lastSideX - firstSideX + 1;
    if (sideW >= w * 0.12 && sideW <= w * 0.46) {
      var sideBuckets = {};
      var lightRight = 0;
      var rightN = 0;
      var rightFrom = Math.min(w - 1, lastSideX + Math.round(w * 0.06));
      for (y = inkTopY; y < inkBotY; y += 2) {
        for (x = firstSideX; x <= lastSideX; x += 2) {
          i = (y * w + x) * 4;
          if (data[i + 3] < 24) continue;
          var skey = (data[i] >> 4) + '-' + (data[i + 1] >> 4) + '-' + (data[i + 2] >> 4);
          var sideBucket = sideBuckets[skey];
          if (!sideBucket) {
            sideBucket = { n: 0, r: 0, g: 0, b: 0 };
            sideBuckets[skey] = sideBucket;
          }
          sideBucket.n++;
          sideBucket.r += data[i];
          sideBucket.g += data[i + 1];
          sideBucket.b += data[i + 2];
        }
        for (x = rightFrom; x < w; x += 2) {
          i = (y * w + x) * 4;
          if (data[i + 3] < 24) continue;
          rightN++;
          if (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] > 200) lightRight++;
        }
      }
      var sideTop = rmTopBucketColor(sideBuckets);
      var rightLightFrac = rightN ? lightRight / rightN : 0;
      if (sideTop && rightLightFrac >= 0.7) {
        var sideHex = rmRgbToHex(sideTop);
        if (rmLuminance(sideHex) < 0.72) {
          layoutMode = 'sidebar';
          sideColor = sideHex;
          bodyX0 = Math.min(w - 1, lastSideX + Math.round(w * 0.015));
        }
      }
    }
  }
  if (sideColor) {
    accent = rmLuminance(sideColor) > 0.55 ? rmMixHex(sideColor, '#1f2937', 0.4) : sideColor;
    bandColor = rmMixHex(sideColor, '#ffffff', 0.12);
  }

  /* ---- 左栏：页头之后还有几组文字块（决定是否把技能等模块搬进侧栏） ---- */
  var leftColumn = { width: 0, blockCount: 0, extendsBelowHeader: false };
  if (layoutMode === 'sidebar' && sideColor) {
    var railX0 = firstSideX + 2;
    var railX1 = Math.max(railX0 + 1, lastSideX - 1);
    var railW = railX1 - railX0 + 1;
    var railRgb = rmHexToRgb(sideColor) || { r: 0, g: 0, b: 0 };
    var railRows = new Int32Array(h);
    var rx;
    for (y = Math.round(h * 0.03); y < Math.round(h * 0.97); y++) {
      var railHit = 0;
      for (rx = railX0; rx <= railX1; rx++) {
        i = (y * w + rx) * 4;
        if (data[i + 3] < 24) continue;
        // 和侧栏底色差得够多就算「这一列有内容」（白字、白底标签、照片都算）。
        if (Math.abs(data[i] - railRgb.r) + Math.abs(data[i + 1] - railRgb.g) + Math.abs(data[i + 2] - railRgb.b) > 96) railHit++;
      }
      railRows[y] = railHit;
    }
    var railMinCols = Math.max(3, Math.round(railW * 0.05));
    var railGapMin = Math.max(5, Math.round(h * 0.012));
    var railBlockMin = Math.max(5, Math.round(h * 0.005));
    var railBelowY = Math.round(h * 0.35);
    var railBlocks = 0;
    var railInBlock = false;
    var railBlockStart = 0;
    var railLastText = 0;
    for (y = 0; y < h; y++) {
      if (railRows[y] >= railMinCols) {
        if (!railInBlock) {
          railInBlock = true;
          railBlockStart = y;
        }
        railLastText = y;
      } else if (railInBlock && y - railLastText >= railGapMin) {
        if (railLastText - railBlockStart + 1 >= railBlockMin && railBlockStart >= railBelowY) railBlocks++;
        railInBlock = false;
      }
    }
    if (railInBlock && railLastText - railBlockStart + 1 >= railBlockMin && railBlockStart >= railBelowY) railBlocks++;
    leftColumn = {
      width: Math.round((railW / Math.max(1, w)) * 1000) / 10,
      blockCount: railBlocks,
      extendsBelowHeader: railBlocks >= 2,
    };
  }
  // 左栏在页头之后还排了模块 → 建议把这些模块搬到侧栏（目前只区分「有 / 没有技能类模块」）。
  var sidebarSections = layoutMode === 'sidebar' && leftColumn.extendsBelowHeader ? ['skills'] : [];

  /* ---- 页眉：band / ribbon / split / plain ---- */
  function rmRowFillInfo(rowY, xFrom, xTo) {
    var buckets = {};
    var bestKey = null;
    var xx;
    for (xx = xFrom; xx < xTo; xx++) {
      var ii = (rowY * w + xx) * 4;
      if (data[ii + 3] < 24) continue;
      var rr = data[ii];
      var gg = data[ii + 1];
      var bb = data[ii + 2];
      if (0.299 * rr + 0.587 * gg + 0.114 * bb > 238) continue;
      var k = (rr >> 5) + '-' + (gg >> 5) + '-' + (bb >> 5);
      var bk = buckets[k];
      if (!bk) {
        bk = { n: 0, r: 0, g: 0, b: 0, minX: xx, maxX: xx };
        buckets[k] = bk;
      }
      bk.n++;
      bk.r += rr;
      bk.g += gg;
      bk.b += bb;
      if (xx < bk.minX) bk.minX = xx;
      if (xx > bk.maxX) bk.maxX = xx;
      if (!bestKey || buckets[bestKey].n < bk.n) bestKey = k;
    }
    if (!bestKey) return null;
    var top = buckets[bestKey];
    return { fill: top.n / Math.max(1, xTo - xFrom), minX: top.minX, maxX: top.maxX, color: { r: top.r / top.n, g: top.g / top.n, b: top.b / top.n } };
  }

  var headerStyle = 'plain';
  var bandEndY = 0;
  if (layoutMode === 'single') {
    var bandMinRows = Math.max(18, Math.round(h * 0.018));
    var bandScanEnd = Math.round(h * 0.34);
    var bandRunStart = -1;
    var bandBestRows = 0;
    var bandColorSum = { r: 0, g: 0, b: 0, n: 0 };
    var bandColor = null;
    for (y = 0; y <= bandScanEnd; y++) {
      var fill = y < bandScanEnd ? rmRowFillInfo(y, 0, w) : null;
      var isBandRow = !!fill && fill.fill >= 0.33;
      if (isBandRow) {
        if (bandRunStart < 0) bandRunStart = y;
      } else if (bandRunStart >= 0) {
        var bandRows = y - bandRunStart;
        if (bandRows >= bandMinRows && bandRows > bandBestRows) {
          bandBestRows = bandRows;
          bandEndY = y - 1;
          bandColorSum = { r: 0, g: 0, b: 0, n: 0 };
          for (var by = bandRunStart; by < y; by++) {
            var binfo = rmRowFillInfo(by, 0, w);
            if (!binfo) continue;
            bandColorSum.r += binfo.color.r;
            bandColorSum.g += binfo.color.g;
            bandColorSum.b += binfo.color.b;
            bandColorSum.n++;
          }
        }
        bandRunStart = -1;
      }
    }
    if (bandBestRows && bandColorSum.n) {
      bandColor = rmRgbToHex({ r: bandColorSum.r / bandColorSum.n, g: bandColorSum.g / bandColorSum.n, b: bandColorSum.b / bandColorSum.n });
      headerStyle = 'band';
      // 太接近白纸的「色带」不可用，按 accent 18% 混白重算，保证页眉能看出一层底。
      if (rmLuminance(bandColor) > 0.9) bandColor = rmMixHex(bandColor, accent, 0.18);
    }
  }

  if (headerStyle === 'plain') {
    // 左上角的高饱和色块（斜角标签）：贴着左边、宽度不超过 40%，其余白。
    // 只扫顶部 8% 高：真正的角标就在页眉最上面，再往下多半是标题装饰，不能当角标。
    var ribbonRows = 0;
    var ribbonScanEnd = Math.round(h * 0.08);
    var ribbonMaxX = Math.round(w * 0.4);
    for (y = 0; y < ribbonScanEnd; y++) {
      var satCount = 0;
      var satMinX = -1;
      var satMaxX = -1;
      for (x = 0; x < ribbonMaxX; x++) {
        i = (y * w + x) * 4;
        if (data[i + 3] < 24) continue;
        var r2 = data[i];
        var g2 = data[i + 1];
        var b2 = data[i + 2];
        var max2 = Math.max(r2, g2, b2);
        var min2 = Math.min(r2, g2, b2);
        var sat2 = max2 - min2;
        var lum2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;
        if (sat2 > 45 && lum2 > 34 && lum2 < 240) {
          satCount++;
          if (satMinX < 0) satMinX = x;
          satMaxX = x;
        }
      }
      var rightWhite = 0;
      var rightTotal = 0;
      for (x = Math.round(w * 0.5); x < w; x += 2) {
        i = (y * w + x) * 4;
        if (data[i + 3] < 24) continue;
        rightTotal++;
        if (data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 225) rightWhite++;
      }
      // 色块右侧紧跟着必须还是白的：整宽色带（青金双色带那种）会在这里被刷掉。
      var justRightSat = 0;
      for (x = Math.round(w * 0.42); x < Math.round(w * 0.6); x++) {
        i = (y * w + x) * 4;
        if (data[i + 3] < 24) continue;
        var mx3 = Math.max(data[i], data[i + 1], data[i + 2]);
        var mn3 = Math.min(data[i], data[i + 1], data[i + 2]);
        if (mx3 - mn3 > 45) justRightSat++;
      }
      // 截图常带一圈白边，色块到左边距允许留 6% 宽；再要求这一行本来就是「实心色块」
      // （填充率 >= 55%），否则斜切的细小装饰/彩色大标题会被误当成左上角标签。
      var satSpan = satMaxX - satMinX + 1;
      var ribbonRow =
        satCount >= w * 0.08 &&
        satSpan > 0 &&
        satCount / satSpan >= 0.55 &&
        satMinX <= Math.round(w * 0.06) &&
        satMaxX <= Math.round(w * 0.42) &&
        justRightSat <= w * 0.02 &&
        rightTotal > 0 &&
        rightWhite / rightTotal >= 0.6;
      if (ribbonRow) ribbonRows++;
    }
    if (ribbonRows >= Math.max(8, Math.round(h * 0.006)) && ribbonRows <= h * 0.14) headerStyle = 'ribbon';
  }

  function rmDarkCount(rowY, from, to) {
    var rowBase3 = rowY * w;
    var n = 0;
    for (var xx2 = from; xx2 < to; xx2++) {
      var ii2 = (rowBase3 + xx2) * 4;
      if (data[ii2 + 3] < 24) continue;
      if (0.299 * data[ii2] + 0.587 * data[ii2 + 1] + 0.114 * data[ii2 + 2] < 170) n++;
    }
    return n;
  }

  if (headerStyle === 'plain') {
    // 顶部左右两栏（名字在左、联系信息在右）且没有整宽色带 → split。
    var splitRows = 0;
    var splitFrom = Math.round(h * 0.04);
    var splitTo = Math.round(h * 0.26);
    for (y = splitFrom; y < splitTo; y++) {
      var leftInk = rmDarkCount(y, Math.round(w * 0.04), Math.round(w * 0.4));
      var rightInk = rmDarkCount(y, Math.round(w * 0.5), Math.round(w * 0.96));
      if (leftInk >= w * 0.03 && rightInk >= w * 0.04) splitRows++;
    }
    if (splitRows >= Math.max(8, Math.round(h * 0.01))) headerStyle = 'split';
  }

  /* ---- 标题装饰：腐蚀 → 连通行块 → 几何分类 ---- */
  var solid = new Uint8Array(total);
  var xFrom = Math.max(1, bodyX0);
  for (y = 1; y < h - 1; y++) {
    var base = y * w;
    for (x = xFrom; x < w - 1; x++) {
      var p = base + x;
      if (colorMask[p] && colorMask[p - 1] && colorMask[p + 1] && colorMask[p - w] && colorMask[p + w]) solid[p] = 1;
    }
  }
  var rowSolid = new Int32Array(h);
  var rowSolidMin = new Int32Array(h);
  var rowSolidMax = new Int32Array(h);
  for (y = 1; y < h - 1; y++) {
    var minX = -1;
    var maxX = -1;
    var count = 0;
    var rowBase2 = y * w;
    for (x = xFrom; x < w - 1; x++) {
      if (!solid[rowBase2 + x]) continue;
      count++;
      if (minX < 0) minX = x;
      maxX = x;
    }
    rowSolid[y] = count;
    rowSolidMin[y] = minX;
    rowSolidMax[y] = maxX;
  }

  var hasGoldBand = false;
  var warmMax = 0;
  for (y = 0; y < h; y++) {
    if (rowWarm[y] > warmMax) warmMax = rowWarm[y];
    if (rowWarm[y] * 2 >= w * 0.3) hasGoldBand = true;
  }

  var scanFrom = Math.round(h * 0.14);
  if (bandEndY > scanFrom) scanFrom = Math.min(h - 2, bandEndY + Math.round(h * 0.004));
  var minCols = Math.max(4, Math.round(w * 0.004));
  var votes = { icon: 0, pill: 0, tab: 0, banner: 0 };
  var blockDefs = [];
  var blockStart = -1;
  for (y = scanFrom; y <= h; y++) {
    var qualifies = y < h && rowSolid[y] >= minCols;
    if (qualifies) {
      if (blockStart < 0) blockStart = y;
      continue;
    }
    if (blockStart < 0) continue;
    var endY = y - 1;
    var blockFrom = blockStart;
    var bh = endY - blockFrom + 1;
    blockStart = -1;
    if (bh < Math.max(4, Math.round(h * 0.008))) {
      blockDefs.push({ start: blockFrom, end: endY, bh: bh, thin: true });
      continue;
    }
    blockDefs.push({ start: blockFrom, end: endY, bh: bh, thin: false });
    var spanMin = w;
    var spanMax = -1;
    var solidTotal = 0;
    for (var by2 = blockFrom; by2 <= endY; by2++) {
      if (rowSolid[by2] < minCols) continue;
      if (rowSolidMin[by2] < spanMin) spanMin = rowSolidMin[by2];
      if (rowSolidMax[by2] > spanMax) spanMax = rowSolidMax[by2];
      solidTotal += rowSolid[by2];
    }
    if (spanMax < 0) continue;
    var span = spanMax - spanMin + 1;
    var spanW = span / w;
    // 密度 = 实心像素 / 外接框：标题文字被算进色块时会明显偏低（文字笔画只占一小块）。
    var density = solidTotal / Math.max(1, bh * span);
    var midY = blockFrom + Math.floor(bh / 2);
    var topY = blockFrom + 1;
    var botY = endY - 1;
    if (rowSolid[topY] < minCols) topY = blockFrom;
    if (rowSolid[botY] < minCols) botY = endY;
    var topMin = rowSolidMin[topY];
    var midMin = rowSolidMin[midY] >= 0 ? rowSolidMin[midY] : spanMin;
    var midMax = rowSolidMax[midY] >= 0 ? rowSolidMax[midY] : spanMax;
    var botMax = rowSolidMax[botY];
    // icon：左边一截实心块（圆形图标也算），右边接标题文字。圆形图标上下收窄，
    // 所以用「首末行很窄 + 左侧一小段够密 + 右侧低密度」三条一起判，避免把斜切色块误判成图标。
    var narrowTop = rowSolid[blockFrom] <= Math.max(4, Math.round(bh * 0.6)) && rowSolid[endY] <= Math.max(5, Math.round(bh * 0.75));
    var leftW = Math.min(span, Math.max(4, Math.round(bh * 1.1)));
    var leftPix = 0;
    for (var lx = spanMin; lx < spanMin + leftW; lx++) {
      for (var ly = blockFrom; ly <= endY; ly++) if (solid[ly * w + lx]) leftPix++;
    }
    var leftDensity = leftPix / Math.max(1, leftW * bh);
    var postPix = 0;
    var postCols = 0;
    for (var px = spanMin + leftW; px <= spanMax; px++) {
      for (var ry6 = blockFrom; ry6 <= endY; ry6++) if (solid[ry6 * w + px]) postPix++;
      postCols++;
    }
    var postDensity = postCols ? postPix / (postCols * bh) : 0;
    var iconStandalone = spanW <= 0.07 && bh >= h * 0.01 && bh <= h * 0.042 && bh / span >= 0.7 && bh / span <= 1.6;
    var iconWithText = !iconStandalone && spanW > 0.04 && narrowTop && leftDensity >= 0.32 && postDensity <= 0.45;
    var isIcon = (iconStandalone || iconWithText) && !(hasGoldBand && spanW >= 0.045);
    var isWide = spanW >= 0.3 && bh >= h * 0.012 && density >= 0.38;
    var isStrip = spanW >= 0.045 && spanW < 0.3 && bh >= h * 0.012 && bh <= h * 0.06 && density >= 0.38;
    if (isIcon) votes.icon++;
    else if (isWide) votes.banner++;
    else if (isStrip) {
      if (hasGoldBand) votes.banner++;
      else {
        var roundThreshold = Math.max(2, Math.round(bh * 0.22));
        var leftRound = topMin - midMin >= roundThreshold;
        var rightRound = midMax - botMax >= roundThreshold;
        if (leftRound && rightRound) votes.pill++;
        else votes.tab++;
      }
    }
  }

  // 细横线：只算「本身很薄」的彩色行带，避免把标题色块本身当成下划线。
  var lineBands = 0;
  var inLine = false;
  for (y = scanFrom; y < h - 1; y++) {
    var isLineRow = rowColorful[y] >= w * 0.3;
    if (isLineRow) {
      var lineBlock = null;
      for (var bi = 0; bi < blockDefs.length; bi++) {
        if (y >= blockDefs[bi].start && y <= blockDefs[bi].end) {
          lineBlock = blockDefs[bi];
          break;
        }
      }
      if (!lineBlock || lineBlock.bh <= 5) {
        if (!inLine) {
          lineBands++;
          inLine = true;
        }
      } else inLine = false;
    } else inLine = false;
  }

  // 窄竖条（leftbar）：标题行左侧贴着内容区左边的小方块。
  var barComps = [];
  var barFrom = Math.max(1, bodyX0 + 1);
  var barTo = Math.min(w - 2, bodyX0 + Math.round(w * 0.09));
  for (y = scanFrom; y < h - 1; y++) {
    var runStart = -1;
    for (x = barFrom; x <= barTo; x++) {
      i = (y * w + x) * 4;
      var tall = false;
      if (x < w - 1 && data[i + 3] > 23) {
        var rr2 = data[i];
        var gg2 = data[i + 1];
        var bb2 = data[i + 2];
        var mx = Math.max(rr2, gg2, bb2);
        var mn = Math.min(rr2, gg2, bb2);
        var lum3 = 0.299 * rr2 + 0.587 * gg2 + 0.114 * bb2;
        tall = mx - mn > 40 && lum3 > 40 && lum3 < 235;
      }
      if (tall) {
        if (runStart < 0) runStart = x;
      } else if (runStart >= 0) {
        var runLen = x - runStart;
        if (runLen >= 2 && runLen <= 8) {
          var matched = false;
          for (var ci = 0; ci < barComps.length; ci++) {
            var comp = barComps[ci];
            if (comp.endY >= y - 2 && Math.abs(comp.x - runStart) <= 3) {
              comp.endY = y;
              comp.len = Math.max(comp.len, runLen);
              matched = true;
              break;
            }
          }
          if (!matched) barComps.push({ startY: y, endY: y, x: runStart, len: runLen });
        }
        runStart = -1;
      }
    }
  }
  var leftbarVotes = [];
  for (var cj = 0; cj < barComps.length; cj++) {
    var barComp = barComps[cj];
    var barH = barComp.endY - barComp.startY + 1;
    if (barH >= Math.max(8, Math.round(h * 0.008)) && barH <= Math.round(h * 0.024) && barComp.x - bodyX0 <= Math.round(w * 0.06)) {
      var known = false;
      for (var ck = 0; ck < leftbarVotes.length; ck++) {
        if (Math.abs(leftbarVotes[ck] - barComp.startY) < h * 0.02) known = true;
      }
      if (!known) leftbarVotes.push(barComp.startY);
    }
  }

  /* ---- 内容块：浅灰细线成片出现 → card ---- */
  var lightLineRows = 0;
  for (y = 1; y < h - 1; y++) {
    var bestRun = 0;
    var curRun = 0;
    var lrowBase = y * w;
    for (x = 0; x < w; x++) {
      if (lightMask[lrowBase + x]) {
        curRun++;
        if (curRun > bestRun) bestRun = curRun;
      } else curRun = 0;
    }
    if (bestRun >= w * 0.62) lightLineRows++;
  }
  var lightLineCols = 0;
  for (x = 1; x < w - 1; x++) {
    var bestCol = 0;
    var curCol = 0;
    for (y = 0; y < h; y++) {
      if (lightMask[y * w + x]) {
        curCol++;
        if (curCol > bestCol) bestCol = curCol;
      } else curCol = 0;
    }
    if (bestCol >= h * 0.1) lightLineCols++;
  }
  var contentStyle = lightLineRows >= Math.max(16, Math.round(h * 0.012)) && lightLineCols >= 2 ? 'card' : 'plain';

  /* ---- 旧版兜底：彩色横条数量（>=3 banner / >=1 bar） ---- */
  var bandRunMin = 2;
  var bandRunMax = Math.max(6, Math.round(h * 0.2));
  var refW = Math.max(1, w);
  var headingBands = 0;
  var run = 0;
  for (y = scanFrom; y <= h; y++) {
    var isBandRow = y < h && rowColorful[y] / w > 0.32;
    if (isBandRow) {
      run++;
      continue;
    }
    // 同样折算到 160px 宽参考分辨率，保持旧阈值含义。
    if (run >= bandRunMin && run <= bandRunMax && run * (160 / refW) >= 12) headingBands++;
    run = 0;
  }

  var headingStyle = 'rule';
  var styleOrder = ['banner', 'icon', 'pill', 'tab'];
  var bestVote = 0;
  var bestName = '';
  styleOrder.forEach(function (name) {
    if (votes[name] > bestVote) {
      bestVote = votes[name];
      bestName = name;
    }
  });
  if (bestVote >= 2) headingStyle = bestName;
  else if (leftbarVotes.length >= 2) headingStyle = 'leftbar';
  else if (votes.banner >= 1 && hasGoldBand) headingStyle = 'banner';
  else if (lineBands >= 2) headingStyle = 'underline';
  else if (headingBands >= 3) headingStyle = 'banner';
  else if (headingBands >= 1) headingStyle = 'bar';

  var titleRows = Math.max(3, Math.round(h * 0.3));
  var runStart2 = -1;
  var bestTextRun = 0;
  for (y = 0; y < titleRows; y++) {
    var isTextRow = rowDark[y] >= Math.max(1, w * 0.02) && rowDark[y] / w < 0.6;
    if (isTextRow) {
      if (runStart2 < 0) runStart2 = y;
      if (y - runStart2 + 1 > bestTextRun) bestTextRun = y - runStart2 + 1;
    } else runStart2 = -1;
  }
  // 衬线判断：把最高的一段文字行折算到 160px 宽的参考分辨率再比，避免分析分辨率升高后阈值失真。
  // 左侧栏布局时整条深色竖栏会被当成一大段「文字行」，直接判 sans。
  var fontFamily =
    layoutMode !== 'sidebar' && bestTextRun * (160 / Math.max(1, w)) >= 18 ? 'serif' : 'sans';
  var headerAlign = 'left';
  if (headerStyle === 'plain' && bandInk > bandInkRows * w * 0.012) {
    var center = bandInkX / bandInk / w;
    if (center > 0.44 && center < 0.56) headerAlign = 'center';
  }
  if (headerStyle === 'band' && bandColor && rmLuminance(bandColor) > 0.72) bandColor = rmMixHex(accent, '#ffffff', 0.82);

  var result = {
    palette: {
      accent: accent,
      nameColor: nameColor,
      headingColor: headingColor,
      bodyColor: bodyColor,
      background: background,
      bandColor: bandColor,
      gold: gold,
    },
    layout: {
      layout: layoutMode,
      headerStyle: headerStyle,
      contentStyle: contentStyle,
      headerBand: headerStyle === 'band',
      headerAlign: headerAlign,
      headingStyle: headingStyle,
      contactCols: 2,
      headingBands: headingBands,
      fontFamily: fontFamily,
      sidebarSections: sidebarSections,
      leftColumn: leftColumn,
    },
    sidebarSections: sidebarSections,
    leftColumn: leftColumn,
    size: { width: w, height: h },
    note: '',
    fallback: false,
  };
  // 顺手把 layout/palette 折成一份完整 style，调试工具和导入弹窗都能直接拿来用。
  result.style = rmStyleFromAnalysis(result);
  return result;
}

/** 缩放图片 → 像素 → rmAnalyzePixels。canvas / DOM 只在这个函数里用。 */
function rmAnalyzeImageElement(img) {
  var nw = img.naturalWidth || img.width || 0;
  var nh = img.naturalHeight || img.height || 0;
  if (!nw || !nh) return rmAnalysisFallback('读不到图片尺寸，已用默认初稿');
  // 识别阈值都按比例算，工作分辨率取长边 960：足够看清 1px 细线，也不至于太慢。
  var maxSide = 960;
  var scale = Math.min(1, maxSide / Math.max(nw, nh));
  var w = Math.max(1, Math.round(nw * scale));
  var h = Math.max(1, Math.round(nh * scale));
  var canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return rmAnalysisFallback('当前环境不支持 canvas，已用默认初稿');
  ctx.drawImage(img, 0, 0, w, h);
  var imageData;
  try {
    imageData = ctx.getImageData(0, 0, w, h);
  } catch (err) {
    return rmAnalysisFallback('读不到图片像素，已用默认初稿');
  }
  var analysis = rmAnalyzePixels({ data: imageData.data, width: w, height: h });
  analysis.size = { width: nw, height: nh };
  return analysis;
}

/** 分析结果 → style。 */
function rmStyleFromAnalysis(analysis) {
  var st = rmStyleDefaults();
  if (!analysis) return st;
  // 预设直通：分析结果里带完整 style 时直接用（编辑器预设/导入弹窗预设都走这条）。
  if (analysis.style && typeof analysis.style === 'object') return rmNormalizeStyle(analysis.style);
  var palette = analysis.palette || {};
  Object.keys(st.colors).forEach(function (key) {
    if (rmHexIsValid(palette[key])) st.colors[key] = rmNormalizeHex(palette[key]);
  });
  var layout = analysis.layout || {};
  if (layout.headerBand) st.headerBand = true;
  if (layout.headerAlign === 'center') st.headerAlign = 'center';
  if (layout.headingStyle) st.headingStyle = rmStylePickEnum(layout.headingStyle, RM_HEADING_STYLES, st.headingStyle);
  if (layout.layout) st.layout = rmStylePickEnum(layout.layout, RM_LAYOUTS, st.layout);
  if (layout.headerStyle) st.headerStyle = rmStylePickEnum(layout.headerStyle, RM_HEADER_STYLES, st.headerStyle);
  if (layout.contentStyle) st.contentStyle = rmStylePickEnum(layout.contentStyle, RM_CONTENT_STYLES, st.contentStyle);
  // 左栏承载模块：图片里左栏在页头之后还排了文字块时，把对应模块搬过去。
  var suggestedSections = rmNormalizeSidebarSections(
    analysis.sidebarSections != null ? analysis.sidebarSections : layout.sidebarSections
  );
  if (suggestedSections) st.sidebarSections = suggestedSections;
  // 左侧栏的页眉在左栏里自己上色，不再叠加整宽色带。
  if (st.layout === 'sidebar') st.headerStyle = 'plain';
  st.headerBand = st.headerStyle === 'band';
  for (var fi = 0; fi < RM_FONT_FAMILIES.length; fi++) {
    if (RM_FONT_FAMILIES[fi][0] === layout.fontFamily) {
      st.fontFamily = layout.fontFamily;
      break;
    }
  }
  if (layout.contactCols) {
    var cols = rmClampNum(layout.contactCols, 1, 4);
    if (cols != null) st.contactCols = cols;
  }
  return rmNormalizeStyle(st);
}

/* ---------------- 表单原语（复用面板风格） ---------------- */

function rmSplitTags(text) {
  return String(text == null ? '' : text)
    .split(/[\s,，、;；]+/)
    .map(function (item) { return item.trim(); })
    .filter(Boolean)
    .slice(0, 5)
    .map(function (item) { return item.slice(0, 12); });
}

function rmChipRow(props) {
  var options = props.options || [];
  return h(
    'div',
    { className: 'rm-sec-chips' },
    options.map(function (option) {
      return h(
        'button',
        {
          key: option[0],
          type: 'button',
          className: 'rm-chip' + (props.value === option[0] ? ' is-on' : ''),
          onClick: function () {
            props.onPick(option[0]);
          },
        },
        option[1]
      );
    })
  );
}

function rmColorField(props) {
  return h(
    'div',
    { className: 'rm-color-field' },
    h('span', { className: 'rm-field-k' }, props.label),
    h(
      'div',
      { className: 'rm-row', style: { gap: '6px' } },
      h('input', {
        className: 'rm-color-input',
        type: 'color',
        value: props.value,
        onChange: function (event) {
          props.onChange(event.target.value);
        },
      }),
      h('span', { className: 'rm-color-val' }, props.value)
    )
  );
}

function rmRangeField(props) {
  return h(
    'label',
    { className: 'rm-range-field' },
    h('span', { className: 'rm-range-k' }, h('span', null, props.label), h('b', null, props.display || String(props.value))),
    h('input', {
      className: 'rm-range',
      type: 'range',
      min: props.min,
      max: props.max,
      step: props.step || 1,
      value: props.value,
      onChange: function (event) {
        props.onChange(Number(event.target.value));
      },
    })
  );
}

/** 编辑器右侧：按容器宽度缩放的 A4 实时预览。 */
function TemplateEditorPreview(props) {
  var measured = rmUseWidth(360);
  var hostRef = measured[0];
  var hostWidth = measured[1];
  var width = Math.max(180, Math.min(PAPER_W, Math.floor(hostWidth) - 6 || 320));
  return h(
    'div',
    { className: 'rm-tpl-preview' },
    h(
      'div',
      { className: 'rm-row', style: { width: '100%' } },
      h('b', { style: { fontSize: '12px' } }, 'A4 实时预览'),
      props.label ? h('span', { className: 'rm-pill rm-pill-brand' }, props.label) : null,
      h('span', { className: 'rm-muted', style: { marginLeft: 'auto', fontSize: '10.5px' } }, Math.round((width / PAPER_W) * 100) + '%')
    ),
    h(
      'div',
      { ref: hostRef, style: { width: '100%', display: 'flex', justifyContent: 'center' } },
      h(PreviewScaled, { resume: props.resume, template: props.template, width: width, frame: true })
    )
  );
}

/* ---------------- 模板编辑器（新建 / 编辑 / 复制） ---------------- */

/**
 * props：
 *   initial  { id?, name, en, tagline, tags, style, css, cls, sample }
 *   title    弹窗标题
 *   resume   预览用的简历对象（不给就用 initial.sample）
 *   error    外部错误文案（保存失败时由面板传入）
 *   busy     保存中
 *   onClose / onSave(payload, publish)
 */
function TemplateEditor(props) {
  var initial = props.initial || {};
  var seedStyle = rmNormalizeStyle(initial.style);
  var seedCls = rmStyleClass(initial.cls || rmNewStyleClass(initial.name));
  var nameState = useState(initial.name || '未命名模板');
  var name = nameState[0];
  var setName = nameState[1];
  var enState = useState(initial.en || '');
  var en = enState[0];
  var setEn = enState[1];
  var taglineState = useState(initial.tagline || '');
  var tagline = taglineState[0];
  var setTagline = taglineState[1];
  var tagsState = useState((Array.isArray(initial.tags) ? initial.tags : []).join(' '));
  var tags = tagsState[0];
  var setTags = tagsState[1];
  var clsState = useState(seedCls);
  var cls = clsState[0];
  var setCls = clsState[1];
  var styleState = useState(seedStyle);
  var style = styleState[0];
  var setStyleState = styleState[1];
  var cssState = useState(typeof initial.css === 'string' && initial.css.trim() ? initial.css : rmStyleToCss(seedStyle, seedCls));
  var cssText = cssState[0];
  var setCssText = cssState[1];
  var manualState = useState(false);
  var manual = manualState[0];
  var setManual = manualState[1];
  var errState = useState('');
  var localError = errState[0];
  var setLocalError = errState[1];

  var previewTemplate = { id: initial.id || 'rm-tpl-editor', name: name || '模板预览', cls: cls, css: cssText };
  var aiState = useState({ busy: false, notes: '', error: '', diff: [] });
  var aiInfo = aiState[0];
  var setAiInfo = aiState[1];
  var previewResume = props.resume || rmSampleResume(initial.sample || DEMO_RESUME_DATA);

  function patchStyle(patch) {
    var next = rmStyleMerge(style, patch);
    setStyleState(next);
    if (!manual) setCssText(rmStyleToCss(next, cls));
  }

  function patchColor(key, value) {
    var colors = {};
    colors[key] = value;
    patchStyle({ colors: colors });
  }

  // 侧栏模块多选：点一下把一个模块搬进左栏 / 搬回右栏。
  function toggleSidebarSection(id) {
    var list = (Array.isArray(style.sidebarSections) ? style.sidebarSections : []).slice();
    var at = list.indexOf(id);
    if (at >= 0) list.splice(at, 1);
    else list.push(id);
    patchStyle({ sidebarSections: list });
  }

  function changeCls(value) {
    setCls(value);
    if (!manual) setCssText(rmStyleToCss(style, value));
  }

  function changeCss(value) {
    setCssText(value);
    setManual(true);
  }

  function rewriteCss() {
    setManual(false);
    setCssText(rmStyleToCss(style, cls));
  }

  // 一键换到「青金斜切」：大号衬线标题 + 金色细线 + 斜切色带分块标题。
  function applyBannerPreset() {
    var next = rmBannerPresetStyle();
    setStyleState(next);
    setManual(false);
    setCssText(rmStyleToCss(next, cls));
  }

  // 一键套用内置版式预设（侧栏深蓝 / 蓝色胶囊 / 蓝色圆形图标 / 浅灰卡片）。
  function applyStylePreset(id) {
    var next = rmStylePreset(id);
    setStyleState(next);
    setManual(false);
    setCssText(rmStyleToCss(next, cls));
  }

  /** 基于当前示例文本 + 当前 style 让 AI 复核版式；返回的 style 直接合并进编辑器。 */
  function refineStyle() {
    if (aiInfo.busy) return;
    var before = style;
    var source = {
      kind: 'template',
      sourceName: String(name || '模板示例'),
      colors: (before && before.colors) || {},
      fonts: (before && before.fontFamily) || 'sans',
      text: rmTemplateSampleText(previewResume),
    };
    setAiInfo({ busy: true, notes: '', error: '', diff: [] });
    rmApi('/template/refine', { method: 'POST', body: { source: source, draft: { style: before } } })
      .then(function (value) {
        var next = rmStyleMerge(before, (value && value.style) || null);
        setStyleState(next);
        setManual(false);
        setCssText(rmStyleToCss(next, cls));
        setAiInfo({
          busy: false,
          notes: (value && value.notes) || '',
          error: '',
          diff: rmStyleDiffChips(before, next),
        });
      })
      .catch(function (err) {
        setAiInfo({ busy: false, notes: '', error: rmErrText(err) || 'AI 优化失败，可以继续手动调整', diff: [] });
      });
  }

  function submit(publish) {
    var finalName = String(name || '').trim();
    if (!finalName) {
      setLocalError('先给模板起个名字');
      return;
    }
    setLocalError('');
    var payload = {
      name: finalName,
      en: String(en || '').trim(),
      tagline: String(tagline || '').trim(),
      tags: rmSplitTags(tags),
      accent: style.colors.accent,
      cls: rmStyleClass(cls),
      css: cssText,
      style: style,
    };
    if (initial.id) payload.id = initial.id;
    if (initial.sample) payload.sample = initial.sample;
    if (props.onSave) props.onSave(payload, !!publish);
  }

  var headingHint = '元素格式改动会即时重算 CSS；右侧预览就是最终 A4 效果';
  return h(
    'div',
    { className: 'rm-modal' },
    h(
      'div',
      { className: 'rm-modal-card rm-tpl-editor-card' },
      h(
        'div',
        { className: 'rm-modal-h' },
        h('h3', null, props.title || (initial.id ? '编辑模板' : '新建模板')),
        h('span', { className: 'rm-muted', style: { fontSize: '11px' } }, headingHint),
        h(
          'button',
          { type: 'button', className: 'rm-btn rm-btn-sm', disabled: aiInfo.busy, onClick: refineStyle },
          aiInfo.busy ? 'AI 比对中…' : 'AI 优化版式'
        ),
        h(
          'button',
          { type: 'button', className: 'rm-btn rm-btn-sm', style: { marginLeft: 'auto' }, onClick: props.onClose },
          '关闭'
        )
      ),
      h(
        'div',
        { className: 'rm-modal-b rm-tpl-editor-body' },
        aiInfo.diff && aiInfo.diff.length
          ? h('div', { className: 'rm-row', style: { flexWrap: 'wrap', gap: '6px' } }, aiInfo.diff.map(function (text) {
              return h('span', { key: text, className: 'rm-pill' }, text);
            }))
          : null,
        aiInfo.notes ? h('div', { className: 'rm-hint' }, 'AI 说明：' + aiInfo.notes) : null,
        aiInfo.error ? h('div', { className: 'rm-text-danger', style: { fontSize: '11.5px' } }, aiInfo.error) : null,
        h(
          'div',
          { className: 'rm-tpl-editor-form' },
          card({
            title: '模板信息',
            hint: '名称会出现在模板库里',
            children: h(
              'div',
              { className: 'rm-col' },
              h(
                Fields2,
                null,
                h(Field, { label: '模板名称', value: name, placeholder: '例如：克制的深蓝', onChange: setName }),
                h(Field, { label: '英文名（可选）', value: en, placeholder: 'Midnight Blue', onChange: setEn })
              ),
              h(Field, { label: '一句话卖点', value: tagline, placeholder: '适合投产品/运营岗，信息密度中等', onChange: setTagline, wide: true }),
              h(
                Fields2,
                null,
                h(Field, { label: '标签（空格分隔，最多 5 个）', value: tags, placeholder: '商务 蓝灰 单栏', onChange: setTags }),
                h(Field, { label: 'CSS 根类名', value: cls, placeholder: 'rm-t-my-template', onChange: changeCls })
              ),
              h('span', { className: 'rm-hint' }, '根类名会和 CSS 根选择器保持一致：预览与保存都用它，一般不用改。')
            ),
          }),
          card({
            title: '版式',
            hint: '布局 / 页眉 / 内容块 / 标题装饰 / 字体',
            children: h(
              'div',
              { className: 'rm-col' },
              h(
                'div',
                { className: 'rm-row', style: { flexWrap: 'wrap', gap: '6px' } },
                h(
                  'button',
                  { type: 'button', className: 'rm-btn rm-btn-sm', onClick: applyBannerPreset },
                  '一键套用「青金斜切」'
                ),
                h(
                  'button',
                  { type: 'button', className: 'rm-btn rm-btn-sm', onClick: function () { applyStylePreset('sidebar-deep'); } },
                  '侧栏深蓝'
                ),
                h(
                  'button',
                  { type: 'button', className: 'rm-btn rm-btn-sm', onClick: function () { applyStylePreset('pill-blue'); } },
                  '蓝色胶囊'
                ),
                h(
                  'button',
                  { type: 'button', className: 'rm-btn rm-btn-sm', onClick: function () { applyStylePreset('icon-blue'); } },
                  '蓝色圆形图标'
                ),
                h(
                  'button',
                  { type: 'button', className: 'rm-btn rm-btn-sm', onClick: function () { applyStylePreset('card-light'); } },
                  '浅灰卡片'
                )
              ),
              h('span', { className: 'rm-field-k' }, '布局'),
              h(rmChipRow, { options: RM_LAYOUTS, value: style.layout, onPick: function (v) { patchStyle({ layout: v }); } }),
              style.layout === 'sidebar'
                ? h(
                    'div',
                    { className: 'rm-col' },
                    h('span', { className: 'rm-field-k' }, '侧栏模块（搬到左栏）'),
                    h(
                      'div',
                      { className: 'rm-sec-chips' },
                      RM_SIDEBAR_SECTIONS.map(function (item) {
                        var on = (style.sidebarSections || []).indexOf(item[0]) >= 0;
                        return h(
                          'button',
                          {
                            key: item[0],
                            type: 'button',
                            className: 'rm-chip' + (on ? ' is-on' : ''),
                            onClick: function () { toggleSidebarSection(item[0]); },
                          },
                          item[1]
                        );
                      })
                    ),
                    h('span', { className: 'rm-hint' }, '选中的模块会搬进左侧深色栏，右栏自动跳过；一个都不选时左栏只放姓名、角色和联系方式。')
                  )
                : null,
              h('span', { className: 'rm-field-k' }, '页眉'),
              h(rmChipRow, { options: RM_HEADER_STYLES, value: style.headerStyle, onPick: function (v) { patchStyle({ headerStyle: v }); } }),
              h('span', { className: 'rm-field-k' }, '内容块'),
              h(rmChipRow, { options: RM_CONTENT_STYLES, value: style.contentStyle, onPick: function (v) { patchStyle({ contentStyle: v }); } }),
              h('span', { className: 'rm-field-k' }, '标题样式'),
              h(rmChipRow, { options: RM_HEADING_STYLES, value: style.headingStyle, onPick: function (v) { patchStyle({ headingStyle: v }); } }),
              h('span', { className: 'rm-field-k' }, '字体'),
              h(rmChipRow, { options: RM_FONT_FAMILIES, value: style.fontFamily, onPick: function (v) { patchStyle({ fontFamily: v }); } }),
              h('span', { className: 'rm-field-k' }, '页眉对齐'),
              h(rmChipRow, { options: RM_HEADER_ALIGNS, value: style.headerAlign, onPick: function (v) { patchStyle({ headerAlign: v }); } }),
              h(
                'div',
                { className: 'rm-row' },
                h('span', { className: 'rm-field-k', style: { minWidth: '72px' } }, '联系信息列数'),
                h(rmChipRow, {
                  options: [
                    ['2', '2 列'],
                    ['3', '3 列'],
                    ['4', '4 列'],
                  ],
                  value: String(Math.round(style.contactCols)),
                  onPick: function (v) { patchStyle({ contactCols: Number(v) }); },
                })
              ),
              h('span', { className: 'rm-field-k' }, '分隔线'),
              h(rmChipRow, { options: RM_SECTION_DIVIDERS, value: style.sectionDivider, onPick: function (v) { patchStyle({ sectionDivider: v }); } }),
              h('span', { className: 'rm-field-k' }, '要点符号'),
              h(rmChipRow, { options: RM_BULLET_STYLES, value: style.bulletStyle, onPick: function (v) { patchStyle({ bulletStyle: v }); } }),
              h('span', { className: 'rm-field-k' }, '标签样式'),
              h(rmChipRow, { options: RM_TAG_STYLES, value: style.tagStyle, onPick: function (v) { patchStyle({ tagStyle: v }); } }),
              h('span', { className: 'rm-field-k' }, '联系方式'),
              h(rmChipRow, { options: RM_CONTACT_STYLES, value: style.contactStyle, onPick: function (v) { patchStyle({ contactStyle: v }); } }),
              h('span', { className: 'rm-field-k' }, '姓名对齐'),
              h(rmChipRow, { options: RM_NAME_ALIGNS, value: style.nameAlign, onPick: function (v) { patchStyle({ nameAlign: v }); } }),
              h('span', { className: 'rm-field-k' }, '照片'),
              h(rmChipRow, { options: RM_PHOTO_FRAMES, value: style.photoFrame, onPick: function (v) { patchStyle({ photoFrame: v }); } }),
              h(
                'div',
                { className: 'rm-range-grid' },
                h(rmRangeField, {
                  label: '照片大小',
                  value: style.photoSize,
                  min: 56,
                  max: 160,
                  step: 4,
                  display: style.photoSize + 'px',
                  onChange: function (v) { patchStyle({ photoSize: v }); },
                }),
                h(rmRangeField, {
                  label: '条目间距',
                  value: style.itemGap,
                  min: 0,
                  max: 40,
                  step: 2,
                  display: style.itemGap ? style.itemGap + 'px' : '默认',
                  onChange: function (v) { patchStyle({ itemGap: v }); },
                }),
                h(rmRangeField, {
                  label: '标题间距',
                  value: style.titleGap,
                  min: 0,
                  max: 40,
                  step: 2,
                  display: style.titleGap ? style.titleGap + 'px' : '默认',
                  onChange: function (v) { patchStyle({ titleGap: v }); },
                })
              )
            ),
          }),
          card({
            title: '颜色',
            hint: '纸张本身可以自配色，面板仍然跟随主题',
            children: h(
              'div',
              { className: 'rm-color-grid' },
              h(rmColorField, { label: '强调色', value: style.colors.accent, onChange: function (v) { patchColor('accent', v); } }),
              h(rmColorField, { label: '姓名', value: style.colors.nameColor, onChange: function (v) { patchColor('nameColor', v); } }),
              h(rmColorField, { label: '区块标题', value: style.colors.headingColor, onChange: function (v) { patchColor('headingColor', v); } }),
              h(rmColorField, { label: '正文', value: style.colors.bodyColor, onChange: function (v) { patchColor('bodyColor', v); } }),
              h(rmColorField, { label: '纸张底色', value: style.colors.background, onChange: function (v) { patchColor('background', v); } }),
              h(rmColorField, { label: '页眉色带', value: style.colors.bandColor, onChange: function (v) { patchColor('bandColor', v); } }),
              h(rmColorField, { label: '金色细线', value: style.colors.gold, onChange: function (v) { patchColor('gold', v); } })
            ),
          }),
          card({
            title: '字号与留白',
            hint: '名字大小、标题大小、行距、页边距',
            children: h(
              'div',
              { className: 'rm-range-grid' },
              h(rmRangeField, { label: '姓名字号', value: style.nameSize, min: 18, max: 56, display: style.nameSize + 'px', onChange: function (v) { patchStyle({ nameSize: v }); } }),
              h(rmRangeField, { label: '标题字号', value: style.headingSize, min: 9, max: 24, step: 0.5, display: style.headingSize + 'px', onChange: function (v) { patchStyle({ headingSize: v }); } }),
              h(rmRangeField, { label: '正文字号', value: style.bodySize, min: 10, max: 20, step: 0.5, display: style.bodySize + 'px', onChange: function (v) { patchStyle({ bodySize: v }); } }),
              h(rmRangeField, { label: '行距', value: style.lineHeight, min: 1.2, max: 2.4, step: 0.02, display: String(style.lineHeight), onChange: function (v) { patchStyle({ lineHeight: v }); } }),
              h(rmRangeField, { label: '左右页边距', value: style.padX, min: 24, max: 120, display: style.padX + 'px', onChange: function (v) { patchStyle({ padX: v }); } }),
              h(rmRangeField, { label: '上下页边距', value: style.padY, min: 20, max: 120, display: style.padY + 'px', onChange: function (v) { patchStyle({ padY: v }); } }),
              h(rmRangeField, { label: '区块间距', value: style.sectionGap, min: 8, max: 48, display: style.sectionGap + 'px', onChange: function (v) { patchStyle({ sectionGap: v }); } })
            ),
          }),
          card({
            title: '高级：自定义 CSS',
            hint: manual ? '已转手动模式，上方格式改动不再覆盖这段 CSS' : '留空会自动生成',
            children: h(
              'div',
              { className: 'rm-col' },
              h(Area, {
                label: '模板 CSS（根选择器保持 .' + rmStyleClass(cls) + '）',
                rows: 6,
                value: cssText,
                placeholder: '.' + rmStyleClass(cls) + ' { ... }',
                onChange: changeCss,
              }),
              h(
                'button',
                { type: 'button', className: 'rm-btn rm-btn-sm', style: { alignSelf: 'flex-start' }, onClick: rewriteCss },
                '按当前格式重写 CSS'
              )
            ),
          })
        ),
        h(TemplateEditorPreview, { resume: previewResume, template: previewTemplate, label: rmStyleClass(cls) })
      ),
      h(
        'div',
        { className: 'rm-modal-f' },
        props.error || localError
          ? h('span', { className: 'rm-text-danger', style: { marginRight: 'auto', fontSize: '11.5px' } }, props.error || localError)
          : null,
        h('button', { type: 'button', className: 'rm-btn', onClick: props.onClose }, '取消'),
        h(
          'button',
          { type: 'button', className: 'rm-btn', disabled: !!props.busy, onClick: function () { submit(false); } },
          props.busy ? '保存中…' : '保存'
        ),
        h(
          'button',
          { type: 'button', className: 'rm-btn rm-btn-primary', disabled: !!props.busy, onClick: function () { submit(true); } },
          '保存并发布'
        )
      )
    )
  );
}

/* ---------------- 从文件 / 图片生成模板初稿 ---------------- */

/** 「从文件生成」接受的格式：图片在本机取色，Word / PDF 交给 Host 解析。 */
var RM_IMPORT_ACCEPT = 'image/*,.doc,.docx,.pdf';
var RM_IMPORT_MAX = 8 * 1024 * 1024;
var RM_IMPORT_ROLE_LABELS = {
  name: '姓名',
  subtitle: '职位',
  contact: '联系方式',
  heading: '模块标题',
  bullet: '列表项',
  body: '正文',
};

function rmImportKindOfFile(file) {
  var name = String((file && file.name) || '').toLowerCase();
  var type = String((file && file.type) || '').toLowerCase();
  if (/^image\//.test(type) || /\.(png|jpe?g|webp|gif|bmp)$/.test(name)) return 'image';
  if (/\.(docx|doc|pdf)$/.test(name)) return 'document';
  if (/pdf|msword|officedocument/.test(type)) return 'document';
  return 'unsupported';
}

function rmReadFileBase64(file, onDone, onFail) {
  // Host 里面板可能跑在没有全局 FileReader 的沙箱里，优先回落到 window.FileReader。
  var ReaderCtor =
    typeof FileReader === 'function'
      ? FileReader
      : typeof window !== 'undefined' && window && typeof window.FileReader === 'function'
        ? window.FileReader
        : null;
  if (!ReaderCtor) {
    onFail(new Error('当前环境不支持读取本地文件'));
    return;
  }
  var reader = new ReaderCtor();
  reader.onload = function () {
    var text = String(reader.result || '');
    var comma = text.indexOf(',');
    onDone(comma >= 0 ? text.slice(comma + 1) : '');
  };
  reader.onerror = function () {
    onFail(new Error('读取文件失败，请重试'));
  };
  reader.readAsDataURL(file);
}

function rmImportKindLabel(kind) {
  if (kind === 'docx') return 'Word 文档';
  if (kind === 'doc') return 'Word HTML 文档';
  if (kind === 'pdf') return 'PDF 文档';
  if (kind === 'image') return '图片';
  return '文件';
}

/** style → 弹窗展示用的版式摘要（字段与图片分析结果保持一致，便于共用渲染）。 */
function rmLayoutFromStyle(style) {
  var st = rmNormalizeStyle(style);
  return {
    layout: st.layout,
    headerStyle: st.headerStyle,
    headerBand: st.headerStyle === 'band' ? true : !!st.headerBand,
    contentStyle: st.contentStyle,
    headerAlign: st.headerAlign,
    contactCols: st.contactCols,
    headingStyle: st.headingStyle,
    fontFamily: st.fontFamily,
    sidebarSections: st.sidebarSections,
  };
}

/** Host `/template/import` 的返回值 → 弹窗与编辑器共用的 analysis 结构。 */
function rmImportAnalysisFromValue(value, fileName) {
  var model = (value && value.model) || {};
  var draft = (value && value.draft) || {};
  var style = rmNormalizeStyle(draft.style);
  return {
    document: true,
    sourceKind: model.kind || 'doc',
    sourceName: model.sourceName || fileName || '',
    fileName: fileName || '',
    style: style,
    palette: style.colors,
    layout: rmLayoutFromStyle(style),
    blocks: Array.isArray(model.blocks) ? model.blocks : [],
    model: model,
    page: model.page || null,
    size: model.page || null,
    sample: draft.sample || null,
    name: draft.name || '',
    tagline: draft.tagline || '',
    note: model.note || '',
  };
}

/** 把 AI 优化返回的 style / demoText 合并进程序初稿（不修改传入对象）。 */
/** 把示例简历压成纯文本，给 /template/refine 当判断依据（生成初稿之后也能用）。 */
function rmTemplateSampleText(resume) {
  var data = (resume && resume.data) || {};
  var basics = data.basics || {};
  var out = [];
  function push(value) {
    var text = String(value == null ? '' : value).trim();
    if (text) out.push(text);
  }
  push(basics.name);
  push(basics.role);
  ['phone', 'email', 'city', 'wechat', 'github', 'website'].forEach(function (key) { push(basics[key]); });
  push(data.summary);
  var groups = [data.experience, data.projects, data.education, data.skills, data.awards];
  groups.forEach(function (group) {
    if (!Array.isArray(group)) return;
    group.forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      push(item.company || item.name || item.school || item.group || item.title);
      push(item.role || item.degree || item.major || item.items || item.desc);
      push(item.period || item.date);
      if (Array.isArray(item.bullets)) item.bullets.forEach(push);
    });
  });
  return out.slice(0, 160).join('\n').slice(0, 6000);
}

/** 比较两份 style，给出「改了哪些维度」的短标签，用于 AI 优化后告诉用户差在哪。 */
function rmStyleDiffChips(before, after) {
  var a = before || {};
  var b = after || {};
  var chips = [];
  function pair(label, left, right) {
    if (left === undefined || right === undefined || left === right) return;
    chips.push(label + '：' + String(left) + ' → ' + String(right));
  }
  pair('布局', a.layout, b.layout);
  pair('页眉', a.headerStyle, b.headerStyle);
  pair('标题', a.headingStyle, b.headingStyle);
  pair('内容块', a.contentStyle, b.contentStyle);
  pair('联系列数', a.contactCols, b.contactCols);
  pair('字体', a.fontFamily, b.fontFamily);
  pair('姓名字号', a.nameSize, b.nameSize);
  pair('标题字号', a.headingSize, b.headingSize);
  pair('正文字号', b.bodySize === undefined ? undefined : a.bodySize, b.bodySize);
  pair('区块间距', a.sectionGap, b.sectionGap);
  var ca = a.colors || {};
  var cb = b.colors || {};
  pair('强调色', ca.accent, cb.accent);
  pair('标题色', ca.headingColor, cb.headingColor);
  pair('正文色', ca.bodyColor, cb.bodyColor);
  if (Array.isArray(a.sidebarSections) || Array.isArray(b.sidebarSections)) {
    pair('侧栏模块', (a.sidebarSections || []).join('/'), (b.sidebarSections || []).join('/'));
  }
  return chips.slice(0, 6);
}


function rmApplyRefined(base, refined) {
  if (!base || !refined) return base;
  var style = rmStyleMerge(rmStyleFromAnalysis(base), refined.style);
  var out = Object.assign({}, base, {
    style: style,
    palette: style.colors,
    layout: rmLayoutFromStyle(style),
    aiNotes: refined.notes || '',
  });
  var demo = refined.demoText && typeof refined.demoText === 'object' ? refined.demoText : null;
  if (demo && out.sample) {
    var basics = Object.assign({}, out.sample.basics || {});
    if (demo.name && !String(basics.name || '').trim()) basics.name = String(demo.name);
    if (demo.role && !String(basics.role || '').trim()) basics.role = String(demo.role);
    out.sample = Object.assign({}, out.sample, { basics: basics });
  }
  return out;
}

/**
 * 给 `/template/refine` 挑文本块：页眉区与各模块标题行优先保留，其余按原文顺序补足。
 * AI 判断版式（单栏/左侧栏、页眉色带、模块标题位置）主要靠这两类块。
 */
function rmPickRefineBlocks(all, limit) {
  var max = limit || 120;
  var source = Array.isArray(all) ? all : [];
  var chosen = {};
  var picked = 0;
  function want(index) {
    if (picked >= max || chosen[index]) return;
    var block = source[index];
    if (!block) return;
    chosen[index] = {
      text: String(block.text || '').slice(0, 160),
      role: block.role || 'body',
      size: block.size,
      bold: !!block.bold,
      color: block.color,
      left: block.left,
      top: block.top,
      width: block.width,
    };
    picked += 1;
  }
  // 1) 页眉区：前 24 块（姓名 / 职位 / 联系方式 / 色带文字都在这里）
  for (var i = 0; i < source.length && i < 24; i += 1) want(i);
  // 2) 所有模块标题行
  for (var h = 0; h < source.length; h += 1) {
    if (source[h] && source[h].role === 'heading') want(h);
  }
  // 3) 其余按原文顺序补足，保证阅读顺序尽量完整
  for (var k = 0; k < source.length; k += 1) want(k);
  return Object.keys(chosen)
    .map(Number)
    .sort(function (a, b) {
      return a - b;
    })
    .map(function (index) {
      return chosen[index];
    });
}

/** 正文文本截到 6000 字时，把模块标题补进尾部，避免 AI 看不到章节结构。 */
function rmRefineText(model, all) {
  var text = String((model && model.text) || '');
  if (text.length <= 6000) return text;
  var source = Array.isArray(all) ? all : [];
  var heads = [];
  for (var i = 0; i < source.length && heads.length < 24; i += 1) {
    var block = source[i];
    if (!block || block.role !== 'heading') continue;
    var line = String(block.text || '')
      .replace(/\s+/g, ' ')
      .slice(0, 60);
    if (line && heads.indexOf(line) < 0) heads.push(line);
  }
  if (!heads.length) return text.slice(0, 6000);
  var tail = '\n【模块标题】' + heads.join(' / ');
  if (tail.length >= 1200) return text.slice(0, 4800) + tail.slice(0, 1200);
  return text.slice(0, 6000 - tail.length) + tail;
}

/** 组装 `/template/refine` 需要的 source（模型主要靠 text 判断模块与侧栏）。 */
function rmSourceForRefine(analysis) {
  var model = (analysis && analysis.model) || {};
  var blocks = rmPickRefineBlocks(model.blocks, 120);
  var fonts = Array.isArray(model.fonts) ? model.fonts : [];
  return {
    kind: (analysis && analysis.sourceKind) || model.kind || 'image',
    sourceName: (analysis && analysis.sourceName) || model.sourceName || '',
    page: model.page || null,
    blocks: blocks,
    colors: (analysis && analysis.palette) || {},
    fonts: fonts[0] || ((analysis && analysis.style && analysis.style.fontFamily) || 'sans'),
    text: rmRefineText(model, model.blocks),
  };
}

/* ---------------- 从文件生成模板初稿 ---------------- */

function TemplateImportDialog(props) {
  var analysisState = useState(null);
  var analysis = analysisState[0];
  var setAnalysis = analysisState[1];
  var remoteState = useState(null);
  var remote = remoteState[0];
  var setRemote = remoteState[1];
  var refinedState = useState(null);
  var refined = refinedState[0];
  var setRefined = refinedState[1];
  var errState = useState('');
  var error = errState[0];
  var setError = errState[1];
  var busyState = useState(false);
  var busy = busyState[0];
  var setBusy = busyState[1];
  var fileState = useState('');
  var fileName = fileState[0];
  var setFileName = fileState[1];
  var aiBusyState = useState(false);
  var aiBusy = aiBusyState[0];
  var setAiBusy = aiBusyState[1];
  var aiErrorState = useState('');
  var aiError = aiErrorState[0];
  var setAiError = aiErrorState[1];

  function resetResult() {
    setAnalysis(null);
    setRemote(null);
    setRefined(null);
    setAiError('');
  }

  function pickFile(event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    var kind = rmImportKindOfFile(file);
    setFileName(file.name || '已选择文件');
    setError('');
    setAiError('');
    if (kind === 'unsupported') {
      setError('只支持 .doc / .docx / .pdf 或图片文件');
      return;
    }
    resetResult();
    setBusy(true);
    if (kind === 'image') {
      rmAnalyzeImageFile(
        file,
        function (result) {
          setBusy(false);
          setAnalysis(result);
        },
        function (err) {
          setBusy(false);
          setError((err && err.message) || '图片分析失败');
        }
      );
      return;
    }
    if (file.size > RM_IMPORT_MAX) {
      setBusy(false);
      setError('文件大于 8MB，请压缩后再试');
      return;
    }
    rmReadFileBase64(
      file,
      function (data) {
        if (!data) {
          setBusy(false);
          setError('读取文件失败，请重试');
          return;
        }
        rmApi('/template/import', { method: 'POST', body: { name: file.name, data: data } })
          .then(function (value) {
            setBusy(false);
            setRemote(rmImportAnalysisFromValue(value, file.name));
          })
          .catch(function (err) {
            setBusy(false);
            setError(rmErrText(err) || '文件解析失败');
          });
      },
      function (err) {
        setBusy(false);
        setError((err && err.message) || '读取文件失败');
      }
    );
  }

  /** 程序初稿 → AI 优化（local Host 接口，失败时保留程序初稿）。 */
  function refine() {
    if (!shown || aiBusy) return;
    setAiBusy(true);
    setAiError('');
    rmApi('/template/refine', {
      method: 'POST',
      body: { source: rmSourceForRefine(shown), draft: { style: rmStyleFromAnalysis(shown) } },
    })
      .then(function (value) {
        setAiBusy(false);
        setRefined({
          style: (value && value.style) || null,
          notes: (value && value.notes) || '',
          demoText: (value && value.demoText) || null,
        });
      })
      .catch(function (err) {
        setAiBusy(false);
        setAiError(rmErrText(err) || 'AI 优化失败，可以继续使用程序初稿');
      });
  }

  var baseAnalysis = remote || analysis;
  var shown = rmApplyRefined(baseAnalysis, refined);

  var paletteLabels = [
    ['accent', '强调色'],
    ['nameColor', '姓名'],
    ['headingColor', '标题'],
    ['bodyColor', '正文'],
    ['background', '底色'],
    ['bandColor', '色带'],
    ['gold', '金色'],
  ];
  var palette = shown ? shown.palette || {} : {};
  var sideNames = shown
    ? rmSidebarSectionsLabel(shown.layout.sidebarSections)
    : [];
  var layoutText = shown
    ? '版式初判：' +
      (shown.layout.layout === 'sidebar'
        ? '左侧栏布局' + (sideNames.length ? '（左栏放' + sideNames.join('、') + '）' : '')
        : '单栏布局') +
      ' · ' +
      (shown.layout.headerStyle === 'band'
        ? '整宽页眉色带'
        : shown.layout.headerStyle === 'split'
          ? '页眉左右分栏'
          : shown.layout.headerStyle === 'ribbon'
            ? '左上角斜标签'
            : shown.layout.headerBand ? '有页眉色带' : '无页眉色带') +
      (shown.layout.contentStyle === 'card' ? ' · 内容块带边框' : '') +
      ' · ' +
      (shown.layout.headerAlign === 'center' ? '页眉居中' : '页眉左对齐') +
      ' · 联系信息 ' +
      shown.layout.contactCols +
      ' 列 · 标题样式 ' +
      rmHeadingStyleLabel(shown.layout.headingStyle) +
      (shown.layout.fontFamily === 'serif' ? ' · 衬线大标题' : '')
    : '';

  return h(
    'div',
    { className: 'rm-modal' },
    h(
      'div',
      { className: 'rm-modal-card rm-modal-wide' },
      h(
        'div',
        { className: 'rm-modal-h' },
        h('h3', null, '从文件生成模板初稿'),
        h('span', { className: 'rm-muted', style: { fontSize: '11px' } }, '文件只交给本机插件解析')
      ),
      h(
        'div',
        { className: 'rm-modal-b rm-col' },
        h(
          'span',
          { className: 'rm-hint' },
          '选择一个简历文件（Word / PDF），也可以直接拖入或粘贴一张喜欢的简历截图/排版参考图：Word、PDF 会解析出真实文本、字号和配色，图片则在本机取色。生成的是初稿，颜色和版式可以在编辑器里继续调整。'
        ),
        h(
          'div',
          { className: 'rm-row', style: { flexWrap: 'wrap', gap: '8px' } },
          h('span', { className: 'rm-field-k' }, '没有参考文件？'),
          h(
            'button',
            {
              type: 'button',
              className: 'rm-btn rm-btn-sm',
              onClick: function () {
                if (props.onGenerated) props.onGenerated(rmBannerPresetAnalysis());
              },
            },
            '直接套用「青金斜切」'
          )
        ),
        h('input', { className: 'rm-input', type: 'file', accept: RM_IMPORT_ACCEPT, onChange: pickFile }),
        fileName ? h('span', { className: 'rm-muted', style: { fontSize: '11px' } }, '已选择：' + fileName) : null,
        busy ? h('span', { className: 'rm-hint' }, '正在解析文件…') : null,
        error ? h('span', { className: 'rm-text-danger', style: { fontSize: '11.5px' } }, error) : null,
        shown
          ? h(
              'div',
              { className: 'rm-col' },
              h(
                'div',
                { className: 'rm-swatch-row' },
                paletteLabels.map(function (item) {
                  return h(
                    'div',
                    { className: 'rm-swatch', key: item[0] },
                    h('span', { className: 'rm-swatch-chip', style: { background: palette[item[0]] } }),
                    h('span', null, item[1]),
                    h('span', { className: 'rm-color-val' }, palette[item[0]])
                  );
                })
              ),
              h('span', { className: 'rm-hint' }, layoutText),
              refined && refined.style
                ? h(
                    'div',
                    { className: 'rm-row', style: { flexWrap: 'wrap', gap: '6px' } },
                    rmStyleDiffChips(rmStyleFromAnalysis(baseAnalysis), shown.style).map(function (text) {
                      return h('span', { key: text, className: 'rm-pill' }, text);
                    })
                  )
                : null,
              refined && refined.notes ? h('span', { className: 'rm-hint' }, 'AI 说明：' + refined.notes) : null,
              h(
                'div',
                { className: 'rm-import-preview' },
                h(TemplateEditorPreview, {
                  resume: rmSampleResume(shown.sample || DEMO_RESUME_DATA),
                  template: { cls: 'rm-t-import-preview', css: rmStyleToCss(shown.style, 'rm-t-import-preview') },
                  label: refined ? 'AI 优化后预览' : '程序初稿预览',
                })
              ),
              shown.note ? h('span', { className: 'rm-hint' }, shown.note) : null,
              shown.document
                ? h(
                    'span',
                    { className: 'rm-muted', style: { fontSize: '11px' } },
                    rmImportKindLabel(shown.sourceKind) +
                      '「' +
                      (shown.sourceName || shown.fileName) +
                      '」· ' +
                      shown.blocks.length +
                      ' 个文本块' +
                      (shown.model && shown.model.text ? ' · 全文 ' + shown.model.text.length + ' 字' : '')
                  )
                : shown.size && shown.size.width
                  ? h('span', { className: 'rm-muted', style: { fontSize: '11px' } }, '原图 ' + shown.size.width + ' × ' + shown.size.height)
                  : null,
              shown.model && Array.isArray(shown.model.fonts) && shown.model.fonts.length
                ? h('span', { className: 'rm-hint' }, '识别到字体：' + shown.model.fonts.slice(0, 4).join(' / '))
                : null,
              shown.document && shown.blocks && shown.blocks.length
                ? h(
                    'details',
                    { className: 'rm-col' },
                    h('summary', { className: 'rm-hint', style: { cursor: 'pointer' } }, '查看解析出的文本块'),
                    h(
                      'div',
                      { className: 'rm-col', style: { maxHeight: '170px', overflow: 'auto', gap: '2px' } },
                      shown.blocks.slice(0, 30).map(function (block, index) {
                        return h(
                          'span',
                          { key: 'block-' + index, className: 'rm-mono', style: { fontSize: '11px' } },
                          (RM_IMPORT_ROLE_LABELS[block.role] || '正文') + ' · ' + String(block.text || '').slice(0, 60)
                        );
                      })
                    )
                  )
                : null,
              shown.aiNotes ? h('span', { className: 'rm-hint' }, 'AI 说明：' + shown.aiNotes) : null,
              aiError ? h('span', { className: 'rm-text-danger', style: { fontSize: '11.5px' } }, aiError) : null,
              h('span', { className: 'rm-hint' }, '生成的是初稿，颜色和版式可以在编辑器里继续调整。')
            )
          : null
      ),
      h(
        'div',
        { className: 'rm-modal-f' },
        h('button', { type: 'button', className: 'rm-btn', onClick: props.onClose }, '取消'),
        h(
          'button',
          {
            type: 'button',
            className: 'rm-btn',
            disabled: !shown || busy || aiBusy,
            title: shown ? '让 AI 对照源文件再调整一次配色与版式' : '先选择文件或图片',
            onClick: function () {
              if (refined) {
                setRefined(null);
                setAiError('');
                return;
              }
              refine();
            },
          },
          aiBusy ? 'AI 正在比对…' : refined ? '恢复程序初稿' : 'AI 优化'
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'rm-btn rm-btn-primary',
            disabled: !shown || busy,
            onClick: function () {
              if (shown && props.onGenerated) props.onGenerated(shown);
            },
          },
          '生成模板初稿'
        )
      )
    )
  );
}

/* ---------------- 发布模板到市场 ---------------- */

function TemplatePublishDialog(props) {
  var template = props.template || {};
  var titleState = useState(template.name || '');
  var title = titleState[0];
  var setTitle = titleState[1];
  var taglineState = useState(template.tagline || '');
  var tagline = taglineState[0];
  var setTagline = taglineState[1];
  var tagsState = useState((Array.isArray(template.tags) ? template.tags : []).join(' '));
  var tags = tagsState[0];
  var setTags = tagsState[1];
  var descState = useState(template.desc || '');
  var desc = descState[0];
  var setDesc = descState[1];
  var includeState = useState(true);
  var includeSample = includeState[0];
  var setIncludeSample = includeState[1];
  var ghState = useState(false);
  var publishGh = ghState[0];
  var setPublishGh = ghState[1];
  var authorState = useState(String((props.author || template.author || '')));
  var author = authorState[0];
  var setAuthor = authorState[1];
  var localErrState = useState('');
  var localError = localErrState[0];
  var setLocalError = localErrState[1];

  function submit() {
    if (!props.onSubmit) return;
    if (publishGh && !String(author || '').trim()) {
      setLocalError('投稿到 GitHub 需要填一个用户名（会显示为贡献者，首次填完会记住）');
      return;
    }
    setLocalError('');
    props.onSubmit({
      templateId: template.id,
      title: String(title || '').trim(),
      tagline: String(tagline || '').trim(),
      tags: rmSplitTags(tags),
      desc: String(desc || '').trim(),
      includeSample: !!includeSample,
      publishGh: !!publishGh,
      author: String(author || '').trim(),
    });
  }

  return h(
    'div',
    { className: 'rm-modal' },
    h(
      'div',
      { className: 'rm-modal-card' },
      h('div', { className: 'rm-modal-h' }, h('h3', null, '发布模板到市场'), h('span', { className: 'rm-muted' }, template.name || '')),
      h(
        'div',
        { className: 'rm-modal-b rm-col' },
        h('span', { className: 'rm-hint' }, '发布后其他装了本插件的用户能在「模板市场」里安装这套模板；只分享排版和示例数据，不会带走你的整份简历。'),
        h(
          Fields2,
          null,
          h(Field, { label: '标题', value: title, placeholder: '给模板起个市场标题', onChange: setTitle }),
          h(Field, { label: '一句话卖点', value: tagline, placeholder: '投产品岗很稳，信息密度中等', onChange: setTagline }),
          h(Field, { label: '作者（GitHub 用户名）', value: author, placeholder: '第一次投稿时填一下，之后会记住', onChange: setAuthor }),
        ),
        h(Field, { label: '标签（空格分隔，最多 5 个）', value: tags, placeholder: '商务 蓝灰 单栏', onChange: setTags, wide: true }),
        h(Area, { label: '详细描述（可选）', rows: 3, value: desc, placeholder: '适合什么岗位、什么风格的简历', onChange: setDesc }),
        h(
          'label',
          { className: 'rm-check' },
          h('input', { type: 'checkbox', checked: includeSample, onChange: function (event) { setIncludeSample(event.target.checked); } }),
          '附上模板的示例数据（推荐，安装者能立即看到效果）'
        ),
        h(
          'label',
          { className: 'rm-check' },
          h('input', { type: 'checkbox', checked: publishGh, onChange: function (event) { setPublishGh(event.target.checked); } }),
          '同时生成 GitHub 公共投稿（发布后给你 Issue / 文件链接）'
        ),
        localError ? h('span', { className: 'rm-text-danger', style: { fontSize: '11.5px' } }, localError) : null,
        props.error ? h('span', { className: 'rm-text-danger', style: { fontSize: '11.5px' } }, props.error) : null
      ),
      h(
        'div',
        { className: 'rm-modal-f' },
        h('button', { type: 'button', className: 'rm-btn', onClick: props.onClose }, '取消'),
        h(
          'button',
          { type: 'button', className: 'rm-btn rm-btn-primary', disabled: !!props.busy, onClick: submit },
          props.busy ? '发布中…' : '发布'
        )
      )
    )
  );
}

/* ---------------- 模板大图预览 ---------------- */

function TemplatePreviewDialog(props) {
  var template = props.template || {};
  var measured = rmUseWidth(600);
  var hostRef = measured[0];
  var hostWidth = measured[1];
  var width = Math.max(220, Math.min(PAPER_W, Math.floor(hostWidth) - 8 || 520));
  var resume = props.resume || rmSampleResume(props.sample || DEMO_RESUME_DATA);
  return h(
    'div',
    { className: 'rm-modal' },
    h(
      'div',
      { className: 'rm-modal-card rm-tpl-preview-dialog' },
      h(
        'div',
        { className: 'rm-modal-h' },
        h('h3', null, template.name || '模板预览'),
        template.builtin ? h('span', { className: 'rm-pill rm-pill-brand' }, '内置') : h('span', { className: 'rm-pill' }, '自定义'),
        h('span', { className: 'rm-muted', style: { marginLeft: 'auto', fontSize: '11px' } }, template.tagline || template.en || '')
      ),
      h(
        'div',
        { className: 'rm-modal-b', style: { display: 'flex', justifyContent: 'center', overflow: 'auto', maxHeight: '76vh' } },
        h('div', { ref: hostRef, style: { width: '100%', display: 'flex', justifyContent: 'center' } },
          h(PreviewScaled, { resume: resume, template: template, width: width, frame: true }))
      ),
      h(
        'div',
        { className: 'rm-modal-f' },
        h('button', { type: 'button', className: 'rm-btn', onClick: props.onClose }, '关闭'),
        template.builtin && props.onCopy
          ? h('button', { type: 'button', className: 'rm-btn', onClick: function () { props.onCopy(template); } }, '复制为新模板')
          : null,
        !template.builtin && props.onEdit
          ? h('button', { type: 'button', className: 'rm-btn', onClick: function () { props.onEdit(template); } }, '编辑')
          : null,
        props.onUse
          ? h('button', { type: 'button', className: 'rm-btn rm-btn-primary', onClick: function () { props.onUse(template); } }, '使用这个模板')
          : null
      )
    )
  );
}
