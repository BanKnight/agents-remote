# specs 索引

本层用于沉淀长期 WHAT：能力规格、行为契约与可验证需求。

## 子目录

- [agent-access](./agent-access/spec.md) — 定义 Agent 接入路线调研、证据追溯、协议边界和第一轮真实可用链路的长期行为契约。
- [personal-app-config](./personal-app-config/spec.md) — 定义个人私有部署配置文件、环境变量覆盖、持久化配置目录和 runtime dir 边界。
- [private-access-auth](./private-access-auth/spec.md) — 定义单密码登录、本地 token、HTTP/WebSocket 认证和个人私有部署安全范围。
- [service-access-boundary](./service-access-boundary/spec.md) — 定义 `web`/`api` 服务拆分、统一同域入口、`/api` HTTP/WebSocket 路径和部署层职责边界。
- [workspace-foundation](./workspace-foundation/spec.md) — 定义第一轮 monorepo 工作区、Bun 命令面、前端基础、共享类型边界和基础质量入口。

## 文档

- [workflow-skills-overview.md](./workflow-skills-overview.md) — 汇总当前规划中的阶段型工作流技能与不分阶段的通用技能。
