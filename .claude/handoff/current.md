# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-14（**Turn 级 checkpoint 批（T3 学习点③）：实现 + 三类 reviewer
> 报告全部消化 + 全门禁复跑绿，待 commit（push 待用户确认）+ 真机验收**）

## 一句话状态

Turn 级 checkpoint（隐藏 git refs）完整闭环已落地：每轮 turn 前后快照 → 用户消息动作条
「查看本轮改动」（diff + 统计 + 双开关）→ 强确认回滚（文件 + 对话 fork）。全门禁 /
单测（api 1357 + shared 16 + web 1087）/ e2e 42 / probe-checkpoint 17/17 全绿。

## 本 session 焦点

### 关键决策（不可丢）

- **锚 uuid 贯通**：客户端 `crypto.randomUUID()` 作上行 user 帧 uuid；CLI 直接采用 →
  同一 id = UI 消息 id / JSONL uuid / checkpoint 锚。`claude-adapter.ts` 两处上行已补
  uuid；live echo 用 `parsed.uuid`。**端到端断点就在这里，探针测不出**。
- **只有带文本的上行才起 turn**（`startsTurn`：content 含 text 块）——纯 tool_result
  帧是轮中续跑，否则造 anchor=null 幻影轮。
- **expectedCommit 比对的是 endpoint**（列表 summary 的 commit），不是恢复目标
  baseline（服务端裁决出的另一棵树）——拿它跟 baseline 比会恒 409（P0 已修，
  `resolveTurnEndpoint`）。
- **对话能力前置闸必须早于文件恢复**（否则工作区已改却报 400）；claude 会话创建即钉
  claudeSessionId，真实降级面是 terminal 形态。
- refs 即索引（`refs/ar/checkpoints/<sha256(sessionId)[:16]>/<ordinal>/<phase>`，
  元数据 JSON 在 commit message）；capture 走临时 GIT_INDEX_FILE 不动用户 index/工作区。
- 回滚目标裁决：本轮 baseline → 降级上轮 endpoint → 双缺 404。
- 对话 fork：`--resume <old> --resume-session-at <上一轮 endUuid> --fork-session`；
  首轮无前驱 → 全新会话。

### 进度

- ✅ 阶段 1-5 全实现（shared DTO / git-runner / checkpoint-service / turn-checkpointer /
  路由 / 回滚执行 / web 入口浮层 / 文档 / 探针）
- ✅ 两轮 design-reviewer 报告消化：P1-1 触屏入口可达（`hover-capable:` + `touch:`）、
  P1-2 受控关闭桥（SHEET_UNMOUNT_DELAY_MS）、P1-3 双开关解耦 + `nothingSelected`
  disabled、P1-4 `busy_session:*` warnings 消费 + 预回滚「其它会话运行中」警示、
  P1-5 `text-warning-text`；P2 若干（逐文件路径+状态角标、错误码分流、确认文案随勾选、
  禁用原因 caption、role=status/alert、`aria-describedby`、图标 history→undo-2）
- ✅ code-reviewer 报告消化（2 P0 + 7 P1 + 若干 P2）：
  - P0-1 `capture()` 每步校验 exitCode（`captureStep`）+ update-ref 后 `resolveRef` 复核
  - P0-2 backup 捕获失败绝不进入不可逆 restore（capture 自校验即断点）
  - P1-3 `beginTurn` 判重与占位同步完成（占位 ordinal=0，扫描期间被 resetSession 则放弃），
    endTurn 见 ordinal<1 跳过 endpoint
  - P1-4 新增 `CheckpointService.maxOrdinal()` 扫全部 phase 的 ref（含 baseline-only 半 turn）
  - P1-5 `rollbackConversation` 等 fork 的 system.init 落地（`forkWaiters` +
    20s 超时）后才返回；客户端回滚请求超时提到 120s（默认 8s 会误报）
  - P1-6 `pendingFork` 无条件消费（id 相同也结算）+ 结算 waiter
  - P1-7 截断锚解析前移到能力前置闸内：`ordinal>1 && anchor===null` → 400
  - P1-8 restore 加 `--no-overlay`（目标里不存在的路径要删）
  - P1-9 busy 闸加 `turnCheckpointer.hasInFlight`（metadata 落盘滞后）
  - P2：`kill("SIGKILL")`、restore 链路独立 60s 超时、reset exitCode 检查、fs import
    合并、metadata 缺失直接 return、list/diff 方法钉死（POST→405）、checkpoints 数组
    进 context 单订阅（不再每消息一条 query）
- ✅ 新增单测 8 条：并发 beginTurn 单 ordinal / 半 turn 续编 / capture 非零退出上抛 /
  backup 写不进时不动工作区 / restore 失败保留 backup ref / in-flight busy /
  上轮无 endUuid 前置闸 / verb 方法钉死
- ✅ 全门禁：format:check / lint 0 warning / typecheck / 全量单测（systemd 2G）
- ✅ web 重建（`respawn-pane -k`）+ CSS 落盘硬闸 + tokens 机检 0/0
- ✅ `bun scripts/probe-checkpoint.mjs` **17/17**（桌面 11 + 降级 3 + busy 2 + 其它会话警示 1）
- ✅ `systemd-run -p MemoryMax=4G bun run e2e` **42/42**
- ⏳ commit（pre-commit 全门禁）→ push 待用户确认

### 易丢的关键上下文

- 探针取消按钮必须 scope 到确认框：`getByRole("dialog").filter({has: 确认回滚按钮})`
  ——浮层自身也有「取消」，DOM 序在前，`.first()` 会误关浮层。
- 改 web 后：`respawn-pane -k -t ar-dev:web 'scripts/ar-dev-web.sh'` → 等 25s → 再跑
  `node scripts/ar-verify-css.mjs`；探针一律 `bun scripts/X.mjs`。
- 全量单测 `systemd-run --scope --user -p MemoryMax=2G`；e2e 用 4G。
- `site/` untracked 不入库；commit 用标准 `git add && git commit`（禁 `--only`/`--git-dir`）。

### 下一步

1. commit（尾行 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`）
   → 请用户确认 push。
2. 真机验收清单交用户：①发一轮让 agent 改文件 → 该消息「查看本轮改动」显示 diff
   ②点回滚 → 文件恢复 + 对话截断到该轮之前 ③同项目其它会话 working 时出现波及警示
   ④非 git 项目 / terminal 形态入口降级 ⑤触屏（iPhone/iPad）动作条常显可点。

## 挂账（非本批）

- settle 批（`16c9911`，已推送）待真机验收。
- settle 搜索结果不含 settled（inbox 2026-11-13）。
- probe-fab.mjs 过期断言（5 FAIL）待拍板重构/退役。
- 技能更新检测服务端慢（逐 repo 串行拉 GitHub Trees）。
- StatusDot/StatusMarker 休眠死代码待拍板。
- wiki 格式对齐批 → wiki Quartz（先 /check-deps）。
- 会话进行中调度 auto-retry pending 注入计时器（runtime 生命周期遗留）。
- checkpoint 批已知取舍：diff 面板单容器滚动（DiffContent 内 sticky hunk 条不吸顶，
  逐文件导航仍可用）；只做 claude 对话回滚（其它 provider 留能力位）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

最后更新：2026-11-14 / 触发原因：checkpoint 批 reviewer 报告消化完毕 + 全门禁复跑绿，准备 commit。
