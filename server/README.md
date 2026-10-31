# 免费简历模板市场 · 云端服务（零依赖）

一个**零依赖**的简历模板共享市场 HTTP 服务：只使用 Node.js 内置模块
（`http` / `fs` / `crypto` / `url` 等），数据存放在一个 JSON 文件里，天然适合
自建、内网部署或挂到任意一台装了 Node 的小机器上。

- 运行时要求：**Node.js >= 18**（开发与测试使用 v22.18.0），ESM，无任何第三方包。
- 数据：单个 JSON 文件（默认与本文件同目录的 `market-data.json`），写入使用
  “临时文件 + fsync + rename”的原子替换，Windows 下对瞬时文件占用会退避重试。
- 体积限制：请求体 ≤ 512 KB，单个模板 ≤ 200 KB，CSS ≤ 100 KB，HTML ≤ 100 KB，
  最多 500 个模板（详见下文）。
- 安全：所有写回画廊页的内容都做 HTML 转义；静态资源有目录穿越校验；可选
  Bearer 令牌保护删除（以及可选的发布）接口。

---

## 1. 运行

```bash
# 默认：监听 127.0.0.1:7701，数据写入同目录 market-data.json
node resume-market/server/market-server.js

# 自定义端口与数据文件
PORT=8080 HOST=0.0.0.0 RM_DB=/var/lib/resume-market/market-data.json \
  node resume-market/server/market-server.js
```

Windows PowerShell / cmd：

```powershell
$env:PORT = "8080"; $env:HOST = "0.0.0.0"; node resume-market\server\market-server.js
```

打开 <http://127.0.0.1:7701/> 即是模板画廊页（搜索、排序、复制导入 JSON、
点赞、下载）；删除走 API（配置了 `RM_TOKEN` 时需 `Authorization: Bearer <token>`）。

### 冒烟测试

```bash
node resume-market/server/smoke.mjs
```

测试会使用**随机端口 + 系统临时目录里的临时数据库**，跑完自动清理，
不会碰真实的 `market-data.json`。覆盖：健康检查、CORS/OPTIONS、创建/去重、
列表/搜索/分页、单条读取、下载与点赞计数、分享包、参数与体积校验、
404/400/405/409/413、删除鉴权、静态页与 HEAD、HTML 转义、重启持久化、容量上限。
成功输出 `✓ 全部通过：43/43 项测试`，任何失败以非 0 退出码结束。

### 作为库使用

```js
import { createMarketServer } from './resume-market/server/market-server.js';

const app = await createMarketServer({
  port: 0,            // 0 = 随机端口（测试用）
  host: '127.0.0.1',
  dbPath: '/tmp/market-data.json',
  token: '',          // 配置后 DELETE 需要 Authorization: Bearer <token>
  logger: console,    // 需提供 info/warn/error
});
console.log(app.url); // http://127.0.0.1:xxxxx
await app.close();    // 优雅关闭（会等待挂起的落盘）
```

---

## 2. 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `7701` | 监听端口；`0` 表示随机端口 |
| `HOST` | `127.0.0.1` | 监听地址；放在反代后面时可设 `0.0.0.0` |
| `RM_DB` | `<本文件目录>/market-data.json` | JSON 数据库路径，目录不存在会自动创建 |
| `RM_TOKEN` | 空（不鉴权） | 配置后 `DELETE /api/templates/:id` 必须带 `Authorization: Bearer <token>` |
| `RM_PROTECT_PUBLISH` | 空 | 设为 `1` 时，`POST /api/templates` 也需要同样的 Bearer 令牌（可选，默认开放发布） |

---

## 3. API

所有 `/api/*` 接口（分享包除外）统一返回：

```json
{ "ok": true,  "value": { } }
{ "ok": false, "error": { "code": "not_found", "message": "模板不存在：rm_xxx" } }
```

响应头统一带 CORS（`Access-Control-Allow-Origin: *`）；`OPTIONS` 任意路径返回
`204`，因此浏览器端插件可以直接跨域调用。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查：`{name, version, items}` |
| `GET` | `/api/templates` | 列表，见下方查询参数；默认返回完整条目（含 `template`/`data`） |
| `GET` | `/api/templates/:id` | 单个模板完整内容 |
| `POST` | `/api/templates` | 发布模板（创建），成功 `201`；内容重复返回 `409 duplicate` |
| `POST` | `/api/templates/:id/download` | 下载计数 `+1`，返回 `{downloads}` |
| `POST` | `/api/templates/:id/like` | 点赞计数 `+1`，返回 `{likes}` |
| `DELETE` | `/api/templates/:id` | 删除；配置 `RM_TOKEN` 时需 Bearer 令牌 |
| `GET` | `/api/templates/:id/pack` | 分享包（可直接导入的 JSON 附件） |
| `GET` | `/`、`/index.html` | 服务端渲染的模板画廊页 |
| `GET` | `/assets/*` | 画廊页静态资源（`public/assets/` 目录） |

