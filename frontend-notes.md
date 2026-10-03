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

## 14. Radix Portal 子树的 DOM 挂载晚于宿主组件的 useEffect（ref callback 作 state 才可靠）

**现象**：MobileSheet 的拖拽交互 effect（`useEffect` + `useRef` 判 `if (!ref.current) return`）线上从未生效——探针全绿但真机行为不变，用户三轮反馈「拖不动」。诊断实锤 effect 跑时 `contentRef.current` 仍为 null，且此后依赖（`[open]`）不再变化 = **永不重绑**。

**机制**：Radix Dialog 的 Portal/Content 挂载由内部 Presence 状态驱动，**晚于宿主组件同一轮的 `useEffect`**——「ref 一定先于 effect 赋值」的 React 保证只覆盖**同一 commit 内已渲染的 DOM**，Portal 子树晚一个 effect 刷时 ref 仍为 null。effect 依赖里没有「DOM 就绪」信号，就不会有第二次机会。

**标准做法**：**需要挂 DOM 的副作用，DOM 就绪信号用 state ref callback**（React 官方模式）：`const [node, setNode] = useState(null)` + `ref={setNode}`，effect 依赖 `[node]`——挂载时 setState 触发重跑、卸载时 React 先置 null 再跑 cleanup（顺序安全）。`useRef` 只适合「effect 必然晚于 DOM 就绪」或不需要在 effect 里用 DOM 的场景。**判定**：effect 里 `if (!ref.current) return` 且依赖不含 DOM 信号 = 潜在永不生效，逐个排查。诊断法：`getEventListeners`（CDP `Runtime.evaluate` + `includeCommandLineAPI`）直接列 DOM 上已注册 listener，对比「应注册」清单即知绑没绑上。

**来源**：§6.12p 三轮真机反馈（`52af7aa` preventDefault 空转 → `1c50d91` 修绑定 + touch events 直驱）；redesign-v2.md §6.12p-③。

**勿再走（第四轮真机实证，`5e56d71`）**：「iOS pointer events 派生层不可控 → 改 touch events 直驱」的推断被真机否定——**pointer events 驱动在 iOS 有效，原生 touch events 直驱反而完全无效**（机制未定论）。iOS 拖拽手势的正确组合 = **pointer events 驱动 + non-passive touchmove preventDefault 防滚动抢占**（prevent 判断读 dragRef，绑定修好后才真正生效）；真机「拖动有回弹/不跟手」= pointercancel 中断拖拽走回弹分支，Chromium 探针不复现 cancel，勿据探针推断真机手势行为。

## 15. 图标单轨 Lucide：ShellIcon 名契约不变、源全量换代（原双轨并存已收口）

**现象**：v1.4 图标系统换代（设计包 spec §10.3）曾双轨并存——新图标走 Lucide 管线、存量 29+ 手绘 SVG 面图标（20 网格 stroke2 圆头）继续消费；2026-09-29 真机反馈②「图标理应都采用 Lucide 标准」后**手绘轨全量退役**，双轨收口。

**机制**：现单轨 = Lucide 管线：`scripts/build-icons.mjs` ICONS 白名单（38 个 lucide 名）生成 `web/src/assets/icons.ts`（24 网格 stroke-2 圆头，源 lucide-static，生成物进 git、runtime 零依赖）。`<ShellIcon name>` 保持 SF 名契约（调用点零改动），内部 `TO_LUCIDE` 映射（SF 名→lucide 名）+ `<LucideIcon>` 同源消费；`data-icon` 水合器仅供非 React 静态 DOM 场景。仅存手绘件 = anthropic/openai 品牌 fill 型 logo（Lucide 无对应物，政策不加品牌件）。**同名不并存**（sparkles 曾两轨都有）已随换代消除。

**标准做法**：① 新图标一律 Lucide 管线（`build-icons.mjs` ICONS 白名单加名 → 重跑生成 → `<LucideIcon>`）；② ShellIcon 消费点加新图标 = TO_LUCIDE 加映射 + 白名单加名，不新增 `.svg`；③ 禁止手写 SVG path 模仿 Lucide 风格（网格规格不同，改了也是两不像）；④ 品牌件（provider logo）例外走 `BRAND_SVG`。

**来源**：v1.4 拍板④（§6.13）；批1（`62cb980`）管线落地；第四批反馈②全量换代（`f93b2b6`，§6.13）；frontend-notes §N 编号契约。

## 16. tw-animate-css 的 timing 只能靠自定义属性注入（shorthand 会重置长属性）

