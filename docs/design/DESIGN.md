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
  activity-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-muted}"
    width: 48px
  activity-bar-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-muted}"
    rounded: "{rounded.md}"
    iconSize: 20px
  activity-bar-button-hover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
  activity-bar-button-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    borderLeft: "2px solid {colors.primary}"
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

### Content role colors（Claude2 session 消息角色色）

Claude2 session（及用 assistant-ui 渲染的 tool / hook / attachment 组件）用一套**内容角色色**区分消息角色：assistant（Claude 输出）/ user（用户输入）/ permission（permission mode 标记）。它们是**内容语义**，与 `primary`（操作色）正交——不承担 active nav / primary 按钮 / 链接等操作语义，只标识「这条内容属于哪个角色」。

每个角色 3 档（main / soft / deep），用 alpha 表达层次（深 bg / 浅 text 成对），覆盖历史散写的 amber / cyan / violet 色阶：

| token | hex | 对应 Tailwind | 用途 |
|---|---|---|---|
| `assistant` | `#fbbf24` | amber-400 | 主色：border / ring / icon / badge 主 |
| `assistant-soft` | `#fde68a` | amber-200 | 浅文字：badge text / label on deep bg |
| `assistant-deep` | `#92400e` | amber-800 | 深 bg：plan body 气泡 / hook 容器 |
| `user` | `#22d3ee` | cyan-400 | 主色：icon / typing dots / active |
| `user-soft` | `#67e8f9` | cyan-300 | 浅文字 / icon 提亮 |
| `user-deep` | `#0e7490` | cyan-700 | 深 bg：user 气泡 |
| `permission` | `#a78bfa` | violet-400 | 主色（permission mode 标记）|
| `permission-soft` | `#c4b5fd` | violet-300 | hover 提亮 |

**散写 → token 映射**：`amber-400/500` → `assistant`、`amber-200/300` → `assistant-soft`、`amber-600~950` → `assistant-deep`；`cyan-400/500` → `user`、`cyan-200/300` → `user-soft`、`cyan-700` → `user-deep`；`violet-400/500` → `permission`、`violet-300` → `permission-soft`。各档用 `/N` alpha 表达交互层次（badge bg `assistant/20`、hover `assistant/30` 等），复用上方通用透明度叠加约定。

> **`assistant`/`warning` 同 hex（`#fbbf24`）、`permission`/`secondary` 同 hex（`#a78bfa`）是刻意的**——语义独立（角色 vs 状态 / 渐变终点），分开 token 让代码读出「这是 assistant 角色」而非「这是 warning」，且未来可按角色独立调色相（如 codex 接入时 `assistant` 改用 codex 品牌色，不影响 warning）。

### Phase 5 散写收敛映射（操作色 / 灰度 / 状态色 / shadow / Skill）

Phase 4 收敛 Claude2 内容角色色后，剩余散写（操作色 cyan、灰度 slate、状态色 emerald/rose、shadow、Skill purple）按本表收敛到**既有 token**（不新增）。这是 Phase 3/4 收敛的收尾，让 `web/src` 全部色阶归 token 管理。收敛工作流（怎么发现散写、怎么分批、怎么验证）见 `frontend-notes.md` §2。

**操作色 cyan → `primary`**（DESIGN `primary`=sky-300 `#7dd3fc` 是正色，历史散写的 `cyan-300` `#67e8f9` 是偏色——替换回 `primary` 是修正，不是回归）：`cyan-300` → `primary`、`cyan-200`（hover 提亮）→ `primary/90`、`cyan-400`（markdown 链接，链接是操作色）→ `primary`。

**灰度 slate → surface token**（按 **bg / text / border 上下文**，非按档位机械替换）：

| slate 档 | bg → | text → | border → |
|---|---|---|---|
| slate-950 | `surface-inset` | — | — |
| slate-900 | `surface-base` / `surface-raised` | — | — |
| slate-800 | `surface` | — | `neutral-line` |
| slate-700 | `surface-raised` | — | `neutral-line` |
| slate-600 | — | `on-surface-muted` | `neutral-line` |
| slate-500 / slate-400 | — | `on-surface-muted` | — |
| slate-300 / slate-200 | — | `on-surface-soft` | — |
| slate-100 | — | `on-surface` | — |

> 同一 slate 档在 bg / text / border 不同语义，必须按上下文分桶映射（如 `slate-800` 做 bg → `surface`、做 border → `neutral-line`），不能机械按档位 sed。

**状态色 emerald / rose / red → `success` / `error`**：`emerald-*` → `success` 系（compact 摘要 / diff add 线）、`rose-*` / `red-*` → `error` 系（destructive / danger / isError 态；red 与 rose 同属红色错误语义，统一收敛到 error token，red→rose 微偏粉属允许色差）。状态色只有单档 token（`success` = emerald-400 `#34d399`、`error` = rose-400 `#fb7185`），原散写的多档一律收敛到对应 token + **保留原 `/N` alpha 表达层次**（`bg-emerald-950/10` → `bg-success/10`、`border-emerald-800/30` → `border-success/30`、`text-emerald-200` → `text-success`、`text-rose-300` → `text-error` 等）。emerald-400 / rose-400 档零变化（同 hex）；浅档（emerald-200、rose-200）文字略变深、深档（emerald-700/800/950）bg/border 略变亮，属本节允许的微色差。

**shadow → `primary` / `error`**：`shadow-cyan-950/N` → `shadow-primary/N`（primary 元素 glow；cyan-950 深暗 vs primary 亮，半透明 shadow 略变亮，微色差可接受）、`shadow-rose-950/N` → `shadow-error/N`。

**Skill purple → `permission`**：`purple-400` → `permission`、`purple-200` → `permission-soft`（Skill footer；purple-400 ≈ violet-400，视觉接近；Skill 用 permission 色族区分）。

## Typography

字体策略以 **Geist Variable** 为 UI 字族，等宽用 `SFMono-Regular, Consolas, Liberation Mono, monospace`。共 8 个层级，覆盖 headline / body / label / caption / code 五个角色。

> **字体栈真相**：实现为 `--font-sans: "Geist Variable", sans-serif`（`@theme inline`）。`index.css` 的 `:root font-family: Inter, ...` 栈已被 `@theme inline` 覆盖、**实际不生效**（除非 Geist 加载失败回退到 `sans-serif`）。YAML 的 `fontFamily: "Geist Variable"` 是主字族；如需保留 Inter 兜底，需在 `--font-sans` 显式写回。不要按 YAML 字面把 `--font-sans` 改成裸 `"Geist Variable"`——会丢 `sans-serif` 兜底。

- **Headline（lg/md/sm）**：600 Semi-Bold，用于页面标题与区段标题。lg=24px、md=20px、sm=16px，负字距收紧（-0.02em / -0.01em）。
- **Body（md/sm）**：400 Regular，主文本。body-md=14px（页面正文），body-sm=12px（nav 项、label、toolbar——**系统最高频字号**）。**项目名**用 headline-sm（16px/600），语义为分组标题（批 J / 决策 33）。
- **Label-caps**：700 Bold，`0.6rem` (≈10px)，`uppercase` + `letter-spacing: 0.12em`。用于 eyebrow / section label / status pill 文字。**统一用 `0.12em` 字距**（收敛历史 `tracking-[0.12em]` 与 `tracking-wide` 并存）。**品牌展示标题例外**：登录页（AuthGate）等刻意拉宽的品牌大标题保留 `0.28em`，不强制收敛。**已落地 primitive = `ShellSectionLabel`**（typography 固定，padding 由调用方按所在容器控——左栏 `px-2` / 中栏 `px-3` / 父容器控）。
- **Caption**：500 Medium，`0.65rem`，metadata 与紧凑计数（如 `3A`/`2T`）。
- **Code**：400，`0.75rem`，`line-height: 1.65`（terminal/code 需要宽松行高）。移动端 terminal 可降到 `11px / 1.58`。

