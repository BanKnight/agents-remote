# Agent access options research

本文件沉淀 `research-agent-access-options` 的阶段性调研结果，用于后续 `design-session-runtime-boundaries` 与 `implement-agent-provider-experience`。本文是研究材料，不是最终架构决策。

## 调研状态

- 调研时间：2026-05-24
- change-id：`research-agent-access-options`
- 结论等级：阶段性研究结论，后续仍需在 design/plan/verify 中验证。
- 证据分级：
  - **源码证据**：优先级最高，来自已 clone 到 `~/repos` 的本地源码。
  - **官方资料**：用于确认公开协议、CLI/API/SDK 能力与稳定性信号。
  - **社区弱信号**：用于观察开发者反馈和风险热点，不能单独决定架构。

## 调研对象

### hapi

- 仓库：`https://github.com/tiann/hapi.git`
- 本地路径：`/home/deploy/repos/hapi`
- commit：`0fa21a121a9307f42595e6e9be01aec7f99cd7dc`
- 证据类型：源码证据

### remodex

- 仓库：`https://github.com/Emanuele-web04/remodex.git`
- 本地路径：`/home/deploy/repos/remodex`
- commit：`e63cf05c7652b5a349e3005e18903d7f3f6132f7`
- 证据类型：源码证据

### Codex 官方资料与社区反馈

- 官方资料包括 OpenAI Codex app-server、SDK、MCP、security、permissions、config 等公开资料。
- 社区反馈由 Tavily research 汇总，包含 Reddit、GitHub issues/discussions、HN、评测文章等。
- 证据类型：官方资料 + 社区弱信号

### Claude 相关能力

- 包括 Claude Code remote-control、Claude Code CLI/headless 能力、Claude API / Anthropic SDK、Claude Agent SDK 相关能力。
- 证据类型：官方资料 + 受限条件下的子研究结论

## 总体摘要

- **local-first 参考实现目前优先看 remodex**：它直接证明 Codex app-server / remote-control 可以形成“本地 runtime + 移动/远程控制端 + relay/secure transport”的三层结构。
- **hapi 更适合作为多 provider、会话恢复、消息持久化和 Web UI 映射的架构参考**：它的 dual-ID、sync engine、REST+SSE 和 terminal socket 分离对本项目很有参考价值。
- **Claude Code remote-control 不能直接假设为可嵌入的自有 Web 协议**：它更像官方 UI/Claude.ai/App 控制路径；本项目应把 Claude Code 视为一个 runtime adapter，而不是 canonical protocol。
- **Claude API/SDK 与 Claude Code CLI 是不同路线**：API/SDK 更适合自建 agent runtime，但不是“恢复本机 Claude Code CLI 会话”的直接替代。
- **统一协议有可行性，但必须 capability-based**：核心协议应表达 thread/session/turn/event/auth/capability，不应泄漏 tmux、Codex app-server 字段或 Claude Code 内部 session 细节。
- **Codex app-server 的事实表述应精确**：它是 JSON-RPC-ish 业务协议，transport 可为 `stdio://`、`unix://` 或 `ws://IP:PORT`；WebSocket 是 remote/control 场景的重要 transport，但不是协议本身的全部。
- **官方移动端 app 互通暂不作为目标**：除非后续确认官方 app 支持 Git、文件查看、Project 浏览或正式 extension mechanism，否则本项目以自有 Web/PWA 控制面为主，官方 app 互通只保留为开放问题。
- **V1 与最终版目标必须区分**：V1 可先用 terminal passthrough 跑通真实 Claude/Codex CLI；最终版才讨论 provider-native thread/turn/event、原生 Agent UI 与 capability 扩展。
- **slash commands / skills / plugins 的目标是保真优先**：V1 通过真实 CLI passthrough 避免遗漏；最终版在 provider 暴露 discovery API 时原生展示，否则必须保留 raw input 或 terminal fallback。

## V1 与最终版边界

### V1：终端 passthrough

第一版优先打通真实可用链路：

