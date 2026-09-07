# frontend-notes

前端平台 / CSS / 移动端 / PWA 的经验沉淀。每条 =「现象 → 机制 → 标准做法 → 来源」极简四段式。

> ⚙️ 本文件独立维护以便迭代，由 `CLAUDE.md` 的 `## 前端实现约定` import。**§N 编号是外部引用锚点**（DESIGN.md、代码注释、探针脚本均按号引用）——永不删除条目、永不复用/重排编号，新条目按编号追加。2026-09-07 起压缩为极简四段式，多轮迭代细节/来源 URL/探针实现在 git history 与 DESIGN.md。

## 1. iOS 26 standalone PWA 下 dvh vs vh（视口单位与 home indicator）

**现象**（真机实测）：本项目 PWA（`standalone` + `viewport-fit=cover`）下，`dvh/svh/lvh` 都**扣**底部 home indicator chin（~34px），`100vh` 不扣（=物理全高）；顶部不扣、底部扣——不对称。

**机制**：WebKit intentional 哲学（视口单位反映"安全可见区"，常驻系统 UI 被排除；bug 141832 官方确认 intentional）；W3C css-values-4 视口变体留 UA-dependent。standalone 无动态地址栏 → `svh=lvh=dvh` 收敛。

**三大坑**：① chin gap（dvh 容器底部永远差 34px）；② 高度链 `vh`/`dvh` 混用，父 `overflow:hidden` 裁掉多出的 34px；③ 已用 dvh 再消费 `env(safe-area-inset-bottom)` = 68px 双倍。

**标准做法（vh + env 单层避让）**：根链高度（`html/body/#root`/`main`）统一 `100vh`，**不混 dvh**；`env(safe-area-inset-bottom)` 只在底部交互元素 `padding-bottom` 单点消费（背景/材质继续延伸进 chin）；顶部用 `env(safe-area-inset-top)` 避刘海。**铁律：同一方向同一元素，`dvh/svh/lvh` 与 `env(safe-area-inset-*)` 二选一，不叠加**。探测法：main 改 `h-screen` 看底部缝，桌面/Playwright 不暴露差异，必须真机。

**来源**：WebKit bug 141832、css-values-4 §6.1.2.1、Stack Overflow 79902310；DESIGN.md Safe-area 条目为本约定权威。

## 2. 色阶收敛工作流（散写 → DESIGN token）

**现象**：散写裸 Tailwind 色阶（`bg-cyan-300`、`text-slate-400`）绕过 DESIGN token，色相漂移难维护（累计 ~250 处）。

**机制**：DESIGN.md 是唯一权威源，`styles/index.css` `@theme inline` 把 token 物化为 utility；散写 = 未被设计系统管理的色相，累积即走歪。

**标准做法**：① 新代码一律 token（`surface*`/`on-surface*`/`neutral-line`/`primary`/`success`/`warning`/`error` + 角色色），禁裸色阶；② 遇散写先查 DESIGN.md 三张映射表再改；③ **分批按色族**收敛（每批独立门禁 + CSS 落盘 + DOM computed 验证 + commit）；④ **灰度按上下文**分桶（`bg→surface 档 / text→on-surface 档 / border→neutral-line`），不能机械按档位 sed；⑤ 验证视觉零变化用 `getComputedStyle` 对比 token hex（oklab 需换算）。

**CSS 落盘硬闸（强制）**：web DOM 探针必须先跑 `node scripts/ar-verify-css.mjs`（或 import `verifyCssFlushed`）三道闸（stylesheet link + content-type text/css + utility 选择器落正文）——DOM 结构断言对 CSS 完全盲，且 mtime/文件存在 ≠ 内容对；不过则整体 fail。

**来源**：DESIGN.md L243-285 映射表 + L385 禁散写；§10 为落盘问题构建层治本。

## 3. 结构关系是 state，不是渲染结构（UI = f(state) 的运用）

**现象**：布局变化（split / 跨容器移动）时，本应不受影响的元素被 React 卸载重建，WebSocket/xterm 等副作用全重连。

**机制**：React 实例身份 = **父 + key**；`key` 只在同父同类型下生效，跨父/跨类型必 unmount+mount。把树/嵌套直接当渲染结构递归，组件的父就绑死结构路径，结构一变必重建。`createPortal` 绕不开——`container` 变化仍卸载重挂子树（实测失败）。

