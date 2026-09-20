# Git 能力完善设计

> 长任务承载文档（类比 `workbench-views.md`）。git diff viewer 从「只读 diff inspection」扩展为更完整的只读 git 观察能力。本文件记录 R1-R9 全景 + 批次 + 安全边界 + 决策日志，作为后续每批 plan 的锚点，防上下文压缩丢失决策。

## 背景

当前 git 能力（`docs/specs/git-diff-viewer/spec.md`）是纯只读 diff inspection：

- **API**（`api/src/project-git-diff.ts` `ProjectGitDiffService`）：`listDiff`（staged + worktree + untracked 聚合）+ `fileDiff`（单文件 unified diff）。
- **DTO**（`packages/shared/src/index.ts`）：`GitDiffScope = "worktree" | "staged"`、`GitDiffFileSummary = { path, previousPath?, status, scope }`、`GitDiffListResponse = { repository, projectName, files }`。
- **UI**（`web/src/components/git/git-diff-viewer.tsx`）：`GitChangesList`（左栏列表：`GitScopeChips` 统计 + `GitFileList`）、`GitFileDiffPanel`（单文件 diff）、`DiffContent`（unified diff 渲染，`parseDiff` 拆行）。

参考项目 hapi 同样只读，但多 **numstat（行数）+ branch 显示**。

## 目标

按 R1-R9 扩展，**保持只读**（不引入写操作），复用现有 argv + Project-safe resolver 安全底子。用户选定的方向：只读增强（A）+ 多分支与远端差异 + diff 体验优化。

## 需求全景

### R1. 变更行数统计（numstat）— 第一批

- **WHAT**：每个 changed file 显示 `+N -M`（新增/删除行数）。
- **数据源**：`git diff --numstat`（worktree）+ `git diff --cached --numstat`（staged）。numstat 输出 `added\tdeleted\tpath`，binary 文件为 `-\t-\tpath`。
- **DTO**：`GitDiffFileSummary` 加 `addedLines: number | null`、`removedLines: number | null`（null = binary）。
- **UI 落点**：`GitFileList` 行 meta 区或 subtitle 显示 `+12 -3`（success/error 色，tabular-nums）。移动端紧凑。
- **复杂度**：低。API `listDiff` 并行多跑两个 numstat 命令，按 path 关联到现有 files。

### R2. 当前分支 + 同步态势 — 第一批

- **WHAT**：git 列表 header 显示当前分支名 + 相对 upstream 的 ahead/behind（`main ↑2 ↓0`）。
- **数据源**：`git rev-parse --abbrev-ref HEAD`（分支名）+ `git rev-list --left-right --count @{upstream}...HEAD`（ahead/behind，无 upstream 时省略）。
- **DTO**：`GitDiffListResponse` 加 `branch?: { name: string; upstream?: string; ahead?: number; behind?: number }`。
- **UI 落点**：`GitChangesList` chips 区上方加一行 branch 态势（与 `GitScopeChips` 同区域）。detached HEAD / 无 upstream 只显分支名或 `HEAD`。
- **复杂度**：低-中。API 加 2 个 git 命令（rev-parse + rev-list），容错（无 upstream 不报错）。

### R3. 分支列表 — 第二批

- **WHAT**：列 local + remote 全部分支，标记当前分支 + upstream 关系。
- **数据源**：`git for-each-ref --format='%(refname:short)|%(upstream:short)|%(objectname:short)|%(committerdate:iso)' refs/heads refs/remotes`。
- **DTO**：新增 `GitBranchListResponse = { branches: GitBranch[]; current: string }`，`GitBranch = { name; kind: "local"|"remote"; upstream?; lastCommitShort?; isCurrent? }`。
- **UI**：分支选择器（dropdown 或列表），当前分支高亮。落点待 plan 定（git 左栏加 [变更]/[分支] 二级 tab，或 header 分支名可点开）。
- **复杂度**：中。新 DTO + API route + 视图。

### R4. 本地 vs 远端 commit 差异 — 第二批

- **WHAT**：展开 R2 的 ↑N ↓M，列出**领先**（待 push）/ **落后**（待 pull）的 commits。
- **数据源**：`git log @{upstream}..HEAD --pretty=...`（领先）/ `git log HEAD..@{upstream}`（落后）。
- **DTO**：新增 `GitCommitLogItem = { shortHash; message; author; relativeTime }`，`GitAheadBehind = { ahead: GitCommitLogItem[]; behind: GitCommitLogItem[] }`。
- **UI**：R2 branch 态势行可展开，列出 commit（复用 R6 的 commit 行组件）。
- **复杂度**：中。依赖 R6 的 commit 渲染组件。

