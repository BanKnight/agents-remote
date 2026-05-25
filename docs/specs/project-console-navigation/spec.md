# project-console-navigation spec

本文件记录 `project-console-navigation` 的长期行为契约。它是主线 WHAT，不记录实现方案、任务拆解或单次 change 过程。

## Purpose

- 定义登录后 Project 控制台外壳如何区分一级应用 shell、Project 内二级 workspace 和深层 Session/detail chrome，并保留 Project 上下文。
- 确保 Agent、Terminal、Git、Files 的 Project-scoped 入口具备可恢复导航状态和清晰移动端返回模型。

## Requirements

### Requirement: Authenticated users can enter a Project-scoped console shell

系统 SHALL 允许已认证用户从 Project 列表进入某个 Project 的控制台外壳，并在页面中保留当前 Project 上下文。

#### Scenario: User enters an existing Project

- **WHEN** 已认证用户从 Project 列表选择一个 Project
- **THEN** 控制台进入该 Project 的作用域页面
- **AND** 页面可见区域展示当前 Project 名称或等价上下文

#### Scenario: User enters a Project from Home

- **WHEN** 已认证用户从 Home / Projects 打开某个 Project
- **THEN** 控制台默认进入该 Project 的 Agent workspace
- **AND** Project workspace active 状态可以通过路由、search 或等价 URL-visible 机制恢复

#### Scenario: Project identity contains URL-sensitive characters

- **WHEN** 用户进入名称包含需要 URL 编码字符的 Project
- **THEN** 控制台仍能根据 URL 中的 Project 标识展示对应 Project 上下文

### Requirement: Console exposes level-one and Project level-two navigation shells

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

### Requirement: Home Projects entry prioritizes opening a Project

系统 SHALL 将登录后的 Home / Projects 呈现为一级应用 shell 中的 Projects 工作区，并优先服务用户选择已有 Project 进入控制台。

#### Scenario: User views Home on desktop

- **WHEN** 已认证用户在桌面端打开 Home / Projects
- **THEN** 页面展示一级导航与 Projects 工作区结构
- **AND** Projects 是当前 active 一级入口
- **AND** Project 列表是主工作区的主要内容

#### Scenario: User views Home on mobile

- **WHEN** 已认证用户在手机视口打开 Home / Projects
- **THEN** 页面底部展示一级导航
- **AND** Projects 是当前 active 一级入口
- **AND** 主工作区优先展示 Projects 内容而不是大段介绍文案

### Requirement: Home Project rows support recognition, status, and direct entry

系统 SHALL 让 Home / Projects 中的 Project 条目以可扫读列表行呈现，并为每个 Project 提供图标、名称、简短路径或状态和进入行为。

#### Scenario: User scans available Projects

- **WHEN** Home / Projects 加载出一个或多个 Project
- **THEN** 每个 Project 条目展示一致的 Project 图标或标记位置
- **AND** 每个 Project 条目展示 Project 名称
- **AND** 每个 Project 条目展示简短路径、状态摘要或等价辅助信息
- **AND** 每个 Project 条目提供进入对应 Project 控制台的行为

#### Scenario: Project path is long

- **WHEN** Project 的路径或辅助信息超过当前可视宽度
- **THEN** Project 条目不会造成页面横向溢出
- **AND** 主要 Project 名称和进入行为仍可识别

### Requirement: Home create or adopt Project remains a low-frequency action

系统 SHALL 将创建或采用 Project 的入口保留为 Home / Projects 中的低频操作，而不是让它占据主工作区或遮挡 Project 列表。

#### Scenario: User can create or adopt a Project

- **WHEN** 已认证用户在 Home / Projects 查看 Project 入口
- **THEN** 创建或采用 Project 的入口可被发现
- **AND** 该入口不作为大块表单常驻占据 Project 列表首屏
- **AND** 该入口在移动端不遮挡底部一级导航或 Project 列表内容

#### Scenario: No Project exists yet

