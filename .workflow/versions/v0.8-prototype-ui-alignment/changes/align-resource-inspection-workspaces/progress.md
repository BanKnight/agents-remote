# progress

本文件记录单个 change 的当前阶段、局部阻塞和进展记录。`.workflow/versions/index.md` 只指向当前 change，不维护这些状态；阶段到技能的路由由 `step-change` 独占维护。

## Change

- change-id：align-resource-inspection-workspaces
- 所属 version：v0.8-prototype-ui-alignment
- change 路径：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/

## 当前进度

- 当前阶段：已完成
- 阻塞项：无

## 推进规则

- 本文件是 change 当前阶段、局部阻塞和进展记录的权威来源。
- 本文件不保存“下一步技能”；推荐使用 `step-change` 推进本 change，由它根据当前阶段调用对应阶段技能。
- `.workflow/versions/index.md` 只引用本文件，不维护本 change 的阶段状态。
- 专业阶段技能完成后，应只更新当前阶段、产物检查、阻塞项和进展记录；如果由 `step-change` 调用，则由 `step-change` 检查产物并同步推进阶段。

## 产物检查

- specs：已完成：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/specs/resource-inspection-workspaces/spec.md
- design：已完成：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/design/overview.md；design/ui-ux.md；design/frontend.md；design/risks.md
- plan/tasks：已完成：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/plan.md；.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/tasks.md
- implementation：已完成：`web/src/routes/ProjectConsoleRoute.tsx`；`web/src/components/shell/shell-primitives.tsx`；`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/artifacts/`
- verify：已完成：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/verify.md
- distill：已完成：docs/design/frontend-ui-architecture.md；docs/design/console-shell.md；docs/design/file-browser-preview.md；docs/design/git-diff-viewer.md

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

- 2026-05-28：由 `plan-versions` 创建，等待共享基线、Home/Project shell 和 runtime detail changes 后推进。
- 2026-05-29：依赖 `establish-prototype-alignment-baseline`、`align-home-project-shell` 与 `align-runtime-detail-workspaces` 已完成；`specify-change` 已创建 `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/specs/resource-inspection-workspaces/spec.md`，当前阶段推进到待设计。
- 2026-05-29：`design-change` 已创建设计 `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/design/overview.md`、`design/ui-ux.md`、`design/frontend.md`、`design/risks.md`，当前阶段推进到待计划。
- 2026-05-29：`plan-change` 已创建 `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/plan.md` 与 `tasks.md`，当前阶段推进到待实现。
- 2026-05-29：`implement-change` 已完成 resource workspace 实现任务 1.1、2.1、2.2、2.3、2.4、3.1、3.2、3.3；Files/Git/Terminal workspace 已收敛到 shared shell/action/list/status 语言，Files/Git mobile direct/deep navigation 互斥已验证，Terminal workspace 未渲染 runtime input/output/quick keys；检查命令 `bun run --cwd web typecheck`、`bun test web/src/routes/console-model.test.ts`、`git diff --check` 均通过；artifacts 位于 `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/artifacts/`，`browser-check.log` 无 blocking difference；无新增 follow-up gap，当前阶段推进到待验证。
- 2026-05-29：`verify-change` 已创建 `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/verify.md`；验证覆盖 typecheck、focused test、diff whitespace、prototype/app desktop/mobile screenshots、Files/Git mobile deep detail、Terminal Close confirm 和 browser-check 结构断言，结论通过，当前阶段推进到待沉淀。
- 2026-05-29：`distill-change` 已完成长期沉淀；长期 WHAT 已由现有 Files/Git/Session specs 覆盖，本轮仅将已验证的 resource workspace 证据补充到 `docs/design/frontend-ui-architecture.md`、`docs/design/console-shell.md`、`docs/design/file-browser-preview.md`、`docs/design/git-diff-viewer.md` 的来源记录；无新增 runbook/project.md 更新需求，当前阶段推进到已完成。
