---
name: plan-change
description: 将 `.workflow/versions/<version>/changes/<change-id>/` 下已完成 specs/design 的 change 拆成可执行 plan 与 tasks。用户要把设计落成执行计划、任务清单或实现步骤时使用。
---

# plan-change 技能

## 定位

`plan-change` 用于为指定 change 制定执行计划，并将已确认的 WHAT specs 与 HOW design 拆解为可执行、可验收的任务清单。

它同时产出两个 artifact：

```text
.workflow/versions/<version>/changes/<change-id>/plan.md
.workflow/versions/<version>/changes/<change-id>/tasks.md
```

其中：

- `plan.md` 负责记录本 change 后续执行的局部 big picture：目标、范围、执行策略、任务顺序依据、依赖、风险、验证重点、额外上下文，以及上游承诺如何投影为执行约束。
- `tasks.md` 负责把执行计划拆成可执行、可验收、可追溯的任务清单，并承接 specs/design/docs/version shared 中对实现有约束力的承诺。

同一 change 目录内的 `context.md`、`progress.md`、`specs/`、`design/`、`plan.md`、`tasks.md` 是后续阶段的默认上下文。`plan.md` 不应重复罗列这些默认文件；只有当某个默认产物存在特殊注意事项、缺失理由或冲突时才说明。

`plan-change` 不执行代码或文档实现；它只产出实施计划和任务。

## 主动触发

当满足以下情况时，使用 `plan-change`：

- 活跃 roadmap 中某个 change 已经完成 `specify-change` 和必要的 `design-change`。
- 用户确认要把某个 change 拆成执行计划和任务。
- `step-change` 读取 `progress.md` 后发现当前阶段是 `待计划`。
- 后续实现前缺少局部 big picture、任务顺序、依赖关系或额外上下文说明，容易偏离 specs/design/docs。
- change 已有 specs/design，但缺少 `plan.md` 或 `tasks.md`。

不要在以下情况强行进入：

- 目标 change 尚未进入 `.workflow/versions/index.md`。
- 目标 change 缺少 `context.md`。
- change 缺少 specs。
- change 明显需要 HOW design 但尚未完成 `design-change`。
- 用户正在讨论 roadmap、spec 或 design，而不是执行计划。

## change 参数

执行本技能时必须确定目标 change。

- 如果用户传入 `.workflow/versions/<version>/changes/<change-id>/` 路径，使用该 change。
- 如果用户传入 `<version>/<change-id>`，使用对应 version 下的 change。
- 如果用户只传入 change-id，因为活跃区 change-id 应保持全局唯一，先在 `.workflow/versions/index.md` 中定位该 change；若出现多个匹配，列出候选并要求用户选择。
- 如果用户没有传入 change，读取 `.workflow/versions/index.md` 的“当前焦点”。
- 如果当前焦点缺失或不明确，列出 3-4 个处于 `待计划` 或缺少 plan/tasks 的候选 change，并要求用户选择。
- 不要在未确认 change 的情况下创建 plan 或 tasks。

## 输入契约

### 标准输入

每次执行都需要读取并理解这些输入：

```text
.workflow/versions/index.md
.workflow/versions/<version>/changes/<change-id>/context.md
.workflow/versions/<version>/changes/<change-id>/progress.md
.workflow/versions/<version>/changes/<change-id>/specs/
.workflow/templates/changes/plan.md
.workflow/templates/changes/tasks.md
```

读取规则：

- `.workflow/versions/index.md` 用于确认目标 change 已进入活跃 roadmap、所属 version、依赖和当前焦点。
- `context.md` 是 change 看板上下文，提供来源、当前已知边界、version shared 读写约定和背景引用。
- `progress.md` 是阶段状态和局部阻塞的权威来源。
- `specs/` 是本 change 的 WHAT 基线，默认必须先读取。
- `.workflow/templates/changes/plan.md` 与 `.workflow/templates/changes/tasks.md` 是写入结构基础。
- 读取依赖材料后再创建 plan/tasks，不要凭 change-id 或文件名猜测执行策略。

