# cloudflare-os · PM 视角产品调研

> 调研对象：`cloudflare/cloudflare-os`（2026-08-05 开源，Apache 2.0）。作者 Kenton Varda（Cloudflare Workers 之父，2015 年 Sandstorm.io 作者，自称「Sandstorm + AI」）。Cloudflare 内部跑了 4 个月：AI review agent flag 了 25 万代码问题、拦下 1.6 万 merge；非工程师一个月内造了 4000+ Gadget。
>
> **证据分级**：✅ 源码 / README / 官方公告 · 🟡 二手（媒体/blog/视频）· ⚠️ PM 推断
> **方法**：deepwiki（8 问，分维度穷尽）+ tvly（8 条新闻）+ 已有调研 §4.1 §11.2。
> **承接**：本仓库 `multi-agent-orchestration.md` §4.1/§11.2（技术视角），本文件是 PM 重写。
> **本版**：取消字数上限返工版。Feature list 按维度穷尽（workspace 创建管理 / Gadget 沙箱与能力授予 / Blueprint 模板实例化 / Gatekeeper 三层能力+模拟+批量审批 / ChangeBatch 提议接受流 / Overseer DO 内核 / CRDT 虚拟 FS 多端编辑 / agent spawn 与交互 / 文件执行 / 配置 / 观察调试 / sharing / hooks / scheduler / self-loopback 全维度）。痛点扩到 14 条。

## 1. 一句话定位

**一个跑在 Cloudflare 全球网络上的企业级 AI 工作空间操作系统**——每个员工有一个私有的 AI Agent + 一堆自己造的沙箱小应用（Gadget），所有对外部数据的访问被「守门人」Gatekeeper 按能力粒度管控，agent 从零权限起步、按需逐项申请、写操作可批量审批。（✅ README + 官方公告 + 🟡 4geeks/explainx）

它不是传统意义的 OS（README 自己承认这是比喻），而是「kernel=workshop-backend / drivers=gatekeeper / processes=gadgets / executables=blueprints / ???=agents」的企业 IT 工作台类比——README 特意把 agent 放在「???」那格，强调传统 OS 没有这个位置，AI agent 不能简单当一类用户对待，需要独立的受限权限且向人类负责。（✅ README + 🟡 slashdot/explainx）

> ⚠️ **社区校准（见 `pm-cloudflare-os-community.md`）**：开源首周 HN 主帖 658 pts / 331 评论中，**约 40% 评论批「OS」是营销话术**（`thehamkercat`/`alt227`/`orphea`/`MattyRad`/`dwroberts`/`clhodapp`/`sixdimensional` 等）。Kenton 本人**两次回应都不辩护技术含义**——先自嘲「mostly to get trolls to retweet and complain about it for free advertising. It's working. ;)」，再说「we aren't that clever about naming at Cloudflare... nobody could agree on anything so it just [stayed]」——**等于默认「OS」非技术准确命名**。lord.technology 博客也认「The name is a distraction, so set it aside」。**结论：应作营销话术处理，不作技术形态背书。**「OS」二字不承载技术准确性，承载的是 Cloudflare 的平台定位叙事。

## A. 根本使用场景

**主场景：非工程师在浏览器里跟一个带着公司上下文的 Agent 说话，造一个能复用的小工具出来，不用找 IT。**（✅ 官方公告「starts with a conversation」+ 🟡 YouTube/4geeks）

用户旅程（完整一段）：
1. 员工打开浏览器进自己的 workspace（= 一个 Durable Object，私有的，列表在首页）。（✅ 架构 + listGadgets/openGadget）
2. 跟 Agent 说「帮我做一个追踪客户付款、能识别回头客、手机上能打开的页面」。（🟡 4geeks）
3. Agent 在沙箱里**当场写并跑代码**（executeCode 工具 + 流式 code delta），造出一个 Gadget（自己的 Dynamic Worker + 自带 SQLite，与世隔绝），并在 chat 里展示一张 CreatedGadgetChatCard 让用户点开。（✅ executeCode + toolCallOutputFormat + CreatedGadgetChatCard）
4. Agent 要碰外部数据（比如读 Google Sheet / 写 GitHub issue）时，**不是它手里有 API key**，而是发 `requestConnection` 请求用户连一个 Gatekeeper——chat 里出一张 accept/deny 卡片，用户 accept 后走 OAuth，Gatekeeper 创建出来作为命名 binding 进 chat 环境，agent 续跑用它。（✅ connectionRequest 流）
5. 写操作（有外部副作用）经 `submitAction` 进 ApprovalQueue 不立即执行，Gatekeeper **本地模拟出结果**告诉 agent「成功了」，agent 继续排队下一动作，用户回头一次性批一整批（applyAction / autoApproveTags 自动放行）。（✅ Gatekeeper 模拟）
6. Agent 改 code/造 Gadget 都是 provisional ChangeBatch，挂 chat 分支，UI 出「Pending changes」横幅，用户 Accept→mergeChanges 提升主线 / Discard→revertChanges 全弃。（✅ ChangeBatch）
7. 做出来的 Gadget 可以存成 Blueprint（KV 存元数据 + R2 存 .gadget 包）给团队复用，新实例是**完全独立的新沙箱**（两阶段实例化接好 binding），互不污染。（✅ Blueprint）
8. 后台跑确定性 workflow + scheduler Gatekeeper 周期任务（every/calendarAt/runAt），里面嵌个别 AI step，不全程烧 token。（🟡 4geeks + ✅ scheduler gatekeeper）
9. Gadget 代码用 Yjs CRDT 多端实时同编辑，DO 存版本历史可回溯任意版本。（✅ Yjs）

一句话抓主场景：**「让每个员工都能安全地让 AI 帮自己造工具、用工具，IT 不用进场」**。（⚠️ PM 提炼）

## B. 解决的痛点（没它之前）

逐条列（README / wiki / 官方公告明示 + PM 提炼）：

1. **SaaS 安全 bug 漏用户数据**——传统多租户 SaaS 一个 bug 就漏全平台。它每个 Gadget 一个私有沙箱实例，一个 app 的 bug 不可能漏到攻击者手里。（✅ README）
2. **SaaS 不能改、不够用**——用户没法改 SaaS 适应自己。Gadget 代码用户随便改，缺啥功能加啥。（✅ README）
3. **agent 拿着全权 API key 太危险**——一个 prompt injection 就把整个 GitHub org 暴了。能力模型，agent 从零权限起步，按资源逐项授予，写操作必经人审批；AgentSpawnerConfig 甚至能给 agent「只能回这一封邮件」的 props stub，防 prompt injection 越权。（✅ Gatekeeper + AgentSpawnerConfig props）
4. **让 agent 碰内部数据要 IT 写连接器、走几个月集成**——每个外部服务包成一个 Gatekeeper（OAuth/限流/审计/预算/人审），开箱即用，admin 配策略不改 agent 代码。（✅ 三层模型 + 🟡 cio）
5. **传统 agent harness 给 agent 全量 ambient 访问**——大多数 harness 让 agent 默认能碰所有服务，安全风险大。它能力模型：默认零访问，显式 introduction 才有。（✅ README「broad ambient access」批）
6. **AI 生成的 app 没地方安全跑**——每个 Gadget 一个独立沙箱（Dynamic Worker Facet + 自带 SQLite），null-origin iframe + fetch 默认全禁 + CSP `default-src 'none'`，能力靠 introduction 显式授予。（✅ Gadget 沙箱 + iframe CSP）
7. **每条 agent 操作都要同步等审批，agent 干干停停、用户嫌烦关掉安全开关**——它用「模拟 + 批量审批」：agent 发需审批动作时 Gatekeeper 本地模拟出结果告诉 agent「成功了」，agent 继续排队下一动作，用户回头一次性批一整批。README 明示这是为解决「同步人审导致 agent 卡住或用户关安全」。（✅ README + Gatekeeper 模拟）
8. **造的工具无法跨人复用、改了就坏、个人开发者维护在线服务累**——Blueprint 把 Gadget 存成可分享模板（KV 存元数据 + R2 存 .gadget 包），实例化时两阶段接 binding，新实例是干净副本，互不串改；别人跑自己的副本，作者不用维护在线服务。（✅ Blueprint + README「个人开发者维护在线服务累」）
9. **长 agent 对话超 context 就失忆**——CompactionCheckpoint：到 85% input budget 时自动摘要前段，钉住当时的白板/code 版本（observedCodeVersion + acceptedChanges/proposedChanges），resume 时注入 summary + 后段。（✅ CompactionCheckpoint）
10. **agent 被重启打断就丢进行中的 turn**——Overseer 构造器扫 activeAgents，重解析模型 + 回放 chat log 续跑，挂起 edit 重新物化进 Y.Doc；DO alarm 60s keep-alive + 重试，客户端断连/DO 重启都续命直到所有 agent 跑完。（✅ resumption + alarm）
11. **agent 跑代码要回调回 chat、长周期回调没机制**——AgentSelfLoopback「magic object」`self`：executeCode 跑的代码调 `self.foo(123)` 就发 agentCallback 回 chat 激活 agent；可过 RPC 传、可存 DO KV，支持长周期回调；agent 想结束 turn 但有未解 callback 时发 agentNudge 提示续跑，停滞的 callback 被拒。（✅ self-loopback + agentCallback + agentNudge）
12. **agent 需要外部资源时卡死等用户配连接**——connectionRequest 流：agent 用 `requestConnection` 主动请求连某 vendor 的 Gatekeeper，chat 里出 accept/deny 卡片，用户 accept 后自动建 Gatekeeper 进 chat 环境、agent 续跑；deny 则 agent 不续跑交用户决定下一步。（✅ connectionRequest）
13. **企业 agent 部署没护栏、非工程师不敢用**——README 明示 Gatekeeper 给 agent + app 加护栏，让非工程师也能安全用。（✅ README + 官方）
14. **通用 coding agent 烧 token、慢**——README 称它的 coding agent 因平台紧耦合简化，同模型下更快更省 token；模拟 + 批量审批也让 agent 不在等同步人审上浪费 token。（✅ README）

