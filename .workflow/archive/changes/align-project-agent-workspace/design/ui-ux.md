# UI/UX Design

## Change

- change-id：align-project-agent-workspace

## 页面 / 界面范围

- Project Agent workspace，即 Project 二级导航中的 Agent 直接二级页。
- 桌面端：Project 二级左侧导航 + Agent workspace 主区。
- 移动端：当前 Project / Agent 上下文 + provider 创建入口 + Agent instances 列表 + 底部 Project 二级导航。
- Session history / future restore 轻量区域。

## 页面结构

- Workspace header 继续展示 Project 上下文，但不重复大段说明；Agent workspace 内容区负责 Agent-specific 操作和列表。
- Agent workspace 顶部放置 `Agent instances` 区块标题和 `+ Claude` / `+ Codex` provider 创建入口。
- 当前 Agent instances 是主内容：条目应按紧凑列表或紧凑卡片呈现，包含 provider marker、displayName、状态、id/少量 metadata、Open stream 和 Close。
- Session history / future restore 是辅助区域，应位于当前 instances 之后或侧边，视觉上轻于当前列表。
- Project signals 这类横切辅助信息不应在 Agent workspace 首屏抢占主内容；如果保留，应降低视觉重量或后置。
- 移动端首屏顺序：Project/Agent 上下文 → provider 创建入口 → 当前 instances/空态 → history/future restore → 底部二级导航。

## 交互模式

- 用户主要路径：进入 Project → 默认 Agent workspace → 点击 `+ Claude` 或 `+ Codex` 创建 session → 新实例出现在列表 → 打开 stream 进入 Agent Session detail。
- 扫描路径：用户查看 provider、displayName、status 和 id，判断哪个实例可继续操作。
- 关闭路径：用户点击 Close 时保留危险确认，确认后关闭对应 Agent Session。
- History 路径：当前仅作为 future restore / history placeholder；不得提供看似可用但实际无效的恢复动作。
- 移动端二级导航保留 Back、Agent、Files、Git、Terminal；Agent active 状态清楚，不在顶部重复 Back。

## 页面状态

- 默认态：显示 provider 创建入口、Agent instances 列表、history/future restore 轻量区域。
- 加载态：Agent instances 区域显示加载文案或 skeleton 等价反馈，provider 创建入口仍可识别。
- 空态：显示无 Agent Sessions 提示，并引导使用 Claude/Codex 创建入口；不伪造实例。
- 错误态：创建失败、关闭失败或列表加载失败展示可读错误，保留用户可恢复路径。
- 成功态：创建成功后刷新列表，新 Agent Session 出现在当前 instances 区域。
- 禁用 / 提交中：创建中时 provider 创建入口禁用或显示 pending，避免重复提交。

## 可用性要求

- Provider、status、Open/Close 等关键状态必须有文字，不只依赖颜色或 marker。
- session id、displayName 和 provider metadata 不得导致横向溢出；长文本使用截断或换行。
- 移动端触控目标足够大，Close 不应与 Open stream 太近导致误触；危险关闭仍需 confirm。
- 当前实例列表和 history 区域需要有清晰标题，避免用户误以为 history 是当前运行实例。
- 避免每条实例重复展示过多 metadata；优先显示 provider、名称、状态、id 和操作。

## 关键决策

- Agent workspace 不展示虚构任务摘要或最近输出，因为当前 `AgentSession` DTO 不提供这些字段。
- Session history 只保留轻量 staged 区域，不展示假历史条目。
- Provider 创建入口用明确 provider 文案而非抽象 “New Agent”，但创建结果仍落入统一 Agent Sessions 列表。
- 保留现有危险关闭确认与 mutation error，不因视觉对齐删减安全反馈。

## 风险与权衡

- Prototype 展示了 richer agent output 和 history 示例；当前真实 DTO 不提供这些数据。为避免伪造，第一轮只展示真实字段和 staged history 空态。
- 过度压缩 Agent rows 可能降低关闭/打开操作可用性；实现时应保持操作按钮清晰。
- 如果 Project signals 继续紧跟 Agent panel，可能削弱首屏 Agent 密度；实现可后置或轻量化，但不必删除长期有用信息。

## 开放问题

- 无阻塞开放问题；真实 provider history/resume 另行规划。

## 后续沉淀候选

- 当前 Agent instances 与 provider history/future restore 必须分区，不混入同一运行实例列表。
- Agent workspace 只展示真实 DTO 支持的 provider/status/id/displayName，不伪造最近输出或历史数据。
