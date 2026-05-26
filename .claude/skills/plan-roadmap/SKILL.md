---
name: plan-roadmap
description: 基于 `.workflow/intents.md` 全量规划或更新 `.workflow/versions/index.md` 活跃版本队列，并在 `.workflow/versions/<version>/changes/<change-id>/` 下建立 change context/progress。用户要求规划路线图、安排优先级、决定下一批 change、或需要补齐 big picture 前置 change 时使用。
---

# plan-roadmap 技能

## 定位

`plan-roadmap` 用于从全局 big picture 视角规划当前活跃 versions 和 changes：全量读取 `.workflow/intents.md`，判断哪些意图可以进入版本编排，哪些需要等待技术铺垫、调研、设计、验证或文档类 change 补齐 big picture，然后更新 `.workflow/versions/index.md` 与对应 change 看板上下文。

`plan-roadmap` 维护的是 roadmap 层循环：

```text
获取意图 → 规划 version/change → 通过 change 实现/验证/补齐 big picture → 沉淀后继续下一轮规划
```

`.workflow/versions/index.md` 是当前活跃 versions 和 changes 队列入口：

- 一个 version 对应一组服务同一阶段目标的 changes。
- 活跃 change 路径是 `.workflow/versions/<version>/changes/<change-id>/`。
- version 内多个 changes 共享的运行态材料放在 `.workflow/versions/<version>/shared/`。
- index 只记录活跃队列、依赖、当前焦点和全局阻塞；不保存 change 完整上下文，也不维护单个 change 阶段状态。
- change 的看板上下文写在 `context.md`，阶段状态和局部阻塞写在 `progress.md`。
- 已归档 version 不保留在 `.workflow/versions/index.md`；归档后进入 `.workflow/archive/versions/`。旧归档结构如已存在，保持不改。

## 主动触发

当满足以下情况时，使用 `plan-roadmap`：

- `.workflow/intents.md` 中存在待分配意图。
- 用户确认某个意图已经足够清楚，可以安排进入路线图。
- 用户询问“下一步做什么”“如何排期”“这些需求怎么安排”“下一批 change 怎么规划”。
- 当前 big picture 不足，需要规划调研、设计、验证、CI/CD、文档治理或其他前置 change 来解锁后续规划。
- `.workflow/versions/index.md` 与 `.workflow/versions/<version>/changes/` 之间可能不一致，需要重排、插入、更新或收口。

不要在以下情况强行进入：

- 意图仍处于“待讨论”，还不足以判断是否进入 roadmap。
- 用户只是要求继续澄清想法。
- 用户明确要求直接推进某个已有 change。

## 输入契约

### 标准输入

每次执行都需要读取并理解这些输入：

```text
.workflow/intents.md
.workflow/versions/index.md
.workflow/templates/versions/index.md
.workflow/templates/changes/context.md
.workflow/templates/changes/progress.md
.workflow/versions/
```

读取规则：

- `.workflow/intents.md` 必须全量加载；不要采用“从底部往上读、只处理最近意图”的策略。只有全量理解才能避免遗漏意图之间的关系、重复规划或错误分配。
- `.workflow/versions/index.md` 是主要写入目标，只记录活跃 versions/changes 队列、依赖、当前焦点、暂缓/放弃和全局阻塞。
- `.workflow/templates/versions/index.md` 是 versions index 写入结构来源。
- `.workflow/templates/changes/context.md` 和 `.workflow/templates/changes/progress.md` 是新增 change 骨架结构来源。
- `.workflow/versions/` 用于核对 version 目录、version shared、change 目录、context/progress 和已有运行态产物。

### 条件输入

根据每条意图、候选 version、候选 change 或 roadmap 调整点的重要性与不确定性，逐条判断是否需要加载这些输入：

1. **Project big picture**
   - 如果存在 `docs/project.md`，先读取它获得项目定位、用户场景、领域概念、工程边界、开发准则和重要文档入口，再做 version/change 编排。
   - 如果 `docs/project.md` 已列出与当前规划相关的 specs、design、architecture、runbooks 或 research，按需继续读取这些文档，避免规划出与长期基线冲突的 change。

2. **长期文档索引链路**
   - 如果某个规划判断很重要，但 `docs/project.md` 没有覆盖，按照 docs 索引规则层层查找：先读当前层 `index.md`，再进入相关子目录读取子目录 `index.md`，最后读取目标文档。
   - 只读取会影响 roadmap 编排、依赖、边界、风险或去重判断的文档；不要为了“全面了解”展开整棵 docs。