**字重约束**：单屏不超过两种字重组合（典型：400 正文 + 600 标题；eyebrow 用 700 属同一标题语义族）。

## Layout

布局遵循**响应式三段/三栏**模型，8px spacing scale 贯穿。

- **Spacing scale**：`micro 2px` / `xs 4px` / `sm 8px` / `md 12px` / `lg 16px` / `xl 20px` / `2xl 24px` / `3xl 28px`，外加 `gutter 8px`。卡片内部优先 `md–lg`（12–16px）padding，大容器用 `xl–3xl`（20–28px）。紧凑 toolbar 用 `micro–xs`（2–4px）。
- **桌面工作台**：三栏——左 rail（跨项目树，一级 220px / 二级 210px）+ 中栏实例区（split 多实例）+ 右栏 inspection tabs（Files/Git）。三栏均 `minmax(0, 1fr)` 或固定宽，内部各自滚动。全局总览的中栏 tab 行额外有 Files（根目录 = `PROJECTS_ROOT`，只读列所有项目目录；进入某项目子目录后切换为该项目的可写 files，复用项目 files API）。
- **移动工作台**：两层导航——一级底部胶囊（项目/全局/设置）+ 二级单行 header。**一级底部胶囊宽度按内容收缩（`w-fit`），不贴满视口，参考苹果 tab bar：item 自带横向 padding `px-4`（触摸友好、item 本身宽），item 间 `gap-4` ≈ 16px，胶囊整体占视口约 60%**。列表态与聚焦态 header 同款单行结构：◄ 返回 + tab 横滚区（`flex-1 overflow-x-auto` 隐藏滚动条）+ 右侧 `shrink-0` 区（列表态=项目名/全局标题，聚焦态=ℹ✕ 胶囊操作区）。**移动 header 高度统一 `h-11`、padding `px-3`**：`MobilePageHeader`（一级大标题式：项目列表 / 设置）与 `MobileTabHeader`（tab 横滚式：全局总览 / 项目总览 / 聚焦态）两套 primitive 并存但视觉高度 + padding 对齐，覆盖所有移动 header。项目列表态合并旧「MobilePageHeader + 二级 tab 行」为单行（对齐聚焦态），tab 多时横滚不换行，项目名右侧 `truncate`。聚焦态 = 单实例内容，底部让位给输入区。三段式 grid：`header` 置顶 / `content minmax(0,1fr)` / `input 或 nav` 置底，超出只在 content 滚动。
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

