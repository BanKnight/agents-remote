# progress

本文件记录单个 change 的当前阶段、局部阻塞和进展记录。`roadmap.md` 只指向当前 change，不维护这些状态；阶段到技能的路由由 `step-change` 独占维护。

## Change

- change-id：align-instance-detail-workspaces
- 所属 version：v0.8-prototype-ui-alignment
- change 路径：.workflow/changes/align-instance-detail-workspaces/

## 当前进度

- 当前阶段：已完成
- 阻塞项：无

## 推进规则

- 本文件是 change 当前阶段、局部阻塞和进展记录的权威来源。
- 本文件不保存“下一步技能”；推荐使用 `step-change` 推进本 change，由它根据当前阶段调用对应阶段技能。
- `roadmap.md` 只引用本文件，不维护本 change 的阶段状态。
- 专业阶段技能完成后，应只更新当前阶段、产物检查、阻塞项和进展记录；如果由 `step-change` 调用，则由 `step-change` 检查产物并同步推进阶段。

## 产物检查

- specs：已完成（`.workflow/changes/align-instance-detail-workspaces/specs/mobile-session-interaction/spec.md`、`specs/project-console-navigation/spec.md`）
- design：已完成（`.workflow/changes/align-instance-detail-workspaces/design/overview.md`、`design/ui-ux.md`、`design/frontend.md`；明确 terminal-first detail、Agent contextual tools、Terminal focused shell、移动端 input drawer 与 contextual resource 边界）
- plan/tasks：已完成（`.workflow/changes/align-instance-detail-workspaces/plan.md`、`tasks.md`；明确 terminal-first chrome、Agent tools/Meta/+Terminal、contextual Files/Git、mobile drawer 和 browser verification 任务顺序）
- implementation：已完成（`web/src/routes/SessionDetailRoute.tsx` 已完成 terminal-first detail、Agent-only tools/Meta/+Terminal、contextual Files/Git、mobile drawer；浏览器证据位于 `.workflow/changes/align-instance-detail-workspaces/artifacts/browser-instance-detail/`）
- verify：已完成（`.workflow/changes/align-instance-detail-workspaces/verify.md`；web 门禁与 browser instance detail artifacts 通过，无 CRITICAL/WARNING）
- distill：已完成（已更新 `docs/specs/mobile-session-interaction/spec.md`、`docs/specs/project-console-navigation/spec.md`、`docs/design/frontend-ui-architecture.md`、`docs/design/mobile-session-interaction.md`、`docs/project.md`）

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

- 2026-05-25：通过 plan-roadmap 创建 change 骨架，等待共享 UI shell foundation 和 Agent workspace 对齐。
- 2026-05-26：前置 `align-ui-shell-foundation` 与 `align-project-agent-workspace` 已完成，解除局部阻塞；下一阶段进入待规格。
- 2026-05-26：通过 specify-change 创建 `specs/mobile-session-interaction/spec.md` 与 `specs/project-console-navigation/spec.md`，明确 Agent/Terminal detail 的 terminal-first 工作区、Agent contextual tools/Meta、Terminal focused shell、移动端 input drawer/quick keys 与深层 detail 返回模型；下一阶段进入待设计。
- 2026-05-26：通过 design-change 创建 `design/overview.md`、`design/ui-ux.md` 和 `design/frontend.md`，明确 `SessionDetailRoute` 的 terminal-first chrome、Agent-only Files/Git/+Terminal/Meta tools、Terminal focused shell、移动端 drawer 和不扩展后端协议的前端边界；下一阶段进入待计划。
- 2026-05-26：通过 plan-change 创建 `plan.md` 与 `tasks.md`，将实现拆为 terminal-first detail chrome、Agent-only tools/Meta/+Terminal、contextual Files/Git、mobile drawer/quick keys 和 browser verification；下一阶段进入待实现。
- 2026-05-26：通过 implement-change 完成全部实现任务：terminal-first detail chrome、Agent-only Files/Git/+Terminal/Meta、contextual Files/Git 只读视图、mobile drawer/quick keys，并运行 web 门禁与浏览器检查；下一阶段进入待验证。
- 2026-05-26：通过 verify-change 创建 `verify.md`，确认 web 门禁、桌面/移动浏览器截图、Agent tools、Meta、Files/Git、+Terminal source context、Terminal focused shell 与 drawer 场景均通过；下一阶段进入待沉淀。
- 2026-05-26：通过 distill-change 将 instance detail deep page、Agent contextual tools、Terminal focused shell、source return 和 mobile drawer 规则沉淀到长期 specs/design/project docs；change 已完成。
