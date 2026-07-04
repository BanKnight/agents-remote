# 工作台多视图重设计

> 状态：设计完整（2026-07-05 复盘重构，落地完整 target，无「后续」）。本文是实施基线。
> 演进自 [`workbench-redesign.md`](./workbench-redesign.md)（三栏草案）与上一版「grid/table/split 三视图互斥 + split 三态状态机」模型。
> 关联：[DESIGN.md](./DESIGN.md)（设计系统 token 唯一权威源）、[frontend-ui-architecture.md](./frontend-ui-architecture.md)。

## 1. 背景与动机

`workbench-redesign.md` 三栏模型（左项目+实例树 / 中 split 铺开 / 右 inspection）落地后，经历两轮问题：

1. **实例多了 split 拥挤**（上一版动机）：桌面 global 用 split 把所有活跃实例铺成面板，实例一多拥挤、难扫读；移动端无法承载多实例同屏。
2. **桌面/移动导航不一致**（上一版动机）：移动端进项目有二级 tab，桌面却把「项目树+实例+历史」全塞左栏，两套信息架构割裂。
3. **聚焦态挤掉导航和视图**（本轮复盘，2026-07-05）：桌面端点实例进聚焦态时，中栏顶部二级 tab 导航消失、总览视图被单实例 SplitLayout 替换——「导航和视图被挤掉」，破坏三栏结构。

复盘结论：上一版把 split 设计成「独立视图 + 面板三态状态机（expanded/缩略/最小化）+ 底部 dock」，操作复杂、状态机死角多；聚焦态与 split 耦合（`focusId` 强制走 `splitContent`），导致点实例 = 整个中栏被替换。本轮重构为**统一的中栏左右结构**模型，取消独立 split 视图与三态状态机。

## 2. 核心理念（重构）

- **中栏永远左右结构**：左侧 = 总览（实例卡片清单，固定单列宽），右侧 = 工作区（实例 output 面板，可拖放分屏）。两者常驻并存，不互斥。
- **取消独立 split 视图**：右侧工作区常驻，多实例同屏靠「拖左总览卡片到右侧分屏」实现，不再有独立的 `?view=split`。
- **视图 = 左总览的卡片样式**：grid/table/grouped 不再是互斥布局，而是同一单列内的卡片呈现样式（详细卡 / 紧凑行 / 分段）。
- **group 二态**：右侧工作区的面板（group）只有「存在/不存在」，取消 expanded/缩略/最小化三态与底部 dock。
- **聚焦 = 激活某 group**：`focusId` = 右工作区当前活动 group 的实例，驱动右栏 inspection + 左总览高亮；不再是「中栏换成单实例」。
- **桌面/移动差异化**：桌面中栏左右分屏工作区；移动中栏窄不分左右，保持「列表态 → 全屏聚焦态」线性模型。

## 3. 信息架构

```
桌面三栏（中栏内部分左右）：
┌─────────┬──────────────────────────────────────────────┬──────────┐
│ 左栏     │ 中栏                                          │ 右栏      │
│         │ ┌─[总览][历史][文件][Git][原型]── ▦≡视图切换─┐  │          │
│ 导航   │ │                                            │  │ inspection│
│         │ │ ┌──────────┬─────────────────────────┐    │  │ 常驻     │
│ [置顶]  │ │ │ 左：总览  │ 右：工作区（group 分屏）  │    │  │ 跟随活动 │
│  全局   │ │ │ 固定单列  │ flex-1                   │    │  │ group    │
│ § 项目  │ │ │ 卡片清单  │ ┌────────┬────────┐    │    │  │          │
│   A/B… │ │ │          │ │ group A│ group B│    │    │  │ [文件]   │
│ (未来§) │ │ │ 单击=激活 │ │ output │ output │    │    │  │ [Git]    │
│         │ │ │ 拖动=分屏 │ │ ▌输入   │ ▌输入   │    │    │  │ [原型]   │
│         │ │ └──────────┴ └────────┴────────┘    │    │  │          │
│         │ │            ←gutter 可拖拽调左右比例→      │    │  │          │
│         │ └────────────────────────────────────────┘  │          │
└─────────┴──────────────────────────────────────────────┴──────────┘
│←左栏→││←左总览固定宽─→│←──── 右工作区 flex-1 ────→││← 右栏 →│
```

