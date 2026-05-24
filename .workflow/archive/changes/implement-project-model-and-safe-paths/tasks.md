# tasks

## 执行顺序

1. 先稳定 shared DTO/错误码，避免 API、web client 和测试各自定义响应形态。
2. 再实现并测试 `api` 内 safe path resolver，这是 Project service 和后续 project-scoped 能力的安全边界。
3. 在 resolver 之上实现 Project service 的目录枚举、创建/采用、详情摘要和文件系统错误映射。
4. 接入受保护 HTTP route，并补齐 route/auth 集成测试。
5. 补齐 web API client helper 和全仓验证，作为后续 UI change 的输入。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 扩展 shared Project API DTO 和错误码
  - 验收标准：
    - `packages/shared/src/index.ts` 包含 Project list/create/detail response 与 create request 类型。
    - `ApiErrorCode` 覆盖 `PROJECT_NAME_INVALID`、`PROJECT_NOT_FOUND`、`PROJECT_TARGET_INVALID`、`PROJECT_PATH_OUTSIDE_ROOT`、`PROJECT_CONFLICT`、`PROJECT_FS_ERROR`。
    - `packages/shared/src/index.test.ts` 覆盖新增类型的最小编译期/运行期 smoke。
  - 依据：`plan.md` 的“执行策略”；`design/api.md` 的“请求 / 响应”和“错误语义”；`docs/architecture/monorepo-service-boundaries.md`。
  - 必读上下文：`packages/shared/src/index.ts`、`packages/shared/src/index.test.ts`。
  - 修改范围：`packages/shared/src/index.ts`、`packages/shared/src/index.test.ts`。
  - 依赖：无。
  - 并行：否（阻塞 API route 与 web client 类型）。

- [x] 1.2 实现 Project safe path resolver
  - 验收标准：
    - `api` 内新增 resolver 模块，能够从 `projectsRoot` + project 名称解析一级真实 project 目录。
    - resolver 能解析 project-relative path，并保证空路径/root 路径留在 project 根，`..`、嵌套 project identity、路径分隔符和真实路径越界被拒绝。
    - 测试覆盖普通目录、中文/空格名称、非目录、root 本身、嵌套路径、parent traversal、symlink 逃逸或等价真实路径逃逸。
    - resolver 对外暴露稳定错误 code，不让调用方自行做路径边界判断。
  - 依据：`plan.md` 的“风险与验证重点”；`specs/project-safe-paths/spec.md`；`design/architecture.md`；`design/error-handling.md`。
  - 必读上下文：`api/src/settings.ts`、`api/src/http-auth.ts` 中错误响应形态、现有 `api/src/*.test.ts` 测试风格。
  - 修改范围：新增 `api/src/project-paths.ts` 与 `api/src/project-paths.test.ts`（文件名可按实现阶段调整，但模块需留在 `api` 内）。
  - 依赖：1.1（错误码类型已存在）。
  - 并行：否（Project service 安全边界前置）。

### 2. 核心实现任务

- [x] 2.1 实现 Project service
  - 验收标准：
    - service 能列出 `PROJECTS_ROOT` 下一级目录，忽略普通文件/非目录条目，并按 `name` 稳定排序。
    - service 能按文件夹名称创建不存在目录、采用已存在目录，并在目标为文件/root/嵌套/越界时返回对应错误。
    - service 能按 project 名称返回详情；不存在返回 `PROJECT_NOT_FOUND`。
    - Project 摘要包含 `name`、真实 `path`、`agentSessionCount: 0`、`terminalSessionCount: 0`，`gitBranch` 缺省不影响结果。
    - 测试覆盖重复创建幂等、绝对路径创建/采用、并发后目标已是目录可成功、目标变为文件返回冲突或目标无效。
  - 依据：`plan.md` 的“执行策略”和“任务顺序依据”；`specs/project-model/spec.md`；`design/business-rules.md`；`design/error-handling.md`。
  - 必读上下文：1.2 resolver 模块；`api/src/index.test.ts` 的 handler 测试风格。
  - 修改范围：新增 `api/src/projects.ts` 与 `api/src/projects.test.ts`（文件名可按实现阶段调整）。
  - 依赖：1.1、1.2。
  - 并行：否（依赖 resolver API，且会定义 route 使用的 service 接口）。

