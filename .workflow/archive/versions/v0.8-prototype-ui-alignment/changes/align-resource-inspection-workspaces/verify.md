# verify

本文件记录当前 change 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：align-resource-inspection-workspaces
- Roadmap 对应项：v0.8-prototype-ui-alignment / Files、Git、Terminal resource workspace prototype alignment
- 验证对象：Project Files/Git/Terminal direct secondary workspaces、mobile Files preview detail、mobile Git diff detail、Terminal create/open/close entry boundary
- 验证结论：通过

## 验证轮次

### Round 1

- 时间：2026-05-29
- 验证范围：specs/resource-inspection-workspaces 中全部 ADDED requirements；tasks.md 1.1、2.1、2.2、2.3、2.4、3.1、3.2、3.3；design/ui-ux.md 与 design/frontend.md 中 resource direct/deep、shared primitive、能力边界约束。
- 使用 harness：TypeScript typecheck、focused Bun test、git diff whitespace check、Playwright browser artifact capture on managed `ar-dev` (API 43011 / Web 43012 / PROJECTS_ROOT=/home/deploy/workspace)。
- 本轮结论：通过，无 CRITICAL/WARNING。
- 后续动作：可进入 distill-change。

## Harness 清单

- 名称：Web TypeScript typecheck
  类型：静态检查
  覆盖承诺：React/TypeScript route 与 shell primitive 类型正确，未引入无效 API/type 边界。
  执行方式：`bun run --cwd web typecheck`
  结果：通过
  证据：命令输出 `$ tsc --noEmit`，无错误。

- 名称：Focused console model tests
  类型：单元测试
  覆盖承诺：console route/model 相关既有测试保持通过。
  执行方式：`bun test web/src/routes/console-model.test.ts`
  结果：通过，8 pass / 0 fail / 25 expect calls。
  证据：命令输出。

- 名称：Whitespace diff check
  类型：静态检查
  覆盖承诺：实现 diff 无 whitespace 错误。
  执行方式：`git diff --check`
  结果：通过
  证据：命令无输出。