### 条件输入

根据目标 change 的 context、specs、design 状态、依赖和执行风险，按需读取这些输入：

1. **change design**
   - 如果 `design/` 存在，必须读取相关 design 作为 HOW 基线。
   - 如果 `design/` 不存在，只有在 `progress.md`、specs 或 design overview 明确说明无需额外 design，且 specs 足以指导轻量实现时，才可以继续；此时必须在 `plan.md` 说明为什么可以不依赖 design。

2. **已有 plan/tasks**
   - 如果目标 change 已有 `plan.md` 或 `tasks.md`，先读取现有内容后更新，不要直接覆盖。

3. **version shared**
   - 如果 `context.md` 要求读取 `.workflow/versions/<version>/shared/` 下的共享材料，先读取相关文件再制定计划。
   - 读取 shared 后必须判断其中哪些内容是对当前 change 有约束力的上游承诺，例如必须继承的基线、必须使用的模板/工具/流程、必须保留的边界、必须产出的 artifacts、必须写回的共享材料或必须记录的不做事项。
   - 对每条有约束力的 shared 承诺，`plan.md` 必须说明它如何影响执行策略、风险或验证重点；`tasks.md` 必须把它落到具体任务的验收标准、必读上下文、修改范围、依赖或验证要求中。
   - 如果本 change 的执行会产出或更新 version shared，`plan.md` 和 `tasks.md` 必须写明 shared 路径、写入时机、消费者和验收方式。

4. **长期 docs**
   - 读取 `docs/project.md` 获得项目 big picture。
   - 如果 `docs/project.md`、`context.md`、specs 或 design 指向相关 specs/design/architecture/runbooks/research，按需继续读取。
   - 如果 `docs/project.md` 没有覆盖但该背景会影响执行策略、风险或验证方式，按照 docs 索引规则层层查找相关文档。

5. **依赖 change**
   - 如果 versions index 中目标 change 声明依赖，读取依赖 change 的 `context.md`、`progress.md` 和足以判断任务输入的产物。
   - 如果依赖未完成但已有中间产物足以支撑部分计划，必须在 `plan.md` 和 `tasks.md` 中明确哪些任务可先做、哪些任务被阻塞。

6. **项目文件与代码**
   - 如果现有代码结构、API、数据模型、UI 架构、测试、CI、配置或脚本会影响任务拆解，按需读取相关文件。
   - `plan.md` 的额外上下文必须具体到路径；不要只写“参考代码”或“参考 docs”。

7. **外部或环境上下文**
   - 如果执行依赖外部仓库、本地源码、第三方服务、数据迁移、权限、环境变量、长驻进程、后台服务或人工确认，按需读取或记录。
   - 如果缺少这些信息会让任务不可执行，记录为阻塞，不要产出看似完整但无法执行的 tasks。

## 输出契约

### 标准输出

每次成功完成后，必须创建或更新：

```text
.workflow/versions/<version>/changes/<change-id>/plan.md
.workflow/versions/<version>/changes/<change-id>/tasks.md
.workflow/versions/<version>/changes/<change-id>/progress.md
```

标准输出要求：

- `plan.md` 明确 change 目标、局部 big picture、执行策略、任务顺序依据、上游承诺投影、额外上下文、依赖与阻塞、并行机会、风险与验证重点、不做事项。
- `tasks.md` 将计划拆成可执行、可验收任务，每个任务能追溯到 plan/spec/design/docs/version shared，且包含必读上下文、修改范围、依赖、并行判断和任务承诺清单。
- `plan.md` 不重复粘贴 context/spec/design 全文，也不堆砌默认 change 目录文件清单。
- `tasks.md` 不包含模糊大任务；每个任务应能独立执行和验收。
- `progress.md` 的 plan/tasks 产物检查与当前阶段保持一致，除非由 `step-change` 统一更新。

