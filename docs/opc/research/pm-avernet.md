# PM 调研：Avernet（inclusionAI/Avernet）

> 视角：产品经理。决策向分析，不技术堆砌。证据分级：✅ 源码/README 直证 / 🟡 二手（deepwiki 综合未直接 cite）/ ⚠️ 推断。
> 仓库：`inclusionAI/Avernet`，Apache-2.0，蚂蚁集团背景。主要信息源：deepwiki（按 crate 维度逐个深挖 × 8 轮）+ README + tvly。

## 1. 一句话定位

Avernet 是蚂蚁集团 backed 的开源**多 agent 协调基础设施**——给要在组织级跑多个异构 agent、让它们长期协作并沉淀组织记忆的团队用的「协调层 + 持久化底座」。✅

它不是给个人开发者管单个 agent 的工具，而是给「多个 agent 当员工组虚拟公司」的场景提供**连接/路由/协作编排/记忆/异构 runtime 接入**的中间件。卖底座，不卖终端应用。✅ ⚠️ **社区走查风险注（`pm-avernet-community.md` P1）**：底座定位全部官方自述（README + deepwiki），开源 5 周（2026-07-06~08-12）社区**无第三方采用案例**——无"我用 Avernet 搭了 X"的上手长文，GitHub 外部 issue 极少（#878 Windows 支持是罕见例），英文技术圈（HN/Reddit）零讨论。"卖底座"在产品层**尚未被外部采用验证**——作为"协作层老师"学的是机制（源码直证安全），不是产品形态（社区零证据）。

## A. 根本使用场景

**主场景：组织级多 agent 协同办公**。✅ README 原文：「teams that need to run multiple agents together, connect heterogeneous runtimes, support shared context, governed execution, and long-lived collaboration」。

> ⚠️ **社区走查标注（`pm-avernet-community.md` P1）**：本旅程基于 README + deepwiki 推演的**蚂蚁内网 dogfooding 场景**；开源首周外部社区**无独立上手长文验证**；唯一外部 issue #878 卡在 **Windows 安装门槛**（`marwanlhabti5-coder`/`NOWAYyang` 讨论用 PowerShell/WSL2 跨平台），未触达协作能力本身。

一段用户旅程（蚂蚁内网场景）：一个团队把 5 个 agent（CEO / 产品经理 / 研发 / 验证 / 客服）✅ 注册进 BCS，每个 agent 跑在不同 runtime（本地 CLI / 云沙箱 ARCA / 桌面 VM BaaS / 既有 bot 平台 downlink gateway）✅。团队成员在 web workbench（`http://127.0.0.1:8000/`）✅ 发起一个协作任务（YAML 模板定义的状态机）✅，BCS 按「dumb router」规则把消息 broadcast 或 @mention 路由给对应 bot ✅。bot 们按状态机推进（讨论 → 提案 → 选举 → 执行 → 终态）✅，需要人拍板时状态机停在 HumanInput 节点等人回应 ✅。任务跑完后协作史和 bot 间关系留在 BCS 里，下次同 bot 再协作不重头开始 ✅。

**两条接入路径**：✅
1. **Plugin 接入**：agent 主动 WebSocket 连到 `ws://<BCS>/ws/bot`，走 BCN 协议注册/收消息/回报（OpenClaw / 本地 agent / 自建 bot 用此）。
2. **Gateway 接入**：既有 bot 平台 / 多实例 agent 服务 / 外部调度系统，Avernet 通过 downlink gateway 把任务派到外部平台，平台调度 agent 后回报结果。

**关键差异点**：Avernet 卖的不是「单个 agent 能力」，而是「**让多个 agent 长期共事、沉淀组织能力**」的底座——这是它和单 agent 工具的根本分野。

## B. 解决的痛点（四大瓶颈展开，README 原文 + 症状细化）

Avernet 把多 agent 从「跑得动」到「跑得久、跑得齐、留得住」拆成四个瓶颈。✅ 前三个是「能协作」，第四个是「能积累」。

### B.1 Cannot find（找不到能力）
**症状**：✅ + ⚠️ 推断细化
- agent 一多，谁擅长什么散落各处，没有统一登记——要找一个「懂数据库调优」的 agent 得挨个问。
- 新任务来了不知道派给谁，靠人凭印象指派。
- bot 之间不知道彼此存在，无法主动发起协作。

**Avernet 解法**：持久 bot registry（`bot_id` + name/summary/domains/skills/scopes）✅ + `bcs-cli discover` 按 query/skills/visibility/协作资格检索 ✅ + friend/relation 图把能力登记成可寻址资源 ✅。

### B.2 Cannot align（对不齐）
**症状**：✅ + ⚠️ 推断细化
- 表面上同意，实际各 bot 理解不一，共识是假的——开完会各干各的，结果对不上。
- 多 bot 各自给方案，冲突点没显化，最后合并才发现矛盾。
- 没有「对齐」这一步，直接进执行，返工。

**Avernet 解法**：结构化协作模板（YAML 状态机 + Proposal + Judge）逼出真实对齐而非口头一致 ✅ + BCSFuse G2 `conflict_alignment` 模式专门识别冲突点 / 对齐点 / key insights ✅ + 协作状态机把「讨论 → 提案 → 选举 → 执行」做成必经阶段 ✅。

### B.3 Cannot run fast（跑不快）
**症状**：✅ + ⚠️ 推断细化
- 流程靠人传话转发：A bot 输出 → 人复制给 B bot → B 输出 → 人再转给 C，人成了中继瓶颈。
- agent 之间要人接力，等人工转述期间任务停摆。
- 简单的多步协作也得人盯着每一步切换。

**Avernet 解法**：governed execution + 状态机自动推进，去掉人中继 ✅ + dumb router 自动 broadcast/@mention 路由，bot 间直接收发 ✅ + `bcs_assign_task` 工具让 bot 直接派子任务给 sub-bot，无需人转 ✅ + BotTask 节点自动把 instruction 派给 assignee bot ✅。

### B.4 Cannot retain（留不住）✅ 重点
**症状**：✅ + ⚠️ 推断细化
- 知识不随任务累积成组织能力，跑完就散，下次从头解释。
- bot 协作过一次，下次再协作不记得上次——每次冷启动。
- 团队换人 / 换 bot，历史经验全丢。
- 跨任务/跨协作的知识没有沉淀/抽象/检索机制。

**Avernet 解法（分层）**：
- **已实现**：bot 身份持久（`bot.json`，跨实例保活）✅ + 协作史持久（`StateMachineRunView` 回看全程）✅ + 关系图持久（friendships 表）✅ + bot 上下文 MEMORY 段（存对话历史与学到信息）✅ + BCS 聚合/摘要长会话保持连贯 ✅。
- **Planned 未实现**：✅ 跨任务/跨协作的**组织级记忆**（org memory）——抽象沉淀、检索、复用还在路线图上。真正的「组织越用越聪明」未落地，当前能留的是「这 bot 和谁合作过、跑过哪些 run」的协作史 + bot 自带 MEMORY，还记不住「组织从这些 run 里学到了什么」。

⚠️ 关键判断：「Cannot retain」是 Avernet 主打卖点但**部分仍是承诺**——已实现的是协作史/关系/bot memory 的持久化（焊住），未实现的是组织级抽象记忆。这是它和单 agent 工具的根本分野，但分野本身只兑现了一半。

## C. Feature list（用户实际能用的功能，按模块分维度全量列出）

