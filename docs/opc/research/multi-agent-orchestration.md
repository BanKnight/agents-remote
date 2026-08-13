# 多 Agent 编排调研：OPC 产品方向

> **状态**：调研完成，产品形态方案已综合（§14），待用户拍板。本文件是调研综合 + 决策锚点，应对上下文压缩用，压缩后应先读本文件 + memory `product-direction-opc-multi-agent.md` 恢复状态。
> **承接**：agent-access-options.md（单 agent 接入路线，本轮上升到多 agent 编排层）。
> **证据分级**：标注 ✅(源码/实测) / 🔍(deepwiki+tvly) / 🟡(推断) / ⏳(待调研)。
> **调研覆盖**：§10 角色 prompt 注入 ✅ / §11 CF 原生+综合大成 ✅ / §12 任务下发+看板 ✅ / §13 圆桌会议+长记忆 ✅（§7 全部完成）/ §15 Claude Tag 官方产品对照 ✅（2026-08-12 增补）。

## 1. 产品终极目标（用户定盘）

agents-remote 的产品目标是迎合用户的 **OPC（One-Person Company / 超级个体）**需求：一个人通过编排多个 AI agent 完成传统需要一个团队的工作量。

**演进阶段**：
- **当前**：用户深度介入开发过程——在网页上一个个手动起/管 Codex/Claude session，agent 之间孤立，用户是唯一协调者（**操作员**）。
- **下一步**：用户可以**操控多个 agent、调配多 agent**——让它们分工、协作、传递上下文，用户从操作员升级成**调度员/编排者**。

## 2. 用户产品心智模型（2026-08-11 对齐）

参照真实公司：**高管团商量大方向 → 下发任务给执行团队（开发/调研/各种职能）→ CEO（用户）追踪进度 + 可介入实现细节**。必然需要的功能：**规划 / 看板 / 定时任务 / 头脑风暴**。

**功能映射**：
- **规划** = 高管团产出（圆桌讨论 → 拆任务）
- **看板** = 追踪执行团队进度 ⏳
- **定时任务** = agent 在特定时间自主推进（heartbeat） ⏳
- **头脑风暴** = 高管团讨论模式（多 agent 同台 + 共享议题上下文）

**两个已对齐决策**：
1. **高管团 = 圆桌会议**（平等讨论，非层级）。修正了初步判断「编排 = Paperclip org chart」——高管团内部是圆桌而非树状。但「高管 → 执行团队」那一层仍存在层级（高管带团队下发任务）。
2. **第一步 = 角色 + 任务下发**（不是会议，不是看板）。先建高管/执行角色 + 「派任务」动作（delegation）。会议和看板是任务系统的消费场景，后续补。角色是身份，任务下发是动作——两者一起才是「编排」最小闭环。

**用户四点补充（最新，必须纳入）**：
1. **任务下发应考虑看板类**（参考 Multica）——委派不只是「派出去」，还要有看板视图追踪。
2. **圆桌会议可参考聊天房间形式**，但难点是**上下文，尤其是长记忆**。
3. **Buzz 和 cloudflare-os 是综合类大成**——做方案时要重点对照这两个的综合设计。
4. **上下文将满，要保存文档**，压缩后读 jsonL 恢复（本文件即为此而写）。

## 3. 参考项目架构（组织化协作路线，🔍 deepwiki 深读）

用户明确选的是**组织化协作**路线，**不是** Orca/Superset 的 worktree 并行路线。

### 3.1 Paperclip (`paperclipai/paperclip`) ✅ 控制面同构
Agent 当员工组「公司」：
- **org chart 树状层级**（CEO → manager → reports-to）、roles/capabilities/budget/adapter config。
- **Heartbeat 调度**（agent 不常驻，schedule/task/comment/approval 触发短窗口运行）。
- **一切通信走 task 系统**：delegation = 建任务分配、coordination = 评论、status = 更新字段；任务带完整 goal ancestry（祖先链）。
- **胖负载 vs 瘦 Ping**：任务触发时下发完整 context（fat），心跳只问「有活吗」（thin ping）。
- **用户 = Board**：设目标 / 审批 / 观察干预，**surface 问题不静默修**。
- **控制面 vs 执行面分离**，adapter spawn CLI（`claude_local` / `codex_local`）——与 agents-remote 现状**同构**。

### 3.2 Multica (`multica-ai/multica`) ✅ 看板路线
Agent 当 teammates，分配到 **GitHub issue**（unit of work）：
- **Squad**（leader agent + members）。
- Leader 读上下文 → `@`mention 成员触发新 task → 停止 → 被评论重新触发协调下一步。
- **local daemon** 自动探测 PATH 上的 CLI（Claude/Codex/Copilot），claim task 后 spawn 到**隔离 workspace**。
- 不常驻。
- **对本项目的启示**：unit of work = issue/卡片（看板视角）；leader 模式 = 高管带团队下发。

### 3.3 Buzz (`block/buzz`) ✅ 综合大成（用户点名）
规格 → 代码 pipeline：
- **Persona**（Orchestrator / Researcher / Planner / Implementer / Reviewer）+ Team。
- **ACP（Agent Communication Protocol）over Nostr relay**——`@mention` 发 Nostr event，**per-channel 队列**（至多一个 in-flight）。
- **buzz-acp harness** spawn agent 子进程（1-32），runtime 字段指定 `buzz-agent` / `claude` / `codex` / `goose`，BYOH。
- **共享 state**：`~/.buzz` nest（RESEARCH / PLANS / WORK_LOGS / REPOS）+ **Nostr relay 当 single source of truth**。
- **Workflow approval gates**（审批门控）。
- **对本项目的启示**：persona 模型 = 角色；per-channel 队列 = 串行化避免冲突；共享 state nest = 文件系统承载协作产物；approval gate 与本项目 `permissionMode=plan` 同源。

### 3.4 Avernet (`inclusionAI/Avernet`) ✅ dumb router 哲学
分布式 agent 协调平台（live / connect / coordinate / execute / evolve）：
- **BCS（Bot Coordination Service, Rust）** = dumb router，「Dumb Router, Bots as Smart Agents」——BCS 只做 message routing（broadcast vs @mention），agent 自己根据注入 context 决定行为。
- **Engine Adapter**（Python/FastAPI）统一 WebSocket + HTTP surface，适配 Claude Code（经 claude_code_gateway + claude-agent-sdk）/ OpenClaw 等。
- **evolve = Shared Intelligence**（context fusion / org memory / orchestration，**Planned 未实现**）。
- **对本项目的启示**：编排层应保持最小契约（dumb），智能在 agent；这与 Paperclip「智能在 agent」一致，是落地哲学。

### 3.5 Orca / Superset（对照，未选）
- 代表 **worktree 并行路线**（每个 agent 一个 git worktree，并行跑同任务不同方案）。
- 用户明确未选，仅作对照参考。
- **事实订正（2026-08-12，见 `pm-superset.md`）**：原记「`superset-sh/orca`」不存在——Superset（`superset-sh/superset`）仓库与 docs 全库无 Orca 提及。Orca 是独立项目 `stablyai/orca`（Stably AI，MIT，42.9k stars，2026-03 创建）。两者是同一赛道（agent workspace / ADE）的**竞争产品**，哲学同构（都属 worktree 并行路线）但商业关系互不隶属，非同源继承。

### 3.6 三件套共性（组织化协作核心）
1. Agent 有**角色/身份**抽象（员工 / teammate / persona），不是裸 session。
2. Agent 间通信有**统一媒介**（task 系统 / `@mention` + Nostr / dumb router）。
3. 用户在**高层介入**（Board 设目标审批 / 分配 issue / approval gate），不直接操作每个 agent 的每步。

## 4. Cloudflare 平台调研（🔍 tvly + deepwiki）

用户希望项目最终完全部署到 CF（非硬性要求，但最好可以）。

### 4.1 cloudflare-os (`cloudflare/cloudflare-os`)
运行在 Workers / workerd 上的 AI 工作区：
- **Agent / Gadget**（通过动态 Worker 切面 + null-origin iframe 沙箱化，无网络，仅绑定通信）/ **Blueprint**（可共享模板，KV 存元数据 + R2 存内容）。
- **Gatekeeper 能力模型**（三层：供应商 / 用户 / 会话）。
- **模拟 + 批量审批模式**。
- 通过共享工作区间接进行多 agent 协作。
- 用户点名「综合类大成」。

### 4.2 Cloudflare Computer (`@cloudflare/computer`, 2026-08 预览)
- **DO 内持久 SQLite 虚拟 FS 工作区** + 三个可插拔后端（container / isolate-shell / isolate-JS）。
- **文件 / 执行解耦**，每个工作区约 10GB。

### 4.3 Agents Week 2026
- **Agent 访问模型**（身份代理）/ **Wallets**（账户 + 虚拟，x402 协议，cloudflare.pay）/ **Kitesurf**（agent 浏览器）/ **WebMCP**（浏览器内 MCP）/ **Workflows V2**（持久执行引擎）/ **项目 Think**（下一代 Agents SDK）/ **Agent Memory**（内测）/ **Artifacts**（内测，兼容 Git）。

### 4.4 全上 CF 的硬障碍 🟡
- Workers **不能 spawn CLI**、**无 tmux**、**无本地 fs / PTY**。
- 四种部署形态：
  - **A（纯 CF）**：硬障碍，agent 执行面无处放。
  - **B（hybrid：CF 控制面 + 本地执行）**：务实最低成本，**几乎是你现状的延伸**（控制面迁 CF，执行面留本地）。
  - **C（混合路由）**：CF 路由 + 本地/远端混合执行。
  - **D（self-host workerd）**：自托管 workerd，最接近现状但放弃 CF 托管红利。

## 5. agents-remote 现状对照（✅ 源码证据）

编排落地 subagent 已用源码核实：现状 ≈ **Paperclip 控制面层**，relay 管线更成熟。

