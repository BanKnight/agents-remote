# tasks

## 执行顺序

1. 先定义 shared DTO/error code，稳定 API 与 web 的跨边界契约。
2. 实现 API Files service 与 route，并用服务层/HTTP 层测试覆盖 path safety、排序和 preview 状态。
3. 扩展 web API client 和 Project console Files UI，替换 placeholder。
4. 增加浏览器 E2E fixture 与质量检查，最后更新 workflow progress。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 定义 Files shared DTO 与错误码
  - 验收标准：`packages/shared` 导出目录 entry、file list response、file preview union、preview reason/media type 和新增 file-specific error codes；现有 shared tests 通过或补充覆盖关键 union/error code。
  - 依据：`plan.md`、`specs/file-browser-preview/spec.md`、`design/api.md`、`design/architecture.md`。
  - 必读上下文：`packages/shared/src/index.ts`、`packages/shared/src/index.test.ts`。
  - 修改范围：`packages/shared/src/index.ts`、按需修改 `packages/shared/src/index.test.ts`。
  - 依赖：无。
  - 并行：否（阻塞 API/client/UI 类型契约）。

### 2. 核心实现任务

- [x] 2.1 实现 API Files service、route 和测试
  - 验收标准：新增 Project-scoped 目录列表与文件预览 GET API；目录包含隐藏条目并按目录优先/名称排序；文本、图片、unsupported、too_large、not found、not directory、not file、path escape 均有测试；文件过大在 read 前通过 stat 拒绝。
  - 依据：`plan.md`、`design/api.md`、`design/architecture.md`、`design/error-handling.md`、`docs/specs/project-safe-paths/spec.md`。
  - 必读上下文：`api/src/index.ts`、`api/src/project-paths.ts`、`api/src/projects.ts`、`api/src/projects.test.ts`、`api/src/index.test.ts`。
  - 修改范围：新增 `api/src/project-files.ts` 与测试，更新 `api/src/index.ts` route wiring，按需更新 API tests。
  - 依赖：1.1。
  - 并行：否（route matching 和 service contract 会影响后续 client/UI）。

- [x] 2.2 扩展 web API client 和测试
  - 验收标准：web client 导出 `listProjectFiles` 与 `previewProjectFile`；projectName 和 path 正确 URL encode；非 OK 响应仍按现有 client error 方式抛出；client tests 覆盖 root/nested/中文或空格 path。
  - 依据：`plan.md`、`design/api.md`、`design/frontend.md`。
  - 必读上下文：`web/src/api/client.ts`、`web/src/api/client.test.ts`。
  - 修改范围：`web/src/api/client.ts`、`web/src/api/client.test.ts`。
  - 依赖：1.1、2.1 的 API path 契约。
  - 并行：是（2.1 route 完成后可与 UI 局部组件拆分并行，但本轮建议顺序执行）。

- [x] 2.3 实现 Project console Files UI
  - 验收标准：Files section 不再显示 placeholder；默认加载 Project root；可进入子目录、返回 root/上级、选择文件预览；文本、图片、unsupported、too_large、loading、empty、error 状态均有可理解 UI；不出现 edit/delete/rename/upload/download 操作。
  - 依据：`plan.md`、`design/frontend.md`、`design/ui-ux.md`、`design/error-handling.md`、`docs/design/console-shell.md`、`docs/design/frontend-stack.md`。
  - 必读上下文：`web/src/routes/ProjectConsoleRoute.tsx`、`web/src/routes/console-model.ts`、`web/src/routes/console-model.test.ts`。
  - 修改范围：`web/src/routes/ProjectConsoleRoute.tsx`，按需更新 `web/src/routes/console-model.ts` 和 tests。
  - 依赖：1.1、2.2。
  - 并行：否（依赖最终 DTO/client 和现有 Project console layout）。

### 3. 集成与验证任务

- [x] 3.1 增加 Files 浏览器 E2E 覆盖
  - 验收标准：E2E runner 准备包含隐藏文件、目录、文本文件和图片文件的 Project fixture；浏览器用真实登录/Project/Files 路径验证目录排序、进入目录、文本预览和图片预览；失败 artifacts 仍进入既有 E2E 输出位置。
  - 依据：`plan.md`、`design/ui-ux.md`、`docs/runbooks/e2e-quality-baseline.md`。
  - 必读上下文：`scripts/run-e2e.ts`、`e2e/terminal-session.spec.ts`、`playwright.config.ts`。
  - 修改范围：`scripts/run-e2e.ts`、新增或更新 `e2e/*.spec.ts`。
  - 依赖：2.3。
  - 并行：否（selectors 和 fixture 依赖最终 UI）。

- [x] 3.2 运行质量检查并修复发现的问题
  - 验收标准：相关 unit tests、`bun run e2e`、`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build` 通过，或明确记录无法执行的环境原因和回流建议。
  - 依据：`plan.md`、`design/error-handling.md`。
  - 必读上下文：`package.json`、`docs/runbooks/e2e-quality-baseline.md`。
  - 修改范围：测试修复所需文件；不得扩大功能范围。
  - 依赖：3.1。
  - 并行：否（最终门禁）。

- [x] 3.3 更新 workflow 实现进度
  - 验收标准：所有实现任务完成后勾选本文件任务，`progress.md` 将 implementation 标记为已完成并推进到 `待验证`；如有阻塞，保持任务未勾选并记录原因。
  - 依据：`plan.md`、`progress.md`。
  - 必读上下文：`.workflow/changes/implement-file-browser-preview/progress.md`。
  - 修改范围：`.workflow/changes/implement-file-browser-preview/tasks.md`、`.workflow/changes/implement-file-browser-preview/progress.md`。
  - 依赖：3.2。
  - 并行：否（收口任务）。

## 依赖图

- 1.1 → 2.1 → 2.2 → 2.3 → 3.1 → 3.2 → 3.3

## 可并行任务

- 2.2 在 2.1 的 route path 契约固定后可与部分 UI skeleton 并行，但当前 change 文件范围较集中，建议顺序执行以避免返工。

## 阻塞项

- （无）
