/**
 * 简历市场 client — AI 对话（60）。
 *
 * 这里是一个「聊天 → 结构化简历 → 一键应用」的轻量面板：
 *  - 入口是编辑界面右下角的浮动按钮（RMChatDock），不占顶部 tab；
 *  - 用户用自然语言描述自己，Host 转发给 DeepSeek（填了 Key）或宿主 llm（没填 Key，用 DSH 当前模型）；
 *  - 模型在回复末尾输出一个 ```json 代码块（结构见 Host 的 SYSTEM_PROMPT）；
 *  - 本文件解析最后一个 json 代码块，渲染「应用到当前简历」按钮。
 *
 * 注意：本文件会被 build/build.mjs 拼进同一个模块工厂，
 * 所以不要写 import/export，直接用 00-preface.js 里的 h / useState / rmApi 等句柄。
 */

var RM_CHAT_CSS = [
  '.rm-chat{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;width:100%;}',
  '.rm-chat-head{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 18px 8px;border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);}',
  '.rm-chat-head-main{display:flex;flex-direction:column;gap:3px;min-width:0;}',
  '.rm-chat-head-main b{font-size:13px;color:var(--dsw-alias-label-primary,#1d2129);}',
  '.rm-chat-head-right{flex:0 0 auto;display:flex;align-items:center;gap:6px;}',
  '.rm-chat-note{flex:0 0 auto;margin:8px 18px 0;padding:7px 10px;border-radius:8px;font-size:12px;line-height:1.5;',
  '  color:var(--dsw-alias-label-secondary,#6b7280);background:var(--dsw-alias-bg-layer-1,#fafbfc);border:1px solid var(--dsw-alias-border-l1,#e5e7eb);}',
  '.rm-chat-warn{flex:0 0 auto;margin:8px 18px 0;padding:7px 10px;border-radius:8px;font-size:12px;line-height:1.5;',
  '  color:var(--dsw-alias-state-error-primary,#dc2626);background:var(--dsw-alias-state-error-secondary,#fef2f2);border:1px solid var(--dsw-alias-state-error-primary,#dc2626);opacity:.85;}',
  '.rm-chat-scroll{flex:1 1 auto;min-height:0;overflow:auto;padding:14px 18px 6px;display:flex;flex-direction:column;gap:10px;}',
  '.rm-chat-empty{margin:auto 0;display:flex;flex-direction:column;gap:10px;align-items:center;text-align:center;padding:24px 8px;}',
  '.rm-chat-empty h4{margin:0;font-size:14px;color:var(--dsw-alias-label-primary,#1d2129);}',
  '.rm-chat-chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:560px;}',
  '.rm-chat-chip{cursor:pointer;font-size:12px;padding:6px 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1,#e5e7eb);',
  '  background:var(--dsw-alias-bg-layer-1,#fafbfc);color:var(--dsw-alias-label-secondary,#6b7280);}',
  '.rm-chat-chip:hover{border-color:var(--dsw-alias-brand-primary,#2f6fde);color:var(--dsw-alias-brand-primary,#2f6fde);}',
  '.rm-chat-msg{display:flex;}',
  '.rm-chat-msg.is-user{justify-content:flex-end;}',
  '.rm-chat-bubble{max-width:min(680px,88%);padding:8px 11px;border-radius:12px;font-size:12.5px;line-height:1.7;white-space:pre-wrap;word-break:break-word;}',
  '.rm-chat-msg.is-user .rm-chat-bubble{background:var(--dsw-alias-brand-primary,#2f6fde);color:var(--dsw-alias-bg-base,#fff);border:1px solid transparent;border-bottom-right-radius:4px;}',
  '.rm-chat-msg.is-assistant .rm-chat-bubble{background:var(--dsw-alias-bg-layer-1,#fafbfc);color:var(--dsw-alias-label-primary,#1d2129);border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-bottom-left-radius:4px;}',
  '.rm-chat-apply{margin-top:9px;padding-top:8px;border-top:1px dashed var(--dsw-alias-border-l1,#e5e7eb);display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
  '.rm-chat-thinking{font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280);padding:2px 0 2px 4px;}',
  '.rm-chat-error{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:2px 0;padding:7px 10px;border-radius:8px;font-size:12px;',
  '  color:var(--dsw-alias-state-error-primary,#dc2626);background:var(--dsw-alias-bg-layer-1,#fafbfc);border:1px solid var(--dsw-alias-border-l1,#e5e7eb);}',
  '.rm-chat-input{flex:0 0 auto;display:flex;flex-direction:column;gap:8px;padding:10px 18px 14px;border-top:1px solid var(--dsw-alias-border-l1,#e5e7eb);}',
  '.rm-chat-text{width:100%;min-height:64px;max-height:180px;resize:vertical;box-sizing:border-box;font-family:inherit;}',
  '.rm-chat-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;}',
].join('\n');

