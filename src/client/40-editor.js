/**
 * 简历市场 client — 40 结构化编辑器。
 * 重点：个人信息按「字段 × 网格」拆开，每个字段独立输入框、预览里独立单元格，
 * 彻底避免 AI 直接生成时把电话/邮箱/城市/链接糊成一段的问题。
 */

function Field(props) {
  return h(
    'label',
    { className: 'rm-field' + (props.wide ? ' rm-field-wide' : '') },
    h('span', { className: 'rm-field-k' }, props.label),
    h('input', {
      className: 'rm-input',
      type: props.type || 'text',
      value: props.value == null ? '' : String(props.value),
      placeholder: props.placeholder || '',
      spellCheck: false,
      onChange: function (event) {
        props.onChange(event.target.value);
      },
    })
  );
}

function Area(props) {
  return h(
    'label',
    { className: 'rm-field rm-field-wide' },
    h('span', { className: 'rm-field-k' }, props.label),
    h('textarea', {
      className: 'rm-input rm-textarea',
      rows: props.rows || 4,
      value: props.value == null ? '' : String(props.value),
      placeholder: props.placeholder || '',
      onChange: function (event) {
        props.onChange(event.target.value);
      },
    })
  );
}

function Fields2(props) {
  return h('div', { className: 'rm-fields' }, props.children);
}

/** 列表型编辑器的通用外壳：编号、上下移动、删除、新增。 */
function ListEditor(props) {
  var items = props.items || [];
  var onChange = props.onChange;
  function move(index, delta) {
    var next = items.slice();
    var target = index + delta;
    if (target < 0 || target >= next.length) return;
    var tmp = next[target];
    next[target] = next[index];
    next[index] = tmp;
    onChange(next);
  }
  function remove(index) {
    onChange(items.filter(function (_item, i) { return i !== index; }));
  }
  function add() {
    onChange(items.concat([props.makeItem()]));
  }
  return h('div', { className: 'rm-list' }, items.map(function (item, index) {
    var update = function (patch) {
      var next = items.slice();
      next[index] = Object.assign({}, item, patch);
      onChange(next);
    };
    return h(
      'div',
      { className: 'rm-item-edit', key: index },
      h(
        'div',
        { className: 'rm-item-edit-h' },
        h('span', { className: 'rm-item-idx' }, '#' + (index + 1)),
        h(
          'span',
          { className: 'rm-item-tools' },
          h('button', { type: 'button', className: 'rm-mini', title: '上移', disabled: index === 0, onClick: function () { move(index, -1); } }, '↑'),
          h('button', { type: 'button', className: 'rm-mini', title: '下移', disabled: index === items.length - 1, onClick: function () { move(index, 1); } }, '↓'),
          h('button', { type: 'button', className: 'rm-mini rm-danger', title: '删除', onClick: function () { remove(index); } }, '×')
        )
      ),
      props.render(item, update)
    );
  }), h('button', { type: 'button', className: 'rm-add', onClick: add }, '+ ' + props.addLabel));
}

function BulletsArea(props) {
  var text = (props.bullets || []).join('\n');
  return h(Area, {
    label: props.label || '工作要点（每行一条，可用 **加粗** 强调关键词）',
    rows: 4,
    value: text,
    placeholder: '负责 xxx，把 xxx 从 A 提升到 B\n主导 xxx 项目，覆盖 xxx 用户',
    onChange: function (value) {
      props.onChange(value.split('\n').map(function (line) { return line.trim(); }).filter(Boolean));
    },
  });
}

/**
 * 把用户选的图片缩到最长边 480px，转成 JPEG dataURL，避免简历文件里塞原图。
 * fit=cover：再居中裁成 1:1（正方形证件照）；fit=contain：保留原始比例、不裁切。
 */
