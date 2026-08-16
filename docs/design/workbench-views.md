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
- **视图 = 左总览的卡片样式**：单一「按项目分段的单列网格」视图（2026-08-05 融合，原 grid/grouped 双视图合并）；table 紧凑行视图已于 2026-08 移除。
- **group 二态**：右侧工作区的面板（group）只有「存在/不存在」，取消 expanded/缩略/最小化三态与底部 dock。
- **聚焦 = 激活某 group**：`focusId` = 右工作区当前活动 group 的实例，驱动右栏 inspection + 左总览高亮；不再是「中栏换成单实例」。
- **桌面/移动差异化**：桌面中栏左右分屏工作区；移动中栏窄不分左右，保持「列表态 → 全屏聚焦态」线性模型。

## 3. 信息架构

```
桌面三栏（中栏内部分左右）：
┌─────────┬──────────────────────────────────────────────┬──────────┐
│ 左栏     │ 中栏                                          │ 右栏      │
│         │ ┌─[总览][历史][文件][Git]── ▦▤视图切换─┐  │          │
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

- **左总览**：固定单列宽（~220–240px，贴合 InstanceGrid `minmax(220px,1fr)` 单列），卡片纵向堆叠。顶部 header 挂 CreateSessionBar（project only，+ 新建 agent/terminal）；global 总览 header 挂「+ 新建项目」按钮（2026-08-05 融合：ViewSwitcher 已下线，单一「按项目分段的单列网格」视图，§5）。两者随左总览只在 overview tab 渲染（history/inspection tab 全宽，无左总览）。tab 行只剩纯 tab，不再混排视图切换/新建按钮。
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

全局总览与项目总览都是**单一视图**（2026-08-05 融合：原 grid/grouped 两视图合并为「按项目分段的单列网格」，ViewSwitcher 下线）。两者都用同一 `InstanceGrid`（`gridTemplateColumns: 1fr` 固定单列 plain 卡片），区别只在「是否按项目分段」：

| scope | 呈现 | 项目分段 |
|-------|------|---------|
| global | **最前置顶分组**（📌，空隐藏，服务端持久化）+ 项目标题行（手风琴：▾ 折叠 + 📁 项目名点击进入 + ➕ 新建二级菜单 + 🗑 删除）作 section header 分割，每段下单列详细卡 | 是（`mergeProjectsWithCandidates`，含无实例空项目只显标题行） |
| project | 单列详细卡直接平铺（本项目实例，无需分段） | 否 |

- **global 卡片**（朋友圈式）：左 marker 头像（lg=h-9，上下置顶）+ 右 3 行（会话名 / 末行 output 预览 / 项目名·时间 + close 右推）。
- **项目标题行（手风琴，2026-08-06；2026-08-10 重设计 + 迭代）**：`[左组：▾ 折叠 + 📁 项目名 flex-1 button 点击进入][➕ 新建二级菜单][🗑 删除]`。**左组**（`flex min-h-11 min-w-0 flex-1 items-center gap-1.5`）复刻置顶分组「chevron+icon+文字」紧凑结构——▾ chevron 紧贴左缘（pl-3=12，对齐置顶 ▾）+ 紧挨 📁（gap-1.5=6，纠正首版 ▾ 方块 button 致 chevron 偏右 + 离 📁 隔 14px 的错误）。**行主按钮语义 = 进入项目**（📁 名 button flex-1 撑满左组除 ▾ 外空间 = 点行主体进入；navigate `/projects/$key`；2026-08-10 迭代去掉冗余 › 进入按钮）。**折叠/展开只由 ▾ 独立按钮触发**（`aria-label` = `workbench.collapseProjectGroup`/`expandProjectGroup` 按态切换 + `aria-expanded`，chevron expanded=`M4 6l4 4 4-4`（▾ 下）/ collapsed=`M6 4l4 4-4 4`（▸ 右），`size-4`/`touch:h-10`（移动端只放大高度不放大宽度，宽度保持 16 对齐置顶 chevron 直接子，纠正 `touch:size-10` 撑大致 svg 居中偏右、📁 跟随偏右的对齐错误），折叠态存 `workbenchProjectGroupsCollapsedAtom`（localStorage 按项目记忆）。**新建合并为 ➕ 二级菜单（2026-08-10 迭代）**：首版 +Claude/+Terminal 两行内独立按钮 → 合 1 个 ➕ 按钮（`ActionMenu`，桌面 popover / 移动 sheet，items=[Claude/Terminal]，对齐项目内 `CreateSessionBar`），🗑 删除独立（trash destructive）。新建行级 `useCreateSession(projectName)`（name prompt → 创建 API → navigate `/projects/$key/session/$id` + invalidate，不需进项目直接建；空项目行同样可建）。**桌面右键随 ⋯ 下线（2026-08-10）**。**section 容器 `bg-surface-raised` + Apple 动态圆角（2026-08-10，inset grouped 范式）**：每个 section 按自身展开态 + 上下邻居态算圆角与上边界——连续折叠标题行组成圆角条带段（段内首行 `rounded-t-lg` 顶圆、末行 `rounded-b-lg` 底圆、中间方角），展开分组脱离条带成独立圆角块（`rounded-lg` 四角，标题行顶圆 + 卡片底圆共享 section bg 一体成块）；段内相邻折叠行用分割线（section 条件 `border-t border-on-surface/5`），展开块与折叠段/其他展开块间用 `mt-2` 间距断开（分割线不穿过展开块）。判定：collapsed 顶圆当 `!prev || prev.expanded`、底圆当 `!next || next.expanded`、中段方角；expanded 恒四角圆。上边界：`prev.collapsed && self.collapsed`→分割线 `border-t`，否则（任一端触及展开块）→`mt-2`；首 section 无上边界。**bg 从内层标题行 div 上移到 section 容器**（展开块标题行+卡片一体共享 bg，圆角块不断开），标题行 div（`flex items-center gap-2 pl-3 pr-2`）去 bg；列表根 `px-3 py-2` 去 `divide-y`（分割线改每个 section 条件 `border-t`）。**bg = `surface-raised`（凸起语义，苹果 inset-grouped 范式）**——「分组永远比底色亮」：`surface-raised`[明 `#ffffff` / 暗 `#141b28`] 两主题都比底色（shell `bg-surface/20`：明浅灰蓝≈苹果 systemGroupedBackground `#F2F2F7` / 暗深黑）亮 → 凸起方向两主题统一。**弃用 `on-surface/10`**：`on-surface` 是文字色（明深/暗浅），@10% 叠加底色 → 明主题分组**变暗凹陷**、暗主题**变亮凸起**，两主题方向翻转（明暗不对称，明亮不对的真根因）；`active:bg-on-surface/10` 按压反馈保留——卡片连续单列平铺，组内非首卡由 InstanceCard `topSeparator` 画 inset 分割线（两端统一 left-15=60px）。
- **置顶分组（2026-08-06）**：global 总览**最前**新增特殊分组「置顶」（📌），收纳跨项目置顶卡片（快捷入口，**不搬移**——置顶卡片同时在「置顶分组」和「原项目分组」出现，双显示）。置顶数据**存服务端**（2026-08-07 迁）：`state.yaml` `overview` 模块 `pinnedSessions`（`/api/state/overview/pinned-sessions`，StateStore 模块化存储），前端 `usePinnedSessions` 读取（React Query `["pinned-sessions"]`，staleTime 30s，窗口聚焦 refetch 跨设备同步——全局 query-client 默认关 refetchOnWindowFocus，pin 低频且跨设备故此处显式开）；旧 localStorage `workbenchPinnedSessions` 由一次性播种迁移（`useLegacyPinSeed`：初始 fetch 结算后 POST 各 pin → 成功删 key，幂等）。sessionId 残留无候选匹配即不渲染，空分组自然隐藏，无需 GC。**无置顶卡片时分组整段不渲染**（空隐藏）。标题行 = 折叠 toggle 同款（`▾/▸` + 📌 pin 图标 `text-primary` + 「置顶」`text-base font-semibold`，`aria-expanded`，min-h-11 热区），容器同项目行 `bg-surface-raised`（参与同一动态圆角判定，同项目行，见 §5 项目标题行契约），折叠态复用 `workbenchProjectGroupsCollapsedAtom` 的保留哨兵 key `"__pinned__"`（localStorage 记忆）；**无 `›` 进项目、无 `⋯` 删除**（非项目，只折叠 toggle）。每张 global 总览卡片**置顶按钮与时间（meta 行）同行 + absolute 脱流**（2026-08-06 续六）：pin 用 `absolute right-0 top-1/2 -translate-y-1/2` 定位在 meta 行（`relative`）右侧垂直居中，`inline-flex h-5 w-5`（20px 桌面）/ `touch:h-7 w-7`（28px 触摸），icon `h-3.5 w-3.5`，`aria-pressed`；置顶态 icon `text-primary`，否则 muted + hover 亮。**pin 不进 flex 流 → meta 行高 = text-xs 16px（`min-h-4` 兜底），不撑高行**——三行高 20/16/16 节奏齐（subtitle 与 meta 同高）、有 pin 卡与无 pin 卡等高（彻底回收 pin 曾占的行空间）、底部不空旷。水平让位：meta 行 `pr-7`/`touch:pr-9`、subtitle `touch:pr-9`（touch pin 上溢避让）。与 ⋯ 主次分明——tap 置顶/取消置顶，`stopPropagation` 双层防 portal fiber 冒泡导航。**卡片右上 ⋯ 按钮显著**（`absolute right-2 top-2`，h-9 w-9 / touch:h-11 w-11，icon h-5 w-5）。**仅 global 总览卡片渲染**（InstanceCard 可选 props `pinned`/`onTogglePin`/`pinLabel`，缺失不渲染 → 项目 scope/纯展示卡零改动；无 meta 文本时仍渲染该行承载 pin，`hasMetaText || onTogglePin` 条件）；文字让位：**只有 title 行恒让位给 ⋯**（`pr-10 touch:pr-12` = 40/48px = 按钮列 44/52（right-2 8 + h-9 36 / h-11 44）− card p-3 12，右缘 = ⋯.left − 8 间隙防误触；title 行旧 pr-6 触屏钻 ⋯ 下方 12px 一并修复）；subtitle 行 `touch:pr-9`；meta 行 `pr-7 touch:pr-9`。置顶按钮小尺寸属与时间同行的次要操作，不强制 44px（触屏 28px、桌面 20px，absolute 脱流不撑高 meta 行）。置顶组也传 `dragAdapter` + dragRefs（桌面左栏可拖进右工作区）。
- **项目标题行新建/删除（2026-08-06 续七菜单，2026-08-10 展开为行内按钮，迭代回合为 ➕ 二级菜单）**：原 ⋯ 菜单的「新建 Claude + 新建 Terminal + 删除项目」三项——首版展开为 3 行内 icon 按钮，**迭代回合 +Claude/+Terminal 合为 1 个 ➕ 二级菜单**（`ActionMenu` trigger=plus icon，items=[Claude/Terminal]，对齐项目内 `CreateSessionBar`），🗑 删除保留独立按钮。对齐项目 `CreateSessionBar` 新建项，**不需进具体项目即可在总览直接建实例**。实现 = 行级 `ProjectRowActions` 组件（`global-projects-overview.tsx`），内部 `useCreateSession(projectName)`（name prompt → `createAgentSession`/`createTerminalSession` → navigate `/projects/$key/session/$id` + invalidate，与项目内 `CreateSessionBar` 行为一致：创建即进入会话工作台）。hook 在组件内调用（`groups.map` 内联调 hook 违反 hooks 规则）——标题行 `<ProjectRowActions>` 放左组（📁 名 button）与最右 🗑 之间，渲染 ➕ ActionMenu + 🗑 按钮；props = `{ projectName, onDelete, deletePending }`。➕ trigger `aria-label=workbench.createSessionAria`、`isCreating` 禁用；🗑 destructive 静息 muted / hover `text-error` + `bg-error/10`、`deletePending` 禁用。**空项目行同样可建**（最需要直接建第一个实例）；置顶分组标题行无 ➕ 不涉及。不加 Codex（项目里 `CreateSessionBar` 也没有，`workbench.createCodex` key 无消费点）。
- **空项目**：global 含空项目（只显标题行，可进/可删）；project scope 无分段概念。空项目行**无折叠 chevron**（无可折叠内容）——左组 ▾ 位 `size-4` 占位 span 保持 📁 与有实例行对齐，主区为 📁 名 button（`flex-1`，`onClick` 进入项目，`min-h-11` 热区 ≥44px），仍保留 `➕`/`🗑` 按钮。
- 两种 scope 都在 ~220–240px **固定单列**内呈现——`InstanceGrid` 用 `grid-cols-1`（`gridTemplateColumns: 1fr`），**不用 `auto-fill minmax`**。理由：左总览设计为固定单列卡片清单（§4），`auto-fill` 在用户拖宽左总览（≥28rem=448px）时会自动变 2 列，卡片缩到 220px 内容拥挤，违反「父容器默认以单列宽度排布」的设计意图。`grid-cols-1` 让卡片宽度始终 = 容器宽，拖宽只让卡片变宽（内容更宽松），不增列。

