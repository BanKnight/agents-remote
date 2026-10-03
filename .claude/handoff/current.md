# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-03（**「打开即下拉」第三轮 `1fcadbe`**：两轮修复（摘类 `6aa7c27` + 热区分档 `bdce488`）**均被真机否证无效**——停止盲改。本轮交付：①接管视觉续接（base = cancel 前后视觉顶差，inline 写 base+dy，消接管瞬跳，探针实锤）；②真机诊断通道 `sheet-debug.ts`（浮层**默认常开**打手势事件链）。**等用户真机复现，浮层内容 = 定位证据，到手后按断点层修复并删 sheet-debug.ts**。probe-mobile-motion 44 断言全绿，全门禁绿。回滚点 = `98b12fa`。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

**全站动效体系收口 + 移动端加强批（`eb5f62c` 为末批）**：五批动效全走纯 CSS（弹层 `linear()` 弹簧 / 列表 stagger / grid 轨道过渡 / press 独立 scale），**motion 库引入后摘除**（115KB 死重，entry 397KB→292KB）。移动端追加：sheet enter 从 16px 浮起改**屏幕底全程升起**（450ms 新档 `--spring-sheet-duration`）+ ActionMenu sheet 菜单逐项 stagger + **触屏按压统一**（行档 0.98：.srow2 CSS 单源 + NavItemContent/ListRow/菜单项/首页行 utility；按钮档 0.97 既有）。探针 probe-mobile-motion 44 + spring-overlays 21 全绿。决策详见 redesign-v2.md 动效段。

## 本 session 焦点（全站动效体系）

1. 用户需求：添加合适动画使整体更出彩，按最佳实践选技术栈；先 push 作回滚点（`98b12fa`）。
2. AskUserQuestion 三拍板：范围 = 全站动效体系；弹层 = 换 spring；工作台布局 = 要 layout 动画。**页面切换动效 = 我决策不做**（与既有拍板「ready 直接切」冲突；替代 = 内容层交错入场）。
3. **motion 库摘除**（与拍板①的偏离，可回滚）：批A 按 plan 引入 `motion@13.4.4` + LazyMotion + MotionConfig，但批B–E 实施全部落成纯 CSS、零 `m.` 消费方；perf review P0-1 实锤 LazyMotion 动态 import 与静态 import 同属一个 barrel → 树摇失效 → 115KB min（29% entry chunk）死重。摘除后 entry **397KB → 292KB（-26%）**，全产物零 framer-motion 引用（sourcemap 归因）。**motion 的独有价值（可中断 spring + 速度继承）在本项目无落点**——无手势驱动动画（mobile-sheet 拖拽是禁区），`linear()` 采样提供了 spring 的曲线形状，静止场景足够。
4. 三 reviewer 消化（`4d4772c`）：perf 摘除 motion / blur 8→4px / history-list 撤 stagger / 键盘摘类；design 时长 token 化 ×2 / mobile-sheet `getAnimations()` cancel / actionButton press / stagger calc 化；security 随摘除消失。
5. 探针消竞态三处（均为 Node↔页面往返慢于动画窗口的**假 fail**）：`transitionrun` 事件断言（grid-panel）/ 页面内 rAF 逐帧采样（button-press）/ 页面内 `waitForFunction` 轮询（spring-overlays exit）。
6. **移动端动效加强批**（`eb5f62c`，用户反馈「移动端加的不多」）：拍板①sheet 升起 + 逐项入场、②触屏按压统一；页面切换动效仍不做。sheet enter 全程升起 = `[--tw-enter-translate-y:100%]` 变量注入（机制 §16）+ 去 fade + 新 token 450ms；**拖拽状态机/exit/fill-forwards 禁区一行未动**。按压 = 行档 0.98 / 按钮档 0.97 分层；`.srow2` 走 **CSS 单源**（一处覆盖三消费点）而非逐点 utility；utility 侧 `transition-[scale,background-color] duration-[var(--duration-fast)]`（§19/§20）。DragSourceCard 仅桌面 tabstrip（移动无卡片面）。
7. **「打开即下拉」三轮修复 + 证据转向**（`6aa7c27`/`bdce488`/`1fcadbe`）：第一轮摘类断动画重建（§21 机制真实，真机否证）；第二轮热区分档（§22 原主根因假设，真机否证**且被用户批评为「质疑测试能力」的越界推测**——禁止把用户手势落点当变量）；第三轮**停止推理盲改**：交付①接管视觉续接（`dragBaseRef` = cancel 前后视觉顶差，inline 写 base+dy）+ ②真机诊断通道 `sheet-debug.ts`（**默认常开**——PWA standalone 注入不了 URL 参数，flag 通道不可靠；pointer-events:none 浮层打事件链）。**当前等用户真机复现一次「打开即下拉」，念回浮层事件链 → 按断点层定位修复 → 删 sheet-debug.ts。**

