# home-project-shell-alignment spec

本文件记录单个 change 对 `home-project-shell-alignment` 的行为契约增量。

## Change context

- change-id：align-home-project-shell
- 所属 version：v0.8-prototype-ui-alignment
- context：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/context.md

## 来源上下文摘要

- 用户原始意图：在共享 prototype alignment baseline 之后，优先把 Home / Projects 和 Project Agent workspace 的 shell、导航、列表密度、创建入口、状态表达和 copy 气质还原到 HTML 原型；保持小改动、少侵入，不重写 API/client/query/session 逻辑。
- 主动规划上下文：Home / Project shell 是后续 runtime detail 和 resource workspace 对齐的导航/密度基础，必须继承 shared alignment contract、design system note 和 follow-up gaps 规则。
- 当前已知边界：本 change 只对齐 Home、一级 shell、Project Agent workspace、desktop/mobile 导航、Project/Agent 列表密度、Claude/Codex 创建入口和真实状态表达；不新增 Agent history API，不伪造 task summary/recent output/provider metadata，不做 light mode，不新增真实能力。

## ADDED Requirements

### Requirement: Home shell aligns with prototype as the level-one Project entry

系统 SHALL 将 Home / Projects 呈现为一级应用 shell 中的 Project entry，并按 `home.html` 的桌面端与移动端结构优先服务打开已有 Project。

#### Scenario: Desktop Home shows level-one navigation and Projects workspace

- **WHEN** 已认证用户在 desktop `1440x1000` viewport 打开 Home / Projects
- **THEN** 页面展示一级导航与 Projects 工作区结构
- **AND** Projects 是可见 active 一级入口
- **AND** Project 列表是主工作区的主要内容
- **AND** 创建/采用 Project 入口是可发现的低频操作，不以厚表单常驻占据主工作区首屏

#### Scenario: Mobile Home shows level-one bottom navigation and dense Projects content

- **WHEN** 已认证用户在 mobile `390x844` viewport 打开 Home / Projects
- **THEN** 页面使用底部一级导航
- **AND** Projects 是可见 active 一级入口
- **AND** 主工作区优先展示 Projects 内容，不被大段介绍文案、dashboard 式说明或低频创建入口挤占
- **AND** 底部一级导航不遮挡 Projects 列表或空态主行动

### Requirement: Home Project rows remain scannable and real-data bounded

系统 SHALL 让 Home / Projects 中的 Project 条目保持原型强调的可扫读密度，并只展示真实 Project summary 支撑的信息。

#### Scenario: User scans existing Projects

- **WHEN** Home / Projects 加载出一个或多个 Project
- **THEN** 每个 Project 条目展示一致的 Project 图标或标记位置
- **AND** 每个 Project 条目展示 Project 名称和进入对应 Project 控制台的行为
- **AND** 每个 Project 条目最多展示真实路径、真实状态摘要或等价真实辅助信息
- **AND** 条目不通过重复 metadata、厚卡片或长说明降低列表密度

#### Scenario: Project row data is long or sparse

- **WHEN** Project 名称、路径或辅助信息过长，或当前 Project summary 缺少最近打开时间、Git 分支等信息
- **THEN** 页面不发生横向溢出
- **AND** 主要 Project 名称和进入行为仍可识别
- **AND** 系统不伪造最近打开时间、Git 分支、收藏状态或其他未返回字段

### Requirement: Project Agent workspace aligns with project-detail prototype

系统 SHALL 将 Project 默认 Agent workspace 呈现为 `project-detail.html` 对应的 Project 直接二级 workspace，优先展示当前 Agent instances、Claude/Codex 创建入口和真实状态。

#### Scenario: Desktop Project Agent workspace shows secondary navigation and Agent content

- **WHEN** 用户在 desktop `1440x1000` viewport 从 Home 打开某个 Project
- **THEN** 控制台进入该 Project 的 Agent workspace
- **AND** 页面展示 Project 二级导航与 Project workspace 结构
- **AND** Agent 是可见 active 二级入口
- **AND** Files、Git、Terminal 作为同一 Project scope 的二级导航入口可识别，但不挤占 Agent instances 主内容
- **AND** Claude/Codex 创建入口位于 Agent workspace 的主要操作区域

