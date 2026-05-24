---
name: implement-change
description: 按 `.workflow/changes/<change-id>/tasks.md` 执行实现并更新任务状态。用户要求开始实现、继续实现或完成某个 change 时使用。
---

# implement-change 技能

## 定位

`implement-change` 用于按照指定 change 的实现计划执行代码变更。

它的核心输入是：

```text
.workflow/changes/<change-id>/plan.md
.workflow/changes/<change-id>/tasks.md
```

`implement-change` 必须能够仅通过这两个文件先还原两件事：

1. 当前 change 要做什么：目标、范围、实现边界、额外上下文。
2. 当前 change 做到哪里：已完成任务、未完成任务、阻塞项、下一个可执行任务。

如果无法从 `plan.md` 和 `tasks.md` 还原上述信息，说明当前实现上下文不足，必须暂停并说明缺失信息，给出补齐 `plan.md` / `tasks.md` 的建议，由用户决定是否回到 `plan-change`。

`implement-change` 只负责实现与任务进度更新，不负责重新规划 roadmap、重写 spec/design、验证归档或长期沉淀。

## change 参数

执行本技能时必须确定目标 change。

- 如果用户传入 change 名称，使用该名称。
- 如果用户没有传入 change 名称，先读取 `.workflow/roadmap.md` 与 `.workflow/changes/`，列出当前活跃 changes，并询问用户要指定哪个 change。
- 如果上下文里似乎能推断 change，也不能直接猜测或自动选择；必须让用户确认。
- 不要在未确认 change 的情况下修改代码或勾选 tasks。

选择 change 时，应优先展示 3-4 个最相关或最近活跃的 change，并显示：

- change-id
- 所属 version
- 当前阶段（来自 `progress.md`）
- change 路径
- 未完成任务数量（如果能从 tasks.md 得到）
- 最近上下文依据（如当前焦点或 roadmap 排序）

可以把最可能的 change 标记为“推荐”，但仍必须由用户选择。

## 主动触发

当满足以下情况时，AI 可以主动建议或进入 `implement-change`：

- `progress.md` 中当前阶段为 `待实现`。
- change 已经具备 `plan.md` 与 `tasks.md`。
- 用户要求“开始实现”“继续实现”“按任务做”“把这个 change 做掉”。
- 上一次实现中断后，用户要求继续。

不要在以下情况强行进入：

- 目标 change 尚未进入 roadmap。
- change 缺少 `plan.md` 或 `tasks.md`。
- tasks 中仍有未解决阻塞项。
- plan 中列出的必要上下文缺失。
- 用户正在讨论 spec、design 或任务拆分，而不是实现。

## 输入

必须读取：

```text
.workflow/roadmap.md
.workflow/changes/<change-id>/progress.md
.workflow/changes/<change-id>/plan.md
.workflow/changes/<change-id>/tasks.md
```

默认读取同一 change 目录内的运行态上下文，并按 `plan.md` 和 `tasks.md` 的额外上下文要求读取必要文件：

```text
.workflow/changes/<change-id>/intents.md
.workflow/changes/<change-id>/progress.md
.workflow/changes/<change-id>/specs/
.workflow/changes/<change-id>/design/
docs/...
代码文件或目录
```

读取规则：

- `plan.md` 是实现上下文入口，不要绕过 plan 直接看 tasks 做事。
- `tasks.md` 是执行队列和进度来源。
- 同一 change 目录内的 `intents.md`、`progress.md`、`specs/`、`design/` 是默认运行态上下文；开始实现时可按需读取，不要求 `plan.md` 重复列出。
- 只对默认 change 目录之外的长期 docs、代码区域、外部仓库、环境或人工确认，要求 `plan.md` / `tasks.md` 明确列出。
- 如果 tasks 引用了 spec/design/docs，执行对应任务前必须读取这些引用。
- 如果实现时发现明显缺少长期 docs、关键代码区域或其他额外上下文，不要自行发散补全；先暂停并建议回到 `plan-change` 更新 plan/tasks。
- 已完成任务只作为上下文，不重复执行，除非用户要求重做。

## 上下文恢复规则

`implement-change` 是最容易跨上下文中断的阶段，因此 `plan.md` 和 `tasks.md` 必须作为恢复上下文的权威入口。

开始实现前，先只基于这两个文件判断：

### 从 plan.md 还原 change 内容

必须能够看出：

- change-id 与所属 version。
- change 的目标和范围。
- 本次明确不做什么。
- 局部 big picture 与执行策略。
- 默认 change 目录之外的额外上下文：长期 docs 路径、外部仓库、本地源码、代码入口、环境/权限/人工确认，或明确说明没有额外上下文。
- 任务顺序依据、依赖、风险和验证关注点。

