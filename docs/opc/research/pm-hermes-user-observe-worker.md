# Hermes 用户怎么观测/介入 coding worker · 用户视角走查（承接 pm-hermes-coding-community.md）

> 本文件**纯用户视角**：只从 Hermes（`NousResearch/hermes-agent`）**用户实际怎么解决"manager 观测 worker 内部"**这个问题挖证据——用户的 issue body/评论、HN 评论、第三方实战指南。**不重复** `pm-hermes-coding-community.md` 的源码/官方 skill 视角（那是"Hermes 设计上有什么"；本文件是"用户真在怎么用、怎么踩坑"）。官方 README/skill/源码的"设计能力"不算用户实测；用户没说过的东西就标 ⚠️ 待证或如实写"无用户直接证据"。

## 一句话定位

**Hermes 用户实际观测/介入底下 coding worker（claude/codex）的方式，是「事后摘要回传 IM + git diff 链接」为主、「`/agents` 看板 + live transcript `tail -f` + 桌面 watch-window」为进阶、人介入靠「IM 消息打断 + `/steer` 注入 + approvals 审批门」三件套；而「看不到 worker 内部/只能看结果」是社区反复抱怨的第一大痛点，催生了 async 生命周期工具（`check_task`/`steer_task`/`cancel_task`）和 live transcript 两个补丁。**

## 1. 走查方法与覆盖范围

- **GitHub REST API（curl，主战场）**：issue 全文搜索 10+ 组 query（observability / "watch progress" / "can't see" / "no visibility" / stuck / burn tokens / steer / kill / tail / cost coding）+ 关键 issue 全文与评论拉取（#18127 / #6779 / #56405 / #69121 / #21910 / #32474 / #25808 / #77749 / #73389 / #68361 / #7395 / #23419 / #50875 / #81575 / #31392 / #4253 / #76147 / #50723 / #13584 / #42227 / #9400 / #11508 / #5839 / #67479 / #79278 / #70294 / #4379）+ PR 详情（#47060 / #7295 / #3120 / #34704 / #67479）。
- **HN Algolia API（curl）**：9 组 query 全扫描 + 关键 thread 全文（48419000 主帖 42 评论、48882162 "I advise against using Hermes Agent"、48433422 Grafana observability plugin）。
- **WebSearch**：定位第三方实战指南 OnlyTerp part18/20/8/24 + theagent-report async subagents 文 + linux.do 中文社区 + hermesagent.org.cn 中文社区日报。
- **firecrawl**：本轮 **0 credits**（keyless 免费档每日上限已被他 agent 耗尽，curl + GitHub API + WebSearch 已足够）。红色预算遵守。

**信噪比**：GitHub issue 命中极多，但大量是维护者 PR/自述；真正"用户怎么观测/介入"的实战叙事集中在少数 feature request / bug 的 body 与评论（用户最诚实）。**核心裁决：Hermes 社区的"观测 coding worker"默认形态不是全量实时透传，而是「事后摘要 + 主动查」两段式；「看不到 worker 内部」是真实高频痛点，社区用三个补丁（async 生命周期工具 / live transcript / watch-window）来填，但每个补丁都有"社区其实没人人这么用"的证据缺口。**

## 2. 用户怎么"看"底下 worker 在干嘛

**裁决：分三层——(a) 默认层：等 Hermes 回传摘要 + git diff 链接（print mode JSON / IM 回传）；(b) 主动层：`/agents` 看板、live transcript `tail -f`、桌面 watch-window（这些是被补丁反复推动才有的，且"人人这么用"证据弱）；(c) 失败层：SessionDB / Web dashboard / Langfuse 事后查。用户对"只能看结果、看不到过程"的抱怨极其密集。**

### 2.1 默认观测 = 事后摘要 + diff 链接（🟡 二手，但多源独立收敛）

- **OnlyTerp part18**（第三方实战指南，2026-07 更新）：print mode `claude -p` 跑完后 "Captures the JSON, parses the file diff, **posts a summary back to your Telegram/Discord/Slack thread with a link to the git diff**"；并行 delegation "Hermes runs them in three independent subagent slots, **streams progress**, and aggregates"——**观测终点是摘要+链接，不是 tool call 流水**。`/review_pr myorg/myapp#342` 完整 recipe：Hermes 拉 diff → 交 Claude Code → 回 PR 评论 → Telegram 回摘要+链接。
- **theaiagentindex "Hermes + Codex + Claude Code Stack"**（汇总站）：三层分工（Hermes=coordinator / Codex=brain / Claude Code=specialist），"Hermes delegates the coding task, Claude Code writes or fixes the code, and Hermes verifies the result, runs smoke tests"——**用户观测终点是 Hermes 的 verify 结果**。

### 2.2 "看不到 worker 内部" = 社区第一高频痛点（✅ issue 直证，verbatim 密集）

- **#18127**（MillsAirCode，2026-04-30）——最硬的一手叙述：in-flight gateway session **完全没有观测面**。verbatim：
  > "In Hermes 0.12.0, there's no way to observe what an in-flight gateway agent session is doing. This makes it hard to know whether the agent is making progress, stuck, or **burning the iteration budget on the wrong path**."
  具体手段全失效：`hermes sessions list` 只显示 finalized session、"agent.log is silent for every subsequent turn"、**唯一证明 agent 还活着的是 `journalctl --user -u llama-server` 的 POST 流量**（旁证，不是观测面）。"Killing the gateway to 'see what it was doing' loses 30+ min of context — the only debug move is destructive." 要的四个补丁全是观测：per-turn log / live transcript stream / `sessions list --include-active` / `--attach <session_id>` read-only。
