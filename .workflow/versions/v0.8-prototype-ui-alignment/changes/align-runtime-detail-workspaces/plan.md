# plan

## Change 目标

- 将 Agent detail 与 Terminal detail 按 `agent-session-detail.html` / `terminal-instance-detail.html` 对齐为 terminal-first runtime detail 页面，同时继承已完成 Home/Project shell 的共享视觉语言、surface roles、导航/返回层级和移动端 safe-area 约束。
- 完成后解锁 `align-resource-inspection-workspaces`，并为最终 prototype alignment release verify 提供 runtime detail 侧的 desktop/mobile artifacts。

## 局部 big picture

- 本 change 位于 v0.8 页面还原第二段：共享基线和 Home/Project shell 已完成，接下来需要把最核心的运行态深层 detail 收敛到同一设计语言。
- Agent/Terminal detail 是深层/contextual detail，不是 Project 直接二级 workspace；移动端底部区域属于 input drawer/quick keys，而不是 Project 二级 bottom navigation。
- 本 change 只对齐现有运行态页面结构和视觉，不扩展 session runtime、provider adapter、Files/Git API 或 WebSocket 协议。

## 执行策略

- 先建立 runtime detail 的共享 UI 边界：识别现有 `SessionDetailRoute.tsx` 中跨 Agent/Terminal 共用的 header、terminal output、input drawer、quick key、notice/status/control surface，并复用或扩展 `web/src/components/shell/` primitives。
- 再按 session type 修正分支：Agent detail 保留 Files/Git/+Terminal/Meta contextual tools；Terminal detail 保持 focused shell，不显示 Agent-only tools/provider metadata。
- 然后处理移动端全高布局：顶部返回 + scroll-safe terminal panel + bottom input drawer，保证 drawer 参与布局、覆盖 safe area、不显示 Project 二级 bottom nav。
- 最后补齐验证证据：tests/typecheck/build、Agent/Terminal prototype/app desktop/mobile screenshots、browser check log；如真实 runtime 环境无法创建某类 session，记录环境前置或 gap，不伪造数据。

## 任务顺序依据

- 任务 1 先做实现前上下文和组件边界审计，阻塞后续编码，避免重复上一 change 中“抽象晚于页面修补”的问题。
- 任务 2 建立共享 runtime detail primitives/route 结构，是任务 3、4 的前置。
- 任务 3 对齐 Agent detail；任务 4 对齐 Terminal detail。二者修改同一 route 文件，原则上不可并行。
- 任务 5 集成移动端 layout、状态和 quick keys，是任务 2-4 的收口。
- 任务 6 验证与 artifacts 必须最后执行，并根据结果回写 follow-up gaps 或 shared note。

## 上游承诺投影

- `alignment-contract.md` 要求：Agent/Terminal detail 必须保存 prototype/app desktop/mobile screenshot 和 browser check log；落到任务 6 的 artifacts 验收。
- `alignment-contract.md` blocking differences：Terminal detail 不得显示 Agent-only tools；移动端 detail 不得显示 Project 二级 bottom navigation；落到任务 3、4、6。
- `design-system-note.md` 要求：React/prototype implementation 必须先加载 `vercel-react-best-practices`；surface/token/navigation/input drawer 不能 route-local 漂移；落到任务 1、2、5。
- `docs/design/frontend-ui-architecture.md` 要求：runtime detail 是深层/contextual detail，Agent contextual tools 不替代 terminal-first 主任务，Terminal detail focused shell；落到任务 3、4。
- `docs/design/mobile-session-interaction.md` 要求：input drawer 不 fixed/floating 覆盖 output，collapsed 不清空输入或关闭 WebSocket，quick keys 即时发送；落到任务 5。
- `docs/specs/session-runtime/spec.md` 要求：runtime/transport 状态、reconnect、close confirmation、ended 状态必须保留；落到任务 3、4、5。
- `docs/specs/agent-provider-experience/spec.md` 要求：Agent detail 保留 provider-aware status，但 provider-native metadata/history 是 staged extension；落到任务 3。
- 固定调试服务约束：browser verify 使用 `ar-dev` tmux session、API `43011`、Web `43012`；落到任务 6。
- 不形成任务约束：shadcn/lucide 版本选择仅为已完成 baseline；本 change 不新增依赖，因此不需要 technology-research 或 npm 安全检查。

