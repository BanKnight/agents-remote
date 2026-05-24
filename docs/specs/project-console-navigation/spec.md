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

### Requirement: Agent Sessions are the default focus inside a Project console

系统 SHALL 在用户进入 Project 后默认聚焦 Agent Sessions 区域，因为远程控制 AI Agent 是产品主目标。

#### Scenario: User opens a Project console

- **WHEN** 用户进入某个 Project 的控制台
- **THEN** 默认主要内容聚焦 Agent Sessions 列表或占位区域
- **AND** Terminal、Git、Files 作为辅助入口可被发现但不抢占默认焦点

#### Scenario: No Agent runtime is connected yet

- **WHEN** 真实 Agent Runtime 尚未接入
- **THEN** Agent Sessions 区域仍提供清晰的空状态或占位结构
- **AND** 不伪装已有真实 Agent 会话

### Requirement: Project console exposes first-round sections for Agent, Terminal, Git, and Files

系统 SHALL 在 Project 控制台外壳中提供 Agent、Terminal、Git 和 Files 的一级入口，用于建立后续能力的信息架构。

#### Scenario: User scans the Project console navigation

- **WHEN** 用户查看 Project 控制台导航或主要入口
- **THEN** 可以识别 Agent、Terminal、Git 和 Files 四类入口
- **AND** Agent 入口被表达为主要入口

#### Scenario: Deferred features are opened before implementation

- **WHEN** 用户访问尚未实现真实能力的 Terminal、Git 或 Files 入口
- **THEN** 系统展示明确的占位、空状态或后续能力提示
- **AND** 不执行文件修改、Git 写操作或真实 session runtime 操作

### Requirement: Session summary cards prioritize observability

系统 SHALL 让控制台外壳中的会话卡片或占位结构优先表达远程可观察性，包括运行状态、是否需要用户输入和最近输出摘要的空间。

#### Scenario: Session data is unavailable in the first shell slice

- **WHEN** 后端尚未提供真实 Agent 或 Terminal Session 数据
- **THEN** 前端仍保留用于状态、等待输入和当前输出摘要的信息位置
- **AND** 明确区分示例、占位或空状态与真实运行数据

#### Scenario: Future session data becomes available

- **WHEN** 后续 change 提供真实 Session summary 数据
- **THEN** 当前外壳的信息架构可以承载运行中、已停止、等待输入和最近输出等可观察状态

### Requirement: Bottom action/input area is represented as shell-level affordance only

系统 SHALL 在第一轮外壳中为底部输入或快速操作区域预留可见的产品位置，但不要求接入真实 Agent/Terminal 输入流。

#### Scenario: User views the mobile Project console

- **WHEN** 用户在移动端查看 Project 控制台
- **THEN** 页面可以展示底部输入或快速操作区域的外壳 affordance
- **AND** 不要求该区域在本 change 中向真实 Agent 或 Terminal 发送输入

#### Scenario: Runtime input is attempted before runtime implementation

- **WHEN** 用户尝试使用尚未接入真实 runtime 的输入区域
- **THEN** 系统不会创建真实 Agent/Terminal 操作
- **AND** 应以占位、禁用或说明性状态表达该能力尚未接入

## Notes

- 当前已验证实现包含单密码登录 gate、Project list/create/enter、Project console shell、Agent 默认焦点、Terminal/Git/Files 占位和 disabled runtime input affordance。
- 真实 session summary 字段、状态枚举、输入发送和重连语义由后续 runtime changes 定义。

## 来源

- change：build-responsive-pwa-console-shell
- verify 证据：`.workflow/changes/build-responsive-pwa-console-shell/verify.md`
