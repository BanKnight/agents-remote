# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-19（harness 改造全部收尾；触发：@harness 两条 next-action 完成）。
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

harness 改造全部完成：新体系（constitution / rules / GTD / handoff / 5 skills / 4 reviewers）提交 `db5b0fd`，三项实测（SessionStart 注入、/handoff save、/gtd inbox）全过，13 条旧 workflow 记忆已归档；等待下一个开发任务。

## 本 session 焦点

harness 改造收尾（已完成）；下一任务由用户指定或看 `next-actions.md`。

## 关键决策（本阶段不可丢）

- handoff 由模型主动 `/handoff save` 维护（写前归档 snapshots/），hook 只做纯 bash cat 注入（SessionStart + PreCompact 双保险）。
- 实测结论：新会话 SessionStart 注入的是 KB 级 current.md（不再像旧 spawn-claude hook 产生 589KB）；`.claude/agents/` 4 个 reviewer 已被系统自动识别为 subagent 类型。
- harness 结构文件入库；`.claude/handoff/snapshots/` 与 `.claude/worktrees/` 不入库；assistant-ui 安装机制的 `observability` symlink 单独 gitignore。
- 旧 workflow 记忆采用「归档而非硬删」：移入 `memory/archived-20260919/`（git 不覆盖的机器目录，手动 mv 可恢复）；删 MEMORY.md 索引即不再加载。

## 进度（已完成 / 进行中 / 待办）

- ✅ constitution + rules（8 文件）+ 3 个 bash hooks + settings.json（PostToolUse oxfmt）
- ✅ GTD 目录 + handoff/current.md + snapshots 归档机制
- ✅ 5 个 skills（handoff/gtd/evolve/onboard/check-deps）+ 4 个 reviewer agents
- ✅ `.workflow/`、13 个 workflow 技能、`scripts/claude-handoff-hook.ts`、`.claude/handsoff/` 删除，docs 耦合清理，提交 `db5b0fd`（四门禁全绿）
- ✅ 新会话重启实证：SessionStart 注入正常（KB 级）；`/handoff save` 实测通过（快照 20260919-0317、20260919-0324）
- ✅ `/gtd inbox` 实测通过（追加捕获条目后按条目自清理规则删除，inbox 净零改动）
- ✅ MEMORY.md 清理：13 条 workflow 记忆归档 `archived-20260919/`，索引删 13 行，3 处交叉引用同步清理
- ⏳ 无进行中；等待下一任务

## 阻塞 / 风险

- 无。

## 易丢的关键上下文

- **旧 handsoff 目录名是拼错的历史产物**（handsoff ≠ handoff），已删除；新目录是 `.claude/handoff/`。
- `web/src/routes/claude-adapter.ts` 中的 `workflowName` 是 Claude CLI 协议字段（`workflow_name`），与已废除的 workflow 技能体系无关，不要动。
- docs 里 ~30 个文件末尾的历史 verify 证据指针指向已删除的 `.workflow/`，断链是有意决策（git 历史可找回），不要逐一"修复"。
- commit 用 `git add && git commit`（禁 `git commit <paths>` 与 `--git-dir`，见 memory git-commit-paths-quarantine-index / git-commit-avoid-explicit-gitdir）。
- 恢复被归档的 workflow 记忆：`memory/archived-20260919/` 里 mv 回上级 + 在 MEMORY.md 补回索引行即可。