**标准做法（扁平化）**：**结构关系收敛成 state（唯一真相），表现层用纯函数投影成扁平数组**（各带稳定 key + rect）再 `.map` 渲染——组件父固定为扁平容器，永不换父。**铁律**：凡结构变化中「会跨容器移动」或「父会换」的对象，必须提到扁平层用稳定 key。**适用**：元素有副作用生命周期（WS/播放器/canvas）或布局模型递归嵌套且需保实例稳定；纯展示、重建廉价的元素不必。

**来源**：工作台 n 叉树布局 `flattenLayout`（workbench-views.md §7.8）；反例 portal 顶层常驻方案实测失败；与 state-sync-principles.md「上下文充分性」同源。

## 4. modal scrim overlay 与 portal fiber 冒泡（统一走 Radix Dialog）

**现象**：移动端 ⋯ sheet 打开后点 scrim 会误导航打开下方卡片；迁移到 Radix Dialog 后仍复现。

**机制（真根因）**：**不是 DOM 穿透，是 React `createPortal` 合成事件按 fiber 树冒泡**——portal content DOM 在 body，但 fiber 嵌在带 `onClick` 的祖先内，scrim click 冒泡到祖先 `onClick`。探针铁证：卡片 DOM 零事件、composedPath 不含卡片，navigate 仍发生。**Radix Dialog modal=true 也同病**——body pointer-lock 挡 DOM 事件，挡不住 fiber 合成冒泡。

**标准做法（两层）**：① modal 语义统一走共享 `ui/dialog.tsx`（Radix `modal=true`），scrim/Esc/focus trap/body-lock 交 Radix，形态靠 `className` 覆盖，`onOpenChange` 是关闭统一入口；② 调用方在带 `onClick` 的祖先加 **DOM `contains` 判断**：`if (e.target !== e.currentTarget && !e.currentTarget.contains(e.target)) return;`——portal click 的 target 在 body，被忽略。**⚠️ 不能用 Overlay/Content `onClick stopPropagation` 兜底**：实测同时阻断 Radix scrim dismiss（navigate 与 dismiss 共享同一事件）。非 modal（锚定 popover、hover popover）用裸 `createPortal`，不锁。

**补充（pointer sequence 路径）**：fiber 冒泡不只走 click——`DragSourceCard` 的 `onPointerDown`→window `pointerup` 激活路径同样被 portal menuitem 的 pointerdown 穿透（Radix menuitem 渲染 `<div role="menuitem">` 非 button，`closest("button")` 判断失效）；凡 pointer sequence 激活的卡片，`onPointerDown` 首行同样加 contains 判断。

**来源**：memory `react-portal-fiber-click-bubbling`；DESIGN.md `dialog` 条目为本约定权威。

## 5. Radix `asChild` 包裹组件必须透传 props/ref（Trigger 不生效真根因）

**现象**：SettingsDialog 内嵌的 `OptionMenu`（`DropdownMenuTrigger asChild`）点击毫无反应；一度误查嵌套 modal pointer-lock / z-index 都不中。

**机制**：Radix `asChild` 用 `Slot` clone **直接子元素**并 merge props/ref。直接子是原生 DOM → props 直接落地；直接子是**自定义组件** → props 进组件 props，组件若**不展开 `{...rest}` 且不转发 `ref`** 就被吞——原生 button 拿不到 `onClick`/`aria-expanded`，Trigger 永不挂（现象：`aria-expanded`/`data-state` 均 null）。这是 `asChild` API 固有契约，非 Radix bug。

**标准做法**：asChild 直接子若是组件，必须 `forwardRef` 转发 ref + `{...rest}` 展开落 props（自身显式 `type`/`disabled`/`className` 与 rest 不冲突）。**判定**：`aria-expanded`/`data-state` 双 null → Trigger 未挂 → 查直接子是否组件未透传。build chunk 搜 `modal:!1` 只证编译产物对，证不了运行时挂载，必须探针查 DOM。

**来源**：`settings-dialog.tsx` `SelectorTrigger` 改 `forwardRef` 修复；`ui/option-menu.tsx` trigger 类型契约。

## 6. 移动端触摸滚动 = tmux copy-mode（手动发 SGR 鼠标滚轮序列）

**现象**：移动 terminal 触摸滚动要能看 attach 前的 scrollback 历史。

