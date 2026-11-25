# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-26 07:30（**#11 队列重物化全批落地**：M1 `0dec6e4c` + M2
> `3aa1e43f` + review 修正 `24617ac4` 已 commit，待 push；文档记档 §6.20 +
> handoff 已 save。dev 演练 1/2 实质 PASS）

## 一句话状态

#11 重启恢复（队列重物化）三 commit 全部落地、两份 reviewer 消化完毕、dev
演练通过、文档记档完成。下一步 = push + 交用户真机验证清单。

## 本 session 焦点（#11 队列重物化批）

- **M1 落盘层**（`0dec6e4c`）：新 `api/src/queue-store.ts`（`runDir/queues/<sessionId>.json`
  独立目录、temp→rename 原子写、损坏面拒读不删、上限常量、filterExecutedUuids
  JSONL 对照、孤儿 GC、tmp 清扫）+ relay `onQueueChanged` 契约（5 真实变更点）
- **M2 编排**（`3aa1e43f`）：spawnAndStart 尾钩 `recoverSessionQueue`（api 重启
  懒 respawn 与 CLI 崩溃/effort respawn 共用）+ `flushRecoveredCommands` 逐条
  claim→write→reportUserInput + holdQueueAndStop 恢复中停止转冻结 + 删除级联
  （registry `onMetadataRemoved`）+ boot 孤儿 GC
- **review 修正**（`24617ac4`）：code-reviewer P1×2（persist 合并丢条目 /
  restoreHeld 覆盘面）+ security-reviewer P1（queues/ 独立目录防 brick
  loadIndex）全修；P2 上限对称 + 撤单剔除链 + 孤儿 GC 二次确认；P3 compact
  窗外补扫
- **dev 演练**：#1 排队 2 条 respawn 恢复 = PASS（JSONL 实证 B/C 原 uuid 重发
  执行）；#2 held 冻结恢复 = PASS（不自动执行 + discard 清盘）。脚本两个 FAIL
  均为断言子串误报（queue_held 广播帧含条目 content「…H-DONE」命中谓词）。
  S1/S2 测试会话已 DELETE 清理，queues/ 已空。

## 关键决策（本阶段不可丢）

1. **恢复语义**（用户拍板）：自动继续执行；首条 idle 直注、后续 busy 入队
   （走 #2 修复管道），客户端零改动。
2. **恢复条目保留语义**：`write stdin 成功 ≠ 已执行`——条目全量留盘面与 rec
   直到下次 spawn 的 JSONL 对照剪枝；flush 收口不清态不落盘。
3. **persistQueueState 合并**：恢复条目原序在前 + relay 新消息 uuid 去重补后；
   绝不 slice(next)。
4. **撤单剔除链**：cancelled 帧 → onCommandSettled 先于 removeQueuedCommand
   → rec.cancelled.add → persist 看到剔除后面。
5. **held 恢复为冻结态**（机器不替用户恢复显式停止）；恢复中停止 = 未发尾部
   转 held。
6. **上限对称**：100 条 / 单条 512KB / 文件 4MB；超限条目不入队不挂起（echo
   直注降级，会话内照常执行仅盘面不含）。
7. **接受项**（§6.20 记档）：resume 清 held ~ms 窗口、compact 窗外 CLI uuid
   幂等兜底、tmpfs 机器重启丢、OPC 多租户无隔离（届时统一治理）。

## 下一步

1. **push 三 commit**（`0dec6e4c` / `3aa1e43f` / `24617ac4`；push 在用户授权
   语境「你现在可以继续往下做了（push之后）」）。
2. **交用户真机验证清单**（§6.20 尾）：①排队 2 条重启恢复逐条执行；②冻结恢复
   不自动执行 + 恢复/放弃；③恢复中停止转冻结；④删除无 queue 残留；⑤effort
   切换 respawn 队列存活；⑥日常发版窗口自然验证。
3. 用户盘点清单剩余挂账：#7 wiki（「待会再说」）、#4 trust、#10 回流编排、
   #3 checkpoint/settle（用户自测）。

## 阻塞 / 风险

- 无阻塞。dev api 已是含全部修正的最新代码（演练后未再动）。

## 易丢的关键上下文

- 演练脚本在 `/tmp/ar-queue-drill.mjs`（一次性，不入库）；清理脚本已删。
- 演练会话 S1=`agent_8851a41299f84dfa`、S2 已删；S2 claudeSessionId=
  `1a2f6a71-…`（JSONL 计 0 实锤未自动执行）。
- review 修正细节全在 §6.20（redesign-v2.md 尾部新段）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

最后更新：2026-11-26 07:30 / 触发原因：#11 全批收官（三 commit + 记档 + 演练），
push 前存档。
