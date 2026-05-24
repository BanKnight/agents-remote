# tasks

## 执行顺序

1. 先定义 shared DTO/error code 和 api runtime registry/metadata 深模块，固定跨边界 contract 和身份映射。
2. 再接入 HTTP API 与 Project summary counts，形成可单测的资源语义。
3. 再实现 Terminal Session 的真实 tmux/WebSocket stream 链路，并为 Agent Session 保留 provider-aware passthrough seam。
4. 再更新 web client 和 Project console，展示真实 Agent/Terminal session 列表、详情入口、状态、close/reconnect 语义。
5. 最后执行自动化质量命令、tmux + agent-browser E2E、verify evidence 和 workflow 收口。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 补齐 shared session contract
  - 验收标准：`packages/shared` 定义 Agent/Terminal Session DTO、list/create/detail/close response、stream envelope 类型和必要 session error code；Agent DTO 含 provider，Terminal DTO 不含 provider；现有 Project DTO 兼容。
  - 依据：`specs/session-runtime/spec.md`；`design/api.md`；`design/business-rules.md`；`plan.md`。
  - 必读上下文：`packages/shared/src/index.ts`、`docs/architecture/monorepo-service-boundaries.md`、`docs/design/agent-session-model.md`。
  - 修改范围：`packages/shared/src/index.ts`、`packages/shared/src/index.test.ts`。
  - 依赖：无。
  - 并行：否（阻塞 API/web contract）。

- [x] 1.2 实现 api runtime metadata 与 SessionRegistry
  - 验收标准：`api` 内有 registry 模块管理 internal session id、Project scope、type/provider/displayName/status、safe tmux name、runtime dir metadata；支持按 Project/type list、get、create metadata、mark/cleanup missing、close 后移除；不把 runtime 逻辑放入 shared。
  - 依据：`design/architecture.md`；`design/data.md`；`design/business-rules.md`；`docs/specs/personal-app-config/spec.md`。
  - 必读上下文：`api/src/runtime-dir.ts`、`api/src/project-paths.ts`、`api/src/projects.ts`、`docs/architecture/project-boundary.md`。
  - 修改范围：新增或修改 `api/src/session-*` / `api/src/runtime-*` 模块及测试。
  - 依赖：1.1。
  - 并行：否（阻塞 HTTP/WS/runtime）。

### 2. 核心实现任务

- [x] 2.1 接入 Project-scoped session HTTP API 和 Project summary counts
  - 验收标准：`api` 提供 Agent/Terminal list/create/detail/close HTTP API；所有路径受 auth guard；Project safe path resolver 决定 cwd；Project list/detail 的 session counts 来自 registry；错误映射覆盖 unauthenticated、project invalid、session missing、runtime missing、provider unavailable、state conflict。
  - 依据：`design/api.md`；`design/error-handling.md`；`specs/session-runtime/spec.md`。
  - 必读上下文：`api/src/index.ts`、`api/src/http-auth.ts`、`api/src/projects.ts`、`api/src/index.test.ts`。
  - 修改范围：`api/src/index.ts`、`api/src/projects.ts`、session route modules/tests。
  - 依赖：1.2。
  - 并行：否（WS 和 web 依赖 HTTP contract）。

- [x] 2.2 实现 Terminal Session tmux runtime 与 WebSocket stream
  - 验收标准：Terminal Session create 启动 project-scoped tmux/shell runtime；stream attach 返回 snapshot/output/status/ended/error envelope，支持 input 和 resize；WebSocket 断开不关闭 runtime；重连仍可 attach；close 终止 tmux；手动 kill tmux 后表现为 missing/ended。
  - 依据：`design/architecture.md`；`design/api.md`；`design/error-handling.md`；`design/risks.md`。
  - 必读上下文：`api/src/index.ts` websocket handler、`api/src/ws-auth.ts`、`web/vite.config.ts`、`docs/specs/service-access-boundary/spec.md`。
  - 修改范围：`api/src/index.ts` websocket handling、Terminal runtime modules/tests、必要的 stream tests。
  - 依赖：2.1。
  - 并行：否（真实 E2E 主链路）。