/** 快捷开场白：点了直接作为第一条用户消息发出去。 */
var RM_CHAT_CHIPS = ['帮我从零写一份', '把我的经历改得更量化', '帮我写个人简介'];

/**
 * 解析模型回复：取「最后一个」```json 代码块，JSON.parse 成功且是对象才算 payload。
 * 成功时把该代码块从可见文本里摘掉（面板用按钮代替原始 JSON），失败时原样展示文本。
 * @param {string} text
 * @returns {{text: string, payload: object|null}}
 */
function rmChatParseReply(text) {
  var result = { text: typeof text === 'string' ? text : '', payload: null };
  if (!result.text) return result;
  var pattern = /```json\s*([\s\S]*?)```/gi;
  var last = null;
  var match = pattern.exec(result.text);
  while (match) {
    last = match;
    match = pattern.exec(result.text);
  }
  if (!last) return result;
  var parsed = null;
  try {
    parsed = JSON.parse(String(last[1]).trim());
  } catch (e) {
    parsed = null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return result;
  result.payload = parsed;
  var cut = result.text.slice(0, last.index) + result.text.slice(last.index + last[0].length);
  result.text = cut.replace(/\n{3,}/g, '\n\n').trim();
  return result;
}

/**
 * 把模型给的 data 合并进当前简历数据：
 *  - basics：只有非空字符串才覆盖（photo 也一样，不删用户原来的照片）；
 *  - summary：非空才覆盖；
 *  - experience/projects/education/skills/awards：是数组就整体替换。
 * @param {object} current 现有 data（可能是 rmBlankData()）
 * @param {object} incoming 模型给的 data
 * @returns {object} 新的 data（不修改入参）
 */
function rmChatMergeData(current, incoming) {
  var base = current && typeof current === 'object' ? current : {};
  var next = Object.assign({}, base);
  var source = incoming && typeof incoming === 'object' ? incoming : {};

  if (source.basics && typeof source.basics === 'object' && !Array.isArray(source.basics)) {
    var basics = Object.assign({}, base.basics || {});
    ['name', 'role', 'phone', 'email', 'city', 'wechat', 'github', 'website', 'photo'].forEach(function (key) {
      var value = source.basics[key];
      if (typeof value === 'string' && value.trim()) basics[key] = value.trim();
    });
    next.basics = basics;
  }
  if (typeof source.summary === 'string' && source.summary.trim()) next.summary = source.summary.trim();
  ['experience', 'projects', 'education', 'skills', 'awards'].forEach(function (key) {
    if (Array.isArray(source[key])) next[key] = source[key];
  });
  return next;
}

/**
 * AI 对话视图。
 * props:
 *  - draft: 当前简历（可能为 null；null 时允许纯聊天，应用时会新建一份）
 *  - settings: boot.settings（有 chatApiKey 就显示 DeepSeek 通道，没有就提示走 DSH 当前模型）
 *  - onApply(payload): 点「应用到当前简历」时回调，payload 形如 {title?, data}
 *  - onFold(): 可选，浮动面板的「折叠」按钮；不传就不渲染
 *  - onClose(): 可选，浮动面板的「关闭」按钮；不传就不渲染
 */
function ChatView(props) {
  var settings = props.settings || {};
  var draft = props.draft || null;

  var messagesState = useState([]);
  var messages = messagesState[0];
  var setMessages = messagesState[1];

  var inputState = useState('');
  var input = inputState[0];
  var setInput = inputState[1];

  var busyState = useState(false);
  var busy = busyState[0];
  var setBusy = busyState[1];

  var errorState = useState(null);
  var error = errorState[0];
  var setError = errorState[1];

  var appliedState = useState(-1);
  var applied = appliedState[0];
  var setApplied = appliedState[1];

  var scrollRef = useRef(null);
  var inputRef = useRef(null);

  useEffect(function () {
    var node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, busy, error]);

  // 浮动面板打开时才挂载，挂载后直接把焦点给输入框（点了按钮就能打字）。
  useEffect(function () {
    if (inputRef.current && typeof inputRef.current.focus === 'function') inputRef.current.focus();
  }, []);

  function request(history) {
    setBusy(true);
    setError(null);
    var payload = {
      messages: history.map(function (item) {
        return { role: item.role, content: item.content };
      }),
    };
    if (draft && draft.id) payload.resumeId = draft.id;
    return rmApi('/chat', { method: 'POST', body: payload }).then(
      function (value) {
        setBusy(false);
        var reply = value && typeof value.reply === 'string' ? value.reply : '';
        if (!reply) {
          setError({ text: 'AI 没有返回内容，请重试', history: history });
          return;
        }
        setMessages(history.concat([{ role: 'assistant', content: reply }]));
      },
      function (err) {
        setBusy(false);
        setError({ text: '发送失败：' + rmErrText(err), history: history });
      }
    );
  }

  function send(text) {
    var content = String(text == null ? '' : text).trim();
    if (!content || busy) return;
    var history = messages.concat([{ role: 'user', content: content }]);
    setInput('');
    setMessages(history);
    request(history);
  }

  function retry() {
    if (!error || busy) return;
    request(error.history);
  }

  function onKeyDown(event) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (event.nativeEvent && event.nativeEvent.isComposing) return;
    event.preventDefault();
    send(input);
  }

  function clearAll() {
    if (busy) return;
    setMessages([]);
    setError(null);
    setApplied(-1);
    setInput('');
    if (inputRef.current) inputRef.current.focus();
  }

  function applyPayload(payload, index) {
    if (typeof props.onApply !== 'function') return;
    props.onApply(payload);
    setApplied(index);
  }

  var hasKey = !!(settings.chatApiKey && String(settings.chatApiKey).trim());

  return h(
    'div',
    { className: 'rm-chat' },
    h('style', { key: 'rm-chat-css' }, RM_CHAT_CSS),
    h(
      'div',
      { className: 'rm-chat-head' },
      h(
        'div',
        { className: 'rm-chat-head-main' },
        h('b', null, 'AI 对话 · ' + (hasKey ? 'DeepSeek API' : 'DSH 当前模型')),
        h(
          'span',
          { className: 'rm-hint' },
          draft
            ? '当前简历：' + (draft.title || '未命名') + ' · 聊满意后点「应用到当前简历」'
            : '还没有简历：先聊，聊完可以直接从对话新建一份'
        )
      ),
      h(
        'div',
        { className: 'rm-chat-head-right' },
        messages.length
          ? h('button', { key: 'clear', type: 'button', className: 'rm-btn rm-btn-sm', disabled: busy, onClick: clearAll }, '清空')
          : null,
        typeof props.onFold === 'function'
          ? h(
              'button',
              { key: 'fold', type: 'button', className: 'rm-btn rm-btn-sm', title: '折叠成小条（对话保留）', onClick: props.onFold },
              '折叠'
            )
          : null,
        typeof props.onClose === 'function'
          ? h('button', { key: 'close', type: 'button', className: 'rm-btn rm-btn-sm', title: '关闭对话', onClick: props.onClose }, '✕')
          : null
      )
    ),
    hasKey
      ? null
      : h(
          'div',
          { className: 'rm-chat-note' },
          '不用填 Key：默认直接用你当前在 DSH 里使用的模型聊天；想改用独立的 DeepSeek API（独立计费）可到「设置」页填 Key。'
        ),
    h(
      'div',
      { className: 'rm-chat-scroll', ref: scrollRef },
      messages.length === 0
        ? h(
            'div',
            { className: 'rm-chat-empty' },
            h('h4', null, '把经历讲给我听，我帮你整理成简历'),
            h(
              'div',
              { className: 'rm-hint' },
              '信息够了我就会输出结构化简历，点一下就能应用到当前简历；信息不够我会先问最多 3 个问题。'
            ),
            h(
              'div',
              { className: 'rm-chat-chips' },
              RM_CHAT_CHIPS.map(function (chip) {
                return h(
                  'button',
                  { key: chip, type: 'button', className: 'rm-chat-chip', disabled: busy, onClick: function () { send(chip); } },
                  chip
                );
              })
            )
          )
        : messages.map(function (message, index) {
            var isUser = message.role === 'user';
            var parsed = isUser ? { text: message.content, payload: null } : rmChatParseReply(message.content);
            var showApply = !isUser && parsed.payload;
            return h(
              'div',
              { key: 'm' + index, className: 'rm-chat-msg ' + (isUser ? 'is-user' : 'is-assistant') },
              h(
                'div',
                { className: 'rm-chat-bubble' },
                parsed.text || (showApply ? '（已生成结构化简历）' : ''),
                showApply
                  ? h(
                      'div',
                      { className: 'rm-chat-apply' },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'rm-btn rm-btn-primary rm-btn-sm',
                          disabled: applied === index,
                          onClick: function () { applyPayload(parsed.payload, index); },
                        },
                        applied === index ? '已应用 ✓' : '应用到当前简历'
                      ),
                      h('span', { className: 'rm-hint' }, '只覆盖有内容的字段，不会清空你的照片等其它信息')
                    )
                  : null
              )
            );
          }),
      busy ? h('div', { className: 'rm-chat-msg is-assistant' }, h('div', { className: 'rm-chat-bubble rm-chat-thinking' }, '思考中…')) : null,
      error
        ? h(
            'div',
            { className: 'rm-chat-error' },
            h('span', null, error.text),
            h('button', { type: 'button', className: 'rm-btn rm-btn-sm', disabled: busy, onClick: retry }, '重试')
          )
        : null
    ),
    h(
      'div',
      { className: 'rm-chat-input' },
      h('textarea', {
        ref: inputRef,
        className: 'rm-input rm-chat-text',
        value: input,
        rows: 3,
        disabled: busy,
        placeholder: '例如：我叫林知夏，做了 5 年 B 端产品经理，最近在 XX 公司负责 SaaS 续费增长，续费率从 62% 提到 80%……',
        onChange: function (event) { setInput(event.target.value); },
        onKeyDown: onKeyDown,
      }),
      h(
        'div',
        { className: 'rm-chat-actions' },
        h('span', { className: 'rm-hint' }, busy ? '正在等 AI 回复…' : 'Enter 发送 · Shift+Enter 换行'),
        h(
          'button',
          { type: 'button', className: 'rm-btn rm-btn-primary', disabled: busy || !input.trim(), onClick: function () { send(input); } },
          busy ? '思考中…' : '发送'
        )
      )
    )
  );
}

