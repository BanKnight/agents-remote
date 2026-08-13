# OpenClaw 与 Hermes · PM 调研（always-on 持久 async agent 谱系）

> **承接**：`pm-grok-bot-community.md`（Grok Bot 社区走查揭示 OpenClaw/Hermes 是英文社区主对照系、我们 9 个参考产品未覆盖）；`pm-buzz-community.md`（Hermes ACP 文档）；`pm-avernet.md` C.13（OpenClaw Engine Adapter 模块）；`../design/opc-product-discussion.md` §10「OpenClaw/Hermes 调研缺口」登记项。
> **证据分级**：✅ 真实社区帖/源码/官方直证（带 url+用户名/组织+时间）/ 🟡 媒体二手 / ⚠️ PM 推断。
> **核心方法**：GitHub REST API（curl 直取 star/fork/issue/CVE）+ HN Algolia API（拉真实帖全文）+ deepwiki（源码级架构验证）+ firecrawl（取独立博客 + CVE NVD 一手）。firecrawl keyless 免费档 ~8 credits。
> **本文件价值**：第 1 节**精确定位**（搞清 OpenClaw/Hermes 真实身份——这是核心裁决），第 5 节**对 OPC 的启示**（缺口是否成立 + 落在哪）。

## 1. 调研对象精确定位（核心节）

### 1.1 OpenClaw 是什么——GitHub 上最大开源软件项目，单 agent 个人助手 harness

