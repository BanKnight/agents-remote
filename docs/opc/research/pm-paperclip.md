# Paperclip 产品调研（PM 视角）

> 调研对象：`paperclipai/paperclip`（开源，MIT）。主信息源 deepwiki，辅以 tvly 公开报道。
> 证据分级：✅ 源码/README/官网 ｜ 🟡 二手（媒体/社区） ｜ ⚠️ PM 推断。
> 承接：`./multi-agent-orchestration.md` §3.1（PM 视角重写，不搬运）。

## 1. 一句话定位

Paperclip 是一个**自托管的开源 AI agent 编排平台**，把一群 AI agent 包装成一家"公司"——用 org chart、角色、预算、审批、心跳调度和任务系统，让你像董事会（Board）一样管 agent 团队，而不是一个个手操终端。✅

## 2. A. 根本使用场景

Paperclip 造的不是一个聊天框，而是一个**"AI 公司操作台"**。它的核心场景是：**你（一个人）想用多个 AI agent 协同完成一件需要团队的事，但不想全程盯每个 agent 的每一步**。

典型用户旅程（一期，对照 swanbase/devopscareers 公开 walkthrough）✅🟡：

1. **一条命令起一家公司**：终端跑 `npx paperclipai onboard --yes`，本地拉起 Node server + 内嵌 PostgreSQL + React 仪表盘（无 Docker/K8s 依赖）。Wizard 引导你定义公司目标、配第一个 team-lead agent、选 adapter（claude_local / codex_local 等）。✅
2. **设目标、招团队**：你在仪表盘写下公司目标（"做一个 SaaS"）。CEO agent 据此拆计划、提招聘请求。你（Board）审批招人——新增 agent（CTO / 后端工程师 / QA / 文案），每个 agent 带 role / capabilities / 上级 / 预算。✅
3. **派活、自动调度**：CEO 把目标拆成 issue，按 org chart 往下派给 CTO，CTO 再拆给工程师。每个派活 = 建一个子 issue，挂 `parentId`。你不需要手动 spawn agent——**Heartbeat 调度**到点（或被任务/评论/审批唤醒）自动 spawn CLI、跑一轮、退场。✅
4. **盯全局、随时插手**：你在 Dashboard 看指标卡（agent 状态、任务计数、成本、待审批）；Inbox 收审批/告警/陈旧任务。任何层级你都能介入——暂停 agent、改派任务、调优先级、改描述、raise 预算。✅
5. **审批闭环**：agent 把 issue 推到 `in_review`，executionPolicy 拦住 `done` 转换，派回给 reviewer/approver。你在 Inbox 一键 Approve/Reject，带强制评论。agent 不能自己标 done——你是最终拍板人。✅
6. **看钱花在哪**：Costs 页按 agent/project/provider/model 拆 token 和钱，预算撞硬顶自动暂停 agent 并通知你。✅

**主场景一句话**：用户开 Paperclip 不是来"和 agent 聊天"，是来"经营一家由 agent 组成的公司"——设方向、招人、派活、审批、盯钱，agent 在心跳窗口里自主执行，你只在决策点介入。⚠️

> ⚠️ **"zero-human company" 是营销话术，社区实战戳穿需人类深度介入（`pm-paperclip-community.md` 走查戳穿）**——以下四源独立互证：(a) Reddit r/AI_Agents（2026-08）5-agent Zero-Human Company 实战报告「I built a 5-agent Zero-Human Company. The architecture works... **empty instructions and rate limits nearly killed it**」（空指令 + 速率限制差点搞死整个公司）；(b) Reddit r/aisolobusinesses「Is Paperclip AI actually useful or just another overhyped automation tool」+ snippet「out of the box it does feel like '**just a UI on top of agents.**' The real value kicked in for me when I tried configuring...」（装起来 ≠ 用起来，配置阶段才是真门槛）；(c) Reddit r/LocalLLaMA「paperclip critique... **advertisement very hype sounding**」；(d) flowtivity.ai（2026-03-05，澳大利亚 AI 自动化商家独立长文）报真实事故「When an AI agent makes an error and feeds it to another agent, the mistake propagates. We learned this when a batch outreach went to **23 leads instead of 3**」+ ROI 警告「**Businesses expecting instant results will be disappointed**」（回报在第二第三个月才出现）。**「一条命令起一家公司」≠「一条命令跑起来业务」**——OPC 宣传要避免同坑，定位为「人机协作编排层」而非「零人公司」。

## 3. B. 解决的痛点

1. **多 agent 混乱**：开第二个、第三个 agent 后就开始重复工作、互相覆写、看不见对方在干啥。Paperclip 用 org chart + 统一任务系统给每个 agent 明确位置和职责，把"一堆终端 tab"变成"一个组织"。🟡
2. **上下文每次从头讲**：agent 不知道公司目标、不知道自己上级是谁、不知道任务从哪来。Paperclip 给每个任务带 **goal ancestry**（祖先链，最多 6 条入 prompt），agent 一醒来就知道"我是谁、为什么干这个、上级要什么"。✅
3. **成本失控**：多 agent 同时跑很容易烧钱没人知道。Paperclip 按 agent/project/company 三级预算 + 硬顶自动暂停 + Costs 页拆账，撞顶发 incident 通知 Board。✅
4. **agent 不该自己拍板**：让 agent 自主把任务标 done 风险大。Paperclip 用 `executionPolicy`（review/approval 阶段）+ 强制决策评论，把"done"权留在 Board 手里。✅
5. **agent 静默绕过问题**：agent 遇到 blocker 自己瞎绕，最后产出一堆错的。Paperclip 信条"surface problems, don't silently fix"——agent 停下、把问题顶到 Inbox/告警，由 Board 决定怎么救。✅
6. **agent 常驻烧资源**：N 个 agent 常驻 CLI 等命又贵又脆弱。Paperclip 用 **Heartbeat 短窗口**——只在 schedule/task/comment/approval 唤醒时 spawn CLI、跑完即退，状态（sessionId/usage）落库下次续接。✅

   > ⚠️ **Heartbeat 短窗口「省成本」承诺未兑现（`pm-paperclip-community.md` 走查戳穿）**：设计意图是省资源，但实战 goal ancestry + heartbeat-context + wake payload 累积反而把 context 吹爆——HN `Glemllksdf` 报 context 吹到 20-30k + GitHub #11253 报 claude_local 81% token 烧在 thinking_tokens。**短窗口本身省的是「进程常驻」成本，省不了「context 注入累积」成本**——后者才是大头。OPC 抄 Heartbeat 短窗口范式时，token 预算硬监控是配套必选项，不是可选。
