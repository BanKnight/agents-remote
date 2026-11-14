# 原生 checkpoint / 回滚能力调研（claude / codex / omp / ACP / 参考实现）

> 调研时间：2026-11-14。目的：为「turn 级工作区 checkpoint（git 隐藏 refs）+ 回滚到这条消息」设计定清能力边界。
>
> 证据分级：**【源码】**= 本地仓库/反编译源码一手实证；**【实盘】**= 本机磁盘硬数据；**【官方文档】**；**【社区/弱】**= 第三方转述（弱证据）。
> 版本：本机 Claude Code **2.1.299**；反编译源码 `~/repos/claude-code-sourcemap` 为 **2.1.88**（冲突处以 2.1.299 实盘/二进制为准）。

## 0. 结论速览

| Runtime | 文件级 checkpoint | 对话级回滚 | 一句话 |
| --- | --- | --- | --- |
| **Claude Code** | ✅ 原生 `/rewind` + headless `rewind_files`（**有重大盲区**，见 §1.5） | ✅（TUI 菜单 / SDK `resumeSessionAt`） | 唯一有原生文件回滚的 runtime，但只覆盖 CLI 编辑工具改过的文件 |
| **Codex** | ❌ 无 | ⚠️ app-server `thread/revert`（仅对话，schema 明写 "does not revert local file changes"） | 文件回滚必须自建 |
| **omp** | ❌ 无（`checkpoint`/`rewind` 工具是**上下文折叠**，文档明说不调 git、不落文件快照） | ⚠️ session 分支（无对外 RPC） | 文件回滚必须自建 |
| **ACP** | ❌ 协议无 | ❌ 协议无 | 文件回滚自建；对话回滚无信号 |
| **pi** | ❌ 内核无（仅 example 扩展 `git stash`） | ⚠️ session fork | 官方文档建议用户自己用 git |
| **remodex**（第三方 Codex 移动桥） | ✅ **已自造隐藏 git refs**（turn 级） | ❌ | 反证「Codex 桥自己造」 |
| **T3 Code**（参考实现） | ✅ 隐藏 git refs | ✅ adapter 层（claude/codex） | 我们的主要参考：两能力位解耦 |

**核心判断**

1. **文件级 checkpoint 与 provider 无关**：四家目标 runtime 没有一家能替我们做完整工作区快照（claude 原生覆盖不全，其余全无）。控制面自建 git refs 是唯一统一方案，remodex / T3 Code 都是这么做的。
2. **对话级回滚才是 provider-specific**：claude / codex 可做，omp / ACP 只能降级。
3. **claude 原生 headless 文件回滚可用**（`rewind_files`，可 `dry_run` 预检）——不是「通道断了」；但它的覆盖范围（仅 CLI 编辑工具触达的文件）不足以当权威，只宜作快速路径/预检。

---

## 1. Claude Code 原生 checkpoint（2.1.299 / 源码 2.1.88）

### 1.1 触发时机

**每个「开启一轮的用户消息」提交后、跑 query 前**创建 pre-turn 快照，粒度 = 每轮一条用户消息。工具级只在文件被 Write/Edit/NotebookEdit 改动前单独备份该文件新版本。turn 结束时**不**额外建快照；轮中排队的消息不单独建 checkpoint（官方 Limitations："Messages sent mid-turn not checkpointed"）。

- 【源码】`utils/handlePromptSubmit.ts:525-537`（交互）、`QueryEngine.ts:641-652`（headless：`fileHistoryEnabled() && persistSession`）、`screens/REPL.tsx:3093-3099`（初始消息）
- 【源码】工具级：`tools/FileEditTool/FileEditTool.ts:431-437`、`FileWriteTool.ts:255-260`、`NotebookEditTool.ts:311-316`、`BashTool.tsx:392-393`（仅模拟 `sed -i` 路径）

### 1.2 存储格式

**布局**：`${CLAUDE_CONFIG_DIR:-~/.claude}/file-history/<sessionId>/<hash16>@v<N>`