```text
web -> api -> tmux/xterm/WebSocket -> Claude CLI / Codex CLI
```

目标：

- 在 Web/PWA 中看到真实 CLI 内容。
- 支持输入、快捷键、resize、重连、关闭。
- 最大程度保留 provider CLI 自带能力，例如 slash commands、skills、plugins、autocomplete 和交互提示。
- 不要求第一版理解 provider-native thread/turn/tool schema。

### 最终版：provider-native + capability-based control plane

最终版再讨论：

- Codex app-server thread/turn/event adapter。
- Claude Code adapter 与 Claude API/SDK adapter。
- provider-neutral `AgentSession` / `conversationThread` / `turn/run`。
- files/git/project/terminal capability extensions。
- 原生 Agent UI 与结构化 tool/permission events。

官方移动端 app 互通不是当前目标。若官方 app 不支持本项目需要的 Git、文件查看、Project 浏览等能力，或者没有正式 extension mechanism，本项目不为了兼容官方 app 牺牲自有控制面设计。



hapi 的本地可恢复会话列表由 sync 层集中处理：

- `listLocalResumableSessions(namespace, opts?)`
- 本地路径：`/home/deploy/repos/hapi/hub/src/sync/syncEngine.ts`

HTTP/API 面向 CLI 或 Web 的入口包括：

- `/cli/sessions/resumable`
- 本地路径：`/home/deploy/repos/hapi/hub/src/web/routes/cli.ts`

共享摘要类型和 schema 保持 hub/web/cli 对齐：

- `/home/deploy/repos/hapi/shared/src/sessionSummary.ts`
- `/home/deploy/repos/hapi/shared/src/schemas.ts`

### 恢复与 resume

hapi 将 resume 分成“解析目标”和“执行恢复”：

- `resolveLocalResumeTarget(sessionId, namespace)`：解析是否可以本地恢复，以及应使用哪个 provider-native session id。
- `resumeSession(sessionId, namespace, opts?)`：执行 provider-specific reconstruction / spawn / reattach。
- 本地路径：`/home/deploy/repos/hapi/hub/src/sync/syncEngine.ts`

相关 API 包括：

- `/cli/sessions/:id/resume-target`
- `/cli/sessions/:id/handoff-local`
- `/cli/sessions/:id/messages`
- 本地路径：`/home/deploy/repos/hapi/hub/src/web/routes/cli.ts`

Claude 场景中，如果 metadata 缺少直接映射，hapi 会尝试从 persisted message history 恢复可用 Claude session reference：

- `/home/deploy/repos/hapi/hub/src/sync/syncEngine.ts`
- `/home/deploy/repos/hapi/hub/src/store/messages.ts`

### 数据与 ID 模型

hapi 使用 SQLite 保存 session/message/machine 等数据：

- `/home/deploy/repos/hapi/hub/src/store/index.ts`
- `/home/deploy/repos/hapi/hub/src/store/sessions.ts`
- `/home/deploy/repos/hapi/hub/src/store/messages.ts`

关键是 dual-ID 模型：

- hapi internal `session.id`：本系统稳定主键。
- provider-native IDs：放在 metadata，用于 Claude/Codex 等 provider resume。

provider-specific metadata 在 session factory / agent session 层生成：

- `/home/deploy/repos/hapi/cli/src/agent/sessionFactory.ts`
- `/home/deploy/repos/hapi/cli/src/agent/sessionBase.ts`
- `/home/deploy/repos/hapi/cli/src/agent/claude/session.ts`
- `/home/deploy/repos/hapi/cli/src/agent/codex/session.ts`

### Provider 边界与 runtime orchestration

hapi 的 Hub 作为 multiplexer/gateway，把 provider 差异隔离在 sync/rpc/agent 层，而不是泄漏到 Web UI：

- `/home/deploy/repos/hapi/hub/src/sync/syncEngine.ts`
- `/home/deploy/repos/hapi/hub/src/sync/rpcGateway.ts`

Socket server 按 namespace 分离：