- **nav-item / nav-item-hover / nav-item-active**：导航行（左 rail 项目/实例、移动 header tab、right-panel tab）。默认 `on-surface-muted` 文字 on `surface`，`rounded-md`，padding ≈ `6px 8px`，typography `body-sm`。**hover**：文字升到 `on-surface`，背景叠 `on-surface 5%`。**active**：文字切到 `primary`，背景叠 `primary 10%`，可配 `primary 30%` 边框。这三态是全系统最高频交互单元——`right-panel-tabs.tsx`、`mobile-workbench.tsx`、`split-panel.tsx` 历史中各自复刻过同套模式，**已收敛为 `NavItemContent` 单一 primitive**（horizontal：`px-2 py-1.5` 即 8/6px、`rounded-md`、`gap-2.5`；vertical mode 供移动底部 nav，`px-4 py-1.5` 即 16/6px，触摸友好）。YAML `padding: 6px` 指垂直值，水平 8px 见 prose `6px 8px`。剩余 tab 变体（移动触摸 `px-3 py-3`、紧凑 tab `px-2.5 py-1`）待后续统一。**workbench group tab（`TabChip`）已收敛到 nav-item 设计语言**：active 用 `bg-primary/10 text-primary`（品牌色，非旧 `bg-on-surface/10` 中性灰胶囊）、`gap-2.5 px-2 py-1.5 rounded-md` 对齐 `NavItemContent`；marker 用 `xs` 裸 icon（见 card 段 marker 三档）；✕ close 是 tab 特有动作（nav-item 无），`h-4 w-4` 紧贴 label 右侧。**左栏是经典两层侧栏导航**：① **顶层 peer**（全局总览节点 + 「项目」section header）同级——marker 对齐到同一条左边线（视觉 9px = `Button` base `border border-transparent` 1px + `NavItemContent` `px-2` 8px；手写折叠 button 显式加 `border-transparent` 对齐 `Button` border 模型，否则少 1px 与 nav 行错位）、行高等高（section header 行去双重 `py-1.5`，仅按钮内 `py-1.5`，与全局节点 Button outer 同 42px），样式相似（同 marker + label + hover/active token，section header 多收起箭头 + `+` 新建按钮）。② **项目子项**缩进在「项目」header 下（`pl-4` 16px + 基线 9 = marker 25px），marker 25px 与顶层 9px 明确分层，体现父子关系。**不靠缩进区分顶层 peer，只靠缩进区分父子**——peer 间靠 marker tone（default vs success）+ 收起箭头/新建按钮区分语义，而非缩进。**左栏整列共用同一行模型 + 同一条左边线**（含底部 footer 设置入口）：所有可点击行统一 `NavItemContent horizontal` 语义——`gap-2.5 px-2 py-1.5 rounded-md` + `border border-transparent`（复刻 `Button` border 模型，使 marker/icon 左缘恒落在 9px = border 1 + `px-2` 8）；footer 设置容器用 `py-2`（**去水平 padding**，避免容器 `p-2` 与按钮 `px-2` 双层叠加把 icon 推到 16px 偏离 nav marker），使设置入口裸 icon 左缘也落 9px、与全列 marker 对齐成一条左边线。**IconMarker sm 内部 icon 统一 `h-3.5 w-3.5`**（14px，对齐 `sessionMarker` sm 全栈约定 `shell-primitives:717`；左栏 globe/project header/项目子项三处 marker 内部 icon 等大）。**裸 icon（非 marker 内）分两档，刻意不同尺寸表达层级**：① 身份性裸 icon（设置齿轮、`+` 新建）= `h-3.5`（与 marker 内 icon 同权重，代表入口/动作身份）；② 控件指示器（收起 chevron）= `h-3`（比身份 icon 小一档——chevron 是次要控件，与 `text-sm` 14px label 配比 12px 更协调；为统一而把 chevron 也拉到 14px 反而抹掉「控件 vs 身份」的层级）。
- **activity-bar / activity-bar-button[/-hover/-active]**：VSCode 式一级导航竖工具条（桌面活动栏，设计 `activity-bar-redesign.md`）。列宽 48px（`w-12`），常驻不受左栏折叠影响。**button** = icon-only `h-10 w-10`（40px，触摸友好）+ `rounded-md`，内部 icon `h-5 w-5`（20px，比 content nav 的 `h-3.5` 大一档，体现一级导航权重），默认 `on-surface-muted`。**hover**：文字升 `on-surface` + `bg-on-surface/5`。**active**：**左边线 marker** `border-l-2 border-primary`（VSCode 式左竖条）+ 文字 `primary`——区别于 content 级 `nav-item-active` 的 `bg-primary/10` tint：一级导航 icon-only 按钮无文字块，背景 tint 视觉太重，改用「左边线 + 文字色」表达 active。`<ActivityBar>` primitive（`shell/activity-bar.tsx`）+ `activityBarButtonClasses({active})` 生成器；active 态由 `workbenchNavAtom`（localStorage，不进 URL）驱动。`border-l-2` 在非 active 态用 `border-transparent` 占位，避免 active 切换时按钮内容位移。[设置] 项特例（决策 44，取代旧跳 `/settings` 路由）：`mt-auto` 置底（与主组 projects/files 之间由 `margin-top:auto` 撑开贴底，VSCode 式主组 + 底部分离）+ onClick 开 `SettingsDialog` 居中弹窗（`useState` 触发，不离开工作台、不切 nav state）。设置按钮 active 由 `settingsOpen` 驱动（非 `workbenchNavAtom`）。移动端 [设置] 仍走底部胶囊 `<Link to="/settings">` 全屏路由（Phase 4 `MobilePrimaryNav`），桌面端 `/settings` 路由保留但 ActivityBar 不再 navigate。**设置内容两层结构（决策 48，Apple 设置范式）**：`SettingsDialog`（桌面弹窗）/`SettingsRoute`（移动全屏）共享 `SettingsContent`，改两层——root = 3 个 grouped ListRow 入口胶囊（Providers / Claude 运行时 / 通用），整行点击进 detail；detail = 该项具体配置控件直接堆叠（**不再有 grouped 胶囊**），header 返回切换（桌面弹窗内 header 返回箭头 / 移动 `MobilePageHeader` back prop），不进 URL（`activeSection` 组件内 state，外壳持有、`SettingsContent` 接 props 单向流）。**桌面弹窗固定高度**：`SettingsDialog` 内容容器用 `h-[75vh]`（**非** `max-h`）+ header `shrink-0` + 内容区 `flex-1 min-h-0 overflow-y-auto`——root/detail 切换浮窗高度零跳变（root 内容少时下方留白、detail 内容多时内部滚动），对齐 Apple/VSCode 设置面板固定尺寸范式；header 固定不滚。**移动 detail 隐藏一级导航**：`SettingsRoute` root 态渲染 `<MobilePrimaryNav>`（底部项目/文件/设置胶囊），detail 态**隐藏**——对齐 Apple 设置 detail 全屏沉浸（detail 有 header 返回，底部 tab 不该占）；内容区底部 padding 跟随（root `pb-24` 留 nav 高度、detail `pb-8` 收紧）。**设置 Card 用 `bg-surface` 实色面板范式**：设置弹窗内容区底是 `bg-surface-raised/15`（半透明，混出 ≈#0d131e 的浅底），若 Card 用默认 `bg-card`（=surface-raised #141b28 实色），虽比底亮但 `ring-foreground/10` 轮廓几不可见，Card 边界糊进底里 → 观感"暗沉"（不像 Apple 黑底上明显浮起的亮卡片）。改与活动栏 nav 同款范式：Card 覆盖 `bg-surface`（#0f1520 实色，活动栏 nav `bg-surface` 同源）+ `border border-neutral-line`（可见边框，对齐活动栏 `border-neutral-line/60`）——实色 + 可见边框让 Card 在半透明底上清晰浮出，对齐 Apple 设置 grouped 卡片的明确边界。settings 全部 4 个 Card（root 3 胶囊 / ProvidersSection provider 列表 / Claude runtime 控件 / GeneralSection 占位）统一此范式。**移动端内容区底对齐桌面弹窗**：`SettingsRoute` main 外壳仍用 `shellSurfaceClasses.shell`（移动端全局一致），但内容滚动区加 `bg-surface-raised/15`，与桌面 `SettingsDialog` 内容区底同款——否则移动端列表 Card(`bg-surface`) 落在 main 的 `bg-surface/20`(更暗)上，与桌面弹窗底 `bg-surface-raised/15`(更亮)不同档，同个 Card 两端颜色对比不一致（桌面端 Card 凹陷浮出、移动端 Card 与底同色浮不出）。两端内容区底统一后，列表 Card 颜色对比关系两端一致。
- **selected-row**：比 nav-item-active 更重的"已选中"态（如 list 中已选文件/实例）。`rounded-lg`，border `primary 60%` + bg `primary 10%`，文字 `primary`。区别于 active（当前焦点）——selected 是持久选中标记。**`ListGroup` 连续行内的 selected 是特化覆盖**：去 border、纯 `bg-primary/10`（见 list 条目）。
- **list（ListGroup + ListRow，全局列表契约）**：iOS Files 范式——**列表样式由列表性质决定，不由视口决定**。会滚动/内容多的「内容列表」（Files 文件列表、Git 改动列表、历史 session 列表）一律用 **plain** 连续行：两端一致 `divide-y divide-neutral-line/40`（Tailwind v4 实现 = 除末行外每行底部 1px separator，选择器 `> :not(:last-child)`，**非每行 gap**），无外框/圆角/卡片，贴外部 `p-3`（**顶部例外**：ListGroup 上方是带 `border-b` 的 header——PathBreadcrumb / Git scope chips / 左栏 PanelHeader——时，外部容器去 padding-top 用 `px-3 pb-3` 而非 `p-3`，首行 box 紧贴 header border-b，与行间 divide-y「border 分隔 + box 紧贴」一致；否则首行 box 上方留白 12px vs 行间 0 缝隙，首行视觉"悬空"不整齐。Files / Git 列表已按此，history 列表 ListGroup 紧贴 ShellSectionLabel 同理）。plain 比每行圆角卡片 + gap 更紧凑（行间无线间距），但行高仍 `px-3 py-2.5` ≈50px 保证触摸/可读。**短/固定/分组列表**（Settings providers 等）用 **grouped**（Apple Settings 范式）：外层 `Card className="gap-0 py-0"` + `CardContent className="p-0"` 圆角卡，内层同一 `ListGroup`/`ListRow` divide-y；整行点击进详情/编辑，destructive 收进行尾 ⋯。调用点：`settings-dialog.tsx` ProvidersSection provider 列表 + **设置页 root 层 3 个入口胶囊**（Providers / Claude 运行时 / 通用，决策 48）；点入 detail 层后该项具体配置不再用 grouped、改表单控件直接堆叠。**行 `ListRow`**：去 `rounded-xl`、去独立 `raised` 背景（连续行共享外部底）；非 selected 用 `hover:bg-on-surface/5`；selected 用纯 `bg-primary/10`、**去 border**——连续行里 `border-primary/60` 与行间 separator 打架，是对 `selected-row` 通用契约的连续行特化覆盖。**`divide-y` 硬约束**：`ListRow` 必须是 `ListGroup` 的**直接子**（`.map` + `key`），中间不得包 `div`/`Fragment`，否则 `> :not(:last-child)` 选择器失效、separator 消失。**session 列表 marker 统一**：历史 history tab 行 + 总览 table view 行都是 session 同质行，marker 一律 `sessionMarker(type, provider, "sm")`（28px，`IconMarker sm` + provider icon/tone），不再散写裸 `IconMarker`（历史旧实现用默认 md=40px 是全栈唯一 outlier，已收敛到 sm 与总览 table 行同款）。**边界**：`card`（可独立摆放的实体）默认 raised 圆角卡，但在密集网格（`InstanceGrid` grid/grouped 视图，单列卡片紧挨/小 gap 排列）复用本契约 plain 范式（见 card 条目 InstanceCard surface 两态）；`nav-item`（导航行语义）不在本契约内。本契约只管**同质内容行的连续序列**。
- **button-primary / -hover**：primary 操作（创建实例、确认）。**默认渲染为 `linear-gradient(135deg, primary, secondary)`（`bg-gradient-to-br from-primary to-secondary`）**，文字 `on-primary`，`rounded-md`，padding `8px`。YAML 的 `backgroundColor: primary` 是 gradient 起点的 normative fallback（对比度基准 + 不支持 gradient 场景）。**hover**：gradient 提亮一档（`from-sky-200 to-violet-300`），可叠 `shadow-lg shadow-cyan-950/25`。
- **button-secondary**：次要操作（取消、辅助、**close 按钮**）。`surface-raised` 背景，`on-surface` 文字，`rounded-md`。hover 叠 `on-surface 5%` 或 `surface-raised` 加深。
- **mobile-sheet-fullscreen**：移动端全屏覆盖 sheet（file preview / Git diff 等 contextual deep view）。`fixed inset-0 z-50` + `bg-surface`（不透明，遮挡父页面）+ `pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]` 单点避让（不叠 vh/dvh，详见 `frontend-notes.md` §1）+ `animate-in slide-in-from-bottom-full duration-300 ease-out`（`tw-animate-css`）。z-50 高于底部一级 nav。sheet 内 detail header 用三段 grid（`grid h-11 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]`，详见下方 detail-header 三段 grid 规则），关闭按钮（close 图标）在右侧 `capsule-actions` 胶囊内、`justify-self-end` 第三列、`sm:hidden`。**list header（浮窗外 PathBreadcrumb / scope chips 行，`py-3` 53px）与 sheet 内 detail header（`h-11` 44px）是两套独立 header，高度刻意不同**：list 是浏览态、密度低；detail 是聚焦态、对齐一级页面 tab header。不要为了"统一"把两者改成同高。桌面 `sm:static sm:flex-1 sm:bg-transparent sm:pt-0 sm:pb-0 sm:animate-none` 回 inline。
- **action-menu / action-sheet**：统一菜单原语 `<ActionMenu>`（`ui/action-menu.tsx`），按视口自适应分流，**收敛历史四套菜单实现**（Radix dropdown ×3、InstanceCard 手写、SessionDetail 手写）。调用方只声明 `items: { label, icon?, onSelect, variant? }` + `trigger`，原语内部决定形态。**桌面（`sm:` 起）** = Radix 锚定 popover：content `rounded-xl`(20px) + `border-neutral-line` + `surface-inset/95` + `backdrop-blur-md` + `shadow-2xl shadow-black/40` + `p-1.5`；item `rounded-lg`(14px) + `px-3 py-2.5` + `body-sm font-semibold` + icon 统一 `size-4`（**禁止散写 `h-3.5`**）+ hover/focus 用 `bg-accent`（= `surface-raised`，shadcn `--accent` 映射，软 hover 底）；`variant: destructive` 用 `error` 文字 + `error/10` hover。**移动（`max-sm:`）** = 底部 action sheet：scrim `rgb(0 0 0/0.6)`（点击关闭）+ sheet `surface-raised` + `rounded-t-xl`(20px) + `tw-animate-css` `slide-in-from-bottom` + item 全宽 `min-h-[48px]`（44pt 触摸基准）+ 末项「取消」+ `padding-bottom: env(safe-area-inset-bottom)` 单点避让（**不叠 vh/dvh**，同 `mobile-sheet-fullscreen` 铁律）。**modal 语义由共享 `<Dialog>`（`ui/dialog.tsx`，Radix `modal=true`）承载**：scrim 点击关闭 / Esc / focus trap / body pointer-lock 全交 Radix dismissable-layer，移动 sheet 与居中 modal / 全屏 reader / 底部 info sheet 统一走同一 primitive（见 `dialog` 条目），不再手写 scrim + onClick + window keydown。与 `mobile-sheet-fullscreen` 区别：后者是全屏 contextual deep view（file preview / Git diff），本者是部分高度的动作选择 sheet。**触发器（⋮/⋯）**：移动端触摸区 ≥40px（内容驱动 `p-2` 或 `h-10 w-10`），桌面端可 `h-7 w-7` + `sm:opacity-0 sm:group-hover:opacity-100`。**桌面右键菜单**（文件右键、tab 右键）保留 `onContextMenu` 坐标触发，消费同一 content/item token，**不走 sheet**（移动端不可达，刻意保留为桌面快捷，详见 `workbench-views.md` §7.1 tab 右键语义）。**锚定选择器菜单**（claude2 model / permission mode 等「带当前选中态」的下拉）**不走 ActionMenu**——ActionMenu items API 无选中态（动作列表原语）；走对称的 **`OptionMenu` 原语**（`ui/option-menu.tsx`，与 `ActionMenu` 同款视口分流：桌面 = Radix `DropdownMenu` primitive，`DropdownMenuContent` 内置 `<Portal>` 到 `document.body` 由 Radix 接管 outside-click / Esc / focus；移动 = 底部 action sheet，同 `ActionMenu` 移动 sheet 范式）。两原语语义分离：`ActionMenu` = 动作列表（无选中态，destructive 变体），`OptionMenu` = 选择器（带选中态勾选 + 角色色，active 项 `disabled` 不可重选、`data-[disabled]:opacity-100` 保留高亮，角色色 model→`user`、mode→`permission`，claude2 角色色刻意保留）。**铁律：含 `transform` 的容器（如 composer float 的 `translateY(...)`）内禁止手写 `fixed inset-0` scrim**——transform 祖先会成为 fixed 后代的 containing block，scrim 只覆盖该容器范围而非视口，outside-click 失效；锚定菜单 / popover 一律经 Radix Portal 或裸 `createPortal` 到 body。
- **capsule-actions**：把多个相关 action 收进一个胶囊容器（移动端聚焦态 header、文件预览 / Git diff 详情 header 右侧操作区），与散布的独立按钮相对。容器 `inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-neutral-line/60 bg-surface-inset/60 p-0.5` + `role="group"`；内部按钮去各自的 border/bg，统一 `rounded-md`，hover 按 action 语义着色（info→primary、close→error、save→状态色）。已用于 `MobileFocusHeader`（ℹ✕，h-8 w-8 图标）、`FilePreviewPanel` header（save 文字 + close 图标，h-7）与 `GitFileDiffPanel` header（close 图标，h-7）——同一 capsule primitive，不同高度随宿主 header 密度。
- **segmented-control**（`SegmentedControl<T>` primitive，`shell-primitives.tsx`）：Apple 风格内联分段选择器（2~N 个互斥选项的**表单控件**，平铺全可见）。容器复用 `capsule-actions` 同款 token——`inline-flex w-full items-center gap-0.5 rounded-lg border border-neutral-line/60 bg-surface-inset/60 p-0.5` + `role="group"` + `aria-label`；item 是**原生 `<button>`**（**非 Radix Trigger asChild**——避开嵌套 modal 内 trigger 失效问题，正是 protocol 选择器当初从 OptionMenu 改内联分段的原因；详见 `frontend-notes.md` §5 asChild 包裹组件须透传 props/ref），`min-h-11 flex-1 px-3 text-sm font-semibold` 触摸友好，active `aria-pressed=true` + `bg-primary/15 text-primary`、inactive `text-on-surface-muted hover:bg-on-surface/5`。泛型 `<T extends string>`：`{ ariaLabel, value, onChange, options: { value: T; label: string; disabled? }[] }`。与 `OptionMenu`（锚定下拉选择器，带选中态勾选）语义有别：本者是**少量互斥选项平铺**（≤4，全可见无需展开），后者是**大量选项折叠下拉**。调用点：`settings-dialog.tsx` ProviderDialog 协议 [Anthropic/OpenAI]、Settings runtime 段 [Claude/Codex]（决策 46）。
- **protocol chip**（provider 行协议标签）：`ProviderRow` subtitle 内标识 provider 协议的小圆角 chip——扫读即知「哪几个 provider 能给某 runtime 用」。`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold` + 按 protocol 取 token 化底/字色（`PROTOCOL_CHIP_CLASS`：anthropic `bg-primary/15 text-primary` 品牌、openai-compatible `bg-on-surface/10 text-on-surface-soft` 中性），与 subtitle 其余两段（baseUrl `text-on-surface` 主文本、apiKeyMasked `text-on-surface-muted` 次要）同处 `flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs` 容器，窄屏自动换行。纯 token、无散写裸色阶；与 `segmented-control`（协议**编辑**控件）正交——本者是列表行的协议**展示**标签（决策 47）。
- **dialog**（modal scrim overlay 统一 primitive，`ui/dialog.tsx`）：shadcn 风格封装 Radix `Dialog`（聚合包 `radix-ui`，`modal=true` 默认），承载所有「背景不可交互」的 modal 语义 overlay——居中 modal（SettingsFlyout / ProjectSetupPanel）、视口分流 modal（ConfirmDialog / PromptDialog：移动端底部 action sheet / 桌面居中卡片，见 `confirm-dialog` 条目）、底部 sheet（ActionMenu 移动端 / InfoSheetDialog）、全屏 reader（FullscreenReader）。**采用 shadcn 官方居中卡片模型**（非全屏 flex 容器）：`DialogContent` 默认 = `fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2` + `grid w-full max-w-[calc(100%-2rem)] sm:max-w-lg`——Content **即卡片本身**，自带宽度约束（移动端留 1rem 缝不顶满、桌面 512px），点卡片外 Overlay 全屏 scrim 区 = outside → Radix `onPointerDownOutside` dismiss。**形态靠调用方 `className` 覆盖**，封装不硬编码 variant：居中 = 默认（内层只放卡片视觉 `rounded-2xl p-5 shadow-2xl shadow-black/40 ${shellSurfaceClasses.*}`，**不再 `w-full max-w-sm` 套第二层卡片**——宽度由 Content 约束）；底部 sheet = `fixed inset-x-0 bottom-0 top-auto max-w-none w-full translate-x-0 translate-y-0` + `flex items-end justify-center` + `rounded-t-xl` + safe-area（**必须 `top-auto` 中和默认 `top-1/2`、`max-w-none` 解除 `sm:max-w-lg`**，否则 sheet 占满下半屏）；全屏 = `fixed inset-0 max-w-none w-full translate-x-0 translate-y-0 flex flex-col`（**必须 `max-w-none`**，无 outside 区靠 ✕/Esc 关）。`DialogContent` = Portal + Overlay（`bg-black/60 backdrop-blur-sm` + fade 动画）+ Content（`pointer-events-auto` + fade 动画）。**modal 三机制由 Radix dismissable-layer 接管**：scrim 点击关闭 / Esc / focus trap / body pointer-lock，统一取代历史手写 scrim + onClick + window keydown + useEffect body-lock。**`onOpenChange` 是关闭统一入口**：scrim 点击 / Esc / ✕ 都走 `onOpenChange(false)`，promise-API dialog（confirm/prompt）在此 resolve(false/null)。**非 modal overlay 不走本 primitive**：按坐标定位的锚定 popover（RawDebugPopover）用裸 `createPortal`，hover popover 背景 可点不锁。详见 `frontend-notes.md` §4 modal pointer-lock 演进。
- **button-danger**：destructive（删除实例、销毁确认）。`error` 背景，`on-error` 深墨字（`error` 是 rose-400，白字对比约 3:1 不达 WCAG AA 4.5:1，深墨字约 6:1 达标）。**克制使用——仅确认对话框里的销毁动作；window/terminal close 按钮用 button-secondary/ghost，不要做成 danger**。
- **confirm-dialog / prompt-dialog**（视口分流确认/输入弹框，`shell/confirm-dialog.tsx` / `prompt-dialog.tsx`）：iPhone 理念——移动端底部 action sheet，桌面居中卡片。**移动端（`max-sm:`）** = iOS action sheet：`DialogContent` 底部 sheet 形态（`fixed inset-x-0 bottom-0 top-auto max-w-none w-full translate-0` + `rounded-t-xl` + `slide-in-from-bottom` + safe-area），顶部一组圆角卡片（`rounded-xl` + `shellSurfaceClasses.workspace`）承载标题（`text-base font-semibold`）+ 消息（`text-sm text-on-surface-muted`，confirm）或 input（prompt，对齐 `input` token），下方操作按钮**竖排全宽** `min-h-[48px]`（44pt 触摸基准，复用 `mobileSheetItemClasses` 骨架）——confirm 按 tone 着文字色（`danger`→`text-error` 红字、`accent`→`text-primary`、`default`→`text-on-surface-soft`），prompt Confirm 用 `text-primary`；Cancel 单独一组在底部（独立圆角卡片 + `text-on-surface-muted`，与操作组有间隔，iOS action sheet 取消分组标准）。**桌面（`sm:` 起）** = shadcn 居中卡片 + 按钮横排右对齐（`flex justify-end gap-3`）+ 销毁按钮 `button-danger` 实色 `error` 填充（见 `button-danger` 条目）。**平台差异刻意保留**：移动端销毁用**红字**（iOS action sheet destructive 标准），桌面销毁用**实色红块**（modal 标准）。`useConfirm`/`usePromptDialog` holder 模式不变，调用方零改动。
- **surface-shell / surface-sidebar / surface-raised / surface-raised-hover / surface-inset**：surface 角色（收敛 `shellSurfaceClasses`）。`surface-shell` = app 外壳 `surface` + `rounded-shell-desktop`；`surface-sidebar` = `surface-raised` 带 `from surface-raised/25 to surface-base/30` 纵向渐变；`surface-raised` = 卡片/行基底；`surface-raised-hover` = 交互行 hover，边框 `primary 60%`、背景 `surface-raised` 加深；`surface-inset` = terminal/code/preview 凹陷，`surface-inset` + `rounded-lg`。
- **surface-tint-success / -warning / -danger**：状态色作 surface tint（git added/modified/deleted 行、provider marker 背景等）。`rounded-lg`，背景为对应状态色 **@10% alpha**（`rgb(52 211 153 / 0.10)` 等），文字用对应状态色的实色或 `on-surface`。YAML 实色是 normative 基准，@10% 是渲染。
- **card**：Project/Agent/Terminal 卡片。`surface-raised` + `rounded-xl`（20px）+ `neutral-line` 边框 + padding `lg`（16px）。Agent card 可用 `2xl`（24px）。卡片服务可扫读性，不为 metadata 牺牲首屏密度。InstanceCard 采用微信朋友圈式头像布局：左侧 marker 头像（`lg`=h-9 w-9=36px，`items-start` 上下置顶）独占一列 + 右侧内容区竖排（title / subtitle / meta）；meta 行「项目名 · 最后活动」从左往右紧凑排列（`truncate`，不撑满）。折叠操作区 ⋯ 落在卡片**右上角**（`absolute top-2 right-2`），走统一 `action-menu` 原语（改名 / 关闭，token 见 action-menu 条目；移动端从底部 action sheet 展开）。状态圆点仍叠加 marker 右上角（`-right-1 -top-1`，4px 偏移不依赖 marker 尺寸）。marker 尺寸三档：card 用 `lg`（36px 头像式独立左列）/ table 与紧凑 header 用 `sm`（28px 带方框 tone 背景）/ **workbench group tab 用 `xs`（16px 裸 icon，无 IconMarker 方框，tone 用文字色）—— 与 tab label 14px 同高比例 1:1，避免 marker 比标题大的视觉失调**。tab marker 的 tone 语义保留（agent 按 provider：codex→`text-success`/openai icon，其余→`text-primary`/anthropic icon；terminal→`text-on-surface-muted`/terminal icon），仅去掉方框背景，与 nav-item 的 inline icon 一致。**InstanceCard surface 两态**：默认 `raised`（独立圆角卡 = `raised` border/bg + `rounded-lg`，单卡片/非密集场景）；`plain`（密集网格 `InstanceGrid` grid/grouped 视图，卡片紧挨/小 gap 排列）= 去 raised border/bg + `rounded-lg`，改 `lg:hover:bg-on-surface/5`（移动无高亮——Apple 列表范式无 hover 反馈，批 O / 决策 38；桌面保留 hover，对齐 `list` plain 行 token），marker 头像 + 3 行内容布局不变——密集排列时卡片连成连续清单，避免独立圆角卡紧挨的视觉割裂。分隔由 InstanceCard `topSeparator` 绝对定位 inset 画（移动 `left-15`=60px=p-3(12)+marker lg(36)+gap-3(12) 内容区左，iOS separatorInset 范式 / 桌面 `lg:left-0` 全宽，批 O / 决策 38；原 `divide-y` border-top 横跨全宽不支持 inset），InstanceGrid plain 去 `divide-y`、给非首卡传 `topSeparator`。`CardGridSkeleton` 同步镜像。`InstanceGrid` `plain` prop 控制整组卡片 surface（透传到每个 `InstanceCard`），`CardGridSkeleton` 同步镜像避免加载态跳变。**GroupedView 项目行操作分级（A+C）**：`[折叠 gutter h-7 w-7][项目名 flex-1 进项目][⋯ ActionMenu → 删除 destructive]`——折叠独立增大触摸区；主区项目名进项目；删除从常驻 🗑 收进 ⋯ 菜单（对齐移动 `ProjectGroupHeader`），避免三按钮并排误触。**左栏 PanelHeader 大标题层**：`WorkbenchShell` 左栏顶部 `PanelHeader` 可选 `title`（`h-11` + `text-base font-semibold` + `border-b border-on-surface/5`，对齐 `MobilePageHeader`）；活动栏 nav=projects/files 分别注入「项目」「文件」；右栏仅收起、无 title。**新建项目按钮**：桌面/移动统一 `actionButtonClasses({ tone: "accent" })` pill 文案按钮（与 CreateSessionBar 同款 token：`rounded-xl border px-3 py-1.5 text-xs font-bold` + `from-primary to-secondary` 渐变），可见文案 `workbench.createMenu`（"+ 新建"/"+ Create"），`aria-label` 用 `home.createProjectAria`；单按钮直开 ProjectSetupPanel Dialog（非 dropdown，无 chevron）；位置统一在 ViewSwitcher 行左侧。

