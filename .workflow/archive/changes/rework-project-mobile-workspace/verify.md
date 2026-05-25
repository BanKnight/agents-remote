# verify

本文件记录当前 change 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：rework-project-mobile-workspace
- Roadmap 对应项：v0.5-mobile-ux-polish / `rework-project-mobile-workspace`
- 验证对象：Project console 移动工作区重排、Files/Git 功能区、Agent/Terminal 区域、常驻 runtime input 移除。
- 验证结论：通过

## 验证轮次

### Round 1

- 时间：2026-05-25
- 验证范围：代码差异、质量门禁、现有 Files/Git/Terminal e2e、移动 viewport Project 工作区截图 smoke。
- 使用 harness：`bun run format:check`、`bun run lint`、`bun run typecheck`、`bun run test`、`bun run build`、`E2E_ARTIFACTS_DIR=.workflow/changes/rework-project-mobile-workspace/artifacts/e2e bun run e2e`、`bun /tmp/rework-project-mobile-workspace-smoke.ts`。
- 本轮结论：通过。
- 后续动作：进入 `distill-change`，判断长期 docs 是否需要同步 Project console 移动工作区信息架构。

## Harness 清单

- 名称：格式检查
  类型：format
  覆盖承诺：实现文件和 e2e 更新符合项目格式基线。
  执行方式：`bun run format:check`
  结果：通过。
  证据：命令输出 `All matched files use the correct format.`
- 名称：Lint
  类型：static analysis
  覆盖承诺：前端 route/model/test/e2e 修改无 lint warning/error。
  执行方式：`bun run lint`
  结果：通过。
  证据：命令输出 `Found 0 warnings and 0 errors.`
- 名称：TypeScript typecheck
  类型：typecheck
  覆盖承诺：React route、Jotai state、console model 和 e2e 类型一致。
  执行方式：`bun run typecheck`
  结果：通过。
  证据：api/shared/web typecheck 和 `tsc -p tsconfig.e2e.json` 全部完成。
- 名称：Unit/integration tests
  类型：test
  覆盖承诺：console model 顺序、session helper、api/shared/web 既有单元测试不回归。
  执行方式：`bun run test`
  结果：通过。
  证据：api 75 pass，shared 6 pass，web 21 pass。
- 名称：Production build
  类型：build
  覆盖承诺：前后端 workspace 可构建，Vite bundle 无构建错误。
  执行方式：`bun run build`
  结果：通过。
  证据：api/shared/web build 完成，web `✓ built`。
- 名称：Project Files/Git/Terminal e2e
  类型：e2e
  覆盖承诺：Files/Git 入口仍可进入只读详情，Terminal session 创建与进入 detail 不回归。
  执行方式：`E2E_ARTIFACTS_DIR=.workflow/changes/rework-project-mobile-workspace/artifacts/e2e bun run e2e`
  结果：通过。
  证据：3 passed；artifact 目录 `.workflow/changes/rework-project-mobile-workspace/artifacts/e2e/`。
