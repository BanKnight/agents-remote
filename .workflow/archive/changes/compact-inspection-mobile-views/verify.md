# verify

本文件记录当前 change 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：compact-inspection-mobile-views
- Roadmap 对应项：v0.5-mobile-ux-polish / compact-inspection-mobile-views
- 验证对象：Project workspace 内 Files/Git 只读 inspection 移动端紧凑列表、内容优先详情和只读边界
- 验证结论：通过

## 验证轮次

### Round 1

- 时间：2026-05-25
- 验证范围：Files/Git compact mobile rows、detail wrapper、文件预览、unified diff、长文本/路径横向溢出约束、只读边界和既有 e2e 路径。
- 使用 harness：format/lint/typecheck/unit tests/build、完整 e2e harness、手机竖屏 Playwright smoke screenshot、git diff delta 检查。
- 本轮结论：通过
- 后续动作：进入 `distill-change`，将已验证的 Files/Git 移动端 inspection 密度规则沉淀到长期 docs。

## Harness 清单

- 名称：format/lint/typecheck/test/build
  类型：静态检查 / 单元测试 / 构建
  覆盖承诺：实现可编译、格式一致、未引入 lint/type 错误，现有 Files/Git/console model 测试仍通过。
  执行方式：`bun run format:check`、`bun run lint`、`bun run typecheck`、`bun run test`、`bun run build`
  结果：通过
  证据：命令输出；`build` 输出 web production bundle 成功。

- 名称：完整 e2e harness
  类型：Playwright e2e
  覆盖承诺：登录、Project 进入、Files 浏览/预览、Git changed-file list 和单文件 diff、Terminal 基线不回归。
  执行方式：`E2E_ARTIFACTS_DIR=.workflow/changes/compact-inspection-mobile-views/artifacts/e2e bun run e2e`
  结果：通过，3 tests passed。
  证据：`.workflow/changes/compact-inspection-mobile-views/artifacts/e2e/playwright-report/index.html`、`e2e-api.log`、`e2e-web.log`

- 名称：移动端 Files/Git smoke screenshot
  类型：手机竖屏真实浏览器截图
  覆盖承诺：Files/Git 在 390x844 手机视口中显示紧凑列表和内容优先详情，且保存可审查 artifact。
  执行方式：`bun /tmp/compact-inspection-mobile-smoke.ts`
  结果：通过
  证据：`.workflow/changes/compact-inspection-mobile-views/artifacts/mobile-files-compact.png`、`.workflow/changes/compact-inspection-mobile-views/artifacts/mobile-git-compact.png`、`mobile-inspection-api.log`、`mobile-inspection-web.log`