## 关键决策（本阶段不可丢）

- **motion 摘除（本批最大决策，与拍板①偏离、可回滚）**：批B–E 实施后动效全落纯 CSS、零 `m.` 消费方；LazyMotion 动态 import 与静态 import 同 barrel → 树摇失效 → 115KB（29% entry）死重。motion 独有价值（可中断 spring + 速度继承）在本项目无落点（mobile-sheet 拖拽是禁区、无其他手势驱动动画），`linear()` 采样已给 spring 曲线形状。**若未来做手势中断续接再引入，须在消费点动态 import 避开 barrel 树摇**；`git revert 4d4772c` 可整体回滚摘除。动效单源 = `web/src/styles/index.css`（JS 镜像 tokens.ts 已删）。
- **Tailwind v4 独立 transform 属性（frontend-notes §19）**：`scale-*` 生成独立 CSS `scale` 属性非 transform；transition-property 写 transform 对它零作用（press 退化瞬切）——必须显式列 `scale`，断言读 `getComputedStyle(el).scale`。
- **insertBefore 移动 keyed DOM = CSS animation 重播（frontend-notes §17）**：动态排序列表（lastActivityAt）不能挂 stagger（行前移 = opacity:0 闪烁），只挂排序稳定列表（服务端排序全稳定字段）。
- **grid 轨道过渡（frontend-notes §18）**：变量承载列宽、模板裸引用（包 `minmax(var())` 嵌套非法整条声明被丢）；拖拽**和键盘长按**连续改宽期间摘 transition（keydown 20-30 次/秒 = 连续重定目标）；gutter 可聚焦 separator 契约（role+tabIndex 是键盘通道可达前提，存量 a11y 缺失本批补）。
- **tw-animate timing 注入（frontend-notes §16）**：`.animate-in` 是 animation shorthand 会重置长属性，timing 只能走 `--tw-ease`/`--tw-animation-duration` 自定义属性注入；时长 token `--spring-standard-duration: 525ms` / `--spring-snappy-duration: 375ms` / `--duration-exit: 150ms`（exit 原靠 tw-animate 默认值隐式巧合）。
- **页面切换动效不做**（本批拍板）：与「ready 直接切」冲突，导航路径上任何非必要延迟都是回归；内容层交错入场为替代。
- **移动批三条（`eb5f62c`）**：①sheet enter 全程升起 450ms（`--spring-sheet-duration` 新档 token；100% 路程下 375ms 偏陡）；②触屏按压分层 = 行档 0.98 / 按钮档 0.97；③按压落地双层 = CSS 单源（.srow2，覆盖多消费点）+ utility 收窄（`transition-[scale,background-color]`——§19 scale 须显式列出 / §20 裸 transition 23 属性大表）。**iOS 注意**：`:active` 在 PWA standalone 生效、滚动时 iOS Safari 会清 active（真机验）；Chromium 模拟不了 pointer media。
- **「打开即下拉」证据纪律（frontend-notes §22 改写版，两轮否证的教训）**：真机反复失败的 bug **停止推理盲改，先拿真机第一手数据**——`sheet-debug.ts` 通道（一次性工具，证据到手即删）。日志语义速查：无 down 行 = pointerdown 根本没到 Content（事件层上游：Radix/fiber 拦截）；`down zone=content play=0 pend=NO` = 窄热区拒绝（热区层）；有 down 无 take/chk = 没越过起步阈值或被 pointercancel 抢占；`chk ... MISMATCH!` = 动画/keyframes 压过 inline（动画层实锤）；`up|PCANCEL ... -> DISMISS|bounce` 行出现 = 判定面已到（问题在判定参数）。**用户的测试操作不是变量**——「手指落点不准」类推断 = 质疑测试能力，绝对禁止。摘类（§21）保留为防线；热区分档保留（真实扩大起手面、无害）。
- **接管视觉续接（`1fcadbe`）**：enter 升起中被接管时 cancel 让元素瞬回未变换位置（终态），直接写 `translateY(dy)` = 瞬跳再跟手——cancel 前记 `visTop`、cancel 后取差作 `dragBaseRef`，inline 一律 `base + dy`（animate from the presentation value）；endDrag 归零。探针实锤：定格 t=200 接管拖 40px 视觉移恰 40.0px、m42 ≈ inline。
- **global 右栏语义（第十二批拍板）**：global 右栏 = 当前项目内容（lastProject 记忆优先，无记忆回退 projectNames[0]），一个项目都没有才完全空态。
- **返回类导航统一 pop 优先**（useWorkbenchBack；M13d 核实其判定语义并注释准确化——back 落点=真实来源是设计意图，出站不可能）。
- **inlineLocalHtmlAssets 契约（M13a 后）**：四类 job 替换串必须函数形式（字符串形式 `$&` 会展开）；style/script 段先剥（PUA 占位非 NUL）后回填；escapeSrcdoc = `& → < → "` 三转义（`>` 不转）；PreviewBody promise 按 preview 引用缓存；fetchOnce per-call 不跨调用。
- **RenderModeToggle 单源**（03q3 .mseg）：渲染段在前、on 态 bg-segmented-thumb、位置由调用方 className 注入。
- **file tab 状态（用户拍板）**：桌面中栏 file tab 后续规划要恢复发挥作用，当前暂时保持——暂缓非弃案。
- **重连增量回放（本批拍板）**：①回退场景（锚找不到：API 重启 / compact / cap 截断）维持 skeleton 现状，不做旧内容保留；②范围 claude 先行，pi/acp 维持全量记档后续。
- **增量回放技术要点（防复发）**：锚 = 最后一条带 uuid 消息（到达序 append 保证严格最后已见）；liveStart 修正 = 断线前 raw 基线 + historyBatch.length（replayCursorRef 同步累进——setRawMessages updater 延迟执行，同宏任务连续 batch 读 state.length 不可靠）；淡入范围用 rendered 索引空间（turn.startIndex 是投影索引，raw 空间在有 HiddenDropped/合并会话偏大）；动画 keyframes 纯 opacity（transform 会覆盖虚拟列表定位）。
- 历史拍板继续有效：三栏第一行同一水平线；跨页一致优先；多端同构；「侧边栏」= 检视面板；mainPage 整页态右栏蒸发保留。

