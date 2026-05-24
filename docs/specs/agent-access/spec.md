# agent-access spec

本文件记录 `agent-access` 的长期行为契约。它是主线 WHAT，不记录实现方案、任务拆解或单次 change 过程。

## Purpose

- 确保 Claude/Codex Agent 接入路线在进入 Agent Runtime/API 设计前经过可验证调研，避免把某个 provider、终端实现或临时协议过早固化为长期控制面语义。
- 为后续 Agent Runtime、Provider Adapter、Session Runtime 和 E2E 质量基线提供稳定的 WHAT 约束。

## Requirements

### Requirement: Agent access route research precedes runtime/API lock-in

系统 SHALL 在锁定 Agent Runtime/API 设计前，产出覆盖 `CLI/tmux`、hapi 实现、Claude 相关官方能力、Codex 官方远程对接协议或参考实现的 Agent 接入调研结果。

#### Scenario: Required routes are covered

- **WHEN** Agent Runtime/API 进入设计阶段
- **THEN** 可查阅的长期调研材料列出每条必需路线的资料来源、当前可用性判断、关键能力、主要限制和对本项目的影响

#### Scenario: Route is unavailable or undocumented

- **WHEN** 某条必需路线无法获得可靠资料或无法验证
- **THEN** 长期调研材料明确标记该路线的未知项、风险和后续验证动作，而不是用其他路线结论替代

### Requirement: Source-based provider research remains traceable

系统 SHALL 对用于支撑 Agent 接入路线判断的本地源码研究保留仓库、路径、commit 和关键源码引用。

#### Scenario: Local source is inspected

- **WHEN** hapi、remodex 或其他参考实现被用于支撑设计判断
- **THEN** 相关仓库位于 `~/repos` 下，并且长期调研材料记录仓库 URL、本地路径、commit 和关键源码路径

#### Scenario: Reference behavior is summarized

- **WHEN** 参考实现被沉淀为长期结论
- **THEN** 文档区分可复用行为、不可复用假设、provider-specific 限制和仍需本项目重新设计的差异

### Requirement: Official protocol constraints stay separate from transport details

系统 SHALL 在长期调研和设计中区分 provider 业务协议、transport、runtime session 和控制面 API 语义。

#### Scenario: Official capability affects API shape

- **WHEN** 官方能力或协议影响会话生命周期、交互流、历史恢复、认证、远程连接或 UI 化边界
- **THEN** 长期设计材料将该影响记录为 Agent Runtime/API 设计约束，并避免把 provider-native identifier 作为本项目 URL/API 主键

#### Scenario: Transport conflicts with control-plane abstraction

- **WHEN** provider transport 或 terminal passthrough 能力与长期 AgentSession 抽象存在语义差异
- **THEN** 长期文档明确说明哪些 transport、terminal 或 provider-native 细节不得固化为长期 Agent protocol

### Requirement: Access route decisions are product-concern driven

系统 SHALL 按交互式体验、历史会话恢复、React UI 化、远程控制协议、实现复杂度和长期演进影响比较候选接入路线。

#### Scenario: Route comparison is reviewed

- **WHEN** 后续 change 需要选择或实现 Agent 接入路线
- **THEN** 评审者可以从长期调研材料中看到每条路线在产品关注点上的结论、风险和不确定项

#### Scenario: A route is recommended, deferred, or rejected

- **WHEN** 长期文档对某条路线给出推荐、暂用、预留或拒绝判断
- **THEN** 该判断能追溯到产品关注点、证据等级和验证结果，而不是只基于实现便利性

### Requirement: First usable slice keeps terminal passthrough compatible without freezing it

系统 SHALL 支持 roadmap 第一轮真实可用链路先以真实 CLI passthrough 保真 provider 能力，同时禁止把该路径固化为长期 Agent protocol。

#### Scenario: First usable slice uses CLI passthrough

- **WHEN** roadmap v0.1-v0.3 推进第一轮真实可用链路
- **THEN** 设计允许通过 `tmux/xterm/WebSocket` 承载真实 Claude/Codex CLI，以保留 slash commands、skills、plugins、autocomplete 和交互提示

#### Scenario: Long-term protocol evolves beyond passthrough

- **WHEN** 后续设计 provider-native AgentSession API
- **THEN** 设计必须保留 provider-neutral `AgentSession`、`conversationThread`、`turn/run`、`transportSession`、event stream 和 capability extension 的演进空间

## Notes

- `roadmap v0.1-v0.3` 对应研究阶段文档中曾称为 V1 的“第一轮真实可用链路”；后续文档应优先使用 roadmap 语义，避免与未来 `v1.0` 版本混淆。
- change 之间不直接消费彼此的 `.workflow/changes/<change-id>/artifacts/`；跨 change 复用的结论必须先经 verify 和 distill 进入 `docs/`。

## 来源

- change：research-agent-access-options
- verify 证据：`.workflow/changes/research-agent-access-options/verify.md`
