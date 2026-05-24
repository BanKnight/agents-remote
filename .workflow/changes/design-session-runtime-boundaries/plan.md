# plan

## Change 目标

- 建立 Agent Session 与 Terminal Session 的第一轮 runtime 边界：共享 Project scope、runtime metadata、internal session id、HTTP/WS 入口、reconnect 和 close 语义。
- 完成后应解锁 `implement-agent-provider-experience`、`implement-mobile-session-interaction` 和 `setup-e2e-quality-baseline`，其中 Terminal Session 可作为第一条真实端到端链路。

## 局部 big picture

- 当前 `web` 只有 Project console shell 和占位，`api` 只有 auth、Project API 和 echo WebSocket；本 change 是把“占位入口”推进到“可实现 runtime 语义”的边界层。
- 本 change 不追求完整 Claude/Codex provider-native UI，而是先建立不会泄漏 `tmux/xterm/WebSocket` 细节的控制面形状。
- Terminal Session 是最确定的真实链路；Agent Session 第一轮可以复用 CLI passthrough，但必须保留 provider、displayName、状态和后续 adapter seam。

## 执行策略

- 先在 `packages/shared` 补齐跨边界 DTO、状态和错误码，保证 `web`/`api` 对 session contract 一致。
- 再在 `api` 内建立 runtime metadata 和 registry 深模块，复用 `runtime-dir` 与 Project safe path resolver，但不把文件系统/tmux 逻辑下放到 shared。
- 先接 HTTP list/create/detail/close，再接 WebSocket stream envelope；Terminal Session 真实 runtime 是核心实现目标，Agent Session 初期只实现 provider-aware 入口和 runtime adapter seam。
- 最后把 Project summary session counts 接入 registry，并用 tests 覆盖身份分层、stale cleanup、close/reconnect、auth 和路径边界。

## 任务顺序依据

- DTO/error code 是后续 api/web/tests 的共同基础，必须最先完成。
- Registry/metadata 决定 session id、tmux name、安全 Project cwd 和 stale cleanup，是 HTTP/WS 的前置。
- HTTP API 比 WebSocket 更容易单测，应先完成资源语义，再实现 stream attach/input/resize。
- Web UI 只在 runtime API 可用后再替换占位；否则容易出现无法验证的 mock session。
- 浏览器和 tmux 验证最后执行，因为依赖 api/web/runtimes 全部接通。

## 额外上下文

- `docs/research/agent-access-options.md`：Agent provider 约束与 passthrough/adapter 边界。
- `docs/design/agent-session-model.md`：AgentSession、TerminalSession、transportSession、conversationThread、turn/run 长期概念分离。
- `docs/architecture/agent-runtime.md`：Agent Runtime、Provider Adapter、TerminalSession runtime 边界。
- `docs/architecture/monorepo-service-boundaries.md`：`web/api/shared` 职责和 `/api` HTTP/WS 同域路径。
- `docs/architecture/project-boundary.md`：Project safe path resolver 和 project-scoped cwd 规则。
- `docs/specs/service-access-boundary/spec.md`：WebSocket 也必须位于 `/api` 前缀。
- `docs/specs/personal-app-config/spec.md`：runtime dir 默认 `/run/agents-remote` 与 `AGENTS_REMOTE_RUN_DIR` 边界。
- 代码入口：`packages/shared/src/index.ts`、`api/src/index.ts`、`api/src/runtime-dir.ts`、`api/src/project-paths.ts`、`api/src/projects.ts`、`api/src/ws-auth.ts`、`web/src/api/client.ts`、`web/src/routes/ProjectConsoleRoute.tsx`、`web/src/routes/console-model.ts`、`web/vite.config.ts`。
- 验证工具：长驻 api/web dev 服务使用 `tmux`；浏览器 E2E 使用 `agent-browser`。

## 依赖与阻塞

### 阶段依赖

- specs 与 design 已完成；当前无阶段阻塞。
- 后续 `implement-agent-provider-experience` 依赖本 change 的 Agent Session provider-aware API/metadata seam，但不要求本 change 完成 provider-native thread/turn。
- 后续 `setup-e2e-quality-baseline` 依赖本 change 至少有可运行的 Terminal Session smoke 链路。

### 任务依赖

- 1.1 shared contract → 1.2 registry/metadata → 2.1 HTTP API → 2.2 Terminal runtime/WS → 2.3 web integration → 3.x tests/E2E → 4.1 workflow收口。
- Agent provider entry 依赖 shared contract 和 registry，但可以在 Terminal runtime 后以最小 adapter seam 完成。
- Project summary counts 依赖 registry 列表能力。

### 外部依赖

- 本机需要可执行 `tmux` 和普通 shell，用于 Terminal Session 实现与验证。
- Claude/Codex CLI 安装/登录不是本 change 的验证前提；Agent provider 创建可用可控命令或失败语义验证。
- 不新增 npm 依赖；如实现发现必须新增 xterm/react 相关依赖，需回到 design/technology-research。

## 并行机会

- shared DTO tests 与 api registry tests 在文件层可连续实现，但 registry 需要 DTO 先稳定。
- web client helper 和 route UI 可在 HTTP API contract 完成后与 WS stream 后端实现并行，但当前单 Agent 执行时建议顺序推进，避免 contract 漂移。
- 文档/verify 收口必须在实现和测试后执行，不并行。

## 风险与验证重点

- 验证 session id、displayName、provider id、tmux name 不混用；URL/API 只使用 internal session id。
- 验证 Project 名称含空格/中文时，runtime cwd 安全解析，tmux name 使用安全内部 key，UI 仍显示原始名称。
- 验证 WebSocket 断开不关闭 runtime，重连能回到仍存在的 session。
- 验证 close 会真正终止 tmux session/进程，并且重复 close 不误杀其他 runtime。
- 验证手动 kill tmux 后列表清理或详情返回 ended/missing。
- 验证未认证 HTTP/WS 都被拒绝。

## 不做事项

- 不做 provider-native Codex app-server / Claude Agent SDK / Claude Code remote-control 的正式 adapter。
- 不做跨服务器重启恢复、完整终端日志持久化、终端搜索过滤、多客户端 writer/observer 策略。
- 不做 Files/Git capability 或 Agent tool/permission event envelope。
- 不做 provider CLI 安装、登录、模型配置管理。
- 不新增 PWA/service worker 或前端依赖。
