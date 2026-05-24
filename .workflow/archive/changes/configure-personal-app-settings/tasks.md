# tasks

## 执行顺序

1. 先实现配置与 runtime 目录基础，因为认证、Project 和后续 runtime 都依赖已校验 settings。
2. 再实现认证核心与 HTTP/WebSocket guard，确保所有后续 API 入口能复用同一认证边界。
3. 再集成 `api` 入口和 shared DTO，使现有 smoke server 进入新配置/认证路径。
4. 最后补齐测试、质量验证和文档化的运行说明输入。

## 任务清单

### 1. 配置与运行态基础

- [x] 1.1 实现 app settings loader
  - 验收标准：`api` 可以从 `~/.agents-remote/config.toml` 读取第一轮配置；环境变量覆盖同名配置；缺失配置文件时生成安全模板并停止启动；缺少必要配置或 `projects_root` 为相对路径时启动失败且提示清晰。
  - 依据：`plan.md` 执行策略；`specs/personal-app-config/spec.md`；`design/data.md`；`design/error-handling.md`。
  - 必读上下文：`api/src/index.ts`、`docs/architecture/monorepo-service-boundaries.md`。
  - 修改范围：`api/src/` 下新增 settings/config 相关模块与测试；必要时调整 `api/src/index.ts` 启动组合。
  - 依赖：无。
  - 并行：可与 4.1 部分并行；阻塞 1.2、2.1、3.1。
  - 结果：新增 `api/src/settings.ts` 与 `api/src/settings.test.ts`，覆盖 TOML 读取、环境变量覆盖、缺配置模板生成、必填缺失和 `projects_root` 绝对路径校验；`bun run --filter @agents-remote/api test` 通过。

- [x] 1.2 实现 runtime dir manager
  - 验收标准：默认使用 `/run/agents-remote`；`AGENTS_REMOTE_RUN_DIR` 可覆盖；启动时自动创建目录；创建失败或权限不足时 fail-fast 并显示目录路径和权限错误；不会把运行态数据放入 `~/.agents-remote`。
  - 依据：`specs/personal-app-config/spec.md`；`design/architecture.md`；`design/data.md`；`design/error-handling.md`。
  - 必读上下文：1.1 产出的 ResolvedSettings 接口。
  - 修改范围：`api/src/` 下 runtime dir 模块与测试。
  - 依赖：1.1 的 settings 结构。
  - 并行：可与 2.1 并行，前提是 settings 接口已确定。
  - 结果：新增 `api/src/runtime-dir.ts` 与 `api/src/runtime-dir.test.ts`，覆盖默认运行目录、`AGENTS_REMOTE_RUN_DIR` 覆盖、目录创建和不可用路径 fail-fast；`bun run --filter @agents-remote/api test` 通过。

### 2. 认证与入口 guard

- [x] 2.1 实现单密码认证与本地 token 服务
  - 验收标准：正确密码可签发本地 token；错误密码返回 `INVALID_PASSWORD` 语义；token 可校验有效/无效/过期；不引入 username、role、device 或 refresh token；日志不输出 password/token。
  - 依据：`specs/private-access-auth/spec.md`；`design/api.md`；`design/error-handling.md`；`design/risks.md`。
  - 必读上下文：1.1 产出的 `app_password` settings。
  - 修改范围：`api/src/` 下 auth 模块与测试。
  - 依赖：1.1。
  - 并行：可与 1.2 并行；阻塞 2.2、2.3、3.1。
  - 结果：新增 `api/src/auth.ts` 与 `api/src/auth.test.ts`，覆盖正确密码签发 token、错误密码 `INVALID_PASSWORD`、无效/篡改/过期 token 校验；`bun run --filter @agents-remote/api test` 通过。

- [x] 2.2 实现 HTTP auth guard 与登录 API
  - 验收标准：`POST /api/auth/login` 接受 password 并返回登录成功/失败语义；受保护 `/api/*` HTTP 请求缺少或携带无效 token 时返回未认证错误；保留或明确处理 `/api/health` 的公开/受保护决策；错误响应不泄露敏感信息。
  - 依据：`design/api.md`；`design/error-handling.md`；`docs/specs/service-access-boundary/spec.md`。
  - 必读上下文：`api/src/index.ts`、2.1 auth service。
  - 修改范围：`api/src/` HTTP routing/guard 模块与测试；必要时更新 shared DTO。
  - 依赖：2.1。
  - 并行：可与 2.3 并行；需避免同时改同一 `api/src/index.ts` 入口，可先在独立模块完成。
  - 结果：新增 `api/src/http-auth.ts` 与 `api/src/http-auth.test.ts`，覆盖登录成功/失败、Bearer/Cookie/query token 提取、HTTP guard 和 `/api/auth/me` 语义；`bun run --filter @agents-remote/api test` 通过。

- [x] 2.3 实现 WebSocket auth guard
  - 验收标准：受保护 WebSocket upgrade 缺少或携带无效 token 时被拒绝；有效 token 可以建立连接；认证语义与 HTTP guard 复用同一 auth service；不要求用户手动理解 WebSocket token 参数。
  - 依据：`specs/private-access-auth/spec.md`；`design/api.md`；`design/error-handling.md`；`docs/specs/service-access-boundary/spec.md`。
  - 必读上下文：`api/src/index.ts`、2.1 auth service。
  - 修改范围：`api/src/` WebSocket upgrade guard 模块与测试；可能调整现有 `/api/ws/echo` smoke endpoint。
  - 依赖：2.1。
  - 并行：可与 2.2 并行；最终入口集成需在 3.1 汇合。
  - 结果：新增 `api/src/ws-auth.ts` 与 `api/src/ws-auth.test.ts`，复用 token 提取与 auth service，覆盖有效 token upgrade 判定和缺失/无效 token 拒绝；`bun run --filter @agents-remote/api test` 通过。

