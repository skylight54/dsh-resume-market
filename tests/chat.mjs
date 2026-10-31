/**
 * AI 对话测试：stub 全局 fetch（不联网），直接驱动 Host 的 chat 服务与 /chat 路由。
 *
 * 覆盖：
 *  - 正常路径：请求 URL / headers / body、reply / model / usage / durationMs；
 *  - 无 Key：有宿主 llm 时走免 Key 通道（mode:host），llm 不可用时才是 chat/no-key + 400；
 *  - 宿主通道：多轮历史折叠、finish 报错、stream 抛错、有 Key 时不占用宿主模型；
 *  - 上游 5xx：chat/upstream + 502；
 *  - 网络错误、非 JSON 响应、空 choices；
 *  - 当前简历进入 system 上下文、历史消息只保留最近 40 条；
 *  - 路由层：成功、role/content/条数校验、无 Key、resumeId 上下文、免 Key 走宿主。
 *
 * 运行：node tests/chat.mjs
 */
import assert from 'node:assert/strict';

import { createChatService, SYSTEM_PROMPT } from '../src/chat.js';
import { createHandler } from '../src/routes.js';

const originalFetch = globalThis.fetch;

/** 记录最近一次 stub 收到的 fetch 调用。 */
let calls = [];

function stubFetch(handler) {
  calls = [];
  globalThis.fetch = async function (url, init) {
    calls.push({ url: String(url), init: init || {} });
    return handler(url, init);
  };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return value;
    },
    async text() {
      return JSON.stringify(value);
    },
  };
}

function completion(content, model = 'deepseek-chat') {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 },
  };
}

function textResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return JSON.parse(body);
    },
    async text() {
      return body;
    },
  };
}

function failingJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      throw new SyntaxError('Unexpected token < in JSON');
    },
    async text() {
      return body;
    },
  };
}

const storeWith = (settings) => ({
  settings: () => settings,
});

/**
 * 假的宿主能力：llm.stream 按给定 chunks 依次 yield，并记录收到的 GenerateOptions；
 * agentDefaultModel.currentSelection() 返回给定 selection（null 表示没配置默认模型）。
 */
function fakeHost({ chunks = [], selection = { provider: 'deepseek-official', model: 'deepseek-v4-flash' } } = {}) {
  const seen = [];
  const llm = {
    stream(options) {
      seen.push(options);
      return (async function* () {
        for (const chunk of chunks) yield chunk;
      })();
    },
  };
  const ctx = {
    logger: { info() {}, warn() {}, log() {} },
    get(name) {
      if (name === 'llm') return llm;
      if (name === 'agentDefaultModel') return { currentSelection: () => selection };
      return undefined;
    },
  };
  return { ctx, seen };
}

/** 一段正常的宿主流式回复（拆两个 text-delta，验证拼接）。 */
function hostReply(text) {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: text.slice(0, 3) },
    { type: 'text-delta', index: 0, text: text.slice(3) },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ];
}

