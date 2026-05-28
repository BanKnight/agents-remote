# progress

本文件记录单个 change 的当前阶段、局部阻塞和进展记录。`.workflow/versions/index.md` 只指向当前 change，不维护这些状态；阶段到技能的路由由 `step-change` 独占维护。

## Change

- change-id：align-home-project-shell
- 所属 version：v0.8-prototype-ui-alignment
- change 路径：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/

## 当前进度

- 当前阶段：已完成
- 阻塞项：无

## 推进规则

- 本文件是 change 当前阶段、局部阻塞和进展记录的权威来源。
- 本文件不保存“下一步技能”；推荐使用 `step-change` 推进本 change，由它根据当前阶段调用对应阶段技能。
- `.workflow/versions/index.md` 只引用本文件，不维护本 change 的阶段状态。
- 专业阶段技能完成后，应只更新当前阶段、产物检查、阻塞项和进展记录；如果由 `step-change` 调用，则由 `step-change` 检查产物并同步推进阶段。

## 产物检查

- specs：已完成：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/specs/home-project-shell-alignment/spec.md
- design：已完成：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/design/overview.md；design/ui-ux.md；design/frontend.md；design/risks.md
- plan/tasks：已完成：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/plan.md；.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/tasks.md
- implementation：已完成：web/src/routes/HomeRoute.tsx；web/src/routes/ProjectConsoleRoute.tsx；web/src/routes/SessionDetailRoute.tsx；web/src/components/shell/shell-layout.tsx；web/src/components/shell/shell-navigation.tsx；web/src/components/shell/shell-primitives.tsx；web/src/components/ui/button.tsx；web/src/components/ui/badge.tsx；web/src/components/ui/card.tsx；web/src/components/ui/input.tsx；web/src/routes/console-model.ts；web/src/routes/console-model.test.ts；.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/
- verify：已完成：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/verify.md；.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/browser-check.log；Home/Project prototype/app desktop/mobile screenshots
- distill：已完成：docs/design/frontend-ui-architecture.md 已补充本 change 验证证据来源；长期 WHAT/project knowledge 已有等价内容，无需重复更新。

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

- 2026-05-28：由 `plan-versions` 创建，等待共享基线 change 完成后推进。
- 2026-05-28：依赖 `establish-prototype-alignment-baseline` 已完成，局部阻塞解除，可进入 `specify-change`。
- 2026-05-28：`specify-change` 已创建规格 `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/specs/home-project-shell-alignment/spec.md`，当前阶段推进到待设计。
- 2026-05-28：`design-change` 已创建设计 `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/design/overview.md`、`design/ui-ux.md`、`design/frontend.md`、`design/risks.md`，当前阶段推进到待计划。
- 2026-05-28：`plan-change` 已创建 `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/plan.md` 与 `tasks.md`，当前阶段推进到待实现。
- 2026-05-28：`implement-change` 已完成 Home/Projects 与 Project Agent workspace UI 对齐、相关前端检查和 browser artifacts 采集；未发现需要更新 shared gaps 或 shared baseline 的阻塞差异，当前阶段推进到待验证。
- 2026-05-28：`verify-change` 已创建 `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/verify.md`，结论通过，无 CRITICAL/WARNING，当前阶段推进到待沉淀。
- 2026-05-28：`distill-change` 已完成；`docs/design/frontend-ui-architecture.md` 补充本 change 验证证据来源，长期 WHAT/project knowledge 已有等价内容无需重复更新，当前阶段推进到已完成。
- 2026-05-28：根据复用边界复盘，将 route-local `shell-primitives.tsx` 提升为 `web/src/components/shell/shell-primitives.tsx` 轻量组件库入口，并同步 Home/Project/Session detail imports、shared design-system note、长期 frontend UI architecture 与 Round 2 verify；前端 tests/typecheck/build/browser artifacts 均通过，当前阶段保持已完成。
- 2026-05-28：按用户要求重做 verify Round 3，不复用旧截图结论；重新执行 console model tests、web tests、typecheck、build、browser artifact capture，并人工打开本轮 prototype/app desktop/mobile 截图对照，结论通过，无 CRITICAL/WARNING。
- 2026-05-28：根据 desktop 原型复查修正 shell layout：桌面左/右区域贴合为连续外壳，右侧 workspace 分成 header/content，上层主按钮恢复 cyan-violet primary action；重新执行 typecheck、web tests、console-model tests、build 和 browser artifact capture，verify Round 4 通过。
- 2026-05-28：反思组件/布局/shadcn 抽象遗漏风险，更新 shared `design-system-note.md` 的 Implementation Review Gate，要求后续 React/prototype UI change 在改 route JSX 前先识别 layout/navigation/surface/control 边界并说明 shadcn source wrapper 消费关系。
