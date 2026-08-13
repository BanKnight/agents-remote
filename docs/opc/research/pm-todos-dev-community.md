# Todos.dev · 社区讨论走查（PM 视角纠偏）

> **承接**：`pm-todos-dev.md`（PM 视角产品调研，654 行/178 feature/13 维，方法=curl 一手 docs + HN Algolia + DuckDuckGo + npm registry，**社区节如实记录"声量近零"但承认未深挖**）。本文件专门补「社区视角」这一维度，独立复核主调研的「社区真空」结论。
> **调研对象**：**todos.dev**（域名 todos.dev，SaaS + 本地 CLI `@todos-dev/cli`，**闭源**——GitHub org `todosdev` 0 公开 repo、CLI 闭源）。
> **证据分级**：✅ 真实社区帖/源码直证（HN/GitHub/npm registry/curl 直证，带 url+时间）/ 🟡 二手（AI 工具聚合目录、Threads/X、LinkedIn） / ⚠️ PM 推断。
> **核心方法**：curl 一手直取（npm registry + npm downloads API + HN Algolia + GitHub REST API + todos.dev 官网/changelog + DuckDuckGo HTML）+ WebSearch（中英社区 + Reddit/PH/YouTube/X，绕 Reddit .json 403 反爬）+ firecrawl（3 credits，**中途达 keyless 免费档每日上限**，后续转 curl+WebSearch 补齐）。
> **本文件价值**：第 9 节「启示修正」——逐条验证 `pm-todos-dev.md` §12 的「社区真空」结论（复核后**强成立**），并补主调研没捕捉的硬数据：(a) **npm 下载量呈「上线峰值→断崖衰减」趋势**（2026-07-04 峰值 770/天 → 2026-08 月多日 <100/天），(b) **maintainer 身份锁定**（Zen / @supezen / 中文 vibe coder，32K X followers，已有产品 ChainFM+Dokobot），(c) todos.dev 是 maintainer 第三个项目但**未列入其个人主页产品栏**（= 最新、未站稳的作品），(d) 唯一一条独立第三方**真实使用成本数据**（Zen 自推 X：单 task $9.6），(e) 第三方目录收录比主调研判断更弱（Toolify/TAAFT/NavTools **均无确认 listing**，主调研说"被索引但无评测"过于乐观）。

## 1. 走查方法与覆盖范围

### 搜了哪些社区、命中多少、信噪比

| 平台 | 检索方式 | 命中真实社区内容 | 信噪比 |
|------|---------|----------------|--------|
| **npm registry + downloads API**（本次最有价值硬数据源） | `curl https://registry.npmjs.org/@todos-dev/cli` + `api.npmjs.org/downloads/...` 直取 | **48 版本**（0.1.0=2026-06-30 → latest 0.1.47=**2026-08-13 今日**）/ maintainer `zencooking <gempod@chain.fm>` / 全版本日均下载明细：**首发日 120 → 2026-07-04 峰值 770 → 2026-07-09~17 高位 490-616/天 → 2026-07-18 后断崖降至 15-298/天 → 2026-08-05 后多日 25-89/天**（37 个非零日，累计 8332 下载） / 周下载 493、月下载 4738 / 版本平均间隔 **1.6 天**（极度活跃） | **极高**——一手直证，下载量趋势是"上线峰值后衰减"的硬数据，戳穿主调研"npm 周下载 493 小但真实用户基数"的乐观解读 |
| Hacker News | HN Algolia API（curl -L，精确 8 组 query） | **0 命中**：`todos.dev` nbHits=0｜`todosdev` nbHits=70 全噪音（TodoMVC/ToDoDeck/Todashev 同音干扰，无 todos.dev 本体）｜`chain.fm`（maintainer 另一产品）nbHits=0｜`dokobot` nbHits=356 全噪音（Dokobots 游戏/DoorBot/Ring 同名，非 maintainer 产品）｜`tds cli`/`todos agent team`/`chief agent plan build review`/`zencooking`/`zen cooking crypto ai indie` 全 0 真实命中（chief query 唯一命中是无关的"Show HN: Circus Chief"） | **极高**——多组 query 全扫，确认 HN 英文技术圈**零认知** |
| GitHub REST API | `/orgs/todosdev` + `/users/zencooking` + repos/members/events/gists/starred/followers | **org `todosdev`**：2026-06-02 创建、**0 公开 repo、0 followers、is_verified=false、无 description**｜**user `zencooking`**（npm maintainer 同名）：1 follower、1 public repo（`zencooking/zencooking.github.io`="Personal page for zen.cooking"，2026-04-04 创建，0 star）｜org public_members 空、events 空｜**user starred 仅 2 repo**（plate 富文本编辑器 + wealthfolio 本地财务）→ 品味信号 | **极高**——org 零公开 repo + maintainer 1 follower 是社区真空的硬证据 |
| Reddit | WebSearch（`site:reddit.com`）+ DuckDuckGo（`site:reddit.com`）+ .json 直拉（**403 反爬挡**） | **0 命中** todos.dev 本体：DDG site:reddit.com 返回全是无关 todo app 讨论；WebSearch 明确报告 "No direct matches... there may not be substantial Reddit threads on that exact topic"；.json 端点 HTTP 403（与 pm-buzz/paperclip 同款反爬） | **高（负证据）**——多渠道印证 Reddit 零讨论 |
| Product Hunt | WebSearch + DuckDuckGo | **0 命中** todos.dev launch page；WebSearch 明确报告 "did not return any direct results specifically about a todos.dev Product Hunt launch" | **高（负证据）**——复核主调研「PH 全零」结论成立 |
| X / Twitter（@supezen 维护者自推） | WebSearch + DuckDuckGo（中文） | **maintainer @supezen 是 X 中文 vibe coder（32K followers）**，主页 bio "分享用AI的个人体验 / The agent team that gets things done todos.dev / making @dokobot / 一线vibe coder / Listen to the Chain"——多条 X 帖自推 todos.dev（2076655883824816446 / 2076249419905986577 / 2076304033632153622 / 2080549912136343643 / 2080585100073566646 单 task **$9.6** / 2076542217381171301 / 2074725705376821322），**单帖 views ~144**（极低） | **极高**——锁死 maintainer 身份，且 32K followers 不转化为 todos.dev 采用（views 144）是关键信号 |
| Threads / LinkedIn | WebSearch | **5 条全是 AI 工具聚合号机械复述同一句**："Todos.dev spins up a Chief AI agent that breaks it into tasks, assigns each to a specialist agent, cross-reviews the output, then waits for your sign-off"——Threads `@everydev.ai`（Db4W6stGj3H + Db1ydw9GBfI）/ Threads `@suritech`（DWEmrIDmp-M）/ Threads `@build.with.anton`（DRN0gqAiNUU）/ LinkedIn `johnbucksa`（OpenAI dev forum 回音）/ **EveryDev.ai X @EveryDevAi 推文 2086619293387723018**（主调研说的"2 条 Threads"实为 6 条跨平台，但全是同一聚合机器人的同一文案） | **中**——聚合目录非评测，零独立使用经验 |
| 独立 AI 工具目录 | WebSearch（Toolify/TAAFT/NavTools）+ DuckDuckGo + curl 直拉 | **`myaiexp.com` AI Nexus 有一篇 todos.dev listing**（agent-infra 类目，详细功能描述，但**定价过时 $29/月 + 说"邀请真人成员"——2026-08-09 changelog 已移除 invite-member**）｜**`everydev.ai` 有 tools/todos-dev + developers/todos-dev 两页**（AI 生成口吻，同样过时定价"up to 5 people"）｜**Toolify（CF 403 challenge wall 挡）/ TAAFT（curl 直拉只见首页无 listing）/ NavTools 无确认 listing**——WebSearch 明确 "No verifiable listing for todos.dev was found on any of the three directories" | **中**——主调研说"被目录索引"过于乐观，实际确认 listing 仅 myaiexp + everydev 两家（且都过时），三大主流目录 Toolify/TAAFT/NavTools 无确认收录 |
| YouTube | WebSearch（精确 site + 内容搜） | **0 命中**：WebSearch 明确报告 "no YouTube reviews or walkthroughs indexed yet"，返回全是无关的西班牙语 Figma 教程 | **高（负证据）**——零视频评测 |
| 中文社区（V2EX/掘金/即刻/知乎） | WebSearch（中英 + 站点限制）+ DuckDuckGo | **0 命中 todos.dev 独立评测**：WebSearch 明确报告 "以官方文档和英文介绍为主，未找到较为深入的中文第三方评测或体验长文"；DDG 中文搜仅命中官方 todos.dev + 无关的"Claude Code Todos→Tasks 升级"文章 + Zen 自己 X 帖（pi+deepseek 推荐，**非讨论 todos.dev**）+ 掘金"AI Todos"是另一无关项目 | **高（负证据）**——即便 maintainer 是中文 vibe coder 且 X 有 32K followers，**中文社区也无独立讨论** |
| todos.dev 官网 / changelog | curl 直拉全文 | **官网首页**（Next.js + VitePress docs，Cloudflare Managed Content 部署）/ **docs 26+ 篇**（sitemap 37 URL）/ **changelog 2026-08-12 条目确认**：每日滚动、含 "updated across all four locales"（中英 + 其他 2 种 i18n）、"two real-user stories"（indie game dev + DL researcher）、Chief 时区感知/set_wake/cut turns/abnormal stop reasons/sandbox retry——文档极详尽 | **极高**——一手对照 |
| maintainer 个人页 `zencooking.github.io` | curl 直拉全文 | **"Zen — Indie Maker. Right tech. Minimal product. Real needs."** Products 栏只列 **ChainFM + Dokobot** 两个产品——**todos.dev 未列入**（= 最新未站稳的作品）｜Links: GitHub + X (@supezen) | **极高**——锁死 maintainer 身份与 todos.dev 在其作品谱系的位置 |

