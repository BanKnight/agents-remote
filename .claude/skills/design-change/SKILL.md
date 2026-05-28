---
name: design-change
description: 为 `.workflow/versions/<version>/changes/<change-id>/` 下的 change 产出 HOW 设计，并按产品、UI/UX、前端、架构、API、数据、业务规则、异常处理等子域读取 references。用户要求设计方案或细化实现前设计时使用。
---

# design-change 技能

## 定位

`design-change` 用于为指定 change 产出 HOW 设计材料。

它读取该 change 的 `context.md`、行为契约 specs、version shared、项目现状和必要的长期上下文，然后在目标 change 的 design 目录中创建或更新需要的设计文件：

```text
.workflow/versions/<version>/changes/<change-id>/design/
```

`design-change` 只回答：为了实现这个 change，应采用怎样的设计方案、边界、取舍和风险控制。

本技能不把设计结论直接写入 `docs/`。长期 design、architecture、ADR 等沉淀应基于验证后的结果完成。

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

`design-change` 是 change 级 design 阶段：

- 不猜测目标 change；不明确时必须让用户选择。
- 先检查当前 change 状态，再决定是否创建 design。
- 只推进 `design-change` 阶段，不跳到 plan、实现、验证或长期沉淀。
- 创建 design 前必须读取已完成依赖：change context、change specs、必要的 version shared 和长期 docs。
- 模板、规则和上下文是给 Agent 的约束，不要把说明性注释或规则原样复制到最终 design 文件。
- 创建后必须验证文件存在，再汇报进度和解锁的下一步。

在本工作流中，`design/` 目录视为一个阶段 artifact；一次 `design-change` 可以创建本 change 需要的多个 design 子域文件，但不能创建无关子域文件，也不能继续推进后续阶段。

## 模板与 reference 职责边界

`design-change` 的输出结构由技能本体和 `.workflow/templates/changes/design/` 共同约束：

- 技能本体负责：输出位置、子域命名、子域路由、最低质量门槛和完成条件。
- 模板负责：每类 design 子域的基础骨架和必要字段。
- reference 负责：提升专业质量，补充检查点、常见误区、判断方法和可扩展内容。

reference 不定义最终文件结构；但可以在不破坏模板基础结构的前提下，指导 Agent 增补必要内容。

## 主动触发

当满足以下情况时，使用 `design-change`：

- 活跃 roadmap 中某个 change 已经完成 `specify-change`，但还没有 design。
- 用户确认要开始设计某个 change 的 HOW。
- `step-change` 读取 `progress.md` 后发现当前阶段是 `待设计`。
- 后续 `plan-change` 或实现前缺少设计依据。
- change 涉及架构、接口、数据、UI/UX、业务规则、异常处理、迁移、性能、安全等需要明确取舍的内容。

不要在以下情况强行进入：

- 目标 change 尚未进入 `.workflow/versions/index.md`。
- change 缺少 `context.md`。
- change 缺少 specs，且没有用户明确要求先做探索性 design。
- 用户正在讨论 roadmap 编排，而不是具体 change 设计。
- 用户要求的是任务拆解、实现、验证或长期沉淀。

## change 参数

执行本技能时必须确定目标 change。

- 如果用户传入 `.workflow/versions/<version>/changes/<change-id>/` 路径，使用该 change。
- 如果用户传入 `<version>/<change-id>`，使用对应 version 下的 change。
- 如果用户只传入 change-id，因为活跃区 change-id 应保持全局唯一，先在 `.workflow/versions/index.md` 中定位该 change；若出现多个匹配，列出候选并要求用户选择。
- 如果用户没有传入 change，读取 `.workflow/versions/index.md` 的“当前焦点”。
- 如果当前焦点缺失或不明确，列出 3-4 个处于 `待设计` 或缺少 design 的候选 change，并要求用户选择。
- 不要在未确认 change 的情况下创建 design。

## 输入契约

### 标准输入

每次执行都需要读取并理解这些输入：

```text
.workflow/versions/index.md
.workflow/versions/<version>/changes/<change-id>/context.md
.workflow/versions/<version>/changes/<change-id>/progress.md
.workflow/versions/<version>/changes/<change-id>/specs/
.workflow/templates/changes/design/
```

读取规则：

- `.workflow/versions/index.md` 用于确认目标 change 已进入活跃 roadmap、所属 version、依赖和当前焦点。
- `context.md` 是 change 看板上下文，提供来源、当前已知边界、version shared 读写约定和背景引用。
- `specs/` 是本 change 的 WHAT 基线；默认必须先读取。
- `progress.md` 是阶段状态和局部阻塞的权威来源。
- `.workflow/templates/changes/design/` 提供 design 文件基础结构。
- 读取依赖材料后再创建 design，不要凭 change-id 或文件名猜测方案。

