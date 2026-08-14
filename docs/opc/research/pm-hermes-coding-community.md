# Hermes 控制 coding 工具做开发 · 社区走查（PM 视角纠偏，承接 pm-openclaw-hermes.md）

> 本次走查**窄而深**：只挖 Hermes（`NousResearch/hermes-agent`）社区如何用 Hermes **控制 claude/codex 等 coding 工具做软件开发**——spawn 链路、观测手段、失败续接、人介入。品类/memory/IM/安全已在 `pm-openclaw-hermes.md` 覆盖，本文件不重做。

## 1. 一句话定位

**Hermes 社区对"控制 coding 工具做开发"这件事的做法，是「Hermes 当 manager / orchestrator，coding CLI（Claude Code / Codex / Gemini CLI / OpenCode）当 worker」的分工**：Hermes 通过 `terminal` 工具 subprocess-spawn coding CLI（print mode 一次性为主、tmux 交互式为辅），自己保留 state / memory / approvals / Kanban 任务生命周期；观测走「事后摘要回传 IM + git diff 链接」为默认、stream-json 实时 token 与 tmux 状态机为高级能力；失败续接靠 **Kanban worker lane（任务 survive restart / retry / handoff）+ coding CLI 自带 `--resume`/`-c` + `process` 工具 poll/submit/kill + self-improving 从失败沉淀 skill**，而非"测试失败自动重跑"的标准化机制；人介入是它最强的环节——IM 消息默认 **interrupt** 当前 turn（`busy_input_mode` 三模式 interrupt/queue/steer），approvals 审批 gate 是标配。

一句话给 OPC 的钩子：**OPC 想让 agent 调 claude 干开发，Hermes 社区验证的是「orchestrator 不自己写代码、delegate 给 coding CLI 当 worker、中心保持 context 累积、观测默认事后摘要、失败靠任务状态 survive + 显式续接、人可随时打断」这套形态**。

## 2. 走查方法与覆盖范围

- **deepwiki `ask_question`（3 轮）**：spawn 链路（`codex_runtime.py` / `terminal` 工具 / tmux 编排 / ACP）+ 观测（SessionDB / Web dashboard / tool progress 回传）+ 失败续接（`background_review.py` `_COMBINED_REVIEW_PROMPT` / process 工具）+ 人介入（`busy_input_mode` / `AIAgent.interrupt/redirect/steer` / `/stop`）——源码级最可靠来源。
- **GitHub REST API（curl）**：repo 元数据（230,141 stars / 45,533 forks / 31,846 open issues / pushed 2026-08-14，直取）+ 官方 skill 源码（`skills/autonomous-ai-agents/claude-code/SKILL.md` v2.2.1、`codex/SKILL.md` v1.0.1）+ `agent/codex_runtime.py` 源码 + 6 个关键 issue 全文（#5135 / #5257 / #5394 / #37961 / #78563 / #81298 / #47199）+ `website/docs/reference/skills-catalog.md`。
- **HN Algolia API（curl）**：主帖 52pts/42 评论全文递归遍历（story 48419000，2026-06-05）+ 全 query 扫描。
- **WebSearch**：定位第三方实战指南 `OnlyTerp/hermes-optimization-guide/part18-coding-agents.md`（2026-07 更新，二手但极详细）+ `theaiagentindex.com` Hermes+Codex+Claude Code stack 页。
- **firecrawl**：本轮 **0 credits**（curl + deepwiki + HN API 已足够，未触发免费档）。红色预算约束遵守。

**信噪比**：GitHub issue 命中极多（`claude-code` 相关 5,024 条），但大量是维护者 PR/issue 而非用户实战；真正的"社区实战叙事"集中在少量 issue（feature request 的 body 是最诚实的自述）+ 第三方指南 + HN 评论。**核心裁决：Hermes 控制 coding 工具做开发是真实主流用法（不是冷门角落），但"观测到 tool call 级 / 测试失败自动续接"这两块是社区真空——只有框架级能力，没有社区标准做法**。

## 3. 子问题一：spawn——Hermes 怎么把开发任务变成 claude/codex CLI 的执行

**裁决：社区共识是 subprocess spawn coding CLI（print mode 为主，tmux 交互式为辅），外加 ACP 协议作为"更干净"的委托通道在推进；不是 computer-use 控制终端，也不是纯 API 直调。**

### 3.1 官方 skill 封装的 spawn 形态（✅ 源码直证）

`claude-code` skill（v2.2.1，作者 Hermes Agent + Teknium）明确定义**两种编排模式**：

- **Mode 1 Print Mode（`claude -p`）——官方标注 "PREFERRED for most tasks"**：一次性任务，返回结果即退出，无需 PTY。示例 `terminal(command="claude -p 'Add error handling to all API calls in src/' --allowedTools 'Read,Edit' --max-turns 10", workdir="/path/to/project", timeout=120)`。**skip 所有交互 dialog**（workspace trust / permission confirmations）。
- **Mode 2 Interactive PTY via tmux——多轮会话**：`tmux new-session` → `tmux send-keys 'cd /path/to/project && claude' Enter` → `sleep && tmux send-keys '任务' Enter` → `tmux capture-pane` 观测 → `tmux send-keys '/exit'`。**需要显式处理两个 PTY dialog**（workspace trust 默认 Enter；`--dangerously-skip-permissions` 的 bypass warning 需要 Down+Enter）。

