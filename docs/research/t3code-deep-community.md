# T3 Code 社区反馈深挖

> 调研时间：2026-11-23。方法：12+ 轮多源搜索（HN Algolia API 全量评论树、Reddit 原帖+评论、App Store iTunes RSS API 全量 50 条、Google Play 内嵌评论、YouTube 视频与评论区、技术博客深评、中文社区 V2EX/知乎/博客园）、GitHub issue 一手验证。
> 证据分级：**【强】**=多源交叉或一手长评/数据；**【中】**=单一可信源（一手评论区/博客全文）；**【弱】**=零散转述。
> 上一次调研（`t3code.md` §5）的社区面以 App Store 摘要为主；本篇以「用户原话 + 场景」为锚重新收集，覆盖面显著扩展。

---

## 1. 用户爱的到底是什么

### 1.1 「不在工位也能继续」——手机/远程是第一高频词 【强：App Store + Google Play + Reddit + HN 四源交叉】

- 「The remote experience is by far the best and it is game changing to be able to remote into multiple machines and multiple models all from one place.」App Store 5★ v2.0.0（https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824）
- 「I juggle 3 personal subscriptions, 2 different corporate subscriptions for clients I contract for, on multiple computers and often control it from my phone. This tool greatly simplified my workflow and how many terminals with tabs in multiple remote desktop sessions I was juggling.」App Store 5★ v1.1.0（同上）
- 「T3Code fixed everything I hated about Claude… I use it for being able to shut my laptop and let agents keep working and the phone app is incredible.」r/ClaudeCode（https://www.reddit.com/r/ClaudeCode/comments/1xq7ns5/）
- 「extremely handy for me to check on long running instances whilst I'm AFK」Google Play 评论（https://play.google.com/store/apps/details?id=com.t3tools.t3code）
- HN 用户 gogoro：「t3code on my mac and omarchy, connected to my VMs with tailscale… manage it from anywhere… I have been a terminal nerd for a long time. But the speed I've been able to achieve across a lot of projects has been crazy with t3code.」（https://news.ycombinator.com/item?id=50376652）
- 评论区共识级定位：r/ClaudeCode「away from your desk, across several repos」帖下 T3 是最高频推荐（「t3.codes is what you're looking for」「+1 for t3」「T3 Code changed my life.」，https://www.reddit.com/r/ClaudeCode/comments/1y1o8qf/）

### 1.2 多 provider 统一界面 + 中途换模型/换 agent 【强：多源】

- 「Every agent in one place. Change models in the middle of a thread. Let Claude hand a task to Codex.」README（https://github.com/pingdotgg/t3code）
- HN peepee1982 一手长评：「Not having to use multiple agents (you can switch them mid-conversation with automatic handoff if you want)… It is so good that I just can't use anything else anymore without feeling frustrated.」（https://news.ycombinator.com/item?id=50375873）
- r/herdr 对比帖用户转投原因即多 harness 统一（https://www.reddit.com/r/herdr/comments/1wjcujk/）；r/ClaudeCode 用例帖总结三条价值：>1 订阅合管 / 远程服务器跑 agent / 移动端比 Codex 官方 app 易用（https://www.reddit.com/r/t3code/comments/1xyuh17/）
- 迁移实证：r/cursor 用户在 Cursor 降配额后「fully switch to Claude Code (with T3 Code and PI Agent, works AWESOME)」（r/cursor 周榜，https://www.reddit.com/r/cursor/best/ 检索快照）；HN senordevnyc「I switched from Cursor to Claude Code (via T3.codes)」（https://news.ycombinator.com/item?id=50378013）

### 1.3 线程收件箱/注意力管理（settle/snooze/队列）——ADHD 用户群体反复点名 【强：三独立源】