- **carousel（paged-card，批 J / 决策 33 + 批 M / 决策 36 + 批 N / 决策 37 + 批 P / 决策 39）**：实例分组横向分页（每页 N 卡）。容器 `overflow-x-auto snap-x snap-mandatory scroll-px-3 lg:scroll-px-0` + 隐藏滚动条（`[scrollbar-width:none] [&::-webkit-scrollbar]:hidden`）；**首尾各加 `w-5 shrink-0 lg:hidden aria-hidden` 空 spacer**（peek 宽=20px，双侧对称），每页 `shrink-0 w-[calc(100%-2.5rem)] snap-start lg:w-full`（`-2.5rem`=40px=左右各 20px 双侧 peek；`scroll-px-5` 让 snap 对齐到 snapport-left=scrollLeft+20，page.left=20+i·pageW；首尾 spacer 让中间页左右各露 20px 邻页 peek、首末页露 20px 邻页 peek + 20px 自然 gutter——批 P / 决策 39 反转批 M 单向 peek，用户明示要 page2 见 page1 peek；peek 量 12→20 批 P 收尾 / 决策 41：用户指移动端去边框后 peek 12 露下一页 p-3 空白看不到内容，选保留 px-3 inset + peek 20 方案，内容区 342→326），页内卡片纵向复用 `InstanceGrid` 单列 `plain`。当前页同步靠 `onScroll` 算页码（slot=scrollWidth/pageCount；首尾 spacer 让 scrollWidth=N·pageW+2·peek（peek=20→+40），slot=scrollWidth/pageCount 自动适配）。**移动端**靠原生左右 swipe 翻页 + 双侧 peek 暗示；**桌面端**（不可触摸）`lg:w-full` 满宽无 peek（spacer `lg:hidden` + `lg:scroll-px-0`）+ 页码行 `hidden lg:flex`（`‹` prev + 页码 button `aria-current` + `›` next，onClick 目标页 `scrollIntoView({behavior:smooth,inline:start})`，`inline:start` 对齐 `snap-start`）。**≤1 页退化**：直接 `InstanceGrid` 渲染，无 peek 无页码行（实例数 ≤ pageSize 时无分页语义）。peek 量 20px 双侧（总 40px；批 P 收尾 / 决策 41 从批 P 的 12px 增到 20px——用户指移动端去边框后 peek 露下一页 p-3 空白看不到内容，peek 20 露过 p-3 到 marker 左缘）。**根 px-0**（批 P 收尾 / 决策 42，反转决策 41 的 px-3 保留）：`GroupedProjectsList` 根 `px-3 py-3`→`px-0 py-3 lg:px-3`，移动 section 贴屏幕、card 距两侧 = peek(20) 单一留白（非 px-3+peek 双重叠加 32px；Apple UICollectionView full-bleed 范式：section inset=0、card 靠 scroll paddingLeading=peek 露出），内容区宽不变（page 宽 calc(100%-2.5rem) 不变，px-0 只移 section 位置、card 距屏 32→20），桌面 lg:px-3 保持边框时代内边距；`GroupedProjectsSkeleton` 同步。**移动端 Apple 列表范式**（批 O / 决策 38）：section 无边框（`lg:border` 桌面才加）、InstanceCard plain 无 hover（`lg:hover:bg-on-surface/5` 移动无高亮）、分割线 inset（InstanceCard `topSeparator` `left-15`=60px 内容区左 / `lg:left-0` 全宽）。桌面保持边框+全宽分割线+hover。**名行操作区对齐**（批 P / 决策 39 + 收尾 / 决策 40/41/43）：peek 20px 把卡片右移，`GroupedProjectsList` 名行 `pl-5 pr-7 lg:pl-2 lg:pr-2` + 进项目 button `px-0 lg:px-1`（决策 43：移动 pl=peek=20 让 button.left=card.left，Apple full-bleed header 对齐 cell 左边缘、button 去px 让图标=card 边缘(20)；pr=peek+8=28 对齐 card action；桌面 lg:pl-2+lg:px-1 保 marker↔icon）——⋯ 删除与卡片 ⋯ action **同尺寸同图标同列**（批 P 收尾 / 决策 40：均 `h-7 w-7 max-sm:h-10 max-sm:w-10` + `ShellIcon ellipsis h-4 w-4` 同源，右缘均 section-right−28px、图标中心严格对齐）；**决策 35 marker↔icon 内容对齐在去边框（决策 38）+ 满宽（决策 42）后转 Apple full-bleed 边缘对齐**（移动 nameRow 内容=card 边缘 20，非 card marker 32）；桌面 `lg:pl-2 lg:pr-2`=8px 与未改前同，零回归。
- **chip / chip-active**：紧凑计数与标签（如 `3A`/`2T`、provider 标记）。`surface-raised` + `rounded-full` + `caption` 字号。active 态文字 `primary` + `primary 10%` 背景。
- **input**：文本输入（ShellInput、prompt dialog）。`surface-inset` 背景 + `neutral-line` 边框 + `rounded-lg` + `body-sm`。placeholder 用 `on-surface-muted` 更弱版（`placeholder:text-on-surface-muted/60`）。
- **focus-ring**（全系统交互元素统一）：`focus-visible` 用 primary 系——`ring-2 ring-primary/30 ring-offset-2 ring-offset-surface`。收敛历史 `ring-cyan-300/20` 与 `/30` 两套。
- **cursor**（通用规则，决策 44）：所有 enabled 交互元素（button / nav-item / OptionMenu trigger / switch / 可点 div）统一 `cursor-pointer`——原生 `<button>` UA 默认 `cursor: default`（箭头）须显式覆盖：Shadcn `Button` CVA 基类（`ui/button.tsx` `buttonVariants` 首段）内置 `cursor-pointer`；**不走 Button 的手写 `<button>` 须逐处补 `cursor-pointer`**（如 `SelectorTrigger`、`role="switch"`、分段控件 `aria-pressed`、ActionMenu trigger ⋯、`ActivityBar` 按钮 `activityBarButtonClasses`）。`disabled` 态统一 `opacity-50 cursor-not-allowed`，不单独定义每个 variant 的 disabled 色。
- **press-feedback**（apple-design §1「按下立即反馈」通用规则）：所有 enabled 可点元素 `:active`（按下伪类）即时反馈统一 `active:bg-on-surface/10`（on-surface 白 10% 叠加，深色主题按下变亮高亮）——与 `hover:bg-on-surface/5`（悬停 5%）同语义、按下浓度 > 悬停（反馈强度递进，符合「按下比悬停更明显」）。覆盖 ghost 风格元素：NavItemContent（非选中分支）/ ActionButton（actionButtonClasses）/ SegmentedControl（非选中）/ ViewSwitcher（非选中）/ MobilePageHeader back / InstanceCard ⋯ / ActivityBar / 各 tab 按钮 / workbench 行+按钮。**三类已有 active 并存不改**：移动 sheet/dialog items（`active:bg-on-surface/5`）、ListRow/InstanceCard（`.interactive-row` CSS `:active { rgb(255 255 255 / 0.08) }`，`@layer utilities`，元素 bare `transition` 已 cover 150ms 过渡）、shadcn Button（`active:not-aria-[haspopup]:translate-y-px` 1px 下移）。所有目标元素已有 bare `transition`（150ms，property 含 background-color）cover active 过渡；`:active` 是伪类非 transition，`prefers-reduced-motion`（`index.css` 全局 `transition-duration:0.01ms`）只去过渡速度、不影响 :active 触发，按下仍瞬切 bg（反馈在）。**「选中 active（prop）」≠「:active（按下伪类）」同名易混**：`active:bg-on-surface/10` 只加在非选中分支（与 `hover:*` 同分支），选中态（`bg-primary/10` / `bg-primary/15`）不叠加 press bg。
- **overlay-dismiss-symmetry**（apple-design §7「对称路径」）：浮层 dismiss 必须与 enter 同路径——移动全屏浮层（`fixed inset-0` takeover）enter `animate-in slide-in-from-bottom-full duration-300 ease-out`，dismiss 对称 `animate-out slide-out-to-bottom-full duration-300 ease-in`，不能瞬时条件渲染切 `hidden`。经 `useMobileExitClose`（`web/src/lib/use-mobile-exit-close.ts`）编排 `closing` 中间态：移动端 close → 进 `exiting` 态播 slide-out → `onAnimationEnd` 才真正清 state（`e.target !== e.currentTarget` gate 防子元素 animationend bubble 误触发）；桌面端（`useIsMobile()=false`）即时清（`sm:static` 浮层是布局位，无浮层动画）。覆盖 file-browser 文件预览 / git-diff-viewer diff 两处移动浮层。**不在范围**：Radix Dialog 浮层（prompt/confirm-dialog、action/option/dropdown-menu、FullscreenReader）由 `data-[state=closed]:animate-out fade-out-0` 自带对称 exit，无需 hook。`prefers-reduced-motion`（`index.css` 全局 `animation-duration:0.01ms`）把 slide-out 降级瞬时，`onAnimationEnd` 立即触发 → 等价桌面即时，无障碍兼容。
- **focus-visible 一致性**（apple-design §1 / a11y）：所有可 focus 元素（input / button / `[href]` / contenteditable）键盘 focus 时必须有可见指示，统一 `focus-visible:ring-2 focus-visible:ring-primary/30~40`（或 `focus-visible:border-primary` 边框替代）——**禁裸 `focus:outline-none` 无替代**（键盘 Tab 用户看不到 focus）。ui/button、ui/input、ui/badge、shell-primitives input 已内建 `focus-visible:ring`；手写 input 须逐处补（与 AuthGate / prompt-dialog input 同款）。
- **shimmer-compositor**（apple-design §11「帧级流畅」）：CSS 动画只用 compositor 友好属性（`transform` / `opacity`），**禁 `background-position` / `width` / `height` / `top` / `left` 动画**（触发 layout/paint，多行 infinite 时掉帧）。`.skeleton-shimmer` 用伪元素 `::after { transform: translateX(-100%→100%) }` 扫光（元素 `position: relative; overflow: hidden` 承载，静态底色 + 扫光条横移），不用 `background-position`。
- **dropdown-anchor-origin**（apple-design §7「锚定来源」）：Radix 弹层 Content（dropdown-menu / popover / select）的 `zoom-in/out-95` 缩放须锚定 trigger 侧——Content className 挂 `[transform-origin:var(--radix-*-content-transform-origin)]`（Radix 注入 trigger 中心坐标），不能默认 center 缩放（脱离与 trigger 的空间关系）。
- **移动触摸目标 44px**（apple-design §10 / Apple HIG）：移动端（<640px）会触摸的按钮须 `max-sm:h-11 max-sm:w-11`（44×44px 达 HIG）——含 `sm:hidden` 移动专用按钮、常驻移动 UI 按钮（mobile-workbench header）、列表/表格行操作按钮（table RowActions ⋯）。桌面鼠标专用按钮（`sm:opacity-0 sm:group-hover` 显隐、`lg:flex` 桌面工具栏）不限尺寸，保持紧凑。
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
- **Do** sheet/浮窗 detail header 用三段 grid 恒定结构：`grid h-11 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]`——左内容（文件名 / status+path，`min-w-0 truncate`）/ 中导航（segmented、tab 等，`justify-self-center`，无内容时用空 `<div className="justify-self-center" aria-hidden />` 占位）/ 右操作区（`capsule-actions` 胶囊，`justify-self-end` 第三列）。**中列无内容时必须占位，不能省略成 flex 两段**——否则 CSS grid auto-placement 会把右侧操作区吸到中列，close 按钮跑到中间。高度 `h-11`（44px）与一级页面 tab header 一致；list header（`py-3` 53px）保持不动，二者刻意不同高。
- **Don't** 在 detail query pending 时叠加 `border + bg + animate-pulse` 的「实心矩形」skeleton——父容器（workspace / surface）通常已有 border + bg，再画一个带边框的占位块 = 「矩形里的矩形」，加载结束被真实内容替换时产生突兀的矩形闪现。pending 时间通常 <100ms（query resolve / cache 命中），应 `return null` 让父容器中性背景承接，ready 直接切真实 panel；如确需占位，用极轻元素（细 shimmer 条 / 小 spinner），不要用 `min-h-*` + `border` + `bg` + `rounded-2xl` 组合的实心块。呼应「页面 owns loading / 不堆平行 pending 动画」原则。

