# intents

本文件记录本 change 的来源：可能来自用户原始意图，也可能来自 roadmap 规划出的铺垫、验证、质量或治理工作。

## 来源意图

- 编号：2
  原始意图：用户希望项目采用 monorepo 结构，至少包含 `web`、`api` 和共享类型区域，以便前后端和共享模型分层管理。
- 编号：3
  原始意图：用户希望系统对外呈现统一入口，不要求使用者理解或手动配置 `web` 与 `api` 两个服务。
- 编号：10
  原始意图：用户希望后端服务统一命名为 `api`，不要命名为 `agent`，避免和 Claude/Codex 这类 AI Agent 混淆。
- 编号：34
  原始意图：用户希望 `web` 和 `api` 在服务边界上保持拆分，对外访问通过部署层统一入口；这样未来可以将前端单独分离，演进成类似 hub 的形态。
- 编号：35
  原始意图：用户希望实际部署时 `web` 和 `api` 作为两个本机服务分别启动，对外通过 Cloudflare Tunnel 公开访问，而不是要求 `api` 托管 `web` 或强制同源 `/api`。
- 编号：36
  原始意图：用户希望第一步不让普通用户手动输入 API 地址；api 地址由 web 的构建配置或运行配置固定，Cloudflare Tunnel 负责把两个本机服务公开出来。
- 编号：37
  原始意图：用户希望现在只保留 `web/api` 服务边界和部署可分离性，不做多个 server 连接管理；hub化作为后续方向，不要污染第一轮产品复杂度。
- 编号：38
  原始意图：用户希望固定使用 Tailwind CSS，以支持移动端优先和深色界面的快速布局与状态样式迭代。
- 编号：39
  原始意图：用户希望 Bun 同时作为 monorepo 的包管理器、脚本运行器和 `api` 运行时；`web` 也使用 Bun 管理依赖和启动开发流程，但前端本身仍是 React + TypeScript 应用。
- 编号：40
  原始意图：用户希望第一步 `packages/shared` 主要放 `web` 和 `api` 共用的类型定义，例如 `Project`、`AgentSession`、`TerminalSession`、状态枚举和 API DTO；共享工具函数谨慎添加，先不要把业务逻辑放进去。
- 编号：129
  原始意图：用户希望本项目完全不管理 Cloudflare Tunnel；项目只提供 `web/api` 本机服务和可配置地址，Tunnel 的创建、域名和认证属于 Cloudflare/外部部署工作。
- 编号：130
  原始意图：用户希望对外访问时 `web` 和 `api` 理应位于同一个域名之下，避免第一步引入跨域/CORS 复杂度。
- 编号：131
  原始意图：用户希望对外同域名下 `api` 使用 `/api` 前缀，`web` 页面走普通前端路由；Cloudflare Tunnel 或部署层负责把 `/api` 转到 `api` 服务，其余页面转到 `web` 服务。
- 编号：132
  原始意图：用户希望 WebSocket 也使用 `/api` 前缀，例如 `/api/projects/:project/terminals/:session/stream`，方便同域名部署层统一转发。
- 编号：133
  原始意图：用户希望开发环境也模拟生产同域路径：`web` 通过 `/api` 访问 `api`；可以使用 Vite 作为 `web` 开发服务器，并通过 Vite dev proxy 将 `/api` 和 WebSocket stream 转发到本机 `api` 服务，同时继续使用 Bun 作为包管理器和脚本运行器。
- 编号：134
  原始意图：用户希望项目提供 Cloudflare Tunnel/部署层路径转发的示例说明，说明 `/api` 转到 `api` 本机端口，其余路径转到 `web` 本机端口；但不负责自动管理 Cloudflare。

## 规划来源

- 类型：项目初始化
- 原因：服务边界、包结构、共享类型和部署路径需要在功能开发前稳定下来。
- 支撑目标：为后续配置、认证、Project API、WebSocket 和前端 PWA 提供一致基础。
- 前置关系：无；被多数后续 web/api changes 依赖。

## 分配说明

- 所属 version：v0.1-foundation-and-agent-research
- 分配原因：这是第一轮工程骨架和部署边界的基础 change。
