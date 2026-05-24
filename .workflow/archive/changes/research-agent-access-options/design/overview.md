# Design Overview

本文件汇总本 change 的设计范围、子域选择和整体设计结论。

## Change

- change-id：research-agent-access-options
- 所属 version：v0.1-foundation-and-agent-research

## 输入依据

- intents：`.workflow/changes/research-agent-access-options/intents.md`
- specs：`.workflow/changes/research-agent-access-options/specs/agent-access-research/spec.md`
- 相关长期 docs：
  - `docs/project.md`
  - `docs/research/agent-access-options.md`

## 设计范围

### 本次覆盖

- 将 Agent 接入调研设计为可复用研究流程，而不是直接决定最终架构。
- 明确 hapi、remodex、Codex 官方能力、Claude 相关能力和社区弱信号在后续设计中的证据等级。
- 为后续 Agent Runtime/API 设计输出约束：provider-neutral session 语义、adapter seam、capability negotiation、transport/thread/turn 分层。
- 明确哪些内容必须在 `plan-change` 中继续转成可执行研究/验证任务。

### 本次不覆盖

- 不实现 Agent Runtime、Codex adapter、Claude adapter 或 terminal bridge。
- 不冻结最终统一协议字段。
- 不把研究结论直接沉淀到长期 architecture/design/specs；长期沉淀需等 verify 后由 `distill-change` 完成。
- 不把社区反馈作为架构决策的唯一依据。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | 本 change 是接入路线研究，不改变用户路径或产品信息架构。 |
| ui-ux | 否 | 不设计页面交互；移动端/详情页体验由后续 session/UI changes 处理。 |
| frontend | 否 | 不引入前端模块、组件或状态管理设计。 |
| architecture | 是 | 需要定义研究输出如何约束 Agent Runtime、provider adapter、session/thread/turn 分层。 |
| api | 是 | 需要说明后续控制面 API 不能泄漏 provider/tmux 细节，并应支持 capability-based 扩展。 |
| data | 否 | 只提出 dual-ID 与 metadata 原则，不设计具体数据表或迁移。 |
| business-rules | 否 | 不涉及业务状态机最终规则；后续 Session Runtime change 再定义。 |
| error-handling | 否 | 研究阶段只记录风险，具体错误码/重试策略由后续 runtime/API design 定义。 |
| risks | 是 | 需要集中收口官方协议演进、社区弱信号、Claude remote-control 未确认、schema drift 等跨域风险。 |

## 总体设计结论

- 研究输出已经沉淀到 `docs/research/agent-access-options.md`，后续 design/plan 应引用该文档，而不是重复拉取原始源码/社区材料。
- local-first 参考实现优先看 remodex；hapi 优先作为多 provider resume/message/UI 映射参考。
- 本项目可探索 Codex-style 统一协议，但应先以 provider-neutral `AgentSession`、`conversationThread`、`turn/run`、`transportSession`、capability negotiation 建模。
- 第一轮可以兼容 `CLI/tmux/xterm`，并以真实 CLI passthrough 保证 slash commands、skills、plugins、autocomplete 和交互提示不被早期原生 UI 漏掉；但 API/Runtime 命名和 URL 主键不能固化 terminal 或 provider-native 细节。
- 文件/Git 等能力可扩展到协议，但第一轮更适合作为 Project API；未来 Agent 主动调用时再通过 `files.*` / `git.*` capability 和 tool/permission event 接入。
- 官方移动端 app 互通暂不作为目标；除非确认官方 app 支持 Git/files/project 或正式 extension mechanism，否则本项目以自有 Web/PWA 控制面为主。

## 关键决策

- 研究阶段产物进入 `docs/research/`，用于后续 workflow 消费；不直接写长期 architecture/specs。
- 源码研究统一基于 `~/repos` 本地 clone，并记录 repo URL 与 commit。
- 社区反馈统一用 Tavily，并标注为弱证据。
- 后续协议设计采用 capability-based 分层，而不是复制 Codex app-server 或 hapi 的内部 API。
- Codex app-server 应被准确理解为 JSON-RPC-ish protocol over `stdio://` / `unix://` / `ws://`，其中 WebSocket 是 remote/control transport，不是协议语义本身。
- V1 保真优先：真实 CLI passthrough 是确保 slash/skills/plugins 不遗漏的主要策略。

## 开放问题

- Claude Code remote-control 是否有稳定、可被本项目复用的自托管协议仍需进一步验证。
- Codex app-server 哪些接口已稳定、哪些仍属 experimental，需要后续 PoC/版本跟踪。
- remodex 的 relay/E2EE/pairing 是否适合本项目第一轮个人私有部署，还是只作为长期参考。
- 多客户端 attach/resume 同一 AgentSession 的并发规则尚未定义。

## 后续沉淀候选

- Agent Runtime / Provider Adapter / Unified Session Protocol 架构候选。
- AgentSession / TerminalSession / transportSession / conversationThread / turn-run 概念模型。
- Provider-neutral capability 扩展模型。
