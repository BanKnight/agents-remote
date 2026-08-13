# Todos.dev 产品调研（PM 视角，深度走查版）

> 调研对象：**todos.dev**（域名 todos.dev，SaaS + 本地 CLI `tds`，闭源）。
> 一句话证据结论：**产品本身极度活跃（changelog 每日滚动、npm 周更、6 周内 47 个 CLI 版本），官网/docs 是信息金矿且极其详尽；但二手社区声量几乎为零——HN 零命中、Reddit 零、Product Hunt 零、英文/中文博客零独立评测，全网唯一独立提及是 2 条 Threads（AI 工具聚合号，非深度评测）。因此正文以官方文档为唯一权威源，§12 社区节如实记录"声量近零"。**
> 证据分级：✅ 官网/官方文档/官方 npm 直证｜ 🟡 二手（第三方 AI 工具库、Threads、HN 评论）｜ ⚠️ PM 推断。
> 调研方法（tvly 已限额，全程绕开）：`curl` 直抓 todos.dev 全页（首页/features/use-cases/pricing/install + docs 26 篇）+ HN Algolia API（多组查询全扫）+ DuckDuckGo/Bing + npm registry + WebSearch（找第三方评测，结果仅命中 Threads 2 条 + 官网自身）+ GitHub org 探测。
> 承接：`./pm-raft.md`（§13.5 对比表的 todos.dev 列此前全是 ⚠️，本次填实值）、`./multi-agent-orchestration.md`（OPC 编排底座）、`../design/multi-agent-prd.md`（本项目 PRD）。
> 前置说明：本文件覆盖并替换旧版（旧版仅 257 行、用 tvly 抓的二手摘要，且夹了一条与官网矛盾的"Product Hunt 300+ upvote / $15/月"幻觉——本次以一手文档全部重写并修正）。

---

## 关键修正（相对旧版薄文档）

| 项 | 旧版（tvly 摘要） | 本次（官网一手 + docs 26 篇直证） | 证据 |
|---|---|---|---|
| 定价 | Pro $29/team/月 | **Pro $19/team/月**（年付 $15.20/月，7 天免费试用），Free $0；2026-08-07 changelog "Pro plan stabilized & quota increase" 才转正 | ✅ pricing 页 + changelog |
| 免费/Pro 配额 | 未给 | Free：5 agent / 1 machine / 2 parallel builds / 1GB / 0 credit；Pro：15 agent / 4 machine / 10 parallel / 20GB / 35,000 credit/月 | ✅ pricing 页 |
| "三层记忆"组成 | ⚠️ 未公开 | **已公开**：Charter（你写，团队分工/优先级的章程）/ Memory（agent 写，每 agent 私有，≤100 条）/ Projects & todos（平台持久化的工作本体）——文档专门一页 `docs/context` 讲三层 | ✅ docs/context |
| 平台执行 | 仅"tds start 本地" | 双路径：**自带机器 `tds start`**（Free 即可）+ **Pro 平台沙箱**（Pro 含一台，跑在 **Cloudflare Sandboxes** 容器，按 awake-hour 扣 credit，idle 10 分钟自动 sleep） | ✅ docs/machines + docs/platform-machines |
| 平台 Git | 未提 | **Todos 自托管 Git**（`git.todos.dev`），不依赖 GitHub，无 PR、fast-forward 直合并，2GB 上限 | ✅ docs/platform-git |
| 团队人数 | "5 成员 = 你 + 4 专家" | 当前是**"你 Captain + N 个 agent"的单人模型**，**不支持邀请真人进团队**（2026-08-09 changelog 主动移除了 invite-member 按钮 + 弃用 human-members 计费行） | ✅ changelog + docs/teams |
| CLI 安装 | 未给版本 | `@todos-dev/cli`，首发 2026-06-30，47 个版本，latest 0.1.46，周下载 ~493、月下载 ~4738 | ✅ npm registry |
| Product Hunt 报道 | $15/月 / 300+ upvote | **不存在**——HN/PH 全网零命中；判定为 tvly 摘要幻觉，已剔除 | ✅ 负证据 |
| 上线时间 | 未给 | npm 首发 2026-06-30 + GitHub org `todosdev` 创建于 2026-06-02 + changelog 最早可考条目 2026-08-06 → **产品约 2026 年 6 月底上线，本调研时点（2026-08-12）约 6 周龄** | ✅ npm + GitHub |

---

## 1. 一句话定位

**todos.dev = 「一句话目标 → Chief 拆活 → 专家 agent 团队 Plan→Build→Review 干到 merge」的 task-driven workspace（任务驱动工作区），执行永远跑在你自己的机器上（或 Pro 含一台平台沙箱）。**

官方 hero 原话（✅ 首页）：_「The agent team that gets things done. Todos gives every agent three layers of memory, and a Chief agent that manages the team for you — assigning work, tracking progress, and reporting results.」_

官方 tagline（✅ meta description）：_「Hand routine, fixed-process work to a team of agents. Teach the team your process once; a round starts with a sentence or reruns on schedule, and the team plans, builds, and reviews it to done, on your own machines with your own models.」_

> **PM 判断（与 Raft 对照）**：和 Raft 一样是「团队范式」（agent 是团队成员不是工具），但 **todos 的协作面是「任务/todos 三阶段流水线」，Raft 的协作面是「IM channel/@mention」**。todos 不卖"agent 之间在 room 里互相聊天"，卖的是「Chief 把你的目标拆成带编号的 todo、按分工派给专家 agent、每个 todo 走 Plan→Build→Review 到 merge」的**交付流水线**。一句话：**Raft 是 agent-native Slack，todos 是 agent-native Trello/Linear + GitHub PR 流水线**。详见 §13。

---

## 2. A. 根本使用场景

**主场景：一个 OPC（一人）想"像指挥一个开发团队一样"把一个产品需求从一句话推到合并上线，自己只动嘴（语音/文字）、只做两道关卡（Confirm plan / Review changes），全程不逐行盯代码。** ✅

一段完整用户旅程（基于官网首页 demo + install 页 + quickstart + docs/chief 还原，全部 ✅）：

1. **一次性 setup**：注册 → onboarding（2026-08-10 changelog 起是"目标 → 团队"无 interview 流程：你输一句话目标，Chief 立刻 staff 你的 agent 团队 + 拆 todos + 报告）。种子会建 1 个 Chief-bound agent + 1 个空 project（platform-hosted repo）。✅
2. **带机器上线**：本地 `npm install -g @todos-dev/cli@latest && tds start`（首次浏览器授权 team；headless 用 `tds start --api-key <key> --team <id>`）；或 Pro 直接用含的那台平台沙箱（Cloudflare Sandboxes 容器，idle 10 分钟睡、有活自动醒）。机器就绪前什么都不跑。✅
3. **连仓库**：project 连 GitHub repo（选 base branch）或让 Todos 自托管一个新 repo（`git.todos.dev/<team>/<repo>`，无 GitHub 账号也能用）。连上后不可改。✅
4. **下目标**：对 Chief 说一句话（首页原例 ✅）：「Build the physics engine from the design doc: gravity, collision resolution, wall-jump edge cases, full coverage. Merge it into develop once review passes.」
5. **Chief 拆活 + 派活 + 立即启动**：Chief 回 _「📋 Todo created and assigned to the backend engineer. I'll keep tracking it.」_，todo `#150` 立即进 Building。若目标大，Chief 出 **Proposal card**（如 _「Split into 3 todos running in parallel.」_ `#151/#152/#153`），你点 accept 才跑——区分"你让它跑就跑"和"它自己建议的要等你批"。✅
6. **Plan 阶段（可选）**：todo 默认 `Plan first`：agent 先读仓库、产 plan 文档，停在 **Confirm** 等你。你在 conversation 里可 Accept（按 Confirm Plan 进入 build）/ Correct（回复让 agent 改 plan）/ Steer mid-turn（agent 工作中插话，下一 turn 起生效）/ Rewind（回到任一历史 round 重来）。也可 `Run now` 跳过 plan 直接进 build。✅
7. **Build 阶段**：agent 在**隔离 git worktree** 实现改 + 跑测试，产出 versioned diff 文档；diff 太大浏览器装不下会说一声而非静默截断。✅
8. **Review 阶段 + AI review**：改完进 **Review**。你可自己看 diff，也可点 **AI review** 让团队里另一个 agent（如 Software architect on opus-4.8）独立审 plan 或 diff——critique 自动回灌 conversation，原 agent 自动 revise（多轮可，每轮 critique 留痕）。reviewer 只读、不决策，Confirm/Done 永远是你的点击。✅
9. **最终 sign-off + 交付**：你点 **Done**（可选 merge 进 base branch）。开 PR 是独立动作（GitHub project 走 `Submit`，Todos-hosted repo 是 fast-forward 直合并）。每轮结论写进 agent memory + 固化成 skill 自动复用。✅
10. **进度由 Chief 主动报**（✅ 首页原例）：_「150 is done. The architect is reviewing the code.」_→ _「The architect raised 2 change requests. The backend engineer is revising.」_→ _「The revision passed re-review and is merged into develop.」_。你不轮询，Chief 在你下次回来 / todo 需要你时才 ping（省 token + 降噪）。✅
11. **离开电脑继续跑**：你去开会/睡觉，团队后台继续。所有 plan/diff/review 都在 web/app 里，手机 PWA 语音记想法、确认 plan、review diff、收 push 通知。✅

**主场景一句话**：用户开 todos.dev 不是"和 agent 聊天"，是**把一支 agent 团队的完整交付流水线（拆活→plan→build→review→merge）装进一个一句话目标的工作区**，自己只当队长在两道关卡拍板。

**支线场景**（官网 use-cases + features + docs/schedules，✅）：
- **例行工作定时重跑**：daily report / regression patrol / content pipeline，给 todo 挂 hourly/daily/weekly/once schedule（指定时区），到点自动 rerun（gate 行为不变，仍要 Confirm/Review）；最多 10 条/team，错过不补。
- **非开发团队模板**：Indie dev（前端 sonnet-5 / 后端 gpt-5.6-sol / QA deepseek-v4-pro / DevOps opus-4.8）、Content production（staff writer / editor / art editor gpt-image-2 / social manager grok-4.5）、Store operations（graphic designer / copywriter / customer support haiku-4.5 / data analyst）、Teaching（curriculum designer opus-4.8 / assessment editor / teaching assistant kimi-k3 / class advisor haiku-4.5）。
- **MCP 外接**：你的 Claude Code/Cursor/VS Code 经 MCP server（`https://todos.dev/api/mcp` + Bearer `tds_` key）读 board、建/改 todo、启停 build、请求独立 review——你的 AI coding 工具能反过来操作 todos 工作区。
- **remote shell**：把一台机器的 shell 开给信任的 agent，让它在你本机跑命令（持久 stateful shell，跨调用保 cwd/env/后台进程）。

---

## 3. B. 解决的痛点

结构化列（症状 + 为什么痛）。每条带证据分级。

