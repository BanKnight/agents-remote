# frontend-notes

前端平台 / CSS / 移动端 / PWA 的经验沉淀。每条都包含「现象 → 机制 → 标准做法 → 来源」，便于以后遇到同类问题不再靠猜试错。

> ⚙️ 本文件独立维护以便迭代，由 `CLAUDE.md` 的 `## 前端实现约定` import。新增条目按编号追加，不要重写已有条目。

## 1. iOS 26 standalone PWA 下 dvh vs vh（视口单位与 home indicator）

### 现象（本项目真机实测）

本项目 PWA 配置：manifest `display:standalone` + `viewport-fit=cover` + `apple-mobile-web-app-status-bar-style: black-translucent`。

iOS 26 真机 standalone（全屏 PWA）下：

- `100dvh` / `100svh` / `100lvh` 都**扣除**底部 home indicator 区（约 34px），即 = 物理屏全高 **− 34px**。
- `100vh` **不扣**，= 物理屏全高（含 home indicator 区）。
- **顶部与底部不对称**：`viewport-fit=cover` 让内容绘制到刘海/灵动岛后方（屏幕物理顶），必须**主动消费** `env(safe-area-inset-top)` 才把内容推下避开刘海；底部相反——视口单位已经扣了 chin，**不消费 env 也有 34px 缝**，一旦消费 `env(safe-area-inset-bottom)` 缝就变成两倍（68px）。

### 机制（不是玄学，是 WebKit by design）

- **WebKit intentional 哲学**（WebKit bug 141832，2015 年，官方回复 "intentional"）：视口单位反映"安全可见区"，常驻系统 UI（home indicator chin）被排除。iOS 26 standalone 沿用同一哲学，只是被排除的对象从"Safari 地址栏"换成了"home indicator chin"。
- **W3C css-values-4 §6.1.2.1**：large/small/dynamic viewport 的区分只针对"可展开/收起的 UA 界面"；常驻系统 UI 是否影响视口单位**留作 UA-dependent**。WebKit 选择了排除。
- standalone 模式无动态地址栏 → `svh = lvh = dvh` 三者收敛到同一值（= 安全可见区）。`100vh` 在 standalone 下没有旧版 Safari 的 100vh bug，但 iOS 26 实测它同样被 WebKit 扣 chin。

### 三大坑（排查时按这三个模型对照）

1. **chin gap（下巴缝）**：容器用 `dvh` → 容器底部天然在屏幕物理底上方 34px，底部元素（`absolute bottom:0` 相对该容器）永远贴不到物理底。
2. **高度链混用裁剪**：某层用 `vh`（物理全高）嵌在 `dvh`（扣 34）的父层里，父层 `overflow: hidden` 把子层多出的 34px **裁掉** → 现象是"内容被裁剪，像父容器原因"。排查时沿视口→`html`→`body`→`#root`→`main`→`grid` 整条高度链找混用的单位。
3. **env 叠加翻倍**：容器已用 `dvh` 扣了 34，再消费 `env(safe-area-inset-bottom)` = +34 → 68px 两倍。模型：`已有 dvh 缝 34 + env 34 = 68`。

### 标准做法（本项目采用 = vh + env 单层避让）

- **根链高度统一用 `vh`**：`index.html` 内联 `body` + `index.css` 的 `html/body/#root` 用 `min-height:100vh`；`ShellLayout` 的 `main` 用 `h-screen`（= `100vh`）。**不混 `dvh`**——只要高度链任一层用 dvh 就会扣 chin、裁掉下面 vh 层多出的部分。
- **`env(safe-area-inset-bottom)` 单点消费**：放在底部交互元素（nav / 输入框）的 `padding-bottom`，把图标/输入抬到 home indicator 上方；元素的背景/材质继续延伸进 chin 区被利用（视觉填充 + 交互避让两层分离）。
- **铁律：同一方向、同一元素，`dvh/svh/lvh` 与 `env(safe-area-inset-*)` 二选一，不叠加**。这是"标准做法 vs hack"的分界——两个标准模型各自正确，叠加才双重扣减。
- **顶部对称**：header / grid 用 `padding-top: env(safe-area-inset-top)` 避让刘海（`viewport-fit=cover` 下内容默认贴刘海后方，必须主动避让）。

### 探测方法（不确定目标 iOS 行为时用，零风险）

把 `main` 从 `h-dvh` 改成 `h-screen`（一行改动），真机看底部 34px 缝：

- 缝消失 → `100vh` 在该 iOS 版本不扣 chin → `vh + env 单层避让`方案可行。
- 缝还在 → `100vh` 也扣 chin → 改用 `position: fixed; inset: 0` 锚定物理 ICB（fixed 相对物理视口，不继承 dvh 容器收缩；`viewport-fit=cover` 把 ICB 扩到物理屏边缘含 chin）。

桌面 / Playwright 下 `dvh = vh = 视口`，不暴露差异；只有 iOS 26 真机 standalone 暴露两者区别。改动前桌面端必须用 Playwright `getBoundingClientRect` 确认无回归（详见 `docs/runbooks/claude2-client-debugging.md` 与 CLAUDE.md 的 CSS 验证铁律）。

### 来源

- WebKit bug 141832（intentional）：https://bugs.webkit.org/show_bug.cgi?id=141832
- W3C css-values-4 §6.1.2.1（UA-dependent）：https://drafts.csswg.org/css-values-4/#viewport-variants
- web.dev viewport units / app design：https://web.dev/blog/viewport-units ， https://web.dev/learn/pwa/app-design
- MDN `env()`：https://developer.mozilla.org/en-US/docs/Web/CSS/env
- Stack Overflow 79902310（iOS 26 精确复现，0 回答，社区刚撞上）：https://stackoverflow.com/questions/79902310
- Reddit r/PWA "fighting the chin gap"：https://www.reddit.com/r/PWA/comments/1sdhsbu/

## 2. 色阶收敛工作流（散写 → DESIGN token）

### 现象

新代码与历史代码散写裸 Tailwind 色阶（`bg-cyan-300`、`text-slate-400`、`border-emerald-700`、`shadow-cyan-950/20` 等），绕过 DESIGN token，导致样式不一致、色相漂移、难维护。Phase 3/4/5 收敛过程中 `web/src` 累计发现 ~250 处散写。

### 机制

DESIGN.md（`docs/design/DESIGN.md`）是设计系统唯一权威源；`web/src/styles/index.css` 的 `@theme inline` 块把 DESIGN token 物化为 Tailwind utility（`bg-primary`、`text-on-surface-muted`、`border-neutral-line`、`bg-assistant` 等）。散写裸色阶 = 绕过 token 体系，每处都是未被设计系统管理的色相，累积即「走歪」。CLAUDE.md 前端约定与 DESIGN L385 已明令禁止散写裸 Tailwind 调色板。

### 标准做法

