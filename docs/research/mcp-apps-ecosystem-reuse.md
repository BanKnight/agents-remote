# MCP Apps（SEP-1865）生态规模与「第三方宿主重用第三方 server UI」可行性调研

> 调研日期：2026-10-21。服务对象：agents-remote 已落地的 MCP Apps 宿主（自家 ar-hub 模板渲染）评估能否重用生态已有第三方 server UI。主文档：[mcp-apps-hosting.md](./mcp-apps-hosting.md)；深素材：[mcp-apps-spec-notes.md](./mcp-apps-spec-notes.md)、[mcp-cli-ecosystem-notes.md](./mcp-cli-ecosystem-notes.md)。
>
> **证据强度标注约定**：`[官方]` = 官方文档/官方博客一手抓取（当日原文）；`[官方repo]` = 官方 GitHub 仓库源码/文档（含 GitHub API 一手元数据）；`[vendor]` = 厂商自述文档；`[中]` = deepwiki 源码推导 / 结构化二手分析（已与机制核对）；`[弱]` = 社区帖子 / 二进制逆向转述 / 未验证目录站。未确证的点明确标「未确认」，无编造。

## 0. 结论先行

- **第三方重用现实可行性评分：中（3/5）**。三个子面分化：协议面（高）——SEP-1865 已 Stable，ChatGPT 与 M365 Copilot 均已把标准桥当主路径；宿主面（高）——8+ 宿主已实现，双 iframe 沙箱成共识，官方提供 AppBridge/basic-host/`@mcp-ui/client` 三级参考；**内容面（低）——可重用 app 供给是短板**：demo/样板级充足（官方 18+ 示例、playground、boilerplate），商业级确凿样本只有 SvGrid 一家，ChatGPT 目录 app 不可直接拿来用（凭据绑定 OpenAI 生态 + 是否对第三方 client 吐 `_meta.ui` 未确认）。
- **「OpenAI app 是否可移植」的准确答案**：Apps SDK 不是 SEP-1865 的私有 fork，而是「标准 + 私有扩展层」。2026-10 官方文档明示「ChatGPT implements the open MCP Apps standard」，新 UI 全走 `_meta.ui.resourceUri` + `ui/*` JSON-RPC 桥，`openai/*` 键与 `window.openai` 降级为 compatibility alias；skybridge 时代（2025-10）存量 app 需按官方迁移指南改造，深度依赖 `requestCheckout/uploadFile/requestModal` 的 app 迁移后功能降级。**重用生态 app 的正确姿势是「标准桥 app」，不是「ChatGPT 目录 app」。**
- **三道墙投入建议：不集中投入，按「资源代理先行、双 iframe 等信号、CLI _meta 不投入」分步**（详见 §5）。核心判断：我们已落地的宿主方向不会白费（标准已赢），但「第三方 app 库」现阶段是 demo 池不是内容池——投入节奏应由「接第一个真实第三方 server」这一事件触发，而不是由生态规模预期触发。

## 1. OpenAI Apps SDK 的 app 可移植性

### 1.1 ChatGPT 侧现状：标准为主、别名为兼容（[官方]，2026-10-21 抓取 developers.openai.com/apps-sdk/mcp-apps-in-chatgpt）

- 原文「ChatGPT implements the open MCP Apps standard for UI returned by an MCP server」；新 UI 三步：`_meta.ui.resourceUri` 声明 → `ui/*` JSON-RPC over postMessage 桥 → tool 无 UI 时保持可用（优雅降级）。「This standards-first foundation lets the same UI run in ChatGPT and other compatible MCP Apps hosts.」
- 官方别名对照表（存量兼容，新 UI 应弃用）：`_meta["openai/outputTemplate"]` ↔ `_meta.ui.resourceUri`；`window.openai.toolInput/toolOutput` ↔ `ui/notifications/tool-input/tool-result`；`window.openai.callTool` ↔ `tools/call`；`window.openai.sendFollowUpMessage` ↔ `ui/message`。
- ChatGPT 独有扩展（无标准等价，官方要求 feature-detect + fallback、禁止按 host 名分支）：`requestCheckout`（支付，private beta）、`uploadFile/selectFiles/getFileDownloadUrl`（文件）、`requestModal`、`widgetState/setWidgetState`（含 `modelContent/privateContent/imageIds` 结构化 widget state）、`_meta["openai/toolInvocation/invoking|invoked"]`。
- 官方示例代码（dice widget）已是纯标准桥手写 postMessage JSON-RPC + `mimeType: "text/html;profile=mcp-app"` + `registerAppResource`——OpenAI 自己的文档范式已与 ext-apps 无缝对齐。

