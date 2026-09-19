# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-19（对照 22router 复审完成，2 处修复提交 `fa17a51`；触发：用户要求复审）。
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

harness 改造完成并经 22router 对照复审：全部结构到位、精髓保留，复审揪出并修复 PostToolUse hook stdin 协议 bug（原版从不真实触发）与 supply-chain 规则缺口；等待下一个开发任务。

## 本 session 焦点

复审已完成；下一任务由用户指定或看 `next-actions.md`。

## 关键决策（本阶段不可丢）

- handoff 由模型主动 `/handoff save` 维护（写前归档 snapshots/），hook 只做纯 bash cat 注入（SessionStart + PreCompact 双保险）。
- **Claude Code hook 输入走 stdin JSON，无 CLAUDE_TOOL_INPUT/CLAUDE_TOOL_NAME 环境变量**（2026-09-19 探针实证）；22router 的 posttooluse hook 同病未修，用户要求时直接套本项目的 stdin 版。
- harness 结构文件入库；`.claude/handoff/snapshots/` 与 `.claude/worktrees/` 不入库；assistant-ui 的 `observability` symlink 单独 gitignore。
- 旧 workflow 记忆采用「归档而非硬删」：移入 `memory/archived-20260919/`，删 MEMORY.md 索引即不再加载。

## 进度（已完成 / 进行中 / 待办）

- ✅ harness 主体（constitution / rules / GTD / handoff / 5 skills / 4 reviewers / 3 hooks）提交 `db5b0fd`
- ✅ 三项实测（SessionStart 注入、/handoff save、/gtd inbox）+ 13 条旧 workflow 记忆归档，提交 `ee735c5`
- ✅ 对照 22router 复审：修复 posttooluse-format.sh stdin 协议（端到端复测过）+ 补 rules/supply-chain.md（≥7 天门、pre-alpha 换库优先）+ check-deps/security-reviewer/CLAUDE.md 引用闭环，提交 `fa17a51`（四门禁全绿）
- ⏳ 无进行中；可选跟进：22router 的同款 hook 修复（用户未授权，不动）

## 阻塞 / 风险

- 无。

## 易丢的关键上下文

- **旧 handsoff 目录名是拼错的历史产物**（handsoff ≠ handoff），已删除；新目录是 `.claude/handoff/`。
- `web/src/routes/claude-adapter.ts` 中的 `workflowName` 是 Claude CLI 协议字段（`workflow_name`），与已废除的 workflow 技能体系无关，不要动。
- docs 里 ~30 个文件末尾的历史 verify 证据指针指向已删除的 `.workflow/`，断链是有意决策，不要逐一"修复"。
- commit 用 `git add && git commit`（禁 `git commit <paths>` 与 `--git-dir`，见 memory git-commit-paths-quarantine-index / git-commit-avoid-explicit-gitdir）。
- 恢复被归档的 workflow 记忆：`memory/archived-20260919/` 里 mv 回上级 + 在 MEMORY.md 补回索引行即可。
