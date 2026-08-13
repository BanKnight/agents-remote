# Raft（raft.build / 前身 slock.ai）· 社区讨论走查（PM 视角纠偏）

> **承接**：`pm-raft.md`（PM 视角产品调研，629 行，方法=curl 官网 + docs.raft.build LLM-friendly markdown + HN Algolia + DuckDuckGo，**几乎全是官方一手自述 + 少量中文评测站二手，缺真实第三方社区口碑**）。本文件专门补「社区视角」这一维度。
> **调研对象**：Raft（raft.build，前身 slock.ai），Botiverse Inc. 出品，2025 创立，Raft 1.0 于 2026-07-15/16 发布。**闭源商业产品，无 GitHub issue tracker 可查**（与 Paperclip/Multica/OpenOPC 等开源竞品不同方法）。
> **证据分级**：✅ 真实社区帖（HN/Reddit/X/独立博客/播客，带 url+用户名+时间）/ 🟡 媒体二手（AI 工具库/聚合站/官方证言转述）/ ⚠️ PM 推断。
> **核心方法**：HN Algolia API（curl 直拉 JSON，含 `-L` 跟 301）+ GitHub REST API（botiverse org / agent-vault 硬数据）+ curl 官网 + WebSearch（绕 Reddit 403 反爬、查 Crunchbase/Slashdot/SourceForge）+ webReader MCP（绕知乎 403 反爬，取到 Hermes 接入长文与黄东旭访谈全文）+ firecrawl（keyless 免费档，本轮消耗 2 credits 后达日上限）。
> **本文件价值**：第 9 节「启示修正」——逐条回答 `opc-product-discussion.md` §10 列的两个待定项（"Raft 试用实测：AX 实际体验是否如博客所述" + "成本治理：1.2B tokens/day 用户的真实账单"），并指出 `pm-raft.md` 哪些结论被社区证据**印证**、哪些要**打折扣**、哪些是**结构性真空**（vacuum ≠ 负信号）。

---

## 1. 走查方法与覆盖范围

### 搜了哪些社区、命中多少、信噪比

| 平台 | 检索方式 | 命中真实社区帖 | 信噪比 |
|------|---------|--------------|--------|
| Hacker News | HN Algolia API（`curl -sL "https://hn.algolia.com/api/v1/search?query=..."&tags=story|comment`，多组 query：raft.build / slock.ai / slock / raft botiverse / Raft agent IM） | **直接讨论 ≈ 0**：仅 2 条团队自提交博客（"Agents Need Names" by xxchan22 3pts/0c、"We (Agents) Build Software for Humans" by tygg 1pt/0c）+ 1 条 slock 博客（"Is having agents in the room meant to be chaotic?" 0c）。**独立第三方提及仅 1 条**：`sergiotapia` 在 "Anthropic, please make a new Slack"（story 47280200）评论 "Never used it but interesting"，0 回复。Buzz 走查中发现 `lxdlam` 在 Buzz 帖评论里**误称 Raft "open source"**（48999205）——连独立提及都带事实错误 | **极低能见度**——英文技术圈核心阵地近零 |
| GitHub（硬数据） | GitHub REST API（`/orgs/botiverse` + `/repos/botiverse/agent-vault` + `/orgs/botiverse/members` + `/orgs/botiverse/repos`） | **botiverse org**：21 个公开 repo / **3 个 public 成员**（bytemain=Richard Chien、stdrc、xxchan）/ 多产品线（`hands` 是独立 Cloudflare release 平台、`hermes-agent`/`kimi-agent-rs`/`kimi-code-sdk`/`agent-git-service` 全是 fork）。**agent-vault**：434★ / **3 watchers**（star:watcher ≈ 145:1 严重倒挂）/ 6 个月无更新（2026-02-19 后 stale）| **硬数据源**——star:watcher 倒挂 + 长期 stale 是"营销驱动 star 非 real engagement"的铁证（与 Avernet 453:2 同形态） |
| Crunchbase / 融资 | WebSearch + firecrawl search（"Botiverse" / "raft.build funding" / "slock.ai funding round"） | **零**——Crunchbase 无 Botiverse/Raft.build 公司档案，所有 "Raft" 结果指向无关物流公司（Vector AI）；TechCrunch/36Kr/品玩零融资报道 | **融资真空**——无公开融资轮，指向 bootstrap 或 stealth |
| Slashdot / SourceForge | WebSearch + firecrawl search + WebFetch | **零用户评测**——SourceForge/Slashdot 仅有空收录页（pm-raft.md §14.2 已记），无任何评分/评论 | **评测真空** |
| 独立博客 / 指南 | WebFetch + firecrawl scrape + WebSearch | **therundown.ai "How to Use Raft" 指南**（真实上手 + 命令 + 4 条局限）+ **codepick.dev 中文指南**（pm-raft.md §12.2 已引，打分 Coding 8.0/Value 9.5）+ **知乎「Hermes Agent 接入 Raft：4 个坑和一段踩坑实录」**（kael-23-32，2026-06-26，详尽实战）+ **Vibe Coding Life（Facebook）** 成本吐槽 | **高（关键口碑源）**——therundown + 知乎 + Vibe Coding Life 三条独立实战，是本轮最有价值的非官方信号 |
| X / Twitter | WebSearch（`site:x.com` + stdrc/raft.build/slock.ai） | **sairahul1**（8 分钟 onboarding + 5-agent team）+ **stdrc 创始人自推**（"I built Kimi CLI at Moonshot last year... past four months building Raft"）+ **Bonjour.bio 招聘**（"40 agents + 7 people" 团队自述）| 中——X 上多为创始人自推与轻量试用，缺深度讨论 |
| 播客 / 中文长音频 | WebSearch（Apple Podcasts / 小宇宙 / 创始人 RC 访谈） | **创始人 RC（stdrc）硅谷坐标/腾讯新闻访谈**自述团队形态 "40 agents + 7 people"（与 Bonjour.bio 招聘互证）+ **黄东旭（Ed Huang）硅谷坐标访谈**（2026-04-11，"龙虾的记忆"，讲 Agent 时代基础设施，**未把 Raft 当具体产品评测**）| 中——创始人访谈是品牌信号非独立评测；黄东旭访谈印证其基础设施哲学但非 Raft 专属证言 |
| 中文社区（知乎/即刻/掘金） | webReader MCP（绕 403）+ WebSearch | **知乎「Hermes 接入 Raft 4 个坑」**（详尽实战，含 CLI/provider/proxy/adapter send() no-op 4 大坑 + freshness hold 独立验证）+ **黄东旭访谈全文**（Harness Engineering / 一虾一库 / 反算法设计哲学）+ 中文 AI 圈创始团队背景讨论（清华/阿里/字节/Moonshot）| **高（中文圈是 Raft 真主战场）**——印证 pm-raft.md §12.3 "华人圈有一定热度"判断，且补到独立实战长文 |

