# project-console-navigation spec

本文件记录 `align-project-agent-workspace` 对 `project-console-navigation` 的行为契约增量。

## Change 来源

- change-id：align-project-agent-workspace
- 来源意图：Project Agent workspace 需要与 prototype 对齐：Project 内 Agent 二级页应展示多个 Agent instances，提供 `+ Claude` / `+ Codex` 创建入口，并以轻量列表行展示 session history，避免厚卡片和重复 metadata 降低首屏密度。
- 规划来源：本 change 直接承接用户原始意图，并以前置 `align-ui-shell-foundation`、已完成的 Home / Project entry 和 `docs/design/frontend-ui-architecture.md` 为共享 UI architecture 上下文。

## ADDED Requirements

### Requirement: Project Agent workspace prioritizes Agent instances

系统 SHALL 将 Project 的默认 Agent workspace 呈现为 Agent instances 工作区，优先展示当前 Project 下的 Agent Session 运行实例。

#### Scenario: User opens a Project Agent workspace

- **WHEN** 用户从 Home 进入某个 Project 或在 Project 二级导航选择 Agent workspace
- **THEN** Agent workspace 是当前 active Project workspace
- **AND** 页面主体优先展示 Agent instances 列表或空状态
- **AND** Files、Git、Terminal 仍作为同一 Project scope 的二级导航入口存在，但不挤占 Agent instances 主工作区

#### Scenario: Agent sessions are loading or unavailable

- **WHEN** Agent Sessions 数据处于加载、错误或空状态
- **THEN** Agent workspace 保留对应加载、错误或空态反馈
- **AND** 不伪造不存在的 Agent instance
- **AND** 用户仍可识别 Claude/Codex 创建入口是否可用

### Requirement: Agent instance rows expose provider, status, summary, and entry action

系统 SHALL 让 Agent workspace 中的 Agent instance 以可扫读行或紧凑卡片呈现，并保留 provider、名称、状态、少量上下文和进入详情的行为。

#### Scenario: User scans active Agent instances

- **WHEN** Project 下存在一个或多个 Agent Sessions
- **THEN** 每个 Agent instance 条目展示 provider 标记或图标位置
- **AND** 每个条目展示 display name 或等价实例名称
- **AND** 每个条目展示运行状态或等待输入等文字状态
- **AND** 每个条目提供进入 Agent Session detail 的行为

#### Scenario: Agent metadata is long

- **WHEN** Agent session id、provider metadata、任务摘要或最近输出较长
- **THEN** Agent instance 条目不会造成页面横向溢出
- **AND** 主要名称、provider、状态和进入行为仍可识别

### Requirement: Agent workspace reserves lightweight session history presentation

系统 SHALL 在 Agent workspace 中以轻量方式保留 session history / future restore 的呈现位置，而不是把历史记录混入当前运行实例列表或使用厚卡片挤占主内容。

#### Scenario: User views Agent workspace with current sessions

- **WHEN** 用户查看 Agent workspace
- **THEN** 当前运行实例列表与 session history 区域在视觉上可区分
- **AND** history 使用轻量列表行、摘要和相对时间或等价信息
- **AND** history 不伪装成当前可操作的运行实例

#### Scenario: Provider history is not fully implemented

- **WHEN** 系统还不能读取 Claude/Codex provider history 或 resume summary
- **THEN** Agent workspace 可以展示 future capability 的轻量占位、空状态或说明
- **AND** 不暗示 provider history 已经可恢复或拥有真实数据

### Requirement: Mobile Agent workspace preserves direct secondary navigation and first-screen density

系统 SHALL 在手机视口中将 Agent workspace 呈现为 Project 直接二级页，保留带 Back 的底部二级导航，并优先展示创建入口和 Agent instances。

#### Scenario: User opens Agent workspace on mobile

- **WHEN** 用户在手机视口进入 Project Agent workspace
- **THEN** 页面底部显示 Project 二级导航，包含 Back 与 Agent active 状态
- **AND** 页面顶部不重复显示返回一级页面的 Back 控件
- **AND** 首屏优先展示当前 Project / Agent 上下文、Claude/Codex 创建入口和 Agent instances 列表
- **AND** session history 或辅助说明不挤占 Agent instances 首屏密度

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
