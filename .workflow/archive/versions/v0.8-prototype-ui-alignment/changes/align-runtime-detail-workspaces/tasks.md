# tasks

## 执行顺序

1. 基础/阻塞任务：加载 React/prototype implementation 约束，审计当前 Session detail 结构和 shared primitive 复用边界。
2. 核心实现任务：先抽/复用 runtime detail 共用 UI，再分别对齐 Agent detail 与 Terminal detail。
3. 集成与验证任务：收口移动端 input drawer/safe-area/quick keys，采集 artifacts 并回写 gaps。
4. 清理与横切任务：更新 progress、确保无多余 route-local 漂移，准备 verify-change。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 审计 runtime detail prototype 与当前实现边界
  - 验收标准：
    - 实现前已读取 `vercel-react-best-practices` skill 约束或确认已在当前上下文中加载。
    - 已对照 `agent-session-detail.html`、`terminal-instance-detail.html`、`SessionDetailRoute.tsx`、`shell-primitives.tsx` 识别需要复用/抽取的 UI 单元。
    - 明确哪些能力不能伪造：provider-native metadata/history/output、Files/Git 写操作、runtime 协议变更。
  - 任务承诺清单：
    - 不直接进入 route JSX 修补；先确认共享 primitive 边界。
    - 不新增依赖，不做技术选型。
    - 使用 Home/Project shell 已验证的 surface/navigation/action/status 规则。
  - 依据：`plan.md`；`design/frontend.md`；`.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md`；`docs/design/frontend-ui-architecture.md`
  - 必读上下文：`web/src/routes/SessionDetailRoute.tsx`；`web/src/components/shell/shell-layout.tsx`；`web/src/components/shell/shell-primitives.tsx`；`docs/design/prototype/agent-session-detail.html`；`docs/design/prototype/terminal-instance-detail.html`
  - 修改范围：无代码修改；可记录临时发现到实现说明或任务进展。
  - 依赖：无
  - 并行：否（阻塞后续任务）

### 2. 核心实现任务

- [x] 2.1 收敛 shared runtime detail UI primitives 与 surface roles
  - 验收标准：
    - `SessionDetailRoute.tsx` 的 header、terminal output、input drawer、quick keys、notice/status/control 复用现有 shell primitives 或稳定局部组件，避免重复私有 surface 色阶。
    - 如新增 shared primitive，仅限 terminal panel/input drawer/runtime detail 中真实跨 Agent/Terminal 复用的最小边界。
    - 颜色、边框、hover/disabled、danger、warning、code/output surface 继承 `shellSurfaceClasses` 或现有 shell wrappers。
  - 任务承诺清单：
    - 不把 route 专属文案、业务数据转换、API/query 逻辑抽到 shared primitive。
    - 不把 Agent-only tools 泛化进 Terminal detail。
    - 不破坏现有 query/mutation/WebSocket owner。
  - 依据：`design/frontend.md`；`.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md`；`.claude/skills/implement-change/references/component-and-style-abstraction.md`
  - 必读上下文：`web/src/routes/SessionDetailRoute.tsx`；`web/src/components/shell/shell-primitives.tsx`; `web/src/components/shell/shell-layout.tsx`
  - 修改范围：`web/src/routes/SessionDetailRoute.tsx`；必要时 `web/src/components/shell/shell-primitives.tsx`。
  - 依赖：1.1
  - 并行：否（后续 Agent/Terminal detail 对齐依赖该边界）

- [x] 2.2 对齐 Agent detail terminal-first 页面
  - 验收标准：
    - Agent detail desktop/mobile 显示顶部返回、provider/session marker、displayName、runtime status、stream status、Files/Git/+Terminal/Meta contextual tools。
    - terminal output 是主体，input drawer/quick keys 不遮挡 output。
    - Meta 只展示真实 project/session/provider/status/stream/internal id 字段。
    - Contextual Files/Git 是 Agent context 派生工具，有返回 stream 入口，保持只读/staged 边界。
  - 任务承诺清单：
    - 不伪造 provider-native thread/history/transcript/task summary/recent output。
    - 不把 Files/Git contextual tools 变成 Project 二级导航。
    - 不新增 Files/Git 写能力。
  - 依据：`specs/runtime-detail-alignment/spec.md`；`design/ui-ux.md`；`docs/specs/agent-provider-experience/spec.md`；`docs/design/prototype/agent-session-detail.html`
  - 必读上下文：`web/src/routes/SessionDetailRoute.tsx`；`web/src/api/client.ts` 中现有 session/files/git client 方法（按需）
  - 修改范围：`web/src/routes/SessionDetailRoute.tsx`；必要时 `web/src/routes/console-model.ts` / `.test.ts`。
  - 依赖：2.1
  - 并行：否（与 2.3 修改同一 route 文件）