- **左总览**：固定单列宽（~220–240px，贴合 InstanceGrid `minmax(220px,1fr)` 单列），卡片纵向堆叠。顶部 header 挂 CreateSessionBar（project only，+ 新建 agent/terminal）+ ViewSwitcher（overview only，segmented control 切 grid/table/grouped，ml-auto 右推）；两者随左总览只在 overview tab 渲染（history/inspection tab 全宽，无左总览）。tab 行只剩纯 tab，不再混排视图切换/新建按钮。
- **右工作区**：flex-1 吃满中栏剩余。group 网格分屏（详见 §7）。活动 group = `focusId`。
- **左右比例**：左总览与右工作区之间有 gutter，可拖拽调节（与左栏导航 / 右栏 inspection 的 resize 同一设计语言）。左总览默认贴合一栏卡片宽。
- **右栏**：聚焦态自动展开（跟随右工作区活动 group 的 inspection）；非聚焦态默认收起，中栏右边缘 RailButton 唤出（唤出看 project-scoped inspection，因 files/git 只依赖 projectKey 不依赖 focusId）。project scope 可唤出；global inspection 仅 prototype 占位（render null），不唤出。
- **左栏**（不变）：置顶固定（全局总览）+ section 分组（「项目」+ 未来扩展），见 [workbench-views §3 上一版] 与 `left-rail.tsx` 现状。

移动线性：header → 二级 tab → 总览卡片列表（→ 点卡片全屏聚焦态 → 底部一级 nav）。中栏不分左右。

## 4. 二级导航（5 tab）

桌面中栏顶部 / 移动 header 下一行，统一 5 个 tab。**tab 导航在中栏顶部常驻，聚焦/非聚焦都不消失**（修复旧版聚焦态挤掉 tab 导航的问题）。

| tab | 中栏呈现 | 数据源 |
|-----|---------|--------|
| 总览 | 左右结构：左总览（实例卡片）+ 右工作区（group 分屏） | useGlobalInstanceCandidates / project sessions |
| 历史 | 全宽历史 session 列表；点会话 → resume 实例 + 切 overview tab + 聚焦（history 是只读列表，不承载活动组） | 历史 session API（project-only） |
| 文件 | 全宽 FilesPanel（项目级只读 inspection） | FIRST_PARTY_PLUGINS |
| Git | 全宽 GitDiffPanel（项目级） | FIRST_PARTY_PLUGINS |
| 原型 | 全宽 prototype plugin | FIRST_PARTY_PLUGINS |

> tab 分三类：**总览** = 左右结构（左总览 + 右工作区常驻活动组）；**历史** = 全宽历史列表（点会话切 overview + 聚焦，history 只读不承载活动组）；**inspection tab**（文件/Git/原型）= 全宽 inspection，右工作区临时让位（切回总览恢复）。右栏 inspection（聚焦态跟随活动 group）与中栏 inspection tab 并存不冲突——右栏是快捷跟随，中栏 tab 是深度浏览。
>
> 用户决定（上一版）：实例和历史放一起过于拥挤，历史独立成 tab。移动端也加历史 tab。

## 5. 左总览视图样式

view switcher 切换的是**同一单列内的卡片呈现样式**（不再是列数/布局差异，因左总览固定单列宽）：

| 样式 | 呈现 | scope 可见 |
|------|------|-----------|
| grid | 详细卡片：marker + 会话名 + 状态点 + 末行 output 预览 | 全 scope |
| table | 紧凑行：marker + 会话名 + 状态点（单行，密度高，无预览） | 全 scope |
| grouped | 按项目分段（项目名 ShellSectionLabel + 单列详细卡） | 仅 global |

- project scope 无 grouped（单项目无需分段）。
- 默认：grid（详细卡片最直观）。
- 三种样式都在 ~220–240px 单列内呈现。

## 6. 视图切换器