## C. Feature list（完整，按维度穷尽）

> 原则：用户能用它做什么。每项标「用户视角」+ 证据分级。RPC 方法名标出便于溯源。

### C.1 Workspace 创建与管理（User/Overseer 层）

- **新建 workspace**：`newGadget()`（将改名 `newWorkspace()`）创建，初始标题「Untitled Workspace」，记 `gadget_created` 分析事件并打开。（✅ AuthenticatedApiImpl）
- **打开 workspace**：`openGadget(id, shareKey?, ...)`（将改名 `openWorkspace()`），带 shareKey 时兑换并加为协作者。（✅ PublicApi）
- **列出 workspace**：`listGadgets()` 返回所有 workspace metadata 显示在首页；provisional workspace 隐藏。（✅）
- **置顶/取消置顶**：`setPinned(pinned)` pin/unpin，首页 `handleTogglePin` 乐观更新。（✅ Overseer）
- **改 workspace 标题**：`setTitle(title)`，`GadgetEditor.tsx` 提供编辑 UI。（✅ Overseer）
- **删 workspace**：`deleteSelf()`，**仅 owner 可删**，删所有数据；协作者只能从自己首页 dismiss（不删 gadget、不撤访问）。（✅ Overseer）
- **查 workspace metadata**：`getMetadata()` 返回 id/title/total cost/sharing status/role。（✅）
- **订阅 metadata 变化**：`subscribeToMetadata(callback)` 立即回调 + 变化时推送。（✅）
- **订阅在场观众**：`subscribeToPresence(subscriber)` 收当前观众名单 + 增量（join/leave）。（✅）
- **owner 与协作者隔离**：协作者用自己的 AI model + connected account 做 binding，不隐式访问 owner 资源。（✅）

### C.2 用户档案与设置（UserDurableObject）

- **设显示名**：`setOwnDisplayName(name)`，chat 里可见。（✅ AuthenticatedApi）
- **设/删头像**：`setAvatar(data | null)` 上传或移除；`getAvatar(userId)` 按 id 取。（✅）
- **列出可连 vendor**：`listGatekeeperVendors(filter?)` 列所有可连的第三方服务。（✅）
- **连账号（OAuth）**：`connectAccount(vendorId, resourceUrlPatterns?)` 返回授权 URL，新 tab 完成 OAuth。（✅ UserAccount DO 处理 callback/auth code）
- **订阅已连账号**：`subscribeConnectedAccounts(subscriber, filter?)` 实时更新连接状态。（✅）
- **断开账号**：`disconnectAccount(accountId)` 撤 token。（✅）
- **列 CF 账号**：`listCloudflareAccounts()` 列 grant 能访问的 CF 账号。（✅）
- **选计费 CF 账号**：`selectCloudflareAccount(accountId)` 持久化计费选择。（✅）

### C.3 AI 模型配置

- **列出/选模型**：列已配模型，Blueprint 实例化时选 `aiModel`/`agentSpawner` binding 用。（✅ BlueprintLandingPage）
- **加模型**：提供 `profile(id,name)` + `config(provider,model,apiToken,accountId,apiUrl)`，`AddModelModal` UI 填 Model ID/Display Name/CF Account ID/API Token。（✅）
- **删模型**：按 id 删。（✅）
- **quick model**：设一个简单任务用模型（如生成 chat 标题）。（✅）
- **preferred model**：设首选模型或「No agent」。（✅）
- **AI Gateway 路由**：平台 AI Gateway（免费档）或用户自带 CF AI Gateway（BYOK），`AiGatewayConfig` 管 enabled providers。（✅）
- **预算/限流**：`ENABLE_CLOUDFLARE_LIMITS` 开启时给每日免费额度，用完需连有余额的 CF 账号；`getCloudflareUsage()` 查用量/余额。（✅）

### C.4 Gadget 沙箱与生命周期（Workpiece/Gadget 层）

- **造 Gadget**：`createGadget(title, chatId?, bindingName?)` 在 workspace 里造 gadget workpiece；无 bindingName 则按标题生成；chat 内造为 provisional（挂 chat 分支）。（✅ Overseer）
- **取 Gadget**：`getGadget(id)` 按 workpiece id 取。（✅）
- **打开 Gadget UI**：`getUiBundle(chatId?)` 取部署的 UI 代码。（✅ GadgetClient）
- **连 Gadget 后端**：`connectToGadget(chatId?)` 开 RPC 接口到 Gadget 的 DO，调 server.js 导出的 `Gadget` 类方法。（✅）
- **导出 PDF**：`exportPdf(chatId?)` 把 Gadget UI 渲染成 PDF，平台拥有的控件在 Gadget 外执行。（✅）
- **删 Gadget**：`remove()`（WorkpieceClient 通用）永久删。（✅）
- **改 Gadget 标题**：`setTitle(title)`（WorkpieceClient）。（✅）
- **沙箱前端**：null-origin iframe，`sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"`，CSP `default-src 'none'; connect-src 'none'; ...`；`client.js` 全局 `gadget` RPC stub（Cap'n Web）调后端；DOM 操作建 UI；console 日志转发到父 frame；`window.open()`/`alert()`/`confirm()` 禁。（✅ GadgetUI.tsx）
- **沙箱后端**：Dynamic Worker Facet 跑 `server.js` 导出的 `Gadget` DO 类，自带 KV + SQLite 私有存储，`fetch()` 默认禁，只经 `env` binding 通信。（✅）
- **代码两文件**：`client.js`（UI）+ `server.js`（后端 DO 逻辑）。（✅）
- **能力授予（introduction）**：默认零访问；贴资源链接 / 点「add resource」UI 选 / agent `requestConnection` 请求三种方式引入资源，引入后建 Gatekeeper 绑定进 Gadget `env`。（✅）

### C.5 Binding 管理（Gadget ↔ Gatekeeper 接线）

- **列 binding**：`listBindings(chatId?)` 列 Gadget 所有 binding。（✅ GadgetClient）
- **取 binding**：`getBinding(name)` 取某名字下的 Gatekeeper。（✅）
- **绑**：`bind(name, target, chatId?)` 把 workpiece（Gatekeeper）绑进 Gadget `env` 某名。（✅）
- **建议名绑**：`bindWithSuggestedName(target, chatId?)` 系统建议 binding 名。（✅）
- **解绑**：`unbind(name)`。（✅）
- **重命名 binding**：`renameBinding(oldName, newName)`。（✅）
- **Blueprint 标注**：`getBlueprintAnnotation(name)` / `setBlueprintAnnotation(name, annotation)` 给 binding 加 Blueprint 注解。（✅）

### C.6 Gatekeeper 三层能力模型

