# verify

本文件记录当前 change 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：implement-project-model-and-safe-paths
- Roadmap 对应项：v0.2-project-console-shell / Project 目录模型与安全路径解析
- 验证对象：Project DTO、API 内 safe path resolver、Project service、受保护 `/api/projects` HTTP API、web Project API client helper 与相关测试
- 验证结论：通过

## 验证轮次

### Round 1

- 时间：2026-05-25
- 验证范围：spec/design/plan/tasks 与当前实现的一致性；Project 正常路径、边界路径、失败路径；shared/api/web 质量基线。
- 使用 harness：代码审阅 + unit/integration test + workspace typecheck/build/lint/format check。
- 本轮结论：通过；无 CRITICAL / WARNING。
- 后续动作：可进入 `distill-change`，由后续阶段判断长期 docs 沉淀内容。

## Harness 清单

- 名称：Project path resolver unit tests
  类型：unit test
  覆盖承诺：Project 名称必须为一级目录名；真实路径必须留在 `PROJECTS_ROOT` / project 根内；缺失、非目录、parent traversal、symlink escape 被拒绝。
  执行方式：`bun run test`，其中 `api/src/project-paths.test.ts` 被执行。
  结果：通过。
  证据：`api/src/project-paths.test.ts:25`、`api/src/project-paths.test.ts:33`、`api/src/project-paths.test.ts:40`、`api/src/project-paths.test.ts:49`、`api/src/project-paths.test.ts:60`、`api/src/project-paths.test.ts:69`、`api/src/project-paths.test.ts:81`。

- 名称：Project service unit tests
  类型：unit test
  覆盖承诺：一级目录列表、忽略非目录、稳定排序、创建/采用目录、绝对路径一级子目录、拒绝 root/嵌套/越界/文件目标、详情和 missing project。
  执行方式：`bun run test`，其中 `api/src/projects.test.ts` 被执行。
  结果：通过。
  证据：`api/src/projects.test.ts:19`、`api/src/projects.test.ts:43`、`api/src/projects.test.ts:58`、`api/src/projects.test.ts:72`、`api/src/projects.test.ts:91`。

- 名称：Project API route integration tests
  类型：integration test
  覆盖承诺：`/api/projects` 受 HTTP token guard 保护；认证后可 list/create/detail；URL encoded project name 可解析；错误响应映射为设计中的状态码和 error code。
  执行方式：`bun run test`，其中 `api/src/index.test.ts` 被执行。
  结果：通过。
  证据：`api/src/index.test.ts:52`、`api/src/index.test.ts:109`、`api/src/index.test.ts:131`、`api/src/index.test.ts:156`。

- 名称：shared/web API client tests
  类型：unit test
  覆盖承诺：shared 只提供跨边界 DTO/error code；web helper 使用同域 `/api/projects`、POST JSON body、URL encode detail name、非 ok 响应抛错。
  执行方式：`bun run test`，其中 `packages/shared/src/index.test.ts` 与 `web/src/api/client.test.ts` 被执行。
  结果：通过。
  证据：`packages/shared/src/index.test.ts:16`、`web/src/api/client.test.ts:9`、`web/src/api/client.test.ts:21`、`web/src/api/client.test.ts:41`、`web/src/api/client.test.ts:60`。