### 3.1 列表查询参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `q` | 空 | 关键词，空格分隔的多个词需**全部**命中；匹配标题、作者、说明、`templateId`、`name`、标签 |
| `limit` | `20` | 每页条数，`1..100` |
| `offset` | `0` | 跳过条数，`>= 0` |
| `sort` | `newest` | `newest` / `oldest` / `downloads` / `likes` |
| `include=summary` | — | 只返回轻量摘要（省略 `template`/`data`），等价于 `summary=1` |

```bash
curl 'http://127.0.0.1:7701/api/templates?q=极简&limit=10&offset=0&sort=downloads'
```

返回：

```json
{
  "ok": true,
  "value": {
    "items": [
      {
        "id": "rm_2fec27699638186a",
        "title": "简洁单页简历",
        "author": "小明",
        "tags": ["极简", "蓝色"],
        "note": "适合互联网岗位",
        "name": "modern-blue",
        "templateId": "modern-blue",
        "downloads": 3,
        "likes": 1,
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
      }
    ],
    "total": 1,
    "limit": 20,
    "offset": 0
  }
}
```

> 列表默认返回完整条目，客户端拿到即可“一键安装”；列表很长时用
> `?include=summary` 只取摘要，需要单条完整内容时用 `GET /api/templates/:id`。

### 3.2 发布模板（POST /api/templates）

```bash
curl -X POST http://127.0.0.1:7701/api/templates \
  -H 'Content-Type: application/json' \
  -d '{
    "item": {
      "title": "简洁单页简历",
      "author": "小明",
      "tags": ["极简", "蓝色"],
      "note": "适合互联网岗位",
      "templateId": "modern-blue",
      "template": { "css": "body{font-family:sans-serif}" },
      "data": { "name": "张三", "job": "前端工程师" }
    }
  }'
```

字段约定（可直接把插件导出的模板 JSON 包进来）：

| 字段 | 必填 | 限制 / 说明 |
| --- | --- | --- |
| `title` | 是 | 1–80 字符，去除首尾空白 |
| `author` | 否 | ≤ 40 字符，默认“匿名” |
| `tags` | 否 | 最多 8 个，每个 ≤ 20 字符，自动去重 |
| `note` | 否 | ≤ 300 字符 |
| `templateId` | 否 | ≤ 64 字符；缺省时自动生成 |
| `name` | 否 | ≤ 60 字符；缺省取 `templateId` |
| `template` | 是 | 对象，必须含 `css` 字符串（≤ 100 KB） |
| `data` | 否 | 任意 JSON（整体受 200 KB 单模板上限约束） |

去重依据 `templateId + CSS + data` 的 SHA-256：同内容重复发布返回
`409 duplicate`；库满 500 条返回 `409 market_full`。

为了少写胶水代码，POST 还兼容：

- **裸条目**：不带 `item` 包裹、直接 POST 条目对象也可以；
- **插件本地市场条目的字段名**：`name`→`title`（`title` 优先）、`desc`/`tagline`→`note`、
  `css`（顶层字符串）→`template.css`、`sample`→`data`；
- **分享包原样发布**：把 `GET /:id/pack` 的 JSON 直接 POST 回来即可（字段本就对齐）。

### 3.3 分享包（GET /api/templates/:id/pack）

这是唯一**不套 `{ok,value}` 信封**的接口：直接返回可下载的分享包 JSON
（`Content-Disposition: attachment`），格式：

```json
{
  "kind": "resume-market-pack",
  "version": 1,
  "name": "modern-blue",
  "title": "简洁单页简历",
  "author": "小明",
  "tags": ["极简", "蓝色"],
  "template": { "css": "..." },
  "data": { "name": "张三" }
}
```

画廊页的“复制导入 JSON”按钮复制的就是这个结构。插件侧可把 `template` +
`data` 直接注入到新简历里。

### 3.4 错误码

