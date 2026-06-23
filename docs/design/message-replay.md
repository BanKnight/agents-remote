# Claude2 进程模型与消息回放设计

本文档定义 Claude2 Agent Session 的进程模型与消息管线架构，并与实现保持同步。

> **演进说明**：当前为 Gen 3——直接 `Bun.spawn` 拉起 CLI + 直读 stdout + JSONL 历史缓冲 + 内存 live 缓冲 + 单一 WS 流。它取代了早期的 Gen 2（tmux 进程容器 + `stdout-helper` + turn 文件 + `num_turns` 去重，见 git `7397bd4`→`4336830`）。简化后 CLI 进程存活期不再与 API 解耦，换来更简单的管线；会话状态改由 JSONL 在 `--resume` 时恢复。Gen 2 的机制在末节「已废弃」列出，调试时勿再引用。

## 问题与取舍

直接 `Bun.spawn("claude")` 的固有约束：

- API 进程退出 → CLI 子进程随之退出 → 进行中的 turn 被中断（无法像 tmux 方案那样保活）。
- relay 的内存缓冲丢失 → 重连回放需从持久化来源重建。

**Gen 3 取舍**：放弃 tmux 保活带来的「进程级」持久化，改为「状态级」持久化——CLI 用 `--resume <claudeSessionId>` 从自己的 JSONL 恢复完整历史，API 侧 relay 也从同一份 JSONL 重建历史缓冲。代价是 API 重启丢一个进行中的 turn，收益是管线大幅简化（无 FIFO、无 turn 文件、无 stdout-helper、无 `num_turns` 去重、无 pipe-pane）。

## 目标

1. 服务端对客户端表现为**单一数据源**（一个 WebSocket），客户端不做多源拼接。
2. 消息回放基于**文件系统（JSONL）+ 内存缓冲**，不依赖跨重启的内存状态。
3. API 对一个 session 的数据完整性负责：历史（JSONL）+ 实时（stdout）由 API 整合后统一推送。

## 核心设计原则

### 单一数据源

```
Session Message Pipeline（session 级别，非 connection 级别）:
  JSONL 文件（CLI 归档，完整历史） ─┐
  CLI stdout（实时输出）          ─┴→ relay 整合 → 单条 WS 流 → 所有 subscriber
```

多个 WebSocket 连接订阅同一 session pipeline，各自拿到相同的 历史 + 实时消息。

**禁止模式**：客户端分别调用 REST `/messages` 拿 JSONL + WS 拿实时流然后自行拼接去重。

### session 级重建

relay 随进程 spawn 一起创建并 `activate()`（`claude2-runtime.ts` `spawnAndStart`），不是每个 WebSocket 连接时。激活时若该 session 有 `claudeSessionId`（resume），从 JSONL 加载历史到 `historyLines`；否则历史为空。之后每个新 WebSocket 连接直接订阅已有 pipeline。

### 两层缓冲

relay 持有两个字符串数组缓冲：

| 缓冲 | 来源 | 填充时机 | 上限 | 语义 |
|---|---|---|---|---|
| `historyLines` | CLI 的 session JSONL（`~/.claude/projects/.../<uuid>.jsonl`） | `activate()` 一次性 `readFileSync` 读入（仅 resume 会话） | 无（全量历史） | 已归档的完整过去 |
| `liveLines` | CLI 的 stream-json stdout | CLI 跑 turn 时 `handleStdoutLine()` 逐行 push | 5000 行（`slice(-5000)`） | API 存活期间捕获的实时输出 |

二者是**时间上的前后衔接**：历史（JSONL，已落盘的过去）→ live（stdout，正在输出）。

> ⚠️ **一致性前提**：`historyLines` 在 activate 时一次性定格，之后不再增长；CLI 之后写入 JSONL 的新内容只会出现在 `liveLines` 里（stdout 实时捕获）。所以同一行不会同时进两个缓冲，relay 不需要去重。副作用：一个**全新** session（初始无 `claudeSessionId`，JSONL 从不重读）在单次长驻 API 生命期里，早于 `liveLines` 5000 行上限的消息只留在 JSONL、不在 relay——直到下次 API 重启 `--resume` 时才作为 history 补回。

## 服务端状态：生命周期与膨胀管理

本项目服务端状态遵循 [全栈状态同步设计原则](../../state-sync-principles.md)。把其中的「生命周期 / 阶段」维度落到本领域的三层服务端数据上：

