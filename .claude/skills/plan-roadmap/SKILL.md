---
name: plan-roadmap
description: 基于 `.workflow/intents.md` 规划或更新 `.workflow/roadmap.md` 队列，并将完整来源意图与进度状态写入各 change 本地文件。用户要求规划路线图、安排优先级、决定下一批 change 时使用。
---

# plan-roadmap 技能

## 定位

`plan-roadmap` 用于把 `.workflow/intents.md` 中“待分配”的用户原始意图，编排进当前开发路线图 `.workflow/roadmap.md`，并为对应 change 建立本地来源与进度文件。

`roadmap.md` 是当前活跃 versions 和 changes 队列的索引：

- 一个 version 对应多个 change。
- 每个 roadmap 中的 change 必须对应 `.workflow/changes/<change-id>/`。
- roadmap 只记录全局队列、依赖和当前焦点；单个 change 的阶段状态、下一步和局部阻塞写在 `.workflow/changes/<change-id>/progress.md`。
- roadmap 不保存活跃 change 的原始意图全文；完整来源意图和规划来源写在 `.workflow/changes/<change-id>/intents.md`。
- 已归档 version 不保留在 `.workflow/roadmap.md`，而是进入 `.workflow/archive/roadmap.md`。

`plan-roadmap` 不只是被动消费 intents。面对不懂技术或只表达业务目标的用户时，Agent 需要主动补齐实现路径中的必要工程工作。

也就是说，roadmap 中的 change 来源可以是：

- 用户原始意图。
- 为实现用户意图必须先完成的技术铺垫。
- 为降低风险必须先完成的验证工作。
- 为保证质量必须先建立的测试、安全、观测或 CI/CD 能力。
- 为让项目可持续推进必须先补齐的目录、治理、模板或文档结构。


## 主动触发

当满足以下情况时，AI 可以主动进入 `plan-roadmap`：

- `.workflow/intents.md` 中存在“待分配”意图。
- 用户确认某个意图已经足够清楚，可以安排进入路线图。
- 用户询问“下一步做什么”“如何排期”“这些需求怎么安排”。
- roadmap 与 `.workflow/changes/` 之间可能不一致，需要重排、插入、更新或删除。

不要在以下情况强行进入：

- 意图仍处于“待讨论”。
- 用户只是要求继续 clarify。
- 用户明确要求进入 design 或实现。

## 输入

执行前读取：

```text
.workflow/intents.md
.workflow/roadmap.md
.workflow/templates/roadmap.md
.workflow/templates/changes/intents.md
.workflow/templates/changes/progress.md
.workflow/changes/
```

为了获得 big picture，按需读取：

```text
docs/
.workflow/archive/roadmap.md
.workflow/archive/changes/
```

读取规则：

- 读取 `.workflow/intents.md` 时，优先从“待分配”底部往上读。
- 先处理最近追加的待分配意图。
- `.workflow/roadmap.md` 是主要写入目标，只记录活跃 versions/changes 队列和当前焦点。
- `.workflow/archive/roadmap.md` 和 `.workflow/archive/changes/` 只在需要历史追溯、避免重复规划或理解已完成版本时按需读取。

## 不负责

`plan-roadmap` 不负责：

- 重新澄清意图。
- 设计架构、接口、UI、数据或异常方案。
- 拆分具体 tasks。
- 创建或执行代码实现。
- 做验证、沉淀或归档。

这些动作交给后续 workflow 技能。

## 执行规则

1. 从 `.workflow/intents.md` 的“待分配”底部往上读取。
2. 跳过“待讨论”的意图；必要时建议回到 `clarify-intents`。
3. 结合 `docs/`、`.workflow/changes/`、`.workflow/archive/` 和现有 `roadmap.md` 判断 big picture。
4. 对待分配意图进行 roadmap 编排：
   - 新建 version。
   - 重排 version 顺序。
   - 插入 change。
   - 更新 change 所属 version、目标、依赖或优先级。
   - 删除、暂缓或放弃不再需要的 roadmap 条目。
5. 为新增或变更的 change 建立/更新骨架，模板来自 `.workflow/templates/changes/`：
   - `.workflow/changes/<change-id>/intents.md`
   - `.workflow/changes/<change-id>/progress.md`
6. 写入 roadmap 时，必须为每个 version/change 明确以下字段：
   - version：目标、范围。
   - change：change-id、一句话目标、来源、路径、intents 路径、progress 路径、依赖。
