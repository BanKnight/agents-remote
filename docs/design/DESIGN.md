---
version: alpha
name: Agents Remote Console
description: agents-remote 的深色 Server Agent Console 设计系统（Google DESIGN.md 格式）
colors:
  primary: "#7dd3fc"
  secondary: "#a78bfa"
  success: "#34d399"
  warning: "#fbbf24"
  error: "#fb7185"
  surface-base: "#080b10"
  surface: "#0f1520"
  surface-raised: "#141b28"
  surface-inset: "#05080d"
  neutral-line: "#263245"
  on-surface: "#eef4ff"
  on-surface-soft: "#c1cad8"
  on-surface-muted: "#8d99aa"
  on-primary: "#041019"
  on-error: "#041019"
  code-text: "#d6e4f7"
  code-muted: "#728197"
typography:
  headline-lg:
    fontFamily: "Geist Variable"
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.02em
  headline-md:
    fontFamily: "Geist Variable"
    fontSize: 1.25rem
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: "Geist Variable"
    fontSize: 1rem
    fontWeight: 600
    lineHeight: 1.3
  body-md:
    fontFamily: "Geist Variable"
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Geist Variable"
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.5
  label-caps:
    fontFamily: "Geist Variable"
    fontSize: 0.6rem
    fontWeight: 700
    lineHeight: 1
    letterSpacing: 0.12em
  caption:
    fontFamily: "Geist Variable"
    fontSize: 0.65rem
    fontWeight: 500
    lineHeight: 1.3
  code:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace"
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.65
rounded:
  none: 0px
  sm: 6px
  md: 10px
  lg: 14px
  xl: 20px
  2xl: 24px
  shell-desktop: 28px
  shell-mobile: 38px
  full: 9999px
spacing:
  micro: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  2xl: 24px
  3xl: 28px
  gutter: 8px
components:
  app-shell:
    backgroundColor: "{colors.surface-base}"
    textColor: "{colors.on-surface}"
  surface-shell:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.shell-desktop}"
  surface-sidebar:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface-soft}"
  surface-raised:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
  surface-raised-hover:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
  surface-inset:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.code-text}"
    rounded: "{rounded.lg}"
  surface-tint-success:
    backgroundColor: "{colors.success}"
    rounded: "{rounded.lg}"
  surface-tint-warning:
    backgroundColor: "{colors.warning}"
    rounded: "{rounded.lg}"
  surface-tint-danger:
    backgroundColor: "{colors.error}"
    rounded: "{rounded.lg}"
  card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.xl}"
    padding: 16px
  nav-item:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-muted}"
    rounded: "{rounded.md}"
    padding: 6px
    typography: "{typography.body-sm}"
  nav-item-hover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
  nav-item-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
  selected-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: 8px
    typography: "{typography.body-sm}"
  button-primary-hover:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 8px
    typography: "{typography.body-sm}"
  button-danger:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-error}"
    rounded: "{rounded.md}"
    padding: 8px
    typography: "{typography.body-sm}"
  chip:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface-soft}"
    rounded: "{rounded.full}"
    typography: "{typography.caption}"
  chip-active:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
  input:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    typography: "{typography.body-sm}"
  status-pill-running:
    textColor: "{colors.success}"
    rounded: "{rounded.full}"
    typography: "{typography.caption}"
  status-pill-waiting:
    textColor: "{colors.warning}"
    rounded: "{rounded.full}"
    typography: "{typography.caption}"
  status-pill-idle:
    textColor: "{colors.on-surface-muted}"
    rounded: "{rounded.full}"
    typography: "{typography.caption}"
  status-pill-error:
    textColor: "{colors.error}"
    rounded: "{rounded.full}"
    typography: "{typography.caption}"
  code-block:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.code-text}"
    rounded: "{rounded.lg}"
    typography: "{typography.code}"
  code-block-muted:
    textColor: "{colors.code-muted}"
    typography: "{typography.code}"
  divider:
    backgroundColor: "{colors.neutral-line}"
    height: 1px
---

# Agents Remote Console — DESIGN.md

