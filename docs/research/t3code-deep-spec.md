# T3 Code spec 体系深读：他们怎么定义这个产品（orchestration-v2 九篇 + internals 精选）

> 第五份分册。前四份回答的是「用户感受到什么」（community）／「体验怎么实现」（ui）／「代码怎么跑」（server）／「火力投向哪儿」（evolution）；本篇回答**「T3 Code 团队自己怎么定义这个产品」**——`docs/orchestration-v2/` 九篇设计 spec 的逐篇精读，加 `docs/internals/` 的文档形态观察。
>
> 素材：本地完整 clone `~/repos/t3code`（2026-11-22 HEAD `6972026121`）。九篇 spec 全文逐节精读（core/ids/life 与 mcp/cap/psw/lineage 两路并行，README/testing-strategy 主报告作者亲读），internals 精选七篇全文。纪律：只陈述原文，凡推断标【我方判断】。行号缩写：

| 缩写 | 文件 |
| --- | --- |
| README | `docs/orchestration-v2/README.md` |
| core | `docs/orchestration-v2/core-graph-and-data-model.md` |
| ids | `docs/orchestration-v2/entity-ids-and-correlation.md` |
| life | `docs/orchestration-v2/feature-lifecycles.md` |
| lineage | `docs/orchestration-v2/thread-lineage-and-context-transfer.md` |
| psw | `docs/orchestration-v2/provider-switching-and-context.md` |
| cap | `docs/orchestration-v2/provider-capability-system.md` |
| mcp | `docs/orchestration-v2/orchestrator-mcp-server.md` |
| test | `docs/orchestration-v2/testing-strategy.md` |
| i/ | `docs/internals/`（如 `i/overview:48`） |

---

## §1 体系总览：一份先于实现的目标架构宣言

**这节证明什么**：这九篇不是功能设计稿，而是一份**先于实现收敛**的目标架构宣言——它刻意不写迁移、不写兼容，先把「模型本身自洽」做到位。

### 1.1 开篇三句话定调（README:1-7）

1. "This document set describes the **target architecture** for the next orchestration model. It is **not a patch plan** for the current implementation and it **intentionally ignores migration/backward compatibility**. Those concerns should be handled **after the target model is coherent**."（README:3）——迁移与兼容被显式**推迟**，理由是目标模型得先自洽。
2. "V2 is an orchestrator rewrite, **not a rewrite of the whole app domain platform**."（README:5）——非编排域、持久化/迁移基建、ws/RPC 基建、投影流语义**保留**，除非 V2 暴露具体编排缺口。这是一句「重写的边界声明」。
3. "V2 is designed around the real provider behavior observed in the **Codex app-server probes**, but it is **not Codex-specific**. Codex is treated as the richest protocol we currently have; weaker providers are adapted into the same model with **app-owned ids and explicit capability flags**."（README:7）——设计输入是探针实证，不是想象；Codex 是「最丰富的样本」，不是目标本身。

### 1.2 八条 Primary Goals（README:20-29）

1. 保留 provider 原生生命周期保真度，**同时不让 provider id 泄漏进 app 身份**。
2. 把 root turns、subagents、tools、approvals、plans、checkpoints 建模为**一张**执行图。
3. **只允许 root-run 完成来结束用户可见 turn**。
4. 支持从普通 thread 和**已完成的** subagent/provider thread 分叉。
5. 把「run 之间换 provider」作为**一等 context handoff**。
6. fork、provider handoff、merge-back、subagent 共用**同一套** thread lineage 与 context transfer 原语。
7. 通过**确定性 app-owned id 分配**支持 id 弱或缺失的 provider。
8. 让功能行为**能力驱动，而非 provider 名驱动**。

### 1.3 十条 Key Invariants（README:31-42，原文全列）

1. "App ids are primary. Provider ids are refs."
2. "Provider events are **never rewritten** to look like another provider event."
3. "Child execution completion **never closes** the parent run."
4. "Checkpoints attach to checkpointable execution scopes. Root-run checkpoints advance app run history; child/subagent checkpoints are **nested and do not advance** the parent run count."
5. "Rollback is expressed in **app run count** and reconciled with provider conversation state."
6. "**Every command targets app ids**; adapters translate to provider refs **at the edge**."
7. "Missing provider capability is represented **explicitly** and handled by **policy**."
8. "Provider switches create **explicit context handoff artifacts**; they are **not hidden prompt hacks**."
9. "Forks record app-level lineage first. Provider-native forks and portable context handoffs are **lazy resolution strategies** chosen **when a run starts**."
10. "Tests should prefer **replay-backed integration coverage** over mocked unit tests. The only normal substitute in orchestration tests is the **provider runtime transport**."

这十条是本篇后续所有细节的压缩包——§2-§8 每一节基本都是在展开其中某一条。

### 1.4 七层概念图与最小心智模型（README:44-81）

```text
Native provider protocol
  -> Rotating raw provider diagnostics
  -> Provider adapter / normalizer
  -> V2 orchestration event store using existing persistence patterns
  -> Runtime execution graph
  -> Conversation projection
  -> UI / API views
```

分层职责一句话（README:56）：原始诊断存 **provider 实际收发**（调试/回放素材）；durable app state 是 **normalized** 编排态；runtime graph 存 **provider 行为的含义**；conversation projection 存 **用户看到的东西**。

最小心智模型（README:62-81）：`AppThread → Run → root ExecutionNode →（tool / approval / subagent 子节点）→ ProviderThread → 子 root ExecutionNode`。三条配套语义：
- **换 provider 不建新 app thread**——只创建/激活 provider thread，并把 context handoff 摘要挂到下一个 run（README:79）。
- **fork 建新 app thread，但不在 fork 时强迫选 provider**——只记 lineage + pending source point，首个 run 才解析（README:81）。
- **V2 owns its event schema**：V1 的 command/event union 已删除，V1 数据只作为 legacy importer 的输入存在（README:60）——又一句「不兼容旧世界」的实操声明。

### 1.5 Probe-Derived Requirements：六条被探针逼出来的事实（README:83-94）

这些是设计**输入**，不是设计结果：

1. `thread/status/changed` 可能在完成前后变 idle，但 **`turn/completed` 才是权威的 turn 终态事件**。
2. `turn/interrupt` **先作为请求完成**，被打断的终态稍后经 `turn/completed` 到达。
3. 审批请求是 provider 发起的 JSON-RPC 请求，作用域到 **provider thread × turn × item**。
4. `thread/rollback` 在回滚后返回**权威的 provider thread 快照**。
5. **子 agent 的 `turn/completed` 可能早于父/根 turn 完成。**
6. **子 provider turn 是真实 provider turn，不得重映射到父 turn id 上。**

收束句："These observations are why V2 separates app runs, provider turns, and execution nodes."（README:94）——**图模型的三层分离是探针事实的直接产物，不是美学选择。**

### 1.6 平台边界与已知缺口记档（README:96-166）

**复用清单**（README:98-106）：命令分发保留既有 serialized/idempotent + command receipt 模式；投影流保留 snapshot-plus-cursor 语义；持久化保留 SQLite/migration/repository 基建；raw provider 帧继续作为**有界滚动的诊断日志**；回放测试**只**替换 provider transport/process 边界。禁区：不新增 durable raw-provider-event 数据库、不新增独立通用 event bus，「除非既有基建在文档化的 V2 需求上确实不够」。

**命令回执的 API 级契约**（README:108）："V2 command dispatch returns the last committed stored-event sequence for accepted commands. **Duplicate command ids must return the same receipt-backed result without re-running provider side effects.**"——这就是前端断线重连/恢复游标的边界。

**Tracked Follow-Up: Durable Effect Outbox**（README:110-166）：现行 `command → domain event → projection → reactor → provider side effect` 管线是有效的，但副作用隐式挂在 live 订阅里难追踪。「If V2 needs stronger restart/recovery/debuggability, introduce a durable effect outbox」——给出完整设计（命令事务内同时 append 事件与 effect request；effect worker 认领→调用 provider→回灌结果），并**明确它是基础设施改进、不是第一切片的前提**，但边界要留得足够清楚，「moving to an outbox later does not require redesigning the graph or provider adapters」（README:166）。

**这节的方法论价值**：未做的部分不是假装没有，而是作为 **tracked follow-up** 写进 spec，并写清楚「以后做的时候什么不用改」。

---

## §2 图模型：七类 durable 实体与三对关键分离（core 精读）

**这节证明什么**：整个 V2 的数据模型是**少数 durable 实体 + 严格的三重分离**：身份与证据分离、关系与 payload 分离、规范与投影分离。

### 2.1 实体层级（core:5-25）

```text
Project
  AppThread
    Run
      ExecutionNode tree
    ProviderThread handles
    Context transfers and handoffs
    Checkpoints
```

七个核心概念一句话（core:17-25，原文）：`AppThread` = 用户可见会话；`Run` = **被计数的用户可见 turn**；`ExecutionNode` = run 内一个 provider/runtime 工作单元；`ProviderThread` = provider 原生会话句柄；`ProviderSession` = 活/可恢复的 provider 进程；`ContextTransfer` = provider 中立的**关系/源点记录**（fork/切换/merge-back/subagent 共用）；`ContextHandoff` = 物化的可移植上下文产物。

