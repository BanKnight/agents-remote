---
name: plan-change
description: 将已完成 spec/design 的 change 拆成可执行 plan 与 tasks。用户要把设计落成执行计划、任务清单或实现步骤时使用。
---

# plan-change 技能

## 定位

`plan-change` 用于为指定 change 制定实现计划，并将设计结论拆解为可执行任务。

它同时产出两个 artifact：

```text
.workflow/changes/<change-id>/plan.md
.workflow/changes/<change-id>/tasks.md
```

其中：

- `plan.md` 负责记录本 change 后续执行的局部 big picture：目标、范围、执行策略、任务顺序依据、依赖、风险、验证重点和额外上下文。
- `tasks.md` 负责把实现计划拆成可执行、可验收的任务清单。

同一 change 目录内的 `intents.md`、`progress.md`、`specs/`、`design/`、`plan.md`、`tasks.md` 是后续阶段的默认上下文。`plan.md` 不应重复罗列这些默认文件；只有当某个默认产物存在特殊注意事项、缺失理由或冲突时才说明。

`plan-change` 不执行代码实现。

## change 参数

执行本技能时必须确定目标 change。

- 如果用户传入 change 名称，使用该名称。
- 如果用户没有传入 change 名称，先读取 `.workflow/roadmap.md` 与 `.workflow/changes/`，列出当前活跃 changes，并询问用户要指定哪个 change。
- 如果上下文里似乎能推断 change，也不能直接猜测或自动选择；必须让用户确认。
- 不要在未确认 change 的情况下创建 plan 或 tasks。

选择 change 时，应优先展示 3-4 个最相关或最近活跃的 change，并显示：

- change-id
- 所属 version
- 当前阶段（来自 `progress.md`）
- change 路径
- 最近上下文依据（如当前焦点或 roadmap 排序）

可以把最可能的 change 标记为“推荐”，但仍必须由用户选择。

## 主动触发

当满足以下情况时，AI 可以主动建议或进入 `plan-change`：

- roadmap 中某个 change 已经完成 `specify-change` 和必要的 `design-change`。
- 用户确认要把某个 change 拆成实现计划和任务。
- 后续实现前缺少局部 big picture、任务顺序或额外上下文说明，容易偏离 specs/design/docs。
- change 已有 specs/design，但缺少 `plan.md` 或 `tasks.md`。

不要在以下情况强行进入：

- 目标 change 尚未进入 roadmap。
- change 缺少来源 intents。
- change 缺少 specs。
- change 需要 design 但尚未完成 `design-change`。
- 用户正在讨论 roadmap/spec/design，而不是实现计划。

## 输入

必须读取：

```text
.workflow/roadmap.md
.workflow/changes/<change-id>/intents.md
.workflow/changes/<change-id>/progress.md
.workflow/changes/<change-id>/specs/
.workflow/changes/<change-id>/design/
.workflow/templates/changes/plan.md
.workflow/templates/changes/tasks.md
```

按需定位并读取相关长期文档：

```text
docs/specs/
docs/design/
docs/architecture/
docs/runbooks/
```

读取规则：

- `.workflow/changes/<change-id>/specs/` 是 what 基线。
- `.workflow/changes/<change-id>/design/` 是 how 基线。
- 同一 change 目录内产物是默认上下文，`plan.md` 不需要逐项复述这些默认路径。
- `docs/` 是项目长期约束来源，应按 capability、子域、模块、风险或实现路径判断是否需要读取。
- `plan.md` 只记录默认 change 目录之外的额外上下文：长期 docs、外部仓库/本地源码路径、代码入口、环境/权限/人工确认等。
- 如果判断无需额外上下文，`plan.md` 写明“无额外上下文；默认读取本 change 目录产物”。
- 如果无法判断哪些 docs 相关，应搜索 docs 并根据 capability、子域、模块、风险关键词定位。
- 已有 `plan.md` 或 `tasks.md` 存在时，读取现有内容后更新，不要直接覆盖。

## 不负责

`plan-change` 不负责：

- 重新规划 roadmap。
- 改写 specs。
- 改写 design。
- 执行实现。
- 做 verify。
- 把内容沉淀进长期 docs。
- 归档 version。

