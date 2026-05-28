# tasks

## 执行顺序

1. 基础/阻塞任务：先做实现前审计与承诺清单，加载 React/prototype alignment 必读上下文和 `vercel-react-best-practices`。
2. 核心实现任务：先收敛 shared primitives/route helpers，再依次对齐 Files、Git、Terminal resource workspace。
3. 集成与验证任务：先运行静态和单元检查，再采集 browser artifacts，最后回写 gaps/progress。
4. 清理与横切任务：贯穿 2.x 和 3.x，确保不伪造能力、不漂移 shared UI、不遗漏 artifact。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 审计 resource workspace 边界并建立实现承诺清单
  - 验收标准：
    - 已加载 `vercel-react-best-practices` skill。
    - 已对照 `files.html`、`git.html`、`terminal.html`、shared alignment contract、design system note、长期 Files/Git/Session specs 和当前 `ProjectConsoleRoute.tsx`，确认当前实现差异和不可越界能力。
    - 已明确哪些原型-only 能力需要 truthful empty/future/unsupported/gap 表达，且没有要求实现阶段伪造数据。
    - 已在会话或任务记录中列出本轮实现必须满足/必须避免的关键承诺。
  - 任务承诺清单：
    - 必须确认 Files/Git 只读、Terminal direct workspace 无 runtime input/output、mobile direct/deep navigation 互斥、artifact requirements。
    - 必须确认 shared shell primitives 是后续实现的主要视觉边界。
    - 必须保留现有 API/query/runtime/Project-safe path 边界。
    - 必须把可能的 HTML preview sandbox、Terminal history/restore 等真实能力缺口标记为 gap 候选，而非实现目标。
  - 依据：`plan.md`；specs/resource-inspection-workspaces/spec.md；design/overview.md；design/ui-ux.md；design/frontend.md；design/risks.md；shared/alignment-contract.md；shared/design-system-note.md；docs/project.md
  - 必读上下文：`.claude/skills/vercel-react-best-practices/AGENTS.md` 或 skill 入口；`docs/design/prototype/files.html`；`docs/design/prototype/git.html`；`docs/design/prototype/terminal.html`；`web/src/routes/ProjectConsoleRoute.tsx`；`web/src/components/shell/`
  - 修改范围：无代码修改；如发现阻塞，只更新本 change progress 或汇报，不改实现。
  - 依赖：无
  - 并行：否（阻塞后续任务）
  - 结果：已加载 React/prototype alignment、component/style abstraction、frontend implementation references 和已安装的 `vercel-react-best-practices` 约束；已确认 Files/Git 只读、Terminal direct workspace 无 runtime input/output、mobile direct/deep navigation 互斥、artifact requirements、shared shell primitives 优先、现有 API/query/runtime/Project-safe path 不变；HTML sandbox preview 与 Terminal history/restore 仅作为 gap 候选，不作为实现目标。

### 2. 核心实现任务

- [x] 2.1 收敛 resource workspace shared primitives 和 route helpers
  - 验收标准：
    - Files/Git/Terminal 重复的 surface、toolbar、list row、mobile detail header、status/action 样式已复用现有 shell primitives 或收敛为清晰 helper。
    - Route 中不再为 resource workspace 私自散写与 shared shell 语言冲突的按钮、row、surface、danger/warning 样式。
    - 不抽象 API/query/data transformation，不创建泛化文件浏览器或 Git 工具组件库。
  - 任务承诺清单：
    - 必须优先复用 `ShellLayout`、`ShellPanel`、`ShellHeaderSurface`、`ProjectShellNavigation`、`ProjectShellBottomNavigation`、`ActionButton`、`IconMarker`、`ListRow`、`StatusPill`、`shellSurfaceClasses`。
    - 必须让 clickable affordance、hover/selected/focus/disabled、cursor 和 safe-area 行为来自 shared component 或同一 helper。
    - 必须保持 route/search state、query hooks 和 mutations 在 route/container 层。
  - 依据：`plan.md`；design/frontend.md；shared/design-system-note.md；docs/design/frontend-ui-architecture.md
  - 必读上下文：`web/src/routes/ProjectConsoleRoute.tsx`；`web/src/components/shell/shell-layout.tsx`；`web/src/components/shell/shell-navigation.tsx`；`web/src/components/shell/shell-primitives.tsx`
  - 修改范围：`web/src/routes/ProjectConsoleRoute.tsx`；必要时 `web/src/components/shell/shell-primitives.tsx` 或 shell component 文件。
  - 依赖：1.1
  - 并行：否（后续 Files/Git/Terminal 都依赖统一 UI 边界，且修改同一文件）

