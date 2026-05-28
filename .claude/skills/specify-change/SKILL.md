---
name: specify-change
description: 为 `.workflow/versions/<version>/changes/<change-id>/` 下的已规划 change 产出可验证 WHAT/spec 增量。用户需要把 change context 写成行为契约、能力规格或场景化需求时使用。
---

# specify-change 技能

## 定位

`specify-change` 用于为指定 change 产出行为契约（WHAT）。

它读取该 change 的 `context.md`、`progress.md`、相关长期 specs/docs 和必要的 version shared，然后在目标 change 的 `specs/` 下创建或更新 capability spec 增量：

```text
.workflow/versions/<version>/changes/<change-id>/specs/<capability>/spec.md
```

`specify-change` 只回答：这个 change 对系统行为提出了哪些可验证要求。

它不回答 HOW，不拆 tasks，不执行实现，也不把运行态 spec 直接沉淀到 `docs/`。

## 主动触发

当满足以下情况时，使用 `specify-change`：

- 活跃 roadmap 中某个 change 已经建立 `context.md` / `progress.md` 骨架，但还没有 specs。
- 用户确认要把某个 change 的行为契约写清楚。
- `step-change` 读取 `progress.md` 后发现当前阶段是 `待规格`。
- 后续 design、plan 或实现前缺少可验证 WHAT。

不要在以下情况强行进入：

- 目标 change 尚未进入 `.workflow/versions/index.md`。
- 目标 change 缺少 `context.md`，说明看板上下文还没有建立。
- 用户正在讨论 roadmap 编排，而不是具体 change 行为。
- 用户要求的是 HOW、任务拆解、实现或验证。

## change 参数

执行本技能时必须确定目标 change。

- 如果用户传入 `.workflow/versions/<version>/changes/<change-id>/` 路径，使用该 change。
- 如果用户传入 `<version>/<change-id>`，使用对应 version 下的 change。
- 如果用户只传入 change-id，因为活跃区 change-id 应保持全局唯一，先在 `.workflow/versions/index.md` 中定位该 change；若出现多个匹配，列出候选并要求用户选择。
- 如果用户没有传入 change，读取 `.workflow/versions/index.md` 的“当前焦点”。
- 如果当前焦点缺失或不明确，列出 3-4 个可进入 `待规格` 或缺少 specs 的候选 change，并要求用户选择。
- 不要在未确认 change 的情况下创建 spec。

## 输入契约

### 标准输入

每次执行都需要读取并理解这些输入：

```text
.workflow/versions/index.md
.workflow/versions/<version>/changes/<change-id>/context.md
.workflow/versions/<version>/changes/<change-id>/progress.md
.workflow/templates/changes/specs/spec.md
```

读取规则：

- `.workflow/versions/index.md` 用于确认目标 change 已进入活跃 roadmap、所属 version、依赖和当前焦点。
- `context.md` 是主要上下文，提供来源上下文、当前已知边界、version shared 读写约定和背景引用。
- `progress.md` 是阶段状态和局部阻塞的权威来源。
- `.workflow/templates/changes/specs/spec.md` 是写入结构基础。
- 读取依赖材料后再创建 spec，不要凭 change-id 或文件名猜测需求。

### 条件输入

根据目标 change 的 context、边界、依赖和已有产物，按需读取这些输入：

1. **已有 change specs**
   - 如果目标 change 已有 `specs/`，先读取并更新现有 spec，不要直接覆盖。

2. **长期 specs/docs**
   - 读取 `docs/project.md` 获得项目 big picture。
   - 如果 `docs/project.md` 或 `context.md` 指向相关 `docs/specs/`、`docs/design/`、`docs/architecture/`、`docs/runbooks/` 或 research，按需读取，避免与长期 WHAT 冲突或重复。
   - 如果 `docs/project.md` 没有覆盖但该背景会影响行为契约，按照 docs 索引规则层层查找相关文档。

3. **version shared**
   - 如果 `context.md` 要求读取 `.workflow/versions/<version>/shared/` 下的共享材料，先读取相关文件再写 spec。
   - 如果本 spec 会影响后续 shared 约定，只在 spec 中表达行为契约；shared 产物本身由对应阶段或后续 change 产出。

4. **依赖 change**
   - 如果 versions index 中目标 change 声明依赖，读取依赖 change 的 `context.md`、`progress.md` 和足以判断 WHAT 边界的产物。

5. **项目文件与代码**
   - 如果现有行为、协议、错误码、UI 状态或 API 能力会影响 WHAT，按需读取当前源码、测试或配置。

6. **外部资料**
   - 如果行为契约依赖外部标准、平台限制或技术事实，调用合适的研究/检索/文档技能；只把影响 WHAT 的结论写入 spec，不记录调研过程。

## 输出契约

### 标准输出

每次成功完成后，必须创建或更新：

```text
.workflow/versions/<version>/changes/<change-id>/specs/<capability>/spec.md
.workflow/versions/<version>/changes/<change-id>/progress.md
```

