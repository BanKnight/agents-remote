---
name: verify-change
description: 验证 `.workflow/versions/<version>/changes/<change-id>/` 下实现结果与 specs/design/tasks 的一致性，并产出 verify 证据。用户要求验收、核对实现、验证 change 或质量对齐时使用。
---

# verify-change 技能

## 定位

`verify-change` 用于验证指定 change 的实现是否与其承诺保持一致，并产出可追踪证据。

它是 Build 之后、Distill/Archive 之前的质量门禁。

`verify-change` 的核心不是一次性检查，而是建立并迭代验证回路：

```text
实现 → 验证 → 调整 → 再验证
```

没有可重复、可信的验证信号，不能声称 verify 通过。

`verify-change` 的重心是质量验证与一致性对齐，尤其是 implementation ↔ specs/tasks 的对齐。后续沉淀候选只由 `distill-change` 判断；verify 只提供证据，不提前决定哪些内容进入长期 `docs/`。

## 参考资料

执行时按需读取：

- [methodology.md](references/methodology.md) — verify-change 的 Trace / Delta / Scenario / Evidence 方法论。
- [harness.md](references/harness.md) — harness 类型、选择顺序与质量标准。
- [severity-and-reflow.md](references/severity-and-reflow.md) — 问题分级、误报控制与回流规则。

## 主动触发

当满足以下情况时，使用 `verify-change`：

- `implement-change` 已完成一个或多个任务。
- `step-change` 读取 `progress.md` 后发现当前阶段是 `待验证`。
- 用户要求确认实现是否完成、是否能收口、是否能归档。
- change 准备进入 `distill-change` 或 version 归档。
- 实现过程出现偏离 specs/design/tasks 的风险，需要质量对齐。
- 用户要求跑测试、做 e2e、检查一致性或验收。

不要在以下情况强行进入：

- 目标 change 尚未进入 `.workflow/versions/index.md`。
- 目标 change 缺少 `context.md`。
- change 还没有 specs/tasks，缺少可验证承诺。
- 用户仍在澄清、roadmap、spec、design 或实现阶段。
- 没有实现结果，也没有用户要求做预验证。

## change 参数

执行本技能时必须确定目标 change。

- 如果用户传入 `.workflow/versions/<version>/changes/<change-id>/` 路径，使用该 change。
- 如果用户传入 `<version>/<change-id>`，使用对应 version 下的 change。
- 如果用户只传入 change-id，因为活跃区 change-id 应保持全局唯一，先在 `.workflow/versions/index.md` 中定位该 change；若出现多个匹配，列出候选并要求用户选择。
- 如果用户没有传入 change，读取 `.workflow/versions/index.md` 的“当前焦点”。
- 如果当前焦点缺失或不明确，列出 3-4 个处于 `待验证` 或已有实现结果的候选 change，并要求用户选择。
- 不要在未确认 change 的情况下创建或更新 `verify.md`。

## 输入契约

### 标准输入

每次执行都需要读取并理解这些输入：

```text
.workflow/versions/index.md
.workflow/versions/<version>/changes/<change-id>/context.md
.workflow/versions/<version>/changes/<change-id>/progress.md
.workflow/versions/<version>/changes/<change-id>/specs/
.workflow/versions/<version>/changes/<change-id>/plan.md
.workflow/versions/<version>/changes/<change-id>/tasks.md
.workflow/templates/changes/verify.md
```

读取规则：

- `.workflow/versions/index.md` 用于确认目标 change 已进入活跃 roadmap、所属 version、依赖和当前焦点。
- `context.md` 是 change 看板上下文，提供来源、当前已知边界、version shared 读写约定和背景引用。
- `progress.md` 是阶段状态和局部阻塞的权威来源。
- `specs/` 是最高优先级的 WHAT 承诺，verify 首先验证实现是否满足 specs 中的 requirements 与 scenarios。
- `plan.md` / `tasks.md` 是实现承诺与执行证据。
- `.workflow/templates/changes/verify.md` 是写入结构基础。
- 如果某类 artifact 缺失，允许降级验证，但必须在 `verify.md` 中记录跳过原因。

### 条件输入

根据目标 change 的 context、实现范围、风险和可见行为，按需读取或检查这些输入：

1. **design**
   - 如果 `design/` 存在，读取相关 design 作为 HOW 承诺。
   - 如果 design 缺失但 plan/spec 明确说明无需额外 design，在 `verify.md` 记录该判断依据。

