/**
 * 简历市场 client — 20 文档预览。
 * 复用 src/shared/doc.js 的 renderBody/BASE_CSS，按容器宽度等比缩放整张 A4 纸。
 */

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

/** 纯缩放预览：props { resume, template, width, frame? } */
function PreviewScaled(props) {
  var template = props.template;
  var resume = props.resume;
  var width = Math.max(120, Math.floor(props.width || 360));
  var scale = Math.min(1, width / PAPER_W);
  var height = Math.max(60, Math.round(PAPER_H * scale));
  var css = BASE_CSS + (template ? template.css : '');
  var body = renderBody(resume);
  return h(
    'div',
    { className: 'rm-scaled' + (props.frame ? ' rm-paper-frame' : ''), style: { width: width, height: height } },
    h('style', { key: 'rm-doc-css' }, css),
    h(
      'div',
      { className: 'rm-scaled-inner', style: { width: PAPER_W, height: PAPER_H, transform: 'scale(' + scale + ')' } },
      h('div', {
        className: 'rm-doc rm-paper ' + templateClass(template),
        dangerouslySetInnerHTML: { __html: body },
      })
    )
  );
}

/** 编辑区右侧的实时预览（自适应宽度，最大 1:1）。 */
function PreviewPanel(props) {
  var measured = rmUseWidth(560);
  var hostRef = measured[0];
  var hostWidth = measured[1];
  var viewportWidth = Math.max(220, hostWidth - 28);
  var width = Math.min(PAPER_W, viewportWidth);
  return h(
    'div',
    { className: 'rm-preview-col' },
    h(
      'div',
      { className: 'rm-preview-bar' },
      h('b', null, 'A4 预览'),
      h('span', { className: 'rm-pill' }, props.template ? props.template.name : ''),
      h('span', { className: 'rm-pill' }, props.zoom ? Math.round(props.zoom * 100) + '%' : Math.round(width / PAPER_W * 100) + '%'),
      h('span', { className: 'rm-muted', style: { marginLeft: 'auto' } }, '导出 HTML 后 Ctrl/Cmd+P 存 PDF')
    ),
    h('div', { className: 'rm-preview-viewport', ref: hostRef }, h(PreviewScaled, { resume: props.resume, template: props.template, width: width, frame: true }))
  );
}

/** 缩略图（模板/市场卡片用）：固定宽度，高度跟随比例。 */
function Thumb(props) {
  var measured = rmUseWidth(props.initialWidth || 190);
  var ref = measured[0];
  var width = measured[1];
  var useWidth = Math.max(120, Math.min(width, PAPER_W));
  return h('div', { className: 'rm-tpl-thumb', ref: ref }, h(PreviewScaled, { resume: props.resume, template: props.template, width: useWidth }));
}
