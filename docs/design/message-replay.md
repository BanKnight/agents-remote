# Claude2 进程持久化与消息回放设计

本文档定义 Claude2 Agent Session 的进程持久化方案与消息管线架构。

## 问题

当前 Claude2 使用 `Bun.spawn("claude", ...)` 直接启动子进程。当 API 重启时：
- CLI 子进程被 kill → 进行中的任务丢失
- 内存 `messageBuffer` 清空 → 重连回放失效
- 只能靠 `--resume` checkpoint 恢复，中间状态全部丢失

## 目标

1. CLI 进程存活期与 API 进程解耦（tmux 作为进程容器）
2. 消息回放不依赖内存 buffer，全部基于文件系统
3. 服务端对客户端表现为**单一数据源**（一个 WebSocket），客户端不做多源拼接
4. 服务端内部以 JSONL + turn 文件 + 实时流三者为完整数据集，API 对数据完整性负责

## 核心设计原则

### 单一数据源

```
Session Message Pipeline (session 级别，非 connection 级别):
  JSONL 文件 (CLI 归档) ─┐
  turn 文件 (stdout 缓冲) ─┼→ API 整合 → 单条 WS 流 → 所有 subscriber
  实时 pipe-pane  ────────┘

多个 WebSocket 连接 → 订阅同一 session pipeline → 各自拿到相同的历史 + 实时消息
```

**不被允许的模式**：客户端分别调用 REST `/messages` 拿 JSONL + WS 拿 turn 文件回放 + WS 拿实时流，然后自行拼接去重。

### Session 级别重建

重建 (JSONL 加载、turn 文件消费、进入实时) 发生在 **session runtime 被激活时**，不是每个 WebSocket 连接时。

触发时机：
- API 启动后恢复已有 session
- `ensureRunning` 发现 tmux session 存活但 API 端无状态

每个新 WebSocket 连接直接订阅已有 pipeline，拿到的消息从 session buffer 开始。

### 数据完整性职责

API 视角下，一个 session 的完整数据由三部分组成：

| 层 | 来源 | 含义 | 何时出现 |
|---|------|------|---------|
| JSONL | CLI `~/.claude/projects/.../xxx.jsonl` | CLI 自行维护的归档，完整消息 | turn 完成后 CLI 写入 |
| turn 文件 | `stdout-helper` 输出 | stdout 还未进入 JSONL 的缓冲 | 正在输出的内容 |
| 实时流 | pipe-pane + Unix socket | 当前正在输出的 raw stdout | 一直连接时 |

三者的关系是**时间上的前后衔接**：
```
已归档的过去 (JSONL) → 已输出但未归档的中间态 (turn 文件) → 正在输出的现在 (pipe-pane)
```

API 的责任：
1. 读取 turn 文件内容
2. 对比 JSONL，确认是否已归档
3. JSONL 已有 → 删除 turn 文件（数据不丢，turn 使命完成）
4. JSONL 还没有 → 保留 turn 文件，内容需要发给客户端
5. turn 文件发完后，无缝衔接到实时流

### Turn 文件删除条件

**唯一依据：JSONL 是否已包含对应数据。**

- 对比 turn 文件中 result 的 `num_turns` 与 JSONL 最后一条 result 的 `num_turns`
- `turn.num_turns ≤ jsonl.last_num_turns` → 已归档，删除 turn 文件
- 与"是否已发给客户端"无关

正常运行时（API 持续在线消费），turn 文件个数常态为 0——因为 API 实时消费，每个 turn 完成后很快被 JSONL 归档，turn 文件随即被删。turn 文件只在 API 断开时堆积。

## 整体数据流

```
CLI stdout
  │
  ├──→ stdout-helper ──→ turn 文件 (按 result 边界切分，max 3 个已完成)
  │                           │
  │                           └── API poll/read ──→ 对比 JSONL ──→ emit / delete
  │
  ├──→ CLI JSONL (~/.claude/projects/.../xxx.jsonl) ← CLI 自身归档
  │         │
  │         └── API read ──→ 历史基线 ──→ emit
  │
  └──→ pipe-pane + socat → Unix socket → API ──→ 实时 emit
```

## stdout-helper

### 职责

位于 CLI stdout 与文件系统之间：**检测 result 行 → 切换输出文件**。无缓冲、无消息解析、无状态管理。

### 行为

```
counter = 0
current_file = "turn_000.jsonl"

for each line from stdin:
    if line is empty: continue
    appendFileSync(current_file, line + "\n")

    if line contains {"type":"result"}:
        counter++
        current_file = f"turn_{counter:03d}.jsonl"
        deleteOldestCompleted()  // 如果完成文件 > 3，删最旧的
```

### 关键决策

- **按 result 切分**：system.init 归属明确，多轮边界可靠
- **只追加、不截断**：helper 不做消息解析或去重
- **每个 turn 一个文件**：已完成的有 result 结尾，进行中的没有
- **最多保留 3 个已完成文件**：helper 在切换文件后清理，同步操作避免竞态
- **使用 `appendFileSync`**：确保文件在 `readdirSync` 之前已落盘

### 文件布局

```
/run/user/1000/agents-remote/claude2-turn/{sessionName}/
  turn_000.jsonl   ← system.init (可能无 result)
  turn_001.jsonl   ← user_1 + assistant + tool_use + tool_result + result_1 ✓
  turn_002.jsonl   ← user_2 + assistant + tool_use + tool_result + result_2 ✓
  turn_003.jsonl   ← user_3 + assistant... (进行中，无 result)
```

## tmux 集成

### Session 创建