- **Vendor 层**：`GatekeeperVendor` 每服务一个，描述服务 / 起 OAuth / 列支持资源类型 / 返回 TS 类型定义。（✅）
- **User 层**：`GatekeeperUser` 用户对某服务的认证连接，管授权/token 存/刷新/撤销（`UserAccount` DO），`getVerifier()` 铸 `GatekeeperUserVerifier` 不透明 token 给 observer 校验。（✅）
- **Session 层**：`Gatekeeper<Session>` 某 Gadget 的某资源授权/绑定，实际 API 交互在此，按能力粒度细控。（✅）
- **造 Gatekeeper**：`newGatekeeper(accountId, resourceUrl)` 按 URL + 连接账号造；`newAiModelGatekeeper(modelId)` 造 AI 模型 binding 的；`newAgentSpawnerGatekeeper(config)` 造 agent spawner binding 的。（✅ Overseer）
- **取 Gatekeeper**：`getGatekeeperById(id)`。（✅）
- **写操作审批**：有外部副作用的 action 必经 `submitAction()` 进 ApprovalQueue，不立即执行，等 `applyAction()`（通常用户审批后）；读操作先 `authorizeObservation()`。（✅）
- **模拟续跑**：Gatekeeper mutate 本地 cache 或 read 时 overlay pending action，让 agent 以为成功、读回拿到模拟值，继续排队；用户批量 applyAction。（✅）
- **自动审批**：作者标 `autoApprovable`（per-action verdict）+ 用户配 `autoApproveTags`（gatekeeperId × actionKind 规则）+ `AutoApprovalDrainer` 排空自动放行。（✅）
- **观察者校验**：Gadget 被分享时协作者成「observer」，`addObserver(id, verifier)` 必校验该用户能看到这 Gadget 至今读过的所有数据，不能则抛异常；`removeObserver(id)` 幂等移除；`GatekeeperUserVerifier` 只回传给同 vendor 的 gatekeeper，保信任边界。（✅）
- **auto-provisioning Gatekeeper**：不需 OAuth 自动建连接账号（如 scheduler gatekeeper）。（✅）
- **ambient mode**：admin 配 `disabled` / `optional`（默认，用户 opt-in）/ `enabled`（自动给所有人开通不可移除）三态。（✅ admin）

### C.7 Hooks（事件回调接线）

- **注册 hook**：agent/gadget 代码注册持久回调，让 Gatekeeper 反向调进 workspace；`boundHooks` 存记录（gatekeeperId/gadgetId/vendorId/controller/fallback callback/description/enabled）。（✅）
- **enable/disable/delete hook**：`enableHook(id)` 激活（GatekeeperHookLoopback 建连接开始投递事件）/ `disableHook(id)` 停 / `deleteHook(id)` 永久删（含禁用）。（✅ Overseer）
- **列 hook**：`listHooks()` 返回已绑 hook 信息。（✅）
- **nextHookId**：计数器分配唯一 hook id。（✅ Overseer 存储）

### C.8 Scheduler Gatekeeper（定时/周期任务）

- **注册调度**：`ScheduleSession` binding 提供 `every()`（间隔）/ `calendarAt()`（wall-clock 周期）/ `runAt()`（一次性）三种调度。（✅ gatekeeper-scheduler）
- **持久回调**：回调须先 `ctx.restore()` 持久化再注册。（✅）
- **ambient gatekeeper**：auto-provisioning，不需 OAuth。（✅）
- **admin 控模式**：`disabled`/`optional`/`enabled`。（✅ admin）

### C.9 Blueprint 模板系统

- **浏览 Blueprint**：`BlueprintList` 组件列自己的 + 库里的，按 title/description 搜。（✅ 前端）
- **从 Gadget 造 Blueprint**：`createBlueprint(title?, description?, screenshot?)` 捕获当前 code + binding 配置。（✅ GadgetClient）
- **发布/传播**：创建/更新时 metadata 进 KV `BLUEPRINTS`、code snapshot 进 R2 `BLUEPRINT_CONTENT`，别人可发现用。（✅）
- **导入 .gadget archive**：可从 .gadget 包导入 Blueprint。（✅）
- **实例化**：`newGadgetFromBlueprint` 两阶段——Phase 1 造非 spawner binding（gatekeeper/aiModel）记 ID；Phase 2 造 agentSpawner binding，配置（displayName/modelId/env 映射到其他 gadget/gatekeeper）用 Phase 1 结果符号引用接好。（✅）
- **版本化**：`version` 字段每次更新递增，R2 存对应版本 code snapshot。（✅ BlueprintMetadata）
- **更新 Blueprint**：`updateBlueprint(blueprintId, options)` 改 title/desc/code/binding 标注。（✅ UserDO）
- **重发发布**：`retryBlueprintPublish(blueprintId)` 上次传播失败时重试。（✅）
- **删 Blueprint**：`deleteBlueprint` / `deleteOwnedBlueprint` 删 KV + R2 + UserDO 记录。（✅）
- **下载**：下成 .gadget archive 文件。（✅）
- **置顶/取消置顶**：pin/unpin 便于访问。（✅）
- **从库移除**：从个人库移除。（✅）
- **Blueprint metadata**（KV）：`BlueprintKvRecord` 含 BlueprintMetadata（title/description/author/created/version/lastUpdated/screenshot/output/bindings）+ ownerId + gadgetId。（✅）
- **Blueprint content**（R2）：`.gadget` archive（gzip 压 Yjs doc 快照）+ `screenshots/` 前缀存截图。（✅）
- **三种 binding 类型**：`gatekeeper`（gatekeeperName=vendor ID + typeUrlPattern）/ `aiModel`（用户选已配模型）/ `agentSpawner`（程序化造 agent）。（✅）
- **agentSpawner 配置**：`displayName` + `modelId` + `env`（binding 名 → 目标 workpiece，可是其他 gadget 或 gatekeeper）+ 可给 props（含 RPC stub，如「只能回这封邮件」防 prompt injection）。（✅）
- **标准输出格式（promoted blueprints）**：admin 把 Blueprint 标为 featured / 提升为标准输出格式进「New...」菜单 / 改 agent hints + overrides / 重排菜单顺序；agent 经 `describeStandardFormats()` 知道这些格式，用户要新 Gadget 时优先从这些起手。（✅ admin + AgentHooks）

### C.10 Chat 与 Agent 交互

- **发消息**：`ChatInput` 输入 + 「Send message」→ `handleSend` → `overseer.newChat`（新 chat）或 `overseer.sendChatMessage`（已有 chat）；plain text + slash command 都走 sendChatMessage。（✅ ChatInterface）
- **停 agent**：「Stop agent」按钮（agent active 时 Send 变 Stop）→ `handleStop` → `overseer.stopAgent`。（✅）
- **重试 agent**：agent run 报错时显「Retry」→ `handleRetry` → `overseer.retryAgent`。（✅）
- **改 chat 标题**：`handleSaveChatTitle` → `overseer.setChatTitle`。（✅）
- **看 chat 历史**：选中 chat 时 `overseer.getChatHistory` 加载。（✅）
- **消息类型**（AiChatMessage）：`message`（text/capsules/formats/reasoning/tool calls/attachments）/ `slashCommand` / `changes`（provisional code 变更）/ `merge`（用户 merge 到某 seq）/ `revert`（用户从某 seq revert）/ `action`（agent 执行了 action）/ `useGadget`（agent 访问了 gadget）/ `error`（agent run 报错）/ `agentCallback`（self 回调）/ `agentNudge`（未解 callback 系统提示）/ `connectionRequest`（agent 请求连 gatekeeper）。（✅ AiChatMessage）
- **流式事件**（AiChatStreamEvent）：`textDelta` / `reasoningDelta` / `toolCallStarted` / `toolCodeDelta`（executeCode 流式写 code）/ `toolCallFinished` / `toolCallTarget`（流式 write/edit 目标文件）/ `toolOutputDelta` / `toolCallOutputFormat`（流式 createGadget 输出格式）。（✅）
- **Pending changes 横幅**：`currentChatMetadata.hasProposedChanges` 为 true 时出横幅，有「Accept changes」/「Discard…」。（✅）
- **Accept changes**：`handleMergeChanges` → `overseer.mergeChanges(chatId, mergeThrough)` 提升 provisional binding edge + 应用 code update 到 mainline + 记 merge 消息。（✅）
- **Discard changes**：`handleDiscardPendingChanges` → `overseer.revertChanges(revertFrom=0)` 删该范围 provisional gadget + binding edge + 记 revert 消息；另有 `discardChatDraftChanges` 丢 chat 草稿变更。（✅）
- **观察 agent 步骤/tool call**：`ToolGroupRow` 分组显示可展开/折叠；`ToolCallGroup` 聚合相关 tool call + observations；ObservationChatMessage = ActionChatMessage + actionLog type "observation"。（✅）
- **provisional Gadget 创建卡片**：`changes` 消息含 provisional gadget 创建，显示为 `CreatedGadgetChatCard` 让用户点开新造的 gadget。（✅）
- **agent 活跃指示**：`isAgentActive` 状态，active 时 Send 变 Stop + 显示 provisional 内容（text/reasoning/tool calls）。（✅）
- **代码变更订阅**：`subscribeToCode(subscriber, fromVersion?)` 订 Yjs code 更新；`onProposedChangesChange` / `onStreamingProposedChangesChange` 更新 proposed UI。（✅ Overseer + ChatInterface）
- **改 code**：`updateCode(update, chatId?)` 发 Yjs update 到 server，应用到 mainline 或 chat 草稿分支。（✅ Overseer）

