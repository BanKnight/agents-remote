# progress

本文件记录单个 change 的当前阶段、局部阻塞和进展记录。`roadmap.md` 只指向当前 change，不维护这些状态；阶段到技能的路由由 `step-change` 独占维护。

## Change

- change-id：align-resource-inspection-pages
- 所属 version：v0.8-prototype-ui-alignment
- change 路径：.workflow/changes/align-resource-inspection-pages/

## 当前进度

- 当前阶段：已完成
- 阻塞项：无

## 推进规则

- 本文件是 change 当前阶段、局部阻塞和进展记录的权威来源。
- 本文件不保存“下一步技能”；推荐使用 `step-change` 推进本 change，由它根据当前阶段调用对应阶段技能。
- `roadmap.md` 只引用本文件，不维护本 change 的阶段状态。
- 专业阶段技能完成后，应只更新当前阶段、产物检查、阻塞项和进展记录；如果由 `step-change` 调用，则由 `step-change` 检查产物并同步推进阶段。

## 产物检查

- specs：已完成（`.workflow/changes/align-resource-inspection-pages/specs/file-browser-preview/spec.md`、`specs/git-diff-viewer/spec.md`、`specs/session-runtime/spec.md`）
- design：已完成（`.workflow/changes/align-resource-inspection-pages/design/overview.md`、`design/ui-ux.md`、`design/frontend.md`；明确 Files/Git/Terminal 直接二级页、mobile deep preview/diff、只读边界和 Terminal list/detail 分离）
- plan/tasks：已完成（`.workflow/changes/align-resource-inspection-pages/plan.md`、`tasks.md`；明确 resource deep shell 状态、Files/Git mobile deep detail、Terminal workspace 和 browser verification 顺序）
- implementation：已完成（完成 `tasks.md` 1.1、2.1、2.2、2.3、3.1；新增 resource workspace browser harness 与截图/日志 artifacts）
- verify：已完成（`.workflow/changes/align-resource-inspection-pages/verify.md`；web 门禁与 resource browser harness 均通过，截图/日志 artifacts 已保存）
- distill：已完成（已更新 `docs/specs/file-browser-preview/spec.md`、`docs/specs/git-diff-viewer/spec.md`、`docs/specs/session-runtime/spec.md`、`docs/design/frontend-ui-architecture.md`、`docs/design/file-browser-preview.md`、`docs/design/git-diff-viewer.md`、`docs/design/console-shell.md`、`docs/project.md` 与相关 index）

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
- 2026-05-26：前置 `align-ui-shell-foundation` 已完成，解除局部阻塞；下一阶段进入待规格。
- 2026-05-26：通过 specify-change 创建 Files、Git、Terminal workspace 三个 spec 增量，明确直接二级页、深层 preview/diff/detail、只读边界和移动端导航模型；下一阶段进入待设计。
- 2026-05-26：通过 design-change 创建 `design/overview.md`、`design/ui-ux.md` 和 `design/frontend.md`，明确直接二级 resource workspace、mobile preview/diff deep detail、Terminal instances list 与不扩展 API/DTO 的前端边界；下一阶段进入待计划。
- 2026-05-26：通过 distill-change 将已验证的 resource workspace 行为沉淀到长期 specs/design/project docs；本 change 已完成，可随 version 归档。