铁律（core:27-29）："Provider-specific lifecycle is preserved in provider refs and diagnostic raw-provider logs. App behavior is driven by **app-owned ids, V2-native orchestration events, and graph relationships**." / "V2 events are durable because they are the **app state transition log**. Raw provider frames are **not** durable app state."

### 2.2 序列游标：快照 + 单调 sequence（core:31-38）

- 每个提交的 V2 事件带 **store 分配的单调递增 `sequence`**，消费契约固定为 `read snapshot at N → stream events where sequence > N`。
- "The sequence belongs to the **stored event envelope**, not the provider event and not the domain payload."——provider 原生顺序另经 refs 与诊断日志保留。
- 客户端**必须**把快照的 `snapshotSequence` 当权威游标，只应用更大 sequence 的后续事件；**重连允许弃本地状态从新快照重来**（core:610 再次强调）。

### 2.3 Run 与 RunAttempt：应用生命周期边界的答案（core:177-248）

- **Run 取代 provider turn id 作为应用层生命周期边界**（core:179）——"A `Run` is the counted user-visible turn. This replaces using provider turn ids as the app-level lifecycle boundary."
- 每个 Run 记录自己的 `providerThreadId`——"makes mixed-provider app threads explicit: run 1 may be Codex, run 2 may be Claude, and run 3 may return to the original Codex provider thread."（core:215）
- Run 状态机：`queued | starting | running | waiting | completed | interrupted | failed | cancelled | rolled_back`；`ordinal` 是线程内计数，**rollback 以 app run count 表达**（与 Key Invariant 5 对应）。
- **RunAttempt**（core:219-248）：大多数 run 恰有一个 attempt；steering / retry / provider recovery / 切换恢复会产生多个。目的原话："Run attempts let app-level steering work **even for providers that cannot steer an active native turn**."——打断当前 provider turn，**同一 RunId 下**建替代 attempt。只有**最终选中**的 attempt 决定 run 完成与 checkpoint；被取代/被打断的 attempt 留在执行图里供审计。
- attempt 的 `reason`: `initial | steering_restart | retry | provider_recovery`。

### 2.4 ExecutionNode：完成权的唯一入口（core:250-293）

- kind 全集：`root_turn | assistant_message | reasoning | plan | todo_list | tool_call | approval_request | user_input_request | subagent | hook | system`。
- **完成权不变量**（core:293）："The **root node** of a run is the **only** node allowed to complete the run. Subagent nodes, tool nodes, approval nodes, and plan nodes may complete independently."
- 字段设计要点：`runId` 可 null（存在 run 外节点）；`parentNodeId` 可 null（根）；`rootNodeId` 必有（扁平回指）；`countsForRun` boolean；`nativeItemRef` 可 null。

### 2.5 CheckpointScope：嵌套但不推进计数（core:295-315）

- root scope 带 `advancesAppRunCount = true`；子 scope（subagent 等）为 false、嵌套在父 run scope 下（core:315）。
- kind：`root_run | subagent | tool | provider_thread | manual`。
- Checkpoint 自身 status 含 **`missing | stale`** 一等状态（core:559）——「没捕获到」「已过期」是数据，不是异常。

### 2.6 ProviderSession ≠ 运行时句柄（core:317-339）

- "The session entity is **durable metadata** for a live-or-recoverable runtime, **not the runtime handle itself**."——句柄会因 server 重启、idle reaper 释放、provider 崩溃消失；但 durable 侧（session + provider thread + native resume refs）始终保留，活运行时经**同一条** session manager 路径重建（core:337）。
- id 分配禁令（core:339）："Provider runtime ids and ordinals **must not depend on adapter process memory**."——凡需持久化/恢复后存活的值，由 orchestrator/correlation/id services 分配。

### 2.7 ProviderThread：覆盖可以有缺口（core:341-366）

- `appThreadId`（支撑一线 thread）与 `ownerNodeId`（嵌在节点下，如 subagent）二选一；provider thread 后续可 fork/晋升为一线 thread。
- **覆盖缺口示例**（core:366）：runs 1-5 用 Codex thread A，6-8 用 Claude thread B，9 回到 A 并带手写的 handoff 摘要——A **仍是同一个 provider thread**，但它有一个显式的 `ContextHandoff`。

### 2.8 ContextTransfer vs ContextHandoff：关系与 payload 分离（core:368-449）

- ContextTransfer = 源/目标关系 + 生命周期，是 fork / provider_handoff / merge_back / subagent_spawn / subagent_result 五型的**共用原语**（core:370-375）。"**Creating a transfer should be cheap.** Expensive context handoffs are materialized **lazily** when the target run starts and the selected provider is known."（core:413）
- status：`pending → resolved_native | resolved_portable | failed | consumed | superseded`；resolution 四策略：`native_fork / portable_context / delta_context / checkpoint_context`。
- ContextHandoff："**not just prompt text. It is part of the graph and can be inspected, regenerated, superseded, or audited.**"（core:447）——重生成 = 新建一条 + 旧的标 superseded，不可静默改写。
- 返回策略偏好（core:449）：首选 `delta_since_target_last_seen`（resume 旧 provider thread + 只补 inactive 期间的 runs）；`full_thread_summary` 用于 resume 失败 / 设置不兼容 / 累积 handoff 拖累上下文质量。

### 2.9 RuntimeRequest：重启后「可见 ≠ 可应答」（core:471-501）

- kind 是 canonical 域值（`command | file-read | file-change | dynamic_tool_call | user_input | auth_refresh`），adapter 把 provider 原生回调名映射进来。
- "Requests may remain **visible** after restart, but they are only **respondable** if their `responseCapability` is live."——`{type:"live", providerSessionId}` 或 `{type:"not_resumable", reason}`（core:489-501）。这是「重启后的审批按钮不能是死按钮」的协议级答案。

### 2.10 投影层：turnItems 与 visibleTurnItems（core:598-679）

- 五种投影分离：Thread shell（侧栏）/ Thread detail / Execution graph（调试）/ Provider sessions / Pending requests（core:600-606）。"The UI can remain simple while the graph remains precise."（core:608）
- **前端不许自己拼显示序**（core:614）："The frontend should **not** reconstruct display order by merging `messages`, `plans`, checkpoints, approvals, and activities itself. V2 exposes an **ordered `turnItems` projection**."
- fork thread 的双投影（core:618-622）：`turnItems` 是本 thread 规范发出项；`visibleTurnItems` 是用户可见读模型（经 fork 源点引用继承项 + 合成生命周期标记如 "forked from conversation" + 本地项）。目的："keeps storage normalized while giving thread detail views and **tests one backend-owned surface to assert**."
- TurnItem 14 变体：`UserMessage | AssistantMessage | Reasoning | Plan | FileChange | CommandExecution | FileSearch | WebSearch | ApprovalRequest | Checkpoint | Compaction | Handoff | Fork | DynamicTool`。
- 两个细节：结构化 item 变体让前端渲染稳定组件而**不解析 provider 文本**（core:624）；compaction/handoff/fork 是**编排生命周期项**，不是 dynamic tool（core:673）——例如 compaction 从 running（"Compacting context..."）迁到 completed（"Compacted context"）。
- 回链不变量（core:679）：每个 turn item 保留 `runId/nodeId/providerTurnId/nativeItemRef` 引用，"so debug views can jump from the display stream back into the graph and provider logs"。

### 2.11 原始诊断层（core:567-596）

- append-only 证据，写入**有界滚动日志**，"not treated as canonical durable SQLite state"。
- 域行为禁令（core:586）："No domain behavior should depend on parsing historic UI events if raw provider diagnostics are available. Production behavior should depend on **normalized** orchestration events/entities and provider refs."
- 回放框架可吃原始 transcript，但**生产库不必存每帧**（core:596）。

### 2.12 诚实观察：spec 内部的两处不一致（仅记录文本事实）

- `ProviderThread` 的摘要字段（`coveredRunRange? / contextHandoffIds[] / forkSource?`，core:95-102）与后文完整类型（`firstRunOrdinal / lastRunOrdinal / handoffIds / forkedFrom`，core:346-361）字段名不一致。
- `Run` 的 `countsForConversation` 被正文引用（core:213），但完整类型里没有该字段（完整类型用 `countsForRun` 的是 ExecutionNode）。

【我方判断】这两处说明 spec 也会随写作演进产生漂移——**但它们是字段名级别，不是模型级**；而且这是「先写 spec 后写代码」必然要付的维护成本，代码层以 types 为准即可。这一点反而印证了 internals 的准入逻辑：spec 写的是「为什么这样建模」，精确类型契约交给 shared contracts 包。

---

## §3 实体 ID 与关联：Provider ids are evidence. App ids are identity.（ids 精读）

**这节证明什么**：V2 用一句话把所有 provider 差异压进了 refs 层——"Provider ids are **evidence**. App ids are **identity**."（ids:5）

### 3.1 十个 id 家族（ids:9-24）

`ThreadId`（app 会话）/ `RunId`（被计数 turn）/ `NodeId`（执行图节点）/ `ProviderSessionId` / `ProviderThreadId`（**app handle**）/ `ProviderTurnId`（**app handle**）/ `RuntimeRequestId`（**app handle**）/ `RawEventId`（可选诊断帧 id）/ `CheckpointId` / `PlanId`。

