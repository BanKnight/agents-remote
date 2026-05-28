# design 索引

本层用于沉淀工作流、技能体系与设计模型等长期设计文档。

## 子目录

- [prototype](./prototype/index.md) — 保存导航结构 HTML 原型和浏览器截图，用于对齐首页一级导航、Project 二级导航、实例详情页与桌面/移动端布局。

## 文档

- [agent-provider-experience.md](./agent-provider-experience.md) — 定义 Claude/Codex provider 可见体验、AgentRuntime/provider profile 边界、Agent workspace provider create/current instance 边界和 history/resume 分阶段设计。
- [agent-session-model.md](./agent-session-model.md) — 定义 AgentSession、TerminalSession、transportSession、conversationThread 与 turn/run 的长期设计边界。
- [console-shell.md](./console-shell.md) — 定义登录后 Project Console Shell 的信息架构、Project 直接二级 workspace、移动端返回层级、输入职责边界、响应式布局和第一轮 PWA 外壳设计。
- [file-browser-preview.md](./file-browser-preview.md) — 定义 Project console Files 的只读浏览、desktop list+preview、移动端 direct-secondary/list 与 deep preview detail 分层、前端状态边界和只读交互规则。
- [frontend-stack.md](./frontend-stack.md) — 定义 `web` 前端栈、路由/服务端状态/本地 UI 状态职责边界和 `/api` 调用接入规则。
- [frontend-ui-architecture.md](./frontend-ui-architecture.md) — 定义 UI/UX prototype alignment 的来源优先级、三层页面模型、Home/Project/Session/resource workspace 边界、移动端返回规则和 runtime surface roles。
- [git-diff-viewer.md](./git-diff-viewer.md) — 定义 Project console Git diff viewer 的只读 changed-file list、desktop unified diff panel、移动端 direct-secondary/list 与 deep diff detail 分层、状态处理和只读交互规则。
- [mobile-session-interaction.md](./mobile-session-interaction.md) — 定义 Agent/Terminal Session detail 的移动端工作台布局、非遮挡输入区、quick key 直发、真实能力边界和恢复状态规则。
- [session-runtime-boundaries.md](./session-runtime-boundaries.md) — 定义 Agent Session、Terminal Session、transport connection 和 runtime lifecycle 的长期设计边界。
- [工作流和技能的大纲设计.md](./工作流和技能的大纲设计.md) — 定义工作流阶段链路、技能职责、`.workflow/versions` 运行态结构、change context 看板上下文与长期沉淀边界。