- **形态**：segmented control，icon only。3 个 icon：`▦ 详细(grid) / ≡ 紧凑(table) / ▤ 分段(grouped)`。
- **位置**：左总览顶部 header（overview tab 时），与 CreateSessionBar 并排，ml-auto 右推。tab 行只剩纯 tab（不再混排视图切换/新建按钮）。
- **CreateSessionBar 同位置**：左总览顶部 header 左侧（project only，+ 新建 agent/terminal 下拉）；global scope 无此按钮，header 仅 ViewSwitcher 独占右侧。
- **按 scope 隐藏**：project 隐藏 grouped（只剩 grid/table）。
- **记忆**：视图选择记 URL `?view=grid|table|grouped`（可分享/书签）。
- 移动端：view switcher 在移动列表态 header 下一行右侧（保持现状，移动无左右结构）。

## 7. 中栏右侧工作区（核心）

右侧工作区承载实例 output + 输入，支持多 group 分屏。这是取代旧 split 视图 + 三态状态机 + 底部 dock 的完整设计。

### 7.1 group 模型（二态）

| 状态 | 内容 | 触发 |
|------|------|------|
| **存在** | 完整 output + 输入区（面板全功能） | 拖卡片创建 / 左总览单击激活 / 初始首个活跃实例 |
| **不存在** | group 消失，剩余 group 重新填充 | 点 group × 关闭 |

- **取消旧三态**：无 expanded/缩略/最小化，无底部 dock。group 要么全功能展示，要么不存在。
- **初始态**：进入 scope 时，右工作区打开 scope 首个活跃实例（单 group），不空着。scope 无活跃实例 → 右工作区空态提示（§14）。
- **活动 group**：同一时刻有且仅有一个活动 group（= `focusId`）。点 group 任意处 = 激活。

### 7.2 拖放分屏（5 drop zone）

拖左总览卡片到右工作区，悬停在某个 group 上时显示 5 个半透明 drop zone：

```
         ┌─────── 上 ───────┐
         │   (在该组上方     │
         │    插入新行)      │
    ┌────┼───────────────────┼────┐
    │左  │                   │ 右 │
    │(在 │     中心           │(在 │
    │该组│   (替换该组实例)    │该组│
    │左侧│                   │右侧│
    │插新│                   │插新│
    │列) │                   │列) │
    └────┼───────────────────┼────┘
         │   (在该组下方     │
         │    插入新行)      │
         └─────── 下 ───────┘
```

| drop zone | 效果 |
|-----------|------|
| 上 | 行方向分裂：在该 group 上方插入新行，放新 group |
| 下 | 行方向分裂：在该 group 下方插入新行，放新 group |
| 左 | 列方向分裂：在该 group 左侧插入新列，放新 group |
| 右 | 列方向分裂：在该 group 右侧插入新列，放新 group |
| 中心 | 替换该 group 当前实例 |
| 空白区（无 group） | 创建首个 group |

### 7.3 group 操作

```
┌──────────────┬──────────────┐
│ [A    □][×] │ [B◆   □][×] │ ← □ maximize   × close
│  output     │  output     │   ◆ = 活动 group
│  ▌输入        │  ▌输入        │
├──────────────┴──────────────┤ ← gutter 拖拽 = resize
│ [C    □][×]                │
│  output                    │
└─────────────────────────────┘
```

- **激活**：点 group 任意处 = 活动组 → `focusId` = 该实例 → 右栏 inspection 跟随 + 左总览对应卡片高亮。
- **resize**：group 间 gutter 拖拽。行内 gutter（同行相邻 group 之间）调列宽；行间 gutter（相邻行之间）调行高。复用现有 `resizePair` 扩展到网格。
- **maximize**：点 group 的 □ → 该 group 全屏（其他 group 临时收起），再点 □ 恢复。复用现有 `toggleMaximize`。
- **close**：点 group 的 × → 结束实例 session（走 `useCloseSession`：confirm → close API → 精确失效缓存）+ 移除 group + 焦点切换到剩余首个 group（若无剩余，`focusId` 清空，回非聚焦态）。实例从左总览消失（session 已结束）。

