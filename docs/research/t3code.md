# T3 Code 调研与对比学习报告（v2）

> 首版 2026-11-13（v0.1.7 时点，浅克隆限流下的抽样调研）；**v2 重写 2026-11-23**：源码完整化（unshallow，origin/main 2026-11-22）、四路深挖（体验层 / server 机制 / 社区反馈 / 演进叙事），分册为本报告的证据层。首版一处机制结论有误已更正（§7）。
>
> 分册索引（全部带源码行级/URL 级证据）：
> - `t3code-deep-ui.md` — 体验层：「快」的基建、消息流三状态机、composer 默认值、移动端决策、动效哲学、微交互
> - `t3code-deep-server.md` — orchestration-v2 机制精读：命令→事件→投影→副作用全链、队列/审批/checkpoint/delegate/同步协议
> - `t3code-deep-community.md` — 社区定案：12+ 轮多源搜索（HN/Reddit/App Store/Google Play/YouTube/博客/中文社区），主张全部带 URL 与证据分级
> - `t3code-deep-evolution.md` — v0.1.7→v0.1.12 逐版演进、git 火力分布、docs 全目录地图、AGENTS.md 工程品味、官方叙事

---

## 1. 产品与规模（2026-11-23 更新）

| 维度 | 事实 |
| --- | --- |
| 定位 | 「open-source control plane for coding agents」——本机跑 agent，桌面/web/手机一个界面；BYO-subscription 不转售 token【官方】 |
| 规模 | 自称 500k+ users；stars 21k(8月)→33.8k(10月)→营销站现写 70k+；dhh 的 Omarchy 内置安装器【官方/社区】 |
| 版本节奏 | v0.1.8(510 commits)→v0.1.9(198×31人)→**v0.1.10(1924×360人 superbatch)**→v0.1.11(643×138人)，v0.1.12 走 nightly；PR 编号 10 天内 #35868→#40951（5000+ PRs）；nightly 每 30 分钟检查自动出、stable = 人工验证过的 nightly 原样晋升【git/releases】 |
| 主力自述 | Theo 本人「Less than 5% of my prompts run on my laptop」；「大部分 T3 Code 贡献来自 T3 Code 自己（远程控制开发）」——产品老板的工作流即产品形态【faq/AGENTS.md】 |

## 2. 社区定案：用户爱的到底是什么（直接回答「感觉」问题）

12+ 轮多源搜索的收敛结论（证据分级与 URL 见 deep-community 分册）：

1. **第一名是「不在工位也能继续」**【强，四源交叉】：手机远程 + 多机聚合（个人+公司订阅混管）+ 关笔记本让 agent 继续干活 + 地铁上批准权限。T3 的核心价值主张建立在这条上，不是「更好的聊天界面」。
2. **线程收件箱 = 注意力管理**【强，三独立源点名 ADHD 用户】：「Snooze/Settle/Archive——唯一一个多线程工作不被压垮的工具」。settle 语义被用户感知为「这个产品懂我的一塌糊涂的多线程工作方式」。
3. **「快」是被用户验证的差异点**【中-强】：官方红线「treat a dropped frame as a bug」有基建支撑（§3），App Store「snappiest agentic workflow client」与 YouTube「you cannot beat the speed」可交叉。
4. **内置浏览器/live preview**【中，三独立一手】：dev container 用户「为它删光了所有端口暴露」——「看不见的就爱」功能，我们的天然对标点（PWA 本身是浏览器）。
5. **PR/交付闭环内嵌**【中-强】：「最被低估的功能」——分支线程、PR review、merge 后自动 settle、（0.1.11+）Issues 页一路到 merged PR。
6. **免费 MIT + BYO + 不锁定**【强】：自托管深度用户生态（每容器一 server、基于开源 API 造上层编排）。
7. **离线可用/弱网韧性**【中】：移动端把「spotty signal 下线程仍可读」当核心卖点。

**边界共识（同样清晰）**【强】：单 harness 用户增益有限，「只用 Claude Code 的话留官方 app」——T3 的价值公式 = **多 provider 聚合 × 多机 × 移动**，三者缺一价值坍缩。我们的产品文案与功能优先级应押同一公式。

