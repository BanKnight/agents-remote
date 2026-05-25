# verify

本文件记录当前 change 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：align-ui-shell-foundation
- Roadmap 对应项：v0.8-prototype-ui-alignment / align-ui-shell-foundation
- 验证对象：Project workspace URL-visible active 状态、shared shell primitives、Home 一级 shell、Project 二级 shell、Session detail 深层 chrome、web 检查和浏览器结构证据。
- 验证结论：通过

## 验证轮次

### Round 1

- 时间：2026-05-25
- 验证范围：
  - specs 中新增的一级/二级 navigation shell、移动端直接二级返回、深层 detail chrome、URL-visible workspace state、shared visual primitives、状态与安全边界保留要求。
  - design/plan/tasks 中要求读取并落实的 `docs/design/frontend-ui-architecture.md`、prototype guidelines、frontend stack 与 console shell 边界。
  - 实现涉及的 `web/src/routes/router.tsx`、`HomeRoute.tsx`、`ProjectConsoleRoute.tsx`、`SessionDetailRoute.tsx`、`console-model.ts`、`shell-primitives.tsx`、E2E specs 与 artifacts。
- 使用 harness：web typecheck、web unit tests、web production build、E2E browser tests、E2E TypeScript check、专用 Playwright browser structure check。
- 本轮结论：通过，无 CRITICAL。
- 后续动作：进入 `distill-change`，判断 URL workspace state 与 shared shell primitives 是否需要沉淀到长期 docs。

## Harness 清单

- 名称：web typecheck
  类型：TypeScript 静态检查
  覆盖承诺：Router search 类型、route 组件 props、shared primitives 类型边界。
  执行方式：`bun --filter @agents-remote/web typecheck`
  结果：通过
  证据：命令输出 `Exited with code 0`

- 名称：web tests
  类型：unit test
  覆盖承诺：console section 默认值与二级 workspace 顺序、Project path、Session quick keys/input/status 行为。
  执行方式：`bun --filter @agents-remote/web test`
  结果：通过，21 pass / 0 fail / 56 expect()
  证据：终端输出；`web/src/routes/console-model.test.ts`

- 名称：web build
  类型：production build
  覆盖承诺：Vite/React production bundle 可构建。
  执行方式：`bun --filter @agents-remote/web build`
  结果：通过
  证据：终端输出 `✓ built in 3.65s`

- 名称：browser E2E
  类型：Playwright E2E
  覆盖承诺：登录后 Project Files/Git/Terminal 真实浏览器路径仍可用；Files/Git 只读 inspection、Terminal session detail 和 runtime input 未被 shell 改造破坏。
  执行方式：`E2E_ARTIFACTS_DIR=.workflow/changes/align-ui-shell-foundation/artifacts/e2e bun run e2e`
  结果：通过，3 passed
  证据：`.workflow/changes/align-ui-shell-foundation/artifacts/e2e/playwright-report/index.html`、`.workflow/changes/align-ui-shell-foundation/artifacts/e2e/e2e-api.log`、`.workflow/changes/align-ui-shell-foundation/artifacts/e2e/e2e-web.log`

- 名称：E2E TypeScript check
  类型：TypeScript 静态检查
  覆盖承诺：更新后的 E2E specs 能被项目 E2E tsconfig 编译。
  执行方式：`bun x tsc -p tsconfig.e2e.json`
  结果：通过
  证据：命令无错误输出

