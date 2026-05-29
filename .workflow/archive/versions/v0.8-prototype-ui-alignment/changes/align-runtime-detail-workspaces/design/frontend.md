# Frontend Design

## Change

- change-id：align-runtime-detail-workspaces

## 前端范围

- 修改范围主要是 `web/src/routes/SessionDetailRoute.tsx` 与必要的 `web/src/components/shell/` primitive 扩展。
- 可按需补充或调整 `web/src/routes/console-model.ts` / `console-model.test.ts` 中 quick key 或 status view model 的测试覆盖。
- 不修改 `web/src/api/client.ts`、shared DTO、route definitions 或 session WebSocket 协议，除非实现中发现现有 UI 无法表达已存在的真实状态。

## 模块划分

- Route 容器：继续由 `AgentSessionDetailRoute` / `TerminalSessionDetailRoute` 解析 params/search，并传入通用 `SessionDetail`。
- Data/stream 边界：`SessionDetail` 保持 TanStack Query 加载 detail、WebSocket stream、close/create terminal/reconnect mutation 的 owner。
- View composition：拆分或整理为 header、terminal output、input drawer、quick key bar、notice、contextual panels、meta overlay 等 UI 单元。
- Shell primitive 层：复用 `ActionButton`、`IconMarker`、`StatusPill`、`ShellInput`、`shellSurfaceClasses` 等已验证组件；如果 terminal panel/input drawer 在本 change 内跨 Agent/Terminal detail 稳定复用，可以在 `shell-primitives.tsx` 增加窄 primitive，但不要扩展成通用设计系统。

## 组件边界

- `SessionDetail`：只负责数据、stream、mutation、局部状态组合；不散写大量 Tailwind surface roles。
- `SessionDetailHeader`：负责 compact runtime chrome，接收 session type/provider/status/controls；内部明确 Agent tools 与 Terminal controls 的分支。
- `RuntimeTerminalPanel` 或当前 `TerminalOutput`：负责 titlebar、output scroll、empty output 文案和 terminal typography；不负责 stream 连接。
- `SessionInputDrawer`：负责 expanded/collapsed、textarea、Send、quick keys 可用性；不负责 normalize/send 的业务判断。
- `QuickKeyBar`：负责展示和 click affordance；sequence 仍来自 `console-model`。
- `SessionMetaPopover`：只展示真实字段；不请求或推断 provider-native metadata。
- `ContextualFilesPanel` / `ContextualGitPanel`：保留 Agent context 辅助检查能力；只读、局部状态、本 change 不升级为完整 Files/Git workspace。

## 状态管理

- Server state：TanStack Query 保持 session detail、contextual Files/Git 数据加载。
- Stream state：component-local state 保持 `connectionStatus`、`streamError`、`sessionStatus`、`output`、`reconnectKey`。
- Form state：component-local `input`，drawer collapse 不清空。
- Interaction state：component-local `inputPanelOpen`、`detailView`、`metaOpen`。
- URL/search：保持现有 `fromAgentSession` 来源回退；不把 drawer/meta/detailView 放入 URL，除非后续明确要求刷新恢复。
- Jotai：不使用；本 detail 状态不需要跨页面共享。

## 路由 / 页面接入

- Agent detail route 进入时返回 Project Agent workspace。
- Terminal detail route：如果 search 带 `fromAgentSession`，Back/close success 回来源 Agent detail；否则回 Project Terminal workspace。
- 移动端 detail route 不渲染 Project bottom navigation；这是页面层级规则，不依赖 viewport 下隐藏某个已有二级 nav。
- Agent contextual Files/Git 仍留在同 route 内作为 view 切换，不创建新的 route/search 状态。

## 工程约束

- 实现阶段必须加载 `vercel-react-best-practices` skill，并遵守 React 组件边界、避免无意义 memo/抽象、避免 route 内重复大型 JSX 的约束。
- 不新增 npm 依赖；不引入 xterm.js 或 terminal emulator。
- 所有新增 UI 复用 shadcn source wrappers：按钮走 `ActionButton` 或 shadcn `Button` wrapper，状态走 `StatusPill`，surface 走 `shellSurfaceClasses` 角色。
- 颜色/边框/背景不得在 SessionDetailRoute 私有化另一套深浅；新增视觉 role 应进入 shared primitive 或复用现有 `shellSurfaceClasses`。
- 真实浏览器验证使用固定 tmux 调试服务：API `43011`、Web `43012`，`PROJECTS_ROOT=/home/deploy/workspace`。
- 验证 artifacts 写入 `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/artifacts/`。

## 关键决策

- 保留现有数据与 stream owner，把 prototype alignment 限制在 view composition 和 shared shell primitives。
- Header/action/control 的差异由 session type props 决定，不复制两套 route 页面。
- Input drawer 和 terminal panel 是跨 Agent/Terminal detail 的稳定复用单元；优先抽成明确组件。
- Contextual Files/Git 使用现有 API 真实读取，只做 lightweight Agent context 表达；完整移动 preview/diff 进入 resource inspection change。

## 风险与权衡

- 过度抽象风险：如果把 Agent tools、Terminal controls、contextual panels 全部泛化，会隐藏真实产品边界；只抽 terminal/input/status/action/surface 这类稳定单元。
- route-local 样式漂移风险：当前文件已有大量私有 Tailwind surface；实现必须按批次替换为 shared surface roles。
- 浏览器验证准备风险：真实 Agent session 可能依赖 provider CLI 可用；如果不可用，需要明确记录环境限制，不能用假数据替代。

## 开放问题

- 当前 existing quick key set 是否完全符合 prototype 对 Agent/Terminal 的区别；实现前应读取 `console-model.ts` 和测试确认。
- 是否需要把 `TerminalOutput` 和 `SessionInputDrawer` 提升到 `web/src/components/shell/`，由实现阶段根据真实复用范围决定。

## 后续沉淀候选

- `web/src/components/shell/` 的 runtime detail primitive 边界。
- Session detail route 的状态归属和 mobile detail chrome 规则。
