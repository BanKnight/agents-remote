# Design Overview

本文件汇总 `implement-mobile-session-interaction` 的设计范围、子域选择和整体设计结论。

## Change

- change-id：implement-mobile-session-interaction
- 所属 version：v0.3-session-runtime-quality

## 输入依据

- intents：用户希望 Agent/Terminal 详情页在手机上真实可用；底部区域服务输入、快捷键、展开/收起，不使用底部 Tab；多行输入需要显式发送；快捷键直接发送控制序列；默认快捷键先按 Agent/Terminal 代码内配置区分；终端显示第一步要手机可读且横屏不坏。
- specs：`specs/mobile-session-interaction/spec.md`
- 相关长期 docs：
  - `docs/specs/session-runtime/spec.md`
  - `docs/specs/pwa-console-shell/spec.md`
  - `docs/design/session-runtime-boundaries.md`
  - `docs/design/console-shell.md`
  - `docs/design/frontend-stack.md`
- 代码现状：`web/src/routes/SessionDetailRoute.tsx` 已有 Agent/Terminal detail route、WebSocket stream、textarea 发送、resize、reconnect、close；`web/src/routes/ProjectConsoleRoute.tsx` 的 shell-level 底部输入提示不发送真实输入。

## 设计范围

### 本次覆盖

- Session Detail 页面在移动端的布局重排：header/status、terminal output、底部输入/快捷键区域、辅助 controls。
- 底部 input panel 默认展开、一键收起和明显恢复入口。
- 多行辅助输入：Enter 换行、Send 按钮显式发送、空白输入不发送。
- Agent/Terminal 默认快捷键集合与排序，快捷键按钮直接发送控制序列。
- 连接断开、runtime ended、loading/error/closing 等不可发送状态。
- 不新增依赖的第一轮终端可读性：继续使用现有 stream text/pre 容器，改善字体、字号、行高、滚动和 viewport 占用。

### 本次不覆盖

- 不引入 `xterm.js` 或其他 terminal emulator 依赖；真实 emulator、fit addon、ANSI parsing、selection/copy、IME 细节留到后续技术设计。
- 不修改 Session HTTP API、WebSocket envelope 或后端 runtime 行为。
- 不实现快捷键配置界面、持久化用户偏好或 provider-specific key profile API。
- 不实现复杂横屏布局、手势恢复、虚拟键盘高度检测或全屏 terminal mode。
- 不改变 Project Console 的全局导航结构；本次只避免 Session Detail 底部被全局 Tab 占用。

## 子域选择

| 子域           | 是否创建 | 原因                                                                              |
| -------------- | -------- | --------------------------------------------------------------------------------- |
| product        | 否       | 用户任务和非目标已在 specs 中明确，本轮无需新增产品流程。                         |
| ui-ux          | 是       | 需要明确移动端详情页信息层级、底部面板、快捷键和状态反馈。                        |
| frontend       | 是       | 需要明确 React/TanStack/Jotai/Tailwind 下的组件边界、本地状态和 stream 发送逻辑。 |
| architecture   | 否       | 不改变 Session Runtime、Agent Runtime 或 API 架构。                               |
| api            | 否       | 继续复用现有 WebSocket input/resize/ping envelope，无新增接口。                   |
| data           | 否       | 不新增持久数据模型或用户偏好存储。                                                |
| business-rules | 否       | 快捷键集合是前端默认配置，不形成独立业务规则。                                    |
| error-handling | 否       | 错误/断连状态在 ui-ux/frontend 中覆盖即可。                                       |
| risks          | 否       | 风险集中在 ui-ux/frontend 文件中，不单独建风险文件。                              |

## 总体设计结论

- Session Detail 页面应从“桌面卡片 + 侧栏”调整为移动端优先的运行态工作台：顶部保留上下文和状态，中间终端输出尽量占用可视高度，底部 sticky/fixed panel 承担输入与快捷键。
- 第一轮不新增 terminal emulator 依赖；在现有 text stream 基础上用可读等宽字体、合适行高、横向滚动和 viewport 高度约束提升手机可用性。
- 输入分两条路径：普通文本在多行 textarea 编辑后由 Send 按钮一次性发送；快捷键按钮直接发送 control sequence，不写入 textarea。
- Agent 与 Terminal 使用不同的默认 quick key 配置，但共享同一个渲染/发送组件；后续如需用户配置，再把配置提升为持久化能力。
- 发送能力由 `connectionStatus === "connected"` 且 runtime 未 ended 控制；断连时保留输入内容并提供 Reconnect，ended 时禁用输入/快捷键并提示返回 Project console。

## 关键决策

- 不新增 `xterm.js`：当前项目没有该依赖，新增 terminal emulator 需要 dependency safety、ANSI/fit/IME/scrollback 设计和浏览器验证；本 change 的第一轮目标可由现有 stream text 容器满足。
- 底部 panel 使用本页面本地状态或 Jotai 局部 UI state 均可；由于状态只影响当前 detail 页面，优先用组件本地 state，避免扩大全局状态。
- 快捷键配置写成前端纯函数/常量，并通过测试覆盖 Agent/Terminal 差异、排序和控制序列。
- 保留现有 `resize` action，但不要把固定 `120×40` 当成移动端主路径；如保留按钮，应作为辅助 control，不能比输入/快捷键更突出。

## 开放问题

- 后续是否引入 `xterm.js`、`@xterm/addon-fit` 或 provider-native renderer，需要单独技术调研和依赖安全评估。
- control sequence 覆盖到什么程度需要根据真实手机操作继续扩展；第一轮只做常用固定集合。
- 移动端软键盘遮挡和 viewport resize 的真实体验需要 E2E 或真机进一步验证。

## 后续沉淀候选

- `docs/design/mobile-session-interaction.md`：沉淀 Session Detail 移动端结构、底部输入/快捷键交互和不可发送状态。
- `docs/design/frontend-stack.md`：如实现确认了 detail 页面本地 state/快捷键配置模式，可补充具体规则。
