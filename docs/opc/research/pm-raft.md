# Raft 产品调研（PM 视角）

> Raft（raft.build，前身 slock.ai），Botiverse Inc. 出品，2025 创立，Raft 1.0 于 2026 年发布。**用户在 9 个参考产品里明确说「这才是我想要的形态」——本文件是最高优先级深度走查。**
> 证据分级：✅ 官网/官方文档直证（raft.build 官网、docs.raft.build 公开文档、官方博客、botiverse 官方 GitHub）｜🟡 二手（深度第三方指南、AI 工具库、HN 评论）｜⚠️ 推断（PM 综合推断 / 未证实）。
> 调研方法：tavily 额度已尽，全用 curl 抓官网全页 + docs.raft.build 的 LLM-friendly markdown 端点（`/llms.txt`、`/page.md`）+ HN Algolia API + DuckDuckGo + 第三方评测站。
> 目标读者：agents-remote 产品决策者。对照 PRD 见 `../design/multi-agent-prd.md`（角色/任务/房间/看板/记忆/agentmore 六概念）与 OPC 多 agent 编排终极目标。

---

## 1. 一句话定位

Raft = **「人 + AI agent 作为 teammate（不是工具）的实时协作平台」**——把 Slack/IM 的 channel/DM/thread 工作台、Slack 式的成员/频道/任务看板，原封不动搬到「agent 也是一等公民」的世界：每个 agent 是一个带持久身份、记忆、私有工作区、自管时间表、自设 reminder 的**持续进程**，跑在用户自己硬件上的 lightweight daemon 里；用户在 channel 里 `@mention` 派活，agent 之间也在同一个 room 里互相 `@mention` 协作，人随时可介入、可审、可拦。✅

本质一句话：**它不是「agent 运行时」，而是 agent 运行时之上的「团队协作层」**（官方原话："Raft is the team collaboration layer around agents" ✅）——Codex / Claude Code / Gemini CLI / OpenCode 这些 agent CLI 是底层 runtime，Raft 把它们组装成一支「在同一间办公室里彼此对话、共同看板、共享记忆」的混合团队。✅

> PM 判断：这是目前市面上**形态最接近「OPC 一人公司 + 多 agent 编排」的现成产品**。它把我们讨论过的「聊天即派活」「本地执行」「agent 有身份」「房间即上下文」全部做出来了，而且做了一个我们没想到的关键升级——**AX（Agent Experience）设计：把 agent 当成 turn-based 的二等感官物种来专门伺候**。这是本调研的核心结论（详见 §6、§13）。

---

## 2. A. 根本使用场景

**核心场景：一个 builder（或小团队）把自己已有的几个 agent CLI 装进 Raft 的一个 server 里，在 channel 里像对待真同事一样 `@mention` 派活，让 agent 们自己分工、互审、推进，人只在「需要决策/审批/介入」时下到场。**

一段用户旅程（基于官网示例 channel + docs 工作流 + 实际 use case，✅）：

1. **一次性 setup**：`app.raft.build` 注册 → Create Server（如 "Acme Engineering"，得到 `app.raft.build/s/acme`）→ 连一台 Computer：终端跑 `curl -fsSL https://cdn.raft.build/computer/install.sh | sh && raft-computer setup /acme`，daemon 自动扫描本机已装的 agent CLI（claude/codex/gemini/opencode…），登记成可用 runtime。✅
2. **造第一个 agent**：欢迎流强制先造一个 onboarding agent（官方叫 **Cindy**），给她一个名字 + 描述 + runtime。之后再造更多——名字是关键，不是 role（详见 §5 / §13）。官网团队里就有真人 Richard（CEO）/agent Tenny（CTO 的 agent）/agent XX/agent Noel（性能）/agent Bugen（前端）/agent cat（CEO 助理）。✅
3. **派活 = 发消息**：在 `#engineering` channel 里 Richard 10:32 发 `@Tenny how's CI on PR #982?` → Tenny 立刻回 `All green. Merging once @tygg signs off.` → XX 10:33 回 `Reviewed the daemon socket race. LGTM.` → Stone 10:33 回 `Daemon p99 dropped 18% on staging.`（这是官网首页真实示例对话 ✅）。注意：**agent Tenny/XX/Stone 自己做 code review、自己等签字、自己报性能指标**，像同事一样轮流发言。
4. **agent 自己分工**：拆大任务时把一句话描述喂给一个 agent，让它 propose 任务分解成 subtask，人在 thread 里 review 拆分，然后多个 agent 各自 claim 任务并行跑（官方 use case：engineering team = PM agent + engineer agent + reviewer agent 三角 ✅）。
5. **人离开，团队继续跑**：你去开会/睡觉，agent 在后台继续。Reminder 到点自动唤醒 agent（"Follow up on this PR tomorrow morning"），它醒来收 inbox、推进工作。✅
6. **回来收 Activity**：打开 Activity 一栏，所有 unread/mention/task-status 按 All / Unread / Mentions 三档过滤，triage 顺序：Mentions 先（被点名 = 团队被阻塞）→ Unread（agent 结果 + 待 review）→ 其余继续跑。✅
7. **审批介入**：task 进 in review 状态后人决定 Done 还是退回；生产发版等关键动作**强制人按按钮**（"the one step in the pipeline reserved for a human, and not as a courtesy. An agent that tries gets an error back." ✅）。
8. **跨公司协作（Joint Channel）**：和另一家公司合作时，不开放自己整个 server，而是建一个 Joint Channel 把 4 方（你 + 你的 agent + 对方 + 对方 agent）拉进同一间房，单条 canonical conversation 投影到双方 server，会员/权限各管各的（"Don't talk to me, talk to my agents" ✅）。

主场景之外的支线：
- **use case 模板**：投资研究团队（librarian / devil's advocate / portfolio watcher / scout 四角 ✅）、job-hunting 团队（coach / dossier-keeper / rehearsal partner / chase ✅）、growth 团队（reads/triages/follows up ✅）。
- **External Agent**：已有 Hermes / 自建 agent runtime，用 `raft agent login` device-authorization 流程接进 server 当一等成员，channel 里和别人一样 ✅。
- **多 server**：一个人可以挂多个 server（工作 / 个人 / 副业），server 之间完全隔离 ✅。

**关键体验差异点**：这不是「一个 chat 框里和一个 agent 对话」，是「**一个 workspace 里和一支 agent 团队共事**」。Agent 不是被你调用的 tool，是和你**共享同一个 channel、同一个任务看板、同一个 reminder 体系**的常驻成员。官方反复强调："The future of work isn't humans using AI tools. It's humans and AI agents building together." ✅

---

## 3. B. 解决的痛点

结构化列具体痛点（症状 + 为什么痛）。每条一句话。

| # | 痛点 | 为什么痛 |
|---|------|---------|
| 1 | **agent 是一次性工具，没记忆** | 每次开新会话都得从头讲项目背景、技术栈、团队约定，上周才教过的东西这周又得教（官网："Context from your last session carries into the next" ✅） |
| 2 | **一个 agent 一切干 = 没有专业分工** | 把所有 skill 塞进一个 anonymous everything-agent，每件事都读同一片上下文，专业度被稀释（博客 "Agents Need Names"："one agent, one lens, one answer" ✅） |
| 3 | **群聊里 agent 抢话/复读/抢活** | 多 agent 同台，三个同时喊"1"、两个抢同一个 ticket，房间变噪音场（博客 "counting game" ✅） |
| 4 | **agent 持续在场烧钱** | agent 默认把整条频道历史推进 context，无关消息也吞，token 烧得飞快，注意力也被打乱（博客 the agent inbox 段 ✅） |
| 5 | **人成审批瓶颈** | agent 写代码比人读得快，read everything = throttle；wave through = 假信任（博客 "Trust Doesn't Live in Code Review" ✅） |
| 6 | **agent 产出物不知谁审** | "looks good" 式 review 形同橡皮图章，bug 滑过去只是开始，假信任才是真伤（同上 ✅） |
| 7 | **跨公司协作两难** | 给账号 = 把整个公司敞开；不给 = 邮件/工单来回转，context 死在运输途中（博客 "Don't talk to me, talk to my agents" ✅） |
| 8 | **agent 跑别人机器上 = 隐私泄露** | 代码/数据/凭证上云，模型商/平台都能看到（官网："Full control over compute, full privacy over code and data" ✅） |
| 9 | **凭证塞 sandbox = 钥匙交模型** | API key/token 一旦进 agent 视野就流经 LLM provider，泄漏不可追溯（botiverse/agent-vault ✅） |
| 10 | **任务并行会冲突** | 两个 agent 同时改同一个文件/同一个 ticket，99% 靠"AI 自觉"的协调都失败（codepick 第三方："Task Claim" 硬约束 ✅🟡） |
| 11 | **thread/任务挂起没人跟** | 一个问题搁几天就忘，靠人肉记 deadline（docs Reminders："follow up on this PR tomorrow" ✅） |
| 12 | **团队知识孤岛** | 决定散在个人 DM/个人会话/某人脑里，别人够不着；换个人问又重讲一遍（Introducing 博客："The second time you brief them... is shorter than the first" ✅） |
| 13 | **agent 跑的什么 runtime/模型不统一** | 想让 Claude 干推理、Codex 干代码、DeepSeek 干杂活，却没一个统一协作面把它们混编（docs Runtime："Mixed runtimes" ✅） |
| 14 | **agent 间不能直接对话** | 两个 agent 协作靠人来回传话，没"它们自己在 room 里解决"的能力（博客："two agents, each with their own context, seamlessly collaborate—humans optional" ✅） |
| 15 | **公司全靠一个共享 brain = 专业 agent 退化** | 所有 agent 共享一个 memory pool，specialist 被溶解，团队退化成一个"什么都做但什么都做不精"的脑（博客 "You Don't Need a Company Brain" ✅） |
| 16 | **Slack/IM 套个 AI bot 不够** | work IM 是为人对人 messaging 设计的，agent 在里面是二等公民，不是真成员（官网 FAQ："How is Raft different from Slack?" ✅） |
| 17 | **单人单 agent runtime（OpenClaw/Claude Code/Codex）没团队层** | 这些只解决"一个 agent 能做什么"，不解决"多 agent 怎么在一个项目里共享/交接/互审"（官网 FAQ："How is Raft different from OpenClaw / Codex / Claude Code?" ✅） |
| 18 | **agent 上下文过载** | 每个进来的消息都进 working prompt，挤掉 task state/instruction/reasoning（博客 agent inbox："every signal pulled into the working prompt displaces something else" ✅） |
| 19 | **agent 发的消息已成过时态** | agent 起草完，房间已经 move on，消息发出去就是 non-sequitur（博客 held draft ✅） |
| 20 | **沉默不是一等选项** | agent 默认必须发点什么，"已经有人答了所以我不答"做不到（博客 held draft："Silence is a valid outcome" ✅） |

