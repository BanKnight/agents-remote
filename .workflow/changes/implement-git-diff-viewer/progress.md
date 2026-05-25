# progress

本文件记录单个 change 的当前阶段、局部阻塞和进展记录。`roadmap.md` 只指向当前 change，不维护这些状态；阶段到技能的路由由 `step-change` 独占维护。

## Change

- change-id：implement-git-diff-viewer
- 所属 version：v0.4-project-inspection-tools
- change 路径：.workflow/changes/implement-git-diff-viewer/

## 当前进度

- 当前阶段：已完成
- 阻塞项：（无）

## 推进规则

- 本文件是 change 当前阶段、局部阻塞和进展记录的权威来源。
- 本文件不保存“下一步技能”；推荐使用 `step-change` 推进本 change，由它根据当前阶段调用对应阶段技能。
- `roadmap.md` 只引用本文件，不维护本 change 的阶段状态。
- 专业阶段技能完成后，应只更新当前阶段、产物检查、阻塞项和进展记录；如果由 `step-change` 调用，则由 `step-change` 检查产物并同步推进阶段。

## 产物检查

- specs：已完成（`specs/git-diff-viewer/spec.md`）
- design：已完成（`design/overview.md`、`design/architecture.md`、`design/api.md`、`design/frontend.md`、`design/ui-ux.md`、`design/error-handling.md`）
- plan/tasks：已完成（`plan.md`、`tasks.md`）
- implementation：已完成
- verify：已完成（`verify.md`，结论：通过；无 CRITICAL/WARNING）
- distill：已完成（`docs/specs/git-diff-viewer/spec.md`、`docs/design/git-diff-viewer.md`、`docs/architecture/git-diff-viewer.md`）

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
- 2026-05-25：`specify-change` 完成，创建 `specs/git-diff-viewer/spec.md`；明确 Git diff viewer 第一轮为只读观察入口，覆盖非 Git 仓库提示、worktree/staged 变更文件列表、modified/added/deleted/renamed 状态、单文件 unified diff、移动端文本布局和 Project-scoped 安全边界，下一阶段为 `待设计`。
- 2026-05-25：`design-change` 完成，创建 `design/overview.md`、`design/architecture.md`、`design/api.md`、`design/frontend.md`、`design/ui-ux.md` 和 `design/error-handling.md`；确定 Git diff viewer 作为 Project console 只读观察入口，使用 Project-safe path、Git CLI 只读命令、worktree/staged DTO、单文件 unified diff、移动端列表+同页 diff panel 和非 Git 仓库/错误恢复语义，下一阶段为 `待计划`。
- 2026-05-25：`plan-change` 完成，创建 `plan.md`、`tasks.md`；实现顺序为 shared Git diff DTO/error codes、API Git diff service/route、web API client、Project console Git diff UI、Git diff E2E 和质量门禁，下一阶段为 `待实现`。
- 2026-05-25：`implement-change` 完成；实现 shared Git diff DTO/error codes、ProjectGitDiffService 与 HTTP route、web API client、Project console Git diff UI 和 Playwright E2E 覆盖；focused tests、`bun run e2e`、`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build` 均通过，下一阶段为 `待验证`。
- 2026-05-25：`verify-change` 完成，创建 `verify.md`；Trace/Delta/Scenario/Evidence 覆盖只读 Git diff viewer、非 Git 仓库、worktree/staged/untracked 列表、basic status、single-file unified diff、Project-safe access 和 UI/E2E 回归，focused tests、`bun run e2e`、完整质量门禁均通过，无 CRITICAL/WARNING，下一阶段为 `待沉淀`。
- 2026-05-25：`distill-change` 完成，新增 `docs/specs/git-diff-viewer/spec.md`、`docs/specs/git-diff-viewer/index.md`、`docs/design/git-diff-viewer.md` 和 `docs/architecture/git-diff-viewer.md`，并更新 `docs/specs/index.md`、`docs/design/index.md`、`docs/architecture/index.md`；长期 WHAT/HOW 已按 verify 证据沉淀，本 change 当前阶段为 `已完成`。
