# t3code 服务端机制深读（orchestration-v2）

> 调研对象：`~/repos/t3code`（origin/main，2026-11-22 快照）。本文是 **server 机制**路；UI/体验层见 `t3code-deep-ui.md`，产品/社区/演进见 `t3code.md`。行号均为该快照实读。
>
> **方法论更正**：旧调研（`t3code.md`）称「Orchestrator 单 worker 串行化」——源码实为 **per-thread KeyedLock + 特例锁**，无全局单 worker（§1.1）。引旧文结论时需替换。

## 1. orchestration-v2 全貌：命令 → 事件 → 投影 → 副作用

**结论**：服务端内核是「纯命令决策 + 单事务落盘（事件/投影/回执/outbox 四件套同 commit）+ 租约式副作用 worker」的事件溯源机；串行化靠 per-thread 锁，副作用靠 outbox 而非直调 provider。

### 1.1 序列化：per-thread KeyedLock + 特例锁

- 每线程一把锁：`ThreadCommandExecutor` 用 `KeyedLock<ThreadId>` 串行化同线程命令，跨线程删除用全局 `Semaphore(1)`（【源码 apps/server/src/orchestration-v2/ThreadCommandExecutor.ts:1-31】）。
- 特例加锁：fork 持源线程锁、删除级联持删除信号量、消息接收另有 messageIntake 锁、subagent 父先子后且永不嵌套（【源码 apps/server/src/orchestration-v2/Orchestrator.ts:16458-16512】）。不同线程天然并行。

### 1.2 一次「用户发消息 → 执行 → 审批 → 完成」的完整链路

1. **入口**：client 发 `message.dispatch`，dispatchMode 五选一（`defer_start / steer_active / restart_active / queue_after_active / start_immediately`，【源码 packages/contracts/src/orchestrationV2.ts:3570-3578】）；决策逻辑在 `dispatchMessage`（【源码 Orchestrator.ts:7130-7947】）。
2. **回执占位**：`dispatchWithReceiptEffect` 先 `insertIfAbsent` 占住 commandId；重复 commandId 直接按 `command_id` 重放已存事件、返回原 resultSequence，不重跑副作用（【源码 Orchestrator.ts:16166-16445】）。
3. **纯决策**：`dispatchOnce` 只读投影、产出事件列表，不动状态（【源码 Orchestrator.ts:15647 起】）。
4. **单事务落盘**：`EventSink.commitCommand` 在同一 SQLite 事务里 {写 command_receipt → append 事件 + apply 投影 + enqueue outbox 效果 → 回执 upsert resultSequence}，提交后经 `publishLane`（Semaphore(1) 保序）发布给 WS（【源码 apps/server/src/orchestration-v2/EventSink.ts:788-897、329-355】）。
5. **副作用 worker**：`EffectWorker` 守护进程并发 4、按线程租约 claim（同线程效果阻塞串行），执行 `provider-turn.start` 等（【源码 apps/server/src/orchestration-v2/EffectOutbox.ts:343-396、EffectWorker.ts:1050-1125】）；失败退避 `min(30s, 100×2^n)`，最多 5 次（【源码 EffectWorker.ts:1050-1125】）。效果分 `PROCESS_BOUND`（进程丢失需对账）与 `REPLAY_SAFE`（【源码 EffectOutbox.ts:144-165】）。
6. **provider 输出回流**：provider 事件经 ingestor 变成内部命令（run.output.submit、node.updated、runtime-request.updated 等，内部命令清单【源码 packages/contracts/src/orchestrationV2.ts:3766-4012】）走同一命令管道——**provider 回流与用户命令同一条序列化路径**。
7. **审批出现**：工具需要授权 → `runtime-request.updated`（status=pending）→ 客户端弹审批。
8. **审批应答**：client 发 `runtime-request.respond`，`dispatchRuntimeRequestRespond` 校验 status=pending（**首答胜出**，第二答被拒），写 resolved 事件 + `runtime-request.respond` 效果回 provider（【源码 Orchestrator.ts:11311-11590，pending 校验在 :11332】）。
9. **完成**：turn/completed → run.updated completed；提交后反应启动下一排队 run（§2.4）+ delegated completion 自动投递（§5）。

