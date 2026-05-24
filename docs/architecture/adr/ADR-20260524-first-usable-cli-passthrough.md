# ADR: Separate first usable CLI passthrough from long-term Agent protocol

## 状态

accepted

## 日期

2026-05-24

## 背景

- 本项目需要尽快提供可从 Web/PWA 远程控制 Claude/Codex Agent 的真实可用链路。
- Claude/Codex 的官方 remote-control、app-server、API/SDK、CLI resume 等能力仍存在路线差异和稳定性不确定性。
- 第一轮如果过早做原生 Agent UI，容易遗漏 slash commands、skills、plugins、autocomplete、交互提示等 provider CLI 能力。
- 但如果把 `tmux/xterm/WebSocket` 或 provider-native id 固化为长期协议，会阻碍后续 provider-native AgentSession API、React 原生 UI 和 capability extension。

## 决策

- 将“第一轮真实可用链路”映射为 roadmap v0.1-v0.3 的阶段性目标，而不是单独的长期版本概念。
- roadmap v0.1-v0.3 可以使用真实 CLI passthrough：`web -> api -> tmux/xterm/WebSocket -> Claude CLI / Codex CLI`。
- 长期 Agent protocol 必须保持 provider-neutral，以 `AgentSession`、`conversationThread`、`turn/run`、`transportSession`、event stream 和 capability snapshot 等概念演进。
- Provider-native id、tmux session name、xterm event name、Codex raw method、Claude transcript/session path 不能成为本项目 URL/API 主键或长期控制面协议。
- 跨 change 的影响只能通过已验证并 distill 到 `docs/` 的长期文档传递，不能要求后续 change 直接消费上游 `.workflow/changes/<change-id>/artifacts/`。

## 备选方案

- 方案 A：第一轮直接实现 provider-native AgentSession API。
  - 未选择原因：Claude/Codex provider 能力和 discovery API 未完全确认，容易遗漏 CLI 原生能力并推迟真实可用链路。
- 方案 B：长期沿用 terminal passthrough 作为 Agent protocol。
  - 未选择原因：会把 terminal/PTY 细节泄漏到控制面，阻碍历史会话恢复、React 原生 UI、tool/permission event 和 provider adapter 演进。
- 方案 C：直接暴露 Codex app-server 或 hapi 内部 API。
  - 未选择原因：会削弱本项目认证、路径安全和 provider-neutral 抽象，并受到官方 schema drift 或 hapi 内部假设影响。

## 影响

- 后续 Session Runtime 可以优先实现真实 terminal/tmux 链路，同时保持 AgentSession 与 TerminalSession 的语义分离。
- Provider Adapter 设计必须吸收 Claude/Codex 差异，不把 provider-native schema 直接暴露给 Web/PWA。
- E2E 基线可以先覆盖真实 TerminalSession/tmux/shell，不要求第一条 E2E 依赖真实 AI CLI 登录或在线模型。
- 后续原生 Agent UI 设计必须考虑 provider capability discovery；无法 discovery 时保留 raw input 或 terminal fallback。
- 后续 change 需要消费本决策时，应读取 `docs/` 中的 spec/design/architecture/ADR，而不是上游 change artifacts。

## 后续修订

- （无）

## 来源

- change：research-agent-access-options
- verify 证据：`.workflow/changes/research-agent-access-options/verify.md`
- 研究材料：`docs/research/agent-access-options.md`
