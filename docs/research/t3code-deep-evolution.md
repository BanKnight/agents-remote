# T3 Code 演进与官方叙事深挖(0.1.7 → 2026-11-22)

> 上接 `docs/research/t3code-research.md`(2026-11-13 / v0.1.7)。本篇回答:10 天里他们把工程火力投在哪、官方怎么讲故事、什么样的工程纪律撑得起这个节奏。素材:本地 clone `~/repos/t3code`(unshallow,完整历史至 2026-11-22 HEAD `6972026121`)、GitHub releases 全文、t3.codes / t3.gg 官方文案。

## §1 版本演进清单(v0.1.7 → v0.1.12)

发版节奏:**v0.1.8(11-09)→ v0.1.9(11-11)→ v0.1.10(11-16)→ v0.1.11(11-20)**,v0.1.12 走 nightly(11-22 仍在出)。nightly 每 30 分钟检查一次、间隔 ≥6h 自动出;stable = 人工验证过的 nightly 直接晋升。各版规模(release 页自报):

| 版本 | 日期 | changes × contributors |
| --- | --- | --- |
| v0.1.9 | 11-11 | 198 × 31 |
| v0.1.10 | 11-16 | **1924 × 360**(superbatch) |
| v0.1.11 | 11-20 | 643 × 138 |
| v0.1.12-nightly.20261121.5038 | 11-21 | 103 × 44(multi-repo 批) |

- **v0.1.8(11-09,510 commits,官方尚未开始写 curated notes,以下取自 git feat)**:T3 Code 作为 MCP server 被其他 app 使用(对外暴露编排能力);Claude Fable 5.2;首次运行改单页 Welcome(替代三步 wizard);@-mention 模型给 agent 命名;Labs「Claude/Codex turn 后建议下一条 prompt」;云听写(OpenAI/Grok/OpenRouter);GitLab 全套(MR 评论、request changes、fork 维护者编辑、引用链接);线程 7 天自动 settle;DB 空间一键回收;iOS socket 压缩;营销站 8 语言。
- **v0.1.9(11-11)**:T3 Connect agent sign-in(替代复制 pairing code);**上传中也能发消息**(意图先落地);Claude session 级 MCP 审批(按 app 批量放行);无障碍 screen reader 播报 turn 进展;GitLab revert;OpenCode goals 跨端同步;PR 深链(直达评论/diff 行/checks/commit)。
- **v0.1.10(11-16,mega)**:对 assistant 回复的 reply-to;主题自定义(自定义色/CSS/全幅背景图);Windows 作为服务运行 + 远程更新;**agent 工作时保持机器唤醒**;T3 Connect 设备审批(新设备接入需主机批准);**native resume**(Claude/Codex/OpenCode/Cursor 停止的线程免新消息恢复);Settings 九语言。
- **v0.1.11(11-20)**:**浏览器隧道 + 端口转发**(agent 在别的机器起 dev server,直接在内置浏览器打开;一键转发到本地);**Issues 页**(Linear/GitHub/GitLab/Azure DevOps/Forgejo,存视图,issue 交给 agent 一路到 merged PR);Antigravity Auto 模式(agy 自审放行常规步骤);全 app 10 语言;Cursor 编辑早期消息;文件 pill 拖入 Finder/Explorer;side chat 从主线程引用;长线程 turn 提速;设备配对续期(30 天不再重配)。
- **v0.1.12 nightly(11-21/22)**:**multi-repo projects**(一项目多仓库一线程);**linked environments beta**(经已连机器串接新机器,免手输地址/配对码);**agents 一键落 GitHub stack(merge)**、**读 CI 失败日志 + 重跑 checks + PR 全操作(MCP 工具)**;TanStack Source forge(自托管 forge,feature flag);排队 slash commands;Claude Fable Fast Mode;表复制为 HTML;issue activity 链接;外部 worktree;自动 thread settlement 触发 project actions;Devin 命令 Windows 走 Git Bash。

**演进主线判读**:① 从「管理线程」走向「管理交付闭环」(issue→agent→PR→CI→merge 全链);② 从单机走向机器网络(linked environments、端口转发、地图式环境页);③ 从「人盯着跑」走向「无人值守」(auto-settle、keep-awake、排队命令、自动 settlement);④ i18n/无障碍/主题突然发力(500k 用户的兼容面)。

## §2 火力分布(git 统计)

**按目录**(2026-11-12 → 11-22,共 2894 commits):

| 目录 | commits | 说明 |
| --- | --- | --- |
| apps/server | 4687(文件次) | 编排/ provider/ checkpoint/ MCP —— 绝对重心 |
| apps/web | 4004 | web 是第一 UI 面 |
| apps/mobile | 2285 | mobile = 第三支柱,持续追平 web 功能 |
| packages/client-runtime | 726 | web/mobile 共享连接层,「多端同构」的落点 |
| apps/desktop | 433 | desktop 只是 web 壳(见 §4) |
| packages/contracts | 303 | 跨端契约变更极频繁 —— 协议即产品 |

