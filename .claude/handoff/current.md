# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-23（**prompt 队列 v2（排队状态服务端化）已 commit
> `0d16d5d9`（code-reviewer 1 P1 + 2 P3 全修后 amend），全门禁绿；含 v1 三
> commit（`e1c1223c`/`1ae76c15`/`b6f5025d`）+ docs `005002d6`，共 5 commits
> 未推送——push 待用户确认**）

## 一句话状态

prompt 队列 v2 完成：排队状态迁 api relay 服务端维持（用户架构修正「CLI 无遥测
时状态交给我们服务端，模式才统一」）——relay 持 `queuedCommands` 快照 + 广播
`{type:"queue_state", entries}`（全量快照语义），三发送入口（WS user 帧 /
injectUserPrompt / auto-retry inject）经 `reportUserInput(runtimeKey, prompt?)`
单一同步折叠入口 gate 记账（busy=working 才入队），lifecycle 帧（state≠queued）
驱动移除，重连 live_end 后种子快照；web 删本地登记、消费快照（整体替换），撤回/
编辑编排不动。多端同源：B 端/刷新后 chip 由服务端快照重建。

## 本 session 焦点

### 本批：prompt 队列 v2 服务端化（2026-11-22/23，实现完成待 commit）

- **架构修正决策（用户 verbatim）**：「像这种 cli 自己没有返回的做法，状态也理应
  交给我们自己的服务端来做维持……这样才能够完全做到模式是统一的」——v1 的
  发送端浏览器本地记账被推翻，迁 api relay。
- **探针（v4）定案的两处实现细节**（脚本已删，结论留档）：
  1. idle 下发 prompt 的 queued 帧 ~2s 即发（CLI 接受即发，非 turn 末）；started
     帧 turn 查询开始即发（早于首条 assistant）→ stop 后 stale working 假 chip
     秒级自愈（started 帧驱动 remove）→ **不加 interrupt→idle 信号**的决策成立。
  2. 重连回放段（liveLines 缓冲）带断开窗口内的 lifecycle 帧，但排队期间断开重连
     本身零信息——种子快照（live_end 后队列非空才发）正是该窗口的价值。
- **gate 只判 working 不含 blocked**（保守方向）：blocked 未实测，漏登记无害
  （lifecycle 帧对未知 uuid no-op 自愈），错登记可能永久泄漏；状态机本就忽略
  blocked 的 user_input（blocked 优先，插话不能谎报审批已解决）——语义自洽。
- **实现落点**：
  - shared：`ClaudeQueuedCommand {uuid, content}` + `ClaudeQueueState` + union。
  - session-relay：`queuedCommands` state + `enqueueQueuedCommand`（uuid 幂等去重）
    + `removeQueuedCommand`（真移除才广播，到空照发）+ handleStdoutLine 的
    command_lifecycle 分支（state≠queued → remove）+ addSubscriber live_end 后
    种子快照（非空才发）+ destroy 清空。queue_state 广播-only 不入 liveLines。
  - claude-runtime：`reportUserInput(runtimeKey, prompt?)` 单一同步折叠入口
    （gate 读 → applyStatusSignal → 条件 enqueue，无 await 缝隙——修 gen-ui
    loadGenUiContext/REST ensureRunning 两处真异步点竞态）；auto-retry inject
    生成 uuid 贯穿 stdin 行/echo/登记三方（CLI 采纳上行 uuid 为 command_uuid →
    lifecycle 帧可对齐清理，P1-4）。
  - claude-stream：WS user 分支（startsTurn && anchorUuid && queueText 非空）+
    injectUserPrompt 尾部（compose 前原文，防 gen-ui XML 污染 chip 显示/回填/重发）
    两入口接线；`extractQueueText` helper（text blocks join，纯图 null）。
  - claude-adapter：删 LocalQueuedCommand/登记/isRunningRef/Pass 1 lifecycle 消费
    （归回 skip 族）；加 Pass 1 queue_state → 整体替换 + 三处 skip（Pass 2/
    messageToThreadLike/normalizeChatStream）+ shouldCacheReplayLine 排除。
    **重发闭包改**：重发后不设本地登记（v2 不消费 lifecycle）——v1 的整体替换
    本地登记会在「success 回执时 turn 恰已 idle」race 下制造无快照跟进的永久假
    chip，删本地登记等 api 快照收敛。
  - ClaudeSessionDetailRoute：类型换 shared，UI 零改动。
- **验证（全绿）**：全量单测 api 1397 / shared 16 / web 1095 = 2508 pass 0 fail
  （含 relay 5 + runtime gate 矩阵 + stream booking 6 + adapter hook 3 + fallback
  用例新面）；format / lint 0 warning / typecheck 三包 / CSS 硬闸 / tokens 机检
  0 违例。逐包测试在实现中均单独跑绿过。
