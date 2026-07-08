# Web Terminal + tmux attach 架构调研

> 本调研为 agents-remote 终端会话从 `capture-pane` 快照方案切到 `tmux attach` 模式提供依据，同时作为**任何「网页控制服务器终端」项目**的通用参考。所有结论均带 man page / 源码 / issue 证据，非猜测。

## 背景

agents-remote 原终端会话流方案：后端 `tmux capture-pane -e -p` 产生静态快照（文本 + SGR 颜色）+ `tmux pipe-pane -O` 产生增量字节流，两者经 WebSocket 喂给前端 xterm.js。

**根因（已实测坐实）**：`capture-pane -e -p` 是**半态快照**——输出当前可见单元格网格 + SGR，但**丢弃**：光标位置（CUP）、alt-screen 切换（`?1049h/l`）、光标可见性（`?25h/l`）、软换行（除非 `-J`）。本地实测 `capture-pane -e -p | grep -E '1049|;\[.*H|\?25'` = 空。

后果：
- shell（prompt 在最后一行）侥幸免疫——capture 写完光标停在文本末尾，恰好等于真实光标。
- TUI（如 `claude` CLI，光标在中间输入框）中招——capture 把光标拽到末尾 → 偏位；软换行丢失 + pipe 增量在错误基线上累积 → 内容叠加。

方向：切到 **attach 模式**——每个 web 客户端 WebSocket 连接时，后端 spawn 一个 `tmux attach -t <session>` 子进程（分配 PTY），PTY stdout → WS → xterm.js，xterm 输入 → WS → PTY stdin。每个 web 客户端成为真正的 tmux client，享受 tmux 原生全态渲染（光标/alt-screen/resize 重绘全对），废弃 capture-pane/pipe-pane。

本调研确认该方案的每个技术点是否齐全。

## 核心结论

1. **attach 模式是业界主流共识**，ttyd（业界标杆）官方示例就是 `ttyd tmux new -A -s ttyd vim`。capture-pane 快照在业界是非主流，没人拿它当主力渲染。
2. **Bun 1.3.5+ 原生支持 PTY**（`Bun.spawn({ terminal })` + `Bun.Terminal`），底层就是 `openpty()` + `ioctl(TIOCSWINSZ)`。agents-remote 用 Bun 1.3.13，**零 native addon、零 node-pty 兼容风险**。node-pty / 手动 openpty 两条路直接否掉。
3. **tmux 多端尺寸协调是原生机制**：`window-size=latest`（3.2+ 默认）+ 删掉 `resize-window` + `aggressive-resize=off`。不需要应用层造轮子。
4. **orca 那套自维护 headless buffer + serialize + 手动 snapshot 重放 + driver 多端仲裁可整体丢弃**——tmux server 原生就是权威 buffer、原生全态重绘、`window-size=latest` 原生协调多端尺寸。

## 1. 竞品架构对照

业界分两派 + 一个第三派：

### 派 A：command-attach（多端共享视图）

**ttyd**（tsl0922/ttyd，C）—— 标杆。架构：
- `pty.c` `pty_spawn()`：Unix `forkpty()` 分配 PTY → child `setsid()` + `execvp(argv)`；master fd 包成 libuv pipe。
- `protocol.c` `callback_tty`：PTY 输出攒进 `pty_buf`，调度 `LWS_CALLBACK_SERVER_WRITEABLE`，前缀命令字节 `'0'`(OUTPUT) 发 WS。
- WS input 首字节判命令：`'0'`INPUT → `pty_write`；`'1'`RESIZE_TERMINAL(JSON{cols,rows}) → `pty_resize` → `ioctl(master, TIOCSWINSZ)`。
- **零 snapshot/replay buffer**。重连靠 command（tmux）自己重绘。
- **流控**：客户端 highWater/lowWater 阈值，超限发 PAUSE/RESUME 给服务端。

**ttyd man page EXAMPLES（铁证）**：
> Sharing single process with multiple clients: `ttyd tmux new -A -s ttyd vim`, run `tmux new -A -s ttyd` to connect to the tmux session from terminal.

