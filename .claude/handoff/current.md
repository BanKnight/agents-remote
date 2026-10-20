# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-20 13:32（MCP Apps 阶段 0-3 全部提交 + 调研主文档汇总提交 + reviewer 审查进行中）

## 一句话状态

**MCP Apps 阶段 0-3 全部落地提交完毕**：`9ec70ab`（阶段 0 保留名守卫 + mcpInject 投影）→ `5975eec`（阶段 2 ar-hub 扩 ui + wiki_read_page display tool）→ `0de7979`（阶段 3 宿主 MVP：web 卡片 + api 回源路由，含提交拆分——composer hunk 精确留在工作区）→ `bd24a55`（调研主文档 `docs/research/mcp-apps-hosting.md` §1-§10 + 两份深素材 notes）。全门禁绿（api 1016 / shared 10 / web 848）。code-reviewer + security-reviewer 后台审查阶段 3 中。**待用户真机验证**：test 项目（wiki+ui 双开已就绪）创建 claude 会话让 agent 调 `wiki_read_page` 看卡片渲染。composer 第二次埋点批仍挂起工作区**刻意不提交**。

## 本 session 焦点

### 关键决策（不可丢）

- **MCP Apps 落地总纲（用户拍板）**：「调研完之后就开始落地，除非有需要我拍板的内容否则就全部逐个按里程碑全部实现」。阶段 4（反向 tools/call + ui/message → composer）按需、阶段 5（SEP-2640）等上游。
- **五项架构决策（已记录主文档 §8）**：① ext-apps SDK vs 手写桥 → MVP 手写 JSON-RPC 桥（观察者宿主桥面极小，单 notification；SDK 2.x peer 冲突阶段 4 再评估）；② 双 iframe vs 单层沙箱 → 单层 `sandbox="allow-scripts"`（资源是自家系统模板无第三方篡改面；无 allow-same-origin = opaque origin 无回传面）；③ UI 关联判定 → display tool 名单 + kind 双条件（CLI 不透传 `_meta`）；④ ui-resource 路由 → api 进程内 `HUB_UI_RESOURCES` 单源表直读（hub 与 api 同进程、hub 恒 loopback）；⑤ skills 分发 → 阶段 5（三家 CLI 均无 client）。
- **阶段 3 web 数据流全链（已实现）**：hub tool result structuredContent → CLI user 帧顶层 `tool_use_result` envelope（唯一通道，S1 实测 text content 会被文本化降级）→ normalizeChatStream 挂 `part.structuredResult`（既有管道）→ renderChatStream 仅当 envelope 带 structuredContent 键时投影进卡片 metadata（普通 Bash envelope 无此键 = 零增量）→ `HubWikiPageToolUI` kind 守卫 → `McpAppCard` iframe srcdoc + postMessage `ui/notifications/tool-result`。
- **循环依赖解法**：renderer 壳 `HubWikiPageToolUI` 留在 tool-ui-registry（registry → mcp-app-card 单向依赖）；mcp-app-card.tsx 禁 import registry（曾踩 TDZ：registry 模块体 set 时 mcp-app-card 未初始化完）。
- **postMessage 细节**：srcdoc iframe opaque origin → targetOrigin 必须 `"*"`；load 后发（onLoad 置 loadedRef + structuredContent 变化 effect 重发，load 前 effect 跳过）。
- **保留名守卫（阶段 0）**：`isReservedMcpName` = `name === "ar-hub" || name.startsWith("ar-")`；`ar.wiki`/`archive-tools` 不在保留域（`ar-` 是连字符）。
- **CLI 注入机制（活体实测）**：Claude `--mcp-config` 同名合并 = flag 全赢整条替换（劫持不可能，守卫第二道防线；enterprise managed-mcp.json 存在时 flag 注入 exit(1)）；Codex `-c` 深合并（snake_case `structured_content`）；ZCode 只能预写配置文件（注入无保障需冲突检测）。
- **composer 抬高 bug（2026-10-19）**：「第二次埋点」（1s 心跳 + 全量序列）挂起工作区等真机长期观察，**不提交**。

