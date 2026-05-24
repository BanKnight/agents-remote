# Verification checklist

本文件为 `research-agent-access-options` 的 verify 阶段准备输入，覆盖 spec scenarios、V1 terminal passthrough 保真项、Final provider-native/capability-based control plane 边界和当前开放问题。

## Spec scenario checklist

| Spec scenario | Verify check | 通过标准 | 证据位置 |
|---|---|---|---|
| Required routes are covered | 检查研究材料是否覆盖 `CLI/tmux`、hapi、Claude 相关官方能力、Codex 官方远程协议/remodex。 | 每条路线都有资料来源、当前可用性判断、关键能力、主要限制、对本项目影响。 | `docs/research/agent-access-options.md`；`artifacts/spec-coverage-matrix.md` |
| Route is unavailable or undocumented | 检查未知路线是否显式标记。 | Claude remote-control 自托管协议、Codex schema 稳定性、官方 app 互通等未知项保留为开放问题/验证建议。 | `docs/research/agent-access-options.md`；`artifacts/evidence-grading.md` |
| hapi source is inspected | 抽查 hapi 本地路径、commit 和源码路径。 | `/home/deploy/repos/hapi` 存在，commit 与记录一致；source evidence 中关键路径存在或缺口已记录。 | `artifacts/source-evidence.md` |
| hapi behavior is summarized | 检查 hapi 可复用/不可复用点是否区分。 | dual-ID、sync/runtime、REST+SSE/message persistence、terminal socket 分离被列为参考；metadata/fallback heuristics 不直接复用。 | `docs/research/agent-access-options.md`；`artifacts/source-evidence.md` |
| Official capability affects API shape | 检查官方能力是否转化为后续 API/Runtime 约束。 | provider-native id 只进 metadata/adapters；transport/thread/turn 分离；tool/permission events 后续归一化。 | `design/api.md`；`design/architecture.md` |
| Official capability conflicts with CLI/tmux route | 检查 V1/Final 是否明确分层。 | V1 是 TerminalSession/stream passthrough；Final 才是 provider-native AgentSession API；不固化 terminal/provider-native 细节。 | `design/api.md`；本文件 V1/Final checklist |
| Comparison matrix is reviewed | 检查路线比较是否覆盖产品关注点。 | 比较至少覆盖交互式体验、历史会话恢复、React UI 化、远程控制协议、实现复杂度、长期演进。 | `docs/research/agent-access-options.md`；`artifacts/spec-coverage-matrix.md` |
| A route is recommended or rejected | 检查路线定位是否有依据。 | CLI/tmux、hapi、Codex/remodex、Claude Code、Claude API/SDK、官方 app 互通的定位能追溯到产品关注点与风险。 | `docs/research/agent-access-options.md`；`design/architecture.md` |
| Downstream design starts | 检查下游 handoff 是否存在且可消费。 | `artifacts/downstream-handoff.md` 为三个后续 changes 列出必须消费结论、禁止固化边界、开放问题、验证动作。 | `artifacts/downstream-handoff.md` |
| First iteration remains CLI/tmux compatible | 检查 V1 保真项与 Final 不固化项。 | V1 验证 checklist 覆盖 slash/skills/plugins/autocomplete/交互提示；Final 不固化列表覆盖 tmux/xterm/Codex/Claude provider-native 细节。 | 本文件 |

## V1 terminal passthrough verification

V1 目标是通过真实 CLI passthrough 保真，而不是过早做原生 Agent UI。

### Must preserve

- 真实 Claude CLI / Codex CLI 输出应原样进入 Web terminal 视图。
- 普通文本输入应可靠转发给 CLI。
- 快捷键输入应可靠转发给 CLI，至少包括 Ctrl+C、Esc、Tab、方向键。
- terminal resize 应不会破坏 CLI 交互。
- WebSocket 断开后，如果底层 tmux/CLI 仍存在，应能重新连接到当前屏幕/缓冲内容。
- 关闭 Agent/Terminal Session 应真正终止底层 tmux/CLI 进程。

