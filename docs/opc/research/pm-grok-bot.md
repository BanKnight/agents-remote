# Grok Bot 产品调研（PM 视角）

> 调研对象：xAI / SpaceXAI 于 2026-08-11 发布的 **Grok Bot**（early beta）。这是「云同事」类 agent 产品的最新官方商业样本，对照吸收进 agents-remote 的 OPC 多 agent 编排方向。
> 证据分级贯穿全文：✅ 官网/官方文档直证 / 🟡 权威媒体或二手 / ⚠️ 推断。文末逐条汇总。
> 写作约束：PM 决策语言，不注水，但内容完整优先于行数（用户明确取消行数上限，要求 feature list 完整不漏）。

## 1. 一句话定位

**给"会派活的数字同事"一台云端电脑，让它像真人同事一样 24/7 登录你的工具、把多步活干到 100% 并落地到真实工具里，只在需要人拍板时回来找你。** ✅

- 用户：SuperGrok Heavy / Cursor Ultra / Cursor Teams Premium 订阅者（个人 $200-300/月 或团队 $120/seat/月），早期 beta，企业版 waitlist。✅
- 形态：桌面 app（macOS/Windows，**Linux 暂不支持桌面端**）+ iOS（iPhone，非 iPad），与 Cursor 深度集成（下载走 cursor.com、认证走 Cursor 账号）。✅
- 心智：**不是 chatbot，是"挂职位招 AI 员工"**——Bot 有名字、有角色、有持久电脑、有记忆，你像发微信一样派活。✅

> ⚠️ **社区校准（见 `pm-grok-bot-community.md`，2026-08-11/12 走查）**：
> - **定位血统订正**：我们用"豆包 + 云电脑"作中文语境能力类比（用户秒懂），但**英文社区(246 HN 评论)的对照系完全不同——12 处明提 OpenClaw、零处提豆包**,把 Grok Bot 当"**托管的 OpenClaw**"(always-on 持久 VM 的商业托管版)+ OpenClaw/Hermes 开源谱系的一员。两个定位不矛盾(豆包是中文侧能力类比,OpenClaw 是英文侧血统类比)。**OpenClaw/Hermes 是 OPC 多 agent 编排真正未覆盖的开源竞品底座**(见 §9 盲点 + multi-agent-orchestration.md 待补)。
> - **非编排产品升级为社区铁证**：246 评论**零编排讨论**,社区根本不拿编排标准衡量它——"Grok Bot 非编排产品"从 ⚠️ PM 推断升级为 ✅ 社区证据(与 cloudflare-os 同结论)。
> - **共享登录态=accountability sink**:社区强烈反对"一个 Bot 登了其他 Bot 可用"的共享用户 session 设计,主张 bot 有自己 IDP 身份(见 §9 盲点 1 升级)。

## A. 根本使用场景

> Grok Bot 是为**"把一件跨多工具的真实业务活，从 0 干到 100 并落地到真实工具里"**这个场景造的。不是为"问答"或"生成草稿"。

