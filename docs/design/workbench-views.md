# 工作台多视图重设计（WIP 草案）

> 状态：设计已与用户对齐（2026-07-04，7 轮讨论），待实现。本文是实施基线，下次会话可直接接手。
> 演进自 [`workbench-redesign.md`](./workbench-redesign.md)（三栏草案）：左栏从"项目+实例树"收敛为"导航条目列表"，中栏新增二级导航 + 视图切换，split 从"默认铺开"重构为"聚焦展开+其余缩略"的特殊视图。
> 关联：[DESIGN.md](./DESIGN.md)（设计系统 token 唯一权威源）、[frontend-ui-architecture.md](./frontend-ui-architecture.md)。

## 1. 背景与动机

`workbench-redesign.md` 的三栏模型（左项目+实例树 / 中 split 铺开 / 右 inspection）落地后暴露两个问题：

1. **实例多了 split 挤**：桌面 global 用 split 把所有项目所有活跃实例铺成面板，实例一多就拥挤、难扫读；移动端更是无法承载多实例同屏。
2. **桌面/移动导航不一致**：移动端进项目后有二级 tab（总览/文件/Git/原型），桌面却把"项目树+实例+历史"全塞左栏，两套信息架构割裂。

用户手测反馈（2026-07-04）据此提出重设计：**实例展示抽象成可切换的"视图模式"**，桌面/移动统一"二级导航"理念，split 降级为其中一种特殊视图。

## 2. 核心理念

- **多视图切换**：实例区支持多种视图（分组/网格/表格/分屏），用户按场景切换，视图选择记 URL。
- **二级导航统一**：桌面和移动都在中栏承载二级导航（总览/历史/文件/Git/原型），左栏只放导航条目（不再塞实例/历史）。
- **split 是特殊视图**：不再是默认铺开，而是"多实例同屏工作台"——聚焦面板展开，其余缩略/最小化，仿 Windows 任务栏的底部 dock 收最小化面板。
- **桌面/移动能力差异化**：split 是桌面专属（移动窄屏做不了复杂分屏）；grouped 在桌面 global 与移动 global 都可切，移动 project 不分段故无 grouped。

## 3. 信息架构

```
桌面三栏：
┌─────────────┬───────────────────────────────────────────┬──────────┐
│ 左栏         │ 中栏                                       │ 右栏      │
│ 导航条目列表  │ 二级导航(5 tab) + 视图切换 + 视图内容       │ (保留)   │
│ - 全局总览   │                                            │ 聚焦态   │
│ - 项目列表   │                                            │ instance │
│ - (未来扩展) │                                            │ inspection│
└─────────────┴───────────────────────────────────────────┴──────────┘

移动线性：header → 二级导航(5 tab) → 视图切换行 → 视图内容（→ 底部一级 nav）
```

**左栏 = 导航条目列表（可扩展）**，不硬编码"项目列表"。条目建模为有序列表，每条目带类型：

| 条目类型 | 说明 | 点去向 |
|---------|------|--------|
| `global-overview` | 固定条目「全局总览」 | global scope（跨项目所有实例） |
| `project` | 动态条目，每个项目一个 | project scope |
| `(未来)` | 收藏 / 最近 / 自定义聚合… | 预留扩展位，本批不实现 |

> 关键纠正（用户）：跨项目总览也是左栏条目，未来还会加更多不同条目——左栏是"导航条目列表"，不是"项目列表+过滤"。

**右栏**：本批保留不动（聚焦态 instance inspection）。后续单独设计。

## 4. 二级导航（5 tab）

桌面中栏顶部 / 移动 header 下一行，统一 5 个 tab：

| tab | 内容 | 数据源 |
|-----|------|--------|
| 总览 | 当前作用域实例的多视图（分组/网格/表格/分屏） | useGlobalInstanceCandidates / project sessions |
| 历史 | 已关闭 session 列表（从 ProjectInstances 拆出独立 tab） | 历史 session API |
| 文件 | FilesPanel（项目级只读 inspection） | FIRST_PARTY_PLUGINS |
| Git | GitDiffPanel（项目级） | FIRST_PARTY_PLUGINS |
| 原型 | prototype plugin | FIRST_PARTY_PLUGINS |

> 用户决定：实例和历史放一起过于拥挤，历史独立成 tab。移动端也加历史 tab（现在移动总览的历史混在 ProjectInstances 里）。

## 5. 视图矩阵

