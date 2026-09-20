# Agent session model design

本文件记录 AgentSession、TerminalSession 与相关会话概念的长期设计边界。它面向后续版本复用，不复制单次 change 的过程记录。

## 背景

- 本项目首期需要同时支持 Claude/Codex Agent 控制和普通 shell/terminal 控制。
- 第一轮真实可用链路需要复用真实 CLI 和 terminal passthrough，但长期产品语义必须区分 Agent 会话、普通终端、连接通道和 provider-native 历史。

## 适用范围

- Agent Runtime 设计。
- Provider Adapter 设计。
- Session registry、路由主键、metadata 和 event stream 设计。
- 后续 Agent/Terminal 详情页、E2E、provider experience 等 change。

## 设计结论

- `AgentSession` 是控制面的长期语义，不等同于 tmux session、Codex thread、Claude transcript 或 transport socket。
- `TerminalSession` 是普通 shell/PTY 会话语义，负责 terminal input/output/resize/buffer/reconnect/close。
- `transportSession` 表示连接、relay、reconnect 或 rendezvous 生命周期。
- `conversationThread` 表示 Agent 逻辑历史与恢复边界。
- `turn/run` 表示一次 Agent 交互执行边界。
- Provider-native id 只进入 adapter/internal metadata；本项目 URL/API 主键应使用 internal stable session id。
- Provider adapter 应输出 normalized session/thread summary、event stream 和 capability snapshot，而不是把 provider-native schema 直接交给控制面。

## 关键规则

- 第一轮真实可用链路可用 `tmux/xterm/WebSocket` 承载真实 Claude/Codex CLI，但不得把 terminal 细节固化为 AgentSession API。
- `terminal.*`、`files.*`、`git.*`、`approvals.*` 等能力是 capability extension，不是 core AgentSession 必选字段。
- Files/Git 第一轮优先作为 Project API，由 `PROJECTS_ROOT` 安全解析保护；未来 Agent 主动调用时再通过 tool/permission event envelope 接入。
- 如果 provider 暴露 slash commands、skills、plugins discovery API，原生 UI 可以展示；否则必须保留 raw input 或 terminal fallback。
- 任何 provider-specific session/thread/transcript path 都不能直接成为用户可见名称或路由主键。

## 不适用场景

- 不定义最终统一协议字段名。
- 不决定 Codex adapter 是否先做 PoC 或直接进入正式 API。
- 不决定 Claude Code adapter 与 Claude API/Agent SDK adapter 的最终取舍。
- 不定义多客户端 attach/resume 的 writer/observer/抢占规则。
- Session runtime lifecycle、metadata、close/reconnect 规则见 `docs/design/session-runtime-boundaries.md`。

## 来源

- change：research-agent-access-options
- verify 证据：`.workflow/changes/research-agent-access-options/verify.md`
- 研究材料：`docs/research/agent-access-options.md`
- change：design-session-runtime-boundaries
- verify 证据：`.workflow/changes/design-session-runtime-boundaries/verify.md`