/**
 * 浮动入口的样式：右下角胶囊按钮 + 浮动面板 + 折叠后的小条。
 * 只写在这里（60-chat.js），不动 10-css.js，避免和别的任务冲突。
 * 层级：按钮/面板 25（高于 toast 20，低于 modal 30），所以打开发布/导出弹窗时会被盖住。
 */
var RM_CHAT_DOCK_CSS = [
  '.rm-chat-dock{position:absolute;right:18px;bottom:18px;z-index:25;display:flex;flex-direction:column;align-items:flex-end;gap:8px;}',
  '.rm-chat-dock-fab{cursor:pointer;display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border-radius:999px;border:1px solid transparent;',
  '  font-size:12.5px;font-weight:600;color:var(--dsw-alias-bg-base,#fff);background:var(--dsw-alias-brand-primary,#2f6fde);',
  '  box-shadow:0 10px 24px rgba(47,111,222,.32);}',
  '.rm-chat-dock-fab:hover{filter:brightness(1.06);}',
  '.rm-chat-dock-fab-dot{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.85);}',
  '.rm-chat-dock-panel{width:min(430px,calc(100vw - 36px));height:min(560px,calc(100vh - 150px));min-height:360px;display:flex;flex-direction:column;',
  '  overflow:hidden;background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l2,#d5d9e0);border-radius:14px;',
  '  box-shadow:0 18px 44px rgba(15,23,42,.22);}',
  '.rm-chat-dock-mini{display:none;align-items:center;gap:8px;padding:6px 8px 6px 12px;border-radius:10px;background:var(--dsw-alias-bg-overlay,#fff);',
  '  border:1px solid var(--dsw-alias-border-l2,#d5d9e0);box-shadow:0 10px 26px rgba(15,23,42,.18);font-size:12px;color:var(--dsw-alias-label-primary,#1d2129);}',
  '.rm-chat-dock-mini b{font-size:12.5px;}',
  '.rm-chat-dock.is-mini .rm-chat-dock-panel{display:none;}',
  '.rm-chat-dock.is-mini .rm-chat-dock-mini{display:flex;}',
  /* 拖动把手：标题栏和折叠小条；拖动中禁用选中、换成抓取光标。 */
  '.rm-chat-dock .rm-chat-head{cursor:grab;touch-action:none;}',
  '.rm-chat-dock-mini{cursor:grab;touch-action:none;}',
  '.rm-chat-dock.is-dragging{transition:none;}',
  '.rm-chat-dock.is-dragging .rm-chat-dock-panel{will-change:transform;}',
  '.rm-chat-dock.is-dragging,.rm-chat-dock.is-dragging *{cursor:grabbing !important;user-select:none !important;',
  '  -webkit-user-select:none !important;}',
].join('\n');