注意关键措辞：ProviderThread/Turn/Request 的 id **本身也是 app 侧 handle**，native ref 才是 provider 侧的东西。"**Provider ids never replace these ids.**"（ids:24）

### 3.2 Provider Refs 的四项用途（ids:7, 26-43）

refs（`provider / nativeSessionRef? / nativeThreadRef? / nativeTurnRef? / nativeItemRef? / nativeRequestRef? / rawEventId? / method?`）只用于：**correlation、debugging、replay、command routing**。"Codex can populate most of these fields. Other providers may populate only a subset."（ids:43）

### 3.3 关联必须带 scope（ids:45-68）

- "**Correlation is always scoped.** Never match a native id globally without a provider/session/thread scope."（ids:47）
- 首选匹配键：ProviderThread = `provider + providerSessionId + nativeThreadRef`；ProviderTurn = `providerThreadId + nativeTurnRef` 或 `+ turnOrdinal`；Node/TurnItem = `providerTurnId + nativeItemRef` 或 `+ itemOrdinal`；RuntimeRequest = `providerSessionId + nativeRequestRef` 或 `providerTurnId + requestOrdinal`。
- "If a provider **recycles ids**, the provider adapter must **widen the scope** until the mapping is unambiguous."（ids:68）

### 3.4 IdentityBinding：刻意最小的关联表（ids:70-98）

一条 binding 说清「this native thing corresponds to this app thing」：`appEntityKind / appEntityId / provider / providerSessionId / nativeKind? / nativeRef? / scope{...} / correlation{ native_exact | native_scoped | ordinal | fingerprint | synthetic } / firstRawEventId? / lastRawEventId?`。"This is **not** meant to be a large identity subsystem."（ids:98）且 binding 本身**不得**要求生产库永久保留原始帧。

### 3.5 五条分配规则（ids:100-106）

1. 有稳定 native id → 复用既有 binding 或分配新 app id 并绑定。
2. 没有 → 按 scoped ordinal 分配。
3. ordinal 不够 → scope 内加 fingerprint。
4. "**Once allocated, never change the app id for that entity.**"
5. "**Never infer parent/root completion by string matching ids.**"

### 3.6 六个 ordinal 轴与 fingerprint 纪律（ids:108-140）

ordinal 轴：`runOrdinalWithinThread / providerTurnOrdinalWithinProviderThread / nodeOrdinalWithinParent / itemOrdinalWithinProviderTurn / requestOrdinalWithinProviderTurn / messageOrdinalWithinNode`。"They must be **replay-deterministic** for a given provider transcript."（ids:121）

fingerprint 是**兜底**工具：包含 scope 与稳定结构，禁止大段可变文本——"Do not use complete assistant text as a primary fingerprint. Text is mutable, can stream in chunks, and can be duplicated."（ids:140）

### 3.7 命令路由：app id 进，ref 在边缘解析（ids:167-187）

命令形态示例：`approval.respond(RuntimeRequestId)` / `interrupt.run(RunId)` / `fork.fromNode(NodeId)` / `rollback.toRun(ThreadId, runOrdinal)`。

解析链：`RuntimeRequestId → nativeRequestRef + providerSessionId`；`RunId → root NodeId → ProviderTurnId → nativeTurnRef`；`NodeId → ProviderThreadId → nativeThreadRef`。

"**The provider command layer resolves app ids to provider refs at the edge. If the provider ref is missing or no longer live, the command fails with a typed capability/state error.**"（ids:179）

### 3.8 重启后的 pending：ResponseCapability（ids:189-201）

"Pending request records may survive restart, but provider callback state usually does not."——必须区分「历史 pending 样」与「可应答」，UI 可以显示请求已过期、用户需重启或重跑该 turn（ids:201）。

### 3.9 subagent 关联：挂接不替换（ids:203-220）

- Codex 映射示例：`collabAgentToolCall item → ExecutionNode(kind="subagent"|"tool_call")`；`receiverThreadIds[] → ProviderThread records`；child `turn/started|completed → child ProviderTurn + child ExecutionNode`。
- "**The child provider turn keeps its own provider refs. It is linked to the parent through `parentNodeId`, not by replacing its turn id with the parent turn id.**"（ids:218）

### 3.10 重放确定性（ids:222-231）

"Given the same provider transcript and same initial app state, **normalization must produce the same ids**."——id 可以随机，**只要 binding 先于下游投影持久化**；"**Reprocessing the same provider frame should find the existing binding, not allocate another entity.**"（ids:231）

---

## §4 生命周期：目标行为的完整规格（life 精读）

**这节证明什么**：九篇里最「厚」的一篇（543 行）——它把每个用户可见功能的**目标行为**写成可执行流程，且每条流程都带决策理由。开篇声明："These flows describe **target behavior, not current implementation constraints**."（life:3）

### 4.1 建 thread ≠ 启动 provider 工作（life:5-25）

`thread.create → AppThread`，此时**不需要** provider session、通常也**不需要** provider thread（除非开了 eager creation）。provider thread 懒建：首 run 时 `ensure ProviderSession → ensure ProviderThread → send provider turn`。

### 4.2 起 run：root node 独占完成权（life:27-59）

```text
thread.message.send
  -> ConversationMessage(role=user)
  -> Run(status=queued, ordinal=N)
  -> root ExecutionNode(kind=root_turn, countsForRun=true)
  -> enqueue provider command
provider turn accepted/started -> ProviderTurn allocated/correlated -> root node running -> run running
root provider turn/completed -> finalize assistant streams -> finalize plans/todos/questions
  -> root node terminal -> capture checkpoint -> run terminal
```

"**Only the root node can complete the run.**"（life:59）

### 4.3 steering / queue：四模式决策表（life:61-116）⭐

三类后续输入：steer in place / steer by restart / queue next run。核心定义（life:71）："**Steering is an app-level intent** to change the active run's instructions. **Provider-native steering is only one implementation strategy.**"

- provider 支持原生 steering → 发 steer 命令，同 run 保持 active。
- 不支持 → 打断当前 provider turn、finalize 被打断 attempt、为同一 steering 意图开替代 turn。两种表示：**同 `RunId` + 新 root attempt**（UI 把 steering 当作修订进行中的 run）或新 `RunId` + `supersedesRunId`。
- **默认**（life:80）："The preferred default is the **same `RunId` with a new root attempt node** until the first attempt has produced a **user-meaningful terminal assistant response or checkpoint**."
- 命令形状（life:86-92）：`MessageDispatchMode = steer_active(targetRunId) | restart_active(targetRunId) | queue_after_active | start_immediately`。
- Policy 四条（life:94-99）：可 steer → steer 挂 active run；不可 → 打断 + 带 steering 消息重启 active run；**用户显式要求新 turn → 即使可 steer 也排队**；无 active run → 立即开始。
- 收口（life:101, 116）："A single app run may have multiple provider-turn attempts when the first attempt was interrupted for steering." / "**Only the selected/final attempt completes the run and creates the run checkpoint.** Earlier interrupted steering attempts remain in the execution graph for audit/debugging."

### 4.4 follow-up：替换 provider thread 是错误恢复流（life:118-133）

正常后续：新 Run（ordinal+1）、同 AppThread、**同 ProviderThread（若可 resume）**。resume 失败（runtime error / native state 缺失 / 设置不兼容）→ provider thread 标 unavailable，从重建上下文创建替代 thread。"**The replacement path is an error recovery flow, not a provider capability branch.**"（life:133）

### 4.5 换 provider：delta 默认，禁止隐藏拼接（life:135-179）

- "Changing providers is a **first-class context handoff**. It does **not fork** the app thread and it does **not rewrite** prior provider history."（life:137）
- 默认策略（life:162）：回到旧 provider 时 **resume 旧 thread + 只桥接 off-provider delta**——"preserves native continuity for that provider's own earlier work while informing it about what happened elsewhere."
- fallback 四条件（life:164-169）：旧 thread 不能 resume / 上下文可能太 stale 或被反复 handoff 污染 / 模型或 runtime 设置不兼容 / 用户显式要求干净上下文。
- 红线（life:179）："**Provider switching should never concatenate hidden summaries into arbitrary prompts without recording the handoff. The handoff text is part of the run input contract and must be auditable.**"

### 4.6 fork：只从稳定源点（life:181-207, 316-359）

- fork 动作零 provider 状态：`create target AppThread → record lineage → ContextTransfer(type=fork, status=pending)`，不建 session/thread/portable context。首 run 才按所选 provider 解析（native fork 可用则 native，否则 portable）。
- **稳定 fork 边界五种**（life:333-339）：completed run / interrupted|failed run 且有 provider 快照或 checkpoint / completed subagent node 且有 provider thread / provider 返回的 thread snapshot / checkpoint 边界。
- **不稳定边界四种**（life:341-346）：streaming message delta / active tool call / pending approval / active subagent turn（除非显式实现 live fork）。
- 首实现纪律（life:207）："Forking from an **active run** should use the **latest completed checkpoint** or be **rejected** until active-run semantics are deliberately designed."
- 合成 fork（不支持 native fork 的 provider）：允许，但"should be marked as **lower fidelity** by capability"（life:359）。

### 4.7 merge-back：delta 的内容清单（life:209-222）