`-A`（attach-if-exists）+ `-s <name>` = 持久 session 模式。每个 WS 客户端 = 一个 tmux client。

**gotty**（yudai/gotty，Go）：ttyd 的 Go 前辈，机制同构（go-pty + WS），可 `gotty tmux new -A -s x`。

### 派 B：raw-pty 常驻（单客户端语义）

**VSCode / code-server / Theia / OpenSumi / Gitpod**：
- 每终端一个 node-pty，WS 通信，**不内建 tmux**。
- 终端持久化靠服务端保活 pty 进程 + grace window（code-server `reconnection-grace-time` 默认 3h），断线内 reload 重连**同一个 pty**。
- **不是 snapshot 重放，是 pty 进程常驻 + 重连续流**。pty 自己不会重绘全屏，靠"pty 还活着，输出流续上"。
- **结构性局限**：raw pty 无法重绘历史 → "VSCode 重启就丢终端"是普遍吐槽。

### 派 C：自维护权威 buffer（orca）

**orca**（stablyai/orca，Electron）：daemon 持 `@xterm/headless`（权威 buffer）+ `@xterm/addon-serialize`，多端靠"序列化快照 + 增量流"同步。详见 §4。

### 关键观察

- **没有任何主流竞品用 capture-pane/pipe-pane 做主力渲染**——agents-remote 现状是非主流。
- **hapi（tiann/hapi，我们要对标优化的目标）不用 tmux**：原生 `Bun.Terminal` PTY + `Map<terminalId, runtime>` 做"重连复用同 PTY"，单客户端语义，不支持多端共享。raw-pty 重连也丢全屏历史，**救不了 TUI（claude CLI）的 alt-screen/光标问题**。所以需要 TUI 全态时 tmux attach 是唯一稳路径。
- snapshot 重放（`@xterm/addon-serialize`）自标 "experimental"，设计用途是离线回放/调试，**不是实时首连铺屏**；xtermjs issue #595 "保存/恢复终端状态"至今 open，证明 serialize 重放不可靠（alt-screen/光标/cursor-style/OSC 还原不全）。

## 2. tmux 多端 attach 尺寸协调机制

