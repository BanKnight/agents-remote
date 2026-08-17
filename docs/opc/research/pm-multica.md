# Multica 产品调研（PM 视角）

> **仓库**：`multica-ai/multica`（Go 后端 + Next.js 前端 + Electron 桌面 + iOS 移动 + 多端 CLI/daemon；约 43.4k stars 🟡）。
> **定位**：AI-native 项目管理平台，把 AI coding agent 当一等公民 teammates，分配 issue、看板追踪、Squad 协作。
> **证据分级**：✅ 官方源码/README/docs（经 deepwiki 二次确认） / 🟡 二手（社区/tvly 摘要） / ⚠️ PM 推断。
> **承接**：`./multi-agent-orchestration.md` §3.2（同源信息，本文件 PM 视角重写，不搬运技术细节）。
> **调研方法**：deepwiki `ask_question` 多维度提问（Squad / issue / @mention / daemon / claim / 介入 / 记忆 / 商业 / feature 全维度 / autopilot / runtime）+ tvly 补充社区信号。

---

## 1. 一句话定位

Multica 是把 AI coding agent（Claude/Codex/Copilot 等）当成**项目里的一等公民 teammate**的开源项目管理平台——你把 issue 分配给 agent 或 Squad，daemon 自动探测 PATH 上的 CLI、claim 任务、spawn 到隔离 workspace 干活、产出 PR 供你 review，**issue 是 unit of work、Squad 是团队、@mention 是派活动作**。✅

一句话的产品意图：**让小团队靠 multiplex 人 + AI agent 达到大团队的产出**。✅

> ⚠️ **「AI-native」是目标态非现状（`pm-multica-community.md` 走查纠正）**：社区 #815（`ImGoodBai` 16react，2026-04-13）深度戳穿——「Multica still manages AI the way it manages people... it does not yet have a first-class orchestration core... today the answer is still mostly 'the human'」。官方 `Bohan-J` 长文回应承认：「today Multica may feel more 'human-led' than you'd like. That is intentional for this stage, not a permanent design limitation... human-in-the-loop as a feature, not a limitation」。workflow orchestration 一等公民 on the roadmap **无时间表**（#1943 17react / #4804 Done-Gate / #6227 SDLC 定位 全是未解诉求）。引用 Multica 当「AI-native PM 标杆」时应注明「目标态非现状」。

---

## A. 根本使用场景

主场景是**「把一件活派给 AI agent，它自己拉分支干完、开 PR 等你 review」**，全程在一个类 Linear/Jira 的看板 UI 里追踪。✅

一段用户旅程：

1. **接入**：你在 multica.ai 注册（或自托管 Docker Compose/Helm），onboarding 第一步是「Connect a computer」——装 multica CLI 跑 `multica setup`，或装 Multica Desktop app（自动注册本机为 runtime）。daemon 后台启动，自动扫 PATH 上的 `claude`/`codex`/`copilot`/`cursor-agent`/`qwen`/`kimi` 等 20+ CLI，每个都注册成一个可用 runtime。✅
2. **建 agent**：你在 web 上「Create agent」，起个名字（比如「Backend Bot」）、选 runtime（Claude Code）、选 model、写 instructions（角色人格 + 工作方式）、勾 skills、设 access（只我 / 全工作区 / 指定人）、设并发上限和 env vars。agent 是**身份 + 配置**，不是常驻进程。✅
3. **派活**：你建一个 issue（标题 + 描述 + status=`todo`），assignee 选「Backend Bot」。issue 一分配、status 不是 `backlog/done/cancelled`，后端立刻 enqueue 一个 task 到该 agent 的队列。✅
4. **daemon 认领 + spawn**：你本机的 daemon 每 3 秒 poll 一次，命中 task 后原子 claim，`execenv.Prepare` 在 `~/multica_workspaces/<workspace>/<task>/` 建隔离目录，按需 `multica repo checkout` 出 git worktree，注入 `CLAUDE.md`/`AGENTS.md` 指向 skill 目录和 meta skill（教 agent 用 `multica` CLI 查 workspace 信息），spawn 该 CLI 进程，把 `MULTICA_TOKEN`/`MULTICA_TASK_ID`/`MULTICA_WORKSPACE_ID` 注入 env，流式回传输出。✅
5. **agent 执行**：CLI 进程读 issue 描述 + 讨论评论 + 注入的 skills + 元 skill，自己拉分支、改代码、跑测试，期间通过 `multica issue status` 把 issue 推进（`in_progress`），通过评论回报进度。实时进度走 WebSocket 流到你的浏览器，你能看到每个 tool call/command/error 的执行日志。✅
6. **产出 PR**：agent 改完代码开 PR，PR 在 Git 平台（GitHub/Forgejo/Gitea/GitLab）上。Multica 通过 PR 标题/分支/body 里的 issue 标识符（如 `MUL-123`）自动把 PR 链回 issue 详情，显示 PR state/CI/mergeability/lines changed。✅
7. **进 review**：agent 自认完成，`multica issue status <id> in_review`，issue 卡片移到「In Review」列，等你。✅
8. **你 review + merge**：你在 Git 平台 review PR、提 comment（comment 会反向触发 agent 再跑一轮处理你的反馈——「Reply mode」）、approve merge。merge 时若 PR 带 `Closes MUL-123` close intent 且无其他 open/draft PR，issue 自动 `done`。✅
9. **清理**：agent 进程干完即退出（非常驻）。daemon 的 GC 按 `MULTICA_GC_TTL`（issue `done/cancelled` 且 idle 后）清整个 task 目录，orphan（crash 残留）按 `MULTICA_GC_ORPHAN_TTL` 清，artifact 按 `MULTICA_GC_ARTIFACT_TTL` 清。✅

**进阶场景（Squad）**：把一件大活派给一个 Squad（leader agent + members），leader 读 issue、按 Squad Roster 里成员的 skills 匹配、在 issue 评论里 `@mention` 成员触发新 task、自己停下；成员干完评论回报，leader 被自动 re-trigger 协调下一步；child issue 关闭 stage barrier 时 parent leader 被唤醒。整个协调轨迹记在 squad activity timeline。✅

**辅助场景（Autopilot）**：cron 或 webhook 触发的「AI 定时任务」，`create_issue` 模式自动建 issue + 派给 agent（可见可追踪），`run_only` 模式直接跑、结果挂 `AutopilotRun`（后台静默）。✅

