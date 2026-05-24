---
name: design-change
description: 为某个 change 产出 HOW 设计，并按产品、UI/UX、前端、架构、API、数据、业务规则、异常处理等子域读取 references。用户要求设计方案或细化实现前设计时使用。
---

# design-change 技能

## 定位

`design-change` 用于为指定 change 产出 how 设计材料。

它读取该 change 的来源意图、行为契约 specs、项目现状和必要的长期上下文，然后在以下目录中创建或更新本 change 需要的设计文件：

```text
.workflow/changes/<change-id>/design/
```

`design-change` 只回答：为了实现这个 change，应采用怎样的设计方案、边界、取舍和风险控制。

本技能不把设计结论直接写入 `docs/`。长期 design、architecture、ADR 等沉淀由后续 `distill-change` 在验证后完成。

## 参考资料

执行时按需读取：

- [product.md](references/product.md) — 产品目标、能力边界、用户路径与可验证需求。
- [ui-ux.md](references/ui-ux.md) — 页面体验、交互路径、信息层级、视觉规范与可用性。
- [frontend.md](references/frontend.md) — 前端模块、组件边界、状态管理、路由和工程约束。
- [architecture.md](references/architecture.md) — 系统分层、模块关系、技术选型、边界与演进策略。
- [api.md](references/api.md) — 接口定义、请求响应、协议、鉴权与兼容性。
- [data.md](references/data.md) — 数据模型、表结构、字段、关系、索引与迁移。
- [business-rules.md](references/business-rules.md) — 业务概念、业务规则、状态流转、计算规则与约束。
- [error-handling.md](references/error-handling.md) — 异常场景、错误码、失败处理、重试、降级与边界情况。

涉及技术栈、框架、库、SDK、运行时、构建工具、部署平台或依赖选择时，调用 `technology-research` skill；不要在 `design-change` 内维护固定技术结论。

## 阶段推进原则

`design-change` 是本项目工作流中的 change 级 design 阶段：

- 不猜测目标 change；不明确时必须让用户选择。
- 先检查当前 change 状态，再决定是否创建 design。
- 只推进 `design-change` 阶段，不跳到 `plan-change`、实现、验证或沉淀。
- 创建 design 前必须读取已完成依赖：change intents、change specs、必要的长期 docs。
- 模板、规则和上下文是给 Agent 的约束，不要把说明性注释或规则原样复制到最终 design 文件。
- 创建后必须验证文件存在，再汇报进度和解锁的下一步。

在本工作流中，`design/` 目录视为一个阶段 artifact；一次 `design-change` 可以创建本 change 需要的多个 design 子域文件，但不能创建无关子域文件，也不能继续推进后续阶段。

## 模板与 reference 职责边界

`design-change` 的输出结构由技能本体和 `.workflow/templates/changes/design/` 共同约束：

- 技能本体负责：输出位置、子域命名、子域路由、最低质量门槛和完成条件。
- 模板负责：每类 design 子域的基础骨架和必要字段。
- reference 负责：提升专业质量，补充检查点、常见误区、判断方法和可扩展内容。

reference 不定义最终文件结构；但可以在不破坏模板基础结构的前提下，指导 Agent 增补必要内容。

## design 创建条件

`design-change` 不要求每个 change 都创建完整 design 子域。

只有满足以下任一条件时，才创建独立 design 文件：

- 跨模块、跨服务、跨页面或跨 capability。
- 引入新的架构模式、外部依赖、数据模型或迁移策略。
- 涉及安全、性能、兼容性、权限、错误处理或发布风险。
- specs 中存在实现路径不明确、需要先做技术决策的要求。
- 用户明确要求先沉淀 how 设计。
- 后续 `plan-change` 无法在没有设计材料的情况下安全拆解任务。

如果 change 很轻量，且 specs 已足以指导实现，可以只创建 `overview.md` 说明：

- 为什么不需要更多设计子域。
- 可以直接进入 `plan-change` 的依据。
- 是否存在后续 `distill-change` 候选。

## change 参数

执行本技能时必须确定目标 change。