| # | 痛点 | 为什么痛 | 证据 |
|---|------|---------|------|
| 1 | **一个人干一个团队的活，切换成本爆炸** | 开发/文案/QA/DevOps 要并行推进，手动一个个 session 管不过来；上下文反复切换。Chief + 专家团队把"一个人"扩成"一个团队按分工并行" | ✅ |
| 2 | **从想法到代码落地隔太多手工步骤** | 写需求/拆任务/找工具/写测试/开 PR 全要人做。todos 把"一句话目标 → merge"整条链自动化 | ✅ |
| 3 | **多 agent 黑盒跑，最后才知道出问题** | agent 自己闷头干，没人汇报。**todo 永远在 9 个 phase 之一**（To Do/Queued/Planning/Confirm/Building/Review/Done/Failed/Closed）+ Chief 主动回报，列表一眼看出谁在跑谁等你 | ✅ |
| 4 | **agent 一把梭不分 plan/build** | 直接让它改代码，方案错了改到一半才返工。**Plan-first 默认**：先产 plan 停 Confirm，确认了才动代码；plan 有版本，可回退 | ✅ |
| 5 | **agent 自写自审自合缺把关** | 没人在中间拍板，错一路到 merge。**两道关卡（Confirm/Review）+ AI review（另一个 agent 独立审）+ 最终 Done 你的点击** | ✅ |
| 6 | **上下文每次从头讲** | agent 记不住你上次偏好（release notes 用 list、plan 一页、regression 先查 fixture）。**三层 memory**：Charter（章程）+ 每 agent 私有 memory（≤100 条）+ skill（团队共享技能）自动复用 | ✅ |
| 7 | **一刀切一个模型：难的做不好、简单的浪费钱** | 高能力模型烧钱、轻模型不够用。**每角色绑 model + thinking level**，难活用 opus-4.8、简单活用 haiku-4.5 / deepseek-v4-pro，"every model finds a place on the team" | ✅ |
| 8 | **云端 agent 沙箱不可控** | cloud coding agents 在 vendor 沙箱跑，速度/并行/数据都在别人手里。**执行跑你自己机器**（`tds start`），代码/凭证不出本机；或 Pro 平台沙箱（Cloudflare Sandboxes，睡眠不计费） | ✅ |
| 9 | **API key 一旦进 agent 视野就流经 LLM provider** | 凭证泄漏不可追溯。**team secrets 只入 shell 环境变量、不入 prompt、不入 conversation、不入 transcript**，write-only（保存后任何人不能再看明文，只能覆盖/删） | ✅ |
| 10 | **agent 说"做完了"但看不出做了什么** | 交付物黑盒。**Live preview**：每个 HTML/MD/SVG/图片可即时浏览/预览/下载，文件按目录展示带大小；**Changes** 是 GitHub 式 per-file diff（expand/collapse/line stats） | ✅ |
| 11 | **多模型混跑成本不可见** | 月底才知道烧了多少。**token usage 按 model itemize**（Input/Output/Cache read/Cache write），每 build 一行成本估算 | ✅ |
| 12 | **例行工作每周重复人工** | daily upkeep/定期报告/内容 pipeline 天天手动跑。**schedule**（hourly/daily/weekly/once）+ 自然语言"every morning at eight" 教一次定时重跑 | ✅ |
| 13 | **离开电脑就失联** | 进度/确认/审批都在桌面。**PWA 手机**：语音记想法（说一句话变 todo）、看进度、确认 plan、review diff、收决策到期 push | ✅ |
| 14 | **agent 跑别家 provider 时国内访问/代理难配** | providers 配在你账号，机器每跑一个 task 才拿一次 credential。**provider 凭证服务端加密存、task 派发时按需下发到机器内存、机器不持久化**；subscription（ChatGPT/Codex/Copilot）服务端代刷 | ✅ |
| 15 | **多个 AI coding 工具（Claude Code/Cursor）想反控工作流** | 各工具各管各。**Todos 暴露 MCP server**，外部 client 经 Bearer key 反向读 board、建 todo、启 build、请 review，每 key 精确勾选工具权限 | ✅ |
| 16 | **不想绑死 GitHub** | 没 GitHub 账号/不想装 app/不想走浏览器 round-trip。**Todos-hosted repo**（`git.todos.dev`）无 PR、fast-forward 直合并、API key read/write scope 控制 clone/push | ✅ |
| 17 | **对话越长越乱，想回到某个干净点重来** | agent 跑歪了，argue 回去比重来还慢。**Conversation rewind**：回到任一历史 round，**远端 worktree + model session 物理还原**到那个点，memory 不丢 | ✅ |
| 18 | **agent 遇到选择就瞎猜** | 没人拍板就乱来。**Structured question card**：agent 停下来抛带选项 + Other 的问卡，你选完 run 接着走 | ✅ |

---

## 4. C. Feature list（按维度穷尽，重点章节）

> 按官网（首页/features/use-cases/pricing/install）+ docs 26 篇全列，一条一行：功能名 + 一句话。证据除标 🟡/⚠️ 外均为 ✅（官网/docs 直证）。本次相比旧版补全大量 docs 级细节（remote shell / MCP / API keys / platform-git / platform-machines / secrets / permissions / schedules / inbox 等旧版没有的整块能力）。

### 4.1 工作台 / 任务面
1. **Team**：顶层容器，members/agents/machines/projects/providers/secrets/skills 全 team-scoped，**billing per team 不 per seat**。✅
2. **多 team**：一人挂多个 team 切换，每 team 独立 Chief + charter + work 视图；**每账号最多 3 个 free team**。✅
3. **Project**：= 一个 git repo + 在其中进行的工作；连 GitHub repo 或 Todos-hosted repo + 一个 base branch；连接后永久不可改。✅
4. **Todos（任务实体）**：最小工作单元，带 # 编号（team 内顺序）+ 9 phase 状态机 + 一个 owner（永远是人）+ tags + 指派的 agent；你/Chief/agent 都能建 todo。✅
5. **9-phase 状态机**：To Do / Queued / Planning / Confirm / Building / Review / Done / Failed / Closed——todo 永远在且只在一个 phase。✅
6. **两道关卡（Confirm / Review）**：todo 只在 plan 写完、build 做完两处等人，其他地方不等人；两处都可叫 AI review 先审。✅
7. **并行 builds**：todos 并行跑，每个占一个 parallel slot（Queued/Planning/Building 时占），到 Confirm/Review/终态释放；plan 设上限（Free 2 / Pro 10）。Chief turn 也占一个 slot。✅
8. **Rerun + Run history**：Done/Failed/Closed 都不是终态，任何 todo 可 rerun 为新 build，旧 run 留历史；每 run 各保自己的 conversation/plan/diff + token 用量。✅
9. **Tags**：project 内分组 todo，可建/筛/管（删 tag 同时从所有 todo 移除）。✅
10. **Ownership + 通知路由**：todo 永远有一个 person owner（建 todo 的人，或 Chief/agent 建的回填给人），owner 收该 todo 的所有通知。✅
11. **Files 浏览器**：project page 文件夹图标，浏览任意 branch 的文件（picker 标 todo 编号+标题），单文件下载，URL 带 ref+path 可分享；上传/删文件落地为该 branch 的 commit（你是作者，≤50MB）。✅
12. **Live preview**：HTML/MD/SVG/图片在 file browser / Changes 里即时渲染；HTML 预览解析相对路径（本地 CSS/JS/图片正确渲染）。✅
13. **Schedule（定时重跑）**：todo 挂 hourly/daily/weekly/once 规则（指定时区，跨 DST 稳）；到点 rerun 为 fresh build，gate 行为不变；**每 team ≤10 条规则**，错过不补；once 规则每分钟重试直到真正启动。✅
14. **Inbox**：所有"等你"事件聚合（Plan ready / Build finished / Build failed / Agent note / Assigned to you）。✅
15. **Notifications**：browser push（tab 在后台）+ phone push（每设备独立开）；iPhone/iPad 必须 Add to Home Screen 才能收。✅

### 4.2 Chief agent（编排层）
16. **每 team 一个 Chief**：唯一入口的"standing conversation"，覆盖你所有 project；你只跟它对话。✅
17. **Chief 不写代码**：它只做 judgement——priorities / routing / keeping you current；真正写代码是它派出去的 agent。**Chief 无自己的 repo 访问**，工作留在每个 agent 的 build 里。✅
18. **Charter（章程）**：你写的 standing instructions（每个 agent 负责什么、怎么排序、怎么路由）；Chief 每 turn 读、**且不可改 charter**——这个分离是故意的（Chief 会 wholesale 重写自己 memory，共享 store 会让它覆盖你的规则）。✅
19. **Chief memory**：路由偏好/教训落在它运行所在的那个 agent 上，每 turn 读、可重写。✅
20. **Chief 派活两种模式**：① **你让它跑就跑**（conversation 里让它 run 立即启 builds）② **它建议的要等 accept**（Chief 自己决定的活到 Proposal card，你点了才跑）。✅
21. **Chief 锐化 todo**：派活前先把 todo 写清——goal / boundaries / what done looks like；缺信息先问你而不是猜。✅
22. **Chief 不主动 ping**：不自己醒来 ping 你，而是"下次你说话时报告"——省 token + 降噪；例外是 watch（你让它盯某个 todo）和 schedule。✅
23. **catch-up on return**：你回来时它主动报告"What moved since you last talked"（去 review 的、完成的、卡住的）。✅
24. **watch a todo**：你让 Chief 盯一个 todo，它在 todo 需要你/完成/失败/关闭时回来。✅
25. **自然语言 schedule**："every morning at eight" / "publish tonight at 20:00"——Chief 当场设规则并回执；只对你明确要求的设 schedule，它自己想的先成 suggestion。✅
26. **Chief 能造/改 agent**："add a frontend agent on a fast model and give it our design skill"——Chief 建 agent、设 model、attach skill。✅
27. **Chief 能授日常工具**：push/merge branch、tag release、写 skill——能授。✅
28. **Chief 永不能授两样**：**remote shell（你的机器）+ team secrets（你的凭证）**——只能人（team admin）自己开；Chief 觉得需要会告诉你"去哪里开"。✅
29. **Chief 走 act-as-you**：Chief 只能做你能做的事；member 让 Chief 干 admin-only 的事会同样失败。✅
30. **Chief confirm-card delete**：Chief 能提案删 skill/todo/agent，走 danger 样式 confirm card，每项决策时重新鉴权（避免 stale 权限卡死批次）。✅
31. **Chief 时区感知 + report-back 纪律**（2026-08-12 changelog）：收你设备时区、context 里有当前时间线、完成任务要闭环确认而非留 open-ended。✅
32. **Chief set_wake**（2026-08-12 changelog）：平台外跟进的工作可设一次性定时 check-in，wake 时带完整 context 知道该验证什么。✅
33. **Chief 不醒自己来 ping**：只在你下次交互时报告——省 token + 降噪。✅

### 4.3 Agents（执行成员）
34. **Agent = team member**：有 name + model/thinking level + role description + tools + skills + memory，不是 tool。✅
35. **Agent 不绑机器**：有活时 build 跑在 team 任何在线且空闲的机器上；agent 不持机器。✅
36. **建 agent 两路**：① 让 Chief 建 ② team 设置 Members tab 自己加；都能在 agent 页填其余。✅
37. **Agent carries 5 件东西**：Role（每 todo 开头读，保持 in character）/ Model（model + thinking level，不同 agent 跑不同模型）/ Tools（日常 build 工具常开，重的 per-agent switch）/ Skills（默认带的技能，每 todo 都跟）/ Memory（自己工作时记的笔记）。✅
38. **Agent 默认能力**：每个 agent 一开始就能 read/edit 文件、在 build 内 run 命令、读 team todos、问你问题、notify 你。✅
39. **Per-agent 工具开关（off 默认）**：Push branch / Merge branch / Create tag / Create skill / Update skill——team admin 或 Chief 可授。✅
40. **Remote shell + Team secrets 是硬隔离**：只能 team admin 人手开，**Chief 永远不能授**。✅
41. **Agent works through todos as conversation**：plans → you confirm → makes changes → you review。✅
42. **Agent 可 review 队友工作**：任何 agent 可读另一 agent 的 plan/diff 写独立 critique（AI review）。✅
43. **Agent remembers what it learns**：project conventions、要 redo 的错、你纠正的偏好——写进自己的 memory。✅
44. **Agent writes down what worked**：被允许时可把验证过的方法存成团队 skill。✅
45. **Agent removing**：移除后不再接活，memory 留存但不再用。✅
46. **Agent avatar 自定义**（2026-08-07 changelog）：face picker 预设网格 / 传照片 / 重置。✅

