# intents

本文件记录本 change 的来源：可能来自用户原始意图，也可能来自 roadmap 规划出的铺垫、验证、质量或治理工作。

## 来源意图

- 编号：18
  原始意图：用户希望 Claude 和 Codex 在界面上明确显示为不同 Agent provider，并提供分别新建 Claude Session / Codex Session 的入口；但它们都属于 Agent Session，基础能力如列表、进入、关闭和状态展示使用同一套 Agent Session 语义表达。
- 编号：19
  原始意图：用户希望 Claude/Codex 的差异在 Agent Runtime 层适配到统一 Agent Session 语义，而不是把供应商差异扩散到控制面各处。
- 编号：20
  原始意图：用户希望从一开始就在 `api` 中显式保留 Agent Runtime 边界，哪怕实现很薄。
- 编号：21
  原始意图：用户希望 Agent Runtime 负责 provider 适配、启动命令、会话生命周期和 tmux 绑定，使控制面 API 不直接关心 Claude/Codex 的细节。
- 编号：60
  原始意图：用户希望 `Agent Session` 不只支持新建空白会话，也需要能列出已有 Agent 会话历史；例如 Claude 需要读取 Claude 配置中的会话历史，让用户选择某个历史会话并将其打开为当前可交互的 Agent Session 实例。
- 编号：61
  原始意图：用户希望“读取 Claude/Codex 历史会话并恢复为可交互 Agent Session 实例”作为 Agent Session 体系的重要设计意图现在记录清楚；实现上可以分阶段，先支持新建和列出当前运行实例，再支持历史会话恢复。
- 编号：63
  原始意图：用户希望 Agent Session 历史会话读取能力目标上同时支持 Claude 和 Codex，并可参考 hapi 实现；但实现顺序可以先从 Claude provider 开始，再扩展到 Codex。
- 编号：64
  原始意图：用户认为历史会话读取只是 Agent Runtime provider 适配的一部分，后续 provider 适配还会包含更多内容，不应把适配范围只理解为历史读取。

## 规划来源

- 类型：工程整理
- 原因：Claude/Codex provider 差异需要被 Agent Runtime 吸收，控制面只暴露统一 Agent Session 语义。
- 支撑目标：提供 provider 新建入口、运行实例列表、历史会话恢复方向和统一生命周期表达。
- 前置关系：依赖 `research-agent-access-options` 和 `design-session-runtime-boundaries`。

## 分配说明

- 所属 version：v0.3-session-runtime-quality
- 分配原因：这是首期 Agent Session 产品价值的 provider 层表达，但必须等待接入方式调研和 runtime 边界确定。