### 1.2 skybridge 存量 dialect 与迁移路径（[官方repo] ext-apps `docs/migrate_from_openai_apps.md`，393 行全文精读）

| 维度 | skybridge（2025-10 时代） | MCP Apps（SEP-1865） |
| --- | --- | --- |
| UI 关联 | `_meta["openai/outputTemplate"]`（扁平） | `_meta.ui.resourceUri`（嵌套） |
| MIME | `text/html+skybridge` | `text/html;profile=mcp-app` |
| 桥 | 隐式全局 `window.openai.*`，属性预填 | 显式 `new App()` + `app.connect()`，回调异步 |
| CSP 字段 | snake_case（`resource_domains` 等） | camelCase（`resourceDomains` 等），另加 `baseUriDomains` |
| 可见性 | `openai/widgetAccessible`(bool) / `openai/visibility`(string) | `_meta.ui.visibility`（string[]） |

- 无标准等价的 skybridge 功能（迁移即降级）：`toolInvocation/invoking|invoked`、`widgetDescription`、`widgetState` 持久、`uploadFile`、`getFileDownloadUrl`、`requestModal`、`requestClose`、`setOpenInAppUrl`、CSP `redirect_domains`。
- **双桥兼容正在 SDK 层收敛**：ext-apps `App.connect()` 自动探测 OpenAI 环境（「auto-detects OpenAI vs MCP」原文）；强制 OpenAI 模式的 `OpenAITransport` 尚在 PR #172。即新 app 用 ext-apps 写一份即可同时喂 ChatGPT 与标准宿主。

### 1.3 组件库与托管（[官方]）

- `@openai/apps-sdk-ui`（openai.github.io/apps-sdk-ui）：可选 React 组件库，纯样式层，不影响协议可移植性；示例仓 `openai/openai-apps-sdk-examples`（Pizzaz 系列）。
- **HTML 托管 = server 自带，无 OpenAI 目录托管**：官方范式是把构建产物（esbuild 单文件 component.js）内联进 ui:// 资源由 server 经 `resources/read` 供给；目录只承担 review（审核声明 CSP 与实际行为一致性）。第三方宿主理论上只要连得上该 server 的 MCP 端点就能取到 HTML——**但目录 app 的 server 是否对非 ChatGPT client 声明 `_meta.ui` 未确认**（server 侧可按 client capability 决定注册带 UI 的 tool，且目录 app 凭据/OAuth 绑定 ChatGPT 生态）。
- 跨宿主反例实证（[弱-中]，github.com/minds-ai-co/codex-plugin issue #5）：skybridge widget 在 Claude Desktop（1.19367.0）完全不可交互——无 `window.openai` 桥，调用直接 throw；若 server 只发 `openai/outputTemplate` 别名则连发现都不行。⇒ 佐证「别名声明的兼容」是 ChatGPT 单向的（ChatGPT 认标准+别名，标准宿主不认别名）。

## 2. 带 MCP Apps UI 的第三方 server 现状清单

### 2.1 商业级（确凿样本 1 个 + 边缘信号）

