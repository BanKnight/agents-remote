# verify

本文件记录当前 change 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：design-session-runtime-boundaries
- Roadmap 对应项：v0.3-session-runtime-quality / design-session-runtime-boundaries
- 验证对象：Agent Session 与 Terminal Session 的 shared contract、api runtime registry、Project-scoped HTTP/WS、tmux runtime、web Project console 与 session detail UI、workflow implementation evidence。
- 验证结论：通过

## 验证轮次

### Round 1

- 时间：2026-05-25
- 验证范围：Trace specs/design/tasks 到 shared/api/web 实现；检查 Delta 是否超出本 change scope；运行自动化质量门禁；使用 tmux + agent-browser 验证真实 Terminal Session 创建、stream 输入、刷新重连和 close 清理；补测 close 确认提示。
- 使用 harness：workspace quality gate、shared/api/web bun tests、tmux-managed api/web dev 服务、agent-browser E2E、代码审阅 trace。
- 本轮结论：通过，无未解决 CRITICAL。
- 后续动作：进入 `distill-change`，沉淀 session runtime WHAT/HOW。

## Harness 清单

- 名称：Workspace quality gate
  类型：format/lint/typecheck/unit/build
  覆盖承诺：代码格式、静态检查、shared/api/web 类型契约、自动化测试、生产构建。
  执行方式：`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build`
  结果：通过。
  证据：命令输出显示 oxfmt clean、oxlint 0 warnings/errors、api/shared/web typecheck 通过、api 55 tests / shared 4 tests / web 17 tests 通过、api/shared/web build 通过。

- 名称：Automated session tests
  类型：unit/integration tests
  覆盖承诺：session DTO 分层、SessionRegistry metadata、安全 tmux name、stale cleanup、Project-scoped HTTP API、auth guard、close semantics、WebSocket envelope、web API helpers 和 console model。
  执行方式：`bun run test`
  结果：通过。
  证据：api 55 pass、shared 4 pass、web 17 pass。

- 名称：Terminal Session browser E2E
  类型：tmux + agent-browser E2E
  覆盖承诺：登录、Project 创建/进入、Terminal Session 创建、详情 stream、shell 输出、发送输入、刷新重连、close 后返回列表并移除 session。
  执行方式：tmux 启动 isolated api/web dev 服务，agent-browser 操作 `http://127.0.0.1:36499`。
  结果：通过。
  证据：`artifacts/terminal-session-stream.png`、`artifacts/terminal-session-closed-console.png`、`artifacts/e2e-api.log`、`artifacts/e2e-web.log`。