- HN peepee1982：「Thread handling: Snooze, Settle, Archive, Delete. It's the only tool where I don't get overwhelmed when working on multiple Threads/Projects at the same time (I am diagnosed with ADHD).」（https://news.ycombinator.com/item?id=50375873）
- App Store：「Weaponizes ADHD — You don't need ADHD to use this app, but if you have ADHD… you can weaponize your ADHD.」（https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824）
- r/ClaudeCode：「T3Code has supercharged my ADHD. I'm getting so much done, I can't even force myself to leave my computer. It's honestly an addiction… so I have to wrestle with that.」（https://www.reddit.com/r/ClaudeCode/comments/1xq7ns5/）
- HN viraptor：「The inbox style handling of threads makes more sense than anything else I've seen.」（https://news.ycombinator.com/item?id=50176139）

### 1.4 「快」是被官方当 feature 也被用户验证的差异点 【中-强】

- README 官方红线：「Fast. Performance is a feature here. We measure it, and we treat a dropped frame as a bug.」（https://github.com/pingdotgg/t3code）
- App Store：「This is the snappiest agentic workflow client I've ever used.」5★ v2.3.0（https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824）
- YouTube「T3 Code First Impressions」：「the speed, you cannot beat the speed. And as a result, I just haven't been touching codex as much and even claude.」（https://www.youtube.com/watch?v=IOM0oAhLQV4）
- 反例同源存在：早期体验「I tried it once and it was too early - very slow」（r/AI_Agents，https://www.reddit.com/r/AI_Agents/comments/1wwb56o/）——快是后来居上的口碑，不是初始口碑。

### 1.5 内置浏览器/live preview/ simulator 远程可视化 【中：三独立一手】

- unbeholden.dev 博客：「The built-in browser is the biggest win. It runs inside the container… I don't have to think about which ports to expose… I've already removed the exposed ports from every dev container.」（https://unbeholden.dev/blog/t3-code-in-every-dev-container）
- App Store：「When working on iOS apps, you are even able to see the simulator.」5★ v2.3.0（https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824）
- App Store：「The live previews are a huge part of that… being able to see what they're doing at a glance is phenomenal.」5★ v1.2.0（同上）
- HN viraptor：「if you're doing a lot of web, the mini browser integration is the best I've seen around.」（https://news.ycombinator.com/item?id=50176139）

### 1.6 PR/GitHub 工作流内嵌（分支线程、PR review、merge 后 settle） 【中-强】

- r/ClaudeCode：「That's like the #1 most overlooked feature of T3 Code, working with GitHub and the way it handles PR's, Issues, etc.」（https://www.reddit.com/r/ClaudeCode/comments/1xq7ns5/）
- HN viraptor：「The interface makes a lot of common things faster (like the pr previews and git pushes), the namespaced worktree spawning by default is great, the steer/queue message behaviour comes useful, the ability to reference other threads and spawn specific workers is a life improvement… I've converted from cmux to t3code and don't regret anything.」（https://news.ycombinator.com/item?id=50176139）
- YouTube WordLabs V2 评测将「pull-request watching + scheduled/webhook tasks」列为 V2 核心卖点（https://www.youtube.com/watch?v=9RdG2LaL0Jc）

### 1.7 免费开源 + 自建 + BYO 订阅（不被锁定） 【强】

- App Store：「Pretty wild that a small team that's not charging for this app just shipped the best mobile coding experience on the market.」（https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824）
- r/ClaudeAI：「The project is free and open source」被用于反驳「support Theo」指控（https://www.reddit.com/r/ClaudeAI/comments/1xose26/）
- 自托管深度用户：unbeholden.dev 每容器一个 T3 server、nixpkgs 打包、`T3CODE_TELEMETRY_ENABLED=false`（https://unbeholden.dev/blog/t3-code-in-every-dev-container）
- HN djeastm 基于其开源 API 造了「Superintendent」在 T3 之上编排订阅容量（https://news.ycombinator.com/item?id=50380990）——开放 API 派生生态是免费的直接产物。

### 1.8 离线可用/弱网韧性（移动端差异化） 【中】

