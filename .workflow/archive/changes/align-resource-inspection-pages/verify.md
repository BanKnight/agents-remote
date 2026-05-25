# verify

本文件记录当前 change 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：align-resource-inspection-pages
- Roadmap 对应项：v0.8-prototype-ui-alignment / align-resource-inspection-pages
- 验证对象：Files / Git / Terminal Project resource workspaces 的直接二级页、移动端 preview/diff deep detail、Terminal instances list/create/close，以及对应浏览器 artifacts。
- 验证结论：通过

## 验证轮次

### Round 1

- 时间：2026-05-26
- 验证范围：实现任务 1.1、2.1、2.2、2.3、3.1；Files/Git/Terminal specs；design/ui-ux 与 frontend design；web 门禁；真实浏览器 desktop/mobile resource workspace 路径。
- 使用 harness：`bun run format:check`、`bun run lint`、`bun --filter @agents-remote/web typecheck`、`bun --filter @agents-remote/web test`、`bun --filter @agents-remote/web build`、`bun .workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection-check.ts`
- 本轮结论：通过
- 后续动作：进入 `distill-change`，将已验证的 Project resource workspace 边界按需沉淀到长期 docs。

## Harness 清单

- 名称：format:check
  类型：格式检查
  覆盖承诺：新增实现、harness 和 workflow artifact 格式一致性
  执行方式：`bun run format:check`
  结果：通过，63 files all matched files use correct format
  证据：命令输出

- 名称：lint
  类型：静态检查
  覆盖承诺：前端代码和 harness 无 lint warnings/errors
  执行方式：`bun run lint`
  结果：通过，0 warnings / 0 errors
  证据：命令输出

- 名称：web typecheck
  类型：TypeScript 类型检查
  覆盖承诺：ProjectConsoleRoute resource state、Terminal detail link search、browser harness 相关类型不破坏 web build 类型边界
  执行方式：`bun --filter @agents-remote/web typecheck`
  结果：通过
  证据：命令输出

- 名称：web test
  类型：单元/组件测试
  覆盖承诺：现有 web 行为未回归
  执行方式：`bun --filter @agents-remote/web test`
  结果：通过，21 pass / 0 fail / 56 expect() calls
  证据：命令输出

- 名称：web build
  类型：生产构建
  覆盖承诺：实现可被 Vite 正常构建
  执行方式：`bun --filter @agents-remote/web build`
  结果：通过
  证据：命令输出