`ContextTransfer(type=merge_back, basePoint=S, sourcePoint=F)` → 惰性建 delta → 随下一条主线程用户消息注入。"The delta should describe **what changed since the fork point: decisions, files changed, commands/tests run, conclusions, and unresolved issues**. It should **not** include provider protocol noise or full transcript content unless needed."（life:222）

### 4.8 interrupt：ack ≠ 终态（life:224-247）

- `interrupt.run(RunId) → resolve root node → resolve provider refs → provider interrupt（若支持）→ mark interrupt requested`。
- "**The app should not mark the run terminal solely because the interrupt request returned.**"——终态必须等 provider 的 `turn/completed(status=interrupted)`。
- provider 不支持打断：最好情况停 session 并按 policy 标 interrupted/cancelled；最坏情况标 interrupt unsupported、run 保持 active 直到 provider 自己退出。

### 4.9 Stop 的连带语义（life:254-260）⭐

Stop 发 `run.interrupt` 带 `holdQueue`：**扣住队列、结束该 thread 的 PR watches、丢弃 delegated tasks 欠的 wake** ——"so **nothing automatic restarts the thread**"。然后**深度优先**向每个子 thread 发 `thread.stop`；该级联在 **commit 之后**执行，因为"**a command holds only its own thread's lock**"。

### 4.10 恢复三义都是 core primitive（life:262-314）⭐

1. UI 从持久投影恢复 app thread —— **永远支持**。
2. provider-thread resume —— **必备 adapter primitive**："Every provider harness must expose a cursor/session/thread handle that can be used to resume prior provider state."（life:270）
3. provider runtime 进程恢复 —— core primitive，三种触发（server 重启 / idle reaper 释放 / 崩溃断网）**共用同一条路径**。流程：`mark session stopped/error(reason) → remove live handle → keep thread+refs durable → 下次工作开新 runtime → 先 resume 再 start/retry`。

resume 失败处置四条（life:308-312）：保留历史图 / thread 标 not loaded 或 error / 用户继续时从重建的 app 上下文建替代 thread / pending live requests 标 not_resumable。
归类纪律（life:314）："**Provider resume failure is a runtime/recovery condition. It should not be modeled as 'provider does not support resume.'**"

测试纪律（life:305）："Idle cleanup and crash recovery must use **production lifecycle APIs**... they must **not** use test-only session restart methods."

### 4.11 checkpoint 时机链与 rollback 级联（life:361-425）

```text
run 前基线: ensure root checkpoint(ordinal-1)
run 终态:   root node terminal → drain/finalize streams → capture(ordinal) → diff vs prior → run terminal with checkpoint
child:      节点 start 建 child scope → 节点 terminal capture + diff vs parent/prev child
interrupted/failed: 文件态有意义且安全则 capture（status 反映终态）；否则 missing/error summary
rollback.toRun: restore fs → provider rollback(若支持) → reconcile provider 快照
                → 后续 runs 标 rolled_back → 后续 checkpoint 删或标 stale
rollback.node:  restore child → 子 provider rollback(若支持) → 后代 checkpoint 标 stale → 保留父历史
共享工作区警告: child restore 可能弄脏父 run 工作区 → UI/API 必须显式提示（life:425）
```

Codex 特例（life:413）：`thread/revert` 返回空 `turns` 数组的元数据，保留历史须经 `thread/turns/list` 重新水化。

### 4.12 approvals / questions / plans / activities（life:427-527）

- 审批 = 挂执行节点的 RuntimeRequest；规则四条（life:450-454）：id app-owned、provider request id 是 refs、**subagent 的 pending 审批若 provider 有 live 能力仍可操作**、回调态没了则应答失败为 `not_resumable`。
- Ask questions ≠ plan："Ask-questions is a user-input request, not a plan by itself."（life:458）run 进入 `waiting`。
- 三概念分离（life:484-486）：Proposed plan（可 accept/implement 的 durable artifact）/ Todo list（当前 run 的活进度）/ Ask questions（结构化用户输入请求）。"If a provider only emits plain assistant text, the app should **not pretend** it has structured plans."（life:542 附近，同 cap:142）
- Activities 是执行图事件的投影，必须带 `nodeId/runId` 以便 UI 正确分组（life:527）。

### 4.13 Completion Barrier（life:529-543）⭐

run 标终态前必须过闸：`root provider turn terminal → flush assistant text buffers → close active assistant messages → finalize plan/todo artifacts → close open non-live child nodes → capture checkpoint → publish run terminal`。"This prevents **early checkpoint capture and incomplete plan state**."（life:543）

---

## §5 Provider 能力系统：消灭 provider 名条件分支（cap 精读）

**这节证明什么**：8 条 Primary Goals 里「capability-driven, not provider-name-driven」的落实方案——11 组能力字段 + 八条降级映射 + adapter 契约 + UI 收 typed 结果，一处 provider 名 if 都不留。

### 5.1 铁律与形状（cap:1-23）

- "V2 must **not assume** every provider can do what Codex can do."（cap:3）
- "Provider behavior should be expressed through **capabilities and policies**, not provider-name conditionals spread across orchestration."（cap:3）
- `ProviderCapabilities` 11 组：`sessions / threads / turns / streaming / tools / approvals / planning / subagents / context / checkpointing / identity`；每 adapter 在 session 启动时**版本化发出**。

### 5.2 各组要点（cap:25-214）

- **sessions**（5 boolean）：多 thread/session、session 内换模型、经 handoff 换 provider、session 内换 runtime mode、pending requests 是否过重启。**唯一例外**（cap:42）："**Provider-thread resumption is not a capability. It is a required adapter primitive.**"——恢复是准入门槛，缺了构建不出 adapter，因此不参与降级，只能「从存储句柄恢复或显式返回 resume failure」。
- **threads**（7 boolean）：空 thread 创建、读快照、回滚、fork、从 turn fork、从 subagent thread fork、暴露 native thread id。
- **turns**：`terminalStatusQuality: "strong" | "weak" | "none"` ——弱终态时 adapter policy 推断终态但**仍要标关联强度**（cap:75）。
- **两种 steering 分立**（cap:77）："`supportsActiveSteering` means the provider can modify an in-flight turn directly. `supportsSteeringByInterruptRestart` means V2 can implement **app-level** steering by interrupting the active turn and starting a replacement attempt. **Most providers should support the latter** if they support interruption and normal follow-up turns."——这让「打断重写」成为几乎全 provider 通用能力。
- **streaming**（5 boolean）：缺完成信号时 normalizer 在 root run 终态闭合消息（cap:91）。
- **tools**（6 boolean）：弱 provider 只产文本摘要，adapter 仍可按 scoped ordinal 建有序 turnItems 与执行节点（cap:106）。
- **approvals**（7 boolean）：按操作类型细分 + `approvalCallbacksAreLiveOnly` + `approvalsCanOriginateFromSubagents`；UI 规则：任何执行节点（含 subagent）的**可应答**审批都应展示（cap:122）。
- **planning**（5 boolean）：三种信号映射三种 artifact（todo live 进度 / proposed plan / structured questions）。
- **subagents**（6 boolean）：`exposesSubagentThreadIds` 为 true 时子 provider thread 成为可寻址实体；false 时仍可作嵌套执行节点展示（cap:157）。
- **context**（8 字段 + `maxRecommendedHandoffChars`）：控制 handoff 策略选择（acceptsSystemContext / supportsDeltaHandoff / supportsFullThreadHandoff / ...）。
- **checkpointing**（5 字段）："Checkpointing is primarily **app-owned**, but provider conversation rollback is **provider-dependent**."（cap:185）——文件回滚永远可做；对话回滚不支持时，"provider conversation state must be **restarted or marked divergent**"（cap:197），**不许假装对话已回滚**。
- **identity**（4×三档 strong/weak/none）→ normalizer 关联策略单源（cap:210-214）：strong 用 native id 作 scoped ref；weak 用 native id + ordinal/fingerprint；none 按 scoped ordinal 分配。

### 5.3 八条降级映射（cap:216-248，原文照录要点）

```text
interrupt unsupported            -> stop session if allowed, otherwise mark unsupported
active steering unsupported      -> interrupt active turn and restart as steering replacement attempt
fork unsupported                 -> synthetic fork from app projection if policy allows
rollback unsupported             -> restore filesystem checkpoint, restart provider context, mark divergent
nested checkpoint unsupported    -> capture only root-run checkpoint, record child activity as uncheckpointed
provider switch return unsupported -> fresh provider thread with full app-thread summary
structured approvals unsupported -> provider runs under configured sandbox policy; no approval UI
plan_updated unsupported         -> no live todo UI; rely on assistant messages
```

总则（cap:218）："**Every feature should declare what happens when capability is missing.**"
UI 契约（cap:248）："The UI should **not hide unsupported behavior behind provider-specific errors**. It should receive **typed capability results**."

### 5.4 Adapter Contract（cap:250-272）

必备：`getCapabilities / startSession / ensureProviderThread / sendRun / interrupt / respondToRequest / streamEvents`；可选：`steerRun? / readThreadSnapshot? / rollbackThread? / forkThread?`。"Optional methods are **guarded by capabilities**. The orchestration layer should not call optional methods without checking capability **or going through a policy wrapper**."（cap:270）

### 5.5 Capability-Driven UI（cap:274-284）