- **记档接受的边界**（plan「记档接受的边界」节全文仍有效）：并发撤回窗口他端条目
  丢失（毫秒级窗口）；API 重启孤儿 CLI → 全新快照谎报空；blocked gate 未实测
  （保守去 blocked）；gate 盲窗；close 不广播；TurnCheckpointer.inFlight 悬挂
  （interrupt 无 result 现存 bug，与本批无冲突）；旧 PWA fallback 噪声；结构性
  终局备选（撤回编排上收 api）留后续批决策。

### 易丢的关键上下文（v2 新增）

- **快照语义 = 整体替换**：客户端本地乐观操作（撤回移除/清空）保留即时反馈，
  快照随后覆盖同值收敛；重发完全靠服务端快照重现（working → gate 入队广播；恰已
  idle → 本就该无 chip）。
- **uuid 白名单链**：上行 uuid 过 MESSAGE_UUID_RE 才登记（白名单是 CLI 采纳
  command_uuid 的前提）；auto-retry 的 uuid 用 crypto.randomUUID() 生成后贯穿
  三方。lifecycle 帧对登记表中未知 uuid 是 no-op（自愈不误删）。
- **queue_state 帧的断言风格**：relay 广播断言一律 queue_state 类型过滤
  （lifecycle 帧自身透传广播会干扰 length）；种子快照位置断言用 liveEndIdx+1。
- 探针教训（v4）：ws.onmessage 收帧数组挂 window 上、断连后重连前要把收集器
  清空分段；鉴权 readAppPassword 脚本自读（密钥不进 agent 上下文）。

### 上一批（本 session 未动，待 push）

- v1 排队可视 + 撤回/编辑（`b6f5025d`）；command_lifecycle 收编（`1ae76c15`）；
  CLI 2.1.325（`3e745749` **已推送**）；docs（`e1c1223c`/`005002d6`）。
  v1 的协议事实与实现细节见 snapshot `20261123-0123.md`；v1 本地记账面已被
  v2 删除（onNew 登记/isRunningRef/Pass 1 lifecycle 消费），其 handoff 描述
  不再反映现状。

## 下一步

1. push 待用户确认（5 commits：v1 三 + docs + v2 `0d16d5d9`）。
2. 真机清单（交用户，v1+v2 合并）：两设备同开会话——A 端 running 中排队 →
   B 端立即见 chip；A 端撤回 → B 端 chip 消失；刷新 B 端 → chip 仍在；撤回
   编辑回填照旧；turn 结束 chip 清空。

### code-reviewer 消化（2026-11-23，已全修 amend）

- **P1（种子空洞，已修）**：种子「非空才发」在 delta 重连路径留永久 stale
  chips——断连窗口内 lifecycle 帧广播到零订阅者丢失，重连走 delta 分支不
  reset、种子又因队列已空被跳过 → chips 残留且无自愈（v2 已删 lifecycle
  消费）。放大链：stale chip 撤回 → cancel_queued 对空队列 no-op → resend
  闭包把已执行过的条目当新 prompt 重发。修法 = 种子无条件发（空快照即修正
  帧，~40B/连接）；5 处测试同步翻转（含既有回放协议测试钉「live_end 后无
  帧」的 4 处连锁）。
- **P3×2（已修）**：booking 双重守卫收敛（`startsTurn && anchorUuid` 与
  `anchorUuid && queueText` 判两次 anchorUuid → `startsTurn` 单判）；echo
  serialize→parse→re-serialize 往返消除（buildAutoRetryEchoLine 签名改
  (message, uuid) 直接构造，同源 uuid 语义不变）。

## 挂账（非本批）

- 真机验证清单（pages 五条 + 渐进披露五条，gtd @mcp-apps 组）仍待用户。
- checkpoint 批（dad68fe/278289d2/d81b28d9，已推送）待真机验收。
- settle 批（`16c9911`，已推送）待真机验收。
- probe-fab.mjs 过期断言（5 FAIL）待拍板重构/退役。
- 技能更新检测服务端慢（逐 repo 串行拉 GitHub Trees）。
- StatusDot/StatusMarker 休眠死代码待拍板。
- wiki 格式对齐批 → wiki Quartz（先 /check-deps）。
- 会话进行中调度 auto-retry pending 注入计时器（runtime 生命周期遗留）。
- checkpoint 批已知取舍：diff 面板单容器滚动；只做 claude 对话回滚。
- mock 了 overview 的其它 e2e spec 未补 sessions-stream mock（实锤一条修一条）。
- pages 域 + 外部 MCP server 管理批（2026-11-17 完成）待提交 + 真机验证
  （gtd @mcp-apps 组）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

最后更新：2026-11-23 / 触发原因：prompt 队列 v2 服务端化实现完成（全门禁绿，
commit/review 待做）。