### C.11 Agent 执行内核（Overseer 内部，用户间接感知）

- **spawn agent**：`runAgentTurn` → `runAgentTurnWithContext` → `runAgent(AgentHooks, ModelHandle, chatId, author, chatMessages, AbortSignal, initiator, callbackInitiated, compaction)`。（✅）
- **活跃 agent 跟踪**：`#runningAgents` 内存 + `storage.activeAgents` 持久化。（✅）
- **模型配置解析**：resume 时从 initiator 的 User DO 重解析 model config。（✅）
- **resume 打断的 agent**：`#resumeAgent` 回放 chat log 续跑，挂起 edit 重新物化进 Y.Doc。（✅）
- **DO alarm keep-alive**：agent 跑时定 60s alarm，客户端断连/DO 重启都靠 alarm 续命直到所有 agent 跑完；alarm 自带重试；全 idle 时清 alarm；`alarm()` 等所有 agent 完成才投递 pending 外部消息响应。（✅）

### C.12 Agent 工具（agent 能调的）

- **executeCode**：跑一次性 JS，async 函数收 `self`/`env`/`ctx`；`env` 含 chat-specific binding RPC stub；不能直连网，经 binding 通信；`self` 是 magic object 调方法回 chat。（✅）
- **createGadget**：流式造 Gadget（`toolCallOutputFormat` 流式输出格式）。（✅）
- **requestConnection**：agent 请求连某 vendor Gatekeeper，含 vendorId/resourceUrl/reason/bindingName；chat 出 accept/deny 卡片；`acceptConnectionRequest` 建 Gatekeeper 进 chat 环境 + 续跑 agent，`denyConnectionRequest` 不续跑交用户定。（✅）
- **webFetch**：HTTP GET 任意公开 HTTPS URL，**不支持 POST/PUT/DELETE/PATCH / 转发凭证**；含文档→Markdown 转换；SSRF 防护用 workerd IP 过滤；输出存 chat 历史 可回放不重发。（✅）
- **describeBinding**：描述某 binding 的 workpiece 给 agent。（✅ AgentHooks）
- **listConnectableVendors / listConnectableResources**：agent 列可连 vendor + 资源类型。（✅ AgentHooks）
- **listAvailableBlueprints / fetchBlueprint**：agent 列可用 Blueprint + 取其文件 notes。（✅ AgentHooks）

### C.13 AgentSelfLoopback / 回调机制

- **`self` magic object**：executeCode 跑的代码收 `self`，调 `self.foo(123)` 发 `agentCallback` 消息回 chat 激活 agent 响应；`AgentSelfLoopback` WorkerEntrypoint 代理方法调到 Overseer `deliverAgentCallback`。（✅）
- **长周期回调**：`self` 可过 RPC 传、可存 DO KV，支持长期回调。（✅）
- **callback 出现在 env**：agent 收到 callback 时 env 里出 `PARAMS_N`（带 `.args` + `.resolve(value)` / `.reject(error)`）。（✅）
- **agentNudge**：agent 想结束 turn 但有未解 callback 时，系统发 `agentNudge` 消息提示续跑，明确告知哪些 callback 未解 + 如何用 `env.PARAMS_N.resolve/reject` 解；停滞 callback（nudge 后无进展）被拒并通知 agent。（✅）
- **activeAgentCallbackCount / rejectAllAgentCallbacks**：查活跃 callback 数 / 全拒。（✅ AgentHooks）

### C.14 CRDT 虚拟 FS 多端同编辑

- **Yjs Y.Doc**：存 Gadget 代码，多端实时同编辑无冲突；客户端改→发 update 给 DO→DO 应用→其他客户端收到同步。（✅）
- **版本历史**：DO 存 code 更新历史，可重建任意版本的 code。（✅）
- **subscribeToCode**：订 Yjs 更新，可 fromVersion 增量订阅。（✅）

### C.15 长记忆（CompactionCheckpoint）

- **85% 触发**：input budget 到 85% 触发 compaction，留足预算做 compaction 本身 + 续 turn。（✅）
- **AI 摘要前段**：summary 替换老消息，缩短 history 保关键 context。（✅）
- **钉白板/code 版本**：checkpoint 存 `observedCodeVersion`（白板/code 基线版本）+ `acceptedChanges` + `proposedChanges`，保 compaction 时 code 状态可准确回放。（✅）
- **`compactedTo` 序号**：chat metadata 记 compaction 水位线。（✅ AiChatMetadata）

### C.16 共享与协作

- **协作者角色**：`build`（全权：改 code + AI chat + 管 binding + UI）/ `use`（受限：渲染 + 交互 + 导出 UI + 看基础 metadata）；owner 隐式 build；角色全序，build > use；不能授比自己高的角色。（✅）
- **按 email 加协作者**：Share modal 输入 email → `addCollaborator(username, addRole, undefined)` → `SharingManager.addCollaborator` 建 `user` edge。（✅）
- **share link**：`createShareLink` 生 128-bit 随机 key，存 HMAC-SHA-256 hash，返 raw key + link ID；`newShareLinkKey` 为已有 link 铸新 key。（✅）
- **share key 兑换**：开 share link 时客户端发 raw key，`openGadget` 调 `redeemShareKey`，hash 查找，有效且未吊销则加 `shareKey` edge 或建新协作者记录 + 取对方 profile。（✅ SharingManager）
- **观察者同步**：协作者 access 变化时 `refreshAffectedCollaboratorListings(affected)` 遍历调 `forgetSharedGadget` / `updateSharedGadgetRole` 同步各 User DO 列表。（✅ Overseer）
- **首页展示**：列 owned + shared gadget，shared 显示 owner 名；按 `lastActive` 排序暗示最近活动。（✅）
- **recordSharedGadgetOpen**：开 shared gadget 时记/更新记录（缓存 title/owner/role/lastActive）。（✅ UserDO）
- **updateSharedGadgetRole**：更新缓存角色（仅展示，实际授权 Overseer 实时重算）。（✅）
- **forgetSharedGadget**：dismiss 或被撤权时从自己首页移除 + 从 Outputs 索引移除其输出。（✅）

### C.17 配置与部署

- **三种部署**：本地 `pnpm run-local` 五分钟试（wrangler + workerd）/ 部署自己 CF 账号（含 Cloudflare Access 认证 + AI Gateway 模型路由）/（即将）CF 托管 managed deployment。（✅+🟡 4geeks/explainx）
- **自托管**：开源 workerd + 支持 Ollama 本地 LLM（作者称本地「honestly faster」）。（🟡 explainx）
- **Cloudflare Access 零信任**：env `CF_ACCESS_AUD` / `CF_ACCESS_ISS` 配 Access，每用户/每请求先验再授。（✅ env.d.ts + 官方）
- **AI Gateway**：平台免费档或用户 BYOK。（✅）

### C.18 Admin / 组织治理（AdminApi）

- **品牌**：设 site name（顶栏 logo 旁）/ 上传或恢复 site logo / 设 accent color。（✅）
- **Skills（agent 指令）**：替换 agent system-prompt 指令。（✅）
- **Gatekeeper 治理**：enable/disable 特定 gatekeeper 资源类型；设 gatekeeper mode（disabled/optional/enabled，针对 auto-provisioning ambient）。（✅）
- **Blueprint 治理**：标 featured / 提升为标准输出格式进 New... 菜单 / 移除格式 / 更新格式（agent hints + overrides）/ 重排格式顺序。（✅）
- **注册控制**：开/关新账号注册。（✅）
- **公告/横幅**：设顶栏通知 / 全宽 banner。（✅）

### C.19 观察与调试

- **iframe console 转发**：Gadget iframe 内 console 日志转发到父 frame。（✅）
- **tool call 分组展开/折叠**：`ToolGroupRow` 可展开折叠看 agent 步骤。（✅）
- **流式实时更新**：textDelta/reasoningDelta/toolCodeDelta 等流式回客户端实时看 agent 进度。（✅ AiChatStreamEvent）
- **agent 活跃指示**：`isAgentActive` + Send/Stop 按钮切换 + provisional 内容显示。（✅）
- **observation 审计**：`recordAgentObservation` 记观察进审计日志；`listActions()` 列 action 历史。（✅ Overseer + AgentHooks）
- **action 审批入口**：`approveAction(id)` / `rejectAction(id)` Overseer 接口。（✅）

## 3. 核心概念