- [x] 2.3 接入 Agent Session provider-aware passthrough seam
  - 验收标准：Agent Session create 接受 `claude`/`codex` provider，metadata/DTO/status 区分 Agent 与 Terminal；provider unavailable 有明确错误；内部可复用 terminal passthrough/runtime seam，但 API 不暴露 tmux name 或 provider-native id。
  - 依据：`design/product.md`；`design/architecture.md`；`design/api.md`；`docs/research/agent-access-options.md`。
  - 必读上下文：`docs/architecture/agent-runtime.md`、`docs/design/agent-session-model.md`、`api/src/session-*`（由 1.2/2.1 创建）。
  - 修改范围：Agent runtime/route modules/tests；必要时复用 Terminal runtime adapter seam。
  - 依赖：2.1；建议在 2.2 后做，以复用已验证 stream/runtime seam。
  - 并行：部分可并行于 2.2 的纯 metadata/HTTP tests，但不建议并行修改同一 session modules。

- [x] 2.4 更新 web session API client 与 Project console session UI
  - 验收标准：web client 增加 Agent/Terminal list/create/detail/close 和 stream URL helper；Project console 不再只显示 runtime placeholder，能展示真实 Agent/Terminal session summary、创建入口、详情/close affordance 和 disconnected/ended 文案；仍保持 Agent 默认焦点和移动端布局。
  - 依据：`design/product.md`；`design/api.md`；`docs/design/console-shell.md`；`docs/design/frontend-stack.md`。
  - 必读上下文：`web/src/api/client.ts`、`web/src/routes/ProjectConsoleRoute.tsx`、`web/src/routes/console-model.ts`、`web/src/state/ui.ts`。
  - 修改范围：web API client、Project console route/model/state/tests；必要时新增 session detail route。
  - 依赖：2.1；详情 stream UI 依赖 2.2。
  - 并行：否（依赖 API/WS contract 稳定）。

### 3. 集成与验证任务

- [x] 3.1 补齐自动化测试覆盖
  - 验收标准：shared/api/web tests 覆盖 session DTO、registry metadata、safe tmux naming、Project-scoped HTTP API、auth guard、session counts、runtime missing cleanup、close semantics、web client helpers 和 console model 行为。
  - 依据：`plan.md` 风险与验证重点；`design/error-handling.md`；`design/risks.md`。
  - 必读上下文：现有 `*.test.ts` 文件、实现后的 session modules。
  - 修改范围：`packages/shared/src/*.test.ts`、`api/src/*.test.ts`、`web/src/**/*.test.ts`。
  - 依赖：2.4。
  - 并行：可与 2.x 局部穿插，但最终完成依赖所有核心实现。

- [x] 3.2 运行 workspace 质量命令
  - 验收标准：`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build` 通过；失败必须修复后才能勾选。
  - 依据：项目长期开发准则和现有 verify 模式。
  - 必读上下文：`package.json` scripts。
  - 修改范围：必要的格式/类型/测试修复。
  - 依赖：3.1。
  - 并行：否。

- [x] 3.3 使用 tmux 和 agent-browser 验证真实 Terminal Session 链路
  - 验收标准：用 tmux 管理 api/web dev 服务；用 `agent-browser` 验证登录、Project、创建 Terminal Session、进入详情、看到 shell 输出、发送输入、刷新/重连、关闭后 session 消失；截图或日志保存到 `artifacts/`。
  - 依据：用户反馈要求使用 tmux 和 agent-browser；`design/risks.md` 验证建议。
  - 必读上下文：`docs/project.md` tmux 开发准则、实现后的 web routes/API。
  - 修改范围：`.workflow/changes/design-session-runtime-boundaries/artifacts/`；必要的 bug fix。
  - 依赖：3.2。
  - 并行：否（真实集成验证）。

### 4. 收口任务

- [x] 4.1 更新实现证据和 workflow 进度
  - 验收标准：所有任务完成后，`tasks.md` 勾选状态与实际一致；`progress.md` 记录 implementation 已完成、当前阶段为 `待验证`；本 change 的实现证据、测试命令和 browser/tmux artifacts 路径可追踪。
  - 依据：`plan.md`；workflow governance。
  - 必读上下文：本文件、`progress.md`、测试/E2E 输出。
  - 修改范围：`tasks.md`、`progress.md`、必要 artifacts。
  - 依赖：3.3。
  - 并行：否。

## 依赖图

- 1.1 → 1.2 → 2.1 → 2.2 → 2.3 → 2.4 → 3.1 → 3.2 → 3.3 → 4.1
- 2.3 可在 2.2 后最小实现；如实现中发现 provider passthrough 与 Terminal runtime 强耦合，应先完成 2.2。

## 可并行任务

- 3.1 的测试补充可在对应 2.x 任务完成后局部穿插。
- 2.3 的 Agent metadata/API tests 可在 2.2 的 tmux stream 实现之外局部推进，但会修改相同 session modules，当前单 Agent 执行不建议并行。

## 阻塞项

- （无）