### 1.3 命令/事件清单

- 客户端命令 45 个（【源码 packages/contracts/src/orchestrationV2.ts:3236-3766】），代表：`message.dispatch`、`queued-run.start/reorder/cancel/edit`、`queue.resume`、`queued-message.promote-to-steer`、`runtime-request.respond`、`checkpoint.capture/rollback`、`thread.fork/merge_back`、`delegated_task.request/stop`。
- 领域事件 24 个（【源码 packages/contracts/src/orchestrationV2.ts:2128-2277】）：thread.created、run.created/updated、run-attempt.created/updated、node.updated、subagent.updated、provider-session/provider-thread/provider-turn.updated、runtime-request.updated、message.updated、turn-item.updated、plan.updated、checkpoint-scope.created、checkpoint.captured/rollback-requested、context-transfer/handoff.updated。

### 1.4 run 状态机（真实全集）

`preparing → queued → starting → running → (waiting) → completed / interrupted / failed / cancelled / rolled_back`（【源码 packages/contracts/src/orchestrationV2.ts:692-703】）。waiting = 有挂起 runtime request；rolled_back = 被 checkpoint 回滚标记（不删历史）。列存储投影 17 张 `orchestration_v2_*` 表 + 事件总表（【源码 apps/server/src/persistence/Migrations/055_OrchestrationV2.ts】全表集；事件总表 001_Migrations/001_OrchestrationEvents.ts，sequence AUTOINCREMENT + event_id UNIQUE + command_id 列）。

## 2. 消息队列机制（对照我们的排队 v2）

**结论**：t3code 没有队列表——排队消息就是 `status="queued"` 的 run + `inputIntent="queued_turn"` 的 turn_item 投影行，持久化 = 事件溯源本身；重启由恢复服务重物化，编辑/重排/撤销全是命令，活动插队走 provider steer 协议、被拒自动落回排队。

- **持久化**：排队即投影。runs 表存 `status="queued"` + `queuePosition`；turn_items 部分索引 `WHERE json_extract(payload_json,'$.inputIntent')='queued_turn'`（【源码 apps/server/src/persistence/Migrations/086_QueuedTurnInputIndex.ts】）。队列状态可由事件全量重放得出，无独立真相源。
- **重启恢复**：`ProviderRuntimeRecoveryService` 启动时重扫投影：queued run 重新发 status 事件物化（【源码 apps/server/src/orchestration-v2/ProviderRuntimeRecoveryService.ts:390-392、557、568、585】）；running run 二选一——按策略 stop，或合成 `CONTINUE_PROMPT` 起续跑 run（链深 3 + 5 分钟环窗防循环，【源码 apps/server/src/orchestration-v2/RestartContinuation.ts:21-25】）；有未决审批即阻断续跑（【源码 RestartContinuation.ts:28-80】）；outbox 中断效果重排（requeuedEffects，【源码 ProviderRuntimeRecoveryService.ts:1175】）。
- **编辑/重排/撤销**：`queued-run.reorder` 重写 queuePosition，自动投递项不可移动（【源码 Orchestrator.ts:12052-12136】）；cancel（【源码 :12138-12196】）、edit（【源码 :12249+】）同理，全是带 receipt 的命令。`QueuedRunOrder.queuedRunsInDeliveryOrder` 让「自动完成投递」与「用户消息」两类队列按请求时间交错，互不阻塞（【源码 apps/server/src/orchestration-v2/QueuedRunOrder.ts:13-51】）。
- **活动插队（active steering）**：dispatchMode=`steer_active` 时解析出目标活动 run（`queueBehindRun = activeRun ?? worktreeMissingRun ?? steerFollowUpSource`，【源码 Orchestrator.ts:7828-7856】）→ `provider-turn.steer` 效果 → `session.steerTurn` → Claude 适配层 `query.offer(userMessage, commitOffer)` 且 `priority:"next"`（注释明言 "now" 会取消在飞工具调用并报 user refusal，【源码 apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts:14151-14299】）；steerUuid 回声跟踪 pendingSteers。被拒（steerDeclined/turnCompleted）→ EffectWorker steer 分支失败路径自动落回 `message.dispatch` 排队（commandId 前缀 `command:steer-follow-up:`，【源码 EffectWorker.ts:330-453】）。另有 `queued-message.promote-to-steer` 把已排队项升级为插队。
- **队列→turn 边界**：每个完成/发消息后 post-commit 触发 `startNextQueuedRunOnce`：活动 run、归档、用量限流（queueHeld=true 并广播原因）、实例/worktree 失效等门槛检查，启动即发系统命令 `command:system:start-queued:<runId>`（【源码 Orchestrator.ts:2494-2673】）。
- **对照我们**：我们 v2 已有「服务端 relay 快照 + queue_state 全量广播 + live_end 种子」；真增量 = ①队列项是一等 run（可重排/晋升 steer）；②steer 失败自动落回；③queueHeld 原因广播（我们只有排队与否，无「为什么没启动」）。