> 来源：deepwiki 按 crate 维度逐个深挖（bcs-bot/group/session/routing/collaboration-runtime/collaboration-store/proposal/judge/friend/relation/fusion + AgentClaw + BaaS + Gateway + BCSFuse + OpenClaw engine + frontend + singlebox + bcs-cli + plugin/config）。

### C.1 Bot 注册与发现（`bcs-bot` / `bcs-bot-store`）
- `bcs-cli onboard`：注册 bot，填 name/summary/skills/domains/scopes，持久化 `bot.json` 到 `$BCS_DATA_DIR/{bot_id}/`。✅
- `bcs-cli list`：列所有已注册 bot。✅
- `bcs-cli get <bot_uuid>`：查单个 bot 详情。✅
- `bcs-cli discover`：按 query / skills / visibility / 协作资格检索 bot。✅
- `bcs-cli visibility <bot_uuid>`：查看/设置 bot 可见性（public 任何 bot 可邀请 / protected 仅好友可邀请，protected 是默认）。✅
- bot 连接/重连时分配 `bot_id` + token，或校验既有 token。✅
- bot profile 字段：`bot_id` / name / summary / domains / skills / scopes / `registered_at`。✅

### C.2 Friend / Relation 关系网（`bcs-friend` / `bcs-relation` / `bcs-friend-store`）
- `bcs-cli friend request --to-bot <uuid>`：发好友请求（`POST /friends/request`）。✅
- `bcs-cli friend requests [--direction received|sent|all] [--status]`：列好友请求。✅
- `bcs-cli friend accept --request-id`：接受请求（双向互发时接受一方自动接受反向）。✅
- `bcs-cli friend reject --request-id`：拒绝请求。✅
- `bcs-cli friend list [--bot-uuid]`：列好友。✅
- 关系图决定谁能协作 + 权限边界——protected bot 仅好友能拉进群，`validate_target` 在建群时校验。✅
- 持久化：JSON 文件（`friendships.json` / `friend_requests.json`）或 SQLite `bcs_friendships` / `bcs_friend_requests`。✅

### C.3 Group 群组（`bcs-group` / `bcs-group-store`）
- `bcs-cli create-group`：直接建群，指定 driver + participants + topic + 可选 context。✅
- `bcs-cli request-group-help --topic`：请求群协作（自动发现或人工确认参与者），生成 proposal。✅
- `bcs-cli confirm-group-help --url`：用 token URL 确认群协作 proposal（`/groups/<token>/confirm`）。✅
- `bcs-cli list-groups`：列自己参与的正式群。✅
- `bcs-cli get-group <group_id>`：查群详情。✅
- `bcs-cli add-member --group --bot-uuid`：加成员。✅
- `bcs-cli group-status --group --status`：更新群状态（仅 coordinator）。✅
- `bcs-cli terminate-group --group`：终止群会话（仅 driver）。✅
- 群消息历史可查（`/groups/{id}/messages`）。✅
- 群 workspace 可读可写（`/groups/{id}/workspace`）。✅
- 群配置上限可调：`max_groups_as_driver` / `max_group_members` / `max_groups_as_member` / `max_group_messages` / 群聊延迟 `group_chat_delay_min_ms`~`max_ms`。✅

### C.4 Session 会话（`bcs-session` / `SessionStore`）
- `bcs-cli session create`：在群下建 session，server 分配随机 ID，指定 group/title/kind（chat 或 service_invocation）/input/meta。✅
- `bcs-cli session list`：列群下 session，按 status（running/completed）/q（标题模糊）/participant/分页过滤。✅
- `bcs-cli session get`：查单个 session。✅
- `bcs-cli session chat`：往 session 发消息（caller 从 bearer token 解析）。✅
- `bcs-cli session messages`：拉消息历史，按 `view_bot` / `limit` / `before` 过滤。✅
- `bcs-cli session patch`：改 session 标题。✅
- `bcs-cli session complete`：标记 chat session 完成（仅 driver，可带 output/error；service_invocation 不适用）。✅
- `bcs-cli session add-member`：加 bot 参与者。✅
- `bcs-cli session invite-link`：生成短期邀请链接让人加入。✅
- `bcs-cli session file`：session 共享文件 workspace——`upload/list/download/delete/share/capabilities`。✅
- session-only 成员不计入正式群列表。✅
- **1:1 chat**：`bcs-cli chat` 直接对单 bot 发消息（`/bots/{id}/chat`），可带 `session_id` 跨调用共享上下文。✅
- service_invocation session 隔离（不同 bot 不能读彼此的 service session）。✅

### C.5 消息路由（`bcs-routing` / `MessageRouter`）
- 无 @mention：`chat.send` 给 coordinator/driver（要回应），`chat.inject` 给其他人（静默观察）。✅
- 有 @mention：`chat.send` 给被点名 bot，`chat.inject` 给其他人。✅
- @ALL：全员 `chat.send`。✅
- 发送者永远被排除。✅
- 集成 AI security gateway（内容安全）。✅

### C.6 Collaboration 协作状态机（`bcs-collaboration-runtime` / `bcs-collaboration-store`）
- YAML 模板定义协作流：`name` / `participants`（角色绑 bot 或人，如 driver 绑 bot_id）/ `runtime: state_machine` / `state_machine`（`graph_mode: acyclic` + `nodes` + `final_output`）/ `api_version: bcs.collaboration/v1` / `version`。✅
- 节点类型 `StateMachineNodeKind`：`bot_task`（给 bot 派任务）/ `human_input`（等人输入）。✅（注：README/mermaid 里的 Discussion/ProposalGeneration/LeaderElection/Execution/Final/Aborted/Error 是高层概念态，代码层节点 kind 主要是 BotTask 与 HumanInput 两类，高层态由这两类组合表达）🟡
- 节点字段：`kind` / `display_name` / `assignee` / `instruction`。✅
- `bcs-cli collaboration validate <file.yaml>`：校验 YAML 是否符合 BCS schema（`/collaboration/definitions/validate`）。✅
- `bcs-cli collaboration create <file.yaml>`：从已校验 YAML 建协作群（可带 group ID + driver bot UUID + participant 绑定）。✅
- `bcs-cli collaboration run <file.yaml>`：提交 YAML + 角色绑定在当前 session 跑一次性状态机（`/sessions/{session}/state-machine-runs`）。✅
- `bcs-cli collaboration permission`：查当前 session 跑状态机的权限。✅
- 转换命令：`StartStateMachineRunCommand`（启动）/ `RespondHumanNodeCommand`（人回应 HumanInput）/ `HandleSessionHumanInputCommand`（session 人输入，内部调 respond_human_node）/ `CancelStateMachineRunCommand`（中止，转 Aborted）。✅
- `StateMachineRunView`：回看 run 全貌——`run`（id/status/关联群+session）+ `nodes`（每节点 node_id/display_name/kind/assignee/status/attempt/started_at/completed_at/sub_status）+ `judge_outputs`（judge 评估结果）。✅
- 内置模板示例（`seeds/collaboration-templates/`）：`Guided Answer`（单 bot_task 节点 driver 出建议）/ `bot-human-bot-review.yaml` / `micro-merchant-event-orchestration.yaml`。✅
- 持久化：`DbCollaborationTemplateRepo` / `MemoryCollaborationStore` + `StateMachineRunRepoPort` / `StateMachineDefinitionRepoPort`。✅

