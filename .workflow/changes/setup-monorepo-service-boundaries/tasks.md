# tasks

## 执行顺序

1. 先创建根 Bun workspace、TypeScript 基础和 `packages/shared`，这是所有后续代码和脚本的共同依赖。
2. 再创建 `api` Bun 服务骨架和最小 `/api` smoke 能力，让 `web` proxy 有真实目标可验证。
3. 再创建 `web` React/Vite/Tailwind/TanStack/Jotai 工程基础，并通过相对 `/api` 调用 `api`。
4. 最后补齐根脚本、部署路径说明和验证清单，确认 workspace、边界和 proxy 行为符合 spec/design。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 创建根 Bun workspace 与基础 TypeScript 配置
  - 验收标准：
    - 根目录存在 Bun workspace 配置，能发现 `web`、`api`、`packages/shared` 工作区。
    - 根脚本提供安装后可发现的 `dev`、`build`、`typecheck`、`test` 或等价基础命令入口。
    - TypeScript 基础配置支持各工作区复用或继承。
    - 后端服务命名使用 `api`，没有引入 `agent` 作为服务或包名。
  - 依据：`plan.md` 的“执行策略”和“任务顺序依据”；`specs/workspace-foundation/spec.md` 的 workspace 与 Bun requirements；`design/architecture.md` 的依赖方向。
  - 必读上下文：`plan.md`、`specs/workspace-foundation/spec.md`、`design/architecture.md`、`design/risks.md`。
  - 修改范围：根 `package.json`、Bun workspace 配置、根 TypeScript 配置、基础脚本相关文件。
  - 依赖：无。
  - 并行：否（阻塞所有后续任务，且会影响根配置）。
  - 实现记录：已创建根 `package.json`、`tsconfig.base.json`、`tsconfig.json` 和三个 workspace 的 package/tsconfig 入口；`bun pm pkg get workspaces` 已确认能发现 `web`、`api`、`packages/*`。

- [x] 1.2 创建 `packages/shared` 类型包边界
  - 验收标准：
    - `packages/shared` 存在独立包入口，可被 `web` 与 `api` 以 workspace 依赖导入。
    - shared 包只包含跨边界类型、状态枚举或 API DTO 的初始占位，不包含业务流程、provider 适配、路径解析或 runtime 控制逻辑。
    - shared 包不依赖 `web`、`api`、浏览器专属 API 或 Bun/Node runtime-only API。
  - 依据：`plan.md` 的“风险与验证重点”；`specs/workspace-foundation/spec.md` 的 shared package requirement；`design/architecture.md` 的依赖方向。
  - 必读上下文：`plan.md`、`specs/workspace-foundation/spec.md`、`design/architecture.md`。
  - 修改范围：`packages/shared/`、workspace dependency 配置、必要的 tsconfig/package exports。
  - 依赖：1.1。
  - 并行：否（`web` 和 `api` 后续都依赖 shared 包边界）。
  - 实现记录：已创建 `@agents-remote/shared` 包入口，导出 Project、AgentSession、TerminalSession、状态枚举和 HealthResponse 类型；`bun run --filter @agents-remote/shared typecheck` 通过。

### 2. 核心实现任务

- [x] 2.1 创建 `api` Bun 服务骨架与最小 `/api` smoke 能力
  - 验收标准：
    - `api` 工作区存在 Bun 运行入口，服务身份、包名和脚本均体现为 `api`。
    - 提供最小 HTTP smoke endpoint，例如 `GET /api/health`，用于验证 `/api` 转发边界；不引入登录、Project、Session、Files 或 Git 业务 API。
    - 提供最小 WebSocket smoke/echo endpoint 位于 `/api` 前缀下，用于验证开发代理的 WebSocket upgrade；不定义最终 Session stream 路径。
    - `api` 可导入 `packages/shared` 中的类型占位，但不依赖 `web`。
  - 依据：`plan.md` 的“执行策略”；`specs/service-access-boundary/spec.md` 的 `/api` HTTP/WebSocket requirements；`design/api.md` 的路径边界和 smoke 示例。
  - 必读上下文：`plan.md`、`specs/service-access-boundary/spec.md`、`design/api.md`、`design/architecture.md`。
  - 修改范围：`api/`、根脚本中 api 启动命令、必要的 shared 类型导入。
  - 依赖：1.1、1.2。
  - 并行：否（web proxy 验证依赖真实 api target）。
  - 实现记录：已创建 `api/src/index.ts`，提供 `GET /api/health` 和 `/api/ws/echo` WebSocket echo；`bun run --filter @agents-remote/api typecheck` 与 `build` 通过，HTTP/WebSocket smoke 均已本地验证。

