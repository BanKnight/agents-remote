# mcp-hub-admin spec

本文件记录 ar-hub admin capability（跨项目观察/管理 + 审批闸）的长期行为契约。它是主线 WHAT，不记录实现方案、任务拆解或单次 change 过程。

## Purpose

- 让 agent 会话（Claude / Codex CLI）通过 ar-hub MCP 工具获得跨项目的观察与管理能力，作为多 agent 编排（OPC）的基座。
- 观察类操作免审批直达数据源；管理类操作逐条经审批中心授权（用户已拍板：查看+发送、全部项目审批即授权、读免审批）。
- 管理面的发起者身份必须可追溯到具体 agent 会话，审批卡呈现在 web 审批中心与 CLI 审批卡同一管道。

## Requirements

### Requirement: Admin tool surface is gated by the project capability switch

系统 SHALL 仅在项目 `.agents-remote/mcp.json` 的 `capabilities.admin` 开启时向 agent 暴露 admin 工具面（观察 3 + 管理 5 共 8 个）；未开启时 hub 不注册任何 admin 工具，行为与该开关引入前完全一致。

#### Scenario: Admin capability disabled

- **WHEN** 项目的 mcp.json 未开启 admin
- **THEN** agent 经 hub 的 tools/list 看不到任何 admin 工具，调用任何 admin 工具名均不可达

#### Scenario: Admin capability enabled

- **WHEN** 项目的 mcp.json 开启 admin
- **THEN** tools/list 暴露 `project_list` / `session_list` / `session_read` / `project_create` / `project_delete` / `session_create` / `session_close` / `session_send` 八个工具

### Requirement: Observation tools are approval-free

系统 SHALL 允许 `project_list` / `session_list` / `session_read` 直接执行，不登记审批卡（用户拍板「读免审批」）。

#### Scenario: Agent lists projects

- **WHEN** agent 调用 `project_list`
- **THEN** hub 直接返回全部受管项目及会话计数，审批中心不产生新卡

### Requirement: Manage tools require per-operation user approval

系统 SHALL 对管理面 5 工具（`project_create` / `project_delete` / `session_create` / `session_close` / `session_send`）逐条登记审批卡并挂起等待用户决定；允许才执行真操作，拒绝或超时以错误结果返回（isError），绝不执行。

#### Scenario: User allows a manage tool call

- **WHEN** agent 调用管理工具且用户在审批中心点允许
- **THEN** 工具执行真实操作（如项目目录真创建）并返回成功结果，审批卡消失

#### Scenario: User denies a manage tool call

- **WHEN** 用户对管理工具审批卡点拒绝
- **THEN** 工具不执行任何操作，agent 收到「被用户拒绝」的错误结果，审批卡消失

#### Scenario: Approval times out

- **WHEN** 审批卡在挂起窗口（120 秒）内未被应答
- **THEN** 系统自动撤销审批卡，agent 收到超时错误结果，未执行任何操作

#### Scenario: Invalid session_create provider

- **WHEN** `session_create` 携带未知 provider 名
- **THEN** 系统直接返回未知 provider 错误，不登记审批卡（无效参数不弹授权闸）

### Requirement: Manage tool approval cards carry the origin session identity

系统 SHALL 在管理工具的审批卡上呈现发起会话的身份：卡片的 provider 为 `mcp-admin`，卡片的 project/session/runtime 标识等于发起调用的 agent 会话，web 审批中心据此展示并可跳转发起会话；管理卡在 UI 上恒按破坏面高亮（hot）。

#### Scenario: Approval card identifies the calling session

- **WHEN** agent 会话 S 调用管理工具触发审批
- **THEN** 审批卡 provider 为 `mcp-admin` 且卡上的会话标识指向 S，点允许后应答送达该挂起操作

### Requirement: Origin identity is injected via the hub URL query

系统 SHALL 通过 hub URL 的 `?origin=<ar 会话 id>` 注入发起会话身份；无 origin 的旧客户端 URL 不受影响，但管理面调用被拒绝（观察面不受影响）。origin 必须是 ar 平台会话 id，且登记审批卡前系统 SHALL 校验该会话真实存在。

