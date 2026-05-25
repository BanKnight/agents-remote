# tasks

## 执行顺序

1. 先接入 Playwright dev dependency 与最小配置，确保 E2E harness 有稳定入口和 artifacts 设置。
2. 再实现 Bun orchestration runner，负责 isolated env、api/web services、logs 和 cleanup。
3. 然后编写 Terminal Session smoke spec，并通过 root script 暴露 `bun run e2e`。
4. 最后运行 targeted E2E、全量质量门禁，保存 artifacts 并更新 workflow 进度。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 接入 Playwright Test 最小配置
  - 验收标准：`@playwright/test` 作为 dev dependency 写入 root manifest/lockfile；存在 Playwright config，配置 testDir、baseURL 或 env 注入、Chromium 项目、failure screenshot/trace/test-results；不影响现有 `bun run test`。
  - 依据：`plan.md`；`design/architecture.md` 的技术选型与依赖安全；`specs/e2e-quality-baseline/spec.md` 的可持续质量入口要求。
  - 必读上下文：`package.json`、`bun.lock`、`design/architecture.md`、`design/error-handling.md`。
  - 修改范围：root `package.json`、`bun.lock`、`playwright.config.ts` 或等价配置文件。
  - 依赖：无
  - 并行：否（阻塞 E2E runner 和 smoke spec）

- [x] 1.2 实现 E2E 环境编排 runner
  - 验收标准：存在 Bun/TypeScript runner 可创建临时 `PROJECTS_ROOT` 与 runtime dir、测试 Project、测试密码、独立 api/web 端口；启动 api/web dev services；等待 ready；保存 api/web logs；执行 Playwright；finally 清理子进程和临时资源。
  - 依据：`plan.md`；`design/architecture.md` 的 Bun orchestration；`design/error-handling.md` 的失败与清理规则。
  - 必读上下文：`api/src/index.ts`、`web/vite.config.ts`、`docs/specs/private-access-auth/spec.md`、`docs/specs/project-safe-paths/spec.md`（如需确认 Project 准备边界）。
  - 修改范围：新增 `scripts/` 或 `e2e/` 下 runner 文件，按需新增 gitignored artifacts 目录约定。
  - 依赖：1.1
  - 并行：否（阻塞真实 smoke 执行）

### 2. 核心实现任务

- [x] 2.1 编写 Terminal Session E2E smoke spec
  - 验收标准：Playwright spec 覆盖登录、进入 Project、创建 Terminal Session、打开 detail、等待 connected、发送确定性命令并断言输出出现；失败时 Playwright 可输出 screenshot/trace；不依赖真实 Claude/Codex CLI。
  - 依据：`specs/e2e-quality-baseline/spec.md` 的 E2E path 和 real dependency requirements；`docs/specs/session-runtime/spec.md`；`docs/specs/mobile-session-interaction/spec.md`。
  - 必读上下文：`web/src/routes/HomeRoute.tsx`、`web/src/routes/ProjectConsoleRoute.tsx`、`web/src/routes/SessionDetailRoute.tsx`、`web/src/api/client.ts`。
  - 修改范围：新增 `e2e/*.spec.ts` 或同等测试文件，必要时新增轻量 test helper。
  - 依赖：1.1、1.2
  - 并行：否（依赖 runner 与 UI selectors）

- [x] 2.2 接入 root E2E 命令和基础说明
  - 验收标准：root `package.json` 暴露可重复运行的 `e2e` 命令；命令成功/失败状态码正确；如需要浏览器安装命令，在脚本输出或运行说明中可定位；不创建独立长期 docs，除非 verify/distill 阶段决定沉淀。
  - 依据：`plan.md` 的可持续质量入口；`design/error-handling.md` 的用户可见反馈。
  - 必读上下文：`package.json`、1.2 runner、2.1 smoke spec。
  - 修改范围：root `package.json`、runner 文件，按需 `.gitignore`。
  - 依赖：2.1
  - 并行：否（需要 smoke spec 稳定）

### 3. 集成与验证任务

- [x] 3.1 运行 E2E baseline 并保存证据
  - 验收标准：`bun run e2e` 通过；Terminal Session 使用真实 tmux/shell/WebSocket；输出包含确定性命令结果；必要 artifacts/logs 保存到 `.workflow/changes/setup-e2e-quality-baseline/artifacts/` 或在 verify 中记录 tool 输出位置。
  - 依据：`specs/e2e-quality-baseline/spec.md` 的 real dependency、terminal IO 和 failure evidence requirements。
  - 必读上下文：`design/error-handling.md`、runner 输出、Playwright report/test-results。
  - 修改范围：`.workflow/changes/setup-e2e-quality-baseline/artifacts/`，必要的小修正。
  - 依赖：2.2
  - 并行：否

- [x] 3.2 运行全量质量门禁
  - 验收标准：`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build` 通过；如 Playwright config 或 e2e runner 影响 type/lint/format，修正后重跑。
  - 依据：`plan.md` 的验证重点。
  - 必读上下文：失败输出对应文件。
  - 修改范围：必要的格式、类型、lint 或测试修正。
  - 依赖：3.1
  - 并行：否

- [x] 3.3 更新 workflow 实现进度
  - 验收标准：所有实现任务完成后，`tasks.md` 全部勾选；`progress.md` implementation 标记为已完成并进入 `待验证`，进展记录包含 E2E 命令、quality gate 和 artifacts 摘要。
  - 依据：`implement-change` 规则；`progress.md` 阶段流转。
  - 必读上下文：`progress.md`、`tasks.md`。
  - 修改范围：`.workflow/changes/setup-e2e-quality-baseline/tasks.md`、`.workflow/changes/setup-e2e-quality-baseline/progress.md`。
  - 依赖：3.2
  - 并行：否

## 依赖图

- 1.1 → 1.2 → 2.1 → 2.2 → 3.1 → 3.2 → 3.3

## 可并行任务

- （无；本 change 的 dependency/config、runner、smoke spec 和验证结果强依赖顺序执行。）

## 阻塞项

- （无）