**现象**：给弹层 `.animate-in` 换 spring 缓动时，直写 `[animation-timing-function:var(--spring-standard)]` 或 `[animation-duration:525ms]` 都无效——computed 仍是 `ease` / 默认时长，弹层看起来没换动画。

**机制**：`.animate-in` 是 **animation shorthand**（`enter var(--tw-animation-duration,var(--tw-duration,.15s)) var(--tw-ease,ease)`）。CSS 规范里 shorthand 会**重置其未写出的长属性为初始值**，而 shorthand 声明与长属性声明的胜负按 **cascade 源序**（而非属性粒度）判定——所以同在 `data-[state=open]:` 变体下，谁在后谁赢，长属性写法不可靠。**自定义属性不参与 shorthand 重置**：往 `--tw-ease` / `--tw-animation-duration` 里塞值，shorthand 消费时就取到你的值。

**标准做法**：timing/duration 一律走变量注入 arbitrary 类——`data-[state=open]:[--tw-ease:var(--spring-standard)] data-[state=open]:[--tw-animation-duration:var(--spring-standard-duration)]`。**注意 Tailwind 会把三处写同一串的 arbitrary 合并成一条共用规则**（popover/dropdown/mobile-sheet 实测只有 1 条），断言产物规则数时别按消费点计数。不支持 `linear()` 的引擎在使用点 IACVT → 回退 initial(ease)，与改造前持平。

**动效单源 = `web/src/styles/index.css`**：本批（批A）曾按此注释的预留引入 JS 侧 `motion/tokens.ts` 镜像 + motion 库，**review 后整体摘除**——实施下来五批动效全走纯 CSS、零 JS 消费方，而 LazyMotion 与静态 import 同属一个 barrel 导出导致树摇失效（115KB min = 29% entry chunk 死重，摘除后 entry 397KB→292KB）。曲线/时长 token 现只此一处 CSS 定义，**不再有 JS 镜像**（故也不存在两处漂移问题）；reduced-motion 兜底亦纯 CSS（下文 §14 站点级 media query），MotionConfig 双保险一并消失。

**来源**：批B 弹层 spring（`4683116`）；motion 摘除 = `4d4772c`（perf review P0-1），详见 `docs/design/redesign-v2.md` 动效段「motion 库摘除」小节；DESIGN.md overlay 动效条目。

## 17. 列表入场交错用纯 CSS nth-child（高频 re-render 区零运行时）

**现象**：想给会话/文件列表加「首次挂载交错淡入」时，若用 JS 驱动 variants（motion stagger），列表行会随 WS 状态点/hover/追加高频 re-render——每帧跑 JS 编排，开销白付。

**机制**：**CSS animation 只在元素创建时播一次**，同 key 的行复用 DOM 不重播（React 更新属性不触发 animation 重跑）；而数据追加产生新 key = 新 DOM = 自然获得同款淡入，语义恰与「新消息进入」一致。代价为零运行时。stagger 用纯 CSS `nth-child(n)` 递增 delay 表达，delay 规则 `calc(var(--stagger-step) * n)`（步进 token 挂容器，改值只动一处）。

**⚠️ 但 `insertBefore` 移动 keyed DOM 会重播**（批C review P1 实锤）：React 重排一个已存在 key 的行（不是新建）会把它**从文档摘除再插回**，浏览器视作**新元素** → CSS animation 从头重播，backwards 填充的 `opacity:0` 阶段会**闪一下**。**判定**：列表按**动态字段**排序（如 `lastActivityAt`，WS 活动让行前移）= 有真实重播面，**不能挂 stagger**；只挂**排序稳定**的列表（服务端排序口径全用稳定字段，如项目名 localeCompare → 类型 → createdAt 升序 / 文件树名字序）。history-list 因此撤除。

**标准做法**：容器挂 `.animate-stagger-rows`，行组件零改动（不传 props、不包 m）。**fill 必须 `backwards` 不能用 `both`**——`forwards`/`both` 会在播完后以动画终态**持续压过后续 transform**（拖拽行跟手位移被 `translateY(0)` 锁死）；`backwards` 只覆盖 delay 期间的 from 态，播完释放。delay 递增到第 8 行后用 `nth-child(n + 9)` cap（实测 28ms×8 = 224ms 封顶），防长列表尾部行等太久。配套 reduced-motion 兜底：站点级 `@media (prefers-reduced-motion: reduce)` 把 `animation-delay` 压 0s、duration 压 0.01ms。