- 名称：browser structure check
  类型：专用 Playwright 浏览器结构验证
  覆盖承诺：desktop/mobile Home 一级 shell、Project 二级 shell、workspace URL search、Session detail 顶部返回且无 Project 二级底部导航。
  执行方式：`bun .workflow/changes/align-ui-shell-foundation/artifacts/browser-structure-check.ts`
  结果：通过
  证据：`.workflow/changes/align-ui-shell-foundation/artifacts/browser-structure/structure-check.log` 与同目录截图。

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| spec: Console exposes level-one and project level-two navigation shells | Desktop Home / Project 区分一级 shell 与 Project 二级 shell，Project 二级导航可识别 Agent/Files/Git/Terminal | `web/src/routes/HomeRoute.tsx:53` 起渲染一级 shell，`web/src/routes/HomeRoute.tsx:146` 起渲染 PrimaryNav；`web/src/routes/ProjectConsoleRoute.tsx:136` 起渲染 Project shell，`ProjectConsoleRoute.tsx:188` 起渲染 ProjectSecondaryNav | `browser-structure/structure-check.log` 记录 desktop/mobile Home primary shell 与 Project secondary workspace 均可见；截图 `home-*.png`、`project-agent-*.png`、`project-git-*.png` | 通过 |
| spec: Mobile direct secondary pages return through secondary bottom navigation | Mobile Project 直接二级页底部显示 Back/Agent/Files/Git/Terminal，顶部不重复 Back | `web/src/routes/ProjectConsoleRoute.tsx:210` 起渲染 mobile ProjectSecondaryBottomNav，`WorkspaceHeader` 不渲染 Back link | `browser-structure/structure-check.log` 记录 mobile Project secondary Agent/Git workspace 可见；截图 `project-agent-mobile.png`、`project-git-mobile.png` | 通过 |
| spec: Deep/contextual detail uses top return without bottom secondary navigation | Session detail 顶部返回 Project，不显示 Project 二级底部导航，底部仍服务 runtime input | `web/src/routes/SessionDetailRoute.tsx:222` 起为 detail chrome；`SessionDetailRoute.tsx:227` 顶部 Back；未引用 ProjectSecondaryBottomNav；`SessionDetailRoute.tsx:285` 起保留 MobileInputPanel | browser structure check 断言 Session detail 有 `Back to Project`，且 Project desktop/mobile workspace navigation count 为 0；截图 `session-detail-desktop.png`、`session-detail-mobile.png`；E2E terminal session 通过 | 通过 |
| spec/design/task: Route-visible workspace state | Agent/Files/Git/Terminal active 状态由 URL-visible search 恢复，无效值回退 Agent | `web/src/routes/router.tsx:21` 起对 `/projects/$projectName` 配置 `validateSearch`；`web/src/routes/console-model.ts:53` 默认 agents，`consoleSectionFromSearch` 无效值回退；`ProjectConsoleRoute.tsx:92` 起通过 `useSearch`/`navigate` 读写 workspace | browser structure check 断言 `workspace=agents` 与 `workspace=git`；web tests 覆盖 `defaultConsoleSection` 和 `consoleSections` 顺序 | 通过 |
| spec/design: Shared visual primitives | 导航项、icon marker、status pill、button/list row 形成真实复用边界；状态包含文字，不新增依赖 | `web/src/routes/shell-primitives.tsx:36` IconMarker、`:55` NavItemContent、`:80` StatusPill、`:95` ActionButton、`:115` ListRow；Home/Project/Session 均复用 | web typecheck/build 通过；browser screenshots 展示 marker/pill/nav/list row；package files 未新增依赖 | 通过 |
| spec: Existing loading/empty/error/disabled/danger confirm preserved | loading/empty/error/disabled/danger confirm 行为保留 | Project route 保留 loading/error frames；Agent/Terminal panels 保留 loading/empty/error；Files/Git panels 保留 loading/error/empty/retry；Session close confirm 保留在 `SessionDetailRoute.tsx:254` 与 Project session card close confirm | web tests 通过；E2E Files/Git/Terminal 通过，覆盖 resource inspection 与 runtime input；web build 通过 | 通过 |

## Delta 验证

- Scope 内变更：
  - `workspace` search route state 与 `activeConsoleSectionAtom` 移除。
  - Home 一级 shell、Project 二级 shell、mobile Project bottom secondary nav、Session detail 深层 chrome 边界。
  - `shell-primitives.tsx` 中轻量、真实复用的 marker/nav/pill/button/list row primitives。
  - E2E specs 与 console-model unit test 按新 navigation 顺序和 list row 标记更新。
  - 本 change artifacts 下新增浏览器结构截图、日志和验证脚本。
- Scope 外变更：未发现后端 API、shared DTO、runtime/provider、Files/Git 写操作或新增依赖变更。
- 未被 spec/design 支撑的新行为：未发现。Home 的 Sessions/Config/Help 仍为一级导航占位，不引入真实新功能。
- 风险：后续页面级 changes 可能继续调整具体内容密度；这属于后续 page-level alignment 范围，不阻塞本 shell foundation。
- 结论：通过。

## Scenario 验证

- 场景：Home 一级 shell desktop/mobile
  路径类型：用户可见
  验证方式：browser structure check 登录后检查 Home primary nav，并保存 desktop/mobile 截图。
  证据：`.workflow/changes/align-ui-shell-foundation/artifacts/browser-structure/home-desktop.png`、`home-mobile.png`、`structure-check.log`
  结果：通过

- 场景：Project workspace active URL restore
  路径类型：正常 / 边界
  验证方式：进入 Project 默认 Agent workspace，点击 Git workspace，断言 URL 分别含 `workspace=agents` 与 `workspace=git`；`consoleSectionFromSearch` 对无效值回退 Agent。
  证据：`.workflow/changes/align-ui-shell-foundation/artifacts/browser-structure/structure-check.log`；`web/src/routes/router.tsx`、`console-model.ts`
  结果：通过

- 场景：Project 二级 shell desktop/mobile
  路径类型：用户可见
  验证方式：browser structure check 检查 Project desktop/mobile workspace navigation，并保存 Agent/Git workspace 截图。
  证据：`project-agent-desktop.png`、`project-agent-mobile.png`、`project-git-desktop.png`、`project-git-mobile.png`
  结果：通过

- 场景：Session detail 深层 chrome
  路径类型：用户可见 / 正常
  验证方式：创建 Terminal Session 后进入 detail，断言顶部 `Back to Project` 可见，Project secondary nav 不存在，并保存 desktop/mobile 截图。
  证据：`session-detail-desktop.png`、`session-detail-mobile.png`、E2E terminal session 通过
  结果：通过

