# verify

本文件记录当前 change 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：research-agent-access-options
- Roadmap 对应项：v0.1-foundation-and-agent-research / research-agent-access-options
- 验证对象：Agent 接入路线调研收口产物，包括 specs、design、plan/tasks、research 文档和 artifacts。
- 验证结论：通过

## 验证轮次

### Round 1

- 时间：2026-05-24
- 验证范围：
  - spec requirements/scenarios 是否被 research/design/artifacts 覆盖。
  - plan/tasks 是否已完成并与 artifacts 对齐。
  - hapi/remodex 本地源码路径和 commit 证据是否可追溯。
  - 研究结论是否仍保持 V1/Final、transport/protocol、官方资料/社区弱信号等边界。
  - 是否存在 scope 外实现、未支撑行为或 unresolved critical gap。
- 使用 harness：文件存在性检查、tasks 勾选检查、源码路径抽查、仓库 commit 校验、文档一致性 Trace review、git delta review。
- 本轮结论：通过；无 CRITICAL，无 WARNING，仅有不阻塞的 SUGGESTION。
- 后续动作：进入 `distill-change`，由 distill 决定哪些研究/设计结论需要沉淀到长期 docs。

## Harness 清单

- 名称：Artifact presence and task completion check
  类型：CLI fixture + structural check
  覆盖承诺：plan/tasks 完成、必需 artifacts 存在、tasks 无未完成项。
  执行方式：`python3` 检查 `tasks.md` 勾选数、未完成任务数和关键 artifact 文件存在性。
  结果：通过；`checked_tasks=6`，`open_tasks=0`，`missing_artifacts=none`。
  证据：本轮会话命令输出；`.workflow/changes/research-agent-access-options/tasks.md`。

- 名称：Research source path existence check
  类型：CLI fixture + source evidence trace
  覆盖承诺：hapi/remodex 源码研究基于 `~/repos` 本地 clone，关键源码路径可追溯。
  执行方式：`python3` 检查 `artifacts/source-evidence.md` 记录的 39 个关键源码路径。
  结果：通过；`checked_paths=39`，`missing_paths=none`。
  证据：`.workflow/changes/research-agent-access-options/artifacts/source-evidence.md`。

- 名称：Research repository commit check
  类型：CLI fixture
  覆盖承诺：研究材料记录的 hapi/remodex commit 与本地仓库一致。
  执行方式：`git -C /home/deploy/repos/hapi rev-parse HEAD` 与 `git -C /home/deploy/repos/remodex rev-parse HEAD`。
  结果：通过；hapi 为 `0fa21a121a9307f42595e6e9be01aec7f99cd7dc`，remodex 为 `e63cf05c7652b5a349e3005e18903d7f3f6132f7`。
  证据：`docs/research/agent-access-options.md`、`artifacts/source-evidence.md`。

