# tasks

## 执行顺序

1. 定义 shared Git diff DTO 与错误码，稳定跨边界契约。
2. 实现 API Git diff service、只读 route 和测试。
3. 扩展 web API client，并替换 Project console Git placeholder 为 diff viewer。
4. 扩展 E2E fixture/spec，运行 E2E 和完整质量门禁。
5. 更新 workflow progress，进入 verify 阶段。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 定义 Git diff shared DTO 与错误码
  - 验收标准：`packages/shared` 导出 Git diff scope、status、file summary、list response、file diff response 和 Git-specific error codes；shared tests 覆盖基本 DTO/error code。
  - 依据：`plan.md`、`specs/git-diff-viewer/spec.md`、`design/api.md`、`design/architecture.md`。
  - 必读上下文：`packages/shared/src/index.ts`、`packages/shared/src/index.test.ts`。
  - 修改范围：`packages/shared/src/index.ts`、`packages/shared/src/index.test.ts`。
  - 依赖：无。
  - 并行：否（阻塞 API/client/UI 类型契约）。

### 2. 核心实现任务

- [x] 2.1 实现 API Git diff service、route 和测试
  - 验收标准：新增 Project-scoped Git diff list 与 single-file diff GET API；支持 repository false、no changes、worktree/staged modified/added/deleted/renamed/untracked 映射、单文件 unified diff、scope invalid、file not changed、Project path safety；命令执行不通过 shell。
  - 依据：`plan.md`、`design/api.md`、`design/architecture.md`、`design/error-handling.md`、`docs/specs/project-safe-paths/spec.md`。
  - 必读上下文：`api/src/index.ts`、`api/src/project-paths.ts`、`api/src/project-files.ts`、`api/src/index.test.ts`。
  - 修改范围：新增 `api/src/project-git-diff.ts` 与测试，更新 `api/src/index.ts` route wiring，按需更新 API tests。
  - 依赖：1.1。
  - 并行：否（route/service contract 会影响后续 client/UI）。

- [x] 2.2 扩展 web API client 和测试
  - 验收标准：web client 导出 `listProjectGitDiff` 与 `getProjectGitFileDiff`；projectName/path/scope 正确 encode；client tests 覆盖 worktree/staged file diff URL。
  - 依据：`plan.md`、`design/api.md`、`design/frontend.md`。
  - 必读上下文：`web/src/api/client.ts`、`web/src/api/client.test.ts`。
  - 修改范围：`web/src/api/client.ts`、`web/src/api/client.test.ts`。
  - 依赖：1.1、2.1 API path 契约。
  - 并行：是（2.1 route path 契约固定后可与 UI skeleton 并行；本轮建议顺序执行）。

- [x] 2.3 实现 Project console Git diff UI
  - 验收标准：Git section 不再显示 placeholder；可显示非 Git 仓库状态、无变更空态、worktree/staged 变更列表、status/scope badge、单文件 unified diff panel、loading/error/retry 状态；不出现 Git 写操作入口。
  - 依据：`plan.md`、`design/frontend.md`、`design/ui-ux.md`、`design/error-handling.md`、`docs/design/console-shell.md`、`docs/design/frontend-stack.md`。
  - 必读上下文：`web/src/routes/ProjectConsoleRoute.tsx`、`web/src/routes/console-model.ts`、`web/src/routes/console-model.test.ts`。
  - 修改范围：`web/src/routes/ProjectConsoleRoute.tsx`、`web/src/routes/console-model.ts`、`web/src/routes/console-model.test.ts`。
  - 依赖：1.1、2.2。
  - 并行：否（依赖最终 DTO/client 和 Project console layout）。

### 3. 集成与验证任务

- [x] 3.1 增加 Git diff 浏览器 E2E 覆盖
  - 验收标准：E2E runner 初始化临时 Project Git 仓库并准备 staged/worktree 变更；浏览器用真实登录/Project/Git 路径验证文件列表、scope/status 和单文件 unified diff；Terminal smoke 继续通过。
  - 依据：`plan.md`、`design/ui-ux.md`、`docs/runbooks/e2e-quality-baseline.md`。
  - 必读上下文：`scripts/run-e2e.ts`、`e2e/file-browser.spec.ts`、`e2e/terminal-session.spec.ts`、`playwright.config.ts`。
  - 修改范围：`scripts/run-e2e.ts`、新增或更新 `e2e/*.spec.ts`。
  - 依赖：2.3。
  - 并行：否（selectors 和 fixture 依赖最终 UI）。

- [x] 3.2 运行质量检查并修复发现的问题
  - 验收标准：相关 focused tests、`bun run e2e`、`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build` 通过，或明确记录无法执行的环境原因和回流建议。
  - 依据：`plan.md`、`design/error-handling.md`。
  - 必读上下文：`package.json`、`docs/runbooks/e2e-quality-baseline.md`。
  - 修改范围：测试修复所需文件；不得扩大功能范围。
  - 依赖：3.1。
  - 并行：否（最终门禁）。

- [x] 3.3 更新 workflow 实现进度
  - 验收标准：所有实现任务完成后勾选本文件任务，`progress.md` 将 implementation 标记为已完成并推进到 `待验证`；如有阻塞，保持任务未勾选并记录原因。
  - 依据：`plan.md`、`progress.md`。
  - 必读上下文：`.workflow/changes/implement-git-diff-viewer/progress.md`。
  - 修改范围：`.workflow/changes/implement-git-diff-viewer/tasks.md`、`.workflow/changes/implement-git-diff-viewer/progress.md`。
  - 依赖：3.2。
  - 并行：否（收口任务）。

## 依赖图

- 1.1 → 2.1 → 2.2 → 2.3 → 3.1 → 3.2 → 3.3

## 可并行任务

- 2.2 在 2.1 route path 契约固定后可与 UI skeleton 并行；当前建议顺序执行以减少返工。

## 阻塞项

- （无）
