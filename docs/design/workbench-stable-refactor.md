# 工作台中栏稳定 + 文件功能统一重构

> ⚙️ **持久设计文档（超长任务恢复锚点）**。本文档承载本轮"中栏跨 scope 稳定 + 文件功能统一重构"的全部决策、阶段计划与现状锚点。上下文压缩后**先 Read 本文「现状锚点」节**恢复进度，再继续。对齐 memory `long-task-document-to-avoid-context-loss`。

## 背景：3 个关联问题

1. **中栏进/出项目重建，终端 tab 重连**：用户要"进入项目前后中栏还是同一个，而不是看起来一样"。
2. **活动栏 [文件] 锁死全局**：切到具体项目再切到全局文件，左栏不变化。
3. **桌面/移动全局文件两套实现**：用户要"两端同一个，参考全局项目在两端的实现，减少维护压力"。并提示"文件=树+预览两部分，散落多处（全局左栏/项目左栏/移动一级页/中栏 tab/浮窗）需重构去冗余"。

## 决策日志（用户拍板，逐字保留要点）

1. **问题 1 = 完整路由重构**：WorkbenchContent 提到共享 pathless layout route，子路由只解析 URL 写 atom，父渲染唯一 WorkbenchContent+Outlet，进出项目 InstanceArea 永不卸载（真正同一实例，非看起来一样）。
2. **中栏 tab 不限项目**：用户"tab 可承载很多东西，别只聚焦项目"。
3. **file tab 按"文件全路径"标识，不按 scope**：用户"全局/项目可能打开同一个文件预览，区分 scope 不合理，理应和文件全路径有关"。→ `FilePanelRef` 统一为 `kind:"file"; path: 全路径(含项目名前缀)`，**去掉 projectName 字段**，全局和项目点同一文件复用同一 tab。
4. **问题 2 = scope 优先于 nav + 进项目自动回 projects**：project scope 左栏恒走 ProjectLeftPanel（无视 nav=files），nav=files 仅 global scope 生效；进项目 effect 自动 setNav("projects")；活动栏 [文件] 改跳 `/files` 独立路由。
5. **问题 3 = 参照 GlobalProjectsOverview 抽 GlobalFilesOverview 两端共用**；移动浮窗复用 FileTabPreview 主体（移动不开多 tab，单文件浮窗）。
6. **文件树+预览去冗余**：抽统一文件主体组件，5 处复用，端差异靠 props/形态分支。
7. 禁截图（memory `no-screenshots-allowed`），DOM 几何验证；逐阶段 commit；长任务建持久设计文档。

## 已调研根因（文件:行号）

### 问题 1：中栏进/出项目重建
- `router.tsx:22-97` 七个 workbench 路由（`/`、`/projects`、`/projects/$key`、`/projects/$key/session/$id`、`/projects/$key/file/$`、`/projects/$key/git/$`、`/projects/session/$id`）全是 `rootRoute` 平级兄弟叶子，各自 `lazyRouteComponent` 挂不同 component，都渲染 `WorkbenchContent(scope 不同)`。
- 进/出项目 = TanStack Router unmount 整棵 `WorkbenchContent` 子树（`WorkbenchRoute.tsx:192`）→ `InstanceArea`(`instance-area.tsx:268`) → `WorkspaceTree`(`:1949`) → 所有 `PanelRouter`(`:2014` key=tabId) unmount → WebSocket（终端 `SessionDetailRoute.tsx:207`、Claude2 `claude2-adapter.ts:4050`，都在 useEffect mount 建/unmount 断）+ xterm 全部重建。
- `workbenchLayoutAtom`(`workbench-model.ts:1433` `workbenchLayoutV4`) 数据已单一化跨 scope 稳定，但承载它的组件实例被路由销毁。无 key prop 强制重建，纯路由 unmount 导致。

### 问题 2：活动栏 [文件] 锁死全局
- `workbench-model.ts:190` `workbenchNavAtom`（localStorage，不进 URL）。全仓仅 `activity-bar.tsx:40/45/46` 写、`WorkbenchRoute.tsx:209` 读、`:589`/`:609` 分支。**无任何 effect 进项目自动回 projects**。
- `:589` `leftPanel = nav==="files" ? <FilesLeftPanel scope={{kind:"global"}}> : <ProjectLeftPanel scope={scope}>`——nav=files 优先于 scope 判断，project scope 下 nav=files 左栏仍显全局 rootBrowse 不变；且项目内 middle tab [文件]（`ProjectLeftPanel` resolvedTab=files）因 `ProjectLeftPanel` 不渲染而不可达。

