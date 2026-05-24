# tasks

## 执行顺序

1. 基础/阻塞任务：先建立 spec 到研究/design 证据的覆盖矩阵，确认后续任务的收口范围。
2. 核心整理任务：补齐研究证据、官方协议约束、路线比较、V1/Final 边界和风险验证建议。
3. 下游交接任务：把研究/design 结论整理成后续 changes 可直接消费的 handoff。
4. 集成与验证任务：检查 plan/spec/design/research 一致性，并准备 verify checklist。

## 任务清单

### 1. 基础/阻塞任务

- [ ] 1.1 建立 spec 覆盖矩阵
  - 验收标准：列出 `specs/agent-access-research/spec.md` 中每个 requirement/scenario 对应的研究材料、design 文件和仍需验证项；没有 requirement 处于未映射状态。
  - 依据：`plan.md` 的“实现策略”“任务拆解依据”；`.workflow/changes/research-agent-access-options/specs/agent-access-research/spec.md`；`.workflow/changes/research-agent-access-options/design/overview.md`。
  - 必读上下文：`docs/research/agent-access-options.md`、`specs/agent-access-research/spec.md`、`design/*.md`。
  - 修改范围：优先更新 `.workflow/changes/research-agent-access-options/artifacts/` 下的覆盖/验证材料；如需要，也可补充 `docs/research/agent-access-options.md` 中的可追溯说明。
  - 依赖：无。
  - 并行：否（阻塞后续任务）。

### 2. 核心整理任务

- [ ] 2.1 补齐 hapi/remodex 源码证据追溯
  - 验收标准：研究材料中 hapi 与 remodex 的仓库路径、commit、关键源码路径和可复用/不可复用点足以支撑 spec 中 hapi research 与 required routes 场景；缺口明确记录为开放问题。
  - 依据：`plan.md` 的“实现约束”“依赖分析”；`docs/research/agent-access-options.md` 的 hapi/remodex 章节；`design/architecture.md`。
  - 必读上下文：`docs/research/agent-access-options.md`、`/home/deploy/repos/hapi/` 中已引用路径、`/home/deploy/repos/remodex/` 中已引用路径。
  - 修改范围：`docs/research/agent-access-options.md`；必要时新增 `.workflow/changes/research-agent-access-options/artifacts/source-evidence.md`。
  - 依赖：1.1。
  - 并行：是，可与 2.2 并行；两者主要处理不同证据来源。

- [ ] 2.2 收口官方资料与社区弱信号分级
  - 验收标准：Claude 相关能力、Codex app-server/remote-control、官方 app 互通边界和社区反馈均标明证据等级；社区反馈没有被写成官方承诺；未确认能力列入开放问题或验证建议。
  - 依据：`plan.md` 的“实现约束”“风险与验证关注点”；`docs/research/agent-access-options.md` 的 Claude、Codex 官方与社区反馈章节；`design/risks.md`。
  - 必读上下文：`docs/research/agent-access-options.md`、`design/api.md`、`design/risks.md`。
  - 修改范围：`docs/research/agent-access-options.md`；必要时新增 `.workflow/changes/research-agent-access-options/artifacts/evidence-grading.md`。
  - 依赖：1.1。
  - 并行：是，可与 2.1 并行；需要在 3.1 前统一术语。

- [ ] 2.3 固化 V1 与 Final 边界的验证清单
  - 验收标准：明确列出 V1 terminal passthrough 必须验证的能力保真项，以及 Final provider-native/capability-based control plane 不应提前固化的字段或假设。
  - 依据：`plan.md` 的“实现策略”“风险与验证关注点”；`design/api.md`；`design/risks.md`；`docs/research/agent-access-options.md` 的 V1/Final、Slash commands / skills / plugins 章节。
  - 必读上下文：`design/api.md`、`design/risks.md`、`docs/research/agent-access-options.md`。
  - 修改范围：`.workflow/changes/research-agent-access-options/artifacts/verification-checklist.md`；必要时补充 `docs/research/agent-access-options.md` 的验证建议。
  - 依赖：1.1。
  - 并行：部分可并行；最终版本需要等待 2.1/2.2 的证据收口。

- [ ] 2.4 编写下游 change handoff
  - 验收标准：为 `design-session-runtime-boundaries`、`implement-agent-provider-experience`、`setup-e2e-quality-baseline` 分别列出必须消费的研究结论、禁止固化的边界、开放问题和建议验证动作。
  - 依据：`plan.md` 的“任务拆解依据”；`design/overview.md` 的总体设计结论；`design/architecture.md`；`design/api.md`；`design/risks.md`。
  - 必读上下文：`.workflow/changes/design-session-runtime-boundaries/intents.md`、`.workflow/changes/implement-agent-provider-experience/intents.md`、`.workflow/changes/setup-e2e-quality-baseline/intents.md`、本 change 的 `design/*.md`。
  - 修改范围：`.workflow/changes/research-agent-access-options/artifacts/downstream-handoff.md`。
  - 依赖：2.1、2.2、2.3。
  - 并行：否（依赖核心整理结论）。

### 3. 集成与验证任务

- [ ] 3.1 执行一致性检查并准备 verify 输入
  - 验收标准：`plan.md`、`tasks.md`、spec、design 和 `docs/research/agent-access-options.md` 的关键结论一致；`artifacts/verification-checklist.md` 覆盖所有 spec scenarios；没有 unresolved critical gap。
  - 依据：`plan.md` 全文；`tasks.md` 全文；`specs/agent-access-research/spec.md`；`design/*.md`。
  - 必读上下文：本 change 全部运行态产物；`docs/research/agent-access-options.md`。
  - 修改范围：`.workflow/changes/research-agent-access-options/artifacts/verification-checklist.md`；必要时对 `docs/research/agent-access-options.md` 或 `design/*.md` 做一致性修正。
  - 依赖：2.4。
  - 并行：否（最终收口任务）。

## 依赖图

- 1.1 → 2.1
- 1.1 → 2.2
- 1.1 → 2.3
- 2.1 + 2.2 + 2.3 → 2.4
- 2.4 → 3.1

## 可并行任务

- 2.1 与 2.2 可以并行：分别处理源码证据和官方/社区证据，不依赖同一未完成产物；如同时修改 `docs/research/agent-access-options.md`，需按章节避免冲突。
- 2.3 的初稿可以与 2.1/2.2 并行：主要产物是 verification checklist；最终收口必须等待 2.1/2.2。

## 阻塞项

- （无）
