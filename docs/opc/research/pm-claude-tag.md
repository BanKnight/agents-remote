# Claude Tag 产品调研（PM 视角）

> Anthropic 官方 Slack 产品，2026-06-23 公开发布（Team/Enterprise beta）。闭源 SaaS，无源码可查；本调研以官方文档（claude.com/docs/claude-tag）与官方发布（anthropic.com/news/introducing-claude-tag）为第一手权威，辅以权威媒体/深度第三方/社区讨论。
> 证据分级：✅ 官网直证（官方文档/官方发布/官方产品页）｜🟡 二手（权威媒体、深度第三方、产品负责人公开言论）｜⚠️ 推断（PM 综合推断 / 社区未证实）。
> 目标读者：agents-remote 产品决策者。对照 PRD 见 `../design/multi-agent-prd.md`（角色/任务/房间/看板/记忆/agentmore 六概念）。

---

## 1. 一句话定位

Claude Tag = Anthropic 官方的**「团队级 AI 队友」**：把一个 Claude 装进 Slack 频道作为共享成员，任何人 `@Claude` 就能派活，它带着**频道累积的团队上下文、管理员配好的团队工具账密、跨会话/跨天的记忆**，异步干完活（几小时到几天），把答案、文档或 draft PR 贴回 thread。

本质一句话：**一个团队共用一个 Claude 身份**（不是每人一个），Slack channel 就是它的工作台、记忆库和审批现场。✅

---

## 2. A. 根本使用场景

**核心场景：团队在 Slack 频道里协作时，把「知道团队上下文、握着团队工具、能自己跑很久」的活甩给一个数字队友，然后该干嘛干嘛，回来收结果。**

一段用户旅程（官方文档的默认叙事，✅）：

1. **管理员一次性 setup**：Owner 在 `claude.ai/admin-settings/claude-tag` 配对 Slack workspace（`@Claude connect` 拿配对码）、选工具、连 GitHub、设 org 月消费上限、launch。之后整个团队零配置直接用。✅
2. **任何人派活**：频道里一条消息 `@Claude where are we on launch prep? Pull together what's still open from this channel.` —— 就这么一句话，开干。✅
3. **它进入工作态**：thread 里出现「is thinking…」，长任务变成**实时 checklist**（Done: 读了 14 个 thread / Done: 交叉核对 Drive 里的 launch plan / In progress: 起草状态摘要），Slack 不发编辑通知所以 thread 可能看着"冻结"，实际在动。✅
4. **期间任何人可插手**：同事 Sam 不用再 @，直接在 thread 里回"fold in the vendor quotes from last week's thread too" —— 会话属于整个频道，谁都能接力/纠偏/续做。✅
5. **结果落 thread**：答案、文档、图表或 draft PR 贴在 thread，全频道可见可续用；每条回复 footer 有「Open session in Claude」看完整执行记录（含每次 tool call）。✅
6. **之后可以转主动**：把一次任务沉淀成 routine（每天 9 点 digest / 盯某个 PR / 监控告警主动诊断），或靠 ambient 让它不用 @ 也把该管的管起来。✅

主场景之外有两条支线：**DM**（个人任务，跑你自己的 claude.ai 账户和 connector，结果归你）✅；**你自己的 solo 频道**（一个人 + Claude，享受频道的一切能力但只给你看）✅。

**关键体验差异点**：这不是一个聊天机器人，是一个「**同事**」——它读整个频道的历史、记住团队的决定、用团队的账密干活、干一半能被别人接手、还会自己找活干。官方反复强调：**Claude Code = 单人同步；Claude Tag = 多人异步主动**。✅

---

## 3. B. 解决的痛点

结构化列具体痛点（症状 + 为什么痛）。每条一句话。

| # | 痛点 | 为什么痛 |
|---|------|---------|
| 1 | **上下文从头解释** | 每次起 agent 都要把项目背景、技术栈、团队约定重新讲一遍；换个人问又是重讲一遍（官方：users 不用 from scratch over and over ✅） |
| 2 | **工具账密分散** | 每个工具都要个人配 connector、以个人身份动作，换人/离职即失效，且无法区分「谁（哪个 agent）干的」✅ |
| 3 | **agent 以个人身份动作不可审计** | PR/查询/改动都挂在你名下，说不清是 agent 做的，安全团队没法归因 ✅ |
| 4 | **同步 chat 要人盯** | 传统 agent 会话要你在线等、一轮轮跟，占着你的注意力 ✅ |
| 5 | **团队知识孤岛** | 决定散在个人 DMs / 个人会话 / 某个人脑子里，别人够不着；"said aloud only" 的信息 agent 永远看不到 ✅ |
| 6 | **交接断裂** | A 派了活走人，B 接手时没有上下文，工作记录不在团队可见处 ✅ |
| 7 | **线程/任务静默没人管** | 一个问题/任务挂起几天没人跟进，靠人肉盯 ✅ |
| 8 | **跨工具数据要人来回切** | metrics 在 Datadog、代码在 GitHub、文档在 Notion、CRM 在 Salesforce，人要在工具间手动搬运 ✅ |
| 9 | **小改动永远拖着** | 文档过期、配置改名、依赖落后一版——太小不值得排期，堆成技术债（官方用例：hand off the change you keep postponing ✅） |
| 10 | **agent 改代码谁 review 说不清** | 没有清晰的「agent 产出物 → 人审批 → 落库」闭环，merge 权模糊 ✅ |
| 11 | **agent 权限两难** | 权限给太小干不了活、给太大裸奔；个人级授权在共享场景根本不可行 ✅ |
| 12 | **凭证安全** | 把 API key 塞进 sandbox 等于把钥匙交给模型；一旦泄漏无法追溯 ✅ |
| 13 | **成本失控** | 自主 agent 一直跑会悄悄烧钱，传统 seat 订阅算不清、拦不住 ✅ |
| 14 | **agent 做了什么说不清** | 没有审计轨迹，出了事没法复盘「它当时为什么这么干」✅ |
| 15 | **人成了审批瓶颈** | 每个决定都要人盯，团队扩展时「review 带宽」跟不上并发 thread 数 ✅ |

