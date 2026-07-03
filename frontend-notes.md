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