### 4.4 Plan / Build / Review 三阶段流水线
47. **Plan first（默认）vs Run now**：每个 todo 启动时选——Plan first 走 Confirm 关卡，Run now 跳过 plan 直接 Building。✅
48. **Plan = versioned document**：plan 是挂在 build 上的版本化文档，不是滚走的消息；每改一版是新版本，版本 picker 留历史，可看 round 间改了啥。✅
49. **Confirm gate**：plan 写完停在 Confirm，你 Accept（Confirm Plan 进 build）/ Correct（回复让 agent 改）。✅
50. **Build = 隔离 git worktree**：每 build 自己 branch、自己 worktree，不污染主工作区。✅
51. **Changes = GitHub 式 per-file diff**：expand/collapse/line stats；不变的段落折叠，逐段展开或全展开；HTML/图片等可渲染的文件源码旁带预览；太大显示不了会说一声而非静默截断（去 todo branch 的 Files 页读全文）。✅
52. **Review gate**：build 完成进 Review，主按钮 Done（可选 merge 进 base branch）。✅
53. **AI review（独立 agent 审）**：Review（或 Confirm）时点 AI review 选另一个 agent + 可加 focus note（或让 Chief 派 "have Luna review this todo"）；reviewer 只读 plan+code+diff，critique 以自己名字发进 conversation，原 agent 自动 revise；可多轮（每轮 critique 留痕）；reviewer 不决策。✅
54. **AI review context carry-forward**（2026-08-09 changelog）：重复 review 轮不再从零开始，注入上轮 critique + producer 的 evidenced revision reply，从 discovery 转 convergence（先验上轮 blocking 点，再审 revision 改了啥）；~10% 轮换不同 reviewer 保广度；circuit-breaker 告诉 Chief 下一步。✅
55. **4 类 versioned document**：Plan / Changes / Proposal（Chief 建议的 card）/ Question（agent 要你答的结构化问卡）——全部同版本机制、全部可在 conversation 里被 mention 就地打开。✅
56. **Conversation rewind**：从任一消息回退，后续 turn 删除，**远端 worktree + model session 物理还原**到那个点；turn in flight 时阻止 rewind；**memory 不丢**。✅
57. **Steer mid-turn**：agent 工作时 composer 保持开，你插的话排队、下 turn 开头送达，送达前可编辑/撤回——比等 turn 完成早一 turn 纠偏。✅
58. **Structured question card**：agent 要决策时停下来抛带选项 + Other 的问卡；你选完 run 接着走；run 走开了问卡显示 no longer awaiting；问卡走过会自动折叠成一行摘要。✅
59. **Mentions（4 类）**：`@` agent / member、`/` skill、`#` todo / project、`~` machine——插入真实 reference（不是纯文本），agent 解析而非猜。✅
60. **Images + 附件**：粘贴/附加图片，发送前可标注（画/箭头/矩形/裁剪 + undo/redo）；agent 产出的图片可下载/复制；附件有大小 + 单消息数量上限，不支持的类型明确拒绝。✅
61. **Voice 输入**：dictate 进 chat 和 todo editor；手机上说一句话变 todo（这是手机派活可行的核心）。✅
62. **Cut turns 可见**（2026-08-12 changelog）：未完成就被终止的 turn 在气泡里独立显示并上报 Chief，不再静默丢。✅
63. **Abnormal stop reasons 记录**（2026-08-12 changelog）：timeout/cancellation/token 耗尽 等非完成原因记在 run 和 message 上，每个非完成可追溯。✅

### 4.5 Runtime / Model Providers
64. **多 provider 直连**：OpenAI / DeepSeek / Google / xAI / OpenRouter / Anthropic / Ollama / 任何 OpenAI-compatible 端点（base URL `/v1` + 手填 model id）。✅
65. **API key 或 subscription**：API key 直填（先发一个真 model 请求验证）；或连 ChatGPT/Codex / GitHub Copilot subscription（无 API key，server 代刷登录）；xAI 二选一。✅
66. **每 agent 自选 provider/model/thinking level**：一个 team 自由混 Anthropic/OpenAI/DeepSeek/Grok/本地。✅
67. **凭证服务端加密存**（dedicated master key，at-rest 加密），任何 page/API 保存后永远不返回明文，编辑永远从空 key 字段开始。✅
68. **凭证按需下发**：机器只在 pick up task 那一刻拿到该 task 用的那一个 credential，仅内存持有，下个 task 重新拿；机器从不持久化 credential——改/删 provider 立即生效，无需 cache expire / sync / per-machine setup。✅
69. **每机器能跑 catalog 里所有 model**：加 provider 几秒内 model 出现在 picker；删 provider 它的 model 离开 picker，仍指派它的 task 失败并指回此页。✅
70. **Platform-paid inference（Pro）**：Pro 含 built-in models，与平台机器时间共用 credit pool，按平台实际成本计费无 markup（只加支付处理费）。✅
71. **700+ models**：GPT/Claude/DeepSeek/本地等（首页 FAQ 文案）。✅（具体清单未公开 catalog，⚠️）

### 4.6 Machines / 执行
72. **自带机器 `tds start`**：`npm install -g @todos-dev/cli@latest`（需 Node.js 22.19+）+ `tds start`；首次浏览器授权 team，headless 用 `--api-key <key> --team <id>`。✅
73. **tds CLI 命令**：start / stop / restart / logs / status / logout / version；start 支持 `--foreground/-f`（已有 pm2/systemd/container 托管时）、`--name`、`--server`、`--workspaces-dir`（持久化，可把重 checkout 放外置盘）。✅
74. **每机器两开关**：**Builds**（是否接 build/plan/review task）+ **Remote shell**（是否允许被授的 agent 跑命令）；两开关独立，running daemon 几秒内 pickup 无需重启。✅
75. **每机器并发上限**：自己设（≥1 整数），与 team parallel cap 叠加（run 要两边都有空位）。✅
76. **机器离线 10 分钟**：in-flight run 判 failed（不留 hanging）；10 分钟内回来自动恢复不丢。✅
77. **Remove machine / tds logout**：admin remove = deauthorize（要重 enroll 才回来）；`tds logout` 只清本地注册，不删 team 那边的记录。✅
78. **CLI 过期保护**：低于最低版本的机器收不到 website 配的 model credential、收不到 team secret；page 出 update available badge。✅
79. **磁盘文件**：`~/.tds/machine.json`（注册，mode 600）/ `~/.tds/device.json`（硬件指纹，logout 时留以重 enroll 复用）/ `~/.tds/daemon.log`（>10MB 轮转）/ `~/.tds/workspaces/`（clone 的 repo 和 worktree，除非 `--workspaces-dir` 移走）。✅
80. **环境变量**：TDS_SERVER / TDS_API_KEY / TDS_TEAM / TDS_WORKSPACES_DIR；HTTP_PROXY/HTTPS_PROXY + macOS 系统代理都认。✅
81. **Platform machine（Pro）**：Todos 替你跑的容器（**Cloudflare Sandboxes**），无需自己开电脑/装东西，idle 睡、有活自动醒，按 awake-hour 扣 credit；每 team 一台（Pro 含），三种 size（Small 1vCPU/6GiB/12GB/3 并发/340 credit/hr；Medium 2/8/16/5/490；Large 4/12/20/8/785）。✅
82. **Platform machine lease-based 保活**（2026-08-10 changelog）：不再用 keepAlive lock，每个 step claim + heartbeat 把 sleep deadline 推一个 idle 窗口——活干完 deadline 到期 = 睡；修了并发 step 互相把对方的 lock 提前 drop 的 bug。✅
83. **Platform machine disk ephemeral**：sleep 即毁、wake 从备份恢复；**agent 输出应落 todo branch 而非机器磁盘**。✅
84. **Platform machine 不能 remote shell**：无 sync tunnel；要 remote shell 用自带机器。✅
85. **Platform machine resize**：换 size "Save applies on next wake"（免费不打断）或 "Restart now"（~1 分钟，build 运行时拒绝）；workspace 换 size 前备份后恢复不丢。✅

### 4.7 记忆 / 上下文（三层架构，重点）
86. **三层 persistence（明确文档化）**：① **Charter**（你写，团队分工/优先级章程，Chief 每 turn 读且不可改）② **Memory**（每 agent 自己写，私有，save_memory/delete_memory 工具，scoped 到 team 或某 project）③ **Projects & todos**（平台持久化的工作本体：identity/spec/state/assignment/history/artifacts/schedules）——前两层注入 prompt，第三层按需读不进 prompt。✅
87. **Charter = 宪法**：Chief reads every turn，cannot edit——分离是关键（防 Chief 重写自己 memory 时覆盖你的规则）。在 Chief 设置里改。✅
88. **Memory = notebook**：每 agent 自己记（convention/correction/preference），每条要么 team-wide 要么 scoped 到一个 project；**agent 间不互读 memory**；team-wide 该知道的事 → skill。✅
89. **Memory bounded**：每条几句、每 agent ≤100 条，到顶必须 consolidate 或删才能存更多；期望 rewrite 既有条目而非堆 near-duplicate。✅
90. **Memory survives rewind / session reset**：跟 agent 跨 todo/build/conversation，跨 session reset 和 rewind 都活。✅
91. **Memory 是 agent 自己的 experience**：人 audit/correct/delete，**但人不能 author**（admin 不能手写新条目）；要给 standing instruction 用 role description 或 skill。✅
92. **Memory cost**：每 task 注入 prompt，所以大 memory 加 token；cap 保证 bounded（满 memory 也就几 K token/task）。✅
93. **Memory 与 conversation 解耦**：conversation 是第四样东西但**不是 persistence layer**——它满了 compact、可整体 reset，安全正是因为上面三层活下来；reset 跑偏的 conversation 只丢 thread 不丢 context。✅
94. **Skill（团队共享技能）**：folder + SKILL.md（教 reusable workflow 的 prose）+ 附属 reference 文件（template/checklist/example）；skill 属于 team，写一次全员可用；无 SKILL.md 的 skill 不能用且明说。✅
95. **Skill 三种加法**：① web app 内建 ② 从 GitHub import（给 repo URL，扫 skill 或直链 skill folder；私有 repo 不行；>1MB 单文件不行）③ 从磁盘 import folder（也在 web app 里）。✅
96. **Skill 给 agent 两种**：① 默认带（agent 页勾 defaults，每 todo 都带）② conversation 里 mention（不强制成默认）。✅
97. **Agent 写 skill 两开关**：Create skill / Update skill，默认 off，admin 或 Chief 授；授了后 agent 把验证过的方法存给全员。✅
98. **Delete skill 不可撤销**：带的 agent 下个 turn 起停带。✅
99. **Charter + memory 协同（how a preference travels）**：你告诉 Chief"PRD 里 user story 用 Gherkin"——Chief 立刻存 memory，以后每次派 PRD 活：charter 告诉它谁写 PRD、memory 告诉它格式、它把约束写进 todo spec；改主意时 Chief 覆盖既有条目而非加第二条（cap 就是为此逼 curation）。✅
100. **每 turn 怎么用三层**：turn 起 charter 注入（带 roles/priorities）→ 决策前 pull 当前 board + 查 memory 学过啥 → 学到新东西立刻存（不等 conversation 结束）→ 查进度直接读 build conversation 全文（含 in-progress turn）而非猜。✅

### 4.8 审批 / 介入
101. **两道关卡**：Confirm（plan 后）/ Review（changes 后）——todo 只在此两处等人，别处不等人。✅
102. **AI review**（见 #53）：关卡处可叫另一 agent 先审。✅
103. **Final sign-off 永远是人的点击**：Done 是你的点击（可选 merge）。✅
104. **Confirm-card delete**：Chief 提案删 skill/todo/agent 走 danger 样式 confirm card，决策时重新鉴权。✅
105. **Structured question**（见 #58）：agent 要决策时停抛问卡。✅
106. **Steer mid-turn / Rewind**（见 #57/#56）：早纠偏 / 回退重来。✅
107. **Inbox + Notifications**（见 #14/#15）：所有"等你"事件聚合 + push。✅
108. **Schedule rules follow ownership**（见 #13）：只 owner 能加/改/删 schedule（standing commitment 花 build quota）。✅

