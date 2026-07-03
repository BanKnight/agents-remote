# 工作台多视图重设计 · 实施计划

> 配套设计文档：[workbench-views.md](./workbench-views.md)（设计权威，17 节，所有「用户决定」标注出处）。本文件只管 **HOW/WHEN**：phase 拆分、执行顺序、每 phase 任务、验证、待拍点。
> 长任务，按用户「多拆任务」诉求拆成 5 phase。每个 phase 独立交付、独立验证、独立 commit。下次会话可直接照本文件接手，无需重新探索。

## 执行顺序与依赖

```
Phase 1 cleanup-status-dot-header-padding   (独立，最小，先做)
    │  (产出 StatusDot primitive，供 P3/P4/P5 复用)
    ▼
Phase 2 workbench-ia-restructure            (IA 基础：左栏条目列表 + 中栏 5 tab + 视图切换 primitive + URL)
    │  (产出 ViewSwitcher primitive + URL 模型，供 P3/P4/P5 复用)
    ├──→ Phase 3 workbench-grid-grouped-views   (grid 自适应 + grouped)
    ├──→ Phase 4 workbench-table-view           (table 含会话名列)
    └──→ Phase 5 workbench-split-redesign       (面板状态机 + 底部 dock)
```

- 建议顺序：**P1 → P2 → P3 → P4 → P5**（grid/grouped 先于 table/split，grid 是总览默认视图候选）。
- P3/P4/P5 之间无依赖，可调序或并行。

## 跨 phase 约定（每个 phase 都遵守）

**代码与样式**
- DESIGN.md 是 token 唯一权威源：颜色用 token（`surface*`/`on-surface*`/`neutral-line`/`primary`/`success`/`warning`/`error` + 角色色 `assistant*`/`user*`/`permission*`），禁裸 Tailwind 色阶。映射查 `docs/design/DESIGN.md` 对照表 + `frontend-notes.md` §2。
- i18n 强制：所有面向用户字符串走 `t("key")`，新 key 同时加 `web/src/i18n/zh.ts` 和 `en.ts`。
- 不新增魔数：数值提取命名常量（如 `MIN_CARD_WIDTH_PX = 220`）。
- 优先修改、克制新增；从根因修不加 state；React 遵循 `vercel-react-best-practices` skill。

**门禁（每次 commit 前，0 warning 0 error）**
```
bun run format:check && bun run lint && bun run typecheck && bun run test
```

**CSS 落盘铁律**（memory `build-watch-css-not-flushed`）：web 跑 `scripts/ar-dev-web.sh`（preview + build --watch），build --watch 偶尔漏落盘 CSS。每次改 web 后：`curl -sI localhost:43012/assets/<css> | grep content-type` 必须 = text/css；若 text/html → `touch web/src/main.tsx`（不是 index.css）触发 rebuild 并轮询。

**CSS 验证用 DOM 几何**（memory `verify-css-via-dom-geometry-not-vision`）：Playwright `getComputedStyle`/`getBoundingClientRect` 取硬数据对比 token hex，不用 vision 模型读截图。

**dev 进程**：tmux `ar-dev`，API 43011（dev）/ Web 43012（prod preview），进程须 PPID≠1。

**git**：直接在 main 开发；`git -C /home/deploy/workspace/agents-remote`，别用 `--git-dir`/`--work-tree`；commit 页脚 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

**节奏**（memory `feedback_incremental_ui_changes`）：按用户明确指令逐 phase 推进，每 phase 进 plan mode 对齐后实现，不擅自批量。

## Phase 清单

### Phase 1 · `cleanup-status-dot-header-padding`（独立，先做）

**目标**：状态指示从「带背景文字 badge」统一为「纯色小圆点」；移动 header padding 对齐正文区。为 P3/P4/P5 铺好 StatusDot primitive。

**任务**
1. `shell-primitives.tsx` 新增 `StatusDot({ tone, label })` primitive：纯色小圆点（尺寸提常量），`aria-label={label}`，tone 复用 `statusToTone`，颜色用 token（`bg-success`/`bg-warning`/`bg-error`/`bg-on-surface-muted`）。
2. grep 所有 `StatusPill` 用法，区分「纯状态指示」(→ StatusDot) vs「需要文字 label」(留 StatusPill)。
3. 替换三处纯状态展示：InstanceCard（卡片）、左栏 list 活跃实例、历史 session 列表。
4. `MobilePageHeader` className `px-2` → `px-3`。
5. 验证。

