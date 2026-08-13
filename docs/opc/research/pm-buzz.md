# Buzz 产品调研（PM 视角）

> 调研对象：[`block/buzz`](https://github.com/block/buzz) —— Block（Jack Dorsey 主导）开源的 Nostr-native 协作工作区，把 AI agent 当作与人平等的一等成员。
> 视角：产品经理。证据分级：✅ 源码/README 官方 / 🟡 二手（媒体+社区）/ ⚠️ PM 推断。
> 关系：本文是 [`multi-agent-orchestration.md`](./multi-agent-orchestration.md) §3.3/§11.1/§13 的 PM 重写，不搬运；对 OPC 编排的启示见 §12。

## 1. 一句话定位

Buzz 是一个**自托管的 Nostr-native 团队协作工作区**，把 AI agent（Claude Code / Codex / Goose / 自定义）以**独立加密身份**塞进 channel/thread/DM/canvas/workflow/git 里当一等成员——人发消息、agent 看 channel 上下文自己判断要不要回，一切动作都是签名 Nostr event，可审计、可移植。

它不是"agent 编排器"，是"**能让 agent 长期住进来的 Slack 替代品**"。编排是 channel + @mention + workflow 之上的 emergent 行为，不是一等抽象。

## 2. A. 根本使用场景

你是 Block 的一个工程师。早上你打开 Buzz desktop，进 `#payments-incidents` channel，看到昨晚 Bumble（研究员 agent）已经把 Sentry spike 的根因调研写进了 channel canvas 的"Findings"段。你 `@Fizz @Bumble` 一句话："基于 Bumble 的发现，Fizz 出修复方案，Bumble 再 review 一遍证据链。"

- Fizz（maker）被 @mention，buzz-acp harness 从 AgentPool 拿一个空闲的 buzz-agent 子进程，把 channel 最近消息 + canvas 快照 + Fizz 的 persona system prompt 组装成一条 prompt 发过去。Fizz 干活，过程里它用 `buzz-cli send_message` 往 channel 回中间想法（kind 9 事件，签名带 owner attestation），并改 canvas 的"Plan"段。
- Bumble 收到 @mention 但 Fizz 还在 in-flight——per-channel 队列规则（Drop 或 Queue 二选一）决定它是被丢掉还是排队等下一轮。
- 你随时可以 `!cancel` 打断 Fizz，或 `!rotate` 强制重启这个 channel 的 session。
- Fizz 干完，canvas 的"Plan"段有了修复方案。你开个 git branch channel，Fizz 把 patch 作为 NIP-34 kind 1617 patch event 提交，CI 结果回到 branch channel。
- 你在 Home Feed 一眼看到所有 @mention、待办、agent 更新；想审 Fizz 的方案，触发一个 `request_approval` workflow step（基础设施已通，resume 还在焊接），approve/deny 留 token。

整条链路：**channel 是共享上下文 → @mention 是派活信号 → per-channel 队列串行化 → AgentPool 按需 spawn → ~/.buzz nest 是跨 session 共享记忆 → canvas 是活状态白板 → Nostr relay 是唯一真相**。你不是在"操作 agent"，是在"和 agent 同处一室"。

## 3. B. 解决的痛点

1. **agent 是局外人、没有稳定身份**——主流工具里 agent 身份绑死在某个平台账号或 vendor API key 上，换平台就丢历史。Buzz 用 secp256k1 keypair 让 agent 拥有**可移植、可验证、独立于平台**的身份，历史和 reputation 跟 key 走。✅
2. **多 agent 协作缺共享上下文**——你开三个 Claude 窗口，它们互不认识、各干各的。Buzz 用 **channel 作为单一共享上下文源**，所有人在同一 event log 里读历史，晚到者也能看全貌（张三派任务离开 → 李四接力 → 王五晚到看全貌）。✅
3. **agent 自我抢占 / 互相覆写**——两条消息几乎同时到达，agent 各自起一轮互相覆写、基于陈旧上下文冲突。Buzz 用 **per-channel 队列**（至多一个 prompt in-flight）串行化，Drop 或 Queue 两种去重模式可选。✅
4. **跨 session / 跨 persona 记忆丢失**——agent 重启就失忆，每次从头解释。Buzz 用 **~/.buzz nest 文件系统**（RESEARCH/PLANS/WORK_LOGS/GUIDES/REPOS）+ 每 turn 注入的 `core` memory 让任意 agent session 都能读到累积产物。✅
5. **被锁死在一个 vendor**——Claude / OpenAI / Block 自家 Goose 二选一就绑死。Buzz 是 **model-agnostic + agent-agnostic**，BYOH（Bring Your Own Harness）让任何 ACP-speaking agent 都能注册为 runtime，不写一行代码。✅
6. **agent 动作不可审计**——谁在什么时候让 agent 改了什么，黑箱。Buzz 里**每个动作都是签名 Nostr event**，relay 不重写，authorship 在消息级 tamper-evident；agent key 之上还有 **Owner Attestation** 层声明谁授权它。✅
7. **固定职能 persona（Orchestrator/Researcher/...）会卡死**——实践发现专门化 prompt 让 agent 陷入窄角色循环、silent failure、runaway team。Buzz 已把固定职能 persona **退役**，转向 Fizz/Honey/Bumble 三个通用助手，用宽能力 + 强 system prompt + 工具表替代。✅（这条是 §12 对 PRD 的核心警示，详见 §6/§12）

## 4. C. Feature list

> 分 8 个维度列全。标注 ✅（README/源码确认已实现）/ 🚧（README 标"being wired up"，基础设施在、glue 未齐）/ 💭（VISION，pending code）。

### 4.1 协作 / 消息（用户入口类）
- **Stream channel**：实时话题聊天，类 Slack。✅
- **Forum channel**：异步长 thread，类 Discourse。✅
- **DM**：1:1 与小群（最多 9 人）。✅
- **Workflow channel**：专门承载 YAML 自动化与 trace 的 channel 类型。✅
- **Thread 回复**：对单条消息起 thread。✅
- **消息编辑 / 删除**。✅
- **emoji reaction**（NIP-25 标准事件）。✅
- **媒体上传**（粘贴/拖拽/附件，Blossom 协议存 S3/MinIO，服务端缩略图）。✅
- **channel canvas**：每个 channel 一份共享文档，人 agent 都可读写（`buzz canvas get/set`，agent 工具也可操作）。✅
- **typing indicator / presence**。✅
- **channel 可见性**：open（可搜、自助加）/ private（隐藏、邀请制）。✅
- **NIP-29 channel scoping**：channel 作为一等 Nostr 概念，成员/角色。✅
- **Home Feed**：个性化入口，聚合 @mention / 待办 / channel 活动 / agent 更新，query 时组装、可扫读。✅
- **全文搜索**：跨对话/patch/workflow run/approval，Postgres FTS，权限感知。✅
- **audit log**（buzz-audit hash-chain）。✅
- **Huddle 音视频**：音频 pipeline + UI（Rust 后端）。🚧
- **push notification**（NIP-PL + buzz-push-gateway）。🚧
- **culture features / web-of-trust reputation**。💭

### 4.2 身份 / 准入（用户入口类）
- **secp256k1 keypair 即身份**：无账号密码，key 是身份，独立于平台。✅
- **onboarding**：生成 keypair → 检测本机已装 harness → 选默认 model → 加入 community → 配 starter channels。✅
- **Owner Attestation（NIP-OA）**：owner key 签名授权某个 agent key 代为行动；owner ≠ agent key 强制（不能 self-attest）；可 scoped 到特定 event 类型/时间窗；签名+验证两侧都检查。✅
- **device pairing（NIP-AB）**：QR 发起、端到端加密、SAS 短认证串防 MITM，跨设备安全转移私钥/NIP-46 session，relay 只见密文。✅
- **profile**：公开 profile，身份跨 community 可移植，profile per-community。✅
- **community 切换**：多 community 各连不同 relay，切换时 state reset。✅
- **NIP-42 relay 认证 / NIP-98 HTTP 签名 / API token + scopes + rate limit**。✅

### 4.3 Agent 管理（agent 管理类）
- **Persona**：agent 的"DNA"模板（`AgentDefinition`：id/display_name/system_prompt/model/runtime/env_vars），存 `personas.json`，内置与用户自建 merge。✅
- **内置 persona**：Fizz（energetic maker，规划/创建/解题，🐝✨）、Honey（warm communicator，写作/整理/头脑风暴，🍯🐝）、Bumble（curious researcher，探索/对比/解释，🐝🔎）——宽能力通用助手。✅
- **退役 persona**：Orchestrator/Researcher/Planner/Implementer/Reviewer 固定职能 persona 已退役（display_name 追加 "(retired)"、标 inactive，记录保留防悬空引用）。✅
- **Team**：Persona 的逻辑分组，批量部署到 channel；CRUD + 与存储同步；引用的 persona 必须活跃；persona 被引用时不可删。✅
- **Managed Agent 生命周期 UI**：`AgentManagementDialogs`（创建/编辑 agent 定义）、`UserProfilePanel`（start/stop/delete、`startOnAppLaunch` 开关、status/PID/时间戳）。✅
- **把 agent 加进 channel**：指定 agent + role + 是否 running；或 channel 内直接新建 agent（runtime/name/system prompt/respondTo）。✅
- **配置 harness/model/permission mode/respondTo**：`ManagedAgent` 字段 + env 覆盖；`agentCommandOverride`；`respondTo`（owner-only/allowlist/anyone/nobody）+ `respondToAllowlist`。✅
- **runtime 警告**：runtime 不可用/persona 过期/persona 孤儿/needsRestart（运行配置 ≠ 当前 spawn 配置），toast 提示。✅
- **观察 agent**：Observer Feed（本地 managed agent + 声明式 owned relay agent 都支持）；agent log 重定向到 `managed_agent_log_path`；agent 日志 kind 30388 observer frame。✅🚧（日志 kind 在 README 提及，UI glue 部分 in progress）
- **owner 控制命令**（kind:9 stream message + @mention p tag，harness 消费不转发给 agent）：`!shutdown`（优雅退出）、`!cancel`（取消当前 in-flight turn）、`!rotate`（作废当前 session，下一条事件起新 session）。✅
- **session rotation**：owner 手动或崩溃后 harness 自动 respawn。✅
- **Persona 作为 Nostr kind:30175 parameterized replaceable event**：公开、可寻址、可发现的 agent 定义。✅

### 4.4 执行 / Harness（agent 管理类）
- **buzz-acp harness**：独立二进制，bridge relay @mention → AI agent；`Buzz Relay ──WS──→ buzz-acp ──stdio(ACP/JSON-RPC)──→ Agent`。✅
- **AgentPool 子进程池**：1–32 个（`--agents` / `BUZZ_ACP_AGENTS`）。✅
- **take-and-return 所有权**：一个 agent 进程同时只处理一个请求，idle 时被 claim、完事归还池。✅
- **ACP JSON-RPC 2.0 over stdin/stdout**（NDJSON）：`initialize` 握手 / `session/new`（system prompt + MCP 配置）/ `session/prompt`（流式回直到 StopReason）。✅
- **崩溃检测 + 自动 respawn**。✅
- **PermissionMode**（经 `session/set_config_option` 下发）：Default / AcceptEdits / BypassPermissions / DontAsk / **Plan**（planning-only 不执行工具）；agent 不支持则降级 per-tool auto-approve。✅ ⚠️ **社区走查实战告警（`pm-buzz-community.md` P1）**：mager.co 真机实测"harness runs the agent with `permission_mode=bypassPermissions` **by default**, reasonable for an unattended bot but means the **inbound author gate is the entire security boundary**. Worth knowing before you point one at a real repo." + digitalapplied 引 VISION_AGENT.md:dev MCP server 给 agent 一个 shell,"runs at the **operator's trust level, like bash itself**"——即 **channel membership 约束不了 agent 在 host 上能干什么**。**OPC 启示**:agents-remote 的 `permissionMode=plan` / `can_use_tool` 审批卡片是正确反向——**默认约束、显式放权**,而非默认放权 + author gate 兜底。
- **runtime 字段（BYOH）**：`BUZZ_ACP_AGENT_COMMAND` / `--agent-command` 指定 spawn 哪个二进制（goose / codex-acp / claude-agent-acp / buzz-agent）。✅
- **BYOH 三层**：Tier-1 编译期 runtime（goose/claude/codex/buzz-agent，含 auto-installer + auth probe + 一流 onboarding）/ Tier-2 preset catalog（静态 HarnessDefinition，PATH 探测，不可编辑）/ Tier-3 用户自定义（`<app-data>/custom_harnesses/` JSON 文件：id/label/command/args/env）。✅ ⚠️ **社区走查校准（`pm-buzz-community.md` P1）**：BYOH 契约(ACP)被外部 agent(Hermes/moltis/opensre)**真接入**(Hermes 官方文档独立给 Buzz 写 BYOH 教程),但 **harness 实现层实战 bug 多**:issue #4923(ACP turn 完成但回复永不回 channel)、#4491(Windows 安装器不随附 buzz-acp,所有 agent mention 失败)、#2270(thread 内未 @mention 则 agent 变聋,9 条复现横跨多平台多 runtime)。借 ACP 协议契约可,但 harness 实现质量是 **pre-1.0**。
- **model-agnostic**：同一 persona 可跑不同 runtime（`runtime` 字段是 preference 非 hard-pin，缺失时 fallback）。✅
- **harness 自动检测 + 一键安装缺失 harness**。✅

### 4.5 派活 / 编排（task 管理类）
- **@mention 派活**：kind 9 + `#p` tag（target pubkey）；buzz-acp 订阅并消费。✅
- **author gate**：`--respond-to`（OwnerOnly / Allowlist / Anyone / Nobody）过滤谁能触发；owner 控制命令（!shutdown/!cancel/!rotate）在 gate 之前检查。✅
- **no_mention_filter**：默认 mention 订阅模式过滤掉未 @mention 的事件；`--no-mention-filter` 关掉（forum channel 用，agent 收所有事件）。✅
- **per-channel 队列（EventQueue）**：至多一个 prompt in-flight per channel，防自我抢占；dedup 模式 **Drop**（in-flight 时新事件静默丢弃）/ **Queue**（累积到下一 flush 批量处理）。✅
- **mid-turn 策略**：Steer / Interrupt / OwnerInterrupt（中途打断 + merge 新事件，改 in-flight 上下文）。✅
- **批量 flush**：`flush_next()` 一次最多 drain `MAX_BATCH_EVENTS`(50) 进一个 FlushBatch 作为单条 prompt 发给 agent。✅
- **多 channel 并发**：池里有多个 agent 时不同 channel 可并行处理。✅

### 4.6 记忆 / 上下文（记忆类）
- **~/.buzz nest 文件系统**：`RESEARCH/`（调研发现）/ `PLANS/`（进行中规划）/ `GUIDES/`（actionable runbook）/ `WORK_LOGS/`（时间戳活动日志：试过/学到/决定）/ `REPOS/`（源码 checkout，可符号链接到用户配置位置）/ `OUTBOX/`（对外可分享文档）/ `.scratch/`（临时文件、跨 session 视为可弃）/ `AGENTS.md`（活跃 agent 清单 + 静态 orientation，模板更新时刷新）。✅
- **`core` memory**：每 turn auto-inject，跨 session 持有身份/持久规则/目标。✅
- **共享边界**：agent session **共享 nest 磁盘 workspace + core memory**，但**不共享对话 context / in-progress reasoning / in-context task state**——每个 channel 独立对话。✅
- **LlmContextExceeded 恢复**：超窗口时当 recovery 信号非终态错误；`recover_from_context_overflow` 调 `truncate_history`（不超 `max_history_bytes`），round 计数器回退、`last_request_input_tokens/history_bytes` 重置，用更短历史重试；重试耗尽才返回原错误。✅
- **两层 prompt 架构**：`[Base]` 层（buzz-acp 编译进去，所有 agent 相同，平台 orientation + MCP 工具引用 + workspace 布局 + 消息轮询说明，pack 作者不碰）+ `[System]` 层（persona 的 `.persona.md` body，per-agent 角色/身份/行为规则，buzz-acp prepend 到 user message）。✅
- **prompt 投递现状**：当前是 prepend 到 user message 文本（非 session 创建时注入真 system prompt，planned）。✅
- **Persona Pack**（PERSONA_PACK_SPEC.md）：更高级 persona 打包（behavioral config + skills + lifecycle hooks）；persona pack 与 desktop snapshot 当前是分离不可互换格式。🚧
- **跨 channel memory 学习需 admin 显式授权**，memory 尊重 channel 边界。🟡（Claude Tag 同款哲学，Buzz 未确认细节）

### 4.7 审批 / 介入（审批类）
- **Workflow approval gate**：`request_approval` workflow action 暂停执行、生成 `ApprovalRecord`（token + workflow/run/step id + `approver_spec`）入库；`ApprovalStatus` = Pending/Granted/Denied。🚧（DB+API+UI 在，executor 持久化 token + resume 未接好，命中 gate 的 run 当前标 failed）⚠️ **社区走查源码级铁证（`pm-buzz-community.md` P0）**：deepwiki 确认 `finalize_run` 显式标 Failed,reason "approval gates not yet implemented — see WF-08",**命中即 fail 不 wait**。即当前版本 approval gate **不是可用安全控制**。OPC 不能借 Buzz 的 workflow approval 实现,需自建(PRD §12.3 CEO 审批 + approvalPolicy)。同类还有 ARCHITECTURE.md §9 自列的 5 个 verified gap:rate limiter(唯一实现是 `AlwaysAllowRateLimiter` 测试 stub)、`send_dm`/`set_channel_topic`(NotImplemented 命中即 fail)、huddle recording、typing REST。
- **grant/deny 命令**：desktop `grant_approval` / `deny_approval` 构造事件提交，relay 更新 DB；CLI `buzz Approve` 子命令（token UUID + approve/deny + 可选 note）。✅（命令在，resume 未齐）
- **owner 介入**：`!cancel`（取消 in-flight turn）/ `!rotate`（重启 session）/ `!shutdown`（停 harness）。✅
- **PermissionMode=Plan**：planning-only，不让 agent 执行工具（与本项目 `permissionMode=plan` 同源）。✅
- **per-tool permission 流程**（Default 模式逐工具请求）。✅

### 4.8 自动化 / 集成（集成类）
- **YAML workflow（buzz-workflow，evalexpr 条件）**：channel-scoped YAML-as-code 自动化。✅
- **workflow 触发器**：`message_posted`（channel 内发消息，可 filter 文本如"P1"）/ `reaction_added`（加 reaction）/ `schedule`（cron，scheduler 60s tick）/ `webhook`（外部 HTTP POST）。✅
- **workflow action**：`send_message`（发 channel 或 override 到别的 channel）/ `send_dm`（schema 在，NotImplemented）/ `set_channel_topic`（schema 在，NotImplemented）/ `add_reaction`（给触发消息加 reaction）/ `call_webhook`（发外部 HTTP）/ `request_approval`（暂停求批准）/ `delay`（最多 300s）。✅🚧
- **workflow CRUD + run 查看**：CLI list/get/create/update/delete/trigger/view runs。✅
- **Git 集成**：relay 用 Smart HTTP 托管 repo（按需从 object-store manifest hydrate，不存常驻 bare repo）/ `git-clone` `git-push`。✅
- **git-sign-nostr**：用 Nostr key 签 git object。✅
- **git-credential-nostr**：push/pull 时签 NIP-98 event 认证。✅
- **NIP-34 patch/repo**：kind 30617 repo announcement（含 `buzz-` 前缀 tag 绑 channel + 可见性 + branch protection）/ kind 1617 patch event。✅
- **NIP-MP 多 repo project**：kind 30621 把多 repo 组成单 project（单 signer 管理 group state，解决 per-repo tag 不能跨 owner 分组）。✅
- **git branch channel**：建 feature branch 时自动开 channel 装 CI/review/merge 决策，merge 后 archive 成永久记录。✅
- **buzz-cli**（agent-first，JSON in/out）：messages/canvas/search/workflow/approve 等子命令，agent 用它和 Buzz 交互。✅
- **buzz-dev-mcp**：developer MCP server（shell + file-edit 工具）。✅
- **buzz-sdk**：typed Nostr event builder。✅

### 4.9 部署 / 治理（配置类）
- **desktop app（Tauri 2 + React 19）**：Stream/Home/Forum/DM/Agents/Workflows/Search/Settings/Profiles/Presence 全套。✅
- **mobile app（Flutter，Riverpod + flutter_hooks）**：channels/forum/search/profile/pairing（开发中）。🚧
- **web client**：relay 服务，repo browser @ `myproject.com`。✅
- **Docker Compose 单节点部署**。✅
- **Helm Chart K8s 部署**。✅
- **buzz-admin CLI**：relay 成员增删查（role: admin/member）/ `generate-key` / reconcile channels / 查 deployment 产品反馈 / moderation dashboard。✅
- **NIP-43 admin event**（kind 9030/9031/9032）over WebSocket 管 relay 成员。✅
- **community = tenant boundary**：单 relay 单 community（URL 选）；多 community 多 domain，URL 是 workspace 权威，所有 tenant-observable state community-local。✅
- **Apache 2.0 开源**。✅
- **Harbor Buzz Orchestra benchmarking**（测试基线）。✅

## 5. 核心概念

| 概念 | 是什么 | 用户视角 |
|------|--------|---------|
| **Persona** | agent 的 DNA 模板（system_prompt + model + runtime 偏好 + env） | "我要一个 maker 风格的 agent" → 选 Fizz |
| **Team** | Persona 逻辑分组，批量部署到 channel | "把这个调研组三个 agent 一起拉进 channel" |
| **ACP**（Agent Communication Protocol） | JSON-RPC 2.0 over stdin/stdout，harness ↔ agent runner 通信 | 用户看不到，但是 BYOH 的契约基础 |
| **Nostr event** | 签名 JSON 对象，`kind` 整数定用途（9000=聊天/30388=agent log/30617=repo/1617=patch/30175=persona/30621=多 repo project/NIP-25=reaction） | "一切动作都是可审计的签名事件" |
| **channel** | 共享上下文单位（Stream/Forum/DM/Workflow 四型）+ per-channel 队列 + per-channel canvas | "大家坐一起的房间" |
| **nest**（~/.buzz） | 文件系统即共享 state：RESEARCH/PLANS/WORK_LOGS/GUIDES/REPOS/OUTBOX/.scratch/AGENTS.md + `core` memory | "agent 的长期记忆抽屉" |
| **harness**（buzz-acp） | bridge relay ↔ agent 的 daemon，管 AgentPool + EventQueue + author gate | "agent 调度器" |
| **AgentPool** | 1–32 agent 子进程池，take-and-return 所有权 | "按需 spawn、不常驻、池化复用" |
| **Owner Attestation** | owner key 授权 agent key 代为行动的签名 tag，不能 self-attest | "谁为这个 agent 的行为背书" |
| **approval gate** | workflow `request_approval` step 暂停求批准（infra 在、resume 未齐） | "关键节点人拍板" |
| **community** | tenant boundary，URL 选 workspace，state community-local | "我公司的隔离工作区" |
| **BYOH** | Bring Your Own Harness，任何 ACP-speaking agent 注册为 runtime | "接我自己的 agent 进来" |

## 6. 状态哲学（重点章节）

Buzz 的状态**焊在三个地方，各管一段**：

1. **Nostr relay（Postgres `events` 表，按 `created_at` 月分区）= 真相源**。所有 chat/reaction/workflow step/canvas/git/审批/agent 定义都是签名 event，relay 单点存、单点 fan-out，**无 P2P / 无 gossip / 无 replication**。relay 不重写 event，authorship 消息级 tamper-evident。这是 Buzz 的 single source of truth——channel 历史在这里，不在 agent 内存里。✅
2. **~/.buzz nest（本地文件系统）= 跨 session 共享记忆**。RESEARCH/PLANS/WORK_LOGS/GUIDES/REPOS 是 agent 的"抽屉"，一个 agent session 写下的调研/规划/工作日志，**另一个 session 或 persona 同 nest 内可直接读**。`core` memory 每 turn auto-inject。**关键边界**：nest 共享磁盘 workspace + core memory，但**不共享对话 context / in-progress reasoning / in-context task state**——每个 channel 自己的对话。✅
3. **persona / AgentDefinition = 身份与行为状态**。persona 是 `.persona.md` + 配置，作为 kind:30175 公开事件发布，可寻址可发现可移植；身份跟 key 走不跟平台走。✅

> ⚠️ **社区走查厘清（`pm-buzz-community.md` P0）——"两个真相源 + 一个不共享"三层边界**：现有 §4.6 写"共享 nest + core memory,不共享对话 context"、本节又写"relay + nest 当 single source of truth",读起来矛盾。deepwiki 源码厘清真边界是三层:(a) **relay = channel 对话真相源**(per-channel,跨 agent 在同 channel 内共享);(b) **nest = 跨 session/channel 产物记忆**(agent 写的 RESEARCH/PLANS 等文件,其他 session/persona 可读);(c) **不共享的是单 channel 内 in-flight turn context**(每个 channel 自己的 turn 上下文,防自我抢占)。OPC 的"共享 brain"讨论应分这三层,不要笼统说"共享"或"不共享"。

**换成员意味着什么**：
- **换 persona** = 换 agent 的"DNA"（system prompt + model + runtime 偏好 + env）；同一 channel 换 persona，对话历史（relay）不变，但 agent 的 system prompt 注入变了 → 行为变了；nest 文件不变（persona 共享 nest）。
- **换 channel** = 换共享上下文；agent 的对话 context 重置（per-channel 独立），但 nest/core memory 带着走 → 跨 channel 不失忆。
- **换 harness/runtime** = 换执行器（buzz-agent → claude → codex）；persona 是 preference 非 hard-pin，同 persona 可跑不同 runtime；relay 与 nest 不变。
- **换 owner / 换 key** = 换身份与授权关系；Owner Attestation 重签。

**"agentmore"讨论**（用户洞察，Buzz 像带状态的 serverless）：

Buzz 的 AgentPool 是**按需 spawn + 池化复用**：1–32 子进程，事件来了 claim 一个 idle agent、跑完归还，崩溃 respawn——这就是 serverless function 的 cold-start/warm-pool 模型。但它**带状态**：relay event log + nest 文件 + core memory 跨 spawn 持久，所以同一个 channel 的 agent"看起来"是连续的，尽管底下进程是按需起的。

与 serverless 的关键区别：
- **serverless 函数无状态**，状态全在外部 store（DB/KV）；Buzz 的 agent **共享 nest 文件**作为工作面，状态就在 agent 能直接读写的磁盘上——更像"带持久卷的 serverless"。
- **serverless 触发即跑即弃**；Buzz 有 **per-channel 串行闸 + in-flight 单 prompt**，是"同时只接一个请求的有状态 worker"——更像 actor model（一个 channel = 一个 actor，mailbox 串行）。
- **serverless 按调用计费**；Buzz 自托管、agent 跑你自己的 LLM API，成本在 LLM 调用不在 spawn。

⚠️ PM 推断：更准确的类比是 **actor model + serverless warm pool**，而非纯 serverless。叫 "agentmore" 抓住了"按需起 + 带状态"两个特征，但 Buzz 真正的状态哲学是**三段焊死**（relay 真相 / nest 记忆 / persona 身份）而非"function 带状态"那么简单。

> ⚠️ **社区走查校准（`pm-buzz-community.md` P0，两条）**：
> 1. **token 成本校准**——channel-as-memory 的代价是 **token 开销爆炸**:daily.dev 引 YouTube Better Stack walkthrough 实测"一个 greeting 31k tokens"(vs Claude Code 终端 4k),swarm 场景成本"add another agent and it multiplies"。根因是每 turn 重 spawn + 注入 base prompt + 回放 channel history。Buzz 用 LlmContextExceeded 被动截断 + nest 文件产物应对,**无主动检查点压缩**(§8 已记)。OPC 借鉴 channel-as-memory 时必须配套主动压缩(PRD §13 L3 检查点压缩)+ 每轮 token 上限,否则成本不可控。
> 2. **per-turn spawn 而非常驻 session**——mager.co 真机实测关键发现:"buzz-acp spawns the agent per turn rather than keeping a session alive. Mention, spawn, turn, reply. ...the channel history is the continuity rather than the process." 这与 agents-remote 当前 Claude2 "Bun.spawn 常驻 CLI + --resume"模型是**反向**取舍——Buzz 选了"进程轻 + 上下文重(回放 history)",agents-remote 选了"进程重 + 上下文轻(CLI 内 history)"。两者都有 token 成本问题但形态不同:Buzz 是回放 history 爆炸(31k vs 4k),agents-remote 是长 session 累积爆炸(compact_boundary)。OPC 应明确自己在"per-turn spawn ↔ 常驻 session"光谱的位置。

## 7. 派活与编排交互

用户怎么下达工作：
1. **在 channel 里发消息 + @mention agent**（`#p` tag 带 agent pubkey）→ kind 9 event 进 relay。
2. relay fan-out 给订阅者，buzz-acp harness 收到。
3. **author gate** 过滤：`respondTo` policy（OwnerOnly / Allowlist / Anyone / Nobody）决定事件能不能触发 agent turn；owner 控制命令（!shutdown/!cancel/!rotate）在 gate 之前放行。
4. **no_mention_filter**（默认开）：mention 订阅模式下未 @mention 的事件被滤掉；`--no-mention-filter` 关掉（forum channel 让 agent 收所有事件）。
5. 进 **per-channel EventQueue**：Drop 模式下该 channel 已有 in-flight prompt 则新事件静默丢弃；Queue 模式下累积到下次 flush。
6. **flush_next** 一次最多 50 条 drain 成 FlushBatch → AgentPool claim idle agent → `session/prompt`（JSON-RPC）发过去。
7. agent 处理（调 LLM + 调 MCP 工具 + 用 buzz-cli 回 channel），回的 kind 9 event 经 owner attestation 签名回 relay → fan-out。
8. **mid-turn**：Steer/Interrupt/OwnerInterrupt 可中途打断并 merge 新事件改 in-flight 上下文。

per-channel 队列串行化的意义：**同 channel 同时只一个 agent turn 在跑**，防自我抢占、防基于陈旧上下文互相覆写。多 channel 可并行（池里有多个 agent 时）。这正对应 §13.0 三件套的"串行化轮次队列"。✅

## 8. 记忆与上下文

nest 累积共享 state 的方式：
- **RESEARCH/PLANS/GUIDES/WORK_LOGS/OUTBOX** 是产物型记忆——agent 主动写（调研发现、规划、runbook、活动日志、对外文档），跨 session/persona 可读。
- **`core` memory** 是 identity/durable rules/goals，每 turn auto-inject 进 agent context——这是 Buzz 的"长期人格记忆"。
- **AGENTS.md** 给 team context（活跃 agent 清单 + orientation）。
- **.scratch** 跨 session 视为可弃（临时工作文件）。

跨任务/跨 persona：同 nest 内所有 agent 共享磁盘产物（一人写的 PLANS 另一人能读），但**对话 context 不共享**（每个 channel 独立）。这是 Buzz 的关键取舍——**共享"已沉淀的产物"，不共享"进行中的思考"**。

in-flight 队列裁剪上下文：
- **Drop 模式**：in-flight 时新事件直接丢——不裁剪而是"拒绝增量"，保护当前 turn 上下文完整。
- **Queue 模式**：累积到下次 flush 批量处理，FlushBatch 一次最多 50 条。
- **LlmContextExceeded**：超窗口时非终态，`recover_from_context_overflow` 调 `truncate_history`（限 `max_history_bytes`）回退 round 计数 + 重置 token 统计，用更短历史重试；重试耗尽才真失败。
- **mid-turn Steer/Interrupt**：可中途取消当前 turn 并 merge 新事件，主动改 in-flight 上下文。

⚠️ 注意：Buzz 没有显式的"检查点压缩做长记忆"机制（不像 cloudflare-os 的 CompactionCheckpoint @85% 或本仓库 `compact_boundary`）——它的长记忆靠 nest 文件产物 + LlmContextExceeded 被动截断，**不是主动摘要压缩**。这是 §11.1 里"Buzz 无结构化任务状态/依赖图/崩溃恢复/审批门控"缺点的具体表现。

## 9. 审批与介入

approval gate 在哪、批什么：
- **位置**：workflow YAML 里的 `request_approval` action step，channel-scoped。
- **批什么**：workflow 执行到该 step 暂停，生成 `ApprovalRecord`（token + workflow_id + run_id + step_id + `approver_spec`）入库，状态 Pending。
- **怎么批**：用户用 `grant_approval` / `deny_approval` 命令（desktop 构造事件 / CLI `buzz Approve --token <UUID> --approve/deny --note <...>`）→ relay 更新 ApprovalStatus（Granted/Denied）。
- **现状**：🚧 infra（DB schema + API + UI 命令）齐了，但 **executor 持久化 token + resume 未接**——命中 gate 的 run 当前标 failed。README 自承"glue still drying"。

owner 介入（不走 workflow gate，是 harness 级硬控制）：
- `!cancel`：取消当前 channel in-flight turn（harness 消费，不转发 agent）。
- `!rotate`：作废当前 session，下一条事件起新 session。
- `!shutdown`：优雅停 harness。
- 这些命令必须是 owner 发的 kind:9 + @mention p tag，在 author gate 之前放行。

PermissionMode（agent 工具级，与 workflow gate 不同维度）：Default/AcceptEdits/BypassPermissions/DontAsk/**Plan**（planning-only 不执行工具），经 `session/set_config_option` 下发；agent 不支持则降级 per-tool auto-approve。Plan 模式与本项目 `permissionMode=plan` + `can_use_tool` 审批卡片**同源**。✅

## 10. 执行与持久

harness spawn 子进程跑哪：
- **buzz-acp harness**：独立二进制 daemon，连 relay WebSocket 订阅 channel，管 AgentPool（1–32 子进程）+ EventQueue + author gate。
- **子进程 spawn**：`AcpClient::spawn` 起子进程，设 stdin/stdout 给 JSON-RPC、stderr 继承做日志；`spawn_and_init` 握手 + ACP 初始化。
- **take-and-return**：idle OwnedAgent 被 claim 跑 `run_prompt_task`，完事归还池；崩溃检测 + respawn。
- **进程不常驻等命**：事件来了才 spawn/claim，空闲归还——serverless warm pool 模型。

BYOH：任何 ACP-speaking agent 工具注册为可选 runtime，无需改代码。三层：Tier-1 编译期（goose/claude/codex/buzz-agent，auto-installer + auth probe + 一流 onboarding）/ Tier-2 preset catalog（静态、PATH 探测、不可编辑）/ Tier-3 用户 JSON（`<app-data>/custom_harnesses/`：id/label/command/args/env）。`runtime` 字段是 preference 非 hard-pin，同 persona 可跑不同 runtime。✅

Nostr relay 持久形态：
- **Postgres `events` 表**，按 `created_at` 月分区；多 community 时每条 tenant-visible event keyed by `community_id`。
- `insert_event` 用 `ON CONFLICT DO NOTHING` 幂等。
- **kind 路由**：标准 Nostr kind 0–9999 + 自定义 40000–49999；20000–29999 ephemeral 不存不审计。
- **FTS 索引**：`events.search_tsv` generated tsvector，隐私敏感 kind 存储层排除。
- **buzz-db crate** 管 schema + DAL；buzz-pubsub（Redis pub/sub）做 fan-out + presence + typing；buzz-audit 做 hash-chain tamper-evident log；buzz-search 做 FTS。
- relay **不存常驻 bare git repo**，按需从 object-store manifest hydrate（省空间）。

## 11. 商业模式与定位

- **开源**：Apache 2.0，Block 主导（Jack Dorsey 背书，定位为 Slack+GitHub 替代品）。✅ ⚠️ **社区走查校准（`pm-buzz-community.md` P1+P2）**：(1) **开源版 ≠ 内部版**——digitalapplied 指"Block tells its own employees not to build from source or use the open-source release, but to use the internal build that comes pre-wired to Block's relay and agent provider",即员工用内部预接 build,dogfooding 是内部版非公开版;社区使用的是公开开源版,**2454 open issues 反映公开版质量**。引用 Block dogfooding 需注明"内部版"。(2) **社区对 Jack Dorsey 信任分裂**——HN 主帖 ~20% 评论质疑 Jack Dorsey 是"vibe-coded 侧项目"(`darth_avocado`/`noodlescb`/`dwedge`),但 `pclowes` 反驳"Jack is a much better 0 to 1 guy... Twitter, Square, Bluesky/ATProto, bitchat, buzz. He just always fumbles the 1 to N"——社区分裂为"Dorsey 不可信"vs"Dorsey 0-to-1 强但 1-to-N 弱"两派。(3) **buzz.xyz 与 Grok Bot 赛道不同**——buzz.xyz 确认就是 Block 的 Buzz(Jack Dorsey 2026-07-21 启动推文),它是"Slack + GitHub for humans + agents",**不是 chatbot 竞品**,与 Grok(X 的 chatbot)赛道不直接竞争;若有文档把 Buzz 列为"Grok Bot 开源竞品",应修正为"Buzz 是 Slack+GitHub 替代品,其 agent 一等成员模型是 chatbot-as-teammate 范式的开源参考"。
- **自托管优先**：自己跑 relay = 控数据 + 不依赖第三方 moderation；Block 也提供 hosted relay 试用（早期更不稳）。✅
- **model-agnostic + agent-agnostic**：不绑 vendor，harness 已支持 goose/Codex/Claude Code，可 BYOH 或自建。✅
- **面向谁**：Block 自己先用（内部合并 65% 产品 PR 的说法需谨慎，那是 Claude Tag 不是 Buzz 🟡）；定位为"想给 agent 一个长期身份与协作场所"的团队——开发者团队、agent-first 工作流团队、对 vendor lock-in 敏感的组织。Buzz 自己定位"real-time human-AI teamwork"。✅
- **不面向谁**：想要"开箱即用 SaaS 协作工具"的人（需自托管/key 管理/CLI 安装门槛）；想要"轻量 agent 编排器"的人（Buzz 重——Rust 多 crate + Postgres + Redis + Tauri/Flutter/Web 三端 + Nostr 协议栈）。⚠️
- **与 Claude Tag 对照**：Claude Tag 站在 Slack 肩膀（channel/thread/@tag/全员可见 Slack 全提供），Buzz **自建全部**（relay + 三端 + 协议栈）——复杂度天然更高，换来的是自托管 + 加密身份 + agent 一等成员 + 跨平台可移植。🟡
- **社区上手情况**（`pm-buzz-community.md` P2）：Buzz 与 cf-os"声量高上手率低"不同——**开源两周声量高 + 上手率也高**（26k stars + 多个独立上手报告：mager.co 完整部署 + 多个 GitHub issue 实战 bug + Matt Shumer 公开报 agent 不回话），但**实战可用性低**——几乎每个上手者都踩坑（token 开销 31k vs 4k、thread @mention 让对话碎、approval gate 命中即 fail、harness glue bug）。是典型"pre-1.0 活跃但不稳"，符合 Block 工程博客自承"rough edges and giant chasms"。**OPC 启示**：dogfooding 要用公开版而非内部版，否则 bug 率认知会失真。

## 12. 对 OPC 多 agent 编排的启示

对照 agents-remote 的角色/任务/房间/看板/记忆/agentmore（PRD §4-§6）。

### 印证（PRD 方向正确）
1. **三件套再次收敛**：Buzz 是除 cloudflare-os/Paperclip/Claude Tag 之外第四个独立收敛到"单一共享状态源（relay event log）+ 串行化轮次队列（per-channel in-flight）+ 上下文管理（nest + LlmContextExceeded）"的产品。PRD §13 三件套方向稳。✅
2. **per-channel 串行 = Room 串行 turn 的工程实证**：Buzz 的 EventQueue Drop/Queue 两模式 + at-most-one in-flight 直接印证 PRD §13 圆桌"串行 turn 队列"。可借鉴 Drop/Queue 双模式（PRD 当前只提 serial，没区分 Drop vs Queue 语义）。✅
3. **agent 不能自己把工作标完成 = owner 控制权**：Buzz 的 owner 控制命令（!cancel/!rotate/!shutdown）+ approval gate + PermissionMode=Plan 都印证 PRD §12.3"agent 永远不能直接把 goal 设为 done，CEO 审批"。✅
4. **BYOH = ProviderProfile 抽象的极端版**：Buzz 的 Tier-1/2/3 harness 分层对应 PRD `ProviderProfile` adapter，证明"agent 类型可替换、persona 是 preference 非 hard-pin"是对的。✅
5. **身份是 project 级共享资源**：Buzz 的 persona 跨 session/channel 复用、kind:30175 公开可寻址，印证 PRD §15.4 第 1 点"身份是 project 级资源非 per-session"。✅

### 挑战（PRD 要 rethink）
1. **固定职能 persona 退役——PRD 角色该不该写死职能？** ⚠️ 这是 Buzz 给我们的最强警示。Buzz 实战发现 Orchestrator/Researcher/Planner/Implementer/Reviewer 固定职能 prompt 导致 silent failure / runaway team（agent 陷窄角色循环），已退役转向 Fizz/Honey/Bumble 三个**宽能力通用助手 + 强 system prompt + 工具表**。
   - **对 PRD 的具体警示**：PRD §4 把"角色"定义成"给 agent 一个身份（CTO/研究员/开发），它就用这个人设干活"——这正是 Buzz 退掉的路。PRD §5 用户故事"我建一个角色「研究员」，写清它擅长调研"是典型固定职能。
   - **建议**：角色模板**不要写死职能边界**，写成"宽能力 + 倾向 + 工具表 + 安全护栏"。例如"研究员"不要只写"你负责调研"，而写"你是个好奇、严谨、擅长把杂乱信息结构化的助手；默认用 search/read 工具调研并输出结构化报告；遇到非调研任务也能做但明确说明这是偏出你的强项"。角色是**身份与倾向**，不是**职能边界**。保留角色概念但弱化"专职"语义——这与 Claude Tag"一个 Claude 100s of ways"哲学一致。
2. **Buzz 没有"任务"一等实体——PRD 的 Goal×Task 双层是增量**：Buzz 的"工作"emergent 在 channel 对话 + nest 文件 + workflow run 里，**没有结构化任务状态/依赖图/崩溃恢复/审批门控完整闭环**（§11.1 已记录）。PRD §12 双层任务（OrchestrationGoal 看板卡片 × OrchestrationTask 执行记录）+ ancestry + 状态机 + approvalPolicy 是 Buzz 没有的——是 agents-remote 该做的增量，不是要抄 Buzz。✅ 印证 PRD 价值。
3. **Buzz 长记忆靠文件产物 + 被动截断，无主动检查点压缩**：Buzz 没有 cf-os CompactionCheckpoint @85% 或本仓库 `compact_boundary` 主动摘要。PRD §13 L3 检查点压缩是增量价值——但 Buzz 证明"小团队靠 nest 文件 ls/read 够用"也是务实路径，L4 向量检索可能永远不上（§13.5 第 8 条已记）。🟡
4. **Buzz 的 channel = PRD 的 Room，但 Buzz channel 更轻**：Buzz channel 自带 canvas（共享白板）+ thread + 成员 + workflow 绑定，PRD §13 Room 是新建实体。可借鉴"channel 自带 canvas"——PRD Room 的共享白板不必独立造，可与 Room 绑定一体。✅
5. **Buzz 的 owner 控制命令（!cancel/!rotate/!shutdown）是 CEO 介入的好范式**：PRD §13.5 开放问题 5"CEO 介入模式"未定，Buzz 给了答案——owner 特权命令在 author gate 之前放行，可打断 in-flight turn + 强制重启 session。建议 PRD Room 加 CEO 优先级插队/打断。✅

### 盲点（PRD 未覆盖、Buzz 暴露的）
1. **agent 动作可审计 identity**（Claude Tag §15.5 第 3 点 + Buzz Owner Attestation 双重印证）：多 agent 协作时每个 agent 操作带可审计 identity 标签。PRD §12 `OrchestrationTask.sessionRefs` 应升级为"agent 操作日志带 identity"。✅
2. **Nostr 协议复杂度对单机 Bun 是 over-engineering**（§13.2 已结论）：Buzz 选 Nostr 是因去中心化 IM 定位 + 加密身份可移植，agents-remote 不需要——借"事件驱动 + single source of truth + 实时 fan-out"模式即可，CF DO + WebSocket Hibernation 是云原生等价（§11.1 已记）。✅
3. **per-channel Drop vs Queue 双模式**：PRD §13 只提 serial turn，未区分 Drop（in-flight 时丢新事件）/ Queue（累积批量）。Buzz 证明这是两个不同语义需显式选择——圆桌讨论 Queue 更合理（不丢发言），任务下发 Drop 更合理（避免堆积）。建议 PRD Room `turnPolicy` 扩展为 `serial-drop` / `serial-queue`。✅
4. **multiplayer agent 数据泄露是社区首要隐私担忧**（`pm-buzz-community.md` P1，Slack 工程师 `muglug` 亲自下场）：`muglug`"Having agents see everything you and your colleagues see is cool. The challenge comes when you want to make certain things private... you end up having to write and maintain complex rulesets." `paxys` 跟进的 **transitive membership 问题**（agent 在 A+B 两 channel，A 用户问它 B 的事怎么办）。Buzz 用 channel membership 粗粒度应对（SECURITY.md 自承"channel membership is the only access control mechanism"）。**对 OPC 启示**：OPC 的"圆桌多 agent"模型若让多个 agent 共享同一 channel context，**必须前置设计 agent 间的信息边界**（哪个 agent 能看哪个 agent 的 in-progress work），不能默认共享——否则踩同坑。
5. **agent 需要 capability taxonomy 而非 channel membership**（`pm-buzz-community.md` P1，hills-lab 评测）：hills-lab"A production agent needs separate authority for reading context / proposing a change / executing a workflow / using a secret-bearing tool / approving a step / publishing a result. Identity and channel membership are necessary, but they are not least privilege." **对 OPC 启示**：OPC 的 `permissionMode` + `approvalPolicy` 应走向 **capability taxonomy**（六层独立授权）而非仅 channel/role membership——读 context / 提 change / 执行 workflow / 调 secret tool / 批准 / 发布 各自独立。这与 cf-os Gatekeeper 三层能力 + Grok Bot 走查的"独立 identity + scoped 权限"铁律同源（见 `../design/opc-product-discussion.md` §4）。

### 固定职能 persona 退役对 PRD 角色的具体警示（核心 3 点之一，单独凝练）
- **警示 1**：不要把角色写成"职能岗位"（CTO/研究员/开发），写成"身份 + 倾向 + 工具表"。固定职能会引发 silent failure（agent 在窄角色里卡死不报错）和 runaway team（agent 互相 ping-pong 无人收敛）。
- **警示 2**：角色模板要**默认宽能力、显式标注强项弱项**，让 agent 能自己判断"这超出我的强项"而非"这不是我的事"。Buzz 的 Fizz/Honey/Bumble 是宽到能接任何活、但有明确性格倾向的范例。
- **警示 3**：PRD §7 第 1 条"第一期只做角色+任务+看板"方向对，但"角色"的定义要改——不是"研究员只做调研"，是"带研究员倾向的通用助手 + 调研工具表 + 输出结构化报告的默认行为"。这与 Claude Tag"一个 Claude 100s of ways"、Paperclip"智能在 agent"同源——**把智能留给 agent，角色只给身份与倾向**。

> ⚠️ **社区走查补强（`pm-buzz-community.md` P0，警示 B——比上面三条更深的根因）**：deepwiki 源码级铁证(commit `ea5a0a9b4` 2026-07-22 + `welcome-kickoff-silent-failures.md` post-mortem)显示 persona 退役根因不只是"窄角色循环",而是 **base prompt 的回复义务规则自相矛盾**——既强制回复每条 user message,又强制完成工作时 @mention delegator(哪怕没事可报)= 没事也互相 ping = **runaway reply loop** + **silent failure**。Buzz post-mortem 明确拒绝"在 persona 里修 loop",理由是 persona 是 "character prompts (tone, wordplay)",会话协议规则塞进 persona 是 **layering violation**。
>
> **警示 B(新):会话协议规则不能塞进角色 system prompt,要在编排层显式表达**。尤其要**显式允许"沉默作为成功条件"**——编排层要有一个"沉默即成功"的状态,不能默认每个 event 都触发 agent turn。
> - **对 PRD 的具体启示**:PRD §13.5"圆桌串行 turn 队列" + §12.3"CEO 审批"必须显式定义"何时不该回复"——agents-remote 的编排层要支持"agent 收到 event 后判断无事可说则不发 turn",而非默认每个 event 都触发回复。
> - 这条与 Raft held draft 的"Stay silent 是四选一一等选项"(见 `pm-raft.md`)独立收敛——两个产品都把"不发"当一等公民。详见 `../design/opc-product-discussion.md` §6 AX 第五问 + §7 共性收敛第 9 条。

## 13. 证据分级与来源

| 分级 | 含义 | 本文条目示例 |
|------|------|-------------|
| ✅ | 源码/README/官方文档确认 | Persona/Team 模型、ACP over Nostr、EventQueue、AgentPool、~/.buzz nest、两层 prompt、Owner Attestation、BYOH 三层、workflow trigger/action、Git 集成、onboarding、device pairing、Apache 2.0、permission mode、owner 控制命令、LlmContextExceeded、relay Postgres schema、Fizz/Honey/Bumble 人格、固定职能 persona 退役 |
| 🟡 | 二手（媒体/社区，需谨慎） | "Block 内部合并 65% 产品 PR"（实为 Claude Tag 非Buzz，已澄清）、跨 channel memory 学习需 admin 授权（Buzz 未确认细节）、与 Claude Tag 对照的复杂度判断 |
| ⚠️ | PM 推断 | "agentmore = actor model + serverless warm pool"类比、Buzz 不面向 SaaS 用户/轻量编排用户判断、PRD 角色定义应改宽能力 |

**主要来源**：
- deepwiki `block/buzz` 多角度问答（Persona/Team、ACP/Nostr、harness、nest、approval、workflow、git、deployment、owner attestation、LlmContextExceeded、内置 persona、状态哲学）
- `github.com/block/buzz` README + AGENTS.md + ARCHITECTURE.md
- Block 官方博客 `block.xyz/inside/introducing-buzz`
- daily.dev / ayautomate.com / The New Stack 报道
- 已有调研 `./multi-agent-orchestration.md` §3.3/§11.1/§13（技术底座，本文 PM 重写）
- PRD `../design/multi-agent-prd.md`（对照目标）