7. **看不见在发生什么**：多 agent 黑盒跑，出问题查不到。Paperclip 给每步留 audit log + run transcript + WebSocket 实时事件流，全可追溯。✅

## 4. C. Feature list

> 分维度列，每条一行（功能名 + 一句话）。证据默认 ✅（deepwiki 源码层），推断标 ⚠️。

### 用户入口 / Setup
- `npx paperclipai onboard` 一条命令拉起本地 server + 内嵌 PG + UI，`--yes` 走 trusted local loopback 快速start，`--bind lan|tailnet` 走认证模式。✅
- Onboarding Wizard UI：引导建公司、写目标、配第一个 team-lead agent（adapter + model）。✅
- 公司切换器：一个部署跑多家公司，dropdown 切换 + `+ Create company` + 搜索，完全数据隔离。✅
- Worktree-Local Instances：本地 worktree 级别的实例隔离（多任务装配不串）。✅

### Agent 管理（UI）
- Agent 列表：avatar/role/status/cost/last heartbeat 一览，`+ New agent` 创建。✅
- Agent 详情：overview / heartbeats / 分配的 issues / 成本拆解。✅
- Agent 快捷动作：Pause / Resume / Invoke Heartbeat（手动唤醒）。✅
- Agent 属性编辑：Status / Role / Title / Reports To / Adapter Type / Context Mode / Budget。✅
- Agent 挂起/恢复/终止：pause/resume/terminate 三态生命周期。✅
- Agent 自建 API key：长生命周期 key 供 agent 调外部服务。✅
- Instructions-path：指向 `AGENTS.md` 等 markdown 文件挂角色指令，onboarding 时给 CEO 种入公司上下文 + 招聘格式规则。✅

### Task / Issue 管理（UI + API）
- Issue 列表：tab 切 `All Issues / Active / Backlog`，filter bar 加字段过滤，display dropdown 切分组（status/priority/assignee/project/none）和布局（list/board）。✅
- Issue 看板视图：拖卡片改状态，列内 `+` 建新 issue。✅
- Issue 详情：标题/描述/属性 inline 编辑。✅
- Issue 状态机：`backlog / todo / in_progress / in_review / blocked / done / cancelled` 七态。✅
- Issue checkout/release：agent 原子认领（409 = 被占）、释放所有权。✅
- Issue 批量操作：checkbox 多选 + 批量改 status/priority/assignee/project/delete。✅
- Issue 右键 context menu：实体动作。✅
- Issue 搜索：`?q=term` 全文搜。✅
- Issue 文档：agent list/get/put issue 文档（如 plan），key-value 挂在 issue 上。✅
- 子任务委派：`POST /issues` 带 `parentId` 建子任务，自动挂祖先链。✅
- Issue-thread interactions（结构化决策卡）：`suggest_tasks`（提议子任务让 Board 接/拒）/ `ask_user_questions`（结构化问答）/ `request_confirmation`（yes/no 绑定 plan 修订）/ `request_checkbox_confirmation`（最多 200 项选子集确认）/ `request_item_verdicts`（逐项 approve/reject/defer）。Board 或合格 agent 可 accept/reject/respond/verdict。✅
- Comment 协调：`[@Display Name](agent://<id>)` mention 自动触发该 agent wakeup。✅
- Status 更新：`PATCH /issues/:id` 改状态/优先级/assignee。✅

### 审批 / 治理（UI + API）
- Inbox：Board 的动作中心，聚合待审批/告警/陈旧任务，按类分组，inline Approve/Reject + See all。✅
- Approvals 列表页 `/approvals`：按 Pending/Approved/Rejected/All 过滤，看 type/title/requester/time。✅
- Approval 详情：payload 按 type 渲染（如 `hire_agent` 显示提议的 agent），pending 态填决策 note + Approve/Reject。✅
- 实体页 inline 审批：banner 标注"此实体经审批创建"，pending agent 直接在详情页批。✅
- `request_board_approval` API：agent 对预算超限 / CEO 战略门等发起 Board 审批。✅
- executionPolicy：issue 上可选结构化对象，ordered stages（`review` / `approval`），done 转换被拦截 → 进 `in_review` → 派给 stage 参与者 → 记 `returnAssignee` 可退回。✅
- 强制决策：reviewer/approver 必须给 `approved`/`changes_requested` + 强制评论，落 `issue_execution_decisions` 表。✅
- Agent 招聘审批：manager/CEO agent `POST /agent-hires` 提招聘请求，Board 审批。✅
- MCP "Ask First" 工具治理：高危 MCP 工具配成 ask-first，agent 调用时发审批卡返回 `approval_required`，批了执行一次签名调用，拒了 agent 按 decline 原因走，60 分钟过期。✅
- Sandbox callback allowlist：限制被攻陷 CLI 能调的 API 路由面。✅