### 问题 3：桌面/移动全局文件两套实现 + 文件散落冗余
5 处渲染文件（props 差异）：
1. 桌面 nav=files 全局左栏（`WorkbenchRoute.tsx:590`→`FilesLeftPanel` global→`FilesPanel rootBrowse enablePreview=false onOpenFile`）
2. 桌面右栏 inspection（`right-panel-plugin.tsx:46-52`→`FilesPanel rootBrowse|projectName queryScope="workbench-files" enablePreview 默认true 无onOpenFile`）
3. 桌面项目 middle tab [文件]（`project-left-panel.tsx:84`→`FilesLeftPanel` project→`FilesPanel projectName enablePreview=false onOpenFile`）
4. 移动 `/files`（`WorkbenchRoute.tsx:170-178 FilesRoute`→移动 `ShellLayout+FilesPanel rootBrowse enablePreview queryScope="files-nav-mobile"`）
5. 移动项目内（`mobile-workbench.tsx` 用 `FIRST_PARTY_PLUGINS` 同②）

桌面全局文件走 nav=files atom（不换路由、中栏不变），移动全局文件走 `/files` 独立路由（整页），两套机制。参照对象 `GlobalProjectsOverview`：桌面 `WorkbenchRoute.tsx:566-573` scope=global 时 leftOverview + 移动 `mobile-workbench.tsx:87-93` `MobileGlobalOverview` 包同一组件，两端共用主体。

### 中栏 tab 承载能力（关键约束）
- `workbench-model.ts:371-397` `WorkbenchPanelRef = SessionPanelRef|FilePanelRef|GitPanelRef`，`FilePanelRef`/`GitPanelRef` 必带 `projectName`。`tabIdOf`(`:410`) file=`file_${path}`。`PanelRouter`(`instance-area.tsx:563`) file→`FileTabPreview`(要 projectName+path)。focus effect(`WorkbenchRoute.tsx:292`)/`navigateToFile`(`:419`) 硬 gate `if (scope.kind !== "project") return`。`FileTabPreview`(`file-preview-panel.tsx:18`) `previewProjectFile(projectName,path)`。
- rootBrowse 预览**无需新 endpoint**：`file-browser.tsx:649` `resolveRootBrowseTarget` 把 currentPath 第一段当 projectName 派生，预览复用 `previewProjectFile(effectiveProjectName, selectedFilePath)`（`:739`）——全局文件路径天然含项目名前缀，复用现有 project API。

## 现状锚点（每阶段 commit 后更新）

> 🔒 **上下文压缩后先读本节**。最新进度 = 当前阶段。