**验证**：门禁全绿；CSS 落盘；Playwright DOM 几何（StatusDot background-color 对 token hex + MobilePageHeader padding 几何 + 窄屏 header 不挤）；桌面+移动截图。

**依赖**：无。**待拍点**：无（胶囊体用户单独提，不在本 phase）。

### Phase 2 · `workbench-ia-restructure`（IA 基础）

**目标**：桌面/移动统一「二级导航」理念——左栏重构为导航条目列表，中栏承载 5 tab + 视图切换器。产出 ViewSwitcher primitive + URL 模型，供 P3/P4/P5 落地具体视图。

**任务**
1. 左栏重构（`left-rail.tsx` `WorkbenchLeftRail`）：从「项目+实例树」改为「导航条目列表」——固定条目「全局总览」(→ global scope) + 动态项目条目 (→ project scope) + 预留扩展位。条目建模为 `{ type, ... }` 有序列表。实例/历史从左栏移除（进中栏 tab）。
2. 中栏二级导航 5 tab（`workbench-shell.tsx`/`instance-area.tsx`）：总览 / 历史 / 文件 / Git / 原型。桌面在中栏顶部，移动在 header 下一行（横向滚动）。历史 tab 从 `ProjectInstances` 拆出独立（移动端也加）。
3. ViewSwitcher primitive（`shell-primitives.tsx` 或 `workbench-model.ts`）：segmented control，icon only，常驻；按 scope 隐藏不适用的视图（project 隐藏 grouped；移动隐藏 grouped + split）。位置：桌面 tab 行右上角从右到左排开；移动 tab 行下一行右侧。**icon 精确顺序实现时与用户确认**。
4. URL 模型：`?view=grouped|grid|table|split`（视图）+ `?tab=overview|history|files|git|prototype`（二级导航），对齐现有 rightTab 做法。
5. split 重构前中间态（待拍点）：P2-P4 期间桌面 split 按钮**隐藏 + 「即将上线」标**，不进未重构的旧 InstanceArea。
6. 验证。

**验证**：门禁全绿；CSS 落盘；Playwright 走 golden path（左栏条目切换 scope、5 tab 切换、URL `?view`/`?tab` 记忆与刷新恢复、视图切换器按 scope 隐藏）；DOM 几何（tab 行/切换器位置）；桌面+移动截图。

**依赖**：建议 P1 先做（StatusDot 给总览实例展示用）。**待拍点**：聚焦态 header 的 session 名位置（建议 header 内联）、project 总览默认视图（建议 grid）、右栏显示时机（建议聚焦态显示、总览/历史 tab 隐藏）、视图切换器 icon 顺序、split 中间态。

### Phase 3 · `workbench-grid-grouped-views`

**目标**：落地 grid 视图（CSS 自适应）+ grouped 视图（桌面 global 跨项目分组）+ 移动 global 默认按项目分段。

**任务**
1. grid 视图：`grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))`（Tailwind v4 任意值语法 `grid-cols-[repeat(auto-fill,minmax(220px,1fr))]`）；复用 InstanceCard（status 用 P1 的 StatusDot）；手机单列、平板 2 列、桌面自适应。
2. grouped 视图（仅桌面 global）：按项目分组，项目名做分隔标题，组内 grid 卡片。
3. 移动 global：grid 默认按项目分段（项目名分隔），但不作为可切换视图（无 grouped 按钮）。
4. project scope：无 grouped（P2 已隐藏按钮），总览用 grid/table。
5. 验证。

**验证**：门禁全绿；CSS 落盘；Playwright DOM 几何（grid 列数随容器宽度变化，`getBoundingClientRect` 验证卡片宽度 ≥220px 且自适应）；grouped 分组标题正确；移动 global 分段；桌面+移动+平板截图。

**依赖**：P2（ViewSwitcher + URL）+ P1（StatusDot）。**待拍点**：project 默认视图（建议 grid，影响 P2 默认值）。

### Phase 4 · `workbench-table-view`

**目标**：table 视图（含会话名列），桌面+移动。

**任务**
1. table 视图：列 = 项目（global 才显示，project 隐藏）/ 类型（marker）/ **会话名**（displayName，主列）/ 状态（P1 的 StatusDot + 可选 label）/ 最后活动 / 操作（▶ 进聚焦态、✕ 关闭走 `useCloseSession`）。
2. 桌面 + 移动都用（移动窄屏可横向滚动或隐藏部分列）。
3. 行点 ▶ → 进单实例聚焦态（不进 split）。
4. 验证。

**验证**：门禁全绿；CSS 落盘；Playwright（table 列正确、▶ 聚焦导航、✕ close 流程、移动窄屏不溢出）；DOM 几何；截图。

