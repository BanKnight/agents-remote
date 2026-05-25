# project-console-navigation spec

本文件记录 `rework-project-mobile-workspace` 对 `project-console-navigation` 的行为契约增量。

## Change 来源

- change-id：rework-project-mobile-workspace
- 来源意图：Project 详情页移动端布局需要参考原型中的工作区主界面，左上角提供返回，并从上到下组织为功能区（Git/Files）、Agent 区、Terminal 区；Project 详情页不应有过多常驻内容，尤其不应常驻底部 runtime input，应自动撑满视口并避免出现页面滚动条。
- 规划来源：在 `align-mobile-app-shell` 已完成的移动端 App-like shell、术语映射和视口不溢出基线上，重排 Project 详情页成为移动端工作区入口。

## ADDED Requirements

### Requirement: Mobile Project console behaves as a workspace home screen

系统 SHALL 在手机视口中将 Project 详情页呈现为当前 Project 的工作区主界面，而不是网站式长页面。

#### Scenario: User enters a Project console on mobile

- **WHEN** 用户在手机尺寸视口从 Project 列表进入某个 Project
- **THEN** 页面展示当前 Project 上下文和返回 Project 列表的入口
- **AND** 页面主体按工作区入口组织，而不是以大页头、长说明和多列信息面板占据首屏
- **AND** Agent、Terminal、Files、Git 使用本项目领域术语表达

#### Scenario: User needs to return to Projects

- **WHEN** 用户在 Project 详情页移动端查看当前 Project 工作区
- **THEN** 左上或顶部主导航区域提供返回 Project 列表的明确入口
- **AND** 该入口不依赖浏览器系统返回按钮作为唯一返回方式

### Requirement: Mobile Project console orders workspace sections by task priority

系统 SHALL 在手机视口中按照功能区、Agent 区、Terminal 区的顺序组织 Project 工作区入口。

#### Scenario: User scans Project workspace on mobile

- **WHEN** 用户打开 Project 详情页移动端默认视图
- **THEN** 页面从上到下依次呈现 Files/Git 功能入口、Agent Sessions 区域、Terminal Sessions 区域
- **AND** Files/Git 作为 Project 功能区入口可被发现
- **AND** Agent Sessions 和 Terminal Sessions 各自保持独立概念、状态和创建入口

#### Scenario: Existing sessions are present

- **WHEN** 当前 Project 下已有 Agent Sessions 或 Terminal Sessions
- **THEN** 对应区域展示可进入详情页的会话项
- **AND** 会话项仍可表达运行状态、展示名称和关闭入口
- **AND** Agent Session 不被描述为普通 Terminal，Terminal Session 不被描述为 Agent

### Requirement: Mobile Project console avoids persistent shell-level runtime input

系统 SHALL 不在 Project 详情页移动端常驻底部 runtime input 或大块输入提示；输入能力应由具体 Agent/Terminal Session 详情页承载。

#### Scenario: User views Project console without opening a session detail

- **WHEN** 用户停留在 Project 详情页移动端工作区
- **THEN** 页面不显示固定在底部并占用可视高度的 runtime input 面板
- **AND** 如需提示输入能力，应以轻量文案或会话入口表达
- **AND** 用户进入具体 Agent/Terminal Session detail 后才看到该 session 的输入和快捷键控制

#### Scenario: User opens an Agent or Terminal section

- **WHEN** 用户从 Project 工作区选择 Agent 或 Terminal 会话
- **THEN** 系统导航到对应 Session detail 页面
- **AND** 输入发送、快捷键和重连恢复不由 Project 工作区页面直接处理

### Requirement: Mobile Project console fits the viewport without page-level scrolling by default

系统 SHALL 让 Project 详情页移动端默认撑满可视视口，并把必要滚动限制在列表或内容区域内，避免页面本身出现无意义滚动条。

#### Scenario: Workspace content fits in the mobile viewport

- **WHEN** Project 功能区、Agent 区和 Terminal 区内容数量处于常见范围
- **THEN** Project 工作区外壳撑满视口
- **AND** 页面级容器不出现无意义纵向滚动条
- **AND** 底部内容不会被固定导航或操作区遮挡

#### Scenario: Session lists exceed available space

- **WHEN** Agent Sessions 或 Terminal Sessions 列表超过当前区域可视高度
- **THEN** 超出的列表内容在该区域内部滚动或通过等价局部滚动方式访问
- **AND** 当前 Project 上下文和返回入口保持可见或易于恢复

## MODIFIED Requirements

### Requirement: Project console exposes first-round sections for Agent, Terminal, Git, and Files

修改长期 `project-console-navigation` 中一级入口要求：移动端 Project 详情页 SHALL 把 Files/Git 作为顶部功能区入口，并把 Agent Sessions 与 Terminal Sessions 作为独立工作区区域，而不是仅通过侧栏或分散面板发现。

#### Scenario: User scans mobile Project console navigation

- **WHEN** 用户查看手机视口中的 Project 控制台入口
- **THEN** 可以识别 Files、Git、Agent Sessions 和 Terminal Sessions
- **AND** Files/Git 位于功能区，Agent/Terminal 位于各自运行态区域
- **AND** 不要求通过桌面侧栏才能发现这些入口

### Requirement: Bottom action/input area is represented as shell-level affordance only

修改长期 `project-console-navigation` 中底部输入 affordance 要求：在 Project 工作区移动端，shell-level runtime input 不应常驻底部；输入 affordance 如存在，只能是轻量说明或进入 Session detail 的路径。

#### Scenario: User views mobile Project workspace

- **WHEN** 用户在移动端查看 Project 工作区
- **THEN** 页面不常驻占用底部高度的 runtime input 面板
- **AND** 用户可以通过 Agent/Terminal Session detail 进入真正的输入界面

## REMOVED Requirements

- （无）