7. 保证 `.workflow/roadmap.md` 中每个活跃 change 都对应到 `.workflow/changes/<change-id>/`，且至少包含 `intents.md` 与 `progress.md`。
8. 从 `.workflow/intents.md` 的“待分配”中移除已经处理的意图；进入 roadmap 的完整来源意图写入对应 change 的 `intents.md`，暂缓或放弃的写入 roadmap 的“暂缓 / 放弃”。
9. 更新 `.workflow/roadmap.md` 的“当前焦点”和“下一步”；具体阶段和下一步技能只写入当前 change 的 `progress.md`。
10. 不读取全部 archive；归档内容只按需读取。

## Agent 主动规划规则

用户通常只会表达业务目标或体验目标，不一定知道需要哪些技术前置工作。`plan-roadmap` 必须基于项目现状主动识别这些缺口。

当用户意图缺少技术路径时，Agent 应主动考虑：

- 是否需要先初始化项目结构。
- 是否需要补齐治理文件、模板、索引或加载规则。
- 是否需要先做技术验证或 PoC。
- 是否需要先建立测试、安全、性能、观测或 CI/CD 基础设施。
- 是否需要先做数据核查、迁移准备或兼容性验证。
- 是否需要把一个业务意图拆成“铺垫 change + 功能 change + 验证 change”。

这些主动规划出的 change 必须在 change 骨架中写清楚“规划来源”，说明它为什么不是直接来自某条用户意图但仍然必要。

## version 划分规则

version 是当前开发队列中的可收口开发批次，不是单个需求，也不是纯时间编号。

一个 version 应满足：

- 有共同目标：其中的 changes 服务于同一个阶段性目标。
- 可独立收口：完成后可以整体 verify、distill、archive。
- 边界清晰：能说明本 version 做什么、不做什么。
- 依赖合理：version 内 changes 可以并行或按明确顺序推进。
- 数量可控：不要把过多无关 changes 塞进同一个 version。

version 不一定都直接对应用户意图。为了让后续意图可实施，可以规划必要的铺垫型 version，例如：

- 项目初始化。
- 基础目录和治理结构。
- 技术验证或 PoC。
- 压力测试、性能测试、基准测试。
- 迁移准备、数据核查或观测能力建设。
- 安全、测试、CI/CD 等质量基础设施。

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

示例：

```text
v0.1-workflow-foundation
v0.2-quality-alignment
v1.0-public-release
```

## change 划分规则

change 是单一可验证变更单元。它可以承接一个或多个用户意图，也可以是为了支撑这些意图而规划的铺垫、验证、质量或治理工作。

不是所有 change 都必须直接来自 `.workflow/intents.md`。

常见的非 intent 直接来源 change 包括：

- 项目初始化与目录治理。
- 技术验证或 PoC。
- 压力测试、性能测试、基准测试。
- 测试、CI/CD、安全、观测等质量基础设施。
- 数据核查、迁移准备、兼容性验证。
- 为后续用户意图提供前置条件的重构或工程整理。

change 应使用描述性语义标识，并保持范围聚焦：

- 一个 change 只表达一个主要变更意图。
- change 名称描述“要改变什么”，不要使用 `update`、`changes`、`wip` 等泛化名称。
- change 可以影响多个 capability，但必须有一个清晰主线。
- change 应足够小，能独立完成 design、implementation、verify。
- change 也应足够完整，避免把强耦合内容拆成多个互相阻塞的小 change。

适合拆成多个 changes 的情况：

- 涉及不同 capability，且可以独立设计、实现、验证。
- 一部分是行为契约变化，另一部分是长期 HOW/架构治理。
- 存在明确先后依赖，可以先交付基础能力，再交付增强能力。
- 风险类型不同，例如 UI 体验、数据迁移、安全权限、外部接口。
- 不同 change 的完成标准不同。

适合合并为一个 change 的情况：

- 多个意图必须一起实现才有意义。
- 拆开后每个部分都无法独立验证。
- 拆分只会制造额外协调成本，没有降低风险。
- 它们修改同一能力边界，且共享同一设计结论。

change 的质量标准：

- 能用一句话说明为什么存在。
- 能追溯到来源意图或规划原因。
- 能对应一个 `.workflow/changes/<change-id>/` 目录。
- 能独立进入后续 design、implementation、verify。
- 完成后可以随所属 version 一起 archive。

## change-id 规则

