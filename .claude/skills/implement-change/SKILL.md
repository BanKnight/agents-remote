---
name: implement-change
description: 按 `.workflow/versions/<version>/changes/<change-id>/tasks.md` 执行实现并更新任务状态。用户要求开始实现、继续实现或完成某个 change 时使用。
---

# implement-change 技能

## 定位

`implement-change` 用于按照指定 change 的 `plan.md` 与 `tasks.md` 执行实现或运行态文件变更，并更新任务完成状态。

它的核心输入是：

```text
.workflow/versions/<version>/changes/<change-id>/plan.md
.workflow/versions/<version>/changes/<change-id>/tasks.md
```

`implement-change` 必须能够仅通过这两个文件先还原两件事：

1. 当前 change 要做什么：目标、范围、执行边界、额外上下文、version shared 读写约定。
2. 当前 change 做到哪里：已完成任务、未完成任务、阻塞项、下一个可执行任务。

如果无法从 `plan.md` 和 `tasks.md` 还原上述信息，说明实现上下文不足，必须暂停并说明缺失信息，给出补齐 `plan.md` / `tasks.md` 的建议，由用户决定是否回到 `plan-change`。

`implement-change` 只负责实现与任务进度更新，不负责重新规划 roadmap、重写 specs/design、执行最终验证、归档或长期沉淀。实现前必须把当前任务的验收标准、修改范围、上游 specs/design/docs/version shared 约束和不做事项还原为任务承诺清单；实现后必须逐项核对，不能把有约束力的承诺降级为背景资料。

## 参考资料

执行时按任务类型按需读取，可同时读取多个 reference；reference 不是互斥选项：

- [prototype-ui-alignment.md](references/prototype-ui-alignment.md) — UI 复刻、原型对齐、截图/viewport/artifact、真实能力边界与视觉差异处理。
- [component-and-style-abstraction.md](references/component-and-style-abstraction.md) — 组件提取、布局/导航/样式抽象、设计系统边界与不过度抽象判断。
- [react-frontend-implementation.md](references/react-frontend-implementation.md) — React 组件、路由、hooks、状态、样式和浏览器可见行为实现约束。

如果任务同时命中多个场景，例如 React 原型复刻且要求组件抽象，必须同时读取对应 references，并把它们的检查点合并进任务承诺清单。

## 主动触发

当满足以下情况时，使用 `implement-change`：

- `progress.md` 中当前阶段为 `待实现`。
- change 已经具备 `plan.md` 与 `tasks.md`。
- 用户要求“开始实现”“继续实现”“按任务做”“把这个 change 做掉”。
- `step-change` 读取 `progress.md` 后发现当前阶段是 `待实现`。
- 上一次实现中断后，用户要求继续。

不要在以下情况强行进入：

- 目标 change 尚未进入 `.workflow/versions/index.md`。
- 目标 change 缺少 `context.md`、`plan.md` 或 `tasks.md`。
- tasks 中仍有未解决阻塞项。
- plan/tasks 中列出的必要上下文缺失。
- 用户正在讨论 roadmap、spec、design 或任务拆分，而不是实现。

## change 参数

执行本技能时必须确定目标 change。

- 如果用户传入 `.workflow/versions/<version>/changes/<change-id>/` 路径，使用该 change。
- 如果用户传入 `<version>/<change-id>`，使用对应 version 下的 change。
- 如果用户只传入 change-id，因为活跃区 change-id 应保持全局唯一，先在 `.workflow/versions/index.md` 中定位该 change；若出现多个匹配，列出候选并要求用户选择。
- 如果用户没有传入 change，读取 `.workflow/versions/index.md` 的“当前焦点”。
- 如果当前焦点缺失或不明确，列出 3-4 个处于 `待实现` 或有未完成 tasks 的候选 change，并要求用户选择。
- 不要在未确认 change 的情况下修改代码、运行实现命令或勾选 tasks。

## 输入契约

### 标准输入

每次执行都需要读取并理解这些输入：

```text
.workflow/versions/index.md
.workflow/versions/<version>/changes/<change-id>/context.md
.workflow/versions/<version>/changes/<change-id>/progress.md
.workflow/versions/<version>/changes/<change-id>/plan.md
.workflow/versions/<version>/changes/<change-id>/tasks.md
```

读取规则：

