---
name: specify-change
description: 为某个 change 产出行为契约 spec 增量。用户需要把已规划 change 写成可验证 WHAT、能力规格或场景化需求时使用。
---

# specify-change 技能

## 定位

`specify-change` 用于为指定 change 产出行为契约（what）。

它读取该 change 的来源意图或规划来源，并在 `.workflow/changes/<change-id>/specs/` 下创建或更新 capability spec 增量。

`specify-change` 只回答：这个 change 对系统行为提出了哪些可验证要求。

本技能参考 OpenSpec `continue` 的执行方式：先确定 change，再检查当前产物状态，然后只创建当前阶段需要的 spec artifact，不跳过、不猜测、不一次性推进后续 design/tasks。

## change 参数

执行本技能时必须确定目标 change。

- 如果用户传入 change 名称，使用该名称。
- 如果用户没有传入 change 名称，先读取 `.workflow/roadmap.md` 与 `.workflow/changes/`，列出当前活跃 changes，并询问用户要指定哪个 change。
- 如果上下文里似乎能推断 change，也不能直接猜测或自动选择；必须让用户确认。
- 不要在未确认 change 的情况下创建 spec。

选择 change 时，应优先展示 3-4 个最相关或最近活跃的 change，并显示：

- change-id
- 所属 version
- 当前阶段（来自 `progress.md`）
- change 路径
- 最近上下文依据（如当前焦点或 roadmap 排序）

可以把最可能的 change 标记为“推荐”，但仍必须由用户选择。

## 主动触发

当满足以下情况时，AI 可以主动建议或进入 `specify-change`：

- roadmap 中某个 change 已经建立骨架，但还没有 specs。
- 用户确认要把某个 change 的行为契约写清楚。
- 后续 `design-change` 或实现前缺少可验证的 what。

不要在以下情况强行进入：

- 目标 change 尚未进入 roadmap。
- change 的来源仍不清楚。
- 用户正在讨论 roadmap 编排，而不是具体 change 行为。

## 输入

必须读取：

```text
.workflow/roadmap.md
.workflow/changes/<change-id>/intents.md
.workflow/changes/<change-id>/progress.md
.workflow/templates/changes/specs/spec.md
```

按需读取：

```text
docs/specs/
docs/design/
docs/architecture/
.workflow/changes/<change-id>/specs/
```

读取规则：

- `.workflow/changes/<change-id>/intents.md` 是主要上下文。
- `docs/specs/` 用于避免与长期 WHAT 冲突或重复。
- 已有 change specs 存在时，优先更新而不是重建。
- 读取依赖材料后再创建 spec，不要凭 change-id 或文件名猜测需求。

## 不负责

`specify-change` 不负责：

- 重新规划 roadmap。
- 设计 how。
- 拆分 tasks。
- 执行实现。
- 做验证、沉淀或归档。

这些动作交给后续 workflow 技能。

## 状态检查

确认目标 change 后，先检查当前状态：

1. `.workflow/changes/<change-id>/` 是否存在。
2. `.workflow/changes/<change-id>/intents.md` 是否存在。
3. `.workflow/changes/<change-id>/specs/` 是否已存在。
4. `progress.md` 中当前阶段是否为 `待规格`，或是否仍缺少 specs。

根据状态处理：

- 如果 change 缺少 `intents.md`，停止并提示先回到 `plan-roadmap` 补齐 change 骨架。
- 如果 specs 已存在，读取现有 specs 后更新，不要直接覆盖。
- 如果 specs 已完整且当前阶段不是 `待规格`，说明当前状态，并询问是否仍要修改 specs。

## 执行规则

1. 确认目标 change。
2. 检查 change 当前状态。
3. 读取该 change 的 `intents.md`。
4. 读取已有 `docs/specs/` 和 change specs，避免重复或冲突。
5. 判断该 change 涉及哪些 capability。
6. 为当前 change 创建或更新 spec artifact：

```text
.workflow/changes/<change-id>/specs/<capability>/spec.md
```

7. 每条 requirement 必须可验证，并至少包含一个 scenario。
8. 不把 how、架构方案、技术选型、任务拆解写进 spec；这些属于 `design-change` 或 `plan-change`。
9. 如果发现 change 范围过大或 capability 边界不清，先向用户确认，不要强行写 spec。
10. 创建后验证文件存在，再汇报进度。

## Artifact 创建规则

`specify-change` 只创建或更新 specs 这一类 artifact。

- 一次 invocation 只推进 `specify-change` 阶段，不继续创建 design 或 tasks。
- 必须先读取依赖 artifact：roadmap、change intents、已有 specs。
- 必须使用 `.workflow/templates/changes/specs/spec.md` 作为结构基础。
- 模板、规则和上下文是给 Agent 的约束，不要把说明性注释原样复制为最终内容。
- 如果涉及多个 capability，可以在同一次 specify-change 中为同一 change 创建多个 capability spec；但不要推进到 `design-change`。

## capability 规则

capability 是长期能力单元，不是一次 change，也不是代码模块名。

命名建议：

- 使用语义化 kebab-case。
- 表达系统长期能力，例如 `auth`、`billing`、`notification`、`workflow-setup`。
- 不使用过细的实现文件名或临时任务名。

一个 change 可以影响多个 capability；每个 capability 使用独立 spec 文件。

## spec 写入格式

优先使用模板：

```text
.workflow/templates/changes/specs/spec.md
```

输出路径：

```text
.workflow/changes/<change-id>/specs/<capability>/spec.md
```

spec 内容应至少包含：

- capability 名称
- change 来源
- ADDED / MODIFIED / REMOVED Requirements
- Scenario

## progress.md 更新规则

`progress.md` 是 change 阶段状态的权威来源。

完成 `specify-change` 后：

- 如果 specs 已补齐且无阻塞，将 `progress.md` 更新为：`当前阶段：待设计`。
- 在“产物检查”中把 specs 标记为已完成。
- 在“进展记录”追加本次创建或更新的 spec 路径。
- 如果仍有阻塞，将当前阶段写为 `阻塞`，并记录阻塞原因。
- 如果本技能由 `step-change` 调用且 `step-change` 会统一更新 progress，也必须保证产物存在并在汇报中说明可进入 `design-change`。

## 完成后输出

完成后简短汇报：

- 目标 change。
- 创建或更新了哪些 capability spec。
- 当前阶段已完成：`specify-change`。
- 解锁的下一步：`design-change`。
- 如果仍有阻塞，说明阻塞原因。

## 退出条件

当满足以下条件时，`specify-change` 可以结束：

- 目标 change 已确认。
- 涉及的 capability 已明确。
- 每个相关 capability 都有对应 spec 增量。
- 每条 requirement 都有可验证 scenario。
- 没有把 how、任务或实现细节混入 spec。
- 已验证 spec 文件存在。
- 下一步可以进入 `design-change`。
