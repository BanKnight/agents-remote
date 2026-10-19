# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-19 17:05（TUI hooks 结构化采集 + 子 agent 信号过滤已推送 61ac98b..94e462e）

## 一句话状态

**TUI hooks 结构化采集（stdin JSON 落盘）+ 子 agent 信号过滤落地**：`3151b0b`（api + probe）。子 agent 的 StopFailure 带 agent_id 触发过主会话误报 error 红点 + push（deepwiki 源码实锤）；现在 hooks 写完整 stdin JSON，服务端按 `agent_id` 过滤子 agent 的错误/完成/继续（**审批保留**——CLI 真阻塞等人，用户拍板 2026-10-19），blocked push 带工具详情。真链路探针 22/22 + api 1005/1005 + e2e 3/3 全绿。

## 本 session 焦点

### 关键决策（不可丢）

- **子 agent 过滤范围（用户拍板）**：`agent_id` 存在（仅子 agent 上下文有此字段）时过滤错误/完成/继续信号；**审批信号（PermissionRequest/Notification）保留**——不推会话静默挂起。
- **hooks 采集 JSON 化**：七 hook 同一条 `cat > '<statusFilePath>'`（stdin 完整 JSON 落盘）；`parseTuiHookEvent` 主路径按 `hook_event_name` 映射信号（`TUI_SIGNAL_BY_EVENT`），**旧 token fallback 必须保留**（升级前 spawn 的长驻 TUI pane 仍写 token，pane 随生命周期消亡后可移除）。
- **chat 侧零改动**：headless stdout 的 `result` 帧只在主 turn 边界（子 agent body 带 parent_tool_use_id 但无 result 帧），无误报面；子 agent 审批走 approvalCenter 本就需人工。
- **review 防线**：状态文件读上限 1MB（PostToolUse 携带完整 tool_response，模型可控大小，超限整文件跳过 + warn）；statusPath/settingsPath 组合后单引号断言；push payload toolName 截断 40 字符；子 agent 过滤测试逐条写+间隔（防 fs.watch 覆盖假绿）。

### 进度（本 session 累计 11 commit）

- ✅ 壳/内容分离三 commit 已 push（04b4568..61ac98b）
- ✅ `3151b0b` TUI hooks 结构化采集 + 子 agent 信号过滤（5 files：agent-tui.ts/.test、index.ts、push-notifier.ts、probe-session-mode.mjs）
- ✅ **已推送** `61ac98b..94e462e main -> main`（3151b0b + 94e462e handoff）

### 待办

- **真机验收**：① 子 agent 运行中出错/完成不再触发主会话 error 红点与 push；② 主 turn 正常 done/error 照常通知；③ TUI blocked push 带工具名（「等待审批：Bash · …」）；④ 老会话（升级前 spawn 的 TUI pane）状态点仍正常（fallback）——**旧会话想让新能力立即生效 = 切一次模式**（chat→terminal），切换会重启 pane、丢 scrollback，对话内容经 --resume 保留
- **composer 哨兵观察**：等真机 `[inset-debug]` 数据 → 拆临时诊断件
- 历史挂起：推送通知跳转偶发失败（等第一手数据）；PWA 通知清单剩余项

## 易丢的关键上下文

- **hooks stdin JSON 字段（deepwiki 确认）**：BaseHookInput 含 session_id/transcript_path/cwd/permission_mode + `agent_id`（仅子 agent）；PermissionRequest 加 tool_name/tool_input；StopFailure 加 error/error_details/last_assistant_message；全部有 hook_event_name。子 agent 正常结束 = SubagentStop（我们未挂，天然不触发）。
- **两轮生成退化插曲**：本批 Edit 两度写入损坏 token（`printf_placeholder`、`主:` 乱码、`AgentTuiStatusContextFields` 幽灵标识符）——均已当场发现修复；写入大段代码后必须 Read 回读核对。
- **probe-session-mode.mjs 已升级**：3.5 步断言 hook JSON（非 token）、4/5 步 JSON 主路径 + 旧 token fallback 验证；fallback 验证结尾必须回到 done（否则后续「切回 chat」撞 409）。
- **⚠️ bun --watch 不因「新建文件」触发重启**；改 api 后交付前必须 `respawn-pane -k -t ar-dev:0` 并验证新代码生效。
- **api 全量 test 偶发 1 fail**（agent-tui fs.watch 时序 flaky，重跑绿）。
- **api runDir** = `/run/user/1000/agents-remote/`；agent-status/ 是 TUI hooks 瞬时 JSON 文件（1MB 读上限），sessions/ 是权威 metadata。
- **探针跑法**：`systemd-run --scope --user -p MemoryMax=2G bun …`；探针用 bun 不用 node；编辑一律内置 Read/Edit/Write。
- **tmux**：`ar-dev:0` = api、`ar-dev:1` = web；标准重启 `respawn-pane -k`；绝不 kill server。

---
最后更新：2026-10-19 16:52（触发原因：TUI hooks 结构化采集 + 子 agent 过滤 commit 3151b0b 落地，探针/e2e/门禁全绿）