async function serviceTests() {
  // 1) 正常路径：默认 baseUrl / 模型、system prompt 在首条、参数固定
  stubFetch(() => jsonResponse(completion('可以，先问三个问题：姓名、目标岗位、最近一段经历的时间段。')));
  const service = createChatService({ store: storeWith({ chatApiKey: ' sk-test-123 ' }) });
  const result = await service.chat({ messages: [{ role: 'user', content: '我是 5 年产品经理' }] });
  assert.equal(result.reply, '可以，先问三个问题：姓名、目标岗位、最近一段经历的时间段。');
  assert.equal(result.model, 'deepseek-chat');
  assert.equal(result.usage.total_tokens, 46);
  assert.ok(typeof result.durationMs === 'number' && result.durationMs >= 0, 'durationMs 应该是数字');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions');
  const init = calls[0].init;
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer sk-test-123', 'Key 要 trim 后放进 Bearer');
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.ok(init.signal, '应该带 AbortSignal 做 60s 超时');
  const sent = JSON.parse(init.body);
  assert.equal(sent.model, 'deepseek-chat', '模型默认 deepseek-chat');
  assert.equal(sent.temperature, 0.4);
  assert.equal(sent.max_tokens, 2400);
  assert.equal(sent.messages.length, 2);
  assert.equal(sent.messages[0].role, 'system');
  assert.ok(sent.messages[0].content.includes('```json'), 'system prompt 要要求 ```json 代码块');
  assert.ok(sent.messages[0].content.includes('最多 3 个问题'), 'system prompt 要限制每次最多 3 个问题');
  assert.ok(sent.messages[0].content.includes('严禁编造'), 'system prompt 要禁止编造');
  assert.ok(sent.messages[0].content.includes('XXX'), 'system prompt 要提醒占位符 XXX');
  assert.ok(SYSTEM_PROMPT.includes('"data"') || SYSTEM_PROMPT.includes('"basics"'), 'system prompt 要带 JSON 结构');
  assert.equal(sent.messages[1].role, 'user');
  assert.equal(sent.messages[1].content, '我是 5 年产品经理');

  // 2) 自定义 baseUrl（带尾部斜杠）与模型
  stubFetch(() => jsonResponse(completion('好的', 'deepseek-reasoner')));
  const custom = createChatService({
    store: storeWith({ chatApiKey: 'sk-x', chatBaseUrl: 'https://api.example.com/v1/', chatModel: 'deepseek-reasoner' }),
  });
  const customResult = await custom.chat({ messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(calls[0].url, 'https://api.example.com/v1/chat/completions');
  assert.equal(JSON.parse(calls[0].init.body).model, 'deepseek-reasoner');
  assert.equal(customResult.model, 'deepseek-reasoner', '优先用上游返回的 model');

  // 3) 没有 Key：chat/no-key + 400，中文提示指向设置页
  const noKey = createChatService({ store: storeWith({}) });
  const callsBeforeNoKey = calls.length;
  await assert.rejects(
    () => noKey.chat({ messages: [{ role: 'user', content: 'hi' }] }),
    (err) => {
      assert.equal(err.code, 'chat/no-key');
      assert.equal(err.status, 400);
      assert.ok(err.message.includes('设置页'), '提示要告诉用户去设置页填 Key');
      assert.ok(err.message.includes('DeepSeek API Key'));
      return true;
    }
  );
  assert.equal(calls.length, callsBeforeNoKey, '没有 Key 时不应该发出请求');

  // 4) 上游 500：chat/upstream + 502，message 带状态码
  stubFetch(() => textResponse('internal error', 500));
  const upstream = createChatService({ store: storeWith({ chatApiKey: 'sk-test' }) });
  await assert.rejects(
    () => upstream.chat({ messages: [{ role: 'user', content: 'hi' }] }),
    (err) => {
      assert.equal(err.code, 'chat/upstream');
      assert.equal(err.status, 502);
      assert.ok(/500/.test(err.message), 'message 应带 HTTP 500，实际：' + err.message);
      return true;
    }
  );

  // 5) 网络错误：chat/upstream + 502
  globalThis.fetch = async () => {
    throw new Error('ECONNREFUSED 127.0.0.1');
  };
  await assert.rejects(
    () => upstream.chat({ messages: [{ role: 'user', content: 'hi' }] }),
    (err) => {
      assert.equal(err.code, 'chat/upstream');
      assert.equal(err.status, 502);
      assert.ok(err.message.includes('连不上'), '网络错误要提示连不上，实际：' + err.message);
      return true;
    }
  );

  // 6) 上游不是 JSON：chat/upstream
  stubFetch(() => failingJsonResponse('<html>bad gateway</html>', 200));
  await assert.rejects(
    () => upstream.chat({ messages: [{ role: 'user', content: 'hi' }] }),
    (err) => {
      assert.equal(err.code, 'chat/upstream');
      assert.equal(err.status, 502);
      return true;
    }
  );

  // 7) 空 choices / 空 content：chat/upstream
  stubFetch(() => jsonResponse({ choices: [{ message: { role: 'assistant', content: '   ' } }] }));
  await assert.rejects(
    () => upstream.chat({ messages: [{ role: 'user', content: 'hi' }] }),
    (err) => {
      assert.equal(err.code, 'chat/upstream');
      assert.equal(err.status, 502);
      return true;
    }
  );

  // 8) 当前简历进 system 上下文 + 历史只保留最近 40 条
  stubFetch(() => jsonResponse(completion('ok')));
  const many = [];
  for (let i = 0; i < 50; i += 1) many.push({ role: i % 2 ? 'assistant' : 'user', content: 'm' + i });
  await upstream.chat({ messages: many, resume: { title: '产品经理', data: { basics: { name: '林知夏' } } } });
  const sentMany = JSON.parse(calls[0].init.body);
  assert.equal(sentMany.messages.length, 41, 'system + 最近 40 条');
  assert.equal(sentMany.messages[0].role, 'system');
  assert.ok(sentMany.messages[0].content.includes('当前简历'), 'system prompt 要带当前简历上下文');
  assert.ok(sentMany.messages[0].content.includes('林知夏'), '上下文里应有简历里的姓名');
  assert.equal(sentMany.messages[1].content, 'm10', '最早的消息应被裁掉');
  assert.equal(sentMany.messages[40].content, 'm49', '最后一条应保留');

  // 9) resume 是空对象时不加上下文
  stubFetch(() => jsonResponse(completion('ok')));
  await upstream.chat({ messages: [{ role: 'user', content: 'hi' }], resume: {} });
  assert.equal(JSON.parse(calls[0].init.body).messages[0].content, SYSTEM_PROMPT);

  // 10) 没有 Key 但宿主 llm 可用：免 Key 走 DSH 当前模型（mode:host）
  stubFetch(() => {
    throw new Error('免 Key 通道不应该请求 DeepSeek');
  });
  const host = fakeHost({ chunks: hostReply('你好，我是宿主的模型。') });
  const hosted = createChatService({ store: storeWith({}), ctx: host.ctx });
  const hostedResult = await hosted.chat({ messages: [{ role: 'user', content: '帮我写简历' }] });
  assert.equal(hostedResult.reply, '你好，我是宿主的模型。', 'text-delta 要按顺序拼接');
  assert.equal(hostedResult.mode, 'host');
  assert.equal(hostedResult.model, 'deepseek-v4-flash', '模型名用宿主 selection 的 model');
  assert.equal(hostedResult.usage.totalTokens, 15, 'usage 用宿主返回的 TokenUsage');
  assert.ok(typeof hostedResult.durationMs === 'number' && hostedResult.durationMs >= 0);
  assert.equal(calls.length, 0, '免 Key 通道不应发出 HTTP 请求');
  const hostOptions = host.seen[0];
  assert.equal(hostOptions.provider, 'deepseek-official');
  assert.equal(hostOptions.model, 'deepseek-v4-flash');
  assert.equal(hostOptions.temperature, 0.4);
  assert.equal(hostOptions.maxTokens, 2400);
  assert.ok(hostOptions.signal, '宿主调用也要带 AbortSignal 做超时');
  assert.ok(hostOptions.system.includes('```json'), 'system prompt 要一起发给宿主模型');
  assert.equal(hostOptions.messages.length, 1);
  assert.equal(hostOptions.messages[0].role, 'user');
  assert.equal(hostOptions.messages[0].content[0].type, 'text');
  assert.equal(hostOptions.messages[0].content[0].text, '帮我写简历', '单轮对话不需要加「用户：」前缀');

  // 11) 填了 Key 就仍然走 DeepSeek，不占用宿主模型
  stubFetch(() => jsonResponse(completion('好的')));
  const keyHost = fakeHost({ chunks: hostReply('宿主不该被调用') });
  const keyService = createChatService({ store: storeWith({ chatApiKey: 'sk-test' }), ctx: keyHost.ctx });
  const keyResult = await keyService.chat({ messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(keyResult.mode, 'api');
  assert.equal(keyHost.seen.length, 0, '填了 Key 就不该走宿主 llm');
  assert.equal(calls.length, 1);

  // 12) 多轮历史折叠成 user 轮（宿主只接受 request-only user 输入）
  const multiHost = fakeHost({ chunks: hostReply('ok') });
  const multiService = createChatService({ store: storeWith({}), ctx: multiHost.ctx });
  await multiService.chat({
    messages: [
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
    ],
  });
  const multiMessages = multiHost.seen[0].messages;
  assert.equal(multiMessages.length, 2, '两轮用户消息');
  assert.equal(multiMessages[0].role, 'user');
  assert.equal(multiMessages[0].content[0].text, '用户：u1');
  assert.ok(multiMessages[1].content[0].text.includes('a1'), '助手回复要折叠进下一条 user 消息');
  assert.ok(multiMessages[1].content[0].text.includes('u2'));

  // 13) 宿主 finish 报错：chat/upstream + 502，message 带模型给的原因
  const errHost = fakeHost({
    chunks: [
      { type: 'text-delta', index: 0, text: '半截' },
      { type: 'finish', reason: { kind: 'error', failure: { message: '额度不足', code: 'rate-limit' } } },
    ],
  });
  await assert.rejects(
    () => createChatService({ store: storeWith({}), ctx: errHost.ctx }).chat({ messages: [{ role: 'user', content: 'hi' }] }),
    (err) => {
      assert.equal(err.code, 'chat/upstream');
      assert.equal(err.status, 502);
      assert.ok(err.message.includes('额度不足'), '要带上宿主给的原因，实际：' + err.message);
      return true;
    }
  );

  // 14) 宿主 stream 抛错：chat/upstream + 502
  const throwCtx = {
    logger: {},
    get(name) {
      if (name === 'llm') return { stream() { throw new Error('provider down'); } };
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'p', model: 'm' }) };
      return undefined;
    },
  };
  await assert.rejects(
    () => createChatService({ store: storeWith({}), ctx: throwCtx }).chat({ messages: [{ role: 'user', content: 'hi' }] }),
    (err) => {
      assert.equal(err.code, 'chat/upstream');
      assert.equal(err.status, 502);
      return true;
    }
  );

  // 15) 宿主不可用（没有 llm / 没有默认模型）：chat/no-key + 400，提示填 Key
  const noLlmCtx = { logger: {}, get() { return undefined; } };
  await assert.rejects(
    () => createChatService({ store: storeWith({}), ctx: noLlmCtx }).chat({ messages: [{ role: 'user', content: 'hi' }] }),
    (err) => {
      assert.equal(err.code, 'chat/no-key');
      assert.equal(err.status, 400);
      assert.ok(err.message.includes('设置页'));
      assert.ok(err.message.includes('DeepSeek API Key'));
      return true;
    }
  );
  const noSelection = fakeHost({ chunks: [], selection: null });
  await assert.rejects(
    () => createChatService({ store: storeWith({}), ctx: noSelection.ctx }).chat({ messages: [{ role: 'user', content: 'hi' }] }),
    (err) => {
      assert.equal(err.code, 'chat/no-key');
      assert.equal(err.status, 400);
      return true;
    }
  );
  assert.equal(noSelection.seen.length, 0, '没有默认模型时不该调用 llm');
}

/**
 * 假 req/res 驱动 handler（照 tests/smoke.mjs 的写法），不监听端口。
 */
function makeCaller(handle) {
  return function call(method, path, body) {
    return new Promise((resolve) => {
      const data = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
      const listeners = { data: [], end: [], error: [] };
      const req = {
        method,
        url: '/resume-market/api' + path,
        headers: { host: '127.0.0.1:59568' },
        on(event, fn) {
          (listeners[event] || (listeners[event] = [])).push(fn);
          return req;
        },
        destroy() {},
      };
      const res = {
        status: 0,
        headers: {},
        body: '',
        writeHead(status, headers) {
          this.status = status;
          this.headers = headers || {};
        },
        end(chunk) {
          this.body = chunk === undefined ? '' : String(chunk);
        },
      };
      const pending = handle(req, res);
      setTimeout(() => {
        for (const chunk of data) for (const fn of listeners.data) fn(chunk);
        for (const fn of listeners.end) fn();
      }, 0);
      pending.then(() => {
        let json = null;
        try {
          json = JSON.parse(res.body);
        } catch {
          json = null;
        }
        resolve({ status: res.status, json });
      });
    });
  };
}

async function routeTests() {
  const resume = { id: 'r1', title: '产品经理', templateId: 'business-minimal', data: { basics: { name: '林知夏' } } };
  let currentSettings = {};
  const store = {
    file: '/tmp/resume-market/chat-test-store.json',
    settings: () => currentSettings,
    async whenReady() {},
    getResume(id) {
      if (id === resume.id) return resume;
      throw new Error('resume/not-found');
    },
  };
  const ctx = {
    logger: { info() {}, warn() {}, log() {} },
    get() {},
  };
  const handle = createHandler({ ctx, store });
  const call = makeCaller(handle);

  // 1) 正常对话：200 + reply，system 带简历上下文
  currentSettings = { chatApiKey: 'sk-test', chatModel: 'deepseek-chat' };
  stubFetch(() => jsonResponse(completion('好的，先确认几个信息。')));
  let res = await call('POST', '/chat', { messages: [{ role: 'user', content: '帮我写简历' }], resumeId: 'r1' });
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.equal(res.json.value.reply, '好的，先确认几个信息。');
  assert.equal(res.json.value.model, 'deepseek-chat');
  assert.equal(res.json.value.mode, 'api');
  assert.ok(res.json.value.usage, '应返回 usage');
  const sent = JSON.parse(calls[0].init.body);
  assert.ok(sent.messages[0].content.includes('当前简历'), '带上 resumeId 时 system 要有简历上下文');
  assert.ok(sent.messages[0].content.includes('林知夏'));

  // 2) 不存在的 resumeId 不报错，只是不带上下文
  stubFetch(() => jsonResponse(completion('ok')));
  res = await call('POST', '/chat', { messages: [{ role: 'user', content: 'hi' }], resumeId: 'missing' });
  assert.equal(res.status, 200);
  assert.ok(!JSON.parse(calls[0].init.body).messages[0].content.includes('当前简历'), '无效 resumeId 不加简历上下文');

  // 3) 校验：role 只能是 user/assistant
  res = await call('POST', '/chat', { messages: [{ role: 'system', content: 'x' }] });
  assert.equal(res.status, 400);
  assert.equal(res.json.ok, false);
  assert.equal(res.json.error.code, 'chat/bad-role');

  // 4) 校验：最多 40 条
  const tooMany = [];
  for (let i = 0; i < 41; i += 1) tooMany.push({ role: 'user', content: 'm' + i });
  res = await call('POST', '/chat', { messages: tooMany });
  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, 'chat/too-long');

  // 5) 校验：content 必须是非空字符串
  res = await call('POST', '/chat', { messages: [{ role: 'user', content: 42 }] });
  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, 'chat/bad-content');

  // 6) 校验：空 messages
  res = await call('POST', '/chat', { messages: [] });
  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, 'chat/bad-messages');

  // 7) 没有 Key：400 + chat/no-key（错误码/状态由路由 catch 透出）
  currentSettings = {};
  res = await call('POST', '/chat', { messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, 'chat/no-key');
  assert.ok(res.json.error.message.includes('设置页'));

  // 8) 上游失败：502 + chat/upstream
  currentSettings = { chatApiKey: 'sk-test' };
  stubFetch(() => textResponse('boom', 500));
  res = await call('POST', '/chat', { messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(res.status, 502);
  assert.equal(res.json.error.code, 'chat/upstream');

  // 9) 没填 Key 但 Host 有 llm 服务：200 + mode:host（不请求 DeepSeek）
  const hostCtx = {
    logger: { info() {}, warn() {}, log() {} },
    get(name) {
      if (name === 'llm') {
        return {
          stream() {
            return (async function* () {
              yield { type: 'text-delta', index: 0, text: '宿主回复' };
              yield { type: 'finish', reason: { kind: 'stop' } };
            })();
          },
        };
      }
      if (name === 'agentDefaultModel') {
        return { currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }) };
      }
      return undefined;
    },
  };
  const hostCall = makeCaller(createHandler({ ctx: hostCtx, store }));
  currentSettings = {};
  stubFetch(() => {
    throw new Error('免 Key 通道不应该请求 DeepSeek');
  });
  res = await hostCall('POST', '/chat', { messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.equal(res.json.value.mode, 'host');
  assert.equal(res.json.value.reply, '宿主回复');
  assert.equal(res.json.value.model, 'deepseek-v4-flash');
}

try {
  await serviceTests();
  await routeTests();
  console.log('chat ok: 对话服务 + /chat 路由全部通过');
} catch (error) {
  console.error('chat FAILED:');
  console.error(error);
  process.exitCode = 1;
} finally {
  restoreFetch();
}
