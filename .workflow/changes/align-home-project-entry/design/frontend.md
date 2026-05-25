# Frontend Design

## Change

- change-id：align-home-project-entry

## 前端范围

- 技术栈沿用现有 `web`：React 19、TypeScript、Vite、TanStack Router、TanStack Query、Tailwind CSS、Jotai 作为非 URL-critical shell UI 状态工具。
- 修改范围集中在 Home route 及其局部展示组件。
- 可复用现有 shared shell primitives：`IconMarker`、`NavItemContent`、`StatusPill`；本 change 不新增通用组件库。
- Project 数据和创建/采用行为沿用现有 `listProjects`、`createProject` client 与 shared `Project` DTO。

## 模块划分

- `HomeRoute` 继续负责 Home 页面组合、Project list query、create mutation、局部 setup 展开状态和导航。
- `PrimaryNav` / `PrimaryBottomNav` 继续只负责一级导航显示，不加载 Project 数据。
- `ProjectListCard` 负责 Project 列表、列表 loading/error/empty 和 Project entry 行呈现。
- Create/adopt 表单可以保持在 Home route 内部的低频 setup 区域，或拆成局部组件；不需要放入跨页面 primitive。
- 不修改 `ProjectConsoleRoute`、Session detail、Files/Git/Terminal 页面内容。

## 组件边界

- 一级导航组件只表达 active Projects 与未来入口，不处理点击进入未实现页面。
- Project 条目应封装在列表区域内，接收 `Project` 数据并渲染图标、名称、路径、状态 pills 和 Link。
- Create/adopt 表单负责输入、提交、禁用、提交中和错误展示；成功导航由 mutation success 处理。
- shared primitives 只承担视觉基础，不承载 Project 业务逻辑。

## 状态管理

- 服务端状态：Project list 使用 TanStack Query；创建/采用使用 TanStack Mutation，并在成功后 invalidate Projects query。
- 路由状态：从 Home 进入 Project 时继续写入 `search: { workspace: defaultConsoleSection }`，默认 Agent workspace 与 shell foundation 保持一致。
- 表单状态：Project folder 输入保留在 Home 局部 state。
- 交互状态：setup 展开/收起保留在 Home 局部 state；空列表、提交中、创建错误可以强制显示 setup 区域。
- 不新增 Jotai atom；Home 当前页面没有需要跨页面共享的非 URL-critical 状态。

## 路由 / 页面接入

- Home route 保持 `/`。
- Project entry Link 保持 `to="/projects/$projectName"`，并显式传入 `search: { workspace: defaultConsoleSection }`。
- 创建/采用成功后继续 navigate 到 `/projects/$projectName`，并显式传入默认 workspace search。
- 不新增 Sessions / Config / Help 路由；这些一级 nav 项仍作为未来入口或 disabled/coming soon 视觉项。

## 工程约束

- 不新增依赖，不查询或引入第三方图标包。
- 不改变 shared DTO、API route 或服务端 Project-safe resolver。
- 保持现有 create mutation 的错误展示和禁用逻辑。
- 移动端布局必须避免横向溢出：Project path、status pill 和 nav label 都要截断或压缩。
- UI 实现后必须运行 web typecheck/test/build，并用真实浏览器检查桌面端与移动端 Home / Project entry。

## 关键决策

- 将本 change 约束为 Home route 的 page-level polish，而不是重做 shell foundation。
- 保留局部 `setupOpen`，因为 Create/adopt 是单页交互，不需要 URL 或全局状态。
- 继续通过 `defaultConsoleSection` 连接 Home Project entry 与 Project Agent workspace 默认入口。
- 使用现有 primitives 达成 prototype 的图标/状态/列表语言，不提前设计通用 ProjectCard 组件。

## 风险与权衡

- 当前 Home 已有 primary shell；实现时主要调整信息层级和密度，避免无意义重写导致回归。
- Project list Link 如果嵌套复杂状态 pill，要保证可点击区域和焦点样式仍清晰。
- Create/adopt 表单默认隐藏会降低可见性，但符合低频入口目标；空态和错误/提交中状态会补足发现性。

## 开放问题

- 无阻塞开放问题。

## 后续沉淀候选

- Home route 的 Project entry 状态边界：服务端状态用 TanStack Query，Project workspace default 用 URL-visible Router search，setup 展开保持局部 state。
