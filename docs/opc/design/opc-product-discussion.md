# OPC 多 Agent 编排 · 产品讨论

> 这是 PM 之间的产品讨论记录。只记想法、理念、结论,不记过程痕迹(谁说的、何时改、修订记录一律不记)。要改就直接改。
> 证据底座在 `docs/opc/research/pm-*.md`(14 个产品 + 6 社区走查),本文件只结晶想法。

## 1. 我们在做什么

**OPC(一人公司)**:一个人通过编排多个 AI agent,完成传统需要一个团队的工作量。

用户从「操作员」(一个个手动起管单个 agent,全程盯每一步)升级到「老板」(agent 自己分工协作,你只管定方向和拍板)。

## 2. 底层命题:agentmore

所有参考产品都在做同一件事——把"用 AI"从"会话内调工具"重构为"管一群有身份、有记忆、会自己干活的数字同事"。

- **serverless** = 无状态函数,按需调用,状态全外部化,调完即销毁。
- **agentmore** = 同样按需 spawn、不常驻、事件触发,但**带状态**——身份、记忆、偏好、上次结论是 agent 的一部分,不是每次从零。

差别就一个字:serverless 把状态赶出去,agentmore 把状态留下来。所以叫 "agent + more"——比 serverless 多了状态这个维度。

我们的 agent 形态就是 agentmore,不是常驻服务(agent-server),不是纯无状态函数(serverless)。

## 2.5 两层栈:产品结构北极星(2026-08 定)

**产品分两层,面向两类用户,观测/介入的粒度也不同**:

```
顶层:协作层(raft.build 形态)—— 面向常规用户
  人和 agent 相处:channel/DM/@mention、teammate 身份、记忆、看板
  观测 = 刷对话流;介入 = 发消息(对的粒度,不是妥协)

底层:会话层(orca / hermes / agents-remote)—— 面向专业用户
  真正的 runtime 控制:spawn、stream-json 全量观测、permission
  control_request、model/effort 切换、terminal attach、--resume 续接
  观测 = 逐 token 流;介入 = 精确到 turn/工具审批
```

**这个拆分解开"包工头"死结**(此前试图在单层里同时解决"人观测介入"与"质量保证"而卡死):

1. **人 → 包工头走顶层**:人不钻进 worker 内部,在 channel 里与包工头对话(Raft 首页形态:"how's CI on PR #982?" → "All green, merging once @tygg signs off")。人的观测粒度 = 对话,介入粒度 = 消息。
2. **包工头 → worker 走底层**:正是 agents-remote 已有的东西——claude stream-json 透传、permission 审批、control_request/response、model/effort 切换、JSONL 回放。**"人可以观测并且介入"在会话层已完全实现**;包工头 agent(或专业用户)用底层工具看 worker 内部、精确介入。
3. **Hermes 的痛印证拆分**:用户抱怨"看不到 worker 内部、介入是盲的"(`pm-hermes-user-observe-worker.md`),是 `delegate_task` 匿名后台子 agent 的病——它的 Kanban 路径其实把中缝观测做全了(任务事件流/attempt 历史/心跳/mid-turn `/kanban` 介入),但顶层会话形态和底层 worker 逐 token 观测都缺。即:**两层都要真实存在且各有粒度,任何一层缺失,人的观测介入就会在最缺的那层断掉**。

**定位含义**:agents-remote 不是整个产品,是产品的**底层**。已做一年多的 claude/terminal/session 管理就是在造第二层(orca、hermes 同层竞争);Raft 证明了顶层形态。路线 = **把底层做透 → 在上面长出 raft 形态的顶层**。顶层形态学 Raft,机制从调研产品拼(质量门学 multica PR review / OpenOPC reviewer、沉默即成功、AX 四问)。Raft 自己也是这个结构的压缩版("team collaboration layer around agents",协作面在云、执行在本机 daemon),只是它把中间的会话层压成薄 daemon、没有专业控制面——**我们的机会就是把中间层做成真的:专业级观测介入控制面 + 顶层长协作**。

**Hermes bot mode 反向验证这个结构**(`pm-hermes-bots-profiles.md`):Hermes 正在从会话层往上长协作层——身份单位提到整台 profile(独立记忆/人格/IM bot token),协调介质做成持久 SQLite Kanban 板(每个 handoff 是人和 agent 平等读写的 DB 行,`/kanban` 豁免 running-agent guard 让人 mid-turn 介入,断路器/循环计数全是确定性 DB 守卫)——**中缝(协调介质)它做得很完整,恰好证明协调介质做成"人和 agent 平等读写的持久数据"时,审计/回放/mid-turn 介入/确定性护栏全都自然获得**。但顶层长得很挣扎:#86135(2026-08-14)CEO `delegate_task` 派活给 C-suite 仍是静默后台子 agent,操作者看不到 CTO 线程只收摘要——"Operator cannot audit the chief. **Makes C-suite feel fake**",用户明确要求 Grok Bot 式可点开的 per-chief 真实对话。结论:**顶层(人和 agent 相处的会话形态)不是会话层产品顺手就能长出来的,得被当成一等产品设计——这正是 Raft 的功夫所在,也是 Hermes 的教训**。对 agents-remote 的具体机会:底层 claude 派生的每个 worker 会话天然是可点开、可逐 token 观测、可 --resume 的真实会话——Hermes 用户要而不可得的"可见 chief 线程",我们的底层已具备实现基础,缺的只是顶层的会话形态。

## 3. 状态焊点:三层模型

每个产品都要回答"状态焊在哪",这是产品形态的根决策。参考产品焊在不同的地方:

| 焊点 | 代表产品 | 含义 |
|------|------|------|
| bot 身份 | Grok Bot / OpenMausBot | 换记忆 = 新建 bot(失忆就是另一个人) |
| room/channel | Claude Tag | access/memory/work 全焊协作容器 |
| workspace | Raft / cloudflare-os / todos.dev | workspace/computer 持久,agent 在其上跑;换 workspace 才换状态 |
| 关系网+协作状态机 | Avernet | bot 可换,关系/协作史永留 |
| issue | Multica / Paperclip | 任务是唯一权威容器 |
| work-item phase + SQLite | OpenOPC | 14 态 phase enum 是单一权威,agent 进程是临时投影器 |
| Agent 身份+治理对象+thread | CodexLoom | 稳定 ID+Profile+primary Thread(Owner 治理)+ 治理对象(Message/Topic/Needs You)+ rollout(codex runtime 持)三层分离 |
| git 分支+进程 | Superset | 机器物理态 |
| 事件流 | Buzz | Nostr relay 是真相源 |

### 我们的取舍:三层都有

我们要「管同事」+「管项目」两个都要。Grok Bot(焊身份)适合管同事,workspace 焊点(Raft/cf-os/todos)适合管项目。Avernet 给了第三个焊点——**关系网+协作状态机**,它是连接前两家的桥。

**三层模型**:

1. **同事层**(焊 bot 身份,Grok Bot 哲学):bot 有持久身份+自己的脑子和记忆,换记忆 = 换脑 = 新同事。
2. **项目层**(焊 workspace,Raft/cf-os 哲学):workspace 持久,文件/状态/提议留在项目里。
3. **协作层**(焊关系+协作状态机,Avernet 哲学):哪个同事派到哪个项目、和谁组队、协作到哪步——动态的,是编排本身。

> **Avernet 社区走查校准(`pm-avernet-community.md`)**:Avernet 是"**源码可读、社区不可读**"的项目——开源 5 周(HN/Reddit 零帖、Twitter/X 1 赞、中文媒体全是 2026-08-07 同日通稿转发、GitHub issue 90%+ 内部自产自销)。它作为"协作层焊点老师"的定位要**分两层**:(a) **机制层可学**(dumb router / YAML 状态机 / 三段审批 / 焊关系网三层——源码直证,社区零反对);(b) **产品层不可证**(协作基础设施好不好用无社区证据,"蚂蚁 12 BG/90% 完成率"全官方通稿、零第三方核实、口径无定义)。我们学机制即可,不照抄产品形态,不把 12 BG 当硬背书。

这与真实公司一致:员工走了,新员工接手,项目记忆和协作史留在公司,但每个员工自己的脑子是自己的。

### Raft 的关键澄清:协作层焊的是"共享对话",不是"共享记忆"

Raft 明确反对"协作层焊一个团队共享 brain"——共享 memory pool 会"deletes the specialists"(溶解掉专家分工)。它的解法是**双锚定**:
- **共享状态**(对话/任务/看板)锚在 channel——多人多 agent 共见。
- **私有状态**(记忆/workspace/身份)锚在 agent——专属、持久。
- **桥**靠**消息**:agent 间不互读记忆,只在共享 channel 里说话,findings 在 room 里相遇。

