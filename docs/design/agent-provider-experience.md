# Agent provider experience design

本文件记录 Agent provider 体验的长期 design 内容。它面向后续版本复用，不复制单次 change 的过程记录。

## 背景

- Project Console 需要把 Claude 与 Codex 明确表达为不同 Agent provider，同时不能把它们拆成与 Agent Session 平级的独立 runtime 概念。
- 第一轮真实可用链路通过 CLI/tmux passthrough 保留 provider 原生命令能力，但 provider command、history、resume 和 native capability 差异必须被 Agent Runtime/provider adapter 吸收。
- 后续 history/resume 是重要方向，但需要 provider-specific 证据和 PoC，不能在当前 active Agent Sessions list 中伪造历史能力。

## 适用范围

- Project Console 中的 Claude/Codex Agent create entry、Agent list/detail provider display、session status 与 close/reconnect 语义。
- AgentRuntime/provider profile、后续 ProviderAdapter、history discovery/resume 和 provider-native event/capability extension。
- 不适用于 Terminal Session；Terminal Session 是普通 Project-scoped shell，不保存 provider 语义。

## 设计结论

- 公开控制面继续以 `/api/projects/:projectName/agent-sessions` 表达 Agent Session resource；`provider` 字段区分 Claude/Codex，但不新增 provider resource 作为当前 create/list/detail/close 前置。
- provider command 差异由 API 内部 AgentRuntime/provider profile 处理；Project console、SessionRegistry 以外的通用控制面不需要知道 provider CLI command。
- provider profile 是实现层 seam，不进入 shared contract；当前 profile 可包含 provider id、label、默认 command、display name prefix 和 staged capability 标记。
- active Agent Session list 只展示当前仍存在的运行实例；provider history summary 应作为后续 ProviderAdapter capability 单独设计。
- provider-native id、history id、thread id、transcript path 和 resume key 只进入 adapter/internal metadata，不作为本项目 URL/API 主键。

## 关键规则

- Agent Session create/list/detail/close HTTP 路径、DTO、status 和 WebSocket stream envelope 应保持 provider-neutral；新增 provider-native event stream 必须作为兼容扩展新增。
- provider unavailable、CLI missing、not logged in 或启动失败应映射为用户可理解的 provider/runtime error，不暴露 token、凭证、完整 shell command 或 provider-native metadata。
- UI 可以显示 provider label、displayName、status、internal session id 和 transport status，但不能要求用户理解 tmux session name 或 provider-native id。
- 如果后续只有一个 provider 支持 history/resume，UI 必须明确区分 supported、unsupported、unavailable 和 failure，不能暗示另一 provider 已有同等能力。
- provider-native slash commands、skills/plugins discovery、approval/tool events 属于 optional capability extension；缺少 discovery API 时必须保留 raw input/CLI passthrough。

## 不适用场景

- 不定义 Claude/Codex history summary 的最终字段、分页、排序或恢复 payload。
- 不定义 Codex app-server thread/turn/event adapter 或 Claude Code remote-control / Claude API / Agent SDK adapter 的最终取舍。
- 不管理 provider account auth、CLI 安装、登录状态、模型配置或 availability probe UI。
- 不把 Terminal Session 扩展为 provider-aware runtime。

## 来源

- change：implement-agent-provider-experience
- verify 证据：`.workflow/changes/implement-agent-provider-experience/verify.md`
- related spec：`docs/specs/agent-provider-experience/spec.md`
- related architecture：`docs/architecture/agent-runtime.md`