function rmReadPhoto(file, fit, onDone, onFail) {
  if (!file) return;
  if (!/^image\//.test(file.type || '')) {
    if (onFail) onFail('请选择图片文件（JPG / PNG / WebP）');
    return;
  }
  var reader = new FileReader();
  reader.onerror = function () { if (onFail) onFail('读取图片失败，换一张试试'); };
  reader.onload = function () {
    var img = new Image();
    img.onerror = function () { if (onFail) onFail('这张图片无法识别'); };
    img.onload = function () {
      var max = 480;
      var scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
      var w = Math.max(1, Math.round((img.width || 1) * scale));
      var hh = Math.max(1, Math.round((img.height || 1) * scale));
      // cover：以短边为正方形边长，居中裁切；contain：画布保持原始比例。
      var square = fit !== 'contain';
      var side = Math.min(w, hh);
      var outW = square ? side : w;
      var outH = square ? side : hh;
      var sx = square ? Math.round((w - side) / 2) : 0;
      var sy = square ? Math.round((hh - side) / 2) : 0;
      try {
        var canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, outW, outH);
        ctx.drawImage(img, sx, sy, outW, outH, 0, 0, outW, outH);
        onDone(canvas.toDataURL('image/jpeg', 0.85));
      } catch (err) {
        if (onFail) onFail('图片处理失败，换一张试试');
      }
    };
    img.src = String(reader.result || '');
  };
  reader.readAsDataURL(file);
}