所以我们的"协作层"只焊**关系+协作史+共享对话**,**不焊共享记忆**。协作层是消息流,不是脑。

### cloudflare-os 在三层模型里的定位降级

社区走查铁证(`pm-cloudflare-os-community.md`,331 HN 评论):cloudflare-os **不是编排产品**——社区根本不拿编排标准衡量它,把它当"企业 AI 工作台/安全平台"。它的 workspace 焊点哲学 + 模拟批量审批 + "architecture of distrust"(不信任作为组织原则)仍是**重要的反面参照与状态架构参考**,但它**不进编排老师拼图**(§5)。我们的三层模型保留"项目层焊 workspace",代表产品以 Raft 为主。

## 4. 角色设计

### 角色是什么

角色 = **人设 + 模型 + 思考级别 + 持久工作区 + 长效记忆**(吸收 todos.dev + Grok Bot + Raft)。

不只是"给 agent 一个身份说话",是"用什么脑子干活、在哪干活、记得什么"。

> **CodexLoom 印证(`pm-codexloom.md`)——长期 thread 是 tacit context 载体,Profile 只是显式声明载体**:CodexLoom 的「Domain Agent vs Task Agent」论证最深的一句——「A long-lived thread also accumulates tacit context that is difficult to reconstruct in a single prompt. Corrections, preferences, terminology, judgment, and collaboration habits enter the thread through repeated work... Starting a new thread loses precisely this knowledge that is hardest to migrate explicitly.」**纠正/偏好/术语/判断/协作习惯只能通过反复工作进 thread,跨 compaction 提炼,不能单 prompt 重建**——这正是我们「name 承载累积协作史」想抓但没抓清的点:长期 thread 是 tacit context(隐性上下文)的载体,Profile/memory 文件是 explicit declaration(显式声明)的载体,两者不等价。CodexLoom 用 compaction 保前缀 + Epoch Context Coverage(compaction 后下 turn 重新覆盖 durable source + 双证才 covered)解决「长期 thread 不膨胀也不丢持久声明」,给我们第二期持久化「不只向量检索」的另一条路(见 §10 CodexLoom 缺口)。但第一期我们仍选 Task Agent(agent 非常驻、按需 spawn)——分叉合理,见 §8 边界。

### Name 比 Role 重要(Raft 启示)

我们原来倾向 role(研究员/CTO/工程师)。Raft 的洞察:**role 是 schema,可替换无状态;name 是 instance,带历史**。

- ❌ "研究员"——type,没有历史可继续。
- ✅ "Noel"——上次怎么 scope、容易 flag 什么、那次没人注意的回归它抓住了,全压进一个可寻址 token。

我们要 agent 有名字(name 为主)+ 角色标签(role 为辅)。role 描述能力倾向,name 承载累积协作史。

### 角色不写死职能(Buzz 警示)

Buzz 实战退掉了固定职能 persona(Orchestrator/Researcher/Planner/...),转向通用助手。社区走查(`pm-buzz-community.md`)获 **deepwiki 源码级铁证**:commit `ea5a0a9b4`(2026-07-22 "Replace built-in personas with Fizz")+ `welcome-kickoff-silent-failures.md` post-mortem。退役根因比"窄角色循环"更深——**base prompt 的回复义务规则自相矛盾**(既强制回复每条 user message,又强制完成时 @mention delegator,哪怕没事可报 = 没事也互相 ping)。

这给出**两条警示**:

- **警示 A(已有)**:角色模板不写死职能边界,写「宽能力 + 倾向 + 工具表 + 安全护栏」。
- **警示 B(社区走查新补,Buzz post-mortem 第一手教训)**:**会话协议规则(回复义务、@mention delegator、何时算完成)不能塞进角色 system prompt**,要在编排层显式表达。Buzz post-mortem 明确拒绝"在 persona 里修 loop",理由是 persona 是"character prompts (tone, wordplay)",会话协议规则塞进 persona 是 **layering violation**。尤其要**显式允许"沉默作为成功条件"**——否则触发 runaway reply loop(agent 互相 ping 不收敛)+ silent failure(agent 卡窄角色循环不报错)。

教训:角色模板不写死职能边界,写成「宽能力 + 倾向 + 工具表 + 安全护栏」;**会话协议规则留在编排层,不进角色 prompt**。这条警示 B 直接关联 §6 AX——编排层要有一个"沉默即成功"的状态,不能默认每个 event 都触发 agent turn。

- ❌ "你负责调研" → 职能边界,会困死 agent
- ✅ "你好奇严谨、擅长结构化信息;默认用 search/read 调研并输出结构化报告;偏出强项时说明" → 身份与倾向,智能留给 agent

> **CodexLoom 印证(`pm-codexloom.md`)——Profile 三字段(Identity/Domain/Scope),把「偏出强项时说明」升级为显式字段**:CodexLoom 的 Profile = **Identity(长期身份)+ Domain(长期领域,不是技能列表)+ Scope(负责什么、边界在哪、明确不负责什么、什么交出去)**,且 Profile 是「对其他 agent 的可发现性 + 协作契约」——让新 agent 看 Profile 就能判断「遇到什么问题找谁、什么不该默认由它处理」。**Scope 字段直接补我们「偏出强项时说明」的工程化**:把这条从行为规则(塞 system prompt)升级为 Profile 一等字段(协作契约),让边界声明显式、可发现、可审计。CodexLoom 自己说「三字段都允许为空,系统不因 Profile 不完整阻止创建」——轻量。**我们 PRD 第一期角色定义可加 Scope 字段(哪怕可选)**,不增复杂度但让协作契约从隐式变显式。Profile 写作四测试(时间/路由/边界/频率)也是可抄的「怎么写好 Profile」checklist。

### 角色记忆:per-agent 不共享 brain(Raft 核心修正)

### 角色记忆:per-agent 不共享 brain(Raft 核心修正)

角色得有长效记忆——跨任务、跨会话记住"我是谁、上次干过什么、偏好"。没有这个,角色就是带人设的一次性 session,永远当不了同事。

**记忆归属(Raft 启示,我们倾向如此)**:每 agent 一份私有记忆,agent 间不互读,靠消息传 finding。**不做团队共享 memory pool**——共享 pool 会溶解专家分工("deletes the specialists")。这条修正了我们之前"协作层共享记忆"的倾向。

实现(后定):skill 挂回 agent / 专属记忆文件 / checkpoint / 向量检索,几种可能混用。选哪种取决于"记什么、谁写、何时读、怎么不污染上下文"——技术设计阶段定。Raft 的 MEMORY.md 模式(agent 自管 workspace notes)+ todos.dev 的三层显式架构(见下)都是可抄的形态。

**todos.dev 的三层显式 memory(补 Raft 没做清的工程化)**:Charter(你写的团队章程,Chief 不可改)+ per-agent Memory(≤100 条 bounded curation,防膨胀)+ Projects&todos(工作本体,平台持久化)。Raft 只说"agent 自管 workspace notes"没给结构,todos 把"记什么、谁写、有没有上限"工程化了——尤其 **bounded curation(≤100 条上限)**直接呼应 Raft "no company brain" 的担忧(不是共享,是每 agent 有界)。我们的 memory 设计可借鉴这个三层 + 上限。

### 角色身份:每 agent 独立 identity,绝不共享用户登录态(Grok Bot 走查核心启示)

> 这是 Grok Bot 社区走查(`pm-grok-bot-community.md`)最有价值的结构性洞察。Grok Bot 让 bot 用用户账号登录(共享 session),社区强烈反对——这是 **accountability sink(责任黑洞)**:bot 的所有越权/违法操作都算到用户头上,因为系统里没有"bot 自己"。

**铁律:每个 agent 必须有独立 identity + scoped 权限,不能共享用户身份。**

社区主张的正解(`miguelspizza`/`stillpointlab`):bot 应在 IDP(身份提供者)有自己的注册身份、自己的账号、自己的 scoped permissions——而不是"共享用户 session"。`mike_hearn` 自建的 async agent 系统就是给每个 agent 一个 dedicated UNIX user account。

**对 OPC 的直接含义**:
- 我们的编排层里,**每个 agent 是独立的权限主体**,不是"借用户身份干活"。它该有什么能力(scope)、能碰什么资源,都显式授予、可审计、可撤销——这正是 cloudflare-os Gatekeeper 三层能力模型的精华(见 §3,cf-os 不是编排产品但这条安全哲学对)。
- 这是我们相对 Grok Bot(及所有"agent 接管用户账号"类 SaaS 产品)的**结构性安全差异化**,不只是"私有部署"差异化。私有部署是"数据不出本机",独立 identity 是"责任不转嫁用户"——两层。
- 关联 cf-os 的"不信任架构"(§4.5):cf-os 的"credential 永不给 agent,给 capability"正是独立 identity 的工程实现。我们的 agent 拿到的应该是 scoped capability/委托凭证,不是用户的主 session。