- **SvGrid**（svgrid.com，jQWidgets 团队出品，[vendor]=官方产品文档）：托管 HTTP server `https://mcp.svgrid.com/mcp`，**无 key、无配置、一键接入 Cursor/VS Code**；`svgrid_preview` 用 MCP Apps 渲染真数据网格（tool → `_meta` → ui:// 资源 → 沙箱 iframe → structuredContent over postMessage）。vendor 文档自述支持宿主：**Claude（web+desktop）、VS Code、ChatGPT**，无 UI client 自动文本降级——跨宿主重用的完整现实样本。本地变体 `npx @svgrid/mcp`。
- Figma 官方 MCP 被 a2ui.me 目录标「UI App」（[弱]，未单独验证 `_meta.ui`）。

### 2.2 官方示例池（demo 级，最现成的可重用来源）

- ext-apps `examples/`（[官方repo]）：领域示例 18+（map-server/CesiumJS、threejs、shadertoy、cohort-heatmap、wiki-explorer、budget-allocator、pdf、say/TTS、qr、system-monitor、transcript/STT 等）+ 6 框架 starter（React/Vue/Svelte/Preact/Solid/vanilla）——MIT 可直接跑，是本地验证宿主互操作的最佳测试池。
- digitarald/mcp-apps-playground（74★，[官方repo] 元数据）：SEP-1865 能力展示 demo server。

### 2.3 社区长尾（GitHub API 一手，2026-10-21）

- `topic:mcp-apps` **327 仓库** / `topic:mcp-app` **44 仓库**。头部：mcp-use（10.8k★，MIT，全栈 MCP Apps 框架）、MCPJam/inspector（2.3k★）、alpic-ai/skybridge（2.2k★，MIT，MCP Apps + ChatGPT Apps 全栈框架/托管）、CopilotKit/generative-ui（856★，AG-UI/A2UI/MCP Apps 三协议示例）、VikashLoomba/copilot-mcp（505★，VSCode 装 MCP Apps 的扩展）、Alignbase/sunpeak（218★，server-agnostic 测试+app 框架）、lemma-work/lemma-platform（605★，AGPL，multiplayer harness）。
- 带 UI 的真实 server（demo/个人项目级）：mikechao/brave-search-mcp（130★）、zhensherlock/sp500-mcp-server（108★）、xuzhougeng/ScientificFigureLibrary（125★）、jvogan/motif（47★，Claude Science）、Trojaner/mcp-database-query-app（Claude Desktop 带 UI）、dzhunka/mcp-app-boilerplate、themesberg/mcp-ui-components、reachjalil/workplace-mcp-apps（8 个 dashboard widget）。
- 社区跨宿主实证（[弱]，r/mcp 2026-10-18 帖）：SvGrid 开发者自述同一 `_meta.ui` 在 Claude/VS Code/ChatGPT 三宿主渲染成功、无 UI client 拿文本——与 vendor 文档互证。

### 2.4 目录站分类现状

- a2ui.me「MCP Apps Directory」：**954 servers & UI apps（687 带 UI App 标）**，含 Figma/Playwright 等大厂条目（[弱]——收录口径未验证，疑含任意带 UI 的 server，不能当 SEP-1865 精确计数）。
- Glama 有零散 MCP Apps 条目收录；**mcp.so / Smithery / PulseMCP 未发现 MCP Apps 一级分类**（ecosystem survey [弱]：Smithery ~7k / mcp.so ~20k 全量 server 中 MCP Apps 为极小子集）——目录发现面尚未成熟。
- ChatGPT 目录 app（首批 Booking/Canva/Coursera/Expedia/Figma/Spotify/Zillow 等 + 2025-12 起开放提交，[官方]）：**不可当作现成可重用库**——提交审核面与用户凭据绑定 OpenAI；HTML 虽 server 自带，是否对第三方 client 吐 `_meta.ui` 未确认。

## 3. 其他宿主实现（重点：通用 web 宿主参考与沙箱架构）

### 3.1 宿主清单（[官方] modelcontextprotocol.io overview + client-matrix，2026-10-21）

