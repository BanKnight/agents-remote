# Monorepo service boundaries

本文件记录系统级长期 HOW，包括 `web`、`api`、`packages/shared` 的工程结构、服务边界与部署路径约定。它描述当前主线状态，不记录单次 change 过程。

## 背景

- 项目需要通过 Web/PWA 控制服务器上的 Claude/Codex Agent，同时保留前端控制面、后端控制 API 和后续 runtime 能力的独立演进空间。
- 第一轮采用个人私有部署，不引入多 server/hub 管理，也不让 `api` 托管 `web` 作为默认架构。

## 当前结构

- 仓库根目录是 Bun workspace 入口。
- `web` 是 React + TypeScript + Vite 前端控制面工作区。
- `api` 是 Bun 运行的后端控制面服务工作区。
- `packages/shared` 是 `web` 与 `api` 的编译期共享类型包。
- 对外统一入口由部署层或开发代理提供：普通页面路由进入 `web`，`/api` HTTP 与 WebSocket 请求进入 `api`。

## 边界与职责

- `web` 负责浏览器/PWA 控制面、前端路由、UI 状态和对 `/api` 的调用。
- `api` 负责后端控制面入口，后续承接 auth、Project API、Session Runtime 和 stream endpoint。
- `packages/shared` 只放跨边界类型、状态枚举和 API DTO，不放业务流程、provider adapter、路径解析或 runtime 控制逻辑。
- 部署层负责同域路径转发和 Cloudflare Tunnel/反向代理配置；应用不创建、认证、运行或管理 Cloudflare Tunnel。

## 交互与依赖

- `web` 和 `api` 可以依赖 `packages/shared`。
- `packages/shared` 不依赖 `web`、`api`、Node/Bun runtime-only APIs 或浏览器 APIs。
- `web` 不直接依赖 `api` 内部模块，只通过 HTTP/WebSocket API 交互。
- 开发环境使用 Vite proxy 模拟生产同域路径，`/api` HTTP 与 WebSocket 请求代理到本机 `api` 服务。

## 架构规则

- 后端服务命名保持为 `api`，不要用 `agent` 混淆 Claude/Codex 等 AI Agent provider。
- `/api` 是同域后端能力的长期入口形态；WebSocket stream 也位于 `/api` 前缀下。
- 第一轮不提供多个 server/hub 连接管理能力，hub 化只作为后续方向保留。
- 根 workspace 是默认包管理和脚本执行入口，Bun 是第一轮默认命令面。
- 基础质量入口包括 lint、format check、typecheck、build 和 test；E2E 链路由后续质量 change 定义。

## 风险与演进

- `packages/shared` 容易膨胀为业务逻辑共享层，后续新增内容必须先判断是否真的是跨边界类型或 DTO。
- `/api/health` 与 `/api/ws/echo` 是当前 smoke endpoint，不代表长期业务 API。
- 只接入 Oxlint/Oxfmt 基础 harness，不代表已经启用 TypeScript 语义 lint；如需 type-aware lint，应单独评估。
- 未来若前端独立部署或 hub 化，需要保持当前 `web/api/shared` 边界不被运行时耦合破坏。

## 来源

- change：setup-monorepo-service-boundaries
- verify 证据：`.workflow/changes/setup-monorepo-service-boundaries/verify.md`