### 方法有效性裁决

- **curl 一手直取是本次决定性方法**：npm downloads API 给出下载量趋势（戳穿"小但真实用户基数"乐观解读），HN Algolia（精确 8 组 query 全扫）确认英文圈零认知，GitHub REST API 确认 org 0 公开 repo + maintainer 1 follower——**这三个一手数据源共同锁死"社区真空"结论**，不需要任何二手源。
- **WebSearch 是绕 Reddit 403 反爬的有效替代**：site:reddit.com 查询返回全是无关 todo app 讨论（= todos.dev 本体零命中），且明确给出 "no substantial Reddit threads" 裁决，比 pm-buzz/paperclip 那种 .json 全挡后只能猜更可靠。
- **firecrawl 中途达 keyless 免费档每日上限**（用 3 credits 后报 "free daily limit reached, try again in ~13h"）——pm-buzz/paperclip 走查用的同一档位。本次转 curl+WebSearch 补齐未受影响，结论不依赖 firecrawl。
- **方法限制说明**：Reddit .json 全 403（已知限制）；Toolify/TAAFT CF 反爬挡（curl 直拉只见首页/无 listing，WebSearch 明确报告无收录）；@supezen X 帖正文需登录未取（但 WebSearch 已抓到 bio + 多条推文摘要 + 单帖 views 144）；中文社区（即刻/掘金）WebSearch 0 命中但 DDG 中文 query 也未见有效结果，结论"中文圈也无独立评测"双源印证。

### 关键发现一句话

**复核后主调研「社区真空」结论强成立——todos.dev 是「英文圈零认知（HN 8 组 query 全 0）+ 中文圈零独立评测（WebSearch/DDG 双源 0）+ 第三方内容全是聚合机器人机械复述同一句 + GitHub org 0 公开 repo 0 follower + maintainer 仅 1 follower」的"全栈社区真空"，唯一活跃信号是 npm 47→48 版本（今日仍发版，周更节奏）+ maintainer @supezen 在 X 自推（32K followers 但单帖 views 仅 144，不转化为采用）。最关键的纠偏是主调研把"npm 周下载 493"当"小但真实用户基数"过于乐观——一手下载量明细显示呈「上线峰值（2026-07-04 峰值 770/天）→断崖衰减（2026-08 月多日 <100/天）」趋势，更像发布会热度退潮而非稳定用户群。maintainer 身份锁定为中文 vibe coder Zen（已有产品 ChainFM 10K followers + Dokobot，但 todos.dev 未列入其个人主页产品栏）= 第三个未站稳的 side project。**

## 2. 真实口碑（好评 / 差评，每条标来源）

### 好评（社区确实买账的点）

⚠️ **诚实前置**：本次走查**未找到任何独立第三方试用 todos.dev 的报告**（无独立博客评测、无 Reddit 讨论、无 HN 评论、无 YouTube walkthrough、无中文独立长文）。下列"好评"全部来自**官方 changelog 自述 + maintainer @supezen 自推 X + AI 工具聚合目录复述**，**无任何独立使用经验背书**。

1. **官方 changelog 自述"两个真实用户故事"（indie game dev + DL researcher）**——2026-08-12 changelog "Use cases — two real-user stories: The five fictional customer stories were replaced with two first-person accounts drawn from real user sessions"——这是官方声称有真实用户的最强信号，但**未公开用户身份/可验证账号**，无法核实。（✅ todos.dev/docs/changelog / 2026-08-12 官方自述 / ⚠️ 不可独立核实）
2. **maintainer @supezen 自推 X 多帖亲述使用体验**——如 "1. I publish a task in one sentence → 2. The Chief (总管) selects the appropriate Agent A to execute" / "Agents appear in the roster next to your team, each with presence and workload. Assign planning, implementation, and review to [different models]" / "Todos's Agents have a built-in AskUser tool — they clarify unclear points with the user instead of guessing"——这是 maintainer 自己 dogfooding 第一手，但属自推非第三方。（✅ x.com/supezen/status/2080549912136343643 / @supezen / 2026-07~08）
3. **AI 工具聚合目录（myaiexp.com / everydev.ai）给的功能描述正面**——myaiexp "extremely lightweight and restrained design that pairs well with DeepSeek's prefix-cache pricing" + "Two-stage plan/build with independent review built into every todo"——但这是 AI 生成口吻复述官网文案，**非评测**，且定价字段过时（见差评 4）。（🟡 myaiexp.com/en/items/agent-infra/todos + everydev.ai/tools/todos-dev / 2026 / AI 聚合目录）

### 差评 / 质疑（社区集中火力的点）

⚠️ **诚实前置**：与 pm-buzz（HN 339 评论 + 3 独立博客 + 9 issue 复现）/ pm-multica（GitHub #815 16react 深度分析）不同，**todos.dev 没有任何社区差评或质疑**——因为根本没人讨论它。下列"差评"全部是本次走查**基于硬数据的 PM 推断**，非社区帖。

1. **npm 下载量呈「上线峰值→断崖衰减」趋势**——一手 npm downloads API 日明细：2026-06-30 首发 120 → 2026-07-04 峰值 770 → 2026-07-09~17 高位 490-616/天（可能是发布会/推广窗口的真实安装）→ **2026-07-18 起骤降至 76/15/30/26** → 2026-07-29~31 小回升（159→298→419）→ 2026-08 月多日 **25-89/天**（5/6/8/9 日 = 56/26/25/73）→ 累计 8332 下载（37 个非零日）。⚠️ PM 推断：这是典型的"产品上线推广窗 → 热度退潮"曲线，**不像稳定用户群**——稳定用户群日均下载应该平稳（如 Multica/Symmetry 这种即便小也有稳定基线）。主调研把"周下载 493/月下载 4738"当"小但真实用户基数"过于乐观。（✅ api.npmjs.org/downloads/range/last-year/@todos-dev/cli / 一手 / ⚠️ 趋势解读为 PM 推断）
2. **maintainer @supezen 32K X followers 但单帖 views 仅 ~144**——一手 WebSearch 抓 @supezen 多条 todos.dev 自推帖，单帖最高 views ~144（如 status 2076655883824816446 "144 views"）。⚠️ PM 推断：maintainer 在中文 AI 圈有 32K followers 真实影响力（Chain.fm 也有 10K followers），但**这部分影响力几乎没转化成 todos.dev 的实际关注/安装**——32K followers × 多帖 × 144 views = 转化率 <1%。这与 npm 下载衰减曲线互证：推广窗口（7月初）有波峰，退潮后无人持续关注。（✅ x.com/supezen 多帖 / WebSearch 抓取 / ⚠️ 转化率推断）
3. **第三方目录信息全部过时（定价 + invite-member）**——myaiexp.com listing 写 **Pro $29/月 + "up to 3 people" + "invite human members by email"**，everydev.ai listing 写 **"up to five people"**——但 todos.dev 官方 changelog 2026-08-07 "Pro plan stabilized & quota increase"（Pro 转正、$19/月）+ 2026-08-09 **主动移除 invite-member 按钮 + 弃用 human-members 计费行**（官方定位"刻意 solo + agents"）。⚠️ PM 推断：第三方目录信息**比官方落后 2-4 周**，反映 todos.dev **没有任何第三方在做持续跟踪**——一个真有人关注的产品，第三方目录会跟进定价/功能变化；todos.dev 的目录 listing 全停在旧版定价且无人更新，是社区关注度极低的又一硬证据。（✅ myaiexp.com/everydev.ai listing vs 官方 changelog / 一手 / ⚠️ 解读为 PM 推断）
4. **GitHub org 零公开 repo + 零 issue tracker = 无社区反馈入口**——org `todosdev` 0 公开 repo、0 public members、0 events——即**社区根本没有地方提 issue / 提 feature / 报 bug**（对比 pm-multica 有 GitHub issue 高质量讨论、pm-buzz 有 2454 open issue 实战 bug）。⚠️ PM 推断：这是闭源 SaaS 的结构性代价——即便有人想反馈，也只能发邮件/in-app，不会留下可被走查的公共社区痕迹，进一步压低了社区可观测度。（✅ api.github.com/orgs/todosdev / 一手 / ⚠️ 结构性推断）
5. **唯一一条独立第三方真实使用成本数据：单 task $9.6（maintainer 自推，非第三方）**——@supezen X status 2080585100073566646 自推："One task cost $9.6 — note that agent teams consume significant tokens"。⚠️ PM 推断：这是目前唯一公开的真实成本数据点（官方 docs 给的是 token 用量 itemize 不给总价），**$9.6/task 配合 $19/team/月 flat 定价**——即用户自带 provider key，跑 2 个 task 就够本月 Pro 月费，tokens 全自付。这对 OPC 是有用信号（todos.dev 模式下成本完全透明、用户直付 provider），但 $9.6/task 的绝对值（一个 task 接近 $10）说明 Plan→Build→Review 全流水线 + Chief 编排的 token 开销不小。（✅ x.com/supezen/status/2080585100073566646 / @supezen 自推 / 2026-07~08 / ⚠️ maintainer 自推非第三方）