fork 按来源显隐；interrupt 三态（可用 / 破坏性兜底 / 不可用）；approvals 按 respondable/expired；plan/todo 仅在有结构化 artifact 时展示；rollback 仅在有 app checkpoint 时展示并标注 provider 支持。"This keeps the product **predictable** across Codex, Claude, Cursor, OpenCode, and future providers."（cap:284）

---

## §6 上下文迁移三件套：四个产品特性共用一套原语（lineage + psw 精读）

**这节证明什么**：fork / 换 provider / merge-back / subagent 四个看似不同的功能，被压成**同一套三件套**：关系 + 源点 + （可选的）惰性物化产物。

### 6.1 中心论点（lineage:1-11）

"Forking, provider handoff, merge-back, and subagents are **separate product features**, but they should **share one orchestration model**."（lineage:3）共同 primitive：

```text
thread relationship + source point + optional context transfer resolution
```

成本原则（lineage:11）："preserve lineage **cheaply** and resolve expensive provider/context work **lazily** when a run actually needs it."

### 6.2 四类用例（lineage:13-72）

- **Fork to explore**：新 AppThread → 不选 provider → 首消息选 provider/model。
- **Continue same thread with a different agent**（换 provider）："This is **not** a new app thread, but it is still a context transfer."（lineage:31）"The app thread remains the **canonical** conversation. Provider-native threads are **backing handles with explicit coverage**."（lineage:40）
- **Merge a fork back**：不是全量换 provider，是**定向** delta 转移（lineage:54）。
- **Subagents 两类**：native subagent（provider 自己 spawn，app 观察 native refs，建模为子执行节点、必要时关联 app 子线程）；cross-provider T3 subagent（父 agent 调 app-owned 工具，app 建 child app thread/run，结果作为 subagent_result transfer 回流）。收束（lineage:72）："user forks and agent-created subthreads feel like **the same graph shape with different `createdBy` and lifecycle policy**."

### 6.3 三件套的数据结构（lineage:74-178）

- `ThreadRelationshipKind`：`fork | provider_handoff | merge_back | subagent_spawn | subagent_result`。"Relationships are **product-level and provider-neutral**. A fork is **not** the same thing as a provider-native fork. A provider-native fork is **one possible resolution strategy** for a fork relationship."（lineage:89）
- `ContextSourcePoint`：`threadId + runId? / checkpointId? / turnItemId? + providerThreadRef? / providerTurnRef?`。"Stable source points should **prefer completed runs/checkpoints**."（lineage:106）
- `ContextTransfer`：durable 操作记录，**cheap to create**，可保持 unresolved 直到首次使用。status 六态：`pending | resolved_native | resolved_portable | failed | consumed | superseded`。`basePoint` 语义（lineage:136）：merge-back 时 `basePoint` = 原 fork 源点、`sourcePoint` = fork 最新稳定点。
- `ContextHandoff`：贵的物化产物，**只在 native transfer 不可用或不充分时**惰性创建；kind 三型 `portable_context | delta_context | checkpoint_context`。"Context handoffs should be **auditable app artifacts, not hidden prompt concatenation**."（lineage:152）
- 四策略：`native_fork`（带 providerThreadRef）/ `portable_context` / `delta_context` / `checkpoint_context`（后三者带 contextHandoffId）。"Same-provider forks should prefer `native_fork` when the source native refs are strong."

### 6.4 惰性解析：两阶段（lineage:180-232）

fork 创建最小集（lineage:184-191）：建 target AppThread + 记录关系/pending transfer，**不建 provider session/thread、不建 portable context**。收益（lineage:206）："avoids forcing users to choose an agent **at fork time** and avoids generating summaries that **may never be used**."

首次 dispatch 统一入口（lineage:210-226）：`resolveStartContext({threadId, provider, message})`，五级策略：无转移需要 → native transfer → portable → delta → unsupported（**在 provider 工作开始前显式失败**）。

所有权分工（lineage:228）："Provider adapters own native details. The orchestrator owns the relationship, source point, durable transfer record, and command receipts."

### 6.5 换 provider 的策略细节（psw 精读）

- **为什么默认 resume 而不是新 thread**（psw:38-47）：新建会丢掉四样——只存在于 provider thread 里的 prior hidden reasoning/context、provider 侧 thread metadata、native tool state（可用时）、provider 特有行为的连续性。"Full summaries are useful **fallback** artifacts, but they should **not be the default** when a previous provider thread can be safely resumed."
- **为什么 resume 必须带 delta summary**（psw:49-53）：app thread 在 provider 不活跃期间前进了，"That creates **wrong answers, stale plans, and unsafe file assumptions**."——"Returning to a provider requires a handoff summary **unless no runs happened** since that provider last participated."
- **覆盖记账** `ProviderThreadCoverage`（psw:55-77）：每个 provider thread 记 `nativeRunOrdinals: number[]` + `handoffIds: ContextHandoffId[]`——C1 记 native 1-5,9 + H2 覆盖 6-8。"The **app thread remains the source of truth** for full history."（psw:77）
- **五级策略阶梯**（psw:124-130）：① 无 handoff（目标已有当前覆盖）→ ② delta 进既有 thread → ③ full 进既有 thread → ④ full 进新 thread（resume 失败/设置不兼容/上下文 stale）→ ⑤ unsupported（无法接收 handoff 且无安全重建路径）。
- **staleness 七信号**（psw:136-144）：off-provider runs 太多 / 链式 handoff 太多 / 目标模型或 runtime mode 不兼容地变了 / resume 失败 / 旧 thread 被冲突方式回滚或 fork 过 / **用户选了「干净上下文」** / handoff 摘要会超出 provider 上下文策略。
- **摘要生成者四选**（psw:150-157）：离开的 provider / 进入的 provider / 配置的 summarization provider / 本地确定性 summarizer；`createdByProvider` 记录来源以便事后审查。
- **摘要内容规范**（psw:159-180）⭐：
  - **Include 九项**：用户目标与约束 / 已做决策 / 改动的文件 / 跑过的命令与测试 / plans 与 todo 状态 / 未解决的审批与问题 / 当前 checkpoint 与 diff 摘要 / 已知失败 / 相关 subagent 结果。
  - **Do not 四项**：无关的 provider 协议噪音 / 隐藏 chain-of-thought / 被后续 run 取代的过期工具输出 / 文件摘要够用的大 diff。
  - 总原则："app-thread canonical, **not provider transcript-only**."
- **rollback 级联失效**（psw:195-206）：回滚到 run 5 → runs 6+ 标 rolled_back → 覆盖 6+ 的 handoffs 标 superseded → 覆盖 6+ 的 provider threads 按能力标 divergent 或已回滚。
- **数据模型结论**（psw:233）："The app does **not** need separate conversation threads for provider switches. It needs **multiple provider threads attached to the same app thread**."

---

## §7 编排 MCP server：agent 反向调用控制平面（mcp 精读）

**这节证明什么**：T3 不只是「人指挥 agent」的控制面，它把编排操作本身做成 MCP 工具交给 agent 调——多 agent 编排的正确抽象层是 **orchestration operations**，不是 provider 子代理 API 的透传。

### 7.1 定位（mcp:3-28）

- "T3 exposes V2 orchestration through its **app-owned MCP endpoint**."（mcp:5）provider agent 是 MCP **client**。
- 能力面（mcp:6-16）：在任意支持的 provider instance 上建 sub-agent / 等或轮询 durable result / cancel / 建普通 thread / 列 thread 并增量读 / rename·regen title·link PR / send 或 steer / wait 或 interrupt / 调度周期性工作。
- "These are **T3 orchestration operations**, not provider-native sub-agent APIs."（mcp:18）
- **child 上下文契约**（mcp:19-21）："Delegated tasks **always** create a T3 child thread and run. The child receives **only** the supplied task prompt, plus an optional role instruction supplied in the same tool call. **Parent conversation history is not copied into the child.**"
- 分层（mcp:23-28）：`ThreadManagementService` 是 V2 WS 命令与 MCP 的**共享应用边界**（thread lookup/listing/send-mode selection/durable send postconditions/wait polling/interrupt selection）；`OrchestratorV2` 是更底层的 command/event processor；**传输适配层只做三件事：认证、解析传输输入、整形响应**。

### 7.2 传输与凭据（mcp:30-56）

- 端点 `http://127.0.0.1:<port>/mcp`，server key 对 provider 可见为 `t3-code`；同一 endpoint 双 toolkit（preview + orchestration）。
- **凭据 scope 四元组**：T3 environment × parent thread × provider instance × provider session；授予 `preview` + `orchestration` 两个 capability。
- **三条死亡路径**：最大寿命到期、空闲到期、provider session 释放时吊销；"**The raw token is not persisted in orchestration state.**"（mcp:51-52）
- **双重门**：HTTP server 解析 bearer → `McpInvocationScope` → orchestration handler 读写状态前**再检查** `orchestration` capability（mcp:54-56）。

### 7.3 各 provider 注入（mcp:58-201）——差异全收敛为策略