`codex` skill（v1.0.1）同构：`codex exec 'Add dark mode toggle to settings'`，**必须 `pty=true`**（Codex 是交互式终端 app，无 PTY 会 hang）+ **必须 git repo**。后台长任务 `background=true` 返回 `session_id`，交给 `process(action=poll/log/submit/kill)` 工具管理。还记录了 **Hermes gateway 环境 caveat**：gateway/service 上下文里 Codex `workspace-write` sandbox 会 bubblewrap 失败（`setting up uid map: Permission denied`），要用 `--sandbox danger-full-access` + 进程边界兜底。

`skills-catalog.md` 列在 `autonomous-ai-agents` 类目下：`claude-code` / `codex` / `computer-use` / `hermes-agent` / `opencode` —— **`computer-use` 是独立技能（桌面控制），不用于驱动 coding CLI**。

### 3.2 另一条路径：Codex app-server runtime（✅ 源码直证）

`agent/codex_runtime.py` 提供**不走 subprocess、走 Codex 协议**的两条路径：
- `run_codex_app_server_turn` — Codex CLI 装为 active provider 时，通过 `codex_app_server` subprocess 客户端驱动一个 turn；**Hermes 注册为 Codex 的 MCP server**，Codex 缺的工具（`web_search` / browser）回调 Hermes（`hermes_tools_mcp_server` via stdio → `model_tools.handle_function_call()`）。
- `run_codex_stream` — `codex_responses` api_mode，走 Codex Responses API 流式。

`_CODEX_TOOL_ITEM_TYPES` + `_codex_item_to_tool_name/args/preview` 把 Codex 内部事件翻译成 Hermes 的 tool 调用语义。**这条路径是"Codex 当 Hermes 的主脑"（theaiagentindex stack 的 Codex-as-brain 形态），与"Claude Code 当 worker"（terminal spawn）是两条不同 delegation 语义**。

### 3.3 社区 feature request 反映的 spawn 形态（✅ issue 直证）

- **#5135**（0xbyt4，2026-04-04）`claude_code` tool delegating via `claude -p`：`subprocess.Popen` 流式输出、JSON 解析出 session_id/cost/duration、**session persistence via `--resume <session_id>`**、`DELEGATE_BLOCKED_TOOLS` 阻止 subagent 嵌套委托、cwd 路径校验。作者明确动机："The tool works on **all platforms including messaging gateways** where PTY/terminal is not available"——**print mode 是因为 gateway 没有 PTY 而成为必选**。
- **#78563**（Antropocosmist，2026-08-04）Claude Code CLI backend provider：把 Anthropic provider 请求路由到本地 `claude` 二进制（`claude -p --output-format json --max-turns 1`）而非 `api.anthropic.com`，**用订阅不额外计费**。局限自述："turn-based（每条 Hermes 消息 = 一次 `claude -p`）、无 Claude Code 内部 tool calling"。
- **#5257**（flowforgelab，2026-04-05）Generalized ACP client：**不 raw subprocess（#3660 曾 raw subprocess 有合规担忧）**，改用 Zed 维护的官方 ACP adapters（`claude-agent-acp` / `codex-acp` / `gemini --acp` + 11 个），`hermes --provider claude-acp` 把 coding agent 当 backend。这是社区在推动的"更干净"委托通道，仍是 subprocess（stdio/NDJSON）但走标准协议。
- **#81298**（reefmind，2026-08-07）Kanban worker executor：把**直接 Claude Code CLI lane 提升为全局默认**（`claude -p`），因为 native lane（`hermes -p <assignee>`）在 provider 池耗尽时全体 worker 启动即失败——见 §5。
- **#5394**（Jackten，2026-04-06）Thread-bound agent runtimes：Telegram topic 绑到**持久** Claude Code/Codex/Gemini 会话（OpenClaw pattern），未来消息直通不重 spawn。见 §6。

### 3.4 社区对 spawn 形态的实战叙事（🟡 二手）

- **OnlyTerp hermes-optimization-guide part18**（2026-07 更新）：Mode 1 print mode "Preferred for most tasks"（80% 是"here's a change, come back when it's done"）；Mode 1B **Kanban worker lanes**（长任务，survive restarts/review/retries/handoff）；Mode 2 thread-bound interactive（OpenClaw pattern）。并行 delegation（3 个 specialist 同时跑）。路由靠**行为**（memory/skill 告诉 orchestrator 谁干擅长什么），无路由 DSL。
- **theaiagentindex.com "Hermes + Codex + Claude Code Stack"**：明确三层分工——Hermes=always-on coordinator（memory/automations/Telegram），Codex=main agent brain inside Hermes，Claude Code=focused coding specialist "called from the terminal by Hermes whenever a bounded coding task needs to be completed"。
- **HN 评论**（throwaway67678，2026-06-05，story 48419000）："Hermes accomodates other coding agents pretty well and has in fact **bundled skills for claude code and codex (for spawning subagents, delegating, etc.)**"。
- **HN 评论**（KennyBlanken，2026-06-05）：EvoMap 抄袭争议——"Hermes basically points their coding agent at evolver and says 'reimplement this yourself'。A few days later Hermes magically sports a nearly identical feature"——**侧面印证 Hermes 确实用 coding agent 干活**（争议点是"抄"，不是"能不能"）。