- 控制面 / 运行时适配器 / 传输三层分离。
- `SessionRegistry`（`api/src/session-registry.ts:20-74`）只持 metadata，不持 CLI 命令。
- `RuntimeResources` 接口（`exists / close / startAgent / startTerminal / capture / attach / listAliveRuntimeKeys`）——**迁移 CF 时换实现的关键接缝**。
- `ProviderProfile`（`api/src/agent-provider-profiles.ts:82-111`）缝（`claude` / `codex` / `claude2`，含 command / displayName 前缀 / capabilities / 可用模型 / 权限模式）。
- `Claude2Runtime.spawnClaudeDirect`（`api/src/claude2-runtime.ts:490-529`）argv spawn CLI，**非 tmux**；stdin 直写（无 FIFO）；`--resume claudeSessionId`（L511-513）。
- `TmuxRuntime`（`api/src/tmux-runtime.ts`）Terminal session 用。
- `AgentRuntime`（`api/src/agent-runtime.ts:9-41`）经 `ProviderProfile.command` 委托。
- **中继双缓冲**（`api/src/session-relay.ts:35-115`）：history JSONL + live stdout cap 5000 + 单一 WS 流 + `history_start / live_start` 批处理标记——比 Paperclip fat/thin payload 概念更成熟。
- `SkillTaskRegistry`（`api/src/skill-tasks.ts:49-134`）**startOrJoin / subscribe / finish 范式**——任务系统的现成模式，可能直接复用。
- `permissionMode=plan` + `can_use_tool` 审批卡片——已经是「agent 提案 + 用户审批」循环（与 Buzz approval gate / Paperclip Board 同源）。
- `compact_boundary` / 窗口化 / 标量重建——长会话 context 管理已有基础。
- `runtimeKey` 格式 `{prefix}-{type}-{provider}-{projectKey}-{id}`，prod `ar-` / e2e `e2e-ar-`。
- shared DTO（`packages/shared/src/index.ts`）：`AgentProvider` (L323) / `AgentSession` (L698-712) / `Claude2PermissionMode` (L1504-1511, 含 default/acceptEdits/bypassPermissions/plan/auto/dontAsk/manual)。

## 6. 当前工作假设（编排抽象）

> **Paperclip 组织语义（org chart + role + task）× Avernet dumb router 实现哲学（编排层最小契约，智能在 agent）× agents-remote 现有 relay 管线。**

经用户四点补充修正：
- **高管团内部是圆桌**（非树状），层级只发生在「高管 → 执行团队」那一层。
- **圆桌会议**需参考聊天房间形式解决共享上下文 + 长记忆（难点）。
- **任务下发**要带看板视图（Multica 风格）。
- 做方案时重点对照 **Buzz 和 cloudflare-os** 这两个综合大成。

**第一步最小闭环** = `AgentProfile + Task 实体`：
- runtime 零改动，profile systemPrompt 走 argv 注入（`--append-system-prompt` 待确认 ⏳）。
- Task REST 仿 `SkillTaskRegistry` startOrJoin/subscribe/finish。
- 会议 / 看板后置。

**CF 留口子核心原则**（即使现在不迁也要保持）：
- 通信用 REST 不用 fs（消息走 API，不写本地文件）。
- 状态用 DO 不用内存（任务/会话状态可持久化）。
- `RuntimeResources` 接口保持稳定，迁移时换实现即可。

## 7. 调研清单与进度（全回来后让用户拍板产品形态）

| # | 缺口 | 状态 |
|---|------|------|
| 1 | `claude --append-system-prompt` 稳定性 + Codex 等价机制 | ✅ 已完成（§10） |
| 2 | 圆桌会议工程实现 + 长记忆 | ✅ 已完成（§13） |
| 3 | 委派端到端闭环 + 看板（Multica 风格） | ✅ 已完成（§12） |
| 4 | 现有资产复用度（SkillTaskRegistry / 审批 / windowing） | ✅ 已完成（并入 §12） |
| 5 | 看板/定时的 CF 原生对应 + Buzz/cf-os 综合大成 | ✅ 已完成（§11） |

## 8. 关键约束（贯穿全程，不可违背）

- **不要要求用户决定产品形态**，直到 §7 调研全部完成。
- **长任务建文档防丢**（用户强调 #4）——本文件 + memory `product-direction-opc-multi-agent.md` + 本会话 jsonL 三处冗余。
- **CF 是实现约束不是产品形态**——产品形态优先，CF 留口子。
- **现有管线不动**——编排是「在 session runtime 之上加三层」，非重构 runtime。
- **渐进式**——先 AgentProfile + Task 最小闭环，会议/看板后置（用户明确「UI/UX 优化必须按指令一点点改」，产品演进同理）。

## 9. 证据定位（压缩后恢复用）

- **memory**：`/home/deploy/.claude/projects/-home-deploy-workspace-agents-remote/memory/product-direction-opc-multi-agent.md`（含参考项目架构 + 用户心智模型 + 两决策，与本文件 §2-3 重复）。
- **现状源码**（编排落地报告引用）：`api/src/session-registry.ts`、`api/src/claude2-runtime.ts`、`api/src/tmux-runtime.ts`、`api/src/agent-runtime.ts`、`api/src/session-relay.ts`、`api/src/agent-provider-profiles.ts`、`api/src/skill-tasks.ts`、`packages/shared/src/index.ts`。
- **架构文档**：`docs/architecture/session-runtime.md`、`docs/architecture/agent-runtime.md`、`docs/design/message-replay.md`。
- **调研产出**：两份 subagent 报告（一份编排落地方案、一份 CF cloudflare-os + Computer 报告）——见本会话 jsonL。
- **本会话 jsonL**：`/home/deploy/.claude/projects/-home-deploy-workspace-agents-remote/b14b8973-6b5a-4f1a-8ace-fa530a48e06f.jsonl`（压缩后读此恢复完整对话）。
- **工具**：tvly CLI（`export TAVILY_API_KEY="$(cat /home/deploy/.config/tokens/tavily-cli.txt | tr -d '[:space:]')"`）、deepwiki MCP（ask_question）、gh CLI（账号 BanKnight，五个参考项目从 star 确认身份）。

## 10. 调研结论 ①：角色 prompt 注入（✅ 实测 + deepwiki + tvly）

### 10.1 Claude CLI（v2.1.212，实测 `--help` + canary）

- **`--append-system-prompt <string>`** = 推荐方案。**追加**到默认 system prompt 之后，**保留所有默认 Claude Code 工具/安全能力**。`--print` / `stream-json` / interactive 三模式都可用（interactive 自 v1.0.51 起）。实测 canary：`claude --print --append-system-prompt "ALWAYS respond with PONG-CANARY..." "Reply now."` → `PONG-CANARY`，注入生效。
- **`--system-prompt <string>`** = **陷阱，别用**。**替换**整个默认 system prompt，移除所有默认工具定义（GitHub issue #19977：「Claude Code 无法作为 agent 或使用工具」）。
- 还有 file 版本：`--append-system-prompt-file <path>` / `--system-prompt-file`（长角色 prompt 用，绕开 argv ARG_MAX ~2MB 限制）。
- **现有 `spawnClaudeDirect` argv 结构兼容**（`api/src/claude2-runtime.ts:490-529`）：直接加 `...(systemPrompt ? ["--append-system-prompt", systemPrompt] : [])`，Bun.spawn argv 方式无 shell 转义问题，prompt 内引号/`$VAR`/反引号安全。
- 无文档化长度/token 限制（deepwiki 查 CHANGELOG）。

### 10.2 Codex CLI（v0.145.0，实测 `--help` + 官方 config reference）

- **无 `--system-prompt` 类 argv flag**。角色注入走配置文件：
  - `developer_instructions`（config.toml string，**追加** developer 角色指令，最接近 Claude append 的等价物，但走 developer 非 system，权重弱一档）。
  - `model_instructions_file`（文件路径，**替换**内置指令，破坏性，等价 Claude `--system-prompt-file`）。
  - `instructions` 字段 **当前无效**（reserved for future use，勿用）。
  - `AGENTS.md`（项目目录文件，自动注入 system prompt，需 project trusted）。
  - `-c developer_instructions="..."`（argv 覆盖 config，短 prompt 可行，但需 TOML 转义 + 全进程级覆盖）。
- **已知坑**：`developer_instructions` 有 bug（GitHub issue #11004，未按预期 attach），落地前需在目标版本实测确认；`instructions` 字段不可用。

### 10.3 不对称 → ProviderProfile 抽象层必须抹平

| 维度 | Claude | Codex |
|------|--------|-------|
| 注入方式 | argv flag（string） | config 字段 / `-c` 覆盖 / AGENTS.md |
| per-spawn 隔离 | ✅ 天然 | ❌ 需不同 `$CODEX_HOME` / profile / AGENTS.md |
| 注入语义 | system 追加（强权重） | developer 追加（弱权重）或 system 替换（破坏性） |

**编排层设计**：
- `RoleProfile { id, name, systemPrompt: string }` 通用结构。
- `ProviderProfile` adapter 接口 `injectRole(args, env, spawnCtx, role)`：
  - Claude adapter：只改 args（追加 flag），无 fs 副作用。
  - Codex adapter：短 prompt 用 `-c developer_instructions=<TOML string>`，长 prompt / 需隔离用独立 `--profile` 文件（管理临时目录生命周期）。
- **接受语义不对称**（Claude system 强 / Codex developer 弱），文档化，不强求抹平——符合「provider 差异收敛在 adapter 边界」原则。

### 10.4 待落地前实测的开放问题

1. Codex `developer_instructions` 在 v0.145.0 是否已修 issue #11004（需实测 `codex exec -c developer_instructions="..." "Reply."`）。
2. `--append-system-prompt` + `--resume` 同用：resume 时追加新角色是叠加还是覆盖原 session 角色（语义未确认）。
3. `--append-system-prompt` 在 stream-json 下角色是否出现在 system.init 某字段（本项目 `captureSystemInitFromLine` 不读该字段，若需回显角色要补捕获）。

## 11. 调研结论 ②：CF 原生对应 + Buzz/cf-os 综合大成（✅ deepwiki + tvly + Context7）

### 11.1 Buzz 综合设计精华（`block/buzz`，用户点名大成之一）

