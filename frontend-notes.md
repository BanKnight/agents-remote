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
6. **每次改 web 后主动验证 CSS 落盘**：`build --watch` 会漏落盘 CSS（preview 用 HTML 冒充 text/css），`touch web/src/index.css` 触发 rebuild + grep `web/dist/assets/*.css` 确认 utility 落盘。

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
