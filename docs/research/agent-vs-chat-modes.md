# 竞品「对话 vs Agent」双模式调研

竞品为何同时提供「对话（Chat）」和「Agent」两种模式？两者的本质差异是什么？本调研回答这两个问题：网络调研 6 个双模式产品 + Proma 本地源码一手证据（唯一有源码可实证的样本）。

## 一句话结论

竞品的「对话 vs Agent」双模式**本质是两种执行引擎，不是两个功能**：

- **对话** = LLM API 单次/流式文本往返。工具可选，即便有也是**只读信息获取型**；无工作区绑定、无权限层、无计划审批。
- **Agent** = Agent SDK/CLI 进程 + 工具循环 + **项目工作区上下文** + **权限/计划审批层** + 可恢复会话 + 后台任务。

核心分界不是「有没有工具」，而是**「默认放多少工具和权限」**：对话负责低风险问答，Agent 放开写执行（改文件 / 跑命令 / 多步任务 / 交付结果）。趋势是**对话界面统一 + Agent 引擎分层**，而非二元对立——同一模型、同一工具集，由「是否给写执行权限 + 是否绑工作区」分档。

## 双模式产品全景（网络调研）

| 产品 | 对话形态 | Agent 形态 | 分界方式 |
|---|---|---|---|
| **OpenWebUI** | Provider（模型直答） | Agent（工具循环） | 是否启用工具 + 工具集 |
| **Continue** | Chat | Plan / Agent | 三档工具权限：**No tools / read-only / all tools** |
| **Cursor** | Chat（弱化，聊天内可触发 Agent） | Agent + Plan Mode | 工具 + 权限分档 |
| **Cherry Studio** | 对话助手 | 智能体 | 五种权限模式（含计划审批） |
| **Dify** | Chatbot / Chatflow | Agent / Workflow | 编排引擎差异 |
| **Claude Agent SDK** | Messages API 直接调用 | Agent loop | 「单次响应」vs「自主循环」 |

> 六维度差异见下节。Anthropic 官方判定标准（Building Effective Agents）：**开放不可预测步数的问题用 Agent**（"open-ended problems where it's difficult or impossible to predict the required number of steps"）；能单次对话解决的先用最简单方案。

## Proma 一手源码证据（`~/repos/proma`，本地 clone）

Proma 是「对话 vs Agent 双模式」最直接的样本，README 原文定位：

- **「简单问题用 Chat，复杂任务交给 Agent」**
- **「只需要回答时用 Chat，需要行动和交付结果时用 Agent」**

两条模式的实现差异可从源码实证（这是本调研最有价值的部分——网络调研六产品全是对外文档，Proma 能看到真实实现）：

### Chat 模式（`chat-service.ts` + `chat-tool-registry.ts` + `chat-tools/`）

- **有工具循环**：`while (round < MAX_TOOL_ROUNDS)`，`MAX_TOOL_ROUNDS = 999`——工具 → 结果续回 history → 再调 API，如此往复。
- **但工具集是只读信息获取型**：`BUILTIN_TOOLS` 只有 web-search / agent-recommend / nano-banana + 自定义 HTTP 工具（`chat-tool-executor.ts` → `web-search` / `agent-recommend-tool` / `nano-banana-tool` / `http-tool-executor`）。
- **零工作区/权限/计划/会话概念**：grep `workspace` / `permission` / `plan` / `sdkSession` / `AgentSession` 计数 = **0**。纯 Provider API 流式（SSE），无 Agent SDK、无 CLI 进程。
- **工具限制靠「不注册写工具」，不是拦截**：Chat 直连 Provider API，注册表里根本没有 Write/Edit/Bash 这类函数，无从谈起权限拦截——"有限工具集"的实现方式是"只给这几个函数"。
- **数据层**：JSONL 持久化（`~/.proma/conversations/`）。

### Agent 模式（`agent-orchestrator.ts`，2939 行）——两层 harness

Agent 模式的引擎是**两层壳**，这是「Agent = harness」的关键结构：

1. **Claude 原生 harness** = Claude Agent SDK 自带的 agent loop（tool 循环、上下文管理、文件系统/命令能力）。Proma 不自己写执行器，是 `sdkCliPath` 把 SDK 拉起来当引擎，配 `preset: 'claude_code'` 的 system prompt。
2. **Proma 产品层编排壳** = 包在 SDK 外面的控制层：工作区绑定、`canUseTool` 权限策略、`ExitPlanMode` UI 审批、`sdkSessionId` 会话恢复、后台任务、`disallowedTools: ['Agent','Task']`（禁掉 SDK 原生子 Agent，统一走 Proma 自己的协作子会话）。

**有限工具集**：默认给全套 Claude 工具（读/写/Bash/MCP），靠 `canUseTool` 拦截做权限，与 Chat「不给工具」策略相反。

**权限控制核心 = `canUseTool` 回调**（`agent-orchestrator.ts:1538-1679`），SDK 每次调工具前询问宿主，Proma 在其内实现完整策略状态机：

