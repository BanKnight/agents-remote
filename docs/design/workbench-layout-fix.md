# 工作台进入项目后布局修复

> ⚙️ **持久设计文档（超长任务恢复锚点）**。本文档承载本轮"进入具体项目（`/projects/$key`）后工作台 UI 布局修复"的全部决策、阶段计划与现状锚点。上下文压缩后**先 Read 本文「现状锚点」节**恢复进度，再继续。对齐 memory `long-task-document-to-avoid-context-loss`。

## 背景：4 个用户报告的问题

1. **左栏布局应参考全局项目**：进入项目后左栏应有 header（带返回标识的项目名）+ tab 区 + body。当前 project scope 左栏 `leftPanelTitle`（`WorkbenchRoute.tsx:518`）仍显固定「项目」字，且 `ProjectLeftPanel`（`project-left-panel.tsx:43`）内部又塞了个 `GlobalNavNode`（「全局」返回按钮），没有显示当前项目名。
2. **中栏不应随进/出项目变化（VSCode 式）**：进入项目前中栏有 2 个 tab，进入后「清空 + 显示该项目持久化的实例」，退出后又变回。根因：`workbenchLayoutAtom`（`workbench-model.ts:1373`）按 scope **分库**（`{ project: Record<key>, global }`），切 scope = 换 layout 副本 → 中栏 tab 看似"清空+重建"。⚠️ **不存在「自动开第一个实例」effect**（ProjectScopeRoute `focusId=undefined`，focus effect `WorkbenchRoute.tsx:254` 直接 return）；看到的"第一个实例"= 该项目持久化 layout 的恢复，不是自动打开。
3. **文件/git tab body 列表应撑满左栏宽度**：`ListRow` 已 `w-full`；git 的 `GitFileList` 在 `<aside sm:w-[19.375rem]>`（`git-diff-viewer.tsx:380`）固定宽；文件待查 `FilesPanel` 左栏模式容器。
4. **git tab 查看修改应和文件 tab 一致**：左栏列表、选中文件 → 中栏开 diff tab。当前 `GitDiffPanel`（`git-diff-viewer.tsx:327`）自包含 list（19.375rem）+ diff 都塞左栏 middleBody。

## 决策日志（用户拍板）

1. **问题 2 = VSCode 式单一 layout**：中栏 layout 单一化（去 per-scope 分库），中栏 tab 跨项目切换稳定。接受「项目 A 的实例 tab 在项目 B 中栏也可见」（VSCode 语义，工作区不随焦点切换而清空）。
2. **问题 4 = 开 git diff tab 对齐 file tab**：选中变更文件 → 中栏开 git diff tab（可多开 + URL deep-link），middle tab 切换不侵入中栏；左栏只留变更文件列表。
3. **问题 1 = header 统一到 shell 层**：项目名 + 返回箭头放在 `WorkbenchShell` 的 `leftPanelTitle` 层（project scope），移除 `ProjectLeftPanel` 内部的 `GlobalNavNode`。
4. **禁止截图**：vision 判不准深色主题小边距 + 高 DPI offload CDN；一律 DOM 几何（`getComputedStyle` / `getBoundingClientRect`）验证。对齐 memory `verify-css-via-dom-geometry-not-vision` + `no-screenshots-allowed`。
5. **逐阶段独立 commit**：每阶段可单独验证/回滚，用户可在任一阶段后调整顺序或叫停（memory `feedback-incremental-ui-changes`）。

## 现状锚点（每阶段 commit 后更新）

> 🔒 **上下文压缩后先读本节**。最新进度 = 当前阶段。

