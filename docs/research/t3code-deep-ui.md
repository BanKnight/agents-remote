# T3 Code 体验与 UI 深调研（deep-ui）

> 调研时间：2026-11-23。源码：~/repos/t3code（origin/main 2026-11-22）。上篇 `t3code.md` 讲功能与架构；本篇回答「T3 Code 为什么让用户觉得好」——**体验层的具体做法**。所有证据为本仓源码一手实证（文件:行）。

**一句话总起**：社区感受到的「打磨与流畅」不是氛围，是三件可指认的工程——① 性能被当作有测试/有 lint/有基准的正式工程面；② 滚动/折叠/流式这些「消息流基础动作」做到了不与用户抢方向盘的深度；③ 全链路的**状态语义纪律**（什么颜色表什么、什么在动表什么、什么沉默表什么）一以贯之。

---

## 1. 「快」怎么落实：性能是一门有基建的工程

**结论**：他们把性能从「feel」变成可测对象——基准测试套件、防帧率退化的自定义 lint 规则、协议级去重、解析级缓存、React Compiler 全量编译，五层叠加。

- **性能宣言进了工程约束**：AGENTS.md L15-19 专节 "Performance without compromise"（点名 WS 过载数据、CSS 动画 GPU 尖峰、列表难渲染三类回归源）；L210 "Our users drive agents all day and notice a dropped frame, a lying spinner, and a stale label. No continuously repainting animations"。这不是 README 姿态——配套了 oxlint 自定义规则（`oxlint-plugin-t3code`）：`no-frame-waits-in-browser-tests`、`no-wall-clock-in-tests`、`no-polling-loop-in-tests`（AGENTS.md L119-123）——**测试不得等帧、不得等真实时间**，倒逼断言写事件与计数。
- **基准测试随仓**：`apps/web/src/performance.bench.ts`（1000 线程排序、用量标签格式化）；`packages/client-runtime/src/remotePerformance.bench.ts`（"load remote snapshot with 100 messages"、"apply 200 message updates to 100/1000 loaded messages"）——**投影 reducer 逐事件应用的吞吐是有性能预算的**，流式 delta 打到 1000 条消息上的重放路径被持续测量。
- **两级 WS 订阅分片**【服务端】：`apps/server/src/ws.ts:1150` `subscribeOrchestrationV2Shell`（全局侧栏只订 shell 行：id/status/deletedAt 级别的轻投影）；`ws.ts:917` `subscribeOrchestrationV2Thread`（看某个线程才订该线程：有界快照 + 高水位后的增量事件重放）。看一个线程不付全部线程的历史，与我们「一个 `/stream` 全量」正好是两极。
- **协议级去重（wire dedup）**：`packages/shared/src/orchestrationV2DedupedBodies.ts:7-10`——服务端把「客户端记录里已有的 turn item body」（消息全文、checkpoint 文件、subagent prompt/result）**置空并打标记**，客户端从记录复制回填；只对完全相等的 body 置空，保证精确还原。流式重发同一段文本的带宽被结构性地省掉。
- **流式 markdown 三层渲染优化**（详见 §2）：按块切分只重渲末块（`ChatMarkdown.tsx:2052-2057`）→ 块级解析 LRU 缓存（`chat/markdownRenderer.ts:14-29`，注释直言 "Parsing is most of the cost of rendering markdown"，500k 字符预算、entry 记账含 200 字符树开销）→ **岛渲染**（`chat/markdownIslands.ts:171-175`：hast 树里只有需要 React 组件的元素（代码块/任务复选框/chip）走 React，其余子树序列化成静态 HTML `dangerouslySetInnerHTML`，浏览器自建 DOM，React 不逐节点 reconcile；渲染结果按签名 WeakMap 缓存）。
- **增量时间线投影**：`apps/web/src/hooks/useIncrementalTimelineEntries.ts:34-43`——输入引用逐一比较，未变直接复用上次 projection（含输入快照的 state 化增量派生，非每次全量重导）。
- **乐观更新 + blob 预览移交**：`apps/web/src/components/chat/optimisticUserMessages.ts:9-14`——发送即上屏，服务器 ack 后**当帧**从乐观列表移除（"never reappears even if the server later drops its row"）；本地图预览 blob URL 在服务器副本加载前继续顶位（`handoff`，:33-49），不闪黑框。
- **React Compiler 全量**：`apps/web/src/reactCompilerCoverage.test.ts` 把 web src 每个 .ts/.tsx 用 `oxc-transform-react` 的 reactCompiler 编译并断言无诊断——**自动 memo 化是全仓基线**，这解释了源码里手写 `memo()` 很少（只在 markdown/审批按钮等热点补刀）。我们无此基建，手写 memo 策略需自己补。
- **可见性租约订阅**：侧栏每行的 git/PR 实时状态查询按「可见行租约」订阅，离屏行不发查询（`ThreadStatusIndicators.tsx:830` `useSidebarRowSubscriptionLease`）。

