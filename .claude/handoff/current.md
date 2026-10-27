# 当前状态(current.md — 滚动更新)

> 最后更新:2026-10-27(Codex 一等 provider 批次 2 前端完成:adapter/面板/新建入口落地,
> commit `ed3278d`,四门禁 + e2e 2/2 + 四 reviewer 报告消化;待交真机清单)

## 一句话状态

**Codex 一等 provider 批次 2(前端)已完成并提交(`ed3278d`):`codex-adapter.ts`(applyCodexFrame 单帧 + applyCodexFrames 批量折加 O(N) + Pass 2 投影 + useCodexSession)+ CodexSessionDetailRoute(面板 + Model/Reasoning/Permission 三选择器 + configPending 圆点 cue + 审批金框复用 claude 渲染层)+ 新建入口接线(桌面菜单 + 移动 sheet,行序/中性档 tile 对齐原型)+ e2e codex-session 2/2 + 单测 968 pass(含 17 个 adapter 测试);四 reviewer(perf/design/code/security)报告全部消化。批次剩余:真机清单交用户验收;P1 parity(历史列表等)另立计划。**

## 本 session 焦点

### 关键决策(不可丢)

批次 1 决策(仍有效,详见 snapshots/20261027-1821.md):一等 provider 形态(app-server 进程/会话,零新依赖)、Route A 独立 codex_* 帧族、codex-generated 不入库(fixtures 是真证据)、history 能力位仍 unsupported、恢复抓手 hasRecoveryHandle 单源、权限值域三层、单飞 turn。

批次 2 新决策:

- **审批 UX = tool card 金框复用 claude 渲染层**:codex_approval_request 的 itemId → tool stub 写 controlRequestId → Pass 2 透传 metadata.custom → makeToolRenderer needsPermission 金框 + Allow/Deny → bridge respondToControlRequest 发 `{type:"respond",decision:"accept"|"decline"}`。不做 composer 托盘;全局 ApprovalCenter 兜底(batch 1 已接)。
- **reasoning 只渲染 summary**(content 可能加密);assistant 文本与思考是不同 item id 各自独立气泡;ended 帧负责定格(final + interrupted + 清残留金框);serverRequest/resolved 按 `codex:<requestId>` 清金框。
- **Pass 1 性能形态(review 后定型)**:可变内核 `applyCodexFrameInPlace`(就地 mutate 工作副本、返回 boolean)+ 单帧 `applyCodexFrame`(复制一次进内核、无变化返回原引用保 React bail-out)+ 批量 `applyCodexFrames`(一次复制逐帧折加);hook 拆 `handleFrameScalars`(标量逐帧)+ `processBatch`(raw 整批一次 setState)——history 回放 N 帧从 O(N²) 复制降为 O(N)。deep-freeze 单测钉死 prev 不可变契约。
- **面板路由诚实形态**:`provider==="codex" && codexThreadId` 才进 CodexPanel;存量 tmux codex(无 threadId)走 AgentTerminalPanel。
- **configPending 呈现 = trigger 上 warning 圆点 + title**(布局 cue),不用行内文字标签(ui-layout-explains-not-text);turn/started 清除。
- **行序/用色对齐新建实例原型**:Claude→OMP→Codex→终端(Codex 行 tile 用中性档 `bg-ink-2/10 text-ink-2`,不吃 Pi 行 tint-purple 专色、不借 Claude 品牌 amber);en 权限 label 与 claude 对齐用 "Permission"。
- **空 resultText 也转发 result**(`...(done ? {result} : {})`):共享投影层按 `result != null` 推 status,条件丢弃空 result 会让 imageView/静默命令完成后永久 spinner。

### 进度