- **两层 prompt 架构**：`[Base]` 层（buzz-acp 注入，平台身份 + MCP 工具引用 + workspace 布局）+ `[System]` 层（persona 自带 `.persona.md`，角色人格 prepend 到 user message）。**可借鉴**：平台能力契约与角色人格正交，加新角色只写 system 层。
- **`~/.buzz` nest（文件系统即共享 state）**：`RESEARCH/` `PLANS/` `WORK_LOGS/` `REPOS/` `GUIDES/` `OUTBOX/` `.scratch/` `AGENTS.md`。**可借鉴**：分层对本地执行面有意义，跨节点时镜像到 R2/DO。
- **ACP over Nostr**：event 结构（kind 9000=聊天 / 30388=agent 日志）、per-channel 队列（**最多一个 prompt in-flight**，避免 agent 自我抢占）、`@`mention 协议（`#p` tag 寻址）。**Buzz 选 Nostr 是因去中心化 IM 定位；我们不需要 Nostr，但「事件驱动 + single source of truth + 实时 fan-out」3 条理由 = CF DO + WebSocket Hibernation 的云原生等价**。
- **buzz-acp harness**：1-32 子进程池、take-and-return 所有权（一个 agent 进程同时只处理一个请求）、session/turn 状态、author gate（谁能触发）。
- **Buzz 编排本质**：消息总线为中心，agent 自治 + @mention 软协作，状态散在文件+对话流。**缺点**：无结构化任务状态/依赖图/崩溃恢复/审批门控（这些 cf-os 和 Hermes Kanban 补全了）。
- **关键信号**：Buzz 已把固定职能 persona（Orchestrator/Researcher/...）**退役**转向通用助手——实践发现固定职能分工不如通用 agent + 强 system prompt + 工具表。我们做角色模板应保留灵活度，不写死职能。

### 11.2 cloudflare-os 综合设计精华（`cloudflare/cloudflare-os`，用户点名大成之一）

- **Gadget 沙箱**：Dynamic Worker Facet + null-origin iframe + `fetch()` 默认禁用 + env RPC stub（能力安全，默认零访问，显式 introductions 授予）。
- **Blueprint 模板系统**（KV metadata + R2 content）：`BlueprintKvRecord`（title/description/bindings/version）+ R2 存 `.gadget` archive；`agentSpawner` binding 类型 + **两阶段实例化**（先非 spawner，后 agent spawner 引用第一阶段结果）。**直接可移植为我们的角色/工作流模板范式**。
- **Gatekeeper 三层能力模型**（Vendor / User / Session）+ **模拟 + 批量审批**：agent 发需审批 action 时 gatekeeper **本地模拟结果**告诉 agent「完成了」→ agent 继续排队更多 action → 用户**批量审批**。解决「agent 卡在等单个审批」痛点。**直接对应我们的 agent 输出审批**。
- **Overseer DO = per-workspace 内核**：管 FS/执行态/agent 交互/安全；CRDT(Yjs) 虚拟 FS 多端同编辑；**ChangeBatch 提议/接受流**（agent 不直接改 Mainline，提 ChangeBatch → 模拟 → 用户 merge/discard）= 结构化「agent 提议 + 人审批」。
- **持久化分工（已验证范式）**：DO SQLite（状态/chat/agent steps）+ KV（模板 metadata）+ R2（模板内容/大资产）+ DO alarm（定时/keep-alive）。**cloudflare-os 不用 Workflows/Cron/Queues 原生 binding，用 DO+alarm 手搓调度**——单 DO 可做单点协调。

### 11.3 CF 原生能力映射表（编排层需求 → CF 产品）

| 编排层需求 | CF 原生产品 | 何时用 |
|-----------|-------------|--------|
| 单 workspace 状态（task/chat/agent steps） | **DO + 内嵌 SQLite** | 强一致 + 单点协调 + 零网络延迟 + Hibernation WS 不收空闲费 |
| 多步任务流（逐步重试/跨天/等审批/崩溃存活） | **Workflows（`WorkflowEntrypoint`）** | 2026 重构后 50k 并发实例/账号；每步 checkpoint 只重跑失败步 |
| per-tenant/per-agent 动态工作流代码 | **Dynamic Workflows**（`@cloudflare/dynamic-workflows` MIT） | 2026-05 发布，pre-1.0，单租户可能用静态 Workflow+DO 够 |
| 定时任务 | **Cron Triggers** | 原生 cron；hybrid 下推荐 pull 模式（本地 dispatcher 拉取 ready task，避免 CF→本地时序耦合） |
| agent 间消息 fan-out | **Queues** | 独立任务并行/不保序/fire-and-forget；Workflows 内 step + Queues fan-out 是官方推荐组合 |
| 实时事件/token 流/进度推送 | **DO + WebSocket Hibernation** | 单 DO 协调多 WS，空闲驱逐但 WS 保持 |
| agent 自唤醒 | **DO alarm** | 任意时刻单次，比 Cron 灵活 |
| 角色模板/工作流模板 | **KV（metadata）+ R2（content）** | Blueprint 范式，两阶段实例化 |
| 长记忆/共享白板（结构化） | **DO SQLite** 或 **D1**（全局） | per-session/per-project 用 DO SQLite，跨项目用 D1 |
| 大资产/产物存档 | **R2** | 大、不可变 |
| 向量化语义检索 | **Vectorize** | 长期语义记忆（复杂 metadata filtering 可能不够） |

**Workflows vs DO vs Queues 决策**：单 agent 一次 turn <30s 用 DO；多步流水线（分钟-周）用 Workflows；真正连续 session 用 long-running agent DO；独立任务并行 fan-out 用 Queues；编排+fan-out 组合用 Workflows+Queues。Workflows 2026-08-10 起付费 $0.80/100k step（含 sleep/event wait），高频用 Queues 更划算。

### 11.4 Hybrid 形态 B 通信架构

```
CF 控制面（编排层）                         本地执行面（Bun on server）
  Worker（无状态 API + Cron）                claude2-runtime / codex-runtime
    ├─ /api/tasks CRUD     ──Tunnel HTTP──▶  tmux / PTY / fs
    └─ scheduled() cron                    dispatcher（拉取 pending task）
  Durable Object（per-workspace 内核）        ◀──WS(outbound)── 本地→DO 上报
    ├─ TaskBoard（SQLite: tasks）              心跳/task进度/stdout流
    ├─ AgentRegistry（SQLite: agents）
    ├─ WS Hibernation + Alarm
    └─ ApprovalQueue
  Workflows / Queues / KV / R2              cloudflared（outbound daemon，4 长连 × 2 DC）
```

- **链路 A（控制下行）**：浏览器 → Worker → 写 DO + 触发 Workflow/Queue → **Worker 经 Cloudflare Tunnel 发 HTTP 到本地 Bun**（cloudflared outbound-only，无 inbound 端口/公网 IP/攻击面）。
- **链路 B（状态上行）**：本地 Bun 开 **outbound WebSocket 到 DO**（Hibernation，空闲不收费）→ 上报心跳/task 状态/stdout 流 → DO fan-out 到订阅浏览器。
- **链路 C（定时）**：Cron 在 CF 触发 → **推荐 pull 模式**：本地 dispatcher 每 N 秒查 DO「ready & scheduled_at <= now」的 task，避免 CF→本地时序耦合。
- **链路 D（agent 间消息）**：同 workspace 内走 DO 内消息路由；跨 workspace fan-out 走 Queues。
- **本地 register**：启动经 Tunnel `POST /api/agents/register` → DO AgentRegistry；每 30s 心跳，超 90s 标 stale 重派 task（Hermes Kanban 同款）；优雅下线转 in-progress task 为 Ready 重派。

### 11.5 「先做编排、CF 留口子」接口设计建议

**`RuntimeResources` 接缝**（编排层契约，与具体运行时无关）：
```ts
interface RuntimeResources {
  tasks: TaskBoardStore;        // create/claim/complete/block/list/getRuns  → 未来 DO TaskBoard
  agents: AgentRegistry;        // register/heartbeat/list/unregister         → 未来 DO AgentRegistry
  workspace: WorkspaceStore;    // read/write plans/research/work_logs/白板   → 未来 DO SQLite + R2
  templates: TemplateStore;     // get/instantiate Persona/Workflow blueprint  → 未来 KV+R2
  capabilities: CapabilityGate; // authorize(tool,scope)/submitAction/apply/simulate → 未来 Gatekeeper
  events: EventEmitter;         // subscribe/publish TaskCreated/Claimed/Completed/ApprovalRequested → 未来 DO WS
  scheduler: Scheduler;         // schedule(taskId, cronOrTimestamp)           → 未来 Cron Triggers
}
```
- **本地实现阶段**：`tasks`/`agents`/`workspace` 用 SQLite 文件（对齐 Hermes `~/.hermes/kanban.db`），`events` 用 Node EventEmitter + WS，`templates` 用 `~/.buzz`-style 目录。
- **接口稳定后逐个换 CF 实现**，调用方零改动。
- **铁律**：状态用 DO 不用进程内存（cloudflare-os 的 `activeAgents`/`agentSteps` 全落 SQLite 是为崩溃恢复；我们已有「API 重启丢进行中 turn」痛，多 agent 更不能放内存）；通信用 REST/WS over Tunnel 不用本地 fs；共享 state 走 store 接口不直接读 fs。

### 11.6 任务模型对齐 Hermes Kanban + cloudflare-os ChangeBatch

```
Task 生命周期：Triage → Todo → Ready → InProgress → Blocked → Done
  - dependencies: Task[]（前置完成才 Ready）
  - assignee: personaId（按能力路由）
  - scheduled_at: timestamp（定时）
  - max_retries + circuit_breaker（≈3 次失败自动 Blocked，避免无限 thrash）
  - attempt history: Run[]（每次执行 outcome/elapsed/started）
  - parent_task / child_tasks（fan-out，parent summary 自动流 child）
  - proposed_changes?: ChangeBatch（cloudflare-os 式提议/审批）
```
提供 `kanban_*` 工具集给 agent（`kanban_show`/`complete`/`block`/`heartbeat`/`fanout`），agent 以工具调用方式协作而非靠 prompt 软约定。

### 11.7 迁移路径（先本地后 CF）

1. **阶段 0（现状）**：单 agent session，per-session 内存 relay + JSONL。
2. **阶段 1（本地编排）**：`RuntimeResources` 本地版 + Hermes-style TaskBoard SQLite，多 agent 同 server 协作。验证编排语义。
3. **阶段 2（CF 留口子）**：接口不变，加 CF 实现（DO TaskBoard/AgentRegistry + KV/R2 模板 + Cron 定时），cloudflared tunnel 桥接。本地执行面保留。
4. **阶段 3（可选全 CF）**：需 agent 在 CF Sandbox 跑且不需本地 fs/tmux——**Claude/Codex CLI 需 PTY 是硬障碍，阶段 2 是务实终态，非过渡态**。

