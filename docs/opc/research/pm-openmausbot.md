# OpenMausBot 产品调研（PM 视角）

> 调研对象：[`milind-soni/OpenMausBot`](https://github.com/milind-soni/OpenMausBot)（MIT，TypeScript，**created 2026-08-11，两天龄**）。自我定位「开源版 Grok Bot」——本地优先、BYO agent CLI、bot 作联系人。本文件为用户补充的第 10 个参考产品调研，喂 PRD `../design/multi-agent-prd.md` 与讨论中枢 `../design/opc-product-discussion.md`。
> 证据分级贯穿全文：✅ 源码/README/官网/deepwiki/GitHub API 直证 ｜ 🟡 二手（社区/媒体）｜ ⚠️ PM 推断。
> 调研方法：deepwiki（源码级，8 轮 ask_question）+ GitHub REST API（star/fork/issue/contributor/commit/PR 一手硬数据）+ firecrawl（supamaus.com 商业模型全文，1 credit）+ HN Algolia（OpenMausBot/MausBot/supamaus 三 query 全零）。**项目创建仅两天，社区信号近乎为零是正常的早期状态**，本调研重点放在源码/README/官网一手信息。
> **本文件价值**：第 9 节**品类裁决**（它是单品爆款还是轻编排平台？关键证据：bots 之间能不能协作）、与 agents-remote 的**技术栈重叠盘点**（可借鉴的工程实现）。

---

## 1. 一句话定位

**把 Grok Bot 的「bot 作联系人 + 每人一台电脑 + 审批卡片」整套体验，开源、本地优先、用你已有的 claude/codex/grok CLI 重新做一遍——一个跑在 127.0.0.1 的 harness server 持所有 agent 进程，每个 bot 是 sidebar 里一个独立的「数字联系人」，各自带 personality/model/computer/apps。** ✅

- 作者：**Milind Soni**（GitHub `milind-soni`，2018 注册，59 followers，143 repos，个人开发者；同账号下另一主力项目 `tiptour-macos` 430 stars 是 Swift 写的 macOS pointer 工具——与 OpenMausBot 的 Electron 形态分属不同技术栈）。✅
- 母品牌：**SupaMaus**（supamaus.com，已有商业产品线「AI product tours / AI cursor / in-app guidance」+ Chrome extension），OpenMausBot 是 SupaMaus 产品矩阵里**免费开源的新成员**，Pro/Enterprise 走付费。✅
- 形态：macOS 桌面 app（Apple silicon，signed & notarized .dmg）+ 嵌入式 harness server（Node，127.0.0.1:8799）+ React SPA（5199）。Windows/Linux **未做**（22 个 issue 里 6 个是 Windows port PR，作者明说「harness itself is portable Node，但 shell 未尝试」）。✅
- 心智：README 原文「**Your own team of AI bots, in a chat app.**」+「**An open-source version of Grok Bot**——bring-your-own-agent, local-first, on the models you already have」。✅

> ⚠️ **作者显眼防骗声明**：README 顶部红字「**No affiliation with any cryptocurrency. OpenMausBot has no token.** Any coin using the OpenMausBot/Maus/SupaMaus name is not created, endorsed, or affiliated」。两天龄项目已主动撇清 token 骗局——这是 2026 年 AI 开源项目的**新型社区运营标配**（OpenClaw 谱系 hustler/grifter 污染教训在前，见 `pm-openclaw-hermes.md` §5.3）。✅

## A. 根本使用场景

> OpenMausBot 是为**「像用 iMessage/Telegram 一样管多个 AI agent，每个 agent 是一个有自己脑子、自己电脑、自己连接应用的联系人」**这个场景造的。不是为「编排一支 agent 团队协作干一个项目」（这是 Raft 的场景），而是为「一个用户同时养多个独立 specialist bot，各自独立干活」。

**主场景用户旅程**（基于 README + supamaus.com 官网 + deepwiki 源证，✅）：

1. **装 app**：下载 .dmg 拖进 Applications，打开。Harness server 嵌入式启动（127.0.0.1:8799），无外部 setup。
2. **首次配置**：App Settings 粘 API keys——`claude`/`codex` CLI 已装并登录的会被自动发现（PATH 扫描，登录 shell PATH 解析，PR #14 / commit `2026-08-12T09:57` 修过 GUI 启动的 PATH 探测），出现在 model picker 里；可选粘 Composio Connect key（`ck_…`）+ Composio API key（`ak_…`）+ Box token（box.ascii.dev）。
3. **造 bot**：sidebar 加一个联系人，给 name + title + description + 选 model（Claude/Codex 并排，带 provider rail，不可用的 provider 灰显原因）。每个 bot 拿到独立 `id` + `threadId` + `modelSelection` + 自己的 transcript 文件 `~/.openmausbot/messages-<threadId>.json`。
4. **像联系人一样派活**：在 bot 的对话窗里发消息，harness 用该 bot 的 `modelSelection` spawn 对应 CLI（`claude --resume <cursor>` / `codex thread/resume` / `grok` 走 xAI Chat Completions API SSE 流），流式回复 + 工具活动 chips + 实时 computer 预览。
5. **审批**：bot 想跑 shell / 改文件 / 跑 computer 动作 / 提问 → harness 的 permission broker 经 Unix socket 把 `ask` 消息推回前端，对话里出 Allow/Deny/answer 卡片。用户点，结果经 socket 回灌 agent，turn 继续。
6. **给它一台电脑**：Computer panel → cloud box（box.ascii.dev 自动 provision，每 bot 一台**独立** Linux 桌面，deterministic naming 保证同一 bot 永远拿到同一台，磁盘态持久）/ This Mac（cua-driver 走 Electron 桥，TCC 权限挂 app 名下）/ off。看 bot 实时操作 + 「Open desktop」浏览器接管。
7. **连接应用**：Composio Connect marketplace 一键 OAuth（Gmail/Slack/GitHub/Notion/Linear + 500 个），OAuth 一次，**所有 bot 共享**该连接（account-level，非 per-bot 隔离）。
8. **派活给别的 bot（新能力，PR #16，2026-08-12）**：在 composer 输入 `@` 弹 agent picker，选另一个 bot → 消息里插入 `@Name` → `startTurn` 解析 mention + system prompt nudge 告诉 agent「把 tagged bot 拉进来」→ agent 调 `ask_bot` MCP 工具（经 injected agents-proxy）→ harness 在被 tag bot 上起一个 depth-1 turn → 回复折回原 agent 的答案。**这是本项目唯一的多 agent 协作原语**，详见 §7。

**官方点名的差异化卖点**（README + 官网，✅）：① **真 agent 不是 wrapper**——每 bot 是完整的 Claude/Codex agent session，工具/文件/reasoning 全在；② **每 bot 一台电脑**——不像 Grok Bot 共享账户级 VM，OpenMausBot 每 bot 独立 box；③ **审批在 chat 里**——shell/edit/question 都成卡片；④ **500+ 连接应用**；⑤ **本地优先**——transcripts/keys/events 在 `~/.openmausbot`，harness 绑 127.0.0.1，credentials write-only（UI 只看 configured flag）。

## B. 解决的痛点（按具体症状列全）

没它之前，用户卡在（✅ README/官网直证 + ⚠️ PM 推断）：

1. **Grok Bot 闭源 + 信任问题** ✅——xAI/Musk 信任阈值高（246 HN 评论 ~30% 是不信任，见 `pm-grok-bot-community.md`），且数据走 Cursor 账号体系、不支持 Legacy Privacy Mode。OpenMausBot 用「开源 + 本地优先 + 127.0.0.1 + credentials write-only」对冲。
2. **Grok Bot 锁单一模型（Grok）** ✅——Grok Bot 不让你换模型、不让你挂技能、不让你配 MCP。OpenMausBot 用 BYO CLI（claude/codex/grok 三 driver + 开放 driver SPI，加一个 provider 是一个文件 + 一行注册）解此。
3. **OpenClaw/Hermes 太重、要自己接 IM** ✅——OpenClaw 要装 Gateway、自己接 Telegram/Discord、自己付模型 API（见 `pm-openclaw-hermes.md` §2.1）。OpenMausBot 把「IM 即工作面」做进桌面 app（sidebar = contact list），零 IM 集成成本。
4. **多 agent 没统一控制面** ✅——你装了 claude + codex + grok CLI，各自跑，没有统一窗口管。OpenMausBot 的 harness normalize 三家协议成单一 canonical event stream，sidebar 统一看。
5. **per-action 审批门槛太低** ✅——CLI 默认 `bypassPermissions` 或弹终端 prompt，桌面场景不友好。OpenMausBot 的 permission broker 把 shell/file/computer/question 全转成 chat 卡片。
6. **computer use 脆弱 + 黑盒** ✅——agent 跑电脑但你看不到点了什么。OpenMausBot 实时 screen preview + 审批卡片 + transcript 折叠 screenshot。
7. **连接应用每个 agent 各配一遍** ✅——你在 Claude 配一遍 Gmail、在 Codex 又配一遍。OpenMausBot 用 Composio Connect account-level 共享，OAuth 一次所有 bot 可用。
8. **bot 之间要人工传话** ✅——bot A 干完，要给 bot B 干，你得复制粘贴。OpenMausBot 的 `@mention` + `ask_bot` 让 bot A 直接委派 bot B（PR #16，新能力）。
9. **凭证进 transcript = 泄漏** ✅——密码塞 chat 里危险。OpenMausBot 用 write-only credentials（UI 只看 configured flag）+ Grok Bot 走的 secure handoff 同源思路。
10. **桌面 app 没有 dictation** ✅——Mac 用户想用嘴派活。OpenMausBot 嵌 macOS 原生 SFSpeechRecognizer（on-device，经 Electron 主进程桥）。

## C. Feature list（分维度，每条标 ✅/🟡/⚠️）

> 来源：README + supamaus.com 官网 + deepwiki 源码级 + commit/PR 历史。~75 条。

### C1. 用户入口与平台
1. **macOS 桌面 app**（Apple silicon，signed & notarized .dmg，一键下载）。✅
2. **嵌入式 harness server**（Node，127.0.0.1:8799，app 启动时拉起，relaunch race 重试 + 友好错误页，commit `2026-08-11T23:11`）。✅
3. **React SPA**（5199，dev 模式；prod build 也走同一 store/reducer）。✅
4. **Windows/Linux 未做**（22 issue 里 6 个 Windows port PR，#5/#7/#10/#11/#17，作者明说「harness 本身是 portable Node，shell 没尝试」）。✅
5. **CLI 自动发现**：扫 PATH + 解析登录 shell PATH（PR #14/#10，GUI 启动 PATH 探测），claude/codex/grok 装了就出现在 model picker。✅

### C2. Bot 管理类
6. **建 bot**：name + title + description + 选 model，分配独立 `id`/`threadId`/`modelSelection`。✅
7. **bot 作联系人**：sidebar = contact list，右键 pin/mark unread/edit profile/duplicate/copy conversation id/hide/delete。✅
8. **Duplicate bot**：复制 bot 配置（profile/model）。✅ ⚠️（未深查是否带 transcript——Grok Bot 不带，OpenMausBot 推断也不带，因 transcript 是 threadId 绑的）
9. **Delete bot**：删 bot 记录，但 transcript/computer 状态独立持久（推算，⚠️ 未源证细节）。
10. **persona = system prompt**：`You are ${bot.name}, a personal bot in OpenMausBot. Role: ${bot.title}. About: ${bot.description}`。✅
11. **每 bot 独立 model**：`modelSelection`（instanceId + model），不同 bot 跑不同 provider/model 同时。✅
12. **mid-conversation 切 model**：model picker 可在对话中切 bot 的 model。✅

### C3. 任务派发类
13. **自然语言派活**：在 bot 对话窗发消息，无 workflow builder、无表单。✅
14. **`@mention` 委派 bot**（PR #16，2026-08-12）：composer 输 `@` 弹 agent picker（mascot avatar + name + Agent chip，方向键导航，Enter/Tab 选中，Esc 取消，按输入过滤），插入 `@Name` → `startTurn` 解析 mention（word-start only，最长名优先避免「New Bot 2」半匹配「New Bot」，hidden bot 跳过，dedupe）+ system nudge 告诉 agent 用 `ask_bot` 把 tagged bot 拉进来。✅
15. **附件**（截图折叠进 transcript，⚠️ 文件附件细节未源证）。✅
16. **流式回复 + 工具活动 chips**：流式文字 + tool run 状态 chip 实时显示。✅
17. **工作中追加指令**（⚠️ 推断有，未源证；interruptTurn 在 adapter 接口里）。

### C4. 审批类（permission broker）
18. **per-action 审批卡片**：shell command / file edit / computer use action / agent 提问 → 对话里出 Allow/Deny/answer 卡片。✅
19. **permission broker 架构**：`server/drivers/claude.ts` 的 `createPermissionBroker` 起 Unix socket server 听 agent 的 permission 请求；`server/permission-proxy.ts` 是 agent CLI spawn 的 stdio 客户端，转发 `ask` 消息给 broker；broker emit `request.opened` event → 前端出卡；用户点 → `/api/bots/:id/respond` → broker `answer()` 写回 socket → permission-proxy 回灌 agent。✅
20. **permissionMode 三档**：`acceptEdits`（部分预批，其余仍审）/ `auto`（≈acceptEdits）/ `bypassPermissions`（broker 整个跳过）。Codex driver 另有 `fullAuto`（绕 permission 但保留 question）。✅
21. **ask_user 工具**：agent 主动用 `ask_user` MCP 工具问用户问题（带 choices），出 question 卡。✅
22. **云电脑 + 本地 Mac 同一套审批**：`ClaudeDriver.sendTurn` 配 `mcpServers`，cloud 走 box（`OGB_BOX_ID`/`OGB_BOX_TOKEN`），local 走 Electron `cua-driver`，两者都经同一 permission broker。✅
23. **没有 Auto Review 规则化预审**（⚠️ 与 Grok Bot 的 Require/Allow 规则引擎对比，OpenMausBot 没有——是 per-action 朴素审批，无规则化批处理）。

### C5. 记忆与上下文类
24. **bot transcript 持久**：每 thread 一个 JSONL `~/.openmausbot/messages-<threadId>.json`，`Store` 类 append/patch。✅
25. **per-turn transcript replay**：新 turn 取最近 40 条 text message 作 `SendTurnInput.transcript` 喂模型。✅
26. **resumeCursor 跨 turn 续**：Claude 用 session ID（`--resume` flag），Codex 用 thread ID（`thread/resume`，失败回退 `thread/start`）。`BotRecord.resumeCursors` 存。✅
27. **没有独立 memory/knowledge store**（⚠️ deepwiki 明确：「no separate memory/knowledge store like notes/facts/learned preferences distinct from chat history」——所谓「memory of its thread」就是 transcript replay，不是 Raft/OpenClaw 的 MEMORY.md，不是 Hermes 的 SQLite+FTS5）。⚠️ 这是**与 Grok Bot 的关键差距**：Grok Bot 的 bot 有稳定工作偏好 + 重要事实 + 过往 summary 的持久记忆，OpenMausBot 只有 transcript。
28. **没有 skill/routine 复用机制**（README 明说「routines are a placeholder」——UI 有 Create Routine 按钮，标 Coming soon，未接）。✅

### C6. 工具与电脑访问类
29. **per-bot 独立云电脑**：box.ascii.dev，deterministic naming 保证同一 bot 永远拿同一台，磁盘态跨 turn/重启持久，tmux session **不持久**，desktop URL 每次新 mint。✅
30. **provisionBox**：`server/box.ts` 找/建 bot 的 box + 等就绪 + idempotent bootstrap 脚本（装 cua-computer-server 等）。✅
31. **This Mac 模式**：bot 跑本地 Mac，Electron 主进程管 `cua-driver` Rust 二进制（mouse/keyboard/screen），TCC 权限挂 OpenMausBot app 名下（经 `CGRequestScreenCaptureAccess` helper + in-app `getDisplayMedia` capture 双路，commit `2026-08-11T23:20` / `2026-08-12T11:20` 因 macOS 15+ 不可修而 drop 了 screen-recording 预授权）。✅
32. **Computer MCP Proxy**：`server/computer-proxy.ts` 是 MCP server，暴露 screenshot/click/type_text/press_key/computer_exec 等工具给 agent，agent 调这些工具走 permission broker。✅
33. **实时 screen preview**：Computer panel 显示 bot 桌面实时画面 + 「Open desktop」浏览器接管。✅
34. **Sleep box**：cloud box 可手动 sleep 省资源。✅

### C7. 多 bot 协作类（关键辨析，详见 §7）
35. **`ask_bot` MCP 工具**（commit `2026-08-12T10:50` + PR #16）：agent 调 `ask_bot` 委派另一个 bot，harness 在被委派 bot 上起 depth-1 turn，回复折回原 agent 答案。✅
36. **agents-proxy MCP server**：注入每个 bot 的 agent 进程的 MCP server，暴露 `ask_bot` + `list_bots` 工具（`agents-proxy.test.ts` 验 MCP 契约：handshake/roster rendering/token auth/busy/depth-refusal rendering/arg validation）。✅
37. **busy 拒绝**：被委派 bot 已 busy 时 ask_bot 拒绝（防并发同 bot）。✅
38. **depth-1 限制**（⚠️ 推断）：PR #16 提「depth-1 turn」，被委派 bot 不能再 ask_bot 第三个（无递归链/无环图编排）。⚠️（depth 字段语义未完全源证，但「depth-1」字样说明有深度计数 + 上限）
39. **没有 group chat**（⚠️ deepwiki 源证「no group chat feature where multiple bots share one conversation thread」——只有 1:1 bot-to-bot 委派，没有 2+ bot 共享 thread）。✅
40. **没有共享 workspace/task board**（⚠️ deepwiki 源证「do not share a common workspace or task board」）。✅
41. **没有 chief-of-staff / builder-verifier / 任务状态机**（⚠️ deepwiki 源证无协调机制）。✅
42. **`@mention` 只是 UI 入口触发 ask_bot**（PR #16：`startTurn` 解析 mention + nudge，本质还是 1:1 委派）。✅

### C8. 集成 / 连接器类
43. **Composio Connect marketplace**：500+ app（Gmail/Slack/GitHub/Notion/Linear 等），一键 OAuth。✅
44. **account-level 共享**（⚠️ 与 Grok Bot 同病）：Composio key 在 `AppConfig`，所有 bot 共享——**不是 per-bot 隔离**，多 bot 用同一连接应用账号。✅
45. **OAuth 一次所有 bot 可用**。✅
46. **没有 BYO MCP**（⚠️ README/官网未提 MCP server URL 自配入口，与 Grok Bot 的 BYO MCP 对比是缺口；但 computer proxy / agents-proxy 内部已是 MCP 架构）。

### C9. 配置类
47. **App Settings 面板**：粘 Composio Connect key / Composio API key / Box token，本地持久，hot-reload（粘完 provider fleet 即时重载）。✅
48. **credentials write-only**：UI 只看「configured」flag，永不见真值。✅
49. **API key 引导改进中**（issue #19/#27 KesleyDavid 提的 UX 改进 PR）。✅
50. **profile = name + email**（commit `2026-08-12T11:20`：onboarding 问 name + email，sidebar 显示，去硬编码）。✅

### C10. 观察类
51. **流式 transcript**：tool activity / computer use / 审批请求 与普通消息并列。✅
52. **screenshot 折叠进 transcript**：bot 工作的截图进对话流。✅
53. **model picker provider rail**：Claude/Codex 并排，defaults 标，unavailable 灰显原因。✅
54. **token usage 更新**：`thread.token-usage.updated` event。✅
55. **mascot expression 状态机**：worried（上次 tool 失败）/ focused（busy）/ surprised（unread）/ thinking（等 options 卡）+ keyword heuristic 匹配 name/title/desc 给永久 personality + 手动 override + deadpan 兜底。✅

### C11. 桌面/原生类
56. **macOS dictation**：SFSpeechRecognizer on-device，经 Electron 主进程 `window.ogb.speechStart()`/`speechStop()` 桥。✅
57. **screen capture**：`desktopCapturer.getSources`，renderer 调 `window.ogb.screenFrame()`。✅
58. **CUA driver bridge**：Electron 主进程 spawn 管 `cua-driver` Rust 二进制，Unix socket 路径写 `<userData>/cua-connection.json`。✅
59. **dictation helper 退出清理**（PR #25 santhipakash：quit 时 stop helper 防孤儿）。✅
60. **quit hang 修复**（issue #15 / PR #24：`before-quit` 的 `stopCua()` 可能永不 resolve 致 hang，作者自报）。✅

### C12. 商业化/品牌类
61. **SupaMaus cursor mascot 内嵌**：OpenMausBot 里每 bot 一个 SupaMaus 鼠标吉祥物（procedural SVG，可换色 + 表情）——**这是 SupaMaus 母公司产品的品牌植入**（SupaMaus 主业是 AI product tour + AI cursor Chrome 扩展）。✅
62. **Pro 版 Coming soon**：cloud computers 一键开（不用粘 token）+ always-on（合盖/睡时 bot 继续跑 + 从手机可达）+ routines 真接（schedule）。✅
63. **Enterprise**：私有部署 + 共享 connectors + admin 控制。✅
64. **Book a demo**（cal.com 链接）+ Discord + 邮件（omkar@/milind.soni@supamaus.com 两个邮箱——作者 + 合作人 Omkar Satpute）。✅

## 2. 核心概念

| 概念 | 是什么 | PM 含义 |
|------|--------|---------|
| **Bot** | sidebar 里一个具名联系人（name+title+description+modelSelection+threadId+computer+resumeCursors） | 身份是产品语言一等公民，**但 memory 只是 transcript replay**，无独立记忆层 |
| **Harness server** | 跑 127.0.0.1:8799 的 Node 进程，**持所有 agent 进程** + normalize 协议 + 单 SSE 流 | 状态容器，本地优先的信任锚（与 agents-remote 的 Bun 服务端同构） |
| **Driver / ProviderInstance** | 每 provider 一个 driver（claude.ts/codex.ts/grok.ts/boxagent.ts），实现 `ProviderDriver` SPI，`create()` 返回 `ProviderInstance`（暴露 `ProviderAdapter`: sendTurn/interruptTurn/respondToRequest/hasSession/stopAll/onEvent） | **开放扩展点**——加 provider = 一文件 + 一行注册，与 agents-remote 的 ProviderProfile 同设计 |
| **RuntimeEvent** | canonical event union（session.started/exited、turn.started/completed、item.started/updated/completed、content.delta、request.opened/resolved、thread.token-usage.updated、runtime.error） | **协议 normalize 层**——三家协议（stream-JSON/JSON-RPC/ACP）统一到一套事件，是可借鉴的工程模式 |
| **EventBus + SSE** | fan-in 所有 ProviderInstance 的 RuntimeEvent 成一条 SSE 流（`/api/events`），前端单 reducer fold | **单流架构**，与 agents-remote 的 WebSocket 单流同源 |
| **Permission broker** | Unix socket server，agent 经 permission-proxy 转发 risky action 请求 → 卡片 → 用户点 → 回灌 | per-action 朴素审批（无 Auto Review 规则引擎），与 agents-remote 的 `permissionMode=plan` + `can_use_tool` 同构 |
| **Box** | box.ascii.dev 的云 Linux 桌面，per-bot 一台，deterministic naming 持久 | **每 bot 独立工作区**（与 Grok Bot 共享账户级 VM 相反） |
| **Composio Connect** | 500+ app 的 OAuth marketplace，account-level 共享 | 连接器生态，与 Grok Bot 7 内置 connector + BYO MCP 同类 |
| **ask_bot**（新） | MCP 工具，agent 委派另一 bot，harness 起被委派 bot 的 depth-1 turn，回复折回 | **唯一多 agent 协作原语**——P2P 1:1 委派，无共享 thread/task board |
| **agents-proxy**（新） | 注入每 bot agent 的 MCP server，暴露 ask_bot + list_bots | 多 agent 协作的协议层（MCP-based，非 IM channel） |
| **MausAvatar / mascot** | procedural SVG 吉祥物，10 表情状态机 | **品牌载体**（SupaMaus cursor mascot 内嵌）+ 状态可视化（worried/focused/surprised/thinking） |
| **resumeCursor** | session 续接 token（Claude session ID / Codex thread ID） | **per-turn spawn 的续接机制**——与 agents-remote 的 `--resume` + relay 双缓冲同源 |

## 3. 状态哲学（重点章节，深挖）

**状态焊在「bot 身份 + per-bot 独立资源」，不是焊在 session 也不是焊在共享 workspace——这决定它和 Grok Bot / Raft / OpenClaw 的品类关系。** ✅

### 3.1 三层持久化（拆解 README 的「bot has its own personality/memory/model/computer/apps」）

1. **Bot 身份持久**：BotRecord（id/threadId/name/title/description/modelSelection/computer/resumeCursors）存 `~/.openmausbot/bots.json`，跨任务/重启存活。✅
2. **per-bot transcript 持久**：`~/.openmausbot/messages-<threadId>.json` 每 thread 独立 JSONL，跨 turn/重启存活（最近 40 条 text 喂模型 + resumeCursor 续 session）。✅
3. **per-bot computer 持久**：每 bot 独立云 box，deterministic naming 保证同一 bot 拿同一台，磁盘态持久（tmux 不持久）。✅
4. **⚠️ memory 不是独立层**——所谓「memory of its thread」就是 transcript replay + resumeCursor，**没有 Raft/OpenClaw 的 MEMORY.md，没有 Hermes 的 SQLite+FTS5，没有 todos.dev 的三层 Charter/Memory/Skill**。这是 OpenMausBot 与这三个老师的**关键差距**：它的 bot 是「带 transcript 的联系人」，不是「带长效记忆的同事」。

### 3.2 与 Grok Bot 的对照（决定它在单品谱系的位置）

| 维度 | **Grok Bot** ✅ | **OpenMausBot** ✅ | 异同 |
|------|----------|----------|------|
| Bot 身份持久 | ✅ 持久具名（上限 50） | ✅ 持久具名（无明确上限） | 同：身份一等公民 |
| Bot 记忆 | ✅ 稳定偏好 + 事实 + 过往 summary（独立记忆层） | ❌ 只有 transcript replay（无独立 memory） | **Grok Bot 有真记忆，OpenMausBot 没有** |
| 共享云端电脑 | ✅ 账户级共享 VM，所有 Bot 共一台 | ❌ per-bot 独立 box（deterministic naming） | **哲学相反**：Grok Bot 共享责任大，OpenMausBot 隔离但每 bot 一台开销大 |
| 登录态共享 | ✅ Sign in once，所有 Bot 复用 | ❌ 每 bot 独立 box = 独立浏览器态 | OpenMausBot 没有共享登录态问题（但也没有共享便利） |
| Skill/Routine | ✅ 已做（演示学流程 → skill → schedule） | ❌ routines 是 placeholder（Coming soon） | Grok Bot 已做 OpenMausBot 后置的能力 |
| 群聊 | ✅ 2-6 Bot group chat 共享 thread | ❌ 无 group chat（只有 1:1 ask_bot 委派） | Grok Bot 有圆桌雏形，OpenMausBot 没有 |
| 集成生态 | 7 内置 connector + BYO MCP + Office add-ins | Composio Connect 500+（account-level 共享） | OpenMausBot 走第三方 marketplace 而非自建 connector |
| 审批 | per-action + Auto Review 规则 + secure handoff | per-action 朴素（无规则引擎/无 handoff） | Grok Bot 更深 |
| 信任模型 | 信任 xAI（数据走 Cursor 账号） | 本地优先（127.0.0.1 + credentials write-only） | **OpenMausBot 反向**：用「本地优先 + 开源」对冲信任问题 |
| 模型 | 锁 Grok | BYO claude/codex/grok + 开放 driver SPI | **OpenMausBot 反向**：不锁模型 |

**关键裁决**：OpenMausBot 在状态哲学上**比 Grok Bot 更接近「单 agent 各自聊」的多联系人 chat**——它甚至没有 Grok Bot 的独立记忆层和群聊。它的差异化全在「开源 + 本地优先 + BYO CLI」对冲 Grok Bot 的信任/锁定问题，**不在编排深度**。

### 3.3 与 agents-remote 的对照（PRD 角色/任务/房间/看板/记忆/agentmore）

| OpenMausBot | agents-remote PRD 对应 | 异同 |
|----------|----------------------|------|
| Bot（持久具名身份，model/computer 独立） | **角色**（AgentProfile） | 同：身份一等公民；异：OpenMausBot 身份绑 transcript+model+独立 box，PRD 角色绑 prompt+provider |
| per-bot 独立 box（云电脑） | 无直接对应（agents-remote 是 project-scoped 服务器） | **OpenMausBot 把「角色级独立工作区」做成一等公民**——agents-remote 当前是 per-session 文件/git/terminal，未升到「角色级独立电脑」 |
| transcript replay + resumeCursor（无独立 memory） | **记忆**（PRD 第一期） | **OpenMausBot 没做 PRD 想做的「长效记忆」**——它连 Grok Bot 都不如，是 OPC memory 设计的反向参考（连 transcript 都只取最近 40 条） |
| ask_bot 1:1 委派（无群聊/无 task board） | **房间**（圆桌，第二期）+ **看板**（任务状态机） | **OpenMausBot 几乎不碰协作层**——ask_bot 是 P2P 委派，不是共享 room，不是看板 |
| permission broker per-action（无规则引擎） | 审批闭环（PRD 第一期，per-action 复用 plan） | 同源：per-action 审批；OpenMausBot 没有规则化预审，agents-remote 也没做（可学 Grok Bot Auto Review） |
| harness server 持所有进程 + 单 SSE 流 | Bun 服务端 + WebSocket 单流 | **几乎同构**——可借鉴工程实现（见 §9.5） |

**关键启示**：OpenMausBot 与 agents-remote 在**控制面/执行层几乎同构**（harness server + per-turn spawn + --resume + 单流 + per-action 审批 + provider SPI），但 OpenMausBot **完全没有协作层**（无 room/task board/角色分工/长效记忆/verification gate）——它停在「多联系人 chat」，agents-remote 的 OPC 目标要走到「多 agent 编排团队」。两者是**同执行层、不同编排深度**。

## 4. 派活与编排交互

### 4.1 用户怎么下达工作

- **主路径 = bot 对话窗发消息**：纯自然语言，无 workflow builder、无表单。✅ 与 Grok Bot/Claude Tag/Raft/todos.dev 共性收敛（见 `../design/opc-product-discussion.md` §7 共性 ①）。
- **`@mention` 委派**（PR #16）：composer `@` 弹 picker → 选 bot → 插 `@Name` → system nudge 让 agent 用 ask_bot 拉进来。✅ 这是「聊天派活」的多 bot 扩展。
- **voice 派活**：macOS dictation（on-device），从 composer 麦克风说话转文字。✅
- **没有 task 概念**（⚠️ 没有状态机、没有 board、没有 subtask、没有 claim——这些都是 Raft/todos.dev/Paperclip 做的，OpenMausBot 没做）。

### 4.2 多 bot 怎么协作（关键辨析——它是编排吗？）

> 这是 §9.1 品类裁决的核心。deepwiki 在不同时间点给了两个看似矛盾的答案（早期索引说「无 bot 间通信」，最新 commit `2026-08-12T10:50` + PR #16 加了 ask_bot）。综合源码 + commit + PR body，裁决如下：

**OpenMausBot 的多 agent 协作 = `ask_bot` 单一原语，P2P 1:1 委派，depth-1 限制，无共享 thread**：

- **机制**（PR #16 body + commit `2026-08-12T10:50`/`11:00` 源证）：
  1. bot A 的 agent 跑 turn 时，被注入 agents-proxy MCP server（暴露 ask_bot + list_bots）。
  2. agent 调 `ask_bot({bot_id, message})` → agents-proxy 经 `/api/internal/ask-bot` 内部 HTTP（带 token auth，401 if 无）调 harness。
  3. harness 在 bot B 上起一个 **depth-1 turn**（bot B 拿自己的 transcript + modelSelection 独立跑）。
  4. bot B 的回复折回 bot A 的 ask_bot 工具调用结果，bot A 继续。
- **限制**（busy/depth-refusal）：
  - bot B 已 busy → ask_bot 拒绝（防同 bot 并发）。✅
  - depth-1（⚠️ PR body 字样，深度计数 + 上限——推断被委派 bot 不能再 ask_bot 第三个，无递归链，无环）。
- **没有**：
  - group chat（2+ bot 共享一个 thread）——deepwiki 源证无。✅
  - 共享 workspace/task board——deepwiki 源证无。✅
  - chief-of-staff / builder-verifier / 任务状态机 / verification gate——无。✅
  - `@mention` 本质只是 UI 触发 ask_bot（startTurn 解析 mention + nudge），不是共享 room。

**裁决**：OpenMausBot 的 `ask_bot` 是**「bot 间 RPC 委派」**——一个 bot 把另一个 bot 当工具调（带自己的上下文回复）。这跟 OpenClaw 的 `sessions_spawn`、Hermes 的 `SubagentLaunchRequest`、Grok Bot 的「Bot 互发异步消息」**同形**——都是「主 agent 把另一 agent 当工具/子例程调」，**不是「多个具名 agent 在共享 room 里长期协作」**（那是 Raft/Avernet/Paperclip 的编排）。

**对应我们的编排语义分类**（`../design/opc-product-discussion.md` §5）：
- OpenMausBot 的 ask_bot ≈ **agent 间通信媒介**维度里的「MCP 工具调用派」（与 Buzz ACP/Nostr、Avernet dumb router、Raft channel 同维度但形态最简）。
- 它**不在**任务状态机、多 agent 角色分工、层级 vs 圆桌、AX、verification gate、长记忆任何一个维度——这些编排子能力它都没碰。

### 4.3 派活的协议硬约束 vs AI 自觉

- **busy 拒绝**（防同 bot 并发）是协议级硬约束。✅
- **depth-1 上限**（防递归链）是协议级硬约束。⚠️（推断，PR body 字样佐证）
- **claim/task board 没做**（没多 agent 并行抢同一任务的场景，因为没 task 概念）。

**OPC 启示**：OpenMausBot 的 busy 拒绝 + depth 上限是**最小可用的多 agent 协作协议约束**——比 Raft claim 硬约束更朴素（只防同 bot 并发，不防多 bot 抢同 task）。OPC 若做轻编排，这是起点；若做深编排，要补 Raft claim + Avernet 状态机。

## 5. 记忆与上下文

- **transcript replay**：每 thread JSONL 持久，新 turn 取最近 40 条 text 喂模型。✅
- **resumeCursor 续 session**：Claude `--resume <session-id>` / Codex `thread/resume <thread-id>`（失败回退 thread/start）。✅
- **⚠️ 没有独立 memory 层**：deepwiki 明确「no separate memory/knowledge store like notes/facts/learned preferences」——README 说的「memory of its thread」就是 transcript，不是 Raft/OpenClaw 的 MEMORY.md，不是 Hermes 的 SQLite+FTS5，不是 todos.dev 的三层 Charter/Memory/Skill。
- **per-bot memory 不共享**（天然，因为根本没独立 memory 层，只有 transcript 各自一份）。✅
- **per-bot computer 独立**（deterministic naming，磁盘态跨 turn 持久）。✅
- **context 怎么喂 agent**：transcript（最近 40 条）+ resumeCursor 续 session + system prompt（persona + computer 提示 + mention nudge）+ 注入的 MCP servers（computer proxy / agents-proxy / composio）。

**OPC 启示**：OpenMausBot 是 **memory 维度的反面参考**——它停在「transcript 即记忆」，没做 OPC PRD 要的「长效记忆」（§4 角色记忆）。但它证明「transcript + resumeCursor」是**最小可用的 per-turn spawn 续接机制**（与 agents-remote 的 claude2 runtime 同源，可工程对照）。OPC memory 设计应明确**超越 transcript replay**（学 Raft MEMORY.md / OpenClaw Markdown 派 / todos.dev 三层 + bounded curation），不能停在 OpenMausBot 这个最小形态。

## 6. 审批与介入

- **per-action 朴素审批**（permission broker）：shell/file/computer/question → 卡片 Allow/Deny/answer。✅
- **架构**（`server/drivers/claude.ts` `createPermissionBroker` Unix socket server + `server/permission-proxy.ts` stdio client）：agent → permission-proxy → Unix socket → broker emit `request.opened` → 前端卡 → `/api/bots/:id/respond` → broker `answer()` → socket 回灌。✅
- **permissionMode 三档**：acceptEdits / auto / bypassPermissions（broker 跳过）。Codex 另有 fullAuto（绕 permission 保留 question）。✅
- **ask_user 工具**：agent 主动问用户（带 choices），出 question 卡。✅
- **云电脑 + 本地 Mac 同一套审批**（ClaudeDriver.sendTurn 配 mcpServers，cloud box / local cua-driver 都走 broker）。✅
- **⚠️ 没有**：Auto Review 规则化预审（Grok Bot 有 Require/Allow 规则引擎）/ Secure handoff 接管输入（Grok Bot 有，OpenMausBot 没有）/ verification gate 多 agent 互审（Raft 有）/ 模拟批量审批（cf-os 有）。

**OPC 启示**：OpenMausBot 的 permission broker 与 agents-remote 的 `permissionMode=plan` + `can_use_tool` **几乎同构**（都是 per-action Unix-socket-ish 弹卡 + 回灌）。可借鉴的工程点：① broker 与 driver 解耦（一个 broker 服务多 driver，claude/codex 共用）；② permission-proxy 作 MCP 工具包装（agent 调 `approve`/`ask_user` 工具，broker 截获）——这是把「审批」做成 MCP tool 的干净抽象。OPC 审批层升级方向：补 Grok Bot Auto Review 规则引擎 + Raft verification gate 多 agent 互审 + secure handoff 接管档（见 `pm-grok-bot.md` §9 挑战）。

## 7. 执行与持久

### 7.1 per-turn spawn + resumeCursor（与 agents-remote claude2 同源）

- **CLI driver per-turn spawn**：Claude/Codex 每 turn spawn 新 CLI 进程，进程在 turn 结束时停。✅
- **resumeCursor 续 session**：Claude `--resume <session-id>` / Codex `thread/resume`。`BotRecord.resumeCursors` 存。✅
- **API driver transcript replay**：Grok 走 xAI Chat Completions API SSE 流，每 turn 重放全 transcript。✅
- **Box agent driver 远端持久**：boxagent.ts 轮询 Box API，agent 进程在远端 box 上（不本地 spawn）。✅
- **busy 重启清零**：`Store` init 时所有 bot `busy` 强制 reset false（无 turn 跨重启存活）。✅
- **active CLI 进程重启时被杀**（per-turn spawn 的天然结果）。✅

**OPC 启示**：OpenMausBot 的执行模型与 agents-remote 的 claude2 runtime **几乎同构**——都是 per-turn spawn + `--resume` + transcript 持久。**这印证 agents-remote 的工程方向对**（Buzz 走查也印证 per-turn spawn 是主流，`../design/opc-product-discussion.md` §7 共性 ②）。可直接对照借鉴的工程细节：resumeCursor 多 driver 抽象（Claude session ID / Codex thread ID / Grok 无 cursor 走 transcript replay，三类续接策略统一在 adapter 接口）。

### 7.2 harness server 持所有进程

- **127.0.0.1:8799** Node server，app 启动拉起，relaunch race 重试。✅
- **持所有 agent 进程**（per-turn spawn 的父进程）+ DriverRegistry（configs → live instances）+ EventBus（fan-in 所有 RuntimeEvent）。✅
- **HTTP API**：`/api/events`（SSE）/ `/api/bots`（GET list / POST create）/ `/api/bots/:id`（PATCH/DELETE）/ `/api/bots/:id/messages`（POST 起 turn）/ `/api/bots/:id/respond`（POST 审批响应）/ `/api/internal/ask-bot`（PR #16 新增，内部 bot 间委派，token auth）。✅

### 7.3 三进程模型

- **Electron shell**（`electron/`）：macOS 原生——dictation（SFSpeechRecognizer 经主进程桥 `window.ogb.speechStart/Stop`）/ screen capture（`desktopCapturer`，`window.ogb.screenFrame()`）/ CUA driver bridge（spawn 管 `cua-driver` Rust 二进制，Unix socket 路径写 `<userData>/cua-connection.json`，TCC 权限挂 app 名下）。✅
- **Harness server**（`server/`）：持所有 agent 进程 + normalize 协议 + 单 SSE 流。✅
- **React SPA**（`src/`）：**零自有 transport**，纯 HTTP + SSE 到 harness（`StoreProvider` 开 `EventSource` 到 `/api/events`，单 reducer fold）。✅

**OPC 启示**：三进程模型与 agents-remote 的「Bun 服务端 + React 前端」**几乎同构**（agents-remote 没桌面 shell，是 web/PWA）。可借鉴：① **前端零 transport**——所有状态经单 SSE/WebSocket 流 fold 进单 reducer（agents-remote 已是这个范式，OpenMausBot 印证）；② **driver SPI**（contracts.ts 定义 ProviderDriver 接口，加 provider = 一文件 + 一行注册）——agents-remote 的 ProviderProfile 同设计，可对照 OpenMausBot 的 contracts.ts 是否更简洁；③ **EventBus fan-in**——多 provider 事件归一到 canonical RuntimeEvent union，是协议 normalize 的干净模式。

## 8. 商业模式与定位

### 8.1 SupaMaus 是什么——已有商业产品线 + OpenMausBot 是免费开源新成员

- **SupaMaus 母品牌**（supamaus.com）：已有商业产品线「AI product tours / AI cursor / in-app guidance / interactive product demos」+ Chrome extension（"supamaus — AI cursor for..."）+ Pricing 页 + Enterprise。✅ firecrawl 取官网全文。
- **OpenMausBot 定位**：SupaMaus 产品矩阵里**免费开源的新成员**（"Free and open source"），主页直标「Open source · runs on the agent CLIs you already have」。✅
- **品牌植入**：OpenMausBot 每 bot 一个 SupaMaus cursor mascot（procedural SVG 吉祥物，可换色 + 表情）——这是 SupaMaus 母公司 AI cursor 产品的**品牌载体**（PR #1 aivsomkar「Add customizable SupaMaus cursor mascots」是首个合入的 PR，commit `2026-08-11T20:43`，项目创建 2 小时后就植入）。✅
- **联系人**：Discord + 邮件 omkar@supamaus.com + milind.soni@supamaus.com（两个邮箱——作者 Milind Soni + 合伙人 Omkar Satpute，Twitter @BuildwithOmkarr）。✅

### 8.2 商业化路径（Free → Pro → Enterprise 三档）

- **Free**（开源 MIT）：本地 app + BYO CLI + 自付模型订阅。✅
- **Pro Coming soon**（waitlist）：cloud computers 一键开（不用粘 Box token）+ **always-on hosting**（合盖/睡时 bot 继续跑 + 从手机可达）+ routines 真接（schedule）。✅
- **Enterprise**：私有部署 + 共享 connectors + admin 控制 + 设上门。✅
- **Book a demo**（cal.com）+ Polar.sh 付费入口（footer "Download for Mac" 链 buy.polar.sh）。✅

**OPC 启示**：OpenMausBot 的商业化是**「开源免费拉新 + Pro 卖托管 + Enterprise 卖私有部署」三档**——这与 Raft（Free/Pro/Enterprise）、todos.dev（$19/team flat）、Grok Bot（捆订阅）都不同，更接近 **OpenClaw/Hermes 谱系的「开源 + 托管」双轨**（OpenClaw 自托管免费 / 第三方 hosted 付费）。**agents-remote 若商业化可参考这条**：开源拉社区 + Pro 卖 always-on 托管（解决「合盖睡时 agent 继续跑」的真实痛点）+ Enterprise 卖私有部署。Pro 的核心卖点「always-on hosting」直接呼应 Grok Bot 走查的「always-on token 成本爆炸」痛点——OpenMausBot 把这个成本转嫁给付费托管层。

### 8.3 作者背景判断

- **Milind Soni**（GitHub milind-soni）：2018 注册，59 followers，143 repos（多数小项目），主力作品 `tiptour-macos`（430 stars，Swift macOS pointer 工具）+ OpenMausBot（504 stars，两天龄）+ `axstream`（17 stars，「streaming action language for computer-use agents」Python）+ `claude-pets`（10 stars）+ `mcpd`（2 stars，「One host for all your MCP servers」）。✅
- **项目关联信号**：`tiptour-macos`（macOS pointer）+ SupaMaus（AI cursor）+ `axstream`（computer-use action language）+ OpenMausBot（computer use agent）——**作者长期围绕「指针/光标 + computer use + agent」主题做项目**，OpenMausBot 是这条线的集大成。✅
- **commits 频率**（2 天 64 commits by milind-soni + 3 by aivsomkar + 1 each KesleyDavid/Stanjoai）+ **PR 活跃**（22 PR，外部贡献者 KesleyDavid/aivsomkar/santhipakash/tonytouch/Agwstin/muneeb-rahmani/AnicetNgrt/alianrock/Anmol2k5/everyai-com 多人提）：**两天内已形成小社区贡献流**——Windows port / Antigravity driver / hermes-os driver / AI Counsel driver 多个外部 PR。✅
- **早期信号判断**（⚠️ PM 推断）：
  - **正面**：作者有连续作品历史（tiptour-macos 430 stars 证明能交付）+ SupaMaus 已是商业实体（有 Polar.sh 收款 + cal.com demo + 多产品线）+ 两天 504 stars + 外部 PR 流（社区早期参与真实，非刷 star）+ 防骗声明（社区运营成熟）。
  - **风险**：作者 59 followers（影响力有限）+ 项目两天龄（长期可持续性未知）+ 主力语言 Swift 但本项目 TypeScript（技术栈跨度）+ 「开源版 Grok Bot」定位下 Grok 是 xAI 商标（README 已撇清但法律风险存）+ always-on Pro 还在 waitlist（核心商业化未验证）。
  - **总体**：**比 Avernet「社区真空」健康得多**（有真实外部 PR），但**比 Paperclip/Multica「社区能见度高」差一个数量级**（两天 500 stars vs Paperclip 77k）。属于「**早期活跃的个人项目 + 小社区参与 + 商业实体背书**」形态，值得持续观察但不是短期威胁。

## 9. 对 OPC 多 agent 编排的启示（重点节）

> 派活/记忆/审批/执行的源码细节已在 §4-§7 详述，本节聚焦品类裁决与 OPC 启示。
> 对照 `../design/opc-product-discussion.md` 三层模型 + §5 编排老师拼图 + §9 单品爆款 vs 编排平台分野 + PRD 角色/任务/房间/看板/记忆/agentmore 六概念。

### 9.1 品类裁决——单品爆款，不是编排平台

**OpenMausBot 属于 §9「单品爆款」品类，与 Grok Bot / OpenClaw / Hermes 同道**。关键证据（4 条，源码 + deepwiki + PR 源证）：

1. **无 group chat**——deepwiki 源证「no group chat feature where multiple bots share one conversation thread」。只有 1:1 ask_bot 委派，没有 2+ bot 共享 room。✅
2. **无共享 workspace/task board**——deepwiki 源证「do not share a common workspace or task board」。每 bot 独立 box + 独立 transcript，没有共享协作容器。✅
3. **ask_bot 是 P2P 1:1 委派 + depth-1 上限**——PR #16 body 明说「depth-1 turn」+ busy/depth-refusal。是「主 agent 把另一 agent 当工具调」的工具增强（与 OpenClaw `sessions_spawn` / Hermes `SubagentLaunchRequest` / Grok Bot Bot 互发消息同形），**不是「多个具名 agent 长期协作」的编排**。✅
4. **memory 只有 transcript replay**——没有独立 memory 层（连 Grok Bot 的独立记忆层都没有），做不到「角色带长效记忆」。

**定位**：OpenMausBot 在 `../design/opc-product-discussion.md` §9 应**与 Grok Bot / OpenClaw / Hermes 并列「单品爆款」**——它是「开源版 Grok Bot」（作者自承），同赛道。**它不进 §5 编排老师拼图**（不是编排产品，没有编排子能力可学——ask_bot 是 P2P 委派的最简形态，Raft channel/Avernet dumb router/Buzz ACP 都是更好的编排老师）。

**它向编排方向的「半步」**（ask_bot，2026-08-12 才加）印证了 `../design/opc-product-discussion.md` §9 的演化规律——单品爆款想长出协作能力，自然路径是「主 agent 派子 agent」（OpenClaw sessions_spawn / Hermes SubagentLaunchRequest / Grok Bot Bot 互发消息 / OpenMausBot ask_bot 全是同形），但都停在「主+子」工具调用，没跨到「多 agent 共享 room」的编排。**OPC 的差异化机会正是跨这一步**：从「多联系人 chat」跨到「多 agent 编排团队」（room/task board/角色分工/verification gate/AX）。

### 9.2 印证了什么（已有方向被开源同类验证）

1. **per-turn spawn + --resume 是主流执行模型** ✅ 强印证——OpenMausBot 的 ClaudeDriver 用 `--resume <session-id>` + Codex `thread/resume`，与 agents-remote claude2 runtime 几乎同构。Buzz 走查（`../design/opc-product-discussion.md` §7 共性 ②）+ OpenMausBot 双重印证：per-turn spawn 是这个品类的工程默认。
2. **harness server + 单 SSE 流 + 前端零 transport** ✅ 强印证——OpenMausBot 的「harness 持所有进程 + EventBus fan-in 单 SSE + React 单 reducer fold」与 agents-remote 的「Bun 服务端 + WebSocket 单流」几乎同构。这是「本地优先 agent 控制面」的**事实标准架构**。
3. **permission broker per-action 朴素审批** ✅ 印证——OpenMausBot 与 agents-remote 的 `permissionMode=plan` + `can_use_tool` 同构（per-action 弹卡 + 回灌），是这个品类的审批默认。
4. **driver SPI 开放扩展** ✅ 印证——OpenMausBot 的 `server/contracts.ts` ProviderDriver 接口（加 provider = 一文件 + 一行注册）与 agents-remote 的 ProviderProfile 同设计。BYO CLI + 多 provider 是对冲 Grok Bot 锁单一模型痛点的正解。
5. **「bot 作联系人」UI 范式有市场** ✅ 印证——OpenMausBot 的 sidebar = contact list + 每.bot 对话窗，与 iMessage/Telegram 同构。Grok Bot 也是这套。这是「单品爆款」品类的 UI 共识（与 Raft 的 IM channel 范式同源但更轻）。
6. **本地优先 + 开源是对冲 SaaS 信任问题的正解** ✅ 印证——OpenMausBot 用「127.0.0.1 + credentials write-only + MIT 开源」直接对冲 Grok Bot 的 xAI 信任问题，与 OpenClaw/Hermes「own your data」同源（见 `pm-openclaw-hermes.md` §1.4）。
7. **「开源 + Pro 托管 + Enterprise 私有部署」商业化三档可参考** ✅——OpenMausBot 的 Free（开源）/ Pro（always-on 托管）/ Enterprise（私有部署）三档，是 OpenClaw/Hermes 谱系「开源 + 托管」双轨的产品化形态，agents-remote 商业化可参考。

### 9.3 挑战了什么（OpenMausBot 做了 agents-remote 没想的）

1. **⚠️ 「角色级独立电脑」是一等公民**——OpenMausBot 每 bot 一台独立云 box（deterministic naming + 磁盘态持久），这是 Grok Bot「共享账户级 VM」的反向解。agents-remote 当前是 project-scoped 服务器 + per-session 文件/git/terminal，**没有「角色级独立工作区」概念**。**启示**：PRD 角色应考虑绑「持久工作环境」（学 OpenMausBot per-bot box 或 Grok Bot 共享 VM，二选一）——这与 Grok Bot 走查 §9 挑战 1 同源（「共享持久工作环境是 agents-remote 盲点」）。OpenMausBot 给出了**第三条路**：per-bot 独立 box（隔离 + 每角色独立磁盘态），代价是每 bot 一台 box 的开销。
2. **⚠️ permission broker 作 MCP 工具包装（permission-proxy）**——OpenMausBot 把「审批」包装成 agent 调用的 MCP 工具（`approve` / `ask_user`），agent CLI spawn 时挂 permission-proxy 作 MCP server，agent 调工具时 proxy 截获 → broker → 卡片 → 回灌。这是把「审批」做成**MCP tool 而非 CLI flag**的干净抽象。**启示**：agents-remote 当前 `permissionMode=plan` 是 CLI flag 模式，可考虑升级到「审批作 MCP 工具」的抽象（更通用，跨 provider 统一）。
3. **⚠️ driver SPI 比 agents-remote ProviderProfile 更激进**——OpenMausBot 的 contracts.ts 把「normalize 协议」也做进 driver 职责（每 driver 把 stream-JSON/JSON-RPC/ACP 翻译成 canonical RuntimeEvent），agents-remote 的 claude2 runtime 是单一协议（stream-JSON）单一 adapter。**启示**：若 agents-remote 要支持多协议 provider（Codex JSON-RPC / Grok ACP / 第三方），OpenMausBot 的「driver 负责 normalize」是可借鉴架构（contracts.ts 的 ProviderDriver + ProviderInstance + ProviderAdapter 三层 + RuntimeEvent union）。

### 9.4 盲点（OpenMausBot 没做的，是 OPC 的差异化机会）

1. **完全没碰协作层** ✅——OpenMausBot 停在「多联系人 chat」，无 room/task board/角色分工/状态机/verification gate/AX/长效记忆。**这正是 OPC 的全部差异化**——OPC 要从「多联系人 chat」跨到「多 agent 编排团队」，OpenMausBot 没跨这一步（ask_bot 只是 P2P 委派的半步）。
2. **memory 只有 transcript replay** ✅——连 Grok Bot 的独立记忆层都没有。OPC memory 设计必须超越 transcript（学 Raft MEMORY.md / OpenClaw Markdown / todos.dev 三层 + bounded curation），这是结构性差异化。
3. **routines 是 placeholder** ✅——定时任务没接。OPC 应做（呼应 Grok Bot Routine / Raft reminder / todos.dev schedule）。
4. **Windows/Linux 没做** ✅——22 issue 里 6 个 Windows port PR 在排队。OPC 若先做好跨平台（agents-remote 是 web/PWA 天然跨平台），是切入点（同 Raft 盲点）。
5. **Mobile-first 不足** ✅——OpenMausBot 是 macOS 桌面 only（dictation/screen capture 都是 macOS 原生）。OPC 的 mobile-first（手机竖屏优先）是切入点（同 Raft 盲点）。
6. **没有 BYO MCP** ✅——OpenMausBot 内部用 MCP（computer-proxy/agents-proxy）但没暴露用户自配 MCP server URL 入口。OPC 的 MCP 集成（plugin-extension-system 调研）是差异化。
7. **connected apps account-level 共享 = accountability sink 风险** ⚠️——OpenMausBot 的 Composio Connect 是 account-level（所有 bot 共享 OAuth），与 Grok Bot「共享用户登录态」同病（虽然程度轻——Composio 是第三方中介而非用户主账号）。**OPC 应坚持每 agent 独立 identity + scoped 权限铁律**（`../design/opc-product-discussion.md` §4），不走 account-level 共享。

### 9.5 与 agents-remote 技术栈重叠的可借鉴点（核心节）

OpenMausBot 与 agents-remote 技术栈**重叠度极高**（都用 TypeScript/React/claude2-style per-turn spawn + --resume），是**最可直接借鉴工程实现**的参考产品。4 个可借鉴点：

| # | 可借鉴点 | OpenMausBot 实现 | agents-remote 对照 | 价值 |
|---|---------|----------|----------|------|
| 1 | **driver SPI + canonical RuntimeEvent union** | `server/contracts.ts` ProviderDriver/ProviderInstance/ProviderAdapter 三层 + RuntimeEvent union（session/turn/item/content/request/token-usage/error 7 类） | agents-remote claude2 runtime 是单协议单 adapter | 多协议 provider 接入时的 normalize 架构范本（若接 Codex JSON-RPC / Grok ACP） |
| 2 | **permission broker 作 MCP 工具** | permission-proxy 暴露 approve/ask_user MCP 工具，Unix socket 转发，agent 调工具时截获 → 卡片 → 回灌 | agents-remote `permissionMode=plan` CLI flag 模式 | 「审批作 MCP 工具」是更通用抽象，跨 provider 统一 |
| 3 | **agents-proxy = bot 间委派 MCP 注入** | 每 bot agent 进程注入 agents-proxy MCP server，暴露 ask_bot/list_bots，agent 调工具委派另一 bot | agents-remote 当前无 agent 间协作 | **最简可用的 agent 间协作原语**（带 busy/depth 上限防护）——OPC 若做轻编排，这是起点 |
| 4 | **resumeCursor 多 driver 抽象** | BotRecord.resumeCursors 统一存 Claude session ID / Codex thread ID / Grok 无 cursor 走 transcript replay | agents-remote claude2 用 claudeSessionId 单一 cursor | 多 provider 续接策略统一在 adapter 接口的工程范本 |

**⚠️ 注意**：借鉴时要**避开 OpenMausBot 的两个工程缺口**：① connected apps account-level 共享（accountability sink 风险，OPC 要 per-agent scoped）；② memory 只 transcript replay（OPC 要长效记忆层）。

### 9.6 「bot 作联系人」UI 范式 vs 「Agent Session detail」UI 范式

OpenMausBot（+ Grok Bot）的「bot 作联系人」UI 范式 vs agents-remote 的「Agent Session detail」UI 范式，哪个更适合 OPC？

| 维度 | 「bot 作联系人」（OpenMausBot/Grok Bot） | 「Agent Session detail」（agents-remote） |
|------|----------|----------|
| 状态焊点 | bot 身份（联系人 = 持久身份 + 自己的 thread + 自己的电脑） | session（每次启动一个 session，session 是工作单位） |
| 用户心智 | 「我有一个 AI 朋友 X，我随时找他」 | 「我启动了一个 agent 工作，看它进展」 |
| 多 bot 并行 | sidebar 多个联系人，各聊各的 | 多个 session 并行，各看各的 detail |
| 派活入口 | 联系人对话窗（像发微信） | session detail（像看终端日志 + 发指令） |
| 适合场景 | **长期关系型**（养一个 specialist bot 多次复用） | **任务型**（启动一个 agent 干一个具体活） |
| OPC 适配度 | ⚠️ 适合「同事层」（bot = 持久身份 + 长效记忆 + 多次复用） | ⚠️ 适合「项目层/任务层」（session = 一次执行单位） |

**裁决**（⚠️ PM 推断）：**OPC 三层模型应该两层 UI 共存**——
- **同事层**用「联系人范式」（bot 作持久身份，sidebar 列出，多次复用，长效记忆）——学 OpenMausBot/Grok Bot/Raft 的 IM 美学。
- **项目层/任务层**用「session detail 范式」（每次派活启动一个 session/turn，detail 看进展 + 审批）——学 agents-remote 现状 + Raft task thread。

两层关系：同事（持久身份）→ 派活启动 session（任务单位）→ session detail 看进展。这对应 Raft 的「agent（持久身份）+ task（message + 元数据）+ thread（任务细节）」三层，也对应 `../design/opc-product-discussion.md` §3 三层模型（同事/项目/协作）。OpenMausBot 只做了同事层（联系人），agents-remote 当前只做了项目层（session），**OPC 要两层都做并打通**。

### 9.7 per-turn spawn vs 常驻 CLI 取舍（呼应 Buzz 讨论）

OpenMausBot 与 agents-remote 都选 per-turn spawn（非常驻）：
- **优点**：进程隔离（turn 崩溃不影响其他）+ 资源按需（idle 不占进程）+ 状态外部化（transcript JSONL + resumeCursor 续）。
- **缺点**：每次 spawn 有启动开销 + transcript replay 成本（OpenMausBot 取最近 40 条，长了会截断丢上下文）+ resumeCursor 失效要回退（Codex thread/resume 失败回退 thread/start）。

**对比 Buzz**（Buzz 走查 §9.2）：Buzz 是 channel-history replay（per-turn spawn，回放爆炸），agents-remote/OpenMausBot 是 transcript + resumeCursor（per-turn spawn + session 续接，replay 成本可控）。两者都是 per-turn spawn，但续接策略不同。Grok Bot 是常驻云端 VM（非常驻的反例，always-on token 爆炸）。

**OPC 取舍**（`../design/opc-product-discussion.md` §7 共性 ② + §9 Grok Bot 反面教训）：per-turn spawn + resumeCursor 是正解（agents-remote + OpenMausBot 同选），Grok Bot 的常驻 VM 是 token 爆炸反例。OPC 应坚持 per-turn spawn + 持久 context compaction（呼应 todos.dev idle 10 分钟 sleep + Hermes serverless persistence）。

### 9.8 创建才两天 + 504 stars 的早期信号判断

- **作者可持续性**（⚠️ 推断）：Milind Soni 有连续作品历史（tiptour-macos 430 stars 证明交付能力）+ SupaMaus 已是商业实体（有 Polar.sh 收款 + cal.com + 多产品线）+ 长期围绕「指针/cursor/computer use/agent」主题。**比纯 hobby 项目可持续性高**（有商业实体背书 + 主业相关）。
- **社区早期参与真实**：两天 64 commits + 22 PR（外部贡献者 KesleyDavid 多 PR / aivsomkar vector motion / santhipakash 修复 / tonytouch hermes-os driver / Agwstin/muneeb-rahmani/AnicetNgrt Windows port 多人）+ 防骗声明（社区运营成熟）。**非刷 star**（外部 PR 质量真实）。
- **504 stars 两天**：与 Avernet（5 周 453 stars / watcher 2 倒挂）对比，OpenMausBot 两天 504 stars + 真实外部 PR 流，**社区健康度高于 Avernet**；但与 Paperclip（77k stars / 380 watchers）对比，**差两三个数量级**。属于「早期活跃小社区」形态。
- **风险**：两天龄（长期未知）+ 59 followers（影响力有限）+ TypeScript 跨作者主力 Swift + 「Grok」商标法律风险（已撇清但存）+ always-on Pro 未验证。
- **总体判断**：**值得持续观察但不是短期威胁**。它是「开源版 Grok Bot」赛道的早期参与者，与 OpenClaw/Hermes 同赛道但更年轻。若 SupaMaus 持续投入（商业实体 + 主业相关），有可能成为 Grok Bot 开源替代的小头部；若作者精力转移，可能停滞。对 OPC 而言：**技术栈重叠度高 = 工程借鉴价值高**（§9.5）；**编排深度浅 = 不构成编排竞品威胁**（§9.1）。

### 9.9 核心 3 点（PM 决策级）

1. **品类裁决：OpenMausBot 是「单品爆款」，不是编排平台**——它是「开源版 Grok Bot」（作者自承），与 Grok Bot / OpenClaw / Hermes 同赛道。关键证据：无 group chat / 无共享 workspace / ask_bot 是 P2P 1:1 委派 + depth-1 上限 / memory 只有 transcript replay。它**不进 §5 编排老师拼图**，应在 §9 与 Grok Bot/OpenClaw/Hermes 并列「单品爆款」。它向编排方向迈了半步（ask_bot，2026-08-12 才加），印证「单品爆款想长协作」的自然演化路径，但停在「主+子」工具调用，没跨到「多 agent 共享 room」的编排——**OPC 的差异化机会正是跨这一步**。
2. **技术栈重叠度极高 = 最可直接借鉴工程实现的参考**——OpenMausBot 与 agents-remote 都用 TypeScript/React/per-turn spawn + --resume + harness server + 单流 + per-action 审批 + driver SPI。4 个可借鉴点（§9.5）：driver SPI + RuntimeEvent union（多协议 normalize）、permission broker 作 MCP 工具（跨 provider 统一审批）、agents-proxy（最简 agent 间委派原语）、resumeCursor 多 driver 抽象。但要避开两个工程缺口：connected apps account-level 共享（accountability sink）、memory 只 transcript（OPC 要长效记忆）。
3. **OPC 三层模型应两层 UI 共存**——「bot 作联系人」范式（OpenMausBot/Grok Bot）适合同事层（持久身份 + 长效记忆 + 多次复用），「Agent Session detail」范式（agents-remote）适合项目/任务层（session = 一次执行单位）。OpenMausBot 只做同事层，agents-remote 当前只做项目层，**OPC 要两层都做并打通**（同事 → 派活启动 session → detail 看进展），对应 Raft 的 agent + task + thread 三层。

## 10. 证据分级与来源

### ✅ 一手直证（源码 / README / 官网 / deepwiki / GitHub API）

1. **GitHub `milind-soni/OpenMausBot`**（REST API 直取，2026-08-13）— 504 stars / 2 subscribers / 88 forks / 22 open issues / TypeScript / MIT / created 2026-08-11T18:58:55Z / pushed 2026-08-12T17:00:39Z / homepage supamaus.com/products/openmausbot / owner milind-soni (id 46266943, 2018 注册, 59 followers, 143 repos, 个人 User) — https://github.com/milind-soni/OpenMausBot
2. **README 全文**（GitHub README API base64 解码）— 定位「Your own team of AI bots, in a chat app」「An open-source version of Grok Bot — bring-your-own-agent, local-first, on the models you already have」+ 防骗声明「No affiliation with any cryptocurrency. OpenMausBot has no token」+ 技术栈（TypeScript strict + React 19 + Electron macOS signed & notarized）+ 三进程模型 + harness 127.0.0.1:8799 + `~/.openmausbot` + Status「Early but real... Rough edges: routines are a placeholder, sidebar sections aren't built, Windows/Linux shells haven't been attempted」+ driver SPI `server/contracts.ts`「adding a provider is one file in server/drivers/ plus a one-line registration」— https://github.com/milind-soni/OpenMausBot/blob/main/README.md
3. **supamaus.com/products/openmausbot 全文**（firecrawl scrape，1 credit）— SupaMaus 母品牌是 AI product tours/AI cursor/in-app guidance 公司（已有 Chrome 扩展 + Pricing + Enterprise）；OpenMausBot 是「Free and open source」新成员；Pro Coming soon（cloud computers 一键开 + always-on hosting + routines）；Enterprise（私有部署 + 共享 connectors + admin）；Book a demo (cal.com) + Discord + 邮件 omkar@/milind.soni@supamaus.com；footer Polar.sh 付费入口 — https://supamaus.com/products/openmausbot
4. **commits 历史**（GitHub API，30 条）— milind-soni 64 commits + aivsommar 3 + KesleyDavid 1 + Stanjoai 1；关键 commit：`2026-08-12T11:00` PR #16「@mention tagging: tag a bot in the composer and it joins in via ask_bot」+ `2026-08-12T10:50`「Agent-to-agent comms: bots can message each other via ask_bot」+ `2026-08-12T11:02`「comms: only offer agents tools to drivers that mount them」+ `2026-08-12T10:37`「ACP drivers: generic acp/core + per-harness shims (grok, gemini)」+ `2026-08-12T09:57`「Find agent CLIs from GUI launches: augment PATH」+ `2026-08-11T20:43` PR #1「Add customizable SupaMaus cursor mascots」（项目创建 2 小时后植入品牌）+ `2026-08-12T07:50` PR #9 everyai-com「Add MIT license」+ `2026-08-11T23:11`「Never a black window: startup retry」
5. **PR #16 body**（GitHub API）—「@mention tagging UI + agent-comms test coverage」详述：composer @mention picker（mascot avatar + name + Agent chip + 方向键/Enter/Tab/Esc/过滤）；mentionedBots 解析（word-start only + 最长名优先 + hidden 跳过 + dedupe）+ system nudge；测试 agents-proxy.test.ts（MCP 契约：handshake/roster rendering/token auth/busy/depth-refusal rendering/arg validation）+ comms.test.ts（mentionedBots unit + POSIX e2e：bot A agent → injected agents proxy → /api/internal/ask-bot → bot B depth-1 turn → reply folded back into A's answer）— https://github.com/milind-soni/OpenMausBot/pull/16
6. **22 open issues**（GitHub API）— KesleyDavid 多 issue（#32 Ubuntu/#30 Antigravity/#29 Ubuntu/#28 gemini 默认/#27 API key/#26 Antigravity/#23 docs/#21/#20 reliability）+ santhipakash（#25 dictation helper/#24 CUA hang）+ tonytouch（#22 AI Counsel driver/#18 hermes-os driver）+ AnicetNgrt（#17 Windows）+ alianrock（#14 PATH）+ Agwstin/#7/#5/#11/#10 Windows port 多人 — **外部贡献者活跃，非自产自销**
7. **22 PRs**（GitHub API）— 6 已合（#16 mention/#13 vector motion/#9 MIT/#6 Grok Build CLI ACP/#2 app icon/#1 SupaMaus mascot）+ 16 open（多 Windows port + 多 driver）— https://github.com/milind-soni/OpenMausBot/pulls
8. **作者 repos**（GitHub API，top 15 by stars）— OpenMausBot 504 / tiptour-macos 430（Swift macOS pointer）/ writeback 18 / axstream 17（Python streaming action language for computer-use agents）/ claude-pets 10 / json-maps 7 / openmausbot-releases 2 / mcpd 2（One host for all your MCP servers）— **作者长期围绕「指针/cursor/computer use/agent」主题**
9. **languages**（GitHub API）— TypeScript 385929 / JavaScript 211770 / CSS 17108 / Swift 1765 / HTML 484（TypeScript 为主 + Swift 是 macOS 原生 helper）
10. **deepwiki 源码级验证（8 轮 ask_question）** — wiki 结构（11 章：Overview/Electron Shell/Harness Server/Provider Drivers/Computer Use/React Frontend/Onboarding/Integrations/Avatar & Mascot/Build/Glossary）+ ProviderDriver SPI（contracts.ts: driverKind/metadata/decodeConfig/defaultConfig/models/create）+ ProviderAdapter（sendTurn/interruptTurn/respondToRequest/hasSession/stopAll/onEvent）+ RuntimeEvent union（session.started/exited + turn.started/completed + item.started/updated/completed + content.delta + request.opened/resolved + thread.token-usage.updated + runtime.error）+ EventBus fan-in 单 SSE 流（/api/events）+ React SPA 零 transport（StoreProvider EventSource + 单 reducer fold）+ permission broker（createPermissionBroker Unix socket server in claude.ts + permission-proxy.ts stdio client + approve/ask_user MCP 工具 + permissionMode acceptEdits/auto/bypassPermissions + Codex fullAuto）+ per-turn spawn（ClaudeDriver --resume / Codex thread/resume + busy 重启清零）+ transcript replay（最近 40 条 + resumeCursor 续）+ per-bot 独立 box（box.ascii.dev deterministic naming + tmux 不持久 + provisionBox idempotent bootstrap）+ Composio account-level 共享 + persona = system prompt（name+title+description）+ mascot 10 表情状态机（worried/focused/surprised/thinking + keyword heuristic + deadpan）+ Electron 三能力（dictation SFSpeechRecognizer/screen capture desktopCapturer/CUA driver bridge cua-driver Rust）+ routines placeholder（Coming soon 未接）+ **无 group chat / 无共享 workspace/task board / 无独立 memory 层（深查明确「no separate memory/knowledge store like notes/facts/learned preferences」）** — https://deepwiki.com/milind-soni/OpenMausBot

### 🟡 二手（社区/媒体）— 本项目创建仅两天，社区信号近乎为零

11. **HN Algolia 三 query 全零**（OpenMausBot / MausBot / supamaus，tags=story + 全文，2026-08-13）— **零 HN 讨论**。这符合两天龄项目的预期（项目 created 2026-08-11，调研日 2026-08-13），不是产品质量信号。同 `pm-raft.md` §12.1 早期产品 HN 冷清判定逻辑。
12. **SupaMaus 母公司其他产品**（firecrawl 官网 footer）— Chrome 扩展「supamaus — AI cursor for...」+ Pricing 页 + Enterprise 页 + AxStream（axstream.dev，作者另一 repo）+ spatial context 博客 — 印证 SupaMaus 是已有商业实体的 AI 产品公司，OpenMausBot 是其新产品线。

### ⚠️ PM 推断（本文件独家，低置信）

13. 「OpenMausBot 是单品爆款不是编排平台」——基于 ask_bot 是 P2P 1:1 委派 + depth-1 上限 + 无 group chat/无共享 workspace/无独立 memory 层（源码 + deepwiki + PR body 综合裁决）。
14. 「ask_bot depth-1 上限 = 防递归链」（被委派 bot 不能再 ask_bot 第三个）——基于 PR #16 body「depth-1 turn」+ busy/depth-refusal 字样推断，深度计数 + 上限的具体实现未完全源证。
15. 「OpenMausBot memory 是这批参考里最朴素的（连 Grok Bot 独立记忆层都没有）」——基于 deepwiki 明确「no separate memory/knowledge store」+ README「memory of its thread」= transcript replay 的对照。
16. 「OPC 三层模型应两层 UI 共存（联系人范式 + session detail 范式）」——基于 OpenMausBot/Grok Bot 联系人范式 vs agents-remote session detail 范式的对照推断。
17. 「OpenMausBot 值得持续观察但不是短期威胁」——基于两天龄 + 504 stars + 59 followers 作者影响力 + SupaMaus 商业实体背书 + 技术栈重叠度高 + 编排深度浅的综合判断。
18. 「Duplicate bot 不带 transcript + Delete bot 不删 computer 状态」——基于 transcript 是 threadId 绑 + box 是 botId 绑的推断（未源证细节）。

### 工具与方法

- **GitHub REST API**（curl + python3 解析）：repo meta + contributors（4 人，milind-soni 主导 64 commits）+ commits 30 条 + issues 22 条 + PRs 22 条 + user profile + user repos + languages —— 关键数字一手验证
- **deepwiki `ask_question`**（8 轮）：架构三进程 / driver SPI + RuntimeEvent / permission broker / bot 生命周期 per-turn spawn / bot personality-memory 模型 / computer use 持久 / ask_bot 机制（索引滞后，靠 PR body 补）/ mascot 系统 —— 源码级验证（注：agents-proxy.ts 等最新 commit 文件 deepwiki 索引未及时更新，靠 PR #16 body 补证）
- **firecrawl scrape**（keyless 免费档，1 credit）：supamaus.com/products/openmausbot 全文（商业模型 + Pro/Enterprise + 品牌植入）
- **HN Algolia**（curl）：OpenMausBot / MausBot / supamaus 三 query 全零（确认两天龄社区真空是正常早期状态）
- 已读对照（任务前置）：`pm-grok-bot.md`（全 383 行，OpenMausBot 直接对标对象）+ `pm-openclaw-hermes.md`（全 232 行，同品类开源前身谱系）+ `pm-raft.md`（全 630 行，编排平台对照）+ `../design/opc-product-discussion.md`（全 253 行，PM 讨论中枢，只读不改）+ `../design/multi-agent-prd.md` 路径（PRD，只读不改）+ `index.md`（14 节框架结构）

---

> **PM 一句话总结**：OpenMausBot（`milind-soni/OpenMausBot`，MIT/TypeScript/两天龄/504 stars，作者 Milind Soni / SupaMaus 商业实体）是「**开源版 Grok Bot**」——本地优先、BYO claude/codex/grok CLI、bot 作联系人、per-bot 独立云电脑、per-action 审批卡片。它**属「单品爆款」品类**（与 Grok Bot/OpenClaw/Hermes 同道），**不是多 agent 编排平台**（无 group chat / 无共享 workspace / ask_bot 是 P2P 1:1 委派 + depth-1 上限 / memory 只有 transcript replay）。对 OPC 的核心价值三块：① **品类印证**——它向编排方向迈的半步（ask_bot）印证单品爆款想长协作的自然演化停在「主+子」工具调用，OPC 差异化在跨到「多 agent 共享 room」；② **工程借鉴**——技术栈与 agents-remote 重叠度极高（TS/React/per-turn spawn + --resume/harness server/单流/driver SPI），4 个可借鉴点（driver SPI + RuntimeEvent union / permission broker 作 MCP 工具 / agents-proxy 最简委派原语 / resumeCursor 多 driver 抽象）；③ **UI 范式启示**——「bot 作联系人」适合 OPC 同事层、「Agent Session detail」适合项目层，OPC 三层模型应两层 UI 共存。它**不进编排老师拼图**（无编排子能力可学），应在 `../design/opc-product-discussion.md` §9 与 Grok Bot/OpenClaw/Hermes 并列「单品爆款」。**社区信号近乎为零是正常的早期状态**（创建仅两天，HN 零讨论），值得持续观察但非短期威胁。
