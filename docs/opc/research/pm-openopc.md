# OpenOPC 产品调研（PM 视角）

> **仓库**：`HKUDS/OpenOPC`（Python 3.10+ 后端 + React + Phaser Office UI + CLI；1266 stars / 9 watchers / 215 forks；2026-07-01 创建，6 周龄）。
> **owner**：HKUDS（**Organization**，香港大学数据智能实验室的 GitHub org，学术背景，旗舰项目 LightRAG）。
> **定位**：Build Your Personal AI-Native Company — Self-Built, Self-Run, Self-Grown。**与我们的 OPC（一人公司）几乎是同名同义的直接竞品——本批次最重要的对照对象**。
> **证据分级**：✅ 源码 / README / GitHub API 直证 ｜ 🟡 二手（社区 / 媒体） ｜ ⚠️ PM 推断。
> **调研方法**：deepwiki 未索引（返回 "Repository not found"，跳过）→ GitHub REST API（README 全文 / contents / contributors / issues / commits / forks / license / HKUDS org repos）+ raw 源码逐文件读（`phase.py` / `turn_mode.py` / `task_graph.py` / `escalation.py` / `employee_evolution.py` / `recruiter.py` / `seat_executor.py` / `work_item_transition.py` / `collaboration_policy.py` / `communication.py` / `company_runtime_identity.py` / `store.py`）+ HN Algolia / WebSearch 中英文社区（社区信号另起 subagent 走查）。**结论以源码层证据为主**（deepwiki 缺位反而逼出更硬的一手源码证据）。
> **承接**：`./multi-agent-orchestration.md` §3 各产品对照；`../design/opc-product-discussion.md` §5 编排老师拼图 + §9 编排平台分野；`../design/multi-agent-prd.md` §5 第二期圆桌 + §7/§8 决策边界。

---

## 1. 一句话定位

OpenOPC 是 HKUDS（港大数据智能实验室）开源的**多 agent 编排 runtime**——给定一个业务目标，自动起草 org chart（roles + reporting lines）、recruiter 决定复用老员工 vs 招新、manager 在一个显式的 **13 态 work-item 状态机 + 6 模式 turn 分类器 + 依赖 DAG** 上按 execute/delegate/review/integrate/rework/report 推进、blocker 两级 escalate、Self-Grown 把每次执行归因到具体 role 并把 recurring lessons 提升为组织级 playbooks。✅

一句话产品意图：**「让你像经营一家公司一样用 agent，agent 自动组队、自动派活、自动学习」**——这套话术与我们的 OPC（一人公司）概念**几乎完全重合**，是本批次唯一的「同名同义直接竞品」。⚠️（重要程度高于其他 10 个参考产品中的任何一个）

> ⚠️ **「同名同义」是真实威胁也是真实学习对象**——HKUDS 是 LightRAG 等热门项目的学术 org（见 §11），OpenOPC 的编排引擎是本批次**源码层最显式、最完整**的一个（13 态 FSM + 静态转换表 + 通用恢复 exit + attempt ledger 防重调度死循环 + DFS 死锁检测，工程深度见 §7）。它不是 demo show，是真在解多 agent 编排结构性难题。本调研的核心任务就是搞清楚：**它做对了什么我们没想到的、它哪里没我们想得清、我们该抄什么不抄什么**。

---

## A. 根本使用场景

OpenOPC 造的不是聊天框，是**「AI 公司的操作系统」**。核心场景：**你（一个人）给一个业务目标，OpenOPC 自动把一个公司拉起来、自己跑、跑完自己学习变强**。

### Company Mode 全流程（OpenOPC 的主线场景）✅

1. **起公司（Self-Built 配员）**：`opc init` 初始化 `.opc/` 配置 + memory + projects 目录；`opc chat --mode company --company-profile corporate "Plan, implement, review, and document this feature"`。给定 brief，OpenOPC 的 `CompanyRecruiter`（`recruiter.py`）起草 org chart——根据 goal 推导需要的 roles（如 PM / Engineer / Reviewer）+ reporting structure，对每个 role 决定**复用现有 employee（带累积 experience_score + learned_skill_refs）还是从 talent pool 招新（template_only, clean slate）**。recruiter 选 employee 时按 `experience_score` 排序取最高（`max(existing_payload, key=lambda item: item["experience_score"])`），选 template 时打 `experience_mode: template_only` 标记。✅

2. **部活（Self-Run 执行）**：manager role 拿到顶层 work item，先跑 `TurnMode.DELEGATE`（manager 还没派活时，metadata 里有 `allowed_delegate_role_ids`）→ LLM 拆成子 work items + 建**依赖 DAG**（`task_graph.py` 的 `TaskGraphScheduler`：独立项并行、依赖项等前置完成）；子 work item 派给 leaf role 跑 `TurnMode.EXECUTE`（自己干）；干完不是直接 done——OpenOPC 在 review 前先派一个隐藏的辅助 work item 让同一 session 生成结构化 handoff（`TurnMode.REPORT`），再进入 `Phase.AWAITING_MANAGER_REVIEW` 让 reviewer role 跑 `TurnMode.REVIEW` 发 verdict；reject 则进 `Phase.READY_FOR_REWORK` 让 worker 跑 `TurnMode.REWORK` 改；accept 且 manager 还有未完成 children 则继续派、children 全 APPROVED 则 manager 跑 `TurnMode.INTEGRATE` 汇总上层交付物。✅

3. **遇阻（两级 blocker 处理）**：worker 干活遇阻——若是**团队内**（需要别的 role 配合），发 blocking message（`CommunicationManager` + `MessageUrgency.BLOCKING` + `reply_needed=True`），发件人进 `Phase.WAITING_FOR_PEER` 暂停、收件人 role 被激活来解决（comms 文件 `.opc-comms/` 落盘可 replay 可唤醒）；若**超出团队权限**（如需要钱、需要决策、需要凭据），runtime 调 `EscalationEngine.escalate()` 把决策顶到 human owner（`EscalationType.DECISION_NEEDED / INFO_NEEDED / RISK_WARNING`，asyncio 等 `user_reply_callback` 300s 超时走 default_action）。✅

4. **看 + 插手（Office UI）**：Workspace 三栏（左 session 列表 / 中 kanban / 右 context panel Chat+Agents+Info+Comms+Team 五 tab）；Office 页用 Phaser 渲染动画 office（每个 role = 像素小人，显示 status / current task / active tool / seat）；Org 页编 org chart / hire / deploy employee 到 office。看板卡片随 work item phase 自动移列（todo / in_progress / in_review / done），manual drag 在 runtime owns state 时被禁。✅

5. **学（Self-Grown 归因）**：跑完后用户反馈被 `EmployeeEvolutionManager` **归因到具体 role**（不是整个公司）——只有 own 了相关 work item 的 role 才被更新（credit/blame 落到具体人）。每个 role 的 tasks 被 distil 成 high-signal lessons 存进它的私有 experience profile（`employee_evolution.json` + per-org `company_state/<org_id>/employee_experience/<emp>.json`），recurring lessons 被**提升为 shared playbooks**（`LEARNED_SKILL_THRESHOLD = 2`，出现 ≥2 次就 promote），新员工继承 playbook 从入职起就有累积知识。✅

6. **续跑（session 恢复）**：Company-mode session 是可恢复的——`company_runtime_identity.py` 把 runtime 身份锚在 root session + active suspend checkpoint（`company_runtime_suspended` / `company_runtime_interrupted`），重启后 `reactivation_sweeper` 扫 dangling claims、释放 stale claim、按 attempt ledger 判断能否 re-dispatch（防「issue #10: restart → resume → deterministic crash → re-dispatch」死循环）。2026-07-14 News 明确「Company-mode sessions now recover and resume more seamlessly while preserving agent identity, shared role context, delegation, and review progress」。✅

### Task Mode（单 agent workspace，LobeChat-like）✅

`opc chat --mode task --agent native|codex|claude_code|cursor|opencode "..."`——类 LobeChat 的单 agent 工作台，选执行 agent。kanban 在 Task Mode 是 project-level board，一张卡片 = 一个 task-backed chat session。

**主场景一句话**：用户开 OpenOPC 不是来「和 agent 聊天」，是来「让一家 AI 公司帮你跑完一件复杂活」——你只给 brief 和审批，agent 自己组队、拆活、协作、遇阻上报、跑完学习。⚠️（与我们的 OPC 定位**完全重合**）

---

## B. 解决的痛点

1. **复杂活一个 agent 干不完**：单 agent 装不下「调研 + 开发 + review + 文档」的多职能上下文。OpenOPC 用 org chart 把活拆给多个 role-specific agent，manager 编排依赖。✅
2. **派活靠 @mention 太松散**：Multica/Raft/Buzz 都是 @mention 派活，靠 free-text instructions 脆弱（Multica B2B 实战已踩坑，见 pm-multica-community.md）。OpenOPC 把派活做成**显式的 work-item 状态机**——delegation = 建 child work item（不是发消息），phase 转换受静态转换表约束，每个 phase 纯函数派生 kanban column / owner / runnability / verdict。✅
3. **多 agent 同台协调失败**：Paperclip 1266 个并发竞态 issue（race/concurrency/deadlock）证明没协议级硬约束的编排产品多 agent 同台必踩坑。OpenOPC 用 attempt ledger（`ATTEMPT_CRASH_STREAK_LIMIT=3` / `ATTEMPT_INTERRUPTED_STREAK_LIMIT=5`）+ universal exits（FAILED/CANCELLED）+ recovery exits（READY）+ phase-transition hooks 单点同步多层状态 + DFS 死锁检测——**显式解决竞态根因**（见 §7）。✅
4. **agent 每次从零开始，不积累**：换 session = 失忆 = 永远当不了同事。OpenOPC 的 Self-Grown 给每个 role 私有 experience profile（跨 session 累积）+ 组织级 playbook（跨 role 共享）。✅
5. **blocker 被 agent 自己瞎绕**：OpenOPC 两级 escalate——团队内 blocking 暂停发件人激活解决者，超权限顶到 human owner（不静默绕过）。✅
6. **没法看 agent 公司在干啥**：Office UI 用 Phaser 把每个 role 的 status/task/tool 可视化成动画 office，Comms tab 看 inbox/meeting/decision，Execution Progress panel 看每个 work item 的 activity / tool / handoff / review 元数据。✅

> ⚠️ **痛点 1-6 全部命中我们的 OPC 痛点**——OpenOPC 不是在做另一件事，它在做**我们想做的同一件事**，只是从「自动建组织 + 显式状态机 + 组织记忆」三个角度切入。这是本调研最需要诚实评估的对照。

---

## C. Feature list

> 分维度列，每条一行（功能名 + 一句话）。证据默认 ✅（README + 源码层），推断标 ⚠️。

### Self-Built（招人建组织）
- 🌿 **Org chart 自动起草**：给定 goal，LLM 推导 roles + reporting structure（`org_engine.py` + `recruiter.py` `CompanyRecruiter`）。✅
- 🎯 **Recruiter 复用 vs 招新决策**：对每个 role，recruiter 按 `experience_score` 取最高的现有 employee（带 learned_skill_refs）复用，或从 talent pool 招新（template_only, clean slate）。✅
- 👥 **Talent market**：从 `agency-agents` 库导入 talent templates，Org→Employees 搜 / hire 进 vacant role。✅
- 🏢 **Org 架构预设**：内置 `corporate` profile + 可保存自定义 org（`company_orgs/org_<id>_config.yaml`），market 页浏览/安装/导出 `.opcpkg` 包。✅
- 🔄 **Reorg manager**：跑动中调整 org 结构（`reorg_manager.py`）。✅

