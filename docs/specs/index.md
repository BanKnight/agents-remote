# specs 索引

本层用于沉淀长期 WHAT：能力规格、行为契约与可验证需求。

## 子目录

- [agent-access](./agent-access/spec.md) — 定义 Agent 接入路线调研、证据追溯、协议边界和第一轮真实可用链路的长期行为契约。
- [agent-provider-experience](./agent-provider-experience/spec.md) — 定义 Claude/Codex provider 入口、统一 Agent Session 语义、provider-aware list/detail 和 history/resume 分阶段边界。
- [e2e-quality-baseline](./e2e-quality-baseline/spec.md) — 定义登录到 Terminal Session 真实 tmux/WebSocket 输入输出的自动化 E2E baseline 要求。
- [file-browser-preview](./file-browser-preview/spec.md) — 定义 Project console Files 的只读浏览、安全路径、隐藏条目、文本预览、图片预览和错误状态要求。
- [personal-app-config](./personal-app-config/spec.md) — 定义个人私有部署配置文件、环境变量覆盖、持久化配置目录和 runtime dir 边界。
- [private-access-auth](./private-access-auth/spec.md) — 定义单密码登录、本地 token、HTTP/WebSocket 认证和个人私有部署安全范围。
- [project-console-navigation](./project-console-navigation/spec.md) — 定义 Project 控制台外壳的 Project 上下文、Agent 默认焦点、辅助入口、占位和底部输入 affordance 行为。
- [project-model](./project-model/spec.md) — 定义 `PROJECTS_ROOT` 一级目录 Project 模型、Project identity、列表摘要和创建/采用行为。
- [project-safe-paths](./project-safe-paths/spec.md) — 定义 Project 名称和 project-relative path 统一安全解析，以及 `PROJECTS_ROOT` 路径边界契约。
- [pwa-console-shell](./pwa-console-shell/spec.md) — 定义第一轮 PWA 控制台外壳的安装能力、深色移动端优先体验、响应式可用性和通知延后边界。
- [mobile-session-interaction](./mobile-session-interaction/spec.md) — 定义手机竖屏 Session detail 的终端输出、底部输入面板、多行显式发送、默认快捷键和不可发送状态要求。
- [service-access-boundary](./service-access-boundary/spec.md) — 定义 `web`/`api` 服务拆分、统一同域入口、`/api` HTTP/WebSocket 路径和部署层职责边界。
- [session-runtime](./session-runtime/spec.md) — 定义 Agent/Terminal Session 的身份分层、runtime metadata、tmux resource、reconnect、close 和 Project-scoped shell/provider 会话行为契约。
- [workspace-foundation](./workspace-foundation/spec.md) — 定义第一轮 monorepo 工作区、Bun 命令面、前端基础、共享类型边界和基础质量入口。

## 文档

- [workflow-skills-overview.md](./workflow-skills-overview.md) — 汇总当前规划中的阶段型工作流技能与不分阶段的通用技能。
