# plan

## Change 目标

- 收口 Agent 接入路线调研，使研究结论可被后续 Agent Runtime/API、provider experience 和 E2E changes 直接消费。
- 本 change 不实现 runtime 或 API；完成后应进入 `implement-change` 执行研究证据补齐、handoff 和 verify checklist 任务。

## 局部 big picture

- `research-agent-access-options` 是 v0.1 的前置技术验证 change，阻塞后续 `design-session-runtime-boundaries` 中的 Agent provider 边界，以及 `implement-agent-provider-experience` 的 Claude/Codex 适配方向。
- 已完成 spec、design 和阶段性研究文档；当前需要把它们转成可执行收口任务，确保调研覆盖、证据等级、设计约束和开放问题都能被 verify。
- 该 change 的产物在 verify 前仍属于运行态研究/设计材料；长期 architecture/spec/design 沉淀应等 `distill-change`。

## 执行策略

- 先建立 spec requirement 到 research/design evidence 的覆盖矩阵，确认每个可验证场景都有证据或明确开放问题。
- 再补齐研究材料的证据可追溯性：源码路径、commit、官方资料/社区弱信号等级、路线比较维度。
- 然后整理下游 handoff，将 provider-neutral session 语义、adapter seam、capability negotiation、V1/Final 边界和风险验证建议传递给后续 changes。
- 最后形成 verify checklist，让 `verify-change` 可以按 spec scenarios 逐条验收。

## 任务顺序依据

- 1.1 覆盖矩阵是所有后续整理任务的基础，必须先完成。
- 2.1 源码证据、2.2 官方/社区证据、2.3 V1/Final 验证清单都依赖覆盖矩阵，但可以按证据来源分工推进。
- 2.4 下游 handoff 必须等待核心证据和边界收口后再写，避免把未收敛结论传给下游 change。
- 3.1 是最终一致性检查，应最后执行并为 verify 准备输入。

## 额外上下文

- `docs/project.md`：用于确认项目目标是优化版 hapi，以 Web/PWA 控制服务器 Claude/Codex Agent，并保持跨 Agent 统一控制语义。
- `docs/research/agent-access-options.md`：阶段性研究主材料，是实现任务补齐 evidence、handoff 和 verification checklist 的主要外部输入。
- `/home/deploy/repos/hapi/`：仅当任务需要补证 hapi 源码引用时读取；当前已记录 commit 与关键路径。
- `/home/deploy/repos/remodex/`：仅当任务需要补证 remodex/Codex app-server 引用时读取；当前已记录 commit 与关键路径。
- 当前没有已验证的长期 Agent Runtime architecture/spec/design/runbook 可直接遵循；verify 后再由 `distill-change` 决定长期沉淀。

## 依赖与阻塞

### 阶段依赖

- `specify-change` 已完成，存在 `specs/agent-access-research/spec.md`。
- `design-change` 已完成，存在 `design/overview.md`、`design/architecture.md`、`design/api.md`、`design/risks.md`。
- 当前无阻塞，可进入 `implement-change`。

### 任务依赖

- 1.1 → 2.1 / 2.2 / 2.3。
- 2.1 + 2.2 + 2.3 → 2.4。
- 2.4 → 3.1。

### 外部依赖

- 不依赖在线第三方服务；默认不做新增在线调研。
- 如果本地 `/home/deploy/repos/hapi` 或 `/home/deploy/repos/remodex` 缺失，相关源码补证任务应记录阻塞，而不是重新设计调研结论。
- 如果发现已有研究结论互相冲突，应暂停并回流到 `design-change` 或用户确认，不在实现阶段自行改变方向。

## 并行机会

- 2.1 和 2.2 可以并行：分别处理源码证据和官方/社区证据；如同时修改 `docs/research/agent-access-options.md`，需按章节避免冲突。
- 2.3 可先并行起草 verification checklist，但最终版本要等待 2.1/2.2 的证据收口。
- 2.4 和 3.1 不适合并行，因为它们依赖前序结论的完整性。

## 风险与验证重点

- 风险：V1 terminal passthrough 被误解成长期 Agent protocol。
- 风险：Codex WebSocket transport 与 app-server protocol 概念混淆。
- 风险：Claude Code remote-control 未确认能力被写成已可实现能力。
- 风险：社区弱信号被当作官方承诺。
- 验证重点：每条 spec requirement 都能对应到研究/design 证据、下游 handoff 或明确开放问题。
- 验证重点：`design-session-runtime-boundaries`、`implement-agent-provider-experience`、`setup-e2e-quality-baseline` 能直接消费本 change 的 handoff。

## 不做事项

- 不实现 Agent Runtime、Provider Adapter、TerminalSession Runtime 或 API endpoint。
- 不新增前端 UI、移动端交互或 E2E 测试代码。
- 不冻结最终统一协议字段，只整理设计约束和验证任务。
- 不直接沉淀长期 architecture/spec/design；等待 verify 后由 `distill-change` 处理。
- 不为兼容官方 app 改变本项目自有 Web/PWA 控制面主线。
