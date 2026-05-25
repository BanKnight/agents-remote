# plan

## Change 目标

- 对齐 Files / Git / Terminal resource pages：Project 直接二级页保留统一二级导航，Files/Git 保持只读 inspection，Terminal workspace 展示 Terminal instances 并支持新建/进入/关闭。
- 对齐移动端层级：Files preview 与 Git file diff 是深层 inspection detail，使用顶部返回并隐藏 Project 二级底部导航；Terminal instance detail 继续使用已有 focused shell detail。

## 局部 big picture

- 本 change 位于 shell foundation、Home、Agent workspace 和 instance detail 之后，负责补齐 Project 辅助 resource workspaces。
- Files/Git/Terminal 是 Project 直接二级 workspace；它们不能继承 Agent detail 的 runtime input，也不能把 Files/Git 写操作混入第一轮 UI。
- 后续 `verify-prototype-ui-alignment` 会基于本 change 的截图/日志验证整组 prototype alignment，因此本 change 必须留下桌面/移动 browser artifacts。

## 执行策略

- 以 `web/src/routes/ProjectConsoleRoute.tsx` 为主要实现入口，复用现有 Files/Git/Terminal API client、TanStack Query 和 shell primitives。
- 先让 `ProjectConsole` 能感知 Files/Git mobile deep inspection state，并在 preview/diff deep detail 时隐藏 `ProjectSecondaryBottomNav`。
- 再收敛 Files workspace：直接二级页保持 compact list；移动端选中文件后切到 content-first preview detail，顶部返回列表；桌面保留 list + preview 同页结构。
- 再收敛 Git workspace：直接二级页保持 compact changed-file list；移动端选中 diff 后切到 content-first diff detail，顶部返回 changed files；桌面保留 list + diff 同页结构。
- 再整理 Terminal workspace：确保 Terminal instance list、新建、进入 detail、close confirm、loading/empty/error/pending 状态和长文本 overflow 与 prototype 结构一致。
- 最后运行 web 门禁和真实浏览器 harness，采集 desktop/mobile Files/Git/Terminal、mobile preview/diff deep detail 与 no-write/no-bottom-nav 证据。

## 任务顺序依据

- 先处理 shell 层 bottom nav 隐藏机制，因为 Files/Git mobile deep detail 都依赖它。
- Files 和 Git 修改同一 `ProjectConsoleRoute.tsx` 且共享 resource detail 模式，不并行。
- Terminal workspace 也在同一文件中，但依赖较少；放在 Files/Git 之后统一调整密度和状态。
- Browser harness 必须最后执行，确保覆盖最终 UI 状态和 artifacts。

## 额外上下文

- `docs/design/frontend-ui-architecture.md`：三层页面模型、Project 直接二级 workspace 与 deep/contextual detail 规则。
- `docs/design/prototype/guidelines.md`、`docs/design/prototype/files.html`、`docs/design/prototype/git.html`、`docs/design/prototype/terminal.html`：resource pages prototype 对齐来源。
- `docs/specs/file-browser-preview/spec.md`、`docs/specs/git-diff-viewer/spec.md`、`docs/specs/session-runtime/spec.md`：只读 Files/Git 和 Terminal Session 长期契约。
- `docs/design/file-browser-preview.md`、`docs/design/git-diff-viewer.md`、`docs/design/console-shell.md`：现有长期实现边界。
- 代码入口：`web/src/routes/ProjectConsoleRoute.tsx`、`web/src/routes/console-model.ts`、`web/src/api/client.ts`、`packages/shared/src/index.ts`。

## 依赖与阻塞

### 阶段依赖

- 依赖 `align-ui-shell-foundation` 已完成，提供 Project 二级导航、URL-visible workspace 和 shared primitives。
- 当前 specs/design 已完成，可进入实现计划。

### 任务依赖

- 1.1 建立 mobile resource deep detail shell 状态，阻塞 Files/Git mobile detail。
- 2.1 Files mobile preview deep detail 依赖 1.1。
- 2.2 Git mobile diff deep detail 依赖 1.1。
- 2.3 Terminal workspace polish 可在 2.1/2.2 后进行，避免同文件冲突。
- 3.1 browser verification 依赖所有实现任务。

### 外部依赖

- 无第三方服务、数据迁移、权限或人工确认。
- Browser harness 可使用 mock API 或临时 Project fixture，避免依赖真实用户 Project 或 secrets。

## 并行机会

- 不并行。主要修改集中在 `ProjectConsoleRoute.tsx`，Files/Git/Terminal 都会触碰同一 Project shell 和 panel 结构。

## 风险与验证重点

- 验证移动端 Files/Git 直接二级页仍显示 Project 二级底部导航，且不显示顶部返回一级 Back。
- 验证移动端 Files preview / Git diff deep state 隐藏 Project 二级底部导航，并显示顶部返回列表。
- 验证 Files/Git 不出现写操作，不伪造 Git/Files 数据。
- 验证 Terminal workspace 展示真实 Terminal sessions、create pending/error、close confirm、进入 detail。
- 验证长 path、diff line、session id 不横向溢出。
- 验证桌面端 Files/Git/Terminal 仍可扫读，且 Project 二级导航可见。

## 不做事项

- 不新增 Files/Git/Terminal 后端 API、shared DTO 或 runtime protocol。
- 不新增 Files/Git 写操作、下载、上传、编辑、删除、stage/commit/reset/push/pull。
- 不新增 Files/Git 独立 route 或 URL-visible selected file/diff state。
- 不引入 diff viewer、syntax highlighter、xterm.js 或新图标依赖。
- 不重做 Agent workspace 或 Agent/Terminal instance detail。