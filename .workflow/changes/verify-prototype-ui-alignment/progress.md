# progress

本文件记录单个 change 的当前阶段、局部阻塞和进展记录。`roadmap.md` 只指向当前 change，不维护这些状态；阶段到技能的路由由 `step-change` 独占维护。

## Change

- change-id：verify-prototype-ui-alignment
- 所属 version：v0.8-prototype-ui-alignment
- change 路径：.workflow/changes/verify-prototype-ui-alignment/

## 当前进度

- 当前阶段：已完成
- 阻塞项：无

## 推进规则

- 本文件是 change 当前阶段、局部阻塞和进展记录的权威来源。
- 本文件不保存“下一步技能”；推荐使用 `step-change` 推进本 change，由它根据当前阶段调用对应阶段技能。
- `roadmap.md` 只引用本文件，不维护本 change 的阶段状态。
- 专业阶段技能完成后，应只更新当前阶段、产物检查、阻塞项和进展记录；如果由 `step-change` 调用，则由 `step-change` 检查产物并同步推进阶段。

## 产物检查

- specs：已完成（`.workflow/changes/verify-prototype-ui-alignment/specs/prototype-ui-alignment/spec.md`）
- design：已完成（`.workflow/changes/verify-prototype-ui-alignment/design/overview.md`、`design/ui-ux.md`、`design/frontend.md`）
- plan/tasks：已完成（`.workflow/changes/verify-prototype-ui-alignment/plan.md`、`tasks.md`）
- implementation：已完成（新增 `.workflow/changes/verify-prototype-ui-alignment/artifacts/prototype-ui-alignment-check.ts` 与 `artifacts/prototype-ui-alignment/` 截图/日志）
- verify：已完成（`.workflow/changes/verify-prototype-ui-alignment/verify.md`；web 门禁与 prototype alignment browser harness 均通过）
- distill：已完成（已更新 `docs/design/frontend-ui-architecture.md`，沉淀最终 prototype alignment 验证规则和证据来源；docs index 无需变更）

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

- 2026-05-25：通过 plan-roadmap 创建 change 骨架，作为 v0.8 prototype UI alignment 的收口验证 change。
- 2026-05-26：前置 Home、Project Agent workspace、instance detail 和 resource pages changes 均已完成，解除局部阻塞；补齐 specs/design/plan/tasks，下一阶段进入待实现。
- 2026-05-26：完成最终 prototype alignment browser harness，生成 Home、Project Agent workspace、Agent/Terminal detail、Files/Git/Terminal resource workspaces 的 desktop/mobile 截图与 web/mock API/harness logs；web format/lint/typecheck/test/build 与 harness 均通过，`verify.md` 结论通过；沉淀验证规则到 `docs/design/frontend-ui-architecture.md`，本 change 收口为已完成。