### 4.9 安全 / 凭证 / 权限
109. **Team secrets**：命名的 credential（API key/token/service password），存一次、授给需要的 agent、以环境变量出现在那些 agent 跑的每个 shell 命令里。✅
110. **Secrets write-only**：保存后任何人（含 admin）不能再看明文，只能覆盖/删；原始值留你自己的 password manager。✅
111. **Secret 不进 prompt/conversation/transcript**：直接 inject 到 shell process；agent 被告知有哪些变量名 + description（不知道值）；agent 被指令别 print secret 值，但 echo 它的 shell 命令仍会在 tool output 里显示——只授给信任的 agent。✅
112. **Secret per-agent 授权**：不自动流到每个 agent；agent 页开 Team secrets 才从下个 turn 起拿到所有 secret；只能 team admin 人手开（Chief 永不能）。✅
113. **Secret 紧 scoping**：per agent 不 per task——要紧 scoping 就授给一个专用 agent + 只给它需要该 credential 的活。✅
114. **Permissions 四处**：① agent tools（per-agent switch）② machine switches ③ people role（admin/member）④ API key scopes。✅
115. **People role**：admin 能配 providers/secrets/machine 开关/connect repo/remove agent；member 只读这些 + 用 board/file/confirm/review。✅
116. **Remote shell 双开关**：agent grant + machine shell 开关，两个都开才行；agent 的 grant 是 team-wide，要收窄就关掉不该触达的机器的 shell 开关。✅
117. **Remote shell 行为**：持久 stateful shell（cwd/env/后台进程 跨调用保，只要机器在线）；连接断了 shell 死、下次重开有 reconnect note；命令从 home 目录起，agent 能去你 user 能去的任何地方；只授信得过的 agent；dev server 等长跑进程 OK，跨调用活着。✅
118. **API keys per person**：人持有的 key（机器 enroll / MCP client / 本地 git clone 用）；两独立 access：MCP（read/write 工具组勾选）+ git（read=clone/fetch/pull，write=push+含 read），都默认 off。✅
119. **API key ≤ owner 权限**：key 从不超其 owner 自己的权限。✅
120. **Revoke**：立即失效 MCP + git；**已 enroll 的机器不受影响**（enroll 时换成了机器自己的 token，要下线机器去 team page remove）。✅

### 4.10 集成 / 扩展
121. **MCP server**：`https://todos.dev/api/mcp` + Bearer `tds_` key；Claude Code/Cursor/VS Code 连上后能 read workspace（list todos、读 todo 全文、看可用 agent、读附件）/ read progress（读 build conversation 含 in-progress turn）/ organize（建/改 todo title/spec/tags）/ run（启停 build、请独立 review）/ manage lifecycle（mark done/close/reopen）。✅
122. **MCP key 精确勾工具**：每 key 精确选工具组，给最少够用的 access；改 key 工具选作用于后续请求，删光 MCP 工具 = 禁用 MCP（不影响机器自己 token）。✅
123. **GitHub 集成**：连 GitHub account/org（装 app，授权回浏览器所以 web app 干），搜 repo 选 base branch；一个 account/org 同时只能属一个 Todos team。✅
124. **Branches + PR**：每 build 自己 branch；branch icon 开 Branch/PR 面板看状态（ready to submit / PR available / merged / changes on branch / no branch changes）；开 PR ≠ 完成 todo；Done 可选 merge 进 default branch。✅
125. **Todos-hosted Git**（见 #16）：`git.todos.dev`，无 PR、agent turn reconcile 冲突后 base branch fast-forward；缺 merge_branch/create_tag/Actions；2GB 上限。✅
126. **Self-hosted server**：平台机器文档明说 _"A self-hosted Todos server with no sandbox backend configured never shows the platform-machine option"_——隐含 todos.dev 可自托管（⚠️ 但未在公开 docs 找到自托管 setup，是文档透露的边界事实）。✅(存在)⚠️(细节)

### 4.11 移动端 / 多端
127. **PWA web app（无 app store）**：iPhone/iPad（Safari Share Add to Home Screen）/ Android（浏览器菜单 Install）/ Desktop（地址栏 install icon）；版本永远跟线上一致。✅
128. **扫码登录**：已登录设备开 scanner 扫码，另一设备免键盘登录。✅
129. **Voice dictate**（见 #61）：手机说一句话变 todo。✅
130. **push 通知**：每设备独立开；iPhone/iPad 必须 Add to Home Screen 才能收。✅
131. **手机不是阉割版**：plan/diff/PR/machines/agents/team 全在；web-only 三样：加 GitHub account/org、建 skill（含 import folder）、billing。✅

### 4.12 观察 / 审计 / 成本
132. **Token usage 按 model itemize**：每 build 一行（model × token 数 × $）；Input/Output/Cache read/Cache write 拆开；总 estimated $；example：1.23M tokens / ~$2.37。✅
133. **Plan versions**：plan 每版保留，可切回任一旧版。✅
134. **Run history**：每 build 留记录，一键 rerun 或复用 plan 直接 confirm。✅
135. **Full audit trail**：人动作和 agent 改动分别记录在两条可追溯 track。✅
136. **Storage 计量**：attachments/build session records/code diffs/skill files/project icon/agent avatar + Todos-hosted repo 磁盘大小都算；GitHub repo 不算。✅

### 4.13 商业 / 团队
137. **Free $0/月**（solo forever free）：5 agent / 1 machine / 2 parallel builds / 1GB / 0 credit；无 platform machine / 无 platform repo / 无 built-in model。✅
138. **Pro $19/月 per team**（年付 $15.20/月，7 天 card-required free trial，trial 内额度降低：$2/10,000-credit pool、DeepSeek-only、5 parallel、2 machine、5 agent）：15 agent / 4 machine（含 1 台 platform）/ 10 parallel / 20GB / 35,000 credit/月 + platform machine + platform repo + built-in models。✅
139. **flat per team，无 per-seat、无 usage bill**：你直付 provider（API key 或 subscription），inference 从不被平台 meter 或 markup；机器时间和 platform-paid inference 共用 credit pool；只加支付处理费。✅
140. **Credit top-up**（2026-08-06+ changelog）：Pro team 可 top-up credit，credit 用量面板显示 pool 分配明细。✅
141. **不邀请真人进 team**：当前形态 = 你 Captain + agent 团队；2026-08-09 changelog 主动移除 invite-member 按钮/弹窗 + 弃用 human-members 计费行 + FAQ/docs/interface 对齐"solo + agents"。✅
142. **每账号最多 3 个 free team**；Pro 按 team 算，要几个升几个。✅
143. **取消不立即丢数据**：cancel 后 Pro 活到本计费期结束再回 Free；超 Free 限额的数据留 15 天不删。✅

---

## 5. 核心概念（docs/concepts 直证）

- **Team**：顶层容器（≈ Slack workspace / Linear team）。members/agents/machines/projects/providers/secrets/skills 全 team-scoped，billing per team 不 per seat。每 team 独立 Chief + charter + work 视图。✅
- **Project**：= 一个 git repo + 在其中的工作；连 GitHub repo 或 Todos-hosted repo + 一个 base branch，连接后永久不可改；todo 属于 project，agent/machine 属于 team 跨 project 自由移动。✅
- **Todo**：最小工作单元；一段与 agent 的 conversation（不是 queue 里的 ticket）；带 title/description/owner/tags/指派 agent；永远在且只在一个 phase。✅
- **Phase（9 态）**：To Do / Queued / Planning / Confirm / Building / Review / Done / Failed / Closed。**Confirm 和 Review 是两处等人**。✅
- **Chief**：一个 team 一个；standing conversation 覆盖所有 project；groom todo、决定跑什么谁跑、派活；**无自己 repo 访问**，只贡献 judgement；靠它运行所在的 agent 拿 model；读 charter + 自己 memory 每 turn；不写代码。✅
- **Charter**：你写的 standing instructions（章程）——团队分工、优先级、路由；Chief 每 turn 读、不可改。✅
- **Agent**：team member；有 role/model+thinking level/tools/skills/memory；不绑机器；并行跑各自的 todo。✅
- **Build & Run**：build = agent 干一个 todo；run = 一次尝试，一个 todo 可多 run（plan run / build run / rerun）；run 在隔离 git worktree 跑。✅
- **Machine**：run 跑的地方；自带机器（`tds start`）或 platform machine（Pro）；**machine claim run，agent 不持机器**；每机器自己并发上限 + builds/shell 两开关。✅
- **Skill**：team-shared 可复用方法（folder + SKILL.md），区别于私有 memory。✅
- **Memory**：每 agent 私有的工作笔记（≤100 条），区别于 team-shared skill；agent 间不互读。✅
- **Document（4 类 versioned）**：Plan（agent 打算干啥）/ Changes（diff）/ Proposal（Chief 建议）/ Question（agent 要你答）——全 versioned、全可在 conversation mention 就地打开。✅
- **Captain**：你在每个 team 里的身份（建 team 的人）。✅
- **tds**：CLI（`@todos-dev/cli`），唯一本地装的东西；board/conversation/review 在浏览器/app。✅

---

## 6. 状态哲学（重点章节）

> todos.dev 的状态模型在 docs/context 一页里被**显式文档化**为一套三层 architecture——这是相比 Raft（状态哲学散在博客里要 PM 自己拼）的一个文档级清晰点。核心洞察：**状态焊在 todo/team 名册/agent memory/charter/thread 五样东西上——唯独不焊在执行机器上**。换机器（executor）不丢任何状态。

### 6.1 三层 persistence（文档直证的 architecture）

| 层 | 内容 | 谁写 | 生命周期 | 注入策略 |
|---|---|---|---|---|
| **Charter**（章程） | team roles / division of work / standing priorities | **你写**，Chief 读且不可改 | 持久 | 每个 Chief turn **注入 prompt** |
| **Memory**（记忆） | preferences / lessons learned / conventions | **agent 写**（save_memory / delete_memory）| 持久，跨 todo/build/conversation/rewind/session reset | 注入 prompt，scoped 到 team 或某 project |
| **Projects & todos**（工作本体） | title / spec / tags / phase / assignment / build history / artifacts / schedules | 平台 + agent（经工具）| 持久 | **按需读，不进 prompt**（progress 是 looked up 不是 remembered）|

官方原话（docs/context，✅）：_「the charter is a constitution that is never forgotten, memory is the notebook kept while working, and projects and todos are the filing cabinet the platform keeps for you.」_

Conversation 是**第四样东西但不是 persistence layer**——它满了 compact、可整体 reset；安全正是因为上面三层活下来。官方原话：_「Resetting a conversation that has gone off track costs you the thread, not the context.」_ ✅

### 6.2 与 Raft 三层 / 我们三层模型的对照

- 我们的「同事」≈ todos 的 agent（有 role/model/tools/skills/memory）。
- 我们的「项目」≈ todos 的 team + 它下面的 project（GitHub repo 或 Todos-hosted repo + base branch）。
- 我们的「协作」≈ todos 的 todo（9-phase 状态机）+ conversation（rewind/steer/question card）+ AI review + schedule + inbox。

### 6.3 状态焊在哪层 / 换啥意味着什么

todos 把状态**分四类锚点**，各自独立，互不污染：

| 状态层 | 焊点 | 换了意味着什么 |
|---|---|---|
| **任务态**（todo 9 phase + history） | 平台持久化（filing cabinet） | 换 agent / 换机器执行同一个 todo 历史都完整；progress 是 looked up 不是 remembered |
| **名册/分工态**（team 成员 + 角色槽 + charter） | 平台 + charter（你写） | 换某 agent 的 model / machine / thinking = 换槽位属性，**槽位/团队结构/charter/历史 todo 不动**；身份是资源不是进程 |
| **记忆态**（每 agent ≤100 条 + Chief memory） | 各 agent 自己（私有、bounded） | 换 agent = 它的 memory 跟它走（移除后留存但不再用）；**agent 间不互读**，team-wide 知识 → skill |
| **执行态**（worktree / build run） | 机器（自带或 platform） | **机器不持持久状态**——worktree 是 disposable（platform 机器 sleep 即毁）；todo/artifact 永远回写 platform branch 而非机器磁盘 |

**换记忆 / 换成员 / 换 executor 分别意味着什么**：

