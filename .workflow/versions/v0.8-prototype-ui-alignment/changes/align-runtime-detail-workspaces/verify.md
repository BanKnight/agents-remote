# verify

本文件记录当前 change 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：align-runtime-detail-workspaces
- Roadmap 对应项：v0.8-prototype-ui-alignment / align-runtime-detail-workspaces
- 验证对象：Agent detail 与 Terminal detail 的 terminal-first runtime detail 原型对齐实现、shared runtime surface roles、input drawer/quick keys/mobile safe-area、artifacts 与 follow-up gaps。
- 验证结论：条件通过

## 验证轮次

### Round 1

- 时间：2026-05-29
- 验证范围：对照 context/spec/design/plan/tasks/shared contract，验证 `SessionDetailRoute.tsx`、`shell-primitives.tsx`、browser artifacts、follow-up gaps 与自动化检查。
- 使用 harness：TypeScript typecheck、web unit tests、console-model focused tests、git diff whitespace check、agent-browser desktop/mobile screenshots 与结构检查 JSON/log。
- 本轮结论：条件通过；无 CRITICAL，唯一 WARNING 为原型 Shift+Tab mode/selection quick key 当前真实能力不支持，已登记到 shared follow-up gaps 且 UI 未伪造。
- 后续动作：允许进入 `distill-change`，沉淀 runtime detail/input drawer/shared primitive 的长期结论；后续 terminal interaction change 可承接 Shift+Tab mode/selection 能力。

## Harness 清单

- 名称：Web TypeScript typecheck
  类型：static check
  覆盖承诺：React route、shared primitive 类型正确；不破坏现有 TanStack Query/WebSocket owner 与 component props。
  执行方式：`bun run --cwd web typecheck`
  结果：通过
  证据：命令输出 `$ tsc --noEmit`，退出成功。

- 名称：Web test suite
  类型：unit test
  覆盖承诺：前端现有 view/model 行为未回归。
  执行方式：`bun run --cwd web test`
  结果：通过；21 pass，0 fail，56 expect() calls。
  证据：本轮命令输出。

- 名称：Console model focused tests
  类型：unit test
  覆盖承诺：Agent/Terminal quick key order、真实 control sequence、`normalizeSessionTextInput` 与 `canSendToSession` 语义保持。
  执行方式：`bun test web/src/routes/console-model.test.ts`
  结果：通过；8 pass，0 fail，25 expect() calls。
  证据：本轮命令输出。

- 名称：Whitespace diff check
  类型：git check
  覆盖承诺：提交前 diff 无尾随空白或 whitespace error。
  执行方式：`git diff --check`
  结果：通过
  证据：命令无输出，退出成功。