标准输出要求：

- 每个相关 capability 都有对应 spec 增量。
- 每条 requirement 都是可验证的行为要求，并至少包含一个 scenario。
- spec 不包含 HOW、架构方案、技术选型、任务拆解或实现细节。
- `progress.md` 的 specs 产物检查与当前阶段保持一致，除非由 `step-change` 统一更新。

### 条件输出

根据执行结果，按需产生这些输出：

1. **多个 capability specs**
   - 如果一个 change 影响多个长期能力，可以在同一 invocation 中创建或更新多个 capability spec。
   - 每个 capability 使用独立目录和 spec 文件。

2. **阻塞记录**
   - 如果 change 范围过大、来源上下文不足、行为边界冲突或 capability 不清，停止写入或只写明确部分，并在 `progress.md` 或汇报中记录阻塞。

3. **progress 更新**
   - 如果 specs 已补齐且无阻塞，将当前阶段推进到 `待设计`，并把产物检查中的 specs 标记为已完成。
   - 如果本技能由 `step-change` 调用且 `step-change` 会统一更新 progress，保证 spec 文件存在并在汇报中说明可进入 `design-change`。

4. **用户可读摘要**
   - 完成后简短说明目标 change、创建/更新的 capability spec、当前阶段结果和下一步。

## 不负责

`specify-change` 不负责：

- 规划 roadmap、新建 version 或新建 change。
- 设计 HOW。
- 拆分 tasks。
- 执行实现。
- 做验证、长期沉淀或归档。
- 更新长期 `docs/`。

工作流层面的直接衔接只有：

- 上游：change 骨架或 context 不足时，回到 `plan-versions`。
- 下游：specs 完成后，进入 `design-change`，通常由 `step-change` 分发。

## 状态检查

确认目标 change 后，先检查当前状态：

1. `.workflow/versions/<version>/changes/<change-id>/` 是否存在。
2. `context.md` 是否存在。
3. `progress.md` 是否存在。
4. `specs/` 是否已存在。
5. `progress.md` 中当前阶段是否为 `待规格`，或是否仍缺少 specs。

根据状态处理：

- 如果 change 缺少 `context.md` 或 `progress.md`，停止并提示先回到 `plan-versions` 补齐 change 骨架。
- 如果 specs 已存在，读取现有 specs 后更新，不要直接覆盖。
- 如果 specs 已完整且当前阶段不是 `待规格`，说明当前状态，并询问是否仍要修改 specs。
- 如果 `context.md` 指出仍有尚不确定的 WHAT 边界，先向用户确认或记录阻塞，不要强行编写 requirement。

## 核心执行循环

1. 确认目标 change。
2. 读取标准输入，理解 change context、当前阶段和 spec 模板。
3. 按条件输入规则读取必要的已有 specs、长期 docs、version shared、依赖 change、代码或外部资料。
4. 判断该 change 涉及哪些 capability。
5. 创建或更新 spec artifact：

```text
.workflow/versions/<version>/changes/<change-id>/specs/<capability>/spec.md
```

6. 确保每条 requirement 可验证，并至少包含一个 scenario。
7. 不把 HOW、架构方案、技术选型、任务拆解写进 spec。
8. 如果发现 change 范围过大或 capability 边界不清，先向用户确认或记录阻塞。
9. 创建后验证文件存在，按需更新 `progress.md`。
10. 简短汇报进度和下一步。

## Artifact 创建规则

`specify-change` 只创建或更新 specs 这一类 artifact。

- 一次 invocation 只推进 `specify-change` 阶段，不继续创建 design、plan 或 tasks。
- 必须先读取依赖 artifact：versions index、change context、progress、已有 specs。
- 必须使用 `.workflow/templates/changes/specs/spec.md` 作为结构基础。
- 模板、规则和上下文是给 Agent 的约束，不要把说明性注释原样复制为最终内容。
- 如果涉及多个 capability，可以在同一次 specify-change 中为同一 change 创建多个 capability spec；但不要推进到 `design-change`。

## capability 规则

capability 是长期能力单元，不是一次 change，也不是代码模块名。

命名建议：

- 使用语义化 kebab-case。
- 表达系统长期能力，例如 `auth`、`agent-runtime`、`session-runtime`、`workflow-setup`。
- 不使用过细的实现文件名或临时任务名。

一个 change 可以影响多个 capability；每个 capability 使用独立 spec 文件。

## spec 写入格式

优先使用模板：

```text
.workflow/templates/changes/specs/spec.md
```

输出路径：

```text
.workflow/versions/<version>/changes/<change-id>/specs/<capability>/spec.md
```

spec 内容应至少包含：

- capability 名称
- change context 引用
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
- change context 已读取。
- 涉及的 capability 已明确。
- 每个相关 capability 都有对应 spec 增量。
- 每条 requirement 都有可验证 scenario。
- 没有把 HOW、任务或实现细节混入 spec。
- 已验证 spec 文件存在。
- 下一步可以进入 `design-change`。