这些动作交给后续 workflow 技能。

## 状态检查

确认目标 change 后，先检查当前状态：

1. `.workflow/changes/<change-id>/` 是否存在。
2. `.workflow/changes/<change-id>/intents.md` 是否存在。
3. `.workflow/changes/<change-id>/specs/` 是否存在。
4. `.workflow/changes/<change-id>/design/` 是否存在，或是否有充分理由不需要 design。
5. `.workflow/changes/<change-id>/plan.md` 是否已存在。
6. `.workflow/changes/<change-id>/tasks.md` 是否已存在。
7. `progress.md` 中当前阶段是否为 `待计划`，或是否仍缺少 plan/tasks。

根据状态处理：

- 如果 change 缺少 `intents.md`，停止并提示先回到 `plan-roadmap` 补齐 change 骨架。
- 如果 specs 缺失，停止并提示先执行 `specify-change`。
- 如果 design 缺失且 change 明显需要 how 设计，停止并提示先执行 `design-change`。
- 如果 design 缺失但 specs 足以指导轻量实现，必须在 `plan.md` 中说明为什么可以不依赖 design。
- 如果 plan/tasks 已存在，读取现有内容后更新，不要直接覆盖。

## 依赖规划规则

`plan-change` 必须显式分析依赖，不能只把 design 机械拆成任务。

依赖分析至少包括：

- 阶段依赖：哪些工作必须先完成，哪些工作可以后置。
- 任务依赖：每个任务依赖哪些前置任务、spec、design 或长期 docs。
- 文件依赖：任务是否会修改同一文件或同一模块，从而不能并行。
- 验证依赖：哪些验证必须在实现前准备，哪些验证在实现后执行。
- 外部依赖：第三方服务、数据迁移、配置、权限、环境、长驻进程/后台服务管理方式或人工确认。

任务排序规则：

1. 先放阻塞所有后续工作的基础任务。
2. 再放可以独立完成和验证的功能任务。
3. 最后放集成、验证、清理和横切事项。
4. 可并行任务必须明确标记，并确保它们不依赖同一未完成产物。
5. 如果某个任务依赖未完成事项，必须在 tasks 中写明依赖，而不是隐藏在描述里。

`tasks.md` 必须包含依赖说明；`plan.md` 必须说明为什么采用该任务顺序。

## plan 内容规则

`plan.md` 的核心价值是防止后续 `implement-change` 走偏；它应回答“为什么这样执行、先后关系是什么、额外还要看什么”，而不是重复当前 change 目录已有内容。

因此 `plan.md` 必须包含：

- change 目标和范围。
- 局部 big picture：本 change 在当前 version / 后续 changes 中的作用。
- 执行策略：如何从 specs/design 走到可实现任务。
- 任务顺序依据：为什么这样排序，哪些任务阻塞后续。
- 额外上下文：默认 change 目录之外需要读取的长期 docs、外部仓库、本地源码、代码入口、环境/权限/人工确认；如无则明确说明。
- 依赖与阻塞：阶段依赖、任务依赖、外部依赖。
- 并行机会与不可并行原因。
- 风险与验证关注点。
- 明确不做什么。

`plan.md` 不应包含：

- 当前 change 目录默认产物的逐项清单。
- 来源 intents、specs、design 的全文摘抄或路径堆砌。
- 每个任务的详细验收标准；这些写入 `tasks.md`。
- 长篇复述已经在 spec/design/research 中存在的结论。

长期 docs 或额外上下文引用必须具体到路径，例如：

```text
docs/specs/<capability>/spec.md
docs/design/<topic>.md
docs/architecture/<topic>.md
docs/runbooks/<topic>.md
/home/deploy/repos/<repo>/...
src/...
```

不要只写“参考 docs”或“参考架构文档”。

## 执行规则

1. 确认目标 change。
2. 检查 change 当前状态。
3. 读取 roadmap、change intents、change specs、change design。
4. 按需读取长期 docs 或其他额外上下文，并在 `plan.md` 中说明使用方式；如果无需额外上下文，也要说明。
5. 判断实现边界、依赖、风险和验证关注点。
6. 分析任务依赖、阶段顺序和并行机会。
7. 创建或更新：