---

## 4. C. Feature list

分维度全列。每条一行（功能名 + 一句话说明），宁多勿漏。✅ 项均出自官方文档，未逐条标（本节整体 ✅ 官方）；🟡 单独标。

### 4.1 用户入口

| 功能 | 说明 |
|------|------|
| `@Claude` mention | 频道里 @ 即保证响应，一句话带任务开一个会话 |
| `/invite @Claude` | 任何人可把 Claude 加进频道；@ 时 Slack 也会提示加 |
| 无 @ 自动回复 | 频道顶层消息「它判断值得回」就回（ambient） |
| DM（一对一） | 个人任务；跑你自己的 claude.ai 账户 + 个人 connectors；group DM 不支持 |
| 转发消息变任务 | 把现有 Slack 消息 forward + 附一句话，即成一个任务 |
| 贴 thread 链接交接 | 长讨论粘链接让它读 thread 后接手 |
| Configure 链接 | 每条回复 footer；打开频道配置页（instructions / Respond automatically / 连接列表） |
| Open session in Claude | 每条回复 footer；只读完整执行记录页（含每次 tool call） |
| `!` 命令族 | `!help` `!restart` `!mute` `!unmute` `!feedback` `!routines` `!fork` |
| 你自己的 solo 频道 | 一个人 + Claude 的频道，能力同团队频道，结果只给你看 |
| `/remove @Claude` | 任何成员可把它移出频道（Slack admin 可限制） |

### 4.2 仓库连接

| 功能 | 说明 |
|------|------|
| Claude GitHub App | Claude 自己的 GitHub 身份；PR 以「Claude」为作者 |
| GitHub 组织链接 | 一次链接，`claude.ai/admin-settings/github`，与 Claude Code 共享连接 |
| 仓库 grant per bundle | 每个 Access bundle 选仓库；按频道粒度授代码权限 |
| GitLab 连接 | 以 service-account token 而非 app；可读代码/管 issue/评 MR/看 pipeline |
| GHES 支持 | GitHub Enterprise Server 需公网可达，自建 app |
| `CLAUDE.md` 自动加载 | clone 后 `.claude` 配置进会话（项目上下文/规则/技能/hooks） |
| `.mcp.json` 不加载 | 仓库级 MCP 不进会话；连接只来自 Access bundle |
| dependencies 安装 | 标准 sandbox 镜像；额外运行时写进 `CLAUDE.md` 按需装 |
| draft PR 产出 | 代码任务结果 = draft PR，链接回 thread，进你的 review 队列 |
| PR 订阅 | 盯某 PR，CI 完成/新 review 时贴 thread、失败可 @ 人 |
| GitHub Actions 读与重跑 | 读 workflow run/logs、重跑失败 job、cancel；**不能** dispatch/approve（需人） |
| 仓库问答 | 读 commit history + CODEOWNERS 回答「谁改了/谁负责」 |

### 4.3 消息与 @tag

| 功能 | 说明 |
|------|------|
| 线程接力 | 会话激活后该 thread 的回复都送达，无需再 @ |
| 上下文窗口 | @ 进已有 thread 给「根消息 + 前 50 条」，长 thread 需复述关键 |
| 编辑不触发 | 改消息只发 note（前/后文本）它读了不行动 |
| 删除不通知 | 删消息它保留已读版本；删 thread 首条无回复则关会话 |
| 静默单 thread | "only respond when I @-mention you" 停跟该 thread |
| `!mute` / `!unmute` | 按 thread 静音/解除；直接 @ 自动解除 |
| Respond automatically 开关 | 频道级；关掉则仅 @ 才回（三处可改：Slack 问它 / Configure 页 / admin 页） |
| 自我静默 | 频道内容持续无回应价值时它自己关掉非 @ 回复，@ 重新开启 |
| 回复署名带任务 | `Claude [reviewing the launch checklist]`——名字即状态 |
| 边界：不响应场景 | guest 频道默认关、Slack Connect 外部共享频道永不工作、跨 org 共享频道拒绝 |

### 4.4 协作 multiplayer

| 功能 | 说明 |
|------|------|
| 每频道一个共享 Claude | 一个 identity 服务全频道；谁看都一样、交接无缝 |
| 任何人可 steer | 回复他人 thread 即接手/纠偏/续做，不用重 @ 不重开 |
| 工作记录全频道可见 | checklist + 结果都在 thread，全员可看可续 |
| `!fork #channel` | 把当前 thread 会话延续到另一频道（公共频道、双方成员），双向链接 |
| checklist 实时更新 | 长任务首回是清单，编辑 in place（Slack 不通知，看着像冻结） |
| 频道级 session | 除 thread 外，频道顶层也有一份 session（ambient 回复用它） |
| `!restart` | 卡住/上下文脏时归档当前 session 起新的（thread 级/频道级） |
| workspace search 共享 | 可关键词搜公共频道（同 Slack 用户权限），不用在频道里 |

### 4.5 proactive webhook（主动与事件）