- **换记忆**：todos 没有"重置记忆"这种清空操作——记忆是**增量写 + bounded（≤100 条）逼 curation**。改偏好时 Chief **覆盖既有条目**而非加第二条（cap 就是为逼这件事）；agent 间不互读 memory。对照 Raft 的 per-agent workspace memory（也 per-agent、不共享 brain），todos 多了**显式 cap + 覆盖语义**；对照 Grok Bot"换记忆 = 新建 Bot"（记忆绑死身份），todos 把记忆当**可积累但需 curation 的知识资产**。✅
- **换成员（agent）**：移除 = 不再接活，memory 留存但不再用；换某 agent 的 model/machine/thinking = 换槽位属性，名册/历史 todo/既有 memory 都不动，接任 agent 无缝接管后续 todo。成员是可替换执行属性，团队与 memory 是常驻身份。✅
- **换 executor（机器）**：自带机器 `tds start` 注册/更换 / platform 机器 resize 或换 size；todo/memory/team/charter 零影响——执行层与状态层完全解耦。**worktree 是 disposable**（platform 机器 sleep 即毁 disk），agent 输出应落 todo branch。✅

### 6.4 与 Raft 状态哲学的核心差异

| | **Raft** | **todos.dev** |
|---|---|---|
| 共享态锚点 | server + channel/thread/task 消息流 | platform（todo 9-phase + build history + artifacts）+ charter |
| 私有态锚点 | 每 agent workspace（tied to computer，换机失忆）| 每 agent memory（在平台，跨机器跟随 agent）|
| memory 边界 | per-agent，agent 间靠消息传 finding | per-agent（≤100），agent 间不互读；team-wide → skill |
| memory 是否 bounded | 无显式 cap（agent 自管 workspace 文件）| **≤100 条 + 覆盖语义**（显式逼 curation）|
| 换机器 | workspace tied to computer = 失忆（隐私换便携）| **执行与状态完全解耦，换机器零影响**（memory 在平台不在机器）|
| conversation 角色 | 是 IM 主面（channel/thread/DM 是协作本身）| **不是 persistence layer**，可整体 reset，三层活下来就行 |

⚠️ PM 判断：todos 的"memory 在平台、机器只 disposable 执行"比 Raft 的"workspace tied to computer"更**便携**（换机器不丢），但比 Raft **少一层隐私**（memory 在 todos 服务器，不在你本机磁盘）。两者是 privacy vs portability 的反向取舍：Raft 用"不可移植 workspace"换"代码/凭证不出本机"，todos 用"平台托管 memory"换"换机器零影响 + 跨设备 PWA 无缝"。agents-remote 当前是 hybrid（PROJECTS_ROOT 本地 + 控制面），要明确站哪边或做兼容。

---

## 7. 派活与编排交互

### 7.1 用户怎么下达工作
- **主路径 = 一句话给 Chief**：无表单、无 workflow builder；对 Chief 说目标（"Build the physics engine…"），它拆 todos、按团队分工派给对应 agent、立即启动或出 Proposal card。✅
- **Plan first / Run now**：每个 todo 启动时选——Plan first 走 Confirm，Run now 跳过 plan。✅
- **AI review 派活**：Review/Confirm 关卡点 AI review 选另一 agent + focus note（或让 Chief 派）。✅
- **Schedule 派活**：todo 挂 hourly/daily/weekly/once 或对 Chief 说"every morning at eight"。✅
- **MCP 反向派活**：外部 Claude Code/Cursor/VS Code 经 MCP 建 todo / 启 build / 请 review。✅

### 7.2 Chief 是单一收口
- 每 team 一个 Chief，用户只跟它对话；Chief 理解 charter 里的团队分工，派活按专业走（前端活给前端、后端活给后端）。✅
- **两种派活区分**（关键设计）：① 你让它跑 = 立即启 ② 它自己建议的 = Proposal card 等你 accept。这个区分让 Chief 既能"自主"又不"越权"——自主建议永不自动执行。✅
- **Chief 锐化 todo**：派活前写清 goal/boundaries/what done looks like；缺信息先问而非猜。✅

### 7.3 编排是流水线而非聊天
- **Plan → Confirm → Build → Review → Done** 是 todo 的固有流水线，每阶段可换 agent（planner / builder / reviewer 不同 agent，可不同 model/thinking level）。✅
- 协作发生在**任务流水线 + AI review** 上，不是 agent 之间自由聊天。⚠️ 这与 Raft"agent 在 room 里互相 @ "的范式根本不同——todos 的 agent 不互相对话，它们通过 Chief 派活 + AI review 单向 critique 协作。文档明确：_「Each agent's memory is its own; agents do not read each other's」_（✅ docs/memory）。agent 间唯一的"协作"是：① AI review 时 reviewer 读 producer 的 plan/diff 写 critique ② 都看同一个 board。**没有 agent A `@` agent B 直接对话的机制**。
- **并行 = 多 todo 各自占 slot 并行跑**（不是同一 todo 内多 agent 并行）。文档明确：_「Todos run in parallel, each as its own build on whichever machine is free」_（✅ docs/todos）。大目标并行 = Chief 拆成多 todo（如 `#151/#152/#153`）并行跑，不是单 todo 内并行。

### 7.4 串行 vs 并行（机制澄清）
- **阶段内单 agent 干、阶段间串行交接**（planner → builder → reviewer）是 todo 内默认。✅
- **跨 todo 并行**是显式的：一个 team 多个 todo 各占 slot 并行跑（cap 限并行数，Free 2 / Pro 10）。✅
- **同一 todo 内的"多 agent"** 只发生在 AI review（reviewer 只读 critique，不真"协作"）。✅
- ⚠️ PM 推断：todos 不做"agent 之间实时互相对话协作"——它把"多 agent 协作"**降维成"Chief 编排 + AI review 互审"**，回避了 Raft 要解决的"多 agent 在 room 里发疯"问题（AX）。这是设计取舍：todos 简单但失去 agent 间涌现协作的可能。

### 7.5 进度由 Chief 主动报
- 状态推进时 Chief 在你下次回来 / todo 需要你时主动回报（"#150 is done. The architect is reviewing the code."）；Chief 不自己醒来 ping（省 token + 降噪）。✅
- watch a todo：你让 Chief 盯一个，它在需要你/完成/失败/关闭时回来。✅
- catch-up on return：你回来时报告 what moved since you last talked。✅

---

## 8. 记忆与上下文（"memory = state that increments"）

### 8.1 三层架构（§6.1 详述）此处补"how a preference travels"机制
- **Charter 注入 + memory 注入**：每 Chief turn 起 charter 注入（带 roles/priorities）+ memory 注入（scoped）；decision 前 pull board + 查 memory；学到新东西**立刻存**（不等 conversation 结束）；查进度直接读 build conversation 全文（含 in-progress turn）而非猜。✅
- **preference travel 链路**（官方举例 ✅）：你告诉 Chief"PRD 里 user story 用 Gherkin"→ Chief 立刻存 memory → 以后每次派 PRD 活：charter 告诉谁写 PRD、memory 告诉格式、Chief 把约束写进 todo spec → agent 拿到 spec 读到约束、整段 build 被记录 → 你改主意时 Chief 覆盖既有条目（cap 逼 curation）。

### 8.2 memory 是 agent 自写 + bounded + curation-enforced
- **agent 自己用 save_memory / delete_memory 工具写**：每条 title + 几句；good entry 是 durable lesson（task-specific 细节/secrets/credentials **不属于** memory，agent 被如此指令）。✅
- **bounded**：每 agent ≤100 条，到顶必须 consolidate 或删；期望 rewrite 既有而非堆 duplicate。✅
- **scope**：要么 team-wide 要么 scoped 到一个 project；build 看到的是自己 project 的条目 + team-wide 条目。✅
- **cost**：每 task 注入 prompt，所以大 memory 加 token；cap 保证 bounded（满 memory 也就几 K token/task）。✅
- **人 audit 不 author**：admin 能 edit 错的条目、删不该有的，**但不能手写新条目**——memory 是 agent 自己的 experience，人只 audit/correct；要给 standing instruction 用 role description 或 skill。✅
- **survives**：跨 todo/build/conversation/session reset/rewind 都活。✅

### 8.3 skill = team-shared 结构化记忆
- **skill 是 team 的**（区别于 memory 是 agent 的）：folder + SKILL.md（prose 教 workflow）+ 附属 reference 文件。✅
- **加法三路**：web app 内建 / GitHub import（扫 repo 或直链 folder）/ 磁盘 import folder。✅
- **给法两种**：默认带（每 todo 都带）+ conversation mention（不强制成默认）。✅
- **agent 可写 skill**（Create/Update skill 开关，默认 off）——验证过的方法存给全员。✅

### 8.4 长记忆形态 = 增量 bounded curation 而非向量检索
- 没看到向量库 / 语义召回这类重型机制，就是"每轮写结论 + ≤100 条 + 覆盖 + skill 附着"。✅
- ⚠️ 对 OPC 的轻量长记忆是强信号：**先做"结论沉淀 + bounded curation + 技能附着"，向量检索后置**。这与 Raft（per-agent workspace MEMORY.md 模式、无 cap）互为印证——市面两个 team-agent 产品都没上向量库。

---

## 9. 审批与介入

用户（Captain）在多处介入，全是"关卡"而非"盯每一步"：

1. **Confirm gate（方案层）**：plan 写完停 Confirm，你 Accept（Confirm Plan 进 build）/ Correct（回复改 plan）/ Steer mid-turn / Rewind。✅
2. **AI review（质量层）**：关卡处叫另一 agent（不同 model 更好，让 review 有分歧价值）独立审 plan/diff，critique 自动回灌 + 原 agent 自动 revise，多轮留痕；reviewer 只读不决策。✅
3. **Review gate（发布层）**：build 完成进 Review，主按钮 Done（可选 merge 进 base branch）；开 PR 是独立动作。✅
4. **Structured question（决策层）**：agent 要决策时停抛问卡，你选完 run 接着走。✅
5. **Confirm-card delete（危险动作层）**：Chief 提案删 skill/todo/agent 走 danger 样式 card，决策时重新鉴权。✅
6. **工具授权（capability 层）**：push/merge/tag/create skill/update skill/remote shell/team secrets 全 per-agent switch 默认 off，要人开；**remote shell + team secrets Chief 永不能授**。✅

配套：Inbox 聚合所有"等你"事件（Plan ready/Build finished/Build failed/Agent note/Assigned to you）+ browser/phone push + 决策到期通知；任务产出全留 thread（approach/diff/test runs）可 review 时看完整。✅

⚠️ PM 判断：todos 的审批哲学和 Raft 不同——
- **Raft**：直说"code review 已死，假信任"，主张 multi-agent 互审 + trace/proof 兜底 + 关键按钮人按。
- **todos**：把审批做成**两道硬关卡 + AI review 互审**，更工程化、更轻、更适合单人用户——它不假装人能 review 所有代码，但也不上 Raft 那种 trace/proof/daily-active-agents 的重型 verification gate。
两者都把"agent 互审"（builder ≠ reviewer）作为核心；todos 比 Raft 轻（无 trace gate、无发布节奏 T-30m/+24h），比 Raft 工程化（plan-confirm 是显式 phase 而非 channel 协议）。

---

## 10. 执行与持久

### 10.1 双执行路径
- **自带机器 `tds start`**：你的一台电脑（laptop/desktop/server）注册为 executor；`npm i -g @todos-dev/cli` + `tds start`；build 在隔离 git worktree 跑；PR 直推 GitHub 或 merge 进 Todos-hosted repo base branch。✅
- **Platform machine（Pro）**：Todos 替你跑的 **Cloudflare Sandboxes 容器**，无需自己开电脑/装东西；idle 10 分钟自动睡、有活自动醒（cold start 秒级），按 awake-hour 扣 credit（Small 340/Medium 490/Large 785 credit/awake-hour）；sleep 不计费；每 team 一台（Pro 含）。✅

