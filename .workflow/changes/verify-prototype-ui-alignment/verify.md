# verify

本文件记录当前 change 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：verify-prototype-ui-alignment
- Roadmap 对应项：v0.8-prototype-ui-alignment / prototype alignment verification
- 验证对象：Home、Project Agent workspace、Agent/Terminal detail、Files/Git/Terminal resource workspaces 的 desktop/mobile prototype 结构对齐结果
- 验证结论：通过

## 验证轮次

### Round 1

- 时间：2026-05-26
- 验证范围：最终 prototype alignment browser harness、web format/lint/typecheck/test/build 门禁、desktop/mobile 截图与日志 artifacts
- 使用 harness：`bun .workflow/changes/verify-prototype-ui-alignment/artifacts/prototype-ui-alignment-check.ts`
- 本轮结论：通过
- 后续动作：进入 distill-change，沉淀或明确无需新增长期 docs 后收口本 change

## Harness 清单

- 名称：web format check
  类型：format gate
  覆盖承诺：代码与 workflow TypeScript harness 格式一致
  执行方式：`bun run format:check`
  结果：通过；63 files checked
  证据：命令输出 `All matched files use the correct format.`
- 名称：web lint
  类型：static analysis gate
  覆盖承诺：无 lint warning/error
  执行方式：`bun run lint`
  结果：通过；0 warnings / 0 errors
  证据：命令输出 `Found 0 warnings and 0 errors.`
- 名称：web typecheck
  类型：TypeScript gate
  覆盖承诺：web route、API client、harness 相关类型无破坏
  执行方式：`bun --filter @agents-remote/web typecheck`
  结果：通过；exit code 0
  证据：命令输出 `@agents-remote/web typecheck: Exited with code 0`
- 名称：web tests
  类型：unit/component test gate
  覆盖承诺：现有 web 行为回归测试通过
  执行方式：`bun --filter @agents-remote/web test`
  结果：通过；21 pass / 0 fail / 56 expect() calls
  证据：命令输出 `Ran 21 tests across 3 files.`
- 名称：web build
  类型：production build gate
  覆盖承诺：web production build 可生成
  执行方式：`bun --filter @agents-remote/web build`
  结果：通过；Vite build completed
  证据：命令输出 `✓ built in 1.86s`
- 名称：prototype UI alignment browser harness
  类型：real browser automation + mock API + Vite dev server
  覆盖承诺：Home、Project Agent workspace、Agent detail、Terminal detail、Files direct/preview、Git direct/diff、Terminal workspace 的 desktop/mobile 结构断言、截图和日志
  执行方式：`bun .workflow/changes/verify-prototype-ui-alignment/artifacts/prototype-ui-alignment-check.ts`
  结果：通过
  证据：`.workflow/changes/verify-prototype-ui-alignment/artifacts/prototype-ui-alignment/prototype-ui-alignment-check.log`、`web.log`、`mock-api.log`、desktop/mobile screenshots

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| specs/prototype-ui-alignment/spec.md | 使用真实浏览器证据覆盖 Home、Project Agent workspace、Agent/Terminal detail、Files/Git/Terminal workspace | `.workflow/changes/verify-prototype-ui-alignment/artifacts/prototype-ui-alignment-check.ts` | `prototype-ui-alignment-check.log` 记录 14 条 desktop/mobile 场景均通过 | 通过 |
| design/ui-ux.md | 桌面端验证一级/二级导航与可扫读 workspace；移动端 direct secondary 显示 Project bottom nav | `ProjectConsoleRoute.tsx` 的 Project workspace navigation 与 mobile workspace navigation；`HomeRoute.tsx` 的 primary navigation | `home-*.png`、`project-agent-workspace-*.png`、`files-direct-*.png`、`git-direct-*.png`、`terminal-workspace-*.png` | 通过 |
| design/ui-ux.md | 移动端 deep/detail state 使用顶部返回并隐藏 Project 二级底部导航 | `SessionDetailRoute.tsx` detail routes；`ProjectConsoleRoute.tsx` Files/Git mobile preview/diff deep state | `agent-detail-mobile.png`、`terminal-detail-mobile.png`、`files-preview-mobile.png`、`git-diff-mobile.png`；harness 断言 `projectSecondaryNav(page).toHaveCount(0)` | 通过 |
| design/ui-ux.md | Agent detail 有 Agent-only Files/Git/+Terminal/Meta tools，Terminal detail 不显示 Agent-only tools | `SessionDetailRoute.tsx` 的 `Agent detail tools` 分支与 Terminal detail 分支 | `agent-detail-*.png`、`agent-detail-files-*.png`、`terminal-detail-*.png`；harness 验证 Terminal detail 无 Files/Git/+Terminal | 通过 |
| design/ui-ux.md | Files/Git 保持只读 inspection，不出现写操作 affordance | `ProjectConsoleRoute.tsx` Files/Git list + preview/diff UI | harness `assertNoWriteActions` 覆盖 Upload/Edit/Save/Delete/Stage/Commit/Reset/Push/Pull；`files-*.png`、`git-*.png` | 通过 |
| design/ui-ux.md | Terminal workspace 是直接二级 Terminal instances list，不出现 runtime input | `ProjectConsoleRoute.tsx` TerminalPanel / TerminalInstanceList | `terminal-workspace-*.png`；harness 验证无 `Send input` 与 `Session quick keys` | 通过 |
| tasks.md 2.1 | Browser harness 使用 mock API 与临时 web dev server，不读取现有 secrets/tmux 环境 | harness 内 `Bun.serve` mock API、临时 free ports、`WEB_API_PROXY_TARGET`；无 `APP_PASSWORD`、无 tmux env 读取 | `web.log`、`mock-api.log`、harness 源码 | 通过 |
| tasks.md 3.1 | 最终 web 门禁和 browser harness 通过，`verify.md` 记录 trace/delta/scenario/evidence | 本文件与命令输出 | format/lint/typecheck/test/build/harness 均通过 | 通过 |