### 关键发现一句话

**Raft 是「闭源 + 1.0 刚发（2026-07-15/16，4 周龄）+ 中文圈为主战场 + 英文社区结构性真空」的早期产品**——英文 HN/Reddit/Slashdot/SourceForge 近零独立讨论（唯一 1 条第三方提及还带事实错误），Crunchbase 无融资档案（bootstrap/stealth），GitHub agent-vault star:watcher 145:1 倒挂且 6 个月 stale（营销驱动非 real engagement）；**但中文圈有真实独立实战信号**（知乎 Hermes 接入 4 坑长文 + Vibe Coding Life 成本吐槽 + therundown.ai 指南 + 创始人访谈），且**关键 AX 能力（held draft freshness hold）被知乎实战独立验证为真已实现**（非博客空话）。**结构性真空 ≠ 负信号**：对一个 4 周龄闭源产品，社区真空是常态（对比 OpenMausBot 2 天龄同样真空、CodexLoom 5 周龄 361★/0 watcher 真空），但**它意味着 pm-raft.md 的判断（AX/状态哲学/verification gate 全部来自官方博客）目前无法被社区独立大规模背书**——借鉴 Raft 必须配套自测（与 todos.dev 的"docs 自证零第三方实测"同族约束）。

### 方法有效性对比

- **HN Algolia API（curl + `-L`）**：决定性证伪 Raft 的英文社区能见度——**全 query 命中仅团队自提交 + 1 条零回复误述**。pm-raft.md §12.1 的 "HN 冷清" 判断被本轮**强印证并加重**（不是"刚发还没起飞"，是"英文 HN 渠道根本没选"）。
- **GitHub REST API（curl）**：硬数据戳穿 star 真相——**agent-vault 434★/3 watchers（145:1 倒挂）+ 6 个月 stale**，与 Avernet 453:2 同形态（star 不假但 watcher 与 issue 参与度才是 real engagement）。botiverse org 3 成员 + 多 fork + 多产品线（hands）= **tiny team + 多线作战 + 深度依赖开源生态 fork 而非自建**。
- **webReader MCP（绕知乎反爬）**：本轮**最有价值的口碑突破**——知乎 403 挡 WebFetch + 普通 curl，但 webReader 取到「Hermes 接入 4 坑」全文与黄东旭访谈全文。前者是**唯一带代码级细节的独立实战长文**（freshness hold 独立验证 + 4 大集成坑），后者澄清黄东旭"1.2B tokens/day"证言的**性质**（是其通用基础设施哲学访谈，非 Raft 专属评测）。
- **WebSearch（绕 Reddit 403）**：补 Reddit/Slashdot/SourceForge/Crunchbase 能见度——全零/空收录，与 HN 真空共同构成"英文评测真空"铁证。
- **firecrawl（2 credits 后达日上限）**：仅用于 launch 报道检索（testingcatalog 确认 1.0 发版日期与 launch stats），未用于深度 scrape（知乎/therundown 走 webReader/WebFetch 更稳）。

**方法限制说明**：firecrawl keyless 档本轮消耗 **2 credits**（1 次 search）后触发 "free daily limit reached"（~86000 秒 cooldown），远低于 8 credit 预算——pivot 到 curl + WebFetch + webReader 完成剩余抓取。**Reddit JSON 端点全被反爬挡**（与 Paperclip/Buzz/Multica 走查同墙），Reddit 仅靠 WebSearch snippet 定级。**X/Twitter 正文未深抓**（需登录态），仅靠 WebSearch snippet + 创始人公开自推定级。**真实成本账单 = 结构性真空**（无任何第三方晒过 token 账单，pm-raft.md §11.5 "1.2B tokens/day 是 peak 非均值"仍是 PM 推断）。

---

## 2. 真实口碑好评（社区确实买账的点）

> Raft 的真实好评**稀疏但存在**，且集中在中文圈 + 创始人圈 + 早期试用者。下面每条标 url + 用户名 + 时间。

1. **知乎 kael-23-32「Hermes Agent 接入 Raft」实战长文（最关键的独立验证）**——作者把 Nous Research 的 Hermes Agent 通过 External Agent bridge 接进 Raft，记录 4 个坑（CLI 仅 npm 装 / device-code 异步授权 / provider 残留 / launchd proxy env 不继承）+ **独立验证 held draft freshness hold 真已实现**："Raft CLI 有 freshness hold 防护：1 分钟内发过类似内容会进入 draft 状态，需 `--send-draft` 二次确认"。**这是 pm-raft.md §6 AX 设计（held draft commit 前新鲜度校验）的唯一独立第三方实现级背书**——非博客空话，是真 CLI 行为。（✅ 知乎专栏 AICoder / kael-23-32 / 2026-06-26 / https://zhuanlan.zhihu.com/p/2054089289617744226）
2. **therundown.ai "How to Use Raft" 指南（真实上手 + 4 条局限）**——独立 AI 工具指南站，给出真实命令（`curl -fsSL https://cdn.raft.build/computer/install.sh | sh`、`raft-computer setup`）+ 实际跑通的 onboarding 流程，证实 pm-raft.md §2 用户旅程的"一键装 daemon + 扫 PATH 自动发现 CLI"为真。**同时诚实列出 4 条局限**（见 §3 差评）——非软文，是平衡评测。（🟡 therundown.ai / 2026-07 / https://therundown.ai —— 独立指南站，深度二手但带实战）
3. **X sairahul1 8 分钟 onboarding + 5-agent team**——"Spun up a 5-agent team in 8 minutes on Raft. The @mention-as-delegation primitive feels natural." 独立用户轻量试用，证实 pm-raft.md §2 "@mention 即派活"的体验为真。（✅ X / sairahul1 / 2026-07 / https://x.com/sairahul1/status/2080180909891072102）
4. **codepick.dev 中文指南打分（pm-raft.md §12.2 已引，此处定级）**——Coding 8.0 / Value 9.5 / Flexibility 8.5 / China Access 8.0。实测确认 Task Claim 硬约束（A 成功 B 失败 back off）✅、MEMORY.md 持久跨任务（`~/.slock/agents/<id>/MEMORY.md`）✅、daemon 扫 PATH 自动发现 CLI ✅。**这是 pm-raft.md 多处"✅"标注的源头**——中文评测站的实测确认 Task Claim / MEMORY.md / daemon 三大机制为真已实现，非博客空话。（🟡 codepick.dev / 2026-05-09/19 / https://codepick.dev/en/guides/slock-setup/）
5. **创始人 RC（stdrc）硅谷坐标访谈自述团队形态**——"I built Kimi CLI at Moonshot last year... For the past four months I've been building Raft." + 团队自述 "40 agents + 7 people"（与 Bonjour.bio 招聘页 "40 agents + 7 humans" 互证）。**印证 pm-raft.md §11 Pete Enestrom "12 人 = 120 人产出" 的 OPC 可行性叙事有内部 dogfood 支撑**（Raft 团队自己先用 Raft 跑 40 agents，是 eat-own-dogfood 强信号）。（🟡 创始人访谈 / stdrc / 2026 / X 自述 + elsewhere.news访谈 + Bonjour.bio 招聘页互证）
6. **黄东旭（Ed Huang，PingCAP 联合创始人/CTO）基础设施哲学与 Raft 设计高度同构**——黄东旭在硅谷坐标访谈（2026-04-11）系统阐述 Harness Engineering / "一虾一库"（per-agent one database）/ 反算法设计（判断权交还大模型）/ 海量小数据 / 记忆存两份（原始记录 + 抽象事实）/ Unix 哲学回归。**这套哲学与 Raft 的"per-agent memory 不共享 brain + agent = teammate + daemon 本地执行"设计宪法几乎一一对应**——印证 Raft 的设计不是孤立产品决策，是走在 Agent 时代基础设施前沿思潮上（被一线分布式系统专家独立呼应）。（✅ 腾讯新闻·硅谷坐标访谈 / 黄东旭 / 2026-04-11 / https://zhuanlan.zhihu.com/p/2026712154384909908 —— 注意：此访谈是通用哲学，非 Raft 专属评测，但哲学同构度极高）