- 名称：Mobile Project workspace smoke
  类型：headless browser screenshot
  覆盖承诺：390x844 viewport 下可见返回入口、Files/Git、Agent Sessions、Terminal Sessions，且不渲染 `Runtime input ready` 底部面板。
  执行方式：`bun /tmp/rework-project-mobile-workspace-smoke.ts`
  结果：通过。
  证据：`.workflow/changes/rework-project-mobile-workspace/artifacts/mobile-project-workspace.png`、`mobile-project-workspace-api.log`、`mobile-project-workspace-web.log`。

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| intent 5 / spec: workspace home screen | 手机 Project 详情页提供返回 Project 列表和当前 Project 上下文，不再依赖桌面侧栏 | `web/src/routes/ProjectConsoleRoute.tsx` 中 `WorkspaceHeader` 渲染 `Back to Projects`、Project name/path；成功态 root 使用 flex 工作区布局 | Mobile smoke 等待 `Back to Projects` 和 project heading，截图 `artifacts/mobile-project-workspace.png` | 通过 |
| spec: section priority | 移动默认顺序为 Files/Git 功能区、Agent Sessions、Terminal Sessions | `WorkspaceActionGrid` 只渲染 Files/Git action cards；随后渲染 `AgentPanel` 与 `TerminalPanel`；`consoleSections` 顺序为 files/git/agents/terminal | `bun run test` 覆盖 section 顺序；Mobile smoke 等待 Files/Git button 和 Agent/Terminal headings | 通过 |
| spec: no persistent shell-level runtime input | Project 工作区不常驻底部 runtime input，输入留给 Session detail | 删除 Project console fixed bottom panel；删除 `inputPanelOpenAtom` 与 `runtimeInputEnabled` | `rg inputPanelOpenAtom/runtimeInputEnabled web/src` 无输出；Mobile smoke 检查 `Runtime input ready` 不可见 | 通过 |
| spec: viewport fit / no horizontal overflow | 使用动态视口、`min-w-0`、长文本截断/换行和局部 session 列表滚动 | root `min-h-dvh overflow-x-hidden`，workspace `min-w-0`，session cards `truncate`/`break-all`，session list `max-h-80 overflow-y-auto` | typecheck/build 通过；Mobile screenshot artifact 可审查布局 | 通过 |
| design/frontend | 不改 API/shared/runtime，复用现有 queries/mutations/session card | 变更集中在 `web/src/routes/ProjectConsoleRoute.tsx`、`console-model.ts`、`state/ui.ts` 和 e2e 测试；session mutations/invalidate 逻辑保留 | `bun run e2e` Files/Git/Terminal 三条路径通过 | 通过 |

## Delta 验证

- Scope 内变更：Project console route 重组为移动工作区；console section 顺序调整；删除 Project workspace runtime input state/constant；更新 e2e 选择器与 Terminal 创建路径。
- Scope 外变更：无后端、shared DTO、runtime API、Files/Git API 修改。
- 未被 spec/design 支撑的新行为：无。Terminal 创建按钮从需要切换 section 改为 Project 工作区中默认可见，符合 Terminal 区常驻要求。
- 风险：Files/Git 详情在点击后仍展开在工作区内，后续 `compact-inspection-mobile-views` 需要继续优化深层信息密度；本 change 只验证入口级发现与既有能力不回归。
- 结论：通过。

## Scenario 验证

- 场景：用户在手机视口进入 Project 工作区
  路径类型：用户可见 / 正常
  验证方式：`bun /tmp/rework-project-mobile-workspace-smoke.ts` 使用 390x844 viewport 登录、进入 demo Project、等待返回入口、Files/Git、Agent/Terminal 区域并截图。
  证据：`.workflow/changes/rework-project-mobile-workspace/artifacts/mobile-project-workspace.png`
  结果：通过
- 场景：用户从 Project 工作区打开 Files 并预览文件
  路径类型：正常
  验证方式：`bun run e2e` 中 `file-browser.spec.ts` 登录、进入 Project、点击 Files、浏览目录、预览文本和图片。
  证据：`.workflow/changes/rework-project-mobile-workspace/artifacts/e2e/`
  结果：通过
- 场景：用户从 Project 工作区打开 Git 并查看 worktree/staged diff
  路径类型：正常
  验证方式：`bun run e2e` 中 `git-diff.spec.ts` 登录、进入 Project、点击 Git、查看 diff。
  证据：`.workflow/changes/rework-project-mobile-workspace/artifacts/e2e/`
  结果：通过
- 场景：用户从 Project 工作区创建 Terminal session 并进入 detail 输入
  路径类型：正常
  验证方式：`bun run e2e` 中 `terminal-session.spec.ts` 登录、进入 Project、点击 `New Terminal`、打开 runtime stream、发送输入并检查输出。
  证据：`.workflow/changes/rework-project-mobile-workspace/artifacts/e2e/`
  结果：通过