**来源**：批C（`dc8a2ff`）+ 撤 history-list（`4d4772c`）；`scripts/probe-stagger-entry.mjs` 11 断言（含 `animationFillMode === "backwards"` 防回退 + history-list 无 stagger 防回归）；DESIGN.md 动效段。

## 18. grid 轨道 transition 做布局开合动画（拖拽期间必须摘 transition）

**现象**：右栏折叠/展开想要滑动动画，但同一个列宽同时被 gutter 拖拽 1:1 改——直接给容器加 transition，拖拽就变成「以 280ms 追指针」，完全不跟手。

**机制**：`grid-template-columns` 的轨道列表里，**同值轨道不插值、长度轨道才插值**——`250px minmax(0,1fr) 22rem ↔ 250px minmax(0,1fr) 0px` 只有第三轨在动，前两轨静止，所以 `transition: grid-template-columns` 是干净的。列宽用 CSS 变量承载（`var(--workbench-right-col)`，模板裸引用——**再包 `minmax(var(...))` 会嵌套非法、整条声明被丢→退化成单列全宽**，探针实测过）。

**标准做法**：宿主用 state 记录「是否连续改宽中」（gutter 的 `pointerdown`/`pointerup`+`pointercancel` 经 `onResizeStart`/`onResizeEnd` 通知），期间摘掉动画类。**键盘长按方向键同属「连续改宽」**（perf review P2-6 修正：keydown 20–30 次/秒连续重定目标，不摘则每帧全 grid 重排 + 280ms 追指针）——`onKeyDown` 摘类、`onKeyUp` + `onBlur` 恢复（**漏恢复会让下一次程序化开合丢过渡**）；单击步进随之变为即时到位（键盘 = 精确调整语义，可接受）。折叠方向不必自己做退出动画：让中栏 `minmax(0,1fr)` 的扩张自然承接（同时保住「收起态 aside 不渲染 = 零 query」的优化），符合「离开快」取向。

**⚠️ 可聚焦 separator 契约**：`role="separator"` + `tabIndex={0}` 是键盘方向键通道**可达的前提**——只写 `onKeyDown` 而 div 不可聚焦 = 键盘通道死路（本仓 gutter 曾如此：M13c 补了键盘逻辑但两个属性一直缺，直到批D 探针实抓才修）。`aria-valuenow/min/max` 报告当前栏宽。

**来源**：批D（`fbd789a`）+ 键盘摘类（`4d4772c`）；`scripts/probe-grid-panel.mjs` 14 断言（展开/折叠 `transitionrun` 事件 / 拖拽与键盘摘类跟手 / ← 键 +1rem 步进 / reduced-motion）。**中间值采样断言有竞态**——Node↔页面往返可慢于 280ms 过渡窗口，只能读到终态 = 假 fail；改 `transitionrun` 事件断言（**只有真过渡才派发**，瞬切无事件）。

**⚠️ 全屏入场动画期间的几何断言（移动端动效批新增）**：元素带 `translateY(100%)` 级入场（如 mobile-sheet 全程升起）时，**动画播完前元素在视口外**——`boundingBox()` 落屏外（实测 sheet 内 menuitem y=845.8 > 视口 844），`mouse.down` 不命中任何元素 = 无 `:active` = 按压断言恒 none，且无 `transitionrun`。**先等 enter 时长 + 余量再取几何**（`waitForTimeout(450ms + 200ms)`）。小位移浮起（16px）不踩此坑，改大位移入场时要回头检查既有几何断言。

## 19. Tailwind v4 的 `scale-*` 生成独立 `scale` 属性（不是 transform）

**现象**：断言 button `active:scale-[0.97]` 生效时读 `getComputedStyle(el).transform` 是 `none`，以为没生效；实际反馈效果正确。

**机制**：Tailwind v4 的 `scale-*` / `translate-*` / `rotate-*` utility 生成**独立的 CSS `scale`/`translate`/`rotate` 属性**（W3C individual transform properties），不再拼进 `transform`。**好处**：与 `transform` 并存互不覆盖（弹层 enter 的 keyframes `transform` 与定位 `translate` 可叠加）。**坑**：验证脚本/断言必须读对应的独立属性，读 `transform` 恒 `none`。

