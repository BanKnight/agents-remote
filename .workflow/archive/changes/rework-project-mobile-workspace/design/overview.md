# Design Overview

本文件汇总 `rework-project-mobile-workspace` 的设计范围、子域选择和整体设计结论。

## Change

- change-id：rework-project-mobile-workspace
- 所属 version：v0.5-mobile-ux-polish

## 输入依据

- intents：Project 详情页移动端参考原型工作区主界面；顶部返回；从上到下组织功能区（Git/Files）、Agent 区、Terminal 区；移除不合理常驻底部 runtime input；自动撑满视口并避免页面滚动条。
- specs：`.workflow/changes/rework-project-mobile-workspace/specs/project-console-navigation/spec.md`
- 相关长期 docs：`docs/project.md`、`docs/specs/project-console-navigation/spec.md`、`docs/specs/pwa-console-shell/spec.md`、`docs/specs/session-runtime/spec.md`、`docs/design/console-shell.md`、`docs/design/mobile-session-interaction.md`、`docs/design/frontend-stack.md`

## 设计范围

### 本次覆盖

- Project console 移动端从“侧栏 + 长页面 + 右栏面板”重排为 Project 工作区主界面。
- 移动端顶部提供返回 Project 列表入口和当前 Project 上下文。
- 移动端主内容按功能区（Files/Git）、Agent Sessions 区、Terminal Sessions 区组织。
- 移除 Project console 移动端常驻底部 runtime input 面板，输入控制保留给 Agent/Terminal Session detail。
- 建立 Project 工作区移动端视口撑满和局部滚动边界。

### 本次不覆盖

- 不新增或修改 Agent/Terminal 后端 runtime、WebSocket、输入发送、重连、关闭语义。
- 不重做 Session detail 移动输入、快捷键、选择输入或重连体验。
- 不重做 Files/Git 的只读列表/详情信息密度；本 change 只提供 Project 工作区的入口级功能区。
- 不新增 provider history/resume、完整 terminal emulator、PWA service worker 或桌面专属重设计。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 是 | 需要明确 Project 工作区作为移动端主界面的用户路径和产品边界。 |
| ui-ux | 是 | 需要定义移动端页面结构、区域顺序、返回入口、局部滚动和状态呈现。 |
| frontend | 是 | 需要将布局落到现有 React/Tailwind/TanStack Query/Jotai 边界，并约束不改 API。 |
| architecture | 否 | 不改变系统架构、服务边界或 runtime 生命周期。 |
| api | 否 | 不新增或修改 API 契约。 |
| data | 否 | 不新增数据模型、迁移或持久化字段。 |
| business-rules | 否 | 不改变 Project、Agent Session、Terminal Session、Files/Git 的业务规则。 |
| error-handling | 否 | 复用现有 query/mutation error 展示，不新增错误码或恢复策略。 |
| risks | 否 | 风险在 product/ui-ux/frontend 中已可收口，无需单独文件。 |

## 总体设计结论

- Project console 移动端应像工作区首页：顶部紧凑显示返回和 Project 上下文，主体由固定优先级的入口区组成。
- Files/Git 是顶部功能区，面向只读检查和 Project 辅助能力发现；Agent Sessions 与 Terminal Sessions 各自独立成区，分别展示创建入口、运行列表、空态和错误态。
- 移动端不再显示底部常驻 runtime input 面板；输入说明降级为区域内轻量文案，真实输入只在 Session detail 中出现。
- 桌面端保留现有侧栏/双栏思路，但可共享移动端重新拆出的区域组件和数据流。

## 关键决策

- 以移动端为主结构，桌面端做增强，而不是保留桌面侧栏结构后用响应式勉强堆叠。
- 不把 Files/Git 入口藏在侧栏；移动端显式展示为顶部功能区，满足用户先检查文件/Git 再进入运行区的工作区心智。
- Agent 与 Terminal 区都使用真实 session 数据和现有 create/close 行为，不伪造 mock 内容。
- 去除 Project console shell-level 底部 input，避免与 Session detail 的移动输入设计冲突。

## 开放问题

- 无需用户确认即可进入 plan-change；实现阶段应根据现有 `ProjectConsoleRoute.tsx` 做最小重组。

## 后续沉淀候选

- Project console 移动工作区的长期信息架构：顶部返回/Project 上下文、功能区、Agent 区、Terminal 区。
- Project console 与 Session detail 的输入职责边界：Project 工作区不常驻 runtime input，Session detail 承载真实输入。