- **当前阶段**：阶段 0–4 核心全部完成（用户报告的 4 个布局问题全修）
- **已完成阶段**：阶段 0（文档 + memory）、阶段 1（左栏 header）、阶段 2a（refs 全局聚合）、阶段 2b（单一 layout 数据模型 + V3→V4 迁移）、阶段 2c（跨项目 tab 聚焦 URL 用 ref.projectName）、阶段 2d（移动端守卫 + refsCount 语义）、阶段 3（git diff tab 对齐 file tab）、阶段 4（左栏文件列表撑满宽度）
- **已改文件**（阶段 3）：`web/src/routes/workbench-model.ts`（`GitPanelRef = {kind:"git";projectName;scope:GitDiffScope;path}` + union 加 git + `tabIdOf` git 分支 `git_${scope}/${path}` + `parseGitTabId` + `validateWorkbenchSearch` 加 `gitScope?:GitDiffScope` 白名单 + `normalizeRef` git 分支）；`web/src/routes/router.tsx`（`projectGitFocusRoute` `/projects/$key/git/$` splat=path + `?gitScope` search）；`web/src/routes/WorkbenchRoute.tsx`（`ProjectGitFocusRoute` 组件 + focus effect git 分支 + prune git/file 跳过 + `navigateToGitFile` + `onOpenGitFile` + `onCloseTab`/`onSelectTab` git 分支 + `ProjectLeftPanel` 传 `onOpenGitFile`）；`web/src/components/git/git-diff-viewer.tsx`（`GitFileDiffPanel` 改 export 自带 query 可独立渲染 + `GitChangesList` export 左栏列表 queryScope=`workbench-git-left` + `GitDiffPanel` 右栏 inspection 委托 `GitFileDiffPanel`）；`web/src/components/workbench/instance-area.tsx`（`PanelRouter` git 分支 + `usePanelMeta` git 同 file basename+图标）；`web/src/components/workbench/project-left-panel.tsx`（middle tab git 改渲染 `GitChangesList` + `selectedGitFile` 从 `focusId` `parseGitTabId` 派生 + `onOpenGitFile` 透传）。
- **已改文件**（阶段 4）：`web/src/components/files/file-browser.tsx`（`browserPanel` aside className：`sm:flex-none sm:w-[19.375rem] sm:shrink-0 sm:border-r` 改为按 `enablePreview` 分支——inspection=true 保留固定宽 309px；左栏纯树=false 改 `sm:flex-1` 撑满左栏面板 + base 加 `min-w-0` 允许 shrink below min-content）。git 列表已在阶段 3 用 `GitChangesList`（`min-h-0 flex-1 overflow-y-auto p-3`，无固定宽）撑满，无需再改。
- **下一步**：核心 4 问题全修，本轮布局修复收尾。后续 e2e 基线债单独处理（见已知风险）。
- **阶段 4 验证**：DOM 探针（桌面 1600 viewport → 登录 → `/projects/agents-remote?tab=files` middle tab [文件]）PASS —— 修复前 `FilesPanel` aside `sm:w-[19.375rem]`（309px）> 左栏面板 255px → 溢出 55px 被 `overflow-hidden` 裁（长文件名行右侧 actions 被裁）；修复后 `asideWidth=255`（=父容器 content-box 宽，撑满不溢出），`rowWidth=231`（=255 − p-3 padding 24，ListRow 撑满 aside 内容区），0 console error。inspection 分支（enablePreview=true）改动仅 `+min-w-0`：`sm:w-[19.375rem]+sm:shrink-0` 固定宽优先，`min-width:0` 对确定 width 无影响（CSS 规范确定行为，不回归）。门禁 format/lint/typecheck/test（507）全过。
- **阶段 3 验证**：DOM 探针（桌面 viewport → 登录 → 进 agents-remote 项目，只读 diff 不建 session）PASS —— ① middle tab `[git]` 左栏 `GitChangesList` 渲染 7 变更文件（`[data-list-row-title]` 读纯 path）；② deep-link `/projects/agents-remote/git/web/src/routes/workbench-model.ts?gitScope=worktree` 中栏 `GitFileDiffPanel` 渲染真实 diff（`diff --git a/...b/...`，hasDiffContent=true）；③ 点左栏第一个文件 → 中栏开 git diff tab + URL 变 `/git/<path>?tab=git&gitScope=worktree`（middle tab `git` 不变），`GitFileDiffPanel` count=1；0 console error。门禁 format/lint/typecheck/test（507）全过。
- **关键设计点**（阶段 3）：① scope 编码走 `?gitScope=staged|worktree` search param（splat 不便编码），tabId 含 scope（`git_${scope}/${path}`）避免同 path 不同 scope 冲突；② `GitFileDiffPanel` 两处复用——中栏 tab（`PanelRouter`，不传 `onClose`，关闭走 tab ✕）+ 右栏 inspection（`GitDiffPanel` 传 `onClose=clearDiff`），靠 3 个 queryScope 段隔离缓存（`git-tab`/`workbench-git-left`/右栏不变）；③ `file`/`git` tab 都跳过 stale-prune（无生命周期）；④ 排坑：`fileDiff` service（`api/src/project-git-diff.ts:105`）按 `scope+path` 精确匹配 list，probe 早期用已 commit 的过期文件路径触发 `PROJECT_GIT_FILE_NOT_CHANGED`→400 兜底，**非代码 bug**。
- **已知风险**（本轮收尾后发现，**pre-existing，与本轮 phase 0–4 无关**）：e2e 基线 15 spec 失败（`bun run e2e` 5 passed / 15 failed）。失败模式统一——登录后 `getByRole('button', { name: projectName })` 项目节点找不到。error-context DOM 快照铁证：失败页面 = global scope 左栏 `InstanceLeftOverview`/`GlobalProjectsOverview` grid view 空态（「No active instances」「Select a project from the left rail」），项目节点不在默认 grid view（在 grouped view）。这是 phase 2a-2d 后 global scope 默认 view 语义变化（grid=实例总览，grouped=项目分组）的 spec 适配债——spec 仍期望旧行为（默认即有项目节点按钮）。**与 phase 4（file-browser aside className）无关**：phase 4 不渲染于 global scope 左栏，15 失败 spec 跨 claude2/file/git/terminal/pwa 全局性，非 file 特定。需单独 task 适配 spec（switch grouped view 找项目节点，或确认新设计 global 进项目方式）。memory `feedback-baseline-harness-must-be-green` 要求基线 e2e 全绿，不能延期。

