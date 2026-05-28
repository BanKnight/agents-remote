# context

本文件记录单个 change 的看板上下文：它为什么存在、承接了哪些来源、当前已知边界是什么，以及需要如何通过 version shared 与其他 changes 协作。

不要把本文件写成 spec、design、plan 或任务清单；本文件只提供后续阶段开始前必须知道的上下文。

## 来源上下文

### 用户原始意图

<!-- 如果本 change 承接 `.workflow/intents.md` 中的用户意图，在这里保留用户原始表达，不要改写成方案、任务或验收标准。 -->

- 编号：（如适用）
  原始意图：（如适用）

### 主动规划上下文

<!-- 如果本 change 来自技术铺垫、验证、CI/CD、文档治理、迁移准备、工程整理或 big picture 缺口，在这里说明它为什么需要存在。 -->

- 背景：（待补充）
- 需要解决的问题：（待补充）
- 支撑的后续目标：（待补充）

## 当前已知边界

<!-- 只记录 change 进入后续阶段前必须知道的边界，不写成 WHAT 行为契约或 HOW 方案。 -->

- 做：（待补充）
- 不做：（待补充）
- 尚不确定：（待补充）

## 协作与共享上下文

<!--
当本 change 需要和其他 changes 或后续规划共享信息时填写。
共享分三类：
1. 同 version 间共享：写入 / 读取 `.workflow/versions/<version>/shared/`。
2. 跨 version 间共享：优先由前一个 version 验证后通过 distill 沉淀到 `docs/`；如果只是运行态临时材料，可在背景引用中指向已归档 version。
3. 长期沉淀：验证后有长期复用价值的 WHAT/HOW/架构/runbook/project knowledge 不留在 shared，应该由 distill-change 写入 `docs/`。
-->

### 同 version 间共享

<!--
用于同一个 version 内多个 changes 之间的协作。
生产者 change 说明要写入什么 shared；消费者 change 说明要读取什么 shared。

示例：
- 生产者：`research-agent-protocol` 将调研结论写入 `.workflow/versions/v0.4-agent-runtime/shared/agent-protocol-options.md`，供 `design-agent-adapter` 和后续 roadmap 读取。
- 消费者：`design-agent-adapter` 开始前读取 `.workflow/versions/v0.4-agent-runtime/shared/agent-protocol-options.md`，用来选择 adapter 边界。
-->

#### 需要写入 shared

- 路径：（无 / .workflow/versions/<version>/shared/<name>.md）
- 内容：（待补充）
- 供谁使用：（待补充）

#### 需要读取 shared

- 路径：（无 / .workflow/versions/<version>/shared/<name>.md）
- 用途：（待补充）

### 跨 version 间共享

<!--
跨 version 共享不应依赖活跃 version shared 长期存在。
优先读取已沉淀 docs；如果需要追溯某个已归档 version 的运行态材料，在这里列出 archive 引用。

示例：
- 当前 version 需要继承上一轮验证结论：读取 `docs/architecture/session-runtime.md`。
- 当前 version 需要追溯旧 version 的证据：读取 `.workflow/archive/versions/v0.3-session-runtime/changes/verify-session-reconnect/verify.md`。
-->

- 需要继承的 docs：（无 / 路径）
- 需要追溯的 archive：（无 / 路径）
- 用途：（待补充）

### 长期沉淀候选

<!--
如果本 change 产出的结论验证后应长期复用，在这里标记沉淀候选。
实际写入 `docs/` 由 distill-change 在 verify 后完成。

示例：
- 行为契约沉淀到 `docs/specs/<capability>/spec.md`。
- UI/UX 或前端设计沉淀到 `docs/design/<topic>.md`。
- 系统边界或 ADR 沉淀到 `docs/architecture/<topic>.md`。
- 操作流程沉淀到 `docs/runbooks/<topic>.md`。
-->

- 候选 docs 路径：（无 / 路径）
- 预计沉淀内容：（待补充）

## 背景引用

<!-- 只列会影响本 change 理解的引用入口。 -->

- version shared：（无 / 路径）
- docs：（无 / 路径）
- archive：（无 / 路径）
- 外部调研：（无 / 路径或说明）
