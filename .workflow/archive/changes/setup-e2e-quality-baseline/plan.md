# plan

## Change 目标

- 建立第一条可持续的自动化 E2E baseline，覆盖登录、Project、Terminal Session 创建、Session detail、WebSocket/真实 tmux shell 输入输出。
- 完成后，后续改动登录、Project、Session Runtime 或 Session detail 时，可以通过同一 E2E 命令获得跨 `web + api + runtime` 的回归信号和失败 artifacts。

## 局部 big picture

- 本 change 是 `v0.3-session-runtime-quality` 的质量收口：前序 changes 已实现 Session Runtime、provider seam 和移动端 Session detail；本轮把已经用 tmux + browser 手动验证过的关键路径固化为 repo 内自动化质量入口。
- 它为后续 Files/Git 能力和 CI 接入提供测试基础，但本轮只聚焦最高价值 smoke path，避免 E2E 过早膨胀。
- 设计结论选择 Playwright Test + Bun orchestration：Playwright 驱动浏览器与 artifacts，Bun 准备临时环境和服务生命周期。

## 执行策略

- 先引入 Playwright dev dependency 与最小配置，固定测试目录、baseURL、failure screenshot/trace/report 输出和 Chromium smoke 项目。
- 再实现 Bun E2E 环境编排脚本：创建临时 `PROJECTS_ROOT` / runtime dir、测试 Project、独立端口、启动 api/web dev services、记录 logs、调用 Playwright、最后清理子进程和临时资源。
- 然后编写单条 Terminal Session smoke：登录、进入 Project、创建 Terminal Session、打开 detail、等待 connected、通过移动端辅助输入或页面输入发送确定性 shell 命令，并等待输出。
- 最后把 E2E 命令接入 root scripts，运行 targeted E2E 与全量质量门禁，保存 verify 所需 artifacts，并更新 workflow 状态。

## 任务顺序依据

- Playwright dependency/config 是测试文件和 runner 的前置条件，必须先完成。
- 环境编排脚本阻塞真实 E2E，因为 browser test 需要 isolated api/web services、env、ports 和 logs。
- Smoke spec 依赖可运行环境与稳定选择器/路径；写完后才能接入 root script 并实际运行。
- 验证必须在实现后执行：先跑 E2E，再跑 full quality gate，最后更新 workflow artifacts/progress。

## 额外上下文

- `docs/specs/private-access-auth/spec.md`：确认单密码登录和认证失败语义。
- `docs/specs/project-console-navigation/spec.md`：确认 Project list/console 入口行为。
- `docs/specs/session-runtime/spec.md`：确认 Terminal Session 创建、detail、WebSocket reconnect/input/close 语义。
- `docs/specs/mobile-session-interaction/spec.md`：确认 Session detail 输入层和可发送状态。
- `docs/design/session-runtime-boundaries.md`：确认 runtime vs transport 状态和 close/reconnect 边界。
- `docs/design/frontend-stack.md`：确认 Bun/Vite/TanStack/Tailwind 前端边界和质量入口。
- 代码入口：`package.json`、`bun.lock`、`api/src/index.ts`、`web/vite.config.ts`、`web/src/routes/HomeRoute.tsx`、`web/src/routes/ProjectConsoleRoute.tsx`、`web/src/routes/SessionDetailRoute.tsx`、`web/src/api/client.ts`。

## 依赖与阻塞

### 阶段依赖

- specs 已完成，明确 E2E baseline 的 WHAT。
- design 已完成，明确 Playwright Test + Bun orchestration 的 HOW。
- 当前无阻塞，可进入实现。

### 任务依赖

- 1.1 Playwright dependency/config 阻塞 1.2 环境 runner 和 2.1 smoke spec。
- 1.2 E2E environment runner 阻塞 2.1 smoke spec 实际运行。
- 2.1 Terminal smoke spec 阻塞 2.2 root script 接入和 3.1 E2E 验证。
- 3.1 E2E 验证通过后，再运行 3.2 full quality gate 和 3.3 workflow 收口。

### 外部依赖

- 需要新增 dev dependency：`@playwright/test`；安装时必须确认解析版本满足 7 天规则，当前核对的 `1.60.0` 发布于 2026-05-11，满足 2026-05-25 的 7 天规则。
- 本地/CI 环境需要可运行 `tmux` 和 shell；缺失时 E2E 不应静默通过。
- Playwright Chromium 浏览器可能需要安装；本 change 可记录命令和失败提示，不强行改 CI pipeline。

## 并行机会

- 不建议并行；dependency/config、runner、smoke spec 和 scripts 都会互相依赖，并可能修改同一 root 配置区域。
- 文档/verify 更新必须等实际 E2E 与 quality gate 结果出来后再做。

## 风险与验证重点

- 风险：新增 Playwright dependency 带来浏览器安装成本；验证时只启用最小 Chromium smoke，并记录 7 天规则和安装路径。
- 风险：真实 tmux runtime 导致 E2E flake；使用 isolated temp dirs、确定性 command、明确 timeout 和 logs 降低定位成本。
- 风险：E2E runner 留下进程或 tmux session；实现必须在 finally 中清理子进程和临时资源。
- 验证重点：`bun run e2e` 通过并保存/引用 artifacts；`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build` 继续通过；失败路径至少能产出 screenshot/log/trace。

## 不做事项

- 不接入完整 CI workflow 或 artifact upload pipeline。
- 不覆盖真实 Claude/Codex CLI Agent E2E。
- 不建立多浏览器、多 viewport 或 visual regression 矩阵。
- 不修改生产 HTTP/WS contract、runtime metadata 或 UI 产品行为。
- 不把手动 mobile/PWA 真机验证纳入本 change 的自动化通过条件。
