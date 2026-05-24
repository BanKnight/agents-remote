# plan

## Change 目标

- 建立个人私有部署的配置加载、单密码认证、HTTP/WebSocket token 保护和运行态目录基础。
- 完成后，后续 Project、Session Runtime、Files、Git 等 API 可以统一消费已校验 settings 和认证 guard，而不是各自读取配置或实现认证。

## 局部 big picture

- 本 change 位于 v0.1 基础阶段，依赖 `setup-monorepo-service-boundaries` 已完成的 `web/api` 服务边界、`/api` 同域入口和 Bun workspace。
- 它是 `implement-project-model-and-safe-paths`、Session Runtime、Files/Git API 的安全前置：先确定 `PROJECTS_ROOT`、runtime dir 和 token 保护边界，后续能力才能安全落地。
- 当前 `api/src/index.ts` 仍是单文件 smoke server；本 change 应拆出配置与认证深模块，避免后续 handler 直接读 env、TOML 或 token。

## 执行策略

- 先在 `api` 内建立 settings/config 模块，统一读取默认 TOML、环境变量覆盖、必要字段校验和模板生成；这是后续任务的输入基础。
- 再建立 runtime dir 管理和启动 fail-fast，确保运行态目录在服务接受请求前可用。
- 然后实现 auth/token 模块和 HTTP/WebSocket guard，使入口层统一认证。
- 最后把现有 `api/src/index.ts` 组合到这些模块上，并补齐 shared DTO、单元测试和 smoke 验证。
- 不引入多用户、refresh token、设备表或数据库；所有实现应保持第一轮个人部署范围。

## 任务顺序依据

- 配置加载是阻塞项：auth 需要 `app_password`，Project 后续需要 `projects_root`，runtime 需要 `run_dir`。
- runtime dir 检查必须在服务开始处理会话相关请求前完成，但可以在配置解析后独立实现。
- auth service 依赖已校验 password 配置；HTTP/WebSocket guard 依赖 auth service。
- API 入口集成必须等 config、runtime dir、auth guard 形成稳定接口后再做。
- 测试和质量命令最后执行，因为需要覆盖所有新增模块和入口集成。

## 额外上下文

- `docs/specs/service-access-boundary/spec.md`：确保新增 HTTP/WebSocket 认证入口仍位于 `/api` 前缀，并保持同域访问语义。
- `docs/architecture/monorepo-service-boundaries.md`：确认 `api` 是 Bun 后端控制面服务，`packages/shared` 只放 DTO/type，不放业务逻辑。
- `docs/specs/workspace-foundation/spec.md`：确认 Bun workspace、测试和质量命令入口。
- `docs/design/frontend-stack.md`：实现前端登录态接入时参考 `/api` client / route data layer 边界；本 change 主要后端，前端细节最小化。
- `api/src/index.ts`：当前 Bun server 入口，需要接入 settings、auth guard 和 route handling。
- `api/src/index.test.ts`：现有 smoke 测试入口，可扩展或拆分测试。
- `packages/shared/src/index.ts`：如需要新增登录响应、错误响应类型或 config-safe DTO，只添加跨边界类型，不放认证逻辑。

## 依赖与阻塞

### 阶段依赖

- `setup-monorepo-service-boundaries` 已完成，service boundary 和 `/api` 约束可作为输入。
- `specify-change` 和 `design-change` 已完成，可进入实现计划。

### 任务依赖

- 1.1 配置模型与 loader 是 1.2、2.1、3.1、4.1 的前置。
- 1.2 runtime dir manager 依赖 1.1 的 resolved settings。
- 2.1 auth service 依赖 1.1 的 `app_password`。
- 2.2 HTTP guard 与 2.3 WebSocket guard 依赖 2.1。
- 3.1 API 入口集成依赖 1.1、1.2、2.2、2.3。
- 4.1 shared DTO 可与 1.1/2.1 并行设计，但最终字段需与 3.1 对齐。
- 5.1 测试与质量验证依赖所有实现任务。

### 外部依赖

- 不依赖第三方服务或在线资料。
- 需要本地文件系统权限测试：`~/.agents-remote/config.toml`、默认 `/run/agents-remote` 以及 `AGENTS_REMOTE_RUN_DIR` 覆盖路径。
- 不要求真实 Cloudflare Tunnel、真实 Project API 或真实 Session Runtime 存在。

## 并行机会

- 1.1 与 4.1 可以部分并行：shared DTO 可先定义登录和错误响应类型，但最终要与 loader/auth API 集成对齐。
- 1.2 可以在 1.1 的 ResolvedSettings 接口确定后与 2.1 并行。
- 2.2 与 2.3 可以在 auth service 稳定后并行：一个处理 HTTP request，一个处理 WebSocket upgrade。
- 3.1 和 5.1 不应并行；测试应在入口集成后覆盖真实行为。

## 风险与验证重点

- 风险：日志或错误响应泄露 `app_password`、token 或完整认证头。
- 风险：启动缺配置时服务仍可用，导致不安全默认状态。
- 风险：HTTP 和 WebSocket 使用不同认证逻辑，后续 stream 漏保护。
- 风险：runtime dir 失败时错误降级到 `~/.agents-remote`，污染持久目录。
- 验证重点：缺 config 生成模板并停止启动；env 覆盖 TOML；相对 `projects_root` fail-fast；runtime dir 创建失败 fail-fast；登录成功/失败；未认证 HTTP/WS 被拒绝；token 失效回登录语义；质量命令通过。

## 不做事项

- 不实现多用户、角色权限、OAuth、2FA、refresh token、设备管理或 session list。
- 不实现 Project 安全路径解析算法，只提供 absolute `projects_root` 配置输入。
- 不实现网页初始化配置或 CLI init。
- 不实现 Agent/Terminal Session Runtime、Files/Git API 或 E2E 链路。
- 不引入数据库或持久 token/session 表。