```text
.workflow/changes/<change-id>/plan.md
.workflow/changes/<change-id>/tasks.md
```

8. 使用 `.workflow/templates/changes/plan.md` 与 `.workflow/templates/changes/tasks.md` 作为结构基础。
9. `tasks.md` 中每个任务必须可执行、可验收，并能追溯到 plan/spec/design。
10. `tasks.md` 必须包含任务依赖和可并行性说明。
11. 不要在 `plan-change` 中修改代码。
12. 创建后验证两个文件都存在，再汇报进度。

## implement-change 可执行性规则

`plan-change` 的产出必须让后续 `implement-change` 通过“默认 change 目录产物 + plan.md + tasks.md + plan/tasks 指定的额外上下文”恢复执行上下文。

因此必须避免以下问题：

- `plan.md` 没有局部 big picture，只是文件清单。
- `plan.md` 没有说明额外上下文：读取了哪些、如何使用，或为什么没有额外上下文。
- `plan.md` 没有说明任务顺序、依赖、并行判断和风险验证重点。
- `plan.md` 重复粘贴 intents/spec/design/research 结论，掩盖真正的执行策略。
- `tasks.md` 没有写清依赖关系。
- `tasks.md` 没有标明可并行性或同文件冲突。
- `tasks.md` 粒度过大，无法独立完成和验收。
- `tasks.md` 缺少验收标准。
- `tasks.md` 无法追溯到 spec/design/plan。
- `tasks.md` 没有说明修改范围或任务级必读上下文。

如果无法满足这些要求，不要产出看似完整但无法执行的 plan/tasks；应把缺口记录为阻塞项或开放问题。

## plan 写入格式

优先使用模板：

```text
.workflow/templates/changes/plan.md
```

输出路径：

```text
.workflow/changes/<change-id>/plan.md
```

`plan.md` 至少包含：

- Change 目标
- 局部 big picture
- 执行策略
- 任务顺序依据
- 额外上下文
- 依赖与阻塞
- 并行机会
- 风险与验证重点
- 不做事项

## tasks 写入格式

优先使用模板：

```text
.workflow/templates/changes/tasks.md
```

输出路径：

```text
.workflow/changes/<change-id>/tasks.md
```

`tasks.md` 至少包含：

- 分组任务
- 每个任务的验收标准
- 对应 plan/spec/design 引用
- 任务级必读上下文
- 修改范围
- 阻塞项或依赖关系
- 可并行标记与不可并行原因
- 建议执行顺序

## progress.md 更新规则

`progress.md` 是 change 阶段状态的权威来源。

完成 `plan-change` 后：

- 如果 `plan.md` 与 `tasks.md` 已补齐且无阻塞，将 `progress.md` 更新为：`当前阶段：待实现`。
- 在“进展记录”追加本次创建或更新的 plan/tasks 路径。
- 如果仍有阻塞，将当前阶段写为 `阻塞`，并记录阻塞原因。
- 如果本技能由 `step-change` 调用且 `step-change` 会统一更新 progress，也必须保证产物存在并在汇报中说明可进入 `implement-change`。

## 完成后输出

完成后简短汇报：

- 目标 change。
- 创建或更新了 `plan.md` 和 `tasks.md`。
- `plan.md` 记录了哪些额外上下文，或为什么没有额外上下文。
- 当前阶段已完成：`plan-change`。
- 解锁的下一步：`implement-change`。
- 如果仍有阻塞，说明阻塞原因。

## 退出条件

当满足以下条件时，`plan-change` 可以结束：

- 目标 change 已确认。
- change intents、specs、design 或 design 缺省理由已读取。
- 相关长期 docs / 外部上下文已按需定位；如未读取，已在 `plan.md` 中说明理由。
- 任务依赖、阶段顺序和并行机会已分析。
- `plan.md` 足以指导后续实现不偏离 specs/design/docs，且没有重复默认 change 上下文清单。
- `tasks.md` 已将计划拆成可执行、可验收任务。
- 没有修改代码。
- 已验证 `plan.md` 和 `tasks.md` 存在。
- 下一步可以进入 `implement-change`。
