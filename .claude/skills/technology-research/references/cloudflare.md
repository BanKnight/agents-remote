# Cloudflare 默认技术基线

## 默认推荐

- Cloudflare Workers 适合 edge/serverless API、轻量后端、边缘中间层和与 Cloudflare 数据产品紧密集成的应用。
- Cloudflare Pages 适合静态站、前端应用和部分全栈框架部署，但需确认 framework 支持状态。
- 数据层按访问模式选择：D1（关系型）、KV（最终一致 key-value）、R2（对象存储）、Durable Objects（强一致协调/状态）、Queues（异步处理）。
- 默认把 runtime 限制当作架构约束，而不是部署细节。

## 职责边界

- Workers：请求处理、edge runtime、bindings。
- Pages：前端/静态/框架部署入口。
- D1/KV/R2/DO/Queues：不同一致性和存储模型。
- Wrangler：本地开发、配置、deploy、secret/binding 管理。

## 常见反模式

- 把需要完整 Node.js runtime 的服务直接搬到 Workers。
- 在 KV 上实现强一致业务流程。
- 不区分 preview/staging/production bindings。
- 忽略 compatibility date、runtime API、CPU/memory/request limits。
- 本地 Miniflare/wrangler dev 未覆盖关键生产差异。

## 需要官方确认的点

- Workers/Pages 当前 Node compatibility、framework support、limits。
- D1/KV/R2/Durable Objects/Queues 的一致性、限制、定价和区域行为。
- Wrangler 配置、compatibility_date、observability、rollback、secret 管理。
- 目标框架在 Cloudflare 上的当前部署方式。

## 何时不适用

- 服务依赖 native addon、长连接、复杂 Node API 或传统进程模型。
- 强事务关系数据库是核心且 D1 限制不满足需求。
- 团队需要成熟容器/Kubernetes 运维能力而非 edge 约束。

## 输出落点

- 部署平台与数据产品选择进入 design-change 的 architecture 子域。
- bindings、wrangler、环境隔离、observability 进入 plan-change。