### Self-Run（执行——编排引擎核心）
- 📋 **13 态 work-item 状态机**：`Phase` enum = QUEUED / WAITING_DEPENDENCIES / READY / READY_FOR_REWORK / RUNNING / WAITING_FOR_PEER / WAITING_FOR_CHILDREN / PAUSED / NEEDS_ATTENTION / AWAITING_MANAGER_REVIEW / AWAITING_HUMAN / APPROVED / FAILED / CANCELLED（实际 14 态含 REPORT 隐含态），静态 `ALLOWED_TRANSITIONS` 表 + `validate_transition` 强制。✅
- 🎬 **6 模式 turn 分类器**：`TurnMode` enum = EXECUTE / DELEGATE / REVIEW / INTEGRATE / REWORK / REPORT（README 说「五模式」但源码加 REPORT 共六个），`infer_turn_mode()` 纯函数按优先级（report > review > rework > integrate > delegate > execute）分类。✅
- 🌲 **依赖 DAG 调度**：`task_graph.py` `TaskGraphScheduler.execute_graph()` 用 `asyncio.gather` 并行跑独立 task、等前置 DONE 才跑依赖 task，无 runnable 时标 BLOCKED。✅
- 👑 **Manager 五模式 + reviewer + final decider**：delegation 是建 child work item（不是发消息）；reviewer role 发 verdict（accept/rework/escalate）；review 超预算自动 escalate 到 human。✅
- 🔗 **Phase-transition hook 单点同步**：`register_phase_transition_hook` 让 task.status / role_session.status / dispatcher wake signal 订阅 phase 变化一处同步，消除「phase 改了忘了同步依赖层」bug 类。✅
- 🛡️ **Blocker 两级 escalate**：团队内 blocking message（`WAITING_FOR_PEER` 暂停发件人 + 激活解决者）；超权限 `EscalationEngine.escalate()` 顶到 human owner（300s 超时走 default_action）。✅
- ♻️ **Attempt ledger 防重调度死循环**：每次 durable claim 开 attempt、turn boundary settle outcome，连续 crash ≥3 / interrupted ≥5 禁止再 dispatch（issue #10 修复）。✅
- 💀 **DFS 死锁检测**：`communication.py` `_find_wait_cycles()` 用迭代 DFS 找 wait-for 图环（任意长度，不限 pair）。✅
- 🧹 **Reactivation sweeper**：重启后扫 dangling runtime claims，stale claim 释放（IN_PROGRESS | IN_REVIEW 都 releasable），但只有 IN_PROGRESS 可 re-dispatch（review parent 不能被重新派）。✅
- 💬 **协作工具集**：`send_dm` / `broadcast_issue` / `start_meeting` / `ask_peer_and_wait` 四个 collaboration tool（`collaboration_policy.py`）。✅
- 📝 **Meeting room**：`MeetingRoom` model，多 role 开会，turn runner 轮流发言，consensus 分析（blocking_conflicts / open_questions / unresolved_items）。✅

### Self-Grown（学习——组织记忆）
- 🏅 **Per-role feedback 归因**：用户反馈 resolve 成 per-employee evaluation，只更新 own 了相关 work item 的 role（credit/blame 落到具体人）。✅
- 💡 **Private experience profile**：每 role 的 tasks distil 成 high-signal lessons 存进私有 profile（strengths / adjustments / avoid_next_time / routing_notes / working_patterns / default_checklists / reviewer_preferences / risk_watchouts / tool_preferences / fit_domains / avoid_domains 十一类字段）。✅
- 📚 **Shared playbook 提升**：recurring lessons（`LEARNED_SKILL_THRESHOLD = 2`）提升成 shared playbook skill，新员工继承（`learned_skill_refs`）。✅
- 🧠 **Build employee delta context**：员工被 deploy 时，`build_employee_delta_context()` 把它的 experience profile（evolution_count / reflected_projects / strengths / watchouts / patterns）拼进 context（带「Self-Evolved」前缀标注来源）。✅

### Office UI（React + Phaser）
- 🖥️ **三页 Workspace/Office/Org**：Workspace 默认屏（三栏 kanban + context panel）；Office 动画 office（Phaser 像素小人 status/task/tool/seat）；Org 编公司架构。✅
- 📋 **Kanban（Company Mode 跟 runtime session）**：卡片 = company work item，随 phase 自动移列；runtime owns state 时禁 manual drag。✅
- 📋 **Kanban（Task Mode project-level）**：卡片 = task-backed chat session，Todo 列可 quick-create。✅
- 🔄 **Execution Progress panel**：每 work item 的 status / activity sections / tool progress / handoffs / review targets / execution turn metadata。✅
- 👥 **Agents tab**：role rollup（active/waiting/pending/done + current tool + role work items + filter/search）。✅
- 📨 **Comms tab**：role inbox（unread/read/sent）+ meetings + decisions + recent comms failures。✅
- 🎯 **Team tab**：runtime cockpit（teams/seats/approvals/unread/run state/stop controls）。✅
- 🎨 **Talent market 页**：搜 template / inspect / hire。✅
- 🏗️ **Org editor**：Team/Runtime/Architecture/Employees 四 sub-tab，可视化编 role graph + reporting lines + final decider + delegation strategy。✅

### Task Mode（单 agent workspace）
- 🤖 **五执行 agent**：OpenOPC Native / Codex / Claude Code / Cursor / OpenCode。✅
- 💬 **类 LobeChat 工作台**：kanban = project board，每卡片一个 task session。✅
- 🔒 **锁 mode**：第一条消息后 mode + agent 锁定该 chat，locked-mode popover 可开新 chat 切换。✅

### 双模式 + 九垂直领域
- 🔄 **Company Mode（多 agent 编排）+ Task Mode（单 agent workspace）**：同一 CLI/UI 两种模式。✅
- 🌐 **九垂直领域**：AI Tech & Research / Software Development / Financial Investment / Sales Growth / Content & Media / Industry Assistants / Accounting & Finance / Brand & E-commerce / Education & Training。✅（⚠️ 是 demo cover 还是真落地，见 §11）

### 审批与介入
- 🛡️ **Risk 分级 + auto-approve**：`max_auto_approve_risk` knob（low/medium/high/critical），known destructive 命词（rm -rf / drop table / force-push）= high/critical 必 escalate，safe allowlist（ls / git status）= low 自动放，其余 medium 走 LLM review 后 auto-approve。✅
- 🔑 **tool_first_use_approval**：每个工具首次使用必 ask（除非 exemption），「Always allow」累积成 per-project allowlist。✅
- 📡 **Session grants 持久化 + deferred decisions**：2026-07-08 News——session 内 grant 持久化、低风险自动放行、deferred decision 可后续取回。✅
- 👤 **Final decider**：org 里可设 final decider role，做不了的决定顶给它或顶到 human。✅

### 执行与持久
- 🔄 **Company-mode session 续跑**：2026-07-14 News——session 恢复续跑，保留 agent identity / shared role context / delegation / review progress。✅
- 🪑 **Seat executor**：`SeatExecutor` protocol（prepare_seat / run_turn / checkpoint / interrupt / shutdown），per-role session 执行 + external resume（claude_code `--resume` / codex thread resume）。✅
- 🔌 **External broker**：`external_broker.py`（117KB）broker 五种 external agent CLI，session identity 持久化。✅
- 🧠 **Native runtime**：`native_agent.py` + `runtime_v2/` 自研 agent runtime（OpenOPC Native），不是纯 wrap CLI。✅
- 💾 **混合持久**：核心状态 SQLite（`store.py` 352KB，sync sqlite3 非 aiosqlite）；comms 文件落盘 `.opc-comms/`（可 replay 可唤醒）；employee evolution JSON（`employee_evolution.json` + per-org `employee_experience/<emp>.json`）。✅

### 集成 / 通道
- 📡 **11 个外部 messaging 通道**：Feishu / Telegram / Slack / Discord / DingTalk / Email / Matrix / QQ / WhatsApp / Mochat（每个 install extra），`opc channels login/status/start/stop`。✅
- 🌐 **Browser tools（Playwright native）**：browser_navigate/snapshot/click/type/wait_for/scroll/select_option/evaluate/take_screenshot/close。✅
- 🔌 **MCP servers**：`mcp_servers` in system_config.yaml，stdio local + HTTP/SSE remote，工具带 server prefix 避冲突。✅
- 🛠️ **Shell/file/git/web search/Python exec/browser 协作工具集**：layer4_tools。✅

### 项目 / 部署
- 📁 **Project lifecycle**：`opc project list/create/switch/rename/delete`。✅
- 🌍 **OPC_HOME env**：config + runtime state 可挪出 repo。✅
- 📦 **`.opcpkg` 包导入导出**：org / employee / talent / skill / channel 全是文件，可整组织导出分享。✅
- 🐍 **uv 推荐环境**：`uv venv --python 3.12 && uv pip install -e .`，无 Docker/K8s 强依赖。✅
- 🔧 **CLI 完整命令组**：project/session/mode/kanban/agent/org/talent/market/runtime/channels 十组。✅

---

## 5. 核心概念

- **Organization（公司架构）**：role graph + reporting lines + final decider + delegation strategy + runtime policy。Corporate 内置 / saved org 自定义（`company_orgs/org_<id>_config.yaml`）。✅
- **Role（角色 = 名字 + 宽能力倾向）**：org chart 节点，带 `skill_refs` / runtime policy / preferred external agent / execution strategy（auto/native/external）。**注意：OpenOPC 的 role 不是固定职能岗位，是「role_id + label + 能力配置」**——与我们 PRD「角色 = 名字 + 宽能力倾向」方向一致，但 OpenOPC 偏 schema 侧（role 可被多个 employee 实例化），我们偏 instance 侧（Raft name > role 哲学，见 §12）。✅
- **Employee（员工实例 = role 的实例化）**：被 hire 进 role，带 `experience_score` + `learned_skill_refs` + `template_id`。**role 是 schema，employee 是 instance**——一个 role 可有多个 employee 候选，recruiter 按 experience_score 选最优。✅
- **Work item（工作项 = 状态机载体）**：delegation 工作单元，14 态 phase + metadata（work_kind / dependencies / ownership_contract / handoff_log / attempt ledger / rework_feedback / frontier）。**单一权威状态**（phase is single source of truth）。✅
- **Turn mode（六模式）**：EXECUTE / DELEGATE / REVIEW / INTEGRATE / REWORK / REPORT——纯函数从 work item state 派生，决定 prompt/context 装哪类上下文。✅
- **DAG（依赖图）**：manager 拆活时建 dependency DAG（`dependency_projection_ids` + `dependency_classes: hard/soft`），独立并行 / 依赖等待。✅
- **Phase-transition hook**：单点同步机制——work item phase 一变，订阅的 task.status / role_session.status / dispatcher wake 全跟着同步，消除「改了忘了同步」bug 类。✅
- **Experience profile（per-role 私有记忆）**：每 role 的累积学习（strengths / adjustments / watchouts / patterns / checklists / preferences / fit/avoid domains），跨 session 持久。✅
- **Playbook（共享作业手册）**：recurring lessons（≥2 次）提升成的 shared skill，新员工继承。✅
- **Blocker 两级**：团队内 blocking message（`WAITING_FOR_PEER`）/ 超权限 escalate human（`AWAITING_HUMAN`）。✅
- **Seat（座位 = role × session × external agent 的执行单元）**：`SeatExecutor` protocol，每个 active role 占一个 seat，prepare_seat 装上下文 + external resume token，run_turn 跑一轮，checkpoint 存恢复点，interrupt 中断。✅
- **Company runtime identity**：runtime 身份锚在 root session + active suspend checkpoint（不是 task，task 只是执行信封），重启可恢复。✅
- **Task Mode vs Company Mode**：Task = 单 agent LobeChat-like workspace；Company = 多 agent org 编排。同一 CLI/UI 两种模式。✅

---

## 6. 状态哲学（重点）

**状态焊在 work-item + SQLite + org chart 上，不焊在 agent 进程上。** 这是 OpenOPC 最关键的设计决策，一切后续行为都从这里推导。✅

具体拆解（与 Paperclip / Multica / Raft 对照）：

- **状态焊在 work item（phase 是 single source of truth）**：`phase.py` 的设计注释明确「A `Phase` is the single authoritative state of a delegation work item. It replaces the previous mixture of `status` + 5 metadata sub-state fields which were tangled and could disagree with each other」——OpenOPC **刻意把多种 sub-state 收敛成单一 phase enum**，所有派生（kanban column / owner / runnability / verdict）用纯函数从 phase 投影。这比 Paperclip（issue + 多字段并存）+ Multica（issue 状态机）**更激进地单一化**。✅
- **持久焊在 SQLite（混合持久）**：核心状态（task / work item / comms state / observability / cost / approval）在 `store.py` 352KB SQLite（同步 sqlite3）；comms 细节落 `.opc-comms/` 文件（可 replay 可唤醒）；employee evolution JSON。**比 Paperclip 的全 PostgreSQL 轻**（无 server 依赖），**比 Multica 的 issue-on-Git 重**（状态在本地数据库不在 Git 平台），**和我们的 claude2 JSONL + relay 双缓冲同量级但更显式**（phase enum 而非隐式 status）。✅
- **身份焊在 org chart（role + employee 两层）**：role 是 schema（可被多 employee 实例化），employee 是 instance（带 experience_score + learned_skill_refs）。**换 employee 干同一个 role = 接管同一组 work item，role 配置不动 + employee 的 experience profile 跟着走**。这比 Paperclip（agent = role 一体）**多了一层 schema/instance 分离**，更接近「class vs instance」的 OOP 模型。✅
- **执行身份焊在 root session + checkpoint**：company runtime 身份锚在 root session + active suspend checkpoint（不是单个 task，task 只是执行信封）。agent 进程是临时的，runtime 是常驻的——重启可恢复（2026-07-14 News）。✅

