# plan

## Change 目标

- 建立真实 Web UI 的共享 shell foundation：一级/二级 navigation shell、Project workspace 可恢复状态、移动端直接二级/深层详情返回模型，以及基础视觉 primitives。
- 完成后解锁 Home/Project entry、Project Agent workspace、instance detail 和 resource pages 的页面级对齐。

## 局部 big picture

- 本 change 是 `v0.8-prototype-ui-alignment` 中第一个代码实现型横切 change，承接已沉淀的 `docs/design/frontend-ui-architecture.md`。
- 它不完成所有页面内容，但要先给后续页面 changes 提供统一 chrome、route/state 和 shared primitive 基础。
- 后续 changes 必须继续把 `docs/design/frontend-ui-architecture.md` 作为必读上下文，并在各自 plan/tasks 中显式引用。

## 执行策略

- 先让 Project 二级 workspace active 状态变为 URL-visible，避免继续只依赖 Jotai atom。
- 再建立轻量 shared primitives 和 shell chrome，优先在现有 route 文件中完成，只有真实复用明显时才抽出局部组件。
- 然后接入 Home、Project workspace 和 Session detail 的 chrome 差异：直接二级页显示二级导航，深层 detail 不显示二级导航。
- 最后运行 web 相关检查，并用真实浏览器检查 desktop/mobile 的 Home、Project workspace、Session detail 结构。

## 任务顺序依据

- URL-visible workspace state 是 Project shell 和二级导航 active 状态的基础，必须先做。
- Shared primitives 和 shell chrome 会影响 Home/Project/Session detail，放在路由状态之后。
- 页面接入依赖前两步，否则容易把具体内容与 shell foundation 混在一起。
- 浏览器验证必须在 UI 接入后执行；截图或日志路径在 verify 阶段记录。

## 额外上下文

- `docs/design/frontend-ui-architecture.md`：本 change 与后续 UI alignment changes 的必读先导上下文，约束来源优先级、三层页面模型、移动端返回规则、共享 UI 边界和视觉密度基线。
- `docs/design/prototype/guidelines.md`：prototype 导航、布局、移动端返回和视觉规则来源。
- `docs/design/prototype/screenshots/index.md`：后续浏览器验证对照的 prototype screenshot 索引。
- `docs/specs/project-console-navigation/spec.md`：既有 Project console navigation WHAT 约束。
- `docs/design/console-shell.md`：既有 Console Shell 长期设计约束。
- `docs/design/frontend-stack.md`：前端栈、Router/Query/Jotai 状态边界。
- `web/src/routes/router.tsx`：TanStack Router 路由树和 Project route 接入点。
- `web/src/routes/HomeRoute.tsx`：一级 shell 接入点。
- `web/src/routes/ProjectConsoleRoute.tsx`：Project shell、workspace、Files/Git/Agent/Terminal 当前实现入口。
- `web/src/routes/SessionDetailRoute.tsx`：深层 detail chrome 和 runtime input 边界。
- `web/src/state/ui.ts`：现有 active console section atom，需迁移或降级。

## 依赖与阻塞

### 阶段依赖

- `design-frontend-ui-architecture` 已完成并沉淀长期 docs。
- 当前 change 已完成 specs/design，可进入实现。

### 任务依赖

- 1.1 路由状态建模阻塞 2.1 和 2.2。
- 2.1 shared primitives 阻塞 2.2 页面 chrome 接入。
- 2.2 UI 接入完成后才能执行 3.1 浏览器/测试验证。

### 外部依赖

- 不需要第三方服务、数据迁移、权限或新增依赖。
- 需要运行 web 相关检查；需要浏览器验证时优先复用项目约定的 `ar-<purpose>` tmux/dev server 管理方式，避免重复启动孤儿进程。

## 并行机会

- 1.1、2.1、2.2 修改相同 route/UI 文件，不能并行。
- 验证任务 3.1 必须在实现任务完成后执行。

## 风险与验证重点

- 风险：过度抽象 shared primitives，造成组件库式 churn。
- 风险：只改视觉不改 route-visible workspace state，导致刷新/返回恢复不符合 spec。
- 风险：深层 Session detail 误接入 Project 二级底部导航，破坏 mobile detail 输入区域。
- 验证重点：desktop/mobile 下一级/二级导航互斥、Project workspace active 状态可恢复、Session detail 无二级底部导航、现有 loading/empty/error/close confirm 行为保留。

## 不做事项

- 不完成 Home、Agent workspace、Files/Git/Terminal resource pages 的全部页面内容 polish。
- 不新增 API、shared DTO、runtime/provider 能力或 Files/Git 写操作。
- 不新增图标库、组件库或状态库。
- 不直接沉淀长期 docs；实现验证后由 distill-change 判断是否增量更新。
