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

**明暗双主题**：默认跟随系统（`prefers-color-scheme`）——系统暗→暗主题（Colors 节 frontmatter normative 基准）、系统明→明主题（见 Colors「Light theme tokens」）；用户可在设置覆盖（system/light/dark）。明主题是冷调浅灰白，保持 teal/cyan 品牌血缘，服务阳光下可读场景。切换在首帧前注入 `<html>` class 避免 FOUC。

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

### Light theme tokens（明主题）

阳光下暗主题看不清，提供明主题。默认**跟随系统**（`prefers-color-scheme`），用户可在设置覆盖（system/light/dark）。明主题是**冷调浅灰白**——保持 teal/cyan 品牌血缘（surface 偏蓝灰浅白、primary cyan 加深一档），非纯中性白或暖调。

实现：`<html>` 加 `.dark` class 驱动（`@custom-variant dark (&:is(.dark *))`），`:root` = light 值、`.dark` = dark 值（上方 frontmatter normative 基准）。首帧前 inline script 注入 class 避免 FOUC。

**token 对照表**（dark = frontmatter 基准；light = 明主题值）：

| token | dark | **light** | 说明 |
|---|---|---|---|
| surface-base | `#080b10` | `#eef2f7` | 底层背景（微蓝灰） |
| surface | `#0f1520` | `#f6f8fb` | shell/面板 |
| surface-raised | `#141b28` | `#ffffff` | 卡片/行（纯白最亮） |
| surface-inset | `#05080d` | `#e2e8f0` | 凹陷（浅灰，模拟陷入） |
| on-surface | `#eef4ff` | `#0f1520` | 主文字（翻转，色相血缘=暗 surface hex） |
| on-surface-soft | `#c1cad8` | `#344056` | 次主文字 |
| on-surface-muted | `#8d99aa` | `#64748b` | 辅助文字 |
| on-primary | `#041019` | `#ffffff` | primary 上文字（白） |
| on-error | `#041019` | `#ffffff` | error 上文字（白） |
| neutral-line | `#263245` | `#d7deea` | 边框 |
| code-text | `#d6e4f7` | `#1e293b` | terminal 文字 |
| code-muted | `#728197` | `#64748b` | terminal muted |
| primary | `#7dd3fc` | `#0284c7` | cyan 加深（sky-600，白底 WCAG AA） |
| secondary | `#a78bfa` | `#8b5cf6` | violet 加深（violet-500） |
| success | `#34d399` | `#059669` | emerald 加深（白底对比） |
| warning | `#fbbf24` | `#d97706` | amber 加深（白底对比） |
| error | `#fb7185` | `#e11d48` | rose 加深（白底对比） |
| assistant | `#fbbf24` | `#b45309` | 角色色加深（amber-700，浅底 badge 文字 WCAG；比 warning 再深一档） |
| assistant-soft | `#fde68a` | `#f59e0b` | |
| assistant-deep | `#92400e` | `#fef3c7` | **翻转**：明主题「deep bg」=浅气泡 |
| user | `#22d3ee` | `#0891b2` | |
| user-soft | `#67e8f9` | `#06b6d4` | |
| user-deep | `#0e7490` | `#cffafe` | **翻转** |
| permission | `#a78bfa` | `#8b5cf6` | |
| permission-soft | `#c4b5fd` | `#a78bfa` | |

设计要点：

- **surface 层次保持**。明主题仍是 tonal-layer elevation：`surface-base`（底层）→ `surface`（shell）→ `surface-raised`（卡片，纯白最亮）→ `surface-inset`（凹陷，浅灰）。暗主题「越抬升越浅、凹陷最深」，明主题「越抬升越白、凹陷浅灰模拟陷入」——抬升=变亮的方向一致，只是基底从深色翻成浅色。
- **primary / 状态色 / 角色色加深一档**。`#7dd3fc`(cyan-300) 在白底对比约 2.3:1 不达 WCAG AA；加深成 `#0284c7`(sky-600) 约 4.6:1 达标。同理 success/warning/error/角色色各加深一档（emerald-600 / amber-600 / rose-600 等）。`on-primary`/`on-error` 翻转成白字。
- **角色色 deep 档语义翻转**。暗主题 `assistant-deep` `#92400e` 是「深 bg 气泡」；明主题 deep 档翻转为浅色（`#fef3c7` amber-100），配深色文字（`assistant` `#d97706`）——明主题「角色气泡」=浅底深字。token 名 `deep` 在明主题语义=「气泡背景色」（浅），与暗主题「深 bg」相反；代码层不分支（token hex 直接给浅值），语义翻转仅在此标注。
- **alpha 叠加基准跟随翻转**。`on-surface 5%` 叠加：暗主题 = 近白 5%（深底上微亮）、明主题 = 近黑 5%（浅底上微暗）。交互态 tint（`primary 10%` 等）同理：明主题 primary 加深成 `#0284c7` 后，`primary 10%` 在白底可见。代码用 token + `/N` alpha 表达，token 值翻转后 alpha 自动跟随——**无需逐处改组件 alpha**。
- **白叠层 utility 翻转**。`interactive-row` / `skeleton-shimmer` 的 `rgb(255 255 255 / x)` 白叠层在白底不可见 → `index.css` 用 `--hover-overlay` / `--active-overlay` token（light = `rgb(0 0 0 / x)`、dark = `rgb(255 255 255 / x)`）驱动，或 `.dark` 覆盖。

- **明主题对比度陷阱（按钮/badge 配色铁律）**。主题翻转后两类用法在明主题塌：① **实心按钮禁裸 `text-white`/`bg-white`**——白不翻转，明主题底翻浅就变浅底白字（Stop 旧 `bg-assistant-deep/90 text-white` 明主题 1.1:1）。按钮文字/icon 一律用互补翻转对：主操作 `bg-primary text-on-primary`（L458）、销毁 `bg-error text-on-error`（L468）；按钮内 icon 用 `stroke="currentColor"` 或 `bg-on-*` 让它随 text 翻转。② **同色系 alpha badge 禁 `bg-{role}/N + text-{role}-soft`**——明主题角色色加深后同色系「中浅底 + 中字」对比塌（~1.7:1）。改 `bg-{role}/10 + text-{role}` 主档实色（L471），hover/active 按比例 `/15`/`/20`。
- **琥珀色上限 → 明主题 assistant 加深到 amber-700**。明主题 `--assistant` 原 `#d97706`（amber-600）饱和度高、亮度偏高，浅底上实色仅 ~2.9:1（同色系本质，非 bug）；success `#059669`/error `#e11d48` 实色可达 3.5/4.4:1。assistant 系 badge 按 L471 改 `/10 + 实色` 后从 ~1.7 升到 ~2.9，仍差 0.1 到 3:1。为严格达标，明主题 `--assistant` 额外加深到 amber-700 `#b45309`（实色 4.65:1，清零对比度扫描器）；暗主题 `#fbbf24` 不变。代价：明主题角色琥珀比 warning（amber-600）再深一档——与 L305「暗主题 assistant/warning 同 hex、可按角色独立调色相」呼应，明主题率先按角色分化（assistant 承担 badge 文字需更高对比，warning 仅状态点缀故保持 amber-600）。

**已知限制**：PWA manifest `theme_color` / `background_color` 在 install 时定格、运行时不可切——已安装 PWA 的 splash / 状态栏底色保持暗（浏览器内主题完全跟随）。iOS `apple-mobile-web-app-status-bar-style: black-translucent` 明主题下状态栏白字叠浅底略降可读性，列为已知限制，真机反馈再处理。

### Terminal theme（xterm 外壳随主题）

web terminal（`SessionDetailRoute.tsx` `XtermOutput`，claude2 与 terminal 会话共用同一 xterm 实例）的**外壳色随亮暗主题切换**——`new Terminal` 的 theme 对象不硬编码，由 `readTerminalTheme(resolved)` 从 CSS 变量读取构造，主题切换时经 `term.options.theme` 动态更新（xterm 官方 setter，赋值即触发重绘，含 WebGL renderer）。**只跟随外壳**：背景/文字/光标/ANSI 显示色随主题；运行在 tmux 里的程序（vim/htop/prompt/ls 色）由程序自身配色决定，不在 xterm 范围。

**token 契约**：

| xterm 槽位 | token 源 | dark | light |
|---|---|---|---|
| background | 亮 `--surface`（`#f6f8fb` 浅蓝灰，与 app shell 同底）/ 暗 `--surface-inset`（不透明实色；**不能传 `transparent`**——xterm `css.toColor` 只支持 `#hex`/`rgb()`/`rgba()`，canvas 解析路径要求 alpha=0xFF，否则 `parseColor` fallback 成 `DEFAULT_BACKGROUND` 纯黑 `#000`，背景永不随主题）。亮色用 `--surface`（续九曾改纯白 `#ffffff` 衬托字重清晰度，续十 DOM 渲染器根治模糊 + 续十一删字重后不再需要纯白衬托，续十二恢复 `--surface` 与 shell 同底、视觉连贯）；深色近黑（`--surface-inset` `#05080d` 保持现状零变化） | `#05080d` | `#f6f8fb` |
| foreground | `--code-text` | `#d6e4f7` | `#1e293b` |
| cursor | `--primary` | `#7dd3fc` | `#0284c7` |
| selectionBackground | `--primary` @ 25% | `rgba(125,211,252,0.25)` | `rgba(2,132,199,0.25)` |
| ANSI 16 色 | `--terminal-*`（下表） | 见下表 | 见下表 |

**`--terminal-*` ANSI 16 色**（暗色档 = 原 xterm 硬编码暗色调色板，零回归；亮色档 = Tailwind 深档保证浅底可读）：

| token | dark | light | 亮色对应 Tailwind |
|---|---|---|---|
| `terminal-black` | `#0f172a` | `#1e293b` | slate-800 |
| `terminal-bright-black` | `#334155` | `#64748b` | slate-500 |
| `terminal-red` | `#f87171` | `#dc2626` | red-600 |
| `terminal-bright-red` | `#fca5a5` | `#ef4444` | red-500 |
| `terminal-green` | `#4ade80` | `#16a34a` | green-600 |
| `terminal-bright-green` | `#86efac` | `#22c55e` | green-500 |
| `terminal-yellow` | `#fbbf24` | `#ca8a04` | yellow-600 |
| `terminal-bright-yellow` | `#fde68a` | `#eab308` | yellow-500 |
| `terminal-blue` | `#60a5fa` | `#2563eb` | blue-600 |
| `terminal-bright-blue` | `#93c5fd` | `#1d4ed8` | blue-700（浅底亮蓝对比不足，bright 改深一档；见下方说明） |
| `terminal-magenta` | `#c084fc` | `#9333ea` | purple-600 |
| `terminal-bright-magenta` | `#d8b4fe` | `#a855f7` | purple-500 |
| `terminal-cyan` | `#22d3ee` | `#0891b2` | cyan-600 |
| `terminal-bright-cyan` | `#67e8f9` | `#06b6d4` | cyan-500 |
| `terminal-white` | `#cbd5e1` | `#64748b` | slate-500（浅底上「白」=中灰） |
| `terminal-bright-white` | `#f1f5f9` | `#0f1520` | on-surface（浅底上最亮文字=最深的 on-surface） |

