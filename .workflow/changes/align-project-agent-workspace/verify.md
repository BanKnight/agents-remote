# verify

本文件记录当前 change 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：align-project-agent-workspace
- Roadmap 对应项：v0.8-prototype-ui-alignment / align-project-agent-workspace
- 验证对象：Project Agent workspace 的 provider 创建入口、当前 Agent instances 列表、staged session history、桌面/移动 Project 二级导航和真实 DTO 边界。
- 验证结论：通过

## 验证轮次

### Round 1

- 时间：2026-05-26
- 验证范围：
  - Trace：对照本 change 的 `project-console-navigation` 与 `agent-provider-experience` specs，确认实现覆盖 Agent instances 主工作区、Claude/Codex 创建入口、provider-aware 当前实例列表、staged history 和移动端二级导航密度。
  - Delta：检查本轮 diff 仅改变 `ProjectConsoleRoute.tsx` 的 Agent workspace 子树和本 change 运行态 artifacts/progress，未修改 API、shared DTO、Agent Runtime、Terminal runtime 或 provider adapter。
  - Scenario：运行 format/lint/typecheck/test/build 与真实浏览器 harness，覆盖桌面/移动 Agent workspace 空态、Project 导航、provider 创建入口 pending/disabled 状态和 staged history。
- 使用 harness：format、lint、web typecheck、web tests、web build、Playwright browser harness。
- 本轮结论：通过，无 CRITICAL / WARNING。
- 后续动作：进入 `distill-change`，将已验证的 Agent workspace 长期规则按需沉淀到 docs。

## Harness 清单

- 名称：repository format check
  类型：format
  覆盖承诺：代码与运行态 artifact 格式未破坏项目门禁。
  执行方式：`bun run format:check`
  结果：通过；`All matched files use the correct format.`
  证据：本轮命令输出。

- 名称：repository lint
  类型：lint
  覆盖承诺：Agent workspace 局部组件拆分未引入 lint warning/error。
  执行方式：`bun run lint`
  结果：通过；`Found 0 warnings and 0 errors.`
  证据：本轮命令输出。

- 名称：web typecheck
  类型：typecheck
  覆盖承诺：`AgentSession` / `AgentProvider` / `TerminalSession` 类型使用正确，未扩展不存在 DTO 字段。
  执行方式：`bun --filter @agents-remote/web typecheck`
  结果：通过，退出码 0。
  证据：本轮命令输出。

- 名称：web tests
  类型：unit / integration test
  覆盖承诺：现有 web 行为未因 Agent workspace UI 改造回归。
  执行方式：`bun --filter @agents-remote/web test`
  结果：通过；21 pass，0 fail，56 expect calls。
  证据：本轮命令输出。

- 名称：web production build
  类型：build
  覆盖承诺：Vite production build 可完成。
  执行方式：`bun --filter @agents-remote/web build`
  结果：通过；`✓ built in 3.10s`。
  证据：本轮命令输出。

