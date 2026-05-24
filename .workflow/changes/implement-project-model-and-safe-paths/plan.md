# plan

## Change 目标

- 实现 Project 后端模型和统一安全路径解析，使 `PROJECTS_ROOT` 下一级真实目录成为 Project，并通过受保护 `/api/projects` API 提供列表、创建/采用和详情能力。
- 完成后将为后续 Project 控制台外壳、Files、Git、Terminal 和 Agent Session 提供同一个 project scope 与路径边界输入。

## 局部 big picture

- 本 change 是 `v0.2-project-console-shell` 的基础阻塞项：控制台外壳需要 Project 列表和进入路径，后续 Files/Git/Session changes 需要复用同一套安全路径解析，不能各自拼接路径。
- 上游 `configure-personal-app-settings` 已提供并校验 `ResolvedSettings.projectsRoot` 为绝对路径；本 change 只消费该配置，不改变配置来源、认证方式或运行目录策略。
- 第一轮 Project 不引入数据库、metadata、最近打开时间、删除/重命名或 Git clone；目录状态即 Project 状态，session count 在 Runtime 未接入前返回 0。

## 执行策略

- 先扩展跨边界 DTO 和错误码，但只把类型放入 `packages/shared`，不把路径解析或文件系统逻辑放入 shared。
- 在 `api` 内新增 Project 模块：Project service 负责目录枚举、创建/采用和摘要构造；safe path resolver 负责 `PROJECTS_ROOT`、project 名称和 project-relative path 的真实路径边界校验。
- Project API 接入现有 `createFetchHandler`，沿用 `/api` 前缀和 HTTP token guard；`startApi` 将 `settings.projectsRoot` 注入 Project service，测试中显式传入临时 root。
- Web 本轮只补 API client helper 和类型消费，为后续控制台 UI 使用；不在本 change 实现 Project 列表页布局。
- 验证优先覆盖安全边界：一级目录限制、绝对路径必须位于 root 下、嵌套/文件/root 本身拒绝、`..` 与符号链接真实路径越界拒绝、重复创建目录幂等。

## 任务顺序依据

- DTO 与错误码先行，因为 API route、web client 和测试都依赖共享类型。
- Safe path resolver 是安全边界和 Project service 的前置条件，必须先完成并独立测试；service 和 route 不能绕过 resolver。
- Project service 在 resolver 后实现，因为列表、创建/采用和详情都需要相同的目录身份规则与摘要构造。
- HTTP route 在 service 后接入，避免把文件系统逻辑混入 `api/src/index.ts`。
- Web client helper 可在 API response 类型确定后并行补齐，但最终集成测试仍依赖 route 完成。
- 最后执行全仓验证和格式检查，确保 shared/api/web 的类型、测试和 lint 约束一致。

## 额外上下文

- `docs/specs/personal-app-config/spec.md`：确认 `PROJECTS_ROOT` / `projects_root` 已由配置能力要求为绝对路径，本 change 不重做配置优先级。
- `docs/specs/private-access-auth/spec.md`：确认 Project API 认证通过后仍必须受 `PROJECTS_ROOT` 路径安全约束，认证不替代边界校验。
- `docs/specs/service-access-boundary/spec.md`：确认公开 HTTP API 使用同域 `/api` 前缀，Web 默认通过 `/api` 访问后端。
- `docs/architecture/monorepo-service-boundaries.md`：确认 `api` 承接 Project API 和 runtime-only 路径逻辑，`packages/shared` 只保存 DTO/type。
- `docs/runbooks/personal-deployment-configuration.md`：确认部署侧 `PROJECTS_ROOT` 权限/绝对路径失败应保持可排查，Project API 的文件系统错误提示应与该 runbook 对齐。
- 代码入口：`api/src/settings.ts`、`api/src/index.ts`、`api/src/http-auth.ts`、`packages/shared/src/index.ts`、`web/src/api/client.ts`、现有 `*.test.ts` 测试模式。

## 依赖与阻塞

### 阶段依赖

- 依赖 `configure-personal-app-settings` 已完成并归档；当前可直接进入实现。
- 当前 specs/design 已完成，无需补充 design。

### 任务依赖

- shared DTO/错误码是 API route、web client 和 typed response 测试的前置。
- safe path resolver 是 Project service、后续 Files/Git/Session 复用边界和安全测试的前置。
- Project service 依赖 resolver 与文件系统测试夹具。
- HTTP route 依赖 Project service 和现有 auth guard。
- Web client helper 依赖 shared response type，但不依赖后端内部实现。

### 外部依赖

- 无第三方服务、数据库、迁移或人工确认依赖。
- 文件系统测试需要临时目录、文件和 symlink；若测试环境不支持 symlink，应在实现阶段记录并采用 Bun/Node 可用能力验证真实路径边界。

## 并行机会

- shared DTO/错误码与 resolver 初稿不能并行交付，因为后续任务依赖 shared 类型先稳定。
- resolver 测试和 service 测试在 resolver API 稳定后可以由不同执行者并行编写，但会修改相邻 `api/src/project*` 文件，单人实现时建议顺序完成以减少返工。
- web client helper 可在 API response 类型确定后与后端 route 测试并行，因为它只修改 `web/src/api/client.ts` 和对应测试，不接触 `api` 模块。

## 风险与验证重点

- 最大安全风险是只做字符串前缀校验而未处理符号链接或真实路径逃逸；resolver 必须用真实路径语义验证 root、project 和相对路径结果。
- Project 名称必须是一级目录名；嵌套路径、绝对路径、空值、`.`/`..` 和路径分隔符不能作为 project identity。
- `POST /api/projects` 的 `path` 同时支持文件夹名和绝对路径，错误码需区分无效目标、越界、文件占用和不存在后创建。
- 列表枚举遇到普通文件、非目录或瞬时删除不能把它们当成 Project；排序按 `name` 稳定。
- 失败响应不应泄露无关外部路径或堆栈；成功响应可返回已认证用户可见的 Project 真实路径。
- `createFetchHandler` 需要可测试地注入 Project service/root，避免测试依赖真实用户配置。

## 不做事项

- 不实现 Project 列表页、Project 创建表单或控制台 shell UI。
- 不实现 Files/Git/Terminal/Agent 子资源 API，只提供后续可复用的安全解析模块。
- 不实现 Git branch 读取、最近打开时间、收藏、排序偏好、metadata 持久化或数据库建模。
- 不实现 Project 删除、重命名、移动、下载、clone、模板初始化或脚手架。
- 不改变登录/token 机制、配置文件格式、Cloudflare Tunnel/反向代理职责或多 server/hub 设计。