- **当前阶段**：Phase 3 待开始（FilePanelRef 统一全路径 + 全局文件进中栏 tab）
- **已完成阶段**：Phase 0（文档 + 设计基线，commit `d6c94ce`）、Phase 1（路由重构——共享 pathless layout，中栏跨 scope 不重建）、Phase 2（nav 语义 scope 优先 + 活动栏[文件]跳 /files）
- **Phase 1 设计偏差（vs 原计划）**：未引入持久化 atom，改用 `useMatches()` + 纯函数 `deriveWorkbenchRouteContext` 派生路由上下文（单一数据管道，source of truth = URL，无子 render 写/父读时序问题——**消解原计划最高风险点**）。`/files` 与 `/settings` **留在 rootRoute 平级**（非 layout 子）——移动 `/files` 是独立整页，Phase 2-4 才收口进 layout；Phase 1 只塌缩 7 个 workbench 路由（global/project × scope/focus/file/git）。
- **Phase 1 实现**：`router.tsx` 新增 `workbenchLayoutRoute`（id:"workbench"，pathless layout，component=WorkbenchLayoutShell）+ 7 子路由（**不设 component**，只 URL 匹配 + validateSearch）；`WorkbenchRoute.tsx` 新 `WorkbenchLayoutShell`（`useWorkbenchRouteContext()` 派生 ctx → `<WorkbenchContent scope={ctx.scope} focusId={ctx.focusId} .../>`），删 7 个 `*Route` 薄壳；`workbench-model.ts` 新 `WorkbenchRouteContext`/`deriveWorkbenchRouteContext`/`useWorkbenchRouteContext`（`useMatches({structuralSharing:true, select})` 引用稳定）。
- **Phase 1 验证**：Playwright 探针（SPA 导航 global→project→global→project）中栏 `<main>` 根节点全程 `sameNode:true present:true`（InstanceArea 不卸载，0 pageerror）；e2e 20/20 绿；单测 514（+7 deriveWorkbenchRouteContext）全过；门禁 format/lint/typecheck 全过。
- **Phase 2 设计偏差（vs 原计划）**：未引入 nav gate effect（进项目自动回 projects），也未保留 `workbenchNavAtom` 作为左栏切换驱动。改用 **`leftMode` prop + URL-driven activity bar active**：
  - `WorkbenchContent` 新增 `leftMode?: "auto" | "files"`（默认 "auto"）。左栏逻辑改 **scope 优先**：`scope.kind==="project" || leftMode!=="files"` → ProjectLeftPanel；`global + leftMode==="files"` → FilesLeftPanel。project scope 恒走 ProjectLeftPanel（无视 leftMode），消解"进项目左栏不变"根因——不再需要 nav-reset effect。
  - 活动栏 **不再用 `workbenchNavAtom`**，改用 `useLocation().pathname` 派生 active（与移动 `MobilePrimaryNav` 同模型）：[项目] = `/` 或 `/projects` 前缀；[文件] = `/files`。两个按钮都 `navigate`：[文件] → `/files`，[项目] → `/projects`（独立路由入口，进 URL 不再是 localStorage atom）。
  - `/files` 桌面（`FilesRoute`）经 `GlobalScopeContent leftMode="files"` 强制左栏 FilesLeftPanel（不依赖 nav atom，不污染 localStorage）。`/files` 仍在 rootRoute 平级（Phase 4 才收口进 layout）——故桌面 `/files` ↔ workbench 路由切换会卸载 layout/重建 WorkbenchContent（中栏 session tab 重连）；用户诉求 #1 是 global↔project（Phase 1 已保证），`/files` 是独立视图切换，非用户报告问题。
  - `workbenchNavAtom`/`WorkbenchNav` 定义保留（export 无 lint 报错，Phase 4 若需可复用），但全仓无消费者。
- **Phase 2 验证**：e2e 21/21 绿（新增"entering project keeps ProjectLeftPanel"测试 + 改写 #13 为"navigates to /files"）；单测 514 全过；门禁 format/lint/typecheck 全过。
- **已改文件**（Phase 2）：`web/src/components/shell/activity-bar.tsx`（URL-driven active + navigate）、`web/src/routes/WorkbenchRoute.tsx`（leftMode prop + scope 优先 leftPanel + FilesRoute 传 leftMode="files" + 去 nav atom）、`e2e/middle-tab-left.spec.ts`（改写 #13 + 新增进项目测试）、`docs/design/workbench-stable-refactor.md`（本文档）
- **下一步**：Phase 3 FilePanelRef 统一全路径 + 全局文件进中栏 tab
- **关键风险**：Phase 3（FilePanelRef 去 projectName 影响所有 file 分支消费点）中；Phase 4/5 低

## 阶段计划

### Phase 0：文档 + 设计基线
- 建 `docs/design/workbench-stable-refactor.md`（本文档）
- 更新 `docs/design/index.md`
- verify: 文档存在 + index 更新 + `format:check`
- commit: `docs(workbench): 中栏稳定+文件统一重构持久文档 + 设计基线`

### Phase 1：路由重构（最危险，放最前——问题 1 根因，后续全依赖"InstanceArea 不卸载"）