- `<hash16>` = `sha256(文件**绝对路径**).slice(0,16)` —— **不是内容 hash**（实盘 44008 条 `trackedFileBackups` 对账 100% 命中绝对路径 hash，相对路径仅小比例命中）。【源码】`utils/fileHistory.ts:725-731,733-741`；【实盘】两会话 JSONL × 目录对账。
- `@vN` = 每文件独立版本号；**v1 = 首次被跟踪时的编辑前内容**。一个 checkpoint = 一张「文件路径 → 版本号」映射。
- **无 manifest/索引文件**（会话目录里除 `@v` 文件外 0 个文件）；索引在会话 JSONL 里（append-only）：
  - `{"type":"file-history-snapshot","messageId":"<用户消息uuid>","snapshot":{"trackedFileBackups":{...}},"isSnapshotUpdate":false}`——`backupFileName: null` = 该版本时文件不存在（回滚时据此删除）。【源码】`utils/sessionStorage.ts:1085-1098`
  - **2.1.299 新增 `file-history-delta`**（2.1.88 源码无；二进制含该串）：`{type:"file-history-delta", messageId:<assistant uuid>, snapshotMessageId:<用户消息uuid>, trackingPath, backup:{...realParentDir}}`——疑似用 append-only delta 替代整表重写；精确合并算法**待核实**（强推断）。【实盘】e9d9 会话 126 snapshot + 168 delta、`isSnapshotUpdate` 0 条。

**容量 / 保留**

- 官方当前文档：保留**最近 100 个 checkpoint**；丢弃时删「不再被引用」的快照文件，**唯保留每文件第一个快照**（VS Code 扩展做 session diff 基线）；会话快照随保留期清扫删除，默认 ~**30 天**（`cleanupPeriodDays`），过期回滚会报 `No files were restored`。【官方文档】
- 【源码】`MAX_SNAPSHOTS=100`（`utils/fileHistory.ts:54`，内存层）；30 天整目录清扫 `utils/cleanup.ts:23,305-337`（按会话目录 mtime `rm -rf`）。
- 【实盘】本机 2 个会话：63cb… = 1648 文件 / 76MB / 最大 @v81；e9d9… = 475 文件 / 22MB / 最大 @v58；合计 **97MB**；最大单文件 582KB；无单文件大小 gate（整文件 `copyFile`，`fileHistory.ts:748-798`）。

### 1.3 rewind 语义

**可回滚对象（TUI `/rewind` 菜单，互斥可选）**：`Restore code and conversation`（默认）/ `Restore conversation` / `Restore code` / `Summarize from here` / `Summarize up to here` / `Never mind`。回滚后原 prompt **填回输入框**（不自动重发）。【官方文档】【源码】`components/MessageSelector.tsx:93-120`

**代码恢复 = 覆盖 + 删除（不是整目录还原）**【源码】`utils/fileHistory.ts:537-591`：
- 目标版本有备份 → 内容不同才覆盖（还原权限）；
- `backupFileName: null` → **删除**该文件（回滚点之后新建的会被删）；
- 回滚点之前未被跟踪的文件 → 用其 **v1**；
- **不删**从未被跟踪的文件（Bash/手工创建的）；
- 2.1.216+ 跳过 symlink / hardlink，返回 `skippedLinks` 并警告。

**对话恢复 = 内存截断 + 新分支**（`screens/REPL.tsx:3665-3735`）：`setMessages(prev.slice(0, messageIndex))`、重置 conversationId、恢复该消息的 permissionMode。**JSONL 追加不截断**：旧分支永久留为 orphan（`sessionStorage.ts:3229` 注释），下一条 prompt 才以截断后尾部为父链落盘。**官方已知坑**：回滚后不继续发消息就退出 → 消息会「回来」。

### 1.4 通道可用性（对我们最关键）

**headless / stream-json：可开可机器触发**（修正「通道断了」的旧判断）

- 开关：非交互会话需 `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1`（且未设 `CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING`）；交互会话默认 ON（global config `fileCheckpointingEnabled !== false`，属 `~/.claude.json` 非 settings.json）。【源码】`utils/fileHistory.ts:63-78`、`utils/config.ts:381,615,648`
- 协议触发：`{"type":"control_request","request":{"subtype":"rewind_files","user_message_id":"<uuid>","dry_run":false}}` → `control_response` 含 `{canRewind, error?, filesChanged?, insertions?, deletions?}`（`dry_run:true` 只算 diff 不改盘）。只回**文件**，不回对话。【源码】`cli/print.ts:2995-3005`、`entrypoints/sdk/controlSchemas.ts:311-327`；【官方文档】SDK file-checkpointing
- 独立命令：`CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=true claude -p --resume <s> --rewind-files <user-msg-uuid>`（须 `--resume`、不能同时给 prompt、flag 隐藏于 help 外）。拿 uuid 需开 `replay-user-messages`。

