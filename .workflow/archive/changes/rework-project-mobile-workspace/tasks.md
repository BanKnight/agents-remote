# tasks

## 执行顺序

1. 基础/阻塞任务：重组 Project console 工作区外壳和状态边界，先确定移动端页面骨架与不再常驻 bottom input 的渲染边界。
2. 核心实现任务：按移动端优先顺序接入 Files/Git 功能区、Agent Sessions 区和 Terminal Sessions 区，保留现有数据流与行为。
3. 清理与质量任务：删除或停止使用无效 runtime input 状态/常量，运行局部质量门禁，为 verify 阶段准备移动端 artifact 关注点。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 重组 Project console 移动工作区骨架
  - 验收标准：
    - `web/src/routes/ProjectConsoleRoute.tsx` 的 Project 成功态根布局在移动端为单列工作区结构，顶部提供返回 Projects 的明确入口和当前 Project 名称/路径上下文。
    - 页面主体顺序预留为 Files/Git 功能区、Agent Sessions 区、Terminal Sessions 区，且不再依赖桌面侧栏作为移动端一级导航。
    - 根容器继续使用动态视口高度、`overflow-x-hidden`、`min-w-0` 和长文本截断/换行策略。
  - 依据：`plan.md`；`specs/project-console-navigation/spec.md`；`design/overview.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`web/src/routes/ProjectConsoleRoute.tsx`；`docs/project.md`；`docs/design/console-shell.md`
  - 修改范围：`web/src/routes/ProjectConsoleRoute.tsx`
  - 依赖：无
  - 并行：否（页面骨架阻塞后续任务，且与后续区域接入修改同一文件）

### 2. 核心实现任务

- [x] 2.1 实现 Files/Git 顶部功能区入口
  - 验收标准：
    - 手机默认视图中 Files 和 Git 以足够触控面积的 action card/button card 出现在 Agent/Terminal 区之前。
    - Files/Git 入口复用现有 Project console section 切换或 detail 渲染逻辑，不新增路由、不新增 API、不引入写操作。
    - Files/Git 文案明确表达只读检查入口，不把详情信息密度提前塞入工作区首屏。
  - 依据：`plan.md`；`specs/project-console-navigation/spec.md`；`design/product.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`web/src/routes/ProjectConsoleRoute.tsx`；`web/src/routes/console-model.ts`；`docs/specs/project-console-navigation/spec.md`
  - 修改范围：`web/src/routes/ProjectConsoleRoute.tsx`；必要时 `web/src/routes/console-model.ts`
  - 依赖：1.1
  - 并行：否（依赖工作区骨架，且会与 Agent/Terminal 区域共享布局状态）

- [x] 2.2 实现 Agent Sessions 工作区区域
  - 验收标准：
    - Agent 区在 Files/Git 功能区之后展示标题、Claude/Codex 创建入口、query/mutation 错误、空态或现有 Agent session 列表。
    - 创建 Agent session、进入 Agent session detail、关闭确认和 query invalidate 行为保持现状。
    - Agent session 文案不与 Terminal session 混淆，长 session id/name 不撑开 viewport。
  - 依据：`plan.md`；`specs/project-console-navigation/spec.md`；`design/product.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`web/src/routes/ProjectConsoleRoute.tsx`
  - 修改范围：`web/src/routes/ProjectConsoleRoute.tsx`
  - 依赖：1.1
  - 并行：否（与 Terminal 区和整体布局修改同一 route 文件，顺序执行更安全）

- [x] 2.3 实现 Terminal Sessions 工作区区域
  - 验收标准：
    - Terminal 区在 Agent 区之后展示标题、Terminal 创建入口、query/mutation 错误、空态或现有 Terminal session 列表。
    - 创建 Terminal session、进入 Terminal session detail、关闭确认和 query invalidate 行为保持现状。
    - Terminal session 文案不与 Agent session 混淆，长 session id/name 不撑开 viewport。
  - 依据：`plan.md`；`specs/project-console-navigation/spec.md`；`design/product.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`web/src/routes/ProjectConsoleRoute.tsx`
  - 修改范围：`web/src/routes/ProjectConsoleRoute.tsx`
  - 依赖：1.1、2.2
  - 并行：否（与 Agent 区共享 session card/布局边界，顺序执行便于避免回归）

### 3. 清理与横切任务

- [x] 3.1 移除 Project 工作区常驻 runtime input 状态和渲染
  - 验收标准：
    - Project console 不再渲染固定底部 runtime input panel，也不通过 CSS 隐藏残留面板。
    - `inputPanelOpenAtom`、`runtimeInputEnabled` 或相关 imports 如果不再有引用，应从对应文件删除；如果仍有引用，应只保留真实需要的引用并说明原因。
    - Project workspace 底部不再需要为固定 input 面板预留大块 padding，页面最后内容不会被固定 chrome 遮挡。
  - 依据：`plan.md`；`specs/project-console-navigation/spec.md`；`design/frontend.md`
  - 必读上下文：`web/src/routes/ProjectConsoleRoute.tsx`；`web/src/state/ui.ts`；`web/src/routes/console-model.ts`
  - 修改范围：`web/src/routes/ProjectConsoleRoute.tsx`；必要时 `web/src/state/ui.ts`、`web/src/routes/console-model.ts`
  - 依赖：2.1、2.2、2.3
  - 并行：否（必须等最终工作区布局确认后判断哪些状态/常量可删除）

### 4. 集成与验证准备任务

- [x] 4.1 运行实现阶段质量门禁并更新进度
  - 验收标准：
    - 至少运行 `bun run format:check`、`bun run lint`、`bun run typecheck`，并在失败时修复或记录阻塞；如改动触及测试覆盖范围，运行相关测试或全量 `bun run test`。
    - `tasks.md` 中所有实现任务完成后，`progress.md` 更新为 `当前阶段：待验证`，产物检查中 implementation 标记为已完成，并追加进展记录。
    - 汇报下一步为 `verify-change rework-project-mobile-workspace`，并指出 verify 需要移动 viewport 浏览器截图 artifact。
  - 依据：`plan.md`；`design/frontend.md`；`progress.md`
  - 必读上下文：`package.json`；`progress.md`
  - 修改范围：`.workflow/changes/rework-project-mobile-workspace/tasks.md`；`.workflow/changes/rework-project-mobile-workspace/progress.md`；必要时格式化后的前端文件
  - 依赖：3.1
  - 并行：否（必须在实现完成后执行）

## 依赖图

- 1.1 → 2.1 → 2.2 → 2.3 → 3.1 → 4.1
- 1.1 → 2.2
- 1.1 → 2.3

## 可并行任务

- 无。主要实现集中在 `web/src/routes/ProjectConsoleRoute.tsx`，并且各任务共享移动工作区布局和 session 区域边界，顺序执行更安全。

## 阻塞项

- （无）
