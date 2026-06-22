# CLAUDE

## 行为规范
- @GUIDLINES.mds

## 项目目标
- 实现一个优化版本的 hapi，使用户可以通过网页控制服务器上的 agent，包括 Codex 和 Claude。

## 前端实现约定
- 执行 React 前端或 prototype UI alignment 的 `implement-change` 时，必须先加载 `vercel-react-best-practices` skill，并把它作为组件编写、重构和代码评审约束。
- Prototype UI alignment 必须先读原型 HTML，再在实现过程中持续对照 prototype/app 截图；不能只依赖最终 verify 才发现视觉漂移。
- 原型一致性必须通过横向和纵向两层抽象落地：横向复用同一套 Home/Project/Agent/Files/Git/Terminal 设计语言，纵向抽取 shell、workspace、navigation、surface、row、status、action、input、terminal/code 等层级 primitive。
- 颜色、间距、圆角、active 宽度、safe-area、bottom navigation、surface 层级等都属于抽象契约；不要在 route 文件里为了单页观感私自散写另一套设计语言。
- 抽象只服务于还原原型和保持真实能力边界；不得伪造数据、日志、历史、文件/Git 能力或运行态输出让 UI 看起来更完整。

## 数据流设计原则

- UI 组件的数据流必须遵循 `UI = f(state)`：同一数据类型的渲染只能有一条管道进入 UI 层。
- 如果同一数据类型（如消息）有多条管道（如 REST 历史 + WebSocket 实时），应合并为单一 state 数组，由 React 统一渲染，而不是为不同来源维护平行的渲染组件和状态管理。
- 分页、实时追加、历史回放等能力应只是对单一 state 数组的不同操作（prepend / append / reset），不应产生独立的 UI 分支。
- 使用 `useExternalStoreRuntime`（assistant-ui）或等价的外部 state 管理时，应让框架只负责渲染，业务层自己掌控 state 生命周期。
- 聊天记录以 Claude CLI 的 JSONL session 文件为唯一权威来源。不要自行"注入"或"伪造"消息；如果某条消息在 JSONL 中存在但 UI 没有显示，说明是渲染层过滤逻辑的问题。CLI 自身的 `isMeta: true/false` 分类是是否展示的第一手依据，不应以我们对 message type 的猜测替代。
- **消息处理说明统一用 live/replay 双列表格**：凡是讨论消息类型如何处理、讨论渲染语义、设计数据流时，必须使用「实时流 — 消息信号 | 实时流 — UI | 历史回放 — 消息信号 | 历史回放 — UI」四列格式。同一消息类型在实时流和回放两条路径上的行为必须明确区分，不得混为一谈。协议文档（`docs/research/claude-cli-stream-protocol.md`）中的 thinking 生命周期表格是标准模板。

### State/Render 分离（两条管道，通用原则）

- **消息 = state，不是气泡**。全部原始消息（包括内部/合成消息）先进入唯一的 state 有序日志（`rawMessages: SessionStreamServerMessage[]`），不在此阶段做渲染决策或丢弃。
- **渲染 = state 的投影（子集）**。渲染列表通过纯函数（如 `deriveThread(rawMessages): ThreadMessageLike[]`）从 state 派生，由 `useMemo` 管理。收 100 条消息渲染 50 条是正常的（HiddenDropped 语义）。
- **关联在 state 层用有序关系表达，不进渲染 metadata**。synthetic→parent、tool_result→tool_use、thinking_tokens→assistant 等关联都应从有序 raw 日志中的位置推导（前一条消息、tool_use_id 匹配等），或从消息自身的字段（如 `sourceToolUseID`）解析，而不是塞进气泡的 `metadata.custom` hack。
- **Pass 1 / Pass 2 是标准范式**：Pass 1 = 批量追加 raw state + 更新独立标量 state（tasks、model、skills 等）；Pass 2 = 纯函数从 raw state 派生渲染列表。不要在第一遍处理时直接 mutate 渲染列表。
- **设计从语义出发，不要从 type 机械 switch**。先做语义分类（AssistantTurn、ToolResult、SkillBody、UserPrompt、ThinkingTokens、ApiError 等），再为每个语义角色设计渲染投影逻辑，而不是对 `msg.type` 做 switch-case。
- **实时流与 JSONL 的同一条消息标记不同**：实时流可能用 `isSynthetic: true` 标记内部消息（无 `parentUuid`/`sourceToolUseID`），JSONL 可能用 `isMeta: true`（有 `sourceToolUseID`/`parentUuid`）。语义层应统一处理两种来源，不因标记不同而产生平行分支。