### 条件输入

根据目标 change 的 context、specs、阶段和设计子域，按需读取这些输入：

1. **已有 change design**
   - 如果目标 change 已有 `design/`，先读取现有 design 后更新，不要直接覆盖。

2. **version shared**
   - 如果 `context.md` 要求读取 `.workflow/versions/<version>/shared/` 下的共享材料，先读取相关文件再设计。
   - 如果设计会产出供同 version 后续 changes 使用的共享材料，在 design 中说明应写入的 shared 路径、内容和消费者；实际写入可由本阶段或后续阶段完成。

3. **长期 docs**
   - 读取 `docs/project.md` 获得项目 big picture。
   - 如果 `docs/project.md` 或 `context.md` 指向相关 specs/design/architecture/runbooks/research，按需继续读取。
   - 如果 `docs/project.md` 没有覆盖但该背景会影响 HOW，按照 docs 索引规则层层查找相关文档。

4. **依赖 change**
   - 如果 versions index 中目标 change 声明依赖，读取依赖 change 的 `context.md`、`progress.md` 和足以判断 HOW 输入的产物。

5. **专业 references**
   - 根据子域路由规则，创建或更新某个子域 design 前必须读取对应 `references/<subdomain>.md`。
   - `overview.md` 不需要专业 reference，直接使用 overview 模板。

6. **技术研究**
   - 涉及新技术、版本选择、新依赖或第三方服务时，调用 `technology-research` skill，用其方法论完成当前资料检索、项目约束对照和风险判断。

7. **项目文件与代码**
   - 如果现有代码结构、API、数据模型、UI 架构、测试或配置会影响 HOW，按需读取相关文件。

## 输出契约

### 标准输出

每次成功完成后，必须创建或更新：

```text
.workflow/versions/<version>/changes/<change-id>/design/
.workflow/versions/<version>/changes/<change-id>/progress.md
```

标准输出要求：

- 至少有一个 design artifact，通常是 `design/overview.md`。
- design 明确输入依据、设计范围、子域选择、关键决策、风险与权衡、开放问题和后续沉淀候选。
- 设计能指导 `plan-change`，但不直接拆 tasks。
- 不把长期沉淀直接写入 `docs/`。
- `progress.md` 的 design 产物检查与当前阶段保持一致，除非由 `step-change` 统一更新。

### 条件输出

根据设计结果，按需产生这些输出：

1. **子域 design 文件**
   - 当某个子域需要独立设计时，创建或更新：

```text
.workflow/versions/<version>/changes/<change-id>/design/<subdomain>.md
```

   - 如果子域复杂，可以创建同名目录：

```text
.workflow/versions/<version>/changes/<change-id>/design/<subdomain>/overview.md
.workflow/versions/<version>/changes/<change-id>/design/<subdomain>/<topic>.md
```

2. **无需额外 design 的 overview**
   - 如果 change 很轻量，且 specs 已足以指导实现，只创建 `overview.md` 说明为什么不需要更多设计子域、可直接进入 plan 的依据和沉淀候选。

3. **version shared 协作说明**
   - 如果本 change 需要写入或读取 version shared，design 应与 `context.md` 的协作约定一致，并补充 HOW 层面的共享材料格式、边界或消费者。

4. **技术研究记录**
   - 如果涉及技术版本或依赖选择，design 必须记录检索来源、检索时间、版本选择依据和供应链风险判断。

5. **阻塞记录**
   - 如果 specs 缺失、context 边界不清、关键技术事实无法确认或设计风险需要用户取舍，将 `progress.md` 写为 `阻塞` 或在汇报中说明阻塞。

6. **用户可读摘要**
   - 完成后简短说明目标 change、创建/更新的设计子域、技术研究结论、当前阶段结果和下一步。

## 不负责

`design-change` 不负责：

- 规划 roadmap、新建 version 或新建 change。
- 改写行为契约 specs。
- 拆分 tasks。
- 执行实现。
- 做验证、长期沉淀或归档。
- 更新长期 `docs/`。

工作流层面的直接衔接只有：

- 上游：缺少 specs 时，回到 `specify-change`，除非用户明确要求探索性 design。
- 下游：design 完成后，进入 `plan-change`，通常由 `step-change` 分发。

## 状态检查

确认目标 change 后，先检查当前状态：

1. `.workflow/versions/<version>/changes/<change-id>/` 是否存在。
2. `context.md` 是否存在。
3. `progress.md` 是否存在。
4. `specs/` 是否存在。
5. `design/` 是否已存在。
6. `progress.md` 中当前阶段是否为 `待设计`，或是否仍缺少 design。
7. 是否满足 design 创建条件；如果不满足，是否只需要 `overview.md` 说明可直接进入 `plan-change`。