#### Scenario: Mobile Project Agent workspace uses direct-secondary navigation

- **WHEN** 用户在 mobile `390x844` viewport 从 Home 打开某个 Project 或进入 Project Agent workspace
- **THEN** 页面底部展示包含 Back、Agent、Files、Git、Terminal 的二级导航或等价结构
- **AND** Agent 是可见 active 二级入口
- **AND** 页面顶部不重复显示返回一级页面的 Back 控件
- **AND** 底部二级导航不与 Agent 列表、创建入口或状态反馈互相遮挡

### Requirement: Agent instances list preserves current runtime truth

系统 SHALL 在 Project Agent workspace 中把当前 Agent instances 与 future/history 区域区分开，并避免把原型中的 future 信息伪装成真实 runtime 数据。

#### Scenario: Agent sessions exist

- **WHEN** Project 下存在一个或多个 Agent Sessions
- **THEN** Agent workspace 展示当前 Agent instances 列表
- **AND** 每个 Agent instance 条目展示真实 provider、displayName、status、internal session id 和进入 Agent detail 的行为
- **AND** 长 session id、provider metadata 或 displayName 不造成页面级横向溢出
- **AND** 条目保持可扫读密度，不用过多 metadata 或厚卡片挤占首屏

#### Scenario: Provider history is not available

- **WHEN** 当前系统不能读取 Claude/Codex provider history、resume summary 或 recent output
- **THEN** Agent workspace 可以展示轻量 empty、staged 或 future 状态
- **AND** 当前运行实例列表与 provider history / future restore 区域在视觉上可区分
- **AND** 页面不展示可恢复历史条目、recent output、task summary 或 provider-native metadata 作为真实数据

### Requirement: Home and Project non-happy states keep density and recovery

系统 SHALL 保留并统一 Home / Project shell 的 loading、empty、error、disabled 和 dangerous confirmation 状态，使它们符合 prototype density 且不丢失真实恢复路径。

#### Scenario: Project list is loading, empty, or failed

- **WHEN** Home / Projects 的 Project 数据处于加载、空或错误状态
- **THEN** 页面展示对应状态反馈
- **AND** 状态反馈保持 Projects 工作区结构和可扫读密度
- **AND** 空态可以提升创建/采用 Project 为主行动
- **AND** 错误态保留可恢复动作或可见错误信息

#### Scenario: Agent workspace is loading, empty, failed, disabled, or closing

- **WHEN** Agent Sessions 数据或 Agent 创建/关闭能力处于加载、空、错误、禁用、提交中或危险确认状态
- **THEN** Project Agent workspace 展示真实状态反馈
- **AND** Claude/Codex 创建入口可用性清晰可见
- **AND** 关闭 Agent session 等危险动作继续保留确认或克制危险表达
- **AND** 页面不通过伪造 Agent instance 填补空态

### Requirement: Copy and visual density follow console prototype without changing behavior

系统 SHALL 允许 Home / Project shell 轻量调整 copy、标签和状态文案以贴近深色 Server Agent Console 原型，但不得改变行为含义或承诺缺失能力。

#### Scenario: Shell copy is shortened for scanability

- **WHEN** Home / Project shell 中存在过长说明、重复 metadata 或 dashboard 式解释
- **THEN** 页面可以改用更短的 console-style 文案
- **AND** 按钮、状态和空态文案仍表达原有行为含义
- **AND** 不承诺原型里有但真实系统尚不支持的 Agent history、summary、metadata 或恢复能力

### Requirement: Page change artifacts follow shared alignment contract

系统 SHALL 为 Home / Project shell 页面还原保存 shared alignment contract 要求的 desktop/mobile 原型和真实页面证据。

#### Scenario: Home and Project shell alignment is verified

- **WHEN** 本 change 进入验证阶段
- **THEN** artifacts 中包含 `home.html` 的 prototype desktop/mobile 截图和 app desktop/mobile 截图
- **AND** artifacts 中包含 `project-detail.html` 的 prototype desktop/mobile 截图和 app desktop/mobile 截图
- **AND** artifacts 中包含浏览器检查日志，记录 viewport、访问路径、关键结构检查、主要可接受差异和是否存在 blocking difference
- **AND** 如发现缺失 API、原型冲突或本 version 不解决的问题，记录到 `.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md`

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