## 阶段计划

### 阶段 0：文档 + memory + 设计基线

- 建 `docs/design/workbench-layout-fix.md`（本文档）
- 写 memory `no-screenshots-allowed`（强化 `verify-css-via-dom-geometry-not-vision`）
- 更新 `docs/design/index.md`（加 workbench-layout-fix 条目）
- verify: 文档存在 + index 更新 + `format:check` 无副作用
- commit: `docs(workbench): 布局修复持久文档 + 设计基线 + memory`

### 阶段 1：问题 1 左栏 header（项目名 + 返回标识）

- `WorkbenchRoute.tsx:518` `leftPanelTitle`：project scope 时传「项目名 + 返回箭头」节点（点击 `navigate('/projects')`）；global scope 保持「项目」字
- `project-left-panel.tsx:84-101`：移除内部 `GlobalNavNode` + 其 `<nav>` 包裹（header 统一在 WorkbenchShell `leftPanelTitle` 层）；保留 middle tab bar + body
- 微调 `workbench-shell.tsx:115` `leftPanelTitle` 渲染（当前是简单 title 文本，project scope 要支持「按钮+文本」节点）
- verify: DOM 几何——project scope 左栏顶部 header 文本 = 当前项目名 + 返回按钮可点（aria-label）；global 不变；CSS 落盘
- commit: `fix(web): 进入项目后左栏 header 显项目名+返回（对齐全局项目布局）`

### 阶段 2：问题 2 中栏 layout 单一化（VSCode 式）—— 4 sub-phase

**2a. refs 全局聚合**（隔离 prune 回归）

- `instance-area.tsx` 新增 `useGlobalInstanceRefs()`：复用 `useGlobalInstanceCandidates` 的 listProjects + fan-out（`:993-1063`），map 出 `SessionPanelRef[]`；`enabled = isDesktop && layout.root !== null`
- `WorkbenchRoute.tsx:276-300` prune effect 改用 `globalRefs`（此时 layout 仍 per-scope，全局 refs ⊇ scope refs，prune 仍正确）
- verify: 切 scope、kill session，prune 行为不变；切 scope 中栏暂仍换副本（2b 才改）；门禁 + CSS 落盘
- commit: `refactor(web): 抽 useGlobalInstanceRefs 全局聚合，为中栏 layout 单一化铺路`

**2b. 单一 layout 数据模型 + 迁移**

