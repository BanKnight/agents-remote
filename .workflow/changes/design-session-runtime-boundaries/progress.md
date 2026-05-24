# progress

本文件记录单个 change 的当前阶段、局部阻塞和进展记录。`roadmap.md` 只指向当前 change，不维护这些状态；阶段到技能的路由由 `step-change` 独占维护。

## Change

- change-id：design-session-runtime-boundaries
- 所属 version：v0.3-session-runtime-quality
- change 路径：.workflow/changes/design-session-runtime-boundaries/

## 当前进度

- 当前阶段：已完成
- 阻塞项：（无）

## 推进规则

- 本文件是 change 当前阶段、局部阻塞和进展记录的权威来源。
- 本文件不保存“下一步技能”；推荐使用 `step-change` 推进本 change，由它根据当前阶段调用对应阶段技能。
- `roadmap.md` 只引用本文件，不维护本 change 的阶段状态。
- 专业阶段技能完成后，应只更新当前阶段、产物检查、阻塞项和进展记录；如果由 `step-change` 调用，则由 `step-change` 检查产物并同步推进阶段。

## 产物检查

- specs：已完成（`specs/session-runtime/spec.md`）
- design：已完成（`design/overview.md`、`design/product.md`、`design/architecture.md`、`design/api.md`、`design/data.md`、`design/business-rules.md`、`design/error-handling.md`、`design/risks.md`）
- plan/tasks：已完成（`plan.md`、`tasks.md`）
- implementation：已完成（shared/api/web session runtime 实现、自动化测试、质量门禁与 tmux/agent-browser E2E）
- verify：已完成（`verify.md`，结论：通过，无未解决 CRITICAL）
- distill：已完成（`docs/specs/session-runtime/spec.md`、`docs/design/session-runtime-boundaries.md`、`docs/architecture/session-runtime.md`、`docs/project.md`）

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
- 2026-05-25：`specify-change` 完成，创建 `specs/session-runtime/spec.md`；已消费 `research-agent-access-options` 的长期调研结论和 Agent Runtime 长期设计边界，下一阶段为 `待设计`。
- 2026-05-25：`design-change` 完成，创建 `design/overview.md`、`design/product.md`、`design/architecture.md`、`design/api.md`、`design/data.md`、`design/business-rules.md`、`design/error-handling.md`、`design/risks.md`；定义 Agent/Terminal/transport/runtime metadata、HTTP/WS、reconnect 和 close 边界，下一阶段为 `待计划`。
- 2026-05-25：`implement-change` 完成，shared/api/web 已接入 Agent/Terminal session contract、metadata registry、Project-scoped HTTP API、Terminal tmux/WebSocket stream、Agent provider seam、Project console 与 session detail UI；`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build` 通过；tmux + agent-browser E2E 验证登录、Project、Terminal 创建、stream 输入、刷新重连与 close 清理，证据见 `artifacts/terminal-session-stream.png`、`artifacts/terminal-session-closed-console.png`、`artifacts/e2e-api.log`、`artifacts/e2e-web.log`；下一阶段为 `待验证`。
- 2026-05-25：`verify-change` 完成，创建 `verify.md`；Trace/Delta/Scenario/Evidence 均通过，自动化测试、完整质量门禁、tmux + agent-browser E2E 和 close confirmation retest 均有证据，无未解决 CRITICAL，下一阶段为 `待沉淀`。
- 2026-05-25：`distill-change` 完成，长期 WHAT 沉淀到 `docs/specs/session-runtime/spec.md`，长期 HOW 沉淀到 `docs/design/session-runtime-boundaries.md` 与 `docs/architecture/session-runtime.md`，并更新 `docs/project.md`、`docs/specs/index.md`、`docs/design/index.md`、`docs/architecture/index.md`；当前 change 已完成，可随 version 归档。
