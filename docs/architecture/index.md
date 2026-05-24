# architecture 索引

本层用于沉淀系统级长期 HOW，包括架构边界、模块关系、集成模式与 ADR。

## 子目录

- [adr](./adr/) — 存放架构决策记录，保留关键决策的背景、选择、备选方案与影响。

## 文档

- [agent-runtime.md](./agent-runtime.md) — 定义 Agent Runtime、Provider Adapter、TerminalSession 与 capability extension 的长期架构边界。
- [monorepo-service-boundaries.md](./monorepo-service-boundaries.md) — 定义 `web`、`api`、`packages/shared` 的工程结构、服务边界与同域 `/api` 部署路径约定。