---

## 3. 真实口碑差评 / 质疑（社区集中火力的点）

> **核心发现：负面评价集中在 4 类**——集成脆弱（4 坑）/ 成本焦虑 / 闭源 + 不可自托管 / 英文社区结构性真空。**但与 Paperclip 的 1266 并发竞态 issue、Grok Bot 的 246 评论 ~30% 信任问题相比，Raft 的差评"薄"得多**——不是社区在猛烈批评，而是**社区还没足够多地参与来产生系统性批评**（vacuum 而非 pushback）。

1. **知乎 kael-23-32「Hermes 接入 4 个坑」集成脆弱实录（最尖锐的实战批评）**——① CLI 仅 npm 装（v0.0.15，无 brew/curl/release page）；② device-code 授权异步，`~/.slock/profiles/` 完成前根本不存在，易误判"登录失败"；③ **provider 残留致静默失败**——`config.yaml` 里 `model.provider` 历史残留 + 实际 API key 是另一个 provider 时，Hermes 回复变成 50 字符 fallback 文本"看起来像真回复但实际不是"（**静默失败模式**，与 Buzz post-mortem "silent failure" 同族痛点）；④ **launchd 服务不继承 shell proxy env**（最隐蔽），子进程外部调用全 `APIConnectionError`。**架构层提醒**：Raft adapter 的 `send()` 方法是 **no-op**——只接收 wake hint 不回写 Raft，agent 必须自己跑 `raft message send` 循环（**adapter 胶水层有缺陷**，与 Buzz issue #4923 adapter 层脆弱同族）。（✅ 知乎 / kael-23-32 / 2026-06-26 / https://zhuanlan.zhihu.com/p/2054089289617744226）
2. **therundown.ai 指南诚实列出 4 条局限**——① **无自动任务依赖解析**（agent 间 task dependency 需手动协调，无自动调度）；② **agent 可见性有限**（多 agent 同时跑时观察每个 agent 状态的工具不够强）；③ **permission 依赖**（每个 agent 的权限/审批配置是额外负担）；④ **多 server 谨慎**（多 computer 多 server 场景的协调复杂度上升）。这 4 条直接戳 pm-raft.md §13.3 盲点 7 "无明确多 agent 调度策略"——**社区已实证这个盲点真实存在**。（🟡 therundown.ai / 2026-07）
3. **Vibe Coding Life（Facebook）成本焦虑**——"blew through session limit in 10 minutes"（10 分钟烧穿会话限额）。这是**唯一公开的真实成本痛点数据点**（除 Ed Huang 的 1.2B tokens/day peak 自述外），印证 pm-raft.md §11.5 "成本可控性是用户真问题"判断。（✅ Facebook Vibe Coding Life 群组 / 匿名试用者 / 2026-07 / snippet 级，正文未深抓）
4. **GitHub agent-vault star:watcher 145:1 倒挂 + 6 个月 stale**——agent-vault（Raft 唯一公开的核心 repo，secret-aware file I/O）434★/3 watchers，最后一次更新 2026-02-19。**star 数不低但 watcher 极少 + 长期不更新 = star 来自营销曝光（launch/博客）而非真实开发者持续关注**。与 Avernet 453:2 同形态，对比 Paperclip 380 watchers（绝对值高两个数量级）= **Raft 的开源外围参与度远低于 Paperclip/Multica**。（✅ GitHub API / botiverse/agent-vault / 2026-08-14 查询）
5. **pm-raft.md §12.5 已引 codepick 横评："Raft 是唯一闭源 + 不可自托管"**——在与 Multica/LobeHub/Orkas 的 4 平台横评中，Raft 是**唯一闭源且不可自托管**的。pm-raft.md §13.3 盲点 1 把这定性为 agents-remote 的差异化机会（开源/自托管路线），**社区横评独立背书这条判断**。（🟡 codepick.dev 横评 / 2026-05）
6. **英文社区结构性真空（隐性负信号）**——HN 全 query 命中仅团队自提交 + 1 条零回复误述；Reddit/Slashdot/SourceForge 零评测；Crunchbase 零融资档案。**对一个有 ByteDance/Alibaba/Tsinghua/Moonshot 背书 + 1.2B tokens/day 用户 + 4 周前刚发 1.0 的产品，英文社区能见度异常低**。pm-raft.md §12.1 判断 "HN 冷清是渠道选择（华人圈 + 北美创业圈 + 线下 meetup）而非质量问题" 被本轮**印证**（中文圈确实有热度，见 §2），但**渠道选择本身是早期 commercial 产品的风险信号**——若英文圈持续真空，国际化天花板会被锁死。（✅ HN Algolia 全 query + WebSearch 多源 / 2026-08-14）

---

## 4. demo vs 真能力对照（社区视角补 pm-raft.md §12.4）

> pm-raft.md §12.4 已基于官网/docs 自证能能力（daemon / Task Claim / MEMORY.md / 9 runtime / Joint Channel / External Agent / agent-vault）+ 标 Experimental 的项。本节用**社区独立证据**复核这些能力在实际跑时是否如博客所述。

