# API Design

## Change

- change-id：research-agent-access-options

## 接口范围

本文件不定义最终接口字段，只记录后续 Agent Runtime/API 设计必须遵守的协议边界。

后续 API 应覆盖两类阶段：

- V1：terminal passthrough，用于真实 CLI 输入输出、slash commands、skills/plugins 原样保真。
- Final：provider-native AgentSession API，用于 thread/turn/event/capability、文件/Git/Terminal 扩展和原生 UI。

## 请求 / 响应

V1 API 应以 TerminalSession/stream 为核心，不把 Codex thread 或 Claude transcript 暴露为 URL 主键：

```text
project + session id -> TerminalSession stream
```

Final API 可使用 provider-neutral 概念：

```text
AgentSession
conversationThread
turn/run
event stream
capability snapshot
provider metadata
```

provider-native id 只进入 metadata/adapters。

## 协议与兼容性

- Codex app-server 是 JSON-RPC-ish message protocol，transport 可为 `stdio://`、`unix://` 或 `ws://IP:PORT`。
- 本项目不应直接把 Codex app-server 原始 method set 暴露为长期前端协议。
- files/git/project/terminal 是本项目 gateway capability，不应假设官方 Codex app 或 Claude remote-control 可以看到这些扩展。
- 如果 provider 暴露 slash/skills/plugins discovery API，可以原生展示；否则必须保留 raw input 或 terminal fallback。

## 鉴权与权限

- V1 的 HTTP/WebSocket 访问必须走本项目 token 保护。
- provider account auth 与本项目 transport auth 分离。
- tool/permission/approval events 最终应归一化进入 AgentSession event stream。

## 错误语义

后续 API design 需要覆盖：

- provider app-server/CLI 不可用。
- provider schema/method 不兼容。
- WebSocket/stream 断开。
- terminal session 已结束。
- provider capability 不可枚举。
- files/git capability 不对官方 app 可见。

## 关键决策

- V1 优先 terminal passthrough，保证 CLI 能力不遗漏。
- Final 再设计 provider-native AgentSession API。
- 官方 app 互通不是当前接口目标；除非未来确认官方 app 能覆盖本项目 Git/files/project 控制台能力。
- 不直接扩展 Codex app-server；在 agents-remote gateway 层扩展 `files.*`、`git.*`、`terminal.*` 等 capability。

## 风险与权衡

- 直接暴露 Codex app-server 给前端会削弱本项目认证、路径安全和 provider-neutral 抽象。
- 只做 terminal passthrough 会限制原生 UI，但适合作为第一轮保真方案。
- 原生 UI 如果缺少 provider discovery API，可能漏掉 slash/skills/plugins；必须设计 fallback。

## 开放问题

- Codex/Claude 是否提供稳定的 slash/skills/plugins discovery API？
- Codex app-server 的 remote-control enrollment 是否适合服务端多 project/multi-instance 场景？
- 官方 Codex mobile app 是否有足够 files/git/project UI；没有则不考虑官方 app 互通。

## 后续沉淀候选

- AgentSession API boundary。
- TerminalSession vs AgentSession API boundary。
- Capability extension model for files/git/terminal/tool approvals。
