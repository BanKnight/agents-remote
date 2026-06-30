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