### C.7 Proposal 提案（`bcs-proposal` / `ProposalStore`）
- `ProposalService` 创建/管理结构化提案。✅
- token-based 确认 URL：`bcs-cli confirm-group-help --url http://localhost:21000/groups/<token>/confirm`，`confirm_proposal` 消费 token 建群。✅
- 触发场景：`request-group-help` 时 `create_proposal` 生成。✅
- 持久化：JSON 文件或 SQLite。✅

### C.8 Judge 裁判（`bcs-judge` / `LlmJudgeService`）
- `LlmJudgeService` 实现 `JudgeEvaluatorPort`，LLM 评估提案/协作结果。✅
- 评估结果（approved/rejected 等）决定状态机下一跳。✅
- `judge_outputs` 进 `StateMachineRunView`。✅
- LLM provider 可配（`llm` 配置，Anthropic / OpenAI-compatible 插件）。✅

### C.9 Context Fusion 上下文融合（`bcs-fusion` Rust crate / `BCSFuse` Python 服务）
- `FusionEngine`（Rust）合并 bot 上下文四段：IDENTITY / SOUL / RULES / MEMORY，存在 bot 基目录如 `/bots/zhangsan/`。✅
- `BCSFuse`（Python/FastAPI）`GroupFusionService` 多模式融合多 bot 视角，`fusion_mode` 字段指定：✅
  - **G1 `agent`**（默认）：基础融合，收集各方视角生成单一 recommendation（recommendation 填充，conflicts/alignment/risk/critical 留空）。✅
  - **G2 `conflict_alignment`**：`ConflictAlignmentService` 识别冲突 / 对齐点 / key insights / conclusion。✅
  - **G5 `expert_diagnosis`**：`ExpertDiagnosisService` 风险评估 / critical issues / 多个专家建议 / go-live conditions / summary，过滤离线 worker、支持 strict_participants，timeout 更长。✅
  - **G9 `bot_profile_fuse`**：`ProfileMergeService` + `GroupContextService` 并发，融合多 participant profile 成「super BOT Profile」+ LLM 回答，`extend_result` 含 `fused_profile` + `group_conversation`。✅
  - G3/G4/G6/G7/G8 未在代码 enumerate（`FusionMode` 仅四值）。🟡
- 触发方式：`bcs-cli fuse --group --question --participants --mode [--pretty]`（直连 GroupFusionService，不经 HTTP）/ `POST /openapi/v1/bcsfuse/groups/{group_id}/fuse` / BCS 需 bot 发现或群融合时 HTTP 调 BCSFuse（`FusionRequest` 含 question/participants/driver_bot_id/mode/fusion_mode/session_id/options/metadata，同步返回 `FusionResult`）。✅
- BCSFuse 集成 BCS：作为下游 provider，BCS 需 bot 发现/群融合时 HTTP 调 BCSFuse。✅

### C.10 AgentClaw 后端（bot 生命周期 / skills / 发布 / 多租户）
Public OpenAPI v1（`/openapi/v1/bots/<component>/…`，外部租户用，`avernet_tenant` + `GatewayPrincipal` JWT 隔离）：✅
- **Bots**：创建/列表/详情/更新/删除/重启/状态/engine 配置。✅
- **MCP（Marketplace Config）**：marketplace servers / tenants / permissions / 统一 server 配置。✅
- **Resources**：文件/链接/文件夹统一抽象，list/create/upload/get/update/delete/download/preview。✅
- **Skills**：bot 本地 skill 全生命周期——list/upload（zip 包）/get metadata/activate（建 symlink 同步到 device）/deactivate/delete（inactive 可恢复删除）。✅
- **Routines**：定时/触发式 agent 任务——list/create/get/update/delete/立即执行（run）/查执行历史。✅
- **Identity**：读写 bot 身份 markdown 文件（RULES / SOUL）。✅
- **Engine Runtime**（包 engine adapter）：sessions / engine status / models / approvals / connection。✅
- **Service Bot Publish**：状态机驱动发布流，`DRAFT → BUILDING → ONLINE`，`BotPublishService` 主导。✅
- **Skills Pool & Reconciliation**：bot skill layout 迁移到统一共享池，`SkillsPoolReconcileService` + 后台 `SkillsPoolReconcileTaskHandler` 周期对账。✅
- **Device Provisioning**：`DeviceContextResolver` 解析 bot 设备上下文，抽象 ARCA/BaaS 等计算资源。✅
- **Tenant Isolation**：`avernet_tenant` ORM guard + `GatewayPrincipal` JWT，严格数据边界。✅

### C.11 BaaS 执行面（`secbaas-community`）
- bot 生命周期管理：创建/沙箱 provision/运行时调度/session 管理。✅
- `BaasService.create_bot`：payload 含 name/ID/engine/type 发 BaaS API。✅
- PaaS provider 集成：Arca / TeClaw 等托管 bot runtime，`user_config.plugins.sandbox` 配置。✅
- `ClawBotService`：OpenClaw WebSocket 协议与外部 bot 服务通信，`AsyncChatClientPool` 连接复用。✅
- `OpenClawChatPort`：`chat_stream`（流式 chat 事件）/ `chat_abort`（取消 in-flight chat run）。✅
- 用户可：start bot（指定 name/engine/type）/ run chat / 配置 sandbox provider。✅

### C.12 Gateway 网关
- config-driven forwarding：新 API 上线不需 Gateway 发版（`/authorize` `/token` `/revoke` 等 local 端点除外）。✅
- OpenAPI 聚合：后台刷新自动采纳后端最新 OpenAPI 描述。✅
- 认证：把多样外部凭证解析成统一签名 `GatewayPrincipal`；支持一方 user session + 委托 OAuth 2.0（"Login with Avernet"，Authorization Code + PKCE，三方服务器代用户操作需显式 consent）。✅
- 策略链：`AppTokenStrategy` / `AccessKeyTokenStrategy` / `BotTokenStrategy` / `GoogleUserStrategy`。✅
- 两凭证模型：外部凭证 vs 内部签名 Principal 分离。✅
- 用户可：用 Google OIDC 等认证 / 给三方应用 OAuth 授权（consent 屏）/ 经 Gateway 访问所有后端 API。✅

### C.13 OpenClaw Engine Adapter（engine session / skills / 插件）
- 引擎支持：`claude_code`（开箱即用，vendored gateway 经 `@anthropic-ai/claude-agent-sdk` 或 `claude` CLI）/ `openclaw`（需外部 gateway，`openclaw` npm 包，未含在开源构建）。✅
- Engine Session 管理（`OpenClawSessionPort`）：`sessions_list`（含 chat history）/ `session_create`（`sessions.patch`）/ `session_delete` / `session_clear`（`sessions.reset`）。✅
- Skills 管理：OpenClaw 用 bulk symlink 而非 per-skill 操作，能力 `SKILLS_SYNC_SYMLINKS` / `SKILLS_SYNC_BINDPATHS` / `SKILLS_CLEAN_SYMLINKS` / `SKILLS_CENTER_ENSURE`。✅
- Plugin 架构：各引擎（OpenClaw / Hermes Agent / Claude Code）实现 Session/Chat/MCP/Skills 协议，`OpenClawEngine` 作组合根，ACL adapter 组装 `OpenClawPluginImpl`。✅
- Layout Activation：skill layout 从 Skills Pool 同步到容器本地 fs，`active_layout` + `layout_contract_version` 契约。✅

