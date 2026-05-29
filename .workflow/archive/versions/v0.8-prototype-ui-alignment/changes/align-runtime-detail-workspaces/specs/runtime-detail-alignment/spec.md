# runtime-detail-alignment spec

本文件记录 `align-runtime-detail-workspaces` 对 Agent/Terminal runtime detail UI prototype alignment 的行为契约增量。

## Change context

- change-id：align-runtime-detail-workspaces
- 所属 version：v0.8-prototype-ui-alignment
- context：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/context.md

## 来源上下文摘要

- 用户原始意图：细节级还原 Agent detail 与 Terminal detail 的 terminal-first 输出区、输入抽屉、quick keys、移动端返回和 safe-area 行为，并保留 loading、empty、error、disabled、danger confirmation 等非 happy path 状态。
- 主动规划上下文：Agent/Terminal detail 是真实运行态控制面的核心；本 change 需要在不改变 session/runtime 协议、不伪造 output/history、不新增 provider-native metadata 的前提下，对齐 `agent-session-detail.html` 与 `terminal-instance-detail.html`。
- 当前已知边界：Agent detail 可以展示 Files/Git/+Terminal/Meta contextual tools；Terminal detail 必须保持 focused shell，不显示 Agent-only tools；移动端 runtime detail 使用顶部返回并隐藏 Project 二级底部导航。

## ADDED Requirements

### Requirement: Runtime detail pages SHALL remain deep contextual detail pages

系统 SHALL 将 Agent detail 与 Terminal detail 呈现为深层/contextual runtime detail，而不是 Project 直接二级 workspace。

#### Scenario: Agent detail is opened on desktop

- **WHEN** 用户从 Project Agent workspace 进入某个 Agent Session detail
- **THEN** 页面显示顶部返回入口、Agent/provider 标识、真实 displayName、runtime status 与 transport status
- **AND** 页面主体优先展示 terminal-first 输出区和输入控制区
- **AND** 页面不显示 Project 二级左侧导航作为当前层级导航

#### Scenario: Runtime detail is opened on mobile

- **WHEN** 用户在移动端打开 Agent detail 或 Terminal detail
- **THEN** 页面使用顶部返回入口表达回到来源页面
- **AND** 页面不显示 Project 二级底部导航
- **AND** 页面底部区域只服务当前 runtime 的输入抽屉、quick keys 或其收起恢复入口

### Requirement: Agent detail SHALL expose contextual tools without displacing terminal-first work

系统 SHALL 在 Agent detail 中保留 Files、Git、+Terminal、Meta 等 Agent contextual tools，但这些工具不得替代或挤占 terminal-first 主任务。

#### Scenario: Agent detail contextual tools are rendered

- **WHEN** Agent detail 页面渲染 header actions
- **THEN** 用户可以看到 Files、Git、+Terminal、Meta 或等价短标签入口
- **AND** 这些入口属于 Agent context 派生工具，不是 Project 二级导航
- **AND** 主要可视区域仍由 terminal output、runtime status 和 input drawer 主导

#### Scenario: Agent meta is inspected

- **WHEN** 用户打开 Agent detail 的 Meta 信息
- **THEN** 页面只展示真实可用的 project、session、provider、runtime status、transport status 或 stream 相关字段
- **AND** 不伪造 provider-native thread、history、transcript、task summary 或 recent output

### Requirement: Terminal detail SHALL remain a focused shell

系统 SHALL 将 Terminal detail 呈现为 focused shell，只保留普通 Terminal Session 所需的返回、状态、关闭/重连和输入输出能力。

#### Scenario: Terminal detail is rendered

- **WHEN** 用户打开某个 Terminal Session detail
- **THEN** 页面显示 Terminal 标识、displayName、runtime status 与 transport status
- **AND** 页面展示 terminal-first output 和 input drawer
- **AND** 页面不显示 Agent-only Files、Git、+Terminal、Meta 或 provider metadata

#### Scenario: Terminal detail close is available

- **WHEN** 用户在 Terminal detail 请求关闭 Terminal Session
- **THEN** 系统保留危险确认语义
- **AND** 确认文案表达关闭会终止底层 runtime
- **AND** 取消关闭后仍停留在当前 detail 并保持可恢复输入状态

### Requirement: Runtime detail output SHALL be terminal-first and scroll-safe

系统 SHALL 让 Agent/Terminal detail 的 terminal output 成为主内容，并在桌面端与移动端都保持局部滚动、长行处理和可读 terminal typography。