### 心跳 / 调度（机制类，用户可感知）
- Heartbeat 短窗口：agent 不常驻，spawn → 跑一轮 → 退出，状态落库。✅
- 四种唤醒原因：`timer`（cron，如每 5 分钟/4 小时/24 小时）/ `assignment`（派活）/ `on_demand`（手动按钮或 API）/ `automation`（系统自动化）。✅
- 任务/评论/审批细分唤醒：`PAPERCLIP_TASK_ID` 定向任务、`issue_commented`/`issue_comment_mentioned` + `PAPERCLIP_WAKE_COMMENT_ID`、`PAPERCLIP_APPROVAL_ID` 先处理审批。✅
- Fat vs Thin payload：新 session / assignment / recovery 给 full task brief（fat）；resume / 评论驱动只给增量（thin，`PAPERCLIP_WAKE_PAYLOAD_JSON` 塞紧凑摘要 + 新评论）。✅
- Wakeup coalescing：agent 已在跑时新唤醒合并去重，不重复 run。✅
- Wakeup Coordinator + `agent_wakeup_requests` 表：队列 + 审计。✅
- Heartbeat procedure 7 步：identity → approval follow-up → get assignments → pick work → checkout → understand context → do work → update。✅
- Heartbeat context：`GET /issues/:id/heartbeat-context` 取紧凑 issue 状态 + 祖先摘要 + 评论游标。✅

### 记忆 / 上下文
- Goal ancestry 入 prompt：`buildPaperclipTaskMarkdown` 取祖先切片最多 6 条，超限标截断，含 parent/ancestor 的 label/title/status/priority。✅
- Session 续接：`agent_task_sessions` 表按 `(company_id, agent_id, adapter_type, task_key)` 存 `session_params_json` + `session_display_id`，下次心跳复用（claude_local 用 sessionId，codex_local 用 `previous_response_id` chaining）。✅
- `agent_runtime_state` 表：聚合 runtime 计数 + `total_cost_cents`。✅
- Agent instructions（AGENTS.md）：角色操作指南文件注入。✅
- Skills 注入：`SKILL.md` 定义注入 agent 环境，`/api/skills/paperclip` 可取。✅

### 执行 / Adapter
- Adapter 接口三方法：`invoke` / `status` / `cancel`。✅
- AdapterExecutionContext / Result：传 runId/agent/runtime/sessionId/sessionParams/config + onLog/onMeta/onSpawn 回调；回 exitCode/signal/timedOut/errorMessage/usage/新 sessionParams。✅
- 内置 local CLI adapter：`claude_local`（支持 session 持久化 + skills 注入 + 结构化输出解析）、`codex_local`（`previous_response_id` chaining + skills 注入）。✅
- Process / HTTP adapter：进程级和 HTTP 级执行面（远程执行）。✅
- OpenClaw Gateway adapter + onboarding：接 OpenClaw agent 生态。✅
- `runAdapterExecutionTargetProcess`：local `spawn(command, args, {shell:false, stdio:"pipe"})` 或 remote。✅
- AdapterManager 页：管理 agent 运行时。✅
- 自定义 adapter：插件可注册 `environmentDrivers`，提供 SDK + TestHarness。✅
- Environments System：execution workspaces（浏览器/手动 QA / preview server），runtime services start/stop/restart。✅
- Granted secrets：agent `GET /agents/me/secrets` 列可用 secret，`POST /agents/me/secrets/:name/value` 取值。✅

### 预算 / 成本（UI + 机制）
- Costs 页：period 内 Inference spend + 预算进度条 + Finance net（debits/credits）。✅
- By agent 拆账：spend / input tokens / output tokens，展开按 provider/model/billing type 拆。✅
- By project 拆账：run 成本归项目。✅
- ProviderQuotaCard：当前消费 vs 配额/限额可视化。✅
- Budget 三级：company / agent / project 级 budget policy，`BudgetPolicyCard` 编辑。✅
- 软告警（80% warn）+ 硬顶（撞顶自动暂停 agent + 建 incident + 通知 Board）。✅
- Budget override：raise 预算 / 显式 resume 暂停的 agent，incident 上 `Keep paused` / `Raise and resume`。✅
- Budget-stopped agent 不收新 wakeup。✅

### 观察 / 监控
- Dashboard：metric 卡（Agents total/active/running/paused/error、Tasks open/in_progress/blocked/done、Costs MTD + 预算利用、Approvals pending），点卡跳详情页，recent activity + stale tasks。✅
- Run Transcript：`RunTranscriptView` + `LogViewer` 显示 HeartbeatRun transcript，WorkspaceOperations + RunInvocation，nice/raw 双模式，live 指示 + Jump to live。✅
- 实时事件：WebSocket `GET /companies/:id/events/ws`，事件 `agent.status.changed` / `heartbeat.run.queued|started|status|log|finished` / `issue.updated` / `issue.comment.created` / `activity.appended`；断线降级短轮询。✅
- Activity log + 不可变审计日志 + 全 tool-call tracing。✅
- Stale task 上报：`in_progress` 无近期活动的任务顶到 Dashboard/Inbox。✅