- **#56405**（thepick，2026-07-01）——Live "Over the Shoulder" View。verbatim：
  > "When Hermes is navigating a browser or running terminal commands, the user currently receives **text snapshots after each action**... you can *watch* the agent fill out a form, navigate a dashboard, or debug an error in real-time rather than waiting for a text summary."
  > "for background or delegated tasks (subagents, Claude Code, spawned processes), **the user has no visibility**."
  明确动机是 **trust + early correction**："Users can verify the agent is doing the right thing before it finishes, not after... If the agent is heading down the wrong path, the user can intervene immediately via `/steer` or interrupt."
- **#69121**（judy167，2026-07-22）——Desktop per-session embedded terminal。verbatim：
  > "If the user can't watch that output appear in real time, Hermes looks like it's a **slow / black-box dispatcher instead of a control tower**. With real-time stream, the value is obvious — **same primitive Claude Code CLI already gives you**, just from inside the Hermes chat surface."
  点名"background processes... child-agent runs from `delegate_task` / Claude Code / Codex should stream output to the user's view **as it happens**, not be hidden behind a 'you have N background processes' status pill."
- **#7395**（vito0527opencode，2026-04-10）——Telegram 远程时 **terminal 输出根本不回传**。verbatim：
  > "Commands execute successfully on the host machine... **Terminal stdout/stderr output does NOT appear in Telegram**. The user must be physically at the machine watching the terminal window to see command output."
- **#76147**（networthexplained，2026-08-01）——反方向：**tool chrome 太多**。"Hermes Desktop chat becomes unusably long during normal agent work (file + terminal loops)... full tool rows, Thinking headers — and there is **no effective way to hide or bulk-collapse that chrome**... the assistant answer is buried; scrollback and focus suffer."——观测不是太少就是太多，用户两头都抱怨。
- **#67479**（teknium1，2026-07-19，维护者实现）——承认痛点并补丁：`delegate_task` 派出的子 agent 返回 **live transcript 文件**，"one append-only, human-readable log per subagent under `<hermes_home>/cache/delegation/live/<delegation_id>/task-<n>.log`, pre-created at dispatch so `tail -f` works immediately. **No more waiting blind for the consolidated summary to learn what a child is doing.**" log 格式逐行带时间戳（`think | tool | result | assistant | final`）。

### 2.3 主动观测面 = `/agents` 看板 + live transcript + watch-window（✅ PR/官方实现 + 🟡 指南，但"人人用"证据弱）

- **PR #34704**（kshitijk4poor，2026-05-30 合入）——**最讽刺的发现**：TUI 早就有一个完整的 `/agents` spawn-tree dashboard（live tree / Gantt timeline / per-child tokens·cost·files·tool calls / kill·pause controls / history replay），但 **"nothing surfaced it. While a turn delegates, the transcript stays quiet and the user has to already know to type `/agents`."** 于是加了一个一次性提示 "subagents working · /agents to watch live"。→ **能力存在 ≠ 用户知道/在用**，这是"框架有、社区少用"的最强证据。
- **PR #47060**（OutThisLife，2026-06-16 合入）——Desktop subagent **watch windows** 曾经 "opened blank"（child 的 streamed reply text 没 relay 过去，窗口开着却是空的），修复后 "stream the reply" 才真正可看。
- **PR #67479**（teknium1）——live transcript `tail -f`，见 §2.2。
- **OnlyTerp part8**（🟡）："The CLI/TUI **status bar tracks running background subagents**, and the desktop app can open a live **watch-window** on any of them" + v0.18 background fan-out 一屏看多子 agent。**OnlyTerp part24**：v0.17 "Reach" added subagent watch-windows；"you watch tool calls run inline instead of staring at a spinner"。
- **#50723**（iwrs712，2026-06-22）——观测的坑：ACP adapter 里 **tool completion 事件缺失**，"some tool cards remain in a running / processing state even though the underlying tool has already finished"——**观测面会撒谎**（显示 running 其实已完成）。

### 2.4 事后观测 = SessionDB / Web dashboard / Langfuse（✅ issue + 🟡 指南）

- **#18127** 用户实测 `state.db` 的 `messages` 表对 in-flight session 是空的（gateway flush 增量），`hermes sessions list` 也查不到——事后观测对**进行中**的 session 失效。
- **#4379**（Bichev，2026-04-01）——用户**自建监控 dashboard**（`Bichev/hermes-dashboard`）profiling token，"73% of every API call is fixed overhead (~13.9K tokens)"——**用户为观测自己写工具**，这是"用户自建观测面"的典型 workaround。
- **#46852**（shreyansmaini-cverse，2026-06-15）——Langfuse 观测缺 metadata："Hermes Langfuse traces are technically flowing... but they lack significant metadata that Claude Code traces capture. This makes Hermes traces **far less useful for debugging, session replay**."
- **OnlyTerp part20**（🟡）——三层观测栈：Level 1 logs（`hermes logs tail -f`）/ Level 2 internals（`/usage` `/status` dashboard Analytics）/ Level 3 托管 tracing（Langfuse / Helicone / Phoenix）。verbatim："You can't optimize what you can't see."

### 2.5 用户"怎么看的"证据小结