3. **运行态 version/change 上下文**
   - 当需要判断某个意图是否已被现有 change 承接、是否和现有 change 重叠、是否依赖 version shared、或是否需要补齐骨架时，按需读取：

```text
.workflow/versions/<version>/shared/
.workflow/versions/<version>/changes/<change-id>/context.md
.workflow/versions/<version>/changes/<change-id>/progress.md
.workflow/versions/<version>/changes/<change-id>/specs/
.workflow/versions/<version>/changes/<change-id>/design/
.workflow/versions/<version>/changes/<change-id>/plan.md
.workflow/versions/<version>/changes/<change-id>/tasks.md
.workflow/versions/<version>/changes/<change-id>/verify.md
```

   - 读取现有产物是为了判断 roadmap 编排、big picture 是否足够和 change 阶段，不把这些产物内容复制进 index。

4. **归档上下文**
   - 当需要避免重复规划、理解已完成版本、复用历史边界或判断某条意图是否已经完成时，按需读取：

```text
.workflow/archive/versions/<version>/
```

   - 旧归档结构如 `.workflow/archive/roadmap.md` 或 `.workflow/archive/changes/` 已存在，保持不改；只有需要历史追溯时才按需读取，不做结构迁移。

5. **项目文件与代码**
   - 如果 roadmap 编排依赖当前仓库事实，例如目录是否存在、测试/CI 是否已有、能力边界是否已经实现、某个模块是否可承接 change，先读取相关文件或搜索代码，再决定 change 拆分、依赖和优先级。

6. **外部或专题资料**
   - 如果当前规划依赖外部技术事实、库/框架文档、社区反馈、竞品调研或技术可行性信息，按可用技能列表调用相应的研究、检索或文档技能。
   - 外部资料只用于支持 roadmap 判断；不要把调研过程写进 versions index，只在 change `context.md` 或 version shared 中记录必要的背景引用。

## 输出契约

### 标准输出

每次成功规划或更新 roadmap 后，必须保证这些输出成立：

```text
.workflow/versions/index.md
.workflow/intents.md
.workflow/versions/<version>/changes/<change-id>/context.md
.workflow/versions/<version>/changes/<change-id>/progress.md
```

标准输出要求：

- `.workflow/versions/index.md` 使用 `.workflow/templates/versions/index.md` 的结构，包含当前焦点、活跃 versions、暂缓/放弃、阻塞项和下一步入口。
- 每个活跃 version 都有目标、范围、shared 路径和 changes 清单。
- 每个活跃 change 都有 change-id、一句话目标、来源、路径、context 路径、progress 路径和依赖。
- index 中每个活跃 change 都对应 `.workflow/versions/<version>/changes/<change-id>/`，且至少包含 `context.md` 与 `progress.md`。
- 进入 roadmap 的用户意图从 `.workflow/intents.md` 的“待分配”移出，并完整写入对应 change 的 `context.md`。
- 新增或更新的 change 在 `progress.md` 中记录当前阶段、局部阻塞、产物检查和进展记录。

### 条件输出

根据规划结果，按需产生这些输出：

1. **新增 version 目录**
   - 当规划产生新 version 时，创建 `.workflow/versions/<version>/changes/`。
   - 如果该 version 内多个 changes 需要共享材料，创建或指向 `.workflow/versions/<version>/shared/`。

2. **新增 change 骨架**
   - 当规划产生新 change 时，创建：

```text
.workflow/versions/<version>/changes/<change-id>/context.md
.workflow/versions/<version>/changes/<change-id>/progress.md
```

   - `context.md` 记录用户原始意图、主动规划上下文、当前已知边界、协作与共享上下文、背景引用。
   - 如果这个 change 要产出 version 内共享材料，`context.md` 必须说明写入哪个 shared 路径、内容是什么、供谁使用。
   - 如果这个 change 需要消费 version 内共享材料，`context.md` 必须说明读取哪个 shared 路径以及用途。

3. **更新现有 change**
   - 当待分配意图应并入现有 change 时，更新该 change 的 `context.md` 与 index 对应条目，不创建重复 change。
   - 如果现有 change 缺少 `context.md` 或 `progress.md`，按模板补齐缺失骨架，不覆盖已有内容。

4. **暂缓或保留待分配**
   - 如果 big picture 暂时不足，且需要等待某个调研/设计/验证/文档类 change 完成后才能分配意图，不要强行分配；在 `.workflow/intents.md` 保留该意图，或在 index 的“阻塞项/下一步”说明依赖的前置 change。
   - 当意图明确暂缓或放弃时，从 `.workflow/intents.md` 移出，并写入 `.workflow/versions/index.md` 的“暂缓 / 放弃”，说明状态和原因。