**spawn 小结**：OPC 该抄的形态是 **print-mode subprocess spawn + skill 封装 + `--resume` 续接 + Kanban/任务状态层做生命周期**；该防的是 **gateway 无 PTY 的环境约束 + PTY dialog 脆弱链 + raw subprocess 的合规/安全担忧（社区转向 ACP）**。

## 4. 子问题二：观测——用户怎么知道"干到哪了"

**裁决：观测是分层的——(a) 实时层：交互 PTY 模式把 subprocess 输出 bridge 到 UI（TUI/desktop/IM gateway），print mode 只有事后 JSON；(b) 回传层：社区实战默认是「Telegram/IM 收摘要 + git diff 链接」，不是全量 tool call 流；(c) 事后层：SessionDB + Web dashboard 可查历史。claude session 内部 tool call 级观测，框架有、社区少用。**

### 4.1 框架级观测能力（✅ 源码/文档直证）

- **print mode JSON 输出**（claude-code SKILL.md）：`--output-format json` 返回 `session_id` / `num_turns` / `total_cost_usd` / `stop_reason` / `terminal_reason`（`completed`）/ `subtype`（`success` / `error_max_turns` / `error_budget`）——**一次调用后就能看到花了多少 turn、多少钱、什么终止原因**。
- **stream-json 实时**（claude-code SKILL.md）：`--output-format stream-json --verbose --include-partial-messages` 输出 newline-delimited JSON，`jq` 过滤 `text_delta` 拿实时文本；`system/api_retry` 事件带 `attempt/max_retries/error`（`rate_limit`/`billing_error`）。
- **交互模式 bridge**（deepwiki）：tmux/PTY 模式把 coding 子进程输出 bridge 到 UI；`codex_runtime.py` 的 `_codex_item_to_tool_name/args/preview/completion_payload` 把 Codex 内部事件转成 **tool progress callbacks**，surface 到 TUI / desktop / messaging gateways。
- **SessionDB**（deepwiki + `_record_codex_app_server_usage` 源码）：记录 token usage / cost / api_call_count，Web dashboard 可浏览；Web UI "Chat" tab 通过 PTY-over-WebSocket 嵌入完整 TUI（`hermes_cli/web_server.py` FastAPI）；"Sessions" tab 显示带 tool call 的消息（collapsible block：function name + JSON args）。
- **tmux 状态机**（#37961 NelsonLongxiang，2026-06-03）：`claude_session` 工具实时检测 IDLE / THINKING / TOOL_CALL / PERMISSION / INTERVIEW / EXITED 六态 + `wait_for_idle` / `wait_for_state` / `output` / `jsonl_output` —— **这是社区把"观测 coding session 干到哪一步"做成显式状态的尝试**（未合入主线，是 PR）。

### 4.2 社区实战的观测默认（🟡 二手）

- **OnlyTerp part18**：print mode 跑完后 "Captures the JSON, parses the file diff, **posts a summary back to your Telegram/Discord/Slack thread with a link to the git diff**"；并行 delegation "streams progress, and aggregates"。**观测终点是"摘要 + diff 链接"，不是 tool call 流水**。
- **HN 评论**（apexalpha，2026-06-05）："I use Hermes at home... I don't code with it, I use Claude for that. But what I do do: it's a sysadmin for my homelab"——**主流 Hermes 用户把 coding 拆给 Claude Code，Hermes 干编排/运维，观测靠 Hermes 的普通会话输出**。

**观测小结**：OPC 该抄的是**"事后摘要回传 + session 记录可查 + git diff 链接"为默认观测面**（社区被验证的实践），实时 tool-call 透传作为高级可选（框架有 `stream-json` / tmux 状态机 / tool progress，但社区没有"人人这么用"的证据）；该防的是把全量 tool call 流当默认会带来的噪音与成本。

## 5. 子问题三：失败/测试不过续接

**裁决：没有"测试失败自动重跑"的标准化机制。社区做法三件套：(a) coding CLI 自带 `--resume`/`-c` + `process` 工具 poll/submit/kill 让 agent 手动续接；(b) Kanban worker lane 让任务状态 survive restart / retry / handoff（人看板重调度）；(c) Hermes self-improving 从失败沉淀 skill（不是重跑该任务，是学习）。反面教材：#81298 显示"自动重派"做不好就是 132 次 retry 风暴。**

### 5.1 续接机制（✅ 源码/文档直证）