### 10.2 隔离 + 隐私
- **build 在隔离 git worktree**，不污染主工作区；每 build 自己 branch。✅
- **代码/凭证执行不出你机器**（自带机器路径）：runtime 用你自己 provider 的 API key 或 subscription 直连，todos 不中介、不 meter、不 markup。✅
- **凭证不下发到机器磁盘**：machine pick up task 时才拿该 task 用的那一个 credential（仅内存），下个 task 重新拿；改/删 provider 立即生效。✅
- **secrets 不进 prompt/conversation/transcript**，只入 shell env。✅
- **Platform machine**：disk ephemeral（sleep 即毁、wake 从备份恢复），agent 输出应落 todo branch 而非机器磁盘——**这条很关键：平台路径下代码是进 Todos 沙箱的，不是你本机**。⚠️ 这是 todos 在"执行在你机器"叙事下的**例外**：Pro 平台沙箱是 vendor 沙箱（虽然 Todos 自己运营、用 Cloudflare Sandboxes）。

### 10.3 持久 = 工作区在云、执行可云可本地
- **状态层（todo/memory/team/charter）全在 todos 服务器**——换机器零影响、跨设备 PWA 无缝。✅
- **执行层可云可本地**：自带机器（隐私 + 便携取舍 = 换机要重 enroll 但 memory 不丢）或 Pro 平台沙箱（无脑但要付 credit 且代码进 Todos 沙箱）。✅
- ⚠️ PM 判断：这印证"控制面 SaaS + 执行面本地/云双选"的 hybrid 是务实终态。agents-remote 当前 = PROJECTS_ROOT 本地 + 控制面，对应 todos 自带机器路径；todos 的 platform machine 路径（Cloudflare Sandboxes）是 agents-remote 可借鉴的"无脑开箱"补充路径——**且 agents-remote 已用 Cloudflare 栈，平台沙箱这条路技术栈天然对齐**。

### 10.4 低门槛运行
- 自带机器：无 GPU 要求，Node.js 22.19+ + git 即可；本地模型 Ollama 可选。✅
- PWA 移动端：手机 PWA 语音记想法、开始 round、看进度、确认 plan、review diff、收决策到期通知——移动端不是只读，是完整参与审批闭环。✅

---

## 11. 商业模式与定位

### 11.1 定价（2026-08-12 一手，✅ pricing 页 + changelog）
| 档位 | 价格 | agent | 自带机器 | parallel builds | 存储 | 月 credit | platform machine / repo / built-in model |
|---|---|---|---|---|---|---|---|
| **Free** | $0/月 forever | 5 | 1 | 2 | 1GB | 0 | ❌ |
| **Pro** | **$19/月 per team**（年付 $15.20/月，7 天 card-required trial）| 15 | 4（含 1 台 platform）| 10 | 20GB | 35,000 | ✅ 全有 |

- **flat per team，无 per-seat、无 usage bill**：你直付 provider（API key 或 subscription），inference 从不被 meter/markup。✅
- **credit top-up**（Pro）：机器时间 + platform-paid inference 共用 credit pool，按平台实际成本计费（只加支付处理费）。✅
- **历史**：2026-08-07 changelog _"Pro plan stabilized & quota increase"_——Pro 才转正（之前是 experimental flag）；agent cap 从 10→15、parallel 从 8→10；2026-08-06 credit 从 30,000→35,000。✅ 旧版（薄文档）记的 $29/月 已过时，当前是 $19/月。

### 11.2 定位
- **task-driven workspace for humans and agents**（meta description + 首页 tagline）：面向要把"一句话目标 → 团队干到 merge"装进一个工作区的人。
- **BYO-PC + BYOK**：build 跑你机器（或 Pro 平台沙箱），用你自己的 provider API key 或 subscription 直连，Todos 不中介、不收过路费。✅
- **区别于 cloud coding agents**（官方 FAQ，✅ 原话）：_「Cloud agents run in a vendor's sandbox and hand results back. Todos is the workspace itself: todos, plans, builds, reviews, and merges live in one place. And execution happens on your hardware, so the speed and parallelism are yours to scale.」_
- **人群**：单人可用（Free 永久），暂不支持邀请真人进队——**当前形态刻意是"你 Captain + agent 团队"**（2026-08-09 主动移除 invite-member）。✅

### 11.3 产品成熟度信号（强）
- **changelog 每日滚动**：2026-08-06 到 2026-08-12 每天多条，覆盖 onboarding 重做、Pro 转正、平台机器、AI review 大改、Chief 时区感知、可靠性修复——这是**极度活跃的早期产品**，不是 demo。✅
- **npm `@todos-dev/cli`**：47 个版本（0.1.0 于 2026-06-30 → latest 0.1.46 于本调研时点），约 6 周龄；周下载 493、月下载 4738——**小但真实的用户基数**（几百人在装 CLI 跑）。✅
- **maintainer**：npm maintainer `zencooking` / `gempod@chain.fm`；GitHub org `todosdev`（2026-06-02 创建，0 公开 repo——全闭源私有）。✅
- **多语言**：changelog 多次提 _"all four locales updated"_ / _"EN/CN"_——至少英 + 中双语（中文优先级高，2026-08-09 提 _"review 相关 UI wording（审核）unified"_）。✅
- **i18n 文档**：platform-machines doc _"ships in English and Chinese"_。✅

### 11.4 对照
- **vs Raft**：同为 BYOK + 平价订阅的 agent 平台，Raft 走 $8.80/seat/月（agent=0.1 seat）的 per-seat 模型（面向团队），todos 走 **$19 flat per team**（无 seat，更贴单人/超级个体，刻意去掉 human seat）。✅
- **vs Kodus**（$10/dev/month + 独立 token 成本）：todos flat per team 更简单。🟡

---

## 12. 社区真实评价（走查节）

### 12.1 HN（Algolia API 多组全扫）
- **直接 todos.dev 讨论**：**零**。`query=todos.dev` nbHits=0；`query=todos agent team` 命中一堆不相干（VS Code Agent Kanban、OpenSwarm、Orchestro、Hybrid Groups 等，无 todos.dev 本体）。✅(负证据)
- ⚠️ PM 判断：todos.dev 在 HN **完全不存在**。考虑到它 6 周龄 + 极度活跃 + 中文优先，更可能是"产品宣传走中文圈 + Threads + 自家 changelog，不走 HN"，不是产品问题——但**英文技术圈零认知**是确凿的。

### 12.2 Reddit / Product Hunt
- **Reddit**：零独立讨论。WebSearch 对 `todos.dev chief agent` 的 Reddit 查询返回的全是 Claude Code agent teams / ChatGPT workspace agents 等不同产品，**todos.dev 本体零命中**。✅(负证据)
- **Product Hunt**：被 Cloudflare 挑战墙挡（403），未能直接验证；但 HN/WebSearch 全网零命中 + 旧版 tvly 摘要里那条"PH 300+ upvote"已被判幻觉，**默认 PH 也无有效讨论**。✅(负证据)⚠️

### 12.3 第三方评测 / 工具库
- **WebSearch（content_size=high）**：全网唯一独立提及 todos.dev 本体的是 **2 条 Threads 帖子** 🟡：
  - `@everydev.ai` post Db4W6stGj3H：「Todos.dev spins up a Chief AI agent that breaks it into tasks, assigns each to a specialist agent, cross-reviews the output, then waits for...」
  - `@suritech` post DWEmrIDmp-M：同样描述 Chief 拆活→专家派→互审 workflow。
  - 两者都是 **AI 工具聚合号**（@everydev.ai / @suritech / @testingcatalog 都发同类"新 AI 工具速记"），**非深度评测、无独立使用经验**——是机械复述官网 demo。🟡（弱信号）
- **Toolify / navtools / theresanaiforthat**：被 Cloudflare 反爬墙挡（403 Just a moment），未能取独立评分；但 todos.dev 确实被这几个 AI 工具目录索引（搜索页命中域名），**有目录收录、无评测内容**。🟡
- **thaitype/chief**（GitHub 框架，"plan, build, verify"）：**名字巧合**，与 todos.dev 无关——是一次机会主义的命名重合，**勿混淆**。✅(负证据)
- **Bing / DuckDuckGo**：DuckDuckGo lite 端点被反爬挡（返回 canonical honeypot）；Bing 返回无关节果（Google Maps 本地化）。⚠️ 两者未能提供有效独立信号。

### 12.4 中文社区
- ⚠️ 推断：产品 changelog 反复提 _"all four locales"_ + _"审核 unified"_ + 中英 docs 并行，**创始团队大概率有中文背景**（npm maintainer `gempod@chain.fm`，chain.fm 是个独立项目）。但即便中文圈，本次也未检索到独立中文评测/讨论（掘金/知乎/即刻未命中——tvly 已限不能用，DDG/Bing 中文查询也未见有效结果）。结论：**即便中文圈，社区声量也接近零**。

### 12.5 demo vs 真能力
- ✅ **真能力已证实**（docs 详尽 + npm CLI 真发版 + changelog 每日细节）：
  - `tds` CLI（47 版本真发版，命令/flag/磁盘文件全文档化）
  - Plan→Confirm→Build→Review→Done 9-phase 状态机（docs/todos 详尽）
  - AI review 多轮 + context carry-forward（2026-08-09 changelog）
  - 三层 memory（charter/memory/projects&todos，docs/context 显式架构）
  - skill 团队库（SKILL.md + GitHub import）
  - schedule 定时重跑（hourly/daily/weekly/once + 时区）
  - 自带机器 + Pro 平台沙箱（Cloudflare Sandboxes，lease-based 保活）
  - GitHub 集成 + Todos-hosted Git（`git.todos.dev`，无 PR fast-forward）
  - MCP server（外部 Claude Code/Cursor/VS Code 反控）
  - remote shell（双开关 + stateful persistent shell）
  - team secrets（write-only，env inject 不入 prompt）
  - PWA 移动端 + voice + push
- ⚠️ **实验/未完成**：
  - Pro 刚转正（2026-08-07 才 stable，之前是 experimental）
  - 邀请真人进队（已主动弃用，FAQ 对齐 solo+agents）
  - self-hosted server（docs 透露存在但无公开 setup 文档）
  - 多 provider catalog 具体清单（"700+ models"是营销文案，无公开 catalog 页）
- ✅ **自我透明**：docs 对 9-phase、三层 memory、permission 矩阵、platform machine 限制都直说不藏着；changelog 对"Pro 实验转正""invite-member 弃用""可靠性 bug 修复"都如实记。

### 12.6 社区声量结论
⚠️ **诚实结论**：todos.dev 的二手社区声量**几乎为零**。全网唯一独立提及是 2 条 Threads AI 工具聚合号帖子（机械复述官网，非评测）。HN/Reddit/PH/英文博客/中文博客全零独立讨论。这**不影响产品本身的成熟度判断**（changelog + npm 证明它极度活跃且真能用），但意味着：
1. **没有任何第三方使用经验可借鉴**（不能像 Raft 那样从 codepick 实测拿到 MEMORY.md / Task Claim 验证）——所有机制只能信官网/docs。
2. **不能作为"成熟度背书"**——它方向印证力强（ docs 极详尽、设计自洽），但市场验证为零（6 周龄 + 零社区）。

---

## 13. 对 OPC 多 agent 编排的启示

对照 agents-remote PRD（角色/任务/房间/看板/记忆/agentmore）与 multi-agent-orchestration.md 调研底座。

### 13.1 印证了什么（我们想对了的）
1. **Plan→Build→Review 三阶段流水线是能跑通的产品形态**（强印证）：todos 把每个 todo 走 Plan-first（可选）→Confirm→Build→Review→Done，每阶段可换 agent。PRD 第一期当前是"派任务→agent 干完→审批 done"的单段模型，todos 给了更细的**任务级阶段机**。✅⚠️
2. **每角色绑 provider/model + thinking level**（强印证）：todos "every model to its strength"——难活 opus-4.8、简单活 haiku-4.5 / deepseek-v4-pro、自由混 provider。印证 multi-agent-orchestration §10 的 RoleProfile { provider, model } 绑定 + todos 补了 thinking level 独立维度。✅⚠️
3. **skill memory 增量沉淀 + bounded curation**（强印证）：todos 的长记忆不是向量库，是"每轮结论写 memory + ≤100 条 + 覆盖 + skill 附着"——和 Raft（per-agent MEMORY.md）互为印证。**两个市面 team-agent 产品都没上向量库**，是 OPC 轻量长记忆的强信号。✅⚠️
4. **执行与状态解耦，换机器零影响**（印证 hybrid 务实终态）：todos 把 todo/memory/team/charter 焊在平台、worktree disposable——换机器不丢状态。agents-remote 当前 PROJECTS_ROOT 本地 + 控制面，可借鉴这个"状态在控制面、执行 disposable"的分离。✅⚠️
5. **Chief = 团队级协调者不写代码**：印证"编排层加一个收口协调者"。todos 的 Chief 还多一个设计：**两种派活区分**（你让它跑 vs 它自己建议的 Proposal card），让 Chief 既能自主又不越权——PRD 的"看板协调视图"可吸收这个"自主建议需 accept"机制。✅
6. **task-driven 协作面（todos/kanban）也能跑 team-agent，不一定要 IM**：⚠️ 这点**挑战**了我们之前"聊天即派活"的唯一性假设——todos 不做 IM（无 channel/DM/thread/`@`agent-to-agent），只做 todo 9-phase + AI review，照样跑 team-agent。意味着 PRD 的协作面有两条路：Raft 的 IM 面 vs todos 的任务面。