- `.workflow/versions/index.md` 用于确认目标 change 已进入活跃 roadmap、所属 version、依赖和当前焦点。
- `context.md` 是 change 看板上下文，提供来源、当前已知边界、version shared 读写约定和背景引用。
- `progress.md` 是阶段状态和局部阻塞的权威来源。
- `plan.md` 是实现上下文入口，不要绕过 plan 直接看 tasks 做事。
- `tasks.md` 是执行队列和任务进度来源。
- 同一 change 目录内的 `context.md`、`progress.md`、`specs/`、`design/`、`plan.md`、`tasks.md` 是默认运行态上下文；实现阶段按需读取，不要求 `plan.md` 重复列出。
- 默认 change 目录之外的长期 docs、version shared、代码区域、外部仓库、环境或人工确认，必须由 `plan.md` / `tasks.md` 明确列出或由 `context.md` 背景引用指明。
- 已完成任务只作为上下文，不重复执行，除非用户要求重做。
- 对当前要执行的未完成任务，必须从 `tasks.md` 的验收标准、任务承诺清单、依据、必读上下文、修改范围、依赖和并行判断中恢复执行边界；如果 `tasks.md` 缺少任务承诺清单，但 plan/spec/design/docs/shared 明显包含对该任务有约束力的承诺，必须暂停并建议回到 `plan-change` 补齐，而不是自行弱化或猜测。

### 条件输入

根据当前任务、plan/tasks 引用、context 和实现风险，按需读取这些输入：

1. **implement references**
   - 如果当前任务属于某个 references 适用场景，执行前必须读取对应 reference。
   - references 可以组合加载；例如 React 原型复刻并要求抽象组件时，应同时读取 prototype UI alignment、component/style abstraction 和 React frontend implementation references。
   - 读取 reference 后必须把其中适用于当前任务的检查点纳入任务承诺清单；不适用的检查点不强行执行，但不要忽略与任务验收标准或上游承诺直接相关的内容。

2. **specs/design**
   - 如果当前任务引用 specs 或 design，执行前必须读取对应文件。
   - 读取后必须判断其中哪些要求是当前任务的实现承诺，例如必须满足的行为、必须采用或避免的结构、必须保留的边界、必须产出的 artifact、必须使用的模板/工具/流程或必须验证的场景。
   - 如果实现发现 specs 与 design 冲突，暂停并建议回到 `specify-change` 或 `design-change` 修正。

3. **version shared**
   - 如果 `context.md`、`plan.md` 或 `tasks.md` 要求读取 `.workflow/versions/<version>/shared/` 下的共享材料，先读取相关文件再实现。
   - 读取 shared 后必须区分背景信息与有约束力的共享基线；有约束力的共享基线必须进入当前任务承诺清单并在完成前核对。
   - 如果当前任务要写入或更新 version shared，必须按 tasks 的验收标准执行，并确保内容可供指定消费者读取。

4. **长期 docs**
   - 如果 plan/tasks 指向 `docs/project.md` 或长期 specs/design/architecture/runbooks/research，按需读取。
   - 如果实现发现缺少关键长期约束，不要自行发散补全；暂停并建议回到 `plan-change` 更新 plan/tasks。

5. **依赖 change**
   - 如果 versions index 或 tasks 声明依赖其他 change，读取依赖 change 的 `context.md`、`progress.md` 和足以判断当前任务输入的产物。
   - 如果依赖未满足，不跳过阻塞任务，记录阻塞并建议先推进依赖 change。

6. **项目文件与代码**
   - 按 tasks 的“必读上下文”和“修改范围”读取相关代码、测试、配置、脚本或文档。
   - 不要超出当前任务修改范围做顺手重构。

7. **长驻进程与外部依赖**
   - 如果实现或局部检查需要开发服务器、后台 worker、模拟服务、数据库、容器或其他外部依赖，必须优先复用或重启已有受管理实例。
   - 按项目约定选择可追踪、可复用、可停止的管理方式，避免反复启动新端口、制造孤儿进程或依赖不可追踪的临时 shell。

## 输出契约

### 标准输出

每次完成一个或多个实现任务后，必须更新：

```text
.workflow/versions/<version>/changes/<change-id>/tasks.md
.workflow/versions/<version>/changes/<change-id>/progress.md
```

标准输出要求：

- 已完成任务在 `tasks.md` 中从 `- [ ]` 改为 `- [x]`。
- 未完成或部分完成任务保持未勾选，并记录必要的简短进展或阻塞原因。
- 每个勾选任务都满足该任务自己的验收标准、修改范围和必要局部检查。
- `progress.md` 记录当前阶段、implementation 产物检查、阻塞项和进展记录。
- 系统任务追踪状态、`tasks.md` 勾选状态和用户汇报保持一致。