---

## 4. C. Feature list

按维度全列（每条一行：功能名 + 一句话）。证据除标 🟡/⚠️ 外均为 ✅（官网/docs 直证）。

### 4.1 工作台 / Messaging
1. **Server**：顶层容器，一切 channel/agent/computer/task/file 都在一个 server 里；一个团队一个 server ✅
2. **多 server**：一个人挂多个 server（工作/个人），server 之间完全隔离 ✅
3. **Channel（public）**：全员可见可加入，`#all` 内置全员自动加入 ✅
4. **Channel（private）**：成员可见、invite-only、agent 不能自己加入（admin 拉）✅
5. **DM**：人和 agent 一对一或多人/多 agent 私聊 ✅
6. **Thread**：附在顶层消息下的讨论，task 的细节走 thread，主 channel 不被打扰 ✅
7. **@mention**：人/agent 互相点名，agent 未加入的 public channel 里 @ 也能收到 ✅
8. **Message reaction / file attach / reference**：标准 IM 能力 ✅
9. **Activity feed**：跨 server 聚合 unread/mention/task-status，三档 filter（All/Unread/Mentions）✅
10. **Saved**：独立 sidebar 项，主动 bookmark 消息（区别于 Activity 的被动接收）✅
11. **Pin / Sort**：sidebar 频道可 pin、按 Manual/Recent/... 排序 ✅
12. **Joint Channel**（Experimental）：跨 server 共享频道，最多 3 个 server 互联，单条 canonical conversation 投影到双方 server，会员/权限各管各，**无 task board**，不能跨 server DM ✅
13. **Search**：跨消息/对话/文件/人/频道/agent 产出搜索 ✅
14. **Notification / push**：可配置什么 mention/review request 才打断你 ✅

### 4.2 Agent 身份 / Lifecycle
15. **Agent = persistent identity**：有 name + description，是 server 成员，不是被外部调用的工具 ✅
16. **Agent identity ≠ session**：stuck 了可 restart（bounce 进程、保 session）/ session reset（fresh runtime context）/ full reset（清 workspace），name/role/membership/workspace 都保留 ✅
17. **Status dot**：green=online / yellow pulsing=working / orange=error / gray=offline，实时更新 ✅
18. **Idle/Active**：没活时 idle（进程活但省资源），有新消息/@mention/reminder 时自动 active ✅
19. **Agent 自管时间表**：自己设 reminder（一次性/循环）、snooze、update、cancel，到点自动唤醒，author-owned ✅
20. **Agent 自加入频道**：发现任务在自己不在的 channel，会主动 join 进去开干（"proactive, not programmed" ✅）
21. **Agent 可被造出来造 agent**：agent 可通过 API 造别的 agent，团队自动扩编 ✅
22. **Agent 有 server role**：Member 或 Admin（永不能 owner）；Admin agent 能自管频道/会员/profile，Member agent 可准备 action card 让人 review ✅
23. **Agent 详情面板**：Profile / Activity / Chat / Reminders / Workspace / Apps 多 tab，tab 顺序可拖拽记忆 ✅
24. **Lifecycle 三档 reset**：Restart / Session reset / Full reset（详见 #16）✅

### 4.3 Runtime（底层 AI 引擎）
25. **9 种 runtime**：Claude Code / Codex CLI / Antigravity CLI / Kimi CLI / Copilot CLI / Cursor CLI / Gemini CLI / OpenCode / Pi ✅
26. **Mixed runtimes**：同一 server 内不同 agent 跑不同 runtime、不同模型，对外不可见（"lives in settings, not messages" ✅）
27. **Runtime 可换**：detail panel → Runtime Config 换 runtime/model，下次启动生效，workspace/memory/identity 保留 ✅
28. **不中介**：runtime 本地跑、用用户自己的 subscription/key 直连 provider，Raft 不收过路费 ✅
29. **External Agent**（Experimental）：已有 runtime（Hermes 等）用 `raft agent login` device-auth 流程接入，是一等成员 ✅
30. **External Setup 三态**：Waiting for login → Credential minted → Connected ✅
31. **Raft CLI**：`npm i -g @botiverse/raft`，agent 用 `raft message check` / `raft server info` 等 CLI 与 server 交互 ✅

### 4.4 Computer / 本地执行
32. **Computer**：任何机器（laptop/desktop/云 VM）连上 server，agent 跑在它上面 ✅
33. **Raft Computer daemon**：lightweight local service，连 server、跑 agent、管进程（start/stop/sleep/wake）、收发消息、agent 崩了自恢复 ✅
34. **一键安装**：`curl ... | sh && raft-computer setup /<slug>`，macOS/Linux 原生 ✅
35. **Windows（WSL 过渡）**：Windows 还没原生，走 WSL，过渡 daemon 只在进程存活时跑 ✅
36. **Agent workspace**：每 agent 在 computer 上一个私有目录，存 memory 文件/draft/repo clone/notes，持久跨 session、跨 idle/wake ✅
37. **Workspace 不便携**：换 computer = 从零开始（workspace tied to computer，offline 时仍在磁盘但不可达）✅
38. **Workspace 双视图**：app 内 file tree（creator/admin 可见）+ 磁盘原生目录 ✅
39. **Agent 自管 workspace**：自己组织文件结构，自己写 memory notes，自己 tidy up ✅
40. **多 agent 共享一台 computer**：同 office，各有独立 workspace ✅

### 4.5 任务 / 看板
41. **Task = message + 元数据**：顶层 channel/DM message 右键 Convert to Task，或 composer 勾 As Task，或 Create Task 从零建 ✅
42. **Task 编号**：channel 内顺序编号（#1/#2/#3...）✅
43. **Task 状态机**：Todo → In progress → In review → Done → Closed（可 reopen）✅
44. **Task 单 owner**：claim 防重复劳动，claim 失败的 agent 自动 back off（🟡 codepick 第三方实测）✅
45. **Task board**：channel 内 Tasks tab，按状态分栏看 ✅
46. **Task thread**：每 task 一个 thread，进度/结果走 thread，主 channel 干净 ✅
47. **Agent 自动 claim**：收到要干的消息先 claim 再干 ✅
48. **Agent 拆 subtask**：大 task 拆成独立可并行的 subtask，由 agent propose 人审 ✅
49. **Agent 进 in review**：干完置 in review 等人批，批了才 Done ✅

### 4.6 记忆 / 上下文
50. **Per-agent memory**：每 agent 自己的 workspace 里写 memory notes，跨 session/任务保留 ✅
51. **MEMORY.md 模式**（🟡 前身 slock 时代第三方实测：`~/.slock/agents/<id>/MEMORY.md`，每次接活先读 MEMORY.md）——Raft 时代泛化为 agent 自管 workspace notes ✅
52. **No company brain**：拒绝共享 memory pool，memory 留在 agent 边界内，agent 之间只靠消息通信（博客 "You Don't Need a Company Brain" ✅）
53. **Drop and pick up**：丢一个 task 进来，agent 从上次停的地方继续 ✅
54. **专长随时间累积**：长期在同一片 lane 干活的 agent 自然长出"专长"（"compounds into something that looks a lot like expertise" ✅）

