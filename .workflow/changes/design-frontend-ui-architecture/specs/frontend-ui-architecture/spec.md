# frontend-ui-architecture spec

本文件记录 `design-frontend-ui-architecture` change 对 `frontend-ui-architecture` 的行为契约增量。

## Change 来源

- change-id：design-frontend-ui-architecture
- 来源意图：先建立前置 frontend UI architecture / prototype alignment change，将 `docs/design/prototype/` 的原型体系转译为真实 Web UI 后续对齐 changes 可复用的导航层级、路由结构、页面布局、组件边界、响应式规则和视觉基线。
- 规划来源：本 change 直接承接用户原始意图，是 `v0.8-prototype-ui-alignment` 的先导 change。

## ADDED Requirements

### Requirement: Prototype alignment sources are ordered explicitly

系统 SHALL 明确声明本轮 UI/UX 对齐的来源优先级，使后续 changes 在 prototype、长期设计文档和现有实现之间出现差异时有一致判断依据。

#### Scenario: A downstream UI alignment change starts design work

- **WHEN** 后续 UI alignment change 需要判断目标导航、布局、组件或视觉基线
- **THEN** 该 change 可以引用本 change 产物中的来源优先级
- **AND** 来源优先级以 `docs/design/prototype/guidelines.md`、prototype HTML、prototype screenshots 为最高优先级
- **AND** 旧长期设计文档只作为背景和约束使用

### Requirement: Navigation hierarchy is specified for desktop and mobile

系统 SHALL 为真实 Web UI 提供可验证的一级导航、Project 二级导航和深层详情页导航层级契约，并覆盖桌面端与移动端差异。

#### Scenario: A page alignment change evaluates navigation structure

- **WHEN** 后续 change 对齐 Home、Project、Agent detail、Files、Git 或 Terminal 页面
- **THEN** 该 change 可以判断页面属于一级页面、Project 直接二级页面或深层详情页
- **AND** 桌面端导航位置与移动端导航/返回模式有明确目标
- **AND** 移动端直接二级页与深层详情页不会同时保留互相冲突的返回入口

### Requirement: Route hierarchy is mapped to product workspaces

系统 SHALL 把 prototype 中的页面层级映射为真实 Web UI 的 route/workspace 层级，使后续页面实现不会把一级入口、Project scope 和 session/resource detail 混在同一页面职责中。

#### Scenario: A downstream change adds or adjusts a route

- **WHEN** 后续 change 需要修改 Home、Project Agent workspace、resource page 或 instance detail 的路由入口
- **THEN** 本 change 产物提供该 route 所属层级和 workspace 职责
- **AND** Project-scoped 页面保留 Project 上下文
- **AND** session/detail 页面承载当前上下文的主要操作或 inspection 内容，而不是复用 Project workspace 的 shell-level 输入职责

### Requirement: Page layout and component boundaries are defined before page-level alignment

系统 SHALL 定义跨页面共享的布局区域和组件边界，供后续 changes 判断哪些 UI 应共享、哪些 UI 应保持页面局部职责。

#### Scenario: A downstream change aligns a page layout

- **WHEN** 后续 change 需要调整 navigation shell、workspace header、list row、card、status pill、terminal panel、resource preview 或 input drawer
- **THEN** 本 change 产物提供这些区域的边界和目标用途
- **AND** 后续 change 可以避免为每个页面重复创建相互冲突的导航、状态、列表和操作结构

### Requirement: Responsive rules include mobile return and density expectations

系统 SHALL 定义 prototype alignment 的响应式规则，尤其是移动端直接二级页、深层详情页、底部导航、顶部返回和内容密度要求。

#### Scenario: A downstream change verifies mobile alignment

- **WHEN** 后续 change 在手机尺寸视口检查页面结构
- **THEN** 可以验证页面是否使用正确层级的底部导航或顶部返回
- **AND** 首屏不会被大段说明、重复 metadata 或低频操作占据
- **AND** 主要内容区域和输入/详情区域不会互相遮挡

### Requirement: Visual baseline is defined without pixel-perfect commitment

系统 SHALL 为后续 changes 提供基础视觉语言对齐要求，同时明确本轮目标不是像素级完全一致。

#### Scenario: A downstream change reviews visual alignment

- **WHEN** 后续 change 对齐真实 UI 与 prototype screenshots
- **THEN** 可以检查深色 console 气质、图标语言、卡片/列表密度、按钮、状态标签、边框、间距和主要行动色是否符合同一视觉基线
- **AND** 不因像素级差异阻塞结构正确的实现
- **AND** 明显破坏信息层级、导航识别或移动端密度的差异需要记录为待修正问题

### Requirement: Distillation boundary is preserved until validation

系统 SHALL 保持本 change 的设计产物先位于 workflow change 内，并在整轮 prototype alignment 验证后再按需沉淀为长期 `docs/design/`。

#### Scenario: This change completes design before downstream implementation

- **WHEN** `design-frontend-ui-architecture` 完成 design 产物
- **THEN** 产物保存在 `.workflow/changes/design-frontend-ui-architecture/design/` 下
- **AND** 后续 changes 可以引用它作为工作流上下文
- **AND** 在 `verify-prototype-ui-alignment` 验证前不把未验证结论直接写入长期 docs

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