### 消息处理函数直接操作 state

- 消息处理函数的职责是"收到一条消息，更新所有相关 state"，而非"返回转换结果让调用方去应用"。
- 处理函数内部直接调用 state setter（`setMessagesState`、`setTasks` 等），不需要返回值、delta 对象或回调。
- 可独立测试的转换逻辑（如 content block → UI part、tool_use → task op）抽取为独立的纯函数并导出；编排逻辑（"对这条消息调哪些纯函数、结果写哪个 state"）留在处理函数内部，通过集成测试覆盖。
- 新增 state 类别时，在处理函数内部加一行 setter 调用即可，不需要改返回类型、调用方签名或 delta 结构。

### 从语义出发设计和命名

- 设计任何结构（函数、模块、状态、接口、数据流）时，先从语义出发：理解它在系统中扮演什么角色、属于哪个语义分类，再据此组织结构和命名，而不是从机械的操作步骤出发。
- 命名要表达事物在系统中的**角色/语义**，而不是它**做了什么操作**。函数名应回答"这是什么"，而非"它执行了哪个动作"。
- 当一段逻辑因为缺少上下文而无法完成其语义职责、不得不泄漏到外层打补丁时，根因是"语义不足 + 上下文传递不够"。正确做法是把该逻辑移到拥有上下文的位置，让它的语义边界自洽，而不是在外层堆判断。
- 例：消息分发应先识别数据的语义分类（如 Claude CLI 的 `external` vs 非 external 消息），为每个分类设计一个拥有完整 state 上下文的 handler，分发层只做按语义分类的 dispatch，不直接调用通用转换函数；通用转换函数只能作为 building block 被 handler 调用。

## assistant-ui

This project uses assistant-ui for chat interfaces.
Documentation: https://www.assistant-ui.com/llms-full.txt<br/>
Key patterns:
- Use AssistantRuntimeProvider at the app root
- Thread component for full chat interface
- AssistantModal for floating chat widget
- useChatRuntime hook with AI SDK transport

## Claude2 Session 数据流调试指南

Claude2 session 消息经过多层管道，排查问题时**必须逐层沿数据流方向检查**，而不是到处看代码猜原因。

### 下行数据流（CLI → 浏览器）

```
实时：CLI stdout → readStdout() → relay.handleStdoutLine() → liveLines + broadcast → createBatchEmitter(压缩/分块) → WebSocket → 浏览器
历史：session JSONL → readHistoryFromJsonl() → historyLines → addSubscriber() 回放 → createBatchEmitter → WebSocket → 浏览器
```

| 环节 | 文件 | 关键日志 | 检查方法 |
|------|------|---------|---------|
| CLI stdout | `claude2-runtime.ts` `spawnClaudeDirect()` / `readStdout()` | `[claude2-stdout] <line>` | 检查 CLI 进程是否在跑（`proc.exitCode === null`）；stderr 在 `runDir/claude2-stderr/<session>.log` |
| stdout → relay | `claude2-runtime.ts` `readStdout()` → `relay.handleStdoutLine()` | `[relay] addSubscriber: phase=... history=.. live=..` | 看 stdout 行流是否在喂 relay；generation 守卫是否误停了 reader |
| relay → WebSocket | `claude2-stream.ts` `startStream()`（`createBatchEmitter` 压缩/分块） | `[claude2-stream] blob flushed: bytes=.. sendMs=..` / `captured claudeSessionId=..` | 确认 relay 的 `emit` 被调用；batch 是否正常发 |
| WebSocket → 浏览器 | `claude2-adapter.ts` `socket.onmessage` | `[claude2-adapter] ws recv: ...` | 浏览器 Console 看是否有消息到达 |