- claude-code SKILL.md：`claude -c`（continue most recent in directory）/ `claude -r <id>`（resume specific session）。
- codex SKILL.md：后台任务 `process(action=poll/log)` 监测、`process(action=submit, data="yes")` 回问题、`process(action=kill)` 终止——**coding CLI 卡住/提问时 Hermes 层可介入续接**。
- #37961：`claude_session` 工具带 **UUID5 deterministic session ids + auto-resume from JSONL conversation files** + orphan tmux 处理（EXITED 检测、30s busy-wait 后 force rebuild）——**失败的 coding session 可从 JSONL 恢复**。
- #5135：`--resume <session_id>` session persistence across calls within a Hermes session。
- deepwiki：`AIAgent` 的 conversation orchestration 管 API 错误的 retries/fallbacks（`FailoverReason`），但**这是模型 API 层，不是 coding 任务层**。

### 5.2 self-improving 从失败学习（✅ 源码直证，Hermes 独门）

- `agent/background_review.py` `_COMBINED_REVIEW_PROMPT`：当出现 non-trivial technique / fix / workaround / debugging path 时更新 skill；**当已加载 skill 被证明错误/过时/缺失时也更新**——失败是 skill 更新的触发源。
- 注意事项同样重要：**不要捕获 environment-dependent failures / unresolved failures**（防止把负面断言或未验证的失败序列固化成 workflow）。
- `skill_manage` 工具让 agent 自己 create/update/delete skill。
- 社区文档（`work-with-skills.md`）："Let the agent create skills" / "Update skills when they go stale"。

### 5.3 社区实战的失败处理（✅ issue + 🟡 二手）

- **#81298**（reefmind，2026-08-07，✅）：**最硬的反面教材**——kanban native lane 的 provider 池耗尽 → **一张 review card 被重派 132 次**（behind 429s）circuit breaker 才 trip；而同一 shell 里 `env -u CLAUDE_CONFIG_DIR claude -p ...` 能正常回答。修复 = 默认 worker executor 直接用 Claude Code CLI（`claude -p` 需要 TTY 但 detached worker 没有 → 加 permission mode）。**启示：自动重试在 coding 任务上会放大成 retry 风暴，"自动续接"必须带 circuit breaker + 可区分"模型拒绝"与"看板卡死"。**
- **OnlyTerp part18**（🟡）：Kanban lanes 明确为 "work that should **survive restarts, human review, retries, or multiple handoffs**"；approval posture `mode: manual, timeout: 60, cron_mode: deny`（**失败关闭 fail-closed**）；"Leave merges to a human"。
- **HN 评论**（jdiff，2026-06-05，🟡）："It's too difficult to really shape their output"——个人助手类输出难成型，作为 coding 场景的失败形态之一。

**失败续接小结**：OPC 该抄的是"**失败 context 显式回传 + `--resume` 续接 + 任务状态 survive + 人/agent 决定是否续接 + 审批 fail-closed**"；该防的是"无节制的自动重派"（#81298）；Hermes 的 self-improving（失败 → 沉淀 skill → 下次复用）是差异化借鉴点，但要学它的"别把环境性失败固化成 skill"的边界意识。

## 6. 子问题四：人介入——IM 通道怎么打断/引导一个正在跑的 coding session

**裁决：人介入是 Hermes 最强的环节。IM 消息默认 interrupt 当前 turn（`busy_input_mode=interrupt`），正在执行的 coding 工具在安全边界结束才被打断；`/steer` 可注入不打断；`/stop` 硬停；approvals 审批 gate 是人介入危险命令的标准入口。OPC 直接抄这套三语义。**

### 6.1 中断语义（✅ deepwiki 源码级）

`display.busy_input_mode` 三模式：

| 模式 | 行为 | 机制 |
|---|---|---|
| **interrupt**（默认） | 消息重定向当前 turn，模型生成重启（保留已显示 reasoning 与已完成 work），**运行中的工具在安全边界结束后才应用修正** | `AIAgent.interrupt()` 设 `_interrupt_requested` + `_interrupt_message`，并信号 long-running tool 提前终止 |
| **queue** | 消息静默排队，当前任务完成后作为下个 turn 处理 | `_pending_messages` |
| **steer** | `/steer` 命令 mid-run 注入，到达 agent 于下一次 tool call 后；**不打断当前 tool-calling loop，不创建新 user turn** | `AIAgent.steer()` |

- **Codex app-server 特化**：`api_mode=codex_app_server` 时 interrupt/redirect 走原生 `turn/steer` 操作（`_codex_session.request_steer()`）而非 cancel 进程——**协议级 steer 优于杀掉子进程**。
- **`/stop`** 硬停（cancel active turn + foreground work）；CLI `Ctrl+C` 一次中断、两秒内两次强退。
- 回归测试 `test_cli_interrupt_ack_race.py`：曾有一个 interrupt 可靠性 bug——interrupt 消息被 "vacuumed into the void"（2026 年修过），说明 interrupt 机制有历史缺陷但社区在打磨。

### 6.2 IM 通道的介入路径（✅ deepwiki + skill 直证）