### R5. 分支间 diff — 第三批

- **WHAT**：选两个分支（或 feature vs main）看文件级列表 + 单文件 diff。
- **数据源**：`git diff --name-status A..B` + `git diff A..B -- <path>`。
- **DTO/架构**：倾向新增独立请求类型 `GitBranchDiffRequest = { base; head }`，而非扩 `GitDiffScope` union（避免污染现有 worktree/staged 语义）。复用 `GitFileList` + `GitFileDiffPanel`。
- **安全**：分支名白名单（见安全边界）。
- **复杂度**：中-高。scope/请求模型扩展是较大架构改动。

### R6. commit 历史 — 第二批

- **WHAT**：最近 N 条 commit（short hash / message / author / 相对时间），可按分支过滤。
- **数据源**：`git log -N --pretty=format:'%h|%an|%ar|%s' [-- <branch>]`。
- **DTO**：`GitCommitLogResponse = { commits: GitCommitLogItem[] }`。
- **UI**：git 左栏加 [变更]/[历史] 二级 tab（复用 middle-tab 模式），或新 history 视图。commit 行组件被 R4 复用。
- **复杂度**：中。

### R7. 语法高亮 — diff 体验

- **WHAT**：unified diff 代码行按语法着色（+/- 行保留底色）。
- **依赖**：项目已有 Prism（只读 CodeBlock）。diff 需按 hunk/行拆分后对代码部分高亮。
- **UI 落点**：`DiffContent` 的 context/add/del 行内容用 Prism 高亮（按文件扩展名选语言）。
- **复杂度**：中。diff 语法高亮要对 +/- 前缀特殊处理 + 语言识别。

### R8. 全量 diff — diff 体验

- **WHAT**：聚合所有未提交文件成一个完整 diff（`git diff HEAD`）。
- **数据源**：`git diff HEAD`（staged + worktree 合并）。
- **UI**：changes list 顶部「查看全部 diff」入口，复用 `DiffContent`。
- **复杂度**：低-中。

### R9. hunk 导航 — diff 体验

- **WHAT**：单文件 diff 内 ↑↓ 跳转 hunk。
- **UI 落点**：`GitFileDiffPanel` 加 hunk 导航按钮，滚动定位到 @@ hunk 头。
- **复杂度**：中。

## 批次计划

| 批次 | 范围 | 主题 | 依赖 | 状态 |
|------|------|------|------|------|
| 第一批 | R1 + R2 | 变更规模与态势 | 无（最低成本高感知，hapi 已验证） | ✅ 完成（numstat 行数 + branch 态势，门禁/e2e/DOM 探针全绿） |
| 第二批 | R3 + R4 + R6 | 分支与远端 + 历史 | R4 依赖 R6 commit 行组件 | ✅ 完成（分支列表 + ahead/behind commit 展开 + 提交历史，commit `8590dcc`） |
| 第三批 | R5 | 分支间 diff | 依赖 R3 分支列表（选分支） | ✅ 完成（双选 base/compare + 中栏 compare tab，复用 R7-R9 渲染） |
| diff 体验 | R7 + R8 + R9 | diff 可读性 | 独立，任意时机 | ✅ 完成（Prism 语法高亮 + 展开全文 + hunk 导航，commit `6e6538d`） |

### 第一批完成锚点（R1 + R2）

