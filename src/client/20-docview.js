/**
 * 简历市场 client — 20 文档预览。
 * 复用 src/shared/doc.js 的 renderBody/BASE_CSS，按容器宽度等比缩放整张 A4 纸。
 * 预览面板支持多页（按 A4 页高等分 + 虚线分页线）与 40%–200% 缩放；
 * 模板 / 市场卡片缩略图继续单页裁切（multiPage 默认 false）。
 */

var useLayoutEffect = React.useLayoutEffect;

/** 预览面板缩放下限 / 上限。 */
var RM_ZOOM_MIN = 0.4;
var RM_ZOOM_MAX = 2;

/** 在「内置 + 已安装市场模板」列表里按 id 找模板，找不到回退内置第一套。 */
function rmResolveTemplate(id, list) {
  if (Array.isArray(list)) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
  }
  return templateById(id);
}

/** 监听元素宽度，返回 [ref, width]。 */
function rmUseWidth(initial) {
  var pair = useState(initial || 320);
  var width = pair[0];
  var setWidth = pair[1];
  var ref = useRef(null);
  useEffect(function () {
    var el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      if (el && el.getBoundingClientRect) setWidth(Math.floor(el.getBoundingClientRect().width) || initial || 320);
      return undefined;
    }
    var ro = new ResizeObserver(function (entries) {
      var w = entries && entries[0] ? entries[0].contentRect.width : 0;
      if (w > 0) setWidth(Math.floor(w));
    });
    ro.observe(el);
    return function () {
      ro.disconnect();
    };
  }, []);
  return [ref, width];
}

/** 数字夹在 [min, max]。 */
function rmClamp(value, min, max) {
  var n = Number(value);
  if (!isFinite(n)) n = min;
  return Math.max(min, Math.min(max, n));
}

/** 量纸张的「自然内容高度」：临时去掉 min-height，避免页数 → 高度 → 页数的自反馈。 */
function rmPaperContentHeight(el) {
  if (!el) return 0;
  var prev = el.style.minHeight;
  el.style.minHeight = '0px';
  var height = Math.max(el.offsetHeight || 0, el.scrollHeight || 0);
  el.style.minHeight = prev;
  return height;
}

/** 1..n-1 的分页边界数组。 */
function rmPageBreaks(pageCount) {
  var list = [];
  for (var i = 1; i < pageCount; i++) list.push(i);
  return list;
}

/* ---------------- 框选修改：预览 DOM → descriptor ----------------
 *
 * 渲染出来的 DOM（renderBody）没有 data-* 标记，只能按结构类名反向识别：
 *   .rm-name / .rm-role / li.rm-c.rm-c-<field>            → basics
 *   .rm-summary                                           → summary
 *   .rm-sec-<name> > .rm-sec-h > .rm-sec-t                → sectionTitle
 *   .rm-items > .rm-item                                  → entry（experience/projects/education）
 *   .rm-item > ul.rm-bullets > li                         → bullet
 *   .rm-skill-row / .rm-award-row                         → entry（skills/awards，退化条目）
 *   .rm-sec 其它区域                                       → section
 * 找不到具体范围时返回 null，hover 不亮、点击不选中。
 */

var RM_SEL_SECTION_LABELS = {
  summary: '个人简介',
  experience: '工作经历',
  projects: '项目经历',
  education: '教育背景',
  skills: '专业技能',
  awards: '荣誉奖项',
};

var RM_SEL_FIELD_LABELS = {
  name: '姓名',
  role: '职位',
  phone: '电话',
  email: '邮箱',
  city: '城市',
  wechat: '微信',
  github: 'GitHub',
  website: '主页',
};