### 定时 / Routines
- Routines API：agent 建自管 routine，trigger = `schedule`(cron) / `webhook` / `api`(manual)。✅
- concurrencyPolicy + catchUpPolicy：控并发与补偿行为。✅
- endpoints：`GET/POST /routines`、`GET /routines/:id/runs`、`POST /routines/:id/run`、`POST /routines/:id/triggers`、`PATCH/DELETE /routine-triggers/:id`。✅

### Projects / Goals
- Project 列表：icon/name/status/lead agent/target date，`+ New project`。✅
- Project 详情：overview/updates/issues/settings，编辑 icon/name/desc（markdown），inline properties/resources/milestones。✅
- Project 过滤 issue：只看该 project 的 issue。✅
- Project 属性：Status/Priority/Lead/Members/Dates/Teams/Labels/Goal link。✅
- Goals API：goal hierarchy（`goals` 表有 `parentId`）。✅

### 集成 / 插件
- Plugin 系统：out-of-process 扩展，`@paperclipai/plugin-sdk` + `TestHarness`，ctx 暴露 state/events/db/secrets/projects/access/authorization。✅
- Plugin UI slots：page / detail tab / dashboard widget / sidebar panel；Launchers = host 渲染的按钮/菜单项。✅
- Workspace Diff 插件：可视化 agent workspace 文件变更（staged/unstaged/untracked）。✅
- LLM Wiki 插件：wiki 类扩展（结构未详）。⚠️
- Skills Catalog / Company Skills / SkillStudio：从本地文件夹或 GitHub repo 导入 skill，管理 skill-agent 关联。✅
- Teams Catalog：导入团队模板，显示 subtree 结构，挂到 org 特定位置。✅
- Companies 模板库（`paperclipai/companies` 仓）：16 个预建公司 / 440+ agent / 500+ skill，`npx companies.sh add ...` 一键导入。✅

### 公司 / 数据可移植
- Company Export/Import：整组织导出（agents/skills/projects/routines/issues），secret scrub + collision handling。✅
- Company Portability：`buildOrgTreeFromManifest` 从 manifest 重建 org chart。✅
- Database Backups：instance 级 DB 备份路由。✅

### 认证 / 访问
- Invites + Access Control：成员邀请 + 成员权限管理。✅
- Authorization grants/policies：`principalPermissionGrants`，`scopeAllows` 检查 project scope / target-agent allowlist / managed-subtree scope（`isAgentInSubtree`）。✅
- Manager Chain delegation：agent 的 manager 可读/wake 该 agent。✅
- Org chain health：`getAgentOrgChainHealth` 检测 terminated 祖先 / 环 / 不健康链 → 不可 assign/invoke。✅
- Deployment modes/exposure：trusted local loopback / lan / tailnet 等部署模式 + 暴露面控制。✅

### 部署 / 运维
- Docker / untrusted PR review 部署。✅
- AWS ECS / 云部署。✅
- Versioning / Release 自动化 + publish + rollback。✅
- Agent behavior evals（promptfoo）。✅

## 5. 核心概念

- **Company**：顶层隔离单位，一个部署跑多家公司，所有实体 company-scoped。✅
- **Agent**：org chart 节点，带 role / capabilities / reports_to / adapter / budget / context mode。✅
- **Org chart**：`reports_to` 指针形成的树，CEO = `reports_to=null`，查环 + 同公司约束 + subtree 授权。✅
- **Issue**：原子工作单元，七态状态机，`parentId` 挂祖先链，assignee / executionPolicy / interactions 挂载。✅
- **Goal**：业务目标，`parentId` 形成层级，issue 可 link 到 goal。✅
- **Heartbeat**：短执行窗口，四种唤醒原因 + fat/thin payload + 状态落库续接。✅
- **Board**（你）：设目标 / 审批 / 观察干预 / 预算拍板。✅
- **Adapter**：控制面 ↔ 执行面桥，`invoke`/`status`/`cancel`，local CLI spawn / HTTP / OpenClaw。✅
- **Budget**：company/agent/project 三级 + 软告警 + 硬顶 + override。✅
- **executionPolicy**：issue 上的 review/approval 阶段链，拦 done 转换。✅
- **Skill**：注入 agent 的能力包（`SKILL.md` + REST），catalog 管理。✅
- **Routine**：定时任务，cron/webhook/api 触发。✅
- **Plugin**：out-of-process 扩展，UI slot + launcher + ctx。✅

## 6. 状态哲学（重点）

**状态焊在任务系统（issue）和 org chart 上，不焊在 agent 进程上。** 这是 Paperclip 最关键的设计决策，一切后续行为都从这里推导。✅

具体拆解：

- **状态不在 agent 进程**：agent 是无状态短窗口进程，spawn → 跑 → 退。所有可恢复的状态（session params、usage、task checkout、issue 状态、评论、决策）都在控制面的 PostgreSQL 里。换 agent 进程、重启 server、agent 崩溃——状态不丢。✅
- **状态焊在 issue 上**：任务的进度、分配、祖先、审批决策、interaction、评论、文档全部挂在 issue 实体。换 agent 干同一个任务 = 接管同一个 issue，历史完整可追。✅
- **身份焊在 org chart 上**：agent 的 role / capabilities / reports_to / 预算是身份属性，不是运行态。换成员 = 换一个 agent 节点接同一份 issue；换组织 = 改 `reports_to` 指针重新成树。✅
- **上下文是派生品**：agent 醒来时的 prompt 不是存的，是从 issue 祖先链 + heartbeat-context + wake payload **现拼**的（`buildPaperclipTaskMarkdown` 取祖先 6 条 + `heartbeat-context` 紧凑快照）。所以上下文永远跟当前组织/任务状态一致，不会过期。✅