## 5. 编排老师拼图

"编排"不是向某一个产品学,是按子能力向最强的老师拼。Claude Tag 在编排维度是**要超越的对象不是学习的对象**——它本质是单 agent + 多人协作,没有 agent 间分工/角色/依赖图/任务状态机/agent-to-agent 通信。

Claude Tag 能学的是:**嵌入已有工具的手法 + agent 能力上下限 + 身份/room 级资源 + access bundle/scope 安全门控 + git webhook 事件唤醒**。它管"单个 agent 怎么被世界接住",不管"多个 agent 怎么协作"。

**Raft 是编排各子能力的多料老师**——它把 AX、per-agent memory、verification gate、claim 硬约束、mixed runtime、agent 互审全做出来了(见 §8)。编排子能力的老师:

| 编排子能力 | 老师 | 做对了什么 |
|------|------|------|
| 任务分解 + 派活 | todos.dev + Raft | Chief 一句话→自动拆→按分工派;Raft 一句话 @mention + Convert to Task |
| 任务状态机(执行流程) | **OpenOPC(最显式)** + todos.dev + Avernet + Raft | **OpenOPC 14 态 phase enum + 静态转换表 + attempt ledger 防重调度死循环 + DFS 死锁检测 + 6 模式 turn 纯函数派生(本批次最工程化,见 §10)**;todos Plan→Build→Review 三阶段;Avernet Initial→Discussion→Proposal→Execution;Raft Todo→In progress→In review→Done→Closed |
| agent 间通信媒介 | Avernet + Buzz + Raft + **CodexLoom** | Avernet dumb router;Buzz ACP over Nostr;Raft 共享 channel + 互 @mention(humans optional);**CodexLoom 点对点责任路由(Message REQ/RES/NOTIFY 状态机 + per-agent queue + turn serialization,非共享 room)** |
| 多 agent 角色分工 | todos.dev + Multica + Raft | todos 每角色绑模型;Multica Squad(浅层编排,社区 #815 戳穿,见 §10);Raft mixed runtime + name-bearing specialist |
| 层级 vs 圆桌 | Paperclip(层级) + Avernet/Raft(圆桌) + **OpenOPC/CodexLoom(责任路由)** | Paperclip org chart 是层级(机制可学,实战可用性低见 §10);圆桌形态 Raft 共享 room 最完整;**OpenOPC 层级委派 DAG + CodexLoom 点对点责任路由是第三种协作范式(非层级非圆桌)** |
| 执行隔离 | Superset + Raft | Superset worktree;Raft per-agent workspace tied to computer |
| **AX(agent 感官设计)** | **Raft(独家)** | inbox pull 不 push / held draft commit 前新鲜度校验 / AX 四问——见 §6 |
| **审批门控(信任语义)** | **Raft** + **OpenOPC** | verification gate:builder≠verifier 多 agent 互审 + trace/proof 兜底,关键按钮人来按;**OpenOPC risk 四档(low/medium/high/critical)+ LLM review 兜底 medium + safe allowlist 是务实审批补充** |
| 审批门控(交互效率) | cloudflare-os | 模拟+批量审批(不卡 agent)——cf-os 非编排产品,但此点可参考 |
| 组织治理(外部交付) | **CodexLoom(独家)** | **Interface Agent + Conversation Membership(triggerPolicy/replyPolicy/outboundPolicy/trustDomain)+ Gateway 治理外部协作——外部 actor 永不直接调内部 primary thread,凭证不进 agent**;这是我们完全没设计的维度,见 §10 CodexLoom 缺口 |
| context 连续性(compaction) | **CodexLoom(独家)** | **Epoch Context Coverage(compaction 后下 turn 重新覆盖 durable source + 双证才 covered + per-thread ledger + at-least-once)——直接借鉴解我们 claude 长会话回放上下文压缩,见 §10** |
| 长记忆 | todos.dev(三层架构) + Raft(per-agent 哲学) + Avernet(警示) + **OpenOPC(promote-from-private 路径)** | todos Charter/Memory/Skill 三层显式 + ≤100 条 bounded curation 给工程化;Raft per-agent memory 给哲学;Avernet 证明组织记忆别一上来做(且 Avernet 机制可学但产品未社区验证,见 §3 校准);**OpenOPC playbook = recurring lessons(≥2 次)从 private profile promote 成 shared skill 避开共享 pool 陷阱,留作长记忆后续参考路径(非第一期)** |

**todos.dev:补 Raft 没做清的(也是 OPC 形态,但用户没选它)**——todos 和 Raft 都是"团队范式",但 todos **刻意无 IM、agent 间不直接对话**(降维回避 AX 难题),协作面是 todos 流水线而非 channel。它的价值是补 Raft 没做/没做清晰的工程化:**Plan→Build→Review 三阶段状态机**(比 Raft task 状态机更显式,带 Confirm/Review 两道硬关卡 + AI review 单向 critique)、**Charter/Memory/Skill 三层显式 memory**(§4 已述)、**bounded curation(≤100 条上限)**、**MCP 外接**(外部 coding 工具反控工作流)、**schedule 定时重跑**。社区声量真的近零(HN/Reddit/PH 全零,全网仅 2 条 Threads 机械复述)——产品极活跃(6 周龄、npm 47 版本)但还没破圈,如实记录。

> **todos.dev 社区走查校准(`pm-todos-dev-community.md`)**:主调研的「社区真空」结论经 4 渠道一手复核**强烈成立**——todos.dev 是本批次**社区真空最彻底**的形态(比 Avernet 中文媒体通稿、Multica GitHub issue 内热、CodexLoom 361 stars 都更真空:闭源 GitHub 0 公开 repo + 零社区入口 + 零第三方讨论 + 仅 maintainer 自推)。关键修正:① maintainer 身份锁定 = **Zen(@supezen,中文 indie maker,X 32K followers,已有 ChainFM+Dokobot,todos.dev 是其第三个未站稳的 side project,未列入个人主页)**——是真实 indie maker 作品非玩具,但「32K followers 不转化为 todos.dev 采用」(单帖 views 144 + npm 下载衰减互证);② **todos.dev 的设计借鉴价值(9-phase+两道门+三层 memory+bounded curation)全部基于 docs 自证、零社区背书**——在「任务状态机老师」维度,**社区背书优先 pm-openopc(显式 FSM+源码可读)+ pm-multica(#815 源码级分析+80 issues 实战)**,todos.dev 退居「docs 设计参考 + 三层 memory + Charter 只读独有设计」而非「实战验证老师」,借鉴必须配套自测;③ maintainer 公开的唯一真实成本数据点 **单 task $9.6**(配合 $19/月 flat 即跑 2 task 够本月月费,但绝对值说明 Plan→Build→Review 全流水线 token 开销不小)——OPC 若走类似流水线需内置成本上限 + 阶段级 token budget(todos.dev 未做)。

> todos.dev 走查还纠正了一条 tvly 幻觉:旧版记的"Product Hunt 300+ upvote / $15/月"经多源验证**不存在**(HN/PH 零命中),是 tvly 摘要编的。教训:**tvly answer 可能凭少量信号生成不存在的"事实"**,关键数字必须官网一手验证。定价实际是 $19/team/月 flat(无 seat 无 usage)。

**Grok Bot 不在编排老师里**——它不是编排产品(社区 246 评论零编排讨论,见 §9)。cloudflare-os 也不在——社区证实它不是编排产品(见 §3)。

## 6. AX(Agent Experience)—— 我们最大的盲区

> 这是 Raft 调研最重的发现。我们之前只想到"人怎么管 agent 团队",没想到"**agent 怎么在一个共享 room 里不发疯**"。Raft 把这个当头等问题,我们必须补这一章。

### 问题:房间是为连续在场的物种设计的,agent 是 turn-based 的

把 agent 拉进群聊,要么 @mention 才答(变回 tool,错过它本该 catch 的)、要么自由发言(噪音爆炸、三个 agent 同秒抢答、ticket 被秒抢)。**根因不在 agent,在房间**:房间是为 continuous-presence(持续在场)的物种设计的,agent 是 turn-based(一调一答)的——每次调用读一个快照、推理、提交动作、然后等下次,**中间什么都不跑**。

### Raft 的两个核心 surface

1. **Agent inbox(pull 不 push)**:mention/通知不直接推进 agent 的 working context,而是 queryable item,agent 有带宽时自己 pull,自己决定吞不吞。直接解决"群聊吞掉 agent context"。
2. **Held draft(commit 前新鲜度校验)**:agent 起草时带 room-version marker,commit 时 server 比对:没变就发 / 变了就 hold 回退告知期间发生了什么;agent 四选一:Revise / Send as-is / **Stay silent(沉默是一等选项)** / Send anyway。解决"agent 发的消息已是过时态"。

> **✅ Held draft 已被独立验证为真已实现(`pm-raft-community.md`)**:知乎 kael-23-32「Hermes Agent 接入 Raft:4 个坑」(2026-06-26)CLI 级实测——1 分钟内类似内容进 draft 需 `--send-draft` 强发,印证 held draft 的新鲜度校验机制真实运行(非博客空话)。这是 §10 待定项「AX 实际体验是否如博客所述」的答案:**held draft = 是,真已实现**;但 inbox pull / AX 四问 / perception empathy / verification gate 实战有效性 = **仅博客自述、零第三方实测**(借鉴这三项必须配套自测,不能当已证能力照搬)。Task Claim 硬约束 + MEMORY.md 持久 + daemon 扫 PATH 三项也被 codepick.dev 实测三连确认。

### AX 四问(每个 agent 接触的界面都要回答)

1. action 那一刻 agent 看到什么?
2. 调用之间 agent 带什么 state?
3. agent 能从什么恢复?
4. agent 被允许决定什么?

> **第五条:被允许沉默吗?(Buzz + Raft + CodexLoom 三路独立收敛)**——Buzz 的 `welcome-kickoff-silent-failures.md` 证明:默认"每个 event 都触发 agent turn + 完成时 @mention delegator"会触发 runaway reply loop(没事也互相 ping)+ silent failure。AX 第四问"agent 被允许决定什么"必须包含"**被允许决定不发**"——编排层要有"沉默即成功"的状态,不强制每条消息都有回复。这与 Raft held draft 的"Stay silent 是四选一一等选项"同源(上节第 2 点),也与 CodexLoom 的 `no_reply`(Message 状态机里 REQ/RES/NOTIFY 之外显式允许「不回」+ per-agent queue 按 turn 序列化防同秒抢答)同源——**三个独立设计流派的编排产品(共享 room 派 Raft / 调研复盘派 Buzz / 点对点责任路由派 CodexLoom)各自撞墙后都把「沉默即成功」写成协议级一等公民,不是缺省**。

> **第六条:人被允许打断吗?(Hermes 补上的 AX 缺失维度,`pm-hermes-coding-community.md`)**——上面四问 + 第五条只覆盖 agent 的**发送侧**(发出的消息是否过时 / 是否被允许不发),没覆盖**人→agent 的打断侧**:人发一条消息打断正在跑的 turn,该是什么语义?Hermes 源码级(`busy_input_mode`)给了三档明确答案:**interrupt(默认)**——消息重定向当前 turn,模型生成重启,运行中的工具在**安全边界结束后**才应用修正,不立即剪断;queue——消息排队,当前任务完成后再处理;**steer(`/steer` 命令)**——mid-run 注入,不打断当前 tool-calling loop、不创建新 user turn。另有 `/stop` 硬停 + **approvals 审批 gate**(危险命令模式拦截 `rm -rf`/force push/pipe-to-shell + 超时 fail-closed + 无人值守 deny)作人介入危险命令的标准入口。**这补上了 AX 的「打断语义」维度**:OPC 设计"人发消息打断正在跑 claude 的 turn"时,默认应是 interrupt(而非 queue),且打断发生在工具安全边界而非立即剪断——这两条是 Hermes 社区被验证的默认值,直接照抄。⚠️ **打断 ≠ 介入**:三语义只解决「消息撞上运行中 turn」的排队/重定向语义,**不解决「人实时看 worker 内部」**——后者 Hermes 用户实测不可得(in-flight 零观测 #18127,唯一 debug 手段是 kill 看上下文=破坏性),打断本身是破坏性兜底(kill/rewind 才能看),非精细介入(详见 §10 Hermes 用户视角追加)。这条 AX 补充的是"人有权中断一个跑歪的 turn 且不丢已积累上下文",不是"人能插进 worker 内部纠偏"。

这四问(外加两条:被允许沉默吗 / 人被允许打断吗)是我们后续设计任何 agent 交互面(channel/task/审批/提醒)时的强制 checklist。

## 7. 共性收敛(参考产品独立印证)

1. **派活 = 一句话/消息,不是表单**——Grok Bot/Claude Tag/todos.dev/Buzz/Multica/Raft 全收敛。表单式派活是退路不是首选。
2. **agent 非常驻(按需 spawn)是主流**——Paperclip Heartbeat/Multica/Buzz/Avernet/todos.dev 全是。常驻只有 Grok Bot(云端 VM)。
3. **审批分层 + 责任矩阵优于单人 review**——Raft verification gate(builder≠verifier)最深;Avernet 状态机三段;Paperclip 双阶段。cf-os 模拟批量是交互层补充。
4. **固定职能 persona 是坑**——Buzz 退役警示。
5. **状态焊点是分水岭**——选哪个焊点决定整个产品形态(见 §3)。
6. **AX 必须专门设计**——多 agent 同台不能靠 agent 自觉协调(99% 失败),要靠协议级硬约束 + inbox/held draft 这类感官设计(Raft 独家,我们必补)。**Paperclip 反面铁证**:GitHub search race/concurrency/deadlock 命中 **1266 issue**(`pm-paperclip-community.md`),一个没做 AX 协议级硬约束(claim/串行/沉默即成功)的编排产品,多 agent 并发竞态成了长期高频痛点——这是 Raft AX 设计被独立印证为「必选项而非可选项」。
7. **记忆 per-agent 不共享 brain**——Raft 反对共享 pool;agent 间靠消息传 finding(见 §4)。
8. **Name > Role**——name 承载历史,role 是 schema(Raft)。
9. **沉默是一等公民(Buzz + Raft + CodexLoom 三路独立收敛,其中 Raft held draft 经 CLI 实测证实)**——Buzz post-mortem(会话协议规则不能塞角色 prompt + 显式允许沉默作为成功条件)、Raft held draft(Stay silent 是四选一一等选项,**知乎 kael-23-32 CLI 实测证实真已实现**,见 §6)、CodexLoom(`no_reply` 是 Message 状态机显式状态 + per-agent queue 按 turn 序列化)三个**不同协作范式**(调研复盘 / 共享 room / 点对点责任路由)的产品各自独立收敛到同一结论:多 agent 协作里"不发"和"发"同等重要,编排层不能默认每个 event 都触发 agent turn。三路独立收敛升级为协议级铁律(不只是两路印证),且其中 Raft held draft 这一路已从「设计自述」升级为「实测实现」。这条与 §6 AX 第五问同源。
10. **Lead/Internal 是「组织模式」不是「硬编码类型」(CodexLoom + Multica + 我们三路独立收敛)**——CodexLoom 的 Relationship(Lead/Internal/Interface)不是 agent 的固定 type 字段,而是 agent 之间的**关系性质**:同一个 agent 在不同协作里可以是 Lead 也可以是 Internal,关系随协作拓扑变化。Multica 社区 #1282 也独立表达了「leader 不是 agent 属性而是协作角色」的看法。我们 §7 共性④「固定职能 persona 是坑」+ §4「角色=名字+宽能力倾向(不焊职能)」是同一洞察的第三路收敛:**分工是协作时的临时关系,不是角色的固有属性**。这意味着我们第一期的「角色」不应有 `isLeader`/`isExecutor` 这类固定职能字段——leader/member 是派活时由任务结构赋予的关系,随任务结束而解绑(留作第二期圆桌编排的约束,见 §10 CodexLoom 缺口)。

## 8. 最接近的现成形态:Raft

用户看完 9 个参考产品后说"**这才是想要的形态**",指 raft.build。根因五条:

1. **它把 agent 当 teammate 不当 tool**(最根本)——别的产品是"人用 agent",Raft 是"人和 agent 共事"。这是范式跃迁,正中 OPC。
2. **它正面解决了多 agent 同台协作(AX)**——唯一一个(见 §6)。
3. **它的状态架构对**(共享对话 + 私有记忆 + pull 桥)——正好对应我们三层模型 + per-agent memory。
4. **本地执行 + 隐私 + BYO 订阅**——daemon 跑用户硬件、runtime 用自己订阅、agent-vault 防 secret 泄漏,和我们 agents-remote 的 hybrid 同源。
5. **IM 美学最完整**(channel/DM/thread/@mention)——和我们前端已用的 Slack-like 原语一致。

> **⚠️ 「最接近现成形态」限定(Raft 社区走查 `pm-raft-community.md` 补强)**:以上 5 条根因**全部来自 Raft 官方博客 + 官网自述**,社区独立验证仅覆盖其中一小部分——**held draft(AX 核心)/ Task Claim 硬约束 / MEMORY.md 持久 / daemon 扫 PATH 4 项被独立实测确认**(知乎 kael-23-32 CLI 实测 + codepick.dev 实测 + 黄东旭分布式哲学呼应),但 **inbox pull / AX 四问 / perception empathy / verification gate 实战有效性 / 9 runtime 中 5 种(Kimi/Copilot/Cursor/Antigravity/Pi)= 仅博客自述、零第三方实测**。「最接近形态」定位**不推翻**(held draft 验证 + 核心机制验证 + 哲学同构 + dogfood「40 agents+7 people」支撑 + 三产品沉默收敛),但应标注「**基于官方自述 + 小规模独立验证,非大规模社区背书**」——借鉴 Raft 不能把博客自述当已证能力照搬,必须配套自测。两个结构性风险:① **Raft 英文社区结构性真空**(HN/Reddit/Slashdot/Crunchbase 全零 + 竞品社区零提及,受众池不与 OpenClaw/Hermes/Grok Bot 重叠)——agents-remote 若做开源英文版不能指望从竞品社区引流 Raft 范式用户;② **真实成本账单 = 社区真空**(无任何第三方晒过 token 账单,「1.2B tokens/day」仍单一官网来源,黄东旭访谈是通用哲学非 Raft 专属评测)——唯一公开真实成本痛点数据点是 Vibe Coding Life「10 分钟烧穿 session limit」。

> **本批次新加的 OpenOPC / CodexLoom 两位编排老师都不动摇 Raft 的「最接近形态」地位**:
> - OpenOPC 是**学术 + 单机全自动公司模拟**(company_runtime_identity 单 root session 驱动,目标是"AI 自己开公司跑起来"),产品形态偏"无人值守全自动",与我们的"**人主导 + 移动控制面**"正交——它的 14 态状态机 + DAG 是机制老师(进 §5/§10),不是产品对标对象。
> - CodexLoom 是**意识形态最接近**(Domain Agent / per-agent thread / Profile / 不做共享脑 全部对齐我们 PRD),但产品是 **Codex 专属**(CodexHost + codex app-server JSON-RPC,不接 Claude),且核心设计是**长驻 Domain Agent**(与我们第一期「任务为执行单元、agent 按需 spawn」分叉,见 §4)——它是意识形态印证 + Codex 对接工程参考 + 第一期持久化路径的分叉讨论对象,不是整体产品替代 Raft。
> - Raft 仍是最接近形态:多 provider(不锁 Codex)、agent-as-teammate 范式、本地执行 + 移动 IM 美学,这三条 OpenOPC/CodexLoom 都不全占。

**PRD 该怎么对齐它**:
- ✅ 抄:channel/thread/task board 状态机、agent persistent identity + workspace memory、@mention 派活、claim 硬约束、verification gate、生产按钮人来按、AX(inbox/held draft/四问)。
- ➕ 补它的盲点(我们的差异化):开源/自托管、Windows 原生、Mobile-first、skill marketplace(可复用 workflow)、内置成本/资源调度、国内可达、Enterprise 私有部署。
- ⚠️ 调整:memory 从"共享 pool"改"per-agent + 消息桥";审批从"人 review diff"改"多 agent 互审 + trace 兜底";身份从"role 为主"改"name 为主 + role 为辅"。

**关键对比(Raft vs Claude Tag vs todos.dev)**:
- **Raft** = 多 agent × agent-native IM × 本地执行(团队 + 编排 + 隐私)——**只有它的范式对 OPC**。
- **Claude Tag** = 单 Claude × Slack 寄生 × 云端(团队共享一个 bot,易上手但无编排)。
- **todos.dev** = todos 驱动 × 任务为主(待深度走查,可能轻量但缺 IM 协作面)。

## 9. 单品爆款 vs 编排平台(产品形态分野)

参考产品分两类,不能混着学:

**编排平台**(让用户搭/管多个 agent 协作):Raft / todos.dev / Avernet / Buzz / Paperclip / Multica / Superset / **OpenOPC** / **CodexLoom**。这些是 §5 编排老师拼图的来源。(cloudflare-os 经社区证实不在此列——它不是编排产品,见 §3。)

> **新加两位编排老师(本批次)**:
> - **OpenOPC**(`hkuds/openopc`,1266 stars,学术 HKUDS,Python)= 任务状态机最显式的编排引擎(14 态 phase enum + 静态转换表 + DAG 调度 + attempt ledger + DFS 死锁检测),社区真空(9 watchers)但工程严谨度本批次最高。**学术 + 同名竞品**,印证"OPC 多 agent 编排"方向成立,但产品形态偏"单机全自动公司模拟",非我们"人主导 + 移动控制面"——机制可学、产品不对标。详见 `pm-openopc.md`。
> - **CodexLoom**(`yan5xu/codexloom`,361 stars,Go,Elastic License 2.0)= 点对点责任路由编排新范式(四图分离 Organization/Collaboration/Activity/Directory + Profile Identity/Domain/Scope + per-agent primary thread + Epoch Context Coverage),**本批次与我们 PRD 意识形态最接近的产品**(Domain Agent = 我们带累积协作史的「角色」;per-agent thread = 我们 per-agent 私有记忆不做共享脑;Profile = Name>Role)。社区真空(0 watchers),作者 yan5xu 有 code-relay/ququ/oh-my-ai-company 同主题连续探索史。详见 `pm-codexloom.md`。

**单品爆款**(一个固定的高能力 agent + 一项杀手锏,不让你编排/定制):
- **Grok Bot** = 固定 Grok 模型 + 持久 always-on 云电脑(文件/浏览器会话/登录态留存)+ 跨 app 登录代操作 + IM 派活入口。
- **OpenClaw + Hermes**(`pm-openclaw-hermes.md`) = **always-on 持久 async personal agent harness** 品类的开源双子星——OpenClaw(`openclaw/openclaw` 386k stars,前身 Moltbot,TypeScript)+ Hermes(`NousResearch/hermes-agent` 229k stars,Python/MIT,`hermes claw migrate` 互迁)。跑用户自己硬件、用 computer-use 控制整台机器、跨 IM 可达的 always-on 持久个人助手;子 agent spawn 是工具增强非编排核心。**它们是 Grok Bot 的开源前身**(英文社区主对照系),与 Grok Bot 同赛道(单品),**不是编排平台**(社区零编排讨论 + 显式"单一 trusted operator"安全模型放弃多租户)。
- **OpenMausBot**(`milind-soni/OpenMausBot`,`pm-openmausbot.md`) = **Grok Bot 赛道的开源克隆**(TS/React/Electron 桌面端 + per-turn spawn Claude/Grok + `--resume` 持久化 + 单 SSE 流 + driver SPI + permission broker)。`ask_bot` 委派是 P2P 1:1 主+子 half-step(深度 1 限制 + 忙时拒绝),**不是共享空间编排**。**单品爆款演化链的又一节点**:Grok Bot/OpenClaw/Hermes(纯单品,无协作)→ OpenMausBot(单品 + 想要协作 → 停在主+子 tool-call 半步)→ 我们/OPC(真正多 agent 编排)。印证「单品 → 想要协作 → 卡在主+子」演化瓶颈真实存在。社区真空,背后是 SupaMaus 商业实体(AI product tour 业务,OpenMausBot 是其免费开源线)。**技术栈与 agents-remote 高度重叠**(per-turn spawn + `--resume` + harness server + driver SPI),是工程借鉴参考而非产品竞品。

> ⚠️ **定位订正(Grok Bot 社区走查)**:我们原说"豆包 + 云电脑"(中文语境对照,用户秒懂),但**英文社区(246 评论)的对照系完全不同——12 处明提 OpenClaw、零处提豆包**,把 Grok Bot 当"**托管的 OpenClaw**"(always-on 持久 VM 的商业托管版)+ OpenClaw/Hermes 开源谱系的一员。OpenClaw/Hermes 走查(`pm-openclaw-hermes.md`)已确认:它们是 Grok Bot 的开源前身品类,**不是多 agent 编排的开源竞品底座**(原 §10 登记项的判断,已订正)。

**不让你定制模型/技能/MCP**,agent 是黑盒单品。社区走查铁证(246 评论**零编排讨论**)印证它是单品不是编排产品——这点从 ⚠️ 推断升级为 ✅ 社区证据。

### OpenClaw/Hermes 对 OPC 的定位(单品参考 + 两个范本 + 一个反面教材)

不进 §5 编排老师拼图(它们不是编排产品),但有三处可借鉴:

1. **memory 工程化范本**(两家流派,呼应 §4 角色记忆):**OpenClaw = Markdown 派**(agent 自管 workspace notes,与 Raft MEMORY.md 模式同源)、**Hermes = SQLite + FTS5 派**(结构化存储 + 全文检索,serverless persistence 含 Modal/Daytona idle sleep)。我们 memory 实现可在这两派里选或混用。
2. **always-on 持久 workspace**(呼应 Grok Bot 可学点①):跑用户硬件 + 持久 context + idle sleep(Hermes Modal/Daytona),是"角色级持久工作区"的开源实现参考。
3. **安全反面教材**:OpenClaw **CVE-2026-33579 CVSS 9.9 权限提升**(single trusted operator 模型 + 共享身份的脆弱性铁证)——与 Grok Bot 走查的 **accountability sink**(§4 独立 identity 铁律)独立印证:共享用户身份的 agent harness 必然是责任黑洞 + 攻击面。**OPC 每 agent 独立 identity + scoped 权限是结构性安全差异化,不只是产品差异**。
4. ⚠️ **要防:harness 与原厂张力**——Anthropic/Google 双封杀 OpenClaw(条款冲突)。我们若做 provider-agnostic harness,要预判 provider 条款变动的风险(多 provider:Claude/Codex/pi 是对冲)。

### Grok Bot 的真正可学点(两条,都不是编排)

1. **持久 always-on 云电脑**——agent 有一台跨任务留存的电脑(文件、浏览器 session、登录态都留着),这是它做成一等公民的东西。对应我们的"角色级持久工作区"。社区认可这点(把 Grok Bot 当 OpenClaw 的 always-on VM 形态)。
2. **跨 app 登录代操作**(能力维度)——agent 能登你的 GitHub/邮箱/各类工具代你干活。这是我们目前没有的能力维度,值得考虑——但**实现上必须用独立 identity,不能用"共享用户 session"**(见下面反面教训)。

### Grok Bot 的反面教训(别学)

- **黑盒不可定制**:不让你换模型、不让你挂技能、不让你配 MCP。我们的 agent 必须可定制(模型/技能/MCP 全可挂),这是我们的差异化,不是要抄的。
- **共享用户登录态 = accountability sink(责任黑洞)** ⚠️ 重要:Grok Bot 让 bot 用用户账号登录(共享 session),社区强烈反对——bot 的所有越权/违法操作都算到用户头上,因为系统里没有"bot 自己"。社区主张 bot 应有自己 IDP 身份 + scoped 权限。**这是铁律级教训**,已在 §4 角色身份节落地:我们的 agent 必须独立 identity + scoped 权限,这是我们相对 Grok Bot(及所有"agent 接管用户账号"类 SaaS)的结构性安全差异化。
- **always-on token 成本爆炸**:内测者报告月 token 超过去 5 年总和、3 小时烧 52% 周额度。全员 always-on 不可持续——OPC 应走"按需唤醒 + 持久 context compaction"(呼应 §3 我们选 workspace 焊点 + todos.dev idle 10 分钟 sleep),不是"每个 agent 7×24 在线"。
- **信任是比 lock-in 更深的 SaaS agent 阻力**:246 评论 ~30% 是"不信任 Musk/xAI"。lock-in 可自托管绕开,**信任不可绕开**——私有部署是我们相对所有 SaaS agent 产品的根本信任差异化,不只是功能差异。

Grok Bot 的定位:**单品形态参考**(学持久 VM 一点 + 引出独立 identity 铁律),不是编排老师。它在 §5 拼图里不出现。

## 10. 待定 / 开放

(讨论中、还没收敛的问题记这里,收敛后搬上去)

- **派活交互形态落地**:一句话/消息式为主(§7 共性 ①),PRD 第一期入口具体怎么落地待定。
- **协作状态机第一期做不做**:倾向不做,第一期只做同事+项目两层静态实体,协作靠任务传递简单串,协作状态机留第二期圆桌。
- **三阶段流水线(Plan→Build→Review)第一期是否引入**:todos.dev 工程化最清晰(带 Confirm/Review 两道硬关卡 + AI review),Raft verification gate 强化,待定。
- **信任光谱定位**:cf-os"零信任架构"(agent 不可信,错误无影响,credential 永不给 agent)是反面参照;OPC 是"有限信任 + 审批"。我们的编排层落在信任光谱何处(完全不信 / 有限信任 / 高度自治)是 PRD 未回答的问题。
- **Raft 试用实测**(部分答案见 `pm-raft-community.md`):① **AX held draft = ✅ 真已实现**(知乎 kael-23-32 CLI 实测),inbox pull / AX 四问 / verification gate 实战有效性 = 仅博客自述,**仍需真实注册自测**;② **成本治理「1.2B tokens/day」真实账单 = 结构性真空**(无任何第三方晒过 token 账单,黄东旭访谈是通用哲学非 Raft 专属评测,唯一公开成本痛点是 Vibe Coding Life「10 分钟烧穿 session limit」),**仍需真实注册自测成本**。两项 community 走查能回答的已答(见 §6 + §8),剩下的只有真实注册闭环。
- **OpenClaw/Hermes 调研已闭环(`pm-openclaw-hermes.md`)**:原以为它们是「OPC 多 agent 编排的开源竞品底座」——**判断错了一半**。走查确认它们是 **always-on 持久 async personal agent harness 品类的开源双子星**(OpenClaw 386k stars / Hermes 229k stars),是 **Grok Bot 的开源前身**,与 Grok Bot 同赛道(单品爆款),**不是多 agent 编排平台**(子 agent 是工具增强非编排核心 + 社区零编排讨论 + 单一 trusted operator 安全模型放弃多租户)。**缺口部分成立**:补的是「品类认知」(我们漏了 Grok Bot 这条赛道的开源前身),不是「编排竞品」。它们不进 §5 编排老师拼图,但 memory 工程化范本(OpenClaw Markdown 派 / Hermes SQLite+FTS5 派)+ always-on 持久 workspace 参考 + CVE 安全反面教材值得借鉴(详见 §9 OpenClaw/Hermes 小节)。
- **Hermes 控制 coding 工具做开发走查已闭环(`pm-hermes-coding-community.md`,承接「Raft 执行黑盒」开放问题)**:我们问"agent 调 claude 干开发,怎么观测/review/失败续接"——Raft 把这层当黑盒(只看 channel 消息 + task 状态),而 Hermes 恰是"agent 控制 coding 工具干活"的 harness 本体,社区给了可操作答案。**核心:manager-worker 分工是 Hermes 社区三方独立收敛的共识**(theaiagentindex stack + OnlyTerp 实战指南 + 官方 skill 目录)——Hermes 不自己写代码,`terminal` 工具 subprocess-spawn coding CLI(`claude -p` print mode 官方标 "PREFERRED" / `codex exec` pty=true),中心 orchestrator 持 state/memory/approvals/Kanban 任务生命周期,coding CLI 当 worker;Teknium 官方明令"**不要反转关系**"(让另一 agent 当 orchestrator + Hermes 当 dumb launcher 会断 trace、memory 停止累积——OPC 多 agent 同理,中心必须保持 context 累积)。**观测默认 = 事后摘要回传 IM + git diff 链接 + print JSON(num_turns/cost/subtype)**,不是 tool call 流水(实时透传是框架能力、社区少用,会成噪音)。**失败续接无"测试失败自动重跑"标准化机制**,三件套 = coding CLI 自带 `--resume`/`-c` + `process` 工具 poll/submit/kill + Kanban lane(任务状态 survive restart/retry/handoff),Hermes 独门 self-improving 从失败沉淀 skill 但**显式排除环境性失败**(防负面断言固化成 workflow);反面教材 **#81298 一张 review card 被重派 132 次**(behind 429s 才 trip circuit breaker)——自动重试必须带护栏。**人介入看着最强、实则盲(用户视角订正,见下)**:`busy_input_mode` 三语义 interrupt/queue/steer(IM 消息默认打断当前 turn、工具在安全边界结束)+ approvals 审批 gate 标配(危险命令拦截 + 超时 fail-closed + 无人值守 deny)是官方能力,但用户实测证明介入=打断式+破坏性+盲——in-flight 零观测 #18127(唯一 debug 手段是 kill 看上下文)、打断是 kill/rewind #11508、queue 静默不可取消 #32474、用户想要的 thread-bound 直连 coding 会话(#5394)与 remote bridge(#25808)全未合入;介入的是 **Hermes 层 turn 与审批门,不是 claude session 内部**——Hermes 对 claude 内部同样黑盒。见 §6 第六条 ⚠️ 打断 ≠ 介入。**对 OPC 三条直接落地**:① "agent 调 claude 干开发" = orchestrator 管任务/审批/记忆 + claude 当 worker(`claude -p` + `--resume` 续接),web 后端无 PTY 环境默认 print mode(已证坑:gateway bubblewrap 失败 + #5135 作者明说 print mode 是 gateway 必选);② 失败续接三件套照抄 + 禁无上限重派(#81298);③ 人介入三语义照抄 + approvals gate 标配。**差异化空白 = 失败续接端到端协议**(测试失败 → pytest 输出/退出码结构化回传 → 续接/升人决策,做成显式协议——Hermes 只有碎片无闭环,OPC 可做)。
>
> **用户视角追加(`pm-hermes-user-observe-worker.md`):这是"manager 观测 worker"开放问题的第二个角度——上面是 Hermes 源码/官方视角,以下是用户真在怎么用、怎么踩坑。核心裁决:① "看不到 worker 内部"是 Hermes 社区第一高频痛点**——最硬证据 #18127(in-flight session 零观测面,sessions list 只显示 finalized、agent.log 静默、唯一旁证是 journalctl 的 llama-server 流量、唯一 debug 手段是 kill 看上下文=破坏性)、#56405("text snapshots 不够、要 over-the-shoulder 实时")、#69121("looks like a slow/black-box dispatcher instead of a control tower")、#7395(Telegram 远程时 terminal 输出根本不回传)。② **用户默认观测 = 事后摘要 + git diff 链接**(多源收敛),主动层 `/agents` 看板 + live transcript `tail -f` + 桌面 watch-window 都被三个官方补丁(#67479/#47060/async_delegation)填,但**"能力存在 ≠ 用户知道/在用"是 PR #34704 的最强洞见**——`/agents` spawn-tree 看板早就存在,但"用户得已经知道去敲 /agents"才加提示,OPC 任何观测面都要主动 surface 入口。③ **用户介入的实战 verbatim 稀缺**,且能讲清的介入全是失败例(见 §6 第六条 ⚠️:介入=打断式+破坏性+盲,非精细介入),三个真实失败模式必须防:父 agent 被误判 idle 杀掉(#7295 child 活动未心跳回传 parent)、subagent hang 无超时(#3120 挂 40 分钟)、消息静默排队不可取消(#32474 要 `/queue cancel`)。④ **18 条坑里三条是状态层事故**:#70294(cron 里 delegate 结果静默丢、job 报 ok)、#79278(压缩吃掉 in-flight tool chain 导致副作用重放——非幂等操作被重复执行)、#23419(cron 静默烧 $20/天无 cost cap)。**对 OPC 的落地**:观测默认面 = 开发任务结果卡片(改哪些文件/测试过没过/num_turns/cost/diff 链接),实时透传高级可选(**不要默认全量 tool call 流水,chrome 太多也淹死用户 #76147**);异步 worker 生命周期第一天就有(spawn → check(状态+recent output)→ steer(mid-flight 注入)→ cancel → collect,用户被 #11508 卡了两个月官方 2026-06 才补);live transcript 一次一文件 `tail -f`(append-only,dispatch 时预创建,比 push 全量流更合"事后摘要为主"的社区默认);child 活动心跳回传 + wall-clock 超时 + queue 可见可取消 + 每任务成本预估/cap/circuit breaker 全部前置。
- **Multica 社区走查关键裁决(`pm-multica-community.md`)**:Multica 不是 Avernet 式社区真空,是「中文团队主导、英文圈低能见度、GitHub 内部高活跃」(45.6k stars / 仅 160 watcher 倒挂,但 #815 16react 深度分析 + maintainer `Bohan-J` 在场回应 + B2B fintech `jmoney8896` 真生产用)。**三条定级订正**:① **#3033 双触发 bug 已修**(2026-05-22 commit `46a29b1e`,`HasPendingTaskForIssueAndAgent` 幂等检查 + 专属测试)——我们 pm-multica.md 当「已知 bug」是过期信息,应改为「**已修,学幂等范式**」(OPC 派活去重可抄这个幂等检查);② **#1282 project leader 官方明确拒绝硬编码**(非「未实现」——`Bohan-J`「Team workflows vary a lot,if we pick one shape everyone else has to bend their process」),启示反转为 **OPC 差异化机会**:做可配置 project leader 抽象,不锁死一种组织形态;③ **AI-native 是目标态非现状**——#815 戳穿「still manages AI the way it manages people」,编排深度是社区诉求(#815/#1943/#4804/#6227)非 Multica 现状。最该学「反 Paperclip 的 human-in-the-loop 路线 + maintainer 在场 + 结构化 issue×task 双层」,最该避免「agent 关系塞 free-text instructions 的脆弱性」(B2B 真生产已踩坑)。
- **Paperclip 社区走查关键裁决(`pm-paperclip-community.md`)**:Paperclip 与 Avernet 社区真空**完全相反**——是「源码可读 + 社区能见度高 + 外部参与真实」(77.6k stars / **380 watchers** 真实、3 个独立 Reddit 子版、外部 issue 作者高度分散非自产自销、B2B 真生产采用)。**编排抽象判断全被社区独立背书可学**(task 即通信 / goal ancestry ≤6 现拼 / 双阶段审批 / PostgreSQL 状态焊),但**严重低估 4 大实战痛点**:① **成本爆炸**(HN 用户报 context 吹到 20-30k + thinking_tokens 81%,goal ancestry ≤6 的省钱承诺**没兑现**——OPC 抄必须配 **token 预算硬监控**,不能只靠 ancestry 截断);② **多 agent 并发竞态是长期高频痛点**(GitHub search race/concurrency/deadlock 命中 **1266 issue**,非孤立——`#11147 cancelled run 丢唤醒 / #11148 worktree 致 assembly 不可能 / #11077 三连锁致静默宕机`;OPC 多 agent 同任务必须有**串行化 + claim 硬约束**(呼应 §6 AX + Raft claim));③ **orchestration 黑箱**(社区「just a UI on top of agents」);④ **adapter 集成脆弱**(CJK 乱码对 OPC 中文场景直接相关)。**'zero-human company' 是营销话术被四源互证戳穿**(社区「empty instructions and rate limits nearly killed it」+ flowtivity 报真实事故「23 leads instead of 3」揭示错误在 agent 间传播放大)。Paperclip 作为「层级编排老师」的定位降级:机制可学(goal ancestry + 双阶段审批),实战可用性是反面警示,别照抄组织形态。
- **Avernet 社区真空的运营启示**:Avernet 有源码没社区(star 453 / watcher 2 倒挂、issue 90%+ 内部自产自销、英文技术圈零讨论)——典型"大厂背书早期项目"。"蚂蚁光环=中文媒体抢发但开发者不跟"是个坑。我们 OPC 个人项目的社区运营策略应反过来:star 不重要、watcher 与外部参与才重要;要赢社区心智,有空间抢占 Avernet 未占据的"多 agent 协作底座"位。
- **Buzz 社区走查的可用性警示**:Buzz 是"声量高 + 上手率也高但实战可用性低"——开源两周 26k stars + 多个独立上手报告,但几乎每个上手者都踩坑(token 开销 greeting 31k vs Claude Code 4k、thread 内 @mention 让对话"碎"、approval gate 命中即 fail、harness glue bug)。**Block 内部版 ≠ 开源版**(员工用预接 relay 的内部 build,dogfooding 不等于公开版质量)。OPC 启示:dogfooding 要用公开版而非内部版,否则 bug 率认知会失真;per-turn spawn(channel history 是 continuity)vs 常驻 session(CLI 内 history)是两种反向架构取舍,两者都有 token 成本问题但形态不同(Buzz 是回放爆炸,我们是累积爆炸),我们应明确自己在光谱的位置。
- **Firecrawl 接入**:tvly 额度用完后调研改用 curl+HN Algolia+DDG,Reddit 全文/复杂页面弱。Firecrawl(1000 credits/月免费)可解,需用户注册拿 API key 后配进 MCP。
- **OpenMausBot 调研已闭环(`pm-openmausbot.md`)**:**单品爆款赛道开源克隆**,非编排竞品。判定 = 单品(无群聊,`ask_bot` 是 P2P 1:1 主+子 half-step,深度 1 限制 + 忙时拒绝,无共享空间编排;memory 仅 transcript 回放无结构化记忆)。**演化链印证**:Grok Bot/OpenClaw/Hermes(纯单品)→ OpenMausBot(单品 + 想协作 → 卡在主+子 tool-call)→ 我们/OPC(真正多 agent 编排),「单品 → 想要协作 → 卡在主+子」瓶颈真实存在。技术栈与 agents-remote 高度重叠(per-turn spawn + `--resume` + harness server + driver SPI + permission broker),**4 处工程可借鉴**入 §5 老师拼图:① driver SPI(provider 切换走统一 interface,呼应我们多 provider);② permission broker(细粒度审批拦截,呼应 §7 决策 6 独立 identity);③ `--resume` 持久化 + harness server(per-turn spawn 但跨 turn 保持状态的工程实现);④ 单 SSE 流(非 WS,长连接简化)。背后 SupaMaus 商业实体(AI product tour 业务),OpenMausBot 是其免费开源线。社区真空,不进产品对标,仅作工程参考 + 演化链节点。
- **OpenOPC 调研已闭环(`pm-openopc.md`)**:**学术 + 同名直接竞品**,HKUDS 实验室(Chao Huang / LightRAG 团队),1266 stars / **9 watchers 社区真空**。MIT badge 但 **NO LICENSE 文件三重确认**(法律可用性存疑,不可直接 fork)。无 arXiv 论文。**本批次工程严谨度最高的编排引擎**——14 态 phase enum + 静态 `ALLOWED_TRANSITIONS` 转换表 + 6 模式 TurnMode + DAG TaskGraphScheduler + attempt ledger(防重调度死循环)+ DFS 死锁检测 + EscalationEngine(300s 超时)+ EmployeeEvolutionManager(per-role 学习,LEARNED_SKILL_THRESHOLD=2)+ SeatExecutor + company_runtime_identity(root session + checkpoint)。**产品形态不对标**:目标是"单机全自动公司模拟"(company_runtime 单 root session 驱动 AI 自己开公司),我们是"人主导 + 移动控制面"——机制可学、产品正交。**进 §5 的可学机制**:① 任务状态机最显式实现(14 态 + 静态转换表,留作第二期圆桌协作状态机参考);② attempt ledger + DFS 死锁检测(多 agent 并发防死循环,呼应 §6 AX + Paperclip 1266 issue 反证);③ risk 四档审批(low/medium/high/critical + LLM review 兜底 medium);④ **Self-Grown memory = promote-from-private**(recurring lessons ≥2 次从 private profile 提升为 shared skill,**避开 Raft 反对的共享 pool 陷阱**——留作长记忆后续参考路径,非第一期)。**Self-Grown 信任度判定**:有源码实现(非 Paperclip 式纯营销),但社区真空无第三方验证,学术原型概率高,机制可信但产品成熟度存疑。
- **CodexLoom 调研已闭环(`pm-codexloom.md`)**:**本批次意识形态最接近的产品**,361 stars / **0 watchers 社区真空**,Go,Elastic License 2.0(非 MIT,商用受限),作者 yan5xu(Yanwu,code-relay/ququ/oh-my-ai-company 同主题连续探索史)。**最强印证**(进 §4 角色 + §8 边界):① **Domain Agent = 我们带累积协作史的「角色」**(long-lived thread 是 tacit context carrier,跨 compaction 提炼,不能单 prompt 重建);② **per-agent primary thread = 我们 per-agent 私有记忆不做共享脑**(直接印证 §8「不做共享记忆池」);③ **Profile Identity/Domain/Scope = Name>Role**(Scope 字段补我们「偏出强项时说明」的工程化,PRD 第一期角色定义可加 Scope 字段,哪怕可选);④ **Lead/Internal/Interface 是组织模式非硬编码类型**(三路独立收敛,进 §7 共性⑩)。**两个工程借鉴**:① **Epoch Context Coverage**(compaction 后下 turn 重新覆盖 durable source + 双证才 covered + per-thread ledger + at-least-once)——**直接借鉴解我们 `../../research/claude-replay-performance.md` 长会话回放上下文压缩问题**,留作 claude replay 性能优化的设计参考;② **CodexHost + codex app-server JSON-RPC**(thread/resume + thread/inject_items + turn/start)——**Codex 对接的现成工程参考**(呼应 PRD §7 决策 5「Codex 角色人设注入待测」),codex app-server 是 Codex 对接的官方协议层。**一个分叉(第一期持久化路径讨论)**:CodexLoom 核心是**长驻 Domain Agent**(thread 持久 + Epoch Coverage 保连续性),我们第一期选**任务为执行单元、agent 按需 spawn**(对齐 §7 共性② + PRD §7 决策 7「按需唤醒」)——分叉合理:我们多 provider + 成本敏感 + 第一期先跑通单 agent 多角色;CodexLoom 单 provider(Codex)+ 长驻换连续性。**留作第一期持久化路径的分叉讨论对象**:若第一期后发现「按需 spawn + 每次重建 context」成本/体验不达标,长驻 Domain Agent + Epoch Coverage 是备选升级路径。**不进 §5 老师拼图的核心**:它是 Codex 专属 + 长驻范式,与我们多 provider + 按需 spawn 正交,但四图分离 / Epoch Coverage / Profile Scope 三项进 §5 作为维度老师。
- **Raft 社区走查关键裁决(`pm-raft-community.md`,承接 pm-raft.md PM 视角纠偏)**:Raft 是闭源商业产品(无 GitHub issue 可查),走查方法 = 博客/播客/X/独立评测/HN/竞品社区提及/融资数据库。**核心裁决:§8「最接近现成形态」定位不推翻,但加限定「基于官方自述 + 小规模独立验证(held draft/Task Claim/MEMORY.md/daemon 4 项已证),inbox pull/四问/verification gate/9 runtime 中 5 种仍待大规模社区验证」**(详见 §6 + §8)。**4 条 P0 修正**:① held draft 被 CLI 实测证实真已实现(§6);② 「1.2B tokens/day」保留 peak 推断标注不升级为已证(单一官网来源 + 黄东旭访谈是通用哲学非 Raft 专属评测);③ 「9 runtime BYO」改「4 runtime 已第三方实测(claude/codex/gemini/opencode)+ 5 runtime 待证」;④ §6 AX 新增「沉默是一等公民」三产品收敛(Raft held draft + Buzz post-mortem + CodexLoom `no_reply`)——community 走查发现 pm-raft.md 缺失的跨产品最强背书。**新盲点:集成脆弱**(知乎 kael-23-32 的 4 坑——CLI npm 装 / device-code 异步 / **provider 残留静默失败**(fallback 50 字文本「看起来像真回复但实际不是」)/ launchd proxy 不继承 + adapter `send()` no-op)——**借鉴 Raft 必须在 adapter 层做显式错误传播**,不学 `send()` no-op 这种胶水缺陷(与 Buzz #4923 silent failure 同族,与 Paperclip adapter 集成脆弱、Multica free-text instructions 脆弱性共同构成「**多 agent harness 的 adapter/胶水层是 silent failure 重灾区**」横切警示——OPC 编排层所有 provider 集成必须有显式错误传播,不能静默 fallback)。**两条结构性风险**:① 英文社区结构性真空(HN/Reddit/Slashdot/Crunchbase 全零 + 竞品社区零提及,唯一竞品提及是 Buzz 帖里 `lxdlam` 误称 Raft「open source」)——agents-remote 做开源英文版不能从竞品社区引流 Raft 范式用户;② 真实成本账单 = 社区真空(唯一痛点数据点 Vibe Coding Life「10 分钟烧穿 session limit」)。
- **todos.dev 社区走查关键裁决(`pm-todos-dev-community.md`,承接 pm-todos-dev.md PM 视角纠偏)**:主调研「社区真空」结论经 4 渠道一手复核**强烈成立**——todos.dev 是本批次**社区真空最彻底**的形态(闭源 GitHub org 0 公开 repo/0 follower + HN 8 组 query 全零 + Reddit/PH/YouTube/中文社区双源零 + 三大主流目录无确认 listing + 仅 6 条 AI 工具聚合号机械复述同一句)。**关键修正(见 §5 todos.dev 段落)**:① maintainer 身份锁定 = Zen(@supezen,中文 indie maker,X 32K followers,已有 ChainFM+Dokobot,todos.dev 是其第三个未站稳的 side project 未列入个人主页);② **todos.dev 设计借鉴价值(9-phase+两道门+三层 memory+bounded curation)全部 docs 自证零社区背书**——「任务状态机老师」维度社区背书优先 pm-openopc(显式 FSM+源码可读)+ pm-multica(#815 源码级+80 issues 实战),todos.dev 退居「docs 设计参考」,借鉴必须配套自测;③ npm 下载量呈「上线峰值(7/04 单日 770)→ 断崖衰减(8 月多日 <100)」趋势,「小但真实用户基数」乐观解读不成立,更像推广窗热度退潮;④ maintainer 公开唯一真实成本数据点 **单 task $9.6**(配合 $19/月 flat 即跑 2 task 够本月月费,但绝对值说明三阶段流水线 token 开销不小)——OPC 若走类似流水线需内置成本上限 + 阶段级 token budget。**评估早期 agent 产品社区健康度的方法论增量**:日均下载趋势比周/月聚合数更诚实(平稳基线 = 稳定用户群,峰值后衰减 = 推广窗热度退潮),第三方目录信息是否跟进官方变化(落后 = 无第三方在跟踪 = 关注度极低硬信号)——OPC 自己上线后也应监控这两个信号。
