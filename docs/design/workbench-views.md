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
- **右栏**：容器常驻（聚焦态自动展开 + RailButton 唤出 + `?rightTab` 状态机完整保留）；inspection 内容当前**留空**待扩展——files/git 已移至左栏 middle tab `[文件]`/`[git]` + 中栏点文件开的 diff tab（左栏列表点文件 → 中栏 diff）。非聚焦态默认收起，中栏右边缘 RailButton 唤出（唤出看右栏空态）。project scope 可唤出；global scope 不唤出右栏——全局 files 走中栏 tab（根目录 = `PROJECTS_ROOT` 浏览，见 §4）。
- **左栏**：置顶固定（全局总览）+ section 分组（「项目」+ 未来扩展）。「项目」section label = `ShellNavigationButton` 同款行（text-sm + 左 marker + py-1.5，与全局节点对齐），行右侧挂「+ 新建项目」按钮（点开 ProjectSetupPanel overlay），行可点击收起/展开项目列表；展开时项目项缩进表达母子从属（全局=母，项目=子），见 `left-rail.tsx`。

移动线性：项目页（二级）单行 header = ◄ 返回 + tab 横滚区 + 项目名右侧；全局总览（`/global`，一级）header 仅 tab 行（无 ◄ 返回、无标题，靠底部 tab 切换）→ 总览卡片列表（→ 点卡片全屏聚焦态 → 底部一级 nav）。中栏不分左右。聚焦态与项目列表态同款单行 header 结构（tab 在 header 内横滚，不再独立一行）。

## 4. 二级导航（4 tab）

桌面中栏顶部 / 移动单行 header 内，统一 4 个 tab。**tab 导航常驻，聚焦/非聚焦都不消失**（修复旧版聚焦态挤掉 tab 导航的问题）。

| tab | 中栏呈现 | 数据源 | scope 可见 |
|-----|---------|--------|-----------|
| 总览 | 左右结构：左总览（实例卡片）+ 右工作区（group 分屏） | useGlobalInstanceCandidates / project sessions | 全 scope |
| 历史 | 全宽历史 session 列表；列表项描述 = 时间 · 轮数 · 大小（fileSize）；点会话 → 弹命名框（预填历史标题，可选）→ resume 实例 + 切 overview tab + 聚焦（已有活跃实例的历史直接聚焦、不命名；history 是只读列表，不承载活动组） | 历史 session API（project-only） | 仅 project |
| 文件 | 全宽 FilesPanel（项目级只读 inspection） | FIRST_PARTY_PLUGINS | 全 scope（global = 根目录浏览，见下） |
| Git | 全宽 GitDiffPanel（项目级） | FIRST_PARTY_PLUGINS | 仅 project |

> tab 分三类：**总览** = 左右结构（左总览 + 右工作区常驻活动组）；**历史** = 全宽历史列表（点会话切 overview + 聚焦，history 只读不承载活动组）；**inspection tab**（文件/Git）= 全宽 inspection，右工作区临时让位（切回总览恢复）。右栏 inspection 当前留空（容器保留待扩展），files/git 经中栏 inspection tab 深度浏览（左栏 middle tab `[文件]`/`[git]` 同源列表）。
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