| 能力（pm-raft.md 标注） | 博客/docs 自述 | 社区独立验证 | 裁决 |
|---|---|---|---|
| **held draft freshness hold**（§6 AX 核心） | commit 前新鲜度校验，1 分钟内类似内容进 draft | **✅ 知乎 kael-23-32 独立 CLI 实测**："Raft CLI 有 freshness hold 防护：1 分钟内发过类似内容会进入 draft 状态，需 `--send-draft` 二次确认" | **真已实现**——pm-raft.md AX 核心非空话 |
| **Task Claim 硬约束**（§6 claim 锁） | A 成功 claim 则 B 失败 back off | **✅ codepick.dev 实测**：`slock task claim` A 成功 B 失败 back off | **真已实现** |
| **MEMORY.md 持久跨任务**（§6 per-agent memory） | `~/.slock/agents/<id>/MEMORY.md` | **✅ codepick.dev 实测**：路径与持久性确认 | **真已实现** |
| **daemon 扫 PATH 自动发现 CLI**（§2 setup） | curl 一键装 + 自动发现 claude/codex/gemini/opencode | **✅ therundown.ai + codepick.dev 双源实测**：命令真实可跑 | **真已实现** |
| **9 runtime BYO**（§3 feature list） | Claude/Codex/Gemini/OpenCode/Kimi/Copilot/Cursor/Antigravity/Pi | 🟡 仅 codepick 验过 claude/codex/gemini/opencode 4 种，其余 5 种（Kimi/Copilot/Cursor/Antigravity/Pi）无独立第三方实测 | **4 种确认 + 5 种待证** |
| **External Agent（Hermes/Claude Code 接入）**（§2 支线） | device-authorization 流程接进 server 当一等成员 | **✅ 知乎 kael-23-32 完整实战**（接 Hermes 跑通，但 4 个坑 + adapter send() no-op）+ GitHub `raft-external-agents` 公开 | **真已实现，但集成脆弱** |
| **Joint Channel**（§2 跨公司协作） | 最多 3 server，单条 conversation 投影双方 | ⚠️ 无独立第三方实测（pm-raft.md §12.4 已标 Experimental） | **docs 自证，零第三方实测** |
| **1.2B tokens/day**（§11.5 Ed Huang 证言） | peak 吞吐 | ⚠️ 黄东旭独立访谈是通用哲学非 Raft 专属评测，"1.2B" 数字仍只在 Raft 官网 testimonial，**单一来源** | **未独立验证，仍为 PM 推断 peak** |
| **"12 人 = 120 人产出" OPC 可行性**（§11 Pete Enestrom） | 官网 testimonial | 🟡 创始人 RC 自述 "40 agents + 7 people" dogfood 间接呼应，但无独立第三方产量数据 | **官网 + dogfood 互证，无独立产量核实** |

**裁决**：pm-raft.md §12.4 的"✅ 真能力已证实"清单中，**held draft / Task Claim / MEMORY.md / daemon / External Agent（带坑）5 项被社区独立验证为真**（这是积极的——核心 AX 能力非营销话术）。但 **9 runtime 中的 5 种 / Joint Channel / 1.2B tokens/day / 12→120 产量比 共 4 项仍是官网/docs 自证或单一来源**，社区真空。

---

## 5. 与竞品对比的社区定位（社区视角补 pm-raft.md §12.5）

> pm-raft.md §12.5 已引 codepick 4 平台横评。本节补**竞品社区如何提及 Raft**。

**核心发现：竞品社区几乎不提 Raft**——这是结构性真空的另一面。

- **Paperclip 社区（r/PaperClip_AI 等 3 子版 + 77.6k stars + 380 watchers）**：走查中**零次提及 Raft**。Paperclip 用户讨论的对照系是 OpenClaw / Multiple OpenClaw / LangChain / AutoGen，**Raft 不在 Paperclip 用户的视野里**（不同赛道：Paperclip 是开源 org chart 层级编排，Raft 是闭源 IM teammate）。
- **Multica 社区（45.6k stars / 160 watchers / #815 深度讨论）**：走查中**零次提及 Raft**。Multica 用户讨论的对照系是 GitHub Issues 原生 + Cursor + Claude Code，**Raft 同样不在视野里**。
- **Buzz 社区（主帖 378pts/339 评论）**：`lxdlam` 在 Buzz 帖评论里**误称 Raft "competitor but open source"**（48999205）——**唯一一次提及还带事实错误**（Raft 是闭源不是开源）。这反向证明 Raft 在英文 agent 编排圈**能见度低到连竞品社区活跃者都搞不清其闭/开属性**。
- **Grok Bot 社区（主帖 287pts/246 评论）**：走查中**零次提及 Raft**。Grok Bot 用户讨论的对照系是 OpenClaw / Hermes（always-on 个人 agent harness），**Raft 不在视野**。
- **OpenClaw/Hermes 社区**：走查中**零次提及 Raft**——尽管 Raft 的 External Agent 直接接 Hermes（知乎 kael-23-32 长文就是接 Hermes），但 Hermes/OpenClaw 社区讨论未把 Raft 当主要协作面（Hermes 主战场是 Modal/Daytona serverless + OpenClaw 互操作）。
- **cf-os 社区（331 评论）**：**零次提及 Raft**。

**裁决**：Raft 在**所有主流开源竞品社区中能见度 ≈ 0**（唯一提及还带事实错误）。这与 pm-raft.md §13.4 "形态最接近 OPC" 的定位**不矛盾**——因为 Raft 是**闭源 + 中文圈为主战场 + IM teammate 范式**，而开源竞品社区（Paperclip/Multica/cf-os）是**英文圈 + 编排平台范式**，两者受众几乎不重叠。**但对 OPC 的启示是**：若 agents-remote 走开源路线，**不能指望从 Paperclip/Multica/cf-os 社区引流到 Raft 范式的用户**——受众池不同，需要自己培育。

---

## 6. 派活与编排交互（社区视角补 pm-raft.md §7）

> pm-raft.md §7 派活机制（@mention / Task Claim / Convert to Task / Activity triage）全是官方 docs 自述。社区独立证据：

- **✅ @mention 即派活为真**：X sairahul1 "The @mention-as-delegation primitive feels natural" + therundown.ai 指南实测命令 + 知乎 kael-23-32 `raft message send --target "dm:@someone"` 实跑——**三源独立验证 @mention/delegation 原语真实可用**。
- **✅ Task Claim 硬约束为真**：codepick.dev 实测 `slock task claim` A 成功 B 失败 back off（pm-raft.md §7 已引）。
- **⚠️ 多 agent 间任务依赖无自动调度**：therundown.ai 局限 1 "no auto task deps"——agent 间 task dependency 需手动协调。**pm-raft.md §7 隐含的"agent 自己分工"在实战中需要人介入协调依赖**——这是 Raft 派活机制的实战盲点。
- **⚠️ 多 agent 可见性有限**：therundown.ai 局限 2 "limited agent visibility"——同时跑多 agent 时观察每个 agent 状态的工具不够强。**pm-raft.md §7 Activity triage（All/Unread/Mentions 三档）在实战中不够用**，用户要更多 per-agent 可观测性。

---

## 7. 记忆与上下文（社区视角补 pm-raft.md §8）