#### Scenario: Runtime output overflows the visible area

- **WHEN** terminal output 内容超过可见输出区域
- **THEN** 输出区自身可以滚动
- **AND** header、input drawer、quick keys 或 mobile safe-area 不遮挡输出区最后内容
- **AND** 长路径、session id、命令输出或 prompt 不造成页面横向溢出

#### Scenario: Runtime output is sparse or unavailable

- **WHEN** 当前 stream 暂无输出、正在连接、连接断开或 runtime 已结束
- **THEN** 页面使用真实 loading、empty、recovering、disconnected 或 ended 状态表达
- **AND** 不为了贴近原型伪造 terminal output、history 或 provider response

### Requirement: Input drawer SHALL participate in runtime detail layout

系统 SHALL 将 Agent/Terminal detail 的 input drawer 作为页面布局的一部分，而不是 fixed/floating 覆盖 terminal output 的浮层。

#### Scenario: Input drawer is expanded

- **WHEN** 用户打开 runtime detail 且 stream/runtime 可交互
- **THEN** 页面显示 textarea 或等价输入控件、Send 行为和 quick keys
- **AND** output 区按照剩余高度滚动
- **AND** input drawer 不遮挡 output 内容

#### Scenario: Input drawer is collapsed on mobile

- **WHEN** 用户在移动端收起 input drawer
- **THEN** 页面保留明确的恢复入口
- **AND** 收起状态不关闭 WebSocket、不清空已输入文本、不改变 runtime 生命周期
- **AND** quick keys 可保留为紧凑操作区，但仍不得与 Project 二级底部导航共存

### Requirement: Quick keys SHALL reflect real stream input semantics

系统 SHALL 展示并发送真实支持的 quick key/control sequence，且 Agent 与 Terminal detail 可以使用不同默认集合但共享交互语义。

#### Scenario: User presses a quick key

- **WHEN** 用户点击 Esc、Ctrl+C、Ctrl+D、Enter、方向键或 Shift+Tab 等 quick key
- **THEN** 系统向当前 stream 发送对应真实 control sequence
- **AND** 该动作不写入 textarea，也不要求用户再点击 Send
- **AND** stream 未 connected、runtime ended 或 close pending 时 quick keys 禁用或表达不可发送状态

#### Scenario: Agent quick keys are displayed

- **WHEN** Agent detail 展示 quick keys
- **THEN** 默认集合覆盖 provider CLI 导航需要的 Enter、上下方向键和 mode/selection 类操作
- **AND** 不暗示第一轮已经提供用户自定义快捷键、provider capability discovery 或持久化排序

### Requirement: Runtime detail SHALL preserve existing lifecycle and transport recovery states

系统 SHALL 在原型对齐后继续清晰区分 runtime status、transport status、reconnect 和 close pending 行为。

#### Scenario: Transport disconnects while runtime exists

- **WHEN** Agent/Terminal detail 的 WebSocket 或 stream transport 断开但底层 runtime 仍存在
- **THEN** 页面显示连接断开或 recovering 状态
- **AND** 页面提供重新连接入口
- **AND** 重连成功后回到同一 internal session id 的 terminal output/input 语义

#### Scenario: Runtime has ended

- **WHEN** detail 页面发现底层 runtime 已不存在或已结束
- **THEN** 页面表达 ended/missing 状态并提供返回来源或列表入口
- **AND** input、Send 和 quick keys 不再表现为可发送

### Requirement: Runtime detail alignment SHALL keep artifacts and gaps traceable

系统 SHALL 为 Agent detail 与 Terminal detail 的 prototype alignment 保存可审查 artifacts，并把能力/API 缺口记录到 version shared gaps。

#### Scenario: Runtime detail change is verified

- **WHEN** 本 change 进入 verify 阶段
- **THEN** artifacts 包含 Agent detail prototype/app desktop/mobile screenshot、Terminal detail prototype/app desktop/mobile screenshot 和 browser check log
- **AND** browser check log 记录顶部返回、Project 二级导航互斥、terminal-first output、input drawer、quick keys、Agent-only tools 边界和 Terminal focused shell 边界

#### Scenario: Prototype shows unsupported capability

- **WHEN** 原型区域需要当前真实 API、runtime 或 provider 能力不支持的字段或操作
- **THEN** 页面使用真实 empty、disabled、staged 或 future 状态表达
- **AND** 缺口记录到 `.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md`
- **AND** 不通过伪造数据、伪造 output、伪造 provider metadata 或新增范围外 API 来补视觉完整度

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
