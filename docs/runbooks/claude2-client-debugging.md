# Claude2 客户端调试开关

面向可执行操作的手册：如何在浏览器运行时打开 Claude2 session 客户端的调试输出（socket 流量日志、原始消息 tooltip），以及每个开关控制什么。

两个开关默认都是 **OFF**，让默认 UI 保持干净；需要排查协议、消息流或渲染问题时再在控制台临时打开。代码实现见 `web/src/lib/debug-flags.ts`。

> 本手册只覆盖**客户端运行时调试开关**。完整的下行/上行/回放数据流逐层排查（CLI stdout → turn file → relay → WebSocket → 浏览器）见 `CLAUDE.md` 的「Claude2 Session 数据流调试指南」；协议消息类型与字段见 [Claude CLI stream-json 协议](../research/claude-cli-stream-protocol.md) 与 [Claude2 Provider 协议设计](../design/claude2-provider-protocol.md)。

## 开关一览

| 开关 | localStorage key | 默认 | 控制范围 |
|------|------------------|------|---------|
| socket 日志 | `ar-debug:socket-log` | OFF | 7 条 ws send/recv 流量日志 |
| 调试按钮 | `ar-debug:debug-button` | OFF | 消息气泡上的 (i) 原始消息 tooltip |

两个开关都是 localStorage 持久化、在模块加载时读入**缓存的模块级布尔值**。这样热路径（每条进出 socket 消息）只读一个布尔值，不会每条消息都访问 localStorage。

## 运行时切换

### 即时切换（当前会话生效）

在浏览器 DevTools 控制台调用 `window.__arDebug` 暴露的方法：

```js
__arDebug.socketLog(true)      // 打印 ws send/recv 流量（即时生效，下一条消息起）
__arDebug.socketLog(false)     // 关闭
__arDebug.debugButton(true)    // 显示 (i) tooltip（需重新渲染/刷新页面后才出现）
__arDebug.debugButton(false)   // 隐藏 (i) tooltip
```

**生效时机差异：**
- `socketLog` 即时生效——它在每条消息的收发点重新读取布尔值，翻转后下一条消息就开始（或停止）打印。
- `debugButton` 翻转的是模块缓存布尔值，但已渲染的气泡不会因此重绘。打开后需触发一次重渲染（最简单是刷新页面）才会出现 (i) 按钮；关闭同样建议刷新以彻底隐藏。

### 持久化切换（下次加载生效）

直接写 localStorage，刷新页面后由默认值逻辑读取：

```js
localStorage.setItem("ar-debug:socket-log", "1")   // 打开 socket 日志
localStorage.setItem("ar-debug:socket-log", "0")   // 关闭
localStorage.setItem("ar-debug:debug-button", "1") // 打开调试按钮
localStorage.setItem("ar-debug:debug-button", "0") // 关闭
```

值 `"1"` 或 `"true"`（大小写不敏感）视为开，其它视为关；key 不存在时取默认值（OFF）。

清除单个开关：`localStorage.removeItem("ar-debug:socket-log")`。

## 各开关控制细节

### socket 日志（`ar-debug:socket-log`）

控制 `web/src/routes/claude2-adapter.ts` 中覆盖 socket 流量与批次边界的 `console.log`：

| 日志 | 位置 | 含义 |
|------|------|------|
| `ws send: readyState=… msg=…` | `sendToSocket` | 浏览器 → 服务端发送的每条消息（前 200 字符） |
| `ws recv` | `socket.onmessage`（文本帧） + `handleBinaryBatch`（gzip batch 解压后） | 服务端 → 浏览器收到的每条原始消息对象，文本帧与压缩 batch 两条路径都覆盖 |
| `session_init resume=` | session_init 分支 | 本次连接是否为历史回放（resume） |
| `history batch start/end` | 历史批次 | 回放批次的条数与处理结果 |
| `live batch start/end` | 实时批次 | 实时追加批次的条数与处理结果 |

**为什么默认关闭：** 每条 ws send/recv 都会 `JSON.stringify` 较大的消息对象，活跃 session 上会占据 CPU、拖慢渲染。仅在排查「消息是否到达」「字段是否正确」「实时 vs 回放差异」时打开。

**始终打印（不受开关影响）的生命周期/诊断日志：**
- `ws open` — WebSocket 连接打开（连接成功信号）
- `ws error` — WebSocket 错误
- `ws send error` / `ws deferred send error` — 发送失败的错误

这些低频且对判断连接健康至关重要，保持常开。

### 调试按钮（`ar-debug:debug-button`）

控制 `web/src/routes/Claude2SessionDetailRoute.tsx` 的 `RawDebugTooltip` 组件——消息气泡上的 (i) 图标，点击展开该消息的原始 JSON（`_rawMessages` / `_raw`）。

开关关闭时 `RawDebugTooltip` 在 hooks 之后 `return null`，**一处 early-return 覆盖全部 10 个调用点**（user/assistant/tool 卡片/compact-block 等都统一隐藏）。

**为什么默认关闭：** (i) tooltip 是排查渲染层过滤、字段缺失、关联错误的诊断入口，不是日常体验的一部分。需要核对某条消息的真实字段（如 `sourceToolUseID`、`isMeta`、`compactMetadata`）时打开。

## 何时使用

- **排查消息丢失/字段错误/渲染遗漏** → 打开 `debugButton`，在 (i) 里核对原始消息，确认是渲染层过滤还是协议层就缺失。
- **排查实时流 vs 历史回放行为不一致** → 打开 `socketLog`，对照 `session_init resume=` 与 `history batch` / `live batch` 的批次来源与内容。
- **排查上行输入未到达 CLI** → 打开 `socketLog`，确认 `ws send` 是否发出，再结合服务端日志判断 FIFO 写入。
- **日常使用 / 性能敏感** → 两个都关闭（默认）。

排查任何协议/消息类问题时，按 `CLAUDE.md` 的「第一手信息核对要求」同时核对客户端日志、服务端日志与原始 JSONL/协议记录，不要只看 UI 现象下结论。