**机制**：桌面滚轮就是 tmux copy-mode——`tmux mouse on` + root `WheelUpPane → copy-mode -e`，xterm 鼠标模式自动转 SGR 序列（无需 JS handler；**grep 无 handler ≠ 无机制**，先查 `tmux show-options -g mouse`）。tmux `attach` 不重放 scrollback，本地 buffer 只有当前屏 ~24 行，滚 server scrollback（copy-mode）才含历史。移动 touch 是 dead path（xterm Gesture preventDefault + scrollbar 只处理 wheel），**必须手动发**同款 SGR 序列。SGR mode 1006：`\x1b[<64;1;1M`（WheelUp）/`\x1b[<65;1;1M`（Down），按帧 `M` 结尾不粘连。

**标准做法**：applyScroll 位移累加 → `Math.trunc(accum / PIXELS_PER_WHEEL)` 算序列数（`PIXELS_PER_WHEEL = LINE_HEIGHT_PX * 5`，tmux copy-mode 一次滚 5 行）；手指上滑 = WheelUp、下滑 = WheelDown；滚到底自动退出回 live。单帧连发上限 `MAX_WHEELS_PER_FRAME = 50` 防惯性刷屏。服务端零改动（tmux 自带）。

**勿再走**（每条付过代价）：滚 xterm 本地 buffer（attach 不重放）；键盘 M-Up 触发 + 超时强制退出；capture-pane 半态快照（用户否决，永不再提）；编造"服务端区分桌面/移动"解释。

**来源**：commit `089a6f7` + `4e5ecc3`；memory `web-terminal-tmux-attach-research`；`SessionDetailRoute.tsx` 触摸滚动实现。

## 7. 触屏能力（pointer）与视口宽度（viewport）是正交维度（hover 显隐 / 点击区错绑断点）

**现象**：iPad 横屏（≥1024px 触屏）这类「宽屏 + 触屏」复合设备上，操作按钮（⋯/✕）永久不可见（`sm:opacity-0` + hover 唤不醒）或点击区不放大（`max-sm:h-11` 不命中）。

**机制**：**指针能力与视口宽度正交，不能互相代理**。判定交互能力用 `(hover: hover)` / `(pointer: coarse)` 或运行时 `event.pointerType`；视口断点（`sm:/max-sm:/lg:`）只管布局结构。Tailwind v4 已把 `hover:` 包进 `@media (hover: hover)`，但 **`opacity-0`「默认隐藏」基线不在守卫内**——触屏宽屏隐藏生效、hover 唤不醒 = 永久不可见。

**标准做法（`@custom-variant` + 渐进增强）**：`index.css` 定义 `hover-capable (@media (hover:hover) and (pointer:fine))` 与 `touch (@media (hover:none) and (pointer:coarse))`。默认（触屏/未知）= 常显 + 大点击区（可达优先），`hover-capable` 才降级 hover 显隐 + 紧凑尺寸（取无害方向：误报环境只是按钮常显的视觉噪音，不是功能失效）。**边界**：hover 显隐→`hover-capable`；点击区→`touch`；菜单 popover/sheet 分流→视口 `useIsMobile`（不改）；拖放→运行时 `pointerType`（不改）。

**自动化局限**：Chromium/Playwright **无法模拟 hover/pointer media feature**——iPad 横屏场景自动化复现不了；只能桌面运行时验证 + 静态分析 CSS 包裹的 media query，触屏真机最终验证交用户。

**来源**：`composer-enter.ts` 双条件范例；DESIGN.md `action-menu` 条目 Do's/Don'ts；`scripts/probe-pointer-variants.mjs` 混合验证。

## 8. flex 高度链：`flex-1` 子要滚，父必须是 flex container（overflow 只裁不传约束）

**现象**：工作台左栏文件树/git/历史列表内容超高时**裁掉且不滚**；同位置 overview 能滚（它用 `h-full` 直接取父高，不依赖 flex）。

**机制**：滚动三要素=① `overflow-y-auto` ② 确定且被约束的高度 ③ 内容超高。父是 flex item（被约束）但**内部不是 flex container** 时，子的 `flex-1` 是死属性，按内容高撑开，父 `overflow-hidden` 只裁剪——**overflow 给不了高度约束，传约束靠 flex（`flex-1` + `min-h-0`）**。`min-h-0` 是 flex item 可收缩前提（默认 `min-height:auto`=内容高不可压缩）。

**标准做法**：① 承载不同主体的父改 `flex min-h-0 flex-1 flex-col overflow-hidden`（`flex-1` 子与 `h-full` 子两类都对，一处修复覆盖全部 tab）；② 列表根 = `flex h-full min-h-0 flex-col` + header `shrink-0` + 列表区 `min-h-0 flex-1 overflow-y-auto`；③ **判定铁律**：想内部滚动，从该元素沿父链上溯到确定高度源逐层核对——每层 flex item 有 `min-h-0`、每个要约束子高的容器自身是 flex container（或子改 `h-full`）。

