# Hermes bot mode（hermes-bots 多 profile 体系 + Kanban）· 理念走查

> 承接 `pm-hermes-coding-community.md`（源码/官方 skill 视角）与 `pm-hermes-user-observe-worker.md`（用户观测/介入视角）。本文件回答一个具体问题：**Hermes 新出的 "bot mode"（hermes-bots）理念到底是什么**——它看起来要"结合协作层与会话层两种形态"，本文从官方文档（Profiles / Kanban 全文）+ GitHub issue/PR 证据拆解其设计理念，并与两层栈（`../design/opc-product-discussion.md` §2.5）对照。

## 一句话定位

**Hermes bot mode 的理念 = 把 agent 的身份单位从 session 提到「整台 profile」（每台独立 config/记忆/人格/IM bot 身份），把 agent 间协调从进程内 RPC（`delegate_task`）降级为一块持久化、人和 agent 平等读写的 SQLite Kanban 板（协调介质即数据库行，天然可观测/可回放/可被人 mid-turn 改）；再往上为「多 bot 相处」长出桌面 roster / @mention / per-profile IM 身份——即从会话层往上长协作层，Kanban 是中缝。但它长得很挣扎：`delegate_task` 路径依旧是静默后台子 agent（#86135 "Makes C-suite feel fake"），顶层可见会话是最薄的短板。**

## 1. 先厘清："bot mode" 两个含义，别混

- **旧义**（2026-03 起，IM adapter 层技术模式）：WhatsApp/Telegram 以 bot 身份收发消息（bot token、guest mode、Secretary Mode）。**不是**"结合两种"的那个。
- **新义**（2026-08 活跃开发，用户所指）：**hermes-bots 多 profile 体系**——CEO/CTO/CMO/CSO 各是一个 bot，每个 bot = 一台完整独立的 Hermes profile；桌面端 roster 侧栏、@mention 补全、agent 间消息 attributed 卡片。本文全部指新义。

## 2. 理念三件套（官方文档直证，✅）

### 2.1 身份的最小单位 = 整台 profile，不是 session

官方 Profiles 文档（✅ 原文）：

- 一个 profile = 一个独立 Hermes home：自己的 `config.yaml`、`.env`、`SOUL.md`（人格）、memory、sessions、skills、cron、state DB。
- 创建 profile 即获得同名命令（`hermes profile create coder` → 直接有 `coder chat` / `coder gateway start`）。
- **每台 profile 跑自己的 gateway 进程 + 自己的 bot token**（Telegram/Discord/Slack/WhatsApp/Signal）；token 冲突有锁保护，第二个 gateway 会被明确报错拦截。
- 官方明令：**绝不允许两个 agent 进程共用一个 profile**——"两个写者互相加载对方写入的记忆……直到它不再是你配置过的任何东西"。需要共享记忆的 agent 应走外部 memory provider。
- profile 可打包分发：`profile export`（tar.gz，密钥剥离）/ git 仓库发行版（`profile install github.com/you/research-bot`，收方保留自己的 memory/.env）——**"整个 agent 是可分享的制品"**，这是把 agent 当"数字同事"而非"会话"的明确信号。
- 隔离边界诚实声明：profile 只隔离 Hermes 状态（`HERMES_HOME`），**不是 sandbox**——不限制文件系统访问；host 安装下工具子进程默认保留真实 `HOME` 让 git/ssh/gh/claude/codex 凭据可用，严格 per-profile CLI 身份要显式 `terminal.home_mode: profile`。

### 2.2 协调介质 = Kanban 板（持久队列 + 状态机），不是消息、不是 RPC

官方 Kanban 文档（✅ 原文）给了自己的对比表——这是它理念里最自觉的一刀：

| | `delegate_task` | Kanban |
|---|---|---|
| 形态 | RPC 调用（fork→join） | 持久消息队列 + 状态机 |
| 父任务 | 阻塞等子任务返回 | create 后 fire-and-forget |
| 子身份 | 匿名 subagent | 有名字、有持久记忆的 profile |
| 可恢复 | 无——失败即失败 | block→unblock→重跑；crash→reclaim |
| 人介入 | 不支持 | 任意时点 comment / unblock |
| 审计 | context 压缩即丢 | SQLite 行永久留存 |
| 协调结构 | 层级（caller→callee） | 对等——任何 profile 读写任何任务 |

官方一句话："*`delegate_task` is a function call; Kanban is a work queue where every handoff is a row any profile (or human) can see and edit.*"

机制要点（✅ 文档）：