- App Store 5★ v2.3.0：「Threads being available even offline (or during patches of spotty signal) means I can continue working uninterrupted from anywhere. Throw in inter-thread communication, thread orchestration even across projects (or across machines!)」（https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824）
- Google Play v2.3 更新注记：「Faster sync and reconnects on bad Wi-Fi」为官方修复方向（https://play.google.com/store/apps/details?id=com.t3tools.t3code）

---

## 2. 无可替代场景清单（用户原话支撑）

| 场景 | 用户原话（摘） | 来源 | 强度 |
| --- | --- | --- | --- |
| 多机+多订阅聚合（个人+公司双份） | 「3 personal subscriptions, 2 different corporate subscriptions… on multiple computers」 | App Store v1.1.0（URL 见 §1.1） | 强 |
| 车库服务器/NAS 上的 agent 免 SSH/VNC | 「you have a server somewhere in your garage… you don't have to SSH/VNC into it, just get the T3 Code app, link them, done」 | r/ClaudeCode 1xq7ns5 | 中 |
| 每容器/每 VM 隔离 agent（免权限提示的安全边界） | 「every container gets its own server, and the boundary stays where it was」 | unbeholden.dev（URL 见 §1.5） | 中 |
| 地铁/通勤批准权限请求 | 「配对一次就能在地铁上批准 agent 的权限请求」 | 博客园 iTech（https://www.cnblogs.com/itech/p/23527124） | 中 |
| 关笔记本让 agent 继续干活 | 「shut my laptop and let agents keep working」 | r/ClaudeCode 1xq7ns5 | 强 |
| 手机控 Cursor/各家 CLI 做 expo 构建 | 「I can now control cursor on my Mac from my phone which means I can do expo builds」 | App Store v2.2.0 | 中 |
| 国内免代理远程 | 「在服务器搭建一个服务端，客户端连接就可以使用，不需要挂代理」 | V2EX（https://www.v2ex.com/t/1255612） | 弱（单帖） |
| 多线程并行不迷路（ADHD/多项目） | 「the only tool where I don't get overwhelmed… (ADHD)」 | HN 50375873 | 强 |
| 把整支团队从各家官方 app 迁来统一行为 | 「My team and I are switching from our individual Claude cursor and codex apps to T3」 | App Store v1.0.1 | 中 |

---

## 3. 高频吐槽与痛点

### 3.1 Alpha 阶段可原谅类

1. **bug 多/feature 缺**：「I tried a T3 code for a hot second, but found it too buggy and missing features I missed from Claude Code Desktop. I do desperately need to figure out some way to get stuff off my laptop.」（HN thefourthchime，https://news.ycombinator.com/item?id=50385453）【中】
2. **早期慢**：「too early - very slow」（r/AI_Agents 1wwb56o，URL 见 §1.4）【弱】
3. **移动端 App 性能**：「current 1.04 version is really slow and often requires me to force quit… I also often have 20-30 sessions open at a time」App Store 3★ v1.0.3（URL 见 §1.1）【中】
4. **终端崩溃**：「Opening the app back up using tmux in the terminal it crashes」App Store 4★ v1.0.3（同上）【中】
5. **Windows 已知坑**：Electron safeStorage 密钥孤儿致机器列表卡死（issue #8341，挂数月）；Windows 无后台服务形态（知乎拆解引 issue，https://zhuanlan.zhihu.com/p/2101659171552810984）【中（转引一手 issue）】
6. **编排层翻车**：嵌套检查未结束即把 INTERIM 当完成发布（issue #21837）；OpenCode Auto 模式无视权限配置反复要授权（issue #11458）（同上知乎转引）【中】
7. **Android 通知/后台**：「notifications don't work at all even with account signed in. wish I could keep it running in background」Google Play（URL 见 §1.1）【中】
8. **连接稳定性**：「connection dropping around once a week or if there is a version miss match on one device vs another」Google Play（同上）——**版本不一致断连是跨端协议代价**【中】