- **默认**：摘要 + diff 链接（🟡 多源收敛）✅ 用户对"只能看结果"的抱怨。
- **主动**：`/agents` 看板 / live transcript `tail -f` / watch-window——**能力在，但 PR #34704 自认"用户得已经知道去敲 /agents"**，且每个补丁都有"刚修好/曾经空白"的历史（#47060）→ 真实使用率证据弱，标 ⚠️。
- **坑**：in-flight 不可观测（#18127）→ 只能 kill 看上下文（破坏性）→ 事后查 DB 又是空的；观测面还会撒谎（#50723 显示 running 其实已完）。

## 3. 用户怎么"介入"一个正在跑的 worker

**裁决：人介入路径从"间接"到"直接"排一排——(1) 等 Hermes 层的审批门 / IM 打断（`busy_input_mode`，官方能力，用户多用）；(2) `delegate_task` 派出的子 agent 用 async 生命周期工具 `check_task` / `steer_task` / `cancel_task`（官方补丁，2026-06 才来）；(3) 用户在 IM 里直接对 coding 会话说话（thread-bound，community feature request 强烈想要但未合入）；(4) `/rewind` 回滚（community feature，已实现）。真正"用户实测我怎么打断 worker"的 verbatim 稀缺——这是社区真空。**

### 3.1 IM 层介入：打断 / queue / steer（✅ 官方能力 + 🟡 指南；用户"实测"描述少）

- `busy_input_mode` 三语义 interrupt / queue / steer 在 `pm-hermes-coding-community.md` 已从源码挖透。**用户视角补充**：#32474（wintrover，2026-05-26）的**用户痛点描述**——消息被静默 queue 后**无法查看/取消**：
  > "When the agent is busy processing a turn, any prompts sent by the user are **silently queued** and executed once the current turn completes. There is currently no way to inspect or clear this queue... **Accidental queuing** — a user sends a message meant as a note... it gets queued and executed automatically after the current turn, potentially disrupting flow or causing unintended actions."
  现状 workaround 只有 `/stop` / `/new` / 干等——**用户要的是对"排队介入"的可见性与取消权**。
- **#21910**（SaguaroDev，2026-05-08 + 用户 xavierchoi 评论）——`/rewind` 回滚。用户 xavierchoi（2026-05-10）verbatim（gateway/Discord 场景）：
  > "Hit this exact gap last night on Discord... The agent posted an onboarding message into the *wrong* thread. Today the only recovery is: 1. Manually delete the bot's Discord message... 2. `/new` in that thread to clear polluted session context. **No middle ground — and `/new` nukes everything including useful prior turns.**"
  → 介入一个"跑歪的 turn"的最小动作是回滚/重提交，用户要的是"别 nuke 全部"。

### 3.2 async 生命周期工具：`check_task` / `steer_task` / `cancel_task`（✅ 官方 + 🟡 转述，2026-06 补丁）

- **theagent-report**（2026-06-17，🟡 二手）：async_delegation 六工具 "spawn, check, steer, collect, cancel, list"——`check_task` = "non-blocking status plus recent output"；`steer_task` = "inject a message into a running task mid-flight"；`cancel_task` = "stop a running task"。**动机正是监控缺口**："You couldn't continue drafting, **steer runs interactively, or monitor progress** without waiting."（官方 #5586 跟踪。）
- **#11508**（AppleLV918，2026-04-17）——**用户早在 async 补丁之前就提出 coordinator pattern 被同步 `delegate_task` 卡死**。verbatim：
  > "The `delegate_task` tool is synchronous-only. When an agent calls it, the agent is blocked until the sub-agent completes. This breaks the **coordinator pattern**... Coordinator receives a task from user → delegates to sub-agent(s) → Coordinator immediately returns to available state... User can send follow-up instructions while sub-agents work... **Currently, step 3 is impossible.**"
  要的正是 `async_mode=True` / `busy_input_mode: queue`。
- **PR #7295**（teknium1，2026-04-10）——**用户 Josh（Discord）实测踩坑**：从 Telegram 跑 `delegate_task`，父 agent 的 activity tracker 冻结 → 网关误报 "No activity for 15 min" 警告，**30 min 超时还会 kill 正在干活的 agent**。修复 = 心跳 daemon 把 child 的 activity 转发给 parent。→ **"介入/监控"失败的真实事故：因为没观测到 child 在动，父 agent 被当成 idle 杀掉**。
- **PR #3120**（teknium1，2026-03-26）——**subagent hang 40+ 分钟**的真实事故：非流式 API 路径无 timeout，"a subagent waiting for Claude Opus to respond through OpenRouter" 挂了 40+ 分钟。修复 = 永远走流式路径（带 90s stale 检测）。→ **观测不到 hang + 无超时 = 用户白烧时间**。

### 3.3 直接对 coding 会话说话（thread-bound，community 强烈想要、未合入主线）

- **#5394**（Jackten，2026-04-06，承接 pm-hermes-coding-community）——"A Telegram topic named 'Claude Code' that routes every message into a persistent Claude Code session"——**用户想要"在 IM 里直接对 worker 说话"**。OnlyTerp part18 把它列为 Mode 2 并给 `hermes bind-thread` 入口（🟡，指南层面的工作流，非用户实测帖）。
- **#25808**（dysources，2026-05-14）——remote human-input bridge：CLI/TUI 起的长任务，人离开终端后遇到 `clarify` / dangerous command approval / sudo 提示，"The user is no longer watching the terminal. Hermes should notify the user on a configured messaging channel, accept the response there, and continue the same in-flight CLI/TUI run."——**用户要的是"人不在场也能介入"的桥**（还是 feature request，未实现）。

