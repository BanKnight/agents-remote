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

## terminal 行首残留（tmux attach，2026-10-18 定案·第二轮推翻第一轮）

- **现象**：terminal 模式行首残留旧帧字符（集中在 col1-2 margin），浏览器 resize / 折叠 composer 愈合。
- **真根因**：**app 侧 xterm 的 `convertEol: true` 误解析 tmux 的裸 LF**。tmux client 用 terminfo 的 `cud1` 能力做「下移一行」，`xterm-256color` 下 `cud1=\n`（裸 LF，`infocmp` 可验），且 tmux 靠这个 LF **隐式携带列位**——典型序列 `ESC[r;3H ESC[K` + LF + 文本（下一行首个变更与上一行同列时**不重发 CUP**）。`convertEol: true` 把 LF 当 CR+LF → 光标回列 0 → 文本左移 2 列，且后续 `ESC[K` 从列 0 起擦 ≠ pane 从列 2 起擦 → **行首 1-2 列残留**。**字节流本身完全正确、无失同步**（col1-2 margin 现象由此有了确切解释，不用再借「diff 跳过未变前缀盲区」）。
- **修复落点**：`web/src/routes/SessionDetailRoute.tsx` 的 xterm 构造 `convertEol: false`（该终端字节源唯一 = tmux attach 的 PTY；仓库内 `convertEol` 仅此 1 处消费，无「裸 LF 当换行」的文本流需求）。
- **决定性 A/B（方法可复用）**：确定性负载（画 30 行「2 空格缩进 + 长文本」，再交替「自列 3 整行擦空」/「自列 3 重写文本」，逼出 `ESC[r;3H ESC[K` + 裸 LF + 文本），两臂输入 damage 完全相同，用 `@xterm/headless` 按 live 时序（80x24 收前缀 → resize → 收余下）回放，与 pane 真值比对：
  - tmux **3.5a**：`convertEol: true` → **6 行分歧**（pane `'    NEW-10…'` vs xterm `'  NEW-10…'`）；`false` → **0 行**。
  - tmux **3.8**：**逐行完全相同**的 6 行分歧；`false` → **0 行**。
  ⇒ **与 tmux 版本无关，升级 tmux 不能修**；两版 `tty_cursor` / `\n` 发射点**逐字节相同**，且 3.8 的流里带着 `ESC[?2026h/l`（#5340 的修复本身）照样复现。
- **勿再据 #5340 归因**：DECSET 2026 是 tmux **3.7** 才引入（3.5a/3.6b 无该代码路径，收到即忽略），claude ≥2.1.200 按「tmux ≥3.4」就发同步标记——版本门槛本身错位，与本 bug 无关。
- **第一轮误诊的教训（复现实验的混淆变量）**：第一轮靠「reset + 回放 0 分歧 = 残留是字节流的确定函数 → 发射层失同步」定案。方向错在**回放用的是同一个 `convertEol: true`**，它无法区分「字节流坏了」与「解析器配错了」。**凡「同配置回放复现」类实验，必须再做单变量对照（只改解析器配置）才能把归因落到流或解析器**。
- **已撤除**：`api/src/tmux-runtime.ts` 的「5s 周期 × 15s 活动窗 refresh-client」层（第一轮按误诊所加，真根因修掉后失去理由，每次全屏重绘还有带宽代价）。保留其「600ms attach churn 全重绘」——那应对的是 PTY 以 80x24 起 vs 浏览器首连真实尺寸的首次重排，是另一回事。
- **勿再走**：「Bun PTY 读路径丢字节」假设（20MB raw 完整性测试零丢失）；「xterm.js 解析器有 bug」假设（检查点逐写入对照两解析器全程一致——**解析器没问题，是配置项错了**）；「第一轮的三层防护」当终态修复。
- **几何伪差（仍然有效）**：与 tmux VTE 做双解析器对照时，回放 pane 是 40 行（status 占 1 行）而帧流是给 41 行 client 写的（`ESC[1;41r`），「1 行偏移」是回放几何伪差、不是解析器分歧——别被骗。