根据状态处理：

- 如果 change 缺少 `context.md` 或 `progress.md`，停止并提示先回到 `plan-versions` 补齐 change 骨架。
- 如果 specs 缺失，默认停止并提示先执行 `specify-change`；除非用户明确要求先做探索性 design。
- 如果 design 已存在，读取现有 design 后更新，不要直接覆盖。
- 如果 design 已完整且当前阶段不是 `待设计`，说明当前状态，并询问是否仍要修改 design。

## design 创建条件

`design-change` 不要求每个 change 都创建完整 design 子域。

只有满足以下任一条件时，才创建独立 design 文件：

- 跨模块、跨服务、跨页面或跨 capability。
- 引入新的架构模式、外部依赖、数据模型或迁移策略。
- 涉及安全、性能、兼容性、权限、错误处理或发布风险。
- specs 中存在实现路径不明确、需要先做技术决策的要求。
- 用户明确要求先沉淀 HOW 设计。
- 后续 `plan-change` 无法在没有设计材料的情况下安全拆解任务。

如果 change 很轻量，且 specs 已足以指导实现，可以只创建 `overview.md` 说明：

- 为什么不需要更多设计子域。
- 可以直接进入 `plan-change` 的依据。
- 是否存在后续长期沉淀候选。

## 子域路由规则

`design-change` 按子域拆分 design，但只创建本 change 需要的设计产物。子域不是固定清单式填空，而是帮助 Agent 使用对应专业视角完成 HOW 设计。

默认情况下，一个子域对应一个同名 Markdown 文件：

```text
.workflow/versions/<version>/changes/<change-id>/design/<subdomain>.md
```

如果某个子域足够复杂，单文件会导致内容过长、结构混乱或需要多个独立材料，可以使用同名子文件夹代替：

```text
.workflow/versions/<version>/changes/<change-id>/design/<subdomain>/
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

## 核心执行循环

1. 确认目标 change。
2. 读取标准输入，理解 change context、WHAT specs、当前阶段和 design 模板。
3. 按条件输入规则读取必要的已有 design、version shared、长期 docs、依赖 change、专业 references、技术研究资料、代码或配置。
4. 根据子域路由规则判断本 change 需要哪些设计子域。
5. 对每个被选择的子域，读取 `references/<subdomain>.md`。
6. 如果涉及技术栈、版本、依赖或外部服务，调用 `technology-research` skill，并将其技术判断、检索来源和风险结论写入对应 design 子域。
7. 创建或更新对应子域 design。默认使用单文件；复杂子域可以使用同名文件夹。
8. 使用 `.workflow/templates/changes/design/` 下对应模板作为基础骨架。
9. reference 只作为补充质量检查，不改变模板规定的基础结构。
10. 设计必须说明关键决策、权衡、风险和开放问题。
11. 设计必须能指导 `plan-change`，但不要直接拆 tasks。
12. 不把长期沉淀写入 `docs/`；只在设计中标记后续可提炼的内容。
13. 创建后验证文件存在，按需更新 `progress.md`。
14. 简短汇报进度和下一步。

## 与长期沉淀的关系

`design-change` 产出的是运行态 design。

```text
.workflow/versions/<version>/changes/<change-id>/design/
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
- 后续长期沉淀会从本 change 的 design、实现结果和验证证据中提炼长期内容。

因此，design 文件中可以记录“后续沉淀候选”，但不能代替长期 docs。

## design 写入格式

优先使用模板：

```text
.workflow/templates/changes/design/<subdomain>.md
```

输出路径可以是单文件，也可以是复杂子域的同名文件夹：

```text
.workflow/versions/<version>/changes/<change-id>/design/<subdomain>.md
.workflow/versions/<version>/changes/<change-id>/design/<subdomain>/overview.md
```

单文件使用对应模板；同名文件夹的 `overview.md` 必须说明文件索引和阅读顺序。

每个 design 文件至少应说明：

- change-id
- version
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
- 哪些内容可能在长期沉淀阶段进入 docs。
- 如果仍有阻塞，说明阻塞原因。

## 退出条件

当满足以下条件时，`design-change` 可以结束：

- 目标 change 已确认。
- change context 与 specs 已读取。
- 需要的设计子域已明确。
- 相关子域 design 文件已创建或更新。
- 已根据子域路由规则完成子域选择。
- 已按每个已选子域对应的 reference 完成专业视角检查。
- 关键决策、权衡、风险和开放问题齐全。
- 涉及技术版本或依赖时，已完成检索并记录版本依据与供应链风险。
- 没有把 tasks、实现代码或长期 docs 沉淀混入本阶段。
- 已验证 design 文件存在。
- 下一步可以进入 `plan-change`。