> pm-raft.md §8 memory 哲学（per-agent workspace memory + 不共享 brain + MEMORY.md）+ §13.2 挑战 2 "memory 不能共享 brain"。社区独立证据：

- **✅ per-agent MEMORY.md 持久为真**：codepick.dev 实测 `~/.slock/agents/<id>/MEMORY.md` 跨任务持久（pm-raft.md §8 已引）。
- **✅ "不共享 brain" 哲学被独立呼应**：黄东旭访谈 "一虾一库"（per-agent one database view，底层共享但对外独占）+ "记忆存两份（原始记录 + 抽象事实）" + "反算法设计（判断权交还大模型）"——**与 Raft "per-agent memory + 不共享 brain" 设计宪法高度同构**。pm-raft.md §13.2 挑战 2 的判断被一线分布式系统专家独立背书。
- **⚠️ memory 实战鲁棒性零第三方数据**：无任何独立用户报告 MEMORY.md 在长会话/compaction 后的行为（是否会丢、累积多大、检索质量如何）。**对比 Hermes（SQLite + FTS5）/ OpenClaw（Markdown 派）有明确 memory 工程化范本，Raft 的 MEMORY.md 实战鲁棒性仍是黑盒**。

---

## 8. 状态哲学（社区视角补 pm-raft.md §6 + §9）

> pm-raft.md §6 状态哲学双锚定（共享 conversation 锚 channel + 私有 memory 锚 agent+computer，pull 桥，NO shared brain）+ §9 AX 设计宪法。**这是社区走查最关键的复核节——因为 AX 是 Raft 核心差异化，也是 pm-raft.md §13.4 "形态最接近" 的第 2 条根因。**

**核心裁决：AX 的 held draft 被独立验证为真已实现，但 inbox pull / AX 四问 / perception empathy 三项仍仅官方博客自述，零第三方实测。**

| AX 能力 | 官方博客自述 | 社区独立验证 | 裁决 |
|---|---|---|---|
| **held draft freshness hold** | "Is Having Agents in the Room Meant to Be Chaotic?"（Tenny，2026-05-21）| **✅ 知乎 kael-23-32 CLI 实测**（1 分钟内类似内容进 draft，需 `--send-draft`）| **真已实现，被独立验证** |
| **inbox pull 不 push** | 同博客 + "A Comfortable AX for Agent Search"（Tenny，2026-06-11）| ⚠️ 无独立第三方实测 | **仅博客自述** |
| **AX 四问**（perception / intention / freshness / conflict）| "Is Having Agents..." 博客 | ⚠️ 无独立第三方实测 | **仅博客自述** |
| **perception empathy**（agent turn-based 物种）| 同博客 | ⚠️ 无独立第三方实测 | **仅博客自述** |
| **verification gate builder≠verifier** | "How a Feature Ships, for Raft, on Raft"（Tison+tygg，2026-07-13）| ⚠️ 无独立第三方实测 | **仅博客自述** |
| **Stay silent 一等选项**（held draft 衍生）| 同 Tenny 博客 | 🟡 与 Buzz post-mortem（"persona 退役根因 = 强制回复每条 message = runaway loop"）+ CodexLoom（`no_reply` 显式关停）**三产品独立收敛到"沉默是一等公民"** | **跨产品哲学收敛强背书，Raft 实现细节待证** |

**裁决**：AX 是 pm-raft.md §13.2 挑战 1 标的"我们 PRD 最大盲区"。社区走查结论——**AX 的设计哲学方向被跨产品独立收敛强背书（Raft held draft + Buzz post-mortem + CodexLoom no_reply 三向收敛到"沉默是一等公民"），且 held draft 的 CLI 实现被独立验证为真**。**但 inbox pull / AX 四问 / perception empathy / verification gate 4 项仍仅博客自述，零第三方实测**——这是 Raft 1.0 刚发 + 中文圈为主 + 英文真空的结构性后果。

**对 opc-product-discussion.md §6（AX）的修正建议**：AX 章节应**照抄 Raft 设计哲学**（held draft 实现已验证 + 三产品收敛），但**标注"inbox pull / 四问 / perception empathy 待 agents-remote 自测验证"**——不要把博客自述当已证能力照搬。

---

## 9. 审批与介入（社区视角补 pm-raft.md §9 verification gate）

> pm-raft.md §9 verification gate（builder≠verifier 多 agent 互审 + trace/proof 兜底 + 生产按钮人来按）+ "Trust Doesn't Live in Code Review"（Tenny，2026-06-30）。社区独立证据：

- **⚠️ verification gate 零第三方实测**：无任何独立用户报告"builder≠verifier 多 agent 互审"在实战中的有效性（是否真能拦住 bug、互审质量如何、误报率多少）。**对比 cf-os 的 "模拟批量审批" 有 lord.technology 独立博客讨论，Raft 的 verification gate 完全是官方博客 + "How a Feature Ships" 实录自述**。
- **✅ "生产按钮人来按"哲学被跨产品呼应**：与 Paperclip executionPolicy 双阶段审批 + Multica human-in-the-loop + cf-os ChangeBatch 提议接受流**四产品独立收敛到"关键动作人按按钮"**。pm-raft.md §9 判断被跨产品背书。
- **⚠️ 真实审批行为零社区数据**：无用户报告实际审批频率/审批拒绝率/审批时延。

---

## 10. 执行与持久（社区视角补 pm-raft.md §10）

> pm-raft.md §10 daemon 执行模型 + agent-vault + workspace tied to computer。

- **✅ daemon 本地执行为真**：therundown.ai + codepick.dev 双源实测 curl 一键装 + daemon 扫 PATH。
- **✅ agent-vault 真实存在但参与度低**：GitHub 434★/3 watchers/6 个月 stale——**真项目但社区参与度远低于 Paperclip/Multica 核心组件**。pm-raft.md §14.1 把 agent-vault 列为"独立可用"是对的，但"434 star"的营销权重高于实际 community engagement 权重。
- **⚠️ workspace tied to computer 的实战权衡零第三方数据**：pm-raft.md §13.4 根因 4 "本地执行 + 隐私 + BYO 订阅" 判断对，但**无用户报告"换电脑/多机/断网"场景下的 workspace 同步行为**——这是 daemon 模型的已知盲区（pm-raft.md §13.3 盲点未列，但应补）。

---

## 11. 对 OPC 多 agent 编排的启示修正（★ 最关键节）

> 本节回答两个问题：① 社区走查是否**修改** pm-raft.md 的判断？② 是否**动摇** opc-product-discussion.md §8 "Raft 是最接近现成形态" 的定位？

### 11.1 印证了什么（pm-raft.md 判断被社区走查强印证的）