```
tmux new-session -d -s {tmuxSessionName} -c {projectPath} \
  "mkdir -p {turnDir} && \
   rm -f {fifoPath} && \
   mkfifo {fifoPath} && \
   exec 3<> {fifoPath} && \
   claude --output-format stream-json --input-format stream-json \
          --verbose --permission-prompt-tool stdio \
          --model {model} --permission-mode {permissionMode} \
          < {fifoPath} \
          2>> {stderrLog} | \
   bun run stdout-helper.ts {turnDir}"
```

- `mkfifo` 创建 stdin 命名管道
- `exec 3<>` 以读写模式打开 FIFO 作为 keeper——API 断开时 CLI 不会看到 EOF
- stderr 重定向到日志文件（调试用）
- stdin 写入通过 `appendFile(fifoPath, data)` 完成

### 实时流

复用 `pipe-pane + socat + Unix socket`（与 TmuxRuntime 共享 `TmuxSharedPipe`）。

### 切换 model / permissionMode

kill tmux session → `spawnClaudeInTmux` with `--resume {claudeSessionId}` + 新参数。

## Session Message Pipeline（服务端核心）

### SessionRelay 类

每个 Claude2 session 一个 relay 实例，负责消息管线：

```
class Claude2SessionRelay:
  - subscribers: Set<callback>
  - messageBuffer: Message[]  // 最近的完整消息，新 subscriber 从这里开始
  - phase: "init" | "replaying_turns" | "live"

  activate():
    1. 加载 JSONL → push 所有完整消息到 buffer → emit 给 subscribers
    2. 列 turn 文件，遍历:
       a. 读取文件内容
       b. 提取最后一条 result 的 num_turns
       c. 对比 JSONL 最后一条 result 的 num_turns
       d. 如果已覆盖 → 删除文件
       e. 如果未覆盖 → emit 文件内容给 subscribers
          - 有 result 结尾 → emit 完删除
          - 无 result 结尾 → 进入 tail 模式 → 读到 result 后删除
    3. turn 文件全部处理完 → 订阅 pipe-pane → 实时 emit
    4. phase = "live"

  subscribe(callback): 注册 → 如果 buffer 非空，先发送 buffer 内容
  unsubscribe(callback): 注销
```

### 多 subscriber 处理

1. **第一个 subscriber 连接** → relay.activate() → 历史 + 实时
2. **后续 subscriber 连接** → relay.subscribe() → 从 buffer 拿已有消息 → 接上实时流
3. **所有 subscriber 断开** → relay 保持运行（tmux session 仍在），buffer 保留最近 N 条

## API 端实现

### claude2-runtime.ts

| 方法 | 行为 |
|------|------|
| `spawnClaudeInTmux(...)` | 构建 shell 命令 → `tmux new-session -d` |
| `startAgent(metadata)` | 调用 spawnClaudeInTmux → detectSystemInit |
| `ensureRunning(...)` | `tmux has-session` → 不存在则 spawn |
| `exists(sessionName)` | 内存 + `tmux has-session` |
| `close(sessionName)` | kill tmux + 清理 FIFO + 清理 turn dir |
| `write(sessionName, data)` | `appendFile(fifoPath, data)` |
| `stream(sessionName, onData, onError, onReplayEnd?)` | 交给 SessionRelay 处理 |
| `switchModel / switchPermissionMode` | kill tmux → spawn with --resume + 新值 |

### claude2-stream.ts

- 不再区分 replay_start / replay_end
- WS open → subscribe session relay → 所有消息通过 relay 推送
- WS message → write to FIFO (不变)
- 去掉 `getBufferedCount` 的 replay 前置逻辑

### index.ts

- `new Claude2Runtime(runDir)` — 传入 runDir

## 前端变更

### claude2-adapter.ts

- **移除** `replayActiveRef` 及 `replay_start`/`replay_end` 处理
- **移除** 用户消息过滤中关于 replay 状态的条件判断
- 所有消息通过单一 WS 管道进入 state，无需区分来源

## 正常运行时序

```
1. CLI 输出 assistant chunk → stdout-helper 写入 turn_001
2. API tailFile 检测到新行 → emit 给 subscribers
3. CLI 输出 result → stdout-helper 关闭 turn_001，开启 turn_002
4. API 检测到 result → emit → 读取 JSONL → 发现 num_turns=1 已归档 → 删除 turn_001
5. 目录回到 0 文件（或只有 turn_002 空文件）
```

## 重连时序

```
1. 第一个 WebSocket 连接 → ensureRunning (tmux 已存在，跳过)
2. relay.activate():
   a. 加载 JSONL → 客户端收到完整历史
   b. 列 turn 文件 → 3 个文件堆积（API 断开期间 helper 持续写入）
      - turn_002: result_2, num_turns=2 → JSONL 最后 num_turns=1 → 未覆盖 → emit → 等待...
      - turn_003: result_3, num_turns=3 → emit → 等待...
      - turn_004: in-progress → emit + tail
   c. emit 完 → pipe-pane 订阅 → 实时流
3. 后续 subscriber 连接 → 从 relay buffer 拿消息 → 接实时
```

## 与旧方案对比

| | 旧：Bun.spawn + 内存 buffer | 新：tmux + turn 文件 + SessionRelay |
|------|-----------|-----------------|
| API 重启安全 | ✗ 进程挂、buffer 丢 | ✓ tmux 保活、文件落盘 |
| 多客户端 | 各自独立 stream() | ✓ 共享 session relay |
| 数据一致性 | REST + WS 两个入口，客户端拼接 | ✓ 服务端单一管道 |
| 磁盘占用 | 无 | ~1MB (正常 0 文件，异常堆积 ≤3 个) |
| 去重职责 | 客户端自己处理 | ✓ 服务端通过 JSONL 对比保证 |
| replay 协议 | replay_start/end 暴露给前端 | ✓ 内部消化，前端无感知 |