### 11.8 开放问题

1. 是否所有 agent 类型都依赖本地 PTY？有无「纯 API agent」可全迁 CF？（决定阶段 3 可行性）
2. DO 单实例能否扛住单 workspace 多 agent 高频 stdout 流（claude2 已有 batch emitter 压缩/分块可复用，需实测）。
3. 模板版本化与升级（旧 task 引用旧模板版本的兼容策略）。
4. 跨 workspace agent 共享：多 project 时 agent 是 per-project 还是全局 pool（影响 DO 切分粒度）。
5. 审批 UI 可发现性（用户何时被通知有 pending approval）——CF Email Workers 可用。
6. Dynamic Workflows 2026-05 才发布 pre-1.0，单租户私有部署可能用静态 Workflow+DO 足够。
7. Workflows 2026 重构后 limits 表 lag，上线前复核官方公告。

## 12. 调研结论 ③：任务下发 + 看板（✅ deepwiki + 源码）

### 12.0 核心范式决策：Multica 双层模型（Issue ≠ Task）

**采用 Multica 的「Issue × Task 二元模型」，非 Paperclip 的「issue 即 task」单层**：
- `OrchestrationGoal`（业务目标，长期记录，看板卡片）× `OrchestrationTask`（单次 agent 执行，运行态生命周期）正交分离。
- 一个 goal 可产生多次 task（初版/修复/复核），看板追踪 goal 状态，task 是执行记录。
- **与 agents-remote 现状同构**：`AgentSession`（CLI 进程实例，已有 running/idle/closed/error 状态机）天然对应 `OrchestrationTask`；缺的是上层 `Goal` 实体（看板卡片）。

⚠️ **命名冲突预警**：`packages/shared/src/index.ts` 已有 `AttachmentTaskStatus`/`Claude2TaskStarted`/`AttachmentGoalStatus` 等 = **Claude Code CLI 协议**任务事件（CLI 内部 subagent/task 系统），**非**编排任务。编排实体统一加 `Orchestration` 前缀（`OrchestrationTask`/`OrchestrationGoal`/`OrchestrationRun`）避免混淆。

### 12.1 三参考项目对比

| 维度 | Multica（主参考） | Paperclip（补强） | Buzz（补充） |
|------|-------------------|-------------------|--------------|
| unit of work | **二元** Issue×Task | 单层 issue=task | 无一等实体（Nostr events + Nest 文件 emergent） |
| 持久层 | PostgreSQL | PostgreSQL+Drizzle | Nostr relay + 本地 Nest |
| 目标祖先链 | `parent_issue_id` + `stage` 阶段 barrier | `parentId` 指针 + `getAncestors()` 重建（≤6 祖先入 prompt，无 denormalized path） | 无显式 ancestry |
| delegation | Squad leader `@mention` member 触发新 task | `POST /issues`（parentId+assignee）+ cycle guard 409 | Orchestrator `@mention` worker + per-channel queue |
| 看板 | **自建** `@dnd-kit/core`，BoardView（按 status/assignee/custom 分组）+ SwimlaneView（parent/project/assignee 泳道） | 有（Kanban+list，按 team/agent/project/status 过滤） | **无看板**（Observer Feed + Projects view） |
| 移动端看板 | **不做看板**，list-first 按 status 分组（窄屏列稀疏体验差） | 未明确 | Flutter app，无看板 |
| local daemon | 探 PATH CLI → `pollLoop` → `FOR UPDATE SKIP LOCKED` 原子认领 → spawn 到隔离 workspace（git worktree + `.agent_context/` 注入）| control/execution 分离；adapter spawn CLI；SIGTERM→SIGKILL cancel | buzz-acp 长驻 daemon，spawn 1-32，BYOH |
| heartbeat | Autopilot `create_issue` vs `run_only` 双模式 + cron + webhook | `heartbeatService` 短窗口 + fat/thin payload + 5 wake reasons | WorkflowEngine 60s tick + cron/interval + at-most-once claim |
| 审批 | issue 级 status 流转 | `executionPolicy`（ordered review/approval stages + mandatory decision）拦截 done→in_review | `request_approval` + `PermissionMode::Plan`（与本项目 `permissionMode=plan` 同源） |
| **同构度** | **最高** | 高 | 中 |

**选型**：Multica 主参考（双层 + 看板 + daemon 隔离）+ Paperclip 补强（goal ancestry 指针 + executionPolicy 审批 + cycle guard + fat/thin heartbeat）+ Buzz 补充（per-channel 队列串行化，approval gate 已同源）。

### 12.2 Task 实体 Schema 草案

**OrchestrationGoal（看板卡片）**：
```ts
type OrchestrationGoalStatus = "backlog"|"todo"|"in_progress"|"blocked"|"in_review"|"done"|"cancelled";
type OrchestrationAssignee =
  | { type: "agent_role"; role: string }      // 高管/执行角色
  | { type: "agent_id"; agentId: string }     // 具体实例（对应 AgentSession.id）
  | { type: "squad"; squadId: string }        // 团队（后置）
  | { type: "unassigned" };

type OrchestrationGoal = {
  id: string; projectKey: string;
  title: string; description: string;        // Markdown
  status: OrchestrationGoalStatus; priority: "critical"|"high"|"medium"|"low";
  assignee: OrchestrationAssignee;
  parentGoalId: string | null;               // 指针；getAncestors() 重建，≤6 入 prompt
  stage: number | null;                      // 子 goal 分阶段 barrier，全闭合唤醒 parent
  blockedByGoalIds: string[];                // 依赖，resolve 时自动唤醒
  workMode: "ask"|"planning"|"implement"|"research"|"review";
  approvalPolicy?: { stages: Array<{ kind: "review"|"approval"; participant: {...} }> };
  taskIds: string[]; activeTaskId: string | null;  // 同期最多一个 in-flight task
  createdAt/updatedAt/startedAt/completedAt/dueDate: string | null;
};
```

**OrchestrationTask（执行记录）**：
```ts
type OrchestrationTaskStatus = "deferred"|"queued"|"dispatched"|"running"|"completed"|"failed"|"cancelled";
type OrchestrationTask = {
  id: string; goalId: string; projectKey: string;
  assignee: OrchestrationAssignee; status: OrchestrationTaskStatus; priority: number;
  trigger: { reason: "manual"|"assignment"|"delegation"|"heartbeat"|"autopilot"|"on_demand"|"approval_resolution"; ... };
  fireAt: string | null;                     // deferred 时 sweeper promote 到 queued
  sessionRefs: Array<{ sessionType: "agent"|"terminal"; sessionId: string; provider?: AgentProvider; role: "primary"|"subagent"|"terminal" }>;
  result?: { summary?; usage?; outputFilePath?; deltaSummary? };
  ...
};
```

**OrchestrationAutopilot（定时任务）**：
```ts
type OrchestrationAutopilot = {
  id: string; projectKey: string; title: string; runbook: string;
  assignee: OrchestrationAssignee;
  executionMode: "create_goal"|"run_only";   // create_goal 默认（在看板可见）
  status: "active"|"paused"|"archived";
  triggers: Array<{ kind: "schedule"; cron: string; timezone: string } | { kind: "webhook"; url: string; ... }>;
};
```

### 12.3 状态机：agent 自推 vs CEO 审批

| 状态转换 | 谁推进 | 说明 |
|---------|--------|------|
| backlog→todo | CEO 或 autopilot | CEO 提目标；autopilot `create_goal` 自动建 todo |
| todo→in_progress | **agent 自推**（claim 时） | 认领即 in_progress，无需批准 |
| in_progress→blocked | agent 自推或系统（依赖未满足） | agent 评论说明原因 |
| in_progress→in_review | **agent 自推**（认为完成） | 若 `approvalPolicy` 非空，强制进 in_review |
| in_review→done | **CEO 审批** | mandatory decision；reject 退回 in_progress |
| 任意→cancelled | CEO | agent 不可自取消 goal（task 可自 cancel） |

**核心规则**（Paperclip）：**agent 永远不能直接把 goal 设为 done**——`approvalPolicy` 空则放行，非空强制 in_review。这是「CEO 追踪 + 介入」硬约束。Task 的 completed/failed 由 agent/daemon 自报，不需审批。

### 12.4 看板视图

- **列分组**（三层）：按 status（默认，CEO 全局追踪）/ 按 assignee（高管团视角）/ 按 parent goal swimlane（**CEO drill-down 核心**，ancestry 视觉化）/ 按 workMode。
- **主列**：`[Backlog] [Todo] [In Progress] [Blocked] [In Review] [Done]`（可隐藏 cancelled，对齐 Multica）。
- **卡片字段**：id/title/status/priority icon/assignee avatar + childProgress（子 goal 进度）/stage/blockedByGoalIds/dueDate/activeTaskSummary/workMode。
- **移动端**：**不做看板**，list-first 按 status 分组（SectionHeader + IssueRow，可折叠），点 row 进 goal 详情。桌面端才上真看板（`@dnd-kit/core` 拖拽）。
- **UI 集成**：看板作为 `WorkbenchPanelRef` 第 5 种 kind（现有 4 kind: session/file/git/skill），复用 group+tab+focus URL 路由 + `dropIntoLeaf` 分屏 + `MobileTabHeader` 胶囊款 ✕。**不新发明布局**。

### 12.5 复用度评估（SkillTaskRegistry）

**复用范式，不复用本体**。`SkillTaskRegistry`（`api/src/skill-tasks.ts`）的 `startOrJoin/subscribe/finish/dedupKey/SSE 广播终态/TTL evict` 范式**可直接复用为 Task 执行态 registry 骨架**，但**无 goal ancestry/分配/状态机多态/持久化**，不能整体复用。

| 现有能力 | 复用？ | 说明 |
|---------|--------|------|
| `startOrJoin(kind, dedupKey)` 去重 | ✅ pattern | dedupKey 换 `goalId` = 同期一个 goal 一个 in-flight task |
| `subscribe(taskId, onFrame)` + 立即回调 + live 终态 | ✅ pattern | task 状态变化推看板 |
| `finish(taskId, outcome)` + 广播 + TTL evict | ✅ pattern | task 终态广播 |
| SSE handler 骨架 | ✅ pattern | 改 WebSocket 复用 `createBatchEmitter` 更优 |
| goal ancestry / parent chain | ❌ 新建 | `getAncestors(goalId)` 遍历重建 |
| 分配/认领原子 | ❌ 新建 | 进程内 Map 原子；跨进程/DO 用 `FOR UPDATE SKIP LOCKED` |
| 状态机多态（7+7 态） | ❌ 新建 | SkillTask 只有 3 态 |
| 持久化 | ❌ 新建 | 落盘 JSON（runDir，对齐 SessionMetadata）或 DO SQLite |
| approvalPolicy 拦截 | ❌ 新建 | done 转换检查 policy |
| 定时（fire_at + sweeper） | ❌ 新建 | setTimeout / DO alarm / CF schedule() |