### 社区声量小结

todos.dev 的社区形态是**「全栈社区真空」**——比 pm-avernet（英文真空 + 中文媒体通稿）、pm-multica（英文 HN 低声量 + 中文 issue 活跃）更彻底：

- **HN**：8 组精确 query 全 0 真实命中（todos.dev/todosdev/tds cli/zencooking/chain.fm/dokobot/chief agent plan build review/zen cooking crypto ai）。
- **Reddit / Product Hunt / YouTube**：三平台全 0 todos.dev 本体命中（WebSearch + DDG 双源印证）。
- **中文社区（V2EX/掘金/即刻/知乎）**：0 独立评测（即便 maintainer 是中文 vibe coder + 32K X followers）。
- **第三方内容**：全网**仅 6 条 AI 工具聚合号机械复述同一句**（EveryDev.ai X 推文 + myaiexp/everydev listing + Threads ×3 + LinkedIn ×1），无独立使用经验。
- **GitHub**：org 0 公开 repo / 0 follower / 0 issue tracker，无社区反馈入口。
- **npm**：48 版本极度活跃（今日仍发版，周更节奏），但**下载量呈峰值后衰减趋势**，更像推广窗而非稳定用户群。

这与 pm-avernet「开源但社区真空」、pm-buzz「开源首周声量极高」、pm-multica「GitHub issue 内热外冷」**完全不同**——todos.dev 是**闭源 + 零社区入口 + 零第三方讨论 + 仅 maintainer 自推**的最彻底真空形态。**主调研「社区真空」结论强成立**，且应更直白地写为"全栈社区真空，零独立第三方使用经验"。

## 3. demo vs 真能力（官方吹的 vs 社区戳穿的，逐条对照）

| 官网/官方 docs/pm-todos-dev.md 吹的点 | 社区戳穿 / 校准 | 裁决 |
|---|---|---|
| **"The agent team that gets things done"**（官网 hero） | 形态真（maintainer @supezen X 多帖自推印证 Chief 拆活/agent 团队/Plan-Build-Review 真存在），但**零独立第三方实测**——无任何独立博客/Reddit/YouTube/HN 用户印证跑通过。 | **形态真但零第三方背书**——只能信官方 + maintainer 自推 |
| **"700+ models"**（首页 FAQ） | 数字未公开 catalog 验证（pm-todos-dev.md §4.5 已标 ⚠️）；无第三方实测过 provider 覆盖广度。 | **营销文案**——无独立验证 |
| **"Runs on your machines... execution on your hardware, speed and parallelism yours to scale"**（官网 vs cloud coding agents FAQ） | 自带机器路径真（npm CLI 真发版 + maintainer X 帖印证），**但 Pro 平台沙箱（Cloudflare Sandboxes）是 vendor 沙箱**（pm-todos-dev.md §10.2 已指出"代码进 Todos 沙箱"叙事张力）。无第三方实测成本对比（self-serve vs Pro 平台沙箱 awake-hour credit 实际开销）。 | **半真**——自带机器路径真，Pro 平台沙箱 vs 自带机器成本对比无第三方实测 |
| **"Pro $19/team/月 flat, no per-seat no usage"**（pm-todos-dev.md §11.1 一手） | **第三方目录全停在旧价**：myaiexp $29/月 + everydev "up to 5 people"——反映第三方信息落后 2-4 周，**也反映无第三方在跟进**。 | **定价真但零第三方跟进**——第三方目录信息过时是社区关注度低的硬信号 |
| **"Indie dev / small teams"（2 real-user stories: indie game dev + DL researcher）**（2026-08-12 changelog） | 官方 changelog 声称替换了 5 个虚构 customer story 为 2 个真实 first-person 账号——但**用户身份/可验证账号未公开**，无法核实是否真有外部用户。 | **官方自述不可核实**——无独立证据 |
| **"Charter (你写 Chief 不可改) + 三层 memory + bounded curation ≤100 条"**（pm-todos-dev.md §6/§8 强设计） | **设计哲学真且独特**（Raft/Multica/Paperclip 都没显式 charter 层 + bounded cap），但**零第三方实测过 charter 注入行为 / memory ≤100 cap 实际触发频率 / agent 间不互读 memory 的边界**。 | **设计自洽但零实测背书**——只能信 docs |
| **"agent 间不直接对话 = 刻意降维回避 AX"**（pm-todos-dev.md §7.4/§13.2 PM 推断） | 维护者 X 帖未讨论这个设计取舍（无人在社区讨论 todos.dev 任何取舍）；主调研是基于 docs/memory "agents do not read each other's" 的 PM 推断。⚠️ **无社区证据支持也无社区证据反对**——因为根本没人讨论它。 | **PM 推断未受社区检验**——主调研判断方向合理但需标注"无社区背书" |
| **"PWA 完整版 + voice + push + 扫码登录"**（pm-todos-dev.md §4.11/§13.5） | 真能力（官网 install + mobile docs 详尽），maintainer X 帖提"long-running agents can now notify the user via email when complete"印证移动/通知能力在迭代。**但 PWA 实际体验（iOS Safari standalone / Android install / push 到达率）零第三方实测**。 | **能力真但零实测**——只能信 docs |

**demo vs 真能力总统决**：todos.dev **不是 demo 纸糊的**——48 版本 + 今日仍发版 + maintainer @supezen 在 X 自推 + docs 极详尽 + changelog 每日细节，**产品本身真的在跑、真的有人（至少 maintainer 自己）在用**。但**与 pm-buzz（3 个独立博客读源码后评价）/ pm-multica（#815 16react 深度分析）不同，todos.dev 没有任何独立第三方实测背书**——所有真能力判断只能信官方 docs + maintainer 自推，**没有任何社区校准**。这对 pm-todos-dev.md 的影响是：§12.5「真能力已证实」节列的 12 条（tds CLI / 9-phase 状态机 / AI review / 三层 memory / skill / schedule / 双执行路径 / GitHub 集成 / MCP server / remote shell / team secrets / PWA）**全部需要降级标注「docs/maintainer 自证，无第三方实测」**——pm-todos-dev.md 用"✅ 真能力已证实"语气过强，应改为"✅(docs 自证) / ⚠️(零第三方实测)"。

## 4. 实际上手体验（试用者感受与痛点）

⚠️ **诚实前置**：与 pm-buzz（mager.co 完整部署 + 多个 GitHub issue 实战 bug + Matt Shumer 公开报 agent 不回话）/ pm-multica（jefflunt 80 issues 实战 + jmoney8896 B2B fintech 真生产）不同，**todos.dev 没有任何独立第三方上手报告**。

唯一可考的"上手体验"全部来自 **maintainer @supezen 自推 X**（dogfooding 第一手）：

1. **@supezen 多帖自述 todos.dev 工作流**——"1. I publish a task in one sentence → 2. The Chief (总管) selects the appropriate Agent A to execute" / "agent teams complete tasks end-to-end without human involvement from posting to merging" / "偷懒让 chief 帮你组建团队"——这是 maintainer 自己用 todos.dev 干活的 dogfooding，但属自推非第三方实测。（✅ x.com/supezen/status/2080549912136343643 + 2076304033632153622 / @supezen / 2026-07~08）
2. **@supezen 公开真实成本数据**——status 2080585100073566646："One task cost $9.6 — note that agent teams consume significant tokens"——这是 maintainer 自己跑出来的成本，**是 todos.dev 唯一公开的真实成本数据点**（官方 docs 只给 token 用量 itemize 不给总价）。（✅ x.com/supezen/status/2080585100073566646 / @supezen / 2026-07~08）
3. **@supezen 自推迭代功能**——"long-running agents can now notify the user via email when complete" / "Todos's Agents have a built-in AskUser tool" / "Agents appear in the roster next to your team, each with presence and workload"——maintainer 一边迭代一边自推，反映 dogfooding 真实但无第三方交叉验证。（✅ x.com/supezen/status/2074725705376821322 + 2076542217381171301 + 2076655883824816446 / @supezen / 2026-07~08）