### 3.4 审批门作为介入入口（✅ 官方 + 🟡 指南）

- **OnlyTerp part18**（🟡）：`approvals: mode: manual / timeout: 60 / cron_mode: deny`——"Coding agents run shell commands and write files. You need an approval policy or you'll lose a weekend debugging an accidental `rm -rf node_modules` in the wrong dir." 危险命令模式内置在 `tools/approval.py`；subagent 继承父会话审批姿态，per-delegation 可 override（`delegate_task(..., approvals="ask")`）。
- **#31392**（leavedrop，2026-05-24）——**用户自建** task relay：auto-fork（continuation 自动）+ `dispatch submit --to <profile>` 需人 `approve <id>` / `reject <id>`——"async human approval gates" 用户亲手实现。作者自述跑了 ~3 个月 3-profile production（🟡，RFC 自述非第三方实测）。

### 3.5 用户"怎么介入"的证据小结

- **用户实测 verbatim 稀缺**：真正"我中途这样打断了 worker"的一手叙述只有 #11508（被同步 delegate 卡死）、#7295 的 Josh（被误杀）、#32474（queue 不可见）——**介入手段是 Hermes 最强的能力（官方三语义），但用户能讲清的实战流程很少**。
- **介入的三个真实失败模式**：① 父 agent 被误判 idle 杀掉（#7295）；② subagent hang 无超时（#3120）；③ 消息静默排队后不可取消（#32474）。
- **thread-bound（IM 直连 coding 会话）是用户想要、未合入的介入形态**（#5394 + OnlyTerp Mode 2 指南）。

## 4. 用户踩过的坑与 workaround 汇总

| # | 坑 | 用户 verbatim / 描述 | 来源 | workaround / 教训 |
|---|---|---|---|---|
| 1 | **in-flight session 完全不可观测** | "no way to observe what an in-flight gateway agent session is doing... burning the iteration budget on the wrong path" | #18127 MillsAirCode 2026-04-30 ✅ | 只能 `journalctl` 旁证活着 / kill 看上下文（破坏性）。教训：**观测不能只在事后** |
| 2 | **子 agent 结果丢失 / 静默失败** | cron 里 `delegate_task` 结果被静默丢，"job finishes with `last_status: ok` and delivers only the model's 'I'm waiting for the subagents…' narration text" | #70294 miltonleon-hero-software 2026-07-23 ✅ | 子 agent 孤儿运行 + DB 写失败。教训：**"ok" 状态不等于 deliverable 到达** |
| 3 | **context compression 吃掉 in-flight tool chain** | "compression fires while a tool chain is still executing, the tool result never reaches the agent. The side effect has already happened server-side. The agent concludes failure and **replays the step — unsafe for any non-idempotent operation**" | #79278 zakhounet 2026-08-05 ✅ | 副作用完成但 agent 以为失败重放 → 重复写。教训：**压缩/观测层不能破坏 in-flight 链** |
| 4 | **同步 delegate 卡死 coordinator** | "the agent is blocked until the sub-agent completes... breaks the coordinator pattern... step 3 is impossible" | #11508 AppleLV918 2026-04-17 ✅ | 用户要 `async_mode`；官方后补 async_delegation |
| 5 | **父 agent 被误判 idle 杀掉** | 网关 15min 警告 + 30min kill，"even though the subagent is actively working" | PR #7295 (Josh Discord) ✅ | 心跳转发 child activity |
| 6 | **subagent hang 无超时** | "a subagent waiting for Claude Opus... hung for 40+ minutes" | PR #3120 teknium1 ✅ | 永远走流式路径 + 90s stale 检测 |
| 7 | **消息静默排队不可取消** | "silently queued... no way to inspect or clear this queue... accidental queuing" | #32474 wintrover 2026-05-26 ✅ | 要 `/queue cancel`；现状只有 `/stop`/`/new` 干等 |
| 8 | **工具 progress 显示"命令"而非"结果"** | "Telegram tool progress shows the raw shell command instead of the useful result. A simple `date` call renders like `💻 terminal: "date '+%Y-%m-%d...'"`" | #13584 dpaluy 2026-04-21 ✅ | 观测面要显示结果不是 raw command |
| 9 | **观测面撒谎（显示 running 其实已完）** | "some tool cards remain in a running / processing state even though the underlying tool has already finished" | #50723 iwrs712 2026-06-22 ✅ | ACP 只处理 `tool.started` 不处理 `tool.completed` |
| 10 | **tool chrome 淹没答案** | "sessions become unusably long... no effective way to hide or bulk-collapse that chrome... the assistant answer is buried" | #76147 networthexplained 2026-08-01 ✅ | 观测不是太少就是太多 |
| 11 | **成本黑洞无观测** | cron 一天烧 ~$20 xAI credits，"no warning, no confirmation, no cost estimate, and no budget cap" | #23419 nvst18 2026-05-10 ✅ | 用户手动查 billing dashboard 才发现 |
| 12 | **curator 静默删技能** | "52 skills pruned in the June 12 run alone... no user-facing notification" | #50875 owynter 2026-06-22 ✅ | 自治子系统无 consent gate |
| 13 | **context 不可见** | "Users can see how FULL their context is... but cannot see WHAT is in it" | #4253 SHL0MS 2026-03-31 ✅ | 要 `/context` 可视化 |
| 14 | **用户自建观测面** | 自建 dashboard profiling token overhead | #4379 Bichev 2026-04-01 ✅ | `Bichev/hermes-dashboard` 作 workaround |
| 15 | **token 税** | 社区 2026-07 反复测出 messaging gateway ~15-20k tokens/turn 工具定义 vs CLI ~6-8k，"one user burned 121k tokens just wiring Telegram to the Desktop app" | OnlyTerp part20 🟡 | CLI 干重活 / Telegram 只做 kickoff+steer / `/usage --by-gateway` |
| 16 | **高推理模型 busywork** | "High-reasoning models generate busywork — self-assigned hashing, redundant test-writing, verification loops of their own verification" | OnlyTerp part20 🟡 | 别把同一高推理模型既当 orchestrator 又当 worker |
| 17 | **墙内社区排障手法** | "推荐借助 Claude Code 或 Codex 辅助排查 Hermes 异常并配置 helper profile... 将排查过程与解决方案沉淀为永久记忆" | hermesagent.org.cn 日报 2026-06-01 🟡 | 中文社区用 coding agent 帮 Hermes 排障（worker 反哺 manager） |
| 18 | **个体否定声音** | "The entire Hermes Agent project is unresponsive, unintuitive, unsafe, vibe-coded — do not entrust it with any confidential information" | HN 48882162 piotrbednarsalt 2026-07-12 🟡 | 3 pts 低赞，但代表"治理差/不透明"的反面心智 |