1. **新代码一律用 token**：颜色用 `surface*` / `on-surface*` / `neutral-line` / `primary` / `success` / `warning` / `error` + 内容角色色 `assistant*` / `user*` / `permission*`，禁裸 Tailwind 色阶。
2. **遇到散写先查 DESIGN 映射表**：`docs/design/DESIGN.md` 三张表覆盖全部 Tailwind 色阶 → token——「DESIGN token ↔ Tailwind 对照」（Phase 3/4 基准）、「Content role colors」（角色色）、「Phase 5 散写收敛映射」（操作色 / 灰度 / 状态色 / shadow / Skill）。先查表定映射，再改。
3. **分批按色族收敛**：同色族（操作色 / 角色色 / 灰度 / 状态色）一批，每批独立门禁 + CSS 落盘 + Playwright DOM computed 验证 + commit。机械色阶（amber/cyan/violet/emerald/rose）可 sed + oxfmt；灰度按上下文需逐处核对。
4. **灰度按上下文映射**：slate **不能**机械按档位 sed（同一档在 bg/text/border 不同语义），必须按 `bg → surface 档、text → on-surface 档、border → neutral-line` 分桶替换 + 人工核对。
5. **验证视觉零变化**（语义对齐非重新设计）：Playwright DOM `getComputedStyle` 取 backgroundColor/color/borderColor，对比 token hex；浏览器对复杂值返回 oklab（需 oklab→rgb 换算），对 sRGB 简单值返回 rgb——`text-assistant-soft` → `rgb(253,230,138)` 这种精确命中即通过。
6. **每次改 web 后主动验证 CSS 落盘**：`build --watch` 会漏落盘 CSS（preview 用 HTML 冒充 text/css），`touch web/src/main.tsx` 触发 rebuild + grep `web/dist/assets/*.css` 确认 utility 落盘。**不要 `touch web/src/index.css`**——`main.tsx` 只 import `./styles/index.css`，根 `index.css` 不存在；touch 它会新建 0 字节无引用空孤儿（git 显示 `?? web/src/index.css`），既不触发有效 rebuild 又留下 dead file，跨会话反复踩（详见 memory `build-watch-css-not-flushed`）。
7. **CSS 落盘是 web DOM 探针的强制前置断言（机制层，非可选横切）**：DOM 结构断言（文本 / `role` / `aria-label` / `data-*`）对 CSS **完全盲**——CSS 没落盘、排版全乱时探针照样 19/19 绿（2026-07-14 设置两层结构验证出现「探针全绿但 CSS 这道闸没跑」的假通过）。且 **mtime 新 / `ls web/dist/assets/*.css` 文件存在 ≠ CSS 内容对**——build --watch 增量可能只写 JS、或 preview 把缺失 `.css` SPA fallback 成 HTML（`Content-Type: text/html`）。所以 web DOM 探针必须先跑 `scripts/ar-verify-css.mjs` 三道闸（HTML 注入了 stylesheet link + 每条 CSS 响应 `content-type: text/css` + 关键 utility 选择器落在正文），不过则探针整体 fail、不往下跑 DOM 断言。探针模板：`import { verifyCssFlushed } from "./ar-verify-css.mjs"` → `const r = await verifyCssFlushed({ origin, expectClasses: [本次改动相关 utility] }); if (!r.pass) { console.error(r.details.join("\n")); process.exit(1); }`。独立跑：`node scripts/ar-verify-css.mjs [utility ...]`。

### 来源

- Phase 3（shell 视觉收敛 slate/red/emerald）+ Phase 4（Claude2 角色色 160 处 → 8 token）+ Phase 5（散写全收敛 ~87 处）实践。
- DESIGN.md L243-285 映射表 + L385 禁散写约束。
- memory `build-watch-css-not-flushed`、`design-md-authoritative-source`、`verify-css-via-dom-geometry-not-vision`。

## 3. 结构关系是 state，不是渲染结构（UI = f(state) 的运用）

### 现象

布局变化（split / 合入塌缩 / 元素跨容器移动）时，本应不受影响的已有元素被 React 卸载重建，连带其内部副作用（WebSocket、xterm、relay 等）全部重连/重放。用户直觉：「新增 group 不应影响已有 group；group 内加 tab 不应影响同 group 其他 tab」——这是理应成立的复用预期，但实现层却重建了。

### 机制

React 实例身份 = **父 + key**。React reconciliation 按「同父下相同 key、相同类型」复用实例；一旦父变了或类型变了，无论 key 多稳定都 unmount + mount。这一点和 `key` 稳定与否无关——`key` 只在同父下生效，**跨父 / 跨类型不复用**是 React 的固有行为。

当我们把「结构关系」（树、分组、嵌套）直接当成「渲染结构」递归渲染时，组件实例的「父」就绑死在了结构路径上。结构一变（leaf→split、split→leaf、元素从 A 容器挪到 B 容器），组件在渲染树里的位置/类型跟着变，React 自然匹配不上 → 重建。

绕开 reconciliation 的尝试（`createPortal` 把子树注入到动态 container）**不能解决**：React `createPortal` 在 `container` prop 变化时仍会卸载并重挂 children 子树，并未真正「DOM 移动」。凡是想「保留实例 + 手动搬 DOM」的方案，都会撞到这堵墙。

### 标准做法：把结构关系当 state，表现层退化成扁平数组

`UI = f(state)` 的真正落点：**结构关系是一种 state，不该是渲染结构**。把树/嵌套关系收敛成 state（唯一真相），表现层用纯函数把它**投影成扁平数组**，再各自 `.map` 渲染。组件在扁平层拥有「位置不随结构变化而变化的稳定身份」，由 React 按相同 key 复用，DOM 不重建。

```
state（树/嵌套，唯一真相）
  ↓ 纯函数派生（flatten / project）
扁平数组（groups / panels / gutters，各带稳定 key + rect）
  ↓ .map 渲染
表现层（无递归组件，组件父 = 固定的扁平容器，永不换父）
```

**铁律**：任何在结构变化中「会跨容器移动」或「父会换」的对象，都不能嵌在随结构变化的递归渲染结构里，必须提到扁平层用稳定 key。判断标准——问自己「这个对象在结构变化时，它在 React 树里的父会不会变？类型会不会被顶替？」如果会，就必须扁平化。

### 何时该用

- 元素有副作用生命周期（WebSocket、长连、播放器、编辑器实例、canvas/WebGL context），重建代价高或有可见闪烁/丢状态。
- 布局模型本身是递归/嵌套的（树、grid、分组），但元素需要在布局变化中保持实例稳定。
- 发现自己想用 `createPortal` + 外部 store 来「保留实例」时——这是信号：根因是渲染结构绑了结构关系，扁平化才是正解。

### 何时不必

元素无副作用、重建廉价（纯展示卡片、纯文本行），递归渲染更直观，不必为复用引入扁平层。复用是为「重建代价」服务的，不是目的本身。

### 来源

- 工作台 n 叉树布局（`docs/design/workbench-views.md` §7.5/§7.8）：split / 合入 / tab 跨 group 移动导致 terminal 重连，根因是把树直接递归渲染；解法是 `flattenLayout` 投影成三个并列扁平数组（groups / gutters / panels），group 用 `key=leaf.id`、tab 用 `key=sessionId`，split / 合入 / 移动全不重建。
- 反例：portal 顶层常驻方案（createPortal 注入动态 slot）实测失败——`container` 变化仍触发子树 unmount+mount，证明绕开 reconciliation 不可行，必须从「渲染结构 = state」这一层修。
- memory `feedback-Universal-single-pipeline` / `feedback-single-source-pipeline`（同类数据单管道）、项目 `state-sync-principles.md`（上下文充分性：全量同步之所以简单正因为客户端握有全量上下文；按需同步之所以难正因为上下文不足——此条是其在前端渲染层的镜像：把结构关系留在渲染层 = 让组件上下文不充分；提到扁平层 = 让组件始终握有稳定身份这个全量上下文）。