- `/cli`
- `/terminal`

相关路径：

- `/home/deploy/repos/hapi/hub/src/socket/server.ts`
- `/home/deploy/repos/hapi/hub/src/socket/handlers/cli/`
- `/home/deploy/repos/hapi/hub/src/socket/handlers/terminal.ts`

### Terminal / PTY 路径

浏览器终端路径大致为：

1. Web 打开 `/terminal` Socket.IO 连接。
2. Web 发送 `terminal:create`、`terminal:write`、`terminal:resize`。
3. Web 消费 `terminal:output`、`terminal:exit`、`terminal:error`。
4. Hub terminal handler / registry 管生命周期、限制、idle cleanup。
5. CLI terminal manager 运行 Bun terminal subprocess，转发 stdin/stdout/resize。

相关路径：

- `/home/deploy/repos/hapi/web/src/hooks/useTerminalSocket.ts`
- `/home/deploy/repos/hapi/hub/src/socket/handlers/terminal.ts`
- `/home/deploy/repos/hapi/hub/src/socket/terminalRegistry.ts`
- `/home/deploy/repos/hapi/cli/src/terminal/TerminalManager.ts`

### CLI 到 React/Web UI 的映射

hapi 将 agent updates/events 从 CLI 传到 Hub，再由 Hub 持久化并广播给 Web：

- CLI session API：`/home/deploy/repos/hapi/cli/src/api/apiSession.ts`
- SSE：`/home/deploy/repos/hapi/hub/src/web/routes/events.ts`
- sessions/messages REST：
  - `/home/deploy/repos/hapi/hub/src/web/routes/sessions.ts`
  - `/home/deploy/repos/hapi/hub/src/web/routes/messages.ts`
- Web 消费：
  - `/home/deploy/repos/hapi/web/src/hooks/useSSE.ts`
  - `/home/deploy/repos/hapi/web/src/chat/normalize.ts`
  - `/home/deploy/repos/hapi/web/src/lib/assistant-runtime.ts`
  - `/home/deploy/repos/hapi/web/src/components/SessionChat.tsx`

### hapi 可复用点

- 保持 internal stable session id + provider-native resume key 的 dual-ID 模型。
- 将 list/resume-target/resume intelligence 集中在一个 sync/runtime 层。
- shared schema/contracts 跨 api/web/runtime 复用，避免 DTO 漂移。
- message/state updates 与 interactive terminal 分离：REST/SSE vs socket/stream。
- 使用 localId、seq、timestamps 支撑 backfill/reconciliation。

### hapi 不宜直接复用的假设

- metadata keys 和 fallback resume heuristics 与当前 provider 强绑定。
- terminal implementation 假设 Bun subprocess 环境和 hapi 自身进程模型。
- namespace/token 模型有 hapi hub 自身多租户假设。
- assistant message normalization 与 hapi 当前 UI/runtime formats 强绑定。

## remodex 源码研究

remodex 证明 Codex local-first remote control 可拆成三层：

1. **Codex app-server JSON-RPC**：业务语义。
2. **Remodex bridge mediation**：兼容性、策略、payload sanitation。
3. **Relay secure transport**：pairing、reconnect、E2EE tunnel。

### Process primitive

remodex bridge 可以：

- 本地 spawn `codex app-server`。
- attach 到已有 Codex websocket endpoint。

关键入口：

- `/home/deploy/repos/remodex/phodex-bridge/src/codex-transport.js`
- 函数：`createCodexTransport`

对本项目的启发：provider-neutral API 不应假设 runtime 一定由本系统 spawn；应允许 pluggable transport backend。

### Session primitive

remodex 的 relay session 是 bridge 启动级别的短生命周期 UUID，不等同于 Codex thread id：

- `/home/deploy/repos/remodex/phodex-bridge/src/secure-device-state.js`

trusted mobile reconnect 使用 signed resolve endpoint：

- `/v1/trusted/session/resolve`
- `/home/deploy/repos/remodex/relay/server.js`
- `/home/deploy/repos/remodex/relay/relay.js`

