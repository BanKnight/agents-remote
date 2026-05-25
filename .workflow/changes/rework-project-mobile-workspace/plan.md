# plan

## Change 目标

- 将 Project 详情页移动端从偏桌面侧栏/面板结构重排为 Project 工作区主界面：顶部返回与 Project 上下文，主体依次提供 Files/Git 功能区、Agent Sessions 区和 Terminal Sessions 区。
- 移除 Project 工作区常驻底部 runtime input，把真实输入职责留给 Agent/Terminal Session detail。
- 保留现有 Project、Agent Session、Terminal Session、Files/Git 的数据加载、创建、关闭和进入详情能力，不改后端 API 或 shared DTO。

## 局部 big picture

- 本 change 建立在 `align-mobile-app-shell` 已完成的移动端 App-like shell、动态视口高度和横向不溢出基线上，负责把 Project 级工作区入口整理成手机默认可用的主界面。
- 它是后续 `compact-inspection-mobile-views` 的前置：本次只让 Files/Git 作为顶部功能入口可发现，不重做 Files/Git 深层只读详情的信息密度。
- 它也为 `rework-session-mobile-console` 保持边界：Project 工作区只负责选择/创建/进入 session，输入、快捷键、重连恢复仍属于 Session detail。

## 执行策略

- 以 `web/src/routes/ProjectConsoleRoute.tsx` 为主要实现入口，优先重组现有组件和查询/mutation 数据流，而不是新增路由、依赖或大规模拆目录。
- 先把页面外壳改为移动端单列工作区：顶部 Project header、Files/Git action cards、Agent section、Terminal section；桌面端可用响应式网格增强，但不能让移动端依赖侧栏才能发现入口。
- 复用现有 `AgentPanel`、`TerminalPanel`、`SessionCard`、Files/Git section 详情逻辑；必要时提取轻量 section/card 组件保持文件内边界清晰。
- 从 Project console 渲染树移除固定底部 runtime input panel；如果 `inputPanelOpenAtom` 仅被该页面使用，则删除对应 atom/import，避免遗留无效全局 UI 状态。
- 局部检查先覆盖 TypeScript/格式/测试，再在 verify 阶段用移动 viewport 浏览器 artifact 验证顶部返回、功能区、Agent 区、Terminal 区和无底部 input。

## 任务顺序依据

- 先处理页面结构与状态边界，因为它决定后续 Files/Git action cards、Agent/Terminal 区域和 bottom input 移除是否共用同一布局骨架。
- 再分别接入顶部功能区和 Agent/Terminal 工作区区域，确保入口顺序、会话列表和创建/关闭行为保持现有语义。
- 最后清理 Project console 不再使用的 runtime input 状态与文案，并运行局部质量门禁，避免把无效 atom 或固定底部 padding 留到 verify 阶段。
- 这些任务主要集中在同一前端 route 文件，不能安全并行修改；只有状态清理在主布局确认后才可独立判断。

## 额外上下文

- `docs/project.md`：确认项目 big picture、前端栈、移动端动态视口/局部滚动/`min-w-0` 边界，以及 Files/Git 只读约束。
- `docs/design/console-shell.md`：确认 Console Shell 移动端主路径、Create/Adopt 低频入口、动态视口和长文本处理等长期设计约束。
- `docs/specs/project-console-navigation/spec.md`：确认 Project console 一级入口与 bottom affordance 的长期 WHAT 基线，避免本 change 的移动重排与主线能力冲突。
- `web/src/routes/ProjectConsoleRoute.tsx`：主要实现入口，包含 Project 数据加载、Agent/Terminal 查询和 mutation、session cards、Files/Git detail 面板与当前底部 input panel。
- `web/src/routes/console-model.ts`：仅在需要调整 section 文案、排序、默认 section 或删除未使用 runtime input 常量时读取/修改。
- `web/src/state/ui.ts`：仅在确认 Project console 不再需要 `inputPanelOpenAtom` 后清理；`activeConsoleSectionAtom` 可继续服务 Files/Git/section 切换。

## 依赖与阻塞

### 阶段依赖

- 依赖 `align-mobile-app-shell` 已完成，提供移动端 App-like shell 和视口不溢出基线。
- 本 change 已完成 specs 和 design；实现前无未解决开放问题。
- 完成实现后必须进入 `verify-change`，并保存移动 viewport 浏览器 artifact。

### 任务依赖

- 1.1 页面骨架与状态边界是 2.x 和 3.x 的前置。
- 2.1 Files/Git 功能区依赖 1.1 的工作区布局和现有 section 切换状态。
- 2.2 Agent 区与 2.3 Terminal 区都依赖 1.1；二者都修改同一 route 文件，实际执行不并行。
- 3.1 runtime input 状态清理依赖 2.x 确认 Project 工作区不再渲染底部 input。
- 4.1 局部质量门禁依赖全部代码任务完成。

### 外部依赖

- 无新增第三方服务、数据迁移、配置、权限或人工确认。
- 若实现阶段需要启动 web/api 进行局部 UI 检查，应优先复用或重启明确命名的 tmux session，避免新端口和孤儿进程；最终浏览器截图由 verify 阶段保存到 change artifacts。

## 并行机会

- 本 change 代码修改主要集中在 `web/src/routes/ProjectConsoleRoute.tsx`，Files/Git、Agent、Terminal 和 input 清理都会触碰同一布局结构，默认不并行。
- 质量门禁和截图验证不能与实现并行，必须等实现完成后执行。
- 如果实现过程中发现 `console-model.ts` 的文案/排序调整与 `ui.ts` 的 atom 清理互不冲突，可在主 route 修改稳定后连续处理，但仍按 tasks 顺序落盘。

## 风险与验证重点

- 风险：重排 route 时破坏现有 Agent/Terminal session 创建、关闭、进入详情或 query invalidation；实现应复用现有 mutation 与 `SessionCard` 行为。
- 风险：移动端看似单列但长 project path、session id、branch 或 path 文案撑开横向 viewport；所有长文本区域要使用 `min-w-0`、`truncate`、`break-all` 或局部滚动。
- 风险：只是 CSS 隐藏 bottom input 而不是移除渲染树；验收必须确认 Project workspace 不再渲染固定底部 runtime input panel。
- 风险：Files/Git 功能区变成小图标或隐藏侧栏；验收必须确认手机默认视图能直接发现 Files/Git action cards。
- 验证重点：移动 viewport 下顶部返回、Project name/path、Files/Git 功能区、Agent Sessions 区、Terminal Sessions 区、无底部 input、常见内容量下无无意义页面滚动和无横向溢出。

## 不做事项

- 不新增或修改 `api/`、`packages/shared/`、Agent/Terminal runtime、WebSocket、Files API 或 Git API。
- 不新增 Project workspace 路由，不改变 `/projects/$projectName`、Agent Session detail 或 Terminal Session detail 路由。
- 不把 Session detail 的输入、快捷键、重连恢复或 terminal emulator 搬到 Project 工作区。
- 不重做 Files/Git 列表/详情的信息密度；只做 Project 工作区入口级功能区。
- 不新增依赖、不引入持久化配置、不新增 feature flag 或兼容性 shim。