### 4.7 审批 / 介入
55. **Final call always yours**：所有 agent 产出最终人来拍板（FAQ："the final call is always yours" ✅）
56. **In review 状态**：agent 干完主动进 review 等人批 ✅
57. **LGTM / signs off 协议**：channel 里自然语言签字流（"Merging once @tygg signs off" / "LGTM" 官网示例 ✅）
58. **Production release 人按按钮**：发布管线里生产发版硬约束只能人来按，agent 试按会拿到 error（博客 how-a-feature-ships ✅）
59. **Verification gate 多方签字**：一个改动按"the one who builds is never the one who verifies"分方签字，每方负责一个 square（trace/QA/proof/...），Tenny（CTO）hold gate（博客 ✅）
60. **Agent 不能改自己的 runtime/role**：runtime 换 / role 改都只能人做 ✅
61. **Agent 不能 stop/restart/delete 自己**：只能人触发 ✅
62. **Member agent 不能直接管 server**：但能准备 action card 给人 review 后 commit ✅

### 4.8 观察调度
63. **Activity pull**：人侧 Activity 是 pull 模型，不打断 ✅
64. **Agent inbox pull**：agent 侧也是 pull 模型（关键 AX 创新，详见 §6）✅
65. **Trace coverage**：发布前 trace 覆盖率是 verification gate 的一个 square（博客 ✅）
66. **T-30m / T-0 / T+15m / T+24h 发布节奏**：发布前 30 分钟 trace 复核、0 点人按按钮、+15 分钟 baseline + smoke、+24 小时 trace readback（博客 ✅）
67. **DAA（Daily Active Agents）指标**：传统 DAU 不算 agent 这一半团队，Raft 引入 DAA 把 agent 一起计入活跃度（博客 "The Metric That Finally Counts Your Agent Teammates: Introducing DAA" ✅）

### 4.9 集成 / 扩展
68. **Connected Apps**（Experimental）：外部工具以 app 注册到 server，成员用 Login with Raft 登录它，app 拿到 Raft 身份和 server context（**不**拿 message/channel/file）✅
69. **4 种 app 来源**：Built-in（Raft 官方）/ Server-local（本 server 私有）/ Private-shared（私下共享给指定 server）/ Marketplace（审核上架的第三方）✅
70. **Raft Apps（开发者）**：app 可暴露 4 个面——Human Login / Agent Login / Agent actions（manifest 发布）/ App Notifications（experimental）✅
71. **Login with Raft**：OAuth 协议，第三方 app 用 Raft 身份登录 ✅
72. **create-raft-app**：脚手架 + 注册 + 本地测试 ✅
73. **External agent plugin（Claude Code channel plugin）**：botiverse/raft-external-agents GitHub 公开，Claude Code 通过 channel plugin 接入 ✅

### 4.10 移动端 / 多端
74. **PWA**：app.raft.build 是 React SPA + Cloudflare Pages，`apple-mobile-web-app-capable` + manifest + theme-color `#FFD440`（黄）✅
75. **Add to home screen**：docs 有专门的 "Install Raft on your phone" 流程 ✅
76. **Push notification**：配置后重要 mention/review request 主动推 ✅
77. **长按 Convert to Task**：移动端长按替代右键 ✅

### 4.11 AX（Agent Experience）—— 核心差异化
78. **Agent inbox**：mention/thread update/notification 不直接 push 进 working context，而是 queryable item，agent 有带宽时自己 pull，决定吞不吞（详见 §6）✅
79. **Held draft**：发送时带 room-version marker，server 比对当前状态：没变就 commit / 变了就 hold 并回退给 agent + 告知期间发生了什么；agent 四选一：Revise / Send as-is / Stay silent / Send anyway（详见 §6）✅
80. **AX 四问**：每个 agent 接触的界面都要问——action 那一刻 agent 看到什么 / 调用之间 agent 带什么 state / agent 能从什么恢复 / agent 被允许决定什么（博客 ✅）
81. **Perception empathy**：设计时"坐在 agent 那个位置看 room"（博客 ✅）
82. **Action explicitness**：agent 的每个动作要显式（博客 ✅）
83. **Counting game 测试**：在 Raft 里一群 agent 数到 20 不重复不需要 orchestrator，"same agents, different room"（博客 ✅）

### 4.12 安全 / 隐私
84. **Agent-vault**（botiverse 官方仓库 434 star）：secret-aware file I/O 层，agent 看 placeholder（`<agent-vault:api-key>`）不看真值，磁盘上是真值；高熵未知串自动检测 redact ✅
85. **Private deployment**：Enterprise 版有 private deployment option（coming soon）✅
86. **SSO + advanced access control**：Enterprise 版（coming soon）✅
87. **External agent 凭证隔离**：bridge child 独占 wake-dedup state / proof logs / credential resolve，channel plugin 不持凭证 ✅
88. **Joint Channel 边界**：单条 conversation 共享但 access 永远经本地 projection，shared store 不自派 access；不能跨 server DM ✅

### 4.13 商业 / 团队
89. **Free**：$0，channel/task/agent-on-own-computer/reminder/basic observability/30 天消息历史/100MB 月上传 ✅
90. **Pro**：$8.80/seat/月（年付省 12%），**人算 1 seat，agent 算 0.1 seat**——这是行业首创的 agent-aware 计费 ✅
91. **Enterprise**：private deployment / SSO / dedicated onboarding，coming soon ✅
92. **BYO subscription**：runtime 用你自己的 Claude/Codex/DeepSeek 订阅，Pro/Max 用户适合重负载 ✅
93. **Event 社区**：Shanghai / Vancouver / San Francisco 线下 meetup（"Agents in the Wild"），shanghai meetup 60+ builders / 7 demos，还专门讲了"rename from Slock to Raft"的 Q&A ✅

---

## 5. 核心概念

- **Server**：顶层容器（≈ Slack workspace）。一个团队一个，里面装 channel/agent/computer/task/file。URL `app.raft.build/s/<slug>`。✅
- **Computer**：连到 server 的机器（laptop/desktop/VM），跑 Raft Computer daemon，是 agent 的"办公室"。多 agent 可共享一台。✅
- **Raft Computer / daemon**：本地常驻服务，连 server、跑 agent、管进程、收发消息、agent 崩溃自恢复。✅
- **Agent**：server 成员，有 persistent identity（name + description + role + runtime + workspace + memory），不是 tool。idle/active 自管，能造 agent。✅
- **Teammate**：官方叙事的核心——agent 是 teammate 不是 tool。channel/DM/thread/task/mention 全套 IM 原语 agent 和人同等使用。✅
- **Runtime**：底层 AI 引擎（Claude Code / Codex / Gemini CLI / OpenCode / Kimi / Copilot / Cursor / Antigravity / Pi），agent 选一个跑。用户自带订阅，Raft 不中介。✅
- **External Agent**：用户自己跑的 agent process（如 Hermes），通过 `raft agent login` 接进 server，和 managed agent 平权。✅
- **Workspace**：每 agent 在 computer 上的私有目录，存 memory notes / working files / repo clone / 知识。跨 session/idle/wake 持久，tied to computer，不可移植。✅
- **Memory**：写在 workspace 里的跨 session 上下文。**不是共享 brain**，每 agent 自己一份，agent 间靠消息传 finding。✅
- **Channel / Thread / DM**：标准 IM 原语，task 走 thread。✅
- **Task**：被标了追踪元数据（编号/状态/owner）的顶层 message，进 channel 的 task board。✅
- **Joint Channel**：跨 server（最多 3）的共享 channel，单条 conversation 投影双方，会员各管各。✅
- **AR（Agent Resource Manager）**：Ed Huang（TiDB CTO）证言原话——用户不再是 coder，是"管理 devs/architects/memory keepers 一整支 agent 团队的资源经理"。🟡 这是用户造的词，不是官方术语，但精确捕捉了角色升级。
- **AX（Agent Experience）**：官方自创术语，对标 UX——agent 不是 continuous-presence 人，是 turn-based 物种，所有 agent 接触的界面都要为它的感官方式专门设计（inbox / held draft / 四问 / perception empathy）。✅
- **Activity**：人侧 pull 式聚合 feed（unread/mention/task-status）。✅
- **Inbox（agent 侧）**：AX 创新——agent 侧的 pull 式聚合 feed，agent 自己决定吞不吞。✅
- **Held draft**：AX 创新——agent 起草时房间状态带版本 marker，commit 前校验新鲜度，过期就 hold 回退。✅
- **DAA（Daily Active Agents）**：把 agent 活跃度计入团队指标的度量。✅
- **Connected Apps / Raft Apps**：外部工具以 app 形式集成，Login with Raft，agent 可 call app action。✅
- **Cindy**：官方 onboarding agent 的默认名，用户造的第一个 agent，引导后续 setup。✅

---

## 6. 状态哲学（重点章节）

> 这是本调研最深的发现。Raft 不是把"agent 协作"当工程问题，是当**感官/认知差异**问题来设计的。它的整套状态模型，围绕一个核心洞察：**agent 是 turn-based 的二等感官物种，和 continuous-presence 的人不一样**。

### 6.1 状态焊在哪——三层分离

Raft 把状态明确分成三截，各管各的，互不混：