**实际实现**（已落地，commit 见现状锚点）：
- **未用 atom**（消解原计划最高风险点）。改用 `useMatches()`（读全量活跃 match 链，与渲染无关、随 URL 同步）+ 纯函数 `deriveWorkbenchRouteContext(leaf)` 从末位 leaf match 派生 `{ scope, focusId, rightTab, view, tab, gitScope }`。`useMatches({ structuralSharing: true, select })` 保证引用稳定（URL 不变 → 同一 ctx 对象）。单一数据管道，source of truth = URL，无子 render 写/父读时序问题。
- **router.tsx**：`workbenchLayoutRoute`（id:"workbench"，pathless layout，component=WorkbenchLayoutShell，无 validateSearch——子路由各自 validateSearch）+ 7 子路由（**不设 component**——layout 已渲染全部中栏内容，子路由只负责 URL 匹配 + validateSearch；TanStack 文档：component 未定义自动渲染 Outlet，但 layout 不渲染 `<Outlet/>` 故子匹配不渲染，其 params/search 仍经 useMatches 读得）。`/files` `/settings` 留 rootRoute 平级（Phase 1 只塌缩 7 workbench 路由）。
- **WorkbenchRoute.tsx**：新 `WorkbenchLayoutShell`（10 行：`useWorkbenchRouteContext()` → `<WorkbenchContent scope={ctx.scope} focusId={ctx.focusId} rightTab={ctx.rightTab} tab={ctx.tab} view={ctx.view}/>`）。删 7 个 `*Route` 薄壳（`ProjectScopeRoute`/`ProjectFocusRoute`/`ProjectFileFocusRoute`/`ProjectGitFocusRoute`/`GlobalScopeRoute`/`GlobalFocusRoute`/`IndexRoute`）。`WorkbenchContent` 签名不变（接收 props，纯渲染）；`FilesRoute`/`GlobalScopeContent` 保留（`/files` 桌面分流用）。
- **workbench-model.ts**：新 `WorkbenchRouteContext`（scope + focusId + 可选 rightTab/view/tab/gitScope）、`deriveWorkbenchRouteContext`（纯函数，switch leaf.fullPath 派生）、`useWorkbenchRouteContext`（useMatches + structuralSharing）。

- verify: Playwright 探针 SPA 导航 global→project→global→project，中栏 `<main>` 根节点全程 `sameNode:true`（InstanceArea 不卸载，0 pageerror）；e2e 20/20 绿；单测 +7 deriveWorkbenchRouteContext 全过；门禁全过。
- commit: `refactor(web): workbench 路由重构——共享 pathless layout，中栏跨 scope 不重建`

### Phase 2：nav gate + 活动栏 [文件] 改跳 /files

**WorkbenchRoute.tsx:588-601** leftPanel 改 scope 优先：
```ts
const leftPanel = scope.kind === "project"
  ? <ProjectLeftPanel .../>                    // project scope 无视 nav
  : nav === "files" ? <GlobalFilesOverview .../> : <GlobalProjectsOverview .../>;  // global scope 才看 nav
```
- 加 effect：`scope.kind==="project" && nav==="files"` → `setNav("projects")`（进项目活动栏自动回 [项目]）。
- `activity-bar.tsx:46` [文件] onClick 改 `navigate({to:"/files"})`（独立 scope 入口，不经 setNav，与项目 scope 互不侵入）；`:45` [项目] 保持 setNav（global scope 下左栏切回项目总览）。nav atom 退化为"global scope 下左栏 projects|files 二选一"局部偏好。
- verify: 手动进项目活动栏自动回 [项目]、左栏保持 ProjectLeftPanel；点 [文件] 跳 /files 全局文件；中栏 tab 全程不重连（Phase 1 保证）；e2e 加"进项目 nav 自动回 projects"。
- commit: `fix(web): nav 语义 scope 优先 + 进项目自动回 projects + 活动栏[文件]跳 /files`

### Phase 3：FilePanelRef 统一全路径 + 全局文件进中栏 tab

**workbench-model.ts**：
- `FilePanelRef` 改 `{ kind: "file"; path: string }`（**去 projectName**，path = 全路径含项目名前缀如 `"myproj/src/index.ts"`）。
- `tabIdOf`(`:410`) file 保持 `file_${path}`（path 现为全路径，全局/项目点同一文件 → 同一 tabId 去重）。
- `parseFileTabId` 逆解析返回全路径。`normalizeRef`(`:437`) 同步。
- `GitPanelRef` **保持现状**（git 是项目内概念，保留 projectName+scope+path，不统一）。

**FileTabPreview**(`file-preview-panel.tsx:18`) 改签名 `({path}: {path: string})`：内部 `resolveRootBrowseTarget(path)` 解析 projectName+relativePath，走现有 `previewProjectFile`/`saveFileContent`（无需新 endpoint，复用 `file-browser.tsx:649` 机制）。全局/项目同文件复用同一 tab。

**PanelRouter**(`instance-area.tsx:563`) file 分支改 `<FileTabPreview path={panelRef.path}/>`（去 projectName）。

**WorkbenchRoute.tsx**：
- focus effect(`:285-313`)：**删除 `:292` `if (scope.kind !== "project") return prev` gate**（全局文件也可开 tab）；file 分支 `ensureTabOpenLeaf(prev, {kind:"file", path: filePath})`（path 从 URL 派生为全路径——project file focus 路由 `_splat` 拼项目名前缀；global file focus 路由 `_splat` 本就是全路径）。
- `navigateToFile`(`:417`) 去 `:419` scope gate；`onOpenFile`(`:430`)/`onSelectTab`(`:473`)/`onCloseTab`(`:459`) file 分支用全路径，不传 projectName。
- `FilesLeftPanel`(`files-left-panel.tsx`) `onOpenFile` 透出全路径：global/project 两者统一 `onOpenFile(\`${projectName}/${rel}\`)`。

