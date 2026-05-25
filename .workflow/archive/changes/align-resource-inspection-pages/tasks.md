# tasks

## 执行顺序

1. 先建立 Project resource mobile deep detail shell 状态，让 bottom nav 可以在 Files/Git preview/diff detail 中隐藏。
2. 再对齐 Files workspace 的 compact direct secondary 与 mobile preview deep detail。
3. 再对齐 Git workspace 的 compact direct secondary 与 mobile diff deep detail。
4. 再整理 Terminal workspace 的 instance list/create/enter/close 状态和密度。
5. 最后运行 web 检查并用真实浏览器采集 desktop/mobile resource workspace 证据。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 建立 resource deep detail shell 状态
  - 验收标准：`ProjectConsole` 能根据 Files preview 或 Git diff deep state 隐藏移动端 Project 二级底部导航；直接二级 Files/Git/Terminal workspace 仍显示底部二级导航；不影响 desktop 二级侧栏；不新增 route。
  - 依据：`plan.md`；`specs/file-browser-preview/spec.md`；`specs/git-diff-viewer/spec.md`；`design/overview.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`docs/design/frontend-ui-architecture.md`；`docs/design/prototype/guidelines.md`；`web/src/routes/ProjectConsoleRoute.tsx`
  - 修改范围：`web/src/routes/ProjectConsoleRoute.tsx`
  - 依赖：无
  - 并行：否（阻塞 Files/Git mobile deep detail）

### 2. 核心实现任务

- [x] 2.1 对齐 Files workspace 与 mobile preview deep detail
  - 验收标准：Files 直接二级页使用 compact path/list/preview 结构；移动端选择文件后显示顶部返回 Files list 的 preview detail 并隐藏 Project 二级底部导航；桌面仍保留可扫读 list + preview；Files 不显示任何写操作；loading/empty/error/unsupported/too_large 状态可见。
  - 依据：`plan.md`；`specs/file-browser-preview/spec.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`docs/specs/file-browser-preview/spec.md`；`docs/design/file-browser-preview.md`；`docs/design/prototype/files.html`；`web/src/routes/ProjectConsoleRoute.tsx`；`web/src/api/client.ts`
  - 修改范围：`web/src/routes/ProjectConsoleRoute.tsx`
  - 依赖：1.1
  - 并行：否（与 2.2/2.3 同文件）

- [x] 2.2 对齐 Git workspace 与 mobile diff deep detail
  - 验收标准：Git 直接二级页使用 compact status/list/diff 结构；移动端选择文件后显示顶部返回 changed files 的 diff detail 并隐藏 Project 二级底部导航；桌面仍保留可扫读 changed-file list + unified diff；Git 不显示写操作；not repository/no changes/error/loading 状态可见。
  - 依据：`plan.md`；`specs/git-diff-viewer/spec.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`docs/specs/git-diff-viewer/spec.md`；`docs/design/git-diff-viewer.md`；`docs/design/prototype/git.html`；`web/src/routes/ProjectConsoleRoute.tsx`；`web/src/api/client.ts`
  - 修改范围：`web/src/routes/ProjectConsoleRoute.tsx`
  - 依赖：1.1
  - 并行：否（与 2.1/2.3 同文件）

- [x] 2.3 对齐 Terminal workspace instance list
  - 验收标准：Terminal 直接二级页展示 compact Terminal instances、New Terminal、Open detail、Close confirm、loading/empty/create error/close error/pending 状态；移动端直接二级页显示 Project 二级底部导航且不出现 runtime input；长 session id/displayName 不横向溢出。
  - 依据：`plan.md`；`specs/session-runtime/spec.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`docs/specs/session-runtime/spec.md`；`docs/design/console-shell.md`；`docs/design/prototype/terminal.html`；`web/src/routes/ProjectConsoleRoute.tsx`
  - 修改范围：`web/src/routes/ProjectConsoleRoute.tsx`
  - 依赖：1.1
  - 并行：否（同文件）

### 3. 集成与验证任务

- [x] 3.1 运行 web 检查并准备 resource workspace 浏览器证据
  - 验收标准：`bun run format:check`、`bun run lint`、`bun --filter @agents-remote/web typecheck`、`bun --filter @agents-remote/web test`、`bun --filter @agents-remote/web build` 通过；真实浏览器检查桌面/移动 Files direct secondary、Files preview deep detail、Git direct secondary、Git diff deep detail、Terminal direct secondary、Terminal create pending/error 或 success、Terminal close confirm、无 Files/Git 写操作、deep detail 无 Project 二级底部导航；截图/日志放入本 change artifacts 供 verify-change 使用。
  - 依据：`plan.md`；`specs/file-browser-preview/spec.md`；`specs/git-diff-viewer/spec.md`；`specs/session-runtime/spec.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`docs/project.md` 测试与质量门禁；现有 browser harness 模式；`web/src/routes/ProjectConsoleRoute.tsx`
  - 修改范围：`.workflow/changes/align-resource-inspection-pages/artifacts/`；必要时新增本 change 专用 browser check 脚本
  - 依赖：2.1、2.2、2.3
  - 并行：否（必须在实现完成后执行）

## 依赖图

- 1.1 → 2.1 → 3.1
- 1.1 → 2.2 → 3.1
- 1.1 → 2.3 → 3.1

## 可并行任务

- （无；实现集中在同一 `ProjectConsoleRoute.tsx`，验证依赖实现完成）

## 阻塞项

- （无）