**与我们差距**：我们 `ClaudeSessionDetailRoute.tsx` 用 `@tanstack/react-virtual`（estimateSize 固定 200，L3536）、scroll follow 是 scrollTop 递减判 unpin + MutationObserver 跟涨（L1914-1966）——基础盘相似，但缺：① markdown 流式分块/缓存层；② 协议级 body 去重（我们 relay blob 已压但消息重复体不去重）；③ 性能基准与防退化 lint。

---

## 2. 消息流 / thread 视图交互细节

**结论**：流式 markdown、滚动跟随、折叠展开三件事都建了**显式状态机**，核心命题是「机器绝不与用户的阅读意图抢方向盘」。

### 流式渲染策略
- `ChatMarkdown.tsx:2052-2094`：流式期间 `splitMarkdownBlocks(text)` 把文本按「关闭所有打开块的空行」切开（`chat/markdownStreamBlocks.ts:19-23`），每块一个 `MarkdownSource`（key=index，注释："streamed blocks only change at the end"）——**新 token 只重解析/重渲最后一块**；末块之前的块都命中解析缓存。含跨块语法（重复标题 slug、Setext 下划线、引用定义）时返回 null 退回整段解析——正确性优先于速度。
- **不缓存的纪律**：`ChatMarkdown.tsx:2023` 注释 "streamed text would only fill the cache with prefixes"——流式块不进 LRU，只有完成的块进。

### 滚动跟随 = 显式状态机（最值得学的单点）
- `chat/timelineViewport.ts:63-170`：把滚轮/触摸/滚动条按压/键盘/iframe 内滚动统一成一种 `TimelineNavigation` 信号；`navigationReleasesFollow`（:216-238）按输入源分别判定是否释放跟随——上滑要真离开末尾带才算用户意图（"streaming growth makes isAtEnd flicker false for a frame, and a gesture then must not release follow"）；**误释放永不自动重连**（"A spurious release while pinned never re-arms"）。
- `transitionTimelineFollow`（timelineViewport.ts:255-276）：following/released/atEnd 三态机，处理「跟随中每个流式 chunk 会让列表离开末尾带一帧」这类竞态。
- `chat/useTimelineFollow.ts:87-91`：**scroll-to-bottom 药丸的出现做了 150ms debounce**（线程切换时 LegendList 会发 isAtEnd=false 的噪声滚动，藏是即时的、显是延迟的——不对称防闪）。
- 我们对应物（`ClaudeSessionDetailRoute.tsx:1914-1966`）只有一个 sticky 布尔，没有 per-input-source 意图分类，触屏/滚轮混合场景下行为不可预测。

### 折叠展开与位置记忆
- **展开锚定**：`chat/MessagesTimeline.tsx:505-545` `revealExpandedDisclosure`——展开一条 work entry 后计算 delta，**让被点击的行保持不动**、新内容向下展开，并钳到 composer 遮挡高度之上（"An anchor ends end-follow until the reader scrolls… an accordion cannot drag the reader to the end"）。
- **折叠态跨切换记忆**：`MessagesTimeline.tsx:441-490`——expandedRunIds/WorkGroupIds/AttemptIds + 滚动位置 + find 打开态，全部按线程 identity 存取（`timelineListStateFor`），切走再切回**逐项还原**。
- **切换位置回放**：`chat/useTimelinePositionRestore.ts:14-46` `settleListScroll`——按估算尺寸滚到位后，逐帧对 DOM 实测校正，直到视口对目标稳定 2 帧（60 帧预算）才 resolve。虚拟列表的「估大小滚不到位」被显式修平。