**上手体验裁决**：todos.dev **比 pm-buzz / pm-multica 的"上手证据"弱一个数量级**——pm-buzz 有 Matt Shumer（KOL）公开试用 + 多个 GitHub issue 复现，pm-multica 有 jefflunt 80 issues 实战数据，**todos.dev 唯一的"上手者"是 maintainer 自己**。这意味着：
- **不能像 pm-buzz 那样从社区拿到"实战 bug + token 成本实测"**（pm-todos-dev.md §12.5 已诚实写了"试用实测未做"，本次走查印证这一缺口无法从社区补）。
- **Chief 拆活逻辑 / AI review 多轮收敛质量 / 三层 memory 实际注入行为 / bounded curation 触发频率 / Plan-Build-Review 实际体验**——这些 pm-todos-dev.md 标 ⚠️"待实测"的点，**本次走查后仍全部待实测**，因为社区没有可借鉴的第三方试用。

**对 pm-todos-dev.md 的修正**：§14.5「未覆盖/待补」节写的"试用实测：本次未真实注册+连机器+跑多 agent，docs 极详尽降低了实测必要性"——本次走查印证实测必要性**没有被降低**，反而更紧迫，因为**社区零背书意味着只能靠自测验证**。建议把 §14.5 这条改为"实测是验证 todos.dev 真能力的唯一途径（社区零第三方背书）"。

## 5. 与竞品对比的社区定位

⚠️ **社区里几乎无人拿 todos.dev 和任何产品对比**——因为它根本没进社区视野。下列定位全部是 PM 基于 docs + maintainer 自推的推断。

1. **vs Raft（最高频 PM 对照，零社区对照）**——pm-todos-dev.md §13.5 已详尽对照（todos 是 task-driven 无 IM，Raft 是 agent-native IM）。但社区**无人**做这个对比（HN/Reddit/X 全 0 讨论 todos.dev vs Raft）。⚠️ PM 推断：todos.dev 与 Raft 是用户明说要 Raft 形态后 todos.dev 不是首选的根本原因（pm-todos-dev.md §13.4 已正确判断）。
2. **vs Multica（task-driven 同形态，零社区对照）**——pm-multica.md 把 Multica 当"AI-native Linear/Jira"，todos.dev 也是 task-driven workspace，两者形态最接近（都是 task 状态机 + 团队 agent）。但社区**无人**对比二者（Multica 英文 HN 也低声量，todos.dev 更彻底真空）。
3. **vs Paperclip（编排深度对照，零社区对照）**——pm-todos-dev.md §13 把 todos 当"反 Paperclip 的 task-driven 路线"。社区**无人**讨论这个对照。
4. **vs CrewAI / LangGraph（myaiexp 列为 alternatives）**——myaiexp.com 把 todos.dev 的 alternatives 列为 Reasonix / CrewAI / LangGraph——这是 AI 工具目录的自动关联（同一"agent-infra"类目），**非独立评测对比**。（🟡 myaiexp.com / 2026 / AI 聚合目录自动关联）
5. **vs Digitarald vscode-agent-todos / todos.md / AiTodos（命名重合的不同产品）**——DuckDuckGo 搜 todos.dev 命中一堆**同名/近名无关产品**：`digitarald/vscode-agent-todos`（VS Code agent mode TODOs，125 stars，独立产品）/ `todos.md`（"Local-first tasks and plans for agents"，独立产品，域名 todos.md）/ 掘金"AI Todos"（独立 monorepo 项目）/ thaitype/chief（独立 GitHub 框架）。⚠️ 这些**全是命名重合的不同产品**，与 todos.dev 无关——勿混淆。✅（负证据：命名重合干扰大，反衬 todos.dev 本体社区零存在）

**社区定位共识**：todos.dev **没有社区定位**——因为它没进任何社区视野。pm-todos-dev.md §13 把它定位为"task-driven workspace × Chief 编排 × Plan-Build-Review × 双执行路径 × 三层 memory"在**机制层正确**（基于 docs），但**这个定位零社区背书**（无人讨论、无人对比、无人引用）。对 OPC 的启示：todos.dev 的设计借鉴价值（Plan-Build-Review / 三层 memory / Charter / bounded curation / skill）**全部基于 docs 自洽**，**没有任何"用户用了觉得好/不好"的社区信号**可借鉴——这与 pm-buzz（社区压倒性认可身份层）+ pm-multica（#815 戳穿 missing soul）形成鲜明对比。

## 6. "规格→代码 pipeline"形态是否被社区认可

**核心发现：todos.dev 不是"规格→代码 pipeline"——它是一句话目标 → Chief 拆 todo → 专家 agent Plan→Build→Review → merge 的 task-driven workspace（pm-todos-dev.md §1/§7 已正确定位）。**

社区对 todos.dev 形态的认可 = **零**（因为没人讨论它）。maintainer @supezen 在 X 自推的形态描述（"Chief AI agent breaks it into tasks, assigns each to a specialist agent, cross-reviews the output, then waits for your sign-off"）**被 6 条 AI 工具聚合号机械复述**——这是 todos.dev 形态唯一被"传播"的方式，但全部是聚合机器人复述非评测。

社区**未**有人讨论：
- Plan→Build→Review 三阶段流水线的实际工程质量
- Chief 拆活逻辑的实际质量
- 三层 memory + bounded curation 的实际效果
- agent 间不直接对话降维的得失（见 §7）

**对形态的裁决**：todos.dev 的 task-driven 形态在**docs 层自洽且设计深思熟虑**（pm-todos-dev.md §13.1 列的 6 条印证成立），但**零社区背书**——意味着 OPC 若借鉴其 Plan-Build-Review / 三层 memory 设计，**只能基于 docs 自证，无社区实战校准**（pm-buzz 的 persona 退役有 post-mortem 源码背书，pm-multica 的 Squad 有 #3033 修复 commit 背书，todos.dev 的设计借鉴**没有任何实战验证**）。

## 7. 编排能力的社区视角（核心节——验证 pm-todos-dev.md 的"任务状态机/长记忆老师"定位）

这是本走查的核心节——验证 agents-remote 对 todos.dev 编排能力的定位（opc-product-discussion.md §5 把 todos.dev 列在「任务分解+派活」「任务状态机」「长记忆」几行）。

### 7.1 "Plan→Build→Review 三阶段任务状态机老师"——docs 自证，零社区背书

- **9-phase 状态机（To Do/Queued/Planning/Confirm/Building/Review/Done/Failed/Closed）+ 两道硬关卡（Confirm/Review）** 在 docs/todos + docs/conversation + docs/ai-review 详尽自证，maintainer @supezen X 帖"Chief selects Agent A to execute"+"agent teams complete tasks end-to-end"印证其真在跑。✅ **docs 层成立**。
- 但**与 pm-multica（#815 ImGoodBai 逐条引用源码确认 issue 是 unit of work）/ pm-openopc（work_item_transition.py 显式 14 态 enum + 静态转换表）不同，todos.dev 的 9-phase 状态机零社区验证**——无人读过 todos.dev 源码（闭源），无人实测过 phase 转换的可靠性、Confirm/Review gate 的实际触发行为、并发 build slot 的争用。
- **裁决**：todos.dev 作为"任务状态机老师"定位**在 docs 层成立且设计清晰**（pm-todos-dev.md §13.1 印证），但**零社区背书**——OPC 借鉴其 9-phase + 两道关卡设计时，应明确标注"docs 自证，无社区实战校准"。**优先级建议**：在"任务状态机老师"维度，pm-openopc（显式 FSM + attempt ledger 防死循环）+ pm-multica（#815 源码级分析）的社区背书比 todos.dev 强，todos.dev 退居"docs 设计参考"而非"实战验证老师"。

### 7.2 "三层 memory（Charter/Memory/Projects）+ bounded curation 老师定位"——docs 独有强设计，零社区背书

- **Charter（你写 Chief 不可改）+ per-agent Memory（≤100 条 bounded + agent 间不互读）+ Projects&todos（平台持久化）** 是 todos.dev 独有的显式三层架构（pm-todos-dev.md §6 + docs/context 直证）——这是相比 pm-raft（per-agent workspace memory 无 cap）/ pm-multica（无显式 charter 层）/ pm-paperclip（goal ancestry ≤6 现拼）**最工程化的长记忆设计**。
- 但**零第三方实测过**：Charter 实际注入行为 / memory ≤100 cap 实际触发频率 / agent 间不互读 memory 的边界是否真的被遵守 / Chief 重写自己 memory 时是否真的不覆盖 charter——这些 docs 自述的设计**没有任何第三方实测验证**。
- **裁决**：todos.dev 作为"长记忆老师"定位**在 docs 层是最强参考**（Charter 只读防 Chief 覆盖 + bounded curation 是 Raft/Multica 都没做或没做清晰的），但**零社区背书**——OPC 借鉴时应明确标注"docs 自证，无实战校准"，并**优先自测 Charter 注入行为 + memory cap 触发**（这是验证该设计的唯一途径）。

