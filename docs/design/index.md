# design 索引

本层用于沉淀工作流、技能体系与设计模型等长期设计文档。

## 子目录

- [prototype](./prototype/index.md) — 保存导航结构 HTML 原型和浏览器截图（**历史归档，不再维护**；旧三层单列模型，已被 app 三栏工作台 + [`workbench-redesign.md`](./workbench-redesign.md) 取代，token 已由 [`DESIGN.md`](./DESIGN.md) 接管）。

## 文档

- [DESIGN.md](./DESIGN.md) — agents-remote 的设计系统权威源（Google DESIGN.md 格式）：以 YAML tokens + 8 section prose 统一深色 Server Agent Console 的颜色/字体/圆角/间距/组件，作为人 + AI 编码 agent 持续对齐样式细节的唯一标尺。
- [activity-bar-redesign.md](./activity-bar-redesign.md) — VSCode 式全局活动栏（一级导航 项目/文件/设置）重设计：桌面竖行工具条+左/中栏、移动底部胶囊，两端 IA 一一对应；演进自 workbench-views.md，决策全部敲定（§6 17 条 + §2 决策日志），分阶段实现中。
- [activity-bar-redesign-plan.md](./activity-bar-redesign-plan.md) — 全局活动栏重设计的实施计划：6 phase（0 导航 state+primitive / 1 桌面四栏 / 2 左栏随导航切换 / 3 进入项目后左栏多导航 / 4 移动端 / 5 门禁）；对照 activity-bar-redesign.md §8 现状锚点，Phase 2a（方案 X 拆 InstanceArea）实现中。
- [agent-provider-experience.md](./agent-provider-experience.md) — 定义 Claude/Codex provider 可见体验、AgentRuntime/provider profile 边界、Agent workspace provider create/current instance 边界和 history/resume 分阶段设计。
- [agent-session-model.md](./agent-session-model.md) — 定义 AgentSession、TerminalSession、transportSession、conversationThread 与 turn/run 的长期设计边界。
- [claude2-provider-protocol.md](./claude2-provider-protocol.md) — 定义 Claude2 provider 的完整协议设计，包括双层 ID 架构（tool_use.id 持久化主键 vs request_id 瞬态 RPC key）、缓冲策略、服务端驱动的卡片状态机、与 hapi 的对照，以及预留的 Codex 接入模式。
- [console-shell.md](./console-shell.md) — 定义登录后 Project Console Shell 的信息架构、Project 直接二级 workspace、移动端返回层级、输入职责边界、响应式布局和 PWA 静态资源缓存设计（移动单列布局已被 [`workbench-redesign.md`](./workbench-redesign.md) 两层取代，PWA/输入/安全边界仍有效）。
- [file-browser-preview.md](./file-browser-preview.md) — 定义 Project console Files 的只读浏览、desktop list+preview、移动端 direct-secondary/list 与 deep preview detail 分层、前端状态边界和只读交互规则。
- [frontend-stack.md](./frontend-stack.md) — 定义 `web` 前端栈、路由/服务端状态/本地 UI 状态职责边界和 `/api` 调用接入规则。
- [frontend-ui-architecture.md](./frontend-ui-architecture.md) — 定义 UI/UX prototype alignment 的来源优先级、三层页面模型、Home/Project/Session/resource workspace 边界、移动端返回规则和 runtime surface roles（导航模型部分已被 [`workbench-redesign.md`](./workbench-redesign.md) 取代，shell primitive/状态规则/密度基线仍有效）。
- [git-diff-viewer.md](./git-diff-viewer.md) — 定义 Project console Git diff viewer 的只读 changed-file list、desktop unified diff panel、移动端 direct-secondary/list 与 deep diff detail 分层、状态处理和只读交互规则。
- [message-replay.md](./message-replay.md) — 定义 Claude2 Agent Session 的进程模型（`Bun.spawn` 直拉 CLI，非 tmux）与消息回放管线（JSONL history + 内存 live 双缓冲 relay + 单一 WS 流），含 system.init/turn 边界、reconnect/API 重启时序、特殊时期 history 缩容（compact-block windowing + 标量重建）与已废弃的 Gen 2 机制。
- [mobile-session-interaction.md](./mobile-session-interaction.md) — 定义 Agent/Terminal Session detail 的移动端工作台布局、非遮挡输入区、quick key 直发、真实能力边界和恢复状态规则。
- [session-runtime-boundaries.md](./session-runtime-boundaries.md) — 定义 Agent Session、Terminal Session、transport connection 和 runtime lifecycle 的长期设计边界。
- [workbench-redesign.md](./workbench-redesign.md) — 已落地的三栏工作台权威设计：桌面端从单列三层重设计为常驻三栏工作台（左=项目+实例树、中=自由 split 画布、右=文件/Git/原型/插件 tab）+ 移动两层导航，含走向决策、ASCII、Codex 插件研究结论与剩余待定项；导航模型已被 workbench-views.md 进一步演进。
- [workbench-views.md](./workbench-views.md) — 工作台多视图重设计（设计完整，实现分 phase 渐进）：演进自 workbench-redesign.md——中栏永远左右结构（左总览固定单列卡片 + 右工作区拖放分屏），取消独立 split 视图与面板三态状态机，grid/table/grouped 收归左总览卡片样式。含信息架构、右工作区 5 drop zone 自由分屏、激活语义、URL 模型与所有「用户决定」标注，是本轮 IA 重构的设计权威。
- [workbench-views-plan.md](./workbench-views-plan.md) — 工作台多视图重设计的实施计划：3 phase（A 中栏左右骨架 / B 拖放分屏 / C group 操作+持久化）的执行顺序、每 phase 任务、依赖、验证与关键代码入口，下次会话可直接照此接手。
- [工作流和技能的大纲设计.md](./工作流和技能的大纲设计.md) — 定义工作流阶段链路、技能职责、`.workflow/versions` 运行态结构、change context 看板上下文与长期沉淀边界。