## 额外上下文

- `.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md`：artifacts、blocking differences、viewport 和 gap 规则。
- `.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md`：shared surface roles、shell primitive boundary、implementation review gate。
- `.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md`：记录当前能力/API 无法支持的原型差异。
- `docs/design/prototype/agent-session-detail.html`、`docs/design/prototype/terminal-instance-detail.html`、`docs/design/prototype/guidelines.md`：页面结构和移动端/桌面端原型输入。
- `docs/design/mobile-session-interaction.md`、`docs/design/frontend-ui-architecture.md`：长期 runtime detail 和 UI architecture 边界。
- `docs/specs/session-runtime/spec.md`、`docs/specs/agent-provider-experience/spec.md`：运行态行为边界。
- `web/src/routes/SessionDetailRoute.tsx`、`web/src/routes/console-model.ts`、`web/src/routes/console-model.test.ts`、`web/src/components/shell/*`：主要实现入口。
- `docs/project.md`：固定调试服务和移动端验证准则。

## 依赖与阻塞

### 阶段依赖

- 已完成：`establish-prototype-alignment-baseline`、`align-home-project-shell`。
- 当前阶段完成后进入 implement-change；本 plan 不依赖 resource inspection change。

### 任务依赖

- 1 → 2 → 3 → 4 → 5 → 6。
- 3 和 4 都依赖 2，并且会修改同一 route 文件，不能并行。
- 6 依赖所有实现任务完成。

### 外部依赖

- 使用固定 tmux 调试服务 `ar-dev`，API `43011`、Web `43012`，`PROJECTS_ROOT=/home/deploy/workspace`。
- 可能需要真实 Agent/Terminal runtime session 用于 browser screenshots；若环境无法提供，必须记录阻塞或 follow-up gap，不能伪造数据。

## 并行机会

- 规格/设计已完成后，代码实现任务不建议并行，因为核心修改集中在 `SessionDetailRoute.tsx` 与共享 shell primitives，文件冲突风险高。
- 验证 artifacts 中 prototype screenshot capture 与 app screenshot capture 可以在同一脚本中顺序完成；不要求并行。

## 风险与验证重点

- 风险：为了贴近 prototype 伪造 output/history/provider-native metadata。验证重点：app 截图和代码检查只能使用真实 DTO/stream 字段。
- 风险：Terminal detail 误带 Agent-only tools。验证重点：browser check log 显式断言无 Files/Git/+Terminal/Meta/provider pill。
- 风险：input drawer fixed/floating 遮挡 output。验证重点：移动端 browser check 测量/截图确认 output 和 drawer 共同参与布局。
- 风险：route-local style 与 Home/Project shell surface 漂移。验证重点：diff 检查是否复用 `shellSurfaceClasses`、`ActionButton`、`StatusPill`、`IconMarker` 等 shared primitives。
- 风险：缺少真实 runtime session 导致 artifacts 不可信。验证重点：记录 session 准备路径、web/API logs 和无法执行原因。

## 不做事项

- 不新增或修改 API/client/shared DTO/WebSocket 协议。
- 不新增 provider-native metadata、history、task summary、transcript、recent output 或 fake runtime output。
- 不引入 xterm.js、ANSI parser、terminal emulator、quick key configuration 或新 npm 依赖。
- 不实现 Files/Git 写操作或完整 resource inspection page polish。
- 不新增 Project 二级 bottom navigation 到 runtime detail mobile。
