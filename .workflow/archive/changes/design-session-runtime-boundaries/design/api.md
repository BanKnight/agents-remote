# API Design

## Change

- change-id：design-session-runtime-boundaries

## 接口范围

- HTTP API：Project-scoped Agent/Terminal Session 的 list、create、detail、close。
- WebSocket API：Project-scoped Agent/Terminal Session 的 stream attach、input、resize、transport state。
- 所有公共路径位于 `/api` 前缀下，并使用现有单密码 auth。
- 本设计定义第一轮 session runtime contract，不定义 provider-native thread/turn/event API。

## 请求 / 响应

### Agent Session HTTP

- `GET /api/projects/:projectName/agent-sessions`
  - 返回当前仍活着或仍可判定状态的 Agent Session 摘要列表。
  - 列表读取可以清理底层 runtime 已不存在的 stale metadata。
- `POST /api/projects/:projectName/agent-sessions`
  - 请求体：`{ "provider": "claude" | "codex" }`，可选 `displayName` 由后续实现决定是否接受；默认由系统生成。
  - 行为：在 Project 安全解析目录下启动或连接 provider CLI runtime。
  - 返回：新建 `AgentSession` 摘要和详情入口所需 id。
- `GET /api/projects/:projectName/agent-sessions/:sessionId`
  - 返回单个 Agent Session metadata 和当前状态。
  - 如果 metadata 存在但底层 runtime 不存在，返回 ended/missing 语义错误或 closed 状态，具体由实现保持一致。
- `POST /api/projects/:projectName/agent-sessions/:sessionId/close`
  - 行为：终止对应底层 runtime，不只是隐藏 metadata。
  - 可重复调用：如果 runtime 已不存在，返回已结束语义，不重新报未知内部错误。

### Terminal Session HTTP

- `GET /api/projects/:projectName/terminal-sessions`
  - 返回当前活着的普通 shell session 摘要列表。
- `POST /api/projects/:projectName/terminal-sessions`
  - 请求体：可为空；可选 displayName 由后续实现决定。
  - 行为：在 Project 安全解析目录下启动普通 shell runtime。
  - 返回：新建 `TerminalSession` 摘要和详情入口所需 id。
- `GET /api/projects/:projectName/terminal-sessions/:sessionId`
  - 返回单个 Terminal Session metadata 和当前状态。
- `POST /api/projects/:projectName/terminal-sessions/:sessionId/close`
  - 行为：终止对应底层 shell/tmux runtime。

### WebSocket stream

- `GET/upgrade /api/projects/:projectName/agent-sessions/:sessionId/stream`
- `GET/upgrade /api/projects/:projectName/terminal-sessions/:sessionId/stream`

Stream 事件第一轮只承诺 terminal-like transport envelope，不承诺 provider-native Agent event schema：

- server → client：
  - `connected`：stream attach 成功，包含 session id、type、status。
  - `snapshot`：当前屏幕或缓冲内容。
  - `output`：增量输出。
  - `status`：runtime status 或 transport status 变化。
  - `ended`：底层 runtime 已结束。
  - `error`：可恢复或不可恢复 stream 错误。
- client → server：
  - `input`：发送输入字节/文本到 runtime。
  - `resize`：终端尺寸变化。
  - `ping`：可选保活。

Agent Session 的第一轮 stream 可以复用该 envelope 承载真实 Claude/Codex CLI；后续 provider-native adapter 可新增 Agent event stream，但不得破坏现有 terminal passthrough contract。

## 协议与兼容性

- Project 名称仍按 URL encode/decode 传递，并通过 Project safe path resolver 验证。
- `sessionId` 是本项目生成的 opaque id，调用方不得解析其结构。
- `displayName` 是用户可见名称，不作为路由主键。
- `provider` 只出现在 Agent Session DTO；Terminal Session DTO 不包含 provider。
- WebSocket auth 使用现有 cookie、bearer 或 query token 机制，与 `/api/ws/echo` 的认证边界一致。
- API 新增字段应向后兼容；删除或改变状态枚举语义需要单独 design。

## 鉴权与权限

- 所有 session HTTP 和 WebSocket API 都需要现有单密码登录态。
- 未认证 HTTP 返回 `UNAUTHENTICATED` 和 401。
- 未认证 WebSocket upgrade 返回 HTTP 401，不建立连接。
- 第一轮没有多用户/角色；认证通过即有当前服务器 Project 范围的 session 操作权限。

## 错误语义

建议扩展共享错误码：

- `SESSION_NOT_FOUND`：metadata 不存在，或不属于该 Project/type。
- `SESSION_RUNTIME_MISSING`：metadata 存在但底层 runtime 已不存在。
- `SESSION_RUNTIME_ERROR`：启动、attach、输入、resize 或关闭 runtime 失败。
- `SESSION_PROVIDER_UNAVAILABLE`：Agent provider CLI 未安装、未登录或无法启动。
- `SESSION_TYPE_INVALID`：路径或 payload 请求了不支持的 session type。
- `SESSION_STATE_CONFLICT`：对 closed/ending session 执行不允许的状态变更。

这些错误不得暴露完整 shell 命令、token、provider 凭证、真实内部路径以外的敏感信息；日志可包含 request id、project、session id、type、provider 和安全的 runtime diagnostics。

## 关键决策

- Agent 和 Terminal 使用平行资源路径，而不是 `/sessions?type=...`，让产品语义在 URL 层明确。
- WebSocket stream 路径挂在具体 session 资源下，避免 transport 被误认为独立 session。
- close 使用 POST action，表达有副作用且需要用户确认的终止动作。
- 不在第一轮公开 tmux name、socket path、provider-native id 或 transcript path。

## 风险与权衡

- 平行路径会有少量重复 DTO/handler，但能避免 Agent/Terminal 语义混淆。
- terminal-like stream envelope 简单可靠，但不足以表达 provider-native tool/permission events；后续 Agent event stream 需在 AgentRuntime 内扩展。
- Close 幂等语义需要实现阶段谨慎处理：重复 close 不应重新杀错 runtime。

## 开放问题

- 是否在 create API 中接受用户输入的 `displayName`，或第一轮完全自动生成。
- WebSocket envelope 是 JSON 包装文本输出，还是二进制输出单独帧，需在 xterm/tmux 实现时验证。
- 多客户端 attach 的 writer 策略未在本 API 阶段锁定。

## 后续沉淀候选

- Session Runtime API 可在验证后沉淀到 `docs/specs/session-runtime/spec.md` 和 `docs/architecture/session-runtime.md`。