## 3. 审批系统

**结论**：审批 = 持久化的 runtime request 一等实体（投影行 + 事件），跨重启存活、多客户端首答胜出、无服务端超时强制（只有状态可过期）且挂起审批会阻断续跑与入睡。

- **形态**：kind ∈ provider 原生请求 ∪ `dynamic_tool_call / user_input / auth_refresh`；status ∈ `pending/resolved/expired/cancelled`；responseCapability ∈ `live(带 session)/message/not_resumable`（【源码 packages/contracts/src/orchestrationV2.ts:1385-1397】）。
- **多端同一答案收敛**：不靠通知去重，靠命令串行化 + 首答胜出——两个客户端各发 respond，先者把 status 改 resolved，后者过不了 pending 校验成为 no-op（【源码 Orchestrator.ts:11311-11590】）。
- **超时**：无强制超时；`expired/cancelled` 是可停留状态，`not_resumable` 的过期请求使该 turn 不可续（【源码 RestartContinuation.ts:60-80】）。这把「何时放弃等待」留给 UI/策略层，服务端只保证状态诚实。
- **审批 × 队列**：挂起审批 = run waiting，活动 run 门槛使队列自然不启动（§2.4）；重启续跑被未决审批阻断（§2）；入睡被 pending request 阻断（§6）。

## 4. turn 级 checkpoint 与协同回滚

**结论**：checkpoint 用 git plumbing（stage→write-tree→commit-tree 双亲）产生悬挂 commit oid 作引用（不建 ref），回滚 = git restore+clean 回文件系统 + 关 provider live query 后用 `resumeSessionAt` 续会话，turn 活动中直接拒绝。

