# Claude iOS Safari 键盘与 viewport 问题调研

iPhone Safari 上 claude session detail 的 composer（输入框）键盘交互问题的根因调研。结论区分「事实」（规范 / WebKit bug / MDN / web.dev / Apple）与「社区经验·弱证据」（Stack Overflow / 博客 / GitHub PR）。

## 现象与实测

三个症状：

1. 聚焦 composer 时，整个页面被向上推。
2. 失焦（键盘收起）后，页面没完全恢复到原位。
3. 有时输入框本身被键盘挡住，看不到。

页面根链 `html / body / #root` 全部 `overflow:hidden` + `overscroll-behavior:none`；`main` 用 `h-[var(--app-viewport-height)]`（PWA standalone = `100vh`，非 PWA = `100dvh`）。

真机实测（visualViewport API，iPhone Safari）：

| 状态 | offsetTop | scrollY | vvHeight |
|------|-----------|---------|----------|
| 初始 | 0 | 0 | 699（全屏） |
| 聚焦 textarea | 353 | 393 | 346（键盘占 ~353px） |
| 失焦 | 0 | 40 | 699 |

关键算式：**`scrollY(393) − offsetTop(353) = 40` ≈ 失焦残留的 40px**——这不是巧合，见下文。

## 根因：iOS 双 viewport 模型 + iOS 26 回归 bug

### 1. 键盘只动 visual viewport，不动 layout viewport

iOS 8.2 起（WebKit Bug 141832，官方明确 "intentional"）键盘弹起**只 shrink + pan visual viewport**，**不 resize layout viewport**。目的是避免整页 reflow。

- `position:fixed` 锚定 **layout viewport**；`100vh / dvh / svh` 派生自 layout viewport / ICB → 键盘弹起时**都不变**。
- 因此停在 layout viewport 底部的 composer（无论 `fixed` 还是 flex 流式）会落在键盘后方；CSS 单位无法把它抬到键盘上方。

### 2. 聚焦时整页被推 = scroll-to-reveal（症状 1）

iOS 为把被键盘挡住的焦点元素露出来，会**强行 scroll layout viewport**（实测 `scrollY` 0→393）。这是 WebCore 顶层、操作系统驱动的行为：

- `overflow:hidden` **挡不住**——`overflow` 只约束「子容器内容能否在滚动容器内滚动」，约束不了 layout viewport **自身**的 scroll offset；`window.scrollY` 读的就是 layout viewport 的 scroll。
- `preventDefault` / `touchmove` 拦截 / meta viewport 常规值也挡不住。
- `offsetTop=353` ≈ 键盘高度（visual viewport 上沿在 layout viewport 内的偏移）；`scrollY=393` = layout viewport 的额外滚动。

### 3. 失焦不恢复 = iOS 26 WebKit 回归 bug（症状 2）

键盘收起时 Safari 把 visual viewport offset 归零了，却**没把 layout viewport 的 scroll 完全复位**，残留 ~40px。`scrollY(393) − offsetTop(353) = 40` 正是「升起时动了两个轴，收起时只归零 visual，layout 差值没清」。

- iOS 18 没有此 bug，**iOS 26 引入**；Apple Forums 800154 / 798437、WebKit 297779、Mastodon #36144 多源确认。
- **iOS 26.1 / 26.2.1 / 26.3 已修复**（Discourse 官方帖 + 多社区报告）。用户 iOS 版本 < 26.1 时，升级可能直接消除症状 2。
- JS 兜底：判断 `keyboardVisible = vv.height < innerHeight`，关闭时强制把 composer offset 归零。

### 4. 输入框被键盘挡（症状 3）

composer 停在 layout viewport 底部，键盘盖住 visual viewport 下半 → composer 落在键盘后方。iOS 没有 CSS / meta 开关让 layout viewport 跟着键盘缩（见下节）。

## 为什么 CSS / meta 救不了（iOS 全线不支持）