/** 拖动：离视口边缘的最小留白（px）；起拖阈值，避免点标题栏按钮时误拖。 */
var RM_CHAT_DOCK_PAD = 8;
var RM_CHAT_DOCK_SLOP = 3;

/**
 * 把「相对右下角基点」的偏移 {x, y} 收进视口。
 * base 是不含 translate 的元素矩形（left/top/right/bottom）；
 * 约束：base.left + x >= PAD 且 base.right + x <= innerWidth - PAD（纵向同理）。
 */
function rmChatClampDock(base, x, y) {
  var vw = (typeof window !== 'undefined' && window.innerWidth) || 0;
  var vh = (typeof window !== 'undefined' && window.innerHeight) || 0;
  var pad = RM_CHAT_DOCK_PAD;
  function between(value, lo, hi) {
    if (hi < lo) return lo; // 元素比视口还大：贴住左边/上边
    if (value < lo) return lo;
    if (value > hi) return hi;
    return value;
  }
  return {
    x: between(x, pad - base.left, vw - pad - base.right),
    y: between(y, pad - base.top, vh - pad - base.bottom),
  };
}

/**
 * 右下角浮动的 AI 对话入口。
 *  - 关闭：收起成全局面板外的胶囊按钮；
 *  - 折叠：面板变成一条只留标题的小条（ChatView 只是被 CSS 隐藏，对话记录不丢）；
 *  - 拖动：按住标题栏（.rm-chat-head）或折叠小条即可挪窗口；
 *    位置存成相对右下角基点的偏移 {x, y}，只在上次位置非 0 时以 translate 应用；
 *    关闭再打开沿用上次位置（刷新页面才归零）。
 * props: { draft, settings, onApply }，直接透传给 ChatView。
 */
