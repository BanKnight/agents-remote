# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-20（**claude CLI 升级 2.1.299 → 2.1.325 已 commit（`3e745749`），
> 未推送（push 待用户确认）；全门禁 + golden path + e2e 42/42 全绿**）

## 一句话状态

`@anthropic-ai/claude-code` 升级到 2.1.325（供应链合规最高版：2026-11-13 发布恰 7 天；
latest 2.1.328 仅 2 天不合规）。Code Mode（2.1.323 实验功能）**拍板不接入**——官方四条
硬约束（仅交互终端 / 仅直连 API / 仅 native build / 需 feature flags）全部排除本项目
headless spawn 形态，CLI 服务端校验不可绕；等上游支持 stream-json host / 网关后再评估。
顺带修复 acp-session.spec 的 sessions-stream mock 缺口（全量 e2e flaky 真根因）。

## 本 session 焦点

### 本批：CLI 依赖升级（2026-11-20，commit `3e745749`）

- **改动面**：package.json 版本行 + bun.lock（主包 + 10 平台二进制版本与 sha）+
  `e2e/acp-session.spec.ts` 补 mock——零代码改动预期达成（runtime argv/env/解析全不动）。
- **升级对照验证**（改后立刻）：`claude --version`=2.1.325；permission-mode choices
  与 2.1.299 基线逐字一致（`acceptEdits/auto/bypassPermissions/manual/dontAsk/plan`，
  agent-provider-profiles 解析面零漂移）；`--resume-session-at`（**未文档化 flag，不在
  --help**，checkpoint 批依赖）参数层验证在位（报「requires --resume」非 unknown option）。
- **golden path 7/7**（一次性脚本 `/tmp/gp-claude-325.mjs`，未入库）：test 项目真实
  spawn → WS 帧流非空 → session_init 握手 → `mcp__ar-hub__capability_list` 真实调用
  （注入+协商+调用全链）→ assistant 回复含全部六域名 → result success →
  claudeSessionId 回填。api 日志佐证 2.1.325 新形态正常（`autoCompactThreshold:197000`、
  ToolSearch、`mcp_instructions_delta` attachments）。
- **e2e 41/42 → 42/42**：首轮唯一失败 = `acp-session.spec.ts`（omp provider，WS 全
  mock，不 spawn CLI）卡 "Connecting"。定性非本批引入：该 spec 漏 mock
  `/api/sessions/stream`，全量并发下真实后端帧竞态覆盖 `["overview"]` 缓存 → mock tab
  被 stale-prune → AcpPanel 不挂——正是 verification.md「探针 mock 完备性」（2026-11-07）
  记录的同族假 FAIL 的漏网之鱼（**全仓 e2e 此前零 spec mock 该流**）。修复 =
  `routeSessionsStream` helper（`{type:"sessions", sessions}` 与 REST overview 同源帧，
  连接即推全量、对齐真实服务端语义）+ 两用例各一条调用。单跑复验绿且提速（16.7s→11.5s）。
- **MCP tasks / 协议协商判定**（用户问询确认）：CLI 默认协商 2026-07-28 是 2.1.292 起
  的既有行为（2.1.299 已在用），ar-hub SDK 1.32.1 server 侧回 2025-11-25（
  `server/index.js:263` fallback），协商语义兼容零影响；MCP tasks（2.1.319）仅当 server
  capabilities 声明 tasks 才启用，ar-hub 不声明 → 永不触发；MCP v1 client 移除
  （2.1.323）不涉及 2025 世代 SDK。

### 进度

- ✅ 全门禁：format:check / lint 0 warning / typecheck / 全量单测（api 1389 + shared 16
  + web 1088，0 fail）/ e2e 42/42（4G）/ golden path 7 断言
- ✅ commit `3e745749`（pre-commit 全门禁过）
- ⏳ **push 待用户确认**
- ✅ handoff 归档 `snapshots/20261120-0604.md`

### 易丢的关键上下文

- `--resume-session-at` 是未文档化 flag——`claude --help` 里没有，验证存在性用
  `claude --print --resume-session-at <nil-uuid>`（应报「requires --resume」而非
  unknown option）。checkpoint fork 回滚管线依赖它 + `--fork-session`。
- 下次升 CLI 的对照基线（2.1.325）：permission-mode choices =
  `acceptEdits/auto/bypassPermissions/manual/dontAsk/plan`（help 里无 "default"）。
- **升 CLI 的回归验证配方**（本批沉淀）：①版本+choices 对照 ②参数层 flag 验证
  ③全量单测 ④golden path（真实 spawn + ar-hub capability_list 调用，一轮对话全链）
  ⑤e2e 全量。golden path 脚本模式可从本批 commit 的 git show 恢复（/tmp 会丢）。
- e2e 的 sessions-stream mock：`routeWebSocket(/\/api\/sessions\/stream$/, (ws) =>
  ws.send(JSON.stringify({type:"sessions", sessions: [...]})))`——SessionShell =
  `Omit<OverviewCandidate,"subtitle">`，与 overview mock 的 candidate 同款形状；
  连接即推（对齐服务端「连上立即推全量」）。**其它 mock 了 overview 的 spec 同样裸露
  在此竞态下，出现同款 "Connecting" flaky 照此补**（规则已在 verification.md，本批
  只修了实锤复现的 acp-session）。
- web 侧 WS URL 单源 `sessionsStreamUrl()`（`web/src/api/client.ts:1396`）。
- 供应链合规版本核算方法：`npm view @anthropic-ai/claude-code time --json` 取发布日，
  ≥7 天的最高版本；dist-tags 有 latest/stable/next 三轨（stable=2.1.311 旧线）。

### 下一步

1. push 待用户确认（`6d91f024..3e745749` 1 commit）。
2. 真机回归（可选，golden path 已覆盖 spawn 面）：浏览器开 claude 会话跑一轮 +
   MCP 卡片渲染 + checkpoint 回滚各一次。

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

最后更新：2026-11-20 / 触发原因：CLI 2.1.325 升级批 commit `3e745749`（push 待确认）。
