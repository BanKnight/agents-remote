# progress

本文件记录单个 change 的当前阶段、下一步和阻塞项。`roadmap.md` 只指向当前 change，不维护这些状态。

## Change

- change-id：build-responsive-pwa-console-shell
- 所属 version：v0.2-project-console-shell
- change 路径：.workflow/changes/build-responsive-pwa-console-shell/

## 当前进度

- 当前阶段：待规格
- 下一步技能：specify-change
- 阻塞项：依赖 `setup-monorepo-service-boundaries` 与 `implement-project-model-and-safe-paths`；规格阶段可先推进。

## 阶段流转

| 阶段 | 下一步技能 | 完成标志 |
|---|---|---|
| 待规格 | specify-change | `specs/` 已补齐可验证 WHAT |
| 待设计 | design-change | `design/` 已补齐 HOW 设计 |
| 待计划 | plan-change | `plan.md` 与 `tasks.md` 已补齐 |
| 待实现 | implement-change | `tasks.md` 中实现项已完成 |
| 待验证 | verify-change | `verify.md` 已补齐一致性证据 |
| 待沉淀 | distill-change | 长期 docs 已按需沉淀 |
| 已完成 | archive-version | 可随 version 归档 |
| 阻塞 | 先处理阻塞项 | 阻塞解除后回到对应阶段 |

## 进展记录

- 已进入 roadmap，完整来源见 `intents.md`。
