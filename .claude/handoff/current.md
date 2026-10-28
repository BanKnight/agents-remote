# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-29 02:55（批次 E 已 commit `91d3531`，待真机验收）

## 一句话状态

**批次 E 完成（已 commit `91d3531`）：①压缩 UI 两端同构（入口 = 上下文占用浮层底部动作行；claude 发
`/compact` 文本、codex 发 `{type:"compact"}` 帧 → `thread/compact/start`，压缩以 turn 形态跑 →
流内 CompactBlock running/完成块）；②MCP 注入（`-c mcp_servers.ar-hub.url=…`，chat 直拉与
terminal tmux 双形态同源）；③P2 四项（turn/steer 并入在飞轮 + 失败回退排队、错误/重连 notice、
model reroute / authRecovery 提示、account/rateLimits 防御式额度段）。**

## 本 session 焦点

### 关键决策（不可丢）

- **压缩入口放上下文占用浮层底部**（用户拍板）：`ContextUsageIndicator` 加可选
  `onCompact`/`compactDisabled`，缺省不渲染动作行（其余调用点零改动）。**渲染门 =
  `usage || account || onCompact`**（design L2-6：codex 首轮前无 tokenUsage，额度与压缩入口
  不该被藏；无 usage 时 trigger 只出环、不编造 0%）。
- **codex 压缩以 turn 形态跑**（探针 E2 实证）：`thread/compact/start {threadId}` → `{}`，
  随后 turn/started → item/started|completed `contextCompaction` → turn/completed；弃用通知
  `thread/compacted` 不再发。**busy 拒绝**（在飞 turn 时压缩未验证，先拒），闸 30s 兜底复位
  （RPC 回 ok 但线程不发 turn/started 时不永久占死单飞闸）。
- **压缩失败豁免自动重试**：item/started 的 contextCompaction 记 `compactingTurnId`，
  该 turn 的 failed 不触发 autoRetry。
- **manual 标记机制**：hook 层 `manualCompactRef`（15s TTL）→ `consumeManualCompact(batch)`
  只在批内真有 `item/started + contextCompaction` 时消费并返回 `{manualCompact:true}`，在
  setRawMessages updater **外**调用（updater 须纯）；回放无 ref → auto 诚实降级。
  **completed 帧不得覆盖 manual**（ref 已在 started 帧消费）——upsertCompact 用 `item.manual || manual`。
- **运行中发消息 = turn/steer 并入当前轮**（用户拍板）：`write()` 同步签名不变，在飞时
  `void steerOrQueue()`；steer RPC 失败（轮恰好收口）回退 enqueue + flushQueue。
- **额度防御式**：`account/rateLimits/read` + `account/usage/read` 仅 ChatGPT 登录可用
  （apiKey/网关登录报 `chatgpt authentication required`）→ 失败静默、config 帧无 `account`、
  前端额度段整体隐藏。`account/rateLimits/updated` 通知 params 自带快照 → 直取不打 RPC
  （perf P2-2）；在飞合并；lifetime 已采到就不重复拉 usage/read。
- **notice 管道**：`error`（willRetry→ 固定 id `retry` 单条覆盖演进，恢复流量/ended 移除；
  终态→ `error-final` 留存，文案带「错误：」前缀 + 原文）、`model/rerouted`（宽进提取，无 to
  不渲染）、`modelProvider/authRecoveryStarted`（started 出提示，**completed = 移除**——瞬态
  状态不留永久回放内容）。语义对象进 `systemMessageType:"codex-notice"`，渲染层 i18n 组装
  （重连解析 n/m，解析失败才落原文；重连 pill `role="status"`）。
- **MCP 注入串**：`-c` + `mcp_servers.ar-hub.url="http://127.0.0.1:<port>/mcp/<encodeURIComponent(project)>"`
  （0.163 不认 `type` 键，值必须带引号）。chat 形态 argv 数组直接拼；terminal 形态整条命令
  逐项 `shellQuote`（**曾误加内层 `.map(shellQuote)` → 双重转义，已修**）。