- [x] 2.3 对齐 Terminal detail focused shell 页面
  - 验收标准：
    - Terminal detail desktop/mobile 显示顶部返回、Terminal marker、displayName、runtime status、stream status、Reconnect/Resize/Close 和 terminal output/input drawer。
    - Terminal detail 不显示 Files、Git、+Terminal、Meta、provider pill 或 provider metadata。
    - Close 保留危险确认，close pending/ended/disconnected 状态不破坏输入禁用语义。
  - 任务承诺清单：
    - 不因为复用 Agent header 而泄漏 Agent-only tools。
    - 不新增 Terminal provider 字段或 Agent 状态语义。
    - 不修改 close/reconnect/runtime lifecycle。
  - 依据：`specs/runtime-detail-alignment/spec.md`；`design/ui-ux.md`；`docs/specs/session-runtime/spec.md`；`docs/design/prototype/terminal-instance-detail.html`
  - 必读上下文：`web/src/routes/SessionDetailRoute.tsx`；`web/src/routes/console-model.ts`
  - 修改范围：`web/src/routes/SessionDetailRoute.tsx`；必要时 `web/src/routes/console-model.ts` / `.test.ts`。
  - 依赖：2.1、2.2
  - 并行：否（与 2.2 修改同一 route 文件）

- [x] 2.4 收口移动端 layout、input drawer 和 quick keys
  - 验收标准：
    - Mobile Agent/Terminal detail 不显示 Project 二级 bottom navigation。
    - Input drawer 是布局的一部分，expanded/collapsed 均不覆盖 terminal output，不清空 input，不关闭 stream。
    - Quick keys 可用/禁用状态正确，点击发送真实 sequence；disabled 时不发送。
    - 长 output、session id、project path、textarea 内容不造成横向溢出。
  - 任务承诺清单：
    - 保留 existing `normalizeSessionTextInput` 与 `canSendToSession` 语义。
    - 如调整 quick key set/order，必须更新 `console-model.test.ts`。
    - Safe-area 只服务 input drawer 底部，不制造背景缝隙。
  - 依据：`docs/design/mobile-session-interaction.md`；`design/frontend.md`；`.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md`
  - 必读上下文：`web/src/routes/SessionDetailRoute.tsx`；`web/src/routes/console-model.ts`；`web/src/routes/console-model.test.ts`
  - 修改范围：`web/src/routes/SessionDetailRoute.tsx`；必要时 `web/src/routes/console-model.ts` / `.test.ts`。
  - 依赖：2.2、2.3
  - 并行：否（集成 Agent/Terminal detail 后收口）

### 3. 集成与验证任务

- [x] 3.1 运行前端检查并修复发现的问题
  - 验收标准：
    - `bun run --cwd web typecheck` 通过。
    - `bun run --cwd web test` 通过。
    - `git diff --check` 通过。
    - 如改动 quick key/status model，`bun test web/src/routes/console-model.test.ts` 单独通过。
  - 任务承诺清单：
    - 不跳过 hooks，不使用 `--no-verify`。
    - 不用测试通过替代 browser UI 验证。
  - 依据：`docs/project.md` 测试与质量门禁；`design/risks.md`
  - 必读上下文：`package.json` / `web/package.json`（按需）；测试输出。
  - 修改范围：只修复本 change 引入的问题。
  - 依赖：2.4
  - 并行：否（依赖实现完成）

- [x] 3.2 采集 runtime detail browser artifacts
  - 验收标准：
    - 使用固定 `ar-dev` tmux 调试服务，API `43011`、Web `43012`，`PROJECTS_ROOT=/home/deploy/workspace`。
    - 保存 Agent detail prototype desktop/mobile screenshot、Terminal detail prototype desktop/mobile screenshot。
    - 保存 Agent detail app desktop/mobile screenshot、Terminal detail app desktop/mobile screenshot。
    - 保存 browser check log，包含导航层级、顶部返回、Agent tools、Terminal no-Agent-tools、terminal-first output、input drawer、quick keys、mobile bottom nav 互斥、safe-area/遮挡检查。
  - 任务承诺清单：
    - 不启动漂移端口；不留下孤儿进程。
    - 如果真实 Agent/Terminal session 无法准备，记录环境阻塞或 gap，不伪造截图内容。
    - Artifacts 放入本 change `artifacts/` 目录。
  - 依据：`.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md`；`docs/project.md`；`design/risks.md`
  - 必读上下文：已有 capture 脚本或 browser harness；`docs/design/prototype/screenshots/`（按需）。
  - 修改范围：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/artifacts/`；必要时临时/可复用 capture 脚本。
  - 依赖：3.1
  - 并行：否（需要最终实现）

- [x] 3.3 回写 gaps、shared notes 和 progress
  - 验收标准：
    - 如发现原型需要当前能力/API 不支持的内容，更新 `.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md`。
    - 如发现 shared alignment contract/design-system note 不足，按最小必要回写相关小节。
    - `tasks.md` 所有完成项已勾选；`progress.md` implementation 标记为已完成并推进到待验证。
  - 任务承诺清单：
    - 只回写已验证或实现中确实暴露的 shared 缺口，不写长期 docs。
    - 不把 verify 结论提前写成已通过；最终通过由 verify-change 负责。
  - 依据：`plan.md`；`.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md`；`.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md`
  - 必读上下文：本 change artifacts；shared gaps/note。
  - 修改范围：`tasks.md`；`progress.md`；按需 `.workflow/versions/v0.8-prototype-ui-alignment/shared/*`。
  - 依赖：3.2
  - 并行：否（收尾任务）

## 依赖图

- 1.1 → 2.1 → 2.2 → 2.3 → 2.4 → 3.1 → 3.2 → 3.3

## 可并行任务

- （无）核心修改集中在同一路由与 shared primitives，为避免组件边界和截图证据漂移，本 change 顺序执行。

## 阻塞项

- （无）