**轻量场景（Chat）**：侧栏 Chat 直接和某个 agent 私聊，每条消息触发一次 run，无 issue 上下文、工作区成员看不到，适合快速问/头脑风暴/小活。✅

---

## B. 解决的痛点

1. **agent 是孤立的 CLI，没有「工作流」容器** ✅：Claude/Codex 等 CLI 各跑各的，跑完进程消失，没有 issue 绑定、没有进度追踪、没有产出归档——痛在「我让 agent 干了啥、干到哪了、产物在哪」全靠你自己记。Multica 把 issue 当容器，task = 一次 run，PR = 产物，全挂在同一 issue 下，intent/run/decision/diff 不断线。

2. **没法把活「派给」agent，只能自己守着终端** ✅：传统用法是你开终端、起 CLI、盯着、输 prompt、看输出。痛在「agent 是工具不是同事」——你得全程在场。Multica 让你像派活给同事一样 assign issue，daemon 自动起、你走开、回来看 PR。

3. **多 agent 之间没法分工协作** ✅：单 agent 干不了需要多职能（调研 + 开发 + review）的活，但你又不想自己当人工调度器。痛在「协调成本吃掉 agent 红利」。Multica 的 Squad + leader + @mention 让 leader 自动按 skills 路由、你只管看协调轨迹。

4. **agent 产出直接进 main 没闸门** ✅：agent 改完代码没审批就合，风险高。痛在「不敢让 agent 真改主分支」。Multica 强制走 PR → in_review → 你 merge，agent 不能自己把 issue 标 done（merge 触发 done 是系统行为，且需 close intent）。

5. **不同 CLI provider 各一套配置，没法统一管** ✅：Claude/Codex/Copilot/Cursor 等登录态、模型、权限各搞各的，想换 provider 要重学。痛在「换 agent = 换工具链」。Multica daemon 自动探测 20+ CLI，runtime 面板统一管，agent 配置层抹平 provider 差异。

6. **小团队没有 AI-native 的项目管理工具** ✅：Linear/Jira 是给人用的，AI agent 是二等公民（顶多 webhook 接进来）。痛在「人和 agent 不在一张看板上」。Multica 是 AI-native PM，agent 和人同框 issue/看板/通知。

7. **agent 跑过的活没法复用知识** ✅：每次跑都从零开始，team knowledge 不累积。痛在「agent 经验不沉淀」。Multica 的 Skills（可复用指令包，按 agent 分配、注入 workDir）让团队知识复利。

---

## C. Feature list（完整功能清单）

> 按 PM 维度分组，每条一行可点的功能。✅ = 官方源码/docs 确认；🟡 = 社区/daily.dev 摘要；⚠️ = PM 推断。

### C.1 用户入口与平台形态
- **Landing page** ✅：官网介绍 + web app / desktop 下载 CTA，i18n 多语言。
- **Web app（Next.js）** ✅：主入口，浏览器操作 agents/issues/看板/chat。
- **Desktop app（Electron）** ✅：macOS/Windows/Linux，装上自动注册本机为 runtime + 自动探测 CLI，带 auto-update + daemon manager。
- **Mobile app（iOS）** ✅：官方 iOS 客户端，覆盖 login/workspaces/inbox/issues/projects/chat/comments/reactions/presence/live updates（需自行从源码编译安装）。
- **Inbox 通知中心** ✅：按 member 聚合「需要你关注」的活动（分配/评论/@mention/reaction/agent 失败/autopilot 失败），多条同 issue 合并，自己动作不通知，可标已读/归档/调通知类型。
- **Self-hosting（Docker Compose / Helm / K8s）** ✅：完整自托管，数据不出网。
- **Hosted SaaS（multica.ai）** ✅：托管版，free trial 入口。
- **Onboarding flow** ✅：sign-in → connect a computer（runtime connect，等本机连上给 troubleshooting hint）→ 配 agent → 跑活。

### C.2 Agent 管理
- **Create agent** ✅：name/avatar/description（人看的，不进 prompt）/instructions（角色人格，每次 run 注入）/skills/runtime/model/thinking level/access/execution settings。
- **Runtime 选择** ✅：agent 绑定一个 runtime（即一个 CLI provider），决定它跑在哪个 CLI 上。
- **Model + thinking level 选择** ✅：runtime 确定后选该 CLI 支持的 model 和 thinking level，留空走 CLI 默认。
- **Permission mode（access）** ✅：「Only me」（默认）/「Entire workspace」/「Specific people」——谁能 run 这个 agent。
- **Execution settings** ✅：并发上限、自定义 env vars、自定义 CLI args、MCP 配置（server-side 存）。
- **Skills 分配** ✅：agent 绑定多个 skill，run 时注入到 `{workDir}/.claude/skills/{name}/SKILL.md`（按 provider native 路径），已有 skill 不覆盖。
- **Archive agent** ✅：归档保留配置和历史，runtime 删了也不丢。
- **Agent CLI（`multica agent create` 等）** ✅：命令行管 agent。
- **Chat with agent** ✅：侧栏 Chat → 选 agent → 私聊，每条消息触发一次 run，无 issue 上下文，工作区成员不可见，agent 仍能用 multica CLI 查 workspace（受权限约束）。

### C.3 Issue / Task 管理（核心）
- **Internal issue 系统** ✅：Multica 自有 issue（非 GitHub issue 直接导入），issue = unit of work（描述/讨论/status/history）。
- **Board view** ✅：按 status 分列的看板，支持 swimlane（按 parent/project/assignee 分泳道）。
- **List view** ✅：列表展示，拖拽排序，sticky group headers。
- **Issue detail** ✅：描述 + 讨论评论 + status history + linked PRs + properties + labels，全部可看。
- **Property pickers** ✅：自定义 issue 属性。
- **Comments** ✅：增删改评论，多附件，统一的 @mention 行为（mention markdown `[@Label](mention://<type>/<id>)`）。
- **Statuses** ✅：`backlog`/`todo`/`in_progress`/`in_review`/`done`/`cancelled` 六态，agent 和人都能推（agent 用 CLI，人用 UI）。
- **Issue labels** ✅：彩色标签 + 跨 list/board/detail 过滤。
- **Projects** ✅：把相关 issue 归到一个 Project（单一目标 + 进度追踪 + 绑定 repo/目录资源）；autopilot 可指定 auto-created issue 进哪个 project。
- **Sub-issue / parent-child** ✅：issue 可建 child issue，child 关闭 stage barrier 自动唤醒 parent squad leader。
- **Issue assignment** ✅：assignee 可以是 agent / human / squad；assignee_type=`squad` 时路由到 squad.leader_id。
- **Status gate** ✅：`backlog` park（assigned 但不触发）；移到非 done/cancelled 才 enqueue。
- **Issue runs history** ✅：`multica issue runs <id>` 看 run 历史；`multica issue usage <id>` 看聚合 token 成本。
- **Real-time progress streaming** ✅：WebSocket 推 agent 工作过程，浏览器实时看。