- 如果用户传入 change 名称，使用该名称。
- 如果用户没有传入 change 名称，先读取 `.workflow/roadmap.md` 与 `.workflow/changes/`，列出当前活跃 changes，并询问用户要指定哪个 change。
- 如果上下文里似乎能推断 change，也不能直接猜测或自动选择；必须让用户确认。
- 不要在未确认 change 的情况下创建 design。

选择 change 时，应优先展示 3-4 个最相关或最近活跃的 change，并显示：

- change-id
- 所属 version
- 当前阶段（来自 `progress.md`）
- change 路径
- 最近上下文依据（如当前焦点或 roadmap 排序）

可以把最可能的 change 标记为“推荐”，但仍必须由用户选择。

## 主动触发

当满足以下情况时，AI 可以主动建议或进入 `design-change`：

- roadmap 中某个 change 已经完成 `specify-change`，但还没有 design。
- 用户确认要开始设计某个 change 的 how。
- 后续 `plan-change` 或实现前缺少设计依据。
- change 涉及架构、接口、数据、UI/UX、业务规则、异常处理、迁移、性能、安全等需要明确取舍的内容。

不要在以下情况强行进入：

- 目标 change 尚未进入 roadmap。
- change 缺少来源 intents。
- change 缺少 specs，且没有用户明确要求先做探索性 design。
- 用户正在讨论 roadmap 编排，而不是具体 change 设计。

## 输入

必须读取：

```text
.workflow/roadmap.md
.workflow/changes/<change-id>/intents.md
.workflow/changes/<change-id>/progress.md
.workflow/changes/<change-id>/specs/
```

按需读取：

```text
docs/specs/
docs/design/
docs/architecture/
docs/runbooks/
.workflow/changes/<change-id>/design/
references/<subdomain>.md
.claude/skills/technology-research/SKILL.md
```

读取规则：

- `.workflow/changes/<change-id>/intents.md` 是 change 来源上下文。
- `.workflow/changes/<change-id>/specs/` 是本 change 的 what 基线。
- `docs/` 用于识别项目现有约束、长期设计、架构边界和可复用模式。
- 根据“子域路由规则”判断子域，不要只凭子域名称泛泛填写。
- 创建或更新某个子域 design 前，必须读取对应的 `references/<subdomain>.md`，并按其中输入检查、关注点、工作方式和补充检查点完成设计。
- 涉及新技术、版本选择、新依赖或第三方服务时，必须调用 `technology-research` skill，用其方法论和 references 完成当前资料检索、项目约束对照和风险判断。
- 已有 change design 存在时，优先更新，不要直接覆盖。
- 读取依赖材料后再创建 design，不要凭 change-id 或文件名猜测方案。

## 不负责

`design-change` 不负责：

- 重新规划 roadmap。
- 改写行为契约 specs。
- 拆分 tasks。
- 执行实现。
- 做验证、沉淀或归档。
- 更新长期 `docs/`。

这些动作交给后续 workflow 技能。

## 状态检查

确认目标 change 后，先检查当前状态：

1. `.workflow/changes/<change-id>/` 是否存在。
2. `.workflow/changes/<change-id>/intents.md` 是否存在。
3. `.workflow/changes/<change-id>/specs/` 是否存在。
4. `.workflow/changes/<change-id>/design/` 是否已存在。
5. `progress.md` 中当前阶段是否为 `待设计`，或是否仍缺少 design。
6. 是否满足 design 创建条件；如果不满足，是否只需要 `overview.md` 说明可直接进入 `plan-change`。

根据状态处理：

- 如果 change 缺少 `intents.md`，停止并提示先回到 `plan-roadmap` 补齐 change 骨架。
- 如果 specs 缺失，默认停止并提示先执行 `specify-change`；除非用户明确要求先做探索性 design。
- 如果 design 已存在，读取现有 design 后更新，不要直接覆盖。
- 如果 design 已完整且当前阶段不是 `待设计`，说明当前状态，并询问是否仍要修改 design。

## 子域路由规则

`design-change` 按子域拆分 design，但只创建本 change 需要的设计产物。子域不是固定清单式填空，而是帮助 Agent 使用对应专业视角完成 how 设计。

默认情况下，一个子域对应一个同名 Markdown 文件：

```text
.workflow/changes/<change-id>/design/<subdomain>.md
```