> 亮色档语义：bright 档 = 普通档浅 100 档（red-600→red-500），与暗色档同构（red-400→red-300）；`white`/`bright-white` 例外——亮色下「白色」应呈现为中灰、最亮文字用最深 on-surface，否则浅底白字不可读。**`bright-blue` 例外**：浅底上 bright 若沿用浅档（blue-500 `#3b82f6`）对比不足（ls 目录、prompt 蓝字发糊），改深一档 blue-700 `#1d4ed8`——浅色终端通行做法（浅底上「更亮的彩色」不可读，bright 只能往深走）。仅蓝色特殊处理（饱和度高 + 人眼对蓝敏感度低，浅底最难读），其余彩色 bright 仍循「浅一档」同构。

**`minimumContrastRatio` 路线已否决（续六启用 → 续九关掉）**：续六曾设 `minimumContrastRatio`：亮色 `4.5`（WCAG AA）/ 暗色 `1`，想兜底 claude CLI 256 色（`38;5;153` `#87D7FF`、`38;5;220`、`38;5;246`，不受 `--terminal-*` ANSI 16 色 token 控制）在浅底的低对比。但**实测有害已关掉**：xterm 的 `reduceLuminance` 是朴素算法（各通道均减 10%），把 claude 鲜艳 256 色推成暗沉灰蓝（`#87D7FF`→`#467086`、`#ffd700`→`#867000`）——失色相变灰蒙，是用户「整体字迹不清楚」的真根因之一（续六续七都暗故区别不大）。续九改为亮暗都 `1`（=xterm 默认=关闭），让原色鲜艳呈现，字芯清晰反而更可读。

**`extendedAnsi` 精准映射 claude 256 色（续十一启用 153 → 续十二扩为完整 9 色；续七试错后重新启用，前提已变）**：xterm.js 公开 API `ITheme.extendedAnsi?: string[]`（typings「ANSI extended colors (16-255)」）从源头替换 256 色调色板 16-255 档。机制（`ThemeService._setTheme` L129-134）：`colors.ansi[i+16] = parseColor(theme.extendedAnsi[i], DEFAULT_ANSI_COLORS[i+16])`——第二参数是 fallback，`parseColor("")` 抛错 → 返回 fallback = 保留默认原色，故**稀疏数组**（目标位填值、其余空串）= 只改指定索引、其余 256 色保留默认。**续十二方案（pty 抓 claude 启动+对话 raw ANSI，列出所有不达标前景 256 色，`#f6f8fb` 亮底对比度）**：

| 索引 | 原色 | 语义 | 原对比 | → 映射 | 新对比 |
|---|---|---|---|---|---|
| 153 | `#afd7ff` 浅蓝 | 链接/选中 | 1.41 | `#1d4ed8` blue-700（= `--terminal-bright-blue`） | 6.30 ✓ |
| 220 | `#ffd700` 金 | 标题/品牌 | 1.32 | `#a16207` yellow-700 | 4.63 ✓ |
| 174 | `#d78787` 浅粉 | 边框线（对话主用 84 次） | 2.56 | `#be123c` rose-700（暖色系保留） | 5.91 ✓ |
| 216 | `#ffaf87` 浅橙 | spinner/字符 | 1.68 | `#b45309` amber-700 | 4.72 ✓ |
| 114 | `#87d787` 浅绿 | 低频 | 1.63 | `#15803d` green-700 | 4.71 ✓ |
| 246 | `#949494` 灰 | 次要文本（63 次） | 2.85 | `#6b7280` gray-500 | 4.54 ✓ |
| 244 | `#808080` 灰 | 灰档（20 次，比 246 深） | 3.71 | `#4b5563` gray-600（保留更深层次） | 7.10 ✓ |
| 248 | `#a8a8a8` 浅灰 | 低频 | 2.23 | `#6b7280` gray-500 | 4.54 ✓ |
| 247 | `#9e9e9e` 浅灰 | 低频 | 2.52 | `#6b7280` gray-500 | 4.54 ✓ |

仅亮色挂（暗色这些色在深底本就高对比，零变化）。**231 `#ffffff` 白字不映射**：它主用是**反色块前景**（配 `48;5;237` 深灰底白字，如标题栏，本就清晰），extendedAnsi 是全局替换无法只改浅底那次（浅底仅 1 次 spinner 瞬态）——映射会让深底白字变深字反而不可见，顾此失彼。**反转续七否决的理由**：续七否决时字重还是 400（续九根因未发现），用户把所有不清归到颜色 → extendedAnsi 被误判；续九（字重）+ 续十（DOM 渲染器根治模糊）解决清晰度后，extendedAnsi 能真实生效；且续七用的 Solarized blue `#268bd2` 白底仅 4.0 不达标，续十二各映射目标均 ≥ 4.5 达 WCAG AA。教训沉淀：Solarized 强调色只配 Solarized 暖底成立，故续十二不沿用 Solarized，直接用 Tailwind 各色 -700 深档。

**`fontWeight`（续九加 500 → 续十一删，回到默认 400）**：续六到续八一直在调颜色，方向错了——用户实测「**加粗的清晰、普通 fg 不行**」精确指向**字重**根因。claude 普通文本用 `\e[39m`（default fg = `#1e293b`，对比度 13.75，颜色本该非常清晰），加粗文本用 `\e[1m`（同色，字重 700）——颜色对比度一样，唯一区别是字重：默认 `fontWeight: normal`(400) vs 加粗 700。在 12px + WebGL + 浅色底上，400 字重笔画偏细 → 普通文本「不清楚」；700 笔画厚 → 加粗清晰。**这是字体渲染粗细问题，不是颜色问题**，故调颜色（续六 minimumContrastRatio / 续七 Solarized / 续八纯白底）均无改善。续九改 `new Terminal({ fontWeight: 500 })`（非加粗文本从 400 提到 500，中等偏粗让笔画厚起来又不至于像 bold 那么重），用户实测「清晰的非常明显」。**续十一删除**：续十（DPR 渲染器分流）把桌面端切到内置 DOM 渲染器（浏览器原生字体抗锯齿，任意 DPR 清晰）、移动端 WebGL 整数 DPR 本就不模糊——两种渲染器都不再模糊，**500 字重本是 WebGL 模糊下的笔画缓解，现失去存在理由**，回到 xterm 默认 `normal`(400)。字重不分主题（全局选项），亮暗都受益。配合亮色 `--surface` 浅蓝灰底 + extendedAnsi 256 色可读化映射（见上），整体浅色终端达到清晰和谐。

**渲染器按 DPR 整数性分流（续十，桌面端字迹模糊的真根因）**：续九解决字重后用户发现残留问题——**移动端清晰、桌面端仍字迹模糊**，且明确不是主题选项造成（字重/底色/对比度都不分桌面/移动）。真根因是 **xterm WebGL 渲染器在非整数 `devicePixelRatio` 下纹理采样模糊**：WebGL 把字形烘焙成图集（`fontSize × devicePixelRatio`，xterm `TextureAtlas.ts`），渲染到屏幕时缩放——整数 DPR（移动端 2/3）整数倍缩放、每像素精确映射 → 锐利；非整数 DPR（桌面端 1.5，Windows/Mac UI 缩放常见）1.5 倍线性采样、字形边缘亚像素落在像素边界半亮半暗 → 发虚发灰（暗色主题因深底浅边的视觉特性不明显，但同样存在）。MDN WebGL best practices 明确「non-integer devicePixelRatio… causes moire artifacts」，VS Code terminal 同源问题。**方案**：仅整数 DPR 加载 `WebglAddon`，非整数 DPR 跳过 → xterm 自动回退内置 `DomRenderer`（`CoreBrowserTerminal.ts:584`，浏览器原生字体抗锯齿，任意 DPR 清晰，**零新依赖**，不引入 `@xterm/addon-canvas`）。判据用 DPR 整数性（`Number.isInteger(window.devicePixelRatio)`）而非 `isDesktop`——iPad 横屏宽屏 DPR=2 仍享 WebGL。移动端 WebGL 路径完全不动（整数 DPR = 原逻辑 + 整数性守卫）。**不动态切渲染器**：DPR 变化（拖窗到不同显示器、改系统缩放）是低频场景，动态切需销毁重建 terminal（丢 scrollback/重连 WebSocket），代价远大于收益；terminal 创建时读一次 DPR 定渲染器，DPR 变后最坏回到「未优化状态」而非崩溃。

## Typography

字体策略以 **Geist Variable** 为 UI 字族，等宽用 `SFMono-Regular, Consolas, Liberation Mono, monospace`。共 8 个层级，覆盖 headline / body / label / caption / code 五个角色。

> **字体栈真相**：实现为 `--font-sans: "Geist Variable", sans-serif`（`@theme inline`）。`index.css` 的 `:root font-family: Inter, ...` 栈已被 `@theme inline` 覆盖、**实际不生效**（除非 Geist 加载失败回退到 `sans-serif`）。YAML 的 `fontFamily: "Geist Variable"` 是主字族；如需保留 Inter 兜底，需在 `--font-sans` 显式写回。不要按 YAML 字面把 `--font-sans` 改成裸 `"Geist Variable"`——会丢 `sans-serif` 兜底。

- **Headline（lg/md/sm）**：600 Semi-Bold，用于页面标题与区段标题。lg=24px、md=20px、sm=16px，负字距收紧（-0.02em / -0.01em）。
- **Body（md/sm）**：400 Regular，主文本。body-md=14px（页面正文），body-sm=12px（nav 项、label、toolbar——**系统最高频字号**）。**项目名**用 headline-sm（16px/600），语义为分组标题（批 J / 决策 33）。
- **Label-caps**：700 Bold，`0.6rem` (≈10px)，`uppercase` + `letter-spacing: 0.12em`。用于 eyebrow / section label / status pill 文字。**统一用 `0.12em` 字距**（收敛历史 `tracking-[0.12em]` 与 `tracking-wide` 并存）。**品牌展示标题例外**：登录页（AuthGate）等刻意拉宽的品牌大标题保留 `0.28em`，不强制收敛。**已落地 primitive = `ShellSectionLabel`**（typography 固定，padding 由调用方按所在容器控——左栏 `px-2` / 中栏 `px-3` / 父容器控）。
- **Caption**：500 Medium，`0.65rem`，metadata 与紧凑计数（如 `3A`/`2T`）。
- **Code**：400，`0.75rem`，`line-height: 1.65`（terminal/code 需要宽松行高）。移动端 terminal 可降到 `11px / 1.58`。**文件预览源码视图（CodeEditor，整文件源码）字号 = body-sm `0.875rem`(14px)**，对齐渲染模式 markdown 正文 `text-sm`——它不是「正文里的代码块」而是「整文件源码视图」，可读性按正文级字号；Code-block（渲染 markdown 内代码块、terminal）仍 `0.75rem`。

**字重约束**：单屏不超过两种字重组合（典型：400 正文 + 600 标题；eyebrow 用 700 属同一标题语义族）。

## Layout

布局遵循**响应式三段/三栏**模型，8px spacing scale 贯穿。