**直接复用（零改动）**：`SessionRegistry`/`Claude2Runtime`/`session-relay`（Task 执行仍走现有 spawn+relay）、`AgentProvider`、`permissionMode=plan`+`can_use_tool` 审批卡片 UI、`WorkbenchPanelRef` 路由、`createBatchEmitter`。

**复用率约 20-25%，新建约 75-80%**（goal/task/autopilot 三实体 + ancestry + 状态机 + 持久层 + 看板 UI greenfield）。

### 12.6 Task ↔ Session 关系

**一个 task 执行过程 = 一个或多个 agent session**：
- **primary session**：主执行 CLI（claude2 `--resume` claudeSessionId，复用现有 AgentSession + relay 双缓冲）。
- **subagent session**：task 内 CLI spawn 的 subagent（现有 `task_started`/`subagent_type` 协议已捕获）。
- **terminal session**：task 需终端能力时（复用 TmuxRuntime + TerminalSession）。
- **resume 语义**：task 跨 daemon 重启 = 复用 claude2 `--resume` + relay 从 JSONL 重建 history（Gen 3 状态级恢复）。**编排 Task 不引入新持久化模型，复用现有 session 级状态级恢复**。

### 12.7 定时任务实现路径

**Multica Autopilot 双模式**：
- `create_goal`（默认）：调度器建 goal + assign，runtime 离线也建、queue 等回线（**不丢工作**，与「CEO 追踪」一致）。
- `run_only`：不入 goal，直接 enqueue task，runtime 离线 → skipped（防 doomed 堆积）。

**落地**（hybrid 形态 B）：
- 当前（本地全栈）：`OrchestrationAutopilotScheduler`（api 进程内）`setTimeout`/cron 解析 → fire 到期幂等 → `create_goal` 建 goal+assignment wake → SessionRegistry spawn。
- CF 迁移后：CF Agents SDK `schedule(cron)`/`scheduleEvery(interval)` + DO SQLite 存 `autopilot_run`（crash recovery）+ REST 通知本地 daemon claim。CF `schedule()` 替代 Multica `cron.go`，DO alarm 替代 `PromoteDueDeferredTasks` sweeper。

### 12.8 开放问题

1. 持久层选型：先 runDir JSON（对齐 SessionMetadata，DO 留接口）还是直接 DO SQLite？🟡 倾向先 JSON，迁移换实现（与 `RuntimeResources` 接缝同构）。
2. `--append-system-prompt` 注入角色 systemPrompt（§10 已确认 Claude 可用、Codex 走 `developer_instructions`），assignee=agent_role 时如何把 role systemPrompt 注入 CLI spawn argv？✅ §10 已答，落地时在 `ProviderProfile` adapter `injectRole` 实现。
3. Squad 实体第一轮是否建？🟡 后置——assignee 先支持 `agent_role`+`agent_id`，`squad` 留 schema 占位。
4. cycle guard 实现位置：`createGoal(parentGoalId, assignee)` 时检查 assignee 是否在祖先链（`getAncestors` 一次遍历）。🟡 成本低，第一轮必加。
5. 看板实时性：复用 `createBatchEmitter`（WS）还是 SSE？🟡 看板是 list 视图非 chat stream，可能轻量 SSE 更合适，需 spike。
6. 移动端 list-first 分组折叠态是否记忆（localStorage，参考 `../../../frontend-notes.md` §13）？🟡
7. autopilot webhook 在 hybrid 形态 B 下的鉴权（复用 `private-access-auth` + webhook 签名验证）？⏳
8. Buzz per-channel 队列串行化是否借鉴？🟡 第一轮 YAGNI，按 goal 串行（dedupKey=goalId）即可。

## 13. 调研结论 ④：圆桌会议工程实现（✅ deepwiki + 源码 + tvly）

### 13.0 三件套独立收敛（强证据）

三个被点名的综合大成（Buzz / cloudflare-os / Paperclip）**独立收敛到同一套三件套**，强烈佐证这是成熟解：
1. **单一共享状态源**（buzz=Nostr event log / cf-os=Yjs CRDT doc / paperclip=task 系统）——所有 agent 上下文都是它的投影，非各自维护。
2. **串行化轮次队列**（buzz=`EventQueue.in_flight_channels` / cf-os=DO `assertChatNotActive`+`self`-loopback / paperclip=heartbeat 一次一 run）——「同时只一个角色发言」，避免互相覆写、基于陈旧上下文冲突。
3. **检查点压缩做长记忆**（buzz=`LlmContextExceeded` shrink / cf-os=`CompactionCheckpoint` @85% input budget + summary + pinned whiteboard-version / paperclip=fat/thin payload）——讨论超出单窗口时无损续接。

> ⚠️ **社区走查校准（2026-08-12，三条 P2 合并）**：
> 1. **Buzz 三件套的 cost 叙事被 token 实测戳穿**（`pm-buzz-community.md`）：Buzz 三件套的"收敛"是**机制层形态同构**,不代表 Buzz 的实现成本可控——daily.dev 引 YouTube 实测一个 greeting 31k tokens(vs Claude Code 终端 4k),"add another agent and it multiplies"。根因是每 turn 重 spawn + 注入 base prompt + 回放 channel history。Buzz 用 `LlmContextExceeded` 被动截断,**无主动检查点压缩**。OPC 照搬三件套时,"检查点压缩"必须是**主动**的(非被动截断),否则成本不可控。
> 2. **Avernet 英文社区心智缺位**（`pm-avernet-community.md`）：Avernet 在英文社区编排产品对比矩阵(LangGraph/CrewAI/AutoGen 主流圈)中尚未出现(2026-08 HN/Reddit 零对比讨论),它目前是"蚂蚁内网验证 + 中文媒体声量"但"英文社区心智缺位"的状态,与 LangGraph/CrewAI 的社区采用度不在同一档。本文 §3.4 把 Avernet 当"dumb router 哲学"参考,学机制(源码直证)安全,但不要当"社区验证的产品标杆"。
> 3. **Grok Bot 非独立编排创新,是 OpenClaw 商业托管版**（`pm-grok-bot-community.md`）：Grok Bot 246 HN 评论零编排讨论,12 处明提 OpenClaw——它是"开源 OpenClaw/Hermes 谱系的商业托管版 + always-on 持久 VM",不是独立编排产品。本文 §3 未把 Grok Bot 列编排参考(正确),但 OpenClaw/Hermes 是 OPC 多 agent 编排**真正未覆盖的开源竞品底座**,后续应补调研(见 `../design/opc-product-discussion.md` §10)。

**推荐**：照搬三件套，落在 agents-remote 现有 relay + `compact_boundary` 管线之上。最小新增 = Room 事件日志（仿 relay）+ 共享白板 + 串行 turn 队列 + 检查点。长记忆复用现有 `compact_boundary` windowing，新增「白板持久化 + 检查点摘要 + 可选向量检索」。

### 13.1 最小数据模型

```ts
// 角色 / 身份（对应 Buzz Persona、cf-os Gadget、Paperclip role）
type RoundTableRole = {
  id: string; displayName: string; systemPrompt: string;
  provider: AgentProvider; model?: string;  // 不含 runtime 状态
};

// 参与者 = 角色的一次实例化入会
type RoundTableParticipant = {
  id: string; roomId: string; roleId: string;
  kind: "agent" | "ceo";          // agent 角色 vs 用户(CEO)
  claudeSessionId?: string;       // 复用 CLI --resume（agent 用）
  model?/permissionMode?/effort?: ...;
};

// 圆桌 = 聊天房间（对应 buzz channel、cf-os chat、paperclip issue 父任务）
type RoundTableRoom = {
  id: string; project: ResolvedProjectPath;
  title: string; agenda: string;   // 议题（注入每个 agent）
  participantIds: string[];
  routingMode: "broadcast" | "mention";  // 仿 buzz respond_to + mention filter
  turnPolicy: "serial" | "free";  // 默认 serial（圆桌平等但串行）
  status: "active" | "paused" | "concluded";
  dispatchedTaskIds: string[];     // 圆桌产出 → Task 实体（下发到执行团队）
};

// 消息 = 一条发言
type RoundTableMessage = {
  id: string; roomId: string; seq: number;  // 单调递增（串行 turn 天然顺序）
  authorParticipantId: string; authorKind: "agent" | "ceo";
  authorRoleLabel: string;        // "CTO"/"CEO"——注入对方 prompt 前缀（仿 buzz [from:botName]、aver net GroupContext）
  content: string; mentions?: string[];
  turnStatus: "in_flight" | "completed" | "interrupted";
};

// 共享白板（对应 buzz ~/.buzz/{RESEARCH,PLANS,WORK_LOGS}、cf-os Yjs doc、letta shared block）
type RoundTableWhiteboard = {
  roomId: string;
  decisions: string;              // 已达成的决定（running summary）
  openQuestions: string;         // 未决问题
  constraints: string;            // CEO 给的约束
  rolePositions: Record<string, string>;  // per-role 最新立场
  researchNotes: string;          // 累积调研发现
  updatedAt: string;
};

// 检查点（对应 cf-os CompactionCheckpoint、本仓库 compact_boundary）
type RoundTableCheckpoint = {
  roomId: string; compactedTo: number;  // 消息 seq 水位线
  summary: string;                // AI 生成摘要（替换被压缩段）
  whiteboardSnapshot: RoundTableWhiteboard;  // 钉住白板版本（cf-os observedCodeVersion）
  inputTokenEstimate: number;
};
```