本文件是 agents-remote 项目的**设计系统权威源**，采用 [Google Labs DESIGN.md](https://github.com/google-labs-code/design.md) 格式。YAML frontmatter 是机器可读的 normative token，下方 prose 解释 why 与 how to apply。它替代了过去散落在三处的设计约定（`prototype/guidelines.md` 的 hex、`web/src/styles/index.css` 的 shadcn oklch、`shell-primitives.tsx` 的裸 Tailwind 调色板），成为人 + AI 编码 agent 持续对齐的唯一标尺。

## Overview

产品气质是**深色 Server Agent Console**，不是 SaaS 营销页或后台管理列表。它服务需要远程调度与观察 Agent（Claude/Codex）和 Terminal 的操作者：浏览器是入口，服务器侧真实运行。整体应传达"克制、精密、可信赖的工程仪表盘"感。

视觉骨架由三件事决定：

- **Teal/Cyan 单一操作色**。`primary`（Glacier Cyan `#7dd3fc`）是全系统唯一的强交互驱动色——active 导航、primary 按钮、链接、terminal prompt。`secondary`（Periwinkle `#a78bfa`）只作为 primary 渐变的终点与极少次强调，不独立承担操作语义。状态色（success/warning/error）克制使用，且**必须配合文字/pill，不能只靠颜色**。
- **Tonal-layer elevation**。深度不靠重 shadow，而靠 surface 色阶差：`surface-base`（最底层背景，带轻微 teal 径向光）→ `surface`（shell/面板）→ `surface-raised`（卡片/行/按钮）→ `surface-inset`（凹陷：terminal/code/preview）。每升一层，背景色明确不同。Shadow 只留给真正脱离表面的浮层（dialog、dropdown、floating nav）。
- **紧凑信息密度**。面向工程师长时间观察运行态，宁可首屏多承载实例与输出，也不堆叠说明文案、厚卡片或低频入口。间距以 8px 为节奏，半步（2/4px）用于紧凑 toolbar。

移动端是首轮体验重点：竖屏优先，三段式（header/content/输入或底部 nav），safe-area 必须主动消费，输入区绝不遮挡输出。

## Colors

调色板扎根于高对比深色中性色 + 一个 evocative 的 cyan accent。所有颜色以 `#hex`（sRGB）表达。

- **Primary · Glacier Cyan（`#7dd3fc`）**：全系统唯一操作色。active 导航项、primary 按钮、链接、terminal prompt、选中态边框、focus ring。它足够亮，因此在它之上用 `on-primary`（`#041019` 深墨）保证对比。
- **Secondary · Periwinkle（`#a78bfa`）**：primary 渐变终点（primary button 的 `linear-gradient` 从 primary 到 secondary）。不独立承担操作语义，避免与 primary 竞争注意力。
- **Success（`#34d399`）**：running/活跃/added。Codex provider marker、terminal running 状态、git added 行。
- **Warning（`#fbbf24`）**：waiting/needs input/modified。克制使用。
- **Error（`#fb7185`）**：destructive/deleted。克制使用，背景上用 `on-error`（`#041019` 深墨）——`error` 是偏浅的 rose-400，白字对比约 3:1 不达 WCAG AA（normal text 需 4.5:1），深墨字约 6:1 达标。
- **Surface-base（`#080b10`）**：最底层背景。`html` 在其上叠 `radial-gradient(circle at top, #0f2d3a 0, #020617 34rem)` 营造 teal 氛围光。
- **Surface（`#0f1520`）**：shell 与主 panel 基底。
- **Surface-raised（`#141b28`）**：抬升表面——卡片、行、按钮、sidebar 渐变高点。
- **Surface-inset（`#05080d`）**：凹陷表面——terminal、code block、preview/diff 背景。比 surface 更深，制造"陷入"感。
- **Neutral-line（`#263245`）**：主要边框与分隔线。轻分隔用同色低透明（实现时 `rgba(148,163,184,0.18)`）。
- **On-surface（`#eef4ff`）**：主文字（近白，带极淡冷调）。
- **On-surface-soft（`#c1cad8`）**：次主文字、按钮文本、row 内容。
- **On-surface-muted（`#8d99aa`）**：辅助文字、metadata、未激活 nav 项、placeholder。
- **On-primary / On-error（`#041019`）**：primary 与 error 亮背景上的深墨文字。
- **Code-text（`#d6e4f7`）/ Code-muted（`#728197`）**：terminal/code 专用文本与 muted 行。

### DESIGN token ↔ Tailwind 调色板对照（Phase 4 收敛基准）

代码历史散写用了 Tailwind 调色板，与 DESIGN token **并非同一像素**。下表是 Phase 4 替换的权威映射——**Phase 4 是语义对齐，允许微小色差**（代码历史 slate 系偏纯灰蓝，DESIGN 系偏 teal，统一到 DESIGN 是正确方向，不要纠结 hex 精度反复调）。

| DESIGN token | hex | 对应 Tailwind | 说明 |
|---|---|---|---|
| `primary` | `#7dd3fc` | **sky-300** | **非 `cyan-300`（`#67e8f9`）**；代码历史散写的 `bg-cyan-300/10` 是偏色，替换回 `primary` 会让 active nav 从青偏回天蓝——这是修正，不是回归 |
| `secondary` | `#a78bfa` | violet-400 | 代码 `violet-300`（`#c4b5fd`）是 hover 提亮档，对应 `button-primary-hover` |
| `success` | `#34d399` | emerald-400 | 代码 `emerald-300`（`#6ee7b7`）是 tint/hover 档 |
| `warning` | `#fbbf24` | amber-400 | 代码 `amber-300`（`#fcd34d`）是 tint 档 |
| `error` | `#fb7185` | rose-400 | 代码 `rose-300`（`#fda4af`）是 tint 档 |
| `on-surface` | `#eef4ff` | ≈ slate-100 | DESIGN 略冷 |
| `on-surface-soft` | `#c1cad8` | ≈ slate-300 | |
| `on-surface-muted` | `#8d99aa` | ≈ slate-400（`#94a3b8`） | 色相略冷 |
| `neutral-line` | `#263245` | ≈ slate-800（`#1e293b`） | DESIGN 偏蓝 |
| `surface-raised` | `#141b28` | ≈ slate-900（`#0f172a`） | DESIGN 偏蓝 |
| `surface-inset` | `#05080d` | ≈ slate-950（`#020617`） | |
| orphan hex | `#0a0e16` | — | shell-primitives sidebar 渐变终点，归并到 `surface-base` |

> **透明度叠加约定**：DESIGN.md 的 color token 是 normative 实色，但 UI 中大量交互态用「某色 @ N% 透明」叠加在 surface 上（如 nav-item hover = on-surface 5%、active = primary 10%、raised-hover border = primary 60%）。实现时用 `rgb()/8-digit hex` 表达：`on-surface 5% ≈ rgb(238 244 255 / 0.05)`、`primary 10% ≈ rgb(125 211 252 / 0.10)`、`primary 60% ≈ rgb(125 211 252 / 0.60)`。
>
> **alpha 与 variant 的优先级**：variant 的 YAML 实色是其基底，alpha tint 是 stateful 渲染、在 prose 标注。**当某 variant 的视觉身份主要由 tint 决定时（如 `nav-item-active` 的视觉就是 primary 10% tint），prose 的 tint 描述优先于 YAML 实色**——agent 不要把 `nav-item-active` 当成纯 `surface` 背景实现。

## Typography

字体策略以 **Geist Variable** 为 UI 字族，等宽用 `SFMono-Regular, Consolas, Liberation Mono, monospace`。共 8 个层级，覆盖 headline / body / label / caption / code 五个角色。

> **字体栈真相**：实现为 `--font-sans: "Geist Variable", sans-serif`（`@theme inline`）。`index.css` 的 `:root font-family: Inter, ...` 栈已被 `@theme inline` 覆盖、**实际不生效**（除非 Geist 加载失败回退到 `sans-serif`）。YAML 的 `fontFamily: "Geist Variable"` 是主字族；如需保留 Inter 兜底，需在 `--font-sans` 显式写回。不要按 YAML 字面把 `--font-sans` 改成裸 `"Geist Variable"`——会丢 `sans-serif` 兜底。

- **Headline（lg/md/sm）**：600 Semi-Bold，用于页面标题与区段标题。lg=24px、md=20px、sm=16px，负字距收紧（-0.02em / -0.01em）。
- **Body（md/sm）**：400 Regular，主文本。body-md=14px（页面正文、项目名），body-sm=12px（nav 项、label、toolbar——**系统最高频字号**）。
- **Label-caps**：700 Bold，`0.6rem` (≈10px)，`uppercase` + `letter-spacing: 0.12em`。用于 eyebrow / section label / status pill 文字。**统一用 `0.12em` 字距**（收敛历史 `tracking-[0.12em]` 与 `tracking-wide` 并存）。**品牌展示标题例外**：登录页（AuthGate）等刻意拉宽的品牌大标题保留 `0.28em`，不强制收敛。
- **Caption**：500 Medium，`0.65rem`，metadata 与紧凑计数（如 `3A`/`2T`）。
- **Code**：400，`0.75rem`，`line-height: 1.65`（terminal/code 需要宽松行高）。移动端 terminal 可降到 `11px / 1.58`。

**字重约束**：单屏不超过两种字重组合（典型：400 正文 + 600 标题；eyebrow 用 700 属同一标题语义族）。

## Layout

布局遵循**响应式三段/三栏**模型，8px spacing scale 贯穿。

- **Spacing scale**：`micro 2px` / `xs 4px` / `sm 8px` / `md 12px` / `lg 16px` / `xl 20px` / `2xl 24px` / `3xl 28px`，外加 `gutter 8px`。卡片内部优先 `md–lg`（12–16px）padding，大容器用 `xl–3xl`（20–28px）。紧凑 toolbar 用 `micro–xs`（2–4px）。
- **桌面工作台**：三栏——左 rail（跨项目树，一级 220px / 二级 210px）+ 中栏实例区（split 多实例）+ 右栏 inspection tabs（Files/Git/原型）。三栏均 `minmax(0, 1fr)` 或固定宽，内部各自滚动。
- **移动工作台**：两层导航——一级底部胶囊（项目/全局/设置）+ 二级 header tab。列表态 = header + 内容 + 底部 nav；聚焦态 = header（◄ 返回 + 实例名 + tab 行）+ 单实例内容，底部让位给输入区。三段式 grid：`header` 置顶 / `content minmax(0,1fr)` / `input 或 nav` 置底，超出只在 content 滚动。
- **Safe-area**：`viewport-fit=cover` 下内容默认贴刘海后方，header/grid 主动消费 `env(safe-area-inset-top)`；底部交互元素（nav、输入框）的 `padding-bottom` 消费 `env(safe-area-inset-bottom)`。**铁律：同一方向同一元素，视口高度单位（`vh`/`dvh`）与 `env(safe-area-inset-*)` 二选一，不叠加**（详见 `frontend-notes.md` §1）。
- **视口高度**：PWA standalone 用 `vh`，非 PWA 浏览器用 `dvh`（回避动态地址栏）。通过 `--app-viewport-height` + `@media (display-mode: standalone)` 切换。
- **动画节奏**（motion）：`--ease-standard: cubic-bezier(0.4,0,0.2,1)`（默认）、`--ease-emphasized: cubic-bezier(0.2,0,0,1)`（进场）、`--ease-exit: cubic-bezier(0.4,0,1,1)`（退场）；时长 `--duration-fast 120ms` / `base 180ms` / `slow 280ms`。`prefers-reduced-motion` 下全部收敛为静态。

## Elevation & Depth

深度通过 **Tonal Layers** 表达，而非重 shadow。四层 surface 色阶（base → surface → raised → inset）本身就是层级语言：观察者一眼能看出"哪个元素浮在哪个之上"。

- **Base layer**：`surface-base` + teal radial-gradient 氛围光，全屏背景。
- **Shell layer**：`surface`，app 外壳与主 panel。
- **Raised layer**：`surface-raised`，卡片、行、按钮、sidebar。与 shell 形成 `#0f1520` vs `#141b28` 的明确色差。
- **Inset layer**：`surface-inset`（`#05080d`），比 shell 更深，制造凹陷——terminal screen、code block、preview/diff 背景。

**Shadow 只用于真正脱离表面的浮层**，且收敛为两档（收敛历史 `shadow-black/{20,30,40,50}` 四种散乱）：

- **浮层阴影**（dialog、dropdown menu、floating nav、prompt/confirm dialog）：`shadow-2xl` + `shadow-black/40`。
- **轻浮层**（flyout、popover）：`shadow-xl` + `shadow-black/20`。

不要给卡片、行、按钮加 shadow——它们的层级由 surface 色阶 + `neutral-line` 边框表达。`raised-hover` 用边框色变化（`primary 60%`）而非 shadow 提示交互。

**Scrim（模态遮罩）**：dialog/dropdown 背后的半透明遮罩用 `rgb(0 0 0 / 0.6)`（纯黑 60%，非 surface token——遮罩需要中性衰减，不是层级色）。

## Shapes

形状语言是**一致的圆角档位**，收敛历史中 7 种散乱 arbitrary 值（`0.625/0.875/0.9375/1.25/1.5/1.75/2rem`）。

**通用档**（用于内部组件）：

| 档 | 值 | 用于 |
|---|---|---|
| `none` | 0 | 分隔线、无圆角分割 |
| `sm` | 6px | marker sm、小图标容器 |
| `md` | 10px | **按钮、input、nav item**（= 基准 `--radius`） |
| `lg` | 14px | 卡片、行容器、surface-raised、code-block、**marker md** |
| `xl` | 20px | 大卡片、flyout |
| `2xl` | 24px | dialog、workspace panel |
| `full` | 9999px | pill、status pill、圆形 marker |

**Frame 专用档**（仅 app 外壳 frame，**禁止用于内部组件**）：

| 档 | 值 | 用于 |
|---|---|---|
| `shell-desktop` | 28px | 桌面 shell 外壳 |
| `shell-mobile` | 38px | 移动 shell 外壳 |

**何时用哪档**：交互元素（按钮/nav/tab）统一 `md`（10px）；内容容器（card/row/code）统一 `lg`（14px）；大浮层（dialog/flyout）用 `xl`–`2xl`。**不要在同一视图混用 rounded 与 sharp corners**，也不要为单个组件私自引入 `rounded-[1.5rem]` 之类的 arbitrary 值——若现有档位不够，先在 DESIGN.md 加档，再全系统复用。

> **历史值收敛**：`rounded-[0.9375rem]`（IconMarker md，15px）→ `rounded-lg`（14px，差 1px 可接受）；`rounded-[0.625rem]`（marker sm）→ `rounded-sm`；`rounded-[0.875rem]`（NavItemContent）→ `rounded-lg`；`rounded-[1.25rem]`（project card）→ `rounded-xl`；`rounded-[1.5rem]`（dialog/flyout）→ `rounded-2xl`；`rounded-[1.75rem]`（mobile nav bar）→ `rounded-2xl` 或保留为 frame 档。

## Components

组件 variants 用 `{token}` 引用 normative token。下方 prose 补充每个 variant 的状态色（含 alpha 叠加）与边界。

- **nav-item / nav-item-hover / nav-item-active**：导航行（左 rail 项目/实例、移动 header tab、right-panel tab）。默认 `on-surface-muted` 文字 on `surface`，`rounded-md`，padding ≈ `6px 8px`，typography `body-sm`。**hover**：文字升到 `on-surface`，背景叠 `on-surface 5%`。**active**：文字切到 `primary`，背景叠 `primary 10%`，可配 `primary 30%` 边框。这三态是全系统最高频交互单元——`right-panel-tabs.tsx`、`mobile-workbench.tsx`、`split-panel.tsx` 历史中各自复刻过同套模式，必须收敛为单一 primitive。
- **selected-row**：比 nav-item-active 更重的"已选中"态（如 list 中已选文件/实例）。`rounded-lg`，border `primary 60%` + bg `primary 10%`，文字 `primary`。区别于 active（当前焦点）——selected 是持久选中标记。
- **button-primary / -hover**：primary 操作（创建实例、确认）。**默认渲染为 `linear-gradient(135deg, primary, secondary)`（`bg-gradient-to-br from-primary to-secondary`）**，文字 `on-primary`，`rounded-md`，padding `8px`。YAML 的 `backgroundColor: primary` 是 gradient 起点的 normative fallback（对比度基准 + 不支持 gradient 场景）。**hover**：gradient 提亮一档（`from-sky-200 to-violet-300`），可叠 `shadow-lg shadow-cyan-950/25`。
- **button-secondary**：次要操作（取消、辅助、**close 按钮**）。`surface-raised` 背景，`on-surface` 文字，`rounded-md`。hover 叠 `on-surface 5%` 或 `surface-raised` 加深。
- **button-danger**：destructive（删除实例、销毁确认）。`error` 背景，`on-error` 深墨字（`error` 是 rose-400，白字对比约 3:1 不达 WCAG AA 4.5:1，深墨字约 6:1 达标）。**克制使用——仅确认对话框里的销毁动作；window/terminal close 按钮用 button-secondary/ghost，不要做成 danger**。
- **surface-shell / surface-sidebar / surface-raised / surface-raised-hover / surface-inset**：surface 角色（收敛 `shellSurfaceClasses`）。`surface-shell` = app 外壳 `surface` + `rounded-shell-desktop`；`surface-sidebar` = `surface-raised` 带 `from surface-raised/25 to surface-base/30` 纵向渐变；`surface-raised` = 卡片/行基底；`surface-raised-hover` = 交互行 hover，边框 `primary 60%`、背景 `surface-raised` 加深；`surface-inset` = terminal/code/preview 凹陷，`surface-inset` + `rounded-lg`。
- **surface-tint-success / -warning / -danger**：状态色作 surface tint（git added/modified/deleted 行、provider marker 背景等）。`rounded-lg`，背景为对应状态色 **@10% alpha**（`rgb(52 211 153 / 0.10)` 等），文字用对应状态色的实色或 `on-surface`。YAML 实色是 normative 基准，@10% 是渲染。
- **card**：Project/Agent/Terminal 卡片。`surface-raised` + `rounded-xl`（20px）+ `neutral-line` 边框 + padding `lg`（16px）。Agent card 可用 `2xl`（24px）。卡片服务可扫读性，不为 metadata 牺牲首屏密度。
- **chip / chip-active**：紧凑计数与标签（如 `3A`/`2T`、provider 标记）。`surface-raised` + `rounded-full` + `caption` 字号。active 态文字 `primary` + `primary 10%` 背景。
- **input**：文本输入（ShellInput、prompt dialog）。`surface-inset` 背景 + `neutral-line` 边框 + `rounded-lg` + `body-sm`。placeholder 用 `on-surface-muted` 更弱版（`placeholder:text-on-surface-muted/60`）。
- **focus-ring**（全系统交互元素统一）：`focus-visible` 用 primary 系——`ring-2 ring-primary/30 ring-offset-2 ring-offset-surface`。收敛历史 `ring-cyan-300/20` 与 `/30` 两套。
- **disabled**（通用规则）：所有 button/nav/input variant 的 disabled 态统一 `opacity-50 cursor-not-allowed`，不单独定义每个 variant 的 disabled 色。
- **status-pill-running / -waiting / -idle / -error**：状态药丸。`rounded-full` + `caption`，文字色 = 对应状态色（success/warning/on-surface-muted/error）。**状态语义必须有文字参与，不能只靠颜色**。padding ≈ `2px 8px`。
- **code-block / code-block-muted**：terminal/code 块。`surface-inset` + `code-text` + `rounded-lg` + `code` typography（`0.75rem / 1.65`）。muted 行（注释、次要输出）用 `code-block-muted`（`code-muted` 文字）。
- **divider**：分隔线。`neutral-line` 实色 `1px`，宽度跟随容器；轻分隔用同色低透明（`rgba(148,163,184,0.18)`）。

## Do's and Don'ts

- **Do** 维持 WCAG AA 对比度（正文 4.5:1）。`on-surface`/`on-surface-soft` 在深色 surface 上达标；`on-surface-muted` 仅用于 ≥12px 的非关键 metadata。
- **Do** 让每个交互态引用统一 variant token：nav 行用 `nav-item-*`、按钮用 `button-*`、surface 用 `surface-*`。新增组件先查本文件是否已有同语义 variant。
- **Do** 用 surface 色阶 + `neutral-line` 边框表达层级，浮层才用 shadow。
- **Do** 状态色配合文字/pill（running/waiting/idle/error 必须有 label）。
- **Do** focus 态统一用 `focus-ring` 样式（无障碍 + 一致性）。
- **Don't** 在同一视图混用 rounded 档与 sharp corners，也不要散写 `rounded-[1.5rem]` 之类 arbitrary 值。
- **Don't** 散写裸 Tailwind 调色板（`bg-cyan-300/10`、`text-slate-400`、`border-white/5`、`hover:bg-white/5`）绕过 token——它们正是本次样式混乱的来源。改用对应 `nav-item-active`/`on-surface-muted`/`neutral-line`/`nav-item-hover` 语义（对照见 Colors 节映射表）。
- **Don't** 单屏使用超过两种字重组合。
- **Don't** 给卡片/行/按钮加 shadow 制造假层级——那只会在深色主题里产生脏灰雾。
- **Don't** 把所有 close 按钮做成 danger——close 用 `button-secondary`，仅销毁确认用 `button-danger`。
- **Don't** 在同一方向同一元素叠加视口单位（`vh`/`dvh`）与 `env(safe-area-inset-*)`——会双重扣减（详见 `frontend-notes.md` §1）。

## Migration & Mapping (Phase 2)

Phase 2 把 DESIGN token 落到 `web/src/styles/index.css` 的 `@theme inline`。**本节是 Phase 2 能否启动的硬前提**——缺它则 oklch/hex 转换、shadcn 让位、radius 命名三座桥都过不去。

### Color token → Tailwind v4 变量映射

每个 DESIGN color token `xxx` 映射为 `--color-xxx`（连字符保留），Tailwind v4 自动生成 `bg-xxx`/`text-xxx`/`border-xxx` 工具类：

- `--color-primary: #7dd3fc` → `bg-primary`/`text-primary`/`border-primary`
- `--color-surface-raised: #141b28` → `bg-surface-raised`
- `--color-on-surface-soft: #c1cad8` → `text-on-surface-soft`
- `--color-neutral-line: #263245` → `border-neutral-line`
- 其余 13 色同理（全 17 色）。

带连字符的 token 名（`surface-raised`、`on-surface-soft`）映射成 `--color-surface-raised` 合法，不与现有 `--color-sidebar-*` 冲突（shadcn sidebar 变量并入 `surface-sidebar`）。

### shadcn oklch 灰度变量处置（让位策略）

现有 shadcn `--primary`/`--secondary`/`--accent`/`--card` 等是**灰度 oklch**（`oklch(0.269 0 0)` 等），与 DESIGN 的 cyan/surface hex 冲突。处置原则：

- **中性变量对齐**：shadcn ui 组件（button/dropdown/dialog）消费的 `--background`/`--foreground`/`--border`/`--ring`/`--card` 从 oklch 转 hex，对齐 DESIGN surface/on-surface/neutral-line（视觉等价或微调）。`--ring` 对齐 primary cyan（focus ring 基色）。
- **`--accent` 让位**：shadcn 的 `--accent`（灰度）语义被 DESIGN `primary`（cyan）取代——新增 `--color-primary`（cyan），shadcn 消费 `--accent` 的点（button accent variant）改指向 `--color-primary`。
- **逐变量映射表**在 Phase 2 plan 落实时给出（本节给原则，避免现在过度细化）。

### Radius 命名决策（方案 A：覆写 `--radius-*`）

**选方案 A**：覆写 `@theme inline` 的 `--radius-*`，让 Tailwind `rounded-*` 工具类对齐 DESIGN 档（符合"唯一标尺"原则，避免双轨）。

| Tailwind 工具类 | 现值（shadcn） | 新值（DESIGN） | 语义平移 |
|---|---|---|---|
| `rounded-sm` | 6px | 6px（sm） | 无 |
| `rounded-md` | 8px | 10px（md） | 原 md 元素变圆 +2px |
| `rounded-lg` | 10px | 14px（lg） | 原 lg 元素变圆 +4px |
| `rounded-xl` | 14px | 20px（xl） | 变圆 +6px |
| `rounded-2xl` | 18px | 24px（2xl） | 变圆 +6px |
| `rounded-3xl` | 22px | （并入 2xl） | 改用 `rounded-2xl` |
| `rounded-4xl` | 26px | （并入 shell） | 改用 `rounded-shell-desktop` |

Phase 2 需**全量回归**现有 `rounded-md/lg/xl/2xl` 元素（视觉变圆，是预期效果）。`button.tsx` 的防御式 `rounded-[min(var(--radius-md),10px)]` 可简化为 `rounded-md`。

新增 `--radius-shell-desktop: 28px` / `--radius-shell-mobile: 38px` 作 frame 专用，生成 `rounded-shell-desktop`/`rounded-shell-mobile`，仅用于 app 外壳。

### Spacing & Typography 命名空间

- `--spacing-*`：新增 `--spacing-micro/xs/sm/md/lg/xl/2xl/3xl`，Tailwind v4 的 `p-*`/`gap-*`/`m-*` 默认基于 `--spacing` 基数，半步（`micro`/`xs`）需显式定义或用 arbitrary。
- `--font-*`：保留 `--font-sans: "Geist Variable", sans-serif`；等宽新增 `--font-mono: "SFMono-Regular", Consolas, Liberation Mono, monospace`。