## 进度（已完成 / 进行中 / 待办）

- ✅ 第八~十二批 `3665264`/`9bbf351`/`5e06b5d`/`e9e9c87`/`386533a` + 记档齐
- ✅ reviewer 补审 + M13a `069704c` + M13b `07572a4` + M13c `5b3d527` + M13d `b169aaa` + §6.13 第十三批段
- ✅ 第十三批②文件预览扩展名修复 `2e9eac8`（白名单反转二进制黑名单；dev api 已 respawn 实证 `.mjs` text）
- ✅ 第十三批③模型链路污染修复（`sanitizePersistedModel`：echo 解析出口 + spawn --model 闸，legacy 形状兼容，dev api 已 respawn、脏 CLI 进程已消亡）
- ✅ 第十三批④编辑态画布对齐 03q2（`0663ddd`：bg-codeblock 全幅去输入框壳，四处单源改，m4 探针 71 pass）
- ✅ 第十三批④续排印/行号对齐（`542686e`：11.5px/20px + lineNumbers()，md 源码 toggle↔编辑同套，m4 探针 72 pass；语法着色收敛 + CodeWithLineNumbers 退役另批）
- ✅ 第十三批⑤模型反引号存量根治（`6529c87`：sanitize 单源下沉 api/src/model-id.ts + parseMetadata 读取归一 + 三写路径闸 + 前端 resolveCurrentModelAlias 兜底；**真机复验已通过**）
- ✅ 第十三批⑥composer 草稿持久化（`04478d5`：lib/composer-draft.ts 单源 hook，persist/hydrate/时序门闩/key 切换四机制，claude+pi+acp 三端接入；探针 5 项 + 单测 4 项全绿）
- ✅ 重连增量回放（`d565ba4`：shared replay 字段 → relay 锚定 → claude-stream 串参 → 客户端 delta 分流 + liveStart 修正 + 淡入；relay 单测 6 项 + hook 54 pass + 探针 8 项；协议文档「重连回放消息序列」段同步更新为现行序列）
- ✅ **全站动效体系**（批A `acf2c15` → 批B `4683116` → 批C `dc8a2ff` → 批D+E `fbd789a` → 批E scale 修正 `e02ec70` → reviewer 消化 `4d4772c`；记档齐：redesign-v2.md 动效段 + frontend-notes §16–20 + handoff 滚动；回滚点 `98b12fa`）
- ✅ **移动端动效加强批 `eb5f62c`**（sheet 全程升起 + ActionMenu sheet stagger + 触屏按压统一；新探针 probe-mobile-motion + spring-overlays 21；记档齐：redesign-v2.md 移动批小节 + frontend-notes §18 全屏入场几何断言教训）
- ✅ **「打开即下拉」第三轮 `1fcadbe`**（两轮假设真机否证 → 停止盲改：接管视觉续接 + sheet-debug 诊断通道；probe-mobile-motion **44** 断言含视觉跟手 + m42≈inline；记档：redesign-v2.md 修复小节三轮口径 + frontend-notes §22 改写为证据纪律 + §21 加否证标注）
- ⬜ **等用户真机复现「打开即下拉」并回报浮层事件链（当前最优先）**
- ⬜ 证据到手后：按断点层修复 + 删除 `web/src/components/shell/sheet-debug.ts`（一次性工具）+ probe 断言按根因校准
- ⬜ **交用户真机复验**（第八~十二批 + 第十三批 + 重连增量 + **动效批清单 21–25 + 移动批 26–29** 见下）
- ⬜ 阶段一遗留：第五批 reviewer 修复批（`bd7aedc`）真机复验清单仍待用户执行
- ⬜ 存量欠账（不动）：e2e pwa-installable 存量失败；桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉（global 右栏多项目浏览增强）；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；sheet 拖拽真机复验；`.tree`/`.growrow` 死代码清扫；probe-m10-feedback-fixes H 段基线；diff L3 位置架构项；design P2 滚动 5 项