**按主题**(v0.1.7 → HEAD,3694 commits,关键词计数):mobile 404、PR/forge 集成 264、remote/connect/tunnel 167、usage/limits 133、checkpoint/worktree/rewind 121、model 118、terminal/ghostty 104、issues/Linear 74、in-app browser 67、subagent 58、voice/dictation 52。

**判读**:他们眼中的重点 = ① 服务端编排与 provider 协议层(永远的重心);② **mobile 是差异化投入**(独有的量级,竞品没有真移动端);③ **forge/交付闭环是新战场**(PR+issue 合计 ~340);④ usage/limits 可见性被当核心功能养(BYO-sub 产品的「订阅仪表盘」价值);⑤ terminal 底座换代(libghostty-vt,C ABI/WASM,web 与 Android 同一渲染核)。

## §3 docs 全目录地图

`docs/` 四区:internals(34 篇)/ user(52)/ operations(10)/ orchestration-v2(9)。

**internals/**(每篇 = 一个「不看会写错」的约束):
- `overview.md`★本次精读 — 架构权威:所有权边界(server 拥有 provider/git/文件)、EventSink 单事务提交事件+投影+回执+outbox、effect worker 事后执行、事件日志只留 ~1 天重放窗口、checkpoint 稀疏 scope(多仓库项目只对被改仓库快照)、settlement 服务端所有(客户端不得用本地时钟推导)。
- `connection-runtime.md`★精读 — web/desktop/mobile 三端共享一个连接 owner;probe/超时/离线误报的完整判定树(500ms 探测、loopback 3s、DERP 15s);steady shells(移动端列表等两秒内到位的环境一起刷新);shell 快照可按广告能力省略行(`shellOlderSettled` 只保 25 条最新 settled)。**这是全仓最值得精读的文档**,与我们的 relay/live 双缓冲课题完全同构。
- `remote.md` — 连接路由模型:环境身份独立于路由;有序 route 列表依次尝试;loopback 绝不静默回退。
- `t3-connect.md` — relay 只管链接/凭证/隧道分配,**不代理业务流量**(唯一例外 webhook 转发,可选 Durable Object 持暂存)。
- `terminal-runtime.md`★精读 — PTY 服务端所有、增量 chunk 事件;5,000 行/8MiB 保留上限;libghostty-vt 单一渲染核;回放时剥离历史设备查询防 junk。
- `orchestration-v2/README.md`★精读 — V2 编排重写的「目标架构」宣言:App ids 是主键、provider ids 只是引用;子任务完成不关父 run;provider 切换 = 显式 context handoff(不是 prompt hack);能力驱动而非 provider 名字驱动;**全部要求源自 Codex app-server 探针实证**(「probe-derived requirements」一节列 6 条协议现实)。同目录 8 篇展开图模型/实体 ID/生命周期/线程血缘/MCP server/测试策略。
- `context-handoffs.md`★精读 — 便携 handoff 是 240 字符/条摘要,不假装等于 native context;legacy 迁移用另一套 32k 预算算法,两者不许混述。
- `testing.md`★精读 — 测试规则(review bot 共用):只测会坏的行为;test 必须单层;禁 sleep/polling/timeout/墙钟,**lint 规则硬闸**(`no-polling-loop-in-tests` 等 5 条)。
- 其余:`effect-services.md`(Effect 服务范式)、`web-ui.md`(组件 variant 契约)、`performance-regressions.md`(性能回归审计)、`model-manifest.md`、`providers.md`/`adding-a-provider.md`(provider 适配契约)、`environment-auth.md`、`devices.md`、`i18n.md`(11-17 新增)、`mobile-layout.md`(11-03 新增)、`pull-request-file-revisions.md`、`product-analytics.md`、`linux-snap-shot.md` 等。

**user/**(52 篇,按主题归组):安装/provider 9 篇(claude/codex/opencode/antigravity/kiro/pi/muse/fx/acp)+ 密钥 4 篇(含 1Password 两种接法,11-08 新增);composer/thread-sidebar/permission-modes/terminal/source-control;remote-access/guest-links/t3-connect-troubleshooting/devices/background-service;**multi-repo-projects(11-20 新增)**、triage(用 T3 Code 复现+triage issue)、faq★精读(官方口径全在这:非 harness、BYO-sub、T3 Connect 免费限额、不解码本地模型)。

**operations/**(10 篇,维护者手册):`release.md`★精读(见 §6)、`development.md`(runbook)、`scenarios.md`★精读(见 §6)、`connect-setup.md`、`relay-observability.md`、`observability.md`、`background-verification.md`、`android-notifications.md`。

## §4 AGENTS.md 工程品味(Taste)提炼

全文 217 行,给「替他们写代码的 agent」读。结构 = 身份 glossary → 三条自伤禁区 → hit-every-surface 清单 → dev server 纪律 → 测试规则 → PR 规则 → 文档规则 → **Taste**。

**Theo 自述(note from Theo)**:「我喜欢雄心勃勃的想法、简单的系统、看起来理所当然的软件。不要因为复杂已经存在就保留它;不要因为机器看起来架构上很厉害就引入它。理解真实约束,然后为『让正确行为不令人惊讶的最小模型』而战。」——measure twice cut once + yagni 双持,反 scope creep。

**Taste 逐条**(都是可 lint/可 review 判定的):
1. 复杂度只属于 adapter 边界;编排保持纯,UI 保持笨。
2. 服务端功能 = service;transport(ws handler/HTTP route/MCP tool)只做 decode→调一个 service 方法→map error。
3. `components/ui` 的导出自有外观;消费方只许选 variant/size,禁 className 重样式(`shadcn/no-restyle` lint);布局类归父元素。
4. 可复用 Effect 函数用 `Effect.fn("Service.operation")` 带稳定 span 名;span 太频才用 Untraced 并就近写理由。
5. 推断类型优先于注解;`any` 是敌人。
6. 默认零注释;只为「代码表达不了的约束/外部怪癖/不变量」写,一行能写就一行,四行封顶(`no-low-value-comments` lint)。
7. React effect 只用于「与 React 之外的东西同步」;能在 render 派生、handler 里做的就不 sync state(`no-unreasoned-state-sync` lint,每个留下的 effect 必须写理由)。
8. 「用户整天开着 agent,会注意到掉帧、撒谎的 spinner、过期的 label」——禁持续重绘动画(高刷屏 GPU)。
9. **「如果本文件的规则挡了你手上的任务,大声说出来,拿人工签字再破例。」**

**三条自伤禁区**(agent 在真实生产机上开发 T3 Code 的安全规则):不许按名字模式 kill(kill by pattern 会杀到别的 dev server);不许写 live install(`~/.t3/userdata` 是开发者真库,只读拷贝可以);不许 bake localhost 进 bundle(单 origin + Vite 代理,设了 VITE_WS_URL 就弄坏所有远程浏览器)。开头直言:「大部分 T3 Code 贡献来自 T3 Code 自己,而且常常是远程控制的」——**他们用自家产品开发自家产品,AGENTS.md 的一部分职责是保护宿主**。

**hit-every-surface 清单**(「最常见的缺陷 = 只在你测过的路径上有效」):每个前端改动要自答 entry points(命令面板/keybinding/settings 也可达)/clients(web+desktop+mobile)/providers(11 个 adapter 逐个决策)/agents(能力做成 service 才能被 MCP 工具与定时任务触达)/contracts(改 schema 则四端全跟)/reverse states(加了进路必须加出路与查看,「单向门是 bug」)/connection modes(local/relay/tunnel)/languages/docs。**这张清单与我们的 rules/frontend.md 是同一物种,但他们是 lint+review-bot 强制,我们是自觉**。

**其他硬纪律**:`vp run check:changed`(只跑改动文件的快速检查,CI 才跑全量);typecheck 用 effect-tsgo(Rust TS 7 checker)缓存按包;测试禁止 timeout/polling(见 §3);浏览器测试用 `await using screen` AsyncDisposableStack 强制清理(lint enforce);真实 turn 烧钱 → 免费 Replay provider 看流;移动验证有 dev-client 秒装缓存。evals/ 体系:MCP 工具描述/schema/标题生成等「模型可见文本」改动必须跑 eval,case 先于修复(旧文本必须 fail)。`.agents/skills/`:contribution-triage、launch-video、test-t3-app、test-t3-mobile —— 四个 skill 全是「让 agent 替团队干活」的岗位说明。

## §5 官方叙事要点(全部带 URL)

- **定位一句话**:「The open-source control plane for coding agents」(https://t3.codes/)。副标:Orchestrate Claude Code/Codex/Antigravity/OpenCode/Cursor/Grok from one surface. Bring your own subscription. Fork the whole thing. 下载按钮文案「Steal our code (legally)」。
- **harness 理论**(Theo,2026-11,https://t3.gg/blog/post/what-is-a-harness ,X 版 https://x.com/theo/status/2113424203345265053 ):人类用 interface,LLM 用 harness;Claude Code = TUI + Anthropic Agent SDK 两件套;**T3 Code = restaurant,chef=LLM,kitchen=harness,「带任意厨房进店的餐厅」**;T3 Code 不自建 harness,把自己的编排能力做成 MCP「cookbook」递给厨房(例:Claude Code 线程里 spawn Codex subagent);不翻 cookbook 什么都不影响。
- **商业模型**(https://t3.codes/ + docs/user/faq.md):T3 Code 免费 MIT,「There's no way to pay us to use T3 Code」;BYO-sub 不转售 token;T3 Connect(他们的 tunnel/relay,Cloudflare Workers + PlanetScale + Clerk + Axiom)也免费,**每账号 3 台机器**;绑 T3 Chat 账号升 Pro=10 台/Premier=100 台 —— 变现靠 T3 Chat 订阅联动而非 T3 Code 本身;官方自留退路:「if the bill gets unacceptable we may have to change course」;代码与 prompt 不过 T3 服务器,relay 只建链不代理会话;遥测可关。
- **信任叙事**:「We work with all of the labs and T3 Code is within the TOS」——与 SpaceXAI(实为 xAI)直接合作 Grok Build/Cursor 集成;Claude 5h 限额 1.7× 多扣 bug 修复于 v0.1.7(Theo 亲自发文 https://x.com/theo/status/2114166439813017873 )。
- **规模叙事**:官方自称 500,000+ users(AGENTS.md「over 500,000 users」/营销站「Tolerated by over 500,000 devs」);stars 21k(8-31)→ 33.8k(10-31)→ 营销站现写 70k+;dhh 宣布 Omarchy 内置安装器(https://x.com/dhh/status/2090332565966123041 );DavidKPiano:「It's like Claude Code if they didn't vibe-code the entire thing」。
- **远程优先自述**(faq.md):Theo 本人「Less than 5% of my prompts run on my laptop. Run `t3 up` on that machine」——**产品老板自己的工作流就是产品形态**。
- **V1→V2 编排迁移**:https://github.com/pingdotgg/t3code/issues/14871 (标题即 [IMPORTANT] Moving from T3 Code Orchestrator V1 to V2)——大重写敢于在 40 万用户产品上做,迁移按 issue 公开推进。

## §6 对 agents-remote 的启示

1. **「意图持久化」是他们 10 天里的持续主线**:v0.1.9 上传中可发 → v0.1.12 排队 slash commands → 全程 auto-settlement。与我们 prompt 队列 v1/v2 同方向,他们的形态更彻底:命令回执 + outbox effect worker + 事件日志只留 ~1 天重放窗口(投影是唯一真相,旧事件可裁)。我们的 relay 快照路线可以对着 overview.md 的 EventSink/ProjectionMaintenance 设计校准。
2. **hit-every-surface 清单值得移植成我们的 review checklist**:reverse states(单向门=bug)、agents(能力做成 service 才能被工具/定时任务触达)、contracts(改协议四端全跟)、connection modes(逐模式自答)。我们已有 reviewer 触发表,缺的是「每个前端改动逐项自答」的清单形式。
3. **scenarios:prove 是探针体系的下一站**:一个 scenario = 真 server + 真浏览器 + 免费回放 agent 扮演模型,`failsOnBase && passesOnHead` 才算证明,产物(截图对 + markdown 表)直接进 PR。我们已有探针入库标准(断言 + 覆盖单测验不到的行为),缺「base/head 双跑对照」这层证明力和回放 agent 这个免费化手段。
4. **模型可见文本要有 evals 层**:MCP 工具描述、agent 指令、生成标题 = 全部进 evals(先于修复加 case,旧文本必须 fail)。我们做 agent-facing 文案(未来多 agent 编排)时直接照抄这套组织法。
5. **贡献治理是产品决策不是社区姿态**:CONTRIBUTING.md 通篇「Don't contribute」——只收 bug fix、feature 需 vouch、3 open PR 上限、点名拒绝特定模型;review 容量是瓶颈的自觉。agents-remote 若开源,这份文件是模板。
6. **稳定发布节奏的机械保证**:nightly 是 release candidate,stable = 验证过的 nightly 原样晋升;发布顺序有不变量(CLI archive → npm launcher → hosted web,依赖图写死在 release.md);发布摘要由模型按严格 prompt 生成(「新设置/大 diff/多支持一个边缘 case 不配 bullet」)。我们的手动发版可借鉴其「验证 nightly 才晋升」与摘要判据。
7. **文档书写纪律**(AGENTS.md Documentation 节):内部文档只收「读代码得不到会写错」的约束;决策变更时重写原文而非追加新版本叙述;「合并的 PR 就是实现记录,不在库里留第二份 checklist」。对照我们 docs 治理可吸收:docs/internals 的准入问题 =「没有它 maintainer 会写错什么」。
8. **BYO-sub 的商业模型账**:控制面免费 + 云中继免费配额(3 机)+ 与付费产品联动解锁(10/100 机)+ relay 永不代理业务流量(成本与信任双压)。agents-remote 的 relay 若走向公网,这套「免费层 + 联动 + 不碰数据流」结构是现成参考。
