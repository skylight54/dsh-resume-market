/**
 * 简历市场 client — 65 档案库 + 按 JD 定制。
 *
 * 档案 = 一份「关键信息快照」（basics / summary / 各模块条目），存在 Host，
 * 用户可以拿它按不同 JD 生成定制版简历，再一键载入编辑器。
 *
 * 视图完全由 props 驱动（不自己拉列表）：
 *  - archives：GET /archive 拿到的档案数组（可能为空/未加载）
 *  - resume：当前编辑器里的简历，用于「从当前简历建档案」
 *  - onReload()：请求父面板重新拉档案列表
 *  - onApplyResume(resume)：把定制结果载入编辑器
 *  - onToast(text)：底部提示（可选）
 *
 * 注意：本文件会被 build/build.mjs 拼进同一个模块工厂，
 * 所以不要写 import/export，直接用 00-preface.js 里的 h / useState / rmApi 等句柄。
 */

/** basics 的 8 个字段（顺序即展示顺序）。 */
var RM_ARCH_BASIC_FIELDS = [
  ['name', '姓名'],
  ['role', '求职意向'],
  ['phone', '电话'],
  ['email', '邮箱'],
  ['city', '城市'],
  ['wechat', '微信'],
  ['github', 'GitHub'],
  ['website', '主页'],
];

