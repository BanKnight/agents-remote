# 数据流设计原则

> 来源：原 CLAUDE.md「数据流设计原则」节迁移（2026-09-19 harness 改造）。全栈状态同步的通用理论见根目录 `state-sync-principles.md`。

## UI = f(state)

- UI 组件的数据流必须遵循 `UI = f(state)`：同一数据类型的渲染只能有一条管道进入 UI 层。
- 如果同一数据类型（如消息）有多条管道（如 REST 历史 + WebSocket 实时），应合并为单一 state 数组，由 React 统一渲染，而不是为不同来源维护平行的渲染组件和状态管理。
- 分页、实时追加、历史回放等能力应只是对单一 state 数组的不同操作（prepend / append / reset），不应产生独立的 UI 分支。
- 使用 `useExternalStoreRuntime`（assistant-ui）或等价的外部 state 管理时，应让框架只负责渲染，业务层自己掌控 state 生命周期。
- 聊天记录以 Claude CLI 的 JSONL session 文件为唯一权威来源。不要自行"注入"或"伪造"消息；如果某条消息在 JSONL 中存在但 UI 没有显示，说明是渲染层过滤逻辑的问题。CLI 自身的 `isMeta: true/false` 分类是是否展示的第一手依据，不应以我们对 message type 的猜测替代。
- **消息处理说明统一用 live/replay 双列表格**：凡是讨论消息类型如何处理、讨论渲染语义、设计数据流时，必须使用「实时流 — 消息信号 | 实时流 — UI | 历史回放 — 消息信号 | 历史回放 — UI」四列格式。同一消息类型在实时流和回放两条路径上的行为必须明确区分，不得混为一谈。协议文档（`docs/research/claude-cli-stream-protocol.md`）中的 thinking 生命周期表格是标准模板。

## State/Render 分离（两条管道，通用原则）

- **消息 = state，不是气泡**。全部原始消息（包括内部/合成消息）先进入唯一的 state 有序日志（`rawMessages: SessionStreamServerMessage[]`），不在此阶段做渲染决策或丢弃。
- **渲染 = state 的投影（子集）**。渲染列表通过纯函数（如 `normalizeChatStream(rawMessages): ChatStreamItem[]`）从 state 派生，由 `useMemo` 管理。收 100 条消息渲染 50 条是正常的（HiddenDropped 语义）。
- **关联在 state 层用有序关系表达，不进渲染 metadata**。synthetic→parent、tool_result→tool_use、thinking_tokens→assistant 等关联都应从有序 raw 日志中的位置推导（前一条消息、tool_use_id 匹配等），或从消息自身的字段（如 `sourceToolUseID`）解析，而不是塞进气泡的 `metadata.custom` hack。
- **Pass 1 / Pass 2 是标准范式**：Pass 1 = 批量追加 raw state + 更新独立标量 state（tasks、model、skills 等）；Pass 2 = 纯函数从 raw state 派生渲染列表。不要在第一遍处理时直接 mutate 渲染列表。
- **设计从语义出发，不要从 type 机械 switch**。先做语义分类（AssistantTurn、ToolResult、SkillBody、UserPrompt、ThinkingTokens、ApiError 等），再为每个语义角色设计渲染投影逻辑，而不是对 `msg.type` 做 switch-case。
- **实时流与 JSONL 的同一条消息标记不同**：实时流可能用 `isSynthetic: true` 标记内部消息（无 `parentUuid`/`sourceToolUseID`），JSONL 可能用 `isMeta: true`（有 `sourceToolUseID`/`parentUuid`）。语义层应统一处理两种来源，不因标记不同而产生平行分支。

## 消息处理函数直接操作 state

- 消息处理函数的职责是"收到一条消息，更新所有相关 state"，而非"返回转换结果让调用方去应用"。
- 处理函数内部直接调用 state setter（`setMessagesState`、`setTasks` 等），不需要返回值、delta 对象或回调。
- 可独立测试的转换逻辑（如 content block → UI part、tool_use → task op）抽取为独立的纯函数并导出；编排逻辑（"对这条消息调哪些纯函数、结果写哪个 state"）留在处理函数内部，通过集成测试覆盖。
- 新增 state 类别时，在处理函数内部加一行 setter 调用即可，不需要改返回类型、调用方签名或 delta 结构。

## 从语义出发设计和命名

- 设计任何结构（函数、模块、状态、接口、数据流）时，先从语义出发：理解它在系统中扮演什么角色、属于哪个语义分类，再据此组织结构和命名，而不是从机械的操作步骤出发。
- 命名要表达事物在系统中的**角色/语义**，而不是它**做了什么操作**。函数名应回答"这是什么"，而非"它执行了哪个动作"。
- 当一段逻辑因为缺少上下文而无法完成其语义职责、不得不泄漏到外层打补丁时，根因是"语义不足 + 上下文传递不够"。正确做法是把该逻辑移到拥有上下文的位置，让它的语义边界自洽，而不是在外层堆判断。
- 例：消息分发应先识别数据的语义分类（如 Claude CLI 的 `external` vs 非 external 消息），为每个分类设计一个拥有完整 state 上下文的 handler，分发层只做按语义分类的 dispatch，不直接调用通用转换函数；通用转换函数只能作为 building block 被 handler 调用。