- 名称：Close confirmation retest
  类型：agent-browser targeted retest
  覆盖承诺：关闭 session 前显示确认提示，提示会终止运行进程。
  执行方式：stub `window.confirm` 捕获 detail close 文案；Project console card 使用同一文案和确认门禁。
  结果：通过，捕获文案 `Close this session? The running process will be terminated.`。
  证据：browser eval 输出；`artifacts/e2e-confirm-api.log`、`artifacts/e2e-confirm-web.log`。

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| spec: AgentSession and TerminalSession remain separate | Agent/Terminal 在 DTO、API、UI、metadata 中保持产品语义区分；Agent 有 provider，Terminal 无 provider。 | `packages/shared/src/index.ts:25-48` 定义 provider/status/type 和分离 DTO；`api/src/session-routes.ts:48-162` 使用平行 Agent/Terminal resources；`web/src/routes/ProjectConsoleRoute.tsx:83-114` 分别查询/创建/关闭两类 session。 | shared tests 4 pass；api tests 55 pass；web tests 17 pass；E2E 中 Terminal 区域独立创建普通 shell。 | 通过 |
| spec: Internal session id is stable route/API key | URL/API 使用 internal session id，displayName 仅展示。 | `api/src/session-registry.ts:260-271` 生成 internal id/displayName/tmux name；`web/src/routes/ProjectConsoleRoute.tsx:425-430` 用 `session.id` 构造 detail link；`web/src/routes/SessionDetailRoute.tsx:64-70` 用 URL sessionId 读取详情。 | web API URL tests 通过；E2E detail URL 为 `/projects/demo/terminal-sessions/terminal_*`，页面显示 displayName 和 id。 | 通过 |
| spec: Runtime metadata maps identity to runtime resources | metadata 保存 id/project/type/provider/displayName/status/tmuxSessionName，并位于 runtime dir sessions 下。 | `api/src/session-registry.ts:15-28` 定义 metadata；`api/src/session-registry.ts:74-79` 使用 `${runDir}/sessions`；`api/src/session-registry.ts:297-322` 写入 0600 metadata 并创建 0700 sessions dir。 | registry tests 覆盖 metadata/cleanup；quality gate 通过。 | 通过 |
| spec: Tmux names are safe internal identifiers | tmux name 使用安全 project key + type/provider + short id，不暴露原始 project 名为 resource name。 | `api/src/session-registry.ts:330-368` 生成 `ar-{type}-{provider?}-{safeProjectKey}-{idPrefix}`，safe key 使用 slug + sha256 hash。 | registry safe tmux naming tests 通过。 | 通过 |
| spec: Minimal lifecycle states | 第一轮支持 running/closed/error，Agent 额外保留 idle；Project summary counts 来自活跃 registry。 | `packages/shared/src/index.ts:27-33` 定义状态；`api/src/projects.ts:106-119` 将 sessionCounter count 写入 Project DTO；`api/src/session-registry.ts:93-113` 按 registry 派生 counts/list。 | api project/session count tests 通过；E2E close 后 console 不再展示 Terminal card。 | 通过 |
| spec: Transport reconnect != runtime lifecycle | WebSocket 断开不 close runtime；重连/刷新可重新 attach，missing runtime 返回 ended/missing。 | `api/src/session-stream.ts:91-109` open 发送 connected/snapshot 并开始 poll；`api/src/session-stream.ts:156-163` close 只清 timer；`api/src/session-stream.ts:165-190` runtime missing 发送 ended，否则发送 snapshot/output；`web/src/routes/SessionDetailRoute.tsx:102-168` 维护 connected/disconnected/ended/error transport 状态。 | stream controller tests 覆盖 snapshot/input/resize/ping 和 ended；E2E 刷新后仍看到 `e2e-terminal-ok` 输出。 | 通过 |
| spec: Closing terminates runtime | close action 终止 tmux runtime 并移除 metadata，UI close 前确认。 | `api/src/session-registry.ts:280-286` close 时调用 runtime.close 并删除 metadata；`api/src/tmux-runtime.ts:43-49` 执行 `tmux kill-session`；`web/src/routes/ProjectConsoleRoute.tsx:433-440` list close 确认；`web/src/routes/SessionDetailRoute.tsx:302-314` detail close 确认并调用 close mutation。 | api close tests 通过；E2E close 后返回 Project console 且 Terminal card 消失；confirmation retest 捕获终止进程提示。 | 通过 |
| spec: TerminalSession is live project-scoped shell | Terminal create 在 Project safe path 下启动普通 shell，不含 provider。 | `api/src/session-routes.ts:115-137` Terminal create 不接 provider；`api/src/session-registry.ts:150-164` 创建 terminal metadata 并调用 runtime.startTerminal；`api/src/tmux-runtime.ts:15-17` 使用 shellCommand 启动；`api/src/tmux-runtime.ts:85-94` `tmux new-session -c metadata.projectPath`。 | E2E terminal prompt cwd 为 `/tmp/.../projects/demo`；输入 `printf e2e-terminal-ok` 输出成功。 | 通过 |
| spec: AgentSession provider seam | Agent create 接受 Claude/Codex provider，记录 provider；provider unavailable 返回明确错误；不暴露 tmux/provider native id。 | `api/src/session-routes.ts:61-87` validate provider 并映射 provider unavailable；`api/src/session-registry.ts:128-148` createAgentSession 记录 provider 并清理失败 metadata；`api/src/tmux-runtime.ts:19-41` provider command seam。 | api tests 覆盖 Agent seam 和 provider unavailable cleanup；shared/web DTO tests 通过。 | 通过 |
| task: web client and Project console UI | web client 提供 list/create/detail/close/stream URL，console 展示真实 session summary/入口/close，detail 支持 stream input/reconnect/ended 文案。 | `web/src/api/client.ts:72-158` session HTTP helpers 和 stream URL；`web/src/routes/ProjectConsoleRoute.tsx:83-194` queries/mutations/sections；`web/src/routes/SessionDetailRoute.tsx:102-168` WS lifecycle；`web/src/routes/SessionDetailRoute.tsx:248-280` output/input/resize UI。 | web tests 17 pass；agent-browser E2E 覆盖 create/open/input/reload/close。 | 通过 |
| plan: quality and E2E evidence | 质量命令必须通过；tmux + agent-browser E2E evidence 保存到 artifacts。 | `progress.md` 已记录 implementation 完成和 artifacts 路径；`tasks.md` 2.4/3.1/3.2/3.3/4.1 已勾选。 | full quality gate 通过；artifacts 下存在 stream/closed screenshots 和 api/web logs。 | 通过 |