**交互 TUI（tmux 内）**：`/rewind` 是纯本地 UI 命令（`type:'local'`、`supportsNonInteractive:false`），打开 Ink 对话框，**无机器可读输出**；可注入按键但菜单选择/渲染解析不可靠，不宜自动化。

### 1.5 覆盖范围（盲区 —— 决定它不能当权威）

**只跟踪「本次会话中被 CLI 编辑工具实际改动过的文件」**；不扫目录、无 ignore 过滤。

- 会跟踪：Write / Edit / NotebookEdit 改动的文件；Bash 中被解析为 `sed -i` 的模拟编辑。
- **不跟踪**：普通 Bash（`rm/mv/cp`、脚本）创建/修改的文件（除非此前已被工具编辑过）、用户手工编辑、并发会话改动、后台 subagent 编辑（前台 `context: fork` skill 例外）、轮中排队消息。
- 无大小/数量上限；每变化整文件复制。重命名 = 新路径新 hash，旧条目作废。

### 1.6 版本演化

- **v2.0.0（2025-09-29）** 首次上线 checkpoint/rewind（Esc×2、`/rewind`）。
- 2.0.x–2.1.88 之间新增 headless `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING` + 隐藏 `--rewind-files` + `rewind_files` control request（具体版本待核实）。
- **v2.1.216+** 回滚跳过 symlink/hardlink。
- 2.1.88→2.1.299 之间 JSONL 索引改 `file-history-delta`（强推断，具体版本待核实）。

---

## 2. 其它 runtime

- **Codex**：无文件级 checkpoint。有 app-server `thread/revert`（`beforeTurnId`，**仅改持久化对话历史**，schema 原文 "does not revert local file changes"；仅支持 paginated history，legacy 直接报错）。`git_diff_to_remote` 只是展示。社区 issue #11626 索要 `/rewind` 仍未实现，第三方 `snap-back`/`codex-rewind` 打补丁。【源码】`t3code/.../_generated/schema.gen.ts:405-415`、`CodexAdapterV2.ts:8463-8520`
- **omp**：无文件级。其 `checkpoint`/`rewind` 工具是**上下文折叠**（rewind 用 `branchWithSummary` 把 session 树 leaf 移回分支点，追加隐藏 report），文档明写 "does not call git and does not snapshot filesystem state"。`crates/pi-iso`（APFS/btrfs/ZFS/reflink 快照）用于 worktree 隔离，未接 rewind。文件级靠第三方插件。【源码】`oh-my-pi/docs/tools/checkpoint.md`、`rewind.md`、`packages/coding-agent/src/session/agent-session.ts`
- **ACP**：协议方法集（`session/new|load|prompt|set_mode|cancel`、`session/update|request_permission`）**无任何 checkpoint/restore**；`session/load` 只恢复上下文不恢复文件。【官方文档】agentclientprotocol.com/protocol/overview + DeepWiki
- **pi**：内核无；example 扩展 `git-checkpoint.ts`（turn_start `git stash create` → fork 时 `git stash apply`，仅 tracked）。官方 quickstart：「Use git or another checkpointing workflow」。【源码】`pi/packages/coding-agent/examples/extensions/git-checkpoint.ts`
- **remodex**（第三方 Codex 桥，已实现）：`refs/remodex/checkpoints/<threadKey>/{message-start,turn-start,turn,restore-backup}/<id>`；临时 `GIT_INDEX_FILE` → `read-tree HEAD` → `add -A` → `write-tree` → `commit-tree`（**无 parent**）→ `update-ref`；恢复 = 预览（affected/staged/untracked）→ 显式确认 → 校验 `expectedTargetCommit` → 先给当前态打 backup → `git restore --source … --worktree --staged` + `git clean -fd` + `git reset`。sendTurnStart 时 await pre-turn checkpoint。【源码】`remodex/phodex-bridge/src/workspace-checkpoints.js`、`CodexService+WorkspaceCheckpoints.swift`

