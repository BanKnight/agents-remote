# Spec coverage matrix

本文件将 `specs/agent-access-research/spec.md` 的 requirement/scenario 映射到已有研究材料、design 约束和后续 verify 需要关注的开放项。

## 覆盖状态

- 覆盖日期：2026-05-24
- change-id：research-agent-access-options
- 覆盖结论：所有 requirement/scenario 均已映射到研究材料或明确待验证项；当前无未映射 requirement。

## Matrix

| Requirement | Scenario | 研究材料覆盖 | Design 覆盖 | 待验证项 |
|---|---|---|---|---|
| Research scope includes all required access routes | Required routes are covered | `docs/research/agent-access-options.md` 覆盖 hapi、remodex、Codex 官方与社区反馈、Claude 相关能力，并在“路线比较”中对 `CLI/tmux/xterm`、hapi、Codex app-server/remodex、Claude Code remote-control、Claude API/Agent SDK 做横向比较。 | `design/overview.md` 明确 hapi、remodex、Codex 官方能力、Claude 相关能力和社区弱信号的证据等级；`design/architecture.md` 的技术选型表给出各路线当前判断。 | verify 时检查路线比较是否仍列出来源、当前可用性、关键能力、主要限制和对本项目影响。 |
| Research scope includes all required access routes | Route is unavailable or undocumented | `docs/research/agent-access-options.md` 将 Claude Code remote-control 稳定可复用协议、Codex app-server 稳定/experimental 边界、官方 Codex app Git/files/project 能力等列为开放问题。 | `design/overview.md`、`design/architecture.md`、`design/api.md`、`design/risks.md` 均把 Claude remote-control、Codex app-server 稳定性、官方 app 互通作为开放问题或风险。 | verify 时确认所有未知项没有被写成已确定能力；未确认路线应保留在开放问题或验证建议中。 |
| hapi research identifies reusable behavior | hapi source is inspected | `docs/research/agent-access-options.md` 记录 hapi 仓库 URL、本地路径 `/home/deploy/repos/hapi`、commit `0fa21a121a9307f42595e6e9be01aec7f99cd7dc`，并列出 sync、routes、schema、store、session factory、socket、terminal、SSE/Web UI 映射等源码路径。 | `design/overview.md` 规定源码研究基于 `~/repos` 本地 clone 并记录 URL 与 commit；`design/architecture.md` 把 hapi pattern 定位为 dual-ID、sync engine、REST+SSE/message persistence 参考。 | verify 时抽查 hapi 引用路径是否存在；若路径缺失，应作为 evidence gap 处理。 |
| hapi research identifies reusable behavior | hapi behavior is summarized | `docs/research/agent-access-options.md` 的 hapi 章节区分本地可恢复会话列表、恢复与 resume、数据与 ID 模型、provider 边界、Terminal/PTY 路径、CLI 到 React/Web UI 映射、可复用点与不宜复用假设。 | `design/architecture.md` 将 hapi 结论转化为 stable internal id、provider-native metadata、sync/runtime 层、REST/SSE 与 socket/stream 分离等后续约束。 | verify 时确认 hapi 章节没有把 hapi provider metadata/fallback heuristics 直接作为本项目长期协议。 |
| Official protocol constraints are captured | Official capability affects API shape | `docs/research/agent-access-options.md` 记录 Codex app-server JSON-RPC-ish protocol over stdio/unix/ws、remoteControl status、thread/turn/event、Claude Code remote-control、Claude API/SDK 能力分层。 | `design/api.md` 要求 V1/Final 分层、provider-native id 进入 metadata/adapters、tool/permission/approval events 归一化到 AgentSession event stream；`design/architecture.md` 要求 transportSession/conversationThread/turn-run 分离。 | verify 时确认后续 handoff 明确传递给 `design-session-runtime-boundaries` 和 `implement-agent-provider-experience`。 |
| Official protocol constraints are captured | Official capability conflicts with CLI/tmux route | `docs/research/agent-access-options.md` 明确 V1 terminal passthrough 只是第一轮保真方案，最终版再讨论 provider-native thread/turn/event；不应固化 tmux session name、xterm event name、Codex method names、Claude transcript path 或 provider-native id 作为 URL 主键。 | `design/api.md` 明确 V1 以 TerminalSession/stream 为核心，Final 才使用 AgentSession/conversationThread/turn/event/capability；`design/risks.md` 将 terminal passthrough 被误解为长期协议列为风险。 | verify 时检查 verification checklist 覆盖“不固化 terminal/provider-native 细节”。 |
| Routes are compared against product concerns | Comparison matrix is reviewed | `docs/research/agent-access-options.md` 的“路线比较”覆盖优势、风险和初步定位；“总体摘要”覆盖 local-first、multi-provider、remote-control、API/SDK、统一协议、官方 app 互通、V1/Final、skills/plugins 保真等产品关注点。 | `design/overview.md` 和 `design/architecture.md` 将路线比较落实到证据等级、provider-neutral session 语义、adapter seam、capability negotiation、V1/Final 边界。 | verify 时确认比较维度显式覆盖交互式体验、历史恢复、React UI 化、远程控制协议、实现复杂度和长期演进；如缺少维度，应补到研究材料或 verify gap。 |
| Routes are compared against product concerns | A route is recommended or rejected | `docs/research/agent-access-options.md` 给出初步定位：CLI/tmux/xterm 是第一轮兼容层；hapi 是架构参考；Codex app-server/remodex 是 Codex provider 和统一协议重要参考；Claude Code remote-control 是候选但不做主协议假设；Claude API/Agent SDK 是长期候选；官方 app 互通降级为开放问题。 | `design/architecture.md` 的技术选型/方案取舍表和演进策略将上述判断转化为后续选择约束；`design/api.md` 明确不直接暴露/扩展 Codex app-server method set。 | verify 时确认每个推荐/暂缓/拒绝判断均能追溯到产品关注点，而不是只写“实现方便”。 |
| Research output drives downstream workflow | Downstream design starts | `docs/research/agent-access-options.md` 在给后续 changes 的部分列出给 `design-session-runtime-boundaries`、`implement-agent-provider-experience`、`setup-e2e-quality-baseline` 的输入。 | `design/overview.md` 明确本 change 输出 provider-neutral session、adapter seam、capability negotiation、transport/thread/turn 分层；`design/architecture.md` 和 `design/api.md` 给出后续 Runtime/API 边界。 | 当前仍需执行任务 2.4，产出 `artifacts/downstream-handoff.md`，使下游 handoff 更可验收。 |
| Research output drives downstream workflow | First iteration remains CLI/tmux compatible | `docs/research/agent-access-options.md` 明确 V1 `web -> api -> tmux/xterm/WebSocket -> Claude CLI / Codex CLI`，并列出 slash commands / skills / plugins 保真策略；同时列出不应固化的 terminal/provider-native 细节。 | `design/api.md` 明确 V1 TerminalSession/stream 与 Final provider-native API 分离；`design/risks.md` 给出 V1 验证建议。 | 当前仍需执行任务 2.3，产出 `artifacts/verification-checklist.md`，覆盖 CLI passthrough 保真与 Final 不固化约束。 |

## 未映射项

- （无）

## 后续任务输入

- 任务 2.1 应重点抽查并补齐 hapi/remodex 源码引用可追溯性。
- 任务 2.2 应重点检查 Claude/Codex 官方资料和社区弱信号是否保持证据等级分离。
- 任务 2.3 应将本 matrix 中的待验证项转成 verify checklist。
- 任务 2.4 应将下游 design/runtime/API/E2E 可消费内容单独整理成 handoff。
