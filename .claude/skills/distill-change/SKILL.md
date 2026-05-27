---
name: distill-change
description: 在 versioned change 验证后，将已验证的长期 WHAT/HOW/设计/架构/ADR/runbook/project 认知沉淀到 docs。用户要求沉淀、同步长期文档、收口知识或 archive 前补齐长期文档时使用。
---

# distill-change 技能

## 定位

`distill-change` 用于在 `verify-change` 之后，把单个 versioned change 中已经验证过、值得长期复用的知识沉淀回 `docs/`。

它统一处理长期知识沉淀：

- 长期 WHAT：`docs/specs/`
- 长期 design：`docs/design/`
- 长期 HOW / architecture / ADR：`docs/architecture/`
- runbook：`docs/runbooks/`
- project big picture：必须评估并按需更新 `docs/project.md`

`distill-change` 不是归档技能。它只负责让长期知识变成主线文档；归档由后续 `archive-version` 处理。

`distill-change` 不复制运行态文件。它从已验证的 specs、design、实现结果、verify 证据、version shared 和 change context 中提炼长期结论；未验证或只对当前 change 有意义的内容继续留在 `.workflow/versions/<version>/changes/<change-id>/` 或 `.workflow/versions/<version>/shared/`。

## 主动触发

当满足以下情况时，使用 `distill-change`：

- `verify-change` 已通过，且 change 准备收口或归档。
- 用户要求“沉淀”“同步长期文档”“更新 docs”“归纳本次变更经验”。
- change specs/design/verify 中存在未来版本会复用的 WHAT、HOW、架构决策、runbook、项目认知或运行操作信息。
- archive 前发现 change 的长期知识尚未写回 `docs/`。

不要在以下情况强行进入：

- 目标 change 尚未确认。
- change 还没有 verify 证据。
- `verify.md` 中存在未解决 CRITICAL。
- 用户仍在 clarify、roadmap、spec、design、plan 或 implementation 阶段。

## change 参数

执行本技能时必须确定目标 change。

- 如果用户传入 `.workflow/versions/<version>/changes/<change-id>/` 路径，使用该 change。
- 如果用户传入 `<version>/<change-id>`，使用对应 version 下的 change。
- 如果用户只传入 change-id，因为活跃区 change-id 应保持全局唯一，先在 `.workflow/versions/index.md` 中定位该 change；若出现多个匹配，列出候选并要求用户选择。
- 如果用户没有传入 change，先读取 `.workflow/versions/index.md`，列出当前焦点和 3-4 个最相关或最近活跃的 changes，并询问用户要 distill 哪个 change。
- 如果上下文里似乎能推断 change，也不能直接猜测或自动选择；必须让用户确认。
- 不要在未确认 change 的情况下更新 `docs/`。

选择 change 时，展示：

- version
- change-id
- 当前阶段（来自 `progress.md`）
- change 路径
- verify 结论（如可读取）

## 输入契约

### 标准输入

每次执行都需要读取并理解这些输入：

```text
.workflow/versions/index.md
.workflow/versions/<version>/changes/<change-id>/context.md
.workflow/versions/<version>/changes/<change-id>/progress.md
.workflow/versions/<version>/changes/<change-id>/specs/
.workflow/versions/<version>/changes/<change-id>/design/
.workflow/versions/<version>/changes/<change-id>/verify.md
docs/project.md
```

读取规则：

- `.workflow/versions/index.md` 用于确认目标 change 所属 version、活跃队列、依赖和当前焦点；不从 index 读取 change 阶段状态。
- `context.md` 是 change 看板上下文，提供来源上下文、当前已知边界、version shared 读写约定和背景引用。
- `progress.md` 是阶段状态权威来源。
- `verify.md` 是进入长期沉淀的质量门禁。
- specs 是 WHAT 增量来源。
- design 是 HOW 候选来源。
- `docs/project.md` 是长期 big picture 入口，必须评估是否需要补充。

### 条件输入

根据目标 change 的 context、verify 证据和待沉淀知识类型，按需读取这些输入：

1. **version shared**
   - 如果 `context.md` 指定需要读取或写入 `.workflow/versions/<version>/shared/`，读取相关 shared 材料。
   - 如果 shared 中包含调研基线、设计基线、验证约束或跨 change 协作约定，判断哪些已被 verify 支撑且值得进入长期 docs。

2. **实现与执行证据**
   - 当需要确认设计是否真实落地、runbook 是否可复现、或 project knowledge 是否稳定时，按需读取：

```text
.workflow/versions/<version>/changes/<change-id>/plan.md
.workflow/versions/<version>/changes/<change-id>/tasks.md
.workflow/versions/<version>/changes/<change-id>/artifacts/
代码变更
git diff / git status
测试输出、截图、日志、benchmark
```