- 名称：Trace/Delta documentation review
  类型：手动验证 + trace review
  覆盖承诺：spec/design/plan/tasks/research/artifacts 一致，且没有把未知官方能力写成已确认事实。
  执行方式：读取并比对 spec、design、plan/tasks、`docs/research/agent-access-options.md`、artifacts。
  结果：通过；发现 1 个可读性 SUGGESTION，不影响一致性或下游消费。
  证据：本文件 Trace/Delta/Scenario/Evidence 章节。

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| Spec: Research scope includes all required access routes | 覆盖 `CLI/tmux`、hapi、Claude 相关官方能力、Codex 官方远程协议/remodex。 | `docs/research/agent-access-options.md` 覆盖总体摘要、V1/Final、hapi、remodex、Claude、Codex 官方/社区反馈、路线比较；`artifacts/spec-coverage-matrix.md` 映射全部 required routes。 | Trace review 确认路线比较和 matrix 均存在。 | 通过 |
| Spec: Route is unavailable or undocumented | 未确认路线必须标记未知项、风险和后续验证动作。 | `docs/research/agent-access-options.md` 开放问题；`artifacts/evidence-grading.md` 未确认能力清单；`design/risks.md` 风险列表。 | Trace review 确认 Claude remote-control、Codex schema 稳定性、官方 app 互通均未写成确定能力。 | 通过 |
| Spec: hapi source is inspected | hapi 源码研究需记录本地仓库、版本/提交和源码路径。 | `docs/research/agent-access-options.md` 记录 hapi URL、路径、commit；`artifacts/source-evidence.md` 记录 hapi evidence map 和路径修正。 | Source path check 通过；repo commit check 通过。 | 通过 |
| Spec: hapi behavior is summarized | 区分 hapi 历史会话、CLI/UI 映射、可复用点和不可复用约束。 | `docs/research/agent-access-options.md` hapi 章节；`artifacts/source-evidence.md` hapi evidence map；`design/architecture.md` 技术取舍。 | Trace review 确认 dual-ID、sync/runtime、REST+SSE、terminal socket 分离被列为参考，metadata/fallback heuristics 未直接作为长期协议。 | 通过 |
| Spec: Official protocol constraints are captured | 官方能力影响 API/Runtime 时需转化为设计输入。 | `design/api.md` V1/Final API 边界；`design/architecture.md` transport/thread/turn 分离；`artifacts/downstream-handoff.md` 全局约束。 | Trace review 确认约束传递给 `design-session-runtime-boundaries` 与 `implement-agent-provider-experience`。 | 通过 |
| Spec: Official capability conflicts with CLI/tmux route | 说明第一轮 `CLI/tmux` 设计需要保留/避免固化的抽象边界。 | `docs/research/agent-access-options.md` V1/Final 与 non-freeze 结论；`design/api.md` V1 TerminalSession/Final AgentSession 分层；`artifacts/verification-checklist.md` non-freeze list。 | Trace review 确认 tmux/xterm/Codex method/Claude transcript/provider-native id 均不被冻结。 | 通过 |
| Spec: Routes are compared against product concerns | 横向比较交互体验、历史恢复、React UI 化、远程控制、复杂度、演进影响。 | `docs/research/agent-access-options.md` 路线比较和总体摘要；`artifacts/spec-coverage-matrix.md` 对该 scenario 的检查项。 | Trace review 确认每条路线有优势、风险、初步定位；产品关注点在摘要/design 中有覆盖。 | 通过 |
| Spec: Research output drives downstream workflow | 产出后续 changes 可消费的约束、推荐路线和待验证问题。 | `artifacts/downstream-handoff.md` 分别面向 `design-session-runtime-boundaries`、`implement-agent-provider-experience`、`setup-e2e-quality-baseline`。 | Trace review 确认 handoff 包含必须消费结论、禁止固化边界、开放问题和建议验证动作。 | 通过 |
| Tasks | 所有 plan-change 拆出的收口任务已完成。 | `tasks.md` 6 个任务均为 `[x]`，并记录对应结果。 | Task completion harness 通过：`checked_tasks=6`，`open_tasks=0`。 | 通过 |
| Design | 设计结论不直接实现 runtime/API，只作为后续约束。 | `design/overview.md`、`design/architecture.md`、`design/api.md`、`design/risks.md`。 | Delta review 确认本 change 未引入代码实现或 API 字段冻结。 | 通过 |

## Delta 验证

- Scope 内变更：
  - 更新 `docs/research/agent-access-options.md` 的证据分级指针、hapi 实际路径修正、研究结论和后续交接内容。
  - 更新 `tasks.md` 与 `progress.md`，记录 implement-change 完成情况。
  - 新增 `artifacts/` 下覆盖矩阵、源码证据、证据分级、验证清单、下游 handoff。
- Scope 外变更：未发现代码实现、API endpoint、前端 UI、runtime 或测试框架变更。
- 未被 spec/design 支撑的新行为：未发现。
- 风险：研究文档中的“给后续 changes”内容可读性上缺少总标题，但已有 handoff artifact 承载正式交接，不影响 verify。
- 结论：通过。

## Scenario 验证

