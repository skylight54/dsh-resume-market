/**
 * Host 侧 DeepSeek 对话服务：把用户的自然语言描述变成结构化简历。
 *
 * 设计取舍：
 *  - 只用一个 chat/completions 调用，不引入 SDK、不留会话状态（前端每轮带完整历史）；
 *  - system prompt 里写死简历 JSON 结构，并要求模型用 ```json 代码块输出，
 *    前端才能稳定地解析出「应用到当前简历」的 payload；
 *  - 上游错误统一映射成 chat/upstream（502），无 Key 是 chat/no-key（400），
 *    路由层直接把 code/message 透给面板，用户能看到可操作的中文提示。
 */
const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';
/** 只把最近 40 条用户/助手消息发给上游，避免上下文无限膨胀。 */
const MAX_MESSAGES = 40;
const MAX_CONTENT_CHARS = 8000;
const REQUEST_TIMEOUT_MS = 60 * 1000;
/** 当前简历作为上下文时的最大字符数（完整简历 JSON 可能很大，截断即可）。 */
const MAX_RESUME_CONTEXT_CHARS = 6000;
/** 走宿主 llm（DSH 当前模型）时的超时：流式回复比一次性 HTTP 慢，给宽松一点。 */
const HOST_TIMEOUT_MS = 120 * 1000;
/** 两条路径共用同一组生成参数，保证「免 Key」和「填 Key」的回复风格一致。 */
const TEMPERATURE = 0.4;
const MAX_REPLY_TOKENS = 2400;

/**
 * 简历顾问 system prompt。要求：
 *  - 先追问缺失关键信息，每次最多 3 个问题；
 *  - 信息足够后只输出一个 ```json 代码块，结构固定；
 *  - 不编造经历/数字，缺失留空；用户写的 XXX 占位符要明显标出。
 */
export const SYSTEM_PROMPT = [
  '你是一位中文资深简历顾问，擅长帮求职者把零散的口头描述整理成结构化、可投递的简历。你把内容整理成 JSON，由插件渲染成简历。',
  '',
  '工作方式：',
  '1. 先判断信息是否足够。缺少关键信息时，用简短具体的中文问题追问，每次回复最多 3 个问题，不要一次问一大堆。关键信息包括：姓名、目标岗位（求职意向）、工作与项目经历的时间线（公司、职位、起止时间）、可量化的成果数字（提升多少、覆盖多少人、节省多少时间等）、教育背景、联系方式。',
  '2. 用户补充后继续判断。信息足够时，直接输出一份完整的结构化简历。',
  '3. 不要反复确认，不要输出与简历无关的闲聊。',
  '',
  '输出结构化简历时的硬性要求：',
  '- 在回复的最后输出恰好一个 ```json 代码块（只输出一个），代码块外可以用一两句中文说明改了什么、还需要用户补充什么。',
  '- JSON 结构必须严格如下（字段名和层级都不要改；没有内容的字段可以省略，但 data 下这些键尽量保留）：',
  '{"title": "简历标题，例如 产品经理_上海_林知夏", "templateId": "可选模板 id，不确定就不要写", "data": {"basics": {"name": "", "role": "求职意向/目标岗位", "phone": "", "email": "", "city": "", "wechat": "", "github": "", "website": "", "photo": "可选的头像 dataURL，没有就不要写"}, "summary": "2-4 句个人简介", "experience": [{"company": "", "role": "", "period": "例如 2021.06 — 至今", "location": "", "bullets": ["每条以动词开头并带成果数字"]}], "projects": [{"name": "", "role": "", "period": "", "bullets": []}], "education": [{"school": "", "degree": "", "major": "", "period": "", "gpa": ""}], "skills": [{"group": "例如 产品能力", "items": "用、分隔的技能点"}], "awards": [{"title": "", "date": "", "desc": ""}]}}',
  '- 严禁编造：用户没说过的公司、职位、时间、数字、奖项一律不要写。缺失的字段留空字符串 ""，缺失的列表留空数组 []。',
  '- 用户提供的经历要保留原意，只做措辞优化和量化表达，不要改变事实。',
  '- 如果用户自己用了占位符（例如 XXX、某某公司、待补充），必须原样保留或明确标成「待补充」，并在代码块外提醒用户这些地方需要替换，绝对不要把它们当成真实信息。',
  '- bullets 里可以用 **加粗** 强调关键数字（例如「续费率提升 **18%**」）。',
].join('\n');

