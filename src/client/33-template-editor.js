/**
 * 简历市场 client — 33 模板库编辑器。
 *
 * 三件事：
 *   1) 模板「元素格式」：颜色 / 字号 / 行距 / 页边距 / 标题样式 / 字体 / 页眉 / 联系信息列数，
 *      任何一项改动都即时重算成一整段模板 CSS（根选择器 .rm-t-<cls>），右侧 A4 实时预览；
 *   2) 保存走 /template/save，发布走 /template/publish（本地市场）或 /github/publish-template（公共投稿）；
 *   3) 从图片生成模板初稿：FileReader + canvas 本地取色/版式推断，不调用任何视觉模型。
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
};

var RM_HEADING_STYLES = [
  ['rule', '细线'],
  ['bar', '色块'],
  ['banner', '斜切色带'],
  ['underline', '下划线'],
  ['plain', '无装饰'],
];

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
  };
}

/** 六套内置模板对应的元素格式预设：复制内置模板时从这套值开始微调。 */
var RM_STYLE_PRESETS = {
  'business-minimal': {
    colors: { accent: '#1f2328', nameColor: '#111827', headingColor: '#111827', bodyColor: '#333941', background: '#ffffff', bandColor: '#f3f4f6', gold: '#b8912c' },
    nameSize: 34, headingSize: 12, bodySize: 13.5, lineHeight: 1.62, padX: 60, padY: 54, sectionGap: 18,
    headingStyle: 'rule', fontFamily: 'sans', headerAlign: 'left', headerBand: false, contactCols: 2,
  },
  'quiet-luxury': {
    colors: { accent: '#5f7896', nameColor: '#1f2b3d', headingColor: '#3d4c61', bodyColor: '#2a3442', background: '#ffffff', bandColor: '#f1f4f8', gold: '#b8912c' },
    nameSize: 34, headingSize: 12, bodySize: 13.2, lineHeight: 1.68, padX: 62, padY: 56, sectionGap: 20,
    headingStyle: 'underline', fontFamily: 'serif', headerAlign: 'left', headerBand: false, contactCols: 2,
  },
  'fresh-creative': {
    colors: { accent: '#7ccab6', nameColor: '#135c4f', headingColor: '#175e52', bodyColor: '#22343a', background: '#ffffff', bandColor: '#e6f6f2', gold: '#c9a227' },
    nameSize: 36, headingSize: 12.5, bodySize: 13.5, lineHeight: 1.64, padX: 48, padY: 38, sectionGap: 18,
    headingStyle: 'bar', fontFamily: 'sans', headerAlign: 'left', headerBand: true, contactCols: 3,
  },
  'compact-one': {
    colors: { accent: '#3f4753', nameColor: '#1d2129', headingColor: '#2c3138', bodyColor: '#2c3138', background: '#ffffff', bandColor: '#f1f2f4', gold: '#b8912c' },
    nameSize: 27, headingSize: 11.5, bodySize: 12.2, lineHeight: 1.55, padX: 44, padY: 38, sectionGap: 14,
    headingStyle: 'underline', fontFamily: 'sans', headerAlign: 'left', headerBand: false, contactCols: 2,
  },
  'timeline-pro': {
    colors: { accent: '#2f6fde', nameColor: '#1f3352', headingColor: '#1f3352', bodyColor: '#1f2937', background: '#ffffff', bandColor: '#eaf1fc', gold: '#c9a227' },
    nameSize: 32, headingSize: 12.5, bodySize: 13.5, lineHeight: 1.62, padX: 56, padY: 50, sectionGap: 18,
    headingStyle: 'rule', fontFamily: 'sans', headerAlign: 'left', headerBand: false, contactCols: 2,
  },
  'tech-grid': {
    colors: { accent: '#2c5f96', nameColor: '#10213a', headingColor: '#133a63', bodyColor: '#16202e', background: '#ffffff', bandColor: '#eef2f7', gold: '#c9a227' },
    nameSize: 31, headingSize: 12.5, bodySize: 13.2, lineHeight: 1.6, padX: 54, padY: 48, sectionGap: 18,
    headingStyle: 'underline', fontFamily: 'mono', headerAlign: 'left', headerBand: false, contactCols: 2,
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
  if (typeof base.headerBand === 'boolean') out.headerBand = base.headerBand;
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
  if (typeof patch.headerBand === 'boolean') out.headerBand = patch.headerBand;
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
  } else {
    rule(root + ' .rm-sec-h', 'border-bottom:1px solid transparent;padding-bottom:2px;');
  }

  if (st.headerAlign === 'center') {
    rule(root + ' .rm-head', 'text-align:center;');
    rule(root + ' .rm-contact', 'max-width:640px;margin-left:auto;margin-right:auto;');
  }

  if (st.headerBand) {
    rule(
      root + ' .rm-head',
      'margin:' + -st.padY + 'px ' + -st.padX + 'px ' + Math.max(10, Math.round(st.sectionGap * 0.7)) + 'px;padding:' + st.padY + 'px ' + st.padX + 'px 18px;background:' + c.bandColor + ';border-bottom:1px solid ' + rmRgba(c.accent, 0.24) + ';'
    );
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
    layout: { headerBand: false, headerAlign: 'left', headingStyle: 'rule', contactCols: 2, headingBands: 0, fontFamily: 'sans' },
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
 * 图片 → { palette, layout, size, note }。
 * 统计口径：饱和且不算太暗的像素里最常见的颜色当强调色；最暗的一撮当姓名色；
 * 整图最常见的颜色当纸张底色；顶部 26% 区域里强调色占比高 → 有页眉色带；
 * 顶部文字的水平重心在中间 → 页眉居中。
 * 还能认出「斜切色带分块标题」：正文区里成排的高墨量横条 ≥3 条 → banner。
 */
function rmAnalyzeImageElement(img) {
  var nw = img.naturalWidth || img.width || 0;
  var nh = img.naturalHeight || img.height || 0;
  if (!nw || !nh) return rmAnalysisFallback('读不到图片尺寸，已用默认初稿');
  var maxSide = 160;
  var scale = Math.min(1, maxSide / Math.max(nw, nh));
  var w = Math.max(1, Math.round(nw * scale));
  var h = Math.max(1, Math.round(nh * scale));
  var canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return rmAnalysisFallback('当前环境不支持 canvas，已用默认初稿');
  ctx.drawImage(img, 0, 0, w, h);
  var data;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch (err) {
    return rmAnalysisFallback('读不到图片像素，已用默认初稿');
  }

  var total = w * h;
  var accentBuckets = {};
  var bgBuckets = {};
  var warmBuckets = {};
  var darkBuckets = {};
  var darkSum = { r: 0, g: 0, b: 0, n: 0 };
  var rowInk = [];
  var rowColorful = [];
  var rowDark = [];
  var bandRows = Math.max(2, Math.round(h * 0.26));
  var i;
  var x;
  var y;
  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      i = (y * w + x) * 4;
      var a = data[i + 3];
      if (a < 24) continue;
      var r = data[i];
      var g = data[i + 1];
      var b = data[i + 2];
      var max = Math.max(r, g, b);
      var min = Math.min(r, g, b);
      var sat = max - min;
      var lum = 0.299 * r + 0.587 * g + 0.114 * b;
      var key = (r >> 4) + '-' + (g >> 4) + '-' + (b >> 4);
      // 每行的墨量 / 彩色量 / 深色量：后面用来找斜切色带和判断大标题字号。
      if (rowInk[y] == null) rowInk[y] = 0;
      if (rowColorful[y] == null) rowColorful[y] = 0;
      if (rowDark[y] == null) rowDark[y] = 0;
      if (lum < 150 || sat > 40) rowInk[y]++;
      if (sat > 42 && max < 235 && lum > 34) rowColorful[y]++;
      if (lum < 120) {
        rowDark[y]++;
        var darkBucket = darkBuckets[key];
        if (!darkBucket) {
          darkBucket = { n: 0, r: 0, g: 0, b: 0 };
          darkBuckets[key] = darkBucket;
        }
        darkBucket.n++;
        darkBucket.r += r;
        darkBucket.g += g;
        darkBucket.b += b;
      }
      // 暖色（金色系）单独统计：hue 30~65°、有饱和度、不算过暗。
      if (sat > 30 && lum > 40 && lum < 244 && rmHueOf(r, g, b) >= 30 && rmHueOf(r, g, b) <= 65) {
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
      if (lum < 92) {
        darkSum.r += r;
        darkSum.g += g;
        darkSum.b += b;
        darkSum.n++;
      }
    }
  }

  var bgAvg = rmTopBucketColor(bgBuckets);
  var accentAvg = rmTopBucketColor(accentBuckets);
  // 纸张底色：优先取「面积够大且亮度最高」的色桶，防止整页被文字/色带拉暗。
  var bigBg = rmLightestBigBucketColor(bgBuckets, Math.max(4, Math.round(total * 0.04)));
  var background = bigBg ? rmRgbToHex(bigBg) : bgAvg ? rmRgbToHex(bgAvg) : '#ffffff';
  var darkPaper = rmLuminance(background) < 0.45;

  var accent = accentAvg ? rmRgbToHex(accentAvg) : darkPaper ? '#7ccab6' : '#2f6fde';
  if (rmLuminance(accent) > 0.72) accent = rmMixHex(accent, '#1f2937', 0.45);
  if (rmLuminance(accent) < 0.14) accent = rmMixHex(accent, '#ffffff', 0.32);

  // 姓名色 = 最暗且面积够大的那种颜色（参考图里标题/分块标题经常同色）。
  var nameColor;
  var darkestBucket = null;
  var darkestLum = 2;
  Object.keys(darkBuckets).forEach(function (key) {
    var bucket = darkBuckets[key];
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

  // 金色细线：暖色桶里的主色；没有就退回标准金；太亮/太暗各做一次矫正。
  var warmAvg = rmTopBucketColor(warmBuckets);
  var gold = warmAvg ? rmRgbToHex(warmAvg) : darkPaper ? '#d8c07a' : '#c9a227';
  if (rmLuminance(gold) > 0.8) gold = rmMixHex(gold, '#8a6d14', 0.45);
  if (rmLuminance(gold) < 0.18) gold = rmMixHex(gold, '#ffffff', 0.32);

  // 参考图里姓名与分块标题同色，headingColor 直接跟 nameColor 走。
  var headingColor = nameColor;
  if (rmLuminance(headingColor) < 0.1 && !darkPaper) headingColor = rmMixHex(accent, nameColor, 0.55);

  var bodyColor = darkPaper ? '#e6ebf2' : '#1f2937';
  var bandColor = darkPaper ? rmMixHex(background, accent, 0.3) : rmMixHex(background, accent, 0.12);

  // 第二遍：顶部区域统计强调色占比 + 文字水平重心（判断页眉色带 / 居中对齐）。
  var accentRgb = rmHexToRgb(accent);
  var bandTotal = bandRows * w;
  var bandAccent = 0;
  var bandInk = 0;
  var bandInkX = 0;
  for (y = 0; y < bandRows; y++) {
    for (x = 0; x < w; x++) {
      i = (y * w + x) * 4;
      if (data[i + 3] < 24) continue;
      var rr = data[i];
      var gg = data[i + 1];
      var bb = data[i + 2];
      var dist = Math.abs(rr - accentRgb.r) + Math.abs(gg - accentRgb.g) + Math.abs(bb - accentRgb.b);
      var lum2 = 0.299 * rr + 0.587 * gg + 0.114 * bb;
      if (dist < 96) {
        bandAccent++;
      } else if (lum2 < 235) {
        bandInk++;
        bandInkX += x;
      }
    }
  }
  var headerBand = bandTotal > 0 && bandAccent / bandTotal > 0.18;
  // 顶部 18% 里彩色像素铺满 → 也算页眉色带（浅色渐变底不一定会被 accent 命中）。
  var topRows = Math.max(2, Math.round(h * 0.18));
  var topColorful = 0;
  for (y = 0; y < topRows; y++) topColorful += rowColorful[y] || 0;
  if (topRows * w > 0 && topColorful / (topRows * w) > 0.6) headerBand = true;
  var headerAlign = 'left';
  if (bandInk > bandTotal * 0.012) {
    var center = bandInkX / bandInk / w;
    if (center > 0.44 && center < 0.56) headerAlign = 'center';
  }

  // 分块标题条带：正文区里成排的「彩色横条」= 斜切色带。
  // 一条带 = 连续 ≥2 行彩色占比 >32%，且换算回原图高度 ≥12px（过滤细下划线／文字行）。
  var bandRunMin = 2;
  var bandRunMax = Math.max(6, Math.round(h * 0.2));
  var headingBands = 0;
  var run = 0;
  var scanFrom = Math.round(h * 0.15);
  for (y = scanFrom; y <= h; y++) {
    var isBandRow = y < h && (rowColorful[y] || 0) / w > 0.32;
    if (isBandRow) {
      run++;
      continue;
    }
    if (run >= bandRunMin && run <= bandRunMax && run / Math.max(0.001, scale) >= 12) headingBands++;
    run = 0;
  }
  var headingStyle = headingBands >= 3 ? 'banner' : headingBands >= 1 ? 'bar' : 'rule';

  // 大标题字号：顶部 30% 的深色「文字行」最长连续段，换算回原图像素判断是否衬线大标题。
  var titleRows = Math.max(3, Math.round(h * 0.3));
  var runStart = -1;
  var bestRun = 0;
  for (y = 0; y < titleRows; y++) {
    var ink = rowDark[y] || 0;
    var isTextRow = ink >= Math.max(1, w * 0.02) && ink / w < 0.6;
    if (isTextRow) {
      if (runStart < 0) runStart = y;
      if (y - runStart + 1 > bestRun) bestRun = y - runStart + 1;
    } else {
      runStart = -1;
    }
  }
  var fontFamily = bestRun / Math.max(0.001, scale) >= 18 ? 'serif' : 'sans';

  return {
    palette: { accent: accent, nameColor: nameColor, headingColor: headingColor, bodyColor: bodyColor, background: background, bandColor: bandColor, gold: gold },
    layout: {
      headerBand: headerBand,
      headerAlign: headerAlign,
      headingStyle: headingStyle,
      contactCols: 2,
      headingBands: headingBands,
      fontFamily: fontFamily,
    },
    size: { width: nw, height: nh },
    note: '',
    fallback: false,
  };
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
  if (layout.headingStyle) st.headingStyle = layout.headingStyle;
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
          { type: 'button', className: 'rm-btn rm-btn-sm', style: { marginLeft: 'auto' }, onClick: props.onClose },
          '关闭'
        )
      ),
      h(
        'div',
        { className: 'rm-modal-b rm-tpl-editor-body' },
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
            hint: '标题装饰 / 页眉 / 字体 / 联系信息列数',
            children: h(
              'div',
              { className: 'rm-col' },
              h(
                'button',
                { type: 'button', className: 'rm-btn rm-btn-sm', style: { alignSelf: 'flex-start' }, onClick: applyBannerPreset },
                '一键套用「青金斜切」'
              ),
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
              h(
                'label',
                { className: 'rm-check' },
                h('input', {
                  type: 'checkbox',
                  checked: !!style.headerBand,
                  onChange: function (event) { patchStyle({ headerBand: event.target.checked }); },
                }),
                '页眉加一条底色色带'
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

/* ---------------- 从图片生成模板初稿 ---------------- */

function TemplateImportDialog(props) {
  var analysisState = useState(null);
  var analysis = analysisState[0];
  var setAnalysis = analysisState[1];
  var errState = useState('');
  var error = errState[0];
  var setError = errState[1];
  var busyState = useState(false);
  var busy = busyState[0];
  var setBusy = busyState[1];
  var fileState = useState('');
  var fileName = fileState[0];
  var setFileName = fileState[1];

  function pickFile(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    setFileName(file.name || '已选择图片');
    setError('');
    setBusy(true);
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
    event.target.value = '';
  }

  var paletteLabels = [
    ['accent', '强调色'],
    ['nameColor', '姓名'],
    ['headingColor', '标题'],
    ['bodyColor', '正文'],
    ['background', '底色'],
    ['bandColor', '色带'],
    ['gold', '金色'],
  ];
  var layoutText = analysis
    ? '版式初判：' +
      (analysis.layout.headerBand ? '有页眉色带' : '无页眉色带') +
      ' · ' +
      (analysis.layout.headerAlign === 'center' ? '页眉居中' : '页眉左对齐') +
      ' · 单栏 · 联系信息 ' +
      analysis.layout.contactCols +
      ' 列 · 标题样式 ' +
      rmHeadingStyleLabel(analysis.layout.headingStyle) +
      (analysis.layout.fontFamily === 'serif' ? ' · 衬线大标题' : '')
    : '';

  return h(
    'div',
    { className: 'rm-modal' },
    h(
      'div',
      { className: 'rm-modal-card rm-modal-wide' },
      h('div', { className: 'rm-modal-h' }, h('h3', null, '从图片生成模板初稿'), h('span', { className: 'rm-muted', style: { fontSize: '11px' } }, '本地取色，不上传图片')),
      h(
        'div',
        { className: 'rm-modal-b rm-col' },
        h(
          'span',
          { className: 'rm-hint' },
          '上传一张喜欢的简历截图或排版参考图：本机会读取主色、姓名色、底色，并判断有没有页眉色带。生成的是初稿，颜色和版式可以在编辑器里继续调整。'
        ),
        h(
          'div',
          { className: 'rm-row', style: { flexWrap: 'wrap', gap: '8px' } },
          h('span', { className: 'rm-field-k' }, '没有参考图？'),
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
        h('input', { className: 'rm-input', type: 'file', accept: 'image/*', onChange: pickFile }),
        fileName ? h('span', { className: 'rm-muted', style: { fontSize: '11px' } }, '已选择：' + fileName) : null,
        busy ? h('span', { className: 'rm-hint' }, '正在本地分析图片…') : null,
        error ? h('span', { className: 'rm-text-danger', style: { fontSize: '11.5px' } }, error) : null,
        analysis
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
                    h('span', { className: 'rm-swatch-chip', style: { background: analysis.palette[item[0]] } }),
                    h('span', null, item[1]),
                    h('span', { className: 'rm-color-val' }, analysis.palette[item[0]])
                  );
                })
              ),
              h('span', { className: 'rm-hint' }, layoutText),
              analysis.note ? h('span', { className: 'rm-hint' }, analysis.note) : null,
              analysis.size && analysis.size.width
                ? h('span', { className: 'rm-muted', style: { fontSize: '11px' } }, '原图 ' + analysis.size.width + ' × ' + analysis.size.height)
                : null
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
            className: 'rm-btn rm-btn-primary',
            disabled: !analysis || busy,
            onClick: function () {
              if (analysis && props.onGenerated) props.onGenerated(analysis);
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

  function submit() {
    if (!props.onSubmit) return;
    props.onSubmit({
      templateId: template.id,
      title: String(title || '').trim(),
      tagline: String(tagline || '').trim(),
      tags: rmSplitTags(tags),
      desc: String(desc || '').trim(),
      includeSample: !!includeSample,
      publishGh: !!publishGh,
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
          h(Field, { label: '一句话卖点', value: tagline, placeholder: '投产品岗很稳，信息密度中等', onChange: setTagline })
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
