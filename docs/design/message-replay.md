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

## 已废弃的旧机制（Gen 2，勿再引用）

以下在当前代码中**已不存在**，调试时不要再去找：

- tmux 进程容器（`spawnClaudeInTmux`）、`mkfifo` FIFO stdin
- `stdout-helper.ts`、`turn_XXX.jsonl` / `claude2-turn/` 目录
- turn 文件按 `num_turns` 与 JSONL 去重
- pipe-pane + socat + Unix socket 实时流
- relay 的 `messageBuffer` / `replaying_turns` 阶段
- "replay_start/end 内部消化，前端无感知"（现在是 `history_start/live_start` marker，前端感知）
