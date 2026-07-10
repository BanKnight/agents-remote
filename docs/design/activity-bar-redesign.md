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
- **2026-07-10 协商第 2 轮**：①『左栏』= `InstanceArea` 左总览区——本就是这一列（用户一贯称『左栏』），**非新增列、非"提升"**；切活动栏只换左栏，中栏(右工作区 group+tab)不变。此前文档"提升"措辞把简单事说复杂，已订正。② **git 归属**：不在全局 [文件] 导航；在**进入项目后**出现（project-scoped）。③ **进入项目后左栏顶部多导航**：左栏顶部出现 tab 组（如目前移动端做法），切换左栏内容；git 为其一，具体清单待盘点移动端现状。
- **2026-07-10 协商第 3 轮（3 待定点 resolved）**：① 进入项目后左栏顶部多导航 = **实例 / 历史 / 文件 / git**（= 现状 `WorkbenchMiddleTab` overview/history/files/git，复用现状）。② 移动端 [文件] = **文件树全屏 + 预览浮窗**，保持现状移动端 Files 做法不变。③ [设置] = **特例**，不套「活动栏切左栏」模型，点击沿用现有 `SettingsRoute` 设置页（桌面端左栏/中栏不切换）。**结构语义至此完整，无剩余结构待定点。**
- **2026-07-10 协商第 4 轮（plan 4 决策点 resolved）**：① 活动栏 nav 存 `workbenchNavAtom`（localStorage，不进 URL）。② 活动栏 = WorkbenchShell 新增第 0 列（四栏）。③ [文件] 预览并入 WorkbenchLayoutV3（与实例 tab 共享 group+tab）。④ [设置] = 跳转 SettingsRoute（离开工作台）。**plan 全部决策点敲定，可进入实现。**

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
  [文件]  左栏 = 文件地址栏（文件树）  ‖  中栏 = 点文件新开预览 tab
  [设置]  特例：不套「切左栏」模型，点击沿用现有 SettingsRoute 设置页（左栏/中栏不切换）

  （中栏始终 = group+tab 工作区，常驻不随导航变）

进入项目层（project scope，一级导航常驻）：
  左栏顶部多导航 tab（如目前移动端）= 实例 / 历史 / 文件 / git
    （= 现状 WorkbenchMiddleTab overview/history/files/git，复用现状）
    → git 在此出现（project-scoped，已定）
  中栏 = 项目实例 group+tab（与现状一致）
  右栏 = inspection（本轮不动）
```

### 4.3 进入项目后（要点）

- 一级导航常驻；scope global → project。
- 左栏顶部多导航 tab（见 §4.2 进入项目层），git 在此出现（project-scoped）。
- 中栏 group+tab、右栏 inspection 与现状一致（本轮不动）。

## 5. 移动端

```
全局层：内容区 + 底部胶囊 [项目][文件][设置]
  [项目] → 全局总览（卡片+多视图+新建/进入）
  [文件] → 文件树全屏 + 预览浮窗（= 现状移动端 Files 做法，保持不变）
  [设置] → 设置页（沿用现状）