**吐槽两层**（详单见分册 §3）：alpha 可原谅类（早期慢/崩溃/连接掉/Android 通知失效）vs 结构性类——token 5h 窗口计量 1.6-1.7x 偏差被官方 issue #24649 实锤（SDK 计量层问题，**我们直 spawn CLI 无此层，是真实结构性优势**）、provider 适配质量分层、功能 PR 不收致用户自维护 fork、「Theo 口碑与产品口碑解耦」的品牌噪声、默认 Full access + 遥测默认开。

## 3. 「感觉」的来源：打磨是三件可指认的工程（体验层）

社区感受到的「贵」不是氛围，是 deep-ui 分册展开的三件事：

1. **性能是有基建的工程面**：基准测试随仓（1000 线程排序、1000 条消息打 200 delta）、自定义 lint 禁「测试等帧/等真实时钟」（倒逼事件与计数断言）、协议级 wire dedup（服务端置空客户端已有的 body，流式重发带宽结构性省掉）、markdown 三层渲染优化（按块切分只重渲末块→块级 LRU→岛渲染静态子树绕开 React reconcile）、React Compiler 全量编译有 coverage 测试逐文件断言。
2. **消息流基础动作有显式状态机**：滚动跟随按输入源（滚轮/触摸/滚动条/键盘）分别判定释放意图，误释放永不自动重连；折叠展开做锚定（被点的行不动、内容向下展开）；折叠态/滚动位置按线程 identity 跨切换还原；流式 markdown 新 token 只重解析末块。核心命题：**机器绝不与用户的阅读意图抢方向盘**。
3. **状态语义纪律一以贯之**：色相表状态类型（amber=待审批/indigo=待输入/red=失败/灰=等待）、脉冲只给「正在干活」、需要人注意的一律不脉冲、全场多图标脉冲同拍起步；动效默认全关 + steps() duty-cycle 关键帧（120Hz 下合成器更新次数 20 倍差）+ 循环动画不可见即 paused。
4. **语义默认值替用户做对了推断**：follow-up 默认 steer（排队是 opt-in）；**待审批在场时发送自动按「改道」处理**（用户在 agent 等审批时打字回车，意图显然是改道不是排队）；队列编辑有精确离队退出语义（未改静默关/已改转草稿/草稿非空则弃）。
5. **微交互层**（「显得贵」的长尾）：keybinding 注册表约 100 命令 + when 子句引擎、thread undo 药丸、复制反馈锚定按钮、相对时间定时到下一个边界才重渲、屏幕阅读器按 50ms/字符计算播报 hold、空态文案「说真因」（"This computer is off" 而非笼统 error）。

## 4. 机制层：四个可局部移植的原语（server 深读定案）

orchestration-v2 = 「纯命令决策 + 单事务落盘（事件/投影/回执/outbox 同 commit）+ 租约副作用 worker」的事件溯源机，串行化靠 per-thread KeyedLock（**非全局单 worker，首版报告有误**）。17 张投影表 + 1 天事件保留 + boundary 先行修剪是 DB 权威的代价面；整体不移植（首版裁定维持，分册 §8 有性价比复核），但其中四个原语可局部引入：

1. **命令回执幂等**：insertIfAbsent 占位 commandId，重复命令直接重放已存事件返回同一结果——多端双击/网络重试不双发的地基。我们所有发送/撤回/审批均无幂等层。
2. **重启恢复定案**：重启后 running 显式二选一（stop / 合成 CONTINUE_PROMPT 续跑，链深上限+环窗）、queued 重物化、审批挂起阻断续跑——直接对症我们「API 重启孤儿 CLI + 快照谎报空」挂账。
3. **队列一等化**：排队消息 = status="queued" 的 run 投影（无独立表，持久化=事件溯源本身）；重排/promote-to-steer（活动插队，steer 被拒自动落回排队）/queueHeld 原因广播。对照我们队列 v2：快照+撤回/编辑已有等价，缺重排与插队升级。
4. **子任务问题升级**：子 agent 卡问 → 向父线程排队发 wake 消息（带代答指令），问题解决即撤回 wake——OPC 多 agent 编排最值得抄的原语（比通知总线简单且可重放）。