| 功能 | 说明 |
|------|------|
| ambient 模式 | 不用 @ 也回：逐条判「这条需要回吗」；per-channel 开关 |
| 主动跟 quiet threads | 沉寂未解决的任务它会跟进 |
| cross-channel 同步 | 把 A 频道的相关信息主动同步到 B 频道 |
| scheduled jobs | 自然语言建定时任务（"every weekday 9am 读 open threads 发一行状态"） |
| channel watching | 盯若干频道，命中主题每天汇报 |
| PR 订阅 | 订阅单个 PR，CI/review/merge 事件贴 thread |
| 事件驱动依赖 | **等 blocking dependency（PR merged / CI green / 上游 done）天级后再续**——即社区所称「stacked prompts」🟡（官方文档证实现 PR 订阅 + 事件触发机制 ✅，天级等待与命名来自 Cat Wu 发布帖 🟡） |
| 监控告警诊断 | 定时查 Datadog/PagerDuty，新告警先发第一手诊断 |
| routine 管理 | `!routines` 列出/`disable` 停用；创建者离开组织继续跑、被移出频道才停 |
| 自己关自己 | 频道无价值内容时自动关 ambient（见 4.3） |

### 4.6 persistent 记忆

| 功能 | 说明 |
|------|------|
| channel memory | 频道级 curated notes（稳定事实，非 transcript） |
| workspace memory | 公共频道记忆自动共享全 workspace，跨频道可用 |
| private channel 独立 store | 私密频道记忆只在自己 store；转公开后旧记忆不迁移 |
| 三种积累方式 | 你明确告诉它记住 / 它干活时自己记决定 / 问它读过去会话（按主题/时间段，不能全文搜） |
| 记忆管理 | 任何人可查 `what do you remember?`、纠正、删除 |
| 记忆文件 admin 可见 | admin 可看某 scope 记忆文件；仅 Owner 可编辑/删除 |
| 跨频道学习需授权 | 默认尊重边界；跨频道读由 admin 显式配 |
| 记忆不归属个人 | 频道里学到的任何东西不挂在你名下 |
| 长 playbook 放仓库 | 官方建议：手册/风格指南放可读仓库，别塞进 memory（memory 只存短事实） |

### 4.7 权限安全

| 功能 | 说明 |
|------|------|
| Agent identity | Claude 用自己的 service accounts（Slack 的 Claude app / GitHub 的 Claude app / 各工具 service account） |
| Access bundle | 命名集合：connections + 域名 + 仓库 + plugins；可附多个 scope |
| scope 三级 + 继承 | org（Default Slack access）/ workspace / channel；channel 覆盖 workspace 覆盖 org |
| Agent Proxy | sandbox 出网边界；default-deny，匹配规则才放行并**在边界注入凭证** |
| credential store | 凭证存独立存储，sandbox/模型拿不到 key；保存后不再显示（write-only） |
| allowed websites per connection | 每条连接可限定域名/路径/只读方法 |
| Domains 无凭证放行 | 只放行不挂凭证；`*` allow-all egress 需 Anthropic 开启 |
| environment 网络级别 | 默认 Trusted（包注册表/开发者主机），可 No access / Full access |
| web search 独立于 egress | 搜索走 Anthropic 服务端，不受 Domains/egress 限制；开 URL 才走 sandbox 出网 |
| 凭证按频道隔离 | 只从 channel/workspace/org 三处取 bundle，别处不可见；私密频道隔离金融凭证示例 |
| restrict members | Team 限 org 成员；Enterprise 走 RBAC 自定义角色「Claude Tag in Slack」capability |
| guest 频道控制 | 默认含 guest 的频道关闭；可 per-scope 放开（搜索仍禁用） |
| DM 开关 | Owner 可组织级禁用 DM |
| Slack Connect 不支持 | 对外共享频道永不运行，不可配置 |
| ZDR 组织不支持 | 因留存 channel memory + transcripts，Zero Data Retention 不可用 |
| 无 pre-invite blocklist | 装了 app 后任何人都能 `/invite` 进公共频道；只能事后把 scope 版本设 Off |

### 4.8 集成（内置连接）

| 工具 | 说明 |
|------|------|
| GitHub / GitLab | 代码读取、PR/MR、CI 跟随（见 4.2） |
| Jira & Confluence | 读/更 issue、搜页面 |
| Asana | 建任务、读项目状态 |
| Linear | 建 ticket、发状态更新 |
| Notion | 读/搜 workspace |
| Google Drive / Calendar / Gmail | 读文档/表格/日程/邮件（OAuth 或 service account） |
| BigQuery / Snowflake / Redshift | **只读**仓库查询、出图 |
| Datadog / Sentry / PagerDuty | 查 metrics/logs/monitors/incidents/on-call |
| Salesforce / HubSpot / Gong | 读/更新 CRM、拉通话摘要与 deal 上下文 |
| Stripe | 回答计费/订阅问题 |
| Vercel | 查部署状态与日志 |
| 自定义连接 | 任意 HTTP API / 自定义 MCP server 手动接 |

### 4.9 配置