- [x] 2.2 对齐 Files workspace list/preview 与移动端 preview detail
  - 验收标准：
    - Desktop Files workspace 呈现 Project 二级 shell + path toolbar + file list + preview split，并保持只读状态表达。
    - Mobile Files direct workspace 显示 file list、current path 和底部 Project 二级 nav；进入 preview 后隐藏底部 nav，显示顶部返回。
    - File list、preview、loading、empty、error、too-large、unsupported 状态保持紧凑、真实、可扫读且不横向溢出。
    - 不出现 create/edit/delete/upload/rename/save 等 Files 写操作。
  - 任务承诺清单：
    - 必须保留 `currentPath` / `selectedFilePath` 本地状态和 Project-safe relative path API 调用。
    - 必须目录切换清空 selected file，preview 返回不重置 current path。
    - 必须复用 2.1 的 shared primitive/helper。
    - 必须不伪造 file content、HTML sandbox 能力或 preview type。
  - 依据：specs/resource-inspection-workspaces/spec.md；design/ui-ux.md；design/frontend.md；docs/specs/file-browser-preview/spec.md；docs/design/prototype/files.html
  - 必读上下文：`web/src/routes/ProjectConsoleRoute.tsx` 中 `FilesPanel`、`FileEntryList`、`FilePreviewPanel`、`PreviewBody`；`web/src/api/client.ts` Files 方法只读调用签名
  - 修改范围：`web/src/routes/ProjectConsoleRoute.tsx`；必要时 shell primitives。
  - 依赖：2.1
  - 并行：否（修改同一 route 文件，且要复用 2.1 helper）

- [x] 2.3 对齐 Git workspace changed-file list/diff 与移动端 diff detail
  - 验收标准：
    - Desktop Git workspace 呈现 Project 二级 shell + status toolbar + changed-file list + unified diff split，并保持只读状态表达。
    - Mobile Git direct workspace 显示 changed-file list、read-only context 和底部 Project 二级 nav；进入 diff 后隐藏底部 nav，显示顶部返回。
    - diff 行、路径、status label、non-repository、no changes、loading/error 状态保持紧凑、真实、可扫读且不横向溢出。
    - 不出现 stage/commit/checkout/reset/stash/discard 等 Git 写操作。
  - 任务承诺清单：
    - 必须保留 `selectedFile` 本地状态和现有 read-only Git queries。
    - 必须确保 Retry 只是 refetch，不表达写操作。
    - 必须复用 2.1 的 shared primitive/helper，并与 Files list/detail 语言一致。
    - 必须不伪造 Git diff、branch/status 或 changed file 数据。
  - 依据：specs/resource-inspection-workspaces/spec.md；design/ui-ux.md；design/frontend.md；docs/specs/git-diff-viewer/spec.md；docs/design/prototype/git.html
  - 必读上下文：`web/src/routes/ProjectConsoleRoute.tsx` 中 `GitDiffPanel`、`GitFileList`、`GitFileDiffPanel`；`web/src/api/client.ts` Git 方法只读调用签名
  - 修改范围：`web/src/routes/ProjectConsoleRoute.tsx`；必要时 shell primitives。
  - 依赖：2.2
  - 并行：否（修改同一 route 文件，且要与 Files 共享语言）

- [x] 2.4 对齐 Terminal workspace instance list 并保持 direct secondary 边界
  - 验收标准：
    - Desktop/Mobile Terminal workspace 均呈现 Terminal instances list、New Terminal、Open detail、Close 和真实 loading/empty/error/closing 状态。
    - Mobile Terminal direct workspace 显示 Project 二级 bottom nav，不显示 deep detail 返回。
    - Terminal workspace 不显示 runtime output、textarea input drawer、quick keys、shell command composer 或 Agent-only contextual tools。
    - Close Terminal 保留危险确认；create/close 成功后仍通过真实 query invalidation 更新。
  - 任务承诺清单：
    - 必须保留现有 Terminal Session API/mutation/query 边界。
    - 必须使用 shared list/action/status/surface 语言，让 Terminal instance row 与 Agent/resource rows 一致。
    - 必须确保 `fromAgentSession` 仍为 undefined，表示从 Project Terminal workspace 进入 Terminal detail。
    - 必须不伪造 Terminal history、restore、output 或 runtime metadata。
  - 依据：specs/resource-inspection-workspaces/spec.md；design/ui-ux.md；design/frontend.md；docs/specs/session-runtime/spec.md；docs/design/prototype/terminal.html
  - 必读上下文：`web/src/routes/ProjectConsoleRoute.tsx` 中 `TerminalPanel`、`TerminalInstanceList`、`TerminalInstanceRow`；`web/src/routes/SessionDetailRoute.tsx` 仅用于确认 runtime detail 边界，不复制 input/output 到 workspace
  - 修改范围：`web/src/routes/ProjectConsoleRoute.tsx`；必要时 shell primitives。
  - 依赖：2.3
  - 并行：否（修改同一 route 文件，且必须复用前序 shared language）