3. **既有长期 docs**
   - 更新长期文档前，必须先读取目标文档当前内容，避免重复、冲突或覆盖历史。
   - 如果目标文档不存在，读取对应目录的 `index.md` 和 `docs/templates/` 中的模板后再创建。

4. **docs 索引链路**
   - 如果不确定长期知识应沉淀到哪个文档，按照 docs 索引规则层层查找：先读当前层 `index.md`，再进入相关子目录读取子目录 `index.md`，最后读取目标文档。
   - 不要用文件名猜测索引描述；新增、修改、移动或删除 docs 文档后必须同步更新所在目录 `index.md`。

5. **archive 上下文**
   - 如果 `context.md`、verify 证据或 docs 冲突判断需要历史追溯，按需读取 `.workflow/archive/versions/<version>/...`。
   - 旧归档结构如存在，只在被明确引用或需要历史追溯时读取，不做结构迁移。

## 输出契约

### 标准输出

每次成功执行后，必须产生这些结果：

```text
.workflow/versions/<version>/changes/<change-id>/progress.md
```

并在会话中简短说明：

- 目标 change 与 verify 结论。
- WHAT / HOW / runbook / project knowledge 是否需要沉淀。
- 更新了哪些 docs 文件，或为什么无需更新。
- 是否仍有冲突或阻塞。
- 下一步是否可进入 `archive-version`。

标准输出要求：

- 如果长期 docs 已按需沉淀，或明确无需沉淀，将 `progress.md` 更新为 `当前阶段：已完成`。
- 在“产物检查”中把 distill 标记为已完成。
- 在“进展记录”追加本次更新的长期 docs 路径，或记录无需沉淀的理由。
- 如果发现 verify 证据不足、docs 冲突或仍有未解决 CRITICAL，将当前阶段写为 `阻塞` 或回到合适阶段，并记录建议回流技能。

### 条件输出

根据沉淀结果，按需更新这些文件：

1. **长期 WHAT**

```text
docs/specs/<capability>/spec.md
```

2. **长期 design / architecture / ADR**

```text
docs/design/<topic>.md
docs/architecture/<topic>.md
docs/architecture/adr/ADR-YYYYMMDD-<topic>.md
```

3. **runbook**

```text
docs/runbooks/<topic>.md
```

4. **project big picture**

```text
docs/project.md
```

5. **docs indexes**

```text
docs/**/index.md
```

条件输出要求：

- 新建长期文档时，优先使用项目本地 `docs/templates/` 中对应模板。
- 更新已有长期文档时，先读取现有文档，再按其当前结构增量修改；不要为了套模板整文件重写。
- 凡新增、移动、删除或修改 `docs/` 下文档，必须同步维护对应目录的 `index.md`。
- 如果长期 docs 已经包含等价内容，不重复写入；在 progress 或输出中记录“无需更新”的理由。

## 不负责

`distill-change` 不负责：

- 修改功能实现。
- 重新设计方案。
- 重新拆解任务。
- 修复 verify 问题。
- 归档 version 或移动 change 目录。
- 把运行态 change 文件原样复制到 `docs/`。

如果发现实现、spec、design 或 verify 仍需要修正，应停止沉淀并回流到对应技能。

工作流层面的直接衔接只有：

- 上游：verify 证据不足或存在 CRITICAL 时，回到 `verify-change`。
- 下游：长期知识已沉淀或确认无需沉淀后，进入 `archive-version`。

## 状态检查

确认目标 change 后，先检查：

1. `.workflow/versions/<version>/changes/<change-id>/` 是否存在。
2. `context.md` 是否存在。
3. `progress.md` 当前阶段是否为 `待沉淀`，或 verify 证据是否显示已经处于可沉淀阶段。
4. `verify.md` 是否存在。
5. `verify.md` 是否存在未解决 CRITICAL。
6. `specs/` 是否存在。
7. `design/` 是否存在，或是否有充分理由不需要 HOW 沉淀。
8. `context.md` 或 version shared 中是否存在需要沉淀的调研、设计基线、验证约束或共享结论。
9. `docs/project.md` 是否需要补充项目定位、用户场景、领域概念、稳定结构导航、技术栈、架构边界、易错点、开发/验证准则、重要参考文档入口或长期术语。
10. `docs/` 中是否已有相关长期 specs/design/architecture/project 文档。

根据状态处理：

- 如果缺少 `verify.md`，停止并提示先执行 `verify-change`。
- 如果 verify 结论为不通过或存在未解决 CRITICAL，停止并提示回流修正。
- 如果 specs 缺失，只能沉淀 HOW/runbook/project knowledge，且必须说明没有 WHAT 可同步。
- 如果 design 缺失，只能沉淀 WHAT/runbook/project knowledge，且必须说明没有 HOW 可提炼。
- 如果长期 docs 已经包含等价内容，不要重复写入；记录“无需更新”。

