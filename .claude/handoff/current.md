# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-15（**双模式批（GUI 对话 ↔ TUI 终端）** 实现完毕、全门禁绿、探针 24/24；前批 5 态化 `9d5421f` + 命名/计数回调批 `541099c`）

## 一句话状态

双模式批实现全部落地：同一 claude 会话（同 claudeSessionId / runtimeKey）在 **chat（headless stream-json）↔ terminal（tmux 交互式 CLI）** 两形态间接力，JSONL 唯一权威；切换严格 idle-only；TUI 状态靠 hooks 写状态文件旁路（关键三态）；审批/自动重试在 TUI 让位。门禁全绿（api 950 / shared 10 / web 803）、`probe-session-mode` 18/18、`probe-agent-tui-hydrate` 6/6（含真实 API 重启验证）。**subagent reviewer 面全挂（API unexpected EOF 连续 5 次），改自审 + fork 自审兜底**；**待提交 + 待真机验收**。

## 本 session 焦点

### 关键决策（不可丢）

- **TUI = CLI 原生形态，纯 argv、零 env 注入**（用户两次拍板）：参数全来自会话 metadata，凭证走 CLI 自身配置；**不注入 preset env**。唯一保留一次查表（非 env）：model 别名 → 规范名（`buildAvailableAliases().resolved`，消 CLI 自身别名表的网关 422 面）。多 preset 凭证边界（TUI 用机器默认而非会话 preset）已记 spec §4.7。
- **spawn 形态判定 = JSONL 存在性**（CLI 2.1.299 实测）：`--session-id <uuid>` 全新 id 专用（已存在报错）、`--resume <id>` 对不存在 id 硬失败 → `existsSync(claudeJsonlPath(...))` 定 `--resume` / `--session-id`。创建即钉 claudeSessionId（`createAgentSession` 生成 uuid），故新会话出生即可切 TUI。
- **审批让位零代码**：TUI argv 不带 `--permission-prompt-tool stdio` → 无 can_use_tool 帧 → 审批中心天然收不到。
- **TUI 状态三态（hooks 旁路）**：`--settings <file>`（runDir 下 0600）挂 UserPromptSubmit→`user_input`、Stop→`turn_done`、Notification→`approval`，hook 纯 shell `printf %s token > 状态文件`；api `fs.watch` 该文件 → 复用 `nextAgentSessionStatus` + `setAgentSessionStatus`。信号表 `TUI_STATUS_SIGNAL_BY_TOKEN`（未知 token 无信号）。**error 态 hooks 覆盖不到 = 接受的取舍**（用户「关键几个对上就行」）。
- **切换门槛严格 idle-only**：working/blocked → 409 `SESSION_STATE_CONFLICT`（绝不丢 turn）；同 mode 幂等短路（路由 + 编排器双层）。
- **runtime 分发按 mode**：`runtime.exists/close` 的 claude 名分支查 `getAgentModeByRuntimeKey` → terminal 走 tmuxRuntime（headless 已让位）；close 路径 `claudeRuntime.close(silent)` + `agentTui.teardownTerminal` + `tmuxRuntime.close`。
- **`close(sessionName, { silent: true })`**：不广播 closed、不走审批 settled 回调（会话没关只是换形态），kill/processes.delete/autoRetry.destroySession/relay 清理照旧。
- **双写 JSONL 防线**：claude-stream `open()` + `injectUserPrompt()` 双守卫（terminal 形态拒绝，error code `SESSION_STATE_CONFLICT` / reason `terminal_mode`）。
- **hydrate（API 重启恢复）**：tmux pane 独立于 API 存活、但 fs.watch 随进程消失 → `startApi` 装配后 `await agentTui.hydrate(await registry.listTerminalModeSessions())`（纯读访问器，不调 keepIfRuntimeExists）；状态文件在才挂；基线 `spawnInitialStatus(status)`（parseMetadata 已把 TUI 期 working/blocked 归一 idle）。**失败非致命**（try/catch + console.error，不拖垮 API 启动）。
- **起 pane 失败回滚**：`startCommand` 抛错 → `teardownTerminal` 清掉刚写的 settings/状态文件，形态保持 chat（不留「有 hooks 文件却无 pane 无 watcher」半态）。

### 进度