- **WHEN** 当前没有可进入的 Project
- **THEN** Home / Projects 可以将创建或采用 Project 作为空态主行动
- **AND** 空态仍明确说明创建或采用 Project 是为了进入控制台 shell

#### Scenario: Project creation fails or is unavailable

- **WHEN** 用户尝试创建或采用 Project 但操作失败、被禁用或仍在提交中
- **THEN** Home / Projects 仍展示对应错误、禁用、加载或恢复状态
- **AND** 不因视觉对齐移除已有安全提示或失败反馈

### Requirement: Project Agent workspace prioritizes current Agent instances

系统 SHALL 将 Project 的默认 Agent workspace 呈现为 Agent instances 工作区，优先展示当前 Project 下的 Agent Session 运行实例、provider 创建入口和轻量 history/future restore 区域。

#### Scenario: User opens a Project Agent workspace

- **WHEN** 用户从 Home 进入某个 Project 或在 Project 二级导航选择 Agent workspace
- **THEN** Agent workspace 是当前 active Project workspace
- **AND** 页面主体优先展示 Agent instances 列表或空状态
- **AND** Claude/Codex 创建入口位于 Agent workspace 主要操作区域
- **AND** Files、Git、Terminal 仍作为同一 Project scope 的二级导航入口存在，但不挤占 Agent instances 主工作区

#### Scenario: Agent sessions are loading or unavailable

- **WHEN** Agent Sessions 数据处于加载、错误或空状态
- **THEN** Agent workspace 保留对应加载、错误或空态反馈
- **AND** 不伪造不存在的 Agent instance
- **AND** 用户仍可识别 Claude/Codex 创建入口是否可用

### Requirement: Agent workspace separates current instances from staged history

系统 SHALL 让 Agent workspace 明确区分当前运行 Agent instances 与 provider history / future restore 呈现区域，且 history 未实现前不得暗示已有真实可恢复数据。

#### Scenario: User scans active Agent instances

- **WHEN** Project 下存在一个或多个 Agent Sessions
- **THEN** 每个 Agent instance 条目展示 provider 标记或图标位置
- **AND** 每个条目展示 display name、运行状态、internal session id 和进入 Agent Session detail 的行为
- **AND** 长 session id、provider metadata 或 displayName 不造成页面横向溢出

#### Scenario: Provider history is not fully implemented

- **WHEN** 系统还不能读取 Claude/Codex provider history 或 resume summary
- **THEN** Agent workspace 可以展示 future capability 的轻量占位、空状态或说明
- **AND** 当前运行实例列表与 session history 区域在视觉上可区分
- **AND** 不暗示 provider history 已经可恢复或拥有真实数据

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

### Requirement: Instance detail return targets preserve source context

系统 SHALL 让 Agent/Terminal instance detail 的返回路径保留 Project workspace 或来源 Agent context，使用户离开 detail 后仍处于可理解的 Project scope。

#### Scenario: User returns from an Agent detail

- **WHEN** 用户从 Agent Session detail 点击顶部返回
- **THEN** 系统回到同一 Project 的 Agent workspace 或等价来源上下文
- **AND** Agent workspace active 状态仍可通过 URL-visible route/search 或等价机制恢复

#### Scenario: User returns from a direct Terminal detail

- **WHEN** 用户从 Project Terminal workspace 打开 Terminal Session detail 并点击顶部返回
- **THEN** 系统回到同一 Project 的 Terminal workspace 或等价来源上下文
- **AND** 返回行为不要求用户经过 Home 或丢失 Project scope

#### Scenario: User enters Terminal detail from Agent detail

- **WHEN** 用户从 Agent Session detail 使用 +Terminal 创建或进入 Terminal detail
- **THEN** Terminal detail 保留回到来源 Agent detail 的顶部返回入口或等价来源上下文
- **AND** Terminal detail 不显示 Project 二级底部导航或 Agent-only Files/Git/+Terminal 工具组

### Requirement: Agent detail contextual resource entries remain contextual