**换成员**（换 agent 干同一活）：issue 不动，assignee 改指，新 agent 下次心跳接 `in_progress` issue + 完整祖先上下文，无缝接管。✅
**换任务**（同一 agent 切活）：agent 在多个 issue 间按优先级 pick work，checkout 原子认领，每个 issue 独立状态。agent 本身是"执行者池"，任务才是工作单位。✅
**换组织**（重组、merge、拆分）：改 `reports_to` 指针，subtree 授权跟着重新计算（`isAgentInSubtree`），cycle 检查拦截非法重组。org chart 是可编辑的状态，不是硬编码。✅

**一句话**：Paperclip 把"公司"建模成 PostgreSQL 里的 issue 树 + agent 树 + 预算 + 审批记录，agent 进程只是这套状态的临时投影器——状态是常驻的，执行是短暂的。✅

## 7. 派活与编排交互

**Board 下达工作**：你在仪表盘建顶层 goal / 写公司目标，CEO agent 据此建 plan issue、拆子 issue、按 org chart 往下派。你也可以直接建 issue 指定 assignee，或手动 Invoke Heartbeat 催某个 agent。✅

**agent 间 delegation**：manager agent 把自己的 issue 拆成子 issue（`POST /issues` 带 `parentId` + `assignee_agent_id`），子 issue 自动挂在祖先链上，子任务 assignee 被唤醒（assignment reason）开干。委派 = 建子任务，不是发消息。✅

**coordination = 评论**：agent 在 issue 上 `POST /comments`，`[@Name](agent://<id>)` mention 自动唤醒被提及的 agent（`issue_comment_mentioned`）。没有独立的 chat 系统——一切协调都在 issue 评论里。✅

**status = 字段更新**：agent `PATCH /issues/:id` 改状态/优先级，done 转换被 executionPolicy 拦截进 in_review。✅

**任务怎么串**：issue 的 `parentId` 形成树，`buildPaperclipTaskMarkdown` 取祖先 6 条入 prompt，agent 永远知道"我这活在整条目标链里的位置"。`findOpenAncestorCreatedByAgent` 递归 SQL 走 parent 链找 agent 自己开的祖先 issue。✅

**结构化决策**：不想纯靠评论？用 issue-thread interactions——`suggest_tasks` 让 Board 接/拒子任务、`request_confirmation` yes/no、`request_item_verdicts` 逐项裁决。把软约定变成有类型、可审计的决策卡。✅

## 8. 记忆与上下文

**goal ancestry 传上下文**：每个 issue 带 `parentId`，agent 醒来 `buildPaperclipTaskMarkdown` 取祖先链切片最多 6 条入 prompt（label/title/status/priority），超限标截断。agent 一上来就知道整条目标血统——"我是 CEO 为做 SaaS 拆的、CTO 为做后端拆的、派给我这个工程师的"。✅

> ⚠️ **「≤6」上限实战仍致 context 爆炸（`pm-paperclip-community.md` 走查打折扣）**：6 条祖先链 + heartbeat-context + wake payload 累积起来实测把 context 吹爆——HN `Glemllksdf`（2026-04-16）「tried paperclip ai... paperclip ai and opencode is blowing up the context to 20-30k」+ GitHub #11253（2026-08-10）「claude_local logs 81% thinking_tokens telemetry」（claude_local adapter 81% token 烧在 thinking_tokens，与 HN 互证）。**OPC 抄 ≤6 现拼策略不能机械照搬**，必须配套：① prompt 拼装时实时测 token，超限动态降级（如 ≤3 或按 token 余量自适应）；② token 预算监控下沉到 context 注入层（不是只靠 run 级硬顶——见 §C 预算节）。

**跨任务记忆**：靠 `agent_task_sessions` 表按 `(company_id, agent_id, adapter_type, task_key)` 存 session params，下次心跳同 task 复用 sessionId resume（claude_local 用 Claude CLI session，codex_local 用 `previous_response_id`）。`agent_runtime_state` 存聚合 runtime 计数 + 累计成本。**跨任务的语义记忆（如"上次调研结论"）靠 issue 文档（`/issues/:id/documents`）+ 评论 + workspace diff 持久化，不是独立向量库**。✅

**Heartbeat 短窗口裁剪**：fat/thin payload 二分。新 session / assignment / recovery 给 fat（full task brief + 完整历史），resume / 评论驱动给 thin（`PAPERCLIP_WAKE_PAYLOAD_JSON` 紧凑摘要 + 新评论 delta）。agent 按 heartbeat procedure 先取 `inbox-lite` 紧凑 inbox，再 `heartbeat-context` 取该 issue 紧凑快照，**只在需要时才取完整 thread**——默认增量，按需全量。✅

**未做**：无显式向量检索 / archival memory / 跨会话语义召回。长记忆靠 issue 树 + 文档 + 评论 + session resume 的组合涌现，不是独立记忆子系统。✅（与 agents-remote §13 L4 向量检索"后置"判断一致）

## 9. 审批与介入

**Board 在哪介入**：
- Inbox 是主入口——待审批/告警/陈旧任务聚合，inline Approve/Reject。✅
- Dashboard 看待审批计数，点卡跳 `/approvals`。✅
- 实体页 inline banner——pending agent / 经审批创建的实体直接在详情页批。✅
- 任意层级任意时刻——pause/resume/reassign/改优先级/改描述/raise 预算，Board 权限不受限。✅

**审批什么**：
- CEO 战略计划 / agent 招聘 / 预算超限 / MCP "ask first" 工具调用 / executionPolicy 的 review+approval 阶段。✅
- 强制决策：reviewer/approver 必须给 `approved`/`changes_requested` + 强制评论，落 `issue_execution_decisions`。✅

