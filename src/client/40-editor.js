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

/** 把用户选的图片缩到最长边 480px，转成 JPEG dataURL，避免简历文件里塞原图。 */
function rmReadPhoto(file, onDone, onFail) {
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
      try {
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = hh;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, hh);
        ctx.drawImage(img, 0, 0, w, hh);
        onDone(canvas.toDataURL('image/jpeg', 0.86));
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
  function set(key) {
    return function (value) {
      var next = Object.assign({}, data);
      next[key] = value;
      props.onChange(next);
    };
  }
  var side = data.photoSide === 'left' ? 'left' : 'right';
  var shape = data.photoShape === 'square' ? 'square' : 'circle';
  function upload(event) {
    var input = event.target;
    var file = input.files && input.files[0];
    rmReadPhoto(
      file,
      function (dataUrl) {
        setErr('');
        set('photo')(dataUrl);
        input.value = '';
      },
      function (msg) {
        setErr(msg);
        input.value = '';
      }
    );
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
          data.photo ? h('img', { alt: '', src: data.photo }) : h('span', null, '无照片')
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
              ? h('button', { type: 'button', className: 'rm-btn rm-btn-danger rm-btn-sm', onClick: function () { set('photo')(''); } }, '移除照片')
              : null,
            h('span', { className: 'rm-muted' }, '可选 · 自动压缩到 480px')
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
          )
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
    hint: '学校 / 学历 / 专业 / 时间',
    children: h(ListEditor, {
      items: props.items,
      onChange: props.onChange,
      addLabel: '添加教育经历',
      makeItem: function () {
        return { school: '', degree: '', major: '', period: '', gpa: '' };
      },
      render: function (item, update) {
        return h(
          Fields2,
          null,
          h(Field, { label: '学校', value: item.school, placeholder: '某某大学', onChange: function (v) { update({ school: v }); } }),
          h(Field, { label: '学历', value: item.degree, placeholder: '本科 / 硕士', onChange: function (v) { update({ degree: v }); } }),
          h(Field, { label: '专业', value: item.major, placeholder: '信息管理与信息系统', onChange: function (v) { update({ major: v }); } }),
          h(Field, { label: '时间', value: item.period, placeholder: '2014 – 2018', onChange: function (v) { update({ period: v }); } }),
          h(Field, { label: 'GPA / 排名（可选）', value: item.gpa, placeholder: '3.8 / 4.0', wide: true, onChange: function (v) { update({ gpa: v }); } })
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

function SectionsCard(props) {
  var sections = props.sections || [];
  function move(index, delta) {
    var target = index + delta;
    if (target < 0 || target >= sections.length) return;
    var next = sections.slice();
    var tmp = next[target];
    next[target] = next[index];
    next[index] = tmp;
    props.onChange(next);
  }
  function hide(key) {
    props.onChange(sections.filter(function (k) { return k !== key; }));
  }
  function show(key) {
    props.onChange(sections.concat([key]));
  }
  var hidden = SECTION_ORDER.filter(function (k) { return sections.indexOf(k) < 0; });
  return h(
    'div',
    { className: 'rm-card' },
    h('div', { className: 'rm-card-h' }, h('h3', null, '模块顺序与显示'), h('span', { className: 'rm-muted' }, '↑ ↓ 调整顺序，预览和导出会跟着变')),
    h(
      'div',
      { className: 'rm-card-b' },
      h(
        'div',
        { className: 'rm-order-list' },
        sections.map(function (key, index) {
          return h(
            'div',
            { className: 'rm-order-row', key: key },
            h('span', { className: 'rm-order-idx' }, String(index + 1)),
            h('span', { className: 'rm-order-name' }, RM_SECTION_LABELS_UI[key] || key),
            h(
              'span',
              { className: 'rm-item-tools' },
              h('button', { type: 'button', className: 'rm-mini', title: '上移', disabled: index === 0, onClick: function () { move(index, -1); } }, '↑'),
              h('button', { type: 'button', className: 'rm-mini', title: '下移', disabled: index === sections.length - 1, onClick: function () { move(index, 1); } }, '↓'),
              h('button', { type: 'button', className: 'rm-mini rm-danger', title: '隐藏', onClick: function () { hide(key); } }, '隐藏')
            )
          );
        })
      ),
      hidden.length
        ? h(
          'div',
          { className: 'rm-sec-chips rm-order-hidden' },
          h('span', { className: 'rm-muted' }, '已隐藏：'),
          hidden.map(function (key) {
            return h(
              'button',
              { key: key, type: 'button', className: 'rm-chip', onClick: function () { show(key); } },
              '+ ' + (RM_SECTION_LABELS_UI[key] || key)
            );
          })
        )
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
