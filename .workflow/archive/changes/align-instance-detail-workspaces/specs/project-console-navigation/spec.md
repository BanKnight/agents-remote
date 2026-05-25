# project-console-navigation spec

本文件记录 `align-instance-detail-workspaces` 对 `project-console-navigation` 的行为契约增量。

## Change 来源

- change-id：align-instance-detail-workspaces
- 来源意图：Agent / Terminal instance detail 需要与 prototype 对齐：详情页采用 terminal-first 工作区；Agent instance 顶部提供 Files/Git/+Terminal/Meta 等快捷入口，Meta 以浮窗呈现；移动端终端面板支持滚动和输入，底部输入抽屉可展开/收起并提供真实终端快捷键；Terminal instance detail 保持 focused shell，不显示 Files/Git/+Terminal 快捷入口。
- 规划来源：本 change 直接承接用户原始意图，并沿用长期 `project-console-navigation` 的三层页面模型、移动端直接二级页与深层 detail 区分，以及 `docs/design/frontend-ui-architecture.md` 的 route/workspace 边界。

## ADDED Requirements

### Requirement: Instance detail pages remain deep contextual pages

系统 SHALL 将 Agent Session detail 与 Terminal Session detail 作为 Project scope 下的深层/contextual detail，而不是 Project 直接二级 workspace。

#### Scenario: User opens an Agent Session detail

- **WHEN** 用户从 Project Agent workspace 打开某个 Agent Session detail
- **THEN** 页面使用顶部返回入口回到来源 Project / Agent 上下文
- **AND** 手机视口不显示 Project 二级底部导航
- **AND** 页面底部区域优先服务当前 Agent Session 的输入、快捷键或状态，而不是 Back/Agent/Files/Git/Terminal 二级导航

#### Scenario: User opens a Terminal Session detail

- **WHEN** 用户从 Project Terminal workspace 或 Agent detail 派生入口打开某个 Terminal Session detail
- **THEN** 页面使用顶部返回入口回到来源上下文
- **AND** 手机视口不显示 Project 二级底部导航
- **AND** 页面底部区域优先服务当前 Terminal Session 的输入、快捷键或状态

### Requirement: Agent detail contextual resource entries do not become Project secondary navigation

系统 SHALL 让 Agent Session detail 中的 Files、Git 和 +Terminal 入口保留为从当前 Agent context 派生的快捷入口，而不是把 Project 二级导航搬入 detail 页面。

#### Scenario: User opens Files from Agent detail

- **WHEN** 用户从 Agent Session detail 进入 Files contextual view
- **THEN** 目标页面保留顶部返回到 Agent detail 或等价来源上下文的入口
- **AND** 手机视口不显示 Project 二级底部导航
- **AND** Files 内容仍遵守 Project-safe path 和只读 inspection 边界

#### Scenario: User opens Git from Agent detail

- **WHEN** 用户从 Agent Session detail 进入 Git contextual view
- **THEN** 目标页面保留顶部返回到 Agent detail 或等价来源上下文的入口
- **AND** 手机视口不显示 Project 二级底部导航
- **AND** Git 内容仍遵守只读 status/diff inspection 边界

#### Scenario: User creates or opens a Terminal from Agent detail

- **WHEN** 用户从 Agent Session detail 使用 +Terminal 入口创建或进入 Terminal instance
- **THEN** 系统进入 Terminal Session detail 或等价 focused shell detail
- **AND** 该 Terminal detail 使用顶部返回回到 Agent context 或来源页面
- **AND** 不显示 Project 二级底部导航或 Agent-only Files/Git/+Terminal 工具组

### Requirement: Detail page return targets preserve Project workspace context

系统 SHALL 让 instance detail 的返回和来源上下文保留 Project workspace 语义，使用户离开 detail 后能回到对应 Agent 或 Terminal 工作区。

#### Scenario: User returns from Agent detail

- **WHEN** 用户从 Agent Session detail 点击顶部返回
- **THEN** 系统回到同一 Project 的 Agent workspace 或等价来源上下文
- **AND** Agent workspace active 状态仍可通过 URL-visible route/search 或等价机制恢复

#### Scenario: User returns from Terminal detail

- **WHEN** 用户从 Terminal Session detail 点击顶部返回
- **THEN** 系统回到同一 Project 的 Terminal workspace、Agent-derived context 或等价来源上下文
- **AND** 返回行为不要求用户经过 Home 或丢失 Project scope

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
