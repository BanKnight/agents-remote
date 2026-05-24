# verify

本文件记录当前 change 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：configure-personal-app-settings
- Roadmap 对应项：v0.1-foundation-and-agent-research / configure-personal-app-settings
- 验证对象：个人部署配置加载、runtime dir、单密码认证、本地 token、HTTP/WebSocket auth guard、shared DTO 与 API 入口集成。
- 验证结论：条件通过

## 验证轮次

### Round 1

- 时间：2026-05-24
- 验证范围：specs、design、plan/tasks 与当前未提交实现 diff 的一致性；后端配置/认证模块、入口集成、shared DTO、测试与质量命令。
- 使用 harness：`bun run typecheck`、`bun run build`、`bun run test`、`bun run lint`、`bun run format:check`、代码 trace、delta 检查。
- 本轮结论：条件通过；后端基础能力满足本 change 的实现计划和主要 specs，Web 登录页/跳转用户路径未在本 change 中实现，按 design 范围作为后续 UI/PWA change 条件项追踪。
- 后续动作：进入 `distill-change` 前可沉淀配置/认证边界；后续 `build-responsive-pwa-console-shell` 或登录 UI 相关 change 必须消费本验证中的 WARNING。

## Harness 清单

- 名称：Full workspace typecheck
  类型：static / typecheck
  覆盖承诺：TypeScript 类型一致性、workspace 跨包 DTO 引用。
  执行方式：`bun run typecheck`
  结果：通过；api、shared、web 均完成 typecheck。
  证据：命令输出显示 `@agents-remote/api:typecheck`、`@agents-remote/shared:typecheck`、`@agents-remote/web:typecheck` 均 Done。

- 名称：Full workspace build
  类型：build
  覆盖承诺：api/shared/web 构建入口可用，新增模块可被打包。
  执行方式：`bun run build`
  结果：通过；api bundle 成功，shared build 成功，web Vite build 成功。
  证据：命令输出显示 `index.js 12.83 KB`，web `✓ built`。

- 名称：Full workspace tests
  类型：unit / integration-like handler tests
  覆盖承诺：settings、runtime dir、auth service、HTTP guard、WebSocket guard、API handler、shared DTO。
  执行方式：`bun run test`
  结果：通过；api 25 pass / 0 fail，shared 2 pass / 0 fail，web 1 pass / 0 fail。
  证据：命令输出显示总计 28 tests passed。

- 名称：Lint and format check
  类型：lint / formatting
  覆盖承诺：新增代码符合当前 lint 与 format 质量门。
  执行方式：`bun run lint && bun run format:check`
  结果：通过；0 warnings / 0 errors，所有匹配文件格式正确。
  证据：命令输出显示 `Found 0 warnings and 0 errors`、`All matched files use the correct format`。