| 功能 | 说明 |
|------|------|
| 管理页 `claude.ai/admin-settings/claude-tag` | Owner 一站式：access、行为、限制 |
| 用量页 `.../usage/claude-tag` | admin：spend limit + per-channel 用量报表 |
| per-scope settings | 同 agent 不同频道不同配置（connections/模型/指令） |
| custom instructions | 每 scope 常驻指令，**压过 channel memory** |
| default model | per-scope 默认模型（Opus/Sonnet，按 org 允许列表过滤） |
| thread 内切模型 | "switch to Opus 4.8 for the rest of this thread"；仅该 thread |
| plugins / skills | Owner 挂载技能包；可上传或走 git 仓库 |
| skills repo（自进化） | 技能放 git 仓库自动同步；Claude 学会新东西可**自己开 PR 改进自己的技能**，人 merge 后全频道生效 |
| Configure 页 | 频道成员可改 channel instructions（除非 admin 锁定）+ Respond automatically |
| Claude Tag version | 每 scope 选 New / Legacy / Off / Inherit（迁移期双轨） |
| Auto mode allow rules | 用自然语言句子预审批某类动作（≤50 条/scope，继承），其余仍走 permission checker |
| 无品牌定制 | app 名/@handle/头像固定不可改 |

### 4.10 观察

| 功能 | 说明 |
|------|------|
| checklist 进度 | 长任务的 live 任务清单（见 4.1/4.4） |
| Open session 全记录 | 每任务完整执行记录（tool call 级） |
| Audit 页 | admin 看：Scheduled work（全部 routine 清单）/ Memory（各 scope 记忆文件）/ Network events（Agent Proxy 出站 hourly JSON，可选） |
| service account 归因 | 每个工具 audit log 里 Claude 的动作挂在它自己的 service account 下 |
| per-channel 用量报表 | 成本按频道拆分；showback 建议每团队一个频道 |
| 回复 footer | 模型名 + Configure + Open session 三件套 |
| 并发吞吐限制 | 有别于 spend limit；组织忙频道多会撞 rate limit（等几秒重发） |
| 无 per-user 成本归因 | 频道工作无法归因到个人（多人一 thread / 定时无人发起），channel 是归因单位 |

---

## 5. 核心概念

| 概念 | 是什么 |
|------|--------|
| **@Claude（tag）** | 派活入口；频道里 @ 即开一个会话。也可以不 @（ambient） |
| **Scope** | 配置作用域三级：org（Default Slack access）/ workspace / channel；向下继承，channel 覆盖上级 ✅ |
| **Access bundle** | 命名的「连接+域名+仓库+插件」集合，附到 scope；一个 bundle 服务多个 scope ✅ |
| **Connection** | 一条外部服务凭证（Datadog key / GitHub App 安装等），属于 agent identity 不属于任何人 ✅ |
| **Agent identity** | Claude 自己的 service accounts（Slack app / GitHub app / 各工具服务账号）✅ |
| **Agent Proxy** | sandbox 出网边界：default-deny + 按规则在边界注入凭证，模型/sandbox 摸不到 key ✅ |
| **Session** | 一个 thread 绑定一个持久 session（会话真相）；频道顶层另有自己的一份 ✅ |
| **Sandbox** | Anthropic 托管的每 thread 工作环境；无凭证、idle 释放、重建 ✅ |
| **Channel memory** | 频道级 curated notes；公共频道→workspace 共享，私密频道→独立 store ✅ |
| **Routine** | 定时/事件/观看触发的自主任务，用频道的连接与权限 ✅ |
| **Ambient** | 主动模式：逐条判「需要回吗」、跟静默 thread、跨频道同步 ✅ |
| **Checklist** | 长任务的 live 进度清单，in place 编辑 ✅ |
| **Stacked prompts** | 事件驱动的任务链：等 blocking dependency（PR merge/CI green/上游 done）后再续，而非一口气 diff 到底 🟡（命名来自 Cat Wu/ClaudeDevs 发布材料） |

---

## 6. 状态哲学（重点章节）

**一句话：状态不焊在「人」上，焊在「地方」上。** access 随 channel、memory 随 channel、work 随 thread、billing 随 org——唯一的例外是 DM（焊在个人账户）。✅ 三层嵌套模型：

```
Scope（identity + access，由 Owner 配置）
 └─ Channel（memory + instructions，团队共建）
     └─ Thread（work in progress，会话真相）
DM（scope 之外，跑个人账户）
```

### 每一层焊什么

| 层 | 焊的状态 | 谁管 |
|----|---------|------|
| **Scope**（org/workspace/channel） | agent identity、Access bundles（连接/域名/仓库/插件）、custom instructions、默认模型、ambient 开关、版本、spend limit | Owner/admin ✅ |
| **Channel** | channel memory、channel instructions、routines、活跃 thread | 频道成员共建；memory 任何人可改，instructions 成员可改（可锁）✅ |
| **Thread** | 会话上下文、checklist、进行中工作 | 任何人可 steer ✅ |
| **DM** | 个人 claude.ai 账户 + 个人 connectors | 本人 ✅ |

### 换一个维度（换 channel / 换成员 / 换会话）分别意味着什么

- **换 channel = 换身份和记忆的整个世界** ⚠️。每个频道是「一个不同的 Claude」：连接的 bundle 不同（`#platform-eng` 能碰 GitHub + warehouse，`#sales` 只碰 CRM）、记忆不同（公共频道共享 workspace 记忆，私密频道隔离）、指令不同。同一个人在两个频道看到的 Claude 能力不同、记得的东西不同。官方 Tobin South（Anthropic 员工）原话：「不同 channel 应该被当作不同 Claude」🟡。
- **换成员 = 几乎无感** ✅。访问不随人变（per-channel 决定）；记忆不归属个人；任何人可以接手别人的 thread；成员离开组织，routine 继续跑（被移出频道才停）。**这是刻意设计**：身份是团队的、不是任何个人的，个人来来去去不破坏状态。
- **换会话/换 thread = 工作记录保持、执行环境重置** ✅。thread 是持久真相（对话 + 记忆 + 已推出的产出物都保留），sandbox 是 ephemeral（idle 释放、重建、只存在于 sandbox 的文件丢失）。删 thread 首条消息（无回复）→ 会话关闭。
- **换 workspace = 状态隔离** ✅。DMs 和其他 workspace 保持分离；不同 workspace 可以配不同 bundle。