**换成员**（换 employee 干同一 role）：work item 的 `work_item_role_id` 不动，换 `employee_id`，新 employee 下次 turn 接管同一组 work item + 自己的 experience profile（不继承前 employee 的 profile——profile 绑 employee 不绑 role）。✅
**换任务**（同一 role 切活）：role 在多个 work item 间按 DAG + dispatcher 调度，每个 work item 独立 phase。✅
**换组织**（reorg）：`reorg_manager.py` 调 role graph + reporting lines，但**正在跑的 work item 的 ownership_contract 不被破坏**（work item 状态独立于 org 拓扑）。✅

**与 Paperclip/Multica/Raft 的品类关系**：
- **vs Paperclip**：都焊「org chart + work item（issue）」，都 agent 无状态短窗口 spawn。OpenOPC 多了**显式 phase enum + attempt ledger + reactivation sweeper**（Paperclip 只用 issue status 字段，无显式 FSM 转换表）。OpenOPC 的状态机**工程深度更高**（Paperclip 1266 个并发竞态 issue，OpenOPC 用 attempt ledger 显式防这类死循环）。✅
- **vs Multica**：Multica 焊 GitHub issue（状态在 Git 平台），OpenOPC 焊本地 SQLite（状态在自己手里）。Multica agent 配置非常驻，OpenOPC role session 有 checkpoint 可 resume。Multica 靠 @mention + free-text instructions 派活（脆弱），OpenOPC 靠显式 work-item 委派（强约束）。✅
- **vs Raft**：Raft 焊「channel（共享对话）+ agent computer（私有记忆）」双锚，OpenOPC 焊「work item（共享状态）+ employee experience profile（私有记忆）」——**双锚结构同构**！差别在共享状态载体（Raft 是 channel/IM，OpenOPC 是 work item/kanban）和协作范式（Raft 是圆桌讨论，OpenOPC 是层级委派 + manager 五模式）。✅

**一句话**：OpenOPC 把「公司」建模成 SQLite 里的 work-item DAG + role/employee 两层身份 + phase 状态机 + per-employee experience profile，agent 进程是临时执行者——**与 Paperclip 同品类但工程更扎实，与 Raft 双锚同构但协作范式不同（层级 vs 圆桌）**。✅

---

## 7. 派活与编排交互（最关键一节）

这是 OpenOPC 最核心的编排引擎，也是本调研最该深挖的部分。我读了核心源码（`phase.py` / `turn_mode.py` / `task_graph.py` / `work_item_transition.py` / `escalation.py` / `collaboration_policy.py` / `seat_executor.py`），下面把机制讲清楚。

### 7.1 work-item 14 态状态机（`phase.py`）

OpenOPC 的 phase enum 实际有 14 个值（README 说「五模式」是 turn mode，不是 phase；phase 比 turn mode 更细）：

| Phase 组 | 具体值 | 含义 |
|---|---|---|
| **TODO** | QUEUED / WAITING_DEPENDENCIES / READY / READY_FOR_REWORK | 等调度（新活 / 等前置 / 可派 / 待返工） |
| **IN_PROGRESS** | RUNNING / WAITING_FOR_PEER / WAITING_FOR_CHILDREN / PAUSED / NEEDS_ATTENTION | 在跑或暂停等 |
| **IN_REVIEW** | AWAITING_MANAGER_REVIEW / AWAITING_HUMAN | 等评审 / 等人 |
| **DONE** | APPROVED / FAILED / CANCELLED | 终态 |

**静态转换表 `ALLOWED_TRANSITIONS`**：每个 phase 显式列可跳的目标，`validate_transition()` 越界抛 `InvalidPhaseTransition`。两个关键设计：

- **Universal exits（每个非终态都有 FAILED + CANCELLED 出口）**：任何 agent runtime 异常都能落地 FAILED，任何 user/system cancel 都能落地 CANCELLED。不变量测试 `test_phase_state_machine_invariants.py` 保证这俩永在。✅
- **Recovery exits（每个 in-flight phase 都能回 READY）**：进程重启后所有 persisted runtime claim 失效，stale claim sweeper 把死 claim 清掉、phase 回 READY 让 dispatcher 重派——这是 crash recovery 的核心机制（Bug C 修复）。✅

### 7.2 6 模式 turn 分类器（`turn_mode.py`）

`infer_turn_mode(work_item, is_review_entry)` 是**纯函数**（不读 store，所有状态都在 work item 的 phase + metadata 上），按优先级返回 6 模式之一：

```
Priority 0: REPORT    — 隐藏辅助卡（worker DONE 后让同 session 生成结构化 handoff）
Priority 1: REVIEW    — review-work-item 卡 / kind=="review" / is_review_entry
Priority 2: REWORK    — READY_FOR_REWORK 或有 rework_feedback / review_rework_count>0
Priority 3: INTEGRATE — 有 dependency_work_item_ids 且 RUNNING/READY/frontier=="resumed"
Priority 4: DELEGATE  — 有 allowed_delegate_role_ids 且无 dependency_work_item_ids
Priority 5: EXECUTE   — 默认（leaf role 自己干）
```

这个分类器的精妙在于：**它把「manager 该干啥」从「manager 的 prompt 里读规则」改成「按 work item state 派生」**——agent 不需要自己判断现在该 delegate 还是 review，分类器告诉它，prompt 装对应上下文。这直接解决了 Multica 的「agent 关系塞 free-text instructions 脆弱」痛点（pm-multica-community.md #815 戳穿）。✅

### 7.3 DAG 调度（`task_graph.py`）

`TaskGraphScheduler.execute_graph(tasks, executor)`：
1. `get_runnable()` 找所有 status==PENDING 且 dependencies 全 DONE 的 task。
2. 没有 runnable 但还有 remaining → 全标 BLOCKED + break（死锁保护）。
3. 有 runnable → `asyncio.gather` 并行跑（每 task 先 RUNNING → executor(task) → finally publish status_changed）。
4. 跑完 discard 出 remaining，循环。

**独立项并行 + 依赖项等待 + 死锁保护**——比 Paperclip（靠 issue 调度器隐式）和 Multica（靠 Squad leader 手动 @mention）都更**显式可预测**。✅

### 7.4 manager 五模式怎么转（基于 work_item_transition + turn_mode）

manager 的一个 work item 生命周期（按 phase 推进）：

```
QUEUED → READY（dispatcher 可派）
       → RUNNING（manager 拿到 turn）
         │
         ├─ infer_turn_mode=DELEGATE（有 allowed_delegate_role_ids 无 deps）
         │   → 建 child work items + dependency DAG
         │   → 自己进 WAITING_FOR_CHILDREN
         │
         ├─ infer_turn_mode=INTEGRATE（children 全 APPROVED，自己 resumed）
         │   → 汇总上层交付物
         │   → AWAITING_MANAGER_REVIEW（交给上级 reviewer）
         │
         └─ infer_turn_mode=EXECUTE（leaf role 自己干）
             → 干完先派 REPORT 隐藏卡让同 session 写 handoff
             → 进 AWAITING_MANAGER_REVIEW

AWAITING_MANAGER_REVIEW → APPROVED（reviewer accept）
                        → READY_FOR_REWORK（reviewer reject，review_rework_count++）
                        → AWAITING_HUMAN（review 超预算 escalate）

READY_FOR_REWORK → RUNNING（worker 拿到 REWORK turn，看 rework_feedback 改）
```

**关键洞察**：OpenOPC 的「五模式」不是 manager 的五个并列选项，是**按 work item 在状态机里的位置 + metadata 派生的**——同一 manager 在不同 phase 跑不同模式，agent 自己不用选模式，状态机告诉它。这是**最显式的编排引擎**（比 todos.dev 的 Plan→Build→Review 三阶段、Avernet 的 Initial→Discussion→Proposal→Execution 四阶段、Raft 的 Todo→In progress→In review→Done→Closed 五态都更细更工程化）。✅

### 7.5 blocker 两级 escalate

**第一级（团队内 blocking message）**：worker 遇阻需要别的 role 配合 → 发 `CommunicationManager` 的 blocking message（`MessageUrgency.BLOCKING + reply_needed=True`）→ 发件人 phase 进 `WAITING_FOR_PEER`（暂停）→ 收件人 role 被 activate 解决 → 解决后发件人回 RUNNING。comms 落 `.opc-comms/` 文件（可 replay 可唤醒）。✅

**第二级（超权限 escalate human）**：blocker 超出团队权限（要钱/要决策/要凭据）→ `EscalationEngine.escalate(task, DECISION_NEEDED/INFO_NEEDED/RISK_WARNING, message, options, default_action, context)` → publish `escalation_created` event → asyncio 等 `user_reply_callback` 300s → 收到回复 publish `escalation_resolved` 返回 / 超时 publish `escalation_timeout` 走 default_action（RISK_WARNING 默认 abort）。✅

**DFS 死锁检测**（`_find_wait_cycles`）：扫所有 PENDING task 的 dependencies + assigned role，建 wait-for 图（role → 它等的 role），迭代 DFS 找环（任意长度），找到的环成对返回——**预防两个 PENDING task 互相等形成死锁**。✅

### 7.6 attempt ledger（防重调度死循环）

每次 durable claim 开一个 attempt（`attempt_seq` + `attempt_settled`），turn boundary（任何非 RUNNING 的 transition）settle outcome。dispatcher 重派前查 metadata：

- 连续 crash ≥3（`ATTEMPT_CRASH_STREAK_LIMIT=3`）→ 拒绝重派（「attempt ledger: N consecutive crashed attempts」）
- 连续 interrupted ≥5（`ATTEMPT_INTERRUPTED_STREAK_LIMIT=5`）→ 拒绝重派

这是**针对 issue #10「restart → resume → deterministic crash → re-dispatch loop」的显式刹车**——Paperclip 1266 个并发竞态 issue 里很多是这类（如 #11147 cancelled run 丢下一阶段唤醒导致静默停滞），OpenOPC 用 attempt ledger **结构性地防住**。✅

### 7.7 一句话总结编排引擎

**OpenOPC 的编排引擎是本批次最显式、最工程化的一个**——13 态 phase enum（静态转换表 + 通用恢复 exit）+ 6 模式 turn 分类器（纯函数派生）+ DAG 调度（并行/等待/死锁保护）+ attempt ledger（防重调度死循环）+ DFS 死锁检测（防 wait-for 环）+ 两级 escalate（团队内 blocking + 超权限 human）+ phase-transition hook（单点同步多层状态）。这套引擎的工程深度**远超 Paperclip/Multica/todos.dev/Avernet**，是**显式编排引擎的范本**。✅

> **这是本调研对 OPC 第二期圆桌最关键的启示**——见 §12。

---

## 8. 记忆与上下文（重点）

OpenOPC 的 Self-Grown 是它**与我们 PRD 最大的分歧点**——我们 PRD §8 明确「不做共享记忆池」，Avernet 警示「组织记忆别一上来做」，但 OpenOPC 把组织记忆当**核心卖点**。它做对了吗？机制可信吗？

### 8.1 三层记忆结构（`employee_evolution.py` + `memory_manager.py`）

OpenOPC 的记忆其实分三层（不是简单的「per-agent vs 组织级」二分）：

