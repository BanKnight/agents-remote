# Product Design

## Change

- change-id：rework-project-mobile-workspace

## 用户目标 / 产品目标

- 用户在手机上进入某个 Project 后，应立即看到这个 Project 的工作区主界面：能返回 Project 列表，能进入 Files/Git 检查，能查看或创建 Agent Session 和 Terminal Session。
- Project 详情页应减少常驻说明和全局输入占位，让页面服务“选择下一步工作入口”，而不是像桌面网站长页面。
- 本 change 为后续 Session detail 与 Files/Git 移动端 polish 提供入口级工作区结构。

## 功能边界

### 做什么

- 修改 Project 详情页移动端信息架构：顶部返回 + Project 上下文，主体从上到下为 Files/Git 功能区、Agent 区、Terminal 区。
- 保留现有 Agent/Terminal session 创建、进入详情、关闭能力和状态展示。
- 移除移动端 Project 工作区底部常驻 runtime input 面板。
- 让 Project 工作区默认撑满手机视口，常见内容量下不产生页面级滚动。

### 不做什么

- 不新增 Agent/Terminal runtime 后端能力。
- 不改变 Files/Git 的只读能力范围，也不新增写操作。
- 不把 Session detail 的输入、快捷键、重连恢复搬到 Project 工作区。
- 不承诺离线/PWA service worker、provider history/resume、完整 terminal emulator 或桌面专属重设计。

## 用户流程

- 进入流程：用户从首页 Project 列表进入 Project 工作区，顶部看到返回入口和当前 Project 名称/路径摘要。
- 功能区流程：用户可从顶部功能区进入 Files 或 Git 检查区域，后续具体只读查看由相关页面/区域承接。
- Agent 流程：用户在 Agent 区查看 Agent Sessions，创建 Claude/Codex Agent Session，或打开已有 Agent Session detail。
- Terminal 流程：用户在 Terminal 区查看 Terminal Sessions，创建普通 Terminal Session，或打开已有 Terminal Session detail。
- 输入流程：用户需要发送文本或快捷键时，必须进入具体 Agent/Terminal Session detail；Project 工作区不直接发送 runtime input。

## 信息架构

- 顶部上下文：返回 Projects、当前 Project 名称、必要路径摘要或状态。
- 功能区：Files、Git 两个 Project-level 检查入口，作为工作区顶部能力卡片。
- Agent 区：Agent Sessions 是 AI 远程工作主入口，展示 provider 创建入口和 session 列表。
- Terminal 区：Terminal Sessions 是普通 shell 辅助入口，展示创建入口和 session 列表。
- Project signals 这类辅助信息不应抢占移动端首屏；如保留，应降级为轻量上下文。

## 体验路径

- 常见路径：进入 Project → 快速选择 Files/Git/Agent/Terminal → 进入对应详情或创建 session。
- 空状态：Agent 或 Terminal 无 session 时，区域内展示清晰空态和创建入口，不用全页大占位。
- 失败路径：Project 加载失败仍提供返回 Projects；Agent/Terminal 创建或关闭失败在对应区域内展示错误。
- 长列表路径：session 列表较长时在区域内部滚动或按后续设计处理，避免整页滚动破坏工作区感。

## 关键决策

- Files/Git 放在 Agent/Terminal 之前，因为它们是 Project 工作区的低成本检查入口，可以帮助用户确认上下文。
- Agent 和 Terminal 分区并列为运行态入口，不用泛泛 “Sessions” 合并，避免混淆两种控制面概念。
- 移除 Project 工作区底部 input，不再用 disabled/说明性输入占据可视高度；这一职责转移到 Session detail。

## 风险与权衡

- 去掉底部 runtime input 可能减少“可输入”的提示感；通过 Agent/Terminal 区域内的 session detail 入口和轻量文案补偿。
- 移动端撑满视口可能在 session 数量多时需要局部滚动；设计明确只保证常见内容量无页面级滚动，长列表进入局部滚动。
- 桌面现有侧栏结构可能需要保留，避免本 change 过度影响宽屏使用；桌面可作为移动结构的增强布局。

## 开放问题

- 无。

## 后续沉淀候选

- Project 工作区移动信息架构。
- Project 工作区与 Session detail 的输入职责边界。