| 概念 | 是什么 | 用户视角 |
|------|--------|---------|
| **Workspace** | 一个 Durable Object = 一个私有工作空间，所有状态的容器 | 「我自己的 AI 工作台」 |
| **Overseer** | 每个 workspace 一个的 DO 内核，持 Yjs 文档/chat/agent/workpiece 注册表 | 「我工作台的大脑」 |
| **Agent** | 临时执行者，状态不持久、从 chat log 重建；OS 类比里「???」那格，非一等公民 | 「帮我干活的那位」 |
| **Gadget** | 沙箱小应用（自带 Dynamic Worker + SQLite，fetch 默认禁），是 Workpiece 一种 | 「我造的小工具」 |
| **Blueprint** | Gadget 模板（KV 元数据 + R2 .gadget 包），可分享，实例化成独立新 Gadget | 「可复用的模板」 |
| **Gatekeeper** | 外部服务守门 Worker，管 OAuth/审计/限流/预算/人审；三层 Vendor/User/Session | 「agent 碰外部数据的安检口」 |
| **ChangeBatch** | agent 提议的一批 code/创建变更，provisional 挂 chat 分支，等用户 merge/discard | 「agent 草拟、我拍板的一批改动」 |
| **Workpiece** | Overseer 管的可寻址实体统称（Gadget/Gatekeeper session 都是） | 内部术语 |
| **Binding** | Gadget `env` 里命名接 Gatekeeper 的连接（bind/unbind/rename） | 「给工具接上数据源」 |
| **Hook** | agent/gadget 代码注册的持久回调，让 Gatekeeper 反向调进 workspace | 「让外部事件触发我的代码」 |
| **Scheduler Gatekeeper** | ambient 定时任务 gatekeeper（every/calendarAt/runAt） | 「到点自动跑」 |
| **Self-loopback** | executeCode 跑的代码调 `self.foo()` 回 chat 激活 agent，支持长周期 callback | 「代码完成后回调 agent」 |
| **Cap'n Web RPC** | JS 版 Cap'n Proto RPC，前后端 + Kernel↔Gatekeeper 全走它 | 内部通信协议 |
| **Promoted Blueprint** | admin 提升为标准输出格式的 Blueprint，进 New... 菜单 | 「平台预置的输出模板」 |

（✅ deepwiki 架构/glossary/各模块）

## 4. 状态哲学（重点章节）

**核心命题：状态焊在 workspace（Overseer DO），agent 是临时来去。**

- **状态归属**：workspace 的全部状态——Yjs 文档、chat 历史、Gadget/Gatekeeper 注册表、actions、bound hooks、code snapshots、activeAgents、outputs、协作者 edges、share keys——都存在 `OverseerDurableObject` 的 DurableObjectStorage（DO 内嵌 SQLite）+ `UserDurableObject`（用户档案 + gadget/blueprint 索引 + shared gadget 缓存 + Outputs 索引）。agent 自己**不持久**，运行态是 chat log 的派生。（✅ Overseer/User DO 存储 schema）
- **换 agent 不丢状态**：workspace 不绑死某 agent 实例。同一 workspace 换 agent（或 agent 被重启打断后续跑），新 agent 在**同一份 workspace 状态**上工作——同样的 Gadget/Gatekeeper/chat 历史/绑定。状态跟 workspace 走，不跟 agent 走。（✅ Overseer 协调 + ⚠️ 推断）
- **换 workspace = 换状态**：workspace 是状态边界，DO 间天然隔离。一个 workspace 的 Gadget/Gatekeeper/chat/协作者不漏到另一个。per-workspace DO 强隔离，非「agent 携带状态跨 workspace」。（✅ 架构 + ⚠️ 推断）
- **断点续跑靠回放，不靠 agent 自存**：agent 被重启打断时，Overseer 构造器扫 `activeAgents`，重解析模型 + 回放 chat log 续跑，挂起 edit 重新物化进 Y.Doc。agent 的「记忆」= chat log 投影，不是进程里的东西。（✅ resumption）
- **DO alarm 续命**：agent 跑时定 60s alarm，客户端断连/DO 重启都靠 alarm 把 DO 拉回直到所有 agent 跑完，alarm 自带重试。状态常驻靠 DO + alarm，不靠长驻进程/长驻 agent。（✅ alarm）
- **协作者状态分流**：shared gadget 的展示态（title/owner/role/lastActive）缓存在**每个协作者的 User DO**（仅展示），实际授权永远由 Overseer 实时重算——展示与授权分离，避免缓存漂移。（✅ recordSharedGadgetRole 注释「presentation only」）

**一句话总结状态哲学**：**workspace 是状态的唯一锚点（Overseer DO + 内嵌 SQLite + 60s alarm 续命），agent 是无状态的临时执行者，从 chat log 派生一切、随时可重建；换 agent 不丢状态，换 workspace 才换状态。**（⚠️ PM 提炼）

**对「焊 workspace vs 焊 bot 身份」的取舍**：cloudflare-os 选前者——身份/记忆/能力都挂 workspace（员工 = workspace 拥有者，agent 是工具），不是挂 bot 身份（agent 无「我是谁」的持久自我）。契合其定位：**给员工配 AI 工具**，不是**编排一个 agent 团队**。它没有「角色」「编排」「多 agent 圆桌」抽象——agent 在它眼里是「OS 里 ??? 的位置」，单数工具不是组织成员。（⚠️ PM 推断，对照 §10）

### 4.5 不信任作为组织原则（community 走查独家洞察）

> 本节框架来自独立技术博主 lord.technology 深度博客「Cloudflare OS is an architecture of distrust」（2026-08-05，读源码 line 617 后的原创解读）。它把 cf-os 散落的 Gatekeeper/沙箱/模拟/observer 机制统一抽象为**一个更高的组织原则：以不信任为系统设计基石**。🟡 lord.technology（本次走查最高价值第三方视角）

cf-os 的整套设计哲学可以用一句话概括：**「kernel refuses to understand identity」（内核拒绝理解身份）。Authority is decentralised on purpose. The centre is built to know as little as it can.**——内核故意知道得越少越好，权限故意分散。

**四个「不信任动作」贯穿全系统**：

1. **不信任 agent 代码**：Gadget 代码跑在 null-origin iframe + Dynamic Worker Facet 双层沙箱，fetch 默认全禁 + CSP `default-src 'none'`，能力靠 introduction 显式授予。代码再烂也只烂在自己沙箱里，不跨用户泄漏。
2. **不信任 agent 持 key**：credential 永不给 agent——agent 拿到的是 Gatekeeper 的 capability（命名 binding），不是真 token；写操作经 submitAction 进 ApprovalQueue 不立即执行，Gatekeeper 本地模拟出结果让 agent 以为成功，真正的副作用发生在用户批量审批后。这是「optimistic concurrency for actions in the real world」（现实世界动作的乐观并发）——「The human is the commit」。
3. **不信任 agent 提交**：agent 改 code/造 Gadget 全是 provisional ChangeBatch 挂 chat 分支，UI 出 Pending changes 横幅，用户 Accept 才 mergeChanges 提升主线。哪怕 agent 已经写完代码，也只算「提议」，不算「提交」。
4. **不信任 agent 输出**：observation taint tracking（DIFC 信息流控制的现代复活）——Gadget 被分享给协作者成 observer 时，`addObserver` 必校验该用户能看到这 Gadget 至今读过的所有数据，不能则抛异常。agent 读过的数据被「标脏」追踪，输出不得越过观察者的可见边界。甚至 CONTRIBUTING.md 限 PR 长度——**把对 agent 的不信任推广到对人类贡献者的不信任**。

**安全断言的精确边界**（社区校准 + lord.technology 精确承认）：cf-os 反复宣称「AI cannot introduce a significant security bug」，社区戳穿「famous last words」。但 lord.technology 给了精确校准：**「He's right, in the sense that matters — a gadget can't leak to another user however badly it's written, because there is no other user in its sandbox to leak to.」** 即 cf-os 的「安全」被收窄到**「跨用户泄漏」**层（per-gadget 沙箱确实防住），对**「agent 越权做坏事」**（在沙箱内干用户不想要的动作）和**「运行时逃逸」**（V8/workerd bug → sandbox escape）**不成立**。`nolist_policy` 引 workerd 官方警告「not a hardened sandbox」：应用层逻辑 bug 被跨用户沙箱防住，但 V8/workerd 运行时逃逸不防（`nullpoint420`「If an agent finds a bug in V8 it's over」→ 选 MicroVMs 阵营）。

**对 OPC 的启示（信任光谱）**：cf-os 处于「完全不信任 agent」的光谱极端——agent 是危险物，设计成它的错误无影响、它的动作需人 commit、它的输出被 taint 追踪。OPC 的「agent 团队圆桌协作」是**反向假设**——agent 是可协作的同事，有限信任 + 审批。我们的编排层要显式定位自己在信任光谱何处：
- cf-os 端：完全不信任 → 每动作审批 → agent 退化成需人 commit 的提案机（我们若照抄会扼杀 agent 自治）。
- OPC 端：有限信任 → verification gate（builder≠verifier 多 agent 互审，见 Raft）+ 关键按钮人来按 → agent 有自治空间但产出被多方校验。
- **PRD 待回答**：OPC 落在光谱何处是核心决策——不是「抄不抄 cf-os 安全模型」，是「给 agent 多大自治权换多大安全」。cf-os 是「安全压倒自治」的极端样本，OPC 倾向「自治为主 + 审批兜底」但需明确边界。cf-os 的「不信任架构」是重要对照，不是我们要照搬的范式。