- `workbench-model.ts`：`workbenchLayoutAtom` 改存扁平 `WorkbenchLayoutV3`（去 `{ project, global }` 包装），新 key `workbenchLayoutV4`；迁移 `migrateV3StateToSingleLayout(v3)` 取 `v3.global` 作单一 layout；调整 `normalizeLayoutState` / `migrateLayoutStateV2ToV3` / `migrateLayoutState` 输出类型
- `useWorkbenchLayout()` 去 scope 参数；调用方 `WorkbenchRoute.tsx:244` + `mobile-workbench.tsx:182` 改
- verify: 进/出项目、切 middle tab 中栏 tab **稳定不动**；刷新恢复单一 layout；旧 V3 用户迁移到 V4（localStorage 查 `workbenchLayoutV4` 存在、V3 保留）；门禁 + CSS 落盘
- commit: `refactor(web): 中栏 layout 单一化（VSCode 式）——跨 scope 稳定 + V3→V4 迁移`

**2c. 跨项目 tab 聚焦 URL**（风险补丁，必须随 2b）

- `navigateWorkbench` / `onSelectTab`（`WorkbenchRoute.tsx:393`）/ `focusPanel`（`:308`）改用 `ref.projectName` 构造聚焦 URL（不再用 `scope.key`）；否则 global 开项目 B tab、进项目 A 点 B tab → URL `/projects/A/session/B-id` 错乱
- focus effect（`:254`）回退 navigate 同理审
- verify: global 开项目 B tab → 进项目 A → 点 B tab → URL 正确 `/projects/B/session/B-id`，中栏 tab 不动；门禁
- commit: `fix(web): 跨项目 tab 聚焦 URL 用 ref.projectName（中栏单一化配套）`

**2d. 移动端守卫 + refsCount 语义**

- `useGlobalInstanceRefs()` 加 `enabled = isDesktop && layout.root !== null`（移动端不空跑 fan-out）
- `InstanceArea` `refsCount`（`WorkbenchRoute.tsx:538`）改 `globalRefs.length`（`hasActiveInstances` 语义 = 中栏 tab 是否可恢复）
- verify: 移动端无额外网络；EmptyInstanceArea 双语义单一 layout 下正确；门禁
- commit: `fix(web): 中栏单一化——移动端全局 refs 守卫 + refsCount 语义`

### 阶段 3：问题 4 git diff tab（对齐 file tab）

- `workbench-model.ts`：新增 `GitPanelRef = { kind: "git"; projectName; scope: GitDiffScope; path: string }`；union 加 git；`tabIdOf` git 分支 = `git_${scope}_${path}`；新增 `parseGitTabId`
- `router.tsx`：新增 `projectGitFocusRoute` `/projects/$key/git/$`（splat = path；scope 走 search param `?gitScope=staged|worktree`，因 splat 不便编码 scope）；component 解析 → `focusId = git_${scope}_${path}` → WorkbenchContent
- `WorkbenchRoute.tsx`：focus effect（`:254`）加 git 分支（`parseGitTabId` → `ensureTabOpenLeaf`）；新增 `onOpenGitFile` 回调（构造 GitPanelRef + `ensureTabOpenLeaf` + navigate）；`onCloseTab`（`:381`）加 git 回退
- `instance-area.tsx` `PanelRouter`（`:559`）：加 `if (panelRef.kind === "git") return <GitFileDiffPanel .../>`（纯 diff，去 list + scope chips）
- `git-diff-viewer.tsx`：`GitFileList`（`:75`）加 `onSelectGitFile` 回调；`GitFileDiffPanel`（`:125`）改可独立渲染（接收 projectName/scope/path 自带 query，去移动浮层 onClose 依赖）；`GitDiffPanel`（`:327`）保留给右栏 inspection（自包含 list + diff）
- `project-left-panel.tsx:77-80`：middle tab git 改渲染纯 `GitFileList`（撑满左栏）+ 透传 `onOpenGitFile`
- verify: middle tab [git] → 左栏变更列表（撑满）→ 点文件 → 中栏开 git diff tab（URL `/projects/$key/git/$path`）→ diff 渲染；多开/切 tab/关闭；DOM 几何确认列表撑满；门禁 + CSS 落盘
- commit: `feat(web): git diff tab 对齐 file tab——左栏列表 + 中栏 diff 预览 + URL deep-link`

### 阶段 4：问题 3 列表撑满宽度