1. **Private experience profile（per-employee，私有）**：每个 employee 有私有 profile，11 类字段（strengths / adjustments / avoid_next_time / routing_notes / working_patterns / default_checklists / reviewer_preferences / risk_watchouts / tool_preferences / fit_domains / avoid_domains）。存 `employee_evolution.json`（global）+ `company_state/<org_id>/employee_experience/<emp>.json`（per-org）。**这是 Raft 的 per-agent memory 哲学**——agent 间不互读 profile，靠 comms 传 finding。✅
2. **Shared playbooks（组织级，共享）**：recurring lessons（`LEARNED_SKILL_THRESHOLD = 2`）被 promote 成 shared skill（`learned_skill_refs`），新员工继承。**这是组织记忆**——跨 role、跨 session 共享。✅
3. **Project memory（markdown，全局/项目）**：`.opc/memory/` 全局 + project markdown memory（`markdown_memory.py`），`history_compactor.py` 做 session compaction。✅

**关键洞察**：OpenOPC 的「组织记忆」（playbook）**不是共享 brain pool**——它是**从 private profile 里 promote 出来的 skill**，存储形态是 skill（可挂载、可继承、可审计），不是「所有 agent 互读一个 memory pool」。这避开了 Raft 反对的「共享 pool deletes the specialists」陷阱——**specialist 边界仍在（private profile per employee），只是 recurring lessons 被显式 promote 成可共享的 skill**。✅

### 8.2 feedback 归因机制（Self-Grown 核心）

`EmployeeEvolutionManager` 把用户反馈归因到具体 role：

- **不是整个公司一刀切**：README 明确「Crediting the whole company teaches nothing」——只有 own 了相关 work item 的 role 才被更新。
- **per-role evaluation**：feedback resolve 成 per-employee evaluation，credit/blame 落到具体人。
- **distil lessons**：每 role 的 tasks 被 LLM distil 成 high-signal lessons（strengths / adjustments / watchouts）存进 private profile。
- **promote playbook**：recurring lessons（≥2 次）提升成 shared skill，新员工继承。

### 8.3 机制可信度判断

**可信的部分**：✅
- **per-role 归因**是真的（源码 `employee_evolution.py` 直证，11 类字段 + per-org profile + evolution_count）。
- **playbook promote**是真的（`LEARNED_SKILL_THRESHOLD = 2` 硬编码，源码直证）。
- **不是共享 brain pool**——playbook 是 skill 形态，specialist 边界仍在。
- **employee delta context** 真的被拼进 agent prompt（`build_employee_delta_context()` 带「Self-Evolved」前缀）。

**存疑的部分**：⚠️
- **「always delivers smarter」是营销话术**：playbook 学习效果无社区第三方验证（6 周龄，社区声量低，见 §11/§13）。Self-Grown 的「复利增长」承诺**未经实战检验**——类比 Paperclip 的「zero-human company」营销话术被社区戳穿（pm-paperclip-community.md）。
- **promote threshold=2 太低**：出现 2 次就 promote 成组织级 skill，可能产生噪音 skill（不是所有 recurring lesson 都值得 promote）。这是工程经验问题，需实战调参。
- **distil 依赖 LLM 质量**：lessons distil 是 LLM 调用（`call_llm_json_with_retry`），distil 质量取决于 LLM 能不能从 noisy execution trace 提取 high-signal lesson——这是 agent self-reflection 的老大难，OpenOPC 没有独家解法。

### 8.4 与我们 PRD §8「不做共享记忆池」的对照

**OpenOPC 做了组织记忆，我们刻意延后。谁对？**

- **我们延后的理由**（PRD §8 + Avernet 警示）：组织记忆是「上下文不足 + 增量复杂度」的双重难题，一上来做容易踩「共享 pool 溶解 specialist」+「distil 噪音累积」+「未经验证就上」三个坑。
- **OpenOPC 做了**：它把组织记忆（playbook）当核心卖点，但**机制上是 promote-from-private**（不是共享 pool），避开了 Raft 反对的陷阱。

**裁决**：OpenOPC 的 **promote-from-private 机制**是「组织记忆」的一个**可信实现路径**（不是共享 brain pool），但它**仍是营销话术超前于实战验证**（6 周龄无第三方背书）。我们 PRD §8「不做共享记忆池」**仍然对**——OpenOPC 没推翻它，反而印证了「组织记忆难做、需谨慎」：OpenOPC 用了 47KB（`employee_evolution.py`）+ 75KB（`memory_manager.py`）+ 26KB（`history_compactor.py`）= ~150KB 的 memory 层代码来解这个问题，**这是巨大的工程投入**，我们第一期不该背这个包袱。**但 OpenOPC 给了我们一个「未来怎么做」的参考路径**——promote-from-private（不是共享 pool），见 §12。✅

---

## 9. 审批与介入

### 9.1 risk 分级 + auto-approve（`system_config.yaml` autonomy 节）

```yaml
autonomy:
  max_auto_approve_risk: medium   # low | medium | high | critical
  allow_native_tool_auto_approval: true
  tool_first_use_approval: true   # first use of each tool always asks
```

- **risk 分类**：known destructive 命词（rm -rf / drop table / force-push）+ sensitive keywords（credentials / deploys）= high/critical 必 escalate；safe allowlist（ls / git status）= low 自动放；其余 medium 走 **LLM review 后** auto-approve。✅
- **tool_first_use_approval**：每个工具首次使用必 ask（除非在 `tool_approval_exemptions`），「Always allow」累积成 per-project allowlist（`approval_allowlist.py`）。✅
- **2026-07-08 News「Smarter approvals」**：session grants 持久化（同 session 内不重复问同类）+ low-risk 自动放行 + deferred decisions 可后续取回（不强制当场决定）。✅

### 9.2 escalate 机制（`escalation.py`）

`EscalationEngine.escalate(task, type, message, options, default_action, context)` 三种 type：
- `INFO_NEEDED`：缺信息，请提供后继续。
- `DECISION_NEEDED`：需要决策，给 options 让人选。
- `RISK_WARNING`：风险警告，proceed/abort 二选一，default abort。

asyncio 等 `user_reply_callback` 300s，超时走 default_action。`context` 带 structured approval data（action / allowlist patterns / scopes），让 UI 卡片在 inline wait 过期后仍能 apply decision。✅

### 9.3 review 闭环（phase 状态机层）

work item 的 `WorkItemReviewPolicy`：`review_owner_role_id` + `review_level: manager` + `max_reworks: 10`。reviewer role 跑 `TurnMode.REVIEW` 发 verdict——accept 进 APPROVED / reject 进 READY_FOR_REWORK（`review_rework_count++`）/ 超预算 escalate human。**review 超 max_reworks 自动顶到 AWAITING_HUMAN**（不让 manager 无限 rework worker）。✅

### 9.4 介入入口（Office UI）

- **Workspace Team tab**：runtime cockpit，stop controls 随时停当前 run。
- **Comms tab**：role inbox + meetings + decisions + recent comms failures，可看可介入。
- **Kanban**：runtime owns state 时禁 manual drag（防止人 agent 状态冲突）——**这是显式的「state 单一权威」取舍**，人不能绕过状态机改 phase。✅
- **CLI**：`opc session stop/continue/send/resume/complete` 全套介入命令。✅

---

## 10. 执行与持久

### 10.1 执行面（layer3_agent）

- **Seat executor**（`seat_executor.py`）：`SeatExecutor` protocol（prepare_seat / run_turn / checkpoint / interrupt / shutdown），per-role session 执行。`EngineSeatExecutor` 实现：prepare_seat 装上下文（external_resume_session_id + scope_id + agent_type），run_turn 调 `host._execute_task`，checkpoint 存恢复点，interrupt 不干预在跑的 coroutine。✅
- **External broker**（`external_broker.py` 117KB）：broker 五种 external agent CLI（codex / claude_code / cursor / opencode + native），session identity 持久化（external_resume_session_id），claude_code 用 `--resume`（2026-08-07 commit "keep claude_code resume across failed/cancelled runs" 修了 #36）。✅
- **Native runtime**（`native_agent.py` + `runtime_v2/`）：自研 agent runtime（OpenOPC Native），不是纯 wrap CLI——**这是 OpenOPC 与我们 agents-remote（纯 spawn CLI）的关键差异**，OpenOPC 有自研 runtime 路径。✅
- **preflight**（`preflight.py`）：external agent 可用性预检（`opc init --no-external-agent-preflight` 跳过）。✅

### 10.2 持久化形态（混合）

- **SQLite（`store.py` 352KB，sync sqlite3 非 aiosqlite）**：task / DelegationWorkItem / DelegationRoleSession / DelegationRun / DelegationCell / DelegationEvent / Goal / AgentMessage / MeetingRoom / ApprovalDecision / ExecutionCheckpoint / ExternalSession / HandoffRecord / CostEvent / ArtifactRecord / AgentCompactionRecord / AgentMemorySnapshotRecord 全表。✅
- **文件 comms（`.opc-comms/`）**：per-project comms workspace（inboxes / meeting transcripts / shared memory / tool-result scratch），可 audit / replay / wake blocked peers。✅
- **JSON evolution**（`employee_evolution.json` + per-org `employee_experience/<emp>.json`）：employee profile + learned skills。✅
- **markdown memory**（`.opc/memory/`）：全局 + project markdown memory。✅
- **UI state**（`.opc/ui_state.db`）：Office UI chat / channels / visual agent state（独立 SQLite）。✅
- **配置**（`.opc/config/*.yaml`）：llm / system / agent / channel / company_orgs / org_index 七类 YAML。✅

**混合持久的取舍**：核心结构化状态 SQLite（事务一致性）+ comms 文件（可 replay 可唤醒）+ evolution JSON（per-employee 自管）+ memory markdown（人可读可编辑）——**每种状态用最适合它的载体**，比 Paperclip 的「全 PostgreSQL」更轻（无 server 依赖）、比 Multica 的「issue on Git」更自主（状态在自己手里）、比 Raft 的「channel + workspace」更显式（phase enum）。✅

### 10.3 Company-mode session 续跑

`company_runtime_identity.py` 把 runtime 身份锚在 **root session + active suspend checkpoint**（`COMPANY_RUNTIME_CHECKPOINT_TYPES = {company_runtime_suspended, company_runtime_interrupted}` + `ACTIVE_COMPANY_RUNTIME_CHECKPOINT_STATUSES = {pending, resuming}`）。**task 是执行信封不是身份**——重启后按 root session 找 runtime，按 checkpoint 恢复，agent identity / shared role context / delegation / review progress 全保留（2026-07-14 News）。✅

### 10.4 Task Mode 单 agent 怎么跑

Task Mode 选执行 agent（native/codex/claude_code/cursor/opencode），一条消息触发一次 run，per-turn spawn + external resume token（claude `--resume` / codex thread resume）。**与我们 claude2 的 Bun.spawn 直拉 CLI 几乎同构**（见 §12）。✅

---

## 11. 商业模式与定位

### 11.1 HKUDS 学术背景（关键判断——社区走查 subagent 硬数据确认）

**HKUDS（Hong Kong University Data Intelligence Lab，港大数据智能实验室）** 是一个**真实、持续投入、多产的开源学术 org**——**91 个 public repos / 13,086 followers**（GitHub org 数据，非虚名）。**实验室负责人：Prof. Chao Huang（黄超）**，HKU Department of CS / AI & Data Science 助理教授 + 博导，Data Intelligence Lab@HKU 主任（lab homepage `sites.google.com/view/chaoh`，HKU IDS profile `datascience.hku.hk/people/chao-huang`）。研究方向：LLMs / autonomous agents / graph learning / recommender systems。✅

**HKUDS 的 agent framework 谱系（OpenOPC 在其中的位置）**：

| 谱系 | 项目 | stars | 性质 |
|---|---|---|---|
| RAG 旗舰线 | **LightRAG** | **38,815** | ⭐ **真旗舰 sustained serious effort**（2024-10 创建，~2 年，5,459 forks，600+ merged PRs，有 arXiv preprint） |
| RAG 旗舰线 | RAG-Anything | 22,887 | LightRAG 延伸 |
| RAG 旗舰线 | DeepTutor | 35,253 | RAG 应用 |
| **agent framework 线** | AutoAgent | 9,736 | 2025-10 stale，早期 agent framework |
| **agent framework 线** | **nanobot** | **46,908** | 「personal AI agent framework」+ skill-oriented design（**OpenOPC 致谢的 skill 设计灵感来源**） |
| **agent framework 线** | **OpenOPC** | **1,266** | ⭐ **本调研对象——agent framework 线的最新一代**（承接 nanobot skill 设计 + 走「公司编排」方向） |
| 爆款线 | CLI-Anything | 46,943 | viral one-off（star:fork ≈ 10.7，疑似追热点） |
| 爆款线 | Vibe-Trading | 30,721 | viral one-off |
| 爆款线 | DeepCode | 16,341 | 代码加速 |
| 其他 | OpenHarness / OpenSpace / ClawWork / ClawTeam / AgentSpace / CatchMe / MoChat | 0.5k–15k | 各种 agent 方向探索 |

