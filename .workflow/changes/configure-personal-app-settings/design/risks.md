# Risks Design

## Change

- change-id：configure-personal-app-settings

## 主要风险

- 配置文件中包含 `app_password`，如果权限或日志处理不当会泄露访问凭据。
- token 载体选择不当可能引入 XSS、CSRF 或 WebSocket 鉴权绕过风险。
- 将认证通过误认为路径安全，会导致后续 Project/Files/Git/tmux cwd 出现 `PROJECTS_ROOT` 逃逸风险。
- runtime dir 创建失败时如果降级到持久目录，会污染 `~/.agents-remote` 并破坏运行态/持久态边界。
- `setup-monorepo-service-boundaries` 与本 change 对 API 地址字段命名不一致，会导致 web/api 配置体验割裂。

## 跨子域权衡

- 易部署 vs 凭据安全：允许 TOML 写 `app_password` 简化个人部署，但必须配合 `0600` 权限、日志脱敏和模板不直接可运行。
- 登录持久性 vs 实现复杂度：本地 token 记住 PWA 登录状态，但不做 refresh/device/session list。
- fail-fast vs 首次体验：缺配置直接停止启动增加摩擦，但避免不安全默认密码。
- API 简洁 vs 前端实现弹性：设计只承诺自动携带认证状态，不在 design 阶段冻结 cookie/localStorage 等实现细节。

## 依赖与阻塞

- 当前 change 依赖 `setup-monorepo-service-boundaries` 提供 `web/api` 服务边界和 `/api` 同域路径约定；spec/design 可先推进，实现阶段需要确认字段命名与启动脚本。
- 后续 `implement-project-model-and-safe-paths` 必须消费本 change 的 `projects_root` resolved settings，但路径安全算法不由本 change 实现。
- 后续 Session Runtime / Files / Git API 必须接入同一 HTTP/WebSocket auth guard。

## 验证建议

- 启动缺少 `~/.agents-remote/config.toml` 时，应生成模板并停止启动。
- 配置文件存在但缺 `app_password` 或 `projects_root` 时，应启动失败并显示可行动错误。
- `projects_root` 为相对路径时，应启动失败并提示绝对路径要求。
- 环境变量覆盖配置文件同名字段。
- runtime dir 默认路径和 `AGENTS_REMOTE_RUN_DIR` 覆盖路径都能被创建；权限失败时错误清晰。
- 登录正确密码成功，错误密码提示密码错误。
- 未认证 HTTP 请求被拒绝，token 失效后前端回登录页。
- 未认证 WebSocket upgrade 被拒绝，不建立可用 stream。
- 日志和错误响应不包含 password/token。

## 开放问题

- token 载体、签名密钥来源和默认有效期尚未冻结。
- 配置权限不安全时的自动修正策略需在实现阶段根据 Bun/Linux 行为确认。
- `web_api_base_url` 或同类字段名需与 service boundary 实现统一。
- 是否保留公开 `/api/health` 需要在实现阶段结合 E2E 与部署检查需求决定。

## 后续沉淀候选

- Personal deployment security model。
- Config/runtime directory boundary runbook。
- HTTP/WebSocket shared auth guard design。