### 进度

- ✅ 阶段 0（`9ec70ab`）→ 阶段 2（`5975eec`）→ 阶段 3（`0de7979`）→ 调研主文档（`bd24a55`）
- ✅ Spike S1-S4 全闭环（主文档 §9；S1 关键：`structuredContent` 原样透传、`_meta` 不透传、CLI 从不 read ui://）
- ✅ 主文档 `docs/research/mcp-apps-hosting.md` §1-§10 + `mcp-apps-spec-notes.md` + `mcp-cli-ecosystem-notes.md` + index.md 条目
- ✅ 交付 checklist：ar-verify-css ✓、CSS content-type text/css ✓、touch main.tsx rebuild 后 `h-[420px]` utility 落盘 ✓
- ⏳ code-reviewer + security-reviewer 审阶段 3（后台运行中，结论待消化）
- ⏳ 真机验证清单待交用户（见待办）

### 待办

- **真机验证（唯一无法自动化收尾部分）**：test 项目 `/home/deploy/workspace/test/.agents-remote/mcp.json` 已 `{wiki:true,ui:true}` 双开——创建 claude 会话让 agent 调 `wiki_read_page` 验证卡片渲染（标题/tags/markdown 列表）+ 回退路径（ui 关项目旧回放显「应用视图不可用」）；双端（移动/桌面）。
- **TUI hooks 批真机长期观察**（旧批）：① 子 agent 出错/完成不再红点+push；② 主 turn 通知照常；③ blocked push 带工具名
- 历史挂起：推送通知跳转偶发失败（等第一手数据）
- **挂起批（工作区，刻意不提交）**：composer 第二次埋点（api/src/index.ts inset-report hunk、web/src/lib/keyboard-inset.ts + test、use-composer-inset-debug-badge.ts）等真机数据
- 阶段 4 按需启动（届时评估 ext-apps SDK + Codex snake_case 分支）；阶段 5 等上游 CLI

## 易丢的关键上下文

- **生成层损坏对策（本段 8 次事故结晶）**：长内容+中文注释混合易坏；小步 Edit + 纯英文骨架 + 每次写入后 `rg "placeholder|broken|占位|GARBAGE"` 校验。连续两次写入失败就停。
- **提交拆分手法**：混合 hunk 用 `git diff` 导出 + awk 过滤目标 hunk + `git apply --cached` 精选 stage；提交本体用标准 `git add && git commit`。
- **subagent 成果丢失裁定**：4 个细粒度 CLI 调研 subagent 成果丢失于 session 压缩且未落盘（ListAgents 证实不可达）——已有素材（S1 一手 + 两份 notes 89KB）足够支撑主文档，CLI 深挖在主文档「待补」标注，阶段 4/5 需要时重跑。
- **bun 解析全局 playwright 1.64.1**（要 chromium-1248，缓存只有 1223）→ 探针 import 改 `from "@playwright/test"` 且放项目 scripts/ 下临时跑（`_diag-` 纪律用后删）。
- **MCP 面板错误呈现机制**：前端直接显示服务端 `error.message`，无按 code 的 i18n 映射——新增错误文案写服务端 message 即可。
- **capabilities 投影**：`/api/agent-providers` 的 `capabilities.mcpInject` 是注入能力唯一单源。
- **⚠️ bun --watch 不因「新建文件」触发重启**；api 改动交付前 `respawn-pane -k -t ar-dev:0`。
- **探针跑法**：`systemd-run --scope --user -p MemoryMax=2G bun …`；探针用 bun 不用 node；编辑一律内置 Read/Edit/Write。
- **tmux**：`ar-dev:0` = api、`ar-dev:1` = web；标准重启 `respawn-pane -k`；绝不 kill server。

---
最后更新：2026-10-20 13:32（触发原因：MCP Apps 阶段 0-3 提交链完成 + 主文档汇总 + 里程碑 handoff）