|  | grouped | grid | table | split |
|--|:--:|:--:|:--:|:--:|
| 桌面 global | ✓ | ✓ | ✓ | ✓ |
| 桌面 project | — | ✓ | ✓ | ✓ |
| 移动 global | ✓ | ✓ | ✓ | — |
| 移动 project | — | ✓ | ✓ | — |

- **grouped**：跨项目按项目分组（桌面 global + 移动 global；project 只一个项目无需分组）
- **grid**：自适应列数卡片网格（见 §8）
- **table**：紧凑表格（见 §9）
- **split**：多实例同屏工作台（仅桌面，见 §7）

移动 global 的 grouped **默认视图即按项目分段**（项目名分隔），且作为可切换视图（与 grid/table 并列）；移动 project 不分段、无 grouped。

## 6. 视图切换器

- **形态**：segmented control，icon only，常驻。4 个 icon：`⊞ 分组 / ▦ 网格 / ≡ 表格 / ▣ 分屏`。
- **位置**：
  - 桌面：二级导航 tab 行**右上角**（tab 行右侧）
  - 移动：二级导航 tab 行**下一行右侧**（窄屏 tab 行右侧放不下，独立一行）
- **按 scope 隐藏不适用的视图**：project 隐藏 grouped；移动隐藏 split（移动 global 三视图 grouped/grid/table 全可切）。
- **记忆**：视图选择记 **URL search param**（可分享/书签，对齐现有 rightTab 做法）。key 暂定 `?view=grouped|grid|table|split`。
- **顺序**：靠右上角，从右到左排开（顺序细节：默认/最常用靠右；最终顺序实现时与用户确认）。

## 7. split 视图（桌面特殊工作视图）

### 7.1 面板三态状态机

```
          点缩略 header                拖出 / 展开
  缩略 ───────────────→ expanded ───────────────→ ?
  ↑                       │                      
  │ 初始态                │ 最小化               
  │ (聚焦面板)             ↓                      
  └─── dock ◀──────── 最小化                     
  (其余面板)              │                      
                         │ 点 chip 恢复          
                         ↓                       
                       缩略                       
```

| 状态 | 内容 | 触发 |
|------|------|------|
| **expanded**（聚焦） | 完整 output（面板全功能） | URL focusId 指向 / 点缩略 header |
| **缩略** | header + output 末 2 行预览 | 初始态（非聚焦面板）/ 点 expanded 的"缩略"按钮 |
| **最小化** | 收进底部 dock 的 chip | 点面板"最小化"按钮 |

**初始态**：进 split 视图，URL focusId 指向的面板 = expanded，其余面板 = 缩略。无 focusId 时第一个实例 expanded。

### 7.2 缩略面板内容（用户决定：header + output）

```
┌─[marker] provider · session名 · 状态点 ── □ 展开/最小化 · ✕ 关闭─┐
│  > output 末 2 行预览                                           │
└──────────────────────────────────────────────────────────────────┘
```

操作按钮：`□`（展开/最小化切换）、`✕`（关闭，走 useCloseSession）。

### 7.3 底部 dock（Windows 任务栏式，用户决定）

```
┌──────────────────────────────────────────────────────────┐
│ [▲ Claude demo]  [▲ Term build]  [▲ Codex refactor]      │  ← 最小化面板 chip
└──────────────────────────────────────────────────────────┘
```

- chip = marker + session 名（截断）；点击 → 恢复为缩略面板。
- dock 只在 split 视图 + 有最小化面板时出现；横跨中栏底部（桌面）/ 中栏底部一级 nav 之上（移动——但移动无 split，所以仅桌面）。
- 面板可拖动 resize（已有 resizePair）、可 maximize（已有 toggleMaximize），新增缩略/最小化两态。

### 7.4 现有能力复用

- `SplitLayout`（split-panel.tsx）的 resize/maximize 保留。
- `useCloseSession`（instance-area.tsx）的 close 流程复用（confirm → API → exact invalidate）。
- 改造点：面板状态（expanded/缩略/最小化）需进 layout atom（workbench-model 的 layout state），持久化到 localStorage；初始态逻辑从"全部铺开"改为"聚焦 expanded + 其余缩略"。

## 8. grid 视图（自适应列数）

用户决定：**CSS 自适应**（容器驱动，不用断点枚举）。

```css
grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
```