### C.4 Squad（团队协作）
- **Create squad** ✅：组一个 Squad（leader agent + members，member 可 agent 可 human）。
- **Leader agent（强制 AI）** ✅：Squad 必有 leader，且必须是 agent；leader 只协调不干活。
- **Squad briefing 注入** ✅：issue 分给 squad 时 leader 收到 briefing = Squad Operating Protocol（硬编码规则：协调不干活、@mention 派活、terse、记 evaluation、dispatch 后 stop）+ Squad Roster（成员名单 + mention markdown + skills）+ Squad Instructions（用户自定义路由/升级策略，只给 leader）。
- **Leader @mention 派活** ✅：leader 读 issue + 按 Roster skills 匹配，发一条评论 @mention 成员，触发该成员新 task。
- **Leader stop after dispatch** ✅：派完即停，不继续干活。
- **Leader re-trigger** ✅：成员回报更新 / child issue 关 stage barrier / 有人 @mention leader → leader 重新唤醒评估下一步。
- **Mention suppression** ✅：成员评论里若已显式 @mention 别人（agent/squad/member/all），leader 不被触发（人已手动路由）。
- **Self-trigger 防环** ✅：leader 自己评论不触发自己；但 agent 结果 @mention 别人时 leader 仍唤醒协调。
- **Squad activity timeline** ✅：`multica squad activity <issue-id> <outcome> --reason "..."` 记录 leader 每次评估，透明可追溯。
- **Squad CLI** ✅：`multica squad` 系列命令建/改/加成员。

### C.5 @mention 触发机制
- **Mention markdown 格式** ✅：`[@Label](mention://<type>/<id>)`，type = member/agent/squad/issue/all，id = UUID 或 `all`。
- **Parse mentions** ✅：`util.ParseMentions` 解析评论提取 `{Type, ID}`。
- **Trigger computation** ✅：`computeCommentAgentTriggers` 算评论触发谁——显式 @agent/@squad 优先于隐式路由；@squad 解析到 leader；@agent 直接该 agent；member/issue mention 只渲染链接不触发 task。
- **Suppression filter** ✅：`filterSuppressedCommentAgentTriggers` 过滤被抑制的 agent。
- **Enqueue** ✅：`enqueueCommentAgentTriggers` 建任务——@squad 走 `EnqueueTaskForSquadLeader`（标 `is_leader_task=true`），@agent 走 `EnqueueTaskForMention`，校验 agent 未归档 + 有有效 runtime。
- **Coalescing / 去重** ✅：同 agent 已有 pending task 时合并/延后，避免重复 run。
- **multica-mentioning skill** ✅：builtin skill 教 agent 怎么构造 mention 链接 + 哪些 mention type 会触发 task。

### C.6 审批 / Review / Merge
- **PR linking** ✅：PR 标题/分支/body 含 issue 标识符（`MUL-123`）自动链回 issue；只 body 里有需 `Closes MUL-123` close intent。
- **PR card in issue detail** ✅：显示 repo/number/title/author/state（Open/Draft/Merged/Closed）/lines changed/CI status/mergeability。
- **Agent moves to in_review** ✅：agent `multica issue status <id> in_review` 自认完成；squad leader 只在整体目标达成才推 parent 到 in_review。
- **Human review PR** ✅：人在 Git 平台（GitHub/Forgejo/Gitea/GitLab）review，提 comment。
- **Comment 反向触发 agent（Reply mode）** ✅：人在 issue 评论 redirect/反馈 → 触发 agent task，brief 教 agent 处理「Reply mode」+ 处理更早 coalesced comments。
- **Merge → auto done** ✅：merge PR 满足三条件（至少一个 merged linked PR 带 close intent + 无其他 open/draft PR + issue 非 done/cancelled）→ issue 系统自动 `done` + 通知订阅者。
- **Cancelled** ✅：用户驱动的终止态，保留记录，不停 in-flight task。
- **Work lands in review not main** ✅：agent 产出不直接进 main，走 PR 闸门，你决定 ship 什么。

### C.7 记忆与上下文
- **Skills（可复用能力包）** ✅：code/config/context 组合，workspace 级管理、按 agent 分配，run 时注入 provider native 路径（如 `.claude/skills/{name}/SKILL.md`），已有不覆盖（换目录名）。
- **Skill create / import** ✅：`multica skill create --name --description --content`；`multica skill import` 从 URL/本地 archive 导入。
- **Builtin skills** ✅：`multica-squads`（squad leader 路由协议）/`multica-mentioning`（mention 构造与触发）/`multica-working-on-issues`（issue + PR 系统交互规则）/`multica-autopilots`（autopilot 管理）。
- **Meta skill 注入（CLAUDE.md / AGENTS.md）** ✅：daemon 注入 meta skill 教 agent 用 `multica` CLI 查 workspace 上下文 + 指向 injected skill 目录；`InjectRuntimeConfig` 处理。
- **Instructions 注入** ✅：agent 的 `instructions` 字段每次 run 注入 prompt（角色人格 + 工作方式 + 边界 + 交付要求）。
- **Session resume** ✅：存 CLI session id，同 issue 续跑优先 resume 该 session，不能 resume 则新建 session + 发「Session Continuity Notice」告知 agent 历史 may 丢失（保 prompt-cache prefix 稳定）。
- **Run-scoped context append** ✅：`buildPromptBody` 按 task 类型（chat/comment/autopilot）选 builder，run-scoped 上下文追加进 prompt body，保留前 run 上下文同时加新 turn 信息。
- **TriggerCommentID 作为 --parent** ✅：comment 触发的 task 把 TriggerCommentID 当 `--parent`，每 turn 重发避免 resumed session 带旧 UUID。
- **Cross-issue context** ⚠️：单 issue 内 task 共享 session；跨 issue 记忆未见显式机制（推断靠 skills 沉淀 + agent instructions，非结构化长记忆）。

