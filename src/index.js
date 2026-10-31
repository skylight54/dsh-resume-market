/**
 * 简历市场：带左侧栏入口的 DSH 插件。
 *
 * Host 半边负责：
 *  - 本地数据（~/.dsh/resume-market/store.json）；
 *  - HTTP API（/resume-market/api/*），供面板与外部脚本调用；
 *  - 注册 resume_* agent 工具，让「大肥鱼」能直接产出结构化简历。
 *
 * Client 半边（lib/client.js）在侧栏加图标、在 main 槽位铺面板。
 */
import { openStore } from './store.js';
import { registerRoutes } from './routes.js';
import { registerTools } from './tools.js';

export const name = 'dsh-plugin-resume-market';
export const inject = ['webServer', 'tools'];

export function apply(ctx, config) {
  void config;
  const logger = ctx.logger || console;
  const info = (msg) => {
    if (typeof logger.info === 'function') logger.info(msg);
    else if (typeof logger.log === 'function') logger.log(msg);
  };
  const warn = (msg) => {
    if (typeof logger.warn === 'function') logger.warn(msg);
  };

  const store = openStore({
    log: (msg) => info(msg),
  });

  // 关闭时把未落盘的写入排空，再释放引用。
  ctx.effect(() => () => store.dispose(), 'resume-market: dispose store');

  registerRoutes(ctx, { store });
  registerTools(ctx, { store });

  store
    .whenReady()
    .then(() => info(`resume-market: 就绪（数据文件 ${store.file}）`))
    .catch((error) => warn(`resume-market: 初始化失败：${(error && error.message) || error}`));
}