- 名称：workspace quality gate
  类型：format / lint / typecheck / build / test
  覆盖承诺：全仓格式、lint、类型、测试与构建质量基线。
  执行方式：`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build`
  结果：通过。
  证据：命令输出显示 format check 通过、lint 0 warning/0 error、typecheck 通过、test 为 api 41 pass / shared 2 pass / web 4 pass、build 通过。

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| `specs/project-model/spec.md` | `PROJECTS_ROOT` 下一级真实目录识别为 Project，普通文件和嵌套目录不作为 Project 列表项 | `api/src/projects.ts:33` 读取 root 一级 entries，`api/src/projects.ts:40` 只保留目录，`api/src/projects.ts:44` 稳定排序 | `api/src/projects.test.ts:19` 覆盖一级目录、嵌套目录、普通文件和排序 | 通过 |
| `specs/project-model/spec.md` | Project identity 为一级目录名，支持 URL-sensitive 名称 | `api/src/project-paths.ts:34` 校验名称，`api/src/index.ts:91` 解码 URL path 参数，`web/src/api/client.ts:30` encode projectName | `api/src/project-paths.test.ts:29`、`api/src/index.test.ts:131`、`web/src/api/client.test.ts:41` | 通过 |
| `specs/project-model/spec.md` | Project summary 返回 name/path/session counts，Git branch 缺省不阻塞 | `api/src/projects.ts:93` 构造 Project DTO，session counts 为 0；shared DTO 保持 `gitBranch` 可选：`packages/shared/src/index.ts:0` | `api/src/projects.test.ts:19`、`api/src/index.test.ts:109`、`packages/shared/src/index.test.ts:16` | 通过 |
| `specs/project-model/spec.md` | 创建 Project 只创建或采用一级目录，不做 scaffold/clone | `api/src/projects.ts:58` 创建入口，`api/src/projects.ts:61` 只 mkdir，`api/src/projects.ts:90` 返回现有 Project summary | `api/src/projects.test.ts:43`、`api/src/projects.test.ts:58`、`api/src/index.test.ts:131` | 通过 |
| `specs/project-model/spec.md` | 创建拒绝 root、嵌套、越界和文件目标 | `api/src/projects.ts:111` 解析创建目标，`api/src/projects.ts:124` 拒绝 root，`api/src/projects.ts:131` 拒绝越界，`api/src/projects.ts:138` 拒绝嵌套，`api/src/projects.ts:69` 检查最终目标是目录 | `api/src/projects.test.ts:72`、`api/src/index.test.ts:156` | 通过 |
| `specs/project-safe-paths/spec.md` | project 名称通过 `PROJECTS_ROOT` 解析为真实一级目录，不信任客户端路径 | `api/src/project-paths.ts:75` 解析 Project，`api/src/project-paths.ts:97` 使用 realpath，`api/src/project-paths.ts:99` 检查真实路径仍为 root 一级子目录 | `api/src/project-paths.test.ts:40`、`api/src/project-paths.test.ts:60` | 通过 |
| `specs/project-safe-paths/spec.md` | project-relative path 不得逃出 project 根 | `api/src/project-paths.ts:120` 解析相对路径，`api/src/project-paths.ts:136` 检查规范化路径，`api/src/project-paths.ts:143` 检查真实路径 | `api/src/project-paths.test.ts:69`、`api/src/project-paths.test.ts:81` | 通过 |
| `design/api.md` | `GET /api/projects`、`POST /api/projects`、`GET /api/projects/:projectName` 位于 `/api` 且受保护 | `api/src/index.ts:52` 现有 `/api` auth guard，`api/src/index.ts:71` Project route handler，`api/src/index.ts:73` list，`api/src/index.ts:78` create，`api/src/index.ts:91` detail | `api/src/index.test.ts:52`、`api/src/index.test.ts:109`、`api/src/index.test.ts:131` | 通过 |
| `design/api.md` / `design/error-handling.md` | 错误响应沿用 `{ error: { code, message } }`，404/409/500/400 映射明确 | `api/src/index.ts:131` Project error mapping，`api/src/http-auth.ts:9` JSON error shape | `api/src/index.test.ts:156` | 通过 |
| `plan.md` / `tasks.md` | shared 只放 DTO/type，不放 runtime path logic | `packages/shared/src/index.ts:8` response/request DTO，`packages/shared/src/index.ts:50` error code union；runtime 逻辑位于 `api/src/project-paths.ts` 和 `api/src/projects.ts` | `packages/shared/src/index.test.ts:16`；代码结构审阅 | 通过 |
| `tasks.md` | web 只补 API client helper，不实现 UI | `web/src/api/client.ts:18` list helper，`web/src/api/client.ts:22` create helper，`web/src/api/client.ts:30` detail helper；未新增 route/page/component | `web/src/api/client.test.ts:9`、`web/src/api/client.test.ts:21`、`web/src/api/client.test.ts:41`、`web/src/api/client.test.ts:60` | 通过 |
| `tasks.md` | 全仓质量检查通过 | 无代码位置 | `bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build` 通过 | 通过 |

## Delta 验证

- Scope 内变更：
  - 扩展 `packages/shared/src/index.ts` Project API DTO 和 Project error code。
  - 新增 `api/src/project-paths.ts` / `api/src/project-paths.test.ts`，集中实现 Project root/name/relative path 安全解析。
  - 新增 `api/src/projects.ts` / `api/src/projects.test.ts`，实现 Project list/create/get service。
  - 修改 `api/src/index.ts` / `api/src/index.test.ts`，注入 ProjectService 并接入受保护 `/api/projects` HTTP API。
  - 修改 `web/src/api/client.ts` / `web/src/api/client.test.ts`，提供 Project API client helper。
  - 更新 `.workflow/changes/implement-project-model-and-safe-paths/tasks.md` 与 `progress.md` 记录实现状态。