- overview 官宣支持：**Claude、Claude Desktop、VS Code GitHub Copilot、Microsoft 365 Copilot、Goose、Postman、MCPJam、Archestra.AI**；client-matrix（社区维护）另列：ChatGPT=Partial、fast-agent=Partial、MCP Inspector=Partial、Cursor、PostHog Code。ZCode 已正式发布 UI plugins（2026-10-12 v3.15.1）但 matrix 未收录（滞后）。
- 官方给出的宿主构建两条路：① `@mcp-ui/client` React 组件包直接嵌宿主；② ext-apps **AppBridge** + basic-host 示例（sandbox.ts 137 行 + serve.ts 动态 CSP 头构造）。

### 3.2 双方言宿主的可参考实现（对第三方接入期最有价值）

- **MCPJam/inspector**（2.3k★ TS，[中]=deepwiki 源码推导）：MCP Apps 走**双 iframe**（host + `/api/mcp/sandbox-proxy` 外层独立 origin——`localhost`↔`127.0.0.1` origin swap——+ srcdoc 内层，AppBridge 桥，CSP 按 widget 声明动态注入内层）；**ChatGPT 方言走三 iframe**（复刻 ChatGPT 生产实现：外层 about:blank 容器 + 跨源 sandbox proxy + src URL 内层，保 URL 上下文）；检测优先级 `ui.resourceUri` > `openai/outputTemplate` > 内联 ui://（`mcp-apps-utils.ts`）。**双方言 + 三级 fallback 的现成蓝本**。
- **Microsoft 365 Copilot**（[官方] devblogs 2026-04-07，3-9 宣布）：「MCP Apps or the OpenAI Apps SDK. Both work seamlessly with Copilot」；沙箱 iframe 渲染；合作伙伴 Power Apps / Adobe Express / Microsoft Expense——企业级双方言宿主实证，也证明 OpenAI dialect 在标准宿主侧需专门兼容层。
- **Codex Desktop**（[弱-中]，minds-ai issue #5 二进制分析）：26.609+ 内置完整 OpenAI Apps SDK host（skybridge mime + `window.openai` 桥 + `McpAppSandboxWebviews` sandbox iframe + MCP-app DevTools），gate 在 `enable_mcp_apps` flag，≥26.616 才有可用 resource hydration。
- Claude web/desktop（[官方repo] spec 引述）：per-app 沙箱 origin `{hash}.claudemcpcontent.com`；官方 SEP-1865 标准宿主。Goose / Archestra.AI（4.4k★ TS 开源平台带 MCP registry/gateway）/ Postman / VS Code：matrix 在列（[中]），沙箱细节未逐一查证。
- **沙箱架构结论**：双 iframe（外层可信独立 origin 承载 CSP HTTP 头 + 内层不可信 HTML）已是 spec MUST + basic-host + MCPJam 三重印证的共识；我们单层 `sandbox="allow-scripts"` 的差距不在「有没有外层」而在「CSP 从 meta 标签还是 HTTP 头来」——meta 可被不可信内容注入篡改，这正是外层 proxy 存在的理由（[官方repo] spec Sandbox proxy 节）。

## 4. CLI 侧 _meta 透传动向

