# plan

## Change 目标

- 对齐 Project Agent workspace：让 Agent 二级页优先展示当前 Agent instances，明确提供 `+ Claude` / `+ Codex` provider 创建入口，并以轻量 staged 区域表达 session history / future restore。
- 完成后为后续 `align-instance-detail-workspaces` 提供清晰的 Agent instance 入口和 provider-aware 上下文。

## 局部 big picture

- 本 change 位于 `align-ui-shell-foundation` 和 `align-home-project-entry` 之后，继承 Project 二级导航、URL-visible `workspace=agents`、shared primitives 和 Home 默认进入 Agent workspace 的行为。
- Agent workspace 是 Project Console 的默认运行态工作区，必须优先服务创建、扫描和进入当前 Agent Sessions。
- 后续 instance detail change 会处理 terminal-first detail、Meta 浮窗、快捷入口和输入抽屉；本 change 只确保列表入口和 provider 创建区域正确。

## 执行策略

- 以 `web/src/routes/ProjectConsoleRoute.tsx` 中现有 `AgentPanel` 为实现入口，小步改造布局和子组件，不改 API、shared DTO 或 runtime。
- 使用真实 `AgentSession` 字段呈现 provider、displayName、status、id 和 detail/close 操作，不伪造 prototype 中的任务摘要、最近输出或真实历史。
- 将 `+ Claude` / `+ Codex` 创建入口放在 Agent workspace 顶部主操作区；创建中禁用，错误复用现有 mutation error。
- 当前 instances 与 history/future restore 分区展示；history 当前只写 staged/empty 说明，不提供假恢复操作。
- 保留 Project 二级导航、移动底部二级导航、危险 close confirm 和 route search 行为。

## 任务顺序依据

- 先调整 Agent workspace header 和 provider create area，因为这是列表与 history 区的布局基础。
- 再重做当前 Agent instance row/list 密度，避免后续 history 区依赖旧厚卡片结构。
- 再增加轻量 history/future restore 区域，确保不混入当前 sessions。
- 最后执行 web checks 和 browser harness，覆盖桌面/移动 Agent workspace、provider 创建入口、空态/当前实例列表与 default Agent workspace。

## 额外上下文

- `docs/design/frontend-ui-architecture.md`：必须读取，用于确认 Project 直接二级页、移动端二级导航、列表密度和真实状态保留规则。
- `docs/design/prototype/guidelines.md`：必须读取，用于确认 Agent 实例卡片、创建 provider 入口和 session history 的原型规范。
- `docs/design/prototype/project-detail.html`：必须读取，用于对照 Agent workspace desktop/mobile 结构。
- `docs/specs/project-console-navigation/spec.md`：必须读取，用于遵守 Project 二级 workspace、route-visible state 和移动端返回模型。
- `docs/specs/agent-provider-experience/spec.md`、`docs/design/agent-provider-experience.md`：必须读取，用于遵守 provider-aware 但统一 AgentSession 的边界。
- 代码入口：`web/src/routes/ProjectConsoleRoute.tsx`、`web/src/routes/shell-primitives.tsx`、`web/src/routes/console-model.ts`、`packages/shared/src/index.ts`。

## 依赖与阻塞

### 阶段依赖

- 依赖 `align-ui-shell-foundation` 已完成；当前已解除阻塞。
- 当前 specs/design 已完成，可进入实现。

### 任务依赖

- 1.1 建立 Agent workspace 的 provider create/header 结构，阻塞后续 row/history 调整。
- 2.1 依赖 1.1，负责当前 Agent instance list/row 密度与真实字段呈现。
- 2.2 依赖 2.1，负责 session history/future restore 轻量区并确保不伪造数据。
- 3.1 依赖 2.2，负责质量门禁和 browser artifacts。

### 外部依赖

- 无第三方服务、数据迁移、权限或人工确认。
- 如需要长驻 web/api 服务做浏览器验证，优先复用或重启 `ar-<purpose>` 命名 tmux session；一次性 browser harness 可用临时端口和临时 PROJECTS_ROOT。

## 并行机会

- 2.1 和 2.2 都会修改 `ProjectConsoleRoute.tsx` 且存在布局依赖，不并行。
- 验证任务必须在实现完成后执行，不并行。

## 风险与验证重点

- 验证 Agent workspace 在桌面/移动端仍是 Project 直接二级页，并保留正确导航。
- 验证 Claude/Codex 创建入口清晰、创建中禁用、错误可见。
- 验证当前 Agent Sessions 使用真实 provider/displayName/status/id 字段，不伪造最近输出/history。
- 验证 empty/loading/error/close confirm 未被删除。
- 验证 session history/future restore 与当前 instances 视觉分区，并明确 staged/empty，不提供虚假恢复操作。
- 验证长 session id/displayName 不造成横向溢出。

## 不做事项

- 不新增 provider history/resume API、DTO 或真实恢复行为。
- 不修改 Agent Runtime、provider adapter、tmux/session protocol 或后端创建语义。
- 不修改 Agent/Terminal Session detail。
- 不实现 Files/Git/Terminal resource page 对齐。
- 不新增 provider account 登录、CLI availability 管理、模型配置 UI 或图标依赖。
