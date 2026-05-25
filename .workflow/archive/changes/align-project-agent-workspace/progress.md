# progress

本文件记录单个 change 的当前阶段、局部阻塞和进展记录。`roadmap.md` 只指向当前 change，不维护这些状态；阶段到技能的路由由 `step-change` 独占维护。

## Change

- change-id：align-project-agent-workspace
- 所属 version：v0.8-prototype-ui-alignment
- change 路径：.workflow/changes/align-project-agent-workspace/

## 当前进度

- 当前阶段：已完成
- 阻塞项：无

## 推进规则

- 本文件是 change 当前阶段、局部阻塞和进展记录的权威来源。
- 本文件不保存“下一步技能”；推荐使用 `step-change` 推进本 change，由它根据当前阶段调用对应阶段技能。
- `roadmap.md` 只引用本文件，不维护本 change 的阶段状态。
- 专业阶段技能完成后，应只更新当前阶段、产物检查、阻塞项和进展记录；如果由 `step-change` 调用，则由 `step-change` 检查产物并同步推进阶段。

## 产物检查

- specs：已完成（`.workflow/changes/align-project-agent-workspace/specs/project-console-navigation/spec.md`、`specs/agent-provider-experience/spec.md`）
- design：已完成（`.workflow/changes/align-project-agent-workspace/design/overview.md`、`design/ui-ux.md`、`design/frontend.md`；显式引用 `docs/design/frontend-ui-architecture.md` 与 provider 长期 specs/design）
- plan/tasks：已完成（`.workflow/changes/align-project-agent-workspace/plan.md`、`tasks.md`；均显式要求读取 `docs/design/frontend-ui-architecture.md`、provider 长期 specs/design 与 prototype `project-detail.html`）
- implementation：已完成（`tasks.md` 中 1.1、2.1、2.2、3.1 已完成；format/lint/web typecheck/test/build 与 browser Agent workspace artifacts 已生成）
- verify：已完成（`.workflow/changes/align-project-agent-workspace/verify.md`；format/lint/web typecheck/test/build 与 desktop/mobile browser Agent workspace harness 通过）
- distill：已完成（已更新 `docs/specs/project-console-navigation/spec.md`、`docs/specs/agent-provider-experience/spec.md`、`docs/design/frontend-ui-architecture.md`、`docs/design/agent-provider-experience.md`、`docs/project.md` 及相关 index）

## 阶段流转

| 阶段 | 完成标志 |
|---|---|
| 待规格 | `specs/` 已补齐可验证 WHAT |
| 待设计 | `design/` 已补齐 HOW 设计 |
| 待计划 | `plan.md` 与 `tasks.md` 已补齐 |
| 待实现 | `tasks.md` 中实现项已完成 |
| 待验证 | `verify.md` 已补齐一致性证据 |
| 待沉淀 | 长期 docs 已按需沉淀 |
| 已完成 | 可随 version 归档 |
| 阻塞 | 阻塞解除后回到对应阶段 |

## 进展记录

- 2026-05-25：通过 plan-roadmap 创建 change 骨架，等待共享 UI shell foundation。
- 2026-05-26：前置 `align-ui-shell-foundation` 已完成，解除局部阻塞；通过 specify-change 创建 `specs/project-console-navigation/spec.md` 与 `specs/agent-provider-experience/spec.md`，明确 Agent instances 主工作区、Claude/Codex 创建入口、provider-aware 当前实例列表、轻量 session history 与移动端直接二级页密度要求；下一阶段进入待设计。
- 2026-05-26：通过 design-change 创建 `design/overview.md`、`design/ui-ux.md` 和 `design/frontend.md`，明确 Agent workspace 的当前实例列表、provider 创建入口、staged history 呈现、真实 DTO 边界和移动端密度规则；下一阶段进入待计划。
- 2026-05-26：通过 plan-change 创建 `plan.md` 与 `tasks.md`，将实现拆为 provider 创建入口、当前 Agent instance list/row、轻量 staged history 和 web/browser 验证四个顺序任务；下一阶段进入待实现。
- 2026-05-26：完成 implement-change，调整 `web/src/routes/ProjectConsoleRoute.tsx` 的 Agent workspace：顶部展示 `+ Claude` / `+ Codex`，当前 Agent instances 使用真实 provider/displayName/status/id 字段，新增 staged session history 区并避免伪造 provider history；完成 `tasks.md` 1.1、2.1、2.2、3.1，并生成 browser artifacts；下一阶段进入待验证。
- 2026-05-26：完成 verify-change，创建 `.workflow/changes/align-project-agent-workspace/verify.md`，确认 format/lint/web typecheck/test/build 与 desktop/mobile browser harness 均通过，Agent instances、provider 创建 pending、staged history 和 Project 二级导航证据完整；下一阶段进入待沉淀。
- 2026-05-26：完成 distill-change，将 Project Agent workspace 的 provider create、current instances、staged history 和真实 DTO 边界沉淀到长期 specs/design/project 文档，并更新 docs index；本 change 已完成。