> 完整进程模型/缓冲/时序设计见 [Claude2 进程模型与消息回放设计](./docs/design/message-replay.md)。CLI 用 `Bun.spawn` 直拉（**非 tmux**）；stdin 直写 `proc.stdin`（**无 FIFO**）；stdout 直读（**无 stdout-helper/turn 文件/pipe-pane**）。

### 上行数据流（浏览器 → CLI）

```
浏览器 sendToSocket → WebSocket → controller.message() → runtime.write() → proc.stdin → CLI
```

| 环节 | 文件 | 关键日志 | 检查方法 |
|------|------|---------|---------|
| 浏览器发送 | `claude2-adapter.ts` `sendToSocket()` | `[claude2-adapter] ws send: ...` | 浏览器 Console |
| WebSocket → server | `index.ts` `websocket.message` | — | 检查 `ws.data.kind === "claude2-stream"` 路由是否命中 |
| controller.message() | `claude2-stream.ts` `message()` | `[claude2-stream] message ${type}: ${sessionName}` | **如果没有这条日志，说明消息没到达 message()** |
| stdin 写入 | `claude2-runtime.ts` `write()` | 无显式日志 | 确认 `proc.exitCode === null` 且 `proc.stdin` 可写（直接 pipe，无 FIFO 文件） |
| CLI 读取 | CLI 进程 | stderr log | 如果没有响应，检查 CLI 进程是否存活 |

### 历史回放数据流（reconnect）

```
浏览器 WS 连接 → stream() → relay.addSubscriber()
                                  ├─ session_init{resume}
                                  ├─ history_start → historyLines(JSONL) → history_end
                                  └─ live_start → liveLines(stdout) → live_end
relay.activate() 已在 spawn 时完成：resume 才 readHistoryFromJsonl() 定格 historyLines
```

关键检查点：
- `claudeSessionId` 是否为 `none`：none → relay 不读 JSONL，`historyLines` 为空，浏览器只收到 `liveLines`（resume 才有全量历史）。
- `readStdout()` 是否在喂 relay：generation 守卫——`switchModel`/`switchPermissionMode` 重启后旧 reader 应已 return，新 generation 的 reader 才有效。
- `liveLines` 是否被 cap 5000 截断：早于上限的消息只在 JSONL、不在 relay（全新 session 长驻时尤其要注意，需重启 `--resume` 才补回）。
- API 重启后 `ensureRunning` 是否用 `--resume claudeSessionId` 重新拉起 CLI（否则历史回不来）。

### 常见陷阱

1. **API 重启丢进行中的 turn**：`Bun.spawn` 随父进程退出 → CLI 死 + relay 内存清空。已归档的 turn 在 JSONL 里完整；未完成的 turn 以 interrupted 呈现（客户端 `isResume` 标）。这是 Gen 3 刻意取舍，不是 bug。
2. **`claudeSessionId` 为 none 时无历史**：新会话首次连接（system.init 尚未到 / id 未回填）`historyLines` 为空，只有 `liveLines`。回放依赖 `--resume`。
3. **全新 session 长驻丢早消息**：relay 从不重读 JSONL，`liveLines` 上限 5000，更早的消息只在磁盘 JSONL——下次 API 重启 `--resume` 才作为 history 补回。
4. **generation 守卫**：重启 spawn 后，确认 `readStdout` 跑在新 generation；旧 generation 的 reader 会把旧进程输出灌进新 relay（已由守卫拦截，排查时先确认 generation）。
5. **dev 进程用 tmux 管理（与 claude2 spawn 无关）**：API/Web 进程必须在 `ar-dev-api` tmux session 内运行，不能在外面跑；进程变孤儿（PPID=1）后只能 `kill` 再在 tmux 内重启。注意这是开发态进程管理，claude2 本身**不**用 tmux 拉 CLI。