## Loading 态

加载态是「数据未到 → 数据到达」之间的过渡。本节规定何时用骨架、何时用 spinner、何时留空，以及骨架必须满足的对齐铁律。

### Skeleton token

- `.skeleton-shimmer`（`web/src/styles/index.css`）：元素 `position: relative; overflow: hidden` 承载静态底色 `rgb(255 255 255 / 0.04)`，伪元素 `::after` 挂 `linear-gradient(90deg, transparent → rgb(255 255 255 / 0.09) → transparent)` 扫光条，`transform: translateX(-100%→100%)` 横移（compositor 友好，见 shimmer-compositor 契约），`animation: skeleton-shimmer 1.4s var(--ease-standard) infinite`。**这是项目唯一的骨架动画范式**——所有骨架占位条挂 `skeleton-shimmer` class，不散写 `animate-pulse` + 裸灰底。
- `prefers-reduced-motion: reduce` 下扫光收敛（动画静止），无障碍安全。
- 占位条颜色透明（白色 alpha），**背景层级继承父容器**——骨架行套 `shellSurfaceClasses.raised` 就与真实 raised 行同层级，不另设骨架底色 token。

### Loading variant 决策框架

按数据形态与加载时长选择 loading 表现：

| 场景 | 决策 | 例 |
|---|---|---|
| detail query pending（<100ms） | **`return null`**，父容器中性背景承接 | Agent/Terminal panel 切实例、Claude2 detail |
| 结构已知 list / 网格加载 | **骨架**（对齐真实行结构） | 项目列表、实例网格、Git 文件列表、File 列表、聊天历史 |
| 结构未知 / 高方差内容 | **spinner + 文案** | 单文件 diff（0~几千行）、file preview（text/image/too_large/unsupported） |
| 操作反馈 | **按钮 disabled + 文案** | 提交、重命名、删除 |
| 极短乐观更新（<500ms） | **不改**（保持当前态） | 重命名、排序 |
| 连接丢失 / 长时加载 | **overlay 或全屏文案** | WebSocket 断线、auth 检查 |