### 从 tasks.md 还原完成进度

必须能够看出：

- 总任务列表。
- 已完成任务。
- 未完成任务。
- 阻塞项。
- 任务依赖关系。
- 下一个可执行任务。
- 每个任务的验收标准、必读上下文和修改范围。

如果以上任一信息无法从 `plan.md` / `tasks.md` 判断，不要靠对话记忆或猜测补全；应暂停，列出缺失项和建议修正方式，由用户决定是否回到 `plan-change` 更新 plan/tasks。

## 不负责

`implement-change` 不负责：

- 重新规划 roadmap。
- 新增或重写 specs。
- 新增或重写 design。
- 重新拆解 tasks。
- 执行最终 verify。
- 把内容沉淀进长期 docs。
- 归档 version。

如果实现过程中发现 plan/spec/design/tasks 有问题，应暂停并建议回到对应技能修正，而不是在实现阶段偷偷改写上游 artifact。

## 状态检查

确认目标 change 后，先检查当前状态：

1. `.workflow/changes/<change-id>/` 是否存在。
2. `plan.md` 是否存在。
3. `tasks.md` 是否存在。
4. `tasks.md` 是否还有未完成任务。
5. `tasks.md` 是否存在阻塞项。
6. `plan.md` 中列出的必要上下文是否存在。
7. `progress.md` 中当前阶段是否为 `待实现`，或是否仍有未完成 tasks。

根据状态处理：

- 如果缺少 `plan.md` 或 `tasks.md`，停止并提示先执行 `plan-change`。
- 如果所有 tasks 已完成，说明无需实现，建议进入 `verify-change`。
- 如果存在阻塞项，先汇报阻塞并询问是否处理阻塞。
- 如果必要上下文缺失，停止并建议修正 `plan.md` 或补齐对应 artifact。

## 执行规则

1. 确认目标 change。
2. 检查 change 当前状态。
3. 先基于 `plan.md` 还原当前 change 要做什么。
4. 再基于 `tasks.md` 还原当前 change 做到哪里。
5. 如果无法还原内容或进度，暂停并给出补齐建议，不继续实现。
6. 读取默认 change 目录上下文，以及 plan/tasks 中列出的额外上下文。
7. 从 `tasks.md` 中找出第一个可执行的未完成任务。
8. 按任务依赖顺序执行；不得跳过阻塞任务。
9. 对标记为可并行的任务，只有在它们不修改同一文件且依赖已满足时，才可以并行或连续处理。
10. 为本轮要执行的任务创建或更新系统任务追踪条目，并在开始前标记当前任务为进行中。
11. 每次只围绕当前任务做最小必要代码变更。
12. 完成任务后先确认验收标准和局部检查，再立即在 `tasks.md` 中把对应任务从 `- [ ]` 改为 `- [x]`。
13. 同步把对应系统任务标记为完成；如果部分完成或阻塞，保持未完成并记录原因。
14. 如果任务完成需要补充实现说明，只写入任务下方的简短结果，不写长篇复盘。
15. 继续下一个任务，直到所有任务完成、遇到阻塞、用户中断或需要回到上游 artifact。

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
- 测试、构建或关键检查失败且原因不清。
- 需要用户确认产品、架构、数据、安全或兼容性取舍。

暂停时要说明：

- 当前 change。
- 当前任务。
- 已完成哪些工作。
- 阻塞原因。
- 建议回到哪个技能修正：`verify-change`、`specify-change`、`design-change` 或 `plan-change`。

## 任务完成规则

任务只能在满足以下条件时勾选完成：

- 任务要求的代码或文件变更已完成。
- 满足该任务自己的验收标准。
- 不违反 plan/spec/design/docs 中的约束。
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
- 是否遇到阻塞。
- 如果所有 tasks 完成，说明下一步是 `verify-change`。
- 如果暂停，说明建议回到哪个技能或需要用户确认什么。

## 退出条件

`implement-change` 可以结束于两种状态。

### 完成

- 目标 change 已确认。
- `plan.md`、`tasks.md` 和必要上下文已读取。
- 所有 tasks 都已完成并勾选。
- 没有未记录阻塞。
- 下一步可以进入 `verify-change`。

### 暂停

- 已完成的任务已勾选。
- 未完成的任务保持未勾选。
- 阻塞项或回流原因已记录或汇报。
- 用户知道下一步应继续实现，还是回到 `specify-change` / `design-change` / `plan-change`。