**关键判断（社区走查 subagent 裁决）**：HKUDS 是 **「bimodal（双峰）」分布的学术 org**——一峰是 **LightRAG 这类真旗舰 sustained effort**（2 年、600+ PR、有 paper、真社区）；另一峰是 **CLI-Anything / nanobot / Vibe-Trading 这类 46k-tier 爆款**（star:fork ≈ 10-11 偏高、年轻、追 2026 viral LLM 浪潮，但仍在 2026-08 active push = 维护中的爆款非 abandon）。**OpenOPC 1,266 stars / 215 forks / 9 watchers / 5 contributors / 16 merged PRs 处于 HKUDS 谱系的低端（lower tier）**——**接近真 R&D / 早期项目规模，而非 viral blowout**。它**承接 nanobot（46.9k stars，OpenOPC 的 skill 设计灵感来源）的 agent framework 谱系**，是该谱系的最新一代（AutoAgent → nanobot → OpenOPC），但**远未达到 nanobot 的爆款热度**。✅

**社区走查关键裁决**：OpenOPC 是 **genuine, sustained HKUDS research effort — NOT a viral one-off**——它有真工程（6 周 74 commits + 16 merged PRs + 几天内关 issue 的 active triage），来自真学术实验室（Chao Huang 的 LightRAG 团队），区别于 HKUDS 的 46k-tier viral blowouts（CLI-Anything / nanobot）。但 **6 周龄验证面薄**：1,266 stars / 9 watchers / 5 contributors / zero HN/Reddit / zero arXiv paper / zero 独立英文 review / 误导性的 MIT badge 无 LICENSE 文件。**「值得密切跟踪但尚未 battle-tested」**。✅⚠️

### 11.2 学术 backing 对 OpenOPC 工程成熟度的影响

**正面**：HKUDS 学术背景（Chao Huang 的 LightRAG 团队）给 OpenOPC 带来了**严谨的工程文化**——源码层有完整的 phase 不变量测试（`test_phase_state_machine_invariants.py`）、attempt ledger 防死循环、DFS 死锁检测、phase-transition hook 单点同步这些**论文级的机制设计**（不是 demo 级）。这比纯创业团队项目（Paperclip / Multica）的工程严谨度更高。社区走查 subagent 独立印证：「**code style leans academic, but the README is notably restrained — no marketing hype**」（onlythinking.com 2026-07-08 深度评测，~2,535 字，唯一一篇实质性中文 review）。✅

**负面**：学术组项目的通病是**「论文/源码漂亮但社区/产品成熟度低」**——OpenOPC 6 周龄、1.3k stars、9 watchers、issue 几乎全是一个深度外部用户（wiselinpm）+ 维护者（CatJuly/cgycorey）在报。社区走查 subagent 硬数据裁决（§13）：**zero HN 帖（Algolia 搜 OpenOPC 602 fuzzy hit 全是 false positive——OpenIPC/OpenOrca/OpenPCR/OpenRPC/OpenAPC，零 HKUDS OpenOPC）/ zero Reddit 帖（搜到的 OpenOPC 是无关的工业 OPC Python2 工具）/ zero arXiv paper / zero 独立英文 review**。**社区真空程度超过 Multica（Multica 至少有 HN 低声量 + #815 16react 深度帖），接近 Avernet 的「源码可读、社区不可读」**。⚠️

> ⚠️ **关键校准**：OpenOPC **没有配套 arXiv paper**（社区走查 subagent 确认 arXiv `all:OpenOPC` / `ti:"OpenOPC"` / `ti:"personal AI company"` 全 0 命中）。这点与 LightRAG / RAG-Anything（有 arXiv preprint）不同——OpenOPC 是 **code-first 项目，无 paper 背书**。这对学术项目是异常信号（HKUDS 通常论文 + 代码双发），可能说明 OpenOPC 还在快速迭代未到写 paper 阶段，或 HKUDS 把它当工程探索非研究主线。无论哪种，**别拿「HKUDS 学术背景」当 paper 级背书**——OpenOPC 本身没 paper。

### 11.3 九垂直领域：demo cover 还是真落地？

README 列九垂直领域（AI Tech / 软件开发 / 金融投资 / 销售增长 / 内容媒体 / 行业助手 / 会计金融 / 品牌电商 / 教育培训）+ 三个 demo（Video Production / Investment Research / Game Prototype，YouTube + Drive）。

**判断**：⚠️ **更像 demo 驱动做内容，不是真落地九行业**——
- 没有行业-specific 的 role 模板 / playbook 库 / skill 包公开发布（只有 corporate profile 一个内置 org 架构）。
- 三个 demo 都是「内容生产」类（视频 / 研报 / 游戏原型），不是九行业的真实业务流程。
- talent templates 全部来自 `agency-agents`（致谢里明说），没有 OpenOPC 自己的行业 talent 库。
- 社区走查 subagent 印证：**零行业-specific 用户 review**（唯一深度中文 review onlythinking.com 只评测了三个 demo，无九行业落地证据）。

> ⚠️ **demo 真实性校准（onlythinking.com 独立印证）**：三个 demo 是 **end-to-end real outputs, not illustrations**（真实端到端跑出来的产物，非插画）——这是 onlythinking.com 评测的独立判断（与我源码层「真落地非 demo show」的判断一致）。但 **「demo 真实」≠「九行业真落地」**——demo 真实只证明编排引擎能跑通内容生产类任务，不证明九垂直领域都验证过。

**结论**：九垂直领域是**市场叙事**（说「我们能覆盖任何行业」），实际落地集中在**内容生产 + 软件开发**两个 HKUDS 擅长的方向。这无关对错（创业项目都这么讲故事），但**别把它当「九行业都验证过了」**。⚠️

### 11.4 商业模式

- **MIT license badge**（README 声明），但 ⚠️ **实际 repo 没有 LICENSE 文件**（GitHub API `license: null` + `https://raw.githubusercontent.com/HKUDS/OpenOPC/main/LICENSE` 返回 404 + repo 根目录 contents listing 无 LICENSE 文件）。**这是法律隐患**——按版权法默认 all-rights-reserved，badge 说 MIT 但无 LICENSE 文件 = 声明与实际不符。forkers 拿到的法律权利其实不明（commercial use 实际不被许可直到 LICENSE 文件被提交）。⚠️ **社区走查 subagent 独立印证**：onlythinking.com 评测也独立抓到「License badge self-labels MIT, but the repo root currently has no LICENSE file attached — actual terms are whatever's there when you fork」。**三源互证**（我 + subagent + onlythinking）——这不是 nitpick，是真实 due-diligence flag。Paperclip/Avernet/Multica 都有 LICENSE 文件，OpenOPC 缺失是工程疏忽。
- **无付费计划 / 无 hosted 版**（仓库无付费页），纯 OSS 学术项目。✅
- **Feishu/WeChat 群**（中文社区导向）+ 中英双语 README——**目标用户含中文开发者**。✅
- **与 HKUDS 其他项目的关系**：OpenOPC 致谢了 `HKUDS/nanobot`（skill-oriented agent design + `SKILL.md` 组织灵感来源）——**OpenOPC 承接 nanobot 的 agent framework 谱系**（AutoAgent → nanobot → OpenOPC），是 HKUDS 内部 agent framework 线的最新一代。✅

### 11.5 与 LightRAG 等 HKUDS 旗舰的关系

⚠️ LightRAG 是 HKUDS 最知名的项目（RAG 框架，社区广泛采用）。OpenOPC **不是 LightRAG 的延伸**——OpenOPC 是 agent 编排，LightRAG 是 RAG 检索，技术栈不重叠。但 OpenOPC 的 `markdown_memory.py` + `history_compactor.py` 暗示它可能未来接入 RAG 能力（memory 检索），这是 HKUDS 跨项目协同的潜在路径。**待社区走查 subagent 确认 LightRAG 是否被 OpenOPC 引用**（见 §13）。

---

## 12. 对 OPC 多 agent 编排的启示（最关键的一节）

对照 agents-remote PRD（角色 + 任务 + 看板第一期 / 圆桌第二期 / 长记忆后续）+ 已对齐决策（PRD §7/§8 + opc-product-discussion.md §5 编排老师拼图 + §9 编排平台分野）。

### 印证（我们方向正确）

1. **状态焊 work-item（phase enum）是正确方向**：OpenOPC 用 14 态 phase enum + 静态转换表 + 纯函数投影（kanban column / owner / runnability / verdict），**与 Paperclip 焊 issue + Multica 焊 GitHub issue 同品类但更工程化**。我们 PRD 第一期「任务 + 看板」方向被强印证——但 OpenOPC 给了我们**更进一步的工程范式**：把 task status 收敛成单一 phase enum（不是 status + 多 sub-state 字段并存），所有派生用纯函数投影。这比 Paperclip 的多字段并存更不易出 bug。✅
2. **agent 不能自标 done + review 闭环**：OpenOPC 的 `AWAITING_MANAGER_REVIEW` + `max_reworks: 10` + reviewer verdict（accept/rework/escalate）+ 超预算自动顶 human——与 PRD §7 决策点 2（agent 只能说「做完了请过目」）+ Paperclip executionPolicy 双阶段审批同源。OpenOPC 多了「review 超预算自动 escalate human」这条**防 manager 无限 rework worker 的保护**，值得吸收。✅
3. **混合持久（SQLite + 文件 + JSON + markdown）比全 PostgreSQL 轻**：OpenOPC 用 sync sqlite3 + 文件 comms + JSON evolution + markdown memory，**无 server 依赖**。与 PRD §7 决策点 4「任务记录先存本地文件」+ 我们 claude2 JSONL + relay 双缓冲同量级。**印证我们「先本地文件后数据库」的轻量化方向**——OpenOPC 的 SQLite 就是「本地文件之后的下一步」的参考形态。✅
4. **per-role session + external resume（claude --resume / codex thread resume）**：OpenOPC 的 `SeatExecutor` + `external_broker` 用 `external_resume_session_id` 续跑 claude_code（2026-08-07 commit 修了 #36 "keep claude_code resume across failed/cancelled runs"）——**与我们 claude2 的 `--resume` + relay 双缓冲几乎同构**。印证我们 claude2 runtime 的 resume 路径正确。✅
5. **blocker 不静默绕过（surface problems）**：OpenOPC 两级 escalate（团队内 blocking + 超权限 human）与 Paperclip「surface problems, don't silently fix」+ PRD「agent 遇阻停下来问」同源。✅
6. **risk 分级 auto-approve 是务实审批**：OpenOPC 的 `max_auto_approve_risk` knob（low/medium/high/critical）+ safe allowlist 自动放 + destructive 必 escalate + medium 走 LLM review——**比 Paperclip 的 executionPolicy 双阶段更细粒度**，与我们 `permissionMode=plan` + `can_use_tool` 审批卡可融合。✅

### 挑战 / 盲点（OpenOPC 没解决好的，我们要警惕 + 我们比它对的地方）