- 卡片最小宽 220px（marker + session 名 + 状态点 + close 不挤）。
- 手机中栏 ~360px → 1 列；平板 ~600px → 2 列；桌面中栏 ~600-900px → 2-3 列；总览全宽 ~900px+ → 3-4 列。
- 右栏开合导致中栏宽度跳变时，列数平滑过渡（优于断点式）。

> Tailwind v4 实现：`grid-cols-[repeat(auto-fill,minmax(220px,1fr))]`（任意值语法），或 `@theme` 注册 container query utility。实现时定。

## 9. table 视图

```
┌──────────────────────────────────────────────────────────────┐
│ 项目       │ 类型  │ 会话名      │ 状态  │ 最后活动 │  操作   │
├───────────────────────────────────────────────────────────────│
│ agents-rem │ Claude│ demo-sess   │ ●运行 │ 2m ago  │  ▶  ✕   │
│ agents-rem │ Codex │ refactor    │ ●运行 │ 5m ago  │  ▶  ✕   │
│ agents-rem │ Term  │ build       │ ○空闲 │ 1h ago  │  ▶  ✕   │
│ projB      │ Claude│ debug       │ ○关闭 │ 2d ago  │  ▶  ✕   │
└──────────────────────────────────────────────────────────────┘
```

- 列：项目（global 才显示，project 隐藏）/ 类型（marker）/ **会话名**（displayName，主列）/ 状态（小圆点 + 可选 label）/ 最后活动 / 操作（▶ 进聚焦态、✕ 关闭）。
- 桌面 + 移动都用（移动窄屏可横向滚动或隐藏部分列）。
- 行点 ▶ → 进单实例聚焦态（不进 split）。

## 10. 状态指示：统一小圆点（议题 2）

用户决定：带背景文字 badge（现 `StatusPill`）累赘，**统一成小圆点**。

| 状态 | 颜色 |
|------|------|
| running | success（绿） |
| idle | warning（黄） |
| error | error（红） |
| closed 等 | muted（灰） |

- 形态：纯色小圆点（dot），无背景框、无文字。
- 文字 label 留给 `aria-label`（a11y）/ hover tooltip。
- **跨位置统一**：InstanceCard（卡片）、左栏 list（活跃实例）、历史 session 列表、table 状态列、split 缩略 header 都用同一小圆点 primitive。
- 复用 `statusToTone`（已改 union 类型）映射状态→颜色；新增 `StatusDot` primitive（替代 `StatusPill` 的当前用法，StatusPill 可保留给别的需要文字 label 的场景或废弃）。

## 11. 移动端差异汇总

| 项 | 桌面 | 移动 |
|----|------|------|
| split 视图 | ✓ | ✗（窄屏做不了复杂分屏） |
| grouped 视图 | ✓（global 可切） | ✓（global 默认按项目分段，可切） |
| grid/table | ✓ | ✓ |
| grid 列数 | 自适应（中栏宽） | 手机 1 列、平板 2 列（自适应） |
| 视图切换器位置 | tab 行右上角 | tab 行下一行右侧 |
| 二级导航 5 tab | ✓（中栏顶部） | ✓（header 下一行，横向滚动） |
| 移动 global 分段 | — | grouped 默认按项目分段（项目名分隔），grouped/grid/table 可切 |

## 12. 会话名（displayName）统一呈现

用户强调：会话名是一等显示元素，所有视图都要清晰呈现：
- 卡片标题（grid/grouped）
- table 主列
- split 缩略面板 header
- dock chip（截断）
- 左栏 list 标题

来源：`session.displayName`（已存在于 AgentSession/TerminalSession）。

## 13. 路由 / URL 模型

视图选择记 URL search param（对齐 rightTab 现有做法）：

- `/projects/$key?view=grid`（project 总览 grid 视图）
- `/global?view=grouped`（global 总览分组视图）
- `/global/session/$id?view=split`（global 聚焦 split，split 内聚焦 id）

二级导航 tab 也记 URL（总览/历史/文件/Git/原型，暂定 `?tab=overview|history|files|git|prototype`，与 rightTab 正交）。

## 14. header padding 统一（议题 3，独立小改）

`MobilePageHeader` 现是 `px-2`，正文内容区 `px-3` → header 比正文窄。统一为 `px-3`（所有移动 header 一致对齐正文）。

> + 按钮胶囊体重设计：用户将单独提出，**不在本批**。

## 15. 待定项 / 后续