### C.8 Autopilot（定时 / 事件触发）
- **Autopilot 实体** ✅：Runbook + assignee + 多 trigger，workspace 级。
- **create_issue 模式** ✅：触发时建 issue + 派给 agent/squad leader + enqueue task，可见可追踪，离线 queue 等回线不丢。
- **run_only 模式** ✅：直接触发 task 不建 issue，结果挂 `AutopilotRun`，后台静默，离线 skipped 防 doomed 堆积。
- **Cron schedule** ✅：cron 表达式 + IANA timezone，`ScheduleEditor` 组件配置。
- **Webhook trigger** ✅：外系统 POST JSON 到 unique URL，支持 event filter，`webhook_token` 可 rotate。
- **Autopilot CLI** ✅：`multica autopilot trigger-add` 加 schedule/webhook trigger；`multica-autopilots` skill 教 agent 用 autopilot CLI。
- **失败自动暂停** ✅：连续失败后 autopilot 自动 paused（inbox 会通知）。

### C.9 Runtime / Daemon / 执行
- **Local daemon** ✅：本地常驻进程，桥接 Multica server 和本机 CLI；`mdt_` 前缀 daemon token 鉴权。
- **PATH CLI 自动探测** ✅：`probeAgentCLIs` 扫 PATH + macOS app bundle 路径，找不到走 login shell 解析（覆盖 `~/.zshrc` 加的路径），shell resolve 缓存 30 分钟。
- **20+ CLI provider 支持** ✅：claude/codex/copilot/cursor-agent/opencode/openclaw/hermes/pi/agy/codebuddy/deveco/grok/kimi/kiro-cli/qodercli/qoderclicn/qwen/qwenpaw/reasonix/traecli 等。
- **PATH 覆盖 env** ✅：`MULTICA_CLAUDE_PATH`/`MULTICA_CODEX_PATH` 等覆盖默认命令路径。
- **Poll + claim** ✅：默认 3 秒 poll（`MULTICA_DAEMON_POLL_INTERVAL`/`--poll-interval`），`ClaimTask` 原子认领。
- **Heartbeat** ✅：每 15 秒心跳报 online。
- **隔离 workspace** ✅：`~/multica_workspaces/<workspace>/<task>/`，每 task 独立目录。
- **Git worktree checkout** ✅：`multica repo checkout` 按需出 worktree，源是 `.repos/` 下 shared bare clone。
- **Task-scoped auth 注入** ✅：`MULTICA_TOKEN`/`MULTICA_SERVER_URL`/`MULTICA_WORKSPACE_ID`/`MULTICA_TASK_ID` 注入 env。
- **Auto-update daemon** ✅：`MULTICA_DAEMON_AUTO_UPDATE` 检查并应用 CLI 更新；`MULTICA_DAEMON_AUTO_RELOAD` 二进制被替换后重启 daemon。
- **CLI 升级 re-probe** ✅：agent CLI 升级后 daemon re-probe 版本 + re-register runtime，不重启 daemon。
- **GC 清理** ✅：full cleanup（issue done/cancelled + idle `MULTICA_GC_TTL`）/ orphan cleanup（crash 残留 `MULTICA_GC_ORPHAN_TTL`）/ artifact cleanup（regenerable 产物 `MULTICA_GC_ARTIFACT_TTL`）。
- **local_directory 模式** ✅：用用户绝对路径替代 envRoot/workdir，task 后 `CleanupRuntimeConfig`+`CleanupSidecars` 还原 repo 到 task 前状态。
- **Agent 不常驻** ✅：CLI 进程干完即退（task 完成/失败 daemon 报终态），非常驻；lifecycle 靠 daemon 管 + GC 回收。
- **Runtimes 面板** ✅：web 上统一管 local daemon + cloud runtime，看 status/usage/activity/online 离线 + usage 图 + activity heatmap。
- **Add a computer** ✅：web「Runtimes」→「Add a computer」→ 贴两条命令到目标机终端（装 CLI + `multica setup`）。

### C.10 集成
- **GitHub PR linking** ✅：PR title/branch/body 含 issue 标识符自动链；只 body 需 close intent。
- **Forgejo / Gitea / GitLab PR linking** ✅：自托管 Git 实例同样 PR auto-link + CI 显示。
- **Chat 集成（Slack / Lark / DingTalk / WeCom）** ✅：在 IM 里和 agent 交互、@mention、从 IM 直接建 issue。
- **Webhook autopilot trigger** ✅：外系统事件触发 autopilot。
- **MCP 配置** ✅：agent execution settings 配 MCP（Managed Control Plane）。

### C.11 观察与运营
- **Activity timeline** ✅：人和 agent 动作交错的统一 feed，完整历史「谁干了啥」。
- **Execution log** ✅：每 agent run 的 tool call/command/error + timestamp 可回放。
- **Token usage** ✅：每 run / 每 agent / 每 issue 的 token 成本可看。
- **Real-time progress streaming** ✅：WebSocket live 看 agent 工作。
- **Runtime monitoring** ✅：runtime online/offline + usage chart + activity heatmap。
- **Inbox 通知** ✅：见 C.1。
- **Analytics / telemetry** 🟡：onboarding 步骤埋点（细节未公开，存在 telemetry 模块）。

### C.12 配置
- **Workspace settings** ✅：每 workspace 独立 agent/issue/settings（多团队隔离）。
- **File attachments + storage** ✅：评论/issue 附件存储。
- **Workspace member 管理** ✅：成员邀请/角色/权限。
- **i18n 多语言** ✅：landing + app 多语言。
- **allowSignup flag** ✅：托管版注册开关可控。

---

## 5. 核心概念