**依赖**：P2（ViewSwitcher + URL）+ P1（StatusDot）。**待拍点**：移动窄屏隐藏哪些列（建议隐藏「最后活动」或「项目」）。

### Phase 5 · `workbench-split-redesign`

**目标**：split 重构为「聚焦展开 + 其余缩略 + 底部 dock 收最小化」的多实例同屏工作台（仅桌面）。

**任务**
1. 面板三态状态机（`split-panel.tsx` + `workbench-model.ts` layout atom）：
   - **expanded**（聚焦，完整 output）
   - **缩略**（header + output 末 2 行预览）
   - **最小化**（收进底部 dock chip）
   状态进 layout atom，持久化 localStorage。**初版单 expanded**（点缩略 → 原 expanded 自动缩略）。
2. 初始态：URL focusId 指向的面板 = expanded，其余缩略；无 focusId 时第一个实例 expanded。
3. 底部 dock（Windows 任务栏式）：chip = marker + session 名（截断），点击恢复为缩略面板；dock 仅在有最小化面板时出现，横跨中栏底部。
4. 缩略面板操作按钮：`□`（展开/最小化切换）、`✕`（关闭走 `useCloseSession`）。复用现有 resize/maximize。
5. 验证。

**验证**：门禁全绿；CSS 落盘；Playwright（面板三态切换、初始态聚焦展开、dock chip 恢复、close 流程、resize/maximize 不回归）；DOM 几何（缩略面板高度、dock 位置）；桌面截图（移动无 split）。

**依赖**：P2（URL focusId + ViewSwitcher）。**待拍点**：split 单/多 expanded（建议单）、视图切换器进入 split 的 icon 顺序。

## 待拍点汇总（实现前与用户确认）

详见 [workbench-views.md §15](./workbench-views.md#15-待定项--后续)。影响实现的：

| 待拍点 | 建议 | 影响 phase |
|--------|------|-----------|
| 聚焦态 header 的 session 名位置 | header 内联（不另做侧边 dock） | P2 / P5 |
| project 总览默认视图 | grid | P2（默认值）/ P3 |
| 右栏显示时机 | 聚焦态显示，总览/历史 tab 隐藏 | P2 |
| 视图切换器 icon 从右到左顺序 | 实现时确认 | P2 |
| split 单/多 expanded | 单 expanded | P5 |
| split 重构前中间态（P2-P4 桌面 split 按钮） | 隐藏 + 「即将上线」标 | P2 |
| table 移动窄屏隐藏列 | 隐藏「最后活动」或「项目」 | P4 |
| + 按钮胶囊体 | 用户单独提，不在本计划 | 无 |

## 关键代码入口

实现时用 codegraph/grep 定位最新行号（会漂移）：

- 工作台路由：`web/src/routes/WorkbenchRoute.tsx`（WorkbenchContent = 桌面 WorkbenchShell / 移动 MobileWorkbench；`useIsDesktopViewport()` ≥1024px）。
- 桌面 shell：`web/src/components/workbench/workbench-shell.tsx`（左 WorkbenchLeftRail + 中 InstanceArea + 右 RightPanelTabs）。
- 左栏：`web/src/components/workbench/left-rail.tsx`（WorkbenchLeftRail + ProjectInstances）。
- 中栏实例区：`web/src/components/workbench/instance-area.tsx`（InstanceArea + useCloseSession + useGlobalInstanceCandidates + closePanel + seededRef）。
- split 面板：`web/src/components/workbench/split-panel.tsx`（SplitLayout + resize/maximize）。
- 移动工作台：`web/src/components/workbench/mobile-workbench.tsx`（MobileWorkbench + MobileFocusBody + MobileGlobalOverview）。
- shell primitive：`web/src/components/shell/shell-primitives.tsx`（InstanceCard / StatusPill / statusToTone / sessionMarker / MobilePageHeader / IconMarker / NavItemContent）。
- workbench model：`web/src/components/workbench/workbench-model.ts`（scope/layout atom、useScopeInstanceOrder、rankGlobalInstances）。
- console model：`web/src/components/workbench/console-model.ts`（sessionStatusLabel）。
- i18n：`web/src/i18n/{en,zh}.ts`。

## 完成定义

每个 phase：门禁全绿 + CSS 落盘 + Playwright DOM 几何验证 + 桌面/移动截图 + commit（+ push，用户已授权）。全部 5 phase 完成后，workbench-views.md §1-§14 的设计全部落地，§15 待拍点在实现中逐一与用户确认并回写设计文档。
