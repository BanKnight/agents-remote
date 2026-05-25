# progress

本文件记录单个 change 的当前阶段、局部阻塞和进展记录。`roadmap.md` 只指向当前 change，不维护这些状态；阶段到技能的路由由 `step-change` 独占维护。

## Change

- change-id：implement-agent-provider-experience
- 所属 version：v0.3-session-runtime-quality
- change 路径：.workflow/changes/implement-agent-provider-experience/

## 当前进度

- 当前阶段：已完成
- 阻塞项：（无）

## 推进规则

- 本文件是 change 当前阶段、局部阻塞和进展记录的权威来源。
- 本文件不保存“下一步技能”；推荐使用 `step-change` 推进本 change，由它根据当前阶段调用对应阶段技能。
- `roadmap.md` 只引用本文件，不维护本 change 的阶段状态。
- 专业阶段技能完成后，应只更新当前阶段、产物检查、阻塞项和进展记录；如果由 `step-change` 调用，则由 `step-change` 检查产物并同步推进阶段。

## 产物检查

- specs：已完成（`specs/agent-provider-experience/spec.md`）
- design：已完成（`design/overview.md`、`design/architecture.md`、`design/api.md`）
- plan/tasks：已完成（`plan.md`、`tasks.md`）
- implementation：已完成（provider profile、AgentRuntime、TmuxRuntime command boundary、API runtime composition 与回归测试）
- verify：已完成（`verify.md`，结论：通过，无 CRITICAL/WARNING）
- distill：已完成（`docs/specs/agent-provider-experience/spec.md`、`docs/design/agent-provider-experience.md`、`docs/architecture/agent-runtime.md`）

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
- 2026-05-25：`specify-change` 完成，创建 `specs/agent-provider-experience/spec.md`；明确 Claude/Codex provider 入口共享 Agent Session 语义、Agent Runtime/provider adapter 吸收差异、provider-aware 列表/详情、历史会话读取作为分阶段能力方向，下一阶段为 `待设计`。
- 2026-05-25：`design-change` 完成，创建 `design/overview.md`、`design/architecture.md`、`design/api.md`；决定保持现有 Agent Session HTTP contract，新增/收敛 AgentRuntime provider profile seam，将 provider 启动命令从 TmuxRuntime 中移出，并把 history/resume 保持为后续 adapter capability，下一阶段为 `待计划`。
- 2026-05-25：`plan-change` 完成，创建 `plan.md`、`tasks.md`；实现顺序聚焦 provider profile、薄 AgentRuntime、TmuxRuntime command boundary、API runtime composition 与 provider 回归测试，下一阶段为 `待实现`。
- 2026-05-25：`implement-change` 完成，新增 `api/src/agent-provider-profiles.ts`、`api/src/agent-runtime.ts`，将 provider command 选择从 `TmuxRuntime` 移入 AgentRuntime/provider profile seam；补充 provider runtime 回归测试并通过 `bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build`，下一阶段为 `待验证`。
- 2026-05-25：`verify-change` 完成，创建 `verify.md`；验证 provider profile、AgentRuntime command delegation、TmuxRuntime command boundary、Agent Session API 兼容性与 history/resume 非目标，结论通过且无 CRITICAL/WARNING，下一阶段为 `待沉淀`。
- 2026-05-25：`distill-change` 完成，新增 `docs/specs/agent-provider-experience/spec.md`、`docs/specs/agent-provider-experience/index.md`、`docs/design/agent-provider-experience.md`，并更新 `docs/architecture/agent-runtime.md`、`docs/specs/index.md`、`docs/design/index.md`；长期沉淀覆盖 provider-visible Agent Session 语义、AgentRuntime/provider profile seam、TmuxRuntime command boundary 与 history/resume staged capability，本 change 已完成。