**标准做法**：断言 `scale` 读 `getComputedStyle(el).scale`。**transition-property 必须列 `scale` 而非 `transform`**——transition-property 的 `transform` 对独立 `scale` 属性**零作用**（探针实测按下瞬切：中段采样即得终值 0.5，无插值）；要按压动画必须显式列入 `scale`（本仓 `transition-[scale,background-color,box-shadow]`）。测 press 态要等过渡播完（默认 150ms）再采终值，并**加一条中段采样读中间值**的断言（实测 0.979116）——这是「过渡真实在插值」的证据，专防退化成瞬切。

**来源**：批E（`fbd789a`）；`scripts/probe-button-press.mjs` 6 断言（含中间值插值防护）。

## 20. 封装 helper 的裸 `transition` 会经 twMerge 覆盖组件 base 的收窄值

**现象**：把 `ui/button.tsx` 的 `transition-all` 收窄成三属性后，弹层按钮的 computed `transitionProperty` 仍是 **23 属性大表**（含 display/content-visibility/overlay/pointer-events），收窄完全没生效。

**机制**：`actionButtonClasses()`（shell-primitives.tsx）的 base 串里有**裸 `transition`**（= transition-all 的 23 属性表）。它作为 `className` 后传给 `<Button>`，组件内 `cn(base, className)` 走 twMerge——**后传者覆盖前者的同属性 utility**，于是 helper 的裸 `transition` 盖掉了 cva base 里刚收窄的三属性 arbitrary。与 §11 同族：封装/拼接层悄悄吞掉调用方意图。

**标准做法**：收窄/替换 transition 时，**全局搜同族 helper 的 transition 写法一起改**（`rg -n "transition-all|[^-]transition[ \"\`]"`），不要只改组件定义。**属性列表要写 `scale` 而非 `transform`**（§19 机制）。判定：改了组件 base 但 computed 无变化 → 查调用链上有没有经 helper 拍串的后传 className。

**来源**：批E（`fbd789a`）review 自查发现；与 §11 同族。

## 21. CSS 动画 cancel 后按样式匹配重建：手势接管入场动画须摘类断匹配（WebKit 分歧行为）

> 「打开即下拉」的**修复假设之一（动画层）**：机制真实存在、摘类修复保留为防线，但**真机实测未解决该 bug**——根因另有其处，见 §22 的证据纪律。

**现象**：mobile-sheet「打开即下拉」真机必然失败（450ms 全程升起 enter 播放中按住 grab 下拉，sheet 不跟手，动画播完才跳到手指位）；Chromium 探针与诊断脚本全绿（动画中拖 t=100ms inline=`translateY(40px)` 跟手、`getAnimations()=[]`），复现不了。

**机制**：`element.getAnimations().cancel()` 取消 CSS 生成的动画后，若 `animation-name` 仍在样式上匹配，**下次样式更新时浏览器立即重建动画实例从头重播**（CSS Animations + Web Animations 规范语义；Chromium 不重建——引擎行为分歧，WebKit 侧 results.webkit.org 294899@main 2025-05 变更佐证）。拖拽用 inline `style.transform` 跟手，但重建实例的 keyframes transform 压过 inline（animation 层级高于普通声明）→ sheet 按动画轨迹走 = 拖不动。cancel 只在 Chromium 有效。

**标准做法**：手势接管入场动画时，**cancel 之外必须让样式失配**——React state（`enterKilled`）驱动 className 条件摘掉 `animate-in` 类串（`animation-name` 不再匹配 = 动画死亡且任何引擎不可重建），cancel 保留（Chromium 即时生效）；动画不可能再播的时机重置 state（closed 态下 `data-[state=open]` 变体失配，重置无重启面；exit 类串独立不动）。**否决** inline `animation: none`：回弹（清空→重建重播升起 / 不清→压死 `animate-out` 退出）与 dismiss（恢复→enter 重建闪烁）三路径死结。**探针法（WAAPI 定格）**：验证「动画运行期手势接管」时，自然时序窗口（~17px 薄热区 × spring 升速）下 Playwright `boundingBox` 往返必 race 输（down 落点错过热区、inline 恒空，实锤）——**页内 `getAnimations()` 后 `a.pause(); a.currentTime = 中段时刻` 把动画定格成确定性 fixture**，手势对静止元素执行；cancel+摘类对 paused 动画同样生效。与 §18「等 enter 播完再取几何」同族：把不可重复的动画时序变成可断言的确定态。

**来源**：commit `6aa7c27`；MDN getAnimations；results.webkit.org 294899@main；redesign-v2.md 动效段「打开即下拉」修复小节。**注意**：此修复经真机实测**未解决**该 bug（用户否证），保留为防线而非根因。

## 22. 手势 bug 的证据纪律：真机数据优先于推理修复（「打开即下拉」两轮假设均被否证）

