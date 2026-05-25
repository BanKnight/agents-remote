# plan

## Change 目标

- 对齐 Home / Project entry 与 prototype：让 Home 成为清晰的一级 Projects workspace，用户能快速扫描 Project、进入默认 Agent workspace，并在需要时使用低频 Create/adopt 入口。
- 完成后解锁后续 Project Agent workspace、instance detail 和 resource pages 的页面级对齐，因为用户入口层级和默认 Project 进入路径已经稳定。

## 局部 big picture

- 本 change 位于 `align-ui-shell-foundation` 之后，继承已验证的一级 shell、shared primitives 和 URL-visible Project workspace state。
- 它只处理 Web Control Plane 的第一个用户可见闭环：Home → Project entry → Project Agent workspace。
- 后续 changes 会继续对齐 Project 内部 Agent workspace 与资源页；本 change 不抢先实现那些页面的具体内容。

## 执行策略

- 以现有 `HomeRoute` 为实现入口，小步调整信息层级和视觉密度，不重做 shell foundation。
- 保留现有 Project list query、create mutation、错误反馈、空状态和导航逻辑。
- 优先让 Project 列表成为主工作区：减少顶部/侧栏说明干扰，Project 条目保持图标、名称、路径/状态、Open 行为。
- Create/adopt 保持低频入口：默认不抢占列表首屏，但在空态、提交中或错误态保持可见和可恢复。
- 从 Home 进入 Project 继续显式携带 `search: { workspace: defaultConsoleSection }`。

## 任务顺序依据

- 先收敛 Home header、列表和 setup 区域的结构，因为这是所有视觉和状态验证的基础。
- 再调整 Project entry 行和创建入口状态，避免先写测试/验证时锚定旧结构。
- 最后做局部测试和真实浏览器检查，确保桌面/移动首屏、长路径、空态/错误态没有回归。

## 额外上下文

- `docs/design/frontend-ui-architecture.md`：必须读取，用于确认三层页面模型、Home 一级 shell、URL-visible workspace state 和视觉密度基线。
- `docs/design/prototype/guidelines.md`：必须读取，用于确认 Home 页面、底部一级导航、低频操作和 Project 入口规范。
- `docs/design/prototype/home.html`：必须读取，用于对照 Home / Projects desktop/mobile 结构。
- `docs/specs/project-console-navigation/spec.md`：必须读取，用于保留已验证 shell foundation 和长期 navigation 行为契约。
- 代码入口：`web/src/routes/HomeRoute.tsx`、`web/src/routes/shell-primitives.tsx`、`web/src/routes/console-model.ts`。

## 依赖与阻塞

### 阶段依赖

- 依赖 `align-ui-shell-foundation` 已完成；当前已解除阻塞。
- 当前 specs/design 已完成，可进入实现。

### 任务依赖

- 1.1 阻塞后续实现任务，因为它建立 Home 页面目标结构。
- 2.1 依赖 1.1，负责 Project list row 和 create/adopt 入口状态细化。
- 3.1 依赖 2.1，负责局部自动化检查和真实浏览器验证。

### 外部依赖

- 无第三方服务、数据迁移、权限或人工确认。
- 如需要长驻 web/api 服务做浏览器验证，优先复用或重启 `ar-<purpose>` 命名 tmux session；不要反复启动新端口。

## 并行机会

- 当前实现任务都集中在 `HomeRoute.tsx`，不可并行修改同一文件。
- 验证任务必须在实现完成后执行，不并行。

## 风险与验证重点

- 验证 Home 桌面端仍有一级导航 + Projects 工作区，Project 列表是主内容。
- 验证移动端底部一级导航可见，顶部文案克制，Project 列表不会被说明/低频入口挤出首屏。
- 验证 Project path 长文本不会横向溢出。
- 验证 Create/adopt 在默认态低频、空态提升、提交中/错误态可恢复。
- 验证从 Home 打开 Project 时 URL/search 默认进入 Agent workspace。
- 验证不新增 Files/Git 写操作、不改变 Project API 或 session runtime 行为。

## 不做事项

- 不新增 Sessions、Config、Help 的真实路由或能力。
- 不修改后端 Project 创建/采用协议或 shared DTO。
- 不修改 Project 二级 workspace、Agent/Terminal detail、Files/Git/Terminal resource pages。
- 不新增图标依赖或通用组件库。