## 5. 派活与编排交互

- **派活 = 一个员工对自己的 Agent 说一句话**。无跨 agent 任务下发/委派/看板/角色抽象。Agent 是 workspace 内单一执行者，非可被「派任务」的角色。（✅ 架构 + ⚠️ 推断）
- **多 agent 协作 = 通过共享 workspace 间接**：多 agent（或同 agent 多 turn）读写同一 Yjs 文档、同一 chat 历史、同一组 Gadget/Gatekeeper/Binding/Hook，靠共享状态间接协作，无显式 agent-to-agent 消息协议。（✅ deepwiki「通过共享工作区间接」+ 🟡 §4.1）
- **编排 = 确定性 workflow + AI step + Scheduler/Hook**：后台跑确定性流程（非烧 token）嵌 AI 调用；Scheduler Gatekeeper 跑周期任务（every/calendarAt/runAt）；Hooks 让 Gatekeeper 事件反向触发 workspace 代码。这是「确定性流程 + 介入点 AI + 事件驱动」，不是「多 agent 组织化协作」。（🟡 4geeks + ✅ scheduler/hook）
- **agent 主动请求资源**：agent 需外部资源时 `requestConnection` 主动请求，chat 出 accept/deny 卡片——这是「agent 拉人介入」而非「人派 agent 任务」的反向流。（✅ connectionRequest）
- **没有的任务系统**：无 task/goal/assignment/kanban/squad/role 实体。这是它和 Paperclip/Multica/本仓库 PRD 的根本分野——它卖「员工 + AI 工具」，不卖「CEO + agent 团队」。（⚠️ PM 推断，强对照 §10）

## 6. 记忆与上下文

- **状态累积**：chat 消息（AiChatMessage 全类型）、Yjs 二进制更新（code 协同编辑历史）、actions 记录、bound hooks、activeAgents、outputs、协作者 edges，全落 DO SQLite。（✅ Overseer 存储）
- **CRDT 虚拟 FS 多端同编辑**：Yjs Y.Doc 存 Gadget 代码，客户端改→发 update→DO 应用→其他客户端同步；DO 存版本历史可重建任意版本；无冲突合并。（✅ Yjs）
- **长记忆 = CompactionCheckpoint**：85% input budget 触发，AI 摘要前段老消息替换为 summary，checkpoint 钉 `observedCodeVersion` + acceptedChanges + proposedChanges。下次注入 summary + 后段。（✅）
- **webFetch 结果入 chat 历史**：webFetch 输出存 chat 历史，回放时不重发 fetch——观察结果是状态的一部分。（✅）
- **agent 步骤是 chat log 的一部分**：tool calls / code changes / agent 响应 / observations / agentCallback 全进 AiChatMessage，续跑即回放。无独立「agent 记忆库」。（✅）
- **跨 workspace 不共享**：每 workspace 独立 DO，无 org 级聚合白板/记忆。跨 workspace 协作靠 Blueprint 分享模板，不靠共享状态。（⚠️ 推断，对照 Claude Tag §15.5 跨 channel 碎片化风险）

## 7. 审批与介入（重点：模拟让 agent 不卡）

**三套「草拟→拍板 / 拉人介入」语义**（⚠️ PM 提炼）：

### 7.1 ChangeBatch 提议/接受流（管 workspace 内部 code/资产）
1. agent 改 code/建 Gadget/add binding → 记 `ChangeBatch` type `"changes"`，`update` 是 Yjs 编码 code diff，`createdGadgets`/`addedBindings` 跟踪新建物。**全 provisional，挂该 chat 分支**，不动 mainline。（✅）
2. UI 出「Pending changes」横幅（`hasProposedChanges` true），有「Accept changes」/「Discard…」。（✅ ChatInterface）
3. Accept → `overseer.mergeChanges(chatId, mergeThrough)`：提升 provisional binding edge + 应用 code update 到 mainline + 记 `"merge"` 消息。（✅）
4. Discard → `overseer.revertChanges(revertFrom=0)`：删该范围 provisional Gadget + binding edge + 记 `"revert"` 消息；`discardChatDraftChanges` 丢 chat 草稿。（✅）
5. agent 感知用户改动：history 回放时用 synthetic observation 让 agent 知道用户的创建/binding/code 编辑。（✅）

### 7.2 Gatekeeper 模拟 + 批量审批（管 workspace 外部数据访问）
1. 所有有外部副作用的 action 必经 `submitAction()` 进 ApprovalQueue，不立即执行；读操作先 `authorizeObservation()`。（✅）
2. **Gatekeeper 本地模拟**：mutate 本地 cache 或 read 时 overlay pending action，**让 agent 以为成功**——agent 试着读回时拿模拟值，继续排队下一动作不卡。（✅ 模拟机制）
3. agent turn 跑完后用户**批量审批**：`approveAction(id)`/`rejectAction(id)` 逐个，或按 `autoApprovable` + `autoApproveTags`（gatekeeperId × actionKind）规则自动放行，`AutoApprovalDrainer` 排空。（✅）
4. 观察者校验：Gadget 被分享时协作者成 observer，`addObserver(id, verifier)` 必校验能看到这 Gadget 至今读过的所有数据，不能则抛异常；`GatekeeperUserVerifier` 只回传给同 vendor gatekeeper 保信任边界。（✅）

### 7.3 agent 主动拉人介入（requestConnection）
- agent 需外部资源时主动请求连 Gatekeeper，chat 出 accept/deny 卡片；accept→建 Gatekeeper 进 chat 环境 + 续跑 agent；deny→不续跑交用户定。（✅）

**PM 提炼**：ChangeBatch（内部资产）+ Gatekeeper（外部数据）+ requestConnection（拉人连资源）三套机制共同解决「agent 卡在等单个审批」痛点，核心都是「模拟让 agent 不停 + 用户事后批量批 / agent 主动请求人介入」。这正是 PRD §7「agent 不能自己标 done，必须你审批」的工程化蓝本。（⚠️ PM 提炼）

## 8. 执行与持久

- **执行**：Workers/workerd 跑 Kernel（Router/Overseer/UserManager），Gadget 跑 Dynamic Worker Facet（受限 Worker 变体，自带 SQLite），Gatekeeper 是独立 Worker。通信全走 Cap'n Web RPC。（✅ 架构）
- **持久分工**（已验证范式）：
  | 存什么 | 放哪 | 为什么 |
  |--------|------|--------|
  | workspace 状态（chat/Yjs/actions/agent/workpiece 注册表/hooks/outputs/协作者） | **DO 内嵌 SQLite**（Overseer） | 强一致 + 单点协调 + Hibernation WS 不收空闲费 |
  | 用户档案 + gadget/blueprint 索引 + shared gadget 缓存 + Outputs | **DO SQLite**（UserManager） | 同上，per-user 隔离 |
  | Blueprint 元数据 | **KV**（`BLUEPRINTS`） | 全局可寻址、低延迟读 |
  | Blueprint 内容（.gadget archive gzip Yjs 快照 + 截图） | **R2**（`BLUEPRINT_CONTENT`） | 大、不可变 |
  | 定时/keep-alive | **DO alarm** | 任意时刻单次、比 Cron 灵活、断线续命 |
- **不用 Workflows/Cron/Queues 原生 binding**，用 DO+alarm + Scheduler Gatekeeper 手搓调度——单 DO 做单点协调。（✅ + 本仓库 §11.2 印证）
- **Hibernation**：空闲 DO 不收 WS 费用，agent 跑时才唤醒。（✅ CF 平台）

## 9. 商业模式与定位

- **平台绑定**：深度绑 Cloudflare——Workers/Dynamic Workers/DO/Access/AI Gateway/R2/KV 全用，迁出难。但也支持自托管 workerd + Ollama（不绑 CF 账号）。（✅+🟡）
  - ⚠️ **社区校准（见 community 走查）**：vendor lock-in 是社区**最大采用阻力**（~30% HN 评论）。`hobofan`「open source but tied to platform, no portability」/ `tekacs`「'open source' de facto 意义小 when entirely contingent on Cloudflare's PaaS」/ `csomar`「'$2m 跑不起来 = marketing term'」/ `echelon`「far too Cloudflare flavored to build on」。Kenton 反复强调 workerd 可自托管 + Ollama 本地更快，但**承认 launch 前没来得及写 workerd 生产部署示例配置**（「didn't have time to put together example configs... out of my hands」）。**对 agents-remote 的启示**：我们本地 server 优先（PROJECTS_ROOT 本地目录）天然规避此担忧——这是显式差异化卖点。
  - ⚠️ **Kenton 战略地位**：自述「Workers is my startup-within-Cloudflare. It won't make me a billionaire, but... The CEO and CTO listen to me. E.g. I made my argument this all needed to be open source and self hostable, and they agreed.」——cf-os 是 CF 内部高自主权项目，开源是 Kenton 个人推动、CEO/CTO 批准的，战略稳定性高，非边缘实验。
