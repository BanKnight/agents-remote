# Session runtime boundaries

本文件记录 Agent Session、Terminal Session 与 transport/runtime lifecycle 的长期设计边界。它面向后续版本复用，不复制单次 change 的过程记录。

## 背景

- 项目需要在同一个 Project 控制台中提供 Claude/Codex Agent 会话和普通 shell Terminal 会话。
- 第一轮真实链路使用 `tmux` + WebSocket 保留 CLI 能力，但产品语义、URL/API 主键和后续 provider-native 演进不能被底层 terminal passthrough 绑定。
- 用户需要理解“浏览器连接断开”“session runtime 仍存在”“关闭 session 会终止进程”之间的差异。

## 适用范围

- Project console 的 Agent Sessions 与 Terminal 入口。
- Agent/Terminal detail route、stream input/reconnect/ended/close 体验。
- Session runtime API、metadata、provider adapter seam 和后续移动端交互设计。

## 设计结论

- `AgentSession` 与 `TerminalSession` 是不同产品概念；底层即使都复用 terminal-like runtime，也必须在 UI、API、路由、metadata 和文案上保持区分。
- `transport connection` 是浏览器 WebSocket attach/reconnect 生命周期，不等同于 Agent/Terminal Session 生命周期。
- 控制面用 internal session id 定位资源；displayName 是用户可读名称，tmux name/provider-native id/socket id 只用于内部 metadata 或诊断。
- Terminal Session 表示当前活着的 Project-scoped 普通 shell；Agent Session 表示 Project-scoped Claude/Codex provider 交互式 runtime，并记录 provider。
- Close 是危险终止动作：用户确认后终止底层 runtime 并从活跃列表移除；关闭浏览器 tab 或 WebSocket 断开不终止 runtime。
- Runtime missing 是用户可理解的 ended/missing 状态：列表应自动清理 stale metadata，详情页应提示 runtime 已结束并提供返回列表路径。

## 关键规则

- Agent Session 卡片和详情可以显示 provider；Terminal Session 不显示或保存 provider 语义。
- Detail route 使用 `project + sessionId`；不要用 displayName、tmux session name、provider-native id 或 transcript path 做 URL/API 主键。
- Reconnect 成功时应恢复同一 runtime resource 的当前屏幕/缓冲内容，并允许继续输入。
- Stream UI 应同时表达 runtime status 和 transport status，避免用户把连接失败误解成任务结束。
- Close 控件必须有确认提示，文案需要明确运行进程将被终止，且不需要用户输入 session 名称做二次确认。
- Agent `idle` / waiting-input 语义只能在有可靠信号时展示；没有可靠信号时宁可保持 `running`，不要伪造等待输入状态。

## 不适用场景

- 不定义 provider-native thread/turn/event 的最终 UI 或协议字段。
- 不定义多客户端同时 attach 时的 writer/observer/抢占策略。
- 不要求服务器重启后恢复 runtime metadata 或孤儿 tmux session 列表。
- 不规定完整 terminal emulator、快捷键层、移动端输入辅助或 scrollback 策略；这些由移动端 session interaction 后续设计承接。

## 来源

- change：design-session-runtime-boundaries
- verify 证据：`.workflow/changes/design-session-runtime-boundaries/verify.md`