### C.14 WebSocket Bot Protocol（BCN 插件路径）
- bot 连 `ws://<BCS_HOST>:<BCS_PORT>/ws/bot`，JSON 文本帧。✅
- `req`/`res`/`event` 帧。✅
- 生命周期：`bot.connect` 握手（认证 + 协议协商）+ `bot.status` 心跳保活。✅
- BCS 发 `chat.send`（要回应）/ `chat.inject`（静默观察）/ `chat.history`。✅
- bot 收 `chat.send` 后回 `res`（含 `run_id`），再 `event: chat.event` 流式 partial text / tool call。✅
- `openclaw-channel-bcn` 插件：OpenClaw 的 BCN 参考实现，注册 `bcs` channel、连 BCS WS、处理 `chat.send`/`chat.inject`/`chat.history`、路由入站群消息、持久化 BCS session state；提供工具 `bcs_route` / `bcs_assign_task`（`target_bot`/`message`/`response_mode`）/ `bcs_send_task_message` / `bcs_task_complete`。✅
- 安装：`openclaw plugins install npm:@avernet-plugin/openclaw-channel-bcn` 或源码构建。✅

### C.15 BCS HTTP Delivery 端点（全量）
`Authorization: Bearer <token>` 保护：✅
- Bots：`/bots/onboard` / `/bots` / `/bots/{id}` / `/bots/discover` / `/bots/status` / `/bots/{id}/chat` / `/bots/{id}/friends` / `/bots/{id}/visibility`。✅
- Friends：`/friends/request` / `/friends/requests` / `/friends/requests/{id}/accept` / `/friends/requests/{id}/reject`。✅
- Groups：`/groups/request` / `/groups/{token}/confirm` / `/groups` / `/groups/my` / `/groups/{id}` / `/groups/{id}/members` / `/groups/{id}/chat` / `/groups/{id}/messages` / `/groups/{id}/workspace`。✅
- Collaboration：`/collaboration/definitions/validate`。✅
- Sessions：`/sessions/{id}/state-machine-permission` / `/sessions/{id}/state-machine-runs`。✅
- Fuse：`/groups/{id}/fuse`。✅
- Health：`/health`。✅
- WebSockets：`/ws/bot`（bot 连）+ `/ws`（client events）。✅
- Service：`/services/{group_id}/sessions`（起 service_invocation session）。✅

### C.16 Plugin 系统（可插拔基础设施）
- `plugin-api`（trait）+ `plugins`（实现）分层。✅
- **DB**：`bcs-db-api` / `bcs-db-local`（SQLite）/ `bcs-db-mysql`（MySQL/OceanBase 兼容）。✅
- **Cache**：`bcs-cache-api` / `bcs-cache-local`（内存）/ `bcs-cache-redis`。✅
- **LLM**：`bcs-llm-api` / `bcs-llm-anthropic` / `bcs-llm-openai-compatible`。✅
- **Auth**：`bcs-auth-api` + `bcs-auth-session` / `google` / `github` / `wechat` / `alipay` / `local` / `oauth`。✅
- **Storage**：`bcs-storage-api` / `bcs-storage-baas` / `bcs-storage-local`。✅
- **Security Gateway**：`bcs-security-gateway-api` / `bcs-security-gateway-local`。✅
- **Channel**：`bcs-channel-api` + `openclaw-channel-bcn`（TS 插件）。✅

### C.17 配置项（admin 可配，`BcsConfig`，TOML + env + CLI flag，base + override）
- 数据目录 `bots_base_dir`。✅
- DB 后端 `database.type`（sqlite/mysql）+ sqlite path / mysql 配置。✅
- Security gateway（`gateway_principal` JWT 签名 key 查询校验）。✅
- bot 默认可见性 `default_visibility`（protected/public）。✅
- Fusion provider（`fusion_provider` LLM）。✅
- server `bind`/`port`。✅
- LLM provider（状态机 judge 调用）。✅
- `store_messages` 开关。✅
- `auth_token`（client WS 连接）。✅
- `leader_election`（分布式部署）。✅
- `cache` / `secret` 选择器。✅
- `channels`（IM bridge）/ `collaboration`（模板配置）。✅
- `onboard_binding_enabled`（onboard 时绑 channel）。✅
- 群上限 + 群聊延迟（见 C.3）。✅

### C.18 Frontend Workbench（React/Umi，`http://127.0.0.1:8000/`）
README 明确的 workbench 能力 + 由 bcs-cli 能力推断的 UI 映射：✅ + 🟡
- 本地 onboarding 流程。✅
- coordination flow（协调流程演示）。✅
- 与本地测试 bot 交互。✅
- 推断可操作：onboard bot / 建群 / 起 collaboration / 看状态机 run 状态 / 与 bot chat（1:1 + 群）/ 管好友 / 看消息历史 / 管 workspace / 回应 HumanInput 节点。🟡（deepwiki 未给具体页面截图，由 bcs-cli 端点映射推断）⚠️ **社区走查（`pm-avernet-community.md` P1）**：开源首周**无第三方上手长文**；外部用户 issue 反馈集中在**安装门槛**——`singlebox.sh` 仅 bash，Windows 原生跑不了，官方倾向 WSL2+Ubuntu LTS 而非 PowerShell 重写（2026-08-12 `carolynli` 回应）。workbench 能力推断（🟡）保持，但应加"**外部上手率极低**"风险注。

### C.19 编排与 Demo（`singlebox.sh` + Bot Profiles）
- `singlebox.sh`（无参 / `--standalone` / `-s`）启动本地全栈，`START_ORDER`：`baas` → `backend` → `bcs` → `bcsfuse` → `bots` → `demo_bot` → `frontend`。✅
- **5-Bot Team Profile**（「一个人 + 一支队」）：CEO（目标 framing/任务拆解/资源分配/决策）/ 产品经理（需求/优先级/验收标准）/ 研发（实现/架构 review/代码质量/技术风险）/ 验证（QA/测试设计/边界/发布就绪）/ 客服（用户反馈/issue 分诊/服务恢复/升级）。✅
- **8-Bot Micro-Merchant Profile**：`--profile-dir scripts/8bots_micro_merchant_profile` 可启动，但具体 bot/角色/场景 deepwiki 未详述。🟡
- `start_bcs_bots.sh` 配置本地测试 bot，构建 BCN 插件（检测新 TS 源码则 `npm install && npm run build`）。✅

### C.20 bcs-cli 全量命令
bot：`onboard` / `list` / `get` / `discover` / `visibility`。✅
chat：`chat`（1:1）/ `session chat`（群内）。✅
group：`request-group-help` / `confirm-group-help` / `create-group` / `list-groups` / `get-group` / `add-member` / `group-status` / `terminate-group`。✅
collaboration：`validate` / `create` / `run` / `permission`。✅
friend：`request` / `requests` / `accept` / `reject` / `list`。✅
session：`create` / `list` / `get` / `chat` / `messages` / `patch` / `complete` / `add-member` / `invite-link` / `file`（upload/list/download/delete/share/capabilities）。✅
fuse：`fuse --group --question --participants --mode [--pretty]`。✅
service：`service`（service_spec 驱动 service-invocation 流）。✅
health：`health`。✅

### C.21 其他横切
- 异构 runtime：ARCA（云沙箱）/ BaaS（桌面 VM）/ 本地 / 既有 bot 平台（downlink gateway），BCS 只协调执行在 runtime。✅
- 持久后端可切：SQLite（本地 dev）/ MySQL / OceanBase（生产）。✅
- 程序化 DB migration（SQLite + MySQL/OceanBase schema 一致）。✅

## 2. 它解决的什么问题

