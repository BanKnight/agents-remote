# tasks

## 执行顺序

1. 先调整 Agent workspace 顶部结构和 provider 创建入口。
2. 再对齐当前 Agent instance list/row 的真实字段、密度和操作。
3. 然后增加轻量 session history / future restore staged 区域。
4. 最后运行 web 检查并用真实浏览器采集桌面/移动 Agent workspace 证据。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 收敛 Agent workspace 顶部和 provider 创建入口
  - 验收标准：Agent workspace 顶部明确展示 `Agent instances` 或等价标题；`+ Claude` / `+ Codex` 创建入口位于主操作区；创建中禁用或显示 pending；创建失败展示可读错误；不改变 Project 二级导航或 workspace search。
  - 依据：`plan.md`；`specs/project-console-navigation/spec.md`；`specs/agent-provider-experience/spec.md`；`design/overview.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`docs/design/frontend-ui-architecture.md`；`docs/specs/agent-provider-experience/spec.md`；`docs/design/agent-provider-experience.md`；`web/src/routes/ProjectConsoleRoute.tsx`
  - 修改范围：`web/src/routes/ProjectConsoleRoute.tsx`
  - 依赖：无
  - 并行：否（阻塞后续 Agent row/history 布局）

### 2. 核心实现任务

- [x] 2.1 对齐当前 Agent instance list/row
  - 验收标准：当前 Agent Sessions 使用 provider marker、displayName、status、id、Open stream、Close 呈现；列表/行保持可扫读密度；长 id/name 不横向溢出；空态、加载态、关闭确认和 close/create error 保留；Terminal session 列表不被 Agent-specific 改造破坏。
  - 依据：`plan.md`；`specs/project-console-navigation/spec.md`；`specs/agent-provider-experience/spec.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`web/src/routes/ProjectConsoleRoute.tsx`；`web/src/routes/shell-primitives.tsx`；`packages/shared/src/index.ts`
  - 修改范围：`web/src/routes/ProjectConsoleRoute.tsx`
  - 依赖：1.1
  - 并行：否（与 1.1/2.2 修改同一文件且布局相关）

- [x] 2.2 增加轻量 session history / future restore 区域
  - 验收标准：Agent workspace 中当前 instances 与 history/future restore 视觉分区；history 区明确 staged/future/empty，不提供不可用恢复操作，不伪造 provider history 数据；移动端 history 后置，不挤占首屏 provider create 与 instances。
  - 依据：`plan.md`；`specs/project-console-navigation/spec.md`；`specs/agent-provider-experience/spec.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`docs/specs/agent-provider-experience/spec.md`；`docs/design/agent-provider-experience.md`；`web/src/routes/ProjectConsoleRoute.tsx`
  - 修改范围：`web/src/routes/ProjectConsoleRoute.tsx`
  - 依赖：2.1
  - 并行：否（依赖 Agent workspace 主区结构稳定）

### 3. 集成与验证任务

- [x] 3.1 运行 web 检查并准备浏览器验证证据
  - 验收标准：`bun run format:check`、`bun run lint`、`bun --filter @agents-remote/web typecheck`、`bun --filter @agents-remote/web test`、`bun --filter @agents-remote/web build` 通过；真实浏览器检查桌面端和移动端 Agent workspace、Claude/Codex create actions、当前 instance/empty 状态、history staged 区和 Project 二级导航；截图/日志放入本 change artifacts 供 verify-change 使用。
  - 依据：`plan.md`；`specs/project-console-navigation/spec.md`；`specs/agent-provider-experience/spec.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`docs/project.md` 测试与质量门禁；现有 browser harness 模式；`web/src/routes/ProjectConsoleRoute.tsx`
  - 修改范围：`.workflow/changes/align-project-agent-workspace/artifacts/`；必要时新增本 change 专用 browser check 脚本
  - 依赖：2.2
  - 并行：否（必须在实现完成后执行）

## 依赖图

- 1.1 → 2.1 → 2.2 → 3.1

## 可并行任务

- （无；实现集中在同一 Project console route，验证依赖实现完成）

## 阻塞项

- （无）