### Thinking / tool / turn 边界
- Thinking 行：进行中显示 "Thinking"、结束显示 "Thought"（`MessagesTimeline.logic.ts:266-269`）；折叠态的行标签直接取**首条 thought 扁平化后的文本**（`TimelineWorkEntryRow.logic.ts:44-66`、`workEntryDisplayLabel`），有界预览（源 8k 字符/预览 2k，:205-218）——「点开前先看内容摘要」而非「Thinking…」死标签。
- 派生中的 thinking：run 起了仍在跑的子任务后，"Thinking" 标签会被替换（`MessagesTimeline.logic.ts:572-575`）——状态标签反映「正在等谁」。
- Work 分组：工具行按 run 分组折叠，折叠头显示 hiddenCount + 摘要（:577-583 `work-toggle` 行：`hiddenCount`/`summary`/`expanded`）。
- 错误呈现：`chat/ThreadErrorBanner.tsx:39-56` 先尝试解 JSON 拿嵌套 `error.message`（provider 原始错误形状漂移在此吸收）；`ChatView.logic.ts:1263-1290` `resolveThreadErrorBanner` 区分 server 错误/draft 错误并决定是否 sessionDismissal；usage-limit 类错误有专用 banner（复制管理员申请文本到剪贴板的动作按钮，ThreadErrorBanner.tsx:19-36）。
- 附件/图片：行内缩略 → 点开 `ExpandedImageDialog`；组内图片翻页走 `workGroupImageGallery`（`TimelineWorkEntryRow.tsx:465-469`）；时间线加载用骨架屏不是 spinner。
- **Timeline minimap**：`chat/TimelineMinimap.tsx`——时间线侧缘的可拖拽小地图，条目 = 每轮的 user 文本 + assistant 终文预览（`timelineMinimapItems.ts:29-42`），指针拖动/滚轮直接导航到轮次。长线程的「我在哪」一瞥可得。

---

## 3. composer 体验

**结论**：composer 是全产品交互密度最高的部件——触发语法自教学、follow-up 语义（steer/queue）默认成 steer、队列编辑有精确的离队退出语义、待审批与输入问题内联在 composer 区。

- **占位符即教程**：`apps/web/src/composerPlaceholder.ts:3` `"Ask anything. @ files, $ skills, / commands"`——@文件、$技能、/命令三个触发语法在空态就教给用户。
- **follow-up 语义**：设置 `followUpBehavior: "queue" | "steer"` **默认 steer**（`packages/contracts/src/settings.ts:532-534`）。更妙的默认覆盖（`chat/ChatComposer.tsx:1218-1224`）：**当有待审批卡片在场时，发送消息自动按 steer 处理**（"A send declines the approvals shown here to redirect the agent"）——用户在 agent 等审批时打字回车，意图显然是「改道」而不是排队，交互语义替用户做了正确推断。
- **steering 入口**：队列第一条消息支持一键并入当前 turn——`QueuedRunsControl.tsx:321` "Send now" 菜单项直接带快捷键标签（`thread.steerQueuedMessage` 命令，`ChatView.tsx:2919-2921` 支持长按 repeat 连发）；compaction 运行中 promote 会降级为「停止 compaction 再发送」（`threadWorkflows.ts:42` 注释）。
- **队列编辑的退出语义**（我们 prompt 队列 v2 刚落，此处最有对照价值）：`packages/client-runtime/src/queuedRunEdit.ts:8-11`——编辑 watch 由全局 store 持有（"wherever the user is in the app"），run 离队时统一判定一次：未改动→静默关闭；已改动且线程草稿为空→转存草稿；已改动且草稿非空→丢弃（"so it never overwrites the user's other work"，:55-63）。不可编辑时有明确 blocked reason（如该 run 是个待回答问题、composer 正被问题占用，:70+）。
- **审批卡片**：`chat/ComposerPendingApprovalActions.tsx:29-38`——主操作两个按钮（Approve=实心、Decline=描边），"Always allow this session"/Cancel 进溢出菜单；server 下发的 options 可替换默认文案（:52-54）；带 warning 的选项挂 tooltip + 三角警示图标（:68-76）；`presentation: "composer" | "inline"`（:37）同一组件出两种形态——composer 区大按钮、时间线内联小按钮。
- **待输入问题**：`ComposerPendingUserInputPanel` 在 composer 上方抽屉呈现问题；choice-only 问题禁用自定义回答分支（ChatComposer.tsx:1247-1249 `isChoiceOnlyPendingQuestion`）。
- **发送链路的细腻**：图片在准备中会 hold 住发送并显示横幅（`ComposerHeldSendBanner`/`preparingComposerImages`）；`sendShortcut` 设置三档（enter / mod-enter-multiline / mod-enter，settings.ts:2112）；`composer.sendAlternate`/`composer.sendBackground`（发成后台/side thread）是独立 keybinding 命令。
- **prompt stash**：`promptStashStore.ts:9-13`——20 条上限的提示词暂存区，**含图片/文件附件一起存**（超大附件只记名字防破 localStorage 配额，:12-13），带 unreadableImageNames 兜底字段。
- 富文本 composer 是 Tiptap：代码块（语言选择器）、undo 分组（`composer-undo-grouping.ts`）、列表续接/拆分、RTL 探测——独立测试文件十几个，编辑器行为按条目化验收。

