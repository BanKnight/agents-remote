# project-console-navigation spec

本文件记录 `align-ui-shell-foundation` change 对 `project-console-navigation` 的行为契约增量。

## Change 来源

- change-id：align-ui-shell-foundation
- 来源意图：先处理跨页面共享的结构基础，包括一级/二级 navigation shell、路由层级、直接页/详情页归属、移动端返回模型、shared icon system，以及 card/list/button/status pill 等基础视觉组件语言。
- 规划来源：本 change 直接承接用户原始意图，依赖已完成的 `design-frontend-ui-architecture` 长期设计基线。

## ADDED Requirements

### Requirement: Console exposes level-one and project level-two navigation shells

系统 SHALL 在真实 Web UI 中区分一级应用导航与 Project 内二级导航，使用户能识别当前处于全局入口还是某个 Project workspace。

#### Scenario: User views the app on desktop

- **WHEN** 已认证用户在桌面端查看 Home 或 Project 页面
- **THEN** 一级页面使用一级导航与工作区结构
- **AND** Project 页面使用 Project 二级导航与 Project workspace 结构
- **AND** Agent、Files、Git、Terminal 在 Project 二级导航中可被识别

#### Scenario: User views the app on mobile

- **WHEN** 已认证用户在手机视口查看一级页面或 Project 直接二级页
- **THEN** 一级页面使用底部一级导航
- **AND** Project 直接二级页使用底部二级导航
- **AND** 两种底部导航不会同时出现在同一个页面状态中

### Requirement: Mobile direct secondary pages return through secondary bottom navigation

系统 SHALL 让移动端 Project 直接二级页通过底部二级导航中的 Back 项返回一级页面，而不是在左上角重复显示返回入口。

#### Scenario: User opens a Project direct secondary page on mobile

- **WHEN** 用户在移动端进入 Project 的 Agent、Files、Git 或 Terminal 直接二级页
- **THEN** 页面底部显示包含 Back、Agent、Files、Git、Terminal 的二级导航或等价结构
- **AND** 页面顶部不显示返回一级页面的重复 Back 控件
- **AND** 当前二级页在导航中有可见 active 状态

### Requirement: Deep or contextual detail pages use top return without bottom secondary navigation

系统 SHALL 将深层详情页与 Project 直接二级页区分开，深层或 contextual detail 在移动端只保留顶部返回并隐藏底部二级导航。

#### Scenario: User enters a deep detail page on mobile

- **WHEN** 用户进入 Agent instance detail、Terminal instance detail、file preview、Git diff detail 或从 Agent instance 派生的 resource context
- **THEN** 页面顶部显示返回来源上下文的入口
- **AND** 页面底部不显示 Project 二级导航
- **AND** 底部区域优先服务当前详情页内容或 runtime input

### Requirement: Route-visible workspace state is not stored only in shell-local state

系统 SHALL 让用户可感知的页面层级和需要返回/刷新恢复的 workspace 状态由路由或等价 URL-visible 机制承载，而不是只保存在 Jotai atom 或组件本地状态中。

#### Scenario: User opens a Project secondary workspace

- **WHEN** 用户切换到 Project 的 Agent、Files、Git 或 Terminal workspace
- **THEN** 浏览器刷新或返回行为不会让用户丢失可感知的页面层级
- **AND** 该 workspace 的 active 状态可以从路由、search 或等价可恢复机制恢复

#### Scenario: User changes local-only selection within a workspace

- **WHEN** 用户只改变同页临时选择，例如展开列表项或选择非移动详情形态的 preview
- **THEN** 该局部状态可以保留在组件本地状态中
- **AND** 不要求进入全局 shell 状态

### Requirement: Shared visual primitives provide consistent recognition without premature component-library expansion

系统 SHALL 为导航项、图标标记、列表行、按钮、状态标签和基础卡片提供一致视觉语言，同时避免为了本轮 UI alignment 引入未验证的新组件库或过度抽象。

#### Scenario: User scans navigation and workspace lists

- **WHEN** 用户查看 Project、Agent provider、Files、Git、Terminal、history 或 status 相关入口
- **THEN** 这些入口使用一致的轻量图标或标记位置
- **AND** 状态表达包含文字标签，不只依赖颜色
- **AND** 列表行保持可扫读密度，避免重复 metadata 和厚卡片挤占首屏

### Requirement: Shell foundation preserves existing user-visible states and safety boundaries

系统 SHALL 在对齐共享 shell 和视觉基础时保留现有加载、空、错误、禁用和危险确认行为，不因结构重排删除真实能力的安全提示。

#### Scenario: A Project resource or session area is unavailable

- **WHEN** Files、Git、Agent、Terminal 或 Project 数据处于加载、空、错误或禁用状态
- **THEN** 页面仍展示对应状态和可恢复动作
- **AND** 不把未实现或不允许的写操作显示成可点击主操作
- **AND** 关闭 Agent/Terminal session 等危险动作仍需要确认

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
