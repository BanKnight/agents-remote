# Turn 级 checkpoint 与回滚（回滚到这条消息）交互设计稿

> 状态：**v1.0 已实现（2026-11-14）**，待真机验收。本稿为 checkpoint × 回滚交互契约单源
> （索引见 `docs/design/index.md`）。来源：T3 Code 调研学习点③（`docs/research/t3code.md`）
> + 能力边界调研（`docs/research/native-checkpoints.md`）。

## 1. 痛点（现状取证）

agent 改文件后，用户想「撤销这一轮」时没有任何锚点：

- 四家目标 runtime 没有一家能做完整工作区快照——Claude 原生 `rewind_files` 只跟 CLI 编辑
  工具触达的文件（Bash / 手写 / 子 agent / 后台任务全不覆盖），Codex/omp/ACP/pi 连文件级
  都没有（详见 `native-checkpoints.md` §2）；
- git 本身不是答案：工作区常带用户自己的 dirty 改动，agent 的提交行为不可控（可能 commit、
  可能 amend、可能什么都不做），`git reset` 无法定位「这一轮之前」；
- 对话侧：CLI 有 `/rewind`，但入口在 CLI 内、用户此刻在网页端；且它不带工作区快照。

目标：**每个 turn 前后各打一份完整工作区快照**，让用户在任意一条用户消息上看到「这一轮
改了什么」，并把工作区（及对话）恢复回那一刻。

## 2. 语义定义（与既有概念划界）

| 概念 | 语义 | 现状 |
| --- | --- | --- |
| **turn** | 一条用户消息触发的完整 agent 工作单元（beginTurn → result） | 已有（状态机） |
| **checkpoint（快照）** | 某 turn 边界的工作区完整树快照（隐藏 git ref） | 本稿 |
| **per-turn diff** | `diff(上轮 endpoint, 本轮 endpoint)`——「这一轮改了什么」 | 本稿 |
| **文件回滚** | 工作区恢复到某 turn 之前（自动先备份当前态） | 本稿 |
| **对话回滚** | 对话历史截断到某条用户消息之前（CLI fork 语义） | 本稿（仅 claude） |
| 原生 `rewind_files` | CLI 自带的文件 rewind（只覆盖 CLI 编辑工具触达的文件） | 不使用（能力不足，见 §6） |

**三条铁律**：
1. **捕获不阻塞对话**：baseline 捕获失败/超时只降级（该轮 diff 相对上一轮 endpoint），
   绝不影响消息投递；
2. **回滚是破坏性动作**：二次确认 + 恢复前自动备份（`restore-backup` ref）+ 循环清理
   未跟踪文件；
3. **refs 即索引，零第二真相**：不建索引文件、不加 SessionMetadata 字段——查询 =
   `git for-each-ref`，随项目 `.git` 走，gc 天然保活。

## 3. 数据与规则

### 3.1 ref 命名与元数据

`refs/ar/checkpoints/<sessionKey>/<ordinal>/<phase>`：

- `sessionKey = sha256(sessionId).hex[:16]`；`ordinal` 从 1 起按会话递增（API 重启后由现有
  refs 最大值 +1 续编）；
- `phase ∈ baseline | endpoint | restore-backup`；
- 元数据 JSON 存 commit message（`ar:1` / `sessionId` / `ordinal` / `phase` / `anchorUuid` /
  `endUuid?` / `stats?` / `isError?` / `at`）；
- 保留策略 `CHECKPOINT_RETENTION_TURNS = 100`：endTurn 后 prune 更早 ordinal 的全部 ref。

### 3.2 锚定：uuid 贯通，不依赖 JSONL

客户端生成 `crypto.randomUUID()` 作为上行 user 帧的 `uuid`；CLI 对自带 uuid 直接采用
（print.ts `enqueue({uuid})`，跨重启按它去重）——同一个 id 同时是 **UI 消息 id、JSONL 消息
uuid、checkpoint 锚**。实时流与历史回放自动对齐，全程不读 CLI 私有文件。

`endUuid` = 本轮最后一条带 uuid 的 stdout 消息（`noteOutputUuid` 采集）——它是**下一轮**
对话回滚的 `--resume-session-at` 截断锚（该参数语义 = `messages.slice(0, index+1)` 含锚，
所以必须取上一条）。

### 3.3 捕获编排（turn-checkpointer）

- `beginTurn`（收到上行 user 帧）：分配 ordinal + 异步 capture baseline；**in-flight 存在时
  跳过**（轮中排队消息归当前 turn，与 CLI 原生 checkpoint 的 "Messages sent mid-turn not
  checkpointed" 语义一致）；