function BasicsCard(props) {
  var data = props.data || {};
  var errState = useState('');
  var err = errState[0];
  var setErr = errState[1];
  var noteState = useState('');
  var note = noteState[0];
  var setNote = noteState[1];
  function set(key) {
    return function (value) {
      var next = Object.assign({}, data);
      next[key] = value;
      props.onChange(next);
    };
  }
  var side = data.photoSide === 'left' ? 'left' : 'right';
  var shape = data.photoShape === 'square' ? 'square' : 'circle';
  var fit = data.photoFit === 'contain' ? 'contain' : 'cover';
  function upload(event) {
    var input = event.target;
    var file = input.files && input.files[0];
    rmReadPhoto(
      file,
      fit,
      function (dataUrl) {
        setErr('');
        setNote('');
        set('photo')(dataUrl);
        input.value = '';
      },
      function (msg) {
        setErr(msg);
        input.value = '';
      }
    );
  }
  function switchFit(next) {
    set('photoFit')(next);
    // 已经按正方形裁切过的图无法还原成完整比例，只能提示重新上传。
    if (next === 'contain' && data.photo && fit === 'cover') {
      setNote('等比模式会完整显示整张图；当前照片已按正方形裁切，建议重新上传原图。');
    } else {
      setNote('');
    }
  }
  return h(
    'div',
    { className: 'rm-card' },
    h('div', { className: 'rm-card-h' }, h('h3', null, '个人信息'), h('span', { className: 'rm-muted' }, '每个字段单独成格 · 预览两列排布')),
    h(
      'div',
      { className: 'rm-card-b' },
      h(
        Fields2,
        null,
        h(Field, { label: '姓名', value: data.name, placeholder: '林知夏', onChange: set('name') }),
        h(Field, { label: '求职意向 / 职位', value: data.role, placeholder: '高级产品经理', onChange: set('role') }),
        h(Field, { label: '电话', value: data.phone, placeholder: '138 0013 8000', onChange: set('phone') }),
        h(Field, { label: '邮箱', value: data.email, placeholder: 'you@example.com', onChange: set('email') }),
        h(Field, { label: '城市', value: data.city, placeholder: '上海', onChange: set('city') }),
        h(Field, { label: '微信', value: data.wechat, placeholder: 'wechat_id', onChange: set('wechat') }),
        h(Field, { label: 'GitHub', value: data.github, placeholder: 'github.com/you', onChange: set('github') }),
        h(Field, { label: '个人主页', value: data.website, placeholder: 'you.dev', onChange: set('website') })
      ),
      h(
        'div',
        { className: 'rm-photo-edit' },
        h(
          'div',
          { className: 'rm-photo-thumb' + (data.photo ? '' : ' is-empty') },
          data.photo
            ? h('img', { alt: '', src: data.photo, className: fit === 'contain' ? 'rm-photo-contain' : '' })
            : h('span', null, '无照片')
        ),
        h(
          'div',
          { className: 'rm-photo-meta' },
          h(
            'div',
            { className: 'rm-row rm-row-wrap' },
            h(
              'label',
              { className: 'rm-btn rm-btn-sm' },
              data.photo ? '换一张照片' : '上传照片',
              h('input', { type: 'file', accept: 'image/*', onChange: upload, style: { display: 'none' } })
            ),
            data.photo
              ? h('button', { type: 'button', className: 'rm-btn rm-btn-danger rm-btn-sm', onClick: function () { set('photo')(''); setNote(''); } }, '移除照片')
              : null,
            h('span', { className: 'rm-muted' }, '可选 · 自动压缩，最长边 480px')
          ),
          err ? h('div', { className: 'rm-hint rm-text-danger' }, err) : null,
          h(
            'div',
            { className: 'rm-toggle-row' },
            h('span', { className: 'rm-toggle-k' }, '照片位置'),
            h('button', { type: 'button', className: 'rm-mini' + (side === 'left' ? ' is-on' : ''), onClick: function () { set('photoSide')('left'); } }, '左侧'),
            h('button', { type: 'button', className: 'rm-mini' + (side === 'right' ? ' is-on' : ''), onClick: function () { set('photoSide')('right'); } }, '右侧')
          ),
          h(
            'div',
            { className: 'rm-toggle-row' },
            h('span', { className: 'rm-toggle-k' }, '照片形状'),
            h('button', { type: 'button', className: 'rm-mini' + (shape === 'circle' ? ' is-on' : ''), onClick: function () { set('photoShape')('circle'); } }, '圆形'),
            h('button', { type: 'button', className: 'rm-mini' + (shape === 'square' ? ' is-on' : ''), onClick: function () { set('photoShape')('square'); } }, '方形')
          ),
          h(
            'div',
            { className: 'rm-toggle-row' },
            h('span', { className: 'rm-toggle-k' }, '压缩方式'),
            h(
              'button',
              { type: 'button', className: 'rm-mini' + (fit === 'cover' ? ' is-on' : ''), onClick: function () { switchFit('cover'); }, title: '自动压缩成正方形：居中裁切多余部分，适合证件照' },
              '正方形裁切'
            ),
            h(
              'button',
              { type: 'button', className: 'rm-mini' + (fit === 'contain' ? ' is-on' : ''), onClick: function () { switchFit('contain'); }, title: '等比压缩：完整显示整张图，两侧/上下留白' },
              '等比完整'
            )
          ),
          note ? h('div', { className: 'rm-hint' }, note) : null
        )
      )
    )
  );
}

function SummaryCard(props) {
  return h(
    'div',
    { className: 'rm-card' },
    h('div', { className: 'rm-card-h' }, h('h3', null, '个人简介'), h('span', { className: 'rm-muted' }, '2–3 句话，说清年限、领域、最强战绩')),
    h('div', { className: 'rm-card-b' }, h(Area, { label: '', rows: 4, value: props.value, placeholder: '8 年 B 端产品经验，主导过 3 个千万级营收产品线…', onChange: props.onChange }))
  );
}

function card(props) {
  return h(
    'div',
    { className: 'rm-card' },
    h('div', { className: 'rm-card-h' }, h('h3', null, props.title), h('span', { className: 'rm-muted' }, props.hint || '')),
    h('div', { className: 'rm-card-b' }, props.children)
  );
}