| 数据 | 初始化 | 正常运行 | 特殊时期（业务/性能驱动） |
|---|---|---|---|
| **history** | 从 JSONL 加载（activate 时；API 重启 / `--resume` 重读**都属于初始化**，不是特殊时期） | 冻结，不再增长（CLI 之后的新内容只进 live） | **主动缩容**：性能吃紧时寻找时机 trim/compact |
| **live** | 空启动 | 瞬时消息到达即缓存（`handleStdoutLine`），cap 5000 | **消息合并压实**：多个 `thinking_token` 自合并、最后与 `thinking` 合并 |
| **瞬时消息** | — | CLI 当前正在产生、尚未沉淀的数据，产生即流入 live（概念性上游阶段，实现里折叠进 live） | — |

**live 与瞬时同源**：二者都是 CLI **存活期**产生的 stdout——live 是 connect 时已缓冲的部分，瞬时是 connect 后实时到达的部分（瞬时在实现里折叠进 live），只是时间切片不同。它们都含 `result`（turn-close 信号），因此客户端 `computeRunningCount` 的 running 判定**只扫 live + 瞬时段**；history（JSONL 归档，无 `result`）永不参与——否则扫到归档里未闭合的 assistant 会误判为 running（resume 进入显示假动画的根因）。这与 tool interrupted 共享同一 resume 不变量，见下文「system.init 与 turn 边界」。

**关键区分**：初始化是「把状态建立起来」；特殊时期是「为业务/性能目的**主动改写**已建立的状态」。二者不是一回事——API 重启、`--resume` 重读都只是初始化。

**核心问题**：history + live 合起来量太大，是我们当前的性能瓶颈。解决方向是**服务端先用特殊时期管理自身 history/live 的大小**（先缩服务端状态），再决定对客户端的同步策略（全量 / 按需）。具体缩容与同步方案见下文「特殊时期 history 缩容」小节。

## 整体数据流（Gen 3）

```
API 启动 / 新 session
  │
  ├─ spawnAndStart()
  │    ├─ spawnClaudeDirect():  Bun.spawn(claude --output-format stream-json ...)
  │    │     stdin=pipe  stdout=pipe  stderr=pipe  cwd=projectPath
  │    ├─ new Claude2SessionRelay → relay.activate()
  │    │     └─ readHistoryFromJsonl() → historyLines（resume 才读）
  │    ├─ readStdout(): 读 proc.stdout 行流 → captureSystemInit + relay.handleStdoutLine
  │    └─ pipeStderrToFile(): proc.stderr → runDir/claude2-stderr/{session}.log
  │
  ├─ 浏览器 WS 连接 → stream() → relay.addSubscriber(onData)
  │    ├─ emit: session_init{resume}
  │    ├─ emit: history_start → historyLines 逐行 → history_end
  │    ├─ emit: live_start    → liveLines 逐行   → live_end
  │    └─ 注册 subscriber，之后 broadcast() 实时推送
  │
  └─ CLI 持续输出 → handleStdoutLine() → push liveLines(cap 5000) + broadcast → 所有 subscriber
```

`history_start/end`、`live_start/end` 是发给客户端的 batch marker；在 `claude2-stream.ts` 的 `createBatchEmitter` 里，两个 batch 的数据行被切成 ~256KB 块、各自 `gzipSync` 成独立二进制帧发出（详见 [Claude2 Replay 性能](../research/claude2-replay-performance.md)）。

## 进程模型

### spawn

`spawnClaudeDirect()`（`claude2-runtime.ts`）用 `Bun.spawn` 直接拉起 CLI，argv 数组（非 shell 拼接）：

```
claude --output-format stream-json --input-format stream-json \
       --verbose --permission-prompt-tool stdio \
       [--permission-mode X] [--model Y] [--resume <claudeSessionId>]
```

- `stdin/stdout/stderr` 全部 pipe，由 API 直接读写。
- `--resume <claudeSessionId>`：有历史时恢复，CLI 从自己 JSONL 加载状态。
- 进程元数据（`Claude2Process`）记 model/permissionMode/claudeSessionId/generation。

### generation 守卫

每次 spawn 递增 `nextGeneration`。`readStdout` 把 generation 闭包进读取循环，遇到非当前 generation 立即 return。`switchModel`/`switchPermissionMode` 重启时旧 stdout reader 自动停止，避免把旧进程输出灌进新 relay。

### stdin / stderr

- `write()` 直接 `proc.stdin.write(data)`；上游 `claude2-stream.ts` `message()` 把客户端 JSON 加 `\n` 后写入。
- `pipeStderrToFile()` 把 `proc.stderr` 异步追加到 `runDir/claude2-stderr/<sessionName>.log`（8KB 缓冲），不阻塞主循环，仅供调试。

