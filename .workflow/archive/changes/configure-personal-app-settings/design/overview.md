# Design Overview

## Change

- change-id：configure-personal-app-settings
- 所属 version：v0.1-foundation-and-agent-research

## 输入依据

- intents：个人私有部署配置、单密码认证、token 保护 HTTP/WebSocket、runtime dir 与 persistent config 边界。
- specs：`personal-app-config`、`private-access-auth`。
- 相关长期 docs：
  - `docs/project.md`
  - `docs/specs/service-access-boundary/spec.md`
  - `docs/specs/workspace-foundation/spec.md`

## 设计范围

### 本次覆盖

- `api` 启动配置加载链路：默认 TOML 配置、环境变量覆盖、缺失配置模板生成与启动失败。
- 单密码登录与本地 token 保护 HTTP/WebSocket 的控制面边界。
- `~/.agents-remote` 持久配置目录与 runtime dir 的职责分离。
- 配置、认证、权限和路径安全之间的边界，避免把登录状态当作路径安全替代品。
- 启动失败、认证失败、token 失效、WebSocket 鉴权失败、目录创建失败等错误语义。

### 本次不覆盖

- 不实现多用户、角色权限、OAuth、2FA、设备管理、刷新 token 或会话列表。
- 不定义 Project 路径安全解析的内部算法；只声明本 change 依赖后续统一 `PROJECTS_ROOT` 安全解析能力。
- 不设计网页初始化配置或 CLI init；第一轮只做启动时配置检查与模板生成。
- 不设计复杂 secret 存储、系统 keychain 或加密配置文件。
- 不改变 `web/api` 同域 `/api` 部署边界。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | 产品行为已由 specs 明确，单密码个人部署边界不需要额外用户旅程设计。 |
| ui-ux | 否 | 登录页具体视觉和交互归后续 PWA shell/UI change；本 change 只要求错误与跳转语义。 |
| frontend | 否 | 前端 token 携带和登录态存储需要后续实现设计，但当前 specs 足以由 API/error design 指导，不单独建前端子域。 |
| architecture | 是 | 配置加载、认证守卫、运行态目录和后续模块依赖跨 `api` 多模块，需要明确边界。 |
| api | 是 | 需要定义登录接口、认证状态、HTTP/WebSocket 鉴权和错误语义。 |
| data | 是 | 需要定义 TOML 配置、runtime dir、persistent app dir 的数据归属和生命周期。 |
| business-rules | 否 | 业务规则较少，单密码/单用户/环境变量覆盖规则写入 architecture、api、data 即可。 |
| error-handling | 是 | 启动配置、权限、认证过期和 WebSocket 失败是本 change 的关键可验证行为。 |
| risks | 是 | 需要集中收口安全、部署、token、配置权限和与后续路径安全的依赖风险。 |

## 总体设计结论

- `api` 应提供一个深模块式 app settings 边界，统一负责读取 TOML、应用环境变量覆盖、校验必要配置和创建 runtime dir。
- 个人部署默认配置文件是 `~/.agents-remote/config.toml`；缺失时生成模板并停止启动，避免默认密码直接运行。
- 认证边界应位于 `api` HTTP/WebSocket 入口处，后续业务 handler 只消费已认证结果，不自行解析 token。
- token 是第一轮本地签发访问凭证，不承载多用户、设备或权限模型；服务端重启导致 token 失效是可接受行为。
- `~/.agents-remote` 与 runtime dir 必须严格分离：前者持久配置/轻量状态，后者当前运行实例、session metadata、socket/lock。

## 关键决策

- 采用“配置文件默认 + 环境变量覆盖”的配置优先级。
- 配置文件权限尽量自动限制为当前用户可读写；无法确认或修正时必须显式警告。
- 登录 API 只接受 password，不引入 username、OAuth 或注册流程。
- HTTP 与 WebSocket 使用同一认证语义，避免用户理解两套 token 机制。
- 认证只证明访问者通过单密码；路径不逃逸仍由 `PROJECTS_ROOT` 安全解析负责。

## 开放问题

- token 放在 cookie 还是前端存储由后续实现权衡；本 design 只要求用户无需手动处理 token，且 HTTP/WebSocket 自动携带认证状态。
- token 有效期具体默认值尚未冻结，需要在实现或 plan 阶段选择一个适合个人 PWA 的值。
- 配置文件中 web 访问 api 地址的字段命名需要与 service boundary 实现保持一致。

## 后续沉淀候选

- `docs/specs/private-access-auth/spec.md`
- `docs/specs/personal-app-config/spec.md`
- `docs/architecture/config-and-auth-boundary.md`
- `docs/runbooks/personal-deployment-config.md`
