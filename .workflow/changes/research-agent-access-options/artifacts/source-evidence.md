# Source evidence traceability

本文件记录任务 2.1 对 hapi/remodex 本地源码证据的追溯校验结果。

## 校验状态

- 校验日期：2026-05-24
- change-id：research-agent-access-options
- hapi 本地路径：`/home/deploy/repos/hapi`
- hapi commit：`0fa21a121a9307f42595e6e9be01aec7f99cd7dc`
- remodex 本地路径：`/home/deploy/repos/remodex`
- remodex commit：`e63cf05c7652b5a349e3005e18903d7f3f6132f7`

## hapi evidence map

| 主题 | 源码路径 | 支撑结论 |
|---|---|---|
| resumable sessions / resume target | `/home/deploy/repos/hapi/hub/src/sync/syncEngine.ts` | hapi 将可恢复会话列表、resume target 解析和恢复执行集中在 sync/runtime 层。 |
| CLI resume APIs | `/home/deploy/repos/hapi/hub/src/web/routes/cli.ts` | hapi 为 CLI/Web 暴露 resumable、resume-target、handoff-local、messages 等入口。 |
| shared summary/schema | `/home/deploy/repos/hapi/shared/src/sessionSummary.ts`, `/home/deploy/repos/hapi/shared/src/schemas.ts` | hapi 用共享类型/schema 保持 hub/web/cli 对齐，避免 DTO 漂移。 |
| session/message/machine store | `/home/deploy/repos/hapi/hub/src/store/index.ts`, `/home/deploy/repos/hapi/hub/src/store/sessions.ts`, `/home/deploy/repos/hapi/hub/src/store/messages.ts` | hapi 使用持久化 store 支撑 dual-ID、messages 和 reconciliation。 |
| session bootstrap metadata | `/home/deploy/repos/hapi/cli/src/agent/sessionFactory.ts`, `/home/deploy/repos/hapi/cli/src/agent/sessionBase.ts` | hapi 在 session bootstrap 中保存 stable internal id 相关 metadata，并保留 provider-native resume keys。 |
| provider registry / backend seam | `/home/deploy/repos/hapi/cli/src/agent/AgentRegistry.ts`, `/home/deploy/repos/hapi/cli/src/agent/runners/runAgentSession.ts`, `/home/deploy/repos/hapi/cli/src/agent/backends/acp/AcpSdkBackend.ts` | hapi 通过 registry/backend runner 隔离 provider 差异，并将 provider session/new/load/prompt 等协议适配在 backend 层。 |
| sync/rpc gateway | `/home/deploy/repos/hapi/hub/src/sync/rpcGateway.ts` | hapi 的 hub 作为 multiplexer/gateway，不把 provider 细节直接暴露给 Web UI。 |
| terminal socket/runtime | `/home/deploy/repos/hapi/web/src/hooks/useTerminalSocket.ts`, `/home/deploy/repos/hapi/hub/src/socket/handlers/terminal.ts`, `/home/deploy/repos/hapi/hub/src/socket/terminalRegistry.ts`, `/home/deploy/repos/hapi/cli/src/terminal/TerminalManager.ts` | hapi 将 terminal/PTY stream 与 structured agent messages 分离。 |
| CLI-to-Web message mapping | `/home/deploy/repos/hapi/cli/src/api/apiSession.ts`, `/home/deploy/repos/hapi/hub/src/web/routes/events.ts`, `/home/deploy/repos/hapi/hub/src/web/routes/sessions.ts`, `/home/deploy/repos/hapi/hub/src/web/routes/messages.ts`, `/home/deploy/repos/hapi/web/src/hooks/useSSE.ts`, `/home/deploy/repos/hapi/web/src/chat/normalize.ts`, `/home/deploy/repos/hapi/web/src/lib/assistant-runtime.ts`, `/home/deploy/repos/hapi/web/src/components/SessionChat.tsx` | hapi 将 CLI agent updates/events 持久化并广播到 React/Web UI。 |

## hapi path correction

初版研究材料曾记录以下 provider-specific 文件路径：

- `/home/deploy/repos/hapi/cli/src/agent/claude/session.ts`
- `/home/deploy/repos/hapi/cli/src/agent/codex/session.ts`

本次校验发现这两个路径在当前 hapi commit 中不存在。研究材料已修正为实际存在的 `AgentRegistry.ts`、`runners/runAgentSession.ts` 和 `backends/acp/AcpSdkBackend.ts`，用它们支撑 provider adapter seam 与 backend protocol 适配结论。

## remodex evidence map

| 主题 | 源码路径 | 支撑结论 |
|---|---|---|
| Codex transport backend | `/home/deploy/repos/remodex/phodex-bridge/src/codex-transport.js` | remodex bridge 可 spawn `codex app-server`，也可 attach 到已有 WebSocket endpoint，说明 provider transport backend 应可插拔。 |
| relay / trusted session | `/home/deploy/repos/remodex/phodex-bridge/src/secure-device-state.js`, `/home/deploy/repos/remodex/relay/server.js`, `/home/deploy/repos/remodex/relay/relay.js` | remodex relay session 是 transport/rendezvous 层概念，不等同于 Codex thread。 |
| Codex thread/turn APIs | `/home/deploy/repos/remodex/CodexMobile/CodexMobile/Services/CodexService+ThreadsTurns.swift` | remodex 将 Agent 逻辑历史建模为 thread lifecycle，并把输入建模为 turn-level API。 |
| event stream / replay | `/home/deploy/repos/remodex/CodexMobile/CodexMobile/Services/CodexService+Incoming.swift`, `/home/deploy/repos/remodex/phodex-bridge/src/secure-transport.js` | remodex 使用 incoming events 和 seq/ack buffer 支撑 reconnect replay。 |
| terminal is optional capability | `/home/deploy/repos/remodex/CodexMobile/CodexMobile/Services/Terminal/CodexService+Terminal.swift` | resize/input 出现在 native SSH terminal path，说明 PTY 能力不应成为 core AgentSession 必选字段。 |
| transport auth vs provider auth | `/home/deploy/repos/remodex/phodex-bridge/src/secure-transport.js`, `/home/deploy/repos/remodex/CodexMobile/CodexMobile/Services/CodexSecureTransportModels.swift`, `/home/deploy/repos/remodex/phodex-bridge/src/bridge.js`, `/home/deploy/repos/remodex/CodexMobile/CodexMobile/Services/CodexService+Account.swift` | remodex 明确分离 transport trust/auth 和 Codex account auth。 |
| compatibility / schema drift | `/home/deploy/repos/remodex/CodexMobile/CodexMobile/Services/CodexService+RuntimeCompatibility.swift`, `/home/deploy/repos/remodex/CodexMobile/CodexMobile/Services/CodexService+TurnPaginationCompatibility.swift`, `/home/deploy/repos/remodex/CodexMobile/CodexMobile/Services/CodexService+ThreadForkCompatibility.swift`, `/home/deploy/repos/remodex/phodex-bridge/src/bridge.js` | remodex 的 compatibility 层说明 Codex app-server 协议仍会演进，本项目不应固化单一 schema。 |

## 验收结论

- hapi/remodex 的仓库路径、commit、关键源码路径和可复用/不可复用点已足以支撑 spec 中 required routes 与 hapi research 场景。
- 已修正 hapi 过期 provider 文件路径，当前无 unresolved critical source gap。
- 后续 verify 可抽查本文件中的路径存在性，并检查研究材料是否继续使用修正后的路径。