## 5. 社区真空 / 待证（如实记录，不编造）

1. **"用户用 `/agents` 看板 / live transcript `tail -f` / watch-window 盯 worker"的一手用户实测帖，社区真空**。这三个观测面都是官方/PR 补丁（#67479 / #34704 / #47060）或 OnlyTerp 指南（🟡）自述；没有用户 issue/blog 写"我日常 `tail -f` 盯子 agent 日志"。PR #34704 甚至自认"用户得已经知道去敲 /agents"。
2. **用户"我中途这样打断了 worker"的完整实战流程叙述稀缺**。介入手段官方很全（interrupt/queue/steer + approvals），但用户能讲清的一手流程只有 #11508（同步卡死）、#7295（被误杀）、#32474（queue 不可见）三个失败例，没有"我成功 steer 了一个跑偏的 claude"的正向叙事。
3. **thread-bound（IM topic 直通持久 Claude Code 会话）未合入主线**——community feature request（#5394）+ OnlyTerp Mode 2 指南在推，但没有主线支持 + 无用户长期使用报告。
4. **async_delegation（check/steer/cancel_task）的使用规模无硬数据**——theagent-report 是官方补丁转述（🟡），无第三方独立评测 "我生产里用 check_task 看到了什么"。
5. **"Hermes 底下跑 claude 干开发"的真实用户规模**——延续 pm-hermes-coding-community 的结论：skill 目录 + issue 密度侧面证明存在，但无用户数/频率一手统计。HN 主流把 Hermes 当个人助手/sysadmin 用（apexalpha "I don't code with it"），coding delegation 是主流能力但"多少用户真用它"无硬数据。

## 6. 对 OPC 的启示（用户角度的解法：我们该抄 / 该补 / 该防）

### 6.1 该抄（用户被验证的默认 + 官方被验证的补丁）

1. **观测默认 = 开发任务结果卡片 + diff 链接**（Hermes 社区默认形态，多源收敛）。OPC 的"agent 调 claude 干开发"默认给用户"改了哪些文件 / 测试过没过 / 花了多少 turn·钱 / diff 链接"，实时透传作为高级选项——**不要默认全量 tool call 流水**（#76147 证明 chrome 太多也淹死用户）。
2. **异步生命周期工具照抄**：`delegate_task_async` → `check_task`（状态+recent output）/ `steer_task`（mid-flight 注入）/ `cancel_task`。这是用户被 #11508 卡了两个月后官方补的，**OPC 第一天就该有**。`check_task` 的"non-blocking status plus recent output"正是"manager 观测 worker"的最小契约。
3. **live transcript 一次一 log / `tail -f` 可追**：`<cache>/delegation/live/<id>/task-N.log` 逐行 `think | tool | result | assistant | final`，dispatch 时预创建。**这是"观测 worker 内部"的极简可落地方案**——append-only 文件 + 用户随时 tail，比 push 全量流更符合"事后摘要为主"的社区默认。
4. **人介入三件套照抄**：IM 消息默认打断当前 turn（interrupt）+ `/steer` 不打断注入 + approvals 审批门（危险命令模式 + 超时 fail-closed + 无人值守 deny）。**#32474 提醒加一条：队列必须可见可取消**——"静默排队 + 不可取消"是真实痛点。
5. **"能力存在 ≠ 用户知道"要主动 surface**：PR #34704 的教训——`/agents` 看板早就存在但没人知道。**OPC 的任何观测面（看板/日志/tail）都要在 delegate 启动时主动提示入口**（"subagents working · watch live"），否则等于没有。

### 6.2 该补（Hermes 有缺口，OPC 可差异化）