---

## 3. T3 Code 参考实现（我们最接近的先例）

### 3.1 存储与命名
直接复用项目自己的 `.git`（非 shadow repo、非文件快照）：临时 index + git plumbing 造 commit 对象，隐藏 ref 保活。ref 形如 `refs/t3/orchestration-v2/checkpoints/<base64url(sha256(scopeId)[:32hex])>/ordinal/<n>`。【源码】`CheckpointService.ts:26,154-163`

### 3.2 锚定单位：per turn，且**双端基线**
- turn 开始前 `captureBaseline(ordinal-1)`（**5s 预算**，超时降级「本轮无基线」不阻塞 agent）；
- turn 结束（finalize）捕获 endpoint `ordinal`；
- per-turn diff = `diff(checkpoint_{n-1}, checkpoint_n)`。
- scope 层级：`root_run / subagent / tool / provider_thread / manual`，支持 nested（side chat 共享父 worktree 时只记 missing、不碰 git）。
【源码】`RunExecutionService.ts:966-978`、`CheckpointCaptureService.ts:102-121`、`packages/contracts/src/orchestrationV2.ts:958`

### 3.3 plumbing
捕获：临时 `GIT_INDEX_FILE` → `read-tree HEAD` → `git add -A -- .` → `write-tree` → `commit-tree <tree> -p HEAD` → `update-ref`。
恢复：`git restore --source <commit> --worktree --staged -- .` → `git reset --quiet -- .` → `git clean -fd -- .`（**循环 clean 最多 4 轮**，处理「新 .gitignore 暴露隐藏文件」）。【源码】`GitVcsDriver.ts:1320-1500+`

### 3.4 语义与能力位
- `CheckpointRollbackService.execute({ restoreFiles?: boolean })`：默认文件+对话都回；`restoreFiles===false` 只回对话（checkpoint `missing` 也允许）。
- 顺序：先 provider `rollbackThread` → 再文件 restore → 删 stale refs。
- 运行中 turn 禁止回滚；失败仅 Git index lock 单独提示。
- 能力位：`appCanCheckpointFilesystem`（应用层恒可）、`providerCanRollbackConversation`（claude/codex true）。
【源码】`CheckpointRollbackService.ts:224,338-345`、`ClaudeAdapterV2.ts:544-549,13515-13570`、`CodexAdapterV2.ts:332-337`

### 3.5 安全边界
- **文件恢复只允许 isolated worktree**：检查 worktree 与 scope cwd 相同/被其它 thread 共享 → 拒绝，提示「只回对话」。
- `withWorkspaceLease` + restore reservation 串行化 rollback 与 turn start/清理；rollback 后 thread row 加锁。【源码】`CheckpointRestoreSafety.ts`

### 3.6 UI
用户消息行「Edit from here」→ 对话框两按钮：「Revert files too」（checkpoint ready 才可用）/「Revert and keep changes」；确认后回滚并把该消息 prompt+attachments 放回 composer（不自动重发）。DiffPanel 有 per-turn 档。【源码】`useTimelineRewind.ts:90-170`、`ChatOverlayHosts.tsx:192-245`、`DiffPanel.tsx:307-370`

### 3.7 取舍
checkpoint commit 以 HEAD 为 parent（保留 HEAD 轨迹）；baseline 5s 超时降级不阻塞；不支持 redo；rollback 后旧 refs 标 stale/删除。

---

## 4. 对本项目设计的直接输入

### 4.1 两个能力位必须解耦

- **文件级 checkpoint（git refs）**：provider 无关，控制面恒可做（对应 T3 的 `appCanCheckpointFilesystem`）。
- **对话级回滚**：provider-specific，能做就做，不能做就降级为「只回文件 + 在对话里标记/开新会话」。

各 provider 的 turn 边界信号与对话回滚手段：

