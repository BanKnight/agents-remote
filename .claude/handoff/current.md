# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-15（**agent 状态点 5 态化批已 commit `9d5421f`**——OSC 7501 对齐；同日早前：分类明细批 `dbbf669`、权威化批 `fe5e396`）

## 一句话状态

5 态化批已交付（`9d5421f`）：turn 状态机 idle/working/blocked/done/error + closed，语义对齐 Program Status Protocol（OSC 7501）。api 纯状态机 → metadata 落盘 + session_status 帧广播 + seed 回放恢复（与 fe5e396 统一标量管道同构）。code/design 双 reviewer 报告全消化（P1×6/P2×3 修复 + P3 记档 inbox），探针 9/9、全门禁绿（api 931 + web 803）、dev 已 respawn、CSS text/css。**待真机验收**。

## 本 session 焦点

### 关键决策（不可丢）

- **状态机 = `api/src/agent-session-status.ts` 纯函数**（迁移全表单测）：信号 user_input / approval_requested / approval_settled / turn_result(isError) / close。**blocked 优先（OSC 7501，review P2-8 采纳）**：审批挂起期间插话由 CLI 排队、保持 blocked（翻 working 会谎报），settled 才回 working；closed 不落盘（index.ts 装配处短路——与 removeMetadata 竞态复活，P2-7）。
- **信号挂载点全在既有 stdout 骨架零新 parse**：result 帧→turn_result（复用 isErrorResultLine，放 settled capture 之后同帧覆盖）；can_use_tool→approval_requested；claude-stream message/injectUserPrompt→user_input；**进程死亡 exited 回调补 turn_result isError=true（P1-1，processes.delete 前）**；close 信号在 processes.delete 前。
- **spawn 恢复透传（P1-2）**：`spawnInitialStatus(persisted)` 归一（done/error 存活，其余归 idle）——startAgent/ensureRunning/claude-stream 两处调用点全透传。
- **计数单源 `countsAsRunning(type, status)`**（shell-primitives，P1-3 五处共用）：agent 计 working；**terminal running（进程存活）照常计入**；dot/加粗/off 置灰同族全部补 terminal running 分支（P1-4/5/6）。
- **脉动 = working 与 done 列表唯一可辨面**：`.dot.run` dot-pulse 2s；`.dot.done` 同色静止。
- **重启恢复**：parseMetadata 归一（仅 agent，running/working/blocked→idle）+ spawn 透传 done/error。
- **P3 记档 inbox**（不修）：effort 确认门双数据源（dialog REST vs 详情页 WS 标量）；config 读改写并发窗口（既有模式）。

### 进度

- ✅ 5 态化批 `9d5421f`（41 files）：api 状态机/装配/管道 + shared 协议 + web 全消费点 + spec §4.2/§82 + components.css 单源 + 探针
- ✅ 分类明细批 `dbbf669` + 权威化批 `fe5e396`（前批，待真机合并验收）
- ⏳ **真机清单（5 态化批）**：①新会话 idle 灰点 → 发消息 working 绿脉动 → 触发审批 blocked 橙 → allow 回 working → 结束 done 绿静止 → 再发消息翻 working；②kill API 重启后列表 idle（done/error 按值存活）；③auto-retry：error → 60s 注入翻 working；④done 绿静止 vs working 脉动可辨度；⑤terminal 会话 running 计入「N 进行中」计数
- ⏳ **真机清单（上下文占用三批合并）**：见前批 handoff（resume 39efb784 ~41%、live 渐进、分类分段条双主题可辨）

### 阻塞 / 风险

- 无阻塞。真实 WS 端到端链路（分类器拦）继续由真机复验兜底。

## 易丢的关键上下文

- **typecheck 盲区**：`SessionMetadata.status` 联合含 terminal "running" 掩盖 agent 调用面——web 消费靠 rg 全量人工清单；`GlobalInstanceCandidate.status` 是双联合宽类型（`AgentSessionStatus | TerminalSessionStatus`），消费按 type 分流。
- **instanceDot2 vs statusToTone 的 done 分歧是刻意的**：dot 保留成功语义绿（与 idle 区分），pill 文字色降级 muted——勿修成一致（代码有注释）。
- **审批 settled 触发面**：approval-center `notifySettledIfEmpty`（多卡最后一张注销才触发）+ respond 三出口/unregisterForwarded/clearRuntime 全挂；`ApprovalRegistry.hasRuntime`。
- **探针 fixture 语义**：probe-session-status 断言 4 期望「2 进行中」= 1 agent working + 1 terminal running（P1-3 后新语义，勿改回 1）。
- **探针纪律**（沿用）：`systemd-run --scope --user -p MemoryMax=2G bun scripts/X.mjs`；一次性诊断不入库；验证用 PROJECTS_ROOT/test；会话清理端点 = `POST /api/projects/<p>/agent-sessions/<id>/close`。
- **后续候选**：omp(ACP) 会话恒 idle——follow-up 给 acp-runtime 接同一状态机；blocked 细分 kind（permission/question/auth）留协议扩展位。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-15（5 态化批 commit 9d5421f + handoff 记档）