---

## 4. 移动端体验决策

**结论**：平台分化极重（ui 组件几乎全有 .ios/.android 变体），但数据模型单源——「同一 state 的两种 UI 皮肤」；推送/锁屏链路有完整的服务端契约与克制的安静策略。

- **列表行 swipe**（`apps/mobile/src/features/home/thread-swipe-actions.tsx`）：ReanimatedSwipeable，spring `{damping:26, mass:0.7, overshootClamping:true, stiffness:330}`（:62-67）；垂直 pan ±10px 即 fail（:143）；**全滑阈值 = max(动作区宽+44, 全宽×0.58)**（:265），armed 时触发 `Haptics.impactAsync(Medium)`（:452-459）、松手超阈值直接 commit（iOS 邮件式全滑删除）。三层防误触：滚动位移 >4px 即 gate 掉行 swipe（`useSwipeableScrollGate` :160-231）、视口外行不挂手势省渲染、trackpad 与滚动并存的 `simultaneousWith` 仅 iOS。
- **导航结构**：无传统 bottom-tabs navigator——iOS 用**原生 UITabBarController** 包装（`WorkspaceNativeTabs.ios.tsx:202-220`，iOS26 liquid glass 浮动 tab bar）；tab = Chats / PRs / Issues / Usage 四个可排序可隐藏 + Settings 溢出位（`navigation-tab-order.ts:28-32`），PRs 与 Issues **共享一个 tab 槽**。每 tab 首次选中才挂载、UIKit 快照遮丑、`requestIdleCallback` 预热其它 tab header（:170-197）。
- **Live Activity 服务端契约**（`features/agent-awareness/remoteRegistration.ts`）：设备注册 payload 含 per-category 通知偏好（approval/input/completion/failure 分开订，:369-387）；Live Activity token 单独注册并**监听 token 轮换**（不监听则 relay 一直推旧 token 直到 APNs 拒绝，:960-977）；每 60s 重放注册自愈漂移（:96）；10min stale 上限；**刻意不做 push-to-start**（"唤醒来取 token 太不可靠"，活动只由前台 app 创建，:1089-1091）。
- **锁屏卡片的安静策略**（`src/widgets/AgentActivity.tsx:349-351`）："agents 只是在干活时不打扰"——工作中只显示 glyph 不出文字，**只有需要人介入（approval/input）或出结果（completed/failed）才写文字**；attention 行排序置顶（:117-122）。
- **移动端取舍**：队列消息编辑桌面是拖拽列表、移动端是 menu + sheet 表单流（`ThreadQueueControl.tsx`，Steer/Edit/Remove/Send now 四项，不可编辑给 blocked reason）——**同一 queued-run-edit runtime state 的两种皮肤**；diff 无桌面 side-by-side，换原生语法高亮 surface + LegendList 分节 + **长按行评论**（`SourceFileDashboardSurface` :256,305-314）；terminal 用原生 ghostty 视图 + 旁路 text-input 降级；composer 折叠态用字体度量（`LOWERCASE_MIDLINE_EM`）精确基线对齐。
- 触屏适配：KeyboardAwareLegendList、Android IME inset 无 keyboardWillShow 的补丁 hook（`useSoftKeyboardShowing.ts`）、hitSlop 4-12 常态化、`maxFontSizeMultiplier` 防爆版式 + Android lineHeight 手动补偿。