## 4. modal scrim overlay 与 portal fiber 冒泡（统一走 Radix Dialog）

### 现象（本项目真机实测 + 探针铁证）

移动端 InstanceCard ⋯ 底部 action sheet 打开后，点 sheet 外空白（scrim）会**导航打开下方实例卡片**，且打开的卡片与点击位置不一一对应。最初怀疑是 scrim-only overlay 的"真机 touch 穿透"（scrim 漏拦 → 点击落到下层 DOM），上一轮加了手写 body pointer-events 锁仍未消除。

### 机制（真根因 = React createPortal 合成事件按 fiber 树冒泡，非 DOM 穿透）

**这不是 scrim 漏拦的 DOM 穿透 ghost-click**，而是 React `createPortal` 的合成事件按 **fiber 树**冒泡（React 保证 portal 事件冒泡回组件树，好像没 portal）：

- ActionMenu 的 portal content（移动 sheet/scrim、桌面 popover、Radix `Dialog.Portal` 的 overlay/items）DOM 在 body，但 **fiber 嵌在 InstanceCard div 内**。
- scrim click 的合成事件按 fiber 冒泡到 InstanceCard div 的 `onClick={onSelect}` → `focusInstance` → navigate。
- **探针铁证**：卡片 DOM 上零事件（`cardPE=none`、click target=overlay、`composedPath=overlay>body>html` 不含卡片），但 navigate 仍发生——因为是 fiber 冒泡，不是 DOM 事件命中。
- **关键**：Radix Dialog（`modal=true`，body pointer-lock 全开）**也同病**——迁移到 Radix Dialog 后 navigate 仍发生。body pointer-lock 挡的是 DOM pointer events，**挡不住 fiber 合成冒泡**。所以"手写 scrim 的 ghost-click（click 阶段关闭、剩余合成 click 落下方 DOM）"这个最初假设是错的。

对照实验（同一探针）：Esc 关闭 sheet **不**导航（keydown 只匹配 InstanceCard 的 Enter/Space，Esc 不触发 onSelect）；scrim tap 关闭**才**导航（click 走 fiber 冒泡）。证明 navigate 来自 click 的 fiber 冒泡，与 dismiss 路径无关。

### 标准做法（两层：Dialog primitive 统一 modal 语义 + 调用方 contains 判断阻断 fiber 冒泡）

**1. modal 语义统一走共享 `ui/dialog.tsx`（Radix `Dialog`，`modal=true`）**：所有"背景不可交互"的 overlay（居中 modal / 底部 sheet / 全屏 reader）用同一 primitive，scrim 点击关闭 / Esc / focus trap / body pointer-lock 全交 Radix dismissable-layer，**不再手写 scrim + onClick + window keydown + useEffect body-lock**。形态靠 `className` 覆盖（居中 / 底部 sheet / 全屏），封装不硬编码 variant。`onOpenChange` 是关闭统一入口（promise-API dialog 在此 resolve）。

**2. 调用方阻断 portal fiber 冒泡（关键，Dialog 管不到）**：当 portal overlay 嵌在带 `onClick` 的祖先内（如 InstanceCard div `onClick={onSelect}`），在祖先的 `onClick` 加 **DOM `contains` 判断**：`if (e.target !== e.currentTarget && !e.currentTarget.contains(e.target as Node)) return;`——portal 的 click（DOM target 在 body，不在祖先内）被忽略，祖先内的真实 click 正常触发。这**不破坏** Radix scrim dismiss（走 document listener 独立路径，不经过祖先 onClick；探针验证 `sheetAfter` 保持 0）。

**⚠️ 不能用 Overlay/Content `onClick stopPropagation` 兜底**：实测它同时阻断 Radix scrim dismiss（`sheetAfter: 0→1`），因为 navigate 和 dismiss 共享同一个 overlay click 事件——React 合成 `stopPropagation` 在 portal 场景下连带阻断了 Radix 的 dismiss 检测。fiber 冒泡必须在"接收冒泡的祖先"层用 contains 判断，不在 portal content 层 stopPropagation。

**判定**：overlay 是 modal 语义（背景不可交互）才走 Dialog + 锁；非 modal（按坐标定位的锚定 popover、hover popover 背景仍可点）用裸 `createPortal`，不锁、不进 Dialog。

**⚠️ 补充（pointer sequence 路径，桌面端回归实测）**：contains 判断要覆盖**所有 fiber 冒泡的事件路径**，不只 `onClick`。`DragSourceCard`（仅桌面左总览启用，包装 InstanceCard 启用拖放）用 `onPointerDown` → 挂 window `pointerup` listener → pointerup 调 `onSelect`（不依赖 click 合成，避开 click 抑制 + `.click()` 误触 close 按钮）。点 ⋯ menuitem 时，menuitem 的 **pointerdown** 按 fiber 冒泡到 DragSourceCard（ActionMenu 嵌其内），原判断 `inClose = !!target.closest("button")` 失效——Radix `DropdownMenuItem` 渲染 `<div role="menuitem">`（非 `<button>`）→ `inClose=false` → 挂的 window pointerup 在松手时调 `onSelect`（navigate），与 menuitem 自身 `onSelect`（rename/close）**同时触发 = 穿透**。InstanceCard `onClick` 的 contains 判断对这个路径**无效**（navigate 走 pointer sequence，不经 onClick）——探针实测 InstanceCard onClick 被 menuitem click 调到、contains=false 正确 return，但 navigate 仍发生，证明根因在 DragSourceCard pointer sequence。修复同源：`onPointerDown` 首行加 `if (!event.currentTarget.contains(event.target as Node)) return;`——portal menuitem 的 pointerdown（DOM target 在 body）直接 return，不挂 pointerup listener；卡片内 pointerdown（target 在 div 内，contains=true）继续走 inClose/拖动判断，单击激活、⋯ trigger 开菜单均不受影响（探针验证：menuitem 穿透消失 + 单击卡片仍 navigate）。**判定**：凡是用 pointer sequence（pointerdown→pointerup）激活的卡片/行，其 `onPointerDown` 都要加 contains 判断，与 `onClick` 同源——fiber 冒泡不只走 click。

### 诊断方法

源码导航入口（如 `useWorkbenchNavigate`）临时加 `console.log("[nav-wb]", ..., new Error().stack)`，Playwright `page.on("console")` 抓栈，直接看到 `onSelect ← React dispatch ← portal click` 链。`pushState` 的 stack 因 TanStack microtask commit 截断（commit 用 `Promise.resolve().then(()=>v())` 推迟到微任务），但 navigate→commit 同步，trace 不受影响。

### 来源