**router.tsx**：新增 `/files/file/$` splat 路由 → `GlobalFileFocusShell`，focusId=`file_${decodeURIComponent(_splat)}`（全路径）。`/projects/$key/file/$` 的 `ProjectFileFocusRoute` 解析 `_splat` 拼项目名前缀成全路径 focusId。

**mobile-workbench.tsx**：`MobileFileFocus`(`:128-159`) 改接 `FilePanelRef` 全路径，浮窗内部复用 `FileTabPreview`（移动不开多 tab，单文件浮窗）。

- verify: 桌面 /files 点文件 → 中栏开 file tab（全路径 tabId）；桌面项目内点文件 → 中栏开 file tab；全局/项目点同一文件 → 复用同一 tab（不重复开）；刷新 deep-link 恢复；进出项目 tab 不消失；移动 /files 点文件 → 浮窗（复用 FileTabPreview）；e2e 加"全局文件 tab deep-link + 跨 scope 存活 + 全局/项目同文件去重"。`tabIdOf`/`parseFileTabId` 全仓消费点（stale prune `:317-345`、`validateLayoutV3` `:1169`、`findLeafBySessionId` `:1066` 等）逐点核对 + 测试。
- commit: `feat(web): FilePanelRef 统一全路径——全局/项目文件同 tab + 全局文件进中栏`

### Phase 4：GlobalFilesOverview 抽取 + 移动 /files 收口

新文件 `web/src/components/files/global-files-overview.tsx`：
```ts
export function GlobalFilesOverview({ onOpenFile, dragAdapter? }: {
  onOpenFile: (fullPath: string) => void;   // fullPath = "projectName/relativePath"
  dragAdapter?: DragSourceAdapter;
})
```
主体 = `<FilesPanel initialPath="" rootBrowse enablePreview={false} onOpenFile={(proj,rel)=>onOpenFile(\`${proj}/${rel}\`)}/>`，外壳由调用方提供（同 `global-projects-overview.tsx:58` 范式）。

两端调用：
- 桌面：`WorkbenchRoute.tsx` leftPanel global+nav=files 分支 → `<GlobalFilesOverview onOpenFile={(p)=>{ update(prev=>ensureTabOpenLeaf(prev,{kind:"file",path:p})); void navigateToFile(p); }}/>`
- 移动：`WorkbenchRoute.tsx:170-178` `FilesRoute` 移动分支改 `<MobileGlobalFilesOverview/>`（= `MobilePageHeader` + `GlobalFilesOverview`，onOpenFile navigate `/files/file/$`），删 `:175` 独立 `<FilesPanel rootBrowse enablePreview queryScope="files-nav-mobile"/>`。
- verify: 桌面 nav=files 左栏 = 移动 /files 一级页面同一组件主体（同一 import 路径）；两端点文件都开 file tab（桌面中栏 / 移动浮窗）；DOM 几何确认两端渲染一致。
- commit: `refactor(web): 抽 GlobalFilesOverview 两端共用——桌面 nav=files 左栏 + 移动 /files 同主体`

### Phase 5：文件树+预览预设去冗余（最低风险）

`file-browser.tsx` 导出 3 个具名预设包装（`FilesPanel` props 已通用，5 处差异全是 props 组合，不抽新层组件，仅 props 组合命名）：
- `GlobalFilesTree` = `FilesPanel rootBrowse enablePreview=false onOpenFile` → ①桌面全局左栏 ④移动 /files（经 GlobalFilesOverview）
- `ProjectFilesTree` = `FilesPanel projectName enablePreview=false onOpenFile` → ③项目 middle tab
- `FilesInspection` = `FilesPanel [rootBrowse|projectName] enablePreview=true queryScope="workbench-files"` → ②右栏 inspection ⑤移动项目内

`FileTabPreview` 改接全路径 path 后，桌面中栏 file tab / 全局 file tab / 移动浮窗三处共用（Phase 3 已完成）。

5 处调用点改用预设名。verify: 视觉零改（预设仅 props 组合命名）；`bun run test`；手动 5 处 DOM 几何对比。
- commit: `refactor(web): 文件树+预览预设去冗余——5 处复用统一封装`