### 条件输出

根据执行结果，按需产生这些输出：

1. **无额外上下文说明**
   - 如果不需要默认 change 目录之外的额外上下文，`plan.md` 必须写明“无额外上下文；默认读取本 change 目录产物”。

2. **version shared 执行任务**
   - 如果本 change 需要写入或消费 version shared，必须在 `plan.md` 说明 shared 的作用和上游承诺投影，在 `tasks.md` 中安排具体读写、验证或回写任务。
   - 如果 shared 只是背景而不形成当前 change 的执行约束，必须在 `plan.md` 简短说明“不形成任务约束”的理由，避免后续 implement 阶段把必须继承的基线降级为参考资料。

3. **阻塞记录**
   - 如果 specs/design 缺失、上下文不足、依赖未满足、外部环境不明或任务无法验收，将 `progress.md` 写为 `阻塞` 或在汇报中说明阻塞。

4. **progress 更新**
   - 如果 `plan.md` 与 `tasks.md` 已补齐且无阻塞，将当前阶段推进到 `待实现`，并把产物检查中的 plan/tasks 标记为已完成。
   - 如果本技能由 `step-change` 调用且 `step-change` 会统一更新 progress，保证 plan/tasks 文件存在并在汇报中说明可进入 `implement-change`。

5. **用户可读摘要**
   - 完成后简短说明目标 change、创建/更新的 plan/tasks、额外上下文、关键依赖、当前阶段结果和下一步。

## 不负责

`plan-change` 不负责：

- 规划 roadmap、新建 version 或新建 change。
- 改写 specs。
- 改写 design。
- 执行实现或修改业务代码。
- 做 verify。
- 把内容沉淀进长期 docs。
- 归档 version。

工作流层面的直接衔接只有：

- 上游：缺少 specs 时回到 `specify-change`；缺少必要 design 时回到 `design-change`。
- 下游：plan/tasks 完成后进入 `implement-change`，通常由 `step-change` 分发。

## 状态检查

确认目标 change 后，先检查当前状态：

1. `.workflow/versions/<version>/changes/<change-id>/` 是否存在。
2. `context.md` 是否存在。
3. `progress.md` 是否存在。
4. `specs/` 是否存在。
5. `design/` 是否存在，或是否有充分理由不需要 design。
6. `plan.md` 是否已存在。
7. `tasks.md` 是否已存在。
8. `progress.md` 中当前阶段是否为 `待计划`，或是否仍缺少 plan/tasks。

根据状态处理：

- 如果 change 缺少 `context.md` 或 `progress.md`，停止并提示先回到 `plan-versions` 补齐 change 骨架。
- 如果 specs 缺失，停止并提示先执行 `specify-change`。
- 如果 design 缺失且 change 明显需要 HOW 设计，停止并提示先执行 `design-change`。
- 如果 design 缺失但 specs 足以指导轻量实现，必须在 `plan.md` 中说明为什么可以不依赖 design。
- 如果 plan/tasks 已存在，读取现有内容后更新，不要直接覆盖。

## 依赖规划规则

`plan-change` 必须显式分析依赖，不能只把 design 机械拆成任务。

依赖分析至少包括：

- 阶段依赖：哪些工作必须先完成，哪些工作可以后置。
- 任务依赖：每个任务依赖哪些前置任务、spec、design、version shared 或长期 docs。
- 文件依赖：任务是否会修改同一文件或同一模块，从而不能并行。
- 验证依赖：哪些验证必须在实现前准备，哪些验证在实现后执行。
- shared 依赖：哪些任务需要读取或写入 version shared，这些 shared 对其他 changes 的影响，以及 shared 中哪些上游承诺必须投影到当前任务。
- 外部依赖：第三方服务、数据迁移、配置、权限、环境、长驻进程/后台服务管理方式或人工确认。