function ExperienceCard(props) {
  return card({
    title: '工作经历',
    hint: '公司 / 职位 / 时间 / 地点 + 要点',
    children: h(ListEditor, {
      items: props.items,
      onChange: props.onChange,
      addLabel: '添加一段工作经历',
      makeItem: function () {
        return { company: '', role: '', period: '', location: '', bullets: [] };
      },
      render: function (item, update) {
        return h(
          'div',
          { className: 'rm-col' },
          h(
            Fields2,
            null,
            h(Field, { label: '公司', value: item.company, placeholder: '某某科技', onChange: function (v) { update({ company: v }); } }),
            h(Field, { label: '职位', value: item.role, placeholder: '高级产品经理', onChange: function (v) { update({ role: v }); } }),
            h(Field, { label: '时间', value: item.period, placeholder: '2021.06 – 至今', onChange: function (v) { update({ period: v }); } }),
            h(Field, { label: '地点', value: item.location, placeholder: '上海', onChange: function (v) { update({ location: v }); } })
          ),
          h(BulletsArea, { bullets: item.bullets, onChange: function (v) { update({ bullets: v }); } })
        );
      },
    }),
  });
}

function ProjectsCard(props) {
  return card({
    title: '项目经历',
    hint: '选 1–3 个能打的项目',
    children: h(ListEditor, {
      items: props.items,
      onChange: props.onChange,
      addLabel: '添加一个项目',
      makeItem: function () {
        return { name: '', role: '', period: '', bullets: [] };
      },
      render: function (item, update) {
        return h(
          'div',
          { className: 'rm-col' },
          h(
            Fields2,
            null,
            h(Field, { label: '项目名', value: item.name, placeholder: '智能客服中台', onChange: function (v) { update({ name: v }); } }),
            h(Field, { label: '角色', value: item.role, placeholder: '产品负责人', onChange: function (v) { update({ role: v }); } }),
            h(Field, { label: '时间', value: item.period, placeholder: '2022.03 – 2022.11', wide: true, onChange: function (v) { update({ period: v }); } })
          ),
          h(BulletsArea, { bullets: item.bullets, label: '项目要点（每行一条）', onChange: function (v) { update({ bullets: v }); } })
        );
      },
    }),
  });
}

function EducationCard(props) {
  return card({
    title: '教育背景',
    hint: '学校 / 学历 / 专业 / 时间 · 主修课程可选',
    children: h(ListEditor, {
      items: props.items,
      onChange: props.onChange,
      addLabel: '添加教育经历',
      makeItem: function () {
        return { school: '', degree: '', major: '', period: '', gpa: '', courses: '' };
      },
      render: function (item, update) {
        return h(
          Fields2,
          null,
          h(Field, { label: '学校', value: item.school, placeholder: '某某大学', onChange: function (v) { update({ school: v }); } }),
          h(Field, { label: '学历', value: item.degree, placeholder: '本科 / 硕士', onChange: function (v) { update({ degree: v }); } }),
          h(Field, { label: '专业', value: item.major, placeholder: '信息管理与信息系统', onChange: function (v) { update({ major: v }); } }),
          h(Field, { label: '时间', value: item.period, placeholder: '2014 – 2018', onChange: function (v) { update({ period: v }); } }),
          h(Field, { label: 'GPA / 排名（可选）', value: item.gpa, placeholder: '3.8 / 4.0', onChange: function (v) { update({ gpa: v }); } }),
          h(Field, { label: '主修课程（可选）', value: item.courses, placeholder: '数据结构、计量经济学', wide: true, onChange: function (v) { update({ courses: v }); } })
        );
      },
    }),
  });
}

function SkillsCard(props) {
  return card({
    title: '专业技能',
    hint: '一行一组，标签用顿号分隔',
    children: h(ListEditor, {
      items: props.items,
      onChange: props.onChange,
      addLabel: '添加一组技能',
      makeItem: function () {
        return { group: '', items: '' };
      },
      render: function (item, update) {
        return h(
          Fields2,
          null,
          h(Field, { label: '分组名', value: item.group, placeholder: '产品能力', onChange: function (v) { update({ group: v }); } }),
          h(Field, { label: '技能标签', value: Array.isArray(item.items) ? item.items.join('、') : item.items, placeholder: '需求分析、数据分析、用户研究', onChange: function (v) { update({ items: v }); } })
        );
      },
    }),
  });
}

