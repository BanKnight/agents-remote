# service-access-boundary spec

本文件记录单个 change 对 `service-access-boundary` 的行为契约增量。

## Change 来源

- change-id：setup-monorepo-service-boundaries
- 来源意图：
  - 编号：3：系统对外呈现统一入口，不要求使用者理解或手动配置 `web` 与 `api` 两个服务。
  - 编号：34：`web` 和 `api` 在服务边界上保持拆分，对外通过部署层统一入口，未来可演进为类似 hub 的形态。
  - 编号：35：实际部署时 `web` 和 `api` 作为两个本机服务分别启动，对外通过 Cloudflare Tunnel 公开访问，不要求 `api` 托管 `web` 或强制同源 `/api`。
  - 编号：36：第一步不让普通用户手动输入 API 地址；api 地址由 web 构建配置或运行配置固定，Cloudflare Tunnel 负责公开服务。
  - 编号：37：现在只保留 `web/api` 服务边界和部署可分离性，不做多个 server 连接管理；hub 化作为后续方向。
  - 编号：129：项目不管理 Cloudflare Tunnel，只提供 `web/api` 本机服务和可配置地址。
  - 编号：130：对外访问时 `web` 和 `api` 理应位于同一个域名之下，避免第一步引入跨域/CORS 复杂度。
  - 编号：131：对外同域名下 `api` 使用 `/api` 前缀，`web` 页面走普通前端路由；部署层负责转发。
  - 编号：132：WebSocket 也使用 `/api` 前缀，方便同域名部署层统一转发。
  - 编号：133：开发环境模拟生产同域路径，`web` 通过 `/api` 访问 `api`，并用 Vite dev proxy 转发 HTTP 和 WebSocket。
  - 编号：134：项目提供 Cloudflare Tunnel/部署层路径转发示例说明，但不负责自动管理 Cloudflare。
- 规划来源：对外统一入口、本机服务拆分和 `/api` 路径约束需要先稳定，后续认证、Project API、WebSocket 和 PWA 才能统一接入。

## ADDED Requirements

### Requirement: Web and API remain separate local services

系统 SHALL 保持 `web` 与 `api` 作为边界清晰的本机服务，而不是要求 `api` 托管 `web`。

#### Scenario: Local services are started

- **WHEN** 开发者启动第一轮本机服务
- **THEN** `web` 和 `api` 可以作为两个服务分别运行，并保留各自的服务边界

#### Scenario: Future separation is considered

- **WHEN** 后续需要让前端单独分离或演进类似 hub 的形态
- **THEN** 第一轮服务边界不会要求前端必须由 `api` 内嵌托管

### Requirement: External access presents a unified origin

系统 SHALL 面向普通使用者呈现统一访问入口，避免要求使用者手动理解或配置 `web` 与 `api` 两个服务地址。

#### Scenario: User opens the app externally

- **WHEN** 使用者通过浏览器或 PWA 打开系统
- **THEN** 使用者只需要访问统一入口，不需要手动输入 API 地址

#### Scenario: Web resolves API access

- **WHEN** 前端需要访问后端能力
- **THEN** API 地址来自构建配置、运行配置或同域路径约定，而不是由普通使用者手动填写

### Requirement: Public HTTP API uses the `/api` prefix

系统 SHALL 在同域部署路径下使用 `/api` 前缀承载后端 HTTP API。

#### Scenario: Deployment layer receives HTTP requests

- **WHEN** 部署层收到 `/api` 前缀的 HTTP 请求
- **THEN** 该请求被视为 `api` 服务请求，其余普通页面路由被视为 `web` 服务请求

#### Scenario: API route contract is reviewed

- **WHEN** 后续 change 设计 HTTP API 路由
- **THEN** 对外路由以 `/api` 前缀为入口，避免第一轮引入跨域访问作为默认路径

### Requirement: Public WebSocket routes use the `/api` prefix

系统 SHALL 让 WebSocket stream 路径同样位于 `/api` 前缀下，以便同域部署层统一转发。

#### Scenario: Session stream is connected

- **WHEN** 前端连接 Agent 或 Terminal 的 WebSocket stream
- **THEN** 连接路径位于 `/api` 前缀下，而不是使用独立跨域 WebSocket 地址作为第一轮默认路径

#### Scenario: Deployment layer handles stream forwarding

- **WHEN** 部署层收到 `/api` 前缀的 WebSocket upgrade 请求
- **THEN** 该请求可以被转发到 `api` 本机服务

### Requirement: Development environment mirrors production path shape

系统 SHALL 让开发环境中的 `web` 也通过 `/api` 路径访问 `api`，并支持 HTTP 与 WebSocket 转发。

#### Scenario: Web dev server calls API

- **WHEN** 开发者在本地运行 `web` 开发服务
- **THEN** 前端通过 `/api` 访问后端，而不是依赖手动输入的 API 地址

#### Scenario: Web dev server connects stream

- **WHEN** 开发环境中需要连接 WebSocket stream
- **THEN** `/api` 前缀下的 WebSocket 连接可以被开发服务器代理到本机 `api` 服务

### Requirement: Cloudflare Tunnel stays outside application management

系统 SHALL 只提供 `web/api` 本机服务、可配置地址和路径转发说明，不负责创建、认证、运行或管理 Cloudflare Tunnel。

#### Scenario: Deployment guidance is reviewed

- **WHEN** 部署者查看第一轮部署说明
- **THEN** 可以看到 `/api` 转到 `api` 本机端口、其余路径转到 `web` 本机端口的示例说明

#### Scenario: Application runtime is started

- **WHEN** 应用自身启动
- **THEN** 应用不会自动创建 Cloudflare Tunnel、管理 Cloudflare 域名或处理 Cloudflare 认证

### Requirement: Multi-server hub management is deferred

系统 SHALL 在第一轮只保留 `web/api` 服务边界与部署可分离性，不提供多个 server 连接管理能力。

#### Scenario: User configures first-round deployment

- **WHEN** 使用者配置第一轮系统
- **THEN** 配置目标是当前本机 `web/api` 服务，而不是多个 server/hub 连接列表

#### Scenario: Future hub direction is discussed

- **WHEN** 后续讨论 hub 化或多 server 管理
- **THEN** 该能力被视为后续方向，不污染第一轮服务边界行为

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