**存储选址**：
- 消息 + 白板 + 检查点 → **SQLite**（仿 cf-os DO SQLite collection），不用进程内存（CF 迁移时换 DO、进程重启不丢、可 query）。现有 metadata 用 JSON 文件；圆桌因有事件流 + 检索需求建议**升级为 SQLite**（新模块，不动现有 SessionRegistry）。
- 白板同时镜像为**单一 markdown 文件**到 `project/.roundtable/<roomId>/whiteboard.md`（agent 可文件工具直接读写、可 git diff，与 buzz nest 一致）。
- 角色 systemPrompt → settings 域（复用现有 settings-store），不进消息流。
- **复用 `SkillTaskRegistry`**：`startOrJoin`/`subscribe`/`finish` 三件套对应「发言入队 → 订阅 fan-out → 发言完成」，dedupKey 改为 `roomId`（串行闸）。

### 13.2 上下文注入策略

核心问题：**A 发言后，B 的 CLI 调用怎么把会议历史喂进去？**

| 方案 | 机制 | 契合度 | 取舍 |
|------|------|--------|------|
| **A 重放式注入**（推荐主） | 每条发言 append Room 日志；B 触发时服务端组装「近期 N 条 + 检查点 summary + 白板快照」→ 经 `--append-system-prompt` 或 stdin 首条 user 注入 | **极高**——现有 `Claude2SessionRelay` 就是 fan-out 管线，`historyLines` 从「单 session JSONL」泛化为「Room 事件日志」，`addSubscriber`/`broadcast` 原样复用，`injectLiveLine` 对应「A 发言广播给其他 participant」 | 单管道守住、B 与 A 同源无分叉、reconnect/重放免费；prompt 随讨论增长靠窗口化+检查点压 |
| **B 共享白板**（推荐辅） | 发言不进 prompt；agent 用 `readFile`/`writeFile` 工具直接读写白板，自决何时拉 | 中——cf-os `readFile`/`writeFile` + Letta `archival_memory_search` | prompt 永远小、白板可结构化、可 git；**单独不足**——agent 不主动读就看不到最新发言；与 A 配合（白板存活状态/累积，日志存逐条对话） |
| **C Nostr 事件总线** | 起 Nostr relay，participant 订阅 channel，发言=发事件 | 低——Buzz 原版，但 Nostr 协议复杂度对单机 Bun 是 over-engineering | **不引入**，模式可借协议不必 |

**推荐 = A 主 + B 辅，C 不引入**——正是 Buzz 和 cf-os 的实际组合：**事件日志驱动对话（A）+ 共享白板承载活状态/长记忆（B）**。落地：
1. A 注入路径 = Room 事件日志（仿 relay）→ `buildRoundTablePrompt(participant, roomId)` 组装 `[Role systemPrompt][Whiteboard snapshot][Conversation Context: 最近 N 条 + last checkpoint summary][Triggering message]` → 经 CLI stdin 发首条 user 消息（或 `--append-system-prompt`，§10 已确认 Claude 可用、Codex 走 `developer_instructions`）。
2. B 白板路径 = 白板 markdown 文件 + MCP 工具（复用 mcp-injector）`update_whiteboard`/`read_whiteboard`，agent 发言中提议改白板 → CEO 审批落盘（仿 cf-os `ApprovalQueue` 模拟+批量审批，复用现有 `permissionMode=plan` + `can_use_tool` 卡片）。
3. 路由 = Room `routingMode`：`broadcast`（圆桌默认，所有 agent 收每条）= buzz `respond_to:anyone`；`mention`（CEO 定向提问）= `#p`/`@`。两者可并存。

### 13.3 长记忆四层栈

每层在下一层饱和时才触发，非择一：

| 层 | 机制 | 业界对应 | 本仓库复用 | 新建 |
|----|------|---------|-----------|------|
| **L1 重放/注入** | 最近 N 条逐字消息注入（精确归属 verbatim） | LangGraph checkpointer / cf-os `AiChatMessage` 回放 / ChatGPT 窗口 | ✅ `Claude2SessionRelay` history+live 双缓冲 + `history_start/live_start` 批 | — |
| **L2 共享白板** | 结构化活状态（决定/未决/立场/约束/调研），所有 agent 读写，每 turn 注入 | Letta shared block / LangGraph 共享 namespace / cf-os Yjs doc / buzz `~/.buzz` | — | 🆕 `RoundTableWhiteboard` + 镜像 markdown + MCP `read/update_whiteboard` 工具 |
| **L3 检查点压缩** | prompt 超 85% 预算时 AI 摘要前段 → checkpoint，resume 注入 summary + 后段 | cf-os `CompactionCheckpoint` @85% / letta FIFO summarize / buzz `LlmContextExceeded` shrink / Generative-Agents reflection @importance~150 | ✅ **`compact_boundary` windowing**（已实现：tail-load 最后 compact 块 + live `compact_boundary` 主动 trim + `readLastCompactBlock` + `sliceLastCompactBlock`）+ ✅ `seed_init` 标量重建 | 🆕 Room 级 checkpoint（多 participant 共享一份 summary）+ 触发器从「CLI 自发 compact」升级为「Room 服务端主动 compact」（CLI 在多 participant 场景不自发，因每个 participant 是独立进程看不到全局压力） |
| **L4 向量检索** | 按「语义」召回更早被压缩的细节 | LangGraph `store.search` / Letta `archival_memory_search` / Mem0 hybrid(vector+BM25+rerank) / cf-os Agent Memory(Vectorize beta) | — | 🆕 **后置，非 MVP**——embed Room 消息 + Generative-Agents 打分（recency 0.99^h + importance 1-10 + relevance cosine）+ Mem0 hybrid + `search_meeting_history(query)` 工具 |

**关键复用**（`compact_boundary` 可复用度 ✅）：L1 + L3 大部分免费——`compact_boundary` tail-load（块平均 1.4–2.3MB / 23–30k postTokens 实测有界）、主动 trim、标量重建 seed_init、`injectLiveLine`/`injectLine` 广播、`SkillTaskRegistry` 三件套范式全部可复用。

**关键新建** 🆕：(1) Room 事件日志为统一源（取代 N 个 agent 各自 CLI JSONL，否则分叉——单管道原则在多 participant 的延伸）；(2) 共享白板持久化（跨 agent 共享可写状态，现有 session 无此物）；(3) Room 级检查点（per-room 非 per-session，触发器服务端主动，白板快照钉进 checkpoint）；(4) 向量检索（L4 后置）；(5) per-role systemPrompt 注入（§10 已确认机制，`ProviderProfile` adapter `injectRole` 实现）。

**长记忆触发链（MVP）**：
```
发言到达 → append Room SQLite → fan-out 各 participant relay（L1 注入最近 N 条）
                ↓ 当 prompt 估算 > 85% input budget
   服务端发起 Room compact → AI 摘要前段 → 存 checkpoint（含白板快照）→ 下次注入改用 summary + 后段（L3）
                ↓ checkpoint 也压不掉的专名/细节（后期）
   向量库 embed + search_meeting_history 工具按需召回（L4，后置）

白板（L2）独立演进：agent 提议改白板 → CEO 审批 → 落盘 + 广播；每 turn 注入 prompt 读最新版
```

### 13.4 Buzz vs cloudflare-os 对照（借模式不借协议）

两者都是「无层级平等讨论」骨架，技术栈不同但架构同构。本仓库**采 cf-os 架架骨架 + buzz 落地细节 + 两者都降协议复杂度**：

| 对照轴 | Buzz（文件系统 + Nostr） | cloudflare-os（CRDT + DO） | 本仓库取舍 |
|--------|--------------------------|---------------------------|-----------|
| 共享状态载体 | Nostr relay event log + `~/.buzz` nest | 单一 Yjs CRDT doc（DO SQLite） | **cf-os 单一持久源思路 + buzz 文件白板落地**：Room SQLite 权威源 + markdown 文件镜像 |
| 序列化 | `EventQueue` Rust struct（显式队列） | DO 单线程天然锁 + `assertChatNotActive` + `self`-loopback | **buzz 显式队列**——本仓库 Bun 单进程非 DO，无天然锁，需显式 `in_flight: Set<roomId>`（复用 SkillTaskRegistry 骨架） |
| 上下文注入 | `format_prompt` 六段拼接 | `runAgent` 回放 + 工具按需拉白板 | **两者结合**：回放近期消息（L1）+ 白板快照注入（L2）+ 工具按需（L2 自取） |
| 长记忆 | 两层：共享 `~/.buzz` + per-agent `core` engram(<10KB) + 冷 slug | `CompactionCheckpoint` @85% + 白板版本钉 | **cf-os 检查点 + buzz 两层**：L2 白板（buzz shared）+ L3 checkpoint（cf-os 85%）+ 可选 per-role `core`（buzz engram） |
| 用户角色 | pubkey participant，`respond_to`+mention 双闸 | human gatekeeper，`ApprovalQueue` + 模拟 + 批量审批 | **cf-os 审批**（复用现有 `permissionMode=plan`+`can_use_tool`）+ buzz 路由双闸（broadcast vs mention） |
| 路由 | `respond_to`(owner-only/allowlist/anyone/nobody) × `no_mention_filter` | `chat.send`(触发回复) vs `chat.inject`(静默观察) | **两者都借**：buzz broadcast/mention 控制「谁回应」；cf-os `chat.inject` = 「围观式 participant」（旁听不发言保留上下文） |
| 循环防护 | 仅 prompt 规则（buzz 自承 gap） | 无显式（DO 串行自然限） | **本仓库需补**：per-room turn budget（连续 N 个 agent-only turn 无 CEO 输入则停）+ reply-depth cap——3 角色可能无限 ping-pong |
| 协议复杂度 | Nostr（签名/relay/NIP-42/NIP-AE）重 | Yjs CRDT + Cap'n Web RPC + Dynamic Worker 重（CF 专有） | **两者降级**：Nostr→「server-side event log + channel/mention tag」；CRDT→「SQLite 事件表 + 单 writer（服务端）」——单进程 Bun 不需分布式 CRDT 冲突解决 |

### 13.5 开放问题