- 名称：Agent workspace browser harness
  类型：e2e / headless browser
  覆盖承诺：桌面端与移动端 Agent workspace 展示 provider 创建入口、空 instances、staged history、Project 导航，并在 provider 创建请求 pending 时禁用创建入口。
  执行方式：`bun .workflow/changes/align-project-agent-workspace/artifacts/browser-agent-workspace-check.ts`
  结果：通过，生成桌面/移动截图和检查日志。
  证据：`.workflow/changes/align-project-agent-workspace/artifacts/browser-agent-workspace/agent-workspace-check.log`

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| `specs/project-console-navigation/spec.md` | Project Agent workspace 优先展示 Agent instances，不让 Files/Git/Terminal 挤占主工作区。 | `web/src/routes/ProjectConsoleRoute.tsx:330`、`web/src/routes/ProjectConsoleRoute.tsx:347`、`web/src/routes/ProjectConsoleRoute.tsx:362` | browser harness 检查桌面/移动 `Agent instances` heading、空态和 Project 导航；`agent-workspace-check.log` | 通过 |
| `specs/agent-provider-experience/spec.md` | Agent workspace 顶部提供 Claude/Codex provider 创建入口，同时保持统一 Agent Session 语义。 | `web/src/routes/ProjectConsoleRoute.tsx:352`、`web/src/routes/ProjectConsoleRoute.tsx:353`、`web/src/routes/ProjectConsoleRoute.tsx:356` | browser harness 检查 `+ Claude` / `+ Codex` 可见，并拦截 POST 验证 pending disabled 状态；`agent-create-pending-desktop.png`、`agent-create-pending-mobile.png` | 通过 |
| `specs/project-console-navigation/spec.md` | Agent instance row 展示 provider、displayName、status、id 和 detail entry，长 metadata 不横向溢出。 | `web/src/routes/ProjectConsoleRoute.tsx:419`、`web/src/routes/ProjectConsoleRoute.tsx:423`、`web/src/routes/ProjectConsoleRoute.tsx:429`、`web/src/routes/ProjectConsoleRoute.tsx:430`、`web/src/routes/ProjectConsoleRoute.tsx:434`、`web/src/routes/ProjectConsoleRoute.tsx:440` | `bun --filter @agents-remote/web typecheck` 验证只使用真实 DTO 字段；browser harness 覆盖空态与主结构；line-level review 确认 row 使用 `truncate` / `break-all` / `min-w-0` | 通过 |
| `specs/agent-provider-experience/spec.md` | 当前 Agent Sessions 列表不混入 provider history，空态不伪造历史或当前实例。 | `web/src/routes/ProjectConsoleRoute.tsx:380`、`web/src/routes/ProjectConsoleRoute.tsx:385`、`web/src/routes/ProjectConsoleRoute.tsx:466` | browser harness 检查 `No Agent instances yet`、`Session history` 和 `Future restore will live here`；`agent-workspace-desktop.png`、`agent-workspace-mobile.png` | 通过 |
| `design/ui-ux.md` / `design/frontend.md` | History/future restore 仅作为 staged capability，不提供不可用恢复操作，不伪造 recent output/task summary/relative time。 | `web/src/routes/ProjectConsoleRoute.tsx:466`、`web/src/routes/ProjectConsoleRoute.tsx:474`、`web/src/routes/ProjectConsoleRoute.tsx:476`、`web/src/routes/ProjectConsoleRoute.tsx:479`、`web/src/routes/ProjectConsoleRoute.tsx:483` | browser harness 检查 staged history 文案；typecheck 与 diff review 确认未新增 DTO/API/history 字段 | 通过 |
| `plan.md` / `tasks.md` | 保留 create/close error、loading、empty、disabled/pending 和危险 close confirm。 | `web/src/routes/ProjectConsoleRoute.tsx:361`、`web/src/routes/ProjectConsoleRoute.tsx:381`、`web/src/routes/ProjectConsoleRoute.tsx:385`、`web/src/routes/ProjectConsoleRoute.tsx:451` | browser harness 检查创建中禁用；line-level review 确认 close confirm 和 error rendering 保留 | 通过 |
| `docs/design/frontend-ui-architecture.md` | 移动端 Project 直接二级页保留底部二级导航，不在顶部重复 Back；UI 变更必须真实浏览器验证。 | Project shell 未在本 change 修改；Agent workspace 仍挂载在既有 Project route/shell 下，row detail link 保留 `search: { workspace: "agents" }`：`web/src/routes/ProjectConsoleRoute.tsx:440` | browser harness 检查 desktop `Project workspace navigation` 与 mobile `Project mobile workspace navigation`；`agent-workspace-check.log` | 通过 |

## Delta 验证

- Scope 内变更：
  - `web/src/routes/ProjectConsoleRoute.tsx` 中 Agent workspace 子树改为 provider create header、当前 Agent instances list/row、staged session history。
  - `.workflow/changes/align-project-agent-workspace/` 下新增 specs/design/plan/tasks/artifacts/progress/verify 等运行态产物。
- Scope 外变更：无。本轮未修改 API client、shared DTO、后端 runtime、provider adapter、Agent/Terminal Session detail、Files/Git/Terminal resource pages。
- 未被 spec/design 支撑的新行为：无。`+ Claude` / `+ Codex`、Agent row、staged history、pending disabled、close confirm 均可追溯到 specs/design/tasks。
- 风险：真实 provider history/resume 仍未实现；当前 UI 已明确 staged/future，不提供恢复操作，因此不阻塞本 change。
- 结论：通过。

## Scenario 验证

- 场景：桌面端打开 Project Agent workspace
  路径类型：正常 / 用户可见
  验证方式：browser harness 使用 1440x1000 viewport 登录临时项目，进入默认 `workspace=agents`，检查 heading、provider 创建入口、空态、Session history 和 Project navigation。
  证据：`.workflow/changes/align-project-agent-workspace/artifacts/browser-agent-workspace/agent-workspace-desktop.png`、`agent-workspace-check.log`
  结果：通过。

- 场景：移动端打开 Project Agent workspace
  路径类型：正常 / 用户可见
  验证方式：browser harness 使用 390x844 viewport 登录临时项目，检查 Agent workspace、provider 创建入口、空态、Session history 和 Project mobile workspace navigation。
  证据：`.workflow/changes/align-project-agent-workspace/artifacts/browser-agent-workspace/agent-workspace-mobile.png`、`agent-workspace-check.log`
  结果：通过。

- 场景：provider 创建请求进入 pending
  路径类型：边界 / 失败 / 用户可见
  验证方式：browser harness 拦截 `POST /api/projects/*/agent-sessions` 并延迟返回 503，点击 `+ Claude` 后检查 `+ Claude` 与 `+ Codex` 均 disabled。
  证据：`.workflow/changes/align-project-agent-workspace/artifacts/browser-agent-workspace/agent-create-pending-desktop.png`、`agent-create-pending-mobile.png`、`agent-workspace-check.log`
  结果：通过。

