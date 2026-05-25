# Product Design

## Change

- change-id：design-session-runtime-boundaries

## 用户目标 / 产品目标

- 用户需要在 Project 控制台中远程观察和控制两类不同运行实例：Claude/Codex Agent 会话，以及普通 shell 终端会话。
- 用户需要快速判断某个 Agent 是否正在运行、是否等待输入、是否已经结束，以及是否可以重新连接继续操作。
- 第一轮目标是让真实 CLI 和普通 shell 可用，同时让产品语言不被底层 `tmux/xterm/WebSocket` 暂用实现污染。

## 功能边界

### 做什么

- 定义 Agent Session、Terminal Session 和 transport connection 的用户可见差异。
- 定义 Project 下 session 列表、详情、创建、重连和关闭的产品语义。
- 定义关闭前确认，并明确提示底层进程会被终止。
- 定义底层 runtime 不存在时的列表清理和详情页结束提示。
- 定义 Agent provider 安装/登录前置假设：服务器已准备好 Claude/Codex CLI，本系统只启动和连接。

### 不做什么

- 不做 provider 账号登录、CLI 安装、模型配置管理。
- 不做跨服务器重启恢复或 provider-native 历史恢复。
- 不做完整 Agent React 原生 UI；第一轮以真实 CLI passthrough 保真 provider 能力。
- 不把 Terminal Session 当成 Agent Session 历史或 conversation thread。
- 不做终端搜索、过滤或完整日志持久化。

## 用户流程

- 用户进入 Project console 后默认看到 Agent Sessions 区域。
- 用户创建 Agent Session 时选择 provider（Claude 或 Codex），系统在当前 Project 目录下启动或连接对应 CLI runtime。
- 用户创建 Terminal Session 时，系统在当前 Project 目录下启动普通 shell runtime。
- 用户打开 session 详情页时，页面通过 internal session id 连接对应 stream。
- 如果 WebSocket 断开但底层 runtime 仍存在，页面显示 disconnected，并提供 reconnect。
- 如果重连发现底层 runtime 不存在，页面显示 session ended，并提供返回列表。
- 用户关闭 session 时先确认；确认后系统终止底层 runtime，列表不再展示该实例。

## 信息架构

- Project console 下至少区分：
  - Agent Sessions：Claude/Codex 交互式工作会话，默认焦点。
  - Terminal Sessions：普通 shell 会话，辅助入口。
- Agent Session 卡片展示：展示名称、provider、状态、Project、最近活动时间（如可得）、是否等待输入（如可观察）。
- Terminal Session 卡片展示：展示名称、状态、Project、最近活动时间（如可得），不展示 provider。
- 详情页标题显示用户可读名称，URL 使用 internal session id。

## 体验路径

- 正常路径：创建 session → 进入详情 → 看到当前终端内容 → 输入 → 断开后重连 → 继续操作。
- 边界路径：底层 runtime 已结束 → 详情提示 ended → 返回列表；列表自动不再展示该实例。
- 失败路径：provider 未安装/未登录 → 创建失败或进入 error 状态 → 提示需要服务器侧准备 provider CLI。
- 危险路径：关闭 session → 确认提示进程会被终止 → 确认后终止。

## 关键决策

- 用户可见语义优先于底层实现：即使 Agent Session 第一轮也是终端 passthrough，也必须显示为 Agent Session。
- Terminal Session 只表示普通 shell，不承担 Claude/Codex 历史恢复或 provider-native conversation 语义。
- `idle/waiting_input` 是 Agent Session 的用户价值状态；第一轮只在有可靠信号时表达，不伪造。
- 关闭是终止，不是隐藏；隐藏已结束 runtime 只发生在系统确认底层不存在后。

## 风险与权衡

- 真实 CLI passthrough 能最快可用并保留 provider 特性，但容易让 UI 和 API 泄漏 terminal 细节；本 change 用命名、路由和 metadata 分层控制风险。
- Agent 等待输入的判断可能不稳定；与其错误提示用户，不如第一轮只表达明确可观察的状态。
- 不做重启恢复会让服务器重启后列表丢失活跃感知，但符合个人部署第一轮运行态边界。

## 开放问题

- 多浏览器同时打开同一 session 时，输入控制权和只读观察如何分配，留到实现或后续协作语义设计。
- Agent provider-native 历史会话恢复由后续 `implement-agent-provider-experience` 决定。

## 后续沉淀候选

- Agent Session 与 Terminal Session 的产品语义边界可沉淀到 `docs/design/session-runtime-boundaries.md`。