> close 语义注：旧版 split 面板 close = 结束 session（`useCloseSession`），不是「最小化到 dock」。新模型延续「close = 结束 session」语义，无 dock 回收。若用户只想暂移出工作区不结束 session，用 maximize（临时全屏）或直接切活动 group（其他 group 留在后台）。

### 7.4 布局算法

- group 组织成**行×列网格**：每行含若干 group，行内 group 等分列宽（flex），行间等分行高（flex）。
- 拖放分裂（§7.2 上/下）= 在目标行上/下插入新行；分裂（左/右）= 在目标行内目标 group 旁插入新列。
- 复用现有 `SplitLayout` 的 `deriveRows`（按 panel flex 权重分行）扩展支持拖放分裂的网格位置计算。
- group close 后，空行自动合并（行内 group 数减至 0 时该行消除，剩余行重新分配高度）。

### 7.5 持久化

- group 布局（哪些实例在哪个 group、网格位置、flex 权重、maximize 态）存 `workbench-model` 的 layout atom（`atomWithStorage` 持久化到 localStorage，scope-scoped）。
- 复用现有 `WorkbenchPanelRef` / `addPanel` / `removePanel` / `resizePair` / `toggleMaximize`，扩展网格位置字段（row/col 或 group id + 邻接关系）。
- scope 切换（global ↔ project）各自独立布局。

## 8. 状态指示：marker 右上角 badge

统一叠加在 marker（IconMarker）右上角的小圆点 badge——圆点不独占一格或一行，密度精简。

| 状态 | 颜色 |
|------|------|
| running | success（绿） |
| idle | warning（黄） |
| error | error（红） |
| closed 等 | muted（灰） |

- 形态：纯色小圆点（dot），无背景框、无文字，叠加 marker 右上角（`-right-1 -top-1`），`ring-2 ring-surface-raised` 描边与所在 surface 融合（视觉挖空）。
- 文字 label 留给 `aria-label`（a11y）/ hover tooltip。
- **跨位置统一**：左总览卡片 marker、右工作区 group header marker、移动列表卡片 marker 都用同一 `StatusMarker` primitive（relative 容器 + marker + absolute 右上角圆点）。
- 复用 `statusToTone` 映射状态→颜色；`StatusMarker` 包 `StatusDot`（加 `className` 支持 absolute 定位）。

## 9. 移动端差异

| 项 | 桌面 | 移动 |
|----|------|------|
| 中栏左右结构 | ✓（左总览 + 右工作区） | ✗（窄屏不分左右） |
| 右工作区分屏 | ✓（拖放 5 zone） | ✗（窄屏做不了分屏） |
| 点卡片行为 | 激活（右工作区切活动 group） | 全屏切聚焦态 |
| 总览视图样式 | grid/table/grouped（左总览单列） | grid/table/grouped（全宽列表） |
| 二级导航 5 tab | 中栏顶部常驻 | header 下一行横向滚动 |
| 右栏 inspection | 常驻跟随活动 group | 聚焦态 tab 切（output/文件/Git/原型） |

移动端聚焦态（点卡片全屏切）：header（◄ 返回 + 实例名）+ tab 行（output/文件/Git/原型）+ body（PanelRouter 或 inspection plugin render）。已是 output+inspection tab 模型，本轮不动。

## 10. 会话名（displayName）统一呈现

会话名是一等显示元素，所有位置清晰呈现：
- 左总览卡片标题（grid/table/grouped）
- 右工作区 group header
- 移动列表卡片标题
- 移动聚焦态 header

来源：`session.displayName`（已存在于 AgentSession/TerminalSession）。

## 11. 路由 / URL 模型

四个正交 URL 维度（对齐现有 rightTab/tab 做法）：

- `focusId`（path 段 `/global/session/$id` / `/projects/$key/session/$id`）= 右工作区**活动 group** 的实例
- `?view=grid|table|grouped` = 左总览卡片样式
- `?tab=overview|history|files|git|prototype` = 中栏二级 tab
- `?rightTab=files|git|prototype` = 右栏 inspection tab