- 场景：Project 工作区不常驻 bottom runtime input
  路径类型：边界 / 用户可见
  验证方式：移动 smoke 检查 `Runtime input ready` 不可见，代码删除 fixed bottom panel、atom 和常量。
  证据：`.workflow/changes/rework-project-mobile-workspace/artifacts/mobile-project-workspace.png`；代码引用 `web/src/routes/ProjectConsoleRoute.tsx`
  结果：通过

## Evidence 清单

- 类型：测试
  路径或命令：`bun run format:check`
  结果：通过
  说明：格式基线通过。
- 类型：测试
  路径或命令：`bun run lint`
  结果：通过
  说明：无 lint warning/error。
- 类型：测试
  路径或命令：`bun run typecheck`
  结果：通过
  说明：workspace 和 e2e TypeScript 检查通过。
- 类型：测试
  路径或命令：`bun run test`
  结果：通过
  说明：api/shared/web 测试全部通过。
- 类型：测试
  路径或命令：`bun run build`
  结果：通过
  说明：api/shared/web 构建成功。
- 类型：e2e
  路径或命令：`E2E_ARTIFACTS_DIR=.workflow/changes/rework-project-mobile-workspace/artifacts/e2e bun run e2e`
  结果：通过
  说明：Files/Git/Terminal 三条浏览器路径通过。
- 类型：截图
  路径或命令：`.workflow/changes/rework-project-mobile-workspace/artifacts/mobile-project-workspace.png`
  结果：通过
  说明：移动 Project 工作区截图 artifact。
- 类型：日志
  路径或命令：`.workflow/changes/rework-project-mobile-workspace/artifacts/mobile-project-workspace-api.log`、`.workflow/changes/rework-project-mobile-workspace/artifacts/mobile-project-workspace-web.log`
  结果：已保存
  说明：移动 smoke 的 api/web 服务日志。
- 类型：代码引用
  路径或命令：`web/src/routes/ProjectConsoleRoute.tsx`、`web/src/routes/console-model.ts`、`web/src/state/ui.ts`
  结果：通过
  说明：实现位置覆盖工作区 header/action cards/session sections/input 清理。

## 交互式 Artifact 清单

- 类型：截图
  路径或命令：`.workflow/changes/rework-project-mobile-workspace/artifacts/mobile-project-workspace.png`
  结果：已采集
  说明：390x844 mobile viewport Project 工作区。
- 类型：服务日志
  路径或命令：`.workflow/changes/rework-project-mobile-workspace/artifacts/mobile-project-workspace-api.log`
  结果：已采集
  说明：移动 smoke API 日志。
- 类型：服务日志
  路径或命令：`.workflow/changes/rework-project-mobile-workspace/artifacts/mobile-project-workspace-web.log`
  结果：已采集
  说明：移动 smoke web 日志。
- 类型：自动化测试报告 / trace
  路径或命令：`.workflow/changes/rework-project-mobile-workspace/artifacts/e2e/`
  结果：已采集
  说明：Playwright e2e 输出目录；最终重跑 3 passed。

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 通过 | specs 中返回入口、Files/Git 功能区、Agent 区、Terminal 区、无 bottom input 和视口边界均有实现与验证证据。 |
| Correctness | 通过 | format/lint/typecheck/test/build/e2e/mobile smoke 均通过，既有 Files/Git/Terminal 路径不回归。 |
| Coherence | 通过 | 实现复用 TanStack Query/Jotai/现有 mutation/session card，不改 API/shared，符合 frontend design 边界。 |

## 问题清单

### CRITICAL

- （无）

### WARNING

- （无）

### SUGGESTION

- Files/Git 详情展开后的移动信息密度仍留给后续 `compact-inspection-mobile-views` 继续优化。

## 回流建议

- （无）

## 最终结论

- 结论：通过
- 是否允许进入 distill-change：是
- 条件或阻塞：无