- 名称：Delta 检查
  类型：git diff review
  覆盖承诺：实现变更集中在本 change scope，不修改 API/shared/backend，不引入 Files/Git 写操作。
  执行方式：`git status --short`、`git diff --stat`、`git diff -- web/src/routes/ProjectConsoleRoute.tsx .workflow/changes/compact-inspection-mobile-views`
  结果：通过
  证据：diff 只显示 workflow 产物和 `web/src/routes/ProjectConsoleRoute.tsx` 的 Files/Git UI 密度调整。

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| `specs/file-browser-preview/spec.md` | Files mobile listing uses compact scan-friendly rows | `web/src/routes/ProjectConsoleRoute.tsx:737` 的 `Project files` 列表使用 `gap-1.5`；`web/src/routes/ProjectConsoleRoute.tsx:741` 使用 `min-w-0 rounded-2xl px-3 py-2.5` compact row；`web/src/routes/ProjectConsoleRoute.tsx:753` 使用 `min-w-0` + truncate 防止长名称撑宽 | `bun run e2e` 的 `e2e/file-browser.spec.ts` 通过；截图 `.workflow/changes/compact-inspection-mobile-views/artifacts/mobile-files-compact.png` | 通过 |
| `specs/file-browser-preview/spec.md` | Files mobile preview prioritizes selected content | `web/src/routes/ProjectConsoleRoute.tsx:807` 的 preview panel 使用紧凑 header；`web/src/routes/ProjectConsoleRoute.tsx:835` 文本预览使用 `max-h-[68vh] overflow-auto whitespace-pre-wrap break-words` | `e2e/file-browser.spec.ts` 覆盖 README/text/image preview；截图 `mobile-files-compact.png` | 通过 |
| `specs/file-browser-preview/spec.md` | Files mobile inspection remains read-only | 实现只保留 Root/Up/Retry、目录打开和文件预览；`web/src/routes/ProjectConsoleRoute.tsx:649`、`web/src/routes/ProjectConsoleRoute.tsx:656`、`web/src/routes/ProjectConsoleRoute.tsx:664` 为导航/重试按钮，无 edit/delete/upload/download affordance | Delta 检查未发现 API/shared/backend 或写操作入口变更；Files e2e 通过 | 通过 |
| `specs/git-diff-viewer/spec.md` | Git mobile changed-file list uses compact review rows | `web/src/routes/ProjectConsoleRoute.tsx:497` 的 `Git changed files` 列表使用 `gap-1.5`；`web/src/routes/ProjectConsoleRoute.tsx:502` 使用 compact row；`web/src/routes/ProjectConsoleRoute.tsx:523` 保留 scope/status 文字 badge | `bun run e2e` 的 `e2e/git-diff.spec.ts` 通过；截图 `.workflow/changes/compact-inspection-mobile-views/artifacts/mobile-git-compact.png` | 通过 |
| `specs/git-diff-viewer/spec.md` | Git mobile diff prioritizes selected file content | `web/src/routes/ProjectConsoleRoute.tsx:574` 的 diff panel 使用紧凑 header；`web/src/routes/ProjectConsoleRoute.tsx:594` unified diff 使用 `max-h-[68vh] overflow-auto whitespace-pre-wrap break-words` | `e2e/git-diff.spec.ts` 覆盖 worktree/staged diff；截图 `mobile-git-compact.png` | 通过 |
| `specs/git-diff-viewer/spec.md` | Git mobile inspection remains read-only | 实现只保留 Retry、changed-file selection 和 diff read-only `<pre>`；无 stage/commit/reset/push/pull 等按钮或 API 调用 | Delta 检查未发现 Git 写操作；Git e2e 通过 | 通过 |
| `tasks.md` | 1.1/2.1/2.2/3.1 全部完成 | `tasks.md` 已全部勾选；`progress.md` implementation 已记录通过质量门禁和 artifact | format/lint/typecheck/test/build/e2e/smoke 均通过 | 通过 |

## Delta 验证

- Scope 内变更：创建本 change specs/design/plan/tasks/verify/artifacts；更新 `progress.md`；调整 `ProjectConsoleRoute.tsx` 中 `SectionDetail`、`GitDiffPanel`、`GitFileList`、`GitFileDiffPanel`、`FilesPanel`、`FileEntryList`、`FilePreviewPanel`、`PreviewBody` 的移动端密度 className/markup。
- Scope 外变更：无 API、shared DTO、后端、routing、auth、runtime 或 Session detail 变更。
- 未被 spec/design 支撑的新行为：无。
- 风险：直接 Playwright 子集命令曾因临时安全分类器不可用未执行；已用项目完整 e2e harness 覆盖并通过，不影响结论。
- 结论：通过。

## Scenario 验证

- 场景：用户在手机竖屏浏览 Files 并预览文本文件
  路径类型：正常 / 用户可见
  验证方式：Playwright smoke 登录、进入 Project、打开 Files、选择 README.md、截图。
  证据：`.workflow/changes/compact-inspection-mobile-views/artifacts/mobile-files-compact.png`
  结果：通过

- 场景：用户在手机竖屏查看 Git changed files 并打开单文件 diff
  路径类型：正常 / 用户可见
  验证方式：Playwright smoke 登录、进入 Project、打开 Git、选择 README.md、截图。
  证据：`.workflow/changes/compact-inspection-mobile-views/artifacts/mobile-git-compact.png`
  结果：通过