另有三条机制面经验：审批 = 持久化一等实体（pending/resolved/expired/cancelled + 首答胜出 + 挂起阻断续跑/入睡）；checkpoint 回滚「turn 活动中拒绝」+ rolled_back 标记不删历史（我们 checkpoint 批可补的两个细节）；订阅先行 + sequence 去重 + 有界预算溢出 fail-fast（修「断连窗口帧丢失」族问题的结构性方案——我们队列 v2 的种子空洞 P1 即同族）。

## 5. 演进主线：他们把火力投在哪

10 天 2894 commits 的分布判读（deep-evolution 分册）：

- **从「管理线程」→「管理交付闭环」**：issue→agent→PR→CI→merge 全链（Issues 页五 forge、PR 全操作 MCP 工具、CI 失败日志重跑、merge 即 settle、自动 settlement 触发 project actions）。PR+forge 集成合计 ~340 commits，是 server/mobile 之外的第三战场。
- **从单机 → 机器网络**：linked environments beta（经已连机器串接新机器）、浏览器隧道 + 端口转发（agent 在别的机器起 dev server 直接内嵌打开）。
- **从「人盯着」→「无人值守」**：auto-settle（7 天线程自动结算）、agent 工作时保持机器唤醒、排队 slash commands、usage-limit 自动续跑。
- **500k 用户的兼容面突然发力**：i18n（11 语）、无障碍（screen reader 播报+设置开关）、主题（VS Code JSONC/Open VSX 直装）、Windows 服务形态。
- **AGENTS.md 是工程品味的完整表达**：Taste 九条全部可 lint（review bot 强制）——「复杂度只属于 adapter 边界」「服务端功能=service、transport 只做 decode→调 service→map error」「组件 ui 禁 className 重样式」「React effect 只用于与 React 外同步且必须写理由」「禁持续重绘动画」；hit-every-surface 清单（每个改动自答 entry points/clients/providers/agents/contracts/**reverse states（单向门=bug）**/connection modes/languages）。「如果规则挡了任务，拿人工签字再破例」。三条自伤禁区专为「agent 远程开发 T3 自身」设计——dogfood 深度是工程纪律的来源。

## 6. 可学习清单（v2 整合版，四路归并去重）

> 现状锚点：provider 能力表（已落地 2026-11-13）、settle 批（16c9911）、checkpoint 批（对话级回滚已落地）、prompt 队列 v2（0d16d5d9 服务端化）。

### A. 立即可做（低成本高价值，多与已有批次的边界补全）

| # | 项 | 出处 | 对应我们 |
|---|---|---|---|
| 1 | **follow-up steer 语义 + 待审批在场发送=改道**（默认 steer 可选 queue；审批卡片在场时发送自动改道而非排队） | deep-ui §3 | 队列 v2 只做了排队形态，语义默认与联动缺位 |
| 2 | **队列编辑离队退出语义**：run 离队→未改静默关/已改转草稿（草稿空才转）/否则丢弃 + 不可编辑 blocked reason | deep-ui §3 | 队列 v2 编辑有，离队 watch 无 |
| 3 | **状态语义双轴**：色相表状态类型、脉冲只给「活」、灰表等待、多图标同拍起步 | deep-ui §5 | 会话行状态点有色无纪律成文 |
| 4 | **steps() duty-cycle + 循环动画可见性门控** | deep-ui §5 | 动效 token 已单源，无 steps 化与门控 |
| 5 | **审批卡片双形态收敛**（Approve/Decline 实心描边两钮、其余溢出、warning tooltip、composer|inline 同组件） | deep-ui §3 | 审批中心已有，卡片形态待对照 |
| 6 | **空态/加载态分工 + 说真因文案**（"This computer is off" 式归因 + 编号设置步骤） | deep-ui §5 | 断连/离线空态笼统 |
| 7 | **settle 排队宽限 gate**：排队 turn 2 分钟内启动的不判入睡 | deep-server §6 | settle 批补一条 gate |
| 8 | **回滚细节两件**：turn 活动中拒绝回滚 + rolled_back 标记（不删历史） | deep-server §4 | checkpoint 批补 |
| 9 | **离线可用线程**：已回放消息本地可读 + 待发 prompt 本地排队（断连也能看会话/攒 prompt） | deep-community §1.8 | 架构自然支持，未做产品化 |
| 10 | **composer 占位符教触发语法** + 相对时间边界定时器 | deep-ui §3/§6 | 细节质感 |

### B. 中期方向（中成本，需立项排期）