| 方案 | iOS Safari | 能否解决 |
|------|-----------|---------|
| `interactive-widget=resizes-content`（唯一让 layout viewport 跟键盘缩的官方开关） | ❌ 不支持（WebKit 259770 至今未实现，2026 仍 NEW） | 不能 |
| VirtualKeyboard API（`env(keyboard-inset-height)` / `overlaysContent`） | ❌ 不支持（WebKit 230225 未实现） | 不能（仅 Chromium） |
| `100dvh / svh / lvh` | ✅ 支持 | ❌ 键盘弹起时**不变**（跟踪地址栏，不跟踪键盘） |
| `visualViewport` API（JS） | ✅ 支持（iOS 13+） | ✅ **iOS 上唯一可靠方案** |

→ iOS 上**只能靠 `window.visualViewport` JS**。

## 项目现状（影响方案选择）

- composer 是 **flex 流式**：在 `ThreadPrimitive.Root`（`flex min-h-0 flex-1 flex-col overflow-hidden`）内的 `shrink-0` 容器，**不是 `position:fixed`**。
- `--app-viewport-height`（CSS 媒体查询：PWA=`100vh` / 非 PWA=`100dvh`）控制 main 高度。这套是为了处理「地址栏」，不是「键盘」——键盘在两种模式下都不改 layout viewport。
- assistant-ui web 版**无内置 iOS 键盘避让**（`KeyboardAvoidingView` 是 React Native 专用）；composer 定位完全交给应用层，扩展点是 `ThreadPrimitive.Root` / `ComposerPrimitive.Root` 的 `className` / `style`。

## 实施现状（2026-10-09 批 17 定稿，commit `215d390`）

上文「动态驱动 `--app-viewport-height = vv.height`」的全局方案**未采用**——实际落地为更局部的两个消费形态，共享同一监听单源：

### 监听单源：`web/src/lib/keyboard-inset.ts`

`observeKeyboardInset(apply)` + `computeKeyboardInset` 纯函数，实施要点即上列社区实证四条：

- `resize` + `scroll` 双监听 + window resize（横竖屏），rAF 与浏览器布局同帧；
- `visible = vv.height < innerHeight`，关闭时强制归零（绕 iOS 26 残留）；
- 公式 `innerHeight − vv.height − vv.offsetTop`，负值钳 0；
- `pointer: coarse` guard（桌面 no-op）+ 无 visualViewport 环境 no-op；dispose 取消已入队 rAF。

### 消费形态一：浮动卡片 translateY（composer，批 8 起）

composer 浮动区消费 `--composer-keyboard-offset` 做 `translateY(−offset)` 上浮——键盘弹起时 composer 已在键盘上方，iOS 判定焦点 input 可见 → 不触发 scroll-to-reveal。悬浮卡片才能用 translate；配套 `--composer-float-inset`（ResizeObserver 实测浮动区高）驱动消息列表 spacer 防遮挡。

### 消费形态二：流内全高面板 padding 缩链（批 17，文件编辑态）

编辑态面板（`mobile-l3.tsx` 两处容器）消费 `--kb-offset` 做 `padding-bottom`：flex 链整体缩短，CodeMirror `flex-1` 收缩、底部 `.aux` 工具条落到键盘上方。全高面板不能用 translate（顶部会被推出视口）。`.aux` 自身另消费 `--kb-active` 系数做样式联动：`env(safe-area-inset-bottom) × (1 − var(--kb-active, 0))`——键盘在场时被顶到键盘上方、不再贴物理屏底，chin 避让责任转移给键盘自带避让，aux 紧凑贴键盘上沿。**`--kb-active` 勿作显隐消费**（iOS 26 动画瞬态误判，composer 曾踩）；联动也不得作用于 focus 目标所在盒（`focus-within:pb-` 骤减曾致 iOS ~50% 取消键盘触发）。

### 多端分流

- viewport meta 加 `interactive-widget=resizes-content`：Android Chrome 108+ 的 layout viewport 随键盘缩，流内布局自动让位；此时 JS 公式算出 ≈0，visualViewport 路径自然休眠，双路径不打架。iOS 忽略（WebKit 259770），走 JS 路径。
- 已知语义边界（有意保留）：iOS 双指捏合会使 `vv.height < innerHeight` 假阳性 → offset 短暂膨胀、手势结束自愈（composer 同样中招、线上无感）；若真机编辑态捏合跳动明显，再加 `vv.scale !== 1` 跳过判据。