- gateway 两层消息守卫：`BasePlatformAdapter` 检查活跃 session → 排队 + 设 interrupt event；`GatewayRunner._handle_message()` 拦截 `/stop` `/new` `/queue` `/status` `/approve` `/deny` 等命令直通 runner，其余消息 `running_agent.interrupt()`。**`/approve` 这类必须 agent 被阻塞时也到达的命令走 inline dispatch 防竞态**。
- **`process(action=submit)`**：coding CLI 提问时（如 Codex 问 "approve?"）人/agent 注入答案——codex SKILL.md "Send input if Codex asks a question"。
- **approvals 审批**（OnlyTerp part18）：dangerous command patterns（`rm -rf`/`git push --force`/pipe-to-shell）内置在 `tools/approval.py`，`mode: manual` 时人逐个批准，超时 fail-closed deny，`cron_mode: deny`（无人值守永不自动批准）。subagent 继承父会话审批姿态，可 per-delegation override（`delegate_task(..., approvals="ask")`）。

### 6.3 社区想要的"更直接的人介入"（✅ issue 直证）

- **#5394**（Jackten，2026-04-06）：**Thread-bound agent runtimes**——把 Telegram topic 直接绑到持久 Claude Code/Codex/Gemini 会话："A Telegram topic named 'Claude Code' that routes every message into a persistent Claude Code session"——**每个消息直接进 coding 会话，等于人在 IM 里直接对 coding agent 说话**，Hermes 只做 transport/memory/voice-to-text。OnlyTerp part18 把这条列为 Mode 2，并说 `hermes bind-thread <thread-id> --runtime claude-code --cwd ~/projects/myapp` 是该工作流入口。
- **#47199**（abhinaykrupa，2026-06-16）：MCP provider for Claude Code subscription——`escalate_to_claude` 工具把复杂任务 escalate 到本地 Claude Code（`wait_seconds=600` 阻塞等结果）——**另一种"人/agent 显式 escalate coding 任务"的介入面**。

**人介入小结**：OPC 该抄的是**三语义中断（interrupt/queue/steer）+ approvals 审批 gate + `/stop` 硬停 + 危险命令模式拦截 + 超时 fail-closed**；把"agent 正在跑 claude 时人发消息"设计成默认打断（而非排队）是 Hermes 社区的默认值；thread-bound（IM topic ↔ coding 会话直通）是社区想要、正在构建的方向。

## 7. 社区真空 / 待证（如实记录，不编造）

1. **"测试失败 → 自动把失败 context 喂回 → 重跑"的闭环，社区零实战证据**。Hermes 只有框架碎片（`--resume` + process poll + Kanban 重调度 + self-improving skill），没有任何 issue/blog 描述"测试失败后 Hermes 自动把 pytest 输出喂回 claude 续接"的端到端实践。**OPC 若做这是空白市场的差异化，但无 Hermes 现成范本。**
2. **claude session 内部 tool call / 测试输出的全量实时透传到 IM，社区无"人人这么用"的证据**。框架支持（stream-json / tmux 状态机 / tool progress callbacks），社区默认观测终点是"摘要 + diff 链接"。
3. **"Hermes 控制 coding 工具"的真实使用规模无硬数据**。HN 主帖里多数人把 Hermes 当 sysadmin/个人助手用（apexalpha 明说 "I don't code with it"），coding delegation 是 skill 目录里明晃晃的能力（✅ 可证存在）但"多少人真用它 delegate coding"只能从 issue 密度（5,024 条 claude-code 相关）侧面推断，**无用户数/使用频率一手统计**。
4. **失败续接的社区叙事里，agent 视角 vs 人视角的分工边界模糊**。OnlyTerp 说 Kanban lane 让人 review；#81298 说重派 132 次是 bug；没有清晰的"哪些失败 Hermes 自己续、哪些升给人"的社区共识。

## 8. 对 OPC 的启示（我们让 agent 调 claude 干开发，Hermes 社区教我们什么）

### 8.1 该抄什么（社区验证可学的）

1. **manager-worker 分工是社区共识**：Hermes 不自己写代码，coding CLI 是 worker（print mode subprocess + skill 封装），中心 orchestrator 持 state/memory/approvals/任务生命周期。theaiagentindex stack、OnlyTerp、skill 目录三方独立收敛到同一形态。**OPC 的"agent 调 claude 干开发"就该长这样：orchestrator 管任务/审批/记忆，claude 当 worker，`claude -p` + `--resume` 续接。**
2. **观测默认面 = 事后摘要 + session 记录 + git diff 链接**。print mode 的 JSON（num_turns / cost / subtype / terminal_reason）是现成观测契约；社区实战把终点放在"摘要回传 IM"而非 tool call 流水。**OPC 应把"开发任务结果卡片"（改了哪些文件、测试通过没、花了多少 turn/钱）作为默认，实时透传作为高级。**
3. **人介入三语义（interrupt/queue/steer）是可直接照抄的设计**。默认 interrupt、工具在安全边界结束、可 steer 注入不打断、`/stop` 硬停。IM 里"人发消息打断正在跑 claude 的 turn"应该默认生效。
4. **approvals 审批 gate 是标配**：危险命令模式拦截（`rm -rf`/force push/pipe-to-shell）+ 超时 fail-closed + 无人值守 deny。coding CLI 会跑 shell 命令，没有审批层就是等事故。
5. **任务状态 survive restart/retry/handoff 优先于进程活体**：Kanban lane 让"任务"（而非"进程"）成为续接单位——OPC 的 task 抽象天然适配。