对本项目的启发：必须区分：

- `transportSession`：连接/rendezvous，短生命周期。
- `conversationThread`：Agent 逻辑历史，长生命周期。

### Thread primitive

remodex 移动端使用 Codex thread APIs：

- `thread/start`
- `thread/resume`
- `thread/list`
- `thread/read`
- `thread/turns/list`

关键路径：

- `/home/deploy/repos/remodex/CodexMobile/CodexMobile/Services/CodexService+ThreadsTurns.swift`

对本项目的启发：thread lifecycle 应是一等概念，并独立于 socket lifecycle。

### Stream primitive

turn execution 通过 JSON-RPC notifications / event stream：

- `turn/*`
- `item/*`
- Codex events

移动端消费路径：

- `/home/deploy/repos/remodex/CodexMobile/CodexMobile/Services/CodexService+Incoming.swift`

bridge 对 encrypted envelopes 做 seq/ack buffer，支持 reconnect replay：

- `/home/deploy/repos/remodex/phodex-bridge/src/secure-transport.js`

对本项目的启发：stream API 需要：

- ordered event cursor
- replay/ack semantics
- idempotent re-delivery handling

### Input primitive

remodex 的交互控制不是 raw socket write，而是 turn-level API：

- `turn/start`
- `turn/steer`
- `turn/interrupt`

相关路径：

- `/home/deploy/repos/remodex/CodexMobile/CodexMobile/Services/CodexService+ThreadsTurns.swift`

对本项目的启发：AgentSession 输入应优先建模成 typed command/event，而不是 terminal bytes。

### Resize primitive

remodex 的 Codex app-server 使用路径中没有把 resize 作为 core Agent protocol primitive。resize/input 出现在 separate native SSH terminal path：

- `/home/deploy/repos/remodex/CodexMobile/CodexMobile/Services/Terminal/CodexService+Terminal.swift`

对本项目的启发：PTY input/resize 应属于 `TerminalSession` 或 optional `terminal.*` capability，不应作为 core `AgentSession` 必选能力。

### Auth primitive

remodex 有两个 auth plane：

1. Transport trust/auth
   - QR bootstrap
   - trusted reconnect
   - Ed25519/X25519/HKDF/AES-GCM secure channel
   - 相关路径：
     - `/home/deploy/repos/remodex/phodex-bridge/src/secure-transport.js`
     - `/home/deploy/repos/remodex/CodexMobile/CodexMobile/Services/CodexSecureTransportModels.swift`
2. Codex account auth
   - login/logout RPC
   - bridge/mobile account handlers
   - 相关路径：
     - `/home/deploy/repos/remodex/phodex-bridge/src/bridge.js`
     - `/home/deploy/repos/remodex/CodexMobile/CodexMobile/Services/CodexService+Account.swift`

对本项目的启发：transport identity 和 provider account identity 必须是两个状态机。

### Compatibility and schema drift

remodex 有多处 compatibility layer：

- `/home/deploy/repos/remodex/CodexMobile/CodexMobile/Services/CodexService+RuntimeCompatibility.swift`
- `/home/deploy/repos/remodex/CodexMobile/CodexMobile/Services/CodexService+TurnPaginationCompatibility.swift`
- `/home/deploy/repos/remodex/CodexMobile/CodexMobile/Services/CodexService+ThreadForkCompatibility.swift`

bridge 也会处理 warm reconnect 上的 duplicate initialize：

- `/home/deploy/repos/remodex/phodex-bridge/src/bridge.js`

这说明 Codex app-server 协议正在演进，本项目应做 capability negotiation 和 loose adapter，而不是固化单一 schema。

### remodex 可复用点

- `initialize` / capability negotiation。
- control plane 与 data plane 分离。
- seq/ack/replay 支撑 reconnect。
- transport session 与 conversation thread 分离。
- transport auth 与 provider account auth 分离。
- payload sanitation window，避免大 thread payload 直接压垮移动端或浏览器。
- deterministic close-code / retry policy。