### 条件输出

根据实现结果，按需产生这些输出：

1. **任务承诺清单执行记录**
   - 对本轮执行的每个任务，必须能在会话汇报、`tasks.md` 简短结果或 `progress.md` 进展记录中看出关键承诺已处理。
   - 如果某个承诺不适用、已被更高优先级边界覆盖或需要上游回流，必须说明原因并保持相关任务未完成。

2. **代码或运行态文件变更**
   - 按当前任务的修改范围完成最小必要变更。
   - 不做当前任务以外的功能、重构或长期文档沉淀。

3. **version shared 更新**
   - 如果任务要求写入 version shared，更新对应 `.workflow/versions/<version>/shared/` 文件，并在任务结果中简短说明供谁使用。

4. **阻塞记录**
   - 如果任务依赖未满足、上下文缺失、测试失败原因不清、或需要用户取舍，保持任务未完成，并在 `tasks.md`、`progress.md` 或汇报中记录阻塞。

5. **progress 阶段推进**
   - 如果所有 tasks 已完成且无阻塞，将 `progress.md` 更新为 `当前阶段：待验证`。
   - 如果仍有未完成 tasks，保持 `当前阶段：待实现`，并记录剩余任务。
   - 如果遇到阻塞，将当前阶段写为 `阻塞`，并记录阻塞原因。
   - 如果本技能由 `step-change` 调用且 `step-change` 会统一更新 progress，必须保证 tasks 状态可被检查，并在汇报中说明是否可进入 `verify-change`。

6. **用户可读摘要**
   - 每次结束时简短汇报目标 change、本轮完成任务、tasks 进度、是否遇到阻塞、下一步。

## 不负责

`implement-change` 不负责：

- 规划 roadmap、新建 version 或新建 change。
- 新增或重写 specs。
- 新增或重写 design。
- 重新拆解 tasks。
- 执行最终 verify。
- 把内容沉淀进长期 docs。
- 归档 version。

如果实现过程中发现 plan/spec/design/tasks 有问题，应暂停并建议回到对应技能修正，而不是在实现阶段偷偷改写上游 artifact。

如果发现 specs/design/docs/version shared 中存在明确约束，但 `tasks.md` 没有把它投影到任务承诺清单、验收标准、修改范围或验证要求中，应暂停并建议回到 `plan-change` 补齐任务，而不是在实现阶段自行解释或降级。

## 长驻进程与外部依赖管理规则

`implement-change` 面向通用技术栈，不固定某一种服务形态或进程管理工具。遇到需要长期运行或跨步骤复用的依赖时，按场景选择可追踪、可复用、可停止的管理方式：

- 开发服务器或本地预览服务：优先复用已有受管理实例；需要重启时使用同一实例名或同一管理入口，记录访问地址、端口和日志入口。
- 后台 worker、队列消费者、watcher 或实时同步进程：使用项目约定的 supervisor、进程管理器、终端复用工具或平台后台任务机制，记录启动命令、实例名和停止方式。
- 数据库、缓存、消息队列、对象存储模拟器或第三方服务替身：优先使用项目既有容器编排、测试 fixture、mock server 或 ephemeral harness，避免在实现阶段临时散落启动。
- 一次性命令、短测试或构建：不需要强行放进长驻管理工具，但必须避免把一次性命令伪装成长驻服务。
- 不确定项目约定时：先读取 `docs/project.md`、runbook、plan/tasks 或项目脚本；仍不明确时，采用最小可追踪方式并在任务记录中说明。

## 上下文恢复规则

`implement-change` 是最容易跨上下文中断的阶段，因此 `plan.md` 和 `tasks.md` 必须作为恢复上下文的权威入口。

开始实现前，先只基于这两个文件判断。

### 从 plan.md 还原 change 内容

必须能够看出：

- change-id 与所属 version。
- change 的目标和范围。
- 本次明确不做什么。
- 局部 big picture 与执行策略。
- 默认 change 目录之外的额外上下文：version shared、长期 docs、外部仓库、本地源码、代码入口、环境/权限/人工确认，或明确说明没有额外上下文。
- 任务顺序依据、依赖、shared 读写、风险和验证关注点。

### 从 tasks.md 还原完成进度

必须能够看出：

