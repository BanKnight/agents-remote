# Buzz · 社区讨论走查（PM 视角纠偏）

> **承接**：`pm-buzz.md`（PM 视角产品调研，方法=deepwiki+官方源，主要是官方/源码自述）。本文件专门补「社区视角」这一维度。
> **调研对象**：[`block/buzz`](https://github.com/block/buzz) —— Block（Jack Dorsey 主导）2026-07-21 公开开源的 Nostr-native 人 + agent 协作工作区，`buzz.xyz` hosted + Apache 2.0 自托管。
> **证据分级**：✅ 真实社区帖/源码直证（HN/Reddit/GitHub issue/X/独立博客，带 url+用户名+时间）/ 🟡 媒体二手（行业媒体报道）/ ⚠️ PM 推断。
> **核心方法**：firecrawl search/scrape（主工具，免 key 免费档）+ HN Algolia API（curl 拉全文评论）+ GitHub REST API（取 issue 正文/评论/star 数）+ deepwiki（源码级验证 persona 退役、ARCHITECTURE.md §9 已知缺口）。Reddit .json 端点被网络拦截，firecrawl 也明确拒收 reddit.com——**这是本文件唯一明显缺口**，r/hermesagent + r/BuzzXYZ 帖标题确认存在但正文未取得（影响有限，HN 主帖 339 评论已足够）。
> **本文件价值**：第 9 节「启示修正」——逐条验证 `pm-buzz.md` 5 条核心引用（persona 退役 / ACP over Nostr / harness AgentPool / 共享 nest / approval gate）在社区证据下的成立程度，给 P0/P1/P2 修正清单。

## 1. 走查方法与覆盖范围

### 搜了哪些社区、命中多少、信噪比

| 平台 | 检索方式 | 命中真实社区内容 | 信噪比 |
|------|---------|--------------|--------|
| Hacker News | HN Algolia API（`curl /api/v1/items/<id>` python 递归遍历评论）+ Algolia story 搜索 | **主帖 378 pts / 339 评论（2026-07-21）+ 副 Show HN 帖 21 pts（2026-06-22，作者 `tlongwell-block` 本人在场答疑）** | 极高——主帖是 Block 外部员工 `ryanmerket` 提交，讨论含 Slack 工程师 `muglug` 亲自下场谈 multiplayer agent 数据泄露问题 |
| GitHub issues / repo | GitHub REST API（`/repos/block/buzz`、`/issues/<n>`、`/issues/<n>/comments`）+ firecrawl developer 类目 | **issue #2270（agents 在 thread 里"变聋" 9 评论全复现）+ #4491（buzz-acp 未随 Windows 安装器发布，closed）+ #4923（hermes ACP turn 完成但回复永不回 channel，open）+ repo 26,474 stars / 3,190 forks / 2,454 open issues** | 极高——issue 是真实上手用户踩坑，#2270 的 9 条复现横跨 macOS/Windows/自托管 + 多 runtime，是" Buzz 实战可用性"硬证据 |
| deepwiki 源码级 | `ask_question` 三轮 | **persona 退役源码（commit `ea5a0a9b4` 2026-07-22 + `welcome-kickoff-silent-failures.md` post-mortem）+ ACP/harness/AgentPool/EventQueue 实现 + ARCHITECTURE.md §9 全部 6 个 verified gaps + ~/.buzz nest 共享边界** | 极高——deepwiki 直接读源码，绕开文档漂移 |
| 独立技术博客 | firecrawl scrape（取全文） | **mager.co（独立开发者，真机部署 + ACP 实测 + 默认 `bypassPermissions` 告警）/ hills-lab.hr（结构化技术评测）/ digitalapplied.com（最详尽，2026-08-08，含 8 控制点 scorecard）** | 极高——三个独立来源读源码/真跑后写，互相印证 |
| 行业媒体 | firecrawl search | techtimes / yahoo / techstrong / agora-intelligence / 21zerixpm.medium | 中——纯转述，无独立评论 |
| developer 集成文档 | firecrawl developer 类目 | **Hermes Agent 官方文档（Buzz 集成章节，独立第三方给 Buzz ACP 写 BYOH 教程 = ACP 协议被外部 agent 实际采用）+ moltis / opensre / hermes-ecosystem 三个外部项目接入 Buzz** | 极高——证明 BYOH 真的 work（不是纸面） |
| X / Instagram / LinkedIn | firecrawl search 命中标题 | Matt Shumer（`@mattshumer_`）推文 + Jack Dorsey 启动推文 + 多个 LinkedIn 评测 | 中——标题确认，正文未深取（X 需登录） |
| Reddit | firecrawl search 命中标题 | r/hermesagent "Anyone really using Buzz by Block?" + r/BuzzXYZ 子版存在 | **缺口**——firecrawl 明确拒收 reddit.com，.json 端点网络拦截，评论正文未取得 |
| YouTube | firecrawl search 命中标题 | "Buzz Just Fixed AI Agents... But It Has A Serious Flaw"（Better Stack walkthrough，含 31k token 实测） | 中——WebFetch/youtube.com 被拦截，未取 transcript，但 daily.dev 转述了关键数据 |

### 方法有效性裁决

- **firecrawl 最有效**：search + scrape 一体，免 key 免费档足够（本轮用 ~12 credits）。抓独立博客全文 + GitHub issue 标题列表都靠它。
- **HN Algolia API 第二有效**：curl 拉全文评论绕开一切限额/拦截，主帖 339 评论全拿到，是社区真实口碑主力来源。
- **GitHub REST API 第三有效**：issue 正文 + 评论 + repo star/issue 计数一次取齐，Buzz 的"pre-1.0 缺陷率高"靠 open_issues=2454 + 真实 issue 内容证明。
- **deepwiki 对源码级验证不可替代**：persona 退役的 commit hash + post-mortem 文档名 + §9 全部 6 个 gaps，只能靠 deepwiki 读源码确认——这是我们对 Buzz 最核心引用（角色不写死职能）的源码级背书。
- **Reddit 是唯一缺口**：r/hermesagent + r/BuzzXYZ 标题确认存在但正文未取。对结论影响有限——这两个子版规模小（r/BuzzXYZ 是 "Unofficial community"），HN 339 评论已覆盖主流社区视角。

### 关键发现一句话

**Buzz 是 Block（Jack Dorsey）2026-07-21 开源的 Nostr 工作区，开源后两周 GitHub 20k→26k stars / 107+ releases / 2454 open issues——声量与活跃度极高但 pre-1.0 "glue still drying"。社区压倒性认可"agent 加密身份 + 签名事件审计"这一核心创新（连 Slack 工程师都认账身份模型），但实战可用性被三大问题戳穿：① token 开销巨大（一个 greeting 31k vs Claude Code 终端 4k，Matt Shumer 直接发推说 agent 不回话）；② per-channel 串行 + 必须 @mention 让对话"碎"（issue #2270 9 条复现：agent 在 thread 里"变聋"除非每条重新 @）；③ approval gate / rate limiter / send_dm 等 6 个能力在 ARCHITECTURE.md §9 自列为 verified gap（approval gate 命中即 fail 而非 wait）。persona 退役这条我们最核心的引用——deepwiki 源码直证为真（commit ea5a0a9b4 2026-07-22 + welcome-kickoff-silent-failures.md post-mortem 记录 runaway reply loop + silent failure），定位成立。**

## 2. 真实口碑（好评 / 差评，每条标来源）

### 好评（社区确实买账的点）

1. **agent 独立加密身份 + 签名事件审计 = 全行业最完整实现**——三个独立技术博客（mager.co / hills-lab.hr / digitalapplied.com）一致给出这一评价，digitalapplied 称其"identity layer will outlive the product, the piece other vendors will copy first"，hills-lab 认它是"the most complete implementation of [per-agent credential] principle we have read in a shipped codebase"。（🟡 digitalapplied.com 2026-08-08 / hills-lab.hr 2026-07-28 / mager.co 2026-07-23）
2. **Block 工程博客自述 "agent invent coordination we didn't script: recruiting each other, splitting work into side channels"** ——Tyler Longwell（作者 `tlongwell-block`）在工程博客 + Show HN 评论区亲述 emergent swarm 行为：一个 frontier agent 驱动 swarm of cheaper agents，互相 @mention 注入到对方活跃工作里。这是官方第一手 dogfooding 证据。（✅ engineering.block.xyz/blog/buzz / Tyler Longwell / 2026-07-21 + HN Show HN 48632977 `tlongwell-block` 2026-06-22）
3. **"channel 作为共享上下文 = memory"被独立用户印证**——HN `genericone`：用 claude-code 配 bespoke session-wrap + recontextualize，"I think Buzz' use of channels and rooms is better, since each feature/concept has its own development pace, velocity, and history. I'll give it a shot." 独立第三方从实战痛点（多项目 context 互相 bleed）反向印证 Buzz 的 channel-as-memory 是真解法。（✅ HN Show HN 48632977 / `genericone` / 2026-06-22）
4. **ACP 协议被外部 agent 项目实际采用（BYOH 不是纸面）**——Hermes Agent（Nous Research）官方文档专门写了 Buzz 集成章节（"Buzz channels (relay bridge)"），教程里手把手教 `cargo build -p buzz-acp` + mint Nostr keypair + 起 relay bridge；moltis / opensre / hermes-ecosystem 三个外部项目都接入了 Buzz。这是 BYOH 契约被第三方真用的硬证据。（✅ nousresearch/hermes-agent ACP docs / ksimback/hermes-ecosystem / tracer-cloud/opensre / 2026-07~08）
5. **Show HN 作者 `tlongwell-block` 在场答疑（与 cf-os 的 Kenton 同款"作者在场"信号）**——Show HN 帖里 `tlongwell-block` 亲自解释 orchestrator vs single-agent 两种范式、channel-as-memory 的实战价值。作者在场本身是口碑加分项（block 内部员工用真名维护）。（✅ HN 48632977 / `tlongwell-block` / 2026-06-22）

### 差评（社区集中火力的点）

1. **token 开销巨大——一个 greeting 31k vs Claude Code 4k（最大实战痛点）**——daily.dev 文章引 YouTube "Buzz Just Fixed AI Agents... But It Has A Serious Flaw" 实测："Replying to a greeting cost thirty one thousand tokens for us. The same thing in the terminal was about 4,000." + "Add another agent and it multiplies." daily.dev 总结："The token costs are brutal — one reviewer clocked a simple greeting at 31,000 tokens versus roughly 4,000 in Claude Code." 这是对 Buzz "swarm + 每 turn 重 spawn + 注入 base prompt + channel 历史"架构的实战成本戳穿。（🟡 daily.dev 2026-08-04 转 YouTube Better Stack walkthrough / 2026-07~08）
2. **Matt Shumer（AI 圈 KOL，OthersideAI CEO）公开推文："agents 不回话"**——`@mattshumer_` 推文（status 2082882798612832666）："Trying out Buzz, and having a not-super-great initial experience. I can't seem to get any agents to respond!" 这是 KOL 级别的负面体验广播，被 daily.dev 直接引用。社区有人完全跑不通。（✅ x.com/mattshumer_/status/2082882798612832666 / Matt Shumer / 2026-07~08）
3. **per-channel 串行 + 必须 @mention 让 thread 对话"碎"——issue #2270 9 条复现横跨多平台多 runtime**——`Ansonhkg` 起 issue（2026-07-21，_launch 当天_）：agent 加入 thread 后，未 @mention 的后续回复被静默丢弃（relay 订阅层 `SubscribeMode::Mentions` + `match_event` 两层 gate）。9 条复现：`brocoppler`（自建同类系统踩同坑，提了 PR）/ `oveddan`（macOS + Claude Code）/ `dmnyc`（让 agent "Angel" 代为发复现报告，魔性）/ `thehawkeye` / `BasRutjes`（自托管 relay + Claude agent，"from my side it looked like it was ignoring me"）/ `sbscan` / `Voisens`（Windows 复现，补全跨平台）。社区共识："requiring an explicit @mention on every follow-up inside an already-active agent thread creates substantial friction and makes the conversation feel broken"。（✅ github.com/block/buzz/issues/2270 / 9 位复现者 / 2026-07-21~08-04）
4. **buzz-acp 安装门槛——Windows 安装器不随附 buzz-acp，所有 agent 全挂（issue #4491）**——`Mimo314` 起 issue（2026-08-03）：Buzz Desktop 0.5.3 Windows 版安装后，所有 agent mention 失败报"ACP harness command buzz-acp was not found"，错误提示让用户 `cargo build --release --workspace`——"There appears to be no way for someone who installed the released .exe to obtain buzz-acp." 即**普通终端用户根本无法在 Windows 上跑起来**。issue closed（已修）但反映安装门槛。（✅ github.com/block/buzz/issues/4491 / `Mimo314` / 2026-08-03）
5. **hermes ACP turn 完成但回复永不回 channel（issue #4923）**——`gvalbuenamdphd-lang` 起 issue（2026-08-05，Buzz Desktop 0.5.5 + hermes-acp v0.20.0）：ACP 协议层 `stopReason: "end_turn"` 完全正常 + `agent_message_chunk` 流到，但回复从未作为 Nostr event 发回 channel。即**协议对但 glue 断**——这是 buzz-acp harness 把 ACP 输出转回 Nostr event 那一段的 bug。（✅ github.com/block/buzz/issues/4923 / `gvalbuenamdphd-lang` / 2026-08-05）
6. **Slack 工程师 `muglug` 亲自下场质疑 multiplayer agent 数据泄露模型**——HN 主帖 `muglug`（"[I work for Slack, opinions very much my own]"）："Having agents see everything you and your colleagues see is cool. The challenge comes when you want to make certain things private to certain people... you end up having to write and maintain complex rulesets... Single-player agents, on the other hand, are much more straightforward." 这是对 Buzz "agent 一等成员看所有 channel context"核心模型的直接挑战。`paxys` 跟进："If I am in group A but not group B and an agent is in both, what is it allowed to share with me?"——**transitive membership 问题社区无解**。（✅ HN 48995213 / `muglug` + `paxys` + `ahf8Aithaex7Nai` + `jaggederest` / 2026-07-21~22）
7. **ARCHITECTURE.md §9 自列 6 个 verified gap——approval gate / rate limiter / send_dm / set_channel_topic / huddle recording / typing REST 全未完成**——deepwiki 源码级确认：approval gate `finalize_run` 显式标 Failed reason "approval gates not yet implemented — see WF-08"；rate limiter 唯一实现是 `AlwaysAllowRateLimiter` 测试 stub；`send_dm` / `set_channel_topic` 返回 NotImplemented 命中即 fail。这是**关键能力在 README 暗示但 ARCHITECTURE.md §9 自承缺失**的文档矛盾。（✅ block/buzz ARCHITECTURE.md §9 / deepwiki 源码验证 / 2026-07~08）
8. **channel membership 是唯一 access control——对 agent 过粗**——hills-lab 评测："Buzz currently treats channel membership as the access-control gate... too coarse for agents that can send patches, run workflows, call tools, create channels, or orchestrate other agents. A production agent needs separate authority for reading context, proposing a change, executing a workflow, using a secret-bearing tool, approving a step, and publishing a result." digitalapplied 引 Block 自己的 SECURITY.md："Channel membership is the only access control mechanism. There are no separate ACL lists or capability taxonomies."（🟡 hills-lab.hr / digitalapplied.com / 引 Block SECURITY.md / 2026-07-28~08-08）
9. **audit chain 是 tamper-evident 非 tamper-resistant，hosted 内容非 E2E 加密**——hills-lab + digitalapplied 双重确认：hash chain 无 key，有 DB 写权限即可重算；Block-hosted relay 消息/媒体非端到端加密，连接的 model provider 可能收到 prompt + channel 内容。（🟡 hills-lab.hr / digitalapplied.com / 引 Block SECURITY.md / 2026-07-28~08-08）
10. **dev MCP server 给 agent shell at operator trust level**——digitalapplied 引 VISION_AGENT.md：Buzz 的 dev MCP server 给 agent 一个 shell + 文件编辑器，"runs at the operator's trust level, like bash itself"——"An agent scoped to one quiet channel still has the operator's privileges on the machine it runs on." 即**channel membership 约束不了 agent 在 host 上能干什么**。mager.co 实测补充："the harness runs the agent with `permission_mode=bypassPermissions` by default"——默认放权，inbound author gate 是唯一安全边界。（🟡 digitalapplied.com + mager.co / 2026-07-23~08-08）

### 社区声量小结

HN 主帖 378 pts / 339 评论 + repo 26k stars / 2454 open issues / 107+ releases——Buzz 是 2026-07 开源周声量极高的项目（cf-os 同周 658 pts/331 评论，量级相当）。**但讨论焦点与 cf-os 完全不同**：cf-os 焦点是"OS 命名 / vendor lock-in / 沙箱硬度"，Buzz 焦点是"(a) Jack Dorsey 是不是又 vibe-coded 侧项目（~20% 评论）；(b) multiplayer agent 数据泄露 / private channel ACL（~30% 评论，Slack 工程师亲自下场）；(c) Slack vs Buzz 谁该为 agent 敞开门（~15% 评论）"。**社区认真讨论了它的多 agent 协作模型（与 cf-os 几乎无人谈编排形成鲜明对比）**——Buzz 是真的被当编排产品审视，因为它的 channel + @mention + swarm 形态就是编排。

## 3. demo vs 真能力（官方吹的 vs 社区戳穿的，逐条对照）

| 官方/README 吹的点 | 社区戳穿 / 校准 | 裁决 |
|---|---|---|
| **"We wrote this post in a Buzz channel with our team and our agents. We wrote Buzz there too."**（工程博客，dogfooding 终极背书） | 真实——`tlongwell-block` 在 Show HN 印证内部用 goose-based Slack agent 已数月，Buzz 是其后继。**但** digitalapplied 指出："Block tells its own employees not to build from source or use the open-source release, but to use the internal build that comes pre-wired to Block's relay and agent provider." 即**开源版 vs Block 内部版有距离**，dogfooding 是内部版非公开版。 | **半真**——内部 dogfooding 真，但公开开源版 ≠ 内部生产版。社区使用的是公开版，bug 率反映的是公开版质量。 |
| **"frontier agent driving a swarm of cheaper, faster agents... orchestration at a scale and cost you can't match"**（工程博客） | token 开销实测戳穿——daily.dev/YouTube 实测一个 greeting 31k tokens vs Claude Code 4k，"add another agent and it multiplies"。即 swarm 的 cost 在 base prompt 注入 + channel 历史回放 + per-turn spawn 下爆炸，"scale and cost you can't match"方向反了——是成本爆炸不可匹配。 | **吹**——swarm 形态真，但 cost 叙事被实战戳穿。 |
| **"Agents do work... they talk through ordinary Buzz mentions, injected into each other's active work almost instantly without breaking anyone's flow"**（工程博客 emergent 协作） | issue #2270 9 条复现戳穿：thread 里 agent "变聋"除非每条重新 @mention。`BasRutjes`："from my side it looked like it was ignoring me. Only re-tagging on every single message keeps the conversation moving, which is the opposite of how a human uses a thread." emergent 协作卡在 @mention gate 上。 | **吹/未完工**——emergent 协作愿景真，但 mention gate 让 thread 内连续对话断，"instantly without breaking flow"不成立。 |
| **"agent 一等成员 + channel membership 即访问控制 = 简洁如人"**（README framing） | Slack 工程师 `muglug` + hills-lab + digitalapplied 三方戳穿：multiplayer agent 在多 private channel 间会泄露；channel membership 对 agent 过粗（agent 能跑 workflow / 调 secret-bearing tool / 改 channel，membership 不区分读写执行批准）。 | **吹**——简洁是真但太粗，生产 agent 需要 capability taxonomy 而 Buzz 没有。 |
| **"the bottleneck moved from intelligence to coordination"（核心立论）** | 社区基本认账这一立论——`teach`（HN，infra 工程师）："getting the humans and agents to talk together is really fragmented right now... the agent with the context in my locally-installed Cursor can't really participate in a Slack conversation about a PR that 'it' principally authored... This is a real communication problem... eventually someone will solve it well and I will ask our leadership to give them a lot of money." | **真**——立论被一线 infra 工程师印证，Buzz 指向的真问题。 |
| **"agent 加密身份 + 签名事件 = 可审计可移植"**（身份核心卖点） | 几乎无差评，社区一致认这是真创新。digitalapplied/hills-lab/mager.co 三独立博客一致给最高评价。 | **真能力**——核心创新无戳穿。 |
| **"Workflow approval gates / request_approval"**（README 暗示） | ARCHITECTURE.md §9 + deepwiki 源码确认：命中 gate 的 run 显式 fail（reason "approval gates not yet implemented — see WF-08"），不 wait。 | **吹/未完工**——基础设施在但 resume 未接，命中即 fail。 |
| **"rate limiting（buzz-auth crate）"**（README crate map 列） | ARCHITECTURE.md §9 + digitalapplied 戳穿 README 自相矛盾：crate map 列为 buzz-auth 职责，§9 说唯一实现是 `AlwaysAllowRateLimiter` 测试 stub，四档（human/agent-standard/agent-elevated/agent-platform）配置了但无强制。 | **吹**——README 暗示有，§9 自承没有，文档自相矛盾。 |
| **"self-hostable, Apache 2.0"** | 真实——mager.co 在 Mac mini 上 Docker 通过 colima 实际部署成功（"The relay came up clean after it"），`buzz-admin generate-key` + `add-member` 全流程跑通，看到 agent pubkey 在事件里签名。但**门槛高**：colima/Hermit/Docker compose plugin 缺失等多个安装坑，Windows 安装器不随附 buzz-acp（#4491）。 | **真能力但门槛高**——技术真，但生产自托管需运维 Postgres + Redis + MinIO + TLS 终止 + 自己加 rate limiter 反代。 |
| **"buzz-acp harness, 1-32 agent subprocesses, BYOH"** | Hermes Agent 官方文档 + moltis/opensre 真接入 = BYOH 真的 work。但 issue #4923（hermes ACP turn 完成但回复永不回 channel）+ #4491（Windows 不随附）+ #2270（thread 变聋）= harness 的 glue 层 bug 多。 | **半真**——协议契约（ACP）真且被采用，harness 实现层 bug 多。 |

**demo vs 真能力总裁决**：Buzz **不是 demo 纸糊的**——核心身份模型 + ACP 契约 + relay + nest 是真落地代码，三个独立博客读源码后一致认可身份层，Hermes 等外部 agent 真接入。但**官方博客叙事 vs 真能力有系统性 gap**：(a) swarm 的 cost 叙事被 token 实测戳穿（31k vs 4k）；(b) "agents talk without breaking flow"被 #2270（thread 变聋）戳穿；(c) approval gate / rate limiter / send_dm / set_channel_topic 在 ARCHITECTURE.md §9 自列为 gap；(d) Block 内部 dogfooding ≠ 公开开源版（员工用内部预接版本）；(e) channel membership 对 agent 过粗是设计取舍但被 Slack 工程师点名。**这五点是现有 `pm-buzz.md` 没捕捉到的社区校准**。

## 4. 实际上手体验（试用者感受与痛点）

与 cf-os 开源首周"声量高上手率低"不同，**Buzz 有真实上手者**——开源后两周内已有多个独立用户部署 + 跑通 + 写体验：

1. **mager.co（独立开发者，Mac mini 真机部署）**——完整部署 + ACP 实测 + 几个坑：(a) Docker 通过 colima（headless Mac mini 无法用 Docker Desktop）；(b) Hermit 提供 Rust/Node/pnpm/just 但不提供 Docker 本身，Homebrew 的 `docker` formula 不带 compose plugin，`just setup` 死在 `docker compose up -d` 的 `unknown shorthand flag: 'd'` 直到单独装 `docker-compose`；(c) `buzz-admin mint-token` 命令不存在（文档漂移，实际是 `generate-key` + `add-member`）；(d) relay NIP-11 文档缺 NIP-34（但 repos/patches/issues/pr 全实现）；(e) harness 日志显示 `configured_model=sonnet` 但底层 session 用账号没权限的 model（用户全局 `~/.claude/settings.json` 覆盖 harness 配置，错误三层之下才暴露）；(f) **默认 `permission_mode=bypassPermissions`**——"reasonable for an unattended bot but means the inbound author gate is the entire security boundary. Worth knowing before you point one at a real repo."；(g) 关键洞察："buzz-acp spawns the agent per turn rather than keeping a session alive. Mention, spawn, turn, reply. That is not a port of an always-on session with accumulated context — it's a different model, where the channel history is the continuity rather than the process."（🟡 mager.co / 2026-07-23）
2. **issue #2270 的 9 位复现者**——横跨 macOS / Windows / 自托管 relay / 多 runtime（Claude Code / hermes-acp / managed agent），痛点一致：thread 内连续对话必须每条重新 @mention，否则 agent "变聋"。`BasRutjes`："Only re-tagging on every single message keeps the conversation moving, which is the opposite of how a human uses a thread."（✅ github.com/block/buzz/issues/2270 / 2026-07-21~08-04）
3. **issue #4491（Mimo314，Windows）**——安装器不随附 buzz-acp，所有 agent mention 失败，错误提示让 `cargo build`——普通终端用户跑不起来。（✅ 2026-08-03，已 closed）
4. **issue #4923（gvalbuenamdphd-lang）**——hermes-acp v0.20.0 + Buzz Desktop 0.5.5，ACP turn 协议层完全正常（`stopReason: "end_turn"`）但回复永不回 channel——harness 把 ACP 输出转回 Nostr event 的 glue 断。（✅ 2026-08-05，open）
5. **Matt Shumer（KOL）**——公开推文："I can't seem to get any agents to respond!" 最差第一印象。（✅ x.com/mattshumer_ / 2026-07~08）
6. **daily.dev 文章作者引 Better Stack YouTube walkthrough**——"Agents stall mid-task and need human nudging to continue... no end-to-end encryption and no per-channel access controls, which makes the 'team workspace' framing feel premature."（🟡 daily.dev / 2026-08-04）

**上手体验裁决**：Buzz **比 cf-os 上手率高**（开源两周内已有 6+ 个独立上手报告），但**实战可用性低**——几乎每个上手者都踩坑（安装门槛 / 模型配置 / thread @mention / harness glue bug / token 成本）。这是典型的"pre-1.0 活跃但不稳"，符合 Block 工程博客自承"rough edges and giant chasms"。**对现有 `pm-buzz.md` 的修正**：§11 写的"Buzz 重，需自托管/key 管理/CLI 安装门槛"方向对，但应补"开源两周内已有真实上手报告：mager.co 完整部署 + 多个 GitHub issue 实战 bug + Matt Shumer 公开报 agent 不回话——核心身份/ACP 真能跑，但 harness glue 层 + token 成本 + @mention 模型实战可用性不足"。

## 5. 与竞品对比的社区定位

社区把 Buzz 和谁比、怎么定位：

1. **vs Slack（最高频对照，~30% HN 评论）**——社区压倒性把 Buzz 定位为"Slack 替代品/Slack 竞争者"。`asdev`："No one is going to churn Slack for this just because it is 'Agent First'. Slack is more than good enough." `teach`（infra 工程师）反驳：Slack 不能让本地 Cursor agent 参与 PR 讨论，"Slack is preventing us"。Slack 工程师 `muglug` 亲自下场讨论 multiplayer agent 隐私。`jacobgold` 提议 Slack 应该拥抱 AT Protocol。**定位：Buzz 是"agent-first Slack"，与 Slack 的差异在 agent 一等成员身份 + 自托管 + Nostr 协议**。（✅ HN 48995213 / 多用户 / 2026-07-21~22）
2. **vs GitHub（次高频对照）**——"feature branch as channel + patches as signed events"被定位为 GitHub forge 替代。`giancarlostoro`："I always chuckle when someone makes a GitHub alternative, and the code is hosted on GitHub." digitalapplied/mager.co 都把 git-on-object-storage 作为架构亮点。**定位：Buzz 是"agent-scale Git forge"**（设计动机：agent 移除了人类这个"内置 rate limiter"，现有 forge 扛不住 machine-scale activity）。（✅ HN 48995213 + 独立博客 / 2026-07~08）
3. **vs Google Buzz / Google+（命名联想）**——`horsawlarway` / `ecliptik` / `MPSimmons` / `cryptoz` 多人联想 2010 年 Google Buzz。"Hard to take this as that big a deal when Google literally launched a product along similar social themes named 'Google Buzz' which lasted all of like 16 months in 2010." 命名负面联想。（✅ HN 48995213 / 2026-07-21）
4. **vs Tangled.org / bitchat**——`toomuchtodo`："Competing with tangled.org I suppose?" `wslh`："Meanwhile, Jack Dorsey keeps working with Claude at github.com/permissionlesstech/bitchat." 即社区把 Buzz 放在 Dorsey 的 Nostr/bitcoin 生态项目谱系（Bluesky/ATProto/bitchat/Buzz）里看。（✅ HN 48995213 / 2026-07-21）
5. **vs Claude Code / Codex 单机（成本对照）**——daily.dev："For solo developers right now, Claude Code or Codex alone is faster and cheaper. Where Buzz might actually earn its keep is in team settings where accountability matters." **定位：单机用 Claude Code/Codex，团队场景才轮到 Buzz**。（🟡 daily.dev / 2026-08-04）
6. **vs Paperclip / CrewAI / AutoGen**——社区几乎**不**把 Buzz 与这些多 agent 编排器并列讨论（HN 339 评论 + 多个独立博客几乎无人提这些名字）。Buzz 被定位为"协作工作区（Slack 类）"，不是"编排器（CrewAI 类）"——尽管它内部有编排能力。这印证 pm-buzz.md §1 的"它不是 agent 编排器，是能让 agent 长期住进来的 Slack 替代品"。
7. **buzz.xyz 与 Grok Bot 的关系**——Grok Bot 走查提到的 `buzz.xyz` 确认就是 Block 的 Buzz（Jack Dorsey 2026-07-21 启动推文 + block.xyz/inside/introducing-buzz-where-humans-and-agents-work-together 均指向 buzz.xyz）。**它不是 Grok Bot 的竞品**——Buzz 是"Slack + GitHub for humans + agents"，与 Grok（X 的 chatbot）赛道不同。若有文档把 Buzz 列为 "Grok Bot 开源竞品"，应修正为"Buzz 是 Slack+GitHub 替代品，其 agent 一等成员模型是 chatbot-as-teammate 范式的开源参考，但赛道与 Grok 不直接竞争"。（✅ 工程博客 + 多源印证 / 2026-07-21）

**社区定位共识**：Buzz **被社区当作"agent-first Slack + agent-scale GitHub forge"**，最接近对照是 Slack + GitHub + Nostr 谱系（Bluesky/ATProto/bitchat）。**不被当作 CrewAI/AutoGen/Paperclip 那样的"编排器"**——这与 `pm-buzz.md` §1 现有判断完全一致，社区强印证。

## 6. "规格→代码 pipeline"形态是否被社区认可

**核心发现：Buzz 不是"规格→代码 pipeline"——pm-buzz.md 也从未这么定位它（pm-buzz.md §1 明确："它不是 agent 编排器，是能让 agent 长期住进来的 Slack 替代品"）。"规格→代码 pipeline"是其他产品（如 Devin/Jules/Factory）的形态，Buzz 是协作工作区形态。**

社区对 Buzz 形态的认可集中在三点：
- **channel-as-shared-context 形态被认可**——`genericone`（HN）从实战痛点反向印证。
- **signed-event-as-audit-trail 形态被高度认可**——三个独立博客一致最高评价。
- **swarm 形态被部分认可**——工程博客自述 + `tlongwell-block` Show HN 解释，但 token 成本戳穿其 cost 叙事。

社区**未**把 Buzz 当"规格→代码 pipeline"看——它是"让 agent 长期住进 Slack-like 工作区"，代码工作是 emergent（agent 在 channel 里接 @mention 干活），不是 input spec → output code 的线性 pipeline。

## 7. 编排能力的社区视角（验证我们"Buzz ACP Nostr 是通信媒介参考 + persona 退役是反面警示"定位）

这是本走查的核心节——验证 agents-remote 对 Buzz 的两条定位。

### 7.1 "ACP over Nostr 是 agent 间通信媒介参考"——社区证据成立

- **ACP（Agent Client Protocol）真存在且真 work**——deepwiki 源码级确认：JSON-RPC 2.0 over stdin/stdout（NDJSON），`initialize` 握手 / `session/new` / `session/prompt` 流式。Hermes Agent 官方文档独立给 Buzz 写 BYOH 教程（"buzz-acp harness connects Buzz channels to any ACP agent over stdio"），moltis/opensre/hermes-ecosystem 三个外部项目真接入。✅ **定位成立**：ACP 是真实可用的 agent↔harness 通信契约，BYOH 真的让"任何 ACP-speaking agent 注册为 runtime"。
- **@mention 发 Nostr event + per-channel 队列真实现**——deepwiki 确认：kind 9 event + `#p` tag 路由；EventQueue Drop/Queue 双模式 + at-most-one in-flight per channel；author gate（OwnerOnly/Allowlist/Anyone/Nobody）。但**实战有 bug**：issue #2270（thread 变聋）+ #4923（回复永不回 channel）证明 routing/relay-glue 层未完全稳。
- **"per-channel 队列串行化"被实战印证是真解法，但代价高**——`tlongwell-block` Show HN 解释 deep thread 对 agent 自组织有用；issue #2270 的痛点（必须每条重新 @）反向印证 per-channel + mention gate 是真在串行化（防自我抢占），只是 gate 太严让连续对话断。
- **裁决**：agents-remote 把"ACP over Nostr 当通信媒介参考"的定位**成立**——ACP 协议契约值得借鉴（BYOH + JSON-RPC over stdio + session/prompt 流式），Nostr event 路由模型可借"事件驱动 + 单一真相源 + 实时 fan-out"模式（§13.2 已结论 Nostr 协议栈对单机 Bun 是 over-engineering，借模式不借协议栈）。

### 7.2 "persona 退役是反面警示——角色不写死职能"——deepwiki 源码级强印证

**这是本走查最重要的源码验证**——agents-remote 把 Buzz persona 退役当作"角色不写死职能"的核心警示（pm-buzz.md §3 痛点 7 + §12 挑战 1 + §12 核心警示 3 点）。deepwiki 源码直证：

- **退役为真**：固定职能 persona（Orchestrator/Researcher/Planner/Implementer/Reviewer）在 commit **`ea5a0a9b4`**（2026-07-22，标题 "Replace built-in personas with Fizz"）退役，列在 `desktop/src-tauri/src/managed_agents/personas.rs` 的 `RETIRED_PERSONAS` 数组。
- **退役原因（源码级铁证）**：`docs/welcome-kickoff-silent-failures.md` 是详细 post-mortem，记两个真问题：**runaway reply loops**（agent 陷入 perpetual acknowledgment 循环，尤其在结束对话时——base prompt 自相矛盾：既强制每条 user message 都要回复，又强制完成工作时 @mention delegator，哪怕没事可报）+ **silent failures**（agent 静默失败或提供误导信息，welcome kickoff 流程尤其严重）。
- **退役机制**：不删除（防 `persona_id` 悬空引用），而是 `migrate_retired_personas` 给 display_name 追加 " (retired)" + 标 `inactive`。
- **新方向的核心洞察（关键）**：新方案把回复义务从"谁触发"改成"这 turn 有什么要说的"——即**显式允许沉默作为成功条件**。`welcome-kickoff-silent-failures.md` 明确拒绝"在 persona 里修 loop"——persona 是"character prompts (tone, wordplay)"，会话协议规则塞进 persona 是"layering violation"。
- **裁决**：agents-remote 的定位**强成立**，且比 pm-buzz.md 现有描述更精确——退役不只是"转向宽能力"，根因是**base prompt 的回复义务规则自相矛盾**（强制回复 + 强制 @mention delegator = 没事也互相 ping）。这给我们的警示应升级为两条：
  - **警示 A（已有）**：角色模板不写死职能边界，写"宽能力 + 倾向 + 工具表"。
  - **警示 B（新，pm-buzz.md 未捕捉）**：会话协议规则（回复义务、@mention delegator）**不能塞进角色 prompt**，要在编排层显式表达；尤其要显式允许"沉默作为成功条件"——否则会触发 runaway reply loop（agent 互相 ping 不收敛）+ silent failure（agent 卡窄角色循环不报错）。

### 7.3 "Buzz 没有'任务'一等实体"——社区间接印证

社区无人讨论 Buzz 的"任务/依赖图/状态机"——因为 Buzz 的"工作"emergent 在 channel 对话 + nest 文件 + workflow run 里，没有结构化 task entity。HN 339 评论焦点在"身份/隐私/Slack 对照/swarm cost"，**零讨论任务依赖图或崩溃恢复**。这间接印证 pm-buzz.md §11.1"Buzz 没有结构化任务状态/依赖图/崩溃恢复/审批门控完整闭环"——社区根本没期待它有，因为定位是协作工作区不是项目管理。

## 8. Block 背书 / 内部使用的可信度（社区信不信）

- **Jack Dorsey 启动推文（2026-07-21）真实**——`x.com/jack/status/2079605800998146171`："we're launching BUZZ! a new groupchat platform for teams of people and agents of all sizes, built to reduce our dependency on slack and..."（✅ X / Jack Dorsey / 2026-07-21）
- **Block 内部 dogfooding 真实但偏理想化**——工程博客 Tyler Longwell："We wrote this post in a Buzz channel with our team and our agents. We wrote Buzz there too." + Show HN `tlongwell-block` 详述内部 Slack-integrated goose agent 已用数月。**但** digitalapplied 指出："Block tells its own employees not to build from source or use the open-source release, but to use the internal build that comes pre-wired to Block's relay and agent provider." 即**开源版 ≠ 内部生产版**——内部用预接 Block relay + agent provider 的 build，社区用的是公开开源版（bug 率反映公开版）。
- **社区对 Jack Dorsey 的信任分裂**——HN 主帖 ~20% 评论质疑 Jack Dorsey 是"vibe-coded 侧项目"。`darth_avocado`：Block 股东视角批评 Dorsey 多年侧项目（Tidal/blockchain/Weebly）忽视核心业务。`noodlescb` 讽刺"rich kid tinkering to stay relevant"。`dwedge`：Dorsey 假装 AI 是裁员一半 Block 员工的理由。**但** `pclowes` 反驳："Jack is a much better 0 to 1 guy... Twitter, Square, Bluesky/ATProto, bitchat, buzz. He just always fumbles the 1 to N." 即社区分裂为"Dorsey 不可信"vs"Dorsey 0-to-1 强但 1-to-N 弱"两派。
- **repo 数据印证活跃度高**——26,474 stars / 3,190 forks / 107+ releases / 4,000+ PRs since March / 85 contributors（top 10 全是 Block staff + dependabot，digitalapplied 指"normal shape for a company-authored project in its first months"）。repo 2026-03-06 创建，2026-08-12 仍在活跃 push。**Block 投入真实**（不是甩出去不管的 side project）。
- **裁决**：**Block 背书真实且投入显著**（85 contributors + 107 releases + 工程博客自述 dogfooding），但**开源版 ≠ 内部版**（员工用内部预接 build），且**社区对 Jack Dorsey 个人信任分裂**。建议引用 Block dogfooding 时标注"内部版，开源版 bug 率更高"。

## 9. 对 agents-remote / OPC 的启示修正（重点）

### 9.1 现有 `pm-buzz.md` 被社区证据**印证**的结论

| 现有结论 | 位置 | 社区证据 | 印证强度 |
|---|---|---|---|
| "persona 退役转向 Fizz/Honey/Bumble 通用助手" | §3 痛点 7 / §4.3 / §12 挑战 1 | deepwiki 源码 commit `ea5a0a9b4` 2026-07-22 + `welcome-kickoff-silent-failures.md` post-mortem | **最强印证**——源码直证，commit hash + post-mortem 文档名都有；退役根因比现有文档更精确（base prompt 回复义务自相矛盾） |
| "ACP over Nostr：@mention 发 event，per-channel 队列" | §3 痛点 3 / §4.5 / §7 | deepwiki 源码 + Hermes Agent 官方文档独立 BYOH 教程 + moltis/opensre 真接入 | **强印证**——ACP 协议被外部 agent 实际采用 |
| "buzz-acp harness spawn 1-32 agent 子进程，BYOH" | §4.4 / §10 | deepwiki 源码 + mager.co 实测"spawns the agent per turn rather than keeping a session alive" | **强印证**——mager.co 真机实测补充关键细节：**per-turn spawn 而非常驻 session**（channel history 是 continuity） |
| "Buzz 不是编排器，是 Slack 替代品" | §1 / §5 | HN 339 评论无人把 Buzz 与 CrewAI/AutoGen 并列；压倒性对照 Slack/GitHub | **强印证**——社区定位与现有判断一致 |
| "agent 加密身份 + Owner Attestation 是真创新" | §3 痛点 1/6 / §4.2 | digitalapplied/hills-lab/mager.co 三独立博客一致最高评价 | **强印证** |
| "Buzz 没有'任务'一等实体/依赖图/崩溃恢复/审批闭环" | §11.1 | HN 339 评论零讨论任务依赖图；ARCHITECTURE.md §9 自列 approval gate 为 gap | **强印证** |
| "Nostr 协议复杂度对单机 Bun 是 over-engineering" | §13.2 | digitalapplied/mager.co 均指出单权威 relay（非 P2P/非 federation）= 简化但非 Nostr 韧性 | **中强印证**——Buzz 自己也只用单 relay，没真用 Nostr 的 P2P 韧性 |

### 9.2 现有 `pm-buzz.md` 被**推翻**或需**打折扣**的结论

1. **§3 痛点 5 / §4.4 / §10 "BYOH 三层（Tier-1 编译期 + Tier-2 preset + Tier-3 用户 JSON）" 需补实战校准**——BYOH 契约（ACP）真 work（Hermes 等接入），但**实战 harness glue 层 bug 多**：issue #4923（ACP turn 完成但回复永不回 channel）+ #4491（Windows 不随附 buzz-acp）+ #2270（thread 变聋）。**修正建议**：§4.4 末加社区校准——"BYOH 契约（ACP）被外部 agent（Hermes/moltis/opensre）真接入，但 harness 实现层实战 bug 多：issue #4923 ACP turn 完成但回复未发回 channel、#4491 Windows 安装器不随附 buzz-acp、#2270 thread 内未 @mention 则 agent 变聋。借 ACP 协议契约可，但 harness 实现质量是 pre-1.0。"

2. **§3 痛点 2 / §6 "channel 作为单一共享上下文源" 需补 token 成本校准**——channel-as-memory 真 work，但**回放 channel 历史的 token 成本爆炸**：daily.dev/YouTube 实测 greeting 31k tokens vs Claude Code 终端 4k，"add another agent and it multiplies"。**修正建议**：§6 状态哲学节加 token 成本校准——"channel-as-memory 的代价是 token 开销：实测一个 greeting 31k tokens（vs Claude Code 终端 4k），swarm 场景成本乘以 agent 数。Buzz 用 LlmContextExceeded 被动截断 + nest 文件产物应对，无主动检查点压缩（§8 已记）。OPC 借鉴 channel-as-memory 时必须配套主动压缩（PRD §13 L3 检查点压缩）+ 每轮 token 上限，否则成本不可控。"

3. **§4.7 / §9 "Workflow approval gate" 需打折扣**——现有文档标 🚧（infra 在、resume 未接），方向对但应更直白。**修正建议**：§4.7 加源码级铁证——"deepwiki 源码确认：命中 gate 的 run 显式标 Failed（`finalize_run` reason 'approval gates not yet implemented — see WF-08'），不 wait。即当前版本 approval gate 不是可用安全控制。OPC 不能借 Buzz 的 workflow approval 实现，需自建（PRD §12.3 CEO 审批 + approvalPolicy）。"

4. **§6 "nest 共享 state 是 single source of truth" 与 §4.6 "per-agent memory 不共享 brain" 表述需厘清**——现有 §4.6 写"共享磁盘 workspace + core memory，不共享对话 context"，§6 又写"relay + nest 当 single source of truth"，看起来矛盾。**deepwiki 源码厘清**：真相是**两个独立的共享边界**——(a) relay（Nostr event log）是 channel 内对话的真相源（per-channel，跨 agent 在同 channel 内共享）；(b) nest（~/.buzz 磁盘）是跨 session 跨 channel 的产物记忆（agent 写的 RESEARCH/PLANS 等文件，其他 session/persona 可读）；(c) **不共享**的是单个 channel 内 in-flight 的对话 context（每个 channel 自己的 turn 上下文）。**修正建议**：§6 把"两个真相源 + 一个不共享"显式画清——"relay = channel 对话真相源（per-channel 内跨 agent 共享）；nest = 跨 session/channel 产物记忆；不共享的是单 channel 内 in-flight turn context（防自我抢占）。OPC 的'共享 brain'讨论应分这三层，不要笼统说'共享'或'不共享'。"

5. **§11 商业模式 "Block 内部用 Buzz 合并 65% 产品 PR" 已自澄清是 Claude Tag 非 Buzz（现有文档 🟡 已标），需再补"开源版 ≠ 内部版"**——digitalapplied 指出员工用内部预接 build。**修正建议**：§11 加——"Block 内部 dogfooding 真（工程博客自述用 Buzz 写博客 + 写 Buzz），但开源版 ≠ 内部版（员工用预接 Block relay + agent provider 的内部 build）；社区使用的是公开开源版，2454 open issues 反映公开版质量。引用 Block dogfooding 需注明'内部版'。"

### 9.3 现有调研**没捕捉到**、应新增的社区洞察

1. **persona 退役的"第二条警示"——会话协议规则不能塞进角色 prompt**（deepwiki post-mortem，pm-buzz.md 完全没捕捉）——`welcome-kickoff-silent-failures.md` 明确拒绝"在 persona 里修 loop"，理由是"persona 是 character prompts (tone, wordplay)，会话协议规则塞进 persona 是 layering violation"。退役根因不只是"窄角色循环"，而是**base prompt 的回复义务规则自相矛盾**（强制回复每条 user message + 强制 @mention delegator = 没事也互相 ping = runaway loop）。**修正建议**：§12 挑战 1 / §12 核心警示 3 点新增"警示 B：会话协议规则（回复义务、@mention delegator、何时算完成）不能塞进角色 system prompt，要在编排层显式表达；尤其要显式允许'沉默作为成功条件'，否则触发 runaway reply loop（agent 互相 ping 不收敛）+ silent failure（agent 卡窄角色循环不报错）。这是 Buzz post-mortem 的第一手教训。"**对 PRD 的具体启示**：PRD §13.5 "圆桌串行 turn 队列" + §12.3 "CEO 审批"必须显式定义"何时不该回复"——agents-remote 的编排层要有一个"沉默即成功"的状态，不能默认每个 event 都触发 agent turn。

2. **"per-turn spawn 而非常驻 session"是 Buzz 的关键架构取舍**（mager.co 实测发现，pm-buzz.md §10 只淡淡提"serverless warm pool"未点透）——mager.co："buzz-acp spawns the agent per turn rather than keeping a session alive. Mention, spawn, turn, reply. That is not a port of an always-on session with accumulated context — it's a different model, where the channel history is the continuity rather than the process." **修正建议**：§6 "agentmore"讨论加——"Buzz 实战是 per-turn spawn（mention 起 turn，完事归还池），continuity 在 channel history 不在 process。这与 agents-remote 当前 Claude 'Bun.spawn 常驻 CLI + --resume'模型是**反向**取舍——Buzz 选了'进程轻 + 上下文重（回放 history）'，agents-remote 选了'进程重 + 上下文轻（CLI 内 history）'。两者都有 token 成本问题：Buzz 是回放 history 爆炸（31k vs 4k），agents-remote 是长 session 累积爆炸（compact_boundary）。OPC 应明确自己在'per-turn spawn ↔ 常驻 session'光谱的位置。"

3. **Slack 工程师 `muglug` 的 multiplayer agent 数据泄露挑战**（HN 第一手，pm-buzz.md 未捕捉）——`muglug`："Having agents see everything you and your colleagues see is cool. The challenge comes when you want to make certain things private... you end up having to write and maintain complex rulesets." `paxys` 跟进的 transitive membership 问题（agent 在 A+B 两 channel，A 用户问它 B 的事怎么办）。**修正建议**：§12 盲点新增"multiplayer agent 数据泄露是社区首要隐私担忧——Slack 工程师 `muglug`（HN 48995213）亲自下场指出'agent 看所有人 context 很酷但要做 private to certain people 时需复杂规则集'，`paxys` 提出 transitive membership 问题（agent 跨 channel 信息串）。Buzz 用 channel membership 粗粒度应对（SECURITY.md 自承'channel membership is the only access control mechanism'）。**对 OPC 的启示**：OPC 的'圆桌多 agent'模型若让多个 agent 共享同一 channel context，必须前置设计 agent 间的信息边界（哪个 agent 能看哪个 agent 的 in-progress work），不能默认共享——否则踩同坑。"

4. **hills-lab "agent 需要 capability taxonomy 而非 channel membership"**（pm-buzz.md 未捕捉）——hills-lab："A production agent needs separate authority for reading context, proposing a change, executing a workflow, using a secret-bearing tool, approving a step, and publishing a result. Identity and channel membership are necessary, but they are not least privilege." **修正建议**：§12 印证 4（BYOH = ProviderProfile）旁加——"Buzz 的 channel membership 是'粗粒度身份级'权限，社区（hills-lab）指出生产 agent 需'细粒度能力级'权限（读 context / 提 change / 执行 workflow / 调 secret tool / 批准 / 发布 六层独立授权）。OPC 的 `permissionMode` + `approvalPolicy` 应走向 capability taxonomy 而非仅 channel/role membership。"

5. **"bypassPermissions 默认 + author gate 是唯一安全边界"是实战安全告警**（mager.co 实测，pm-buzz.md §4.4 提 PermissionMode 但没点透默认值风险）——mager.co："the harness runs the agent with `permission_mode=bypassPermissions` by default, which is reasonable for an unattended bot but means the inbound author gate is the entire security boundary. Worth knowing before you point one at a real repo." + digitalapplied 引 VISION_AGENT.md："dev MCP server gives an agent a shell at the operator's trust level... Channel membership does not constrain what that shell can do on the host." **修正建议**：§4.4 PermissionMode 节加——"Buzz 默认 `bypassPermissions`（unattended bot 合理但 = author gate 是唯一安全边界）+ dev MCP shell 跑在 operator trust level（channel membership 约束不了 host 权限）。OPC 的 `permissionMode=plan` / `can_use_tool` 审批卡片是正确反向——默认约束、显式放权，而非默认放权 + author gate 兜底。"

### 9.4 对 `multi-agent-orchestration.md` 的连带修正

- **§13.0 三件套独立收敛（Buzz/cf-os/Paperclip）**：现有把 Buzz 列为"三件套独立收敛"第四个——社区走查**强印证**（Buzz 真 has relay 真相源 + per-channel 串行队列 + nest + LlmContextExceeded 上下文管理三件套），但应加注"Buzz 三件套的 cost 叙事被 token 实测戳穿（31k vs 4k）——'收敛'是机制层形态同构，不代表 Buzz 的实现成本可控"。
- **§3.3/§11.1 Buzz 技术视角**：现有引用准确，但应补"Buzz 的 swarm cost 是机制层警示——frontier agent + cheap swarm 模型在 base prompt 注入 + history 回放下 token 爆炸"。
- **§11.1 Buzz 缺点列表**：现有已记"无结构化任务/依赖图/崩溃恢复/审批闭环"——社区走查印证，且补"approval gate 命中即 fail（§9 自列）、rate limiter 仅测试 stub（§9 自列）、send_dm/set_channel_topic 未实现"。

### 9.5 修正优先级（给执行者的清单）

| 优先级 | 文件 | 节 | 改什么 |
|---|---|---|---|
| P0 | pm-buzz.md | §12 挑战 1 / §12 核心警示 | 新增"警示 B：会话协议规则不能塞角色 prompt + 显式允许沉默作为成功条件"（引 welcome-kickoff-silent-failures.md post-mortem 根因 = base prompt 回复义务自相矛盾） |
| P0 | pm-buzz.md | §6 状态哲学 | 补 token 成本校准（greeting 31k vs Claude Code 4k，swarm 乘以 agent 数）+ "per-turn spawn 而非常驻 session"架构取舍（mager.co 实测） |
| P0 | pm-buzz.md | §4.7 approval gate | 加源码级铁证（命中 gate 即 fail，reason "approval gates not yet implemented — see WF-08"） |
| P0 | pm-buzz.md | §6 + §4.6 | 厘清"两个真相源 + 一个不共享"（relay=channel 对话真相；nest=跨 session 产物；不共享单 channel in-flight context），消现有矛盾表述 |
| P1 | pm-buzz.md | §4.4 BYOH | 加社区校准（ACP 契约真 work + Hermes/moltis/opensre 真接入，但 harness glue 层 bug 多：#4923/#4491/#2270） |
| P1 | pm-buzz.md | §11 商业模式 | 加"开源版 ≠ 内部版（员工用内部预接 build）+ 2454 open issues 反映公开版质量" |
| P1 | pm-buzz.md | §12 盲点 | 新增"multiplayer agent 数据泄露是社区首要担忧（Slack 工程师 muglug 亲自下场）+ capability taxonomy 需求（hills-lab 六层授权）" |
| P1 | pm-buzz.md | §4.4 PermissionMode | 加"默认 bypassPermissions + dev MCP shell 跑 operator trust level = author gate 是唯一安全边界"实战告警 |
| P2 | pm-buzz.md | §1 或 §5 | 加"buzz.xyz 与 Grok Bot 赛道不同（Buzz 是 Slack+GitHub 替代品，非 chatbot 竞品）" |
| P2 | pm-buzz.md | §11 | 加"社区对 Jack Dorsey 信任分裂（HN ~20% 评论质疑 vibe-coded 侧项目）" |
| P2 | multi-agent-orchestration.md | §13.0 | 加"Buzz 三件套 cost 叙事被 token 实测戳穿（31k vs 4k）" |
| P2 | pm-buzz.md | §9 或新增 §13 | 加"开源两周声量高上手率也高（与 cf-os 不同），但实战可用性低（Matt Shumer agent 不回话 + 多 issue 实战 bug）" |

## 10. 证据清单

### ✅ 真实社区帖 / 源码直证（带 url + 时间）

1. **HN 主帖 "Jack Dorsey launches Buzz to combine team chat, AI agents and Git hosting"** — 378 pts / 339 评论 — https://news.ycombinator.com/item?id=48995213 — 2026-07-21（`ryanmerket` 提交，Slack 工程师 `muglug` 亲自下场，`paxys`/`jaggederest`/`teach`/`darth_avocado`/`pclowes` 等深度讨论 multiplayer agent 隐私 + Dorsey 信任 + Slack 对照）
2. **HN Show HN 副帖 "Block/buzz: a workspace built for teams of humans and agents"** — 21 pts — https://news.ycombinator.com/item?id=48632977 — 2026-06-22（`tlongwell-block` 作者本人在场答疑，`genericone` 印证 channel-as-memory）
3. **GitHub issue #2270 "[Bug] buzz-acp agents go deaf in threads they've joined unless re-mentioned"** — 9 评论全复现 — https://github.com/block/buzz/issues/2270 — 2026-07-21~08-04（`Ansonhkg` 起，`brocoppler`/`oveddan`/`dmnyc`/`thehawkeye`/`BasRutjes`/`sbscan`/`Voisens` 横跨 macOS/Windows/自托管 + 多 runtime 复现）
4. **GitHub issue #4491 "buzz-acp is not shipped by the installer — every agent fails"** — closed — https://github.com/block/buzz/issues/4491 — 2026-08-03（`Mimo314` Windows 复现）
5. **GitHub issue #4923 "buzz-acp: hermes-agent ACP turns complete successfully but reply never publishes to the channel"** — open — https://github.com/block/buzz/issues/4923 — 2026-08-05（`gvalbuenamdphd-lang`，Buzz Desktop 0.5.5 + hermes-acp v0.20.0）
6. **GitHub repo `block/buzz`** — 26,474 stars / 3,190 forks / 2,454 open issues / 107+ releases / 2026-03-06 创建 / 2026-08-12 活跃 push — https://github.com/block/buzz
7. **Matt Shumer 推文 "I can't seem to get any agents to respond!"** — https://x.com/mattshumer_/status/2082882798612832666 — 2026-07~08（OthersideAI CEO KOL 级负面体验）
8. **Jack Dorsey 启动推文** — https://x.com/jack/status/2079605800998146171 — 2026-07-21（"we're launching BUZZ!... built to reduce our dependency on slack and..."）
9. **Block 工程博客 "Buzz!"（Tyler Longwell）** — https://engineering.block.xyz/blog/buzz — 2026-07-21（dogfooding 第一手："We wrote this post in a Buzz channel with our team and our agents. We wrote Buzz there too." + swarm + git-on-object-storage + owner attestation）
10. **Hermes Agent 官方 ACP 文档（Buzz 集成章节）** — https://github.com/nousresearch/hermes-agent/blob/.../acp.md — 2026-07~08（独立第三方给 Buzz ACP 写 BYOH 教程 = ACP 协议被外部 agent 实际采用的硬证据）
11. **deepwiki `block/buzz` 源码级验证（三轮）** — persona 退役 commit `ea5a0a9b4`（2026-07-22 "Replace built-in personas with Fizz"）+ `welcome-kickoff-silent-failures.md` post-mortem + `RETIRED_PERSONAS` 数组 + `migrate_retired_personas`；ARCHITECTURE.md §9 全部 6 个 verified gaps（rate limiter `AlwaysAllowRateLimiter` 测试 stub / approval gate `finalize_run` reason "approval gates not yet implemented — see WF-08" / send_dm + set_channel_topic NotImplemented / huddle recording / typing REST / sqlx offline cache）；nest 共享边界（共享磁盘 workspace + core memory，不共享对话 context）— https://deepwiki.com/block/buzz
12. **external projects 接入 Buzz** — moltis（github.com/moltis-org/moltis nostr.md）/ opensre（github.com/tracer-cloud/opensre buzz.mdx）/ hermes-ecosystem（github.com/ksimback/hermes-ecosystem）— 2026-07~08（BYOH 真用）

### 🟡 媒体/博客二手（中置信，独立分析）

13. **mager.co "Buzz: what it looks like when agents get equal standing"** — https://www.mager.co/blog/2026-07-24-buzz-explainer/ — 2026-07-23（独立开发者，Mac mini 真机部署 + ACP 实测；关键发现：默认 bypassPermissions + per-turn spawn 而非常驻 session + 文档漂移 mint-token/generate-key + 全局 settings.json 覆盖 harness model 配置）
14. **hills-lab.hr "Block Buzz review: a Nostr workspace for humans and AI agents"** — https://hills-lab.hr/field-notes/block-buzz-ai-agent-workspace-review/ — 2026-07-28（结构化技术评测；关键洞察：channel membership 过粗需 capability taxonomy 六层授权 + audit chain tamper-evident 非 tamper-resistant + hosted 非 E2E）
15. **digitalapplied.com "Buzz Explained: Block's Self-Hosted Agent Workspace"** — https://www.digitalapplied.com/blog/block-buzz-self-hosted-agent-workspace-open-source — 2026-08-08（最详尽；8 控制点 scorecard + Block 开源版≠内部版 + dev MCP shell at operator trust level + README crate map vs ARCHITECTURE.md §9 自相矛盾）
16. **daily.dev "Block's Buzz launched and the agents won't respond"** — https://daily.dev/posts/block-s-buzz-launched-and-the-agents-won-t-respond-but-the-config-nerds-are-already-having-fun-idbdux0le — 2026-08-04（关键数据：token costs brutal，greeting 31k vs Claude Code 4k；Matt Shumer 无法响应；两周 20k stars；"v0.5 product"）
17. **YouTube "Buzz Just Fixed AI Agents... But It Has A Serious Flaw"（Better Stack walkthrough）** — https://www.youtube.com/watch?v=a8tLTd4q-fU — 2026-07~08（31k token 实测原始来源，正文未取但 daily.dev 转述关键数据）
18. **techtimes / yahoo / techstrong / agora-intelligence / 21zerixpm.medium** — 2026-07-22~08（行业媒体纯转述，无独立评论）

### ⚠️ PM 推断（本文件独家，低置信）

19. "Buzz 是 Block 投入真实的非 side project（85 contributors + 107 releases + 工程博客 dogfooding），但开源版 ≠ 内部生产版"——基于 digitalapplied 提示 + repo 数据推断
20. "persona 退役根因 = base prompt 回复义务自相矛盾（强制回复 + 强制 @mention delegator = 没事互相 ping）"——基于 deepwiki 引 welcome-kickoff-silent-failures.md post-mortem 的精确解读
21. "per-turn spawn vs 常驻 session 是 Buzz 与 agents-remote 的反向架构取舍"——基于 mager.co 实测 + agents-remote Claude 模型对照
22. "Buzz 在'per-turn spawn ↔ 常驻 session'光谱选了前者，agents-remote 选了后者，两者都有 token 成本问题但形态不同"——基于现有调研对照的 PM 推断

### 工具与方法

- **firecrawl search/scrape**（主工具，免 key 免费档，本轮 ~12 credits）：搜社区讨论 + 抓独立博客全文（mager.co / hills-lab / digitalapplied）+ Block 工程博客全文 + GitHub issue 列表
- **HN Algolia API**（`curl https://hn.algolia.com/api/v1/items/48995213` python 递归遍历评论）：绕开一切限额/拦截，取主帖 339 评论全文 + Show HN 副帖
- **GitHub REST API**（`/repos/block/buzz` + `/issues/<n>` + `/issues/<n>/comments`）：取 issue 正文/评论 + repo star/issue 计数
- **deepwiki `ask_question`**（三轮）：源码级验证 persona 退役（commit hash + post-mortem 文档名）+ ACP/harness/EventQueue 实现 + ARCHITECTURE.md §9 全部 6 个 gaps + nest 共享边界——**这是 persona 退役警示的不可替代源码背书**
- **firecrawl 拒收 reddit.com + WebFetch 拒收 youtube.com**：r/hermesagent + r/BuzzXYZ 标题确认存在但正文未取得（本文件唯一缺口，对结论影响有限）

---

**走查总结**：Buzz 社区声量极高（HN 378pts/339 评论 + 26k stars + 107 releases），核心身份创新（agent keypair + 签名事件 + Owner Attestation）被三个独立博客一致最高评价、ACP 协议被 Hermes 等外部 agent 真接入——**agents-remote 的两条定位（ACP Nostr 通信媒介参考 + persona 退役反面警示）均被社区证据强印证**，其中 persona 退役获 deepwiki 源码级铁证（commit `ea5a0a9b4` + `welcome-kickoff-silent-failures.md` post-mortem）。但实战可用性被三大问题戳穿：token 开销巨大（greeting 31k vs 4k）、per-channel 串行 + 必须 @mention 让对话"碎"（issue #2270 9 条复现）、6 个能力在 ARCHITECTURE.md §9 自列为 verified gap（approval gate 命中即 fail）。最关键的 P0 修正是补"persona 退役的第二条警示——会话协议规则不能塞角色 prompt + 显式允许沉默作为成功条件"，这是 Buzz post-mortem 的第一手教训，pm-buzz.md 完全没捕捉。
