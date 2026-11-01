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
  var builtin = !!template.builtin || template.source === 'builtin';
  function pick(event) {
    if (event && event.target && event.target.closest && event.target.closest('button')) return;
    if (onUse) onUse(template);
  }
  return h(
    'div',
    { className: 'rm-tpl is-clickable' + (props.current ? ' is-current' : ''), onClick: pick, title: '点击直接套用这套模板' },
    h(Thumb, { resume: rmSampleResume(props.sample), template: template, initialWidth: 190 }),
    h(
      'div',
      { className: 'rm-tpl-body' },
      h(
        'div',
        { className: 'rm-tpl-name' },
        template.name,
        builtin ? h('span', { className: 'rm-pill rm-pill-brand' }, '内置') : h('span', { className: 'rm-pill' }, '我的'),
        props.current ? h('span', { className: 'rm-pill rm-pill-warn' }, '使用中') : null
      ),
      h('div', { className: 'rm-tpl-tag' }, template.tagline || template.en || ''),
      h(
        'div',
        { className: 'rm-tpl-foot' },
        h('button', { type: 'button', className: 'rm-btn rm-btn-sm' + (props.current ? '' : ' rm-btn-primary'), onClick: function () { onUse(template); } }, props.current ? '换回' : '使用此模板'),
        props.onPreview ? h('button', { type: 'button', className: 'rm-btn rm-btn-sm', onClick: function () { props.onPreview(template); } }, '预览') : null
      ),
      builtin
        ? props.onCopy
          ? h(
              'div',
              { className: 'rm-tpl-foot' },
              h('button', { type: 'button', className: 'rm-btn rm-btn-sm', onClick: function () { props.onCopy(template); } }, '复制为新模板')
            )
          : null
        : h(
            'div',
            { className: 'rm-tpl-foot' },
            props.onEdit ? h('button', { type: 'button', className: 'rm-btn rm-btn-sm', onClick: function () { props.onEdit(template); } }, '编辑') : null,
            props.onPublishTemplate ? h('button', { type: 'button', className: 'rm-btn rm-btn-sm', onClick: function () { props.onPublishTemplate(template); } }, '发布') : null,
            props.onDelete ? h('button', { type: 'button', className: 'rm-btn rm-btn-sm rm-btn-danger', onClick: function () { props.onDelete(template); } }, '删除') : null
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
    { className: 'rm-lib' },
    h(
      'div',
      { className: 'rm-lib-bar' },
      h(
        'div',
        { className: 'rm-col' },
        h('h3', null, '模板库'),
        h('span', { className: 'rm-hint' }, '选一套版式套用；内置模板可以「复制为新模板」后随便改，自定义模板能编辑、发布到市场或删除。')
      ),
      h(
        'div',
        { className: 'rm-row' },
        props.onCreate ? h('button', { type: 'button', className: 'rm-btn rm-btn-primary', onClick: props.onCreate }, '+ 新建模板') : null,
        props.onImport ? h('button', { type: 'button', className: 'rm-btn', onClick: props.onImport }, '从文件生成') : null
      )
    ),
    h(
      'div',
      { className: 'rm-grid' },
      templates.map(function (template, index) {
        return h(TemplateCard, {
          key: (template.builtin || template.source === 'builtin' ? 'b:' : 'c:') + template.id + ':' + index,
          template: template,
          current: props.currentTemplateId === template.id,
          sample: template.sample || DEMO_RESUME_DATA,
          onUse: props.onUse,
          onPreview: props.onPreview,
          onCreate: props.onCreate,
          onCopy: props.onCopy,
          onEdit: props.onEdit,
          onPublishTemplate: props.onPublishTemplate,
          onDelete: props.onDelete,
        });
      })
    )
  );
}

function PublicMarketCard(props) {
  var item = props.item;
  var installed = props.installed;
  var likes = props.likes || 0;
  var accent = item.accent || '#2f6fde';
  var hasPreview = !!(item.css && item.sample);
  var thumb = hasPreview
    ? h(Thumb, {
        resume: rmSampleResume(item.sample),
        template: { id: item.templateId || 'pub-' + item.id, name: item.name, cls: item.cls, css: item.css },
        initialWidth: 190,
      })
    : h(
        'div',
        { className: 'rm-tpl-thumb', style: { background: accent + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
        h('div', { style: { fontSize: '16px', fontWeight: '600', color: accent } }, item.name || ''),
      );
  return h(
    'div',
    { className: 'rm-tpl' },
    thumb,
    h(
      'div',
      { className: 'rm-tpl-body' },
      h('div', { className: 'rm-tpl-name' }, item.name || '未命名模板', h('span', { className: 'rm-pill rm-pill-brand' }, '公共')),
      h('div', { className: 'rm-tpl-tag' }, item.tagline || ''),
      h(
        'div',
        { className: 'rm-tpl-foot' },
        h('span', { className: 'rm-pill' }, 'by ' + (item.author || '匿名')),
        h('span', { className: 'rm-muted' }, '↓ ' + (item.installs || 0)),
        h('span', { className: 'rm-muted' }, '♥ ' + likes),
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
            onClick: function () { props.onInstall(item); },
          },
          installed ? '已安装' : '安装',
        ),
        h('button', { type: 'button', className: 'rm-btn rm-btn-sm', disabled: props.busy, onClick: function () { props.onLike(item); } }, '♥'),
      ),
    ),
  );
}

function PublicMarketGrid(props) {
  var gh = props.gh || {};
  if (gh.loading && !(gh.items || []).length) return h('div', { className: 'rm-loading' }, '正在从 GitHub 读取公共市场…');
  if (!(gh.items || []).length) {
    return h(
      'div',
      { className: 'rm-empty' },
      gh.error ? '暂时连不上公共市场：' + (gh.error.message || gh.error.code || '未知错误') : '公共市场里还没有模板。做一份喜欢的简历，然后发布成公共模板吧。',
      h('div', { className: 'rm-hint', style: { marginTop: '8px' } }, '公共市场就是 GitHub 仓库里的 market/ 目录；投稿用「发布到市场」里的「同时生成公共投稿」。'),
    );
  }
  return h(
    'div',
    { className: 'rm-grid' },
    (gh.items || []).map(function (item) {
      return h(PublicMarketCard, {
        key: item.id,
        item: item,
        installed: (props.installedIds || []).indexOf(item.id) >= 0,
        likes: (gh.likes || {})[item.id] || 0,
        busy: props.busyId === 'gh:' + item.id,
        onInstall: props.onInstall,
        onLike: props.onLike,
      });
    }),
  );
}

function MarketView(props) {
  var entries = props.market || [];
  var installedIds = props.installedTemplateIds || [];
  var source = props.source === 'public' ? 'public' : 'local';
  var gh = props.gh || { loading: false, items: [], likes: {}, stale: false, error: null };
  var body;
  if (source === 'public') {
    body = h(PublicMarketGrid, {
      gh: gh,
      installedIds: props.ghInstalledIds || [],
      busyId: props.busyId,
      onInstall: props.onGhInstall,
      onLike: props.onGhLike,
    });
  } else if (props.loading) {
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
      }),
    );
  }
  var title = source === 'public' ? '公共市场 · GitHub' : '大肥鱼模板市场';
  var hint =
    source === 'public'
      ? '大家的作品都放在 ' + (props.repo || 'GitHub 仓库') + ' 里，点安装即可套用' + (gh.stale ? '（当前显示离线缓存）' : '')
      : '免费模板 · 安装即用 · 一键发布你的作品，让其他装了插件的用户也能用';
  return h(
    'div',
    { className: 'rm-col', style: { width: '100%', minHeight: 0, overflow: 'auto' } },
    h(
      'div',
      { className: 'rm-row', style: { padding: '14px 18px 0' } },
      h('div', { className: 'rm-col' }, h('b', { style: { fontSize: '13px' } }, title), h('span', { className: 'rm-hint' }, hint)),
      h(
        'div',
        { style: { marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' } },
        h(
          'div',
          { className: 'rm-seg' },
          h(
            'button',
            { type: 'button', className: 'rm-seg-btn' + (source === 'local' ? ' is-on' : ''), onClick: function () { props.onSourceChange('local'); } },
            '本地面板',
          ),
          h(
            'button',
            { type: 'button', className: 'rm-seg-btn' + (source === 'public' ? ' is-on' : ''), onClick: function () { props.onSourceChange('public'); } },
            '公共市场',
          ),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'rm-btn rm-btn-sm',
            onClick: source === 'public' ? props.onGhRefresh : props.onRefresh,
            disabled: source === 'public' ? !!gh.loading : !!props.loading,
          },
          '刷新',
        ),
        source === 'local' && props.onPublishResume
          ? h(
              'button',
              { type: 'button', className: 'rm-btn rm-btn-sm rm-btn-primary', onClick: props.onPublishResume },
              '发布简历到市场'
            )
          : null,
      ),
    ),
    body,
  );
}