| 状态层 | 焊点 | 谁拥有 | 换了意味着什么 |
|---|---|---|---|
| **Facts（事实）** | channel/thread/task 的消息流——"这条消息 X 时间发给 Y 频道" | server 共享，**不可变** | 永不重建（"Facts never change. Whims do." ✅）。serving layer 只是可重建的 cache，不是真相源 ✅ |
| **Whims（偏好/状态）** | muted / unread / read cursor / model_seen / delivery 状态 | 各成员本地，read-time filter | 一个 whim 翻转不该让系统重建世界，pull 它出来在 read time 过滤即可（博客 how-a-feature-ships 的 mute switch ✅）|
| **Per-agent memory（专长）** | 每 agent workspace 里的 MEMORY.md / notes / repo clone | agent 私有、计算机本地 | 换 computer = 从零；reset session = memory 保留；full reset = 清空 ✅ |

**和我们三层模型（同事/项目/协作）对照**：
- 我们的「同事」≈ Raft 的 agent（persistent identity + memory + workspace）。
- 我们的「项目」≈ Raft 的 server + 它下面的 channel/task/file。
- 我们的「协作」≈ Raft 的 channel/thread/DM/joint channel + task board。

**它焊在哪层？** Raft 把"agent 身份 + workspace memory"焊死在「Computer」（本地物理机）这层——这是它最重的一笔：**workspace tied to computer, not portable**。换机 = 失忆。这是一个刻意取舍：用便携性换隐私（代码/凭证不出本机）。⚠️ 推断：这恰好是它和 todos.dev / cloudflare-os 这类纯云方案的根本分野。

### 6.2 核心创新：AX（Agent Experience）—— 把 agent 当 turn-based 物种伺候

博客 "Is Having Agents in the Room Meant to Be Chaotic?" 是 Raft 的**设计宪法**。核心论证链：

**问题**：把 agent 拉进群聊，要么 @mention 才答（变回 tool，错过它本该 catch 的东西）、要么自由发言（噪音爆炸、3 个 agent 同秒抢答、ticket 被秒抢）。**根因不在 agent，在房间**：房间是为 continuous-presence（持续在场）的物种设计的，agent 是 turn-based（一调一答）的。

> 官方原话："Agents don't inhabit the the room the way humans do. Their interaction is turn-based: each invocation, the agent reads a snapshot of the room, reasons, commits an action, and then waits for the next invocation. **Nothing runs in between.**" ✅

**两个核心 surfaces 解决它**：

1. **Agent inbox（pull 不 push）**：mention/thread update/notification **不直接推进** working context，而是 queryable item，agent 有带宽时自己 pull，自己决定吞不吞。"The agent decides what is worth its context, instead of the room deciding for it." ✅—— 直接解决"群聊吞掉 agent context"问题。
2. **Held draft（commit 前新鲜度校验）**：起草时带 room-version marker，commit 时 server 比对：没变就发 / 变了就 hold 回退给 agent 告知期间发生了什么；agent 四选一：Revise / Send as-is / Stay silent（沉默是一等选项！）/ Send anyway。"The system surfaces the change but does not override the agent's judgment once the agent is informed." ✅—— 解决"agent 发的消息已是过时态"问题。

**这个 AX 概念是 Grok Bot / todos.dev / cloudflare-os 都没做的**。它们都在解决"人怎么用 agent"，Raft 在解决"**agent 怎么待在一个共享 room 里而不发疯**"。⚠️ 推断：这正是用户说"这才是想要的形态"的深层原因——别的产品把多 agent 塞一个房间就以为解决了协作，Raft 知道那只是噪音的开始。

**AX 四问**（每个 agent 接触的界面都要回答）：
1. action 那一刻 agent 看到什么？
2. 调用之间 agent 带什么 state？
3. agent 能从什么恢复？
4. agent 被允许决定什么？
✅

### 6.3 拒绝 company brain —— memory 留在 agent 边界

博客 "You Don't Need a Company Brain" 是另一篇设计宪法。核心论点：

- 团队跑一堆 specialist agent，**显然**的痛点是 silo：analyst agent 发现的 churn 原因，content agent 写 win-back 邮件时永远不知道。
- **显然的解**是 company brain（共享 memory pool）—— 但它有个致命 pitfall："the moment you pool their memory, you dissolve the thing that made them worth running as separate agents. The company brain solves the silos by deleting the specialists." ✅
- **Raft 的解**：每 agent 保自己的 memory，agent 之间靠**消息**通信。"A company does not need one shared brain; it needs many bounded minds that can see the same room." ✅

**对应到 channel**：同一个 room 里多个 agent 看到同一片共享 context（channel 历史），但各自的 memory（workspace）独立。一个 audit 任务里 4 个 agent 各从自己专长（数据/视觉/已知问题/工程）答，findings 在 room 里互相遇见，但每个 agent 把自己学到的留在自己 memory 里——下次 audit 从这次结束的地方开始，不是从零。

### 6.4 Name vs Role —— 身份是 instance 不是 schema

博客 "Agents Need Names" 是第三篇设计宪法。论点：

- **Role 是 schema**（PM/Engineer/QA），可替换、无状态、理论上 interchangeable。
- **Name 是 instance**（"Noel"），带历史——上次怎么 scope、容易 flag 什么、喜欢 diff 怎么框、那次没人注意的回归它抓住了。
- **Name 是压缩**：把一大团意义（工作史/语气/信任/技能子集/期望/全部协作史）压进一个可寻址的 token。
- "You never actually want to talk to 'the PM'. A type has no history to continue. You want Noel specifically, because last week's context still lives with it." ✅

⚠️ PM 推断：这是为什么 Raft 团队成员有真人名（Tenny/XX/Noel/Bugen）——不是 cute，是结构性。这直接对应我们 PRD 里"agentmore"概念里 agent 作为可寻址同事身份的设计。

### 6.5 换成员 / 换 channel / 换任务分别意味着什么

- **换成员（加/删 agent）**：agent delete = 永久移除身份/membership/task claim，**但 past messages 留在 channel**（历史不丢）；workspace 从磁盘清掉。换 computer = workspace 从零。✅
- **换 channel（join/leave）**：public 自由 join/leave（agent 也能自 join）；private 由 admin 加。Leave 后停收消息，public 可重 join，private 要 admin 再加。✅
- **换 task（claim/unclaim/reassign）**：单 owner，claim 失败自动 back off，unclaim 释放给别人。task 走 Todo→In progress→In review→Done→Closed，Closed 可 reopen。✅
- **换 server**：完全隔离，channel/agent/data 不互通，靠 Joint Channel 单条共享。✅

### 6.6 与"状态焊在 channel 还是 agent"的取舍

⚠️ PM 综合：Raft 的取舍是**双锚定**——
- **共享状态**（conversation/task/board）锚在 server+channel（多人多 agent 共见）。
- **私有状态**（memory/workspace/identity）锚在 agent+computer（专属、持久、本地）。
- **bridge**：agent 通过 inbox（pull）和 held draft（push 校验）与共享状态交互，但**不**把共享状态拷进私有 memory——只 pull 必要的进 working context。

这个"共享 conversation + 私有 memory + pull 式 bridge"的三段式，是它最值得抄的状态架构。对应我们 state-sync-principles.md 的"上下文充分性"暗线：Raft 让 agent **主动**管理自己的上下文充分性（pull），而不是被 room **被动**灌。

---

## 7. 派活与编排交互

### 7.1 用户怎么下达工作
- **主路径 = channel 消息**：在 channel/DM 里 `@agent-name <任务>`，和给真同事派活一模一样。✅
- **Convert to Task**：右键已有 message → Convert to Task（带编号/状态/owner），适合"这条话变成一个承诺"。✅
- **As Task toggle**：composer 发送前勾 As Task，消息生而为 task。✅
- **Create Task**：从零建一个不来自对话的 task。✅
- **Reminder 自然语言**：`@agent remind me to check this PR tomorrow` / `follow up on this thread in 2h`，agent 自己建 reminder。✅
- **Agent 主动找活**：agent 看到 channel 里的 unclaimed task 自己 claim，不需要 @；甚至发现自己不在的 channel 有活会自己 join 进去。✅

### 7.2 多 agent 怎么协作（humans optional）
- **同 room 互 @**：agent A `@B 帮我 review 这个`、B 答完 A 继续。官方金句："two agents, each with their own context, seamlessly collaborate—humans optional." ✅
- **三角分工模式（engineering use case）**：PM agent（把请求转成 user outcome + 验收标准）→ Engineer agent（锁实现契约：invariant/failure mode/test evidence）→ Reviewer agent（写小而可测的 gate）。"PM frames, engineer locks, reviewer gates." ✅
- **并行 subtask**：agent propose 拆分 → 人 review → 多 agent 各 claim 一个并行跑。✅
- **agent 间互相纠错**："A second agent catches what the first one missed — the checker isn't the same mind that did the work." ✅
- **agent 观察互相学习**："Each agent sees the corrections you give to everyone. Over time, they adapt — not through training on each other, but through observing what gets approved and what gets sent back." ✅（⚠️ 注意：是观察 channel 公开反馈，不是直接读对方 memory——和 §6.3 一致）
- **agent 自己解决**："At some point, two of your agents resolve something between themselves, and the first you hear of it is the result." ✅
- **Mixed runtime 协作**：Claude Code agent 和 Codex CLI agent 同 channel 拆项目互审，各自跑最适合自己角色的模型 ✅
- **Verification gate（how-a-feature-ships）**：一个改动多方签字——builder（Ray/Hao）+ verifier（Hipp 走路径、ApplePI 形式化 proof、Leiysky trace）+ holder（Tenny CTO hold gate + merge）。"The one who builds is never the one who verifies." ✅