### 8.2 该补什么（Hermes 有缺口，OPC 可差异化）

1. **失败 context 显式闭环**：Hermes 只有碎片（`--resume`/process/Kanban），没有"测试失败 → 失败 context（pytest 输出 + 退出码）结构化回传 → 决定续接/升人"的标准。**这是 OPC 的空白差异化点**——把 Raft 的 task 状态 + Hermes 的 resume 拼成一个"失败续接协议"。
2. **circuit breaker / 重派护栏**：#81298 的 132 次重派是真实教训。OPC 做自动续接必须带重试上限 + 可区分"模型拒绝"与"看板卡死"。
3. **self-improving 的边界意识**：Hermes 从失败沉淀 skill 时显式排除环境性失败——OPC 若做"失败 → 沉淀"要同样防"负面断言固化成 workflow"。

### 8.3 该防什么（Hermes 社区踩过的坑）

1. **PTY dialog 脆弱链**：交互式 spawn coding CLI 要 send-keys 伺候 workspace trust / permissions dialog（claude-code SKILL.md 花了整节教这个）。**OPC 走 subprocess 调 claude 应优先 print mode + 显式 flags（`--dangerously-skip-permissions` 配 approvals），不要走交互 PTY。**
2. **gateway 无 PTY 的环境约束**：Codex workspace-write sandbox 在 gateway 上下文 bubblewrap 失败；#5135 作者明说 print mode 是 gateway 的必选。**OPC 的 web 后端同样是无 PTY 环境，默认路径应是 print mode。**
3. **不要反转关系**（Teknium 官方 guidance，OnlyTerp 引用）："don't invert the relationship and make another agent the orchestrator with Hermes as a dumb launcher. Routing through a second brain breaks Hermes's trace — memory stops accumulating"。**OPC 多 agent 同理：中心 orchestrator 必须保持 context 累积，coding CLI 只当 worker，否则编排层失明。**
4. **raw subprocess 的合规/安全担忧**：#5257 弃 raw subprocess（#3660 合规担忧）改 ACP。OPC 若要 spawn coding CLI，官方 ACP adapter（`claude-agent-acp` / `codex-acp`）比手写 subprocess 更稳、更合规。
5. **EvoMap 争议的教训**：Hermes 用 coding agent 复刻别人功能被指抄袭（HN 42 评论帖的第二大话题）。**OPC 的 agent 调 claude 干开发要防"agent 主动复刻他人产品"的越界——任务边界要显式约束。**

## 9. P0/P1/P2 给主 agent 的建议（结晶进 opc-product-discussion.md，本调研不改中枢）

**P0（直接影响产品核心形态，优先结晶）：**

1. **OPC 的"agent 调 claude 干开发"采用 manager-worker 分工**（Hermes 社区三方独立收敛的共识）：orchestrator 持 context/memory/审批/任务生命周期，claude 当 worker（`claude -p` print mode subprocess + skill 封装 + `--resume` 续接）。这同时呼应 Teknium 的"不要反转关系"——中心必须保持 context 累积。
2. **失败续接三件套**：任务状态 survive restart（Kanban lane 式，而非进程活体）+ 失败 context 显式回传 + 显式续接（`--resume`）与升人决定；**禁止无上限自动重派**（#81298 132 次重派反面教材，必须带 circuit breaker + 区分"模型拒绝"与"看板卡死"）。
3. **人介入三语义（interrupt/queue/steer）照抄 Hermes `busy_input_mode`**：IM/UI 里人发消息默认打断正在跑 claude 的 turn（工具在安全边界结束）、可注入 steer 不打断、可硬停。approvals 审批 gate（危险命令拦截 + 超时 fail-closed + 无人值守 deny）作为标配。

**P1（重要增强，次优结晶）：**

4. **观测默认面 = 开发任务结果卡片**（改哪些文件 / 测试过没过 / num_turns / cost / subtype），实时 tool-call 透传作为高级可选——社区验证的默认是"摘要 + diff 链接"不是流水。
5. **spawn 默认路径定 print mode + 显式 flags**（web 后端无 PTY 环境，gateway bubblewrap 失败是已证坑）；交互 PTY 与 ACP adapter 作为可选通道。
6. **失败 → 沉淀的边界意识**：从失败学 skill/经验要排除环境性失败（Hermes `_COMBINED_REVIEW_PROMPT` 的显式规则），防负面断言固化成 workflow。

**P2（值得做，非紧急）：**

7. **失败续接协议可作为 OPC 差异化空白**（Hermes 无端到端闭环）：测试失败 → pytest 输出/退出码结构化回传 → 续接/升人决策，做成显式协议。
8. **任务边界显式约束防越界**（EvoMap 争议教训）：agent 调 claude 干开发的任务 prompt 要约束"不主动复刻他人产品/不越权操作"，防止自动化放大侵权。

