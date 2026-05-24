# plan

## Change 目标

- 在不改变现有 Agent Session HTTP/DTO/stream contract 的前提下，把 Claude/Codex provider 启动差异从通用 tmux runtime 中抽出，落到显式的 AgentRuntime/provider profile 边界。
- 完成后，当前 Claude/Codex 新建入口、列表、详情、关闭语义保持不变，但后续 history/resume/provider adapter 能在 Agent Runtime 内继续演进。

## 局部 big picture

- 本 change 位于 `v0.3-session-runtime-quality` 中，承接已完成的 Session Runtime 边界，把“Agent Session 是统一控制面语义、provider 差异由 Agent Runtime 吸收”的设计落到代码结构。
- 上游 `design-session-runtime-boundaries` 已提供 Project-scoped session metadata、HTTP/WS stream、tmux runtime 与 Agent/Terminal 分离；本 change 不重做这些能力，只校正 provider seam。
- 下游 `implement-mobile-session-interaction` 与 E2E baseline 应继续依赖稳定的 Agent Session API，而不是依赖 Claude/Codex 命令细节。

## 执行策略

- 先建立内部 provider profile 与薄 AgentRuntime：profile 只描述 `claude` / `codex` 的 label、默认 CLI command、display name prefix 与后续 history capability 标记；AgentRuntime 负责 profile lookup、调用 command runtime、provider unavailable 映射。
- 再收窄 `TmuxRuntime` 职责：它保留 tmux lifecycle/IO 和 terminal shell 启动，只接受已解析 command，不再导入 `AgentProvider` 或保存 Claude/Codex 命令选择逻辑。
- 最后更新 API 组合与测试：`SessionRegistry` 仍负责 metadata/create/list/detail/close，启动 Agent 时通过注入的 AgentRuntime 进入 provider profile seam；HTTP contract 与 web UI 不做结构性改动。
- 本轮不实现 provider history/resume、provider availability probe、provider account/login 管理或 native event stream，只在 profile/type/test 中保留后续 adapter seam。

## 任务顺序依据

- Provider profile 是 AgentRuntime 和 displayName 规则的共同基础，必须先建立，避免后续实现把 provider label/command 分散到多个文件。
- `TmuxRuntime` 职责收窄会影响 API runtime composition，因此先完成底层 command runner 边界，再调整 `startApi()` 注入关系。
- 测试必须覆盖新边界后再更新 workflow 状态；质量门禁最后执行，避免在半完成结构上反复跑全量检查。

## 额外上下文

- `docs/project.md`：确认 Agent Runtime 是项目长期领域概念，provider 差异不应暴露到控制面。
- `docs/architecture/agent-runtime.md`：确认 Provider Adapter/Agent Runtime 长期边界和 provider-native id 内部化规则。
- `docs/design/agent-session-model.md`：确认 AgentSession 不等同于 provider thread/transcript/tmux session。
- `docs/design/session-runtime-boundaries.md`：确认 Agent/Terminal Session、transport、close/reconnect 与 provider visible status 规则。
- `docs/architecture/session-runtime.md`：确认当前 SessionRegistry/runtime metadata/TmuxRuntime/stream 的主线结构和 provider seam 演进点。
- 代码入口：`api/src/tmux-runtime.ts`、`api/src/session-registry.ts`、`api/src/index.ts`、`api/src/session-registry.test.ts`；按需新增 `api/src/agent-runtime.ts`、`api/src/agent-provider-profiles.ts` 及对应测试。

## 依赖与阻塞

### 阶段依赖

- specs 已完成，定义 provider choices、AgentRuntime 适配、provider-aware list/detail 与 history staged capability。
- design 已完成，定义 AgentRuntime/provider profile、TmuxRuntime command boundary 与不实现 history/resume 的范围。
- 当前无未解决阻塞，可进入实现。

### 任务依赖

- 1.1 provider profile 是 2.1 AgentRuntime、2.3 displayName 收敛和测试断言的基础。
- 2.1 AgentRuntime 依赖 1.1，并阻塞 2.2 `TmuxRuntime` 职责收窄和 2.4 API 组合。
- 2.2 与 2.4 都会触及 runtime 注入链路，必须在同一实现轮次保持一致。
- 3.1 测试更新依赖核心实现完成；3.2 质量门禁依赖测试更新完成。

### 外部依赖

- 不新增 npm 依赖。
- 仍假设服务器环境已安装并登录 `claude` / `codex` CLI；本 change 不管理安装、登录或模型配置。
- 不要求真实 Claude/Codex CLI E2E；provider command 选择和 error mapping 通过单元/集成测试覆盖。

## 并行机会

- 1.1 provider profile 与测试草稿可以独立思考，但实现上会被 AgentRuntime 和 SessionRegistry 同时引用，建议顺序执行以避免接口返工。
- 3.1 中的 AgentRuntime 单元测试和 SessionRegistry/API 回归测试可在核心实现稳定后并行补充；它们修改不同测试文件。
- `web` 预期不改；如果实现过程中发现 UI provider display 回归，再单独补 web 测试，不与 API runtime 重构并行。

## 风险与验证重点

- 风险：把 provider profile 暴露到 shared 或 HTTP API，破坏“内部实现 seam”决策；验证时检查 shared DTO/API 响应不变。
- 风险：`TmuxRuntime` 仍残留 `AgentProvider`/`providerCommand` 逻辑；验证时检查 tmux adapter 只接收 command。
- 风险：Agent 启动失败被错误映射为泛化 runtime error 或暴露命令细节；测试需要覆盖 unsupported/unavailable 映射到 `SESSION_PROVIDER_UNAVAILABLE`。
- 风险：displayName 规则与现有 UI/测试不兼容；测试需保持 Claude/Codex displayName 和 provider 字段可见语义。
- 验证重点：`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build`，并检查 Agent Session HTTP create/list/detail/close contract 未改变。

## 不做事项

- 不实现 Claude/Codex 历史会话读取、history API 或 provider-native resume。
- 不新增 `/providers`、provider availability probe、provider account/login API 或 capability discovery UI。
- 不改变 `AgentProvider = "claude" | "codex"` shared union、Agent Session DTO、HTTP 路径、status 枚举或 WebSocket stream envelope。
- 不引入数据库、event store、新 npm 依赖或长期 docs 沉淀；长期 docs 由 verify 后的 `distill-change` 处理。