左总览 `leftOverviewContent` 三分支（grid / grouped / skeleton）的卡片容器**统一 `px-3 py-2`**——grid 与 skeleton 分支由调用方包 `<div className="px-3 py-2">`（grouped 已在内部每组自带）。理由：grid 视图卡片直接贴 scroll 容器边缘（padding=0）会左右紧贴，与 grouped 视图（每组 `px-3 py-2`）+ 移动端 grid（`px-3 py-2`）不一致；统一 padding 让三视图视觉对齐，卡片有呼吸空间。skeleton 分支用 `NavItemSkeleton` primitive（对齐真实 `NavItemContent` 行高 ~52px：`px-2 py-1.5` + marker `h-7`，加载完不跳到真实行高）；骨架动画范式与「对齐铁律」见 [DESIGN.md Loading 态](./DESIGN.md#loading-态)。

## 5.2 grid item min-width 规则

InstanceGrid 的 grid item 必须有 `min-width: 0`。grid item 默认 `min-width: auto`（= content min-content），InstanceCard 内 title/subtitle 的 min-content 会把 `1fr` 列撑开超过容器（实测 16rem 下 257px > 容器 232px，溢出 ~25px）。移动端 grid item 直接是 InstanceCard（外层 `min-w-0`，`shell-primitives.tsx` L539），天然 min-width:0；桌面 grid item 是 DragSourceCard wrapper（启用拖放），wrapper 必须显式 `min-w-0` 对齐移动端——否则 wrapper 的 `min-width:auto` 让 content 撑开列，卡片溢出。`min-w-0` 让 `1fr` 列可收缩到 < min-content，配合 InstanceCard 内部 `truncate` 截断内容而非撑开。

## 5.3 table 视图行契约

table 视图（`SessionTable`）行交互与列宽三条契约（与 grid 卡片「整行进聚焦 + ⋯ 改名/关闭」语义对齐，仅呈现形式从卡片改为紧凑行）：

- **行整体可点 → 开/激活 tab**：整行点击 = onFocus（打开或激活该实例 tab），与 grid 卡片单击同语义。`<tr onClick={onFocus}>` + `cursor-pointer`；操作列按钮 `stopPropagation` 防冒泡。focus 不再单列按钮承担（旧行不整体可点、▶ 按钮触发 focus 的设计废弃——行点击是更直观的主路径，▶ 按钮冗余）。
- **操作列 = ⋯ 菜单（收起改名 + 关闭）**：与 InstanceCard / GroupedProjectsList 同一 `ActionMenu` 原语（桌面 popover / 移动 action sheet 自适应），单个 ⋯ 触发器收起 rename + close，列宽从 `w-20`(两按钮并排) 收窄到 `w-14`(56px)。trigger `stopPropagation`（click + keydown 两路）防冒泡到行 onFocus；`onClose`/`onRename` 全缺省时按钮不渲染（不可关闭/改名的实例）。
- **project 列 = 进项目超链接（global 表）**：project 单元格渲染为 primary 色 `<button>`（`onEnterProject` 回调 navigate `/projects/$key`），`stopPropagation` 不触发行 onFocus；`block truncate` 截断长项目名 + `title` 全名。`onEnterProject` 缺省（project scope 表无此列）回退纯文本。project 是进项目入口、不参与窄屏收缩。
- **窄容器收缩顺序：activity 先截断→隐藏，name 最后吸收**：列宽 `name=w-full`（最后吸收列，内层 `truncate`）、`project=w-24`（链接，入口不收缩）、`activity=w-28 @max-[26rem]:w-16 @max-[22rem]:hidden`（三段式）、`actions=w-14` 固定。表格外层 `@container`，activity 列按容器宽度三段响应——宽容器(≥26rem) `w-28`(112px) 显示完整相对时间；`@max-[26rem]:w-16`(<416px) 收窄到 64px，th+td 加 `max-w-0` + 内层 `block truncate` 截断「最后活动」文字；`@max-[22rem]:hidden`(<352px) th+td 整列消失。name 是 `w-full` 唯一吸收列，activity 收窄/隐藏释放的空间全流向 name——name 在 activity 完全消失前保持稳定、最后才截断（收缩优先级 activity > name：最后活动先截断变窄再整列隐藏，而非会话名先截断；与用户预期一致）。

## 6. 视图切换器

- **形态**：segmented control，icon only。3 个 icon：`▦ 详细(grid) / ≡ 紧凑(table) / ▤ 分段(grouped)`。
- **位置**：左总览顶部 header（overview tab 时），与 CreateSessionBar 并排，ml-auto 右推。tab 行只剩纯 tab（不再混排视图切换/新建按钮）。
- **CreateSessionBar 同位置**：左总览顶部 header 左侧（project only，+ 新建 agent/terminal 下拉）；global scope 无此按钮，header 仅 ViewSwitcher 独占右侧。
- **按 scope 隐藏**：project 隐藏 grouped（只剩 grid/table）。
- **记忆**：视图选择记 URL `?view=grid|table|grouped`（可分享/书签）。
- 移动端：view switcher 在移动列表态 header 下一行右侧（保持现状，移动无左右结构）。

## 7. 中栏右侧工作区（核心）

右侧工作区承载实例 output + 输入，采用 **VSCode editor-group + tab 两级模型**：group = 分屏区域（n 叉树叶节点，横向/纵向 split 递归嵌套，leaf 间 gutter resize），tab = 实例（每个 group 含 1-N tab，同 group 同时只显示一个 active tab）。左总览 ↔ 工作区 = vscode explorer ↔ editor group。本节是 Phase D 取代旧「1 group = 1 实例」铺开模型（2026-07-06 重写）+ Phase E 规则行 → n 叉树重构（2026-07-07，对齐 VSCode 局部分屏）的完整设计。

### 7.1 两级模型：group + tab

- **group = 分屏区域**：1-N 个，n 叉树叶节点（split 递归嵌套排布，§7.5）。group 是稳定的分屏容器，自身不是实例。
- **tab = 实例**：每个 group 含 1-N tab（每个 tab = 一个 agent/terminal session），同 group 同时只渲染 active tab 的内容；其他 tab 用 CSS `hidden` 保留（**不 unmount**，保 WebSocket/relay 长连，避免 claude2 relay 重连丢早消息 + xterm dispose/重建抖动）。
- **取消旧「group=实例 1:1」假设**：旧 §7.1「group 二态（存在/不存在）」把 group 等同于实例；新模型 group 是分屏容器，tab 才是实例。实例一多不再强制铺满屏幕——同 group 多 tab 切换，或最小化移出工作区。
- **左总览 ↔ 工作区**：点左总览卡片 = 已开则激活该 tab（不新 tab），未开则在活动 group 开新 tab（不新建 group）；拖卡片 = 开新 group 分屏（§7.3）。
- **初始态**：进入 scope 时，右工作区默认空态（§14），不自动铺首个实例——用户主动点左总览卡片或拖卡片才打开（避免「最小化最后 tab → 又被自动重开」的循环）。URL 带 `focusId` 进入时，由 focus effect 兜底在活动 group 开对应 tab。scope 无活跃实例 → 右工作区空态（§14）。
- **活动 group**：同一时刻有且仅有一个活动 group（`activeGroupId`，显式存布局）。点 group 任意处激活：点 tab 栏某 tab = 切该 tab 为 active 并激活该 group；点 group 其他空白处 = 仅激活该 group，不改 active tab。URL `focusId` = 活动 group 的活动 tab sessionId，用于反查与右栏 inspection 跟随。

### 7.1.1 中栏 tab 的 4 种 kind（WorkbenchPanelRef）

中栏 tab 不止 session 一种——`WorkbenchPanelRef` 是 4 种 kind 的联合，统一走 group+tab 两级模型 + focus URL + PanelRouter 分发，差异只在标识/URL/内容/生命周期：

| kind | 标识字段 | tabId | focus URL | 内容（PanelRouter 分发） | 生命周期 |
|------|----------|-------|-----------|--------------------------|----------|
| session | agent/terminal 实例 | `sessionId` | `/projects/$key/session/$id` 等 | output + 输入（按 sessionType 分发 AgentTerminalPanel/TerminalPanel/ChatPanel） | 有（kill 后 stale-prune，§7.4） |
| file | 文件全路径 | `file_${全路径}` | `/files/file/$`（全局）/`/projects/$key/file/$`（项目） | `FileTabPreview` 可编辑预览（source/render toggle + save） | 无（刷新保留，prune 跳过） |
| git | git diff 文件 | `git_${scope}/${path}` | `/projects/$key/git/$` + `?gitScope` | `GitFileDiffPanel` 只读 unified diff | 无 |
| skill | skill 名 | `skill_${name}` | `/skills/skill/$` | `SkillTabPreview` 只读 SKILL.md 预览 | 无 |

- **session tab 是主语义**（实例 output）；file/git/skill tab 是辅助浏览——无 session 生命周期，kill 不 prune、刷新保留（prune effect 对 `t.kind === file/git/skill` 跳过，§7.4）。
- **skill tab**（第 4 种，2026-07-18 新增）：技能市场 Manage tab 点已装 skill 行 → 中栏开 skill tab，完整对标 file tab 模式（focus effect 开/激活 tab + `/skills/skill/$` focus URL + PanelRouter 分发 + 移动 MobileSkillFocus）。`SkillPanelRef = {kind:"skill"; name}`，agent 维度不进 tabId（当前单 agent claude-code，`DEFAULT_SKILL_AGENT`，YAGNI）；`SkillTabPreview` 只读渲染本地 SKILL.md（`useSkillPreview` + `MarkdownString`，无编辑无保存，区别于 FileTabPreview 可编辑）。**不带 h4 标题栏**——SKILL.md 正文自带 `# H1` 标题，再加 h4 会重复（区别于 FilePreviewPanel 保留 h4：文件正文不带 `# 标题` 不重复）；section 直接从 loading/error/markdown 内容开始。移动端 `MobileSkillFocus` 浮窗式 focus 全屏主体（非 Radix Dialog），header 走 `MobileTabHeader` + **胶囊款 ✕ 操作区**（`inline-flex rounded-lg border border-neutral-line/60 bg-surface-inset/60 p-0.5` 容器 + `h-7 w-7` button，与 `MobileFocusHeader` session 聚焦态 / `FilePreviewPanel` 项目文件详情同款，§7 单行 header ℹ✕ 胶囊契约）；`MobileFileFocus` 同步对齐胶囊款（修全局文件浮窗 ✕ 曾用裸 `h-9 w-9` 与项目文件详情不一致）。leftMode 继承 `?leftMode`（从 /skills 进来=skills 保技能管理左栏，中栏 tab 切换不改左栏，VSCode 式，同 /files/file/$）。

### 7.2 tab 操作语义表（核心）

| 操作 | 触发 | 语义 | session 存活 |
|------|------|------|-------------|
| 点卡片（已开） | 左总览卡片单击 | 激活该 tab（`setActiveTab` + `activeGroupId` 指向其 group）+ URL focusId | 是 |
| 点卡片（未开） | 左总览卡片单击 | 在活动 group 开新 tab（`addTabToGroup` 队尾 + 设 active）+ URL focusId | 是 |
| 切 tab | group 内 tab 栏点另一 tab | 设该 group `activeTabId` + URL focusId | 是 |
| tab ✕（最小化） | tab 栏 ✕ | 移除该 tab（`removeTabFromGroup`）；session 存活，回左总览，可重新点开；group 最后一个 tab → group 合并消失 | 是 |
| group ▢（最大化） | group header ▢ | group 级独占（其他 group `hidden`，布局保留可还原）；独占时该 group tab 栏仍在，可切 tab | 是 |
| 关闭实例（kill） | 左总览卡片 close / tab 右键菜单 | `useCloseSession`（confirm → close API → 失效缓存）；**不放 tab ✕**（避免高频按钮触发破坏性 kill） | 否 |
| 拖卡片 → group | 左总览拖卡片到 group | center zone = 在该 group 开新 tab（不替换）；左/右/上/下 zone = **单 group 局部分屏**（开新 group 与目标分裂，不横跨整行，§7.3） | 是 |
| 拖卡片 → 空白 | 左总览拖卡片到空白 | 创建首个 group（单 tab） | 是 |
| 拖 tab → 另一 group | tab 栏拖 tab 到另一 group | center zone = 加入目标 group tab 栏（`dropIntoGroup` 跨组迁移，原组空则合并消失）+ URL focusId | 是 |

- **最小化后左总览不加标记**：已开/未开视觉一致（类 vscode explorer：不区分 editor 是否已打开），区分靠「点已开 = 激活不新 tab」的行为。
- **tab 右键菜单**（最小化 + 关闭实例）：右键 tab 栏 tab 弹出轻量菜单——「最小化」= 同 tab ✕（`removeTabFromGroup`，session 存活）；「关闭实例」= `useCloseSession`（自带 confirm → close API → 失效缓存）。kill 走此低频入口 + 左总览卡片 close，避免高频 tab ✕ 误触破坏性 kill。菜单视觉走 DESIGN.md `action-menu` 桌面 popover 变体（移动端不可达，刻意保留为桌面快捷）。
- **tab 可跨 group 拖动**：tab 栏的 tab 可拖到另一 group（复用 §7.3 drop zone 的 center 语义 = `dropIntoGroup` 跨组迁移，原 group 空则合并消失）。tab ✕ 仍是最小化（移出工作区回左总览，session 存活）。单击 tab = 切换 active（拖动与单击靠 4px 阈值区分，复用 `DragSourceCard`）。
- **拖 tab → 自身所在 group 边缘**：单 tab 单 group = no-op（分屏成单 tab 两半无意义）；多 tab 单 group = 把被拖 tab 拆出来与原 group 分屏（原 group 保留其余 tab，等价「同 group 内拆出某 tab 独立成新 group」）。仅 edge zone（上/下/左/右）适用；center zone 到自身 group = 激活该 tab（见上「切 tab」）。
- **拖动源泛化（文件/git/skill 行，2026-07-19）**：除左总览 session 卡片外，左栏文件树文件行（middle tab [文件] / 全局 `/files` rootBrowse）、git 变更列表行（middle tab [git]）、skill ManageTab 已装行也支持拖动到中栏——开对应 file/git/skill tab（§7.1.1 四 kind）。复用同一 `useDragSource` pointer sequence（从 `DragSourceCard` 抽出，§7.2 单击/拖动 4px 阈值区分）：单击 = `onSelect`（与原 `ListRow` `onClick` 同行为：开 tab / 预览），拖动 = `onDragStart` 走 `dropIntoLeaf`（center 加 tab / edge 分屏），drop 后 navigate 到对应 focus URL（与 `onSelectTab` 同源分发 `navigateToFile`/`navigateToGitFile`/`navigateToSkill`）。dragRef 构造与各 `onOpen*` 一致（file=全路径 / git=project+scope+path / skill=name）。目录节点、rootBrowse 根目录层项目目录不可拖（无对应 tab，行退回纯 `ListRow`）。中栏 inspection 的 `FilesPanel`/`GitDiffPanel`（预览态 enablePreview=true）非拖动源。

### 7.3 drop zone 新语义

拖左总览卡片到右工作区，悬停在某个 group 上时显示 5 个半透明 drop zone（几何沿用）。**上/下/左/右 都是单 group 局部分屏**（对齐 VSCode：只分裂目标 group，不横跨整行）；center 在该 group 开新 tab。

```
         ┌─────── 上 ───────┐
         │ (该 group 上方   │
         │  纵向分屏)        │
    ┌────┼───────────────────┼────┐
    │左  │                   │ 右 │
    │(该 │     中心           │(该 │
    │group│ (在该 group 开新 tab)│group│
    │左侧│                   │右侧│
    │横向│                   │横向│
    │分屏│                   │分屏│
    └────┼───────────────────┼────┘
         │ (该 group 下方   │
         │  纵向分屏)        │
         └─────── 下 ───────┘
```

| drop zone | 效果 |
|-----------|------|
| 上 | **单 group 局部分屏**：该 group 上方纵向分裂，新 group 占上半、原 group 占下半（不横跨整行） |
| 下 | 单 group 局部分屏：该 group 下方纵向分裂，原 group 占上半、新 group 占下半 |
| 左 | 单 group 局部分屏：该 group 左侧横向分裂，新 group 占左半、原 group 占右半 |
| 右 | 单 group 局部分屏：该 group 右侧横向分裂，原 group 占左半、新 group 占右半 |
| 中心 | **在该 group 开新 tab**（非替换；tab 模型下「换实例」= 开新 tab + 最小化旧 tab 两步操作，不内置一键替换） |
| 空白区（无 group） | 创建首个 group（单 tab） |

- `deriveZone` 不变（边缘 15% + 中心，上/下优先于左/右，`DROP_ZONE_EDGE_RATIO = 0.15` 沿用）。虚线框（`DropZoneHighlight`）按单 group rect 画半区，与局部分屏语义一致。
- **取消整行横跨**：旧 V2 规则行模型下，上/下 会找目标所在整行的行首/行尾操作，产生横跨整行的新 group（与虚线框「该 group 内部」示意不符，属 bug）。V3 树模型（§7.5）下永远只分裂目标 group，与 VSCode 一致。
- 拖动期间若被拖实例已在某 group 的 tab 中（无论拖源是左总览卡片还是 tab 栏 tab），drop 到另一 group = 先从旧 group 移除（可能触发旧 group 子树提升/合并）再加入目标，等价「跨 group 移动实例」。tab 栏 tab 拖动复用同一 drop zone（见 §7.2「拖 tab → 另一 group」）。

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
- **resize**：gutter 拖拽调「某 SplitNode 内相邻两个 children」的 `sizes` 占比。**横向 split 的 gutter**（col-resize）调横向占比；**纵向 split 的 gutter**（row-resize）调纵向占比。守恒钳制逻辑统一（`resizeSplitChildren`，复用 `WORKBENCH_PANEL_MIN_FLEX`）。
- **maximize（group 级）**：点 group header 的 ▢ → 该 leaf 独占右工作区（其他 leaf `hidden` 不 unmount，保 session），group 内 tab 栏仍在可切 tab；再点 ▢ 还原（树结构未动，布局完整还原）。
- **最小化 tab**：点 tab ✕ → `removeTabFromLeaf`（session 存活）；若是该 group 最后一个 tab → group 消失（`removeLeaf`，含子树提升/同方向合并），`activeGroupId` 回退前序首个 leaf。
- **关闭实例（kill）**：左总览卡片 close / tab 右键菜单 → `useCloseSession`（confirm → close API → 失效缓存）。实例从左总览消失（session 已结束）。
- **stale-tab prune**（kill 后清理孤儿 tab）：kill session 后该 session 的 tab 不会自动从 layout 消失（V3 localStorage 持久化，刷新也不清）。InstanceArea 监听活跃实例集（refs/candidates）变化，遍历树所有 leaf 的 tab（**跳过 file/git/skill tab**——它们无 sessionId、无 session 生命周期，见 §7.1.1），sessionId 不在活跃集 → `removeTabFromLeaf` 清理（可能触发 `removeLeaf` 子树提升/合并）；`focusId` 指向被清 tab 时回退到剩余活动 tab（`activeTabRefLeaf` 兜底）或清空回非聚焦态。**prune gate 在 `isLoaded`**：活跃实例集来自异步 query（`useScopeInstanceOrder` 暴露 `isLoaded`），prune effect 在 query 未 settle（`isLoaded=false`）前直接跳过——否则刷新后 refs 还空（上下文不足）会把全部持久化 tab 误判 stale 清光、把空布局写回 localStorage，持久化恢复失效。

> 三种「移出」语义区分：**最小化**（tab ✕）= 移出工作区但 session 存活，可重新点开；**最大化**（group ▢）= 临时独占，其他 group 隐藏可还原；**关闭**（卡片 close / 右键）= kill session，不可恢复。

### 7.5 布局算法（n 叉树 + 方向，对齐 VSCode）

group 组织成 **n 叉树**：`root` 是 `TreeNode`（leaf 或 split）；`SplitNode` 带 `direction`（horizontal=左右排 flex-row / vertical=上下排 flex-col）+ `children[]` + `sizes`（key=child.id，控该 split 内 children 占比）。与 VSCode grid 同构。

```ts
type LeafNode = WorkbenchGroup & { kind: "leaf" };  // = group（id/tabs/activeTabId）
type SplitNode = { kind: "split"; id: string; direction: "horizontal" | "vertical";
                   children: TreeNode[]; sizes: Record<string, number> }; // key=child.id
type TreeNode = LeafNode | SplitNode;
type WorkbenchLayoutV3 = { root: TreeNode | null; activeGroupId: string | null; maximized: string | null };
```

- **同方向不嵌套**：对某 leaf drop right 时，若其父已是 horizontal split → 在父 children 里追加（不新建 split）；不同方向才嵌套（drop down 到横向 split 里的 leaf → 该 leaf 被 vertical split 包裹）。3 列横排 = 单个 horizontal split（children.length=3），不深嵌套。
- **局部分屏**（§7.3 上/下/左/右）：永远只分裂目标 leaf——在其父 split 同方向时追加兄弟，否则用新 split（方向由 zone 决定：左/右=horizontal，上/下=vertical）替换该 leaf 位置。**不存在「整行横跨」**（每个 leaf 尺寸由其祖先 split 链独立决定）。
- **resize**：gutter 操作「某 SplitNode 内相邻两个 children」的 `sizes` 占比（守恒钳制，复用 `WORKBENCH_PANEL_MIN_FLEX`）。横向 split 的 gutter = col-resize，纵向 split 的 gutter = row-resize。
- **removeLeaf**（tab 最小化空 group / kill prune）：从父 split 删该 leaf → 若父 children 剩 1 → 子树提升（用 sole 替换父 split）；若 sole 是 split 且与新的祖父同方向 → 合并 children（sizes 按比例缩放）。`activeGroupId`/`maximized` 指向被删 leaf → 回退前序首个 leaf / null。
- **maximized**：渲染层短路——`maximized` 非空时只渲染该 leaf（其他 leaf 由渲染层 `hidden` 保留，不 unmount，保 WebSocket/relay 长连）；drop 到 max leaf 边缘会同时 clear maximized（分屏后不应仍独占旧 group）。
- **不变式**（`validateLayoutV3` 断言）：`SplitNode.children.length >= 2`、`LeafNode.tabs.length >= 1`、同方向不嵌套、`activeGroupId`/`maximized` 必在树中某 leaf 或 null、每个 SplitNode.sizes 的 key 集合 == children id 集合。

### 7.6 持久化 schema

布局 atom 存 `WorkbenchLayoutV3`（`atomWithStorage` 持久化到 localStorage，scope-scoped：project 按 key 分键，global 单份）：

```ts
type WorkbenchLayoutV3 = {
  root: TreeNode | null;         // n 叉树（§7.5），null = 空工作区
  activeGroupId: string | null;  // 活动 leaf id
  maximized: string | null;      // leaf id（group 级）
};
```

- **URL `focusId` 不变**（= sessionId，唯一反查 leaf+tab），布局进 localStorage、不进 URL。
- **迁移**（atom key `"workbenchLayoutV3"`，storage 三分支 `getItem`）：
  1. 有 V3 → 直返；
  2. 有 V2 无 V3 → `migrateV2ToV3`（复用 `deriveGroupRows` 把每行串 horizontal split、行间串 vertical split，sizes/rowSizes 映射到对应 SplitNode.sizes）→ 写 V3 删 V2；
  3. 有 V1 无 V2/V3 → `migrateLegacyLayout`(V1→V2) → `migrateV2ToV3`(V2→V3) → 写 V3 删 V1+V2。

  V2 group id = V3 leaf id（crypto.randomUUID），`activeGroupId`/`maximized` 直接映射。`migrateLegacyLayout`（V1→V2）+ `deriveGroupRows` 保留作迁移 building block。
- **移动端也读同一 atom**（`mobile-workbench.tsx` `useWorkbenchLayout`），用树遍历 API（`findTabRefLeaf` / `ensureTabOpenLeaf`）读写，语义不变（单实例聚焦，group/tab 透明）。
- scope 切换（global ↔ project）各自独立布局。
- **跨窗口同步已禁用**：所有布局 atom（栏宽 / 折叠 / tab / view 偏好 + WorkbenchLayoutV3）持久化到 localStorage（刷新保持），但**不跨窗口/tab 实时同步**。`atomWithStorage` 默认经 `storage.subscribe` 监听 `window` storage 事件实现多窗口同步；个人布局无需跨窗口一致（多窗口独立布局更符合预期，且避免多窗口测试时互相干扰），故这些 atom 走无 `subscribe` 的 storage（`atomWithLocalOnlyStorage`，见 `workbench-model.ts`）——仍读写 localStorage，但不监听跨窗口广播。WorkbenchLayoutV3 的自定义迁移 storage（本节迁移链）本就无 `subscribe`，行为一致。

### 7.7 移动端不变

移动端保持现有「列表态 → 全屏聚焦态」线性模型（`mobile-workbench.tsx`），不渲染多 group / tab 栏（窄屏不分屏）。group/tab 两级模型对移动端透明——移动端读写同一 layout atom（§7.6），但只关心单实例聚焦（`activeTabRef` 派生活动 tab）。

**移动端 focus 态 header tab（Output/Files/Git）记忆语义**（`workbenchMobileFocusTabAtom`，`atomWithLocalOnlyStorage` 持久）：focus 内 ‹› 切实例时 tab 保持（维度正交，方便横向对比同维度）；但从总览（`MobileGlobalOverview` / `MobileProjectOverview`）点实例卡片**新进** focus 时，`focusInstance` 重置 tab 到 Output——避免上次切到的 Files/Git 记忆被继承、直接落到项目文件，造成「点实例卡片却进了项目文件」的误会（用户预期：点实例卡片 → 到达该实例的输出）。

### 7.8 渲染层：树投影为扁平数组（UI = f(state)）

§7.5 的 n 叉树是 **state**（布局真相，唯一权威），**不是渲染结构**。表现层不递归渲染这棵树，而是用纯函数 `flattenLayout(root)` 把它投影成三个并列扁平数组，再各自 `.map` 渲染。目的：让所有「会跨容器移动的对象」（group / tab）在 React 树里拥有**位置不随布局变化而变化的稳定身份**，由 React 按相同 key 复用，DOM 不重建 —— terminal 不重连、xterm 不 dispose、relay 不重放。

#### 三个并列扁平数组

```ts
function flattenLayout(root: TreeNode | null, maximized: string | null): {
  groups:  Array<{ id, tabs, activeTabId, rect, contentRect }>;  // group 壳（边框 + tab 栏 + data-drop-group）
  gutters: Array<{ id, rect, orientation, splitId, leftChildId, rightChildId }>;
  panels:  Array<{ sessionId, projectName, rect, visible, groupId }>;  // rect = 所属 group 的 contentRect
};
```

表现层三个并列 `.map`，**无嵌套**：

```jsx
<div className="relative h-full w-full">
  {groups.map(g => <GroupShell key={g.id} {...g} />)}        // 不含 PanelRouter
  {gutters.map(g => <SplitGutter key={g.id} {...g} />)}
  {panels.map(p => (
    <div key={p.sessionId} className={p.visible ? "absolute inset-0 ..." : "hidden"} style={p.rect}>
      <PanelRouter panelRef={p} />
    </div>
  ))}
</div>
```

`GroupShell` = 现 `GroupCell` 去掉 PanelRouter 那段（边框 + GroupHeader tab 栏 + `data-drop-group` + DropZoneHighlight），仅作 group 的视觉容器与拖放落点；PanelRouter 由扁平层直接渲染，absolute 定位到所属 group 的 `contentRect`。

#### 为什么三个场景都不重建

React 实例身份 = 父 + key。**嵌在递归布局树里的组件，其「父」随树结构变化而变化**，导致身份失稳：

| 场景 | 旧（递归渲染）根因 | 新（扁平数组） |
|------|--------------------|----------------|
| group 内加 tab | group 位置不变，`tabs.map` key=sessionId 已复用 → 本就不重建 | `panels` 数组里已有 session 的 key 不变 → 复用 |
| split（leaf → split） | GroupCell 从「div 直接子」变「被 TreeNodeRender 包裹的深层子」，类型身份被顶替 → unmount | `groups` 数组里该 leaf 的 `key=leaf.id` 不变，rect 变 → React 复用 GroupShell，只更新 style |
| 合入塌缩（split → leaf） | group1 从「split 的子」变「根直接子」，树位置变浅 → GroupCell 身份失稳 → unmount | 同上，`key=leaf.id` 在数组里不变 |
| tab 跨 group 移动 | PanelRouter 跨父（group1 的 children → group2 的 children），React 跨父不复用 → unmount + mount | `panels` 数组里该 session 的 `key=sessionId` 不变，变的只是 `groupId / rect / visible` → React 复用，只更新 style |

**铁律**：任何在布局变化中「会跨容器移动」的对象，都不能嵌在随布局变化的递归结构里，必须提到扁平层用稳定 key。group 提到 `groups`、tab 提到 `panels`，两层对称，无特例。

#### rect 计算（派生函数的唯一复杂点）

`flattenLayout` 递归树，按 SplitNode 的 `direction` + `sizes` 分配每个 leaf 的 rect（百分比坐标）：

- 横向 split：children 按宽度比占父 rect 的横向份额，纵向填满。
- 纵向 split：children 按高度比占父 rect 的纵向份额，横向填满。
- gutter rect = 相邻两个 children 之间的间距条（用 `DROP_ZONE_GUTTER_PX` 或现有 gap 值）。
- `contentRect` = group rect 去掉 tab 栏高度后的内容区（PanelRouter 的落点）。
- `maximized` 非空时只投影该 leaf（其他 leaf 仍进 `groups`/`panels` 数组以保实例不卸载，但 `rect` 不参与布局；`visible` = `sessionId === activeTabId` 仅对 max leaf 为真，其他全 false → `hidden`，复用 §7.4 已有不变式「其他 leaf hidden 不 unmount」）。

absolute + 百分比定位（leaf 与 gutter 同一套坐标），不用 CSS grid（嵌套坐标的 rowSpan/colSpan + 跨层 fr 归一化更绕）。gutter 拖拽继续改 `sizes`（state）→ `flattenLayout` 重算 rect → gutter 跟着定位，`onResizeSplit` 复用。

#### 与既有不变式的关系

- **§7.4「其他 leaf hidden 不 unmount」继续成立**：扁平化后非 max leaf 的 PanelRouter 仍 `hidden`（`visible=false`），不卸载；xterm 的 `offsetParent === null` 防御（commit `81418c6`）与 `customFit` 行为不变，只是 hidden 容器从「GroupCell 内的 per-tab div」换成「扁平层的 per-panel div」，语义一样。
- **§7.5 树模型 + 不变式（`validateLayoutV3`）不变**：state 层零改动，`dropIntoLeaf` / `resizeSplitChildren` / `removeLeaf` 等纯函数全部不动。
- **移动端（§7.7）零改动**：移动端不渲染多 group，不走 `flattenLayout`。

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
- **marker 尺寸按场景区分**：左总览卡片用 `lg`（h-9 w-9=36px，头像式独立左列）；table 紧凑行用 `sm`（h-7 w-7=28px，带 IconMarker 方框 + tone 背景）；**右工作区 group tab 用 `xs`（h-4 w-4=16px 裸 icon，无 IconMarker 方框，tone 用文字色）—— 与 tab label 14px 同高比例 1:1**（Phase 6 批 6b：旧 tab 用 sm=28px 与 14px label 比例 2:1 视觉失调，marker 比标题大；缩为 xs 裸 icon 后视觉平衡，且 tab 收敛到 nav-item 设计语言）。圆点 `-right-1 -top-1` 定位为固定 4px 偏移，不依赖 marker 尺寸，放大后无需调整。`sessionMarker` 加 `size` 参数（`"xs" | "sm" | "lg"`，默认 `sm`，不破坏 GroupHeader/table 紧凑行高），card 两处调用方（`instanceToGridItem` / `candidateToGridItem`）显式传 `lg`，`usePanelMeta`（服务 TabChip + 拖动 ghost）传 `xs`。
- 复用 `statusToTone` 映射状态→颜色；`StatusMarker` 包 `StatusDot`（加 `className` 支持 absolute 定位）。

## 9. 移动端差异

| 项 | 桌面 | 移动 |
|----|------|------|
| 中栏左右结构 | ✓（左总览 + 右工作区） | ✗（窄屏不分左右） |
| 右工作区分屏 | ✓（拖放 5 zone） | ✗（窄屏做不了分屏） |
| 点卡片行为 | 激活（右工作区切活动 group） | 全屏切聚焦态 |
| 总览视图样式 | grid/table/grouped（左总览单列） | grid/table/grouped（全宽列表） |
| 二级导航 5 tab | 中栏顶部常驻 | header 下一行横向滚动 |
| 右栏 inspection | 容器留空（待扩展） | 聚焦态 tab 切（output/文件/Git） |

移动端聚焦态（点卡片全屏切）：**单行合并 header**（◄ 返回 + tab 横滚区 output/文件/Git + ℹ✕ 胶囊操作区），面板自带 header 在聚焦态隐藏（`embeddedHeader` prop），消除旧「返回 header / tab 行 / 面板自带 header」三块冗余。实例名与 meta 进 ℹ 底部 sheet（agent 显 model/permission/createdAt/status，terminal 仅 type/status —— UI=f(state) 不伪造）。✕ 触发 `useCloseSession`（confirm → close API → 回列表）；Retry 在内容区错误态 Notice（`connectionStatus==="error"` 时显示，与桌面 header Retry 共用 `onReconnect`）。+Terminal 在聚焦态去除（列表态 `CreateSessionBar` 已覆盖创建需求）。body 仍是 PanelRouter（output）或 inspection plugin render。

**桌面右工作区对齐移动端**（Phase 6 批 6a）：右工作区 `WorkspaceTree` 的 `PanelRouter` 也传 `embeddedHeader`，面板自带 `SessionDetailHeader`/`ChatHeader` 整个不渲染。操作去向与移动端聚焦态一致：Files/Git 走中栏顶部二级 tab（已覆盖，无重复入口）；+Terminal 走左总览 `CreateSessionBar`（已覆盖）；Retry 走内容区错误态 Notice（`embeddedHeader && connectionStatus==="error"` 分支，现有实现）；Close 由 tab ✕ + 左总览卡片 close 承担（embedded 已 `showClose=false`）。实例名由 group tab 栏 chip 显示（marker + displayName），projectName 由中栏顶部 tab 行所在的 project 作用域显式（聚焦态右工作区不重复显示）。`GroupHeader`（tab 栏 + ▢ maximize）仍在，与移动端 `MobileFocusHeader` 同为 group/scope 级 header，不属于面板自带 header。

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
- `?rightTab=files|git` = 右栏 inspection tab（状态机保留；右栏当前留空待扩展，恢复 inspection 时复用）

四者正交。TanStack Router navigate 整体替换 search 对象（非 merge），故 navigate 需传完整四维（见 `WorkbenchRoute.onViewChange/onTabChange/onRightTabChange` 现有做法）。

> `focusId` 语义变化（vs 旧版）：从「中栏换成单实例 SplitLayout」变为「右工作区活动 group 的活动 tab」。中栏左总览 + tab 导航 + view 切换 在聚焦/非聚焦都常驻——这是修复「导航/视图被挤掉」的核心。Phase D 进一步把活动 group 升级为含多 tab 的容器（§7），focusId 仍 = sessionId，唯一反查 group+tab。

**入口路由 `/`（viewport 分流，非 redirect）**：`/` 是应用入口，由 `IndexRoute` + `useIsDesktopViewport` 在组件层分流——桌面（≥lg）渲染 **global scope 工作台**（IDE 化常驻，对齐 §1「桌面抛弃 Home→Project→detail 换页模型，进入即常驻三栏」），移动（<lg）渲染**项目列表**（`HomeRoute`，对应移动端底部 nav「项目」一级入口）。`useIsDesktopViewport` 客户端首 render 即真实 viewport（CSR 无 hydrate mismatch），移动端不会先闪工作台再切列表。`/global` 路由保留：移动端底部 nav「全局」一级入口 + 旧 URL 兼容；桌面端 `/global` 与 `/` 等价渲染（桌面底部 nav `lg:hidden`，桌面用户不手访 `/global`，冗余无害）。桌面 `/` 取 global scope 而非「最近 project」——左栏项目 section（§52）已提供项目切换入口，避免引入「记忆最近 projectKey」的隐式状态。

**两端同一个 workbench（移动 3 tab = 桌面左栏 3 部分）**：移动端底部 nav 三 tab（项目 / 全局 / 设置）并非独立产品，而是桌面三栏**左栏**三部分在窄屏的 tab 化拆分——「项目」= 左栏项目 section（§52），「全局」= 左栏全局节点，「设置」= 左栏设置入口。窄屏把左栏垂直堆叠拆成底部 tab 横向切换，桌面左栏则三者同屏常驻。故移动 `/`（项目切面）即桌面 `/`（global workbench）左栏项目部分的窄屏形态——同一 workbench 的两种视口适配，非两套页面。`/global` 是 global scope 的规范 URL，`/` 是桌面入口别名；桌面用户在 `/` 点左栏全局节点会归一到 `/global`（`left-rail.tsx selectGlobal`），交互后 URL 一致、非 bug。

## 12. header padding（独立小改）

`MobilePageHeader` 现是 `px-2`，正文内容区 `px-3` → header 比正文窄。统一为 `px-3`（所有移动 header 一致对齐正文）。**高度也统一 `h-11`**：`MobilePageHeader`（大标题式）与 `MobileTabHeader`（tab 横滚式）两套 primitive 并存但视觉高度对齐 `h-11`，覆盖三个一级页面（项目列表 / 全局 / 设置）+ 项目总览 + 聚焦态所有移动 header。

## 12.1 总览 / 列表 header 行 chrome 一致性（批 Q）

**不变量**：所有「总览 / 列表」顶部 header 行（global 项目总览、project 实例总览、移动 project 总览、files 列表 header）共享同一套 chrome，不再各自散写：

- 容器：`flex shrink-0 items-center gap-1 border-b border-on-surface/5 px-2 py-1.5`——在滚动区外（`shrink-0` 不被压缩）、统一 `border-on-surface/5` 细分割线 + `px-2 py-1.5` 行高（~40px）。
- 行内按钮（新建项目 / 新建实例 / New Folder / Upload）一律走 `actionButtonClasses({ compact: true, tone })`（或 `<ActionButton compact>`）：`compact` 不挂移动端触摸放大（不挂 `max-sm:min-h-11`），恒定 `px-3 py-1.5 text-xs`，与 `py-1.5` header 行高一致、不撑爆。dialog / 表单按钮仍用默认（非 compact）移动端撑到 `min-h-11` 触摸友好。

**为什么需要 `compact`**：`actionButtonClasses` 默认移动端 `max-sm:min-h-11 max-sm:px-4 max-sm:text-sm`（44px 触摸目标）服务于 dialog / 表单确认按钮；同一 primitive 被 overview header 行内按钮复用后，44px 撑爆 `py-1.5`（~40px）header 行，移动端「新建」按钮明显高出常规。`compact` 是 primitive 层单一开关，让 header 行内按钮回归 `py-1.5` 行高，dialog 按钮零回归。

**移动 project 总览对齐桌面 / global（批 Q 点 3）**：`MobileProjectOverview` 的 ViewSwitcher 行原本在滚动区内、无 `border-b`（桌面 `InstanceLeftOverview` / global `GlobalProjectsOverview` 同行有），与「桌面 / 移动同构」预期不符。改为提到滚动区外作 `shrink-0` header + `border-b border-on-surface/5 px-2 py-1.5`，与桌面 / global 同款。

**files 列表 header 对齐（批 Q 点 4）**：`FilesPanel` 顶部 breadcrumb 行原本 `border-b border-neutral-line/40 px-3.5 py-3`（偏高 + 异色边），改为同一 chrome `shrink-0 border-b border-on-surface/5 px-2 py-1.5`；行内 New Folder / Upload `<ActionButton>` 加 `compact`。

## 13. 激活与聚焦语义

- **活动 group** = `activeGroupId`（显式存布局）= 右工作区当前激活的 group；其 **活动 tab** = 该 group 的 `activeTabId`；URL `focusId` = 活动 tab 的 sessionId（唯一反查 group+tab）。
- **激活路径**（vs code explorer 语义，§7.2）：
  - **左总览单击卡片** → `findTabBySessionId` 命中（已开）= 激活该 tab（`setActiveTab` + `activeGroupId` 指向其 group），不新 tab；未命中（未开）= 在活动 group `addTabToGroup` 开新 tab（不新建 group）。
  - **右工作区点 group tab 栏某 tab** → 切该 tab 为 active + 激活该 group；**点 group 其他空白处** → 仅激活该 group（不改 active tab）。
- **激活驱动**：
  - 右栏容器跟随活动 tab（inspection 内容当前留空待扩展）
  - 左总览对应卡片高亮（◆ 标记 + ring）
- **非聚焦态**（无 `focusId`，如刚进 scope）：右工作区默认空态（不自动铺首个活跃实例，避免最小化最后 tab 后又被自动重开的循环，详见 §14）；右栏留空（inspection 暂停，待扩展）。点左总览卡片或 group 才进入聚焦态。
- **focusId 反查失败兜底**：`findTabBySessionId` 返 null（该 session 已最小化，不在任何 group）：URL `focusId` 保留不动（不死循环），右栏 inspection 当前留空（暂停），反查失败不影响其空态呈现。

## 14. 空态

| 区域 | 空态条件 | 呈现 |
|------|---------|------|
| 左总览 | scope 无活跃实例（refs.length === 0） | EmptyInstanceArea 创建态（+ Claude / + Codex / + Terminal） |
| 右工作区 | scope 无活跃实例（refs.length === 0） | EmptyInstanceArea 创建态（同左总览，引导创建首个实例） |
| 右工作区 | 有活跃实例但右侧无 tab（refs.length > 0，全最小化 / 刚进 scope 无 focusId / 所有 group 被 close） | EmptyInstanceArea 空态提示（「点击左侧实例查看，或拖卡片到这里分屏」，不显示创建入口——实例已存在，只是未打开） |
| 右栏 inspection | inspection 暂停（容器留空待扩展） | 恒显空态提示文案 |

**EmptyInstanceArea 双语义**（按 `refs.length` 区分）：`refs.length === 0`（真无活跃实例）→ 创建态（CreateSessionBar + 空提示）；`refs.length > 0` 但右侧无 tab → 空态提示（无 CreateSessionBar，引导点左侧实例）。初次进 scope 不再自动铺首个实例——右侧默认空态，用户主动点卡片/拖卡片才打开（避免最小化最后 tab 后又被自动重开的循环）。

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
| **E n 叉树布局模型** | §7.5/§7.6 重写：规则行（groups+newRowAfter）→ n 叉树（leaf/split + 方向），对齐 VSCode 局部分屏——上/下/左/右 只分裂目标 group 不横跨整行 + drop 到 max leaf 清 maximized + removeLeaf 子树提升/同方向合并 + atom key V2→V3 三分支迁移（V1→V2→V3 链式） | §7.3 §7.5 §7.6 |

每个 phase 自包含 context.md + plan.md + tasks.md + verify.md（或等价轻量承载，见 [workbench-multiview-plan memory]），独立交付、独立验证。

## 16. ASCII 图集

见 §3 IA 全景、§7.3 drop zone、§7.4 group 操作、§9 移动端对照。

---

**对齐记录**：
- 2026-07-04：初版 7 轮讨论锁定（grid/table/split 三视图 + split 三态状态机 + dock）。
- 2026-07-05：复盘重构。用户手测反馈「桌面聚焦态挤掉导航和视图」+「split 三态 + dock 不好操作」，改为统一中栏左右结构（左总览固定单列 + 右工作区拖放分屏），取消独立 split 视图与三态状态机。设计决策均标注「用户决定」。
- 2026-07-06：VSCode group+tab 两级模型重构。用户反馈中栏右侧「1 group = 1 实例」铺开模型 ui/ux 奇怪，要求完全参考 vscode。§7 重写为 group（分屏区，行×列网格，横/纵 resize）+ tab（实例，同 group 多 tab 切换）两级模型：tab ✕ = 最小化（session 存活回左总览）/ group ▢ = 最大化（group 级独占，独占时可切 tab）/ 关闭实例 kill 走左总览卡片 close + tab 右键（不放 tab ✕，避免高频按钮触发破坏性 kill）；左总览 ↔ 工作区 = vscode explorer ↔ editor group（点卡片已开激活/未开活动 group 开新 tab，拖卡片开新 group 分屏）；切 tab 用 CSS hidden 保 WebSocket 长连（不 unmount）；持久化 atom key 升级 workbenchLayoutV2 + migrateLegacyLayout 无损迁移；移动端读写同一 atom 但 group/tab 模型透明。新增 Phase D（§7.1-§7.7）。**设计完整，无「后续」；实现分 phase（A/B/C/D）渐进靠拢。**
- 2026-07-07：布局模型 n 叉树重构（bug 修复 + 对齐 VSCode）。用户报「拖卡片虚线框显示单 group 上下分屏，松手却横跨整行底部」——根因是 V2 规则行模型（groups+newRowAfter）下「新起一行」与「占满整行」绑定，`dropIntoGroup` 的 up/down 找整行行首/行尾操作，与 `deriveZone`+`DropZoneHighlight` 按单 group rect 画虚线框的维度不一致（示意撒谎）。用户实测 VSCode 后决策「完全对齐 VSCode：up/down/left/right 全改单 group 局部分屏，不做整行横跨」。§7.3 drop zone 改单 group 局部分屏语义、§7.5 规则行 → n 叉树（leaf/split+方向，同方向不嵌套，局部分屏只分裂目标 leaf，removeLeaf 子树提升/同方向合并）、§7.6 atom key V2→V3 三分支迁移（V1→V2→V3 链式）。新增 Phase E。
- 2026-07-07：渲染层扁平化重构（UI = f(state)）。用户报「tab 跨 group 移动 / group 切分 / 合入塌缩时 terminal 重连（WebSocket 断 + xterm dispose + relay 重放）」——根因是 §7.5 的 n 叉树被直接当渲染结构递归渲染，GroupCell / PanelRouter 嵌在递归树里，布局变化时其「父 + key」身份失稳，React 跨父 / 跨类型不复用 → unmount + mount → terminal 重连。曾尝试 portal 顶层常驻方案（createPortal 把 PanelRouter 注入 slot）失败：React createPortal 在 container 变化时仍卸载重挂子树，未绕开 reconciliation。用户决策「按 UI = f(state)：树关系是 state，不是渲染结构；表现层退化成扁平数组」。新增 §7.8：`flattenLayout(root)` 纯函数把树投影成 groups / gutters / panels 三个并列扁平数组，各用稳定 key（`leaf.id` / `sessionId`）`.map` 渲染；任何「会跨容器移动的对象」一律提到扁平层，不嵌在递归布局树里。split / 合入 / 跨 group 移动 / 加 tab / 切 active 全不重建。state 层零改动，§7.5 树模型 + §7.4 hidden 不 unmount 不变式保持。
