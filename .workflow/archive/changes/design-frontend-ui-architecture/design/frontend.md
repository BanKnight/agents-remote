# Frontend Design

## Change

- change-id：design-frontend-ui-architecture

## 前端范围

本设计约束后续 prototype UI alignment changes 在 `web` 内的 route、组件、状态和工程边界。现有前端技术栈保持不变：React 19、TypeScript、Vite、TanStack Router、TanStack Query、Jotai、Tailwind CSS。当前 change 不新增依赖、不改 API、不重构 runtime。

现有相关入口：

- `web/src/routes/router.tsx`：当前只有 `/`、`/projects/$projectName`、Agent session detail、Terminal session detail。
- `web/src/routes/HomeRoute.tsx`：Home/Project list 与 create/adopt 入口。
- `web/src/routes/ProjectConsoleRoute.tsx`：Project workspace、Agent/Terminal panels、Files/Git inline inspection 当前集中在一个 route 文件中。
- `web/src/routes/SessionDetailRoute.tsx`：Agent/Terminal session detail 共享 terminal-first runtime detail。
- `web/src/state/ui.ts`：当前用 Jotai 保存 active Project console section。

## 模块划分

后续 alignment 应按页面层级拆分前端职责：

- **App shell / Home**：负责一级导航、Project list、低频 create/adopt。Home 不持有 Project 内二级 section 状态。
- **Project shell**：负责 Project 上下文、二级导航、Project-scoped layout 和 route/section 容器。
- **Agent workspace**：负责 Agent instance list、provider 创建入口、history summary 和进入 Agent detail。
- **Resource workspaces**：Files、Git、Terminal 二级页分别承担自己的列表/inspection/instance list，不应作为 Project header 下的临时 inline action grid 长期存在。
- **Runtime detail**：Agent/Terminal instance detail 负责 terminal output、transport/runtime status、输入抽屉、quick keys、close/reconnect。
- **Shared UI primitives**：只抽取已经跨页面真实复用的 shell、nav item、list row、status pill、icon marker、terminal panel、input drawer 等；不要为了预想复用提前建立大组件库。

## 组件边界

- Navigation shell 组件只负责层级切换、active 状态和返回入口，不加载 Project resource 数据。
- Workspace header 只展示当前 scope 上下文和低频操作，不渲染大块说明或运行时输入。
- List row 组件承载 Project、Agent instance、Terminal instance、file entry、Git file、history item 的共同密度原则，但各自数据和动作由页面模块传入。
- Status pill 负责文字 + 色彩语义表达，不能只输出颜色点。
- Files/Git preview/detail 组件只读展示内容和错误/空/加载状态，不承担写操作入口。
- Agent detail 可以有 contextual Files/Git/+Terminal/Meta 入口；Terminal detail 不显示这些 Agent-specific shortcuts。
- Input drawer 只属于 runtime detail，不属于 Project shell、Files/Git 或 Home。

## 状态管理

- 服务端状态继续使用 TanStack Query：Project list/detail、Agent sessions、Terminal sessions、Files list/preview、Git diff/file diff。
- Route 层级状态优先进入 TanStack Router 路由或 route params；后续若拆出 Files/Git/Terminal route，不应长期只靠 Jotai section 保存可导航页面。
- 页面局部状态保留在组件内：Files current path/selected file、Git selected file、input drawer open、Meta popover open。
- Jotai 仅用于 shell-level、跨组件但非 URL-critical 的 UI 状态；如果某个状态影响浏览器返回、刷新恢复或深链，应迁移到 route 层级，而不是保留为 atom。
- 表单状态保留在局部组件中，例如 create/adopt Project、session input。

## 路由 / 页面接入

后续 route/workspace 对齐应遵循三层模型：

- 一级：`/` 作为 Home；未来一级 Sessions/Config/Help 如进入实现，应使用同级一级 route 或明确占位策略。
- Project 二级：`/projects/$projectName` 当前承载 Project console；后续可以通过 nested route、search param 或内部 router pattern 表达 Agent/Files/Git/Terminal，但最终用户可感知层级必须清晰。
- 深层 detail：`/projects/$projectName/agent-sessions/$sessionId`、`/projects/$projectName/terminal-sessions/$sessionId` 已存在；后续 Files preview、Git diff detail 或 contextual resource detail 需要同等明确的 detail 层级和返回来源。

Route 设计判断规则：

- 如果用户需要刷新/分享/浏览器返回后仍停留在某个 Project 二级页或深层 detail，该状态应由 URL 承载。
- 如果只是当前页面内部选择，例如同一 Files 页中的临时 selected file preview，可以先保留为组件状态；若进入移动端 detail 形态，则应考虑 route 化。
- 直接二级页与 contextual detail 可以复用数据组件，但导航 chrome 不能混用。

## 工程约束

- 不新增前端框架、状态库、组件库或 icon 依赖；本轮用现有栈实现结构对齐。
- 不把服务端数据请求散落到深层展示组件；页面/section 边界负责 query，展示组件接收视图数据和回调。
- 不把 API DTO 当作 UI view model 全量透传到过深组件；必要时在 route/section 层整理显示字段。
- 保持 Project-safe 能力边界：前端只传 project name、relative path、session id 等参数给统一 API client，不拼接服务端路径或 shell 命令。
- UI alignment 后必须保留现有加载、空、错误、禁用和危险确认行为。
- 涉及用户可见 UI 的后续实现必须用真实浏览器验证桌面端和移动端，不能只靠 typecheck。

## 关键决策

- 当前 `ProjectConsoleRoute.tsx` 的集中式结构适合早期实现，但后续 alignment 应逐步按 Project shell、Agent workspace、resource workspaces、runtime detail 分离职责。
- Files/Git 当前 inline section 需要在后续 resource-page change 中提升为明确二级 workspace 体验；是否拆 URL 由该 change 根据移动端 detail 需求决定。
- `activeConsoleSectionAtom` 不应长期承载可深链的二级页面；如果 Files/Git/Terminal 成为正式二级页，active section 应进入 route/search。
- 组件抽象以真实复用为条件：先统一 shell/nav/status/list/input 等稳定边界，不建立泛化 dashboard/card 系统。

## 风险与权衡

- 过早大规模拆文件会增加 churn；后续 changes 应在需要修改对应页面时顺手拆分相关模块，而不是先做纯重构。
- 不立即强制 route 化所有二级页可以降低风险，但移动端直接二级页和深层详情页的返回模型可能要求 URL 层级更明确。
- 复用 Agent/Terminal detail 的 terminal-first 结构有利于一致性，但 Terminal detail 必须去掉 Agent-specific shortcuts，避免能力误导。
- 使用 Tailwind 继续快速对齐视觉基线，但需要避免在多个页面复制大段不一致 class；共享 primitive 出现真实复用后再抽取。

## 开放问题

- Project 二级页最终采用 nested routes、search param 还是内部 route state，需要在 `align-ui-shell-foundation` 结合 TanStack Router 当前结构决定。
- Icon 语言是否用纯文本/emoji-like marker、inline SVG，还是引入图标依赖；本 version 默认不新增依赖，若后续确需依赖必须另行 technology-research。
- Files/Git mobile preview/detail 是否必须 route 化，取决于后续真实浏览器验证中返回/刷新/滚动恢复需求。

## 后续沉淀候选

- Prototype alignment 后的 route/workspace 三层模型。
- Project shell、resource workspace、runtime detail 的组件职责边界。
- URL state、Jotai shell state 和 component local state 的划分规则。
- 不新增依赖前提下的 UI primitive 抽取原则。
