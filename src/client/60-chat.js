/**
 * 简历市场 client — AI 对话（60）。
 *
 * 这里是一个「聊天 → 结构化简历 → 一键应用」的轻量面板：
 *  - 用户用自然语言描述自己，Host 转发给 DeepSeek；
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
 *  - settings: boot.settings（用 chatApiKey 判断是否已配置，显示引导）
 *  - onApply(payload): 点「应用到当前简历」时回调，payload 形如 {title?, data}
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

  var noKey = !settings.chatApiKey;

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
        h('b', null, 'AI 对话 · DeepSeek'),
        h(
          'span',
          { className: 'rm-hint' },
          draft
            ? '当前简历：' + (draft.title || '未命名') + ' · 聊满意后点「应用到当前简历」'
            : '还没有简历：先聊，聊完可以直接从对话新建一份'
        )
      ),
      messages.length
        ? h('button', { type: 'button', className: 'rm-btn rm-btn-sm', disabled: busy, onClick: clearAll }, '清空对话')
        : null
    ),
    noKey
      ? h(
          'div',
          { className: 'rm-chat-warn' },
          '还没填 DeepSeek API Key：先到「设置」页填上（保存在本机），再回来聊天。'
        )
      : null,
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
        h('span', { className: 'rm-hint' }, busy ? '正在等 DeepSeek 回复…' : 'Enter 发送 · Shift+Enter 换行'),
        h(
          'button',
          { type: 'button', className: 'rm-btn rm-btn-primary', disabled: busy || !input.trim(), onClick: function () { send(input); } },
          busy ? '思考中…' : '发送'
        )
      )
    )
  );
}