- **Codex**：`t3-code` 双注册另一个 `t3-code-direct`，只含 `t3_thread_wait` 与 `delegate_task`，且 `omit_tools_from = ["code_mode", "deferred"]`。原因（mcp:70-72）：Code Mode 约 30 秒才产出脚本，blocking wait 会被模型以轮询方式调用且每次重发上下文——direct 版让这两个工具绕过 code_mode。呈现层必须解析两个 server 名（`<server>.<tool>` 格式）。
- **Claude Agent SDK**：query options 的 `mcpServers`（http），`allowedTools` 追加 `mcp__t3-code__*`；"The adapter logs **only whether MCP configuration exists**; it does **not log the server headers or token**."（mcp:99-100）
- **Cursor**：SDK `mcpServers` 作用于 create/resume/每次 send；1.0.39+ 的 send 级 server 只替换 inline set，ambient server 保持；诊断只投影**脱敏** metadata。
- **Grok ACP**：`session/new|load|fork` 的 `mcpServers`；ACP **无原生 subagent 与 active steering** → 用 orchestrator-owned child threads + cancel-and-restart 实现 steering；缺 `session/fork` → portable context。定性（mcp:119-122）："These are **orchestrator policies**, not provider-specific MCP tools."
- **ACP Registry**：generic flavor；server-scoped catalog service 统一搜索/准备/状态/启动的校验；"**Catalog inspection never starts an ACP process, probes models, or performs authentication.**"（mcp:140-141）认证就绪判定 = 一次性 `session/new` 成功；能力声明制：session loading/forking/models/modes/MCP transport 仅当所选 agent 声明时启用；缺能力三降级（steering→interrupt-restart / fork→portable / subagents→orchestrator-owned child threads）。
- **Pi**：即便 Pi 支持原生 MCP，仍走 HTTP bridge —— 原因（mcp:155-158）：`mcp.json` 条目会覆盖原生注册，且原生 MCP 默认 60 秒请求超时会打断长跑的 T3 工具。别名 `mcp__t3_code__` 是 model-only 且隐藏声明，跟随公开工具生命周期。T3 **不接管** Pi 的 `subagent` 工具与 package/trust loader。
- **准入判据**（mcp:194-201）：provider instance 能跑 child task ⟺ 其 live `ProviderInstance` 暴露 V2 `orchestrationAdapter`。**可见性与可用性分离**：无 adapter 的 provider 仍可被模型看见，但标 unavailable——"keeps provider selection model-visible **without allowing a request that cannot run**."

### 7.4 工具面与关键语义（mcp:203-503）

16 个工具：`orchestrator_capabilities / delegate_task / task_status / task_cancel / create_threads / t3_thread_launch / t3_thread_list / t3_thread_read / t3_thread_update / t3_thread_send / t3_submit_output / t3_thread_wait / t3_thread_interrupt / schedule_task / list_scheduled_tasks / delete_scheduled_task`。

值得单列的语义：

- **`orchestrator_capabilities` 的模型列表故意裁短**（mcp:225-231）："The model list is short **on purpose**: catalogs such as OpenCode can hold hundreds of models, and **every call lands in the agent's context**."——每 provider 列 custom/favorite/caller 自有 + 几家主流全量 current，其他取前 8 个；`omittedModels` 计余量，`search` 参数可找。
- **`delegate_task`**：继承规则（provider/model/modes omitted 时从 parent 继承；显式 `providerInstanceId` 精确遵守、不可用即失败）；`isolation: "worktree"` 从 parent commit 准备独立 checkout，"Uncommitted parent edits are not copied"；**runtime mode 只降不升**（provider 不提供的 mode 按 approval-required 跑会每命令都要审批，故 inherited mode 降级到目标支持的最宽 mode）；follow-up 走 `t3_thread_send(childThreadId)`，"it does **not reopen** the completed task or change its published result"；`mode: "wait"` 超时**不取消** child（`waitTimedOut: true`）；result 带 `next` 即**唤醒 parent**（"do not wait on the task or poll it"）；blocking question 结束 wait（`hasPendingQuestion: true`）；live approval 出现在 `pendingApproval` 但"**grants no approval authority**"；async question **不**结束 wait。
- **`task_cancel` 级联**（mcp:311-326）：先停 child 委派的一切，再 `thread.stop`（= 用户 Stop 语义：打断 running、hold queued、结束 PR watches），取消 task 自己的 queued turn，再撤销自动回传。已终态的 task 原样返回但仍停 child thread。
- **`create_threads`**：1-20 个普通顶层 thread，**无 sub-agent lineage**；local-only（`target.environmentId/projectId` 被忽略）。
- **`t3_thread_launch`**：workspaceStrategy 三态（worktree+baseRef / existing_worktree+path / root）；"The thread is **bound to that workspace before the agent starts**"；特权天花板：新 thread 的 mode **不得宽于 caller**；`clientRequestId` 幂等重试（重发同 key 复用已建 thread）。
- **`t3_thread_read`**：范围是整个 environment；两种视图（messages / activity）；**游标方向分档**（T3 内 agent 无游标读最新；CLI/外部 client 从最旧开始，兼容旧版只认 `hasMore`）；**响应硬界约 30,000 字符**（因为 "Claude Code saves MCP results over its token limit to a file instead of showing them"）；`createdBy` × `creationSource` 正交——"Actor and ingress are **separate** so agent-authored user-role messages remain distinguishable from human-authored messages."（mcp:394-395）；thread 链接协议 `<t3-thread://v2/<env>/<threadId>>`（"so they never format an id or write a title, which goes stale when the user renames the thread"）。
- **`t3_thread_send` 四模式**（mcp:441-452）：`auto`（idle→start / steerable→steer / 否则 queue）/ `queue` / `steer`（需 steerable）/ `restart`（interrupt-and-restart；只能停+排队的 provider 则停 turn 后插队 queued 队首；拒绝条件：不可停 / Stop 已到 / `/compact` 或 `/logout`）。**请求 result 的 send 强制 queue**——"the result belongs to one whole turn"。
- **`t3_submit_output`**：结构化输出闭环；欠账匹配规则（"A turn that was asked for nothing answers for the newest turn that was asked and has **not answered yet**"——agent 结束 turn 去等待、被唤醒后交结果的形式）。
- **Scheduled tasks**：interval / 固定时刻 / webhook；webhook 无签名则"anyone with the webhook URL can trigger a run"。

### 7.5 Delegated task 全链路（mcp:505-554）

```text
provider model -> MCP tools/call delegate_task -> OrchestratorMcpService
  -> shared ThreadManagementService -> V2 delegated_task.request command
  -> child thread + child run -> parent app_owned subagent projection
  -> parent/child execution nodes -> consumed subagent_spawn context transfer
  -> normal provider effect and runtime ingestion -> child run terminal
  -> parent subagent/node/turn item finalized -> consumed subagent_result context transfer
  -> wait result or later task_status result
```

两个机制值得记住：
- **终局化幂等**（mcp:531-534）："The event stream first replays persisted events and then follows live events, so finalization also runs **after a server restart**. An existing `subagent_result` transfer makes finalization **idempotent**."
- **child question 路由**（mcp:536-551）：动机是"Users rarely watch child threads, so a child question would otherwise go **unanswered**"。能无损 steer 就 steer（"A queued notice would wait behind a long-running orchestrator turn that may never end"），否则排队；问题先解决了就取消该 turn；**"Approvals are not routed, because those tools cannot answer them."**

### 7.6 Policy 与幂等（mcp:556-593）

- **特权天花板**（mcp:558-566）：child runtime mode 只可等或更窄；interaction mode 等或 `default→plan` 收窄、不得反向；**跨 thread 变更**同样需要 calling thread 有 live run 且目标 mode 不得宽于 caller。"This is the **same privilege ceiling** as child creation."
- provider 准入五条件：enabled / installed / available / authenticated / backed by a V2 adapter。
- **幂等原语**（mcp:571-574）："`clientRequestId` derives **stable command, thread, and message IDs** within the provider session. Retrying the same call returns the **same durable work**." 无 key 则生成新请求键、建新工作。
- **14 个 typed 失败码**：`capability_denied / parent_not_active / provider_unavailable / model_unavailable / runtime_mode_escalation_denied / interaction_mode_escalation_denied / task_not_found / task_not_cancellable / thread_not_found / run_not_found / thread_not_sendable / thread_not_interruptable / invalid_request / orchestration_error`。

### 7.7 验证契约（mcp:611-634）

"The integration test uses the **real** MCP toolkit registration, V2 orchestrator, SQL persistence, event ingestion, projections, and checkpoints. **Only the external provider adapters are deterministic test implementations.**"——与 §8 测试哲学互证。

---

## §8 测试策略：什么算证明（test 精读）

**这节证明什么**：这是九篇里**唯一没有实现代码就写好验收方式**的一篇——「先有测试基建，后有生产重写」（test:220-233）。

### 8.1 原则（test:3-25）

- "V2 should be validated with a **small number of high-value integration tests** rather than a large suite of unit tests that **mock away the behavior being tested**."（test:3）
- 目标不是「从不使用替身」，而是"test doubles exist **only at true process, network, clock, id, and filesystem boundaries**. **Core orchestration behavior must run for real**."（test:5）
- 默认测试形状（test:11-21）：`command dispatch → real Orchestrator → real ProviderAdapter → **replayed ProviderRuntime transport** → real normalizer → real event store/sink（生产持久化语义）→ real projection → real checkpoint policy → assertions`。

### 8.2 允许与禁止的替身（test:27-50）

