# intents

本文件记录本 change 的来源：可能来自用户原始意图，也可能来自 roadmap 规划出的铺垫、验证、质量或治理工作。

## 来源意图

- 编号：47
  原始意图：用户认为项目包含多个子服务，尽早整合并跑通端到端流程比单点功能打磨更重要。
- 编号：48
  原始意图：用户希望尽早建立自动化 E2E 测试，作为后续集成和人工测试的基础。
- 编号：49
  原始意图：用户希望 E2E 测试覆盖 `web + api + session runtime` 的核心联通，而不只是前端页面静态测试。
- 编号：50
  原始意图：用户希望 E2E 测试作为持续性质量基线贯穿项目演进，而不是某个阶段的一次性任务。
- 编号：51
  原始意图：用户认可第一条 smoke/e2e 链路可以覆盖登录 → Project 列表 → 进入 Project → 创建 Terminal Session → 连接终端并看到可交互输出，用来证明 `web/api/tmux/WebSocket` 基础链路已打通。
- 编号：52
  原始意图：用户希望 E2E 尽量使用真实依赖，至少 Terminal Session 链路要真实启动 `tmux/shell` 并通过 WebSocket 交互。
- 编号：53
  原始意图：用户接受 Claude/Codex Agent 链路先用可控的假 provider 或测试命令替代，避免 E2E 依赖真实 AI CLI。
- 编号：54
  原始意图：用户现在不固定具体 E2E 工具；只要求它能自动启动 `web/api`、准备临时 `PROJECTS_ROOT`、驱动浏览器，并验证 WebSocket/终端链路。具体工具选择留给后续技术研究或设计阶段。
- 编号：55
  原始意图：用户希望 E2E 形成清晰的测试报告或失败截图/日志，让人工测试可以快速知道哪条链路失败。
- 编号：56
  原始意图：用户希望后续人工测试重点补充移动端真实手感、PWA 安装和终端输入体验。

## 规划来源

- 类型：质量基础设施
- 原因：项目是多服务、多 runtime 联通产品，必须用真实依赖覆盖关键链路，避免只验证静态页面。
- 支撑目标：建立登录到 Terminal Session WebSocket 交互的 smoke/e2e 基线，并形成可持续测试报告。
- 前置关系：依赖 `design-session-runtime-boundaries` 的 Terminal 链路可用；可先在工具设计阶段与基础结构并行准备。

## 分配说明

- 所属 version：v0.3-session-runtime-quality
- 分配原因：E2E 是第一轮集成质量基线，应在真实 Terminal Runtime 出现后立即接入。
