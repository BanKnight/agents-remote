# Frontend Design

## Change

- change-id：implement-mobile-session-interaction

## 前端范围

- 技术栈：React 19 + TypeScript + Vite + TanStack Router + TanStack Query + Jotai + Tailwind CSS。
- 修改核心：`web/src/routes/SessionDetailRoute.tsx` 的布局、输入区、quick keys、发送禁用状态和可测试 view model/helper。
- 测试范围：`web/src/routes/console-model.test.ts` 或新增 session detail model 测试，覆盖 quick key 配置、control sequence、发送文本规范化和 disabled 判断。
- 不修改 `packages/shared` stream envelope，不修改 API client 路径，不新增 npm 依赖。

## 模块划分

- `SessionDetailRoute.tsx` 保持 route/page 入口，负责加载 detail、建立 WebSocket、发送 stream message、close/reconnect 和组合 UI。
- 新增或扩展 `console-model.ts` 中的纯函数/常量，放置：
  - Agent/Terminal quick key 默认集合与排序。
  - quick key label、aria label、sequence。
  - `canSendToSession(connectionStatus, closePending?)` 之类的发送可用性判断。
  - `normalizeSessionTextInput(input)`：全空白不发送，非空输入按需要补末尾换行。
- 如果 `SessionDetailRoute.tsx` 过长，可在同文件内拆 `TerminalOutputPane`、`MobileInputPanel`、`QuickKeyBar` 等局部组件；不急于建立新目录。

## 组件边界

- `SessionDetail`：页面级容器，持有 query/mutation/WebSocket/local UI state，向子组件传入 session context、status、output 和 send callbacks。
- `TerminalOutputPane`：只展示 output、loading/empty/ended/error notice 和 terminal-like 容器样式；不直接发送 input。
- `MobileInputPanel`：持有 textarea 展示、展开/收起 UI、Send 按钮和 QuickKeyBar；通过 `onSendText` / `onSendSequence` 回调发送。
- `QuickKeyBar`：根据 sessionType 渲染默认 quick keys；按钮点击后直接回调 sequence；不修改 textarea。
- `SessionControls`：承接 Back/Reconnect/Close/Resize 等辅助动作；Close 保持确认。

## 状态管理

- 服务端状态：继续由 TanStack Query 获取 Agent/Terminal detail，close 成功后移除 detail query 并 invalidate Project/session lists。
- Stream 状态：继续用组件内 state 管理 `connectionStatus`、`streamError`、`sessionStatus`、`output`、`reconnectKey`。
- 表单状态：textarea 内容继续为组件内 state；发送成功后清空，发送失败或 disconnected 时保留。
- 交互状态：bottom input panel 展开/收起优先使用组件内 `inputPanelOpen`，默认 `true`；不持久化到 Jotai。
- 全局状态：不新增；Project Console 的 `inputPanelOpenAtom` 不复用于 Session Detail，避免 shell-level hint 与 detail-level input 状态耦合。

## 路由 / 页面接入

- 现有 Agent/Terminal detail routes 保持不变：
  - `/projects/$projectName/agent-sessions/$sessionId`
  - `/projects/$projectName/terminal-sessions/$sessionId`
- 页面仍通过 `sessionStreamUrl(projectName, sessionType, sessionId)` 建立 WebSocket。
- Client → server 仍只发送现有 stream envelope：
  - 普通文本：`{ type: "input", data }`
  - 快捷键：`{ type: "input", data: sequence }`
  - resize：`{ type: "resize", cols, rows }`
- 不新增 URL 参数、loader、API endpoint 或 shared DTO。

## 工程约束

- 不新增 npm 依赖；特别是不在本 change 引入 `xterm.js`。
- Tailwind class 优先完成布局和状态；不新增 CSS 文件，除非出现 Tailwind 无法表达的移动 viewport 问题。
- 纯函数优先放到可单测模块，避免只能通过浏览器验证 quick key sequence。
- UI 改动后必须运行 web/unit tests、workspace quality gate，并用浏览器验证手机竖屏 golden path：打开 session detail、输入多行、发送、快捷键、收起/展开、断连/禁用状态可见。

## 关键决策

- 发送文本时沿用当前行为：如果非空且末尾没有换行，则补 `\n`，保持 shell/CLI 执行直觉；但全空白输入不发送。
- 快捷键 sequence 使用常见 terminal 控制序列，例如 Ctrl+C ``、Esc ``、Tab `\t`、方向键 `[A/B/C/D`。
- Agent 默认快捷键优先包含 Interrupt、Esc、Tab、Enter、方向键；Terminal 默认快捷键优先包含 Ctrl+C、Ctrl+D、Esc、Tab、方向键。最终集合由实现任务按测试固定。
- Bottom panel collapsed 状态不关闭 WebSocket、不清空 textarea；只改变可视区域。

## 风险与权衡

- 不引入 xterm 会让 terminal output 仍是 text snapshot，不是完整 terminal emulator；这是本 change 为控制 scope 和依赖风险做出的明确取舍。
- quick key sequence 单元测试能证明发送数据正确，但真实 provider 对 sequence 的解释仍需要 E2E/手动 smoke。
- fixed bottom panel 和 mobile keyboard 行为可能受浏览器差异影响，verify 阶段需要浏览器视口验证，不能只依赖 unit tests。

## 开放问题

- 后续是否需要把 quick key 配置迁移到用户配置或 provider capability。
- 后续是否需要 session detail 专用 xterm renderer、fit addon 和 resize observer。
- 是否需要把 mobile input panel 抽成跨页面组件，等 Files/Git 或其他 detail 页面出现真实复用后再判断。

## 后续沉淀候选

- `docs/design/mobile-session-interaction.md`：Session Detail 移动端布局和输入/快捷键交互。
- `docs/design/frontend-stack.md`：如果本 change 验证通过，可补充 detail 页面本地 UI state 与 quick key model 的规则。