function AwardsCard(props) {
  return card({
    title: '荣誉奖项',
    hint: '可选',
    children: h(ListEditor, {
      items: props.items,
      onChange: props.onChange,
      addLabel: '添加一条荣誉',
      makeItem: function () {
        return { title: '', date: '', desc: '' };
      },
      render: function (item, update) {
        return h(
          'div',
          { className: 'rm-col' },
          h(
            Fields2,
            null,
            h(Field, { label: '奖项', value: item.title, placeholder: '年度最佳产品经理', onChange: function (v) { update({ title: v }); } }),
            h(Field, { label: '时间', value: item.date, placeholder: '2023', onChange: function (v) { update({ date: v }); } })
          ),
          h(Area, { label: '说明（可选）', rows: 2, value: item.desc, onChange: function (v) { update({ desc: v }); } })
        );
      },
    }),
  });
}

var RM_SECTION_LABELS_UI = { summary: '个人简介', experience: '工作经历', projects: '项目经历', education: '教育背景', skills: '专业技能', awards: '荣誉奖项' };

/**
 * 模块顺序与显示：
 *  - 拖动左侧把手（HTML5 draggable）调整顺序，悬停行显示插入位；
 *  - 小按钮 ↑ / ↓ 也能排序（键盘 / 触屏友好，jsdom 测试走这条路径）；
 *  - 眼睛按钮切换隐藏 / 显示，隐藏的模块仍留在列表里但变灰；
 *  - 所有变化都直接改 resume.sections，预览与导出随之实时更新。
 */
