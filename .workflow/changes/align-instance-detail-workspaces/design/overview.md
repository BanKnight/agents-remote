# Design Overview

本文件汇总 `align-instance-detail-workspaces` 的设计范围、子域选择和整体设计结论。

## Change

- change-id：align-instance-detail-workspaces
- 所属 version：v0.8-prototype-ui-alignment

## 输入依据

- intents：Agent / Terminal instance detail 需要与 prototype 对齐：详情页采用 terminal-first 工作区；Agent instance 顶部提供 Files/Git/+Terminal/Meta 等快捷入口，Meta 以浮窗呈现；移动端终端面板支持滚动和输入，底部输入抽屉可展开/收起并提供真实终端快捷键；Terminal instance detail 保持 focused shell，不显示 Files/Git/+Terminal 快捷入口。
- specs：`.workflow/changes/align-instance-detail-workspaces/specs/mobile-session-interaction/spec.md`、`.workflow/changes/align-instance-detail-workspaces/specs/project-console-navigation/spec.md`
- 相关长期 docs：`docs/design/frontend-ui-architecture.md`、`docs/specs/mobile-session-interaction/spec.md`、`docs/design/mobile-session-interaction.md`、`docs/specs/session-runtime/spec.md`、`docs/design/prototype/guidelines.md`、`docs/design/prototype/agent-session-detail.html`、`docs/design/prototype/terminal-instance-detail.html`

## 设计范围

### 本次覆盖

- Agent Session detail 与 Terminal Session detail 的 terminal-first 页面结构和移动端深层 detail chrome。
- Agent detail header 中的 Files、Git、+Terminal、Meta 辅助入口，以及 Meta 轻量浮窗。
- Terminal detail 保持 focused shell：不展示 Agent-only 快捷入口或 provider meta 工具组。
- 移动端 terminal output 与 input drawer 的空间关系、展开/收起和真实 quick keys 呈现。
- 从 Agent detail 派生进入 Files/Git/Terminal 的 contextual navigation 边界。

### 本次不覆盖

- 不新增 provider runtime、session stream protocol、shared DTO 或后端 history/capability 字段。
- 不引入完整 terminal emulator、ANSI parser、xterm.js、IME 深度适配或自定义 quick key 配置。
- 不实现 Files/Git 写操作；Files/Git 仍保持只读 inspection。
- 不重新设计 Project Agent workspace 或 Terminal workspace 列表。
- 不实现真正的 multi-source breadcrumb/history stack；只用当前 route/search 能力表达来源上下文。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | 用户任务明确：在 instance detail 中控制当前 runtime 并从 Agent context 快速进入辅助资源。 |
| ui-ux | 是 | 核心是 terminal-first 结构、deep detail navigation、Agent tools/Meta、Terminal focused shell 和移动端 input drawer。 |
| frontend | 是 | 需要约束现有 `SessionDetailRoute`、TanStack Router、Query/Mutation/WebSocket 状态、quick key model 和 contextual route 接入。 |
| architecture | 否 | 不改变 Agent Runtime、Session Runtime、provider adapter 或系统边界。 |
| api | 否 | 沿用现有 session detail、stream、close、create terminal、Files/Git read-only API。 |
| data | 否 | 不新增持久数据模型或 session metadata 字段。 |
| business-rules | 否 | Agent/Terminal 概念、provider 边界和 close/reconnect 语义已由长期 specs 约束。 |
| error-handling | 否 | 错误与恢复纳入 UI/UX 与 frontend 状态，不单独成域。 |
| risks | 否 | 主要风险集中在导航误导、Terminal detail 混入 Agent tools 和移动端输入遮挡，已在子域记录。 |

## 总体设计结论

- Session detail 是三层模型中的深层/contextual detail；移动端使用顶部返回，底部区域只服务当前 runtime 输入/quick keys，不显示 Project 二级底部导航。
- Agent 与 Terminal detail 共享 terminal-first 主体：紧凑 header、状态 pills、主要 terminal output、input drawer / quick keys、close/reconnect/resize 等运行态动作。
- Agent detail 在 header 辅助区提供 Files、Git、+Terminal、Meta；这些是 Agent context tools，不是 Project 二级导航，也不替代 terminal 主区。
- Terminal detail 保持 focused shell，仅展示返回、状态、close/reconnect/resize 和输入控制；不显示 Files/Git/+Terminal/Meta。
- Meta 使用局部浮窗/弹层展示已有真实字段：provider、displayName、session id、runtime/stream status、Project 等；不发明 provider-native metadata。
- +Terminal 复用现有 create Terminal mutation，创建成功后进入 Terminal detail，并通过 search 中的 source/context 或等价 route state 保留返回 Agent detail 的能力。
- Files/Git contextual entry 第一轮可复用 Project workspace 的 Files/Git 只读实现，但在移动端应表现为 contextual detail：顶部返回 Agent detail，不显示 Project 二级底部导航。若实现成本过高，可在 plan 中先落地入口与路由上下文，再由 resource inspection change 完成深层资源页细化。

## 关键决策

- 本 change 不扩展 session stream 协议；terminal-first 是布局和 chrome 对齐，不是 terminal emulator 技术升级。
- Agent detail 的 contextual tools 只暴露已有真实能力或明确可执行动作：Files/Git 只读查看、+Terminal 创建 shell、Meta 真实 metadata。
- 不把 Agent detail 的工具组复制到 Terminal detail，避免让普通 shell 看起来像 provider-aware Agent runtime。
- 移动端 input drawer 继续使用本地 UI state；不引入 Jotai 或 URL state，因为展开/收起不影响深链或返回恢复。
- 从 detail 返回 Project workspace 时，Agent detail 默认回 `workspace=agents`，Terminal detail 默认回 `workspace=terminal`；Agent-derived Terminal 可以保留来源 Agent context。

## 开放问题

- Files/Git contextual detail 是否在本 change 完整复用现有 Project workspace panel，还是只建立入口和 source context 后由 `align-resource-inspection-pages` 细化，需要在 plan 阶段按实现成本拆任务。

## 后续沉淀候选

- Instance detail 的长期规则：deep detail 顶部返回、底部 runtime input，和 Project 二级导航互斥。
- Agent detail contextual tools 与 Terminal focused shell 的长期差异。
- Meta 浮窗只展示真实 session/provider/project 状态，不伪造 provider-native metadata。
