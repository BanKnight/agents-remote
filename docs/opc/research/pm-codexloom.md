# CodexLoom 产品调研（PM 视角）

> 调研对象：[`yan5xu/codexloom`](https://github.com/yan5xu/codexloom)（Go + React，**Elastic License 2.0**，本地优先、自托管）。自我定位「Loom your Codex」——把 Codex threads 织成一支长期在岗的 Domain Agent 组织。本文件是第 12 个参考产品调研（承接 pm-openopc.md；前序 PM 调研见本目录 pm-*.md 与 index），喂 PRD `../design/multi-agent-prd.md` 与讨论中枢 `../design/opc-product-discussion.md`。
> 证据分级贯穿全文：✅ 源码/README/官网中文 guide/deepwiki/GitHub API 直证 ｜ 🟡 二手社区 ｜ ⚠️ PM 推断。
> 调研方法：GitHub REST API（repo meta + contributors + commits + issues + PRs 直取硬数据）+ 中文 Owner Guide（canonical，全文逐行）+ epoch-context-coverage.md / topics.md / triggers.md / product-design.md / agent-profile.md / integrations.md / README 文档全文 + deepwiki（源码级，3 轮 ask_question，Hub/CodexHost/Store/Rollout/Gateway/ConversationMembership 全维度）+ HN Algolia + firecrawl（~2 credits，社区声量验证）。
> **本调研定位**：CodexLoom 是目前为止**与 OPC PRD 意识形态最接近的项目**——「Long-lived Domain Agent」+「不重写 runtime」+「Profile 作协作契约」+「按需唤醒 + compaction 保连续性」+「明文写 OPC 目标用户」+「中文 Owner 作 canonical」。但它在一个根本处和我们分叉：**它把「长期存活 Domain Agent」当第一期地基，我们 PRD 第一期选「任务为执行单元、agent 非常驻（按需 spawn）」**。这个分叉是 §12.1 的核心。

---

## 1. 一句话定位

CodexLoom = **「把 Codex threads 织成一支长期在岗的 Domain Agent 组织」**——每个 Agent 围绕一个长期领域（不是单任务），有稳定 ID + 可编辑 name + Profile（Identity/Domain/Scope）+ primary Thread + 模型配置；thread 跨任务复用累积上下文（cold-start cost 不重复付），compaction 后 Epoch Context Coverage 重新覆盖 Profile/关系快照保连续性；Agent 间不互 resume 对方 primary thread，只通过 bounded Messages + Topics + managed Artifacts 协作；治理外部交付（Interface Agent + Conversation Membership）让 Agent 能进飞书/Slack/Parall 但外部 actor 不碰内部 thread/工具/凭证。✅

- 作者：**yan5xu（Yanwu）**（GitHub `yan5xu`，2013 注册，216 followers，34 repos，个人开发者）。✅ 中文母语，**长期围绕「中文 AI agent / 语音 / 知识管理」主题做项目**：`ququ` 2260 stars（开源 Wispr Flow 替代，中文语音转写桌面）、`code-relay` 297 stars（「AI Coding Agent 工作协议 — 跨会话记忆、多仓库全局视野」——与 CodexLoom 概念直接同源）、`oh-my-ai-company` 81 stars（AI 公司图谱）、`scout` 121 stars（Roo Code 实验 Agent）。✅ CodexLoom 是这条线的集大成。
- 仓库：361 stars / **0 subscribers(watchers)** / 27 forks / 23 open issues（**yan5xu 自报 15 个**，外部仅 4 个） ｜ Go（后端 Hub）/ React（前端 WebUI，2026-08-10 迁 pnpm） ｜ created 2026-07-07 / pushed 2026-08-12（调研日 2026-08-13，**5 周龄**） ｜ size 22.9MB ｜ **无 release** ｜ 122 commits **全部 by yan5xu**（contributors=1）。✅
- 文档规模：`docs/` 下 30 个文件，含 `owner-guide.zh-CN.md`（483 行，**canonical 权威版本**，README 明文「两者出现分歧以中文为准」）+ `handbook.md`（47KB）+ `loom-cli.md`（49KB）+ `epoch-context-coverage.md`（14.6KB）+ `product-design.md`（15.5KB）。**文档体量是这批参考里最大的**（Paperclip/Multica 都不及）。✅
- 心智（README 原文）：**「Codex provides the threads; CodexLoom weaves them into an agent organization.」** + **「A workflow describes how work moves; CodexLoom organizes who remains responsible.」** ✅ —— 后者是把编排从「工作流」转向「责任网」的意识形态宣言，正是 OPC 三层模型「协作层焊关系网」的产品化。

> PM 判断：这是目前市面上**意识形态最接近 OPC PRD 的项目**——比 Raft（团队范式）、Paperclip（层级组织）、Multica（issue×task）都更贴我们的「Domain Agent + 不重写 runtime + Profile 作契约 + 按需唤醒 + 明写 OPC」。但它在我们 PRD 第一期「agent 非常驻」这条根本处分叉（详见 §12.1）。它是这批参考里**唯一明文写「One Person Company Owners」当目标用户、且把 OP 的「同事→派活→看板」语义用 Organization/Collaboration/Topic 三层重新表达的**。

---

## A. 根本使用场景

CodexLoom 是为**「一个高级个人 Owner 想养一支长期在岗的 Domain Agent 团队，减少 cold-start cost、把能力治理化地带给外部协作」**这个场景造的。它不是为「编排一支 agent 团队干一个临时项目」（Raft/Paperclip 场景），也不是为「一个用户养多个独立 specialist bot」（Grok Bot/OpenMausBot 场景），而是为「**同一个人长期在多个领域用 agent，让每个领域累积专长、跨任务复用**」。

**主场景用户旅程**（基于 zh-CN Owner Guide canonical 全文，✅）：

1. **装**：`make release && ./bin/codex-loom`，本地拉起 Hub + 内嵌 WebUI（localhost:4870）。需装 codex CLI + ChatGPT 登录。**local-first，自托管**。✅
2. **第一个 Agent**：不预设组织架构图。Owner Guide 反复强调「**从持续发生的工作出发，而不是从组织架构图出发**」——先选一个反复发生的责任（维护一个产品领域、持续研究、运营内容实践、支持长期客户关系），给它一个稳定 name + 一个 working directory + 最小 Profile。Profile 三字段：**Identity（这个长期主体是谁）/ Domain（长期生活的领域，不是技能列表）/ Scope（负责什么、边界在哪、什么不负责）**。✅
3. **派活 = 在 Agent workspace 发消息**：把一项真实工作交给这个 Agent。Agent 在自己的 primary Thread 里干活、用工具、产出。普通回复直接回到这个 Agent，**不抄送 Owner**（避免制造转发负担）。✅
4. **需要另一个 Agent 的判断 → Message**：Agent A 在自己的 thread 里工作时，发现需要 Agent B 的领域判断，用 `loom msg B --from A` 发一条 bounded Message（REQ/RES/NOTIFY 语义）。**回复返回给发起请求的 Agent A，由 A 整合，不直接给 Owner**。如果 B 正在跑 turn，message **排队等 B 当前 turn 结束**（per-agent queue + turn serialization）。✅
5. **需要人的事实/选择/授权 → Needs You**：Agent 显式用 `loom ask-user` 创建一条 Needs You 请求，进入 Owner 的 Needs You 队列。Owner 回应后，**原 Agent 继续同一项工作，不要求 Owner 重新陈述上下文**。Needs You 是 Owner 唯一的持久动作 inbox——不含普通活动、不含 Codex approval（那是独立 pending-approval 入口）。✅
6. **跨天/跨 Agent 的事项 → Topic**：一件跨多个 turn、跨天、跨多 Agent 的有边界事项，用 Topic（一条「薄共享协调记录」）追踪：Responsible Agent + Participants + versioned brief + waiting_on + 证据链接。Topic **不执行工作、不拥有 thread、不替代 Goal**——只是协调记录。每个 Participant 在自己 thread 干专业工作，把范围内结果返回 Responsible。✅
7. **观察团队 → Overview + Team 四图**：Owner 周期性看 Overview（Status / Capacity / Token Usage）+ Team（Directory / Organization / Collaboration / Activity 四图分离）。**核心：Overview 是观察界面不是公司仪表盘，Capacity 永远不自动判断拆分/合并 Agent**——信号只是证据，组织调整由 Owner 拍板。✅
8. **外部协作 → Interface Agent + Conversation Membership**：Owner 把某个 Agent 以「受治理外部身份」带入飞书/Slack/Parall 的 Conversation。每个 Conversation Membership 定义 purpose / role / guidance / triggerPolicy / replyPolicy / outboundPolicy / trustDomain。**外部 actor 不直接调内部 primary thread**——所有外部交互经 Gateway + Conversation Membership 治理。✅
9. **外部事件唤醒 → Trigger**：GitHub PR merge / workflow run 完成这类外部事实变化，用 Trigger 唤醒负责 Agent 重新核验当前权威 Provider 状态。Trigger 是「重新核验的理由，不是结论」——Agent 必须回源读 provider 当前态，不能把事件当工作完成的证明。✅

**主场景一句话**：用户开 CodexLoom 不是来「派一个临时任务给 agent」，是来「**经营一支长期在岗的 agent 团队**」——养身份、定边界、跨任务复用、治理对外——agent 在每个领域累积专长，Owner 在决策点（Needs You）介入，在观察面（Overview/Team）调整。⚠️（基于 zh guide + product-design 综合判断）

**官方点名的目标用户**（README + zh guide，✅）：**「Advanced Individuals and One Person Company Owners」**——明文写 OPC。「CodexLoom currently serves one advanced individual Owner first. Enterprise multi-tenant administration and general company operations are not the primary product direction.」——这是这批参考里**唯一明文锁 OPC 当目标用户、明文拒绝企业多租户**的。

---

## B. 解决的痛点（按具体症状列全）

没它之前，用户（一个高级个人 Owner）卡在（✅ README/zh guide/epoch 文档直证 + ⚠️ PM 推断）：

1. **每个任务付一次 cold-start cost** ✅ —— Task Agent 模型：建 thread、给目标背景、交付、弃；下个相关任务又新 thread，重新讲背景、恢复早期决定、重建 context。README 原话「Every task pays the cold-start cost again」。Domain Agent 用持续 thread + Profile 让 thread 跨任务复用累积上下文。
2. **重建 context 也有成本**（被忽略的反方成本）✅ —— README 专节「Rebuilding Context Also Has A Cost」直指：担心长期 thread 膨胀的人只算了「保留 context 的成本」，没算「重建 context 的成本」。新 thread 还是要喂背景/约束/早期决定才到同工作态；复用 thread 还能让稳定 history prefix 享受 prompt caching。
3. **compaction 把 context 清零的恐惧** ✅ —— 担心长期 thread = context 爆炸的人怕 compaction 后丢持久声明。Epoch Context Coverage 专治：compaction 后下一 turn 重新覆盖 Loom Agent Prompt + 完整 Profile + 直接关系快照；revision 标 `covered` 需 replayable rollout evidence + 同 turn model event **双证**。
4. **agent 间协作靠人转发** ✅ —— Agent A 干完要给 B 干，得 Owner 复制粘贴。CodexLoom 的 Message 让 A 直接 `loom msg B` 派活，回复回 A 由 A 整合，Owner 不当中转站（zh guide「已验证实践：普通的 Agent 间回复应当回到发起请求的 Agent」）。
5. **Owner 被转发负担淹没** ✅ —— 多 agent 团队最大痛点是 Owner 成了所有人所有事的中转。CodexLoom 直说「把每一条中间回复都发给 Owner，会重新制造出这支团队本应减少的转发负担」——所以信息流向是「**信息流向责任，决定流向权限，结果回到发起者，例外向上升级**」。
6. **组织架构图先于真实工作** ✅ —— 别的产品让你先画组织再派活。CodexLoom 反过来「先让一个 Agent 承担工作，直到稳定边界自己出现」「组织跟随分化而来」——反对一上来就建模理想组织。
7. **agent 的能力没法被同事复用** ✅ —— 你养了个很强的 Agent，但同事够不着（要么开账号要么邮件转述）。CodexLoom 的 Interface Agent + Conversation Membership 让 Owner 把 Agent 以「受治理外部身份」带入飞书/Slack，同事在明确 role 下与它协作，能力被复用不等于 Owner 全部上下文/权限交出去。
8. **外部事件要么人工盯要么自动化乱跑** ✅ —— PR 等着 merge、CI 等着绿，你不想人肉盯也不想让 agent 当 webhook 收到就乱动。Trigger 是「重新核验的理由」——事件唤醒 agent 去回源读 provider 当前权威状态，不是当结论自动继续。
9. **跨天跨 agent 的事项忘了** ✅ —— 一件事跨越多个 turn、几天、多个 agent，靠人脑记谁负责、等什么、到哪了。Topic 是一条「薄共享协调记录」让 Owner 和参与 agent 都能快速知道「这是什么、谁负责、现在到哪、在等什么、证据在哪」。
10. **多 agent 同台抢话/抢活** ✅ —— 多 agent 同台噪音爆炸。CodexLoom 用 **per-agent message queue + turn serialization**（不是共享 task claim 锁）解决——「recipient is busy, the message waits until its current turn ends」。
11. **agent 静默绕过问题** ✅ —— agent 遇 blocker 自己瞎绕。CodexLoom 用 Needs You + Topic waiting_on 让 agent 显式停下问（zh guide「不要问每一条输出看起来是否重要，而要问它完成了谁的工作、这个结果应该回到哪里」）。
12. **agent 不该自己拍板关键决定** ✅ —— 生产写入、外部承诺、敏感信息、不可逆状态变化。CodexLoom 用 Needs You（显式 Owner 授权）+ Scope（Profile 声明什么必须交出去）+ triggerPolicy/replyPolicy/outboundPolicy（Conversation Membership 治理）分层闸门。
13. **agent 写死职能 = 困死** ✅ —— Buzz 退役 persona 教训。CodexLoom 明文「**Lead/Internal Agent/Interface Agent 是组织模式，不是硬编码 agent 类型**」——通过 Profiles + 声明关系 + Messages + Conversation Memberships 表达。
14. **codex CLI 不能跨设备同步** ✅ —— 你在桌面、手机、WebUI、CLI 各起一个 codex，thread 不通。CodexLoom 用共享 CodexHost + 单 codex app-server 让所有 surface 看同一个 thread（rollout 文件是唯一真相源）。
15. **零信任问题** ✅ —— 把 agent 放外面云上跑担心凭证/数据泄漏。CodexLoom local-first + self-hosted + Keychain（正迁「受管凭据配置文件」）+ credential 不进 agent prompt（`credentialRef` 只能引用 env:/keychain）。

---

## C. Feature list（分维度，每条标 ✅/🟡/⚠️）

> 来源：zh-CN Owner Guide（canonical）+ product-design.md + topics.md + triggers.md + epoch-context-coverage.md + agent-profile.md + integrations.md + README + deepwiki 源码级。~85 条。

### C1. Agent 身份与 Profile 类
1. **Agent = 稳定 ID + 可编辑 name + Profile + primary Thread + 模型配置**：长生命周期主体，不是执行完一次 task 就销毁的 worker。✅
2. **Profile 三字段**：Identity（长期身份）/ Domain（长期领域，不是技能列表）/ Scope（负责什么、边界、什么不负责）。三字段都可空，新 Agent 默认无 Profile（version 0），不强制创建时填表。✅
3. **Profile = 对外协作契约**：既是 agent 的持久方向，又是对其他 agent 的「可发现性 + 协作契约」（声明 owns 什么、哪些问题该找它、哪些工作越界）。✅
4. **Profile 版本化 + 安全 turn 生效**：Profile 变化创建显式 version，从下一个安全 turn 应用（不打断 active turn）。rename 保稳定 agent + thread identity。✅
5. **agent = 持续积累专长**：长期在同一片 lane 干活，专长随反复工作累积（"compounds into expertise"，README 原文）。✅
6. **一个 Agent 一个 primary Thread**：其他 agent 不 resume 它的 primary thread（只通过 bounded Messages/Topics + managed Artifacts 协作）。✅
7. **Profile 写作三步法**（zh guide 详述）：① 寻找长期不变量（时间/路由/边界/频率四测试）② 分别写 Identity/Domain/Scope ③ 为协作可发现性检查（假设新 agent 只看 Profile 能否判断「遇到什么问题找谁」）。✅
8. **Agent 创建简化**：name + 绝对 working directory + 可选 Domain，高级 runtime 配置折叠。创建即开 thread。✅
9. **未来 coach-assisted 创建路径**（deliberately deferred）：帮 Owner 判断是否该有长期 Agent、产出可撤销组织假设、验证重叠与边界、跑真实 setup check。✅（文档明示后置）

### C2. Thread / Turn / Goal 类
10. **Thread = 持续工作区**（不是任务记录）：带交互、决定、工具调用、artifact、反馈，形成 agent 的工作轨迹。✅
11. **Turn = 单次执行周期**：一个 Thread 同一时刻只有一个 active turn（per-thread serialization）。✅
12. **Goal = 跨 Turn 持续推进的当前成果**（slim persistent Thread control）：不重定义 agent 执行状态，不能在 blocked/paused/limited/completed 后静默 reserve agent。跨 turn 续跑 + 完成状态。✅
13. **多 surface 共享同一 thread**：Codex Desktop / Mobile / WebUI / CLI 共享 agent 身份、thread 历史、流式事件、tool use、artifact、turn 状态、Goal、Inbox、Needs You、Profile、runtime 配置。一个 surface 收的消息在别的 surface 不刷新就出现。✅
14. **open tabs / tab order / scroll position / Inspector state / 未发草稿 = device-local**：跨设备同步的有边界——只有「持久 state」跨，「UI 临时态」不跨。✅
15. **稳定 request ID 防重复 turn**：网络重试不创建重复 turn。✅
16. **未确认消息绝不显示为已发**：reconnect 从 event cursor 恢复 + 权威 snapshot 调和。✅

### C3. 通信类（Messages / Topics / Needs You / Trigger / Schedule）
17. **AgentMessage REQ/RES/NOTIFY 语义**：required（要回复，open→answered/closed）/ response（回复）/ none（通知不要回复）。✅
18. **Message 状态机**：Status（open/answered/closed）× DeliveryStatus（queued/delivering/delivered/failed/cancelled）× HandlingStatus（pending/running/completed/interrupted/failed）。✅
19. **per-agent message queue + turn serialization**：recipient busy 时 message 排队等当前 turn 结束（`deliverNextQueuedForTarget` + `isBusyErr` → reset queued）。一个 target agent 一次处理一条 message。✅
20. **causally linked internal reply 立即投递例外**：对 active turn 的因果链内联回复可立即投递（不等队列）。✅
21. **`loom msg --no-reply` 显式关停**：required message 已处理但无需实质回复时显式关闭（防无界 loop）——**这是 CodexLoom 的「沉默即成功」机制**。✅
22. **Topic = 薄共享协调记录**（跨 Turn、跨天、跨 Agent）：Responsible + Participants + versioned brief + waiting_on + 证据链接。**不执行工作、不拥有 thread、不替代 Goal、不自动级联关闭**。✅
23. **Topic 状态**：active / waiting / resolved / archived（只表示协调记录态，resolved 不自动结束 Goal/取消 Trigger/关 Message/Needs You）。✅
24. **Topic 乐观版本号 brief**：`--if-version N` 防多恢复 turn 静默覆盖。✅
25. **Topic waiting_on 外部条件**：`--waiting-kind github-pr --waiting-ref OWNER/REPO#1970 --resume-action "..."`（与 Trigger 配合）。✅
26. **Topic send / intervene**：Owner 从 Topic 发范围/分工变化给 Responsible；从 Topic Active work 打开 Participant 当前 active turn 做 steer/interrupt（只作用于精确 active turn）。✅
27. **Topic 先试运行再固化长期关系**（已验证实践）：新分工先作为 topic-scoped responsibility 跑，Profile/Organization/Collaboration 不变，试验可撤销。✅
28. **Needs You = Owner 唯一持久动作 inbox**：仅含显式 ask-user 请求（事实/选择/授权）+ Codex approval + blocked decisions + Owner 答案投递失败。**不含**普通活动/外部 Inbox/完成通知/Connector 健康。silent stall 不自动建 Needs You。✅
29. **Needs You 排序**：blocking required requests → approvals → optional requests → time。dismissal 必须声明 no-answer/deferred/cancelled。✅
30. **Trigger = 外部事实变化唤醒既有工作**（不是结论）：v1 GitHub adapter（PR merged/closed/head-changed + workflow-run completed/success/failure/cancelled），每 30s polling（`CODEX_LOOM_TRIGGER_POLL_INTERVAL` 可调，最小 1s）。one-shot，ANY 语义多条件，创建时立即读初始态（已满足直接触发不等边沿事件）。✅
31. **Trigger 恢复语义**：sender 是 `system:trigger`（非伪 Agent），Capacity 标 `trigger` work source，不生成假 Agent 关系。trigger 唤醒 → agent 回源读 provider 当前态 → 确认目标/候选/依赖/完成条件仍成立 → 继续/重建等待/升级/停。✅
32. **Schedule = 时间触发**：cron + IANA timezone，per-agent 可见，Overview 全局汇总。✅

### C4. 组织与团队类
33. **Lead / Internal Agent / Interface Agent = 组织模式非硬编码类型**：通过 Profiles + 声明关系 + Messages + Conversation Memberships 表达。✅
34. **Internal Agent**：Domain 太大时 Lead 把稳定 subdomain 委派给 Internal Agent（各有自己的 Profile+thread，负责一个 subdomain），Lead 协调整个 domain 当公开协作边界。✅
35. **Team 四图分离**：Directory（精确清单，稳定排序）/ Organization（声明 parent/child 责任边界）/ Collaboration（声明跨域横向工作关系）/ Activity（从 Messages 派生的有时限证据）。**Observed Activity 永不自动变声明关系**；External role 不算 Team 关系；graph 节点可拖拽持久位置但 graph 手势不改关系语义。✅
36. **矩阵组织（Business Home + Topic Team + Practice Coach Network）**：Business Home（Agent 稳定业务归属，长期拥有业务对象/上下文/跨 Topic 优先级/Topic 结束后持续责任）+ Topic Team（阶段性事项动态组合）+ Practice Coach Network（跨 Business Home 维护专业方法，收集真实成功/失败/例外 → 候选实践 → 受影响方校准 + Owner 确认 → Skill/SOP/工具/模板/质量标准）。✅
37. **Team 默认开 Directory 不开 Graph**：稳定排序 + 准确扫描当前 status/name/Domain/组织位置/Needs You/Inbox/External 存在。✅
38. **Capacity 不排名 / 不自动拆分合并**：Capacity 报执行时间/日历非执行代理/new-work wait p50/p90/max/当前 backlog/oldest age/work source/wait reason/data quality/证据。**「Calendar non-executing proxy」永不缩写为「idle」**。✅
39. **组织调整 6 步**：① 确定受影响工作 + 稳定证据 ID ② 问负责 agent 它怎么理解工作+边界 ③ 只就相邻负责人经历核对 ④ 区分任务/工具/调度/Connector 故障 vs 组织设计 ⑤ Owner 确认长期责任变化后才改 Profile/关系 ⑥ 观察后续真实工作判断调整是否有效。✅

### C5. Epoch Context Coverage（compaction 连续性，**对比 Paperclip 成本爆炸的关键**）
40. **durable source 五保证**：每个 context epoch 中 ① Loom Agent Prompt 在可见历史至少完整出现一次 ② 完整 Profile 至少一次 ③ 直接 active Org/Collaboration 完整快照至少一次 ④ Topic/Message/Needs You/Trigger/Schedule/External Inbox/附件工作上下文在相关 turn 最终 input ⑤ **双证才标 `covered`**（replayable rollout evidence + 同 turn model event）。✅
41. **Epoch vs Turn 独立维度**：epoch 跨多 turn，turn 开始不一定开新 epoch，compaction marker 开新 epoch。compaction 前 coverage 不能证明 compaction 后仍包含。✅
42. **compaction 后下一 turn 重新覆盖**：ledger 切新 epoch + 下次 turn 开始时重新覆盖当前 durable sources。✅
43. **mid-turn compaction 已知边界**（不处理）：active turn 在 model 请求间 compaction → 该 turn 后续请求暂时缺 Loom durable context，下一 turn 恢复。mid-turn compact 后立即 `missing` 是已知边界非回归。✅
44. **Developer context 原子 payload**：Prompt + Profile 渲染成一个原子 Developer payload（`<loom_developer_context>` XML），Hub 在 turn/start 前调 codex app-server `thread/inject_items` 写一条原生 `role=developer` message。**不等于** Responses API 顶层 instructions，**不伪装** user message，**不触发** 新 turn，**不显示为 YOU**，**不被 compaction 特殊保留**（必须 epoch coverage 下 turn 重注入）。✅
45. **Developer payload 上限 128 KiB**（Owner Prompt template 上限 64 KiB），超限 fail closed 拒启 turn（不截断 Prompt/Profile）。✅
46. **Coverage ledger per-thread**：`~/.codex-loom/context-coverage/<sha256(thread-id)>.json`，Attempt 状态 `planned` → `submitted` → `model_observed` → `covered`。`thread/inject_items` RPC 成功 ≠ covered（要双证）。**at-least-once 非 exactly-once**——重复完整声明是安全的，漏掉当前声明不是。✅
47. **start lock 串行编译流程**（14 步）：每个 agent runtime 用同一把 start lock 串行以下步骤防并发 turn 重复注入（等 app-server ready → thread/resume → 读当前 epoch → 加载 ledger → 补上轮 pending attempt 证据 → 编译 revision+hash → 比较 ledger 找 missing → 原子重发 → 存 planned attempt+delivery marker+SHA → inject_items → 构造 turn input → turn/start → 观察首个 model event → 回读 rollout → 双证成立标 covered）。✅
48. **Profile XML escaping + CDATA-safe splitting**：`]]>`、伪 closing tag、伪 policy 不能逃逸数据边界（防 prompt injection 经 Profile 越权）。✅
49. **诊断入口**：`loom context prompt get/set/clear` / `loom context explain AGENT` / `loom context coverage AGENT --json` + HTTP API（`/api/context/agent-prompt` / `/api/agents/{agent}/context/explain` / `.../context/coverage`）。explain/coverage 只读观察，不会因读把 missing 标成 covered。✅

### C6. 治理外部交付类（Interface Agent + Conversation Membership + Gateway）
50. **Interface Agent = 组织的外部边界**（可选组织模式，非必需类型）：从 governed Conversation Membership 接活、澄清边界、路由 scoped 工作给 Domain Agent、需时请求人类授权、在策略+授权允许时返回结果给原 conversation。**外部 Membership 不给外部 actor 直接访问内部 Agent/Thread/工具/凭证/决策权**。✅
51. **Conversation Membership 字段**：id / addressId / conversationId / displayName / **purpose**（长期是什么）/ **role** / **guidance**（说什么不说什么何时 hand off）/ **triggerPolicy**（mention/direct/dispatch）/ **replyPolicy**（final_answer 映射）/ **outboundPolicy**（reply_only/proactive/none）/ **trustDomain**（审查+路由标签，非 sandbox 实现）/ enabled / version（乐观并发 + 事后解释）。✅
52. **DM 与群同等治理**：DM 参与者得到与群同样的显式 role+policy 对待。新发现的 place 显示 `Joined, not configured` 保持 inactive 直到 Owner 定义 role。✅
53. **Gateway 独立长跑进程**：连 Hub，连外部平台（Feishu/Slack/Parall）。外部事件 → normalize + dedupe → POST `/api/ingress` InboxMessage → Hub 验证 Connection/Address + allow/block list + mention policy → 持久化 InboxItem（queued）→ idle 时 HandlingAttempt reserve → Membership context + `<inbox_message>` XML 注入 agent thread → agent turn → 捕获 final_answer → OutboxItem（reply 或 no-reply）→ SSE command → Gateway 发回平台 → ack + cleanup。✅
54. **凭证不进 agent**：credentialRef 只能引用 env:/keychain，Gateway 持钥执行动作但 agent 不直接碰凭证。✅
55. **信任域 + 严格 ingress 验证**：trustDomain 标签审查+路由；外部消息经 Connection/Address/allow-block list/mention policy 验证；外部消息不能提升 agent sandbox/approval policy；provider metadata 非白名单不进 developer context；附件下载受 size/type/path/lifecycle 限制；高权限开发 agent 不绑不可信外部群；不同组织/隐私域用独立 agent。✅
56. **外部 actor 永不直接调内部 primary thread**：经 Gateway + Conversation Membership 治理，外部消息先成 InboxItem 再注入 agent thread。✅
57. **Integrations**：Feishu（飞书）/ Slack / Parall（Teams TODO）。✅

### C7. 观察与运营类
58. **Overview 三视图共享时间范围选择器**：Status / Capacity / Token Usage，可选 1 天/7 天/30 天/自定义范围，前后翻页。今日本地午夜到当前，历史日用完整本地日历日。✅
59. **Status**：当前执行 agents / 等 Owner 的 agents / 当前 backlog / 最近失败 / Connector 问题 / 最近完成的 background work。每个聚合可下钻。✅
60. **Capacity**：执行时间 + 日历非执行代理 + new-work wait p50/p90/max + 当前 backlog oldest age + work source + wait reason + data quality + 稳定证据。**永不排名 agent / 永不自动推荐拆分/合并**。✅
61. **Token Usage**：单日 treemap（每 agent 面积=token 用量）；多日堆叠柱 + agent 趋势。hover/选择显示精确 input/output/cached input/reasoning output/model/calls/期对比。tooltip 不被裁剪容器裁。✅
62. **运行态 Restart lifecycle truthful**：ready / draining（列 active work）/ restarting-reconnecting / complete / failed（带恢复命令）。active Goal 在当前 turn 边界停自动续，新进程启后续，**当前 turn 永不被 interrupt**。✅
63. **按需备份 + active turn 完成后优雅重启**。✅
64. **Activity feed**：跨消息/对话/文件/agent 产出搜索 + Notification/push（可配什么 mention/review 才打断）。✅

### C8. Agent Inbox 类
65. **Agent Inbox = Agent 工作队列（不是 Owner 动作清单）**：零时隐藏，非空时立即出现在 composer 上方。compact summary（总数/source 混合/最老等待时间/handling/failure 信号）+ 详细视图（source/sender/subject/received/wait/state/稳定证据链接）。✅
66. **Agent Inbox 第一版主要观察性**：Owner 可 inspect item / 取消 eligible Owner-originated 工作 / retry interrupted 工作 / 显式关停不再需 handling 的工作。**不支持任意重排或强制插入**。✅
67. **codex tool approval 独立 pending-approval 入口**（不进 Needs You）。✅

### C9. 执行与持久化类
68. **Built ON Codex（不重写 runtime）**：不重写 agent runtime、不复制 thread 历史；把 codex thread 变成 Domain Agent 持续工作区，再加 identity/Profile/Team 关系/有界协调/人类治理/受治理外部交付。✅
69. **CodexHost + 单 codex app-server**：Hub ↔ CodexHost（line-framed JSON-RPC over pipe）↔ codex app-server subprocess（共享单进程所有 agent thread + Remote clients）。✅
70. **thread/resume 幂等每 turn 前执行**：app-server 可卸载 idle thread，turn 前 thread/resume 确保正确状态恢复。✅
71. **Rollout 文件是 thread 历史唯一真相源**：`~/.codex/sessions/**/rollout-*.jsonl`，所有 surface 看同一 thread 完整历史。✅
72. **store 层 + NDJSON ledgers + JSON 文件**：`comms.ndjson`（agent 间消息）/ `events/<id>.ndjson`（per-agent 事件日志）/ `agents.json`（agent 注册表）/ `profiles.json` / `triggers.json` / `~/.codex-loom/context-coverage/<sha256(thread-id)>.json`（coverage ledger）。**位于 `~/.codex-loom`**。✅
73. **commit-before-projection or rollback 原子性**：Agent 配置 / Communication / Inbox/Attempt/Outbox / Integration / Schedule / Human Request / ProviderOperation 等核心聚合用此策略保 durable。`persistRuntimeProjectionLocked` checkpoint 观察到的 codex runtime 态，失败 log 不阻塞 app-server 读循环。✅
74. **Trigger 进程崩溃恢复**：Message 先提交，Trigger 再进 `triggered`；两次提交间退出 → 启动恢复从 `triggerId` 修复 Trigger 不复制消息。✅
75. **Thread control timeout fence**（PR #45）：Thread 控制超时后不安全重试，fence indeterminate timeout。✅

### C10. UI / 跨设备类
76. **Desktop sidebar**：Needs You / Overview / Team / External / Agent directory / 底部 Settings。选 agent 开持久 tab，关 tab 永不 stop/archive/change agent。✅
77. **Agent tab 持久挂载**：全局 workspace 覆盖 content 区时 tab strip 仍挂载，inactive tab 仍收 live status/message event。键盘快捷键切 tab 不重载。✅
78. **顶 work surface 只暴露两个全局信号**：Needs You + 当前执行/idle summary。model/effort/IDs/workspace/runtime 控制留 Agent Inspector。✅
79. **Mobile 无持久底部导航栏**：Thread + composer 占满屏，紧凑 header menu 开 Agent drawer + 同套 Needs You/Overview/Team/External/Settings 目的地。Inspector 全屏。✅
80. **Thread Feed 时间序保留 + 不同事件类区分渲染**：Owner/Agent 对话 / Messages-Inbox-Schedule 引入工作 / Reasoning-Tool Use-Approval-Goal-artifact / compaction-reconnect-interruption-lifecycle。Markdown 渲染，tool call 默认 compact，image inspectable preview，reasoning 永不空 panel。✅
81. **Sending 乐观但真实**：draft 立即成本地 `Sending` → `Sent`/`Queued`/`Failed`，composer 防重复提交，失败恢复 draft。✅
82. **Virtual scroll 保变高行 + 上行阅读位 + per-tab scroll state + 可见 jump-to-latest**。新事件只在已在底时 auto-follow。✅
83. **Agent Inspector**（信息按钮 hover summary + 桌面右侧 / 移动全屏）：Profile（Identity/Domain/Scope/version/显式存）/ Team（parent/Internal/Collaboration）/ External（identities + Conversation roles）/ Schedules / Runtime（model/effort/working dir/sandbox/approval/Remote）/ Usage（带 Overview 过滤链接）。✅
84. **build embedding**：生产 binary 内嵌 WebUI，UI/API 变化必须 `make build`，重启核验 `/api/version` 的 `build.webAsset`，裸 `go build` 不能发布。✅

### C11. 商业 / 治理类
85. **Elastic License 2.0**（非 MIT/Apache）：源码可见 + 可用 + 可改 + 可派生，**但禁第三方提供 hosted/managed service**（含免费托管）+ 禁移除/改 license key 功能 + 禁移除版权/商标/notice。✅（与 Multica「Apache 2.0 + 附加禁托管」同思路，CodexLoom 直接用 Elastic 2.0 标准化）
86. **目标用户明写 OPC**：「Advanced Individuals and One Person Company Owners」+ 明写「企业多租户和通用公司运营不是主方向」。✅
87. **NOTICE + AGENTS.md in repo root**：项目本身用 agent 开发自己（库根 AGENTS.md）。✅
88. **社区 = 飞书群**（非 Discord/Slack）：README Community 节贴飞书加群链接 + QR。✅
89. **codexloom.ai 官网**（中英双语，codexloom.ai/en/ + /zh-cn/）。✅

---

## 2. 核心概念

| 概念 | 是什么 | PM 含义 |
|------|--------|---------|
| **Domain Agent** | 围绕长期领域（非单任务）的 Agent，thread 跨任务复用累积上下文 | **CodexLoom 地基**——与 Task Agent 对照，是「持久身份 + 专长累积」的最小单元 |
| **Task Agent** | 围绕单任务建 thread、交付后弃的 Agent | 反面参照——「Every task pays the cold-start cost again」 |
| **Profile** | Identity / Domain / Scope 三字段，agent 对外协作契约 | **既是 agent 持久方向，又是对其他 agent 的可发现性 + 边界声明**——比我们 PRD「角色=名字+宽能力倾向」多了 Scope（边界/越界声明） |
| **primary Thread** | Agent 的持续工作区，跨任务/turn 累积 | CodexLoom 的「私有记忆」锚点——其他 agent 不 resume 它 |
| **Turn** | 单次执行周期，一个 thread 同时只有一个 active turn | per-thread serialization 的基础 |
| **Goal** | slim persistent thread control，跨 Turn 持续推进的当前成果 | 区别于 Topic（协调记录）和任务（执行单元）——Goal 是 runtime 级 |
| **Organization Map** | 声明 parent/child 责任边界（持久） | 四图分离之一——**结构是声明，不是从 Activity 自动推导** |
| **Collaboration Map** | 声明跨域横向工作关系（稳定接口） | 四图分离之二——**和 Organization 区分**，不让横向协作被误读成层级 |
| **Activity Map** | 从 Messages 派生的有时限证据 | 四图分离之三——**observed 永不变 declared** |
| **Directory** | 精确 Agent 清单 | 四图分离之四——稳定排序，准确扫描 |
| **Topic** | 跨 Turn/天/Agent 的薄共享协调记录 | **不执行工作、不拥有 thread、不替代 Goal**——只是协调记录，与 Multica issue / Paperclip task 性质不同 |
| **AgentMessage** | agent 间 bounded 通信，REQ/RES/NOTIFY 语义 | per-agent queue + turn serialization——CodexLoom 的「多 agent 同台」机制（不是共享 task claim） |
| **Needs You** | Owner 唯一持久动作 inbox，显式 ask-user 请求 | **不是普通 inbox**——只含需要 Owner 的事实/选择/授权 + codex approval + 投递失败 |
| **Trigger** | 外部事实变化唤醒既有工作（重新核验的理由，非结论） | 与 Schedule（时间）/ Message（信息）/ Goal（runtime 推进）严格区分 |
| **Conversation Membership** | Agent 在某外部会话的长期 context + 治理策略 | Interface Agent 的治理单元——purpose/role/guidance/trigger/reply/outbound policy 全显式 |
| **Interface Agent** | 组织的外部边界（可选组织模式非硬编码类型） | 从 governed Membership 接活、路由、请求人类授权——外部 actor 不碰内部 thread |
| **Lead / Internal Agent** | 组织模式（Lead 协调整个 domain + 当公开边界；Internal Agent 负责 subdomain） | 通过 Profile + 声明关系表达，非硬编码——与 Multica #1282 拒绝硬编码 leader **三向独立收敛** |
| **Epoch Context Coverage** | compaction 后下 turn 重新覆盖 durable source + 双证 | **解决长期 thread 膨胀的关键工程化**——compaction 不清零，durable 声明重新注入 |
| **CodexHost** | 持共享单 codex app-server 的进程（Hub 与之 JSON-RPC over pipe） | Built ON Codex 的执行面——所有 agent thread 共享同一 app-server |
| **Rollout** | codex thread 历史唯一真相源（`~/.codex/sessions/**/rollout-*.jsonl`） | 跨 surface 同步的基础——所有 client 看 rollout 同一历史 |
| **`no_reply`** | required message 显式关停（无需实质回复） | **CodexLoom 的「沉默即成功」机制**——与 Raft held draft "Stay silent"、Buzz post-mortem「沉默作为成功条件」**三产品独立收敛** |
| **Local Owner Trust Principle** | 本地单一 trusted Owner 安全模型（PR #56 文档定义） | 不做企业多租户——**一个明确 Owner 对 Agent 身份和边界负责** |

---

## 3. 状态哲学（重点章节）

**状态焊在「Agent 身份 + primary Thread + 治理对象」，不焊在「任务」也不焊在「组织架构图」——这决定它和 Paperclip（焊 issue）、Raft（焊 workspace+channel）、Multica（焊 issue）的品类关系。** ✅

### 3.1 状态三层（与 zh guide + product-design 对齐）

| 状态层 | 焊点 | 谁拥有 | 换了意味着什么 |
|---|---|---|---|
| **Agent 身份**（持续工作关系） | 稳定 ID + Profile（Identity/Domain/Scope）+ primary Thread | Owner 治理，Agent 自身累积 | rename 保稳定 agent+thread identity；Profile 改版本化从下安全 turn 应用；archive 不删 thread 历史 |
| **治理对象**（Message/Topic/Needs You/Trigger/Membership） | store 层 NDJSON ledgers + JSON 文件 + atomic commit | CodexLoom Hub 持 | 持久化 + 可审计 + 可恢复；commit-before-projection or rollback |
| **Thread 历史真相**（runtime 执行轨迹） | codex rollout 文件（`~/.codex/sessions/**/rollout-*.jsonl`） | codex app-server 持 | **CodexLoom 不复制 thread 历史**——rollout 是唯一真相源，CodexLoom 只读不写历史 |

**关键**：CodexLoom 的状态焊点是**「Agent 身份 + 治理对象」在 Loom 这层，runtime 真相在 codex rollout 那层**——这是「Built ON Codex（不重写 runtime）」的状态架构实现。

### 3.2 与我们三层模型（同事/项目/协作）的对照

| 我们三层模型 | CodexLoom 对应 | 异同 |
|---|---|---|
| **同事层**（焊 bot 身份，Grok Bot 哲学） | **Agent 身份 + Profile + primary Thread**（Domain Agent） | **CodexLoom 全中且更深**——Profile 多了 Scope（边界声明），thread 跨任务累积专长（不是 Grok Bot 那种「换记忆=新建 bot」） |
| **项目层**（焊 workspace，Raft/cf-os 哲学） | **Agent working directory + Thread 历史**（codex rollout） | 同：持久工作区；异：CodexLoom 焊在 thread（codex runtime 的）而非独立 workspace 容器 |
| **协作层**（焊关系网+协作状态机，Avernet 哲学） | **Organization/Collaboration/Activity 三图 + Topic + Message 状态机** | **CodexLoom 全中且工程化更深**——四图分离 + Topic 薄协调 + Message per-agent queue + turn serialization |

⚠️ PM 判断：CodexLoom 是这批参考里**和我们三层模型对应最完整的项目**——它在每一层都给了具体工程化（同事层 Profile 三字段 + Epoch Coverage，项目层 thread+rollout，协作层四图+Topic+Message 状态机），不像 Raft 只强在协作层（AX）、不像 Paperclip 只强在项目层（issue 树）。**但它在我们 PRD 第一期「agent 非常驻（按需 spawn）」这条根本处反着选——它把「长期存活 Domain Agent」当第一期地基**。这是 §12.1 的核心分叉。

### 3.3 「组织跟随分化」vs「组织架构图先行」（与所有参考的根本分野）

zh guide 反复强调：「**第一个问题不是『我应该创建多少个 Agent？』，而是『哪些工作需要一个持续的负责人、持续的上下文和专业判断？』**」+「先让一个 Agent 承担工作，直到稳定边界自己出现」+「当组织记录的是真实发生的责任分工，而不是预测一个理想的未来结构时，它更可靠」。

⚠️ 这是 CodexLoom 最具意识形态的产品哲学——**反对一切「先建模组织再派活」**（Paperclip 的 org chart 模板、Multica 的 Squad 预设、Avernet 的关系网先建都是反例）。它要求组织从真实工作里涌现，而不是 Owner 提前画图。**这与我们 PRD 第一期「角色定义（创建/编辑角色，绑定人设 prompt + provider）」直接冲突**——PRD 第一期是「先建角色再派活」，CodexLoom 是「先派活让边界涌现再固化 Profile」。

### 3.4 换成员 / 换 thread / 换组织分别意味着什么

- **换成员（rename Agent）** ✅：保稳定 agent ID + thread identity，只改显示 name。Profile 不变（除非显式改）。这是「name 是 instance，Profile 是 schema」的具体落地。
- **换 thread**（Agent 的 primary thread）⚠️：CodexLoom 不支持「换 thread」——一个 Agent 一个 primary thread，thread 是 Agent 的工作轨迹不可分离。要换 thread 等于新建 Agent。
- **换组织（声明关系变）** ✅：改 Organization/Collaboration 声明，Activity 历史（Message 证据）保留。Observed Activity 永不变 declared 关系。
- **换 Profile（业务边界变）** ✅：Profile version + 1，下安全 turn 应用，Epoch Coverage 下 turn 重注入。
- **archive Agent** ✅：归档不删 thread 历史，runtime 状态置 Unavailable。

### 3.5 状态哲学一句话

**Agent 身份焊稳定 ID+Profile+primary Thread（Owner 治理），治理对象焊 Loom store 层 NDJSON/JSON atomic（Hub 持），runtime 真相焊 codex rollout（codex app-server 持，Loom 只读不写）——三层分离，CodexLoom 是「不重写 runtime」的执行面 + 「治理组织」的控制面。** ✅

---

## 4. 派活与编排交互

### 4.1 Owner 怎么下达工作（按工作类型分协调机制）

zh guide「选择正确的协调机制」表（**CodexLoom 把派活按语义分了 7 种协调机制，不是一句话全派**，✅）：

| 需求 | 用 | 保留什么 |
|---|---|---|
| 与一个 Agent 继续正常工作 | **Agent Thread** | Agent 工作轨迹 |
| 让一个 Agent 继续长时间运行的工作 | **Goal** | runtime 续跑 + 完成状态 |
| 请求另一个 Agent 的领域判断 | **Message** | 请求、回复、投递、因果归属 |
| 获取人的事实、选择、授权 | **Needs You** | 一次持久的人类决定 + 恢复路径 |
| 在已知时间唤醒工作 | **Schedule** | 基于时间的重复 |
| 跨天跨 Agent 共享一件有边界的事项 | **Topic** | 一个 Responsible + 限定 Participants + brief + 等待状态 + 证据链接 |
| 外部事实变化恢复工作 | **Trigger** | 受治理的去重新核验 Provider 状态的理由 |

### 4.2 信息流向（核心设计原则）

zh guide「让信息沿责任与决定权流动」节——这是 CodexLoom 区别于所有「广播式编排」产品的核心：

> **信息流向责任，决定流向权限，结果回到发起者，例外向上升级。**

不同关系不同信息分辨率：
- Owner → Responsible/Lead：为什么做、优先级、成功标准、风险取舍、重大授权
- Responsible → Participant：与 Domain 有关的目标、已确认事实、非目标、稳定对象/版本、验收条件、升级边界
- 专业 Agent 间：高分辨率复现、Artifact、契约、版本、局部问题
- 专业 Agent → Responsible：结果、关键证据、限制、会改变整体范围/依赖/风险/完成条件的事实
- Responsible → Owner：升级真正需要人的事实/选择/授权/不可逆边界，**不倾倒全部专业过程**

**「最小充分分辨率」**：足以让接收方完成自己判断，同时不复制发送方完整专业上下文。这是 CodexLoom 对「转发负担」的产品级解药。

### 4.3 渐进式通信（对模糊问题）

zh guide「对模糊问题使用渐进式通信」节——新颖的方法论：
1. 先提出宽而真实的问题，让接收方用长期 Domain 上下文说明它如何理解现场
2. 对齐术语、事实、边界、未知项
3. 再追问关键案例、反例、证据、责任冲突
4. 最后收敛为选项、决定、升级事项、下一轮实验

**假设**（zh guide 自标 Hypothesis）：这与 LLM 按 token 生成有关——过长过度预设的 prompt 强化发送方错误 framing，让接收方先生成自己的整体理解为下一轮提供自提示支架。**仍需质量/等待/返工/上下文损失验证**。

⚠️ 这是这批参考里**唯一把「通信分辨率 + 渐进式收敛」当产品原则写出来的**——别的产品（Paperclip goal ancestry ≤6、Multica @mention、Raft channel）都没到这个抽象层。

### 4.4 多 agent 同台怎么协作（关键辨析——它做了 AX 硬约束吗？）

**CodexLoom 的多 agent 协作 = per-agent message queue + turn serialization + `no_reply`，不是共享 task claim 锁**：

- **机制**（deepwiki 源证 + README 直证）：
  1. Agent A 在 thread 里用 `loom msg B --from A --subject ... --body ...` 发一条 bounded Message。
  2. Message 进 B 的 per-agent queue。
  3. `deliverNextQueuedForTarget` 检查 B 是否 running turn / 有 activeTurn 没 finished。
  4. B busy → Message 保持 queued，等当前 turn 结束（README「recipient is busy, the message waits until its current turn ends」）。
  5. B idle → Message 投递，进 B 的 thread 当 turn input。
  6. B 的回复（RES）回 A，由 A 整合。
  7. **如果 required message 已处理但无需实质回复 → `loom msg --no-reply MESSAGE_ID` 显式关闭**（防无界 loop）。

- **它做了我们 PRD §5 圆桌 4 条硬约束里的几条？**
  - ✅ **沉默即成功**——`no_reply` 是 CodexLoom 的实现（与 Raft held draft "Stay silent"、Buzz post-mortem「沉默作为成功条件」**三产品独立收敛**，见 §12.5）。
  - ✅ **串行轮次队列**——per-agent queue + turn serialization（一个 target agent 一次处理一条 message），防同秒抢答。
  - ❌ **claim 硬约束**——**没做**。CodexLoom 没有「task 被认领后他人不可重复认领」的概念，因为**它没有 task 作为共享执行单元**（Goal 是 runtime 推进，Topic 是协调记录，Message 是通信）。它不需要 claim 因为它的协作是「A 问 B → B 答 A」点对点，不是「多 agent 抢同一 task」。
  - ❌ **Drop vs Queue 明确**——没做（因为没 task 拒绝/接的场景）。

⚠️ PM 判断：CodexLoom 的多 agent 同台**不是 Raft 那种「共享 room 多 agent 同台」的 AX 问题**——它的协作是**「点对点责任路由」**（A 问 B 的 Domain 判断），不是「多个 agent 在一个共享 context 里同台发言」。所以它不需要 Raft 的 inbox pull / held draft（它是点对点 message，不是共享 room），不需要 Paperclip 的 claim（没有共享 task 抢）。**它走的是另一条路**：用责任路由 + per-agent queue + `no_reply` 解决「多 agent 协作」，而非「多 agent 同台」。这是它和 Raft 的根本分野——**Raft 是「共享 room 多 agent」，CodexLoom 是「点对点责任路由多 agent」**。

### 4.5 Interface Agent 路由（外部协作）

外部消息路由（deepwiki 源证）：External Platform → Gateway connector normalize+dedupe → POST `/api/ingress` InboxMessage → Hub 验证 Connection/Address + allow/block + mention policy → 持久化 InboxItem（queued）→ idle 时 HandlingAttempt reserve → Membership context + `<inbox_message>` XML 注入 agent thread → agent turn → 捕获 final_answer → OutboxItem（reply/no-reply）→ SSE command → Gateway 发回平台 → ack + cleanup。

**Interface Agent 是可选组织模式**——只有当外部关系上下文 + 判断值得一份自己的长期责任时才用；否则一个 Domain Agent 直接持有 governed 外部角色即可。

---

## 5. 记忆与上下文（**对比 Paperclip 成本爆炸 + 印证我们 §8 per-agent 不共享 brain 的关键节**）

### 5.1 primary Thread = Agent 的私有记忆

- **thread = 持续工作区**（不是任务记录）：带交互、决定、工具调用、artifact、反馈，形成工作轨迹。✅
- **thread 跨任务/turn/天复用累积**：cold-start cost 不重复付，专长随反复工作累积（"compounds into expertise"）。✅
- **agent 间不互 resume 对方 primary thread**：协作只走 bounded Messages + Topics + managed Artifacts。✅
- **thread 不便携**（隐式）：换 thread = 换 Agent，一个 Agent 一个 primary thread。✅

### 5.2 compaction 保连续性（**对比 Paperclip 成本爆炸的关键工程化**）

README「Compaction Preserves Continuity」节 + epoch-context-coverage.md 全文：

- **compaction 不清零**：summary + 近期 trajectory 保工作信息。✅
- **stable history prefix 享 prompt caching**：复用 thread 让稳定前缀缓存，不是从头重处理。✅
- **Epoch Context Coverage 重新覆盖 durable source**：compaction 后下一 turn 重新覆盖 Loom Agent Prompt + 完整 Profile + 直接关系快照。✅
- **双证才标 `covered`**：replayable rollout evidence + 同 turn model event。✅
- **at-least-once 非 exactly-once**：重复完整声明安全，漏掉当前声明不安全——保守重发。✅

**对比 Paperclip**：Paperclip 的 goal ancestry ≤6 现拼策略在实战中**把 context 吹到 20-30k**（HN Glemllksdf + GitHub #11253 claude_local 81% thinking_tokens 互证，见 `pm-paperclip-community.md`）。CodexLoom 不走 ancestry 现拼，走**「thread 持续累积 + compaction 保前缀 + Epoch Coverage 重新覆盖 durable」**——这是另一条解 context 膨胀的路。

⚠️ PM 判断：**CodexLoom 的解法是否真的避免了 Paperclip 的成本爆炸，尚无社区实战验证**（项目 5 周龄、361 stars、0 watcher、社区真空，见 §11）。理论上「thread 持续累积」也有累积膨胀风险，但 CodexLoom 用 (a) codex 自己的 compaction 压旧历史 (b) Epoch Coverage 只保证 durable source（Prompt/Profile/关系快照，体积 bounded 128 KiB）(c) prompt caching 省前缀处理——三重控制。**这是比 Paperclip ancestry ≤6 更工程化的方案**，但需真实长会话验证才能下定论（呼应 `docs/research/claude-replay-performance.md` 我们自己的长会话回放问题）。

### 5.3 不共享 brain（与 Raft「You Don't Need a Company Brain」同源）

- **Agent 不互读对方 thread**：协作走 message，不走读记忆。✅
- **Profile 是协作契约不是共享记忆**：Profile 暴露 owns 什么/什么问题找它/什么越界，但不暴露完整工作史。✅
- **Topic 是薄协调记录不是共享 session**：Topic 不携带其他 Agent 完整 session 或全历史，参与者在自己 thread 干专业工作。✅

✅ **CodexLoom 与 Raft 在「per-agent memory 不共享 brain」上独立收敛**（与 opc-product-discussion.md §4「角色记忆：per-agent 不共享 brain（Raft 核心修正）」、PRD §8「不做共享记忆池」**三向印证**）。

### 5.4 memory 不止 thread（隐式 tacit context）

README「Why Long-Lived Domain Agents」末段：
> A long-lived thread also accumulates tacit context that is difficult to reconstruct in a single prompt. Corrections, preferences, terminology, judgment, and collaboration habits enter the thread through repeated work and are refined across successive compactions. They may not belong as individual rules in a Profile, but together they create a working understanding unique to that agent. Starting a new thread loses precisely this knowledge that is hardest to migrate explicitly.

⚠️ PM 推断：这是 CodexLoom 对「为什么长期 thread 比长期 Profile 更重要」的最深论证——**tacit context（纠正/偏好/术语/判断/协作习惯）只能通过反复工作进 thread，跨 compaction 提炼，不能单 prompt 重建**。这正是 Raft「name 是 instance 带 history」+ todos.dev「per-agent Memory ≤100 bounded curation」想抓但没抓清的——**长期 thread 是 tacit context 的载体，Profile 只是显式声明的载体**。

---

## 6. 审批与介入（Needs You 决策机制）

### 6.1 Needs You = Owner 唯一持久动作 inbox

- **仅含**：显式 ask-user 请求（事实/选择/授权）+ Codex approval（独立 pending-approval 入口）+ blocked decisions + Owner 答案投递失败。✅
- **不含**：普通活动 / 外部 Inbox / 完成通知 / 通用 Connector 健康。✅
- **silent stall 不自动建 Needs You**（已知边界，issue #47/#48 在改）。✅
- **排序**：blocking required requests → approvals → optional requests → time。✅
- **dismissal 必须声明**：no-answer / deferred / cancelled。✅

### 6.2 「surface problems, don't silently fix」与 Paperclip 同源

- **agent 遇 blocker 不自己绕**：停下用 Needs You 显式问 Owner。✅
- **agent 显式识别**确需人的事实/选择/授权 → `loom ask-user` 创建请求。✅
- **zh guide**：「不要问每一条输出看起来是否重要，而要问它完成了谁的工作、这个结果应该回到哪里」——Owner 不该被转发负担淹没。✅

### 6.3 过程管理 vs 结果管理（新颖的审批光谱）

zh guide「选择过程管理还是结果管理」节——**审批不是二元开关，是按工作成熟度滑动的光谱**：

| 情况 | 管理方式 | Owner/Lead 关注 |
|---|---|---|
| 新 Domain、目标模糊、能力未验证、强跨域依赖 | **过程管理** | 共同澄清问题、检查关键步骤、缩短反馈距离 |
| 目标和验收清楚，过程已外化并被反复遵守 | **结果管理** | 目标、边界、结果、证据、例外升级 |
| 生产写入、外部承诺、敏感信息、不可逆状态变化 | **提高过程可见度 + 设置门禁** | 授权、停止条件、回滚、独立复核 |
| 成熟流程中的普通工作 | **结果管理 + 定期抽查过程** | 是否持续达标，规范是否仍有效 |

**已验证实践**：「转向结果管理不等于停止观察过程。日常看结果，异常时下钻过程，定期抽样复盘；当规范失效、风险升高或 Agent 开始偏离时，再暂时回到过程管理。」

⚠️ 这是这批参考里**唯一把审批做成「按工作成熟度滑动的光谱」的**——Raft verification gate 是「builder≠verifier 责任矩阵」，Paperclip executionPolicy 是「review+approval 双阶段」，Avernet 是「状态机三段」，都是**固定结构**。CodexLoom 的「过程↔结果滑动」是另一种抽象——**它承认同一个 agent 同一类工作应随成熟度变管理方式**，不是一刀切。这是对 PRD §7 决策 2「agent 不能自己标完成」的更细颗粒度补充。

### 6.4 Owner 介入粒度

- **Topic send**：从 Topic 发范围/分工变化给 Responsible。✅
- **Topic intervene**：从 Topic Active work 打开 Participant 当前 active turn 做 steer/interrupt（只作用于精确 active turn，无 active turn 拒绝）。✅
- **Agent thread 直接发**：在 Agent workspace 给目标。✅
- **interrupt 留审计记录 + 通知 Responsible**：不自动改 Topic 状态/范围/Participant responsibility/长期组织关系。✅

---

## 7. 执行与持久（Built ON Codex 的 CodexHost + app-server JSON-RPC）

### 7.1 三层进程模型

- **Hub Orchestrator**（`internal/hub/hub.go`）：中央协调，reconcile 期望态 vs CodexHost 实时态。管 agent 生命周期（create/rename/archive）+ 事件分发（SSE 给 WebUI/CLI）+ interactive tool approval。✅
- **CodexHost**（`internal/codex`）：持共享单 codex app-server subprocess（line-framed JSON-RPC over pipe）。所有 Agent thread + Remote clients 用同一 app-server。✅
- **Gateway Connectors**（`gateway/`）：独立长跑进程，连 Hub（SSE/HTTP）+ 连外部平台（Feishu/Slack/Parall webhook/websocket）。✅

### 7.2 thread/resume + rollout 真相源

- **thread/resume 幂等每 turn 前执行**：app-server 可卸载 idle thread，turn 前 thread/resume 确保正确状态恢复。✅
- **rollout 文件是 thread 历史唯一真相源**（`~/.codex/sessions/**/rollout-*.jsonl`）：CodexLoom 只读不写历史，所有 surface 看 rollout 同一历史。✅
- **thread/inject_items 注入 Developer context**：原生 role=developer message，不伪装 user，不触发新 turn。✅
- **turn/start 启动执行**：绑定 attempt 到真实 turn ID。✅

### 7.3 store 层持久化

- **NDJSON ledgers**：`comms.ndjson`（agent 间消息）/ `events/<id>.ndjson`（per-agent 事件日志）。✅
- **JSON 文件**：`agents.json`（注册表）/ `profiles.json` / `triggers.json` / `~/.codex-loom/context-coverage/<sha256(thread-id)>.json`（coverage ledger）。✅
- **commit-before-projection or rollback 原子性**：Agent 配置/Communication/Inbox-Attempt-Outbox/Integration/Schedule/Human Request/ProviderOperation 等核心聚合。✅
- **`persistRuntimeProjectionLocked`**：checkpoint 观察到的 codex runtime 态，失败 log 不阻塞 app-server 读循环。✅

### 7.4 local-first + self-hosted

- **`make release && ./bin/codex-loom`**：本地拉起 Hub + 内嵌 WebUI（localhost:4870）。✅
- **需装 codex CLI + ChatGPT 登录**。✅
- **macOS 原生**（Keychain + launchd）；Windows 原生未做（issue #2，M0 里程碑缩窄，架构利好：Hub+CLI 是 Go，WebUI 嵌 Hub 本地 HTTP/SSE，Hub 启 codex app-server）。✅
- **生产 binary 内嵌 WebUI**：`make build`（非裸 `go build`），重启核验 `/api/version` `build.webAsset`。✅

### 7.5 持续运营

- **Schedules** + **durable external Triggers**（GitHub PR/workflow-run adapter，polling 30s）+ **全局运行态** + **按需备份** + **active turns 完成后优雅重启**（active Goal 在当前 turn 边界停自动续，新进程后续）。✅

⚠️ **OPC 启示**：CodexLoom 的「Hub ↔ CodexHost JSON-RPC ↔ codex app-server」三层与 agents-remote 的「Bun 服务端 ↔ claude runtime ↔ Claude CLI stream-json」**结构同构**（都是「控制面 ↔ 执行面桥 ↔ 底层 CLI runtime」），但 CodexLoom 的 CodexHost 用 **codex app-server JSON-RPC**（codex 官方的进程间协议），agents-remote 的 claude 用 **stream-json stdio**（Claude CLI 的无头协议）。**CodexLoom 的 CodexHost 是我们 Codex 对接待办的工程参考**（我们 PRD §7 决策 5「Codex 角色人设注入先降级处理」+ CLAUDE.md 已记 Codex 对接待办）。详见 §12.6。

---

## 8. 商业模式与定位

### 8.1 Elastic License 2.0（非 MIT/Apache）

LICENSE 文件原文是 **Elastic License 2.0**（GitHub API 报 NOASSERTION 因为它不是 OSI 标准许可证）：

- **允许**：源码可见 + 用 + 改 + 派生 + 自托管（含组织内部多 workspace）。
- **禁止**：① 第三方提供 hosted/managed service（含免费托管——「A publicly accessible instance operated for users outside your own organization requires a commercial license even when it is offered free of charge」是 Multica 措辞，CodexLoom 用标准 Elastic 2.0 同效）；② 移除/改/绕 license key 功能；③ 移除/模糊版权/商标/notice。

⚠️ 与 Multica License 同思路（禁 SaaS 化竞品 + 允许自托管 fork），但 CodexLoom 用**标准 Elastic 2.0**（更成熟、法律文本标准化）而非 Multica 那种「Apache 2.0 基底 + Part I 附加」自撰条款。**对 OPC 启示**：agents-remote 若开源需选 license——MIT/Apache 2.0 完全开放 vs Elastic 2.0/Multica 式「源码可见禁托管」是两条路。CodexLoom 选 Elastic 2.0 说明「**禁别人拿你代码做 SaaS 但允许自托管**」是个人 agent 项目的主流选择（保护个人作者的潜在商业化）。

### 8.2 目标用户明写 OPC

README「Who Is It For」节 + zh guide 全文：
- **「Advanced Individuals and One Person Company Owners」**——明文写 OPC。✅
- 「CodexLoom currently serves one advanced individual Owner first. Enterprise multi-tenant administration and general company operations are not the primary product direction.」✅
- 「高级个人不等于独自工作」——Owner 可以身处公司/团队，把 Agent 以受治理外部身份带入飞书/Slack 让同事协作，但产品**不变**成企业多租户管理系统。✅

### 8.3 商业化迹象

- **无 release、无定价页、无付费计划**：仓库无 Pricing。✅
- **codexloom.ai 官网**（中英双语，codexloom.ai/en/ + /zh-cn/）。✅
- **飞书社区**（非 Discord/Slack）。✅
- ⚠️ 推断：CodexLoom 处于**「成熟个人项目 + 飞书中文社区 + 官网但未商业化」**阶段——Elastic 2.0 license 保护潜在商业化路径（若做托管/Pro 版可走商业 license），但当前纯 OSS 增长导向（且只 361 stars）。

### 8.4 作者可持续性判断

- **yan5xu（Yanwu）**：2013 注册，216 followers，34 repos。✅
- **长期围绕「中文 AI agent / 语音 / 知识」主题**：`ququ` 2260 stars（中文 Wispr Flow 替代）+ `code-relay` 297 stars（AI Coding Agent 工作协议 — 跨会话记忆、多仓库全局视野，**与 CodexLoom 概念同源**）+ `oh-my-ai-company` 81 stars（AI 公司图谱）+ `scout` 121 stars（Roo Code 实验 Agent）+ `memex` 21 stars。✅
- **commit 频率**：5 周龄 122 commits **全部 by yan5xu**（contributors=1，纯单人项目），但 commit message 高度结构化（`l2a: durable rollback intent...` / `runtime: connect Lark launch plans...`）+ PR 编号到 #68（含 5 个外部 PR：otterpal/Hiwoniu/Ray0907/qq788538-dotcom/luojiyin1987）。✅
- **运营成熟度**：issue #41 Keychain 事故 + launchd crash loop + fail-closed migration + proof + rollback——**像生产系统一样运营**（不是 toy 项目）。✅

### 8.5 社区信号（关键裁决）

⚠️ **关键裁决：CodexLoom 是「源码可读、文档巨量、社区真空」的项目**——与 Avernet「社区真空」同形，但**比 Avernet 文档更完整、运营更成熟、作者作品史更聚焦**：

| 维度 | CodexLoom | Avernet（对照） | Paperclip（对照） |
|---|---|---|---|
| stars / watchers | 361 / **0** | 453 / 2 | 77,593 / 380 |
| 外部 issue | **4 个**（MrCoder/zilonghe/Hiwoniu×2） | 90%+ 内部自产自销 | 高度分散真实 |
| 外部 PR | 5 个（otterpal/Hiwoniu/Ray0907/qq788538×4/luojiyin1987） | 几乎纯内部 | 长尾真实 |
| HN | **1 帖 1 pt 0 评论**（simonpure 提交 story_49159174） | 零 | 真实讨论 |
| Reddit/V2EX/中文社区 | firecrawl 搜零 | 零 | 3 子版 + 3 博客 |
| 独立阵地 | 仅飞书群 | 零 | 3 子版 |
| 文档体量 | **30 docs 文件，含 483 行 canonical zh guide** | 中 | 大 |
| author 作品史 | **code-relay/ququ/oh-my-ai-company 同主题聚焦** | 蚂蚁 backed | @dotta pseudonymous |

**判断**（⚠️ PM 推断）：CodexLoom 的 361 stars + 0 watcher 严重倒挂，比 Avernet（453/2）更极端——**它几乎是「作者一人深度打磨 + 极小中文圈围观」的形态**。但它的**文档质量、运营成熟度、作者作品史聚焦度**都远超 Avernet：这不是大厂背书的早期项目（Avernet 是蚂蚁 backed），是**一个资深中文个人开发者把自己多年 agent 思考（code-relay/oh-my-ai-company）的集大成产品化**。**值得深度学习源码/文档/设计哲学**（社区真空不妨碍它是好老师），**但不构成短期商业化威胁**（社区太小、Elastic 2.0 禁托管、单作者）。

---

## 9. 对 OPC 多 Agent 编排的启示（重点节，§12 必答十问）

> 对照 `../design/opc-product-discussion.md` 三层模型 + §5 编排老师拼图 + §9 单品爆款 vs 编排平台分野 + PRD 角色/任务/房间/看板/记忆/agentmore 六概念。

### 9.0 品类裁决——**编排平台**（最强编排老师之一），且是「**OPC 形态编排平台**」的首次完整产品化

CodexLoom 属于 §9「**编排平台**」品类，与 Raft / todos.dev / Avernet / Buzz / Paperclip / Multica / Superset 同道——**它让用户搭/管多个 agent 协作**。但它有三个独特定位：

1. **唯一明文锁 OPC 当目标用户** ✅——其他编排平台（Raft 团队、Paperclip 公司、Multica 小团队、todos.dev 个人但无 IM）都没明写 OPC，CodexLoom 直接锁。
2. **唯一把「不重写 runtime」做意识形态** ✅——README 反复强调「Built ON Codex」「不重写 agent runtime、不复制 thread 历史」。
3. **唯一把「组织从工作涌现」当产品哲学** ✅——反对一切「先建模组织再派活」。

**它在 §5 编排老师拼图里的位置**：**最强的「组织化 agent」老师之一**——与 Paperclip（层级编排）对照，CodexLoom 是「**责任路由编排**」（点对点 message + Topic 协调，非层级 delegation）；与 Raft（共享 room 多 agent）对照，CodexLoom 是「**点对点责任路由多 agent**」（不共享 room）。它进 §5 编排老师拼图，且在多个子能力上是新老师（见 §12）。

**它不是单品爆款**——它有 Message 状态机、Topic 协调、四图分离、Interface Agent 外部治理、Epoch Context Coverage——这些都是编排子能力，不是「一个固定高能力 agent + 一项杀手锏」的单品形态。

### §12 必答问题逐条

### 12.1 ★ Domain Agent vs Task Agent，谁的设计更对？（**决定我们第一期要不要上持久 thread 的关键证据**）

**结论**：**两者都对，但服务不同场景——CodexLoom 的 Domain Agent 解决「cold-start cost + tacit context」，我们 PRD 第一期的 Task Agent 解决「轻量启动 + 不锁死组织」——分叉合理，但 CodexLoom 给了我们「第二期持久化」的最完整工程化参考，且 Epoch Context Coverage 可能让我们提前安全上持久 thread。**

证据：
- **CodexLoom 的 Domain Agent 解了真痛点**（✅ README 直证）：
  - cold-start cost 不重复付（"Every task pays the cold-start cost again" 反义）。
  - stable history prefix 享 prompt caching（不是从头重处理）。
  - tacit context（纠正/偏好/术语/判断/协作习惯）只能通过反复工作进 thread，跨 compaction 提炼——这是「单 prompt 不可重建」的知识。
- **我们 PRD 第一期选 Task Agent 的理由仍成立**（⚠️ PRD 现状）：
  - 第一期先跑通「角色+任务+看板」单 agent 多角色用法（PRD §7 决策 1）。
  - agent 非常驻是主流（opc-product-discussion.md §7 共性 ②）——但 CodexLoom 的 Domain Agent 是**例外**：它非常驻进程（CodexHost 是常驻但 agent turn 按需），**只常驻 thread（rollout）+ Profile + 治理对象**。
  - 不锁死组织（CodexLoom 自己也反对「先建模组织」，但它把「组织从工作涌现」做成了 Profile 演化）。
- **Epoch Context Coverage 解决了我们担心的「持久 context 膨胀」**（✅ epoch 文档直证）：
  - 我们之前担心持久 thread = Paperclip 成本爆炸（goal ancestry ≤6 吹到 20-30k）。
  - CodexLoom 不走 ancestry 现拼，走「thread 持续累积 + compaction 保前缀 + Epoch Coverage 重新覆盖 durable source（Prompt/Profile/关系 bounded 128 KiB）+ prompt caching」三重控制。
  - **这给了我们「提前安全上持久 thread」的工程路径**——不是「第一期就上」，而是「第二期持久化时抄 Epoch Context Coverage」。

**对照 PRD**：
- PRD §5 第一期「agent 自动起一个带人设的 Claude，开干」+ §7 决策 1「第一期只做角色+任务+看板」→ **Task Agent 模型**（thread 按任务起，交付后弃）。
- PRD §5 后续「长记忆：跨任务/跨房间记住上下文」+ §9 演进路线「后续 长记忆（向量检索）」→ **向 Domain Agent 演化**（但 PRD 用向量检索，CodexLoom 用 thread 持久 + compaction + Epoch Coverage）。

⚠️ **关键启示（给 PRD）**：
1. **第一期不上持久 thread 是合理的**（Task Agent 轻量启动），但**第二期持久化时不要只想到向量检索**——CodexLoom 的「thread 持久 + compaction + Epoch Coverage durable 重注入」是另一条路，且更贴近「agent 有持续工作轨迹」的语义（向量检索是「跨任务召回」，thread 持久是「同一 agent 工作轨迹延续」，两者不等价）。
2. **「持久 thread」≠「常驻进程」**——CodexLoom 的 CodexHost 常驻但 agent turn 按需，thread 是 rollout 文件持久（不是进程常驻）。我们之前在 opc-product-discussion.md §9 把 Grok Bot 的「常驻 VM」当反面，但 CodexLoom 的「常驻 Hub + 按需 turn + 持久 rollout」是**第三条路**——可以「持久」不「常驻」。这条修正我们的二元（按需 vs 常驻）为三元（按需 spawn / 常驻 VM / **常驻 Hub + 持久 thread + 按需 turn**）。
3. **Epoch Context Coverage 的双证机制（replayable rollout evidence + 同 turn model event）可直接抄解决我们 `docs/research/claude-replay-performance.md` 长会话回放上下文压缩问题**——见 §12.9。

### 12.2 Profile = Identity/Domain/Scope，vs 我们「角色 = 名字 + 宽能力倾向」——**要补 Scope 这一层**

**结论**：✅ **强烈建议补 Scope**。CodexLoom 的 Profile 三字段比我们 PRD「角色 = 名字 + 宽能力倾向」多了 **Scope（边界/越界声明）**，且 Profile 是「对其他 agent 的可发现性 + 协作契约」。这一层直接补我们 PRD §4「偏出强项时说明」的工程化。

证据：
- **CodexLoom Profile 三字段**（zh guide + agent-profile.md，✅）：
  - Identity：长期身份（"CodexLoom 的长期产品工程维护者"，不重复 name，不写模型版本，不塑造人格）。
  - Domain：长期领域（业务对象/系统边界/持续问题，**不是技能列表**——"会 Go/React" 是技能不是 Domain）。
  - **Scope**：负责什么 + 决策边界 + **明确不负责什么** + 什么交出去 + 外部系统/高风险动作交谁。
- **Profile = 协作契约**（✅）：让新 agent 看 Profile 就能判断「遇到什么问题找谁」「什么不该默认由它处理」。
- **Profile 写作四测试**（✅）：时间测试（三个月后仍成立？）/ 路由测试（新 agent 知道什么找它？）/ 边界测试（团队知道什么不归它？）/ 频率测试（每 turn 都变的不属 Profile）。

**对照 PRD**：
- PRD §4 角色定义「名字 + 宽能力倾向（不是固定职能岗位）」+ opc-product-discussion.md §4「角色 = 人设 + 模型 + 思考级别 + 持久工作区 + 长效记忆」。
- ⚠️ **缺口**：我们没显式「Scope（边界/越界声明）」。CodexLoom 的 Scope 直接补 opc-product-discussion.md §4「偏出强项时说明」——**把「偏出强项时说明」从行为规则升级为 Profile 字段**，让协作契约显式化。

⚠️ **OPC 建议**：PRD 第一期角色定义加 Scope 字段（哪怕可选/可空）。这不增加多少复杂度（一个字段），但让「协作契约」从隐式变显式。CodexLoom 自己说「三字段都允许为空，系统不会因 Profile 不完整阻止 Agent 创建」——轻量。

### 12.3 Organization/Collaboration/Activity 四图分离——**给我们第二期圆桌 UI 的关键启示**

**结论**：✅ **强烈建议第二期圆桌 UI 抄四图分离**。CodexLoom 的「Organization（持久层级）vs Collaboration（跨域横向）vs Activity（时限证据）vs Directory（精确清单）」分离，直接解我们 opc-product-discussion.md §10 待定「协作状态机第一期做不做」+ 第二期圆桌 UI 怎么不混淆的问题。

证据：
- **CodexLoom 四图**（product-design.md，✅）：
  - **Directory**：精确 Agent 清单，稳定排序，准确扫描当前 status/name/Domain/组织位置/Needs You/Inbox/External 存在。
  - **Organization**：声明 parent/child 责任边界（持久）。
  - **Collaboration**：声明跨域横向工作关系（稳定接口，**不让横向被误读成层级**）。
  - **Activity**：从 Messages 派生的有时限证据（**observed 永不变 declared**）。
- **关键铁律**：Observed Activity 永不自动变声明关系；External role 不算 Team 关系；graph 节点可拖拽持久位置但 graph 手势不改关系语义；关系变化用显式表单。
- **默认开 Directory 不开 Graph**——稳定排序优先于 graph 可视化。

**对照 PRD**：
- PRD §5 第二期「房间 = 圆桌（多角色 + 你坐一起讨论）」+ opc-product-discussion.md §10 待定「协作状态机第一期做不做」。
- ⚠️ **问题**：我们之前倾向「第二期圆桌 UI = 一个共享 room」，但没区分「声明关系」vs「时限协作证据」——容易把临时协作误读成永久组织关系（Paperclip org chart 的坑）。
- ✅ **CodexLoom 的解药**：四图分离。我们第二期圆桌 UI 至少要分「**声明关系层**（哪些角色长期协作）vs **活动证据层**（这次圆桌谁说了什么）」——不让圆桌临时协作污染长期组织声明。

⚠️ **OPC 建议**：第二期圆桌 UI 抄 CodexLoom 的「声明 vs 活动」分离原则。圆桌讨论是 Activity（时限证据），讨论结束不应该自动变 Organization（持久关系）——只有 Owner 显式确认才固化。

### 12.4 Lead/Internal Agent/Interface Agent 是组织模式不是硬编码类型——**与 Multica #1282 + 我们 §7 共性「不写死职能」三向独立收敛**

**结论**：✅ **CodexLoom 用 Profile + 声明关系表达组织模式，比我们现在的设计更具体，可抄「用 Profile + Relationship 表达 Lead/Internal」**。

证据：
- **CodexLoom 明文**（README，✅）：「Lead, Internal Agent, and Interface Agent are useful organization patterns, **not hard-coded Agent types**. They are currently expressed through Profiles, declared relationships, Messages, and Conversation Memberships.」
- **Multica #1282**（`pm-multica-community.md` 走查源证，✅）：maintainer `Bohan-J`「Team workflows vary a lot, if we pick one shape everyone else has to bend their process」——拒绝硬编码 project leader。
- **我们 PRD**（opc-product-discussion.md §7 共性 ④ + §4「角色不写死职能」）：固定职能 persona 是坑（Buzz 退役警示）。

✅ **三向独立收敛**：CodexLoom（中文个人项目）/ Multica（中文团队项目）/ 我们 PRD——三个独立项目独立得出「**组织模式不硬编码**」结论。这比任何单一项目的证据都强——**是品类共识**。

⚠️ **OPC 启示**：我们 PRD 第一期不做团队（leader+成员留后续），但**第二期做团队时**不要硬编码 leader/executor 类型——抄 CodexLoom「Profile + 声明关系表达」。具体：leader 是「有 declares-coordinates 关系的 agent」，不是「type=leader 的 agent」。这让组织形态可演化（同一 agent 可在不同 Topic 当 Responsible 也可当 Participant）。

### 12.5 ★ claim / 串行 / 沉默这类多 agent 同台硬约束，CodexLoom 做了吗？

**结论**：✅ **做了 2 条（沉默 + 串行），没做 claim 和 Drop vs Queue——但它走的是「点对点责任路由」另一条路，不是 Raft 的「共享 room 同台」**。

证据：
- ✅ **沉默即成功**——`loom msg --no-reply MESSAGE_ID --from SELF` 显式关停 required message（防无界 loop）。**与 Raft held draft "Stay silent"、Buzz post-mortem「沉默作为成功条件」三产品独立收敛**（opc-product-discussion.md §7 共性 ⑨ 已记 Buzz+Raft 双收敛，CodexLoom 是**第三个独立收敛**）。
- ✅ **串行轮次队列**——per-agent message queue + turn serialization（一个 target agent 一次处理一条 message，`deliverNextQueuedForTarget` + `isBusyErr` → reset queued）。README 直证「recipient is busy, the message waits until its current turn ends」。
- ❌ **claim 硬约束**——没做。CodexLoom 没有「task 被认领后他人不可重复认领」概念，**因为它没有 task 作为共享执行单元**（Goal 是 runtime 推进，Topic 是协调记录，Message 是通信）。它不需要 claim 因为它的协作是「A 问 B → B 答 A」点对点，不是「多 agent 抢同一 task」。
- ❌ **Drop vs Queue 明确**——没做（因为没 task 拒绝/接场景）。

**关键裁决**：CodexLoom 的多 agent 同台**不是 Raft 那种「共享 room 多 agent 同台」的 AX 问题**——它的协作是「**点对点责任路由**」（A 问 B 的 Domain 判断），不是「多 agent 在共享 context 同台发言」。所以它不需要 Raft 的 inbox pull / held draft（点对点 message 不存在「共享 room 噪音」），不需要 Paperclip 的 claim（没有共享 task 抢）。**它走另一条路**：责任路由 + per-agent queue + `no_reply`。

**对照 PRD §5 圆桌 4 条硬约束**：
| 硬约束 | CodexLoom | Raft | 我们 PRD |
|---|---|---|---|
| 沉默即成功 | ✅ `no_reply` | ✅ held draft "Stay silent" | ✅ §5（Buzz+Raft 独立收敛） |
| 串行轮次队列 | ✅ per-agent queue + turn serialization | ✅ counting game | ✅ §5 |
| claim 硬约束 | ❌（无 task 共享单元） | ✅ task claim | ✅ §5 |
| Drop vs Queue | ❌（无拒绝场景） | ❌ | ✅ §5 |

⚠️ **OPC 启示**：CodexLoom 印证「沉默 + 串行」是品类共识（三产品独立收敛），但 **claim 和 Drop vs Queue 是「共享 task 场景」特有**——CodexLoom 没共享 task 所以不需要。我们 PRD 第二期圆桌如果做「多 agent 抁同一 task」就要 claim，如果走「点对点责任路由」（CodexLoom 模式）就不需要。**这是设计选择，不是缺漏**。

### 12.6 ★ Built ON Codex（不重写 runtime）vs 我们「不重写现有 agent 运行时」——**完全同构 + CodexHost 给我们 Codex 对接工程借鉴**

**结论**：✅ **完全同构**。CodexLoom 怎么把 Codex thread「变成」Domain Agent 工作区的——CodexHost + codex app-server JSON-RPC 这套，**对我们 claude-runtime 的 Codex 对接有直接工程借鉴**。

证据：
- **CodexLoom 三层**（deepwiki + handbook，✅）：
  - Hub Orchestrator（控制面，agent 生命周期 + 事件分发 + approval）。
  - CodexHost（执行面桥，line-framed JSON-RPC over pipe ↔ codex app-server subprocess）。
  - codex app-server（底层 CLI runtime，所有 agent thread 共享单进程）。
- **「不重写 runtime」实现**（✅）：
  - 不重写 agent runtime（用 codex app-server）。
  - 不复制 thread 历史（rollout 文件是唯一真相源，CodexLoom 只读）。
  - 把 codex thread「变成」Domain Agent 工作区 = 在 codex thread 之上加 identity/Profile/Team 关系/有界协调/人类治理/受治理外部交付。
- **thread/resume 幂等每 turn 前执行**（✅）：app-server 可卸载 idle thread，turn 前 thread/resume 确保正确状态恢复。
- **thread/inject_items 注入 Developer context**（✅）：原生 role=developer message，不伪装 user，不触发新 turn。

**对照 agents-remote**：
- agents-remote 三层：Bun 服务端（控制面）↔ claude-runtime（执行面桥，stream-json stdio）↔ Claude CLI（底层 runtime）。
- **结构同构**：控制面 ↔ 执行面桥 ↔ 底层 CLI runtime。
- **协议差异**：CodexLoom 用 **codex app-server JSON-RPC**（codex 官方进程间协议），agents-remote 用 **stream-json stdio**（Claude CLI 无头协议）。

⚠️ **OPC 启示（直接工程借鉴）**：
1. **Codex 对接待办**（CLAUDE.md 已记 + PRD §7 决策 5）：agents-remote 的 Codex 对接可抄 CodexLoom 的 **CodexHost 设计**——`internal/codex` 提供 JSON-RPC client ↔ codex app-server，`thread/resume` + `thread/inject_items` + `turn/start` 三件套。**CodexLoom 已经把 codex app-server 协议吃透了**（`docs/codex-app-server-protocol.md` 11KB），是我们的现成协议参考。
2. **Developer context 注入**：CodexLoom 的「Prompt + Profile 渲染成原子 `<loom_developer_context>` XML，用 `thread/inject_items` 注入原生 role=developer message」——这是「把人设/规则注入 agent」的干净工程模式。agents-remote 的 claude 用 stream-json 的 system message 注入，CodexLoom 用 codex app-server 的 developer role message 注入——**两套协议两种注入方式，CodexLoom 给了 codex 侧的现成范式**。
3. **rollout 文件是真相源**：agents-remote 的 claude 用 JSONL session 文件当真相源（见 `docs/design/message-replay.md`），CodexLoom 用 codex rollout 文件——**同构**，可对照 rollout 解析方式。

### 12.7 ★ 治理外部交付 / Interface Agent——**我们完全没设计的维度，要做「agent 对外服务面」可抄**

**结论**：⚠️ **这是我们完全没设计的维度**。Interface Agent 作「组织的外部边界」——OPC 第一期可不做（纯内部编排），但**第二期/后续若做「agent 对外服务面」是直接参考**。

证据：
- **Interface Agent**（zh guide + product-design，✅）：从 governed Conversation Membership 接活、澄清边界、路由 scoped 工作给 Domain Agent、需时请求人类授权、在策略+授权允许时返回结果给原 conversation。
- **Conversation Membership 治理字段**（✅）：purpose / role / guidance / triggerPolicy（mention/direct/dispatch）/ replyPolicy（final_answer 映射）/ outboundPolicy（reply_only/proactive/none）/ trustDomain。
- **核心铁律**：**外部 actor 不直接调内部 primary thread**——所有外部交互经 Gateway + Conversation Membership 治理；凭证不进 agent（credentialRef 只能引用 env:/keychain）；外部消息不能提升 agent sandbox/approval policy。
- **飞书/Slack/Parall 三个 adapter**（✅）：Gateway 独立长跑进程，normalize+dedupe → POST `/api/ingress` → Hub 验证 → 持久化 InboxItem → 注入 Membership context + `<inbox_message>` XML → agent turn → 捕获 final_answer → OutboxItem → SSE command → Gateway 发回平台。

**对照 PRD**：
- PRD §6 第一期「角色定义 + 任务下发 + 看板 + 审批闭环」——**纯内部编排，无对外服务面**。
- PRD §9 演进路线——后续「团队」「长记忆」「Cloudflare 迁移」，**也没明确「agent 对外服务面」**。

⚠️ **OPC 启示**：
1. **第一期不做是对的**——OPC 第一期先把内部编排（同事+项目+协作）跑通，对外服务面是后续。
2. **但「OPC 终极目标」要考虑对外**——opc-product-discussion.md §1「一个人通过编排多个 AI agent，完成传统需要一个团队的工作量」隐含「agent 替 Owner 对外服务」（如对外答疑、客户支持、协作）。CodexLoom 的 Interface Agent + Conversation Membership 是这个终极形态的现成设计。
3. **conversation-membership.md + agent-platform-integration.md 是直接抄的工程参考**——我们后续做「agent 对外服务面」时，CodexLoom 的治理字段（triggerPolicy/replyPolicy/outboundPolicy/trustDomain）+ 凭证隔离 + 外部 actor 不碰内部 thread 是**已验证的设计契约**。

### 12.8 ★ CodexLoom 是编排平台还是单品爆款？

**结论**：✅ **编排平台**，且是「**OPC 形态编排平台**」的首次完整产品化。但它建立在 Codex 上 + 单 provider，**有「单 provider 锁定」的潜在弱点**。

证据：
- **是编排平台的证据**（✅）：
  - 多 agent（Domain Agent 团队）+ 组织（四图分离）+ 协作（Message/Topic/Needs You 状态机）+ 治理（Profile/Conversation Membership）+ 外部交付（Interface Agent）。
  - 这些都是编排子能力，不是「一个固定高能力 agent + 一项杀手锏」的单品形态。
- **进 §5 编排老师拼图**（✅）：在「点对点责任路由编排」子能力上是新老师（与 Raft「共享 room 编排」、Paperclip「层级 delegation 编排」并列三种编排范式）。
- **不进 §9 单品爆款**（✅）：它不是 Grok Bot/OpenClaw/Hermes/OpenMausBot 那种「单 provider 个人 agent harness」。

⚠️ **潜在弱点（与 §12.10 同源）**：CodexLoom 建立在 Codex 上 + ChatGPT 登录——单 provider 锁定。它叫 **Codex**Loom 不是没原因。**它是不是「单 provider 的个人 agent 组织工具」**？部分是——它的 Domain Agent 概念与 provider 无关（理论上可换），但 CodexHost + codex app-server JSON-RPC + ChatGPT 登录这一层是 Codex 特定的。如果 OpenAI/Codex 被双封杀（如 Anthropic/Google 双封杀 OpenClaw，见 opc-product-discussion.md §9 OpenClaw/Hermes 小节），CodexLoom 会跟着死。

### 12.9 ★ compaction 连续性的工程化（Epoch Context Coverage）——**能抄来解决我们 claude 长会话回放**

**结论**：✅ **强烈建议抄**。Epoch Context Coverage 的「durable source 重注入 + 双证」机制，可直接借鉴解决我们 `docs/research/claude-replay-performance.md` 长会话回放上下文压缩问题。

证据（epoch-context-coverage.md 全文，✅）：
- **durable source 五保证**：每个 context epoch 中 Loom Agent Prompt + 完整 Profile + 直接关系快照 + 工作上下文 + 双证标 covered。
- **Epoch vs Turn 独立维度**：compaction marker 开新 epoch，下 turn 重新覆盖。
- **Developer payload 原子 + 上限 128 KiB + fail closed**：超限拒启 turn 不截断。
- **Coverage ledger per-thread**：Attempt 状态 planned → submitted → model_observed → covered，双证才 covered。
- **at-least-once 非 exactly-once**：保守重发。
- **start lock 串行编译流程**（14 步）：防并发 turn 重复注入。
- **XML escaping + CDATA-safe splitting**：防 Profile 越权。

**对照 agents-remote claude**：
- `docs/research/claude-replay-performance.md` 我们的长会话回放问题：数据流成本 + 实测数字（客户端已排除，主因在传输）+ 实施路径。
- `docs/design/message-replay.md` 我们的进程模型：claude 直拉 CLI（`Bun.spawn`，非 tmux）+ JSONL history / 内存 live 双缓冲 relay + 单一 WS 流。
- ⚠️ **我们的现状**：claude 用 stream-json + `--resume` + relay 双缓冲 + JSONL history，**没有 compaction 后 durable source 重注入机制**——长会话 compaction 后 system prompt / role / 关键长期声明可能丢。

⚠️ **OPC 启示（直接工程借鉴）**：
1. **claude 长会话 compaction 后重注入 durable source**：抄 CodexLoom 的 Epoch Context Coverage——compaction 后下一 turn 重新覆盖「角色 systemPrompt + 关键长期规则 + 当前组织关系快照」。这解决我们「长会话 compaction 丢角色身份」的潜在问题。
2. **双证机制（replayable rollout evidence + 同 turn model event）**：我们 claude 的回放已有 JSONL rollout（`docs/design/message-replay.md`），可加「重注入后观察首个 model event 才标 covered」双证。
3. **不能照搬的部分**：CodexLoom 是 codex app-server JSON-RPC（thread/inject_items），我们是 Claude CLI stream-json（system message 注入）——注入 wire 通道不同，但「durable source 重注入 + 双证 + per-thread ledger」原则通用。

### 12.10 OpenAI/Codex 强绑定 vs 我们多 provider 对冲——**CodexLoom 的单 provider 锁定是它的弱点**

**结论**：⚠️ **CodexLoom 的单 provider 锁定是它的弱点，我们的多 provider（Claude/Codex/pi）对冲是结构性优势**。

证据：
- **CodexLoom 强绑定 Codex**（✅）：仓库名 CodexLoom + README「Built ON Codex」+ CodexHost + codex app-server JSON-RPC + ChatGPT 登录 + rollout 文件格式 codex 特定。
- **我们多 provider**（✅）：opc-product-discussion.md §9 OpenClaw/Hermes 小节「要预判 provider 条款变动风险（多 provider：Claude/Codex/pi 是对冲）」+ agents-remote 现有 claude/codex/claude ProviderProfile + pi-access-options.md 调研。

⚠️ **OPC 启示**：
1. **多 provider 是对冲 provider 被封杀风险的结构性优势**——OpenClaw 被 Anthropic/Google 双封杀（opc-product-discussion.md §9）是前车之鉴。CodexLoom 若 Codex 被封杀会整个死，我们换 provider 即可。
2. **但 CodexLoom 的 Domain Agent 概念是 provider-agnostic 的**——Profile/Topic/Message/Organization 四图/Interface Agent 这些治理概念与 provider 无关。**我们抄它的「治理层」时不受它的 provider 锁定影响**。
3. **CodexHost 的 codex 特定部分**（JSON-RPC + app-server 协议）是我们 Codex 对接的工程参考，但不是「agent runtime 抽象」的参考——我们的 driver SPI（参考 OpenMausBot `pm-openmausbot.md` §9.5 + agents-remote ProviderProfile）才是多 provider 抽象层。

---

## 13. 证据分级与来源

### ✅ 一手直证（源码 / README / 官网中文 guide / docs 文档 / deepwiki / GitHub API）

1. **GitHub `yan5xu/codexloom`**（REST API 直取，2026-08-13）— 361 stars / 0 subscribers / 27 forks / 23 open issues / Go / **Elastic License 2.0**（NOASSERTION → 读 LICENSE 文件原文确认）/ created 2026-07-07 / pushed 2026-08-12（5 周龄）/ owner yan5xu (id 5762066, 2013 注册, 216 followers, 34 repos, 个人 User, name "Yanwu") / topics: agent-governance/agent-orchestration/ai-agents/codex/developer-tools/golang/llm/multi-agent/react — https://github.com/yan5xu/codexloom
2. **LICENSE 文件原文**（raw 直取）— **Elastic License 2.0**：允许源码可见 + 用 + 改 + 派生 + 自托管；禁第三方 hosted/managed service（含免费）+ 禁移除 license key 功能 + 禁移除版权/商标/notice。https://github.com/yan5xu/codexloom/blob/main/LICENSE
3. **contributors**（GitHub API）— **count: 1（yan5xu 122 commits）**，纯单人项目。但 PR 编号到 #68，含 5 个外部 PR（otterpal #67 / Hiwoniu #46 / Ray0907 / qq788538-dotcom ×4 / luojiyin1987 #3）。
4. **issues 全量**（GitHub API）— yan5xu 自报 15 个 + MrCoder #61 + zilonghe #60 + Hiwoniu #43/#24（**外部 issue 仅 4 个，极少**）。issue #41 Keychain 事故 + launchd crash loop + 1 评论（yan5xu 自己确认长期方向迁 managed credential file）。
5. **commits 最近 20**（GitHub API）— 全 by yan5xu，集中在 Lark/飞书 Gateway migration（fail-closed migration / durable rollback intent / proof fre / l2a exhaustive fail-closed matrix）+ command descriptions + Needs You 字段约定 + Agent working dir config + pnpm 迁移。commit message 高度结构化。
6. **docs/ tree 30 文件**（GitHub API）— `owner-guide.zh-CN.md`（483 行 canonical）+ `owner-guide.md`（EN 译本）+ `handbook.md`（47KB）+ `loom-cli.md`（49KB）+ `epoch-context-coverage.md`（14.6KB）+ `product-design.md`（15.5KB）+ `agent-profile.md`（14.7KB）+ `integrations.md`（22KB）+ `topics.md` + `triggers.md` + `conversation-membership.md`（6.7KB）+ `codex-app-server-protocol.md`（11KB）+ `technical-debt-audit.md`（35KB）+ etc.
7. **owner-guide.zh-CN.md 全文 483 行**（raw 直取，canonical 权威）— 「中文是权威版本，英文是译本，分歧以中文为准」+ 五类陈述分级（产品原则/当前行为/已验证实践/当前建议/假设）+ 核心思路（从持续工作出发/先一个 Agent/组织跟随分化/Loom 不拥有 Owner 目标/高级个人不等于独自工作）+ Owner 工作节奏（7 频率表）+ 选 Profile（三字段 + 四测试）+ 日常与 Agent 工作（信息流向责任）+ 过程 vs 结果管理（光谱表）+ 7 协调机制选择表 + 渐进式通信 + Needs You + Topic + Trigger + 从一个 Agent 成长为团队（拆分证据/反对证据/四类证据分离/矩阵组织 Business Home+Topic Team+Practice Coach）+ 受治理外部角色 + 观察调整团队 + 产品边界（不做什么）+ 当前限制 — https://github.com/yan5xu/codexloom/blob/main/docs/owner-guide.zh-CN.md
8. **epoch-context-coverage.md 全文**（raw 直取）— durable source 五保证 + Epoch vs Turn 独立维度 + Context Sources 表 + Developer/Input 分层（原子 payload 128 KiB 上限 + fail closed）+ Turn 开始编译流程 14 步（start lock 串行）+ Coverage ledger（per-thread JSON + Attempt 四状态 + 双证才 covered + at-least-once）+ Source 变化（Prompt/Profile/Relationship 更新）+ 诊断入口（loom context prompt/explain/coverage）+ 安全边界（声明性非授权 + XML escaping）+ 测试与生产验收（10 自动测试 + 7 步真实 Codex canary）+ 当前边界（V2 不含 mid-turn compaction/Active Operating Precedents/Domain-first discovery/counterpart Profile/完整 Team Graph/自动组织调整）+ 权威实现入口（8 个 internal 文件路径）— https://github.com/yan5xu/codexloom/blob/main/docs/epoch-context-coverage.md
9. **topics.md 全文**（raw 直取）— Topic = 薄共享协调记录（不执行/不拥有 thread/不替代 Goal）+ 产品边界（一个 Responsible 多 Participants + Owner 输入发 Responsible + 只有 Responsible 阶段结果进 Results Ready）+ 何时用/不用 + 创建恢复（`loom topic create` + `<loom_topic_context>` 只含 ID/title/purpose/completion/brief/waiting_on/角色/少量 links/有界 activity delta）+ 协作因果（Message reply 继承 Topic + `topic link` 显式加证据）+ Brief 等待结果（乐观版本号 + waiting-on github-pr + result 发布）+ Owner 下钻 Turn 干预（`topic send` + `topic intervene steer/interrupt` 只作用于精确 active turn）+ Web/CLI 入口 + 第一版限制（一 Agent 一 primary Thread + 不自动总结 + 不判断拆分 + intervention 拒绝无 active turn + 不提供子任务/依赖图/排期/工时/自动派单/项目看板）— https://github.com/yan5xu/codexloom/blob/main/docs/topics.md
10. **triggers.md 全文**（raw 直取）— Trigger = 外部事实变化恢复既有工作（不是结论）+ 与相邻能力边界（Message/Schedule/Goal 区分）+ v1 GitHub adapter（PR merged/closed/head-changed + workflow-run completed/success/failure/cancelled，ANY 语义，30s polling）+ 连接 GitHub（OAuth Device Flow / token file / env 引用 + Keychain + Resource Owner 隔离）+ Agent 使用（4 CLI 示例）+ 生命周期持久化（pending/armed/paused/triggered/cancelled/expired/failed + triggers.json + 进程崩溃恢复从 triggerId 修复不复制消息）+ UI + 当前限制（只有 GitHub polling + webhook/deployment/approval 未实现）— https://github.com/yan5xu/codexloom/blob/main/docs/triggers.md
11. **product-design.md 全文**（raw 直取，approved product baseline）— Product Boundary + Product Rhythm + Causal And Return Continuity（每 secondary surface 保因果链）+ Global Information Architecture（6 主区 Agents/Needs You/Overview/Team/External/Settings）+ Global Shell（Desktop sidebar + Mobile 无底 nav）+ Agent Work Surface（Tabs + Thread Feed + Agent Inbox + Goal + Agent Inspector）+ Status And Attention（Execution State 5 态 + Attention Signals）+ Needs You（Owner 唯一持久动作 inbox）+ Overview（Status/Capacity/Token Usage + 共享时间范围）+ Team（Directory 默认 + 四图分离铁律）+ External（Agent → external identity → Conversation role）+ Settings（5 区）+ Agent Creation（简化）+ Cross-Device Continuity（跨设备同步有边界）+ Delivery Order（6 步迁移顺序）— https://github.com/yan5xu/codexloom/blob/main/docs/product-design.md
12. **agent-profile.md 全文**（raw 直取）— Profile 三字段（Identity/Domain/Scope）+ 三字段都可空 + 新 Agent 默认无 Profile version 0 + Profile 写作三步法（寻找长期不变量四测试 / 分别写 Identity-Domain-Scope / 协作可发现性检查）+ 多行写作模板 + Profile 是协作契约不是任务调用描述 — https://github.com/yan5xu/codexloom/blob/main/docs/agent-profile.md
13. **integrations.md 全文**（raw 直取，22KB）— Feishu/Slack/Parall 三个 Gateway adapter 详细配置 + Connection/Address/Membership/Inbox/Outbox 后端权威对象 + Gateway 进程模型 — https://github.com/yan5xu/codexloom/blob/main/docs/integrations.md
14. **README.md / README.zh-CN.md 全文**（raw 直取）— "Codex provides the threads; CodexLoom weaves them into an agent organization" + "A workflow describes how work moves; CodexLoom organizes who remains responsible" + Domain Agent vs Task Agent 对比表 + Why Long-Lived Domain Agents（cold-start cost / Rebuilding Context Also Has A Cost / Compaction Preserves Continuity / Epoch Context Coverage / tacit context）+ Profile and Thread + From Domain Agents to an Organization（Organization/Collaboration/Activity/Directory 四图 + recipient is busy 排队 + Internal Agents）+ What You Can Do Today（8 项）+ Who Is It For（**Advanced Individuals and One Person Company Owners 明文**）+ Quick Start（`make release && ./bin/codex-loom` localhost:4870）+ Community（飞书群）+ Documentation
15. **docs/README.zh-CN.md 文档地图**（raw 直取，canonical）— 7 条文档规则（仓库 Markdown 是权威 / Owner Guide 拥有用户旅程 / 产品原则-当前行为-已验证实践-当前建议-假设不可互换 / 开发构建行为必须标注 / 产品设计证据不能覆盖当前实现 / 优先链接不重复 / **中文是权威英文是译本**）
16. **deepwiki `ask_question` × 3**（源码级）— ① 多 agent 并发（AgentMessage REQ/RES/NOTIFY 状态机 + per-agent queue + turn serialization + `deliverNextQueuedForTarget` + `isBusyErr` + `no_reply` + Topic 无锁无 claim 是薄协调记录）② Interface Agent + Conversation Membership（authorization boundary / Membership 字段 triggerPolicy-replyPolicy-outboundPolicy-trustDomain / Gateway 路由外部消息 6 步 + 回复 5 步 / 6 层保护 / 外部 actor 永不直接调内部 primary thread）③ 整体架构（Hub Orchestrator + CodexHost + 单 codex app-server + thread/resume 幂等 + rollout 真相源 + store NDJSON/JSON atomic + 单长跑 codex-loom server + 多 surface 共享 thread + Rollout 文件唯一真相）— https://deepwiki.com/yan5xu/codexloom
17. **作者 repos top 15**（GitHub API）— codexloom 361 / **ququ 2260**（开源 Wispr Flow 替代，中文语音桌面）/ **code-relay 297**（AI Coding Agent 工作协议 — 跨会话记忆、多仓库全局视野，**与 CodexLoom 同源**）/ scout 121（Roo Code 实验 Agent）/ **oh-my-ai-company 81**（AI 公司图谱）/ memex 21 / deepseek-diagrams-extension 25 / boxlite 2 / playwright-mcp-bypass 20 — **作者长期围绕「中文 AI agent / 语音 / 知识管理」主题**
18. **owner profile**（GitHub API）— yan5xu, name "Yanwu", 2013-10-24 注册, 216 followers, 34 public_repos, 无 company/blog/location/bio（个人开发者，中文母语推断基于 ququ/code-relay 中文描述）

### 🟡 二手（社区/媒体）— **社区真空**

19. **HN Algolia codexloom**（2026-08-13）— **1 帖 1 pt 0 评论**：story_49159174「Codexloom: Turn Codex threads into an organization of long-lived domain agents」by simonpure, score 1, descendants 0, kids []. **零 HN 讨论**。https://news.ycombinator.com/item?id=49159174
20. **HN Algolia yan5xu**（2026-08-13）— 3 hits：codexloom 自报帖（1pt）+ bb-browser（7pts，非 yan5xu 自己）+ Yanxuan（3pts，无关网易严选）。**作者在 HN 几乎无存在感**。
21. **firecrawl search**（~2 credits）— codexloom 在 LibHunt（vs warden/awo/vichu-flow 比较页，机械）+ LinkedIn（frank-joseph-borderless / James Chang 提及，弱）+ GitHub topics/agent-governance（573 repos 列表，CodexLoom 在内）。**无 Reddit/V2EX/juejin 独立讨论**（firecrawl search site:reddit.com OR site:v2ex.com OR site:juejin.cn 零结果）。
22. **codexloom.ai 官网**（README 链接）— codexloom.ai/en/ + /zh-cn/ 中英双语，未深抓（firecrawl credits 限额）。

### ⚠️ PM 推断（本文件独家）

23. 「CodexLoom 是这批参考里意识形态最接近 OPC PRD 的项目」——基于 Domain Agent + 不重写 runtime + Profile 作契约 + 按需唤醒 + 明写 OPC 的综合判断。
24. 「CodexLoom 是编排平台非单品爆款」——基于它有 Message 状态机/Topic/四图/Interface Agent/Epoch Coverage 等编排子能力的综合裁决。
25. 「CodexLoom 走的是点对点责任路由多 agent，不是共享 room 多 agent」——基于它无 task claim / 无共享 task / per-agent queue + turn serialization + no_reply / Topic 是薄协调记录的综合判断（区别于 Raft 共享 room）。
26. 「Epoch Context Coverage 解决了我们担心的持久 context 膨胀」——基于 thread 持续累积 + compaction 保前缀 + Epoch Coverage 重注入 durable（128 KiB bounded）+ prompt caching 三重控制推断（但无社区实战验证）。
27. 「CodexLoom 的单 provider 锁定是弱点」——基于仓库名 CodexLoom + CodexHost + codex app-server + ChatGPT 登录 + rollout 格式 codex 特定的推断。
28. 「OPC 第二期持久化可抄 thread 持久 + compaction + Epoch Coverage，不只向量检索」——基于 CodexLoom 给出的另一条解 context 膨胀路径推断。
29. 「CodexLoom 文档/运营成熟度远超 Avernet，值得深度学习源码/设计哲学但不构成短期商业化威胁」——基于文档体量（30 docs）+ 运营成熟（issue #41 Keychain 事故处理）+ 作者作品史聚焦（code-relay/ququ/oh-my-ai-company）+ 361 stars/0 watcher 社区真空的综合判断。
30. 「PRD 第一期角色定义加 Scope 字段（哪怕可选）」——基于 CodexLoom Profile 三字段直接补 opc-product-discussion.md §4「偏出强项时说明」的工程化建议。

### 工具与方法

- **GitHub REST API**（curl + python3 解析）：repo meta + contributors（1 人 yan5xu 122 commits）+ commits 20 + issues 23（外部仅 4）+ PRs 30（外部 5 作者）+ owner profile + owner repos + docs tree + issue #41 详情 + release（0）—— 关键数字一手验证
- **GitHub raw**（curl）：LICENSE 原文（Elastic 2.0）+ owner-guide.zh-CN.md 全文 483 行 + epoch-context-coverage.md + topics.md + triggers.md + product-design.md + agent-profile.md + integrations.md + README.md + README.zh-CN.md + docs/README.zh-CN.md —— **中文文档为 canonical 一手直证**
- **deepwiki `ask_question`** × 3：多 agent 并发（AgentMessage 状态机 + per-agent queue + no_reply）/ Interface Agent + Conversation Membership（authorization + Gateway 路由 + 6 层保护）/ 整体架构（Hub + CodexHost + store + rollout）—— 源码级验证
- **HN Algolia**（curl）：codexloom（1 帖 1pt 0 评论）+ yan5xu（3 hits）—— 确认社区真空
- **firecrawl search**（~2 credits）：codexloom 社区声量验证（LibHunt 机械比较 + LinkedIn 弱提及 + 无 Reddit/V2EX/juejin 独立讨论）
- 已读对照（任务前置）：`pm-raft.md`（14 节框架标准范式，全 630 行）+ `pm-paperclip.md`（层级编排对照，全 333 行）+ `pm-multica.md`（issue×task 双层，全 436 行）+ `pm-openmausbot.md`（最近一份调研格式，全 462 行）+ `../design/opc-product-discussion.md`（PM 讨论中枢只读，全 253 行）+ `../design/multi-agent-prd.md`（PRD 只读，全 132 行）+ `index.md`（批次索引）

---

> **PM 一句话总结**：CodexLoom（`yan5xu/codexloom`，Go + React，**Elastic License 2.0**，5 周龄，361 stars / 0 watcher 社区真空，作者 Yanwu / 中文个人开发者，code-relay+ququ+oh-my-ai-company 同主题作品史）是「**把 Codex threads 织成长期在岗的 Domain Agent 组织**」——它**与 OPC PRD 意识形态最接近**（明写 OPC 目标用户 + 不重写 runtime + Profile 作协作契约 + 按需唤醒 + compaction 保连续性 + 拒绝企业多租户），是**编排平台**（非单品爆款），走「**点对点责任路由多 agent**」另一条路（非 Raft 共享 room、非 Paperclip 层级 delegation）。**最强的 3 个印证点**：① Profile 三字段（Identity/Domain/**Scope**）直接补我们 PRD 角色定义缺口（Scope = 边界/越界声明，工程化「偏出强项时说明」）；② Organization/Collaboration/Activity/Directory **四图分离**给我们第二期圆桌 UI 的「声明 vs 活动」分离原则；③ 「**Lead/Internal/Interface Agent 是组织模式非硬编码类型**」与 Multica #1282 + 我们 §7 共性「不写死职能」**三向独立收敛**到品类共识。**最值得抄的 2 个工程借鉴**：① **Epoch Context Coverage**（compaction 后下 turn 重新覆盖 durable source + 双证才 covered + per-thread ledger + at-least-once）——直接借鉴解决我们 claude 长会话回放上下文压缩问题（`docs/research/claude-replay-performance.md`）；② **CodexHost + codex app-server JSON-RPC**（thread/resume + thread/inject_items + turn/start 三件套）——我们 Codex 对接待办的现成协议参考（`docs/codex-app-server-protocol.md` 11KB 已吃透）。**最大的 1 个分叉点**：CodexLoom 把「**长期存活 Domain Agent（thread 持久）」当第一期地基**，我们 PRD 第一期选「**任务为执行单元、agent 非常驻（按需 spawn）**」——分叉合理（第一期轻量启动），但 CodexLoom 的「thread 持久 + compaction + Epoch Coverage」给了我们第二期持久化的**另一条路**（不只向量检索），且 Epoch Coverage 可能让我们提前安全上持久 thread。**品类裁决**：编排平台（「点对点责任路由编排」新子类），进 `../design/opc-product-discussion.md` §5 编排老师拼图（在「层级 vs 圆桌」「agent 间通信媒介」「长记忆」「状态焊点」多个子能力上是新老师），**不进 §9 单品爆款**。社区真空（361 stars/0 watcher/1 HN 帖 0 评论/0 Reddit）不妨碍它做老师——文档/运营/作者作品史聚焦度都远超 Avernet，是**值得深度学习源码/设计哲学但不构成短期商业化威胁**的项目。