| 概念 | 是什么 | PM 视角 |
|------|--------|---------|
| **Issue** | Multica 内部 issue 系统，unit of work ✅ | 看板上的卡片、agent 的工作容器、PR 的归集点 |
| **Task** | 一次 agent run against an issue ✅ | issue 的执行记录，一个 issue 可产生多 task（初版/修复/反馈轮） |
| **Agent** | 身份 + 配置（name/instructions/skills/runtime/model/access）✅ | 一等公民 teammate，非常驻进程 |
| **Squad** | leader agent + members（agent/human 混）✅ | 团队，leader 自动协调派活 |
| **Leader** | Squad 强制 AI 的协调者，只协调不干活 ✅ | 自动 manager，读 issue 按 skills @mention 派活 |
| **Member** | Squad 成员（agent 或人），执行 leader 派的活 ✅ | 干活的，被 @mention 触发 |
| **Unit of work** | Issue ✅ | 一切围绕 issue 转——分配/讨论/status/PR/历史都挂它 |
| **@mention** | `[@Label](mention://<type>/<id>)` 触发新 task ✅ | 派活动作，comment-driven coordination |
| **Runtime** | 一台跑 CLI 的机器（local daemon 或 cloud）✅ | 执行面，agent 跑在 runtime 上 |
| **Daemon** | 本地常驻进程，桥接 server + CLI ✅ | 执行面 daemon，自动探测 + poll + claim + spawn + GC |
| **Claim** | daemon 原子认领 task ✅ | 抢活动作，避免重复执行 |
| **Skill** | 可复用指令包，按 agent 分配、注入 workDir ✅ | team knowledge 沉淀，跨 issue 复用 |
| **Autopilot** | cron/webhook 触发的自动 agent task ✅ | AI 定时任务，create_issue 可见 / run_only 后台 |
| **Project** | 相关 issue 集合 + 单一目标 + 绑 repo/目录 ✅ | 比 issue 高一层的组织单位 |
| **Workspace** | 多团队隔离的顶层边界 ✅ | agent/issue/settings/成员 per workspace |

---

## 6. 状态哲学（重点章节）

> **一句话**：状态焊在 **issue** 上——issue 是唯一权威容器，agent/task/PR/squad 都是 issue 的投影或事件；agent 身份是配置不是进程，非常驻；CLI workspace 是一次性隔间，task 完即清。

### 6.1 状态焊在哪

- **issue 是状态锚点** ✅：所有状态围绕 issue——status（6 态机）、assignee、comments、linked PRs、run history、activity、subscribers、labels、properties。agent/task/PR/squad activity 都是 issue 上的事件或属性。
- **agent = 配置非进程** ✅：agent 是 server-side 配置实体（身份 + instructions + skills + runtime + access），不是常驻进程。run 时 daemon spawn CLI，干完即退。
- **task = 一次性执行记录** ✅：task 是 issue 的子记录（一个 issue 多 task），有 `AgentTaskQueue` 入队、claim、start、result、终态。task 完不灭，是历史。
- **squad = 路由配置 + leader 协调轨迹** ✅：squad 是 assignee 的一种类型（assignee_type=squad），状态焊在 issue 上；squad activity timeline 是 leader 协调的审计日志。
- **runtime = 机器 + CLI 注册表** ✅：runtime 状态 = 在线/离线/usage/heatmap，daemon 心跳维护；agent 不绑死 runtime，可换。
- **workspace = 顶层隔离边界** ✅：agent/issue/project/skill/成员 per workspace，跨 workspace 不串。

### 6.2 换成员/换 issue/换 squad 分别意味着什么

- **换成员（agent）** ✅：换 issue 的 assignee（assignee_type=agent → 另一个 agent）——新 agent 没有旧 agent 的 session，开新 session（除非同 issue 内 task 共享 session resume）；旧 task 历史保留在 issue 上，新 agent 能看到旧评论和旧 PR（issue 是共享上下文）。**痛在「新 agent 要重读 issue 全部历史重建上下文」**——靠 issue 评论 + skills 沉淀，无结构化长记忆。

- **换 issue** ✅：换 unit of work 容器——assignee 不变，issue 变；agent 在新 issue 上是全新 session（无跨 issue session resume），靠 instructions + skills 携带角色知识，靠 issue 评论携带该 issue 上下文。**issue 之间无显式记忆链** ⚠️，靠 Project 归类 + skills 复用。

- **换 squad** ✅：换 issue 的 assignee（assignee_type=squad → 另一个 squad）——新 squad 的 leader 接管协调，按新 Roster 重新 @mention 派活；旧 squad 的 activity timeline 留在 issue 历史里。leader 的「协调记忆」是 issue 评论 + squad activity，非 leader 自身状态。

### 6.3 为什么这样焊

- **issue 是单一权威源**：Linear/Jira 范式的延续——PM 工具的 issue 本就是 work unit 锚点，agent 当 teammate 自然继承。好处是状态可追溯、人 agent 同框、PR 自然归集。
- **agent 非常驻省成本**：CLI 进程按需 spawn、干完即退、GC 回收，不用养 N 个常驻 agent 进程（对比 Buzz 1-32 池 + cf-os 单 DO）。代价是 session resume 需要机制兜底（存 session id + 不能 resume 发 Notice）。
- **daemon 常驻但 agent 不常驻**：daemon 是稳定执行面（poll/claim/spawn/GC），agent 是弹性消费面。daemon 重启不丢 issue 状态（state 在 server），只丢 in-flight task（GC orphan 兜底）。

### 6.4 状态哲学一句话

**issue 是锚，agent 是配置，task 是事件，workspace 是隔间，daemon 是执行面——agent/task/PR/squad 全是 issue 上的投影或事件，agent 非常驻，状态不焊在进程上。** ✅

---

## 7. 派活与编排交互

### 7.1 用户怎么下达工作
- **建 issue + assign** ✅：最主流——建 issue（标题/描述/status）→ assignee 选 agent/squad/human → status 非 backlog 即触发 task。
- **@mention in comment** ✅：在 issue 评论里 @agent/@squad 触发新 task（不改 assignee）。
- **Autopilot** ✅：cron/webhook 自动建 issue 或直接跑 task。
- **Chat** ✅：私聊 agent 不建 issue，每消息触发 run。
- **Chat 集成（Slack 等）** ✅：IM 里 @agent 或建 issue。

### 7.2 leader 怎么协调
1. issue assign 给 squad → 后端 enqueue leader task（`is_leader_task=true`）✅
2. leader run：prompt 注入 Squad Operating Protocol + Roster + Instructions ✅
3. leader 读 issue + 按 Roster skills 匹配 → 发一条评论 @mention 成员（带具体指令）✅
4. leader `multica squad activity <issue-id> <outcome> --reason` 记评估 → stop ✅
5. 成员 claim 新 task 干活 → 评论回报 → leader re-trigger ✅
6. child issue 关 stage barrier → parent leader 自动唤醒评估下一步 ✅
7. 整体目标达成 → leader 推 parent 到 in_review ✅