- 名称：resource browser harness
  类型：真实浏览器交互检查 / screenshot artifact
  覆盖承诺：desktop/mobile Files direct secondary、Files preview deep detail、Git direct secondary、Git diff deep detail、Terminal direct secondary、Terminal create/close、无 Files/Git 写操作、deep detail 无 Project mobile bottom nav、长文本无横向溢出
  执行方式：`bun .workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection-check.ts`
  结果：通过
  证据：`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/resource-inspection-check.log` 与同目录截图/日志

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| task 1.1 / design frontend | ProjectConsole 根据 Files preview 或 Git diff deep state 隐藏移动端 Project 二级底部导航，直接二级页仍显示底部导航，不新增 route | `web/src/routes/ProjectConsoleRoute.tsx:96`、`web/src/routes/ProjectConsoleRoute.tsx:132`、`web/src/routes/ProjectConsoleRoute.tsx:178`、`web/src/routes/ProjectConsoleRoute.tsx:190` | browser harness 验证 mobile direct secondary 有 bottom nav，Files preview / Git diff deep state 无 Project mobile workspace navigation | 通过 |
| file-browser-preview spec | Files 直接二级页 compact path/list/preview，只读，无写操作，移动端 direct secondary 保留 Project 二级底部导航 | `web/src/routes/ProjectConsoleRoute.tsx:994`、`web/src/routes/ProjectConsoleRoute.tsx:1024`、`web/src/routes/ProjectConsoleRoute.tsx:1095`、`web/src/routes/ProjectConsoleRoute.tsx:1150` | `files-direct-desktop.png`、`files-direct-mobile.png`、browser harness no-write assertions | 通过 |
| file-browser-preview spec | 移动端选择文件后进入 preview deep detail，顶部返回 Files list，隐藏 Project 二级底部导航，内容优先 | `web/src/routes/ProjectConsoleRoute.tsx:1017`、`web/src/routes/ProjectConsoleRoute.tsx:1072`、`web/src/routes/ProjectConsoleRoute.tsx:711` | `files-preview-mobile.png`、resource harness log line for mobile Files preview | 通过 |
| git-diff-viewer spec | Git 直接二级页 compact status/list/diff，只读，无 Git 写操作，not repo/no changes/loading/error 状态保留 | `web/src/routes/ProjectConsoleRoute.tsx:744`、`web/src/routes/ProjectConsoleRoute.tsx:768`、`web/src/routes/ProjectConsoleRoute.tsx:790`、`web/src/routes/ProjectConsoleRoute.tsx:803`、`web/src/routes/ProjectConsoleRoute.tsx:875` | `git-direct-desktop.png`、`git-direct-mobile.png`、browser harness no-write assertions | 通过 |
| git-diff-viewer spec | 移动端选择 changed file 后进入 diff deep detail，顶部返回 changed files，隐藏 Project 二级底部导航，diff 内容优先 | `web/src/routes/ProjectConsoleRoute.tsx:761`、`web/src/routes/ProjectConsoleRoute.tsx:830`、`web/src/routes/ProjectConsoleRoute.tsx:922` | `git-diff-mobile.png`、resource harness log line for mobile Git diff | 通过 |
| session-runtime spec | Terminal 直接二级页展示 Terminal instances、New Terminal、Open detail、Close confirm、pending/error，移动端保留 Project 二级底部导航且不出现 runtime input | `web/src/routes/ProjectConsoleRoute.tsx:533`、`web/src/routes/ProjectConsoleRoute.tsx:568`、`web/src/routes/ProjectConsoleRoute.tsx:573`、`web/src/routes/ProjectConsoleRoute.tsx:614`、`web/src/routes/ProjectConsoleRoute.tsx:654`、`web/src/routes/ProjectConsoleRoute.tsx:662` | `terminal-direct-desktop.png`、`terminal-direct-mobile.png`、browser harness create/close confirm and no runtime input assertions | 通过 |
| tasks.md 3.1 | 保存真实浏览器 desktop/mobile resource workspace 证据 | `.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection-check.ts` | `.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/` 下 10 张截图、`web.log`、`mock-api.log`、`resource-inspection-check.log` | 通过 |

## Delta 验证

- Scope 内变更：`web/src/routes/ProjectConsoleRoute.tsx` 中 Project resource deep state、Files/Git mobile deep detail、Files/Git compact desktop layout、Terminal workspace instances list；新增本 change browser harness 和截图/日志 artifacts；更新本 change tasks/progress。
- Scope 外变更：未修改 shared DTO、API route contract、Project safe resolver、Git/Files API、Session Runtime 或 Agent/Terminal detail runtime protocol。
- 未被 spec/design 支撑的新行为：无。
- 风险：Files/Git selected item 仍为同 route local state，刷新恢复不在本轮范围；该限制已在 design/frontend.md 中明确。
- 结论：通过。

## Scenario 验证

- 场景：Desktop Files direct secondary + preview
  路径类型：用户可见 / 正常
  验证方式：browser harness 打开 `/projects/resource-demo?workspace=files`，选择 `README.md`，检查 list + preview、只读、desktop nav 和截图。
  证据：`files-direct-desktop.png`、`files-preview-desktop.png`
  结果：通过

- 场景：Mobile Files direct secondary + preview deep detail
  路径类型：用户可见 / 正常 / 边界
  验证方式：390x844 浏览器视口打开 Files，确认 direct secondary 有 mobile Project nav；选择文件后确认顶部 `Back to Files list`，无 Project mobile workspace navigation，长文本无横向溢出。
  证据：`files-direct-mobile.png`、`files-preview-mobile.png`
  结果：通过

- 场景：Desktop Git direct secondary + diff
  路径类型：用户可见 / 正常
  验证方式：browser harness 打开 `/projects/resource-demo?workspace=git`，选择 `src/changed.ts`，检查 changed-file list、unified diff、desktop nav 和无写操作。
  证据：`git-direct-desktop.png`、`git-diff-desktop.png`
  结果：通过