## 核心执行循环

1. 确认目标 version/change。
2. 读取标准输入，并按条件输入规则补足 version shared、实现证据、既有 docs、docs 索引链路或 archive 上下文。
3. 检查 verify 门禁、progress 阶段和阻塞项。
4. 判断 WHAT / HOW / runbook / project knowledge 各自是否需要长期沉淀。
5. 读取相关长期 docs 和模板。
6. 增量更新需要沉淀的 `docs/` 文件。
7. 同步维护被修改目录的 `index.md`。
8. 更新目标 change 的 `progress.md` 为 `已完成`，或记录阻塞/回流原因。
9. 简短汇报更新内容、无需沉淀内容、冲突/阻塞和下一步。

## 模板映射规则

`distill-change` 不是把 `.workflow/` 中的运行态文件原样复制到 `docs/`，而是基于已验证内容进行提炼。运行态模板和长期模板的对应关系如下：

| 运行态来源 | 长期沉淀目标 | 长期模板 | 提炼方式 |
|---|---|---|---|
| `.workflow/versions/<version>/changes/<change-id>/specs/<capability>/spec.md` | `docs/specs/<capability>/spec.md` | `docs/templates/spec.md` | 按 ADDED / MODIFIED / REMOVED / RENAMED 合并长期 WHAT |
| `.workflow/versions/<version>/changes/<change-id>/design/<subdomain>.md` | `docs/design/<topic>.md` | `docs/templates/design.md` | 提炼可复用设计结论、适用范围、规则和不适用场景 |
| `.workflow/versions/<version>/changes/<change-id>/design/architecture.md` + 实现结果 | `docs/architecture/<topic>.md` | `docs/templates/architecture.md` | 提炼当前主线架构状态、边界、依赖和架构规则 |
| `.workflow/versions/<version>/changes/<change-id>/design/*` 中的关键取舍 | `docs/architecture/adr/ADR-YYYYMMDD-*.md` | `docs/templates/adr.md` | 只为长期重要且需要追溯原因的架构决策创建 ADR |
| `.workflow/versions/<version>/changes/<change-id>/design/*` + `verify.md` + artifacts | `docs/runbooks/<topic>.md` | `docs/templates/runbook.md` | 提炼可重复执行的运维、迁移、发布、故障或人工操作步骤 |
| `.workflow/versions/<version>/shared/*` 中已被 verify 支撑且具备长期价值的共享结论 | `docs/design/` 或 `docs/architecture/` 或 `docs/project.md` | 对应模板 | 从运行态共享材料提炼长期基线，不复制过程记录 |
| change 过程中新确认的项目级认知 | `docs/project.md` | `docs/templates/project.md` | 只补充稳定项目认知，不写单次任务状态 |

规则：

- 新建长期文档时，必须使用对应 `docs/templates/*.md` 作为基础结构。
- 更新已有长期文档时，先读取现有文档，再按其当前结构增量修改。
- 沉淀内容必须能追溯到已验证 change 和 verify 证据。
- 未经过 verify 支撑的 design、shared 或调研结论只能保留在 `.workflow/versions/<version>/...`，不能进入长期 docs。
- 如果运行态 design 或 context 标记了“后续沉淀候选”，必须逐项判断是否真的值得进入长期 docs；候选不等于必须沉淀。

## WHAT 沉淀规则

WHAT 沉淀目标是：

```text
docs/specs/<capability>/spec.md
```

处理规则参考 OpenSpec specs sync：

- `## ADDED Requirements`：新增到长期 spec；如果同名 requirement 已存在，则更新为 change 中版本，避免重复。
- `## MODIFIED Requirements`：替换长期 spec 中同名 requirement。
- `## REMOVED Requirements`：从长期 spec 中移除同名 requirement，并保留必要迁移说明。
- `## RENAMED Requirements`：按 FROM/TO 重命名；如果内容也变化，按新名称应用 MODIFIED。

合并要求：

- 使用 `### Requirement:` 标题作为匹配标识。
- 保持 requirement + scenario 的可验证结构。
- 不把 HOW、任务或实现细节写入 `docs/specs/`。
- 重复执行不应产生重复 requirement。
- 找不到要修改或移除的 requirement 时，报告冲突，不要猜测合并。

如果 capability 对应长期 spec 不存在，使用 `docs/templates/spec.md` 创建 `docs/specs/<capability>/spec.md`，并补充必要的 Purpose / Requirements 骨架。

## HOW / design 沉淀规则

HOW 沉淀目标包括：

```text
docs/design/
docs/architecture/
docs/architecture/adr/
```

从以下来源提炼：