- 总任务列表。
- 已完成任务。
- 未完成任务。
- 阻塞项。
- 任务依赖关系。
- 下一个可执行任务。
- 每个任务的验收标准、任务承诺清单、必读上下文、修改范围和并行判断。

如果以上任一信息无法从 `plan.md` / `tasks.md` 判断，不要靠对话记忆或猜测补全；应暂停，列出缺失项和建议修正方式，由用户决定是否回到 `plan-change` 更新 plan/tasks。

## 状态检查

确认目标 change 后，先检查当前状态：

1. `.workflow/versions/<version>/changes/<change-id>/` 是否存在。
2. `context.md` 是否存在。
3. `progress.md` 是否存在。
4. `plan.md` 是否存在。
5. `tasks.md` 是否存在。
6. `tasks.md` 是否还有未完成任务。
7. `tasks.md` 是否存在阻塞项。
8. `plan.md` / `tasks.md` 中列出的必要上下文是否存在。
9. `progress.md` 中当前阶段是否为 `待实现`，或是否仍有未完成 tasks。

根据状态处理：

- 如果缺少 `context.md` 或 `progress.md`，停止并提示先回到 `plan-versions` 补齐 change 骨架。
- 如果缺少 `plan.md` 或 `tasks.md`，停止并提示先执行 `plan-change`。
- 如果所有 tasks 已完成，说明无需实现，建议进入 `verify-change`。
- 如果存在阻塞项，先汇报阻塞并询问是否处理阻塞。
- 如果必要上下文缺失，停止并建议修正 `plan.md` 或补齐对应 artifact。

## 核心执行循环

1. 确认目标 change。
2. 读取标准输入，检查 change 当前状态。
3. 先基于 `plan.md` 还原当前 change 要做什么。
4. 再基于 `tasks.md` 还原当前 change 做到哪里。
5. 如果无法还原内容或进度，暂停并给出补齐建议，不继续实现。
6. 按条件输入规则读取当前任务需要的 implement references、specs/design、version shared、长期 docs、依赖 change、项目文件、代码或外部依赖；如果多个 reference 同时适用，全部读取并合并检查点。
7. 从 `tasks.md` 中找出第一个可执行的未完成任务。
8. 提取该任务的任务承诺清单：结合任务验收标准、依据、必读上下文、修改范围、依赖、plan 执行策略、已加载 references、spec/design/docs/version shared 约束和不做事项，列出必须实现、必须保留、必须使用、必须产出、必须验证或必须避免的承诺。
9. 如果任务承诺清单缺失或与已读取上游约束、适用 references 不一致，暂停并建议回到 `plan-change` 补齐；不得跳过、猜测或降级这些承诺。
10. 如果本轮需要长驻进程、开发服务器、后台 worker、模拟服务、数据库、容器或其他外部依赖，先按项目约定检查是否已有可复用的受管理实例；只有确认没有可复用实例时才启动新的受管理实例，并记录管理方式、实例名、端口或访问入口。
11. 按任务依赖顺序执行；不得跳过阻塞任务。
12. 对标记为可并行的任务，只有在它们不修改同一文件且依赖已满足时，才可以并行或连续处理。
13. 为本轮要执行的任务创建或更新系统任务追踪条目，并在开始前标记当前任务为进行中。
14. 每次只围绕当前任务做最小必要变更。
15. 完成任务后先确认任务承诺清单、验收标准和局部检查均已满足，再立即在 `tasks.md` 中把对应任务从 `- [ ]` 改为 `- [x]`。
16. 同步把对应系统任务标记为完成；如果部分完成或阻塞，保持未完成并记录原因。
17. 如果任务完成需要补充实现说明，只写入任务下方的简短结果，不写长篇复盘。
18. 继续下一个任务，直到所有任务完成、遇到阻塞、用户中断或需要回到上游 artifact。

## 系统任务追踪工具规则

`implement-change` 默认应使用系统任务追踪工具管理本轮执行，尤其是跨多个 task、长时间测试/构建、或可能被中断的实现。

定位：

- `tasks.md` 是 change 进度的权威持久记录。
- 系统任务追踪工具是本轮会话的执行看板，用于让长流程可见、可暂停、可恢复。
- 不要用系统任务状态替代 `tasks.md`；恢复时先读 `plan.md` / `tasks.md`，再同步系统任务。

使用规则：