任务排序规则：

1. 先放阻塞所有后续工作的基础任务。
2. 再放可以独立完成和验证的核心任务。
3. 最后放集成、验证、清理和横切事项。
4. 可并行任务必须明确标记，并确保它们不依赖同一未完成产物，也不会修改同一文件造成冲突。
5. 如果某个任务依赖未完成事项，必须在 tasks 中写明依赖，而不是隐藏在描述里。

`tasks.md` 必须包含依赖说明；`plan.md` 必须说明为什么采用该任务顺序。

## plan 内容规则

`plan.md` 的核心价值是防止后续 `implement-change` 走偏；它应回答“为什么这样执行、先后关系是什么、额外还要看什么”，而不是重复当前 change 目录已有内容。

因此 `plan.md` 必须包含：

- change 目标和范围。
- 局部 big picture：本 change 在当前 version、version shared、后续 changes 或系统演进中的作用。
- 执行策略：如何从 specs/design 走到可执行任务。
- 任务顺序依据：为什么这样排序，哪些任务阻塞后续。
- 上游承诺投影：spec/design/docs/version shared 中哪些承诺会约束实现，它们分别落到哪些任务、验收标准或验证点；不形成任务约束的 shared/docs 也要说明理由。
- 额外上下文：默认 change 目录之外需要读取的长期 docs、version shared、外部仓库、本地源码、代码入口、环境/权限/人工确认；如无则明确说明。
- 依赖与阻塞：阶段依赖、任务依赖、shared 依赖、外部依赖。
- 并行机会与不可并行原因。
- 风险与验证关注点。
- 明确不做什么。

`plan.md` 不应包含：

- 当前 change 目录默认产物的逐项清单。
- context、specs、design 的全文摘抄或路径堆砌。
- 每个任务的详细验收标准；这些写入 `tasks.md`。
- 长篇复述已经在 spec/design/research 中存在的结论。

长期 docs、version shared 或额外上下文引用必须具体到路径，例如：

```text
.workflow/versions/<version>/shared/<topic>.md
docs/specs/<capability>/spec.md
docs/design/<topic>.md
docs/architecture/<topic>.md
docs/runbooks/<topic>.md
/home/deploy/repos/<repo>/...
src/...
```

不要只写“参考 docs”或“参考架构文档”。

## 核心执行循环

1. 确认目标 change。
2. 检查 change 当前状态。
3. 读取标准输入，理解 change context、specs、当前阶段和 plan/tasks 模板。
4. 按条件输入规则读取必要的 design、已有 plan/tasks、version shared、长期 docs、依赖 change、项目文件、代码或外部/环境上下文。
5. 判断执行边界、依赖、风险和验证关注点。
6. 提取上游承诺投影：从 specs/design/docs/version shared 中识别必须继承、必须使用、必须产出、必须验证或必须避免的约束，并决定每条约束落到哪个任务或为什么不形成任务约束。
7. 分析任务依赖、阶段顺序、shared 读写和并行机会。
8. 创建或更新：

```text
.workflow/versions/<version>/changes/<change-id>/plan.md
.workflow/versions/<version>/changes/<change-id>/tasks.md
```

9. 使用 `.workflow/templates/changes/plan.md` 与 `.workflow/templates/changes/tasks.md` 作为结构基础。
10. `tasks.md` 中每个任务必须可执行、可验收，并能追溯到 plan/spec/design/docs/version shared。
11. `tasks.md` 必须包含任务依赖、可并行性说明和任务承诺清单；任务承诺清单用于让 `implement-change` 在执行前和完成前核对。
12. 不要在 `plan-change` 中修改代码或长期 docs。
13. 创建后验证两个文件都存在，按需更新 `progress.md`。
14. 简短汇报进度和下一步。

## implement-change 可执行性规则