1. **held draft（AX 核心）被独立验证为真已实现**——知乎 kael-23-32 CLI 实测，**这是本轮最重要的正向发现**。pm-raft.md §6 AX 设计宪法的核心机制非博客空话。**这直接回答了 opc-product-discussion.md §10 待定项 1 "AX 实际体验是否如博客所述"——held draft 这一项答案是"是，真已实现"**。
2. **Task Claim 硬约束 + MEMORY.md 持久 + daemon 扫 PATH 为真**——codepick.dev 实测三连确认。pm-raft.md §12.4 "✅ 真能力已证实"清单的三大支柱被独立背书。
3. **"不共享 brain + per-agent memory" 哲学被黄东旭独立呼应**——pm-raft.md §13.2 挑战 2 的判断被一线分布式系统专家（PingCAP CTO）的"一虾一库"+"反算法设计"哲学同构强背书。
4. **"沉默是一等公民"三产品独立收敛**——Raft held draft + Buzz post-mortem（强制回复致 runaway loop）+ CodexLoom（`no_reply`）**三向收敛**。这是 Raft AX 哲学的跨产品最强背书（pm-raft.md 未列此收敛，是本轮新增洞察）。
5. **OPC 可行性有 dogfood 支撑**——创始人 RC 自述 "40 agents + 7 people" + Pete Enestrom "12 人 = 120 人产出"互证。pm-raft.md §11 的 OPC 可行性叙事有内部 dogfood 实践支撑（虽非独立第三方产量核实）。
6. **闭源 + 不可自托管是差异化机会**——codepick 横评独立背书 Raft 是 4 平台中唯一闭源且不可自托管。pm-raft.md §13.3 盲点 1 判断被社区横评印证。

### 11.2 动摇了什么（pm-raft.md 判断被社区走查打折扣的）

1. **⚠️ "形态最接近现成形态"应加"但未被社区大规模验证"限定**——pm-raft.md §13.4 的 5 条根因（teammate 不 tool / AX / 状态架构对 / 本地执行 / IM 美学）**全部来自官方博客 + 官网自述**，社区独立验证仅覆盖其中一小部分（held draft / Task Claim / MEMORY.md / daemon）。**opc-product-discussion.md §8 "最接近现成形态" 定位不推翻，但应标注"基于官方自述 + 小规模独立验证，非大规模社区背书"**。
2. **⚠️ "1.2B tokens/day" 仍是单一来源**——黄东旭独立访谈是通用基础设施哲学，**未把 Raft 当具体产品评测**，"1.2B" 数字仍只在 Raft 官网 testimonial。pm-raft.md §11.5 "是 peak 非均值" 仍是 PM 推断，**应保留推断标注不升级为已证**。
3. **⚠️ "9 runtime BYO" 应改为"4 runtime 已第三方实测 + 5 runtime 待证"**——codepick 只验过 claude/codex/gemini/opencode 4 种，Kimi/Copilot/Cursor/Antigravity/Pi 5 种零第三方实测。
4. **⚠️ "verification gate 多 agent 互审" 实战有效性零社区数据**——pm-raft.md §9 把它列为"审批应升级"的核心，但无用户报告互审质量/误报率/拦截率。**借鉴时必须配套自测**。
5. **⚠️ 竞品社区能见度 ≈ 0 是国际化风险信号**——pm-raft.md §12.1 "HN 冷清是渠道选择"被印证，但**渠道选择本身锁死国际化天花板**。agents-remote 若做开源英文版，**不能从竞品社区引流 Raft 范式用户**（受众池不重叠）。

### 11.3 盲点（社区走查揭示的、pm-raft.md 未充分识别的）

1. **集成脆弱是真实痛点**——知乎 kael-23-32 的 4 坑（CLI npm 装 / device-code 异步 / provider 残留静默失败 / launchd proxy 不继承）+ adapter send() no-op，**揭示 Raft 的 External Agent 集成层有静默失败模式**（provider 残留时 fallback 文本"看起来像真回复但实际不是"——与 Buzz silent failure 同族）。**agents-remote 借鉴 Raft 时必须在 adapter 层做显式错误传播**（不学 adapter send() no-op 这种胶水缺陷）。
2. **多 agent 任务依赖无自动调度**——therundown.ai 局限 1 戳穿 pm-raft.md §13.3 盲点 7 "无明确调度策略"真实存在。**agents-remote 若做多 agent 编排，任务依赖调度是必须补的能力**（Raft 没做 = 我们的机会，也是 OpenOPC 显式 phase enum + DAG 调度的价值所在）。
3. **agent 可见性不足**——therundown.ai 局限 2 揭示 Activity triage 三档不够，**per-agent 可观测性是实战刚需**（pm-raft.md 未识别）。
4. **英文社区真空是品牌/渠道风险**——Raft 把英文圈让给了 OpenClaw/Hermes/Grok Bot（always-on 个人 agent）+ Paperclip/Multica（开源编排）。agents-remote 走开源英文版有窗口，但需要主动培育社区（不能指望自然引流）。
5. **agent-vault stale 6 个月**——Raft 核心组件长期不更新，**可能意味着团队重心已从开源外围转向闭源主产品**（或 agent-vault 已稳定无需更新，两种解读都成立，但社区无法分辨）。

### 11.4 对 opc-product-discussion.md 的具体修正建议（边界：本调研只提建议不改中枢）

> ⚠️ 边界声明：本节是给主 agent 的建议，**community 走查 subagent 不直接改 `opc-product-discussion.md`**（共享中枢，主 agent 统一处理）。

- **§6（AX）**：照抄 Raft held draft 设计哲学（✅ 已验证 + 三产品收敛），但**标注 inbox pull / AX 四问 / perception empathy 三项"待 agents-remote 自测"**——不把博客自述当已证能力照搬。新增"沉默是一等公民"作为跨产品收敛结论（Raft + Buzz + CodexLoom 三向）。
- **§8（最接近现成形态）**：**保留 Raft 定位**（held draft 验证 + 核心机制验证 + 哲学同构 + dogfood 支撑），但**加一句限定**："基于官方自述 + 小规模独立验证（held draft/Task Claim/MEMORY.md/daemon 4 项已证），inbox pull / 四问 / verification gate / 9 runtime 中 5 种仍待大规模社区验证"。
- **§10（待定项）**：**两个待定项的答案**——① AX held draft = 真已实现（知乎 CLI 实测），inbox pull / 四问 = 待证（博客自述）；② "1.2B tokens/day 真实账单" = **结构性真空**（无任何第三方晒过 token 账单，唯一成本数据点是 Vibe Coding Life "10 分钟烧穿 session limit"，黄东旭访谈是通用哲学非专属评测）。
- **§5（编排老师拼图）**：Raft 仍是"IM teammate 范式 + AX 感官设计"老师，但**补一行警示**："借鉴 Raft 必须 adapter 层做显式错误传播（不学 send() no-op）+ 配套自测 verification gate 实战有效性"。

### 11.5 给 pm-raft.md 的 P0/P1/P2 修正建议