- 开始实现前，先用系统任务列表检查是否已有当前 change 的任务，避免重复创建。
- 根据 `tasks.md` 中未完成、未阻塞、可执行的任务创建或更新系统任务；必要时为长任务拆出本轮子任务。
- 开始处理某个任务前，立即把对应系统任务标记为进行中。
- 完成任务后，先确认验收标准与局部检查，再勾选 `tasks.md`，随后把对应系统任务标记为完成。
- 遇到阻塞时，保持原任务未完成，并在系统任务或新建阻塞任务中记录需要用户或上游技能解决的事项。
- 对可并行任务，只有在文件修改范围互不冲突时，才创建并行系统任务；完成后仍按 `tasks.md` 逐项落盘。
- 每次结束前，系统任务状态、`tasks.md` 勾选状态和对用户汇报必须一致。

## 跨上下文执行规则

`implement-change` 很可能跨多轮会话完成，因此必须降低上下文丢失风险：

- 每次开始时都重新读取 `plan.md` 和 `tasks.md`，不要依赖记忆。
- 优先处理 `tasks.md` 中最靠前的未完成且未阻塞任务。
- 完成每个任务后立即勾选，避免中断后重复做。
- 如果发现任务状态与代码状态不一致，先汇报并询问是否校正 tasks。
- 长任务应在任务条目下记录简短进展或阻塞原因。
- 不把“本轮对话记忆”当作实现依据；实现依据必须能从 plan/tasks/spec/design/docs 读到。

## 错误与回流规则

遇到以下情况必须暂停：

- task 描述不清，无法确定要改什么。
- task 的依赖未完成。
- plan 中必要上下文缺失或互相矛盾。
- 实现发现 spec 与 design 冲突。
- 实现发现 tasks 拆分不合理，继续做会扩大范围。
- 实现发现 specs/design/docs/version shared 中有明确约束，但 tasks 没有把它承接为任务承诺、验收标准、修改范围或验证要求。
- 测试、构建或关键检查失败且原因不清。
- 需要用户确认产品、架构、数据、安全或兼容性取舍。

暂停时要说明：

- 当前 change。
- 当前任务。
- 已完成哪些工作。
- 阻塞原因。
- 建议回到哪个技能修正：`specify-change`、`design-change` 或 `plan-change`。

## 任务完成规则

任务只能在满足以下条件时勾选完成：

- 任务要求的代码、运行态 artifact 或文件变更已完成。
- 任务承诺清单中的承诺已逐项处理；不适用或被更高优先级边界覆盖的承诺已记录原因。
- 满足该任务自己的验收标准。
- 不违反 context/plan/spec/design/docs/version shared 中的约束。
- 必要的局部检查已执行，或已说明为什么无法执行。
- 没有遗留未记录的阻塞。

不要因为“部分完成”而勾选任务。部分完成时，在任务下记录进展并保持未勾选。

## progress.md 更新规则

`progress.md` 是 change 阶段状态的权威来源。

每轮 `implement-change` 结束后：

- 如果所有 tasks 已完成且无阻塞，将 `progress.md` 更新为：`当前阶段：待验证`。
- 在“产物检查”中把 implementation 标记为已完成。
- 在“进展记录”追加本轮完成的任务摘要和 tasks 进度。
- 如果还有未完成 tasks，保持 `当前阶段：待实现`，并记录剩余任务。
- 如果遇到阻塞，将当前阶段写为 `阻塞`，并记录阻塞原因。
- 如果本技能由 `step-change` 调用且 `step-change` 会统一更新 progress，也必须保证 tasks 状态可被检查，并在汇报中说明是否可进入 `verify-change`。

## 完成后输出

每次结束时简短汇报：

- 目标 change。
- 本轮完成了哪些任务。
- 当前 tasks 进度。
- 是否涉及 version shared 读写。
- 是否遇到阻塞。
- 如果所有 tasks 完成，说明下一步是 `verify-change`。
- 如果暂停，说明建议回到哪个技能或需要用户确认什么。

## 退出条件

`implement-change` 可以结束于两种状态。

### 完成

- 目标 change 已确认。
- `context.md`、`plan.md`、`tasks.md` 和必要上下文已读取。
- 本轮完成任务的任务承诺清单已提取并核对。
- 所有 tasks 都已完成并勾选。
- 没有未记录阻塞。
- 下一步可以进入 `verify-change`。

### 暂停

- 已完成的任务已勾选。
- 未完成的任务保持未勾选。
- 阻塞项或回流原因已记录或汇报。
- 用户知道下一步应继续实现，还是回到 `specify-change` / `design-change` / `plan-change`。