2. **已有 verify**
   - 如果 `verify.md` 已存在，读取后追加或更新本次验证轮次，不要直接覆盖历史结论。

3. **version shared**
   - 如果 `context.md`、plan/tasks 或 design 指向 `.workflow/versions/<version>/shared/`，读取相关 shared 材料。
   - 如果本 change 应写入或更新 shared，验证 shared 文件是否存在、内容是否满足消费者需要、是否和 context/plan/tasks 的约定一致。

4. **长期 docs**
   - 如果 `context.md`、specs/design/plan/tasks 指向 `docs/project.md` 或长期 specs/design/architecture/runbooks/research，按需读取。
   - docs 是长期约束来源；verify 只检查当前实现是否违反这些约束，不把新结论直接写入 docs。

5. **依赖 change**
   - 如果 versions index 或 tasks 声明依赖其他 change，读取依赖 change 的 `context.md`、`progress.md` 和相关产物，确认依赖产物满足当前验证输入。

6. **实现差异与代码证据**
   - 按需检查 git status/diff、代码文件、测试文件、配置、运行日志和任务勾选状态。
   - 关键代码引用使用 `file:line` 格式。

7. **验证 harness 与 artifacts**
   - 按需运行或检查 unit/integration/e2e/HTTP/CLI/headless browser/replay/benchmark/HITL 等 harness。
   - 验证证据存放在：

```text
.workflow/versions/<version>/changes/<change-id>/artifacts/
```

   - 涉及 UI、浏览器、CLI/TUI、文件/内容查看器、diff viewer、终端式交互、实时流、可视化报表或任何用户可见交互时，必须主动保存截图、trace、日志、录屏、自动化测试报告或等价 artifact；如果无法保存，必须在 `verify.md` 中写明原因。

## 输出契约

### 标准输出

每次成功执行验证后，必须创建或更新：

```text
.workflow/versions/<version>/changes/<change-id>/verify.md
.workflow/versions/<version>/changes/<change-id>/progress.md
```

标准输出要求：

- `verify.md` 记录本轮验证范围、harness、Trace / Delta / Scenario / Evidence 结果、问题分级、回流建议和最终结论。
- `verify.md` 不覆盖历史验证轮次；多轮验证应追加新轮次或更新对应轮次。
- 如果无 CRITICAL 且证据充分，`progress.md` 可推进到 `待沉淀`。
- 如果存在 CRITICAL、证据不足或关键 harness 失败，`progress.md` 保持或写为适当阶段/阻塞，并记录回流建议。

### 条件输出

根据验证结果，按需产生这些输出：

1. **artifacts**
   - 当验证产生截图、trace、日志、benchmark、自动化报告或手动验收记录时，写入或引用：

```text
.workflow/versions/<version>/changes/<change-id>/artifacts/
```

2. **version shared 验证结果**
   - 如果本 change 与 version shared 读写有关，`verify.md` 必须记录 shared 路径、验证方式、消费者是否可用，以及缺失或不一致项。

3. **回流建议**
   - 对每个 CRITICAL/WARNING，给出建议回流技能：`implement-change` / `plan-change` / `design-change` / `specify-change`。
   - 回流建议必须具体到要修正的承诺、任务、设计或实现位置。

4. **progress 更新**
   - 如果 `verify.md` 已补齐且无未解决 CRITICAL，将 `progress.md` 更新为 `当前阶段：待沉淀`。
   - 如果存在 CRITICAL 或证据不足，保持当前阶段或写为 `阻塞`，并记录阻塞原因。
   - 如果本技能由 `step-change` 调用且 `step-change` 会统一更新 progress，也必须保证 verify 结论可被检查，并在汇报中说明是否可进入 `distill-change`。

5. **用户可读摘要**
   - 完成后简短说明目标 change、使用的 harness、采集的 artifacts、结论、回流建议或下一步。

## 不负责

`verify-change` 不负责：

- 编写或修改功能实现。
- 重写 specs。
- 重写 design。
- 拆解任务。
- 执行长期沉淀。
- 判断哪些内容应该写入 `docs/`。
- 归档 version。

如果发现必须修改实现、specs、design 或 plan/tasks，记录问题和回流建议，交给对应技能处理。

## 状态检查

确认目标 change 后，先检查：

