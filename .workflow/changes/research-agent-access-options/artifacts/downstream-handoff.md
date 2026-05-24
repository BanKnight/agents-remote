# Downstream change handoff

本文件将 `research-agent-access-options` 的研究与设计结论整理为后续 changes 可直接消费的输入。

## 全局约束

后续所有 Agent Runtime/API/provider 相关 change 都应遵守：

- V1 可以使用 `CLI/tmux/xterm/WebSocket` 做真实 CLI passthrough，但不得把 terminal/PTY 细节固化为长期 Agent protocol。
- `AgentSession` 是控制面长期语义，不等同于 tmux session、Codex thread、Claude transcript 或 transport socket。
- 使用本项目 internal stable session id 作为 URL/API 主键；provider-native id 只进入 metadata/adapters。
- 必须分离 `transportSession`、`conversationThread`、`turn/run`。
- `terminal.*`、`files.*`、`git.*`、`approvals.*` 等能力是 gateway capability，不是 core AgentSession 必选字段。
- 不直接暴露或扩展 Codex app-server 原始 method set；通过 agents-remote gateway/provider adapter 层适配。
- Claude Code remote-control 不能直接假设为可嵌入自有 Web/PWA 的稳定协议。
- 官方移动端 app 互通当前不是目标；除非未来确认官方 app 支持 Git/files/project 或正式 extension mechanism。
- 社区反馈只能作为风险热点和验证清单输入，不作为架构决策的唯一依据。

## Handoff to `design-session-runtime-boundaries`

### 必须消费的研究结论

- Terminal Session 第一阶段可以按 `tmux + xterm.js + WebSocket` 确定，因为普通 shell 交互没有 Claude/Codex 协议不确定性。
- Agent Session 可在 V1 兼容 CLI/tmux passthrough，但 runtime/API 命名和 URL 主键不能泄漏 terminal 或 provider-native 细节。
- `AgentSession`、`TerminalSession`、`transportSession`、`conversationThread`、`turn/run` 必须是不同概念。
- hapi 的 dual-ID、sync/runtime 层、REST+SSE/message persistence、terminal socket 分离可作为设计参考。
- remodex 的 transport session 与 Codex thread 分离、seq/ack/replay、transport auth 与 provider account auth 分离可作为长期 Agent runtime 参考。

### 禁止固化的边界

- 不把 tmux session name 作为 UI/API session id。
- 不把 xterm event name 作为控制面 API。
- 不把 Codex thread id 或 Claude transcript/session path 暴露为 URL 主键。
- 不把 terminal resize/input 作为 core AgentSession 必选能力；它属于 TerminalSession 或 optional `terminal.* capability`。
- 不把 V1 CLI output parsing 当作 provider-native event schema。

### 开放问题

- 第一轮是否需要 event store / replay cursor，还是只维护 runtime metadata？
- 多客户端 attach/resume 同一 session 时，是单 writer、多 observer、抢占还是共享输入？
- AgentSession 是否对外暴露 thread/turn 词汇，还是仅 runtime 内部使用？
- Final 原生 UI 是否需要保留 per-provider terminal fallback？

### 建议验证动作

- V1 验证真实 CLI passthrough：slash command、skill/plugin、autocomplete、交互提示、Ctrl+C/Esc/Tab/方向键、resize、断线重连、关闭终止进程。
- 验证 session id 映射：UI/API 使用 internal stable id，底层 tmux/provider id 只在 metadata。
- 验证 TerminalSession 与 AgentSession 文案、路由、状态命名不混淆。

## Handoff to `implement-agent-provider-experience`

### 必须消费的研究结论

- Claude/Codex provider 在 UI 上可区分，但生命周期、列表、进入、关闭、状态展示应走统一 `AgentSession` 语义。
- Provider 差异应被 Agent Runtime / Provider Adapter 吸收，不扩散到控制面各处。
- Codex provider 可优先参考 remodex 的 `thread.*` / `turn.*` / event stream / compatibility layer / auth planes。
- Claude provider 必须分两条路线评估：Claude Code adapter 与 Claude API/Agent SDK adapter。
- hapi 的历史会话读取/恢复可作为多 provider resume 参考，但 metadata keys 和 fallback heuristics 不应直接复制。
- 历史会话读取应由 provider adapter 输出 normalized thread/session summary。