- [x] 2.2 接入受保护 Project HTTP API
  - 验收标准：
    - `GET /api/projects`、`POST /api/projects`、`GET /api/projects/:projectName` 在认证通过后可用，未认证仍返回既有 `UNAUTHENTICATED`。
    - route 使用 Project service，不在 `api/src/index.ts` 中直接实现文件系统或路径解析逻辑。
    - `POST /api/projects` 能处理无效 JSON、缺少 `path`、空 path、名称输入和绝对路径输入。
    - 错误响应沿用 `{ error: { code, message } }`，状态码符合 `design/api.md`：400/401/404/409/500。
    - `createFetchHandler` 支持测试注入 Project service 或 projects root，`startApi` 使用 `settings.projectsRoot` 初始化真实 service。
  - 依据：`plan.md` 的“执行策略”；`design/api.md`；`docs/specs/private-access-auth/spec.md`；`docs/specs/service-access-boundary/spec.md`。
  - 必读上下文：`api/src/index.ts`、`api/src/index.test.ts`、`api/src/http-auth.ts`、`api/src/settings.ts`。
  - 修改范围：`api/src/index.ts`、`api/src/index.test.ts`，必要时新增轻量 route helper 测试文件。
  - 依赖：2.1。
  - 并行：否（同一 route 入口与 handler 测试修改集中）。

- [x] 2.3 补齐 web Project API client helper
  - 验收标准：
    - `web/src/api/client.ts` 提供读取 Project 列表、创建 Project、读取 Project 详情的 helper，使用同域 `/api/projects` 路径。
    - projectName 路由段由调用方传入原始名称时 helper 使用 URL encode，支持空格/中文等 URL-sensitive 名称。
    - client 测试覆盖路径 shape、method/body 和非 ok 响应抛错行为；不在本任务实现 UI 页面。
  - 依据：`plan.md` 的“执行策略”和“不做事项”；`design/api.md`；`docs/specs/service-access-boundary/spec.md`。
  - 必读上下文：`web/src/api/client.ts`、`web/src/api/client.test.ts`、`packages/shared/src/index.ts`。
  - 修改范围：`web/src/api/client.ts`、`web/src/api/client.test.ts`。
  - 依赖：1.1；可在 2.2 route 实现后或并行后半段完成。
  - 并行：是（与 2.2 不改同一文件，但最终验证依赖 API response 类型稳定）。

### 3. 集成与验证任务

- [x] 3.1 补齐端到端级 API 行为测试
  - 验收标准：
    - 通过 `createFetchHandler` 或等价测试入口覆盖登录后访问 Project API 的 golden path。
    - 覆盖未认证访问被拦截、合法 project 名称详情、URL encoded project 名称、创建后列表可见。
    - 覆盖越界/嵌套/文件占用错误不会继续执行 project-scoped 文件操作。
  - 依据：`plan.md` 的“风险与验证重点”；`design/api.md`；`design/error-handling.md`。
  - 必读上下文：`api/src/index.test.ts`、2.1/2.2 实现文件。
  - 修改范围：`api/src/index.test.ts` 或新增 `api/src/projects-route.test.ts`。
  - 依赖：2.2。
  - 并行：否（验证 route 集成，依赖 route 完成）。

- [x] 3.2 运行全仓质量检查并修正问题
  - 验收标准：
    - `bun run typecheck` 通过。
    - `bun run test` 通过。
    - `bun run build` 通过。
    - `bun run lint` 通过。
    - `bun run format:check` 通过；如失败，应运行项目既有格式化方式修正后再检查。
  - 依据：`plan.md` 的“风险与验证重点”；根 `package.json` scripts。
  - 必读上下文：`package.json`、各 workspace `package.json`。
  - 修改范围：仅修正上述检查暴露的实现/测试/格式问题，不扩大功能范围。
  - 依赖：3.1、2.3。
  - 并行：否（收尾验证依赖所有实现完成）。

## 依赖图

- 1.1 → 1.2 → 2.1 → 2.2 → 3.1 → 3.2
- 1.1 → 2.3 → 3.2
- 2.2 与 2.3 可在 shared 类型稳定后局部并行，但 3.2 需要二者都完成。

## 可并行任务

- 2.3 可与 2.2 后半段并行：它只修改 `web/src/api/client.ts` 与测试，不触碰 `api` route 文件；但必须以 1.1 的 shared response 类型为前置。
- resolver 测试补充可与 service 设计细化并行讨论，但实际代码建议顺序实现，避免安全边界 API 反复变动。

## 阻塞项

- （无）