1. `.workflow/versions/<version>/changes/<change-id>/` 是否存在。
2. `context.md` 是否存在。
3. `progress.md` 是否存在。
4. `specs/` 是否存在。
5. `design/` 是否存在，或是否有充分理由不需要 design。
6. `plan.md` 是否存在。
7. `tasks.md` 是否存在。
8. `verify.md` 是否已存在。
9. `artifacts/` 是否存在；不存在则按需创建。
10. tasks 是否已经完成，或是否有用户明确要求做预验证。
11. 如果 change 涉及 UI、浏览器、CLI/TUI、终端式交互、实时流、可视化报表或其他用户可见行为，确认本轮将保存截图、trace、日志、录屏、自动化测试报告或等价 artifact。
12. `progress.md` 中当前阶段是否为 `待验证`，或是否已有实现结果可验证。

根据状态处理：

- 如果缺少 `context.md` 或 `progress.md`，停止并提示先回到 `plan-versions` 补齐 change 骨架。
- 如果 specs 缺失，停止并提示先执行 `specify-change`。
- 如果 plan.md 或 tasks.md 缺失，停止并提示先执行 `plan-change`。
- 如果 tasks 未完成且用户没有要求预验证，说明只能做部分验证，不能给出最终通过结论。
- 如果 verify.md 已存在，读取后追加或更新本次验证轮次，不要直接覆盖历史结论。

## 系统任务追踪工具规则

`verify-change` 默认应使用系统任务追踪工具管理本轮验证，尤其是多 harness、多轮回流、长时间测试/e2e、或需要人工证据的场景。

定位：

- `verify.md` 是验证证据和结论的权威持久记录。
- 系统任务追踪工具是本轮会话的验证看板，用于拆分、显示和恢复长验证流程。
- 不要用系统任务状态替代 `verify.md`；最终证据、问题分级和结论必须写入 `verify.md`。

使用规则：

- 开始验证前，先检查系统任务列表是否已有当前 change 的验证任务，避免重复创建。
- 每一轮验证开始时，为状态检查、harness 建立、Trace、Delta、Scenario、Evidence、`verify.md` 写入创建或更新系统任务。
- 开始执行某个验证步骤前，立即把对应系统任务标记为进行中。
- 长时间运行的测试、e2e、benchmark 或人工验证应有独立系统任务，避免验证过程不可见。
- 发现 CRITICAL / WARNING 时，创建或更新回流任务，明确建议回到 `implement-change` / `plan-change` / `design-change` / `specify-change`。
- 验证步骤完成后，先把证据或跳过原因写入 `verify.md`，再把对应系统任务标记为完成。
- 如果验证被中断，保持未完成系统任务，并确保 `verify.md` 或用户汇报中能看出已完成范围、缺失证据和下一步。
- 每次结束前，系统任务状态、`verify.md` 轮次记录和对用户汇报必须一致。

## 验证方法

### 1. 建立验证 harness

先选择或构建可重复的验证信号。优先考虑能覆盖真实风险的 harness：

- unit test
- integration test
- e2e test
- HTTP / curl script
- CLI fixture + snapshot diff
- headless browser script
- replay trace
- throwaway harness
- property / fuzz loop
- differential loop
- HITL loop

harness 必须尽量做到：快、稳、准、可复现、可追踪。

如果无法构建可信 harness，必须在 `verify.md` 中说明尝试过什么、缺什么证据、需要用户提供什么环境或 artifact。

### 2. Trace 验证

建立承诺到证据的映射：

- context → specs/design/plan/tasks
- spec requirement → 实现位置
- scenario → 测试或手动验证证据
- design decision → 实现位置
- task checkbox → 代码/测试/证据
- version shared 约定 → shared 文件或消费者验证证据

每个关键承诺都应有具体证据。代码引用使用 `file:line` 格式。

### 3. Delta 验证

检查本次实现差异：

- 是否超出 scope。
- 是否新增未被 specs/design 支撑的行为。
- 是否修改非目标区域。
- 是否引入额外风险。
- 是否更新了未在 context/plan/tasks 中约定的 version shared 或长期 docs。

### 4. Scenario 验证

从真实路径验证：

- 正常路径。
- 边界路径。
- 失败路径。
- 用户可见行为。

