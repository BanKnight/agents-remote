# Frontend Design

## Change

- change-id：align-ui-shell-foundation

## 前端范围

- `web/src/routes/router.tsx`：承载可恢复的 Project workspace route/search 状态。
- `web/src/routes/HomeRoute.tsx`：接入一级 shell 的结构基础。
- `web/src/routes/ProjectConsoleRoute.tsx`：接入 Project shell、二级导航、shared primitives 和 workspace active 状态。
- `web/src/routes/SessionDetailRoute.tsx`：保持 detail chrome 与 Project 二级导航分离；只按需复用 shared primitives。
- `web/src/state/ui.ts`：不再作为可导航 Project workspace active section 的长期唯一来源。
- `web/src/styles/index.css`：如需补充少量全局基础样式，仅限 shell/primitives 支撑。

## 模块划分

- `AppShell` / `PrimaryNav`：一级导航和 app-level chrome，可先在 route 文件内实现，待复用稳定后再抽文件。
- `ProjectShell` / `ProjectSecondaryNav`：Project 上下文、二级导航、desktop/mobile chrome。
- `WorkspaceChrome`：workspace header、panel 边界和局部状态容器。
- Shared primitives：`IconMarker`、`StatusPill`、`NavItem`、`ListRow`、`ShellPanel`、`ActionButton` 等只在实际复用处抽取。
- Page content modules：Agent/Files/Git/Terminal 内容保持页面局部，后续 page-level changes 再细化。

## 组件边界

- Shell 组件接收当前层级、active nav、返回目标和 children，不直接请求 Files/Git/Agent/Terminal 数据。
- Navigation item 接收 label、icon marker、active、target，不关心业务数据。
- Status pill 接收 label/value/tone，必须渲染文字。
- List row 负责共同密度和 truncation 行为，业务 action 由调用方传入。
- Runtime input drawer 仍只属于 Session detail，不进入 Project shell primitives。

## 状态管理

- Project workspace active section 应从 URL 可恢复状态派生，优先考虑 TanStack Router search 参数或等价 route 状态。
- `activeConsoleSectionAtom` 可在迁移期间移除或降级为非 URL-critical 的局部 shell 状态；最终不能作为 Agent/Files/Git/Terminal workspace 的唯一来源。
- Files current path、selected preview、Git selected file 等仍可先保留组件本地；若移动端进入独立 detail 形态，后续 resource-page change 再 route 化。
- 服务端状态继续使用 TanStack Query，不引入新的客户端缓存方式。

## 路由 / 页面接入

- Home 保持 `/`。
- Project shell 保持 `/projects/$projectName`，但应支持可恢复的二级 workspace active 状态，例如 search：`?workspace=agent|files|git|terminal`。
- Agent/Terminal detail 保持现有深层 route，不显示 Project 二级底部导航。
- 后续 Files preview / Git diff detail 是否新增 route 由 resource-page change 决定；本 change 只提供 chrome 和状态边界。

## 工程约束

- 不新增依赖；图标 marker 首轮可用文字缩写、CSS 或 inline SVG。
- 不拆出大规模组件目录，除非同一 primitive 在至少两个位置真实复用。
- 不改 API client、shared DTO 或后端能力。
- 不删除现有 query loading/error/empty 和危险确认逻辑。
- 完成后需要运行 web 相关 typecheck/test，并用真实浏览器检查至少 Home、Project workspace、Session detail 的 desktop/mobile chrome。

## 关键决策

- 使用 `docs/design/frontend-ui-architecture.md` 作为必读长期上下文，当前 plan/tasks 也必须显式引用。
- 以 URL-visible workspace state 解决 Project 二级 active 状态可恢复性。
- Shell foundation 优先调整 chrome 和 primitives，不把 Files/Git/Agent/Terminal 具体页面内容一次性全部改完。
- 保留现有 route 文件作为初始落点，只有当实现中重复明显时再提取局部组件。

## 风险与权衡

- Search 参数方案比 nested routes 改动小，适合作为 shell foundation；但未来若 Files/Git detail 需要深链，resource-page change 可能继续 route 化。
- 轻量 icon marker 不如完整图标库精细，但避免供应链与设计成本；若后续确需依赖，应单独研究。
- 保持现有 route 文件可减少 churn，但文件可能变大；后续 page-level changes 可按实际复杂度拆分。

## 开放问题

- `activeConsoleSectionAtom` 是直接删除还是保留给非 URL-critical UI，需要实现时看迁移成本。
- Project 二级 search 参数命名采用 `workspace` 还是其他名称，由实现时与现有 router 类型约束一起决定。

## 后续沉淀候选

- Project workspace active state 的 route/search 方案。
- Shared shell/primitives 的真实代码边界。
- Jotai 与 URL state 的最终分工。
