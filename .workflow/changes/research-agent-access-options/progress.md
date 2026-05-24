# progress

本文件记录单个 change 的当前阶段、下一步和阻塞项。`roadmap.md` 只指向当前 change，不维护这些状态。

## Change

- change-id：research-agent-access-options
- 所属 version：v0.1-foundation-and-agent-research
- change 路径：.workflow/changes/research-agent-access-options/

## 当前进度

- 当前阶段：已完成
- 下一步技能：archive-version
- 阻塞项：无

## 阶段流转

| 阶段 | 下一步技能 | 完成标志 |
|---|---|---|
| 待规格 | specify-change | `specs/` 已补齐可验证 WHAT |
| 待设计 | design-change | `design/` 已补齐 HOW 设计 |
| 待计划 | plan-change | `plan.md` 与 `tasks.md` 已补齐 |
| 待实现 | implement-change | `tasks.md` 中实现项已完成 |
| 待验证 | verify-change | `verify.md` 已补齐一致性证据 |
| 待沉淀 | distill-change | 长期 docs 已按需沉淀 |
| 已完成 | archive-version | 可随 version 归档 |
| 阻塞 | 先处理阻塞项 | 阻塞解除后回到对应阶段 |

## 进展记录

- 已完成 `specs/agent-access-research/spec.md`。
- 已完成 `design/overview.md`、`design/architecture.md`、`design/api.md`、`design/risks.md`。
- 已沉淀阶段性研究材料到 `docs/research/agent-access-options.md`，后续 plan-change 应将研究/设计结论转为可执行 plan 与 tasks。
- 已完成 `plan.md` 与 `tasks.md`，当前可进入 `implement-change` 执行研究收口、handoff 和 verify checklist 任务。
- 已完成 implement-change：补齐 `artifacts/spec-coverage-matrix.md`、`artifacts/source-evidence.md`、`artifacts/evidence-grading.md`、`artifacts/verification-checklist.md`、`artifacts/downstream-handoff.md`，并完成 `tasks.md` 全部实现任务；当前可进入 `verify-change`。
- 已完成 verify-change：创建 `verify.md`，验证结论通过，无 CRITICAL/WARNING；当前可进入 `distill-change`。
- 已完成 distill-change：更新 `docs/research/agent-access-options.md`，新增 `docs/specs/agent-access/spec.md`、`docs/design/agent-session-model.md`、`docs/architecture/agent-runtime.md`、`docs/architecture/adr/ADR-20260524-first-usable-cli-passthrough.md`，并同步相关索引；当前可随 version 进入 `archive-version`。
