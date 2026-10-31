/**
 * 简历市场 client — 45「我的简历」列表 / 回收站 / 历史版本。
 *
 * 解决两个真实抱怨：
 *  1. 新建简历后旧简历像「消失」了——其实一直在本地，只是以前没有列表入口；
 *  2. 删掉的简历找不回来——现在删除只是进回收站，还能恢复；每次编辑还会留历史快照。
 */

function rmTemplateName(templates, id) {
  var list = templates || [];
  for (var i = 0; i < list.length; i += 1) {
    if (list[i].id === id) return list[i].name || id;
  }
  return id || '未知模板';
}

function ResumeRow(props) {
  var resume = props.resume;
  var editingState = useState(false);
  var editing = editingState[0];
  var setEditing = editingState[1];
  var valueState = useState(resume.title || '');
  var value = valueState[0];
  var setValue = valueState[1];
  var isCurrent = props.currentId === resume.id;

  function commit() {
    setEditing(false);
    var next = String(value || '').trim();
    if (next && next !== resume.title) props.onRename(resume.id, next);
    else setValue(resume.title || '');
  }

  return h(
    'div',
    { className: 'rm-resume-row' + (isCurrent ? ' is-current' : '') },
    h(
      'div',
      { className: 'rm-resume-main' },
      editing
        ? h('input', {
            className: 'rm-input rm-resume-title-input',
            value: value,
            autoFocus: true,
            onChange: function (event) { setValue(event.target.value); },
            onBlur: commit,
            onKeyDown: function (event) {
              if (event.key === 'Enter') commit();
              if (event.key === 'Escape') { setEditing(false); setValue(resume.title || ''); }
            },
          })
        : h('div', { className: 'rm-resume-title' }, resume.title, isCurrent ? h('span', { className: 'rm-pill rm-pill-brand' }, '正在编辑') : null),
      h(
        'div',
        { className: 'rm-resume-meta' },
        h('span', null, rmTemplateName(props.templates, resume.templateId)),
        h('span', null, '更新于 ' + rmFormatTime(resume.updatedAt)),
        h('span', null, (resume.data.basics.name || '未填姓名') + ' · ' + (resume.data.basics.role || '未填职位')),
      ),
    ),
    h(
      'div',
      { className: 'rm-resume-actions' },
      h('button', { type: 'button', className: 'rm-btn rm-btn-sm rm-btn-primary', onClick: function () { props.onOpen(resume.id); } }, '打开'),
      h('button', { type: 'button', className: 'rm-btn rm-btn-sm', onClick: function () { setEditing(true); } }, '重命名'),
      h('button', { type: 'button', className: 'rm-btn rm-btn-sm', onClick: function () { props.onRevisions(resume); } }, '历史版本'),
      h('button', { type: 'button', className: 'rm-btn rm-btn-sm', onClick: function () { props.onDelete(resume.id); } }, '删除'),
    ),
  );
}

function TrashRow(props) {
  var item = props.item;
  return h(
    'div',
    { className: 'rm-resume-row is-trash' },
    h(
      'div',
      { className: 'rm-resume-main' },
      h('div', { className: 'rm-resume-title' }, item.title),
      h(
        'div',
        { className: 'rm-resume-meta' },
        h('span', null, '删除于 ' + rmFormatTime(item.deletedAt)),
        h('span', null, (item.revisions || 0) + ' 个历史版本'),
      ),
    ),
    h(
      'div',
      { className: 'rm-resume-actions' },
      h('button', { type: 'button', className: 'rm-btn rm-btn-sm rm-btn-primary', onClick: function () { props.onRestore(item.id); } }, '恢复'),
      h('button', { type: 'button', className: 'rm-btn rm-btn-sm rm-btn-danger', onClick: function () { props.onPurge(item.id); } }, '彻底删除'),
    ),
  );
}

function ResumesView(props) {
  var resumes = props.resumes || [];
  var deleted = props.deleted || [];
  return h(
    'div',
    { className: 'rm-form' },
    h(
      'div',
      { className: 'rm-card' },
      h(
        'div',
        { className: 'rm-card-h' },
        h('h3', null, '我的简历'),
        h('span', { className: 'rm-muted', style: { marginLeft: 'auto', fontSize: '11px' } }, resumes.length + ' 份'),
      ),
      h(
        'div',
        { className: 'rm-card-b rm-col' },
        h('div', { className: 'rm-hint' }, '简历都存在本地，新建不会覆盖旧的；点「打开」切换，改坏了可以从「历史版本」恢复。'),
        resumes.length
          ? resumes.map(function (resume) {
              return h(ResumeRow, {
                key: resume.id,
                resume: resume,
                templates: props.templates,
                currentId: props.currentId,
                onOpen: props.onOpen,
                onRename: props.onRename,
                onDelete: props.onDelete,
                onRevisions: props.onRevisions,
              });
            })
          : h('div', { className: 'rm-empty' }, '还没有简历，点上方「新建」开始。'),
      ),
    ),
    deleted.length
      ? h(
          'div',
          { className: 'rm-card' },
          h(
            'div',
            { className: 'rm-card-h' },
            h('h3', null, '回收站'),
            h('span', { className: 'rm-muted', style: { marginLeft: 'auto', fontSize: '11px' } }, deleted.length + ' 份'),
          ),
          h(
            'div',
            { className: 'rm-card-b rm-col' },
            h('div', { className: 'rm-hint' }, '删除的简历先放这里，可以恢复；「彻底删除」才真正清掉。'),
            deleted.map(function (item) {
              return h(TrashRow, { key: item.id, item: item, onRestore: props.onRestore, onPurge: props.onPurge });
            }),
          ),
        )
      : null,
  );
}

function RevisionsDialog(props) {
  var revisions = props.revisions || [];
  return h(
    'div',
    { className: 'rm-modal', onMouseDown: function (event) { if (event.target === event.currentTarget) props.onClose(); } },
    h(
      'div',
      { className: 'rm-modal-card rm-modal-wide' },
      h(
        'div',
        { className: 'rm-modal-h' },
        h('h3', null, '历史版本'),
        h('span', { className: 'rm-muted', style: { marginLeft: 'auto', fontSize: '11px' } }, props.resume ? props.resume.title : ''),
      ),
      h(
        'div',
        { className: 'rm-modal-b rm-col' },
        props.loading
          ? h('div', { className: 'rm-hint' }, '正在读取历史版本…')
          : revisions.length
            ? revisions
                .slice()
                .reverse()
                .map(function (rev) {
                  return h(
                    'div',
                    { key: rev.id, className: 'rm-rev-row' },
                    h(
                      'div',
                      { className: 'rm-resume-main' },
                      h('div', { className: 'rm-resume-title' }, rmFormatTime(rev.at)),
                      h('div', { className: 'rm-resume-meta' }, (rev.data.basics.name || '未填姓名') + ' · ' + (rev.data.basics.role || '未填职位')),
                    ),
                    h('button', { type: 'button', className: 'rm-btn rm-btn-sm', onClick: function () { props.onRestore(rev.id); } }, '恢复到这里'),
                  );
                })
            : h('div', { className: 'rm-hint' }, '还没有历史版本：编辑超过 3 分钟后会自动留一个快照；删除简历前的状态也会留在这里。'),
      ),
      h('div', { className: 'rm-modal-f' }, h('button', { type: 'button', className: 'rm-btn', onClick: props.onClose }, '关闭')),
    ),
  );
}