- 板 = `~/.hermes/kanban.db`（SQLite WAL）；任务状态机 `triage|todo|ready|running|blocked|review|done|archived`；`task_links` 记 parent→child 依赖，dispatcher 在父全 done 时 promote `todo→ready`。
- **两个前台，同一 DB**：agent 走 `kanban_*` 工具集（dispatcher spawn 时注入 `HERMES_KANBAN_TASK` env 自动开启）；人/脚本/cron 走 `hermes kanban` CLI / `/kanban` 斜杠命令 / dashboard 拖拽。三个面（CLI/工具/dashboard）走同一 `kanban_db` 代码路径，"by construction 不会漂移"。
- worker 生命周期写进 spawn 时注入的 system prompt（`KANBAN_GUIDANCE`）：`kanban_show()` 读任务 → 干活 → 长操作 `kanban_heartbeat()` 保活（≥1 次/小时，否则 4h stale 被收回）→ `kanban_complete(summary, metadata)` 结构化交差（metadata 约定 `changed_files`/`verification`/`residual_risk` 等证据键）。exit 0 但没调 terminal board 工具 = protocol violation，nudge 后有界重试（默认连续 3 次）后 auto-block。
- **parent link 是上下文交接通道**：子任务 spawn 时 `build_worker_context` 携带每个已完成父任务的 `summary`+`metadata` 原文——"repo 状态告诉后续 worker 代码长什么样，但不告诉它**为什么**；决策/测试/改动文件活在父任务的结构化 handoff 里，不在 git 里"。
- 工程护栏全是确定性 DB 守卫而非 LLM 判断：unblock↔re-block 循环计数（默认 2 次→路由 triage 交人）、断路器（`failure_limit` 连续失败→`gave_up` auto-block）、respawn guard（`blocker_auth`/`recent_success`/`active_pr` 拒绝重派）、协议违规有界重试。
- `--goal` 卡借用 `/goal` 引擎（Ralph 式 judge loop）：每 turn 后 judge 对照卡片验收标准，没做完且预算未尽就同 session 继续。
- 成本结构自觉：frontier 模型跑 orchestrator、便宜模型跑 worker（token 大头在 worker）；敏感卡可用 per-task `--model` 覆写单独上强模型。

### 2.3 会话面 = 桌面 roster + per-profile IM 身份双入口（胚胎期）

- 桌面 app：profile switcher、roster previews（各 profile 最新消息预览）、@mention 补全（#85799）、agent 间消息渲染成 attributed 卡片（#85855 "agent-to-agent messages"、#85841 @name mentions）、⌘K export/import profile。
- IM 世界：每 profile 独立 bot token = 每个 agent 在 Telegram/Discord 里有**自己的脸**（不是同一个 bot 转发）；`/kanban create` 从 gateway 发起时自动订阅该聊天的终态事件（completed/blocked 一条消息回报，含 result 首行）。
- **`/kanban` 显式豁免 running-agent guard**（✅ 文档原文"Mid-run usage"节）：gateway 通常在 agent 思考中排队用户消息（防双 turn），但 `/kanban` 读写直接执行——"这就是分离的全部意义"：worker 卡在等 peer → 手机上 `/kanban unblock t_abcd`；发现卡需要人的上下文 → `/kanban comment` 落进任务线程，该任务**下一次运行**的 `kanban_show()` 会读到。**人可以在不打断任何运行中 agent 的情况下介入协调层。**

## 3. 诚实修正：Kanban 路径的观测面比之前结论的更完整

`pm-hermes-user-observe-worker.md` 的"零观测"结论适用于 **`delegate_task` 路径**；Kanban 路径其实有一整套持久化观测面（✅ 文档 + Worker visibility endpoints）：

- `hermes kanban log <id>`（worker 日志文件）、`tail <id>`（单任务事件流）、`watch`（全板事件流）、`runs <id>`（每次 attempt 一行：结局/耗时/summary）、`context <id>`（worker 实际看到什么）。
- REST：`/workers/active`（PID/profile/task/started/last-heartbeat）、`/runs/{id}`、`POST /runs/{id}/terminate`、`/inspect`（dispatcher 快照）。
- dashboard drawer：Run History 每次 attempt 一行彩色记录 + WebSocket 实时刷。
- 心跳带 note（"halfway through — 4 of 8 files transformed"）= 结构化的进行中叙述。

**但注意观测粒度的边界**：这些是**协调层观测**（任务状态/事件/attempt/心跳 note/完成摘要），不是**worker 内部逐 token 流**——后者在 Kanban 路径里也只有 `hermes kanban log` 的 worker 日志文件，且 #86135 显示用户连"点开 chief 的对话线程"都还做不到。两层栈的语言说：**中缝观测它做全了，底层会话观测（stream-json 级）和顶层会话形态（可见 bot 对话）都没做**。

## 4. #86135：顶层长不出来的铁证（✅ issue 直证）

**#86135 "hermes-bots: CEO delegate_task should open a visible C-suite conversation"**（2026-08-14，open）：

- 场景：CEO/CMO/CSO/CTO 以独立 bot/profile 存在；CEO 用 `delegate_task` 派活给 cto/cmo/cso。
- 痛点 verbatim：**操作者看不到 CTO/CMO 的对话线程，只在 CEO 聊天里收到摘要——"Silent background subagent. Operator cannot audit the chief. Makes C-suite feel fake."**
- 用户明确对标 Grok Bot（xAI）：每个 chief 是一个 section 里的**真实对话**，操作者可以点开 CMO/CTO 读工作过程；期望形态 = "N messages with CTO" 链接点开可见线程。

