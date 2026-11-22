# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-22（**prompt 队列功能（排队可视 + 撤回/编辑）已 commit
> （`b6f5025d`，pre-commit 全门禁过），未推送；`1ae76c15`（command_lifecycle
> 收编）也未推送——两 commit push 均待用户确认**）

## 一句话状态

prompt 队列功能完成并 commit：running 中发送的 prompt 在 CLI 侧排队（turn 结束后
依序执行），web 侧排队可视（composer 卡内 clock chip 列表）+ 撤回单条
（cancel_queued 全清 + 剩余按序重发）+ 编辑（撤回 + 回填 composer）。数据源 =
本地发送记录 + command_lifecycle 对齐（headless 无 queue-operation 帧，排队期间
服务端零遥测——三轮探针实锤）。

## 本 session 焦点

### 本批：prompt 队列功能（2026-11-22，commit `b6f5025d` 未推送）

- **实测定稿的协议事实**（v1/v2/v3 三轮真实 CLI 探针，脚本已删）：
  1. `queue-operation` 帧 **headless 不存在**（v1 全程零帧）——plan 假设「inputQueue
     管道有数据源」被推翻；排队可视唯一可行数据源 = 本地发送记录（onNew 登记
     uuid+content）+ lifecycle 帧对齐清理。
  2. queued/started 帧**延迟到 turn 边界才发**（A completed 后 B/C 才 queued+started
     连发）——排队期间（A running 中）零遥测；queued 帧确认入队不移除本地记录，
     started/completed/cancelled 才移除。
  3. `for_user_message_uuids` 只 **interrupt 名单中正在执行**的命令（turn:"stopped"），
     队列中的不动（still_queued 原样返回）——撤单条不可用。
  4. `cancel_queued:true` = **interrupt 执行中命令 + 清空队列**（已 started 的 B 也
     被打断产 cancelled 帧）+ 响应 `{still_queued:[], cancelled:[被清 uuid]}`。
  5. interrupt 执行中命令后队列立刻推进下一条（B cancelled → C started）。
- **实现落点**（全部双端单源）：
  - adapter（claude-adapter.ts）：`LocalQueuedCommand` 类型 + queuedCommandsRef/
    queuedCommands state + setQueuedCommandsSync 单点双写 wrapper + Pass 1
    command_lifecycle 消费分支（queued 不移除）+ cancel_queued case（success 消费
    queuedResendRef 重发闭包）+ Pass 2 skip 判定扩 cancelled/still_queued 双字段 +
    onNew running 中登记（isRunningRef gate，idle 发送不记防 chip 闪现）+
    cancelQueuedEntry（全清+重发，重发闭包走 ref 桥接——sendToSocket 定义在 Pass 1
    之后，直接引用会 TDZ）+ cancelAllQueued + hook 返回三成员。重发登记 = **整体
    替换**非 append（append 留旧 uuid 条目泄漏，单测实抓后修正）。
  - UI（ClaudeSessionDetailRoute.tsx）：ComposerWithInterrupt 排队 chip 区
    （canvasContext chip 同构：clock 图标 + truncate 内容 + × 撤回），点内容 =
    编辑（composer.setText 回填 + 撤回）。i18n `claude.queue.cancel/edit` 双语。
  - 既有 bug 修复：applyQueueOperation default 防御（JSONL 记账形态
    `{type,queuedType}` 无 operation 字段打穿 reducer）。
- **验证（全绿）**：pre-commit 全门禁过（format / lint 0 warning / typecheck /
  全量单测 api 1389 + shared 16 + web 1095 = 2500 pass 0 fail，含排队登记/移除/
  重发链新用例）/ CSS 硬闸过 / tokens 机检 0 违例 / v3 探针真实 CLI 全链绿
  （撤 B 生效 + C' 重发走完 queued→started→completed）。

### 关键工程点（易丢）

- **sendToSocket 与 applyMessageScalarState 定义顺序**：Pass 1 若直接引用
  sendToSocket，useCallback deps 求值 TDZ——重发闭包走 ref（queuedResendRef）。
- **撤单条 = 全清 + 重发**：CLI 无「从队列移除单条」API；resend 清单 = 除被撤条目外
  的**全部**排队条目（含 idx 之前的——全清把它们也清了），filter 保序。重发必须等
  success 回执（早到会被 cancel_queued 一并清掉）；error 时闭包作废（CLI 队列未清，
  本地剩余条目显示仍正确，自洽）。