1. **`--append-system-prompt` 已确认可用**（§10 已答：Claude argv string flag、Codex `developer_instructions`），落地在 `ProviderProfile` adapter `injectRole`。与 `--resume` 共存行为（角色 prompt 每次 resume 是否重传）仍需实测。
2. **Room 事件日志 vs 各 participant CLI JSONL 关系** ⏳——每个 participant 仍是独立 CLI 进程（有自己 JSONL）；Room 日志是跨 participant 统一源。Room 消息是否写进每个 participant 的 CLI JSONL？还是 Room 日志独立、CLI JSONL 只存该 participant 自己看到并产出的 turn？影响 `--resume`（CLI resume 重建自己 JSONL 非 Room 全貌）。
3. **串行 turn 与 CLI `--resume` 冲突** ⏳——现有 `Claude2Runtime` 一个 session=一个常驻 CLI 进程。圆桌要 N 个 participant 同时常驻但串行只一个 in-flight。N 个进程常驻等命（内存/Cost）还是按需 spawn（每次 turn spawn+完销毁，`--resume` 接续）？Buzz 用 AgentPool take-and-return（常驻池）；cf-os 单 DO 串行（不常驻多进程）。需决策常驻池大小 + spawn-on-demand 延迟/`--resume` 成本。
4. **白板并发写冲突** ⏳——buzz `buzz mem patch` 带 base-hash 冲突检测；cf-os Yjs CRDT 自动合并。本仓库无 CRDT，选：① CEO 审批串行化（仿 cf-os ApprovalQueue）；② optimistic concurrency + base-hash（仿 buzz patch）；③ 简单 last-wins（圆桌小可接受）。
5. **CEO 介入模式** ⏳——buzz 默认 `respond_to:owner-only`（CEO=owner 特权）；cf-os CEO=gatekeeper（审批非发言特权）。圆桌产品语义：CEO 是平等 participant 还是有「打断当前 in-flight turn」「强制插队」权？后者需串行队列加「CEO 优先级插队」（打破 `in_flight` 闸）。
6. **`routingMode` 切换时机** ⏳——buzz 同 channel 不能动态切。圆桌支持「讨论段切 broadcast、提问段切 mention」还是创建时定死？
7. **检查点 summary 由谁生成** ⏳——cf-os 用专门 `COMPACTION_SYSTEM_PROMPT` + 同模型；Generative-Agents 反思。要不要第五个中性「书记员」agent 做 summary（避免角色 agent 自 summary 带立场偏置）？还是用最便宜模型（haiku）？
8. **向量检索（L4）何时上** ⏳——MVP 不做。触发条件：白板 markdown 超多少 KB？讨论超多少 turn？Buzz 证明小会议靠 ls/read 够，本仓库目标「个人私有部署 + 小团队」很可能 L1+L2+L3 足够，L4 永远不上。
9. **Room 数据迁 CF 形态** ⏳——Room 状态（SQLite）迁 CF = DO SQLite（一对一）；N 个 CLI 进程仍在本地执行。`RoomStore` 抽象接口同 `RuntimeResources` 接缝，迁移时换 DO 实现。

## 14. 综合产品形态方案（4 份调研合成，待用户拍板）

### 14.1 编排抽象定稿

> **核心 = 三件套（Buzz/cloudflare-os/Paperclip 独立收敛）× agents-remote 现有 relay 管线 × Paperclip 组织语义 × Avernet dumb router 哲学。**

四份调研收敛出一个清晰的产品骨架——**两层模型 + 三件套基础设施**：

```
┌─────────────────────────────────────────────────────────────────┐
│  CEO 视角（用户）                                                 │
│  ├─ 圆桌会议（高管团商量大方向）        ← RoundTable 实体           │
│  └─ 看板（追踪执行团队进度 + drill-down）← OrchestrationGoal 实体   │
├─────────────────────────────────────────────────────────────────┤
│  编排层（新增，三件套）                                            │
│  ├─ 角色（AgentProfile + ProviderProfile.injectRole）             │
│  ├─ 任务（OrchestrationGoal × OrchestrationTask 双层，Multica 模型）│
│  ├─ 圆桌（Room 事件日志 + 共享白板 + 串行 turn + 检查点）           │
│  └─ 审批（复用 permissionMode=plan + can_use_tool 卡片）            │
├─────────────────────────────────────────────────────────────────┤
│  现有 runtime（零改动，复用）                                      │
│  └─ SessionRegistry / Claude2Runtime / session-relay /            │
│     compact_boundary / SkillTaskRegistry 范式 / WorkbenchPanelRef  │
└─────────────────────────────────────────────────────────────────┘
```

**关键设计决策（已由调研证实）**：
1. **双层任务模型**（§12）：`OrchestrationGoal`（看板卡片，长期）× `OrchestrationTask`（执行记录，运行态）——与 `AgentSession` 现状同构。agent 不能直接把 goal 设 done，CEO 审批（Paperclip `executionPolicy`）。
2. **圆桌 = 三件套**（§13）：单一共享状态源（Room SQLite）+ 串行 turn 队列 + 检查点压缩长记忆。落在现有 `Claude2SessionRelay` + `compact_boundary` 之上，L1/L3 大部分免费。
3. **角色注入**（§10）：Claude `--append-system-prompt`（实测可用）+ Codex `developer_instructions`，`ProviderProfile` adapter `injectRole` 抹平不对称。
4. **CF 留口子**（§11）：`RuntimeResources` 接缝 + 状态用 SQLite/DO 不用内存 + 通信用 REST/WS 不用 fs。hybrid 形态 B 是务实终态（CLI 需 PTY 是硬障碍）。
5. **命名**（§12）：编排实体统一 `Orchestration` 前缀，避免与 CLI 协议 `AttachmentTaskStatus`/`Claude2Task*` 混淆。

### 14.2 第一步最小闭环（用户已对齐「角色 + 任务下发」）

**目标**：在现有 session runtime 之上加「角色 + 任务下发」最小闭环，runtime 零改动。

**Phase 1 内容**：
1. **AgentProfile + ProviderProfile.injectRole**（§10）：定义 `RoleProfile { id, name, systemPrompt, provider, model? }`；`ProviderProfile` adapter 加 `injectRole(args, env, spawnCtx, role)`——Claude 追加 `--append-system-prompt`，Codex 走 `-c developer_instructions=<TOML string>` 或独立 `--profile` 文件。**先实测 Codex `developer_instructions` 在 v0.145.0 是否生效**（issue #11004）。
2. **OrchestrationGoal + OrchestrationTask 实体**（§12）：shared DTO + `OrchestrationGoalRegistry`（持久层，先 runDir JSON 对齐 SessionMetadata，DO 留接口）+ `OrchestrationTaskRegistry`（抄 `SkillTaskRegistry` startOrJoin/subscribe/finish 骨架）。
3. **任务下发端到端**：CEO 在 UI 建 goal（assignee=agent_role）→ 系统触发 `assignment` wake → `OrchestrationTaskRegistry` 起 task → 走现有 `Claude2Runtime.spawnClaudeDirect` spawn CLI（注入角色 systemPrompt）→ relay 复用 → task 完成 agent 自报 → goal 进 in_review → CEO 审批 done。
4. **看板 UI**（桌面 `@dnd-kit/core`，移动端 list-first 按 status 分组，§12.4）：作为 `WorkbenchPanelRef` 第 5 种 kind 接入，复用 group+tab+focus 路由。
5. **cycle guard**：`createGoal(parentGoalId, assignee)` 检查 assignee 不在祖先链（防环）。

**Phase 1 不含**：圆桌会议、Squad（团队）、定时任务（autopilot）、向量检索（L4）——后置。

**Phase 1 验收**：CEO 能建一个带角色的 goal → 派给某 agent role → 该 agent spawn 带角色 systemPrompt 执行 → 完成回传 → CEO 在看板审批 done。整条链路通。

### 14.3 演进路径（后续 Phase，渐进式）

| Phase | 内容 | 依赖 |
|-------|------|------|
| **1** | 角色 + 任务下发 + 看板（最小闭环） | 现有 runtime |
| **2** | 圆桌会议（Room + 白板 + 串行 turn + 检查点长记忆） | Phase 1 角色 + 现有 relay/compact_boundary |
| **3** | Squad（团队，leader+members，@mention 委派）+ 定时任务（autopilot `create_goal`/`run_only` + cron） | Phase 1+2 |
| **4**（按需） | 向量检索 L4（`search_meeting_history`）、白板并发写冲突精细化、CF 迁移（DO 实现接缝） | Phase 2+3 跑稳后 |

**每个 Phase 都遵循**：CF 留口子（`RuntimeResources`/`RoomStore` 接缝、状态用 SQLite 不用内存、通信用 REST 不用 fs）、渐进式（按用户指令一点点改）、先文档后代码（DESIGN.md + 本调研文档定稿后再实现）。

### 14.4 需用户拍板的决策点

调研已完成（§7 全部 ✅），产品形态方案已综合。**现在可以拍板了**。关键决策点：

1. **编排抽象**：认可「双层任务（Goal×Task）+ 圆桌三件套 + 角色注入 + CF 留口子」这个骨架吗？（§14.1）
2. **第一步范围**：Phase 1 = 角色 + 任务下发 + 看板（不含圆桌/定时/团队），认可这个最小闭环边界吗？（§14.2）
3. **Codex 角色注入退化预案**：若 Codex `developer_instructions` 在 v0.145.0 失效（issue #11004 未修），接受「Codex 角色走 `model_instructions_file`（system 替换，破坏性，需手动重建 Codex 默认指令）」还是「先只支持 Claude 角色注入，Codex 后置」？（§10.4）
4. **持久层**：Phase 1 Goal/Task 先 runDir JSON（对齐 SessionMetadata，进程内单例重启丢执行态但 metadata 落盘）还是直接上 SQLite（为圆桌/CF 预热）？（§12.8）
5. **移动端看板**：认可「移动端不做看板、list-first 按 status 分组」（Multica 实证窄屏列稀疏体验差）吗？（§12.4）

这些是产品形态决定，由你拍板后我再进入实现（先更新设计文档再写代码，遵循「design docs before code」）。开放问题（§13.5 等）是实现期细节，不阻塞产品形态决策。

### 14.5 文档与恢复索引（压缩后恢复用）

- **本文件**：`./multi-agent-orchestration.md`（§1-14 完整，调研综合 + 产品形态方案）
- **memory**：`product-direction-opc-multi-agent.md`（跨会话锚点）
- **task list**：#136-#140（全部 completed 后归档）
- **本会话 jsonL**：`b14b8973-6b5a-4f1a-8ace-fa530a48e06f.jsonl`
- **4 份 subagent 报告原文**：在 jsonL 的 task-notification result 字段（agentId: af2f17b3 CLI注入 / a348208b 圆桌 / a3fc801d 看板 / af19a03f CF大成）