- Scope 外变更：未发现。
- 未被 spec/design 支撑的新行为：未发现。实现未增加 UI、Git branch 读取、最近打开时间、Project 删除/重命名/clone、Files/Git/Session 子资源 API。
- 风险：Project-relative path 当前要求目标存在才能 realpath；本 change 后续 Files/Git 能力如需解析尚不存在目标，需要在对应 change 中重新设计或扩展 resolver 语义。本轮不构成阻塞，因为当前 specs 只要求已有访问路径安全解析。
- 结论：通过。

## Scenario 验证

- 场景：Project 列表读取一级目录并返回基础摘要
  路径类型：正常
  验证方式：Project service unit test + API route integration test
  证据：`api/src/projects.test.ts:19`、`api/src/index.test.ts:109`
  结果：通过

- 场景：创建不存在一级目录、重复创建/采用已存在目录、绝对路径一级子目录
  路径类型：正常 / 边界
  验证方式：Project service unit test + API route integration test
  证据：`api/src/projects.test.ts:43`、`api/src/projects.test.ts:58`、`api/src/index.test.ts:131`
  结果：通过

- 场景：URL-sensitive Project 名称通过 encode/decode 传递
  路径类型：边界 / 用户可见
  验证方式：resolver test + route test + web client test
  证据：`api/src/project-paths.test.ts:29`、`api/src/index.test.ts:131`、`web/src/api/client.test.ts:41`
  结果：通过

- 场景：缺失 project、普通文件目标、嵌套目标、root 本身、越界路径
  路径类型：失败
  验证方式：resolver test + service test + route test
  证据：`api/src/project-paths.test.ts:49`、`api/src/projects.test.ts:72`、`api/src/index.test.ts:156`
  结果：通过

- 场景：symlink escape 与 parent traversal 不得越界
  路径类型：边界 / 失败
  验证方式：resolver unit test
  证据：`api/src/project-paths.test.ts:60`、`api/src/project-paths.test.ts:81`
  结果：通过

- 场景：未认证 Project API 请求被拒绝
  路径类型：失败 / 用户可见
  验证方式：route integration test
  证据：`api/src/index.test.ts:52`
  结果：通过

- 场景：web client 使用同域 `/api/projects`，创建 POST JSON body，detail URL encode，非 ok 抛错
  路径类型：正常 / 边界 / 失败
  验证方式：web client unit test
  证据：`web/src/api/client.test.ts:9`、`web/src/api/client.test.ts:21`、`web/src/api/client.test.ts:41`、`web/src/api/client.test.ts:60`
  结果：通过

## Evidence 清单

- 类型：测试
  路径或命令：`bun run test`
  结果：通过；api 41 pass / shared 2 pass / web 4 pass。
  说明：覆盖 resolver、service、route、shared DTO 和 web client helper。

- 类型：类型检查
  路径或命令：`bun run typecheck`
  结果：通过。
  说明：shared/api/web workspace 类型一致。

- 类型：构建
  路径或命令：`bun run build`
  结果：通过。
  说明：api bundle、shared build、web Vite build 均成功。

- 类型：lint
  路径或命令：`bun run lint`
  结果：通过；0 warnings / 0 errors。
  说明：没有 lint blocker。

- 类型：格式
  路径或命令：`bun run format:check`
  结果：通过。
  说明：所有匹配文件格式正确。

- 类型：代码引用
  路径或命令：`packages/shared/src/index.ts:8`、`api/src/project-paths.ts:75`、`api/src/projects.ts:33`、`api/src/index.ts:71`、`web/src/api/client.ts:18`
  结果：通过。
  说明：关键实现位于 plan/tasks 指定范围内。

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 通过 | specs 中 Project 模型、安全路径、创建/采用、API、错误语义和 web client helper 均有实现与测试证据。 |
| Correctness | 通过 | 正常、边界、失败路径均有可重复 harness；真实路径/symlink escape 是本轮重点覆盖项。 |
| Coherence | 通过 | runtime-only path logic 留在 `api`；`packages/shared` 只放 DTO/type；API 使用现有 `/api` guard 与 JSON error shape；web 只通过 same-origin `/api` helper。 |

## 问题清单

### CRITICAL

- （无）

### WARNING

- （无）

### SUGGESTION

- Project-relative path 当前只能解析已存在目标；后续 Files/Git 能力如需要面向尚不存在的路径，应在对应 change 中显式扩展 resolver 语义和测试。

## 回流建议

- （无）

## 最终结论

- 结论：通过
- 是否允许进入 distill-change：是
- 条件或阻塞：无