系统 SHALL 让 Agent Session detail 中的 Files、Git 和 +Terminal 保持为当前 Agent context 派生入口，而不是把 Project 二级导航搬进 detail 页面。

#### Scenario: User opens Files from Agent detail

- **WHEN** 用户从 Agent Session detail 进入 Files contextual view
- **THEN** 页面保留顶部返回到 Agent detail 或 stream 的入口
- **AND** 手机视口不显示 Project 二级底部导航
- **AND** Files 内容仍遵守 Project-safe path 和只读 inspection 边界

#### Scenario: User opens Git from Agent detail

- **WHEN** 用户从 Agent Session detail 进入 Git contextual view
- **THEN** 页面保留顶部返回到 Agent detail 或 stream 的入口
- **AND** 手机视口不显示 Project 二级底部导航
- **AND** Git 内容仍遵守只读 status/diff inspection 边界

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

系统 SHALL 为导航项、图标标记、列表行、按钮、状态标签和基础卡片提供一致视觉语言，同时避免为了 UI alignment 引入未验证的新组件库或过度抽象。

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

### Requirement: Mobile Project direct secondary pages behave as Project workspaces

系统 SHALL 在手机视口中将 Project 的 Agent、Files、Git、Terminal 直接二级页呈现为当前 Project 的工作区页面，而不是同时承载一级页面导航的网站式长页面。

#### Scenario: User enters a Project direct secondary page on mobile

- **WHEN** 用户在手机尺寸视口从 Project 列表进入某个 Project 或切换 Agent、Files、Git、Terminal workspace
- **THEN** 页面展示当前 Project 上下文和当前 workspace
- **AND** 页面主体由当前 workspace 内容组织，不同时显示一级底部导航
- **AND** Agent、Terminal、Files、Git 使用本项目领域术语表达

#### Scenario: User scans Project direct secondary navigation on mobile

- **WHEN** 用户打开 Project 的 Agent、Files、Git 或 Terminal 直接二级页
- **THEN** 页面底部保留 Back、Agent、Files、Git、Terminal 的二级导航结构
- **AND** 当前 workspace 有可见 active 状态
- **AND** 低频或非当前 workspace 内容不挤占首屏



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

- 当前已验证实现包含单密码登录 gate、Home 一级 shell、Project list/create/enter、Project 二级 workspace shell、URL-visible `workspace` active 状态、只读 Files 浏览/预览、只读 Git diff 查看、Agent/Terminal Session 列表、Terminal Session 创建和 Session detail 输入。
- Project 工作区不常驻 shell-level runtime input；真实输入、快捷键、重连恢复由 Agent/Terminal Session detail 承载。
- Files/Git inspection 仍保持只读；移动端深层信息密度由后续 inspection polish 继续优化。

## 来源

- change：build-responsive-pwa-console-shell
- verify 证据：`.workflow/changes/build-responsive-pwa-console-shell/verify.md`
- change：rework-project-mobile-workspace
- verify 证据：`.workflow/changes/rework-project-mobile-workspace/verify.md`
- 运行态验证证据：`.workflow/changes/rework-project-mobile-workspace/artifacts/mobile-project-workspace.png`
- change：align-ui-shell-foundation
- verify 证据：`.workflow/changes/align-ui-shell-foundation/verify.md`
- 运行态验证证据：`.workflow/changes/align-ui-shell-foundation/artifacts/browser-structure/structure-check.log` 与同目录 desktop/mobile 截图
- change：align-home-project-entry
- verify 证据：`.workflow/changes/align-home-project-entry/verify.md`
- 运行态验证证据：`.workflow/changes/align-home-project-entry/artifacts/browser-home-entry/home-entry-check.log` 与同目录 desktop/mobile Home entry 截图
- change：align-project-agent-workspace
- verify 证据：`.workflow/changes/align-project-agent-workspace/verify.md`
- 运行态验证证据：`.workflow/changes/align-project-agent-workspace/artifacts/browser-agent-workspace/agent-workspace-check.log` 与同目录 desktop/mobile Agent workspace 截图