1. **in-flight 可观测 + 非破坏性 attach**：Hermes 0.12 时代 #18127 用户只能 kill 才能看；OPC 从第一天做"进行中任务可读 attach + per-turn log 一定落盘"（**agent.log 对 in-flight session 静默** 是 #18127 的直接根因，别学）。
2. **失败 context 显式闭环**（承接 pm-hermes-coding-community 的差异化空白）：Hermes 的"ok 但 deliverable 丢了"（#70294）、"压缩吃掉 in-flight 链导致重放副作用"（#79278）都是**观测/状态层破坏任务**。OPC 的失败续接协议必须带"任务状态 survive + 失败 context 结构化回传 + 副作用幂等保护"，把这两类事故当反面教材。
3. **成本可见性前置**：#23419 用户被静默烧 $20 才发现；OPC 做"agent 调 claude 干开发"必须有**每任务成本预估 + 预算 cap + 超限 circuit breaker**（Hermes 的 cron 无 cap 是反面教材）。
4. **观测层防撒谎**：#50723（tool.completed 丢失显示 running）——OPC 的 tool 状态机必须**完成事件可靠**，否则用户对"worker 在跑"的判断会错。

### 6.3 该防（Hermes 社区踩过的坑）

1. **父 agent 被误判 idle 杀掉**（#7295）——child 活动必须心跳回传 parent，否则"监控"本身会误杀 worker。**OPC 的"无活动检测"必须把子任务活动算进去**。
2. **subagent hang 无超时**（#3120）——所有 worker 调用必须带 wall-clock 超时 + stale 检测（Hermes 非流式路径挂 40 分钟才修）。
3. **消息静默排队不可取消**（#32474）——队列要可见、可取消，禁止"发了就当执行了"。
4. **别让观测 chrome 淹没答案**（#76147）——tool progress 默认折叠/可隐藏，"用户 + 最终答案"响应模式优先。
5. **别把自治子系统做成无 consent 的黑箱**（#50875 curator 静默删技能）——任何自动删除/改动都要审批门 + 可恢复，否则用户信任崩塌。
6. **thread-bound 直连 coding 会话是双刃剑**：用户想要（#5394），但 OPC 若做要配套 Hermes 反复强调的"Keep Hermes in the loop / 不要反转关系"（Teknium 官方 guidance，OnlyTerp 引用）——**直连不能变成绕过 manager 的旁路，否则中心 context 累积断链**。

## 7. P0/P1/P2 给主 agent 的建议（结晶进 opc-product-discussion.md，本调研不改中枢）

**P0（直接影响产品核心形态）：**

1. **OPC 的观测默认面 = 开发任务结果卡片**（改哪些文件 / 测试过没过 / num_turns / cost / diff 链接），实时透传高级可选——Hermes 社区默认形态，且 #76147 证明 chrome 太多淹死用户。
2. **异步 worker 生命周期照抄 Hermes async_delegation**：`spawn → check（状态+recent output）→ steer（mid-flight 注入）→ cancel → collect`——这是用户被 #11508 卡了两个月、官方 2026-06 才补的形态，OPC 第一天就该有。
3. **live transcript 一次一文件 `tail -f`**：append-only log（think/tool/result/assistant/final 逐行 + dispatch 时预创建）——"观测 worker 内部"的极简可落地契约，比 push 全量流更合社区默认。

**P1（重要增强）：**

4. **人介入三件套 + 队列可见可取消**：interrupt（IM 消息默认打断）/ steer（不打断注入）/ approvals（危险命令+超时 fail-closed）+ **queue 必须可查看/取消**（#32474）。
5. **成本可见性前置**：每任务成本预估 + 预算 cap + 超限 circuit breaker（#23419 反面教材）。
6. **失败 context 显式闭环 + 副作用幂等**：#70294（ok 但 deliverable 丢）与 #79278（压缩吃掉 in-flight 链导致重放副作用）做反面教材，OPC 的失败续接协议必须带任务状态 survive + 幂等保护。

**P2（值得做）：**

7. **任何观测面都要主动 surface 入口**（PR #34704 教训：`/agents` 看板存在但没人知道），delegate 启动时提示"watch live"。
8. **观测层防撒谎**：#50723 tool.completed 丢失显示 running——tool 状态机完成事件必须可靠。
9. **child 活动必须回传 parent 的 idle 检测**（#7295 误杀），所有 worker 调用带 wall-clock 超时（#3120 挂 40 分钟）。

## 8. 证据清单（按 ✅/🟡/⚠️ 分级汇总，用户 verbatim 已在上文正文尽量多贴）

### 8.1 ✅ GitHub issue / PR / 用户一手叙事