5. **roadmap 重排或修复**
   - 当现有 index 与 `.workflow/versions/` 不一致时，修复路径、依赖、当前焦点或缺失骨架。
   - 当新意图改变优先级或依赖关系时，更新 version/change 顺序、依赖和当前焦点。

6. **用户可读摘要**
   - 完成后简短说明：处理了哪些意图、规划/更新了哪些 version/change、哪些意图保留待分配/暂缓/放弃、当前焦点是什么。

## 不负责

`plan-roadmap` 不负责：

- 继续追问并澄清原始意图。
- 编写单个 change 的 WHAT/HOW、任务清单、实现、验证证据或长期文档沉淀。
- 修改业务代码。
- 执行归档。

工作流层面的直接衔接只有：

- 上游：意图仍不清楚时，回到 `clarify-intents`。
- 下游：roadmap 和 change 骨架就绪后，建议使用 `step-change` 推进当前焦点 change。

## 核心执行循环

每次执行按以下循环推进：

1. 全量读取 `.workflow/intents.md`，并读取标准输入中列出的 versions index、模板和 version/change 目录状态。
2. 建立当前 big picture：哪些意图可直接分配，哪些意图需要等待前置 change 补齐信息，哪些意图重复、冲突、暂缓或放弃。
3. 对每条意图、候选 version、候选 change 或 roadmap 调整点，逐条按条件输入规则判断是否需要引入新的背景输入。
4. 判断处理方式：
   - 新建 version。
   - 加入现有 version。
   - 新建 change。
   - 并入现有 change。
   - 拆成多个 changes。
   - 规划必要的铺垫、调研、设计、验证、CI/CD、文档治理或其他 big picture 补齐 change。
   - 保留待分配，等待前置 change 结果。
   - 暂缓或放弃。
5. 为新增或变更的 version/change 建立或更新骨架，模板来自 `.workflow/templates/versions/` 与 `.workflow/templates/changes/`。
6. 更新 `.workflow/versions/index.md` 的活跃 versions/changes、依赖、当前焦点、暂缓/放弃、阻塞项和下一步入口。
7. 只从 `.workflow/intents.md` 移出已经进入 roadmap、暂缓或放弃的意图；等待前置结果才能分配的意图继续保留。
8. 检查 index 中每个活跃 change 都对应到 `.workflow/versions/<version>/changes/<change-id>/`，且至少包含 `context.md` 与 `progress.md`。
9. 向用户简短报告规划结果，并建议用 `step-change` 推进当前焦点 change。

## Agent 主动规划规则

用户通常只会表达业务目标或体验目标，不一定知道需要哪些技术前置工作。`plan-roadmap` 必须基于项目现状主动识别这些缺口。

当 big picture 不足以有效规划全部 intents 时，优先规划能补齐 big picture 的 changes，例如：

- 技术调研或方案对比。
- 可行性验证或 PoC。
- 架构边界梳理。
- 测试、安全、性能、观测或 CI/CD 基础设施。
- 文档治理或共享基线整理。
- 数据核查、迁移准备或兼容性验证。

这些主动规划出的 change 必须在 `context.md` 写清楚规划背景、需要解决的问题、支撑的后续目标，以及是否需要写入 version shared 供后续规划或 changes 使用。

## version 划分规则

version 是当前开发队列中的可收口开发批次，不是单个需求，也不是纯时间编号。

一个 version 应满足：

- 有共同目标：其中的 changes 服务于同一个阶段性目标。
- 可独立收口：完成后可以整体收口并归档。
- 边界清晰：能说明本 version 做什么、不做什么。
- 依赖合理：version 内 changes 可以并行或按明确顺序推进。
- 数量可控：不要把过多无关 changes 塞进同一个 version。
- 共享明确：如果多个 changes 需要通信，通过 version shared 和各自 `context.md` 显式约定读写路径。

适合新建 version 的情况：

- 一组意图共同构成一个可交付阶段。
- 需要先完成铺垫内容，才能安全推进用户意图。
- 新意图与当前活跃 version 目标不一致。
- 新意图依赖当前 version 完成后才能推进。
- 风险、验证方式或发布节奏明显不同。
- 当前 version 已经过大，继续加入会影响收口。

不要因为每个意图都创建一个 version；也不要把目标无关的 changes 合并进同一个 version。

version 名称应语义化，建议格式：

```text
v<major>.<minor>-<theme>
```

