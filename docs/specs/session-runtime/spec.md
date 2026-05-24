# session-runtime spec

本文件记录 Agent Session 与 Terminal Session runtime 的长期行为契约。它是主线 WHAT，不记录实现任务或单次 change 过程。

## Purpose

- 让用户在 Project 控制台中创建、查看、重连和关闭两类不同运行实例：Claude/Codex Agent 会话与普通 shell Terminal 会话。
- 在第一轮使用真实 `tmux`/WebSocket 链路的同时，保持稳定的控制面 identity、API、metadata 和生命周期语义，避免底层实现细节成为长期主键或用户概念。

## Requirements

### Requirement: AgentSession and TerminalSession remain separate control-plane concepts

系统 SHALL 在文档、UI、API、路由和 runtime metadata 中明确区分 `AgentSession` 与 `TerminalSession`，不得用泛泛的 `Session` 混淆两类实例。

#### Scenario: Session list shows both concepts

- **WHEN** Project 下同时存在 Agent Session 和 Terminal Session 运行实例
- **THEN** 控制面以不同类型、文案、入口和状态语义展示它们
- **AND** Agent Session 不被描述为普通 shell 终端
- **AND** Terminal Session 不被描述为 Claude/Codex Agent 会话

#### Scenario: Shared terminal transport is used internally

- **WHEN** 底层复用 `tmux`/WebSocket 承载 Agent Session 和 Terminal Session
- **THEN** 外部 API 和 UI 仍按 Agent Session 与 Terminal Session 的产品语义表达实例
- **AND** `tmux` session name、terminal event name 或 WebSocket 连接 id 不成为用户可见会话名称或长期 URL/API 主键

### Requirement: Internal session id is the stable route and API key

系统 SHALL 使用内部稳定 session id 作为 Agent/Terminal Session 的 URL 和 API 主键，并在 UI 中显示独立的用户可读名称。

#### Scenario: Session detail route is opened

- **WHEN** 用户打开某个 Project 下的 Agent Session 或 Terminal Session 详情页
- **THEN** 路由使用 `project + internal session id` 定位实例
- **AND** 页面显示自动生成或 metadata 中保存的展示名称
- **AND** 名称变化或特殊字符不会改变该实例的 URL/API 主键

#### Scenario: Provider or transport exposes native identifiers

- **WHEN** Claude/Codex provider、tmux 或 transport 暴露 provider-native id、thread id、transcript path、tmux name 或 socket id
- **THEN** 这些值只进入 adapter/internal metadata 或 runtime diagnostics
- **AND** 不直接作为本项目 URL/API 主键

### Requirement: Runtime metadata maps control-plane identity to runtime resources

系统 SHALL 为当前运行实例维护 session id、project、session 类型、provider、展示名称、底层 runtime resource 标识和必要 runtime 状态之间的 metadata 映射。

#### Scenario: Runtime instance is created

- **WHEN** 系统创建 Agent Session 或 Terminal Session
- **THEN** metadata 记录 internal session id、project 标识、session 类型、展示名称、runtime 状态和底层 runtime resource 标识
- **AND** Agent Session metadata 记录 provider 信息
- **AND** Terminal Session metadata 不需要 provider 信息

#### Scenario: Runtime directory is used

- **WHEN** 系统需要保存当前运行实例 metadata、socket 或 lock 信息
- **THEN** 这些运行态数据位于配置定义的 runtime dir（默认 `/run/agents-remote/`）下
- **AND** 不写入 `~/.agents-remote` 持久配置目录、Project 目录或长期历史存储

### Requirement: Tmux resource names are safe internal identifiers

系统 SHALL 为底层 tmux session 使用不直接暴露原始 project 名的安全内部名称，并能通过 metadata 关联回原始 Project 和 control-plane session。

#### Scenario: Project name contains unsafe tmux or URL characters

- **WHEN** Project 名称包含空格、非 ASCII 字符、路径分隔符或其他不适合 tmux resource name 的字符
- **THEN** 底层 tmux session name 使用安全 slug、hash 或等价安全标识
- **AND** UI 仍显示原始 Project 名称和用户可读 session 展示名称

#### Scenario: Server-side diagnostics inspect tmux

- **WHEN** 服务器操作者查看 tmux session 列表
- **THEN** tmux session name 能表达项目关联、session 类型、provider（如适用）和短 id
- **AND** 该名称仅作为内部诊断辅助，不要求用户记忆或输入

### Requirement: First-round lifecycle states remain minimal but semantically useful

系统 SHALL 以最小状态集表达运行实例生命周期，并为 Agent Session 保留是否等待用户输入的可观察语义。

#### Scenario: Runtime instance is active

