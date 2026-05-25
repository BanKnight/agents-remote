# verify

本文件记录当前 change 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：implement-git-diff-viewer
- Roadmap 对应项：v0.4-project-inspection-tools / implement-git-diff-viewer
- 验证对象：shared Git diff DTO/error codes、ProjectGitDiffService、Project-scoped Git diff HTTP route、web API client、Project console Git section、Playwright Git diff E2E。
- 验证结论：通过

## 验证轮次

### Round 1

- 时间：2026-05-25
- 验证范围：对照 specs/design/tasks 检查只读 Git diff viewer 的 API、web UI、E2E fixture/spec、错误状态、Project-safe path 和质量门禁。
- 使用 harness：focused unit/integration tests、Playwright E2E、workspace full quality gate、代码 trace。
- 本轮结论：通过；无 CRITICAL / WARNING。
- 后续动作：进入 `distill-change`，沉淀 Git diff viewer WHAT/HOW。

## Harness 清单

- 名称：Git diff focused tests
  类型：unit / integration tests
  覆盖承诺：shared DTO、ProjectGitDiffService 状态映射、HTTP route、web API client URL encoding、Project console model。
  执行方式：`bun test api/src/project-git-diff.test.ts api/src/index.test.ts web/src/api/client.test.ts web/src/routes/console-model.test.ts`
  结果：通过；39 pass，125 expect calls。
  证据：命令输出；`api/src/project-git-diff.test.ts`、`api/src/index.test.ts`、`web/src/api/client.test.ts`、`web/src/routes/console-model.test.ts`。

- 名称：Git diff browser E2E
  类型：Playwright E2E
  覆盖承诺：真实登录/Project/Git path，worktree/staged/untracked 变更列表，scope/status badge，单文件 unified diff，Terminal smoke 回归。
  执行方式：`bun run e2e`
  结果：通过；3 tests passed。
  证据：`e2e/git-diff.spec.ts`；E2E 输出显示 file-browser、git-diff、terminal-session 三条 spec 通过。

- 名称：Workspace quality gate
  类型：format / lint / typecheck / unit / build
  覆盖承诺：实现可格式化、无 lint warning、类型正确、所有 workspace tests 和 build 通过。
  执行方式：`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build`
  结果：通过；api 75 pass、shared 6 pass、web 22 pass，api/shared/web build 通过。
  证据：命令输出。

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| spec: Git diff viewer is read-only | Project console Git 只展示 diff 观察，不提供 Git 写操作；API 不提供 stage/commit/reset 等写 route。 | `api/src/project-git-diff.ts:43` 只实现 list/file diff；`api/src/index.ts` 只接入 GET route；`web/src/routes/ProjectConsoleRoute.tsx:398` Git UI 只有 Retry、file select 和 diff display。 | focused tests 39 pass；E2E Git spec 只点击 Git section 和文件项；代码 trace 未发现 Git write API/UI。 | 通过 |
| spec: non-repository Projects clearly reported | 非 Git 仓库 list 返回 `repository: false`，UI 显示普通非 Git 状态；单文件 diff 返回明确错误。 | `api/src/project-git-diff.ts:46` 返回 `repository: false`；`web/src/routes/ProjectConsoleRoute.tsx:451` 渲染 “Not a Git repository”；`api/src/index.ts` 映射 `PROJECT_GIT_NOT_REPOSITORY`。 | `api/src/project-git-diff.test.ts` 覆盖非仓库 list/file；`api/src/index.test.ts` 覆盖 HTTP 状态。 | 通过 |
| spec: worktree and staged changed file list | 列表同时包含 staged、worktree 和 untracked 变更，并包含 path、scope、status。 | `api/src/project-git-diff.ts:54` staged name-status；`api/src/project-git-diff.ts:58` worktree name-status；`api/src/project-git-diff.ts:62` untracked files；`packages/shared/src/index.ts:82` summary DTO。 | service tests 覆盖 staged/worktree/untracked；E2E 断言 README/worktree、src/index.ts/staged、notes.txt。 | 通过 |
| spec: basic status types | modified/added/deleted/renamed 映射为稳定 DTO，UI 用可读 badge 展示。 | `api/src/project-git-diff.ts:219` mapGitStatus；`web/src/routes/ProjectConsoleRoute.tsx:520` status badge；`web/src/routes/ProjectConsoleRoute.tsx:594` statusLabel。 | service tests 覆盖 modified/added/deleted/renamed；E2E 覆盖 Modified badge。 | 通过 |
| spec: single-file unified diff | 用户选择单个文件后显示该 scope/path 的 unified diff，以 `<pre>` 纯文本呈现。 | `api/src/project-git-diff.ts:110` 根据 scope/status 读取单文件 diff；`web/src/routes/ProjectConsoleRoute.tsx:404` file diff query；`web/src/routes/ProjectConsoleRoute.tsx:589` `<pre>` 渲染 diff 文本。 | `api/src/project-git-diff.test.ts` 覆盖 staged/worktree/untracked diff；E2E 断言 README 和 src/index.ts diff 内容。 | 通过 |
| spec: Project-scoped Git diff access | Git 命令 cwd 来自 Project-safe resolver；file diff path 必须先存在于当前变更列表，拒绝绝对路径和 `..`。 | `api/src/project-git-diff.ts:132` 使用 `resolveProjectRelativePath`；`api/src/project-git-diff.ts:82` 拒绝不安全 path；`api/src/project-git-diff.ts:104` 只允许当前变更列表中的 path；`api/src/project-git-diff.ts:161` 使用 argv 数组执行 `git -C`。 | service tests 覆盖 invalid scope、unchanged、`../outside.txt`、absolute path；HTTP route tests 通过。 | 通过 |
| design/frontend | Git section 使用本地 selected file state、TanStack Query、同域 `/api` client，不新增依赖；diff 保留空白并可滚动。 | `web/src/routes/ProjectConsoleRoute.tsx:399` selected local state；`web/src/routes/ProjectConsoleRoute.tsx:400` list query；`web/src/api/client.ts:90` Git client helpers；`web/src/routes/ProjectConsoleRoute.tsx:589` `whitespace-pre` + overflow。 | web typecheck 通过；E2E 通过；full quality gate 通过。 | 通过 |
| tasks | 1.1-3.3 全部实现并勾选，包含 focused tests、E2E 和完整质量门禁。 | `.workflow/changes/implement-git-diff-viewer/tasks.md` 全部勾选；`progress.md` implementation 已完成。 | focused tests、`bun run e2e`、full quality gate 均通过。 | 通过 |