进入项目后：项目实例工作台（与现一致）+ 返回按钮，底部胶囊保留（已定）
```

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

## 7. 待定点

> 主确认点（中栏语义）于第 1.5 轮关闭；3 个结构细节待定点于第 3 轮解决（§6 第 11-13）；4 个 plan 决策点于第 4 轮解决（§6 第 14-17）。
>
> **全部待定点已清空。** 现状盘点见 §8，分阶段落地见 [`activity-bar-redesign-plan.md`](./activity-bar-redesign-plan.md)。

## 8. 现状代码锚点（盘点完成）

> **核心发现**：新「左栏 + 中栏」= 现状 `InstanceArea` 内部已有的「左总览 + 右工作区」，内部分割已就位；`WorkbenchMiddleTab`(overview/history/files/git) = 用户定的进入项目后左栏多导航清单（实例=overview），零改动复用。改动集中在：① 外壳加「活动栏」；② 左栏内容源从 `WorkbenchLeftRail`（项目列表）切换为「随活动栏变」；③ 进入项目后 tab bar 从中栏顶部移到左栏顶部。

### 8.1 路由与组装

| 符号 | 现状 | 新结构对应 |
|---|---|---|
| `router.tsx` | `/` `/projects/$key` `/projects/$key/session/$id` `/global` `/global/session/$id` `/settings`；视口分流在组件层（`useIsDesktopViewport`，非 redirect）；search `?rightTab ?view ?tab` | 路由不变；活动栏项是否进 URL（`?nav=`）plan 定 |
| `WorkbenchRoute.tsx` `WorkbenchContent` | `!isDesktop→<MobileWorkbench>`；桌面 `<WorkbenchShell leftPanel={<WorkbenchLeftRail>} rightPanel><InstanceArea/></WorkbenchShell>` | leftPanel 改为活动栏 + 随导航切换的左栏内容；注入 nav state |
| `WorkbenchRoute.tsx` `IndexRoute` | `/`：桌面=global 工作台，移动=`<HomeRoute>` | 移动 HomeRoute 删除 → `/` 移动 = 活动栏 [项目] 总览 |

### 8.2 外壳

| 符号 | 现状 | 新结构对应 |
|---|---|---|
| `workbench-shell.tsx` `WorkbenchShell` | 三栏 grid `[leftPanel\|children\|rightPanel]`，`lg:grid-cols-[leftcol_1fr_rightcol]`；无活动栏列 | 加活动栏列 → 四栏 `[活动栏\|左栏\|中栏\|右栏]`（plan 定：新增第 0 列 vs leftPanel 改造） |

### 8.3 中栏 = 新左栏 + 新中栏（`InstanceArea`）

| 符号 | 现状 | 新结构对应 |
|---|---|---|
| `instance-area.tsx` `InstanceArea` | 永远左右：**左总览**（单列卡片 grid/table/grouped + ViewSwitcher + CreateSessionBar）+ **右工作区**（`WorkbenchLayoutV3` group+tab 分屏） | 左总览=新左栏；右工作区=新中栏（常驻）。主要改左总览内容源 + tab bar 位置 |
| tab bar `buildOverviewTabs`(overview/history/files/git) | 中栏顶部，按 scope 过滤（global=overview+files；project=全量） | 进入项目后 → 左栏顶部多导航（实例/历史/文件/git） |
| `leftOverviewContent` | overview tab 左总览 grid/grouped/table 分支 | [项目] 左栏 = 此 + 新建/进入项目 |
| `workbench-model.ts` | `WorkbenchMiddleTab`=overview/history/files/git + atom（view/middleTab/rightCollapsed/middleLeftWidth/mobile*） | **零改动复用**（= 用户定的左栏多导航清单）；新增 nav state |

### 8.4 左栏内容源（删除/改造）

| 符号 | 现状 | 新结构对应 |
|---|---|---|
| `left-rail.tsx` `WorkbenchLeftRail`/`ProjectTree` | GlobalNavNode + ProjectsSectionHeader(项目段折叠) + ProjectNode 列表(→/projects/$key) + 新建 Dialog(ProjectSetupPanel) + 设置入口(→SettingsFlyout) | 项目列表**删除**；新建项目(ProjectSetupPanel)迁 [项目] 左栏；设置入口由 [设置] 活动栏取代 |

### 8.5 右栏（不动）

| 符号 | 现状 | 新结构对应 |
|---|---|---|
| `right-panel-tabs.tsx` `RightPanelTabs` | 右栏 inspection(files/git，FIRST_PARTY_PLUGINS) | 本轮不动 |

### 8.6 移动端

| 符号 | 现状 | 新结构对应 |
|---|---|---|
| `mobile-workbench.tsx` `MobileWorkbench` | !focusId: global→MobileGlobalOverview / project→MobileProjectOverview + MobilePrimaryNav；focusId→MobileFocusBody(header tab output/files/git + 返回) | 底部胶囊→项目/文件/设置；进入项目后保留+返回 |
| `MobilePrimaryNav`(shell/mobile-primary-nav) | 底部胶囊一级导航（现状项 plan 确认） | **改为 项目/文件/设置**（= 桌面活动栏） |
| `HomeRoute.tsx` | 移动 `/` 项目列表/总览 | 项目列表**删除**；`/` 移动=[项目] 总览 |
| `workbenchMobileOverviewTabAtom`/`FocusTabAtom` | 移动 tab 记忆 | 复用；新增移动 nav state |

### 8.7 设置

| 符号 | 现状 | 新结构对应 |
|---|---|---|
| `SettingsRoute.tsx` | `/settings` 独立路由 | [设置] 活动栏沿用（跳转 vs 内嵌 plan 定） |
| `SettingsFlyout` + `workbenchSettingsFlyoutOpenAtom` | 桌面设置浮层（LeftRail 底部按钮触发） | [设置] 入口；flyout 保留 vs 改跳 plan 定 |

## 9. 落地阶段

> 分阶段执行计划见 [`activity-bar-redesign-plan.md`](./activity-bar-redesign-plan.md)（6 phase：0 导航 state+primitive / 1 桌面四栏 / 2 左栏随导航切换 / 3 进入项目后左栏多导航 / 4 移动端 / 5 门禁）。