- **捕获**：`stageFiles → git write-tree` 取树 oid；分支切换的 turn-start 引用靠 reflog 重建（【源码 apps/server/src/vcs/GitVcsDriver.ts:1620-1626、1637-1762】）；`git commit-tree -p HEAD -p turnStart -m "t3 checkpoint ref=…"` 生成提交，checkpointRef 就是这个 commit oid（`rev-parse` 解析，【源码 GitVcsDriver.ts:1768-1782、955-975】）——**没有 per-checkpoint update-ref**，不污染用户 refs。对象从私有 fork 扇出发布到共享仓库（【源码 GitVcsDriver.ts:1793+】）。capture 本身是 outbox 效果（§1.2）。
- **恢复**：`git restore --source --worktree --staged`（含 sparse 处理）+ 最多 4 轮 `git clean -fd`（【源码 GitVcsDriver.ts:2005-2179】）。
- **协同回滚**：`CheckpointRollbackService` 校验（共享工作区拒绝等，【源码 apps/server/src/orchestration-v2/CheckpointRollbackService.ts:166-199、336】）→ 定 rollbackTarget=`thread_start|provider_turn`（【源码 :201-241】）→ 必要时重建 worktree/task folder（【源码 :257-334】）→ `session.open` + `session.rollbackThread`（【源码 :392-429】）：Claude 适配层 turn 活动中**拒绝**，否则关 live query → 计算 `resumeSessionAt` → `nativeConversationHeadRef` 弱引用，下一 turn 以 resume+resumeSessionAt 开新 SDK query；thread_start 目标则 `allocateSessionId` 全新会话（【源码 ClaudeAdapterV2.ts:14960-15036】）→ 最后 checkpoints.restore 恢复文件（【源码 CheckpointRollbackService.ts:430-432】）。
- **回滚后上下文**：provider 会话截断到目标点；app 侧**不删历史**——run/node 标 `rolled_back`、回滚前的 checkpoint 标 stale、发 `rollbackUnrestored` 元数据事件，用户可见消息保留并带回滚标记（【源码 CheckpointRollbackService.ts:444-536】）。对照我们 checkpoint 批：等价面 = claude 对话回滚；增量 = 活动拒绝分支、rolled_back 标记而非删除、文件树恢复。

## 5. subagent / delegate_task 编排

**结论**：委派子任务在**同一条命令事务**里完成子线程创建 + 血缘记录 + 递归派发；子线程完成永不关父 run；子 agent 卡问时靠「向父线程排队发 wake 消息」升级，问题解决即撤回 wake。

- **创建**：`dispatchDelegatedTaskRequest` 一个事务内：建子 AppThread + subagent 记录（origin=`app_owned`）+ node（kind=subagent，`countsForRun:false` 不计入父 run 进度）+ turn item（type=subagent）+ 递归 `message.dispatch` 到子线程 + `ContextTransfer(subagent_spawn)`（【源码 Orchestrator.ts:9883-10122】）。
- **结果回流**：子 run 完成 → post-commit 触发 delegated completion offer——以 `message.delegatedCompletion` 的**自动投递 run** 回父线程排队，与用户消息按请求时间交错（§2 QueuedRunOrder）；父 run.updated completed/waiting 时 Reactor 扫描子线程补投（【源码 apps/server/src/orchestration-v2/DelegatedTaskQuestionReactor.ts:96-130】）。
- **问题升级**：子线程出现 pending `user_input` request 且 responseCapability=live → Reactor 向**父线程** `message.dispatch`（`queue_after_active`），文本带 MCP 指令让父 agent 自己 read/respond（父 agent 代答，而非转发人工审批 UI）（【源码 DelegatedTaskQuestionReactor.ts:39-63】）；request 一旦 resolved 即 `queued-run.cancel` 撤回未消费的 wake（【源码 :65-94】）。
- **provider 原生子代理**（Claude 侧链）走 `origin="provider_native"` 独立查询（【源码 apps/server/src/orchestration-v2/NativeChildWorkQuery.ts:58-68】），与 app 委派并存。
- 对照我们 OPC 方向：这是最值得抄的编排原语——「子问题→父队列 wake+自动撤」比通知总线简单且可重放。

## 6. settle / snooze / pin + PR 工作流

**结论**：自动入睡是一条 gating 规则引擎（pin/pending 审批/活动/后台工作/PR watch/排队 2 分钟宽限任一命中即不入睡），PR watch 的 merge 即结算、唤醒走带防机器人回环限制的排队消息。

