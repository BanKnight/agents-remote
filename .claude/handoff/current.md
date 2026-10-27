# 当前状态(current.md — 滚动更新)

> 最后更新:2026-10-27(Codex 一等 provider 批次 1——服务端闭环完成:四门禁全绿 + WS 探针
> 14 PASS/1 SKIP + reviewer 清单消化;批次 2 前端未开始)

## 一句话状态

**Codex 走 `codex app-server`(JSON-RPC over stdio JSONL)直连,批次 1 服务端闭环已落地:协议事实探针 + 生成绑定对照 + `codex-runtime`/`codex-stream` + shared 帧族 + 注册表/审批/路由接线;四门禁全绿(api 1162 + shared 11 + web 951),WS 级探针 14 PASS + 1 SKIP(账号 429 限流);reviewer(security/code/perf)清单已消化。批次 2 前端(adapter/面板/新建入口)与 P1 parity 未开始。**

## 本 session 焦点

### 关键决策(不可丢)

- **一等 provider 形态**:每会话一个 `codex app-server` 进程(argv 数组直拉、非 tmux),「进程内存活 = 会话存活」与 AcpRuntime 不变量同构;不做共享 daemon。**零新依赖**。
- **Route A 沿用**:独立 `codex_*` 帧族不翻译成 claude 帧族;前端不接触 raw app-server method;client message 白名单封闭。
- **`api/src/codex-generated/` 不入库**(747 文件 ~3.1MB、全仓零 import,仅对照用)→ `.gitignore` + oxlint/oxfmt ignorePatterns 保留(本机跑门禁用);生成命令记在 `codex-runtime.ts` 头注释,升级 codex 时重跑。协议**真证据**是 `scripts/fixtures/codex-appserver/*.jsonl`(0.163.0 真机帧,入库)。
- **`history` 能力位对 codex 仍 `unsupported`**:会话内 `thread/resume` 回放已通,但历史**列表**(rollout JSONL 扫描)属 P1——能力位描述列表,不提前翻转(诚实形态标记)。
- **create 响应带 codexThreadId**:`setCodexThreadId` 是 fire-and-forget(runtime 回调 `void`),create 返回前读回**内存索引**权威态(patchMetadata 先同步 index.set 再落盘)。**不能用 `getAgentMetadata`**——它带 keepIfRuntimeExists 探活,会把「此刻 index 条目」写进存活快照 TTL 缓存,之后创建的会话在该窗口被 alive 过滤误判为死(本次两个单测失败的真根因;测试用固定时钟使缓存永不过期才暴露)。
- **恢复抓手判定单源**:`SessionRegistry.hasRecoveryHandle()`(claude+claudeSessionId / omp+acpSessionId / codex+codexThreadId)由 `listAllShells` 与 `keepIfRuntimeExists` 共用——此前两处各写一份,codex 分支漏了壳流那份(API 重启后 codex 会话会从 /api/sessions/stream 消失),已收口 + 补测试断言。
- **权限值域三层**:权限模式词(readonly/default/auto/full)↔ AskForApproval(untrusted/on-request/never)↔ sandbox;`CODEX_PERMISSION_PRESETS` 正向单源,`policyPairToPermissionMode` 反向。配置热切换 = 存 pending、下一个 turn/start 应用(UI 标「下轮生效」)。
- **单飞 turn**:server 不拒绝并发 turn/start → 本层单飞 + 队列 cap 32 + `startingTurn` 同步置位 + `turnGeneration` 代际守卫(RPC 往返窗口)。

### 进度

- ✅ 协议事实:`scripts/probe-codex-appserver.mjs`(直连 app-server 录 9 类场景 fixtures:initialize/thread/start→turn 全周期/requestApproval 往返/resume+read/model/list/并发 turn/配置热切换)。
- ✅ `api/src/codex-runtime.ts`:ensureRunning 单飞 + resume 覆盖参数透传 + readLoop 分片累积 + 审批分族回复(permissions/requestUserInput/elicitation/legacy/未知)+ env 白名单 + 错误路径回滚 + 队列 echo 序。
- ✅ `api/src/codex-stream.ts` + `index.ts` 接线 + `session-registry`(codexThreadId/setCodexThreadId/getCodexThreadIdByRuntimeKey/keep 分支/resumed 判定)+ `session-routes` codexThreadId UUID 形状校验 + `approval-center`/`approval-registry` provider 化。
- ✅ 单测:`codex-runtime.test.ts`(fake app-server NDJSON 全生命周期/审批/resume 透传/排队/权限翻译)、`codex-stream.test.ts`、approval 双 provider、keep/hasRecoveryHandle。
- ✅ `scripts/probe-codex-ws.mjs`(WS 级):create→threadId 回填→open 帧序→user→echo/turn/ended→interrupt→杀 app-server→重开 thread/resume history 回放→close。**14 PASS + 1 SKIP**(429 限流,内容断言降级)。
- ⏸ 批次 2(前端)未开始;P1 parity 未开始(历史列表/MCP 注入验证/凭据/图片/usage/requestUserInput 选项卡/增量回放锚)。

### 待办

- **批次 1 交付报告给用户**(含真机清单)后开工批次 2:`web/src/routes/codex-adapter.ts` + `CodexSessionDetailRoute.tsx` + 面板路由/新建菜单(桌面 + mobile sheet)/i18n + e2e(`codex-session.spec.ts`)+ UI 探针 + CSS 硬闸 + tokens 机检。
- **不修项(已在 reviewer 消化时判定)**:security P2-2(respond 不校验登记——会话内主路径 + runtimeKey 绑定已防跨会话)、code P2-15(getCodexThreadIdByRuntimeKey O(n),调用量低)、perf P1-2/P2-2(增量回放锚 / history 无上限——既有设计,留 P1)、claude/acp spawn env 同病(影响面大需单独批)、codex-stream WS 无鉴权(全家族既有形态,acp-stream 同款,交用户裁决)。
- **既有待办不变**:镜像瘦身批真机遗留(pi chat 运行面、/p/ 管线);推 tag 待用户发布时单独确认;IDB 批真机 5 项;React #310;批 16/17/18 真机复验;e2e 基线;M2.0 多卡焦点互抢。

### 易丢的关键上下文

- **codex 账号当前 429 限流**:真实 LLM 内容断言走 SKIP 分支(`probe-codex-ws.mjs` 的 `skip()`),链路断言照常;限流解除后重跑一次可补内容级断言。
- **WS 探针两个坑(已在脚本内注释)**:① gzip 批解压异步 → `onmessage` 必须挂 promise 链串行,否则 history_end marker 先于批解压到达、行被丢;② WS close 只断订阅(进程存活期重连 = relay live 回放 resume:false),要验 thread/resume 必须先杀 app-server 进程(用 /proc cwd+cmdline 校验归属,**不用 POST /close**——closeMetadata 会连 metadata 一起删)。
- **测试内存**:`systemd-run --scope --user -p MemoryMax=2G bun test …`(cgroup);**不要用 `ulimit -v`**(伤 bun JIT,本机 CPU 无 AVX 会 SIGILL 随机崩、fail 面漂移)。
- **探针一律 bun 跑**,别用 node。
- commit 尾行 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`,标准 `git add && git commit`;编辑文件一律内置 Read/Edit/Write。

---
最后更新:2026-10-27(触发原因:codex 批次 1 收尾——门禁全绿 + 探针通过 + handoff save)

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