> 以下待定点源自 2026-07-04 对齐过程中未一锤定音的细节（jsonl L30923/L30934/L30939），实现各 change 前需与用户确认。

- **聚焦态 header 的 session 名位置**（L30923 #3）：用户指出我早期 ASCII 的聚焦态 header 漏画 session 名，暂定「收在侧边 dock」。注意此 dock 与 §7.3 的 split 最小化**底部** dock 是两回事——这是**聚焦态实例** session 名的位置（header 内联 vs 侧边小 dock），待最终拍板。建议：聚焦态 header 内联显示 session 名（最简单，与会话名 §12 统一呈现一致），侧边 dock 不做。
- **project 总览默认视图**（L30934 #3）：project 无 grouped 已定，但 grid/table/split 三者哪个是 project 进总览的默认未定。建议：grid（卡片最直观），split 作为用户主动切的深度工作态。
- **右栏显示时机**（L30934 #1）：用户说「先保留右栏」= 保留右栏组件不删，但「总览/历史 tab 时右栏是否显示」未明（L270 我曾提议总览 tab 时无右栏、仅聚焦态出右栏，用户未直接回应）。建议：聚焦态显示右栏（跟随聚焦实例 inspection），总览/历史 tab 时右栏隐藏（中栏全宽）；文件/Git/原型 tab 因已在中栏，右栏本批不动。
- **右栏设计**：本批保留不动，后续单独考虑（中栏已有文件/Git/原型 tab 后，右栏 instance inspection 的角色）。
- **左栏未来条目**：收藏/最近/聚合等，本批预留扩展位不实现。
- **+ 按钮胶囊体**：用户单独提需求。
- **视图切换器 icon 顺序**：靠右上角从右到左的精确顺序（grouped/grid/table/split 谁最右），实现时与用户确认。
- **split 多 expanded**：是否允许多个面板同时 expanded（拖出缩略），还是严格单 expanded（点缩略 → 原 expanded 自动缩略）。初版建议**单 expanded**（聚焦语义清晰），多 expanded 后续。
- **split 重构前的中间态**：在 change 5（split 重构）落地前，change 2-4 期间桌面「split 视图」按钮是**隐藏**（split 暂不可用，待 change 5）还是保留旧 InstanceArea 行为？建议隐藏并标「即将上线」，避免用户进入未重构的旧 split。

## 16. 实施 phase（多 change，长任务）

进 `.workflow/versions/v0.10-workbench-multi-views/`，5 个 change，依赖关系：

```
change 1 (独立) ────────────────────────────────┐
change 2 (IA 基础) ─────┬─ change 3 (grid+grouped)
                       ├─ change 4 (table)
                       └─ change 5 (split)
```

| change | 范围 | 依赖 | 关键产出 |
|--------|------|------|---------|
| `cleanup-status-dot-header-padding` | 状态小圆点（§10）+ header padding（§14） | 无 | StatusDot primitive；MobilePageHeader px-3 |
| `workbench-ia-restructure` | 左栏条目列表（§3）+ 二级导航 5 tab（§4）+ 视图切换器 primitive（§6）+ 历史 tab 拆分 + URL 模型（§13） | 无（但建议先 change 1） | 左栏新结构；中栏 tab 导航；ViewSwitcher primitive；?view/?tab search param |
| `workbench-grid-grouped-views` | grid 自适应（§8）+ grouped（§5） | change 2（+ change 1 的 StatusDot） | grid 视图；grouped 视图（桌面 global）；移动 global 默认分段 |
| `workbench-table-view` | table 视图（§9） | change 2 | table 视图（桌面+移动） |
| `workbench-split-redesign` | split 面板状态机（§7）+ 底部 dock | change 2 | 面板三态；缩略 header+output；底部 dock chip；初始态聚焦展开 |

每个 change 自包含 context.md + plan.md + tasks.md + verify.md，独立交付、独立验证（门禁 + CSS 落盘 + Playwright）。跨 change 共享设计基线放 `.workflow/versions/v0.10-workbench-multi-views/shared/`，引用本文。

## 17. ASCII 图集

（见上方 §3 IA 全景、§7.2 缩略面板、§7.3 dock、§9 table；移动端对照图见 §11。完整 ASCII 集见对齐过程的设计讨论记录，已沉淀进本文各节。）

---

**对齐记录**：2026-07-04 与用户 7 轮讨论锁定。设计决策均标注「用户决定」。后续实现严格按本文，偏离需重新与用户对齐。