### 7.3 @mention 触发链
```
评论发出 → ParseMentions 提取 {Type, ID}
  → computeCommentAgentTriggers 算触发集（显式 @agent/@squad 优先；@squad→leader；member/issue 只渲染不触发）
  → filterSuppressedCommentAgentTriggers 过滤
  → enqueueCommentAgentTriggers 建任务（@squad→EnqueueTaskForSquadLeader is_leader_task=true；@agent→EnqueueTaskForMention）
  → daemon poll → claim → spawn 隔离 workspace → run → 结果回 issue
```
✅ 防环：leader 自己评论不触发自己；显式 @mention 别人时 leader 不触发（人已路由）。✅ **#3033 双触发 bug 已修**（`pm-multica-community.md` 走查纠正：2026-05-22 commit `46a29b1e`，1 天修复）——机制是 `HasPendingTaskForIssueAndAgent` 幂等检查（同 issue + 同 agent 已有 pending task 则 coalesce 不重复 enqueue）+ `triggerChildDoneSquad` 显式注释 "Re-triggering is bounded by HasPendingTaskForIssueAndAgent idempotency check" + `squadOperatingProtocolHardRules` 显式 warn leader 不要既 @mention 又建 child issue + 专属测试用例 `TestCreateComment_WorkerAgentCommentDoesNotWakeLeader_WhenLeaderTaskPending`。agents-remote 借鉴 Squad 时可直接学这套幂等检查范式，不是「待解决的难点」。

---

## 8. 记忆与上下文

### 8.1 leader 读上下文怎么传给成员
- **leader 收 briefing** ✅：Squad Operating Protocol + Roster（成员 mention markdown + skills）+ Instructions。
- **leader 决策传成员** ✅：leader 发评论 @mention 成员 + 写具体指令；成员 task 的 prompt = `buildCommentPrompt` 构造，触发评论内容直接 embed（agent 不会漏）+ reply instructions（TriggerCommentID 当 `--parent`，每 turn 重发防 resumed session 带旧 UUID）+ coalesced comments 的 content/ID + fetch 全文指引。
- **issue 是共享上下文** ✅：所有成员看到同 issue 的描述 + 全部评论历史（评论是 issue 级共享）。

### 8.2 跨 issue 记忆
- **无显式跨 issue session 链** ⚠️：每个 issue 内 task 共享 session resume；跨 issue 是新 session。
- **靠 skills 沉淀** ✅：可复用 skill 跨 issue 复用（agent 绑定 skill，所有 issue 的 task 都注入）。
- **靠 instructions + meta skill** ✅：agent 角色人格 + multica CLI 用法每次 run 注入。
- **靠 Project 归类** ✅：同 Project 的 issue 逻辑相关，但无自动上下文传递（GitHub issue #1282 社区诉求「native project leader 连续 follow-through」尚未实现 🟡）。

### 8.3 不常驻怎么续
- **session id 持久化** ✅：存 CLI session id，同 issue 续跑优先 resume。
- **resume 失败兜底** ✅：发 Session Continuity Notice 告知 agent 历史 may 丢失，保 prompt-cache prefix 稳定。
- **task = 一次性** ✅：每次 task 是新 spawn，干完即退；续跑靠 issue 评论 + session resume + skills，非靠 agent 自身常驻状态。
- **GC 不急清** ✅：issue 未 done 前 task 目录留（artifact 按 TTL 清 regenerable 部分），issue done + idle 后清整目录。

---

## 9. 审批与介入

### 9.1 用户在哪介入
- **issue 创建/分配时** ✅：你建 issue + 派活。
- **issue status 推进时** ✅：你在 UI 推 status（或 agent 用 CLI 推）。
- **agent 跑时实时看** ✅：WebSocket 流 + Execution log 回放每个 tool call。
- **PR review 时** ✅：你在 Git 平台 review PR + 提 comment。
- **comment redirect 时** ✅：你在 issue 评论提反馈 → 反向触发 agent「Reply mode」处理。
- **审批 done 时** ✅：merge PR（带 close intent）→ issue 自动 done；或你手动推 done/cancelled。

### 9.2 review/merge 怎么运作
- agent 完成开 PR + 推 issue 到 `in_review` ✅
- 你在 Git 平台 review PR + comment ✅
- comment 反向触发 agent task（Reply mode）✅
- approve merge → PR merged + 带 close intent + 无其他 open/draft + issue 非 done/cancelled → issue 自动 `done` + 通知订阅者 ✅
- **agent 不能自己标 done** ✅：done 由 merge 系统行为触发，agent 只能推 in_review（与 PRD「agent 不能自己把任务标完成」对齐）。

### 9.3 介入粒度
- **粗粒度**：assign + status 推 + PR review/merge。
- **细粒度**：issue 评论 redirect（Reply mode）+ 实时看执行日志。

---

## 10. 执行与持久

### 10.1 local daemon 跑哪
- **本机常驻进程** ✅：bridge server ↔ 本机 CLI；`mdt_` token 鉴权。
- **Desktop app 自动起** ✅ 或 **CLI `multica setup` 起** ✅。
- **每 3s poll + 15s heartbeat** ✅。
- **auto-update + auto-reload** ✅。

### 10.2 隔离 workspace 形态
- **`~/multica_workspaces/<workspace>/<task>/`** ✅：每 task 独立目录。
- **git worktree** ✅：`multica repo checkout` 按需出 worktree，源是 `.repos/` shared bare clone。
- **.agent_context / meta skill 注入** ✅：`CLAUDE.md`/`AGENTS.md` 指向 injected skill 目录 + 教 agent 用 multica CLI。
- **task-scoped env** ✅：`MULTICA_TOKEN`/`MULTICA_SERVER_URL`/`MULTICA_WORKSPACE_ID`/`MULTICA_TASK_ID`。
- **local_directory 模式** ✅：用用户绝对路径，task 后还原。
- **active env roots 防 GC 误清** ✅：daemon 管 active roots，执行中不被 GC。

### 10.3 状态持久
- **issue/agent/squad/skill/autopilot/task/PR 状态** ✅：server-side（PostgreSQL + sqlc，从 wiki 推断 🟡 + deepwiki 提及 db 层）。
- **CLI session id** ✅：server-side 存，resume 用。
- **task workspace** ✅：本地 fs，GC 按 TTL 清。
- **agent 登录态** ✅：本地 CLI 自管，Multica 不收 token。
- **runtime 状态** ✅：daemon 心跳上报 server。

---

## 11. 商业模式与定位

