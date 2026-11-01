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
  var css = BASE_CSS + (template ? template.css : '');
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

/** 编辑区右侧的实时预览：多页 + 40%–200% 缩放，默认适合宽度。 */
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
      { className: 'rm-preview-viewport', ref: hostRef },
      h(PreviewScaled, {
        resume: props.resume,
        template: props.template,
        scale: scale,
        multiPage: true,
        frame: true,
        onPageCount: setPageCount,
      })
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