- 探针 `scripts/_probe-sheet-ghost.mjs`（已删）：登录 → test 项目造 terminal session → 移动视口 /global → 开 InstanceCard ⋯ sheet → hook 卡片全事件 + pushState + 注入 navigateWorkbench trace → tap scrim。
- Radix `react-dialog@1.1.17`（`DialogContentModal` L199 `disableOutsidePointerEvents`、L204 `onPointerDownOutside`、L281 `deferPointerDownOutside`）+ `react-dismissable-layer` touch `once` dismiss（L191-200）。
- 修复 commit `fix(web): InstanceCard ⋯ sheet 误导航——阻断 portal fiber 冒泡`（`shell-primitives.tsx` InstanceCard `contains` 判断 + `ui/dialog.tsx` 共享 primitive + ActionMenu 移动端迁 Dialog）。
- memory `react-portal-fiber-click-bubbling`（真根因 + 修复闭环）。

## 5. Radix `asChild` 包裹组件必须透传 props/ref（Trigger 不生效真根因）

### 现象（本项目批 R 设置弹窗实测）

`SettingsDialog`（Radix `Dialog modal=true`）内嵌的 runtime provider / effort / model tier 三个 `OptionMenu`（桌面端 = `DropdownMenuTrigger asChild`）**点击毫无反应**，不开 popover。诊断一度走偏：先怀疑嵌套 modal pointer-lock 冲突（加了 `DropdownMenu modal={false}`，build chunk 确有 `modal:!1` 但仍无反应），再怀疑 z-index / focus，都不中。

### 机制（真根因 = asChild Slot 把 props 注入「直接子元素」，子元素若是组件不展开则被吞）

Radix `asChild` 用 `Slot`：它 clone **直接子元素**并把 Trigger 的 toggle / `aria-expanded` / `data-state` / `onClick` / `id` / `ref` merge 进去。关键在「直接子元素」是**一个 React element**：

- 直接子是**原生 DOM**（`<button>`/`<a>`）：Slot clone 后 props 直接落到 DOM，Trigger 生效。`Claude2SessionDetailRoute.tsx` 里 model/mode 选择器 trigger 直接传 `<button>`，所以一直正常。
- 直接子是**自定义组件**（`<SelectorTrigger/>`）：Slot 把 props merge 进**组件的 props**，组件收得到，但若组件**不展开 `{...props}` 且不转发 `ref`**，这些 props 就被吞掉——原生 `<button>` 拿不到 `onClick`/`aria-expanded`，Trigger 永远不挂。现象：button 上 `aria-expanded: null`、`data-state: null`，点击只触发外层 Dialog 不开 popover，无 `dropdown-menu-content` portal。

本项目 `SelectorTrigger` 正是后者：`function SelectorTrigger({ label, disabled }) { return <button .../> }`——既不收 `...rest` 也不接 `ref`，Slot 注入全丢。

### 标准做法（自定义 trigger 组件必须 `forwardRef` + 展开 rest）

```tsx
const SelectorTrigger = forwardRef<
  HTMLButtonElement,
  { label: string; disabled?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>
>(function SelectorTrigger({ label, disabled = false, ...rest }, ref) {
  return (
    <button ref={ref} type="button" disabled={disabled} className="..." {...rest}>
      {/* ... */}
    </button>
  );
});
```

要点：① `forwardRef` 把 Radix 注入的 `ref` 转给原生 DOM；② `{...rest}` 展开，让 `onClick`/`aria-*`/`data-state`/`id` 落到 `<button>`；③ 自身显式的 `type`/`disabled`/`className` 与 `rest` 不冲突（Radix Trigger 不传这三者）。**判定**：若 `asChild` 的直接子是组件而非原生 DOM，该组件必须「透传 props + 转发 ref」，否则 Slot 失效。这是 `asChild` API 的固有契约，不是 Radix bug。

### 诊断方法

Playwright 探针点 trigger 后查 `aria-expanded` / `data-state`：两者都 `null` → Trigger 未挂 → 看 trigger 是不是被自定义组件包了一层没透传。对比：直接传 `<button>` 的同款菜单 `aria-expanded="true"` 正常。build chunk 里搜 `modal:!1` 只能证明编译产物对，证明不了运行时 Trigger 挂载——后者必须探针查 DOM 属性。

### 来源

- 修复 commit `feat(web): 设置弹窗细节修复——OptionMenu 嵌套+加载态+排版+apiKey+列表限高+Apple grouped (批 R)`（`settings-dialog.tsx` `SelectorTrigger` 改 `forwardRef` + `{...rest}`）。
- 同文件 `OptionMenu`（`ui/option-menu.tsx`）`trigger: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>` 的类型契约本就要求调用方传「能接这些 props 的元素」，自定义组件须自身满足该契约。
- Radix Slot `asChild` 机制：clone 直接子 + mergeProps（事件 handler 拼接，普通属性 child 优先）；`@radix-ui/react-slot`。

## 6. 移动端触摸滚动 = tmux copy-mode（手动发 SGR 鼠标滚轮序列）

### 现象（本项目真机 + 探针实测）

移动端 terminal（xterm.js attach tmux）触摸滚动要能看到 **attach 前的 scrollback 历史**。曾退步为滚 xterm 本地 buffer，但 `tmux attach` 不重放 scrollback，本地 buffer 只有 attach 后当前屏 ~24 行，看不到更早历史。最终正解：触摸手动发**和桌面滚轮同一种 SGR 鼠标滚轮序列**，走 tmux `WheelUpPane → copy-mode -e` 路径滚 server scrollback。

### 机制（真相：桌面滚轮就是 tmux copy-mode，移动只是 dead path 要手动补）

- **桌面滚轮 = tmux copy-mode**：tmux 全局 `mouse on`（环境配置，`tmux show-options -g mouse` = on，非本应用设）+ root table `WheelUpPane` 绑定 `if-shell pane_in_mode|mouse_any_flag {send-keys -M} {copy-mode -e}`。桌面 xterm 鼠标模式下把 wheel 自动转 SGR 鼠标序列发回 → tmux → `copy-mode -e` → 滚 server scrollback（含 attach 前历史），滚到底自动退出回 live（tmux 原生 sticky-bottom）。**xterm 鼠标模式转序列无需 JS handler**——grep 不到 wheel handler ≠ 无机制。
- **服务端不区分桌面/移动**：`TmuxRuntime.attach()` 对每个 WS client 一视同仁 spawn `tmux attach`，同 output 流。桌面后 attach 也能看历史，靠 mouse+copy-mode 滚 server scrollback——**不是** attach 重放（实测 500 行历史，新 attach PTY 只收当前屏 ~24 行），**不是**本地 buffer 累积。
- **移动 touch 是 dead path**：xterm 6.x `Gesture` class 在 document 层 `preventDefault` 阻止原生滚动 + 自定义 scrollbar 只处理 wheel 不处理 touch → touch 不自动转 SGR 序列，**必须手动发**。
- **SGR 鼠标序列（mode 1006）按帧解析不粘连**：`\x1b[<64;1;1M`（WheelUp）/ `\x1b[<65;1;1M`（WheelDown），button 64/65，`M` 结尾=按下事件，col/row 固定 1;1。每帧以 `M` 结束是完整一帧，连发由 tmux 按 CSI 边界分帧——区别于 Alt 修饰序列（`\x1b[1;3A`）需 50ms 逐发防粘连。

