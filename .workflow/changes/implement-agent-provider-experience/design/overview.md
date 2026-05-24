# Design Overview

本文件汇总 `implement-agent-provider-experience` 的设计范围、子域选择和整体设计结论。

## Change

- change-id：implement-agent-provider-experience
- 所属 version：v0.3-session-runtime-quality

## 输入依据

- intents：用户希望 Claude/Codex 在 UI 中明确作为不同 Agent provider 出现，但都共享 Agent Session 语义；provider 差异由 Agent Runtime 吸收；历史会话读取和恢复需要作为 provider 适配的分阶段方向记录。
- specs：`specs/agent-provider-experience/spec.md`
- 相关长期 docs：
  - `docs/specs/agent-access/spec.md`
  - `docs/specs/session-runtime/spec.md`
  - `docs/design/agent-session-model.md`
  - `docs/design/session-runtime-boundaries.md`
  - `docs/architecture/agent-runtime.md`
  - `docs/architecture/session-runtime.md`
  - `docs/research/agent-access-options.md`
- 代码现状：`api` 已有 SessionRegistry、Agent Session HTTP create/list/detail/close、Terminal/tmux runtime seam；`web` 已有 Claude/Codex create buttons、Agent list card provider display 和 shared session detail route。

## 设计范围

### 本次覆盖

- Agent provider profile / runtime seam 的职责边界。
- Claude/Codex provider create entry、displayName/provider/status/error 的 UI/API 语义。
- provider unavailable 的可理解错误语义。
- 历史会话读取/恢复作为后续 adapter capability 的 contract shape 和非目标边界。
- 最小代码调整：把 provider 启动命令从 generic tmux runtime 中抽到 Agent provider profile/runtime 层，保持现有 HTTP contract。

### 本次不覆盖

- 不实现 Claude/Codex 历史会话读取或 provider-native resume。
- 不实现 Codex app-server thread/turn/event adapter。
- 不实现 Claude Code remote-control、Claude API 或 Claude Agent SDK adapter。
- 不新增数据库、event store、provider account/login management 或 provider capability discovery UI。
- 不改变 Agent Session HTTP 路径、DTO 或 session detail stream envelope。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | 规格已经明确 UI 可见 provider 语义；本轮无新产品流程。 |
| ui-ux | 否 | 现有 Project console/detail 已显示 provider；移动端/原生 Agent UI 属后续 change。 |
| frontend | 否 | 前端改动应保持最小，沿用既有 Agent list/detail，不需独立前端架构。 |
| architecture | 是 | 需要明确 Agent Runtime/provider profile 与 TmuxRuntime/SessionRegistry 的模块边界。 |
| api | 是 | 需要确认现有 Agent Session API 是否保持稳定，以及历史 capability 的后续接口边界。 |
| data | 否 | 本轮不新增持久数据模型；历史 provider metadata 只作为后续方向。 |
| business-rules | 否 | 生命周期业务规则已由 session-runtime 承接；provider 规则可并入 architecture/api。 |
| error-handling | 否 | 仅沿用 `SESSION_PROVIDER_UNAVAILABLE`，不需独立错误设计。 |
| risks | 否 | 风险集中在 architecture/api 中即可。 |

## 总体设计结论

- 保持现有 `/api/projects/:projectName/agent-sessions` contract；Claude/Codex 的差异通过 provider 字段和 Agent Runtime provider profile 处理。
- 新增或重构 `AgentRuntime` 深模块，负责 provider profile lookup、display label/default command、provider unavailable mapping，并委托 terminal/tmux runtime 承载第一轮 CLI passthrough。
- `TmuxRuntime` 只负责 tmux lifecycle/IO，不再内置 Claude/Codex provider 命令知识。
- 历史会话读取/恢复是后续 `ProviderAdapter` capability：输出 normalized provider history summary，再由用户选择恢复为当前运行 Agent Session；不混入当前 active session list。

## 关键决策

- 本 change 不改 shared DTO：现有 `AgentProvider = "claude" | "codex"`、AgentSession.provider 和 Agent create request 已足够。
- provider create 失败统一映射为 `SESSION_PROVIDER_UNAVAILABLE`，UI 显示现有 mutation error，不暴露命令细节。
- provider profile 是实现层 seam，不是公开 API；公开 API 仍只有 Agent Session resource。
- 历史恢复方向只写设计与后续扩展边界，避免在没有 provider-native证据/PoC 时提前实现半成品。

## 开放问题

- Claude/Codex 历史 summary 的最终字段、分页、排序和 provider-native resume key 需要后续 provider adapter change 验证。
- Provider CLI availability 是否需要单独 probe endpoint，目前先通过 create failure 表达。
- Agent waiting-input/idle 检测仍依赖后续 provider event/terminal output adapter。

## 后续沉淀候选

- `docs/architecture/agent-runtime.md`：补充 Agent Runtime/provider profile 与 first-round CLI passthrough 的当前主线结构。
- `docs/design/agent-provider-experience.md`：沉淀 provider-visible UI/API 语义和 history capability 分阶段边界。