### 正面表述哲学

- **页面 owns loading**：loading 态由具体页面/section 自管，路由/全局层不叠加平行 pending 动画。
- **路由过渡保持上一屏**：导航切换时保持前一屏直到新数据 ready，不闪白屏。
- **ready 直接切**：数据到达即渲染真实内容，不加额外过渡动画。

### 对齐铁律

骨架必须对齐真实组件的 **行高 / padding / 层级**，否则加载完成时产生可见跳动：

- **行高 = padding + max(marker, 文本行盒)**。例：`ListRow` 行高 = `py-2.5`(20px) + marker(`IconMarker sm` 28px) ≈ 50px；`ListRowSkeleton` 必须用同样 `px-3 py-2.5` + `h-7` marker，实测骨架行高 = 真实行高 = 50px（delta 0）。
- **占位条高度 = line-height 行盒**，不是 font-size（`text-sm` 行盒 20px、font-size 14px——占位条用 `h-5` 而非 `h-3.5`）。
- **层级对齐**：骨架背景层级 = 真实组件层级（`shellSurfaceClasses.raised` 行的骨架也用 raised；不给骨架加比真实更重的 border/shadow）。
- **模拟结构位，不模拟字段值**：骨架 mirror 真实 DOM 结构（行根 + grow span：左 marker + title + 右尾小元素**尺寸位**）；但**不模拟高方差字段值**——Git status 字母（M/A/D）、File size 数值各异，精确占位反失真。`ListRowSkeleton` 右尾只用一个中性灰块占「右侧有小元素」的尺寸位（`h-6 w-6`），加载后真实右尾（Git status IconMarker / Files ⋮）替换、尺寸接近不跳；marker 圆角对齐 `IconMarker sm`（`rounded-sm`）。

