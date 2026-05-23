# TanStack 默认技术基线

## 默认推荐

- TanStack Query 默认适合管理 server state：缓存、重试、失效、后台同步。
- TanStack Router 适合需要强类型路由、search params、loader 和嵌套路由的 React 应用。
- TanStack Table 适合需要 headless、强定制、高复杂度表格；简单表格不要过度引入。
- TanStack Form 可评估，但应与项目表单复杂度、schema 校验和生态成熟度对照。
- TanStack Start 这类全栈框架能力必须确认当前成熟度后再采用。

## 职责边界

- Query：server state，不负责局部 UI state。
- Router：URL state、route hierarchy、loader/search params。
- Table：表格状态模型与渲染无关核心。
- Form：字段状态、校验和提交生命周期。

## 常见反模式

- 把 TanStack Query 当全局状态管理器。
- Router loader、Query 和 framework data APIs 重复获取同一数据。
- 简单表格用 headless table 写出大量样板代码。
- SSR 时复用全局 QueryClient，造成请求间数据泄漏。

## 需要官方确认的点

- 当前 TanStack 各包版本兼容性和 framework 集成方式。
- Router/Start 的 SSR、file-based routing、server functions 成熟度。
- Query 在 SSR/streaming/hydration 场景下的推荐用法。
- Table/Form 与项目 UI library/schema library 的集成方式。

## 何时不适用

- framework 内置 data/router 已足够且更简单。
- 表格需求简单，普通组件即可满足。
- 团队不需要强类型路由或 search params。

## 输出落点

- 数据获取、URL state、表格/表单边界进入 design-change 的 frontend 子域。
- SSR hydration、QueryClient 生命周期进入 architecture/frontend 设计。
