# Claude Session 数据流调试指南

> 来源：原 CLAUDE.md 同名节迁移（2026-09-19 harness 改造）。

Claude session 消息经过多层管道，排查问题时**必须逐层沿数据流方向检查**，而不是到处看代码猜原因。

完整进程模型/缓冲/时序设计见 `docs/design/message-replay.md`。CLI 用 `Bun.spawn` 直拉（**非 tmux**）；stdin 直写 `proc.stdin`（**无 FIFO**）；stdout 直读（**无 stdout-helper/turn 文件/pipe-pane**）。

## 下行数据流（CLI → 浏览器）

```
实时：CLI stdout → readStdout() → relay.handleStdoutLine() → liveLines + broadcast → createBatchEmitter(压缩/分块) → WebSocket → 浏览器
历史：session JSONL → readHistoryFromJsonl() → historyLines → addSubscriber() 回放 → createBatchEmitter → WebSocket → 浏览器
```

| 环节 | 文件 | 关键日志 | 检查方法 |
|------|------|---------|---------|
| CLI stdout | `claude-runtime.ts` `spawnClaudeDirect()` / `readStdout()` | `[claude-stdout] <line>` | 检查 CLI 进程是否在跑（`proc.exitCode === null`）；stderr 在 `runDir/claude-stderr/<session>.log` |
| stdout → relay | `claude-runtime.ts` `readStdout()` → `relay.handleStdoutLine()` | `[relay] addSubscriber: phase=... history=.. live=..` | 看 stdout 行流是否在喂 relay；generation 守卫是否误停了 reader |
| relay → WebSocket | `claude-stream.ts` `startStream()`（`createBatchEmitter` 压缩/分块） | `[claude-stream] blob flushed: bytes=.. sendMs=..` / `captured claudeSessionId=..` | 确认 relay 的 `emit` 被调用；batch 是否正常发 |
| WebSocket → 浏览器 | `claude-adapter.ts` `socket.onmessage` | `[claude-adapter] ws recv: ...` | 浏览器 Console 看是否有消息到达 |

## 上行数据流（浏览器 → CLI）

```
浏览器 sendToSocket → WebSocket → controller.message() → runtime.write() → proc.stdin → CLI
```

| 环节 | 文件 | 关键日志 | 检查方法 |
|------|------|---------|---------|
| 浏览器发送 | `claude-adapter.ts` `sendToSocket()` | `[claude-adapter] ws send: ...` | 浏览器 Console |
| WebSocket → server | `index.ts` `websocket.message` | — | 检查 `ws.data.kind === "claude-stream"` 路由是否命中 |
| controller.message() | `claude-stream.ts` `message()` | `[claude-stream] message ${type}: ${sessionName}` | **如果没有这条日志，说明消息没到达 message()** |
| stdin 写入 | `claude-runtime.ts` `write()` | 无显式日志 | 确认 `proc.exitCode === null` 且 `proc.stdin` 可写（直接 pipe，无 FIFO 文件） |
| CLI 读取 | CLI 进程 | stderr log | 如果没有响应，检查 CLI 进程是否存活 |

## 历史回放数据流（reconnect）

```
浏览器 WS 连接 → stream() → relay.addSubscriber()
                                  ├─ session_init{resume}
                                  ├─ history_start → historyLines(JSONL) → history_end
                                  └─ live_start → liveLines(stdout) → live_end
relay.activate() 已在 spawn 时完成：resume 才 readHistoryFromJsonl() 定格 historyLines
```

关键检查点：
- `claudeSessionId` 是否为 `none`：none → relay 不读 JSONL，`historyLines` 为空，浏览器只收到 `liveLines`（resume 才有全量历史）。
- `readStdout()` 是否在喂 relay：generation 守卫——API 重启（`--resume` 重拉 CLI）后旧 reader 应已 return，新 generation 的 reader 才有效。`switchModel`/`switchPermissionMode` 不再重启 CLI（走 stdin 转发，CLI 进程内切换，回 `switch_model_result`）。
- `liveLines` 是否被 cap 5000 截断：早于上限的消息只在 JSONL、不在 relay（全新 session 长驻时尤其要注意，需重启 `--resume` 才补回）。
- API 重启后 `ensureRunning` 是否用 `--resume claudeSessionId` 重新拉起 CLI（否则历史回不来）。

## 常见陷阱

1. **API 重启丢进行中的 turn**：`Bun.spawn` 随父进程退出 → CLI 死 + relay 内存清空。已归档的 turn 在 JSONL 里完整；未完成的 turn 以 interrupted 呈现（客户端 `isResume` 标）。这是 Gen 3 刻意取舍，不是 bug。
2. **`claudeSessionId` 为 none 时无历史**：新会话首次连接（system.init 尚未到 / id 未回填）`historyLines` 为空，只有 `liveLines`。回放依赖 `--resume`。
3. **全新 session 长驻丢早消息**：relay 从不重读 JSONL，`liveLines` 上限 5000，更早的消息只在磁盘 JSONL——下次 API 重启 `--resume` 才作为 history 补回。
4. **generation 守卫**：重启 spawn 后，确认 `readStdout` 跑在新 generation；旧 generation 的 reader 会把旧进程输出灌进新 relay（已由守卫拦截，排查时先确认 generation）。
5. **dev 进程用 tmux 管理（与 claude spawn 无关）**：API/Web 进程必须在 `ar-dev-api` tmux session 内运行，不能在外面跑；进程变孤儿（PPID=1）后只能 `kill` 再在 tmux 内重启。注意这是开发态进程管理，claude 本身**不**用 tmux 拉 CLI。

## 第一手信息核对要求

- 遇到协议格式、流式消息、实时流/历史回放差异、E2E 页面现象与实现不一致的问题时，必须先对齐三层第一手信息：**客户端日志、服务端日志、原始 JSONL/协议记录**，再下结论。
- 不要只看 UI 现象或凭印象猜字段；必须先确认真实消息顺序、真实字段名、哪一层做了变换、合并或过滤。
- 做 E2E 或手工调试时，不仅要看页面结果，也要同时检查客户端和服务端日志；消息/协议类问题默认把日志作为验收材料的一部分。