### 三个反直觉但关键的设计选择

1. **一个 channel 一个 Claude identity，不是一人一个** ✅。这是「多人共享同一 agent」的基石：谁 @ 都一样、上下文连续、交接无缝。Anthropic 内部叙事「one Claude that interacts with everyone」✅。
2. **sandbox 无状态 + thread 有状态，执行与对话解耦** ✅。sandbox 是廉价的、可丢弃的计算；thread 是昂贵的、持久的上下文。长任务靠「把产出物推到 durable 处」（push branch / 贴 thread / 开 PR）来跨 sandbox 生命周期存活。
3. **记忆是 curated note 不是 transcript** ✅。官方明确：memory 只存稳定事实、要短、别当运行日志；长手册放仓库。**记忆是产品刻意做小的**，不是「记住一切」。

### 对 agents-remote 的对照（⚠️ 推断）

PRD 里「房间」概念的权威背书：**Claude Tag 把身份、记忆、指令、工作记录全部焊在 channel（= 我们的 room）上**，而不是焊在 session 或个人上。我们的 Room 设计应照此：room 级 access bundle、room 级记忆、room 级工作日志、room 级审批现场——个人只是 room 的临时参与者。这正是 PRD「房间 = 多角色 + 你坐一起讨论的地方」的正确落法。

---

## 7. 派活与编排交互

### 下达工作的方式（由轻到重）

| 方式 | 说明 |
|------|------|
| 频道 @ 一句话 | 最常用。`@Claude where are we on launch prep?` 就是完整派活 ✅ |
| @ + definition of done | 长任务要写清验收：`Done means CI is green and the PR links back here` ✅ |
| 转发消息变任务 | 不重抄，forward + 附 deliverable ✅ |
| 贴 thread 链接 | 长讨论粘链接让它读后接手 ✅ |
| routine / 定时 | 一次性任务 → 转常驻（digest/watch/PR 订阅）✅ |
| ambient 自主 | 不派也干：该管的它自己管 ✅ |

### 多人怎么共享同一个 Claude

- **会话属于频道，不属于发起人** ✅。Sam 在 Jordan 的 thread 里回复就能 steer——不用重 @、不用重开。这是 multiplayer 的核心机制：**thread 是共享工作台，不是私人对话**。
- **steer 语义**：纠偏用「新 reply」，不用编辑/删除（编辑只发 note 不行动，删除不通知）✅。
- **接力**：A 走了 B 接着问，Claude 有全部上下文（channel memory + thread）✅。
- **并发**：多个 thread = 多个并行 session，互不共享状态；官方建议并行任务开多个 thread（像多个终端 tab）✅。Anthropic 内部「delegating tasks to many Claudes in parallel」✅。
- **任务交接跨频道**：`!fork #channel` 把讨论连同背景搬到更合适的频道，双向链接 ✅。

### 编排粒度：一个 Claude 服务整个频道，不做多 agent 角色 ⚠️

Claude Tag **故意不做多 agent 角色**（没有 CTO agent / 研究员 agent 之分）——它卖「一个团队级 Claude 干 100 种活」。编排 = 同一个 Claude 在一堆 thread 里各干各的，靠 channel memory 和共享工具保持一致。这对 agents-remote 的启示：**「单 agent 多用法」先于「多 agent 角色」**（详见 §12）。

---

## 8. 记忆与上下文

### Persistent 怎么实现（跨会话）

三层，官方文档逐一确认 ✅：

1. **Channel memory（事实层）**：稳定事实（团队约定、仓库归属、输出格式），三种积累方式——你明确说"记住"、它干活时自己记、你问它读过去会话。**curated notes 不是 transcript**，要短、要稳定；长手册放仓库。
2. **Workspace memory（共享层）**：公共频道学到的自动共享全 workspace（`#data-eng` 的决定在 `#analytics` 可问），可指定频道"check what #data-eng knows"。私密频道独立、转公开不迁移。跨频道学需 admin 授权。
3. **Thread/session（会话层）**：一个 thread = 一个持久 session，回复继续会话（没有 `--continue`/`/resume`）；sandbox 释放后 thread 上下文还在，新回复重建 sandbox 续上。

**上下文不足的显式设计**：@ 进长 thread 只给根消息 + 前 50 条，关键信息要复述 ✅。记忆文件 admin 可看、Owner 可编辑 ✅。纠正要显式（"update your memory for this channel"）才成为常驻 ✅。

### Stacked prompts 怎么叠加 git 上下文（🟡 命名 / ✅ 机制）

社区/Cat Wu 描述的核心：agent 把任务拆成有依赖的子任务，**通过 git webhook 等 blocking dependency 天级**——依赖 PR merge / CI green / 上游 done 才继续，等到了再以新 prompt 续跑。官方文档证实了机制侧：routine 可「trigger on a repository event」✅、PR 订阅在 CI/review/merge 事件触发 ✅、`watch your PR ... When CI fails, fix it and push. When a review comment arrives, address it` ✅、内部用例「Dependent work: waits on another task, then resumes days later with an updated PR」🟡。

### 长记忆的边界与盲点

- 无全文搜索历史（只能按主题/时间段读旧会话）✅——官方明确不做。
- compaction 具体机制（@85% 检查点 / FIFO summarize / 向量检索）**未公开** ⏳。
- 「memory 变成锁」是社区最大争议：共享记忆让替换成本随时间上升 🟡（详见 §11）。

