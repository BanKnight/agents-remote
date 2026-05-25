# Frontend Design

## Change

- change-id：align-instance-detail-workspaces

## 前端范围

- 技术栈沿用现有 `web`：React 19、TypeScript、Vite、TanStack Router、TanStack Query、Tailwind CSS。
- 主要修改 `web/src/routes/SessionDetailRoute.tsx`，按需调整 `web/src/routes/router.tsx`、`web/src/routes/console-model.ts`、`web/src/routes/ProjectConsoleRoute.tsx` 和相关 tests/browser harness。
- 复用现有 `getAgentSession`、`getTerminalSession`、`closeAgentSession`、`closeTerminalSession`、`createTerminalSession`、Files/Git read-only client 与 session WebSocket stream。
- 不修改 shared DTO、API route contract、Session Runtime、Agent Runtime 或 provider adapter。

## 模块划分

- `SessionDetail` 继续负责 route params、detail query、close mutation、stream WebSocket、input text、drawer state、send/quick key handlers。
- 新增或调整 detail chrome 局部组件：
  - `SessionDetailHeader`：返回入口、marker、title/status、Agent/Terminal action 分支。
  - `AgentDetailTools`：Files、Git、+Terminal、Meta actions。
  - `SessionMetaPopover`：展示真实 session/project/stream metadata。
  - `TerminalWorkspace` / `TerminalOutput`：terminal-first output shell。
  - `SessionInputDrawer`：展开/收起、quick keys、textarea/send 状态。
- Agent contextual Files/Git 可以通过 route search 或局部 view state 接入现有 `FilesPanel` / `GitPanel` 类逻辑；若复用现有 panel 需要先把必要局部组件从 `ProjectConsoleRoute.tsx` 中安全拆出或保持最小 duplication。
- +Terminal 复用 `createTerminalSession` mutation，成功后 navigate 到 `/projects/$projectName/terminal-sessions/$sessionId`。

## 组件边界

- Header 只负责当前 detail chrome 和 actions，不直接处理 stream message parsing。
- Agent tools 只触发导航、创建 Terminal、打开/关闭 Meta；不负责 Files/Git 数据加载细节。
- Meta popover 只接收真实字段：projectName、sessionType、session id、displayName、provider（Agent only）、runtime status、transport status。
- Terminal detail 不渲染 `AgentDetailTools`。
- Input drawer 只处理本地展开/收起、textarea、quick key click 和 submit 回调；不拥有 WebSocket。
- Quick key 配置继续来自 `sessionQuickKeys(sessionType)`；如需 Shift+Tab/mode 文案，优先在现有 model 中补充真实 sequence 与测试。

## 状态管理

- 服务端状态：session detail 使用 TanStack Query；+Terminal 使用 TanStack Mutation；Files/Git contextual view 若在本 change 内落地，继续使用 TanStack Query。
- WebSocket/transport 状态：继续保存在 `SessionDetail` 局部 state，包含 connectionStatus、streamError、sessionStatus、output。
- 表单状态：input textarea 保持局部 state。
- 交互状态：input drawer open/closed、Meta open/closed、Agent contextual view 选择状态使用组件局部 state 或 URL search；不新增 Jotai。
- 路由/来源状态：
  - Agent detail 返回默认 `/projects/$projectName?workspace=agents`。
  - Terminal detail 返回默认 `/projects/$projectName?workspace=terminal`。
  - Agent-derived Terminal / Files / Git 如果需要回 Agent detail，应通过 search 参数或 location state 传递 source session id；若无法稳定深链，则明确回 Project workspace。

## 路由 / 页面接入

- 现有 detail routes 保持：
  - `/projects/$projectName/agent-sessions/$sessionId`
  - `/projects/$projectName/terminal-sessions/$sessionId`
- 可选新增或扩展 search：
  - Agent detail 内部 view：`?view=terminal|files|git` 或等价局部状态。
  - Terminal detail source：`?fromAgentSession=<id>` 或等价来源上下文，用于从 Agent +Terminal 返回 Agent detail。
- 不新增后端 resource 路径。
- Files/Git contextual view 如果无法在本 change 中完整落地，不应显示假内容；入口可以先导航到 Project Files/Git workspace 并保留 Agent source affordance，或在 plan 中拆出最小可验收任务。

## 工程约束

- 不新增依赖、不引入 xterm.js 或图标包。
- 不使用假 metadata、fake provider-native thread id、fake recent output、fake branch 或 fake history。
- 保留 close confirm、reconnect、resize、stream error、connecting/recovering、runtime ended 和 input disabled 状态。
- 保持 long text 安全：`min-w-0`、`truncate`、`break-all`、terminal output scroll/wrap 必须覆盖 Project/session id/output 长文本。
- 实现后运行 format/lint/web typecheck/test/build，并用真实浏览器检查 Agent detail 与 Terminal detail 的 desktop/mobile。

## 关键决策

- 先在 `SessionDetailRoute.tsx` 局部完成 terminal-first detail，不提前抽出跨页面组件库。
- Agent/Terminal 分化只发生在 detail header tools 与 marker/metadata；stream、output、input drawer、quick keys 仍共享逻辑。
- Meta 是本地 overlay，不新增 route，不请求额外 API。
- +Terminal 使用已有 API；如果创建失败，错误留在 Agent detail 并可恢复。
- Files/Git contextual view 与 resource inspection 后续 change 存在交集，本 design 允许 plan 按最小可验收范围处理：先保证入口/返回模型，再扩展内容密度。

## 风险与权衡

- 直接复用 `ProjectConsoleRoute.tsx` 内 Files/Git panel 可能触发较大重构；plan 应限制范围，避免在本 change 重做 resource pages。
- 新增 route search 需要更新 router validate/search 类型和 tests；如果收益不足，可以选择局部 state 或直接导航到 Project workspace。
- 移动端 header actions 容易横向溢出；实现时需要优先短标签和 wrap 安全，而不是增加隐藏复杂菜单。
- Quick key Shift+Tab/mode 当前长期 prototype 提到但现有 model 未必完整覆盖；实现时若新增 sequence 必须补测试，否则保留既有真实 quick keys 并用文案说明当前集合。

## 开放问题

- Contextual Files/Git 是在本 change 里复用为 Agent detail 内部 view，还是由 `align-resource-inspection-pages` 负责完整 deep resource detail；plan 阶段需要按当前代码耦合度决定。

## 后续沉淀候选

- `SessionDetailRoute` 的长期前端边界：detail chrome、stream state、input drawer、Agent-only tools、Terminal focused shell。
- Agent-derived Terminal source context 的 route/search 规则（若实现并验证）。
- Contextual Files/Git 与 Project secondary Files/Git 的前端复用边界（若实现并验证）。