- **WHEN** Agent Session 或 Terminal Session 对应底层 runtime 仍存在且可连接
- **THEN** 列表和详情页可将其表达为 `running`

#### Scenario: Runtime instance is closed or missing

- **WHEN** 底层 tmux session 或进程已经不存在
- **THEN** 系统不要求用户手动清理该运行实例
- **AND** 列表随后不再展示该实例，或详情页提示会话已结束并提供返回列表入口

#### Scenario: Agent waits for user input

- **WHEN** Agent Session 能从 provider/terminal 观察到需要用户继续输入、批准或介入的状态
- **THEN** 控制面可以将该 Agent Session 表达为 `idle` 或等价用户可理解状态
- **AND** Terminal Session 不需要伪造 Agent 等待输入语义

### Requirement: Reconnect distinguishes transport connection from runtime existence

系统 SHALL 将 WebSocket/transport 连接状态与底层 Agent/Terminal Session runtime 是否存在分开表达。

#### Scenario: Detail transport disconnects while runtime exists

- **WHEN** 用户在 Agent/Terminal 详情页遇到 WebSocket 断开，但底层 tmux session 仍存在
- **THEN** 页面明确显示连接已断开
- **AND** 提供重新连接入口
- **AND** 重连成功后回到当前终端内容并允许继续输入

#### Scenario: Detail reconnect finds missing runtime

- **WHEN** 用户在详情页重连时发现底层 tmux session 已不存在
- **THEN** 页面提示会话已结束
- **AND** 提供返回列表入口
- **AND** 列表不再展示该运行实例

#### Scenario: Browser refreshes session detail

- **WHEN** 用户刷新或重新进入仍存在的 Agent/Terminal Session 详情页
- **THEN** 系统尝试恢复连接到同一个 internal session id 对应的 runtime resource
- **AND** 页面能看到 tmux 当前屏幕或缓冲内容
- **AND** 第一轮不要求系统额外持久化完整终端日志

### Requirement: Closing a session terminates the underlying runtime

系统 SHALL 将关闭 Agent Session 或 Terminal Session 定义为终止对应底层 tmux session/进程，而不是仅从列表隐藏。

#### Scenario: User requests close

- **WHEN** 用户从列表或详情页关闭 Agent Session 或 Terminal Session
- **THEN** 系统先显示确认提示
- **AND** 提示文案明确说明会话中的进程将被终止
- **AND** 不要求用户输入 session 名称做二次确认

#### Scenario: Close is confirmed

- **WHEN** 用户确认关闭 Agent Session 或 Terminal Session
- **THEN** 系统终止对应底层 tmux session/进程
- **AND** runtime metadata 不再把该实例作为活跃运行实例展示

### Requirement: TerminalSession represents a live project-scoped shell instance

系统 SHALL 将 Terminal Session 定义为 Project 内当前活着的普通 shell 实例，并通过安全 Project 解析确定启动目录。

#### Scenario: Terminal Session is created

- **WHEN** 用户在某个 Project 下创建 Terminal Session
- **THEN** 系统在该 Project 安全解析后的目录中启动普通 shell runtime
- **AND** 该实例不绑定 Claude/Codex provider

#### Scenario: Terminal Session is listed

- **WHEN** 底层 Terminal Session runtime 仍存在
- **THEN** Project 的 Terminal Session 列表展示该普通 shell 实例
- **AND** 如果底层 runtime 已不存在，列表不要求展示历史记录

### Requirement: AgentSession represents an interactive provider session launched in project scope

系统 SHALL 将 Agent Session 定义为在 Project 目录下启动并连接的 Claude/Codex 交互式 provider 会话，且不负责管理 provider CLI 安装、登录或模型配置。

#### Scenario: Agent Session is created for provider

- **WHEN** 用户在某个 Project 下创建 Claude 或 Codex Agent Session
- **THEN** 系统在该 Project 安全解析后的目录中启动或连接对应 provider 的交互式 runtime
- **AND** metadata 记录 provider 类型
- **AND** 系统假设服务器上该 provider CLI 已安装并完成登录配置

#### Scenario: Provider account setup is missing

- **WHEN** provider CLI 未安装、未登录或模型配置不可用
- **THEN** 系统将该创建或连接失败表达为运行态错误
- **AND** 不在本 capability 范围内提供 provider 账号登录、安装或模型配置管理

## Notes

- 当前长期契约允许第一轮 stream 使用 terminal-like envelope；provider-native Agent thread/turn/event schema 由后续 Agent provider experience 设计承接。
- 当前长期契约不要求跨服务器重启恢复 session runtime metadata。

## 来源

- change：design-session-runtime-boundaries
- verify 证据：`.workflow/changes/design-session-runtime-boundaries/verify.md`
