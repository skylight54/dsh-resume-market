/**
 * 简历市场 client — 50 主面板。
 * 负责：加载 store 状态、左侧结构化编辑 + 右侧 A4 预览、模板库、市场、设置、发布弹窗。
 */

function Toast(props) {
  if (!props.toast) return null;
  return h('div', { className: 'rm-toast' + (props.toast.isErr ? ' is-err' : '') }, props.toast.msg);
}

var EXPORT_LABEL = { html: 'HTML', doc: 'Word 文档', pdf: 'PDF' };
var EXPORT_HINT = {
  html: 'HTML 文件：双击用浏览器打开，Ctrl/Cmd+P 也能再存成 PDF。',
  doc: 'Word 文档：双击用 Word / WPS 打开，在 Word 里「另存为 .docx」即可得到正式 Word 文件。',
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

function SettingsView(props) {
  var settings = props.settings || {};
  var first = useState({
    author: settings.author || '',
    marketUrl: settings.marketUrl || '',
    marketToken: settings.marketToken || '',
    includeSampleByDefault: !!settings.includeSampleByDefault,
    chatApiKey: settings.chatApiKey || '',
    chatModel: settings.chatModel || 'deepseek-chat',
    chatBaseUrl: settings.chatBaseUrl || 'https://api.deepseek.com',
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
      chatApiKey: form.chatApiKey.trim(),
      chatModel: form.chatModel.trim() || 'deepseek-chat',
      chatBaseUrl: form.chatBaseUrl.trim() || 'https://api.deepseek.com',
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
      h('div', { className: 'rm-card-h' }, h('h3', null, 'AI 对话（DeepSeek）')),
      h(
        'div',
        { className: 'rm-card-b rm-col' },
        h(Field, { label: 'API Key', value: form.chatApiKey, type: 'password', placeholder: 'sk-…', onChange: set('chatApiKey') }),
        h(Field, { label: '模型', value: form.chatModel, placeholder: 'deepseek-chat', onChange: set('chatModel') }),
        h(Field, { label: 'Base URL', value: form.chatBaseUrl, placeholder: 'https://api.deepseek.com', onChange: set('chatBaseUrl') }),
        h('div', { className: 'rm-hint' }, 'API Key 只保存在本机的 store.json，不会随简历/模板上传；「AI 对话」页用它把聊天内容整理成结构化简历。'),
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
    )
  );
}

function ResumePanel() {
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


  var template = draft ? rmResolveTemplate(draft.templateId, boot.templates) : null;
  var installedTemplateIds = (boot.templates || []).map(function (item) {
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
    });
  } else if (tab === 'chat') {
    body = h(ChatView, { draft: draft, settings: boot.settings, onApply: applyChat });
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
              (boot.templates || []).map(function (item) {
                return h('option', { key: item.id, value: item.id }, item.name);
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
                        ['doc', '导出 Word (.doc)'],
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
              h('button', { type: 'button', className: 'rm-btn rm-btn-primary', onClick: function () { setPublishOpen(true); } }, '发布到市场')
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
        ['chat', 'AI 对话'],
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
    h(Toast, { toast: toast })
  );
}