- `noteOutputUuid`：采集最后一条真实消息 uuid（live echo 不经此处，无 synthetic 污染）；
- `endTurn`（result 帧）：capture endpoint（含 endUuid/isError）+ prune；
- `resetSession`（CLI 销毁/respawn）：清 in-flight（残留会让后续 turn 被误判为排队消息）。

### 3.4 回滚目标裁决

「回到这轮之前」= 优先**本轮 baseline**（不回滚其它会话在两轮之间做的改动），缺失降级
**上一轮 endpoint**，双缺 → `CHECKPOINT_NOT_FOUND`。对话锚 = 上一轮 endpoint 的 endUuid；
首轮无前驱 → 开全新会话（不 resume、CLI 自生成新 id 经 system.init 回填）。

### 3.5 恢复语义（restoreTo）

先打 `restore-backup` ref（当前态备份）→ `restore --source <target> --worktree --staged` →
`reset --quiet`（index 退回 HEAD，呈现为未提交修改）→ 循环 `clean -fd ≤ 4 轮`（新
`.gitignore` 可能暴露隐藏文件）。capture 全程用临时 index（`GIT_INDEX_FILE`），不动用户
index/工作区。

### 3.6 能力位解耦

- 文件捕获/回滚：chat 形态恒可（非 git 项目降级为 `repository:false`，入口不出现）；
- 对话回滚：仅 claude chat 形态（`provider !== "claude" || mode === "terminal" ||
  !claudeSessionId` → `CONVERSATION_ROLLBACK_UNAVAILABLE` 400）；terminal 形态有 turn 信号
  但没有上行锚 uuid（用户在 pane 里打字），本版无消息级入口。

### 3.7 错误码

`CHECKPOINT_NOT_FOUND`（目标 ref 缺）/ `CHECKPOINT_NOT_GIT` / `CHECKPOINT_BUSY`（会话
working/blocked，turn 在飞）/ `CHECKPOINT_CONFLICT`（expectedCommit 不符，乐观并发）/
`CHECKPOINT_CAPTURE_TIMEOUT` / `CHECKPOINT_RESTORE_FAILED` /
`CONVERSATION_ROLLBACK_UNAVAILABLE`。

## 4. 交互设计（双端同构）

- **入口**：用户消息 hover 动作条（桌面）/ 动作条（移动）——「查看本轮改动」小按钮，仅当该
  消息锚 uuid 命中某 checkpoint 时渲染；
- **浮层**：桌面 Dialog / 移动 MobileSheet（容器分流，内容同构）：本轮文件列表 + 逐文件
  diff（复用 `DiffContent`）+「恢复文件」「回滚对话」两开关 + 其它 active 会话警示 +
  danger tone 二次确认；
- **结果态**：浮层保持打开，显示回滚完成 + 备份提示 + warnings（对话回滚失败时文件已恢复，
  显式警示不整体报错）；
- **busy 闸**：会话 working/blocked 时浮层内警示 + 回滚按钮禁用（UI 前置拦截，服务端同样
  校验 409）。

## 5. 行为变更（需知晓）

1. 上行 user 帧新增 `uuid` 字段（纯增量）；live echo 的 uuid 从 synthetic 变为真实锚 id；
2. 每个 turn 在项目 `.git` 内产生 2 个隐藏 ref + 1 个临时 index（用完即删）；保留最近 100 轮；
3. claude 会话执行对话回滚会 **fork 出新 claude session id**，旧 JSONL 保留但不再续写
   （与 CLI `/rewind` 同语义）；
4. 回滚是破坏性动作，必须二次确认；同项目其它会话的工作区成果会被一并恢复（服务端在响应
   warnings 里列出它们）。

## 6. 不做（本版明确排除）

- Codex / omp / ACP / pi 的对话回滚（能力位留口，后续按 provider 分档接入）；
- terminal（tmux）形态的消息级回滚入口（只有 turn 信号、没有上行 uuid 锚）；
- redo / 多步撤销、按文件粒度回滚、worktree 隔离恢复；
- 默认开启 Claude 原生 checkpointing（磁盘双份，本机实测 2 会话已 97MB）；原生
  `rewind_files` 的 `dry_run` 只作未来加速路径。

## 7. 拍板结论（2026-11-14）

- 完整闭环（捕获 + diff + 回滚），文件与对话双开；
- 入口在用户消息 hover 动作条；
- 回滚安全策略 = 强确认 + 自动备份 + 循环清理；
- 对话回滚本版只做 claude，其余 provider 留能力位。
