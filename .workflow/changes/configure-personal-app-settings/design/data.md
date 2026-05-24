# Data Design

## Change

- change-id：configure-personal-app-settings

## 数据范围

本 change 涉及三类数据：

- 持久配置数据：`~/.agents-remote/config.toml`。
- 运行态路径数据：runtime dir 下的当前运行实例、session metadata、socket/lock 等后续模块数据位置。
- 认证状态数据：登录后签发的本地 token 及其有效期语义。

本 change 不引入数据库表、不设计项目文件存储、不保存 Agent 输出完整历史、不保存多用户或设备列表。

## 数据模型

### AppConfig

来自 TOML 配置文件的用户可手改配置。

核心字段：

- `app_password`：单密码登录凭据，必填；可被环境变量 `APP_PASSWORD` 覆盖。
- `projects_root`：Project 根目录，必填；必须是绝对路径；可被环境变量 `PROJECTS_ROOT` 覆盖。
- `api_port`：`api` 本机端口，第一轮必要配置之一；可被环境变量覆盖。
- `web_port`：`web` 本机端口，第一轮必要配置之一；可被环境变量覆盖。
- `web_api_base_url` 或等价字段：`web` 访问 `api` 的地址/路径配置；字段名需与 service boundary 实现保持一致；可被环境变量覆盖。

### ResolvedSettings

`AppConfig + environment overrides` 经过校验后的运行时只读配置。

关键不变量：

- `app_password` 不为空。
- `projects_root` 是绝对路径。
- 端口配置可被解析为有效本机端口。
- `web` 访问 `api` 的配置符合 `/api` 同域约束或部署层配置预期。

### RuntimePaths

运行态目录解析结果。

字段：

- `run_dir`：默认 `/run/agents-remote`，可由 `AGENTS_REMOTE_RUN_DIR` 覆盖。

生命周期：

- `api` 启动时解析并创建。
- 只用于当前运行实例、session metadata、socket/lock 等运行态数据。
- 不保证跨机器或服务重启恢复长期状态。

### AuthToken

本地签发的访问凭证。

字段语义：

- token 值：前端不可手动编辑；HTTP/WebSocket 自动携带。
- expiresAt：用于 PWA 短期记住登录状态。

生命周期：

- 登录成功时签发。
- 过期、签名/服务端密钥变化或服务端重启导致无效时要求重新登录。
- 不关联用户、设备、角色或 session list。

## 表结构 / 字段

不引入数据库表。

建议 TOML 结构保持扁平或少量分组，便于个人部署手工编辑。例如：

```toml
app_password = "change-me"
projects_root = "/home/deploy/projects"
api_port = 3001
web_port = 3000
web_api_base_url = "/api"
```

如果后续实现选择分组结构，也应保持字段语义不变，并在生成模板中提供注释说明。

## 迁移策略

- 第一轮没有旧配置迁移。
- 如果 `~/.agents-remote/config.toml` 不存在，生成模板并停止启动。
- 如果配置文件存在但缺少必填项，启动失败并提示用户补齐。
- 后续新增配置项时，应保持旧配置可读，并通过默认值或明确错误提示处理缺失项。

## 索引与查询

不涉及索引或查询。

配置文件按启动时整体读取；runtime dir 的后续 session metadata 查询归 Session Runtime change 设计。

## 一致性与事务

- 配置模板创建应尽量原子，避免写出半文件后被误认为有效配置。
- 配置文件权限设置应与创建过程一起完成；如果无法完成，需要警告或失败。
- runtime dir 创建失败必须阻止 `api` 启动，避免后续 session 模块进入不可预测状态。
- token 校验不依赖持久数据库；服务端重启导致 token 失效是允许行为。

## 关键决策

- 持久配置只保存应用自身配置和轻量状态，不保存项目内容或 Agent 输出历史。
- `projects_root` 只作为后续安全路径解析的根输入；具体 project path resolver 不在本 change 设计。
- token 不持久化为会话列表，避免提前引入设备/用户模型。
- 运行态目录和持久配置目录强分离。

## 风险与权衡

- 将 `app_password` 放入可手改 TOML 简化部署，但要求文件权限和日志脱敏。
- 不引入数据库降低第一轮复杂度，但 token 无法跨服务端密钥变化或重启长期恢复；这是第一轮可接受行为。
- 生成模板后停止启动增加首次部署步骤，但避免不安全默认密码。

## 开放问题

- `web_api_base_url` 的最终字段名需与 `setup-monorepo-service-boundaries` 的实现保持一致。
- token 有效期默认值和签名密钥来源需在 plan/implement 阶段明确。
- 是否需要在配置文件模板中包含注释取决于 TOML 写出实现能力。

## 后续沉淀候选

- `docs/design/personal-app-config.md`
- `docs/runbooks/personal-deployment-config.md`