- ✅ 实现：`api/src/agent-tui.ts`（新）+ `claude-runtime.ts`（buildTuiSpawnArgs/resolveTuiSpawn/close silent/spawn 形态判定）+ `claude-stream.ts`（双守卫）+ `index.ts`（runtime 分发 + 装配 + hydrate）+ `session-registry.ts`（mode 字段/setAgentSessionMode/getAgentModeByRuntimeKey/listTerminalModeSessions/钉 claudeSessionId）+ `session-routes.ts`（POST `/mode`）+ shared 类型 + web（AgentPanelRouter 分流 + 双端 ⋯ 菜单项 + useSessionModeSwitch + i18n + spec §4.7/§8）
- ✅ 测试：`agent-tui.test.ts` 9 条、`claude-runtime.test.ts`（buildTuiSpawnArgs ×2 + close silent + **resolveTuiSpawn 真实 JSONL 判定**）、`session-registry.test.ts` 3 条、`session-routes.test.ts` 3 条守卫
- ✅ 探针：`probe-session-mode.mjs` 18/18（含新断言「pane 内 CLI 真起来」——实测捕获到真实 CLI TUI 状态行 `1 agent / Sonnet 5 / master / test`，证 argv 全链被 CLI 接受）、`probe-agent-tui-hydrate.mjs` 6/6（**会重启 ar-dev api**，勿在他人使用中跑）
- ✅ 门禁：format/lint/typecheck 0 warning、全量单测 0 fail、`ar-verify-css.mjs` + `ar-verify-tokens.mjs` 通过
- ✅ **UI e2e**：新增 `e2e/session-mode.spec.ts` 2 条（本批入口原本无 e2e 覆盖）——chat 形态 ⋯ 显示「在终端打开」+ 点击发 `POST /mode` + 面板换 xterm + keepOpen 项就地翻转「回到对话」；terminal 形态直接进入渲染终端面板 + 点「回到对话」切回 ChatPanel。跑法 `bun run scripts/run-e2e.ts session-mode.spec.ts`（透传 spec 路径）。含新 spec 的全量 e2e：既有 27 条全绿（对拍新 api 代码）+ 新 2 条 2/2。
- ⏳ **待提交**（本批自审完毕，见下「阻塞」——reviewer 面不可用）
- ⏳ **真机清单（交用户）**：GUI 发一轮 → ⋯ 在终端打开 → xterm 出现且是同一会话（历史在）→ TUI 里跑一轮（状态点 working→done）→ ⋯ 回到对话 → GUI 气泡含 TUI 轮次 → TUI 内触发审批（CLI 自己弹，web 无卡）
- ⏳ 前两批真机清单（5 态化批 + 上下文占用三批合并）仍未验收

### 阻塞 / 风险

- **subagent API 面故障**：code-reviewer / design-reviewer / 后续重试全部 `API Error: unexpected EOF`（连续 5 次，含 resume 与全新 spawn）→ 本批审查由**主 agent 自审 + fork 自审**替代。**下个 session 若 API 恢复，建议补跑 code-reviewer + design-reviewer 复核本批**。
- **TUI 凭证边界**：tmux pane 继承 tmux server 的环境（本仓 startCommand 不传 env）——若机器默认环境无 ANTHROPIC_* 凭证，TUI 内 CLI 可能未认证。用户已拍板「凭证走 CLI 自身配置」，真机清单第一条即可暴露。
- pane 内 `/exit`：tmux session 结束 → attach onExit → 前端 ended；metadata 保留 `mode=terminal`（会话仍可 `--resume`），入口仍可「回到对话」（idle-only 门槛内）。

## 易丢的关键上下文

- **`--effort` 是真实 CLI flag**（2.1.299 `claude --help` 实证），与 headless 的 env 路径（`CLAUDE_CODE_EFFORT_LEVEL`）不同——TUI 走 argv 是刻意（零 env 决策），勿改回 env。
- **`--permission-mode` 合法取值**：acceptEdits / auto / bypassPermissions / manual / dontAsk / plan（白名单 `agent-provider-profiles.ts`，启动时 `claude --help` 解析预热）。
- **`listTerminalModeSessions` 纯读**：绝不能改成 keepIfRuntimeExists（有 removeMetadata 破坏性副作用）。
- **`getAgentModeByRuntimeKey` 是 O(n) 内存扫描**（exists/close 路径）；n≈数十，未做索引缓存，若将来会话数暴涨再考虑。
- **TUI 状态文件路径** `runDir/agent-status/<runtimeKey>`、settings `runDir/agent-settings/<runtimeKey>.json`（0600，随形态切换/会话关闭清理）。
- **探针纪律**（沿用）：`systemd-run --scope --user -p MemoryMax=2G bun scripts/X.mjs`；验证用 PROJECTS_ROOT/test；会话清理 = `POST /api/projects/<p>/agent-sessions/<id>/close`。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-15（双模式批实现完毕：门禁全绿 + 探针 24/24 + 自审兜底）