- [x] 2.2 创建 `web` React + TypeScript + Vite + Tailwind 基础
  - 验收标准：
    - `web` 工作区存在 React + TypeScript + Vite 应用入口，并由 Bun 管理脚本。
    - Tailwind CSS 已作为第一轮样式基础接入，并具备深色控制台基础样式入口；不实现具体业务页面。
    - `web` 通过相对 `/api` 路径访问后端 smoke endpoint，不提供普通用户手动输入 API 地址的 UI。
    - Vite dev proxy 将 `/api` HTTP 和 WebSocket 请求转发到本机 `api`，并避免默认启用 `rewriteWsOrigin`。
  - 依据：`plan.md` 的“执行策略”；`specs/workspace-foundation/spec.md` 的 web/Tailwind requirements；`specs/service-access-boundary/spec.md` 的 dev proxy requirements；`design/frontend.md` 和 `design/api.md`。
  - 必读上下文：`plan.md`、`specs/workspace-foundation/spec.md`、`specs/service-access-boundary/spec.md`、`design/frontend.md`、`design/api.md`、`design/risks.md`。
  - 修改范围：`web/`、Vite config、Tailwind config/style entry、workspace dependency 配置。
  - 依赖：1.1、1.2、2.1。
  - 并行：否（依赖 api smoke endpoint 和 shared 包）。
  - 实现记录：已创建 React + TypeScript + Vite 入口、Tailwind v4 样式入口和相对 `/api` client；Vite dev proxy 配置 `/api` with `ws: true` 且未启用 `rewriteWsOrigin`；`web` typecheck/build 通过。

- [x] 2.3 接入 TanStack 与 Jotai 的前端基础边界
  - 验收标准：
    - `web` 工作区依赖中包含当前实现选择的 TanStack Router/Query 范围和 Jotai；若延迟某个 TanStack 包，需在实现记录中说明原因且不违背 specs。
    - 工程入口体现路由/服务端状态/本地 UI 状态的职责分层：路由与服务端数据不放进 Jotai 作为缓存替代。
    - 不引入额外全局状态库或组件库来替代已设计边界。
  - 依据：`specs/workspace-foundation/spec.md` 的 TanStack/Jotai requirement；`design/frontend.md` 的状态分层和关键决策；`plan.md` 的范围边界。
  - 必读上下文：`plan.md`、`design/frontend.md`、`specs/workspace-foundation/spec.md`。
  - 修改范围：`web/` 应用 provider/路由/state 基础、workspace dependency 配置。
  - 依赖：2.2。
  - 并行：否（会修改 web 工程入口，与 2.2 同文件冲突概率高）。
  - 实现记录：已安装 `@tanstack/react-router`、`@tanstack/react-query` 与 `jotai`，并在 `web/src/main.tsx` 使用 RouterProvider、QueryClientProvider、Jotai Provider 分层；`HomeRoute` 用 Query 读取 `/api/health`，Jotai 仅管理本地 UI 状态；`web` typecheck/build 通过。

### 3. 集成与验证任务

- [x] 3.1 补齐根脚本、基础测试/Oxc 质量入口和 workspace 验证
  - 验收标准：
    - 根目录可通过 Bun 命令运行各 workspace 的基础开发、构建、类型检查、lint、format check 和测试/质量检查入口。
    - shared 类型包、api 和 web 的 typecheck/build 至少有可执行入口；如果某类检查因工具未引入而暂缓，需在任务实现记录中说明。
    - 基础测试入口存在，但不定义登录/Project/Terminal/WebSocket E2E 场景。
    - Oxlint 和 Oxfmt 作为 Oxc 体系基础 harness 接入，并排除生成产物目录；不启用 type-aware lint。
  - 依据：`plan.md` 的“执行策略”和“风险与验证重点”；`specs/workspace-foundation/spec.md` 的 test/Oxc entrypoints requirement；`design/risks.md` 的验证建议。
  - 必读上下文：`plan.md`、`specs/workspace-foundation/spec.md`、`design/risks.md`。
  - 修改范围：根脚本、各 workspace scripts、Oxc 配置、基础测试配置或占位测试文件。
  - 依赖：2.1、2.2、2.3。
  - 并行：否（需要所有 workspace 入口稳定后验证）。
  - 实现记录：已为 shared、api、web 添加 Bun test 基础入口；已安装 `oxlint@1.65.0` 与 `oxfmt@0.50.0`，避免采用发布不足 7 天的 latest；根 `bun run lint`、`bun run format:check`、`bun run typecheck`、`bun run build`、`bun run test` 均通过。