- **设计标尺落点**：重连档 `text-warning-text`（裸 text-warning 浅色 1.91:1）；额度窗口名按
  `windowDurationMins` 派生（不写死 5h/周）；resetsAt 24h 制 + 周窗口带日期；额度分区用
  `border-sep-strong`；压缩按钮 `disabled:opacity-50 disabled:cursor-default`。

### 进度（批次 E 全落地，已 commit `91d3531`）

- ✅ 服务端：`codex-runtime.ts`（compact/mcpArgs/steerOrQueue/refreshAccount/豁免/直取快照/
  闸兜底）、`codex-stream.ts`（compact 帧 → error 回执）、`mcp-injector.ts`
  （`CodexMcpInjector`）、`agent-provider-profiles.ts`（codex mcpInject → native）、
  `agent-tui.ts`（terminal 形态 `-c` 注入）、`index.ts`（`config.mcpPort`）、shared 类型。
- ✅ 前端：`codex-adapter.ts`（compact/notice 条目 + 投影 + manualConsume + compact sender）、
  `compact-block.tsx`（running pill + 明细）、`composer-controls.tsx`（额度段 + 压缩动作行 +
  窗口名派生 + disabled 态）、两路由接线、i18n zh/en。
- ✅ 测试：`codex-runtime.test.ts`（含额度通知直取）、`mcp-injector.test.ts`、
  `agent-tui.test.ts`（terminal 命令含 `-c`）、`codex-adapter.test.ts`、e2e
  `codex-session.spec.ts` 4/4（含浮层额度 + 压缩动作驱动流）。
- ✅ 门禁：format / lint(0 warning) / typecheck / api 1203 pass / web 1005 pass / shared 11 /
  CSS 硬闸 / tokens 机检（仅 2 处既有 debug HEX）/ codex e2e 4/4。
- ✅ reviewer：perf（无 P0/P1；P2 已修 2 条，removeNotice delta 扫描留观）、design（L1 + L2
  全修；L3 部分收：error 浅色 3.10 对比与 `.btn.ghost` 语义属设计包欠账，登记留观）。

### 阻塞 / 风险

- 无阻塞。**留观**：①`reroute`/`authRecovery` 真机无样本（帧不来不渲染）；②额度段在
  ChatGPT 登录真机上未验；③steer 带图未特判（按原样透传）；④`removeNotice` 在 delta 路径
  的 O(n) 扫描（实测 <10% 帧成本，未优化）；⑤设计包 `dangerText` token 缺口、`.btn.ghost`
  语义偏「取消」。

### 易丢的关键上下文

- **本批已 commit `91d3531`**（26 文件；含 `scripts/probe-codex-batch-e.mjs` 与
  `scripts/fixtures/codex-batch-e/` 四场景脱敏帧）。
- 批 D 之前已 commit：`0168f0a` / `8823bf5`。
- 测试内存 ≤2G（systemd-run）；探针用 bun；编辑内置工具；e2e `bun scripts/run-e2e.ts <spec>`。

## 下一步

1. ~~commit 批 E~~ → ✅ `91d3531`。
2. **真机验收（批 D+E 一起交）**：见下清单。
3. **批 F**：codex 历史列表（扫 `~/.codex/sessions/**/rollout-*.jsonl` + resume 分流）。

## 真机验收清单（批 D + 批 E）

1. codex 会话上下文环点开 → 浮层底部「压缩上下文」→ 流内出现「压缩中」pill → 完成变
   「Context compacted」块（手动标记）。
2. 运行中点发送 → 消息并入当前轮（不新开轮、不被丢弃）；停止后排队消息正常开新轮。
3. 断网/坏 key 触发上游错误 → 流内出现「重连中（n/m）…」pill，恢复即消失；超过重试上限
   → 「错误：…」留存。
4. ChatGPT 登录账号 → 浮层出现套餐/窗口用量/累计用量（apiKey/网关登录应恒不显示）。
5. codex 会话「切到终端」→ tmux 内 `codex resume` 带 ar-hub MCP（agent 能看到 ar-hub 工具）。
6. claude 会话同一浮层也有「压缩上下文」，点后走 `/compact`。
