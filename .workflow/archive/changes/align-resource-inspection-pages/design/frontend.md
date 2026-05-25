# Frontend Design

## Change

- change-id：align-resource-inspection-pages

## 前端范围

- 技术栈沿用现有 `web`：React 19、TypeScript、Vite、TanStack Router、TanStack Query、Tailwind CSS。
- 主要修改 `web/src/routes/ProjectConsoleRoute.tsx`，按需调整 `web/src/routes/console-model.ts` 或浏览器 harness。
- 复用现有 `listProjectFiles`、`previewProjectFile`、`listProjectGitDiff`、`getProjectGitFileDiff`、`listTerminalSessions`、`createTerminalSession`、`closeTerminalSession`。
- 不修改 shared DTO、API route contract、Project safe resolver、Git/Files API 或 Session Runtime。

## 模块划分

- `ProjectConsole` 继续负责 route/search workspace、Project query、Agent/Terminal sessions query、create/close mutations 和二级导航渲染。
- `FilesPanel` 增加移动 deep preview state 回调：选中文件后进入 preview detail，返回时清除 selectedFilePath。
- `GitDiffPanel` 增加移动 deep diff state 回调：选中文件后进入 diff detail，返回时清除 selectedFile。
- `ProjectConsole` 根据 active workspace 和 Files/Git 是否处于 deep inspection state 决定是否渲染 `ProjectSecondaryBottomNav`。
- `TerminalPanel` 收敛为 compact instance list：New Terminal、loading/empty/error、Open detail、Close confirm/status。

## 状态管理

- Project workspace active state 继续使用 `/projects/:projectName?workspace=...`。
- Files current path、selected file、Git selected file 保持组件本地 state；本轮不进入 route/search。
- Files/Git server data 继续使用 TanStack Query。
- 移动 deep inspection 标志由 Files/Git panel 通过局部 callback 上报到 `ProjectConsole`，只用于隐藏 Project 二级底部导航和调整 mobile layout。
- Terminal list/create/close 继续沿用现有 TanStack Query/Mutation。

## 路由 / 页面接入

- 不新增 Files/Git route。
- Terminal instance detail 仍使用 `/projects/$projectName/terminal-sessions/$sessionId`。
- 直接二级 workspace 仍由 `workspace=files|git|terminal` 表达。
- 移动 preview/diff detail 是同 route 内 deep state；刷新恢复不在本轮范围。

## 工程约束

- 不新增依赖。
- 不引入 xterm.js、diff viewer、syntax highlighter 或文件 viewer 依赖。
- 不新增 Files/Git 写操作。
- 保留 Project 二级底部导航现有 Back/Agent/Files/Git/Terminal 模型，但在 mobile deep preview/diff state 隐藏。
- 保持 long text 安全：`min-w-0`、`truncate`、`break-all`、`overflow-auto` 必须覆盖 paths、session ids、diff lines 和 preview content。
- 实现后运行 format/lint/web typecheck/test/build，并用真实浏览器检查桌面/移动 Files/Git/Terminal workspace 与 mobile preview/diff detail。

## 关键决策

- 本 change 不提前抽出 Files/Git shared resource component；先在 `ProjectConsoleRoute.tsx` 局部完成 polish，避免影响后续独立 resource route 可能性。
- 使用同 route local state 处理 mobile deep detail，符合现有长期 design 中 Files/Git section 不新增独立 route 的边界。
- Bottom nav 隐藏由上层 `ProjectConsole` 统一控制，避免 panel 内 CSS 与 shell navigation 规则冲突。
- Browser harness 可使用 mock API 或临时 project fixture，必须保存截图与日志 artifact。

## 风险与权衡

- `ProjectConsoleRoute.tsx` 已较大，本 change 只做局部重组，避免引入跨文件 component library。
- 深层 detail 不进 URL，刷新后会回直接二级 workspace；这是本轮明确不做事项。
- Files/Git preview/diff mobile detail 与桌面同页 panel 需要共享数据状态，避免双重 query 或状态漂移。

## 开放问题

- 是否要为 Files/Git selected item 提供 URL-visible deep state，留给后续有刷新恢复需求时设计。

## 后续沉淀候选

- Project resource workspace 的 direct secondary / deep inspection 前端边界。
- ProjectConsoleRoute 中 Files/Git/Terminal panel 的长期拆分边界。