**现象**：mobile-sheet「打开即下拉」真机必然失败，前后修了近十轮仍失败；两轮「根因」修复（`6aa7c27` 摘类、`bdce488` 热区分档）探针全绿但真机均无效。

**教训（两轮错误推导的代价）**：①动画层假设（§21 WebKit cancel 重建）——机制真实但非此 bug 根因；②事件层假设（手指落点赶不上热区升起 → pending 从未建立）——**在无任何真机证据下把用户的手势落点写进失败链，是越界推测**，用户明确其测试操作没有问题。两条失败链都被「探针全绿」的假象支撑：Chromium 探针复现不了 WebKit 真机行为，探针只能证「修复在该路径上生效」，不能证「它命中真机断点」。

**标准做法**：**真机反复失败的 bug，停止基于推理的第 N+1 轮修复，先把断点定位交给真机第一手数据**——埋诊断通道（本项目 `sheet-debug.ts`：默认常开的浮层——PWA standalone 注入不了 URL 参数，flag 通道不可靠；打手势事件链：down 热区/pending → take 接管 base → chk inline-vs-视觉一致性（不一致 = 动画压制实锤）→ up·PCANCEL 判定），用户复现一次即读出断在哪一层，再按层修复。辅助修复（不依赖根因）可同时交付：接管视觉续接（base = cancel 前后视觉顶差，inline 写 base+dy，消「从升起中段瞬跳到手指位」）。判定口诀仍有效：**手势 bug 先问「pending 到底建没建立」，再问「建了之后跟不跟手」——两问分属事件层与动画层**；但答案要从事件链数据来，不从推理来。**用户的测试操作不是变量**——把「手指落点不准」类推断当根因 = 质疑测试能力，绝对禁止。

**取证结果（2026-10-03，根因实锤并修复）**：用户真机日志「第一次下拉完美，后续全部 `down zone=content play=0 pend=NO`」——第一次成功 = 恰好赶上升起动画 450ms 窗口（`play=1` 宽热区分支）；后续被拒 = 动画播完（`play=0`）+ 手指自然落在内容区 → 走「播完后窄热区拒绝」分支。**人的「打开→看到→按下拖」反应必然超过 450ms = 必拒**——这才是「必然失败」的真根因，前两轮修复（摘类/升起期分档）都没碰这个分支所以全部无效。修复（`e1ae5a6`）= 播完后按内容可滚性分档（`hasScrollableContent`：不可滚整面可拖、可滚保窄热区）+ 上滑放弃手势 + pending 失联清理（§23）。教训补全：**埋点日志的字段要为「切分候选空间」设计**（zone/play/pend 三个字段恰好完成五层候选空间的切分）。

**来源**：commit `6aa7c27`/`bdce488`（两轮被否证修复）+ `1fcadbe`（视觉续接 + sheet-debug 通道）+ `e1ae5a6`（根因修复）；与 §14（拖拽绑定四轮调优）、§21（动画层机制）、§23（pending 失联）同链。

## 23. 手势 pending 的失联清理：未 capture 的 pending 必须在指针离开时放弃

**现象**：mobile-sheet 起手面扩到内容区后，探针 Part 1 按压测试后的「取消」点击必挂——sheet 被瞬间拖下 73px 再回弹，Playwright retry 56 次到超时；真人操作中同类残留会把「点击其它按钮时的前置移动」判成拖拽把 sheet 拖走。

**机制**：pending 阶段**未 `setPointerCapture`**（capture 推迟到越过起步阈值的接管时刻，以保住热区按钮的小位移 click 合成）——指针移出元素后 pointermove/pointerup 的 target 在元素外，React `onPointerMove/Up` 收不到，**pending 在 ref 里残留**。后续任何 move（哪怕来自完全无关的点击前置移动）都被判成「down 点 → 当前位置」的拖拽起点，以全程位移瞬间接管。此前 content 区从不建 pending，缺陷潜伏；起手面扩大后常态化暴露。

**标准做法**：**capture 前的 pending 手势，指针离开元素边界即放弃**（`onPointerLeave` 判 `phase === "pending"` 清回 idle）；dragging 期有 capture（leave 被抑制）不受影响。通用式：**手势状态机的每个非终态都必须有失活路径**——down 与 up/cancel 组不成对时（指针移出元素是最常见的失联），状态必须能自愈。

**来源**：commit `e1ae5a6`（起手面分档修复的伴生回归，探针 Part 1 实抓）；与 §14（绑定）、§22（取证纪律）同链。