允许：provider runtime transport（回放 transcript）/ Effect `TestClock` / 确定性 `Random` / 临时文件系统或 worktree / 临时或内存数据库（同 repository 接口）/ 仅当直接测试进程失败行为时的 fake supervisor。

**禁止**（integration tests）：mock orchestrator / provider adapter / normalizer / command-event 基建或 event sink / projection reducer / checkpoint service / capability policy；**不得**拿预归一化的 domain events 当 adapter 测试输入；不得自造 clock/id 服务。

配套约束：生产代码读时间必须走 `DateTime.now`/`Clock.currentTimeMillis`，不用 `Date.now`；随机走 `effect/Random`，不用 `crypto.randomUUID`/`Math.random`（test:52）。

### 8.3 Replay Runtime 的契约边界（test:62-105）

- provider 中立：Codex NDJSON 只是「一个 provider 的 transcript 格式」。
- `ProviderReplayTranscript`：`{provider, protocol, version, scenario, entries}`；entry 三型：`expect_outbound`（断言 app 发出的帧）/ `emit_inbound`（注入 provider 帧，可 `afterMs`）/ `runtime_exit`。
- replay runtime 拥有确定性传输语义（有序注入、外发断言、暂停/恢复、退出模拟、resume 游标、metadata 校验）。
- **边界铁律**（test:103）："The replay runtime must **not know** what a turn, plan, approval, subagent, or checkpoint means. **Provider adapters interpret provider-specific frames.**"
- 恢复测试（test:105）：app 重启 = 拆掉重建最外层 orchestrator/server + durable persistence；idle 清理与崩溃恢复走生产 lifecycle 服务；"Tests **must not** add adapter or orchestrator methods whose only purpose is restarting sessions for assertions."

### 8.4 五 provider 的 transcript 形状（test:107-156）

Codex（JSON-RPC app-server）/ Claude（Agent SDK `query()` 的 outbound options + 有序 `SDKMessage` chunks）/ Cursor（SDK open/send + 有序 onDelta/run results）/ OpenCode（SDK HTTP/SSE，**必须保留 response 与 SSE 事件间的竞态**——user 消息与终态 `session.status` 可能先于 `promptAsync`/`abort` 响应到达；subagent fixture 必须同时保留 parent 与 child session ids）/ ACP（子进程 replay peer 校验每个外发帧）。

### 8.5 四层契约测试与「首批十个」（test:158-184）⭐

四层：① schema 测试 ② 纯投影不变量测试 ③ adapter replay（raw transcript → V2 domain events）④ **全链集成**（commands → replay runtime → final projection）。"**The fourth level is the most important one.** It is the test that catches lifecycle mismatches such as **child turns closing parent runs** or **checkpoints being captured too early**."（test:167）

首批十个集成测试（原文照录含义）：
1. `simple`：一条消息 = 一 run / 一 root node / 一 provider turn / 一 assistant 响应 / 一 root checkpoint。
2. `multi_turn`：后续消息在同 app thread 上产生单调递增 ordinal 的 runs。
3. `message_steering`：steering 挂到 active run intent 上，不变成无关 run。
4. `turn_interrupt`：interrupt ack **不**完成 run，直到 provider 终态事件到达。
5. `steering_restart_fallback`：不支持原生 steering 的 provider → 打断 active attempt + 同一 run 下建替代 attempt。
6. `subagent`：子 provider turn 建嵌套执行节点，**永不**完成 parent run。
7. `subagent_checkpoint`：子节点建嵌套 checkpoint scope，**不**推进 app run 计数。
8. `thread_rollback`：rollback 瞄准 checkpoint scope 并对账 provider 回滚快照。
9. `approval_request`：provider 审批回调成为 durable runtime request，经真实 adapter 路径解决。
10. `provider_switch_return`：切走建 handoff；切回 resume 旧 provider thread 并带 delta handoff。

"Additional tests should be added **only when they protect a new invariant or reproduce a real failure mode**."（test:184）

### 8.6 断言强弱与实现顺序（test:186-233）

好断言：duplicate command 返回原 receipt sequence 且不重放 provider transport / stored-event sequence 单调 / snapshot+stream-after-sequence / run status 与 ordinal / active/final attempt / node 父子结构 / provider thread-turn 关联 / checkpoint scope 层级 / pending-resolved runtime requests / handoff 覆盖与策略。
弱断言（避免）：精确内部函数调用次数 / 私有 helper 调用顺序 / adapter 边界以下的 mock 回调参数。

实现顺序（test:220-233）：**V2 契约 schema → Effect service 定义 → provider runtime transport 抽象 → 通用 replay runtime → 五 provider transcript loader → 投影不变量测试 → 全链集成测试 → 生产层**。"This keeps the architecture **executable while it is being built** and prevents tests from validating only simplified mocks."

---

## §9 internals 的文档形态：source alone does not explain（七篇观察）

**这节证明什么**：`docs/internals/` 的准入标准本身就是这套工程文化的核心——它定义了「什么样的知识值得写成文档」。

### 9.1 准入标准与分工

- 准入（`docs/README.md`）："Internal notes preserve **architectural decisions, constraints, and implementation traps** that **the source alone does not explain**."——只收「读代码得不到、不写会写错」的东西；大多数代码改动**不需要**动内部文档。
- glossary 的分工声明（i/glossary:3-4）："Terms whose meaning matters across T3 Code. **Architecture and lifecycle constraints belong in the overview**, not in these definitions."——术语表只管定义，不管约束；约束集中在 overview。
- 与 spec 的分工：spec（orchestration-v2）写**目标模型与 why**；internals 写**已实现系统的边界、陷阱与运维性事实**；glossary 写术语。

### 9.2 七篇里记录了什么类型的知识

- **i/overview（157 行）——已实现系统的架构边界全集**：environment 拥有执行与状态、client 永不代替其文件系统/凭证（i/overview:3-6）；Orchestrator 串行决策不做 I/O，EventSink **单事务提交事件+投影+命令回执+outbox**（i/overview:48-53）；**事件日志只保留约一天**且 ProjectionMaintenance 删除投影已覆盖的事件——"projections **cannot be rebuilt** from the log"（i/overview:61-73）；游标低于已修剪序列的客户端自动回落到快照（且读回放后要**重查**该序列，因为读取期间可能发生修剪）；checkpoint 用隐藏 git refs，**per-repository 稀疏 scope**（每 turn 每 repo 一次 `git status`，只有真改动的 repo 才有快照 ref）；settlement 由服务端拥有、客户端不按自己的时钟/PR 缓存推导（i/overview:117-127）；Electron pre-ready 层必须**同步**获取（Chromium 缓存首个 portal 注册，晚设身份无效）——这类「时序陷阱」是 source alone 看不出的典型。
- **i/legacy-orchestration-migration（61 行）——迁移工程的具体机制与永久性陷阱**：v2 首启把 `state.sqlite` 抄成 `statev2.sqlite`，只对副本迁移、原库留给 v1；thread shell 先建、transcript 懒导入；**协议版本闸**：client/server 必须同意 `ORCHESTRATION_PROTOCOL_VERSION`（现为 2），`/ws` 在**任何 RPC 或 auth 工作之前**以 426 拒绝不匹配（i/legacy-orchestration-migration:33-42）——"rather than running half-upgraded"；**迁移 id 永久遮蔽陷阱**（i/legacy-orchestration-migration:44-54）：migrator 只比 id 不比名字，fork 过的库里任何 ≤ 未来上游 id 的编号都会永久遮掉该迁移——"There is **no safe id range** for a fork inside this ledger"。
- **i/context-handoffs（19 行）——两套摘要算法的防混淆说明**：portable/fork handoff 是文本摘要，"They do **not** claim native provider context parity"；`compactText` 每条最多 **240 字符**（截断为 237 + "..."）；file change 只带文件名、checkpoint 只带文件数；**legacy v1 continuation 是另一套算法**（只取 user+assistant、从最新往回、32000 字符预算）——"**Do not describe that migration budget as the limit for portable handoffs, and do not describe the 240-character prefix as a migration rule.**"（i/context-handoffs:16-19）——这条文档存在的唯一目的就是防止两个数字被后来的人搞混。
- **i/consistency-action-names（39 行）——一条 a11y 产品不变量**：同一 action 在可见标签/tooltip/菜单措辞/可访问名里必须描述**同一个对象**——"A message copy action called 'Copy link' promises a different clipboard payload to someone using a screen reader."；边界也写了（原生菜单/辅助技术可措辞不同，「Semantic agreement, not identical strings」）；验证方式："Verify visible wording alongside the **runtime accessible name** and resulting action. **Source inspection and screenshots alone do not establish accessibility-tree behavior.**"（i/consistency-action-names:38-39）
- **i/providers（177 行）——provider 适配的陷阱总集**：process/account 隔离（同 driver 多实例不共享可变 session/catalog 状态）；**"Setup must not happen as a health-check side effect"**（i/providers:54-59）——Grok 探针刻意不认证不建 session，Antigravity 后台检查只用 initialization；更新**只走 owning installer**（路径证明归属才跑包管理器，证明不了则用 provider 自己的 updater 或保持手动）；protocol traps：Codex 的 async question 是 notification 而非 pending RPC（应答 = 发新 user message），`/goal` 下一 turn 在毫秒内自动开始因此**一个 run 可拥有多个 native turns**；capability 必须描述真实能力（Antigravity 能 capture 但不能 rollback 对话 → checkpoint 边界**先拒绝再动文件**）；native option id 必须过归一化存活（"a display label is not necessarily a valid reply"）；附件在 workspace 之外、prompt 里的路径**不**授权文件系统访问；诊断日志 payload **64 KiB** 编码预算、大 payload 变结构摘要。
- **i/effect-services（163 行）——服务层的写法规则**：transport handler **只做三件事**（decode / call one service method / map typed errors）；业务逻辑进 service（理由：WebSocket、MCP 工具、定时任务、CLI **四个入口共享能力**，写在 handler 里其他入口就缺）；错误是 `Schema.TaggedError` + 结构化属性，message 固定、**不**从 cause 复制；"Safe values"：属性与日志注解有界——不放 raw payload/命令参数/签名 URL/凭证；`DeviceBootError.diagnostics` 是**明确记档的唯一例外**（2000 字符上限，因为设备用户与 agent 需要启动命令来诊断 host 设置）。
- **i/glossary（66 行）**：术语定义即契约——例如 `Thread`："The durable conversation and work history for a project. **It survives provider process exits.**"；`Turn`："One user-to-agent cycle, a V2 run. Provider work can end **before** checkpoint and diff work settles."；`Command`："A request to change domain state. **Accepting it does not mean its side effects have finished.**"

