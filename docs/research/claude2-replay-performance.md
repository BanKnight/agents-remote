# Claude2 Replay 性能分析与验收基线

本文档是「打开 Claude2 长会话很慢（分钟级）」这一问题的**分析依据 + 验收基线**。所有数字都来自可重跑的脚本/埋点，方法可复现；优化前后用同一方法、同一样本测量，才能作为验收标准。

> 相关：协议消息类型与生命周期见 [Claude CLI stream-json 协议](./claude-cli-stream-protocol.md)；会话运行时架构见 [Session Runtime 架构](../architecture/session-runtime.md)。本文只分析**回放/加载**路径的性能。

## 优化顺序（已确认）

分析覆盖客户端与服务端两层，但按用户确认的顺序推进，**先解决客户端本身的实现问题，再考虑服务端如何与客户端同步/流式优化**。理由：客户端先稳下来，才能在不改服务端的前提下持续、可重复地测量（服务端持续供数，客户端逐步变快/不冻结）。因此本文的「实施路径」只展开客户端，服务端策略（流式、分页回填）列为后续。

> ⚠️ 本节的「客户端优先」顺序在埋点实测后被**修正**——见下方「实测结论」。客户端排查已完成并**排除**，主因落在服务端/网络传输侧，下一步必须碰服务端。

## 实测结论（埋点验证后）

第 0 步埋点（`web/src/lib/perf-trace.ts`；浏览器控制台 `__arDebug.perfTrace(true)` 开启，默认关、零开销）实测后，**推翻了下方「二/三」节「派生（#4）是主因」的假设**。新结论如下；旧诊断保留作历史记录。

**样本**：12MB / 5447 历史消息会话（70MB 样本的按比例子集），dev build，经 Cloudflare tunnel 打开。

**关键数字**——`historyRecv` = `history_start → history_end` 墙钟（纯接收阶段），`arrival` 剖析将其拆为「客户端处理」与「等帧到达」：

| 指标 | 实测（两次跑） | 含义 |
|------|----------------|------|
| `historyRecv`（burst） | 6178ms / 8350ms | 接收 5447 帧总时长；两次差 **35%** |
| `arrival.procTotal` | 815ms（**10%**） | 客户端 `onmessage` 处理总 CPU（parse+dispatch+push） |
| `arrival.wait` | 7535ms（**90%**） | 客户端空等下一帧到达 |
| `arrival.procMax` | 1.5ms | 单帧最大处理——无大消息卡点 |
| `arrival.gapAvg / gapMax` | 1.53ms / 339ms | 帧基本匀速到达，一次偶发抖动 |
| `normalize` | ~0.28–0.36s（两趟） | 派生，**非瓶颈** |
| `render`/`messageSignature`/`buildTurns`/`processBatch` | 全 <50ms | 派生，**非瓶颈** |
| `commit` | 多个 0.5–0.7s 峰值 | 在 `historyRecv` **之后**异步发生，属沉淀成本 |

**结论**：

1. **派生不是主因（已证伪）**。`normalize` ~0.3s，`render`/`messageSignature`/`buildTurns`/`processBatch` 全 <50ms。「派生增量（B）」能省的 <0.3s → **降级**。
2. **客户端浏览器已排除**。接收阶段客户端 CPU 仅占 ≤14%（`procTotal` 10% + `gapMax` 抖动 4%），≥86% 是等帧到达。
3. **新主因**：≥86% 落在「服务端发」+「tunnel/网络传」之间，客户端侧分不开，需服务端 flush 计时进一步拆分（区分服务端 CPU vs tunnel/网络）。✅ **已查明并解决**（见「四/五」节 E）：服务端 `socket.send` 每帧 `sendMs=0`（非 CPU），瓶颈是 cloudflared 对**单个大 WS 帧** stall（6.3Mbps）；切成 53 个 ~50KB 帧（分块版）后多帧流水达 13.4Mbps，`historyRecv` 3.5s → 1.71s。
4. **波动旁证**：同会话两次 `historyRecv` 差 35%，而客户端 CPU 时间稳定 → 这 35% 波动来自传输链路，反证时长由传输决定。

**自洽性**：每帧平均 1.53ms = 处理 0.15ms + 等待 1.38ms；累加 5447 帧 = 处理 815ms + 等待 ~7500ms，与 `wait` 完全吻合——「网络匀速送达 + 客户端飞快处理」解释全部数字。

## 一、样本与测量方法

**样本**：本次会话 JSONL —— **70.0MB / 34,544 行**（另一条 117MB / 40,948 行作为大量级参照）。