| Provider | turn 结束信号 | 对话回滚手段 | 备注 |
| --- | --- | --- | --- |
| claude | stream-json `result` / 状态机 done | SDK `resumeSessionAt` / `forkSession`；或原生 `/rewind`（TUI） | 信号最强 |
| codex | rollout `task_complete` / app-server turn 事件 | app-server `thread/revert`（仅 paginated） | 文件回滚自建 |
| omp | session JSONL `turn_end` / `agent_settled` | 内部 `branchWithSummary`（**无对外 RPC**） | 建议只做文件回滚 |
| ACP | `session/prompt` 结束 + `session/update` | **无** | 只能文件回滚 + 新会话 |

### 4.2 与 claude 原生 checkpoint 的冲突矩阵（必须设计防御）

1. **用户在 tmux 里手动 `/rewind`**：绕过控制面直接改盘 + 改变 CLI leaf 分支 → 我们的 ref 时间线过期。防御：检测 `~/.claude/file-history/<sessionId>` 新条目 / 工作区 hash 变化 → 标 stale 或重建基线。
2. **双回滚竞争**：若同时开原生 SDK checkpointing 又用 git checkout 回滚，两者写同一批文件。**必须指定唯一「回滚执行者」**。
3. **磁盘/IO 双份**：本机 2 会话已 97MB；给所有 headless 会话默认开原生 checkpointing = 每轮整文件复制，与 git 快照叠加双份。建议我们自己的 headless 会话**默认不开**原生 checkpointing。
4. **保留期不一致**：原生 30 天 / 100 条后回滚可能失败；UI 若暴露「原生可回滚」要在边界降级提示。
5. **hash 基于路径**：重命名 = 新条目；按路径缓存会失效。

### 4.3 建议定位（已拍板并落地，契约见 `docs/design/checkpoint-rollback.md`）

- **terminal/tmux 形态**：原生 `/rewind` 保留为用户本地能力，我们侧视为「外部工作区变更事件」，检测到即失效/重建基线。
- **chat/headless 形态**：git refs 作**权威完整工作区快照**（覆盖 Bash/手工/子 agent 改动）；原生 checkpointing 默认关，`rewind_files` 的 `dry_run` 可作为「回滚预检」的可选加速路径（若开）。
- **对外能力表述**：不能承诺「回滚所有改动」；原生方案缺 Bash/手工/子 agent，git 方案要处理未跟踪文件与 ignore 边界。

### 4.4 实现要点（T3 + remodex 共识，plan 阶段细化）

1. **双端快照**：turn 开始前 baseline + turn 结束后 endpoint（只捕终点分不清 agent 改动与用户原有 dirty）。
2. **ref 命名**：`refs/ar/checkpoints/<scopeKey>/turn/<ordinal>`（+ `baseline`、`restore-backup`）；scopeKey 用 hash 防非法字符。
3. **捕获 plumbing**：临时 `GIT_INDEX_FILE` + `read-tree HEAD` + `add -A` + `write-tree` + `commit-tree` + `update-ref`，不动用户 index/工作区。
4. **恢复**：`restore --source … --worktree --staged` + `reset` + 循环 `clean -fd`；恢复前打 `restore-backup`；预览 + 显式确认 + `expectedTargetCommit` 乐观并发。
5. **锚定**：以 turn 为单位，UI 映射到该 turn 首条 user message；不按每条消息建 checkpoint。
6. **非 git / 共享工作区**：非 git 项目标 `missing`（仍可对话级）；共享 workspace 只允许对话级或强制确认。
7. **清理**：rollback 后删/标 stale 被丢弃 refs；设 retention。
8. **UI**：回滚 = prompt/attachments 回填 composer（不自动重发）+ 文件/对话可选。

---

## 5. 不确定项（不编造）

1. `file-history-delta` 的精确重建算法（2.1.299 未反编译；语义为强推断）。
2. delta 格式与 headless `rewind_files` 的具体引入版本号。
3. 2.1.299 下「100 checkpoint 上限 + 删除未引用快照」的精确实现。
4. 原生是否有未发现的单文件大小硬上限（2.1.88 无，本机最大 582KB 未触发）。
5. 交互 TUI `/rewind` 在 tmux 注入下能否稳定自动化（未实测，不建议依赖）。
6. remodex 的对话回滚是否完全交给 Codex CLI 原生（源码未见 `thread/revert` 调用）。
7. T3 checkpoint commit 是否需显式 gc 防护（有隐藏 ref 保活，未见显式代码）。