**"surface problems, don't silently fix" 怎么运作**：agent 遇 blocker 不自己绕——stale task（`in_progress` 无近期活动）顶到 Dashboard/Inbox；blocked 且需人工判断时 escalate 给 Board，agent 停下等指示；MCP ask-first 工具调高危动作返回 `approval_required` 等审批，不擅跑；预算撞硬顶自动暂停 + incident 通知，不静默继续。**核心是"停下来问"而不是"绕过去"**——把决策权显式交回 Board，宁可卡住也不瞎做。✅

## 10. 执行与持久

**adapter spawn CLI 跑哪**：控制面（Paperclip server，Node + PG + React UI）调度，执行面（adapter）spawn CLI 子进程。`claude_local` / `codex_local` 在**宿主机本地**跑已安装认证好的 CLI；`process` / `http` adapter 支持远程执行面。`runAdapterExecutionTargetProcess` 用 `spawn(command, args, {shell:false, stdio:"pipe"})`，`onLog` 回流传 stdout/stderr，解析出 session state + usage + summary。✅

**不常驻怎么实现**：`heartbeatService` 编排——唤醒触发建 `heartbeat_run`（queued）→ Run Executor 认领标 running → spawn 子进程 → 跑完/超时/取消 → 更新状态 → 进程退出 → runtime state（sessionId/usage）落 `agent_runtime_state` + `agent_task_sessions` → 下次心跳 resume。Wakeup Coordinator + `agent_wakeup_requests` 表去重排队 + 审计。已运行时新唤醒 coalesce。✅

**状态持久形态**：PostgreSQL 是唯一权威源——agents / issues / goals / comments / decisions / approvals / routines / agent_runtime_state / agent_task_sessions / issue_execution_decisions / agent_wakeup_requests 全在 PG。session resume 的 sessionParams 落 `agent_task_sessions.session_params_json`（adapter 自定义 shape）。审计日志不可变。✅

**控制面 vs 执行面分离**：server 只编排不跑 agent，adapter 跑 agent 并报回。adapter 自包含包，三方法接口（invoke/status/cancel）+ Context/Result + onLog/onMeta/onSpawn 回调。换 runtime = 换 adapter，控制面不动。✅（与 agents-remote `RuntimeResources` / `ProviderProfile` 接缝同构）

## 11. 商业模式与定位

- **开源 MIT，自托管，无 Paperclip 账号**。✅
- 一条命令 `npx paperclipai` 起本地全栈（server + 内嵌 PG + UI），无 Docker/K8s 强依赖。✅
- **面向谁**：个人开发者 / 小团队 / "零人公司"构想者——想用 agent 跑业务但不想手操每个 agent。🟡
- **增长**：2026-03-02 launch，3 周 30k stars，4 月初 53k，**8 月 77.6k**（GitHub API 直证 77,593，`pm-paperclip-community.md` 走查更新；pm-paperclip.md 原 76.6k 略偏低，方向对）。GitHub 最快增长 agent 项目之一。🟡
- 作者 `@dotta`（pseudonymous）。✅
- **变现未明**：仓库 README 指向 paperclip.ing + Discord，未见付费计划 / hosted 版（8 月仍自托管为主）。🟡 可能后续推 hosted（参照同类），目前纯 OSS 增长导向。⚠️
- **生态**：`paperclipai/companies` 模板仓（16 公司 / 440 agent / 500 skill）做社区分发 + lock-in。✅
- **对照定位**："If OpenClaw is an employee, Paperclip is the company itself"——卖组织结构而非单个 agent。🟡

## 12. 对 OPC 多 agent 编排的启示

对照 agents-remote PRD（角色 / 任务 / 房间 / 看板 / 记忆 / agentmore）与已对齐决策（高管团圆桌非树状，层级只在高管→执行那一层）。

### 印证（agents-remote 方向正确）
1. **任务系统作统一通信媒介**：delegation=建任务、coordination=评论、status=字段更新——Paperclip 证明了"不另建 chat 系统，一切挂 issue"能撑起完整多 agent 协作。agents-remote PRD 的"任务"实体 + 看板追踪方向被强印证。✅
2. **agent 不能自标 done + Board 审批**：executionPolicy + 强制决策评论 = PRD 决策点 2（agent 只能说"做完了请过目"）。Paperclip 把这做成结构化 stage 链而非简单开关——agents-remote 可借鉴 review/approval 双阶段 + `returnAssignee` 退回机制。✅
3. **状态焊在任务/组织不在进程**：与 agents-remote `SessionRegistry` 只持 metadata、relay 双缓冲、`--resume` 续接同源。Paperclip 把这个原则推到极致（全 PostgreSQL，agent 纯无状态短窗口），印证"编排层状态用 SQLite/DO 不用进程内存"的 CF 留口子铁律。✅
4. **goal ancestry 入 prompt（≤6 条）**：与 PRD"任务带目标血统"一致。Paperclip 给了具体实现——`parentId` 指针 + 现拼（非 denormalized path）+ 切片上限 + 截断标注。agents-remote 直接抄这个上限与现拼策略。✅
5. **MCP ask-first 治理 + 60 分钟过期 + sandbox allowlist**：与 agents-remote `permissionMode=plan` + `can_use_tool` 审批卡同源，但 Paperclip 多了"签名调用一次""过期""allowlist 限被攻陷 CLI 调用面"三个细节，值得吸收。✅
6. **公司模板库做分发**：`paperclipai/companies` 验证"预建角色组织模板"是社区增长抓手。agents-remote 的"角色"未来可走向可分享模板。✅