### 7.3 "agent 间不直接对话 = 刻意降维"——PM 推断，零社区讨论

- pm-todos-dev.md §7.4/§13.2 把 todos.dev "agent 间不直接对话、Chief 编排 + AI review 单向 critique 协作"判为**刻意降维回避 AX**（基于 docs/memory "agents do not read each other's"）。
- 本次走查**确认社区零讨论**这个设计取舍——既无好评（"agent 不互相对话避免了 Raft 那种 token 浪费"）也无差评（"失去涌现协作"）。⚠️ PM 推断：因为根本没人讨论 todos.dev 任何取舍。
- **裁决**：这个 PM 推断**未被社区检验**——方向可能对（与 pm-buzz persona 退役 post-mortem 反面印证"agent 间互相对话会触发 runaway loop"），但 todos.dev 自己没有 post-mortem 或社区讨论来佐证"降维是刻意的"还是"未实现的"。OPC 引用时应标注"PM 推断基于 docs，无社区背书"。

### 7.4 "Plan→Build→Review 三阶段 vs Raft IM"——docs 形态正确，零社区讨论

- pm-todos-dev.md §13.2 列为 todos.dev 对 OPC 的核心挑战（"task-driven 协作面也能跑 team-agent，不一定要 IM"）。
- 本次走查**确认社区零讨论** todos.dev vs Raft 的形态取舍。
- **裁决**：pm-todos-dev.md 的判断方向正确（基于 docs + maintainer 自推），但**零社区讨论**意味着这个"挑战"是**纯 PM 推断**，无用户社区在 todos.dev 和 Raft 之间做选择的实际信号。

**编排能力社区视角总裁决**：pm-todos-dev.md 把 todos.dev 当"任务状态机 + 长记忆老师"的定位**在 docs 层全部成立**（9-phase + 两道关卡 + 三层 memory + bounded curation + Charter 只读 + skill 一等公民，docs 自洽且设计深思熟虑），但**全部零社区背书**——这是 todos.dev 与其他参考产品（pm-buzz persona 退役有源码背书 / pm-multica #815 有源码级分析 / pm-paperclip 有 HN 真实成本吐槽）最大的差异。**对 OPC 的启示**：todos.dev 的设计借鉴价值**只能基于 docs 自证**，OPC 借鉴任何 todos.dev 设计（Plan-Build-Review / 三层 memory / Charter / bounded curation / skill / MCP 外接 / schedule）时，**必须配套自测**（社区无法提供实战校准）。

## 8. 背书 / 内部使用可信度（社区信不信）

**关键数据（npm + GitHub + X API 直证，2026-08-13/14 快照）**：

- **npm `@todos-dev/cli`**：48 版本（0.1.0=2026-06-30 → latest 0.1.47=**2026-08-13 今日**）/ maintainer `zencooking <gempod@chain.fm>` / 版本平均间隔 **1.6 天**（极度活跃，周更节奏）/ 周下载 493、月下载 4738、累计 8332（37 个非零日） / **下载量呈「上线峰值→断崖衰减」趋势**（2026-07-04 峰值 770/天 → 2026-08 月多日 <100/天）。
- **GitHub org `todosdev`**：2026-06-02 创建、**0 公开 repo、0 followers、is_verified=false、无 description、public_members 空、events 空**——即闭源 + 无任何社区反馈入口。
- **GitHub user `zencooking`**（npm maintainer 同名）：1 follower（仅 `Levelup-JC`）、1 public repo（`zencooking/zencooking.github.io`="Personal page for zen.cooking"，0 star，2026-04-04 创建）/ starred 仅 2 repo（plate 富文本编辑器 + wealthfolio 本地财务，品味信号 = indie maker 关注 local-first/AI 工具）。
- **maintainer @supezen X**：**32K followers / 574 following**（真实影响力账号），bio "分享用AI的个人体验，仅供参考 / The agent team that gets things done todos.dev / making @dokobot / indie maker / 一线vibe coder / Listen to the Chain"——**中文 AI/crypto 圈已有建树的 indie maker**。
- **maintainer 已有产品**：**ChainFM**（chain.fm，"Listen to the Chain" 加密链上监听工具，~10K X followers）+ **Dokobot**（dokobot.ai，"The browsing tool for AI agents"）+ **todos.dev**（最新作品）。⚠️ **todos.dev 未列入其个人主页 zencooking.github.io 的 Products 栏**（只列 ChainFM + Dokobot）——即 todos.dev 是 maintainer **最新且未站稳的第三个 side project**。

**社区对 todos.dev backing 的信任**：

- **maintainer 是真实有影响力的中文 indie maker**（32K X followers + 已发布 ChainFM/Dokobot 两产品），不是匿名/钓鱼账号——这点比 pm-avernet（蚂蚁 backed 但 maintainer 透明度低）+ pm-codexloom（单作者 yan5xu 中文个人开发者，361 star/0 watcher）**可信度更高**。
- **但 maintainer 影响力没转化成 todos.dev 采用**——32K followers × 多帖自推 × 单帖 views 仅 144 = 转化率 <1%；npm 下载量峰值后衰减也印证推广窗退潮后无持续关注。
- **无 Jack Dorsey 式个人信任分裂**（pm-buzz 那种）——Zen 是 indie maker 非 KOL 式背书，社区对 Zen 个人无负面也无强正面讨论（因为没人在 HN/英文圈讨论 Zen）。
- **无 Block 式公司 backing**（pm-buzz 85 contributors + 107 releases）——todos.dev 是**单人 indie maker side project**（npm maintainer 仅 1 人），公司团队 backing = 0。
- **无 enterprise 采用信号**——零外部 GitHub issue / 零独立博客 / 零 B2B 真生产报告（对比 pm-multica jmoney8896 B2B fintech 真生产）。

**裁决**：**todos.dev backing = 1 个 indie maker 的 side project**——maintainer Zen 真实有影响力（32K X followers）但 todos.dev 是其第三个未站稳的作品（未列入个人主页产品栏）。**产品本身真的在跑**（48 版本 + 今日发版 + maintainer 自推 dogfooding），但**社区采用 = 接近零**（npm 衰减 + 32K followers 不转化 + 0 第三方讨论）。这与 pm-avernet「蚂蚁 backed 但社区真空」、pm-multica「公司 backing + 真实外部社区」、pm-buzz「Block backing + 声量极高」**完全不同**——todos.dev 是**最纯粹的"个人 indie maker side project + 社区真空"形态**。

## 9. 对 agents-remote / OPC 的启示修正（重点）

### 9.1 现有 `pm-todos-dev.md` 被社区证据**印证**的结论

| 现有结论 | 位置 | 社区证据 | 印证强度 |
|---|---|---|---|
| 「社区声量真的近零（HN/Reddit/PH 全零，仅 2 条 Threads 机械复述）」 | §12 全节 / §1 一句话证据 | HN Algolia 8 组 query 全 0 真实命中 + Reddit/PH/YouTube/中文社区 WebSearch+DDG 双源 0 + GitHub org 0 公开 repo 0 follower + maintainer 1 follower | **最强印证**——多源一手直证，结论比主调研更彻底（主调研"2 条 Threads"实为 6 条跨平台但全聚合机器人同一文案） |
| 「产品极度活跃（changelog 每日滚动、npm 周更、6 周内 47 版本）」 | §11.3 / §1 一句话证据 | npm registry 直证 48 版本（今日 2026-08-13 仍发版 0.1.47）/ 版本平均间隔 1.6 天 / changelog 2026-08-12 条目确认每日滚动 | **强印证**——一手直证活跃度（仅版本数 47→48 微调） |
| 「GitHub org `todosdev` 0 公开 repo（闭源私有）」 | §11.3 / §14.1 | GitHub REST API 直证：0 public_repos / 0 followers / public_members 空 / events 空 | **强印证** |
| 「产品方向印证力强（docs 自洽、设计深思熟虑）但无市场验证」 | §12.6 / §13.3 盲点 6 | 社区零第三方讨论印证"无市场验证"；docs 26+ 篇 + 37 URL sitemap + changelog 每日细节印证"docs 自洽" | **强印证** |
| 「Pro $19/team/月 flat（非旧版 $29/月）」 | §11.1 / 关键修正表 | 官方 changelog 2026-08-07 "Pro plan stabilized" + 官方 pricing 页 $19；**第三方目录（myaiexp $29/everydev "up to 5 people"）停在旧价反映信息落后** | **强印证**——且补"第三方信息落后 2-4 周反映无跟进" |
| 「刻意 solo+agents，2026-08-09 移除 invite-member」 | §4.13 / §11.2 | 官方 changelog 2026-08-09 + docs/teams；**第三方目录（myaiexp "invite human members" / everydev "up to 5 people"）仍停在 invite-member 旧描述** | **强印证**——且补"第三方目录未跟进" |
| 「maintainer 大概率有中文背景」 | §12.4 / §14.4 推断 | maintainer @supezen 是中文 vibe coder（X bio 中文 + 32K followers 中文 AI 圈）+ Chain.fm 中文产品 + npm maintainer gempod@chain.fm | **从推断升级为强直证**——锁死 maintainer 中文背景 |

