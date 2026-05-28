# verify

本文件记录当前 change 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：align-home-project-shell
- Roadmap 对应项：v0.8-prototype-ui-alignment / align-home-project-shell
- 验证对象：Home / Projects shell、Project Agent workspace、shared shell layout/navigation/primitives、shadcn wrapper source components、console model labels、browser artifacts 与 shared baseline 继承情况
- 验证结论：通过

## 验证轮次

### Round 1

- 时间：2026-05-28
- 验证范围：spec requirements、design decisions、tasks 1.1-3.3、实现 diff、frontend harness、desktop/mobile browser artifacts、version shared 读写约定
- 使用 harness：Bun route/model tests、web TypeScript typecheck、web production build、Playwright browser artifact capture、manual screenshot inspection
- 本轮结论：通过，无 CRITICAL/WARNING
- 后续动作：可进入 `distill-change`

### Round 2

- 时间：2026-05-28
- 验证范围：shell primitives 从 route-local 文件提升为 `web/src/components/shell/` 组件库边界、Home/Project/Session detail import 迁移、shared/design/docs 路径同步、前端测试和浏览器 artifact 回归
- 使用 harness：`bun test web/src/routes/console-model.test.ts`、`bun run --cwd web test`、`bun run --cwd web typecheck`、`bun run --cwd web build`、Playwright browser artifact capture
- 本轮结论：通过，无 CRITICAL/WARNING
- 后续动作：保持已完成，可随 version 归档

### Round 3

- 时间：2026-05-28 20:44 +0800
- 验证范围：按用户要求重做 verify，不复用旧截图结论；重新执行 frontend checks，重新生成 Home / Project prototype 与 app 的 desktop/mobile screenshots、browser check log，并人工打开新截图对照原型结构。
- 使用 harness：`bun test web/src/routes/console-model.test.ts`、`bun run --cwd web test`、`bun run --cwd web typecheck`、`bun run --cwd web build`、`bun .workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/capture-home-project-shell.ts`、manual screenshot inspection
- 本轮结论：通过，无 CRITICAL/WARNING；最新截图时间戳为 2026-05-28 20:44 +0800，未发现 blocking differences。
- 后续动作：保持已完成，可随 version 归档

### Round 4

- 时间：2026-05-28
- 验证范围：响应桌面原型结构复查，修正 desktop 左/右 shell 中间间距、右侧 header/content 上下分区、surface 色值和 primary action 按钮层级；同步 shadcn wrapper 边界与运行态/长期文档。
- 使用 harness：`bun run --cwd web typecheck`、`bun run --cwd web test`、`bun test web/src/routes/console-model.test.ts`、`bun run --cwd web build`、`bun .workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/capture-home-project-shell.ts`、manual desktop/mobile screenshot inspection
- 本轮结论：通过，无 CRITICAL/WARNING；desktop screenshots 显示 shell 已贴合为连续左右结构，右侧 workspace 已分成 header/content，`New / Adopt` 与 `+ Claude` / `+ Codex` 为 primary cyan-violet action。
- 后续动作：保持已完成，可随 version 归档；反思结论需回写 shared implementation review gate，避免后续 change 再漏掉 layout/navigation/shadcn 使用边界。

### Round 5

- 时间：2026-05-29
- 验证范围：响应 mobile/desktop 复查，修正 shared bottom navigation vertical 分支、一级/二级 navigation active 宽度契约、移动端响应式 shell/safe-area、Home mobile topbar 文案、Project mobile 直接顶部栏、Project 卡片短状态 pill、capture script 的 viewport-aware heading 断言，并回写 version shared / implement references。
- 使用 harness：`bun run --cwd web typecheck`、`bun run --cwd web test`、`bun test web/src/routes/console-model.test.ts`、`bun run --cwd web build`、`bun .workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/capture-home-project-shell.ts`、manual mobile screenshot inspection、post-capture process/listener cleanup check
- 本轮结论：通过，无 CRITICAL/WARNING；desktop screenshot 显示一级/二级导航 active 宽度已统一由 shared component 撑满导航列，mobile screenshots 显示工作区响应式贴边铺满并延伸到 fixed bottom navigation 顶部，bottom navigation 覆盖 safe area 且由 shared component 统一为原型的 icon+label 表达，Project mobile 顶部为项目名 + Agent 状态，不再显示桌面版 heading/path。
- 后续动作：保持已完成，可随 version 归档。