**对我们（PWA）的意义**：可移植的不是原生件，而是三条纪律——① 推送内容 = 感知状态小投影 + 类别偏好分订；② 锁屏/通知的「工作时安静、要人时出声」策略；③ 移动端队列/审批 = 同一 state 的表单化皮肤（我们移动 sheet 已有同构容器，语义可对齐）。

---

## 5. 视觉与动效语言

**结论**：零动画库、动效默认关、循环动画可见性门控——**动效预算思维贯穿全仓**；主题系统深度是竞品罕见项。

- **语义色板即 API**：`packages/shared/src/themePalettes.ts:30-105` 约 60 个语义角色（canvas/chrome/toolbar×6/surface×3/text/border/focus/accent + error/warning/update 三件套 + message/sidebar/terminal/searchMatch 域色）。5 款内置主题，默认款全 oklch。
- **微字号阶梯**：`apps/web/src/index.css:184-191` 在 Tailwind xs 之下加 2xs(11px)/3xs(10px)/4xs(8px)/5xs(7px) 各带手工 line-height——元数据行/徽章/键位提示有专属档位且进 twMerge。我们 tokens.json 无 12px 以下档。
- **几何 token 防漂移**：index.css:91-153 `:root` 注释明言 "语义化值防漂移"（--control-radius、inset 系列、z-index 分层表带注释）。
- **动效哲学**（对「克制度」的最好注解）：
  - 面板动画**默认关闭**（`packages/contracts/src/settings.ts:159-166` panelAnimationDurationMs 默认 0；`panelAnimations.ts:38` active = 显式开启 && !reducedMotion && !suppressed）——动画是 opt-in。
  - **duty-cycle 关键帧**：skeleton 用 `steps(4)`、status-pulse `steps(6)`、status-ping `steps(8)` 且「先爆发后静默」（index.css:296-362，注释："120Hz 下 ~14 vs ~288 次合成器更新的差别"）——循环动画不是连续插值而是阶梯跳变。
  - **可见性门控**：`lib/visibleAnimation.ts:16-20`——循环动画只在「相交 + 页面可见 + 非 reduced-motion」才 running，否则 paused；spinner 与 live-tool-shine（流光扫文本，2.2s steps(30)）都走此通道。
- **主题系统深度**：VS Code 主题 JSONC 导入（display-p3 解码、亮暗自动配对）+ **Open VSX 商店 .vsix 直装**（20MB/5000 条目防爆 + 许可证白名单，`openVsxThemes.ts:11-47`）；主题半对（light/dark 各配一款）；远程环境下发主题；用户对比度三变量（base/boost/border-boost，消费侧全 color-mix，边框只加 1/4 强度）；**主题自定义 CSS 注入前剥离一切可 fetch 的声明**（`themeCss.ts:29-50`，防外传屏幕内容）。
- **空态/加载态分工**：结构未知→骨架屏（单一 `bg-muted-foreground/15` 呼吸动画，三种形状变体）；动作进行中→按钮内 spinner（role="status"）。空态文案「行动导向 + 状态归因」：NoProjectsHero "What should we work on?" + 两个动作；HostedEmptyState 区分 "This computer is off" / "No computer connected" / "Your agents run on your computer."——**说真因**，配编号设置步骤与内联 CLI 命令。
- **状态语义双轴**（最值得抄的纪律）：`Sidebar.logic.ts:1226-1301` 线程药丸——**色相表类型**（amber=待审批、indigo=待输入、red=失败、muted 灰=等待）、**脉冲只给「 actively working」**（sky + pulse）、需要人注意的状态一律不脉冲；全场多图标脉冲用 `onAnimationStart` 重置 startTime 同步起拍（`ThreadStatusIndicators.tsx:711-719`）；`useDelayedStatus.ts` 短暂状态延迟渲染防 spinner 闪现。