### 标准做法（移动 touch 手动发同款 SGR 序列，与桌面同路径）

- **applyScroll**：手指位移 px 累加 → `Math.trunc(accum / PIXELS_PER_WHEEL)` 算序列数 → 同步 for 循环 `onSendInput(SGR_WHEEL_UP/DOWN)`。`PIXELS_PER_WHEEL = LINE_HEIGHT_PX * 5`（tmux copy-mode 一次 WheelUp/Down 滚 5 行 → 手指每滑 ~81px 发 1 序列 = 滚 5 行视觉，~16px 手指/行视觉，手感与滚本地 buffer 一致）。
- **方向**：手指上滑（dy<0）= 看更早 = WheelUp；手指下滑（dy>0）= 看更新 = WheelDown。滚到底 tmux 自动退出 copy-mode 回 live——**无超时、无 UI、无 netUp bug**。
- **连发上限**：单帧累出过多序列时截断（`Math.min(Math.abs(wheels), MAX_WHEELS_PER_FRAME)`，`MAX_WHEELS_PER_FRAME = 50`），防极端惯性一次刷上百帧突发流量；滚到顶/底 tmux 自然停。
- **服务端零改动**：`WheelUpPane → copy-mode -e` 是 tmux 自带，移动只是补发桌面同款序列。`tmux-runtime` 只设 `history-limit`（server scrollback 深度上限，决定能滚多远）+ `prefix None`，**不**需要 per-session bind-key。

### 已验证的错路（勿再走，每条都付出过代价）

1. **误判"桌面走 xterm 本地 buffer、非 copy-mode"**：因 grep 本文件无 wheel/鼠标 handler 就断定，漏查 `tmux mouse on`。教训：grep 无 handler ≠ 无机制，先查 `tmux show-options -g mouse` 与 `tmux list-keys -T root WheelUpPane`。
2. **移动滚 xterm 本地 buffer（`term.scrollLines`）**：attach 不重放 scrollback，本地 buffer 只有 attach 后当前屏 ~24 行，看不到 attach 前历史——曾是"移动毫无动静"的退步根因。
3. **键盘 M-Up 触发 copy-mode**（commit `cb8e628`）：绕开 mouse 路径，还加 1.5s 超时强制退出 → 跳回最新。
4. **capture-pane 快照**：半态（丢光标/alt-screen），用户明确否决，永不再提。
5. **编造"服务端区分桌面/移动""桌面先连累积 buffer"等解释**：服务端做不到这种区分；遇到矛盾（桌面后 attach 却能看历史）要查真实机制，不要硬拗旧理论。

### 来源

- 实现 commit `089a6f7`（SGR copy-mode 方案）+ `4e5ecc3`（连发上限）。
- 探针实测：`tmux show-options -g mouse` = on、`tmux list-keys -T root WheelUpPane` 显式绑定、发 SGR 序列后 earliest 479→384→滚回最新+退出 copy-mode。
- xterm.js 6.x `Gesture` class document 层 `preventDefault` + scrollbar 只处理 wheel。
- tmux SGR 鼠标模式 1006：`\x1b[<btn;col;row>M`。
- memory `web-terminal-tmux-attach-research`（web terminal 共享终端走 tmux attach 非 capture-pane 半态快照）。

## 7. 触屏能力（pointer）与视口宽度（viewport）是正交维度（hover 显隐 / 点击区错绑断点）

### 现象（iPad 横屏等「宽屏 + 触屏」复合设备）

操作按钮（中栏 tab ✕、文件/Git 行 ⋯、卡片 ⋯、表格行 ⋯）在 **iPad 横屏（≥1024px 触屏）** 这类「宽屏 + 触屏」复合设备上：① 永久不可见（默认 `opacity-0`、hover 又唤不醒）；② 即使可见，点击区只有 28px（鼠标紧凑尺寸），HIG 44px 触摸目标不达标。

根因是代码与 DESIGN 契约**用视口断点（`sm:`/`max-sm:`）代理「是否触屏 / 是否有 hover」**：`sm:opacity-0 sm:group-hover:opacity-100`（宽屏才隐藏 + hover 显）、`max-sm:h-11 max-sm:w-11`（窄屏才放大点击区）。iPad 横屏 ≥1024px 命中 `sm:` 分支被当成鼠标——隐藏生效、hover 唤不醒、点击区不放大。

### 机制（两个正交维度 + Tailwind v4 hover 守卫的盲区）

- **触屏能力（pointer）与视口宽度（viewport）是两个正交维度**，不能互相代理。典型反例就是 iPad 横屏：宽视口 + 触屏。用视口断点判断「是否触屏」必然在复合设备上失效。判定交互能力必须用对应的媒体特性：`(hover: hover)`（能否 hover）、`(pointer: coarse)`（主指针是否粗糙 = 触屏）。
- **Tailwind v4 默认已把 `hover:`/`group-hover:` 包进 `@media (hover: hover)`**——所以触屏设备上 `hover:bg-*` 本就不触发（这是好事）。但反模式的坑在 **`opacity-0` / `sm:opacity-0` 这层「默认隐藏」不在 hover 守卫内**：它无条件生效，触屏宽屏上隐藏生效、hover 又唤不醒 → 永久不可见。守卫只护住了 hover 那一瞬，护不住「默认就藏起来」这层基线。
- **正解范例（项目内已有）**：`composer-enter.ts` `isMobileComposerMode({coarse, wide}) = coarse && !wide`——「指针粗糙 且 窄屏」双条件，而非单看视口；`drag-source.tsx` 拖放用运行时 `event.pointerType === "touch"` 判定，不受 `(pointer: coarse)` 误报伤害（与 composer Enter bug 同源：某些非触摸桌面环境会误报 coarse）。

### 标准做法（`@custom-variant hover-capable/touch` + 渐进增强）

1. **新增两个指针能力 variant**（`web/src/styles/index.css`，紧邻 `@custom-variant dark`）：
   ```css
   @custom-variant hover-capable (@media (hover: hover) and (pointer: fine));
   @custom-variant touch (@media (hover: none) and (pointer: coarse));
   ```
2. **渐进增强（核心范式）**：默认（触屏 / 未知设备）= 常显 + 大点击区（可达优先）；`hover-capable`（鼠标）才降级为 hover 显隐 + 紧凑尺寸。取「无害方向」——`(pointer: coarse)` 误报环境命中 `touch` 只是按钮常显 + 放大，对桌面鼠标用户是轻微视觉噪音，不是功能失效（与 composer Enter 取「发送」而非「换行」的无害取舍同源，见 §1 同属「视口与设备维度分离」家族）。
3. **hover 显隐**（A 组，默认常显 + hover-capable 才显隐）：`max-sm:opacity-100 opacity-0 group-hover/tab:opacity-100` → `opacity-100 hover-capable:opacity-0 hover-capable:group-hover/tab:opacity-100`。
4. **点击区放大**（B 组，touch 放大、鼠标保留紧凑）：`max-sm:h-N max-sm:w-N` → `touch:h-N touch:w-N`。`hover:bg-*` 等 hover 视觉无需改（v4 自带守卫）；`active:` 走 `:active` 不受守卫影响，触屏按下仍有反馈。
5. **判定边界（哪些改、哪些不改）**：
   - hover 显隐操作按钮（⋯/✕）→ 交互能力 `(hover: hover)` → **改**（hover-capable）。
   - 点击区 44px → 交互能力 `(pointer: coarse)` → **改**（touch）。
   - ActionMenu 分流 popover vs 底部 sheet → 布局形态 → 视口 `useIsMobile` → **不改**（响应式正确，触屏 popover 也能点开）。
   - 拖放启用 → 运行时 `event.pointerType` → **不改**（正解范例）。