如果某个子域足够复杂，单文件会导致内容过长、结构混乱或需要多个独立材料，可以使用同名子文件夹代替：

```text
.workflow/changes/<change-id>/design/<subdomain>/
├── overview.md
└── <topic>.md
```

使用子文件夹时：

- `<subdomain>/overview.md` 必须说明该子域的文件索引和阅读顺序。
- 子文件夹内文件必须仍遵循该子域模板的基础要求。
- 不要为了显得完整而拆目录；只有复杂度需要时才拆。

常见子域：

| 子域 | 触发场景 | 默认输出 | 专业 reference |
|---|---|---|---|
| overview | 所有非平凡 change，用于汇总上下文、设计范围和子域索引 | `overview.md` | 无，直接使用 overview 模板 |
| product | 产品目标、能力边界、用户流程或信息架构不清晰 | `product.md` 或 `product/` | `product.md` |
| ui-ux | 页面结构、交互模式、页面状态或可用性需要明确 | `ui-ux.md` 或 `ui-ux/` | `ui-ux.md` |
| frontend | 前端模块、组件、状态管理、路由或工程约束需要明确 | `frontend.md` 或 `frontend/` | `frontend.md` |
| architecture | 跨模块、技术选型、系统边界、依赖关系或演进策略需要明确 | `architecture.md` 或 `architecture/` | `architecture.md` |
| api | 接口、协议、请求响应、鉴权或兼容性需要明确 | `api.md` 或 `api/` | `api.md` |
| data | 数据模型、迁移、索引、一致性或查询写入路径需要明确 | `data.md` 或 `data/` | `data.md` |
| business-rules | 业务规则、状态机、计算规则或边界情况需要明确 | `business-rules.md` 或 `business-rules/` | `business-rules.md` |
| error-handling | 失败路径、错误码、重试、降级、补偿或恢复策略需要明确 | `error-handling.md` 或 `error-handling/` | `error-handling.md` |
| risks | 跨子域风险、权衡、开放问题集中收口 | `risks.md` | 无，汇总其他子域风险 |

路由原则：

- 先用 `overview.md` 做路由和总览。
- 只创建必要子域，不创建空文件。
- 子域少但内容完整，比子域多但空泛更好。
- 如果一个问题跨多个子域，应在各自子域写对应视角，并在 `risks.md` 收口跨域风险。
- 如果某个子域内容很少，可写在 `overview.md`，不必单独建文件。
- 选择某个子域后，必须读取对应专业 reference，再写该子域 design。

## 子域最佳实践

创建或更新任何 design 子域前，必须按需读取对应专业 reference。

使用方式：

- 先用 `overview.md` 说明本 change 选择哪些子域，以及为什么不选择其他子域。
- 对每个被选择的子域，先读取对应 reference，再按其中输入检查、关注点、工作方式和补充检查点完成设计。
- 如果子域内容不足以单独成文，写入 `overview.md`，不要创建空文件。
- 如果发现跨子域风险，用 `risks.md` 收口。
- 子域 design 必须能指导 `plan-change`，不能只是概念描述。

## 技术版本与依赖安全规则

AI 的内置知识可能过期。涉及技术栈、框架、库、SDK、运行时、构建工具、外部服务或包版本时，必须按以下规则处理：

1. 调用 `technology-research` skill。
2. 按该 skill 的 references 识别当前问题属于运行时、工具链、前端栈、部署平台、TypeScript、monorepo 或依赖安全等哪类技术决策。
3. 搜索当前官方文档、release notes、包元数据、安全公告或部署平台文档。
4. 核对项目现有技术栈和兼容性。
5. 在 design 中记录采用的版本/方案、检索来源、检索时间和取舍原因。
6. 对 npm 依赖执行供应链安全检查：默认不选发布不足 7 天的版本，除非用户明确确认。

不要只凭模型记忆决定技术版本或新增依赖。

## 执行规则

1. 确认目标 change。
2. 检查 change 当前状态。
3. 读取 change intents 与 specs。
4. 按需读取 `docs/` 中相关长期上下文。
5. 根据子域路由规则判断本 change 需要哪些设计子域。
6. 对每个被选择的子域，读取 `references/<subdomain>.md`。
7. 如果涉及技术栈、版本、依赖或外部服务，调用 `technology-research` skill，并将其技术判断、检索来源和风险结论写入对应 design 子域。
8. 创建或更新对应子域 design。默认使用单文件；复杂子域可以使用同名文件夹：

