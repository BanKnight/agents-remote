# 工作台多视图重设计 · 实施计划

> 配套设计文档：[workbench-views.md](./workbench-views.md)（设计权威，16 节，**设计完整无「后续」**）。本文件只管 **HOW/WHEN**：phase 拆分、执行顺序、每 phase 任务、验证。
> 原则（memory `feedback_design_must_be_complete`）：设计完整，实现按 phase 渐进靠拢。每 phase 独立交付、独立验证、独立 commit。下次会话可直接照本文件接手。

## 设计复盘（2026-07-05）与 phase 重排

上一轮 P1-P5（2026-07-04）按「grid/table/split 三视图互斥 + split 三态状态机 + 底部 dock」实施，已全部交付。复盘发现两个问题：①聚焦态挤掉中栏 tab 导航和总览视图；②split 三态 + dock 操作复杂。重构为**中栏左右结构**（左总览固定单列 + 右工作区拖放分屏），取消独立 split 视图与三态。

| 旧 phase | 状态 | 在新设计中的角色 |
|---------|------|----------------|
| P1 cleanup（StatusDot + header padding） | ✅ `d8a0672` | **仍有效**（§8 状态指示、§12 header padding 复用） |
| P2 IA 基础（左栏条目 + 5 tab + ViewSwitcher + URL） | ✅ `29e002b`→`b77a677` | **部分有效**（左栏/5 tab/ViewSwitcher/URL 复用）；聚焦态 SplitLayout 渲染被 Phase A 取代 |
| P3 grid/grouped | ✅ `6168e64`→`17473f5` | **部分有效**（InstanceGrid/GroupedView 数据管道复用）；grid 从「多列自适应」收为「左总览单列」 |
| P4 table | ✅ `115ca57`→`b836a1c` | **仍有效**（SessionTable 收归左总览紧凑行） |
| P5 split 三态 + dock | ✅ `2b57fa3`→`5a05f97` | **废弃**（被中栏左右结构 + 自由分屏取代）；`SplitLayout` 的 resize/maximize/`PanelRouter` 复用，三态状态机/dock/`panel-preview-cache` 删除 |

新 Phase A/B/C 在 P1-P4 基线上重构中栏，取代旧 P5：

```
P1-P4（已交付基线）─→ Phase A（中栏左右骨架 + 单 group + 激活）─→ Phase B（拖放分屏）─→ Phase C（group 操作+持久化）
                            │ 取代旧 P5 聚焦态 SplitLayout + 三态/dock
                            └─ 修复「聚焦态挤掉导航/视图」痛点
```

## 执行顺序与依赖

```
Phase A workbench-middle-left-right   (中栏左右骨架 + 单 group + 激活语义)
    │  产出中栏左右结构 + 活动 group 模型，供 B/C 复用
    ▼
Phase B workbench-drag-split          (5 drop zone 拖放 + group 网格布局)
    │
    ▼
Phase C workbench-group-ops-persist   (resize/maximize/close + 持久化)
```

- 严格顺序 **A → B → C**：B 依赖 A 的左右结构与活动 group 模型；C 依赖 B 的多 group 网格。
- **A 是核心重构**（解决「聚焦态挤掉导航/视图」痛点 + 废弃旧 P5 三态）；B/C 在 A 基础上叠加分屏能力。

## 跨 phase 约定（每个 phase 都遵守）

**代码与样式**
- DESIGN.md 是 token 唯一权威源：颜色用 token（`surface*`/`on-surface*`/`neutral-line`/`primary`/`success`/`warning`/`error` + 角色色 `assistant*`/`user*`/`permission*`），禁裸 Tailwind 色阶。映射查 `docs/design/DESIGN.md` 对照表 + `frontend-notes.md` §2。
- i18n 强制：所有面向用户字符串走 `t("key")`，新 key 同时加 `web/src/i18n/zh.ts` 和 `en.ts`。
- 不新增魔数：数值提取命名常量（如 `MIDDLE_LEFT_COLUMN_REM`、`MIN_CARD_WIDTH_PX = 220`）。
- 优先修改、克制新增；从根因修不加 state；React 遵循 `vercel-react-best-practices` skill。