- 名称：Code trace review
  类型：manual trace
  覆盖承诺：spec/design/task 到实现位置和测试证据的可追踪性。
  执行方式：读取关键源码与测试文件。
  结果：通过，存在 1 个 WARNING 和 1 个 SUGGESTION。
  证据：下方 Trace / Delta / Scenario / Evidence 矩阵。

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| personal-app-config spec | 从 `~/.agents-remote/config.toml` 读取配置，环境变量覆盖第一轮必要配置 | `api/src/settings.ts:42`、`api/src/settings.ts:56`、`api/src/settings.ts:111` | `api/src/settings.test.ts:18`、`api/src/settings.test.ts:37`；`bun run test` 通过 | 通过 |
| personal-app-config spec | 缺默认配置时生成安全模板并停止启动，不使用默认可运行密码 | `api/src/settings.ts:44`、`api/src/settings.ts:67`、`api/src/settings.ts:103` | `api/src/settings.test.ts:63`；`bun run test` 通过 | 通过 |
| personal-app-config spec | 缺必要配置或 `projects_root` 相对路径时 fail-fast | `api/src/settings.ts:122`、`api/src/settings.ts:154` | `api/src/settings.test.ts:76`、`api/src/settings.test.ts:94`；`bun run test` 通过 | 通过 |
| personal-app-config spec | 配置文件权限尽量限制为当前用户读写，无法修正时报错 | `api/src/settings.ts:69`、`api/src/settings.ts:71`、`api/src/settings.ts:103` | 代码 trace 验证；未构建 chmod 失败 fixture | 通过 |
| personal-app-config spec | runtime dir 默认 `/run/agents-remote`，支持 `AGENTS_REMOTE_RUN_DIR` 覆盖，启动时创建，失败 fail-fast | `api/src/runtime-dir.ts:12`、`api/src/runtime-dir.ts:14`、`api/src/runtime-dir.ts:21` | `api/src/runtime-dir.test.ts:19`、`api/src/runtime-dir.test.ts:23`、`api/src/runtime-dir.test.ts:29`、`api/src/runtime-dir.test.ts:36`；`bun run test` 通过 | 通过 |
| private-access-auth spec | 单密码登录，不引入 username/OAuth/2FA/设备/角色模型 | `api/src/auth.ts:39`、`api/src/http-auth.ts:54`、`packages/shared/src/index.ts:48` | `api/src/auth.test.ts:5`、`api/src/http-auth.test.ts:11`；`bun run test` 通过 | 通过 |
| private-access-auth spec | 错误密码返回 `INVALID_PASSWORD` 语义 | `api/src/auth.ts:39`、`api/src/http-auth.ts:76` | `api/src/auth.test.ts:18`、`api/src/http-auth.test.ts:27`；`bun run test` 通过 | 通过 |
| private-access-auth spec | 登录成功签发本地 token，token 可校验有效/过期/篡改 | `api/src/auth.ts:26`、`api/src/auth.ts:39`、`api/src/auth.ts:55` | `api/src/auth.test.ts:5`、`api/src/auth.test.ts:30`、`api/src/auth.test.ts:43`；`bun run test` 通过 | 通过 |
| private-access-auth spec | HTTP API 使用同一 token guard 保护 | `api/src/http-auth.ts:20`、`api/src/http-auth.ts:41`、`api/src/index.ts:40` | `api/src/http-auth.test.ts:41`、`api/src/index.test.ts:22`、`api/src/index.test.ts:35`；`bun run test` 通过 | 通过 |
| private-access-auth spec | WebSocket 连接使用同一认证状态保护 | `api/src/ws-auth.ts:3`、`api/src/index.ts:28` | `api/src/ws-auth.test.ts:11`、`api/src/ws-auth.test.ts:20`、`api/src/index.test.ts:60`；`bun run test` 通过 | 通过 |
| private-access-auth spec | 登录态在 PWA 上保留一段时间，过期/无效后重新登录 | `api/src/auth.ts:26`、`api/src/auth.ts:55`、`api/src/http-auth.ts:71` | `api/src/auth.test.ts:5`、`api/src/auth.test.ts:43`；前端跳转未实现 | 条件通过 |
| private-access-auth spec | 未认证用户打开 Web/PWA 入口看到单密码登录入口 | 当前实现只提供后端 login API 和 DTO；`web/src/routes/HomeRoute.tsx:6` 仍是 smoke home | 代码 trace 验证；未覆盖浏览器/UI harness | WARNING |
| plan/tasks | API 启动先加载 settings、创建 runtime dir、初始化 auth，再启动 Bun server | `api/src/index.ts:51` | `api/src/index.test.ts:9`、`api/src/index.test.ts:22`、`api/src/index.test.ts:35`；`bun run typecheck/test` 通过 | 通过 |
| plan/tasks | shared DTO 只放跨边界类型，不放认证逻辑 | `packages/shared/src/index.ts:34`、`packages/shared/src/index.ts:48` | `packages/shared/src/index.test.ts:9`；`bun run test` 通过 | 通过 |

## Delta 验证

- Scope 内变更：新增 `api` settings/runtime/auth/http-auth/ws-auth 模块与测试；重组 `api/src/index.ts`；新增 shared auth/error DTO；更新 change `tasks.md` 与 `progress.md`。
- Scope 外变更：未发现目标 change 以外的业务实现；未修改 web UI 登录流程。
- 未被 spec/design 支撑的新行为：`extractBearerToken` 支持 query token（`api/src/http-auth.ts:37`），主要服务 WebSocket 测试/连接便利，但 URL token 可能出现在日志或历史中。
- 风险：Web 登录页和自动跳转未实现，导致 private-access-auth 的用户可见场景尚未端到端覆盖；query token 支持需避免成为 Web UI 主路径。
- 结论：后端基础能力 scope 内一致；用户可见登录体验需由后续 UI/PWA change 承接。

## Scenario 验证

- 场景：配置文件存在且包含必要配置
  路径类型：正常
  验证方式：unit test + code trace
  证据：`api/src/settings.test.ts:18`、`api/src/settings.ts:56`
  结果：通过

- 场景：环境变量覆盖配置文件
  路径类型：边界
  验证方式：unit test + code trace
  证据：`api/src/settings.test.ts:37`、`api/src/settings.ts:111`
  结果：通过

- 场景：首次启动缺配置生成模板并停止启动
  路径类型：失败 / 用户可见部署路径
  验证方式：unit test + code trace
  证据：`api/src/settings.test.ts:63`、`api/src/settings.ts:88`
  结果：通过

- 场景：`projects_root` 为相对路径
  路径类型：失败
  验证方式：unit test + code trace
  证据：`api/src/settings.test.ts:94`、`api/src/settings.ts:154`
  结果：通过

- 场景：runtime dir 默认、覆盖、创建和不可用
  路径类型：正常 / 边界 / 失败
  验证方式：unit test + code trace
  证据：`api/src/runtime-dir.test.ts:19`、`api/src/runtime-dir.test.ts:23`、`api/src/runtime-dir.test.ts:29`、`api/src/runtime-dir.test.ts:36`
  结果：通过

- 场景：正确密码登录并签发 token
  路径类型：正常
  验证方式：unit test + handler test
  证据：`api/src/auth.test.ts:5`、`api/src/http-auth.test.ts:11`
  结果：通过