### 9.2 现有 `pm-todos-dev.md` 被**推翻**或需**打折扣**的结论

1. **§11.3 / §12.6 / §1 「npm 周下载 493、月下载 4738 = 小但真实的用户基数」过于乐观**——一手 npm downloads API 日明细显示呈**「上线峰值→断崖衰减」趋势**：2026-07-04 峰值 770/天 → 2026-07-09~17 高位 490-616/天 → 2026-07-18 起骤降 → 2026-08 月多日 25-89/天（累计 8332 / 37 个非零日）。**修正建议**：§11.3 npm 那句改为——"npm `@todos-dev/cli` 48 版本极度活跃（周更节奏，今日仍发版），周下载 493 / 月下载 4738 / 累计 8332——但**一手日明细显示呈'上线峰值（2026-07-04 峰值 770/天）→ 断崖衰减（2026-08 月多日 <100/天）'趋势**，更像产品上线推广窗热度退潮，而非稳定用户群基线（稳定产品即便小也有平稳下载基线）。'小但真实用户基数'的乐观解读不成立——真实情况更可能是'maintainer 自己 + 少量早期试用者，无稳定采用'。"

2. **§12.3 「Toolify/navtools/theresanaiforthat 被 todos.dev 索引（弱信号）」过于乐观**——一手 curl 直拉 + WebSearch 确认：**Toolify（CF 403 challenge wall 挡）/ TAAFT（curl 直拉只见首页无 listing）/ NavTools 三大主流目录均无确认 todos.dev listing**；WebSearch 明确报告 "No verifiable listing for todos.dev was found on any of the three directories"。**修正建议**：§12.3 改为——"三大主流 AI 工具目录（Toolify/TAAFT/NavTools）**均无确认 todos.dev listing**（Toolify CF 反爬挡、TAAFT 直拉只见首页无 listing、NavTools 无收录）；仅 myaiexp.com（AI Nexus，agent-infra 类目）+ everydev.ai 两家小目录有 listing，**且两家 listing 信息全部过时**（myaiexp $29/月 + 邀请真人成员、everydev "up to 5 people"，落后官方 2-4 周）。'被目录索引'的弱信号被进一步打折。"

3. **§12.5 「✅ 真能力已证实」语气过强**——pm-todos-dev.md §12.5 列的 12 条真能力（tds CLI / 9-phase / AI review / 三层 memory / skill / schedule / 双执行路径 / GitHub 集成 / MCP / remote shell / team secrets / PWA）全部基于 docs + npm CLI 真发版，但**零第三方实测**（对比 pm-buzz 3 独立博客读源码、pm-multica #815 源码级分析）。**修正建议**：§12.5 整节降级标注——"以上 12 条真能力均为 **✅(docs/npm 自证，零第三方实测)**——todos.dev 闭源（GitHub org 0 公开 repo）+ 社区零第三方上手报告，意味着所有真能力判断只能信官方 docs + maintainer @supezen X 自推，无社区校准。对比 pm-buzz（3 独立博客 + 9 GitHub issue 实战）/ pm-multica（#815 16react 源码级 + 80 issues 实战），todos.dev 的真能力背书强度最低。"

4. **§14.5 「试用实测：docs 极详尽降低了实测必要性」判断不成立**——本次走查印证实测**更紧迫**而非更可省，因为社区零背书意味着只能靠自测。**修正建议**：§14.5 改为——"试用实测是验证 todos.dev 真能力的**唯一途径**——社区零第三方背书（无独立博客/Reddit/HN/YouTube/中文评测）+ 闭源（无源码可读），所有机制（Chief 拆活逻辑 / AI review 多轮收敛 / 三层 memory 注入行为 / bounded curation 触发 / Plan-Build-Review 实际体验）只能靠自测验证。docs 极详尽降低的是'理解机制'门槛，不是'验证机制'门槛。"

### 9.3 现有调研**没捕捉到**、应新增的社区洞察

1. **maintainer 身份锁定 = 中文 indie maker Zen（@supezen，32K X followers，已有产品 ChainFM+Dokobot），todos.dev 是其第三个未站稳的 side project（未列入个人主页产品栏）**（pm-todos-dev.md §14.4 只推断"创始团队大概率有中文背景"，未锁死身份）——这是判断 todos.dev 是"真实有投入的 indie maker 作品"还是"匿名/钓鱼/玩具"的关键。✅ 一手：GitHub user zencooking 个人页 + X @supezen 32K followers + Chain.fm 10K followers + npm maintainer gempod@chain.fm。**修正建议**：§14.4 推断节 + §11.3 maintainer 节改为——"maintainer 身份锁死为 **Zen（@supezen，GitHub `zencooking`）—— 中文 indie maker / 一线 vibe coder，X 32K followers，已有产品 ChainFM（chain.fm，加密链上监听，~10K X followers）+ Dokobot（dokobot.ai，AI agent 浏览工具）+ todos.dev（最新作品，未列入其个人主页产品栏）**。todos.dev 是其第三个 side project，maintainer 真实有影响力但 todos.dev 未在其作品谱系中站稳。**对 OPC 的启示**：todos.dev 是真实 indie maker 作品非玩具（Zen 有 Chain.fm/Dokobot 交付记录），其设计（Plan-Build-Review/三层 memory/Charter）值得 docs 层深度学习，但'32K followers 不转化为 todos.dev 采用'（单帖 views 144 + npm 下载衰减）印证社区采用接近零——借鉴其设计而非其市场表现。"

2. **npm 下载量「上线峰值→断崖衰减」趋势是判断早期产品社区健康度的关键信号**（pm-todos-dev.md 完全没捕捉日明细趋势，只给周/月聚合数）——日均下载明细（首发 120 → 峰值 770 → 高位 490-616 → 衰减 25-89）戳穿"小但真实用户基数"的乐观解读。**修正建议**：§11.3 npm 节加日明细趋势分析（见 9.2 第 1 条修正建议）。**对 OPC 的启示**：评估早期 agent 产品的社区健康度，**日均下载趋势比周/月聚合数更诚实**——平稳基线 = 稳定用户群，峰值后衰减 = 推广窗热度退潮。OPC 自己的产品上线后也应监控这个趋势。

3. **第三方目录信息过时（myaiexp $29 + 邀请真人 / everydev "up to 5 people"，落后官方 2-4 周）反映"无第三方在跟进 todos.dev"**（pm-todos-dev.md 完全没捕捉这个信号）——一个真有人关注的产品，第三方目录会跟进定价/功能变化；todos.dev 的目录 listing 全停在旧版且无人更新，是社区关注度极低的硬证据。**修正建议**：§12.3 第三方评测节加——"第三方目录（myaiexp/everydev）信息全部过时（定价 $29 vs 官方 $19、'邀请真人' vs 官方已移除 invite-member、'up to 5 people' vs 官方 solo+agents），落后官方 2-4 周——**反映无第三方在做持续跟踪**，是社区关注度极低的又一硬证据。对比 pm-multica（45.6k stars + 反复被 arunbaby/stork 独立评测）的第三方跟进频率，todos.dev 的第三方跟进 = 零。"

4. **maintainer @supezen 唯一公开的真实成本数据点：单 task $9.6**（pm-todos-dev.md §4.12 只说"token usage 按 model itemize"未给真实总价）——@supezen X status 2080585100073566646 自推"One task cost $9.6"。**修正建议**：§4.12 token usage 节 + §11.1 定价节加——"maintainer @supezen X 帖公开的唯一真实成本数据点：**单 task $9.6**（'agent teams consume significant tokens'）——配合 $19/team/月 flat 定价，跑 2 个 task 就够本月 Pro 月费（用户自带 provider key 直付，todos 不 meter/markup）。$9.6/task 绝对值说明 Plan→Build→Review 全流水线 + Chief 编排的 token 开销不小（一个 task 接近 $10）。**对 OPC 的启示**：todos.dev 模式（用户直付 provider + 平台 flat 月费）成本完全透明，但 Plan-Build-Review 三阶段 + AI review 互审 + Chief 编排的 token 开销天然不小——OPC 若走类似流水线，需内置成本上限 + 阶段级 token budget（todos.dev 未做）。"

5. **todos.dev 社区真空形态对比：是「最纯粹的 indie maker side project + 全栈真空」**（pm-todos-dev.md §12.6 只说"社区声量近零"，未对比其他参考产品的社区形态）——比 pm-avernet（蚂蚁 backed + 中文媒体通稿）、pm-multica（公司 backing + GitHub issue 内热）、pm-codexloom（单作者 + 361 star/0 watcher）更彻底真空。**修正建议**：§12.6 社区声量结论节加——"todos.dev 是本批次参考产品中**社区真空最彻底**的形态——pm-avernet 至少有中文媒体通稿、pm-multica 有 GitHub issue 高质量讨论、pm-codexloom 有 361 stars，todos.dev 是 **'闭源（GitHub 0 公开 repo）+ 零社区入口（无 issue tracker）+ 零第三方讨论（HN/Reddit/PH/YouTube/中文社区全 0）+ 仅 maintainer 自推'** 的最纯粹真空。**对 agents-remote 的启示**：评估早期 agent 产品的社区健康度，需多维度交叉（npm 趋势 + GitHub 公开度 + 第三方讨论 + maintainer 影响力转化率）——todos.dev 在所有维度都接近零，但其 docs 设计深度（26+ 篇 + 178 feature）远超社区表现，印证'文档好 ≠ 社区在用'。"

