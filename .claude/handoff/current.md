# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-01（ar-hub admin capability 三批次全部交付）

## 一句话状态

**ar-hub admin capability（跨项目观察/管理 + 审批闸）三批次全部完成并 commit：
批次 1 观察三工具 + hub 基座（`6667d8f`）、批次 2 审批基建 + 管理 5 工具 + origin
身份注入 + CLI 超时（`2f93a58`）、批次 3 真实链路探针 10/10 + web 卡 e2e + spec
记档 + origin bug 修复（`d939f33`）。全门禁绿（api 1264 / shared 11 / web 1009）。**

## 本 session 焦点

### 关键决策（不可丢）

- **审批中心复用（admin 卡 = 第三种 transport）**：`ApprovalCenter.transports` 按
  provider 派发；admin 卡 `provider="mcp-admin"`、`controlRequestId` 前缀
  `mcp-admin:`、卡 sessionId/runtimeKey = 发起会话（origin 穿线）。web
  isHotTool 对 `MCP_ADMIN_MANAGE_TOOLS`（shared 单源 5 工具名）恒红。
- **origin 身份注入 = hub URL query**：`?origin=<ar 会话 id>`（parseProjectFromUrl
  零改动、旧 URL 兼容）。⚠️ 必须传 **ar 会话 id**（`sessionId`/`metadata.id`），
  不是 claudeSessionId——hub 端按 ar 会话 id 查 peekMetadata；批次 2 曾传错
  （claude-runtime spawnAndStart），批次 3 探针首轮实锤修复（`d939f33`）。
  codex/claude 穿线点共 4 处（claude spawnAndStart + resolveTuiSpread；
  codex doEnsureRunning + agent-tui terminal 形态）。
- **超时链（client > 审批窗）**：审批挂起 120s（MCP_ADMIN_APPROVAL_TIMEOUT_MS）<
  client 180s（claude inline JSON `toolTimeoutMs` / codex `-c tool_timeout_sec=180`）
  < hub Bun.serve idleTimeout 255s。改任何一个都要保序。
- **session_create 参数非法不弹卡**：provider 白名单校验前置到 requestManageApproval
  之前（审批卡是真实操作的授权闸，无效参数直接拒）。
- **管理面审批卡错误面**：`[ADMIN_ORIGIN_MISSING]` / `[ADMIN_APPROVAL_UNAVAILABLE]` /
  `[ADMIN_APPROVAL_DENIED]` / `[ADMIN_APPROVAL_TIMEOUT]` / `[SESSION_NOT_FOUND]`
  （`[CODE] message` isError 文本）。
- **sendToAgent 仅活会话**（与 REST 注入 D13 同语义）：claude injectUserPrompt /
  codex write / ACP write（按 transport 分流）/ terminal 明确错误；不复活已停会话。
- **能力开关**：项目 `.agents-remote/mcp.json` `capabilities.admin: true` 才注册
  8 工具（观察 3 免审批 + 管理 5 走审批）；无开关零变化。

### 进度

- ✅ 批次 1 `6667d8f`：McpCapability "admin" + session-reader（四 provider 读法 +
  14 测试）+ 观察 3 工具 + hub adminEnabled/idleTimeout/hub 下移
- ✅ 批次 2 `2f93a58`：shared MCP_ADMIN_PROVIDER/ApprovalSource/MCP_ADMIN_MANAGE_TOOLS
  + McpAdminApprovalService（挂起/应答/超时/dispose，7 测试）+ 管理 5 工具（14 测试，
  真实 hub 集成五分支）+ injector origin/超时（12 测试）+ sessionId 穿线 + web isHotTool
- ✅ 批次 3 `d939f33`：探针 probe-admin-approval.mjs 10/10（P1 claude allow 全链含
  origin 穿线实证 + P2 deny + P3 codex 双 -c 接受性）+ e2e admin-approval.spec.ts
  （web 卡渲染/恒红/应答形状）+ docs/specs/mcp-hub-admin/spec.md + specs 索引行 +
  claude-runtime origin bug 修复
- ✅ 全门禁绿：format/lint 0 warning/typecheck 三包/test 1264+11+1009 全 pass
  （pre-commit 首跑遇 1 例已知时序 flaky，复跑全绿）
- ✅ dev api 已 respawn 新代码（fork 探针期间验证 health 200）

### 阻塞 / 风险

- 无阻塞。**待用户拍板**：
  - ~~push~~：✅ 已推（2026-11-01 用户确认，`283b52f..aba98a7` 9 commits 上远端）。
  - `?? wiki/` 目录 git 归属（入库 vs gitignore）——非本批产物，未 add。
  - 留观旧项（from 前批）：真机验收清单 13（placeholder 文案）；探针 DELETE 自建
    terminal 会话 500（兜底分支穿透，修复选项待拍板）；test 项目残留 tmux 会话
    `ar-terminal-test-9f86d081-terminal_bf9` 归属不明。
- admin capability 真机端到端（真实浏览器点卡 + PWA push）未验——探针走 REST 应答，
  web 卡渲染/应答形状由 e2e mock 覆盖；真实「浏览器点允许」交用户真机清单。

## 下一步

1. 用户拍板：wiki/ 归属 / 旧留观三项。
2. （可选）真机体验 admin 全链：test 项目 mcp.json 加 `admin:true` → 起 claude 会话
   让它调 project_create → 浏览器审批中心点允许。
3. OPC 多 agent 编排下一阶段（跨项目维护能力已具备工具面基座）。

## 易丢的关键上下文

- admin 工具面代码落点：`api/src/mcp-admin-tools.ts`（注册）、`mcp-admin-approval.ts`
  （挂起服务）、`mcp-hub-server.ts`（origin 解析 + adminDeps 接线）、
  `index.ts:~2512`（服务装配）、`mcp-injector.ts`（origin/超时注入）、
  `session-reader.ts`（四读法）；web 只有 `use-approvals.ts` isHotTool 一处。
- spec 单源：`docs/specs/mcp-hub-admin/spec.md`（行为契约 + 来源 commit 锚）。
- 探针跑法：`bun scripts/probe-admin-approval.mjs`（需 dev api 43011 + hub 43013；
  自管 test 项目 mcp.json 备份恢复、只删自建数据）。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
