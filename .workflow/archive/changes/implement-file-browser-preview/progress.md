# progress

本文件记录单个 change 的当前阶段、局部阻塞和进展记录。`roadmap.md` 只指向当前 change，不维护这些状态；阶段到技能的路由由 `step-change` 独占维护。

## Change

- change-id：implement-file-browser-preview
- 所属 version：v0.4-project-inspection-tools
- change 路径：.workflow/changes/implement-file-browser-preview/

## 当前进度

- 当前阶段：已完成
- 阻塞项：（无）

## 推进规则

- 本文件是 change 当前阶段、局部阻塞和进展记录的权威来源。
- 本文件不保存“下一步技能”；推荐使用 `step-change` 推进本 change，由它根据当前阶段调用对应阶段技能。
- `roadmap.md` 只引用本文件，不维护本 change 的阶段状态。
- 专业阶段技能完成后，应只更新当前阶段、产物检查、阻塞项和进展记录；如果由 `step-change` 调用，则由 `step-change` 检查产物并同步推进阶段。

## 产物检查

- specs：已完成（`specs/file-browser-preview/spec.md`）
- design：已完成（`design/overview.md`、`design/architecture.md`、`design/api.md`、`design/frontend.md`、`design/ui-ux.md`、`design/error-handling.md`）
- plan/tasks：已完成（`plan.md`、`tasks.md`）
- implementation：已完成（shared Files DTO/error codes、API Files service/routes、web API client、Project console Files UI、Files E2E fixture/spec、质量门禁）
- verify：已完成（`verify.md`，结论：通过；无 CRITICAL/WARNING）
- distill：已完成（`docs/specs/file-browser-preview/spec.md`、`docs/design/file-browser-preview.md`、`docs/architecture/file-browser-preview.md`）

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

- 已进入 roadmap，完整来源见 `intents.md`。
- 2026-05-25：`specify-change` 完成，创建 `specs/file-browser-preview/spec.md`；明确 Files 第一轮为只读目录浏览、project-safe 相对路径、隐藏条目展示、目录优先和名称排序、文本大小上限与移动端纯文本预览、常见 Web 图片格式预览和不支持类型/过大提示，下一阶段为 `待设计`。
- 2026-05-25：`design-change` 完成，创建 `design/overview.md`、`design/architecture.md`、`design/api.md`、`design/frontend.md`、`design/ui-ux.md` 和 `design/error-handling.md`；确定 Files 作为 Project console 只读观察入口，复用 Project safe path resolver，新增目录列表/预览 API、shared DTO、移动端列表+同页预览、bounded text/image preview 和错误恢复语义，下一阶段为 `待计划`。
- 2026-05-25：`plan-change` 完成，创建 `plan.md`、`tasks.md`；实现顺序为 shared DTO/error code、API Files service/route、web API client、Project console Files UI、Files E2E 和质量门禁，下一阶段为 `待实现`.
- 2026-05-25：`implement-change` 完成，新增 shared Files DTO/error codes、`api/src/project-files.ts` 与测试、Project Files HTTP routes、web Files API client、Project console Files UI、E2E fixture/spec；`bun run e2e` 通过，`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build` 通过，下一阶段为 `待验证`。
- 2026-05-25：`verify-change` 完成，创建 `verify.md`；Trace/Delta/Scenario/Evidence 覆盖只读浏览、Project-safe path、hidden entries、目录优先和名称排序、bounded text/image preview、unsupported/too-large/error states 与 Project console integration，`bun run e2e` 和完整质量门禁均通过，无 CRITICAL/WARNING，下一阶段为 `待沉淀`。
- 2026-05-25：`distill-change` 完成，新增 `docs/specs/file-browser-preview/spec.md`、`docs/specs/file-browser-preview/index.md`、`docs/design/file-browser-preview.md` 和 `docs/architecture/file-browser-preview.md`，并更新 `docs/specs/index.md`、`docs/design/index.md`、`docs/architecture/index.md`；长期 WHAT/HOW/architecture 已按 verify 证据沉淀，本 change 当前阶段为 `已完成`。
