# tasks

## 执行顺序

1. 先建立 provider profile 基础，让 provider label/command/history capability 标记有单一内部来源。
2. 再实现 AgentRuntime 并收窄 TmuxRuntime 的 command runner 职责，保持 SessionRegistry metadata/control-plane 语义不变。
3. 随后更新 API runtime 组合与测试，证明 HTTP contract 不变、provider command 差异只存在于 AgentRuntime/profile seam。
4. 最后运行全量质量门禁并更新 workflow 进度证据。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 新增内部 Agent provider profile
  - 验收标准：存在内部 provider profile 模块，覆盖 `claude` 与 `codex` 的 provider id、label、默认 CLI command、display name prefix 和 history capability 标记；该模块不修改 shared DTO，也不新增公开 API。
  - 依据：`plan.md`；`specs/agent-provider-experience/spec.md` 的 “Agent Runtime owns provider adaptation”；`design/architecture.md` 的 `ProviderProfile` 决策。
  - 必读上下文：`design/architecture.md`、`design/api.md`、`docs/architecture/agent-runtime.md`。
  - 修改范围：新增或更新 `api/src/agent-provider-profiles.ts`，按需更新引用 profile 的 API 内部文件。
  - 依赖：无
  - 并行：否（Provider profile 是 AgentRuntime 和 displayName 收敛的基础）

### 2. 核心实现任务

- [x] 2.1 实现薄 AgentRuntime provider seam
  - 验收标准：AgentRuntime 根据 metadata.provider 查找 provider profile，向 command runtime 传入已解析 CLI command；缺失/不可启动时映射为 `SESSION_PROVIDER_UNAVAILABLE`，且不暴露完整命令、token、凭证或 provider-native metadata。
  - 依据：`plan.md`；`design/architecture.md` 的 `AgentRuntime` / `ProviderAdapter` 边界；`design/api.md` 的错误语义。
  - 必读上下文：`api/src/session-registry.ts`、`api/src/tmux-runtime.ts`、`docs/architecture/session-runtime.md`。
  - 修改范围：新增 `api/src/agent-runtime.ts`，按需增加单元测试文件。
  - 依赖：1.1
  - 并行：否（阻塞 TmuxRuntime 职责收窄和 API runtime composition）

- [x] 2.2 将 TmuxRuntime 收窄为 command-oriented runtime adapter
  - 验收标准：`TmuxRuntime` 不再导入 `AgentProvider`，不再包含 Claude/Codex provider command 选择逻辑；它保留 terminal shell 启动、tmux lifecycle/IO，并暴露内部 API 接收已解析 command 启动 tmux session。
  - 依据：`plan.md`；`design/architecture.md` 的 “TmuxRuntime 只负责 tmux lifecycle/IO” 决策。
  - 必读上下文：`api/src/tmux-runtime.ts`、`api/src/session-registry.ts`。
  - 修改范围：`api/src/tmux-runtime.ts`，按需更新类型引用。
  - 依赖：2.1
  - 并行：否（与 API runtime composition 修改同一启动链路）

- [x] 2.3 让 SessionRegistry 继续只负责 metadata 与统一 Session 语义
  - 验收标准：SessionRegistry 仍创建/list/detail/close AgentSession 与 TerminalSession metadata；Agent displayName 使用 provider profile label/prefix 或保持等价输出；SessionRegistry 不持有 provider CLI command，不实现 history/resume。
  - 依据：`plan.md`；`specs/agent-provider-experience/spec.md` 的 provider-aware list/detail；`design/architecture.md` 的 `SessionRegistry` 边界。
  - 必读上下文：`api/src/session-registry.ts`、`api/src/session-registry.test.ts`、`docs/design/session-runtime-boundaries.md`。
  - 修改范围：`api/src/session-registry.ts`、`api/src/session-registry.test.ts`。
  - 依赖：1.1
  - 并行：可与 2.2 之后的测试补充并行，但实现时建议顺序执行，避免 displayName/profile 接口返工。

- [x] 2.4 更新 API runtime composition
  - 验收标准：`startApi()` 组合 `TmuxRuntime` 与 `AgentRuntime` 后注入 `SessionRegistry`；`SessionStreamController` 继续使用可 capture/write/resize/close 的 tmux runtime；Agent Session HTTP create/list/detail/close 行为与路径不变。
  - 依据：`plan.md`；`design/api.md` 的兼容性要求；`docs/architecture/session-runtime.md` 的 API/runtime 结构。
  - 必读上下文：`api/src/index.ts`、`api/src/session-routes.ts`、`api/src/session-stream.ts`。
  - 修改范围：`api/src/index.ts`，按需更新 runtime 类型。
  - 依赖：2.1、2.2
  - 并行：否（依赖核心 runtime seam 完成）

### 3. 集成与验证任务

- [x] 3.1 补齐 provider runtime 回归测试
  - 验收标准：测试覆盖 Claude/Codex profile command 解析、AgentRuntime provider unavailable 映射、SessionRegistry provider/displayName metadata 保持、Agent Session HTTP contract 不变；不存在把 history summary 混入 active Agent Session list 的测试或实现。
  - 依据：`plan.md`；`specs/agent-provider-experience/spec.md` 全部 requirements；`design/api.md` 的错误与兼容性语义。
  - 必读上下文：`api/src/session-registry.test.ts`、`api/src/index.test.ts`、新增 AgentRuntime 测试文件。
  - 修改范围：`api/src/*test.ts`，按需新增 `api/src/agent-runtime.test.ts`、`api/src/agent-provider-profiles.test.ts`。
  - 依赖：2.1、2.2、2.3、2.4
  - 并行：是（不同测试文件可并行补充，但需在核心实现完成后执行）

- [x] 3.2 运行全量质量门禁
  - 验收标准：`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build` 通过；如需格式化，先修正再重跑相关检查。
  - 依据：`plan.md` 的风险与验证重点；项目现有质量基线。
  - 必读上下文：`package.json` scripts（如命令失败再读取）。
  - 修改范围：必要的格式/类型/测试修正；不扩大功能范围。
  - 依赖：3.1
  - 并行：否（必须在实现和测试完成后执行）

- [x] 3.3 更新 workflow 实现进度
  - 验收标准：所有实现任务完成后，`tasks.md` 勾选完成；`progress.md` 的 implementation 标记为已完成并进入 `待验证`，进展记录包含本轮实现摘要和质量门禁结果。
  - 依据：`plan.md`；`progress.md` 阶段流转；`implement-change` 规则。
  - 必读上下文：`progress.md`、`tasks.md`。
  - 修改范围：`.workflow/changes/implement-agent-provider-experience/tasks.md`、`.workflow/changes/implement-agent-provider-experience/progress.md`。
  - 依赖：3.2
  - 并行：否（收尾任务）

## 依赖图

- 1.1 → 2.1 → 2.2 → 2.4 → 3.1 → 3.2 → 3.3
- 1.1 → 2.3 → 3.1

## 可并行任务

- 3.1 中不同测试文件的补充可并行处理，但必须等 2.1-2.4 核心实现稳定后执行。

## 阻塞项

- （无）