**诊断**：Playwright 取滚动容器 `scrollHeight`/`clientHeight` + 设 `scrollTop=80` 读回实测可滚性，再遍历父链打印每层 `display`/`flex`/高度——一眼看出断在哪层。内容不足时需造 fixture 才能触发溢出验证。

**来源**：commit `fix(web): 工作台左栏…补齐高度链`；与 §1（高度链混用单位）同属「整条链逐层核对」家族。

## 9. CSS animation `fill-mode: none` 导致退出动画结束回原位闪动（exit 动画要 fill-mode-forwards）

**现象**：移动端全屏浮窗关闭动画播完滑出屏幕后，闪现一帧原位（满屏可见）才消失；进入动画无此现象。

**机制**：`tw-animate-css` 的 `.animate-out` 默认 `--tw-animation-fill-mode:none`——动画结束元素**回未动画初始态**（`translateY(0)`、可见）。时序断裂：动画播完在屏幕外 → fill-mode:none 瞬间回原位 → `animationend` → React 重渲染切 `hidden` 在**下一帧**——中间那帧 paint 出「回原位可见态」→ 闪。进入动画终态恰等于原位，无回弹差，无此问题。

**标准做法**：**退出**动画 className 追加 `fill-mode-forwards`（`animate-out … fill-mode-forwards`），结束保持终态（屏幕外不可见）直到 React 切 hidden；进入动画不需 forwards。`both` = backwards+forwards，exit 只需 forwards。**排查要点**：凡「动画播完闪一下/跳回/鬼影」先查 `animation-fill-mode`——默认 none 与 React unmount 时序差叠加即闪；DevTools 临时加 forwards 验证消失即确认。fill-mode 独立于 dismiss 同路径（DESIGN.md `overlay-dismiss-symmetry`）维度。

**来源**：commit `fix(web): 移动浮窗关闭闪动…`（`file-browser.tsx` + `git-diff-viewer.tsx`）；`tw-animate-css` 源码。

## 10. vite build --watch 漏 CSS 落盘治本：`cssCodeSplit: false`（build-watch-css-not-flushed）

**现象**：`ar-dev-web.sh` 的增量 build 偶发只写 JS 漏写 CSS——preview 把 404 SPA fallback 成 `index.html`（`Content-Type: text/html`），浏览器把 HTML 当 CSS 解析 → **排版全乱但 console 无 JS 报错**，极易误判业务回归。

**机制**：vite 8（rolldown）增量 build 对「内容/hash 未变的 CSS chunk」跳过重 emit，产物被清后增量再不补（rolldown CSS watch 依赖跟踪仍在 RFC #8403，无上游 config 修复）。另有并发污染独立根因：多个 `build --watch` **孤儿进程**并发写 dist 竞态吞 CSS。**诊断看命令全名**（`ps -eo pid,args | grep "vite build --watch" | grep -v grep`）：正常态 2 个 vite 进程（1 build --watch + 1 preview 同脚本拉起），2 个都是 build --watch 才是污染；别用 `pgrep -cf` 计数（grep 快照竞态假阳性）。

**标准做法**：① **治本 `build.cssCodeSplit: false`**（`web/vite.config.ts`）——CSS 作单一入口副作用每次 build 必 emit；单页 SPA 无副作用（precache 25→24）。② **改 vite.config 后必须重启 dev web**：watch 启动时只加载一次 config，增量不重新评估。③ 兜底 `touch web/src/main.tsx` 触发完整 rebuild；**绝不 `touch web/src/index.css`**（文件不存在，会建 0 字节孤儿）。④ **硬闸**：改 web 包内任何文件后必跑 `node scripts/ar-verify-css.mjs`（与 format/lint/typecheck/test 同级，无条件跑）——见 §2。⑤ **交付 checklist（commit/push 后交用户前）**：`curl -sI localhost:43012/assets/<css> | grep content-type` 必须 `text/css`；`text/html` 则 touch main.tsx + 轮询到 text/css 再交付。**clean build 验证 ≠ dev 交付验证，两者都要**。增量两面：保留废弃 utility（色阶验证须 clean build 才反映真实集合）、缺新 utility（新 utility 验证前 touch main.tsx）。

**来源**：commit `89b3a45`；本条目自包含（跟 git 走跨机器不丢），机器本地 memory 已废弃。

