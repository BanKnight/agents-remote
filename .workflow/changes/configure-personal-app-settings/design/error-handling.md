# Error Handling Design

## Change

- change-id：configure-personal-app-settings

## 异常范围

本 change 需要覆盖启动时配置错误、运行态目录错误、登录错误、HTTP 认证错误、WebSocket 认证错误和权限/路径边界误用。

不覆盖 provider CLI 启动失败、Project 路径越界的具体算法、Terminal Session stream 断开恢复或文件/Git 操作失败；这些由后续 changes 设计。

## 失败场景

### 启动阶段

- 默认配置文件不存在。
- 配置文件存在但缺少必填项。
- TOML 格式错误或字段类型错误。
- `projects_root` 是相对路径。
- 配置文件权限不安全。
- runtime dir 创建失败或权限不足。

### 登录阶段

- password 缺失。
- password 错误。
- 配置中的 `app_password` 缺失导致服务未启动。

### HTTP 访问阶段

- 请求缺少 token。
- token 过期。
- token 因服务端重启或签名密钥变化无效。
- token 格式无效。

### WebSocket 访问阶段

- upgrade 请求缺少有效认证状态。
- WebSocket 握手时 token 过期或无效。

## 错误码 / 错误语义

| code | 阶段 | 语义 | 用户/调用方动作 |
|---|---|---|---|
| `CONFIG_REQUIRED` | 启动 | 缺少默认配置文件或必要配置 | 填写 `~/.agents-remote/config.toml` 后重启 |
| `CONFIG_INVALID` | 启动 | TOML 格式、字段类型或约束无效 | 修正配置后重启 |
| `CONFIG_PERMISSION_UNSAFE` | 启动 | 配置文件权限过宽 | 允许自动修正或提示用户修正 |
| `RUNTIME_DIR_UNAVAILABLE` | 启动 | runtime dir 创建/访问失败 | 修改权限或设置 `AGENTS_REMOTE_RUN_DIR` 后重启 |
| `INVALID_PASSWORD` | 登录 | 单密码错误 | 保留登录页，提示密码错误 |
| `UNAUTHENTICATED` | HTTP/WS | token 缺失、过期或无效 | 回到登录页重新登录 |

启动阶段错误主要面向部署者，可以显示配置路径、字段名和 runtime dir 路径，但不能输出 password 或 token。

## 重试 / 降级 / 恢复

- 配置缺失或无效：不重试，不降级；用户修正配置后重启。
- runtime dir 不可用：不降级到持久配置目录；用户修正权限或设置覆盖路径后重启。
- 配置文件权限不安全：如果实现能安全修正，可自动修正并继续；否则警告或启动失败由实现阶段权衡。
- 登录密码错误：用户可修改输入后重试。
- token 无效/过期：不自动刷新；用户重新登录。
- WebSocket 认证失败：拒绝连接，不进入半连接状态。

## 用户可见反馈

- 首次启动缺配置：终端/日志显示默认配置路径和示例配置说明，明确“填写后重启”。
- 登录失败：登录页显示“密码错误”即可，不展示内部校验细节。
- token 过期或无效：当前页面回到登录页，用户重新登录；第一轮不要求回到原位置。
- WebSocket 认证失败：页面显示需要重新登录或直接跳转登录页，不静默失败。
- runtime dir 权限失败：终端/日志显示目标目录和权限问题，建议设置 `AGENTS_REMOTE_RUN_DIR`。

## 关键决策

- 启动配置错误采用 fail-fast，避免服务以不安全或不完整配置运行。
- 认证错误对用户保持简单，不区分 token 过期、签名变化或服务端重启细节。
- runtime dir 不可用不能降级到 `~/.agents-remote`，以维护运行态/持久态边界。
- 错误日志不得包含 `app_password`、token 或完整请求认证头。

## 风险与权衡

- fail-fast 增加首次部署摩擦，但减少不安全默认配置和路径误解析风险。
- 不提供 token refresh 简化实现，但用户在服务端重启后需要重新登录。
- 自动修正配置权限提高易用性，但在某些文件系统上可能失败；需要清晰提示。
- 对认证失败隐藏细节有利安全，但调试时需要服务端日志保留非敏感原因。

## 开放问题

- 配置文件权限不安全时是警告后继续、自动修正后继续，还是无法修正即失败，需在 plan/implement 阶段按可移植性决定。
- token 失效是否统一返回 401，以及 WebSocket upgrade 失败是否使用 401/403/close reason，需要实现阶段固定。
- 是否引入 requestId/traceId 作为第一轮错误排查字段可在实现阶段权衡。

## 后续沉淀候选

- `docs/runbooks/personal-deployment-config.md`
- `docs/design/api-error-semantics.md`