## Delta 验证

- Scope 内变更：新增 session shared DTO/error code；api SessionRegistry、session routes、session stream、tmux runtime、Project session counts；web session API client、Project console real session UI、session detail routes；workflow specs/design/plan/tasks/progress/verify/artifacts。
- Scope 外变更：无 Files/Git、数据库、provider-native thread/turn、PWA/service worker、xterm 依赖或长期 docs 直接沉淀。
- 未被 spec/design 支撑的新行为：无。实现中新增的 detail close query removal是为 close 后避免 refetch 已删除 detail 阻塞导航，属于 close 用户路径修正。
- 风险：第一轮 stream UI 使用 `<pre>` + `<textarea>` 呈现，不是完整 xterm.js terminal emulator；当前 change 的验收重点是 runtime boundary 和真实 tmux/WebSocket 链路，移动端/xterm 体验由后续 `implement-mobile-session-interaction` 承接。
- 结论：通过，无 scope 扩散阻塞。

## Scenario 验证

- 场景：创建并连接 Terminal Session
  路径类型：正常 / 用户可见
  验证方式：tmux-managed api/web dev 服务 + agent-browser 登录、创建 Project、创建 Terminal Session、打开 stream detail。
  证据：`artifacts/terminal-session-stream.png`、`artifacts/e2e-api.log`、`artifacts/e2e-web.log`。
  结果：通过。

- 场景：发送 shell 输入并显示输出
  路径类型：正常 / 用户可见
  验证方式：agent-browser 在 detail 输入 `printf e2e-terminal-ok`，stream 捕获 tmux 输出。
  证据：`artifacts/terminal-session-stream.png`。
  结果：通过。

- 场景：刷新/重连后仍看到当前缓冲内容
  路径类型：边界 / 用户可见
  验证方式：agent-browser reload detail route 后读取 `<pre>`，仍包含 `e2e-terminal-ok` 输出。
  证据：browser command output；`artifacts/terminal-session-stream.png`。
  结果：通过。

- 场景：关闭 session 前确认并终止 runtime
  路径类型：危险 / 用户可见
  验证方式：agent-browser close detail 后返回 Project console；Terminal card 消失；targeted retest stub `window.confirm` 捕获终止进程提示。
  证据：`artifacts/terminal-session-closed-console.png`；confirmation retest 输出 `Close this session? The running process will be terminated.`。
  结果：通过。