见 B 节四大瓶颈展开。核心是**多 agent 从「跑得动」到「跑得久、跑得齐、留得住」**——前三个（find/align/run fast）是「能协作」，第四个 retain 是「能积累」，但 retain 只兑现了一半（协作史/关系/bot memory 已实现，组织级抽象记忆 Planned）。✅

没它之前：每个 agent 孤立跑，团队靠人传话协调，跑完知识散在各 agent 对话历史里没人能再捞出来，agent 之间不认识、下次协作冷启动。⚠️

## 3. 核心概念

| 概念 | 是什么 | 持久性 |
|------|--------|--------|
| **BCS（Bot Coordination Service）** | Rust 微内核，协调层核心，hexagonal 架构，transport-agnostic | 常驻服务 ✅ |
| **Bot** | 注册进 BCS 的 agent 实例，`bot_id` + name/summary/domains/skills/scopes + IDENTITY/SOUL/RULES/MEMORY 上下文 | **持久**（`bot.json`）✅ |
| **Group** | 多 bot 群组，群聊 + 协作容器，有 driver/coordinator | ✅ |
| **Session** | 群下一次交互/对话实例，kind=chat 或 service_invocation，有 transcript + workspace | ✅ |
| **Collaboration** | YAML 状态机定义的多 bot 工作流（一次 run） | run 状态持久，run 结束存史 ✅ |
| **Relation / Friend** | bot 间社交关系，决定谁能协作 + 权限（protected 仅好友可入群） | **持久** ✅ |
| **Proposal** | bot 在协作中生成的结构化提案，带 token 确认 URL | 临时（ProposalStore）✅ |
| **Judge** | LLM 裁判（`LlmJudgeService`），评估提案/审批结果，驱动状态机下一跳 | ✅ |
| **BCSFuse** | Python 上下文融合服务，多 bot 视角合并（G1/G2/G5/G9） | ✅ |
| **StateMachineRun** | 一次协作的执行实例，BotTask/HumanInput 节点逐个推进 | **持久**（RepoPort）✅ |
| **Routine** | AgentClaw 定时/触发式 agent 任务，可立即执行 + 查执行历史 | ✅ |
| **Skill** | bot 本地能力包（zip），可 activate/deactivate，sync 到 device | ✅ |
| **Service Bot** | 发布态 bot，DRAFT→BUILDING→ONLINE 状态机 | ✅ |

## 4. 状态哲学（重点）

**一句话：状态焊在「协作状态机 + 关系图 + bot 身份」三层，bot 实例可换、关系与协作史永留——只要 `bot_id` 不变。** ✅

### 4.1 三层焊点

1. **协作状态机**（`bcs-collaboration-runtime`）：每个 `StateMachineRun` + `StateMachineNodeRun` 持久化（`StateMachineRunRepoPort` / `StateMachineDefinitionRepoPort`），含 run 状态、节点状态、HumanInput 等待、judge 结果。✅ 协作跑到哪一步、停在哪等人、审批了什么——全留。
2. **关系图**（`bcs-bot` BotRegistryCoreService 维护 Friend/Relation Graph）：bot 间谁能协作、权限边界，持久在 `bcs_friendships` / relation repo。✅
3. **bot 身份**（`bcs-bot-store` `PersistentBotRepo`）：`bot.json` 存 `bot_id`/name/summary/domains/skills/scopes，持久；bot 上下文四段 IDENTITY/SOUL/RULES/MEMORY 存 bot 基目录。✅

### 4.2 持久化分工（`bcs-*-store`）

- `bcs-bot-store`：`$BCS_DATA_DIR/{bot_id}/bot.json`（bot 元数据）+ bot 基目录存 IDENTITY/SOUL/RULES/MEMORY。✅
- `bcs-friend-store`：JSON 文件或 SQLite `bcs_friendships` / `bcs_friend_requests`。✅
- `bcs-relation-store`：RelationRepo（关系）。✅
- `bcs-group-store`：Memory / MySql（群组）。✅
- `bcs-message-store`：Memory / MySql（消息，`store_messages` 可关）。✅
- `bcs-collaboration-store`：`DbCollaborationTemplateRepo` / `MemoryCollaborationStore`（协作模板 + run）。✅
- `bcs-proposal` ProposalStore：临时提案 + token 确认 URL。✅

后端可切 SQLite（本地）/ MySQL / OceanBase（生产），程序化 migration 保 schema 一致。✅

### 4.3 换成员 vs 换协作意味着什么

- **换 bot 实例（同 `bot_id`）**：关系、协作史、协作状态全留——bot 是「岗位」，实例是「在岗的人」，人换了岗位还在。✅ 这是「焊在关系网 + 协作状态机」的字面含义。
- **换协作（新 run）**：旧 run 历史留存，新 run 从 Initial 起，但**参与者还是那些 bot、关系网没变**——协作是一次性的，关系是长期的。✅
- **删 bot（`bot_id` 失效）**：该 bot 无法再被寻址，但历史 run/关系记录仍在（⚠️ 推断——历史是 append-only repo，删 bot 不回滚历史）。

⚠️ 注意：真正的**组织记忆（org memory）标 Planned 未实现**——当前留的是「协作史 + 关系 + bot 自带 MEMORY 上下文」，跨任务的知识沉淀/抽象/检索还没做。BCSFuse 的 G9 bot_profile_fuse 能在单次协作内融合 profile，但跨协作的组织级记忆沉淀不在已实现范围。

## 5. 派活与编排交互

- **用户下达工作**：在 frontend workbench 发起 collaboration（YAML 模板）或群聊消息；或 `bcs-cli create-group` / `request-group-help` / `collaboration run`。✅
- **路由规则（dumb router 核心）**：BCS 只做路由，不做业务逻辑——bot 自己根据注入上下文（session_context + IDENTITY/SOUL/RULES/MEMORY）决定行为。✅
  - 无 @mention：`chat.send` 给 coordinator/driver（要回），`chat.inject` 给其他人（静默观察）。✅
  - 有 @mention：`chat.send` 给被点名者，其他人 `chat.inject`。✅
  - @ALL：全员 `chat.send`。✅
- **协作状态机推进**：`CollaborationRuntimeService` 按 YAML 节点推进，命令驱动转换（`StartStateMachineRunCommand` 启动 / `RespondHumanNodeCommand` 人回应 / `CancelStateMachineRunCommand` 中止）。✅ BotTask 节点把 instruction 派给 assignee bot；HumanInput 节点等人回应。✅
- **多 bot 协作**：bot 收 `chat.send`（含 `session_context`）→ 回 `res`（含 `run_id`）→ `event: chat.event` 流式 partial/tool call。✅ `bcs_assign_task` 工具让 bot 直接派子任务给 sub-bot（`target_bot`/`message`/`response_mode`），sub-bot 回应作为后续消息到达。✅
- **5-Bot demo 协作流程**：CEO framing 目标 → 拆任务派给 PM/研发/验证/客服 → 各 bot 收 `chat.send` 执行 → 结果回流 → 状态机推进至终态。✅（具体步骤 deepwiki 未给逐帧，此为基于路由规则 + 角色职责的推断 🟡）

## 6. 记忆与上下文