### 9.4 对 `multi-agent-orchestration.md` / `opc-product-discussion.md` 的连带修正建议（**仅提建议，不在本文件改**）

- 若 `opc-product-discussion.md` §5 把 todos.dev 列为「任务状态机/长记忆老师」——**建议加注**："todos.dev 的设计借鉴价值（9-phase + 两道关卡 + 三层 memory + bounded curation + Charter 只读）**全部基于 docs 自证，零社区背书**（社区全栈真空）。在'任务状态机老师'维度，pm-openopc（显式 FSM + attempt ledger 防死循环 + 源码可读）+ pm-multica（#815 源码级分析 + 80 issues 实战）的社区背书比 todos.dev 强；todos.dev 退居'docs 设计参考 + 三层 memory + Charter 只读独有设计'而非'实战验证老师'。借鉴 todos.dev 设计时必须配套自测。"
- 若 `multi-agent-orchestration.md` 引用 todos.dev 当"task-driven 路线代表"——**建议加注**："todos.dev 的 task-driven 形态在 docs 层自洽（178 feature + 26 docs），但社区全栈真空（npm 下载衰减 + 0 第三方讨论 + maintainer 32K X followers 不转化）——其形态价值是'docs 自证可行'而非'社区验证可行'。"

### 9.5 修正优先级（给执行者的清单）

| 优先级 | 文件 | 节 | 改什么 |
|---|---|---|---|
| P0 | pm-todos-dev.md | §11.3 npm + §12.6 / §1 一句话证据 | "npm 周下载 493/月 4738 = 小但真实用户基数"改为"npm 48 版本极度活跃（今日 2026-08-13 仍发版，周更节奏），但日明细呈'上线峰值（2026-07-04 峰值 770/天）→ 断崖衰减（2026-08 月多日 <100/天）'趋势，更像推广窗热度退潮而非稳定用户群" |
| P0 | pm-todos-dev.md | §12.3 第三方评测 | "Toolify/navtools/theresanaiforthat 被索引（弱信号）"改为"三大主流目录（Toolify/TAAFT/NavTools）均无确认 listing（Toolify CF 挡/TAAFT 只见首页/NavTools 无收录）；仅 myaiexp+everydev 两小目录有 listing 且信息全过时（落后官方 2-4 周，反映无第三方跟进）" |
| P0 | pm-todos-dev.md | §14.4 推断 + §11.3 maintainer | "maintainer 大概率有中文背景"升级为锁死身份——"maintainer = Zen（@supezen，中文 indie maker / 一线 vibe coder，X 32K followers，已有产品 ChainFM 10K followers + Dokobot + todos.dev 第三个未站稳的 side project，未列入个人主页产品栏）" |
| P0 | pm-todos-dev.md | §12.5 真能力 | 整节 12 条真能力降级标注"✅(docs/npm 自证，零第三方实测)"——todos.dev 闭源 + 社区零第三方上手报告，所有真能力判断只能信官方 docs + maintainer 自推 |
| P0 | pm-todos-dev.md | §14.5 未覆盖/待补 | "docs 极详尽降低了实测必要性"改为"实测是验证 todos.dev 真能力的唯一途径——社区零第三方背书 + 闭源，只能靠自测" |
| P1 | pm-todos-dev.md | §4.12 / §11.1 | 加 maintainer 公开的唯一真实成本数据点：单 task $9.6（@supezen X 2080585100073566646）—— 配合 $19/月 flat 即跑 2 task 够本月月费，但 $9.6/task 绝对值说明三阶段流水线 token 开销不小 |
| P1 | pm-todos-dev.md | §12.6 社区声量结论 | 加"todos.dev 是本批次社区真空最彻底的形态——pm-avernet 至少有中文媒体通稿、pm-multica 有 GitHub issue 内热、pm-codexloom 有 361 stars，todos.dev 是'闭源 + 零社区入口 + 零第三方讨论 + 仅 maintainer 自推'最纯粹真空" |
| P1 | pm-todos-dev.md | §1 一句话证据 | "全网仅 2 条 Threads 机械复述"改为"全网仅 6 条 AI 工具聚合号（EveryDev/myaiexp/Threads×3/LinkedIn）机械复述同一句'Chief AI agent breaks it into tasks...'，零独立评测" |
| P2 | pm-todos-dev.md | §11.3 maintainer 节 | 加"@supezen 32K X followers 但单帖 views 仅 144（todos.dev 自推帖），maintainer 影响力转化率 <1%，与 npm 下载衰减互证社区采用接近零" |
| P2 | pm-todos-dev.md | §12.5 demo vs 真能力 | 加"与 pm-buzz（3 独立博客 + 9 issue 实战）/ pm-multica（#815 源码级 + 80 issues 实战）对比，todos.dev 真能力背书强度最低（仅 docs + maintainer 自推），借鉴其设计必须配套自测" |
| P2（建议，不在本文件改） | opc-product-discussion.md §5 + multi-agent-orchestration.md todos.dev 引用处 | todos.dev 老师定位 | 加注"todos.dev 设计借鉴全部基于 docs 自证零社区背书，'任务状态机老师'退居'docs 设计参考'，社区背书优先 pm-openopc/pm-multica；借鉴 todos.dev 必须配套自测" |

## 10. 证据清单

### ✅ 真实一手直证（npm / GitHub / HN Algolia / curl 直取，带 url + 时间）

1. **npm registry `@todos-dev/cli`** — 48 版本（0.1.0=2026-06-30 → latest 0.1.47=2026-08-13 今日）/ maintainer `zencooking <gempod@chain.fm>` / 版本平均间隔 1.6 天（周更节奏）/ license None / repository None（闭源） — https://registry.npmjs.org/@todos-dev/cli — 2026-08-13 快照
2. **npm downloads API 日明细** — 周 493 / 月 4738 / 累计 8332（37 非零日） / **呈「上线峰值→断崖衰减」趋势**：2026-06-30 首发 120 → 2026-07-04 峰值 770 → 2026-07-09~17 高位 490-616 → 2026-07-18 起骤降 → 2026-08 月多日 25-89 — https://api.npmjs.org/downloads/range/last-year/@todos-dev/cli — 2026-08-13 快照（**本次最关键硬数据**，戳穿"小但真实用户基数"乐观解读）
3. **GitHub org `todosdev`** — 2026-06-02 创建 / **0 公开 repo / 0 followers / is_verified=false / public_members 空 / events 空 / 无 description** — https://api.github.com/orgs/todosdev — 2026-08-13 快照（闭源 + 无社区反馈入口的硬证据）
4. **GitHub user `zencooking`**（npm maintainer 同名）— 1 follower（仅 `Levelup-JC`）/ 1 public repo（`zencooking/zencooking.github.io`="Personal page for zen.cooking"，0 star，2026-04-04 创建）/ starred 仅 2 repo（plate + wealthfolio） — https://api.github.com/users/zencooking — 2026-08-13 快照
5. **maintainer 个人页 `zencooking.github.io`** — "Zen — Indie Maker. Right tech. Minimal product. Real needs." / Products 栏只列 **ChainFM + Dokobot**（**todos.dev 未列入**）/ Links: GitHub + X (@supezen) — https://zencooking.github.io/ — 2026-04-04~05 创建（锁死 maintainer 身份与 todos.dev 在其作品谱系位置）
6. **HN Algolia 8 组精确 query 全扫**（curl -L https） — `todos.dev` nbHits=0｜`todosdev` nbHits=70 全噪音（TodoMVC/ToDoDeck/Todashev 同音干扰）｜`chain.fm` nbHits=0｜`dokobot` nbHits=356 全噪音（Dokobots 游戏/DoorBot/Ring 同名）｜`tds cli`/`todos agent team`/`chief agent plan build review`（唯一命中是无关的"Show HN: Circus Chief"4pts）/`zencooking`/`zen cooking crypto ai indie` 全 0 真实命中 — https://hn.algolia.com/api/v1/search?query=todos.dev 等 — 2026-08-13（**确认 HN 英文技术圈零认知**）
7. **todos.dev 官网 + sitemap + changelog**（curl -L 直拉） — Next.js + VitePress docs（Cloudflare Managed Content 部署）/ sitemap 37 URL（含 26+ docs + 营销页 + privacy/terms）/ changelog 2026-08-12 条目确认每日滚动 + "updated across all four locales"（中英 + 其他 2 种 i18n）+ "two real-user stories"（indie game dev + DL researcher，不可独立核实）+ Chief 时区感知/set_wake/cut turns/abnormal stop reasons/sandbox retry + 2026-08-07 Pro 转正 + 2026-08-09 移除 invite-member — https://todos.dev/docs/changelog — 2026-08-13 快照