- **DTO**（`packages/shared/src/index.ts`）：`GitDiffFileSummary` 加必填 `addedLines/removedLines: number | null`（null = binary/untracked）；新增 `GitBranchStatus`；`GitDiffListResponse`（repository 变体）加可选 `branch?`。
- **API**（`api/src/project-git-diff.ts`）：`listDiff` 用 `Promise.all` 跑 6 命令（name-status worktree/staged + numstat worktree/staged + ls-files + readBranchStatus）；新 `parseNumstat` / `normalizeRenamePath`（**两种 rename 格式**：根级 `old => new` 无 brace + 目录内 `{old => new}` brace）/ `applyNumstat`（按 scope 选 map 关联）；`readBranchStatus` private（全 `gitRaw` 容错：HEAD 失败→undefined，无 upstream→只返 name，counts 失败→name+upstream）。
- **numstat rename 格式实测**（关键，无法从文档猜）：根级 rename+modify 输出 `1\t0\told.txt => new.txt`（**无 brace**），仅目录内 rename 才 `{old => new}` brace。`normalizeRenamePath` 先试 brace 再试 ` => ` 回退。
- **UI**（`web/src/components/git/git-diff-viewer.tsx`）：`GitFileList` meta 从单 status IconMarker 改为 status + 条件 `+N -M` span（null 不渲染，`text-success`/`text-error` + `font-mono text-[0.62rem] tabular-nums`）；新 `GitBranchStatusRow`（分支名 `font-semibold text-on-surface` + ↑ahead `text-success`/↓behind `text-on-surface-muted`，0 省略；无 upstream `git.noUpstream`；detached `git.detached`）；`GitChangesList` + `GitDiffPanel` 两处 header 各插 branch 行。
- **验证**：api 单测 11/11（numstat modified/binary/untracked/rename 两种格式 + branch 无 upstream/ahead-behind/detached）；fetch handler 集成测试 `toEqual`→`toMatchObject`（行数/branch 不在集成层精确绑定）；e2e 25/25；DOM 探针（agents-remote 真实改动，不截图）：行数 +N `rgb(52,211,153)`=success、-M `rgb(251,113,133)`=error 精确命中 token，branch main 渲染，ahead=0 正常降级。
- **不动**：`fileDiff`（单文件 diff response）不加行数（diff 面板已显完整 diff）；`GitDiffScope` union 不动（R5 才扩）；只读契约不变。

### 第三批完成锚点（R5 分支间 diff）

- **用户决策**（AskUserQuestion 确认）：① base 默认当前分支、每行可独立设 base/compare（双选）；② 点 compare 文件开中栏 diff tab（compare 模式），非分支视图内联渲染；③ 两点 `base..compare` 语义（直接比两棵树，非 merge-base review 风格）。
- **DTO**（`packages/shared/src/index.ts`）：新增 `GitCompareFileSummary`（无 scope——两 ref 间差异不属 worktree/staged）+ `GitCompareDiffResponse`（repository true/false 变体）+ `GitCompareFileDiffResponse`（always repository:true）。`GitDiffScope` union **不动**（compare 是独立维度，不污染 scope 语义）。
- **API**（`api/src/project-git-diff.ts`）：`compareDiff`（base/compare 经 `sanitizeBranchRef`，`git diff base..compare --name-status -z -M` + `--numstat -M` 并行，复用 `parseNameStatus`/`parseNumstat`/`applyNumstat`，strip scope）+ `compareFileDiff`（先 compareDiff 校验 path 在变更列表，`git diff base..compare [-U999999] -- path`，context="full" 复用 fileDiff contextArgs 模式）。
- **tab 模型**（`web/src/routes/workbench-model.ts`）：`GitPanelRef` 改 discriminated union（`{mode:"scope";scope} | {mode:"compare";base;compare}`）；`tabIdOf` compare = `gitcmp_${base}~${compare}/${path}`（`~` 分隔——合法 sanitized ref 不含 `~`，安全）；`parseGitTabId` 返 union；focus URL 走 `gitCompare` search param（编码 `${base}~${compare}`，与 `gitScope` 互斥）。
- **UI**（`git-diff-viewer.tsx`）：`GitFileDiffPanel` props 改 union，query 按 mode 分流（scope→`getProjectGitFileDiff` / compare→`getProjectGitCompareFileDiff`，共用 `GitFileDiffView` 字段子集统一返回类型），header compare 模式加 `${base}..${compare}` 小标识；`GitBranchList` 加可选 `onOpenGitCompareFile`（传入启用双选：每行 actions slot 两按钮 [Base]/[Compare]，base 默认当前分支可改，双选完成后下方渲染 `GitCompareFileList`）；未传 → 纯分支列表（右栏 inspection / 移动 `GitDiffPanel` 不启用双选）。**DiffContent 渲染完全不动**（R7 高亮 / R8 展开 / R9 hunk 导航全继承）。
- **链路**：`GitCompareFileList` 点文件 → `onOpenGitCompareFile` → `GitChangesList` / `ProjectLeftPanel` 透传 → `WorkbenchRoute.onOpenGitCompareFile`（`ensureTabOpenLeaf` compare ref + `navigateToGitCompareFile` 写 `gitCompare` search）→ focusId `gitcmp_...` → focus effect re-open → `PanelRouter` 按 mode 分流 `<GitFileDiffPanel mode="compare"/>`。
- **验证**：api 单测覆盖 compareDiff/compareFileDiff + context=full + 非法 ref（`..`/`;`/`$`/空格）+ path 越界拒绝；route 集成 `/git/compare` + `/git/compare/file`；typecheck / lint(0/0) / format / test 全绿；CSS 落盘三道闸。
- **不动**：scope 模式 git tab 行为完全不变（R1-R9 全保留）；`parseDiff` / `DiffContent` / R7-R9 渲染链不动；只读契约不变（`git diff base..compare` 全读）；compare 文件列表 MVP 纯点击（dragRef compare 模式留后续）；移动端 `GitDiffPanel` 分支视图不启用双选（双选 + 开中栏 tab 在移动端语义复杂，MVP 不做）。