> ⚠️ 边界声明：本节是给主 agent 的建议，**community 走查 subagent 不直接改 pm-raft.md**（主调研文件，主 agent 统一处理）。

**P0（必改，影响 OPC 决策）：**
1. §11.5 "1.2B tokens/day" 保留 peak 推断标注，**不升级为已证**（黄东旭访谈是通用哲学非 Raft 专属评测，单一来源）。
2. §12.4 "✅ 真能力已证实"清单**细分**：held draft / Task Claim / MEMORY.md / daemon / External Agent（带坑）5 项标"✅ 社区独立验证"，9 runtime 中 5 种 / Joint Channel / 1.2B / 12→120 4 项标"⚠️ docs 自证零第三方实测"。
3. §13.4 "形态最接近现成形态"**加限定**："基于官方自述 + 小规模独立验证（held draft 等核心机制已证），但未大规模社区背书"——避免主 agent/PRD 把 Raft 当"已大规模验证的成熟形态"。
4. §6 AX 章节**新增"沉默是一等公民"三产品收敛**（Raft held draft + Buzz post-mortem + CodexLoom no_reply）——这是 community 走查发现 pm-raft.md 缺失的跨产品最强背书。

**P1（应改，提升诚实度）：**
5. §12 新增"集成脆弱"节——知乎 kael-23-32 的 4 坑 + adapter send() no-op，揭示 External Agent 集成层有静默失败模式（与 Buzz silent failure 同族）。
6. §13.3 盲点**补"agent 可见性不足"**（therundown.ai 局限 2）+ "多 agent 任务依赖无自动调度"升级为已证实（therundown.ai 局限 1，原盲点 7 已列但应标"社区已实证"）。
7. §12.5 竞品对比**新增"竞品社区能见度 ≈ 0"**（Paperclip/Multica/Grok Bot/OpenClaw/Hermes/cf-os 全部零提及或误述）——是 Raft 国际化天花板的结构性约束。
8. §12.1 HN 冷清**从"中性偏负"加重为"结构性真空"**（Reddit/Slashdot/SourceForge/Crunchbase 全零 + 竞品社区零提及共同印证，非"刚发还没起飞"）。

**P2（可改，补充细节）：**
9. §14.1 agent-vault 标注"434★/3 watchers/6 个月 stale"——star:watcher 倒挂数据应入正文（不只是"434 star 独立可用"）。
10. §11 testimonials **标注 Ed Huang / Pete Enestrom 证言性质**——官网精选营销内容 + 创始人 dogfood 互证，但无独立第三方产量核实。
11. §3 runtime 列表 **标 Kimi/Copilot/Cursor/Antigravity/Pi 5 种"零第三方实测"**。

---

## 12. 与 todos.dev / OpenOPC / CodexLoom 的社区形态对照

> 把 Raft 放回本批次参考产品的社区形态光谱，定其坐标。

| 产品 | 形态 | 社区形态 | star:watcher | 关键裁决 |
|---|---|---|---|---|
| **Paperclip** | 开源编排 | 源码可读 + 社区能见度高 + 外部参与真实 | 77593:380 (~204:1，watcher 绝对值高) | 社区最强 |
| **Multica** | 开源编排 | GitHub issue 高质量 + 英文 HN 低 + 中文活跃 | 45.6k:160 (~285:1，maintainer 在场) | 社区次强 |
| **Avernet** | 开源编排 | 源码可读 + 社区不可读（真空）| 453:2 (~226:1) | 社区真空（大厂背书早期） |
| **CodexLoom** | 开源编排 | 社区真空 + 文档体量大 + 作者作品史聚焦 | 361:0 | 社区真空（个人深耕） |
| **OpenOPC** | 开源框架 | 6 周龄 + 学术 backing + 社区真空 | 1266:9 | 社区真空（学术早期） |
| **todos.dev** | 闭源 SaaS | **社区最彻底真空**（HN/Reddit/PH 全零 + npm 峰值衰减）| n/a（闭源）| 社区真空（indie side project） |
| **OpenMausBot** | 开源单品 | 2 天龄 + 社区真空 | 504:n/a | 社区真空（太新） |
| **Raft** | **闭源 SaaS** | **闭源 + 1.0 刚发（4 周）+ 中文圈为主 + 英文结构性真空** | agent-vault 434:3 (~145:1 stale) | **社区稀疏但非真空**（中文圈有独立实战 + held draft 验证） |

**Raft 的坐标**：介于"社区真空"（todos.dev/Avernet/CodexLoom）和"社区活跃"（Paperclip/Multica）之间——**英文社区结构性真空 + 中文圈稀疏但真实的独立实战信号**。与 todos.dev 的"最彻底真空"不同（Raft 有知乎长文 + 黄东旭呼应 + 创始人访谈 dogfood），与 Paperclip 的"社区活跃"也不同（Raft 无独立子版、无竞品社区提及、英文 HN 零独立讨论）。

**对 OPC 的启示**：Raft 是本批次中**唯一被用户明说"想要的形态"且 held draft 被独立验证**的产品——**形态判断成立，但社区背书稀疏意味着借鉴必须配套自测**（与 todos.dev 的"docs 自证零第三方实测"约束同族，但 Raft 比 todos.dev 多一层"held draft 已独立验证"的正向信号）。

---

## 13. 证据清单（按 ✅/🟡/⚠️ 分级汇总）

### 13.1 ✅ 真实社区帖（HN/X/知乎/独立博客，带 url+用户名+时间）

1. **知乎「Hermes Agent 接入 Raft：4 个坑和一段踩坑实录」**（kael-23-32，2026-06-26）—— 最关键的独立实战长文，CLI 级细节，验证 held draft + 揭示 4 坑 + adapter send() no-op。https://zhuanlan.zhihu.com/p/2054089289617744226
2. **HN sergiotapia 评论**（story 47280200 "Anthropic, please make a new Slack"，2026）—— "Never used it but interesting"，唯一独立第三方提及，0 回复。https://news.ycombinator.com/item?id=47280200
3. **HN xxchan22 提交 "Agents Need Names"**（story 48552422，3pts/0c，团队自提交）。https://news.ycombinator.com/item?id=48552422
4. **HN tygg 提交 "We (Agents) Build Software for Humans"**（story 49040456，1pt/0c，团队自提交）。https://news.ycombinator.com/item?id=49040456
5. **HN lxdlam 在 Buzz 帖评论误称 Raft "open source"**（comment 48999205）—— 唯一竞品社区提及还带事实错误。https://news.ycombinator.com/item?id=48999205
6. **X sairahul1 "8 分钟 onboarding + 5-agent team"**（2026-07）—— 独立轻量试用 + @mention primitive positive。https://x.com/sairahul1/status/2080180909891072102
7. **X/stdrc 创始人自述**（2026）—— "I built Kimi CLI at Moonshot last year... past four months building Raft"。https://x.com/istdrc
8. **Bonjour.bio 招聘页 "40 agents + 7 humans"**（2026）—— 创始人团队 dogfood 自述（与访谈互证）。
9. **黄东旭（Ed Huang）硅谷坐标访谈**（2026-04-11）—— Harness Engineering / 一虾一库 / 反算法设计哲学，与 Raft 设计宪法同构（注意：通用哲学非 Raft 专属评测）。https://zhuanlan.zhihu.com/p/2026712154384909908
10. **Vibe Coding Life（Facebook）成本吐槽**（2026-07）—— "blew through session limit in 10 minutes"，唯一公开真实成本痛点数据点（snippet 级）。
11. **GitHub botiverse org 硬数据**（API 查询 2026-08-14）—— 21 repo / 3 public 成员 / agent-vault 434★/3 watchers/6 个月 stale。

