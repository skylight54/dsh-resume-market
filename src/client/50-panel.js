/**
 * 简历市场 client — 50 主面板。
 * 负责：加载 store 状态、左侧结构化编辑 + 右侧 A4 预览、模板库、市场、设置、发布弹窗。
 */

function Toast(props) {
  if (!props.toast) return null;
  return h('div', { className: 'rm-toast' + (props.toast.isErr ? ' is-err' : '') }, props.toast.msg);
}

var EXPORT_LABEL = { html: 'HTML', doc: 'Word 文档 (.docx)', pdf: 'PDF' };
var EXPORT_HINT = {
  html: 'HTML 文件：双击用浏览器打开，Ctrl/Cmd+P 也能再存成 PDF。',
  doc: 'Word 文档：真正的 .docx，双击用 Word / WPS 打开即可，版式（页眉色带 / 模块标题色块 / 左右对齐）都已还原。',
  pdf: 'PDF：按 A4 排版、已在本地生成好，可以直接投递或打印。',
};

function ExportDialog(props) {
  var info = props.info || {};
  var format = info.format || 'html';
  return h(
    'div',
    { className: 'rm-modal', onMouseDown: function (event) { if (event.target === event.currentTarget) props.onClose(); } },
    h(
      'div',
      { className: 'rm-modal-card' },
      h(
        'div',
        { className: 'rm-modal-h' },
        h('h3', null, '已导出 ' + (EXPORT_LABEL[format] || format)),
        h('span', { className: 'rm-muted', style: { marginLeft: 'auto', fontSize: '11px' } }, info.name || ''),
      ),
      h(
        'div',
        { className: 'rm-modal-b rm-col' },
        h('div', { className: 'rm-hint' }, '文件已写到本机的导出目录（不是浏览器的下载文件夹）。路径在下面，可以直接复制，或打开所在文件夹。'),
        h('div', { className: 'rm-path' }, info.path || ''),
        h(
          'div',
          { className: 'rm-path-row' },
          h('button', { type: 'button', className: 'rm-btn rm-btn-primary', onClick: function () { props.onReveal(info.path); } }, '打开所在文件夹'),
          h(
            'button',
            { type: 'button', className: 'rm-btn', onClick: function () { rmCopyText(info.path || '').then(function () { props.onToast('路径已复制'); }, function () { props.onToast('复制失败，请手动选中路径', true); }); } },
            '复制路径'
          ),
        ),
        h('div', { className: 'rm-hint' }, EXPORT_HINT[format] || EXPORT_HINT.html),
        h(
          'div',
          { className: 'rm-path-row' },
          h('span', { className: 'rm-muted', style: { fontSize: '11px', alignSelf: 'center' } }, '换个格式再导一份：'),
          ['html', 'doc', 'pdf'].filter(function (f) { return f !== format; }).map(function (f) {
            return h(
              'button',
              { key: f, type: 'button', className: 'rm-btn rm-btn-sm', onClick: function () { props.onExport(f); } },
              EXPORT_LABEL[f],
            );
          }),
        ),
      ),
      h('div', { className: 'rm-modal-f' }, h('button', { type: 'button', className: 'rm-btn', onClick: props.onClose }, '知道了')),
    ),
  );
}

function PublishDialog(props) {
  var resume = props.resume;
  var first = useState({
    title: resume ? resume.title : '',
    tagline: '',
    tags: '',
    desc: '',
    includeSample: !!props.includeSampleDefault,
    remote: !!props.canRemote,
    publishPublic: false,
  });
  var form = first[0];
  var setForm = first[1];
  function set(key) {
    return function (value) {
      var next = Object.assign({}, form);
      next[key] = value;
      setForm(next);
    };
  }
  function submit() {
    if (!form.title.trim()) return;
    props.onSubmit({
      resumeId: resume.id,
      title: form.title.trim(),
      tagline: form.tagline.trim(),
      tags: form.tags,
      desc: form.desc.trim(),
      includeSample: !!form.includeSample,
      remote: !!form.remote,
      publishPublic: !!form.publishPublic,
    });
  }
  return h(
    'div',
    { className: 'rm-modal', onMouseDown: function (event) { if (event.target === event.currentTarget) props.onClose(); } },
    h(
      'div',
      { className: 'rm-modal-card' },
      h('div', { className: 'rm-modal-h' }, h('h3', null, '发布到模板市场'), h('span', { className: 'rm-muted', style: { marginLeft: 'auto', fontSize: '11px' } }, '其他装了本插件的用户可从市场一键安装')),
      h(
        'div',
        { className: 'rm-modal-b' },
        h(
          'div',
          { className: 'rm-col' },
          h(Field, { label: '模板名称', value: form.title, placeholder: '例如：极简商务 · 产品经理版', onChange: set('title') }),
          h(Field, { label: '一句话卖点', value: form.tagline, placeholder: '适合互联网产品岗，个人信息两列排布', onChange: set('tagline') }),
          h(Field, { label: '标签（逗号分隔）', value: form.tags, placeholder: '商务、产品经理、中文', onChange: set('tags') }),
          h(Area, { label: '详细描述', rows: 3, value: form.desc, placeholder: '这个模板适合谁、排版特点…', onChange: set('desc') }),
          h(
            'label',
            { className: 'rm-check' },
            h('input', { type: 'checkbox', checked: !!form.includeSample, onChange: function (event) { set('includeSample')(event.target.checked); } }),
            '把当前简历内容作为示例数据分享（默认只分享排版，示例用「大肥鱼」的假数据）'
          ),
          props.canRemote
            ? h(
                'label',
                { className: 'rm-check' },
                h('input', { type: 'checkbox', checked: !!form.remote, onChange: function (event) { set('remote')(event.target.checked); } }),
                '同时发布到远端市场：' + props.remoteHost
              )
            : null,
          h(
            'label',
            { className: 'rm-check' },
            h('input', { type: 'checkbox', checked: !!form.publishPublic, onChange: function (event) { set('publishPublic')(event.target.checked); } }),
            '同时生成 GitHub 公共投稿（公开到所有人的公共市场，由仓库维护者合并上架）'
          ),
          h('div', { className: 'rm-hint' }, '发布后，任何安装了本插件的用户都能在市场里安装这套模板。用户数据不会被上传。')
        )
      ),
      h(
        'div',
        { className: 'rm-modal-f' },
        h('button', { type: 'button', className: 'rm-btn', onClick: props.onClose, disabled: props.busy }, '取消'),
        h('button', { type: 'button', className: 'rm-btn rm-btn-primary', onClick: submit, disabled: props.busy }, props.busy ? '发布中…' : '发布')
      )
    )
  );
}

function PublicSubmitDialog(props) {
  var info = props.info || {};
  function copy() {
    rmCopyText(info.json || '').then(
      function () { props.onToast('已复制投稿 JSON'); },
      function (err) { props.onToast('复制失败：' + rmErrText(err), true); }
    );
  }
  return h(
    'div',
    { className: 'rm-modal', onMouseDown: function (event) { if (event.target === event.currentTarget) props.onClose(); } },
    h(
      'div',
      { className: 'rm-modal-card rm-modal-wide' },
      h(
        'div',
        { className: 'rm-modal-h' },
        h('h3', null, '公共投稿已生成'),
        h('span', { className: 'rm-muted', style: { marginLeft: 'auto', fontSize: '11px' } }, '合并进仓库后，所有装了本插件的人都能在公共市场安装')
      ),
      h(
        'div',
        { className: 'rm-modal-b' },
        h(
          'div',
          { className: 'rm-col' },
          h('div', { className: 'rm-hint' }, '目标文件：', h('code', { className: 'rm-mono' }, info.repoPath || '')),
          h('div', { className: 'rm-hint' }, '方式一：点「打开 Issue」把下面的 JSON 贴进去提交，仓库维护者合并后上架。'),
          h('div', { className: 'rm-hint' }, '方式二：点「新建模板文件」直接发起 PR，文件名和位置已经带在链接里。'),
          h('textarea', { className: 'rm-pub-json', readOnly: true, rows: 10, value: info.json || '' })
        )
      ),
      h(
        'div',
        { className: 'rm-modal-f' },
        h('button', { type: 'button', className: 'rm-btn', onClick: copy }, '复制 JSON'),
        h('button', { type: 'button', className: 'rm-btn', onClick: function () { window.open(info.issueUrl || '', '_blank'); } }, '打开 Issue'),
        h('button', { type: 'button', className: 'rm-btn', onClick: function () { window.open(info.newFileUrl || '', '_blank'); } }, '新建模板文件'),
        h('button', { type: 'button', className: 'rm-btn rm-btn-primary', onClick: props.onClose }, '知道了')
      )
    )
  );
}

