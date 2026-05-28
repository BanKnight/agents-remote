# Frontend Design

## Change

- change-id：align-resource-inspection-workspaces

## 前端范围

- 修改范围以 `web/src/routes/ProjectConsoleRoute.tsx` 和必要的 `web/src/components/shell/` primitive 扩展为主。
- `web/src/routes/console-model.ts` 只在需要调整 resource workspace label/copy/status 或可测试 model 时修改。
- 不修改 `web/src/api/client.ts`、`packages/shared` DTO、Files/Git/Terminal API、TanStack Router route 定义或 Session detail runtime 协议。
- 不新增外部依赖，不新增 shadcn/ui 组件；继续通过 shell wrappers 消费已有 `Button`、`Badge`、`Card`、`Input` 间接能力。

## 模块划分

- `ProjectConsole` 继续作为 Project direct secondary route container，负责 project scope、workspace search state、session queries/mutations、resource deep detail chrome 状态和 `ShellLayout` 装配。
- `WorkspaceHeader` 继续承载当前 Project/workspace scope；resource workspace 不在 header 堆叠长说明，详细上下文放到 workspace panel 内的紧凑 toolbar。
- `SectionDetail` 可以演进为 resource workspace shell wrapper，负责 Files/Git 共有的 section status/header/surface，而不是继续让 Files/Git 各自散写不一致 outer chrome。
- `FilesPanel` 继续负责 current path、selected file 和 Files queries；可拆分为 `ResourceToolbar`、`FileEntryList`、`FilePreviewPanel` 等 route-local 或 shared helper，但不把 API/query 逻辑抽到 shell components。
- `GitDiffPanel` 继续负责 selected changed file 和 Git queries；可复用与 Files 相同的 mobile detail header/list-detail layout helper。
- `TerminalPanel` 继续负责 Terminal instance list 和 create/open/close actions；视觉上应收敛为与 Agent/Files/Git list rows 一致的 compact instance list。

## 组件边界

- 应优先复用已有 shared shell components：`ShellLayout`、`ShellPanel`、`ShellHeaderSurface`、`ShellSidebar`、`ProjectShellNavigation`、`ProjectShellBottomNavigation`、`ActionButton`、`IconMarker`、`ListRow`、`StatusPill`、`shellSurfaceClasses`。
- 如果实现发现 Files/Git mobile detail header、resource toolbar、read-only notice、split layout、empty/error panels 在多个 resource 页面重复，应提取为小型 shared primitive 或 route-local shared helper；提取边界应服务本轮 prototype fidelity，不创建通用文件浏览器组件库。
- `ListRow` 应承载 file row、changed-file row、terminal instance row 的可点击 affordance；Terminal instance row 如需保留 Open/Close 两个 action，可在 row 内组合 `ActionButton`，不要手写与 shared button 不一致的 `<button>`/`<Link>` 样式。
- `IconMarker` 中的 F/G/T/DR/FL/GT/TM 文案可以作为当前轻量 marker；如果使用 lucide-react 图标，应通过统一 icon boundary 引入，不在 route 中散写 SVG。
- `MobileDetailHeader` 可以保留为 route-local helper，但其 surface/action/text density 应与 runtime detail top return 和 shell primitives 对齐。

## 状态管理

- Project workspace active state 继续使用 TanStack Router search `workspace=agents|files|git|terminal`。
- `resourceDeepDetailOpen` 保持 `ProjectConsole` 本地 state，用于控制 `ShellLayout.bottomNavigation` 在 Files preview/Git diff mobile detail 时隐藏；切换 workspace 或 unmount 时必须恢复 false。
- Files `currentPath`、`selectedFilePath` 保持 `FilesPanel` 本地 state；目录切换清空 selected file；返回 preview 只清空 selected file。
- Git `selectedFile` 保持 `GitDiffPanel` 本地 state；返回 diff 只清空 selected file。
- Terminal create/close pending/error 使用 TanStack Query mutation state；成功后 invalidate project/session queries，不引入额外全局状态。
- 不用 Jotai 保存 resource page selection、current path 或 selected diff；这些不需要跨页面共享。