---

## 9. 审批与介入

### 人在哪里介入

| 介入点 | 机制 |
|--------|------|
| **thread 即审批现场** | 一切结果落 thread，人在 thread 里 review、拍板、纠偏 ✅ |
| **checklist + Open session** | 看进度 + 看完整执行记录（tool call 级）再决定 ✅ |
| **doD 决定谁 close** | 客观检查（CI green）→ Claude 自己关；「你批准」→ 你一 click；「你二选一」→ 你一句话；无验收条件 → 谁都不能关 ✅ |
| **在 thread 里提前卡点** | "post your plan here before changing anything" / "come back to me before changing any public interface" ✅ |

### 代码改动谁 review

明确三层，官方反复强调（✅）：

1. **产出物 = draft PR**：Claude 的代码改动一律以 draft PR 回到你的 review 队列，作者是 Claude GitHub App。draft 是「求审」不是「直接合」。
2. **人 merge**：官方用语「I do the approving and merging」。Claude 可以「watch 自己的 PR，CI 失败就修、有 review comment 就改」，但**approve 和 merge 是人做**。
3. **硬边界靠分支保护（branch protection）**：官方明确「任务措辞是意图、不是控制」——要真不让 Claude merge，靠仓库分支保护规则（对 Claude 同样生效），不靠 prompt。这是**最重要的安全语义**：软约束在 prompt，硬约束在系统。

### 非代码场景的审批

- **skills 自进化闭环**：Claude 学会新东西 → 开 PR 改进自己的技能仓库 → **你 review + merge** → 全频道生效。技能变更「只有人 merge 后才到频道」✅。
- **auto mode allow rules（预审批）**：用自然语言句子预批准某类动作（如「staging 部署是正常流程」），其余动作仍过 permission checker。⚠️ 官方警告：一旦加了 rule，范围内动作无人再拦，务必窄化 ✅。
- **spend limit 作为软审批**：组织/频道级消费上限，超了停止并告知 requester ✅。

### 一句话总结

**Claude Tag 的审批哲学 = 产物形态（draft PR/贴 thread）+ 人在 thread 拍板 + 系统硬边界（branch protection / spend limit / permission checker）三层，不靠纯对话框 yes/no。** ⚠️

---

## 10. 执行与持久

### 跑在哪

- **Anthropic 云端 sandbox**，不在你的机器/内网 ✅。每 thread 一个 sandbox，同一引擎 = Claude Code on the web 的 managed compute ✅。
- **sandbox 生命周期**：会话开始构建 → 工作 → idle 释放 → 下条回复重建。sandbox 无凭证（凭证在 Agent Proxy 边界注入）✅。
- **网络**：出网 default-deny，三层放行（connection 的 allowed websites / bundle 的 Domains / environment 的 network access）；匹配凭证才带 key；都不匹配直接 block ✅。只走 HTTP/HTTPS（SSH/原生 DB 协议过不了 proxy）✅。

### 怎么连 git 仓库

- 启动时无仓库 checkout；请求点名仓库才 clone（"name the repository in the first message"）✅。
- clone 后 `.claude` 配置加载（CLAUDE.md / rules / skills / hooks）；`.mcp.json` 永不加载 ✅。
- 改代码在 sandbox 里做，推回 GitHub 为分支/PR（Claude GitHub App 作者）✅。

### Webhook 触发形态

- 官方明确三种「自主触发」：**schedule**（定时）、**channel watch**（频道事件）、**repository event**（仓库事件/PR 订阅）✅。
- 事件驱动依赖链（stacked prompts）本质是「PR 订阅 + CI/merge 事件唤醒 + 续跑」✅（命名与天级等待 🟡）。
- 内部实战（🟡，ClaudeDevs/社区发布材料）：incident 自动诊断开 fix 盯恢复、A/B test 监控告警、CI 长失败自动开修、dependent work 等上游数天后续 PR。

### 持久性边界

| 状态 | 跨 sandbox 释放存活？ |
|------|---------------------|
| thread 会话与上下文 | ✅ |
| channel memory | ✅ |
| 已推出/贴出的产出物（branch/PR/thread 文件） | ✅ |
| 仅存在于 sandbox 的文件 | ❌ 重建时丢失，需主动 push/post |

官方好习惯：长任务把 deliverable 尽早推 durable（push branch / 贴 thread / 开 draft PR）✅。

---

## 11. 商业模式与定位

### 商业形态

| 维度 | 事实 |
|------|------|
| 产品形态 | Slack 里的共享 AI 队友；官方定位「Claude Code 的进化：更主动、更适合全团队」✅ |
| 发布 | 2026-06-23，Team + Enterprise beta（无 Free/Pro/Max，无第三方部署）✅ |
| 定价 | **usage-based（按 token 用量）**：channel 工作走组织 usage balance + spend limit；DM 走个人 seat ✅ |
| 计费细节 | spend limit 按 list price 计数（折扣在发票时）；org 级上限 + 默认 + per-channel；超限拒绝不静默截断；有 launch credit ✅ |
| 成本归因 | 只能按 channel 归因（多人一 thread / 定时无人发起），建议每团队一频道做 showback ✅ |
| 模型 | Opus 4.8（发布时），组织模型策略过滤；thread 内可切模型 ✅ |
| 迁移 | 替换旧「Claude in Slack」app，30 天 opt-in 迁移 + launch credit ✅；旧 app 退役日（媒体称 8 月 3 日 🟡） |
| 内部数据 | 65% 产品团队代码由内部版 Claude Tag 产出 ✅（内部称「merges 65% of product PRs」🟡，口径不一） |