- **Claude Code**：`CLAUDE_CODE_MCP_APPS_HOST` 实验通道仍存在且仍**未公开**。新增社区证据：turboai.dev 社区 env-var 目录（二进制 diff，v2.1.301 基线 1028 个 env）收录该变量「Added between v2.1.269 and v2.1.283」，无 Documented 标记（[弱]）；官方 CHANGELOG 至最新（本地抓取 9322 行）仍只有 2.1.281「skip MCP Apps UI resources」排除性条目，无公开宿主支持（[官方repo]）。通道细节见 mcp-cli-ecosystem-notes.md §A1（extensions 通告 + `mcp_tool_ui_meta_v1`/`mcp_read_resource_v1` + `mcp_read_resource` control request）。**无公开化信号；版本漂移风险维持**。
- **Codex**：`enable_mcp_apps` flag 仍 under development（repo 内 0.145.0 实测 + minds-ai 社区分析 26.6xx 依旧 gated）；learn.chatgpt.com changelog 2026-03「Build and install plugins in Codex」插件结构含 `.app.json`（app or connector mappings）+ `.mcp.json`——**Codex 的 app 承载走 plugin 提交面（静态、审核制），不是通用运行时宿主路线**（[官方]=页面片段，中置信）。渲染面在 Codex Desktop（见 §3.2）。
- **ZCode**：v3.15.1（2026-10-12）已正式发布 UI plugins（MCP App），桌面 Electron host；3.15.3（10-13）为更新问题修复版，无新语义（[官方] changelog）。repo 昨日刚精读其实现（mcp-apps-hosting.md §11），无新动向。
- **对我们的含义**：三家 TUI 仍无一渲染；「CLI 流内透传 _meta」只有 Claude Code 有实验通道且随时可变。我们的 display-tool 名单 + `structuredContent` 方案（已落地、稳定）不依赖任何未公开通道，**不需要为 _meta 投入任何东西，只需保留 watch**。

## 5. 结论与建议

### 5.1 评分拆解

| 子面 | 评分 | 依据 |
| --- | --- | --- |
| 协议标准 | 高 | SEP-1865 Stable；ChatGPT 官方转标准桥为主路径、别名仅为存量；M365 双方言支持；ext-apps 提供双桥 SDK |
| 宿主供给 | 高 | 8+ 宿主实现；官方 AppBridge/basic-host/`@mcp-ui/client`；MCPJam 双方言蓝本 |
| 可重用内容 | **低** | 商业级确凿样本 1（SvGrid）；demo 池充足但非「内容」；ChatGPT 目录 app 不可直取；目录站无一级分类 |

**综合：第三方重用现实可行性 = 中（3/5）。**「能重用」已被 SvGrid 三宿主实证；「有好东西可重用」还不成立。

### 5.2 三道墙逐个裁定

1. **CLI _meta 透传：不投入，等上游**。我们已用 display-tool 名单绕开（S1 实测基础上的架构决策）；上游公开化后迁移成本≈0（structuredContent 通道已稳定，届时只是把「名单」换成「_meta 判定」）。`CLAUDE_CODE_MCP_APPS_HOST` 维持 POC 备选记录，加版本漂移监控（changelog + env-vars 目录），不做任何依赖性实现。
2. **api 代理第三方 ui:// 资源：值得做，排期由事件触发**。它是任何第三方重用的前置，也是与自家模板同构的通用 HTTP 能力（`HUB_UI_RESOURCES` 单源表模式可平移）。触发信号 = 决定接第一个第三方 server（如先拿 SvGrid 或 ext-apps 示例当联调对象）。实现时必须按 spec 履行 host 义务：content 级 `_meta.ui` 优先、旧扁平 key 兼容、CSP 声明域落地、预取资源审查（恶意模式扫描）——见 mcp-apps-spec-notes.md §A.4。
3. **双 iframe：等信号，架构留升级缝**。第三方 HTML 不可信时单层沙箱的 CSP-meta 篡改面是 spec 明示的真实威胁，届时必须上外层 proxy（独立 origin + CSP HTTP 头 + 域条目消毒 + origin 校验 relay）。实现照抄两份现成源：ext-apps basic-host（sandbox.ts 137 行）+ MCPJam 的 localhost↔127.0.0.1 origin swap。前置条件：宿主需要一个与 43012 异 origin 的托管面（子域或独立端口，spec MUST）。

### 5.3 生态信号 watchlist（出现即重评本结论）

- a. Claude Code 公开 MCP Apps 宿主通道（CHANGELOG/env-vars 文档化）→ CLI _meta 依赖可切换，display-tool 名单可退役。
- b. ChatGPT 目录头部 app（Canva/Figma/Spotify 级）公开标准 MCP 端点并对任意 client 声明 `_meta.ui` → 高质量内容池打开，重用价值质变。
- c. mcp.so/Smithery/Glama 上线 MCP Apps 一级分类 → 目录发现面成熟，供给放量前兆。
- d. ext-apps 与我们 sdk@1.x 的分包冲突解决（或我们升级 SDK 2.x）→ AppBridge 替换手写桥的窗口。
- e. ZCode/Codex CLI 流内透出 MCP App 事件（stream-json / exec --json）→ 多 CLI 宿主卡统一投影的可能。