### 第一手信息核对要求

- 遇到协议格式、流式消息、实时流/历史回放差异、E2E 页面现象与实现不一致的问题时，必须先对齐三层第一手信息：**客户端日志、服务端日志、原始 JSONL/协议记录**，再下结论。
- 不要只看 UI 现象或凭印象猜字段；必须先确认真实消息顺序、真实字段名、哪一层做了变换、合并或过滤。
- 做 E2E 或手工调试时，不仅要看页面结果，也要同时检查客户端和服务端日志；消息/协议类问题默认把日志作为验收材料的一部分。

## 调试第三方库 Bug
- 遇到第三方库 bug 时，正确顺序：① `tvly search` 查库的 issue → ② 找同样使用该库的开源项目参考实战解法（clone 到 `~/repos`）→ ③ 读 `node_modules` 源码验证机制 → ④ 一次性实现。不要靠猜测反复试错。

## 通用工程原则

### 1. 优先修改，克制新增
- 每新增一个实体（wrapper div、组件、变量、配置项），都带入了新的属性、新的交互边界和新的失效模式。系统复杂度随实体数量指数增长。
- 动手前先问：能不能改现有元素的 attribute/className/prop 完成同样目标？能不能把新行为折叠进现有结构？如果答案是"能"，就不要新增。
- **CSS 实例**：不要为全屏功能加 `WithFullScreen` wrapper 组件（它会变成新的 flex item、新的 containing block），直接在现有气泡上挂 `useState` + portal。
- **CSS 实例**：不要用 `min-h-11 min-w-11` 强制按钮尺寸，用 `p-2` 让内容决定大小——内容驱动的尺寸在不同上下文自然自适应。

### 2. 理解机制，再调参数
- 看到"位置不对""间距不对"时，先追溯因果链：当前值为什么会产生当前效果？哪个中间层（containing block、padding box、transform、flex alignment）在影响最终结果？
- 只有确认了根因，才能一次调对参数。靠反复加减数值试错，解决一个 case 的同时几乎必然破坏另一个。
- **CSS 实例**：`position: absolute; top: 0` 定位基准是祖先的 padding box 而非 border box——知道这层机制后，`py-1.5` 的 6px 偏移直接补 `-top-1`，一步到位。

### 3. 基础设施改变环境，不是只加功能
- 框架/库/模式在提供便利的同时，会静默修改它所包裹的整个子系统的运行环境。不能只看它"做了什么"，还要看它"改变了什么"。
- 引入基础设施前，追问：它注入了什么 DOM 结构？建立了哪些新的 CSS 层叠/定位关系？拦截或重写了哪些默认行为？
- **CSS 实例**：`@tanstack/react-virtual` 不仅"只渲染可见项"，还在每个 item 上注入 `position: absolute` + `transform: translateY()`。前者改变百分比宽度解析基准，后者使内部 `position: fixed` 不再相对视口——不事先理解这两层副作用，调试弹出的位置偏差几千像素是必然结果。

## 参考实现研究方法
- Claude Code CLI / SDK 等上游文档稀疏时，不要反复试探或盲猜协议格式。
- 优先通过 deepwiki 查询参考项目（如 hapi `tiann/hapi`）对同一问题的处理方式：协议消息格式、生命周期阶段、UI 呈现策略。
- 参考项目的源码已在 `~/repos/` 内，deepwiki 查不到的细节再用 grep 读源码补充。不要从零手动扫源码。

<!-- WORKFLOW:GOVERNANCE:START -->
## 治理文档导入

- @.workflow/AGENTS.md
- @docs/AGENTS.md
- @docs/project.md

必须读取并遵循：
1. `.workflow/AGENTS.md` 负责运行态、流程态与变更工作区治理。
2. `docs/AGENTS.md` 负责长期文档、索引与沉淀治理。
<!-- WORKFLOW:GOVERNANCE:END -->