- **Spacing scale**：`micro 2px` / `xs 4px` / `sm 8px` / `md 12px` / `lg 16px` / `xl 20px` / `2xl 24px` / `3xl 28px`，外加 `gutter 8px`。卡片内部优先 `md–lg`（12–16px）padding，大容器用 `xl–3xl`（20–28px）。紧凑 toolbar 用 `micro–xs`（2–4px）。
- **桌面工作台**：三栏——左 rail（跨项目树，一级 220px / 二级 210px）+ 中栏实例区（split 多实例）+ 右栏 inspection tabs（Files/Git）。三栏均 `minmax(0, 1fr)` 或固定宽，内部各自滚动。全局总览的中栏 tab 行额外有 Files（根目录 = `PROJECTS_ROOT`，只读列所有项目目录；进入某项目子目录后切换为该项目的可写 files，复用项目 files API）。
- **移动工作台**：两层导航——一级底部胶囊（项目/全局/设置）+ 二级单行 header。**一级底部胶囊 `mx-auto` 始终水平居中、`w-fit max-w-full` 按内容收缩（不撑满、留两侧留白舒展），item `px-4` + `gap-4`（2026-08-16 起 FAB 全部移到 header 右上角，`group-has-[.mobile-fab]` 让位 CSS 已清理，capsule 恒为 base 态）**。列表态与聚焦态 header 同款单行结构：◄ 返回 + tab 横滚区（`flex-1 overflow-x-auto` 隐藏滚动条）+ 右侧 `shrink-0` 区（列表态=项目名/全局标题，聚焦态=ℹ✕ 胶囊操作区）。**移动 header 高度统一 `h-11`、padding `px-3`**：`MobilePageHeader`（一级大标题式：项目列表 / 设置）与 `MobileTabHeader`（tab 横滚式：全局总览 / 项目总览 / 聚焦态）两套 primitive 并存但视觉高度 + padding 对齐，覆盖所有移动 header。项目列表态合并旧「MobilePageHeader + 二级 tab 行」为单行（对齐聚焦态），tab 多时横滚不换行，项目名右侧 `truncate`。聚焦态 = 单实例内容，底部让位给输入区。三段式 grid：`header` 置顶 / `content minmax(0,1fr)` / `input 或 nav` 置底，超出只在 content 滚动。**移动文件树 cwd 记忆**（2026-08-04）：项目 Files tab / 聚焦态 Files inspection / `/files` 全局页的文件树当前目录持久化到 localStorage（`workbenchMobileProjectFilesPathAtom` 按项目 key 分组的 `Record<string,string>` + `workbenchMobileGlobalFilesPathAtom` 全局页字符串，均 `atomWithLocalOnlyStorage`），后台被杀/重开/刷新后停留在上次目录（A→B→C→D 重开停在 D），切项目按 key 隔离天然不串。**路径不存在回退**：持久化目录/项目已被删除时（`listProjectFiles` 非 2xx → fetchJson 抛 Error），FilesPanel 受控模式下查 `files.error` 自动 `goToPath("")` 清空记忆回退根目录（`file-browser.tsx` effect，仅受控调用方触发，桌面非受控零影响）。
- **移动项目工作台**（2026-08-16 重设计）：**侧边栏 drawer（左栏投影）+ header 内容 tab 带（中栏投影）**。drawer = 左侧抽屉（宽度 `min(88vw,340px)`、右缘 `rounded-r-2xl` 16px、scrim 黑 32%、slide-in-left + exit `fill-mode-forwards` 300ms、段导航横向 tab 行可横滚），顶部返回入口 A（离开项目回列表），7 段文字（总览/历史/文件/Git/页面/Wiki/插件，`buildOverviewTabs` 复用）；浏览态进入项目默认展开总览段（会话列表即入口），**聚焦态进入（带 focusId，如从全局总览点会话卡）drawer 收起**——用户已明确要看会话，总览段是多余遮挡；点列表项自动关 drawer。header 内容 tab 带 = ☰ drawer 开关 + 打开 tab 横滚区（`flex-1 overflow-x-auto` 隐藏滚动条，`shrink-0` chip，active `bg-primary/10 text-primary` nav-item token，✕ = 最小化）+ trailing（聚焦 session 时 ℹ✕ 胶囊 ✕=关闭实例；**浏览态右上角 icon 方新建按钮**，与 ☰ 对称同款 `h-9 w-9`，点开 ActionMenu Claude/Terminal 底部 sheet——取代旧右下角 FAB，二级页无底部 nav 让位语义失效，见 `floating-action-button` 条目）。底部 nav 只在全局一级页；项目工作台是二级页无底部 nav。结构与实现详见 `workbench-views.md` §7.7/§9，调研来源：Material navigation-drawer 规范 + AI 工具侧边栏类别先例（Claude/ChatGPT/Cursor/Windsurf，侧边栏作为项目内导航是 AI 工具类别共识，> 通用 iOS 层级规范）。
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

**浮层内容背景（实色，非磨砂）**：dialog/sheet/popover 的内容容器用实色 `surface-raised`（`shellSurfaceClasses.workspace`），**禁半透明磨砂**（`bg-surface-raised/15` 等）。磨砂靠透出深色/彩色底层做美感，明主题浅色透不出对比，叠在 scrim（`rgb(0 0 0 / 0.6)`）上发灰发糊——`/15` 盖不住 60% 黑。浮层「脱离表面」的层次由三层分离提供：scrim 半透明遮罩（上条）+ 实色 content bg（本条）+ 浮层 shadow（L419），**不靠 content 自身半透明**。这与 tonal-layer 哲学一致：面板/卡片用实色 `surface-raised`，层次靠色阶差（L410-415）+ shadow（L417），不靠透明叠加。

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