## 用户真机复验清单（第八批~第十三批）

**第八批**（agents-remote 项目 `docs/design/index.html` 渲染态）：
1. 嵌套原型页图标恢复（搜索放大镜、行内功能图标）；`svg[data-symbol]` 手绘兜底不变

**第九批**（移动端）：
2. 底 nav「文件」→ 进项目 → 点文件预览 → 返回 → 应回**全局文件页**且 cwd 记忆保持

**第十批**（Mac 桌面）：
3. 折叠右栏后中栏右缘实底竖条唤出钮可见（已确认）+ 唤出/折叠循环正常

**第十一批**（Mac 桌面）：
4. 项目页右栏展开态 → 直达 `/projects` → 右栏保持展开不蒸发；折叠态到达则唤出钮在场

**第十二批**（Mac 桌面）：
5. **global 右栏 = 当前项目内容**：`/projects` 唤出右栏 → 显示 lastProject（或列表首个项目）的 files 标签（非空态）
6. **真无项目才空态**：把项目全删（或无项目环境）→ global 唤出右栏 → 「暂无内容」
7. **右栏拖拽**：右栏展开态，左缘出现 col-resize 光标，向左拖 → 右栏变宽（clamp 256–640px），刷新后宽度记忆保持

**第十三批**（M13a–d，Mac 桌面 + 移动端）：
8. **md/html toggle 形态**：任意 md/html 预览 → 「渲染/源码」分段钮 = 24px 高灰底轨、渲染段在前、on 态深底白字（03q3 原型）；渲染态 meta 行只留时间、源码态显示行数+时间；桌面右栏与移动 L3 两处形态一致
9. **html 内联渲染正确性**：agents-remote 项目 `docs/design/index.html` 渲染态 → 图标/样式/嵌套 iframe 正常（含路径含 `$` 字符的文件若可构造）；重复切「渲染↔源码」无明显卡顿（管道 memo）
10. **gutter 键盘**：右栏展开态 Tab 聚焦左缘分隔条（高亮）→ ← 变宽 / → 变窄，±1rem 步进，clamp 16–40rem
11. **非 md/html 编辑返回**：移动端打开 .ts 文件 → 编辑 → 返回 → 再进不残留「渲染态」（脏 renderMode gate）