**一句话**：标准已赢（OpenAI/MS/Anthropic 三方收敛到 SEP-1865 桥），我们已落地的宿主投资不白费；但生态内容供给还在 demo 阶段——按「资源代理先行（事件触发）、双 iframe 待信号、_meta 不投入」节奏走，不为预期规模预付工程。

## 6. 来源列表

**官方一手（本次抓取）**

1. developers.openai.com/apps-sdk/mcp-apps-in-chatgpt（`.md` 全文，2026-10-21）— ChatGPT 标准+别名架构、window.openai 扩展清单、托管与 CSP、dice 示例
2. github.com/modelcontextprotocol/ext-apps `docs/migrate_from_openai_apps.md`（raw 全文）— skybridge→SEP-1865 全量映射与无等价清单；`App.connect()` 自动探测 OpenAI；PR #172
3. modelcontextprotocol.io/extensions/apps/overview — 官方宿主清单、宿主构建两条路、示例目录
4. modelcontextprotocol.io/extensions/client-matrix — 各 client 扩展支持矩阵（ChatGPT/Inspector/fast-agent=Partial）
5. devblogs.microsoft.com/microsoft365dev/mcp-apps-now-available-in-copilot-chat/（2026-04-07）— M365 Copilot 双方言公告
6. github.com/anthropics/claude-code CHANGELOG（raw，9322 行）— grep 无 MCP Apps 宿主条目，仅 2.1.281 排除性条目
7. zcode.z.ai/en/changelog — v3.15.1 UI plugins（MCP App）+ 3.15.3 修复
8. openai.com/index/introducing-apps-in-chatgpt — 2025-10 发布与首批合作方（800M 用户）
9. learn.chatgpt.com/docs/changelog — Codex 插件结构 `.app.json`（搜索片段，中置信）
10. GitHub API（api.github.com，一手元数据）— topic:mcp-apps(327)/mcp-app(44) 检索 + 关键 repo star/license/pushed 核对

**vendor / 源码推导**

11. svgrid.com/docs/help/mcp-server/ — SvGrid MCP Apps 声明（[vendor]）
12. deepwiki MCPJam/inspector — 双 iframe + 三 iframe + 检测优先级（[中]，源码推导）
13. openai.github.io/apps-sdk-ui、github.com/openai/openai-apps-sdk-examples — 组件库与示例（[官方repo] 指针）

**社区（弱证据，已标注）**

14. github.com/minds-ai-co/codex-plugin/issues/5 — Claude Desktop skybridge 不渲染 + Codex Desktop 二进制分析（[弱-中]）
15. turboai.dev/docs/claude-code/env-vars — CLAUDE_CODE_MCP_APPS_HOST 版本区间（二进制 diff 目录，[弱]）
16. reddit.com/r/mcp/comments/1x91p4g — SvGrid 三宿主渲染自述（[弱]，与 11 互证）
17. a2ui.me/apps/ — 954/687 计数（收录口径未验证，[弱]）
18. glama.ai 收录页（digitarald/mcp-apps-playground、reachjalil/workplace-mcp-apps、dzhunka/mcp-app-boilerplate）（[弱]）
19. medium.com/@chierhu MCP 生态综述 — 目录站规模旁证（[弱]）

**仓库内既有（本调研基线，未重复验证）**

20. docs/research/mcp-apps-hosting.md（宿主落地与三家 CLI 结论）、mcp-apps-spec-notes.md（SEP-1865 机制/ext-apps SDK/供应链）、mcp-cli-ecosystem-notes.md（S1 活体探针：CLI 不透传 `_meta`、`CLAUDE_CODE_MCP_APPS_HOST` A/B 实测）
