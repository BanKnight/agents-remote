# Frontend stack boundaries

本文件记录经过验证后沉淀下来的长期 frontend stack design。它面向后续版本复用，不复制单次 change 的过程记录。

## 背景

- `web` 是移动端优先的 Web/PWA 控制台，需要在后续登录、Project、Agent/Terminal、Files/Git 页面中复用一致的路由、数据和本地 UI 状态边界。
- 第一轮已确定 React + TypeScript + Vite + Tailwind，且将 TanStack 与 Jotai 作为前端基础能力。

## 适用范围

- `web` 工作区应用启动、路由入口、API 调用、全局样式和基础测试入口。
- 后续页面的路由参数、服务端状态/API 数据、本地 UI 状态职责划分。
- 不覆盖具体页面组件、组件库选择、PWA 安装细节或 E2E 工具。

## 设计结论

- React + TypeScript + Vite 是 `web` 的前端应用基础。
- Tailwind CSS 是移动端优先和深色控制台样式的默认工具。
- TanStack Router 承接路由树、URL 参数和页面入口。
- TanStack Query 或 Router loader 承接服务端状态/API 数据获取。
- Jotai 承接本地 UI 状态，例如底部输入区展开、临时选中、局部偏好和非持久化 UI 状态。
- Bun test 提供基础测试入口；浏览器组件测试和 E2E 由后续质量 change 细化。

## 关键规则

- 不用 Jotai 替代服务端缓存。
- 不因为单个页面需要而引入额外全局状态库。
- API 数据请求不散落到展示组件中，应通过统一 `/api` client 或 route/data layer 接入。
- `/api` 前缀不得被前端路由吞掉，应由 dev proxy 或部署层转发到 `api`。
- 可复用组件只封装真实复用的 UI 或交互，不提前抽象。
- TanStack Table/Form、组件库、图标库等只在后续需求明确时增量引入。

## 不适用场景

- 登录、Project 列表、Session 详情页、Files/Git 页面等具体产品交互需要在对应 change 中设计。
- PWA 安装验证、移动端真机手感和端到端链路不由本设计单独保证。
- 如果未来选择 provider-native Agent UI 或复杂表单，可能需要补充更细的页面级设计。

## 来源

- change：setup-monorepo-service-boundaries
- verify 证据：`.workflow/changes/setup-monorepo-service-boundaries/verify.md`