### remodex 不宜直接复用的假设

- remodex 是移动端/relay 优先，不等于本项目第一轮 PWA 同域部署模型。
- E2EE relay 与 QR trusted pairing 对个人私有部署未必第一轮需要。
- Codex app-server 字段和 method drift 需要 compatibility，不宜直接作为本项目主协议。
- 它主要服务 Codex；本项目还要统一 Claude/Codex provider。

## Claude 相关能力研究

### 能力分层

Claude 侧需要分清三条路线：

1. Claude Code remote-control / CLI route
2. Claude Agent SDK route
3. Claude API / Anthropic SDK route

### Claude Code remote-control / CLI route

Claude Code 有 official remote-control / `claude --remote` 等能力，可从 Claude.ai 或 Claude app 继续本地 Claude Code session。

这说明 Claude Code 官方已经支持“远程 UI 控制本地 runtime”的产品路径，但现阶段不能直接假设它提供了可嵌入本项目的稳定自有 server API。

设计含义：

- Claude Code 应先视为 specialized local runtime adapter。
- 不应把 Claude Code 内部 session/transcript/path 作为本项目 canonical API。
- 若后续发现可稳定适配的 remote-control protocol，可作为 adapter implementation。

### Claude API / SDK route

Anthropic SDK / Claude API 支持：

- Messages API
- streaming
- tool use
- ToolRunner
- self-hosted environment/session polling 等 agent-oriented 能力

设计含义：

- Claude API / Agent SDK 更适合构建 app-owned Agent Runtime。
- 但它不等同于控制或恢复本机 Claude Code CLI 会话。
- 如果未来做 Claude-native React UI 化，API/Agent SDK 可能比 CLI wrapping 更干净。

### 与 Codex-style 统一协议的映射

可行映射：

- Codex `thread` → 本项目 `conversationThread`
- Codex `process` → 本项目 runtime profile / provider adapter / execution context
- Codex `session` or active run → 本项目 `run` / `turn` / active stream
- Codex `tool/request` events → 本项目 normalized tool/permission events

Claude API/Agent SDK 比 Claude Code CLI 更容易映射到这种结构；Claude Code CLI/remote-control 需要 adapter 做事件和状态归一化。

### Claude 研究未决项

- 最新 Claude Code remote-control 是否暴露稳定、可本项目复用的协议仍需继续确认。
- Claude Code session resume/headless JSON streaming 的最新字段和生命周期需用当前 CLI 实测或官方 docs 再验证。
- Claude Agent SDK 最新 session/event schema 需在后续设计阶段补证据。

## Codex 官方与社区反馈

### Codex app-server 协议事实

Codex app-server 的业务协议是 JSON-RPC-ish message protocol，transport 可配置：

- `stdio://`：默认，本地进程 stdin/stdout。
- `unix://`：Unix socket。
- `ws://IP:PORT`：WebSocket endpoint，用于服务化/远程连接场景。

相关证据：

- 官方 `AppServerTransport` 支持 `Stdio`、`UnixSocket`、`WebSocket`、`Off`。
- 官方 `app-server --listen ws://127.0.0.1:8765` 可启动 WebSocket endpoint。
- remodex 的 `createCodexTransport` 同时支持 spawn `codex app-server` 和 attach 现有 WebSocket endpoint：`/home/deploy/repos/remodex/phodex-bridge/src/codex-transport.js`。

因此，本项目应把 Codex 看成“可通过多种 transport 访问的 app-server protocol”，而不是简单等同于单个 CLI 终端或单个桌面实例。

### 官方 app / remote-control 互通边界

Codex app-server 暴露 `remoteControl/enable` 与 `remoteControl/status/read`，返回当前 app-server process 的 remote-control status、serverName、environmentId。这表明 remote-control enrollment 至少是 app-server environment/process 级别，而不是单个 thread 级别。

但目前没有足够证据确认官方移动端 app 提供本项目所需的完整控制台能力：