var ARCHIVE_CSS = [
  '.rm-arch{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;width:100%;position:relative;}',
  '.rm-arch-toolbar{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:12px 18px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);flex-wrap:wrap;}',
  '.rm-arch-toolbar-main{display:flex;flex-direction:column;gap:2px;min-width:0;}',
  '.rm-arch-toolbar-main b{font-size:13px;color:var(--dsw-alias-label-primary,#1d2129);}',
  '.rm-arch-toolbar-actions{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
  '.rm-arch-error{flex:0 0 auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 18px 0;padding:7px 10px;border-radius:8px;font-size:12px;',
  '  color:var(--dsw-alias-state-error-primary,#dc2626);background:var(--dsw-alias-bg-layer-1,#fafbfc);border:1px solid var(--dsw-alias-state-error-primary,#dc2626);opacity:.9;}',
  '.rm-arch-error .rm-btn{margin-left:auto;}',
  '.rm-arch-body{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:300px minmax(0,1fr);overflow:hidden;}',
  '.rm-arch-left{min-height:0;overflow:auto;border-right:1px solid var(--dsw-alias-border-l1,#e5e7eb);background:var(--dsw-alias-bg-layer-1,#fafbfc);',
  '  padding:12px;display:flex;flex-direction:column;gap:10px;}',
  '.rm-arch-left-h{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--dsw-alias-label-secondary,#6b7280);}',
  '.rm-arch-list{display:flex;flex-direction:column;gap:9px;}',
  '.rm-arch-card{border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:10px;padding:9px 11px;background:var(--dsw-alias-bg-base,#fff);',
  '  cursor:pointer;display:flex;flex-direction:column;gap:5px;transition:border-color .15s ease,box-shadow .15s ease;}',
  '.rm-arch-card:hover{border-color:var(--dsw-alias-brand-primary,#2f6fde);}',
  '.rm-arch-card.is-active{border-color:var(--dsw-alias-brand-primary,#2f6fde);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary,#2f6fde) inset;}',
  '.rm-arch-card-name{display:flex;align-items:baseline;justify-content:space-between;gap:8px;min-width:0;}',
  '.rm-arch-card-title{font-size:12.5px;font-weight:620;color:var(--dsw-alias-label-primary,#1d2129);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
  '.rm-arch-card-time{font-size:10.5px;flex:0 0 auto;}',
  '.rm-arch-card-meta{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary,#6b7280);word-break:break-word;}',
  '.rm-arch-card-foot{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
  '.rm-arch-right{min-height:0;overflow:auto;padding:14px 18px 40px;display:flex;flex-direction:column;gap:16px;}',
  '.rm-arch-detail{display:flex;flex-direction:column;gap:12px;}',
  '.rm-arch-detail-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}',
  '.rm-arch-detail-h b{font-size:14px;color:var(--dsw-alias-label-primary,#1d2129);}',
  '.rm-arch-muted{font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280);}',
  '.rm-arch-kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:6px 16px;margin:0;font-size:12px;}',
  '.rm-arch-kv-row{display:flex;align-items:baseline;gap:6px;min-width:0;}',
  '.rm-arch-kv dt{flex:0 0 58px;color:var(--dsw-alias-label-secondary,#6b7280);}',
  '.rm-arch-kv dd{margin:0;min-width:0;color:var(--dsw-alias-label-primary,#1d2129);word-break:break-word;}',
  '.rm-arch-sec{display:flex;flex-direction:column;gap:8px;}',
  '.rm-arch-sec-h{font-size:11.5px;font-weight:650;letter-spacing:.03em;color:var(--dsw-alias-label-secondary,#6b7280);',
  '  padding-bottom:4px;border-bottom:1px dashed var(--dsw-alias-border-l1,#e5e7eb);}',
  '.rm-arch-item{border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:9px;padding:8px 10px;background:var(--dsw-alias-bg-layer-1,#fafbfc);}',
  '.rm-arch-item-h{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:12px;}',
  '.rm-arch-item-h b{font-weight:620;color:var(--dsw-alias-label-primary,#1d2129);}',
  '.rm-arch-item-sub{font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280);}',
  '.rm-arch-bullets{margin:6px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:3px;font-size:11.5px;line-height:1.6;',
  '  color:var(--dsw-alias-label-primary,#1d2129);}',
  '.rm-arch-summary{font-size:12px;line-height:1.75;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary,#1d2129);}',
  '.rm-arch-empty{margin:auto 0;display:flex;flex-direction:column;gap:8px;align-items:center;text-align:center;padding:26px 10px;',
  '  font-size:12px;line-height:1.7;color:var(--dsw-alias-label-secondary,#6b7280);}',
  '.rm-arch-empty b{font-size:13px;color:var(--dsw-alias-label-primary,#1d2129);}',
  '.rm-arch-tailor{border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fafbfc);',
  '  padding:12px;display:flex;flex-direction:column;gap:9px;}',
  '.rm-arch-tailor-h{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;}',
  '.rm-arch-tailor-h b{font-size:12.5px;color:var(--dsw-alias-label-primary,#1d2129);}',
  '.rm-arch-jd{min-height:96px;max-height:240px;}',
  '.rm-arch-tailor-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
  '.rm-arch-result{border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:10px;background:var(--dsw-alias-bg-base,#fff);',
  '  padding:11px;display:flex;flex-direction:column;gap:10px;}',
  '.rm-arch-score{display:flex;flex-direction:column;gap:5px;}',
  '.rm-arch-score-h{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:11.5px;color:var(--dsw-alias-label-secondary,#6b7280);}',
  '.rm-arch-score-h b{font-size:13px;color:var(--dsw-alias-brand-primary,#2f6fde);}',
  '.rm-arch-score-bar{height:8px;border-radius:999px;overflow:hidden;background:var(--dsw-alias-bg-layer-2,#eef1f5);}',
  '.rm-arch-score-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#2f6fde,#7ccab6);transition:width .3s ease;}',
  '.rm-arch-gaps{display:flex;flex-wrap:wrap;gap:6px;}',
  '.rm-arch-chip{font-size:11px;padding:2px 9px;border-radius:999px;background:rgba(245,158,11,.14);',
  '  color:var(--dsw-alias-state-warn-primary,#b45309);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
  '.rm-arch-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
  '.rm-arch-modal{position:absolute;inset:0;background:rgba(15,23,42,.42);display:flex;align-items:center;justify-content:center;padding:24px;z-index:12;overflow:auto;}',
  '.rm-arch-modal-card{width:min(560px,100%);max-height:100%;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base,#fff);',
  '  border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,.28);overflow:hidden;}',
  '.rm-arch-modal-h{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:13px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);background:var(--dsw-alias-bg-layer-1,#fafbfc);}',
  '.rm-arch-modal-h .rm-mini{margin-left:auto;}',
  '.rm-arch-modal-b{flex:1 1 auto;min-height:0;overflow:auto;padding:14px 16px;}',
  '.rm-arch-modal-f{flex:0 0 auto;display:flex;justify-content:flex-end;gap:8px;padding:11px 16px;border-top:1px solid var(--dsw-alias-border-l1,#e5e7eb);background:var(--dsw-alias-bg-layer-1,#fafbfc);}',
  '.rm-arch-form-error{margin:10px 0 0;}',
  '@media (max-width:720px){',
  '  .rm-arch-body{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);overflow:auto;}',
  '  .rm-arch-left{border-right:0;border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);max-height:42vh;}',
  '  .rm-arch-right{overflow:visible;}',
  '}',
].join('\n');

