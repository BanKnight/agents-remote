# research 索引

本层用于沉淀调研资料、调研过程与调研结论，服务后续决策与长期知识复用。

## 子目录

- （无）

## 文档

- [agent-access-options.md](./agent-access-options.md) — 汇总 hapi、remodex、Codex、Claude 与社区反馈对 Agent 接入路线、第一轮真实可用链路和统一协议设计的调研结论。
- [claude-cli-stream-protocol.md](./claude-cli-stream-protocol.md) — Claude CLI stdio stream-json 协议完整文档：消息类型、system.init 字段、model/permissionMode 权威来源、生命周期和集成方式。
- [claude2-replay-performance.md](./claude2-replay-performance.md) — Claude2 长会话打开慢的性能分析与验收基线：数据流成本模型、实测数字（客户端已排除，主因在传输）、实施路径与验收标准。
- [claude2-ios-keyboard-viewport.md](./claude2-ios-keyboard-viewport.md) — iOS Safari 键盘三症状（页面被推/失焦不恢复/输入框被挡）的根因：双 viewport 模型 + iOS 26 回归 bug，为什么 CSS/meta 救不了，visualViewport JS 方案方向。
- [claude-code-integration-projects.md](./claude-code-integration-projects.md) — 调研 hapi、xylocopa、claude-squad、claude-code-sdk-ts、claude-code-webui 等 5 个 Claude CLI 集成项目的 model 和 permission mode 处理策略对比。
- [xylocopa-analysis.md](./xylocopa-analysis.md) — xylocopa 项目深度分析：多实例 Claude Code 编排系统，tmux + git worktree 隔离，四层消息同步管线，模型硬编码与权限系统的完整剖析。