- **开源 + 自托管 + 托管 SaaS 双轨** ✅：multica.ai hosted（free trial）+ Docker Compose/Helm 自托管。
- **Multica License（Apache 2.0 基底 + Part I 附加条件）** ✅（`pm-multica-community.md` 走查精确化，GitHub API license 字段 = NOASSERTION，非标准 Apache 2.0）：(a) **禁止对第三方提供托管服务**（含免费托管，需商业 license——「A publicly accessible instance operated for users outside your own organization requires a commercial license even when it is offered free of charge」）；(b) **强制品牌/署名**（不可移除 LOGO/产品名/copyright，需书面 branding waiver）；(c) 组织内部用（含多 workspace）免商业 license；(d) 源码 fork 发布本身不算托管服务。**arunbaby 文章误标「Apache 2.0」是错的**。**对 OPC 启示**：Multica 的 license 阻止 SaaS 化竞品但允许自托管 fork——agents-remote 若走开源路线需明确选 license（MIT/Apache 2.0 无附加条件 vs Multica 式附加条件）。
- **目标用户** ✅：小团队 + 个人 + AI-native teams——靠 multiplex 人 + AI agent 达到大团队产出。
- **定位** ✅：AI-native 项目管理平台（Linear/Jira 的 AI-native 版），agent 是一等公民 teammate。
- **开源版无 agent 数量上限** ✅：只受硬件限。
- **45.6k stars** ✅🟡（`pm-multica-community.md` 走查纠正，GitHub API 直证 2026-08-12 = 45,601 stars，pm-multica.md 原 43.4k 已过期）——但 **watcher 仅 160**（star:watcher ≈ 285:1，反映 star 数虚高：中文圈 + SEO 推广带来大量点 star 不追进展用户）；英文 HN 圈声量极低（4 个 Show HN 帖全 <5pts，0 个 multica.ai 域名评论）；中文开发者圈真实活跃（`joytianya`/`123Assassin`/`CyborgYL` 等中文 issue 真踩坑）。**这是「中文团队主导、英文圈低能见度、GitHub issue 内部高活跃」的典型形态**——社区讨论质量高（#815 16react + maintainer 在场），但英文圈能见度远不及 Buzz/cf-os。

---

## 12. 对 OPC 多 agent 编排的启示

> 对照 agents-remote PRD（`../design/multi-agent-prd.md`）的**角色/任务/房间/看板/记忆/agentmore** 六概念。

### 12.1 印证（Multica 做对了、PRD 方向一致）
1. **issue = unit of work = 看板卡片 = 任务容器** ✅ 印证 PRD「任务」概念——Multica 把 issue 当一等容器，agent task 是其执行记录（一个 issue 多 task = 初版/修复/反馈轮），与 PRD「OrchestrationGoal × OrchestrationTask 双层」完全同构。OPC 应直接采纳「Goal（看板卡片）× Task（执行记录）」双层。
2. **agent 不能自己标 done，走 PR review 闸门** ✅ 印证 PRD 决策 2「agent 不能自己把任务标完成，必须你审批」——Multica agent 只能推 in_review，done 由 merge 系统行为触发。OPC 审批闭环设计被官方实践验证。
3. **agent = 配置非常驻进程，CLI spawn 干完即退** ✅ 印证 PRD「编排层在现有 session runtime 之上加一层，runtime 零改动」——Multica 的 daemon + 隔离 workspace + GC 是「非常驻」范式的成熟实现，OPC 可复用 daemon/claim/spawn/GC 思路（agents-remote 已有 ClaudeRuntime spawn + relay，缺的是 daemon 化 poll/claim 与隔离 workspace）。
4. **Skills 作为 team knowledge 沉淀层** ✅ 印证 PRD「记忆」——Multica skills 注入 provider native 路径（`.claude/skills/{name}/SKILL.md`）是跨 issue 复用知识的好范式，OPC 的「角色 systemPrompt + 长记忆」可拆出 skills 层（与 PRD 后续「长记忆」对齐，但 Multica 的 skills 是更轻、更可落地的起点）。
5. **自动探测 PATH CLI + 多 provider 抹平** ✅ 印证 agents-remote 现有 ProviderProfile（claude/codex/claude）+ Multica 进一步抹平到 20+ CLI——OPC 的 provider 抽象方向正确，且 Multica 的「自动探测 + 注册」是「agent 接入零配置」的好范式（agents-remote 现在是手动配 ProviderProfile，可借鉴自动探测）。
6. **Mention-driven coordination（comment 即派活）** ✅ 印证 PRD「房间」里的 @mention——Multica 的 `[@Label](mention://<type>/<id>)` + computeCommentAgentTriggers + 防环（mention suppression / self-trigger 防环）是「评论驱动协调」的成熟工程实现，OPC 圆桌的 @mention 路由可直接借鉴（含防双触发 bug 的解法）。

### 12.2 挑战（Multica 暴露的难点，PRD 需正视）
1. **leader 双触发 bug（#3033）已修** ✅ 挑战——原以为是悬而未决痛点，`pm-multica-community.md` 走查纠正：**2026-05-22 commit `46a29b1e`（1 天修复）**，机制是 `HasPendingTaskForIssueAndAgent` 幂等检查 + `squadOperatingProtocolHardRules` 硬规则 warn + 专属测试用例。**OPC 启示反转**：不是「待解决难点」，是「可直接学的幂等范式」——OPC Squad/圆桌 @mention 路由的派活去重应抄这套「pending task 检查」机制，不能光靠 prompt 规则。
2. **#1282 native project leader 官方明确拒绝硬编码** ✅ 挑战（`pm-multica-community.md` 走查纠正）——pm-multica.md 原说「社区诉求未实现」，实际 maintainer `Bohan-J` 2026-04-18 明确回应：「**Team workflows vary a lot**. Some teams want exactly one lead per project. Others divide responsibility by area inside a team. Others rotate leads weekly. **If we pick one shape and make it a first-class feature, everyone else has to bend their process to match ours.**」替代方案是「@mention + instructions 用户自组合」。**OPC 启示反转**：这是 Multica 的**产品克制**，但也是 OPC 的**差异化机会**——若要做「deep orchestrator」，可提供**可配置的 project leader 抽象**（单 lead / 按领域分 / 周轮换 等多种形态可选），而非硬编码任一。
3. **跨 issue 记忆缺失** ⚠️ 挑战——Multica 跨 issue 无显式记忆链（社区 #1282 求 project leader 连续 follow-through 被官方拒绝硬编码，留 @mention 自组合）。OPC 的「长记忆」是 Multica 没解决好的痛点，是差异化机会——PRD 后续「长记忆（向量检索）」正中此缺口。
4. **session resume 脆弱** ✅ 挑战——存 session id 优先 resume，不能 resume 发 Notice 告知历史 may 丢失。OPC 的 `--resume` + relay 双缓冲比 Multica 更成熟（agents-remote 已有 Gen 3 状态级恢复），是技术优势。
5. **状态焊 issue 上的代价** ⚠️ 挑战——换成员/换 issue 都要重读 issue 历史重建上下文，无结构化长记忆。OPC 若同样焊 issue，需补「角色级 / project 级」记忆层（Multica 只有 skills 层，不够）。