- **面向谁**：企业 IT / 中大型组织（「给每个员工安全配 AI 工具」），非个人开发者/OPC 单兵。官方公告强调 Presidio/Happy Cog 合作实施，B2B 企业 SaaS 卖法。（✅ 官方）
- **开源 + 后续托管**：Apache 2.0 开源 + 即将上线 managed deployment + 合作伙伴实施，开源引流→托管变现路径。（✅ 官方）
- **CF 自己 dogfooding**：内部 4 个月（review agent 25 万 flag/1.6 万 block，非工程师 4000+ Gadget）——既是背书也是定位证据：**面向组织级 IT 化 AI 工具铺开**，非个人编排。（🟡 YouTube/4geeks）
  - ⚠️ **社区校准（Sam Rhea 官方博客自曝打折，见 community 走查）**：这些数字**可信但应打折扣引用**。① 4000+ Gadget 含「flood of vibe coded apps looking for a problem to solve」——Sam Rhea 自认是早期「给非工程师同样工具 + 友好 UI」误策略的产物，**「造了」非「有用造了」**。② 早期非工程支持靠「magic AI email bot」人工 staff，「It was miserable」——内部 AI 落地一开始是人力堆的，不是平台自动化成果。③ 销售团队「省 1 万小时」是 **「estimate」（自估）非独立审计**。④ 25 万 flag / 1.6 万 block 是 review agent 跑 4 个月的累计计数，规模可信（CF 是大公司，4 个月 PR 量大）但「flagged potential problems」质量未独立验证（可能大量误报）。社区没质疑造假，是把 dogfooding 数字当软背书（「CF 自己用了 4 个月没崩」）非硬承诺。
- **对标**：不是 Claude Code/Cursor（开发者工具），不是 Claude Tag（Slack 多人单 agent），而是「企业版 ChatGPT + 内部应用平台 + 零信任安全」三合一。（⚠️ PM 推断）

## 10. 对 OPC 多 agent 编排的启示

对照本仓库 PRD（`../design/multi-agent-prd.md`）的「角色/任务/房间/看板/记忆」+ `multi-agent-orchestration.md` §14 的编排骨架。

### 印证（方向正确）
1. **状态焊在稳定锚点，不焊 agent**：cf-os 焊 workspace，PRD 焊「房间 + 看板 + goal」实体（workspace 等价物）。印证「agent 是临时执行者、状态在它之上」是成熟范式（Buzz/Paperclip/cf-os/Claude Tag 四独立收敛，§13.0 + §15.2）。
2. **模拟 + 批量审批**直击 PRD §7「agent 不能自己标 done，必须你审批」痛点——cf-os 的「模拟让 agent 不卡 + 用户批量批」就是 PRD 审批闭环的工程化蓝本。我们的 `permissionMode=plan` + `can_use_tool` 卡片已是同源（§11.2），应升级到「批量审批 + 模拟续跑」。cf-os 还示范了第三种介入：agent 主动 `requestConnection` 拉人连资源——这对 OPC「agent 遇阻主动求助 CEO」是可借鉴模式。
3. **CompactionCheckpoint 85% + 钉白板版本**：印证 PRD「长记忆」后置项的成熟做法——本仓库已有 `compact_boundary` windowing（§13.3 L3 大部分免费），cf-os 补的是「白板/版本快照钉进 checkpoint」这个细节。
4. **DO + alarm 单点协调 + 持久分工**：印证本仓库 §11.3 CF 迁移路径——状态用 DO SQLite 不用进程内存、模板用 KV+R2、定时用 alarm/Scheduler Gatekeeper。这正是「CF 留口子」设计依据。
5. **两阶段实例化**（先非 spawner binding 后 agent spawner 符号引用）：可移植为我们的「角色/工作流模板」实例化范式（§11.2 已记）。
6. **AgentSelfLoopback `self` + agentNudge**：长周期回调 + 未解 callback 系统提示续跑——这是 OPC「agent 异步任务完成后回调通知」的成熟机制，比我们朴素的 task 完成广播更精细。

### 挑战（cf-os 没做、我们偏要做）
1. **cf-os 没有「角色/任务/房间/看板」抽象**——它卖「员工 + 单 agent 工具」，我们 PRD 卖「CEO + agent 团队」。**根本定位分歧**：cf-os 的 agent 是「OS 里 ??? 的位置」单数工具，我们的 agent 是「组织成员」复数角色。直接抄它的状态模型可行，但它的编排语义对我们**几乎零复用**——它没有我们要的东西。
   - ✅ **此判断已从 ⚠️ PM 推断 升级为社区证据印证**（见 `pm-cloudflare-os-community.md` §7）：**331 条 HN 评论里几乎不出现「orchestration / multi-agent / 编排 / 多 agent 协作」这些词**——社区根本不拿编排标准衡量 cf-os，默认它是单 agent 工作台。唯一接近编排讨论的 `ashu1461` 把它算进「agentic orchestrators」一类但**立刻质疑 USP**（除计费模型外无独特编排价值）；`rvz` 定位为「AI startup killer」（统一工作台取代零散工具）而非编排器；lord.technology 深度博客也**完全没提编排**，把它定位为「architecture of distrust」（单 agent 安全哲学）。**331 评论无人讨论编排，是最强的「它不是编排产品」旁证。**
2. **状态焊 workspace vs 焊 bot 身份**的取舍对 OPC 的含义：
   - cf-os 选焊 workspace（员工视角，agent 是工具），因面向「给员工配 AI」。
   - OPC 是「一人管一个 agent 团队」——更接近「焊 bot 身份」或「焊角色」？PRD 现状是「角色 + 房间 + 看板」多锚点，**无单一 workspace = 单一员工**那种简洁锚。
   - **启示**：OPC 状态锚点应是「房间/看板」级共享状态（cf-os workspace 的多 agent 协作面），非「单 agent 实例」——这与 cf-os 一致；但 OPC 还需 cf-os 没有的「角色身份持久化」（角色 systemPrompt 跨任务/跨房间复用，PRD §10 角色注入），这是 cf-os 盲区。
3. **cf-os 多 agent 协作是「共享 workspace 间接」**，我们是「圆桌直接讨论 + 拆任务下发」（PRD §5 第二期）——更强结构、更高风险。cf-os 证明「共享状态间接协作」能跑，但没回答「多角色同台直接讨论」的循环防护/串行/发言预算问题（§13.4 已识别，Claude Tag §15.5.2 补）。

### 盲点（cf-os 不解决，我们得自己想）
1. **无跨 workspace/org 级聚合记忆**——OPC 多 project 多房间需考虑（§15.5.1 跨 channel 碎片化风险，Claude Tag 也有）。
2. **agent 无持久身份/角色**——cf-os 的 agent 一次性、无 systemPrompt 持久注入机制（靠 workspace 上下文而非角色，admin 的 Skills 是全局指令非角色）。我们 PRD 第一期就要角色注入（§10 `--append-system-prompt`），这是 cf-os 没碰的领域。
3. **无看板/任务依赖/事件唤醒**——cf-os 是 chat + workflow + hook/scheduler，没有 task board。我们 PRD 看板是 greenfield（§12.4），cf-os 不提供借鉴；但 cf-os 的 Hook（事件反向触发）+ Scheduler（周期/一次性）是「定时任务」PRD 后置项的成熟对照。
4. **企业 IT 定位 vs OPC 个人**——cf-os 的 Gatekeeper 三层（Vendor/User/Session）+ admin 治理（品牌/skills/gatekeeper mode/featured blueprint/注册控制/公告）是企业级权限+治理模型，对 OPC 单人私有部署**过重**。我们 `permissionMode=plan` + per-goal approvalPolicy 更轻、够用。

### 净结论（对 PRD 的影响）
- **抄**：状态焊稳定锚点 + 模拟批量审批 + requestConnection 式 agent 主动求助 + CompactionCheckpoint 钉白板版本 + 持久分工（DO SQLite/KV/R2/alarm）+ 两阶段模板实例化 + AgentSelfLoopback 长周期回调。
- **不抄**：Gatekeeper 三层企业权限（过重）、单数 agent 无角色（我们有角色）、chat-only 无看板（我们有）、admin 治理全套（OPC 不需要）。
- **不变 PRD 决策**：cf-os 印证 PRD 现有骨架（状态锚点 + 审批 + CF 留口子），不改变 §7 五个拍板点；强化「审批应升级到模拟+批量」「长记忆应钉白板版本」「定时任务可借 hook/scheduler 范式」「agent 遇阻主动求助 CEO 可借鉴 requestConnection」四个实现细节。