- 场景：Required routes are covered
  路径类型：正常
  验证方式：Trace review + spec coverage matrix review。
  证据：`docs/research/agent-access-options.md`；`artifacts/spec-coverage-matrix.md`。
  结果：通过。

- 场景：Route is unavailable or undocumented
  路径类型：边界
  验证方式：检查开放问题和 evidence grading。
  证据：`docs/research/agent-access-options.md` 开放问题；`artifacts/evidence-grading.md` 未确认能力清单。
  结果：通过。

- 场景：hapi source is inspected
  路径类型：正常
  验证方式：源码路径存在性检查 + commit 校验。
  证据：`artifacts/source-evidence.md`；CLI 输出 `checked_paths=39 missing_paths=none`；commit 校验输出。
  结果：通过。

- 场景：Official capability conflicts with CLI/tmux route
  路径类型：边界
  验证方式：检查 V1/Final 分层与 non-freeze list。
  证据：`design/api.md`；`artifacts/verification-checklist.md`。
  结果：通过。

- 场景：Downstream design starts
  路径类型：用户可见/流程可见
  验证方式：检查下游 handoff 是否可被三个后续 changes 消费。
  证据：`artifacts/downstream-handoff.md`。
  结果：通过。

## Evidence 清单

- 类型：trace
  路径或命令：`.workflow/changes/research-agent-access-options/artifacts/spec-coverage-matrix.md`
  结果：通过
  说明：所有 requirement/scenario 已映射，无未映射项。

- 类型：trace
  路径或命令：`.workflow/changes/research-agent-access-options/artifacts/source-evidence.md`
  结果：通过
  说明：hapi/remodex 源码路径和 commit 可追溯，并修正 hapi 过期 provider 文件路径。

- 类型：trace
  路径或命令：`.workflow/changes/research-agent-access-options/artifacts/evidence-grading.md`
  结果：通过
  说明：源码证据、官方资料、社区弱信号边界清晰；未确认能力进入开放问题。

- 类型：trace
  路径或命令：`.workflow/changes/research-agent-access-options/artifacts/verification-checklist.md`
  结果：通过
  说明：覆盖 spec scenarios、V1 terminal passthrough、Final boundary、non-freeze list 和开放问题。

- 类型：trace
  路径或命令：`.workflow/changes/research-agent-access-options/artifacts/downstream-handoff.md`
  结果：通过
  说明：为三个下游 changes 提供可消费结论和验证动作。

- 类型：CLI fixture
  路径或命令：`python3` source path existence check
  结果：通过
  说明：39 个 hapi/remodex 关键源码路径均存在。

- 类型：CLI fixture
  路径或命令：`git -C /home/deploy/repos/hapi rev-parse HEAD`; `git -C /home/deploy/repos/remodex rev-parse HEAD`
  结果：通过
  说明：commit 与研究材料记录一致。

- 类型：CLI fixture
  路径或命令：`python3` task/artifact presence check
  结果：通过
  说明：6 个任务已完成，0 个未完成任务，关键 artifacts 无缺失。

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 通过 | Spec scenarios、plan tasks 和 handoff artifacts 均覆盖，无未映射 requirement 或未完成任务。 |
| Correctness | 通过 | 源码路径/commit 抽查通过；研究材料保持 evidence grading 与开放问题边界。 |
| Coherence | 通过 | 研究、design、plan/tasks、artifacts 对 V1/Final、transport/protocol、provider-neutral boundary 的表述一致。 |

## 问题清单

### CRITICAL

- （无）

### WARNING

- （无）

### SUGGESTION

- `docs/research/agent-access-options.md` 中给后续 changes 的几条输入缺少总标题，建议 distill 或后续文档整理时补充类似“后续 changes 输入”的标题，提升可读性；不影响当前 verify，因为正式 handoff 已在 `artifacts/downstream-handoff.md` 中完整记录。

## 回流建议

- （无）

## 最终结论

- 结论：通过
- 是否允许进入 distill-change：是
- 条件或阻塞：无 CRITICAL、无 WARNING；仅有可读性 SUGGESTION，可在 distill 或后续文档整理时处理。