- 场景：runtime missing 自动清理或 ended
  路径类型：边界 / 失败
  验证方式：automated SessionRegistry stale cleanup tests；SessionStreamController missing runtime test。
  证据：api tests 55 pass。
  结果：通过。

- 场景：未认证 session HTTP/WS 被拒绝
  路径类型：失败 / 安全
  验证方式：api handler tests 覆盖 auth guard 和 stream upgrade auth path。
  证据：api tests 55 pass。
  结果：通过。

- 场景：Agent provider unavailable
  路径类型：失败 / 边界
  验证方式：api tests 使用 runtime seam 模拟 provider unavailable 并检查 metadata cleanup/error mapping。
  证据：api tests 55 pass。
  结果：通过。

## Evidence 清单

- 类型：测试
  路径或命令：`bun run test`
  结果：通过；api 55 pass、shared 4 pass、web 17 pass。
  说明：覆盖 shared DTO、api registry/routes/stream/tmux seam、web client/model。

- 类型：质量门禁
  路径或命令：`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build`
  结果：通过。
  说明：最终在 close confirmation 修复后重新执行通过。

- 类型：E2E / 截图
  路径或命令：`.workflow/changes/design-session-runtime-boundaries/artifacts/terminal-session-stream.png`
  结果：通过。
  说明：Terminal detail 显示 tmux shell 输出和输入结果。

- 类型：E2E / 截图
  路径或命令：`.workflow/changes/design-session-runtime-boundaries/artifacts/terminal-session-closed-console.png`
  结果：通过。
  说明：关闭后返回 Project console，Terminal session card 不再展示。

- 类型：E2E / 日志
  路径或命令：`.workflow/changes/design-session-runtime-boundaries/artifacts/e2e-api.log`、`.workflow/changes/design-session-runtime-boundaries/artifacts/e2e-web.log`
  结果：通过。
  说明：tmux-managed api/web dev 服务日志。

- 类型：E2E / 日志
  路径或命令：`.workflow/changes/design-session-runtime-boundaries/artifacts/e2e-confirm-api.log`、`.workflow/changes/design-session-runtime-boundaries/artifacts/e2e-confirm-web.log`
  结果：通过。
  说明：close confirmation targeted retest 服务日志。

- 类型：代码引用
  路径或命令：`packages/shared/src/index.ts:25-156`、`api/src/session-registry.ts:15-418`、`api/src/session-routes.ts:48-162`、`api/src/session-stream.ts:91-190`、`api/src/tmux-runtime.ts:9-124`、`web/src/routes/ProjectConsoleRoute.tsx:83-194`、`web/src/routes/SessionDetailRoute.tsx:64-314`
  结果：通过。
  说明：核心实现位置可追踪。

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 通过 | 2.4、3.1、3.2、3.3、4.1 均完成；spec 中关键 Agent/Terminal 分层、metadata、safe tmux naming、HTTP/WS、reconnect、close、Terminal live shell、Agent provider seam 均有实现和证据。 |
| Correctness | 通过 | 自动化测试、质量门禁和真实 tmux/browser E2E 均通过；verify 期间发现的 close confirmation 缺口已修复并复测。 |
| Coherence | 通过 | 实现保持 `packages/shared` 只放 DTO、`api` 持有 runtime/registry/tmux、`web` 只经 `/api` HTTP/WS 操作 session；未把 tmux name/provider-native id 暴露为公共主键。 |

## 问题清单

### CRITICAL

- （无）

### WARNING

- （无）

### SUGGESTION

- 后续 `implement-mobile-session-interaction` 可将当前 `<pre>` + `<textarea>` 的最小 stream UI 升级为更完整的 terminal/xterm 体验；本 change 已验证真实 tmux/WebSocket runtime 链路，不阻塞当前 verify。

## 回流建议

- （无）

## 最终结论

- 结论：通过
- 是否允许进入 distill-change：是
- 条件或阻塞：（无）
