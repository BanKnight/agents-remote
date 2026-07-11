# 全局活动栏重设计（VSCode 式一级导航）

> **状态：协商中（WIP）**。本文档是「桌面端 + 移动端布局大优化」长任务的持久化设计基线，随协商持续更新，防止上下文压缩丢失决策细节。
>
> **关系**：这是 [`workbench-redesign.md`](./workbench-redesign.md) / [`workbench-views.md`](./workbench-views.md)（当前三栏工作台 + 中栏左右结构）的**外层进一步演进**——引入「一级导航（Activity Bar）」并重新分配左/中栏语义。协商定稿、现状盘点前不视为取代上述文档。

## 1. 背景与目标

- **现状**：桌面端 `WorkbenchShell` 三栏（左=项目列表+实例树 / 中=`InstanceArea` group+tab / 右=inspection）；一级导航概念散落（左栏项目段、中栏 overview/history/files/git 二级 tab、独立 Settings 路由）；移动端 `HomeRoute` + SessionDetail + 底部导航。
- **目标**：参考 VSCode，桌面端引入「竖行活动栏（一级导航）+ 左栏 + 中栏」，移动端对应「底部胶囊一级导航」。两端信息架构一一对应，仅呈现不同。
- **一级导航三选**：项目 / 文件 / 设置。

## 2. 协商记录（决策日志）

> 按时间倒序追加；每条标注「已定 / 待定」。这是防上下文丢失的核心章节。

- **2026-07-10 协商第 1 轮**：
  - **已定**：大方向（VSCode 式活动栏 + 两端对应）；一级导航 = 项目/文件/设置；删除当前项目列表（两端）；[项目]=全局总览内容&排版（卡片+多视图）+ 新建/进入项目；右栏本轮不动（当不存在）；一级导航常驻（进入项目后也在）；[设置]=当前 SettingsRoute；[文件]=树在左栏+预览在中栏 tab；移动端进入项目后返回按钮+底部胶囊保留。
  - **待定**：中栏语义（主确认点）、git 归属、移动端[文件]单列布局。
  - **元指令**：长任务必须文档化（即本文档），防上下文压缩丢失。