## SessionRelay（服务端核心）

`Claude2SessionRelay`（`session-relay.ts`），每 session 一个实例：

```
phase: "init" → "active" → "destroyed"
historyLines: string[]   // activate 时从 JSONL 定格
liveLines:   string[]    // stdout 实时 push，cap 5000
subscribers: Set<{onData, onError}>

activate(projectPath, claudeSessionId):
  if resume && claudeSessionId: historyLines = readHistoryFromJsonl()
  phase = "active"

addSubscriber(onData, onError):
  emit session_init{resume: startedAsResume}
  emit history_start{count} → historyLines 逐行 → history_end
  emit live_start{count}    → liveLines 逐行   → live_end
  subscribers.add; return { close }

handleStdoutLine(line):       // 由 readStdout 调用
  liveLines.push(line); capLive(); broadcast(line)

setClaudeSessionId(path, id): 更新 claudeSessionId（ensureRunning 后回填，不重读 JSONL）
injectLine(line): broadcast only（不缓冲，用于注入合成消息）
```

### 多 subscriber

1. 第一个连接 → `stream()` → 复用/建 relay + `activate()` → 历史 + 实时。
2. 后续连接 → 复用同一 relay + `addSubscriber()` → 拿到 `historyLines + liveLines` → 接实时广播。
3. 全部断开 → relay 保留（进程仍在），缓冲留存；进程退出或 `close()` 才 `destroy()`。

## system.init 与 turn 边界

- **system.init 捕获**：两路——`claude2-runtime.ts` `captureSystemInitFromLine`（写进程元数据 + `onSystemInit` 回调）；`claude2-stream.ts` realtime 分支（捕获 claudeSessionId/model 写 registry）。`system.init` 与 `result` 都是 **stdout 实时消息，不写入 JSONL**（见 [CLI stream-json 协议](../research/claude-cli-stream-protocol.md) 持久化表）。
- **turn 边界**：持久化 JSONL 里 turn 尾是 `assistant.message.stop_reason === "end_turn"`，**不是** `result`（result 仅在 live 流）。resume 回放的 turn-end 由客户端 `isResume` 标志推导（`applyToolLifecycle` 对所有未收 tool_result 的工具无条件标 interrupted），不依赖 result 边界。
- **running 状态**（与 tool interrupted 共享同一 resume 不变量，二者是同一棵语义树的两支）：`computeRunningCount` 只在 **live + 瞬时段**计数——`result` 是 stdout-only、不在 history，所以只有 live + 瞬时（都含 `result`）能正确开/关 turn；history 段（JSONL 归档，无 `result`）**永不参与**，否则扫到归档里未闭合的 assistant 会误判为 running（这正是 resume 进入显示假三点动画 + 停止按钮的根因）。resume 进入时 running=false 的依据与 tool interrupted 同源：resume 后 CLI 是新进程，live + 瞬时段无未关闭 turn，并非靠"扫到 result"。详见 `claude2-adapter.ts` `computeRunningCount` docstring。

## 正常运行时序

```
1. 浏览器 WS open → ensureRunning（进程已在则复用）→ stream() → addSubscriber
2. relay 发 session_init → history（resume 时全量 JSONL）→ live（当前 liveLines）
3. CLI 输出 assistant chunk → readStdout → handleStdoutLine → broadcast → 浏览器实时收到
4. CLI 输出 result（turn 结束）→ 同上；claude2-stream 注入 ended
5. CLI 把该 turn 写入 JSONL（归档）→ relay 不重读 JSONL，故不影响已发出的 live
```

## 重连 / API 重启时序

```
API 重启：
  - CLI 子进程退出（Bun.spawn 随父进程）→ 进行中的 turn 丢失
  - relay 内存（historyLines/liveLines）清空
  - session JSONL 仍在磁盘，CLI 已归档的 turn 完整保留

浏览器下次连接 → ensureRunning：
  - 进程不在 → spawnAndStart（--resume claudeSessionId）→ CLI 从 JSONL 恢复
  - relay.activate → historyLines = 全量 JSONL
  - 浏览器拿到完整历史；上一个未完成 turn 以"被中断"状态呈现（isResume 标 interrupted）
```

## API 端职责对照