- **navigation-drawer**（移动端项目侧边栏，`mobile-project-drawer.tsx`）：Radix `Dialog modal=true` 左侧抽屉原语（scrim 点击关 / Esc / focus trap 全交 Radix dismissable-layer，frontend-notes §4）。**尺寸**：宽度 `w-[min(88vw,340px)]`（Material navigation-drawer：小屏 ≥88% 宽、上限 340px），右缘 `rounded-r-2xl`（16px，Shape 档 `2xl`），scrim 黑 `bg-black/32`（Material 32%，轻于居中 dialog 的 60%）。**动画**：enter `animate-in slide-in-from-left duration-300`、exit `animate-out slide-out-to-left duration-300 fill-mode-forwards`（exit 必须 forwards——`animate-out` 默认 `--tw-animation-fill-mode:none`，动画结束回原位一帧，frontend-notes §9）。**行模型**：段导航横向 tab 行（复用 `TabButton` + `overflow-x-auto` 可横滚，active `bg-primary/10 text-primary` nav-item token，对齐桌面左栏 middle tab bar）。**结构**：顶部返回入口 A（离开项目回列表）+ 项目名；段导航（7 段横向 tab）+ 段主体（总览=会话列表+新建入口/历史=HistoryList/文件=FilesLeftPanel 文件树·Git=GitChangesList 变更列表（点文件关 drawer 开 tab / diff tab，文件·Git 并入 tab 带）/页面·Wiki=PagesPanel/WikiPanel/插件=PluginsPanel）。**safe-area**：header `pt-[var(--shell-safe-area-top)]`、底部 `pb-[env(safe-area-inset-bottom)]` 单点避让（frontend-notes §1）。
- **nav-item / nav-item-hover / nav-item-active**：导航行（左 rail 项目/实例、移动 header tab、right-panel tab）。默认 `on-surface-muted` 文字 on `surface`，`rounded-md`，padding ≈ `6px 8px`，typography `body-sm`。**hover**：文字升到 `on-surface`，背景叠 `on-surface 5%`。**active**：文字切到 `primary`，背景叠 `primary 10%`，可配 `primary 30%` 边框。这三态是全系统最高频交互单元——`right-panel-tabs.tsx`、`mobile-workbench.tsx`、`split-panel.tsx` 历史中各自复刻过同套模式，**已收敛为 `NavItemContent` 单一 primitive**（horizontal：`px-2 py-1.5` 即 8/6px、`rounded-md`、`gap-2.5`；vertical mode 供移动底部 nav，`px-4 py-1.5` 即 16/6px 触摸友好——2026-08-16 起 FAB 已全量下线，旧 `group-has-[.mobile-fab]:px-1` 收紧已清理）。YAML `padding: 6px` 指垂直值，水平 8px 见 prose `6px 8px`。剩余 tab 变体（移动触摸 `px-3 py-3`、紧凑 tab `px-2.5 py-1`）待后续统一。**workbench group tab（`TabChip`）已收敛到 nav-item 设计语言**：active 用 `bg-primary/10 text-primary`（品牌色，非旧 `bg-on-surface/10` 中性灰胶囊）、`gap-2.5 px-2 py-1.5 rounded-md` 对齐 `NavItemContent`；marker 用 `xs` 裸 icon（见 card 段 marker 三档）；✕ close 是 tab 特有动作（nav-item 无），`h-4 w-4` 紧贴 label 右侧。**左栏是经典两层侧栏导航**：① **顶层 peer**（全局总览节点 + 「项目」section header）同级——marker 对齐到同一条左边线（视觉 9px = `Button` base `border border-transparent` 1px + `NavItemContent` `px-2` 8px；手写折叠 button 显式加 `border-transparent` 对齐 `Button` border 模型，否则少 1px 与 nav 行错位）、行高等高（section header 行去双重 `py-1.5`，仅按钮内 `py-1.5`，与全局节点 Button outer 同 42px），样式相似（同 marker + label + hover/active token，section header 多收起箭头 + `+` 新建按钮）。② **项目子项**缩进在「项目」header 下（`pl-4` 16px + 基线 9 = marker 25px），marker 25px 与顶层 9px 明确分层，体现父子关系。**不靠缩进区分顶层 peer，只靠缩进区分父子**——peer 间靠 marker tone（default vs success）+ 收起箭头/新建按钮区分语义，而非缩进。**左栏整列共用同一行模型 + 同一条左边线**（含底部 footer 设置入口）：所有可点击行统一 `NavItemContent horizontal` 语义——`gap-2.5 px-2 py-1.5 rounded-md` + `border border-transparent`（复刻 `Button` border 模型，使 marker/icon 左缘恒落在 9px = border 1 + `px-2` 8）；footer 设置容器用 `py-2`（**去水平 padding**，避免容器 `p-2` 与按钮 `px-2` 双层叠加把 icon 推到 16px 偏离 nav marker），使设置入口裸 icon 左缘也落 9px、与全列 marker 对齐成一条左边线。**IconMarker sm 内部 icon 统一 `h-3.5 w-3.5`**（14px，对齐 `sessionMarker` sm 全栈约定 `shell-primitives:717`；左栏 globe/project header/项目子项三处 marker 内部 icon 等大）。**裸 icon（非 marker 内）分两档，刻意不同尺寸表达层级**：① 身份性裸 icon（设置齿轮、`+` 新建）= `h-3.5`（与 marker 内 icon 同权重，代表入口/动作身份）；② 控件指示器（收起 chevron）= `h-3`（比身份 icon 小一档——chevron 是次要控件，与 `text-sm` 14px label 配比 12px 更协调；为统一而把 chevron 也拉到 14px 反而抹掉「控件 vs 身份」的层级）。
- **activity-bar / activity-bar-button[/-hover/-active]**：VSCode 式一级导航竖工具条（桌面活动栏，设计 `activity-bar-redesign.md`）。列宽 48px（`w-12`），常驻不受左栏折叠影响。**button** = icon-only `h-10 w-10`（40px，触摸友好）+ `rounded-md`，内部 icon `h-5 w-5`（20px，比 content nav 的 `h-3.5` 大一档，体现一级导航权重），默认 `on-surface-muted`。**hover**：文字升 `on-surface` + `bg-on-surface/5`。**active**：**左边线 marker** `border-l-2 border-primary`（VSCode 式左竖条）+ 文字 `primary`——区别于 content 级 `nav-item-active` 的 `bg-primary/10` tint：一级导航 icon-only 按钮无文字块，背景 tint 视觉太重，改用「左边线 + 文字色」表达 active。`<ActivityBar>` primitive（`shell/activity-bar.tsx`）+ `activityBarButtonClasses({active})` 生成器；active 态由 `workbenchNavAtom`（localStorage，不进 URL）驱动。`border-l-2` 在非 active 态用 `border-transparent` 占位，避免 active 切换时按钮内容位移。[设置] 项特例（决策 44，取代旧跳 `/settings` 路由）：`mt-auto` 置底（与主组 projects/files 之间由 `margin-top:auto` 撑开贴底，VSCode 式主组 + 底部分离）+ onClick 开 `SettingsDialog` 居中弹窗（`useState` 触发，不离开工作台、不切 nav state）。设置按钮 active 由 `settingsOpen` 驱动（非 `workbenchNavAtom`）。移动端 [设置] 仍走底部胶囊 `<Link to="/settings">` 全屏路由（Phase 4 `MobilePrimaryNav`），桌面端 `/settings` 路由保留但 ActivityBar 不再 navigate。**设置内容两层结构（决策 48，Apple 设置范式）**：`SettingsDialog`（桌面弹窗）/`SettingsRoute`（移动全屏）共享 `SettingsContent`，改两层——root = 3 个 grouped ListRow 入口胶囊（Providers / Claude 运行时 / 通用），整行点击进 detail；detail = 该项具体配置控件直接堆叠（**不再有 grouped 胶囊**），header 返回切换（桌面弹窗内 header 返回箭头 / 移动 `MobilePageHeader` back prop），不进 URL（`activeSection` 组件内 state，外壳持有、`SettingsContent` 接 props 单向流）。**桌面弹窗固定高度**：`SettingsDialog` 内容容器用 `h-[75vh]`（**非** `max-h`）+ header `shrink-0` + 内容区 `flex-1 min-h-0 overflow-y-auto`——root/detail 切换浮窗高度零跳变（root 内容少时下方留白、detail 内容多时内部滚动），对齐 Apple/VSCode 设置面板固定尺寸范式；header 固定不滚。**移动 detail 隐藏一级导航**：`SettingsRoute` root 态渲染 `<MobilePrimaryNav>`（底部项目/文件/设置胶囊），detail 态**隐藏**——对齐 Apple 设置 detail 全屏沉浸（detail 有 header 返回，底部 tab 不该占）；内容区底部 padding 跟随（root `pb-24` 留 nav 高度、detail `pb-8` 收紧）。**设置 Card 用 `bg-surface` 实色面板范式**：设置弹窗内容区底是 `bg-surface-raised/15`（半透明，混出 ≈#0d131e 的浅底），若 Card 用默认 `bg-card`（=surface-raised #141b28 实色），虽比底亮但 `ring-foreground/10` 轮廓几不可见，Card 边界糊进底里 → 观感"暗沉"（不像 Apple 黑底上明显浮起的亮卡片）。改与活动栏 nav 同款范式：Card 覆盖 `bg-surface`（#0f1520 实色，活动栏 nav `bg-surface` 同源）+ `border border-neutral-line`（可见边框，对齐活动栏 `border-neutral-line/60`）——实色 + 可见边框让 Card 在半透明底上清晰浮出，对齐 Apple 设置 grouped 卡片的明确边界。settings 全部 4 个 Card（root 3 胶囊 / ProvidersSection provider 列表 / Claude runtime 控件 / GeneralSection 占位）统一此范式。**移动端内容区底对齐桌面弹窗**：`SettingsRoute` main 外壳仍用 `shellSurfaceClasses.shell`（移动端全局一致），但内容滚动区加 `bg-surface-raised/15`，与桌面 `SettingsDialog` 内容区底同款——否则移动端列表 Card(`bg-surface`) 落在 main 的 `bg-surface/20`(更暗)上，与桌面弹窗底 `bg-surface-raised/15`(更亮)不同档，同个 Card 两端颜色对比不一致（桌面端 Card 凹陷浮出、移动端 Card 与底同色浮不出）。两端内容区底统一后，列表 Card 颜色对比关系两端一致。
- **selected-row**：比 nav-item-active 更重的"已选中"态（如 list 中已选文件/实例）。`rounded-lg`，border `primary 60%` + bg `primary 10%`，文字 `primary`。区别于 active（当前焦点）——selected 是持久选中标记。**`ListGroup` 连续行内的 selected 是特化覆盖**：去 border、纯 `bg-primary/10`（见 list 条目）。
- **list（ListGroup + ListRow，全局列表契约）**：iOS Files 范式——**列表样式由列表性质决定，不由视口决定**。会滚动/内容多的「内容列表」（Files 文件列表、Git 改动列表、历史 session 列表）一律用 **plain** 连续行：两端一致 `divide-y divide-neutral-line/40`（Tailwind v4 实现 = 除末行外每行底部 1px separator，选择器 `> :not(:last-child)`，**非每行 gap**），无外框/圆角/卡片，贴外部 `p-3`（**顶部例外**：ListGroup 上方是带 `border-b` 的 header——PathBreadcrumb / Git scope chips / 左栏 PanelHeader——时，外部容器去 padding-top 用 `px-3 pb-3` 而非 `p-3`，首行 box 紧贴 header border-b，与行间 divide-y「border 分隔 + box 紧贴」一致；否则首行 box 上方留白 12px vs 行间 0 缝隙，首行视觉"悬空"不整齐。Files / Git 列表已按此，history 列表 ListGroup 紧贴 ShellSectionLabel 同理）。plain 比每行圆角卡片 + gap 更紧凑（行间无线间距），但行高仍 `px-3 py-2.5` ≈50px 保证触摸/可读。**短/固定/分组列表**（Settings providers 等）用 **grouped**（Apple Settings 范式）：外层 `Card className="gap-0 py-0"` + `CardContent className="p-0"` 圆角卡，内层同一 `ListGroup`/`ListRow` divide-y；整行点击进详情/编辑，destructive 收进行尾 ⋯。调用点：`settings-dialog.tsx` ProvidersSection provider 列表 + **设置页 root 层 3 个入口胶囊**（Providers / Claude 运行时 / 通用，决策 48）；点入 detail 层后该项具体配置不再用 grouped、改表单控件直接堆叠。**行 `ListRow`**：去 `rounded-xl`、去独立 `raised` 背景（连续行共享外部底）；非 selected 用 `hover:bg-on-surface/5`；selected 用纯 `bg-primary/10`、**去 border**——连续行里 `border-primary/60` 与行间 separator 打架，是对 `selected-row` 通用契约的连续行特化覆盖。**`divide-y` 硬约束**：`ListRow` 必须是 `ListGroup` 的**直接子**（`.map` + `key`），中间不得包 `div`/`Fragment`，否则 `> :not(:last-child)` 选择器失效、separator 消失。**session 列表 marker 统一**：历史 history tab 行 + 总览 grid 卡片都是 session 同质行，marker 一律 `sessionMarker(type, provider, "sm")`（28px，`IconMarker sm` + provider icon/tone），不再散写裸 `IconMarker`（历史旧实现用默认 md=40px 是全栈唯一 outlier，已收敛到 sm 与总览 grid 卡片同款）。**边界**：`card`（可独立摆放的实体）默认 raised 圆角卡，但在密集网格（`InstanceGrid` plain 视图，单列卡片紧挨排列）复用本契约 plain 范式（见 card 条目 InstanceCard surface 两态）；`nav-item`（导航行语义）不在本契约内。本契约只管**同质内容行的连续序列**。
- **button-primary / -hover**：primary 操作（创建实例、确认）。**默认渲染为 `linear-gradient(135deg, primary, secondary)`（`bg-gradient-to-br from-primary to-secondary`）**，文字 `on-primary`，`rounded-md`，padding `8px`。YAML 的 `backgroundColor: primary` 是 gradient 起点的 normative fallback（对比度基准 + 不支持 gradient 场景）。**hover**：gradient 提亮一档（`from-sky-200 to-violet-300`），可叠 `shadow-lg shadow-cyan-950/25`。
- **button-secondary**：次要操作（取消、辅助、**close 按钮**）。`surface-raised` 背景，`on-surface` 文字，`rounded-md`。hover 叠 `on-surface 5%` 或 `surface-raised` 加深。
- **mobile-sheet-fullscreen**：移动端全屏覆盖 sheet（file preview / Git diff 等 contextual deep view）。`fixed inset-0 z-50` + `bg-surface`（不透明，遮挡父页面）+ `pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]` 单点避让（不叠 vh/dvh，详见 `frontend-notes.md` §1）+ `animate-in slide-in-from-bottom-full duration-300 ease-out`（`tw-animate-css`）。z-50 高于底部一级 nav。sheet 内 detail header 用三段 grid（`grid h-11 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]`，详见下方 detail-header 三段 grid 规则），关闭按钮（close 图标）在右侧 `capsule-actions` 胶囊内、`justify-self-end` 第三列、`sm:hidden`。**list header（浮窗外 PathBreadcrumb / scope chips 行，`py-3` 53px）与 sheet 内 detail header（`h-11` 44px）是两套独立 header，高度刻意不同**：list 是浏览态、密度低；detail 是聚焦态、对齐一级页面 tab header。不要为了"统一"把两者改成同高。桌面 `sm:static sm:flex-1 sm:bg-transparent sm:pt-0 sm:pb-0 sm:animate-none` 回 inline。**dismiss 动画必须 `fill-mode-forwards`**：exit 用 `animate-out slide-out-to-bottom-full duration-300 ease-in fill-mode-forwards`——`animate-out` 默认 `--tw-animation-fill-mode:none`，动画结束元素回原位（`translateY(0)`、opacity 1）一帧，`useMobileExitClose` 的 `onAnimationEnd` → React 切 `hidden` 前会闪现（详见 `frontend-notes.md` §9）；`fill-mode-forwards` 让动画结束保持终态（滑出不可见）直到 React 切 `hidden`。enter 的 `animate-in` 终态即原位、无回弹差，不需 forwards。
- **action-menu / action-sheet**：统一菜单原语 `<ActionMenu>`（`ui/action-menu.tsx`），按视口自适应分流，**收敛历史四套菜单实现**（Radix dropdown ×3、InstanceCard 手写、SessionDetail 手写）。调用方只声明 `items: { label, icon?, onSelect, variant? }` + `trigger`，原语内部决定形态。**桌面（`sm:` 起）** = Radix 锚定 popover：content `rounded-xl`(20px) + `border-neutral-line` + `surface-inset/95` + `backdrop-blur-md` + `shadow-2xl shadow-black/40` + `p-1.5`；item `rounded-lg`(14px) + `px-3 py-2.5` + `body-sm font-semibold` + icon 统一 `size-4`（**禁止散写 `h-3.5`**）+ hover/focus 用 `bg-accent`（= `surface-raised`，shadcn `--accent` 映射，软 hover 底）；`variant: destructive` 用 `error` 文字 + `error/10` hover。**移动（`max-sm:`）** = 底部 action sheet：scrim `rgb(0 0 0/0.6)`（点击关闭）+ sheet `surface-raised` + `rounded-t-xl`(20px) + `tw-animate-css` `slide-in-from-bottom` + item 全宽 `min-h-[48px]`（44pt 触摸基准）+ 末项「取消」+ `padding-bottom: env(safe-area-inset-bottom)` 单点避让（**不叠 vh/dvh**，同 `mobile-sheet-fullscreen` 铁律）。**modal 语义由共享 `<Dialog>`（`ui/dialog.tsx`，Radix `modal=true`）承载**：scrim 点击关闭 / Esc / focus trap / body pointer-lock 全交 Radix dismissable-layer，移动 sheet 与居中 modal / 全屏 reader / 底部 info sheet 统一走同一 primitive（见 `dialog` 条目），不再手写 scrim + onClick + window keydown。与 `mobile-sheet-fullscreen` 区别：后者是全屏 contextual deep view（file preview / Git diff），本者是部分高度的动作选择 sheet。**触发器（统一横向 ⋯ = `ShellIcon name="ellipsis"`）**：禁 lucide `MoreVertical`（纵向 ⋮）散写——「更多」菜单语义全站同一图标（InstanceCard / GroupedProjectsList 名行 / 文件树行 / SessionDetail header）。触屏（`touch` variant = `hover: none` + `pointer: coarse`）触摸区 ≥40px（内容驱动 `p-2` 或 `touch:h-10 touch:w-10`）且**常显**（无 hover 可达）；鼠标（`hover-capable` variant = `hover: hover` + `pointer: fine`）可 `h-7 w-7` 紧凑 + `hover-capable:opacity-0 hover-capable:group-hover:opacity-100` 显隐降噪。**判定按指针能力，不按视口断点**——`sm:/max-sm:` 代理「是否触屏」会被 iPad 横屏（≥1024px 触屏）这类「宽屏 + 触屏」复合设备误判成鼠标，`opacity-0` 按钮永久不可见。`hover-capable`/`touch` variant 见 `web/src/styles/index.css`（紧邻 `@custom-variant dark`），渐进增强：默认（触屏/未知）常显可达，仅鼠标降级（详见 `frontend-notes.md` §7）。**桌面右键 = 同一原语坐标触发**：有 ActionMenu 的行/卡容器挂 `onContextMenu` → 共享 hook `useRowContextMenu()`（per-row key：`openAt(key, e)` 记坐标 + `pointFor(key)` 只对当前行返回坐标，避免列表多行共用一个 state 时多菜单同开）→ `contextMenuPoint`/`onContextMenuClose` 传回 ActionMenu，在右键坐标渲染受控 popover，**消费与 ⋯ 按钮完全同一份 items**（`renderItems()` 复用）。已覆盖 InstanceCard / GroupedProjectsList 名行 / 文件树行，取代 file-browser 手写 DropdownMenu 坐标 ctxMenu。**移动端无右键**（触屏），由 ⋯ 按钮承载同一菜单。tab 右键语义独立（tab 无 ⋯ 按钮），保留手写 `onContextMenu`（见 `workbench-views.md` §7.1）。**锚定选择器菜单**（claude2 model / permission mode 等「带当前选中态」的下拉）**不走 ActionMenu**——ActionMenu items API 无选中态（动作列表原语）；走对称的 **`OptionMenu` 原语**（`ui/option-menu.tsx`，与 `ActionMenu` 同款视口分流：桌面 = Radix `DropdownMenu` primitive，`DropdownMenuContent` 内置 `<Portal>` 到 `document.body` 由 Radix 接管 outside-click / Esc / focus；移动 = 底部 action sheet，同 `ActionMenu` 移动 sheet 范式）。两原语语义分离：`ActionMenu` = 动作列表（无选中态，destructive 变体），`OptionMenu` = 选择器（带选中态勾选 + 角色色，active 项 `disabled` 不可重选、`data-[disabled]:opacity-100` 保留高亮，角色色 model→`user`、mode→`permission`，claude2 角色色刻意保留）。**铁律：含 `transform` 的容器（如 composer float 的 `translateY(...)`）内禁止手写 `fixed inset-0` scrim**——transform 祖先会成为 fixed 后代的 containing block，scrim 只覆盖该容器范围而非视口，outside-click 失效；锚定菜单 / popover 一律经 Radix Portal 或裸 `createPortal` 到 body。
- **capsule-actions**：把多个相关 action 收进一个胶囊容器（移动端聚焦态 header、文件预览 / Git diff 详情 header 右侧操作区），与散布的独立按钮相对。容器 `inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-neutral-line/60 bg-surface-inset/60 p-0.5` + `role="group"`；内部按钮去各自的 border/bg，统一 `rounded-md`，hover 按 action 语义着色（info→primary、close→error、save→状态色）。已用于 `MobileFocusHeader`（ℹ✕，h-8 w-8 图标）、`FilePreviewPanel` header（save 文字 + close 图标，h-7）与 `GitFileDiffPanel` header（close 图标，h-7）——同一 capsule primitive，不同高度随宿主 header 密度。
- **image-viewer**（`ImageViewer`，`web/src/components/files/image-viewer.tsx`）：图片预览原地增强，替换 `PreviewBody` image 分支的静态 `<img>`。**统一手势经 Pointer Events**（鼠标 / 触摸 / 笔不分支）：单指针拖拽 → 平移；双指针 → pinch（距离比 → 缩放、中点位移 → 平移）；桌面滚轮 → 缩放；双击（鼠标 dblclick / 触屏连按 ≤300ms）→ fit(1) ↔ 2x；按钮 → 放大 / 缩小 / 90° 旋转 / 重置。**缩放统一围绕图片中心**（不做 zoom-to-cursor）——与旋转兼容、数学简洁（`translate` 按 `ratio=nextScale/scale` 衰减），Google Photos 同款取舍。状态 `{scale,x,y,rotation}`，scale clamp `[0.1,8]`。**transform**：img 绝对定位 `left-1/2 top-1/2` + `translate(-50%,-50%)` 居中，叠加 `translate(x,y) rotate(deg) scale(scale)`，`transform-origin:center`，`object-contain` + `max-h/w-full` fit。容器 `touch-none`（`touch-action:none`）阻止浏览器默认手势（页面滚动 / 系统 pinch-zoom）让 pointer events 接管；`overflow-hidden` 限定拖拽可视区。**滚轮缩放用原生 `addEventListener('wheel',…,{passive:false})`**（非 React onWheel）确保 `preventDefault` 生效——React root delegation 下 onWheel 可能 passive，且 Mac trackpad pinch-zoom（ctrlKey+wheel）会触发浏览器页面缩放必须拦截。不限制拖拽边界（自由平移，重置按钮兜底）；切图（src 变）`useLayoutEffect` 重置变换。**工具条**：画布内底部居中浮动 capsule（`absolute bottom-3 left-1/2 -translate-x-1/2 bg-surface-inset/80 backdrop-blur-sm`），复用 capsule-actions 内部按钮范式（h-7 w-7、hover→primary），中间夹 `Math.round(scale*100)%` 比例显示。图标 zoom-in=`plus`、zoom-out=`minus`、rotate=`rotate`、reset=`maximize`（`ShellIcon`）。
- **git-diff-viewer**（`DiffContent`，`web/src/components/git/git-diff-viewer.tsx`）：单文件 unified diff 只读查看。**行级语义色** `diffLineClasses`：add `text-success bg-success/5`、del `text-error bg-error/5`、hunk header `text-primary/80 bg-primary/5`、context `text-on-surface-soft`、file header `text-on-surface-muted`——三列表格（旧/新行号 + 内容），content cell `whitespace-pre-wrap break-words`。**源码语法高亮（R7）**：add/del/context 行的代码内容用 **CodeBlock 同款 refractor + oneDark 主题**着色（复用 `prism-languages.ts` 已注册的 16 语言 + `extToLang` 按扩展名选语言，token class→inline style，模块加载时解析 oneDark 一次），叠加在行级红绿背景之上；`+/-/空格` 前缀单独渲染（不进高亮，保留 diff 语义 + 保证 Playwright `toContainText` 子串连续）；跨行结构逐行不延续状态（已知取舍）；未命中语言 → 纯文本降级。**展开完整文件（R8）**：默认 git 3 行 context，header 中列 toggle 按钮（`maximize`/`restore` 图标 + 文案，`aria-pressed`，移动端隐文案只留图标）切 `context=full`（API `diff -U999999`），`placeholderData: keepPreviousData` 避免二次请求闪空，切文件/scope 自动重置折叠。**hunk 导航（R9）**：hunk ≥2 时顶部 sticky 工具条（`bg-surface-raised/85 backdrop-blur border-neutral-line/40`）——上一处/下一处（`ChevronUp/Down`）+ `第 n/共 m 处`计数，`IntersectionObserver`（rootMargin bottom -85%）被动追踪视口顶部 hunk，点击 `scrollIntoView`。三者皆复用现有 token/图标，无新色域。
- **segmented-control**（`SegmentedControl<T>` primitive，`shell-primitives.tsx`）：Apple 风格内联分段选择器（2~N 个互斥选项的**表单控件**，平铺全可见）。容器复用 `capsule-actions` 同款 token——`inline-flex w-full items-center gap-0.5 rounded-lg border border-neutral-line/60 bg-surface-inset/60 p-0.5` + `role="group"` + `aria-label`；item 是**原生 `<button>`**（**非 Radix Trigger asChild**——避开嵌套 modal 内 trigger 失效问题，正是 protocol 选择器当初从 OptionMenu 改内联分段的原因；详见 `frontend-notes.md` §5 asChild 包裹组件须透传 props/ref），`min-h-11 flex-1 px-3 text-sm font-semibold` 触摸友好，active `aria-pressed=true` + `bg-primary/15 text-primary`、inactive `text-on-surface-muted hover:bg-on-surface/5`。泛型 `<T extends string>`：`{ ariaLabel, value, onChange, options: { value: T; label: string; disabled? }[] }`。与 `OptionMenu`（锚定下拉选择器，带选中态勾选）语义有别：本者是**少量互斥选项平铺**（≤4，全可见无需展开），后者是**大量选项折叠下拉**。调用点：`settings-dialog.tsx` ProviderDialog 协议 [Anthropic/OpenAI]、Settings runtime 段 [Claude/Codex]（决策 46）。
- **protocol chip**（provider 行协议标签）：`ProviderRow` subtitle 内标识 provider 协议的小圆角 chip——扫读即知「哪几个 provider 能给某 runtime 用」。`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold` + 按 protocol 取 token 化底/字色（`PROTOCOL_CHIP_CLASS`：anthropic `bg-primary/15 text-primary` 品牌、openai-compatible `bg-on-surface/10 text-on-surface-soft` 中性），与 subtitle 其余两段（baseUrl `text-on-surface` 主文本、apiKeyMasked `text-on-surface-muted` 次要）同处 `flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs` 容器，窄屏自动换行。纯 token、无散写裸色阶；与 `segmented-control`（协议**编辑**控件）正交——本者是列表行的协议**展示**标签（决策 47）。
- **dialog**（modal scrim overlay 统一 primitive，`ui/dialog.tsx`）：shadcn 风格封装 Radix `Dialog`（聚合包 `radix-ui`，`modal=true` 默认），承载所有「背景不可交互」的 modal 语义 overlay——居中 modal（SettingsFlyout / ProjectSetupPanel）、视口分流 modal（ConfirmDialog / PromptDialog：移动端底部 action sheet / 桌面居中卡片，见 `confirm-dialog` 条目）、底部 sheet（ActionMenu 移动端 / InfoSheetDialog）、全屏 reader（FullscreenReader）。**采用 shadcn 官方居中卡片模型**（非全屏 flex 容器）：`DialogContent` 默认 = `fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2` + `grid w-full max-w-[calc(100%-2rem)] sm:max-w-lg`——Content **即卡片本身**，自带宽度约束（移动端留 1rem 缝不顶满、桌面 512px），点卡片外 Overlay 全屏 scrim 区 = outside → Radix `onPointerDownOutside` dismiss。**形态靠调用方 `className` 覆盖**，封装不硬编码 variant：居中 = 默认（内层只放卡片视觉 `rounded-2xl p-5 shadow-2xl shadow-black/40 ${shellSurfaceClasses.*}`，**不再 `w-full max-w-sm` 套第二层卡片**——宽度由 Content 约束）；底部 sheet = `fixed inset-x-0 bottom-0 top-auto max-w-none w-full translate-x-0 translate-y-0` + `flex items-end justify-center` + `rounded-t-xl` + safe-area（**必须 `top-auto` 中和默认 `top-1/2`、`max-w-none` 解除 `sm:max-w-lg`**，否则 sheet 占满下半屏）；全屏 = `fixed inset-0 max-w-none w-full translate-x-0 translate-y-0 flex flex-col`（**必须 `max-w-none`**，无 outside 区靠 ✕/Esc 关）。`DialogContent` = Portal + Overlay（`bg-black/60 backdrop-blur-sm` + fade 动画）+ Content（`pointer-events-auto` + fade 动画）。**modal 三机制由 Radix dismissable-layer 接管**：scrim 点击关闭 / Esc / focus trap / body pointer-lock，统一取代历史手写 scrim + onClick + window keydown + useEffect body-lock。**`onOpenChange` 是关闭统一入口**：scrim 点击 / Esc / ✕ 都走 `onOpenChange(false)`，promise-API dialog（confirm/prompt）在此 resolve(false/null)。**非 modal overlay 不走本 primitive**：按坐标定位的锚定 popover（RawDebugPopover）用裸 `createPortal`，hover popover 背景 可点不锁。详见 `frontend-notes.md` §4 modal pointer-lock 演进。
- **button-danger**：destructive（删除实例、销毁确认）。`error` 背景，`on-error` 深墨字（`error` 是 rose-400，白字对比约 3:1 不达 WCAG AA 4.5:1，深墨字约 6:1 达标）。**克制使用——仅确认对话框里的销毁动作；window/terminal close 按钮用 button-secondary/ghost，不要做成 danger**。
- **confirm-dialog / prompt-dialog**（视口分流确认/输入弹框，`shell/confirm-dialog.tsx` / `prompt-dialog.tsx`）：iPhone 理念——移动端底部 action sheet，桌面居中卡片。**移动端（`max-sm:`）** = iOS action sheet：`DialogContent` 底部 sheet 形态（`fixed inset-x-0 bottom-0 top-auto max-w-none w-full translate-0` + `rounded-t-xl` + `slide-in-from-bottom` + safe-area），顶部一组圆角卡片（`rounded-xl` + `shellSurfaceClasses.workspace`）承载标题（`text-base font-semibold`）+ 消息（`text-sm text-on-surface-muted`，confirm）或 input（prompt，对齐 `input` token），下方操作按钮**竖排全宽** `min-h-[48px]`（44pt 触摸基准，复用 `mobileSheetItemClasses` 骨架）——confirm 按 tone 着文字色（`danger`→`text-error` 红字、`accent`→`text-primary`、`default`→`text-on-surface-soft`），prompt Confirm 用 `text-primary`；Cancel 单独一组在底部（独立圆角卡片 + `text-on-surface-muted`，与操作组有间隔，iOS action sheet 取消分组标准）。**桌面（`sm:` 起）** = shadcn 居中卡片 + 按钮横排右对齐（`flex justify-end gap-3`）+ 销毁按钮 `button-danger` 实色 `error` 填充（见 `button-danger` 条目）。**平台差异刻意保留**：移动端销毁用**红字**（iOS action sheet destructive 标准），桌面销毁用**实色红块**（modal 标准）。`useConfirm`/`usePromptDialog` holder 模式不变，调用方零改动。
- **surface-shell / surface-sidebar / surface-raised / surface-raised-hover / surface-inset**：surface 角色（收敛 `shellSurfaceClasses`）。`surface-shell` = app 外壳 `surface` + `rounded-shell-desktop`；`surface-sidebar` = `surface-raised` 带 `from surface-raised/25 to surface-base/30` 纵向渐变；`surface-raised` = 卡片/行基底；`surface-raised-hover` = 交互行 hover，边框 `primary 60%`、背景 `surface-raised` 加深；`surface-inset` = terminal/code/preview 凹陷，`surface-inset` + `rounded-lg`。
- **surface-tint-success / -warning / -danger**：状态色作 surface tint（git added/modified/deleted 行、provider marker 背景等）。`rounded-lg`，背景为对应状态色 **@10% alpha**（`rgb(52 211 153 / 0.10)` 等），文字用对应状态色的实色或 `on-surface`。YAML 实色是 normative 基准，@10% 是渲染。**明主题铁律：alpha 用 `/10`（非 `/20~/40`）+ 文字实色**——同色系 `bg-{role}/N + text-{role}-soft` 在明主题塌（见「明主题对比度陷阱」），`/10` 让底足够浅、实色字才拉开对比；hover/active 按比例 `/15`/`/20`。
- **card**：Project/Agent/Terminal 卡片。`surface-raised` + `rounded-xl`（20px）+ `neutral-line` 边框 + padding `lg`（16px）。Agent card 可用 `2xl`（24px）。卡片服务可扫读性，不为 metadata 牺牲首屏密度。InstanceCard 采用微信朋友圈式头像布局：左侧 marker 头像（`lg`=h-9 w-9=36px，`items-start` 上下置顶）独占一列 + 右侧内容区竖排（title / subtitle / meta）；meta 行「项目名 · 最后活动」从左往右紧凑排列（`truncate`，不撑满）。折叠操作区 ⋯ 落在卡片**右上角**（`absolute top-2 right-2`），走统一 `action-menu` 原语（改名 / 关闭，token 见 action-menu 条目；移动端从底部 action sheet 展开）。状态圆点仍叠加 marker 右上角（`-right-1 -top-1`，4px 偏移不依赖 marker 尺寸）。marker 尺寸三档：card 用 `lg`（36px 头像式独立左列）/ table 与紧凑 header 用 `sm`（28px 带方框 tone 背景）/ **workbench group tab 用 `xs`（16px 裸 icon，无 IconMarker 方框，tone 用文字色）—— 与 tab label 14px 同高比例 1:1，避免 marker 比标题大的视觉失调**。tab marker 的 tone 语义保留（agent 按 provider：codex→`text-success`/openai icon，其余→`text-primary`/anthropic icon；terminal→`text-on-surface-muted`/terminal icon），仅去掉方框背景，与 nav-item 的 inline icon 一致。**InstanceCard surface 两态**：默认 `raised`（独立圆角卡 = `raised` border/bg + `rounded-lg`，单卡片/非密集场景）；`plain`（密集网格 `InstanceGrid` plain 视图，卡片紧挨排列）= 去 raised border/bg + `rounded-lg`，改 `lg:hover:bg-on-surface/5`（移动无高亮——Apple 列表范式无 hover 反馈，批 O / 决策 38；桌面保留 hover，对齐 `list` plain 行 token），marker 头像 + 3 行内容布局不变——密集排列时卡片连成连续清单，避免独立圆角卡紧挨的视觉割裂。分隔由 InstanceCard `topSeparator` 绝对定位 inset 画（两端统一 `left-15`=60px=p-3(12)+marker lg(36)+gap-3(12) 内容区左，**跳过 marker 列**，iOS separatorInset 范式；原 `divide-y` border-top 横跨全宽不支持 inset；2026-08-03 撤销桌面 `lg:left-0` 全宽、两端统一 inset），InstanceGrid plain 去 `divide-y`、给非首卡传 `topSeparator`。`CardGridSkeleton` 同步镜像。`InstanceGrid` `plain` prop 控制整组卡片 surface（透传到每个 `InstanceCard`），`CardGridSkeleton` 同步镜像避免加载态跳变。**global 总览项目标题行**（2026-08-05 融合视图，2026-08-06 手风琴化，2026-08-10 重设计 + 迭代）：`[左组：▾ 折叠 + 📁 项目名 flex-1 进入][➕ 新建二级菜单][🗑 删除]`——**section 容器 `bg-surface-raised` + Apple 动态圆角（2026-08-10，inset grouped 范式）**：每个 section 按自身展开态 + 上下邻居态算圆角与上边界——连续折叠标题行组成圆角条带段（段内首行 `rounded-t-lg` 顶圆、末行 `rounded-b-lg` 底圆、中间方角），展开分组脱离条带成独立圆角块（`rounded-lg` 四角，标题行顶圆 + 卡片底圆共享 section bg 一体成块）；段内相邻折叠行用分割线（section 条件 `border-t border-on-surface/5`），展开块与折叠段/其他展开块间用 `mt-2` 间距断开（分割线不穿过展开块）。判定：collapsed 顶圆当 `!prev || prev.expanded`、底圆当 `!next || next.expanded`、中段方角；expanded 恒四角圆。上边界：`prev.collapsed && self.collapsed`→分割线 `border-t`，否则（任一端触及展开块）→`mt-2`；首 section 无上边界。**bg 从内层标题行 div 上移到 section 容器**（展开块标题行+卡片一体共享 bg，圆角块不断开）；列表根 `px-3 py-2` 去 `divide-y`（分割线改每个 section 条件 `border-t`）。**bg = `surface-raised`（凸起语义，苹果 inset-grouped 范式）**——「分组永远比底色亮」理念：`surface-raised`[明 `#ffffff` 纯白 / 暗 `#141b28` 亮灰] 两主题都比底色（shell `bg-surface/20`：明浅灰蓝≈苹果 systemGroupedBackground `#F2F2F7` / 暗深黑）亮 → 分组凸起方向两主题统一（明：白凸起 on 浅灰底；暗：亮灰凸起 on 黑底）。**弃用 `on-surface/10`**：`on-surface` 是**文字色** token（明深 / 暗浅），@10% 叠加底色 → 明主题分组**变暗凹陷 ✗**、暗主题**变亮凸起 ✓**，两主题凸起方向翻转（明暗不对称）——这正是「明亮主题灰底+更灰分组凹陷、暗主题却接近苹果」的真根因。`press-feedback` 的 `active:bg-on-surface/10` 按压反馈保留（按下反馈语义，非分组凸起，两主题都对）。标题行 div（`flex items-center gap-2 pl-3 pr-2`）去 bg（移到 section）。**左组**（`flex min-h-11 min-w-0 flex-1 items-center gap-1.5`）包 `[▾][📁名 button]`，**复刻置顶分组「chevron + icon + 文字」紧凑结构**——▾ chevron 紧贴容器左缘（pl-3=12，与置顶 ▾ 同 x 位对齐）+ 紧挨 📁 图标（左组 gap-1.5=6px，纠正 2026-08-10 首版 ▾ 用 `h-7 w-7` 方块 button 致 chevron 偏右 6px、离 📁 隔 14px 的布局错误）。**行主按钮语义 = 进入项目**（📁 名 button `flex-1` 撑满左组除 ▾ 外空间，点行主体大片空白 = 进入；navigate `/projects/$key`；2026-08-10 迭代去掉冗余 › 进入按钮——整行进入已够，› 与名 button 重复）。**折叠/展开只由 ▾ 独立按钮触发**（2026-08-10 拆出：`aria-label` = `workbench.collapseProjectGroup`/`expandProjectGroup` 按态切换 + `aria-expanded`，chevron `M4 6l4 4 4-4` ▾ 下 / `M6 4l4 4-4 4` ▸ 右，`size-4`/`touch:h-10`（移动端**只放大高度不放大宽度**——宽度保持 16 对齐置顶 chevron 直接子，纠正 `touch:size-10` 撑大致 svg 居中偏右 12px、📁 跟随偏右 24px 的对齐错误；水平触摸区 16px 是「以置顶为对齐基准」的刻意取舍，垂直 40px + 紧邻名 button 折叠低频可接受）；状态 `workbenchProjectGroupsCollapsedAtom` = `atomWithLocalOnlyStorage<Record<projectName, true=折叠>>` localStorage 按项目记忆，刷新/重开保留）。**新建合并为 ➕ 二级菜单（2026-08-10 迭代）**：2026-08-10 首版把 +Claude/+Terminal 展开成两个行内独立按钮，迭代回合为 1 个 ➕ 按钮（plus icon，`aria-label=workbench.createSessionAria`）——点击出二级菜单（`ActionMenu`，桌面 popover / 移动 sheet，items=[Claude(anthropic icon,`workbench.createClaude2`)/Terminal(terminal icon,`workbench.createTerminal`)]，对齐项目内 `CreateSessionBar` 同款菜单）。🗑 删除保留独立按钮（trash icon，静息 muted / hover `text-error` + `bg-error/10` destructive）。新建项行级 `useCreateSession(projectName)`（name prompt → 创建 API → navigate `/projects/$key/session/$id` + invalidate，不需进具体项目即可在总览直接建实例；空项目行同样可建）。**桌面右键随 ⋯ 一并下线（2026-08-10）**——行内已暴露全部操作，右键冗余。置顶分组标题行无 ➕ 不涉及。空项目无可折叠内容——左组 ▾ 位 `size-4` 占位 span 保持 📁 与有实例行对齐，仍保留 ➕/🗑。手风琴行为契约源 = workbench-views.md §5。**置顶分组**（2026-08-06）：global 总览**最前**新增特殊分组「置顶」（📌 pin 图标 `text-primary`），收纳跨项目置顶卡片（**双显示**——置顶卡片同时在置顶分组与原项目分组出现，快捷入口不搬移）。置顶数据**只存客户端**：`workbenchPinnedSessionsAtom`（`atomWithLocalOnlyStorage<Record<sessionId,true=置顶>>`，localStorage key=`workbenchPinnedSessions`，按会话记忆刷新/重开保留）；**无置顶卡片时分组整段不渲染**（空隐藏；残留 sessionId 无候选匹配即不渲染，无需 GC）。标题行 = 折叠 toggle 同款（`▾/▸` + 📌 + 「置顶」，`aria-expanded`，min-h-11 热区），容器同项目行 `bg-surface-raised`（方角，同项目行），折叠态复用 `workbenchProjectGroupsCollapsedAtom` 保留哨兵 key `"__pinned__"`；**无 › 进项目、无 ⋯ 删除**（非项目）。**InstanceCard 置顶按钮**（仅 global 总览卡片，项目 scope/纯展示卡不渲染）：可选 props `pinned`/`onTogglePin`/`pinLabel`（缺失不渲染），**2026-08-06 续六 = 与时间（meta 行）同行 + absolute 脱流**（meta 行高由文字决定）：pin 用 `absolute right-0 top-1/2 -translate-y-1/2`（垂直居中 meta 行、最右）`inline-flex h-5 w-5`（20px 桌面）/ `touch:h-7 w-7`（28px 触摸）定位在 meta 行（`relative`）右侧，icon `h-3.5 w-3.5`；**pin 不进 flex 流 → 不撑高 meta 行**：meta 行高 = text-xs 16px（`min-h-4` 兜底承载 pin，无 meta 文本时仍渲染该行），pin 虽大于行高但上下溢出落在 gap-1（4px）与 p-3（12px）空白内——**三行高 20/16/16 节奏齐（subtitle 与 meta 同高）、有 pin 卡与无 pin 卡等高（彻底回收 pin 曾占的行空间）、底部不再因 pin 撑高而空旷**。水平让位：meta 行 `pr-7`（28px）/ `touch:pr-9`（36px）让 meta 文本停在 pin 左侧 8px；subtitle `touch:pr-9`（touch pin 上溢 6px 侵入 subtitle 行底部 2px，桌面 pin 只溢 2px 落 gap-1 内 subtitle 不需让位）。置顶态 icon `text-primary` + `aria-pressed=true`，未置顶 `text-on-surface-muted hover:bg-on-surface/5 hover:text-on-surface`。`stopPropagation` 双层（click + keydown Enter/Space）防 portal fiber 冒泡导航。**卡片右上 ⋯ 按钮显著**（`absolute right-2 top-2`，h-9 w-9 / touch:h-11 w-11，icon h-5 w-5）。**主次分层**：⋯ 右上角大、pin 与时间同行小（比 ⋯ 小一档，避免同侧堆砌与失衡）。**文字让位几何**：只有 title 行恒让位给 ⋯（`pr-10 touch:pr-12` = 40/48px = 按钮列 44/52（right-2 8 + h-9 36 / h-11 44）− card p-3 12，右缘 = ⋯.left − 8 间隙，防误触；title 行旧 `pr-6` 触屏钻 ⋯ 下方 12px 已修）；subtitle 行 `touch:pr-9`（touch pin 上溢避让，桌面不让位）；meta 行 `pr-7 touch:pr-9`（pin 在右侧 absolute，meta 文本 truncate 停在 pin 左侧 8px）。置顶按钮小尺寸属「与时间同行的次要操作」，对齐 header 操作区例外精神（见触屏触摸目标条目），不强制 44px——触屏 28px、桌面 20px 为刻意取舍（absolute 脱流不撑高 meta 行，三行节奏 20/16/16）。置顶分组也传 `dragAdapter` + dragRefs（桌面可拖进右工作区）。**左栏 PanelHeader 大标题层**：`WorkbenchShell` 左栏顶部 `PanelHeader` 可选 `title`（`h-11` + `text-base font-semibold` + `border-b border-on-surface/5`，对齐 `MobilePageHeader`）；活动栏 nav=projects/files 分别注入「项目」「文件」；右栏仅收起、无 title。**新建项目按钮**：桌面/移动统一 `actionButtonClasses({ tone: "accent" })` pill 文案按钮（与 CreateSessionBar 同款 token：`rounded-xl border px-3 py-1.5 text-xs font-bold` + `from-primary to-secondary` 渐变），可见文案 `workbench.createMenu`（"+ 新建"/"+ Create"），`aria-label` 用 `home.createProjectAria`；单按钮直开 ProjectSetupPanel Dialog（非 dropdown，无 chevron）；位置统一在总览 header 左侧。