- [x] 3.2 验证 `/api` HTTP 与 WebSocket dev proxy
  - 验收标准：
    - 本地开发形态下，`web` 通过 `/api` 成功访问 `api` 的 HTTP smoke endpoint。
    - 本地开发形态下，`/api` 前缀的 WebSocket smoke/echo endpoint 可通过 Vite proxy upgrade 到 `api`。
    - 验证记录明确不使用跨域 API 地址作为第一轮默认路径。
  - 依据：`specs/service-access-boundary/spec.md` 的 dev/prod path shape requirements；`design/api.md` 的 WebSocket 和 proxy 约束；`design/risks.md` 的验证建议。
  - 必读上下文：`plan.md`、`specs/service-access-boundary/spec.md`、`design/api.md`、`design/risks.md`。
  - 修改范围：验证脚本、开发说明或 smoke 测试记录；必要时微调 Vite/api 配置。
  - 依赖：2.1、2.2。
  - 并行：可与 3.1 部分并行（只要 api/web 已可启动），但若需要修改根脚本则应串行避免冲突。
  - 实现记录：已启动本机 `api` 与 `web` dev server，通过 `http://127.0.0.1:3000/api/health` 验证 HTTP proxy，通过 `ws://127.0.0.1:3000/api/ws/echo` 验证 WebSocket proxy；默认路径使用同域 `/api`，未使用跨域 API 地址。

- [x] 3.3 添加部署路径转发说明
  - 验收标准：
    - 文档或项目说明中提供 `/api` 转发到 `api` 本机端口、非 `/api` 页面转发到 `web` 本机端口的示例说明。
    - 说明明确 Cloudflare Tunnel、域名、认证和外部部署资源不由应用创建、运行或管理。
    - 说明覆盖 WebSocket upgrade 需要同样转发 `/api` 前缀。
  - 依据：`specs/service-access-boundary/spec.md` 的 Cloudflare/deployment requirements；`design/api.md` 与 `design/risks.md` 的部署边界。
  - 必读上下文：`plan.md`、`specs/service-access-boundary/spec.md`、`design/api.md`、`design/risks.md`。
  - 修改范围：README 或合适的项目文档；不得写入长期 docs，除非后续 distill-change 阶段决定沉淀。
  - 依赖：2.1、2.2。
  - 并行：是（可在核心服务路径确定后与 3.1/3.2 并行；通常修改文档，不与代码入口冲突）。
  - 实现记录：已在 README 添加本地 `web`/`api` 服务说明、`/api` 到 `api`、非 `/api` 到 `web` 的转发示例、WebSocket upgrade 示例，并明确应用不管理 Cloudflare Tunnel、域名或外部认证。

### 4. 清理与横切任务

- [x] 4.1 执行边界检查并记录实现结果
  - 验收标准：
    - 确认 `packages/shared` 没有依赖 `web`/`api` 内部模块，也没有放入业务逻辑、path resolver 或 runtime control。
    - 确认 `api` 未托管 `web` 作为默认架构，`web` 未直接导入 `api` 内部模块。
    - 确认没有引入 `agent` 作为后端服务名。
    - 确认没有把 PWA、auth、Project、Session Runtime、Files/Git 或 E2E 场景误放入当前 change。
  - 依据：`plan.md` 的“不做事项”和“风险与验证重点”；`design/architecture.md` 的依赖方向；两个 specs 的边界要求。
  - 必读上下文：`plan.md`、`design/architecture.md`、`design/risks.md`、`specs/workspace-foundation/spec.md`、`specs/service-access-boundary/spec.md`。
  - 修改范围：必要的轻微修正；实现记录或 tasks 勾选说明。
  - 依赖：3.1、3.2、3.3。
  - 并行：否（最终收口任务，必须等待实现和验证完成）。
  - 实现记录：边界检查通过：`packages/shared` 仅含类型/DTO，无 web/api/runtime 依赖；`api` 未托管 `web`；`web` 仅通过 `/api` client 访问后端；未引入服务名 `agent`；未实现 PWA/auth/Project/Session/Files/Git/E2E 场景。根 `typecheck`、`build`、`test` 全部通过。

## 依赖图

- 1.1 → 1.2 → 2.1 → 2.2 → 2.3 → 3.1 → 4.1
- 2.1 + 2.2 → 3.2 → 4.1
- 2.1 + 2.2 → 3.3 → 4.1

## 可并行任务

- 3.3 可在 2.1 和 2.2 完成后与 3.1/3.2 并行，因为它主要修改部署说明文档。
- 3.2 可在 api/web 可启动后与 3.1 部分并行，但如果需要调整根脚本或 proxy 配置，应与 3.1 串行避免冲突。

## 阻塞项

- （无）