这与 `pm-hermes-user-observe-worker.md` 的 #18127（in-flight 零观测）**同源**：`delegate_task` 的匿名后台子 agent 机制在 bot 时代暴露为"C-suite 是假的"。修复方向（Grok Bot 式可见 per-chief 线程）正是两层栈的顶层形态。

相关证据：#80967（footer 需显示 bot 名区分多 bot）、#83859（multiplex 下 cron 用错 bot token 发送）、#83391（不同 profile 显示同一个 token）——多 bot 身份刚起步，bug 密集。

## 5. 旁证：v0.17.0 接入 Raft 网络（🟡 官方 release note）

Hermes v0.17.0："Hermes reaches the Raft agent network as a gateway channel"——wake-channel bridge，隐私设计只传元数据不传消息体。Hermes 自己承认单机会话层产品不是终点，选择接入别人的协作网络当 channel，而非自建顶层。

## 6. 对照两层栈（`../design/opc-product-discussion.md` §2.5）

| 两层栈 | Hermes 对应物 | 成熟度 |
|---|---|---|
| 顶层 raft 形态（teammate、对话观测介入） | 桌面 roster + @mention + attributed 卡片 + per-profile IM 身份 | **胚胎期**，#86135 是顶层缺口铁证 |
| 中缝（协调介质） | Kanban 板：持久队列+状态机+确定性护栏+双前台同 DB | **相当完整**，理念最自觉的部分 |
| 底层会话层（runtime 控制） | profile 体系（每 agent 完整独立 runtime） | 成熟（但 stream-json 级观测仍缺） |

**结论：Hermes 正在从会话层往上长协作层，且它长得很挣扎——这反向验证两层栈的判断：顶层（人和 agent 相处的会话形态）不是会话层产品顺手就能长出来的，它得被当成一等产品设计（Raft 的功夫就在这层）。同时它的 Kanban 中缝证明：协调介质做成"人和 agent 平等读写的持久数据"时，mid-turn 介入、审计、回放、确定性护栏全都自然获得——这是中缝的正确形态。**

## 7. 对 OPC 的启示

1. **该抄（中缝）**：协调介质 = 持久 DB 行而非进程内 RPC。agents-remote 若做多 agent 编排，任务板应为唯一真相：人/包工头/worker 三方读写同一 `kanban_db` 等价物，每个 handoff 是可审计的行；断路器/循环计数/respawn guard 用确定性 DB 守卫不用 LLM 判断。
2. **该抄（身份）**：agent 身份单位 = 整台 profile（独立记忆/人格/token），禁止共享 profile 的"双写者互染"警告值得直接写进设计文档。
3. **该补（Hermes 的缺口=我们的机会）**：`delegate_task` 静默后台子 agent 是 #86135 与 #18127 共同的病根。agents-remote 底层已有 claude2 stream-json 全量观测 + JSONL 回放——**包工头派活给 worker 时，每条派生会话天然是可点开、可逐 token 观测、可 --resume 的真实会话**，这正是 Hermes 用户要而不可得的"Grok Bot 式可见 chief 线程"在会话层的实现基础。
4. **该防**：顶层不要做成"摘要回传进 CEO 聊天"——摘要不是会话，用户要的是可审计的线程本体。
5. **parent link 的上下文交接**：子任务携带已完成父任务的 summary+metadata 原文，"repo 告诉你 what，handoff 告诉你 why"——多 agent 编排里上下文交接通道要显式设计，不能假设子 agent 自己去翻 git。

## 8. 证据清单

- ✅ 官方 Profiles 文档全文（hermes-agent.nousresearch.com/docs/user-guide/profiles，2026-08 抓取）：profile=独立 home、命令别名、token 锁、禁止双写者、export/git 分发、非 sandbox 诚实声明、`home_mode: profile`。
- ✅ 官方 Kanban 文档全文（同站 /docs/user-guide/features/kanban，2026-08 抓取）：vs delegate_task 对比表、kanban_* 工具集、worker 生命周期/心跳/protocol violation、parent link 上下文交接、确定性护栏（block 循环/断路器/respawn guard）、dashboard 三面同 DB、`/kanban` 豁免 running-agent guard、gateway 自动订阅终态通知、Worker visibility endpoints、runs 表、单 host 边界。
- ✅ GitHub #86135（2026-08-14，open）：CEO delegate_task 静默子 agent、"Makes C-suite feel fake"、对标 Grok Bot 可见 chief 线程。
- 🟡 GitHub #85855 / #85841 / #85799 / #80967 / #83859 / #83391（桌面 agent 会话 UI PR + 多 bot 身份 bug，标题级证据）。
- 🟡 v0.17.0 release note：接入 Raft 网络作 gateway channel（wake-channel bridge）。
- ⚠️ 待证：桌面 roster 的实际使用广度（PR 活跃 ≠ 用户真在用多 bot 相处形态）；`hermes kanban log` 的 worker 日志内容粒度（是否含完整 transcript）未实测。