/** 组件内注入的选区样式（跟随主题 token，不改 10-css.js）。 */
var RM_SEL_CSS = `
.rm-sel-box{position:absolute;border-radius:4px;box-sizing:border-box;pointer-events:none;z-index:9}
.rm-sel-box.is-hover{border:1px dashed rgba(47,111,222,.72);background:rgba(47,111,222,.06)}
.rm-sel-box.is-sel{border:2px solid var(--dsw-alias-brand-primary,#2f6fde);background:rgba(47,111,222,.05);z-index:10}
.rm-sel-tag{position:absolute;left:-2px;bottom:100%;margin-bottom:2px;padding:1px 6px;border-radius:5px 5px 5px 0;background:var(--dsw-alias-brand-primary,#2f6fde);color:#fff;font-size:10.5px;line-height:1.5;white-space:nowrap;max-width:320px;overflow:hidden;text-overflow:ellipsis}
.rm-sel-panel{position:absolute;z-index:12;width:min(320px,calc(100% - 16px));display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:10px;background:var(--dsw-alias-bg-base,#fff);box-shadow:0 12px 30px rgba(15,23,42,.18);font-size:12px;color:var(--dsw-alias-label-primary,#1d2129)}
.rm-sel-panel-k{font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rm-sel-input{width:100%;box-sizing:border-box;min-height:66px;resize:vertical;padding:7px 9px;border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:8px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1d2129);font:inherit;font-size:12.5px;line-height:1.5;outline:none}
.rm-sel-input:focus{border-color:var(--dsw-alias-brand-primary,#2f6fde);box-shadow:0 0 0 2px rgba(47,111,222,.16)}
.rm-sel-input::placeholder{color:var(--dsw-alias-label-secondary,#9aa1ab);opacity:.75}
.rm-sel-busy{font-size:11px;color:var(--dsw-alias-brand-primary,#2f6fde)}
.rm-sel-err{font-size:11px;line-height:1.5;color:var(--dsw-alias-state-error-primary,#dc2626)}
.rm-sel-f{display:flex;justify-content:flex-end;gap:6px}
.rm-sel-note{position:absolute;left:10px;bottom:10px;z-index:13;max-width:calc(100% - 20px);padding:7px 10px;border-radius:8px;font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-primary,#1d2129);background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l1,#e5e7eb);box-shadow:0 8px 20px rgba(15,23,42,.14);pointer-events:none}
.rm-sel-note.is-err{border-color:var(--dsw-alias-state-error-primary,#dc2626);color:var(--dsw-alias-state-error-primary,#dc2626)}
`;

/** 元素上的 class 判断（对 innerHTML 出来的节点也可靠）。 */
function rmSelHasClass(node, name) {
  if (!node || node.nodeType !== 1) return false;
  var cls = typeof node.className === 'string' ? node.className : '';
  return cls ? (' ' + cls + ' ').indexOf(' ' + name + ' ') !== -1 : false;
}

/** 父元素（jsdom/浏览器一致）。 */
function rmSelParent(node) {
  if (!node) return null;
  return node.parentElement || node.parentNode || null;
}

/** 从节点向上找最近的带指定 class 的祖先（含自身）。 */
function rmSelClosest(node, name) {
  var cur = node;
  while (cur && cur.nodeType === 1) {
    if (rmSelHasClass(cur, name)) return cur;
    cur = rmSelParent(cur);
  }
  return null;
}

/** 判断节点是否在某个 class 祖先里。 */
function rmSelHasAncestor(node, name) {
  return !!rmSelClosest(node, name);
}

/** 向上找 section 名（experience / projects / …），到 paper 为止。 */
function rmSelSectionClass(node) {
  var cur = node;
  while (cur && cur.nodeType === 1) {
    var cls = typeof cur.className === 'string' ? cur.className : '';
    var found = /(?:^|\s)rm-sec-([a-z]+)(?:\s|$)/.exec(cls);
    if (found) return found[1];
    if (rmSelHasClass(cur, 'rm-paper')) return '';
    cur = rmSelParent(cur);
  }
  return '';
}

/** 兄弟节点里的序号（0 起）；node 不在列表里返回 -1。 */
function rmSelIndexOf(root, node, selector) {
  if (!root || !root.querySelectorAll) return -1;
  var rows = root.querySelectorAll(selector);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i] === node) return i;
  }
  return -1;
}

/** 联系方式 li 的字段名：优先 class rm-c-<field>，其次「标签文字」映射。 */
function rmSelContactField(node) {
  var cls = typeof node.className === 'string' ? node.className : '';
  var found = /(?:^|\s)rm-c-([a-z]+)(?:\s|$)/.exec(cls);
  if (found && RM_SEL_FIELD_LABELS[found[1]]) return found[1];
  var key = node.querySelector ? node.querySelector('.rm-k') : null;
  var label = key && key.textContent ? String(key.textContent).trim() : '';
  var pairs = [
    ['电话', 'phone'], ['手机', 'phone'],
    ['邮箱', 'email'], ['邮件', 'email'],
    ['城市', 'city'], ['所在地', 'city'],
    ['微信', 'wechat'],
    ['GitHub', 'github'], ['Github', 'github'],
    ['主页', 'website'], ['网站', 'website'],
  ];
  for (var i = 0; i < pairs.length; i++) {
    if (label === pairs[i][0]) return pairs[i][1];
  }
  return 'phone';
}