## change 划分规则

change 是单一可验证变更单元。它可以承接一个或多个用户意图，也可以是为了支撑这些意图而规划的技术铺垫、验证、CI/CD、文档治理、迁移准备、工程整理或 big picture 补齐工作。

change 应使用描述性语义标识，并保持范围聚焦：

- 一个 change 只表达一个主要变更意图。
- change 名称描述“要改变什么”，不要使用 `update`、`changes`、`wip` 等泛化名称。
- change 可以影响多个 capability，但必须有一个清晰主线。
- change 应足够小，能独立完成后续阶段并验收。
- change 也应足够完整，避免把强耦合内容拆成多个互相阻塞的小 change。
- change-id 在活跃区保持全局唯一，即使路径已经位于 version 下。

适合拆成多个 changes 的情况：

- 涉及不同 capability，且可以独立设计、实现、验证。
- 一部分用于补齐 big picture，另一部分依赖前者结果进行后续规划或实现。
- 存在明确先后依赖，可以先交付基础能力，再交付增强能力。
- 风险类型不同，例如 UI 体验、数据迁移、安全权限、外部接口。
- 不同 change 的完成标准不同。

适合合并为一个 change 的情况：

- 多个意图必须一起实现才有意义。
- 拆开后每个部分都无法独立验证。
- 拆分只会制造额外协调成本，没有降低风险。
- 它们修改同一能力边界，且共享同一设计结论。

## index 字段规则

`plan-roadmap` 写入 `.workflow/versions/index.md` 时，必须使用 `.workflow/templates/versions/index.md` 的结构。

每个活跃 version 至少包含：

- version 名称。
- 目标：本 version 要达成的阶段性结果。
- 范围：明确做什么、不做什么。
- shared：`.workflow/versions/<version>/shared/`。
- changes：本 version 下的 change 清单。

每个活跃 change 至少包含：

- change-id。
- 目标：一句话说明这个 change 要改变什么。
- 来源：用户意图 / 主动规划 / 混合。
- 路径：`.workflow/versions/<version>/changes/<change-id>/`。
- context：`.workflow/versions/<version>/changes/<change-id>/context.md`。
- progress：`.workflow/versions/<version>/changes/<change-id>/progress.md`。
- 依赖：无 / change-id 列表。

以下内容不得写入 versions index：

- 原始意图全文：只写入 change 的 `context.md`。
- 主动规划的完整背景：只写入 change 的 `context.md`。
- change 当前阶段、局部阻塞：只写入 change 的 `progress.md`。
- spec/design/plan/tasks/verify 的中间过程：只写入对应 change 目录。

## change 骨架

新增 change 时，至少创建：

```text
.workflow/versions/<version>/changes/<change-id>/
├── context.md
└── progress.md
```

`context.md` 使用模板：

```text
.workflow/templates/changes/context.md
```

该文件是 change 的看板上下文，记录来源上下文、当前已知边界、协作与共享上下文、背景引用。

`progress.md` 使用模板：

```text
.workflow/templates/changes/progress.md
```

该文件记录 change 当前阶段、局部阻塞和进展记录。新增 change 默认阶段通常是 `待规格`；如果已存在 specs/design/plan/tasks/verify 等产物，应按现有产物设置到实际阶段。

如果 change 已存在，只补齐缺失骨架或必要字段，不覆盖已有内容。

## 与 archive 的关系

归档以 version 为单位执行，不以单个 change 为单位执行。

目标归档结构是：

```text
.workflow/archive/versions/<version>/
├── shared/
└── changes/
    └── <change-id>/
```

规则：

- `.workflow/archive/versions/` 保存已归档 version 的完整上下文。
- `plan-roadmap` 平时不主动全量读取 archive，只在需要历史 big picture、追溯或避免重复规划时按需读取。
- 已经存在的旧归档目录不用迁移或修改。

## 退出条件

当满足以下条件时，`plan-roadmap` 可以结束：

- 新处理的意图已进入活跃 roadmap、继续保留待分配、暂缓或放弃，并且原因明确。
- `.workflow/versions/index.md` 有清晰的活跃 versions 与 changes。
- `.workflow/versions/index.md` 有明确当前焦点和下一步入口；具体阶段由当前 change 的 `progress.md` 决定。
- index 中每个活跃 change 都能对应到 `.workflow/versions/<version>/changes/<change-id>/`。
- 新增或更新的 change 至少包含 `context.md` 与 `progress.md` 骨架。

退出前向用户简短报告规划结果，并建议使用 `step-change` 推进当前焦点 change。