## Harness 清单

- 名称：console model route tests
  类型：unit test
  覆盖承诺：Project console 默认 Agent workspace、二级导航顺序、label/status 更新、session helpers 稳定性
  执行方式：`bun test web/src/routes/console-model.test.ts`
  结果：8 pass / 0 fail
  证据：命令输出；`web/src/routes/console-model.test.ts`

- 名称：web test suite
  类型：unit test
  覆盖承诺：web route/model/PWA 相关测试仍通过
  执行方式：`bun run --cwd web test`
  结果：21 pass / 0 fail
  证据：命令输出

- 名称：web typecheck
  类型：TypeScript check
  覆盖承诺：React/route/model 类型一致，未破坏 TanStack Router/Query 接入
  执行方式：`bun run --cwd web typecheck`
  结果：通过
  证据：命令输出

- 名称：web production build
  类型：build
  覆盖承诺：Tailwind arbitrary classes、React bundle、route code 可构建
  执行方式：`bun run --cwd web build`
  结果：通过
  证据：命令输出

- 名称：Home / Project browser artifact capture
  类型：headless browser / screenshot / structural check
  覆盖承诺：shared alignment contract 要求的 prototype/app desktop/mobile screenshots 与 browser check log
  执行方式：`bun .workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/capture-home-project-shell.ts`
  结果：通过
  证据：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/browser-check.log`

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| spec / task 2.1 | Home desktop 显示一级左侧导航 + Projects 工作区，Project list 是主内容，create/adopt 是低频入口 | `web/src/routes/HomeRoute.tsx:55`、`web/src/routes/HomeRoute.tsx:114`、`web/src/routes/HomeRoute.tsx:175` | `home-app-desktop.png`；`browser-check.log` 行 7 | 通过 |
| spec / task 2.1 | Home mobile 显示底部一级导航且不遮挡 Projects 内容 | `web/src/routes/HomeRoute.tsx:142`；mobile 截图显示底部 nav 与列表分离 | `home-app-mobile.png`；`browser-check.log` 行 8 | 通过 |
| spec / task 2.1 | Project row 使用真实 Project 字段，不伪造 metadata，不横向溢出 | `web/src/routes/HomeRoute.tsx:219`；仅使用 name/path/count/gitBranch | `home-app-desktop.png`；`home-app-mobile.png` | 通过 |
| spec / task 1.2 | shared shell layout/navigation/primitives 收紧桌面连续 shell、marker/nav/pill/button/input/list row 密度和状态表达，并提升到组件库边界 | `web/src/components/shell/shell-layout.tsx`、`web/src/components/shell/shell-navigation.tsx`、`web/src/components/shell/shell-primitives.tsx`、`web/src/components/ui/button.tsx`、`web/src/components/ui/badge.tsx`、`web/src/components/ui/card.tsx`、`web/src/components/ui/input.tsx` | `bun run --cwd web test`；screenshots | 通过 |
| spec / task 1.2 | Project 二级导航 label/status 保持语义且更贴近原型 | `web/src/routes/console-model.ts:27`；`web/src/routes/console-model.test.ts:20` | `bun test web/src/routes/console-model.test.ts` | 通过 |
| spec / task 2.2 | Project desktop 显示二级左侧导航、project chip、Agent workspace 主内容 | `web/src/routes/ProjectConsoleRoute.tsx:209`、`web/src/routes/ProjectConsoleRoute.tsx:309`、`web/src/routes/ProjectConsoleRoute.tsx:352` | `project-agent-app-desktop.png`；`browser-check.log` 行 9 | 通过 |
| spec / task 2.2 | Project mobile 显示 Back/Agent/Files/Git/Terminal 底部二级导航，顶部不重复 Back | `web/src/routes/ProjectConsoleRoute.tsx:248`；mobile screenshot 顶部只显示 context/header | `project-agent-app-mobile.png`；`browser-check.log` 行 10 | 通过 |
| spec / task 2.2 | Claude/Codex 创建入口清晰，关闭 Agent 保留确认 | `web/src/routes/ProjectConsoleRoute.tsx:371`、`web/src/routes/ProjectConsoleRoute.tsx:467` | browser structural check confirms create buttons visible | 通过 |
| spec / task 2.2 / shared | staged history/future restore 不伪造 provider history 或 recent output | `web/src/routes/ProjectConsoleRoute.tsx:485`；文案明确 future/staged | `project-agent-app-desktop.png`；`project-agent-app-mobile.png`；`browser-check.log` 行 12 | 通过 |
| spec / task 3.2 | 保存 home/project prototype/app desktop/mobile screenshots 和 browser check log | artifacts 目录包含 8 张截图、capture logs 和 browser check log | `browser-check.log` 行 2-12 | 通过 |
| task 3.3 / shared | 按需更新 shared gaps 或说明无需更新 | 未发现 missing API、原型冲突或 shared baseline 错误；provider history 用 staged/future 表达 | `browser-check.log` 行 11-12；`follow-up-gaps.md` 保持无新增 | 通过 |

## Delta 验证

- Scope 内变更：`web/src/routes/HomeRoute.tsx`、`web/src/routes/ProjectConsoleRoute.tsx`、`web/src/routes/SessionDetailRoute.tsx`、`web/src/components/shell/shell-primitives.tsx`、`web/src/routes/console-model.ts`、`web/src/routes/console-model.test.ts`；本 change 运行态 progress/tasks/verify/artifacts。
- Scope 外变更：无已验证的代码 scope 外变更；未修改 `api/`、`packages/shared/`、route definitions、API client、session/runtime、Files/Git/Terminal workspace 内部能力。
- 未被 spec/design 支撑的新行为：无。UI 只调整 visual density、labels、navigation presentation、shadcn source wrapper 边界和 artifacts；已按 shared 规则引入并固定 shadcn/lucide 版本，但未新增真实能力。
- 风险：shared primitives 的视觉改变会影响同页面 Files/Git/Terminal 的 list row/button/pill 基础，但本 change 通过 typecheck/build 和 Home/Project browser smoke 验证，后续 resource changes 将继续消费同一 baseline。
- 结论：通过。

## Scenario 验证

- 场景：Desktop Home / Projects shell
  路径类型：用户可见 / 正常
  验证方式：临时 API/web + Playwright 登录 + `1440x1000` screenshot
  证据：`artifacts/home-app-desktop.png`；`artifacts/browser-check.log`
  结果：通过

- 场景：Mobile Home / Projects shell
  路径类型：用户可见 / 正常
  验证方式：临时 API/web + Playwright 登录 + `390x844` screenshot
  证据：`artifacts/home-app-mobile.png`；`artifacts/browser-check.log`
  结果：通过

- 场景：Desktop Project Agent workspace
  路径类型：用户可见 / 正常
  验证方式：从 Home 打开真实 Project + `1440x1000` screenshot
  证据：`artifacts/project-agent-app-desktop.png`；`artifacts/browser-check.log`
  结果：通过

- 场景：Mobile Project Agent workspace
  路径类型：用户可见 / 正常
  验证方式：从 Home 打开真实 Project + `390x844` screenshot
  证据：`artifacts/project-agent-app-mobile.png`；`artifacts/browser-check.log`
  结果：通过

- 场景：Provider history 不可用
  路径类型：边界 / 用户可见
  验证方式：检查 UI 只展示 staged/future 文案，不渲染 fake history/recent output
  证据：`web/src/routes/ProjectConsoleRoute.tsx:485`；`artifacts/project-agent-app-mobile.png`
  结果：通过

## Evidence 清单

- 类型：测试
  路径或命令：`bun test web/src/routes/console-model.test.ts`
  结果：8 pass / 0 fail
  说明：验证 console model label/order/status helper 未回归。

- 类型：测试
  路径或命令：`bun run --cwd web test`
  结果：21 pass / 0 fail
  说明：验证 web 测试集通过。

- 类型：测试
  路径或命令：`bun run --cwd web typecheck`
  结果：通过
  说明：验证 TypeScript 类型。

- 类型：测试
  路径或命令：`bun run --cwd web build`
  结果：通过
  说明：验证 Vite/Tailwind/React production build。

- 类型：截图 / 交互日志
  路径或命令：`bun .workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/capture-home-project-shell.ts`
  结果：通过
  说明：生成 prototype/app desktop/mobile screenshots 与 browser check log。

- 类型：代码引用
  路径或命令：`web/src/routes/HomeRoute.tsx`、`web/src/routes/ProjectConsoleRoute.tsx`、`web/src/routes/SessionDetailRoute.tsx`、`web/src/components/shell/shell-layout.tsx`、`web/src/components/shell/shell-navigation.tsx`、`web/src/components/shell/shell-primitives.tsx`、`web/src/components/ui/button.tsx`、`web/src/components/ui/badge.tsx`、`web/src/components/ui/card.tsx`、`web/src/components/ui/input.tsx`、`web/src/routes/console-model.ts`
  结果：通过
  说明：实现范围与 plan/design 修改范围一致，route 通过 shell layer 消费 shadcn source components。

## 交互式 Artifact 清单

- 类型：截图
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/home-prototype-desktop.png`
  结果：已保存
  说明：`home.html` prototype at `1440x1000`。