### 🟡 二手（AI 工具聚合目录 / Threads / LinkedIn / X 聚合，机械复述非评测）

8. **EveryDev.ai tools/todos-dev + developers/todos-dev + X @EveryDevAi 推文 2086619293387723018** — AI 工具聚合号机械复述同一句"Chief AI agent breaks it into tasks, assigns each to specialist agent, cross-reviews, waits for sign-off"，且 listing 信息过时（"up to 5 people" vs 官方 solo+agents） — https://www.everydev.ai/tools/todos-dev + https://x.com/EveryDevAi/status/2086619293387723018 — 2026
9. **myaiexp.com AI Nexus todos listing**（agent-infra 类目）— 详细功能描述但**定价过时 $29/月 + 说"invite human members by email"**（落后官方 2026-08-07/09 changelog 2-4 周） — https://www.myaiexp.com/en/items/agent-infra/todos — 2026
10. **Threads `@everydev.ai` Db4W6stGj3H + Db1ydw9GBfI / `@suritech` DWEmrIDmp-M / `@build.with.anton` DRN0gqAiNUU** — 三条 Threads 全是 AI 工具聚合号机械复述同一句（pm-todos-dev.md §12.3 引的"2 条 Threads"实为跨平台 6 条同文案聚合机器人帖） — https://www.threads.com/@everydev.ai/post/Db4W6stGj3H/ 等 — 2026
11. **LinkedIn `johnbucksa`** — OpenAI Developer Community Forum 回音，机械复述同一句 — https://www.linkedin.com/posts/johnbucksa_the-openai-developer-community-... — 2026
12. **X @supezen 多帖自推 todos.dev**（maintainer 本人 dogfooding） — status 2076655883824816446（agent roster，144 views）/ 2076249419905986577（常驻 Chief）/ 2076304033632153622（Chief 帮组建团队）/ 2080549912136343643（工作流：1 句话 → Chief 选 Agent A）/ **2080585100073566646（单 task $9.6 真实成本数据点）** / 2076542217381171301（AskUser 工具）/ 2074725705376821322（长 task 邮件通知）— https://x.com/supezen — 2026-07~08（maintainer X 32K followers 中文 vibe coder，单帖 views ~144 极低，影响力转化率 <1%）

### ✅(负证据) 社区真空的硬证据（多源印证）

13. **HN Algolia `todos.dev` nbHits=0**（8 组 query 全扫，见证据 6） — https://hn.algolia.com/api/v1/search?query=todos.dev
14. **Reddit 全平台零 todos.dev 本体命中** — WebSearch `site:reddit.com` 明确报告 "No direct matches... there may not be substantial Reddit threads on that exact topic"；DuckDuckGo `site:reddit.com` 返回全是无关 todo app 讨论；.json 端点 HTTP 403 反爬（与 pm-buzz/paperclip 同款） — 2026-08-13
15. **Product Hunt 零 todos.dev launch** — WebSearch 明确报告 "did not return any direct results specifically about a todos.dev Product Hunt launch" — 2026-08-13
16. **YouTube 零 todos.dev 评测/walkthrough** — WebSearch 明确报告 "no YouTube reviews or walkthroughs indexed yet"，返回全是无关西班牙语 Figma 教程 — 2026-08-13
17. **中文社区（V2EX/掘金/即刻/知乎）零独立评测** — WebSearch 明确报告 "以官方文档和英文介绍为主，未找到较为深入的中文第三方评测或体验长文"；DDG 中文搜仅命中官方 todos.dev + 无关"Claude Code Todos→Tasks 升级"+ Zen 自己 X 帖（pi+deepseek 推荐，非讨论 todos.dev）+ 掘金"AI Todos"另一无关项目 — 2026-08-13（即便 maintainer 是中文 vibe coder + 32K X followers，中文社区也无独立讨论）
18. **三大主流 AI 工具目录（Toolify/TAAFT/NavTools）均无确认 todos.dev listing** — WebSearch 明确报告 "No verifiable listing for todos.dev was found on any of the three directories"；Toolify CF 403 challenge wall 挡；TAAFT curl 直拉只见首页无 todos.dev 内容（仅搜索 query URL 出现在 login 链接）；NavTools 无收录 — 2026-08-13

### ⚠️ PM 推断（本文件独家，基于硬数据 + 趋势解读）

19. "npm 下载量呈'上线峰值→断崖衰减'趋势更像推广窗热度退潮而非稳定用户群" —— 基于一手日明细（峰值 770 → 多日 <100）+ 稳定产品应有平稳基线的对比推断
20. "maintainer @supezen 32K X followers 不转化为 todos.dev 采用（views 144 + npm 衰减互证）" —— 基于 X 帖 views 数据 + npm 下载趋势的互证推断
21. "第三方目录信息落后官方 2-4 周反映无第三方跟进 = 社区关注度极低硬信号" —— 基于 myaiexp/everydev listing 过时信息 vs 官方 changelog 的对比推断
22. "todos.dev 是 maintainer 第三个未站稳的 side project（未列入个人主页产品栏）" —— 基于 zencooking.github.io Products 栏只列 ChainFM+Dokobot 的事实推断
23. "todos.dev 设计借鉴价值全部基于 docs 自证零社区背书，必须配套自测" —— 基于社区全栈真空 + 闭源 + 仅 maintainer 自推的现状推断
24. "$9.6/task 绝对值说明 Plan-Build-Review + Chief 编排 token 开销不小，OPC 走类似流水线需内置成本上限" —— 基于 maintainer 公开的唯一真实成本数据点推断

### 工具与方法

- **curl 一手直取（本次决定性方法）**：npm registry + npm downloads API（下载量趋势硬数据）+ HN Algolia 8 组 query（确认英文圈零认知）+ GitHub REST API（org/user/repos/members/events/gists/starred/followers）+ todos.dev 官网/changelog/sitemap + maintainer 个人页 zencooking.github.io + DuckDuckGo HTML（中英社区 + Reddit 域限）+ TAAFT/Toolify 直拉验证目录收录
- **WebSearch（绕 Reddit 403 反爬的有效替代）**：site:reddit.com + Product Hunt + YouTube + X @supezen + 中文社区多组 query，明确拿到多个"零命中"裁决
- **firecrawl（中途达 keyless 免费档每日上限）**：用 3 credits（1 search todos.dev Chief + 1 scrape myaiexp + 1 search Reddit 域限）后报 "free daily limit reached, try again in ~13h"——本次转 curl+WebSearch 补齐，结论不依赖 firecrawl
- **firecrawl 拒收 reddit.com + Toolify CF 反爬 + TAAFT 仅首页 + .json 403**：Reddit 正文/WebFire 未取，但 WebSearch site:reddit.com + DDG 双源印证 Reddit 零讨论；Toolify/TAAFT 直拉验证已确认无 listing
- **已读对照**：`pm-todos-dev.md`（654 行全读，验证对象）+ `pm-buzz-community.md` + `pm-multica-community.md`（14 节框架范本）+ `opc/research/index.md`（PM 批次索引）

---

### 走查总结一句话

**复核后 pm-todos-dev.md §12「社区声量近零」结论强成立——todos.dev 是本批次参考产品中社区真空最彻底的形态（HN 8 组 query 全 0 + Reddit/PH/YouTube/中文社区 WebSearch+DDG 双源 0 + GitHub org 0 公开 repo 0 follower + maintainer 仅 1 follower + 三大主流 AI 目录 Toolify/TAAFT/NavTools 无确认 listing + 全网仅 6 条 AI 工具聚合号机械复述同一句），唯一活跃信号是 npm 48 版本（今日 2026-08-13 仍发版，周更节奏）+ maintainer @supezen 在 X 自推（32K followers 但单帖 views 144，不转化为采用）。最关键的 P0 纠偏是 pm-todos-dev.md 把"npm 周下载 493"当"小但真实用户基数"过于乐观——一手日明细呈「上线峰值（2026-07-04 峰值 770/天）→ 断崖衰减（2026-08 月多日 <100/天）」趋势，更像推广窗热度退潮而非稳定用户群；maintainer 身份锁死为中文 indie maker Zen（@supezen，已有产品 ChainFM 10K followers + Dokobot，todos.dev 是其第三个未站稳的 side project，未列入个人主页产品栏）；唯一公开真实成本数据点 = 单 task $9.6（@supezen X 自推）。todos.dev 作为 OPC「任务状态机/长记忆老师」的定位在 docs 层成立（9-phase + 两道关卡 + 三层 memory + bounded curation + Charter 只读设计自洽且独有），但零社区背书——借鉴其设计必须配套自测，社区背书优先 pm-openopc（显式 FSM + 源码可读）+ pm-multica（#815 源码级 + 80 issues 实战）。**