- Project 浏览。
- 文件浏览/图片查看。
- Git diff / changed files UI。
- 本项目自定义 files/git/terminal capability extensions。

因此官方 app 互通降级为开放问题：

- 如果未来确认官方 app 支持足够完整的 Git/files/project 能力，或 Codex app-server 提供正式 extension mechanism，再讨论共同接入。
- 当前主线以本项目自有 Web/PWA 控制面为准。



### 社区弱信号：认可点

社区对 Codex remote-control/app-server 协议的正向反馈集中在：

- 跨设备控制：手机、浏览器、桌面、Apple Watch 等使用场景被认为有价值。
- JSON-RPC-ish 协议可桥接：Remodex、Farfield、Legax、Lunel 等第三方项目能复用或围绕它构建。
- app-server 协议表达力较强：initialize/thread/turn、rich input、approval、telemetry 等被视为可扩展。
- local-first bridge 可行：Remodex 被多篇评测和社区讨论视为实用远程控制实现。

### 社区弱信号：批评点

社区对 Codex remote-control/app-server 的负向反馈集中在：

- 安全/沙箱边界：本地 CLI 在用户机器执行，sandbox escape、config/MCP 加载、RCE 事件会放大风险。
- Auth/headless UX：Device Code、OAuth、VSCode/remote/headless 环境有摩擦。
- 稳定性：thread loss、remote control slow、update regression、backend high-demand failures。
- backward compatibility：config key rename、schema drift、第三方 remote tool 被破坏的风险。
- telemetry/noise：rate limit telemetry 过多，observability 需求与噪音之间需要平衡。

### 社区反馈如何使用

这些反馈只能作为弱证据：

- 可用于识别风险热点和验证清单。
- 不用于单独决定采用 Codex 协议或拒绝某路线。
- 需要和官方文档、remodex/hapi 源码、后续 PoC 互相印证。

## 路线比较

| 路线 | 优势 | 风险 | 初步定位 |
|---|---|---|---|
| CLI/tmux/xterm | 第一轮最快跑通真实交互；适合 Terminal Session | 容易泄漏 terminal/PTY 细节；不利于 React 原生 Agent UI | 第一轮兼容层，不做长期 canonical protocol |
| hapi | 多 provider、resume、message persistence、Web UI 映射经验丰富 | provider metadata 和恢复 heuristics 与 hapi 强绑定 | 架构参考，尤其是 session sync/persistence |
| Codex app-server/remodex | 证明 local-first remote control 与 thread/turn/event protocol 可行 | 协议演进、auth/sandbox/relay 安全、schema drift | Codex provider 和统一协议的重要参考 |
| Claude Code remote-control | 官方远程控制产品路径存在 | 是否可嵌入自有 Web UI 与协议稳定性未知 | Claude Code adapter 候选，不做主协议假设 |
| Claude API/Agent SDK | 适合自建 runtime、tool/event/stream 可控 | 不等于 Claude Code CLI 会话恢复 | Claude-native runtime 的长期候选 |

## 初步协议假设

本项目可以设计 provider-neutral `AgentSession` 协议，但应分层：

### Core Agent protocol

- `connect(transportConfig)`
- `initialize(capabilityProbe)`
- `thread.*`
- `turn.*`
- `event.stream`
- `resume(cursor/ack)`
- `interrupt`
- `auth.transport`
- `auth.provider`
- `providerMetadata`（只内部使用，不作为主路由 ID）

### Optional capabilities

- `terminal.*`
- `files.*`
- `git.*`
- `approvals.*`
- `telemetry.*`
- `artifacts.*`

### 不应固化的细节

- tmux session name
- xterm event name
- Codex app-server 原始 method names
- Claude Code transcript/session path
- provider-native thread/session id 作为 URL 主键

## 文件能力是否应扩展到协议

协议可以扩展到文件操作，但建议分两层：

### Project API 层

适合第一轮只读文件浏览和 Git diff：