/**
 * 设置页「兼容插件」卡片：列出可兼容的简历相关插件、检测装没装、支持跳转插件市场或直接安装。
 *
 * 状态来自 Host 的 GET /compat/state（只读扫 ~/.dsh/profiles，并发现已安装插件提供的工具）；
 * 「去插件市场」切到 DSH 自带插件市场面板（layout.selectPanel('dsh-market')）；
 * 「直接安装」走 POST /compat/install，由 Host 调 dsh plugin add，可能要几分钟。
 */
function CompatPluginsCard(baseProps) {
  var props = baseProps || {};
  var layout = props.layout || null;
  var state = useState({ status: 'loading', data: null, error: '', busy: '', results: {} });
  var view = state[0];
  var setView = state[1];

  function flash(message, isErr) {
    if (typeof props.onToast === 'function') props.onToast(message, isErr);
  }

  /** 切到 DSH 自带的插件市场面板；拿不到 layout 时退回打开 DSH 页面。 */
  function openMarket() {
    try {
      if (layout && typeof layout.selectPanel === 'function') {
        layout.selectPanel('dsh-market');
        flash('已切到插件市场面板（侧栏第一个图标）');
      } else {
        window.open('http://127.0.0.1:56292', '_blank');
        flash('已在新标签打开 DSH，插件市场在侧栏');
      }
    } catch (err) {
      flash('切换插件市场失败：' + rmErrText(err), true);
    }
  }

  function patch(patchValue) {
    setView(function (prev) {
      return Object.assign({}, prev, patchValue);
    });
  }

  function load() {
    patch({ status: 'loading', error: '' });
    rmApi('/compat/state').then(
      function (value) {
        patch({ status: 'ready', data: value, error: '' });
      },
      function (err) {
        patch({ status: 'error', error: rmErrText(err) });
      }
    );
  }

  useEffect(function () {
    load();
  }, []);

  function install(item) {
    patch({ busy: item.id, error: '' });
    rmApi('/compat/install', { method: 'POST', body: { id: item.id } }).then(
      function (result) {
        setView(function (prev) {
          var results = Object.assign({}, prev.results);
          results[item.id] = result;
          return Object.assign({}, prev, { busy: '', results: results });
        });
        // 装完重新检测一次，把「已安装」状态刷新出来
        return rmApi('/compat/state').then(
          function (value) {
            patch({ status: 'ready', data: value });
          },
          function () {
            /* 重检测失败不影响安装结果展示 */
          }
        );
      },
      function (err) {
        setView(function (prev) {
          var results = Object.assign({}, prev.results);
          results[item.id] = { ok: false, error: rmErrText(err) };
          return Object.assign({}, prev, { busy: '', results: results });
        });
      }
    );
  }

  function openHome(item) {
    try {
      window.open(item.homepage || '', '_blank');
    } catch (e) {
      rmLog('open homepage failed', e);
    }
  }

  /** 已安装插件提供的工具（Host 通过 tools 服务发现）：最多显示 4 个 chip + 「+N」。 */
  function renderCapabilities(item) {
    var caps = Array.isArray(item.capabilities) ? item.capabilities : [];
    if (!caps.length) {
      return h('div', { className: 'rm-hint' }, '未发现可调用能力（装完需重启 DSH）');
    }
    var shown = caps.slice(0, 4);
    var rest = caps.length - shown.length;
    return h(
      'div',
      { className: 'rm-row', style: { gap: '6px', flexWrap: 'wrap' } },
      shown.map(function (cap) {
        return h('span', { key: cap.name, className: 'rm-pill', title: cap.description || '' }, '工具：' + cap.name);
      }),
      rest > 0 ? h('span', { key: 'rest', className: 'rm-pill' }, '+' + rest) : null
    );
  }


  function renderItem(item) {
    var installed = !!item.installed;
    var planned = !!item.planned;
    var result = view.results[item.id] || null;
    var busy = view.busy === item.id;
    var actions = [];
    if (installed) {
      actions.push(
        h('button', { key: 'doc', type: 'button', className: 'rm-btn rm-btn-sm', onClick: function () { openHome(item); } }, '查看文档')
      );
    } else if (planned) {
      actions.push(h('button', { key: 'planned', type: 'button', className: 'rm-btn rm-btn-sm', disabled: true }, '暂未上线'));
    } else {
      // 主路径：切到插件市场面板里搜着装；兜底：本插件直接调 dsh plugin add。
      actions.push(
        h('button', { key: 'market', type: 'button', className: 'rm-btn rm-btn-primary rm-btn-sm', onClick: openMarket }, '去插件市场')
      );
      actions.push(
        h(
          'button',
          { key: 'install', type: 'button', className: 'rm-btn rm-btn-sm', disabled: busy || !!view.busy, onClick: function () { install(item); } },
          busy ? '安装中…' : '直接安装'
        )
      );
    }

    return h(
      'div',
      { key: item.id, className: 'rm-resume-row' },
      h(
        'div',
        { className: 'rm-resume-main' },
        h(
          'span',
          { className: 'rm-resume-title' },
          item.name,
          h('span', { className: 'rm-pill' }, item.kind || '插件'),
          installed
            ? h(
                'span',
                null,
                h('span', { className: 'rm-pill rm-pill-brand' }, '已安装 · 已启用'),
                item.version ? h('span', { className: 'rm-pill' }, 'v' + String(item.version).replace(/^[\^~]/, '')) : null
              )
            : planned
              ? h('span', { className: 'rm-pill rm-pill-warn' }, '即将上线')
              : null
        ),
        h('span', { className: 'rm-hint' }, item.blurb),
        item.tags && item.tags.length
          ? h(
              'div',
              { className: 'rm-row', style: { gap: '6px' } },
              item.tags.map(function (tag) {
                return h('span', { key: tag, className: 'rm-pill' }, tag);
              })
            )
          : null,
        installed ? renderCapabilities(item) : null,
        result && result.ok === false && result.error
          ? h('span', { className: 'rm-hint rm-text-danger' }, '安装失败：' + result.error)
          : null,
        result && result.ok === false && result.log && result.log.length
          ? h(
              'pre',
              { className: 'rm-mono', style: { whiteSpace: 'pre-wrap', margin: 0, maxHeight: '110px', overflow: 'auto' } },
              result.log.slice(-12).join('\n')
            )
          : null,
        result && result.ok && !result.skipped
          ? h('span', { className: 'rm-hint' }, '安装完成，重启 DSH 生效。')
          : null
      ),
      h(
        'div',
        { className: 'rm-resume-actions' },
        actions,
        h(
          'span',
          { className: 'rm-link rm-hint', onClick: function () { openHome(item); }, style: { cursor: 'pointer' } },
          '主页'
        )
      )
    );
  }

  var data = view.data || {};
  var items = Array.isArray(data.items) ? data.items : [];
  return h(
    'div',
    { className: 'rm-card' },
    h(
      'div',
      { className: 'rm-card-h' },
      h('h3', null, '兼容插件'),
      data.profile ? h('span', { className: 'rm-pill' }, 'profile：' + data.profile) : null,
      h(
        'div',
        { className: 'rm-tools' },
        h('button', { type: 'button', className: 'rm-btn rm-btn-sm', onClick: openMarket }, '打开插件市场'),
        h(
          'button',
          { type: 'button', className: 'rm-btn rm-btn-sm', disabled: view.status === 'loading', onClick: load },
          view.status === 'loading' ? '检测中…' : '重新检测'
        )
      )
    ),
    h(
      'div',
      { className: 'rm-card-b rm-col' },
      h(
        'div',
        { className: 'rm-hint' },
        '这些是独立的简历相关插件，和简历市场配合使用。安装由 DSH 插件管理器完成，可能要下载依赖、耗时数分钟。'
      ),
      view.status === 'loading' && !items.length ? h('div', { className: 'rm-hint' }, '正在检测已安装的插件…') : null,
      view.error ? h('div', { className: 'rm-hint rm-text-danger' }, '检测失败：' + view.error) : null,
      items.length ? h('div', { className: 'rm-list' }, items.map(renderItem)) : null,
      view.status === 'ready' && !items.length && !view.error
        ? h('div', { className: 'rm-hint' }, '暂时没有可用的兼容插件。')
        : null,
      h(
        'div',
        { className: 'rm-hint' },
        '装完重启 DSH 或刷新页面后生效；想加条目改源码里的 src/compat.js（COMPAT_CATALOG）。'
      ),
      h(
        'div',
        { className: 'rm-hint' },
        '「去插件市场」会切到 DSH 插件市场面板，在那里搜索安装更直观；「直接安装」由本插件调用 dsh plugin add 完成。'
      ),
      data.dshHome ? h('div', { className: 'rm-hint rm-mono' }, '检测目录：' + data.dshHome) : null
    )
  );
}

