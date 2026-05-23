# Next.js 默认技术基线

## 默认推荐

- 使用 Next.js 时，优先让它承担全栈 React framework 职责：路由、渲染模式、server/client 边界、构建与部署集成。
- 新项目默认评估 App Router、Server Components、route handlers、metadata、内置优化能力。
- 明确每个页面/数据路径需要 SSR、SSG、ISR、SPA 还是 server action；不要默认全 SSR 或全 client。
- 数据访问优先靠 server 边界隔离 secret 和数据库访问，client 只拿必要数据。
- 部署平台选择要和 Next.js 特性匹配，尤其 runtime、缓存、middleware、image、edge 支持。

## 职责边界

- Next.js：应用框架、路由、渲染、server/client 边界。
- React：组件与交互。
- Data layer：数据库/API/缓存，不应散落在 client component。
- Deployment platform：决定 runtime、缓存、preview、observability、rollback 约束。

## 常见反模式

- 不理解 server/client component 边界就全加 `use client`。
- 在 client 暴露 secret 或直接访问敏感后端资源。
- 把 framework cache、fetch cache、CDN cache、Query cache 混为一谈。
- 不验证部署平台对目标 Next.js 特性的支持。
- 为简单 SPA 引入过重的全栈复杂度。

## 需要官方确认的点

- 当前 Next.js 版本的 App Router、Turbopack、production build、cache、server actions 状态。
- 所选部署平台对 Next.js 当前版本的支持矩阵。
- Middleware、Edge runtime、Node runtime 限制。
- 升级或迁移时的 breaking changes。

## 何时不适用

- 静态内容为主且需要更轻构建链路时，Astro/Vite SSG 可能更合适。
- 纯内部工具且 SSR/SEO/全栈集成价值不高时，Vite SPA 可能更简单。
- 部署目标无法良好支持 Next.js runtime 特性。

## 输出落点

- framework 与部署耦合决策进入 design-change 的 architecture/frontend 子域。
- runtime、cache、server/client 边界进入 plan-change 的实现上下文。