**第十三批②**（文件预览扩展名，两端）：
12. **源码文件可查看&编辑**：`.mjs`/`.cjs`/`.sql`/`.ini`/`.htm` 等此前打不开的源码/配置文件 → 看且能编辑保存；`.env`/`Dockerfile`/`Makefile`/无扩展名文件同样可读
13. **二进制仍被拦**：`.zip`/`.png`（图片走 ImageViewer）/`.wasm`/`bun.lockb` → 仍是「无法预览」或图片视图，不出乱码

**第十三批③**（模型链路污染修复，两端）：
14. **模型显示无反引号**：重开之前出问题的会话 → composer 模型 pill 与 ℹ 运行配置浮层显示 `Opus [1m]` 类正常名，两侧无反引号
15. **发消息不再 422**：同一会话发一条消息 → 正常回复，无「model not found」错误气泡

**第十三批④**（编辑态画布，两端）：
16. **查看↔编辑切换零跳变**：任意文本文件（如 `.ts`）查看 → 编辑 → 画布形态不变（codeblock 全幅背景、上下 10px 边距、无圆角无边框），仅内容层变化；md/html 的 渲染↔源码 切换同验；lazy 加载瞬间无白框闪动
17. **md 源码↔编辑同套**：md「源码」toggle 与点「编辑」→ 同排印（11.5px 等宽/行高 20px）、同有行号列、同画布——只差语法着色（编辑态有着色为预期）；桌面右栏同验

**第十三批⑥**（composer 草稿持久化，两端）：
18. **未发送输入跨刷新保留**：任意会话输入框打字（不发送）→ 刷新 / 关 PWA 重开 → 草稿原样保留；切到别的会话再回来 → 各自草稿独立保留；发送后输入框清空且重开不再恢复；手动删光同上

**重连增量回放**（`d565ba4`，claude 会话，Mac 桌面 + 移动端）：
19. **长会话断网重连**：打开长 claude 会话 → 关 Wifi 几秒再开 → 重连后**内容不闪不重刷**（无 skeleton、既有消息不动）、offlineCap 横幅消失、断线期间新消息补齐且**淡入**；注意手机 PWA 断网期间 WS 语义与桌面一致
20. **全量回退分支**：API 重启（tmux respawn api）后重连 → skeleton + 全量重放正常（现状，预期行为）；pi/acp 会话断网重连 → 行为与之前完全一致（全量）