## 关键代码锚点

| 锚点 | 位置 | 作用 |
|------|------|------|
| 7 个 workbench 路由 | `router.tsx:22-97` | 平级兄弟叶子根因；Phase 1 塌缩为 pathless layout + 子路由 |
| `WorkbenchContent` | `WorkbenchRoute.tsx:192-641` | 中栏主体逻辑；Phase 1 搬入 `WorkbenchLayoutShell` |
| `InstanceArea` / `WorkspaceTree` / `PanelRouter` | `instance-area.tsx:268/1949/563` | 中栏渲染链；Phase 1 保活关键 |
| `workbenchLayoutAtom` | `workbench-model.ts:1433` | layout 数据已单一化；Phase 1 加 `workbenchRouteContextAtom` |
| `workbenchNavAtom` | `workbench-model.ts:190` | nav 锁死根因；Phase 2 effect + scope 优先 |
| `leftPanel` 分支 | `WorkbenchRoute.tsx:588-601` | nav 优先于 scope；Phase 2 改 scope 优先 |
| `activity-bar` [文件] | `activity-bar.tsx:46` | setNav 锁全局；Phase 2 改 navigate /files |
| `FilePanelRef` | `workbench-model.ts:378-382` | 必带 projectName；Phase 3 去 projectName 改全路径 |
| `tabIdOf`/`parseFileTabId`/`normalizeRef` | `workbench-model.ts:410/-/:437` | tab 标识；Phase 3 全路径 |
| `FileTabPreview` | `file-preview-panel.tsx:18` | file 预览；Phase 3 改全路径 + resolveRootBrowseTarget |
| `PanelRouter` file 分支 | `instance-area.tsx:563` | file 渲染；Phase 3 改 path |
| focus effect / `navigateToFile` gate | `WorkbenchRoute.tsx:292/419` | 全局文件被 gate 拦；Phase 3 删 gate |
| `resolveRootBrowseTarget` | `file-browser.tsx:649` | rootBrowse 全路径解析；Phase 3 FileTabPreview 复用 |
| 5 处文件渲染 | 见问题 3 根因 | Phase 4 抽 GlobalFilesOverview + Phase 5 预设去冗余 |
| `GlobalProjectsOverview` | `global-projects-overview.tsx:58` | 两端共用参照对象；Phase 4 套用到文件 |
| `MobileGlobalOverview` | `mobile-workbench.tsx:87-93` | 移动包 GlobalProjectsOverview 范式；Phase 4 套用 |

## 风险

1. **最高：Phase 1** — pathless layout + 子绝对 path 匹配优先级；atom 子 render 写/父读时序（可能 stale/flicker）。回退 `useRouteContext`。每步 DOM 几何 + WS 计数验证。
2. **中：Phase 3** — `FilePanelRef` 去 projectName 影响所有 file 分支消费点（`tabIdOf`/`parseFileTabId`/`normalizeRef`/`PanelRouter`/`focus effect`/`navigateToFile`/`onOpenFile`/`onSelectTab`/`onCloseTab`/`FileTabPreview`/stale prune/validateLayoutV3/findLeafBySessionId）。grep 逐点 + 测试，漏一处即 tab 错乱。`GitPanelRef` 不动（git 是项目内概念）。
3. **中：Phase 2** — effect setNav 与 [文件] navigate 竞态。缓解：[文件] 直接 navigate /files 不经 setNav。
4. **低：Phase 4/5** — 纯组件抽取，视觉零改。
5. **全局：lazy chunk** — layout + 7 shell 同文件同 chunk，确认 vite 不拆多 chunk。

## 验证（每阶段）

- 门禁：`bun run format:check && bun run lint && bun run typecheck && bun run test`（lint `--deny-warnings`，0 warning 0 error；每 commit 前 pre-commit 自动跑）
- web 改动后 CSS 落盘：`touch web/src/main.tsx && sleep 6 && ls web/dist/assets/*.css`（memory `build-watch-css-not-flushed`）
- 视觉：**DOM 几何（禁止截图）**——Playwright `getComputedStyle`/`getBoundingClientRect` 断言
- 行为：ar-dev tmux（api 43011 / web 43012）手工 + e2e（更新 middle-tab-left / file-nav / file-browser / git-diff / mobile-nav spec；新增"中栏跨 scope 不重连"、"全局文件 tab"、"nav 自动回 projects" spec）
- 全部完成后 `bun run build` + `bun run e2e`（20/20 绿基线保持）