- **markdown-metadata**（`FrontmatterCard`，`web/src/components/markdown/FrontmatterCard.tsx`）：markdown frontmatter（YAML `---` 块）的置顶 metadata 卡片，由 `MarkdownString` 在渲染前用 `parseMarkdownFrontmatter`（`parse-frontmatter.ts`，同构后端 `parseFrontmatter`）拆出，置顶于正文（避免 remark 把 `---` 当 `<hr>`、yaml 当正文段落）。语义化 `<dl>`（description list = metadata），每字段 `<dt>`(key) + `<dd>`(value)。token：容器 `surface-inset/60`（凹陷，与正文 surface 区分）+ `neutral-line/40` 边框 + `rounded-lg` + `p-3` + `mb-4`（与正文分隔）；key `font-mono text-[0.7rem] text-on-surface-muted`（caption 级 metadata 色）；value `text-xs text-on-surface break-words`（超长 description 自然换行）。**用 dl/dt/dd 而非 p/div**——避开 `MARKDOWN_CLASS` 的 `[&_p]:mb-2` 等后代选择器，卡片样式独立。无 frontmatter 时不渲染。
- **carousel（paged-card，已下线 2026-08-05）**：原实例分组横向分页组件（`InstancePagedCarousel`）随 grid/grouped 双视图融合为单一「按项目分段的单列网格」一并移除——组内卡片改为连续单列 `InstanceGrid plain` 平铺，无分页、无 snap、无 dots/页码行。详见 workbench-views.md §5/§6。
- **chip / chip-active**：紧凑计数与标签（如 `3A`/`2T`、provider 标记）。`surface-raised` + `rounded-full` + `caption` 字号。active 态文字 `primary` + `primary 10%` 背景。
- **input**：文本输入（ShellInput、prompt dialog）。`surface-inset` 背景 + `neutral-line` 边框 + `rounded-lg` + `body-sm`。placeholder 用 `on-surface-muted` 更弱版（`placeholder:text-on-surface-muted/60`）。
- **focus-ring**（全系统交互元素统一）：`focus-visible` 用 primary 系——`ring-2 ring-primary/30 ring-offset-2 ring-offset-surface`。收敛历史 `ring-cyan-300/20` 与 `/30` 两套。
- **cursor**（通用规则，决策 44）：所有 enabled 交互元素（button / nav-item / OptionMenu trigger / switch / 可点 div）统一 `cursor-pointer`——原生 `<button>` UA 默认 `cursor: default`（箭头）须显式覆盖：Shadcn `Button` CVA 基类（`ui/button.tsx` `buttonVariants` 首段）内置 `cursor-pointer`；**不走 Button 的手写 `<button>` 须逐处补 `cursor-pointer`**（如 `SelectorTrigger`、`role="switch"`、分段控件 `aria-pressed`、ActionMenu trigger ⋯、`ActivityBar` 按钮 `activityBarButtonClasses`）。`disabled` 态统一 `opacity-50 cursor-not-allowed`，不单独定义每个 variant 的 disabled 色。
- **press-feedback**（apple-design §1「按下立即反馈」通用规则）：所有 enabled 可点元素 `:active`（按下伪类）即时反馈统一 `active:bg-on-surface/10`（on-surface 白 10% 叠加，深色主题按下变亮高亮）——与 `hover:bg-on-surface/5`（悬停 5%）同语义、按下浓度 > 悬停（反馈强度递进，符合「按下比悬停更明显」）。覆盖 ghost 风格元素：NavItemContent（非选中分支）/ ActionButton（actionButtonClasses）/ SegmentedControl（非选中）/ MobilePageHeader back / InstanceCard ⋯ / ActivityBar / 各 tab 按钮 / workbench 行+按钮。**三类已有 active 并存不改**：移动 sheet/dialog items（`active:bg-on-surface/5`）、ListRow/InstanceCard（`.interactive-row` CSS `:active { rgb(255 255 255 / 0.08) }`，`@layer utilities`，元素 bare `transition` 已 cover 150ms 过渡）、shadcn Button（`active:not-aria-[haspopup]:translate-y-px` 1px 下移）。所有目标元素已有 bare `transition`（150ms，property 含 background-color）cover active 过渡；`:active` 是伪类非 transition，`prefers-reduced-motion`（`index.css` 全局 `transition-duration:0.01ms`）只去过渡速度、不影响 :active 触发，按下仍瞬切 bg（反馈在）。**「选中 active（prop）」≠「:active（按下伪类）」同名易混**：`active:bg-on-surface/10` 只加在非选中分支（与 `hover:*` 同分支），选中态（`bg-primary/10` / `bg-primary/15`）不叠加 press bg。
- **overlay-dismiss-symmetry**（apple-design §7「对称路径」）：浮层 dismiss 必须与 enter 同路径——移动全屏浮层（`fixed inset-0` takeover）enter `animate-in slide-in-from-bottom-full duration-300 ease-out`，dismiss 对称 `animate-out slide-out-to-bottom-full duration-300 ease-in`，不能瞬时条件渲染切 `hidden`。经 `useMobileExitClose`（`web/src/lib/use-mobile-exit-close.ts`）编排 `closing` 中间态：移动端 close → 进 `exiting` 态播 slide-out → `onAnimationEnd` 才真正清 state（`e.target !== e.currentTarget` gate 防子元素 animationend bubble 误触发）；桌面端（`useIsMobile()=false`）即时清（`sm:static` 浮层是布局位，无浮层动画）。覆盖 file-browser 文件预览 / git-diff-viewer diff 两处移动浮层。**不在范围**：Radix Dialog 浮层（prompt/confirm-dialog、action/option/dropdown-menu、FullscreenReader）由 `data-[state=closed]:animate-out fade-out-0` 自带对称 exit，无需 hook。`prefers-reduced-motion`（`index.css` 全局 `animation-duration:0.01ms`）把 slide-out 降级瞬时，`onAnimationEnd` 立即触发 → 等价桌面即时，无障碍兼容。
- **focus-visible 一致性**（apple-design §1 / a11y）：所有可 focus 元素（input / button / `[href]` / contenteditable）键盘 focus 时必须有可见指示，统一 `focus-visible:ring-2 focus-visible:ring-primary/30~40`（或 `focus-visible:border-primary` 边框替代）——**禁裸 `focus:outline-none` 无替代**（键盘 Tab 用户看不到 focus）。ui/button、ui/input、ui/badge、shell-primitives input 已内建 `focus-visible:ring`；手写 input 须逐处补（与 AuthGate / prompt-dialog input 同款）。
- **shimmer-compositor**（apple-design §11「帧级流畅」）：CSS 动画只用 compositor 友好属性（`transform` / `opacity`），**禁 `background-position` / `width` / `height` / `top` / `left` 动画**（触发 layout/paint，多行 infinite 时掉帧）。`.skeleton-shimmer` 用伪元素 `::after { transform: translateX(-100%→100%) }` 扫光（元素 `position: relative; overflow: hidden` 承载，静态底色 + 扫光条横移），不用 `background-position`。
- **dropdown-anchor-origin**（apple-design §7「锚定来源」）：Radix 弹层 Content（dropdown-menu / popover / select）的 `zoom-in/out-95` 缩放须锚定 trigger 侧——Content className 挂 `[transform-origin:var(--radix-*-content-transform-origin)]`（Radix 注入 trigger 中心坐标），不能默认 center 缩放（脱离与 trigger 的空间关系）。
- **触屏触摸目标 44px**（apple-design §10 / Apple HIG；维度正交见 `frontend-notes.md` §7）：触屏（`touch` variant = `hover: none` + `pointer: coarse`）会触摸的**行内/列表**操作按钮（如 table RowActions ⋯）须 `touch:h-11 touch:w-11`（44×44px 达 HIG）并**常显**可达。**判定按指针能力，不按视口断点**——`max-sm:` 代理「是否触屏」会被 iPad 横屏（≥1024px 触屏）这类「宽屏 + 触屏」复合设备误判成鼠标（点击区 28px 偏小、`opacity-0` 按钮永久不可见）。鼠标（`hover-capable`）下保持 `h-7 w-7` 紧凑 + 可 hover 显隐降噪。`hover-capable`/`touch` variant 定义在 `web/src/styles/index.css`（紧邻 `@custom-variant dark`），渐进增强：默认常显 + 大点击区，仅鼠标降级。**header 右侧操作区例外**：浮层 detail header close（file preview / git diff 的 `sm:hidden` close）、mobile-workbench focus header ℹ✕ 胶囊等保持视觉紧凑尺寸（h-7/h-8），**不**放大到 44px——header 内按钮与相邻标题/tab 的视觉比例协调优先于触摸目标达标，容器整体放大后会与相邻元素不协调（Apple 标准范式应是「小视觉 + 大触摸区域」：如需达标用透明 padding 扩展热区，而非把容器本身撑大）。
- **status-pill-running / -waiting / -idle / -error**：状态药丸。`rounded-full` + `caption`，文字色 = 对应状态色（success/warning/on-surface-muted/error）。**状态语义必须有文字参与，不能只靠颜色**。padding ≈ `2px 8px`。
- **code-block / code-block-muted**：terminal/code 块。`surface-inset` + `code-text` + `rounded-lg` + `code` typography（`0.75rem / 1.65`）。muted 行（注释、次要输出）用 `code-block-muted`（`code-muted` 文字）。
- **icon-fill（SVG 图标填色约定）**：闭合路径（以 `z` 结尾的 fill 形状，如灯泡/剪贴板）若只描边**必须显式 `fill="none"`**——SVG 规范默认 `fill=black`，漏写则填黑色（暗主题黑填色在深底不可见像描边、明主题黑填色在浅底成黑色实心块，与 terminal/read/search 纯描边族格格不入）。描边族图标统一 `fill="none" stroke="currentColor"`；刻意填色图标（如 sparkle/pencil）用 `fill="currentColor"`（跟随角色色、主题感知正确）。两类不可混：要么纯描边（`fill="none"`），要么 currentColor 整填，绝不留默认黑填色。
- **divider**：分隔线。`neutral-line` 实色 `1px`，宽度跟随容器；轻分隔用同色低透明（`rgba(148,163,184,0.18)`）。
- **floating-action-button (FAB)**（已废弃，2026-08-16 全量下线）：历史上曾作为移动端主创造动作悬浮胶囊（`position: fixed` 右下角 + 底部 nav 胶囊 `group-has-[.mobile-fab]` 自身收窄让位 + `:has()` 条件让位机制，完整演化记录见 `frontend-notes.md` §12）。**下线原因**：① 项目工作台重设计（2026-08-16）后 project scope 是二级页、无底部 nav——FAB「落 nav 带、nav 收缩让位」的语义锚点消失；② 用户决策：改版后 header 右上角（☰ 对称位）成为新建入口的理想落点，**全部新建入口统一迁 header 右上角**。**现状落点**：新建会话 = `MobileTabStrip` 浏览态 trailing icon 按钮（ActionMenu Claude/Terminal）；新建项目 = `MobileGlobalOverview` 的 `MobilePageHeader.actions` icon 按钮（dialog 逻辑收敛 `useCreateProjectDialog()` hook，桌面/移动共用）；新建文件夹/上传 = `FilesPanel` header 行右侧 `max-lg:flex` ActionMenu（`!readOnly` 即渲染——含 drawer 文件树树模式，移动项目 Files 主表面保留写操作入口；桌面 `lg:hidden` 不受影响）；新建页面根 = `PagesPanel` `lg:hidden` header 行 icon 按钮。按钮语言统一 plus icon `h-9 w-9`（FilesPanel header 行 `h-8 w-8` 对齐行高）、`text-on-surface-soft` + hover/active 态。`MobileFab` 组件（`shell/mobile-fab.tsx`）已删除；底部 nav capsule 恒为 base 态（`w-fit max-w-full` 居中），`group-has-[.mobile-fab]` 让位 CSS 已清理。`:has()` 条件让位机制本身的通用记录保留在 `frontend-notes.md` §12，供未来需要「按内容条件让位」时复用。