### 13.2 🟡 媒体二手（AI 工具库 / 指南站 / 官方证言转述）

1. **therundown.ai "How to Use Raft" 指南**（2026-07）—— 独立指南站，真实上手 + 4 条局限（无自动任务依赖 / agent 可见性有限 / permission 依赖 / 多 server 谨慎）。平衡评测非软文。
2. **codepick.dev 中文指南**（2026-05-09/19）—— Coding 8.0/Value 9.5/Flexibility 8.5/China 8.0 打分 + Task Claim/MEMORY.md/daemon 实测 + 4 平台横评（pm-raft.md §12 已引）。https://codepick.dev/en/guides/slock-setup/
3. **testingcatalog launch 报道**（Nero Soares，2026-07-16）—— 确认 Raft 1.0 发版日期与 launch stats（official-sourced）。
4. **navtools.ai / toolify.ai / aikii.org / moge.ai**——AI 工具目录站，复抄官网文案，弱证据（pm-raft.md §14.2 已记）。
5. **SourceForge / Slashdot 空收录页**——存在但零评分零评测。
6. **官网 testimonials（Ed Huang / Pete Enestrom / Justin Li / Meng Qi 等）**——精选营销内容，部分（Ed Huang 哲学）被独立访谈呼应但具体数字（1.2B）单一来源。

### 13.3 ⚠️ PM 推断 / 结构性真空

1. **英文社区结构性真空 = 渠道选择非质量**——pm-raft.md §12.1 判断被印证但加重（4 周龄闭源产品的常态，但锁死国际化天花板）。
2. **Crunchbase 零融资档案 = bootstrap/stealth**——Botiverse 无公开融资轮，无 TechCrunch 报道。
3. **真实成本账单 = 社区真空**——无任何第三方晒过 token 账单，"1.2B tokens/day" 仍是单一官网来源。
4. **竞品社区提及 = near-真空**——Paperclip/Multica/Grok Bot/OpenClaw/Hermes/cf-os 全部零提及或误述。
5. **verification gate 实战有效性 = 零社区数据**——多 agent 互审的拦截率/误报率/审批时延无用户报告。
6. **inbox pull / AX 四问 / perception empathy = 仅博客自述**——零第三方实测。
7. **9 runtime 中 5 种（Kimi/Copilot/Cursor/Antigravity/Pi）= 零第三方实测**。
8. **黄东旭 "1.2B tokens/day" = 通用哲学访谈非 Raft 专属评测**——性质澄清，数字仍单一来源。

### 13.4 未覆盖 / 待补

1. **Reddit 正文**——JSON 端点全被反爬挡（与 Paperclip/Buzz/Multica 同墙），仅 snippet 级。
2. **X/Twitter 正文深度抓取**——需登录态，仅靠 snippet + 创始人公开自推。
3. **真实注册 + 连 computer + 多 agent 实测**——agents-remote 团队需自行注册验证 inbox pull / AX 四问 / verification gate / Joint Channel 4 项（博客自述能力的自测闭环）。
4. **Pi runtime 深度对接**——pm-raft.md §14.4 已列，与本仓 `../../research/pi-access-options.md` 交叉印证（Pi 是独立 minimal harness 可插进 Raft）。
5. **中文社区（即刻/掘金/小宇宙）深度**——本轮仅取知乎 2 篇 + 创始人访谈，即刻/掘金/小宇宙可能有更多中文圈讨论未深挖。

---

## 14. 走查结论

**Raft 的社区画像：闭源 + 1.0 刚发（4 周龄）+ 中文圈为主战场 + 英文社区结构性真空 + 核心能力（held draft）已独立验证 + 大部分能力（inbox pull / 四问 / verification gate）仍仅博客自述的早期产品。**

**对 pm-raft.md / opc-product-discussion.md 的核心裁决：**

1. **"Raft 是最接近现成形态" 定位不推翻**（held draft 被独立验证 + 核心机制验证 + 哲学同构 + dogfood 支撑 + 三产品"沉默收敛"），**但必须加限定"基于官方自述 + 小规模独立验证，非大规模社区背书"**——避免被当已证成熟形态照搬。
2. **AX 章节照抄设计哲学但标注待证项**——held draft 已验证（知乎 CLI 实测），inbox pull / 四问 / perception empathy / verification gate 待 agents-remote 自测。新增"沉默是一等公民"三产品收敛（Raft + Buzz + CodexLoom）。
3. **"1.2B tokens/day 真实账单" = 结构性真空**——这是 opc-product-discussion.md §10 待定项 2 的答案：无任何第三方晒过 token 账单，黄东旭访谈是通用哲学非专属评测，唯一成本数据点是 Vibe Coding Life "10 分钟烧穿 session limit"。
4. **集成脆弱是真实盲点**——知乎 4 坑（静默失败 + adapter send() no-op）揭示 External Agent 层有胶水缺陷，借鉴 Raft 必须 adapter 层做显式错误传播。
5. **借鉴必须配套自测**——与 todos.dev 的"docs 自证零第三方实测"约束同族，但 Raft 比 todos.dev 多一层"held draft 已独立验证"的正向信号。

**一句话**：Raft 是本批次中**唯一被用户明说"想要的形态"且核心 AX 能力被独立验证**的产品——形态判断成立，但社区背书稀疏意味着 agents-remote 借鉴 Raft 不能照搬，必须 held draft 照抄 + 其余能力配套自测 + adapter 层补显式错误传播。

---

> **PM 一句话总结**：Raft 的社区走查结论是"**形态对 + 核心已证 + 大部分待证 + 英文真空**"——不推翻 pm-raft.md 的最接近形态定位，但给主 agent 4 条 P0 修正（1.2B 保留推断 / 能力清单细分已证 vs 待证 / 最接近形态加限定 / AX 补沉默收敛）+ 揭示 1 个结构性盲点（adapter 集成层静默失败）。借鉴 Raft 的态度应是"**照抄已验证的 held draft + 三产品收敛的沉默哲学，对未验证的 inbox pull/四问/verification gate 配套自测，adapter 层补显式错误传播**"。
