# Evidence grading

本文件收口任务 2.2：Claude/Codex 官方资料、源码证据与社区弱信号在 `research-agent-access-options` 中的证据等级和使用边界。

## 证据等级规则

| 等级 | 来源 | 可用于 | 不可用于 |
|---|---|---|---|
| 源码证据 | 已 clone 到 `~/repos` 的 hapi/remodex 本地源码与 commit | 支撑参考实现的实际行为、源码路径、可复用/不可复用点 | 直接证明官方协议稳定承诺；替代本项目 PoC |
| 官方资料 | Claude/Codex 官方公开能力、CLI/API/SDK/app-server 文档或行为描述 | 确认可公开使用的能力边界、协议事实、配置/transport 语义、稳定性信号 | 假设未公开 extension、未确认 UI 互通或未验证自托管协议 |
| 社区弱信号 | Tavily 汇总的 Reddit、GitHub issues/discussions、HN、评测文章、第三方项目反馈 | 识别风险热点、开发者痛点、验证 checklist 关注点 | 单独决定架构路线；把传闻写成官方承诺；替代官方资料或源码证据 |

## Claude evidence grading

| 主题 | 当前证据等级 | 当前结论 | 必须保持的边界 |
|---|---|---|---|
| Claude Code remote-control / `claude --remote` | 官方资料 + 受限研究结论 | 存在官方远程控制产品路径，可说明 Claude Code 支持远程 UI 控制本地 runtime 的方向。 | 不能直接假设有稳定、可嵌入本项目 Web/PWA 的自托管协议；后续应作为 Claude Code adapter 候选验证。 |
| Claude Code CLI/headless/session resume | 官方资料 + 待实测 | 可作为 V1 CLI passthrough 的 provider runtime；session resume/headless JSON streaming 的字段和生命周期仍需用当前 CLI 或官方 docs 验证。 | 不把 Claude Code transcript/session path 当作本项目 canonical API 或 URL 主键。 |
| Claude API / Anthropic SDK / Agent SDK | 官方资料 | 更适合 app-owned Claude-native runtime、tool/event/stream 和未来原生 UI。 | 不等同于恢复本机 Claude Code CLI 会话；不能替代 Claude Code adapter 的历史会话读取设计。 |
| Claude slash/skills/plugins discovery | 未确认 | 原生 UI 是否可枚举这些能力仍是开放问题。 | 若 provider 不暴露 discovery API，必须保留 raw input 或 terminal fallback。 |

## Codex evidence grading

| 主题 | 当前证据等级 | 当前结论 | 必须保持的边界 |
|---|---|---|---|
| Codex app-server transport | 官方资料 + remodex 源码证据 | app-server 是 JSON-RPC-ish 业务协议，transport 可为 `stdio://`、`unix://`、`ws://IP:PORT`；WebSocket 是 transport，不是协议语义本身。 | 不把 WebSocket 等同为 Codex protocol；不把 Codex method set 直接暴露为本项目长期前端协议。 |
| Codex thread/turn/event | remodex 源码证据 + 官方资料 | `thread.*` / `turn.*` / event stream 可作为 Codex provider adapter 和统一协议参考。 | 需隔离 schema drift；不固化单一 Codex app-server schema。 |
| Codex remote-control enrollment | 官方资料 + remodex 源码证据 | remote-control 状态更接近 app-server environment/process 级别，而非单个 thread 级别。 | 不把官方 remote-control enrollment 直接映射成本项目 AgentSession 生命周期。 |
| 官方 Codex app 互通 | 官方资料不足 + 社区弱信号 | 当前不作为目标，仅保留开放问题。 | 除非确认官方 app 支持 Git/files/project 或正式 extension mechanism，否则不为官方 app 互通牺牲自有 Web/PWA 控制面。 |
| Codex skills/plugins/slash visibility | 社区弱信号 + 未确认 | 社区反馈可作为 UI 覆盖风险；V1 用 CLI passthrough 保真。 | 不能把第三方 UI 的可见性问题写成 Codex protocol 不可行结论。 |

## Community weak-signal usage

社区反馈当前只用于以下场景：

- 将 sandbox/auth/headless UX/schema drift/thread loss/telemetry noise 写入风险热点。
- 为 verify checklist 提供 PoC 和回归验证关注点。
- 解释为什么 capability negotiation、adapter seam、fallback 和不直接暴露官方 method set 是必要约束。

社区反馈不得用于：

- 宣称官方未来会提供某能力。
- 宣称某协议已经稳定或不可行。
- 覆盖源码和官方资料给出的事实。
- 让本项目提前放弃自有 Web/PWA 控制面主线。

## 未确认能力清单

| 能力 | 当前状态 | 后续处理 |
|---|---|---|
| Claude Code remote-control 是否可作为自托管 Web UI 协议复用 | 未确认 | 后续 `design-session-runtime-boundaries` / Claude adapter PoC 再验证。 |
| Codex app-server 哪些 method/schema 是稳定承诺 | 未确认 | 后续 Codex PoC 和版本跟踪验证。 |
| Codex/Claude 是否可枚举 slash commands / skills / plugins | 未确认 | 原生 UI 设计前验证；V1 保留 CLI passthrough。 |
| 官方 Codex app 是否支持 Git/files/project 或 extension mechanism | 未确认 | 当前不纳入目标；未来可作为独立 version/ADR。 |
| 多客户端 attach/resume 规则 | 未定义 | 后续 Session Runtime design 定义。 |

## 验收结论

- Claude 相关能力、Codex app-server/remote-control、官方 app 互通边界和社区反馈均已标明证据等级。
- 社区反馈仅作为弱证据使用，没有被写成官方承诺。
- 未确认能力已进入开放问题或后续验证建议。