- 场景：当前没有 Agent Sessions
  路径类型：边界 / 用户可见
  验证方式：browser harness 使用临时空 Project，检查 `No Agent instances yet` 空态与 Claude/Codex 创建入口共存。
  证据：`.workflow/changes/align-project-agent-workspace/artifacts/browser-agent-workspace/agent-workspace-desktop.png`、`agent-workspace-mobile.png`
  结果：通过。

- 场景：provider history 尚未实现
  路径类型：边界 / 用户可见
  验证方式：browser harness 检查 `Session history` region 和 `Future restore will live here` 文案；line-level review 确认未提供恢复按钮。
  证据：`.workflow/changes/align-project-agent-workspace/artifacts/browser-agent-workspace/agent-workspace-check.log`、`web/src/routes/ProjectConsoleRoute.tsx:466`
  结果：通过。

## Evidence 清单

- 类型：测试
  路径或命令：`bun run format:check`
  结果：通过
  说明：全部匹配文件格式正确。

- 类型：测试
  路径或命令：`bun run lint`
  结果：通过
  说明：0 warnings，0 errors。

- 类型：测试
  路径或命令：`bun --filter @agents-remote/web typecheck`
  结果：通过
  说明：web TypeScript typecheck 退出码 0。

- 类型：测试
  路径或命令：`bun --filter @agents-remote/web test`
  结果：通过
  说明：21 pass，0 fail，56 expect calls。

- 类型：测试
  路径或命令：`bun --filter @agents-remote/web build`
  结果：通过
  说明：Vite production build 成功。

- 类型：e2e / 自动化测试报告
  路径或命令：`bun .workflow/changes/align-project-agent-workspace/artifacts/browser-agent-workspace-check.ts`
  结果：通过
  说明：真实 Chromium browser harness 生成桌面/移动截图与检查日志。

- 类型：日志
  路径或命令：`.workflow/changes/align-project-agent-workspace/artifacts/browser-agent-workspace/agent-workspace-check.log`
  结果：通过
  说明：记录 desktop/mobile Agent workspace 可见、provider create pending disabled 状态可见。

- 类型：代码引用
  路径或命令：`web/src/routes/ProjectConsoleRoute.tsx:330`、`web/src/routes/ProjectConsoleRoute.tsx:380`、`web/src/routes/ProjectConsoleRoute.tsx:419`、`web/src/routes/ProjectConsoleRoute.tsx:466`
  结果：通过
  说明：Agent workspace header、instances list/row 与 staged history 的实现位置。

## 交互式 Artifact 清单

- 类型：截图
  路径或命令：`.workflow/changes/align-project-agent-workspace/artifacts/browser-agent-workspace/agent-workspace-desktop.png`
  结果：通过
  说明：桌面端 Agent workspace 显示 provider create actions、空 instances、staged history 和 Project navigation。

- 类型：截图
  路径或命令：`.workflow/changes/align-project-agent-workspace/artifacts/browser-agent-workspace/agent-workspace-mobile.png`
  结果：通过
  说明：移动端 Agent workspace 显示 provider create actions、空 instances、staged history 和 Project mobile workspace navigation。

- 类型：截图
  路径或命令：`.workflow/changes/align-project-agent-workspace/artifacts/browser-agent-workspace/agent-create-pending-desktop.png`
  结果：通过
  说明：桌面端 provider create pending 时 Claude/Codex 创建入口禁用。

- 类型：截图
  路径或命令：`.workflow/changes/align-project-agent-workspace/artifacts/browser-agent-workspace/agent-create-pending-mobile.png`
  结果：通过
  说明：移动端 provider create pending 时 Claude/Codex 创建入口禁用。

- 类型：服务日志
  路径或命令：`.workflow/changes/align-project-agent-workspace/artifacts/browser-agent-workspace/api.log`
  结果：通过
  说明：browser harness 运行时 API dev server 日志。

- 类型：浏览器/前端服务日志
  路径或命令：`.workflow/changes/align-project-agent-workspace/artifacts/browser-agent-workspace/web.log`
  结果：通过
  说明：browser harness 运行时 Web dev server 日志。

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 通过 | specs、design、plan/tasks 中承诺的 provider 创建入口、当前 instances、staged history、移动端导航与 quality gates 均有证据。 |
| Correctness | 通过 | 实现只使用真实 `AgentSession` 字段，创建 pending、空态、close confirm 和 staged history 行为符合约束。 |
| Coherence | 通过 | 变更遵守 frontend UI architecture 的 Project 二级页、移动端导航、列表密度、真实状态保留和不过度抽象规则。 |

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
