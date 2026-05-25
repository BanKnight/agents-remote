# tasks

## 执行顺序

1. 基础/阻塞任务：把 Project workspace active 状态改成 URL-visible，可由刷新/返回恢复。
2. 核心实现任务：建立 shared shell primitives，并接入 Home、Project workspace、Session detail 的 chrome 边界。
3. 集成与验证任务：运行 web 检查并用真实浏览器检查 desktop/mobile 关键结构。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 建立 Project workspace URL-visible active 状态
  - 验收标准：
    - Project workspace active section 不再只依赖 `activeConsoleSectionAtom`。
    - Agent、Files、Git、Terminal active 状态可以从路由/search 或等价 URL-visible 机制恢复。
    - 无效 workspace 值回退到 Agent 或等价默认工作区。
  - 依据：`plan.md`；`specs/project-console-navigation/spec.md` 的 Route-visible workspace requirement；`design/frontend.md` 的状态管理与路由接入。
  - 必读上下文：`docs/design/frontend-ui-architecture.md`、`docs/design/frontend-stack.md`、`web/src/routes/router.tsx`、`web/src/routes/ProjectConsoleRoute.tsx`、`web/src/state/ui.ts`
  - 修改范围：`web/src/routes/router.tsx`、`web/src/routes/ProjectConsoleRoute.tsx`、`web/src/state/ui.ts`（按需）
  - 依赖：无
  - 并行：否（阻塞 shell 和页面接入）

### 2. 核心实现任务

- [x] 2.1 建立共享 shell primitives 和导航视觉语言
  - 验收标准：
    - 导航项、icon marker、status pill、panel/card、button 或 list row 中至少真实复用的部分形成一致实现边界。
    - 状态表达包含文字，不只依赖颜色。
    - 没有新增图标库、组件库或状态库。
  - 依据：`plan.md`；`specs/project-console-navigation/spec.md` 的 shared visual primitives requirement；`design/ui-ux.md`、`design/frontend.md`
  - 必读上下文：`docs/design/frontend-ui-architecture.md`、`docs/design/prototype/guidelines.md`、`web/src/routes/HomeRoute.tsx`、`web/src/routes/ProjectConsoleRoute.tsx`、`web/src/routes/SessionDetailRoute.tsx`
  - 修改范围：`web/src/routes/*.tsx`、必要时 `web/src/styles/index.css`
  - 依赖：1.1
  - 并行：否（与 2.2 修改相同 UI 边界）

- [x] 2.2 接入一级/二级 shell 和深层 detail chrome
  - 验收标准：
    - Desktop Home / Project 页面区分一级 shell 与 Project 二级 shell。
    - Mobile 一级页面与 Project 直接二级页不会同时显示一级和二级底部导航。
    - Mobile Project 直接二级页通过底部二级导航 Back 返回一级，不在顶部重复 Back。
    - Session detail 保持深层 detail chrome，不显示 Project 二级底部导航，底部区域仍服务 runtime input。
    - Existing loading/empty/error/disabled/danger confirm 行为保留。
  - 依据：`plan.md`；`specs/project-console-navigation/spec.md` 的 navigation、mobile direct secondary、deep detail、state preservation requirements；`design/ui-ux.md`、`design/frontend.md`
  - 必读上下文：`docs/design/frontend-ui-architecture.md`、`docs/design/prototype/guidelines.md`、`docs/design/console-shell.md`、`web/src/routes/HomeRoute.tsx`、`web/src/routes/ProjectConsoleRoute.tsx`、`web/src/routes/SessionDetailRoute.tsx`
  - 修改范围：`web/src/routes/HomeRoute.tsx`、`web/src/routes/ProjectConsoleRoute.tsx`、`web/src/routes/SessionDetailRoute.tsx`
  - 依赖：2.1
  - 并行：否（依赖 shared primitives，修改相同 UI 文件）

### 3. 集成与验证任务

- [x] 3.1 运行 web 检查并进行真实浏览器结构验证
  - 验收标准：
    - 运行与 web 改动匹配的 test/typecheck/build 或项目可用最小检查，并记录结果。
    - 用真实浏览器检查 Home、Project workspace、Session detail 的 desktop/mobile chrome。
    - 如采集截图、trace 或日志，保存到本 change artifacts 或在 verify 阶段记录路径。
    - 若无法完成浏览器验证，记录明确原因，不声称 UI 验证通过。
  - 依据：`plan.md`；`docs/project.md` 前端与移动端开发/验证准则；`docs/design/frontend-ui-architecture.md`
  - 必读上下文：`docs/project.md`、`docs/design/frontend-ui-architecture.md`、`docs/design/prototype/screenshots/index.md`
  - 修改范围：`.workflow/changes/align-ui-shell-foundation/artifacts/`（按需）、`progress.md`、`tasks.md`
  - 依赖：2.2
  - 并行：否（验证依赖实现完成）

## 依赖图

- 1.1 → 2.1 → 2.2 → 3.1

## 可并行任务

- （无）

## 阻塞项

- （无）