## Delta 验证

- Scope 内变更：新增 Git diff shared DTO/error code、`ProjectGitDiffService`、Project-scoped Git diff HTTP routes、web API client helper、Project console Git diff UI、Git diff Playwright spec、E2E fixture Git repo changes，以及 workflow progress/tasks/verify。
- Scope 外变更：为 E2E Git repo 初始化导致 File Browser E2E root listing 期望包含 `.git` 与 `notes.txt`；这是同一临时 Project fixture 的必要回归调整。v0.3 已完成版本归档，属于用户指出的 workflow 收口，不改变产品运行时行为。
- 未被 spec/design 支撑的新行为：无。没有 Git 写 API/UI；E2E runner 内部使用 `git init/add/commit` 只为准备测试 fixture，不是产品能力。
- 风险：单文件 diff 第一轮不分页，长 diff 可能滚动较大；已符合 design 的第一轮边界，后续可按使用反馈扩展 limit/pagination。
- 结论：通过。

## Scenario 验证

- 场景：用户打开 Git section 查看 worktree/staged 变化
  路径类型：正常 / 用户可见
  验证方式：Playwright 登录、进入 Project、打开 Git section。
  证据：`e2e/git-diff.spec.ts`；`bun run e2e` 通过。
  结果：通过。

- 场景：用户点击 worktree modified 文件查看 unified diff
  路径类型：正常 / 用户可见
  验证方式：E2E 点击 README.md，断言 diff panel 包含 path、Worktree · Modified 和新增行。
  证据：`e2e/git-diff.spec.ts:24`；`bun run e2e` 通过。
  结果：通过。

- 场景：用户点击 staged modified 文件查看 unified diff
  路径类型：正常 / 用户可见
  验证方式：E2E 点击 `src/index.ts`，断言 diff panel 包含 Staged · Modified 和新增 export 行。
  证据：`e2e/git-diff.spec.ts:30`；`bun run e2e` 通过。
  结果：通过。

- 场景：Project 不是 Git 仓库
  路径类型：边界 / 用户可见
  验证方式：service + HTTP tests 覆盖 list 返回 `repository: false`、file diff 返回 `PROJECT_GIT_NOT_REPOSITORY`。
  证据：`api/src/project-git-diff.test.ts`、`api/src/index.test.ts`。
  结果：通过。

- 场景：请求非法 scope、未变更文件或越界 path
  路径类型：失败 / 安全
  验证方式：service tests 覆盖 invalid scope、unchanged、`../outside.txt` 和 absolute path。
  证据：`api/src/project-git-diff.test.ts`。
  结果：通过。

- 场景：现有 Files 与 Terminal E2E 不回归
  路径类型：回归
  验证方式：`bun run e2e` 同时运行 file-browser、git-diff、terminal-session spec。
  证据：E2E 输出 3 passed。
  结果：通过。

## Evidence 清单

- 类型：测试
  路径或命令：`bun test api/src/project-git-diff.test.ts api/src/index.test.ts web/src/api/client.test.ts web/src/routes/console-model.test.ts`
  结果：通过；39 pass，125 expect calls。
  说明：覆盖 service、HTTP route、web client 和 console model。

- 类型：E2E
  路径或命令：`bun run e2e`
  结果：通过；3 Playwright tests passed。
  说明：覆盖 Files、Git diff、Terminal smoke。

- 类型：质量门禁
  路径或命令：`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build`
  结果：通过。
  说明：format/lint/typecheck/tests/build 全部通过。

- 类型：代码引用
  路径或命令：`packages/shared/src/index.ts:78`
  结果：通过。
  说明：Git diff DTO 和 error code 已进入 shared contract。

- 类型：代码引用
  路径或命令：`api/src/project-git-diff.ts:43`
  结果：通过。
  说明：ProjectGitDiffService 使用只读 Git CLI 命令和 Project-safe resolver。

- 类型：代码引用
  路径或命令：`web/src/routes/ProjectConsoleRoute.tsx:398`
  结果：通过。
  说明：Project console Git section 替换为只读 diff viewer。

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 通过 | specs 中只读、非 Git 仓库、worktree/staged 列表、basic status、single-file unified diff、Project-safe access 均有实现和证据。 |
| Correctness | 通过 | focused tests、E2E 和 full quality gate 均通过；verify 期间修正了 diff `<pre>` 保留空白/横向滚动的设计偏差并复测通过。 |
| Coherence | 通过 | 实现符合 Project-scoped API、shared DTO、TanStack Query、本地 UI state 和无新增依赖的既有模式；未引入 Git 写操作。 |

## 问题清单

### CRITICAL

- （无）

### WARNING

- （无）

### SUGGESTION

- 后续如真实项目出现超大单文件 diff，可新增 diff size limit 或分页 change；当前第一轮设计明确不做分页，不阻塞。

## 回流建议

- （无）

## 最终结论

- 结论：通过
- 是否允许进入 distill-change：是
- 条件或阻塞：无