实施要点（来自社区实证）：

- 监听 visualViewport 的 `resize` **和** `scroll`（不只 `resize`——键盘动画收尾时 `scroll` 仍 fire，保证 offset 准确，LifeSG#1048）。
- 键盘关闭时用 `keyboardVisible = vv.height < innerHeight` 判断，**强制 offset 归零**绕过 iOS 26 不复位 bug（italomcangussu#16）。
- **不要用 `window.scrollTo(0,0)` 对抗** visual-viewport pan：body 被 pin 时 document scroll 本就是 0，`scrollTo` 碰不到 pan 轴，逐帧对抗只会抖动（italomcangussu#16 明确踩过此坑）——这正是之前 `mobile-keyboard.ts` 尝试失败的原因。
- composer input 的 computed `font-size ≥ 16px`，否则 iOS 聚焦会自动缩放页面（独立坑，建议同时核对）。

## 成熟库调研对照（2026-10-09，批 18）

用户真机反馈「多次收起弹开后工具条仍偶发被遮挡」并提出「是否有成熟库可用、自研不够成熟」的诉求。对市面候选做了源码级对照（toss/react-simplikit 读全四个 keyboard 模块源码；其余候选按 npm/GitHub 元数据核对）。

### 候选与结论

| 库 | 机制 | 结论 |
|---|---|---|
| **toss/react-simplikit** `useAvoidKeyboard`/`useKeyboardHeight` | visualViewport `innerHeight − vv.height − vv.offsetTop`、`Math.max(0,…)` 钳 0、resize+scroll 双监听、setTimeout 16ms 节流 + 同值去重、`translateY(−(h+safeAreaBottom))` + CSS transition | **不引入**——机制与我们同源（同公式/同双监听），但缺三样：iOS 26 visible gate（收起强制归零）、rAF 同帧、coarse guard；且 `useAvoidKeyboard` 只有 translateY 浮动形态，不覆盖编辑态流内 padding 缩链 |
| react-ios-keyboard-viewport（RyoSogawa） | iOS 专用 hook，v0.1.0（2025-04）后无版本迭代 | pre-alpha 嫌疑（版本停更 + 单一 iOS 视角） |
| @fe-eule/react-keyboard-avoiding-view | RN 概念的 web 平移 | 下载量极低 |
| @simoneggert/react-modal-sheet | sheet 专用，`env(keyboard-inset-height)` + vv fallback | 场景过窄（sheet 场景我们已有自有体系） |
| on-screen-keyboard-detector | 可见性检测 | 只有检测无避让 |

**关键认知（调研主结论）**：任何库的底层都是同一套 `window.visualViewport` API——库不改变 iOS 键盘行为，只提供打磨过的封装。react-simplikit 的公式与批 17 单源**逐字相同**（我们即源自同一批社区实证），而它**没有** iOS 26 收起残留 gate（裸 `Math.max(0,…)`——真机上会复现「收起后残留 40px 假 offset」正是我们要防的），替换 = 降级 + 增依赖。toss 库供应链面 OK（0.3.2 发布 9 天 ✓、356 stars、MIT、Toss 出品持续活跃），不是 supply-chain 拒绝，是**能力面不匹配**：两种消费形态（浮动 translateY / 流内 padding 缩链）它只覆盖前者，且缺 iOS 26 gate。

### 「成熟方案」的落地定义（回应自研成熟度诉求）

不引入库不等于维持现状：把单源打磨到「库级成熟」，具体 = ①**可观测性**——`observeKeyboardInset` 回调携带触发源（`KeyboardInsetSource`），真机诊断浮层 `keyboard-debug.ts`（默认常开，sheet-debug 先例形态 + `translateY(vv.offsetTop)` 钉在 visual viewport 顶部，键盘 pan 时仍可读数）打完整事件链（src/ih/vv/v/off/root 六字段切分候选根因空间）；②**终态鲁棒性**——`focusin/focusout` 补测（键盘开合必经焦点切换；iOS 快速连续开合时 vv 事件可能合并丢失终态，focus 时刻补一次测量；此刻 vv 尚未动，旧值写回幂等）；③测试与文档：单测/探针/研究文档（本节）。