## 路由 / 页面接入

- Direct resource workspaces 继续由 `/projects/$projectName` route + search workspace 承载。
- Files preview 和 Git diff detail 不新增 route；它们是同 route 内的 mobile deep inspection state，通过 local selected state 和 `resourceDeepDetailOpen` 改变 chrome。
- Terminal `Open detail` 继续跳转 `/projects/$projectName/terminal-sessions/$sessionId`，`fromAgentSession` 保持 undefined，表示从 Project Terminal workspace 进入。
- Workspace 切换使用现有 `selectWorkspace`，并在切换前清空 deep detail state；不要用 Jotai 或 hidden route state 替代 URL-visible workspace search。

## 工程约束

- React/prototype implementation 阶段必须加载 `vercel-react-best-practices` skill，并把 route/component separation、避免无效 memo、事件 handler 简洁、direct imports 和局部 state 边界纳入 review。
- 保持 TanStack Query query keys 与现有 API client 一致；不要为了视觉调整重复请求或移动 query 到低层 shell component。
- 不为了截图效果写入 mock data、fake history、fake file content、fake diff、fake terminal output 或 provider/runtime metadata。
- 路由文件可以暂时承载页面组合，但 repeated visual primitives 应优先进入 `web/src/components/shell/`；API/query/data transformation 不进入 shell primitive。
- TypeScript 类型应继续来自 `@agents-remote/shared`；不要在 route 中复制 DTO union。
- UI 实现完成后至少运行 `bun run --cwd web typecheck`、相关 web tests、`git diff --check`，并使用 managed `ar-dev` dev services 采集 browser artifacts。

## 关键决策

- 不新增 URL state 表达 selected file/diff，是为了避免把移动端临时 inspection state 升级为深链契约；当前 specs 只要求同 route 返回和刷新后可回 direct workspace。
- 不新增 shadcn component 是因为当前 shared shell wrappers 已能表达 Button/Badge/Card/Input source component boundary；若实现中确实需要新 Radix 行为，必须重新检查依赖版本和 7 天安全规则。
- Files/Git/Terminal 共享的是 shell/list/detail/status/action 视觉语言，不共享 API/query 或业务模型。
- Terminal direct workspace 的 create/open/close 可以和 Agent list 共享 instance list 表达，但不继承 Agent provider tools、history fake 数据或 runtime detail input/output。

## 风险与权衡

- `ProjectConsoleRoute.tsx` 已经较长，继续在同文件内扩展可能影响维护；实现应优先通过清晰 helper/section 组织降低 JSX 重复，但不要为了本 change 做大规模文件拆分。
- 如果把 `resourceDeepDetailOpen` 作为全局 mobile/deep 状态使用过广，可能误隐藏 Agent/Terminal direct workspace bottom nav；应只由 Files/Git selected detail 控制。
- Shared primitive 提取不足会导致用户已指出的抽象问题复发；提取过度又会制造泛化组件库。本轮以真实三页重复点为准。
- Browser screenshots 可能因为真实 Project 数据不包含 Git changes、files 或 Terminal sessions 而无法覆盖全部视觉；验证 harness 需要准备真实 workspace fixture，不允许在 UI 中伪造。

## 开放问题

- 无阻塞开放问题。
- 是否需要把 resource helper 拆出 `ProjectConsoleRoute.tsx` 到单独 route-adjacent 文件，留到 implement 阶段根据 diff 大小决定；不能在 design 阶段强制大规模文件重组。

## 后续沉淀候选

- `resourceDeepDetailOpen` 这类 route-local mobile chrome 控制模式。
- Files/Git/Terminal direct secondary workspace 和 Session detail route 的前端状态分层边界。
