# agent-provider-experience spec

本文件记录 `align-project-agent-workspace` 对 `agent-provider-experience` 的行为契约增量。

## Change 来源

- change-id：align-project-agent-workspace
- 来源意图：Project Agent workspace 需要与 prototype 对齐：Project 内 Agent 二级页应展示多个 Agent instances，提供 `+ Claude` / `+ Codex` 创建入口，并以轻量列表行展示 session history，避免厚卡片和重复 metadata 降低首屏密度。
- 规划来源：本 change 直接承接用户原始意图，并沿用 `docs/specs/agent-provider-experience/spec.md` 与 `docs/design/agent-provider-experience.md` 的 provider 边界。

## ADDED Requirements

### Requirement: Agent workspace exposes provider-specific create actions without splitting AgentSession semantics

系统 SHALL 在 Agent workspace 顶部提供 Claude 与 Codex 的创建入口，同时继续把创建结果表达为统一 Agent Session。

#### Scenario: User scans provider create actions

- **WHEN** 用户进入 Project Agent workspace
- **THEN** 页面展示 Claude 和 Codex 两个 provider 创建入口或等价明确 provider 选择
- **AND** 创建入口位于 Agent workspace 的主要操作区域
- **AND** UI 不把 Claude/Codex 表达为与 Agent Session 平级的不同 runtime 类型

#### Scenario: User creates a provider session

- **WHEN** 用户点击 Claude 或 Codex 创建入口
- **THEN** 系统调用对应 provider 的 Agent Session 创建行为
- **AND** 创建中、创建失败或 provider unavailable 时展示用户可理解的反馈
- **AND** 创建成功后新 session 出现在当前 Agent instances 列表或可通过刷新恢复

### Requirement: Agent instance list keeps provider-aware running-instance semantics

系统 SHALL 在 Agent instance 列表中明确区分当前运行实例与 provider history，并保留 provider-aware status 信息。

#### Scenario: Current Agent Sessions are listed

- **WHEN** Project 下存在当前 Agent Sessions
- **THEN** 每个条目展示 provider、displayName、status 和 detail 入口
- **AND** 关闭或进入详情继续使用统一 Agent Session 语义
- **AND** 列表不把 provider history 条目混入当前运行实例

#### Scenario: No current Agent Sessions exist

- **WHEN** Project 下当前没有 Agent Sessions
- **THEN** Agent workspace 展示清晰空状态
- **AND** 空状态引导用户使用 Claude/Codex 创建入口
- **AND** 不伪造 Claude/Codex 历史会话或当前实例

### Requirement: Provider history remains a staged lightweight presentation

系统 SHALL 将 session history / future restore 区域表达为 provider history 的分阶段方向，而不是当前运行实例列表的替代品。

#### Scenario: Provider history is shown as future capability

- **WHEN** Agent workspace 展示 session history 区域但 provider history API 尚未完成
- **THEN** UI 明确表达该区域是 future restore、占位或空状态
- **AND** 不提供不可用的恢复按钮作为真实操作
- **AND** 不暗示 Claude 与 Codex 都已支持同等 history/resume 能力

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
