# plan

## Change 目标

- 对齐 Agent / Terminal instance detail：让两个 detail 都采用 terminal-first 工作区，移动端使用深层 detail 顶部返回与底部 input drawer，Agent detail 额外提供 Files/Git/+Terminal/Meta contextual tools，Terminal detail 保持 focused shell。
- 完成后为后续 `align-resource-inspection-pages` 提供从 Agent detail 派生进入 Files/Git/Terminal 的上下文边界。

## 局部 big picture

- 本 change 位于 `align-project-agent-workspace` 之后，继承 Agent instance row 的 `Open stream` 入口、Project 二级导航、URL-visible workspace state 和 frontend UI architecture 的三层页面模型。
- Instance detail 是 runtime 控制的深层页面，不是 Project 直接二级 workspace；移动端底部不能显示 Project 二级导航，必须优先服务当前 session 输入和 quick keys。
- 后续 resource inspection change 会继续 polish Files/Git/Terminal resource pages；本 change 只处理从 Agent detail 派生的 contextual entry、return model 和最小可验证只读内容。

## 执行策略

- 以 `web/src/routes/SessionDetailRoute.tsx` 为主要实现入口，保留现有 detail query、WebSocket stream、close/reconnect/resize、input drawer 和 quick key 逻辑。
- 先把 Session detail chrome 重组为 terminal-first：紧凑 header、marker/title/status、terminal output 主区、bottom input drawer；确保 Agent/Terminal 共享主体但 header action 分化。
- Agent detail 增加 Files/Git/+Terminal/Meta tools：Meta 使用本地 popover；+Terminal 使用现有 `createTerminalSession`；Files/Git 使用 detail 内部 contextual view 或等价局部状态呈现最小只读 inspection，避免新增后端 API 或破坏后续 resource pages。
- Terminal detail 明确不渲染 Agent-only tools，只保留 focused shell 的返回、状态、close/reconnect/resize 与输入控制。
- 如需复用 Files/Git 数据，直接使用现有 API client 和 TanStack Query；不把 `ProjectConsoleRoute.tsx` 的整个 Project secondary panel 搬进 detail。
- 最后用真实浏览器 harness 覆盖 Agent detail desktop/mobile、Terminal detail desktop/mobile、Meta popover、+Terminal pending/success 或可控失败、mobile drawer collapse/expand，以及不存在 Project 二级底部导航。

## 任务顺序依据

- 先调整 detail chrome 和 shared terminal-first structure，因为 Agent tools、Meta、drawer 和 browser harness 都依赖稳定的页面骨架。
- 再实现 Agent-only tools 与 Meta/+Terminal，确保 Terminal detail 不受污染。
- 再处理 contextual Files/Git 的最小只读 view/entry，因为它与后续 resource inspection 存在边界风险，应在核心 detail chrome 稳定后收敛。
- 再细化 mobile drawer / quick key density 和 long text overflow。
- 最后执行 web checks 和 browser harness，采集 desktop/mobile Agent/Terminal detail artifacts。

## 额外上下文

- `docs/design/frontend-ui-architecture.md`：必须读取，用于三层页面模型、deep/contextual detail、移动端顶部返回和底部导航互斥规则。
- `docs/specs/mobile-session-interaction/spec.md` 与 `docs/design/mobile-session-interaction.md`：必须读取，用于移动端 input drawer、quick keys、terminal output 和 stream recovery 规则。
- `docs/specs/session-runtime/spec.md`：必须读取，用于 Agent/Terminal identity、status、close/reconnect 和 runtime metadata 边界。
- `docs/design/prototype/guidelines.md`、`docs/design/prototype/agent-session-detail.html`、`docs/design/prototype/terminal-instance-detail.html`：必须读取，用于 prototype 对齐。
- 代码入口：`web/src/routes/SessionDetailRoute.tsx`、`web/src/routes/console-model.ts`、`web/src/routes/router.tsx`、`web/src/api/client.ts`、`web/src/routes/ProjectConsoleRoute.tsx` 中 Files/Git panel 的现有查询与视图模式、`packages/shared/src/index.ts`。

## 依赖与阻塞

### 阶段依赖

- 依赖 `align-ui-shell-foundation` 已完成，提供 Project/detail 层级和 route-visible workspace 基线。
- 依赖 `align-project-agent-workspace` 已完成，提供 Agent instances 入口和长期 Agent workspace 规则。
- 当前 specs/design 已完成，可进入实现计划。

### 任务依赖

- 1.1 建立 terminal-first detail chrome，是所有后续 UI 与 browser harness 的基础。
- 2.1 依赖 1.1，实现 Agent-only tools、Meta 和 +Terminal，并验证 Terminal detail 不显示这些工具。
- 2.2 依赖 2.1，实现或收敛 Files/Git contextual view/entry，确保不超出只读 resource 边界。
- 2.3 依赖 1.1 和 2.1，细化 mobile drawer、quick key 密度、状态禁用和 overflow。
- 3.1 依赖 2.1、2.2、2.3，运行质量门禁与 browser verification。

### 外部依赖

- 无第三方服务、数据迁移、权限或人工确认。
- Browser harness 可使用临时 `PROJECTS_ROOT`、临时 runtime dir 和拦截 provider/terminal 创建请求；避免依赖真实 Claude/Codex 登录或读取现有 secrets。

## 并行机会

- 不并行。主要修改集中在 `SessionDetailRoute.tsx` 和相关 route/model tests，任务之间存在页面骨架与交互状态依赖。

## 风险与验证重点

- 验证移动端 Agent/Terminal detail 不显示 Project 二级底部导航，且顶部返回可见。
- 验证 Agent detail 显示 Files/Git/+Terminal/Meta，而 Terminal detail 不显示 Agent-only tools。
- 验证 Meta popover 只展示真实 session/project/status/provider 字段，不伪造 provider-native metadata。
- 验证 +Terminal 使用真实 create terminal 行为或可控拦截，并在 pending/error/success 路径中可恢复。
- 验证 contextual Files/Git 不提供写操作，不伪造资源数据，不扩大到后续 resource page polish。
- 验证 mobile input drawer 展开/收起不关闭 stream、不清空输入、不遮挡 terminal output。
- 验证 long project/session id/output/header tools 不横向溢出。

## 不做事项

- 不新增后端 API、shared DTO、provider/runtime capability 或 session stream protocol。
- 不引入 xterm.js、ANSI parser、完整 terminal emulator 或新图标依赖。
- 不实现 Files/Git 写操作、Git stage/commit/checkout/reset 或文件编辑/upload/delete。
- 不重做 Project Agent workspace、Terminal workspace 列表或 Home entry。
- 不把 prototype 中的假 branch、fake provider-native id、recent output summary 或 history 数据写入真实 UI。