6. **判定铁律**：判定「是否触屏 / 是否有 hover」用 `(hover: hover)`/`(pointer: coarse)` 媒体查询或运行时 `event.pointerType`；视口断点（`sm:/max-sm:/lg:`）**只管布局结构**（形态切换、列数、显隐区），不代理交互能力。

### 相邻发现（不在本次范围，记录待后续单开）

- **断点阈值不一致**：`index.css` `--breakpoint-sm=1024px`（CSS `sm:`/`max-sm:` 阈值）vs `use-is-mobile.ts` `(max-width:639px)`（JS `useIsMobile` 阈值）。~800px 窗口下 ActionMenu 走桌面 popover、⋯ 按钮却已放大（命中 `max-sm:`）——这是「视口断点内部不自洽」的独立问题，影响面广，建议后续单开（统一到 1024 或 640）。
- **claude2 ActionBar** 纯 `opacity-0 group-hover:opacity-100`（无断点）—— 触屏同样不可见，属 claude2 范围，留后续。

### 自动化测试局限（Chromium 无法模拟 hover/pointer）

- **Chromium 的 CDP `Emulation.setEmulatedMedia` 不支持模拟 `(hover)` 与 `(pointer)` media feature**——实测 `setEmulatedMedia({features:[{name:"hover",value:"none"}]})` 后 `window.matchMedia("(hover: hover)").matches` 仍为 true。Chrome DevTools "Rendering" 面板同样只暴露 `prefers-color-scheme` / `prefers-reduced-motion` / `prefers-contrast` / `forced-colors`，无 hover/pointer；Playwright 1.60 的 `emulateMedia` 也仅支持这五项（`@playwright/test` 1.60 `types.d.ts` 实测）。
- **故 iPad 横屏（hover:none + pointer:coarse）无法在 Playwright/Chromium 自动化里精确复现**。指针 variant 的自动化验证只能用混合策略（`scripts/probe-pointer-variants.mjs`）：① 运行时验证桌面态（hover-capable 匹配时行为正确，A 组 opacity 0→hover 1、B 组点击区 28px）；② 静态分析 CSS 文件，确认 utility 被正确的 media query 包裹（`@media (hover:hover)+(pointer:fine)` 含 hover-capable、`@media (hover:none)+(pointer:coarse)` 含 touch）。由 CSS 规范保证：media query 不匹配则规则不应用，故触屏必不触发 hover-capable（opacity 保持默认常显→反模式修复）、必触发 touch（点击区放大）。
- **触屏真机最终验证不可省**——iPad 横屏 / 触屏笔记本是自动化覆盖不到的最后一公里，交用户。

### 来源

- 实现：`web/src/styles/index.css`（`hover-capable`/`touch` variant）+ `instance-area.tsx` TabChip ✕ / `file-browser.tsx` 文件行 ⋯（A 组）/ `shell-primitives.tsx` 卡片 ⋯ + `workbench-table.tsx` 表格行 ⋯ + `global-projects-overview.tsx` 项目卡片 ⋯（B 组）。
- DESIGN.md 契约条目：「触屏触摸目标 44px」「action-menu 触发器」+ Do's/Don'ts 两条（视口断点不代理指针能力 / 渐进增强）。
- 与 composer Enter 修复同根：`composer-enter.ts` `isMobileComposerMode({coarse, wide}) = coarse && !wide` 是「指针 + 窄屏」双条件范例；本次是「指针能力独立于视口」的纯指针维度正交化。两者同源洞察：视口与指针是两个维度。
- Tailwind v4 `hover:` 自带 `@media (hover: hover)` 守卫：https://tailwindcss.com/docs/hover-focus-and-other-states
- W3C Media Queries Level 4 `hover` / `pointer` 特性：https://www.w3.org/TR/mediaqueries-4/#hover 、 https://www.w3.org/TR/mediaqueries-4/#pointer

## 8. flex 高度链：`flex-1` 子要滚，父必须是 flex container（overflow 只裁不传约束）

### 现象（本项目工作台左栏实测）

工作台左栏（项目 scope）文件树 / git 变更列表 / 历史列表，内容超过可用高度时**无法滚动**——多出的内容被直接裁掉看不到，滚轮/触摸都不动。三者同源，同一个父容器出问题。而同位置的「实例总览」（overview tab）却一直能滚。

### 机制（真根因 = flex item 内部非 flex container，子的 flex-1 不生效）

滚动要成立需三者齐备：① 滚动容器有 `overflow-y-auto`；② 它有**确定的、被约束的高度**（不随内容撑开）；③ 内容 > 该高度。三个左栏的 `overflow-y-auto` 都在（②③ 出问题）。

- 父容器 `ProjectLeftPanel` 主体是 `<div class="min-h-0 flex-1 overflow-hidden">`——它自己是 flex item（`flex-1`，被祖先 flex column 约束到确定高 820px），但**内部不是 flex container**（没有 `flex`/`flex-col`）。
- 它的子（`FilesPanel`/`GitChangesList` 根）是 `flex min-h-0 flex-1 flex-col`。`flex-1`（= `flex:1 1 0%`）**只在父是 flex container 时生效**；父是普通 block 流时 `flex-1` 是死属性，子按 `height:auto`（内容高）撑开。
- 于是子长到 1136px（内容全高）> 父 820px，父 `overflow-hidden` 把多出的 316px **裁掉**——现象就是「内容被截断、且不滚」。`overflow-hidden` 只负责裁剪，**不会把自己的高度约束传给子**；传约束靠的是 flex 布局（`flex-1 + min-h-0`）。
- **为何 overview 不受影响**：`InstanceLeftOverview` 根用 `flex h-full min-h-0 flex-col`——`h-full`（= `height:100%`）直接取父的 height（820px，父有确定高），不依赖父是 flex container，所以高度被正确约束、内部 `overflow-y-auto` 正常滚。这也解释了为何「同一个父，overview 能滚、files/git 不能」——两条子路径用了不同的高度获取方式（`h-full` vs `flex-1`）。

### 标准做法（父补 flex container，或子改 h-full）