1. **OpenOPC 是「层级委派」范式，不是「圆桌」范式** ⚠️ **核心差异**：OpenOPC 的 Self-Run 是 **manager → delegate → child work item** 的层级委派（manager 拆活派给 leaf role），manager 五模式（execute/delegate/review/integrate/rework）都是**单向层级流转**。**它没有「多角色同台讨论」的圆桌概念**——MeetingRoom 存在但是「多 role 轮流发言达成 consensus」的结构化会议（带 turn runner + consensus 分析），**不是我们 PRD 第二期的「圆桌房间」（多角色平等同台 + 串行 turn + 沉默即成功 + claim 硬约束）**。OpenOPC 的 MeetingRoom 更接近「结构化决策会议」而非「持续在场的协作 room」。**我们 PRD 第二期圆桌不能从 OpenOPC 抄**——它的协作范式是层级不是圆桌。⚠️
2. **OpenOPC 没做 AX（Agent Experience）** ⚠️ **关键盲点**：OpenOPC 的协作是 work-item 驱动（delegation = 建 child work item，不是发消息），agent 间不共享 room——**所以它没遇到 Raft 戳穿的「房间为连续在场物种设计 vs agent turn-based」AX 难题**。OpenOPC 的「协作」是异步 work-item 流转 + comms 文件邮箱，**不是同步多 agent 同台**。这避开了 AX 难题（好），但也意味着**它没有 Raft 的 inbox pull / held draft / AX 四问这些感官设计**——一旦我们做圆桌，**OpenOPC 给不了参考**，仍得回 Raft 找。⚠️
3. **OpenOPC 做了组织记忆（playbook），我们刻意延后——谁对？** ⚠️ **最大分歧点**：见 §8.4 详细裁决。短答：**我们 PRD §8「不做共享记忆池」仍然对**——OpenOPC 用 ~150KB memory 层代码（employee_evolution + memory_manager + history_compactor）解这个问题，工程投入巨大，6 周龄无第三方验证「复利增长」承诺。**但 OpenOPC 给了我们「未来怎么做」的路径**——promote-from-private（不是共享 brain pool），recurring lessons 提升成 skill 形态（可挂载/继承/审计），specialist 边界仍在。**这避开了 Raft 反对的「共享 pool deletes specialists」陷阱**——是「组织记忆」的一个可信实现路径，**留作我们长记忆后续的参考**，不是第一期该背的包袱。✅⚠️
4. **OpenOPC 的 role 是 schema，employee 是 instance——与我们的「name > role」相反** ⚠️：OpenOPC 明确分离 role（schema，可被多 employee 实例化）+ employee（instance，带 experience_score），recruiter 按 experience_score 选最优 employee。**这是「role 为主」的模型**——与我们 PRD + opc-product-discussion.md §4「Name > Role」（name 承载历史，role 是 schema）**相反**。我们的「Noel」是带历史的 instance（Raft 哲学），OpenOPC 的「Engineer role + Alice employee」是 schema + instance 分离（OOP 哲学）。**两种模型各有道理**：OpenOPC 的 schema/instance 分离利于「换 employee 接管同一 role」（personnel 流动），我们的 name > role 利于「agent 累积协作史」（同事长期关系）。**我们不动**（已对齐 name > role），但理解 OpenOPC 的取舍——它更接近「企业 HR 系统」，我们更接近「同事关系网」。✅
5. **OpenOPC 工程严谨但社区真空** ⚠️：OpenOPC 的源码工程深度（phase 不变量测试 + attempt ledger + DFS 死锁检测）**远超 Paperclip/Multica**，但社区成熟度（1.3k stars / 9 watchers / issue 几乎一个深度用户）**接近 Avernet 的「源码可读、社区不可读」**。**这是「学术项目典型形态」**——论文/源码漂亮但没破圈。**OPC 启示**：我们既要做工程严谨（学 OpenOPC 的 phase enum + attempt ledger），也要避免社区真空（学 Paperclip 的社区运营 + watcher 真实信号），两条腿走。✅
6. **OpenOPC 缺 LICENSE 文件** ⚠️：MIT badge 但无 LICENSE 文件 = 法律隐患。**OPC 启示**：我们开源时 LICENSE 文件必须有（别犯 OpenOPC 这个低级错误）。✅
7. **OpenOPC 没解「多 agent 同台协议级硬约束」** ⚠️：我们 PRD §5 第二期圆桌列了四条协议级硬约束（沉默即成功 / 串行轮次队列 / claim 硬约束 / Drop vs Queue 明确），基于 Buzz + Raft 独立收敛 + Paperclip 1266 并发竞态 issue 反证。OpenOPC 的协作是异步 work-item 流转（非同步同台），**没解这四条**——它的「协调」靠 phase 状态机 + comms 文件邮箱，不靠「同台协议」。这进一步印证：**圆桌协议级硬约束是 OPC 第二期的独家设计**，OpenOPC / Paperclip / Multica 都没做（它们不做同步同台），我们仍以 Raft AX 为老师。✅

### 对 agents-remote 的核心 3 点

1. **抄「显式 phase enum + 静态转换表 + attempt ledger 防死循环」作第二期圆桌的编排引擎范式** ⭐ **最关键启示**：OpenOPC 的 14 态 phase enum + `ALLOWED_TRANSITIONS` 静态转换表 + `validate_transition` 强制 + attempt ledger（防 restart → crash → re-dispatch 死循环）+ phase-transition hook（单点同步多层状态）**是本批次最显式、最工程化的编排引擎**。Paperclip 1266 个并发竞态 issue 反证：没有这套显式状态机的编排产品多 agent 同台必踩坑。**我们 PRD 第二期圆桌的「圆桌房间」+ 第三期「团队（leader+成员）」应该把 OpenOPC 的 phase enum + attempt ledger 作核心参考**——不是照抄 14 态（OpenOPC 是层级委派，我们是圆桌），而是抄它的**「单一 phase + 静态转换表 + 纯函数投影 + attempt ledger 防死循环」方法论**。这比 Raft AX（感官设计）互补——**OpenOPC 给状态机骨架，Raft 给感官设计，两者拼起来是 OPC 圆桌的完整范式**。✅
2. **不抄「组织记忆 playbook」进第一期，但记下「promote-from-private」路径作长记忆后续参考**：见 §8.4 裁决。我们 PRD §8「不做共享记忆池」仍然对，OpenOPC 的 ~150KB memory 层代码是巨大工程投入，6 周龄无验证。**但 OpenOPC 的「playbook = recurring lessons（≥2 次）从 private profile promote 成 shared skill」机制避开了 Raft 反对的共享 pool 陷阱**——留作我们长记忆后续的参考路径（不是共享 brain pool，是 skill 形态的 promote）。✅⚠️
3. **学「risk 分级 + LLM review + safe allowlist」做务实审批**：OpenOPC 的 `max_auto_approve_risk` knob + safe allowlist 自动放 + destructive 必 escalate + medium 走 LLM review 后 auto-approve——比 Paperclip executionPolicy 双阶段更细粒度，比我们 `permissionMode=plan` + `can_use_tool` 更分级。**我们审批设计可融合 OpenOPC 的 risk 分级**（low/medium/high/critical 四档 + LLM review 兜底 medium），让「低风险自动放、高风险必问」成为默认行为，减少用户审批疲劳。✅

### 与 Paperclip/Multica/Raft 的差异化定位

| 维度 | OpenOPC | Paperclip | Multica | Raft |
|---|---|---|---|---|
| **品类** | 编排平台（层级委派） | 编排平台（层级树） | 编排平台（Squad leader） | 编排平台（圆桌 IM） |
| **状态焊点** | work-item phase enum + SQLite + employee profile | PostgreSQL issue 树 + agent 树 | GitHub issue | channel（共享对话）+ agent computer（私有记忆） |
| **协作范式** | manager → delegate → child work item（层级委派 + 6 模式 turn） | CEO → manager → reports（树状 + Heartbeat 短窗口） | Squad leader @mention members（浅层编排） | 圆桌讨论（共享 room + 串行 turn + 沉默即成功） |
| **编排引擎显式度** | ⭐ 最显式（14 态 FSM + 静态转换表 + attempt ledger + DFS 死锁检测） | 中等（issue 7 态 + executionPolicy，但无 FSM 转换表，1266 并发竞态 issue） | 弱（issue 状态机 + @mention 脆弱，#815 戳穿） | 中等（task 5 态 + claim 硬约束 + AX 感官设计） |
| **记忆模型** | 三层（private experience profile + shared playbook promote-from-private + project markdown） | issue 文档 + session resume（无独立记忆子系统） | issue 文档 + skills 注入 | per-agent workspace memory（不共享 brain） |
| **AX / 协议级硬约束** | 无（异步 work-item 流转，非同步同台） | 无（1266 并发竞态 issue 反证） | 无（@mention 脆弱） | ⭐ 独家（inbox pull / held draft / AX 四问 / claim 硬约束） |
| **角色模型** | role（schema）+ employee（instance）分离 | agent = role 一体（org chart 节点） | agent = 配置（非常驻） | name > role（name 承载历史） |
| **持久** | SQLite + 文件 comms + JSON evolution + markdown memory（混合） | 全 PostgreSQL（重 server 依赖） | GitHub issue（状态在 Git 平台） | workspace + agent computer（本地） |
| **工程严谨度** | ⭐ 高（不变量测试 + attempt ledger + 死锁检测，学术 backing） | 中（源码可读但 1266 竞态 issue） | 中（maintainer 在场但浅编排） | 高（AX 设计完整，但工程实现未公开） |
| **社区成熟度** | 低（1.3k stars / 9 watchers，社区真空，6 周龄） | ⭐ 高（77.6k stars / 380 watchers，3 Reddit 子版，B2B 真生产） | 中（45.6k stars / 160 watchers，中文团队主导） | 未知（闭源，无公开社区数据） |
| **开源 license** | MIT badge 但无 LICENSE 文件（法律隐患） | MIT（完整） | 非 Apache（禁第三方托管） | 闭源 |

**一句话定位差异**：OpenOPC 是**「学术严谨 + 工程扎实 + 社区真空 + 层级委派 + 组织记忆」**的编排平台——比 Paperclip 工程更严谨但社区更冷，比 Multica 编排更深但同样中文导向，比 Raft 状态机更显式但缺圆桌 + AX 感官设计。**它的独有价值是「最显式的编排引擎」（phase + attempt ledger + DAG），它的最大缺口是「没做同步同台圆桌 + AX」**——前者是 OPC 第二期该抄的，后者是 OPC 第二期该补 Raft 的。✅

### OpenOPC 在我们编排老师拼图（opc-product-discussion.md §5）里的定位

OpenOPC 应该**新增进 §5 编排老师拼图**（当前未列入），作为以下子能力的老师：

| 编排子能力 | 当前老师 | OpenOPC 补什么 |
|---|---|---|
| **任务状态机（执行流程）** | todos.dev + Avernet + Raft | ⭐ **OpenOPC 是最显式老师**（14 态 phase enum + 静态转换表 + attempt ledger 防死循环 + phase-transition hook 单点同步）——比 todos Plan→Build→Review 三阶段、Avernet 四阶段、Raft 五态都更工程化 |
| **任务分解 + 派活（层级委派）** | todos.dev + Raft | OpenOPC 的 manager 6 模式 turn 分类器（EXECUTE/DELEGATE/REVIEW/INTEGRATE/REWORK/REPORT）+ DAG 调度是层级委派的范本 |
| **审批门控（risk 分级）** | Raft（verification gate）+ cf-os（批量） | OpenOPC 的 risk 四档 + LLM review 兜底 medium + safe allowlist 是务实审批的补充 |
| **长记忆（组织记忆路径）** | todos.dev + Raft + Avernet（警示） | OpenOPC 的 promote-from-private（recurring lessons → shared skill）是「组织记忆」的可信实现路径参考（Avernet 警示仍对：别一上来做） |
| **层级 vs 圆桌** | Paperclip（层级）+ Avernet/Raft（圆桌） | OpenOPC 加进**层级**侧（与 Paperclip 同侧但工程更扎实） |

**OpenOPC 不补的子能力**（仍由原老师教）：
- AX（Agent Experience）→ Raft 独家（OpenOPC 无同步同台）
- agent 间通信媒介 → Avernet/Buzz/Raft（OpenOPC 是 work-item 流转 + comms 文件，非同步通信）
- 多 agent 角色分工（圆桌侧）→ Raft（OpenOPC 是层级委派）
- 执行隔离 → Superset/Raft（OpenOPC seat executor 偏轻）

**建议主 agent 把 OpenOPC 加进 `../design/opc-product-discussion.md` §5 拼图**（本调研不改讨论中枢，只提建议）——作为「任务状态机最显式老师」+「层级委派 + DAG 调度范本」，与 Paperclip（同品类但工程更弱）形成对照。⚠️（本调研边界：不改 opc-product-discussion.md，只提建议）

---

## 13. 证据分级与来源 + 社区信号