- `.workflow/versions/<version>/changes/<change-id>/design/`
- `.workflow/versions/<version>/shared/` 中已验证且具备长期价值的共享结论
- `verify.md` 中被证实有效的设计决策
- 实现结果与测试证据
- plan/tasks 中实际完成的关键路径

沉淀原则：

- 不复制整个 change design 或 version shared。
- 只提炼未来版本会复用的设计结论、模式、边界、约束或决策。
- 只沉淀已被实现和 verify 支撑的内容。
- 未验证或被推翻的设计只能保留在 change 上下文或 version shared，不进入长期 docs。
- 如果是当前系统结构说明，写入 `docs/architecture/`。
- 如果是特定功能或流程设计，写入 `docs/design/`。
- 如果是关键架构取舍，写入 `docs/architecture/adr/ADR-YYYYMMDD-*.md`。

长期 HOW 文档应面向“当前主线状态”，不是 change 过程记录。

## runbook 沉淀规则

如果本 change 产生了可重复执行的操作流程，应按需更新：

```text
docs/runbooks/<topic>.md
```

适合写入 runbook 的内容：

- 发布、部署、回滚流程。
- 数据迁移、补偿、恢复流程。
- 故障排查或人工处置步骤。
- 需要环境、权限、脚本或人工确认的重复操作。
- verify 中已经执行并证明有效的操作步骤。

不适合写入 runbook 的内容：

- 一次性调试过程。
- 没有验证过的临时操作。
- 只对当前 change 有意义的任务记录。
- 无法复现或缺少成功判定的步骤。

## project knowledge 沉淀规则

如果本 change 改变或补充了项目整体认知，应按需更新：

```text
docs/project.md
```

适合写入 `docs/project.md` 的内容：

- 项目定位变化。
- 关键用户场景变化。
- 领域概念或术语变化。
- 长期工程原则变化。
- 稳定的项目结构导航、主要目录职责、模块边界或跨模块协作规则。
- 技术栈、运行时、质量门禁、测试/E2E harness 或长驻进程/后台依赖管理准则。
- 开发中容易反复犯错的稳定边界，例如路径安全、状态归属、运行依赖、验证方式或跨边界协作规则。
- 对后续需求讨论、设计、实现或验证有持续影响的项目级事实。
- 后续工作需要优先加载的重要参考文档入口。

不适合写入 `docs/project.md` 的内容：

- 单次实现细节、临时任务状态或当前排期。
- 具体需求条款、能力范围、验收条件、接口字段或 UI 文案细节。
- 过细的源码文件清单、函数名清单或临时目录结构。
- 文档治理流程本身，例如何时沉淀、何时归档、索引如何维护。
- 未经 verify 支撑、也未经用户确认的猜测。

如果本次不更新 `docs/project.md`，必须在 distill 输出或 progress 记录中说明“不更新”的理由，不能静默跳过。

## docs 索引规则

凡新增、移动、删除或修改 `docs/` 下文档，必须同步维护对应目录的 `index.md`。

规则：

- 每层目录只索引当前层的直接子目录和直接文档。
- 每个文档条目必须有一句话描述。
- 描述必须基于阅读文档内容后编写，不能从文件名猜测。
- 如果新增目录，也要创建或更新该目录的 `index.md`。

## progress.md 更新规则

`progress.md` 是 change 阶段状态的权威来源。

完成 `distill-change` 后：

- 如果长期 docs 已按需沉淀，或明确无需沉淀，将 `progress.md` 更新为：`当前阶段：已完成`。
- 在“产物检查”中把 distill 标记为已完成。
- 在“进展记录”追加本次更新的长期 docs 路径，或记录无需沉淀的理由。
- 如果发现 verify 证据不足、docs 冲突或仍有未解决 CRITICAL，将当前阶段写为 `阻塞` 或回到合适阶段，并记录建议回流技能。
- 如果本技能由 `step-change` 调用且 `step-change` 会统一更新 progress，也必须保证 distill 结论可被检查，并在汇报中说明是否可随 version 归档。

## 退出条件

当满足以下条件时，`distill-change` 可以结束：

- 目标 version/change 已确认。
- 已读取 verify 证据，且不存在未解决 CRITICAL。
- 已检查 WHAT / HOW / runbook / project knowledge 是否需要长期沉淀。
- 需要沉淀的 specs 已合并到 `docs/specs/`。
- 需要沉淀的 design/architecture/ADR/runbook 已写入 `docs/design/`、`docs/architecture/` 或 `docs/runbooks/`。
- 如影响 project big picture，`docs/project.md` 已更新；如不影响，已记录无需更新的理由。
- 对应 docs 索引已同步维护。
- 没有只留在 `.workflow/versions/<version>/changes/<change-id>/` 或 `.workflow/versions/<version>/shared/` 中、但未来仍需要复用的知识。
- 下一步可以进入 `archive-version`。