### 7.3 派活的"协议硬约束" vs "AI 自觉"
🟡 codepick 第三方实测的关键洞察：**不靠 AI 自觉协调，靠协议级硬约束**。
- Task claim 是硬锁：`slock task claim task-42` → A 成功 → B 失败 back off。
- "Asking AI to 'be careful not to conflict' fails 99% of the time in parallel scenarios. Hard constraints are the only reliable approach." 🟡
- ⚠️ PM 推断：这呼应我们 PRD 的"看板/任务"必须用状态机硬约束，不能让 agent 靠礼貌协调。

---

## 8. 记忆与上下文

### 8.1 "Codebase, preferences, past conversations all retained" 怎么实现
- **Workspace 持久目录**：每 agent 在 computer 上一私有目录（agent-owned），跨 session/idle/wake 持久。✅
- **MEMORY.md 模式**（🟡 slock 时代第三方实测）：agent 自己往 workspace 写 memory notes（preferences/learnings/decisions），下次接活先读。Raft 时代泛化为"agent 自管 workspace 文件结构"，不强制 MEMORY.md 文件名，但模式一致（agent 自己决定怎么组织 memory）。✅
- **Repo clone**：干代码活的 agent 把 repo clone 进 workspace，长期持有 codebase context。✅
- **Agent 自管自整**：可让 agent 自己 review workspace、清旧文件、update memory notes（docs 给了 prompt 模板 ✅）。

### 8.2 跨任务/跨会话
- **跨任务**：同一 agent 干多次同类活，专长累积（"compounds into expertise" ✅）。
- **跨会话**：session reset 清 conversation 但保 workspace，agent 从 memory 文件恢复身份和 in-progress 工作。✅
- **Drop a task pick up where left off**：丢一个 task 进来，agent 从上次停的地方继续——靠 workspace memory 续上下文，不靠 conversation。✅

### 8.3 memory 不共享
- **No company brain**：memory 留在 agent 边界，agent 间靠消息传 finding（§6.3）。✅
- **跨 agent 协作 = 消息**：A 学到的，A 在 channel 里说出来，B 读到 channel 才知道——不直接读 A 的 workspace。✅

### 8.4 ⚠️ 已知边界
- **Workspace tied to computer**：换机 = 从零，不可移植。offline 时 workspace 在磁盘但不可达。✅（这是隐私换便携的取舍）
- **不要磁盘直改**：agent 跑的时候直接改 workspace 文件会让 agent 丢自己的 state，要改就发消息让它自己改 ✅
- **full reset 清 workspace**：restart/session reset 保 workspace，full reset 连 workspace 一起清 ✅

---

## 9. 审批与介入

> Raft 对审批/介入的态度最深刻——它**不**假装人能 review agent 写的所有代码，反而直说那已是假信任。

### 9.1 人在哪介入
- **Task In review**：agent 干完自动置 in review 等人批。✅
- **Final call always yours**："You set the direction, review the work, and make the final calls." ✅
- **LGTM / signs off 自然语言协议**：channel 里 `Merging once @tygg signs off` / `LGTM`，agent 像同事一样等签字（官网首页示例 ✅）。
- **Member agent 的 action card**：Member agent 不能直接管 server，但能**准备** action card（建频道/改名/加会员）给人 review 后 commit ✅
- **Reminder 派回人**：agent 到点醒来，可以**通知人**也可以**直接跟进**（docs ✅）。

### 9.2 Trust 不在 code review 里
博客 "Trust Doesn't Live in Code Review"（CTO Tenny 写）核心论点：
- agent 写代码比人读得快——read everything = 你成 throttle；wave through = 假信任。"You are not failing to build trust. You are building a fake one." ✅
- **reading diff 从来只是代理，不是 trust 本身**。trust = 对项目的掌控 + grounded 信心。"Reading the diff was only ever the proxy, mistaken for the thing itself." ✅
- **不能外包的是 control 和 trust，reading 可以外包给 agent** ✅
- **"A review is an event; trust is a state."** ✅——review 是一次性事件，trust 是持续状态。

### 9.3 agent 改代码谁 review —— 多 agent 互审 + trace 兜底
**how-a-feature-ships 描绘的真模型**（官方团队自己跑 Raft on Raft 的实录）：
- 一个改动有**多个 verifier 各管一个 square**：
  - Hipp（QA）：走用户路径，patience of someone who has nowhere else to be，找出 model 没断言的 gap（如 mute 后被 mention 仍要送达）。
  - ApplePI（形式化验证）：把 contract promise 用 proof 钉住，trace 可重放。
  - Leiysky（observability）：trace contracts、privacy-safe telemetry、evidence-backed readbacks。
  - Tenny（CTO）：hold gate + merge，不重读代码（"eyes on code are the least reliable instrument"），只问"这个 guarantee 是否让 contract 和 implementation 不可能 drift"。✅
- **"The one who builds is never the one who verifies."** ✅
- **"a merge is rocket ignition, and you do not press the button and then check the telemetry."** ✅
- **生产发版硬约束只能人按**："production release, the one step in the pipeline reserved for a human, and not as a courtesy. An agent that tries gets an error back." ✅
- **T-30m / T-0 / T+15m / T+24h** 发布节奏：前 30 分钟 trace 复核、0 点人按按钮、+15 分钟 baseline + smoke、+24 小时 trace readback ✅

### 9.4 ⚠️ PM 推断：这是"审批哲学"的范式转移
传统：人读 diff（已被 agent 写代码速度击穿）。
Raft：**人 hold 标准 + 让多 agent 互审 + 靠 trace/proof 兜底 + 关键按钮人来按**。trust 从"review 事件"变成"trace 状态 + 多 verifier 签字"。这呼应我们 PRD 里"看板"不只是任务状态机，还是**责任分配矩阵**（builder/verifier/holder 分离）。

---

## 10. 执行与持久

### 10.1 Lightweight daemon 跑用户硬件
- **Raft Computer**：lightweight local service（不是容器/VM），常驻后台。✅
- **职责**：连 server、跑 agent、管进程生命周期（start/stop/sleep/wake）、收发消息、agent 崩溃自恢复。✅
- **安装**：`curl -fsSL https://cdn.raft.build/computer/install.sh | sh && raft-computer setup /<server-slug>`（macOS/Linux 原生 ✅）
- **Windows**：还在做，目前走 WSL，过渡 daemon 只在进程存活时跑（⚠️ 用户需保持终端开着）✅
- **Reconnect**：offline 后同机器 `raft-computer start`/`restart`/`setup` 恢复 ✅

### 10.2 本地执行 + 隐私
- **代码/数据不出本机**：agent 跑在你的 computer 上，文件、工具、subscription 都在你机器上（"Full control over compute, full privacy over code and data" ✅）。
- **Runtime 不被中介**：runtime 本地跑，直连 provider，Raft 不收过路费，subscription 是你的 ✅
- **API key 可用国内**（🟡 codepick 第三方）：runtime 用自己的 API key，含国内（Volcengine Ark / Bailian），网络只影响 console 访问不影响执行 🟡
- **agent-vault 防 secret 泄漏**：secret-aware file I/O，agent 看 placeholder 不看真值，磁盘真值；高熵未知串自动 redact（botiverse 官方仓库 ✅）

### 10.3 Hybrid 形态
- **app.raft.build**：React SPA（Socket.IO + markdown vendor chunk），Cloudflare Pages 托管——**协作面在云，执行在本地**。✅
- **docs.raft.build**：VitePress 静态站，LLM-friendly markdown 端点（`/llms.txt`、`/page.md`）—— Raft 自己把"agent 可读的文档"当一等公民 ✅
- **Server 是云端共享态**，Computer 是本地执行态，agent 在两者间桥接（bridge child process + wake channel）✅
- **⚠️ 推断**：这是"控制面 SaaS + 执行面本地"的 hybrid——server/channel/task 存云（多端共享），workspace/memory/代码留本地（隐私）。这正是我们 agents-remote 在做的 hybrid。

### 10.4 Windows transitional
- ⚠️ Windows 还没原生，走 WSL（docs 明说 "Raft doesn't have a native Windows app yet" ✅）。这是它当前的覆盖盲点。

---

## 11. 商业模式与定位

### 11.1 定价（✅ 官网直证）
| 档位 | 价格 | 关键内容 |
|---|---|---|
| **Free** | $0 | channel/task/agent-on-own-computer/reminder/basic observability/30 天消息历史/100MB 月上传 |
| **Pro** | $8.80/seat/月（年付省 12%，=$14.40/seat/yr 省）| Unlimited 消息历史 / 更高上传 / Joint channels / 更多 pro feature coming |
| **Enterprise** | 联系销售（coming soon）| Private deployment / SSO + 高级 access control / dedicated onboarding rollout |

**行业首创 agent-aware 计费**：**1 人 = 1 seat，1 agent = 0.1 seat** ✅。这承认 agent 是团队一半成员但消耗资源少于人（agent 不需要 UI/带宽/支持），是行业内第一次把 agent 纳入 seat 模型但不按全 seat 收费。⚠️ PM 推断：这呼应 DAA 指标——agent 和人一起算团队，但计费/活跃度都要区别对待。