### 3.2 结构性问题类

1. **token 消耗感知偏高**：r/ClaudeCode 有「consumes 50% to 70% more tokens」传言（1xq7ns5）；GitHub issue #24649 实锤一半：Claude 经 Agent SDK 的 **5 小时窗口计量确实快 1.6-1.7 倍**（TUI 1.11-1.14 vs T3 1.94-1.97 %/M cache-write tokens），Theo 定性为 Anthropic 侧计量 bug、周限额不受影响、修复已验证（https://github.com/pingdotgg/t3code/issues/24649）。Theo 本人承认「users fire more threads and therefore feel it more」（BigGo 摘要，https://finance.biggo.com/podcast/fc37ed5cc8193fef）——**结构性：多线程工作方式天然放大用量感知**【强】
2. **Provider 适配质量分层**：Pi 用户实测「My experience with Codex was far better than Pi inside T3」——扩展的 `ctx.ui.custom` 交互在 T3 内不工作，「If you are using ctx.ui.select, .input… then it will work really well」；交互式扩展被 harness 吞掉是 adapter 层固有矛盾（r/PiCodingAgent，https://www.reddit.com/r/PiCodingAgent/comments/1xce0a2/）【强（一手详测长评）】
3. **fork 补丁文化 = 官方不收功能 PR**：「i wanted profiles for my Codex projects, so i added them to my T3 Code fork」（r/codex，https://www.reddit.com/r/codex/comments/1xpo7gn/）；WordLabs 自述向 T3 提的 2 个 PR「neither was merged」（https://www.youtube.com/watch?v=9RdG2LaL0Jc）；中文拆解定性「开源 = 开放协作…基本不接受外部 PR」（博客园 iTech，URL 见 §2）【强（多源交叉）】
4. **单 harness 用户增益有限**（用户自己给出的共识）：「If you're only using Claude Code as a single harness, stick with Claude Code Desktop — T3 Code's main value is multi-agent orchestration」（r/ClaudeAI 1xose26，URL 见 §1.7）【强（社区共识句式反复出现）】
5. **astro-turfing 指控**：推荐帖下出现「I firmly believe all these T3 Code references… are just bots/ads」「What a bot farm. Theo, please, stop.」（r/ClaudeCode 1xq7ns5）——T3 覆盖面扩大后的反噬，属于品牌层面的结构性噪声【中】
6. ** Theo 个人敌意**：「Id rather get get shot than support theo」（r/ClaudeAI 1xose26）；「Theo is annoying and insufferable. But he cooked.」（Google Play，URL 见 §1.1）；r/codex postmortem 帖指控 Theo/Maria 滥用 /goal 免费 token 推动 OpenAI 移除特性（1K 赞，未核实存目，https://www.reddit.com/r/codex/comments/1vza73x/）；r/theprimeagen 有专门嘲讽帖（https://www.reddit.com/r/theprimeagen/comments/1x56tb4/）——**产品口碑与创始人口碑解耦是真实现象**【强（多源）】
7. **默认权限 Full access + 遥测默认开**：官方文档自认非安全边界；「装完第一件事改成 Supervised」是中文/英文社区共同建议（知乎拆解 URL 见 §3.1；r/ClaudeAI 「One default setting you'll want to change first」帖 https://www.reddit.com/r/ClaudeAI/comments/1xl0grs/）；遥测含 provider/model/token 数（无 prompt/文件），可关（unbeholden.dev 实操）【强】
8. **移动端信息架构**：「background polling + a better organization system for threads」（App Store v1.3.0，URL 见 §1.1）；「different threads could use better separation UI, hard to tell which working state correlates with which title」Google Play——**手机上多线程的组织/可读性仍是第一改进诉求**【强】
9. **任务调度/状态追踪不是它的领域**：「It solves device connectivity, but it does not solve task scheduling or status tracking… It is not yet the control plane for every AI task」（jimmysong.io 中文评测，https://jimmysong.io/blog/t3-code-mac-agent-control-plane/）【中】
10. **信任边界提醒**：「Don't hand it every repository in full-access mode, because the interface cannot make the underlying commands harmless」（Flavio 深评，https://flaviocopes.com/t3-code/）【中】

