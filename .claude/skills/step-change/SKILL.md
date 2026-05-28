---
name: step-change
description: 读取 `.workflow/versions/index.md` 当前焦点或用户指定 change 的 context/progress，判断阶段并调用下一阶段 workflow skill 推进一个 change。用户要求继续推进、下一步、step、推进当前 change 或不确定该调用哪个 change 技能时使用。
---

# step-change 技能

## 定位

`step-change` 是 change 生命周期的智能推进 hub。

它从 `.workflow/versions/index.md` 找到当前焦点或用户指定 change，读取该 change 的 `context.md` 与 `progress.md`，根据当前阶段调用对应专业阶段技能推进一步，并在专业技能完成后检查产物、更新 `progress.md`，必要时同步 versions index 的当前焦点。

```text
versions/index.md -> 活跃 roadmap、当前焦点、依赖、全局阻塞
context.md        -> 当前 change 的看板上下文、来源、边界、共享材料读写约定
progress.md       -> 当前 change 阶段、局部阻塞、产物检查和进展记录
step-change       -> 当前阶段到阶段技能的唯一路由与分发
阶段技能          -> 产出具体 artifact
```

`step-change` 不直接编写 spec、design、plan、tasks、verify 或长期 docs 正文；它负责找到正确入口、调用正确阶段技能，并维护阶段推进的一致性。

## 主动触发

当用户要求以下内容时，使用 `step-change`：

- “继续推进当前 change”。
- “下一步做什么，直接做”。
- “step 一下”。
- “按 progress 往下走”。
- “我不确定现在该用哪个 workflow skill”。
- 当前 change 已进入活跃 roadmap，且用户没有明确指定某个专业阶段技能。

不要在以下情况强行进入：

- 用户明确要求执行具体阶段技能，例如 `specify-change`、`design-change`、`plan-change`。
- 用户正在讨论 roadmap 编排，而不是推进某个 change。
- 当前 change 处于阻塞阶段且用户没有要求处理阻塞。
- 推进需要用户确认范围、取舍或风险，不能自动判断。

## change 参数

执行本技能时可以指定 change。

- 如果用户传入 `.workflow/versions/<version>/changes/<change-id>/` 路径，使用该 change。
- 如果用户传入 `<version>/<change-id>`，使用对应 version 下的 change。
- 如果用户只传入 change-id，因为活跃区 change-id 应保持全局唯一，先在 `.workflow/versions/index.md` 中定位该 change；若出现多个匹配，列出候选并要求用户选择。
- 如果用户没有传入 change，读取 `.workflow/versions/index.md` 的“当前焦点”。
- 如果当前焦点缺失或对应 change 不存在，读取活跃 versions/changes 和各自 `progress.md`，展示 3-4 个可推进候选并询问用户选择。
- 如果目标 change 的 `context.md` 或 `progress.md` 缺失，停止并提示先回到 `plan-versions` 补齐骨架。

## 输入契约

### 标准输入

每次执行都需要读取并理解这些输入：

```text
.workflow/versions/index.md
.workflow/versions/<version>/changes/<change-id>/context.md
.workflow/versions/<version>/changes/<change-id>/progress.md
```

读取规则：

- `.workflow/versions/index.md` 只用于确定当前焦点、活跃队列、依赖、version 边界和全局阻塞，不读取其中不存在的 change 阶段状态。
- `context.md` 是目标 change 的看板入口；推进前必须理解其来源上下文、已知边界、共享材料读写约定和背景引用。
- `progress.md` 是目标 change 当前阶段、局部阻塞、产物检查和进展记录的权威来源。
- `step-change` 调用专业阶段技能前，只做必要状态判断，不代替该技能完成完整领域分析。
- 如果 `progress.md` 与实际产物冲突，先按实际产物提出校正建议；除非校正明显且安全，否则询问用户。

### 条件输入

根据目标 change 的 context、当前阶段、依赖和产物状态，按需读取这些输入：

1. **version shared**
   - 如果 `context.md` 的“需要读取 shared”或“背景引用”指向 `.workflow/versions/<version>/shared/`，先读取相关 shared 材料，再判断阶段是否可推进。
   - 如果当前阶段完成后需要产出 shared，`step-change` 只检查该约定是否存在；具体内容由对应阶段技能或后续沉淀动作产出。

2. **阶段产物**
   - 按当前阶段读取或检查目标 change 下的对应产物：

```text
.workflow/versions/<version>/changes/<change-id>/specs/
.workflow/versions/<version>/changes/<change-id>/design/
.workflow/versions/<version>/changes/<change-id>/plan.md
.workflow/versions/<version>/changes/<change-id>/tasks.md
.workflow/versions/<version>/changes/<change-id>/verify.md
.workflow/versions/<version>/changes/<change-id>/artifacts/
```