- 名称：Runtime detail browser artifacts
  类型：headless browser / screenshot / structure check
  覆盖承诺：Agent/Terminal desktop/mobile 原型和真实页面截图、导航层级、terminal-first output、input drawer、quick keys、Terminal no-Agent-tools、mobile no bottom nav、horizontal overflow。
  执行方式：固定 tmux `ar-dev`，API `43011`、Web `43012`、`PROJECTS_ROOT=/home/deploy/workspace`，使用 `agent-browser` 采集截图与 JSON。
  结果：通过；未发现 blocking differences。
  证据：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/artifacts/browser-check.log`、`agent-desktop-check.json`、`agent-mobile-check.json`、`terminal-desktop-check.json`、`terminal-mobile-check.json`。

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| spec: Runtime detail pages SHALL remain deep contextual detail pages | Agent/Terminal detail 使用顶部返回、terminal-first body；mobile 不显示 Project 二级 bottom nav | `web/src/routes/SessionDetailRoute.tsx:277-343` 使用三段 grid；`web/src/routes/SessionDetailRoute.tsx:397-448` 使用 runtime header 与顶部返回 | `browser-check.log` Agent/Terminal desktop/mobile 均记录 top return present、Project secondary bottom nav absent；JSON `projectBottomNav: false` | 通过 |
| spec: Agent detail SHALL expose contextual tools without displacing terminal-first work | Agent detail 保留 Files/Git/+T/Meta contextual tools，Meta 只展示真实字段 | `web/src/routes/SessionDetailRoute.tsx:450-458` 仅 Agent 分支渲染 tools；`web/src/routes/SessionDetailRoute.tsx:599-621` Meta 只展示 project/session/type/provider/runtime/stream/internal id | `agent-desktop-check.json`：Files/Git/Meta/+T/runtime/stream present；`agent-mobile-check.json`：Files/Git/Meta/+T present | 通过 |
| spec: Terminal detail SHALL remain a focused shell | Terminal detail 有返回、Terminal marker、runtime/stream status、Reconnect/Resize/Close；无 Agent-only tools/provider metadata | `web/src/routes/SessionDetailRoute.tsx:421-447` provider pill 仅 provider 存在时显示；`web/src/routes/SessionDetailRoute.tsx:450-459` Agent tools 仅 Agent 渲染；`web/src/routes/SessionDetailRoute.tsx:563-573` controls 保留 Reconnect/Resize/Close | `terminal-desktop-check.json` 和 `terminal-mobile-check.json`：Files/Git/Meta/+Terminal/provider absent，Reconnect/Resize/Close present | 通过 |
| spec: Runtime detail output SHALL be terminal-first and scroll-safe | output 是主体、局部滚动、长行 wrap、empty 使用真实等待文案 | `web/src/routes/SessionDetailRoute.tsx:675-693` terminal panel 使用 grid、`overflow-auto`、`whitespace-pre-wrap`、`break-words` 和真实 empty 文案 | Browser check：terminalFirst true、noHorizontalOverflow true；screenshots 已保存 | 通过 |
| spec: Input drawer SHALL participate in runtime detail layout | input drawer 是底部 grid row，不 fixed/floating；collapsed 不清空 input 或关闭 stream | `web/src/routes/SessionDetailRoute.tsx:277-343` drawer 为三段 grid 底部 row；`web/src/routes/SessionDetailRoute.tsx:915-970` collapsed 只切换渲染并保留 `input` state | `agent-mobile-check.json` / `terminal-mobile-check.json`：drawerPresent true、drawerBelowOutput true | 通过 |
| spec: Quick keys SHALL reflect real stream input semantics | quick keys 使用真实 sequence，disabled 时不发送；不写 textarea | `web/src/routes/SessionDetailRoute.tsx:251-275` 使用 `canSendToSession` 和 `quickKey.sequence`；`web/src/routes/SessionDetailRoute.tsx:936-940` sequence 由 `console-model` 传入；`web/src/routes/SessionDetailRoute.tsx:980-994` disabled 时不可点击 | `bun test web/src/routes/console-model.test.ts` 通过；browser JSON 记录 Agent/Terminal quick keys；Shift+Tab mode 缺口见 WARNING | 条件通过 |
| spec: Runtime detail SHALL preserve lifecycle and transport states | runtime status、stream status、Reconnect、Close confirmation、ended/input disabled 语义保留 | `web/src/routes/SessionDetailRoute.tsx:295-302` Close confirmation/Reconnect/Resize 保留；`web/src/routes/SessionDetailRoute.tsx:437-447` runtime/stream status pills；`web/src/routes/SessionDetailRoute.tsx:956-961` input disabled 文案 | Typecheck/tests 通过；browser log 记录 Reconnect/Resize/Close 与 runtime/stream status present | 通过 |
| spec: Runtime detail alignment SHALL keep artifacts and gaps traceable | artifacts 完整；unsupported capability 进入 shared gaps，不伪造 | `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/artifacts/` 包含 8 张截图、4 个 JSON、browser-check.log；`.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md` 包含 `GAP-20260529-runtime-shift-tab-mode` | `browser-check.log` 记录真实 fixtures、无 fake runtime data、Shift+Tab gap | 通过 |
| task 2.1 / design-system-note | runtime header/body/composer/terminal titlebar 进入 shared surface roles，避免 route-local 色阶漂移 | `web/src/components/shell/shell-primitives.tsx:37-55` 新增 runtime roles；route 消费 `shellSurfaceClasses`、`ActionButton`、`StatusPill`、`IconMarker` | `git diff -- web/src/routes/SessionDetailRoute.tsx web/src/components/shell/shell-primitives.tsx` 确认 scope；typecheck 通过 | 通过 |
| task 3.1 / 3.2 / 3.3 | 检查、browser artifacts、gaps/progress 已完成 | `tasks.md` 全部实现任务已勾选；`progress.md` implementation 已完成；`browser-check.log` 与 follow-up gaps 已存在 | typecheck/test/diff-check 通过；artifacts 可审查 | 通过 |

## Delta 验证

- Scope 内变更：
  - `web/src/routes/SessionDetailRoute.tsx`：重组 runtime detail 为 header/body/composer 三段结构；收敛 terminal output、input drawer、quick keys、Agent contextual tools、Terminal controls、contextual Files/Git surfaces。
  - `web/src/components/shell/shell-primitives.tsx`：新增 `runtimeHeader`、`runtimeBody`、`runtimeComposer`、`terminalTitlebar` surface roles。
  - `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/**`：补齐 specs/design/plan/tasks/artifacts 与本 verify。
  - `.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md`：登记 Shift+Tab mode/selection follow-up gap。
- Scope 外变更：未发现 API/client/shared DTO/WebSocket 协议、runtime lifecycle、Files/Git 写能力或依赖变更。
- 未被 spec/design 支撑的新行为：未发现；`+T` 只是现有 `+Terminal` 的紧凑标签，仍调用既有 create terminal mutation。
- 风险：Agent mobile JSON 的 `hasProvider: false` 是检查字段对 literal provider 文案的保守结果；desktop provider marker/status 与代码 provider pill 均存在，且 mobile 保留真实 marker/status，不构成 CRITICAL。
- 结论：通过；diff 与 plan/tasks/design scope 一致。

## Scenario 验证

- 场景：Agent detail desktop
  路径类型：用户可见 / 正常
  验证方式：真实 Agent session `agent_952626c227e4495e`，desktop viewport `1440x1000`，agent-browser screenshot + `agent-desktop-check.json`。
  证据：`agent-detail-app-desktop.png`；`agent-desktop-check.json`；`browser-check.log`。
  结果：通过；top return、provider/session marker、runtime/stream status、Files/Git/+T/Meta、terminal-first output、no bottom nav、no overflow 均满足。

- 场景：Agent detail mobile
  路径类型：用户可见 / 边界
  验证方式：真实 Agent session，mobile viewport `390x844`，agent-browser screenshot + `agent-mobile-check.json`。
  证据：`agent-detail-app-mobile.png`；`agent-mobile-check.json`；`browser-check.log`。
  结果：通过；top return、Agent tools、terminal-first output、drawer below output、quick keys、no Project bottom nav、no overflow 均满足。

- 场景：Terminal detail desktop
  路径类型：用户可见 / 正常
  验证方式：临时真实 Terminal session `terminal_9393d4379b8b4bfb`，desktop viewport `1440x1000`，agent-browser screenshot + `terminal-desktop-check.json`。
  证据：`terminal-detail-app-desktop.png`；`terminal-desktop-check.json`；`browser-check.log`。
  结果：通过；top return、Terminal marker/displayName/status、Reconnect/Resize/Close、terminal-first output present，Agent-only tools/provider metadata absent。

- 场景：Terminal detail mobile
  路径类型：用户可见 / 边界
  验证方式：临时真实 Terminal session，mobile viewport `390x844`，agent-browser screenshot + `terminal-mobile-check.json`。
  证据：`terminal-detail-app-mobile.png`；`terminal-mobile-check.json`；`browser-check.log`。
  结果：通过；drawer below output、quick keys、no Project bottom nav、no horizontal overflow，Terminal focused shell 边界满足。

- 场景：Unsupported prototype Shift+Tab mode/selection
  路径类型：边界 / 用户可见
  验证方式：对照 prototype quick keys、`console-model` 真实 quick key set、browser log 和 shared gaps。
  证据：`browser-check.log` Differences and gaps；`.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md` 中 `GAP-20260529-runtime-shift-tab-mode`。
  结果：条件通过；当前 UI 未渲染不支持的 Shift+Tab mode，不伪造 sequence/capability，后续版本承接。

## Evidence 清单

- 类型：测试
  路径或命令：`bun run --cwd web typecheck`
  结果：通过
  说明：TypeScript 编译检查无错误。

- 类型：测试
  路径或命令：`bun run --cwd web test`
  结果：通过；21 pass，0 fail，56 expect() calls。
  说明：前端单元测试未回归。

- 类型：测试
  路径或命令：`bun test web/src/routes/console-model.test.ts`
  结果：通过；8 pass，0 fail，25 expect() calls。
  说明：quick key 与 input/send model 语义保持。

- 类型：测试
  路径或命令：`git diff --check`
  结果：通过
  说明：diff 无 whitespace error。

- 类型：代码引用
  路径或命令：`web/src/components/shell/shell-primitives.tsx:37-55`
  结果：通过
  说明：runtime surface roles 已进入 shared primitive 边界。

- 类型：代码引用
  路径或命令：`web/src/routes/SessionDetailRoute.tsx:277-343`、`web/src/routes/SessionDetailRoute.tsx:397-488`、`web/src/routes/SessionDetailRoute.tsx:675-693`、`web/src/routes/SessionDetailRoute.tsx:915-994`
  结果：通过
  说明：runtime frame/header/output/input/quick keys 使用真实状态与 shared surfaces。

- 类型：日志 / 交互日志
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/artifacts/browser-check.log`
  结果：通过
  说明：记录固定 dev 环境、真实 runtime fixtures、结构检查和 non-blocking differences。

- 类型：trace
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md`
  结果：通过
  说明：Unsupported Shift+Tab mode/selection 已按 shared gap rule 登记。

## 交互式 Artifact 清单

- 类型：截图
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/artifacts/agent-detail-prototype-desktop.png`
  结果：已采集
  说明：Agent detail prototype desktop，1440x1000。

- 类型：截图
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/artifacts/agent-detail-prototype-mobile.png`
  结果：已采集
  说明：Agent detail prototype mobile，390x844。

- 类型：截图
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/artifacts/terminal-detail-prototype-desktop.png`
  结果：已采集
  说明：Terminal detail prototype desktop，1440x1000。

- 类型：截图
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/artifacts/terminal-detail-prototype-mobile.png`
  结果：已采集
  说明：Terminal detail prototype mobile，390x844。

- 类型：截图
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/artifacts/agent-detail-app-desktop.png`
  结果：已采集
  说明：真实 Agent detail app desktop，使用真实 Agent session。

- 类型：截图
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/artifacts/agent-detail-app-mobile.png`
  结果：已采集
  说明：真实 Agent detail app mobile，使用真实 Agent session。

- 类型：截图
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/artifacts/terminal-detail-app-desktop.png`
  结果：已采集
  说明：真实 Terminal detail app desktop，临时 Terminal session 截图后已关闭。

- 类型：截图
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/artifacts/terminal-detail-app-mobile.png`
  结果：已采集
  说明：真实 Terminal detail app mobile，临时 Terminal session 截图后已关闭。

- 类型：自动化测试报告
  路径或命令：`agent-desktop-check.json`、`agent-mobile-check.json`、`terminal-desktop-check.json`、`terminal-mobile-check.json`
  结果：通过
  说明：结构检查覆盖导航层级、tools 边界、terminal-first、drawer、quick keys、overflow。

- 类型：浏览器日志 / 交互日志
  路径或命令：`browser-check.log`
  结果：通过
  说明：汇总 environment、real fixtures、structure checks、interaction checks、differences/gaps。

## Version shared 验证记录

- shared：`.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md`
  验证方式：检查 Prototype Map、Viewports、Blocking Differences、Artifact Requirements 与本 change artifacts。
  结果：通过；Agent/Terminal prototype/app desktop/mobile screenshots 与 browser check log 已补齐；Terminal no-Agent-tools、mobile no bottom nav、no fake data 均有证据。

- shared：`.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md`
  验证方式：检查 implementation 是否加载/遵循 React/prototype best practices、surface/token roles、shadcn wrapper boundary、route-local style drift 限制。
  结果：通过；实现阶段记录已加载 `vercel-react-best-practices`，本次代码将 runtime surface roles 放入 `shellSurfaceClasses` 并复用 `ActionButton`、`StatusPill`、`IconMarker`。

- shared：`.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md`
  验证方式：检查 unsupported prototype capability 是否登记。
  结果：通过；`GAP-20260529-runtime-shift-tab-mode` 已登记为 future-enhancement，当前 UI 未伪造。

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 条件通过 | specs/tasks/design 中的 runtime detail、Agent tools、Terminal focused shell、mobile drawer、artifacts 均有证据；Shift+Tab mode 以 follow-up gap 承接。 |
| Correctness | 通过 | 自动化检查全部通过；browser checks 未发现 blocking differences；runtime/API/WebSocket lifecycle 未被改写。 |
| Coherence | 通过 | 变更继承 Home/Project shell shared primitives，新增 runtime surface roles，保留 route/data owner 与 Agent/Terminal 产品边界。 |

## 问题清单

### CRITICAL

- （无）

### WARNING

- Prototype Shift+Tab mode/selection quick key 当前真实 quick key model 不支持。
  - 对应承诺或证据：`agent-session-detail.html` / `terminal-instance-detail.html` 包含 Shift+Tab mode/selection 语义；`console-model` 当前只提供 Ctrl+C、Ctrl+D、Esc、Tab、Enter 和方向键等已支持 sequence。
  - 影响范围：Agent/Terminal quick key 视觉完整度低于原型，但不影响当前真实 runtime input/control sequence 能力。
  - 当前处理：UI 不渲染不支持的 Shift+Tab；`.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md` 已登记 `GAP-20260529-runtime-shift-tab-mode`。
  - 建议回流技能：无需回流当前 change；后续 terminal interaction change 可从 `specify-change`/`design-change` 开始设计 mode/selection 能力。

### SUGGESTION

- 后续 `align-resource-inspection-workspaces` 可以复用本次验证过的 runtime surface roles 与 browser check log 格式，继续减少 route-local style drift。

## 回流建议

- 当前 change 无需回流；允许进入 `distill-change`。
- 后续能力建议：为 Shift+Tab mode/selection 建立独立 terminal interaction change，不在本 version 伪造。

## 最终结论

- 结论：条件通过
- 是否允许进入 distill-change：是
- 条件或阻塞：无 CRITICAL；Shift+Tab mode/selection 为已登记 WARNING/follow-up gap，不阻塞本 change 沉淀。
