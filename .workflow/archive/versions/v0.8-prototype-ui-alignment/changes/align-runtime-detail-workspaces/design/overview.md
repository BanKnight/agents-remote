# Design Overview

本文件汇总 `align-runtime-detail-workspaces` 的设计范围、子域选择和整体设计结论。

## Change

- change-id：align-runtime-detail-workspaces
- 所属 version：v0.8-prototype-ui-alignment

## 输入依据

- context：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/context.md
- specs：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/specs/runtime-detail-alignment/spec.md
- version shared：.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md；design-system-note.md；follow-up-gaps.md
- 相关长期 docs：docs/project.md；docs/design/prototype/guidelines.md；docs/design/frontend-ui-architecture.md；docs/design/mobile-session-interaction.md；docs/specs/session-runtime/spec.md；docs/specs/agent-provider-experience/spec.md；docs/architecture/session-runtime.md；docs/architecture/agent-runtime.md
- prototype：docs/design/prototype/agent-session-detail.html；docs/design/prototype/terminal-instance-detail.html
- 当前代码入口：web/src/routes/SessionDetailRoute.tsx；web/src/components/shell/shell-layout.tsx；web/src/components/shell/shell-navigation.tsx；web/src/components/shell/shell-primitives.tsx

## 设计范围

### 本次覆盖

- Agent Session detail 与 Terminal Session detail 的 desktop/mobile prototype alignment。
- 深层 runtime detail 页面层级：顶部返回、状态、terminal-first output、input drawer、quick keys、危险关闭与恢复入口。
- Agent detail contextual tools：Files、Git、+Terminal、Meta 的保留、位置和能力边界。
- Terminal detail focused shell：不显示 Agent-only tools，不展示 provider metadata。
- 现有 SessionDetailRoute 的组件边界、shared shell primitives 消费和 route-local 状态整理。
- Browser verify artifacts 的设计要求：Agent/Terminal prototype/app desktop/mobile screenshot 与 browser check log。

### 本次不覆盖

- 不改变 session/runtime API、WebSocket message 协议、shared DTO 或 provider adapter。
- 不新增 provider-native metadata、history、task summary、recent output、transcript 或 resume capability。
- 不新增 xterm.js、ANSI parser、terminal fit addon、快捷键配置或完整 terminal emulator。
- 不扩展 Files/Git 能力；Agent contextual Files/Git 只保留只读 inspection 边界。
- 不新增 PWA offline、notification、service worker 或 light mode。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | 用户任务和能力边界已由 context、spec、长期 session/runtime docs 覆盖；本 change 不新增产品能力。 |
| ui-ux | 是 | 需要明确 runtime detail 的页面结构、terminal-first 信息层级、移动端返回、input drawer 和状态表达。 |
| frontend | 是 | 需要明确现有 React route 的组件边界、shared shell primitive 复用、状态归属和验证入口。 |
| architecture | 否 | 不改变系统架构、runtime adapter、API 或协议；沿用长期架构文档。 |
| api | 否 | 不新增或修改 API 契约。 |
| data | 否 | 不新增数据模型、迁移或持久化。 |
| business-rules | 否 | 不新增业务规则；只保持 session lifecycle 与 close confirmation 既有语义。 |
| error-handling | 否 | 错误/恢复状态在 ui-ux/frontend 中覆盖，不需要独立错误策略文件。 |
| risks | 是 | 需要集中收口原型视觉、真实能力边界、input drawer/safe-area、组件抽象和 artifacts 风险。 |

## 总体设计结论

- Runtime detail 是深层/contextual detail，不能继续表现成独立 dashboard；移动端不显示 Project 二级底部导航，底部区域归 input drawer 和 quick keys。
- Agent 与 Terminal detail 共享 terminal-first 主体、input drawer、quick key、status、notice 和危险关闭控制，但 header actions 依据 session type 分叉。
- Agent detail 可以保留 contextual Files/Git/+Terminal/Meta；Terminal detail 必须保持 focused shell，只显示返回、状态、Reconnect/Resize/Close 和输入输出。
- 当前 `SessionDetailRoute.tsx` 已有运行态能力与局部组件，但视觉 surface、header/input/output 结构应继承 `web/src/components/shell/` 的共享 primitives，不再 route-local 散写另一套颜色、圆角、按钮和状态层级。
- Input drawer 参与全高布局，不使用 fixed/floating 覆盖输出；移动端 collapsed 状态只改变可视结构，不关闭 stream、不清空输入。
- Prototype 中缺少真实支持的数据或 provider-native 元信息时，用真实 empty/disabled/staged 表达并记录 gaps，不伪造。

## 关键决策

- 以现有 route 和 session stream 数据流为边界，只做 UI 结构、组件边界和视觉对齐，不碰 runtime 协议。
- 先抽取或复用 `TerminalOutput`、`SessionInputDrawer`、`QuickKeyBar`、`SessionDetailHeader`、contextual tool/action/status 等稳定 UI 单元；抽象进入 shared shell 组件的前提是真实跨 Agent/Terminal detail 或后续 resource detail 复用。
- Header 使用 compact runtime chrome：返回 + marker + title/status；低频 meta 用 overlay/local popover，不常驻挤占 output。
- Verify 必须分别覆盖 Agent detail 和 Terminal detail 的 desktop/mobile 原型与 app，并检查 Terminal detail 无 Agent-only tools。

## 开放问题

- 当前真实服务是否有足够容易创建/进入的 Agent 和 Terminal instances 用于 app screenshot；如果没有，verify 需要使用现有可控 API fixture 或记录环境前置。
- `Resize 120×40` 是否应保持在可见控制中还是降级为次要操作，需实现时按 prototype 与现有功能折中。

## 后续沉淀候选

- 经验证后，可沉淀到 docs/design/mobile-session-interaction.md：input drawer 与 mobile detail chrome 的最终实现约束。
- 经验证后，可沉淀到 docs/design/frontend-ui-architecture.md：runtime detail 共享 primitive 和 Agent/Terminal detail 分叉边界。
