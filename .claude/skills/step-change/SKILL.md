---
name: step-change
description: 读取 roadmap 当前焦点或指定 change 的 progress.md，智能判断并调用下一阶段 workflow skill 推进一个 change。用户要求继续推进、下一步、step、推进当前 change 或不确定该调用哪个 change 技能时使用。
---

# step-change 技能

## 定位

`step-change` 是 change 生命周期的智能推进 hub。

它不直接产出 spec、design、plan、tasks、verify 或长期 docs，而是读取目标 change 的 `progress.md`，判断当前阶段，调用对应的专业阶段技能推进一步，并在专业技能完成后检查产物、更新 `progress.md`。

```text
roadmap.md -> 当前焦点 / change 队列
progress.md -> 当前 change 阶段、下一步技能、局部阻塞
step-change -> 决策与分发
阶段技能 -> 产出具体 artifact
```

## change 参数

执行本技能时可以指定 change。

- 如果用户传入 change-id，使用该 change。
- 如果用户没有传入 change-id，读取 `.workflow/roadmap.md` 的“当前焦点”。
- 如果 roadmap 当前焦点缺失或对应 change 不存在，读取活跃 changes 和各自 `progress.md`，展示 3-4 个可推进候选并询问用户选择。
- 如果目标 change 的 `progress.md` 缺失，停止并提示先回到 `plan-roadmap` 补齐骨架。

## 主动触发

当用户要求以下内容时，优先使用 `step-change`：

- “继续推进当前 change”。
- “下一步做什么，直接做”。
- “step 一下”。
- “按 progress 往下走”。
- “我不确定现在该用哪个 workflow skill”。
- 当前 change 已进入 roadmap，且用户没有明确指定某个专业阶段技能。

不要在以下情况强行进入：

- 用户明确要求执行具体阶段技能，例如 `specify-change`、`design-change`、`plan-change`。
- 用户正在讨论 roadmap 编排，而不是推进某个 change。
- 当前 change 处于阻塞阶段且用户没有要求处理阻塞。
- 推进需要用户确认范围、取舍或风险，不能自动判断。

## 输入

必须读取：

```text
.workflow/roadmap.md
.workflow/changes/<change-id>/progress.md
.workflow/changes/<change-id>/intents.md
```

按阶段读取或检查：

```text
.workflow/changes/<change-id>/specs/
.workflow/changes/<change-id>/design/
.workflow/changes/<change-id>/plan.md
.workflow/changes/<change-id>/tasks.md
.workflow/changes/<change-id>/verify.md
```

按需读取：

```text
docs/project.md
docs/specs/
docs/design/
docs/architecture/
docs/runbooks/
```

读取规则：

- `progress.md` 是阶段状态权威来源。
- roadmap 只用于确定当前焦点、全局队列和依赖，不读取其中不存在的 change 状态。
- `step-change` 调用专业阶段技能前，只做必要状态判断，不代替该技能读取全部上下文。
- 如果 `progress.md` 与实际产物冲突，先按实际产物提出校正建议；除非校正明显且安全，否则询问用户。

## 阶段分发规则

| 当前阶段 | 下一步技能 | step-change 行为 |
|---|---|---|
| 待规格 | specify-change | 调用 `specify-change <change-id>` |
| 待设计 | design-change | 调用 `design-change <change-id>` |
| 待计划 | plan-change | 调用 `plan-change <change-id>` |
| 待实现 | implement-change | 调用 `implement-change <change-id>` |
| 待验证 | verify-change | 调用 `verify-change <change-id>` |
| 待沉淀 | distill-change | 调用 `distill-change <change-id>` |
| 已完成 | archive-version | 不自动归档；提示可按 version 执行 `archive-version` |
| 阻塞 | 先处理阻塞项 | 汇报阻塞，不调用阶段技能 |

`step-change` 一次 invocation 默认只推进一个阶段。如果专业阶段技能本身只完成了部分工作或进入阻塞，`step-change` 不继续调用后续阶段。

## progress.md 更新规则

专业阶段技能完成后，`step-change` 必须检查对应 artifact 是否存在，再更新 `progress.md`。

| 完成的技能 | 产物检查 | 更新为 |
|---|---|---|
| specify-change | `specs/` 存在且包含 spec 文件 | 当前阶段：待设计；下一步技能：design-change |
| design-change | `design/` 存在且包含 design 文件，或 progress 明确说明无需 design | 当前阶段：待计划；下一步技能：plan-change |
| plan-change | `plan.md` 与 `tasks.md` 存在 | 当前阶段：待实现；下一步技能：implement-change |
| implement-change | `tasks.md` 中实现任务已完成，且无未解决阻塞 | 当前阶段：待验证；下一步技能：verify-change |
| verify-change | `verify.md` 存在且无未解决 CRITICAL | 当前阶段：待沉淀；下一步技能：distill-change |
| distill-change | 长期 docs 已按需沉淀，或明确无需沉淀 | 当前阶段：已完成；下一步技能：archive-version |

更新时：

- 只修改目标 change 的 `progress.md`。
- 不把阶段状态写回 `roadmap.md`。
- 在“进展记录”追加一条简短记录，说明本轮完成的技能、产物和下一阶段。
- 如果遇到阻塞，把当前阶段改为 `阻塞`，下一步技能写为“先处理阻塞项”，并记录阻塞原因。
- 如果专业技能已经自行更新了 `progress.md`，`step-change` 只做一致性检查，必要时补充进展记录。

## 不负责

`step-change` 不负责：

- 规划 roadmap 或新建 change。
- 直接编写 specs/design/plan/tasks/verify/docs 正文。
- 直接修改代码实现。
- 代替专业阶段技能做领域判断。
- 自动归档 version。
- 在阻塞未解除时强行推进。

## 执行规则

1. 确认目标 change；没有参数时从 roadmap 当前焦点读取。
2. 读取目标 change 的 `progress.md` 与 `intents.md`。
3. 检查当前阶段、下一步技能和阻塞项。
4. 检查 roadmap 中声明的依赖是否已完成；如果依赖未完成，停止并记录/汇报阻塞。
5. 根据阶段分发规则调用对应专业 skill。
6. 专业 skill 返回后，检查本阶段完成标志和关键 artifact。
7. 更新 `progress.md` 到下一阶段，或记录阻塞/部分完成。
8. 简短汇报本轮推进结果和下一步。

## 依赖检查规则

如果 roadmap 中目标 change 声明了依赖：

- 读取依赖 change 的 `progress.md`。
- 只有依赖 change 当前阶段为 `已完成`，或依赖 change 的产物足以满足当前阶段输入，才继续推进。
- 如果依赖尚未满足，目标 change 的 `progress.md` 可以进入 `阻塞`，阻塞项写明未完成依赖和需要先推进的 change。

## 输出格式

完成后简短汇报：

- 目标 change。
- 读取到的当前阶段。
- 本轮调用了哪个阶段技能。
- 更新了哪些 progress 信息。
- 当前下一步是什么。
- 如有阻塞，说明阻塞项和建议先推进哪个 change。

## 退出条件

`step-change` 可以结束于三种状态。

### 已推进

- 已确认目标 change。
- 已调用对应阶段技能。
- 已检查产物。
- `progress.md` 已更新或确认已一致。
- 用户知道下一步。

### 阻塞

- 已确认目标 change。
- 阻塞项已写入或汇报。
- 未调用不该调用的阶段技能。
- 用户知道解除阻塞的建议。

### 需用户选择

- 当前焦点缺失或不明确。
- 已列出候选 change。
- 未在未确认目标时修改任何 artifact。
