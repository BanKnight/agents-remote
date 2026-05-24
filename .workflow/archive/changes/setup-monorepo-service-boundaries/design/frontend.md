# Frontend Design

## Change

- change-id：setup-monorepo-service-boundaries

## 前端范围

本 change 只定义 `web` 工作区的工程基础和职责边界，不设计具体页面或组件。

覆盖范围：

- React + TypeScript + Vite 前端应用基础。
- Tailwind CSS 移动端优先深色界面样式基础。
- TanStack 与 Jotai 的状态/路由职责边界。
- `/api` 同域 HTTP/WebSocket 调用方式。
- 基础测试命令入口。

不覆盖范围：

- 登录页、Project 列表、Session 详情页、Files/Git 页面。
- 具体组件库或图标库。
- E2E 链路、移动端真机手感、PWA 安装验证。

## 模块划分

`web` 后续应按稳定能力边界组织，而不是按技术类型堆文件：

- App shell：应用启动、provider wiring、全局路由入口。
- Routes：TanStack Router 路由树和页面入口。
- API client：统一封装 `/api` HTTP 与 WebSocket URL 构造。
- State：Jotai atoms/stores，仅承接本地 UI 状态。
- Styles：Tailwind 全局样式入口和主题 token。
- Test entrypoints：基础测试配置和脚本入口。

本 change 不要求立即创建完整目录，只要求后续 plan/implementation 不违背上述边界。

## 组件边界

当前不拆具体 UI 组件。后续组件设计应遵守：

- 页面级组件负责组合数据、路由和用户路径。
- 可复用组件只封装真实复用的 UI 或交互，不提前抽象。
- API 数据请求不散落到展示组件中。
- 本地交互状态可以放在 Jotai atom，但服务端数据不放进 Jotai 作为缓存替代。

## 状态管理

状态分层：

| 状态类型 | 默认归属 | 说明 |
|---|---|---|
| 路由和 URL 参数 | TanStack Router | Project 名称、session id、tab/search 参数等由路由层表达。 |
| 服务端状态/API cache | TanStack Query 或 Router loader | Project 列表、session 列表、Git/files 数据等由服务端状态工具管理。 |
| 本地 UI 状态 | Jotai | 底部输入区展开、临时选中、局部偏好、非持久化 UI 状态。 |
| 表单状态 | 后续按复杂度决定 | 简单表单可本地 state；复杂表单再评估 TanStack Form 或其他工具。 |
| 全局认证状态 | 后续 auth change 定义 | 当前只保留与 `/api` 调用集成的边界。 |

关键规则：

- 不用 Jotai 替代服务端缓存。
- 不因为单个页面需要而引入额外全局状态库。
- TanStack Table/Form 不作为当前 change 必选依赖，只有后续页面复杂度需要时再引入。

## 路由 / 页面接入

- `web` 是 SPA/PWA 控制台基础，页面路由由前端处理。
- `/api` 前缀不得被前端路由吞掉，应由 dev proxy 或部署层转发到 `api`。
- Project/session URL 参数后续由对应 changes 定义；当前只保证路由方案能支持类型安全参数。
- 对外生产路径中，普通页面 fallback 到 `web`，后端能力全部走 `/api`。

## 工程约束

### 技术资料与版本

- 资料确认时间：2026-05-24。
- React npm latest：19.2.6，满足 7 天规则。
- Vite latest：8.0.14，发布不足 7 天；实现阶段应选满足 7 天规则的 Vite 8.0.13 或更稳版本，除非用户确认。
- Tailwind latest：4.3.0，发布不足 7 天；实现阶段应选满足 7 天规则的版本或等待。
- `@tanstack/react-router` latest：1.170.8，发布不足 7 天；实现阶段应选满足 7 天规则的版本，例如 1.169.8 或当时已超过 7 天的版本。
- `@tanstack/react-query` latest：5.100.14，发布不足 7 天；实现阶段应选满足 7 天规则的版本，例如 5.100.10 或当时已超过 7 天的版本。
- Jotai latest：2.20.0，满足 7 天规则。
- Vitest latest：4.1.7，发布不足 7 天；当前 change 不强制引入。

### 当前资料确认

- Bun docs 确认 workspace、workspace script、`bun test` 能力。
- Vite docs 确认 dev server proxy 支持 HTTP 与 WebSocket。
- Tailwind docs 确认 Vite plugin 是 v4 推荐路径。
- TanStack Router docs 确认 type-safe routing 和 route param 类型推导。
- Jotai docs 确认 atoms、Provider 可选和 scoped state 能力。

## 关键决策

- `web` 使用 React + TypeScript + Vite，不使用 Next.js。
- Tailwind 是样式基础；不在本 change 引入完整组件库。
- TanStack Router 是路由基础候选；TanStack Query 是服务端状态基础候选；其他 TanStack 包按后续需求增量引入。
- Jotai 只承接本地 UI 状态，避免全局 Context 膨胀。
- 基础测试入口先依赖 Bun test；浏览器组件测试和 E2E 工具由后续质量 change 决定。

## 风险与权衡

- TanStack/Jotai 同时存在时，职责边界必须写清，否则容易把服务端状态和 UI 状态混用。
- Vite/Tailwind/TanStack 发布频繁，plan/implement 阶段需要重新检查版本发布时间。
- 不引入组件库会让早期 UI 需要更多手写样式，但避免提前锁死 UI 方案。
- 只预留测试入口不能替代 E2E；必须由 `setup-e2e-quality-baseline` 补齐真实链路验证。

## 开放问题

- 第一轮是否需要 TanStack Query 立即落地，还是 Project/API 数据出现后再安装。
- 是否需要 TanStack Form；当前没有足够表单复杂度依据。
- 是否需要 shadcn/ui；当前 specs 未确认。

## 后续沉淀候选

- `docs/design/frontend-stack.md`
- `docs/architecture/adr/frontend-state-boundaries.md`
