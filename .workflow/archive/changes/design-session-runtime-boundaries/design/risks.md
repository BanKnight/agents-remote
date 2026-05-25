# Risks Design

## Change

- change-id：design-session-runtime-boundaries

## 主要风险

- **Terminal passthrough 泄漏到长期协议**：如果 API 暴露 tmux/xterm event、session name 或 terminal byte 细节，后续 Agent native UI 会被阻塞。
- **Agent 等待输入状态误判**：CLI output 不一定可靠表达 provider 是否等待用户输入，错误状态比缺失状态更伤害移动端判断。
- **Runtime metadata 与底层 tmux 不一致**：进程异常退出、手动 kill tmux、metadata 写入失败都会产生 stale 记录。
- **关闭语义误解**：用户可能把关闭页面、断开连接和终止 session 混为一谈，必须通过 confirm 和状态文案区分。
- **多客户端并发**：同一个 session 被多个浏览器打开时，输入控制权和 resize 可能冲突。
- **安全边界扩散**：Agent/Terminal cwd 如果绕过 Project safe path resolver，可能访问 PROJECTS_ROOT 外部。

## 跨子域权衡

- 产品语义选择平行 Agent/Terminal 入口，牺牲少量 API 重复，换取长期清晰边界。
- 数据设计选择 runtime dir metadata，牺牲重启恢复，换取第一轮简单、符合运行态边界。
- API 选择 terminal-like stream envelope 作为第一轮最小承诺，保留后续 provider-native event stream 的演进空间。
- Error handling 选择把 runtime missing 变成 ended/missing 语义，减少用户清理成本，但需要实现可靠存在性检查。

## 依赖与阻塞

- `research-agent-access-options` 已沉淀长期结论，可以支撑 provider-neutral 边界；provider-native 细节仍由后续 `implement-agent-provider-experience` 承接。
- `implement-project-model-and-safe-paths` 已完成，session cwd 必须复用其安全解析。
- `configure-personal-app-settings` 已完成，runtime dir 边界可直接使用。
- tmux/xterm/WebSocket 实现细节未存在；本 change 只定义 HOW 边界，不验证具体 terminal IO。

## 验证建议

- plan/implementation 阶段先实现 Terminal Session smoke：创建、列表、详情 stream、输入、resize、断开重连、关闭。
- 用真实 tmux session 验证：刷新后可看到当前 screen/buffer，close 会终止 tmux，手动 kill tmux 后列表清理。
- 用 Project 名称包含空格/中文等特殊字符验证：URL 使用 session id，tmux name 使用安全内部 key，UI 显示原始 Project 名。
- 用 provider 未安装或伪 provider 命令失败验证 Agent create error 不泄漏敏感命令。
- 用 WebSocket 断开验证 session 不被关闭。

## 开放问题

- 多客户端 writer/observer 策略。
- terminal scrollback 大小与 backpressure 策略。
- Agent `idle/waiting_input` 第一轮信号来源。
- Metadata 文件锁与多 api 进程支持是否需要进入第一轮。

## 后续沉淀候选

- 长期 design：session runtime concepts、transport vs runtime lifecycle、close/reconnect semantics。
- 长期 architecture：SessionRegistry、runtime metadata、tmux adapter、stream transport。
- runbook：如果实现阶段形成 tmux/runtime 排障步骤，再沉淀 session runtime runbook。