- ✅ 批次 1(服务端,`f5c8878`):探针 + codex-runtime/codex-stream + shared 帧族 + 注册表/审批/路由接线,WS 探针 14 PASS + 1 SKIP。
- ✅ 批次 2(前端,`ed3278d`):codex-adapter.ts(帧状态机 + hook,~1100 行)+ CodexSessionDetailRoute.tsx(面板 + 三选择器 + 最小 bridge)+ client/i18n/instance-panel/instance-area/mobile-sheets 接线 + 17 个 adapter 单测 + e2e `codex-session.spec.ts` 2/2(桌面渲染+审批+发送闭环 / 移动创建入口)。
- ✅ 四 reviewer 消化:perf P1(O(N²) 批量折加)+P2(倒序扫)已修,composer memo 不修(ACP 同构继承);design P1(tile 用色)+P2(行序/pending 圆点/en 用词)已修,触发器双语言不修(继承债);code P1(空 result spinner)+P2(append final 守卫/重复注释/不可变契约测试)已修,ended spinner 并存不修(共享管道既有面);security 零发现。
- ⏸ **待办:批次 2 真机清单交用户验收**(见下)。
- ⏸ P1 parity 未开始(另立计划):历史列表(`codex-history.ts` 扫 rollout JSONL,镜像 omp-history.ts)、MCP 注入验证、凭据设置、图片输入、usage 透传、requestUserInput 会话内选项卡、增量回放锚。

### 待办:批次 2 真机清单(交用户,test 项目)

1. 新建 Codex 会话(桌面 ⋯ 菜单 + 移动 sheet 各一次)→ 流式输出(含 reasoning 折叠)。
2. 工具卡:Bash/fileChange/mcp 卡形态;中断(STOP)后卡片标 interrupted。
3. 审批:readonly/default 档触发命令审批 → 会话内金框 Allow/Deny + 全局中心双路应答。
4. 切模型/effort/权限档 → trigger 圆点(下轮生效)→ 下一轮 turn 应用后圆点消失。
5. API 重启 → thread/resume 历史恢复(resume:false live 回放 + isRunning 恢复)。
6. 移动端 composer(键盘避让/Enter 发送/草稿)。

### 不修项(reviewer 已裁决)

security P2-2(respond 不校验登记,batch 1 裁决沿用)、code P2(ended 中断卡 spinner 与提示并存——共享投影层既有面,统一治理时再收)、design P2(composer 触发器双语言——与 ACP 一起收敛到 03a SelectorTrigger 单源)、perf P2(composer 未 memo——ACP 同构,批次化处理)、batch 1 不修项照旧。

### 易丢的关键上下文

- **codex 账号 429 限流**:真机验收时若仍限流,真实 LLM 响应出不来(链路本身正常);`probe-codex-ws.mjs` 内容断言的 SKIP 分支待限流解除后重跑。
- **e2e mock 面**:overview 缺 mock 会被 stale-tab prune 删 focus tab(三路 REST mock:detail/list/overview,缺一不可);agent session id 须带 "agent_" 前缀;e2e 默认 locale en。
- **Write 工具大 payload 损坏病理(本环境)**:Write 大内容会被截断/插占位符(本批 e2e spec 连续 4 次)——对策 = 短 Write 骨架 + 中等 payload Edit 分块追加;Edit 也偶发 typo(new_string 写错字符),写入后靠 typecheck/test 兜底。
- **测试内存**:`systemd-run --scope --user -p MemoryMax=2G bun test …`(cgroup);**不要用 `ulimit -v`**。
- **探针一律 bun 跑**;commit 尾行 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`,标准 `git add && git commit`;编辑文件一律内置 Read/Edit/Write。
- **既有待办不变**:镜像瘦身批真机遗留(pi chat 运行面、/p/ 管线);推 tag 待用户发布时单独确认;IDB 批真机 5 项;React #310;批 16/17/18 真机复验;e2e 基线;M2.0 多卡焦点互抢。

---
最后更新:2026-10-27(触发原因:codex 批次 2 收尾——commit ed3278d + 四 reviewer 消化 + handoff save)

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