- **per-session 权限模式**：`sessionPermissionModes` Map，运行中可动态切换；默认 `bypassPermissions`（全 allow，无人值守）。仅两个模式：`bypassPermissions` / `plan`（值直接映射 SDK 原生 `permissionMode`）。
- **`plan` 模式 = 只读白名单**：`Read/Glob/Grep/WebSearch` 等放行；`Write/Edit` 仅限 `.md` 文件（计划文档）；`Bash` 用 `isBashCommandReadOnly` 正则检测（重定向 `>`、`rm/mv/cp`、`npm install`、`git commit`、`node script.js` 全 deny）；MCP 按前缀细分（`chrome_devtools` 只放行快照/截图，`planning` 只放行查询）。
- **`ExitPlanMode` 拦截** → 发 `exit_plan_mode_request` 事件 → 渲染层 UI 审批 → 通过才 `setPermissionMode` 切模式。
- **关键约束**：`allowDangerouslySkipPermissions: !canUseTool`——提供 canUseTool 时不能同时传 allowDangerouslySkipPermissions，否则 SDK 同时收到两个矛盾指令，`ExitPlanMode`/`AskUserQuestion` 交互式工具会挂。

**其余能力**：绑定工作区（`getAgentWorkspace` / `projectRootPath` / `getLocalProjectRootStatus`——根目录不可用直接报错 / `getWorkspaceMcpConfig` / Skills / attached dirs）、`sdkSessionId` 持久化（session-not-found 时切上下文回填模式；Resume 状态显式处理）、automation / backgroundTasks 后台能力、JSONL 持久化（`~/.proma/agent-sessions/`）。

> 数据层两者相似（都 JSONL + index），**差异在语义绑定**：Agent 绑 workspace + 权限审批 + SDK 会话，Chat 只绑对话历史。UI 层 `WelcomeEmptyState.tsx` 的 `appModeAtom`（`chat`/`agent`/`scratch` 三模式）是同一个切换入口。

**两模式的引擎差异一句话版**：

- **Chat = 自己写循环调 API**：手写 tool loop + Provider Adapter + SSE，工具只给只读信息获取，天然无权限层。
- **Agent = 借 Claude 的 agent loop 当引擎，外面再套一层产品控制壳**：执行引擎是 SDK 现成的，Proma 的价值在壳——工作区绑定 + `canUseTool` 权限状态机 + UI 审批 + 会话恢复 + 后台编排。不是从零写执行器。

## 六维度本质差异

| 维度 | 对话（Chat） | Agent |
|---|---|---|
| **能力边界** | 工具可选；即便有也是只读信息获取（搜索/推荐/查 API） | 放开写执行：文件系统、命令、多步编排（MCP / Skills） |
| **执行运行时** | LLM API 直连 + 自己手写薄 tool loop（Provider Adapter + SSE） | 现成 agent loop 当引擎（SDK / CLI 进程）+ 产品层编排壳 |
| **上下文** | 对话历史 + 附件 | 项目工作区 + 文件 + MCP servers + Skills + 记忆 |
| **状态持久** | 一次性会话，只存对话记录 | 可恢复 SDK 会话 / 工作区状态 / 后台任务 |
| **权限安全** | 无权限层——工具只读 + 不绑工作区，低风险天然保证 | `canUseTool` 权限状态机 + 计划审批（ExitPlanMode UI）+ 写操作门禁 |
| **任务形态** | 回答（低风险问答） | 交付结果（改代码/跑任务/多步执行） |

## 统一趋势：对话界面统一 + Agent 引擎分层

- 六产品的共同演进不是「对话 vs Agent 二选一」，而是**同一界面里按任务复杂度分档**：
  - Continue 三档 = 工具权限梯度（No tools → read-only → all tools）。
  - Claude Agent SDK 宣传语：「same tools, agent loop, context management that power Claude Code」——同一个模型，加一个 agent loop 就是 Agent。
- **权限分界被刻意保留**：对话的低风险来自「只读 + 无工作区」，Agent 的高能力来自「写执行 + 工作区」，二者之间的权限审批层是产品刻意设计的边界，不是实现缺陷。

## 对 agents-remote 的启示

- **agent-remote 目前只做 agent 会话管理**（对应上表 Agent 列，且是真实 CLI 进程直拉——比 Proma 的 Agent 模式更接近 Claude Code 本体）。它天然没有「对话模式」这回事。
- 若未来要加「对话模式」，分界应复用上述六维度：**对话 = 不绑工作区 + 只读工具 + 无权限层**；**Agent = 绑项目 + 写执行 + 权限审批**。这与本项目的「Project 是统一作用域」「Agent workspace 默认二级页」既有结构天然对齐。
- 本项目既有 OPC 语境有更细的观测粒度认知（`docs/opc/design/opc-product-discussion.md` 的「对话 = 观测粒度，消息 = 介入粒度」）：竞品的「对话/Agent 双模式」是**入口形态**分界，本项目的「观测/介入」是**会话内粒度**分界——两个正交维度，可叠加。
- 竞品的「权限分界」设计印证了本项目已有的 `permissionMode` 体系（auto/acceptEdits/bypassPermissions/plan/dontAsk）是正确方向：权限模式不是技术细节，而是「对话 vs Agent」能力边界的产品化表达。