## Delta 验证

- Scope 内变更：新增本 change 专用 browser harness、截图/log artifacts、`verify.md`；更新本 change `tasks.md` 与 `progress.md`。
- Scope 外变更：无产品 UI、API、shared DTO、runtime protocol 或后端能力变更。
- 未被 spec/design 支撑的新行为：无。Harness 只使用 mock 数据验证已有 UI 结构，不向产品引入新行为。
- 风险：Mock API 不能覆盖真实数据所有组合；本 change 明确使用结构断言 + 截图人工可审查证据，不做 pixel-perfect diff。
- 结论：通过；delta 符合验证型 change 范围。

## Scenario 验证

- 场景：Home / Projects entry desktop + mobile
  路径类型：用户可见 / 正常
  验证方式：访问 `/`，断言 primary navigation、Project list、Project link 可见，并保存截图。
  证据：`home-desktop.png`、`home-mobile.png`
  结果：通过
- 场景：Project Agent workspace desktop + mobile
  路径类型：用户可见 / 正常
  验证方式：访问 `/projects/prototype-demo?workspace=agents`，断言 Agent instances、Claude/Codex create buttons、Session history、Project secondary navigation。
  证据：`project-agent-workspace-desktop.png`、`project-agent-workspace-mobile.png`
  结果：通过
- 场景：Agent detail desktop + mobile
  路径类型：用户可见 / 正常 / 边界
  验证方式：访问 Agent detail，断言 terminal-first stream、Agent detail tools、quick keys、无 Project secondary nav；打开 Files contextual view 并验证只读。
  证据：`agent-detail-desktop.png`、`agent-detail-mobile.png`、`agent-detail-files-desktop.png`、`agent-detail-files-mobile.png`
  结果：通过
- 场景：Terminal detail desktop + mobile
  路径类型：用户可见 / 正常
  验证方式：访问 Terminal detail，断言 focused shell、quick keys、无 Agent-only tools、无 Project secondary nav。
  证据：`terminal-detail-desktop.png`、`terminal-detail-mobile.png`
  结果：通过
- 场景：Files direct workspace 与 preview deep detail desktop + mobile
  路径类型：用户可见 / 正常 / 边界
  验证方式：访问 Files workspace，断言只读 file list、Project nav；点击 README 后断言 preview visible，移动端隐藏 Project secondary nav 并显示 Back to Files list；验证无横向溢出。
  证据：`files-direct-desktop.png`、`files-direct-mobile.png`、`files-preview-desktop.png`、`files-preview-mobile.png`
  结果：通过
- 场景：Git direct workspace 与 diff deep detail desktop + mobile
  路径类型：用户可见 / 正常 / 边界
  验证方式：访问 Git workspace，断言 changed files、Project nav、只读边界；点击 changed file 后断言 diff visible，移动端隐藏 Project secondary nav 并显示 Back to changed files；验证无横向溢出。
  证据：`git-direct-desktop.png`、`git-direct-mobile.png`、`git-diff-desktop.png`、`git-diff-mobile.png`
  结果：通过
- 场景：Terminal workspace desktop + mobile
  路径类型：用户可见 / 正常 / 边界
  验证方式：访问 Terminal workspace，断言 Terminal instances list、Project nav、New/Open/Close affordance；创建并关闭 Terminal；断言 direct workspace 无 runtime input 和 quick keys。
  证据：`terminal-workspace-desktop.png`、`terminal-workspace-mobile.png`
  结果：通过

## Evidence 清单

- 类型：测试
  路径或命令：`bun run format:check`
  结果：通过
  说明：格式门禁通过，包含本 change harness TypeScript 文件。
- 类型：测试
  路径或命令：`bun run lint`
  结果：通过
  说明：0 warning / 0 error。
- 类型：测试
  路径或命令：`bun --filter @agents-remote/web typecheck`
  结果：通过
  说明：web TypeScript typecheck exit code 0。
- 类型：测试
  路径或命令：`bun --filter @agents-remote/web test`
  结果：通过
  说明：21 pass / 0 fail / 56 expect() calls。