3. **依赖 change**
   - 如果 versions index 中目标 change 声明依赖，读取依赖 change 的 `context.md`、`progress.md` 和足以判断当前阶段输入是否满足的产物。
   - 只有依赖 change 已完成，或依赖 change 的中间产物已经足以满足当前阶段输入，才继续推进。

4. **docs big picture**
   - 如果 `context.md` 或当前阶段需要长期项目背景，先读取 `docs/project.md`。
   - 如果 `docs/project.md` 指向相关 specs/design/architecture/runbooks/research，或 `context.md` 的背景引用列出了 docs 路径，按需继续读取。

5. **archive 上下文**
   - 如果 `context.md` 的跨 version 共享或背景引用指向 `.workflow/archive/versions/<version>/...`，按需读取对应归档材料。
   - 旧归档结构如存在，只在被明确引用或需要历史追溯时读取，不做结构迁移。

6. **项目文件与代码**
   - 如果需要判断实现、验证或产物是否真实存在，按需读取相关代码、测试、配置或运行证据。

## 输出契约

### 标准输出

每次成功推进一个阶段后，必须保证这些输出成立：

```text
.workflow/versions/<version>/changes/<change-id>/progress.md
```

标准输出要求：

- `progress.md` 的当前阶段、产物检查、阻塞项和进展记录与本轮结果一致。
- “进展记录”追加一条简短记录，说明本轮调用的阶段技能、检查到的产物和下一阶段。
- 如果专业阶段技能已经自行更新 `progress.md`，`step-change` 只做一致性检查，必要时补充进展记录。
- 不把阶段状态写回 `.workflow/versions/index.md`。

### 条件输出

根据推进结果，按需产生这些输出：

1. **调用阶段技能**
   - 根据当前阶段调用对应专业阶段技能，并把目标 change 的 version/change-id 或 change 路径作为输入。

2. **阻塞记录**
   - 如果依赖未满足、上下文缺失、产物冲突或专业技能进入阻塞，将目标 change 的 `progress.md` 更新为 `阻塞`，并记录阻塞原因与建议先推进的 change 或材料。

3. **versions index 焦点同步**
   - 当目标 change 进入 `已完成`，且 `.workflow/versions/index.md` 当前焦点仍指向该 change 时，只更新 index 的“当前焦点”和“下一步”入口。
   - 不在 index 中维护单个 change 阶段状态。

4. **归档触发**
   - 当目标 change 完成后，如果它所在 version 的所有 changes 都已完成且无未解决阻塞，主动调用 `archive-version <version>`，除非用户明确要求只推进单个 change 且不要归档。

5. **用户可读摘要**
   - 完成后简短汇报目标 change、读取到的阶段、本轮调用的阶段技能、更新的 progress 信息、当前下一步和阻塞项。

## 阶段分发规则

| 当前阶段 | step-change 行为 |
|---|---|
| 待规格 | 调用 `specify-change <version>/<change-id>` |
| 待设计 | 调用 `design-change <version>/<change-id>` |
| 待计划 | 调用 `plan-change <version>/<change-id>` |
| 待实现 | 调用 `implement-change <version>/<change-id>` |
| 待验证 | 调用 `verify-change <version>/<change-id>` |
| 待沉淀 | 调用 `distill-change <version>/<change-id>` |
| 已完成 | 检查是否为所在 version 的最后一个未归档 change；如果是，触发 `archive-version <version>`；否则若 index 当前焦点仍指向本 change，则更新焦点到下一个合适 change |
| 阻塞 | 汇报阻塞，不调用阶段技能 |

`step-change` 一次 invocation 默认只推进一个阶段。如果专业阶段技能本身只完成了部分工作或进入阻塞，`step-change` 不继续调用后续阶段。

## progress.md 更新规则

专业阶段技能完成后，`step-change` 必须检查对应 artifact 是否存在，再更新 `progress.md`。

| 完成的技能 | 产物检查 | 更新为当前阶段 |
|---|---|---|
| specify-change | `specs/` 存在且包含 spec 文件 | 待设计 |
| design-change | `design/` 存在且包含 design 文件，或 progress 明确说明无需 design | 待计划 |
| plan-change | `plan.md` 与 `tasks.md` 存在 | 待实现 |
| implement-change | `tasks.md` 中实现任务已完成，且无未解决阻塞 | 待验证 |
| verify-change | `verify.md` 存在且无未解决 CRITICAL | 待沉淀 |
| distill-change | 长期 docs 已按需沉淀，或明确无需沉淀 | 已完成 |

更新时：

- 阶段进度更新只修改目标 change 的 `progress.md`；完成后的焦点同步按“versions index 焦点更新规则”处理。
- 不把阶段状态写回 `.workflow/versions/index.md`。
- 在“进展记录”追加一条简短记录，说明本轮完成的技能、产物和下一阶段。
- 如果遇到阻塞，把当前阶段改为 `阻塞`，并在阻塞项中记录原因。
- 如果专业技能已经自行更新了 `progress.md`，`step-change` 只做一致性检查，必要时补充进展记录。