**全站动效批**（批A–E + `4d4772c`，Mac 桌面 + iPhone；**如整体不满意可回滚到 `98b12fa`**）：
21. **弹层手感**：新建会话菜单 / prompt Dialog / 设置弹层开合 = 弹簧曲线无过冲、打开有 materialize 质感（scale+blur 4px）；**连续快速开合**不卡不跳（中断跳变窗口，perf P2-7 重点验）；Esc/scrim 关闭快速离开（150ms）
22. **mobile-sheet「打开即下拉」→ 已升级为取证模式**：直接用平时访问的地址（debug 浮层默认常开，无需任何参数）→ 复现「打开即下拉」→ **把屏幕左上角绿色浮层的几行事件链念回来**（`#N down zone=... pend=...` / `take ...` / `chk ...` / `up|PCANCEL ... -> ...`）；顺带感受接管跳变是否已消失（视觉续接）
23. **列表入场**：进 /projects、/files、项目页 → 列表行自上而下 28ms 交错淡入上浮，**只首次挂载**——WS 状态更新/hover 不重播、历史列表（时钟切过去）完全无闪烁
24. **右栏开合 + 拖宽 + 键盘**：折叠/展开有 280ms 滑动；**拖宽 1:1 跟手**（无迟滞）；**Tab 聚焦左缘分隔条（高亮）→ ←/→ 步进 ±1rem 即时到位**（清单第 10 项，本批修复 role+tabIndex 后键盘通道才真正可用）；reduced-motion（系统减弱动效开启）下全部即时到位
25. **button press**：按住按钮有 0.97 按压回缩（弹层 trigger 类带 aria-haspopup 的不缩——锚点稳定）；松手回弹

**移动端动效批**（`eb5f62c`，iPhone）：
26. **操作菜单逐项入场**：⋯ 打开操作菜单 sheet → 菜单项自上而下 28ms 交错淡入上浮，每次打开都播
27. **触屏按压统一**：按住**行**（会话行/文件行/首页活动行·项目行/侧栏行）与**底 nav 项**、sheet 菜单项 → 轻微回缩 0.98 松手回弹；**按钮**仍是 0.97 档（面积大 vs 小的分层）
28. **iOS 专项**：滚动列表时按住行 → 滚动后不应粘滞在按下态（iOS Safari 会清 ：active）；PWA standalone 下按压反馈生效

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012；CSS 硬闸已过（188773 字节，content-type text/css）。
- **「打开即下拉」根因未定**：两轮修复假设均真机否证，根因候选空间（事件层上游 / 热区拒绝 / pointercancel 抢占 / 动画压制 inline / 判定参数）等 debug 浮层数据切分——**在此之前不再做任何推理型修复**。
- **router22 残留进程待用户处理**：21 天前的 chromium 两棵进程树（PID 1989432/1989916，user-data-dir=/tmp/router22-fb31-diag3，remote-debugging-port=9781）——kill 被权限分类器拦截（跨项目资源），需用户自己清或授权；本项目探针无残留。
- **存量时序 flake（与本批无关，欠账）**：`probe-claude-reconnect-delta` ③c 偶发 animated=0（600ms 摘除 timer 与采样窗口竞态），复跑即绿。

## 易丢的关键上下文