### 13.2 挑战了什么（和我们假设不一样的）
1. **⚠️ todos 证明了"agent 间不直接对话"也能 team-agent**。Raft 范式是 agent 在 room 里互相 `@`、自由协作（"two agents seamlessly collaborate—humans optional"）。todos 范式是**agent 间不互读 memory、不直接对话**，协作 = Chief 编排 + AI review 单向 critique。⚠️ PM 判断：这不是 todos "没做"，是它**刻意降维**——回避 Raft 要解决的 AX（多 agent 在 room 里发疯）问题。两条路都成立，PRD 要明确选哪条（或兼容）。**用户明说要 Raft 形态（IM + agent 互 @ ），todos 这条"无 agent 直接对话"的路径不是用户首选——但它的 Plan-Build-Review 流水线 + Chief 编排值得抄**。
2. **⚠️ memory 在平台 vs 在本机 = 便携 vs 隐私的反向取舍**。Raft 把 workspace 焊在 computer（隐私换便携，换机失忆）；todos 把 memory 焊在平台（便携换隐私，换机不丢但 memory 在 todos 服务器）。agents-remote 要明确站哪边——我们当前 hybrid（PROJECTS_ROOT 本地），更偏 Raft 的隐私侧，但要回答"换机时 memory 怎么办"。⚠️
3. **⚠️ "三层记忆"的 charter 是 todos 独有的强设计**：charter（你写、Chief 不可改）+ memory（agent 写）的分离，**防 Chief 重写自己 memory 时覆盖用户规则**——这是 Raft 没有的。PRD 若做"团队 charter / 项目宪法"层，todos 这个"只读 charter"设计是个 concrete 借鉴。✅⚠️
4. **⚠️ Todos 把"邀请真人进队"主动弃用了**：2026-08-09 changelog 移除 invite-member + 弃用 human-members 计费行，刻意收敛成"solo + agents"。这意味着 todos **不是真"团队协作"产品，是"单人指挥 agent 团队"产品**——和 Raft（明确面向 agent-native builders and teams）的人群不同。对 OPC 这是正信号（todos 验证了 OPC 单人场景有产品专门服务）；对我们要做的"团队/跨公司"场景，todos 不覆盖。✅

### 13.3 盲点（todos 没做的，是我们的机会 / 是它的边界）
1. **agent 间无直接对话协作**：todos 不做 agent A `@` agent B、无 agent 在 room 里互审的自由协作。这是 Raft 的核心差异化（AX），todos 刻意回避。OPC 若要"agent 涌现协作"得自己造（Raft 路径）。✅⚠️
2. **无 IM / channel / 真团队**：todos 是 task-driven（todos 9-phase），无 IM 协作面，无邀请真人。跨公司协作 / Joint channel 这类 Raft 做了的，todos 完全没碰。✅⚠️
3. **闭源 + 无公开自托管 setup**：docs 透露"self-hosted server 存在"但无公开 setup 文档；GitHub org 0 公开 repo；CLI 闭源。agents-remote 开源/自托管路线是差异化。✅⚠️
4. **平台沙箱是 vendor 沙箱**：Pro 平台机器跑在 Cloudflare Sandboxes（虽然 Todos 自己运营），代码进 Todos 沙箱——和它"execution on your hardware"的叙事有张力。agents-remote 若坚持"代码/凭证不出本机"，自带机器路径是唯一对齐的。✅⚠️
5. **无明确的成本/资源调度策略**：todos 的 parallel 是"先到先得 slot"（todo 占 slot 到终态），无优先级 / 资源分配 / 智能调度。Ed Huang 在 Raft 烧 1.2B tokens/day 说明成本治理是用户自管——todos 同样没内置。agents-remote 内置成本/资源调度是机会。✅⚠️
6. **市场验证为零**（6 周龄 + 社区零声量）：todos 的**产品方向印证力强**（docs 自洽、设计深思熟虑、changelog 活跃），但**无市场验证**——不能作为"成熟度背书"，只能作为"方向参考"。⚠️

### 13.4 ★ todos.dev 的范式判断（回答任务核心问题）

**用户要的是 OPC（一人公司 = 一个人指挥多 agent 团队）。Raft 是用户明说"想要的形态"。todos.dev 是不是"个人用 agent 管任务"而非"团队协作"？**

**答案：todos.dev 是"个人用 agent 团队管任务"，不是"团队协作"——但它确实是 team-agent 范式（agent 是团队成员不是工具），只是把"team"收敛成"你 + agent"，刻意去掉真人协作。** ✅

具体：
- ✅ **是 team-agent 范式**（agent 是 team member、有 identity/memory/role/skills，不是被调用的 tool）——这点和 Raft 同范式，区别于 Claude Tag（共享 bot）/ cloud coding agent（一次性工具）。
- ✅ **是 OPC 形态**（刻意弃用 invite-member，"solo + agents"）——比 Raft 更纯粹服务单人，Raft 还面向 teams。
- ⚠️ **协作面是 task-driven 不是 IM**——这点和 Raft 根本不同。todos 没有 channel/DM/thread/`@`agent-to-agent，只有 todo 9-phase + AI review。
- ⚠️ **agent 间不直接对话**—— Chief 编排 + AI review 单向 critique 是唯一协作机制，无 agent 涌现协作。

**结论对用户的判断**：用户要 OPC 没错，**todos 也是 OPC 形态**，但用户**明说要 Raft 形态**（IM + agent 互 @ + 跨公司 Joint channel）。todos 缺了 IM 协作面和 agent 间直接协作——这两个是用户要的 Raft 形态的核心。**todos 不是用户的首选形态，但它的 Plan-Build-Review 三阶段 + Chief 编排 + 三层 memory + bounded curation + Charter 是 Raft 没做或做得不如它清晰的，是 PRD 该吸收的具体设计**。

### 13.5 Raft vs todos.dev vs Claude Tag 关键差异表（本次 todos.dev 列填实值）

> 对齐 `pm-raft.md` §13.5 表头格式。todos.dev 列全部基于本次一手 docs 直证（✅），不再是 ⚠️。Claude Tag 列基于 `pm-claude-tag.md`，标 ✅。

| 维度 | **Raft** ✅ | **todos.dev** ✅（本次填实值）| **Claude Tag** ✅（见 pm-claude-tag.md）|
|---|---|---|---|
| **核心范式** | 人 + agent 作为 teammate 共事（IM 团队范式）| **task-driven workspace**：一句话目标 → Chief 拆 todo → 专家 agent Plan→Build→Review 干到 merge（任务流水线范式，刻意 solo+agents 不请真人）| 团队共用一个 Claude 身份装进 Slack（共享 bot 范式）|
| **agent 身份** | 每 agent 独立 persistent identity（name + memory + workspace），name > role | 每 agent 独立 identity（name + role + model/thinking + tools + skills + memory）；agent 不互读 memory；**无 Raft 的"真人名"叙事**，role + 描述为主 | **一个团队共用一个 Claude**，身份是"Claude"这个共享 bot |
| **协作面** | 自有 IM（channel/DM/thread/task board/joint channel），agent-native 重新设计；**agent 在 room 里互相 `@`** | **task-driven（todos 9-phase + AI review），无 IM/channel/DM**；**agent 间不直接对话**，靠 Chief 编排 + AI review 单向 critique 协作 | **寄生在 Slack**，channel/thread 是 Slack 原生，Claude 是其中一个成员 |
| **AX（agent 感官设计）** | ✅ 核心差异化（inbox/held draft/AX 四问，把 agent 当 turn-based 物种伺候）| ❌ **无 AX**——刻意降维，回避"多 agent 在 room 发疯"问题（因 agent 不在 room 里互相对话）| ❌ 无（Slack 是人用 IM，agent 当 bot 接收消息）|
| **本地执行** | ✅ daemon 跑用户硬件 + workspace tied to computer | **双路径**：✅ 自带机器 `tds start`（自带机器路径 = 代码不出本机）+ Pro 平台沙箱（Cloudflare Sandboxes，**代码进 Todos 沙箱**）| ❌ Anthropic 云端跑 session |
| **多 agent** | ✅ 原生多 agent（mixed runtime、agent 互 @、互审、涌现协作）| ✅ 原生多 agent（每 agent 独立），但 **agent 不直接对话**——并行 = 多 todo 各占 slot；协作 = Chief 派活 + AI review 单向 critique | ❌ 单一 Claude 身份 |
| **runtime / model 支持** | 9 种 CLI（Claude/Codex/Gemini/OpenCode/Kimi/Copilot/Cursor/Antigravity/Pi）BYO subscription | **provider 级**：OpenAI/Anthropic/DeepSeek/Google/xAI/OpenRouter/Ollama/任意 OpenAI-compatible + ChatGPT/Codex/Copilot subscription 免 key；**不是 CLI runtime 级**（agent 调 model API，不是跑 Claude Code/Codex CLI）| 仅 Claude（Anthropic 自家）|
| **审批/介入** | verification gate（builder ≠ verifier）+ 生产按钮人来按 + 多 agent 互审 + trace/proof 兜底 | **两道硬关卡（Confirm/Review）+ AI review 互审（builder ≠ reviewer）+ 最终 Done 人点击 + structured question card + confirm-card delete**；无 trace/proof gate | thread 里人 review + Open session 看 tool call + 管理员配消费上限 |
| **memory 模型** | per-agent workspace memory（tied to computer），**不共享 brain**；无显式 cap | **三层显式架构**：Charter（你写 Chief 不可改）+ per-agent memory（agent 写、≤100 条、bounded curation、agent 不互读）+ Projects&todos（平台持久化）；**memory 在平台不在机器**（换机不丢）| 频道累积的团队上下文 + 跨会话跨天记忆（频道级共享）|
| **skill / 复用方法** | （无显式 skill 概念，agent 自管 workspace notes）| ✅ **skill 一等公民**：folder + SKILL.md，team-shared，GitHub import / 磁盘 import，agent 可写，默认带 vs mention 两路 | ❌ 无（Claude 自带能力）|
| **跨公司协作** | ✅ Joint Channel（最多 3 server，单条 conversation 投影双方）| ❌ **无**（刻意 solo+agents，不请真人，无跨 team 协作面）| ❌（Slack connect 可达，但 Claude Tag 没专门设计）|
| **定价** | $8.80/seat/月，**agent = 0.1 seat**（per-seat + agent-aware）| **$19/月 per team flat**（无 per-seat 无 usage，年付 $15.20）；Free $0；**刻意弃 human seat** | Team/Enterprise beta，Anthropic 订阅 |
| **闭/开源 + 自托管** | 闭源 SaaS，不可自托管 | 闭源 SaaS（GitHub org 0 公开 repo，CLI 闭源）；docs 透露 self-hosted server 存在但**无公开 setup** | 闭源 SaaS（Anthropic 官方）|
| **平台 vendor 沙箱** | ❌ 无（坚持本地执行）| ✅ **Pro 平台沙箱**（Cloudflare Sandboxes，按 awake-hour 扣 credit）| ❌ 无（Anthropic 云端跑 session 算半个）|
| **MCP 外接** | External Agent（`raft agent login` device-auth）| ✅ **MCP server**（Claude Code/Cursor/VS Code 经 Bearer key 反控 board/build/review，精确工具勾选）| ❌ 无独立 MCP |
| **定时重跑** | Agent 自管 reminder（一次性/循环，到点唤醒）| ✅ **schedule**（hourly/daily/weekly/once + 时区，team ≤10 条，错过不补，gate 不变）| ❌ 无 |
| **移动端** | PWA（desktop-first，移动是 PWA 附属）| ✅ **PWA 完整版**（voice 变 todo / 确认 plan / review diff / push / 扫码登录；web-only 仅 GitHub/skill/billing 三样）| Slack 移动 app（寄生）|
| **产品成熟度 + 社区** | 1.2B tokens/day 真用户（Ed Huang）；codepick 中文实测；HN 冷清但有华人圈+meetup | **6 周龄**（2026-06-30 npm 首发），**changelog 每日滚动极度活跃**，npm 周下载 493；**社区声量近零**（HN/Reddit/PH 零，仅 2 条 Threads 聚合号帖）| Anthropic 官方背书，Slack 用户基数大 |
| **终极用户画像** | "AR, Agent Resource Manager"（操作员→资源管理者，含真团队）| **OPC solo builder / 超级个体**（你 Captain + agent 团队，刻意不请真人）| 团队共用一个 AI 队友（Slack 用户）|