### Provider feature fidelity

V1 验证应至少覆盖：

- slash command 可以在真实 CLI 中输入和执行。
- provider skills/plugins/tooling 在 CLI 中不因 Web passthrough 被屏蔽。
- autocomplete 或交互提示在 terminal passthrough 中不被本项目 UI 误截获。
- provider permission/tool approval 提示至少能作为 CLI 输出被观察和响应。
- 如果 provider 需要 raw input，本项目不应强制改写成结构化 API。

### V1 must not imply

- V1 terminal stream 不是长期 AgentSession protocol。
- tmux session name 不是用户可见 session id。
- xterm event name 不是控制面 API。
- CLI output parsing 不是 provider-native event schema。
- V1 不保证官方 app 互通。

## Final provider-native boundary checklist

Final 目标是 provider-native + capability-based control plane，但字段和协议在当前 change 不冻结。

### Should preserve as concepts

- `AgentSession`：控制面长期语义，不等同于 tmux、Codex thread、Claude transcript 或 socket。
- `conversationThread`：逻辑历史与恢复边界。
- `turn/run`：一次交互执行边界。
- `transportSession`：连接、relay、reconnect 边界。
- `providerMetadata`：provider-native ids 和特有字段只放在 adapter/internal metadata。
- `capability snapshot`：用于表达 provider/runtime 当前支持的功能。

### Should remain adapter-owned

- Codex app-server raw method names。
- Claude Code transcript/session path。
- Provider-specific thread/session ids。
- Provider-specific auth/account state。
- Provider-specific slash/skills/plugins discovery 或缺失情况。
- Schema compatibility 和 method drift 处理。

### Capability extension boundaries

- `terminal.*`、`files.*`、`git.*`、`approvals.*`、`telemetry.*`、`artifacts.*` 是 gateway capability，不应成为 core AgentSession 必选字段。
- 第一轮 files/git 应优先作为 Project API，由 `PROJECTS_ROOT` 安全解析保护。
- 未来 Agent 主动调用 files/git 时，应通过 tool/permission event envelope 接入。
- 不直接扩展 Codex app-server method set；本项目在 gateway/provider adapter 层扩展。

## Non-freeze list

当前 change 不应冻结以下内容：

- 最终统一协议字段名。
- AgentSession 是否对外暴露 thread/turn 词汇。
- event store / replay cursor 的具体存储方案。
- Codex adapter 是否先做 PoC 还是直接进入正式 API。
- Claude Code adapter 与 Claude API/SDK adapter 的最终取舍。
- 多客户端 attach/resume 的 writer/observer/抢占规则。
- 官方 app 互通是否进入独立 version。

## Open verification questions

- Claude Code remote-control 是否有稳定、可自托管 UI 复用的协议？
- Codex app-server 当前哪些方法/字段是稳定承诺，哪些仍是 experimental？
- Codex/Claude 是否提供 slash commands / skills / plugins discovery API？
- 官方 Codex app 是否支持 Git/files/project 或 extension mechanism？
- remodex relay/E2EE/pairing 是否适合个人私有同域 PWA，还是只作为长期参考？
- 多客户端同时 attach/resume 同一 AgentSession 时，是否允许共享输入、单 writer、多 observer 或抢占？

## Critical gap status

- 当前无 unresolved critical gap。
- `artifacts/downstream-handoff.md` 已生成，并已覆盖 `design-session-runtime-boundaries`、`implement-agent-provider-experience`、`setup-e2e-quality-baseline` 的必须消费结论、禁止固化边界、开放问题和建议验证动作。
- `plan.md`、`tasks.md`、spec、design、`docs/research/agent-access-options.md` 与 artifacts 已完成一致性检查；verify 阶段可按本 checklist 逐项验收。