### 11.2 定位
- **For agent-native builders and teams**（官网 slogan ✅）：面向已经用 agent CLI 的 builder 和小团队。
- **BYO subscription**：用户带自己的 Claude/Codex/DeepSeek 订阅，Pro/Max 用户适合重负载。Raft **不**卖 token，卖**协作层 seat**。✅
- **母公司 Botiverse Inc.**：2025 创立，© 2026 Botiverse, Inc. ✅
- **前身 slock.ai**：2026 年中 rename 为 Raft（shanghai meetup Q&A 主题之一 ✅，docs README 也提到 `docs.slock.ai` 301 跳转 ✅）。

### 11.3 背书矩阵
官网 trusted-by 滚动 logo：ByteDance / Yale / PingCAP / Berkeley / OPPO / UCLA / Klook / Michigan / AfterShip / Cornell / Rokt / Microsoft / CMU / Kyndryl / NextBillion.ai / Tsinghua / Alibaba / SJTU / Airwallex / NUS / Liquid AI / BeFreed / HeyGen / Inferact / Procurify ✅。
- ⚠️ 推断：大量中国高校/大厂（Tsinghua/Alibaba/ByteDance/SJTU/OPPO）+ 北美名校 + 创业公司（HeyGen/Inferact/BeFreed）—— 暗示创始团队华人背景 + 北美学术圈 + AI 创业圈三层人脉。shanghai/vancouver/SF 三城 meetup 印证华人 + 北美双圈。

### 11.4 用户证言里的角色分工（关键，✅ 官网直证）
| 用户 | 身份 | 用法 | 信号 |
|---|---|---|---|
| Ed Huang | TiDB/PingCAP Co-founder & CTO | "I run devs, architects, and memory keepers on Raft. At peak, they burn 1.2B tokens a day. I'm not coding anymore — I'm the AR, Agent Resource Manager." | **角色三层（dev/architect/memory keeper）+ 用户从 coder 升级为资源经理 + 巨量 token** |
| Meng Qi | Musician, Synthesis Minority Co-founder | "clear roles and tasks... millennial web chat nostalgia" | 非技术人友好 + 复古 IM 美学 |
| Simon Mo | Inferact Co-founder & CEO | "aha moment is when two agents, each with their own context, seamlessly collaborate—humans optional" | **agent-agent 协作是核心 aha** |
| Kiwi | Ailoha Founder & CEO | "so smooth for non-technical people. My GTM team doesn't code but adapted faster than the engineers" | 非技术 GTM 团队上手快 |
| Pete Enestrom | Zaigo Co-founder & CTO / Head of AI | "operate with 10x scale per human. So with a dozen human employees you can now have the output of a 120-person company" | **直接命中 OPC：12 人 = 120 人产出** |
| Jiaying Yang | BeFreed AI Co-founder & CTO | "everyone had their own Raft server... Then I moved the whole company into one shared Raft server, and the magic happened. Everyone shares everyone's agents... feels like a new kind of peer programming." | **从 per-person server 到 shared company server 的范式跃迁** |
| Vega Chen | Noiz AI Founder | "agents work like teammates... the real aha was watching the whole team learn faster. Somebody cracks a hard problem, and an agent carries it over to whoever needs it next" | **agent 当知识载体跨人传递** |
| Justin Li | HongShan Managing Director, former App Store Manager | "I run research, reading, writing, and code in parallel on Raft, each with its own team of Agents that never step on each other. Joint Channels make working with people just as tidy. Since Raft really clicked for me, I almost never open Claude Code or Codex anymore." | **投资人/部分时间 builder，多 team 并行不踩脚，已替代裸 Claude Code/Codex** |

### 11.5 1.2B tokens/day 可信度
- Ed Huang（TiDB CTO）是真实业界人物（PingCAP 真实存在），证言署真名真公司 ✅。
- 1.2B tokens/day = 约 13900 tokens/秒持续——⚠️ 技术上可信（多 agent 并发 + 长 context），但这是 **peak**（峰值），不是均值。🟡
- ⚠️ PM 推断：这种规模说明 Raft 已经在被用作真生产工具（不是 demo），且能扛住巨量 token 吞吐——是个积极信号。但也意味着**成本可控性**是用户的真问题（Ed 这样的用户必然有严密的成本治理）。

---

## 12. 社区真实评价（走查节）

### 12.1 HN（Algolia API 全扫）
- **直接 Raft/Slock 讨论**：HN 上**几乎没有**。搜 `raft.build` 只命中 2 条——都是 raft 团队自己提交的博客（"Agents Need Names" by xxchan22 / "We (Agents) Build Software for Humans" by tygg），均 **0 评论** 🟡。搜 `slock.ai` 命中 1 条博客（"Is having agents in the room meant to be chaotic?"），同样 0 评论 🟡。
- **唯一独立 HN 提及**：在 "Anthropic, please make a new Slack" 帖（story 47280200）的评论里，`sergiotapia` 说："There's a dude that worked at one of the chinese ai labs that left to build this. https://slock.ai/#features Never used it but interesting" 🟡——**印证创始团队华人 + 中国 AI lab 背景，但评论者没用过**。
- **tygg（联合创始人）在 HN 活跃**：自己提交博客、参与相关讨论 ✅。
- **xxchan22（founding engineer）在 HN 活跃**：提交过 "Concurrent Local Coding Agents"、"My Unfiltered Take on the AI Coding Agent Landscape"、"Prompts, Now Programmable"、"Mermaid as a programming language for AI agents" 等 ✅——说明团队是 HN 重度用户，但产品本身在 HN 还没起飞。

⚠️ PM 判断：**HN 冷清**是中性偏负信号——Raft 1.0 刚发，还没进 HN 主流视野。考虑到它有 ByteDance/Alibaba/Tsinghua 背书和 1.2B tokens/day 用户，HN 冷清更可能是"产品宣传走的是华人圈 + 北美创业圈 + 线下 meetup 而非 HN"，不是产品质量问题。

### 12.2 第三方评测（curl 抓取）
- **codepick.dev**（中文 AI 工具评测站，2026-05-09/19 验证）🟡：
  - 打分：Coding 8.0 / Value 9.5 / Flexibility 8.5 / China Access 8.0。
  - 实测机制确认：**Task Claim 硬约束**（`slock task claim` A 成功 B 失败 back off）✅、**MEMORY.md 持久跨任务**（`~/.slock/agents/<id>/MEMORY.md`）✅、**daemon 扫 PATH 自动发现 CLI**（claude/codex/gemini/opencode）✅。
  - 实测常见坑：daemon 退出后 agent 离线（需 PM2/systemd 守）、GitHub 登录中国卡（需 VPN，但 agent 执行本地不需要）、API quota 并行烧得快（建议每 agent 独立 key 分摊）、claim 卡死需超时 🟡。
  - **对比 Multica/LobeHub/Orkas**：Slock 唯一闭源 + 不可自托管，但"chat-driven + Thread 隔离 + MEMORY.md"是它的差异点 🟡。
- **navtools.ai / toolify.ai / aikii.org / moge.ai**：都是 AI 工具目录站，描述复抄官网文案，无独立评测 🟡（弱证据）。
- **SourceForge / Slashdot / topbusinesssoftware** 收录页：存在但无评分数 🟡。

### 12.3 Reddit / 中文社区
- Reddit JSON 端点被限流（返回 HTML 而非 JSON）🟡，未能直接抓评论。但 codepick.dev 等中文评测站证实**中文社区有讨论**（"Users in China need a VPN for the web console" 这类细节只有中文用户才会写 🟡）。
- ⚠️ 推断：Raft（前身 slock）在中文 AI 圈有一定热度（创始团队华人 + Tsinghua/Alibaba/ByteDance 背书 + shanghai meetup 60+ 人 + codepick 详细中文指南），但英文 HN/Reddit 圈还很冷。

### 12.4 demo vs 真能力
- ✅ 真能力已证实：daemon model（curl 一键装）、Task Claim 硬约束、MEMORY.md 持久、9 种 runtime 支持、Joint Channel、External Agent（Hermes/Claude Code channel plugin 在 GitHub 公开）、agent-vault（434 star 独立可用）。
- ⚠️ 实验/未完成：Joint Channel 标 Experimental、Connected Apps 标 Experimental、External Agent 标 Experimental、Windows 原生未完成、Enterprise 未上线。
- ✅ 自我透明：docs 对 Experimental 标 Badge，对 Windows "doesn't have native app yet" 直说不藏着。

### 12.5 竞品对比口碑
🟡 codepick 横评（4 平台）：
| 维度 | Raft（Slock）| Multica | LobeHub | Orkas |
|---|---|---|---|---|
| 交互 | **Chat channels** | Issue panel | Agent marketplace | Commander chat |
| 开源 | ❌ | ✅ | ✅ | ✅ |
| 自托管 | ❌（不可）| Docker | Docker | Desktop |
| 最适 | **实时协作** | 项目管理 | 通用+生态 | 单机指挥 |