## 15. Claude Tag 对照（Anthropic 官方商业产品，2026-08-12 增补）

> Claude Tag = Anthropic 2026-06-23 发布的 Slack 多 agent 协作产品（闭源，无源码）。Cat Wu（Head of Product for Claude Code）称其「first product natively multi-player and proactive」，内部合并 Anthropic 自己 65% 的产品 PR。Karpathy 抬到「第三次 LLM UI/UX 大重构」（网站 → 桌面 app → **self-contained/persistent/async entity 握 org-wide tools 与人类并肩**）。本节是它对 agents-remote 方向的官方商业印证 + 增量启发。证据分级：🟢官方 / 🟡权威媒体 / 🔴社区。

### 15.1 产品形态（Multiplayer / Proactive / Persistent 三轴）

- **存在形式**：Slack app + bot 用户 `@Claude`，admin 装到 workspace、invite 进特定 channel（不自动 join 全部）。一个 channel = **一个共享 Claude identity**（不是每人一个），所有人在同一上下文交互。🟢
- **Multiplayer** 🟢：channel 是 conversation 权威源，Claude 读 channel 历史建上下文（张三派任务离开 → 李四接力 → 王五晚到看全貌）。Anthropic 员工 HN 评论：Claude **区分 initiator vs 后到者**，遇到人际分歧「patiently waits for resolution」不乱插嘴——这就是串行协调。
- **Proactive（ambient mode）** 🟢：per-channel opt-in，启用后**不等 @tag** 就行动——逐条读 channel 消息判「needs a response?」、顶回沉寂 thread、cross-channel 主动同步信息、从 connected tools（Datadog/Sentry/GitHub）抓信号报警。例：A/B test 监控、incident channel Sentry spike 主动发帖、连 Gmail 监听重要邮件 ping 到 Slack。
- **Persistent** 🟢：① **channel memory** 跨消息/天级累积 org knowledge（项目背景/team 实践/tech stack 偏好），类似 OpenClaw memory.md 风格，跨 channel 学习需 admin 显式授权，memory 尊重 channel 边界不泄漏；② **async/self-scheduled tasks** 跨小时/天，「many Claudes in parallel」= 多独立 async task（非多角色讨论）。
- **stacked prompts via git webhooks** 🟢（最被低估、对 agents-remote 最相关）：agent 把任务拆成有依赖子任务，**通过 git webhooks 等 blocking dependency 天级**（依赖 PR merge / CI green / 上游 done），等再续——事件驱动的任务依赖编排。配套「tag in coworkers who own related code」识别涉及谁的代码并 @tag。
- **summarize threads → docs with action items** 🟢：长 thread @Claude summarize → 抽 shipping decisions / open questions / 每个待办主人 + 草稿。证明「**会议 → 决策摘要 → 任务下发**」是高价值闭环，agent 自己做 summarize（不引入独立书记员）。
- **治理** 🟢：4 步 setup（pair Slack / 给 tools / 设 spend limit / test）；per-channel access bundle（eng 连 GitHub+warehouse，sales 连 CRM）；per-channel spend cap + org 月度上限 + 75%/95% 告警；memory 尊重 channel 边界；ambient per-channel opt-in。

### 15.2 三件套印证（最强信号）

Claude Tag 作为 Anthropic 官方商业产品，**第四个独立收敛到 §13.0 的三件套**（前三是 Buzz/cloudflare-os/Paperclip）：
1. **单一共享状态源** ✅（channel = conversation 权威源）
2. **串行化轮次** ✅（distinguishes initiator vs 后到者 + waits for human resolution）
3. **检查点压缩做长记忆** ✅（跨天/跨周 context 累积必然有 compaction）

→ **强烈佐证 agents-remote 方向正确**。

### 15.3 对 agents-remote 的印证点（已有方案被官方产品验证）

| 已有方案 | Claude Tag 印证 |
|---------|----------------|
| §13 三件套（单一源+串行+检查点） | ✅ 第四个独立收敛 |
| §12 双层任务 Goal×Task | ✅ checklist in thread + stages = IM 化双层 |
| §12 任务依赖 `blockedByGoalIds` + 事件唤醒 | ✅ **强印证**：git webhook 等依赖天级 = stacked prompts |
| §10 角色/身份抽象 RoleProfile | ✅ org 级共享 identity + per-channel scoped，身份是资源非 per-session |
| §13 `routingMode` broadcast vs mention | ✅ ambient（broadcast）vs @tag（mention）双模式 |
| §13.5 开放问题 7 summary 由同一 Claude 做 | ✅ Claude Tag 用同一 Claude summarize |
| 渐进式（先单 agent 多用法，多角色后置） | ✅ Claude Tag **故意不做多 agent 角色**，卖「一个 Claude 100s of ways」 |

### 15.4 可借鉴的新设计（Claude Tag 做了，agents-remote 应吸收）

1. **身份是 project 级共享资源，per-project scoped（非 per-session）** 🟢——`AgentProfile`/`OrchestrationGoal.assignee` 不绑死单 CLI session，应是 project 级可复用身份资源；加 `accessBundle`（tools/data/codebases 白名单）+ `scopeToProject`；memory 按 identity 累积非按 session。
2. **ambient「逐条消息 LLM 判 needs-response」粒度** 🟢——比 cron heartbeat 细。圆桌 `routingMode=broadcast` 不只是「每条消息注入所有 participant」，而是每个 participant 各自 LLM 判 needs-response 才发言（防「worst person in group chat」）。建议补 `RoomAmbientPolicy = "always_respond" | "llm_judge_per_message" | "mention_only"`。
3. **git webhook 作为任务依赖唤醒源** 🟢——`OrchestrationAutopilot.triggers`（§12.2）的 `webhook` kind 具体化 git webhook 子类型（PR merged / CI green / branch pushed）作为 goal 依赖满足信号源，比 DO alarm/cron 更贴合 dev workflow。
4. **thread 形态作为移动端任务详情（看板的 IM 化替代）** 🟢——移动端 `OrchestrationGoal` 详情页 = thread（任务消息流）+ 顶部状态条，比看板卡片更适合手机竖屏 + 实时性强。补充 §12.4 移动端 list-first 之外的形态。
5. **cross-room sync 做上下文传递（免显式 agent-to-agent 协议）** 🟢——「圆桌决策 → 执行任务」上下文传递用 cross-room sync（圆桌 Room 决策摘要自动 push 到执行 task prompt），简化 §13.2 注入策略，无需显式 ACP/Nostr。
6. **token budget 作为软审批** 🟢——§12 `approvalPolicy` 之外加 per-goal/per-agent token budget（与 Paperclip budget、cf-os Gatekeeper 同源）作为 agent 自治硬边界。

### 15.5 盲点补充（Claude Tag 暴露的问题）

1. **多 channel/room 碎片化上下文** 🔴（LinkedIn namanpandey 批评「put a bot in every channel → ten half-versions, each confidently wrong」）——§13 单一 Room 事件日志已避免单 room 内碎片化，但**跨 Room/跨 project 需注意**：是否要「org 级共享白板」聚合所有 Room 决策？建议补到 §13 长记忆 L2（per-room 白板 + 可选 org-level 聚合）。
2. **ambient proactive spam 需精细 tuning** 🔴——`routingMode=broadcast` 必须配「发言预算」/「沉默规则」（连续 N 个 agent-only turn 无 CEO 输入则停——§13.4 循环防护已有；还需补 per-agent 发言频率上限）。
3. **agent 操作可审计 identity** 🟡——多 agent 协作时每个 agent 操作需带可审计 identity 标签（哪个 agent 改了哪个文件），强化 §12 `OrchestrationTask.sessionRefs` 为「agent 操作日志带 identity」。
4. **Claude Tag 的 multiplayer = 多人+单 agent ≠ agents-remote 多 agent 角色** 🟡——重要澄清：Claude Tag 卖「一个团队级 Claude 做多类事」，agents-remote OPC 是「多 agent 角色（CTO/CPO/...）协作」。agents-remote Phase 1（角色+任务下发）与 Claude Tag 形态最接近；**Phase 2 圆桌（多角色同台）是超越 Claude Tag 的差异化，但风险更高**——需 Phase 1 印证单 agent 多用法价值后再上（Claude Tag 渐进路径印证）。
5. **自建 UI 复杂度天然高于 Claude Tag「站在 Slack 肩膀上」** 🟡——Claude Tag 不需要做 channel/thread/@tag/全员可见（Slack 全提供）。agents-remote `WorkbenchPanelRef` 第 5 种 kind（看板）其实是在**重建 Slack channel 能力**——这值得（agents-remote 还要做 terminal/files/git inspection），但需清醒认识复杂度天然更高。

### 15.6 对 §14 决策点的影响

Claude Tag 调研**不改变** §14.4 的 5 个拍板决策点（编排抽象骨架、Phase 1 边界、Codex 退化、持久层、移动端看板），但**增强信心**：
- 三件套 + 双层任务 + 任务依赖唤醒 + 角色抽象都被 Anthropic 官方产品独立印证。
- **强化建议**：Phase 1 应吸收 §15.4 的「身份=project 级资源」「git webhook 唤醒源」「thread 形态移动端任务详情」三个设计；Phase 2 圆桌前补 §15.4 的 ambient policy + §15.5 的发言预算/碎片化防护。
- **产品定位澄清**：agents-remote 不应照抄 Claude Tag（Slack IM 形态），但吸收其「身份/ambient/依赖唤醒/thread 工作日志」四个设计选择，落到自建 web 控制台抽象——agents-remote 多 agent 角色 + terminal/files/git inspection 是比 Claude Tag 更宽的细分。

### 15.7 开放问题（无法从公开材料确认）

1. Claude Tag 的 compaction 机制细节（@85% 检查点？FIFO summarize？向量检索？）⏳
2. ambient「needs-response」判定是 LLM 调用还是规则+LLM 混合 ⏳
3. 一个 channel 能否有多个不同 identity 的 Claude ⏳
4. 「many Claudes in parallel」是 task pool 还是 agent pool ⏳
5. memory.md 风格是产品内置还是 Claude 自发工具用法 ⏳
6. 「stacked prompts」依赖图是 Claude 自维护还是 admin 配置 ⏳
7. Claude Tag 是否基于 Claude Agent SDK Managed Agents `multiagent` coordinator topology ⏳