### 12.3 盲点（Multica 没做、OPC 可超越）
1. **圆桌 / 多角色同台讨论** ⚠️ 盲点——Multica 的 Squad 是「leader 单向 @mention 成员」的层级协调，**非**多角色平等同台讨论。OPC 的「房间」= 圆桌（多角色 + 你坐一起讨论）是 Multica 没有的形态——这是差异化，但风险更高（参考 Claude Tag 调研：Anthropic 自己都没做多 agent 角色，先做单 agent 多用法）。
2. **结构化长记忆 / 向量检索** ⚠️ 盲点——Multica 靠 skills + issue 评论，无向量检索。OPC 后续「长记忆（向量检索）」是超越 Multica 的方向。
3. **agent 间共享白板 / 决策摘要** ⚠️ 盲点——Multica 的协调产物散在 issue 评论里，无结构化白板。OPC 圆桌的「共享白板 + 检查点摘要」是更先进的设计（cf-os/Buzz 已验证三件套）。
4. **混合部署（CF 控制面 + 本地执行）** ⚠️ 盲点——Multica 是 server + local daemon 二元，无 CF 留口子。OPC 的「CF 留口子 + hybrid 形态 B」是部署架构上的超越。
5. **移动端看板** ✅ 盲点印证——Multica **移动端不做看板**（窄屏列稀疏体验差），印证 PRD 决策 3「移动端不做拖拽看板，用按状态分组列表」。

### 12.4 对 PRD 6 概念的对照结论
- **角色** ✅：Multica agent = 身份 + instructions + skills，与 PRD 角色同构；OPC 应补「project 级共享身份」（Claude Tag 启示）。
- **任务** ✅：Multica issue × task 双层 = PRD Goal × Task 双层，完全同构，直接采纳。
- **房间** ⚠️：Multica **无房间概念**（Squad 是层级非圆桌）——OPC 房间是超越项，需谨慎（先 Phase 1 单 agent 多角色跑通再上）。
- **看板** ✅：Multica 看板（Board + List + swimlane + labels + properties）成熟，OPC 可借鉴视图分层（但移动端不做看板）。
- **记忆** ⚠️：Multica 只有 skills 层，无结构化长记忆——OPC 应补白板 + 检查点 + 向量检索（cf-os/Buzz 三件套 + 后续 L4）。
- **agentmore** ⚠️：Multica 的 Squad + Autopilot 是「agent more」的两种形态（团队 + 定时），OPC 可借鉴 Autopilot 双模式（create_goal 可见 / run_only 后台）作为「定时任务」实现范式。

---

## 13. 证据分级与来源

### ✅ 官方源码/README/docs（经 deepwiki 二次确认）
- Squad 模型（leader + members + briefing 三段 + Operating Protocol + Roster + Instructions）
- Internal issue 系统（非 GitHub 直接导入）+ GitHub PR linking（标识符 + close intent）
- @mention 机制（markdown 格式 + ParseMentions + computeCommentAgentTriggers + filterSuppressed + enqueue + 防环）
- Daemon PATH 探测（probeAgentCLIs + shell resolve + 30min cache + PATH 覆盖 env）+ 20+ CLI provider 列表
- Task claim + 隔离 workspace（`~/multica_workspaces/<workspace>/<task>/` + git worktree + .agent_context + env 注入 + GC 三档 TTL）
- agent 不常驻（CLI 干完即退 + daemon lifecycle + GC）
- issue status 6 态机 + agent CLI 推 status + merge 自动 done 三条件
- Autopilot（create_issue / run_only + cron + webhook + 失败暂停）
- Chat sessions（私聊 + 每消息 run + 无 issue 上下文）
- Skills（create/import/assign/inject provider native 路径 + builtin 4 个）
- Session resume（存 session id + Notice 兜底 + prompt-cache prefix 稳定）
- Runtime 面板 + Add a computer + Desktop auto-register
- Workspace 隔离 + Self-hosting（Docker/Helm）+ Hosted SaaS
- Multica License（Apache 2.0 + 附加条件）+ 小团队/AI-native teams 定位
- Inbox 通知聚合规则 + Activity timeline + Execution log + Token usage + Real-time streaming

### 🟡 二手（社区/tvly/daily.dev 摘要）
- 45.6k stars / 5.8k forks / 160 watchers（GitHub API 直证，2026-08-12 快照，`pm-multica-community.md` 走查更新；原 43.4k 已过期）
- GitHub issue #3033（squad leader 双触发 bug，**2026-05-22 commit `46a29b1e` 已修**——`HasPendingTaskForIssueAndAgent` 幂等检查 + 测试用例，`pm-multica-community.md` 走查源码级确认）
- GitHub issue #1282（native project leader——**官方 `Bohan-J` 2026-04-18 明确拒绝硬编码**「Team workflows vary a lot」，非「未实现」）
- daily.dev 摘要（open-source managed agents platform 定位描述）
- 后端 PostgreSQL + sqlc（从 wiki 结构推断，未直接读源码）
- analytics/telemetry 存在但细节未公开

### ⚠️ PM 推断
- 跨 issue 记忆靠 skills + instructions + Project 归类（无显式机制，从架构推断）
- 状态焊 issue 的取舍代价（换成员重读历史）从设计推断
- 「房间 = 圆桌是 Multica 没有的形态」对比结论
- 「OPC 应补 project 级共享身份 / 白板 / 检查点」启示推断

### 来源工具
- deepwiki `mcp__deepwiki__ask_question` × 8（Squad / issue 绑定 / @mention / daemon / claim / 介入 / 记忆 / 商业 / feature 全维度 / autopilot+chat+skills+project+inbox / runtime+onboarding+CLI）
- tvly search × 1（社区信号 + 双触发 bug + project leader 诉求 + stars）
- 既有调研起点：`./multi-agent-orchestration.md` §3.2（PM 视角重写，未搬运）
- PRD 对照：`../design/multi-agent-prd.md`