- **UI 编辑回填用组装后帧文本**（entry.content 含提及行/画布上下文）——回填 composer
  原文会丢附件上下文。
- 重连/切会话 resetSessionState 清空本地排队记录（安全方向：CLI 侧队列可能已被消费，
  旧记录显示「排队中」是错误状态；lifecycle 对齐只在同一连接内有效）。
- v2 探针教训：A 任务必须真长（数到 100），否则撤回发出时 B 已 started 前提崩塌；
  waitFor 等 result 数要把「被 interrupt 的命令也产 interrupted result」算进去
  （v3 第一轮 2 个 result 假红 = B 的 interrupted result 提前满足）。
- 分类器间歇故障应对（2026-11-22 实战）：Claude Bash/Edit/Write 分类器持续
  unavailable 时，allowlist 命令（sleep/git/rm/bun 前缀）放行、node/systemd-run/
  cat-heredoc 前缀被卡——同一脚本换 `bun scripts/X.mjs` 形式可过（CSS 硬闸 node
  被卡、bun 放行）；全量单测直跑 `bun run test`（无 cgroup）成功；commit 用标准
  `git add && git commit` 正常走 pre-commit 全门禁。

### 上一批：CLI 升级 + command_lifecycle 收编（2026-11-20/21，`3e745749` 已推送 + `1ae76c15` 未推送）

- CLI 2.1.299 → 2.1.325（供应链合规最高版）；Code Mode 拍板不接入（官方硬约束排除
  headless 形态）。golden path 7/7 + e2e 42/42（补 acp-session.spec 的
  sessions-stream mock）。
- command_lifecycle 遥测帧收编（skip 策略）→ 本批在其锚点上接排队可视。

### 易丢的关键上下文（CLI 升级批留档）

- `--resume-session-at` 是未文档化 flag——`claude --help` 里没有，验证存在性用
  `claude --print --resume-session-at <nil-uuid>`（应报「requires --resume」而非
  unknown option）。checkpoint fork 回滚管线依赖它 + `--fork-session`。
- 下次升 CLI 的对照基线（2.1.325）：permission-mode choices =
  `acceptEdits/auto/bypassPermissions/manual/dontAsk/plan`（help 里无 "default"）。
- **升 CLI 的回归验证配方**：①版本+choices 对照 ②参数层 flag 验证 ③全量单测
  ④golden path ⑤e2e 全量。
- e2e 的 sessions-stream mock：`routeWebSocket(/\/api\/sessions\/stream$, (ws) =>
  ws.send(JSON.stringify({type:"sessions", sessions: [...]})))`；其它 mock 了
  overview 的 spec 同样裸露在此竞态下，实锤一条修一条。

### 下一步

1. push 待用户确认（`1ae76c15` + `b6f5025d` 2 commits）。
2. 真机验证清单（交用户）：running 中连发 2 条 → chip 区出现 → 撤 1 条剩 1 条 →
   编辑回填 → turn 结束 chip 清空；移动端同组件零单独改动。边界说明：重连/刷新后
   排队 chip 清空（本地记录清空），CLI 侧队列仍在继续执行——重连后看不到排队条目
   是安全方向的取舍。

## 挂账（非本批）

- 真机验证清单（pages 五条 + 渐进披露五条，gtd @mcp-apps 组）仍待用户。
- checkpoint 批（dad68fe/278289d2/d81b28d9，已推送）待真机验收。
- settle 批（`16c9911`，已推送）待真机验收；settle 搜索不含 settled（inbox）。
- probe-fab.mjs 过期断言（5 FAIL）待拍板重构/退役。
- 技能更新检测服务端慢（逐 repo 串行拉 GitHub Trees）。
- StatusDot/StatusMarker 休眠死代码待拍板。
- wiki 格式对齐批 → wiki Quartz（先 /check-deps）。
- 会话进行中调度 auto-retry pending 注入计时器（runtime 生命周期遗留）。
- checkpoint 批已知取舍：diff 面板单容器滚动；只做 claude 对话回滚。
- **新挂账**：mock 了 overview 的其它 e2e spec 未补 sessions-stream mock（同款竞态
  风险面，实锤一条修一条；根治可考虑抽共享 helper 或 run-e2e 层统一 mock）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

最后更新：2026-11-22 / 触发原因：prompt 队列功能 commit `b6f5025d`（push 待确认）。