- **Context Fusion（已实现）**：`bcs-fusion` Rust crate 的 `FusionEngine` 合并 bot 上下文四段（IDENTITY/SOUL/RULES/MEMORY）；Python `BCSFuse` `GroupFusionService` 多模式融合多 bot 视角（G1 基础推荐 / G2 冲突对齐 / G5 专家诊断 / G9 profile 融合）。✅
- **协作史沉淀**：`StateMachineRunView` 可回看 run 全程 + 节点状态 + HumanInput + judge 结果。✅
- **bot MEMORY 字段**：bot 上下文含 MEMORY 段，BCS 聚合/摘要对话历史保持长会话连贯。✅
- **Session 消息历史**：`session messages` 可拉历史，按 `view_bot`/`limit`/`before` 过滤。✅
- **Bot Routines**：AgentClaw 定时/触发式任务，可立即执行 + 查执行历史（这是 Avernet 唯一接近「定时任务」的已实现能力）。✅
- **Org Memory（Planned 未实现）**：跨任务/跨协作的组织级知识沉淀、检索、复用——在 Shared Intelligence 路线图上，当前未落地。✅（README 标 Planned）
- **Orchestration / Evolution（Planned）**：高层编排与持续进化未实现。✅

**结论**：记忆分两层——**协作史 + bot 上下文 + routines（已实现）** vs **组织级抽象记忆（Planned）**。Avernet 现在能记住「这 bot 和谁合作过、跑过哪些 run、它的 MEMORY」，还记不住「组织从这些 run 里学到了什么」。

## 7. 审批与介入

- **HumanInput 节点**：状态机跑到需要人决策的节点，停下来等人回应，`RespondHumanNodeCommand` / `HandleSessionHumanInputCommand` 提交。✅
- **Proposal + Judge**：bot 生成提案（`bcs-proposal` ProposalService）→ LLM judge（`LlmJudgeService`，`JudgeEvaluatorPort`）评估 → 审批结果（approved/rejected）决定状态机下一跳，`judge_outputs` 进 `StateMachineRunView`。✅
- **token URL 确认**：`request-group-help` 生成 proposal，`confirm-group-help --url` 用 token 确认。✅
- **介入点**：人在「HumanInput 等待 + Judge 审批 + token URL 确认」三处介入，不是每步都插手——状态机自动跑，只在设计好的节点停。✅
- **engine approvals**：AgentClaw engine runtime 有 approvals 端点组（engine 操作审批）。✅

## 8. 执行与持久

- **bot 跑在哪**：异构 runtime——ARCA（云沙箱）/ BaaS（桌面 VM，`secbaas-community`）/ 本地 / 既有 bot 平台（downlink gateway）。✅ BCS 只管协调，执行在 runtime。
- **OpenClaw 引擎适配**：Python/FastAPI，统一 WS+HTTP 面，anti-corruption layer 翻译到具体引擎（`claude_code` 经 claude-agent-sdk 或 `claude` CLI / `openclaw` 经外部 gateway）。✅
- **BaaS bot runtime**：`ClawBotService` 经 OpenClaw WS 协议与外部 bot 服务通信，`AsyncChatClientPool` 连接复用，`chat_stream`/`chat_abort`。✅
- **持久形态**：SQLite（本地 dev）/ MySQL / OceanBase（生产）。✅ JSON 文件用于本地简单模式（friendships/bot.json/proposals）。✅ 程序化 migration 保 schema 一致。✅
- **Skill layout 同步**：Skills Pool → 容器本地 fs，`active_layout` + `layout_contract_version` 契约。✅

## 9. 商业模式与定位

- **开源**：Apache-2.0。✅
- **背景**：inclusionAI（蚂蚁集团发起，研究员来自 OpenAI/Google/Meta FAIR）。✅
- **生产验证**：蚂蚁 12 个业务群跑，多 agent 任务完成率 90%+（截至 2026-07）。✅ ⚠️ **社区走查校准（`pm-avernet-community.md` P0）**：此数字**全部源自蚂蚁官方 PR 通稿**（2026-08-07 同日由量子位/CSDN/搜狐/zol/淘宝大学/鱼皮/53AI 等 ~10 家中文媒体逐字转发），**零第三方独立核实**，且"完成率 90%"**口径无定义披露**（什么算"完成"？人审还是机器判？无说明）。对比 cloudflare-os 至少有 Sam Rhea 官方博客自曝"4000 Gadget 含 vibe code flood"打折扣，**Avernet 连这种官方自曝都没有，透明度反而更低**。蚂蚁内网 dogfooding 可信（蚂蚁是大公司、仓库高频内部开发真投入），但应按"**自报未验证**"引用，**不作硬背书**。
- **部署**：本地（`singlebox.sh`）/ Docker（`docker-compose.yml`）。✅ 自托管为主，未见 SaaS。
- **面向谁**：「teams that need to run multiple agents together」——组织级多 agent 运营团队，非个人单 agent 用户。✅
- **定位**：基础设施层（infrastructure layer），不是终端产品——卖底座不卖应用；workbench 是 demo 性质（本地 onboarding/协调流演示），非完整 SaaS 产品。✅
- **两条接入路径**：Plugin（agent 主动连 BCS）/ Gateway（既有平台经 downlink 接入），覆盖「自建 agent」+「既有 bot 平台」两类客户。✅
- **大厂背书早期项目形态**（`pm-avernet-community.md` P2）：Avernet 呈典型"大厂背书早期项目"形态——star 453（看着不错）但 watcher 仅 2（几乎没人追进展）、90%+ issue 是内部维护者自开（外部参与稀薄）、47 contributors top 10 全是内部团队 commit 主导。这种形态**适合学机制（源码认真），不适合学社区运营（社区不存在）**。agents-remote 作为 OPC 个人项目，社区运营策略应反过来：star 不重要、watcher 与外部参与才重要——别用 Avernet 的"媒体通稿 + star 数"当成功指标。
- **社区版/企业版分离是认真开源信号 + 中文媒体抢发 vs 英文圈冷遇**（`pm-avernet-community.md` P2）：仓库有 `src/engine/docs/community-corp-architecture.md` 明确把 engine 架构重构成"社区版 vs 企业版分离"，社区构建不依赖内部组件——**说明蚂蚁把 Avernet 当长期开源投入而非一次性扔出**，社区版是认真剥离的产物（与 cf-os 的 Kenton 推动开源战略意图同构）。**但双语温差明显**：开源首周中文科技媒体 ~10 篇抢发（蚂蚁光环效应），英文技术圈（HN/Reddit）零讨论——**蚂蚁背书在中文圈有光环效应，但翻译不成英文圈能见度**。agents-remote 启示：(1) Avernet 社区版未来可能持续成熟（蚂蚁有动力），3-6 个月后若补齐文档 + 外部采用可能快速成熟，应持续关注其 star/watcher 增速；(2) 我们若要英文圈能见度，不能靠中文通稿，需独立英文社区运营（HN/Reddit/Product Hunt）。

## 10. 对 OPC 多 agent 编排的启示

对照 agents-remote PRD（角色/任务/房间/看板/记忆/agentmore）：

### 印证（已有方向被证实）