/** 节点可见文字（压掉换行/多余空白）。 */
function rmSelText(node) {
  var text = node && node.textContent ? String(node.textContent) : '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** descriptor 的人话标签，如「工作经历 · 第 1 条 · 要点 2」。 */
function rmSelLabel(descriptor) {
  var d = descriptor || {};
  var section = RM_SEL_SECTION_LABELS[d.section] || d.section || '';
  if (d.scope === 'basics') return d.field ? RM_SEL_FIELD_LABELS[d.field] || '基本信息' : '头部信息';
  if (d.scope === 'summary') return '个人简介';
  if (d.scope === 'sectionTitle') return section + ' · 模块标题';
  if (d.scope === 'entry') return section + ' · 第 ' + ((d.index || 0) + 1) + ' 条';
  if (d.scope === 'bullet') {
    return section + ' · 第 ' + ((d.index || 0) + 1) + ' 条 · 要点 ' + ((d.bulletIndex || 0) + 1);
  }
  if (d.scope === 'section') return section;
  return '选中内容';
}

/** 从点击/悬停目标向上识别出 { element, descriptor, label }，识别不了返回 null。 */
function rmDescribeSelection(start) {
  var node = start;
  while (node && node.nodeType === 1) {
    if (rmSelHasClass(node, 'rm-paper')) return null;
    if (rmSelHasClass(node, 'rm-name')) {
      return rmSelHit(node, { scope: 'basics', field: 'name', text: rmSelText(node) });
    }
    if (rmSelHasClass(node, 'rm-role')) {
      return rmSelHit(node, { scope: 'basics', field: 'role', text: rmSelText(node) });
    }
    if (node.tagName === 'LI' && rmSelHasClass(node, 'rm-c')) {
      return rmSelHit(node, { scope: 'basics', field: rmSelContactField(node), text: rmSelText(node) });
    }
    if (rmSelHasClass(node, 'rm-summary')) {
      return rmSelHit(node, { scope: 'summary', section: 'summary', text: rmSelText(node) });
    }
    if (rmSelHasClass(node, 'rm-sec-t')) {
      var titleSection = rmSelSectionClass(node);
      if (titleSection) {
        return rmSelHit(node, { scope: 'sectionTitle', section: titleSection, text: rmSelText(node) });
      }
    }
    if (node.tagName === 'LI') {
      var bulletItem = rmSelClosest(node, 'rm-item');
      if (bulletItem) {
        var bulletSection = rmSelSectionClass(bulletItem);
        var bulletItemIndex = rmSelIndexOf(rmSelParent(bulletItem), bulletItem, '.rm-item');
        var bulletIndex = rmSelIndexOf(rmSelParent(node), node, 'li');
        if (bulletSection && bulletItemIndex >= 0 && bulletIndex >= 0) {
          return rmSelHit(node, {
            scope: 'bullet',
            section: bulletSection,
            index: bulletItemIndex,
            bulletIndex: bulletIndex,
            text: rmSelText(node),
          });
        }
      }
    }
    if (
      rmSelHasClass(node, 'rm-item') ||
      rmSelHasClass(node, 'rm-item-main') ||
      rmSelHasClass(node, 'rm-item-t') ||
      rmSelHasClass(node, 'rm-item-role') ||
      rmSelHasClass(node, 'rm-date') ||
      rmSelHasClass(node, 'rm-item-sub') ||
      rmSelHasClass(node, 'rm-edu-courses')
    ) {
      var entryItem = rmSelHasClass(node, 'rm-item') ? node : rmSelClosest(node, 'rm-item');
      var entrySection = entryItem ? rmSelSectionClass(entryItem) : '';
      if (entryItem && (entrySection === 'experience' || entrySection === 'projects' || entrySection === 'education')) {
        var entryIndex = rmSelIndexOf(rmSelParent(entryItem), entryItem, '.rm-item');
        if (entryIndex >= 0) {
          return rmSelHit(node, { scope: 'entry', section: entrySection, index: entryIndex, text: rmSelText(node) });
        }
      }
    }
    if (rmSelHasClass(node, 'rm-skill-row')) {
      var skillIndex = rmSelIndexOf(rmSelParent(node), node, '.rm-skill-row');
      return rmSelHit(node, { scope: 'entry', section: 'skills', index: Math.max(0, skillIndex), text: rmSelText(node) });
    }
    if (rmSelHasClass(node, 'rm-award-row')) {
      var awardIndex = rmSelIndexOf(rmSelParent(node), node, '.rm-award-row');
      return rmSelHit(node, { scope: 'entry', section: 'awards', index: Math.max(0, awardIndex), text: rmSelText(node) });
    }
    if (rmSelHasClass(node, 'rm-sec')) {
      var sectionName = rmSelSectionClass(node);
      if (sectionName) return rmSelHit(node, { scope: 'section', section: sectionName });
    }
    if (rmSelHasClass(node, 'rm-head')) return rmSelHit(node, { scope: 'basics' });
    node = rmSelParent(node);
  }
  return null;
}

function rmSelHit(element, descriptor) {
  return { element: element, descriptor: descriptor, label: rmSelLabel(descriptor) };
}

/** 元素相对预览视口（含滚动）的位置；拿不到尺寸（jsdom 全 0）时返回 null。 */
function rmSelRect(element, hostEl) {
  if (!element || !hostEl || typeof element.getBoundingClientRect !== 'function') return null;
  var a;
  var b;
  try {
    a = element.getBoundingClientRect();
    b = hostEl.getBoundingClientRect();
  } catch (error) {
    return null;
  }
  if (!a || !b) return null;
  var width = a.width;
  var height = a.height;
  if (!isFinite(width) || !isFinite(height) || width <= 0 || height <= 0) return null;
  var scrollLeft = hostEl.scrollLeft || 0;
  var scrollTop = hostEl.scrollTop || 0;
  return {
    left: a.left - b.left + scrollLeft,
    top: a.top - b.top + scrollTop,
    width: width,
    height: height,
  };
}

/** 小面板位置：默认贴选区右下，clamp 在预览视口内；无位置信息时回到左上角。 */
function rmSelPanelPos(rect, hostEl) {
  var width = hostEl && hostEl.clientWidth ? hostEl.clientWidth : 340;
  var height = hostEl && hostEl.clientHeight ? hostEl.clientHeight : 360;
  var panelW = Math.min(320, Math.max(200, width - 16));
  var panelH = 260;
  var left = rect ? rect.left + rect.width + 10 : 12;
  var top = rect ? rect.top + rect.height + 10 : 12;
  // 下方放不下就翻到选区上方，仍然不行就压在视口内
  if (rect && top + panelH > height && rect.top - panelH - 10 > 8) top = rect.top - panelH - 10;
  left = Math.max(8, Math.min(left, width - panelW - 8));
  top = Math.max(8, Math.min(top, Math.max(8, height - panelH)));
  return { left: left, top: top };
}

/**
 * 把 AI 返回的 stylePatch 合成完整 CSS（根选择器 = 当前模板 class）。
 * 依赖 33-template-editor.js 暴露的 rmStyleToCss / rmStyleMerge / rmTemplateStyle，
 * 这些函数在同一个 bundle 作用域里；缺失时返回空串（调用方跳过样式二次提交）。
 */
function rmBuildStyleOverrideCss(patch, template) {
  if (typeof rmStyleToCss !== 'function') return '';
  var base = null;
  try {
    if (typeof rmTemplateStyle === 'function') base = rmTemplateStyle(template || null);
  } catch (error) {
    base = null;
  }
  if (!base && typeof rmStyleDefaults === 'function') {
    try {
      base = rmStyleDefaults();
    } catch (error2) {
      base = null;
    }
  }
  if (!base) return '';
  var merged = base;
  try {
    merged = typeof rmStyleMerge === 'function' ? rmStyleMerge(base, patch || {}) : Object.assign({}, base, patch || {});
  } catch (error3) {
    merged = base;
  }
  try {
    return rmStyleToCss(merged, templateClass(template || null)) || '';
  } catch (error4) {
    return '';
  }
}

/**
 * 纯缩放预览：props { resume, template, width?, scale?, frame?, multiPage?, onPageCount? }
 * - width 模式（缩略图）：按给定宽度等比缩放、单页裁切；
 * - scale 模式（预览面板）：显式缩放；multiPage 时按内容实际高度逐页展开。
 */
function PreviewScaled(props) {
  var template = props.template;
  var resume = props.resume;
  var multiPage = !!props.multiPage;
  var width = Math.max(120, Math.floor(props.width || 360));
  var scale = props.scale != null ? rmClamp(props.scale, 0.05, 3) : Math.min(1, width / PAPER_W);
  // resume.styleOverrideCss 是「框选修改」里用户确认过的样式覆盖（根选择器是当前模板 class），
  // 追加在模板 CSS 之后，保证预览和 PDF 都按覆盖后的效果渲染。
  var overrideCss = resume && typeof resume.styleOverrideCss === 'string' ? resume.styleOverrideCss : '';
  var css = BASE_CSS + (template ? template.css : '') + (overrideCss ? '\n' + overrideCss : '');
  var body = renderBody(resume);

  var pages = useState(1);
  var pageCount = pages[0];
  var setPageCount = pages[1];
  var paperRef = useRef(null);

  useLayoutEffect(
    function () {
      if (!multiPage) {
        setPageCount(function (prev) {
          return prev === 1 ? prev : 1;
        });
        return undefined;
      }
      var el = paperRef.current;
      if (!el) return undefined;
      var measure = function () {
        var contentHeight = Math.max(rmPaperContentHeight(el), PAPER_H);
        var next = Math.max(1, Math.ceil(contentHeight / PAPER_H - 0.001));
        setPageCount(function (prev) {
          return prev === next ? prev : next;
        });
        if (typeof props.onPageCount === 'function') props.onPageCount(next);
      };
      measure();
      if (typeof ResizeObserver === 'undefined') return undefined;
      var ro = new ResizeObserver(measure);
      ro.observe(el);
      return function () {
        ro.disconnect();
      };
    },
    [body, template ? template.id : '', multiPage, props.onPageCount]
  );

  var totalHeight = multiPage ? pageCount * PAPER_H : PAPER_H;
  var outerWidth = props.scale != null ? Math.round(PAPER_W * scale) : width;
  var outerHeight = Math.max(60, Math.round(totalHeight * scale));
  var paperStyle = multiPage ? { minHeight: totalHeight } : undefined;

  var innerChildren = [
    h('div', {
      key: 'rm-doc-paper',
      ref: paperRef,
      className: 'rm-doc rm-paper ' + templateClass(template),
      style: paperStyle,
      dangerouslySetInnerHTML: { __html: body },
    }),
  ];
  if (multiPage && pageCount > 1) {
    innerChildren.push(
      h(
        'div',
        { key: 'rm-page-lines', className: 'rm-page-lines', 'aria-hidden': 'true' },
        rmPageBreaks(pageCount).map(function (index) {
          return h(
            'div',
            { key: 'rm-page-line-' + index, className: 'rm-page-line', style: { top: index * PAPER_H } },
            h('span', { className: 'rm-page-line-k' }, '第 ' + (index + 1) + ' 页')
          );
        })
      )
    );
  }

  return h(
    'div',
    { className: 'rm-scaled' + (props.frame ? ' rm-paper-frame' : ''), style: { width: outerWidth, height: outerHeight } },
    h('style', { key: 'rm-doc-css' }, css),
    h(
      'div',
      {
        key: 'rm-doc-inner',
        className: 'rm-scaled-inner',
        style: { width: PAPER_W, height: totalHeight, transform: 'scale(' + scale + ')' },
      },
      innerChildren
    )
  );
}

/** 编辑区右侧的实时预览：多页 + 40%–200% 缩放，默认适合宽度；支持框选元素让 AI 修改。 */
function PreviewPanel(props) {
  var measured = rmUseWidth(560);
  var hostRef = measured[0];
  var hostWidth = measured[1];
  var zoomPair = useState(null);
  var zoom = zoomPair[0];
  var setZoom = zoomPair[1];
  var pagePair = useState(1);
  var pageCount = pagePair[0];
  var setPageCount = pagePair[1];

  // 框选修改：选择模式 / 悬停高亮 / 已选范围 / 指令输入 / 提交状态 / 结果提示
  var modePair = useState(false);
  var selecting = modePair[0];
  var setSelecting = modePair[1];
  var hoverPair = useState(null);
  var hover = hoverPair[0];
  var setHover = hoverPair[1];
  var selPair = useState(null);
  var sel = selPair[0];
  var setSel = selPair[1];
  var inputPair = useState('');
  var instruction = inputPair[0];
  var setInstruction = inputPair[1];
  var busyPair = useState(false);
  var busy = busyPair[0];
  var setBusy = busyPair[1];
  var errPair = useState('');
  var err = errPair[0];
  var setErr = errPair[1];
  var notePair = useState(null);
  var note = notePair[0];
  var setNote = notePair[1];
  var seqPair = useState(0);
  var selSeq = seqPair[0];
  var setSelSeq = seqPair[1];
  var noteTimer = useRef(null);
  var inputRef = useRef(null);
  var resumeKey = props.resume && props.resume.id ? String(props.resume.id) : '';

  var fitScale = rmClamp((Math.max(220, hostWidth) - 28) / PAPER_W, RM_ZOOM_MIN, 1);
  var scale = zoom == null ? fitScale : rmClamp(zoom, RM_ZOOM_MIN, RM_ZOOM_MAX);
  var percent = Math.round(scale * 100);
  var isFit = zoom == null;
  var isFull = zoom != null && Math.abs(zoom - 1) < 0.001;

  function zoomBy(delta) {
    setZoom(function (prev) {
      var base = prev == null ? fitScale : prev;
      return Math.round(rmClamp(base + delta, RM_ZOOM_MIN, RM_ZOOM_MAX) * 100) / 100;
    });
  }

  function clearNoteTimer() {
    if (noteTimer.current) {
      clearTimeout(noteTimer.current);
      noteTimer.current = null;
    }
  }

  function flashNote(text) {
    clearNoteTimer();
    setNote({ text: text });
    noteTimer.current = setTimeout(function () {
      noteTimer.current = null;
      setNote(null);
    }, 5600);
  }

  function clearSelection() {
    setSel(null);
    setHover(null);
    setInstruction('');
    setErr('');
  }

  function hostEl() {
    return hostRef.current;
  }

  function stopBubble(event) {
    event.stopPropagation();
  }

  function onViewportOver(event) {
    if (!selecting || busy) return;
    var hit = rmDescribeSelection(event.target);
    if (!hit) {
      if (hover) setHover(null);
      return;
    }
    setHover({ label: hit.label, rect: rmSelRect(hit.element, hostEl()) });
  }

  function onViewportOut(event) {
    if (!selecting) return;
    var next = event.relatedTarget;
    var host = hostEl();
    if (next && host && host.contains && host.contains(next)) return;
    if (hover) setHover(null);
  }

  function onViewportClick(event) {
    if (!selecting) return;
    // 点小面板里的控件不算重新选区
    if (rmSelHasAncestor(event.target, 'rm-sel-panel')) return;
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    var hit = rmDescribeSelection(event.target);
    if (!hit) {
      clearSelection();
      return;
    }
    var rect = rmSelRect(hit.element, hostEl());
    setHover(null);
    setErr('');
    setInstruction('');
    setSel({ descriptor: hit.descriptor, label: hit.label, rect: rect, pos: rmSelPanelPos(rect, hostEl()) });
    setSelSeq(function (prev) {
      return prev + 1;
    });
  }

  function applyResult(value) {
    setBusy(false);
    var change = (value && value.change) || {};
    var summary = change.summary ? String(change.summary) : '已按你的要求修改';
    var extra = change.note ? String(change.note) : '';
    flashNote(extra ? summary + '（' + extra + '）' : summary);
    if (value && value.resume && typeof props.onChanged === 'function') props.onChanged(value.resume);
    if (typeof props.onToast === 'function') props.onToast(extra ? summary + '（' + extra + '）' : summary);
    clearSelection();
  }

  function submitEdit() {
    if (busy || !sel) return;
    var text = String(instruction || '').trim();
    if (!text) {
      setErr('先写一句想怎么改，例如「把这个名字字号调大一点」');
      return;
    }
    setBusy(true);
    setErr('');
    var base = {
      resumeId: (props.resume && props.resume.id) || '',
      descriptor: sel.descriptor,
      instruction: text,
    };
    rmApi('/selection/edit', { method: 'POST', body: base })
      .then(function (value) {
        var change = value && value.change;
        if (change && change.kind === 'style' && change.stylePatch) {
          var css = rmBuildStyleOverrideCss(change.stylePatch, props.template);
          if (css) {
            return rmApi('/selection/edit', {
              method: 'POST',
              body: Object.assign({}, base, { styleOverride: change.stylePatch, styleOverrideCss: css }),
            });
          }
        }
        return value;
      })
      .then(applyResult)
      .catch(function (error) {
        setBusy(false);
        setErr(rmErrText(error) || (error && error.message) || 'AI 修改失败，请稍后再试');
      });
  }

  // 切换简历时清掉选区/提示，避免把旧 descriptor 套到新简历上
  useEffect(
    function () {
      setSel(null);
      setHover(null);
      setInstruction('');
      setErr('');
      setBusy(false);
      setSelecting(false);
      clearNoteTimer();
      setNote(null);
      return undefined;
    },
    [resumeKey]
  );

  // Esc 取消当前选择；没有选区时退出选择模式
  useEffect(
    function () {
      if (!selecting) return undefined;
      function onKey(event) {
        if (event.key !== 'Escape' && event.key !== 'Esc') return;
        if (sel) clearSelection();
        else setSelecting(false);
      }
      window.addEventListener('keydown', onKey);
      return function () {
        window.removeEventListener('keydown', onKey);
      };
    },
    [selecting, sel]
  );

  useEffect(function () {
    return function () {
      if (noteTimer.current) clearTimeout(noteTimer.current);
    };
  }, []);

  // 选中后把焦点放进指令输入框
  useEffect(
    function () {
      if (!sel) return;
      var input = inputRef.current;
      if (input && typeof input.focus === 'function') input.focus();
    },
    [selSeq]
  );

  return h(
    'div',
    { className: 'rm-preview-col' },
    h(
      'div',
      { className: 'rm-preview-bar' },
      h('b', { key: 'rm-preview-title', title: '导出 HTML 后 Ctrl/Cmd+P 可存为 PDF' }, 'A4 预览'),
      h('span', { key: 'rm-preview-tpl', className: 'rm-pill' }, props.template ? props.template.name : ''),
      pageCount > 1 ? h('span', { key: 'rm-preview-pages', className: 'rm-pill' }, '共 ' + pageCount + ' 页') : null,
      h(
        'button',
        {
          key: 'rm-sel-toggle',
          type: 'button',
          className: 'rm-btn rm-btn-sm rm-zoom-btn' + (selecting ? ' is-on' : ''),
          title: '开启后在预览里点选姓名/模块/条目/要点，再告诉 AI 想怎么改',
          'aria-pressed': selecting ? 'true' : 'false',
          onClick: function () {
            setSelecting(function (prev) {
              if (prev) clearSelection();
              else setErr('');
              return !prev;
            });
          },
        },
        '框选修改'
      ),
      h(
        'div',
        { key: 'rm-preview-zoom', className: 'rm-preview-zoom' },
        h(
          'button',
          {
            key: 'zoom-out',
            type: 'button',
            className: 'rm-btn rm-btn-sm rm-zoom-btn',
            title: '缩小',
            'aria-label': '缩小',
            onClick: function () {
              zoomBy(-0.1);
            },
          },
          '−'
        ),
        h('span', { key: 'zoom-pct', className: 'rm-zoom-pct', title: isFit ? '适合宽度' : '当前缩放' }, percent + '%'),
        h(
          'button',
          {
            key: 'zoom-in',
            type: 'button',
            className: 'rm-btn rm-btn-sm rm-zoom-btn',
            title: '放大',
            'aria-label': '放大',
            onClick: function () {
              zoomBy(0.1);
            },
          },
          '+'
        ),
        h(
          'button',
          {
            key: 'zoom-fit',
            type: 'button',
            className: 'rm-btn rm-btn-sm rm-zoom-btn' + (isFit ? ' is-on' : ''),
            title: '适合宽度（默认）',
            'aria-label': '适合宽度',
            'aria-pressed': isFit ? 'true' : 'false',
            onClick: function () {
              setZoom(null);
            },
          },
          '适合宽度'
        ),
        h(
          'button',
          {
            key: 'zoom-100',
            type: 'button',
            className: 'rm-btn rm-btn-sm rm-zoom-btn' + (isFull ? ' is-on' : ''),
            title: '按 100% 显示',
            'aria-label': '100%',
            'aria-pressed': isFull ? 'true' : 'false',
            onClick: function () {
              setZoom(1);
            },
          },
          '100%'
        )
      )
    ),
    h(
      'div',
      {
        className: 'rm-preview-viewport',
        ref: hostRef,
        style: { position: 'relative', cursor: selecting ? 'crosshair' : undefined, userSelect: selecting ? 'none' : undefined },
        onMouseOver: onViewportOver,
        onMouseOut: onViewportOut,
        onClickCapture: selecting ? onViewportClick : undefined,
      },
      h('style', { key: 'rm-sel-css', dangerouslySetInnerHTML: { __html: RM_SEL_CSS } }),
      h(PreviewScaled, {
        resume: props.resume,
        template: props.template,
        scale: scale,
        multiPage: true,
        frame: true,
        onPageCount: setPageCount,
      }),
      hover && hover.rect
        ? h('div', {
            key: 'rm-sel-hover',
            className: 'rm-sel-box is-hover',
            'aria-hidden': 'true',
            style: { left: hover.rect.left, top: hover.rect.top, width: hover.rect.width, height: hover.rect.height },
          })
        : null,
      sel && sel.rect
        ? h(
            'div',
            {
              key: 'rm-sel-box',
              className: 'rm-sel-box is-sel',
              style: { left: sel.rect.left, top: sel.rect.top, width: sel.rect.width, height: sel.rect.height },
            },
            h('span', { className: 'rm-sel-tag' }, sel.label)
          )
        : null,
      sel
        ? h(
            'div',
            {
              key: 'rm-sel-panel',
              className: 'rm-sel-panel',
              style: { left: sel.pos.left, top: sel.pos.top },
              onClick: stopBubble,
              onMouseDown: stopBubble,
              onMouseOver: stopBubble,
              onMouseOut: stopBubble,
            },
            h('div', { key: 'rm-sel-k', className: 'rm-sel-panel-k' }, '选中范围：' + sel.label),
            h('textarea', {
              key: 'rm-sel-input',
              ref: inputRef,
              className: 'rm-sel-input',
              placeholder: '想怎么改？例如：把这条改得更量化 / 这个模块标题改成「实习经历」/ 名字字号再大一点',
              value: instruction,
              disabled: busy,
              onChange: function (event) {
                setInstruction(event.target.value);
              },
              onKeyDown: function (event) {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submitEdit();
                }
              },
            }),
            busy ? h('div', { key: 'rm-sel-busy', className: 'rm-sel-busy' }, 'AI 修改中…') : null,
            err ? h('div', { key: 'rm-sel-err', className: 'rm-sel-err' }, err) : null,
            h(
              'div',
              { key: 'rm-sel-f', className: 'rm-sel-f' },
              h(
                'button',
                {
                  key: 'rm-sel-cancel',
                  type: 'button',
                  className: 'rm-btn rm-btn-sm',
                  disabled: busy,
                  onClick: clearSelection,
                },
                '取消'
              ),
              h(
                'button',
                {
                  key: 'rm-sel-ok',
                  type: 'button',
                  className: 'rm-btn rm-btn-sm rm-btn-primary',
                  disabled: busy,
                  onClick: submitEdit,
                },
                busy ? 'AI 修改中…' : 'AI 修改'
              )
            )
          )
        : null,
      note ? h('div', { key: 'rm-sel-note', className: 'rm-sel-note', role: 'status' }, note.text) : null
    )
  );
}

/** 缩略图（模板/市场卡片用）：固定宽度，高度跟随比例，单页裁切。 */
function Thumb(props) {
  var measured = rmUseWidth(props.initialWidth || 190);
  var ref = measured[0];
  var width = measured[1];
  var useWidth = Math.max(120, Math.min(width, PAPER_W));
  return h('div', { className: 'rm-tpl-thumb', ref: ref }, h(PreviewScaled, { resume: props.resume, template: props.template, width: useWidth }));
}
