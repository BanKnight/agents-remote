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
CLI stdout → stdout-helper → turn_XXX.jsonl → relay tail/buffer → broadcast → WebSocket → 浏览器
                              └─ pipe-pane ───────────┘（冗余路径）
```

| 环节 | 文件 | 关键日志 | 检查方法 |
|------|------|---------|---------|
| CLI stdout | `claude2-runtime.ts` `spawnClaudeInTmux()` | stderr log 在 `claude2-turn/claude2.stderr.log` | 检查 CLI 是否在运行，是否有错误输出 |
| stdout → turn file | `stdout-helper.ts` | 无显式日志 | `ls -lt claude2-turn/<session>/` 看是否有新 turn_XXX.jsonl 生成 |
| turn file → relay | `session-relay.ts` `startTailingTurns()` / `handlePipeData()` | `[relay] broadcast` (如有日志) | 检查 `tailFile` 是否在 poll 对应 index 的文件；检查 pipe-pane 是否活着 |
| relay → WebSocket | `claude2-stream.ts` `startStream()` callback | `[claude2-stream] captured claudeSessionId=...` | 确认 callback 的 `send(socket, parsed)` 被调用 |
| WebSocket → 浏览器 | `claude2-adapter.ts` `socket.onmessage` | `[claude2-adapter] ws recv: ...` | 浏览器 Console 看是否有消息到达 |

### 上行数据流（浏览器 → CLI）

```
浏览器 sendToSocket → WebSocket → controller.message() → runtime.write() → FIFO → CLI stdin
```

| 环节 | 文件 | 关键日志 | 检查方法 |
|------|------|---------|---------|
| 浏览器发送 | `claude2-adapter.ts` `sendToSocket()` | `[claude2-adapter] ws send: ...` | 浏览器 Console |
| WebSocket → server | `index.ts` `websocket.message` | — | 检查 `ws.data.kind === "claude2-stream"` 路由是否命中 |
| controller.message() | `claude2-stream.ts` `message()` | `[claude2-stream] message ${type}: ${sessionName}` | **如果没有这条日志，说明消息没到达 message()** |
| FIFO 写入 | `claude2-runtime.ts` `write()` | 无显式日志 | 检查 FIFO 文件是否存在：`ls -la claude2-fifo/<session>.stdin` |
| CLI 读取 | CLI 进程 | stderr log | 如果没有响应，检查 CLI 进程是否存活 |

### 历史回放数据流（reconnect）

```
WebSocket 连接 → stream() → relay.activate() → JSONL 加载 → buffer
                       ↓
                  addSubscriber() → onData 逐行回放 → WebSocket → 浏览器
```

关键检查点：
- `claudeSessionId` 是否为 `none`（如果为 none，JSONL 不会加载，只有 turn file 数据）
- `detectSystemInit` 是否找到了 system.init（它现在扫描所有 turn file，不再只看 turn_000.jsonl）
- `ensureRunning` 是否因为 session 已在内存中而跳过了 claudeSessionId 更新
- `tailFile` 是否因文件尚未创建就提前退出（`!firstPoll` 导致 return）

### 常见陷阱

1. **API 重启后 relay 丢失**：relay 在内存中，重启后重建。`activate()` 从 JSONL + turn files 恢复，但 `claudeSessionId` 可能还是 `none`。
2. **`ensureRunning` 提前 return**：如果 session 已注册，不会更新 `claudeSessionId`。修复：即使 session 存在，也更新缺失的字段。
3. **`tailFile` 对新文件的等待不足**：第一次 poll 文件不存在，第二次 poll 就认为"被删除"而退出。修复：用 `firstPoll` 区分"从未见过"和"见过后被删除"，给前者 5 分钟创建窗口。
4. **系统命令用 tmux 管理**：API/Web 进程必须在 `ar-dev-api` tmux session 内运行，不能在外面跑。进程变孤儿后无法控制。

### 第一手信息核对要求

- 遇到协议格式、流式消息、实时流/历史回放差异、E2E 页面现象与实现不一致的问题时，必须先对齐三层第一手信息：**客户端日志、服务端日志、原始 JSONL/协议记录**，再下结论。
- 不要只看 UI 现象或凭印象猜字段；必须先确认真实消息顺序、真实字段名、哪一层做了变换、合并或过滤。
- 做 E2E 或手工调试时，不仅要看页面结果，也要同时检查客户端和服务端日志；消息/协议类问题默认把日志作为验收材料的一部分。

## 调试第三方库 Bug
- 遇到第三方库 bug 时，正确顺序：① `tvly search` 查库的 issue → ② 找同样使用该库的开源项目参考实战解法（clone 到 `~/repos`）→ ③ 读 `node_modules` 源码验证机制 → ④ 一次性实现。不要靠猜测反复试错。

## CSS 布局陷阱

### position:fixed 在 transform 祖先内失效
- CSS 规范：`transform` 创建新的 containing block，导致内部的 `position: fixed` 相对于 transform 祖先定位，而不是视口。
- 虚拟化列表（`@tanstack/react-virtual`）使用 `transform: translateY()` 做滚动偏移，任何内部的 popover/tooltip 如果用 `position: fixed`，坐标会与 `getBoundingClientRect()`（视口坐标）产生数千像素偏差。
- **规则**：虚拟化列表内的 `position: fixed` 组件必须通过 `createPortal(document.body)` 渲染到虚拟化 DOM 树外部。

### 不要在 flex item 外随意加 wrapper div
- 往 flex child 外包裹一个 div，会改变哪个元素是 flex item。原来在 flex item 上的 `max-w-[90%]`、背景色、圆角等类如果还留在内层，百分比值会解析到错误的 containing block（wrapper 而非 flex container），破坏宽度和定位。
- 如果必须包裹，视觉类必须传给 wrapper，让 wrapper 成为承担这些样式的 flex item。

### 组件尺寸用内容驱动，不用写死的 min 值
- `min-h-11 min-w-11` 等强制最小尺寸在不同上下文中表现不一致：气泡外可能 OK，tool 卡片内就过大。用 padding + icon 自然尺寸让组件在各场景都自适应。

### absolute 定位的基准是 padding box
- `position: absolute; top: 0; right: 0` 相对于最近 positioned 祖先的 **padding box**（content 区），不是 border box。如果祖先有 `px-3 py-1.5`，按钮会缩进在视觉边界内——用负值（`-top-1`）补偿。

### 定位问题先确认轴向
- 用户说"不够右上角"时，先确认是 X 轴还是 Y 轴的问题，不要默认两个轴都错。

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