1. **#18127**（MillsAirCode，2026-04-30）— in-flight gateway session 零观测：`sessions list` 只显示 finalized、agent.log 静默、唯一旁证是 llama-server 的 journalctl 流量、"only debug move is destructive"、要 per-turn log / live stream / `--attach` — https://github.com/NousResearch/hermes-agent/issues/18127
2. **#6779**（SHL0MS，2026-04-09）— `/tasks` 命令：用户引述 "My biggest frustration is to have a delegated task and not knowing if it's stalled out running and what's doing while the main agent can't see what's going on" — https://github.com/NousResearch/hermes-agent/issues/6779
3. **#56405**（thepick，2026-07-01）— Live "Over the Shoulder" View：text snapshots 不够、要 live browser/terminal/timeline、"no visibility" for subagents、early correction via `/steer` — https://github.com/NousResearch/hermes-agent/issues/56405
4. **#69121**（judy167，2026-07-22）— Desktop per-session embedded terminal：要 live-stream subagent/Claude Code/Codex 输出、"slow / black-box dispatcher instead of a control tower"、"same primitive Claude Code CLI already gives you" — https://github.com/NousResearch/hermes-agent/issues/69121
5. **#21910**（SaguaroDev，2026-05-08 + xavierchoi 评论）— `/rewind` 回滚：xavierchoi "agent posted into the wrong thread... `/new` nukes everything"；实现 PR #23445 — https://github.com/NousResearch/hermes-agent/issues/21910
6. **#32474**（wintrover，2026-05-26）— `/queue cancel`：静默排队不可见不可取消、"accidental queuing" — https://github.com/NousResearch/hermes-agent/issues/32474
7. **#25808**（dysources，2026-05-14）— remote human-input bridge：CLI/TUI 长任务人离场后的 clarify/approval/sudo 要桥到 IM — https://github.com/NousResearch/hermes-agent/issues/25808
8. **#77749**（Pheobe-Southwood，2026-08-03）— ACP 客户端无 context 用量可见性 — https://github.com/NousResearch/hermes-agent/issues/77749
9. **#73389**（rrosson，2026-07-28）— headless API 用户无 tool-call 结果可见性，"zero working tools can still return a confident, well-formed disposition"（安全流水线场景） — https://github.com/NousResearch/hermes-agent/issues/73389
10. **#68361**（Zek-Takai，2026-07-21）— Multi-mind sessions / watcher role 提案（引用 Subagent live transcripts #67479 已在渲染） — https://github.com/NousResearch/hermes-agent/issues/68361
11. **#7395**（vito0527opencode，2026-04-10）— Telegram 远程时 terminal 输出不回传，"must be physically at the machine watching the terminal window" — https://github.com/NousResearch/hermes-agent/issues/7395
12. **#23419**（nvst18，2026-05-10）— cron 静默烧 ~$20/day xAI credits、无 cost estimate / budget cap / per-provider isolation — https://github.com/NousResearch/hermes-agent/issues/23419
13. **#50875**（owynter，2026-06-22）— curator 静默删 80+ skills、无 consent gate / no recovery path — https://github.com/NousResearch/hermes-agent/issues/50875
14. **#81575**（Dazui-Wang，2026-08-08）— context 85% 阈值 checkpoint 提案（955 bug 分批处理跨 session 的真实 use case） — https://github.com/NousResearch/hermes-agent/issues/81575
15. **#31392**（leavedrop，2026-05-24 + 9 评论）— 用户自建 task relay：auto-fork + async human approval gates、"the user is the message bus... the card-mover" 痛点、"running this in production for ~10 days / 3 months" — https://github.com/NousResearch/hermes-agent/issues/31392
16. **#4253**（SHL0MS，2026-03-31）— `/context` 命令：能看多满不能看有什么 — https://github.com/NousResearch/hermes-agent/issues/4253
17. **#76147**（networthexplained，2026-08-01）— tool chrome 淹没答案、无法折叠 — https://github.com/NousResearch/hermes-agent/issues/76147
18. **#50723**（iwrs712，2026-06-22）— ACP tool.completed 丢失显示 running — https://github.com/NousResearch/hermes-agent/issues/50723
19. **#13584**（dpaluy，2026-04-21）— Telegram tool progress 显示 raw command 而非结果 — https://github.com/NousResearch/hermes-agent/issues/13584
20. **#42227**（jhzAliyy，2026-06-08）— "no visibility into Hermes status while waiting for LLM response... cannot tell if it's stuck, slow, or in an infinite loop" + 并发请求报错不排队（要 Claude Code 式排队） — https://github.com/NousResearch/hermes-agent/issues/42227
21. **#9400**（sniperHW，2026-04-14）— 空响应静默放弃未完成多步任务，"Empty response after tool calls... silently abandons incomplete multi-step tasks" — https://github.com/NousResearch/hermes-agent/issues/9400
22. **#11508**（AppleLV918，2026-04-17）— 同步 `delegate_task` 卡死 coordinator pattern — https://github.com/NousResearch/hermes-agent/issues/11508
23. **#5839**（pradeep7127，2026-04-07）— subagent tool progress SSE 提案（被 #72406 生命周期可见性替代，per-tool streaming 故意排除防噪音） — https://github.com/NousResearch/hermes-agent/issues/5839
24. **#67479**（teknium1，2026-07-19）— live-viewable subagent transcripts：`tail -f` 即用、逐行 think/tool/result/assistant/final、"No more waiting blind for the consolidated summary" — https://github.com/NousResearch/hermes-agent/issues/67479
25. **#79278**（zakhounet，2026-08-05 + 11 评论）— context compression 吃掉 in-flight tool chain 导致重放副作用 — https://github.com/NousResearch/hermes-agent/issues/79278
26. **#70294**（miltonleon-hero-software，2026-07-23）— cron 里 delegate_task 结果静默丢、job 报 ok、子 agent 孤儿 — https://github.com/NousResearch/hermes-agent/issues/70294
27. **#4379**（Bichev，2026-04-01）— 用户自建 monitoring dashboard profiling token overhead — https://github.com/NousResearch/hermes-agent/issues/4379
28. **#46852**（shreyansmaini-cverse，2026-06-15）— Langfuse traces 缺 metadata、比 Claude Code 差 — https://github.com/NousResearch/hermes-agent/issues/46852
29. **PR #47060**（OutThisLife，2026-06-16 合入）— desktop watch windows 曾空白（child streamed reply 没 relay）、修复后可见 — https://github.com/NousResearch/hermes-agent/pull/47060
30. **PR #7295**（teknium1，2026-04-10 合入）— child activity 回传 parent（社区用户 Josh Discord 实测被 30min 超时误杀） — https://github.com/NousResearch/hermes-agent/pull/7295
31. **PR #3120**（teknium1，2026-03-26 合入）— 永远流式路径防 subagent hang 40+ 分钟 — https://github.com/NousResearch/hermes-agent/pull/3120
32. **PR #34704**（kshitijk4poor，2026-05-30 合入）— `/agents` 看板早存在但没人知道，加 "subagents working · /agents to watch live" 提示 — https://github.com/NousResearch/hermes-agent/pull/34704