- **2026-07-10 协商第 1.5 轮（主确认点 resolved）**：全局总览当前就在 `InstanceArea` 中栏**左侧**（workbench-views 的左总览区，窄单列卡片），事实已证明可承载。故新「左栏」= 该左总览区提升为顶层栏（窄单列，随导航切换内容），新「中栏」= 原右工作区 group+tab（常驻不随导航变）。原 `left-rail` 删除/改造。**主确认点关闭**，不必再纠结"总览塞不进左栏"。
- **2026-07-10 协商第 2 轮**：①『左栏』= `InstanceArea` 左总览区——本就是这一列（用户一贯称『左栏』），**非新增列、非"提升"**；切活动栏只换左栏，中栏(右工作区 group+tab)不变。此前文档"提升"措辞把简单事说复杂，已订正。（注：「非提升」指 DOM 列——左栏=现有 `leftPanel` 那列非新增；实现层 state 提升见第 5 轮方案 X。）② **git 归属**：不在全局 [文件] 导航；在**进入项目后**出现（project-scoped）。③ **进入项目后左栏顶部多导航**：左栏顶部出现 tab 组（如目前移动端做法），切换左栏内容；git 为其一，具体清单待盘点移动端现状。
- **2026-07-10 协商第 3 轮（3 待定点 resolved）**：① 进入项目后左栏顶部多导航 = **实例 / 历史 / 文件 / git**（= 现状 `WorkbenchMiddleTab` overview/history/files/git，复用现状）。② 移动端 [文件] = **文件树全屏 + 预览浮窗**，保持现状移动端 Files 做法不变。③ [设置] = **特例**，不套「活动栏切左栏」模型，点击沿用现有 `SettingsRoute` 设置页（桌面端左栏/中栏不切换）。**结构语义至此完整，无剩余结构待定点。**
- **2026-07-10 协商第 4 轮（plan 4 决策点 resolved）**：① 活动栏 nav 存 `workbenchNavAtom`（localStorage，不进 URL）。② 活动栏 = WorkbenchShell 新增第 0 列（四栏）。③ [文件] 预览并入 WorkbenchLayoutV3（与实例 tab 共享 group+tab）。④ [设置] = 跳转 SettingsRoute（离开工作台）。**plan 全部决策点敲定，可进入实现。**
- **2026-07-10 协商第 5 轮（Phase 2a 实现方案锁定）**：① **方案 X（拆 `InstanceArea`，严格四栏）**——布局上「左栏」= WorkbenchShell 原有 `leftPanel`（DOM 四栏第 1 列，Phase 1 已建，**非新增列**）；功能上承载 `InstanceArea` 内部已有的左总览。落地：拆 `InstanceArea` 为三部分——左总览提取为 `InstanceLeftOverview` 组件放入 `leftPanel`，右工作区 group+tab 瘦身 `InstanceArea` 留中栏 children，共享 state（layout/drag 三件套/focus+prune effects/candidates/create/close/rename/contextMenu）**提升到 `WorkbenchContent`**（不新建 hook——overview/workspace 互补消费非复用，WorkbenchContent 已是薄壳持共享 state 模式）。② **Phase 2 拆 2a/2b**：2a=[项目] 方案 X 核心；2b=[文件]（决策③ V3 多态 tab，session-centric 改造成本中高，放 2b）。③ **宽度归并**：leftPanel 用 `workbenchMiddleLeftWidthAtom`(16rem)，废弃 `workbenchLeftWidthAtom` + localStorage 一次性迁移。④ **leftPanel 恒显总览、忽略中栏 tab**（tab bar 中栏顶部位置留 Phase 3）。
- **2026-07-10 协商第 6 轮（Phase 2b 实现方案锁定）**：① **V3 多态 tab**——`WorkbenchPanelRef` 扩为判别联合 `{kind:"session",projectName,sessionId} | {kind:"file",projectName,path}`；session tab 的 tabId === sessionId（值不变）→ localStorage 布局零迁移、session 路径零回归；file tab 前缀 `file_` 与 `agent_/terminal_` 天然互斥。② **file tab 可编辑+保存**（不只读）——复用 FilesPanel 的 CodeEditor + saveFileContent + dirty/save；新 `FilePreviewPanel`（queryScope 隔离 `file-nav`）独立承载，FilesPanel inspection 路径不动（避免抽顶层 state 大重构）。③ **file tab focus 独立路由**——新增 `/projects/$key/file/$`（splat 捕获多段 path），不复用 `/session/$id` 段。④ **移动端遇 `/file/$path` → 浮窗降级**（不实现移动端 V3 group，符合决策 12）。
- **2026-07-10 协商第 7 轮（Phase 4 移动端方案锁定）**：① **底部胶囊 项目/文件/设置**——删原「全局」项（曾指 `/global` 旧全局实例语义），加「文件」项（→`/files` rootBrowse 浮窗）；[项目] 胶囊 active = `/` 或 `/projects*`。② **`/global` 重命名 `/projects`**——`/global` 现语义=项目总览（[项目] 导航），重命名非真删；scope kind `global` 类型保留，只改 URL path 段；两端 `/` 统一为 global scope = [项目] 总览。③ **删 HomeRoute**——项目列表/新建/进入/删除能力并入 [项目] 总览（grouped 分组进项目 + header 新建 + ⋯ 删除）。④ **[项目] 总览 = 实例聚合 + 项目入口**——重构 MobileGlobalOverview：header 新建 + grouped 分组标题点击进项目 + 分组标题右侧 ⋯ 删除项目（本 phase 加，复用 deleteProject + useConfirm）+ ViewSwitcher；删 inspection tab 行。⑤ **移动 [文件] = rootBrowse 根目录浏览**——新 `/files` 路由移动端渲染 rootBrowse FilesPanel 浮窗（不依赖先进项目，全局一级导航）；桌面 `/files` redirect `/`（桌面 [文件] 经活动栏）。⑥ **活动栏 [文件]（全局）与项目态左栏 [文件] 作用域互斥**——前者全局一级导航（rootBrowse 根目录），后者进入具体项目后出现（实例/历史/文件/git），不冲突。
- **2026-07-11 协商第 10 轮（UI polish 批 E，桌面/移动统一）**：① **新建项目按钮对齐 CreateSessionBar**——两端（桌面 `InstanceLeftOverview` header + 移动 `MobileGlobalOverview` ViewSwitcher 行）从圆形 `h-8 w-8` 渐变 `+` 改为 `actionButtonClasses({ tone: "accent" })` pill 文案按钮（与新建会话同款 token：`rounded-xl border px-3 py-1.5 text-xs font-bold` + `from-primary to-secondary` 渐变），可见文案 `workbench.createMenu`（"+ 新建"/"+ Create"），仍是单按钮直开 `ProjectSetupPanel` Dialog（非 dropdown，无 chevron）。② **移动 grouped 与桌面同规则含空项目**——`MobileGlobalOverview` 从 `groupByProject(candidates)` 改为 `mergeProjectsWithCandidates(projectNames, candidates)` + `listProjects`（与桌面 `GroupedView` 同源、React Query dedupe）；空项目组显 `workbench.groupedProjectEmpty`；empty gate 不再仅靠 `candidates.length === 0` 整页空态（有项目无实例时 grouped 仍列空项目）。
- **2026-07-11 协商第 11 轮（批 F，[项目] 总览共享 + 空项目默认折叠）**：① **global [项目] 桌面/移动单一实现**——抽取 `GlobalProjectsOverview`（`global-projects-overview.tsx`），两端 [项目] 导航只剩薄壳（桌面 = WorkbenchShell `leftPanelTitle` + 共享主体；移动 = `MobilePageHeader` + 共享主体）。结束「批 D/E 各自改各自」的双写模式。② **空项目默认折叠**——`workbenchGroupedCollapsedAtom`（有实例：list 含名=折叠）+ `workbenchGroupedExpandedEmptyAtom`（空项目：list 含名=用户展开；默认折叠）；`isGroupedProjectCollapsed` 唯一判定；两端 grouped 共用 `GroupedProjectsList`。③ **参数化差异仅** `dragAdapter?`（桌面拖放）/ `onFocusInstance` / `contentClassName?`（移动 pb-24）。④ **project scope 不动**——`InstanceLeftOverview` 收窄为 project-only（CreateSessionBar + 本项目实例）；`MobileProjectOverview` 不动。
- **2026-07-11 协商第 12 轮（批 G，项目行苹果双件套）**：① **根因诊断**——项目名行「承载太多功能、易误触」不在语义（箭头折叠、名字进项目本就正确），在实现：折叠做成「和名字平等的 `h-7` 方块」而非「附属控件」，且 `gap-1`(4px) 触区粘连。② **苹果双件套心智**——对齐 Finder/Files：项目=文件夹、实例=子项，折叠箭头=独立控件展开子树，行主体单击=进入项目；桌面（Finder/Explorer）移动（Files）通用。③ **决策 30 方案锁定**——折叠 = 行左侧**次级附属控件**（视觉小三角 + `text-on-surface-muted` + 左领地 `-ml-1`，非等大方块）；行主体（名字 flex-1）单击进项目；⋯ = 唯一右侧删除控件（D2 两端一致保留行尾）；`gap-1`→`gap-2`(8px) 物理分离；折叠/⋯ 触区 `size-9`(≥36px)。**结构不变**：三个独立 button，无嵌套无 stopPropagation（避 portal/fiber 合成冒泡）。
- **2026-07-11 协商第 13 轮（批 H，折叠下沉实例区小标题）**：① **根因再诊断**——批 G 苹果双件套虽物理分离了折叠/进入触区，但「进入项目」与「折叠」仍同处项目名行、同为单击手势，操作区紧邻仍易误触；用户反馈「进入与折叠有冲突」。进一步：进入是基本操作（空/非空项目都要能进，语义独立于实例存在），折叠管的是实例列表——两者本属不同交互面，强行挤在同一标题行是冲突根源。② **决策 31 方案锁定（跳出标题行框架）**——折叠**离开项目名行**，下沉到实例区自己的小标题：项目名行只留 `[项目名(单击进项目)][⋯ 删除]`（单一主操作进入）；实例区（N>0）新增 `▼/▶ N 实例` 小标题 button（点=折叠/展开卡片网格），折叠态隐藏 InstanceGrid 但保留 `▶ N 实例` 小标题（展开入口不丢）。③ **进入语义独立于实例**——空项目无实例区小标题、无折叠（没东西可折），但仍可点项目名行进入项目（语义正确：进入不依赖实例存在）。④ **三操作三交互面自然察觉**——项目名行(进入,大区域 hover 高亮) / 实例区小标题(折叠,带箭头次级色) / ⋯(删除,行尾小控件)，形态区域各异一眼分辨。⑤ **批 F 双名单简化为单名单**——空项目不再折叠（无小标题即无折叠控件），删 `workbenchGroupedExpandedEmptyAtom`；`isGroupedProjectCollapsed` 简化为单 `collapsed` 名单判定。⑥ 结构仍无嵌套无 stopPropagation（避 portal/fiber 合成冒泡）。
- **2026-07-11 协商第 14 轮（批 K，grouped 名行间距 + chevron 暗淡）**：① **chevron 暗淡**——`text-on-surface-muted`(#8d99aa)→`text-on-surface-muted/60`（L299，只 › 箭头不动 project 图标 L293；对齐 Apple disclosure indicator 最弱视觉层级，DESIGN L424 placeholder `on-surface-muted/60` 先例）。② **名行 py 收紧**——`px-2 py-1.5`→`px-2 pb-1`（L286；pt→0 收组间到 24px，pb 6→4px 收名称↔列表）。③ **根因**：`InstancePagedCarousel`/`InstanceGrid` 容器零垂直 padding，垂直 gap 唯一来源即名行 py；点②③同根，`space-y-6`(24px=1.5em)本身没错，组间"过多"是名行 pt-1.5(6px) 叠加让视觉 ~30px。`space-y-6` 保持。
- **2026-07-11 协商第 9 轮（UI polish 批 D）**：① **GroupedView 项目行操作分级 A+C**——`[折叠 gutter h-7][项目名 flex-1 进项目][⋯ ActionMenu → 删除]`；折叠独立增大触摸区，删除从常驻 🗑 收进 ⋯ 菜单（destructive），对齐移动 `ProjectGroupHeader` 防误触。② **左栏统一大标题层**——`WorkbenchShell` 左 `PanelHeader` 加可选 `title`（`h-11` + `text-base font-semibold`，对齐 `MobilePageHeader`），`WorkbenchContent` 按 nav 注入 `t("nav.projects")` / `t("nav.files")`；右栏保持收起-only。③ **新建项目按钮位置统一**——移动新建从 `MobilePageHeader` actions 移到 ViewSwitcher 行左侧，与桌面 `InstanceLeftOverview` header 左对齐一致（样式在第 10 轮批 E 再对齐 CreateSessionBar）。


## 3. 一级导航（两端共享语义）

| 导航 | 桌面端呈现 | 移动端呈现 | 语义 |
|---|---|---|---|
| 项目 | 竖行工具条（活动栏） | 底部胶囊 | = 全局总览（卡片+多视图+新建/进入项目） |
| 文件 | 竖行工具条 | 底部胶囊 | 文件树（左栏）+ 预览（中栏 tab） |
| 设置 | 竖行工具条 | 底部胶囊 | = 当前 SettingsRoute |

## 4. 桌面端

### 4.1 统一框架

> **栏语义（钉死，结构层——不依赖现状定义）**：
> - **活动栏**（竖工具条）：一级导航 项目/文件/设置。切换 = 切换**左栏内容**。
> - **左栏**：随一级导航切换内容的列。
> - **中栏**：group+tab 工作区，**常驻不随导航变**（VSCode 式）。
> - **右栏**：本轮不动。
> - **进入项目后**：左栏顶部出现多导航 tab（切换左栏子内容），git 在此出现。

```
┌──────┬──────────────────┬─────────────────────────────┬──────┐
│ 活动  │      左栏         │           中栏               │ 右栏  │
│ 栏    │ (随导航切换内容)   │   group+tab 工作区（常驻）    │(不动)│
│(竖工具)│  全局态:          │   不随一级导航变化            │      │
│ ▣项目 │   [项目]总览      │   [文件]点文件→新开预览 tab   │      │
│ ▤文件 │   [文件]文件树    │                              │      │
│ ⚙设置 │   [设置]设置      │                              │      │
│      │  项目态: 顶部      │                              │      │
│      │   多导航+子内容    │                              │      │
└──────┴──────────────────┴─────────────────────────────┴──────┘
 一级导航常驻——进入项目后也还在
```

> **现状如何对应（落地辅助，见 §8，不反推结构）**：现状 `InstanceArea` 中栏天然是「左总览 + 右工作区」——左总览承担新「左栏」，右工作区 group+tab 承担新「中栏」。活动栏是**新增**外层。原 `left-rail` 项目列表删除（已定），其职责按导航项归位。

### 4.2 左栏随导航切换内容；中栏 group+tab 常驻不随导航变

```
全局层（未进入项目）：
  [项目]  左栏 = 全局总览（卡片 + grouped/grid/table 多视图 + 新建项目 + 进入项目）
  [文件]  左栏 = 文件树（全局 rootBrowse，PROJECTS_ROOT 根目录；= 活动栏 [文件] 语义）
          ‖  中栏 = 点文件新开预览 tab（V3 多态 tab，见决策 18；可编辑+保存，✕ 仅移 tab 不 kill，刷新保留）
  [设置]  特例：不套「切左栏」模型，点击沿用现有 SettingsRoute 设置页（左栏/中栏不切换）

  （中栏始终 = group+tab 工作区，常驻不随导航变）

进入项目层（project scope，一级导航常驻）：
  左栏顶部多导航 tab（如目前移动端）= 实例 / 历史 / 文件 / git
    （= 现状 WorkbenchMiddleTab overview/history/files/git，复用现状）
    → 切换的是**左栏主体**内容（实例=InstanceLeftOverview / 历史=HistoryList /
       文件=项目内文件树 FilesLeftPanel scope=project / git=GitDiffPanel），**非中栏**
    → middle tab [文件] = 项目局部文件树；活动栏 [文件] = 全局 rootBrowse，作用域不同不冲突
    → git 在此出现（project-scoped，已定）
  中栏 = 项目实例 group+tab（常驻，**不随 middle tab 变**；Phase 3 InstanceArea 瘦身为纯 group+tab）
  右栏 = inspection（本轮不动）
```

### 4.3 进入项目后（要点）

- 一级导航常驻；scope global → project。
- 左栏顶部多导航 tab（见 §4.2 进入项目层），git 在此出现（project-scoped）。
- 中栏 group+tab、右栏 inspection 与现状一致（本轮不动）。

## 5. 移动端

```
全局层：内容区 + 底部胶囊 [项目][文件][设置]
  [项目] → 共享 `GlobalProjectsOverview`（批 F / 决策 29；桌面左栏同组件）
           header：新建项目 accent pill（workbench.createMenu）+ ViewSwitcher
           grouped：`GroupedProjectsList` 批 J（决策 33，取代 31/32）+ 批 L（决策 35 共享背景成组）——mergeProjectsWithCandidates 含空项目；
             项目名行 = [📁 project 图标 size-5 + 项目名 text-base(16px headline-sm) font-semibold + › chevron size-5 整体一个 button 进项目（热区 min-h-11 ≥44px）][⋯ 删除 最右尽头]；
             实例区 = `InstancePagedCarousel`（每页最多 3 卡横向 swipe 翻页，snap-start 双侧 peek——首尾各 `w-5` spacer + `scroll-px-5`，左右各露 20px 邻页（page2 见 page1 / page1 见 page2），批 P / 决策 39 反转批 M 单向 peek；peek 12→20 批 P 收尾 / 决策 41（用户指去边框后 peek 露空白看不到内容）；末页 spacer 同 `w-5` 让末页 snap 贴左对齐，批 N / 决策 37；桌面 `lg:w-full` 满宽无 peek + 页码行 ‹1·2·3›）；**移动端 Apple 列表范式**（批 O / 决策 38）：section 无边框 + InstanceCard plain 无 hover（`lg:hover:bg-on-surface/5`）+ 分割线 inset（InstanceCard `topSeparator` `left-15`=60px 内容区左 / `lg:left-0` 全宽），桌面保持边框+全宽分割线+hover；**无折叠**（实例恒定展示）；**名行操作区对齐**（批 P / 决策 39 + 收尾 / 决策 40/41/43）：peek 20px 把卡片右移，名行 `pl-5 pr-7 lg:pl-2 lg:pr-2` + 进项目 button `px-0 lg:px-1`（决策 43：移动 pl=peek=20 让 button.left=card.left=Apple full-bleed header 对齐 cell 左边缘、button 去px 让图标=card 边缘；pr=peek+8=28 对齐 card action；桌面 lg:pl-2+lg:px-1 保 marker↔icon）——⋯ 删除与卡片 ⋯ action **同尺寸同图标同列**（均 `h-7 w-7 max-sm:h-10 max-sm:w-10` + `ShellIcon ellipsis h-4 w-4`，section-right−28px、图标中心严格对齐，决策 40）；**决策 35 marker↔icon 内容对齐在去边框+满宽后转 Apple full-bleed 边缘对齐**（移动 nameRow 内容=card 边缘 20 非 marker 32），桌面 `lg:pl-2 lg:pr-2` 零回归；
             section = `overflow-hidden lg:rounded-lg lg:border lg:border-neutral-line/40` 圆角边框成组（**移动无边框**——Apple 列表范式，批 O / 决策 38；桌面 border-neutral-line/40 半透明淡边——对齐同框 InstanceGrid 分割线，Apple hairline，批 M / 决策 36；名行=header + 实例区=body 同一边框内；实例区 `-mt-2` 抵消首卡 p-3 收间距，批 L）；根 `px-0 py-3 lg:px-3`（批 P 收尾 / 决策 42：移动去 px 让 section 贴屏幕、card 距两侧 = peek(20) 单一留白非 px-3+peek 双重叠加；桌面 lg:px-3 保持边框时代内边距；py-3 顶底不动）；
             section 间 space-y-3(12px)（背景成组靠色差分组，不需明显距离）；**空项目只名行**（与有实例项目结构对称：都一行 header）
           grid/table：跨项目实例聚合；点实例进聚焦
  [文件] → 文件树全屏 + 预览浮窗（rootBrowse 根目录浏览，= 现状移动端 Files 做法，决策 12）
  [设置] → 设置页（沿用现状）
进入项目后：项目实例工作台（与现一致）+ 返回按钮，底部胶囊保留（已定）
```

> **底部胶囊 3 项 = 项目/文件/设置**（删原「全局」项，加「文件」项）。「全局」项曾指向
> `/global`（旧全局实例语义），现 `/global` 重命名为 `/projects`（项目总览语义），全局实例
> 聚合即 [项目] 总览内容，胶囊不再单列「全局」项。详见 §6 决策 22-25。

## 6. 已定决策

1. 删除当前项目列表（桌面端 `left-rail` 项目段 + 移动端项目列表）。
2. [项目] 导航 = 当前全局总览内容&排版（卡片 + grouped/grid/table 多视图）+ 新建项目 + 进入项目。
3. 一级导航（项目/文件/设置）常驻，进入项目后也在。
4. 右栏本轮不动（设计时当不存在）。
5. [设置] = 当前 SettingsRoute 内容。
6. [文件]：文件树在左栏，预览在中栏新开 tab（VSCode Explorer+Editor 模型）。
7. 移动端进入项目后沿用现有返回按钮；底部胶囊保留。
8. **栏模型（结构语义）**：活动栏（项目/文件/设置）切左栏；中栏 group+tab 常驻不随导航变；右栏不动。（现状对应见 §8：`InstanceArea` 左总览→左栏，右工作区→中栏。）
9. **git 归属**：不在全局 [文件] 导航；在**进入项目后**出现（project-scoped）。
10. **进入项目后左栏顶部多导航**：左栏顶部 tab 组（如目前移动端），切换左栏内容；git 为其一。
11. **进入项目后左栏多导航清单**：实例 / 历史 / 文件 / git（= 现状 `WorkbenchMiddleTab` overview/history/files/git，复用现状）。
12. **移动端 [文件]**：文件树全屏 + 预览浮窗，保持现状移动端 Files 做法不变。
13. **[设置] 特例**：不套「活动栏切左栏」模型，点击沿用现有 `SettingsRoute` 设置页，左栏/中栏不切换（桌面端）。
14. **活动栏 nav 存储**：`workbenchNavAtom`（localStorage 记忆，不进 URL）。
15. **活动栏落位**：WorkbenchShell 新增第 0 列（四栏 `[活动栏|左栏|中栏|右栏]`）。
16. **[文件] 预览**：并入 WorkbenchLayoutV3（与实例 tab 共享 group+tab）。
17. **[设置] 集成**：跳转 `SettingsRoute`（离开工作台，沿用现状）。
18. **[文件] tab 是 V3 多态 tab（`kind:"file"`）**：与 session tab 同处 group+tab（可 split/切 active/✕/拖拽）；session tab 的 tabId === sessionId 不变 → localStorage 零迁移、session 路径零回归。
19. **file tab 生命周期**：✕ = 仅移 tab（不 kill session）；右键菜单隐藏 kill；不参与 stale-tab prune（刷新保留）；可编辑+保存。
20. **file tab focus 路由**：新增 `/projects/$key/file/$`（splat 捕获多段项目相对路径），不复用 `/session/$id`。
21. **移动端 `/file/$path` 降级**：用移动 Files 浮窗打开（不实现移动端 V3 group，符合决策 12）。
22. **`/global` 路由重命名 `/projects`**：`/global` 现语义是「项目总览」（[项目] 导航），不再是「全局实例」；重命名（非真删）→ `/projects`（global scope index）+ `/global/session/$id`→`/projects/session/$id`（global scope 聚焦）。TanStack Router 字面量段 `session` 优先于参数 `$key`，与 `/projects/$key` 不冲突。`WorkbenchScope` kind `global` **类型语义保留**（只改 URL path 段，内部数据模型不动，避免殃及 V3 layout/scope 逻辑）。跟进点：router.tsx、workbench-model.ts（workbenchPath/useWorkbenchNavigate）、WorkbenchRoute.tsx（useSearch/useParams from）、project-left-panel.tsx（selectGlobal）、e2e specs。
23. **删 HomeRoute，`/` 移动分流改 GlobalScopeContent**：HomeRoute 项目列表/新建/进入/删除能力并入 [项目] 总览（决策 25）；`IndexRoute` 移动端从 `<HomeRoute>` 改为 `<GlobalScopeContent>`（scope=global → MobileWorkbench → [项目] 总览）。两端 `/` 统一为 global scope = [项目] 总览。i18n `home.*` 死键随删（`home.createProjectAria`/`home.newAdopt` 被 ProjectLeftPanel 复用，保留）。
24. **移动 [文件] = rootBrowse 根目录浏览 + 新 `/files` 路由**：移动端 [文件] 胶囊指向新 `/files` 路由，渲染 `<FilesPanel rootBrowse enablePreview />`（复用现状移动 Files 浮窗模式，fixed inset-0 z-50 slide-in-from-bottom 预览，决策 12）。桌面端 `/files` redirect 到 `/`（桌面 [文件] 经活动栏 nav=files，不需独立路由）。`rootBrowse` 按 currentPath 派生 {projectName, relativePath, isRootListing}，根目录只读，不依赖先进项目（活动栏 [文件] 是全局一级导航，与项目态左栏 [文件] 作用域互斥——后者进入项目后才出现）。
25. **[项目] 总览 = 实例聚合 + 项目分组进项目 + header 新建 + ⋯ 删除**：重构 MobileGlobalOverview 为 [项目] 总览——header + 新建项目（useCreateProject + ProjectSetupPanel Dialog，与 ProjectLeftPanel 同源）+ grouped 视图按项目分段（groupByProject），**点项目分组标题进项目**（navigate `/projects/$key`），**分组标题右侧 ⋯ 菜单提供删除项目**（复用 deleteProject + useConfirm confirm dialog，本 phase 加）；grid/table 视图点实例进实例聚焦（不按项目分段，删项目入口仅 grouped 提供）；删 inspection tab 行 + 插件分支（[项目] 总览是纯实例聚合 + 项目入口，inspection 归 [文件]/[设置] 一级导航 + 项目内 MobileProjectOverview）；ViewSwitcher 保留。
26. **Phase 3 tab bar 中栏→左栏迁移 + 活动栏[文件]固定全局**：① 进入 project scope 后，middle tab bar（实例/历史/文件/git）从 `InstanceArea` 中栏顶部移到 `ProjectLeftPanel` 左栏顶部，切**左栏主体**内容（实例=InstanceLeftOverview / 历史=HistoryList / 文件=FilesLeftPanel scope=project / git=GitDiffPanel），**非中栏**；`InstanceArea` 瘦身为纯 group+tab 常驻（去 tab bar + history/inspection content 分支，props `ctx`→`projectName`）。② middle tab bar **仅 project scope + nav=projects** 出现；global scope 无 middle tab（global 无 history/git，files 归活动栏 nav=files）。③ 活动栏始终切左栏（既定），`nav=files` 固定 `FilesLeftPanel scope={kind:"global"}`（rootBrowse 全局根目录，不论 WorkbenchScope）——修正 Phase 2b 遗留（`nav=files` 曾传 `scope={scope}` 致 project scope 渲染项目内文件树，与「活动栏[文件]=全局」冲突）。④ middle tab 内容全复用现成（HistoryList/FilesLeftPanel scope=project/GitDiffPanel/InstanceLeftOverview），middle tab bar 复用 TabButton + buildOverviewTabs。`tab`/`onTabChange` 从 InstanceArea 移到 ProjectLeftPanel（WorkbenchContent 接线跟进）。
27. **左栏大标题层 + GroupedView 项目行防误触 + 新建位置统一（批 D）**：① `WorkbenchShell` 左 `PanelHeader` 可选 `title`（`h-11` + `text-base font-semibold` + `border-b border-on-surface/5`，对齐 `MobilePageHeader`）；`WorkbenchContent` 按 `workbenchNavAtom` 注入 `nav.projects` / `nav.files`；右栏 `PanelHeader` 仍仅收起。② GroupedView 项目行 = `[折叠 gutter h-7][项目名 flex-1 进项目][⋯ ActionMenu → 删除 destructive]`（删除不再常驻）。**注：行模型视觉被决策 30 取代**（苹果双件套：折叠附属控件化 + gap-2 触区分离，不再 h-7 三等大方块）。③ 新建项目按钮桌面/移动都落在 ViewSwitcher 行左侧（样式见决策 28）。
28. **新建项目按钮对齐 CreateSessionBar + 移动 grouped 含空项目（批 E）**：① 桌面 `InstanceLeftOverview` + 移动 `MobileGlobalOverview` 新建项目 = `actionButtonClasses({ tone: "accent" })` pill 文案按钮（同 CreateSessionBar trigger token），文案 `workbench.createMenu`，`aria-label` 仍用 `home.createProjectAria`；单按钮直开 Dialog，无 dropdown/chevron。② 移动 grouped 与桌面 GroupedView 同用 `mergeProjectsWithCandidates` + `listProjects`；空项目显 `workbench.groupedProjectEmpty`；empty gate 按 view 分流（grouped 看 projects 列表，grid/table 看 candidates）。
29. **[项目] 总览桌面/移动共享 + 空项目默认折叠（批 F）**：① global [项目] 共用 `GlobalProjectsOverview`（单一实现：新建 accent pill + ViewSwitcher + grouped/grid/table + create Dialog + 删除 confirm + close/rename）；桌面 `WorkbenchContent` global 直接挂共享组件（`dragAdapter`+`onFocusInstance`），移动 `MobileGlobalOverview` 缩为 `MobilePageHeader` + 共享组件（`contentClassName=pb-24`）。② grouped 折叠双名单：`workbenchGroupedCollapsedAtom`（有实例，默认展开）+ `workbenchGroupedExpandedEmptyAtom`（空项目，默认折叠；list 含名=用户展开）；`isGroupedProjectCollapsed(name,isEmpty,collapsed,expandedEmpty)` 唯一判定。③ `InstanceLeftOverview` 收窄为 **project-only**（不再承载 global 三视图/新建项目）；删 `GroupedView`/`ProjectGroupHeader` 平行实现。④ 参数化仅 `dragAdapter?` / `onFocusInstance` / `contentClassName?`。
30. **项目行苹果双件套——折叠附属控件化（批 G）**：取代决策 27②「三等大方块」行模型视觉。① 折叠 = 行左侧**次级附属控件**：视觉小三角（chevron `size-3.5` + 次级色 `text-on-surface-muted`）+ 左领地（`-ml-1` 探出行主体带），非与项目名平起平坐的方块；触区 `size-9`(≥36px)。② 行主体（项目名 `flex-1`）单击 = 进项目，覆盖折叠与 ⋯ 之间全部空间（「点行进入」感知）。③ ⋯ = 唯一右侧控件（删除项目 destructive，D2 两端一致保留行尾）。④ `gap-1`(4px)→`gap-2`(8px) 物理分离折叠↔名字、名字↔⋯，消除触区粘连误触。⑤ **结构不变**：仍是三个独立 button（折叠/名字/⋯），无嵌套、无 stopPropagation（避 portal/fiber 合成冒泡，frontend-notes §4）。理由：对齐 Finder/Files 心智（项目=文件夹、实例=子项），消除「想折叠误进项目 / 想进项目误折叠」。两端共用 `GroupedProjectsList`（批 F 决策 29），改一处同生效。**注：行模型被决策 31 取代**（折叠下沉实例区小标题，进入/折叠解耦；批 G 物理分离未消除同行单击冲突）。


31. **折叠下沉实例区小标题——进入/折叠解耦（批 H）**：取代决策 30 苹果双件套行模型（折叠仍在项目名行）。① **折叠离开项目名行**，下沉到实例区小标题：项目名行只留 `[项目名(单击进项目)][⋯ 删除]`，单一主操作=进入；实例区（N>0）新增 `▼/▶ N 实例` 小标题 button，点=折叠/展开 InstanceGrid；折叠态隐藏卡片网格但保留 `▶ N 实例` 小标题（展开入口不丢）。② **进入独立于实例**——空项目无实例区小标题、无折叠（没东西可折），仍可点项目名行进入项目（语义正确）。③ **三操作三交互面**：项目名行(进入) / 实例区小标题(折叠) / ⋯(删除)，自然察觉。④ **批 F 双名单简化为单名单**：删 `workbenchGroupedExpandedEmptyAtom`，`isGroupedProjectCollapsed(name, collapsed)` 单名单判定（空项目永不折叠）。理由：进入与折叠本属不同交互面（进入是项目基本操作，折叠管实例列表），批 G 物理分离触区未消除「同行单击」冲突，下沉到不同交互面才彻底解耦。两端共用 `GroupedProjectsList`，改一处同生效。

32. **grouped 项目名行优化——图标 + 字号对齐 token + 移动滚动避让内化（批 I）**：① 项目名行加 project 图标（`ShellIcon name="project"`，`size-4` + `text-on-surface-muted` 次级，与底部胶囊「项目」tab 同图标两端语义统一）。② 项目名字号 `text-xs`→`text-sm`（14px body-md，对齐 DESIGN typography「项目名 = body-md」token，批 B 起草时误按 nav 项小字处理）。③ 移动滚动避让内化：`GlobalProjectsOverview` 滚动容器默认 `max-lg:!pb-[var(--shell-mobile-bottom-nav-space,0px)] lg:pb-0`（精确避让实测胶囊高度，单一来源，对齐 file-browser/git-diff-viewer 模式），删 `contentClassName` prop（原移动传 `pb-24 lg:pb-0` 硬编码不精确、非单一来源），`MobileGlobalOverview` 不再传 contentClassName。`GroupedProjectsList` 根去 `h-full`（height:100% 子项使 overflow 容器 padding-bottom 不扩展 scrollHeight——内容滚到底贴视口底被胶囊遮挡；去 h-full 后 pb 正确撑开可滚动区，滚到底 last section bottom = 胶囊 top 不遮挡，实测 lastBottom=780=capsuleTop）。④ 骨架同步：`GroupedProjectsSkeleton` 项目名条 `h-4`→`h-5`（text-sm 行盒 20px，对齐骨架铁律 L480）+ 前置 `size-4` 图标占位。两端共用 `GroupedProjectsList` / `GlobalProjectsOverview`，改一处同生效。

33. **grouped 视图 Apple Store 风格 redesign——删折叠+名行易点+实例分页 carousel（批 J）**：取代决策 31（折叠下沉）/32（名行字号），从信息架构层一次性消三个杂乱根因（折叠行割裂 / 三层信息密度 / 空实结构不对称）。① **删折叠**：删 `workbenchGroupedCollapsedAtom` + `isGroupedProjectCollapsed` + 实例区小标题行（▼/▶ N 实例），实例恒定展示。② **项目名行**：`[📁 project 图标 size-5 + 项目名 text-base(16px) font-semibold + › chevron size-5][⋯ 删除 最右]`——名+› 整体一个 `<button>` 进项目（点哪都进），字号 16px 落地 headline-sm（DESIGN 无 body-lg token，项目名本就 font-semibold，语义为分组标题），触控热区 `min-h-11`(≥44px) 满足易点；⋯ ActionMenu 放名行最右尽头。③ **实例区横向分页 carousel**（`InstancePagedCarousel`）：每页最多 3 卡（纵向复用 `InstanceCard` 横向行式 plain，不加 variant），`overflow-x-auto snap-x snap-mandatory snap-center` 双侧 peek（每页 `w-[calc(100%-3rem)]`，`-3rem`=左右各 24px 露邻组作翻页提示）；移动端原生左右 swipe 翻页，桌面端配页码行 `hidden lg:flex`（`‹ 1·2·3 ›` scrollIntoView）；≤3 实例单页退化无 peek 无页码。④ **section 间 `gap-6`(24px)** 明显分割（spacing-2xl）。⑤ **骨架同步**：删小标题行、名行 `h-5`→`h-6`(16px 行盒)、卡片骨架 carousel peek 结构。两端共用 `GroupedProjectsList`/`GlobalProjectsOverview`，改一处同生效。

34. **grouped 名行间距收紧 + chevron 暗淡（批 K）**：① chevron `text-on-surface-muted`→`text-on-surface-muted/60`（`global-projects-overview.tsx:299`，只 › 箭头，project 图标 L293 不动；对齐 Apple disclosure indicator 最弱视觉层级，DESIGN L424 `on-surface-muted/60` placeholder 先例）。② 名行 `px-2 py-1.5`→`px-2 pb-1`（L286；pt→0 收组间到 `space-y-6`(24px)=1.5×16px 项目名字号；pb 6→4px 收名称↔列表）。③ 根因：`InstancePagedCarousel`(L1322)/`InstanceGrid`(L1228 plain `grid divide-y`)容器零垂直 padding，垂直 gap 唯一来源=名行 py；点②（名称↔列表=pb）③（组间=space-y+pt）同根，收 py 同时解决。④ `space-y-6`(L280) 保持——=1.5em 符合点③目标，"过多"根因是名行 pt-1.5(6px) 叠加让组间视觉 ~30px，非 space-y 本身。两端共用 `GroupedProjectsList`，改一处同生效。

35. **grouped section 共享背景成组 + 实例区负 margin 收间距（批 L）**：批 K 后用户仍觉名行↔实例列表间距太大、关联感弱。**根因**：名行 button `items-center` + `min-h-11`(44px 热区) + 内容 size-5(20px) → button 底部 12px 居中空白（热区代价，不可去）；+ `pb-1`(4px) + InstanceCard `p-3` top(12px，复用 token 不动) → 名行**文字底→首卡内容顶 ≈ 28px**，且名行与实例区是两块无视觉成组线索的堆叠。**修**（B 方案：共享背景成组）：① `<section>` 加 `rounded-lg border border-neutral-line overflow-hidden`——名行=卡片 header、实例区=卡片 body，同一边框内成组（无 bg 透明融入 shell；`border-neutral-line` #263245 勾勒轮廓）；`overflow-hidden` 让 InstanceCard hover bg 遵守圆角。② 名行 div `px-2 pb-1`→`px-2`（去 pb，间距改由实例区负 margin 控制；px-2 保留=名行图标左缘 12px 对齐 InstanceCard marker 左缘 12px）。③ 实例区外层包 `<div className="-mt-2">`（-8px）抵消首卡 `p-3` top 部分 → 名行文字底→首卡内容顶 ≈16px（-12px）。④ section 间 `space-y-3`(12px)（trial 调整见末尾）。**不动** InstanceCard/InstanceGrid/InstancePagedCarousel（plain 复用零回归，grid/table 视图不受影响）。空项目 section 只 header（无实例区 div，无 -mt-2，背景卡独占名行）。**trial 调整**（三轮迭代）：① section 间 `space-y-6`(24px)→`space-y-3`(12px) 缩间距——成组已提供分组线索，靠 section 边框 vs shell 区分组，不需明显距离。② 圆角贴边问题：先试去 `rounded-lg`+`overflow-hidden` 改方角满宽贴边，用户 trial 后觉方角贴边仍不合适；改回 `rounded-lg`+`overflow-hidden` 圆角卡片 + 根 `px-3 py-3` 四周边距（圆角卡片不贴父容器两侧，Apple Store 风格）。③ 背景过突出：用户觉 `bg-surface-raised` 卡片浮起感太强，改 `border border-neutral-line` 边框勾勒（无 bg 透明融入 shell，`neutral-line` #263245 边框成组；备选 `bg-surface-raised/50` 更淡 bg 未用）。名行图标左缘与 InstanceCard marker 左缘仍对齐（section 整体偏移 px-3，图标/marker 同步 +12px）。两端共用 `GroupedProjectsList`，改一处同生效。

36. **grouped carousel snap-start 单向 peek + section 边框对齐 neutral-line/40（批 M）**：批 L 后用户提两细节——① 4 实例（2 页 [3,1]）末页单卡 peek 显乱（桌面没必要漏第 4 个、移动 peek 像乱）；② section `border-neutral-line` 实色比同框 `divide-neutral-line/40` 重一档。**根因**（用户问"为什么 Apple peek 不乱"）：乱不在 peek 本身，在 `snap-center` 双侧 peek——每页 `w-[calc(100%-3rem)]` + `snap-center` 居中左右各 24px peek，**首页左侧 24px 露空白**（第一页无上一页）、**末页右侧 24px 也露空白**（末页无下一页）+ 左侧露上一页，孤卡左右都有东西 → 乱。Apple 用 `snap-start`（左对齐）+ **单向右侧 peek**：首页贴左只右侧 peek 露下一页、末页左对齐右侧自然结尾空白（非 peek 缝），首末页都不露空白 → 连贯。**peek 露空白=乱，peek 露邻页内容=暗示**。**修**：① `snap-center`→`snap-start`（单向右 peek，首末页不露空白）。② `calc(100%-3rem)`→`calc(100%-1.5rem)`（双侧 48px→单侧 24px）。③ 桌面 `lg:w-full` 满宽无 peek（页码行暗示，用户明示桌面没必要漏第 4 个）。④ `goTo` `scrollIntoView` `inline:center`→`inline:start`（对齐 snap-start 避免跳动）。⑤ section 边框 `border-neutral-line`→`border-neutral-line/40`（对齐同框 divide + Apple hairline，用户选）。**不动** InstanceGrid/InstanceCard/handleScroll（slot=scrollWidth/pageCount 自动适配响应式页宽）/≤1 页退化。两端共用 `GroupedProjectsList`/`InstancePagedCarousel`，改一处同生效。

37. **grouped carousel 末页 spacer——翻页对齐（批 N）**：批 M snap-start 单向 peek 后用户提"翻页后对不齐"（Apple 翻页左侧 padding 一致）。**根因**（探针实测「简易会话」4 实例 2 页）：snap-start + `pageW=containerW-peek`(340) 下，末页 snap 点=`pageW`(340)，但 `maxScrollLeft=scrollWidth-containerW=680-364=316 < 340`，**末页 snap 点超出最大滚动距离**，snap 不到左对齐停在 316，末页整体右移 peek 量（card 内容左 12→36，偏移 24px）。N=2 下 peek 与对齐固有矛盾：peek 占空间让末页滚不到最左。Apple 靠对称 peek（snap-center 居中内容左恒等）+ cell 背景让 peek 不显空；我们 plain 无背景，snap-center 双侧空白 peek 乱（批 L）、snap-start 末页偏移，两难。**修**（用户选方案 B 末页 spacer）：pages 末尾加 `w-6 shrink-0 lg:hidden aria-hidden` 空 div（peek 宽=24px），让 `scrollWidth=N*pageW+peek`，`maxScrollLeft=(N-1)*pageW`=末页 snap 点 ✓，末页能 snap 贴左，内容左=首页（12=12）对齐。桌面 `lg:w-full` 满宽 pageW=containerW 不需 spacer（`lg:hidden`）。首页右 peek 露第 2 页内容（暗示），末页右侧 spacer 空白（自然结尾，单向非双侧）。**不动** snap-start/calc(100%-1.5rem)/handleScroll（slot=scrollWidth/pageCount，spacer 让 slot 偏移 peek/N，round 仍准）/goTo（scrollIntoView 针对 page 元素，spacer 不参与 snap）/≤1 页退化。两端共用 `InstancePagedCarousel`，改一处同生效。

38. **移动端实例列表 Apple 化——无边框+inset 分割线+无 hover（批 O）**：批 N 后用户观察 Apple 做法 4 点（移动端，桌面保持"很完美"）：① 没有边框；② gap=peek 露邻页（已有 snap-start 单向 peek，保留）；③ 分割线仅在右侧、不包含左边图标（iOS separatorInset 范式）；④ 列表元素无 hover 高亮。**用户决策**：范围=移动端全部实例列表（grouped carousel + grid 视图移动端，InstanceGrid plain 响应式分流，桌面保持）；inset=60px 内容区左（p-3 12 + marker lg 36 + gap-3 12，iOS 默认 separatorInset）。**机制**：① `interactive-row` 是共享 CSS utility（ListRow/InstanceCard 用），不能改本身——从 InstanceCard plain 分支剥离，桌面用 `lg:hover:bg-on-surface/5` 补回（on-surface 5% ≈ white 5% 深色主题视觉等价）。② `divide-y` 不支持 inset（border-top 横跨全宽）——InstanceCard 加 `topSeparator` prop，绝对定位 div（`absolute top-0 right-0 h-px bg-neutral-line/40 left-15 lg:left-0`），InstanceGrid plain 去 `divide-y`、给非首卡传 `topSeparator`；CardGridSkeleton 同步。③ section 边框 `lg:border lg:border-neutral-line/40 lg:rounded-lg`（移动无边框无圆角，桌面保持）。**不动** InstancePagedCarousel（snap-start/calc/spacer/handleScroll/goTo/≤1 页退化，批 J/M/N 成果）、raised 模式 InstanceCard（`interactive-row`+raisedHover 保留）、table 视图（SessionTable）、`interactive-row` utility 本身、桌面端任何视觉。两端共用 `InstanceCard`/`InstanceGrid`/`GroupedProjectsList`，响应式 `lg:` 分流改一处同生效。

39. **grouped carousel 双向 peek + 名行操作区对齐（批 P）**：批 O 后用户提两点（移动端为主，桌面也要"操作区一列"）：① peek 不完整——page1 见 page2 peek 但 page2 见不到 page1 peek（单向）；② 项目名行 ⋯ 删除 与 InstanceCard ⋯ action 视觉不在一列。**根因**（探针实测）：批 M snap-start 单向 peek——page.left=scrollLeft、page2 scrollLeft=pageW 时 page1 [0,pageW] 全部出屏（left=−330），无左 peek 空间；且 peek 24px 把 page1 卡片右缘推到 section-right−24，card action 落 section-right−32，而名行 ⋯ 在 section-right−8（px-2），差 24px=peek 量。**修**（双向 12px peek + 名行同步右移，保双对齐）：① 容器加 `scroll-px-3 lg:scroll-px-0`（snap 对齐 snapport-left=scrollLeft+12）+ 首尾各加 `w-3 shrink-0 lg:hidden aria-hidden` spacer（末页 `w-6`→`w-3`）；page 宽 `w-[calc(100%-1.5rem)]`=342 不变（=containerW−2·12，天然双侧 12px）。② 名行 `px-2`→`pl-5 pr-5 lg:pl-2 lg:pr-2`（mobile 20px / 桌面 8px）。**数学**（移动 390，section left=12 right=378）：首 spacer 把 page1 卡片从 left=12 推到 24，card marker 24→36、card-right=section-right−12、card action=section-right−20；名行 pl-5 把图标推到 36（marker↔icon 仍对齐，保决策 35）、pr-5 把 ⋯ 删除落 section-right−20（与 card action 同列 ✓）。page2 scrollLeft=342 时 page1 [12,354] 可见 [342,354]=12px 左 peek ✓；page1 scrollLeft=0 时 page2 [354,696] 可见 [354,366]=12px 右 peek ✓。scrollWidth=N·342+24（首尾 spacer 12+12=24，与批 N 末页单 24 同值），handleScroll slot 不变；`scrollIntoView({inline:start})` 自动尊重 scroll-padding。**反转决策 36**：批 M 拒双侧 peek（"露空白=乱"），用户现明示要双向 peek——12px gutter（首尾 spacer）是 iOS collection-view 标准做法（首末 cell section inset=cell spacing），非"乱"；中间页左右各露邻页内容=双向暗示。peek 量 12px 双侧（总 24px 同批 M 单侧 24px，分布两侧）。**桌面零回归**：spacer `lg:hidden`+`lg:scroll-px-0`+page `lg:w-full`+名行 `lg:pl-2 lg:pr-2`=8px=未改前，marker↔icon（24px）+ action↔删除（section-right−8）均不变。**骨架不改**：`GroupedProjectsSkeleton` 名行 `px-2` + CardGridSkeleton 全宽无 peek，骨架内部自洽（icon@24=marker@24）；加载时名行+卡片协调 +12px 右移（peek 出现），无相对错位。**不动** InstanceCard（action `absolute right-2 top-2` + 尺寸 h-7 w-7 / max-sm:h-10 w-10 不变）、InstanceGrid、raised 模式、table 视图、`interactive-row` utility。两端共用 `InstancePagedCarousel`/`GroupedProjectsList`，响应式 `lg:` 分流改一处同生效。

40. **grouped 名行 ⋯ 与 InstanceCard ⋯ action 同尺寸同图标（批 P 收尾）**：批 P（决策 39）实现双向 peek + 名行 `pl-5 pr-5` 右缘对齐后，用户仍觉「操作区还是没对齐」并明示「了解苹果规范细节」。**探针实测**（移动 390 + 桌面 1280，1-页 + 多页 section）：名行 ⋯ 删除与卡片 ⋯ action **右缘 gap=0 ✓**（1-页/多页几何一致，px-3 wrapper 生效），但**图标中心错位 2px（移动）/ 4px（桌面）**——根因：名行 delete `size-9`(36px) + 自定义 3-dot SVG `size-3.5`(14px) vs 卡片 action `h-7 w-7`(28px 桌面)/`max-sm:h-10`(40px 移动) + `ShellIcon ellipsis h-4 w-4`(16px)，**尺寸不同 + 图标不同源** → 右缘虽齐但按钮宽度不同、图标各自居中故中心错位。**苹果规范**（UICollectionView list / iOS Settings 范式）：section header 的 accessory 与 cell 的 accessory **同尺寸同位置**——同一列竖向严格对齐靠的是同尺寸（icon 同 button.cx），仅右缘齐不够。**修**：`GroupedProjectsList` 名行 delete button `flex size-9` → `flex h-7 w-7 shrink-0 ... max-sm:h-10 max-sm:w-10`、自定义 SVG → `<ShellIcon className="h-4 w-4" name="ellipsis" />`，与 `InstanceCard` action（`shell-primitives.tsx` L697-708）**同尺寸同图标同源**。改后两按钮同宽（移动 40 / 桌面 28）、同图标（16px ellipsis）、右缘均 section-right−20px → 图标中心均 button.cx 严格对齐。移动端名行 delete 36→40px 顺带达标 44pt 触摸基准；桌面 36→28px 与 card action 一致（鼠标区，row `min-h-11` 仍 44px 触摸热区由进项目 button 承载）。**不动** InstanceCard action 本身（已批 O 定型）、双向 peek / px-3 wrapper / 名行 pl-5 pr-5（决策 39 成果）、InstanceGrid、raised 模式、table 视图。两端共用 `GroupedProjectsList`，改一处同生效。

41. **grouped carousel 移动端 peek 12→20（批 P 收尾）**：批 P 收尾（决策 40 ⋯ 按钮统一）后用户指出"移动端去边框后 padding 要合理调整，翻页 peek 没多少空间"。**根因**：批 O（决策 38）去掉移动端 section 边框后，批 L（决策 35）配合边框加的根 `px-3`(12px) 保留——但 peek 12px 露的是下一页 InstanceCard 的 p-3(12px) 空白区，几乎看不到内容（peek ≤ p-3 全是 padding，没露到 marker/标题）。**用户选方案 C**（保留 px-3 + peek 20）：保留根 `px-3`(12px) 与 grid/table 视图左缘一致（切视图不跳），peek 增到 20px（露过 p-3 到下一页 marker 左缘，有内容暗示）。代价：内容区 342→326（−16px，peek 增 8 补偿）。**对齐不变量保持**：名行 `pl=pr = peek+8`（8=卡片 action `right-2`），peek 20→名行 `pl-7 pr-7`(28)、⋯ 删除右缘 section-right−28、卡片 action 右缘 section-right−28，图标中心严格对齐；marker↔icon 同步（保决策 35）。**修**（6 处，移动默认 + `lg:` 桌面覆盖零回归）：① carousel 容器 `scroll-px-3`→`scroll-px-5`；② 首/尾 spacer `w-3`→`w-5`；③ page `w-[calc(100%-1.5rem)]`→`w-[calc(100%-2.5rem)]`；④ ≤1 页退化 `px-3`→`px-5`（单页卡与多页 carousel 同几何）；⑤ 名行 `pl-5 pr-5`→`pl-7 pr-7`；桌面 `lg:scroll-px-0`/`lg:hidden` spacer/`lg:w-full`/`lg:px-0`/`lg:pl-2 lg:pr-2` 全不变。**不动**：批 P 决策 39 的双向 peek 结构（首尾 spacer + scroll-px）保留只改量；根 px-3 保留（未来若去 px-3 满宽是新决策）；骨架不改（批 P 决策 39 自洽延续，骨架 px-2/全宽 CardGridSkeleton 不 mirror peek，加载态短暂）。两端共用 `InstancePagedCarousel`/`GroupedProjectsList`，响应式 `lg:` 分流改一处同生效。

42. **grouped 移动端去根 px 满宽——card 距两侧 = peek（批 P 收尾）**：决策 41 末尾预告"未来若去 px-3 满宽是新决策"；批 P 收尾探针验证后用户指出"距离两侧 gap 超大，值已有答案"。**根因**：去边框（批 O 决策 38）后批 L（决策 35）配合边框加的根 `px-3`(12px) 仍在——card 距屏幕两侧 = px-3(12)+peek(20)=32px 双重叠加。边框时代 px-3 是"卡片距父容器"呼吸空间（合理），去边框后 section 无边框收束、px-3 变 carousel peek 之外多余水平留白。**用户意图**："距离两侧 = peek（已有答案）"——card 距屏幕两侧应 = peek(20)，非 px-3+peek(32)；Apple UICollectionView full-bleed carousel 范式：section inset=0 贴屏幕、card 靠 scroll paddingLeading=peek 露出。**修**：根 `px-3 py-3`→`px-0 py-3 lg:px-3`（移动去水平 px / 桌面 lg:px-3 保持边框时代内边距）+ 骨架 `GroupedProjectsSkeleton` 同步。**对齐不变量保持**（marker↔card 内容整体左移 12px）：section 贴屏(left=0)、card 边缘 left=peek(20)、card 内容 left=20+p-3(12)=32、marker left=pl-7(28)+button.px-1(4)=32 ✓、⋯ right=屏宽-pr-7(28) vs card action right=屏宽-peek(20)-right-2(8)=屏宽-28 ✓。**grid/table 不跟**：仍各自 `px-3 py-2`（card 距屏 12），切视图左缘跳（grouped card@20 vs grid card@12），但 carousel peek 是 grouped 固有偏移（决策 39/41 已接受 grouped↔grid 不一致），去 px-3 只把偏移 32→20，非新问题。**py 不动**（用户明示"距离两侧"= 水平）。**桌面零回归**：lg:px-3 保持。两端共用 `GroupedProjectsList`/`GroupedProjectsSkeleton`，响应式 `lg:` 分流改一处同生效。

43. **nameRow 内容左缘对齐 card 左边缘——Apple full-bleed header 对齐 cell 边缘（批 P 收尾）**：决策 42 去根 px-3 让 card 贴屏（边缘=peek=20）后，探针诊断 nameRow 项目图标 left=32 vs card 左边缘 left=20——nameRow 内容比 card 缩进 12px（=card p-3），用户"没对齐已有的做法"。决策 42 前 card 在 px-3 内整体右移、缩进不明显；去 px-3 满宽后 card 贴屏、缩进 12 暴露。**根因**：决策 35 建立 marker↔icon 内容对齐（nameRow 图标=card marker=card.left+p-3），决策 39/41 用 pl=peek+8 维持——边框时代"同框内容对齐"契约。去边框（决策 38）+ 满宽（决策 42）后 nameRow 与 card 是 full-bleed 关系（section 无框、贴屏），应遵循 Apple full-bleed carousel：section header 内容左缘=cell 左边缘（layout margin=peek），非 cell 内容。**Apple 规范**（UICollectionView full-bleed 横滚，App Store Today/Music 范式）：header 文字 leading=scroll contentInset.leading=layout margin=首个 cell 左边缘，header 对齐 cell **边缘**、cell 内容因 padding 进一步右移。**修**（2 处，移动默认 + lg: 桌面覆盖零回归）：① 名行 `pl-7 pr-7`→`pl-5 pr-7`（mobile pl=peek=20 让 button.left=card.left / pr=peek+8=28 对齐 card action 保决策 40；桌面 lg:pl-2 保持）；② 进项目 button `px-1`→`px-0 lg:px-1`（移动去 px 让图标 left=20=card 左边缘 / 桌面保 px-1 维持 marker↔icon）。**对齐不变量**（移动 390）：button.left=0+pl-5(20)=20=card.left ✓、图标=20+px-0=20=card 边缘 ✓、⋯ right=390−pr-7(28)=362=card action right ✓（决策 40 保持）；marker↔icon 转边缘对齐（图标 20 / marker 32 差 12=card p-3，Apple full-bleed 正常）。**桌面零回归**：lg:pl-2(8)+button lg:px-1(4) 保持，图标=section.left+12=card marker（保决策 35 桌面）。**骨架不改**（批 P 决策 41 自洽延续）。两端共用 `GroupedProjectsList`，响应式 `lg:` 分流改一处同生效。

## 7. 待定点

> 主确认点（中栏语义）于第 1.5 轮关闭；3 个结构细节待定点于第 3 轮解决（§6 第 11-13）；4 个 plan 决策点于第 4 轮解决（§6 第 14-17）。
>
> **全部待定点已清空。** 现状盘点见 §8，分阶段落地见 [`activity-bar-redesign-plan.md`](./activity-bar-redesign-plan.md)。

## 8. 现状代码锚点（盘点完成）

> **核心发现**：新「左栏 + 中栏」= 现状 `InstanceArea` 内部已有的「左总览 + 右工作区」，内部分割已就位；`WorkbenchMiddleTab`(overview/history/files/git) = 用户定的进入项目后左栏多导航清单（实例=overview），零改动复用。改动集中在：① 外壳加「活动栏」；② 左栏内容源从 `WorkbenchLeftRail`（项目列表）切换为「随活动栏变」；③ 进入项目后 tab bar 从中栏顶部移到左栏顶部。

### 8.1 路由与组装

| 符号 | 现状 | 新结构对应 |
|---|---|---|
| `router.tsx` | `/` `/projects/$key` `/projects/$key/session/$id` `/global` `/global/session/$id` `/settings`；视口分流在组件层（`useIsDesktopViewport`，非 redirect）；search `?rightTab ?view ?tab` | `/global`→`/projects` 重命名（决策 22）；新增 `/files`（决策 24，移动 rootBrowse）；活动栏项不进 URL |
| `WorkbenchRoute.tsx` `WorkbenchContent` | `!isDesktop→<MobileWorkbench>`；桌面 `<WorkbenchShell leftPanel={<WorkbenchLeftRail>} rightPanel><InstanceArea/></WorkbenchShell>` | leftPanel 改为活动栏 + 随导航切换的左栏内容；注入 nav state |
| `WorkbenchRoute.tsx` `IndexRoute` | `/`：桌面=global 工作台，移动=`<HomeRoute>` | 移动 HomeRoute 删除 → `/` 移动 = [项目] 总览（GlobalScopeContent，决策 23） |

### 8.2 外壳

| 符号 | 现状 | 新结构对应 |
|---|---|---|
| `workbench-shell.tsx` `WorkbenchShell` | 三栏 grid `[leftPanel\|children\|rightPanel]`，`lg:grid-cols-[leftcol_1fr_rightcol]`；无活动栏列 | 加活动栏列 → 四栏 `[活动栏\|左栏\|中栏\|右栏]`（plan 定：新增第 0 列 vs leftPanel 改造） |

### 8.3 中栏 = 新左栏 + 新中栏（`InstanceArea`）

| 符号 | 现状 | 新结构对应 |
|---|---|---|
| `instance-area.tsx` `InstanceArea` | 永远左右：**左总览**（单列卡片 grid/table/grouped + ViewSwitcher + CreateSessionBar）+ **右工作区**（`WorkbenchLayoutV3` group+tab 分屏） | 左总览=新左栏；右工作区=新中栏（常驻）。主要改左总览内容源 + tab bar 位置 |
| tab bar `buildOverviewTabs`(overview/history/files/git) | 中栏顶部（`InstanceArea`），按 scope 过滤（global=overview+files；project=全量） | **Phase 3**：从 `InstanceArea` 中栏移除 → project scope 移到 `ProjectLeftPanel` 左栏顶部切**左栏主体**；global scope 无 middle tab（files 归活动栏 nav=files） |
| `leftOverviewContent` | overview tab 左总览 grid/grouped/table 分支 | [项目] 左栏 = 此 + 新建/进入项目 |
| `workbench-model.ts` | `WorkbenchMiddleTab`=overview/history/files/git + atom（view/middleTab/rightCollapsed/middleLeftWidth/mobile*） | **零改动复用**（= 用户定的左栏多导航清单）；新增 nav state |

#### 8.3.1 Phase 2a 拆分（方案 X，已定）

拆 `InstanceArea` 为三部分，DOM 严格四栏（§4.1）：

| 新组件 | 位置 | 职责 | 持有 state |
|---|---|---|---|
| `WorkbenchContent`（WorkbenchRoute.tsx） | 组装层 | 提升 InstanceArea 共享 logic + 渲染 holders | layout/update、drag 三件套（dragState/activeZone/onDrop/cancelDrag/onCardDragStart）、focus+prune effects、candidates/create/close/rename/contextMenu |
| `InstanceLeftOverview`（**新**，instance-left-overview.tsx） | leftPanel（DOM 第 1 列） | 左总览纯渲染：CreateSessionBar + ViewSwitcher + grid/grouped/table + Empty/Skeleton | 无 state；`React.memo` 包裹，dragState 不进其 props |
| `InstanceArea`（**Phase 3 进一步瘦身**：纯右工作区 group+tab） | 中栏 children（DOM 第 2 列） | WorkspaceTree + DropZoneOverlay + tab 右键菜单（Phase 3 去 tab bar + history/inspection，移到 ProjectLeftPanel） | 无 state；消费 props 渲染 |

- **拖放跨组件**：dragState/activeZone/onDrop/cancelDrag/onCardDragStart 在 `WorkbenchContent` 单一来源；`InstanceLeftOverview`（拖放源，dragAdapter）+ `InstanceArea`（拖放目标，DropZoneOverlay props）通过 props 读。三条不变量：① dragState 期间 WorkspaceTree `pointer-events:none`；② `data-drop-empty` 容器必在 `InstanceArea`（中栏）内；③ `onCardDragStart` 单一实例（卡片源 + tab 源共享）。
- **tab bar** 留 `InstanceArea` 中栏顶部（Phase 2a 不动，Phase 3 才移左栏顶部）。
- **移动端零影响**：`MobileWorkbench` 不引用 `InstanceArea`。

### 8.4 左栏内容源（删除/改造）

| 符号 | 现状 | 新结构对应 |
|---|---|---|
| `left-rail.tsx` `WorkbenchLeftRail`/`ProjectTree` | GlobalNavNode + ProjectsSectionHeader(项目段折叠) + ProjectNode 列表(→/projects/$key) + 新建 Dialog(ProjectSetupPanel) + 设置入口(→SettingsFlyout) | **删除**（Phase 2a）；片段（GlobalNavNode/ProjectsSectionHeader/ProjectNode/LeftRailSkeleton + useCreateProject/ProjectSetupPanel）迁 `ProjectLeftPanel` |
| `project-left-panel.tsx` `ProjectLeftPanel`（**新**，Phase 2a） | — | [项目] leftPanel 内容源：global scope 顶部 GlobalNavNode + 项目列表(ProjectsSectionHeader/ProjectNode) + 新建 Dialog + `InstanceLeftOverview`；project scope 顶部仅返回全局入口 + `InstanceLeftOverview`。设置入口删除（[设置] 活动栏取代） |

### 8.5 右栏（不动）

| 符号 | 现状 | 新结构对应 |
|---|---|---|
| `right-panel-tabs.tsx` `RightPanelTabs` | 右栏 inspection(files/git，FIRST_PARTY_PLUGINS) | 本轮不动 |

### 8.6 移动端

| 符号 | 现状 | 新结构对应 |
|---|---|---|
| `mobile-workbench.tsx` `MobileWorkbench` | !focusId: global→MobileGlobalOverview / project→MobileProjectOverview + MobilePrimaryNav；focusId→MobileFocusBody(header tab output/files/git + 返回) | 底部胶囊→项目/文件/设置；进入项目后保留+返回 |
| `MobileGlobalOverview`(mobile-workbench) | 实例聚合（grouped/grid/table），无项目列表/新建/删除 | **批 F 薄壳**：`MobilePageHeader` + 共享 `GlobalProjectsOverview`（`contentClassName=pb-24`）；业务逻辑（新建/删除/三视图/空项目默认折叠）全在共享组件 |
| `GlobalProjectsOverview`（**新**，global-projects-overview.tsx） | — | global [项目] 桌面/移动**单一实现**（决策 29）：新建 accent pill + ViewSwitcher + grouped（`GroupedProjectsList` + 双 atom 空默认折叠）/grid/table + create Dialog + delete confirm + close/rename；props 仅 `onFocusInstance` / `dragAdapter?` / `contentClassName?` |
| `InstanceLeftOverview` | global+project 左总览 | **批 F 收窄 project-only**（CreateSessionBar + 本项目 grid/table）；global 改由 WorkbenchContent 直挂 `GlobalProjectsOverview` |
| `MobilePrimaryNav`(shell/mobile-primary-nav) | 底部胶囊一级导航（项目/全局/设置） | **改为 项目/文件/设置**（删「全局」项加「文件」项，= 桌面活动栏）；[文件]→`/files` rootBrowse 浮窗 |
| `HomeRoute.tsx` | 移动 `/` 项目列表/新建/进入/删除 | **删除**（项目列表/新建/删除能力并入 [项目] 总览：grouped 分组进项目 + header 新建 + ⋯ 删除） |
| `workbenchMobileOverviewTabAtom`/`FocusTabAtom` | 移动 tab 记忆 | 复用；移动 nav 无 atom，纯 URL pathname 驱动（[文件]=`/files`、[设置]=`/settings`） |

### 8.7 设置

| 符号 | 现状 | 新结构对应 |
|---|---|---|
| `SettingsRoute.tsx` | `/settings` 独立路由 | [设置] 活动栏沿用（跳转 vs 内嵌 plan 定） |
| `SettingsFlyout` + `workbenchSettingsFlyoutOpenAtom` | 桌面设置浮层（LeftRail 底部按钮触发） | **删除**（Phase 2a）；[设置] 活动栏跳转 `SettingsRoute`（决策点④，已定） |

## 9. 落地阶段

> 分阶段执行计划见 [`activity-bar-redesign-plan.md`](./activity-bar-redesign-plan.md)（6 phase：0 导航 state+primitive / 1 桌面四栏 / 2 左栏随导航切换 / 3 进入项目后左栏多导航 / 4 移动端 / 5 门禁）。