| HTTP | `error.code` | 何时出现 |
| --- | --- | --- |
| `400` | `bad_json` | 请求体不是合法 JSON |
| `400` | `invalid_field` | 字段类型/长度/数量不合法（缺 `title`、缺 `css`、`tags` 超限等） |
| `400` | `invalid_query` | `limit` / `offset` / `sort` 参数不合法 |
| `400` | `bad_request` | URL 编码不合法等其他请求问题 |
| `404` | `not_found` | 指定 `id` 的模板不存在 |
| `404` | `route_not_found` | 路径不存在（包括静态路径） |
| `405` | `method_not_allowed` | 方法不对，响应带 `Allow` 头 |
| `409` | `duplicate` | 相同内容已存在 |
| `409` | `market_full` | 已达 500 条上限 |
| `401` | `unauthorized` | 需要令牌但缺失/不匹配 |
| `413` | `body_too_large` | 请求体 > 512 KB |
| `413` | `item_too_large` | 单个模板 > 200 KB |
| `413` | `css_too_large` | CSS > 100 KB |
| `413` | `html_too_large` | HTML > 100 KB（保留码，当前无接口接收 HTML） |
| `500` | `internal_error` / `db_unavailable` | 服务端异常 / 数据库文件不可读写 |

---

## 4. 部署提示

### 4.1 放在 Nginx 后面（HTTPS 终止在反代）

```nginx
server {
    listen 443 ssl http2;
    server_name market.example.com;

    ssl_certificate     /etc/letsencrypt/live/market.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/market.example.com/privkey.pem;

    # 与服务的请求体限制保持一致（512 KB）
    client_max_body_size 512k;

    location / {
        proxy_pass         http://127.0.0.1:7701;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

此时服务本身可以继续只监听 `127.0.0.1`（默认值），由反代对外。
若想直接用 Caddy：`caddy reverse-proxy --from market.example.com --to 127.0.0.1:7701`，
Caddy 会自动申请证书；同样注意默认请求体上限（Caddy 默认不限）。

### 4.2 令牌与写保护

- **至少**在公网部署时设置 `RM_TOKEN`（随机长字符串，例如
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`），
  这样任何人都不能随意删除模板；插件端删除时带 `Authorization: Bearer <token>`。
- 不想让陌生人发布模板时，再设 `RM_PROTECT_PUBLISH=1`，发布接口同样要求令牌
  （画廊页的“复制/下载”不受影响）。
- 令牌只放在服务端环境变量里，不要写进画廊页或仓库。

### 4.3 数据与备份

- 数据就是一个 JSON 文件，备份 = 复制 `RM_DB` 指向的文件；建议纳入定时快照。
- 写入是原子替换，服务崩溃不会留下半截 JSON；万一文件损坏，服务会把它重命名
  为 `*.corrupt-<时间戳>` 后以空库启动（日志有告警），可从备份恢复。
- 单实例写单文件即可；**不要**让多个进程同时写同一个 `RM_DB`。

### 4.4 常驻运行

Linux（systemd）：

```ini
[Unit]
Description=Resume market (zero-dep)
After=network.target

[Service]
WorkingDirectory=/opt/resume-market/server
Environment=PORT=7701
Environment=RM_DB=/var/lib/resume-market/market-data.json
Environment=RM_TOKEN=change-me
ExecStart=/usr/bin/node market-server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Windows 可用任务计划程序、`nssm` 或任意进程守护工具；服务收到 `SIGINT` /
`SIGTERM` 会优雅关闭并等待挂起落盘完成。

### 4.5 反向代理以外的注意事项

- 本服务不做鉴权前的限流；公网部署建议在反代层加 `limit_req`，防止刷发布。
- 默认 CORS 全放行是刻意为之（插件/画廊需要跨域）；如需收紧，可在反代层
  覆写 `Access-Control-Allow-Origin`。
- 服务只监听你给的 `HOST`；`0.0.0.0` 时注意防火墙只放行反代机器。

---

## 5. 目录结构

```text
resume-market/server/
├── market-server.js     # 全部服务逻辑（零依赖，约 1160 行）
├── smoke.mjs            # 冒烟测试（随机端口 + 临时库）
├── README.md            # 本文件
├── market-data.json     # 运行时自动生成的数据文件（已被 .gitignore 忽略）
└── public/
    ├── index.html       # 画廊页（SSR + 客户端搜索/排序/复制/点赞）
    └── assets/          # 画廊页静态资源目录
```
