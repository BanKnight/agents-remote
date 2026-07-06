# 工作台多视图重设计

> 状态：设计完整（2026-07-06 §7 重写为 VSCode group+tab 两级模型，落地完整 target，无「后续」）。本文是实施基线。
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
│         │ ┌─[总览][历史][文件][Git]── ▦≡视图切换─┐  │          │
│ 导航   │ │                                            │  │ inspection│
│         │ │ ┌──────────┬─────────────────────────┐    │  │ 常驻     │
│ [置顶]  │ │ │ 左：总览  │ 右：工作区（group 分屏）  │    │  │ 跟随活动 │
│  全局   │ │ │ 固定单列  │ flex-1                   │    │  │ group    │
│ § 项目  │ │ │ 卡片清单  │ ┌────────┬────────┐    │    │  │          │
│   A/B… │ │ │          │ │[●A ✕][B ✕]│ [C ✕]   │    │    │  │ [文件]   │
│ (未来§) │ │ │ 单击=激活 │ │ output │ output │    │    │  │ [Git]    │
│         │ │ │ 拖动=分屏 │ │ ▌输入   │ ▌输入   │    │    │  │          │
│         │ │ └──────────┴ └────────┴────────┘    │    │  │          │
│         │ │            ←gutter 可拖拽调左右比例→      │    │  │          │
│         │ └────────────────────────────────────────┘  │          │
└─────────┴──────────────────────────────────────────────┴──────────┘
│←左栏→││←左总览固定宽─→│←──── 右工作区 flex-1 ────→││← 右栏 →│
```

- **左总览**：固定单列宽（~220–240px，贴合 InstanceGrid `minmax(220px,1fr)` 单列），卡片纵向堆叠。顶部 header 挂 CreateSessionBar（project only，+ 新建 agent/terminal）+ ViewSwitcher（overview only，segmented control 切 grid/table/grouped，ml-auto 右推）；两者随左总览只在 overview tab 渲染（history/inspection tab 全宽，无左总览）。tab 行只剩纯 tab，不再混排视图切换/新建按钮。
- **右工作区**：flex-1 吃满中栏剩余。group 网格分屏（详见 §7）。活动 group = `focusId`。
- **左右比例**：左总览与右工作区之间有 gutter，可拖拽调节（与左栏导航 / 右栏 inspection 的 resize 同一设计语言）。左总览默认贴合一栏卡片宽。
- **右栏**：聚焦态自动展开（跟随右工作区活动 group 的 inspection）；非聚焦态默认收起，中栏右边缘 RailButton 唤出（唤出看 project-scoped inspection，因 files/git 只依赖 projectKey 不依赖 focusId）。project scope 可唤出；global scope 不唤出右栏——全局 files 走中栏 tab（根目录 = `PROJECTS_ROOT` 浏览，见 §4）。
- **左栏**：置顶固定（全局总览）+ section 分组（「项目」+ 未来扩展）。「项目」section label = `ShellNavigationButton` 同款行（text-sm + 左 marker + py-1.5，与全局节点对齐），行右侧挂「+ 新建项目」按钮（点开 ProjectSetupPanel overlay），行可点击收起/展开项目列表；展开时项目项缩进表达母子从属（全局=母，项目=子），见 `left-rail.tsx`。

移动线性：项目页（二级）单行 header = ◄ 返回 + tab 横滚区 + 项目名右侧；全局总览（`/global`，一级）header 仅 tab 行（无 ◄ 返回、无标题，靠底部 tab 切换）→ 总览卡片列表（→ 点卡片全屏聚焦态 → 底部一级 nav）。中栏不分左右。聚焦态与项目列表态同款单行 header 结构（tab 在 header 内横滚，不再独立一行）。

## 4. 二级导航（4 tab）

桌面中栏顶部 / 移动单行 header 内，统一 4 个 tab。**tab 导航常驻，聚焦/非聚焦都不消失**（修复旧版聚焦态挤掉 tab 导航的问题）。

| tab | 中栏呈现 | 数据源 | scope 可见 |
|-----|---------|--------|-----------|
| 总览 | 左右结构：左总览（实例卡片）+ 右工作区（group 分屏） | useGlobalInstanceCandidates / project sessions | 全 scope |
| 历史 | 全宽历史 session 列表；点会话 → resume 实例 + 切 overview tab + 聚焦（history 是只读列表，不承载活动组） | 历史 session API（project-only） | 仅 project |
| 文件 | 全宽 FilesPanel（项目级只读 inspection） | FIRST_PARTY_PLUGINS | 全 scope（global = 根目录浏览，见下） |
| Git | 全宽 GitDiffPanel（项目级） | FIRST_PARTY_PLUGINS | 仅 project |

> tab 分三类：**总览** = 左右结构（左总览 + 右工作区常驻活动组）；**历史** = 全宽历史列表（点会话切 overview + 聚焦，history 只读不承载活动组）；**inspection tab**（文件/Git）= 全宽 inspection，右工作区临时让位（切回总览恢复）。右栏 inspection（聚焦态跟随活动 group）与中栏 inspection tab 并存不冲突——右栏是快捷跟随，中栏 tab 是深度浏览。
>
> 用户决定（上一版）：实例和历史放一起过于拥挤，历史独立成 tab。移动端也加历史 tab。

### 4.1 全局 files tab（根目录 = PROJECTS_ROOT）

global scope 的 files tab 是「跨项目根目录浏览器」，与 project scope 的项目级 files 不同：

- **根目录层（currentPath = ""）**：列 `PROJECTS_ROOT` 下所有项目目录（一级目录），**只读**——不渲染 upload/mkdir/rename/delete/save 任何写操作 UI。后端走 `GET /api/root/files`（只读端点，不递归、不 preview、不可写）。
- **进入项目子目录（currentPath 第一段 = 项目名）**：自动切换为该项目的可写 files，完全复用现有 project files API（`listProjectFiles` / `previewProjectFile` / upload / mkdir / rename / delete / save）。即「全局视角点进某项目 = 该项目 files tab」。
- **数据源切换**：FilesPanel `rootBrowse` 模式下，纯函数 `resolveRootBrowseTarget(currentPath)` 按 currentPath 第一段决定走 root 只读端点还是 project 可写 API（单一数据管道，无平行渲染分支）。
- **目录导航前缀不变式**：项目内导航须保持 currentPath 的 `"projectName/relativePath"` 前缀格式。`FileEntryList.onOpenDirectory` 传入的 `entry.path` 是项目根相对（无 projectName 前缀，`listProjectFiles` 返回 `relative(projectPath, ...)`），须**经 `joinRootBrowseDirectoryPath(target, entryPath)` 在调用点拼回前缀**后再调 `goToPath`；`PathBreadcrumb.onNavigate` 传的 segmentPath 已是完整前缀格式，直接调 `goToPath`。两个调用方语义统一为「完整 currentPath」，`goToPath` 单一逻辑直接 `setCurrentPath`——避免单一函数同时服务两种 path 语义导致某种来源被双前缀或丢前缀（根目录层 `entry.path` 即项目名，原样返回不拼）。
- **移动端**：`MobileGlobalOverview` 加 tab 行（`总览 / 文件`），结构与项目总览对齐。无 history（全局无项目历史）、无 git（根目录非 git repo）。

## 5. 左总览视图样式

view switcher 切换的是**同一单列内的卡片呈现样式**（不再是列数/布局差异，因左总览固定单列宽）：

| 样式 | 呈现 | scope 可见 |
|------|------|-----------|
| grid | 朋友圈式卡片：左 marker 头像（lg=h-9，上下置顶）+ 右 3 行（会话名 / 末行 output 预览 / 项目名·时间 + close 右推） | 全 scope |
| table | 紧凑行：marker + 会话名 + 状态点（单行，密度高，无预览） | 全 scope |
| grouped | 按项目分段（项目名 ShellSectionLabel + 单列详细卡） | 仅 global |

- project scope 无 grouped（单项目无需分段）。
- 默认：grid（详细卡片最直观）。
- 三种样式都在 ~220–240px **固定单列**内呈现——`InstanceGrid` 用 `grid-cols-1`（`gridTemplateColumns: 1fr`），**不用 `auto-fill minmax`**。理由：左总览设计为固定单列卡片清单（§4），`auto-fill` 在用户拖宽左总览（≥28rem=448px）时会自动变 2 列，卡片缩到 220px 内容拥挤，违反「父容器默认以单列宽度排布」的设计意图。`grid-cols-1` 让卡片宽度始终 = 容器宽，拖宽只让卡片变宽（内容更宽松），不增列。

## 5.1 左总览 padding 规则

左总览 `leftOverviewContent` 三分支（grid / grouped / skeleton）的卡片容器**统一 `px-3 py-2`**——grid 与 skeleton 分支由调用方包 `<div className="px-3 py-2">`（grouped 已在内部每组自带）。理由：grid 视图卡片直接贴 scroll 容器边缘（padding=0）会左右紧贴，与 grouped 视图（每组 `px-3 py-2`）+ 移动端 grid（`px-3 py-2`）不一致；统一 padding 让三视图视觉对齐，卡片有呼吸空间。

## 5.2 grid item min-width 规则

InstanceGrid 的 grid item 必须有 `min-width: 0`。grid item 默认 `min-width: auto`（= content min-content），InstanceCard 内 title/subtitle 的 min-content 会把 `1fr` 列撑开超过容器（实测 16rem 下 257px > 容器 232px，溢出 ~25px）。移动端 grid item 直接是 InstanceCard（外层 `min-w-0`，`shell-primitives.tsx` L539），天然 min-width:0；桌面 grid item 是 DragSourceCard wrapper（启用拖放），wrapper 必须显式 `min-w-0` 对齐移动端——否则 wrapper 的 `min-width:auto` 让 content 撑开列，卡片溢出。`min-w-0` 让 `1fr` 列可收缩到 < min-content，配合 InstanceCard 内部 `truncate` 截断内容而非撑开。

## 6. 视图切换器

- **形态**：segmented control，icon only。3 个 icon：`▦ 详细(grid) / ≡ 紧凑(table) / ▤ 分段(grouped)`。
- **位置**：左总览顶部 header（overview tab 时），与 CreateSessionBar 并排，ml-auto 右推。tab 行只剩纯 tab（不再混排视图切换/新建按钮）。
- **CreateSessionBar 同位置**：左总览顶部 header 左侧（project only，+ 新建 agent/terminal 下拉）；global scope 无此按钮，header 仅 ViewSwitcher 独占右侧。
- **按 scope 隐藏**：project 隐藏 grouped（只剩 grid/table）。
- **记忆**：视图选择记 URL `?view=grid|table|grouped`（可分享/书签）。
- 移动端：view switcher 在移动列表态 header 下一行右侧（保持现状，移动无左右结构）。

## 7. 中栏右侧工作区（核心）

右侧工作区承载实例 output + 输入，采用 **VSCode editor-group + tab 两级模型**：group = 分屏区域（行×列网格，group 间横/纵 gutter resize），tab = 实例（每个 group 含 1-N tab，同 group 同时只显示一个 active tab）。左总览 ↔ 工作区 = vscode explorer ↔ editor group。本节是 Phase D 取代旧「1 group = 1 实例」铺开模型（2026-07-06 重写）的完整设计。

### 7.1 两级模型：group + tab

- **group = 分屏区域**：1-N 个，行×列网格排布。group 是稳定的分屏容器，自身不是实例。
- **tab = 实例**：每个 group 含 1-N tab（每个 tab = 一个 agent/terminal session），同 group 同时只渲染 active tab 的内容；其他 tab 用 CSS `hidden` 保留（**不 unmount**，保 WebSocket/relay 长连，避免 claude2 relay 重连丢早消息 + xterm dispose/重建抖动）。
- **取消旧「group=实例 1:1」假设**：旧 §7.1「group 二态（存在/不存在）」把 group 等同于实例；新模型 group 是分屏容器，tab 才是实例。实例一多不再强制铺满屏幕——同 group 多 tab 切换，或最小化移出工作区。
- **左总览 ↔ 工作区**：点左总览卡片 = 已开则激活该 tab（不新 tab），未开则在活动 group 开新 tab（不新建 group）；拖卡片 = 开新 group 分屏（§7.3）。
- **初始态**：进入 scope 时，活动 group 打开 scope 首个活跃实例（单 tab），不空着。scope 无活跃实例 → 右工作区空态（§14）。
- **活动 group**：同一时刻有且仅有一个活动 group（`activeGroupId`，显式存布局）。点 group 任意处激活：点 tab 栏某 tab = 切该 tab 为 active 并激活该 group；点 group 其他空白处 = 仅激活该 group，不改 active tab。URL `focusId` = 活动 group 的活动 tab sessionId，用于反查与右栏 inspection 跟随。

### 7.2 tab 操作语义表（核心）

| 操作 | 触发 | 语义 | session 存活 |
|------|------|------|-------------|
| 点卡片（已开） | 左总览卡片单击 | 激活该 tab（`setActiveTab` + `activeGroupId` 指向其 group）+ URL focusId | 是 |
| 点卡片（未开） | 左总览卡片单击 | 在活动 group 开新 tab（`addTabToGroup` 队尾 + 设 active）+ URL focusId | 是 |
| 切 tab | group 内 tab 栏点另一 tab | 设该 group `activeTabId` + URL focusId | 是 |
| tab ✕（最小化） | tab 栏 ✕ | 移除该 tab（`removeTabFromGroup`）；session 存活，回左总览，可重新点开；group 最后一个 tab → group 合并消失 | 是 |
| group ▢（最大化） | group header ▢ | group 级独占（其他 group `hidden`，布局保留可还原）；独占时该 group tab 栏仍在，可切 tab | 是 |
| 关闭实例（kill） | 左总览卡片 close / tab 右键菜单 | `useCloseSession`（confirm → close API → 失效缓存）；**不放 tab ✕**（避免高频按钮触发破坏性 kill） | 否 |
| 拖卡片 → group | 左总览拖卡片到 group | center zone = 在该 group 开新 tab（不替换）；左/右 zone = 开新 group 同行；上/下 zone = 开新 group 新行 | 是 |
| 拖卡片 → 空白 | 左总览拖卡片到空白 | 创建首个 group（单 tab） | 是 |

- **最小化后左总览不加标记**：已开/未开视觉一致（类 vscode explorer：不区分 editor 是否已打开），区分靠「点已开 = 激活不新 tab」的行为。
- **kill 走低频入口**：tab ✕ 高频但非破坏性（最小化可恢复）；kill session 破坏性，走左总览卡片 close + tab 右键菜单，避免误触。
- **首期不做跨 group 拖 tab**：tab 只能最小化（移出 group），不能在 group 间拖动。`moveTab` 留接口标「后续」。

### 7.3 drop zone 新语义

拖左总览卡片到右工作区，悬停在某个 group 上时显示 5 个半透明 drop zone（几何沿用，**center 语义改**）：

```
         ┌─────── 上 ───────┐
         │ (在该 group 上方  │
         │  插入新行+新 group)│
    ┌────┼───────────────────┼────┐
    │左  │                   │ 右 │
    │(在 │     中心           │(在 │
    │该 │ (在该 group 开新 tab)│该 │
    │group│                   │group│
    │左侧│                   │右侧│
    │插新│                   │插新│
    │group│                  │group│
    └────┼───────────────────┼────┘
         │ (在该 group 下方  │
         │  插入新行+新 group)│
         └─────── 下 ───────┘
```

| drop zone | 效果 |
|-----------|------|
| 上 | 行方向分裂：在该 group 上方插入新行，放新 group（含被拖实例） |
| 下 | 行方向分裂：在该 group 下方插入新行，放新 group |
| 左 | 列方向分裂：在该 group 左侧插入新列，放新 group（同行） |
| 右 | 列方向分裂：在该 group 右侧插入新列，放新 group（同行） |
| 中心 | **在该 group 开新 tab**（非替换；tab 模型下「换实例」= 开新 tab + 最小化旧 tab 两步操作，不内置一键替换） |
| 空白区（无 group） | 创建首个 group（单 tab） |

- `deriveZone` 不变（边缘 15% + 中心，上/下优先于左/右，`DROP_ZONE_EDGE_RATIO = 0.15` 沿用）。
- 拖动期间若被拖实例已在某 group 的 tab 中，drop 到另一 group = 先从旧 group `removeTabFromGroup`（可能触发旧 group 合并）再加入目标，等价「跨 group 移动实例」（drop 路径支持；tab 栏直接拖不支持，见 §7.2）。

### 7.4 group 操作

```
┌────────────────────────────┬────────────────────────────┐
│ [● A ✕] [ B ✕] [ C ✕]  ▢  │ [● D ✕]            ▢      │ ← tab 栏 + ▢ maximize
│  A 的 output                │  D 的 output               │   ● = 活动 tab
│  ▌输入                       │  ▌输入                      │
├────────────────────────────┴────────────────────────────┤ ← 行内 gutter（横向 resize）
│ [● E ✕]                                        ▢        │
│  E 的 output                                             │
└──────────────────────────────────────────────────────────┘
   ↑ 行间 gutter（纵向 resize）
```

- **激活**：点 group 任意处 → `activeGroupId` = 该 group + URL `focusId` = 该 group active tab → 右栏 inspection 跟随 + 左总览对应卡片高亮。点 tab 栏某 tab = 切该 tab 为 active 并激活该 group。
- **resize**：group 间 gutter 拖拽。**行内 gutter**（同行相邻 group 之间）调列宽，操作 `sizes[groupId]`；**行间 gutter**（相邻行之间）调行高，操作 `rowSizes[行首 groupId]`。两者复用同一守恒钳制逻辑（`resizeGroups` / `resizeRows`）。
- **maximize（group 级）**：点 group header 的 ▢ → 该 group 独占右工作区（其他 group `hidden` 不 unmount，保 session），group 内 tab 栏仍在可切 tab；再点 ▢ 还原（`sizes` / `rowSizes` / `newRowAfter` 未动，布局完整还原）。
- **最小化 tab**：点 tab ✕ → `removeTabFromGroup`（session 存活）；若是该 group 最后一个 tab → group 消失（`removeGroup`），剩余 group 重排，`activeGroupId` 回退 `groups[0]`。
- **关闭实例（kill）**：左总览卡片 close / tab 右键菜单 → `useCloseSession`（confirm → close API → 失效缓存）+ 从所在 group `removeTabFromGroup` + 焦点切到剩余活动 tab（`activeTabRef` 兜底）。实例从左总览消失（session 已结束）。

> 三种「移出」语义区分：**最小化**（tab ✕）= 移出工作区但 session 存活，可重新点开；**最大化**（group ▢）= 临时独占，其他 group 隐藏可还原；**关闭**（卡片 close / 右键）= kill session，不可恢复。

### 7.5 布局算法

- group 组织成**行×列网格**：`groups[]` 按行优先顺序，`newRowAfter: string[]`（groupId 之后换行）标记分行；行内 group 按 `sizes[groupId]`（横向 flex）等分列宽；行间按 `rowSizes[行首 groupId]`（纵向 flex）等分行高。
- `deriveRows(layout)` 返回 `WorkbenchGroup[][]`（不再是 `WorkbenchPanelRef[][]`）；`maximized` 非空时返回 `[[maximizedGroup]]`（其他 group 由渲染层 `hidden` 保留，不 unmount）。
- 拖放分裂（§7.3 上/下）= `addGroup({ newRow: true })` 在目标行上/下插入新行；分裂（左/右）= `addGroup({ newRow: false })` 在目标 group 旁插入新列。
- group 最后 tab 被最小化/kill → `removeGroup`，该 group 从 `groups` / `sizes` / `rowSizes` / `newRowAfter` / `activeGroupId` / `maximized` 联动清理（删行首 group 时 `rowSizes` 键迁移到后续行首，`newRowAfter` 清该 groupId），剩余 group 重排。

### 7.6 持久化 schema

布局 atom 存 `WorkbenchLayout`（`atomWithStorage` 持久化到 localStorage，scope-scoped：project 按 key 分键，global 单份）：

```ts
type WorkbenchGroup = { id: string; tabs: WorkbenchPanelRef[]; activeTabId: string };
type WorkbenchLayout = {
  groups: WorkbenchGroup[];
  newRowAfter: string[];            // groupId 之后换行
  sizes: Record<string, number>;    // key=groupId，横向 flex
  rowSizes: Record<string, number>; // key=行首 groupId，纵向 flex
  activeGroupId: string | null;     // 活动编辑组
  maximized: string | null;         // groupId（group 级）
};
```

- **URL `focusId` 不变**（= sessionId，唯一反查 group+tab），布局进 localStorage、不进 URL。
- **迁移**：atom key 从 `"workbenchLayout"` 升级到 `"workbenchLayoutV2"`，旧 V1（1 group = 1 instance，`panels/newRows/sizes/maximized`）由 `migrateLegacyLayout` 无损迁移——每个旧 panel → 一个新 group（含 1 tab，`activeTabId` = 该 sessionId）+ sizes/newRowAfter/maximized 键从 sessionId 改 groupId + `activeGroupId` = 首 group。`atomWithStorage` deserialize 钩子：读 V2 失败 → 读 V1 → 迁移 → 写 V2 删 V1。
- **移动端也读同一 atom**（`mobile-workbench.tsx` `useWorkbenchLayout`），迁移后移动端用新 API（`findTabBySessionId` / `addTabToGroup`）读写，语义不变（单实例聚焦，group/tab 透明）。
- scope 切换（global ↔ project）各自独立布局。

### 7.7 移动端不变

移动端保持现有「列表态 → 全屏聚焦态」线性模型（`mobile-workbench.tsx`），不渲染多 group / tab 栏（窄屏不分屏）。group/tab 两级模型对移动端透明——移动端读写同一 layout atom（§7.6），但只关心单实例聚焦（`activeTabRef` 派生活动 tab）。

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
- **跨位置统一**：左总览卡片 marker、右工作区 group tab marker、移动列表卡片 marker 都用同一 `StatusMarker` primitive（relative 容器 + marker + absolute 右上角圆点）。
- **marker 尺寸按场景区分**：左总览卡片用 `lg`（h-9 w-9=36px，头像式独立左列）；右工作区 group tab 与 table 紧凑行用 `sm`（h-7 w-7=28px）。圆点 `-right-1 -top-1` 定位为固定 4px 偏移，不依赖 marker 尺寸，放大后无需调整。`sessionMarker` 加 `size` 参数（默认 `sm`，不破坏 GroupHeader/table 紧凑行高），card 两处调用方（`instanceToGridItem` / `candidateToGridItem`）显式传 `lg`。
- 复用 `statusToTone` 映射状态→颜色；`StatusMarker` 包 `StatusDot`（加 `className` 支持 absolute 定位）。

## 9. 移动端差异

| 项 | 桌面 | 移动 |
|----|------|------|
| 中栏左右结构 | ✓（左总览 + 右工作区） | ✗（窄屏不分左右） |
| 右工作区分屏 | ✓（拖放 5 zone） | ✗（窄屏做不了分屏） |
| 点卡片行为 | 激活（右工作区切活动 group） | 全屏切聚焦态 |
| 总览视图样式 | grid/table/grouped（左总览单列） | grid/table/grouped（全宽列表） |
| 二级导航 5 tab | 中栏顶部常驻 | header 下一行横向滚动 |
| 右栏 inspection | 常驻跟随活动 group | 聚焦态 tab 切（output/文件/Git） |

移动端聚焦态（点卡片全屏切）：**单行合并 header**（◄ 返回 + tab 横滚区 output/文件/Git + ℹ✕ 胶囊操作区），面板自带 header 在聚焦态隐藏（`embeddedHeader` prop），消除旧「返回 header / tab 行 / 面板自带 header」三块冗余。实例名与 meta 进 ℹ 底部 sheet（agent 显 model/permission/createdAt/status，terminal 仅 type/status —— UI=f(state) 不伪造）。✕ 触发 `useCloseSession`（confirm → close API → 回列表）；Retry 在内容区错误态 Notice（`connectionStatus==="error"` 时显示，与桌面 header Retry 共用 `onReconnect`）。+Terminal 在聚焦态去除（列表态 `CreateSessionBar` 已覆盖创建需求；桌面 split header 仍保留）。body 仍是 PanelRouter（output）或 inspection plugin render。

## 10. 会话名（displayName）统一呈现

会话名是一等显示元素，所有位置清晰呈现：
- 左总览卡片标题（grid/table/grouped）
- 右工作区 group tab 栏
- 移动列表卡片标题
- 移动聚焦态 ℹ 信息 sheet

来源：`session.displayName`（已存在于 AgentSession/TerminalSession）。

## 11. 路由 / URL 模型

四个正交 URL 维度（对齐现有 rightTab/tab 做法）：

- `focusId`（path 段 `/global/session/$id` / `/projects/$key/session/$id`）= 右工作区**活动 group 的活动 tab** 实例 sessionId（唯一反查 group+tab）；group/tab 布局进 localStorage、不进 URL（§7.6）
- `?view=grid|table|grouped` = 左总览卡片样式
- `?tab=overview|history|files|git` = 中栏二级 tab
- `?rightTab=files|git` = 右栏 inspection tab

四者正交。TanStack Router navigate 整体替换 search 对象（非 merge），故 navigate 需传完整四维（见 `WorkbenchRoute.onViewChange/onTabChange/onRightTabChange` 现有做法）。

> `focusId` 语义变化（vs 旧版）：从「中栏换成单实例 SplitLayout」变为「右工作区活动 group 的活动 tab」。中栏左总览 + tab 导航 + view 切换 在聚焦/非聚焦都常驻——这是修复「导航/视图被挤掉」的核心。Phase D 进一步把活动 group 升级为含多 tab 的容器（§7），focusId 仍 = sessionId，唯一反查 group+tab。

## 12. header padding（独立小改）

`MobilePageHeader` 现是 `px-2`，正文内容区 `px-3` → header 比正文窄。统一为 `px-3`（所有移动 header 一致对齐正文）。**高度也统一 `h-11`**：`MobilePageHeader`（大标题式）与 `MobileTabHeader`（tab 横滚式）两套 primitive 并存但视觉高度对齐 `h-11`，覆盖三个一级页面（项目列表 / 全局 / 设置）+ 项目总览 + 聚焦态所有移动 header。

## 13. 激活与聚焦语义

- **活动 group** = `activeGroupId`（显式存布局）= 右工作区当前激活的 group；其 **活动 tab** = 该 group 的 `activeTabId`；URL `focusId` = 活动 tab 的 sessionId（唯一反查 group+tab）。
- **激活路径**（vs code explorer 语义，§7.2）：
  - **左总览单击卡片** → `findTabBySessionId` 命中（已开）= 激活该 tab（`setActiveTab` + `activeGroupId` 指向其 group），不新 tab；未命中（未开）= 在活动 group `addTabToGroup` 开新 tab（不新建 group）。
  - **右工作区点 group tab 栏某 tab** → 切该 tab 为 active + 激活该 group；**点 group 其他空白处** → 仅激活该 group（不改 active tab）。
- **激活驱动**：
  - 右栏 inspection 跟随活动 tab（files/git）
  - 左总览对应卡片高亮（◆ 标记 + ring）
- **非聚焦态**（无 `focusId`，如刚进 scope）：右工作区在活动 group 显示 scope 首个活跃实例（单 tab，非活动态）或空态；右栏 inspection 空态。点左总览卡片或 group 才进入聚焦态。
- **focusId 反查失败兜底**：`findTabBySessionId` 返 null（该 session 已最小化，不在任何 group）：URL `focusId` 保留不动（不死循环），右栏 inspection 跟随 `activeTabRef`（活动 group 的活动 tab，非 URL focusId）——最小化是用户主动移出，inspection 跟活动 tab 更合理。

## 14. 空态

| 区域 | 空态条件 | 呈现 |
|------|---------|------|
| 左总览 | scope 无活跃实例 | EmptyInstanceArea（创建入口：+ Claude / + Codex / + Terminal） |
| 右工作区 | scope 无活跃实例 / 所有 group 被 close | 占位提示「从左总览选实例，或拖卡片到这里分屏」 |
| 右栏 inspection | 无活动 group | 空态提示文案 |

## 14.1 加载态（detail pending）

聚焦态切换实例时，`PanelRouter` 的 `useAgentDetail` / `useTerminalDetail` query 有一段 pending 窗口（通常 <100ms，cache 命中更快）。此期间**不渲染 LoadingPanel 矩形**——`AgentPanelRouter` / `TerminalPanelRouter` 在 `detail.isLoading` 时 `return null`，中栏保持 `ActiveGroupPanel` workspace 容器的 `bg-surface-raised/15` 中性背景，query resolve 后直接渲染真实 panel。理由：workspace 容器已有 `border + bg`，再叠一个 `border + bg + animate-pulse` 的 `min-h-32` 矩形 = 「矩形里的矩形」，加载结束替换时产生突兀闪现（用户反馈「中间有个矩形，过会才正常」）。pending 时间短，留空比叠矩形动画更克制。呼应 DESIGN.md「Don't detail pending 叠实心矩形 skeleton」与「页面 owns loading / 不堆平行 pending 动画」原则。

## 15. 实施 phase（执行分阶段，非设计后续）

> 设计完整（§1–§14 无「后续/留待」）。实现按 phase 渐进靠拢完整 target，每 phase 独立交付 + 独立验证（门禁 + CSS 落盘 + Playwright DOM）。phase 之间是「实现完整设计的哪一部分」，不是「先做简化版后续补」。

| phase | 范围 | 对应完整设计章节 |
|-------|------|----------------|
| **A 中栏左右骨架** | 中栏分左右（左总览固定单列 + 右工作区 flex-1，gutter 调比例）+ 左总览单列卡片（grid/table/grouped）+ 右工作区单 group（首个活跃实例，PanelRouter）+ 左总览单击/右工作区点 group 激活 + 右栏 inspection 跟随 + tab 导航常驻 + URL 四维模型 | §2 §3 §4 §5 §6 §11 §13 §14 |
| **B 拖放分屏** | 5 drop zone 拖放（上/下/左/右/中心/空白）+ group 网格布局算法（deriveRows 扩展）+ 多 group 同屏 + 左总览拖动送入分屏 | §7.3 §7.5 |
| **C group 操作 + 持久化** | group resize（行内/行间 gutter）+ maximize + close（useCloseSession）+ group 布局持久化（localStorage，scope-scoped） | §7.4 §7.6 |
| **D VSCode group+tab 两级模型** | §7 重写为 group（分屏区）+ tab（实例）两级：group 含 N tab 切换（hidden 保 session）+ tab ✕ 最小化（session 存活）+ group ▢ 最大化（group 级）+ 纵向 resize（行间 gutter）+ drop center 开 tab + 关闭实例 kill 走卡片/右键 + 持久化 atom V2 迁移 + 移动端 API 对齐 | §7.1 §7.2 §7.3 §7.4 §7.5 §7.6 §7.7 |

每个 phase 自包含 context.md + plan.md + tasks.md + verify.md（或等价轻量承载，见 [workbench-multiview-plan memory]），独立交付、独立验证。

## 16. ASCII 图集

见 §3 IA 全景、§7.3 drop zone、§7.4 group 操作、§9 移动端对照。

---

**对齐记录**：
- 2026-07-04：初版 7 轮讨论锁定（grid/table/split 三视图 + split 三态状态机 + dock）。
- 2026-07-05：复盘重构。用户手测反馈「桌面聚焦态挤掉导航和视图」+「split 三态 + dock 不好操作」，改为统一中栏左右结构（左总览固定单列 + 右工作区拖放分屏），取消独立 split 视图与三态状态机。设计决策均标注「用户决定」。
- 2026-07-06：VSCode group+tab 两级模型重构。用户反馈中栏右侧「1 group = 1 实例」铺开模型 ui/ux 奇怪，要求完全参考 vscode。§7 重写为 group（分屏区，行×列网格，横/纵 resize）+ tab（实例，同 group 多 tab 切换）两级模型：tab ✕ = 最小化（session 存活回左总览）/ group ▢ = 最大化（group 级独占，独占时可切 tab）/ 关闭实例 kill 走左总览卡片 close + tab 右键（不放 tab ✕，避免高频按钮触发破坏性 kill）；左总览 ↔ 工作区 = vscode explorer ↔ editor group（点卡片已开激活/未开活动 group 开新 tab，拖卡片开新 group 分屏）；切 tab 用 CSS hidden 保 WebSocket 长连（不 unmount）；持久化 atom key 升级 workbenchLayoutV2 + migrateLegacyLayout 无损迁移；移动端读写同一 atom 但 group/tab 模型透明。新增 Phase D（§7.1-§7.7）。**设计完整，无「后续」；实现分 phase（A/B/C/D）渐进靠拢。**
