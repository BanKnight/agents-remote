# agent-provider-experience spec

本文件记录 Agent provider 体验的长期行为契约。它是主线 WHAT，不记录实现任务或单次 change 过程。

## Purpose

- 让用户在 Project 控制台中明确区分 Claude 与 Codex provider，同时保持它们都属于统一 Agent Session 语义。
- 为后续 provider history discovery、resume 和 provider-native capability extension 保留行为边界，避免把历史会话混入当前运行实例列表。

## Requirements

### Requirement: Agent provider choices are explicit while sharing AgentSession semantics

系统 SHALL 在 Project 控制台中明确展示 Claude 与 Codex 作为不同 Agent provider 的入口，同时将它们创建出的运行实例表达为统一 Agent Session。

#### Scenario: User creates an Agent Session for a provider

- **WHEN** 用户在 Project 控制台选择新建 Claude Agent Session 或 Codex Agent Session
- **THEN** 系统创建 Project-scoped Agent Session
- **AND** Agent Session metadata 和 DTO 记录所选 provider
- **AND** 列表和详情页仍使用 Agent Session 的统一进入、状态、重连和关闭语义

#### Scenario: Provider is shown without splitting the core concept

- **WHEN** Project 下同时存在 Claude 和 Codex Agent Sessions
- **THEN** UI 能区分每个 Agent Session 的 provider
- **AND** 不把 Claude Session / Codex Session 表达成与 Agent Session 平级的第三类 runtime 概念

### Requirement: Agent Runtime owns provider adaptation

系统 SHALL 将 Claude/Codex provider 差异限制在 Agent Runtime 或 provider adapter 边界内，不得扩散到通用控制面流程。

#### Scenario: Provider launch command differs

- **WHEN** Claude 与 Codex 需要不同启动命令、启动参数、运行前置检查或 provider-specific metadata
- **THEN** 差异由 Agent Runtime/provider adapter 处理
- **AND** Project console、Agent Session HTTP resource 和 stream detail 不需要知道 provider-specific 启动细节

#### Scenario: Provider reports unavailable

- **WHEN** 所选 provider CLI 未安装、未登录、配置不可用或无法启动
- **THEN** 系统以 Agent Session 创建失败或运行态错误表达 provider unavailable
- **AND** 错误文案提示服务器侧需要准备对应 provider
- **AND** 不在本 capability 范围内管理 provider 账号登录、安装或模型配置

### Requirement: Agent Session list and detail keep provider-aware status visible

系统 SHALL 在 Agent Session 列表和详情中保留 provider、displayName、internal session id 与状态信息，帮助用户判断当前实例是否可继续操作。

#### Scenario: Agent Session list is rendered

- **WHEN** Project 下存在 Agent Sessions
- **THEN** 列表展示每个 Agent Session 的 displayName、provider、status 和 detail 入口
- **AND** Terminal Session 列表不混入 provider 字段

#### Scenario: Agent Session detail is opened

- **WHEN** 用户打开某个 Agent Session detail route
- **THEN** 页面显示 provider、displayName、internal session id、runtime status 和 transport status
- **AND** 可通过现有 stream 输入和 reconnect 能力继续当前 provider runtime

### Requirement: Provider history discovery is represented as a staged capability direction

系统 SHALL 把读取 Claude/Codex 历史会话并恢复为可交互 Agent Session 的能力记录为 Agent Runtime/provider adapter 的分阶段目标，而不是把历史会话直接混入当前运行实例列表。

#### Scenario: Current running instances are listed

- **WHEN** 用户查看当前 Project 的 Agent Sessions
- **THEN** 列表默认展示当前仍存在的运行实例
- **AND** 不要求该列表直接包含 provider 历史会话记录

#### Scenario: Provider history is available in a later stage

- **WHEN** 后续 provider adapter 能读取 Claude 或 Codex 的历史会话/thread/transcript summary
- **THEN** 系统应通过 provider-normalized history summary 展示可恢复项
- **AND** 用户选择恢复项时，系统应创建或连接一个新的当前运行 Agent Session 实例
- **AND** provider-native history id 只进入 adapter/internal metadata，不作为本项目 URL/API 主键

#### Scenario: Only one provider supports history first

- **WHEN** Claude 与 Codex 历史读取能力成熟度不同
- **THEN** 系统可以先对单个 provider 启用历史会话读取
- **AND** UI 必须明确区分可用、暂不可用和失败状态
- **AND** 不得暗示另一个 provider 已支持同等恢复能力

### Requirement: Provider-specific capability details remain optional extensions

系统 SHALL 将 provider-native thread/turn/event、slash commands、skills/plugins discovery、approval/tool events 等能力视为 provider adapter 或 optional capability extension，不得成为基础 Agent Session 创建、列表、进入和关闭的前置要求。

#### Scenario: Provider exposes native structured events

- **WHEN** 某 provider 后续能提供 thread/turn/event 或 tool/approval schema
- **THEN** Agent Runtime 可以把它归一化为 Agent event/capability stream
- **AND** 基础 Agent Session lifecycle 不依赖 provider-native schema 字段

#### Scenario: Provider does not expose discovery APIs

- **WHEN** provider 无法枚举 slash commands、skills 或 plugins
- **THEN** 系统仍应保留 CLI passthrough/raw input 能力
- **AND** 不应为了原生 UI 覆盖不足而破坏 provider 自带能力

## Notes

- 当前主线只承诺 Claude/Codex provider union；新增 provider 需要更新 shared contract、spec 和实现。
- 当前 provider history capability 是 staged direction，不代表已提供 provider history API、resume payload 或 provider-native event stream。

## 来源

- change：implement-agent-provider-experience
- verify 证据：`.workflow/changes/implement-agent-provider-experience/verify.md`