**一句话差异**：
- **Raft** = 多 agent × agent-native IM × 本地执行（团队 + 编排 + 隐私 + AX）。
- **todos.dev** = task-driven workspace × Chief 编排 × Plan-Build-Review × 双执行路径 × 三层 memory + skill（**OPC 单人指挥 agent 团队跑交付流水线，刻意无 IM/无真人协作**）。
- **Claude Tag** = 单 Claude × Slack 寄生 × 云端（团队共享 bot，最易上手但无编排）。

**★ PM 关键判断（任务要的核心结论）**：
用户要 OPC（一人公司 = 一个人指挥多 agent 团队）。**Raft 是用户明说的首选形态**（IM + agent 互 @ + 跨公司协作）。**todos.dev 也是 OPC 形态**（刻意 solo+agents 验证了 OPC 单人场景有产品专门服务），但**不是用户首选**——它缺了用户要的两件：① IM 协作面（todos 是 task-driven 无 IM）② agent 间直接对话/涌现协作（todos 刻意降维成 Chief 编排 + AI review 单向）。

**todos.dev 对 agents-remote 的价值不是"替代 Raft"，是"补 Raft 没做或没做清晰的"**：
- ✅ **抄 todos**：Plan→Build→Review 三阶段任务状态机（比 Raft 的 task 更工程化）、**三层 memory 显式架构（Charter/Memory/Projects）**（Raft 没显式 charter 层）、**bounded memory curation（≤100 + 覆盖语义）**（Raft 无 cap）、**skill 一等公民**（Raft 无）、**schedule 定时重跑**（Raft 靠 agent 自管 reminder）、**MCP server 外接**（Raft 是 External Agent device-auth）、**Charter 只读防 Chief 覆盖用户规则**（强设计）。
- ✅ **抄 Raft 不抄 todos**：IM 协作面（channel/DM/thread）、agent 间直接 `@` 协作、AX（inbox/held draft/四问）、跨公司 Joint channel、per-agent workspace 在本机（隐私）。
- ⚠️ **明确取舍**：memory 在平台（todos，便携）vs 在本机（Raft，隐私）——agents-remote 当前偏 Raft 侧（PROJECTS_ROOT 本地），但要回答"换机时 memory 怎么办"（todos 的"memory 在平台"是个备选答案）。
- ⚠️ **警惕**：todos 的"无 agent 直接对话"虽然简单但**失去 agent 涌现协作**——用户要的是 Raft 那种"agent 在 room 里互相 review/解决"的涌现，todos 的 Chief 编排 + AI review 是**人为编排的协作**，不是涌现。PRD 别把 todos 的简化当全部。

---

## 14. 证据分级与来源

### 14.1 ✅ 一手直证（官网 / 官方 docs / 官方 npm）
- **官网首页** todos.dev：hero（_The agent team that gets things done_）+ 4 个 demo 区（physics engine / parallel split / live preview / token usage）+ features roster + pricing + FAQ。
- **官方 docs**（VitePress 风格，26 篇 + 营销页）：`/docs/overview`、`/docs/concepts`、`/docs/install`、`/docs/quickstart`、`/docs/todos`、`/docs/chief`、`/docs/agents`、`/docs/conversation`、`/docs/plans-and-diffs`、`/docs/ai-review`、`/docs/skills`、`/docs/memory`、`/docs/context`、`/docs/schedules`、`/docs/inbox`、`/docs/mobile`、`/docs/teams`、`/docs/projects`、`/docs/platform-git`、`/docs/machines`、`/docs/platform-machines`、`/docs/providers`、`/docs/secrets`、`/docs/permissions`、`/docs/remote-shell`、`/docs/cli`、`/docs/mcp`、`/docs/api-keys`、`/docs/github`、`/docs/troubleshooting`、`/docs/changelog` + 营销页 `/features`、`/pricing`、`/use-cases`、`/install`。
- **官方 npm** `@todos-dev/cli`：47 版本（0.1.0=2026-06-30 → latest 0.1.46），maintainer `zencooking <gempod@chain.fm>`，周下载 493 / 月下载 4738。https://registry.npmjs.org/@todos-dev/cli
- **GitHub org** `todosdev`：2026-06-02 创建，0 公开 repo（全闭源私有）。https://github.com/todosdev
- **官方 sitemap** todos.dev/sitemap.xml：37 个 URL（含所有 docs + 营销页 + privacy/terms）。
- **官方 robots.txt**：Cloudflare Managed Content（含 Content-Signal + 禁 GPTBot/ClaudeBot/CCBot 等训练 crawler），印证部署在 Cloudflare。

### 14.2 🟡 二手（第三方 / AI 工具库 / Threads / 社区）
- **Threads `@everydev.ai`** post Db4W6stGj3H：「Todos.dev spins up a Chief AI agent that breaks it into tasks, assigns each to a specialist agent, cross-reviews the output...」（机械复述官网 demo，非评测）https://www.threads.com/@everydev.ai/post/Db4W6stGj3H/
- **Threads `@suritech`** post DWEmrIDmp-M：同样描述 Chief workflow（机械复述）。https://www.threads.com/@suritech/post/DWEmrIDmp-M/
- **Toolify / navtools / theresanaiforthat**：被 Cloudflare 反爬挡（403），但搜索页证实 todos.dev 被这几个 AI 工具目录索引；**有目录收录、无评测内容**（弱信号）。
- **thaitype/chief**（GitHub 框架）：与 todos.dev 无关的命名巧合，勿混淆。https://github.com/thaitype/chief
- **Kodus $10/dev/month + BYOK**：定价对照参考（弱信号）。

### 14.3 ✅(负证据) 社区声量近零的硬证据
- **HN Algolia** `query=todos.dev` nbHits=0；`query=todos agent team` 命中均为不相干产品（VS Code Agent Kanban / OpenSwarm / Orchestro / Hybrid Groups / Circus Chief 等）。https://hn.algolia.com/api/v1/search?query=todos.dev
- **HN user `zencooking`**（npm maintainer 同名）nbHits=0——maintainer 不在 HN 活跃。
- **HN `chain.fm`** nbHits=0。
- **WebSearch `todos.dev agent team workspace review`**（content_size=high，限 news.ycombinator.com/reddit.com/producthunt.com/toolify.ai/theresanaiforthat.com/medium.com/dev.to）：唯一 todos.dev 本体命中是官网自身 + changelog + skills docs；其余全是不同产品（Claude Code agent teams / ChatGPT workspace agents / thaitype/chief）。
- **WebSearch `todos.dev chief agent plan build review github workspace`**（不限域）：明确返回 _"I didn't find a specific site called todos.dev in these results"_（除官网自身）。
- **Product Hunt**：403 Cloudflare 挑战墙，未能直接验证；结合 HN/WebSearch 全网零，判定 PH 无有效讨论。
- **Bing / DuckDuckGo**：DuckDuckGo lite 返回 canonical honeypot（反爬）；Bing 返回无关节果（本地化）。两者无有效独立信号。
- **Reddit JSON**：被限流返回 HTML；但 WebSearch 限 reddit.com 的查询零命中 todos.dev 本体。

### 14.4 ⚠️ 推断（PM 综合判断，未直接证实）
- todos 的"agent 间不直接对话"是刻意降维（非"没做"）——基于 docs/memory 明确 _"agents do not read each other's"_ + 无任何 agent-to-agent mention 机制。
- memory 在平台 vs Raft 在本机 = 便携 vs 隐私的反向取舍——基于 todos memory 跨机器跟随、worktree disposable 的 docs 事实。
- self-hosted server 存在——基于 platform-machines doc 一句 _"A self-hosted Todos server with no sandbox backend configured never shows the platform-machine option"_，但无公开 setup 文档。
- 创始团队有中文背景——基于 changelog 反复提 _"all four locales"_ + 中英 docs 并行 + maintainer `gempod@chain.fm` + review wording 中文（"审核"）unified。
- "todos 是 OPC 形态但不是用户首选"——基于用户明说要 Raft 形态（IM + agent 互 @）+ todos 刻意无 IM/无 agent 直接对话。
- 对 PRD 的启示（§13）全部为 PM 综合推断，对照 multi-agent-orchestration.md §10/§11/§12 + multi-agent-prd.md + pm-raft.md §13。

### 14.5 未覆盖 / 待补
- **试用实测**：本次未真实注册 + 连机器 + 跑多 agent（需真实账号 + 本地装 tds + 连 provider key）。docs 极详尽降低了实测必要性，但 Plan-Build-Review 实际体验、AI review 多轮收敛质量、Chief 拆活逻辑、三层 memory 实际注入行为仍需实测验证。
- **Reddit 真实评论**：JSON 端点被限流，需换 user-agent 重试或 web 端抓取（结合 WebSearch 零命中，预期即便有也极少）。
- **Product Hunt**：403 挑战墙，需浏览器手验证（旧版 tvly 那条"300+ upvote"已判幻觉，预期 PH 也无）。
- **中文社区**（即刻/掘金/知乎）：tvly 已限不能用，DDG/Bing 中文查询未见有效结果；需人工搜或等社区发酵。
- **self-hosted setup**：docs 透露存在但无公开文档，需联系官方或等公开。
- **provider catalog 完整清单**（"700+ models"）：营销文案无公开 catalog 页，需注册后在 picker 里看。
- **创始团队身份**：npm maintainer `zencooking` / `gempod@chain.fm`，chain.fm 是个独立项目（_Listen to the Chain_），未深查关联——可补但非本调研核心。

---

> **PM 一句话总结**：todos.dev 是一个**产品方向对、docs 极详尽、极度活跃但社区声量近零**的早期 OPC task-driven workspace——它用 Chief 编排 + Plan-Build-Review 三阶段 + 三层 memory（Charter/Memory/Projects）+ bounded curation + skill 一等公民 + 双执行路径（自带机器/Pro 平台沙箱）证明了一条**和 Raft 不同但同样成立**的 team-agent 路径：**task-driven（无 IM、agent 不直接对话、刻意 solo+agents）**。对 agents-remote：它不是用户首选（用户要 Raft 的 IM + agent 互 @），但它的 **Plan-Build-Review 流水线 / 三层 memory 显式架构 / Charter 只读设计 / bounded memory curation / skill 一等公民 / MCP 外接 / schedule 定时 / Cloudflare Sandboxes 平台沙箱** 是 Raft 没做或没做清晰的，PRD 该把这些具体设计吸收。最该抄的是 **Plan-Build-Review 三阶段任务状态机 + Charter/Memory/Projects 三层显式 memory 架构**——这两件 todos 比 Raft 工程化得更清晰。最该警惕的是别把 todos 的"agent 不直接对话"简化当全部——用户要的是 Raft 的涌现协作。