## 安全边界（所有批次共享）

- **只读**：全部是 git 读命令（log / diff / for-each-ref / rev-list / rev-parse / numstat），不碰写操作。spec 的「read-only」契约保持。
- **argv 数组**：复用 `ProjectGitDiffService.gitRaw`（`git -C projectPath ...args`），不 shell 拼接。
- **Project-safe resolver**：路径参数经 `resolveProjectRelativePath` 收敛到 PROJECTS_ROOT 内。
- **分支名白名单**（R3 / R4 / R5 含分支参数）：只允许 `[A-Za-z0-9._/-]`，拒绝 `;` `&` `$()` 等元字符 + `..` 语义异常。argv 已防 shell 注入；白名单是防 git 语义异常（如 `@{u}` refspec、`..` range 歧义、含空格的 ref）。

## 决策日志

- **保持只读**：用户方向 A（只读增强）+ 多分支/远端 + diff 体验，不含写操作（方向 B）。spec read-only 契约不变。写操作作为独立大决策，本任务不涉及。
- **批次顺序**：第一批 R1+R2 成本最低感知最强（numstat + branch header 是列表 meta/header 的小增强），先做；第二批 R3+R4+R6 是用户明确要的「多分支 + 本地/远端差异」核心，共享 commit 行组件一起做最划算；第三批 R5 架构改动大放后；diff 体验独立。
- **hapi 参考**：hapi 同样只读，有 numstat + branch 显示（验证 R1/R2 的价值），无分支列表 / 远端 commit 差异（R3/R4 是我们超出 hapi 的扩展）。
- **scope 扩展策略（R5）**：`GitDiffScope` 当前是 `"worktree"|"staged"` union，R5 倾向新增独立请求类型而非扩 union，避免污染现有 scope 语义；第三批 plan 时定稿。
- **DTO 扩展策略（R1/R2）**：R1 加字段到现有 `GitDiffFileSummary`（向后兼容，旧消费方忽略新字段）；R2 加可选 `branch` 到 `GitDiffListResponse`（无 upstream 时 undefined）。两处都是非破坏性扩展，可灰度。
- **commit hash 渲染位置（R4/R6 修正）**：`GitCommitRow` 的 hash 不放 marker 位——`IconMarker size="sm"` 是 28×28 固定方框，装不下 7 字符 mono（~42px），溢出压到 title；hash 移到右侧 `meta`（shrink-0 不溢出），marker 位不传。commit 列表内全体一致（commits view / ahead-behind 展开都是纯 GitCommitRow，不与 GitFileList 混排），无 marker 不产生左对齐错位。

## 现状锚点（实现时定位）

- **API**：`api/src/project-git-diff.ts` `ProjectGitDiffService.listDiff`（L44）/ `fileDiff`（L74）/ `gitRaw`（L160，argv 封装）/ `resolveProject`（L133，safe resolver）/ `parseNameStatus`（L180，status 解析，numstat 解析可旁路新增）。
- **DTO**：`packages/shared/src/index.ts` `GitDiffScope`（L78）/ `GitDiffFileStatus`（L80）/ `GitDiffFileSummary`（L82）/ `GitDiffListResponse`（L89）。
- **UI**：`web/src/components/git/git-diff-viewer.tsx` `GitFileList`（L81，行渲染，R1 meta 落点）/ `GitChangesList`（L260，左栏列表 + `GitScopeChips`，R2 header 落点）/ `GitFileDiffPanel`（L153，单文件 diff）/ `DiffContent`（L388，unified diff 渲染 + `parseDiff` L341，R7/R9 落点）/ `GitScopeChips`（L446，统计 chips）/ `summarizeGitFiles`（L62，聚合）。
- **API client**：`web/src/api/client.ts` `listProjectGitDiff` / `getProjectGitFileDiff`。
- **spec / 架构**：`docs/specs/git-diff-viewer/spec.md`（read-only 契约，扩展时保持）/ `docs/architecture/git-diff-viewer.md`。
