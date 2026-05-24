# Risks Design

## Change

- change-id：research-agent-access-options

## 主要风险

- 将 WebSocket transport 误解为 Codex 协议本身，导致后续设计混淆 transport 与 business method。
- 为兼容官方 app 过早牺牲自有 Web/PWA 控制面能力。
- 原生 Agent UI 过早替代 CLI passthrough，导致 slash commands、skills、plugins、autocomplete 或交互提示遗漏。
- 直接扩展 Codex app-server method set，导致和官方协议/schema drift 冲突。
- 社区弱信号被误当作官方承诺。

## 跨子域权衡

- V1 选择 terminal passthrough：牺牲结构化 UI，换取真实 CLI 能力保真和快速端到端可用。
- Final 选择 gateway + provider adapter：增加一层协议转换，但换取认证、路径安全、files/git 扩展和 Claude/Codex 统一。
- 官方 app 互通暂缓：降低长期兼容复杂度，优先保证自有控制台完整性。

## 依赖与阻塞

- 是否存在稳定 provider discovery API 会影响 slash/skills/plugins 原生 UI 范围。
- 官方 Codex app 是否支持 files/git/project 能力仍未确认；确认前不纳入目标。
- Claude Code remote-control 是否能嵌入自有 Web UI 仍未确认；不阻塞 V1。

## 验证建议

- V1 验证：通过真实 CLI 在 Web terminal 中执行 slash command、使用 skill/plugin、触发交互提示，确认 passthrough 不破坏 provider 能力。
- Codex PoC：验证 `codex app-server --listen ws://...`、`initialize`、`thread/start`、`thread/list`、`turn/start` 和 event stream。
- Capability PoC：在 gateway 层模拟 `files.list` / `git.diffFile`，确认不需要修改 Codex app-server。
- Discovery PoC：分别检查 Codex/Claude 是否能列出 slash commands、skills、plugins；不能列出时验证 raw input fallback。

## 开放问题

- 多客户端同时连接同一 session 时，V1 terminal passthrough 是否允许共享输入，还是只允许一个 writer？
- Final 原生 UI 是否需要保留 per-provider terminal fallback？
- 官方 app 互通未来是否作为独立 version，而不是当前主线？

## 后续沉淀候选

- V1 terminal passthrough risk model。
- Provider capability discovery and fallback policy。
- Official app interoperability decision record。