function SectionsCard(props) {
  var sections = props.sections || [];
  var dragState = useState('');
  var dragKey = dragState[0];
  var setDragKey = dragState[1];
  var overState = useState('');
  var overKey = overState[0];
  var setOverKey = overState[1];

  function move(index, delta) {
    var target = index + delta;
    if (target < 0 || target >= sections.length) return;
    var next = sections.slice();
    var tmp = next[target];
    next[target] = next[index];
    next[index] = tmp;
    props.onChange(next);
  }
  function reorder(fromKey, toKey) {
    var from = sections.indexOf(fromKey);
    var to = sections.indexOf(toKey);
    if (from < 0 || to < 0 || from === to) return;
    var next = sections.slice();
    next.splice(from, 1);
    next.splice(to, 0, fromKey);
    props.onChange(next);
  }
  function hide(key) {
    props.onChange(sections.filter(function (k) { return k !== key; }));
  }
  function show(key) {
    props.onChange(sections.concat([key]));
  }
  function toggle(key) {
    if (sections.indexOf(key) >= 0) hide(key);
    else show(key);
  }
  function endDrag() {
    setDragKey('');
    setOverKey('');
  }
  function drop(event, key) {
    if (event && event.preventDefault) event.preventDefault();
    var from = dragKey;
    if (!from && event && event.dataTransfer) {
      try {
        from = event.dataTransfer.getData('text/plain');
      } catch (err) {
        /* jsdom 里可能没有 dataTransfer */
      }
    }
    endDrag();
    if (from) reorder(from, key);
  }

  var hidden = SECTION_ORDER.filter(function (k) { return sections.indexOf(k) < 0; });
  // 可见模块按 sections 顺序在前，隐藏模块附在最后但仍在列表里显示（变灰）。
  var rows = sections.concat(hidden);
  var dragIndex = dragKey ? sections.indexOf(dragKey) : -1;

  return h(
    'div',
    { className: 'rm-card' },
    h(
      'div',
      { className: 'rm-card-h' },
      h('h3', null, '模块顺序与显示'),
      h('span', { className: 'rm-muted' }, '拖动 ⠿ 排序 · 点眼睛隐藏 / 显示 · 预览实时跟随')
    ),
    h(
      'div',
      { className: 'rm-card-b' },
      h(
        'div',
        { className: 'rm-order-list' },
        rows.map(function (key, index) {
          var visible = sections.indexOf(key) >= 0;
          var cls = 'rm-order-row' + (visible ? '' : ' is-hidden');
          if (dragKey === key) cls += ' is-dragging';
          if (visible && overKey === key && dragKey && dragKey !== key) {
            cls += dragIndex >= 0 && index > dragIndex ? ' is-drop-below' : ' is-drop-above';
          }
          return h(
            'div',
            {
              key: key,
              className: cls,
              onDragOver: function (event) {
                if (!dragKey || dragKey === key) return;
                if (event.preventDefault) event.preventDefault();
                if (event.dataTransfer) {
                  try { event.dataTransfer.dropEffect = 'move'; } catch (err) { /* ignore */ }
                }
                if (overKey !== key) setOverKey(key);
              },
              onDragLeave: function () {
                if (overKey === key) setOverKey('');
              },
              onDrop: function (event) { drop(event, key); },
            },
            h(
              'span',
              {
                className: 'rm-order-grip',
                title: visible ? '拖动排序' : '已隐藏，点眼睛恢复',
                draggable: visible ? true : undefined,
                onDragStart: function (event) {
                  if (!visible) return;
                  setDragKey(key);
                  if (event && event.dataTransfer) {
                    try {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', key);
                    } catch (err) {
                      /* ignore */
                    }
                  }
                },
                onDragEnd: endDrag,
              },
              visible ? '⠿' : '·'
            ),
            h('span', { className: 'rm-order-idx' }, visible ? String(index + 1) : '–'),
            h('span', { className: 'rm-order-name' }, RM_SECTION_LABELS_UI[key] || key),
            h(
              'span',
              { className: 'rm-item-tools' },
              h(
                'button',
                { type: 'button', className: 'rm-mini rm-mini-xs', title: '上移', disabled: !visible || index === 0, onClick: function () { move(index, -1); } },
                '↑'
              ),
              h(
                'button',
                { type: 'button', className: 'rm-mini rm-mini-xs', title: '下移', disabled: !visible || index === sections.length - 1, onClick: function () { move(index, 1); } },
                '↓'
              ),
              h(
                'button',
                { type: 'button', className: 'rm-mini rm-mini-xs rm-order-eye' + (visible ? '' : ' is-on'), title: visible ? '隐藏' : '显示', onClick: function () { toggle(key); } },
                '👁'
              )
            )
          );
        })
      ),
      hidden.length
        ? h('div', { className: 'rm-muted rm-order-tip' }, '灰色模块已隐藏，预览 / 导出不会包含；点眼睛恢复。')
        : null
    )
  );
}

/** 结构化编辑器主体：props { data, sections, onData, onSections } */
function EditorForm(props) {
  var data = props.data;
  function patch(key) {
    return function (value) {
      var next = Object.assign({}, data);
      next[key] = value;
      props.onData(next);
    };
  }
  return h(
    'div',
    { className: 'rm-form' },
    h(BasicsCard, { data: data.basics, onChange: patch('basics') }),
    h(SectionsCard, { sections: props.sections, onChange: props.onSections }),
    h(SummaryCard, { value: data.summary, onChange: patch('summary') }),
    h(ExperienceCard, { items: data.experience, onChange: patch('experience') }),
    h(ProjectsCard, { items: data.projects, onChange: patch('projects') }),
    h(EducationCard, { items: data.education, onChange: patch('education') }),
    h(SkillsCard, { items: data.skills, onChange: patch('skills') }),
    h(AwardsCard, { items: data.awards, onChange: patch('awards') })
  );
}