**门禁（每次 commit 前，0 warning 0 error）**
```
bun run format:check && bun run lint && bun run typecheck && bun run test
```

**CSS 落盘铁律**（memory `build-watch-css-not-flushed`）：web 跑 `scripts/ar-dev-web.sh`（preview + build --watch），build --watch 偶尔漏落盘 CSS。每次改 web 后：`curl -sI localhost:43012/assets/<css> | grep content-type` 必须 = text/css；若 text/html → `touch web/src/main.tsx`（不是 index.css）触发 rebuild 并轮询。

**CSS 验证用 DOM 几何**（memory `verify-css-via-dom-geometry-not-vision`）：Playwright `getComputedStyle`/`getBoundingClientRect` 取硬数据对比 token hex，不用 vision 模型读截图。

**dev 进程**：tmux `ar-dev`，API 43011（dev）/ Web 43012（prod preview），进程须 PPID≠1。

**git**：直接在 main 开发；`git -C /home/deploy/workspace/agents-remote`，别用 `--git-dir`/`--work-tree`（memory `git-commit-avoid-explicit-gitdir`）；commit 页脚 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`；不提交 0 字节 `web/src/index.css` 孤儿。

**节奏**（memory `feedback_incremental_ui_changes`）：按用户明确指令逐 phase 推进，每 phase 进 plan mode 对齐后实现，不擅自批量。

## Phase 清单

### Phase A · `workbench-middle-left-right`（中栏左右骨架）

**目标**：中栏分左右（左总览固定单列卡片 + 右工作区 flex-1，gutter 调比例）+ 右工作区单 group（首个活跃实例）+ 激活语义（左总览单击/右工作区点 group = `focusId` → 右栏 inspection 跟随 + 左总览高亮）+ tab 导航常驻（**修复聚焦态挤掉 tab 痛点**）+ 删除旧 P5 三态/dock。对应设计 §2 §3 §4 §5 §6 §11 §13 §14。

**任务**
1. **中栏左右布局**（`instance-area.tsx` overview 分支重构，或抽 `MiddleLeftRight` 组件）：overview tab 渲染时，中栏内部分左右——左总览（固定 ~220–240px，提常量 `MIDDLE_LEFT_COLUMN_REM`）+ 右工作区（flex-1）+ gutter 调比例（复用 `workbench-shell.tsx` `ColumnResizeGutter` 设计，atom 记忆宽度）。
2. **左总览**（左半）：复用 P3 `InstanceGrid`（容器固定宽 → `auto-fill` 退化为单列）+ P4 `SessionTable`（table 视图）+ `GroupedView`（global grouped）。view switcher 在左总览顶部（tab 行右侧）。单击卡片 = 激活（`navigateWorkbench(scope, sessionId)`）。
3. **右工作区**（右半）：单 group = `PanelRouter`（聚焦/活动实例）。初始 = scope 首个活跃实例（`useScopeInstanceOrder` 首项）。无活跃实例 → 空态提示（§14）。
4. **聚焦态重构（核心）**：移除 `InstanceArea` 的「`focusId` → `splitContent` fallthrough」（`showGrid/showGrouped/showTable` 守卫 `focusId === undefined` 条件 + 聚焦态 header 分支）。聚焦态中栏仍是左右结构（左总览 + 右工作区），右工作区活动 group = `focusId`。
5. **tab 导航常驻**：聚焦/非聚焦都渲染 5 tab + view switcher（删除聚焦态「实例名 header」分支，实例名收进右工作区 group header）。
6. **右栏 inspection 跟随**：`RightPanelTabs` ctx.focusId = 右工作区活动 group（现状已如此，确认无回归）。
7. **URL 模型**：`focusId` = 右工作区活动 group（语义不变，渲染层变化）；`?view`/`?tab`/`?rightTab` 正交（现状）。
8. **删除旧 P5 三态/dock**：`split-panel.tsx` 的 `PanelViewState`/`SplitDock`/`DockChip`/三态渲染 + `panel-preview-cache.ts`/`panel-preview.tsx` 删除；`workbench-model.ts` 的 `panelStates`/`setPanelState`/`initPanelStates` 删除；保留 `addPanel`/`removePanel`/`resizePair`/`toggleMaximize`/`deriveRows`/`WorkbenchPanelRef`（B/C 复用）。`SplitLayout` 暂保留为单 group 渲染容器（B 改造为多 group 网格）。i18n 清理 P5 的 dock/三态 key。
9. **移动端无回归**：移动不分左右（`MobileWorkbench` 不变），确认 `MobileFocusBody`/`MobileProjectOverview`/`MobileGlobalOverview` 不受 Phase A 桌面改动影响。
10. 验证。

**验证**：门禁全绿；CSS 落盘；Playwright DOM 几何（中栏左右结构：左总览固定宽 `getBoundingClientRect` + 右工作区 flex-1 + gutter；**聚焦态 tab 导航常驻不消失**——痛点修复验证；左总览单击卡片 → 右工作区切活动 group + URL `focusId` + 右栏 inspection 跟随 + 左总览高亮；group header 实例名；空态；移动端无回归）+ 桌面截图。

**依赖**：P1-P4 基线。**待拍点**：无（设计 §13 已定激活语义；左总览单击 = 激活替换活动 group，拖动分屏在 Phase B）。

### Phase A 收尾 · `workbench-phase-a-followup`（4 项 UI/语义修订）

**背景**：Phase A（`dfa280a`）落地后用户实测报 4 个问题。属 Phase A 遗漏/回归，非 Phase B/C 范畴，作为收尾一次修清。B/C 原计划不变。

**4 项修订**（设计 `workbench-views.md` §3/§4/§6 已同步）：
1. **history tab 全宽** —— 旧实现 history 归 `isWorkTab`（左右分栏：左 HistoryList + 右活动 group）。改：history 全宽历史列表，点会话 → resume + 切 overview tab + 聚焦（`history-list.tsx` navigate 函数式 `search: (prev) => ({...prev, tab:"overview"})`）。
2. **CreateSessionBar + ViewSwitcher 移到左总览顶部 header** —— 旧实现两者在 tab 行右侧 `ml-auto`。改：tab 行只剩纯 tab；左总览改 `flex flex-col`，顶部 header（CreateSessionBar project only + ViewSwitcher ml-auto），下方 overflow-y-auto 承载卡片。两者随左总览只在 overview tab 渲染。
3. **右栏非聚焦态可唤出** —— 旧实现 `rightPanel = focusId ? RightPanelTabs : null`，非聚焦态无唤出按钮（Phase A 让非聚焦成默认体验后暴露）。改：`WorkbenchShell` 新增 `rightPanelCollapsible` prop（解耦「可唤出」与「内容渲染」）；`WorkbenchRoute` `rightPanelCollapsible = scope.kind === "project"`，收起时 rightPanel=null（零 inspection query）但 RailButton 唤出；focusId effect（聚焦态展开 / 非聚焦默认收起）。关键简化：files/git inspection 只依赖 projectKey 不依赖 focusId，非聚焦唤出也能显示。
4. **global 一致** —— 修订 2/3 自然覆盖：global overview header 仅 ViewSwitcher（无 CreateSessionBar）；global `rightPanelCollapsible=false`（prototype 占位 render null，不唤出）。

**改动文件**：`instance-area.tsx`（修订 1+2）、`history-list.tsx`（修订 1 navigate）、`WorkbenchRoute.tsx` + `workbench-shell.tsx`（修订 3）、`workbench-views.md`（设计同步）。

**验证**：门禁全绿 + CSS 落盘 + Playwright DOM 几何（history 全宽无左右结构 + 点会话 URL `tab=overview`；CreateSessionBar/ViewSwitcher 在左总览 header `boundingBox().y` < 卡片 y，tab 行内无此两控件；project 非聚焦态右栏 RailButton 存在 + 点击展开 + 聚焦态自动展开；global 无 RailButton；移动端无回归）+ subagent 审查。

**依赖**：Phase A。**待拍点**：无（4 项决策用户已拍板，见设计同步节）。

### Phase B · `workbench-drag-split`（拖放分屏）

**目标**：5 drop zone 拖放分屏 + group 网格布局算法 + 多 group 同屏。对应设计 §7.2 §7.4。

**任务**
1. **拖放源**：左总览卡片可拖（HTML5 DnD 或 pointer events，与 `ColumnResizeGutter` 同款 pointer 方案一致）。拖动显示 ghost（marker + 会话名）。
2. **drop zone**（右工作区）：拖卡片悬停 group 上，显示 5 个半透明 zone（上/下/左/右/中心）+ 空白区（无 group 时）。zone 高亮跟随指针位置。
3. **分裂逻辑**：上/下 = 行方向插新行；左/右 = 列方向插新列；中心 = 替换 group 实例；空白 = 创建首个 group。
4. **网格布局算法**：`deriveRows` 扩展支持网格位置（group → row/col 邻接关系），行内 flex 等分列宽，行间 flex 等分行高。`addPanel` 接受位置参数。
5. **左总览拖动 vs 单击区分**：单击 = 激活替换活动 group（Phase A 行为）；拖动 = 加分屏（本 phase）。
6. 验证。

**验证**：门禁全绿；CSS 落盘；Playwright（5 drop zone 视觉 + 拖放分裂：上/下/左/右/中心/空白各验证；多 group 网格布局几何；拖动 vs 单击区分）+ 桌面截图。

**依赖**：Phase A。

### Phase C · `workbench-group-ops-persist`（group 操作 + 持久化）

**目标**：group resize/maximize/close + 布局持久化。对应设计 §7.3 §7.5。

**任务**
1. **resize**：group 间 gutter（行内调列宽 + 行间调行高）。复用 `resizePair` 扩展网格行列。
2. **maximize**：□ 全屏/恢复。复用 `toggleMaximize`。
3. **close**：× → `useCloseSession`（confirm → close API → 精确失效缓存）+ `removePanel` + 焦点切换剩余首个 group（无剩余 → `focusId` 清空回非聚焦态）。
4. **持久化**：group 布局（实例 → 网格位 + flex 权重 + maximize 态）存 layout atom（`atomWithStorage` localStorage，scope-scoped）。scope 切换独立布局。
5. **空行合并**：group close 后行内 group 数归 0 则消除该行，剩余行重新分配高度。
6. 验证。

**验证**：门禁全绿；CSS 落盘；Playwright（resize/maximize/close 行为 + 持久化：刷新恢复布局 + scope 切换独立 + 空行合并）+ 桌面截图。

**依赖**：Phase B。

## 旧 phase 交付记录（P1-P5，2026-07-04，归档基线）

> 详细 commit 链保留作为基线参考。P1-P4 产出仍有效，P5 已废弃（Phase A 删除）。

- **P1** `d8a0672`：`StatusDot` primitive（纯色小圆点，token 色）+ `MobilePageHeader` `px-3`。
- **P2** `29e002b`→`b77a677`：左栏条目列表 + 中栏 5 tab + `ViewSwitcher` primitive + URL `?view`/`?tab` 模型 + `workbenchViewAtom`/`workbenchMiddleTabAtom` + 历史拆出 `HistoryList`/`useHistorySessions` + `useCreateSession` + 移动 history tab/ViewSwitcher + `useFocusSessionName`。
- **P3** `6168e64`→`17473f5`：`InstanceGrid` + `INSTANCE_GRID_STYLE`（`minmax(220px,1fr)`）+ `useProjectInstances` + `instanceToGridItem`/`candidateToGridItem` + `groupByProject`（+ 测试）+ `GroupedView` + 移动 `MobileGlobalOverview` 复用。
- **P4** `115ca57`→`b836a1c`：`updatedAt` 端到端（shared → api → web）+ `SessionTable` presentational + `instanceToTableRow`/`candidateToTableRow`/`TableRowCallbacks` + 移动 project table（4 列）。
- **P5** `2b57fa3`→`5a05f97`（**废弃**）：`PanelViewState` 三态 + `panelStates`/`setPanelState`/`initPanelStates` + `SplitPanel` 三态渲染 + `SplitDock`/`DockChip` + `panel-preview-cache`/`panel-preview` + `usePanelMeta`。Phase A 删除三态/dock/preview，保留 `addPanel`/`removePanel`/`resizePair`/`toggleMaximize`/`deriveRows`/`PanelRouter`/`usePanelMeta`。

## 关键代码入口

实现时用 codegraph/grep 定位最新行号（会漂移）：

- 工作台路由：`web/src/routes/WorkbenchRoute.tsx`（`WorkbenchContent` = 桌面 `WorkbenchShell` / 移动 `MobileWorkbench`；`useIsDesktopViewport()` ≥1024px；四个路由薄壳 `ProjectScopeRoute`/`ProjectFocusRoute`/`GlobalScopeRoute`/`GlobalFocusRoute`）。
- 桌面 shell：`web/src/components/shell/workbench-shell.tsx`（左 `WorkbenchLeftRail` + 中 `InstanceArea` + 右 `RightPanelTabs`；`ColumnResizeGutter` 复用模板；`--workbench-left/right-col` CSS 变量）。
- 中栏实例区：`web/src/components/workbench/instance-area.tsx`（`InstanceArea` + `useCloseSession` + `useGlobalInstanceCandidates` + overview/history/inspection tab 分支 + 聚焦态 fallthrough——Phase A 重构核心）。
- split 面板：`web/src/components/workbench/split-panel.tsx`（`SplitLayout` + `deriveRows` + resize/maximize；三态/dock Phase A 删除）。
- 左栏：`web/src/components/workbench/left-rail.tsx`（`WorkbenchLeftRail` + `ProjectInstances` + `ShellSectionLabel`）。
- 移动工作台：`web/src/components/workbench/mobile-workbench.tsx`（`MobileWorkbench` + `MobileFocusBody` + `MobileProjectOverview` + `MobileGlobalOverview`——Phase A 不动）。
- workbench model：`web/src/routes/workbench-model.ts`（scope/layout atom `useWorkbenchLayout`、`useScopeInstanceOrder`、`rankGlobalInstances`、`addPanel`/`removePanel`/`resizePair`/`toggleMaximize`/`deriveRows`、`filterWorkbenchViews`、URL search 校验）。
- shell primitive：`web/src/components/shell/shell-primitives.tsx`（`InstanceGrid`/`InstanceCard`/`StatusDot`/`statusToTone`/`IconMarker`/`NavItemContent`/`ShellSectionLabel`/`MobilePageHeader`/`ViewSwitcher`/`shellSurfaceClasses`）。
- 右栏 inspection：`web/src/components/workbench/right-panel-tabs.tsx` + `right-panel-plugin.tsx`（`FIRST_PARTY_PLUGINS` + `PluginContext`）。
- i18n：`web/src/i18n/{en,zh}.ts`。

## 完成定义

每个 phase：门禁全绿 + CSS 落盘 + Playwright DOM 几何验证 + 桌面截图（移动端无回归） + commit（+ push，用户已授权）+ subagent 审查（实现 vs 设计/plan 查漏补缺）。全部 A/B/C 完成后，workbench-views.md §1–§14 完整落地。