/** 读成字符串（非字符串一律当空）。 */
function rmArchText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** 档案的 data 对象（防御式）。 */
function rmArchData(archive) {
  var data = archive && archive.data;
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

/** 档案的 basics（防御式）。 */
function rmArchBasics(archive) {
  var basics = rmArchData(archive).basics;
  return basics && typeof basics === 'object' && !Array.isArray(basics) ? basics : {};
}

/** 档案 meta 摘要行，如「后端开发 · 3 年 · Python/Go」。 */
function rmArchMetaLine(archive) {
  var meta = archive && archive.meta && typeof archive.meta === 'object' ? archive.meta : {};
  var basics = rmArchBasics(archive);
  var parts = [];
  var title = rmArchText(meta.title) || rmArchText(basics.role);
  if (title) parts.push(title);
  if (typeof meta.years === 'number' && isFinite(meta.years)) {
    parts.push(meta.years + ' 年');
  } else {
    var years = rmArchText(meta.years);
    if (years) parts.push(/年$/.test(years) ? years : years + ' 年');
  }
  var skills = meta.skillsTop;
  var skillText = '';
  if (Array.isArray(skills)) {
    skillText = skills
      .map(function (item) {
        return rmArchText(item);
      })
      .filter(Boolean)
      .join('/');
  } else {
    skillText = rmArchText(skills);
  }
  if (skillText) parts.push(skillText);
  return parts.join(' · ');
}

/** data 里的数组型模块（过滤掉非对象项）。 */
function rmArchList(data, key) {
  var list = data && data[key];
  if (!Array.isArray(list)) return [];
  return list.filter(function (item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  });
}

/** 条目里的 bullets 字符串数组。 */
function rmArchBullets(item) {
  var bullets = Array.isArray(item && item.bullets) ? item.bullets : [];
  return bullets
    .map(function (line) {
      return typeof line === 'string' ? line.trim() : '';
    })
    .filter(Boolean);
}

/** 技能条目拆成可读字符串。 */
function rmArchSkillItems(item) {
  var items = item && item.items;
  if (Array.isArray(items)) {
    return items
      .map(function (value) {
        return rmArchText(value);
      })
      .filter(Boolean)
      .join('、');
  }
  return rmArchText(items);
}

/** 深拷贝（档案数据都是纯 JSON）。 */
function rmArchClone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (e) {
    return {};
  }
}