```text
.workflow/changes/<change-id>/design/<subdomain>.md
.workflow/changes/<change-id>/design/<subdomain>/overview.md
```

9. 使用 `.workflow/templates/changes/design/` 下对应模板作为基础骨架。
10. reference 只作为补充质量检查，不改变模板规定的基础结构。
11. 设计必须说明关键决策、权衡、风险和开放问题。
12. 涉及技术版本或依赖时，设计必须记录检索来源、检索时间、版本选择依据和供应链风险判断。
13. 设计必须能指导 `plan-change`，但不要直接拆 tasks。
14. 不把长期沉淀写入 `docs/`；只在设计中标记后续可由 `distill-change` 提炼的内容。
15. 创建后验证文件存在，再汇报进度。

## 与长期沉淀的关系

`design-change` 产出的是运行态 design。

```text
.workflow/changes/<change-id>/design/
```

它不会直接更新：

```text
docs/design/
docs/architecture/
docs/architecture/adr/
```

原因：

- change 设计在实现和验证前仍可能变化。
- 长期 HOW 应基于已实现且已验证的结果沉淀。
- `distill-change` 会在 verify 之后，从本 change 的 design、实现结果和验证证据中提炼长期内容。

因此，design 文件中可以记录“后续沉淀候选”，但不能代替 `distill-change`。

## design 写入格式

优先使用模板：

```text
.workflow/templates/changes/design/<subdomain>.md
```

输出路径可以是单文件，也可以是复杂子域的同名文件夹：

```text
.workflow/changes/<change-id>/design/<subdomain>.md
.workflow/changes/<change-id>/design/<subdomain>/overview.md
```

单文件使用对应模板；同名文件夹的 `overview.md` 必须说明文件索引和阅读顺序。

每个 design 文件至少应说明：

- change-id
- 输入依据
- 设计范围
- 关键决策
- 风险与权衡
- 开放问题
- 后续沉淀候选

如果涉及技术版本或依赖选择，还必须说明：

- 检索来源
- 检索时间
- 选定版本或版本范围
- 版本选择依据
- npm 依赖是否满足发布至少 7 天规则
- 供应链风险判断

## progress.md 更新规则

`progress.md` 是 change 阶段状态的权威来源。

完成 `design-change` 后：

- 如果 design 已补齐且无阻塞，将 `progress.md` 更新为：`当前阶段：待计划`。
- 在“产物检查”中把 design 标记为已完成；如果确认无需额外 design，也要在 progress 或 design overview 中说明理由。
- 在“进展记录”追加本次创建或更新的 design 路径。
- 如果仍有阻塞，将当前阶段写为 `阻塞`，并记录阻塞原因。
- 如果本技能由 `step-change` 调用且 `step-change` 会统一更新 progress，也必须保证产物存在并在汇报中说明可进入 `plan-change`。

## 完成后输出

完成后简短汇报：

- 目标 change。
- 创建或更新了哪些 design 子域文件。
- 当前阶段已完成：`design-change`。
- 如果涉及技术版本或依赖选择，说明检索了哪些资料、采用哪个版本/方案、是否满足 npm 7 天规则。
- 解锁的下一步：`plan-change`。
- 哪些内容可能在 `distill-change` 阶段沉淀到长期 docs。
- 如果仍有阻塞，说明阻塞原因。

## 退出条件

当满足以下条件时，`design-change` 可以结束：

- 目标 change 已确认。
- change intents 与 specs 已读取。
- 需要的设计子域已明确。
- 相关子域 design 文件已创建或更新。
- 已根据子域路由规则完成子域选择。
- 已按每个已选子域对应的 reference 完成专业视角检查。
- 关键决策、权衡、风险和开放问题齐全。
- 涉及技术版本或依赖时，已完成检索并记录版本依据与供应链风险。
- 没有把 tasks、实现代码或长期 docs 沉淀混入本阶段。
- 已验证 design 文件存在。
- 下一步可以进入 `plan-change`。