---

## 6. 微交互拾遗（「显得贵」的细节）

- **keybinding 系统 VS Code 级**：约 100 个命令 + `when` 子句引擎（`packages/contracts/src/keybindings.ts:37-119` 命令注册表；:182-206 when AST），含 `thread.jump.1-9`（数字键直达第 n 个线程）、`modelPicker.jump.1-9`、`script.<id>.run`（**项目脚本自动成为可绑命令**，:121-128）；冲突解析按规则序后者覆盖（keybindings.ts:139-165）；Mod+Enter 按用户 send 偏好运行时重解析而不改写已存规则（:115-132）。UI 侧有 keybindings 设置页 + 更新 toast。
- **thread undo**：pin/unpin/归档等动作出 **Undo 药丸**，所有权精确到 environment+thread 且后一次动作使前一个 undo 失效（`packages/client-runtime/src/state/thread-undo.ts` + `showThreadUndoNotice`；测试 `threadUndo.test.ts:5-28` 把边界写成了规格）。
- **复制反馈**：tooltip 文案切换 "Copy path"→"Copied" + 图标换对勾（`DiffFilePathCopyButton.tsx:31-45`）；失败用**锚定在按钮旁的 toast** 不用全局 toast（`anchoredCopyToast`）；消息复制支持 extraFlavors（复制为 markdown/纯文本等变体）。
- **相对时间精确跳变**：`useRelativeTimeState.ts:13-31`——`useSyncExternalStore` + `msUntilRelativeTimeChange` 定时到**下一个边界**才触发渲染（非每分钟轮询），"just now"→"2m"→…→绝对时间的每次跳变都准点。
- **屏幕阅读器播报的时间数学**：`ThreadActivityAnnouncer.tsx:21-31`——polite region 会排队但说不过来的内容会迟到，所以每条播报按 **50ms/字符（上限 15s）** 计算 hold，凑成一次播报再写入；设置里还有 `screenReaderAnnouncements`/`screenReaderWindowTitle` 开关。
- **杂项**：`QuitHoldOverlay`（桌面按住才退出，防误触）；`thread.copyReference`（复制线程引用链接）；`ThreadHoverCard` 玻璃材质预览（侧栏 hover 出末条消息预览）；thread 标题再生成有 toast；关闭的视图可 reopen（`view.reopenClosed`）；侧栏有 `boringSidebarEnabled`「无聊模式」（紧凑多行列表，settings.ts:540-541）——**给重度用户密度选项**。

---

## 7. 对 agents-remote 的可移植清单（按成本/价值排序）

| # | 项 | 价值 | 成本 | 我们现状对应物 |
|---|---|---|---|---|
| 1 | **流式 markdown 分块渲染**：按空行切块、只重解析末块 + 块级 LRU（岛渲染可后置） | 高（长会话流式帧率） | 中 | `web/src/components/markdown/MarkdownText.tsx` 经 assistant-ui 全量重渲；API 侧有 blob 批但渲染层无块缓存 |
| 2 | **折叠展开锚定 + 折叠态/滚动位置按会话记忆还原** | 高（review 长工具流） | 低-中 | `collapsible-section.tsx` 无锚定；切会话折叠态全丢 |
| 3 | **滚动跟随状态机**：per-input-source 释放判定 + 误释放不自动重连 + scroll-to-end 药丸标注末尾内容 | 高（流式阅读核心手感） | 中 | `ClaudeSessionDetailRoute.tsx:1914-1966` 单 sticky 布尔 + MutationObserver |
| 4 | **状态语义双轴 + 脉冲同步**：色相表状态类型、脉冲只给「活」、灰表等待；多图标同拍 | 高（一眼可读） | 低 | 会话行状态点有色彩但脉冲语义未成文（frontend-notes §34 圆点变体） |
| 5 | **steps() duty-cycle 动画 + 循环动画可见性门控**（IntersectionObserver + visibilitychange → paused） | 中高（120Hz 设备与功耗） | 低 | index.css 动效 token 已单源；无 steps 化、无可见性门控 |
| 6 | **审批卡片双形态 + 主操作收敛**：Approve/Decline 实心/描边两钮、其余进溢出菜单、warning tooltip、composer|inline 同组件 | 中高（审批是核心路径） | 低 | 审批 center 已有，卡片形态待对照收敛（验收卡片提示语义可照抄） |
| 7 | **follow-up 语义默认 steer + 发送否决待审批**：排队/steer 用户可选；待审批在场时发送 = 改道 | 中高（正补 prompt 队列语义） | 低 | prompt 队列 v2（0d16d5d9）已有排队/撤回/编辑，缺 steer 语义与「发送=否决审批」联动 |
| 8 | **队列编辑离队退出语义**：run 离队→未改静默关/已改转草稿（草稿空才转）/否则丢弃 + blocked reason 文案 | 中（v2 队列的边界完备性） | 低 | prompt 队列 v2 有编辑，无离队 watch 与转存草稿语义 |
| 9 | **空态/加载态分工 + 说真因的空态文案**：结构骨架/按钮 spinner；"This computer is off" 式归因 | 中 | 低 | workbench 有骨架屏；断连/离线空态文案较笼统 |
| 10 | **相对时间边界定时器 + composer 占位符教触发语法** | 中（细节质感） | 低 | RelativeTime 组件每分钟粒度；composer 占位符未教 `@`/`/` 语法 |

