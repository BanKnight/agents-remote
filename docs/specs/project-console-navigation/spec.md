# project-console-navigation spec

本文件记录 `project-console-navigation` 的长期行为契约。它是主线 WHAT，不记录实现方案、任务拆解或单次 change 过程。

## Purpose

- 定义登录后 Project 控制台外壳如何保留 Project 上下文，以及 Agent、Terminal、Git、Files 入口的信息架构。
- 确保真实 Agent Runtime 接入前，前端可以建立可观察的控制台结构，但不伪装真实会话或执行未实现操作。

## Requirements

### Requirement: Authenticated users can enter a Project-scoped console shell

系统 SHALL 允许已认证用户从 Project 列表进入某个 Project 的控制台外壳，并在页面中保留当前 Project 上下文。

#### Scenario: User enters an existing Project

- **WHEN** 已认证用户从 Project 列表选择一个 Project
- **THEN** 控制台进入该 Project 的作用域页面
- **AND** 页面可见区域展示当前 Project 名称或等价上下文

#### Scenario: Project identity contains URL-sensitive characters

- **WHEN** 用户进入名称包含需要 URL 编码字符的 Project
- **THEN** 控制台仍能根据 URL 中的 Project 标识展示对应 Project 上下文

### Requirement: Agent Sessions remain a primary Project runtime area

系统 SHALL 在 Project 控制台中保持 Agent Sessions 作为主要运行态区域，因为远程控制 AI Agent 是产品主目标。

#### Scenario: User opens a Project console

- **WHEN** 用户进入某个 Project 的控制台
- **THEN** 页面展示 Agent Sessions 列表或空状态
- **AND** Agent Sessions 提供 Claude/Codex 创建入口或等价 Agent 入口
- **AND** Terminal、Git、Files 作为同一 Project scope 下的辅助入口或区域可被发现

#### Scenario: No Agent sessions exist yet

- **WHEN** 当前 Project 尚无 Agent Sessions
- **THEN** Agent Sessions 区域展示清晰空状态
- **AND** 不伪装已有真实 Agent 会话

### Requirement: Project console exposes first-round sections for Agent, Terminal, Git, and Files

系统 SHALL 在 Project 控制台外壳中提供 Agent、Terminal、Git 和 Files 的一级入口，用于建立后续能力的信息架构。

#### Scenario: User scans the Project console navigation

- **WHEN** 用户查看 Project 控制台导航或主要入口
- **THEN** 可以识别 Agent、Terminal、Git 和 Files 四类入口
- **AND** 移动端默认视图中 Files/Git 作为 Project 检查功能区可被发现
- **AND** Agent Sessions 与 Terminal Sessions 作为独立运行态区域可被发现

#### Scenario: Deferred or read-only features are opened

- **WHEN** 用户访问 Terminal、Git 或 Files 入口
- **THEN** 系统展示对应真实能力、明确空状态或后续能力提示
- **AND** Files/Git 入口不得执行文件修改或 Git 写操作

### Requirement: Mobile Project console behaves as a workspace home screen

系统 SHALL 在手机视口中将 Project 控制台呈现为当前 Project 的工作区主界面，而不是网站式长页面。

#### Scenario: User enters a Project console on mobile

- **WHEN** 用户在手机尺寸视口从 Project 列表进入某个 Project
- **THEN** 页面展示当前 Project 上下文和返回 Project 列表的入口
- **AND** 页面主体按工作区入口组织，而不是以大页头、长说明和多列信息面板占据首屏
- **AND** Agent、Terminal、Files、Git 使用本项目领域术语表达

#### Scenario: User scans Project workspace on mobile

- **WHEN** 用户打开 Project 控制台移动端默认视图
- **THEN** 页面从上到下依次呈现 Files/Git 功能入口、Agent Sessions 区域、Terminal Sessions 区域
- **AND** Agent Sessions 和 Terminal Sessions 各自保持独立概念、状态和创建入口



系统 SHALL 让控制台外壳中的会话卡片或占位结构优先表达远程可观察性，包括运行状态、是否需要用户输入和最近输出摘要的空间。

#### Scenario: Session data is unavailable in the first shell slice

- **WHEN** 后端尚未提供真实 Agent 或 Terminal Session 数据
- **THEN** 前端仍保留用于状态、等待输入和当前输出摘要的信息位置
- **AND** 明确区分示例、占位或空状态与真实运行数据

#### Scenario: Future session data becomes available

- **WHEN** 后续 change 提供真实 Session summary 数据
- **THEN** 当前外壳的信息架构可以承载运行中、已停止、等待输入和最近输出等可观察状态

### Requirement: Project workspace avoids persistent shell-level runtime input

系统 SHALL 不在 Project 工作区常驻底部 runtime input 或大块输入提示；输入能力应由具体 Agent/Terminal Session 详情页承载。

#### Scenario: User views Project console without opening a session detail

- **WHEN** 用户停留在 Project 工作区
- **THEN** 页面不显示固定在底部并占用可视高度的 runtime input 面板
- **AND** 如需提示输入能力，应以轻量文案或会话入口表达
- **AND** 用户进入具体 Agent/Terminal Session detail 后才看到该 session 的输入和快捷键控制

#### Scenario: User opens an Agent or Terminal session

- **WHEN** 用户从 Project 工作区选择 Agent 或 Terminal 会话
- **THEN** 系统导航到对应 Session detail 页面
- **AND** 输入发送、快捷键和重连恢复不由 Project 工作区页面直接处理

### Requirement: Mobile Project console fits the viewport without page-level scrolling by default

系统 SHALL 让 Project 控制台移动端默认撑满可视视口，并把必要滚动限制在列表或内容区域内，避免页面本身出现无意义滚动条。

#### Scenario: Workspace content fits in the mobile viewport

- **WHEN** Project 功能区、Agent 区和 Terminal 区内容数量处于常见范围
- **THEN** Project 工作区外壳撑满视口
- **AND** 页面级容器不出现无意义纵向滚动条
- **AND** 底部内容不会被固定导航或操作区遮挡

#### Scenario: Session lists exceed available space

- **WHEN** Agent Sessions 或 Terminal Sessions 列表超过当前区域可视高度
- **THEN** 超出的列表内容在该区域内部滚动或通过等价局部滚动方式访问
- **AND** 当前 Project 上下文和返回入口保持可见或易于恢复

## Notes

- 当前已验证实现包含单密码登录 gate、Project list/create/enter、Project console shell、Files/Git 顶部功能区、Agent Sessions 与 Terminal Sessions 工作区区域、只读 Files 浏览/预览、只读 Git diff 查看、Terminal Session 创建和 Session detail 输入。
- Project 工作区不常驻 shell-level runtime input；真实输入、快捷键、重连恢复由 Agent/Terminal Session detail 承载。
- Files/Git inspection 仍保持只读；移动端深层信息密度由后续 inspection polish 继续优化。

## 来源

- change：build-responsive-pwa-console-shell
- verify 证据：`.workflow/changes/build-responsive-pwa-console-shell/verify.md`
- change：rework-project-mobile-workspace
- verify 证据：`.workflow/changes/rework-project-mobile-workspace/verify.md`
- 运行态验证证据：`.workflow/changes/rework-project-mobile-workspace/artifacts/mobile-project-workspace.png`