### 禁止固化的边界

- 不把 Claude Code remote-control 当作已确认可嵌入本项目 Web/PWA 的稳定协议。
- 不把 Claude API/SDK 当作 Claude Code CLI 会话恢复的直接替代。
- 不把 Codex app-server raw method names 直接暴露给前端。
- 不把 provider-native session/thread id 作为本项目路由主键。
- 不要求第一阶段真实 AI CLI E2E 依赖 Claude/Codex 账号登录或在线模型能力。

### 开放问题

- Claude Code remote-control 是否存在稳定、自托管可复用协议？
- Claude Code headless/session resume/JSON streaming 当前字段和生命周期是什么？
- Claude Agent SDK 最新 session/event schema 如何映射到 `AgentSession`？
- Codex app-server 当前哪些 method/schema 是稳定承诺，哪些仍 experimental？
- Codex/Claude 是否提供 slash commands / skills / plugins discovery API？

### 建议验证动作

- Codex adapter PoC：验证 `codex app-server --listen ws://...`、`initialize`、`thread/start`、`thread/list`、`thread/resume`、`turn/start` 和 event stream。
- Claude adapter PoC：分别验证 Claude Code CLI/headless route 与 Claude API/Agent SDK route 的 session/event 能力。
- Discovery PoC：检查 Codex/Claude 是否能列出 slash commands、skills、plugins；不能列出时验证 raw input fallback 或 terminal fallback。
- 历史恢复 PoC：验证 provider adapter 输出 normalized summary，而不是把 provider-native metadata 直接交给 UI。

## Handoff to `setup-e2e-quality-baseline`

### 必须消费的研究结论

- 第一条 E2E 可先使用 TerminalSession 真实 `tmux/shell`，不依赖 Claude/Codex 协议未确定部分。
- Agent provider E2E 可使用 fake provider 或 local controllable command，避免依赖真实 AI CLI 登录、模型配置或在线服务。
- 后续 Codex adapter PoC 应单独覆盖 app-server/thread/turn/event/reconnect，不阻塞第一条 Terminal smoke。
- V1 选择 terminal passthrough 的关键原因是能力保真，因此 E2E 或人工验证应覆盖 provider CLI 原生能力不被 Web terminal 破坏。

### 禁止固化的边界

- 不把第一条 E2E 设计成只验证前端静态页面。
- 不让首个 E2E 依赖真实 Claude/Codex 在线账号或模型响应。
- 不把 TerminalSession E2E 结果解释为 Agent provider-native protocol 已验证。
- 不要求第一轮 E2E 覆盖官方 app 互通。

### 开放问题

- E2E 工具选择尚未固定；应在 setup-e2e-quality-baseline 的 design/plan 中决定。
- 是否在首轮自动化 E2E 中覆盖移动端/PWA 安装，还是留给人工测试？
- Codex adapter PoC 是纳入 E2E 基线，还是作为后续单独技术验证？

### 建议验证动作

- Smoke E2E：登录 → Project 列表 → 进入 Project → 创建 Terminal Session → 连接 WebSocket/terminal → 看到可交互输出。
- 真实依赖：Terminal Session 链路真实启动 `tmux/shell` 并通过 WebSocket 交互。
- 报告能力：失败时保留截图、WebSocket/terminal 日志、api 日志。
- 后续增强：增加 fake Agent provider E2E，验证 AgentSession lifecycle UI 不依赖真实 AI CLI。

## Verify handoff checklist

- `design-session-runtime-boundaries` 能从本文件恢复 V1 TerminalSession 与长期 AgentSession 边界。
- `implement-agent-provider-experience` 能从本文件恢复 Claude/Codex provider adapter 的路线差异和开放 PoC。
- `setup-e2e-quality-baseline` 能从本文件恢复第一条 E2E 不依赖未定 Agent protocol 的原因。
- 本文件没有把未知官方能力写成已确认事实。
- 本文件没有要求下游直接复制 Codex app-server 或 hapi 内部 API。