## 11. 返回 class 字符串的 helper 必须过 twMerge（纯拼接被 Tailwind v4 生成顺序覆盖）

**现象**：`actionButtonClasses()` 纯字符串拼接 className，两个独立症状：调用方传 `size-14 rounded-full` 被 base 的 `h-auto`/`rounded-xl` 覆盖（FAB 变矩形）；传 `hidden lg:inline-flex` 被 base 的 `inline-flex` 覆盖（按钮永不隐藏）——都「看起来像调用方没生效」。

**机制**：Tailwind v4 同属性多个 utility 冲突时按 **CSS 源顺序（生成顺序）定胜负**，与 className 字符串拼接先后无关——Tailwind 内部 utility 排序决定，纯拼接无法保证覆盖方向。包装 `<Button>`（内部有 `cn`=twMerge）的封装层恰好掩盖问题，原生 `<button>` 直接用 helper 才暴露。

**标准做法**：任何「接受 className prop 拼进返回串」的 helper（`actionButtonClasses`、variants 函数、图标 wrapper），返回前必须 `cn(base, className)` 收尾——twMerge 按传入靠后覆盖靠前合并同属性 utility。**判定**：className 传了但样式不生效时，先确认目标元素是否经 helper 拼串而非组件内 `cn`。

**来源**：commit `f4fd557`；与 §5 同族「封装/拼接层悄悄吞掉调用方意图」，根因在机制层不在调用方。

## 12. 底部 nav 按内容条件让位：`group-has-[marker]`（已下线，范式保留）

> ⚠️ **场景已下线（2026-08-16）**：FAB 全量迁 header 右上角，`MobileFab` 已删、让位 CSS 已清理（见 DESIGN.md `floating-action-button`）。**本条目保留 `:has()` 条件让位通用范式**，未来「按内容条件让位」场景（浮动工具条/角标）整体复用。

**范式**：① marker class 挂条件对象底座（机械标记名如 `mobile-fab`，不被业务引用）；`group` 加在实际渲染被让位元素的祖先上；条件规则 `group-has-[.marker]:…`。② **让位 = 被让位元素自身收窄居中**（capsule `max-w-[calc(100vw-…)]` + `mx-auto`），优于 padding 左推（整体平移、出现/消失突兀），远优于永久让位（污染无 FAB 页）。③ **max-width 只设上限不设宽度——`width:fit-content/auto` 的元素只会缩到内容宽、不会主动撑到 max-width；要拉满必须配 `w-full`**（Tailwind v4 中 `.w-fit`/`.w-full` 是独立 utility，切换只改 width 来源）。④ 测通三态：有/无条件对象 + 切换时位置零跳变（center 恒定是核心价值）。

**来源**：迭代史 `f4fd557`→`c40522f`→`f0476c3`→`6b78b7b`（收窄居中→calc 自适应→居中拉满→w-full 真根因），细节 git log；DESIGN.md `floating-action-button`。

## 13. 移动端文件树 cwd 记忆：`atomWithLocalOnlyStorage` 按 key 持久化 + error 触发回退

**现象**：移动文件树进 A→B→C→D 后 PWA 放后台较久/刷新，重开回到根目录。

**机制**：cwd 原是组件内 `useState`，reload 即丢；`atomWithLocalOnlyStorage`（`workbench-model.ts`，= `atomWithStorage` 但不带 `storage.subscribe`，不跨窗口同步、纯 localStorage 落盘）实现持久化。`FilesPanel` 契约：`currentPath = controlledPath ?? internalPath`——调用方传 `currentPath`+`onPathChange` 即受控模式（可跨卸载保活），不传退内部 state。

**标准做法**：① 原子按域分组：`Record<string,string>` key = projectKey/scope.key——切项目天然隔离不串项目，**取代 derived-state 重置**；② 组件受控化（读 `atom[key] ?? ""`、写 spread），未传受控 prop 的调用方零改动；③ **路径不存在回退（仅受控模式）**：effect 依赖 `files.error`——持久化目录被删时 `listProjectFiles` 抛错 → `goToPath("")` 清记忆回根目录并同步清 atom；`queryKey` 变化时新查询 pending、error 归零不误触发。**判定**：受控 prop 是「跨卸载/刷新保活」开关；桌面左栏无此诉求不引入。

**来源**：`scripts/probe-files-cwd-memory.mjs`（6 断言）；与 §3 同族「状态该进持久化层就进，别留在渲染层随生命周期丢失」。