### 定位与叙事

- **官方一句话**：「Claude Tag 是团队与 Claude 协作的新方式，从 Slack 开始」✅。Claude Code 单人同步 vs Claude Tag 多人异步主动（ClaudeDevs）✅。
- **Cat Wu（Claude Code 产品负责人）**：Claude Tag = 「first product natively multi-player and proactive」；「100s of ways to customize」+ 6 个内部高频 flows（incident response / on-demand code review / docs drafting / bug-ticket handling / product-metric analysis / async task delegation）🟡。
- **Karpathy**：第三次 LLM UI/UX 范式重构——从网站→桌面 app→**self-contained / persistent / async entity 握 org-wide tools 与人类并肩**；也叫它「org-level harness」🟡。
- **商业野心**：从「工具」走向「企业 plumbing」——靠共享记忆的累积网络效应锁定（Mo Shehu 分析 🟡）。
- **竞争**：Slack 归 Salesforce（Agentforce 也在 Slack 里）、Microsoft Teams 有 Copilot channel agents（Entra Agent ID 更早做 formal agent identity）——Anthropic 在竞争对手的地盘上做旗舰团队产品，hedge 是把 @Claude 铺到更多工作表面 🟡。
- **社区担忧**：按 token 的共用计费难预算、共享记忆构成 lock-in（"a coworker that remembers everything and bills by the thought"）、agent identity 带来安全新面（详见 §12 盲点）🟡。

---

## 12. 对 OPC 多 agent 编排的启示

对照 PRD 六概念（角色/任务/房间/看板/记忆/agentmore）。Claude Tag 作为 Anthropic 官方商业产品，是继 Buzz / cloudflare-os / Paperclip / Multica / Avernet 之后又一个独立收敛点，**方向性强印证 + 三个具体启示 + 四个盲点**。

### 印证（PRD 方向正确）

1. **单一共享状态源** ✅：channel = 会话/记忆/工作真相的权威源。PRD 房间的单一事件日志被官方产品验证。
2. **串行化轮次** ✅：区分 initiator vs 后到者、遇人际分歧等人类拍板。对应 PRD 圆桌「你插话纠偏」。
3. **检查点压缩做长记忆** ✅：跨天累积 context 必然要有记忆分层（channel memory curated + workspace 共享 + thread 会话）。
4. **身份是资源，非 per-session** ✅：agent identity 是 org 级、per-scope scoped 的共享资源。印证 PRD 角色 = project 级可复用身份。
5. **双层任务 + 依赖唤醒** ✅：checklist in thread = IM 化双层任务；git webhook 等依赖 = 我们 `blockedByGoalIds` + 事件唤醒的强印证。
6. **ambient vs mention 双模式** ✅：broadcast 自动 vs @tag 定向，印证 `routingMode`。
7. **summary 由同一 agent 做** ✅：thread summarize→docs with action items，不引入独立书记员。
8. **渐进路径** ✅：Claude Tag 刻意不做多角色、卖「一个 Claude 100s of ways」——印证 Phase 1 先做单 agent 多用法。

### 挑战（PRD 要 rethink）

1. **「多人+单 agent」≠「多 agent 角色」** ⚠️：Claude Tag 的 multiplayer 是「一个团队级 Claude 服务整个频道」，agents-remote OPC 是「多 agent 角色（CTO/产品/研究员）协作」。**Phase 1 与 Claude Tag 形态最接近；Phase 2 圆桌多角色是超越它的差异化，但风险更高**——先用单 agent 多用法验证价值。
2. **自建 UI 复杂度天然更高** ⚠️：Claude Tag 站在 Slack 肩膀上白拿 channel/thread/@tag/全员可见；agents-remote 的看板/房间本质上在重建 Slack channel 能力。这值得（我们还要 terminal/files/git inspection），但要知道成本。
3. **review 带宽是瓶颈** ⚠️：官方好习惯明说「thread 数 vs 你的 review 能力不线性——每个需要你判断的 thread 都串行经过你」。OPC 一人管多 agent 时，**审批队列管理是第一性问题**。

### 盲点（PRD 未覆盖、Claude Tag 暴露的）

1. **碎片化上下文** 🟡：每频道一个 Claude → 十个频道十个半吊子版本、各自信地错（LinkedIn 批评）。PRD 单房间日志避免了房间内碎片化，但**跨 room/跨项目要不要 org 级共享白板**要决策。
2. **ambient 发言预算** 🟡：主动模式会 spam；需要「连续 N 轮 agent-only 无人类输入则停」+ per-agent 发言频率上限。PRD §13.4 循环防护已有，需补预算。
3. **agent 操作可审计 identity** 🟡：多 agent 协作时每个 agent 的改动要带身份标签。security 社区批评：shared service account 在 ambient 下丢了「哪个人类触发的」归因。我们的任务/房间日志应把「agent 操作 → 触发人」链路焊死。
4. **共享记忆 = 锁 + 隐私面** 🟡：memory 越厚越难替换（锁）；共享凭证让「无 repo 权限的人借 agent 之手读仓库」（confused deputy）——Hush Security 指出 `effective perms = agent scope ∩ requester scope` 是正确方向，Anthropic 已列为 roadmap。OPC 私有部署也要防：**agent 权限不能超过最弱的请求者预期**。

### 对六概念的具体落法（⚠️ 综合推断）