`change-id` 是语义化变更标识，不是数字编号。

推荐格式：

```text
<verb>-<object>[-scope]
```

示例：

```text
setup-workflow
clarify-intents
plan-roadmap
distill-change
```

## roadmap 字段规则

`plan-roadmap` 写入 `.workflow/roadmap.md` 时，必须使用 `.workflow/templates/roadmap.md` 的结构。

### Version 字段

每个活跃 version 至少包含：

- version 名称。
- 目标：本 version 要达成的阶段性结果。
- 范围：明确做什么、不做什么。
- changes：本 version 下的 change 清单。

### Change 字段

每个活跃 change 至少包含：

- change-id。
- 目标：一句话说明这个 change 要改变什么。
- 来源：用户意图 / 主动规划。
- 路径：`.workflow/changes/<change-id>/`。
- intents：`.workflow/changes/<change-id>/intents.md`。
- progress：`.workflow/changes/<change-id>/progress.md`。
- 依赖：无 / change-id 列表。

### 不写入 roadmap 的字段

以下内容不得写入 roadmap：

- 原始意图全文：只写入 change 的 `intents.md`。
- change 当前阶段、状态、下一步技能、局部阻塞：只写入 change 的 `progress.md`。
- spec/design/plan/tasks/verify 的中间过程：只写入对应 change 目录。

## change 骨架

新增 change 时，至少创建：

```text
.workflow/changes/<change-id>/
├── intents.md
└── progress.md
```

`intents.md` 使用模板：

```text
.workflow/templates/changes/intents.md
```

该文件记录 change 承接的完整原始意图；如果 change 不是直接来自用户意图，则记录规划原因、前置关系和它支撑的后续目标。

`progress.md` 使用模板：

```text
.workflow/templates/changes/progress.md
```

该文件记录 change 当前阶段、下一步技能、局部阻塞和进展记录。新增 change 默认阶段通常是 `待规格`，下一步技能通常是 `specify-change`；如果已存在 spec/design/plan 等产物，应按现有产物设置到实际阶段。

如果 change 已存在，只补齐缺失骨架或必要字段，不覆盖已有内容。

## roadmap 写入规则

更新：

```text
.workflow/roadmap.md
.workflow/intents.md
.workflow/changes/<change-id>/intents.md
.workflow/changes/<change-id>/progress.md
```

`.workflow/roadmap.md` 只记录活跃 versions/changes 队列、依赖和当前焦点。

写入规则：

- 使用 `.workflow/templates/roadmap.md` 的字段结构。
- 进入活跃 roadmap 的意图，必须从 `.workflow/intents.md` 移出。
- 进入 roadmap 的用户意图，必须完整写入对应 change 的 `intents.md`；roadmap 只引用 `intents.md` 路径，不复制原始意图全文。
- 暂缓或放弃的意图，也必须从 `.workflow/intents.md` 移出，并写入 roadmap 的“暂缓 / 放弃”。
- 主动规划出的 change，必须在 change 的 `intents.md` 写明规划来源和分配说明。
- 新增或更新 change 时，必须创建或更新 `progress.md`，记录当前阶段、下一步技能和局部阻塞。
- roadmap 不写 change 状态或下一步技能；当前最应推进的 version/change 只同步写入“当前焦点”和“下一步”。

## 与 archive 的关系

归档以 version 为单位执行，不以单个 change 为单位执行。

归档后：

```text
.workflow/archive/
├── roadmap.md
└── changes/
    └── <change-id>/
```

规则：

- `.workflow/archive/roadmap.md` 保存所有已归档 versions 的索引。
- `.workflow/archive/changes/` 保存已归档 change 的完整上下文。
- `plan-roadmap` 平时不主动全量读取 archive，只在需要历史 big picture、追溯或避免重复规划时按需读取。

## 退出条件

当满足以下条件时，`plan-roadmap` 可以结束：

- 新处理的意图已进入活跃 roadmap、暂缓或放弃。
- `.workflow/roadmap.md` 有清晰的活跃 versions 与 changes。
- `.workflow/roadmap.md` 有明确当前焦点和下一步入口；具体阶段由当前 change 的 `progress.md` 决定。
- roadmap 中每个活跃 change 都能对应到 `.workflow/changes/<change-id>/`。
- 新增或更新的 change 至少包含 `intents.md` 与 `progress.md` 骨架。
- `.workflow/intents.md` 只保留仍待讨论或待分配的意图。
