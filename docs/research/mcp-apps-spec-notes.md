# MCP Apps（SEP-1865）与 Skills over MCP（SEP-2640）规范 + 官方 SDK host 端 API 面调研

> 调研日期：2026-10-20。目的：支撑「agents-remote web 控制面作为 MCP Apps 宿主」+「自建 sidecar HTTP MCP server（`api/src/mcp-hub-server.ts`）扩展 `ui://` 与 `skill://` 资源」的架构设计。
> 结论均标注来源；官方 spec / SDK 源码优先。未能确证的点明确标「未确认」，未编造任何字段名/消息名。

## 来源清单

| 来源 | 内容 | 性质 |
| --- | --- | --- |
| [specification/2026-01-26/apps.mdx](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)（全文精读，1768 行） | SEP-1865 稳定版规范文本 | 官方 spec（一手） |
| [ext-skills specification/stable/skills.mdx](https://github.com/modelcontextprotocol/ext-skills/blob/main/specification/stable/skills.mdx)（全文精读，966 行） | SEP-2640 稳定版规范文本 | 官方 spec（一手） |
| [ext-skills docs/decisions.md](https://github.com/modelcontextprotocol/ext-skills/blob/main/docs/decisions.md) | 决策日志（index.json 的来龙去脉） | 官方（一手） |
| [ext-apps src/](https://github.com/modelcontextprotocol/ext-apps/tree/main/src)（`spec.types.ts` / `server/index.ts` / `constants.ts` / `app.ts` 精读） | SDK 2.x 类型与导出面 | 官方源码（一手） |
| [ext-apps examples/basic-host](https://github.com/modelcontextprotocol/ext-apps/tree/main/examples/basic-host)（`index.tsx` / `implementation.ts` / `sandbox.ts` / `serve.ts` / README 精读） | 官方参考宿主实现 | 官方源码（一手） |
| [npm registry](https://registry.npmjs.org/@modelcontextprotocol/ext-apps) | 版本/发布日 | 一手（registry） |
| [GitHub API](https://api.github.com/repos/modelcontextprotocol/ext-apps) | star/活跃度/license | 一手 |
| [modelcontextprotocol.io/extensions/apps/overview](https://modelcontextprotocol.io/extensions/apps/overview)、[client-matrix](https://modelcontextprotocol.io/extensions/client-matrix)、[apps.extensions.modelcontextprotocol.io quickstart](https://apps.extensions.modelcontextprotocol.io/api/documents/quickstart.html) | 官方文档页 | 官方文档 |
| deepwiki（modelcontextprotocol/ext-apps） | AppBridge API 交叉印证 | 二手（已与源码核对） |

---

## A. MCP Apps（SEP-1865，extension `io.modelcontextprotocol/ui`）

### A.0 状态与标识

- Extension 标识：`io.modelcontextprotocol/ui`；保留 `ui://` URI scheme 前缀。
- SEP 状态：**Stable（2026-01-26）**，创建于 2025-11-21。依据 SEP-1724 的 extension 机制，可选、向后兼容。
- 初始内容类型仅 `text/html;profile=mcp-app`（其他类型保留给未来扩展；`externalUrl`/`text/uri-list` 明确 deferred）。
- 已支持宿主（官方 overview 页陈述）：Claude（web）、Claude Desktop、VS Code GitHub Copilot、Microsoft 365 Copilot、Goose、Postman、MCPJam、Archestra.AI。（client-matrix 页的勾选在抓取中丢失，以 overview 页文字为准。）

来源：apps.mdx 头部与 Extension Identifier 节；overview 页。

### A.1 完整协议流程：发现 → 读取 → 渲染

**1) host 如何发现 tool 的 UI 关联**

- tool 在 `tools/list` 里通过 `_meta.ui.resourceUri` 指向一个 `ui://` 资源：
  ```json
  { "name": "get_weather", "...": "...",
    "_meta": { "ui": { "resourceUri": "ui://weather-server/dashboard-template",
                        "visibility": ["model", "app"] } } }
  ```
- **旧格式 `_meta["ui/resourceUri"]` 已 deprecated（GA 前移除）**；server 侧 SDK 的 `registerAppTool` 会双向同步两种格式，**host 侧必须两种都检查**（`constants.ts` 注释明示，并提供 `getToolUiResourceUri(tool)` 帮手）。
- `visibility`（默认 `["model","app"]`）：
  - `"model"`：tool 对 agent 可见可调；`"app"`：仅可被**同一 server 连接上的 app** 经 `tools/call` 调用。
  - host 义务：`tools/list` **MUST NOT** 把不含 `"model"` 的 tool 放进 agent 工具列表；app 发起的 `tools/call` 若目标 tool 不含 `"app"` **MUST 拒绝**；跨 server 的 app tool 调用一律阻断。
- UI 资源主要靠 tool metadata 发现，server **MAY** 不把它们放进 `resources/list`。

**2) `ui://` 资源如何读取**

- 标准 `resources/read` 读取，响应形状：
  ```json
  { "contents": [{
      "uri": "ui://weather-server/dashboard-template",
      "mimeType": "text/html;profile=mcp-app",
      "text": "<!DOCTYPE html>…" ,            // 或 "blob": base64
      "_meta": { "ui": { "csp": {...}, "permissions": {...}, "domain": "...", "prefersBorder": true } }
  }]}
  ```
- mimeType **MUST** 为 `text/html;profile=mcp-app`；内容 `text` 或 `blob` 二选一；MUST 是合法 HTML5 文档。
- `_meta.ui` 有两个出现位置：`resources/list` 的资源条目（listing 级，作为静态默认供 host 连接期审查）与 `resources/read` 的 content 条目（content 级，**优先**）。basic-host 实现即「content 级优先、listing 级兜底」。
- host **MAY 预取并缓存** UI 资源（tool 执行前），这是该设计的核心收益（模板静态/数据动态分离）。

**3) 双 iframe 沙箱架构（web host MUST）**

```
Host 页面（origin A，如 localhost:8080）
  └─ 外层 iframe = Sandbox proxy（origin B ≠ A，如 localhost:8081/sandbox.html）
       └─ 内层 iframe = View（不可信 HTML，经 sandbox-resource-ready 注入 srcdoc/document.write）
```

规范要求（apps.mdx「Sandbox proxy」节）：

1. Host 与 Sandbox **MUST 不同 origin**。
2. Sandbox **MUST** 有 sandbox 权限 `allow-scripts`、`allow-same-origin`（basic-host 实际用 `allow-scripts allow-same-origin allow-forms`）。
3. Sandbox 就绪后向 host 发 `ui/notifications/sandbox-proxy-ready`。
4. Host 收到后用 `ui/notifications/sandbox-resource-ready` 把**原始 HTML** 交给 Sandbox。
5. Sandbox 用强制 CSP 的方式加载内层 iframe（`ui.csp` 声明域、`frameDomains` 缺省 `frame-src 'none'`、`baseUriDomains` 缺省 `base-uri 'self'`、`object-src 'none'`、无元数据时用限制性默认）。
6. Sandbox 对**除 `ui/notifications/sandbox-*` 以外的所有消息**做双向透明转发（含 View 发的 `ui/initialize` 与 `ui/notifications/initialized`）；host 在收到 `initialized` 前不得向 View 发任何请求/通知。
7. Sandbox 自身 SHOULD NOT 合成任何请求（那要伪造新 id）。
8. Host MAY 把 View 的非 `ui/` 方法消息继续转发给 MCP server，但应保证合规、可拦截/要求用户批准。

**为什么两层（各层安全职责）**：
- **内层 View iframe**：执行不可信 HTML。`sandbox` 属性限制其能力；与宿主不同 origin ⇒ 无法访问宿主 DOM/cookie/localStorage、无法导航宿主页、无法在宿主上下文执行脚本；与外层也不同源（srcdoc 继承外层 origin，但被 sandbox 限制）。所有通信只能走 `postMessage`。
- **外层 Sandbox proxy iframe**：**独立 origin 的受信中继**。承担：① 把 CSP 落在自己响应的 **HTTP 头**上（不可被内容篡改，meta 标签可被注入篡改——basic-host `serve.ts` 注释明示），按 `?csp=` 查询参数动态生成；② 把 HTML 注入内层（`document.write`/`srcdoc`）并设置 `sandbox` 与 `allow`（Permission Policy）属性；③ 双向消息 relay 时做 origin 校验（host 方向校验 `event.origin === EXPECTED_HOST_ORIGIN`，View 方向校验 `=== OWN_ORIGIN`，转发回 host 用具体 origin 而非 `"*"`）；④ 自检沙箱有效性（`window.top.alert` 必须 throw SecurityError，否则说明沙箱配置损坏直接抛错；并校验 `document.referrer` 白名单）。
- 一句话：内层隔离「内容」，外层隔离「策略」——策略（CSP/sandbox/allow）全部落在外层这个可信、独立 origin 的载体上，宿主页只与外层对话。

来源：apps.mdx Sandbox proxy 节、Security Implications 节；basic-host README/serve.ts/sandbox.ts（一手源码）。

### A.2 JSON-RPC over postMessage 桥：完整消息清单与方向

传输层 = JSON-RPC 2.0 over `window.postMessage`。概念上 **UI iframe 是 MCP client**、host 扮演（可代理真 server 的）MCP server。消息分三类：与核心 MCP 共享（`tools/call`/`resources/read`/`notifications/message`/`ping`）、MCP 形似（`ui/initialize`）、`ui/` 前缀新消息。

**View → Host 请求**

| 方法 | params | result | 备注 |
| --- | --- | --- | --- |
| `ui/initialize` | `{ appInfo: Implementation, appCapabilities: McpUiAppCapabilities, protocolVersion: string }` | `McpUiInitializeResult`（见 A.3） | 握手；SDK 2.x 类型定案（spec 正文低层示例写的是 MCP 风格 `initialize`+`clientInfo`，与 `appCapabilities` 节并存，**以 SDK 类型 `ui/initialize`+`appInfo`+`appCapabilities` 为准**） |
| `tools/call` | 标准 MCP `{name, arguments}` | 标准 `CallToolResult` | host 校验 `visibility` 含 `"app"` 后转发到来源 server |
| `resources/read` | 标准 `{uri}` | 标准 ReadResourceResult | host 转发 |
| `ui/open-link` | `{ url: string }` | `{}` | host SHOULD 用默认浏览器/新标签打开；拒绝时 error code `-32000` |
| `ui/message` | `{ role: "user", content: { type: "text", text } }` | `{}` | host SHOULD 加入对话上下文（触发后续 turn），MAY 要求用户同意 |
| `ui/request-display-mode` | `{ mode: "inline"\|"fullscreen"\|"pip" }` | `{ mode }`（实际生效模式） | 请求不可用模式时 host SHOULD 返回当前模式 |
| `ui/update-model-context` | `{ content?: ContentBlock[], structuredContent?: Record<string, unknown> }` | `{}` | 覆盖式更新模型上下文；多次更新 host SHOULD 只取最后一条；可与 `ui/message`（会触发 follow-up）区分 |
| `ping` | — | — | 健康检查 |
| `notifications/message` | 标准 MCP 日志通知 | — | 日志 |
| `ui/resource-teardown` | **Host → View 请求** `{ reason?: string }` | `{}` | 见下 |

**Host → View 通知**

| 方法 | params | 义务 |
| --- | --- | --- |
| `ui/notifications/tool-input` | `{ arguments: Record<string, unknown> }` | **MUST**，`initialized` 后发送，**至多一次**，且先于 tool-result |
| `ui/notifications/tool-input-partial` | `{ arguments }` | 可选 0..n 次；流式期 best-effort 补全 JSON（闭合未完成结构）；发送完整版后 MUST 停发；View 可完全忽略 |
| `ui/notifications/tool-result` | params = 标准 `CallToolResult`（`content`/`structuredContent`/`_meta`） | **MUST**（若 View 在工具执行期在显示中）；`structuredContent` 供 UI、不进模型上下文 |
| `ui/notifications/tool-cancelled` | `{ reason: string }` | **MUST**（取消时，无论原因） |
| `ui/notifications/host-context-changed` | `Partial<HostContext>` | MAY；View 应合并部分更新 |
| `ui/resource-teardown`（请求） | `{ reason }` → View 回 `{}` | **MUST** 在销毁 UI 资源前发；host **SHOULD 等响应**再拆（防数据丢失） |

**View → Host 通知**

| 方法 | params | 备注 |
| --- | --- | --- |
| `ui/notifications/initialized` | `{}` | `ui/initialize` 响应后 View 发；此前 host 不得发任何消息 |
| `ui/notifications/size-changed` | `{ width: number, height: number }` | View SHOULD 在内容尺寸变化时发（ResizeObserver）；host 在 flexible 尺寸模式下 MUST 据此调整 iframe |

**Sandbox 保留消息（仅 web host 双 iframe 架构）**

| 方法 | 方向 | params |
| --- | --- | --- |
| `ui/notifications/sandbox-proxy-ready` | Sandbox → Host | `{}` |
| `ui/notifications/sandbox-resource-ready` | Host → Sandbox | `{ html: string, sandbox?: string, csp?: McpUiResourceCsp, permissions?: {...} }`（`sandbox` 可覆盖内层 iframe sandbox 属性；`permissions` 映射内层 `allow` 属性） |

来源：apps.mdx「MCP Apps Specific Messages」「Reserved Messages」「Data Passing」节；SDK `spec.types.ts`。

### A.3 host 初始化握手与 capability 协商

**与 MCP server 的协商（SEP-1724 extension 机制）**——client（即我们宿主）在 `initialize` 请求的 `capabilities.extensions` 里声明：

```json
{ "capabilities": { "extensions": {
    "io.modelcontextprotocol/ui": { "mimeTypes": ["text/html;profile=mcp-app"] } } } }
```

- `mimeTypes` 为 REQUIRED 的支持内容类型数组。
- server 侧用 `getUiCapability(clientCapabilities)` 读取并决定注册带 UI 的 tool 还是纯文本回退；**tool 无 UI 可用时 MUST 仍返回有意义的 `content` 数组**（优雅降级）。
- 已核实：项目现用 `@modelcontextprotocol/sdk@^1.30.0` 的 `ClientCapabilities`/`ServerCapabilities` zod schema 已含 `extensions` 字段（`api/node_modules/.../types.d.ts` 多处 `extensions: ZodOptional<ZodRecord<...>>`），1.x 上可手工完成协商声明。

**View ↔ Host 握手**（SDK 2.x `spec.types.ts` 定案形状）：

```ts
// View → Host
interface McpUiInitializeRequest {
  method: "ui/initialize";
  params: { appInfo: Implementation;            // {name, version}
            appCapabilities: McpUiAppCapabilities;
            protocolVersion: string };
}
interface McpUiAppCapabilities {
  experimental?: Record<string, object>;
  tools?: { listChanged?: boolean };            // App 暴露可被 host 调用的工具
  availableDisplayModes?: Array<"inline"|"fullscreen"|"pip">;
}
// Host → View
interface McpUiInitializeResult {
  protocolVersion: string;                      // 如 "2026-01-26"
  hostInfo: Implementation;
  hostCapabilities: McpUiHostCapabilities;
  hostContext: McpUiHostContext;
}
```

之后 View 发 `ui/notifications/initialized`。

**`HostCapabilities`**（host 声明自己支持什么）：

- spec 文本（2026-01-26）：`experimental` / `openLinks` / `serverTools{listChanged}` / `serverResources{listChanged}` / `logging` / `sandbox{permissions, csp}`（sandbox 回告**实际批准**的权限与 CSP 域）。
- SDK 2.x schema **比 spec 文本新**，另含：`downloadFile`（`ui/download-file`）、`updateModelContext`（按内容 modality 门控）、`message`（`ui/message` 的 modality 门控）、`sampling`（`sampling/createMessage` 透传）。host 声明哪些就启用哪些；未声明的请求按不支持处理。
- 与 server 连接复用时：传入真 MCP client 则 `serverTools`/`serverResources` 从 server 能力自动映射（basic-host 即如此）。

**`HostContext`**（一次性告知 View 的环境上下文，均可选）：`toolInfo`（触发本 View 的 tool call：`id` + 完整 `tool`）、`theme: "light"|"dark"`、`styles{variables, css{fonts}}`（标准化 CSS 变量 + 字体 CSS）、`displayMode`、`availableDisplayModes`、`containerDimensions`（每维独立三态：`height/width`=固定、`maxHeight/maxWidth`=View 自主可长至上限、缺省=无界）、`locale`、`timeZone`、`userAgent`、`platform: "web"|"desktop"|"mobile"`、`deviceCapabilities{touch, hover}`、`safeAreaInsets{top,right,bottom,left}`。

来源：apps.mdx Capability Negotiation / App Capabilities / Host Capabilities / Host Context 节；SDK `spec.types.ts` L494-593（一手）。

### A.4 CSP 与安全模型

**`McpUiResourceCsp` 声明语义**（server 声明 → host 落地为 CSP 指令）：

| 字段 | 映射 CSP 指令 | 语义 |
| --- | --- | --- |
| `connectDomains` | `connect-src` | fetch/XHR/WebSocket 出网域；空/缺省 = 禁止外联 |
| `resourceDomains` | `img-src`/`script-src`/`style-src`/`font-src`/`media-src` | 静态资源域；支持通配子域 `https://*.example.com` |
| `frameDomains` | `frame-src` | 嵌套 iframe；缺省 `frame-src 'none'` |
| `baseUriDomains` | `base-uri` | 缺省 `base-uri 'self'` |

- **无 `ui.csp` 时 host MUST 用限制性默认**：`default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; connect-src 'none';`
- host 可以更严但 **MUST NOT 放行未声明域**；SHOULD 记录 CSP 配置供审计；SHOULD 在 UI 要求外域访问时警示用户；MAY 有全局 allow/blocklist。
- spec 给出参考 CSP 构造（`object-src 'none'` 恒定）；basic-host 的生产化版本额外加 `worker-src 'self' blob:`（WebGL 类 app 必需）、`'unsafe-eval'`、`blob:`/`data:`，并对域条目做**注入消毒**（拒绝含 `;`、引号、空白、换行的条目——防 CSP 头注入）。

**`permissions`（Permission Policy → iframe `allow` 属性）**：`camera` / `microphone` / `geolocation` / `clipboardWrite`；app 不应假设已授予（需 feature detection）。SDK 提供 `buildAllowAttribute(permissions)`。

**`domain`**：View 的专属沙箱 origin（host-dependent 格式，如 Claude 的 `{hash}.claudemcpcontent.com`、OpenAI 的 `www-example-com.oaiusercontent.com`），用于 OAuth 回调/CORS/API key 白名单需要稳定 origin 的场景；缺省用 per-conversation 默认沙箱 origin。

**`prefersBorder`**：是否要可见边框+背景；建议显式声明（host 默认不一）。

**其他安全义务**：校验所有来自 View 的消息、拒收畸形类型、记录 View 发起的 RPC 供审计；对预取的 UI 资源做审查（恶意模式扫描、hash/签名、可疑内容警示）；UI 仍可社工欺骗（host 应明示沙箱 UI 边界）与资源消耗攻击（host 应限资源）。

来源：apps.mdx UIResourceMeta / Host Behavior / Security Implications 节；basic-host serve.ts / sandbox.ts。

### A.5 host 侧 UI 生命周期

**时序（web host，文字版）**：

```
[连接期，任意时刻]
Host ↔ Server: initialize（client extensions 声明 io.modelcontextprotocol/ui）
Host ← Server: tools/list（含 _meta.ui）／resources/list（UI 资源可省略）
Host:（可选预取）resources/read ui://…  → 缓存 HTML + csp + permissions

[工具调用]
Host → Server: tools/call {name, arguments}
Host（web）: 创建外层 sandbox iframe（独立 origin；CSP 以 HTTP 头按 ui.csp 注入）
Sandbox → Host: ui/notifications/sandbox-proxy-ready {}
Host → Sandbox: ui/notifications/sandbox-resource-ready {html, csp?, permissions?}
Sandbox: 建内层 iframe（sandbox 属性 + allow 属性）→ document.write(html)
View → Host: ui/initialize {appInfo, appCapabilities, protocolVersion}
Host → View: McpUiInitializeResult {protocolVersion, hostInfo, hostCapabilities, hostContext}
View → Host: ui/notifications/initialized {}
Host → View: ui/notifications/tool-input-partial（0..n，可选，仅流式期）
Host → View: ui/notifications/tool-input {arguments}   ← 恰一次
Server → Host: tools/call 响应
Host → View: ui/notifications/tool-result {CallToolResult}   （或 ui/notifications/tool-cancelled {reason}）

[交互期（循环）]
View → Host: tools/call（visibility 含 "app" 的工具）→ 转发 → 每次同样收到 tool-input(-partial)/tool-result
View → Host: resources/read（转发）/ ui/open-link / ui/message / ui/update-model-context /
             ui/request-display-mode / notifications.message / ping
View → Host: ui/notifications/size-changed {width,height}
Host → View: ui/notifications/host-context-changed {Partial<HostContext>}（主题/尺寸/displayMode 变化）

[清理（可发生在初始化后的任意时点）]
Host → View: ui/resource-teardown {reason}（请求；SHOULD 等响应）
View → Host: result {}
Host: 拆除 iframe 与 listeners
```

**挂载/卸载/resize 要点**：

- 尺寸：`containerDimensions` 固定维 host 控制；flexible 维（`maxHeight` 等）host **MUST** 监听 `ui/notifications/size-changed` 并调整 iframe 尺寸。SDK View 侧默认 `autoResize`（ResizeObserver + debounce，仅实际变化才发）。
- basic-host 的宿主侧经验：iframe 上再挂 ResizeObserver，把容器宽变化经 `sendHostContextChange({containerDimensions})` 回告 View；`onsizechange` 处理 `box-sizing: border-box` 时要补 border 厚度防反馈回路；高度变化用 `iframe.animate()` 平滑过渡。
- 卸载：`teardownResource({reason})` → 等响应 → 拆（basic-host 用 `isDestroying` 状态 + `onTeardownComplete` 回调实现 graceful teardown）。

**同一 tool 多次调用的实例关系**：

- **spec 未明文规定**（未确认有强制语义）——host 自行决定 View 与 tool call 的绑定关系。`HostContext.toolInfo.id`（tools/call 的 JSON-RPC id）+ `tool` 让 View 能感知自己属于哪次调用。
- 官方参考实现 basic-host 的做法（一手源码）：**每次工具调用一个独立 View 实例**——每个 `ToolCallInfoPanel`（key = 递增 call id）各持一个 iframe + 各建一个 `AppBridge` + 各一条 `PostMessageTransport`；关闭时走 graceful teardown 后从列表移除。即「per-call 实例、互不共享」是最简可循模型。

来源：apps.mdx Lifecycle 节（4 张时序图）+ Container Dimensions 节；basic-host index.tsx / implementation.ts。

### A.6 host 实现者视角：最小集合 vs 可选

我们 web 宿主（agents-remote 控制面）要支持 MCP Apps 的**最小实现集**：

1. 对 sidecar server 的 MCP client 初始化时声明 `capabilities.extensions["io.modelcontextprotocol/ui"] = { mimeTypes: ["text/html;profile=mcp-app"] }`。
2. `tools/list` 后解析 `tool._meta.ui.resourceUri`（**兼容旧 `_meta["ui/resourceUri"]`**）；命中即知该 tool 有 UI。
3. `resources/read` 该 URI，校验 `mimeType === "text/html;profile=mcp-app"`，取 `text`/`blob` 与 `_meta.ui{csp, permissions, prefersBorder}`（content 级优先、listing 级兜底）。
4. **双 iframe 沙箱**：宿主页（origin A）+ sandbox proxy 页（origin B，CSP 走 HTTP 头按 `?csp=` 注入 + 域条目消毒）+ 内层 View；实现 `sandbox-proxy-ready` / `sandbox-resource-ready` 双消息与双向 origin 校验 relay。
5. `AppBridge`（或等价手写）：应答 `ui/initialize`（回 hostInfo/hostCapabilities/hostContext）、收 `initialized`、`sendToolInput` → `sendToolResult`/`sendToolCancelled`；转发 `tools/call`（校验 visibility）与 `resources/read`。
6. 监听 `size-changed` 调 iframe 尺寸；关闭前 `ui/resource-teardown` 等响应再拆。
7. `tools/list` 过滤 app-only tool；拒绝越权 `tools/call`。

**可选增强**（按需）：`tool-input-partial`（流式参数预渲染）、`host-context-changed`（主题切换/容器 resize 推送）、`ui/open-link`/`ui/message`（建议加用户确认）/`ui/update-model-context`/`ui/request-display-mode`、`permissions` 与 `allow` 属性、`prefersBorder`、标准化 CSS 变量 theming、`resources/list` 转发、app 工具（`appCapabilities.tools`）、sampling 透传。

---

## B. `@modelcontextprotocol/ext-apps` 官方 SDK

### B.1 包结构与导出面

npm 包 `@modelcontextprotocol/ext-apps`，MIT（package.json；仓库 LICENSE 处于 MIT→Apache-2.0 过渡声明中）。Node ≥20，ESM。`exports`：

| 入口 | 内容 |
| --- | --- |
| `.`（`src/app.ts`） | **UI/iframe 侧**：`App` 类 + `PostMessageTransport` + 常量 + 类型 + `styles.ts` 帮手（`applyHostStyleVariables`/`useHostStyleVariables`、`applyDocumentTheme`/`useDocumentTheme`、`applyHostFonts`）+ `EventDispatcher` |
| `./app-with-deps` | App 连依赖单文件版（方便直接内联进 HTML） |
| `./react` | React 集成（hooks）；`./react-with-deps` 同理 |
| `./app-bridge` | **宿主侧**：`AppBridge` 类 + `PostMessageTransport` + `buildAllowAttribute` + `getToolUiResourceUri` + 常量/类型 |
| `./server` | **server 侧**：`registerAppTool` / `registerAppResource` / `getUiCapability` / `EXTENSION_ID` / `RESOURCE_MIME_TYPE` / `RESOURCE_URI_META_KEY` |
| `./schema.json` | 生成的 JSON Schema（zod → json schema） |

`src/` 主要文件：`app.ts`（App 类，~75KB）、`app-bridge.ts`（AppBridge，~75KB）、`message-transport.ts`（PostMessageTransport）、`spec.types.ts`（全部 `McpUi*` 类型）、`styles.ts`、`legacy-handlers.ts`、`server/index.ts`、`react/`。测试用 bun test + Playwright e2e。

**`App` 类（iframe 内 UI 侧，供对照）**：`new App({name, version}, options?)` → `app.connect()`（自动发 `ui/initialize`）；handlers：`ontoolinput` / `ontoolinputpartial` / `ontoolresult` / `ontoolcancelled` / `onhostcontextchanged` / `onteardown` / `oncalltool`（App 暴露的工具被 host 调用）/ `onlisttools`；方法：`callServerTool({name, arguments})`、`sendMessage(...)`、`updateModelContext(...)`、`openLink(url)` 等。handler 需在 `connect()` 前设置以免丢初始消息（quickstart 明示）。

### B.2 host 侧能复用什么 / 最小宿主要自己写什么

**已封装（直接复用）**：

- `AppBridge` 类——完整的桥：初始化握手（应答 `ui/initialize`、发 initialized 事件）、请求分发、能力回告、JSON-RPC 帧/超时/错误。
  - 构造：`new AppBridge(mcpClient | null, hostInfo: Implementation, hostCapabilities: McpUiHostCapabilities, options?: {hostContext})`。传真 MCP client（`@modelcontextprotocol/client` 的 `Client`）时自动把 server 能力（tools/resources/prompts）映射进 `serverTools`/`serverResources` 并自动转发 `tools/call`/`resources/read`；传 `null` 则宿主自己实现 `oncalltool` 等处理器。
  - `connect(new PostMessageTransport(iframe.contentWindow, iframe.contentWindow))`——target 与 source 都传同一 iframe 的 contentWindow，保证只响应该 iframe。
  - Host → View 通知方法：`sendToolInput({arguments})`、`sendToolResult(CallToolResult)`（须在 tool-input 之后）、`sendToolCancelled({reason})`、`teardownResource({reason})`（别名 `sendResourceTeardown`，返回 Promise 等响应）、`setHostContext(ctx)` / `sendHostContextChange(partial)`（发 `host-context-changed`）、`sendSandboxResourceReady({html, csp, permissions})`。
  - View 请求处理器（setter）：`oncalltool` / `onopenlink` / `onmessage` / `onupdatemodelcontext` / `onrequestdisplaymode` / `onloggingmessage`；事件：`oninitialized` / `onsizechange` / `onclose`。
- `PostMessageTransport`——postMessage 双向传输封装。
- `buildAllowAttribute(permissions)`——permissions → iframe `allow` 属性串。
- `getToolUiResourceUri(tool)`——新旧两种 `_meta` 格式兼容解析。
- `getUiCapability(clientCapabilities)` / `registerAppTool` / `registerAppResource`——server 侧（sidecar 用）。

**宿主必须自己写（SDK 不代劳）**：

1. **DOM 与 iframe 拓扑**：创建外层 sandbox iframe 元素、内层 View 的注入时机；外层 sandbox.html 页面本身（可直接借鉴 `examples/basic-host/sandbox.html` + `sandbox.ts`，约 137 行：referrer 校验、`window.top` SecurityError 自检、双向 relay + origin 校验、`sandbox-resource-ready` 处理建内层 iframe）。
2. **sandbox proxy 页的托管与 CSP**：须在**与宿主不同 origin** 上托管（basic-host 用同机不同端口 8080/8081），CSP 以 HTTP 响应头注入（按 `?csp=` 查询参数动态构造 + 域条目消毒）——这是安全模型的关键，SDK 不管。
3. **外层 iframe 的 `sandbox` 属性**（`allow-scripts allow-same-origin [allow-forms]`）与 `allow` 属性（`buildAllowAttribute`）设置，以及等 `sandbox-proxy-ready` 的时序（basic-host `loadSandboxProxy()`）。
4. **资源读取与缓存**：`resources/read` 取 HTML（blob 要 `atob`）、content/listing 两级 `_meta.ui` 合并——basic-host `getUiResource()` 可抄。
5. **时序编排**：connect bridge → `sendSandboxResourceReady` → 等 `oninitialized` → `sendToolInput` → `sendToolResult`/`sendToolCancelled`（basic-host `initializeApp()` 就是这个顺序）。
6. **尺寸管理**：`onsizechange` → 改 iframe 样式（注意 border-box 补偿）；容器变化 → `sendHostContextChange({containerDimensions})`。
7. **teardown 编排**、`ui/message`/`open-link` 的 UI 呈现与（可选）用户同意、主题/CSS 变量映射到 `hostContext.styles`。

### B.3 examples/ 目录

- **宿主参考**：`basic-host`（本调研宿主侧主要依据；亦是本地调试用测试宿主，`SERVERS` 环境变量指定被连 server）。
- **server 起步模板**：`quickstart`、`basic-server-vanillajs`、`basic-server-react`、`basic-server-vue`、`basic-server-svelte`、`basic-server-preact`、`basic-server-solid`。
- **领域示例**：`map-server`（CesiumJS）、`threejs-server`、`shadertoy-server`、`cohort-heatmap-server`、`customer-segmentation-server`、`wiki-explorer-server`、`scenario-modeler-server`、`budget-allocator-server`、`pdf-server`、`video-resource-server`、`sheet-music-server`、`say-server`（TTS）、`qr-server`、`system-monitor-server`、`transcript-server`（STT）、`lazy-auth-server`、`debug-server`、`integration-server`。
- 仓库还自带 4 个 Agent Skills（`create-mcp-app` / `migrate-oai-app` / `add-app-to-server` / `convert-web-app`）用于让编码 agent 快速搭 app。

### B.4 供应链信息（供 ≥7 天判定）

- npm 包：`@modelcontextprotocol/ext-apps`；**latest `2.0.3`，发布 2026-09-25**（距今 25 天 ≥7 天，可直接用）。次新线 1.x 终点 `1.7.5`（2026-07-23）；2.0.0 发布于 2026-09-08。
- GitHub `modelcontextprotocol/ext-apps`：**2,980 stars / 407 forks**、open issues 233、创建 2025-11-21、最近 push 2026-09-25（随 2.0.3）；非 archived；官方 org 维护（spec 与 SDK 同仓）。
- 成熟度：**非 pre-alpha**。SEP-1865 已 Stable；包已 1.0（2026-01-26 与 spec 同日）并完成 2.0 大版本（迁移到 MCP SDK 2.x 分包）；CI + Playwright e2e + 互操作测试（`interop-v1.test.ts` 拿已发布 1.7.5 对拍）齐备。
- License：package.json `MIT`；仓库 LICENSE 为 MIT→Apache-2.0 过渡声明（新贡献 Apache-2.0）。

### B.5 与 `@modelcontextprotocol/sdk` 主包的关系

- **独立包，不是主包内置**；且 **2.x 已切换到 SDK 2.0 新分包体系**：peerDependencies 为 `@modelcontextprotocol/client@^2.0.0`、`@modelcontextprotocol/core@^2.0.0`、`@modelcontextprotocol/server@^2.0.0`（optional）、`zod@^4.2.0`、`react`/`react-dom`（optional）。运行时依赖仅 `@standard-schema/spec`。
- 旧主包 `@modelcontextprotocol/sdk`（1.x，latest 1.32.1）**只出现在 devDependencies**，仅用于 v1 互操作测试——2.x 不再基于它。
- SDK 2.x 分包现状（npm 一手）：`@modelcontextprotocol/client` / `core` / `server` latest 均 `2.3.1`（2026-10-05 发布，≥7 天）。
- 对本项目的含义：`api` 现用 `@modelcontextprotocol/sdk@^1.30.0`（`mcp-hub-server.ts` 用 `McpServer` + `WebStandardStreamableHTTPServerTransport`）。若 sidecar 想用 `registerAppTool`/`registerAppResource`/`getUiCapability` 等 ext-apps server 帮手，需引入 SDK 2.x 分包体系（`@modelcontextprotocol/server`）；**或**留在 1.x 上手写（1.30 的 capabilities schema 已含 `extensions` 字段，协商声明/读取无障碍，只是没有 ext-apps 的便捷封装）——两条路线都通，属实现决策。

---

## C. Skills over MCP（SEP-2640，extension `io.modelcontextprotocol/skills`）

> 规范文本：ext-skills `specification/stable/skills.mdx`（稳定快照，不就地改）；针对 base protocol revision **2026-07-28 或更新**。SEP-2640 状态 **Final**（PR #2640 于 2026-09-13 merge）。仓库 742 stars，最近 push 2026-10-16，活跃。
> 语义定位：扩展只定义**传输绑定**；skill 格式本身（目录结构、frontmatter、命名规则、渐进披露）整体委托 [Agent Skills 开放规范](https://agentskills.io/specification)。扩展只依赖 base 的 Resources primitive——文件都走标准 `resources/read`，新增三个方法：`skills/list`、`skills/get`、`resources/directory/read`（可选）。

### C.1 capability 协商形状

**server 侧**（注意：本扩展针对 2026-07-28 base revision，server 能力出现在 `server/discover` 响应中）：

```jsonc
{ "capabilities": {
    "resources": {},                    // 声明本扩展 MUST 同时声明 resources 能力
    "extensions": {
      "io.modelcontextprotocol/skills": { "directoryRead": true }
    } } }
```

- 唯一 extension 设置：`directoryRead: boolean`（默认 `false`）= server 实现 `resources/directory/read`。空对象 `{}` = 仅支持扩展本体。
- 声明扩展 ⇒ **MUST** 实现 `skills/list` + `skills/get`；`directoryRead: true` ⇒ **MUST** 实现 `resources/directory/read`；client **MUST NOT** 对未声明的 server 调 `resources/directory/read`。
- client 在观察到 server 声明后才发 `skills/list`/`skills/get`；对未实现本扩展的 client，`skill://` 资源就是普通资源。
- **每个请求的 `params._meta` MUST 携带**：`io.modelcontextprotocol/protocolVersion`、`io.modelcontextprotocol/clientInfo`、`io.modelcontextprotocol/clientCapabilities`（2026-07-28 base 的 request metadata 要求）。

### C.2 `skills/list` 与 `skills/get` 的完整形状

**`Skill` entry**（两个方法返回同一形状）：

```ts
interface SkillResource {
  uri: string;        // 文件的资源 URI
  digest: string;     // "sha256:{64 位小写 hex}"，文件原始字节
  size: number;       // 同一原始字节的字节长度
}
interface Skill {
  uri: string;        // SKILL.md 的资源 URI（可 resources/read）
  frontmatter: {      // SKILL.md YAML frontmatter **逐字**转 JSON；name/description 必在，其余字段原样透传
    name: string; description: string; [key: string]: unknown;
  };
  resources: SkillResource[] | "dynamic";  // REQUIRED；数组=完整清单；"dynamic"=动态生成无法发布稳定 digest
  _meta?: MetaObject; // 本扩展的键用 "io.modelcontextprotocol.skills/" 前缀
}
```

- `resources` 数组 **MUST 完整**：列出 skill 的每一个文件（各恰好一次），**含一个 `uri` 等于 skill 顶层 `uri` 的条目**（即 SKILL.md 自身的 digest/size）；嵌套 skill 的文件也算 enclosing skill 的 supporting files（同一文件可出现在两个 entry 中）。
- `resources` 缺失或既非数组也非 `"dynamic"` ⇒ entry 非法，host **MUST NOT** 加载；`"dynamic"` 无完整性，host MAY 拒载。
- **固定上限**：每 skill `resources` ≤ **512 条**；文件总大小 ≤ **16 MiB**（16,777,216 字节，按 `size` 求和）。host MUST 支持到上限、MAY 支持更大；entry 自身即可核对（取文件前就能拒）。

**`skills/list`**：

```json
// 请求（分页 + 必带 _meta）
{ "jsonrpc": "2.0", "id": 4, "method": "skills/list",
  "params": { "_meta": { "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                          "io.modelcontextprotocol/clientInfo": {...},
                          "io.modelcontextprotocol/clientCapabilities": {} } } }
// 响应
{ "result": { "resultType": "complete",          // MUST 为 "complete"
              "skills": [ Skill, ... ],
              "ttlMs": 300000, "cacheScope": "public",   // REQUIRED（CacheableResult，同 tools/list）
              "nextCursor": "..." } }                     // 有则翻页
```

- 结果 **MAY 为空/部分**；host **MUST NOT** 把空/部分列表当「无 skill」证明，**MUST** 支持仅凭 URI 加载 skill。
- entry 是原子的：单个 skill 的 `resources` 不跨页拆分。
- **entry 是完整清单而非摘要**：翻完列表即具备建注册表、呈请批准、绑定批准内容、校验后续每个文件的全部信息——**无需再调 `skills/get` 补全**。

**`skills/get`**：

```json
// 请求：params = { _meta: {...}, "uri": "skill://pdf-processing/SKILL.md" }
// 响应：{ "result": { "resultType": "complete", "skill": Skill, "ttlMs": 300000, "cacheScope": "public" } }
```

- `uri` MUST 指向某 skill 的 `SKILL.md`；不是 server 所服务的 skill ⇒ **MUST** 返回 `-32602`（与 `resources/read` 未知资源同码）。
- server **MUST** 能应答它服务的每一个 skill，哪怕不在（部分）列表里；结果是时点快照，host 可只对单个 skill 刷新 digest 而不重列目录；无分页。

### C.3 `skill://` URI 结构规则与非 skill:// 容忍度

```
skill://<skill-path>/<file-path>
例：skill://git-workflow/SKILL.md
    skill://pdf-processing/references/FORMS.md
    skill://acme/billing/refunds/SKILL.md      ← 前缀 acme/billing，name = refunds
```

- `<skill-path>`：一或多段 `/` 分隔路径，定位 skill 在 server skill 命名空间中的目录；**末段 MUST 等于 SKILL.md frontmatter 的 `name`**（镜像 Agent Skills 规范「name = 目录名」，从而 skill name 可从 URI 单独恢复）；末段 MUST 满足 Agent Skills 命名规则；前缀段是 server 自选组织轴（域/团队/版本）。
- 第一段占 URI **authority** 组件，SHOULD 是 RFC 3986 合法 `reg-name`；client **MUST NOT** 对 authority 做 DNS/网络解析。
- `<file-path>`：相对 skill 目录根的路径。skill 根目录 = `skill://<skill-path>`（即去掉 `/SKILL.md` 后缀、无尾斜杠）。
- SKILL.md 资源元数据建议：`mimeType: text/markdown`；`name`/`description` 取 frontmatter 同名字段；额外 frontmatter 字段可经资源 `_meta` 暴露（键用 `io.modelcontextprotocol.skills/` 前缀）。
- **嵌套 skill**：允许；对 enclosing skill 而言嵌套内容只是普通 supporting 文件（嵌套 SKILL.md 被当普通 markdown 读，host **MUST NOT** 按其 frontmatter 行事）；激活嵌套 skill 需**新的独立用户同意**；发布是扁平的（列表不标嵌套，仅 uri 共享路径前缀）。
- **非 `skill://` scheme**：server MAY 用自己域的原生 scheme（如 `github://owner/repo/skills/refunds/SKILL.md`）；无特权 scheme；结构约束（末段= name、显式 SKILL.md）对任何 scheme 适用；`skills/list` 枚举不分 scheme。host 判断「是 skill」只有两条路：`skills/list` entry（权威），或显式引用（server `instructions`/别的 skill/用户）经 `skills/get` 确认。**host MUST NOT 仅凭 URI scheme 推断是 skill**。
- skill 身份 = **(host 给 server 的身份标识, skill uri)** 二元组：两台 server 可同时服务同名 `skill://refunds/SKILL.md` 而互不相关；host 记录/寻址/缓存/批准持久化 **MUST** 保存两半、**MUST NOT** 只按 uri 键控；物化路径 MUST 编码 server 身份。
- **name 是标签不是标识符**：同 server 列表内 name SHOULD 唯一但不保证；冲突时 host MUST 消歧（不得默默丢弃/偏好）；跨源 name 在 per-origin 命名空间内解析；MCP skill **MUST NOT** 静默遮蔽/顶替任何其他来源的同名 skill。

### C.4 skill 文件读取、frontmatter 与 Agent Skills 规范的关系

- 文件读取 = 标准 `resources/read skill://...`，**无 skill 特有读取语义**。相对引用（如 SKILL.md 里链接 `references/GUIDE.md`）按文件系统语义相对 **skill 根**解析（`skill://acme/billing/refunds/references/GUIDE.md`）；嵌套 skill 各自的 SKILL.md 引用相对各自目录。
- **读取 ≠ 激活**：`resources/read` 只是传输；skill 只有经 host 自己的 skill-loading 路径（校验 entry + 用户批准 + 打开「acting window」）才算加载。从其他途径读到的 SKILL.md 是普通资源内容，不得授予任何地位。
- **frontmatter 与 agentskills.io**：`frontmatter` 逐字透传（JSON 对象），`name`/`description` 必在（Agent Skills 规范要求），`license`/`metadata` 等一切字段原样。host 可仅凭 entry 建 skill 注册表，不必取每个 SKILL.md。frontmatter `metadata` 中 `io.modelcontextprotocol/` 前缀键保留给 MCP 扩展（本扩展目前未定义任何键，实现 SHOULD 忽略不认识的前缀键）。
- **host 侧 frontmatter 校验义务**：取到 SKILL.md 后 **MUST** 解析 frontmatter 并与 entry 的 `frontmatter` **逐字段比对**；任何出入 = 校验失败（等同 digest 不匹配），**MUST NOT** 加载。
- **`allowed-tools` 等提权字段**：远程 skill 的 frontmatter 不得隐式扩权——`allowed-tools` 对 MCP 来源 skill **MUST** 忽略，除非用户对该 skill 显式批准该授权。

### C.5 `skill://index.json` 与 resource template（重要更正：最终版已移除）

- **stable 规范里没有 `skill://index.json`，也没有 resource template 约定**（全文 grep 无命中）。这是早期草案的约定，在 v1 收缩中被替换：
  - 决策日志（2026-06-05 前后）：原设计 server SHOULD 暴露 well-known `skill://index.json`（跟随 Agent Skills well-known discovery index 格式），entry 含 `digest`（2026-06-02 恢复）、`type: "archive"`（zip/tar 整包分发）、`type: "mcp-resource-template"`（经 completion API 的参数化模板发现）。
  - **2026-07-16 v1 scope-down**：核心维护者对 index.json「专有格式、 complicates permissions/TTL」等结构性异议 ⇒ **枚举从 `skill://index.json` 资源改为 `skills/list` 方法**（同 entry schema、换载体；分页 + SEP-2549 TTL 语义），archive 与 template 一并出局；嵌套解禁、`skill://` 去特权化也在同批。URI 结构本身不变（显式 SKILL.md、末段=name、可选前缀、authority 无特殊语义）。
- 对我们的含义：sidecar 不需要实现/提供 `index.json`；目录枚举诉求由 `resources/directory/read` 承接（见 C.7）。

### C.6 digest/size 完整性校验：host 的义务与流程

- digest = 文件**原始字节**的 SHA-256，格式 `sha256:{64 位小写 hex}`；`size` = 同一字节的长度。
- **读时校验（MUST）**：host 取得 entry `resources` 中列出的文件时，**MUST** 对照该 entry 的 `digest` 与 `size` 验证；字节长度不符即等同 digest 失配（哪怕不再算 hash）；失配（损坏/篡改/服务端已更新）⇒ **MUST NOT** 使用未验证内容。
- **staleness 恢复**：对该 skill 调 `skills/get`（或重列 `skills/list`），从当前 `resources` 集继续；集合变了 ⇒ 已持久化的内容绑定批准**作废**。
- **acting window 与 held entry**：从 SKILL.md 进入模型上下文起（至少）到其离开上下文止，host 处于「acting on」状态并持有当时的 entry；期间该 skill 文件的读取 **MUST** 只解析到 held entry `resources` 列出的 URI；读到未列文件 = 校验失败（等同 digest 失配，因为 `resources` 完整 ⇒ 未列文件本身就是变更）。
- **惰性取回（MUST NOT 预取）**：连接时、列表时、批准时都不得提前拉文件；SKILL.md 在加载时取、supporting file 在被读时取。已取内容 SHOULD 缓存：digest 仍匹配当前 entry 可直接复用，不匹配必须重取。
- **digest 不是信任锚**：digest 无签名且与内容同源（同一 server 提供），只证一致性不证可信；中间人可同时改写 entry 与内容。host **MUST NOT** 把 digest 匹配当安全边界。
- **缓存安全（若落盘）**：要么缓存只允许 host 写且永不原地改文件，要么每次访问重算 SHA-256 比对 entry；缓存位置 MUST 排除在一切本地文件系统 skill 发现路径之外；从缓存加载的内容在所有规则下仍按「MCP 来源」对待（含 host 重启、server 已断连后）；用户移除 server 时 SHOULD 清其缓存。

### C.7 `resources/directory/read`（可选方法）

```json
// 请求（仅当 server 声明 directoryRead: true）
{ "method": "resources/directory/read",
  "params": { "_meta": {...}, "uri": "skill://pdf-processing/templates" } }
// 响应
{ "result": { "resultType": "complete",
              "resources": [                                  // 直接子级的 Resource 元数据
                { "uri": "skill://pdf-processing/templates/invoice.md", "name": "invoice.md", "mimeType": "text/markdown" },
                { "uri": "skill://pdf-processing/templates/regional",   "name": "regional",   "mimeType": "inode/directory" } ],
              "ttlMs": 300000, "cacheScope": "public", "nextCursor": "..." } }
```

- **目录资源** = `mimeType: "inode/directory"` 的资源；目录 URI **无尾斜杠**；每层目录（skill 根 `skill://pdf-processing` 与各子目录）都是可寻址目录资源，可不在 `resources/list` 中出现。
- 非递归，client 对子目录再次调用下钻；空目录 ⇒ 空 `resources`；URI 不存在或非目录 ⇒ `-32602`。
- server 声明 `directoryRead` 后 MUST 对其按单文件方式服务的 skill 命名空间内**每个**目录支持该方法；方法本身不限于 skill，server MAY 对任何 scheme 的目录资源支持。
- **与 held entry 的关系**：entry 是权威（host 可只凭 entry 回答「templates/ 里有什么」，此时根本不用该方法）；目录读取的价值在 `"dynamic"` skill、非 skill 资源树、以及要 server 当前视角时。两者可不一致：目录读出的新增文件**不得**在当前批准下读/呈现给模型（未列文件=校验失败）；要纳入须 `skills/get` 刷新 entry ⇒ 批准作废重批。host **MUST NOT** 把目录结果当 manifest 扩展（本扩展无共享版本号/cache token 能对齐两者快照）。

### C.8 host 侧安全义务清单（Sep 文本 MUST 汇总）

skill 内容是喂给模型的指令文本 = prompt injection 面，规范把 MCP 来源 skill 定为**比远程工具调用更高危的面**：内容按不受信模型输入处理；进入模型上下文时 MUST 标注来源 server 身份（host 分配的 label，非 server 自报 name）、MUST NOT 与本地文件系统 skill 不可区分地呈现；无 per-skill 显式批准不得引发 host 侧代码执行（含 frontmatter 声明性脚本与正文教唆的工具调用，后者同样过批准门）；模型可调的资源读取 MUST 绑定到 skill 来源 server（防跨 server confused deputy），跨源读须逐次点名两 server 的用户批准；per-skill 批准 MUST 绑定当时的 `resources` 集合（uri+digest 全集），集合变化即作废重批；`"dynamic"` skill 不能内容绑定（MAY 拒载，MUST NOT 让持久批准覆盖任意当前内容）；name 冲突按 per-origin 命名空间消歧并向用户呈现。

### C.9 SDK 支持现状（决定 sidecar 实现方式）

- **官方 SDK 均未发布 skills 支持**（implementations.md，2026-10 现状）：TypeScript SDK（typescr**ipt-sdk#2818**，phase 1：schemas/client ops/server handlers，PR open、2026-10-16 仍有更新）、Python SDK（#3485 in progress）、Go SDK（#1238 in progress，已过 conformance suite）、C# SDK（in progress）。
- 已可用的参考实现：`mcpkit`（Go 社区，v1，过 conformance server scenarios）、Tachyon（Java，v1 自报）；server 侧 `hf-mcp-server`（HuggingFace，TypeScript，v1：`skills/list`+`skills/get`+`directoryRead`，仅 HTTP transport）等。
- host 侧已部分支持：MCP Inspector（2.6.0 起，含 CLI verify）、fast-agent、MCPJam；ChatGPT plugins 为提交时静态快照式 partial。
- ⇒ 对我们 sidecar 的含义：**在现有 `@modelcontextprotocol/sdk@1.30` 上手写三个方法**（`skills/list`/`skills/get`/可选 `resources/directory/read` 的 `setRequestHandler` + `server/discover` 的 `capabilities.extensions` 声明）是当下唯一不升级 SDK 的路径；digest 计算用 Bun 原生 `Bun.CryptoHasher`/node `crypto` 即可。TS 官方支持落地（#2818 merge + 发版）后再考虑迁移。

---

## D. 对 agents-remote 的落点要点（推断性结论，供设计讨论）

1. **宿主侧（web 控制面）**：SDK 可复用度高——`AppBridge`（握手/转发/通知）+ `PostMessageTransport` + `buildAllowAttribute` + `getToolUiResourceUri` 直接用；要自己写的核心是**双 iframe 沙箱拓扑与 CSP 托管**（sandbox proxy 页 + 独立 origin + HTTP 头 CSP + origin 校验 relay），basic-host 的 `sandbox.ts`（137 行）+ `serve.ts` CSP 构造可直接借鉴改造。注意我们宿主与 sidecar 的连通形态：AppBridge 可传 `null` client 走自实现 handlers（把 `tools/call`/`resources/read` 路由到我们自己的 sidecar 管道），也可起一个浏览器侧 MCP client 连 sidecar 的 Streamable HTTP 端点。
2. **sidecar 侧**：`ui://` 资源用 `registerAppResource` 需要 SDK 2.x 分包；留在 1.x 则手写（1.30 schema 已支持 `capabilities.extensions` 协商）。`skill://` 无 SDK 可依赖，手写三方法 + digest 清单。
3. **同源问题**：我们 web 控制面与 api 同源部署（43012/43011）⇒ 做 MCP Apps 宿主**必须**为 sandbox proxy 找一个与 43012 不同的 origin（子域或独立端口），这是规范 MUST，不是可选项。
4. **实例模型**：per-call 独立 iframe+AppBridge 是官方参考做法，与会话消息流（工具调用卡片）天然对齐；但长驻仪表盘类 app 的复用/重建策略 spec 未约束，需自行设计（未确认有既定最佳实践）。

## 未确认事项汇总

- 「同一 tool 多次调用的实例关系」在 spec 层面无明文（A.5 以 basic-host 一手实现为参考）。
- `ui/message` 的 `content` 支持的 block 类型全集（spec 示例仅 `text`；SDK 2.x 以 `HostCapabilities.message` modality 门控，具体允许集合未见清单）。
- `domain` 字段各宿主的实际格式与校验规则（规范明示 host-dependent，须查目标宿主文档）。
- client-matrix 页各客户端对两扩展的支持勾选（抓取丢失勾选标记，A.0 引 overview 页文字陈述）。
- `@modelcontextprotocol/ext-apps` 1.x（基于 SDK 1.x）是否仍维护/值得作为过渡（2.0.0 后 1.x 无新版本发布，判定为停更线，但未见官方弃用声明）。