> ⚠️ **A 节社区校准（走查 P1+P2）**：
> 1. **主场景伦理反证**：官方力推的 Sales Outbound 群发场景被社区定性为**社会危害**——`taneq`(#49268839)"对供应商的 DoS 攻击"，`solid_fuel`(#49266098)"gross / 没有同理心"，`raincole`/`pavel_lishin`/`taneq` 群体批判"spam Armageddon"。Grok Bot 把"批量外联 N 倍放大"当差异化卖点，社区把同一行为当对供应商的 DoS。**OPC 启示**：编排层的"批量外联/群发"场景必须配套**速率限制 + 反 spam 设计**，不能只学"群发"当卖点。
> 2. **异步工作 iOS 端实测 broken**：内测者 `jjcm` 印证异步工作有效（"I haven't had to juggle worktrees for the last month"），但 `vorticalbox`(#49262203)报 iOS GitHub 登录 404 实测 broken——首周 iOS 端稳定性存疑。

**主场景用户旅程**（销售 prospecting，官方示范案例）✅：

1. 早上你在手机上**像给同事发微信**一样给 Bot 派活：「拉这周 Strategic Prospects PG List 从 Salesforce，跳过已在序列的，跨 web/Slack/Databricks 调研 top 5 账号，拉联系人，用我的口吻起草 LinkedIn + 邮件，明早留草稿给我审批」。
2. 你合上笔记本去开会。Bot 在**云端自己的电脑**上跑——登 Salesforce 拉名单、跨浏览器+连接器调研、起草邮件。**关电脑/关 app 不停云端活。** ✅
3. 中途 Bot 遇到要**登录 Salesforce** → 把电脑控制权交还你，你亲自登，登录态**持久化在共享电脑**，其他 Bot 也能复用。✅
4. Bot 遇到要**发邮件**这种不可逆动作，**暂停**，把你拉回来审批——你点 Allow once 才发。审批的是"拟执行动作 + 输入（target/scope/values）"，不是事后撤销。✅
5. 第二天早上打开 app，Bot 回来**交成品**：草稿躺在你的工具里（不是聊天框里），等你过目。文件在 `/workspace` 共享、其他 Bot 可读。✅
6. 你 review、给几条修正，把"以后周报都这个格式"**显式写进 Bot description**（持久偏好），Bot 把这套流程**存成 skill**，下次自动跑、不用重解释。✅

一句话：**"派活 → 它在云端真实工具里干 → 卡住才找你 → 干完交落地成品 → 学会下次自己跑"**。它的差异化卖点是"90% done 和 100% done 的差距"——AI 大多给你草稿，Grok Bot 把活干到真人会放的那地方。✅

**官方点名的 8 个角色场景**（每个是一个"durable Bot 角色"，不是临时任务）✅：
- **Sales Outbound**：账号调研 + 联系人优先级 + review-ready 外联草稿（夜间 routine）
- **Talent Scout**：sourcing + 候选人调研 + outreach 草稿 + scheduling 准备
- **Paid Media**：campaign 监控 + 预算建议（改预算永在审批后）
- **Expense Manager**：周报销对账 + 缺失信息 follow-up
- **Product Performance**：定向性能调查（带证据，不改生产）
- **Bug Reproduction**：把 bug 报告变成可靠复现包（staging，不用生产数据）
- **Account Health**：客户组合的风险/扩展信号 watch list
- **Chief of Staff**：源链 digest——昨天变了什么、什么要你注意

## B. 解决的痛点（按具体症状列全）

没它之前，用户卡在（✅ 官方文档 + 🟡 媒体印证）：

1. **AI 给草稿不落地** ✅——LLM 给你邮件草稿，你还得自己复制粘贴发出去；"90% 之后那 10% 的落地"最费力。症状：草稿停在聊天框，最后一公里全靠人手。
2. **关电脑活就停** ✅——本地 agent / 浏览器自动化随你关机就死，长任务（隔夜调研、批量外联）跑不完。症状：必须挂机盯；官方明确"jobs do not stall when you step away"。
3. **没 API / MCP 的工具用不了** ✅——大量企业工具（某些 CRM / 内部系统 / 老网站）没干净接口，传统 agent 进不去。症状：agent 只能动有 API 的那几个；Grok Bot 的 computer use 走"为人设计的界面"兜底。
4. **多 agent 之间你得当路由器** ✅——一个干研究、一个起草、一个发送，你得在它们之间复制粘贴上下文。官方"you are not the middleman / not the router between tools"。症状：你是中转站。
5. **重复活每次重解释** ✅——同样的多步流程每周跑，每次都要重新 prompt。症状：prompt 疲劳。Grok Bot 的 skill/routine 解此。
6. **不可逆操作不敢放手** ✅——发邮件、改生产、付款、删数据一旦放给 agent 就不可逆，只能全程盯。症状：放手即失控。Grok Bot 的 approval + secure handoff 解此。
7. **凭证管理危险** ✅——agent 要登你的账号，密码/2FA 怎么给？塞进聊天=泄漏。Grok Bot 的 secure handoff（你亲自输入、不进 transcript）解此。
8. **每个 agent 上下文从零** ✅——通用 agent "General Helper" 上下文难复用，每个任务都要重新解释背景。官方明确"Focused Bots build more useful context than one catch-all Bot"。
9. **跨 surface 断档** ✅——在桌面派的活，出门想用手机看进度/审批接不上。Grok Bot 桌面+iOS 同 Bot 同 thread。
10. **工作流要先搭** ✅——传统自动化要先建 workflow、配 trigger、写逻辑，门槛高。Grok Bot "simply message a Bot to take on a task"，无 workflow builder、无前置配置。
11. **会话过期/验证码打断长任务** ✅——长流程跑到一半网站要重新登录/CAPTCHA，agent 卡死。Grok Bot "Sign in once" + secure handoff 接管。
12. **agent 跑歪了你不知道** ✅——黑盒执行，不知道它点了什么。Grok Bot 的 Agent Computer 实时预览 + transcript 显示工具活动/computer use/审批请求。
13. **结果不可独立验证** ✅——agent 给你一个结论，你没证据。官方"Ask for evidence—links, screenshots, or a short action log""Preserve evidence""do not rely on a screenshot alone for rapidly changing data"。

## C. Feature list（完整版，分 11 维度，~93 条）

> 来源：11 篇官方 docs.x.ai/grok-bot/ 文档页 + 官方博客 + connectors 新闻。✅ = 官方直证，🟡 = 二手。

### C1. 用户入口与平台
1. **桌面 app**：macOS（Apple silicon + Intel 两版）、Windows（x64 + Arm64），自动更新 + Check for Updates。✅
2. **iOS app**：iPhone（iOS 18+），**非 iPad/非 Android**（App Store 下载）。✅
3. **Linux 桌面不支持**（早期 beta 限制）。✅
4. **同一 Bot 跨桌面+iOS**：同 Bot、同 conversation、同 routines、同 connectors、同共享电脑。✅
5. **Cursor 账号认证**：Sign In with Cursor，SSO 走组织登录流。✅
6. **首启引导**：首用走 tour，介绍 Bots/共享电脑/routines，问你用哪些工具（塑造首批 teammate 建议，不自动连接）。✅

### C2. Bot 管理类
7. **建 Bot**：`New → Create new agent` 或 `Cmd/Ctrl+N`，给名字 + 一个主职能 + description。✅
8. **建议 Bot 模板**："Meet a future teammate" 推荐预设角色（基于首启问的工具）。✅
9. **账号上限**：最多 **50 个 Bots + group chats 合计**。✅
10. **Edit Profile**：改 name/title/description/avatar。✅
11. **Pin / Hide / Unhide Bot**：pin 置顶、hide 移出主列表（不删不暂停）、Show hidden chats 恢复。✅
12. **Duplicate Bot**：复制成 " copy"，带 profile/settings/skills/routines/avatar，**不带**对话历史/记忆/附件。✅
13. **Delete Bot**：删 Bot 的 profile/conversation/routines，**不删**共享电脑文件/登录态（要手动登出/撤 connector）。✅
14. **Bot 间互相建议建 Bot**：现有 Bot 可建议/创建聚焦 Bot 当某职能需要长期 owner。✅
15. **description = 持久规则**：boundary/preference/responsibility 写进 description（"Never send external messages without approval"）；任务特定指令走 conversation。✅

### C3. 任务派发类
16. **自然语言派活**：像发微信一样描述任务，无 workflow builder。✅
17. **强请求五要素**（官方推荐结构）：Outcome（要什么完成）/ Sources（哪些 app/网站/文件）/ Constraints（避免什么/何时问）/ Deliverable（返回什么）/ Review point（何时停）。✅
18. **附件**：拖入或附件控件，最多 **6 个/次**；文档/图片/音频 ≤25MB，视频 ≤200MB；可粘图片和链接。✅
19. **`/` 引用 skill**：聊天输入 `/` 引用已保存 skill。✅
20. **`@` mention**：mention 另一个 Bot / group / routine / connector；群聊 `@everyone`（官方建议 sparingly）。✅
21. **回复特定消息 / thread**：reply to a specific message、reply in a thread（反馈/审批局部化，主 transcript 不乱）。✅
22. **react 表态**：轻量确认用 reaction；但"reaction alone 不应承载安全关键决策"。✅
23. **工作中追加指令**：work in progress 时可发新消息；你的直接消息**优先于后台活**、可重定向当前 turn。✅
24. **Stop now**：发"Stop now"立即停——但不撤销已完成动作。✅
25. **redirect 优先级**：你的 DM > 后台活，能打断重定向。✅
26. **群聊 kickoff 模板**：`@Researcher 收集+链接每条 claim / @Writer 转成 launch draft / @Reviewer 对照源只列阻塞问题 / 不要发布任何东西`。✅

### C4. 审批类
27. **审批门控**：不可逆动作前 Bot 暂停、把人拉回——"only come back when something needs your approval"。审的是拟执行动作 + 输入（target/scope/values）。✅
28. **prefer explicit boundary 的动作清单**：发消息/邀请、发布内容、购买/转账、删/覆盖数据、改权限、改生产、接受法律条款。✅
29. **桌面审批三档**：Allow once / Deny / Always allow（存规则）。✅
30. **iOS 审批两档**：Approve once / Deny（无 Always allow）。✅
31. **审批语义**：控制拟执行动作，**不撤销已完成活**（"It does not reverse work already completed"）。✅
32. **Auto Review**（Settings → General → Auto-review）：模型预审规则——**Require Approval** 规则永远停匹配动作；**Always Allow** 规则只在没别的停点时放行；两者冲突 Require Approval 赢。规则要写窄（"外部邮件必审"/"`git status` 在 /workspace/reports 永许"），别写"浏览器里全许"。✅
33. **Auto Review 规则存储**：personal 规则存当前桌面并同步到其 Grok Bot 电脑，需在另一桌面安装单独 verify。✅
34. **Secure handoff（接管输入）**：密码/passkey/2FA/CAPTCHA/付款/身份核验/明示要人的网站 → Bot **把电脑控制权交还你**，你亲自操作，**不进聊天/transcript**。✅
35. **Secure secret request**：支持连接器的专用安全请求入口，值被 mask、排除出 transcript、不显示给模型。非通用密码管理器。✅
36. **本地电脑执行三档**：Settings → General → Agent → Execution on Local Computer，Ask every time（默认）/ Always allowed / Never allowed。✅
37. **组织管理员可限制本地执行** + 托管云电脑设置（plan-dependent）。✅
38. **审批被规则阻塞的排查**：某动作一直要审批 → 查 Auto-review 是否有匹配 Require Approval 规则（Require 优先于 Allow）。✅

### C5. 记忆与 Skill / Routine 类
39. **Bot 记忆**：保留稳定工作偏好、重要事实、过往工作 summary——保持角色不靠重放每条历史。✅
40. **记忆边界**：**不是权威源**——变动事实放源系统、重要决策让 Bot cite/reopen 当前数据、直接纠正陈旧假设、安全边界写进 description。✅
41. **Skill（可复用指令集）**：capture steps + 决策规则 + 预期输出 + 安全边界；跨 Bot 共享（需对应 connector/login）；可用 `/` 引用。✅
42. **Routine（调度壳）**：skill 挂 schedule 或 event 触发器，Bot 定时/事件后自动跑。✅
43. **Teach a task（演示学流程）**：1对1 Bot 对话开 computer view → Teach a task → 描述要演示的结果 → 做一遍 → 停录屏 → review 生成的 skill 草稿 → 安全样例测试再调度。录屏 ≤10 分钟、**不录麦克风音频**、演示时别暴露 secrets。✅
44. **Skill 是草稿**：单例不够，要补决策规则/失败处理/审批边界。✅
45. **Routine 管理（iOS）**：查 schedule/next run/instruction + Active 暂停/恢复；**编辑 schedule/instruction/查看历史/test/删除仍需桌面**。✅
46. **Test run**：routine 可 test run，但**会执行真实外部动作**，只用安全输入测。✅
47. **Event-triggered routine**：确认 source channel/repository/matching rule 仍有效。✅
48. **"Turn example into durable Bot" 七步**：写 description → 跑一个安全 scope 真任务 → 修正到可 review → 存 skill → 第二输入测试 → 定义 retry/失败后再建 routine → 外部动作永在审批后。✅

### C6. 工具与电脑访问类
49. **持久云端 VM**：浏览器 + 文件系统 + 终端，**账户级共享**、Bot 各有独立 screen（并行不互扰、但无独立安全边界）。✅
50. **共享工作区 `/workspace`**：跨 Bot 可读，项目文件夹 + 描述性命名让 handoff 可靠。✅
51. **持久化分级**：durable state（文件/浏览器态/支持登录）**跨 update/recovery 存活**；临时目录/手动装包/未提交状态**视为可丢**，重要结果拷进 /workspace 或附进对话。✅
52. **computer use 双通道**：有 API/MCP 走 connector，没 API 的网站/app 直接 computer use 点界面。✅
53. **Agent Computer 实时预览**：从对话开 Agent Computer 看共享桌面——clicks/typing/navigation/status；可离开预览，活继续。✅
54. **Sign in once**：浏览器会话持久，一个 Bot 登了其他 Bot 可用；会话过期/超时/重验时让 Bot 暂停通知你别绕过。✅ ⚠️ **社区校准（走查 P1）**：社区强烈反对"共享用户登录态"——`ares623`(#49268993)定性为 **"accountability sink（责任黑洞）"**（bot 越权操作算用户头上，系统里没有"bot 自己"），`miguelspizza`(#49268792)主张"register these things in the IDP and let them sign into their own accounts"，`stillpointlab`"having accounts for my bots is what I really want"，`xdertz`"Who is on the hook when my bot does that?"。**社区正解 = bot 有自己 IDP 身份 + 自己账号 + scoped permissions，不是共享用户 session**。**OPC 启示**：我们想学的是"持久 VM"，不是"共享用户登录"——多 agent 编排若共享一个用户身份，等于把所有 agent 的越权行为都算到用户头上（详见 §9 盲点 + `../design/opc-product-discussion.md` §4 独立 identity 铁律）。
55. **电脑恢复三档**（Settings → Beta）：**Update Agent Computer**（重建保 durable state）/ **Recover Agent Computer**（不可达时替换保 durable state）/ **Reset Agent Computer**（回最近 durable snapshot，**可能丢未存活**）。✅
56. **Recover from error state**：电脑不可达时从错误态用 Recover computer。✅
57. **本地电脑独立**：云电脑 ≠ 你面前的 Mac/Windows；Bot 跑本地命令需本地执行能力开启 + 你按本地策略审批。✅
58. **单 Bot 单屏单任务**：一个 Bot 的 screen 同时只能跑一个 computer-use 任务，要等完成/重定向才能起下一个。✅

### C7. 多 Bot 协作类
59. **Group chat**：`New chat` 选 **2-6 个 Bot** 建群；可编辑生成名；描述共享 outcome + 谁接下一步。✅
60. **群内路由**：正常写让参与 Bots 自决谁回；`@Bot` 定向提问；多 Bot mention 当真需要每个；`@everyone` 群更新 sparingly。✅
61. **Bot 互发消息（异步交接）**：Bot 给另一 Bot 发异步消息，接收方 wake、处理、稍后回复；**交接在对话里可见**。✅
62. **单阶段单 owner**：每阶段要一个 owner，太多并行 handoff 会产生重复活+噪声。✅
63. **Bot-to-group 交接仅文本**：图片需 Bot 直接发给需检查它的另一 Bot（不进群交接消息）。✅
64. **共享 context**：项目重叠时 Bot 自动对齐同 account/project，不用人贴笔记。✅
65. **chief of staff 模式**：一 Bot 坐顶协调专家 Bot（inbox/expenses/recruiting/bug/ops）。✅
66. **官网内部例**：工程 Bot 复现 bug → 建工单 → **交接给** debug Bot；sales Bot 更新 CRM + 起草 follow-ups；ops Bot seating 新员工 + 处理 Gmail 发票。✅

### C8. 集成 / 连接器类
67. **7 个内置 connector**（OAuth，xAI 维护，首次签入后零配置）：Gmail & Google Calendar（**两个独立**）、Google Drive（Drive/Docs/Sheets/Slides）、Outlook Mail & Calendar（**两个独立**）、OneDrive、SharePoint、Microsoft Teams、Salesforce。✅
68. **权限分级不对称** 🟡：Outlook Mail 一签即 `Mail.ReadWrite + Mail.Send`（全读写发）；Gmail 基线 `gmail.readonly`，`modify`/`send` 仅在工具组开启时（workspace 要 admin 开）。即"Outlook 全读写发，Gmail 起步只读"。
69. **OAuth app 目录**：Box / GitHub / Linear / Notion / Canva / Gamma / Vercel / S&P Global / Meltwater（需订阅）等预配置 OAuth connector，grok.com/connectors 可见更大目录。✅
70. **Bring Your Own MCP**：Custom → 贴 MCP server URL + 认证，Grok 发现其工具当内置用；**MCP server 需公网可达**（本地跑要 tunnel）。✅
71. **connector 账户级**：installed connectors 账户级，**不 per-Bot 隔离**——全员可用。✅
72. **`@` attach connector 到任务** + `/` 引用 skill。✅
73. **connector 被动**：连接器只"被问到才答"，**不主动感知**（Salesforce 不会注意 deal 移动）🟡——例外是 7/16 的 Automations（schedule 或邮件匹配触发，触发词汇仅"时钟或邮件"）。🟡
74. **企业 admin 预配**：Grok Business/Enterprise 要 team admin 在云控制台预配 connector 才全员可用。✅
75. **Grok API 并行面**：Grok API 有自己的 remote-MCP 支持 + function calling + server-side tools（与 connector 不同的 surface）。🟡
76. **Microsoft Office add-ins**：Grok for PowerPoint/Word/Excel/Outlook（免费 M365 add-in，嵌入微软 app）。🟡

### C9. 配置类
77. **Settings 面板**：Account / Plugins / Bot settings / Auto Review / Appearance / Usage & Billing / Sign out / Delete account（iOS）；桌面加 Beta/General/Agent。✅
78. **桌面+iOS 设置不对称**：iOS 无 teach-by-demonstration、无 routine 编辑/历史/test/删除、无部分高级桌面控件——需桌面。✅
79. **Legacy Privacy Mode 不支持**：Grok Bot 需云存储，Legacy Privacy 账户要切到支持的数据设置才能启动。✅
80. **训练 opt-out**：走 Cursor 账号隐私设置。✅
81. **Check for Updates**（Settings → Beta）：app 和 Agent Computer **分别更新**，更新 app 不重置云电脑。✅

### C10. 观察类
82. **transcript 显示工具活动**：tool activity / computer use / 创建文件 / 问题 / 审批请求 与普通消息并列。✅
83. **Agent Computer 预览**：实时看 clicks/typing/navigation/status。✅
84. **结果卡片**：文件/图片/链接/工具结果 在对话里显示为 card，可预览/保存/开源链接/带反馈续聊。✅
85. **修订而非重建**：让 Bot 修订已有 artifact 而非造断开副本。✅
86. **Preserve evidence**：要求 links/screenshots/action log；快速变化数据别只靠截图，保源系统链接或导出。✅
87. **Search / command palette**：跨 Bot/group 切换、找历史消息/文件/链接/routine、开设置/通用动作、跳回对话匹配处（rollout 期可用性可能变）。✅
88. **iOS search + swipe actions**：找对话和 message/file/link/routine 结果；swipe 快速 pin/hide 等常见控制。✅
89. **Push notifications**（rollout 中）：Bot 有结果/问题/审批请求时推送；未启用时 in-app attention states 保留。✅
90. **drafts per conversation 保存**：iOS 导航离开时草稿保留。✅

### C11. 安全类
91. **共享电脑边界**：所有 Bot 共一台电脑，文件/会话/CLI 凭证**全员可见**——"Do not use separate Bots as a security boundary"。✅
92. **撤权流程**：暂停/删 routine → 网站 sign out → uninstall connector + 源服务撤授权 → 删 /workspace 敏感文件 → hide/delete Bot → 必要时删 Cursor 账号。✅
93. **删 Bot 不删电脑**：删 Bot 不删共享电脑文件/浏览器会话，后端保留走 Cursor 条款。✅
94. **least-privilege setup**：只连 workflow 需要的工具 / scoped service accounts / 先 read-only + draft / sending-publishing-purchasing-deletion-production 永在审批后 / 定期 review connectors+routines / routine 源系统或流程变了就暂停 / 保 source links + action log。✅
95. **action log**：重要决策保留 source links 和 action log。✅
96. **Cursor 安全/隐私边界**：不比 Cursor 公开安全文档更宽，review 当前基础设施/加密在 cursor.com/security。✅
97. **敏感步骤不进聊天**：密码/一次性码绝不发在普通聊天里。✅

## 2. 核心概念

| 概念 | 是什么 | PM 含义 |
|------|--------|---------|
| **Bot** | 一个持久的、具名的 AI 同事（"a single persistent, named agent"），有 name/title/description/avatar | 身份是**产品语言的一等公民**，不是 session 别名；上限 50 |
| **Computer**（云端电脑） | Bot 跑在的持久云 VM（浏览器+fs+终端），**账户级共享** | "电脑"是**状态容器**，不是 per-session 沙箱；Bot 各有 screen 但无独立安全边界 |
| **Skill** | 可复用指令集（怎么做一类活：steps+决策规则+输出+安全边界），跨 Bot 共享 | **工作流资产**，可沉淀/复用/分发；`/` 引用 |
| **Routine** | skill 的调度壳（schedule / event 触发） | 把"人触发"升级为"自动触发"；可 pause/resume/test/edit（桌面） |
| **Approval** | 不可逆动作前的人审门控 | 信任边界——放手自治的代价是关键动作必停；per-action 粒度 |
| **Auto Review** | 模型预审规则（Require Approval / Always Allow） | 把"每次问"升级为"规则化预审"，Require 永远赢 |
| **Secure handoff** | 敏感输入时 Bot 把电脑控制权交还人 | 比 approval 更深的介入——直接接管输入 |
| **Handoff** | Bot 间异步传任务归属 + 电脑控制权 | 编排 = 真交接（异步消息、接收方 wake），不是消息广播 |
| **Group chat** | 2-6 Bot 同一群聊协调 | 圆桌的官方形态——共享 thread + 互发 + 派活 + 传归属 |
| **Connector / Plugin** | 连接器（OAuth / 目录 / BYO MCP）给 Bot 结构化访问外部服务 | 双通道：有 API 走 connector，没 API 走 computer use |
| **Agent Computer** | 看共享桌面实时预览 / 接管敏感步骤的入口 | 观察面板 + 介入面板合一 |
| **`/workspace`** | 共享工作区路径 | 跨 Bot 文件 handoff 的物理载体 |

## 3. 状态哲学（重点章节，深挖）

**状态焊在"Bot + 共享云端电脑"上，不是焊在 session 上。** ✅

### 3.1 三层持久化（官方"persistent, named teammate with a durable state"拆解）

1. **Bot 身份持久**：Bot 有 name+title+description+avatar，**不被每次 prompt 重建**——账户级资源，跨任务/跨天/跨 surface（桌面+iOS）存活。✅ 换记忆 ≠ 换 Bot：删一个 Bot 不会删底层电脑的文件/会话。✅
2. **云端电脑持久**：files / browser sessions / app logins / 安装态 **跨任务存活**，context compounds 而非每任务重置。✅ 电脑是**账户级**的，所有 Bot 共用一台，登录态/文件对全员可见（"treat a login as available to all your Bots"）。✅ 持久化分级：durable state（文件/浏览器态/支持登录）跨 update/recovery 存活；临时目录/手动包/未提交状态可丢。✅
3. **记忆持久**：Bot 记住稳定工作偏好 + 重要事实 + 过往工作 summary，越用越准；但**记忆不是权威源**，变动事实放源系统。✅

### 3.2 换记忆 vs 换成员分别意味着什么

- **换成员（加/删 Bot）**：Bot 是轻量身份（name+job+description），加一个 Bot 不动电脑（`Cmd/Ctrl+N` 即建）；删一个 Bot **不删电脑**——共享电脑的文件/登录态还在，要删得手动登出/撤 connector/清 /workspace/删 Cursor 账号。✅ Duplicate Bot 带 profile/skills/routines **但不带记忆/历史/附件**——证明**身份可复制、记忆不可复制**。✅ 这是**关键设计**：Bot 是"工位上的人"，电脑是"公司的机器"，换人不换机器。
- **换记忆（重置上下文）**：官方没明确"重置 Bot 记忆"的开关 ⚠️——只有"删 Bot"和"清电脑"两类操作；记忆绑在 Bot 上，清电脑不清 Bot 身份。这意味着**记忆和身份是绑定的**，与共享电脑状态是**解耦**的。隐藏 Bot（hide）**不暂停 Bot 也不暂停 routine**——状态继续跑。

### 3.3 与 agents-remote 的对照（PRD 角色/任务/房间/看板/记忆/agentmore）

| Grok Bot | agents-remote PRD 对应 | 异同 |
|----------|----------------------|------|
| Bot（具名持久身份，上限 50） | **角色**（AgentProfile） | 同：身份是一等公民；异：Grok Bot 身份**绑持久电脑+记忆**，PRD 角色**绑 prompt+provider**，状态是后置 |
| 共享云端电脑（账户级 VM） | 无直接对应（agents-remote 是 project-scoped 服务器） | **Grok Bot 把"共享工作环境"做成一等公民**——agents-remote 当前是 per-session 文件/git/terminal，未升到"项目级共享工作区" |
| Skill/Routine | 无（PRD 第一期不含定时/复用） | **Grok Bot 已做了 PRD 后置的"定时 + 工作流复用"**——值得前置考虑 |
| Group chat（2-6 Bot 群聊） | **房间**（圆桌，第二期） | 同形：共享 thread + 互发 + 派活；Grok Bot **群聊即圆桌**，无独立"房间"实体；**上限 6 Bot/群** |
| Approval（per-action） | 审批闭环（PRD 第一期，per-goal） | 同源但粒度不同：Grok Bot 审单动作，PRD 审整任务 |
| chief of staff 协调专家 | **看板**（PRD）+ 后续 team | Grok Bot **用 Bot 当协调者**，agents-remote 用**看板当协调视图**——两种协调抽象 |
| 50 Bots 上限 | 无明确 | agents-remote 应考虑身份数量边界 |

**关键启示**：Grok Bot 把"**共享持久电脑**"做成状态核心——这是 agents-remote 当前**没做**的维度。agents-remote 的状态焊在 session（CLI 进程）+ project 目录，Grok Bot 焊在"Bot + 共享 VM"。两种哲学：agents-remote 是"控制面管 CLI 进程"，Grok Bot 是"云桌面管同事"。

## 4. 派活与编排交互

- **下达工作 = 发微信**：纯自然语言消息，无 workflow builder、无表单、无前置配置。✅ 官方明确"simply message a Bot to take on a task and it gets done""No automations to set up"。刻意低门槛，对标"给同事发任务"心智。
- **强请求五要素结构**（官方推荐）：Outcome / Sources / Constraints / Deliverable / Review point——比 PRD "派活"更结构化，值得借鉴为"派活模板"。✅ ⚠️ **社区校准（走查 P2）**：五要素是 PM 推断的"好结构",**社区侧零印证**——246 评论无人提及派活结构/五要素/任何模板(社区要么不用 Grok、要么自建,没人谈"派活怎么写")。不应作为"已被验证的最佳实践"引用,仅作"官方推荐结构"标注。
- **多 Bot 交接 = group chat + 异步传归属**：✅
  - 群聊选 2-6 Bot，独立互发消息、thread 共享上下文、传任务归属（pass ownership）。
  - "chief of staff" Bot 坐顶，每条业务线一个专家 Bot，Bot 间并行、人不是路由器。
  - 项目重叠时 Bot 自动对齐同 account/project，不用人贴笔记。
  - 官方内部例：工程 Bot 复现 bug → 建工单 → 把修复**交接给** debug Bot。✅
  - Bot-to-group 交接仅文本，图片要 Bot 直接发给需检查它的 Bot。✅
- **编排哲学**：用户从"操作员"变"supervisor"——delegate + 等 Bot 回来交成品，而非逐步指令。✅ 与 agents-remote PRD "从操作员变老板"**完全同构**。
- **工作中可打断重定向**：你的 DM 优先于后台活，"Stop now"立即停（不撤销已完成）。✅ 这是 PRD "随时插手细节"的官方形态。

## 5. 记忆与上下文

- **Bot 记住**：稳定工作偏好、重要事实、过往工作 summary（不重放每条历史）。✅
- **跨任务/会话累积**：context compounds，不每任务重置。✅
- **主动 follow up**：捞你丢的 thread、催停滞 handoff、从过往对话续。✅
- **越来越主动**：几次任务后懂何时该 ping vs 自己继续，从被动响应到主动接活。✅
- **Skill = 结构化记忆**：Skill 是"怎么做一类活"的持久 expertise，比纯对话记忆更结构化（指令+脚本+资源）。✅ 跨 Bot 共享、可 review/管。⚠️ 媒体指 Grok 系 Skills **不跨工具**（只在 xAI 平台内）、且欧盟/英国不可用（GDPR）——**记忆是平台绑定的**，是锁定成本。🟡
- **记忆不是权威源**：变动事实放源系统、重要决策让 Bot cite/reopen 当前数据、直接纠正陈旧假设、安全边界写进 description。✅ 这是官方明确的记忆边界设计。
- **上下文怎么喂给 Bot**：官方未公开 compaction/检索机制 ⚠️（无"85% 检查点"类细节）。已知：Bot 共享电脑 → 文件/会话即天然上下文载体，不靠纯 prompt 重放。这与 agents-remote 调研 §13 的"共享白板（L2）+ 检查点（L3）"思路相通，但 Grok Bot **白板 = 真实电脑文件系统**。

## 6. 审批与介入

- **人在哪介入**：✅ 不可逆动作前 Bot 暂停、把人拉回来——"only come back when something needs your approval"。人审**拟执行动作 + 输入**（target/scope/values）。
- **审批什么**（官方枚举 prefer explicit boundary）✅：发消息/邀请、发布内容、购买/转账、删/覆盖数据、改权限、改生产、接受法律条款。
- **approval-only 怎么运作**：✅
  - **桌面**：Allow once / Deny / Always allow（存规则）。**iOS**：Approve once / Deny（无 Always allow）。
  - **Auto Review**：模型级预审规则——Require Approval 永远停、Always Allow 仅在没别的停点时放行；冲突 Require Approval 赢。规则写窄。
  - **Secure handoff**：密码/passkey/2FA/CAPTCHA/付款/身份核验/明示要人的网站，Bot **把电脑控制权交还你**，你亲自操作，**不进聊天/transcript**——比审批更深的介入（直接接管输入）。
  - **Secure secret request**：支持连接器的专用入口，值 masked + 排除出 transcript + 不显示给模型。
- **关键语义**：审批**控制拟执行动作，不撤销已完成活**——"It does not reverse work already completed"。✅
- **粒度对比**：Grok Bot 是 **per-action** 审批（发邮件前停），PRD 是 **per-goal** 审批（任务完成前停）。Grok Bot 更细。agents-remote 已有 `permissionMode=plan`+`can_use_tool` per-action 机制，编排层应**复用而非新造**。

## 7. 执行与持久

- **跑在哪**：✅ 持久云端 VM（浏览器+fs+终端），账户级共享、Bot 级独立 screen（并行不互扰、但无独立安全边界）。
- **持久形态**：✅ Bot 身份 + 电脑状态（文件/会话/登录）+ 记忆三层持久，跨任务/跨天/跨 surface。
- **持久化分级**：✅ durable state（文件/浏览器态/支持登录）跨 update/recovery 存活；临时目录/手动包/未提交状态可丢，重要结果拷进 /workspace 或附进对话。
- **恢复三档**：✅ Update Agent Computer（重建保 durable）/ Recover Agent Computer（不可达替换保 durable）/ Reset Agent Computer（回最近 snapshot，可能丢未存活）。Bot profiles + 对话在电脑不可达时不一定丢。
- **移动端**：✅ iOS app（iPhone，iOS 18+，非 iPad/非 Android），桌面+iOS 同 Bot/thread；桌面+iOS 功能不对称（iOS 无 teach-by-demonstration、无 routine 编辑/历史/test/删除）。
- **是否 PWA**：⚠️ 不是 PWA，是原生桌面 app + iOS app（下载走 cursor.com）。与 agents-remote（PWA + web 控制台）形态不同——Grok Bot 是**重客户端**，agents-remote 是**web 优先**。
- **本地执行可选**：Bot 默认在云端电脑跑；访问你**面前**的 Mac/Windows 是独立能力（三档开关，默认每次问）。✅

## 8. 商业模式与定位

- **分发**：✅ 不单卖，**捆绑进现有订阅**（SuperGrok Heavy / Cursor Ultra / Cursor Teams Premium）——"把 agent 放进用户已经在付的钱里"，分销成本最低。Cursor Ultra $200/月（个人，含一台 Bot 电脑 + 调度 routine + 扩展 token），Teams Premium $120/seat/月（加 SSO/集中计费/team marketplace）。SuperGrok Heavy $300/月。🟡 ⚠️ **社区校准（走查 P1）**：Cursor 捆绑是**双刃剑**——降低分销成本,但同时把 xAI 品牌污染传染给 Cursor。`Adrig`(#49265094)"The Cursor brand was the only wedge he had with enterprise customers, who seem to avoid Grok products altogether"(企业客户在避开 Grok 产品);`LaurensBER`(#49261795)"$120-200/月 most likely not going to fly [outside America]"(非美国市场不买账);`impulser_`(#49268631)"What if Grok models become horrible or they increase the pricing"(质疑模型锁定——**模型锁定比平台锁定更严重**,平台可换壳,模型是 Grok 独占)。**OPC 启示**:编排平台的 provider 必须可换(我们已是多 provider:Claude/Codex/pi),不绑定单一模型厂商,这是分发灵活性的根基。
- **与 Cursor 深度绑定**：✅ 下载托管在 cursor.com，认证走 Cursor 账号，xAI 在 Bot 页面卖 Cursor 套餐——SpaceX 收购 Anysphere（Cursor 母公司）$60B 后的**第一个联合产品**，两产品栈"显式互锁"。🟡
- **定位**：SaaS（非私有部署），面向个人 + 小团队 + 企业 waitlist。**非私有**——数据走 Cursor 账号体系、不支持 Legacy Privacy Mode。✅ 这与 agents-remote "个人私有部署"路线**正相反**。
- **付费点**：✅ 持久云电脑（计算成本）+ 调度 routine + 扩展 token 上限 + 企业治理（SSO/marketplace）。本质是**卖"持久执行 + 自治 + 治理"**，不是卖 token。
- **竞争**：🟡 直接对标 Anthropic Claude Cowork + OpenAI ChatGPT Agent——"agentic outsourcing"赛道。Grok Bot 差异化 = **共享云端电脑 + Bot 间真交接**（别人多为"单 agent 多用法"）。
  - ⚠️ **社区校准（见 community 走查 §9.3）**：**英文社区真正的主对照系是 OpenClaw + Hermes,不是 Claude Cowork/ChatGPT Agent**。246 HN 评论 12 处明提 OpenClaw(HN 2813 hits,"OpenClaw is what Apple intelligence should have been" 518pts)、`tonyhart7` "so like OpenClaw ???" 起比较链。Grok Bot 被定位为"OpenClaw/Hermes 开源谱系的商业托管版"(always-on 持久 VM + 商业化封装)。另有自建生态成熟:`mike_hearn` 用 systemd+Codex 自建 async agent($20/月)、`smartcomputer-ai/lightspeed` 开源、`buzz.xyz`(Block)是早期竞品。**agents-remote 启示**:OPC 多 agent 编排的真正开源竞品生态是 OpenClaw/Hermes 谱系,我们目标用户里有相当比例能自建(价值主张不是"让你能用持久 agent",而是"编排多个 + 统一治理 + 私有部署开箱即用");OpenClaw/Hermes 编排语义应在 multi-agent-orchestration.md 补调研。
- **额度边界**：usage 耗尽或 on-demand spending limit 到达时 Bot 卡住，走 Usage & Billing 查。✅

## 9. 对 OPC 多 agent 编排的启示

对照 agents-remote PRD（角色/任务/房间/看板/记忆/agentmore）与调研底座 §13 三件套。

### 印证（已有方向被官方产品验证）

1. **身份是一等公民** ✅：Grok Bot 的 Bot = PRD 的"角色"——持久具名身份，不被每任务重建，**有上限 50**。**强化 PRD 第一期"角色"实体的必要性**，并提示设数量边界。
2. **审批闭环是标配** ✅：Grok Bot 不可逆动作必审、agent 不能自主越界——印证 PRD "agent 不能自己标完成，必须审批" + 调研 §12 Paperclip `executionPolicy`。
3. **圆桌=群聊共享 thread** ✅：Grok Bot 的 group chat（2-6 Bot）= PRD 第二期"房间"——多 Bot 同一 thread 共享上下文 + 互发 + 派活。**印证调研 §13 三件套之"单一共享状态源"**（Grok Bot 是第五个收敛点，前四是 Buzz/cf-os/Paperclip/Claude Tag）。**上限 6 Bot/群**是值得参考的边界——圆桌不宜过大。
4. **从操作员到 supervisor** ✅：Grok Bot "you are not the middleman" = PRD "从操作员变老板" = 调研核心心智。**官方产品独立印证产品方向**。
5. **Skill/Routine 应前置** ✅：Grok Bot 已做了 PRD 后置的"定时 + 工作流复用"——**建议 PRD 把"skill 化复用"提前纳入考量**（即便第一期不做，schema 留口子）。
6. **强请求五要素结构** ✅：Grok Bot 的 Outcome/Sources/Constraints/Deliverable/Review point 是好"派活模板"，可作 PRD 派活 UI 的结构化引导。
7. **记忆边界设计** ✅：Grok Bot 明确"记忆不是权威源，变动事实放源系统"——印证调研 §13 "共享白板 = 活状态，对话日志 = 逐条"的分层，且提示 agents-remote 记忆层要明确权威性边界。
8. **durable vs replaceable 状态分级** ✅：Grok Bot 区分 durable state（跨 recovery 存活）vs 可丢状态——agents-remote 编排层状态设计应借鉴此分级（任务/goal durable，临时中间态可丢）。

### 挑战（Grok Bot 做了 agents-remote 没想的）

1. **"共享持久工作环境"是一等公民** ⚠️：Grok Bot 把"云端电脑"做成状态核心——Bot 共享 fs/会话/登录态。agents-remote 当前状态焊在 session + project 目录，**没有"Bot 级共享工作区"概念**。**启示**：PRD 角色应考虑绑一个"持久工作环境"（文件/git/terminal 已是 project-scoped，但"角色级可复用环境"未抽象）。这是 agents-remote 的**潜在盲点**——我们做的是"控制 CLI 进程"，Grok Bot 做的是"管同事的云桌面"，后者更接近真人协作心智。
2. **per-action 审批 vs per-goal 审批** ⚠️：Grok Bot 审**单个不可逆动作**（发邮件前停），PRD 审**整个任务完成**。**启示**：PRD 审批粒度可更细——`permissionMode=plan` + `can_use_tool` 已是 per-action（调研 §5 现状），编排层审批应**复用**而非新造 per-goal 门控；per-goal 审批只做"任务完成前必过目"。
3. **Secure handoff（接管输入）** ⚠️：Grok Bot 遇密码/2FA 时**把电脑控制权交还人**——比"审批"更深的介入模式。agents-remote 当前 `permissionMode=plan` 是"批准/拒绝"，无"你亲自来"档。**启示**：对敏感操作（输入凭证、改生产配置）补"接管"档，不只是 approve/deny。
4. **Auto Review 规则化预审** ⚠️：Grok Bot 把"每次问"升级为"规则化预审"（Require Approval / Always Allow），Require 永远赢。agents-remote 当前是 per-action 弹审批卡片，**无规则化批处理**。**启示**：编排层可加规则引擎（"外部邮件必审"/"读操作永许"），减少审批疲劳。
5. **工作中可打断重定向** ⚠️：Grok Bot "你的 DM 优先于后台活"+ "Stop now" 立即停——PRD "随时插手细节"的官方形态。agents-remote 应确保编排层支持"用户消息打断当前 turn" + "立即停"。
6. **结果可独立验证（evidence）** ⚠️：Grok Bot 强调"Ask for evidence—links/screenshots/action log"+ "Preserve evidence" + "do not rely on screenshot alone for rapidly changing data"。agents-remote 编排层任务完成时应要求 agent 交证据（源链接 + 截图 + action log），不只交结论。

### 盲点（Grok Bot 暴露的问题，agents-remote 应避）

1. **共享电脑=共享攻击面，共享登录态=accountability sink（责任黑洞）** 🟡 → ✅ 社区证据印证（见 community 走查）：Grok Bot 所有 Bot 共用一台电脑、登录态全员可见——kingy.ai 评"persistence turns convenience into attack surface"。
   - **⚠️ 更深一层（社区独家洞察）**：让 Bot **用用户账号登录（共享 session）= 把 Bot 的所有越权/违法操作都算到用户头上**,因为系统里没有"Bot 自己"。`ares623` 点睛 "**accountability sink**"（#49268993）；`VariousPrograms` "demo shows Grok logging in... human gets the blame"；`anthonyskipper` "bot just snags your creds from the browser"。**社区主张的正解**:Bot 应在 IDP 有自己的注册身份 + 自己的账号 + scoped 权限(`miguelspizza` "register them in the IDP, own accounts" #49268792；`stillpointlab` "accounts for my bots is what I really want" #49267594)——而非"共享用户 session"。
   - **agents-remote 铁律启示**：OPC 多 agent 编排**绝不能让所有 agent 共享一个用户身份**——每个 agent 必须有**独立 identity + scoped 权限 + 可审计可撤销**,而不是"借用户身份干活"。这是相对 Grok Bot(及所有"agent 接管用户账号"类 SaaS)的**结构性安全差异化**,不只是"私有部署"差异化(私有部署是"数据不出本机",独立 identity 是"责任不转嫁用户"——两层)。已沉淀进 `../design/opc-product-discussion.md` §4 角色身份节。官方自己也说"Do not use separate Bots as a security boundary"——印证共享身份不安全。
2. **agent 走人界面脆弱** 🟡：computer use 走"为人设计的界面"——改按钮/会话过期/CAPTCHA/弹窗都能 derail，官方未公开成功率。**agents-remote 启示**：优先用 API/MCP（已有 ProviderProfile/连接器），computer use 是**兜底**不是主线。
3. **记忆平台绑定 = 锁定** 🟡：Grok Skills 不跨工具、欧盟不可用——记忆越深越锁。**agents-remote 启示**：私有部署路线天然规避此问题（用户拥有自己的记忆），这是**agents-remote 相对 Grok Bot 的差异化卖点**。
4. **桌面+iOS 功能不对称** 🟡：Grok Bot iOS 缺 teach-by-demonstration/routine 编辑/历史/test——重客户端导致功能割裂。**agents-remote 启示**：web 优先天然全平台一致，是相对重客户端的优势。
5. **connector 被动 + 触发词汇窄** 🟡：连接器只"被问到才答"，Automations 触发仅"时钟或邮件匹配"——没"deal 移动/表单进来/文件落地"触发。**agents-remote 启示**：编排层 event 触发应更丰富（git webhook/CI/文件变更），不只 cron+邮件。
6. **always-on token 成本爆炸（社区首周已暴露）** ⚠️（见 community 走查 §9.3）：always-on 持久 agent 的 token 消耗是普通用户的 10-100x。内测者 `jjcm`(一个月) "I've used more tokens this month than... the last 5 years prior"；`madebywelch` "48% weekly usage left after 3 hours"；`maherbeg` "Right now, only the token insensitive can use these sweet features"。Grok Bot 自己承认在"building for the future state where tokens are vastly cheaper"（`jjcm` 转述官方口吻）。**agents-remote 启示**：多 agent 编排若每个 agent 都 always-on,成本爆炸;应设计"**按需唤醒 + 持久 context compaction**"(呼应 todos.dev idle 10 分钟 sleep + Raft idle/active 自管),而非"全员 7×24 在线"。`maherbeg` 明确说"solves continual effective compaction + selective resetting"能赚大钱——这是 OPC 成本治理的关键技术方向。
7. **信任是比 lock-in 更深的 SaaS agent 采用阻力** ⚠️（见 community 走查 §9.3）：246 评论 ~30%(trust/elon/cred 关键词高频)是"我不信任 xAI/Musk"——多位评论者明确"永远不用 xAI 任何产品"(`jesse_dot_id`/`agile-gift0262`)。`jknoepfler` "the American AI industry managed to create a product I trust less than existing commercial offerings"。**lock-in 可自托管绕开,信任不可绕开**——这是 xAI 特有品牌问题,但揭示通用规律:"让 agent 接管用户账号"这类产品对供应商信任阈值极高。**agents-remote 启示**:私有部署路线天然规避此问题(用户拥有自己的 agent + 数据 + 服务器),是相对所有 SaaS agent 产品的**根本性信任差异化**,不只是 Grok Bot 特例。
8. **形态差异是机会** ⚠️：Grok Bot 是重客户端 + SaaS；agents-remote 是 web/PWA + 私有部署。**不是竞品**——agents-remote 服务"要私有部署 / 要管 CLI agent（Claude/Codex）/ 要 web 控制台"的细分，Grok Bot 服务"愿意把数据放云、要云桌面自治"的细分。**两者可共存参考**。

### 核心 3 点（PM 决策级）

1. **"共享持久工作环境"是 agents-remote 的盲点维度**——Grok Bot 把它做成一等公民（Bot 共享账户级云 VM：文件/浏览器会话/登录态跨任务跨 Bot 持久，durable vs replaceable 分级）。PRD 角色应考虑绑"持久工作区"概念，而非只绑 prompt+provider。
2. **审批粒度应分层**——per-action（复用现有 `permissionMode=plan`）+ per-goal（任务完成必审）+ secure handoff（接管敏感输入）+ Auto Review（规则化预审）四档，而非 PRD 单一 per-goal 审批。规则化预审减少审批疲劳。
3. **Skill/Routine 工作流资产应前置留口子**——Grok Bot 已把 PRD 后置的"定时 + 复用"做成核心卖点（演示学流程→存 skill→挂 routine 调度，durable vs replaceable 状态分级）。agents-remote 即便第一期不做，schema 要留位置；私有部署是相对 Grok Bot 的天然差异化（记忆归用户、web 全平台一致）。

## 10. 证据分级与来源

### ✅ 官网/官方文档直证（~75 条，覆盖 C1-C11 全部 feature）
- 11 篇 docs.x.ai/grok-bot/ 文档页：overview / get-started / use-cases / computer-and-apps / bots / files-and-results / chat-and-collaboration / mobile / troubleshooting / approvals-security-and-privacy / skills-routines-and-automations
- x.ai/news/introducing-grok-bot（官方发布博客）
- x.ai/news/grok-connectors（官方连接器发布）
- 覆盖：发布日期 2026-08-11、early beta、订阅门槛、桌面+iOS、Cursor 深度集成、Bot=持久具名 agent、共享账户级云端电脑、computer use 双通道、24/7 关电脑仍跑、群聊 2-6 Bot 互发+传归属、chief of staff、Teach a task ≤10min、Skill 跨 Bot 共享需 connector、Routine schedule/event、记忆累积+主动 follow up、8 个角色场景、Approval 枚举、Allow once/Deny/Always allow、Auto Review Require 优先、Secure handoff 接管输入、Local execution 三档、删 Bot 不删电脑、7 内置 connector、BYO MCP、`/workspace` 共享、durable vs replaceable 分级、Update/Recover/Reset 三档、50 Bots 上限、强请求五要素、Stop now、transcript 显示工具活动、结果卡片、Search/command palette、Push notifications、共享电脑边界、撤权流程、least-privilege、action log、Legacy Privacy Mode 不支持、usage 耗尽卡住、app/Agent Computer 分别更新

### 🟡 权威媒体/二手（~10 条）
- SuperGrok Heavy $300/月、企业 waitlist、agentic outsourcing 赛道对标 Claude Cowork / ChatGPT Agent：VentureBeat / Trending Topics / kingy.ai
- SpaceX $60B 收购 Anysphere（Cursor 母公司）后首个联合产品：ground.news / VentureBeat
- 7 内置 connector 权限分级（Outlook 全读写发、Gmail 起步只读）：usecarly.com
- connector 目录（Box/GitHub/Linear/Notion/Canva/Gamma/Vercel/S&P Global/Meltwater）：usecarly.com + GitHub rdmgator12/awesome-grok-connectors
- connector 被动 + Automations 触发仅时钟/邮件（7/16）：usecarly.com
- Grok Skills 不跨工具、欧盟/英国不可用、锁定成本：memorylake.ai
- 共享电脑=共享攻击面、未公开 audit/rollback/成功率、computer use 走人界面脆弱：kingy.ai
- 内部已用于 sales/marketing/ops/finance/engineering：The Rundown（引 xAI）
- Grok API 有自己的 remote-MCP/function calling/server-side tools：boltic.io / nexla docs
- Microsoft Office add-ins（Grok for PowerPoint/Word/Excel/Outlook）：GitHub awesome-grok-connectors

### ⚠️ 推断（5 条）
- 记忆与身份绑定、清电脑不清 Bot 身份的解耦设计（官方未明确"重置记忆"开关，从"删 Bot 不删电脑"+ "Duplicate 不带记忆"反推）
- 上下文喂给 Bot 主要靠"共享电脑文件系统"而非纯 prompt 重放（官方未公开 compaction 机制，从"共享电脑+context compounds"推）
- compaction/检索机制未公开（无 85% 检查点类细节）
- agents-remote 与 Grok Bot 形态不同 = 非直接竞品、可共存参考
- iOS 无 teach/routine 编辑 = 重客户端导致功能割裂（官方明示"some advanced desktop controls not available on iPhone"）

### 来源 URL
- https://x.ai/news/introducing-grok-bot （官方发布博客，✅）
- https://docs.x.ai/grok-bot/overview （官方总览，✅）
- https://docs.x.ai/grok-bot/get-started （官方入门，✅）
- https://docs.x.ai/grok-bot/use-cases （官方用例，✅）
- https://docs.x.ai/grok-bot/computer-and-apps （官方电脑与 app，✅）
- https://docs.x.ai/grok-bot/bots （官方 Bot 管理，✅）
- https://docs.x.ai/grok-bot/files-and-results （官方文件与结果，✅）
- https://docs.x.ai/grok-bot/chat-and-collaboration （官方消息与协作，✅）
- https://docs.x.ai/grok-bot/mobile （官方 iOS，✅）
- https://docs.x.ai/grok-bot/troubleshooting （官方排障，✅）
- https://docs.x.ai/grok-bot/skills-routines-and-automations （官方 skill/routine，✅）
- https://docs.x.ai/grok-bot/approvals-security-and-privacy （官方审批安全，✅）
- https://x.ai/news/grok-connectors （官方连接器，✅）
- https://venturebeat.com/orchestration/spacexais-grok-bot-... （VentureBeat，🟡）
- https://kingy.ai/blog/what-is-grok-bot + /blog/grok-bot-ai-teammate-price-security （kingy.ai，🟡）
- https://www.usecarly.com/blog/grok-connectors （usecarly 连接器权限，🟡）
- https://github.com/rdmgator12/awesome-grok-connectors （GitHub 连接器目录，🟡）
- https://trendingtopics.eu/grok-bot-spacexai （Trending Topics，🟡）
- https://www.unite.ai/xai-launches-grok-bot-... （Unite.AI，🟡）
- https://www.memorylake.ai/en/blogs/what-grok-skills-mean-for-ai-memory （MemoryLake，🟡）
- 对照底座：./multi-agent-orchestration.md §13（三件套）+ §15（Claude Tag）、../design/multi-agent-prd.md（PRD 角色/任务/房间/看板/记忆）