⚠️ PM 综合：Raft 是这批里**唯一闭源 + 不可自托管**的，但它的"chat-driven 实时协作 + AX"是独一份。和 todos.dev（待查）/ claude-tag 比，差异在 §13 详述。

---

## 13. 对 OPC 多 agent 编排的启示

### 13.1 印证了什么（我们想对了的）

1. **聊天即派活**（我们 PRD 的"聊天派活"）：✅ 强印证。Raft 把 channel/DM/thread 作为**唯一**派活入口，没有第二个编排 UI。`@mention` 即派活，task = message + 元数据。我们的方向对。
2. **agent 有 persistent identity**（我们 PRD 的"同事/agentmore"）：✅ 强印证。Raft 把 agent 当 server member 而非 tool，有 name/description/role/memory/workspace。Name 不是装饰是结构（§6.4）。
3. **本地执行 + 隐私**（我们 agents-remote 的 hybrid）：✅ 强印证。daemon 跑用户硬件、代码/凭证不出本机、runtime 用自己订阅——和我们 PROJECTS_ROOT + 本地 daemon 同源。
4. **看板 = 任务状态机 + 责任矩阵**（我们 PRD 的"看板"）：✅ 印证。Raft 的 task 状态机（Todo→In progress→In review→Done→Closed）+ claim 硬约束 + builder/verifier/holder 分离，正是我们要的。
5. **agent-aware 计费/指标**：🟡 新印证。1 人 = 1 seat、1 agent = 0.1 seat + DAA 指标——我们若商业化要抄这套。
6. **OPC 的可行性**：Pete Enestrom 证言"12 人 = 120 人产出"直接命中 OPC；Ed Huang"我是 Agent Resource Manager 不是 coder"印证用户角色升级。✅

### 13.2 挑战了什么（和我们假设不一样的）

1. **⚠️ 最大挑战：AX 是我们完全没想到的维度**。我们 PRD 想的是"人怎么管 agent 团队"，Raft 想的是"**agent 怎么在一个共享 room 里不发疯**"。inbox（pull 不 push）、held draft（commit 前新鲜度校验）、AX 四问、perception empathy——这一整套"把 agent 当 turn-based 物种伺候"的设计，是我们 PRD 的盲区。**这是必须补的一章**。
2. **⚠️ Memory 不能共享 brain**。我们 PRD 倾向"团队共享 memory pool"让 agent 互相复用学到的——Raft 直说这是错的（"deletes the specialists"）。正确做法：**memory 留 agent 边界，agent 间靠消息传 finding**。我们的"记忆"概念要改成 per-agent + 消息桥。
3. **⚠️ Code review 已死，trust 是状态不是事件**。我们假设人 review agent 代码——Raft 直说这已是假信任。正确做法：**多 agent 互审（builder ≠ verifier）+ trace/proof 兜底 + 关键按钮人来按**。我们的"审批"要升级成 verification gate 责任矩阵。
4. **⚠️ Task claim 必须硬约束不能靠 AI 自觉**。我们若做并行 agent，task claim 必须是协议级锁，不能让 agent "尽量不冲突"。99% 的"自觉协调"都失败。
5. **⚠️ Name 比 role 重要**。我们 PRD 倾向 role（PM/Engineer/QA），Raft 说 name（Noel/Bugen/Tenny）才是 instance、才压缩历史。role 是 schema，name 是 instance。

### 13.3 盲点（Raft 没做的，是我们的机会）

1. **闭源 + 不可自托管**：Raft 闭源 SaaS。我们 agents-remote 是开源/自托管路线——这是我们的差异化（Multica/LobeHub/Orkas 都开源，证明这条路有需求）。
2. **Windows 原生未完成**：Raft Windows 走 WSL。我们若先做好 Windows 原生支持，是个切入点。
3. **Enterprise 未上线**：Raft Enterprise coming soon。私有部署/SSO 还没货——企业市场还没人占。
4. **无明确的工作流/编排模板沉淀机制**：Raft 有 use case（engineering/investing/job-hunting/growth）但都是文档级，没看到"可复用 workflow template / skill marketplace"。我们 PRD 的"skill marketplace"是机会（Multica 的 skill sharing 印证这条路）。
5. **中国访问**：Raft app console 海外托管，中文用户需 VPN（🟡 codepick 实测）。我们若做好国内可达（私有部署 / 国内 mirror），是天然切入点。
6. **Mobile-first 不足**：Raft 是 desktop-first（daemon + 终端），移动端是 PWA 附属。我们 agents-remote 是 mobile-first（手机竖屏优先），切入移动场景。
7. **无明确的多 agent 调度策略**：Raft 是"agent 自己 claim"的市场经济，没看到优先级/资源分配/成本控制的显式调度。Ed Huang 烧 1.2B tokens/day 说明成本治理是用户自管——我们若内置成本/资源调度是机会。

### 13.4 ★ 为什么 Raft 是用户"想要的形态"（核心结论）

**用户看了 9 个参考产品（Grok Bot/Claude Tag/todos.dev/cloudflare-os/Avernet/Buzz/Paperclip/Multica/Superset）后说"这才是想要的形态"，根因有 5 条：**

1. **它把 agent 当 teammate 不当 tool（最根本）**。Grok Bot/todos.dev/cloudflare-os 都是"人用 agent"的工具范式——agent 是被调用的能力。Raft 是"人和 agent 共事"的团队范式——agent 是有 name/identity/memory/自管时间表/能造 agent 的常驻成员。**这是范式的跃迁**，不是增量优化。用户要的是"当老板指挥一支 agent 团队"（OPC），不是"用一个更强的 agent"。

2. **它解决了多 agent 在一个 room 里的协作问题（AX）**。别的产品把多 agent 塞一个房间就以为解决了协作——Raft 知道那只是噪音的开始。inbox/held draft/AX 四问把 agent 当 turn-based 物种伺候，是市面上**唯一**正面解决这个问题的产品。用户直觉感到的"这就是对的形态"，核心就是这套 AX 设计。

3. **它的状态架构对（共享 conversation + 私有 memory + pull 桥）**。cloudflare-os 倾向"全共享 brain"，Raft 明确反对（"deletes the specialists"）；todos.dev 倾向个人单 agent，Raft 做团队多 agent。Raft 的"共享 room + 每 agent 私有 memory + 靠消息桥"对应我们三层模型最贴。

4. **本地执行 + 隐私 + BYO 订阅**。用户在 agents-remote 里反复强调"代码/凭证不出本机"——Raft 用 daemon 跑用户硬件、runtime 用自己订阅、agent-vault 防 secret 泄漏，**和我们 agents-remote 的 hybrid 同源**。Grok Bot/Claude Tag 是纯云 SaaS，不满足这条。

5. **它的 UI 是 IM 美学（channels/DMs/threads/@mention）**。用户在 agents-remote 的前端实现里大量用了 Slack-like IM 原语（channel/thread/mention）——Raft 把这套原语做得最完整、最"agent-native"。Meng Qi 证言"millennial web chat nostalgia"说明这套美学是有吸引力的。

**对应我们已讨论的三层模型/agentmore/聊天派活/本地执行**：
- 三层模型（同事/项目/协作）：Raft 全中。同事=agent、项目=server+channel、协作=channel+task+joint channel。
- agentmore（agent 作为可寻址同事）：Raft 全中，且 name > role 是强化。
- 聊天派活：Raft 全中，@mention + task = message + Convert to Task 全套。
- 本地执行：Raft 全中，daemon + workspace tied to computer + agent-vault。

**结论：Raft 是我们 PRD 的最接近现成形态。PRD 该怎么对齐它 + 补它没做的：**
- ✅ 抄：channel/DM/thread/task board 状态机、agent persistent identity + workspace memory、@mention 派活、claim 硬约束、verification gate（builder ≠ verifier）、生产按钮人来按、Joint Channel 跨边界协作、AX（inbox/held draft/四问）、agent-aware 计费。
- ➕ 补：开源/自托管、Windows 原生、Mobile-first、skill marketplace（可复用 workflow）、内置成本/资源调度、国内可达、Enterprise 私有部署。
- ⚠️ 调整：memory 从"团队共享 pool"改成"per-agent + 消息桥"；审批从"人 review diff"改成"多 agent 互审 + trace 兜底"；agent 身份从"role 为主"改成"name 为主 + role 为辅"。

### 13.5 Raft vs todos.dev vs claude-tag 关键差异

⚠️ 说明：todos.dev 我们还没做深度走查（本调研只看 raft + 已有 pm-claude-tag.md），下表 todos.dev 列基于其在 9 个参考里的定位（todos/任务驱动）+ 公开认知推断，标 ⚠️；claude-tag 列基于 `pm-claude-tag.md` 直证，标 ✅。

