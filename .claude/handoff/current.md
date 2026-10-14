# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-14（**会话标量统一管道 P0 已 commit `c8de11e`**；同日：claude-code 2.1.299 `52fc6d0`、浮层回焦 `7b83976`/`8eb4a4e`、卡形制 `641e7d5`、空隙同构 `488ad68`、滚动条+发送按钮 `ae2397b`）

## 一句话状态

用户两个优化方向讨论定调并落地 P0：**①双模式（后续批）②上下文占用（P0 已交付）**。P0 = 「采集层 → api 标量 → WS 单管道 → 前端统一组件」管道第一段：usage 折算 → 广播 → composer 控制行显示（`128.4k` 形制）。全门禁绿（单测 1718、探针 4/4、CSS/tokens 闸过）。

## 本 session 焦点

### 关键决策（不可丢）

- **架构共识（讨论定调，指导后续所有状态批）**：采集层（per-agent × per-mode）→ 统一会话标量 state（api）→ WS 单管道 → 前端统一组件。①**mod 不写入 stream-json 流**（协议流由 CLI 内部 writer 管理，无此 API）；其数据走旁路（HTTP/文件）由 api 收敛进同一 WS 广播，前端协议零新增。②**终端模式状态不用 OSC**（tmux 吞未知序列）——正解 = 同一个 bridge mod 在终端交互式会话照跑（官方表格：terminal = hooks Yes）。③未来 pi/acp 双模式 = 各自 runtime 两种进程形态，标量走同一广播，tmux 管理复用 `tmux-runtime.ts`。
- **P0 实现要点**：`extractContextTokensFromStdoutLine`（assistant usage 的 input + cache_creation + cache_read，真实 CLI 2.1.299 字段实证一致）；`captureContextUsageFromLine` 挂 processStdoutLine（真实新行唯一入口，回放不经）；值变化才 `relay.injectLine` 广播 `context_usage`（broadcast-only，持久值由 `seed_init.contextTokens` 承担回放恢复）；**无 metadata 持久化**（纯显示态，重启后首轮 assistant 消息即恢复）。
- **自查抓到真 bug（已在批内修）**：`normalizeChatStream` 的 system 分支尾部 fallback（`messageToThreadLike` 对无 content 帧返回非 null system 摘要）会把 `context_usage` 渲染成噪音气泡——补 `continue` 短路 + 单测锁定。
- **CLI stdout 时序认知（诊断踩坑得出）**：claude CLI 在**收到首条 stdin 消息前不吐任何 stdout**（不主动发 system/init）——产品链路无碍（前端 prompt 驱动），但「等 init 再发 prompt」的探针/诊断脚本会死锁。
- **（沿用）CLI 2.1.299 升级**：OSC 7501 headless pipe 不可达（TTY-only）；modelMapping env 注入免疫 alias 漂移；「关闭不回焦」两族约定（spec §5.0 / frontend-notes §33）。

### 进度

- ✅ **会话标量统一管道 P0** `c8de11e`（usage → 上下文占用显示；后续 mod/终端模式接入同一管道）
- ✅ claude-code 升级 2.1.299 `52fc6d0`；浮层回焦 `7b83976` 真机验收通过
- ⏳ **下一批候选（已拍板方向，待排期）**：①**双模式切换**（idle-only 可逆视角切换、终端模式审批让位、UI 入口「在终端打开」/「回到对话」）；②mod 采集批（bridge mod 旁路 → 同一管道）；③插件管理 UI。

### 阻塞 / 风险

- 无阻塞。**未完成验证**：真实 WS 端到端链路诊断被 auto-mode 权限分类器拦（会创建 agent 会话负载）——已用真实 CLI 直接验证 usage 字段语义 + mock WS 探针覆盖客户端全链路；**完整真实链路建议真机/手动复核一次**（打开会话 → 发一轮 → composer 控制行出现 token 数 → 刷新重连后仍在）。

## 易丢的关键上下文

- **P0 标量管道骨架**（后续批照此扩展）：shared `ClaudeContextUsageChanged` + `seed_init.contextTokens` → api `captureContextUsageFromLine` + `buildSeedInitLine(…, contextTokens)` → session-relay knownSubtypes → web `applyMessageScalarState` + normalizeChatStream 短路 → `ContextUsageIndicator`（composer 控制行，桌面/移动同组件）。
- **探针**：`scripts/probe-context-usage.mjs`（4 断言：无标量不渲染 / 帧折算 / 更新 / 重连 seed 恢复）。
- **CLI 探查结论**（延续）：`/tmp/cc-changelog.md`（2.1.269-299）；2.1.288 后台 Bash 限时 30min、2.1.285 `-p` 默认 auto mode 均待真实使用观察。
- 探针纪律（沿用）：`systemd-run --scope --user -p MemoryMax=2G bun scripts/X.mjs`；一次性诊断不入库用后删（本批 `_diag-usage-e2e.mjs` 已删）。
- 会话清理端点 = `POST /api/projects/<p>/agent-sessions/<id>/close`（**不是 DELETE**——DELETE 会命中项目删除路由）。
- 验证用测试项目（PROJECTS_ROOT/test），不在正式项目建 session。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-14 19:00；触发原因：会话标量统一管道 P0 收尾（commit c8de11e + 记档）