### 9.3 「什么写什么不写」的总结

| 写进 internals | 不写进 internals |
| --- | --- |
| 读代码看不出的时序/顺序陷阱（单事务、先拒绝后动文件、pre-ready 同步） | 代码结构本身（"大多数代码改动不需要动内部文档"） |
| 永久性工程陷阱（迁移 id 遮蔽、协议版本闸） | 临时状态、任务进度、排期 |
| 跨入口约束（handler 只三件事，因为四个入口） | 实现方案细节（PR 本身就是实现记录——"合并的 PR 就是实现记录，不在库里留第二份"） |
| 容易混淆的数字语义（240 字符 vs 32000 预算） | 与 spec 重复的目标模型叙述 |
| 运维性事实（事件保留一天、诊断 64 KiB 上限） | — |
| 产品级不变量（action names 语义一致 + 如何验证） | — |

---

## §10 对我方（agents-remote）的启示

> 分两档：**A 直接可用**（有明确对应场景，按成本排）；**B 结构性参考**（现在不做、但数据模型/方向应留位）；**C 明确不适用**。

### A · 直接可用

1. **Stop 与队列的交互语义（holdQueue）**。我们 prompt 队列 v2 刚把排队状态服务端化，即将面对「用户点停止时 queued 队列怎么办」的决策。V2 的答案是：Stop = `run.interrupt` **带 `holdQueue`**——扣住队列（冻结不丢弃）、结束 watch、丢弃 wake，"so nothing automatic restarts the thread"（life:254-260）。映射到我们：停止时队列应**冻结并在下一个用户动作时决定**（继续/清空），而不是静默丢弃或自动重发。（life 篇最直接的接续点）
2. **interrupt ack ≠ 终态**。我们已有「turn-end 由 provider 生命周期消息驱动」的纪律（relay-replay 记忆），V2 把它写成不变量：app 不得仅因 interrupt 请求返回就标终态（life:236-247）。值得在停止/打断路径自查一遍。
3. **`responseCapability`（live | not_resumable）**。我们 API 重启后「interrupted 呈现」是整批语义；V2 的细粒度做法是给每个 pending 请求挂能力标记，UI 据此显示「可应答 / 已过期，需重跑」。若做审批/提问类持久化，这是必备字段——否则重启后会出现点不动的按钮（core:489-501; ids:189-201）。
4. **稳定源点纪律**。"Do not silently fork from partially streamed provider state"（lineage:268）与我们 relay/live 双缓冲的正确性底线**完全同源**——任何「从进行中会话派生新产物」（导出、分叉、摘要、checkpoint）都必须锚定已完成的 turn/快照。
5. **幂等升级为协议契约**。V2 用 `clientRequestId` 派生稳定的 command/thread/message id（mcp:571-574），重试返回同一 durable work。我们发送路径的幂等目前是状态机层面的巧合；把「客户端幂等键」写进协议是低成本高价值的补强（与我们已实现的命令回执幂等在精神上同一家族）。
6. **completion barrier 的显式化**（life:533-543）：run 终态发布前先 flush 文本缓冲、闭合消息、finalize plan/todo、闭合非 live 子节点，然后才 capture checkpoint。我们的 turn-end UI 切换（"与已绘制内容同步"的 gate）可以直接借鉴这个「先收敛投影、再发布终态」的次序。

### B · 结构性参考

7. **Run + RunAttempt 实体**。我们目前没有独立于 provider turn 的应用层 run 实体（running 由 live+瞬时推导）。队列 v2 已经在这个方向上走了一步（queued 状态服务端化）；若未来要让「排队条目」也成为可计数 turn，或做「打断注入」（不依赖 provider 原生 steering：打断 + 同 runId 换 attempt），Run/RunAttempt 是现成蓝本（core:177-248; life:61-116）。
8. **capability 清单 + 降级表**。我们已有多 provider（claude/omp/codex），目前以 `AgentProviderCapabilities` 类型做了轻量声明。V2 的 11 组 capability + 八条降级映射提示下一步：每个「provider 不支持 X」都要有**声明式降级**（声明缺什么 → policy 决定退化成什么 → UI 收 typed 结果），而不是散落的 provider 名 if（cap:216-248）。resume 的定位尤其值得记：它不是能力，是**准入门槛**——与我们「--resume 是恢复语义底线」完全同构（cap:42）。
9. **child 只拿 task prompt、不复制 parent 历史**（mcp:19-21）——这是 OPC 多 agent 编排的核心纪律：委派不是把 parent 消息灌进 child 的数据管道（那会踩「不伪造消息」红线），而是新建独立 session + 显式构造的初始 prompt。subagent_result 回流按 merge-back delta 的内容规范（决策/改动文件/命令与测试/结论/未决问题，life:222）。
10. **特权天花板**（mcp:558-566）：child 的 runtime/interaction mode 只可等于或窄于 parent，跨 thread 变更同理。我们做子会话/委派时直接复用，不逐工具特判。
11. **handoff 是显式可审计 artifact**（core:447; lineage:152; life:179）：跨会话/跨 provider 的上下文注入必须落盘（谁生成、覆盖哪些 run、什么策略），重生成走 superseded 而非静默改写。与我们「不自行注入或伪造消息」的既有纪律互补——需要注入前史时的正确形态是显式记录，不是伪装成对话历史。
12. **事件修剪 + 快照回落**（i/overview:61-73）：日志只留约一天、投影不能从日志重建、游标太旧回落快照。这对我们长会话回放（state-sync-principles 的痛点）是按需同步方向的一个成熟样本：**投影是读模型、日志只服务重连窗口**，两者职责分离。

### C · 明确不适用（现阶段）

- 17 张投影表式的全家桶、Effect 全栈服务层、MCP 反向编排面（我们尚无 agent 反向调用控制平面的场景）、fork/merge-back 产品功能（无对应需求）、多 provider thread 覆盖记账（单 provider 会话模型下无意义）。
- **不要照搬 spec 的「忽略兼容」姿态**：T3 敢这么写是因为 V2 是预发布期大重写；我们的文档治理（docs/AGENTS.md「长期沉淀应在实现验证完成后进行」）在成熟期是正确的，spec 先行应只用于**新领域的目标模型**（如 OPC 编排），不适用于增量功能。

### 方法论层（比任何单条更值得记）

- **probe-derived requirements**：V2 全部设计源自对 Codex app-server 的探针实证（README:83-94）——先写探针、拿一手事实、再定模型。这与我们「第一手信息核对」「mock 全绿 ≠ 无罪」的纪律同源，但 T3 把它升级成了**架构设计方法论**：探针不是调试手段，是设计输入。
- **测试基建先行**（test:220-233）：先建 replay runtime 与契约 schema，再写生产层——"keeps the architecture executable while it is being built"。这解释了为什么一个 10 天 1924 commits 的大重写能被验证住。
- **tracked follow-up 记档**（README:110-166）：未做的东西不假装不存在，而是写成 follow-up 并写清「以后做时什么不用改」。

---

## §11 引用索引

- 九篇 spec：`~/repos/t3code/docs/orchestration-v2/`（README 166 / core 679 / ids 231 / life 543 / lineage 290 / psw 233 / mcp 634 / cap 284 / test 233 行，合计 3293 行）
- internals 精选：`~/repos/t3code/docs/internals/`（overview 157 / providers 177 / effect-services 163 / legacy-orchestration-migration 61 / context-handoffs 19 / consistency-action-names 39 / glossary 66 行）
- 姊妹分册：`t3code-deep-server.md`（照 spec 走查实现的机制视角）、`t3code-deep-evolution.md`（docs 目录地图与 AGENTS.md 品味九条）、`t3code.md`（主报告 §6 可学习清单）
- 精读方法：九篇两路并行逐节精读 + 主报告作者亲读 README/testing-strategy/internals，全部引用带 `文件:行号`；spec 内部两处字段名不一致已如实记录（§2.12）。
