# Design Overview

本文件汇总 `align-project-agent-workspace` 的设计范围、子域选择和整体设计结论。

## Change

- change-id：align-project-agent-workspace
- 所属 version：v0.8-prototype-ui-alignment

## 输入依据

- intents：Project Agent workspace 需要与 prototype 对齐，展示多个 Agent instances，提供 `+ Claude` / `+ Codex` 创建入口，并以轻量列表行展示 session history，避免厚卡片和重复 metadata 降低首屏密度。
- specs：`.workflow/changes/align-project-agent-workspace/specs/project-console-navigation/spec.md`、`.workflow/changes/align-project-agent-workspace/specs/agent-provider-experience/spec.md`
- 相关长期 docs：`docs/design/frontend-ui-architecture.md`、`docs/specs/project-console-navigation/spec.md`、`docs/specs/agent-provider-experience/spec.md`、`docs/design/agent-provider-experience.md`、`docs/design/prototype/guidelines.md`、`docs/design/prototype/project-detail.html`

## 设计范围

### 本次覆盖

- Project Agent workspace 的 Agent instances 主工作区结构。
- Claude/Codex provider 创建入口在 workspace 顶部的呈现和状态反馈。
- 当前 Agent Sessions 的 provider-aware 列表行/紧凑卡片展示。
- Session history / future restore 的轻量占位或空状态呈现。
- 桌面端与移动端 Agent workspace 的密度、导航和状态保留。

### 本次不覆盖

- 不新增 provider history/resume API、DTO 或真实恢复行为。
- 不改变 Agent Runtime、provider adapter、tmux/session protocol 或后端创建语义。
- 不修改 Agent/Terminal Session detail 的 terminal-first 工作区。
- 不实现 Files/Git/Terminal resource page 对齐；这些属于后续 change。
- 不新增 provider account 登录、CLI availability 管理或模型配置 UI。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | 用户任务明确：在 Project Agent workspace 创建、扫描并进入当前 Agent instances。 |
| ui-ux | 是 | 核心是 Agent workspace 页面结构、列表密度、provider 创建入口、history 轻量呈现和移动端首屏。 |
| frontend | 是 | 需要约束现有 `ProjectConsoleRoute`、TanStack Query/Mutation、shared DTO 和组件边界。 |
| architecture | 否 | 不改变 Agent Runtime/provider adapter 或系统架构。 |
| api | 否 | 沿用现有 `listAgentSessions` / `createAgentSession` / `closeAgentSession` API。 |
| data | 否 | 不新增持久模型或 provider history 数据结构。 |
| business-rules | 否 | provider union、运行实例和 history staged 边界已由长期 specs/design 约束。 |
| error-handling | 否 | 错误与恢复纳入 UI/UX 和 frontend 状态，不单独成域。 |
| risks | 否 | 主要风险集中在误导性 history 与过度 metadata，已在子域内记录。 |

## 总体设计结论

- Agent workspace 是 Project 的默认运行态工作区，主任务是扫描当前 Agent instances、创建 Claude/Codex session、进入实例详情。
- Provider 创建入口应在 workspace 顶部清晰可见，标签使用 `+ Claude` / `+ Codex` 或等价表达，但结果仍是统一 Agent Session。
- 当前运行实例列表与 session history/future restore 必须视觉上分区，history 不混入当前 Agent Sessions，也不伪造 provider history 数据。
- 实现应优先改造现有 `AgentPanel` / `SessionCard` 结构，避免引入跨页面通用组件或后端协议变更。
- 移动端 Agent workspace 保留 Project 二级底部导航，首屏优先展示 provider 创建入口和当前 instances；history 可以后置。

## 关键决策

- 本 change 不设计真实 provider history；history 区只作为 staged capability 的轻量空态/占位。
- Agent instance 仍使用当前 shared `AgentSession` 字段：`provider`、`displayName`、`status`、`id`，不发明任务摘要、最近输出或历史时间等不存在的数据。
- 列表密度优先：减少厚卡片、大段说明和重复 metadata，但保留危险关闭确认、错误反馈和空态。
- Provider unavailable/创建失败使用现有 mutation error 反馈，不把服务器侧 provider 准备工作转成前端配置向导。

## 开放问题

- 无阻塞开放问题；history 真实数据能力明确后续另行设计。

## 后续沉淀候选

- Project Agent workspace 的长期规则：当前 Agent Sessions 与 provider history/future restore 分区展示。
- Provider create entry 的长期 UI 规则：明确 Claude/Codex，但不拆分 AgentSession 核心语义。
