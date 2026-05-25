# verify

本文件记录当前 change 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：implement-agent-provider-experience
- Roadmap 对应项：v0.3-session-runtime-quality / implement-agent-provider-experience
- 验证对象：AgentRuntime/provider profile seam、TmuxRuntime command boundary、SessionRegistry provider-aware metadata/displayName、Agent Session HTTP contract 兼容性。
- 验证结论：通过

## 验证轮次

### Round 1

- 时间：2026-05-25
- 验证范围：本 change 的 specs/design/tasks 全量范围；不包含后续 history/resume API 或真实 Claude/Codex CLI 登录状态。
- 使用 harness：代码 trace、API/runtime 单元与集成测试、全量 workspace quality gate。
- 本轮结论：通过；无 CRITICAL / WARNING。
- 后续动作：进入 `distill-change`，沉淀 AgentRuntime/provider profile 与 TmuxRuntime command boundary 的长期架构规则。

## Harness 清单

- 名称：provider profile / AgentRuntime 单元测试
  类型：unit test
  覆盖承诺：Claude/Codex provider profile、command 解析、provider unavailable 映射、AgentRuntime lifecycle delegation。
  执行方式：`bun run test` 的 api workspace 测试。
  结果：通过。
  证据：`api/src/agent-provider-profiles.test.ts:3`、`api/src/agent-runtime.test.ts:19`；full gate 输出 `@agents-remote/api:test 62 pass`。

- 名称：SessionRegistry / Agent Session API 回归测试
  类型：integration/unit test
  覆盖承诺：AgentSession provider/displayName/status/list/detail/close 语义保持，TerminalSession 不混入 provider，Project-scoped API contract 不变。
  执行方式：`bun run test` 的 api workspace 测试。
  结果：通过。
  证据：`api/src/session-registry.test.ts:24`、`api/src/session-registry.test.ts:51`、`api/src/index.test.ts:167`；full gate 输出 `@agents-remote/api:test 62 pass`。

- 名称：workspace quality gate
  类型：format/lint/typecheck/test/build
  覆盖承诺：实现可构建、类型正确、测试通过，未引入格式或 lint 回归。
  执行方式：`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build`
  结果：通过。
  证据：命令输出显示 format/lint/typecheck/test/build 全部通过，api/shared/web tests 共 83 pass。

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
| --- | --- | --- | --- | --- |
| spec: Agent provider choices are explicit while sharing AgentSession semantics | Claude/Codex 作为不同 provider 创建，但仍返回统一 AgentSession metadata 和 DTO | `api/src/session-registry.ts:128` 创建 Agent metadata；`api/src/session-registry.ts:406` 返回 AgentSession DTO provider/displayName/status | `api/src/index.test.ts:167` 覆盖 Project-scoped Agent/Terminal session APIs；full gate 通过 | 通过 |
| spec/design: Agent Runtime owns provider adaptation | provider command 差异由 AgentRuntime/profile 处理，不在控制面或 tmux adapter 内扩散 | `api/src/agent-provider-profiles.ts:12` 定义 Claude/Codex profile；`api/src/agent-runtime.ts:19` lookup profile 并传入 command | `api/src/agent-runtime.test.ts:19` 验证 claude/codex command；full gate 通过 | 通过 |
| design: TmuxRuntime only executes resolved command | TmuxRuntime 不导入 AgentProvider，不保存 Claude/Codex command 选择逻辑，只提供 `startCommand` 与 tmux IO | `api/src/tmux-runtime.ts:1` 只导入 RuntimeResources/SessionMetadata；`api/src/tmux-runtime.ts:13` 接收已解析 command | typecheck/lint/test/build 通过；代码 trace 确认无 provider command 分支 | 通过 |
| spec: provider unavailable maps clearly | 缺失 provider profile 或 tmux 启动失败映射为 `SESSION_PROVIDER_UNAVAILABLE` | `api/src/agent-runtime.ts:22` 缺 profile 抛 provider unavailable；`api/src/agent-runtime.ts:29` tmux startup failure 映射 provider unavailable | `api/src/agent-runtime.test.ts:37`、`api/src/agent-runtime.test.ts:52` | 通过 |
| spec: list/detail keep provider-aware status visible | Agent list/detail 保留 provider/displayName/status；Terminal 不带 provider | `api/src/session-registry.ts:105` Agent list；`api/src/session-registry.ts:110` Terminal list；`api/src/session-registry.ts:406` / `api/src/session-registry.ts:414` DTO 分离 | `api/src/session-registry.test.ts:24`、`api/src/index.test.ts:167` | 通过 |
| spec/design: history/resume remains staged capability | 当前实现只在 profile capabilities 中标记 history unsupported，不新增 history HTTP API，不混入 active list | `api/src/agent-provider-profiles.ts:7` profile capabilities；`api/src/session-routes.ts:53` 只处理 active agent-sessions list/create/detail/close | API route tests 无新增 history path；full gate 通过 | 通过 |
| tasks: API runtime composition | API startup 组合 TmuxRuntime 与 AgentRuntime，stream 继续使用 tmux IO | `api/src/index.ts:198` 构造 tmuxRuntime；`api/src/index.ts:199` 构造 agentRuntime；`api/src/index.ts:200` 注入 RuntimeResources；`api/src/index.ts:209` stream controller 使用 tmuxRuntime | typecheck/build 通过 | 通过 |

