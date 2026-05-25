# progress

本文件记录单个 change 的当前阶段、局部阻塞和进展记录。`roadmap.md` 只指向当前 change，不维护这些状态；阶段到技能的路由由 `step-change` 独占维护。

## Change

- change-id：align-mobile-app-shell
- 所属 version：v0.5-mobile-ux-polish
- change 路径：.workflow/changes/align-mobile-app-shell/

## 当前进度

- 当前阶段：已完成
- 阻塞项：无

## 推进规则

- 本文件是 change 当前阶段、局部阻塞和进展记录的权威来源。
- 本文件不保存“下一步技能”；推荐使用 `step-change` 推进本 change，由它根据当前阶段调用对应阶段技能。
- `roadmap.md` 只引用本文件，不维护本 change 的阶段状态。
- 专业阶段技能完成后，应只更新当前阶段、产物检查、阻塞项和进展记录；如果由 `step-change` 调用，则由 `step-change` 检查产物并同步推进阶段。

## 产物检查

- specs：已完成（`.workflow/changes/align-mobile-app-shell/specs/mobile-console-shell/spec.md`）
- design：已完成（`.workflow/changes/align-mobile-app-shell/design/overview.md`、`product.md`、`ui-ux.md`、`frontend.md`）
- plan/tasks：已完成（`.workflow/changes/align-mobile-app-shell/plan.md`、`.workflow/changes/align-mobile-app-shell/tasks.md`）
- implementation：已完成（`tasks.md` 全部实现任务已勾选；核心代码更新 `web/src/styles/index.css`、`web/src/routes/HomeRoute.tsx`、`web/src/routes/ProjectConsoleRoute.tsx`）
- verify：已完成（`.workflow/changes/align-mobile-app-shell/verify.md`，结论：通过；artifact：`artifacts/mobile-home.png`、`mobile-home-api.log`、`mobile-home-web.log`）
- distill：已完成（更新 `docs/specs/pwa-console-shell/spec.md`、`docs/design/console-shell.md`、`docs/project.md`；未新增 docs 文件，无需更新索引）

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

- 2026-05-25：plan-roadmap 创建 change，承接移动端 App-like shell、全局溢出、原型参考和首页低频入口收敛意图。
- 2026-05-25：specify-change 创建 `specs/mobile-console-shell/spec.md`，明确移动端 App-like shell、视口不溢出、原型术语映射和首页低频入口收敛的可验证 WHAT；下一阶段进入待设计。
- 2026-05-25：design-change 创建 `design/overview.md`、`design/product.md`、`design/ui-ux.md`、`design/frontend.md`，明确首页主路径、App-like shell、移动端溢出基线和前端落地边界；下一阶段进入待计划。
- 2026-05-25：plan-change 创建 `plan.md` 与 `tasks.md`，明确全局 shell 基线、首页重排、Project console 对齐和浏览器验证任务；下一阶段进入待实现。
- 2026-05-25：implement-change 完成 `tasks.md` 全部任务，更新全局 `dvh`/overflow 基线、首页 Project 主路径与可展开 Create/Adopt 入口、Project console shell 对齐，并生成移动首页截图 artifact；下一阶段进入待验证。
- 2026-05-25：verify-change 创建 `verify.md`，通过 format/lint/typecheck/test/build 与移动浏览器 smoke，记录截图和服务日志 artifact，无 CRITICAL/WARNING；下一阶段进入待沉淀。
- 2026-05-25：distill-change 将已验证移动 shell WHAT/HOW/project knowledge 合并到 `docs/specs/pwa-console-shell/spec.md`、`docs/design/console-shell.md` 和 `docs/project.md`；本 change 已完成。