## 5.1 左总览 padding 规则

左总览 `leftOverviewContent` 两分支（global 分段 / project 平铺 / skeleton）的卡片容器**统一 `px-3 py-2`**——project 平铺与 skeleton 分支由调用方包 `<div className="px-3 py-2">`（global 分段在内部 `px-3 py-3` 自带）。理由：卡片直接贴 scroll 容器边缘（padding=0）会左右紧贴；统一 padding 让卡片有呼吸空间。skeleton 分支用 `CardGridSkeleton plain`（对齐真实 InstanceCard 行高：marker h-9 + 内容栈 title/subtitle/meta 三行，加载完不跳到真实行高）；骨架动画范式与「对齐铁律」见 [DESIGN.md Loading 态](./DESIGN.md#loading-态)。

## 5.2 grid item min-width 规则

InstanceGrid 的 grid item 必须有 `min-width: 0`。grid item 默认 `min-width: auto`（= content min-content），InstanceCard 内 title/subtitle 的 min-content 会把 `1fr` 列撑开超过容器（实测 16rem 下 257px > 容器 232px，溢出 ~25px）。移动端 grid item 直接是 InstanceCard（外层 `min-w-0`，`shell-primitives.tsx` L539），天然 min-width:0；桌面 grid item 是 DragSourceCard wrapper（启用拖放），wrapper 必须显式 `min-w-0` 对齐移动端——否则 wrapper 的 `min-width:auto` 让 content 撑开列，卡片溢出。`min-w-0` 让 `1fr` 列可收缩到 < min-content，配合 InstanceCard 内部 `truncate` 截断内容而非撑开。

## 6. 视图切换器（已下线）

2026-08-05 融合：原 grid/grouped 双视图合并为单一「按项目分段的单列网格」（§5），`ViewSwitcher` segmented control、`WorkbenchView` 类型/atom/URL search param、`InstancePagedCarousel`、`GroupedProjectsSkeleton` 全部移除。全局总览不再有视图切换器；项目总览本就无切换器。URL 残留的 `?view=` 值被 `validateWorkbenchSearch` 忽略（私有偏好，不做迁移）。

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

### 7.7 移动端：drawer + 内容 tab 带（2026-08-16 重设计）

group/tab 两级模型对移动端透明——移动端读写同一 layout atom（§7.6），**不渲染多 group**（窄屏不分屏，分屏结构只在桌面消费）。但自 2026-08-16 重设计起，**项目 scope 移动端把「中栏打开 tab 集合」展示为 header 内容 tab 带**（不再对 tab 透明），对齐桌面中栏：

- **结构 = 桌面三栏的前两栏在窄屏的投影**：**侧边栏 drawer = 左栏投影**（7 段横向 tab 行：总览/历史/文件/Git/页面/Wiki/插件 + 各段主体；浏览态进入项目（无 focusId）默认展开总览段，会话列表即入口；**聚焦态进入（带 focusId，如从 global 总览点会话卡）drawer 收起**——用户已明确要看会话，总览段是多余遮挡）；**header 内容 tab 带 = 中栏投影**（共享 `workbenchLayoutV4` 打开集合，`projectTabStrip(layout, projectKey)` 纯投影——只含当前项目 session/file/git tab + 全部 skill，skill 无 projectName 刻意全局包含）。聚焦态 body = `<PanelRouter>`（与桌面中栏主体同一渲染源，session 含底部输入、file/git/skill 只读预览）。
- **URL focusId 是激活语义核心**：点 drawer 会话行 → `navigateWorkbench(scope, sessionId)` → focus effect（§11 同款）开/激活 tab → tab 带显示；点 tab → `onSelectTab(leafId, tabId)`（`setActiveTabInLeaf` + navigate focus）。tab ✕ = 最小化（`removeTabFromLeaf`，session 存活）；关闭实例走聚焦态 header ℹ✕ 胶囊的 ✕（`useCloseSession`）。
- **文件/skill 并入 tab 带**：drawer 文件段点文件 → `onOpenFile`（`ensureTabOpenLeaf` + `navigateToFile`）+ 关 drawer → 文件以 content tab 形态进带（`/projects/$key/file/$`）。skill 同理（`/projects/$key/skill/$` 新路由，项目 scope 停在项目内，与 file/git 一致）。
- **底部 nav 只在全局一级页**：项目工作台是二级，无底部 nav（`useMeasuredBottomNav(scope.kind !== "project" && !focusId ? … : null)`）。
- **新建会话入口移到 header 右上角**（2026-08-16 迭代）：二级页无底部 nav，FAB「落 nav 带、nav 收缩让位」语义锚点消失。`MobileTabStrip` trailing 由「仅聚焦 session ℹ✕ 胶囊」扩展为二态——浏览态（无 focusId）= icon 方新建按钮（与 ☰ 对称，`h-9 w-9`，ActionMenu Claude/Terminal 底部 sheet）；聚焦 session = ℹ✕ 胶囊；file/git/skill 聚焦 = 空。移除 `MobileProjectWorkbench` 的 `<MobileFab>`。**同日后续迭代：全部 FAB 下线**——新建项目（`MobileGlobalOverview` `MobilePageHeader.actions`，dialog 逻辑收敛 `useCreateProjectDialog()` hook）、新建文件夹/上传（`FilesPanel` header 行右侧 `max-lg:flex` ActionMenu）、新建页面根（`PagesPanel` `lg:hidden` header 行）全迁 header 右上角；`MobileFab` 组件删除、底部 nav `group-has-[.mobile-fab]` 让位 CSS 清理（详见 DESIGN.md `floating-action-button` 条目与 frontend-notes §12）。
- **global scope 移动端**：列表态保持（`MobileGlobalOverview` / `MobileFilesOverview` / `MobilePluginsOverview`）；**点会话卡不再进 global 全屏聚焦态，而是进入该会话所属项目的 project scope 工作台**（`navigateSession` 对 `!isDesktop` 用 `ref.projectName` 构造 project scope URL，2026-08-16 迭代——移动端无「左栏保持」语义，旧 global focus URL `/projects/session/$id` 只剩 URL 直达兜底走 `MobileFocusBody`）；文件/skill focus 仍走 `MobileFileFocus` / `MobileSkillFocus`。

**移动端 focus 态 header tab（Output/Files/Git）记忆语义**（`workbenchMobileFocusTabAtom`，`atomWithLocalOnlyStorage` 持久）：global scope 聚焦态仍用（从 `MobileGlobalOverview` 点实例卡片新进 focus 时 `focusInstance` 重置 tab 到 Output，避免 Files/Git 记忆落到项目文件）。项目 scope 聚焦态已无 inspection tab（被内容 tab 带取代），该 atom 不再消费。

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
- **marker 尺寸按场景区分**：左总览卡片用 `lg`（h-9 w-9=36px，头像式独立左列）；默认 `sm`（h-7 w-7=28px，带 IconMarker 方框 + tone 背景，GroupHeader / HistoryList 用）；**右工作区 group tab 用 `xs`（h-4 w-4=16px 裸 icon，无 IconMarker 方框，tone 用文字色）—— 与 tab label 14px 同高比例 1:1**（Phase 6 批 6b：旧 tab 用 sm=28px 与 14px label 比例 2:1 视觉失调，marker 比标题大；缩为 xs 裸 icon 后视觉平衡，且 tab 收敛到 nav-item 设计语言）。圆点 `-right-1 -top-1` 定位为固定 4px 偏移，不依赖 marker 尺寸，放大后无需调整。`sessionMarker` 加 `size` 参数（`"xs" | "sm" | "lg"`，默认 `sm`，不破坏 GroupHeader 紧凑行高），card 两处调用方（`instanceToGridItem` / `candidateToGridItem`）显式传 `lg`，`usePanelMeta`（服务 TabChip + 拖动 ghost）传 `xs`。
- 复用 `statusToTone` 映射状态→颜色；`StatusMarker` 包 `StatusDot`（加 `className` 支持 absolute 定位）。

## 9. 移动端差异

| 项 | 桌面 | 移动 |
|----|------|------|
| 中栏左右结构 | ✓（左总览 + 右工作区） | ✗（窄屏不分左右） |
| 右工作区分屏 | ✓（拖放 5 zone） | ✗（窄屏做不了分屏） |
| 点卡片行为 | 激活（右工作区切活动 group） | 全屏切聚焦态 |
| 总览视图样式 | 按项目分段单列网格（左总览） | **项目 scope = 侧边栏 drawer 总览段会话列表**（默认展开）；global scope = 全宽单列网格 |
| 二级导航 5 tab | 中栏顶部常驻 | **项目 scope = 侧边栏 drawer 7 段**（总览/历史/文件/Git/页面/Wiki/插件，文字行）+ **header 内容 tab 带**（打开 tab 集合）；global scope = header 下一行横向滚动 |
| 右栏 inspection | 容器留空（待扩展） | **项目 scope 聚焦态无 inspection tab**（文件/Git 以 content tab 形态并入 tab 带）；global scope 聚焦态保留 output/文件/Git |

**项目 scope 聚焦态**（2026-08-16 重设计）：**header = 内容 tab 带**（☰ drawer 开关 + 打开 tab 横滚区 + ℹ✕ 胶囊操作区），body = `<PanelRouter>`（session 含底部输入区；file/git/skill 只读预览）。面板自带 header 在聚焦态隐藏（`embeddedHeader` prop）。实例名与 meta 进 ℹ 底部 sheet（agent 显 model/permission/createdAt/status，terminal 仅 type/status —— UI=f(state) 不伪造）。✕ 触发 `useCloseSession`（confirm → close API → navigate 回项目列表态）；tab 带内 tab ✕ = 最小化（session 存活）。Retry 在内容区错误态 Notice（`connectionStatus==="error"` 时显示，与桌面 header Retry 共用 `onReconnect`）。返回入口 A（离开项目回列表）在 drawer 顶部。

**global scope 聚焦态**（不变）：**单行合并 header**（◄ 返回 + tab 横滚区 output/文件/Git + ℹ✕ 胶囊操作区），body 仍是 PanelRouter（output）或 inspection plugin render。

**桌面右工作区对齐移动端**（Phase 6 批 6a）：右工作区 `WorkspaceTree` 的 `PanelRouter` 也传 `embeddedHeader`，面板自带 `SessionDetailHeader`/`ChatHeader` 整个不渲染。操作去向与移动端聚焦态一致：Files/Git 走中栏顶部二级 tab（已覆盖，无重复入口）；+Terminal 走左总览 `CreateSessionBar`（已覆盖）；Retry 走内容区错误态 Notice（`embeddedHeader && connectionStatus==="error"` 分支，现有实现）；Close 由 tab ✕ + 左总览卡片 close 承担（embedded 已 `showClose=false`）。实例名由 group tab 栏 chip 显示（marker + displayName），projectName 由中栏顶部 tab 行所在的 project 作用域显式（聚焦态右工作区不重复显示）。`GroupHeader`（tab 栏 + ▢ maximize）仍在，与移动端 `MobileFocusHeader` 同为 group/scope 级 header，不属于面板自带 header。

## 10. 会话名（displayName）统一呈现

会话名是一等显示元素，所有位置清晰呈现：
- 左总览卡片标题（单列网格）
- 右工作区 group tab 栏
- 移动列表卡片标题
- 移动聚焦态 ℹ 信息 sheet

来源：`session.displayName`（已存在于 AgentSession/TerminalSession）。

## 11. 路由 / URL 模型

四个正交 URL 维度（对齐现有 rightTab/tab 做法）：

- `focusId`（path 段 `/global/session/$id` / `/projects/$key/session/$id`）= 右工作区**活动 group 的活动 tab** 实例 sessionId（唯一反查 group+tab）；group/tab 布局进 localStorage、不进 URL（§7.6）
- `?view=grid|grouped` = 左总览卡片样式（仅 global 总览有意义；project 总览单一 grid，URL view 被忽略）
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

**移动 project 总览 header chrome（批 Q 点 3，2026-08 更新）**：project 总览已收敛为单一 grid 视图、移除 ViewSwitcher（`MobileProjectOverview` / `InstanceLeftOverview` 均无切换器）；header 只剩 CreateSessionBar。原「ViewSwitcher 行提到滚动区外作 `shrink-0` header + `border-b border-on-surface/5 px-2 py-1.5`，与桌面 / global 同款」的 chrome 约定仍适用于 CreateSessionBar header 行。global 总览（`GlobalProjectsOverview`）的 ViewSwitcher 已于 2026-08-05 融合视图下线（§5/§6）。

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
| **A 中栏左右骨架** | 中栏分左右（左总览固定单列 + 右工作区 flex-1，gutter 调比例）+ 左总览单列卡片（按项目分段单列网格）+ 右工作区单 group（首个活跃实例，PanelRouter）+ 左总览单击/右工作区点 group 激活 + 右栏 inspection 跟随 + tab 导航常驻 + URL 四维模型 | §2 §3 §4 §5 §6 §11 §13 §14 |
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
- 2026-08-03：总览视图收敛——移除 table 紧凑行视图。用户决策「project 总览不再需要视图切换，只保留一个；global 总览删表格视图」。`WorkbenchView` 类型 `"grouped" | "grid" | "table"` → `"grouped" | "grid"`；`SessionTable` 组件 + `instanceToTableRow`/`candidateToTableRow`/`TableRowCallbacks`/`TableViewIcon` + i18n `workbench.viewTable`/`table.col*` 全删。project 总览（桌面 `InstanceLeftOverview` / 移动 `MobileProjectOverview`）单一 grid 视图、无 ViewSwitcher；global 总览（`GlobalProjectsOverview`）保留 grid/grouped 两视图 ViewSwitcher。§5 矩阵删 table 行、§5.3 table 行契约整节移除、§6 切换器 3→2 icon、`?view=grid|table|grouped` → `?view=grid|grouped`。旧 `?view=table` URL / atom 残留由 validateWorkbenchSearch + resolvedView 回退 grid 安全忽略。
- 2026-08-03：移动文件 tab cwd 跨 tab 保活。用户报「移动端查看实例输出 → 切文件 → 切其他 tab → 切回文件，文件树回到根目录，应保持上次位置」。经查**不是回归，是从未实现**：commit 731758f 标题说"移动端项目内切输出/文件 tab"但实际只修桌面 `ProjectLeftPanel`/`FilesLeftPanel` 的 `currentPath` 受控保活。移动端 `MobileFocusBody` 与 `MobileProjectOverview` 都走 `activePlugin.render(ctx)` 条件渲染——切 tab 即卸载 `FilesPanel`，文件 plugin 恒以 `initialPath=""` 重新挂载 → 切回必回根目录。修复：镜像桌面模式——父级 body 持 `filesPath` state，经扩展的 `WorkbenchTabPluginContext.currentPath/onPathChange` 透传 `FilesPanel`，跨 tab 切换保活。`MobileFocusBody` 加 derived-state 切项目重置（projectName 派生自 focusId）；`MobileProjectOverview` 由 `key={scope.key}` remount 兜底重置。移动端两条保活路径并存：输出 PanelRouter 走 `hidden` 保活（避免 stream 重连）、inspection files plugin 走受控 cwd 保活（避免回根目录）。GitDiffPanel/PagesPanel/WikiPanel 不消费 cwd，plugin context 扩展对它们零影响。
- 2026-08-03：项目总览分组视图两端统一带 bg + 分割条 inset。用户三诉求：① 移动/桌面分组视图不一致（桌面有边框圆角、移动仅 `overflow-hidden` 无边框，靠根 `space-y-3` 分隔）→ 两端统一；② 分组只有边框隔开应带 bg → 参考设置 Card grouped 带 bg 范式；③ 桌面分割条全宽覆盖 marker 列 → 改 inset（marker 列无分割条，对齐移动 + iOS separatorInset）。`GroupedProjectsList` section `overflow-hidden lg:rounded-lg lg:border lg:border-neutral-line/40` → 两端统一 `overflow-hidden rounded-lg border border-neutral-line bg-surface-raised`（撤销决策 38 移动 full-bleed 无边框）；根 `px-0 py-3 lg:px-3` → 两端统一 `px-3 py-3`（撤销决策 42 移动贴边）；`InstanceCard.topSeparator` `left-15 lg:left-0` → 两端统一 `left-15`（60px=p-3+marker lg+gap-3 跳过 marker 列，撤销桌面全宽）；`GroupedProjectsSkeleton` + `CardGridSkeleton` 占位卡同步。bg 用 `surface-raised`（非设置的 `surface`）因分组父底是 shell(`surface`)，`surface-raised` 浮起一层复刻设置 Card 在其底上的浮起关系（InstanceCard plain 透明露出正常卡片底色）。carousel 内部交互（移动 swipe+peek / 桌面满宽+页码）、名行 padding 不动。连带：桌面 grid 视图（`InstanceGrid plain`）分割条也变 inset（InstanceCard 级改动）。
- 2026-08-03：分组视图移动端对齐桌面端（满宽 + 去 full-bleed peek 残留 + 移动 dots）。用户：「桌面端完全符合要求，仅移动端不符」——三条诉求（标题↔卡片对齐 / 右侧边距太宽 / 两端共用代码）实为同一件事：移动端 `px-5`(20) peek + 名行 `pl-5 pr-7`(20/28) 是上一轮 full-bleed 无边框时代（决策 38-43）残留，section 加 bg+border 后在带 bg 的 section 内变成可见右侧 28px bg 空白（桌面 8px）+ 标题图标(33)与 marker(45)错位 12px（桌面图标 73 ≡ marker 73 已对齐）。撤销 peek 范式、移动对齐桌面满宽：`GroupedProjectsList` 名行 `pl-5 pr-7 lg:pl-2 lg:pr-2` → 两端统一 `pl-3 pr-2` + button `px-0 lg:px-1` → `px-0`（图标≡marker、⋯≡action 两端一致）；`InstancePagedCarousel` 退化态去 `px-5 lg:px-0` wrapper（卡片满宽）；carousel 态去首尾 spacer + 页 `w-[calc(100%-2.5rem)] lg:w-full` → `w-full` + 容器 `scroll-px-5 lg:scroll-px-0` → `scroll-px-0`（满宽 snap）；新增移动 dots 指示器（`lg:hidden`，active `bg-primary`/inactive `bg-on-surface-muted/40`，复用 `carousel.pageLabel`）= 桌面页码行 ‹1·2·3› 的移动等价 ●○○（平台差异合理表达，撤销决策 39 swipe+peek 暗示）；`GroupedProjectsSkeleton` 名行 `px-2` → `pl-3 pr-2` mirror。桌面零回归（满宽 + 名行 pl-3/pr-2 与原 lg:pl-2/lg:pr-2 等价）。撤销决策 38-43 full-bleed peek 范式。
- 2026-08-05：全局总览双视图融合为单一「按项目分段的单列网格」。用户钟爱网格视图的卡片密度，但希望自然融入项目分组 + 项目操作区（进项目/删除），替换原 grouped 视图——参考他人「用项目标题作分割条」做法。grid（单列满宽平铺，无项目分段）+ grouped（项目 section + InstancePagedCarousel 每页 3 卡 swipe）合并为：项目标题行（📁 项目名 + › 进项目 + ⋯ 删除）作 section header 分割，组内换 `InstanceGrid plain` 连续单列卡片（无圆角 section 边框/bg、无 carousel 分页），含空项目只显标题行。`ViewSwitcher` segmented control + `WorkbenchView` 类型/`workbenchViewAtom`/URL `?view=` search param/`filterWorkbenchViews`/`WORKBENCH_VIEW_ORDER`/`VIEW_LABEL_KEY`/`groupByProject` + `InstancePagedCarousel`/`GroupedProjectsSkeleton` 组件 + i18n `workbench.viewSwitcher`/`viewGrid`/`viewGrouped` 全删。`WorkbenchRoute.tsx` ~9 处 `view: viewFromUrl` 接线、`validateWorkbenchSearch` view 字段、`useWorkbenchNavigate` search.view、`WorkbenchRouteContext.view`/`deriveWorkbenchRouteContext` view 同步清理。§5 重写为单一视图、§6 标注下线；project scope 单 grid 视图本就无切换器，零改动。旧 `?view=` URL / localStorage `workbenchView` 残留由 `validateWorkbenchSearch`（不再返回 view）安全忽略。
- 2026-08-06：项目标题行改手风琴 + 移动端残留 header 清理。用户真机观察两点：① 移动端全局总览「原本的视图切换所在行」仍有残留——`GlobalProjectsOverview` 自带 header（`flex ... border-b`）移动端 create 按钮 `hidden lg:inline-flex`（display:none）+ FAB `fixed` 出流 → 该行渲染成 ~12px 空条 + 分割线。修：header 行 `hidden lg:flex`（桌面专用），`MobileFab` 移出行作兄弟节点（FAB 本身 fixed + lg:hidden，布局零变化）。② 项目分割改手风琴——标题行同时承载「折叠/展开 + 进项目 + 删除」，折叠收纳实例区（用户反馈页面零散）。决策（AskUserQuestion）：布局 A——整行 tap（图标/名/▾ 区）= 折叠/展开（`aria-expanded`，flex-1 min-h-11 热区），右侧独立 `›` 按钮进项目（`aria-label=workbench.enterProject`，h-7 w-7 / touch:h-10 w-10 镜像 ⋯），⋯ 删除；折叠 chevron expanded=`M4 6l4 4 4-4`（▾）/ collapsed=`M6 4l4 4-4 4`（▸）；折叠态存 `workbenchProjectGroupsCollapsedAtom`（`atomWithLocalOnlyStorage<Record<projectName,true=折叠>>`，localStorage 按项目记忆，刷新/重开保留）。空项目无折叠 chevron（主区非按钮，▾ 位 `size-4` 占位对齐图标）仍可进/可删。实例区 `hasCards && !isCollapsed` 条件渲染（卡片纯展示无 WS，卸载安全；折叠组不作 drop 目标，展开即恢复）。行主按钮语义变更：进项目 → 折叠；进项目收敛到独立 `›`。
- 2026-08-06（续）：特殊分组「置顶」+ 卡片右下角置顶按钮。用户两项需求：① 新增特殊分组「置顶」（数据只存客户端；无置顶卡片时分组隐藏）；② 每张卡片右下角加置顶按钮。决策（AskUserQuestion）：**两边都显示**——置顶卡片同时在「置顶分组」和「原项目分组」出现（置顶 = 快捷入口，不搬移）；**仅全局总览卡片**有置顶按钮（项目 scope / 纯展示卡不渲染）；**置顶分组标题行可折叠 + 状态记忆**——复用 `workbenchProjectGroupsCollapsedAtom`，key 用保留哨兵 `"__pinned__"`（localStorage 记忆，刷新/重开保留）。置顶态存 `workbenchPinnedSessionsAtom`（`atomWithLocalOnlyStorage<Record<sessionId,true=置顶>>`，localStorage key=`workbenchPinnedSessions`；残留 sessionId 无候选匹配即不渲染，空分组自然隐藏，无需 GC）。置顶按钮 = InstanceCard 可选 props `pinned`/`onTogglePin`/`pinLabel`（缺失不渲染，项目 scope 零改动），`absolute bottom-2 right-2` 镜像 ⋯ 按钮（h-9 w-9 / touch:h-11 w-11，icon h-5 w-5，`aria-pressed`，置顶态 icon `text-primary`），`stopPropagation` 双层防 portal fiber 冒泡导航；文字让位：title 行恒让位（给 ⋯）、subtitle/meta 行置顶时让位（给 pin），均 `pr-10 touch:pr-12`（40/48px = 按钮列 44/52 − card p-3 12，右缘 = 按钮.left − 8 间隙）。置顶分组 section 渲染在项目 groups.map **最前**（`pinnedCandidates = candidates.filter(c => pinned[c.ref.sessionId])`，空则整段 null），标题行只折叠 toggle（▾/▸ + 📌 pin `text-primary` + 「置顶」），无 › 进项目、无 ⋯ 删除；也传 `dragAdapter` + dragRefs（桌面可拖进右工作区）。项目组卡片同样接置顶按钮（双显示）。纯客户端，服务端零改动（**2026-08-07 推翻**：pin 迁服务端 `state.yaml` overview 模块，见 changelog 下条）。
- 2026-08-06（续二）：全局总览卡片按钮优化 + 分组标题行背景。用户反馈：① 置顶/更多按钮「视觉偏小、不易点击、贴太靠近易误触」；② 分组标题所在行应有 bg。决策（AskUserQuestion）：**桌面按钮 36px（h-9 w-9）**、**触屏 44px（touch:h-11 w-11）**（现 40px 低于 DESIGN 触屏目标规范 + Apple HIG）、**标题行 raised 抬升条**（`bg-surface-raised/30 rounded-lg`）。实现：InstanceCard pin/⋯ 按钮 h-7→h-9、touch:h-10→touch:h-11、icon h-4→h-5；文字让位统一 `pr-10 touch:pr-12`（40/48px = 按钮列 44/52 − card p-3 12，右缘 = 按钮.left − 8 间隙防误触）——title 行旧 pr-6 触屏钻 ⋯ 下方 12px 一并修复，subtitle/meta 行 pr-9→pr-10 touch:pr-12；置顶组 + 项目组标题行容器加 `bg-surface-raised/30 rounded-lg`（折叠/展开态均保持）。只动全局总览卡片与分组标题行，文件/git/表格行 ⋯、› 进项目按钮尺寸、按钮位置（right-2/bottom-2）均不动。
- 2026-08-06（续三）：pin/⋯ 层级再调——pin 移内容流末行变小（朋友圈点赞式），⋯ 保持显著。用户「抬升条 ok 先 push」后反馈：pin 与 ⋯ 始终靠太近、大小失衡；期望 **⋯ 更显著**、**pin 更小**、**pin 放到卡片最后一行**（微信朋友圈点赞按钮式，不再浮正文）。决策：**pin 从 `absolute bottom-2 right-2`（h-9 w-9 / touch:h-11 w-11，icon h-5，与 ⋯ 同尺寸右缘堆叠）移入内容列 `<div class="min-w-0 flex-1 flex flex-col gap-1">` 末尾**（meta 行之后），改**流式右对齐小按钮**：`self-end inline-flex h-7 w-7`（28px 桌面）/ `touch:h-9 w-9`（36px 触摸），icon `h-4 w-4`，pinned→`text-primary` 否则 muted + hover 亮，保留 `aria-pressed` + `stopPropagation` 双层。**⋯ 保持右上角显著**（`absolute right-2 top-2`，h-9 w-9 / touch:h-11 w-11，icon h-5 w-5）不动。**让位几何变化**：pin 不再压 subtitle/meta 行 → 这两行去掉 `onTogglePin && "pr-10 touch:pr-12"` 恒为无条件 class（`min-w-0 truncate text-xs` / `flex items-center gap-1.5 text-xs`）；只有 title 行保留 `pr-10 touch:pr-12` 恒给 ⋯ 让位。**结果主次**：⋯ = 主操作（右上角显著 36/44）、pin = 内容末行次要操作（朋友圈点赞式 28/36，小一档不重叠）；pin 触屏 36px < 44px 属刻意取舍（内容末行次要操作，对齐 DESIGN header 操作例外 L489），不强制。卡片 padding/网格、⋯ 位置尺寸、subtitle/meta 行距均不动。
- 2026-08-06（续四）：pin 从单独成行 → 与时间（meta 行）同行。用户反馈：pin 单独成行浪费一行，应与时间同一行。决策：**pin 从内容列末尾独立元素（`self-end` 末行）移入 meta 行内**，作 meta 行末子元素 `ml-auto inline-flex h-7 w-7 shrink-0`（尺寸不变 h-7/touch:h-9、icon h-4），`ml-auto` 推到 meta 行右侧、`shrink-0` 防被压缩；meta 文本（项目名·最后活动）左侧 `truncate`、pin 右侧 shrink-0 互不挤压。meta 行渲染条件 `hasMetaText` → `hasMetaText || onTogglePin`（无 meta 文本但有 pin 时仍渲染该行承载 pin）。**结构变化**：内容列从「title/subtitle/meta/pin 四行」收敛为「title/subtitle/meta（含 pin）三行」，少一行高度更紧凑。subtitle 行不让位、meta 行内 pin 右侧不撞（ml-auto + shrink-0），title 行仍 `pr-10 touch:pr-12` 恒给 ⋯ 让位。pin 尺寸/⋯ 尺寸/让位几何（续三确立的）均不动，仅 pin 所在行从独立末行并入 meta 行。
- 2026-08-06（续五）：pin 缩小回收 meta 行撑高。用户反馈：续四 pin（h-7=28px）与时间同行后，把 meta 行从纯文字 16px 撑到 28px，卡片比无 pin 卡高 12px——这部分高度是 pin「可点击尺寸」与「同行不浮正文」的物理矛盾，无法靠布局消除，只能放宽约束。决策（AskUserQuestion 三选一）= **缩小 pin**：pin 从 h-7 w-7（28px 桌面）/ touch:h-9 w-9（36px 触摸）缩到 **h-5 w-5（20px 桌面）/ touch:h-7 w-7（28px 触摸）**，icon h-4 → h-3.5。桌面 meta 行只撑高 4px（20 vs 文字 16，几乎与无 pin 卡齐高）；touch 28px 仍撑高 12px 但保触摸区。其余取舍备选：① pin 进 ⋯ 菜单（零高度占用但多一步）；② 维持 h-7/h-9（点击区最佳但 12px 高度差保留）。pin 仍在 meta 行右侧（ml-auto shrink-0），位置/让位几何不动，仅缩尺寸。
- 2026-08-06（续六）：**pin 改 absolute 脱流，meta 行高回到文字决定（彻底回收）**。用户反馈续五仍三问：① 三行间隔不等/凌乱；② 「单独成行」的空间还没回收；③ 最后一行距分割线空旷。诊断（DOM 几何）：gap 恒 4px 相等，但**行高节奏 20/16/20**——title(text-sm=20) 与 meta（被 pin h-5=20 撑高）厚、subtitle(text-xs=16) 薄；续五「回收」其实只从续三 116→88 回收 28px，但 meta 被 pin 撑高 +4px、pin 下方 padding 显空。**决策：pin 用 `absolute right-0 top-1/2 -translate-y-1/2`（垂直居中、最右）从 meta 行 flex 流脱出**，meta 行高回到 text-xs 16px（`min-h-4` 兜底无文本仍承载 pin），pin 上下溢出落 gap-1（4px）与 p-3（12px）空白——**不撑高行**。结果：**三行高 20/16/16 节奏齐（subtitle 与 meta 同高，不凌乱）；有 pin 卡 = 无 pin 卡等高（彻底回收）；底部不再因 pin 撑高显空旷**。水平让位：meta 行 `pr-7`（28px）/`touch:pr-9`（36px）让 meta 文本停在 pin 左侧 8px；subtitle `touch:pr-9`（touch pin 上溢 6px 侵入 subtitle 行底部 2px，桌面 pin 只溢 2px 落 gap-1 内 subtitle 不需让位）。探针断言从「pin 在 meta 行内」改为「pin absolute + 垂直中心对齐 meta + meta 行高 ≤17（不撑高核心）+ pin 不与 meta/subtitle 文字 2D 重叠 + 三行节奏齐」，双视口 ALL PASS。pin 尺寸/⋯ 尺寸/让位几何其余均不动。
- 2026-08-07：置顶数据迁服务端（`state.yaml` overview 模块）。此前 pin 存前端 localStorage（`workbenchPinnedSessionsAtom`），边界是「按会话记忆、跨设备不同步、残留 sessionId 依赖候选匹配」。决策（config 存储层重组 C4）：**pin 从 `workbenchPinnedSessionsAtom`（localStorage）迁服务端**——`state.yaml` `overview.pinnedSessions`（`/api/state/overview/pinned-sessions`，StateStore 模块注册表 `AppModules.overview`；`migrate-legacy-config` 把 settings.yaml v2-with-ui 中间态 `ui.pinnedSessions` 经 `splitLegacySettings` 提取并入 overview 并集（不覆盖既有 pin）+ settings 重写 v3）。前端 `usePinnedSessions`（React Query `["pinned-sessions"]`，staleTime 30s，窗口聚焦 refetch 拉跨设备最新——全局 query-client 默认关 refetchOnWindowFocus，pin 低频且跨设备故此处显式开）+ `usePinSession`/`useUnpinSession`（乐观更新 + onError 回滚 + onSettled invalidate）。**旧 localStorage `workbenchPinnedSessions` 由一次性播种迁移**（`useLegacyPinSeed`：初始 fetch 结算后 `pinSession` POST 各 true 项 → 服务端 addPinned 去重 → 成功删 key；失败保留 key 下次重试；幂等并发安全；2026-08-08 b1313da 补齐）。渲染逻辑零改（`usePinnedSessions` 返回 Set，置顶组/双显/折叠/空隐藏不变）。
- 2026-08-10：分组标题行 bg 多主题收敛 + 列表化收尾。① **bg 从 `surface-raised/30` → `on-surface/10`**——用户反馈「分组标题 bg 不够明显，多主题」。真根因：标题行父容器（左栏 `surface-sidebar` = `surface-raised` 带渐变）底色即 `surface-raised`，旧 `surface-raised/30` bg = 自我叠加，明主题白叠白、暗主题 `#141b28` 叠 `#141b28` 两主题都几乎不可见（非浓度问题，是 token 选错叠加对象）。决策（AskUserQuestion 三选一）= `on-surface/10`：`on-surface` 是主题自适应文字色（明 `#0f1520` 深 / 暗 `#eef4ff` 浅），叠在 surface-raised 底方向正确——明主题加深 / 暗主题加浅，两主题对称 Δ≈22 明显；与 `press-feedback` `active:bg-on-surface/10`、`divide-on-surface/5` 同 token 体系。备选 `/5` 偏弱（Δ≈11 与 hover 同级）、`surface-inset`（暗主题 `#05080d` 近黑过重）均否决。② 收尾本轮其他迭代（已在 §5 主体记录）：去 `rounded-lg` 方角让分组间分割线横跨整行、`touch:size-10`→`touch:h-10` chevron 对齐置顶、列表根 `space-y-2`→`divide-y divide-on-surface/5` 去空隙。置顶组 + 项目组两处标题行容器同改。
- 2026-08-10（续）：分组标题行 Apple 动态圆角（inset grouped 范式）。用户需求：「全部折叠时夹在中间的不必圆角；展开时才需圆角，且要考虑上下」。决策（AskUserQuestion）= Apple 动态圆角：连续折叠标题行组成圆角条带段（段内首尾圆角、中间方角 + 分割线），展开分组脱离成独立圆角块（标题行+卡片一体四角圆），展开块与折叠段间用 `mt-2` 间距断开（分割线不穿过展开块）。判定：每个 section 按自身展开态 + 上下邻居态算 4 角 + 上边界——collapsed 顶圆当 `!prev || prev.expanded`、底圆当 `!next || next.expanded`、中段方角；expanded 恒四角圆。上边界 `prev.collapsed && self.collapsed`→分割线 `border-t`，否则（触及展开块）→`mt-2`；首 section 无。实现：置顶 + 项目 groups 合并成统一 `sections` 列表（`{key, expanded, header, cards}`），map 算邻居 → `cn()` 拼 section 圆角/边界 class；bg 从标题行 div 上移到 section 容器（展开块一体 bg）；列表根去 `divide-y`（分割线改每个 section 条件 `border-t`）。
- 2026-08-10（续二）：section bg `on-surface/10` → `surface-raised`（明亮主题凸起方向修正）。用户反馈：「明亮主题是灰底+更灰分组（凹陷），暗主题接近苹果但明亮不对」。真根因：`on-surface` 是**文字色** token（明深 `#0f1520` / 暗浅 `#eef4ff`），@10% 叠加底色——明主题深色叠加浅底 = 分组**变暗凹陷**、暗主题浅色叠加深底 = 分组**变亮凸起**，**两主题凸起方向翻转**（明暗不对称）。上一条（续）选 `on-surface/10` 是因「两主题对称 Δ≈22 都明显」，但「明显」≠「方向正确」——明亮主题明显地向**凹陷**走。决策 = `surface-raised`（设计系统已有的凸起语义 token，明 `#ffffff` 纯白 / 暗 `#141b28` 亮灰），两主题都比底色（shell `bg-surface/20`：明浅灰蓝≈苹果 `#F2F2F7` / 暗深黑）亮 → 凸起方向统一，对齐苹果 inset-grouped「分组永远比底亮」。底色不动（surface/20 浅灰底已接近苹果灰底，无需调）。`active:bg-on-surface/10` 按压反馈保留（按下反馈语义，非分组凸起）。
- 2026-08-10（续三）：Terminal xterm 外壳随主题（16 ANSI 色 token 化）。用户反馈：「terminal 是黑色主题，不随亮色主题切换」。真根因：`XtermOutput` `new Terminal` 的 theme 对象**硬编码暗色**（foreground `#d6e4f7` + cursor `#7dd3fc` + 16 ANSI 色全暗色调色板），只有 `background: transparent` 随容器（透出 `bg-surface-inset/15`）——亮色下背景已变浅但前景浅字不可读、ANSI 彩色不随主题。决策（用户拍板）：16 ANSI 色**完整跟随**（亮色用深档，彩色在浅底可读）+ **只做 xterm 外壳**（tmux 内程序 vim/htop/prompt 配色由程序自身决定，不在范围）。实现：`index.css` 新增 `--terminal-*` 16 色 token（暗色档 = 原 xterm 硬编码值零回归；亮色档 = Tailwind 深档如 green `#4ade80`→`#16a34a`）；fg ← `--code-text`、cursor ← `--primary`、selectionBackground ← `--primary`@25%、background 保持 transparent；`XtermOutput` 抽 `readTerminalTheme(resolved)` 纯函数（getComputedStyle 读 token 构造 theme）+ `useTerminalTheme` hook，主题切换经 `term.options.theme` 动态更新（xterm 官方 setter 赋值即触发重绘，含 WebGL renderer）。契约见 DESIGN.md「Terminal theme」节。全仓唯一 xterm 实例（claude2 与 terminal 会话共用 `XtermOutput`），改一处全生效。
- 2026-08-10（续四）：terminal background 从 `transparent` 修正为 `--surface-inset` 实色。用户实测反馈：「亮色主题下 terminal 背景还是黑色，但文字变成灰色，很不合理」。**真根因（上一轮「background 保持 transparent」是错误假设）**：xterm 的 `css.toColor("transparent")` 只支持 `#hex`/`rgb()`/`rgba()` 三种格式，`transparent` 走 canvas 解析路径（`ctx.fillStyle=...` → `getImageData`），解析出 alpha=0 ≠ 0xFF **直接 throw** → `parseColor` catch 后返回 `DEFAULT_BACKGROUND` = 纯黑 `#000000`。所以 `background: "transparent"` **从未生效过**——暗色下恰好像「黑色主题」（实际是 DEFAULT_BACKGROUND 纯黑，不是容器色），亮色下就暴露成黑底灰字。**决策**：background ← `--surface-inset`（不透明 `#rrggbb`，亮 `#e2e8f0` / 暗 `#05080d`），DESIGN 已有的 inset 层级语义（终端 = 凹陷面板），暗色贴近之前深色视觉、亮色给明确浅灰面板。**不动容器** `bg-surface-inset/15`（claude2 会话的 runtimeBody 包整个消息线程 + composer，实色化会波及聊天区大范围视觉）；xterm canvas 满铺输出区，实色背景即面板底色。文档同步：DESIGN.md「Terminal theme」节 background 行注明「不能传 transparent」+ 单测 background 断言 + 探针 TOKEN_KEYS 加 `--surface-inset`。
- 2026-08-10（续五）：terminal 亮色背景 `surface-inset`(灰) → `surface`(浅蓝灰) + `bright-blue` 浅档→深档。用户实测反馈：「亮色 bg 灰、文字黑、有些字蓝色不清晰，整体不如暗色和谐」。**真根因**：`--surface-inset` 亮色 `#e2e8f0`(slate-200) 是 DESIGN「凹陷」最深档（code preview 那种），对终端主输出区偏灰——灰底配深字 + 饱和蓝发「脏」、蓝色（`bright-blue` `#3b82f6` blue-500）对比不足发糊。暗色之所以和谐是「近黑底 + 高饱和亮色」强对比（终端传统美学）；亮色要同等和谐须背景足够浅（接近白）+ 深字 + 足够深的彩色（Solarized Light / GitHub Light 等标准配方）。**决策（AskUserQuestion 三选一，用户选浅蓝灰 surface）**：① 亮色 background ← `--surface`(`#f6f8fb`，比 inset 灰底干净，和浅色体系统一)；② `bright-blue` 亮色 `#3b82f6`(blue-500) → `#1d4ed8`(blue-700)——浅底亮蓝对比不足，bright 改深一档（ls 目录/prompt 蓝字清晰），浅色终端通行做法（浅底「更亮的彩色」不可读，bright 只能往深走），仅蓝色特殊（饱和度高 + 人眼对蓝敏感度低，浅底最难读），其余彩色 bright 仍循「浅一档」同构。**暗色零变化**：background 保持 `--surface-inset`(`#05080d`)、`bright-blue` 保持 `#93c5fd`——故 `readTerminalTheme` background 按 resolved 分支取 token（亮 `--surface` / 暗 `--surface-inset`），保证暗色绝对不动。文档同步：DESIGN.md background 行改分主题 token + bright-blue 行 blue-700 + 亮色档语义加 bright-blue 例外说明。
- 2026-08-10（续六）：terminal 亮色启用 `minimumContrastRatio`（256 色/truecolor 可读性兜底）。用户实测反馈：「还有蓝色字是白色描边 + 蓝色填充，看不清；claude CLI 出现的，其他还好」。**真根因（pty 抓 claude TUI raw ANSI 验证）**：claude CLI 用 **256 色**（`\e[38;5;153m` 浅蓝 `#AFD7FF` 选中高亮、`38;5;220` 金标题、`38;5;246` 灰次要），**非 ANSI 16 色**——走 xterm 内置固定 256 色调色板，**不受 `--terminal-*` theme token 控制**（续三/续五改的 ANSI 16 色 token 对它无效，故「还是有些蓝色字」）。浅色（153 浅蓝）在浅底 `#f6f8fb` 上对比度极低（~1.3），字芯淡、抗锯齿边缘融入浅底显「白色描边」/发糊；暗底上高对比清晰（故暗色和谐、「其他还好」指普通 ls ANSI 蓝目录字没事）。**决策**：设 xterm `minimumContrastRatio`（typings:207 确认）——**亮色 `4.5`（WCAG AA，启用）/ 暗色 `1`（默认，关闭，零变化）**，随 `resolved` 动态切。xterm 自动给低于阈值的彩色加深前景至达标（claude 浅蓝 → 可读深蓝），暗色完全不启用保证不动。效果**全局**（亮色下所有低对比彩色——claude 的蓝/金/灰、及其他程序浅色——都会提对比，整体更和谐，对应用户「整体不如暗色和谐」诉求），非只 153。**实现**：`useTerminalTheme` 扩展设 `term.options.minimumContrastRatio`（常量 `MINIMUM_CONTRAST_RATIO_LIGHT = 4.5`）+ `new Terminal` 初始值随 `resolvedRef`。无 token / CSS 改动（options 级）。仅实时流可见效果交真机确认。
- 2026-08-10（续七，**已否决回退**）：terminal 亮色 256 色源头精准映射 Solarized Light（`extendedAnsi`）。用户问「256 色没有原生方案可以做到吗」——调研发现 xterm.js 有公开 API `ITheme.extendedAnsi?: string[]`（typings:415「ANSI extended colors (16-255)」），`ThemeService._setTheme`（ThemeService.ts:129-134）按下标 `i` 写入 `colors.ansi[i+16]`，`parseColor("")` 抛错走 fallback 保留默认（**空串 = 保留默认**，契合稀疏覆盖）。续六 `#AFD7FF` 误记修正：`38;5;153` 实为 `rgb(135,215,255)=#87D7FF`（xterm 256 cube 值 `[0,95,135,175,215,255]`，153=216-cube 第 (2,4,5) 档 → 135/215/255）。用户拍板精准映射 3 索引到 Solarized Light：`153`→blue `#268bd2`、`220`→yellow `#b58900`、`246`→base01 `#586e75`，仅亮色挂、暗色 undefined 零变化。**用户实测「整体字迹不清楚」→ 回退**。**真根因（WCAG 对比度验证）**：Solarized Light 强调色是为它自己的暖米黄底 `#fdf6e3` 设计的——blue 在该底 4.6:1、yellow 4.7:1（暖底对蓝/黄有加成刚好达标）；挪到我们冷蓝灰底 `#f6f8fb` 后 blue 仅 **3.46:1**、yellow **3.02:1**，均低于 WCAG AA 4.5；换纯白底也救不了（blue 在 `#ffffff` 仍 4.0:1）。**教训：Solarized 强调色只有配 Solarized 底才成立，不能只拿强调色不拿底**。且源头替换后 xterm 用新色算对比度，`minimumContrastRatio` 仍加深这些已不达标色，比续六直接加深原浅蓝更糟。结论：回退到续六 `minimumContrastRatio` 兜底（算法对任意底自适应保证 4.5），不映射 256 色。若要进一步改善浅色和谐度，方向是浅色底换近白（牵动整个浅色 token 体系 `--surface`/`--bg-base`/`--surface-inset`，影响远超终端，需单独立项）。
- 2026-08-10（续八，**试错未保留**）：terminal 亮色背景改纯白 `#ffffff` 试效果（不动 app `--surface` token，只终端 xterm background 硬编码）。用户反馈「没有变好」→ 回退（未 commit）。此轮单独改白底无改善，因为当时字重还是 400（笔画细），白底反而对比更显不足。**真正解法需先解决字重（续九）**。
- 2026-08-10（续九，**浅色终端字迹不清真根因 = 字重，最终方案**）：用户对比续六续七后反馈「字迹不清楚，区别不大」，关键观察「**加粗的清晰、普通 fg 不行**」。**溯源 xterm 源码 + pty 抓 claude raw ANSI**：claude 普通文本用 `\e[39m`（default fg = `#1e293b`，对比度 13.75 本该非常清晰），加粗用 `\e[1m`（同色，字重 700）——颜色对比度完全一样，唯一区别是字重。`new Terminal` 默认 `fontWeight: normal`(400)，在 12px + WebGL + 浅底上笔画偏细 → 普通文本「不清楚」；700 笔画厚 → 加粗清晰。**这是字体渲染粗细问题，不是颜色问题**——续六 minimumContrastRatio / 续七 Solarized / 续八纯白底全在调颜色，方向都错了，故无改善。**真根因实测验证**：xterm `reduceLuminance`（Color.ts:315-333）朴素算法各通道均减 10%，把 claude 鲜艳 256 色推成暗沉灰蓝（`#87D7FF`→`#467086` cr=5.03、`#ffd700`→`#867000` cr=4.56、`#949494`→`#6b6b6b` cr=5.01）——失色相变灰蒙，这是续六「整体不清楚」的另一根因（续六续七都暗故区别不大）。**最终方案（用户认可）**：① `new Terminal({ fontWeight: 500 })`——非加粗从 400 提到 500，笔画厚起来又不至于像 bold，用户实测「清晰的非常明显」；② 亮色 background 改纯白 `#ffffff`（字重解决后白底最干净、256 色/truecolor 对比度最高，配合字重整体和谐）；③ `minimumContrastRatio` 亮暗都 `1`（关掉，让原色鲜艳呈现，不再算法暗化）。暗色零变化（仍 `--surface-inset` `#05080d` + 字重 500 同步受益）。文档同步：DESIGN.md background 行改 `#ffffff` + 追加 `fontWeight` 段落 + 修正续六 minimumContrastRatio 段落为「已否决」。
- 2026-08-10（续十，**桌面端字迹模糊真根因 = 非整数 DPR 下 WebGL 纹理采样**）：续九解决字重后用户发现残留——**移动端清晰、桌面端仍字迹模糊**，明确不是主题选项造成（字重/底色/对比度都不分桌面/移动）。用户实测关键判别：移动端**亮色主题**也清晰 → 排除颜色明度关系为主因。**真根因**：xterm WebGL 渲染器把字形烘焙成图集（`fontSize × devicePixelRatio`，`TextureAtlas.ts`），渲染到屏幕时缩放——整数 DPR（移动端 2/3）整数倍缩放、每像素精确映射 → 锐利；非整数 DPR（桌面端 1.5，Windows/Mac UI 缩放常见）1.5 倍线性采样、字形边缘亚像素落在像素边界半亮半暗 → 发虚发灰。暗色主题因深底浅边的视觉特性不明显，但同样存在（用户「暗色没这种问题」是视觉掩盖，非机制不同）。社区印证：MDN WebGL best practices 明确「non-integer devicePixelRatio… causes moire artifacts」（Windows UI 缩放常见），VS Code terminal 同源问题。**方案（用户拍板）**：仅整数 DPR 加载 `WebglAddon`（`if (Number.isInteger(window.devicePixelRatio))`），非整数 DPR 跳过 → xterm 自动回退内置 `DomRenderer`（`CoreBrowserTerminal.ts:584`，浏览器原生字体抗锯齿，任意 DPR 清晰，**零新依赖**）。**不引入 `@xterm/addon-canvas`**（移动端 WebGL 已够用，不为桌面端加新依赖）。判据用 DPR 整数性而非 `isDesktop`——iPad 横屏宽屏 DPR=2 仍享 WebGL。移动端 WebGL 路径完全不动（整数 DPR = 原逻辑 + 整数性守卫）。**不动态切渲染器**：DPR 变化（拖窗到不同显示器、改系统缩放）低频，动态切需销毁重建 terminal（丢 scrollback/重连 WS），代价远大于收益；terminal 创建时读一次 DPR 定渲染器，DPR 变后最坏回到「未优化状态」而非崩溃。**另**：本轮顺带把工作区一度重开的 `minimumContrastRatio`（light=4.5 对比用）回退到续九基线（both=1，关闭）——用户确认「区别不大」，字重已解决清晰度，对比度兜底不再需要且会钝化鲜艳 256 色。文档同步：DESIGN.md 追加「渲染器按 DPR 整数性分流」段落。
- 2026-08-10（续十一，**亮色终端收尾：删 fontWeight + 蓝色 153 精准映射**）：续十 DOM 渲染器根治桌面模糊后用户确认「果然非常清晰」，带出两个收尾点。**① 删 `fontWeight: 500`**：续九加 500 是 WebGL 模糊下的笔画缓解；续十把桌面切 DOM 渲染器（原生字体抗锯齿）、移动 WebGL 整数 DPR 本就不模糊——两种渲染器都不模糊，500 失去存在理由，回到 xterm 默认 `normal`(400)。**② 蓝色对比不明显**：用户实测「移动端和桌面端的亮色主题下都不太明显」→ 排除渲染器（两端都模糊=与续十分流无关），纯色问题。pty 抓 claude raw ANSI 确认唯一蓝色码 = `38;5;153`（xterm 256 cube 浅蓝，白底对比度 **1.50** 几乎看不见）；纠正续七 changelog 误记——153 实为 `#afd7ff`（cube `v[3],v[4],v[5]`=`0xaf,0xd7,0xff`），非 `#87d7ff`（那是索引 117）。**方案（用户拍板 extendedAnsi 精准映射）**：仅亮色挂 `ITheme.extendedAnsi`，稀疏数组 `[153-16=137]="#1d4ed8"`（blue-700 = `--terminal-bright-blue` token 值，白底 **6.70** 达 WCAG AA），其余空串 → `parseColor` 空串 fallback `DEFAULT_ANSI_COLORS` 保留原色（`ThemeService._setTheme` L129-134）。暗色不挂（`#afd7ff` 深底高对比零变化）。**反转续七否决**：续七否决时字重 400（续九根因未发现），用户把所有不清归到颜色，extendedAnsi 被误判；续九+续十解决清晰度后能真实生效；且续七 Solarized blue `#268bd2` 白底仅 4.0 不达标，本次 `#1d4ed8` 6.70 达标。**只动 153 蓝色**，金色 `220`（白底 1.40）/ 灰色 `246` 保持原色鲜艳（用户只提蓝色；不走 minimumContrastRatio 全局兜底，避免钝化金色 + 反转续九关闭）。文档同步：DESIGN.md extendedAnsi 段从「已否决续七」改为「续十一启用」+ fontWeight 段追加续十一删除说明。
- 2026-08-10（续十二，**亮色终端 bg 恢复 + claude 256 色全面可读化**）：用户要求 ① 金色 220 也改 ② bg 恢复续九改纯白前的 `--surface` `#f6f8fb`（续九改纯白是为衬托字重清晰度，续十 DOM 渲染器根治模糊 + 续十一删字重后纯白衬托不再需要）③「多检查对比度不太对的都可以改」。**全面 pty 抓 claude 启动+对话 raw ANSI（交互式发 prompt 触发对话输出，捕获 13907 bytes）**，列出所有不达标前景 256 色（`#f6f8fb` 底对比度 < 4.5）：`174` `#d78787` 边框线（84 次主用，2.56）、`246` `#949494` 次要灰（63 次，2.85）、`244` `#808080` 灰（20 次，3.71）、`216` `#ffaf87` 浅橙（20 次，1.68）、`220` `#ffd700` 金（14 次，1.32）、`153` `#afd7ff` 蓝（2 次，1.41，续十一已做）、`114` `#87d787` 浅绿（1 次，1.63）、`248` `#a8a8a8`/`247` `#9e9e9e` 浅灰（各 1 次）。**完整 9 色映射表**（均达 WCAG AA）：153→`#1d4ed8`(6.30)、220→`#a16207`(4.63)、174→`#be123c` rose-700(5.91，暖色系保留)、216→`#b45309` amber-700(4.72)、114→`#15803d` green-700(4.71)、246→`#6b7280` gray-500(4.54)、244→`#4b5563` gray-600(7.10，保留比 246 更深层次)、248/247→`#6b7280`(4.54)。**231 `#ffffff` 白字不映射**：SGM 上下文分析确认它主用是反色块前景（配 `48;5;237` 深灰底白字，如标题栏，本就清晰），extendedAnsi 全局替换无法只改浅底那次（浅底仅 1 次 spinner 瞬态）——映射会让深底白字变深字反而不可见，顾此失彼。另发现 **ANSI 16 色 token 在 `#f6f8fb` 底也大面积不达标**（green 3.10/yellow 2.76/cyan 3.46/bright-green 2.14 等），但那是 ls/git 等所有程序用的颜色（改影响面大）且 claude CLI 抓包确认**只用 256 色不用 ANSI 16 色**，故本轮聚焦 claude 256 色，ANSI 16 色留待单独立项。bg 恢复 `v("--surface")` 后底色变深一档，蓝色 `#1d4ed8` 在 `#f6f8fb` 底对比度从 6.70→6.30 仍达标。文档同步：DESIGN.md extendedAnsi 段扩为完整 9 色表 + bg 行恢复 `--surface` + fontWeight 段「纯白底」措辞改「浅蓝灰底」。