function RMChatDock(props) {
  var openState = useState(false);
  var open = openState[0];
  var setOpen = openState[1];
  var miniState = useState(false);
  var mini = miniState[0];
  var setMini = miniState[1];
  var posState = useState({ x: 0, y: 0 });
  var pos = posState[0];
  var setPos = posState[1];
  var draggingState = useState(false);
  var dragging = draggingState[0];
  var setDragging = draggingState[1];
  var dockRef = useRef(null);
  var posRef = useRef(pos);
  var dragRef = useRef(null);
  var listenersRef = useRef(null);
  posRef.current = pos;

  /** 元素当前矩形已经包含 translate，减去偏移即得拖动坐标系的基准矩形。 */
  function rectWithoutTranslate(element, offset) {
    var rect = element.getBoundingClientRect();
    return {
      left: rect.left - offset.x,
      top: rect.top - offset.y,
      right: rect.right - offset.x,
      bottom: rect.bottom - offset.y,
    };
  }

  function onPointerMove(event) {
    var drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    var dx = event.clientX - drag.sx;
    var dy = event.clientY - drag.sy;
    if (!drag.moved) {
      if (Math.abs(dx) < RM_CHAT_DOCK_SLOP && Math.abs(dy) < RM_CHAT_DOCK_SLOP) return;
      drag.moved = true;
    }
    setPos(rmChatClampDock(drag.base, drag.bx + dx, drag.by + dy));
    if (event.cancelable) event.preventDefault();
  }

  function onPointerUp(event) {
    var drag = dragRef.current;
    if (!drag) return;
    if (event && event.pointerId != null && event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    var listened = listenersRef.current || [];
    for (var i = 0; i < listened.length; i += 1) {
      window.removeEventListener(listened[i][0], listened[i][1]);
    }
    listenersRef.current = null;
  }

  function onPointerDown(event) {
    var target = event.target;
    if (!target || !target.closest || dragRef.current) return;
    if (!target.closest('.rm-chat-head, .rm-chat-dock-mini')) return;
    // 标题栏里的清空/折叠/关闭按钮不能启动拖动，否则点击会被吞掉。
    if (target.closest('button, a, input, textarea, select')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    var dock = dockRef.current;
    if (!dock) return;
    var rect = dock.getBoundingClientRect();
    if (!rect.width && !rect.height) return; // 还没布局（jsdom 里 rect 全 0）
    var from = posRef.current;
    dragRef.current = {
      pointerId: event.pointerId,
      sx: event.clientX,
      sy: event.clientY,
      bx: from.x,
      by: from.y,
      base: {
        left: rect.left - from.x,
        top: rect.top - from.y,
        right: rect.right - from.x,
        bottom: rect.bottom - from.y,
      },
      moved: false,
    };
    setDragging(true);
    var listened = [
      ['pointermove', onPointerMove],
      ['pointerup', onPointerUp],
      ['pointercancel', onPointerUp],
    ];
    listenersRef.current = listened;
    for (var i = 0; i < listened.length; i += 1) {
      window.addEventListener(listened[i][0], listened[i][1]);
    }
  }

  // 打开 / 折叠切换 / 窗口 resize 后面板尺寸变了，重新收进视口。
  useEffect(
    function () {
      if (!open) return undefined;
      function reclamp() {
        var dock = dockRef.current;
        if (!dock) return;
        var rect = dock.getBoundingClientRect();
        if (!rect.width && !rect.height) return;
        var cur = posRef.current;
        var next = rmChatClampDock(rectWithoutTranslate(dock, cur), cur.x, cur.y);
        if (next.x !== cur.x || next.y !== cur.y) setPos(next);
      }
      reclamp();
      window.addEventListener('resize', reclamp);
      return function () {
        window.removeEventListener('resize', reclamp);
      };
    },
    [open, mini]
  );

  // 卸载时摘掉可能还挂着的拖动监听，避免窗口级事件泄漏。
  useEffect(function () {
    return function () {
      var listened = listenersRef.current || [];
      for (var i = 0; i < listened.length; i += 1) {
        window.removeEventListener(listened[i][0], listened[i][1]);
      }
      listenersRef.current = null;
      dragRef.current = null;
    };
  }, []);

  function close() {
    onPointerUp();
    setOpen(false);
    setMini(false);
  }

  if (!open) {
    return h(
      'div',
      { className: 'rm-chat-dock' },
      h('style', { key: 'rm-chat-dock-css' }, RM_CHAT_DOCK_CSS),
      h(
        'button',
        {
          type: 'button',
          className: 'rm-chat-dock-fab',
          title: 'AI 对话：说说你的经历，帮你整理成简历',
          'aria-label': '打开 AI 对话',
          onClick: function () { setOpen(true); },
        },
        h('span', { className: 'rm-chat-dock-fab-dot' }),
        'AI 对话'
      )
    );
  }

  var dockClass = 'rm-chat-dock' + (mini ? ' is-mini' : '') + (dragging ? ' is-dragging' : '');
  return h(
    'div',
    {
      ref: dockRef,
      className: dockClass,
      style: pos.x || pos.y ? { transform: 'translate(' + pos.x + 'px, ' + pos.y + 'px)' } : undefined,
      onPointerDown: onPointerDown,
    },
    h('style', { key: 'rm-chat-dock-css' }, RM_CHAT_DOCK_CSS),
    h(
      'div',
      { key: 'mini', className: 'rm-chat-dock-mini', title: '按住这里可以拖动窗口' },
      h('b', null, 'AI 对话'),
      h('button', { type: 'button', className: 'rm-btn rm-btn-sm', onClick: function () { setMini(false); } }, '展开'),
      h('button', { type: 'button', className: 'rm-btn rm-btn-sm', title: '关闭对话', onClick: close }, '✕')
    ),
    h(
      'div',
      { key: 'panel', className: 'rm-chat-dock-panel' },
      h(ChatView, {
        draft: props.draft,
        settings: props.settings,
        onApply: props.onApply,
        onFold: function () { setMini(true); },
        onClose: close,
      })
    )
  );
}