## 11. 证据分级与来源

### ✅ 源码 / README / 官方（高置信）
- 架构三层（kernel/workshop-backend / gadgets / gatekeepers）、Overseer DO per-workspace、存储 schema（ownerId/version/code/snapshots/gadgets/gatekeepers/actions/boundHooks/activeAgents/outputs）、agent 临时 + 回放 chat log 续跑、DO alarm 60s keep-alive + 重试 —— deepwiki #2/#4
- Overseer RPC 全集（getMetadata/subscribeToMetadata/subscribeToPresence/setTitle/setPinned/deleteSelf/subscribeToWorkpieces/createGadget/getGadget/subscribeToCode/updateCode/getGatekeeperById/newGatekeeper/newAiModelGatekeeper/newAgentSpawnerGatekeeper/listActions/approveAction/rejectAction/listHooks/enableHook/disableHook/deleteHook/newChat/sendChatMessage/stopAgent/retryAgent/setChatTitle/getChatHistory/mergeChanges/revertChanges/discardChatDraftChanges/addCollaborator/redeemShareKey/refreshAffectedCollaboratorListings/deliverAgentCallback）—— deepwiki #6/#7
- UserDO 全集（setOwnDisplayName/setAvatar/getAvatar/listGatekeeperVendors/connectAccount/subscribeConnectedAccounts/listCloudflareAccounts/selectCloudflareAccount/listGadgets/listBlueprints/updateBlueprint/deleteBlueprint/retryBlueprintPublish/recordSharedGadgetOpen/updateSharedGadgetRole/forgetSharedGadget/disconnectAccount/getCloudflareUsage）—— deepwiki #1/#7
- GadgetClient 全集（getUiBundle/connectToGadget/exportPdf/listBindings/getBinding/bind/bindWithSuggestedName/unbind/renameBinding/getBlueprintAnnotation/setBlueprintAnnotation/createBlueprint）—— deepwiki #6
- WorkpieceClient 全集（getId/getTitle/setTitle/remove）—— deepwiki #6
- AgentHooks 全集（getChatAgentContext/listGadgetInfo/resolveWorkpieceRoot/describeBinding/addGadgetBinding/prepareChatBindings/executeCodeMode/activeAgentCallbackCount/rejectAllAgentCallbacks/consumeCapturedActions/addChatMessages/emitChatStreamEvent/getChatModelData/recordAgentObservation/getChatAttachmentData/getWebFetchEnv/getInstanceInstructions/listConnectableVendors/listConnectableResources/requestConnection/consumeCapturedConnectionRequests/listAvailableBlueprints/describeStandardFormats/fetchBlueprint）—— deepwiki #6
- ChangeBatch 提议/接受流（provisional/mergeChanges/revertChanges/merge/revert 消息类型）+ ChatInterface（handleSend/handleStop/handleRetry/handleSaveChatTitle/hasProposedChanges/Accept/Discard/ToolGroupRow/CreatedGadgetChatCard）—— deepwiki #3/#4
- Gatekeeper 三层（Vendor/User/Session）+ autoApprovable/autoApproveTags/AutoApprovalDrainer + submitAction/ApprovalQueue + 模拟（mutate cache / overlay read）+ observer verifier + auto-provisioning + ambient mode —— deepwiki #3/#7
- Gadget 沙箱（Dynamic Worker Facet + null-origin iframe + sandbox attr + CSP + fetch 默认禁 + Cap'n Web env RPC stub + introduction 能力模型 + client.js/server.js + Gadget DO class 导出契约 + window.open 禁 + console 转发 + PDF 导出）—— deepwiki #3
- Blueprint（KV `BLUEPRINTS` BlueprintKvRecord + R2 `BLUEPRINT_CONTENT` .gadget gzip Yjs 快照 + screenshots/ + 三 binding 类型 + 两阶段实例化 + agentSpawner 配置 displayName/modelId/env/props + 版本化 + 下载 + 更新 + 删 + 重发发布 + 置顶 + 库移除 + promoted/featured + New... 菜单）—— deepwiki #3/#6
- Yjs CRDT 虚拟 FS 多端同编辑 + 版本历史重建 + subscribeToCode + CompactionCheckpoint 85% + observedCodeVersion/acceptedChanges/proposedChanges + compactedTo —— deepwiki #4
- AI 模型配置（list/select/add/delete/quick/preferred/AI Gateway/BYOK/ENABLE_CLOUDFLARE_LIMITS 预算限流/getCloudflareUsage）—— deepwiki #7
- 共享协作（build/use 角色 + email 加 + share link 128-bit key + HMAC-SHA-256 + redeemShareKey + recordSharedGadgetOpen + updateSharedGadgetRole presentation-only + forgetSharedGadget + refreshAffectedCollaboratorListings + 首页展示 + Outputs 索引）—— deepwiki #5
- Hooks（boundHooks/nextHookId/enableHook/disableHook/deleteHook/GatekeeperHookLoopback）+ Scheduler Gatekeeper（ScheduleSession every/calendarAt/runAt + ctx.restore 持久回调 + ambient）—— deepwiki #7/#8
- AgentSelfLoopback（self magic object + agentCallback + deliverAgentCallback + PARAMS_N.resolve/reject + agentNudge + 停滞 callback 拒）+ executeCode + createGadget + webFetch（GET only / 无凭证 / 文档→Markdown / SSRF 防护 / 输出存 chat 历史）+ requestConnection（accept/deny 卡片 + acceptConnectionRequest/denyConnectionRequest）—— deepwiki #7/#8
- Admin（site name/logo/accent color + Skills 指令替换 + gatekeeper enable/disable + gatekeeper mode + featured blueprint + promoted formats New... 菜单 + 注册控制 + 公告横幅）—— deepwiki #7
- 官方公告（Zero Trust / Gatekeeper / 开源 / managed 即将 / Apache 2.0 / CF Access env CF_ACCESS_AUD/CF_ACCESS_ISS）—— cloudflare.com press release
- 痛点（SaaS 安全 bug / 不能改 / agent API key 危险 / 传统 harness 全量 ambient 访问 / 同步人审卡住 / 个人开发者维护在线服务累 / 企业 agent 部署没护栏 / 通用 coding agent 烧 token）—— deepwiki #8 + README

### 🟡 二手（媒体/blog/视频，中置信）
- 开源日期 2026-08-05 / Apache 2.0 / 作者 Kenton Varda = Sandstorm 作者 / 内部 4 个月数据（25 万 flag / 1.6 万 block / 4000+ Gadget）—— 4geeks / explainx / YouTube Prism Labs
- 三种部署路径（pnpm run-local / 部署自己 CF 账号 / managed）+ AI Gateway 路由 + 自托管 workerd + Ollama —— 4geeks / explainx / cio
- 确定性 workflow + scheduler Gatekeeper 周期任务 —— 4geeks
- OS 类比表（kernel/drivers/shell/processes/executables/users/ACLs/???=agents）—— README + slashdot/explainx 转述
- Hacker News 271 评论 + 「OS 命名是 buzzword」争议 —— explainx/slashdot
- 「Sandstorm + AI」自称 —— explainx

### ⚠️ PM 推断（低置信，本文件独家观点）
- 状态哲学一句话总结（§4 末）
- 「焊 workspace vs 焊 bot 身份」对 OPC 含义（§4/§10）
- cf-os 无编排语义对 OPC 零复用 + 盲点清单（§10）
- 根本场景主场景提炼 + 用户旅程组装（§A）
- Gatekeeper 三层 + admin 治理对 OPC 过重（§10 盲点 4）
- 「三套草拟→拍板语义同构」提炼（§7 PM 提炼）
- 「跨 workspace 不共享记忆」推断（§6）
- 「协作者展示态与授权分离」提炼（§4）

### 工具与方法
- deepwiki `ask_question` × 8（workspace 管理 / Gadget 沙箱 / Blueprint / chat&agent / sharing&collab / config&admin&observability / Overseer RPC 全集 / 痛点+hooks+scheduler+self-loopback+webFetch）
- tvly search × 1（8 条结果：4geeks/Facebook/YouTube/note.com/cloudflare press/cio/explainx/slashdot）
- 已有调研：`multi-agent-orchestration.md` §4.1（技术视角 cf-os）+ §11.2（cf-os 综合精华）+ §13（三件套对照）+ §15（Claude Tag 印证）
- PRD 对照：`../design/multi-agent-prd.md`（117 行，角色/任务/房间/看板 + 5 拍板点）