- 名称：Resource workspace browser artifacts
  类型：真实浏览器验证 / 截图 / 结构断言
  覆盖承诺：prototype/app desktop/mobile 截图、Files/Git read-only、Terminal direct workspace no runtime input、mobile direct/deep bottom nav 互斥、Terminal Close confirm。
  执行方式：`bun .workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/artifacts/capture-resource-artifacts.mjs`
  结果：通过，`browser-check.log` 无 failed/pageerror/console-error 条目。
  证据：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/artifacts/browser-check.log`

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| spec: Files workspace | Desktop Files 显示 Project shell + path toolbar + file list + preview split；mobile direct 显示 list + bottom nav；无 Files 写操作 | `web/src/routes/ProjectConsoleRoute.tsx` 中 `FilesPanel`、`ResourceToolbar`、`ResourceSplitLayout`、`FileEntryList`、`FilePreviewPanel`；未修改 Files API/query 边界 | `app-files-desktop.png`、`app-files-mobile.png`；`browser-check.log` files forbidden-copy passed、files-direct bottom nav passed | 通过 |
| spec: File preview detail | Mobile file preview deep detail 隐藏 Project bottom nav，显示顶部返回；desktop 保持 split | `selectedFilePath` 仍为本地 state；`useEffect` 驱动 `onDeepDetailChange`；`MobileDetailHeader` 使用 shared `ActionButton` | `app-files-mobile-preview-detail.png`；`browser-check.log` files-preview-detail bottom nav expected false / actual false | 通过 |
| spec: Git workspace | Desktop Git 显示 read-only status summary + changed-file list + diff split；mobile direct 显示 changed-file list + bottom nav；无 Git 写操作 | `GitDiffPanel` 使用现有 `listProjectGitDiff`/`getProjectGitFileDiff`；`GitSummaryPills` 只从真实 changed files 派生；Retry 仅 refetch | `app-git-desktop.png`、`app-git-mobile.png`；`browser-check.log` git forbidden-copy passed、git-direct bottom nav passed | 通过 |
| spec: Git diff detail | Mobile diff deep detail 隐藏 Project bottom nav，显示顶部返回；desktop 保持 split | `selectedFile` 仍为本地 state；`MobileDetailHeader` + `GitFileDiffPanel`；diff code surface wraps/scrolls | `app-git-mobile-diff-detail.png`；`browser-check.log` git-diff-detail bottom nav expected false / actual false | 通过 |
| spec: Terminal workspace | Terminal direct secondary 只显示 live instances + New/Open detail/Close；不显示 runtime output/input/quick keys/composer | `TerminalPanel` 使用 `ResourceToolbar`；`TerminalInstanceRow` 使用 `SessionInstanceRow`、`ActionButton`、`actionButtonClasses`；`fromAgentSession` remains undefined | `app-terminal-desktop.png`、`app-terminal-mobile.png`；`browser-check.log` terminal-runtime-input-absent passed、terminal-close-confirm passed | 通过 |
| design/frontend | Shared shell primitives 是视觉边界；不抽象 API/query/data transformation | `actionButtonClasses` exported from shell primitives；route-local `ResourceToolbar`/`ResourceSplitLayout`/`ResourceStatePanel` only wrap UI; TanStack Query stays in route panels | Typecheck/test passed；diff review shows API/client/shared DTO unchanged | 通过 |
| tasks 3.2 | Artifacts 覆盖 prototype/app desktop/mobile 和 mobile deep detail | artifacts directory contains prototype-files/git/terminal desktop/mobile, app-files/git/terminal desktop/mobile, app-files-mobile-preview-detail, app-git-mobile-diff-detail, browser-check.log | `ls artifacts` and `browser-check.log` | 通过 |

## Delta 验证

- Scope 内变更：`web/src/routes/ProjectConsoleRoute.tsx` resource workspace UI alignment；`web/src/components/shell/shell-primitives.tsx` export `ShellTone` and `actionButtonClasses` so links/buttons share action styling；change specs/design/plan/tasks/progress/artifacts/verify files.
- Scope 外变更：无长期 docs 更新；无 API/client/shared DTO/runtime protocol 修改；无新增依赖。
- 未被 spec/design 支撑的新行为：无。Git summary 仅由真实 `GitDiffFileSummary[]` 派生；Terminal fixture session 仅用于 browser artifact，UI 未伪造 runtime output/history/metadata。
- 风险：Terminal prototype 中 history/output/restore 仍是原型-only 表达，本 change 按能力边界不渲染；当前已有 follow-up gap 规则，无新增 gap 必要。
- 结论：通过。

## Scenario 验证

- 场景：Desktop Files list + preview inspection
  路径类型：用户可见
  验证方式：Playwright screenshot and forbidden-copy assertion
  证据：`app-files-desktop.png`；`browser-check.log` lines for files forbidden-copy
  结果：通过

- 场景：Mobile Files direct workspace and preview detail
  路径类型：用户可见 / 边界
  验证方式：Playwright screenshot, select real file `.gitignore`, assert bottom nav visible in direct and hidden in detail
  证据：`app-files-mobile.png`、`app-files-mobile-preview-detail.png`；`browser-check.log` files-direct/files-preview-detail checks
  结果：通过

- 场景：Desktop Git read-only diff inspection
  路径类型：用户可见
  验证方式：Playwright screenshot and forbidden-copy assertion using real Git diff data
  证据：`app-git-desktop.png`；`browser-check.log` git forbidden-copy
  结果：通过

- 场景：Mobile Git direct workspace and diff detail
  路径类型：用户可见 / 边界
  验证方式：Playwright screenshot, select first real changed file, assert bottom nav visible in direct and hidden in detail
  证据：`app-git-mobile.png`、`app-git-mobile-diff-detail.png`；`browser-check.log` git-direct/git-diff-detail checks
  结果：通过

- 场景：Terminal direct secondary workspace
  路径类型：用户可见 / 能力边界
  验证方式：Playwright screenshot using real Terminal session fixture; assert bottom nav visible, runtime input absent, Close confirm appears and is dismissed
  证据：`app-terminal-desktop.png`、`app-terminal-mobile.png`；`browser-check.log` terminal-runtime-input-absent、terminal-close-visible、terminal-close-confirm
  结果：通过

## Evidence 清单

- 类型：测试
  路径或命令：`bun run --cwd web typecheck`
  结果：通过
  说明：TypeScript no emit check passed.

- 类型：测试
  路径或命令：`bun test web/src/routes/console-model.test.ts`
  结果：通过
  说明：8 tests passed, 0 failed.

- 类型：测试
  路径或命令：`git diff --check`
  结果：通过
  说明：No whitespace errors.

- 类型：代码引用
  路径或命令：`web/src/components/shell/shell-primitives.tsx`
  结果：通过
  说明：`ShellTone` and `actionButtonClasses` allow route links and buttons to share shell action styling.

- 类型：代码引用
  路径或命令：`web/src/routes/ProjectConsoleRoute.tsx`
  结果：通过
  说明：Files/Git/Terminal use resource toolbar/split/state/session row helpers while keeping API/query/local state in route panels.

- 类型：日志
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/artifacts/browser-check.log`
  结果：通过
  说明：All structural assertions passed.