| 方法（`claude2-runtime.ts`） | 行为 |
|---|---|
| `spawnClaudeDirect()` | argv 数组 → `Bun.spawn`，全 pipe |
| `startAgent(metadata)` / `ensureRunning()` | 复用或 spawn + 建 relay + 读 stdout |
| `write(session, data)` | `proc.stdin.write(data)` |
| `stream(session, onData, onError)` | 取/建 relay + `addSubscriber` |
| `switchModel` / `switchPermissionMode` | `restartWith`：destroy relay + kill proc + spawn with `--resume` + 新参数 |
| `readStdout()` | 读 `proc.stdout` 行流，generation 守卫，喂 relay |
| `close(session)` | kill proc + `relay.destroy()` |

`claude2-stream.ts`：WS open → `stream()` 订阅 relay；`createBatchEmitter` 在 relay 的 onData 外层做 batch 压缩/分块 + system.init 捕获 + result→ended 注入。WS message → `runtime.write()`。

## 特殊时期 history 缩容（compact-block windowing + 标量重建）

> 本节展开上文「服务端状态：生命周期与膨胀管理」承诺的缩容与同步方案。属于**即将实施的 v1 设计**，部分尚未落地；与上文已稳定的 Gen 3 描述分开存放，便于迭代。

### 背景与目标

history（JSONL 全量）+ live（cap 5000）合起来在长会话下是打开慢的主因（见 [Claude2 Replay 性能](../research/claude2-replay-performance.md)：传输是瓶颈，gzip 已把单批压到 ~1.7s，但不 scale）。**特殊时期**的目标是用 compact 天然形成的边界，把服务端在内存里持有/回放的 history **缩到尾部一个 compact 块**，同时保证客户端断连重连后仍能还原**当前会话标量**（model / permissionMode / skills / slash / mcp）。

v1 范围（明确不做的事在末尾）：
- 服务端 init 时只加载 JSONL **尾部一个 compact 块**（最后一个 `compact_boundary` → end）。
- live 流里出现新 `compact_boundary` 时，**主动 trim** historyLines 到该边界。
- 客户端**只渲染最后一个 compact 块**（render 决策，非 state 改写）。
- 标量重建：model/permissionMode 走**种子 init + 现有 fold**；skills/slash 走**自建 discovery + REST**。

### compact-block windowing

**切分边界 = `compact_boundary`**。CLI 每次 compact 都在 JSONL 写一条 `system.compact_boundary`（`parentUuid:null`、`logicalParentUuid=tailUuid`、带 `compactMetadata`）；紧随其后一条 `isCompactSummary:true` 的 user 消息是 compact 摘要。协议真相见 [CLI stream-json 协议 · compact_boundary](../research/claude-cli-stream-protocol.md)。

关键事实（4 个真实 session 实测）：
- compact 块平均 1.4–2.3MB、postTokens 23–30k（**天然有界**）。
- compact 不让 CLI 进程退出（事实）→ relay **不会**因 compact 自动 reload → trim 必须显式做。
- JSONL 是**全量真相**：被 compact 压掉的消息仍留在磁盘 JSONL（f4dd7cbe 首 compact 前还有 593 条在文件里）→ 是日后「回填更早消息」的唯一来源。

服务端机制：

| 阶段 | 行为 |
|---|---|
| init（activate） | 一次性扫 JSONL 定位**最后一条** `compact_boundary` 的字节偏移，只把其后到 end 载入 `historyLines`（内存有界；全文件扫描是时间成本，非内存） |
| 正常运行 | historyLines 冻结；新内容只进 liveLines |
| 特殊时期（live 出现新 compact_boundary） | trim：丢弃 historyLines 里该边界之前的所有行，保留 boundary→当前 |

客户端**只渲染最后一个 compact 块**：以 compact_boundary 为分块标记，render 时只投影最后一块（连同其后的 live）。这是渲染层投影决策，不改 raw state 日志——遵循「消息=state、渲染=投影」。

### 标量重建：种子 init + 流 fold

**问题**：`system.init` 是 **stdout-only、不在 JSONL**（实测 `subtype:"init"` 在 JSONL 里 = 0）。windowing 后 tail 里没有 init → 客户端断连重连 fold 没有**种子**。客户端 `applyMessageScalarState`（`claude2-adapter.ts`）本来就是**对每条消息做 fold**（processBatch Phase 2），但缺种子时 model/permissionMode/skills/slash/mcp 全空。

**模型 = 事件溯源**：客户端收到 = `[state-init 种子] + [消息流]`；消息流里自带对 state 的 update；客户端 fold 出**当前** state。stale 不是「被接受」，而是「还没 fold 到的那条 update」。

**状态信号的持久化不对称**（f4dd7cbe 实测）：

