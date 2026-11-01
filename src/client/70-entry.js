/**
 * 简历市场 client — 70 入口：注册侧栏图标与中央面板。
 * 面板 key / 侧栏 id 都是 resume-market，点击侧栏图标即切到该面板。
 */

function ResumeMarketIcon(props) {
  var size = props && props.size ? props.size : 18;
  return h(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 20 20',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
    },
    h('path', { d: 'M5 2.8h6.4L14.6 6v2.2' }),
    h('path', { d: 'M5 2.8A1.2 1.2 0 0 0 3.8 4v12A1.2 1.2 0 0 0 5 17.2h5.5' }),
    h('path', { d: 'M11.4 2.8V6h3.2' }),
    h('path', { d: 'M6.4 7.4h5.2M6.4 10.2h5.2M6.4 13h3.2' }),
    h('circle', { cx: 15.2, cy: 14.9, r: 3.1 }),
    h('path', { d: 'M15.2 13.5v2.8M13.8 14.9h2.8' })
  );
}

function resumeMarketApply(ctx) {
  ctx.effect(function () {
    return ctx.locale.register(NS, RM_STRINGS);
  }, 'resume-market: locale');

  ctx.slots.inject('main', function () {
    return ctx.slots.register(
      {
        name: 'main',
        key: 'resume-market',
        locale: NS,
        inject: function () {
          return {};
        },
      },
      ResumePanel
    );
  });

  ctx.slots.inject('sidebar.panellist', function () {
    return ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: 'resume-market',
        order: 12,
        label: function () {
          return rt('panel');
        },
        locale: NS,
      },
      ResumeMarketIcon
    );
  });

  // 带 #resume-market 打开时自动切到面板，便于无头验证与分享链接。
  try {
    if (ctx.layout && typeof ctx.layout.selectPanel === 'function' && typeof location !== 'undefined' && String(location.hash || '').indexOf('resume-market') >= 0) {
      ctx.layout.selectPanel('resume-market');
    }
  } catch (err) {
    rmLog('resume-market: selectPanel failed', err);
  }

  try {
    if (typeof window !== 'undefined') {
      window.__resumeMarket = {
        open: function () {
          try {
            ctx.layout.selectPanel('resume-market');
          } catch (err) {
            rmLog(err);
          }
        },
        buildPdf: rmBuildPdf,
        styleToCss: function (style, cls) {
          return rmStyleToCss(style, cls || 'rm-t-preview');
        },
        styleFromAnalysis: function (analysis) {
          return rmStyleFromAnalysis(analysis);
        },
        analyzePixels: typeof rmAnalyzePixels === 'function' ? rmAnalyzePixels : undefined,
        previewParts: typeof buildPreviewParts === 'function' ? buildPreviewParts : undefined,
        buildHtml: typeof buildHtml === 'function' ? buildHtml : undefined,
        demoData: typeof DEMO_RESUME_DATA !== 'undefined' ? DEMO_RESUME_DATA : undefined,
        normalizeData: typeof normalizeData === 'function' ? normalizeData : undefined,
      };
    }
  } catch (err) {
    rmLog('resume-market: window handle failed', err);
  }
}

module.exports.apply = resumeMarketApply;
module.exports.inject = ['slots', 'layout', 'locale'];
