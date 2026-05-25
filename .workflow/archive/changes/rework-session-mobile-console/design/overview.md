# Design Overview

本文件汇总 `rework-session-mobile-console` 的设计范围、子域选择和整体设计结论。

## Change

- change-id：rework-session-mobile-console
- 所属 version：v0.5-mobile-ux-polish

## 输入依据

- intents：Terminal/Agent Session detail 移动端需要节省页头、提供返回、避免页面溢出和输入遮挡、快捷键上置、改善重连恢复，并支持 Agent 选择输入。
- specs：`.workflow/changes/rework-session-mobile-console/specs/mobile-session-interaction/spec.md`
- 相关长期 docs：`docs/project.md`、`docs/specs/mobile-session-interaction/spec.md`、`docs/specs/session-runtime/spec.md`、`docs/design/mobile-session-interaction.md`、`docs/design/console-shell.md`
- 现有代码入口：`web/src/routes/SessionDetailRoute.tsx`、`web/src/routes/console-model.ts`

## 设计范围

### 本次覆盖

- Agent/Terminal Session detail 移动端页面外壳：动态视口、紧凑 header、返回 Project 工作区入口、状态展示。
- 终端输出区与输入区的布局关系：输入区参与页面布局，不浮动遮挡输出；输出区在可用区域内滚动并保留最小高度。
- 底部输入区结构：快捷键位于文本输入框上方，文本输入和发送按钮保持可访问。
- 重连/恢复体验：进入详情页先显示 connecting/recovering 状态，避免短暂连接失败立即显示最终失败文案。
- Agent Session 默认快捷键支持方向键和 Enter，用于 CLI 选择项导航。

### 本次不覆盖

- 不新增后端 runtime、WebSocket 协议、metadata 模型或 shared DTO。
- 不引入完整 terminal emulator、ANSI parser、alternate screen、selection/copy、IME 深度适配或 terminal resize observer。
- 不新增快捷键配置 UI、provider-specific key profile 或持久化排序。
- 不实现 provider history/resume 或跨服务器重启恢复。
- 不重做 Project 工作区入口；该边界已由 `rework-project-mobile-workspace` 完成。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | 用户目标和范围已由 intents/specs 清晰表达，且不改变产品能力边界。 |
| ui-ux | 是 | 涉及移动端页面结构、输入区位置、快捷键顺序、返回入口、状态和可恢复性。 |
| frontend | 是 | 需要落到现有 React/TanStack Query/WebSocket/Jotai-less local state 组件边界。 |
| architecture | 否 | 不改变系统架构、runtime 生命周期、WebSocket 协议或服务边界。 |
| api | 否 | 不新增或修改接口契约。 |
| data | 否 | 不新增数据模型、迁移或持久化字段。 |
| business-rules | 否 | 不改变 session close/reconnect/create 的业务语义。 |
| error-handling | 否 | 只调整前端恢复呈现，不新增错误码或后端错误策略。 |
| risks | 否 | 风险可在 ui-ux/frontend 文件中收口，无需单独文件。 |

## 总体设计结论

- Session detail 应从“页面 + fixed bottom input”调整为移动端控制台工作台：紧凑顶部状态栏、输出主区域、输入控制区共同占满动态视口。
- 输入控制区不再浮动遮挡输出，而是在页面 flex 布局底部占位；收起状态仍应保留明确恢复入口。
- Quick keys 应在 textarea 上方横向滚动展示，便于手机上先选择控制键，再编辑/发送普通文本。
- Agent 和 Terminal detail 共享布局组件，但 quick key 集合继续由 `sessionQuickKeys(sessionType)` 区分；Agent 默认集合需要覆盖选择项导航的 Enter。
- 重连失败文案应延迟到实际关闭/错误后出现；进入页面或 retry 期间优先显示 connecting/recovering 状态。

## 关键决策

- 保持单文件 route 内轻量组件重组，不为本 change 新建大型终端组件库。
- 继续使用现有 WebSocket client message、`sendMessage({ type: "input" })` 和 resize 发送路径，不扩展协议。
- 输入区状态继续使用 `SessionDetailRoute.tsx` 局部 state，不放入 Jotai 或 shared DTO。
- 移动端布局以 `min-h-dvh`、`min-h-0`、flex column 和区域滚动为主，避免用页面底部 padding 补偿 fixed panel。

## 开放问题

- 无。

## 后续沉淀候选

- Session detail 移动端工作台布局：紧凑 header / output / inline input controls。
- Agent/Terminal quick key 默认集合与选择输入边界。
- 重连恢复呈现：connecting/recovering 优先于即时失败文案。
