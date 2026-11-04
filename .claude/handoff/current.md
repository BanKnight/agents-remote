# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-04（脱壳批 `ce0aee3` 已 commit + DOM 验证闭环；informational +
> 注入类收编两批 `4d56fc9`/`614b72e`；三批均待 push）

## 一句话状态

**CLI 2.1.299 协议支持三批完成**：`4d56fc9`（informational 正投影）→ `614b72e`
（注入类 8 子类型收编）→ `ce0aee3`（已收编 attachment 脱壳——琥珀容器只留给未处理
subtype）。脱壳已经 resume 回放真实会话 DOM 验证闭环（9 类卡片 0 容器、全页琥珀
气泡 0）。全门禁绿。**三批均待 push（需用户确认外发）。**

## 本 session 焦点

### 关键决策 / 发现（不可丢）

- **脱壳设计（用户拍板「默认气泡 = 未处理」语义恢复）**：SystemChatBubble 通用分支
  判定 `ATTACHMENT_CONFIG[attachmentType]` 有条目 → 无容器轻量行（与 compact-block/
  hook-card 语言一致）；无条目 → 继续落琥珀容器 =「未处理」观察面信号。容器分支
  本身零改动。
- **DOM 验证的达成路径（relay 机制三层墙全部绕过，路径可复用）**：attachment 帧只在
  JSONL、relay 仅 `startedAsResume && claudeSessionId` 才读 JSONL、桌面 stopped
  agent 实例不渲染聊天流、api 不可重启（会杀用户 CLI）。**最终路径 = `POST
  /api/projects/<p>/agent-sessions` body 传 `claudeSessionId` 直接创建 resume 实例**
  → spawn `--resume` → relay 读 JSONL 全量回放 → attachment 帧进 UI。test 项目
  历史会话 e871e63c（14 帧）验证通过，实例用完已关。
- **无 bubble 帧不是漏渲染**：skill_listing → skills stateOps；mcp_instructions_delta
  → mcpServersAdd stateOps；total_tokens_reminder → `{}` 刻意忽略（model-facing）。
  claude-adapter.ts case 表是语义决策单源。
- **桌面历史列表（View session history）行点击不导航**——历史会话在桌面没有只读
  查看器；resume 是唯一回放路径（API 或移动端）。

### 进度

- ✅ `ce0aee3`：脱壳分支（ClaudeSessionDetailRoute.tsx +14/-1）+ resume 回放 DOM
  验证（9 类收编卡片父链 0 容器、amberBubbles=0、卡片可见 67×16）+ 全门禁绿
- ✅ 验证数据清理：unshell-probe 实例、unshell-resume 实例均已 close（test 项目）
- ✅ agent-browser 已 close
- ✅ handoff 归档（snapshots/20261104-unshell-verify.md）

### 阻塞 / 风险

- 无阻塞。工作区剩 `.claude/handoff/current.md` 未提交（随下次收尾一起提）。

## 下一步

1. **push 需用户确认外发**（`1b9ffbf..ce0aee3` 共 4 个 commit：幽灵 blocked 根治 +
   informational 批 + 注入类收编批 + 脱壳批）。
2. 真机验证 checklist 交用户（**重开 PWA 拉新 bundle 后**，用户手机看的就是 resume
   回放路径——「环境信息」等卡片应为**无容器轻量行**，不再是褐色气泡）：
   ①informational 公告 = warning 色提示块；②edited_text_file「磁盘变更」卡含
   rendered 正文；③注入帧 = 可读卡片（icon + badge 摘要 + 折叠正文）；④**已收编
   attachment 卡片无琥珀底容器**（本批核心变化）；⑤未知 subtype 仍是琥珀容器
   （未处理信号，符合预期）。
3. 遗留：v1.7 真机验证清单反馈；wiki/ 目录 git 归属；swap 扩容 2G（仅建议）。
4. 可选优化（已提过等指示）：SW 更新接管后自动 reload 一次。

## 易丢的关键上下文

- **脱壳分支**：ClaudeSessionDetailRoute.tsx SystemChatBubble 内（:1566 区），条件
  `attachmentType && rawData && ATTACHMENT_CONFIG[attachmentType]` → 无容器 return；
  RawDebugTooltip 用 `absolute -top-1 right-0.5`（与 compact-block 一致，勿回退
  right-0.4）。
- **ATTACHMENT_CONFIG 实际键集 28 条**（attachment-bubble.tsx :212-465）：含
  date（非 date_change）、auto_mode、remote_session_change、session_context、
  prompt_snapshot；JSONL 帧 subtype 字段是 `attachment.type`（不是顶层
  attachmentType）。
- **resume 实例创建**：`POST /api/projects/test/agent-sessions` body
  `{provider:"claude", displayName, claudeSessionId}` → resumed 初始态 done；session
  registry 落盘在 `~/.local/share/agents-remote/run/sessions/`（runDir），PROJECTS_ROOT
  = /home/deploy/workspace。
- **informational 投影单链**：shared ClaudeSystemInformational → relay knownSubtypes
  → normalize kind:"informational" → renderChatStream systemMessageType=informational
  → InformationalNotice。
- **ShellIcon SF 名契约**：warning-triangle（lucide triangle-alert 仅生成物 key）。
- api/web 标准重启 = `respawn-pane -k -t ar-dev:0|1`；**不能在用户「优化 remote」
  CLI 运行时重启 api**。
- **大文件扫描工具链**：2G ulimit -v 会挂 bun——用 systemd-run cgroup MemoryMax；
  1.2GB JSONL 用「流式 + 尾 8MB 切片」。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