| 信号 | JSONL 里 | tail 能 fold | 角色 |
|---|---|---|---|
| `system.init` | 0 | ❌ stdout-only | 种子：model/permissionMode/skills/mcp/slash 全量 |
| `system.status` | 0 | ❌ stdout-only | permissionMode（被下行 permission-mode 覆盖） |
| `permission-mode` | 336 | ✅ | permissionMode 的 JSONL 真相源 |
| `attachment`（invoked_skills / mcp_instructions_delta） | 243 | ✅ | skills/mcp 增量 |
| `assistant`（EnterPlanMode 等） | 2141 | ✅ | permissionMode fold |

所以 fold 机器早就在了，且它 fold 的 update 信号**多数 JSONL 持久**——tail 能把它们 fold 到当前。

#### 标量分流

| scalar | 来源 | 通路 | 理由 |
|---|---|---|---|
| **model** | init（respawn 刷新）+ fold | 种子 init 注入 replay 头 | 协议有、单调（只 respawn 变）、鲁棒 |
| **permissionMode** | `permission-mode`(JSONL) + status + EnterPlanMode fold | 种子 init 注入 + 现有 fold | 流里海量修正信号 |
| **skills / slash** | **自建 discovery**（SKILL.md frontmatter / 命令定义） | **REST**（config 域） | init 无 description、协议补不全 |
| **mcp** | （v1 不做）后续自建 discovery（.mcp.json + tools/list） | REST | 同上，范围后置 |

**种子 = 当前 model + 当前 permissionMode**（语义等价于「现在发的」system.init，不妥协）：
- 客户端处理顺序 `[种子] → historyLines → liveLines` 连续到 now；fold 是 **last-wins**，tail+live 最后一条 `permission-mode` = 当前，覆盖种子；整段零 `permission-mode` 事件时种子生效，而此时「当前 = 窗口起点」，种子放当前值也对。
- model 单调（只 respawn 变）：respawn 在窗口内 → tail 有新 init → fold 到当前；不在窗口内 → 种子（最新 init 的 model）= 当前。不会 regress。
- 服务端只需 fold 这两个标量（model 已截 init；permissionMode 加 live fold）。API 重启 `--resume` 重发 init 拿当前值，且 tail 的 `permission-mode`（JSONL 持久）也会 fold 纠正，双保险。

**为什么 skills/slash 必须自建、不能靠 init**：`system.init` 的 `skills`/`slash_commands` 是**纯名字数组**、`mcp_servers` 是 `{name,status}`——都**无 description**（deepwiki 核实 `buildSystemInitMessage`）。协议里虽有 `skill_listing`/`skill_discovery` attachment 带 skill 描述、MCP `tools/list` 带 tool 描述，但：(1) slash_command 描述无专门载体；(2) 这些是给模型看的 system-reminder 格式化文本，非结构化 `{name,description}`；(3) `skill_listing` 抑制重复、通常只头部一次 → tail 窗口里没有（实测 = 0），要用得回填。而 CLI 自己 `--resume` 重建这些时**重跑 discovery**（读 SKILL.md / 命令定义 / MCP tools/list），不解析自己的 attachment。所以自建走同款 discovery 是唯一能拿到结构化、完整、带 description 数据的路。skills/slash 属 config 域，走 REST，与消息流解耦。

### v1 不做（已知限制 / 后续）

- **回填更早消息**：v1 只加载/渲染最后一个 compact 块；更早的消息在磁盘 JSONL 里完整保留，是日后「加载更早」的唯一来源。
- **mcp 自建 discovery**：v1 只做 skills + slash_commands；mcp（解析 .mcp.json + 起 MCP 拿 tools/list）后续。
- **mid-session config 变更 staleness**：skills/slash 走自建 discovery，可按需重读文件系统刷新（比 init 的 spawn-time 快照强）；model/permissionMode 由 fold 实时纠正。中断的 turn 仍以 interrupted 呈现（Gen 3 取舍，不变）。

## 已废弃的旧机制（Gen 2，勿再引用）

以下在当前代码中**已不存在**，调试时不要再去找：

- tmux 进程容器（`spawnClaudeInTmux`）、`mkfifo` FIFO stdin
- `stdout-helper.ts`、`turn_XXX.jsonl` / `claude2-turn/` 目录
- turn 文件按 `num_turns` 与 JSONL 去重
- pipe-pane + socat + Unix socket 实时流
- relay 的 `messageBuffer` / `replaying_turns` 阶段
- "replay_start/end 内部消化，前端无感知"（现在是 `history_start/live_start` marker，前端感知）
