# 全局活动栏重设计 —— 实施计划（草案）

> **状态：草案，待用户审阅**。设计基线见 [`activity-bar-redesign.md`](./activity-bar-redesign.md)（§6 已定决策、§8 现状锚点）。本计划据此分阶段落地，**每 phase 不偏离设计文档结构语义**。先文档后代码（`design-docs-before-code`）。
>
> **核心洞察**（来自 §8 盘点）：新「左栏 + 中栏」= 现状 `InstanceArea` 内部已有的「左总览 + 右工作区」，分割已就位；`WorkbenchMiddleTab` 零改动复用。所以本重构**不是重画中栏**，而是：外壳加活动栏 + 左栏内容源切换 + tab bar 换位。

## 总览

| Phase | 目标 | 主要文件 | 验证 |
|---|---|---|---|
| 0 | 活动栏导航 state + primitive | workbench-model / 新 ActivityBar / MobilePrimaryNav | typecheck + 单测 |
| 1 | 桌面外壳四栏 | workbench-shell / WorkbenchContent | Playwright 几何 |
| 2 | 左栏随导航切换（[项目]/[文件]/[设置]） | WorkbenchContent / InstanceArea 左总览 / left-rail 拆解 | Playwright + 手测 |
| 3 | 进入项目后左栏顶部多导航 | InstanceArea tab bar 位置 | Playwright + 手测 |
| 4 | 移动端对应（胶囊 + 删 HomeRoute 项目列表） | mobile-workbench / MobilePrimaryNav / HomeRoute | 真机 |
| 5 | 全门禁 + 回归 | — | format/lint/typecheck/test/build/e2e |

## Phase 0：活动栏导航 state + primitive

**目标**：建立「一级导航 项目/文件/设置」的 state 与两端 primitive，暂不接业务。

任务：
1. `workbench-model.ts` 新增 `WorkbenchNav = "projects" | "files" | "settings"` + `workbenchNavAtom`（决策点①）。
2. 新增桌面 `ActivityBar`（竖工具条，3 个 icon button，active 高亮）—— `web/src/components/shell/activity-bar.tsx`，对照 DESIGN.md token。
3. 移动 `MobilePrimaryNav` 改造为 项目/文件/设置 胶囊（先确认现状项）。

验证：typecheck + ActivityBar 单测（active 态、点击回调）。

## Phase 1：桌面外壳四栏

**目标**：`WorkbenchShell` 从三栏扩为 `[活动栏 | 左栏 | 中栏 | 右栏]`，活动栏常驻。

任务：
1. `WorkbenchShell` grid 加活动栏列（决策点②）。
2. `WorkbenchContent` 接入 `<ActivityBar>`；活动栏窄竖条，不受 leftCollapsed 影响（常驻）。
3. 右栏不动。

验证：Playwright `getBoundingClientRect` 四栏几何 + 活动栏常驻（收起左栏时活动栏仍在）。

## Phase 2：左栏随导航切换

**目标**：活动栏 [项目]/[文件]/[设置] 切换左栏（= InstanceArea 左总览）内容；删 WorkbenchLeftRail 项目列表。

任务：
1. [项目]：左栏 = 全局总览（复用 GroupedView/InstanceGrid + ViewSwitcher）+ 新建项目（ProjectSetupPanel 迁此）+ 进入项目（ProjectNode 点击 → /projects/$key）。
2. [文件]：左栏 = 文件树（复用 Files plugin tree），点文件 → 中栏新开预览 tab（决策点③）。
3. [设置]：沿用 SettingsRoute/SettingsFlyout（决策点④）。
4. 删 `WorkbenchLeftRail` 项目列表段；全局节点/设置入口由活动栏取代。

验证：Playwright 三导航左栏内容切换 + 手测新建/进入项目。

## Phase 3：进入项目后左栏顶部多导航

**目标**：进入项目 scope 后，tab bar（实例/历史/文件/git）从 InstanceArea 中栏顶部移到左栏顶部。

任务：
1. `InstanceArea` tab bar 位置重构：全局态（活动栏主导）vs 项目态（左栏顶部多导航）分支。
2. git 在此出现（project-scoped，已定）。
3. 中栏 = 项目实例 group+tab（常驻，不变）。

验证：Playwright tab bar 位置（左栏顶部）+ 切换左栏子内容。

## Phase 4：移动端对应

**目标**：移动端胶囊 = 项目/文件/设置；删 HomeRoute 项目列表。

任务：
1. `MobilePrimaryNav` = 项目/文件/设置（Phase 0 已改 primitive，此 phase 接业务）。
2. [项目] = MobileGlobalOverview（+ 新建/进入）；[文件] = 文件树全屏 + 预览浮窗（保持现状）；[设置] = 设置页。
3. 删 `HomeRoute` 项目列表；`/` 移动 = [项目] 总览。
4. 进入项目后：MobileFocusBody + 返回按钮 + 胶囊保留（现状一致）。

验证：真机（test 项目）三导航 + 进入项目返回。

## Phase 5：全门禁 + 回归

`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build && bun run e2e`。

## 已定决策（plan 内，第 4 轮 resolved）

- **① 活动栏 nav 存储** = `workbenchNavAtom`（localStorage 记忆，不进 URL；与 `workbenchViewAtom` 同款）。
- **② 活动栏落位** = WorkbenchShell 新增第 0 列（四栏 `[活动栏|左栏|中栏|右栏]`）。
- **③ [文件] 预览 tab** = 并入 WorkbenchLayoutV3（与实例 tab 共享 group+tab）。
- **④ [设置] 集成** = 跳转 SettingsRoute（离开工作台，沿用现状）。

## 提交约定

dev-on-main；commit 以 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` 结尾；不用 `--git-dir/--work-tree`；md 不进 format 门禁；每 phase 独立 commit + 全门禁；改 web 后主动验证 CSS 落盘（`touch web/src/styles/index.css` + grep dist）。