1. **「状态焊在关系网 + 协作状态机，bot 可换但关系/史留着」直接印证 PRD 的「角色 = 身份资源非 per-session」**——Avernet 用 `bot_id` 跨实例保活 + IDENTITY/SOUL/RULES/MEMORY 上下文持久，PRD 角色应是 project 级可复用身份。✅ 强印证（与调研 §13 Claude Tag「身份=project 级资源」三重印证）。
2. **协作状态机 = PRD 房间的执行态**——Avernet 的 Initial→Discussion→Proposal→LeaderElection→Execution→Final 几乎就是 PRD 第二期「圆桌讨论 → 拆任务下发」的工程化。✅ 状态机驱动是「圆桌」的成熟形态，不是即兴聊天。但注意代码层节点 kind 主要是 BotTask + HumanInput 两类，高层态是组合表达——PRD 落地时不必照抄高层态名，用「BotTask + HumanInput」最小节点 + 状态机骨架即可。🟡 ⚠️ **社区走查分层（`pm-avernet-community.md` P0）**：这条印证**分两层**——(a) **机制层可学**：YAML 状态机 / BotTask+HumanInput 节点 / `validate`-`create`-`run` 工程化是源码直证、社区零反对零反驳，**作为 PRD 第二期圆桌状态机的设计参考安全**；(b) **产品层不可证**：Avernet 作为"协作状态机好不好用"无社区证据（开源 5 周零上手长文、零"我跑了一个协作 run"反馈），**不能因"蚂蚁 12 BG 用了"就推断它产品好**（12 BG 是内网 dogfooding，外部采用为零）。agents-remote 学机制 (a) 即可，不要照抄产品形态 (b)。
3. **dumb router 哲学印证 agents-remote 调研 §3.4**：协调层最小契约（只路由），智能在 agent。PRD 编排层应同样「薄」——只做消息路由 + 状态机推进，业务逻辑在 agent。✅
4. **HumanInput + Judge + token URL = PRD 审批闭环**——Avernet 用状态机节点 + LLM judge + token 确认做人在回路，PRD 第一期「agent 不能自己标完成、必须审批」同源。✅ 三段审批（人 HumanInput + LLM Judge + token 确认）比 PRD 二态更细，可吸收。
5. **异构 runtime 印证 hybrid 部署**——Avernet 本地/ARCA 云沙箱/BaaS VM/既有平台并存，agents-remote「本地执行面 + CF 控制面留口子」同构。✅
6. **Bot Routines 印证 PRD 后续「定时任务」**——Avernet 已实现的 routines（定时/触发式 + 立即执行 + 执行历史）是 PRD「定时任务」的现成范式，不必从零设计。✅
7. **Skill 系统（zip 包 + activate/deactivate + sync 到 device）印证 agents-remote 调研的 plugin/skill 扩展体系**——Avernet 的 skill 全生命周期（上传/激活/同步/对账）可直接参考。✅

### 挑战（Avernet 做了 PRD 暂未规划的）

1. **协作模板 YAML 化**——Avernet 把协作流程做成可定义/可验证/可复用的 YAML 状态机（`validate`/`create`/`run`）。PRD 房间目前偏「自由讨论」，可考虑吸收模板化（「圆桌」「评审」「standup」可复用流）。🟡
2. **Judge 作为状态机驱动器**——LLM judge 评估提案决定下一跳，比 PRD「agent 自报完成 + 人审批」二态更细。可考虑「agent 提案 → judge 评估 → 人最终」三段。🟡
3. **关系图作为权限边界**——Avernet 用 friend/relation 图 + protected/public 可见性决定谁能协作。PRD 角色间是否需要显式「谁能和谁协作」权限模型？第一期可能 YAGNI（个人 OPC 场景自己管自己），团队期/多租户期需要。🟡
4. **BCSFuse 多模式融合**——G2 冲突对齐 / G5 专家诊断 是 PRD 圆桌「讨论→对齐」的高阶能力，第一期 YAGNI，但第二期圆桌可吸收 G2「显化冲突点」做真实对齐。🟡
5. **Gateway OAuth 委托 + 多租户**——Avernet 的「Login with Avernet」+ tenant 隔离是 PRD 远期多租户/SaaS 化的现成范式。🟡

### 盲点（Avernet 暴露 PRD 待补）

1. **「org memory 标 Planned」是个清醒信号**——连蚂蚁生产级都还没落地组织记忆，PRD「长记忆」应务实分阶段：先协作史 + bot MEMORY 字段（Avernet 已验证），向量检索/抽象沉淀后置（与调研文档 L4 后置一致）。✅ 别一上来就做组织记忆。
2. **Avernet 是基础设施不是终端产品**——它卖底座，UI workbench 轻量（本地 onboarding/协调流演示）。agents-remote 是**面向 OPC 个人的终端控制台**（terminal/files/git inspection + 看板 + 圆桌），产品形态更重、更贴近用户。Avernet 是「可吸收的底座哲学」非「可照抄的产品」。⚠️ **社区走查补强（`pm-avernet-community.md`）**：开源 5 周（2026-07-06→08-12）社区**真空**——HN/Reddit 零帖、Twitter/X 唯一带观点帖 1 赞、中文媒体 ~10 篇全是同日通稿转发、GitHub issue 90%+ 内部维护者（totalfrank/vzvince/cassiuscai）自产自销、star 453/watcher 2 严重倒挂。"卖底座"在产品层**尚未被外部采用验证**（无"我用 Avernet 搭了 X"的上手长文）。我们学机制（源码直证安全），不学产品形态（社区零证据），更不学社区运营（社区不存在）。
3. **蚂蚁 12 BG 90% 完成率是组织级验证，OPC 单人场景密度不同**——单人管多 agent 不需要 friend/relation 权限图那套复杂社交，但需要「角色 + 任务 + 看板」轻量版。PRD 第一期边界（角色+任务+看板，不做圆桌/团队/定时）被 Avernet 的复杂度反向印证：**底座可以复杂，产品要轻**。✅ Avernet 光 BCS 就十几个 crate + 多语言（Rust + Python + TS 插件 + React），OPC 产品不能上这个复杂度。
4. **状态机驱动 vs PRD「圆桌平等讨论」**——Avernet 协作是状态机编排（有 leader 选举、有 driver），PRD 高管团是圆桌平等。两者不冲突：圆桌是「讨论段」语义，状态机是「讨论→提案→执行」推进框架——PRD 第二期圆桌应套状态机骨架（BotTask + HumanInput 两类节点够用）而非纯自由聊天，Avernet 给了现成 YAML 范式 + `validate`/`run` 工程化。🟡
5. **Avernet 的「Cannot retain」只兑现一半**——主打的 org memory 还在路线图，当前只有协作史/关系/bot memory。PRD 宣传「长记忆」时也要诚实分阶段，别把 Planned 当已实现卖。✅

### 对照 PRD 实体映射

| PRD 概念 | Avernet 对应 | 复用度 |
|---------|-------------|--------|
| 角色（AgentProfile） | Bot（bot.json + IDENTITY/SOUL/RULES/MEMORY 上下文，`bot_id` 跨实例保活） | 高：持久身份 + 上下文段 ✅ |
| 任务（OrchestrationGoal/Task） | Collaboration StateMachineRun + BotTask 节点 | 中：Avernet 协作是状态机 run，PRD 任务是看板卡片 + 执行记录，语义略偏（run 一次性 vs goal 长期卡片） 🟡 |
| 房间（RoundTable） | Group + Session + Collaboration 状态机 | 高：群聊路由 + session + 状态机推进 = PRD 圆桌工程化 ✅ |
| 看板 | 无直接对应（Avernet 是底座，无看板 UI） | ❌ PRD 需自建（Avernet 不提供看板，只有 `StateMachineRunView` 节点状态） |
| 记忆 | bot MEMORY 字段 + 协作史 + Routines（已实现）/ org memory（Planned） | 中：协作史/routines 可借鉴，org memory 未落地 🟡 |
| 审批 | HumanInput + Proposal + Judge + token URL | 高：三段审批机制可直接借鉴 ✅ |
| 定时任务 | AgentClaw Routines（定时/触发 + 立即执行 + 执行历史） | 高：现成范式 ✅ |
| agentmore（演进） | evolve（Planned） | 低：双方都还在路线图 ⚠️ |
| Skill 扩展 | AgentClaw Skills（zip + activate/deactivate + sync）+ BCS Plugin 系统 | 高：全生命周期可参考 ✅ |

