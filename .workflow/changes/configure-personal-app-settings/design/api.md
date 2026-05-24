# API Design

## Change

- change-id：configure-personal-app-settings

## 接口范围

本 change 的 API 设计只覆盖个人私有部署认证和受保护入口约束：

- 登录：提交单密码，获得认证状态。
- HTTP API guard：保护除明确公共端点外的 `/api/*`。
- WebSocket guard：保护需要登录的 `/api` WebSocket stream。
- 配置错误不通过运行时 API 暴露；配置缺失或无效发生在 `api` 启动阶段。

不覆盖注册、用户资料、角色权限、设备管理、refresh token、session list 或网页初始化配置 API。

## 请求 / 响应

建议保留一个任务型登录接口：

```text
POST /api/auth/login
```

请求体：

```json
{
  "password": "user-entered-password"
}
```

成功响应可以只表达已登录状态和必要的过期信息：

```json
{
  "ok": true,
  "expiresAt": "2026-05-31T12:00:00.000Z"
}
```

失败响应：

```json
{
  "error": {
    "code": "INVALID_PASSWORD",
    "message": "密码错误"
  }
}
```

可选的登录状态检查接口可由实现阶段决定是否需要：

```text
GET /api/auth/me
```

成功只表达当前 token 有效，不引入用户模型：

```json
{
  "authenticated": true
}
```

## 协议与兼容性

- 对外路径继续遵守长期 `service-access-boundary`：HTTP 与 WebSocket 都在 `/api` 前缀下。
- 登录接口不要求普通用户输入 API 地址；前端仍通过同域 `/api` 访问。
- WebSocket 认证应复用登录后的同一认证状态，不要求用户手动拼接 token。
- `/api/health` 是否公开由实现阶段按部署需求决定；若公开，不应泄露配置、路径或 secret。
- 认证错误响应应稳定，后续 Project/Session/Files/Git API 可复用同一错误语义。

## 鉴权与权限

- 第一轮只有“未认证 / 已认证”两种访问状态。
- 已认证不代表多用户身份，不包含 username、role、team 或 device。
- token 校验失败时，HTTP 返回未认证错误；前端回到登录页。
- WebSocket upgrade 缺少有效认证时拒绝连接；前端显示需要重新登录或跳回登录页。
- 危险操作后续仍需要二次确认，不能只依赖已认证状态。
- 路径安全由后续 `PROJECTS_ROOT` 安全解析提供，认证 guard 不承担路径归一化或越界判断。

## 错误语义

建议错误语义：

| code | HTTP / 场景 | 用户可见行为 | 可重试 |
|---|---|---|---|
| `INVALID_PASSWORD` | 登录密码错误 | 登录页提示密码错误 | 修改输入后可重试 |
| `UNAUTHENTICATED` | 缺少 token、token 无效或过期 | 回到登录页 | 重新登录后可重试 |
| `CONFIG_REQUIRED` | 启动阶段缺少必要配置 | API 不启动；终端显示配置路径和示例 | 填写配置后重启 |
| `CONFIG_INVALID` | 启动阶段配置格式或约束无效 | API 不启动；终端显示具体配置项 | 修正配置后重启 |
| `RUNTIME_DIR_UNAVAILABLE` | 启动阶段 runtime dir 创建/权限失败 | API 不启动；终端显示目录与权限问题 | 修正权限或覆盖路径后重启 |

HTTP 运行时不应暴露 password、token、完整内部堆栈或主机敏感路径；启动阶段错误可以显示配置路径和 runtime dir 路径，因为目标使用者是部署者。

## 关键决策

- 登录接口围绕“提交单密码”任务设计，不建立 user resource。
- token 自动携带机制是前端实现细节；API contract 只要求 HTTP/WebSocket 都能识别同一登录状态。
- 认证 failure 的用户体验优先简单：过期或无效时回登录页，不要求回到原位置。
- HTTP 与 WebSocket 的认证失败语义一致，避免 session stream 出现静默失败。

## 风险与权衡

- 如果 token 放在前端存储，WebSocket 携带更简单但 XSS 风险更高；如果放 cookie，HTTP 自动携带更自然但 WebSocket/CORS/CSRF 边界要谨慎。实现阶段必须在当前同域 `/api` 约束下选择。
- 公开 `/api/health` 有利于开发与部署检查，但不能泄露配置完成度或认证状态。
- 简化为单密码会降低团队协作能力，但符合第一轮个人私有部署范围。

## 开放问题

- token 载体和默认有效期尚未冻结。
- 是否需要 `POST /api/auth/logout` 清除前端认证状态可在实现阶段决定；不是 specs 的硬性要求。
- `/api/health` 是否保持公开需要在部署/测试阶段确认。

## 后续沉淀候选

- `docs/specs/private-access-auth/spec.md`
- `docs/design/api-auth-boundary.md`