- `files.list`
- `files.readText`
- `files.readImage`
- `git.changedFiles`
- `git.diffFile`

这些能力应直接受 `PROJECTS_ROOT` 安全解析约束，不依赖 Agent provider。

### Agent capability 层

适合未来 Agent 主动请求文件能力：

- `tool.requested` with `capability = files.read`
- `permission.required`
- `tool.approved` / `tool.denied`
- `tool.result`

这样能统一 Claude/Codex 工具事件，也能保留审批、审计和路径安全。

## Slash commands / skills / plugins 保真策略

### V1 保真策略

第一版使用真实 CLI passthrough，因此 provider 自身支持的 slash commands、skills、plugins、autocomplete、交互式提示应由 CLI 原样处理。本项目只负责可靠转发输入输出，不重新实现这些能力。

这是 V1 选择 terminal passthrough 的重要原因：它能避免早期原生 UI 因未覆盖 provider-specific 能力而造成能力遗漏。

### 最终版保真策略

原生 Agent UI 阶段应按 provider 能力分级处理：

| 能力 | 目标 |
|---|---|
| provider 内部使用 skills/plugins/tools | 必须不破坏 |
| tool/permission/approval event 可见 | 必须归一化进入 event stream |
| slash commands / skills / plugins 可枚举 | provider 暴露 discovery API 时原生展示 |
| provider 不暴露 discovery API | 保留 raw input fallback 或 terminal fallback |
| 安装/启用/禁用插件 | 后续增强，不作为第一轮目标 |

remodex 社区反馈中提到的 skills/plugins 可见性不足，应理解为具体 UI 覆盖缺口，不是 Codex 协议方向不可行的结论。hapi 使用中技能可用说明 provider passthrough 和 UI 呈现至少是可以做到的。



- 明确分离：`AgentSession`、`TerminalSession`、`transportSession`、`conversationThread`、`turn/run`。
- 使用 internal stable id 做 URL/API 主键；provider-native id 放 metadata。
- Session Runtime 应有 provider adapter seam，但不要抽象过度；至少要能承载 Codex adapter、Claude Code adapter、Claude API/SDK adapter 的差异。
- Terminal input/resize 是 `TerminalSession` 或 optional `terminal.* capability`，不应成为 core AgentSession 假设。

### 给 `implement-agent-provider-experience`

- Claude/Codex provider 在 UI 上可区分，但基础生命周期和状态应走统一 `AgentSession` 语义。
- Codex provider 可以优先参考 remodex 的 thread/turn/event shape。
- Claude provider 需要区分 Claude Code adapter 与 Claude API/Agent SDK adapter。
- 历史会话读取应从 provider adapter 输出 normalized thread/session summary。

### 给 `setup-e2e-quality-baseline`

- 第一条 E2E 可先用 TerminalSession 真实 tmux/shell。
- Agent provider E2E 可用 fake provider 或 local controllable command。
- 后续 Codex adapter PoC 应覆盖 initialize、thread/list、thread/resume、turn/start、event stream、reconnect cursor。

## 开放问题

- Claude Code remote-control 是否有稳定、可自托管 UI 复用的协议？
- Codex app-server 当前哪些方法/字段是稳定承诺，哪些仍是 experimental？
- remodex 的 relay/E2EE/pairing 模型是否适合本项目个人同域 PWA，还是第一轮应简化？
- hapi 的 persisted message fallback 对 Claude/Codex 之外 provider 的泛化能力如何？
- 多客户端同时 attach/resume 同一 AgentSession 时，本项目应允许共享、抢占还是只读观察？
- 文件/Git capability 是否在第一轮只做 Project API，还是预留 Agent tool event envelope？

## 后续沉淀候选

verify 后可由 `distill-change` 提炼到：

- `docs/architecture/`：Agent Runtime / Provider Adapter / Unified Session Protocol 架构。
- `docs/design/`：AgentSession、TerminalSession、thread/turn/event 的长期设计。
- `docs/specs/`：Agent access research 对长期行为契约的影响。
