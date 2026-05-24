# intents

本文件记录本 change 的来源：可能来自用户原始意图，也可能来自 roadmap 规划出的铺垫、验证、质量或治理工作。

## 来源意图

- 编号：65
  原始意图：用户希望在实现 Agent Runtime provider 前，研究 hapi 如何发现、列出、恢复 Claude/Codex 历史会话，并把可复用的做法转化到本项目。
- 编号：66
  原始意图：用户希望未来将 CLI 能力对接到 React UI 表现时，也研究 hapi 的实现方式，而不仅仅研究历史会话读取。
- 编号：67
  原始意图：用户希望把 Codex 官方远程对接协议纳入接口设计考虑，因为它会显著影响 Agent Runtime 和控制面 API 的设计。
- 编号：68
  原始意图：用户希望现在先把 Codex 官方远程对接协议作为接口设计约束来研究和预留抽象边界；第一轮仍可用 CLI/tmux 跑通，但不要设计出未来无法接入该协议的 Agent Runtime/API。
- 编号：69
  原始意图：用户认为由于技术演进，第一轮实现前必须先完成 Agent 接入方式调研，不能默认 `CLI/tmux/hapi` 思路就是最佳或最容易实现的路线。
- 编号：70
  原始意图：用户希望在锁定 Agent Runtime/API 设计前，对比研究 `CLI/tmux`、hapi 实现、Claude 相关官方能力、Codex 官方远程对接协议等路径。
- 编号：71
  原始意图：用户希望 Agent 接入调研重点比较不同路线对交互式体验、历史会话恢复、React UI 化、远程控制协议、实现复杂度和长期演进的影响。
- 编号：72
  原始意图：用户希望调研结论反过来指导第一轮 Agent Runtime/API 设计，而不是只作为背景资料。

## 规划来源

- 类型：技术验证
- 原因：Agent Runtime/API 设计存在 CLI/tmux、hapi、Claude 官方能力、Codex 官方远程协议等路线差异，必须先明确约束和取舍。
- 支撑目标：指导第一轮 Agent Runtime/API 边界、provider 适配和后续 React UI 化路径。
- 前置关系：无；阻塞 `design-session-runtime-boundaries` 中的 Agent provider 细节和 `implement-agent-provider-experience`。

## 分配说明

- 所属 version：v0.1-foundation-and-agent-research
- 分配原因：这是整个 Agent 控制面架构的关键前置研究，优先级高于真实 Agent provider 实现。