### 3. 集成与验证任务

- [x] 3.1 运行前端静态检查和相关测试
  - 验收标准：
    - `bun run --cwd web typecheck` 通过。
    - 相关 web tests 通过；至少运行 `bun test web/src/routes/console-model.test.ts`，如实现修改新增测试则运行对应测试。
    - `git diff --check` 通过。
    - 如检查失败，修复根因后再勾选；不得跳过 hooks 或绕过检查。
  - 任务承诺清单：
    - 必须验证 TypeScript、route/model 相关测试和 diff whitespace。
    - 必须确认没有新增未使用依赖、伪造数据或范围外 API 修改。
  - 依据：`plan.md`；design/risks.md；docs/project.md 测试与质量门禁
  - 必读上下文：`package.json` / `web/package.json` scripts（如命令不确定时读取）；相关测试输出
  - 修改范围：必要的代码修复；不更新 docs。
  - 依赖：2.4
  - 并行：否（依赖全部实现）

- [x] 3.2 采集 resource workspace prototype/app browser artifacts
  - 验收标准：
    - 使用 managed `ar-dev`（API `43011`、Web `43012`、`PROJECTS_ROOT=/home/deploy/workspace`）或同一固定 session 采集 artifacts。
    - artifacts 包含 `files.html`、`git.html`、`terminal.html` prototype desktop/mobile screenshots。
    - artifacts 包含真实 app Files/Git/Terminal workspace desktop/mobile screenshots。
    - artifacts 额外覆盖 mobile Files preview detail 和 mobile Git diff detail 截图或 browser check JSON/log。
    - `browser-check.log` 记录结构断言、可接受差异、是否有 blocking difference、真实 fixture 限制和 follow-up gap 引用。
  - 任务承诺清单：
    - 必须覆盖 desktop `1440x1000` 和 mobile `390x844`。
    - 必须检查 Files/Git read-only、Terminal workspace no runtime input、mobile bottom nav direct/deep 互斥、Close confirm。
    - 必须使用真实 Project 数据或真实本地 fixture，不在 UI 中伪造。
    - 必须避免残留孤儿进程和端口漂移。
  - 依据：specs/resource-inspection-workspaces/spec.md；shared/alignment-contract.md；design/risks.md；docs/project.md 调试服务规则
  - 必读上下文：docs/design/prototype/files.html；docs/design/prototype/git.html；docs/design/prototype/terminal.html；当前 app route；可用 browser/agent-browser 操作方式
  - 修改范围：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/artifacts/`；必要时修复实现问题。
  - 依赖：3.1
  - 并行：否（依赖稳定 app 和 managed browser/dev services）

- [x] 3.3 回写 gaps、tasks 和 progress，准备进入 verify
  - 验收标准：
    - 如发现原型-only 能力缺口，已按模板追加到 `.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md`；如无新增缺口，明确记录无需新增。
    - `tasks.md` 中 1.1、2.1、2.2、2.3、2.4、3.1、3.2、3.3 均已完成。
    - `progress.md` implementation 产物检查更新为已完成，当前阶段推进到待验证，阻塞项为无。
    - 本轮实现说明简短记录关键代码路径、检查命令和 artifacts 路径。
  - 任务承诺清单：
    - 必须保持 tasks/progress/系统任务状态一致。
    - 必须不把长期 docs 沉淀混入实现阶段。
    - 必须为后续 `verify-change` 提供清晰 artifacts 和 gap 状态。
  - 依据：`plan.md`；shared/follow-up-gaps.md；progress.md；tasks.md
  - 必读上下文：本 change tasks/progress；artifacts 目录；follow-up-gaps.md
  - 修改范围：本 change `tasks.md`、`progress.md`；按需 shared/follow-up-gaps.md。
  - 依赖：3.2
  - 并行：否（收口任务）

## 依赖图

- 1.1 → 2.1 → 2.2 → 2.3 → 2.4 → 3.1 → 3.2 → 3.3

## 可并行任务

- （无；核心实现集中修改同一路由和 shared primitives，串行执行可降低漂移与冲突风险。）

## 阻塞项

- （无）
