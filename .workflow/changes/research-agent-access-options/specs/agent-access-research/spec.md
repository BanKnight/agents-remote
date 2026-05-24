# agent-access-research spec

本文件记录单个 change 对 `agent-access-research` 的行为契约增量。

## Change 来源

- change-id：research-agent-access-options
- 来源意图：
  - 编号：65：研究 hapi 如何发现、列出、恢复 Claude/Codex 历史会话，并把可复用做法转化到本项目。
  - 编号：66：研究 hapi 将 CLI 能力对接到 React UI 表现的实现方式，不只研究历史会话读取。
  - 编号：67：把 Codex 官方远程对接协议纳入接口设计考虑。
  - 编号：68：先把 Codex 官方远程对接协议作为接口设计约束并预留抽象边界，第一轮仍可用 CLI/tmux 跑通。
  - 编号：69：第一轮实现前必须完成 Agent 接入方式调研，不能默认 `CLI/tmux/hapi` 是最佳或最容易路线。
  - 编号：70：锁定 Agent Runtime/API 设计前，对比研究 `CLI/tmux`、hapi、Claude 相关官方能力、Codex 官方远程对接协议等路径。
  - 编号：71：比较不同路线对交互式体验、历史会话恢复、React UI 化、远程控制协议、实现复杂度和长期演进的影响。
  - 编号：72：调研结论必须反过来指导第一轮 Agent Runtime/API 设计。
- 规划来源：Agent Runtime/API 设计存在多种接入路线差异，本 change 负责先产出可验证的调研结论与设计约束。

## ADDED Requirements

### Requirement: Research scope includes all required access routes

系统 SHALL 在锁定第一轮 Agent Runtime/API 设计前，产出覆盖 `CLI/tmux`、hapi 实现、Claude 相关官方能力、Codex 官方远程对接协议的 Agent 接入调研结果。

#### Scenario: Required routes are covered

- **WHEN** 调研结果进入评审
- **THEN** 调研结果列出每条必需路线的资料来源、当前可用性判断、关键能力、主要限制和对本项目的影响

#### Scenario: Route is unavailable or undocumented

- **WHEN** 某条必需路线无法获得可靠资料或无法验证
- **THEN** 调研结果明确标记该路线的未知项、风险和后续验证动作，而不是用其他路线结论替代

### Requirement: hapi research identifies reusable behavior

系统 SHALL 明确 hapi 对 Claude/Codex 历史会话发现、列出、恢复，以及 CLI 到 React UI 表现的可复用行为和不可复用约束。

#### Scenario: hapi source is inspected

- **WHEN** hapi 研究需要本地源码检查
- **THEN** 相关仓库被放置在 `~/repos` 下，并且调研结果记录所检查的仓库、版本或提交引用

#### Scenario: hapi behavior is summarized

- **WHEN** hapi 研究完成
- **THEN** 调研结果区分历史会话相关行为、CLI 交互/UI 表现相关行为、可复用做法、不可复用限制和需要本项目重新设计的差异

### Requirement: Official protocol constraints are captured

系统 SHALL 将 Claude 相关官方能力和 Codex 官方远程对接协议中会影响 Agent Runtime/API 的约束提炼为设计输入。

#### Scenario: Official capability affects API shape

- **WHEN** 官方能力或协议会影响会话生命周期、交互流、历史恢复、认证、远程连接或 UI 化边界
- **THEN** 调研结果把该影响记录为后续 `design-session-runtime-boundaries` 和 `implement-agent-provider-experience` 必须考虑的约束

#### Scenario: Official capability conflicts with CLI/tmux route

- **WHEN** 官方能力或协议与第一轮 `CLI/tmux` 路线存在语义冲突
- **THEN** 调研结果明确冲突内容，并说明第一轮设计需要保留或避免固化的抽象边界

### Requirement: Routes are compared against product concerns

系统 SHALL 按交互式体验、历史会话恢复、React UI 化、远程控制协议、实现复杂度和长期演进影响对候选路线进行横向比较。

#### Scenario: Comparison matrix is reviewed

- **WHEN** 调研结果进入评审
- **THEN** 评审者可以从同一份比较中看到每条路线在六个产品关注点上的结论、风险和不确定项

#### Scenario: A route is recommended or rejected

- **WHEN** 调研结果对某条路线给出推荐、暂用、预留或拒绝判断
- **THEN** 该判断能追溯到上述产品关注点，而不是只基于实现便利性

### Requirement: Research output drives downstream workflow

系统 SHALL 把调研结论转化为后续 change 可消费的设计约束、推荐路线和待验证问题。

#### Scenario: Downstream design starts

- **WHEN** `design-session-runtime-boundaries` 或 `implement-agent-provider-experience` 进入 design 阶段
- **THEN** 其设计输入能引用本调研产出的推荐路线、禁止固化的边界、provider 适配约束和仍需验证的问题

#### Scenario: First iteration remains CLI/tmux compatible

- **WHEN** 调研结论允许第一轮继续使用 `CLI/tmux`
- **THEN** 调研结果同时说明第一轮 API/Runtime 不能泄漏或固化哪些 `CLI/tmux` 细节，以便未来接入官方协议或 React 原生 UI 化

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