**消息类型分布**（70MB 样本，复现脚本见末节）：

| 类型 | 数量 | 占比 |
|------|------|------|
| assistant | 14,973 | 43.3% |
| user | 7,656 | 22.1% |
| ai-title | 1,795 | 5.2% |
| agent-name | 1,791 | 5.2% |
| mode | 1,755 | 5.1% |
| permission-mode | 1,753 | 5.1% |
| last-prompt | 1,751 | 5.1% |
| attachment | 1,614 | 4.7% |
| file-history-snapshot | 652 | 1.9% |
| system.turn_duration | 544 | 1.6% |
| 其余（queue/api_error/compact/local_command） | <300 | <1% |

**结论**：主体是 `assistant`/`user`（合计 65%）；`file-history-snapshot` 只占 1.9%，不是数据主体。

**服务端 replay 解析成本**（复刻 `session-relay.ts:168 readHistoryFromJsonl`）：

| 阶段 | 耗时 |
|------|------|
| `readFileSync(70MB)` | 0.31s |
| split + filter | 0.04s |
| `JSON.parse` × 34,544 | 0.67s（0.02µs/行） |
| **合计** | **1.02s** |

→ 服务端解析**不是**分钟级瓶颈（~1s）。

## 二、数据流成本模型（按层）

| # | 环节 | 位置 | 成本量级 | 阻塞 | 当前瓶颈 |
|---|------|------|----------|------|----------|
| 1 | 服务端全量 `readFileSync` + 34k parse | `session-relay.ts:173` | ~1s | 阻塞 server event loop | 否 |
| 2 | 服务端同步 flush 34k 行 | `session-relay.ts:56` | 34k 次 `onData`，不 yield/不看背压 | 制造 73MB 瞬时 burst | 否（CPU 低，但放大下游） |
| 3 | 客户端 onmessage `JSON.parse` ×34k | `claude2-adapter.ts:3040` | ~0.7s | 阻塞主线程 | 否（次要） |
| 4 | **`history_end` 一次性 `setRawMessages(34k)` → normalize+render+computeRunning+deriveLiveThinking 全量同步重算** | `claude2-adapter.ts:3066→2783`、`3166-3168`、`2793-2794` | O(n)，单块不 yield | 阻塞主线程 | **是（主因）** |
| 5 | React 首次 commit + virtualizer | `Claude2SessionDetailRoute.tsx`（已 `useVirtualizer`） | 仅可见窗口 mount | 可能次要 | 待 profiling |
| 6 | live 阶段每条新消息触发全量 O(n) 重算 | 同 #4 的 `useMemo` 依赖 `rawMessages` | 每条消息 O(n) | 长会话 live 卡顿 | 衍生问题 |

**算法已排除**：`renderChatStream` 是 O(n) 不是 O(n²)——batch-boundary 前瞻遇首个可见项即 break（`claude2-adapter.ts:2470`），turn-end 回扫被 turn 边界夹住。

## 三、诊断

> ⚠️ 本节「派生主因」是埋点前的假设，**已被上方「实测结论」推翻**（实测 `normalize` ~0.3s，派生非瓶颈）。保留作历史记录与「当初为何怀疑派生」的推理链。

- **主因**：整段历史（34k 条）在 `history_end` 被**一次性同步**塞进 state，触发 `normalizeChatStream` + `renderChatStream` + `computeRunningCount` + `deriveLiveThinkingTokens` 全量同步重算，主线程**完全不 yield** → UI 冻结分钟级（移动端 JS 慢 2–4 倍，体感更糟）。
- **不是渲染**：DOM 已虚拟化（`useVirtualizer` + `ThreadPrimitive.MessageByIndex`），不是 mount 几万个气泡的锅，是**派生**的锅叠加无 yield。
- **衍生**：live 阶段每来一条消息，`rawMessages` 变 → 同一组 `useMemo` 全量重算 O(n)。长会话即使加载完，打字/流式也卡。
- **唯一未钉死的占比**：纯派生 vs React 首次 commit，谁吃掉的时间多 → 由第 0 步 profiling 确认，不靠猜。

## 四、解法空间（标注客户端/服务端，及顺序）