### 8.2 🟡 二手社区（第三方指南 / 汇总站 / 转述）

33. **OnlyTerp hermes-optimization-guide part18**（2026-07 更新）— print mode 摘要回传 + diff 链接 + 并行 streams progress + Kanban worker lanes + approval posture + thread-bound Mode 2 + "Keep Hermes in the loop" — https://github.com/OnlyTerp/hermes-optimization-guide/blob/main/part18-coding-agents.md
34. **OnlyTerp part20 Observability**（2026-07 更新）— 三层观测栈（logs / `/usage`+dashboard / Langfuse-Helicone-Phoenix）+ "You can't optimize what you can't see" + gateway token tax（~15-20k vs ~6-8k，121k token 接线事故）+ 高推理模型 busywork — https://github.com/OnlyTerp/hermes-optimization-guide/blob/main/part20-observability.md
35. **OnlyTerp part8 Subagent Patterns**（2026-07 更新）— status bar 跟踪 background subagents + desktop watch-window + 七阶 agent ladder — https://github.com/OnlyTerp/hermes-optimization-guide/blob/main/part8-subagent-patterns.md
36. **OnlyTerp part24 Desktop App**（2026-07 更新）— v0.17 subagent watch-windows / v0.18 coding cockpit / "watch tool calls run inline" — https://github.com/OnlyTerp/hermes-optimization-guide/blob/main/part24-desktop-app.md
37. **theaiagentindex "Hermes + Codex + Claude Code Stack"** — 三层分工 + "Hermes verifies the result, runs smoke tests" — https://theaiagentindex.com/stacks/hermes-codex-claude-code-stack
38. **The Agent Report "Hermes Agent Ships Asynchronous Subagents"**（2026-06-17）— async_delegation 六工具 spawn/check/steer/collect/cancel/list、"couldn't... steer runs interactively, or monitor progress" — https://the-agent-report.com/2026/06/hermes-async-subagents-june2026/
39. **hermesagent.org.cn 中文社区日报 2026-06-01** — 排障经验：用 Claude Code/Codex 辅助排查 Hermes 异常 + helper profile 沉淀记忆 — https://hermesagent.org.cn/reports/daily/2026-06-01
40. **HN 主帖 42 评论**（story 48419000，2026-06-05）— apexalpha "I don't code with it, I use Claude for that... it's a sysadmin for my homelab"（主流用户把 coding 拆给 Claude Code） — https://news.ycombinator.com/item?id=48419000
41. **HN "I advise against using Hermes Agent"**（48882162，piotrbednarsalt，2026-07-12，3pts）— "unresponsive, unintuitive, unsafe, vibe-coded"（低赞但代表不透明心智） — https://news.ycombinator.com/item?id=48882162
42. **HN "Grafana Cloud observability plugin for Hermes Agent"**（48433422，oboroten，2026-06-07）— 第三方为 Hermes 做观测插件（Show HN，0 评论） — https://news.ycombinator.com/item?id=48433422

### 8.3 ⚠️ PM 推断（本文件独家，低置信，如实标注）

43. "**`/agents` 看板 / live transcript / watch-window 的真实使用率低**"——基于 PR #34704 自认"用户得已经知道去敲 /agents" + 无用户实测帖，推断能力在但"人人这么用"证据缺
44. "**默认观测=摘要+diff 链接**"——基于 OnlyTerp/theaiagentindex 二手收敛 + 用户对"只能看结果"的抱怨（#18127/#56405），默认形态判断为二手可学但无用户直接 confirm
45. "**async_delegation 是用户被同步 delegate 卡出来的补丁**"——基于 #11508（2026-04）提出 → 官方 async_delegation（2026-06 #5586）落地的时序推断
46. "**thread-bound（IM 直连 coding 会话）是社区想要、未合入的介入形态**"——基于 #5394 feature request + OnlyTerp Mode 2 指南（🟡），无主线支持、无用户长期使用报告
47. "**OPC 的观测默认若做全量 tool call 流水会重蹈 #76147 覆辙**"——基于 #76147 用户对 chrome 过多的抱怨推断

### 工具与方法

- **GitHub REST API（curl + python3）**：issue 全文搜索 10+ 组 query + 关键 issue/PR 全文与评论拉取——**用户自述最诚实的来源**，verbatim 金矿
- **HN Algolia API（curl + python3 递归）**：9 组 query + thread 全文（48419000 / 48882162 / 48433422）——主流用户把 Hermes 当个人助手用，coding delegation 的"观测/介入"讨论稀疏
- **WebSearch**：定位 OnlyTerp guide（part18/20/8/24）+ theagent-report + linux.do + hermesagent.org.cn 中文社区日报
- **firecrawl**：本轮 0 credits（keyless 每日上限已被他 agent 耗尽；curl + GitHub API + WebSearch 足够，遵守 ≤8 红色预算）
- **已读对照**：`pm-hermes-coding-community.md`（全文件，源码/官方视角不重做，本文件只做用户实战）+ `pm-openclaw-hermes.md`（品类/memory 不重做）+ `../design/opc-product-discussion.md`（三层模型 + 缺口登记，只提建议不改）