- 场景：Files/Git/Terminal 主路径不回归
  路径类型：正常 / 用户可见
  验证方式：`bun run e2e` 跑 Files browse/preview、Git diff inspection、Terminal session input/output。
  证据：`.workflow/changes/align-ui-shell-foundation/artifacts/e2e/playwright-report/index.html`
  结果：通过

## Evidence 清单

- 类型：测试
  路径或命令：`bun --filter @agents-remote/web typecheck`
  结果：通过
  说明：验证 web TypeScript 与 Router search 类型。

- 类型：测试
  路径或命令：`bun --filter @agents-remote/web test`
  结果：通过，21 pass / 0 fail / 56 expect()
  说明：验证 console model 和现有 web 单元测试。

- 类型：测试
  路径或命令：`bun --filter @agents-remote/web build`
  结果：通过
  说明：验证 Vite production build。

- 类型：e2e
  路径或命令：`E2E_ARTIFACTS_DIR=.workflow/changes/align-ui-shell-foundation/artifacts/e2e bun run e2e`
  结果：通过，3 passed
  说明：真实浏览器覆盖 Files/Git/Terminal 主路径。

- 类型：测试
  路径或命令：`bun x tsc -p tsconfig.e2e.json`
  结果：通过
  说明：验证更新后的 E2E spec 类型。

- 类型：截图 / 交互日志
  路径或命令：`bun .workflow/changes/align-ui-shell-foundation/artifacts/browser-structure-check.ts`
  结果：通过
  说明：保存 desktop/mobile Home、Project Agent、Project Git、Session detail 截图和结构断言日志。

## 交互式 Artifact 清单

- 类型：截图
  路径或命令：`.workflow/changes/align-ui-shell-foundation/artifacts/browser-structure/home-desktop.png`
  结果：已采集
  说明：Home desktop primary shell。

- 类型：截图
  路径或命令：`.workflow/changes/align-ui-shell-foundation/artifacts/browser-structure/home-mobile.png`
  结果：已采集
  说明：Home mobile primary bottom nav。

- 类型：截图
  路径或命令：`.workflow/changes/align-ui-shell-foundation/artifacts/browser-structure/project-agent-desktop.png`
  结果：已采集
  说明：Project desktop secondary Agent workspace。

- 类型：截图
  路径或命令：`.workflow/changes/align-ui-shell-foundation/artifacts/browser-structure/project-agent-mobile.png`
  结果：已采集
  说明：Project mobile secondary Agent workspace bottom nav。

- 类型：截图
  路径或命令：`.workflow/changes/align-ui-shell-foundation/artifacts/browser-structure/project-git-desktop.png`
  结果：已采集
  说明：Project desktop secondary Git workspace。

- 类型：截图
  路径或命令：`.workflow/changes/align-ui-shell-foundation/artifacts/browser-structure/project-git-mobile.png`
  结果：已采集
  说明：Project mobile secondary Git workspace bottom nav。

- 类型：截图
  路径或命令：`.workflow/changes/align-ui-shell-foundation/artifacts/browser-structure/session-detail-desktop.png`
  结果：已采集
  说明：Session detail desktop top return / no Project secondary nav。

- 类型：截图
  路径或命令：`.workflow/changes/align-ui-shell-foundation/artifacts/browser-structure/session-detail-mobile.png`
  结果：已采集
  说明：Session detail mobile top return / runtime input area。

- 类型：交互日志
  路径或命令：`.workflow/changes/align-ui-shell-foundation/artifacts/browser-structure/structure-check.log`
  结果：已采集
  说明：desktop/mobile structure assertions。

- 类型：自动化测试报告 / 服务日志
  路径或命令：`.workflow/changes/align-ui-shell-foundation/artifacts/e2e/playwright-report/index.html`、`e2e-api.log`、`e2e-web.log`
  结果：已采集
  说明：E2E browser run artifacts。

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 通过 | tasks 1.1、2.1、2.2、3.1 均完成；spec 六类 requirement 都有代码与测试/截图证据。 |
| Correctness | 通过 | web typecheck/test/build、E2E、browser structure check 均通过；URL workspace 和 mobile/deep chrome 行为被真实浏览器验证。 |
| Coherence | 通过 | 实现遵循 frontend-ui-architecture 的 route/search 优先、Jotai 降级、三层页面模型、移动端直接二级/深层详情规则；未新增依赖或后端能力。 |

## 问题清单

### CRITICAL

- （无）

### WARNING

- （无）

### SUGGESTION

- 后续 page-level changes 可继续细化具体页面内容密度与 visual polish；本 change 已完成 shell foundation，不阻塞进入后续 changes。

## 回流建议

- （无）

## 最终结论

- 结论：通过
- 是否允许进入 distill-change：是
- 条件或阻塞：无