### 3. API 入口集成

- [x] 3.1 重组 `api` 启动入口
  - 验收标准：`api/src/index.ts` 启动时先加载/校验 settings、创建 runtime dir，再启动 Bun server；HTTP 与 WebSocket 入口接入认证 guard；现有 `/api` 路径约束保持；启动日志不泄露 secret。
  - 依据：`plan.md` 执行策略；`design/architecture.md`；`design/api.md`；`design/risks.md`。
  - 必读上下文：`api/src/index.ts`、1.1、1.2、2.2、2.3 的模块接口。
  - 修改范围：`api/src/index.ts` 及必要的 routing composition 文件。
  - 依赖：1.1、1.2、2.2、2.3。
  - 并行：否，集成汇合点。
  - 结果：`api/src/index.ts` 启动时加载 settings、创建 runtime dir、初始化 auth service，并接入 `/api/auth/login`、`/api/auth/me`、HTTP guard 与 WebSocket guard；`/api/health` 保持公开 smoke endpoint；`bun run --filter @agents-remote/api test` 与 `bun run --filter @agents-remote/api typecheck` 通过。

### 4. 共享类型与前端接入最小面

- [x] 4.1 补充跨边界 DTO 类型
  - 验收标准：`packages/shared` 包含登录响应、认证错误或通用 API error 的必要 DTO；不包含 password 校验、token 签发、配置读取或业务流程逻辑。
  - 依据：`docs/specs/workspace-foundation/spec.md`；`docs/architecture/monorepo-service-boundaries.md`；`design/api.md`。
  - 必读上下文：`packages/shared/src/index.ts`。
  - 修改范围：`packages/shared/src/index.ts` 与测试。
  - 依赖：可先并行，最终需与 2.2/3.1 的响应结构对齐。
  - 并行：可与 1.1 初期并行。
  - 结果：补充 `ApiErrorResponse`、`LoginRequest`、`LoginResponse`、`AuthMeResponse` 等跨边界 DTO，并更新 shared 测试；`bun run --filter @agents-remote/shared test` 通过。

### 5. 测试与质量验证

- [x] 5.1 补齐配置、认证和 guard 测试
  - 验收标准：覆盖缺配置生成模板、env 覆盖、相对 `projects_root` 失败、runtime dir 创建失败、登录成功/失败、HTTP 未认证拒绝、WebSocket 未认证拒绝、敏感信息不出现在错误响应中的关键路径。
  - 依据：`specs/personal-app-config/spec.md`；`specs/private-access-auth/spec.md`；`design/error-handling.md`；`design/risks.md`。
  - 必读上下文：`api/src/index.test.ts`、新增模块测试。
  - 修改范围：`api/src/**/*.test.ts`、`packages/shared/src/index.test.ts`。
  - 依赖：1.1、1.2、2.1、2.2、2.3、3.1、4.1。
  - 并行：否，最终验证任务。
  - 结果：配置、runtime dir、auth service、HTTP guard、WebSocket guard 和入口组合测试已覆盖关键路径；`bun run test` 通过。

- [x] 5.2 运行基础质量命令并修复问题
  - 验收标准：`bun run typecheck`、`bun run build`、`bun run test` 通过；如改动触发 lint/format 问题，也运行并修复 `bun run lint`、`bun run format:check`。
  - 依据：`docs/specs/workspace-foundation/spec.md`；`plan.md` 风险与验证重点。
  - 必读上下文：根 `package.json` 脚本。
  - 修改范围：仅修复本 change 引入的问题。
  - 依赖：5.1。
  - 并行：否，最终质量门。
  - 结果：`bun run typecheck`、`bun run build`、`bun run test`、`bun run lint`、`bun run format:check` 均通过；格式问题已用 `oxfmt` 修复。

## 依赖图

- 1.1 → 1.2
- 1.1 → 2.1
- 2.1 → 2.2
- 2.1 → 2.3
- 1.1 + 1.2 + 2.2 + 2.3 → 3.1
- 4.1 ↔ 2.2/3.1 对齐响应结构
- 3.1 + 4.1 → 5.1
- 5.1 → 5.2

## 可并行任务

- 4.1 可与 1.1 初期并行，但最终响应字段必须与 2.2/3.1 对齐。
- 1.2 与 2.1 可并行，因为分别处理 runtime dir 与 auth service，二者只共享已确定的 settings 接口。
- 2.2 与 2.3 可并行，因为分别处理 HTTP 与 WebSocket guard；最终在 3.1 汇合。

## 阻塞项

- 实现阶段需确认 token 载体、签名密钥来源和默认有效期；如果无法在现有设计约束内安全选择，应暂停并回流设计确认。
- 如果配置文件权限修正策略在 Bun/Linux 环境中不可可靠实现，需要在实现任务中记录权衡并选择警告或 fail-fast 行为。