1. **流式 markdown 分块渲染 + 块级 LRU**（岛渲染可后置）——长会话流式帧率的根本解，我们渲染层无块缓存。
2. **滚动跟随状态机**（per-input-source 释放判定 + 误释放不自动重连）+ **折叠锚定与跨会话折叠态记忆**——流式阅读核心手感。
3. **命令回执幂等**——多端双击/重试双发的地基，队列/审批面扩之前先落。
4. **重启恢复定案**（孤儿 CLI 对症：running 二选一 + queued 重物化）。
5. **队列一等化**：重排 + promote-to-steer + queueHeld 原因广播。
6. **Web Push + 感知状态投影**（首版学习点 4 维持，社区面再证：离开页面的状态感知是最大缺口）。
7. **previewUrl 内嵌预览**（t3.json 式声明 + 项目页 iframe）——PWA 天然是浏览器，低成本高感知。
8. **用量页按 provider/线程聚合 + 5h/周窗口 pacing**——BYO 产品被点名的核心功能；我们可加「管道不改变计量」的可验证主张。
9. **子任务问题升级原语**（OPC 多 agent 方向的起步件）。
10. **订阅先行 + sequence 去重 + 有界预算**——WS 协议层结构性加固。
11. **scenarios:prove**（base/head 双跑、failsOnBase&&passesOnHead 才算证明）——探针体系的下一站。
12. **hit-every-surface review checklist**（reverse states 单向门=bug 等）移植进 rules/。
13. **模型可见文本 evals 层**（case 先于修复，旧文本必须 fail）——多 agent 编排做 agent-facing 文案时照抄。

### C. 明确不跟（裁定维持或新增）

- 自有 DB 权威 / 17 张投影表全家桶（首版裁定，deep-server §8 性价比复核维持；按需局部引入 §4 原语即可）
- 原生 app 三端（PWA 路线已定；Live Activity/锁屏卡片如实记录为覆盖不了的面）
- Effect 全栈、React Compiler 全量基建（工具链耦合）、Timeline minimap、keybinding 全家桶、VS Code/Open VSX 主题导入
- 「只收 bug fix 不收功能 PR」的贡献治理（个人项目无此瓶颈；但「宁可少而配置化，不做死黑盒」的教训成立）

## 7. 首版报告更正记录

| 首版结论 | 实况（deep-server 源码级） |
|---|---|
| 「orchestration-v2：单 worker 串行化 command」 | **不实**——per-thread KeyedLock + 特例锁（fork 源锁/删除信号量/messageIntake/subagent 父先子后），无全局单 worker；真正的串行化基石是命令回执幂等（insertIfAbsent + 重复 commandId 重放已存事件） |
| 「消息队列在 server，重启存活」（未展开） | 队列无独立表——status="queued" 的 run 投影行，持久化=事件溯源本身；重启由恢复服务重物化，running 合成 CONTINUE_PROMPT 续跑（链深 3 + 环窗 + 审批阻断） |
| 社区反馈「以 App Store 摘要为主」 | 本轮 12+ 轮多源重收（HN Algolia 全评论树/App Store 50 条全文/Google Play/YouTube/博客深评/中文社区），ADHD 收件箱、内置浏览器、离线韧性、token 计量 issue #24649 等均为新增一手证据 |
| 方法论教训 | 首版浅克隆 + blob 限流下的「抽样源码」会产出**貌似确定的错误结论**（单 worker 即例）；竞品深调研必须完整 clone + 符号级走查，概要级阅读只配写「待核实」 |

## 8. 一句话对比（v2）

T3 Code 用 **5000 PRs/10 天的工程火力 + 「性能/语义/默认值」三件打磨工程** 换来了「用户觉得它贵」的体验和「不在工位也能继续」的价值定位；它证明了控制平面产品的胜负手在**多 provider × 多机 × 移动**的交集与**注意力管理**的体贴，而非单点功能。我们同路线但轻量（PWA + JSONL 权威 + Bun.spawn 直拉）：结构性优势 = 无 SDK 计量层（token 计量真实）+ tmux 终端 + 极简管道；要对齐的不是它的架构重量，而是 §6A 清单里那些「让正确行为不令人惊讶」的默认值与语义纪律——那才是「别的用户反馈的感觉」的真正来源。
