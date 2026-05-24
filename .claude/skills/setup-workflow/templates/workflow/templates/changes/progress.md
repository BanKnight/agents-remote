# progress

本文件记录单个 change 的当前阶段、下一步和阻塞项。`roadmap.md` 只指向当前 change，不维护这些状态。

## Change

- change-id：（待补充）
- 所属 version：（待补充）
- change 路径：.workflow/changes/<change-id>/

## 当前进度

- 当前阶段：待规格
- 下一步技能：specify-change
- 阻塞项：无

## 推进规则

- 本文件是 change 阶段状态、下一步技能和局部阻塞的权威来源。
- `roadmap.md` 只引用本文件，不维护本 change 的阶段状态。
- 推荐使用 `step-change` 推进本 change；它会读取本文件并调用对应阶段技能。
- 专业阶段技能完成后，应更新本文件；如果由 `step-change` 调用，则由 `step-change` 检查产物并同步推进状态。

## 产物检查

- specs：未完成
- design：未完成
- plan/tasks：未完成
- implementation：未完成
- verify：未完成
- distill：未完成

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

- （无）