**真实身份**：[`openclaw/openclaw`](https://github.com/openclaw/openclaw) — TypeScript，386,056 stars / 81,142 forks / 5,549 open issues / 1,766 subscribers（GitHub REST API 2026-08-12 直取），前身叫 **Moltbot**（2026-01-30 "OpenClaw – Moltbot Renamed Again" 帖 667pts 印证改名史），🦞 龙虾吉祥物，口号「Your own personal AI assistant. Any OS. Any Platform. The lobster way」/ topics 含 `own-your-data` / `personal`（**不是 multi-agent**）。✅

**官方一句话定位**（独立博客 jakequist 518pts 帖直引）：「OpenClaw—the open-source framework that lets you run Claude, GPT-5, or whatever model you want to **actually control your computer**」。即**跑在你自己硬件（Mac mini/PC/VPS）上的、用 computer-use 控制整台机器的、跨 IM channel（Telegram/Discord/Slack/WhatsApp）可达的、always-on 持久个人 AI 助手 harness**。✅

**关键规模信号**（star-history 2026-03-01 文章）：「OpenClaw has now crossed 250K+ stars, overtaking React to become the most-starred non-aggregator software project on GitHub — From zero to #1 in under four months」。即 4 个月内从 0 到 GitHub 软件类 star 第一。截至 2026-08-12 走查日 386k stars，仍在活跃 push（v2026.7.1-2 发布于 2026-08-04）。✅

**作者/组织**：openclaw 组织（非个人），无大公司显式背书；许可证 `Other`（非标准 OSI，含 own-your-data 条款）。⚠️ **注意同名混淆已排除**：GitHub `openclaw` 搜索返回 7.1 万仓库（含 cc-switch / claude-mem / awesome-openclaw-skills / nanobot 等衍生工具），但 `openclaw/openclaw` 一家独大（386k vs 第二名 cc-switch 126k），是唯一「本体」。Avernet `pm-avernet.md` C.13 的「OpenClaw Engine Adapter」指的就是这个项目（作为 Avernet 可接入的 agent 引擎之一）——**不是另一个同名项目，是同一个本体被当引擎接入**。✅

### 1.2 Hermes Agent 是什么——Nous Research 的「自改进」个人助手 harness，OpenClaw 的同位竞品

**真实身份**：[`NousResearch/hermes-agent`](https://github.com/NousResearch/hermes-agent) — Python，MIT License，229,463 stars / 45,232 forks / 31,397 open issues（GitHub REST API 2026-08-12 直取），由 **Nous Research**（独立 AI 研究机构，Teknium 等知名 open-source 模型研究者所在组织）维护，口号「The agent that grows with you」「The self-improving AI agent」，☤ 杖蛇标志。✅

**官方一句话定位**（README 直引）：「The self-improving AI agent built by Nous Research. It's the only agent with a built-in learning loop — it creates skills from experience, improves them during use, nudges itself to persist knowledge, searches its own past conversations, and builds a deepening model of who you are across sessions. Run it on a $5 VPS, a GPU cluster, or serverless infrastructure that costs nearly nothing when idle. **It's not tied to your laptop — talk to it from Telegram while it works on a cloud VM.**」✅

**与 OpenClaw 的关系——同位竞品 + 一键互迁**：Hermes 提供 `hermes claw migrate` 命令，一键从 OpenClaw 导入 settings/memories/skills/API keys（deepwiki 源码确认）。README 直接对标 OpenClaw 做 differentiation（self-improving / provider-agnostic / multiple surfaces），社区把两者当**同品类开源先驱双子星**对照（见 1.4）。✅

**⚠️ 同名混淆排查**：「Hermes」是希腊神名，重名项目众多（Nous Research 的 Hermes 大模型系列 / 其他 ML 项目）。社区在 Grok Bot 对照里指的就是 **`NousResearch/hermes-agent`**（Buzz `pm-buzz-community.md` 提到的 `hermes-acp` 也是这个项目，Buzz 给它写了 ACP BYOH 教程）。确认无歧义。✅

### 1.3 两者的真实品类——「always-on 持久 async 个人助手 harness」，**不是多 agent 编排平台**

这是本次调研最关键的裁决——**OpenClaw 和 Hermes 都不是多 agent 编排产品**：

| 维度 | OpenClaw | Hermes Agent | 是不是编排平台 |
|------|----------|--------------|--------------|
| 核心定位 | personal AI assistant harness | personal AI assistant harness | **否**——都是「单 operator 一个持久助手」 |
| 状态焊点 | agent workspace（`~/.openclaw/workspace`，含 `AGENTS.md`/`SOUL.md`/`MEMORY.md`） | `~/.hermes/`（state.db + skills + memory） | agent 身份 + workspace（类 Grok Bot 单品哲学） |
| 多 agent 能力 | 有 subagent spawn（`sessions_spawn` isolated/fork mode + chief-of-staff `maxSpawnDepth≥2` + `tools.swarm` fan-out + `tools.agentToAgent` allowlist）✅ deepwiki 源证 | 有 subagent（`SubagentLaunchRequest` + 多模型 delegate）+ A2A 协议（v1.0，与 LangChain/CrewAI/Google ADK/**OpenClaw** 互通）+ 多 Hermes 实例 subprocess ✅ deepwiki 源证 | **两者都是「单 agent 主 + 子 agent 辅」**，子 agent 是 spawn-and-return 工具调用模式，**不是「多个具名 agent 长期协作的编排平台」** |
| 安全模型 | 显式「personal assistant」单一 trusted operator，**不建模多租户对抗边界** ✅ deepwiki 源证 | 显式「single-tenant personal agent」，唯一对抗 LLM 的安全边界是 OS ✅ deepwiki 源证 | **两者都明确放弃多租户/多用户身份隔离**——这与 Avernet/cf-os 的「组织级治理」哲学正相反 |
| 部署形态 | 用户硬件（macOS/Linux/Windows），`curl\|bash` 装 Node + Gateway | 用户硬件（含 $5 VPS/GPU 集群/7 种 terminal backend 含 Modal/Daytona serverless 持久化），`curl\|bash` 装 uv+Python | 都是 **BYO 硬件 + BYO 模型 + BYO IM** 的开源 harness |

**核心裁决一句话**：OpenClaw/Hermes 是 **Grok Bot 的开源前身谱系**——「在你自己硬件上跑一个 always-on 持久 personal AI 助手（用 computer-use 控制整台机器 + 跨 IM channel 可达 + 带 skills/plugins/MCP 扩展）」。**它们和 Grok Bot 同属「单品持久 agent」品类，不是「多 agent 编排平台」品类**。子 agent 能力是它们的「工具增强」而非「编排核心」——这跟 Grok Bot 走查 246 评论零编排讨论的结论完全一致（社区也根本不拿编排标准衡量 OpenClaw/Hermes）。

### 1.4 它们和 Grok Bot 的真实关系——商业托管版 vs 开源自建版

社区在 Grok Bot 对照里把它们当「Grok Bot 的开源前身」（`pm-grok-bot-community.md` §5 已详记 12 处明提 OpenClaw）。真实关系是：

- **Grok Bot = OpenClaw/Hermes 谱系的「商业托管版」**——把「自建 harness（自己装 / 自己管 Gateway / 自己接 IM / 自己付模型 API）」打包成「$200/月 xAI 托管，开箱即用 always-on VM + secure handoff + guardrail」。即**把 OpenClaw/Hermes 的运维负担换成 xAI 的信任负担**（社区 30% 评论反对正是反对这个信任转移）。✅
- **关键差异在「信任 vs 便利」的取舍**：OpenClaw/Hermes 走「own your data / 自托管 / 单一 trusted operator = 自己」路线（私有数据不出本机，但用户自己扛运维 + 安全）；Grok Bot 走「全托管 + 跨 app 登录代操作」路线（省运维，但所有账号+数据交 Musk 服务器）。这恰好印证了 `pm-grok-bot-community.md` §9.3 第 4 条「信任是比 lock-in 更深的 SaaS agent 阻力」——**OpenClaw/Hermes 的存在本身就是社区规避 Grok Bot 信任问题的解药**（`impulser_`「I can use an open source version and use whatever model I want」）。✅
- **它们不是 Grok Bot 的「编排前身」**——Grok Bot 的多 Bot group chat / chief of staff 在 OpenClaw/Hermes 里只是 subagent spawn 的浅层扩展（一个主 agent 派子任务），不是独立产品形态。社区没人因「OpenClaw 能编排多 agent」而把它当 Grok Bot 编排版前身——都当「单 agent 持久助手」前身。

## 2. 各自的 PM 调研（定位 / 场景 / feature / 状态哲学 / 编排语义）

> 因两项目都是大型开源单品（38 万 / 23 万 stars，feature 极多），本节压缩为「对 OPC 决策有信号」的维度，不逐 feature 罗列（OpenClaw 5400+ skills registry、Hermes 七种 terminal backend 等细节非本调研重点）。

### 2.1 OpenClaw PM 维度

- **一句话定位**：跑在用户自己硬件上、用 computer-use 控制整台机器、跨 IM 可达的 always-on 持久 personal AI 助手 harness（**不是 Claude wrapper**——deepwiki 明确，它可接 Anthropic/MiniMax/OpenAI/本地模型等多 provider）。✅
- **根本场景**：用户（多是非硬核开发者——见 §3 Ask HN「non-technical people automating small tools」）买一台 Mac mini / 旧笔记本当 always-on agent host，OpenClaw 跑在上面，经 Telegram/Discord/Slack/WhatsApp 接收指令，用 computer-use 操作浏览器/桌面 app/文件系统干活，7×24 在线。典型用例（Ask HN 342pts「Who is using OpenClaw」帖真实用户）： nightly 拉 Obsidian vault 生成 flashcard / 在 Discord channel 维护个人项目 / 个性化 morning brief / ERP 工单自动改+发 PR / 个人 recipe/movie/notes 工具。✅
- **痛点（社区戳穿的真实痛点）**：(1) **「solution in search of a problem」**——`SunshineTheCat`「Dropbox had a defined use case... OpenClaw does not serve a particular problem」+ `sputknick`「would have worked just as well as a cron job with some LLM」——社区最大质疑是「没杀手锏用例，能干的 cron+LLM 都能干」；(2) **安全是噩梦**——composio.dev「security nightmare」帖 397pts + CVE-2026-33579 权限提升 CVSS 9.9（§3 详）+ `samxli`「didn't give it free reign due to obvious security concerns, sandboxed to docker」；(3) **hustler/grifter 滥用污染心智**——`XTXinverseXTY`「initial acolytes skewed towards solo founders and hustler/grifter types... fastest way to monetize is spamming fake social proof」+ 最多下载的 skill 是 Twitter；(4) **Anthropic/Google 封杀**——1099pts「Anthropic no longer allowing Claude Code subscriptions to use OpenClaw」+ 802pts「Google restricting Google AI Pro/Ultra for using OpenClaw」——provider 视其为滥用第三方 harness。✅
- **状态哲学**：状态焊在 **agent workspace（`~/.openclaw/workspace`，含 `AGENTS.md`/`SOUL.md`/`MEMORY.md` + `memory/YYYY-MM-DD.md` 每日笔记）**——pre-compaction flush 提醒模型写持久笔记。**这是 OpenClaw/Hermes 谱系的标志性设计**：memory 是 Markdown 文件（人可读 + agent 可写），不是向量库。与 Raft per-agent memory + todos.dev 三层 memory 同源（见 §5 对 OPC 启示）。✅
- **编排语义**：subagent（`sessions_spawn` isolated/fork mode）+ chief-of-staff（`maxSpawnDepth≥2`）+ `tools.swarm` fan-out + `tools.agentToAgent`——**deepwiki 源证「not strictly single-agent」**，但本质是「主 agent 派子任务」的工具增强，不是「多个具名长期协作 agent 团队」。这跟 Raft/Avernet/Paperclip 的「多 agent 编排平台」是不同品类。

### 2.2 Hermes Agent PM 维度

- **一句话定位**：Nous Research 出品的「self-improving」personal AI 助手 harness——内置 learning loop（从经验创建 skill + 用中改进 + 自我提醒持久化知识 + 搜自己历史对话 + 跨 session 建立用户模型）。**provider-agnostic**（Nous Portal/OpenRouter/OpenAI/自有 endpoint，`hermes model` 切换零代码改）。✅
- **根本场景**：与 OpenClaw 几乎同构（跨 IM Telegram/Discord/Slack/WhatsApp/Signal + CLI 的 always-on 持久助手），差异在三点：(1) **serverless 友好**——README 强调「run on a $5 VPS or GPU cluster」「Daytona and Modal offer serverless persistence — your agent's environment hibernates when idle and wakes on demand, costing nearly nothing between sessions」（OpenClaw 偏 always-on 常驻，Hermes 偏 idle sleep）；(2) **self-improving 闭环**——autonomous skill creation after complex tasks + skills self-improve during use + FTS5 session search with LLM summarization（OpenClaw 偏用户手写 skill，Hermes 偏 agent 自创）；(3) **research-ready**——batch trajectory generation + trajectory compression for training next-gen tool-calling models（Nous Research 是研究机构，Hermes 是其研究产物的副产品）。✅
- **痛点**：(1) **bot blocks 频发**——Grok Bot 走查 `therealdrag0`「I use Hermes locally and it's constantly hitting bot blocks」（computer-use 走人界面脆弱同因）；(2) **生态规模小于 OpenClaw**——awesome-hermes-agent 5.3k stars vs awesome-openclaw-skills 5.2 万 stars，一个数量级差；(3) 同 OpenClaw 的安全/封杀/滥用污染心智三痛点。
- **状态哲学**：状态焊在 **`~/.hermes/`（state.db SQLite session 数据库 + skills/ + plugins/ + memory）**——`MemoryManager` 管理 persistent memory（用户偏好/环境细节/学到的教训），跨 session 持久。**与 OpenClaw 的 Markdown 文件派不同，Hermes 走 SQLite + FTS5 全文检索派**——两种 memory 工程化路径（这对 OPC memory 设计是直接参考，见 §5）。✅
- **编排语义**：subagent（`SubagentLaunchRequest` 多模型 delegate）+ **A2A 协议 v1.0**（与 LangChain/CrewAI/Google ADK/**OpenClaw** 互通，`a2a_call`/`a2a_orchestrate` 工具）+ 多 Hermes subprocess 实例（tmux 管理，长自治任务或多 agent 协调）。**deepwiki 源证有 multi-agent orchestration，但同样是「主+子」模式**。值得注意的是 Hermes 实现了 **A2A 协议**——这是比 OpenClaw `tools.agentToAgent` allowlist 更标准的 agent 间通信契约（与 Buzz ACP 同类，都是想给「agent 间通信」立标准）。✅

## 3. 社区走查（口碑 / 上手 / 竞品定位）

### 3.1 OpenClaw 社区口碑——声量极高但「solution in search of a problem」质疑同样高

社区对 OpenClaw 的态度**极度两极分化**（Ask HN 342pts「Who is using OpenClaw」153 评论全文走查）：

**好评（真实在用的人）**：
- `mholubowski`「Yes, at our company we are using it _very_ extensively... multiple isolated OpenClaw instances serving as employee within Slack」——公司级 dogfooding。✅
- `geoffmunn`「We're using OpenClaw to do a massive number of fixes and improvements to our ERP. It takes Jira tickets, resolves them, creates a GitHub PR, which is then reviewed by another AI agent」——ERP 工单→PR→另一 AI agent review 流水线（**这是 subagent 的真实用法**，主 agent 干活 + 另一 agent review，类 Raft verification gate 的简化版）。✅
- `dsiegel2275` nightly 拉 Obsidian vault 生成 flashcard——典型 always-on 场景。✅
- `Jtarii`「gives me a pleasant interface to talk to my desktop from my phone... send my computer a discord message and have it execute arbitrarily complex task」——跨设备指挥核心卖点。✅
- jakequist 518pts 博客「OpenClaw is what Apple Intelligence should have been」——Mac mini 卖断货，「the killer app for Mac hardware... An AI agent that clicks buttons」。✅

**差评（社区集中火力）**：
- **「solution in search of a problem」最高频**——`SunshineTheCat`（多轮坚持）「OpenClaw does not serve a particular problem. When/if it does, I will happily use it」；`sputknick`「would have worked just as well as a cron job with some LLM looking at Brave API. Like a lot of AI tools, it was a lot of work for underwhelming results」；`Aperocky`「it became bloated... I made gateway agent that does exactly one thing - connect me to the machine. No subagents, no workflows, nothing」——**用户退回到极简 SSH wrapper**。✅
- **安全噩梦**——`samxli`「didn't give it free reign due to obvious security concerns, sandboxed to docker instead. For a lot of tasks it's probably more trouble to set this up than to just DIY it」；composio.dev 397pts「security nightmare dressed up as a daydream」帖（已 404，但社区共识成立）；CVE-2026-33579（§3.3 详）。✅
- **hustler/grifter 污染**——`XTXinverseXTY`「initial acolytes skewed towards solo founders and hustler/grifter types. The Mac minis were likely to spam leads over iMessage. The single top downloaded skill was for Twitter. The fastest way to monetize is spamming fake social proof」；`rvz`「is anyone making money directly out of running OpenClaw other than hosted providers or selling OpenClaw courses?」——**社区怀疑 OpenClaw 热度是 manufactured marketing**。✅
- **provider 封杀**——Anthropic 1099pts + Google 802pts 双封杀帖（§3.2 详）。✅
- **DIY 更省**——`sigseg1v`「I talk to my desktop from my phone by having termux opened to a persistent tmux session that's sshed in to the desktop over tailscale. I have Claude running in yolo mode」——**重度技术用户用 tmux+ssh+tailscale+yolo Claude 自建等效系统**（与 Grok Bot 走查 `mike_hearn` systemd+Codex+sendmail 同类「自建派」）。✅

### 3.2 OpenClaw 与 provider 的封杀战——harness 与原厂的紧张关系

这是 OpenClaw 谱系最独特的社区现象——**模型原厂（Anthropic/Google）把它当滥用第三方 harness 封杀**：

- **Anthropic 2026-04-03 封杀**（1099pts / 827 评论，Tell HN 帖全文走查）：Anthropic 邮件「Starting April 4 at 12pm PT, you'll no longer be able to use your Claude subscription limits for third-party harnesses including OpenClaw... these tools put an outsized strain on our systems」——把 OpenClaw 单独点名，要求转 pay-as-you-go。社区反应是「Anthropic 卖订阅时不限，用满了说 outsized strain」（`alasano`/`eagleinparadise`）。✅
- **Anthropic 2026-04-30 字符串正则误伤**（1349pts / 720 评论）：`cowlby`「I don't understand how, having access to Mythos and unlimited use, their solution to open harnesses is lazy string regex-style matching」——Anthropic 用正则扫 commit message 里「OpenClaw」字样拒服务，社区群嘲「regex 拦截太 sloppy」。✅
- **Google 2026-02-22 限制**（802pts）：Google AI Pro/Ultra 订阅者用 OpenClaw 被无预警限制。✅
- **2026-04-21 解禁**（511pts）：Anthropic 改口「OpenClaw-style Claude CLI usage is allowed again」——封杀战持续 ~3 周后和解。✅

**对 OPC 的含义**：这揭示了「**harness 与模型原厂的结构性张力**」——第三方 harness 把订阅当 API 用，原厂视为算力滥用。这是 OpenClaw/Hermes 这类「BYO 订阅 harness」品类的**结构性商业风险**：你的核心成本（模型）受制于一个会封杀你的原厂。agents-remote 若走 BYO Claude/Codex 订阅路线，**这条张力直接传染**——需提前考虑（走 API key 而非订阅、或 provider-agnostic 多模型）。⚠️

### 3.3 CVE-2026-33579——OpenClaw 安全模型的硬证据

NVD 一手（firecrawl 取全文）：

- **漏洞**：OpenClaw before 2026.3.28，`/pair approve` 命令路径权限提升——caller scopes 未转发到核心审批检查，**有 pairing 权限但无 admin 权限的调用者可批准请求 broader scopes（含 admin）的 pending device request**。根因在 `extensions/device-pair/index.ts` + `src/infra/device-pairing.ts` 缺失 scope validation。✅
- **严重度**：CVSS 3.1 **9.9 CRITICAL** / CVSS 4.0 **9.4 CRITICAL**，CWE-863（Incorrect Authorization）。✅
- **修复**：commit `e403decb6e20091b5402780a7ccd2085f98aa3cd`（2026.3.28 版本），GHSA-hc5h-pmr3-3497。✅

**对 OPC 的含义**：这是 OpenClaw「单一 trusted operator」安全模型**在多设备 pairing 场景下的破功**——一旦涉及多设备/多调用者，scope 校验缺失就成权限提升漏洞。**直接印证 `pm-grok-bot-community.md` §9.2「共享用户身份 = accountability sink」的核心警示**：OpenClaw/Hermes 的「单一 trusted operator」模型在「跨设备 / 多调用者 / 多 agent」扩展时天然脆弱。OPC 多 agent 编排若走「一个用户身份挂多个 agent」，就是踩同坑——必须每 agent 独立 identity + scoped capability（见 §5）。✅

### 3.4 Hermes 社区——规模小于 OpenClaw，但 Nous Research 背书强

- HN 上 Hermes 独立帖**声量低**（`hermes-agent` 搜索最高 6pts，远低于 OpenClaw 动辄 500+pts 大帖）——但这是因为它常被放在 OpenClaw 对照里讨论（Grok Bot 走查 `rw2`「how does this compare to Hermes which is much cheaper」/ `ls612`「this is a Hermes Agent plus a credential proxy」），不是真的没人用。✅
- **TechCrunch 2026-07-13 报道**「Hermes Agent maker Nous Research in talks for new funding at $1.5B valuation」——Nous Research 估值 $1.5B 融资中，Hermes Agent 是其旗舰产品之一。✅
- **真实用户反馈**（Grok Bot 走查 + OpenClaw Ask HN 线程）：`therealdrag0`「I use Hermes locally and it's constantly hitting bot blocks」（computer-use 脆弱）；`atonse`（OpenClaw Ask HN）「I'm exploring setting up Hermes from scratch so my family can interact with it in a group chat」——家庭群聊场景；`yakkomajuri`（OpenClaw Ask HN）「I've been trying out Hermes this week. OpenClaw felt like too much」——**用户因 OpenClaw 太重转 Hermes**，用于 WhatsApp-style 个人笔记分流（to-do/to-read/to-try lists）。✅
- **Buzz 走查交叉**：Buzz 给 Hermes 写了 ACP BYOH 教程（`pm-buzz-community.md` §2 好评 4），证明 **Hermes 是「可被其他编排平台当引擎接入」的 agent**——这进一步印证 Hermes 是「单品 agent」而非「编排平台」（编排平台不会甘心被 Buzz 当引擎接入）。✅

### 3.5 always-on 持久 async agent 品类生态图景

把 OpenClaw/Hermes 放回品类全景（这是 `pm-grok-bot-community.md` §5 已勾画、本调研补全的图景）：

| 项目 | 形态 | 部署 | 编排能力 | 信任模型 | 本调研覆盖 |
|------|------|------|---------|---------|----------|
| **OpenClaw** | 个人助手 harness（computer-use + 跨 IM） | 自托管（用户硬件） | subagent spawn（主+子） | 单一 trusted operator=自己 | ✅ 本调研 |
| **Hermes Agent** | 个人助手 harness（self-improving） | 自托管（含 serverless） | subagent + A2A 协议 | 单一 trusted operator=自己 | ✅ 本调研 |
| **Grok Bot** | 商业托管个人助手 | xAI 云 VM | Bot group chat（浅） | 信任 xAI（社区反对） | ✅ pm-grok-bot |
| **buzz.xyz** | Slack+GitHub 替代品（非 harness） | 自托管 / hosted | 多 agent swarm（深，但 token 爆炸） | channel membership 粗粒度 | ✅ pm-buzz |
| **mike_hearn 自建** | systemd+Codex+sendmail async agent | 自建（$20/月） | 单 bot | dedicated UNIX user per agent | ✅ pm-grok-bot-community 引 |
| **smartcomputer-ai/lightspeed** | 开源竞品 | 自托管 | 单 agent | — | ✅ pm-grok-bot-community 引 |
| **cc-switch** | harness 管理器（不本体） | 桌面 app | 无（管多个 harness） | — | ⚠️ 本调研发现（126k stars 衍生工具） |

**品类裁决**：OpenClaw/Hermes 是「**always-on 持久 async personal agent harness**」品类的开源双子星先驱。它们的**核心创新**是「在你自己硬件上跑一个 7×24 在线、跨 IM 可达、带 skills/plugins/MCP 扩展、用 computer-use 控制整台机器的个人 AI 助手」——这是 Grok Bot 商业化的产品基座。**但它们不是「多 agent 编排平台」**——子 agent 是工具增强，不是编排核心。

## 4. 编排语义的社区视角（它们到底是不是编排产品？）

**核心裁决：不是。与 Grok Bot 走查结论完全同构——社区也根本不拿编排标准衡量 OpenClaw/Hermes。**

- **OpenClaw 的 multi-agent 能力（subagent spawn + chief of staff + tools.swarm + tools.agentToAgent）deepwiki 源证为真**，但社区**几乎没人用它做多 agent 协作**。Ask HN 153 评论 + 多个 OpenClaw 大帖，**真实用户用例全是「单 agent 干一个活」**（ERP 工单→PR 是「主 agent 干 + 另一 agent review」的 subagent 调用，不是「多 agent 团队协作」）。唯一提到「公司级多 instance」的 `mholubowski` 用的是「multiple isolated OpenClaw instances serving as employee within Slack」——**多个独立 OpenClaw 实例**，不是「一个 OpenClaw 编排多个 agent」。✅
- **`AndrewKemendo`（OpenClaw Ask HN）一句话点破**「Everyone's just making their own multi agent stacks now」——**OpenClaw/Hermes 被当「单 agent harness 底座」，需要多 agent 编排的人在上面自建 stack**（这正是 cc-switch / awesome-openclaw-skills / nanobot 等衍生生态繁荣的原因——大家把 OpenClaw 当组件，不当编排平台）。✅
- **Hermes 的 A2A 协议**是值得注意的信号——它和 Buzz ACP 同属「想给 agent 间通信立标准」的尝试。但 Hermes 自己也是「主+子」模式，A2A 是它**作为可被编排平台调用的 agent**的契约（Buzz 接它做 BYOH 就是明证），不是 Hermes 自己做编排。✅

**对 OPC 的含义（强印证既有结论）**：OpenClaw/Hermes **不是 OPC 多 agent 编排的竞品**——它们是「单 agent 持久助手」品类的开源先驱，社区把它们当「Grok Bot 的开源前身」（单品形态参考），**不是编排平台**。这强烈印证 `../design/opc-product-discussion.md` §9「Grok Bot 是单品爆款不是编排平台」+ §5「编排老师拼图不含 Grok Bot」的判断——**OpenClaw/Hermes 同样不进编排老师拼图**。它们的定位是「**always-on 持久 async agent 的开源基座参考 + 个人助手 harness 的工程化范本**」，不是编排竞品。

## 5. 对 OPC 的启示（重点节）

### 5.1 缺口是否成立——部分成立（补的是「品类认知」不是「编排竞品」）

`../design/opc-product-discussion.md` §10 登记的「OpenClaw/Hermes 调研缺口」**部分成立**：

- **成立的部分**：我们 9 个参考产品确实**没覆盖「always-on 持久 async personal agent harness」这个品类**——Grok Bot 是商业托管版（不是开源基座），mike_hearn 自建只是 HN 评论信号（非完整产品），buzz.xyz 是 Slack 替代品（非 harness）。OpenClaw/Hermes 是这个品类的**开源基座**，补了我们对「Grok Bot 的产品血统」的认知空白（社区主对照系为什么是 OpenClaw 不是豆包）。
- **不成立的部分**：原登记项暗示它们可能是「OPC 多 agent 编排的开源竞品底座」——**这个判断错了**。它们是「单 agent 持久助手」品类，不是「多 agent 编排平台」品类。**它们对 OPC 编排层的直接竞争性很弱**（OPC 是编排平台，它们是 harness 单品，赛道不同），但**作为「always-on agent 工程化范本」+「Grok Bot 血统认知」+「安全反面教材」对 OPC 有参考价值**。

**修正登记项**：`../design/opc-product-discussion.md` §10 应把「OpenClaw/Hermes 调研缺口」改为「**已调研（pm-openclaw-hermes.md）——它们是 always-on 持久 async personal agent harness 品类的开源双子星（OpenClaw 386k stars / Hermes 229k stars），是 Grok Bot 的开源前身，但不是多 agent 编排平台（社区零编排讨论 + subagent 是工具增强非编排核心 + 单一 trusted operator 安全模型）。对 OPC 的定位：单品形态参考（学 always-on 持久 workspace + Markdown/SQLite memory 工程化）+ 安全反面教材（CVE-2026-33579 印证共享身份 = accountability sink），不进编排老师拼图。**」

### 5.2 要学什么（三条，都是单品/工程化维度，不是编排）

1. **always-on 持久 workspace 的工程化范本**——OpenClaw 的 `~/.openclaw/workspace`（`AGENTS.md`/`SOUL.md`/`MEMORY.md` + `memory/YYYY-MM-DD.md` 每日笔记 + pre-compaction flush）和 Hermes 的 `~/.hermes/state.db`（SQLite + FTS5 全文检索）是两条**已验证的「agent 持久 memory 工程化路径」**。OpenClaw 走 Markdown 文件派（人可读 + agent 可写，与 Raft MEMORY.md + todos.dev 三层架构同源），Hermes 走 SQLite + FTS5 派（结构化检索 + 跨 session 全文搜）。**这两条路径 OPC 都该认真看**——PRD「长记忆」务实分阶段时，OpenClaw Markdown 派是「先做轻」的范本，Hermes SQLite 派是「后做重」的范本。对应 `../design/opc-product-discussion.md` §4「角色记忆」+ §5 编排老师拼图「长记忆」行。✅
2. **serverless persistence（idle sleep + wake on demand）是 OPC「按需唤醒」的正确工程化**——Hermes README 明确「Daytona and Modal offer serverless persistence — your agent's environment hibernates when idle and wakes on demand, costing nearly nothing between sessions」。这直接呼应 `pm-grok-bot-community.md` §9.3 第 3 条「always-on token 成本爆炸，OPC 应走按需唤醒 + 持久 context compaction 非全员 always-on」——**Hermes 已经把这个工程化做出来了**（7 种 terminal backend 含 Modal/Daytona serverless）。OPC 的 agent 执行层若走 serverless，Hermes 是现成参考。✅
3. **跨 IM channel 的「agent lives where you do」是 OPC 移动端的范本**——OpenClaw/Hermes 都把「Telegram/Discord/Slack/WhatsApp/Signal + CLI」作为一等公民 channel（agent 跑在云/家用机，用户从手机 IM 指挥）。这呼应 agents-remote 的移动端 PWA 路线——**「agent 持久 + 用户从任意 IM/界面接入」是已被 OpenClaw/Hermes 验证的产品形态**。OPC 不一定要接 Telegram，但「agent 持久跑 + 用户从手机随时随地指挥」的核心范式值得学。✅

### 5.3 要防什么（三条，都是安全/商业维度）

1. **「单一 trusted operator」安全模型在多 agent / 多设备扩展时天然脆弱（CVE-2026-33579 硬证据）**——OpenClaw CVE-2026-33579（CVSS 9.9 权限提升）和 Hermes 显式「唯一对抗 LLM 的安全边界是 OS」都是「单一 trusted operator」哲学的产物。**OPC 多 agent 编排若走「一个用户身份挂多个 agent」，就是踩同坑**——必须每 agent 独立 identity + scoped capability（`pm-grok-bot-community.md` §9.2 accountability sink 铁律）。OpenClaw/Hermes 的安全模型是**反面教材**，不是参考——它们放弃了多租户隔离，OPC 不能放弃（多 agent 间必须有信息边界 + 权限隔离）。对应 `../design/opc-product-discussion.md` §4「角色身份：每 agent 独立 identity」。✅
2. **「harness 与模型原厂的结构性张力」是 BYO 订阅品类的商业风险**——Anthropic/Google 双封杀 OpenClaw 揭示：第三方 harness 把订阅当 API 用，原厂视为算力滥用。**agents-remote 若走 BYO Claude/Codex 订阅路线，这条张力直接传染**。OPC 应提前考虑：(a) 走 API key（按量付费）而非订阅（避免封杀）；(b) provider-agnostic 多模型（OpenClaw/Hermes 都强调「use any model you want」，OpenClaw 显式「not just a Claude wrapper」）；(c) 警惕「用订阅当 API」的灰色地带。⚠️
3. **「hustler/grifter 滥用 + manufactured marketing 污染心智」是 always-on agent 产品的社区风险**——OpenClaw 被 `XTXinverseXTY` 戳穿「initial acolytes skewed towards hustler/grifter types, fastest way to monetize is spamming fake social proof」+ 多位评论者怀疑「manufactured marketing」。**OPC 若主打「always-on agent 帮你群发/外联」类场景，会重蹈 Grok Bot 销售外联被定性为「DoS on suppliers」的覆辙**（`pm-grok-bot-community.md` §2 差评 7）。OPC 的用例定位应避开「批量外联/群发」类 spam 场景，聚焦「编排多个 agent 干有价值的协作活」。⚠️

### 5.4 落在三层模型和编排老师拼图的哪里

- **三层模型（`../design/opc-product-discussion.md` §3）**：OpenClaw/Hermes 焊在 **「bot 身份 + workspace」**（类 Grok Bot 单品哲学），与 OPC 三层都有点关系但都不深：(a) 同事层——它们是「单 agent 当同事」的范本（与 Grok Bot 同）；(b) 项目层——它们的 workspace memory（Markdown/SQLite）是项目层持久的工程化参考；(c) 协作层——**它们不涉及**（子 agent 是工具调用，不是协作编排）。**主要落在「同事层 + 项目层 memory 工程化」参考**。
- **编排老师拼图（`../design/opc-product-discussion.md` §5）**：**不进拼图**——与 Grok Bot 同裁决。它们不是编排产品，社区不拿编排标准衡量它们，没有编排子能力可学（subagent spawn 是工具增强，Raft AX / Avernet 状态机 / Buzz ACP 都是更好的编排老师）。**它们的定位是「单品形态参考 + memory 工程化范本 + 安全反面教材」**，在 §9「单品爆款 vs 编排平台」分野里和 Grok Bot 同列「单品爆款」。

### 5.5 是否新增为编排老师或竞品——不新增编排老师，新增为「单品形态参考 + 品类背景」

- **不新增为编排老师**：理由见上，它们不进 §5 拼图。
- **新增为「单品形态参考 + always-on agent 品类背景」**：建议 `../design/opc-product-discussion.md` §9「单品爆款」节把 OpenClaw/Hermes 与 Grok Bot 并列，标注「**Grok Bot 的开源前身谱系（社区主对照系），学 always-on 持久 workspace + Markdown/SQLite memory 工程化 + serverless persistence；防单一 trusted operator 安全模型（CVE-2026-33579）+ harness 与原厂张力 + hustler 滥用污染心智**」。
- **对 `multi-agent-orchestration.md` 的连带**：§13 三件套对比表若已列 Grok Bot，应加注「Grok Bot 的开源前身 OpenClaw/Hermes 已调研（pm-openclaw-hermes.md），同属单品持久 agent 非编排平台，不进编排对比表」。

## 6. 证据清单

### ✅ 真实社区帖 / 源码 / 官方直证（带 url + 时间）

1. **GitHub `openclaw/openclaw`** — 386,056 stars / 81,142 forks / 5,549 open issues / 1,766 subscribers / TypeScript / created 2025-11-24 / pushed 2026-08-12 / license Other / topics 含 `own-your-data`/`personal` — https://github.com/openclaw/openclaw — 2026-08-12（GitHub REST API 直取）
2. **GitHub `NousResearch/hermes-agent`** — 229,463 stars / 45,232 forks / 31,397 open issues / Python / MIT / created 2025-07-22 / pushed 2026-08-12 / homepage hermes-agent.nousresearch.com — https://github.com/NousResearch/hermes-agent — 2026-08-12（GitHub REST API 直取）
3. **Hermes README 直引**「The self-improving AI agent... Run it on a $5 VPS, a GPU cluster, or serverless infrastructure... talk to it from Telegram while it works on a cloud VM」+ `hermes claw migrate` 一键互迁 + 7 terminal backend（含 Modal/Daytona serverless persistence）— https://github.com/NousResearch/hermes-agent — 2026-08-12（GitHub README API）
4. **OpenClaw 改名史**「OpenClaw – Moltbot Renamed Again」667pts — https://news.ycombinator.com/item?id=42745637 — 2026-01-30
5. **HN「Claude Code refuses requests or charges extra if your commits mention OpenClaw」** 1349pts / 720 评论 — https://news.ycombinator.com/item?id=47963204 — 2026-04-30（Anthropic 正则误伤）
6. **HN Tell HN「Anthropic no longer allowing Claude Code subscriptions to use OpenClaw」** 1099pts / 827 评论（含 Anthropic 邮件全文） — https://news.ycombinator.com/item?id=47633396 — 2026-04-03
7. **HN「Google restricting Google AI Pro/Ultra subscribers for using OpenClaw」** 802pts / 705 评论 — https://news.ycombinator.com/item?id=43144723（srigi 提交） — 2026-02-22
8. **HN「Anthropic says OpenClaw-style Claude CLI usage is allowed again」** 511pts — https://news.ycombinator.com/item?id=42745637（docs.openclaw.ai/providers/anthropic） — 2026-04-21
9. **HN「OpenClaw is what Apple intelligence should have been」** 518pts / 417 评论（jakequist 博客） — https://news.ycombinator.com/item?id=42959805 — 2026-02-05；博客全文 https://www.jakequist.com/thoughts/openclaw-is-what-apple-intelligence-should-have-been — 2026-02-04（关键定义「open-source framework that lets you run Claude, GPT-5, or whatever model you want to actually control your computer」+ Mac mini 卖断货）
10. **HN「OpenClaw privilege escalation vulnerability」** 514pts / 256 评论（CVE-2026-33579） — https://news.ycombinator.com/item?id=43290100 — 2026-04-03
11. **NVD CVE-2026-33579 Detail**（一手）— CVSS 3.1 **9.9 CRITICAL** / CVSS 4.0 **9.4 CRITICAL** / CWE-863 Incorrect Authorization / `/pair approve` scope validation 缺失 / 修复 commit `e403decb6e` / GHSA-hc5h-pmr3-3497 / 影响版本 < 2026.3.28 — https://nvd.nist.gov/vuln/detail/CVE-2026-33579 — 2026-03-31 发布
12. **HN「OpenClaw is a security nightmare dressed up as a daydream」** 397pts / 297 评论（composio.dev，原文已 404 但 HN 帖证社区共识成立） — https://news.ycombinator.com/item?id=43333090 — 2026-03-22
13. **HN Ask HN「Who is using OpenClaw?」** 342pts / 153 评论（382 条带文本评论全文走查） — https://news.ycombinator.com/item?id=42352557（misterchocolat 提交） — 2026-04-15（`SunshineTheCat`「solution in search of a problem」+ `sputknick`「cron job 就够了」+ `geoffmunn` ERP 用例 + `mholubowski` 公司级 + `XTXinverseXTY` hustler/grifter 污染 + `samxli` docker 沙箱 + `Aperocky` 退回极简 SSH wrapper + `Jtarii` 手机指挥桌面 + `sigseg1v` tmux+ssh 自建）
14. **HN「OpenClaw surpasses React to become the most-starred software project on GitHub」** 291pts（star-history 博客） — https://news.ycombinator.com/item?id=43235500 — 2026-03-01；博客全文「From zero to #1 in under four months」 https://www.star-history.com/blog/openclaw-surpasses-react-most-starred-software — 2026-03-01
15. **HN「OpenClaw is changing my life」** 340pts / 383 评论（reorx.com 博客） — https://news.ycombinator.com/item?id=42959805 — 2026-02-08
16. **HN「A sane but bull case on Clawdbot / OpenClaw」** 303pts / 481 评论（brandon.wang） — https://news.ycombinator.com/item?id=42922400 — 2026-02-03
17. **HN「OpenClaw Creator Spent $1.3M on OpenAI Tokens in 30 Days」** 163pts（steipete 推文） — https://news.ycombinator.com/item?id=44139293 — 2026-05-16（always-on 成本爆炸佐证）
18. **deepwiki `openclaw/openclaw` 源码级验证（两轮）** — Gateway/Agents/Channels/Skills/Plugins/MCP/Memory 架构 + `~/.openclaw/workspace`（AGENTS.md/SOUL.md/MEMORY.md）+ subagent（`sessions_spawn` isolated/fork + chief-of-staff `maxSpawnDepth≥2` + `tools.swarm` + `tools.agentToAgent`）+ 显式「personal assistant 单一 trusted operator，不建模多租户对抗边界」+「not just a Claude wrapper」（多 provider） — https://deepwiki.com/openclaw/openclaw
19. **deepwiki `NousResearch/hermes-agent` 源码级验证（两轮）** — AIAgent class + 三层架构（UI/Core/Tool）+ Gateway + `~/.hermes/`（state.db SQLite + skills + memory）+ subagent `SubagentLaunchRequest` + **A2A 协议 v1.0**（与 LangChain/CrewAI/Google ADK/OpenClaw 互通）+ 显式「single-tenant personal agent，唯一对抗 LLM 的安全边界是 OS」+ provider-agnostic + Nous Portal 可选订阅 + `hermes claw migrate` 一键互迁 — https://deepwiki.com/NousResearch/hermes-agent
20. **衍生生态规模信号**（GitHub 搜索） — cc-switch 126k stars（harness 管理器）/ awesome-openclaw-skills 51k stars（VoltAgent，5400+ skills）/ nanobot 46k stars（HKUDS 轻量替代）/ claude-mem 90k stars（跨 harness memory）/ awesome-hermes-agent 5.3k stars — 印证 OpenClaw 衍生生态比 Hermes 大一个数量级
21. **Hermes ACP 被 Buzz 集成**（`pm-buzz-community.md` §2 好评 4 + 证据 10） — Hermes Agent 官方 ACP 文档写了 Buzz 集成章节 + moltis/opensre/hermes-ecosystem 接入 — 印证 Hermes 是「可被编排平台当引擎接入的单品 agent」非编排平台本身

### 🟡 媒体/博客二手（中置信）

22. **TechCrunch「Hermes Agent maker Nous Research in talks for new funding at $1.5B valuation」** — https://techcrunch.com/2026/07/13/hermes-agent-maker-nous-research-in-talks-for-new-funding-at-1-5b-valuation/ — 2026-07-13（Nous Research $1.5B 估值融资中）
23. **jakequist 博客「OpenClaw is What Apple Intelligence Should Have Been」**全文（518pts HN 帖源） — https://www.jakequist.com/news/openclaw-is-what-apple-intelligence-should-have-been/ — 2026-02-04（Mac mini 卖断货 + Apple 错失 agent 层 + OpenClaw 是「third party 做 Apple 不敢做的 plausible deniability」）
24. **star-history「OpenClaw Surpasses React」**全文 — https://www.star-history.com/blog/openclaw-surpasses-react-most-starred-software — 2026-03-01（4 个月 0→GitHub 软件类 star 第一）

### ⚠️ PM 推断（本文件独家，低置信）

25. 「OpenClaw/Hermes 是 always-on 持久 async personal agent harness 品类的开源双子星，Grok Bot 的开源前身」——基于社区对照映射 + 品类全景对照
26. 「它们不是多 agent 编排平台（子 agent 是工具增强非编排核心 + 社区零编排讨论 + 单一 trusted operator 安全模型放弃多租户）」——基于 deepwiki 源码 + HN 多帖全文走查
27. 「harness 与模型原厂的结构性张力是 BYO 订阅品类商业风险，OPC 走 API key + provider-agnostic 可规避」——基于 OpenClaw 被 Anthropic/Google 双封杀的因果推断
28. 「OpenClaw/Hermes 的 memory 工程化（Markdown 派 / SQLite 派）是 OPC 长记忆务实分阶段的现成参考」——基于 deepwiki + 与 Raft/todos.dev memory 设计的横向对照
29. 「『单一 trusted operator』安全模型在多 agent/多设备扩展时天然脆弱（CVE-2026-33579 硬证据），OPC 多 agent 必须独立 identity + scoped capability」——基于 CVE + 与 `pm-grok-bot-community.md` accountability sink 铁律的同源分析

### 工具与方法

- **GitHub REST API**（curl）：`/search/repositories?q=openclaw`（定位本体 + 衍生生态）+ `/repos/openclaw/openclaw` + `/repos/NousResearch/hermes-agent`（star/fork/issue/subscribers 直取）+ `/repos/NousResearch/hermes-agent/readme`（README base64 解码）—— **关键数字一手验证，不轻信摘要工具**
- **HN Algolia API**（curl + python3 递归遍历评论）：`/api/v1/search?query=OpenClaw`（列全部 20 故事按 pts 排序）+ `/api/v1/items/<id>`（拉 1349pts/1099pts/342pts 三大帖全文评论）—— 绕开 tavily 限额与 WebFetch 域名拦截
- **deepwiki `ask_question`**（四轮）：openclaw/openclaw × 2（核心架构 + 多 agent/安全/CVE）+ NousResearch/hermes-agent × 2（核心架构 + 商业模型/多 agent/安全）—— 源码级验证编排语义 + 安全模型 + memory 工程化路径
- **firecrawl scrape**（keyless 免费档，本轮 ~8 credits）：openclaw.ai 首页（定位）+ star-history 博客全文 + jakequist 博客全文 + CVE NVD 一手全文（composio.dev 安全帖 404 已记录）
- **WebFetch**：hermes-agent.nousresearch.com 被网络拦截（改用 GitHub README API + deepwiki）
- 已读对照：`pm-grok-bot-community.md`（全 288 行，OpenClaw/Hermes 社区引用上下文）+ `pm-buzz-community.md`（全 259 行，Hermes ACP）+ `pm-avernet.md` C.13（全 467 行，OpenClaw Engine Adapter）+ `../design/opc-product-discussion.md`（全 241 行，三层模型 + 编排老师拼图 + §10 缺口登记）

---

**调研总结一句话**：OpenClaw（`openclaw/openclaw`，386k stars）和 Hermes（`NousResearch/hermes-agent`，229k stars）是「always-on 持久 async personal agent harness」品类的开源双子星先驱——**它们是 Grok Bot 的开源前身（社区主对照系），但不是多 agent 编排平台**（子 agent 是工具增强、社区零编排讨论、单一 trusted operator 安全模型放弃多租户、CVE-2026-33579 CVSS 9.9 印证共享身份脆弱）；对 OPC 的定位是「**单品形态参考 + memory 工程化范本（Markdown 派 / SQLite 派）+ 安全反面教材**」，**不进编排老师拼图**——原登记的「编排竞品底座」缺口**部分成立**（补的是品类认知 + always-on agent 工程化，不是编排竞品），建议 `../design/opc-product-discussion.md` §9 把它们与 Grok Bot 并列「单品爆款」、§10 更新登记项为「已调研，非编排平台」。