**明确不建议跟**：React Compiler 全量基建（与 Bun/rolldown 工具链耦合，需专项评估）；Timeline minimap（长线程价值高但实现重，且我们虚拟化是 turn 级、行索引语义不同）；keybinding 全家桶（桌面 PWA 优先级低，可只抄 `thread.jump` 概念进命令面板）；VS Code/Open VSX 主题导入（超出当前设计系统阶段）。

## 附：关键源码索引（~/repos/t3code）

- 性能：`AGENTS.md:15-19,119-123,210`；`apps/web/src/performance.bench.ts`；`packages/client-runtime/src/remotePerformance.bench.ts`；`apps/server/src/ws.ts:917,1150`；`packages/shared/src/orchestrationV2DedupedBodies.ts`；`apps/server/src/orchestration-v2/LiveStreamBudget.ts:17-18`
- 消息流：`apps/web/src/components/ChatMarkdown.tsx:2016-2105`；`chat/markdownStreamBlocks.ts`；`chat/markdownIslands.ts`；`chat/markdownRenderer.ts:14-29`；`chat/timelineViewport.ts:63-276`；`chat/useTimelineFollow.ts:87-91`；`chat/MessagesTimeline.tsx:441-545`；`chat/useTimelinePositionRestore.ts:14-46`；`chat/optimisticUserMessages.ts:9-49`；`chat/TimelineMinimap.tsx`
- composer：`apps/web/src/composerPlaceholder.ts:3`；`chat/ChatComposer.tsx:1218-1249`；`chat/ComposerPendingApprovalActions.tsx:29-76`；`packages/client-runtime/src/queuedRunEdit.ts:8-70`；`chat/QueuedRunsControl.tsx:321-345`；`promptStashStore.ts:9-13`；`packages/contracts/src/settings.ts:532-534,2112`
- 移动端：`apps/mobile/src/features/home/thread-swipe-actions.tsx`；`features/layout/workspace/WorkspaceNativeTabs.ios.tsx:170-248`；`features/agent-awareness/remoteRegistration.ts:369-387,931-977,1089-1091`；`src/widgets/AgentActivity.tsx:349-384`
- 视觉/动效：`packages/shared/src/themePalettes.ts:30-105`；`apps/web/src/index.css:91-191,296-362,552-644`；`panelAnimations.ts`；`lib/visibleAnimation.ts`；`Sidebar.logic.ts:1226-1301`；`ThreadStatusIndicators.tsx:706-830`；`themeCss.ts:29-50`；`openVsxThemes.ts:11-47`
- 微交互：`packages/contracts/src/keybindings.ts:37-206`；`apps/web/src/keybindings.ts:115-165`；`hooks/useRelativeTimeState.ts:13-31`；`chat/ThreadActivityAnnouncer.tsx:21-31`；`DiffFilePathCopyButton.tsx:31-45`