---

## 4. 与竞品对比中的胜负手（用户自己做的对比）

- **vs Claude Code Desktop**：单 harness 用户留官方（共识，r/ClaudeAI 1xose26）；多机/多 harness/移动场景选 T3。迁移动机例：「Claude desktop is no better, and is actually just worse all around. Which results in me just using terminals」（App Store v1.0.1）。官方 app 的云运行/成熟度/深度仍被承认更优（WordLabs V2 评测「where they win: cloud runs, maturity, depth」，URL 见 §1.6）【强】
- **vs Codex 官方 app**：「What the Codex app should have been」（App Store v2.3.0 标题）；「I have been using the codex/chatgpt mobile app and it is not nearly as good as this」（App Store v1.0.3）；Codex app RAM 占用被点名（YouTube「T3 Code: Better Than Codex?」简介，https://www.youtube.com/watch?v=6x7hh6Qzm9U）；HN viraptor 批官方 app「need to show off new features immediately… old features stay frozen without a good reason」（URL 见 §1.6）【强】
- **vs Herdr**（终端多路复用派）：techstackups 三方实测同一软件工厂，T3 波次最快（3.8min vs Herdr 5.3min vs Amp 7.7min），定位差异「Herdr in your terminal, T3 Code as a desktop/web/mobile app」；「Best for: People who want a GUI over the agents they already pay for」（https://techstackups.com/comparisons/herdr-vs-t3-code-vs-amp/）。用户口径：「herdr was also cool if you work on a single machine. But t3code is better if you work in multiple」（r/ClaudeCode 1y1o8qf）；反方：「I just can´t let go of my multi machine herdr setup right now (especially because my worktrunk routines)」（YouTube Jan Marshal 评论区，https://www.youtube.com/watch?v=SAFrydhpgJo）【强】
- **vs Conductor**：Conductor 复活帖下 HN 用户「T3Code just works though. It also doesn't look horrible, which is apparently a high bar given the state of the AI GUIs.」（https://news.ycombinator.com/item?id=50478810）【中】
- **vs Paseo/Orca**：分化——App Store 有 1★「Same thing as Paseo basically. Nothing special.」；也有「tried Orca etc too… Best developer experience for me as a new user」（Google Play）；「immediately dropped t3code simply because it doesn't list pi as first class support cli… to me Orca seemed to be the only reliable option」（r/PiCodingAgent 1xce0a2）；「Why has no one combined Orca and T3 code」帖存在（r/ClaudeCode 1xbwo01）——**同层竞品互有胜负，胜负手常是特定 provider 支持与个人工作流绑定**【强】
- **vs Cursor**：Cursor 降配额/下滑是实测迁移触发器（r/cursor 周榜 + HN 50378013，URL 见 §1.2）【中】
- **vs cmux**：「I've converted from cmux to t3code and don't regret anything」（HN 50176139）【中】
- **中间态立场**：「主力会话留在原终端，T3 Code 当远程面板用，等 0.x 的毛刺磨掉再往里托付」（知乎拆解，URL 见 §3.1）——谨慎派把 T3 当「远程面板」而非主控【中】

---

## 5. 对 agents-remote 的启示清单（≤8 条）

