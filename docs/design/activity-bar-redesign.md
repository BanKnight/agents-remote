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
- **2026-07-11 协商第 9 轮（UI polish 批 D）**：① **GroupedView 项目行操作分级 A+C**——`[折叠 gutter h-7][项目名 flex-1 进项目][⋯ ActionMenu → 删除]`；折叠独立增大触摸区，删除从常驻 🗑 收进 ⋯ 菜单（destructive），对齐移动 `ProjectGroupHeader` 防误触。② **左栏统一大标题层**——`WorkbenchShell` 左 `PanelHeader` 加可选 `title`（`h-11` + `text-base font-semibold`，对齐 `MobilePageHeader`），`WorkbenchContent` 按 nav 注入 `t("nav.projects")` / `t("nav.files")`；右栏保持收起-only。③ **新建项目按钮统一**——桌面/移动同一渐变实色款（`h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-secondary text-on-primary shadow-lg shadow-primary/30` 文字 `+`）；移动新建从 `MobilePageHeader` actions 移到 ViewSwitcher 行左侧，与桌面 `InstanceLeftOverview` header 左对齐一致。


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
  [项目] → 实例聚合总览（原 MobileGlobalOverview grouped/grid/table 多视图）
           按项目分段（grouped）：点项目分组标题 → /projects/$key 进项目
           header 新建项目（+ 按钮，useCreateProject + ProjectSetupPanel Dialog）
           分组标题右侧 ⋯ 菜单 → 删除项目（deleteProject + useConfirm confirm）
           （注：grouped 分组由 groupByProject 从活跃实例派生，无实例的空项目不显示分组 →
            空项目删除入口待后续补「项目列表」视图；新建项目后 useCreateProject 自动
            navigate 进项目，空项目不滞留总览）
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
27. **左栏大标题层 + GroupedView 项目行防误触 + 新建按钮统一（批 D）**：① `WorkbenchShell` 左 `PanelHeader` 可选 `title`（`h-11` + `text-base font-semibold` + `border-b border-on-surface/5`，对齐 `MobilePageHeader`）；`WorkbenchContent` 按 `workbenchNavAtom` 注入 `nav.projects` / `nav.files`；右栏 `PanelHeader` 仍仅收起。② GroupedView 项目行 = `[折叠 gutter h-7][项目名 flex-1 进项目][⋯ ActionMenu → 删除 destructive]`（删除不再常驻）。③ 新建项目按钮桌面/移动统一渐变实色，且都落在 ViewSwitcher 行左侧。


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
| `MobileGlobalOverview`(mobile-workbench) | 实例聚合（grouped/grid/table），无项目列表/新建/删除 | **重构为 [项目] 总览**：header + 新建项目（useCreateProject + ProjectSetupPanel Dialog）+ grouped 分组标题点击进项目（/projects/$key）+ 分组标题右侧 ⋯ 删除项目（deleteProject + useConfirm）+ ViewSwitcher；删 inspection tab 行 + 插件分支 |
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