- 场景：Mobile Git direct secondary + diff deep detail
  路径类型：用户可见 / 正常 / 边界
  验证方式：390x844 浏览器视口打开 Git，确认 direct secondary 有 mobile Project nav；选择 changed file 后确认顶部 `Back to changed files`，无 Project mobile workspace navigation，diff 长行无横向溢出。
  证据：`git-direct-mobile.png`、`git-diff-mobile.png`
  结果：通过

- 场景：Desktop/Mobile Terminal direct secondary
  路径类型：用户可见 / 正常 / 危险确认
  验证方式：browser harness 打开 Terminal workspace，检查 Terminal instances、New Terminal、Open detail、长 session id、无 runtime input；创建 terminal 后执行 Close confirm 并确认列表更新。
  证据：`terminal-direct-desktop.png`、`terminal-direct-mobile.png`
  结果：通过

## Evidence 清单

- 类型：代码引用
  路径或命令：`web/src/routes/ProjectConsoleRoute.tsx`
  结果：通过
  说明：实现 resource deep shell state、Files/Git mobile deep detail、Terminal instance list。

- 类型：自动化测试报告
  路径或命令：`bun run format:check`
  结果：通过
  说明：格式检查通过。

- 类型：自动化测试报告
  路径或命令：`bun run lint`
  结果：通过
  说明：0 warnings / 0 errors。

- 类型：自动化测试报告
  路径或命令：`bun --filter @agents-remote/web typecheck`
  结果：通过
  说明：web TypeScript 类型检查通过。

- 类型：自动化测试报告
  路径或命令：`bun --filter @agents-remote/web test`
  结果：通过
  说明：21 pass / 0 fail / 56 expect() calls。

- 类型：自动化测试报告
  路径或命令：`bun --filter @agents-remote/web build`
  结果：通过
  说明：Vite production build 通过。

- 类型：交互日志
  路径或命令：`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/resource-inspection-check.log`
  结果：通过
  说明：记录 desktop/mobile Files/Git/Terminal resource workspace browser assertions。

## 交互式 Artifact 清单

- 类型：截图
  路径或命令：`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/files-direct-desktop.png`
  结果：通过
  说明：Desktop Files direct secondary。

- 类型：截图
  路径或命令：`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/files-direct-mobile.png`
  结果：通过
  说明：Mobile Files direct secondary，Project bottom nav 可见。

- 类型：截图
  路径或命令：`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/files-preview-desktop.png`
  结果：通过
  说明：Desktop Files list + preview。

- 类型：截图
  路径或命令：`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/files-preview-mobile.png`
  结果：通过
  说明：Mobile Files preview deep detail，顶部返回且无 Project bottom nav。

- 类型：截图
  路径或命令：`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/git-direct-desktop.png`
  结果：通过
  说明：Desktop Git direct secondary。

- 类型：截图
  路径或命令：`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/git-direct-mobile.png`
  结果：通过
  说明：Mobile Git direct secondary，Project bottom nav 可见。

- 类型：截图
  路径或命令：`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/git-diff-desktop.png`
  结果：通过
  说明：Desktop Git changed-file list + unified diff。

- 类型：截图
  路径或命令：`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/git-diff-mobile.png`
  结果：通过
  说明：Mobile Git diff deep detail，顶部返回且无 Project bottom nav。

- 类型：截图
  路径或命令：`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/terminal-direct-desktop.png`
  结果：通过
  说明：Desktop Terminal direct secondary instances list。

- 类型：截图
  路径或命令：`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/terminal-direct-mobile.png`
  结果：通过
  说明：Mobile Terminal direct secondary，Project bottom nav 可见且无 runtime input。

- 类型：浏览器日志 / 服务日志
  路径或命令：`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/web.log`、`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/mock-api.log`
  结果：通过
  说明：Browser harness 运行时 web dev server 和 mock API 请求日志。

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 通过 | tasks.md 全部勾选；Files/Git/Terminal specs 的直接二级页、mobile deep detail、只读边界和 Terminal list/detail 分离均有代码与浏览器证据。 |
| Correctness | 通过 | format/lint/typecheck/test/build 和 browser harness 均通过；移动端 bottom nav 与 top return 行为符合 design。 |
| Coherence | 通过 | 实现保持在 `ProjectConsoleRoute.tsx` 局部；未扩展 API/DTO；沿用 TanStack Query、本地组件 state、Project 二级导航和 existing route model。 |

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