## Delta 验证

- Scope 内变更：新增内部 provider profile 与 AgentRuntime；收窄 TmuxRuntime；更新 SessionRegistry default displayName 读取 provider profile；更新 API startup composition；补充 provider seam 回归测试；补齐 plan/tasks/progress/verify 运行态 artifact。
- Scope 外变更：无前端、shared DTO、HTTP 路径、WebSocket envelope、数据库、provider history API 或 npm dependency 变更。
- 未被 spec/design 支撑的新行为：无。`capabilities.history = "unsupported"` 是内部 profile 标记，符合 design 中 staged capability 的边界，不作为公开 API。
- 风险：真实 `claude` / `codex` CLI 是否安装/登录仍由服务器环境承担；本 change 只验证 provider command 选择和 error mapping，不宣称 provider account readiness。
- 结论：实现差异与 specs/design/plan 一致，未发现 scope creep。

## Scenario 验证

- 场景：用户创建 Claude 或 Codex Agent Session
  路径类型：正常 / 用户可见
  验证方式：AgentRuntime command delegation + Agent Session API tests。
  证据：`api/src/agent-runtime.test.ts:19`、`api/src/index.test.ts:167`。
  结果：通过。

- 场景：provider profile 缺失或 CLI 启动失败
  路径类型：失败
  验证方式：AgentRuntime missing profile 和 tmux startup failure tests。
  证据：`api/src/agent-runtime.test.ts:37`、`api/src/agent-runtime.test.ts:52`。
  结果：通过，错误映射为 `SESSION_PROVIDER_UNAVAILABLE`。

- 场景：用户查看 Agent/Terminal session list/detail
  路径类型：正常 / 用户可见
  验证方式：SessionRegistry DTO 分离与 HTTP session API 回归测试。
  证据：`api/src/session-registry.test.ts:24`、`api/src/index.test.ts:167`。
  结果：通过，Agent 保留 provider，Terminal 不混入 provider。

- 场景：当前 active list 不混入 provider history
  路径类型：边界
  验证方式：代码 trace 检查 session routes 仍只提供 active `agent-sessions` create/list/detail/close；未新增 history API。
  证据：`api/src/session-routes.ts:53`、`api/src/session-routes.ts:60`、`api/src/session-routes.ts:89`、`api/src/session-routes.ts:100`。
  结果：通过。

## Evidence 清单

- 类型：代码引用
  路径或命令：`api/src/agent-provider-profiles.ts:12`
  结果：Claude/Codex internal provider profile 已建立。
  说明：包含 label、command、displayNamePrefix 和 history unsupported capability。

- 类型：代码引用
  路径或命令：`api/src/agent-runtime.ts:19`
  结果：AgentRuntime owns provider lookup and command delegation。
  说明：provider startup failure 映射到 `SESSION_PROVIDER_UNAVAILABLE`。

- 类型：代码引用
  路径或命令：`api/src/tmux-runtime.ts:13`
  结果：TmuxRuntime 只接收 command 启动 tmux session。
  说明：不再导入 `AgentProvider` 或包含 provider command 分支。

- 类型：测试
  路径或命令：`api/src/agent-runtime.test.ts:19`
  结果：通过。
  说明：覆盖 Claude/Codex command 解析、provider unavailable 和 lifecycle delegation。

- 类型：测试
  路径或命令：`api/src/session-registry.test.ts:51`
  结果：通过。
  说明：验证 default Agent displayName 使用 provider profile。

- 类型：测试 / 构建
  路径或命令：`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build`
  结果：通过。
  说明：api/shared/web tests 全部通过；workspace build 成功。

## 三维评估

| 维度 | 状态 | 说明 |
| --- | --- | --- |
| Completeness | 通过 | tasks.md 中 1.1-3.3 均完成；spec 中当前 scope 的 create/list/detail/provider seam/error/history-staged 承诺均有证据。 |
| Correctness | 通过 | 单元/集成测试覆盖 provider command mapping、error mapping、metadata/DTO 分离和 API contract；全量 quality gate 通过。 |
| Coherence | 通过 | 实现符合 design：provider 差异进入 AgentRuntime/profile，TmuxRuntime 只执行 command，shared/API/web contract 保持稳定。 |

## 问题清单

### CRITICAL

- （无）

### WARNING

- （无）

### SUGGESTION

- 后续 history/resume change 应把 `capabilities.history` 从内部 unsupported 标记演进为经过 provider adapter 验证的 normalized history capability，再设计公开 API。

## 回流建议

- （无）

## 最终结论

- 结论：通过
- 是否允许进入 distill-change：是
- 条件或阻塞：无