- 场景：错误密码登录失败
  路径类型：失败 / 用户可见认证路径
  验证方式：unit test + handler test
  证据：`api/src/auth.test.ts:18`、`api/src/http-auth.test.ts:27`
  结果：通过

- 场景：未认证 HTTP API 被拒绝，认证后可通过 guard
  路径类型：正常 / 失败
  验证方式：handler test
  证据：`api/src/index.test.ts:22`、`api/src/index.test.ts:35`
  结果：通过

- 场景：未认证 WebSocket 被拒绝，认证 token 可 upgrade
  路径类型：正常 / 失败
  验证方式：handler test
  证据：`api/src/ws-auth.test.ts:11`、`api/src/ws-auth.test.ts:20`、`api/src/index.test.ts:60`
  结果：通过

- 场景：未认证用户打开 Web/PWA 入口看到登录页
  路径类型：用户可见
  验证方式：代码 trace
  证据：`web/src/routes/HomeRoute.tsx:6` 仍为 smoke home；未实现 login route/page
  结果：未覆盖；记录为 WARNING，后续 UI/PWA change 必须承接

## Evidence 清单

- 类型：测试
  路径或命令：`bun run test`
  结果：通过；api 25 pass / shared 2 pass / web 1 pass。
  说明：覆盖新增后端模块、API handler、shared DTO 和现有 web smoke test。

- 类型：类型检查
  路径或命令：`bun run typecheck`
  结果：通过。
  说明：api/shared/web workspace 类型均通过。

- 类型：构建
  路径或命令：`bun run build`
  结果：通过。
  说明：api bundle、shared build、web Vite build 均成功。

- 类型：lint
  路径或命令：`bun run lint`
  结果：通过，0 warnings / 0 errors。
  说明：新增代码符合当前 lint 门禁。

- 类型：format
  路径或命令：`bun run format:check`
  结果：通过。
  说明：所有匹配文件格式正确。

- 类型：代码引用
  路径或命令：`api/src/settings.ts`、`api/src/runtime-dir.ts`、`api/src/auth.ts`、`api/src/http-auth.ts`、`api/src/ws-auth.ts`、`api/src/index.ts`、`packages/shared/src/index.ts`
  结果：通过。
  说明：关键实现位置已在 Trace 矩阵中逐项引用。

- 类型：delta
  路径或命令：`git status --short`、`git diff --name-status`
  结果：通过，存在预期未提交实现变更和新增后端模块。
  说明：变更集中在 configure-personal-app-settings 相关 workflow 与 api/shared 代码。

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 条件通过 | 后端配置、runtime dir、auth/token、HTTP/WS guard、shared DTO 与任务清单完成；Web 登录页/跳转场景未实现。 |
| Correctness | 通过 | 质量命令全部通过，核心正常/失败/边界路径均有 unit 或 handler 测试。 |
| Coherence | 通过 | 实现符合单一 settings 入口、单一 auth guard、runtime/persistent 目录分离和 `/api` 边界设计。 |

## 问题清单

### CRITICAL

- （无）

### WARNING

- Web/PWA 登录页与认证过期跳回登录页的用户可见路径尚未实现。
  - 对应承诺：`private-access-auth` 中“未认证用户打开 Web/PWA 入口看到单密码登录入口”和 token 无效后回到登录页的场景。
  - 证据：当前 `web/src/routes/HomeRoute.tsx:6` 仍是 smoke home，`web/src/api/client.ts:0` 仅有 health 和 echo socket client。
  - 影响范围：不影响后端配置/认证基础和后续 API guard，但不能声称完整用户登录体验已完成。
  - 建议回流技能：后续 `build-responsive-pwa-console-shell` / 登录 UI 相关 change 的 `specify-change` 或 `implement-change`；如果项目决定本 change 必须包含前端登录页，则回流 `implement-change`。
  - 具体行动建议：后续 Web/PWA shell 引入登录页面、登录状态保存、401 跳转登录页、WebSocket 认证失败提示，并复用本 change 的 `/api/auth/login` 与 `/api/auth/me`。

### SUGGESTION

- 避免让 query token 成为 Web UI 主路径。
  - 对应证据：`api/src/http-auth.ts:37` 支持从 URL query 提取 token，`api/src/ws-auth.test.ts:11` 使用 query token 验证 WebSocket upgrade。
  - 影响范围：query token 容易进入日志、浏览器历史或复制链接；当前同域 cookie 已可作为更安全的自动携带路径。
  - 建议回流技能：后续 Web/PWA shell 或 Session Runtime 实现时在设计/实现中优先使用 HttpOnly cookie 或 header，query token 仅作为受控测试/调试路径，必要时在 design 中收紧。

## 回流建议

- 当前无 CRITICAL，不要求回流才能进入 `distill-change`。
- WARNING 应作为后续 `build-responsive-pwa-console-shell` 或认证前端接入任务的输入。
- SUGGESTION 应作为后续 WebSocket stream 设计的安全注意事项。

## 最终结论

- 结论：条件通过
- 是否允许进入 distill-change：是
- 条件或阻塞：无阻塞；需在后续 UI/PWA change 中补齐用户可见登录页、认证过期跳转和 WebSocket 认证失败提示。