涉及 UI、浏览器、CLI/TUI、终端式交互、实时流、可视化报表或其他用户可见行为时，应优先使用真实交互 harness 验证，而不仅是类型检查或单元测试。交互式能力的 Scenario 必须至少记录一种可审查 artifact：截图、trace、video、自动化测试报告、交互日志、浏览器 console 日志、服务日志或等价证据；没有 artifact 的交互式 verify 只能写成证据不足或明确说明为什么无法采集。

### 5. Evidence 验证

收集并记录证据：

- 测试技能与结果。
- e2e/手动操作步骤。
- 截图、日志、trace、benchmark。
- 交互式验证 artifact：截图、trace、video、自动化测试报告、交互日志、浏览器 console 日志、服务日志或等价证据。
- version shared 证据。
- 关键代码引用。
- artifacts 路径。

没有证据的“通过”不能写成通过，只能写成未验证或证据不足。

## 问题分级

每个问题必须归入：

- CRITICAL：必须修复后才能通过 verify。
- WARNING：可条件通过，但必须明确记录例外或后续项。
- SUGGESTION：不阻塞，但建议优化。

每个 CRITICAL/WARNING 必须包含：

- 问题描述。
- 对应承诺或证据。
- 影响范围。
- 建议回流技能：`implement-change` / `plan-change` / `design-change` / `specify-change`。
- 具体行动建议。

当不确定时，优先降级：

```text
CRITICAL → WARNING → SUGGESTION
```

不要用不确定判断阻塞 change；但必须说明不确定性来源和需要补充的证据。

## 迭代验证规则

`verify-change` 可以多轮执行。

每一轮必须记录：

- 轮次。
- 验证时间。
- 系统任务追踪条目或本轮验证步骤概况。
- 使用的 harness。
- 验证范围。
- 发现的问题。
- 调整建议。
- 本轮结论。

如果验证失败：

1. 记录失败与回流建议。
2. 回到相应技能修正。
3. 修正后重新执行 `verify-change`。
4. 新验证轮次必须重新运行相关 harness，不能复用旧通过结论。

## verify 写入格式

优先使用模板：

```text
.workflow/templates/changes/verify.md
```

输出路径：

```text
.workflow/versions/<version>/changes/<change-id>/verify.md
```

`verify.md` 至少包含：

- change 概览。
- 验证轮次记录。
- harness 清单。
- Trace 验证矩阵。
- Delta 验证结论。
- Scenario 验证结论。
- Evidence 清单。
- 交互式 artifact 清单；如果不适用或无法采集，记录理由。
- version shared 验证记录；如果不适用，记录理由。
- Completeness / Correctness / Coherence 评分表。
- CRITICAL / WARNING / SUGGESTION 问题清单。
- 回流建议。
- 最终结论。

## progress.md 更新规则

`progress.md` 是 change 阶段状态的权威来源。

完成 `verify-change` 后：

- 如果 `verify.md` 已补齐且无未解决 CRITICAL，将 `progress.md` 更新为：`当前阶段：待沉淀`。
- 在“产物检查”中把 verify 标记为已完成。
- 在“进展记录”追加本轮 verify 结论和 `verify.md` 路径。
- 如果存在 CRITICAL 或证据不足，保持或改为适当阶段；必要时写为 `阻塞`，并记录建议回流的技能。
- 如果本技能由 `step-change` 调用且 `step-change` 会统一更新 progress，也必须保证 verify 结论可被检查，并在汇报中说明是否可进入 `distill-change`。

## 完成后输出

完成后简短汇报：

- 目标 change。
- 使用了哪些 harness。
- 采集了哪些截图、trace、日志或其他 artifact；如未采集，说明原因。
- 是否验证了 version shared 读写约定。
- `verify.md` 创建或更新位置。
- 当前结论：通过 / 条件通过 / 不通过 / 证据不足。
- 如不通过，建议回到哪个技能。
- 如通过，解锁下一步：`distill-change`。

## 退出条件

当满足以下条件时，`verify-change` 可以结束：

- 目标 change 已确认。
- 已读取 context、specs/design/plan/tasks 或记录缺失原因。
- 已选择或尝试建立验证 harness。
- 已执行 Trace / Delta / Scenario / Evidence 验证，或记录无法执行原因。
- 每个问题都有分级、证据和回流建议。
- `verify.md` 已创建或更新。
- 最终结论明确。
- 如果存在 CRITICAL，明确不能进入 distill/archive。
- 如果无 CRITICAL，说明是否可以进入 `distill-change`。