## 不负责

`step-change` 不负责：

- 规划 roadmap、新建 version 或新建 change。
- 直接编写 specs/design/plan/tasks/verify/docs 正文。
- 直接修改代码实现。
- 代替专业阶段技能做领域判断。
- 自动归档未完成或未确认可归档的 version。
- 在阻塞未解除时强行推进。

## 核心执行循环

1. 确认目标 change；没有参数时从 `.workflow/versions/index.md` 当前焦点读取。
2. 读取目标 change 的 `context.md` 与 `progress.md`。
3. 按条件输入规则读取必要 shared、依赖、docs、archive 或阶段产物。
4. 检查当前阶段、阻塞项和依赖是否满足。
5. 根据阶段分发规则调用对应专业 skill。
6. 专业 skill 返回后，检查本阶段完成标志和关键 artifact。
7. 更新 `progress.md` 到下一阶段，或记录阻塞/部分完成。
8. 如果目标 change 已完成且仍是 versions index 当前焦点，按“versions index 焦点更新规则”同步 `.workflow/versions/index.md` 的当前焦点和下一步。
9. 如果目标 change 已完成，按“version 完成归档触发规则”检查是否应调用 `archive-version`。
10. 简短汇报本轮推进结果和下一步。

## versions index 焦点更新规则

当 `step-change` 将目标 change 推进到 `已完成`，或进入时发现目标 change 已经是 `已完成`，必须检查 `.workflow/versions/index.md` 的“当前焦点”。

如果当前焦点仍指向该已完成 change，则更新 `.workflow/versions/index.md`：

1. 在同一 version 内优先选择下一个未完成且依赖已满足或当前阶段可先推进的 change。
2. 同一 version 没有可推进 change 时，按 index 顺序选择后续 version 中第一个未完成且可推进的 change。
3. 若存在未完成 change 但依赖未满足，选择最应该先解除依赖的 change，并在“下一步”写明阻塞关系。
4. 若所有活跃 changes 均已完成，将当前焦点标记为无活跃 change，并在“下一步”提示可按 version 执行归档。

更新边界：

- 只更新 `.workflow/versions/index.md` 的“当前焦点”和“下一步”入口。
- 不在 index 写入单个 change 的阶段状态；阶段仍以各 change 的 `progress.md` 为准。
- 不移动、删除或归档 change；归档仍由 `archive-version` 负责。
- 如果用户显式指定已完成 change，只做焦点校正和下一步提示，不继续自动调用新焦点的阶段技能。

## version 完成归档触发规则

当 `step-change` 将目标 change 推进到 `已完成`，或进入时发现目标 change 已经是 `已完成`，必须判断它所在 version 是否已经全部完成。

触发条件：

1. 读取 `.workflow/versions/index.md`，确认目标 change 所属 version。
2. 读取同一 version 下所有 change 的 `progress.md`。
3. 若所有 change 都是 `已完成`，且没有未解决阻塞，则立即调用 `archive-version <version>`。
4. 若存在未完成 change，则不归档，只按 versions index 焦点规则切到下一个可推进 change。
5. 若归档前检查发现缺少 verify/distill/tasks 证据，停止归档并汇报应回到哪个阶段技能修正。

边界：

- 归档仍由 `archive-version` 执行，`step-change` 只负责识别“最后一个 change 已完成”的触发点。
- 不要只提示用户“可以归档”后结束；在 version 已满足归档条件时应主动触发归档。
- 如果用户显式只要求推进单个 change 且不要归档，尊重用户指令，只报告归档已就绪。

## 依赖检查规则

如果 versions index 中目标 change 声明了依赖：

- 读取依赖 change 的 `progress.md`。
- 只有依赖 change 当前阶段为 `已完成`，或依赖 change 的产物足以满足当前阶段输入，才继续推进。
- 如果依赖尚未满足，目标 change 的 `progress.md` 可以进入 `阻塞`，阻塞项写明未完成依赖和需要先推进的 change。

## 输出格式

完成后简短汇报：

- 目标 change。
- 读取到的当前阶段。
- 本轮调用了哪个阶段技能。
- 更新了哪些 progress 信息。
- 当前下一步是什么。
- 如有阻塞，说明阻塞项和建议先推进哪个 change。

## 退出条件

`step-change` 可以结束于三种状态。

### 已推进

- 已确认目标 change。
- 已调用对应阶段技能。
- 已检查产物。
- `progress.md` 已更新或确认已一致。
- 用户知道下一步。

### 阻塞

- 已确认目标 change。
- 阻塞项已写入或汇报。
- 未调用不该调用的阶段技能。
- 用户知道解除阻塞的建议。

### 需用户选择

- 当前焦点缺失或不明确。
- 已列出候选 change。
- 未在未确认目标时修改任何 artifact。
