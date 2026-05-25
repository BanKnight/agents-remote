# mobile-session-interaction spec

本文件记录 `align-instance-detail-workspaces` 对 `mobile-session-interaction` 的行为契约增量。

## Change 来源

- change-id：align-instance-detail-workspaces
- 来源意图：Agent / Terminal instance detail 需要与 prototype 对齐：详情页采用 terminal-first 工作区；Agent instance 顶部提供 Files/Git/+Terminal/Meta 等快捷入口，Meta 以浮窗呈现；移动端终端面板支持滚动和输入，底部输入抽屉可展开/收起并提供真实终端快捷键；Terminal instance detail 保持 focused shell，不显示 Files/Git/+Terminal 快捷入口。
- 规划来源：本 change 直接承接用户原始意图，并以前置 `align-ui-shell-foundation`、`align-project-agent-workspace`、`docs/design/frontend-ui-architecture.md`、`docs/specs/mobile-session-interaction/spec.md` 和 prototype instance detail 页面为上下文。

## ADDED Requirements

### Requirement: Agent and Terminal detail pages use a terminal-first workspace

系统 SHALL 将 Agent Session detail 与 Terminal Session detail 呈现为 terminal-first 工作区，把可读输出和当前 session 输入作为页面主体，而不是 metadata dashboard。

#### Scenario: User opens an Agent Session detail

- **WHEN** 用户从 Project Agent workspace 打开某个 Agent instance detail
- **THEN** 页面顶部以紧凑方式展示返回入口、provider 标记或等价 Agent 上下文、displayName、runtime status 和 transport status
- **AND** 页面主体优先展示可滚动 terminal output / stream 内容
- **AND** 底部或等价输入区域服务当前 Agent Session 输入和快捷键
- **AND** 大块 metadata、说明文案或辅助资源入口不得挤占 terminal output 主区域

#### Scenario: User opens a Terminal Session detail

- **WHEN** 用户从 Project Terminal workspace 或其他允许入口打开某个 Terminal Session detail
- **THEN** 页面顶部以紧凑方式展示返回入口、Terminal 上下文、displayName、runtime status 和 transport status
- **AND** 页面主体优先展示可滚动 shell output / stream 内容
- **AND** 底部或等价输入区域服务当前 Terminal Session 输入和快捷键
- **AND** Terminal detail 不被呈现为 Claude/Codex Agent 会话或 metadata dashboard

### Requirement: Agent detail exposes contextual tools without displacing terminal work

系统 SHALL 在 Agent Session detail 中提供 Files、Git、+Terminal 和 Meta 等上下文入口，同时保持 terminal-first 主工作区。

#### Scenario: User scans Agent detail tools

- **WHEN** 用户打开 Agent Session detail
- **THEN** 页面提供 Files 和 Git 入口，用于查看当前 Agent/Project 上下文中的资源或变更
- **AND** 页面提供创建或进入 Terminal 的入口，用于从 Agent context 派生 shell 工作
- **AND** 页面提供 Meta 入口，用于查看 provider、Project、session id、status 等 metadata
- **AND** 这些入口是辅助操作，不替代 terminal output 和输入主区域

#### Scenario: User opens Agent metadata

- **WHEN** 用户触发 Meta 入口
- **THEN** metadata 以浮窗、弹层或等价轻量 overlay 呈现
- **AND** 用户可以关闭该 metadata 呈现并回到同一 terminal-first detail
- **AND** metadata 呈现不要求导航离开当前 Agent Session detail

### Requirement: Terminal detail remains a focused shell detail

系统 SHALL 让 Terminal Session detail 保持 focused shell，不展示 Agent-only Files、Git、+Terminal 或 Meta 工具组。

#### Scenario: User scans Terminal detail header

- **WHEN** 用户打开 Terminal Session detail
- **THEN** header 只展示返回、Terminal 标记或等价上下文、status、close 等与当前 shell 直接相关的操作
- **AND** 不展示 Agent detail 专属的 Files、Git、+Terminal 快捷入口
- **AND** 不展示 provider metadata 或 Agent-only Meta 浮窗入口

### Requirement: Mobile detail keeps input drawer recoverable and terminal output scrollable

系统 SHALL 在手机视口中让 Agent/Terminal detail 的终端输出可滚动，并让底部输入抽屉可展开/收起且可恢复。

#### Scenario: Mobile input drawer is expanded

- **WHEN** 用户在手机视口打开可交互的 Agent/Terminal detail
- **THEN** terminal output 区域在剩余空间内滚动
- **AND** 输入抽屉默认展示快捷键、文本输入和发送入口或等价当前 session 输入能力
- **AND** 输入抽屉不以 fixed/floating 方式遮挡 terminal output 的最后可见内容

#### Scenario: Mobile input drawer is collapsed

- **WHEN** 用户收起底部输入抽屉以查看更多 terminal output
- **THEN** 页面保留清晰的恢复入口或 compact quick-key 状态
- **AND** 收起动作不关闭 WebSocket、不中断 runtime、不清空未发送输入
- **AND** 用户可以重新展开输入抽屉继续当前 session 交互

### Requirement: Instance detail quick keys remain real terminal controls

系统 SHALL 在 Agent/Terminal detail 中提供真实终端控制快捷键，并区分普通文本输入与控制序列发送。

#### Scenario: User taps a terminal quick key

- **WHEN** 用户点击 Shift+Tab、Esc、Ctrl+C、方向键、Enter 或等价快捷键
- **THEN** 系统向当前 session stream 发送对应控制序列
- **AND** 不把快捷键标签写入文本框等待手动发送
- **AND** transport disconnected、runtime ended 或 close pending 时快捷键不可发送或展示不可发送状态

#### Scenario: Arrow keys have competing meanings

- **WHEN** Agent CLI 或 shell 同时存在历史导航与选择项导航语义
- **THEN** UI 应保留可理解的 mode/switch 控制或文案，让用户知道方向键当前用于历史、选择或等价导航
- **AND** 该表达不得破坏第一轮默认 quick key 集合和发送语义

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