### 挑战 / 盲点（Paperclip 没解决好的，agents-remote 要警惕）
1. **Heartbeat 短窗口 ≠ 圆桌**：Paperclip 的 agent 是"单 agent 单 issue 单窗口"——一个 agent 醒来认领一个 issue 跑完退场。**这恰好是 PRD 第一期（角色+任务下发）的形态**，但**撑不起第二期圆桌**（多角色同台讨论、串行 turn、共享白板）。Paperclip 没有圆桌概念，issue 评论是异步接力不是实时同台。agents-remote 第二期必须自己造 Room（§13 三件套），不能从 Paperclip 抄。⚠️
2. **层级 vs 圆桌**：Paperclip 是**纯树状**（CEO→manager→reports），整条链都是 `reports_to`。但用户已明确**高管团内部是圆桌非树状，层级只在高管→执行那一层**。直接照搬 Paperclip org chart 会把圆桌误建模成 CTO→CPO 的伪层级。agents-remote 必须区分"圆桌层"（平等 participant）和"执行层"（manager→reports 树），不能一张树状图盖全。⚠️（这是 Paperclip 模型对 OPC 的最大不匹配）
3. **无长记忆子系统**：Paperclip 靠 issue 树 + session resume + 文档涌现长记忆，无向量检索 / archival / 语义召回。短会话够用，但 PRD"后续长记忆"和 §13 L4 向量检索 Paperclip 给不了参考。agents-remote 长记忆得另找参考（Letta / Mem0 / cf-os Vectorize）。✅
4. **常驻 CLI 缺口**：Paperclip 假设 agent 可无状态 spawn/退，靠 sessionParams resume。但 agents-remote 现状是 **claude 常驻 CLI 进程**（`--resume` + relay 双缓冲），与 Paperclip 短窗口模型不同。编排层不能强假设 agent 无状态——要兼容常驻 + 短窗口两种执行面。⚠️（PRD 已对齐"runtime 零改动"，这点要守住）
5. **同公司约束过严**：Paperclip 强制 agent 与 manager 同 company、subtree 授权。OPC 个人私有部署场景下"多公司隔离"是过度设计——agents-remote 单 project scope 已够，不需要 company 层。✅（印证 PRD"任务记录先存本地文件"轻量化方向）
6. **并发竞态是社区长期高频痛点（严重低估）** ⚠️（`pm-paperclip-community.md` 走查纠正）——pm-paperclip.md 原只引 #11180/#11147/#11148 三个孤立 issue，**GitHub issue search `race OR concurrency OR deadlock` 实际命中 1266 个**，这是结构性难题而非偶发。最近典型真实 bug（全部 2026-08 外部用户报）：**#11147** `arthurfromtahiti`「A cancelled heartbeat run loses the wake-up for the next stage: the issue stalls in a valid state, silently」（cancelled run 丢下一阶段唤醒，issue 静默停滞，「observed twice on our instance」真实复现）/ **#11148** `arthurfromtahiti`「Worktree branch validation makes multi-task assembly impossible: the assembling agent errors for doing its job」（worktree 校验使多任务 assembly 不可能，agent 因做本职工作报错）/ **#11180** `adammeghji`「acpx: server-owned run scratch paths invalidate resumable session fingerprints」（acpx session 在 heartbeat 间失效）/ **#11077** `bheman`「Three chained defects in the dev runner cause a silent, unrecoverable local outage」（三连锁缺陷致静默不可恢复本地宕机）。agents-remote 编排层**一上来就要把 checkout 原子性、唤醒去重、cancel 语义做扎实**，别重蹈——并发竞态是没有 AX 协议级硬约束的编排产品的必踩坑（呼应 Raft AX「多 agent 同台不能靠 agent 自觉协调，99% 失败」）。🟡

### 对 agents-remote 的核心 3 点
1. **抄"任务即通信媒介 + goal ancestry ≤6 现拼 + executionPolicy 双阶段审批"**——这是 Paperclip 最成熟、与 PRD 第一期最同构的部分，直接吸收。
2. **不抄"纯树状 org chart"**——OPC 高管团是圆桌，层级只在高管→执行。要建模"圆桌层 + 执行树"两层结构，Paperclip 单树模型会误导。
3. **补"圆桌 + 长记忆"**——Paperclip 没有圆桌（多角色同台串行 turn + 共享白板）和向量长记忆，这两块是 agents-remote 第二期/后续要自造的，从 Buzz / cloudflare-os / Letta 找参考。

### 12.5 社区成熟度信号（`pm-paperclip-community.md` 走查新增）

> **Paperclip 与 Avernet 社区真空完全相反——是「源码可读 + 社区能见度高 + 外部参与真实」的项目**。这意味着 Paperclip 社区踩的坑是 OPC 编排骨架的**真实前车之鉴**（不是营销自吹），应深挖其 GitHub issue 学习。

| 维度 | Paperclip（真实社区） | Avernet（社区真空，对照） |
|------|----------------------|--------------------------|
| stars / watchers | **77,593 / 380**（star:watcher ~204:1，watcher 绝对值远高于 Avernet 的 2 两个数量级） | 453 / 2（严重倒挂） |
| 外部 issue 作者 | **高度分散**（adammeghji/arthurfromtahiti/bheman/constant1n0/PraeSynBH/purpleCowOnWheels 等各 1-3 个，**非自产自销**） | 90%+ 内部维护者自产自销 |
| 外部 contributors | **长尾真实**（mvanhorn 30/stubbi 28/zvictor 28/scotttong 26/HenkDz 25/aronprins 24 commit） | 几乎纯内部 |
| 独立社区阵地 | **3 个独立 Reddit 子版**（r/PaperClip_AI / r/PaperclipAI / r/PaperclipUseCases）+ 3 篇独立博客长文（contabo/flowtivity/zeabur）+ HN 真实成本吐槽 | 零子版、零独立博客、英文技术圈零讨论 |
| 社区讨论质量 | 正负两极（正面：概念新/组织层抽象；负面：成本爆炸/黑箱/并发/adapter 四大坑——**全是真实上手者报**） | 无社区讨论可评价 |