| 证据 | 分级 | 来源 |
|---|---|---|
| 14 态 phase enum + ALLOWED_TRANSITIONS 静态转换表 + validate_transition + universal/recovery exits | ✅ | 源码 `opc/layer2_organization/phase.py`（22KB，行 1-450+ 读全） |
| attempt ledger（ATTEMPT_CRASH_STREAK_LIMIT=3 / INTERRUPTED_STREAK_LIMIT=5）防 issue #10 死循环 | ✅ | 源码 `phase.py` 行 350-420 + attempt_ledger_dispatch_block_reason |
| 6 模式 TurnMode + infer_turn_mode 纯函数优先级派生 | ✅ | 源码 `opc/layer2_organization/turn_mode.py`（6KB 读全） |
| TaskGraphScheduler DAG 调度（asyncio.gather 并行 + 死锁 BLOCKED 保护） | ✅ | 源码 `opc/layer2_organization/task_graph.py`（5.6KB 读全） |
| EscalationEngine 三 type（INFO/DECISION/RISK）+ 300s 超时 default_action | ✅ | 源码 `opc/layer2_organization/escalation.py`（5.3KB 读全） |
| EmployeeEvolutionManager per-role 归因 + 11 类字段 + LEARNED_SKILL_THRESHOLD=2 playbook promote | ✅ | 源码 `opc/layer5_memory/employee_evolution.py`（47KB，行 1-150 读 + grep 全结构） |
| CompanyRecruiter experience_score 选 employee + experience_mode template_only/with_experience | ✅ | 源码 `opc/layer2_organization/recruiter.py`（66KB grep 结构 + 行 1-50 注释） |
| SeatExecutor protocol（prepare_seat/run_turn/checkpoint/interrupt/shutdown）+ external_resume_session_id | ✅ | 源码 `opc/layer2_organization/seat_executor.py`（5.5KB 读全） |
| transition_work_item 单一权威入口 + phase-transition hook 链 + attempt settlement | ✅ | 源码 `opc/layer2_organization/work_item_transition.py` grep + 行 1-50 注释 |
| CommunicationManager blocking message + MeetingRoom + DFS _find_wait_cycles 死锁检测 | ✅ | 源码 `opc/layer2_organization/communication.py`（111KB grep + tail 死锁检测） |
| collaboration_policy 协作四工具（send_dm/broadcast_issue/start_meeting/ask_peer_and_wait）+ write_scope ownership contract | ✅ | 源码 `opc/layer2_organization/collaboration_policy.py`（8.9KB 读全） |
| company_runtime_identity 锚 root session + suspend checkpoint | ✅ | 源码 `opc/layer2_organization/company_runtime_identity.py`（15KB 行 1-80） |
| SQLite store（sync sqlite3 非 aiosqlite）+ 混合持久（.opc-comms 文件 + employee_evolution.json + memory markdown） | ✅ | 源码 `opc/database/store.py`（352KB header 读）+ README Quick Start 路径表 |
| 九垂直领域 + 3 demo + Self-Built/Run/Grown 三段 + Company Mode vs Task Mode | ✅ | README 全文（38KB 英文 + 35KB 中文，行 1-800 读全） |
| News 2026-07-14 session 续跑 / 07-13 Office UI / 07-08 smarter approvals | ✅ | README News 节 |
| 七层架构（layer0_interaction → layer6_observability）+ 三核心机制（collaboration/communication/self-evolution） | ✅ | README HTML 注释（被注释掉但仍在 README 源里）+ `opc/` 目录结构直证 |
| risk 分级 max_auto_approve_risk + tool_first_use_approval + safe allowlist + LLM review medium | ✅ | README Configuration 节 autonomy 段 |
| 11 messaging 通道（Feishu/Telegram/Slack/Discord/DingTalk/Email/Matrix/QQ/WhatsApp/Mochat） | ✅ | README Configuration 通道表 |
| 1266 stars / 9 watchers / 215 forks / created 2026-07-01 / 12 open issues / owner HKUDS org | ✅ | GitHub API `/repos/HKUDS/OpenOPC` |
| contributors：LZH-YS1998 58 commits / cgycorey 6 / CatJuly 5 / chaohuang-ai 2 / Zjt127128 1（3 人核心团队） | ✅ | GitHub API `/contributors` |
| open issues（#38 MCP 配置 / #37 attachment / #36 claude_code resume / #35 人工评审没反应 / #22 validation gate 等） | ✅ | GitHub API `/issues?state=open` |
| closed issues 真实使用痛点（#5 wiselinpm「两个任务都没成功」/ #6 性能瓶颈 / #8 重启不恢复 / #10 CommsReactivationSweeper 死循环 / #11 状态刷新不对齐） | ✅ | GitHub API `/issues?state=closed` |
| **LICENSE 文件缺失（MIT badge 但 repo 无 LICENSE 文件，GitHub API license=null + raw 404）** | ✅ | GitHub API `/license` + raw LICENSE 文件 |
| HKUDS org 项目谱系（LightRAG 38,815 旗舰 / nanobot 46,908 / CLI-Anything 46,943 / DeepTutor 35,253 / Vibe-Trading 30,721 / RAG-Anything 22,887 / AI-Trader 21,325 / DeepCode 16,341 / OpenHarness 15,337 / AutoAgent 9,736 / ClawWork 8,344 / OpenSpace 7,372 / ClawTeam 5,485 / **OpenOPC 1,266** / CatchMe 468） | ✅ | GitHub API `/orgs/HKUDS/repos?sort=stars`（91 repos / 13,086 followers） |
| HKUDS = Prof. Chao Huang（黄超）港大 CS/AI&Data Science 助理教授 + Data Intelligence Lab 主任 + LightRAG 团队；OpenOPC 承接 AutoAgent → nanobot → OpenOPC agent framework 谱系 | ✅ | 社区走查 subagent（lab homepage `sites.google.com/view/chaoh` + HKU IDS profile + HKUDS org API） |
| HN/Reddit/中文社区讨论 OpenOPC = **社区真空**（zero HN 帖 602 fuzzy 全 false positive / zero Reddit 帖搜到的是无关工业 OPC 工具 / zero 掘金 V2EX 知乎 即刻 / 唯一深度中文 review onlythinking.com 2026-07-08 + 唯一英文教程 benihkode.web.id 2026-07-12） | ✅ | 社区走查 subagent（HN Algolia + Reddit 搜索 + 中文社区搜索 + onlythinking.com 全文 + benihkode.web.id 全文） |
| arXiv OpenOPC 配套 paper = **zero**（code-first，无 paper 背书，与 LightRAG/RAG-Anything 有 preprint 不同） | ✅ | 社区走查 subagent（arXiv API `all:OpenOPC` / `ti:"OpenOPC"` / `ti:"personal AI company"` 全 0 命中） |
| 九垂直领域「demo cover 而非真落地」判断 | ⚠️ | PM 推断（无行业-specific talent 库公开发布 + 3 demo 都内容生产类） |
| 「always delivers smarter」playbook 复利增长未经验证 | ⚠️ | PM 推断（6 周龄 + 社区真空 + distil 依赖 LLM 质量） |
| OpenOPC 该进 opc-product-discussion.md §5 编排老师拼图（任务状态机最显式老师） | ⚠️ | PM 推断（对照本批次 10 个参考产品的编排引擎显式度） |

### 社区信号（本调研范围内诚实记录，深度走查另起 `pm-openopc-community.md`）

> OpenOPC 6 周龄（2026-07-01 创建）+ 学术组项目 + Feishu/WeChat 群（中文社区导向）——**社区信号本身是判断其成熟度的关键指标**。本调研启动了独立的社区走查 subagent 拉 HN/Reddit/掘金/V2EX/知乎/arXiv/HKUDS 背景，结果如下（硬数据，非推断）：

#### HN / Reddit / arXiv（英文 + 学术圈）

- **HN：zero 帖**。Algolia 搜 `OpenOPC` 返回 602 fuzzy hit **全是 false positive**——OpenIPC（IP 摄像头固件，363pts）/ OpenOrca / OpenPCR（生物科技）/ OpenRPC / OpenAPC，**零 HKUDS OpenOPC**。HKUDS 作为 org 也无 HN 首页存在。✅（社区真空硬证据）
- **Reddit：zero 帖**。搜到的 OpenOPC 命中是**无关的 legacy 项目**（工业 OPC Python2 / 32-bit process control 工具，r/learnpython / r/Python）。✅（社区真空硬证据）
- **arXiv：zero paper**。`all:OpenOPC` / `ti:"OpenOPC"` / `ti:"personal AI company"` / `all:"personal AI company"` 全 0 命中（HTTP 200 feed valid，已确认 redirect-following curl）。**OpenOPC 是 code-first 项目，无 paper 背书**——与 LightRAG/RAG-Anything（有 arXiv preprint）不同。✅⚠️

#### 中文社区（掘金/V2EX/知乎/即刻/Feishu/WeChat）