class ChatError extends Error {
  /**
   * @param {string} code 机器可读错误码
   * @param {string} message 给用户看的中文说明
   * @param {number} [status] HTTP 状态码
   */
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'ChatError';
    this.code = code;
    this.status = status;
  }
}

function messageOf(error) {
  return (error && error.message) || String(error);
}

function short(text, max) {
  const value = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  return value.slice(0, max) + '…';
}

function normalizeBaseUrl(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function settingsOf(store) {
  try {
    if (store && typeof store.settings === 'function') {
      const value = store.settings();
      if (value && typeof value === 'object') return value;
    }
  } catch {
    /* 设置读取失败时按默认值继续：下一步会因为没有 Key 给出明确提示 */
  }
  return {};
}

/** 把前端传来的历史消息收敛成上游能吃的形状（防御性，路由已经校验过一遍）。 */
function normalizeMessages(messages) {
  const list = [];
  if (Array.isArray(messages)) {
    for (const item of messages) {
      if (!item || typeof item !== 'object') continue;
      const role = item.role === 'assistant' ? 'assistant' : item.role === 'user' ? 'user' : '';
      if (!role) continue;
      const content = typeof item.content === 'string' ? item.content.slice(0, MAX_CONTENT_CHARS) : '';
      if (!content.trim()) continue;
      list.push({ role, content });
    }
  }
  return list.length > MAX_MESSAGES ? list.slice(-MAX_MESSAGES) : list;
}

/** system 消息 = 固定顾问提示 + （可选）当前简历 JSON 上下文。 */
function buildSystemPrompt(resume) {
  if (!resume || typeof resume !== 'object') return SYSTEM_PROMPT;
  let json = '';
  try {
    json = JSON.stringify(resume);
  } catch {
    return SYSTEM_PROMPT;
  }
  if (!json || json === '{}' || json === 'null') return SYSTEM_PROMPT;
  if (json.length > MAX_RESUME_CONTEXT_CHARS) json = json.slice(0, MAX_RESUME_CONTEXT_CHARS) + '…（已截断）';
  return SYSTEM_PROMPT + '\n\n当前简历（可能不完整，可在此基础上补充）：\n' + json;
}

/**
 * 从 Host 的 ctx 里防御式取服务：服务是 optional 的，可能晚挂载，
 * 所以每次对话都重新取，拿不到就返回 undefined 交给上层降级。
 */
function serviceOf(ctx, name) {
  try {
    return ctx && typeof ctx.get === 'function' ? ctx.get(name) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 解析「免 Key」通道：宿主有 llm 服务 + 默认模型选择（provider/model）才算可用。
 * @param {object} [ctx] Host 的 ctx
 * @returns {{llm: object, provider: string, model: string, reasoningEffort?: string}|null}
 */
function hostSupport(ctx) {
  const llm = serviceOf(ctx, 'llm');
  if (!llm || typeof llm.stream !== 'function') return null;
  const defaults = serviceOf(ctx, 'agentDefaultModel');
  if (!defaults || typeof defaults.currentSelection !== 'function') return null;
  let selection = null;
  try {
    selection = defaults.currentSelection();
  } catch {
    selection = null;
  }
  if (!selection || typeof selection !== 'object') return null;
  const provider = typeof selection.provider === 'string' ? selection.provider.trim() : '';
  const model = typeof selection.model === 'string' ? selection.model.trim() : '';
  if (!provider || !model) return null;
  const support = { llm, provider, model };
  if (typeof selection.reasoningEffort === 'string' && selection.reasoningEffort.trim()) {
    support.reasoningEffort = selection.reasoningEffort.trim();
  }
  return support;
}

/**
 * Host 的 llm 只接受 request-only 的 user 输入（assistant 消息必须是带 id/source 的持久消息），
 * 所以把前端历史折叠成 user 轮：助手回复以「你之前的回复」引用进下一条用户消息。
 * 这样多轮对话的上下文不会丢，又不用伪造 Host 内部的消息形状。
 * @param {Array<{role: string, content: string}>} conversation
 * @returns {Array<{role: 'user', content: Array<{type: 'text', text: string}>}>}
 */
function hostMessages(conversation) {
  const turns = [];
  let pending = ''; // 上一条（或几条）助手回复，折叠进紧随其后的 user 消息
  for (const item of conversation) {
    if (item.role === 'assistant') {
      pending = pending ? pending + '\n\n' + item.content : item.content;
      continue;
    }
    turns.push({ text: item.content, reply: pending });
    pending = '';
  }
  if (pending) {
    // 历史以助手回复结尾（正常不会发生）：并进最后一条 user 消息，保持最后一条是 user。
    const last = turns.length ? turns[turns.length - 1] : null;
    if (!last) turns.push({ text: '', reply: pending });
    else last.reply = last.reply ? last.reply + '\n\n' + pending : pending;
  }
  const multi = turns.length > 1;
  return turns.map((turn) => {
    let text = '';
    if (turn.reply) text += '你之前的回复（供参考，不要重复）：\n' + turn.reply + '\n\n';
    text += turn.text ? (multi ? '用户：' + turn.text : turn.text) : '用户：（继续上面的对话）';
    return { role: 'user', content: [{ type: 'text', text }] };
  });
}

/** 把上游的 HTTP 错误翻成一句用户能看懂、又能定位问题的中文。 */
function upstreamReason(status, detail) {
  const base =
    status === 401
      ? 'DeepSeek 说 API Key 无效或已过期（HTTP 401）'
      : status === 402
        ? 'DeepSeek 账户余额不足（HTTP 402）'
        : status === 403
          ? '当前 API Key 没有访问该模型的权限（HTTP 403）'
          : status === 429
            ? '请求太频繁或额度已用尽（HTTP 429）'
            : 'DeepSeek 返回 HTTP ' + status;
  return detail ? base + '：' + detail : base + '，请稍后重试';
}

/**
 * @param {{store?: {settings?: () => object}, log?: (message: string) => void, ctx?: object}} [options]
 *  - store：读 settings（chatApiKey / chatModel / chatBaseUrl）；
 *  - log：警告日志；
 *  - ctx：Host 的 ctx，用来 optional 访问 llm / agentDefaultModel（免 Key 通道）。
 * @returns {{chat: (input: {messages?: Array<{role: string, content: string}>, resume?: object}) => Promise<{reply: string, model: string, mode: 'api'|'host', usage: object|null, durationMs: number}>}}
 */
export function createChatService({ store, log, ctx } = {}) {
  const warn = typeof log === 'function' ? log : () => {};

  /**
   * 免 Key 通道：直接用宿主 llm 服务 + DSH 当前模型生成回复。
   * 模型报错/超时是 chat/upstream，便于面板提示用户重试或换回 Key 通道。
   */
  async function chatViaHost(support, conversation, resume) {
    const messages = hostMessages(conversation);
    if (!messages.length) {
      throw new ChatError('chat/bad-messages', '对话内容不能为空', 400);
    }
    const options = {
      provider: support.provider,
      model: support.model,
      messages,
      system: buildSystemPrompt(resume),
      temperature: TEMPERATURE,
      maxTokens: MAX_REPLY_TOKENS,
    };
    if (support.reasoningEffort) options.reasoningEffort = support.reasoningEffort;

    const controller = new AbortController();
    options.signal = controller.signal;
    const timer = setTimeout(() => controller.abort(), HOST_TIMEOUT_MS);
    const startedAt = Date.now();
    let reply = '';
    let usage = null;
    let failure = null;
    try {
      for await (const chunk of support.llm.stream(options)) {
        if (!chunk || typeof chunk !== 'object') continue;
        if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
          reply += chunk.text;
        } else if (chunk.type === 'usage' && chunk.usage && typeof chunk.usage === 'object') {
          usage = chunk.usage;
        } else if (chunk.type === 'finish') {
          const reason = chunk.reason && typeof chunk.reason === 'object' ? chunk.reason : null;
          if (reason && (reason.kind === 'error' || reason.kind === 'aborted')) {
            failure = reason.failure && typeof reason.failure === 'object' ? reason.failure : {};
          }
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ChatError('chat/upstream', '宿主模型请求超时（120 秒），请重试', 502);
      }
      warn('chat: 宿主 llm 调用失败：' + messageOf(error));
      throw new ChatError('chat/upstream', '宿主模型调用失败：' + short(messageOf(error), 120), 502);
    } finally {
      clearTimeout(timer);
    }
    if (failure) {
      const detail = typeof failure.message === 'string' && failure.message ? failure.message : '未知原因';
      warn('chat: 宿主模型返回错误：' + detail);
      throw new ChatError('chat/upstream', '宿主模型报错：' + short(detail, 160), 502);
    }
    const text = reply.trim();
    if (!text) {
      throw new ChatError('chat/upstream', '宿主模型没有返回内容（可能额度不足或模型异常），请重试', 502);
    }
    return { reply: text, model: support.model, mode: 'host', usage, durationMs: Date.now() - startedAt };
  }

  async function chat({ messages, resume } = {}) {
    const settings = settingsOf(store);
    const apiKey = typeof settings.chatApiKey === 'string' ? settings.chatApiKey.trim() : '';
    const conversation = normalizeMessages(messages);
    if (!conversation.length) {
      throw new ChatError('chat/bad-messages', '对话内容不能为空', 400);
    }
    // 没填 Key 时优先走宿主 llm（用用户当前 DSH 模型，不额外配 Key）；
    // 宿主也没有可用模型时，才提示去设置页填 Key。
    if (!apiKey) {
      const support = hostSupport(ctx);
      if (!support) {
        throw new ChatError(
          'chat/no-key',
          '没有可用的 AI 模型：请到设置页填写 DeepSeek API Key，或确认 DSH 已配置默认模型',
          400,
        );
      }
      return chatViaHost(support, conversation, resume);
    }
    const baseUrl = normalizeBaseUrl(settings.chatBaseUrl);
    const model =
      typeof settings.chatModel === 'string' && settings.chatModel.trim() ? settings.chatModel.trim() : DEFAULT_MODEL;
    if (typeof fetch !== 'function') {
      throw new ChatError('chat/upstream', '当前运行环境不支持 fetch，无法请求 DeepSeek', 502);
    }

    const payload = {
      model,
      messages: [{ role: 'system', content: buildSystemPrompt(resume) }].concat(conversation),
      temperature: TEMPERATURE,
      max_tokens: MAX_REPLY_TOKENS,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const startedAt = Date.now();
    let response;
    try {
      response = await fetch(baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ChatError('chat/upstream', '请求 DeepSeek 超时（60 秒），请检查网络后重试', 502);
      }
      warn('chat: 请求 DeepSeek 失败：' + messageOf(error));
      throw new ChatError('chat/upstream', '连不上 DeepSeek：' + short(messageOf(error), 120), 502);
    } finally {
      clearTimeout(timer);
    }

    if (!response || !response.ok) {
      const status = response && typeof response.status === 'number' ? response.status : 0;
      let detail = '';
      try {
        if (response && typeof response.text === 'function') detail = short(await response.text(), 160);
      } catch {
        detail = '';
      }
      warn('chat: 上游 HTTP ' + status + (detail ? '：' + detail : ''));
      throw new ChatError('chat/upstream', upstreamReason(status, detail), 502);
    }

    let body;
    try {
      body = await response.json();
    } catch {
      throw new ChatError('chat/upstream', 'DeepSeek 返回的内容不是合法 JSON', 502);
    }
    const choice = body && Array.isArray(body.choices) ? body.choices[0] : null;
    const content = choice && choice.message && typeof choice.message.content === 'string' ? choice.message.content : '';
    const reply = content.trim();
    if (!reply) {
      throw new ChatError('chat/upstream', 'DeepSeek 没有返回内容（可能额度不足或模型异常），请重试', 502);
    }
    return {
      reply,
      model: body && typeof body.model === 'string' && body.model ? body.model : model,
      mode: 'api',
      usage: body && body.usage && typeof body.usage === 'object' ? body.usage : null,
      durationMs: Date.now() - startedAt,
    };
  }

  return { chat };
}