- 场景：Files/Git 既有 e2e 路径不回归
  路径类型：正常 / 回归
  验证方式：`bun run e2e`，包含 file-browser、git-diff、terminal-session 三条 e2e。
  证据：`.workflow/changes/compact-inspection-mobile-views/artifacts/e2e/playwright-report/index.html`
  结果：通过

- 场景：长路径和 diff/text 内容不造成页面级横向溢出
  路径类型：边界 / 用户可见
  验证方式：实现检查 `min-w-0`、`truncate`、`break-words`、`overflow-auto` 约束，并在手机截图 smoke 中包含长路径 fixture。
  证据：`web/src/routes/ProjectConsoleRoute.tsx:497`、`web/src/routes/ProjectConsoleRoute.tsx:574`、`web/src/routes/ProjectConsoleRoute.tsx:737`、`web/src/routes/ProjectConsoleRoute.tsx:807`；截图 artifact。
  结果：通过

## Evidence 清单

- 类型：测试
  路径或命令：`bun run format:check`
  结果：通过
  说明：所有匹配文件格式正确。

- 类型：测试
  路径或命令：`bun run lint`
  结果：通过
  说明：0 warnings / 0 errors。

- 类型：测试
  路径或命令：`bun run typecheck`
  结果：通过
  说明：api/shared/web/e2e TypeScript 检查通过。

- 类型：测试
  路径或命令：`bun run test`
  结果：通过
  说明：api 75 tests、shared 6 tests、web 21 tests 全部通过。

- 类型：测试
  路径或命令：`bun run build`
  结果：通过
  说明：api/shared/web production build 成功。

- 类型：e2e
  路径或命令：`E2E_ARTIFACTS_DIR=.workflow/changes/compact-inspection-mobile-views/artifacts/e2e bun run e2e`
  结果：通过
  说明：3 Playwright tests passed。

- 类型：代码引用
  路径或命令：`web/src/routes/ProjectConsoleRoute.tsx:371`、`:497`、`:574`、`:638`、`:737`、`:807`
  结果：通过
  说明：共享 wrapper、Git list/diff、Files path/list/preview 都已压缩并保留可读状态文字。

## 交互式 Artifact 清单

- 类型：截图
  路径或命令：`.workflow/changes/compact-inspection-mobile-views/artifacts/mobile-files-compact.png`
  结果：通过
  说明：手机竖屏 Files compact list + file preview 证据。

- 类型：截图
  路径或命令：`.workflow/changes/compact-inspection-mobile-views/artifacts/mobile-git-compact.png`
  结果：通过
  说明：手机竖屏 Git compact changed-file list + file diff 证据。

- 类型：自动化测试报告
  路径或命令：`.workflow/changes/compact-inspection-mobile-views/artifacts/e2e/playwright-report/index.html`
  结果：通过
  说明：完整 e2e harness 报告。

- 类型：服务日志
  路径或命令：`.workflow/changes/compact-inspection-mobile-views/artifacts/e2e/e2e-api.log`、`.workflow/changes/compact-inspection-mobile-views/artifacts/e2e/e2e-web.log`
  结果：通过
  说明：e2e harness web/api 日志。

- 类型：服务日志
  路径或命令：`.workflow/changes/compact-inspection-mobile-views/artifacts/mobile-inspection-api.log`、`.workflow/changes/compact-inspection-mobile-views/artifacts/mobile-inspection-web.log`
  结果：通过
  说明：移动端 screenshot smoke web/api 日志。

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 通过 | Files 与 Git specs 的 compact list、content-first detail、只读边界均有实现和 artifact 证据；tasks 全部完成。 |
| Correctness | 通过 | format/lint/typecheck/test/build/e2e/smoke 均通过；既有 Files/Git/Terminal e2e 未回归。 |
| Coherence | 通过 | 实现沿用现有 React/TanStack Query/local state/Tailwind 模式，不新增 API/route/dependency，不越过只读边界。 |

## 问题清单

### CRITICAL

- （无）

### WARNING

- （无）

### SUGGESTION

- （无）

## 回流建议

- （无）

## 最终结论

- 结论：通过
- 是否允许进入 distill-change：是
- 条件或阻塞：无
