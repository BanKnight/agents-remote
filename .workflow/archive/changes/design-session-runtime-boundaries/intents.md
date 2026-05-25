# intents

本文件记录本 change 的来源：可能来自用户原始意图，也可能来自 roadmap 规划出的铺垫、验证、质量或治理工作。

## 来源意图

- 编号：11
  原始意图：用户希望明确区分 Agent Session 和 Terminal Session：前者是 Claude/Codex 交互式会话，后者是普通 shell 终端会话。
- 编号：12
  原始意图：用户希望采用迭代式开发：第一轮先用 `tmux + xterm.js + WebSocket` 承载真实 CLI 来跑通 Agent/Terminal 交互流程；后续迭代再逐步做 React 原生 Agent UI 化。
- 编号：13
  原始意图：用户希望第一轮优先真实可用，同时在命名和接口上保留稳定抽象，避免把 `xterm.js/tmux` 细节泄漏到所有业务概念里，方便后续替换或增强 UI。
- 编号：17
  原始意图：用户希望从早期就明确区分 Agent Session 与 Terminal Session 的产品体验；即使底层复用 `tmux/xterm/WebSocket` 能力，也应在信息架构、路由、文案、状态命名和视觉语义上保持区分。
- 编号：22
  原始意图：用户接受早期先粗略区分 `running / closed / error`，但希望 Agent Session 尽早能表达 `idle / 等待输入`，因为手机端关键价值是判断当前是否需要用户介入。
- 编号：23
  原始意图：用户希望优先支持回到仍存在的 tmux 会话：重新打开网页后能进入已有 Agent/Terminal Session，看到当前终端内容并继续输入；暂不要求跨服务器重启后的完整任务恢复。
- 编号：24
  原始意图：用户希望关闭 Agent Session 或 Terminal Session 表示真正终止对应的 tmux 会话/进程，而不是仅从列表隐藏。
- 编号：25
  原始意图：用户希望关闭 Agent/Terminal Session 前弹出确认，并明确提示“会话中的进程将被终止”；不需要输入 session 名称做二次确认。
- 编号：57
  原始意图：用户希望第一步假设服务器上已经安装并登录好 Claude/Codex CLI；本系统负责在 project 目录下启动和连接交互式会话，不负责管理 Claude/Codex 的账号登录、模型配置或 CLI 安装。
- 编号：58
  原始意图：用户希望如果底层 tmux session 已不存在，系统可以直接从 Agent Session 或 Terminal Session 列表移除对应运行实例，不需要用户手动清理或处理。
- 编号：59
  原始意图：用户希望文档、UI 和 API 表述中明确区分 `Agent Session` 与 `Terminal Session`，避免用泛泛的 `Session` 混淆两类不同实例。
- 编号：62
  原始意图：用户希望 Terminal Session 第一阶段只表示当前活着的普通 shell 实例；如果底层 tmux 不存在就从列表移除，不需要像 Claude/Codex 那样读取历史会话。
- 编号：73
  原始意图：用户认为 Terminal Session 可以先按 `tmux + xterm.js + WebSocket` 确定，因为普通 shell 交互没有 Claude/Codex 协议不确定性；它适合作为第一条端到端集成和 E2E 链路。
- 编号：88
  原始意图：用户希望 Agent/Terminal WebSocket 断开时，详情页明确显示连接已断开，并提供重新连接入口；不要静默失败。
- 编号：89
  原始意图：用户希望如果底层 tmux 会话仍存在，重新连接后回到该 Agent/Terminal Session 的当前终端内容，并允许继续输入；不需要提示用户重新创建会话。
- 编号：90
  原始意图：用户希望如果详情页重连时发现底层 tmux 会话已不存在，应提示会话已结束，并提供返回列表入口；列表随后不再展示这个运行实例。
- 编号：91
  原始意图：用户希望第一步终端区域支持滚动查看历史输出，并尽量自动跟随最新输出；不需要复杂搜索、过滤或持久化完整日志。
- 编号：92
  原始意图：用户希望刷新或重新进入会话后能看到 tmux 当前屏幕/缓冲内容；但第一步不要求系统自己额外保存完整历史日志。
- 编号：109
  原始意图：用户希望第一步使用稳定的内部 session id 作为 Agent/Terminal Session 的 URL 参数，页面里再显示用户可读名称；避免名称变化或特殊字符影响路由。
- 编号：110
  原始意图：用户希望 Session 路由使用 `project + session id` 定位；展示名称自动生成给用户看；底层 tmux session name 包含 project、session 类型、provider 和短 id，方便服务器侧区分和恢复，但不直接暴露为用户名称。
- 编号：111
  原始意图：用户希望底层 tmux session name 不直接使用原始 project 名，而使用安全 slug/hash；UI 仍显示原始 project 名，服务端保存映射或通过 session metadata 关联。
- 编号：112
  原始意图：用户希望系统维护 session id、project、类型、provider、展示名称和底层 tmux name 之间的映射，运行态 metadata 可以存放在 `/run/agents-remote/` 下。
- 编号：113
  原始意图：用户接受 `/run/agents-remote/` 作为运行态 metadata 存储目录；这些数据不需要跨机器重启恢复，重启后丢失是符合预期的。
- 编号：114
  原始意图：用户希望 `/run/agents-remote/` 只用于当前运行实例、session metadata、socket/lock 等运行态信息，不用于长期配置、历史或项目数据。

## 规划来源

- 类型：技术验证
- 原因：Agent Session 与 Terminal Session 共享底层终端链路但产品语义不同，需要稳定 runtime、路由、metadata 和生命周期边界。
- 支撑目标：先用 Terminal Session 跑通真实 tmux/xterm/WebSocket，再为 Agent provider 适配保留统一抽象。
- 前置关系：依赖 `research-agent-access-options` 的 Agent 接入结论、`implement-project-model-and-safe-paths` 和 `configure-personal-app-settings`。

## 分配说明

- 所属 version：v0.3-session-runtime-quality
- 分配原因：这是 Session 运行态和第一条真实联通链路的核心 change。