## 11. 社区成熟度信号（`pm-avernet-community.md` 走查补）

> 本节由社区走查补入——pm-avernet.md 原文（§1-§10）全部基于官方/源码一手自述，**缺社区真实评价这一维度**。本节专门补这一缺口。

**一句话**：Avernet 开源 5 周（2026-07-06 创建 → 2026-08-12 走查），**英文技术社区零讨论、中文圈全是同日新闻通稿、GitHub 外部参与极稀薄**——典型"大厂背书早期项目"形态。

| 信号 | 数据 | 来源 |
|------|------|------|
| HN 帖子 | **0 个项目相关帖**（`avernet` 命中只是同名无关 HN 用户，created 2014） | HN Algolia API |
| Reddit 帖子 | **0 个项目相关帖**（site:reddit.com 全是无关子版） | firecrawl search |
| Twitter/X 唯一带观点帖 | `vintcessun`「恒星sun」2026-07-19，**1 赞 0 转** | firecrawl scrape |
| 中文科技媒体 | ~10 篇，**全是 2026-08-07 同日新闻通稿转发**（量子位/CSDN/搜狐/zol/淘宝大学/鱼皮/53AI 齐发，内容逐字同源） | firecrawl scrape |
| GitHub star / watcher | **453 / 2 严重倒挂**（watcher 几乎零 = 没人追进展） | GitHub REST API |
| GitHub issue 作者 | 最近 100 issue 中非 PR issue unique 作者仅 **3 个且全内部**（totalfrank 15/vzvince 5/cassiuscai 3）；外部 issue 极少（#878 Windows 支持是罕见例） | GitHub REST API |
| 唯一外部上手反馈 | #878：`marwanlhabti5-coder` 卡 Windows 装不上 + `NOWAYyang` 提 PowerShell 重写（官方倾向 WSL2） | GitHub issue #878 |

**对比 cloudflare-os**：cf-os 开源当天 HN 658pts/331 评论 + lord.technology 深度博客；Avernet 英文技术社区能见度**几乎不存在**。

**对 agents-remote 的启示**：
1. **学机制，不学产品/社区运营**——Avernet 的 dumb router / YAML 状态机 / 三段审批 / 焊关系网三层是源码直证、社区零反对，作为设计参考安全；但它作为"产品好不好用"无社区证据，不照抄产品形态。
2. **警惕"蚂蚁光环 = 媒体抢发但开发者不跟"**——star 数看着不错（453），但 watcher 几乎零、外部 issue 稀薄，说明大家只是点 star（可能是蚂蚁员工/中文开发者跟风），没人真在追进展。agents-remote 作为 OPC 个人项目，社区运营策略应反过来：**star 不重要、watcher 与外部参与才重要**——别用 Avernet 的"媒体通稿 + star 数"当成功指标。
3. **有空间抢占"多 agent 协作底座"社区心智位**——Avernet 有源码没社区，我们若做轻量版 + 真社区运营（HN/Reddit/Product Hunt 独立英文运营，不靠中文通稿），有机会。
4. **Avernet 不是当前可用竞品，但 3-6 个月后可能成熟**——仓库有 `community-corp-architecture.md` 明确区分社区版/企业版（认真剥离内部依赖，非一次性扔出），蚂蚁有动力持续投入。应持续关注其 star/watcher 增速与外部 issue 增量，别因"现在社区真空"就判定长期无威胁。

## 12. 证据分级与来源

- ✅ 源码/README 直证（deepwiki cite README.md / Avernet Overview / BCS wiki / AgentClaw / BCSFuse / OpenClaw / Gateway / singlebox / bcs-cli / friend / collaboration / config）：四大瓶颈、Apache-2.0、蚂蚁 12 BG 90%、BCS 全部 crate 职责、dumb router 路由规则（broadcast/@mention/@ALL）、协作状态机节点 kind（BotTask/HumanInput）+ 转换命令 + YAML 模板结构 + StateMachineRunView、持久化分工（bot.json/friendships/repo/store）、HumanInput/Proposal/Judge/token URL、BCSFuse 四模式（G1/G2/G5/G9）+ 触发方式、OpenClaw 引擎（claude_code/openclaw）+ session 管理、AgentClaw OpenAPI v1 全端点组（bots/resources/skills/routines/identity/engine runtime/MCP）+ service bot publish + skills pool + tenant isolation、BaaS（secbaas-community/ClawBotService/PaaS provider）、Gateway（config-driven forwarding/OAuth/Auth 策略链）、WS Bot Protocol（BCN）、openclaw-channel-bcn 插件工具、BCS HTTP 全端点、plugin 系统（db/cache/llm/auth/storage/security/channel）、配置项全量、singlebox START_ORDER、5-Bot Team 角色、bcs-cli 全量命令、bot 上下文四段、session vs group、1:1 vs 群 chat、bcs_assign_task、异构 runtime、SQLite/MySQL/OceanBase。
- 🟡 二手（deepwiki 综合未直接 cite 或推断）：8-Bot Micro-Merchant 具体角色/场景、workbench 具体页面/截图（由 bcs-cli 端点映射推断 UI）、5-Bot demo 逐帧流程（基于路由规则 + 角色职责推断）、高层概念态（Discussion/ProposalGeneration/LeaderElection/Execution）与代码节点 kind 的映射、换 bot 实例语义部分、G3/G4/G6/G7/G8 fusion 模式（代码未 enumerate）、PRD 映射对照。
- ⚠️ 推断：删 bot 不回滚历史、org memory 当前完全空白程度（实际有 MEMORY 字段 + 协作史部分覆盖）、OPC 单人场景密度判断、Avernet 底座非终端产品定位判断、「Cannot retain」只兑现一半的判断。

### 来源工具与轮次
- deepwiki `read_wiki_structure`（15 章节目录，1 次）。
- deepwiki `ask_question` × 8，按 crate 维度逐个深挖：
  1. BCS 各 crate 用户面功能（bcs-bot/group/session/routing）。
  2. bcs-collaboration-runtime 状态机节点/命令/YAML/RunView/模板示例。
  3. friend/relation 系统 + bcs-proposal + bcs-judge 全细节。
  4. AgentClaw 后端用户面功能（bot/skill/publish/tenant）。
  5. BCSFuse 全融合模式 + 触发 + 集成。
  6. BaaS + Gateway + OpenClaw engine session/skills/plugin。
  7. frontend workbench + singlebox + 5-Bot/8-Bot profile + bcs-cli 全命令。
  8. BCS plugin 系统 + WS Bot Protocol + OpenClaw 插件 + DB migration & 配置。
  9. bcs-cli session 子命令 + bot 上下文四段 + 1:1 vs 群 chat。
  10. AgentClaw OpenAPI v1 全端点 + BCS HTTP 全端点 + service flow + BotTask 执行 + 5-Bot demo。
- tvly search × 1（inclusionAI/Avernet Ant Group 背景）。
- 已有调研：`./multi-agent-orchestration.md` §3.4（起点，已从 PM 视角重写不搬运）。
- PRD 对照：`../design/multi-agent-prd.md`。