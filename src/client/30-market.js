/**
 * 简历市场 client — 30 模板库与市场画廊。
 */

/** 市场条目里的 sample 是「简历数据」而不是完整简历对象，这里补成可渲染的简历。 */
function rmSampleResume(sample) {
  if (sample && sample.data) return sample;
  return {
    id: 'rm-sample',
    title: '样张',
    templateId: '',
    lang: 'zh',
    sections: SECTION_ORDER.slice(),
    data: normalizeData(sample || DEMO_RESUME_DATA),
  };
}

function TemplateCard(props) {
  var template = props.template;
  var onUse = props.onUse;
  return h(
    'div',
    { className: 'rm-tpl' + (props.current ? ' is-current' : '') },
    h(Thumb, { resume: rmSampleResume(props.sample), template: template, initialWidth: 190 }),
    h(
      'div',
      { className: 'rm-tpl-body' },
      h(
        'div',
        { className: 'rm-tpl-name' },
        template.name,
        template.builtin ? h('span', { className: 'rm-pill rm-pill-brand' }, '内置') : null,
        props.current ? h('span', { className: 'rm-pill rm-pill-warn' }, '使用中') : null
      ),
      h('div', { className: 'rm-tpl-tag' }, template.tagline || template.en || ''),
      h(
        'div',
        { className: 'rm-tpl-foot' },
        h('button', { type: 'button', className: 'rm-btn rm-btn-sm' + (props.current ? '' : ' rm-btn-primary'), onClick: function () { onUse(template); } }, props.current ? '换回' : '使用此模板'),
        props.onOpen ? h('button', { type: 'button', className: 'rm-btn rm-btn-sm', onClick: function () { props.onOpen(template); } }, '预览') : null
      )
    )
  );
}

function MarketCard(props) {
  var entry = props.entry;
  var installed = props.installed;
  var mine = !!props.mine;
  return h(
    'div',
    { className: 'rm-tpl' },
    h(Thumb, { resume: rmSampleResume(entry.sample), template: entry, initialWidth: 190 }),
    h(
      'div',
      { className: 'rm-tpl-body' },
      h('div', { className: 'rm-tpl-name' }, entry.name || '未命名模板', mine ? h('span', { className: 'rm-pill rm-pill-warn' }, '我发布的') : null),
      h('div', { className: 'rm-tpl-tag' }, entry.tagline || entry.desc || ''),
      h(
        'div',
        { className: 'rm-tpl-foot' },
        h('span', { className: 'rm-pill' }, 'by ' + (entry.author || '匿名')),
        h('span', { className: 'rm-muted' }, '↓ ' + (entry.installs || 0)),
        h('span', { className: 'rm-muted' }, '♥ ' + (entry.likes || 0))
      ),
      h(
        'div',
        { className: 'rm-tpl-foot' },
        h(
          'button',
          {
            type: 'button',
            className: 'rm-btn rm-btn-sm' + (installed ? '' : ' rm-btn-primary'),
            disabled: installed || props.busy,
            onClick: function () {
              props.onInstall(entry);
            },
          },
          installed ? '已安装' : '安装'
        ),
        h(
          'button',
          { type: 'button', className: 'rm-btn rm-btn-sm', disabled: props.busy, onClick: function () { props.onLike(entry); } },
          '♥'
        ),
        mine
          ? h(
              'button',
              { type: 'button', className: 'rm-btn rm-btn-sm rm-btn-danger', disabled: props.busy, onClick: function () { props.onUnpublish(entry); } },
              '下架'
            )
          : null
      )
    )
  );
}

function TemplatesView(props) {
  var templates = props.templates || [];
  return h(
    'div',
    { className: 'rm-grid' },
    templates.map(function (template) {
      return h(TemplateCard, {
        key: template.id,
        template: template,
        current: props.currentTemplateId === template.id,
        sample: template.sample || DEMO_RESUME_DATA,
        onUse: props.onUse,
        onOpen: props.onPreview,
      });
    })
  );
}

function MarketView(props) {
  var entries = props.market || [];
  var installedIds = props.installedTemplateIds || [];
  var body;
  if (props.loading) {
    body = h('div', { className: 'rm-loading' }, '正在读取市场…');
  } else if (!entries.length) {
    body = h('div', { className: 'rm-empty' }, '市场里还没有模板。先做一份简历，再把它发布上来吧。');
  } else {
    body = h(
      'div',
      { className: 'rm-grid' },
      entries.map(function (entry) {
        return h(MarketCard, {
          key: entry.id,
          entry: entry,
          installed: installedIds.indexOf(entry.templateId) >= 0,
          mine: !!props.myResumeIds && props.myResumeIds.indexOf(entry.resumeId) >= 0,
          busy: props.busyId === entry.id,
          onInstall: props.onInstall,
          onUnpublish: props.onUnpublish,
          onLike: props.onLike,
        });
      })
    );
  }
  return h(
    'div',
    { className: 'rm-col', style: { width: '100%', minHeight: 0, overflow: 'auto' } },
    h(
      'div',
      { className: 'rm-row', style: { padding: '14px 18px 0' } },
      h('div', { className: 'rm-col' }, h('b', { style: { fontSize: '13px' } }, '大肥鱼模板市场'), h('span', { className: 'rm-hint' }, '免费模板 · 安装即用 · 一键发布你的作品，让其他装了插件的用户也能用')),
      h(
        'div',
        { style: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
        h('button', { type: 'button', className: 'rm-btn rm-btn-sm', onClick: props.onRefresh, disabled: props.loading }, '刷新')
      )
    ),
    body
  );
}