| 策略 | 层 | 杠杆 | 状态 |
|------|----|------|------|
| profiling 埋点（钉死占比） | 客户端 | 决策依据 | **第 0 步** |
| B：派生增量 + 主线程分片 yield | 客户端 | 消除冻结 + 修 live 卡，不改数据契约 | **降级**（实测派生 ~0.3s 非瓶颈，省 <0.3s；仅留作 live 防卡备选） |
| E：应用层 gzip 压缩 + 多帧分块（history+live 批次切多块，各 gzip 成独立二进制帧） | 服务端+客户端 | 传输字节 ÷ 压缩比 + 多帧流水绕过 cloudflared 单大帧 stall，不改数据契约/relay | **已落地**：压缩比 3.6–5.2x；单 blob 版 `historyRecv` ~3.5s（单 2.68MB 帧仅 ~6.3Mbps）；**分块版 `historyRecv` 1.71s / `loadE2E` 2.0s**（53×~50KB 帧，~13.4Mbps，decompress 117ms 可忽略） |
| A：尾部窗口（compact-block windowing：服务端只载入/回放最后一个 compact 块，磁盘 JSONL 全量保留供日后回填） | 客户端+服务端 | 与历史长度解耦；超长会话压缩+分块仍不够时的真正杠杆 | **已落地**（`session-relay.ts` tail-load + live trim；`renderChatStream` 只渲染最后一块）。设计见 [message-replay.md](../design/message-replay.md)「特殊时期 history 缩容」。实证数字待手动 QA |
| C：服务端流式 + 背压 | 服务端 | 去 event-loop 阻塞 + 去瞬时 burst | 后续 |
| D：压缩感知折叠（只渲染最后一个 compact 块） | 客户端 | 语义减负 | **已落地**（A 的客户端投影部分；`renderChatStream` 丢弃最后 compact_boundary 之前的 items，rawMessages 不动） |

B 与 A 互补不是二选一：B 让「全量加载/回填」永不冻结；A 让「打开」与历史长度无关。

## 五、实施路径

> ⚠️ 实测后顺序修正：第 0 步已完成并**排除客户端**；第 1/2 步（派生增量、分帧）因派生被证伪为非瓶颈而**降级**；原列为「后续」的服务端分页（A）升为**当前下一步**。

1. **第 0 步——埋点 + 复现测量** ✅：已在 `onmessage`/`history_end`/`normalize`/`render`/React commit + `historyRecv`/`arrival` 剖点；实测结论见上方专节，已回填「验收基线」。
2. ~~**第 1 步——派生增量**~~（降级）：实测 `normalize` ~0.3s、派生全 <50ms，非瓶颈。重构为 append-only 增量仅省 <0.3s；保留作 live 阶段防卡备选。
3. ~~**第 2 步——历史分帧喂入**~~（降级）：派生非瓶颈，分帧收益有限。
4. **应用层 gzip 压缩 + 多帧分块（E）** ✅：history/live 回放批次先按 ~256KB（未压缩）切成多块，每块 gzip 成独立二进制帧（服务端 `createBatchEmitter` 在 `claude2-stream` callback 内切分压缩，relay 不动；客户端逐块 `DecompressionStream('gzip')` 解压，串行链保序，文本帧保持同步）。顺带修掉回放路径双重序列化（行原样转发，不 parse/stringify）。**第一手压缩比**（真实 session JSONL）：26.7MB→5.3MB(5x)、20.4MB→5.7MB(3.6x)、17.3MB→3.9MB(4.5x)、72.3MB→13.8MB(5.2x)。**墙钟 A/B（桌面 Chrome，同 12MB/5471 样本，经 cloudflared tunnel）**：原始逐行 6.2–8.4s；单 blob 压缩版 ~3.5s（单 2.68MB 帧 cloudflared 仅 ~6.3Mbps）；**分块版 `historyRecv` 1.71s / `loadE2E` 2.0s**（53 帧，多帧流水 ~13.4Mbps；decompress 53×2.2ms=117ms 可忽略；传输时间 ≈1.59s）。结论：cloudflared 对单大 WS 帧有明显 stall，多帧流水让有效吞吐翻倍。
5. **compact-block windowing（A + D）** ✅ 已落地：服务端 `readHistoryFromJsonl` tail-load（只载最后一个 `compact_boundary` → end）+ live `compact_boundary` 主动 trim；客户端 `renderChatStream` 只投影最后一块。这取代了原计划的"尾部分页 + 向上滚回填"——用 CLI 自带的 compact 天然边界，把服务端持有/回放的 history 缩到尾部一块，全量仍在磁盘 JSONL。配套**标量重建**（`system.init` 是 stdout-only、不在 JSONL/tail）：注入种子 init（model/permissionMode）+ runtime fold 当前 permissionMode；skills/slash 走**全量 catalog REST**（读 SKILL.md 真实描述），客户端用会话可用列表过滤。详见 [message-replay.md](../design/message-replay.md)「特殊时期 history 缩容」。**实证 `historyRecv`/内存数字待手动 QA 回填**（同 70MB 样本复测）。
6. **向上滚回填更早 compact 块**：v1 不做（磁盘 JSONL 完整保留，是日后回填唯一来源）。