四者正交。TanStack Router navigate 整体替换 search 对象（非 merge），故 navigate 需传完整四维（见 `WorkbenchRoute.onViewChange/onTabChange/onRightTabChange` 现有做法）。

> `focusId` 语义变化（vs 旧版）：从「中栏换成单实例 SplitLayout」变为「右工作区活动 group」。中栏左总览 + tab 导航 + view 切换 在聚焦/非聚焦都常驻——这是本轮修复「导航/视图被挤掉」的核心。

## 12. header padding（独立小改）

`MobilePageHeader` 现是 `px-2`，正文内容区 `px-3` → header 比正文窄。统一为 `px-3`（所有移动 header 一致对齐正文）。

## 13. 激活与聚焦语义

- **活动 group** = `focusId` = 右工作区当前激活的 group 实例。
- **激活路径**：
  - **左总览单击卡片** → 切右工作区活动 group 为该实例：若该实例已在工作区，激活其 group；否则替换当前活动 group 内容为该实例（不新增 group，保持单 group 除非用户拖动分屏）。
  - **右工作区点 group** → 激活该 group（= 设 `focusId`）。
- **激活驱动**：
  - 右栏 inspection 跟随活动 group（files/git/prototype）
  - 左总览对应卡片高亮（◆ 标记 + ring）
- **非聚焦态**（无 `focusId`，如刚进 scope）：右工作区显示 scope 首个活跃实例（单 group，非活动态）或空态；右栏 inspection 空态。点左总览卡片或 group 才进入聚焦态。

## 14. 空态

| 区域 | 空态条件 | 呈现 |
|------|---------|------|
| 左总览 | scope 无活跃实例 | EmptyInstanceArea（创建入口：+ Claude / + Codex / + Terminal） |
| 右工作区 | scope 无活跃实例 / 所有 group 被 close | 占位提示「从左总览选实例，或拖卡片到这里分屏」 |
| 右栏 inspection | 无活动 group | 空态提示文案 |

## 15. 实施 phase（执行分阶段，非设计后续）

> 设计完整（§1–§14 无「后续/留待」）。实现按 phase 渐进靠拢完整 target，每 phase 独立交付 + 独立验证（门禁 + CSS 落盘 + Playwright DOM）。phase 之间是「实现完整设计的哪一部分」，不是「先做简化版后续补」。

| phase | 范围 | 对应完整设计章节 |
|-------|------|----------------|
| **A 中栏左右骨架** | 中栏分左右（左总览固定单列 + 右工作区 flex-1，gutter 调比例）+ 左总览单列卡片（grid/table/grouped）+ 右工作区单 group（首个活跃实例，PanelRouter）+ 左总览单击/右工作区点 group 激活 + 右栏 inspection 跟随 + tab 导航常驻 + URL 四维模型 | §2 §3 §4 §5 §6 §11 §13 §14 |
| **B 拖放分屏** | 5 drop zone 拖放（上/下/左/右/中心/空白）+ group 网格布局算法（deriveRows 扩展）+ 多 group 同屏 + 左总览拖动送入分屏 | §7.2 §7.4 |
| **C group 操作 + 持久化** | group resize（行内/行间 gutter）+ maximize + close（useCloseSession）+ group 布局持久化（localStorage，scope-scoped） | §7.3 §7.5 |

每个 phase 自包含 context.md + plan.md + tasks.md + verify.md（或等价轻量承载，见 [workbench-multiview-plan memory]），独立交付、独立验证。

## 16. ASCII 图集

见 §3 IA 全景、§7.2 drop zone、§7.3 group 操作、§9 移动端对照。

---

**对齐记录**：
- 2026-07-04：初版 7 轮讨论锁定（grid/table/split 三视图 + split 三态状态机 + dock）。
- 2026-07-05：复盘重构。用户手测反馈「桌面聚焦态挤掉导航和视图」+「split 三态 + dock 不好操作」，改为统一中栏左右结构（左总览固定单列 + 右工作区拖放分屏），取消独立 split 视图与三态状态机。设计决策均标注「用户决定」。**设计完整，无「后续」；实现分 phase（A/B/C）渐进靠拢。**