## 24. 手势松手的速度继承：回弹用弹簧 rAF 积分，固定时长 ease-out 无速度信息必然假

**现象**：sheet 拖拽回弹无论松手速度（慢拖收回 vs 快甩未达 dismiss 阈值）都是同一条固定 `200ms ease-out`——「无论什么速度都一样的回弹，感觉很假」。

**机制**：CSS transition/animation **没有初速度通道**——`transition: transform 200ms ease-out` 从起点到终点的曲线形状与「手指此刻多快」无关；velocity handoff（松手动画必须以手指速度继续）只有 JS 驱动才做得到。参数：response 300ms 临界阻尼（k=(2π/T)²，c=2√k，单位制 px/ms），半隐式欧拉 rAF 积分，初速度 = 最新 pointermove 的瞬时速度。

**标准做法**：①**积分抽成导出纯函数**（`springStep`/`simulateSpringBack`），运行时 rAF 与单测共用同一份代码——**CDP 输入节流做不出高松手速度**（Playwright 4 步快甩只派发 2 个 pointermove，实测 v0=0.17px/ms；浏览器有输入合并），速度继承的数值验证（v0=1.2 → 峰值>x0+6 的下冲过冲）在单测，浏览器探针只断言「回弹发生且逐帧收敛、inline 清空」；②弹簧 rAF 句柄在**拖拽再接管/关闭/DOM 卸载**三处取消，防旧弹簧跟新手势或 exit 动画抢 transform；③起点读 computed transform 的 m42（presentation value）。

**来源**：commit `f1f99ed`（用户反馈「回弹很假」）；apple-design §5 velocity handoff；与 §22（取证纪律）、§23（pending 失联）同链。

**速度测量的另一半（`e7fb156`，apple-design §2 审查补正）**：velocity handoff 的「速度」必须是**窗口净速度**（从松手时刻回看 ~100ms：位移 ÷ 时间），不是最后一次 `pointermove` 的瞬时值——真实手指慢拖停停走走，停顿期没有 move 事件，旧瞬时速度会被当作松手速度注入弹簧 → sheet 先向下冲一截再回弹（用户「慢拖回弹好奇怪」的真相）。iOS `UIPanGestureRecognizer.velocity()` 同款语义：停顿自然计入分母（停住 300ms 松手 = 0 ÷ 300ms = 0）。判定的速度（dismiss 投影）与动画的速度（弹簧初速）必须共用同一值，否则「看起来该收起却弹回」或「弹回却带甩劲」。

## 25. motion `stop()` 的「最后一写」：已在 rAF 队列的回调仍执行一次，同步接管后必须同帧 rAF 矫正

**现象**：mobile-sheet enter 升起中被拖拽接管——moveDrag 接管分支顺序正确（读 frozenY → `stop()` → 写 inline = frozenY+dy），但下一帧 inline 被 motion 改写回自己的轨迹值（升起方向倒退 ~14px），探针 trail 逐帧实抓：接管写入 60.24 → 下一帧 46.47。

**机制**：motion（13.4.4 实测）的 `controls.stop()` **同步置停止标志、阻止后续帧注册，但阻止不了「stop 调用时已在 rAF 队列中的回调」**——该回调仍执行一次并写 inline。接管事件（pointermove 任务层）与 motion 的已排队 rAF 常落在同一帧：任务先跑（接管写入），帧内 motion 回调后跑（覆盖）。**不是 bug**，是 rAF 驱动动画库的固有时序面；CSS 时代 `cancel()` 语义（回未变换位置）与之根本不同。

**标准做法**：接管分支 stop 后**注册同帧 rAF 矫正写入**（重写 `translateY(base + visualDragY(最新 dy))`）——矫正回调注册序晚于 motion 已排队回调 → 同帧执行序在后 → **paint 前最后写入生效，同帧矫正零跳变**。执行条件 = phase 仍是 dragging 且无回弹/exit controls（松手/关闭的 transform 已归其它路径管，不抢）。**禁 Node 侧定时采样**的老规矩在此失效变体：探针 waitStillTop 的「1 帧静止」可能是慢速尾段误判（帧差 <0.5px ≠ 速度为 0），必须配**硬数值断言兜底**（visShift = 手指位移 ±0.5）——误判时基准偏移必偏出容差。

**来源**：弹层近瞬时档批（2026-10-04）调试实锤；与 §21（动画接管）、§22（取证纪律）、§24（速度继承）同链。