- **首选：让承载不同主体的父成为 flex column container**。`min-h-0 flex-1 overflow-hidden` → `flex min-h-0 flex-1 flex-col overflow-hidden`。这样 `flex-1` 子被约束到父高、`h-full` 子仍取父高，两类子都对，一处修复覆盖全部 tab。
- **列表本身要有滚动层**：主体根 = `flex h-full min-h-0 flex-col`（或 `flex-1 min-h-0`），内部 header `shrink-0` + 列表区 `min-h-0 flex-1 overflow-y-auto` 包 `ListGroup`。`HistoryList` 原本是 Fragment 顶层（label + ListGroup 直接铺开，无滚动层），补齐成此结构才滚（对齐 `GitChangesList` 的 header+scroll body 范式）。
- **`min-h-0` 是 flex item 可收缩的前提**：flex item 默认 `min-height:auto`（= 内容高，不可压缩到内容以下）。高度链上每一层 flex item 都要 `min-h-0`，否则某层按内容撑开、把 `overflow` 顶破。这条与 §1 坑 2「高度链混用单位」同属「整条链逐层核对」家族。
- **判定铁律**：想让某元素内部滚动，从它沿父链上溯到确定高度源，逐层确认——每个 flex item 有 `min-h-0`、每个「父是 flex item 但要约束子高」的容器自身也是 flex container（或子改用 `h-full`）。`overflow-hidden`/`overflow-y-auto` 只是裁剪/滚动开关，**给不了高度约束**，别指望它替代 flex 布局传约束。

### 诊断方法（DOM 几何硬数据，不靠 vision）

Playwright 定位滚动容器（`overflow-y-auto` 那层），evaluate 取 `scrollHeight` / `clientHeight`，并**实测可滚性**：设 `el.scrollTop = 80` 后读回是否 == 80（`actuallyScrolls`）。`scrollHeight > clientHeight` 才可能滚；设 scrollTop 生效才真滚。再遍历父链打印每层 `className` / `height` / `minHeight` / `display` / `flex` / `clientHeight` / `scrollHeight`——一眼看出哪层 `clientH < scrollH`（约束在此、被裁）、哪层 `display` 非 flex 却期望 `flex-1` 子（断点在此）。本次实测：文件树 `scrollH1089/clientH773`、git 74 改动 `scrollH20297/clientH684`、历史 32 行 `scrollH1007/clientH753`，修复后 `actuallyScrolls` 均 true。内容不足时（如改动少的 git）`canScrollDown=false` 是正常的，需造足量数据（临时 fixture）才能触发溢出验证。

### 来源

- 修复 commit `fix(web): 工作台左栏文件树/git/历史列表内容溢出无法滚动——补齐高度链`（`project-left-panel.tsx` 主体容器加 `flex flex-col` + `history-list.tsx` 正常分支补 `flex h-full min-h-0 flex-col` 根 + 滚动层）。
- 探针（诊断后删除，未入库）：登录 → 项目工作台 → 切 Files/Git/History tab → 定位 `[aria-label]` ListGroup 的 `overflow-y-auto` 祖先 → 测 scrollTop 可滚性 + 父链几何。
- 与 §1（高度链混用单位）、§3（结构关系是 state）同属「高度链 / 布局链逐层核对」方法论；与 CLAUDE.md 的 DOM 几何验证铁律一致（`verify-css-via-dom-geometry-not-vision`）。
- MDN flexbox `min-height:auto` 与 `flex-1`：https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Mastering_wrapping_of_flex_items

## 9. CSS animation `fill-mode: none` 导致退出动画结束回原位闪动（exit 动画要 fill-mode-forwards）

### 现象（本项目移动端文件预览 / Git diff 浮窗实测）

移动端全屏浮窗（`fixed inset-0` takeover，经 `useMobileExitClose` 编排）关闭时：关闭动画（`animate-out slide-out-to-bottom-full`）播完滑出屏幕后，**会突然闪一下**——元素瞬间在原位（满屏可见、不透明）闪现一帧，然后才消失。进入动画（`animate-in slide-in-from-bottom-full`）无此现象。

### 机制（`fill-mode: none` + React setState 滞后一帧）

`useMobileExitClose` 编排浮窗 dismiss：close → `setExiting(true)` → 浮窗 div 切到 `animate-out slide-out-to-bottom-full` → `onAnimationEnd` 才真正清 state（`setSelectedFilePath(undefined)` + `setExiting(false)`）→ React 重渲染把 div 切到 `hidden` 分支。

`tw-animate-css` 的 `.animate-out` 默认 `--tw-animation-fill-mode: none`（源码 `var(--tw-animation-fill-mode,none)`）。`fill-mode: none` 语义：**动画结束后元素回到未动画的初始状态**——对 `slide-out-to-bottom-full` 即回到 `translateY(0)`（原位、opacity 1、可见）。

时序断裂点：
1. 动画播完，元素在 `translateY(100%)`（屏幕外）。
2. `fill-mode: none` → 动画结束，元素**瞬间回原位**（`translateY(0)`、可见）。
3. `animationend` 事件触发 → React 合成 `onAnimationEnd` → setState。
4. React 重渲染 commit（切 `hidden`）——发生在下一帧。

第 2 步（回原位）与第 4 步（切 hidden）之间隔了一帧，浏览器把「回原位的可见态」paint 出来 → 闪一下。

进入动画 `animate-in` 无此问题：其终态（`translateY(0)`）恰好等于未动画初始态，`fill-mode: none` 回弹无视觉差。

### 标准做法（exit 动画加 `fill-mode-forwards`）

给**退出**动画 className 追加 `fill-mode-forwards`（`tw-animate-css` 提供 `fill-mode-backwards/both/forwards/none` utility），让动画结束后元素保持终态（`translateY(100%)`、屏幕外不可见），直到 React 把它切 `hidden`——中间帧元素始终不可见，无闪动。进入动画不需 forwards（终态即原位）。

- `animate-out slide-out-to-bottom-full duration-300 ease-in` → `animate-out slide-out-to-bottom-full duration-300 ease-in fill-mode-forwards`
- 两处移动浮窗同 bug 同修：`file-browser.tsx` FilesPanel 浮窗、`git-diff-viewer.tsx` GitDiffPanel 浮窗。
- `fill-mode: forwards` 与 `fill-mode: both` 区别：`both` = backwards（动画前保持 0% keyframe）+ forwards（动画后保持 100%）。exit 动画只需 forwards（前面是 exiting 态触发、无「动画前」窗口）；若 enter 动画也想消除「动画前闪现原位」（罕见，因通常动画即起播），可对 enter 用 backwards/both。

### 排查要点（同类「动画结束闪动」先查 fill-mode）

- 看到「CSS 动画播完闪一下 / 跳回 / 鬼影」先查动画元素的 `animation-fill-mode`——默认 `none` 是最常见的「动画结束回到非动画态」根因，与 React unmount/条件渲染切换的时序差叠加即闪。
- 验证方法：DevTools 给该元素临时加 `animation-fill-mode: forwards`，闪动消失即确认。
- 对称路径（`overlay-dismiss-symmetry`，DESIGN.md）：dismiss 动画要与 enter 同路径，但 fill-mode 是独立维度——同路径不保证同 fill-mode，exit 需单独 forwards。

### 来源

