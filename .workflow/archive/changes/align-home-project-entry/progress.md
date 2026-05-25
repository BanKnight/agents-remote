# progress

本文件记录单个 change 的当前阶段、局部阻塞和进展记录。`roadmap.md` 只指向当前 change，不维护这些状态；阶段到技能的路由由 `step-change` 独占维护。

## Change

- change-id：align-home-project-entry
- 所属 version：v0.8-prototype-ui-alignment
- change 路径：.workflow/changes/align-home-project-entry/

## 当前进度

- 当前阶段：已完成
- 阻塞项：无

## 推进规则

- 本文件是 change 当前阶段、局部阻塞和进展记录的权威来源。
- 本文件不保存“下一步技能”；推荐使用 `step-change` 推进本 change，由它根据当前阶段调用对应阶段技能。
- `roadmap.md` 只引用本文件，不维护本 change 的阶段状态。
- 专业阶段技能完成后，应只更新当前阶段、产物检查、阻塞项和进展记录；如果由 `step-change` 调用，则由 `step-change` 检查产物并同步推进阶段。

## 产物检查

- specs：已完成（`.workflow/changes/align-home-project-entry/specs/project-console-navigation/spec.md`）
- design：已完成（`.workflow/changes/align-home-project-entry/design/overview.md`、`design/ui-ux.md`、`design/frontend.md`；显式引用 `docs/design/frontend-ui-architecture.md`）
- plan/tasks：已完成（`.workflow/changes/align-home-project-entry/plan.md`、`tasks.md`；均显式要求读取 `docs/design/frontend-ui-architecture.md`、prototype guidelines 与 `home.html`）
- implementation：已完成（`tasks.md` 中 1.1、2.1、3.1 已完成；format/lint/web typecheck/test/build 与 browser Home entry artifacts 已生成）
- verify：已完成（`.workflow/changes/align-home-project-entry/verify.md`；结论通过，无 CRITICAL）
- distill：已完成（已合并长期 WHAT 到 `docs/specs/project-console-navigation/spec.md`，更新 `docs/design/frontend-ui-architecture.md`、`docs/specs/index.md`、`docs/design/index.md` 与 `docs/project.md`）

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
- 2026-05-26：前置 `align-ui-shell-foundation` 已完成，解除局部阻塞；通过 specify-change 创建 `specs/project-console-navigation/spec.md`，明确 Home / Project entry 一级 shell、克制顶部文案、Project 图标列表、低频创建/采用入口和默认进入 Agent workspace 的可验证 WHAT；下一阶段进入待设计。
- 2026-05-26：通过 design-change 创建 `design/overview.md`、`design/ui-ux.md` 和 `design/frontend.md`，以 `docs/design/frontend-ui-architecture.md`、prototype guidelines 和 `home.html` 为上下文，明确 Home / Project entry 的信息层级、响应式结构、前端状态边界和实现约束；下一阶段进入待计划。
- 2026-05-26：通过 plan-change 创建 `plan.md` 与 `tasks.md`，将实现拆为 Home 一级 Projects workspace 信息层级、Project entry/低频 Create-adopt 入口和 web/browser 验证三个顺序任务；下一阶段进入待实现。
- 2026-05-26：完成 implement-change，调整 `web/src/routes/HomeRoute.tsx` 使 Home Project entry 更贴近 prototype：Project 列表优先、顶部文案更克制、Create/adopt 降级为低频面板、Project entry 默认进入 Agent workspace；完成 `tasks.md` 1.1、2.1、3.1，并生成 browser artifacts；下一阶段进入待验证。
- 2026-05-26：完成 verify-change，创建 `verify.md` 并记录 format/lint/web typecheck/test/build、browser Home entry harness、桌面端与移动端截图证据；结论通过，无 CRITICAL；下一阶段进入待沉淀。
- 2026-05-26：完成 distill-change，将 Home / Project entry 的长期 WHAT 合并到 `docs/specs/project-console-navigation/spec.md`，将 Project entry 列表优先与低频 Create/adopt 规则补充到 `docs/design/frontend-ui-architecture.md` 与 `docs/project.md`，并更新 specs/design 索引；本 change 已完成。