| PRD 概念 | Claude Tag 启示 |
|---------|----------------|
| **角色** | 身份 = 资源、per-room scoped、带 access bundle（tools/data/repos 白名单）；memory 按身份累积而非按 session。**把「角色」从「一次会话的人设」升级为「room 级可复用身份 + 权限包」** |
| **任务** | 双层（thread checklist + stages）；**doD 写进任务**（谁 close 取决于 end condition）；`blockedByGoalIds` 具体化为 git webhook 事件（PR merged / CI green） |
| **房间** | channel 即房间：access + memory + 工作日志 + 审批现场全焊在 room 级；私人 solo 房间是合法形态；`!fork` = 跨 room 迁移讨论 |
| **看板** | 移动端看板 = thread 形态任务详情（消息流 + 顶部状态）优于看板卡片 |
| **记忆** | 分层：room memory（curated note）/ 共享层（public room 自动共享）/ repo 层（CLAUDE.md 类长上下文）/ skills repo（可演进流程，agent 自提 PR 人 merge）。**长手册进 repo 不塞 memory** |
| **agentmore** | 定时任务 = routine 双形态（schedule + 事件触发，同权同连接）；「技能自进化」= agent 通过 PR 改进自己的流程知识，人 review——这是「agent more」里被低估的一块 |

---

## 13. 证据分级与来源

### ✅ 官网直证（官方文档 claude.com/docs/claude-tag + 官方发布 anthropic.com/news/introducing-claude-tag）

- 产品形态/一句话定位、multiplayer/proactive/persistent/async 官方叙事、65% 内部代码指标
- 四步 setup 全流程（pair workspace / 选工具 / GitHub / spend limit / launch）
- Agent identity 模型：service accounts、scope 三级、Access bundle、Agent Proxy、credential store、default-deny egress、channel 凭证隔离
- 记忆模型：channel/workspace/private 三层、三种积累、curated note、管理/纠正、记忆文件权限
- ambient 行为、Respond automatically、自我静默、回复触发矩阵、不响应边界
- Commands：!help / !restart / !mute / !unmute / !feedback / !routines / !fork
- Routines：scheduled jobs / channel watching / PR subscriptions / routine 管理
- 会话生命周期：thread↔session、sandbox 构建/释放/重建、50 条上下文窗口、doD 与谁 close
- 审批：draft PR + 人 merge + branch protection 硬边界、GitHub Actions 权限边界、skills repo 自进化闭环、auto mode allow rules
- 计费：usage balance、org+per-channel spend limit、DM 走 seat、按 channel 归因
- Audit：Scheduled work / Memory / Network events、service account 归因
- 安全边界：ZDR 不适用、guest 频道、Slack Connect、成员 RBAC、DM 开关、restrict-access 全表
- 集成清单：GitHub/GitLab/Jira/Confluence/Asana/Linear/Notion/Google/BigQuery/Snowflake/Datadog/Sentry/PagerDuty/Salesforce/HubSpot/Gong/Stripe/Vercel/自定义 MCP
- 配置：settings-map、per-scope、model 策略、version 迁移、plugins/skills
- 与 Claude Code / Cowork / Managed Agents 的官方对比

### 🟡 二手（权威媒体 / 深度第三方 / 产品负责人公开言论）

- Cat Wu（@_catwu）：「first product natively multi-player and proactive」「100s of ways」+ 6 个内部高频 flows；stacked prompts vs stacked diffs 表述（Latent Space AINews 转述）
- ClaudeDevs / Boris Cherny：per-thread sandbox、Claude Code 单人同步 vs Tag 多人异步主动、内部用例（incident/依赖等天级续 PR）
- Karpathy：「第三次 LLM UI/UX 范式」「org-level harness」
- TechCrunch「learning your company, one Slack message at a time」；Fortune「virtual employee」；The Register「nosy, always-on」
- 旧 app 退役 8 月 3 日（ofox.ai / dev.to 汇总）
- Mo Shehu「Claude Tag Really Wants to Be Indispensable」：企业 plumbing 野心、Salesforce/Microsoft 竞争、usage billing 合理性、冲突/外部人/可观测三问
- AI Primer：token billing / shared-memory lock-in 社区争论、65% 口径差异
- Hush Security「New Agent Identity, Old Security Gaps」：confused deputy / NHI 泛滥 / audit 归因缺口 / least-agency
- Oasis / ClawdBytes / livethreat：agent identity 治理与 NHI 视角
- 65% 口径（「writes 65% of code」vs「merges 65% of PRs」）不一致

### ⚠️ 推断（PM 综合）

- 状态哲学整体框架（access 随 channel / memory 随 channel / work 随 thread / billing 随 org）
- 审批哲学三层归纳（产物形态 + thread 拍板 + 系统硬边界）
- 「一个团队一个共享 agent」价值先于「多 agent 角色」、Phase 1 形态最近、Phase 2 圆桌差异化判断
- 六概念落法表（角色→room 级身份资源等）
- compaction 机制细节（@85% 检查点 / FIFO summarize / 向量检索）→ 开放问题 ⏳
- ambient「needs-response」判定是纯 LLM 还是规则+LLM 混合 → 开放问题 ⏳

---

## 附：对 agents-remote 最值得抄的三个设计（可直接进 Phase 1）

1. **身份 = room 级共享资源 + access bundle**：`AgentProfile` 升级为带 tools/data/repos 白名单的 room 级身份，memory 按身份累积。✅
2. **git webhook 作为任务依赖唤醒源**：`blockedByGoalIds` 的事件来源具体化为 PR merged / CI green / branch pushed，替代/补充 cron。✅
3. **thread 形态 = 移动端任务详情**：移动端任务页 = 消息流 + 顶部状态条，比看板卡片更适合手机竖屏 + 实时。✅