**对 agents-remote 的启示**：
1. **Paperclip 社区踩的 4 大坑是 OPC 编排骨架的真实前车之鉴**——成本爆炸（context 注入层）/ orchestration 黑箱（透明度不足）/ 多 agent 并发竞态（1266 issue 结构性难题）/ adapter 集成脆弱（CJK 乱码 + codex MCP 永不达），都是 OPC 同类结构性问题的预演，应深挖其 GitHub issue 学习。
2. **社区反馈是可学的真实信号源**——与 Avernet「源码可读、社区不可读」不同，Paperclip 的社区反馈可作为编排设计验证依据，不是营销自吹。
3. **3 个独立 Reddit 子版 + 380 watcher 是真社区信号**——star 数可虚高（SEO/推广），但独立子版 + watcher 绝对值 + 外部 issue 分散度骗不了，是判断「真社区 vs 自产自销」的硬指标。OPC 自己的社区运营也要盯这三个真实信号，不只追 star。

## 13. 证据分级与来源

| 证据 | 分级 | 来源 |
|------|------|------|
| org chart `reports_to` 树建模 + cycle/同公司约束 + subtree 授权 | ✅ | deepwiki（agent-eligibility.ts / authorization.ts / company-portability.ts） |
| Heartbeat 四唤醒原因 + fat/thin payload + wakeup coalescing | ✅ | deepwiki（heartbeat.ts / wake reasons env vars） |
| 任务系统作统一媒介（delegation=建 issue / coordination=comment / status=PATCH） | ✅ | deepwiki（issues.ts / Core Concepts） |
| goal ancestry `parentId` + `buildPaperclipTaskMarkdown` 最多 6 条入 prompt + 截断 | ✅ | deepwiki（heartbeat.ts / issues.ts findOpenAncestorCreatedByAgent） |
| Board 语义 + surface problems don't silently fix + executionPolicy review/approval + 强制决策 | ✅ | deepwiki（SPEC.md / execution-semantics.md / execution-policy guide） |
| adapter invoke/status/cancel + claude_local/codex_local + spawn shell:false + session 持久化 | ✅ | deepwiki（6.4 Creating Custom Adapters / adapter-utils） |
| `agent_task_sessions`/`agent_runtime_state` 表 + session_params_json + total_cost_cents | ✅ | deepwiki（db schema / 8.2 @paperclipai/db） |
| 预算三级 + 软告警 + 硬顶 + override + incident | ✅ | deepwiki（Costs.tsx / BudgetPolicyCard / SPEC.md） |
| WebSocket `/companies/:id/events/ws` + 事件类型 + 断线短轮询 | ✅ | deepwiki（4.7 Live Updates / LiveUpdatesProvider） |
| Inbox / Dashboard / Approvals UI 动作 | ✅ | deepwiki（4.3 / 4.11 / ui.md） |
| issue-thread interactions 五种 + accept/reject/respond/verdicts | ✅ | deepwiki（6.1 Skill API） |
| routines cron/webhook/api + concurrency/catchUp policy | ✅ | deepwiki（3.10 Routines） |
| MCP ask-first + approval_required + 60 分钟过期 + sandbox allowlist | ✅ | deepwiki（3.12 MCP Tool Access Governance） |
| plugin SDK + UI slots + launchers + ctx + workspace-diff 插件 | ✅ | deepwiki（9 Plugin System） |
| company export/import + portability + DB backups | ✅ | deepwiki（11.3 / 11.2） |
| `npx paperclipai onboard` + onboarding wizard + team lead 配置 | ✅ | deepwiki（2.1/2.2 / 4.6 Onboarding Wizard） |
| MIT / 自托管 / 无账号 / Node+React+PG / launch 2026-03-02 / **77.6k stars（GitHub API 直证 77,593，`pm-paperclip-community.md` 走查更新；原 76.6k 略偏低）** / @dotta | ✅🟡 | GitHub README + GitHub API + tvly（contabo / swanbase / devopscareers / landscape.jimmysong） |
| "If OpenClaw is an employee, Paperclip is the company" 定位 | 🟡 | landscape.jimmysong.io（`pm-paperclip-community.md` 走查：paperclip.ing testimonials + contabo + flowtivity + zeabur **四方独立互证**） |
| 并发竞态 issue #11180/#11147/#11148 | 🟡 | GitHub issues（tvly 抓取）——**`pm-paperclip-community.md` 走查纠正：GitHub search `race/concurrency/deadlock` 实际命中 1266 个，是社区长期高频痛点，非 3 个孤立 issue** |
| hosted/付费计划未明 | ⚠️ | PM 推断（仓库无付费页） |
| 圆桌不支持 / 长记忆无向量子系统 | ✅⚠️ | ✅ 源码层无 RoundTable 实体 + 无 Vectorize；⚠� 推断"不够用" |
| OPC 高管团圆桌 vs Paperclip 树状不匹配 | ⚠️ | PM 推断（对照 PRD 已对齐决策） |
