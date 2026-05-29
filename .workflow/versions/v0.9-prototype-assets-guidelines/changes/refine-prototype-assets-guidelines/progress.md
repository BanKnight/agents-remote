# progress

本文件记录单个 change 的当前阶段、局部阻塞和进展记录。`.workflow/versions/index.md` 只指向当前 change，不维护这些状态；阶段到技能的路由由 `step-change` 独占维护。

## Change

- change-id：refine-prototype-assets-guidelines
- 所属 version：v0.9-prototype-assets-guidelines
- change 路径：.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/

## 当前进度

- 当前阶段：待设计
- 阻塞项：无

## 推进规则

- 本文件是 change 当前阶段、局部阻塞和进展记录的权威来源。
- 本文件不保存“下一步技能”；推荐使用 `step-change` 推进本 change，由它根据当前阶段调用对应阶段技能。
- `.workflow/versions/index.md` 只引用本文件，不维护本 change 的阶段状态。
- 专业阶段技能完成后，应只更新当前阶段、产物检查、阻塞项和进展记录；如果由 `step-change` 调用，则由 `step-change` 检查产物并同步推进阶段。

## 产物检查

- specs：已完成：.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/specs/prototype-assets-guidelines/spec.md
- design：未完成
- plan/tasks：未完成
- implementation：未完成
- verify：未完成
- distill：未完成

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

- 2026-05-29：由 `plan-versions` 基于 prototype asset/guidelines refinement 意图创建为当前焦点 change；本 change 将统一处理 `overview.html` 页面分组 iframe 总览、`guidelines.md` token/组件/viewport/响应式规范、prototype screenshots 更新和跨页面公共原型抽象，当前阶段为待规格。
- 2026-05-29：`specify-change` 已创建 `.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/specs/prototype-assets-guidelines/spec.md`，定义 overview 每页 desktop/mobile iframe、正式截图来源、guidelines token/组件值、viewport/响应式标准、跨页面公共基础和 screenshots/index 更新要求，当前阶段推进到待设计。