## 10. 证据清单（按 ✅/🟡/⚠️ 分级汇总）

### 10.1 ✅ 源码 / README / 官方 skill / GitHub issue / deepwiki 直证

1. **官方 `claude-code` skill v2.2.1**（`skills/autonomous-ai-agents/claude-code/SKILL.md`）— spawn 两模式（print `claude -p` preferred / tmux 交互 + PTY dialog 处理）+ 观测（JSON 输出含 session_id/num_turns/total_cost_usd/subtype + stream-json 实时 + api_retry）+ 续接（`-c`/`-r`）— https://github.com/NousResearch/hermes-agent/blob/main/skills/autonomous-ai-agents/claude-code/SKILL.md — 2026-08-14 读取（curl raw）
2. **官方 `codex` skill v1.0.1**（`skills/autonomous-ai-agents/codex/SKILL.md`）— `codex exec` pty=true + git repo 必需 + background=true→`process` poll/submit/kill + sandbox flags + gateway bubblewrap caveat + PR review / worktree 并行 — https://github.com/NousResearch/hermes-agent/blob/main/skills/autonomous-ai-agents/codex/SKILL.md — 2026-08-14 读取
3. **官方 `skills-catalog.md`** — `autonomous-ai-agents` 类目含 claude-code/codex/computer-use/hermes-agent/opencode；computer-use 是独立桌面控制技能，非 coding CLI 驱动 — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/skills-catalog.md — 2026-08-14 读取
4. **`agent/codex_runtime.py` 源码** — `run_codex_app_server_turn`（Codex CLI app-server subprocess + Hermes 作为其 MCP server 回调）+ `run_codex_stream`（Responses API）+ `_codex_item_to_tool_name/args/preview` 翻译 Codex 事件为 Hermes tool progress + `_record_codex_app_server_usage` SessionDB 记账 — https://github.com/NousResearch/hermes-agent/blob/main/agent/codex_runtime.py — 2026-08-14 读取
5. **Issue #5135**（0xbyt4，2026-04-04）— `claude_code` tool delegating via `claude -p` subprocess.Popen 流式 + `--resume` 持久 + JSON 解析 cost/duration + DELEGATE_BLOCKED_TOOLS + "gateway 无 PTY 所以 print mode 必选" — https://github.com/NousResearch/hermes-agent/issues/5135
6. **Issue #5257**（flowforgelab，2026-04-05，23 评论）— Generalized ACP client：弃 raw subprocess（#3660 合规担忧）改官方 ACP adapters，`hermes --provider claude-acp/codex-acp/gemini-acp`，14 agent 注册表 — https://github.com/NousResearch/hermes-agent/issues/5257
7. **Issue #5394**（Jackten，2026-04-06）— Thread-bound agent runtimes：Telegram topic 直通持久 Claude Code/Codex/Gemini 会话 + 通用 runtime 接口（ensure_session/run_turn/get_status/cancel/close）+ runtime 种类（native_acp / cli_relay）— https://github.com/NousResearch/hermes-agent/issues/5394
8. **Issue #37961**（NelsonLongxiang，2026-06-03）— `claude_session` 工具：tmux 生命周期 start/stop/send/output/status/wait_for_idle + 六态检测 IDLE/THINKING/TOOL_CALL/PERMISSION/INTERVIEW/EXITED + UUID5 deterministic id + auto-resume from JSONL + orphan tmux 恢复（116 tests）— https://github.com/NousResearch/hermes-agent/issues/37961
9. **Issue #47199**（abhinaykrupa，2026-06-16）— cowork-to-code-bridge MCP provider：`escalate_to_claude` 工具把复杂任务 escalate 本地 Claude Code（wait_seconds=600），零额外计费用订阅 — https://github.com/NousResearch/hermes-agent/issues/47199
10. **Issue #78563**（Antropocosmist，2026-08-04）— Claude Code CLI backend provider：`claude -p --output-format json --max-turns 1` 替代 api.anthropic.com 直调；局限自述（turn-based、无 Claude Code 内部 tool calling）— https://github.com/NousResearch/hermes-agent/issues/78563
11. **Issue #81298**（reefmind，2026-08-07）— Kanban worker executor 默认直连 Claude Code CLI；native lane provider 池耗尽 → 一张 review card 重派 **132 次** behind 429s 才 trip circuit breaker；修复 = `claude -p` 直接 lane + permission mode — https://github.com/NousResearch/hermes-agent/issues/81298
12. **README 直引** — "Delegates and parallelizes — Spawn isolated subagents for parallel workstreams" — https://github.com/NousResearch/hermes-agent — 2026-08-14 读取
13. **deepwiki `NousResearch/hermes-agent` 源码级（3 轮）** — spawn（terminal tool + tmux 编排 + ACP 注册）+ 观测（SessionDB / Web dashboard PTY-over-WebSocket / `hermes_cli/web_server.py` / tool progress callbacks）+ 失败续接（`background_review.py` `_COMBINED_REVIEW_PROMPT` 从失败更新 skill + `skill_manage` + FailoverReason API 层 retry）+ 人介入（`busy_input_mode` interrupt/queue/steer + `AIAgent.interrupt/redirect/steer` + `/stop` + gateway 两层消息守卫 + `test_cli_interrupt_ack_race.py` 历史 bug）— https://deepwiki.com/NousResearch/hermes-agent
14. **GitHub repo 元数据** — 230,141 stars / 45,533 forks / 31,846 open issues / 881 subscribers / Python / MIT / created 2025-07-22 / pushed 2026-08-14 — https://api.github.com/repos/NousResearch/hermes-agent — 2026-08-14 直取

