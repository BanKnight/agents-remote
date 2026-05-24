# progress

本文件记录单个 change 的当前阶段、局部阻塞和进展记录。`roadmap.md` 只指向当前 change，不维护这些状态；阶段到技能的路由由 `step-change` 独占维护。

## Change

- change-id：setup-e2e-quality-baseline
- 所属 version：v0.3-session-runtime-quality
- change 路径：.workflow/changes/setup-e2e-quality-baseline/

## 当前进度

- 当前阶段：已完成
- 阻塞项：（无）

## 推进规则

- 本文件是 change 当前阶段、局部阻塞和进展记录的权威来源。
- 本文件不保存“下一步技能”；推荐使用 `step-change` 推进本 change，由它根据当前阶段调用对应阶段技能。
- `roadmap.md` 只引用本文件，不维护本 change 的阶段状态。
- 专业阶段技能完成后，应只更新当前阶段、产物检查、阻塞项和进展记录；如果由 `step-change` 调用，则由 `step-change` 检查产物并同步推进阶段。

## 产物检查

- specs：已完成（`specs/e2e-quality-baseline/spec.md`）
- design：已完成（`design/overview.md`、`design/architecture.md`、`design/error-handling.md`）
- plan/tasks：已完成（`plan.md`、`tasks.md`）
- implementation：已完成（Playwright Test harness、Bun E2E runner、Terminal Session smoke spec、root `e2e` 命令、E2E artifacts 与扩展 quality checks）
- verify：已完成（`verify.md`，结论：通过；无 CRITICAL/WARNING）
- distill：已完成（`docs/specs/e2e-quality-baseline/spec.md`、`docs/architecture/e2e-quality-baseline.md`、`docs/runbooks/e2e-quality-baseline.md`）

## 阶段流转

| 阶段   | 完成标志                       |
| ------ | ------------------------------ |
| 待规格 | `specs/` 已补齐可验证 WHAT     |
| 待设计 | `design/` 已补齐 HOW 设计      |
| 待计划 | `plan.md` 与 `tasks.md` 已补齐 |
| 待实现 | `tasks.md` 中实现项已完成      |
| 待验证 | `verify.md` 已补齐一致性证据   |
| 待沉淀 | 长期 docs 已按需沉淀           |
| 已完成 | 可随 version 归档              |
| 阻塞   | 阻塞解除后回到对应阶段         |

## 进展记录

- 已进入 roadmap，完整来源见 `intents.md`。
- 2026-05-25：`specify-change` 完成，创建 `specs/e2e-quality-baseline/spec.md`；明确 E2E baseline 必须覆盖登录、Project 列表、进入 Project、创建 Terminal Session、打开 detail、真实 tmux/WebSocket runtime、确定性输入输出、失败 artifacts 和可持续命令入口，下一阶段为 `待设计`。
- 2026-05-25：`design-change` 完成，创建 `design/overview.md`、`design/architecture.md`、`design/error-handling.md`；经 technology-research 核对后选择 Playwright Test + Bun orchestration 作为第一轮 E2E harness，Terminal path 使用真实 tmux/shell/WebSocket，失败 evidence 包含 Playwright artifacts 与 api/web logs，下一阶段为 `待计划`。
- 2026-05-25：`plan-change` 完成，创建 `plan.md`、`tasks.md`；实现顺序为 Playwright dependency/config、Bun E2E runner、Terminal Session smoke spec、root e2e 命令、E2E/quality gate 和 workflow 收口，下一阶段为 `待实现`。
- 2026-05-25：`implement-change` 完成，新增 `@playwright/test@1.60.0`、`playwright.config.ts`、`scripts/run-e2e.ts`、`e2e/terminal-session.spec.ts` 和 `tsconfig.e2e.json`，root `e2e` 命令可自动准备临时 Project/runtime、启动 api/web、运行真实 tmux/WebSocket Terminal smoke 并保存 api/web logs；`bun run e2e` 通过，`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build` 通过，下一阶段为 `待验证`。
- 2026-05-25：`verify-change` 完成，创建 `verify.md`；Trace/Delta/Scenario/Evidence 覆盖登录、Project、Terminal Session 创建、Session Detail、真实 tmux/WebSocket 输入输出、failure artifacts 和 root `e2e` 质量入口，`bun run e2e` 与完整质量门禁均通过，无 CRITICAL/WARNING，下一阶段为 `待沉淀`。
- 2026-05-25：`distill-change` 完成，新增 `docs/specs/e2e-quality-baseline/spec.md`、`docs/specs/e2e-quality-baseline/index.md`、`docs/architecture/e2e-quality-baseline.md` 和 `docs/runbooks/e2e-quality-baseline.md`，并更新 `docs/specs/index.md`、`docs/architecture/index.md`、`docs/runbooks/index.md`；长期 WHAT/HOW/runbook 已按 verify 证据沉淀，本 change 当前阶段为 `已完成`。
