# Claude2 iOS Safari 键盘与 viewport 问题调研

iPhone Safari 上 claude2 session detail 的 composer（输入框）键盘交互问题的根因调研。结论区分「事实」（规范 / WebKit bug / MDN / web.dev / Apple）与「社区经验·弱证据」（Stack Overflow / 博客 / GitHub PR）。

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

## 方案方向（待定，未实现）

唯一可靠的 iOS 方案：用 `window.visualViewport` **动态驱动 `--app-viewport-height = vv.height`**（并处理 `offsetTop`），让整个 app 高度跟随可见区。composer 是 flex 流式，会自动落到可见区底部（键盘上方），iOS 就不再需要 scroll-to-reveal，症状 1、3 一起解决。这与现有 `--app-viewport-height` 变量同构，只是从 CSS 媒体查询改成 JS 动态派生。

实施要点（来自社区实证）：

- 监听 visualViewport 的 `resize` **和** `scroll`（不只 `resize`——键盘动画收尾时 `scroll` 仍 fire，保证 offset 准确，LifeSG#1048）。
- 键盘关闭时用 `keyboardVisible = vv.height < innerHeight` 判断，**强制 offset 归零**绕过 iOS 26 不复位 bug（italomcangussu#16）。
- **不要用 `window.scrollTo(0,0)` 对抗** visual-viewport pan：body 被 pin 时 document scroll 本就是 0，`scrollTo` 碰不到 pan 轴，逐帧对抗只会抖动（italomcangussu#16 明确踩过此坑）——这正是之前 `mobile-keyboard.ts` 尝试失败的原因。
- composer input 的 computed `font-size ≥ 16px`，否则 iOS 聚焦会自动缩放页面（独立坑，建议同时核对）。

## 来源

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