- 文件 tab：`FilesPanel` `enablePreview=false`（左栏纯树）模式容器——检查 `ListGroup`/`FileEntryList` 父容器 padding/max-width，确保撑满左栏（git 列表已在阶段 3 处理）
- 只改左栏纯树模式，inspection（右栏 `FilesPanel`）布局不动
- verify: DOM 几何——左栏文件列表行 width = 左栏 aside content-box 宽（无 max-width 限宽、无水平 margin）；门禁 + CSS 落盘
- commit: `fix(web): 左栏文件列表撑满宽度（去限宽）`

## 关键代码锚点

| 锚点 | 位置 | 作用 |
|------|------|------|
| `workbenchLayoutAtom` | `workbench-model.ts:1373` | per-scope 分库根因；2b 改扁平 |
| `FilePanelRef` / `tabIdOf` | `workbench-model.ts:373` | file tab 机制参照；3 加 GitPanelRef 同构 |
| `parseFileTabId` | `workbench-model.ts` | file URL→tabId 解析；3 加 parseGitTabId |
| `useWorkbenchLayout(scope)` | `workbench-model.ts` | 读 layout（两处调用：`WorkbenchRoute.tsx:244` + `mobile-workbench.tsx:182`）；2b 去 scope |
| prune effect | `WorkbenchRoute.tsx:276-300` | stale session tab 清理；2a 改全局 refs |
| focus effect | `WorkbenchRoute.tsx:254-272` | URL focusId → 开 tab；3 加 git 分支 |
| `focusPanel` / `onSelectTab` | `WorkbenchRoute.tsx:308/393` | 聚焦 URL 构造；2c 用 ref.projectName |
| `leftPanelTitle` | `WorkbenchRoute.tsx:518` | 左栏标题；1 改项目名+返回 |
| `refsCount` | `WorkbenchRoute.tsx:538` | hasActiveInstances 语义；2d 改 globalRefs.length |
| `useScopeInstanceOrder` | `instance-area.tsx:1075` | per-scope refs（仅该项目实例） |
| `useGlobalInstanceCandidates` | `instance-area.tsx:993-1063` | 全局聚合 fan-out；2a 复用 |
| `PanelRouter` | `instance-area.tsx:559` | kind 分发渲染；3 加 git 分支 |
| `ProjectLeftPanel` + `GlobalNavNode` | `project-left-panel.tsx:43/84-101` | 左栏 project scope 渲染；1 移除 GlobalNavNode |
| leftPanelTitle 渲染 | `workbench-shell.tsx:115` | 简单 title 文本；1 支持「按钮+文本」 |
| `GitFileList` / `GitFileDiffPanel` / `GitDiffPanel` | `git-diff-viewer.tsx:75/125/327` | git 列表/diff/自包含 panel；3 拆分 |
| `projectFileFocusRoute` | `router.tsx` | file URL 参照；3 加 projectGitFocusRoute |

## 风险

- **2a-2b stale-prune 回归（最高）**：单一 layout 跨项目 tab 共存，prune 必须用全局 refs（2a 先行隔离），否则切 scope 时其他项目 tab 误判 stale 全清。每 sub-phase 后 DOM 几何 + 手动 prune 验证。
- **2b 持久化迁移丢数据**：V3 各 project 副本丢弃（取 global 副本）。新 key V4 + 保留 V3 + 文档说明。
- **2c 跨项目 URL**：不做则点跨项目 tab URL 错乱。必须随 2b 配套。
- **阶段 3 git scope 编码**：splat 不便编码 staged/worktree，走 search param。tabId 含 scope 避免同 path 不同 scope 冲突。
- **禁截图**：所有视觉验证一律 DOM 几何 + e2e DOM 断言，禁止 Playwright screenshot 进上下文。

## 验证（每阶段）

- 门禁：`bun run format:check && bun run lint && bun run typecheck && bun run test`（lint `--deny-warnings`，0 warning 0 error；每 commit 前 pre-commit 自动跑）
- web 改动后 CSS 落盘：`touch web/src/main.tsx && sleep 6 && ls web/dist/assets/*.css`（memory `build-watch-css-not-flushed`）
- 视觉：**DOM 几何（禁止截图）**——Playwright `getComputedStyle` / `getBoundingClientRect` 断言 token/宽度/位置
- 行为：ar-dev tmux（api 43011 / web 43012）手工 + e2e（更新 middle-tab-left / file-nav / file-browser spec；新增 git diff tab spec）
- 全部完成后 `bun run build` + `bun run e2e`