- 修复 commit `fix(web): 移动浮窗关闭闪动——exit 动画 fill-mode-forwards + 图片查看器`（`file-browser.tsx` + `git-diff-viewer.tsx` 两处 `animate-out` 加 `fill-mode-forwards`）。
- `tw-animate-css@1.4.0` `dist/tw-animate.css`：`.animate-out{animation:exit … var(--tw-animation-fill-mode,none)}` + `@keyframes exit{to{transform:translate3d(…,var(--tw-exit-translate-y,0),…)}}`。
- 与 §4（portal fiber 冒泡）同属「现象在视觉层、根因在浏览器机制层，需溯源而非在渲染层打补丁」方法论；DESIGN.md `overlay-dismiss-symmetry`（apple-design §7）+ `mobile-sheet-fullscreen`。
- MDN `animation-fill-mode`：https://developer.mozilla.org/en-US/docs/Web/CSS/animation-fill-mode

## 10. vite build --watch 漏 CSS 落盘治本：`cssCodeSplit: false`（build-watch-css-not-flushed）

### 现象（本项目多次复发，用户反复报「布局问题」）

`scripts/ar-dev-web.sh` 用 `vite build --watch`（rolldown bundler）+ `vite preview` 常驻 web（43012）。增量 build **偶发只写 JS、漏写 CSS**——`dist` 缺 HTML 引用的 CSS 文件，preview 把 404 SPA fallback 成 `index.html`（`Content-Type: text/html`），浏览器把 HTML 当 CSS 解析 → **排版全乱但 console 无 JS 报错**，极易误判为业务/样式回归。§2 第 6-7 条是此前「touch 兜底 + ar-verify-css 硬闸」；本条目是 **2026-08-02 落地的治本**（commit `89b3a45`），治本后不应再触发，touch 兜底降级为备用。

### 机制

vite 8（rolldown 转正版）`build --watch` 增量对「内容/hash 未变的 CSS chunk」**跳过重 emit**——一旦产物被清/未写，增量再不会补 → dist 长期缺 CSS。rolldown 的 CSS watch 依赖跟踪仍在 RFC（rolldown#8403，Stage 3），无上游 config 修复。

**dev 环境并发污染（独立根因，曾误判为源码回归）**：多个 `vite build --watch` **孤儿进程**并发写 dist 竞态吞 CSS（ar-dev web 窗口丢失变孤儿 + 新窗口又起一个）。诊断进程数用 `ps -eo pid,args | grep "vite build --watch" | grep -v grep`，应只有 1 个；>1 即并发污染，`pkill -f "vite build --watch"` 后重启。⚠️ **正常态是 2 个 vite 进程**（1 `build --watch` + 1 `preview`，同由 `ar-dev-web.sh` 拉起，同 pts/etime），别误报；「并发污染」特指 2 个都是 `build --watch`。诊断**别用 `wc -l`/`pgrep -cf` 计数**（grep 自身快照竞态/参数串进匹配都会假阳性返回 2），看命令全名。

**增量不可靠还有两面（与 CSS 落盘同根，遇色阶/utility 验证时注意）**：① 保留废弃 utility——增量不删旧 class，`dist` 残留已不消费的 utility，验证色阶收敛必须 clean build（`bunx vite build --outDir /tmp/x --emptyOutDir`）才反映真实源码集合；② 增量缺新 utility——新增 utility 消费后 dev DOM 验证前需 `touch web/src/main.tsx` 触发更完整 rebuild。

### 标准做法（治本 + 改 config 重启 + 兜底 + 硬闸）

1. **治本：`build.cssCodeSplit: false`**（`web/vite.config.ts`）。CSS 作**单一入口副作用**，每次 build（含 watch 增量）必 emit，绕开「内容未变 → 跳过」路径。单页 SPA 无副作用（本就单入口 CSS），precache 25→24 entries（2 CSS 合并为 1：`index-*.css` + `vendor-terminal-*.css` → `style-*.css`）。
2. **⚠️ 改 vite.config 后必须重启 dev web**：`build --watch` **启动时只加载一次 config，增量 rebuild 不重新评估**（实测：改 config 后 watch rebuild 仍用旧配置）。重启 = `ar-dev:web` by name C-c → `scripts/ar-dev-web.sh`（脚本首步阻塞式 build 会重载 config）。这是 watcher 行为，不是 bug。
3. **兜底（touch 临时修复仍可用）**：CSS 丢了 → `touch web/src/main.tsx` 触发完整 rebuild。⚠️ 绝不 `touch web/src/index.css`（该文件不存在，touch 会新建 0 字节无引用孤儿，git 显示 `?? web/src/index.css`）。
4. **硬闸（改 web 包内任何文件后必跑，与改动内容无关）**：`node scripts/ar-verify-css.mjs [本次相关 utility ...]`——三道闸：HTML 注入 stylesheet link + 每条 CSS 响应 `content-type: text/css` + 关键 utility 选择器落正文，不过则 fail。DOM 结构断言（文本/role/aria）对 CSS **完全盲**，探针全绿 ≠ CSS 正确。web DOM 探针须 `import { verifyCssFlushed }` 做强制前置断言。ar-verify-css 与 format:check / lint / typecheck / test **同级**，改 web 后无条件跑，不在 plan 里写「需不需要」。
5. **交付 checklist（commit/push 后、交用户前，hard）**：① `curl -sI localhost:43012/assets/<index.html 引用的 css> | grep content-type` 必须 `text/css`（`text/html` = CSS 没落盘，preview 把缺失 CSS SPA fallback 成 HTML）；② `ls web/dist/assets/*.css` 非空；③ 若 text/html，`touch web/src/main.tsx` + 轮询到 text/css 再交付。**clean build 验证 ≠ dev 交付验证**：clean build 证明「源码→CSS 映射对」，curl 43012 证明「用户实际看到的 dev 产物可用」，两者都必须，不可互相替代。重复 `touch`/多次 rebuild 后是漏 CSS 最高风险时刻，更必须 curl 确认。

### 验证（治本 commit `89b3a45`）

- 一次性 build → 单 `style-DF42622Y.css`（103497 B，= 旧 99547+3939 合并），HTML 只引用它。
- 重启 dev web 后 build --watch 生效；`touch main.tsx` 触发增量（built in 2601ms）→ ar-verify-css 三道闸仍全绿（**治本核心证明：增量不再漏 CSS**）。
- 无回归：桌面 1280×900 / 移动 390×844 DOM 几何探针——middle tab 栏与主体零重叠、body 无横向溢出、wiki 列表渲染正常。
- 门禁全绿：format / lint(0w0e) / typecheck / test（api 417 + shared 9 + web 551 = 977）/ build（precache 24 entries）。

### 来源

- 治本 commit `fix(web): cssCodeSplit:false 治本 build --watch 漏 CSS 落盘`（`89b3a45`，`web/vite.config.ts` +5 行）。
- tvly 调研：rolldown/rolldown#8403「Vite-inspired CSS Solution」RFC——rolldown CSS code-splitting + watch 依赖跟踪仍在 Stage 3，无上游 config 绕过。
- 与 §2 第 6-7 条同族：§2 是「色阶收敛验证 + CSS 落盘硬闸」，本条是「落盘问题的构建层治本」。
- **本条目自包含（取代旧的机器本地 memory `build-watch-css-not-flushed`）**：旧 memory 在 `~/.claude/projects/.../memory/`，随机器迁移即丢失；本条目是仓库内文件、跟 git 走，才是跨机器长期载体。曾有 5 次复发、完整时间线已并入本条目机制/做法/验证各节。