### Skeleton primitive 索引

| primitive | 对齐对象 | 服务场景 |
|---|---|---|
| `NavItemSkeleton`（shell-primitives） | `NavItemContent`（`px-2 py-1.5` + marker `h-7`，单行：marker + label `h-5` 对齐 `text-sm` 行盒 20px，无 description 占位；行 `border border-transparent` 对齐 `ShellNavigationButton` 的 `Button` border 模型，行高 42 与真实一致；由外层 `pl-4` 容器提供子项缩进） | 左栏项目子项 |
| `ListRowSkeleton`（shell-primitives） | `ListRow`（行根 + grow span：左 `px-3 py-2.5` + marker `h-7 rounded-sm` + title，右尾 `h-6 w-6` 占位；容器 `ListGroup`） | Git 文件列表、File 列表 |
| `ProjectCardSkeleton`（HomeRoute） | `ProjectEntryRow`（grid + marker + badges + actions） | Home 项目列表 |
| `CardGridSkeleton`（instance-area） | `InstanceCard`（marker + title/subtitle + actions）；`count` 参数化（默认 6 = grid/table/InstanceArea，grouped 每组 2） | 工作台实例网格 |
| `GroupedProjectsSkeleton`（instance-area） | `GroupedProjectsList` 批 J + 批 L（每组 section `overflow-hidden lg:rounded-lg lg:border lg:border-neutral-line/40`（移动无边框，批 O / 决策 38）：项目名行 `flex items-center gap-2 px-2`（批 L 去 py）= 图标占位 `size-5`（批 K）+ 项目名条 `h-6 w-1/3` 对齐 `text-base font-semibold` 行盒 24px + › 占位 `size-5` + ⋯ 占位 `size-9` 对齐 ActionMenu trigger；**无实例区小标题**（折叠废弃，决策 33）；实例区 `-mt-2` 包 `CardGridSkeleton plain` 每组 3 卡 = carousel 一页；`CardGridSkeleton` plain 去 `divide-y`、占位卡 `left-15 lg:left-0` inset 分割线 mirror 真实，批 O / 决策 38） | grouped 视图加载 |
| `ChatSkeleton`（Claude2SessionDetail） | 真实气泡（user `bg-user-deep/60` / assistant `bg-surface-raised/70` + `max-w-[90%] self-start`） | Claude2 聊天历史 |

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