function SettingsView(props) {
  var settings = props.settings || {};
  var first = useState({
    author: settings.author || '',
    marketUrl: settings.marketUrl || '',
    marketToken: settings.marketToken || '',
    includeSampleByDefault: !!settings.includeSampleByDefault,
    chatTools: !!settings.chatTools,
    chatApiKey: settings.chatApiKey || '',
    chatModel: settings.chatModel || 'deepseek-chat',
    chatBaseUrl: settings.chatBaseUrl || 'https://api.deepseek.com',
    githubRepo: settings.githubRepo || 'skylight54/dsh-resume-market',
    githubBranch: settings.githubBranch || 'main',
    githubProxy: settings.githubProxy || '',
  });
  var form = first[0];
  var setForm = first[1];
  function set(key) {
    return function (value) {
      var next = Object.assign({}, form);
      next[key] = value;
      setForm(next);
    };
  }
  function submit() {
    props.onSave({
      author: form.author.trim() || '我',
      marketUrl: form.marketUrl.trim(),
      marketToken: form.marketToken.trim(),
      includeSampleByDefault: !!form.includeSampleByDefault,
      chatTools: !!form.chatTools,
      chatApiKey: form.chatApiKey.trim(),
      chatModel: form.chatModel.trim() || 'deepseek-chat',
      chatBaseUrl: form.chatBaseUrl.trim() || 'https://api.deepseek.com',
      githubRepo: form.githubRepo.trim() || 'skylight54/dsh-resume-market',
      githubBranch: form.githubBranch.trim() || 'main',
      githubProxy: form.githubProxy.trim(),
    });
  }
  return h(
    'div',
    { className: 'rm-form' },
    h(
      'div',
      { className: 'rm-card' },
      h('div', { className: 'rm-card-h' }, h('h3', null, '市场设置')),
      h(
        'div',
        { className: 'rm-card-b rm-col' },
        h(Field, { label: '我的署名（发布时显示）', value: form.author, placeholder: '大肥鱼', onChange: set('author') }),
        h(Field, { label: '远端市场地址（可选）', value: form.marketUrl, placeholder: 'http://127.0.0.1:8787', onChange: set('marketUrl') }),
        h(Field, { label: '发布密钥（远端市场需要时）', value: form.marketToken, type: 'password', placeholder: '可留空', onChange: set('marketToken') }),
        h(Field, { label: '公共市场仓库（GitHub）', value: form.githubRepo, placeholder: 'skylight54/dsh-resume-market', onChange: set('githubRepo') }),
        h(Field, { label: '公共市场分支', value: form.githubBranch, placeholder: 'main', onChange: set('githubBranch') }),
        h(Field, { label: 'GitHub 加速前缀（国内可填）', value: form.githubProxy, placeholder: '例如 https://gh-proxy.com/', onChange: set('githubProxy') }),
        h(
          'label',
          { className: 'rm-check' },
          h('input', { type: 'checkbox', checked: !!form.includeSampleByDefault, onChange: function (event) { set('includeSampleByDefault')(event.target.checked); } }),
          '发布时默认附带简历内容作为示例'
        ),
        h(
          'div',
          { className: 'rm-row' },
          h(
            'button',
            {
              type: 'button',
              className: 'rm-btn rm-btn-primary',
              disabled: props.busy,
              onClick: submit,
            },
            props.busy ? '保存中…' : '保存设置'
          ),
          h('span', { className: 'rm-hint' }, '远端市场可用插件自带的 server/market-server.js 启动，或换成你自己的地址')
        )
      )
    ),
    h(
      'div',
      { className: 'rm-card' },
      h('div', { className: 'rm-card-h' }, h('h3', null, 'AI 对话')),
      h(
        'div',
        { className: 'rm-card-b rm-col' },
        h(
          'div',
          { className: 'rm-hint' },
          '免 Key 默认用当前 DSH 模型：编辑界面右下角的「AI 对话」浮动按钮直接就能用，不额外收费、不用在这里填任何东西。'
        ),
        h(Field, {
          label: 'API Key（可留空）',
          value: form.chatApiKey,
          type: 'password',
          placeholder: 'sk-…（留空就用当前 DSH 模型）',
          onChange: set('chatApiKey'),
        }),
        h(Field, { label: '模型（填了 Key 才生效）', value: form.chatModel, placeholder: 'deepseek-chat', onChange: set('chatModel') }),
        h(Field, {
          label: 'Base URL（填了 Key 才生效）',
          value: form.chatBaseUrl,
          placeholder: 'https://api.deepseek.com',
          onChange: set('chatBaseUrl'),
        }),
        h('div', { className: 'rm-hint' }, '想让简历对话走独立的 DeepSeek API（独立计费）再填上面的 Key；Key 只保存在本机的 store.json，不会随简历/模板上传。'),
        h(
          'label',
          { className: 'rm-check' },
          h('input', {
            type: 'checkbox',
            checked: !!form.chatTools,
            onChange: function (event) {
              set('chatTools')(event.target.checked);
            },
          }),
          '允许 AI 对话调用已安装插件的工具（实验）'
        ),
        h('div', { className: 'rm-hint' }, '勾选后，AI 对话可以调用「兼容插件」里已安装插件提供的工具（如筛选、迁移）；装完新插件需重启 DSH 生效。'),
        h(
          'div',
          { className: 'rm-row' },
          h('button', { type: 'button', className: 'rm-btn rm-btn-primary', disabled: props.busy, onClick: submit }, props.busy ? '保存中…' : '保存设置')
        )
      )
    ),
    h(
      'div',
      { className: 'rm-card' },
      h('div', { className: 'rm-card-h' }, h('h3', null, '本地数据')),
      h(
        'div',
        { className: 'rm-card-b rm-col' },
        h('div', { className: 'rm-hint' }, '所有简历与模板都保存在本机，不会自动上传任何内容。'),
        h('div', { className: 'rm-hint rm-mono' }, props.storeFile || ''),
        h('div', { className: 'rm-row' }, h('span', { className: 'rm-pill' }, '简历 ' + (props.resumeCount || 0) + ' 份'), h('span', { className: 'rm-pill' }, '已装模板 ' + (props.templateCount || 0) + ' 套'), h('span', { className: 'rm-pill' }, '市场模板 ' + (props.marketCount || 0) + ' 套'))
      )
    ),
    h(CompatPluginsCard, { layout: props.layout || null, onToast: props.onToast })
  );
}