#### Scenario: Spawn argv carries origin

- **WHEN** 平台拉起 claude 或 codex 会话并注入 ar-hub MCP
- **THEN** 注入的 hub URL 带 `?origin=<该 ar 会话 id>`

#### Scenario: Legacy URL without origin

- **WHEN** 旧客户端经无 origin query 的 hub URL 调用管理工具
- **THEN** 系统拒绝该调用并返回缺少 origin 身份的错误；观察工具仍可用

#### Scenario: Origin session no longer exists

- **WHEN** origin 指向的会话已被关闭或不存在
- **THEN** 系统拒绝该调用并返回会话不存在错误，不登记审批卡

### Requirement: Timeout chain keeps the client connection alive through the approval window

系统 SHALL 保证审批挂起期间 agent 侧连接不断：CLI 侧工具超时（claude `toolTimeoutMs` / codex `tool_timeout_sec`，180 秒）必须长于审批挂起窗口（120 秒），hub 服务端的连接空闲超时（255 秒）必须长于 CLI 侧超时。

#### Scenario: Approval resolved within the window

- **WHEN** 用户在审批窗内应答
- **THEN** CLI 侧工具调用尚未超时，工具结果正常返回给 agent

#### Scenario: Client timeout as last resort

- **WHEN** 审批链任何环节异常导致挂起超过 CLI 侧超时
- **THEN** CLI 侧以超时失败收场，hub 连接不被更早掐断

### Requirement: session_read reads the recent conversation per provider

系统 SHALL 按目标会话的 provider 选择读取方式返回最近消息窗口（user + assistant 文本）：claude 读 session JSONL、codex 读 rollout 文件、omp 读 ACP 会话 JSONL、terminal 读 tmux capture 快照；目标会话不存在时返回明确错误。

#### Scenario: Read a claude session tail

- **WHEN** agent 调用 `session_read` 指向一个 claude 会话
- **THEN** 返回该会话 JSONL 的最近 user/assistant 消息窗口

#### Scenario: Read a terminal session tail

- **WHEN** agent 调用 `session_read` 指向一个 terminal 会话
- **THEN** 返回该 tmux pane 的当前屏快照文本

### Requirement: session_send delivers text to live agent sessions only

系统 SHALL 仅向存活的 agent 会话投递文本（claude 注入用户提示 / codex、ACP 写入运行时）；目标不存在、已停止或为 terminal 会话时返回明确错误，不复活已停止会话（与 REST 注入 D13 语义一致）。

#### Scenario: Send to a live agent session

- **WHEN** agent 调用 `session_send` 指向存活的 claude/codex/ACP 会话
- **THEN** 文本作为用户输入送达该会话，返回送达成功

#### Scenario: Send to a non-agent or stopped target

- **WHEN** 目标是 terminal 会话或会话已停止
- **THEN** 返回明确的会话类型/状态错误，不投递

## Notes

- origin 信任级别与 hub 现有一致（loopback 本机信任），不做 origin 防伪造；远程暴露面已有统一鉴权层。
- 管理审批卡与 CLI 审批卡在审批中心同管道并存（transports 按 provider 派发，互不误触发）。
- v1 明确不做：terminal 会话的 `session_send`、发起会话 blocked 状态联动、`project_rename`、admin 工具的专用 UI 卡、mcp.json admin 开关的 web UI、origin 会话关闭时审批卡主动撤销（120 秒超时兜底）。
- 错误面统一 `[CODE] message` 文本（如 `[ADMIN_ORIGIN_MISSING]`、`[ADMIN_APPROVAL_DENIED]`、`[ADMIN_APPROVAL_TIMEOUT]`、`[SESSION_NOT_FOUND]`）。

## 来源

- 批次 1（观察面 + hub 基座）：commit `6667d8f`
- 批次 2（审批闸 + 管理面 + origin 注入 + 超时链）：commit `2f93a58`
- 批次 3（真实链路探针 + e2e + 本 spec）：探针 `scripts/probe-admin-approval.mjs`（claude allow/deny 全链 origin 穿线 + codex 配置接受性，10/10）+ e2e `e2e/admin-approval.spec.ts`（web 卡渲染/恒红/应答形状）