### 10.2 🟡 二手社区（博客 / 指南 / 汇总站，带 url + 时间 + 作者）

15. **OnlyTerp hermes-optimization-guide part18 "Delegating to Coding Agents"**（最详细的第三方实战指南）— print mode / Kanban worker lanes / thread-bound interactive / ACP client-server / git hygiene（one branch per delegation + worktree）/ approval posture（manual+timeout+cron deny）/ "Keep Hermes in the loop"（Teknium 官方 guidance）/ PR review & cron recipes — https://github.com/OnlyTerp/hermes-optimization-guide/blob/main/part18-coding-agents.md — 2026-07 更新
16. **theaiagentindex.com "Hermes + Codex + Claude Code Stack"** — 三层分工（Hermes=coordinator / Codex=brain / Claude Code=specialist），"Hermes delegates the coding task, Claude Code writes or fixes the code, and Hermes verifies the result, runs smoke tests" — https://theaiagentindex.com/stacks/hermes-codex-claude-code-stack
17. **HN「Hermes Agent – Open-source AI agent with persistent memory」** 52pts/42 评论（story 48419000）— 关键评论：`throwaway67678`（"Hermes has bundled skills for claude code and codex for spawning subagents, delegating"）+ `apexalpha`（"I don't code with it, I use Claude for that... it's a sysadmin for my homelab"）+ `jdiff`（"too difficult to shape their output"）+ `KennyBlanken`（EvoMap 抄袭争议 "points their coding agent at evolver and says reimplement this yourself"）+ `cyberge99`（Claude+Slack session id 续接）— https://news.ycombinator.com/item?id=48419000 — 2026-06-05
18. **HN 评论引用 evomap.ai 争议**（二级链接）— EvoMap 声称 Hermes 用 coding agent 复刻其功能 — https://news.ycombinator.com/item?id=48419000（KennyBlanken 评论内引 evomap.ai/blog/herme…，原帖 404）— 2026-06-05
19. **SkillsMP hermes-agent codex skill 页**（第三方镜像）— 确认官方 codex skill 定义 — https://skillsmp.com/creators/nousresearch/hermes-agent/skills-autonomous-ai-agents-codex

### 10.3 ⚠️ PM 推断（本文件独家，低置信）

20. "Hermes 控制 coding 工具做开发是真实主流用法" —— 基于 skill 目录 ✅ + issue 密度（claude-code 相关 5,024 条）+ 第三方指南 🟡，但无用户数/频率一手统计
21. "OPC 的失败续接协议（失败 context 结构化回传 → 续接/升人）是 Hermes 社区未覆盖的差异化空白" —— 基于 Hermes 只有 `--resume`/process/Kanban/self-improving 碎片、无端到端闭环的走查结论
22. "测试失败自动续接是社区真空" —— 走查所有 sources 未发现"测试失败 → 自动喂回 → 重跑"的端到端实践证据，如实记录为待证
23. "interrupt 三语义是社区默认期望（而非排队）" —— 基于 `busy_input_mode` 默认值 + gateway 消息守卫机制，社区讨论中未见反对意见

### 工具与方法

- **deepwiki `ask_question`**（3 轮）：spawn 链路 + 观测 + 失败续接 + 人介入 —— 源码级最可靠来源，一次 query 一个子问题
- **GitHub REST API**（curl）：repo 元数据 + raw skill 源码（`skills/autonomous-ai-agents/*/SKILL.md`）+ `agent/codex_runtime.py` + issue 全文（`/issues/<n>` body 直取）+ code search（`/search/code` 未授权 401 时改用 raw 直拉）—— **关键数字一手验证**
- **HN Algolia API**（curl + python3 递归）：`/api/v1/items/<id>` 拉主帖 42 评论全文 —— 绕开 WebFetch 域名拦截
- **WebSearch**：定位 `OnlyTerp/hermes-optimization-guide` + theaiagentindex stack 页 —— 二手中置信
- **firecrawl**：本轮 0 credits（curl + deepwiki 足够，遵守 ≤8 红色预算）
- 已读对照：`pm-openclaw-hermes.md`（全文件，品类/memory 不重做）+ `pm-raft-community.md` / `pm-buzz-community.md`（14 节框架）+ `../design/opc-product-discussion.md`（三层模型 + 缺口登记，只提建议不改）