function ResumePanel(props) {
  var panelProps = props || {};
  var bootState = useState({ status: 'loading' });
  var boot = bootState[0];
  var setBoot = bootState[1];
  var tabState = useState('editor');
  var tab = tabState[0];
  var setTab = tabState[1];
  var draftState = useState(null);
  var draft = draftState[0];
  var setDraft = draftState[1];
  var toastState = useState(null);
  var toast = toastState[0];
  var setToast = toastState[1];
  var busyState = useState('');
  var busy = busyState[0];
  var setBusy = busyState[1];
  var savingState = useState('');
  var saving = savingState[0];
  var setSaving = savingState[1];
  var publishState = useState(false);
  var publishOpen = publishState[0];
  var setPublishOpen = publishState[1];
  var remoteState = useState({ loading: false, entries: [], error: '' });
  var remote = remoteState[0];
  var setRemote = remoteState[1];
  var exportState = useState(null);
  var exportInfo = exportState[0];
  var setExportInfo = exportState[1];
  var exportMenuState = useState(false);
  var exportMenuOpen = exportMenuState[0];
  var setExportMenu = exportMenuState[1];
  var revState = useState({ open: false, resume: null, loading: false, revisions: [] });
  var rev = revState[0];
  var setRev = revState[1];
  var ghState = useState({ loading: false, items: [], likes: {}, stale: false, error: null, fetchedAt: '', repo: '' });
  var gh = ghState[0];
  var setGh = ghState[1];
  var marketSourceState = useState('local');
  var marketSource = marketSourceState[0];
  var setMarketSource = marketSourceState[1];
  var publicSubmissionState = useState(null);
  var publicSubmission = publicSubmissionState[0];
  var setPublicSubmission = publicSubmissionState[1];
  // 模板库：编辑器 / 图片生成初稿 / 发布模板 / 大图预览
  var templateEditorState = useState(null);
  var templateEditor = templateEditorState[0];
  var setTemplateEditor = templateEditorState[1];
  var templateImportState = useState(false);
  var templateImportOpen = templateImportState[0];
  var setTemplateImportOpen = templateImportState[1];
  var templatePublishState = useState(null);
  var templatePublish = templatePublishState[0];
  var setTemplatePublish = templatePublishState[1];
  var templatePreviewState = useState(null);
  var templatePreview = templatePreviewState[0];
  var setTemplatePreview = templatePreviewState[1];

  var saveTimer = useRef(null);
  var toastTimer = useRef(null);

  function flash(message, isErr) {
    setToast({ msg: message, isErr: !!isErr });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(function () {
      setToast(null);
    }, 2800);
  }

  function applyState(value) {
    var resumes = value.resumes || [];
    setBoot({
      status: 'ready',
      settings: value.settings || {},
      resumes: resumes,
      templates: value.templates || [],
      deleted: value.deleted || [],
      market: value.market || [],
      storeFile: value.storeFile || '',
    });
    setDraft(function (prev) {
      if (prev) {
        var found = null;
        resumes.forEach(function (resume) {
          if (resume.id === prev.id) found = resume;
        });
        if (found) return found;
      }
      return resumes.length ? resumes[0] : null;
    });
  }

  var reload = useCallback(function () {
    return rmApi('/state').then(function (value) {
      applyState(value);
    });
  }, []);

  useEffect(function () {
    var alive = true;
    rmApi('/state').then(
      function (value) {
        if (alive) applyState(value);
      },
      function (err) {
        if (alive) setBoot({ status: 'error', error: rmErrText(err) });
      }
    );
    return function () {
      alive = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function persist(resume, quiet) {
    setSaving('saving');
    return rmApi('/resume', { method: 'POST', body: { resume: resume } }).then(
      function (value) {
        return value.resume;
      }
    ).then(
      function (saved) {
        setSaving('');
        setDraft(function (prev) {
          if (prev && prev.id === saved.id) return saved;
          return prev;
        });
        setBoot(function (prev) {
          if (!prev || prev.status !== 'ready') return prev;
          var list = prev.resumes.map(function (item) {
            return item.id === saved.id ? saved : item;
          });
          return Object.assign({}, prev, { resumes: list });
        });
        if (!quiet) flash('已保存');
      },
      function (err) {
        setSaving('');
        flash('保存失败：' + rmErrText(err), true);
      }
    );
  }

  function scheduleSave(next) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(function () {
      saveTimer.current = null;
      persist(next, true);
    }, 900);
  }

  function updateDraft(patch) {
    setDraft(function (prev) {
      if (!prev) return prev;
      var next = Object.assign({}, prev, patch);
      scheduleSave(next);
      return next;
    });
  }

  function createResume() {
    if (busy) return;
    setBusy('create');
    var templateId = draft && draft.templateId ? draft.templateId : 'business-minimal';
    rmApi('/resume', { method: 'POST', body: { templateId: templateId, data: rmBlankData() } }).then(
      function (value) {
        return value.resume;
      }
    ).then(
      function (resume) {
        setBusy('');
        setDraft(resume);
        setBoot(function (prev) {
          if (!prev || prev.status !== 'ready') return prev;
          return Object.assign({}, prev, { resumes: [resume].concat(prev.resumes) });
        });
        setTab('editor');
        flash('已新建一份空白简历');
      },
      function (err) {
        setBusy('');
        flash('新建失败：' + rmErrText(err), true);
      }
    );
  }

  function removeResumeById(id) {
    var title = '';
    (boot.resumes || []).forEach(function (item) { if (item.id === id) title = item.title; });
    if (typeof window !== 'undefined' && !window.confirm('把《' + (title || '这份简历') + '》移到回收站？之后可以在「我的简历」里恢复。')) return;
    setBusy('delete');
    rmApi('/resume?id=' + encodeURIComponent(id), { method: 'DELETE' }).then(
      function () {
        setBusy('');
        return reload().then(function () {
          flash('已移到回收站（「我的简历」里可恢复）');
        });
      },
      function (err) {
        setBusy('');
        flash('删除失败：' + rmErrText(err), true);
      }
    );
  }

  function removeResume() {
    if (!draft) return;
    removeResumeById(draft.id);
  }

  function openResume(id) {
    var found = null;
    (boot.resumes || []).forEach(function (item) { if (item.id === id) found = item; });
    if (!found) return;
    setDraft(found);
    setTab('editor');
    flash('已打开《' + found.title + '》');
  }

  function renameResume(id, title) {
    var item = null;
    (boot.resumes || []).forEach(function (r) { if (r.id === id) item = r; });
    if (!item) return;
    rmApi('/resume', { method: 'POST', body: { resume: Object.assign({}, item, { title: title }) } }).then(
      function (value) { return value.resume; }
    ).then(
      function (saved) {
        setBoot(function (prev) {
          if (!prev || prev.status !== 'ready') return prev;
          return Object.assign({}, prev, { resumes: prev.resumes.map(function (r) { return r.id === saved.id ? saved : r; }) });
        });
        setDraft(function (prev) { return prev && prev.id === saved.id ? saved : prev; });
        flash('已重命名');
      },
      function (err) { flash('重命名失败：' + rmErrText(err), true); }
    );
  }

  function restoreResume(id) {
    setBusy('restore');
    rmApi('/resume/restore', { method: 'POST', body: { id: id } }).then(
      function () { setBusy(''); return reload().then(function () { flash('已恢复到「我的简历」'); }); },
      function (err) { setBusy(''); flash('恢复失败：' + rmErrText(err), true); }
    );
  }

  function purgeResume(id) {
    if (typeof window !== 'undefined' && !window.confirm('彻底删除后无法恢复，确定吗？')) return;
    setBusy('purge');
    rmApi('/resume/purge', { method: 'POST', body: { id: id } }).then(
      function () { setBusy(''); return reload().then(function () { flash('已彻底删除'); }); },
      function (err) { setBusy(''); flash('彻底删除失败：' + rmErrText(err), true); }
    );
  }

  function openRevisions(resume) {
    setRev({ open: true, resume: resume, loading: true, revisions: [] });
    rmApi('/resume/revisions?id=' + encodeURIComponent(resume.id)).then(
      function (value) { return value.revisions || []; }
    ).then(
      function (revisions) {
        setRev(function (prev) { return Object.assign({}, prev, { loading: false, revisions: revisions }); });
      },
      function (err) {
        setRev(function (prev) { return Object.assign({}, prev, { loading: false, revisions: [] }); });
        flash('读取历史版本失败：' + rmErrText(err), true);
      }
    );
  }

  function restoreRevision(revisionId) {
    if (!rev.resume) return;
    setBusy('revision');
    rmApi('/resume/restore-revision', { method: 'POST', body: { id: rev.resume.id, revisionId: revisionId } }).then(
      function (value) { return value.resume; }
    ).then(
      function () {
        setBusy('');
        setRev({ open: false, resume: null, loading: false, revisions: [] });
        return reload().then(function () { flash('已恢复到历史版本'); });
      },
      function (err) { setBusy(''); flash('恢复失败：' + rmErrText(err), true); }
    );
  }

  /** PDF 在浏览器里渲染，再把字节交给 Host 落盘：不依赖本机浏览器无头打印。 */
  function renderPdf() {
    var template = rmResolveTemplate(draft.templateId, boot.templates);
    return rmPdfBase64(draft, template).then(function (data) {
      return rmApi('/export/pdf', { method: 'POST', body: { id: draft.id, data: data } });
    });
  }

  /** 最后的兜底：打开打印视图，让用户在对话框里「另存为 PDF」。 */
  function openPrintView() {
    try {
      window.open(API + '/export?id=' + encodeURIComponent(draft.id) + '&print=1', '_blank');
      flash('已打开打印视图：在打印对话框里选择「另存为 PDF」');
    } catch (err) {
      flash('导出失败：' + rmErrText(err), true);
    }
  }

  function saveExport(format) {
    if (!draft || busy) return;
    var target = format || 'html';
    setExportMenu(false);
    setBusy('export');
    var task = target === 'pdf'
      ? renderPdf().then(
        function (info) { return info; },
        function (err) {
          rmLog('本地渲染 PDF 失败，改试 Host 转换：' + rmErrText(err));
          return rmApi('/export', { method: 'POST', body: { id: draft.id, format: 'pdf' } });
        },
      )
      : rmApi('/export', { method: 'POST', body: { id: draft.id, format: target } });
    task.then(
      function (info) {
        setBusy('');
        setExportInfo(info);
        flash('已导出 ' + (EXPORT_LABEL[info.format] || target) + '：' + info.path);
      },
      function (err) {
        setBusy('');
        if (target === 'pdf') openPrintView();
        else flash('导出失败：' + rmErrText(err), true);
      }
    );
  }

  function revealExportPath(targetPath) {
    if (!targetPath) return;
    rmApi('/export/reveal', { method: 'POST', body: { path: targetPath } }).then(
      function () { flash('已在文件管理器里打开'); },
      function (err) { flash('打开文件夹失败：' + rmErrText(err), true); }
    );
  }

  function duplicateResume() {
    if (!draft || busy) return;
    setBusy('duplicate');
    rmApi('/resume/duplicate', { method: 'POST', body: { id: draft.id } }).then(
      function (value) {
        return value.resume;
      }
    ).then(
      function (resume) {
        setBusy('');
        setDraft(resume);
        setBoot(function (prev) {
          if (!prev || prev.status !== 'ready') return prev;
          return Object.assign({}, prev, { resumes: [resume].concat(prev.resumes) });
        });
        flash('已复制一份');
      },
      function (err) {
        setBusy('');
        flash('复制失败：' + rmErrText(err), true);
      }
    );
  }

  function applyTemplate(template) {
    if (!draft) {
      if (busy) return;
      setBusy('create');
      rmApi('/resume', { method: 'POST', body: { templateId: template.id, data: rmBlankData() } }).then(
        function (value) {
          return value.resume;
        }
      ).then(
        function (resume) {
          setBusy('');
          setDraft(resume);
          setBoot(function (prev) {
            if (!prev || prev.status !== 'ready') return prev;
            return Object.assign({}, prev, { resumes: [resume].concat(prev.resumes) });
          });
          setTab('editor');
        },
        function (err) {
          setBusy('');
          flash('新建失败：' + rmErrText(err), true);
        }
      );
      return;
    }
    updateDraft({ templateId: template.id });
    persist(Object.assign({}, draft, { templateId: template.id }), true);
    flash('已切换到「' + template.name + '」');
  }

  /* ---------- 模板库：新建 / 编辑 / 复制 / 删除 / 发布 ---------- */

  // 把一套模板转成编辑器初值：样式取模板自带 style；复制/新建时换一个全新的根类名。
  function buildTemplateInitial(template, mode) {
    var isEdit = mode === 'edit' && !!(template && template.id);
    var style = isEdit || mode === 'copy' ? rmTemplateStyle(template) : rmStyleDefaults();
    var name = mode === 'copy'
      ? String((template && template.name) || '模板') + ' 副本'
      : isEdit ? template.name : '未命名模板';
    var cls = isEdit ? rmStyleClass(template.cls || template.id) : rmNewStyleClass(name);
    var css = '';
    if (template && typeof template.css === 'string' && template.css.trim()) {
      css = rmRewriteCssRoot(template.css, templateClass(template), cls);
    }
    if (!css || css.indexOf('.' + cls) < 0) css = rmStyleToCss(style, cls);
    return {
      id: isEdit ? template.id : '',
      name: name,
      en: template ? template.en || '' : '',
      tagline: template ? template.tagline || '' : '',
      tags: template && Array.isArray(template.tags) ? template.tags.slice(0, 5) : [],
      cls: cls,
      css: css,
      style: style,
      sample: template && template.sample ? template.sample : DEMO_RESUME_DATA,
    };
  }

  function openTemplateCreate() {
    setTemplateEditor({ key: 'create-' + Date.now(), title: '新建模板', initial: buildTemplateInitial(null, 'create'), error: '' });
  }

  function openTemplateCopy(template) {
    if (!template) return;
    setTemplateEditor({ key: 'copy-' + (template.id || '') + '-' + Date.now(), title: '复制为新模板', initial: buildTemplateInitial(template, 'copy'), error: '' });
  }

  function openTemplateEdit(template) {
    if (!template) return;
    // 内置模板不能直接改：自动走「复制为新模板」，和产品语义一致。
    if (template.builtin) {
      openTemplateCopy(template);
      flash('内置模板不能直接修改，已复制成新模板');
      return;
    }
    if (!template.id) {
      flash('这个模板还没有 id，无法编辑', true);
      return;
    }
    setTemplateEditor({ key: 'edit-' + template.id, title: '编辑模板', initial: buildTemplateInitial(template, 'edit'), error: '' });
  }

  function openTemplateImport() {
    setTemplateImportOpen(true);
  }

  function openTemplatePreview(template) {
    if (template) setTemplatePreview(template);
  }

  function applyTemplateAnalysis(analysis) {
    var style = rmStyleFromAnalysis(analysis);
    var fromFile = !!(analysis && analysis.sample);
    var name = (analysis && analysis.name) || (fromFile ? '文件生成初稿' : '图片生成初稿');
    var cls = rmNewStyleClass(name);
    setTemplateImportOpen(false);
    setTemplateEditor({
      key: 'import-' + Date.now(),
      title: fromFile ? '新建模板（文件初稿）' : '新建模板（图片初稿）',
      initial: {
        name: name,
        en: '',
        tagline: (analysis && analysis.tagline) || (fromFile ? '从文件解析生成的初稿' : '从图片取色生成的初稿'),
        tags: [],
        cls: cls,
        css: rmStyleToCss(style, cls),
        style: style,
        sample: (analysis && analysis.sample) || DEMO_RESUME_DATA,
      },
      error: '',
    });
    flash(fromFile ? '已按文件解析结果生成初稿，可以继续微调' : '已按图片主色生成初稿，可以继续微调');
  }

  function saveTemplate(payload, publish) {
    if (busy || !payload) return;
    setBusy('template-save');
    rmApi('/template/save', { method: 'POST', body: { template: payload } }).then(
      function (value) {
        return (value && value.template) || payload;
      }
    ).then(function (saved) {
      var savedCls = templateClass(saved);
      // 服务端会给新模板分配 cls=rm-t-<id>：若和我们生成的 CSS 根不一致，用返回的 cls 重写 CSS 再存一次。
      if (saved && typeof saved.css === 'string' && saved.css.indexOf('.' + savedCls) < 0) {
        var fixedCss = rmStyleToCss(payload.style || (saved && saved.style) || null, savedCls);
        var fixed = Object.assign({}, payload, { id: saved.id, cls: savedCls, css: fixedCss });
        return rmApi('/template/save', { method: 'POST', body: { template: fixed } }).then(
          function (value) {
            return (value && value.template) || Object.assign({}, saved, { css: fixedCss });
          }
        );
      }
      return saved;
    }).then(function (saved) {
      setBusy('');
      setTemplateEditor(null);
      return reload().then(function () {
        if (publish && saved && saved.id) {
          setTemplatePublish(saved);
        } else {
          flash('模板已保存：' + ((saved && saved.name) || payload.name));
        }
      });
    }, function (err) {
      setBusy('');
      var code = err && err.code;
      var message = rmErrText(err);
      if (code === 'template/builtin') message = '内置模板不能直接修改，先「复制为新模板」再改';
      setTemplateEditor(function (prev) {
        return prev ? Object.assign({}, prev, { error: message }) : prev;
      });
      flash(message, true);
    });
  }

  function removeTemplate(template) {
    if (!template || !template.id || busy) return;
    if (typeof window !== 'undefined' && window.confirm && !window.confirm('删除模板「' + template.name + '」？已经用过它的简历不受影响。')) return;
    setBusy('template-delete');
    rmApi('/template?id=' + encodeURIComponent(template.id), { method: 'DELETE' }).then(
      function () {
        setBusy('');
        return reload().then(function () {
          flash('模板已删除');
        });
      },
      function (err) {
        setBusy('');
        flash('删除失败：' + rmErrText(err), true);
      }
    );
  }

  function submitTemplatePublish(payload) {
    if (busy || !payload || !payload.templateId) return;
    var publishing = templatePublish || {};
    setBusy('template-publish');
    rmApi('/template/publish', {
      method: 'POST',
      body: {
        templateId: payload.templateId,
        title: payload.title,
        tagline: payload.tagline,
        tags: payload.tags,
        desc: payload.desc,
        includeSample: !!payload.includeSample,
        sample: publishing.sample || undefined,
      },
    }).then(function () {
      if (!payload.publishGh) return null;
      return rmApi('/github/publish-template', {
        method: 'POST',
        body: {
          templateId: payload.templateId,
          name: payload.title,
          tagline: payload.tagline,
          tags: payload.tags,
          includeSample: !!payload.includeSample,
          sample: publishing.sample || undefined,
        },
      }).then(function (info) {
        setPublicSubmission(info);
        return info;
      });
    }).then(
      function () {
        setBusy('');
        setTemplatePublish(null);
        setMarketSource('local');
        return reload().then(function () {
          setTab('market');
          flash('模板已发布到本地市场' + (payload.publishGh ? '，公共投稿已生成' : ''));
        });
      },
      function (err) {
        setBusy('');
        flash('发布失败：' + rmErrText(err), true);
        setTemplatePublish(function (prev) {
          return prev ? Object.assign({}, prev, { error: rmErrText(err) }) : prev;
        });
      }
    );
  }

  function remoteBase() {
    return boot.settings && boot.settings.marketUrl ? String(boot.settings.marketUrl).replace(/\/+$/, '') : '';
  }

  function remoteLocalId(entry) {
    return 'rm-' + String(entry.remoteId || entry.id || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  }

  function installEntry(entry) {
    if (busy) return;
    setBusy(entry.id);
    var body;
    if (entry.source === 'remote') {
      body = {
        template: {
          id: remoteLocalId(entry),
          name: entry.name || '市场模板',
          tagline: entry.tagline || '',
          tags: entry.tags || [],
          css: entry.css || '',
        },
      };
    } else {
      body = { id: entry.id };
    }
    rmApi('/template/install', { method: 'POST', body: body }).then(
      function () {
        setBusy('');
        if (entry.source === 'remote' && entry.remoteId) {
          fetch(remoteBase() + '/api/templates/' + encodeURIComponent(entry.remoteId) + '/download', { method: 'POST' }).catch(function () {
            /* 下载计数失败不影响安装 */
          });
        }
        return reload().then(function () {
          flash('已安装「' + (entry.name || '模板') + '」，去模板库看看');
          setTab('templates');
        });
      },
      function (err) {
        setBusy('');
        flash('安装失败：' + rmErrText(err), true);
      }
    );
  }

  function likeEntry(entry) {
    if (entry.source === 'remote') {
      if (!entry.remoteId) return;
      fetch(remoteBase() + '/api/templates/' + encodeURIComponent(entry.remoteId) + '/like', { method: 'POST' })
        .then(function () {
          loadRemote();
        })
        .catch(function (err) {
          flash('点赞失败：' + rmErrText(err), true);
        });
      return;
    }
    rmApi('/market/like', { method: 'POST', body: { id: entry.id } }).then(
      function () {
        reload();
      },
      function (err) {
        flash('点赞失败：' + rmErrText(err), true);
      }
    );
  }

  function unpublishEntry(entry) {
    if (entry.source === 'remote') {
      if (!entry.remoteId) return;
      var headers = {};
      var token = boot.settings && boot.settings.marketToken ? String(boot.settings.marketToken) : '';
      if (token) headers.authorization = 'Bearer ' + token;
      fetch(remoteBase() + '/api/templates/' + encodeURIComponent(entry.remoteId), { method: 'DELETE', headers: headers })
        .then(function (res) {
          if (!res.ok) throw new Error('远端返回 ' + res.status);
          loadRemote();
          flash('已从远端市场下架');
        })
        .catch(function (err) {
          flash('远端下架失败：' + rmErrText(err) + '（需要在设置里填发布密钥）', true);
        });
      return;
    }
    rmApi('/market/unpublish', { method: 'POST', body: { id: entry.id } }).then(
      function () {
        return reload().then(function () {
          flash('已从市场下架');
        });
      },
      function (err) {
        flash('下架失败：' + rmErrText(err), true);
      }
    );
  }

  function submitPublish(payload) {
    if (busy) return;
    setBusy('publish');
    rmApi('/publish', { method: 'POST', body: payload }).then(
      function (value) {
        return value.entry;
      }
    ).then(
      function (entry) {
        setBusy('');
        setPublishOpen(false);
        if (payload.publishPublic) {
          rmApi('/github/publish', {
            method: 'POST',
            body: {
              resumeId: payload.resumeId,
              name: payload.title,
              tagline: payload.tagline,
              tags: payload.tags,
              includeSample: payload.includeSample,
            },
          }).then(
            function (value) {
              setPublicSubmission(value);
            },
            function (err) {
              flash('公共投稿生成失败：' + rmErrText(err), true);
            }
          );
        }
        if (payload.remote && boot.settings && boot.settings.marketUrl) {
          var base = remoteBase();
          var headers = { 'content-type': 'application/json' };
          if (boot.settings.marketToken) headers.authorization = 'Bearer ' + String(boot.settings.marketToken);
          fetch(base + '/api/templates', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
              item: {
                title: entry.name || payload.title,
                name: entry.name || payload.title,
                author: boot.settings.author || '我',
                tags: entry.tags || [],
                note: entry.tagline || entry.desc || '',
                templateId: entry.templateId,
                template: { css: entry.css || '' },
                data: entry.sample || null,
              },
            }),
          })
            .then(function (res) {
              if (!res.ok) {
                return res.json().then(function (json) {
                  throw new Error((json && json.error && json.error.message) || 'HTTP ' + res.status);
                });
              }
              flash('已同时发布到远端市场（' + base + '）');
            })
            .catch(function (err) {
              flash('本地发布成功；远端发布失败：' + rmErrText(err), true);
            });
        }
        return reload().then(function () {
          setTab('market');
          flash('发布成功，其他装了插件的用户可以在市场里安装它');
        });
      },
      function (err) {
        setBusy('');
        flash('发布失败：' + rmErrText(err), true);
      }
    );
  }

  function loadGithub(force) {
    setGh(function (prev) { return Object.assign({}, prev, { loading: true }); });
    var opts = force ? { method: 'POST' } : {};
    rmApi(force ? '/github/refresh' : '/github/state', opts).then(
      function (value) {
        setGh({
          loading: false,
          items: value.items || [],
          likes: value.likes || {},
          stale: !!value.stale,
          error: value.error || null,
          fetchedAt: value.fetchedAt || '',
          repo: value.repo || '',
        });
      },
      function (err) {
        setGh(function (prev) {
          return Object.assign({}, prev, { loading: false, error: { code: 'github/offline', message: rmErrText(err) } });
        });
      }
    );
  }

  function installGithub(item) {
    if (busy) return;
    setBusy('gh:' + item.id);
    rmApi('/github/install', { method: 'POST', body: { id: item.id } }).then(
      function (value) {
        return value.template;
      }
    ).then(
      function (template) {
        setBusy('');
        return reload().then(function () {
          setTab('templates');
          flash('已安装公共模板：' + (template.name || item.name) + '，在「模板库」里可用');
        });
      },
      function (err) {
        setBusy('');
        flash('安装失败：' + rmErrText(err), true);
      }
    );
  }

  function likeGithub(item) {
    rmApi('/github/like', { method: 'POST', body: { id: item.id } }).then(
      function (value) {
        setGh(function (prev) {
          var likes = Object.assign({}, prev.likes);
          likes[item.id] = value.likes;
          return Object.assign({}, prev, { likes: likes });
        });
      },
      function (err) {
        flash('点赞失败：' + rmErrText(err), true);
      }
    );
  }

  function saveSettings(next) {
    setBusy('settings');
    rmApi('/settings', { method: 'POST', body: next }).then(
      function (value) {
        return value.settings;
      }
    ).then(
      function (settings) {
        setBusy('');
        setBoot(function (prev) {
          if (!prev || prev.status !== 'ready') return prev;
          return Object.assign({}, prev, { settings: settings });
        });
        flash('设置已保存');
      },
      function (err) {
        setBusy('');
        flash('设置保存失败：' + rmErrText(err), true);
      }
    );
  }

  /**
   * 把「AI 对话」解析出的 payload 应用到当前简历。
   * payload 形如 {title?, data}（data 结构见 Host 的 SYSTEM_PROMPT）。
   * 没有当前简历时，直接按对话内容新建一份。
   */
  function applyChat(payload) {
    if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
      flash('AI 回复里没有可应用的简历内容', true);
      return;
    }
    var merged = rmChatMergeData(draft ? draft.data : rmBlankData(), payload.data);
    var title = typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : '';
    if (!draft) {
      var createBody = { templateId: 'business-minimal', data: merged };
      if (title) createBody.title = title;
      setBusy('chat');
      rmApi('/resume', { method: 'POST', body: createBody }).then(
        function (value) {
          return value.resume;
        }
      ).then(
        function (resume) {
          setBusy('');
          setDraft(resume);
          setBoot(function (prev) {
            if (!prev || prev.status !== 'ready') return prev;
            return Object.assign({}, prev, { resumes: [resume].concat(prev.resumes || []) });
          });
          setTab('editor');
          flash('已按 AI 对话新建一份简历');
        },
        function (err) {
          setBusy('');
          flash('按对话新建失败：' + rmErrText(err), true);
        }
      );
      return;
    }
    var next = Object.assign({}, draft, { data: merged });
    if (title) next.title = title;
    setDraft(next);
    setTab('editor');
    persist(next, true);
    flash('已应用到当前简历');
  }

  function loadRemote() {
    var base = boot.settings && boot.settings.marketUrl ? String(boot.settings.marketUrl).replace(/\/+$/, '') : '';
    if (!base) {
      setRemote({ loading: false, entries: [], error: '' });
      return;
    }
    setRemote(function (prev) {
      return Object.assign({}, prev, { loading: true, error: '' });
    });
    fetch(base + '/api/templates?limit=100', { headers: { accept: 'application/json' } })
      .then(function (res) {
        return res.json();
      })
      .then(function (json) {
        var items = json && json.ok && json.value && Array.isArray(json.value.items) ? json.value.items : [];
        var entries = items.map(function (item) {
          var css = item.template && typeof item.template.css === 'string' ? item.template.css : '';
          return {
            id: 'remote:' + item.id,
            remoteId: item.id,
            source: 'remote',
            name: item.title || item.name || '市场模板',
            tagline: item.note || '',
            tags: Array.isArray(item.tags) ? item.tags : [],
            author: item.author || '匿名',
            installs: item.downloads || 0,
            likes: item.likes || 0,
            css: css,
            sample: item.data || null,
            templateId: 'rm-' + String(item.id || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30),
            createdAt: item.createdAt || '',
          };
        });
        setRemote({ loading: false, entries: entries, error: '' });
      })
      .catch(function (err) {
        setRemote({ loading: false, entries: [], error: rmErrText(err) });
      });
  }

  useEffect(function () {
    if (tab === 'market') loadRemote();
    // 切到市场页时顺带拉一次远端清单
  }, [tab]);

  useEffect(function () {
    if (tab === 'market' && marketSource === 'public' && !gh.fetchedAt && !gh.loading) loadGithub(false);
    // 切到「公共市场」时拉一次 GitHub index（10 分钟内走本地缓存）
  }, [tab, marketSource]);


  var template = draft ? rmResolveTemplate(draft.templateId, boot.templates) : null;
  var installedTemplateIds = (boot.templates || []).map(function (item) {
    return item.id;
  });
  // 公共市场的 index 里没有模板 id，按名字判断是否已安装（安装后模板会带 source:'custom'）。
  var ghInstalledIds = (gh.items || [])
    .filter(function (item) {
      return (boot.templates || []).some(function (t) {
        return t.source === 'custom' && t.name === item.name;
      });
    })
    .map(function (item) {
      return item.id;
    });
  var canRemote = !!(boot.settings && boot.settings.marketUrl);
  var remoteHost = canRemote ? String(boot.settings.marketUrl).replace(/^https?:\/\//, '') : '';

  var body;
  if (boot.status === 'loading') {
    body = h('div', { className: 'rm-loading' }, '正在打开简历市场…');
  } else if (boot.status === 'error') {
    body = h(
      'div',
      { className: 'rm-empty' },
      '插件后端没有响应：' + boot.error,
      h('div', { className: 'rm-row', style: { justifyContent: 'center', marginTop: '12px' } }, h('button', { type: 'button', className: 'rm-btn', onClick: reload }, '重试'))
    );
  } else if (tab === 'resumes') {
    body = h(ResumesView, {
      resumes: boot.resumes,
      deleted: boot.deleted,
      templates: boot.templates,
      currentId: draft ? draft.id : '',
      onOpen: openResume,
      onRename: renameResume,
      onDelete: removeResumeById,
      onRestore: restoreResume,
      onPurge: purgeResume,
      onRevisions: openRevisions,
    });
  } else if (tab === 'templates') {
    body = h(TemplatesView, {
      templates: boot.templates,
      currentTemplateId: draft ? draft.templateId : '',
      onUse: applyTemplate,
      onCreate: openTemplateCreate,
      onImport: openTemplateImport,
      onCopy: openTemplateCopy,
      onEdit: openTemplateEdit,
      onPublishTemplate: function (item) { setTemplatePublish(item); },
      onDelete: removeTemplate,
      onPreview: openTemplatePreview,
    });
  } else if (tab === 'market') {
    var merged = remote.entries && remote.entries.length ? remote.entries : [];
    body = h(MarketView, {
      market: (boot.market || []).concat(merged.filter(function (entry) { return !(boot.market || []).some(function (item) { return item.id === entry.id; }); })),
      installedTemplateIds: installedTemplateIds,
      myResumeIds: (boot.resumes || []).map(function (item) { return item.id; }),
      loading: remote.loading,
      busyId: busy,
      onInstall: installEntry,
      onUnpublish: unpublishEntry,
      onLike: likeEntry,
      onRefresh: loadRemote,
      source: marketSource,
      onSourceChange: setMarketSource,
      gh: gh,
      ghInstalledIds: ghInstalledIds,
      repo: gh.repo || (boot.settings && boot.settings.githubRepo) || '',
      onGhInstall: installGithub,
      onGhLike: likeGithub,
      onGhRefresh: function () { loadGithub(true); },
      onPublishResume: null,
    });
    if (remote.error) {
      body = h('div', null, body, h('div', { className: 'rm-hint', style: { padding: '0 18px 14px' } }, '远端市场暂不可用：' + remote.error + '（本地市场照常可用）'));
    }
  } else if (tab === 'settings') {
    body = h(SettingsView, {
      settings: boot.settings,
      storeFile: boot.storeFile,
      resumeCount: (boot.resumes || []).length,
      templateCount: (boot.templates || []).length,
      marketCount: (boot.market || []).length,
      busy: busy === 'settings',
      onSave: saveSettings,
      layout: panelProps.layout || null,
      onToast: flash,
    });
  } else if (!draft) {
    body = h(
      'div',
      { className: 'rm-empty' },
      '还没有简历。',
      h('div', { className: 'rm-row', style: { justifyContent: 'center', marginTop: '12px' } }, h('button', { type: 'button', className: 'rm-btn rm-btn-primary', onClick: createResume }, '新建一份')),
      h('div', { className: 'rm-hint', style: { marginTop: '10px' } }, '也可以让「大肥鱼」直接用 resume_save 工具按字段帮你写好，再回来微调。')
    );
  } else {
    body = h('div', { className: 'rm-editor' }, h(EditorForm, {
      data: draft.data,
      sections: draft.sections,
      onData: function (data) { updateDraft({ data: data }); },
      onSections: function (sections) { updateDraft({ sections: sections }); },
    }), h(PreviewPanel, { resume: draft, template: template }));
  }

  return h(
    'div',
    { className: 'rm-root' },
    rmInjectCss(),
    h(
      'div',
      { className: 'rm-top' },
      h('div', { className: 'rm-logo' }, 'CV'),
      h('div', { className: 'rm-brand' }, h('b', null, '简历市场'), h('span', null, '免费模板 · 大肥鱼出品 · 结构化个人信息')),
      draft
        ? h(
            'div',
            { className: 'rm-row', style: { marginLeft: '4px' } },
            h('input', {
              className: 'rm-input',
              style: { width: '168px' },
              value: draft.title,
              onChange: function (event) { updateDraft({ title: event.target.value }); },
            }),
            h(
              'select',
              {
                className: 'rm-input',
                style: { width: '150px' },
                value: draft.templateId,
                onChange: function (event) {
                  updateDraft({ templateId: event.target.value });
                },
              },
              (boot.templates || []).map(function (item, index) {
                var label = item.name + (item.builtin || item.source === 'builtin' ? '' : '（我的）');
                return h('option', { key: 'tpl-' + index + '-' + item.id, value: item.id }, label);
              })
            ),
            h(
              'select',
              {
                className: 'rm-input',
                style: { width: '96px' },
                value: draft.lang,
                onChange: function (event) {
                  updateDraft({ lang: event.target.value });
                },
              },
              h('option', { value: 'zh' }, '中文'),
              h('option', { value: 'en' }, 'English')
            )
          )
        : null,
      h(
        'div',
        { className: 'rm-top-actions' },
        h('span', { className: 'rm-hint' }, saving ? '保存中…' : draft ? '已自动保存' : ''),
        h('button', { type: 'button', className: 'rm-btn', onClick: createResume, disabled: busy === 'create' }, '新建'),
        draft
          ? h(
              'span',
              { className: 'rm-row' },
              h('button', { type: 'button', className: 'rm-btn rm-btn-sm', onClick: duplicateResume, disabled: busy === 'duplicate' }, '复制'),
              h('button', { type: 'button', className: 'rm-btn rm-btn-sm', onClick: removeResume, disabled: busy === 'delete' }, '删除')
            )
          : null,
        draft
          ? h(
              'span',
              { className: 'rm-row' },
              h('button', { type: 'button', className: 'rm-btn', onClick: function () { openRevisions(draft); } }, '历史版本'),
              h(
                'span',
                { className: 'rm-menu-wrap' },
                h(
                  'button',
                  { type: 'button', className: 'rm-btn', onClick: function () { setExportMenu(!exportMenuOpen); }, disabled: busy === 'export' },
                  busy === 'export' ? '导出中…' : '导出 ▾'
                ),
                exportMenuOpen
                  ? h(
                      'div',
                      { className: 'rm-menu' },
                      [
                        ['html', '导出 HTML'],
                        ['doc', '导出 Word (.docx)'],
                        ['pdf', '导出 PDF'],
                      ].map(function (pair) {
                        return h(
                          'button',
                          { key: pair[0], type: 'button', className: 'rm-menu-item', onClick: function () { saveExport(pair[0]); } },
                          pair[1]
                        );
                      })
                    )
                  : null
              ),
              h('span', { className: 'rm-hint', style: { marginLeft: '4px' } }, '发布模板请到「模板库」')
            )
          : null
      )
    ),
    h(
      'div',
      { className: 'rm-tabs' },
      [
        ['editor', '编辑简历'],
        ['resumes', '我的简历'],
        ['templates', '模板库'],
        ['market', '模板市场'],
        ['settings', '设置'],
      ].map(function (pair) {
        return h(
          'button',
          { key: pair[0], type: 'button', className: 'rm-tab' + (tab === pair[0] ? ' is-on' : ''), onClick: function () { setTab(pair[0]); } },
          pair[1]
        );
      })
    ),
    h('div', { className: 'rm-stage' }, body),
    exportInfo
      ? h(ExportDialog, {
          info: exportInfo,
          onClose: function () { setExportInfo(null); },
          onReveal: revealExportPath,
          onExport: saveExport,
          onToast: flash,
        })
      : null,
    rev.open
      ? h(RevisionsDialog, {
          resume: rev.resume,
          revisions: rev.revisions,
          loading: rev.loading,
          onRestore: restoreRevision,
          onClose: function () { setRev({ open: false, resume: null, loading: false, revisions: [] }); },
        })
      : null,
    publishOpen && draft
      ? h(PublishDialog, {
          resume: draft,
          busy: busy === 'publish',
          includeSampleDefault: !!(boot.settings && boot.settings.includeSampleByDefault),
          canRemote: canRemote,
          remoteHost: remoteHost,
          onClose: function () { setPublishOpen(false); },
          onSubmit: submitPublish,
        })
      : null,
    publicSubmission
      ? h(PublicSubmitDialog, {
          info: publicSubmission,
          onClose: function () { setPublicSubmission(null); },
          onToast: flash,
        })
      : null,
    templateEditor
      ? h(TemplateEditor, {
          key: templateEditor.key,
          title: templateEditor.title,
          initial: templateEditor.initial,
          error: templateEditor.error,
          busy: busy === 'template-save',
          onSave: saveTemplate,
          onClose: function () { setTemplateEditor(null); },
        })
      : null,
    templateImportOpen
      ? h(TemplateImportDialog, {
          onGenerated: applyTemplateAnalysis,
          onClose: function () { setTemplateImportOpen(false); },
        })
      : null,
    templatePublish
      ? h(TemplatePublishDialog, {
          template: templatePublish,
          busy: busy === 'template-publish',
          error: templatePublish.error,
          includeSampleDefault: true,
          onClose: function () { setTemplatePublish(null); },
          onSubmit: submitTemplatePublish,
        })
      : null,
    templatePreview
      ? h(TemplatePreviewDialog, {
          template: templatePreview,
          sample: templatePreview.sample,
          onClose: function () { setTemplatePreview(null); },
        })
      : null,
    // AI 对话改成右下角浮动入口：不占 tab，任何 tab 下都在（发布/导出弹窗按 z-index 会盖住它）。
    boot.status === 'ready'
      ? h(RMChatDock, { draft: draft, settings: boot.settings, onApply: applyChat })
      : null,
    h(Toast, { toast: toast })
  );
}