- **探针跑法**：touch web/src/main.tsx + sleep 16 + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- **pre-commit 快速通道**：staged 全为纯文档面 → 只跑 format:check+lint；任一命中代码面 → 全门禁。
- **sheet-debug 通道（一次性，证据到手即删）**：`web/src/components/shell/sheet-debug.ts` + mobile-sheet.tsx 内 `sheetDebug(...)` 埋点（down/take/chk/end 五处）；**诊断期默认常开**（PWA standalone 注入不了 URL 参数，flag 通道不可靠）；浮层黑底绿字左上角、pointer-events:none 不干扰手势；MAX_LINES=8 环形。删工具时同步摘 mobile-sheet 的 import 与五处调用 + mvCountRef/tpCountRef。
- **右栏装配链（第十二批后终态）**：WorkbenchRoute rightPanelProjectKey/rightCtx → RightPanelTabs；workbench-shell gutter 无条件渲染（aside 内，现 role=separator 可聚焦）+ RailButton 收起态唤出。探针覆盖：probe-v2-m9-multi-device Part 4（global 连续性六断言）+ Part 5（真空态 + 拖拽七断言）。
- **MobileFileFocus back 契约**（第九批）：pop 优先回来源 + 深链兜底 /files。
- **CLI 模型 echo 是显示串**（第十三批③⑤）：CLI 对 set_model 的回应 `<local-command-stdout>Set model to <display></local-command-stdout>` 里 `<display>` = modelDisplayString 显示串（markdown code span 反引号包裹 + (resolved) 注解），非裸 model 名；`sanitizePersistedModel`（**api/src/model-id.ts 叶子模块单源**，claude-runtime re-export）归一链路四处必过：CLI echo 解析出口、spawn --model 传参、metadata 读写边界（parseMetadata/setModel/setClaudeSessionId/createMetadata）、前端 resolveCurrentModelAlias 显示兜底——再遇模型显示怪串先查这条链。
- **本 session 输出管线坑（复发两次）**：生成「反斜杠-u-XXXX」转义文本会退化为真实字符（PUA/NUL）——内置 Edit 匹配不上、markdown 记档也中招；处理用 python/perl 字节级替换，记档表述用纯文字描述占位符。
- **composer 草稿持久化（第十三批⑥）**：`web/src/lib/composer-draft.ts` 单源 hook（loadComposerDraft/saveComposerDraft 纯函数 + useComposerDraft）；key = `composerDraft:<type>:<sessionId>`；**assistant-ui 的 aui state 投影走异步调度**——setText 后订阅不立即回显，测试必须 waitFor/async act，同步断言读不到。
- **重连增量回放链路（`d565ba4`）**：cursorRef（最后带 uuid 消息）→ `claudeStreamUrl(project, session, since)` → `?since=` → handleClaudeStreamUpgrade（≤128 校验）→ relay.addSubscriber opts.sinceUuid → locateReplayAnchor（先倒序 live 后 history + topLevelUuidIs 顶层确认）→ session_init `replay:"delta"|"full"`。客户端 session_init 分流（delta 不 reset）+ history_end liveStart 修正（replayCursorRef 同步累进）+ 封口 effect（deltaClosePendingRef → setDeltaEnter rendered 范围 → 600ms timer 挂 ref 摘除）。探针 `probe-claude-reconnect-delta.mjs` 8 项。
- **动效批跑法与断言口径**：改动效相关文件后跑四探针（grid-panel 14 / spring-overlays **21** / button-press 7 / stagger-entry 11 + 新 **probe-mobile-motion 44**），均 `bun scripts/probe-*.mjs`；**探针断言动画禁止 Node 侧定时采样**（Node↔页面往返可慢于动画窗口 = 假 fail 三连教训）——用 `transitionrun` 事件（真过渡才派发）、页面内 rAF 逐帧采样、页面内 `waitForFunction` 三选一；读 scale 读 `getComputedStyle(el).scale` 非 transform（§19）。**全程升起的 sheet 内几何/按压断言必须先等 enter 播完**（translateY(100%) 起点整 sheet 在视口外，boundingBox 落屏外 = mouse.down 不命中，frontend-notes §18）；**验「动画运行期手势接管」用 WAAPI `a.pause(); a.currentTime=N` 定格**（薄热区 × 动画速度下 boundingBox 往返必 race 输，§21）；**DOMMatrixReadOnly 只在页面内存在**（m42 计算必须进 `page.evaluate`）。
- **移动批按压统一清单（`eb5f62c`）**：CSS 单源 = `.srow2`（v2-primitives.css，transition: scale + :active 0.98）；utility = NavItemContent interactionClass / listRowClasses / mobileSheetItemClasses（action-menu.tsx，§20 裸 transition 已收窄）/ mobile-projects-home 三处行；统一 `duration-[var(--duration-fast)]` 120ms。改行按压回退排查从这五处看。
- 记档位置：§6.13「真机反馈修复」第八~十二批 + reviewer 补审修复批（M13a–d）+ 重连增量回放段 + **动效段（§7 前）**齐；协议文档「重连回放消息序列」段已更新为现行序列（session_init/seed_init/history/live + replay 字段）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-03；触发原因：「打开即下拉」第三轮（视觉续接 + sheet-debug 通道）+ 记档三处改写