/** 0-100 的匹配度。 */
function rmArchScore(value) {
  var score = Number(value);
  if (!isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** tailor 结果标准化：{resume, notes, score, gaps}。 */
function rmArchTailorResult(value) {
  var source = value && typeof value === 'object' ? value : {};
  var gaps = source.gaps;
  if (typeof gaps === 'string') gaps = gaps.split(/[,，\n]/);
  if (!Array.isArray(gaps)) gaps = [];
  return {
    resume: source.resume && typeof source.resume === 'object' ? source.resume : null,
    notes: typeof source.notes === 'string' ? source.notes : '',
    score: rmArchScore(source.score),
    gaps: gaps
      .map(function (gap) {
        return rmArchText(gap);
      })
      .filter(Boolean),
  };
}

/** 新建档案表单的空白草稿。 */
function rmArchEmptyForm() {
  var basics = {};
  RM_ARCH_BASIC_FIELDS.forEach(function (pair) {
    basics[pair[0]] = '';
  });
  return { id: '', name: '', basics: basics, summary: '' };
}

/** 只读的条目列表（各模块共用）。 */
function rmArchItems(section, title, items, renderHead) {
  if (!items.length) return null;
  return h(
    'div',
    { className: 'rm-arch-sec', key: section },
    h('div', { className: 'rm-arch-sec-h' }, title),
    items.map(function (item, index) {
      var bullets = rmArchBullets(item);
      return h(
        'div',
        { className: 'rm-arch-item', key: section + '-' + index },
        renderHead(item),
        bullets.length
          ? h(
              'ul',
              { className: 'rm-arch-bullets' },
              bullets.map(function (line, lineIndex) {
                return h('li', { key: lineIndex }, line);
              })
            )
          : null
      );
    })
  );
}

/**
 * 档案库视图。
 * props：archives / resume / onReload / onApplyResume / onToast（见文件头注释）。
 */
function ArchiveView(props) {
  var archives = Array.isArray(props.archives) ? props.archives : [];
  var resume = props.resume || null;
  var reload = typeof props.onReload === 'function' ? props.onReload : function () {};
  var applyResume = typeof props.onApplyResume === 'function' ? props.onApplyResume : null;
  var toast = typeof props.onToast === 'function' ? props.onToast : function () {};

  var selectedState = useState('');
  var selectedId = selectedState[0];
  var setSelectedId = selectedState[1];

  var formState = useState(null);
  var form = formState[0];
  var setForm = formState[1];

  var formErrorState = useState('');
  var formError = formErrorState[0];
  var setFormError = formErrorState[1];

  var savingState = useState(false);
  var saving = savingState[0];
  var setSaving = savingState[1];

  var busyState = useState('');
  var busy = busyState[0];
  var setBusy = busyState[1];

  var errorState = useState('');
  var error = errorState[0];
  var setError = errorState[1];

  var tailorJdState = useState('');
  var jd = tailorJdState[0];
  var setJd = tailorJdState[1];

  var tailorTitleState = useState('');
  var tailorTitle = tailorTitleState[0];
  var setTailorTitle = tailorTitleState[1];

  var tailorBusyState = useState(false);
  var tailorBusy = tailorBusyState[0];
  var setTailorBusy = tailorBusyState[1];

  var tailorErrorState = useState('');
  var tailorError = tailorErrorState[0];
  var setTailorError = tailorErrorState[1];

  var resultState = useState(null);
  var result = resultState[0];
  var setResult = resultState[1];

  // 列表刷新后保证选中项仍然存在；没有选中就默认选第一条。
  useEffect(
    function () {
      if (!archives.length) {
        if (selectedId) setSelectedId('');
        return;
      }
      var exists = archives.some(function (item) {
        return item && item.id === selectedId;
      });
      if (!exists) setSelectedId(archives[0].id);
    },
    [archives, selectedId]
  );

  var selected = null;
  for (var i = 0; i < archives.length; i += 1) {
    if (archives[i] && archives[i].id === selectedId) {
      selected = archives[i];
      break;
    }
  }

  function findArchive(id) {
    for (var index = 0; index < archives.length; index += 1) {
      if (archives[index] && archives[index].id === id) return archives[index];
    }
    return null;
  }

  function openNewForm() {
    setError('');
    setFormError('');
    setForm(rmArchEmptyForm());
  }

  function openEditForm(archive) {
    if (!archive) return;
    var data = rmArchData(archive);
    var basics = rmArchBasics(archive);
    var draft = rmArchEmptyForm();
    draft.id = archive.id || '';
    draft.name = archive.name || '';
    RM_ARCH_BASIC_FIELDS.forEach(function (pair) {
      draft.basics[pair[0]] = rmArchText(basics[pair[0]]);
    });
    draft.summary = rmArchText(data.summary);
    setError('');
    setFormError('');
    setForm(draft);
  }

  function patchForm(patch) {
    setForm(function (current) {
      return current ? Object.assign({}, current, patch) : current;
    });
  }

  function patchBasics(key, value) {
    setForm(function (current) {
      if (!current) return current;
      var basics = Object.assign({}, current.basics);
      basics[key] = value;
      return Object.assign({}, current, { basics: basics });
    });
  }

  // 用当前编辑器里的简历建一份档案。
  function onFromResume() {
    if (!resume || !resume.id) {
      setError('先编辑一份简历，再点「从当前简历建档案」。');
      return;
    }
    setBusy('fromResume');
    setError('');
    rmApi('/archive/from-resume', {
      method: 'POST',
      body: { resumeId: resume.id, name: resume.title || '' },
    })
      .then(function (value) {
        var archive = value && value.archive ? value.archive : null;
        if (archive && archive.id) setSelectedId(archive.id);
        setTailorError('');
        setResult(null);
        toast('已从当前简历建档案' + (archive && archive.name ? '：' + archive.name : ''));
        reload();
      })
      .catch(function (err) {
        setError('建档案失败：' + rmErrText(err));
      })
      .then(function () {
        setBusy('');
      });
  }

  // 保存「新建 / 编辑档案」表单。
  function onSaveForm() {
    if (!form) return;
    var name = String(form.name || '').trim();
    if (!name) {
      setFormError('档案名不能为空。');
      return;
    }
    if (name.length > 40) {
      setFormError('档案名最多 40 个字。');
      return;
    }
    var original = form.id ? findArchive(form.id) : null;
    var data = original ? rmArchClone(rmArchData(original)) : {};
    if (!data || typeof data !== 'object') data = {};
    var basics = Object.assign({}, data.basics && typeof data.basics === 'object' ? data.basics : {});
    RM_ARCH_BASIC_FIELDS.forEach(function (pair) {
      var value = String((form.basics || {})[pair[0]] || '').trim();
      if (value) basics[pair[0]] = value;
      else delete basics[pair[0]];
    });
    data.basics = basics;
    data.summary = String(form.summary || '').trim();

    var archive = { name: name, data: data };
    if (form.id) archive.id = form.id;

    setSaving(true);
    setFormError('');
    rmApi('/archive', { method: 'POST', body: { archive: archive } })
      .then(function (value) {
        var saved = value && value.archive ? value.archive : null;
        if (saved && saved.id) setSelectedId(saved.id);
        setForm(null);
        toast(form.id ? '档案已更新' : '档案已创建');
        reload();
      })
      .catch(function (err) {
        setFormError('保存失败：' + rmErrText(err));
      })
      .then(function () {
        setSaving(false);
      });
  }

  // 删除档案（window.confirm 二次确认）。
  function onDelete(archive, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    if (!archive || !archive.id) return;
    var name = archive.name || '这份档案';
    if (typeof window !== 'undefined' && window.confirm && !window.confirm('删除档案「' + name + '」？删除后无法恢复。')) return;
    setBusy('delete:' + archive.id);
    setError('');
    rmApi('/archive?id=' + encodeURIComponent(archive.id), { method: 'DELETE' })
      .then(function () {
        if (selectedId === archive.id) {
          setSelectedId('');
          setResult(null);
          setTailorError('');
        }
        toast('已删除档案');
        reload();
      })
      .catch(function (err) {
        setError('删除失败：' + rmErrText(err));
      })
      .then(function () {
        setBusy('');
      });
  }

  // 按 JD 定制。
  function onTailor() {
    if (!selected) return;
    var text = String(jd || '').trim();
    if (!text) {
      setTailorError('先粘贴职位描述（JD），再点「生成定制简历」。');
      return;
    }
    setTailorBusy(true);
    setTailorError('');
    setResult(null);
    var body = { archiveId: selected.id, jd: text };
    var customTitle = String(tailorTitle || '').trim();
    if (customTitle) body.title = customTitle;
    rmApi('/archive/tailor', { method: 'POST', body: body })
      .then(function (value) {
        var next = rmArchTailorResult(value);
        setResult(next);
        toast('已生成定制简历（匹配度 ' + next.score + '）');
      })
      .catch(function (err) {
        setTailorError('定制失败：' + rmErrText(err));
      })
      .then(function () {
        setTailorBusy(false);
      });
  }

  function onApplyResult() {
    if (!result || !result.resume) return;
    if (!applyResume) {
      setTailorError('当前面板没有提供「载入编辑器」能力。');
      return;
    }
    applyResume(result.resume);
    toast('已把定制简历载入编辑器');
  }

  // ---- 左栏：档案卡 ----------------------------------------------------
  var cards = archives.map(function (archive) {
    if (!archive || !archive.id) return null;
    var meta = rmArchMetaLine(archive);
    var active = archive.id === selectedId;
    var deleting = busy === 'delete:' + archive.id;
    return h(
      'div',
      {
        className: 'rm-arch-card' + (active ? ' is-active' : ''),
        key: archive.id,
        onClick: function () {
          setSelectedId(archive.id);
          setResult(null);
          setTailorError('');
        },
        title: '点击查看档案详情',
      },
      h(
        'div',
        { className: 'rm-arch-card-name' },
        h('span', { className: 'rm-arch-card-title' }, archive.name || '未命名档案'),
        h('span', { className: 'rm-arch-muted rm-arch-card-time' }, rmFormatTime(archive.updatedAt))
      ),
      meta ? h('div', { className: 'rm-arch-card-meta' }, meta) : null,
      h(
        'div',
        { className: 'rm-arch-card-foot' },
        h(
          'button',
          {
            type: 'button',
            className: 'rm-btn rm-btn-sm',
            onClick: function (event) {
              if (event && event.stopPropagation) event.stopPropagation();
              openEditForm(archive);
            },
          },
          '编辑'
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'rm-btn rm-btn-sm rm-btn-danger',
            disabled: deleting,
            onClick: function (event) {
              onDelete(archive, event);
            },
          },
          deleting ? '删除中…' : '删除'
        )
      )
    );
  });

  // ---- 右栏：详情 + 按 JD 定制 ----------------------------------------
  var detail = null;
  if (selected) {
    var data = rmArchData(selected);
    var basics = rmArchBasics(selected);
    var summary = rmArchText(data.summary);
    var metaLine = rmArchMetaLine(selected);

    var experience = rmArchItems('experience', '工作经历', rmArchList(data, 'experience'), function (item) {
      var head = [];
      if (rmArchText(item.company)) head.push(h('b', { key: 'company' }, rmArchText(item.company)));
      if (rmArchText(item.role)) head.push(h('span', { key: 'role' }, rmArchText(item.role)));
      var sub = [rmArchText(item.period), rmArchText(item.location)].filter(Boolean).join(' · ');
      return h(
        'div',
        null,
        h('div', { className: 'rm-arch-item-h' }, head),
        sub ? h('div', { className: 'rm-arch-item-sub' }, sub) : null
      );
    });

    var projects = rmArchItems('projects', '项目经历', rmArchList(data, 'projects'), function (item) {
      var head = [];
      if (rmArchText(item.name)) head.push(h('b', { key: 'name' }, rmArchText(item.name)));
      if (rmArchText(item.role)) head.push(h('span', { key: 'role' }, rmArchText(item.role)));
      var sub = rmArchText(item.period);
      return h(
        'div',
        null,
        h('div', { className: 'rm-arch-item-h' }, head),
        sub ? h('div', { className: 'rm-arch-item-sub' }, sub) : null
      );
    });

    var education = rmArchItems('education', '教育背景', rmArchList(data, 'education'), function (item) {
      var head = [];
      if (rmArchText(item.school)) head.push(h('b', { key: 'school' }, rmArchText(item.school)));
      if (rmArchText(item.degree)) head.push(h('span', { key: 'degree' }, rmArchText(item.degree)));
      if (rmArchText(item.major)) head.push(h('span', { key: 'major' }, rmArchText(item.major)));
      var sub = [rmArchText(item.period), rmArchText(item.gpa)].filter(Boolean).join(' · ');
      return h(
        'div',
        null,
        h('div', { className: 'rm-arch-item-h' }, head),
        sub ? h('div', { className: 'rm-arch-item-sub' }, sub) : null
      );
    });

    var skills = rmArchItems('skills', '技能', rmArchList(data, 'skills'), function (item) {
      var group = rmArchText(item.group) || '技能';
      var items = rmArchSkillItems(item);
      return h(
        'div',
        null,
        h(
          'div',
          { className: 'rm-arch-item-h' },
          h('b', { key: 'group' }, group),
          items ? h('span', { className: 'rm-arch-item-sub' }, items) : null
        )
      );
    });

    var awards = rmArchItems('awards', '荣誉奖项', rmArchList(data, 'awards'), function (item) {
      var head = [];
      if (rmArchText(item.title)) head.push(h('b', { key: 'title' }, rmArchText(item.title)));
      if (rmArchText(item.date)) head.push(h('span', { className: 'rm-arch-muted', key: 'date' }, rmArchText(item.date)));
      return h(
        'div',
        null,
        h('div', { className: 'rm-arch-item-h' }, head),
        rmArchText(item.desc) ? h('div', { className: 'rm-arch-item-sub' }, rmArchText(item.desc)) : null
      );
    });

    detail = h(
      'div',
      { className: 'rm-arch-detail' },
      h(
        'div',
        { className: 'rm-arch-detail-h' },
        h('b', null, selected.name || '未命名档案'),
        metaLine ? h('span', { className: 'rm-arch-muted' }, metaLine) : null,
        selected.updatedAt ? h('span', { className: 'rm-arch-muted' }, '更新于 ' + rmFormatTime(selected.updatedAt)) : null,
        h(
          'span',
          { className: 'rm-arch-row', style: { marginLeft: 'auto' } },
          h(
            'button',
            {
              type: 'button',
              className: 'rm-btn rm-btn-sm',
              onClick: function () {
                openEditForm(selected);
              },
            },
            '编辑'
          )
        )
      ),
      h(
        'dl',
        { className: 'rm-arch-kv' },
        RM_ARCH_BASIC_FIELDS.map(function (pair) {
          return h(
            'div',
            { className: 'rm-arch-kv-row', key: pair[0] },
            h('dt', null, pair[1]),
            h('dd', null, rmArchText(basics[pair[0]]) || '—')
          );
        })
      ),
      summary
        ? h('div', { className: 'rm-arch-sec' }, h('div', { className: 'rm-arch-sec-h' }, '个人简介'), h('div', { className: 'rm-arch-summary' }, summary))
        : null,
      experience,
      projects,
      education,
      skills,
      awards
    );
  }

  var tailorPanel = selected
    ? h(
        'div',
        { className: 'rm-arch-tailor' },
        h(
          'div',
          { className: 'rm-arch-tailor-h' },
          h('b', null, '按 JD 定制'),
          h('span', { className: 'rm-hint' }, '把职位描述粘进来：AI 会重写摘要、重排条目，并给出匹配度与缺口。')
        ),
        h('textarea', {
          className: 'rm-input rm-textarea rm-arch-jd',
          value: jd,
          placeholder: '粘贴职位描述（JD）…',
          onChange: function (event) {
            setJd(event.target.value);
          },
        }),
        h('input', {
          className: 'rm-input',
          value: tailorTitle,
          maxLength: 80,
          placeholder: '新简历标题（可选，默认「档案名 · 定制」）',
          onChange: function (event) {
            setTailorTitle(event.target.value);
          },
        }),
        h(
          'div',
          { className: 'rm-arch-tailor-actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'rm-btn rm-btn-primary',
              disabled: tailorBusy || !String(jd || '').trim(),
              onClick: onTailor,
            },
            tailorBusy ? 'AI 正在按 JD 定制…' : '生成定制简历'
          ),
          tailorBusy ? h('span', { className: 'rm-hint' }, '通常需要 10-40 秒，先别关面板。') : null
        ),
        tailorError ? h('div', { className: 'rm-arch-error', style: { margin: 0 } }, tailorError) : null,
        result
          ? h(
              'div',
              { className: 'rm-arch-result' },
              h(
                'div',
                { className: 'rm-arch-score' },
                h(
                  'div',
                  { className: 'rm-arch-score-h' },
                  h('span', null, '匹配度'),
                  h('b', null, result.score + ' / 100')
                ),
                h(
                  'div',
                  { className: 'rm-arch-score-bar' },
                  h('div', { className: 'rm-arch-score-fill', style: { width: result.score + '%' } })
                )
              ),
              result.notes ? h('div', { className: 'rm-arch-summary' }, result.notes) : null,
              result.gaps.length
                ? h(
                    'div',
                    { className: 'rm-arch-gaps' },
                    result.gaps.map(function (gap, index) {
                      return h('span', { className: 'rm-arch-chip', key: index, title: gap }, gap);
                    })
                  )
                : h('div', { className: 'rm-hint' }, '没有明显缺口 🎉'),
              h(
                'div',
                { className: 'rm-arch-row' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'rm-btn rm-btn-primary',
                    disabled: !result.resume,
                    onClick: onApplyResult,
                  },
                  '把这份简历载入编辑器'
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'rm-btn',
                    onClick: function () {
                      setResult(null);
                    },
                  },
                  '重新定制'
                )
              )
            )
          : null
      )
    : null;

  var leftEmpty = h(
    'div',
    { className: 'rm-arch-empty' },
    h('b', null, '还没有档案'),
    h('div', null, '先编辑一份简历，然后点右上角「从当前简历建档案」；也可以点「+ 新建档案」手动填一份关键信息。'),
    h(
      'button',
      {
        type: 'button',
        className: 'rm-btn rm-btn-sm',
        disabled: !resume || !resume.id || busy === 'fromResume',
        onClick: onFromResume,
      },
      '从当前简历建档案'
    )
  );

  var rightEmpty = h(
    'div',
    { className: 'rm-arch-empty' },
    h('b', null, archives.length ? '选一份档案' : '档案库是空的'),
    h(
      'div',
      null,
      archives.length
        ? '从左边点一份档案查看关键信息，然后在下面粘贴 JD 生成定制版简历。'
        : '档案用来记住你的关键信息：先建一份档案，之后就能针对不同岗位一键定制简历。'
    )
  );

  return h(
    'div',
    { className: 'rm-arch' },
    h('style', { dangerouslySetInnerHTML: { __html: ARCHIVE_CSS } }),
    h(
      'div',
      { className: 'rm-arch-toolbar' },
      h(
        'div',
        { className: 'rm-arch-toolbar-main' },
        h('b', null, '档案库'),
        h('span', { className: 'rm-hint' }, '把关键信息存成档案，按不同 JD 一键定制简历。')
      ),
      h(
        'div',
        { className: 'rm-arch-toolbar-actions' },
        h(
          'button',
          {
            type: 'button',
            className: 'rm-btn',
            disabled: !resume || !resume.id || busy === 'fromResume',
            title: resume && resume.id ? '把当前编辑器里的简历存成档案' : '先编辑一份简历',
            onClick: onFromResume,
          },
          busy === 'fromResume' ? '正在建档案…' : '从当前简历建档案'
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'rm-btn rm-btn-primary',
            onClick: openNewForm,
          },
          '+ 新建档案'
        )
      )
    ),
    error
      ? h(
          'div',
          { className: 'rm-arch-error' },
          h('span', null, error),
          h(
            'button',
            {
              type: 'button',
              className: 'rm-btn rm-btn-sm',
              onClick: function () {
                setError('');
              },
            },
            '知道了'
          )
        )
      : null,
    h(
      'div',
      { className: 'rm-arch-body' },
      h(
        'div',
        { className: 'rm-arch-left' },
        h('div', { className: 'rm-arch-left-h' }, '档案' + (archives.length ? '（' + archives.length + '）' : '')),
        archives.length ? h('div', { className: 'rm-arch-list' }, cards) : leftEmpty
      ),
      h('div', { className: 'rm-arch-right' }, selected ? detail : rightEmpty, tailorPanel)
    ),
    form
      ? h(
          'div',
          {
            className: 'rm-arch-modal',
            onClick: function (event) {
              if (event.target === event.currentTarget) setForm(null);
            },
          },
          h(
            'div',
            { className: 'rm-arch-modal-card' },
            h(
              'div',
              { className: 'rm-arch-modal-h' },
              h('b', null, form.id ? '编辑档案' : '新建档案'),
              h(
                'button',
                {
                  type: 'button',
                  className: 'rm-mini',
                  title: '关闭',
                  onClick: function () {
                    setForm(null);
                  },
                },
                '✕'
              )
            ),
            h(
              'div',
              { className: 'rm-arch-modal-b' },
              h(
                'div',
                { className: 'rm-fields' },
                h(
                  'label',
                  { className: 'rm-field rm-field-wide' },
                  h('span', { className: 'rm-field-k' }, '档案名（必填，≤40 字）'),
                  h('input', {
                    className: 'rm-input',
                    value: form.name,
                    maxLength: 40,
                    placeholder: '例如：后端 / 平台工程',
                    onChange: function (event) {
                      patchForm({ name: event.target.value });
                    },
                  })
                ),
                RM_ARCH_BASIC_FIELDS.map(function (pair) {
                  return h(
                    'label',
                    { className: 'rm-field', key: pair[0] },
                    h('span', { className: 'rm-field-k' }, pair[1]),
                    h('input', {
                      className: 'rm-input',
                      value: (form.basics || {})[pair[0]] || '',
                      onChange: function (event) {
                        patchBasics(pair[0], event.target.value);
                      },
                    })
                  );
                }),
                h(
                  'label',
                  { className: 'rm-field rm-field-wide' },
                  h('span', { className: 'rm-field-k' }, '个人简介'),
                  h('textarea', {
                    className: 'rm-input rm-textarea',
                    value: form.summary,
                    placeholder: '一两句话概括你的方向和亮点…',
                    onChange: function (event) {
                      patchForm({ summary: event.target.value });
                    },
                  })
                )
              ),
              formError ? h('div', { className: 'rm-arch-error rm-arch-form-error' }, formError) : null
            ),
            h(
              'div',
              { className: 'rm-arch-modal-f' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'rm-btn',
                  disabled: saving,
                  onClick: function () {
                    setForm(null);
                  },
                },
                '取消'
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'rm-btn rm-btn-primary',
                  disabled: saving,
                  onClick: onSaveForm,
                },
                saving ? '保存中…' : '保存档案'
              )
            )
          )
        )
      : null
  );
}