- 类型：测试
  路径或命令：`bun --filter @agents-remote/web build`
  结果：通过
  说明：Vite production build 成功。
- 类型：e2e / 自动化测试报告
  路径或命令：`bun .workflow/changes/verify-prototype-ui-alignment/artifacts/prototype-ui-alignment-check.ts`
  结果：通过
  说明：真实 Chromium + mock API + Vite dev server 覆盖最终 UI alignment matrix。
- 类型：日志
  路径或命令：`.workflow/changes/verify-prototype-ui-alignment/artifacts/prototype-ui-alignment/prototype-ui-alignment-check.log`
  结果：通过
  说明：14 条 desktop/mobile alignment scenario 通过记录。
- 类型：日志
  路径或命令：`.workflow/changes/verify-prototype-ui-alignment/artifacts/prototype-ui-alignment/web.log`
  结果：通过
  说明：Vite dev server 启动日志。
- 类型：日志
  路径或命令：`.workflow/changes/verify-prototype-ui-alignment/artifacts/prototype-ui-alignment/mock-api.log`
  结果：通过
  说明：mock API 请求记录；不读取真实 secrets 或 tmux env。

## 交互式 Artifact 清单

- 类型：截图
  路径或命令：`.workflow/changes/verify-prototype-ui-alignment/artifacts/prototype-ui-alignment/home-desktop.png`、`home-mobile.png`
  结果：已采集
  说明：Home / Projects entry desktop/mobile。
- 类型：截图
  路径或命令：`.workflow/changes/verify-prototype-ui-alignment/artifacts/prototype-ui-alignment/project-agent-workspace-desktop.png`、`project-agent-workspace-mobile.png`
  结果：已采集
  说明：Project Agent workspace desktop/mobile。
- 类型：截图
  路径或命令：`.workflow/changes/verify-prototype-ui-alignment/artifacts/prototype-ui-alignment/agent-detail-desktop.png`、`agent-detail-mobile.png`、`agent-detail-files-desktop.png`、`agent-detail-files-mobile.png`
  结果：已采集
  说明：Agent terminal-first detail 与 Agent contextual Files view。
- 类型：截图
  路径或命令：`.workflow/changes/verify-prototype-ui-alignment/artifacts/prototype-ui-alignment/terminal-detail-desktop.png`、`terminal-detail-mobile.png`
  结果：已采集
  说明：Terminal focused shell detail。
- 类型：截图
  路径或命令：`.workflow/changes/verify-prototype-ui-alignment/artifacts/prototype-ui-alignment/files-direct-desktop.png`、`files-direct-mobile.png`、`files-preview-desktop.png`、`files-preview-mobile.png`
  结果：已采集
  说明：Files direct secondary workspace 与 file preview deep detail。
- 类型：截图
  路径或命令：`.workflow/changes/verify-prototype-ui-alignment/artifacts/prototype-ui-alignment/git-direct-desktop.png`、`git-direct-mobile.png`、`git-diff-desktop.png`、`git-diff-mobile.png`
  结果：已采集
  说明：Git direct secondary workspace 与 single-file diff deep detail。
- 类型：截图
  路径或命令：`.workflow/changes/verify-prototype-ui-alignment/artifacts/prototype-ui-alignment/terminal-workspace-desktop.png`、`terminal-workspace-mobile.png`
  结果：已采集
  说明：Terminal instances direct secondary workspace。
- 类型：浏览器日志 / 服务日志
  路径或命令：`web.log`、`mock-api.log`
  结果：已采集
  说明：临时 web dev server 与 mock API 运行证据。

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 通过 | 覆盖 tasks 要求的 Home、Project Agent workspace、Agent/Terminal detail、Files/Git/Terminal resource workspaces，以及 desktop/mobile 两类 viewport。 |
| Correctness | 通过 | web 门禁与 browser harness 均通过；结构断言覆盖导航层级、只读边界、detail tool 边界、runtime input 边界和横向溢出 guard。 |
| Coherence | 通过 | 验证结果符合 `docs/design/prototype/guidelines.md`、`docs/design/frontend-ui-architecture.md`、本 change design 与 page-level changes 的已验证结论。 |

## 问题清单

### CRITICAL

- （无）

### WARNING

- （无）

### SUGGESTION

- Pixel-level diff 不在本 change 范围；后续如需要更严格视觉回归，可在独立 change 中增加 screenshot comparison 或 visual regression harness。

## 可接受差异

- 不做 pixel-perfect diff；截图用于人工审查，结构断言用于自动化防漏。
- Mock API 只覆盖最终 alignment matrix 的代表性数据组合，不证明所有真实数据排列。
- Files/Git selected preview/diff state 仍为组件本地状态，不进入 URL；这是当前 frontend architecture 已接受边界。

## 回流建议

- （无；没有未解决 CRITICAL 或 WARNING）

## 最终结论

- 结论：通过
- 是否允许进入 distill-change：是
- 条件或阻塞：无
