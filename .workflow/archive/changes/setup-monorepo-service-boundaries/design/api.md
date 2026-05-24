# API Design

## Change

- change-id：setup-monorepo-service-boundaries

## 接口范围

本文件不定义具体业务 API 字段，只定义本项目第一轮 API 访问边界：

- 所有对外 HTTP API 使用同域 `/api` 前缀。
- 所有对外 WebSocket stream 也使用同域 `/api` 前缀。
- `web` 通过相对 `/api` 路径访问 `api`，普通用户不手动输入 API 地址。
- 开发环境通过 Vite dev proxy 模拟生产路径。

具体登录、Project、Session、Files、Git API 由后续 changes 设计。

## 请求 / 响应

当前 change 只约束路径形态，不约束业务 payload。

路径原则：

```text
/api/<resource-or-action>
/api/<resource-or-action>/<stream-endpoint>
```

示例形态：

```text
GET /api/health
GET /api/projects
GET /api/projects/:project/terminals/:session/stream  # WebSocket upgrade
```

上述示例只表达路径边界，具体资源、参数、响应和错误由对应 capability design 定义。

## 协议与兼容性

### 同域访问

- 生产/外部访问应表现为同一 origin。
- `/api` 前缀请求转发到 `api` 本机服务。
- 非 `/api` 页面请求转发到 `web` 本机服务。
- 不以跨域 CORS 作为第一轮默认集成方式。

### WebSocket

- WebSocket stream 路径必须处于 `/api` 下，便于部署层统一转发。
- Vite dev proxy 可为 `/api` 开启 `ws: true`。
- 不默认启用 `rewriteWsOrigin`；Vite docs 明确该选项可能带来 CSRF 风险。

### Web 配置

- `web` 内部 API client 应优先使用相对 `/api` base path。
- 如需配置本机端口或后端 target，归属构建/运行配置或 dev proxy，不暴露给普通用户手动填写。

## 鉴权与权限

- 当前 change 不定义 token 格式、登录接口或权限规则。
- 后续 `configure-personal-app-settings` 必须在 `/api` HTTP 和 WebSocket 上统一接入 token 保护。
- 本 change 的接口边界要求鉴权在 `api` 服务统一处理，而不是由 `web` 或部署层替代。

## 错误语义

当前 change 只要求后续 API design 覆盖以下边界错误：

- `/api` 请求未被部署层转发到 `api`。
- WebSocket upgrade 经过 `/api` 转发失败。
- `web` dev proxy target 未配置或 `api` 未启动。
- 普通页面路由被错误转发到 `api`。

具体错误响应格式和用户提示由后续能力 change 定义。

## 关键决策

- `/api` 是后端 HTTP 与 WebSocket 的统一 public prefix。
- `api` 不托管 `web`，但对外 origin 由部署层统一。
- 开发环境必须模拟生产路径，避免后续代码依赖跨域地址。
- Cloudflare Tunnel 只是部署层选项，不进入应用 API surface。

## 风险与权衡

- 同域 `/api` 简化认证和 CORS，但要求部署层正确区分 `/api` 与前端路由 fallback。
- WebSocket 走 `/api` 让转发一致，但需要部署说明明确 upgrade 支持。
- 不允许用户手动输入 API 地址降低配置复杂度，但要求 web 构建/运行配置在部署时明确。

## 开放问题

- 第一轮是否提供 `/api/health` 作为部署和 E2E smoke 检查入口。
- 生产部署说明是否只给 Cloudflare Tunnel 示例，还是同时给通用 reverse proxy 示例。
- WebSocket stream 的具体路径命名由 Session Runtime change 决定。

## 后续沉淀候选

- `docs/architecture/api-routing-boundary.md`
- `docs/runbooks/deploy-path-routing.md`