- **掘金/V2EX/知乎/即刻：zero OpenOPC-specific 讨论**。✅（社区真空硬证据）
- **Feishu/WeChat 群内容封闭**（不公开、不被搜索引擎索引）——无法核实群内讨论质量。⚠️
- **唯一实质性中文 review**：[onlythinking.com 2026-07-08 深度评测](https://onlythinking.com/post/2026-07-08-ai-openopc-hkuds-ai-native-company-framework/)（~2,535 字，发布于 OpenOPC 创建后 7 天）。关键引用（中文原文 + 英译）：
  - 组织可信度：「HKUDS's same team has shipped many high-star agent-framework projects; **code style leans academic, but the README is notably restrained — no marketing hype**」（HKUDS 同一团队已交付多个高 star agent-framework 项目；**代码风格偏学术，但 README 明显克制——无营销炒作**）。
  - demo 真实性：「Three demos — Video Production, VC Investment Pack, Game Prototype — are **end-to-end real outputs, not illustrations**」（三个 demo 是端到端真实产物，非插画）。
  - license 问题：「License badge self-labels MIT, **but the repo root currently has no LICENSE file attached** — actual terms are whatever's there when you fork」（**与我 + subagent 三源互证 LICENSE 缺失**）。
  - 正面评价：「OpenOPC's value is giving a **complete engineering implementation**: Self-Built has a Recruiter Agent, Self-Run has a state machine + Kanban, Self-Grown has experience profiles + Playbook — all three links chain together, **not a single-point concept**」（OpenOPC 的价值是给出**完整工程实现**：Self-Built 有 Recruiter Agent / Self-Run 有状态机+看板 / Self-Grown 有 experience profile+Playbook——三段全链起来，**非单点概念**）。**这条独立印证我源码层「真落地非 demo show」的判断**（§7）。
  - 审慎保留：「Whether the org abstraction survives rising project complexity, and whether Self-Grown memory truly transfers cross-project — if these aren't solved, 'AI-native company' is still a marketing concept」（组织抽象能否扛住项目复杂度上升、Self-Grown 记忆能否真跨项目迁移——这俩不解决，「AI-native company」仍是营销概念）。**这条印证我 §8.3「playbook 复利增长未经验证」的判断**。
  - **zero 处对比 Paperclip**（onlythinking 全文不提 Paperclip）——OpenOPC 在中文圈没被拿来和 Paperclip 对照。
- **[benihkode.web.id 2026-07-12 英文教程](https://benihkode.web.id/blog/getting-started-with-openopc/)**：标准 Getting Started walkthrough，无 install pain 报告（除提示 `--no-external-agent-preflight` 逃生口 + external-agent Task Mode 需预装 CLI）。无 bug 抱怨。
- **中文 issue #44（"人工评审没反应" = manual review has no response，2026-08-09）**：唯一可见中文 bug 报告，单用户报 manual review 步骤不触发——印证 review 闭环机制在真机有边缘 case（与我 §9.3 review 闭环源码层判断互补：机制设计在，但实战有 bug）。

#### Twitter/X / LinkedIn / YouTube（传播面）

- **Chao Huang（HKUDS 负责人）官宣 tweet 存在**（`x.com/huang_chao4969/status/2073430710740754598`，HTTP 200），但 **无 viral thread**（无转发爆炸）。
- **LinkedIn**：James Chang promo post（标准 amplification，非分析）。
- **YouTube**：一个 Short 确认存活（`youtube.com/shorts/R_0R86bVw7c`「OpenOPC: Build Your Own AI Company of Agents」，≤60s teaser 非 walkthrough）。**3 个 demo 视频不是独立 YouTube 上传**，是嵌在 repo README 作为 canonical proof-of-output（per onlythinking 它们是真实端到端 run）。view/comment count 取不到（YouTube 阻挡 WebFetch + JS-rendered）。

#### GitHub 硬数据信号（community reality）

- **1266 stars / 9 watchers（star:watcher ≈ 140:1，watcher 绝对值 9 远低于 Paperclip 380 / Multica 160）**——star 可能因 HKUDS org 流量倾斜（HKUDS 有 46.9k star 项目带流量），但 watcher 绝对值低 = **真关注的人少**。⚠️
- **215 forks 但全是 default description 的「占位 fork」**（forkers 列表 15 个全是 `OpenOPC: Build Your Personal AI-Native Company...` 默认描述）——**无 active 改造 fork**，fork 数虚高（HKUDS org 流量 + 学术好奇 fork）。⚠️
- **issues 作者高度集中**：open 12 个里 CatJuly（维护者）/ cgycorey（维护者）占一半，外部作者 wiselinpm（5 个 closed）+ rj-wudan + AhmadHassan-BTed + joylike88 + Tryboy869 各 1-2 个。**真实外部用户约 5-7 人**（wiselinpm 是唯一的深度外部用户，报了 5 个真实使用痛点 #5/#6/#8/#11/#12）。✅
- **3 人核心团队**（LZH-YS1998 58 commits 主力 / cgycorey 6 / CatJuly 5）——**学术组小团队**，非创业公司。✅
- **commit 频率高**（最近 30 commit 跨 2026-07-31 到 2026-08-11，几乎每天都有）——**项目活跃**（74 commits in 6 weeks + 16 merged PRs）。✅

#### 社区成熟度最终判断（对照 Paperclip / Avernet / Multica）

| 维度 | OpenOPC（6 周龄学术） | Paperclip（社区真） | Avernet（社区真空） | Multica（中文主导低英文） |
|---|---|---|---|---|
| stars / watchers | **1266 / 9**（star:watcher 140:1） | 77,593 / 380 | 453 / 2 | 45,600 / 160 |
| HN 帖 | **zero**（602 fuzzy 全 false positive） | 真实成本吐槽 | zero | 低声量 |
| Reddit | **zero**（搜到的是无关工业 OPC 工具） | 3 个独立子版 | zero | 无 |
| 独立博客 | **1 篇深度中文**（onlythinking，独立印证源码判断）+ 1 篇英文教程 | 3 篇独立（contabo/flowtivity/zeabur） | zero | 无 |
| arXiv paper | **zero**（code-first） | 无（创业项目） | 无 | 无 |
| 外部 issue 作者 | **1 深度用户**（wiselinpm 5 issue）+ 4-6 浅用户 | 高度分散（adammeghji/arthurfromtahiti 等） | 90%+ 内部自产自销 | B2B 真生产 + 官方回应 |
| 社区形态 | **学术 R&D + 社区真空 + 1 深度用户** | 源码可读 + 社区能见度高 + 外部参与真实 | 源码可读、社区不可读 | 中文团队主导、英文圈低能见度、GitHub 内部高活跃 |

**最终裁决**：OpenOPC 是**「真学术 R&D（HKUDS LightRAG 团队）+ 真工程严谨（74 commits / 16 PR / 不变量测试）+ 社区真空（6 周龄 zero HN/Reddit/arXiv）+ 1 深度中文 review 独立印证源码判断 + 1 深度外部用户真实踩坑」**的项目。**社区形态介于 Avernet（社区真空）和 Multica 早期（1-2 深度用户）之间，但工程深度远超两者、接近 Paperclip**。与 Avernet 不同的是：OpenOPC 的「源码可读」有**独立中文 review（onlythinking）第三方印证**（Avernet 零独立 review），所以**机制判断可信度比 Avernet 高一档**——但仍属「pre-traction，值得密切跟踪但尚未 battle-tested」。✅⚠️

**对 OPC 社区运营的启示**（呼应 pm-avernet-community.md / pm-paperclip-community.md 的社区运营教训）：
1. **OpenOPC 是「学术项目社区真空」的典型**——HKUDS 学术 backing 带来工程严谨但没带来社区（学术组不擅长社区运营）。OPC 是个人项目，**别重蹈「重代码轻社区」覆辙**——Paperclip 77.6k stars 不是因为代码最好，是因为社区运营 + watcher 真实信号 + 外部 issue 真实参与。
2. **1 深度用户（wiselinpm）+ 1 独立中文 review（onlythinking）是早期项目最真实的信号**——比 1266 stars 可信。OPC 自己的社区运营要盯「深度用户数 + 独立 review 数」，不只追 star。
3. **zero LICENSE 文件是 due-diligence flag**——OpenOPC 犯了这个低级错误，OPC 开源时必须有 LICENSE 文件（别 badge 了事）。

---

## 14. 与 Paperclip 的核心差异（用户点名的对照）

用户在任务里明确要求对比 OpenOPC vs Paperclip（都做「agent 组公司」）。差异如下：

### OpenOPC 比 Paperclip 多的

1. **Self-Grown 学习层**：Paperclip 靠 issue 树 + session resume + 文档涌现长记忆（无独立记忆子系统），OpenOPC 有显式的三层记忆（private experience profile + shared playbook promote-from-private + project markdown）+ per-role feedback 归因。✅（但 OpenOPC 的 Self-Grown 营销话术超前于验证，见 §8.3）
2. **显式编排引擎**：OpenOPC 14 态 phase enum + 静态转换表 + attempt ledger 防死循环 + DFS 死锁检测——Paperclip 只有 issue 7 态 status（无 FSM 转换表，1266 个并发竞态 issue）。**OpenOPC 工程深度更高**。✅
3. **学术 backing**：HKUDS 是港大实验室，OpenOPC 源码有论文级严谨度（不变量测试 + 显式状态机）——Paperclip 是 @dotta 个人项目（pseudonymous）。✅
4. **6 模式 turn 分类器**：OpenOPC 的 manager 6 模式（execute/delegate/review/integrate/rework/report）按 work item state 纯函数派生——Paperclip 的 agent 靠 prompt + skill 自己判断该干啥（脆弱）。✅
5. **Office UI（Phaser 像素动画）**：OpenOPC 的 Office 页用 Phaser 渲染像素小人 office（每个 role 显示 status/task/tool/seat）——Paperclip 是传统 dashboard。**UI 形态更生动**（但实用性见仁见智）。✅
6. **11 messaging 通道**：OpenOPC 接 Feishu/Telegram/Slack/Discord/DingTalk/Email/Matrix/QQ/WhatsApp/Mochat——Paperclip 主要靠 Inbox + WebSocket 事件。**OpenOPC 通道集成更广**。✅

### OpenOPC 比 Paperclip 少的

1. **PostgreSQL 状态焊的成熟度**：Paperclip 全 PostgreSQL（事务一致性 + 完整 schema），OpenOPC 混合持久（SQLite + 文件 + JSON + markdown，无 server 依赖但一致性弱）——**Paperclip 数据层更重但更成熟**。✅
2. **Heartbeat 短窗口调度**：Paperclip 的 Heartbeat（4 唤醒原因 + fat/thin payload + wakeup coalescing + Wakeup Coordinator）是成熟的短窗口调度——OpenOPC 的 dispatcher + reactivation sweeper 机制不同（更偏重 crash recovery）。**Paperclip 调度更成熟**。✅
3. **executionPolicy 双阶段审批**：Paperclip 的 review + approval 双 stage 链 + 强制决策评论 + `returnAssignee` 退回——OpenOPC 的 review 是 phase 状态机的一部分（AWAITING_MANAGER_REVIEW + max_reworks + reviewer verdict），**两者各有千秋**（Paperclip 更结构化，OpenOPC 更显式状态机）。✅⚠️
4. **预算三级（company/agent/project）+ Costs 拆账**：Paperclip 有完整的三级预算 + 软告警 + 硬顶 + Costs 页拆账——OpenOPC 有 cost tracking（layer6_observability）但**无显式三级预算 + 硬顶暂停机制**（README 未提）。**Paperclip 成本治理更成熟**。✅
5. **公司模板库做分发**：Paperclip 的 `paperclipai/companies`（16 公司 / 440 agent / 500 skill）+ `npx companies.sh add` 一键导入——OpenOPC 的 `.opcpkg` 包导入导出 + market presets（但规模小，致谢 agency-agents 提供全部 talent）。**Paperclip 生态分发更成熟**。✅
6. **MCP ask-first + 60 分钟过期 + sandbox allowlist**：Paperclip 的 MCP 工具治理更细——OpenOPC 有 MCP servers 支持 + risk 分级，但**无显式的「签名调用一次 + 过期 + allowlist 限被攻陷 CLI 调用面」三件套**。**Paperclip MCP 治理更细**。✅
7. **社区成熟度**：Paperclip 77.6k stars / 380 watchers / 3 Reddit 子版 / B2B 真生产采用——OpenOPC 1.3k stars / 9 watchers / 社区真空。**Paperclip 社区远比 OpenOPC 成熟**。✅

### 一句话差异总结

**OpenOPC = 学术严谨 + 工程显式（编排引擎）+ 组织记忆（playbook）+ 社区真空**；**Paperclip = 创业激进 + 社区成熟（77.6k stars）+ 成本治理 + Heartbeat 短窗口 + 营销话术被戳穿**。**OpenOPC 工程深度更高（编排引擎）但社区更冷，Paperclip 社区更热但工程有 1266 个并发竞态 issue**。对 OPC 的启示：**学 OpenOPC 的编排引擎（phase + attempt ledger + DAG）+ 学 Paperclip 的成本治理 + 社区运营**，两者各取所长。✅

---

> **调研员总结（给主 agent 的简报）**：
> 1. **编排引擎成熟度**：真落地（非 demo）——14 态 phase enum + 静态转换表 + attempt ledger 防死循环 + DFS 死锁检测 + 6 模式 turn 分类器 + DAG 调度，源码层有不变量测试，工程深度远超 Paperclip/Multica。关键证据：`phase.py` 行 200-420（转换表 + attempt ledger）+ `turn_mode.py` 全文 + `task_graph.py` 全文。
> 2. **Self-Grown 组织记忆机制可信度**：机制可信（per-role 归因 + promote-from-private 是 Raft 反对的「共享 pool」的避坑路径），但「always delivers smarter」是营销话术超前于验证（6 周龄 + 社区真空 + distil 依赖 LLM 质量）。不推翻我们 PRD §8「不做共享记忆池」——OpenOPC 用 ~150KB memory 层代码解这个问题，是巨大工程投入，留作我们长记忆后续参考路径。
> 3. **对 OPC 最有价值的 3 个启示**：① 抄 OpenOPC 的「显式 phase enum + 静态转换表 + attempt ledger 防死循环」作第二期圆桌的编排引擎范式（与 Raft AX 感官设计互补——OpenOPC 给状态机骨架，Raft 给感官设计）；② 不抄组织记忆 playbook 进第一期（PRD §8 仍对），但记下 promote-from-private 路径作长记忆后续参考；③ 学 risk 分级（low/medium/high/critical + LLM review 兜底 medium）做务实审批。
> 4. **work-item 状态机该成为我们第二期圆桌核心参考**：应该——OpenOPC 的 14 态 + 转换表 + attempt ledger 是本批次最显式的编排引擎，Paperclip 1266 并发竞态 issue 反证没有这套显式状态机的编排产品多 agent 同台必踩坑。但**不照抄 14 态**（OpenOPC 是层级委派，我们是圆桌），抄它的**方法论**（单一 phase + 静态转换表 + 纯函数投影 + attempt ledger）。
> 5. **与 Paperclip/Multica/Raft 差异化定位**：OpenOPC 是「学术严谨 + 工程显式 + 组织记忆 + 社区真空 + 层级委派」的编排平台——比 Paperclip 工程更严谨但社区更冷，比 Multica 编排更深但同样中文导向，比 Raft 状态机更显式但缺圆桌 + AX。**独有价值 = 最显式编排引擎；最大缺口 = 没做同步同台圆桌 + AX**。
> 6. **HKUDS 学术背景对持续性的影响**：HKUDS 是多产学术 org（旗舰 LightRAG + 一堆 30k+ star 爆款），OpenOPC 1.3k stars（6 周龄）处于他们谱系低端，更像「学术组的 agent 方向探索」非旗舰。**带来工程严谨度（论文级机制设计）但也带来社区真空（学术项目通病）**。3 人核心团队（LZH-YS1998 主力）活跃度高（每天都有 commit），短期会持续投入，但是否破圈待观察。**别把它当旗舰对待，但也别低估其工程价值**——编排引擎值得认真学。