> 证据：[tmux(1) man page](https://man7.org/linux/man-pages/man1/tmux.1.html)（3.5a，2026-05-24 拉取）、tmux/tmux 源码（deepwiki 确认函数链路）、tmux issues #2243/#2594/#4544。

### 根本模型：一个 window 永远只有一个尺寸

所有 attach 到同一 session 的 client **共享唯一的 window 尺寸**（源码 `w->sx`/`w->sy` 单值）。不同尺寸的 client 看到的是"同一 window 的不同视口"（pan/scroll 或 padding/dots），**不是各自独立的尺寸视图**。这是 tmux 固有模型，不是选项能关的。

### window-size 选项（window scope）

man 原文：

> `window-size largest | smallest | manual | latest` — Configure how tmux determines the window size. If set to **largest**, the size of the largest attached session is used; if **smallest**, the size of the smallest. If **manual**, the size of a new window is set from the default-size option and windows are resized automatically. With **latest**, tmux uses the size of the client that had the most recent activity.

| 值 | window 尺寸 = | 备注 |
|---|---|---|
| `largest` | 最大 attached client | 小 client 会 pan |
| `smallest` | 最小 attached client（3.2 前老默认） | 大 client 见点阵 padding |
| `latest` | **最近有 activity 的 client**（3.2+ 默认） | 谁在操作就按谁的，推荐 |
| `manual` | `default-size`/`resize-window` 钉死，不随 client 变 | resize-window 会强制设成这个 |

**没有 `custom` 值**——源码只有 4 个枚举（`WINDOW_SIZE_LARGEST/SMALLEST/LATEST/MANUAL`）。

`latest` 精确语义是 "most recent **activity**"（不只 attach，任何 keystroke 都更新 `w->latest`）。两个 client 都在操作时 window 尺寸会随谁刚敲键反复跳动（tmux #2243 报告的 "window size keeps changing when sharing a session"）。

### client resize → window 调整链路

```
client PTY 收 TIOCSWINSZ (内核推)
  → tmux client tty 收 SIGWINCH
  → client 通过 imsg 发 MSG_RESIZE 给 server
  → server_client_dispatch → tty_resize() → recalculate_sizes()
      → recalculate_size(window): 按 window-size 从 attached clients 算新尺寸
      → 若变 → resize_window(): 重排 layout + resize window + 给子进程 PTY 也发 TIOCSWINSZ
      → tty_update_window_offset() + server_redraw_window()
  → server_client_check_redraw(): 给每个 attached client 打脏标记，下一 tick 重绘
```

resize **会**触发对所有 attached client 的重绘，但非同步立即（打 dirty flag，下一 event-loop tick；client tty 阻塞则推迟）。

### detach 时尺寸回退

会回退，规则由 `window-size` 决定（detach 是触发 `recalculate_sizes()` 的事件之一）：
- `largest`/`smallest`/`latest` → 回退到剩余 client 按规则取的尺寸。
- `manual` → 不回退，保持钉死尺寸。

例外：`tmux -CC`（control mode）client detach 有已知 bug 可能不触发重算（#2594），普通 attach 不受影响。

### aggressive-resize：保持 off（默认）

man 原文：
> Aggressively resize the chosen window. ... tmux will resize the window to the size of the smallest or largest session ... for which it is the current window, rather than the session to which it is attached.

- **off（默认）**：算 window 尺寸时扫描所有把该 window attached 的 client。
- **on**：只扫描该 window 是其 current window 的 client。

对单 session 多 client 共享同一 window 场景，**off 和 on 行为等价**。on 主要给多 session group 用，且 "poor for interactive programs such as shells"（频繁 SIGWINCH 骚扰 shell）。**保持 off**。

### resize-window vs client PTY TIOCSWINSZ（关键修正）

man 对 `resize-window`：
> This command will automatically set window-size to manual in the window options.

- **PTY TIOCSWINSZ（推荐）**：client resize 自然驱动，tmux 按 window-size 重算。attach 模式正本清源。
- **`resize-window -x -y`**：强制覆盖，**会把 window-size 钉成 `manual`**，之后该 window **不再随 client 尺寸自动变化**，client PTY 的 TIOCSWINSZ 失效。

**agents-remote 当前 `resize-window -x -y` reflow 是 bug 嫌疑根因之一**——它锁死 window，client PTY resize 失效。attach 模式下必须删掉，改用 client PTY TIOCSWINSZ。

### 无 client 时的尺寸

`default-size`（session option，默认 80×24）：`new-session -d` 创建后、首次 attach 前 window 尺寸 = global `default-size`，或 `new-session -x W -y H` 指定的值（同时设该 session 的 default-size）。建议 `new-session -d -x <合理默认> -y <合理默认>` 减少首帧跳变。

### 多端独立尺寸？做不到（有 workaround）

单 session 内桌面+移动各自全屏独立尺寸**做不到**。三个 workaround：
1. **`ignore-size` client flag**（`attach-session -f ignore-size`）：开了的 client 不参与 window-size 计算（自己视图仍 pan，但不把 window 拖小）。适合移动端只读旁观、不污染桌面全屏。
2. **session group**（`new-session -t <group>`）：多 session 共享同组 window，但仍有单一 window 尺寸，复杂。
3. 接受共享尺寸 + `window-size=latest`（推荐：最近操作者胜出）。

## 3. Bun 原生 PTY 落地路径

> 证据：[Bun v1.3.5 blog](https://bun.com/blog/bun-v1.3.5)、[Bun spawn docs](https://bun.com/docs/runtime/child-process)、Bun issues #32584/#22468/#31760、[node-pty src/unix/pty.cc](https://github.com/microsoft/node-pty/blob/master/src/unix/pty.cc)、[TIOCSWINSZ(2const) man](https://man7.org/linux/man-pages/man2/TIOCSWINSZ.2const.html)。

### Bun 原生 PTY（1.3.5+，agents-remote 是 1.3.13）

`Bun.spawn` 的 `terminal` 选项（`SpawnOptions.terminal: TerminalOptions`）。提供后：子进程 `stdout.isTTY === true`，stdin/stdout/stderr 全接 PTY，`proc.stdin/stdout/stderr` 返回 `null`，改用 `proc.terminal`（`Bun.Terminal` 实例）。

```ts
const proc = Bun.spawn(["tmux", "attach", "-t", sessionName], {
  cwd: projectRoot,
  env: { ...process.env, TERM: "xterm-256color" },
  terminal: {
    cols, rows, name: "xterm-256color",
    data(term, data) { ws.send(data); /* 见背压 */ },
    exit(term, exitCode, signal) { /* PTY 流关闭 */ },
    drain(term) { /* 写背压解除 */ },
  },
});
```

`Bun.Terminal` 方法：
```ts
interface Terminal extends AsyncDisposable {
  readonly stdin: number;   // slave fd (POSIX)
  readonly stdout: number;  // master fd
  readonly closed: boolean;
  write(data: string | BufferSource): number;  // 写 PTY stdin
  resize(cols: number, rows: number): void;     // = ioctl(TIOCSWINSZ)
  setRawMode(enabled: boolean): void;
  ref(): void; unref(): void;
  close(): void;
}
```

- **stdin 写入**：前端 WS message → `proc.terminal.write(chunk)`。
- **resize**：前端发 `{type:"resize",cols,rows}` → `proc.terminal.resize(cols,rows)`。POSIX 下走 `ioctl(master_fd, TIOCSWINSZ, &winsize)`，内核对 PTY 前台进程组发 `SIGWINCH`，tmux 收到后重绘。与 node-pty `pty.resize` 底层完全一致。

### 否掉 node-pty 和手动 openpty

- **node-pty**：在 Bun 下走 N-API 兼容层，理论可行但非 universal（Bun 自有 ABI，Windows 有 crash issue #13566），自找麻烦。
- **手动 openpty**：`Bun.spawn({ terminal })` 底层就是 `openpty()`，自己写 native binding/FFI 是重复造轮子。Bun 也没有内置通用 `ioctl(fd,...)`。

### 背压（唯一需要手写的部分）

PTY stdout 高速输出 → WS，直接 `data(t,d){ws.send(d)}` 会内存堆积。用 `ws.bufferedAmount` 高水位闸：

```ts
const HIGH_WATERMARK = 1 * 1024 * 1024; // 1 MiB
let paused = false;
function onData(term, data) {
  ws.send(data);
  if (ws.bufferedAmount > HIGH_WATERMARK && !paused) {
    paused = true; // 丢弃或暂存后续 chunk
  }
}
// ws drain 后 paused = false
```

注意 Bun issue #31760 报过**客户端** `bufferedAmount` 恒 0 的 bug；服务端 `ServerWebSocket.bufferedAmount` 在当前版本可用，落地时用 `cat big.log` 实测确认。tmux 场景用户输出速率有限，1 MiB 水位 + drain 恢复足够稳。

### 生命周期

| 事件 | 处理 |
|---|---|
| WS close（用户关页） | `proc.kill("SIGTERM")` → `await proc.exited` → `proc.terminal.close()` |
| attach 正常退出 | `proc.exited`（Promise<exitCode>）→ 通知 WS 关 |
| tmux session 被外部 kill | `proc.exited` + `terminal.exit` 回调 → `ws.close(1001)` |
| `terminal.close()` | 关 PTY master fd，标记 closed |

**坑**：`exit` 回调的 `exitCode` 是 **PTY 流状态**（0=EOF, 1=error），**不是**子进程退出码；子进程退出码用 `proc.exited`。两者独立触发。

### 落地骨架

```ts
function attachTmux(ws, sessionName, projectRoot, cols, rows) {
  const proc = Bun.spawn(["tmux", "attach", "-t", sessionName], {
    cwd: projectRoot,
    env: { ...process.env, TERM: "xterm-256color" },
    terminal: {
      cols, rows, name: "xterm-256color",
      data(term, data) { ws.send(data); /* +bufferedAmount 闸 */ },
      exit(term) { try { ws.close(1001, "pty stream closed"); } catch {} },
    },
    onExit(p, code, signal) { try { ws.close(1001, `tmux exited ${code}`); } catch {} },
  });
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "input")      proc.terminal!.write(msg.data);
    else if (msg.type === "resize") proc.terminal!.resize(msg.cols, msg.rows);
  };
  ws.onclose = () => {
    proc.kill("SIGTERM");
    proc.exited.catch(() => {}).finally(() => proc.terminal?.close());
  };
}
```

### 已知坑

1. `proc.stdin/stdout/stderr` 给了 `terminal` 后全是 `null`——只能用 `proc.terminal` + `data` 回调。
2. `exit` 回调 ≠ 进程退出码，拿退出码用 `proc.exited`。
3. `bufferedAmount` 实测确认（历史客户端恒 0 bug）。
4. tmux 初始尺寸：attach 前就把 `cols/rows` 给对，attach 后前端 fitAddon 算出尺寸再 resize 一次。
5. argv 数组、不拼 shell（符合安全约定）；`sessionName` 来自客户端不可信，attach 前必须校验（`tmux ls` 白名单 + 项目 scope），否则 `tmux attach -t` 可被参数注入。

## 4. orca 对照（自维护方案 vs tmux attach）

> orca 源码在 `~/repos/orca/`。关键文件：`src/main/daemon/headless-emulator.ts`、`src/renderer/src/components/terminal-pane/pty-connection.ts`（`applyMainBufferSnapshot` L4983-5060、`suppressSnapshotReplayPtyResize` L1080/L3010）、`src/main/runtime/orca-runtime.ts`（`applyLayout` L7634、`handleMobileSubscribe` L7800）。

### 架构差异

| | orca | tmux attach |
|---|---|---|
| 权威 buffer | daemon 内 `HeadlessEmulator`（`@xterm/headless` + `SerializeAddon`）单实例 | tmux server 内部，原生 |
| PTY 拓扑 | **单一共享 PTY** per pane，所有 client 共用 | **每个 web client 各自一个 attach PTY**，全连同一 tmux server |
| 多端尺寸 | 共享一个尺寸，driver/mobile-presence-lock 选"当前生效 viewport" | tmux window 一个尺寸，`window-size` 协商 |
| 重连恢复 | 手动 `applyMainBufferSnapshot`：serialize 快照写回 xterm | tmux attach 原生全态重绘 |

### 为何 orca 自维护 headless + serialize

它解决的核心问题：①跨进程权威 buffer（单 PTY 输出要喂给随时增删的多 client，补历史）；②多端同步真相源；③重连重放（`SerializeAddon.serialize({scrollback})` 转 ANSI 写回）；④移动端尺寸 reflow（按新宽度重新 serialize rewrap）；⑤附带 cwd/OSC7/title 检测（产品功能）。

**tmux attach 对应物**：tmux server 就是权威 buffer，全态原生保留（scrollback + alt-screen + cursor + modes）。**不需要自维护 headless/serialize**。

### 重连/重入对照

orca `applyMainBufferSnapshot` 七步：①丢弃待处理 xterm 输出；②`suppressSnapshotReplayPtyResize=true` → `terminal.resize(snapshotCols,snapshotRows)` → 复位（先按 snapshot 原尺寸渲染）；③写清屏序列（main `\x1b[2J\x1b[3J\x1b[H` / alt `\x1b[?1049h\x1b[2J\x1b[H`）；④写 snapshot.data；⑤补 dangling `pendingEscapeTailAnsi`（#7329 mid-escape）；⑥`safeFit` 回容器尺寸；⑦若尺寸变 → `transport.resize()` + `pty.signal('SIGWINCH')` 触发 TUI 重绘。

**tmux attach 不需要这套**：新 spawn attach 进程，tmux server 立刻全态重绘推给新 client，没有"写 snapshot"环节。attach 时给 PTY 设尺寸（TIOCSWINSZ）本身触发 SIGWINCH 链路，TUI 自动重绘。

**仍值得借鉴**：新 client 的 xterm attach 前 `terminal.reset()` 一次（清前一个 session 残留状态），对应 orca `discardTerminalOutput` 的精神，一行代码。

### resize 抑制（suppressSnapshotReplayPtyResize）

orca 用它阻止"写 snapshot 时那次 `terminal.resize(snapshotCols,snapshotRows)`"转发到真 PTY（PTY 真实尺寸由后面 `safeFit` + 显式 `transport.resize` 决定）。

**tmux attach 完全不需要**：没有"写 snapshot → 临时改 xterm 尺寸"环节，xterm 尺寸 = 容器尺寸 = attach PTY 尺寸，三者天然一致，xterm `onResize` 直接转发到 attach PTY 即可。

### 多端尺寸对照

orca：共享一个尺寸，driver/mobile-presence-lock 三态（`idle`/`desktop`/`mobile{clientId}`），`pickMostRecentActor` 最近操作者胜出，`mobileDisplayMode`（auto/desktop），`reclaimTerminalForDesktop`，`terminalFitOverrides` baseline 记录 + restore。

**tmux attach 不需要这整套**：`window-size=latest` 原生就是"最近操作者胜出"。接受"input 共享"（多 client 同时输入会混入同一 window，tmux 固有特性，不造 driver 仲裁）。

### 可丢弃 vs 可借鉴

**切到 tmux attach 后可完全丢弃**：

| orca 机制 | 丢弃理由 |
|---|---|
| `HeadlessEmulator`（`@xterm/headless` 权威 buffer） | tmux server 替代 |
| `SerializeAddon` 序列化 | tmux attach 原生重绘 |
| `applyMainBufferSnapshot` 全套手动步骤 | attach 全态重绘替代 |
| `suppressSnapshotReplayPtyResize` flag | 没有"写 snapshot 时的伪 resize" |
| `POST_REPLAY_LIVE_SNAPSHOT_RESET` + `pendingEscapeTailAnsi`（#7329） | tmux 保证状态机完整 |
| `terminalFitOverrides` + baseline 记录 + restore | `window-size` 替代 |
| driver / mobile-presence-lock 状态机 | 接受 tmux input 共享 |
| `pickMostRecentActor` / `mobileDisplayMode` / `reclaimTerminalForDesktop` | `window-size=latest` 替代 |
| `ptySizeReassertion`（fit 后比对修 drift） | attach PTY 尺寸即所设尺寸，无 drift |

**仍值得借鉴**（attach 模式依然需要）：

| 机制 | 为什么仍需要 | 对应实现 |
|---|---|---|
| WebSocket 背压 + 超限恢复 | attach PTY stdout → WS → xterm，client 慢/断仍积压。tmux 模式下权威 buffer 是 tmux server，超限就重 attach 最简单，别自己造"从 tmux 重建丢弃段" | WS 高水位 + 超限主动关 attach 让 client 重连 |
| 重连时 xterm `reset()` | attach 全新 session 前清残留 | `terminal.reset()` 一行 |
| batching flush 窗口（~8ms） | 减少 WS 往返，别每 byte 一个 frame | WS 发送侧 batch |
| tmux client/进程清理 | client 断开必须 kill attach 进程，否则孤儿累积 | client WS close → kill attach PTY |
| resize 防抖/节流 | mobile 键盘弹起狂发 resize | fit resize coalesce |

## 5. 已知坑清单（attach 模式）

1. **首连空白屏**：attach 进程刚 spawn、tmux 还没重绘完的瞬间 xterm 是空的。几十 ms 内 tmux 自动铺满，UI 可加极短骨架屏承接。
2. **重连不做 output replay**：attach 重新拉起，tmux 自动重绘整屏就是最准的快照（比 addon-serialize 准）。**自己缓存 output replay 会和 tmux 重绘叠加产生重影**（社区"weird characters after reconnect"主因）。
3. **attach 进程生命周期**：每个 WS 客户端 = 一个 attach 子进程，WS 断开必须 kill（否则泄漏，`tmux list-clients` 能看到残留）。
4. **input 混合**：多 attached client 同时输入会混入同一 tmux window（tmux 固有特性，接受，不造 driver 仲裁）。
5. **`aggressive-resize` 必须关**：开了限制非 focused client scrollback，web 多端灾难。
6. **`window-size` 显式设 `latest`**：别依赖默认（可能被 conf 覆盖成 smallest）。
7. **`resize-window -x -y` 必须删**：会钉死 manual 让 PTY resize 失效。
8. **history-limit 要够大**：tmux scrollback 是"权威 buffer 容量"上限，设 10000+（orca headless 是 5000），否则老内容被 tmux 丢，重 attach 也补不回。
9. **resize 时序**：attach PTY TIOCSWINSZ → tmux client 报 size → tmux server 可能触发 window resize → 回推 redraw 给所有 client，有跨进程往返，别期望"resize 了立刻本地 xterm 就对"。
10. **多端尺寸不能各自独立**（单 session 内）：接受共享尺寸 + 视口偏移，或 `ignore-size` 旁观，或 session group。
11. **sessionName 不可信**：attach 前必须校验（白名单 + 项目 scope），防 `tmux attach -t` 参数注入。
12. **`proc.stdin/stdout/stderr` 在 terminal 模式下是 null**，只能用 `proc.terminal` + `data` 回调；`exit` 回调 ≠ 进程退出码（用 `proc.exited`）。

## 6. 决策（agents-remote 方案 A）

- **统一 tmux attach**：每 web client spawn `tmux attach -t <session>`（`Bun.spawn({terminal})`），PTY↔WS 桥接，废弃 capture-pane/pipe-pane 做主力渲染。
- **`window-size=latest` + `aggressive-resize=off` + 删 `resize-window -x -y`**：靠 client PTY TIOCSWINSZ 驱动，tmux 原生协调多端尺寸。
- **重连不 replay**：新 attach 进程，tmux 自动全态重绘；xterm attach 前 `reset()`。
- **保留 capture-pane 只给 list/detail 的 `extractLastCommand`**（只读，不走实时流）。
- **claude2 路径（Bun.spawn CLI，非 tmux）不受影响**。
- **接受多端共享尺寸 + 最近操作者胜出**（移动端如需不污染桌面可用 `ignore-size`）。

## 证据链接

- [ttyd man page（tmux 官方示例 L160）](https://github.com/tsl0920/ttyd/blob/main/man/ttyd.man.md)
- ttyd 源码机制（pty.c / protocol.c / 客户端 xterm）：deepwiki tsl0922/ttyd
- [tmux(1) man page](https://man7.org/linux/man-pages/man1/tmux.1.html) — window-size / aggressive-resize / default-size / resize-window / attach-session(ignore-size) / refresh-client
- [tmux #2243 — window size keeps changing when sharing a session](https://github.com/tmux/tmux/issues/2243)
- [tmux #2594 — -CC still determines window size after detaching](https://github.com/tmux/tmux/issues/2594)
- [Bun v1.3.5 blog（Bun.Terminal / PTY）](https://bun.com/blog/bun-v1.3.5)
- [Bun spawn docs（terminal option）](https://bun.com/docs/runtime/child-process)
- [Bun #32584 — Native PTY via terminal option](https://github.com/oven-sh/bun/issues/32584)
- [Bun #31760 — WebSocket.bufferedAmount caveat](https://github.com/oven-sh/bun/issues/31760)
- [node-pty src/unix/pty.cc — TIOCSWINSZ 机制](https://github.com/microsoft/node-pty/blob/master/src/unix/pty.cc)
- [TIOCSWINSZ(2const) man — SIGWINCH 语义](https://man7.org/linux/man-pages/man2/TIOCSWINSZ.2const.html)
- [MDN WebSocket.bufferedAmount — 背压指标](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/bufferedAmount)
- [@xterm/addon-serialize（experimental）](https://www.npmjs.com/package/@xterm/addon-serialize)
- [xtermjs #595 — 保存/恢复终端状态（serialize 局限）](https://github.com/xtermjs/xterm.js/issues/595)
- code-server 终端持久化（pty 常驻 + grace）：deepwiki coder/code-server
- hapi（参考实现，不用 tmux，原生 Bun PTY）：deepwiki tiann/hapi
- orca 源码：`~/repos/orca/`（headless-emulator.ts / pty-connection.ts / orca-runtime.ts）