- **tooltip（hover 提示，原生 `title=`）**：两类场景配 hover tooltip。① **截断文本显完整**：`ListRow` 的 title/subtitle 是 **string** 时，渲染的 `truncate` span 自动补原生 `title=`（`typeof value === "string" ? value : undefined`；JSX title 如 git file path `<span font-mono>` 跳过——原生 title 只接受 string）；任何 `truncate` 长文本同理（skill 详情 header 名字 `PluginsRoute.tsx`、InstanceCard meta 行）。② **操作按钮补意图**：后果明确的操作（install/update/uninstall/edit/remove/add/save 等）用 `ActionButton` 透传 `title={t("...Tooltip")}`，描述性完整句（中英对齐，`*Tooltip` key 命名）。**实现统一用原生 HTML `title=` 属性 + `*Tooltip` i18n key**（范例 `files.newFolderTooltip`/`uploadTooltip`、CodeBlock copy），**不引入 Radix Tooltip**——原生 title 零依赖、零 a11y 陷阱，桌面 hover / 触屏长按均有 UA 默认行为。**不加**：文字自解释的按钮（Cancel/Back/已有明确动词标签，对齐「按钮语义由文字表达」）、JSX/非 string title。`ActionButton` 已 `...props` 透传 title（含原生 title 属性），无需改组件；`ListRow` 因 `Omit "title"`（title 是业务 ReactNode，非 HTML title）在组件渲染层统一补 string title。

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
- **Don't** 用视口断点（`sm:`/`max-sm:`）代理指针能力（hover / 触屏）——两维度正交，iPad 横屏（≥1024px 触屏）这类「宽屏 + 触屏」复合设备会被误判成鼠标，导致 `opacity-0` 操作按钮永久不可见、点击区 28px 偏小。判定「是否有 hover / 是否触屏」用 `(hover: hover)`/`(pointer: coarse)` 媒体查询（项目封装为 `hover-capable`/`touch` variant，见 `web/src/styles/index.css`），运行时事件级判定用 `event.pointerType`（范例 `drag-source.tsx`）；视口断点只管**布局结构**（形态切换、列数、显隐区），不代理交互能力。
- **Do** 操作按钮显隐与点击区按指针能力**渐进增强**：默认（触屏 / 未知）常显 + ≥40px 点击区确保可达，仅 `hover-capable`（鼠标）才降级为 hover 显隐 + 紧凑尺寸。显隐用 `hover-capable:opacity-0 hover-capable:group-hover:opacity-100`、点击区放大用 `touch:h-11 touch:w-11`；注意 Tailwind v4 已把 `hover:`/`group-hover:` 自身包进 `@media (hover: hover)`（触屏不触发），但 `opacity-0` **默认隐藏层不**在该守卫内，必须用 `hover-capable:` variant 显式门控，否则触屏宽屏上隐藏生效、hover 又唤不醒 → 永久不可见。
- **Do** 给截断文本与后果明确的操作按钮配原生 `title=` tooltip（hover 显完整 / 说明意图），用 `*Tooltip` i18n key（中英对齐）；文字自解释的按钮（Cancel/Back/已有明确动词标签）不加——见 `tooltip` 条目。

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
| `CardGridSkeleton`（instance-area） | `InstanceCard`（marker + title/subtitle + actions）；`count` 参数化（默认 6） | 工作台实例网格 |
| ~~`GroupedProjectsSkeleton`~~（已下线 2026-08-05） | 随 grid/grouped 双视图融合移除——global 总览 loading 改用 `CardGridSkeleton plain`（单列卡片骨架，与新融合视图同构）。 | — |
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
