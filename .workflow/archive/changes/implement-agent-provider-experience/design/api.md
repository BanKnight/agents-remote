# API Design

## Change

- change-id：implement-agent-provider-experience

## 接口范围

- 保持现有 Agent Session HTTP resource：`/api/projects/:projectName/agent-sessions`。
- 本 change 不新增 provider history HTTP API；只明确后续 history/resume API 的边界和非目标。
- WebSocket stream 继续复用 session-runtime envelope，不新增 provider-native event stream。

## 请求 / 响应

### 当前 Agent create

- `POST /api/projects/:projectName/agent-sessions`
- 请求体：`{ "provider": "claude" | "codex", "displayName"?: string }`
- 行为：创建 Project-scoped Agent Session；AgentRuntime 根据 provider profile 启动对应 CLI passthrough runtime。
- 响应：`{ "session": AgentSession }`，其中 AgentSession 包含 `id`、`projectName`、`provider`、`displayName`、`status`。

### 当前 Agent list/detail/close

- `GET /api/projects/:projectName/agent-sessions`：只列出当前仍存在的 Agent runtime metadata，不列出 provider 历史会话。
- `GET /api/projects/:projectName/agent-sessions/:sessionId`：返回当前运行实例详情。
- `POST /api/projects/:projectName/agent-sessions/:sessionId/close`：终止当前运行实例。

### 后续 history/resume 方向（本 change 不实现）

后续 provider adapter 成熟后，可以设计 provider-scoped history discovery，例如：

- `GET /api/projects/:projectName/agent-providers/:provider/history`
- `POST /api/projects/:projectName/agent-sessions` with resume payload

该方向需要单独 specs/design，并明确：

- history summary 是 provider-normalized 可恢复项，不是当前 running Agent Session。
- provider-native id 只进入 adapter/internal metadata，不作为公开 session id。
- 某 provider 不支持 history 时返回明确 unavailable/unsupported，而不是空泛失败。

## 协议与兼容性

- 当前 create/list/detail/close API 向后兼容：不改变路径、HTTP 方法、DTO 或 status 枚举。
- `provider` 仍只允许 `claude` / `codex`；新增 provider 需要更新 shared contract 和 specs。
- Agent detail stream 继续使用 terminal-like envelope；provider-native event stream 是后续扩展，不能破坏现有 stream。

## 鉴权与权限

- 所有 Agent provider API 沿用现有单密码 auth guard。
- 认证通过即具有当前服务器 Project 范围的 provider session 操作权限。
- 本 change 不引入 provider account auth；Claude/Codex CLI 登录状态被视为服务器运行环境前置条件。

## 错误语义

- provider missing/unsupported/unavailable：`SESSION_PROVIDER_UNAVAILABLE`。
- runtime 启动或 tmux 操作失败：`SESSION_RUNTIME_ERROR` 或 provider unavailable 映射。
- Project invalid/not found/outside root：沿用 Project safe path errors。
- 未认证：`UNAUTHENTICATED`。

错误响应不得暴露 token、provider 凭证、完整 shell 命令或 provider-native metadata。

## 关键决策

- 不新增 `/providers` API：当前 UI 的 provider choices 已由 shared `AgentProvider` union 和 create buttons 支撑。
- 不把 history summary 混入 active Agent Sessions list：这会混淆“当前运行实例”和“可恢复历史”。
- 后续 history/resume API 必须先有 provider adapter 证据，再决定字段、分页、排序和恢复语义。

## 风险与权衡

- 固定 provider union 简单直接，但新增 provider 需要代码变更；当前只承诺 Claude/Codex，符合 scope。
- 不提供 provider availability probe 会让用户在 create 时才知道 CLI 不可用；这是第一轮可接受的简化。
- 继续使用 terminal-like stream 不能表达 native tool/approval events；后续 Agent event stream 应作为兼容扩展新增。

## 开放问题

- history API 是 provider resource 还是 Agent Session 子资源。
- provider availability 是否需要返回 CLI installed/logged-in/capability snapshot。
- provider-native events 与 terminal passthrough 是否共用一个 WebSocket，还是拆分 Agent event stream。

## 后续沉淀候选

- Provider create/list/detail/close 兼容规则和 history/resume API 边界可在 verify 后沉淀到长期 Agent provider design。