- **规则引擎**：`isAutoSettlementCandidate` 任一 gate 命中即否决：pinned、pending request、guest、近期活动、后台工作、PR watch、**排队 turn 将在 2 分钟内启动**（宽限期防「排队中被判休眠」，【源码 apps/server/src/orchestration-v2/ThreadSettlementService.ts:181-198、56、134-156】）；snooze 是显式时间窗（【源码 :200-231】）；结算时间 = PR merge/closed 终态时间或 inactivity autoSettleAfterDays，PR 判定用**用户锚点时间**比较（【源码 :158-179、233-283】）。
- **PR 工作流**：`pullRequestWatch.ts` watch 同步 CI/conflict/push 等「新闻」并 reset 计时；唤醒消息只对 bot 评论限次（防 agent↔CI 回环，【源码 apps/server/src/orchestration-v2/pullRequestWatch.ts:10】）；merge 检测 `detail.state==="merged"`（【源码 :486-493】）→ merge 即结算；wake 文本明确指示 agent 完事后调 `unwatch_pull_request` 让线程回收件箱（【源码 :447-449】）。Reactor/Sync 两个观察器合计 ~1.9k 行（PullRequestWatchReactor.ts 1009L / PullRequestSyncReactor.ts 907L）。
- 对照我们 settle 批（16c9911）：等价面 = 休眠/置顶/自动结算框架；增量 = 排队宽限 gate 与 PR watch 唤醒。

## 7. 多客户端同步

**结论**：投影全在服务端 SQLite，客户端只拿「快照 + sequence 游标」；重连 = 订阅先行 + 回放（有界）+ 序列去重，游标落后修剪边界或预算溢出即强制整快照——没有 delta 合并逻辑在客户端。

- **重连协议**：客户端带 `afterSequence` 重连；服务端给 `highWater`（projection_metadata.last_sequence）与 `prunedThrough`；游标超前或低于修剪边界 → `snapshotThenLive`；回放受事件数 + payload 字节双上限，超限也转快照（【源码 apps/server/src/ws.ts:920-1140】）。**订阅先于读持久事件**（先订阅 PubSub 再查 high-water，客户端按 sequence 去重重叠，【源码 ws.ts:1044 注释 + LiveStreamBudget.ts:333-387】）。
- **有界缓冲**：live 流预算 1000 条 / 8MB 序列化字节；溢出不丢帧而是 fail-fast `LiveStreamBufferError("Resume from the last received sequence")`（【源码 apps/server/src/orchestration-v2/LiveStreamBudget.ts:18-19、67-84】）；`bufferLatestLiveStream` 按实体 key 合并积压全量态、只留最新 sequence（【源码 :244-318】）——状态型事件天然可合并，重连只补最新。
- 对照我们：addSubscriber live_end 种子快照已覆盖「重连重建」主路径（等价）；增量 = ①订阅先行+去重（我们靠 liveLines 缓冲，窗口内断连帧确实会丢——我们排队 v2 的种子空洞 P1 即同类问题）；②显式预算上限与「resume from cursor」错误语义；③按实体 key 合并积压（比逐帧转发省带宽）。

## 8. 事件保留与修剪

**结论**：事件只留 1 天，靠「boundary 先行」的两段式修剪保证重连客户端永远拿快照而非部分回放；回执永不清（幂等依赖它）——DB 权威的复杂度主要买到了幂等、恢复与多端同源三件事，对我们其性价比取决于是否走事件溯源。