## 六、验收基线与标准

**已测基线**：
- 服务端 replay 解析（70MB 样本）：**1.02s**（read 0.31 + split 0.04 + parse 0.67）。
- 客户端接收阶段（12MB / 5447 帧，`arrival` 剖析）：`historyRecv` 6.2–8.4s，其中 `onmessage` CPU **815ms（10%）**、等帧 **7535ms（90%）**；`gapAvg` 1.53ms / `gapMax` 339ms。
- 客户端派生：`normalize` ~0.28–0.36s（两趟），`render`/`messageSignature`/`buildTurns`/`processBatch` 全 <50ms。
- 客户端 commit：多个 0.5–0.7s 峰值，发生在 `historyRecv` 之后（沉淀成本）。

**已排除**：客户端浏览器非接收阶段瓶颈（CPU ≤14%）；派生非瓶颈。

**待测（服务端，下一步）**：`history` flush 墙钟，用于区分「服务端 flush CPU」与「tunnel/网络传输」。

**验收目标**（同方法、同样本复测）：
- 客户端首屏可见 **< 2s**（与会话长度无关）。✅ **12MB/5471 样本已达成**：`historyRecv` 1.71s、`loadE2E` 2.0s（分块版）。
- **压缩 + 分块（E）专项验收 ✅**：12MB/5471 样本 `historyRecv` 6.2–8.4s → **1.71s**（分块版；单 blob 版 ~3.5s）；实时增量消息正常、向上滚历史完整、断线重连回放正常、0 消息新会话不崩、服务端 gzip 失败 fallback 仍可渲染（均由压缩/分块改动覆盖，回归测试已绿）。
- 接收阶段等帧：分块后无逐行 `arrival` 信号，改用 `historyRecv − historyDecompress.total` 衡量传输；实测 **1.59s**。
- 主线程单次阻塞任务 **< 50ms**。⚠️ 仍有 `normalize` 峰值 128.6ms、`commit` 峰值 587.8ms —— 发生在 `historyRecv` 之后异步阶段，对 12MB 首屏影响可控，但 70MB+ 会话会因 windowing（载入块变小）而缓解。
- 不回归：现有 web 测试全 pass（312）；api 132 pass；`normalizeChatStream` / `renderChatStream` 纯函数测试不破。
- **compact-block windowing（A + D）专项验收** ⚠️ 待手动 QA（同 70MB 样本复测，桌面 Chrome 经 cloudflared）：
  - (a) 打开长会话只渲染最后一个 compact 块（更早内容不出现）；
  - (b) 断 WS 重连（不重启 CLI）后 model/permissionMode 正确（种子 init + fold）；
  - (c) slash 菜单 skills 显示真实 SKILL.md description（非占位 "Skill"）；
  - (d) 会话中 `/compact` 后旧块消失、新块正常、服务端内存不爆；
  - (e) 实时增量、0 消息新会话不崩。
  - 记录：`__arDebug.perfTrace(true)` + `perfReport()` 的 `historyRecv`（预期随载入块缩小而显著下降），以及服务端 relay `historyLines` 条数（应 = 最后一个 compact 块大小，而非全量）。

## 七、复现脚本

服务端解析成本（可对任意 session JSONL 重跑）：

```bash
bun -e '
const fs = require("fs");
const path = process.argv[1];
const t0 = performance.now(); const raw = fs.readFileSync(path, "utf8"); const t1 = performance.now();
const lines = raw.split("\n").filter(l => l.trim().length > 0); const t2 = performance.now();
for (const l of lines) { try { JSON.parse(l); } catch {} }
const t3 = performance.now();
console.log({ mb: +(raw.length/1048576).toFixed(1), lines: lines.length,
  read_s: +( (t1-t0)/1000).toFixed(2), split_s: +((t2-t1)/1000).toFixed(2),
  parse_s: +((t3-t2)/1000).toFixed(2), total_s: +((t3-t0)/1000).toFixed(2) });
' /path/to/session.jsonl
```

消息类型分布：见第一节脚本思路（按 `type`/`system.subtype` 聚合计数）。