## 交互式 Artifact 清单

- 类型：截图
  路径或命令：`artifacts/prototype-files-desktop.png`、`prototype-files-mobile.png`、`prototype-git-desktop.png`、`prototype-git-mobile.png`、`prototype-terminal-desktop.png`、`prototype-terminal-mobile.png`
  结果：通过
  说明：Prototype screenshots captured at `1440x1000` and `390x844`.

- 类型：截图
  路径或命令：`artifacts/app-files-desktop.png`、`app-files-mobile.png`、`app-git-desktop.png`、`app-git-mobile.png`、`app-terminal-desktop.png`、`app-terminal-mobile.png`
  结果：通过
  说明：Real app workspace screenshots captured at `1440x1000` and `390x844` using `ar-dev`.

- 类型：截图
  路径或命令：`artifacts/app-files-mobile-preview-detail.png`、`app-git-mobile-diff-detail.png`
  结果：通过
  说明：Mobile deep detail screenshots prove Files/Git hide Project bottom nav and show top return.

- 类型：浏览器日志 / 结构断言
  路径或命令：`artifacts/browser-check.log`
  结果：通过
  说明：Records forbidden action copy checks, bottom navigation visibility, Terminal runtime input absence, and Terminal close confirmation.

- 类型：自动化脚本
  路径或命令：`artifacts/capture-resource-artifacts.mjs`
  结果：通过
  说明：Reproducible browser artifact capture script for this change.

## Version Shared 验证记录

- shared path：`.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md`
  验证方式：Browser artifacts match required Prototype Map and viewport coverage for `files.html`、`git.html`、`terminal.html`.
  结果：通过

- shared path：`.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md`
  验证方式：Implementation uses shell primitives/helper boundary for surface/list/status/action/mobile return; no private Files/Git/Terminal write/runtime controls added.
  结果：通过

- shared path：`.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md`
  验证方式：Reviewed current gaps and implementation/artifacts; no new resource gap required because unsupported prototype-only areas are not rendered or are truthfully expressed.
  结果：通过

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 通过 | tasks 1.1、2.1、2.2、2.3、2.4、3.1、3.2、3.3 已完成；spec scenarios 均有 code/check/artifact 证据。 |
| Correctness | 通过 | Static checks passed; browser assertions verify read-only boundaries, mobile bottom nav direct/deep behavior, and Terminal close confirm. |
| Coherence | 通过 | Resource UI now uses shared shell/action/list/status language and keeps route-local query/state boundaries. |

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