`plan-change` 的产出必须让后续 `implement-change` 通过“默认 change 目录产物 + plan.md + tasks.md + plan/tasks 指定的额外上下文”恢复执行上下文。

因此必须避免以下问题：

- `plan.md` 没有局部 big picture，只是文件清单。
- `plan.md` 没有说明额外上下文：读取了哪些、如何使用，或为什么没有额外上下文。
- `plan.md` 没有说明任务顺序、依赖、并行判断和风险验证重点。
- `plan.md` 重复粘贴 context/spec/design/research 结论，掩盖真正的执行策略。
- `tasks.md` 没有写清依赖关系。
- `tasks.md` 没有标明可并行性或同文件冲突。
- `tasks.md` 粒度过大，无法独立完成和验收。
- `tasks.md` 缺少验收标准。
- `tasks.md` 无法追溯到 spec/design/plan/docs/version shared。
- `tasks.md` 没有说明修改范围或任务级必读上下文。
- `tasks.md` 没有把上游承诺转成任务承诺清单，导致 implement 阶段只能把关键约束当背景参考。
- 涉及 version shared 的 change 没有说明 shared 的读取、写入、回写任务，或没有说明 shared 中必须继承的约束如何落到任务。

如果无法满足这些要求，不要产出看似完整但无法执行的 plan/tasks；应把缺口记录为阻塞项或开放问题。

## plan 写入格式

优先使用模板：

```text
.workflow/templates/changes/plan.md
```

输出路径：

```text
.workflow/versions/<version>/changes/<change-id>/plan.md
```

`plan.md` 至少包含：

- Change 目标
- 局部 big picture
- 执行策略
- 任务顺序依据
- 上游承诺投影
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
.workflow/versions/<version>/changes/<change-id>/tasks.md
```

`tasks.md` 至少包含：

- 执行顺序
- 分组任务
- 每个任务的验收标准
- 每个任务的任务承诺清单
- 对应 plan/spec/design/docs/version shared 引用
- 任务级必读上下文
- 修改范围
- 阻塞项或依赖关系
- 可并行标记与不可并行原因
- 依赖图
- 建议执行顺序

## progress.md 更新规则

`progress.md` 是 change 阶段状态的权威来源。

完成 `plan-change` 后：

- 如果 `plan.md` 与 `tasks.md` 已补齐且无阻塞，将 `progress.md` 更新为：`当前阶段：待实现`。
- 在“产物检查”中把 plan/tasks 标记为已完成。
- 在“进展记录”追加本次创建或更新的 plan/tasks 路径。
- 如果仍有阻塞，将当前阶段写为 `阻塞`，并记录阻塞原因。
- 如果本技能由 `step-change` 调用且 `step-change` 会统一更新 progress，也必须保证产物存在并在汇报中说明可进入 `implement-change`。

## 完成后输出

完成后简短汇报：

- 目标 change。
- 创建或更新了 `plan.md` 和 `tasks.md`。
- `plan.md` 记录了哪些额外上下文，或为什么没有额外上下文。
- 是否涉及 version shared 读写。
- 当前阶段已完成：`plan-change`。
- 解锁的下一步：`implement-change`。
- 如果仍有阻塞，说明阻塞原因。

## 退出条件

当满足以下条件时，`plan-change` 可以结束：

- 目标 change 已确认。
- change context、specs、design 或 design 缺省理由已读取。
- 相关 version shared、长期 docs、外部上下文已按需定位；如未读取，已在 `plan.md` 中说明理由。
- 任务依赖、阶段顺序、shared 读写和并行机会已分析。
- `plan.md` 足以指导后续实现不偏离 specs/design/docs/context，且没有重复默认 change 上下文清单。
- `tasks.md` 已将计划拆成可执行、可验收任务。
- 没有修改代码或长期 docs。
- 已验证 `plan.md` 和 `tasks.md` 存在。
- 下一步可以进入 `implement-change`。
