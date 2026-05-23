# 默认 Web 应用技术栈基线

本 reference 记录用户偏好的常态 Web 应用技术栈。它是默认起点，不是不可变规则。

## 默认偏好

- 本地开发与脚本：Bun。
- 部署平台：Cloudflare。
- UI 框架：React 19。
- 构建工具：Vite。
- 转译/工具链加速：Oxc。
- 样式：Tailwind CSS。
- UI 组件：shadcn/ui。
- 路由/数据/表格/表单等 headless 能力：TanStack。
- 客户端局部状态：Jotai。
- 认证：Better Auth。
- ORM：Drizzle ORM。
- 数据库：Cloudflare D1。

## 默认组合思路

这套组合倾向于：

- 用 Bun 提升本地脚本、安装和开发体验。
- 用 Vite + React 19 做轻量前端应用基础。
- 用 Cloudflare 作为部署和边缘运行平台。
- 用 D1 + Drizzle 覆盖轻量关系型数据场景。
- 用 TanStack 处理路由、server state、表格或表单等复杂前端状态边界。
- 用 Jotai 承接局部 client state，避免把所有状态塞进 Context。
- 用 shadcn/ui + Tailwind CSS 形成可控、可定制的 UI 基础。
- 用 Better Auth 作为认证候选，但必须结合运行环境、数据库适配和安全要求确认。

## 使用规则

技术选择问题如果符合普通 Web 应用、内部工具、SaaS 管理台、轻量全栈应用或 Cloudflare-first 项目，可以先从该默认栈出发。

但最终建议必须经过确认：

- 查官方文档或当前资料确认 React、Vite、Bun、Cloudflare、TanStack、Better Auth、Drizzle、D1、Tailwind、shadcn/ui、Oxc 的当前推荐和限制。
- 检查各组件之间的兼容性，尤其是 Cloudflare runtime、D1、Drizzle、Better Auth、Bun、Vite/Oxc。
- 检查项目是否需要 SSR、SEO、edge runtime、后台任务、强一致事务、文件存储、复杂权限或多租户。
- 新增依赖时执行 SKILL.md 中的依赖与供应链安全检查。

## 何时偏离

以下情况应考虑偏离默认栈：

- 项目需要 Next.js 的全栈框架能力、SSR/ISR、App Router 或平台集成。
- 部署目标不是 Cloudflare，或需要完整 Node.js runtime。
- 数据库需求超出 D1 限制，例如复杂事务、高写入吞吐、特定扩展或强数据库运维能力。
- 团队已有稳定技术栈，迁移收益不足。
- 认证、安全、合规要求与 Better Auth 或 D1 适配不明确。
- UI 需求不适合 shadcn/ui 的复制源码式组件管理方式。

## 输出落点

- 默认栈是否适用：写入 `technology-research` 输出的“默认基线”。
- 被官方资料确认或推翻的点：写入“当前资料确认”。
- 项目特定偏离：写入“项目约束”和“推荐方案”。