- 类型：截图
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/home-prototype-mobile.png`
  结果：已保存
  说明：`home.html` prototype at `390x844`。

- 类型：截图
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/home-app-desktop.png`
  结果：已保存
  说明：Home app at `1440x1000`。

- 类型：截图
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/home-app-mobile.png`
  结果：已保存
  说明：Home app at `390x844`。

- 类型：截图
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/project-detail-prototype-desktop.png`
  结果：已保存
  说明：`project-detail.html` prototype at `1440x1000`。

- 类型：截图
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/project-detail-prototype-mobile.png`
  结果：已保存
  说明：`project-detail.html` prototype at `390x844`。

- 类型：截图
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/project-agent-app-desktop.png`
  结果：已保存
  说明：Project Agent workspace app at `1440x1000`。

- 类型：截图
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/project-agent-app-mobile.png`
  结果：已保存
  说明：Project Agent workspace app at `390x844`。

- 类型：交互日志 / 服务日志
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/browser-check.log`、`capture-api.log`、`capture-web.log`
  结果：已保存
  说明：记录 app URL、viewport、结构检查、可接受差异与服务日志。

## Version Shared 验证记录

- `alignment-contract.md`：已消费。artifacts 覆盖 `home.html` 和 `project-detail.html` 的 desktop/mobile prototype/app screenshots；browser check log 记录 viewport、结构检查、可接受差异和 blocking difference 状态。
- `design-system-note.md`：已消费。实现前加载 `vercel-react-best-practices`；按 npm 7 天安全规则固定 `shadcn@4.7.0` 与 `lucide-react@1.16.0`；通过 `web/src/components/shell/` 收紧并沉淀 shell layout、primary/project navigation、icon marker、nav item、status pill、action button、input、list row 的轻量组件库边界；shadcn `Button`、`Badge`、`Card`、`Input` 均通过 shell wrapper 消费。
- `follow-up-gaps.md`：已检查。未发现需要追加的 missing API、prototype conflict、capability boundary 或 shared-baseline gap；provider history/recent output 缺失已按 shared baseline 使用 staged/future 表达，不伪造数据。

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 通过 | tasks 1.1-3.3 均完成；screenshots/log/test/build/typecheck 证据齐全；Round 5 已补验证 mobile full-width shell、bottom navigation shared component 分支与 mobile direct topbar。 |
| Correctness | 通过 | Home/Project shell 满足 specs；route/query/session/API 边界未改；无 fake provider history/output。 |
| Coherence | 通过 | route 文件保留页面组合、数据和行为，跨页面 shell layout/navigation/primitives 已提升到 `web/src/components/shell/`，shadcn source components 位于 `web/src/components/ui/` 并由 shell wrapper 消费，符合 design/frontend 与 shared baseline。 |

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