1. **「离开工位继续」是最强购买理由，我们的 PWA 路线能覆盖核心，但「离线可用线程」是我们没有的差异化体验**：T3 移动端把「Threads available even offline / spotty signal」当核心卖点（§1.8）。我们 JSONL 权威 + WS 重放的架构里，「已回放消息本地可读 + 待发 prompt 本地排队」就能复刻这个语义，成本低价值高。
2. **手机上的第一诉求是「看状态 + 批准」，不是「看全文」**：Flavio 的移动端用途清单（看完成/读短结果/答安全明确的问题/拒权限请求/发 follow-up）与 App Store/Google Play 吐槽（线程组织差、状态-标题对不上）共同指向：**移动端信息架构应该按「哪条线程在等我」组织，而不是按会话列表组织**。我们的会话行 running/blocked 聚合方向正确，但「等待我」作为一等视图值得做。
3. **推送/后台感知是被点名最多的缺口**（iOS background polling、Android 通知不工作）——T3 用 Live Activity+relay 解决且 push 必须走托管 relay（我们既有调研结论一致）。我们的 Web Push + 感知状态投影仍是正确的下一步，且「Android 后台保活不可靠」在 T3 也存在，PWA 不比原生差多少。
4. **内置浏览器/live preview 是「看不见的就爱」功能**：dev container 用户为它删光了端口暴露（§1.5）。我们 PWA 天然是浏览器——`t3.json` 式 previewUrl 声明 + 项目页内嵌 iframe 预览，是我们的低成本高感知对标点。
5. **token 消耗的「感知问题」大于「事实问题」，但事实部分（5h 窗口计量差 1.7x）被官方 issue 实锤**：多线程工作方式天然放大用量感知。我们应从第一天提供**用量页按 provider/线程聚合 + 5h/周窗口 pacing**（T3 的 usage overview 被 HN 长评点名好评，§1.2），并把「我们的管道不改变计量」作为可验证主张（我们直 spawn CLI，无 SDK 计量层差异——这是相对 T3 的真实结构性优势，值得写进文档）。
6. **fork 补丁文化是 T3 「社区 owned」宣传的真实裂缝**：功能 PR 不收、用户自维护 fork（profiles）、第三方 PR 被晾（§3.2-3）。我们作为个人项目无此包袱，但「外部功能需求 → Discussions 排期不收」造成的用户 DIY，提示我们**宁可少而配置化（t3.json/scripts/插件），不做死黑盒**。
7. **「单 harness 用户增益有限」是清晰的边界共识**：T3 的核心价值主张建立在 ≥2 provider 上。我们同样面向多 provider（claude/codex/pi/ACP），产品文案与功能优先级应押注「多 provider 聚合 + 远程」而不是试图在单 provider 体验上打赢官方 app。
8. **覆盖不了的面（如实记录）**：① iOS Live Activity/锁屏实时卡片、主屏 widget——PWA 无此通道，锁屏通知点击深链是上限；② 商店分发带来的信任与安装面（254 评分 4.90 分是社交证明，PWA 拿不到）；③ 每容器/每 VM 一 server 的「环境=进程」多环境拓扑我们目前单 api 进程，多机管理（garage server 场景）是我们的结构缺口——若要做多机，T3 的「多 environment 平铺 + 2 clicks 换机起线程」是被验证的 UI 语义（HN 50375873）。

---

## 附：本轮新覆盖 vs 上轮（t3code.md §5）

- 新增一手证据源：HN Algolia 全量评论树 5 帖（含 573pts Ask HN）、App Store 全量 50 条评论、Google Play 177 评分内嵌评论、GitHub issue #24649 一手数据、V2EX 一帖、知乎 4 篇 + 博客园深拆、3 个 YouTube 评测（含评论）、4 篇英文博客深评（Flavio/unbeholden/techstackups/developersdigest）、WordLabs V2 评测增长数据。
- 上轮已有且本轮强化的：remote/multi-machine 价值、settle 语义、iOS background polling 诉求、「community owned」争议、r/codex postmortem（本轮补充了帖子规模：1K 赞 191 评论）。
- 未搜到的面（如实记录）：Discord 内容无公开索引，仅 V2EX 提及 rex 产品「需进 Discord 群」的间接转述；即刻/微博未搜到有效讨论（知乎/博客园/V2EX 已覆盖中文面）；Google Play 文字评论仅能取到页面内嵌的 ~20 条（177 评分中其余未暴露）。