- **保留**：`RETAINED_EVENT_HISTORY = 1 day`（【源码 apps/server/src/orchestration-v2/ProjectionMaintenance.ts:42】）；outbox 已结算效果留 7 天（【源码 EffectOutbox.ts:755-791】）。
- **两段式修剪**：mark 记录「可修剪水位」，水位 ≥1 天才执行；先写 `EVENT_LOG_PRUNED_THROUGH` boundary 事件再删旧行——注释明言 "so resuming clients take a snapshot, never a partial replay"（【源码 ProjectionMaintenance.ts:257-292】）。不可修剪白名单：promptSequence 锚点、流头行、thread.created、运行中 run.updated（【源码 :120-138】）；command receipts 永不清（幂等回放依赖，【源码 :256】）。
- **快照恢复**：重连游标 < prunedThrough → 直接 snapshotThenLive（§7）；投影落后于事件由 mark=min(mark, projected) 约束。
- **值得吗**：t3code 为 DB 权威付出 17 张投影表 + 修剪/边界/预算三层机械。回报 = 幂等重放（多端安全）、进程崩溃后全状态可重建（恢复服务直接读投影）、多端同源零客户端合并。我们以 JSONL 为权威、relay 内存双缓冲，已用更低成本拿到「多端同源」（排队 v2）与「重连种子」；若后续要做审批实体/子任务编排/可重放队列命令，边际收益才转正——**不必整体迁移，按需把「命令回执 + 投影快照」局部引入最划算**。

## 9. 对 agents-remote 的可移植清单（按价值排序）

> 我们现状锚点：JSONL 权威 + relay history/live 双缓冲 + WS 广播 + 排队 v2 服务端快照（queue_state 广播 + live_end 种子）+ checkpoint 批（claude 对话回滚）+ settle 批。标注【已有等价】= 无需移植；【真增量】= 建议吸收。

1. 【真增量】**命令回执幂等**：insertIfAbsent 占位 + 重复 commandId 重放已存事件返回同一结果。我们的发送/撤回/审批/interrupt 均无幂等层，多端双击/网络重试会双发；这是多客户端安全的地基。
2. 【真增量】**重启恢复定案**：重启后 running run 显式二选一（stop / 合成 CONTINUE_PROMPT 续跑，链深上限+环窗），queued run 重物化，PROCESS_BOUND effect 对账。我们 API 重启 = 孤儿 CLI + 快照谎报空（挂账已知），此机制直接对症。
3. 【真增量】**队列项一等化**：重排（reorder）、promote-to-steer、queueHeld 原因广播。我们 v2 已有快照+撤回/编辑【已有等价】，缺「调整顺序」与「插队升级」。
4. 【真增量】**子任务问题升级**：子 pending question → 父线程排队 wake 消息（带代答指令），resolved 即 queued-run.cancel 撤回。OPC 多 agent 编排可直接复用此原语。
5. 【真增量】**订阅先行 + 序列去重 + 有界预算**：先订阅再回放、按 sequence 去重叠、预算溢出 fail-fast 要求 resume-from-cursor。修我们「断连窗口帧丢失」类问题（排队种子空洞 P1 同族）的结构性方案。
6. 【真增量·局部】**审批 runtime request 实体**：若做审批面（多 agent 必经），直接抄它的状态机（pending/resolved/expired/cancelled + live/message/not_resumable + 首答胜出 + 阻断续跑/入睡）。
7. 【已有等价】**回滚协同**：我们 checkpoint 批已做对话回滚；可补「turn 活动中拒绝回滚」与 `rolled_back` 标记（不删历史）两个细节。
8. 【已有等价】**修剪 boundary 先行**：我们 relay liveLines cap + live_end 种子已覆盖重连正确性；若未来事件入库再做 prunedThrough-boundary 模式。
9. 【已有等价】**settle 排队宽限**：我们 settle 批已有框架，只缺「排队 2 分钟内不判入睡」这一条 gate，低成本补。
10. 【不移植】**17 张投影表全家桶**：在我们 JSONL 权威架构下整体引入成本 > 收益；按 1/2/6 的局部形态引入即可。

## 10. 一句话总评

t3code 用「命令溯源 + 投影 + 回执 + outbox」四件套把控制平面做成了可重放、可恢复、多端同源的系统，代价是大量投影机械；对我们最有价值的不是架构整体，而是其中四个可局部移植的原语——**命令幂等、重启定案、队列一等化、子任务升级**。