### 诊断通道设计说明（keyboard-debug.ts）

- **候选根因空间**（通道字段切分的对象）：①gate 误杀（弹起中途 v=0）②终态事件丢失（用户操作了但 #N 停滞；focusin 有行而 vv 事件无行 = 实锤）③iOS standalone PWA 视口卡死（ih 循环间缩小不恢复 → 公式偏小 → 抬不够）④iOS 26 残留叠加（收起后 off≠0 / 下次弹起 off 剪掉残留量）⑤写入层分叉（root 读回 ≠ off）。
- **visual viewport 跟随**（本通道特有设计）：fixed top:0 浮层在键盘 pan 后落在可视区外，`translateY(vv.offsetTop)` 钉在 visual viewport 顶部——键盘弹着也能读数。
- 取证操作：用户复现「多次收起弹开后被遮挡」一次，读浮层最后几行即可定位断点层，按层修复。

**事实**：
- [CSSOM View Module（scroll delta 分层 / offsetTop 定义）](https://www.w3.org/TR/cssom-view-1)
- [MDN VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)
- [MDN meta viewport（interactive-widget 语义）](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport)
- [WebKit Bug 141832（keyboard 不 resize layout viewport 是 intentional）](https://bugs.webkit.org/show_bug.cgi?id=141832)
- [WebKit Bug 259770（interactive-widget 未实现，2026 仍 NEW）](https://bugs.webkit.org/show_bug.cgi?id=259770)
- [WebKit Bug 297779（iOS 26 fixed 元素位移）](https://bugs.webkit.org/show_bug.cgi?id=297779)
- [WebKit Bug 230225（VirtualKeyboard API 未实现）](https://bugs.webkit.org/show_bug.cgi?id=230225)
- [Apple Developer Forums 800154（iOS 26 offsetTop 不复位）](https://developer.apple.com/forums/thread/800154)
- [bram.us（fixed 锚定 layout viewport；offset layout viewport to reveal）](https://www.bram.us/2021/09/13/prevent-items-from-being-hidden-underneath-the-virtual-keyboard-by-means-of-the-virtualkeyboard-api)
- [HTMHell（vh/svh/lvh/dvh 不含键盘；interactive-widget 仅 Chrome/Firefox）](https://www.htmhell.dev/adventcalendar/2024/4)
- [tkte.ch（iOS 8.2 起隐藏键盘 / 141832 解读）](https://tkte.ch/articles/2019/09/23/safari-13-mobile-keyboards-and-the-visualviewport-api.html)

**社区经验·弱证据**：
- [SO 79758083（iOS 26 键盘收起后 offsetTop 残留 24px）](https://stackoverflow.com/questions/79758083/ios-26-safari-visualviewport-change-after-dismissing-keyboard)
- [Mastodon #36144（iOS 26 fixed 元素 ~20px 错位）](https://github.com/mastodon/mastodon/issues/36144)
- [SO 60797340（iOS modal scroll 复位 hack）](https://stackoverflow.com/questions/60797340/ios-safari-prevent-or-control-scroll-on-input-focus)
- [SO 38619762（app shell 改 position:fixed 消除 window.scrollY）](https://stackoverflow.com/questions/38619762/how-to-prevent-ios-keyboard-from-pushing-the-view-off-screen-with-css-or-js)
- [mathix.dev（visualViewport 手动偏移 fixed 元素）](https://mathix.dev/blog/fix-html-elements-on-top-of-the-ios-keyboard-using-html-css-js)
- [LifeSG/react-design-system#1048（resize + scroll 双监听）](https://github.com/LifeSG/react-design-system/pull/1048)
- [italomcangussu/iphonerepasse-pro#16（composer + transform + gate offsetTop 归零；scrollTo 对抗会抖动）](https://github.com/italomcangussu/iphonerepasse-pro/pull/16)
- [RyoSogawa/react-ios-keyboard-viewport（iOS 专用 hook 源码）](https://github.com/RyoSogawa/react-ios-keyboard-viewport)