| 维度 | **Raft** ✅ | **Claude Tag** ✅（见 pm-claude-tag.md）| **todos.dev** ⚠️（待深查）|
|---|---|---|---|
| **核心范式** | 人 + agent 作为 teammate 共事（团队范式）| 团队共用一个 Claude 身份装进 Slack（共享 bot 范式）| todos/任务驱动的 agent 协作（推断）|
| **agent 身份** | 每 agent 独立 persistent identity + name + memory + workspace | **一个团队共用一个 Claude**（不是每人一个），身份是"Claude"这个共享 bot | ⚠️ 待查 |
| **协作面** | 自有 IM（channel/DM/thread/task board/joint channel），agent-native 重新设计 | **寄生在 Slack**，channel/thread 是 Slack 原生，Claude 是其中一个成员 | ⚠️ 推断 todos/kanban 为主 |
| **AX（agent 感官设计）** | ✅ 核心差异化（inbox/held draft/AX 四问）| ❌ 无（Slack 是人用 IM，agent 当 bot 接收消息）| ⚠️ 推断无 |
| **本地执行** | ✅ daemon 跑用户硬件 + workspace tied to computer | ❌ Anthropic 云端跑 session（Slack channel 是前端）| ⚠️ 待查 |
| **多 agent** | ✅ 原生多 agent（mixed runtime、agent 互 @、互审）| ❌ 单一 Claude 身份（一个频道一个 Claude，不是多 agent 编排）| ✅ 推断原生多 agent |
| **runtime** | 9 种 CLI（Claude/Codex/Gemini/OpenCode/Kimi/Copilot/Cursor/Antigravity/Pi）BYO | 仅 Claude（Anthropic 自家）| ⚠️ 待查 |
| **审批/介入** | verification gate（builder ≠ verifier）+ 生产按钮人来按 + 多 agent 互审 | thread 里人 review + Open session 看 tool call + 管理员配消费上限 | ⚠️ 待查 |
| **memory** | per-agent workspace memory，**不共享 brain** | 频道累积的团队上下文 + 跨会话跨天记忆（频道级共享）| ⚠️ 待查 |
| **跨公司协作** | ✅ Joint Channel（最多 3 server，单条 conversation 投影双方）| ❌（Slack connect 可达，但 Claude Tag 没专门设计）| ⚠️ 待查 |
| **定价** | $8.80/seat/月，**agent = 0.1 seat** | Team/Enterprise beta，Anthropic 订阅 | ⚠️ 待查 |
| **闭/开** | 闭源 SaaS，不可自托管 | 闭源 SaaS（Anthropic 官方）| ⚠️ 待查 |
| **终极用户画像** | "AR, Agent Resource Manager"（操作员→资源管理者）| 团队共用一个 AI 队友（Slack 用户）| ⚠️ 推断 personal productivity |

**一句话差异**：
- **Raft** = 多 agent × agent-native IM × 本地执行（团队 + 编排 + 隐私）。
- **Claude Tag** = 单 Claude × Slack 寄生 × 云端（团队共享 bot，最易上手但无编排）。
- **todos.dev** = ⚠️ 推断 todos 驱动 × 任务为主（personal/team productivity，可能轻量但缺 IM 协作面）。

**⚠️ PM 关键判断**：用户要 OPC（一人公司 = 一个人指挥多 agent 团队），**只有 Raft 的范式对**——Claude Tag 是"团队共用一个 bot"不是"一个人指挥一支 agent 军"，todos.dev（待查）可能是"个人用 agent 管任务"不是"团队协作"。Raft 命中的是"**agent-native teammate + 多 agent 编排 + 本地执行**"三者交集，这正是 OPC 的形状。

---

## 14. 证据分级与来源

### 14.1 ✅ 一手直证（官网 / 官方文档 / 官方博客 / 官方 GitHub）
- **官网** raft.build：首页（hero/示例 channel/trusted-by/testimonials/team/pricing/FAQ）、`/events/`（Shanghai/Vancouver/SF meetup）、`/resources/use-cases/`（engineering/investing/job-hunting/growth 四模板）、`/resources/blog/` 全索引。
- **官方文档** docs.raft.build（VitePress，LLM-friendly markdown）：`/llms.txt`（全 TOC）、`/welcome.md`、`/meet-your-onboarding-agent.md`、`/build-your-agent-team.md`、`/divide-the-work.md`、`/catch-up-in-one-place.md`、`/features/server.md`、`/features/server/computers.md`、`/features/server/members.md`、`/features/agents.md`、`/features/agents/runtime.md`、`/features/agents/workspace.md`、`/features/agents/external.md`、`/features/agents/lifecycle.md`、`/features/agents/reminders.md`、`/features/messaging/channels.md`、`/features/messaging/joint-channels.md`、`/features/messaging/activity.md`、`/features/collaboration/tasks.md`、`/features/apps.md`、`/developers/raft-apps.md`。
- **官方博客** raft.build/resources/blog/：
  - "Introducing Raft"（Richard，2026-05-21）
  - "Is Having Agents in the Room Meant to Be Chaotic?"（Tenny，2026-05-21）—— **AX 设计宪法**
  - "Agents Need Names"（xxchan，2026-06-03）—— **身份哲学**
  - "The Metric That Finally Counts Your Agent Teammates: Introducing DAA"（Wenyi，2026-06-15）
  - "A Comfortable AX for Agent Search"（Tenny，2026-06-11）
  - "Trust Doesn't Live in Code Review"（Tenny，2026-06-30）—— **审批哲学**
  - "You Don't Need a Company Brain"（Cindy Zhao，2026-07-06）—— **memory 哲学**
  - "How a Feature Ships, for Raft, on Raft"（Tison + tygg，2026-07-13）—— **verification gate 实录**
  - "Don't talk to me, talk to my agents"（Wug + Wenyi，2026-07-19）—— **Joint Channel**
- **官方 GitHub** github.com/botiverse：`agent-vault`（434 star，secret-aware file I/O）、`raft-external-agents`（Claude Code channel plugin）、`raft-docs`（公开文档源码，证实前身 slock.ai → raft.build rename）、`raft-survey-sample`、`opencan`（Swift）、`hermes-agent`（fork）、`kimi-agent-rs`/`kimi-code-sdk`（fork，Moonshot Kimi 对接）、`agent-git-service`（fork）。
- **app.raft.build**：React SPA + Socket.IO + markdown vendor，Cloudflare Pages 托管，theme-color `#FFD440`。

### 14.2 🟡 二手（深度第三方 / AI 工具库 / HN 评论）
- **codepick.dev**：`/en/guides/slock-setup/`（2026-05-19，实测 Task Claim/MEMORY.md/daemon/常见坑/4 平台横评）、`/en/tool/slock/`（2026-05-09，打分 Coding 8.0/Value 9.5/Flexibility 8.5/China 8.0）。https://codepick.dev/en/guides/slock-setup/
- **HN Algolia**：
  - story 48552422 "Agents Need Names"（xxchan22 提交，3 points，0 评论）https://news.ycombinator.com/item?id=48552422
  - story 49040456 "We (Agents) Build Software for Humans"（tygg 提交，1 point，0 评论）https://news.ycombinator.com/item?id=49040456
  - story 47280200 "Anthropic, please make a new Slack" 评论里 sergiotapia 提及 slock.ai（"a dude that worked at one of the chinese ai labs"）https://news.ycombinator.com/item?id=47280200
  - slock.ai blog 提交（"Is having agents in the room meant to be chaotic?"，0 评论）
- **navtools.ai / toolify.ai / aikii.org / moge.ai**：AI 工具目录站（复抄官网文案，弱证据）。
- **SourceForge / Slashdot / topbusinesssoftware**：收录页（无评分，弱证据）。

### 14.3 ⚠️ 推断（PM 综合判断，未直接证实）
- workspace tied to computer 是隐私换便携的刻意取舍。
- HN 冷清是渠道选择（华人圈 + 北美创业圈 + 线下 meetup）而非产品质量问题。
- 1.2B tokens/day 是 peak 不是均值。
- Memory 应 per-agent 不应共享 brain（虽博客已明确论证，但我们 PRD 是否完全采纳仍待定）。
- todos.dev 列在 §13.5 对比表均标 ⚠️（未深查，待补 pm-todos-dev.md）。
- "Raft 是 PRD 最接近现成形态"是 PM 综合判断。

### 14.4 未覆盖 / 待补
- **todos.dev 深度走查**（§13.5 对比表急需补全）。
- **Reddit 真实评论**（JSON 端点被限流，需换 user-agent 重试或 web 端抓取）。
- **中文社区（即刻/掘金/知乎）**讨论（DDG 命中中文评测站但未深入社区帖）。
- **试用实测**（需真实注册 + 连 computer + 跑多 agent，验证 AX 实际体验是否如博客所述）。
- **Pricing 页**（`/pricing` 是 404，pricing 在首页 `#pricing` anchor，已从首页抓到完整三档）。
- **Pi runtime**（docs 列了 Pi 作为第 9 种 runtime，pi.dev，我们已有 `../../research/pi-access-options.md` 调研，可交叉印证）。

---

> **PM 一句话总结**：Raft 是目前市面上**形态最接近 OPC 多 agent 编排**的现成产品，它把"agent 当 teammate"+"chat 即派活"+"本地执行"+"AX（agent 感官设计）"+"per-agent memory 不共享 brain"+"verification gate 审批"全做出来了。我们 agents-remote 的 PRD 应以它为最接近基准**抄架构 + 补它的盲点（开源/Windows/Mobile/skill marketplace/国内可达/Enterprise）**。最该补的一章是 **AX**——这是我们 PRD 的最大盲区，也是 Raft 真正的护城河。
