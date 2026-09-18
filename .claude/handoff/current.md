# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-19（harness 改造完成）。
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

harness 改造落地：废除 `.workflow/` + 13 个 workflow 技能与 spawn-claude 版 handoff hook，引入 22router 式轻量 harness（constitution + rules + GTD + handoff + 4 reviewer + 3 纯 bash hooks）。

## 关键决策（本阶段不可丢）

- handoff 由模型主动 `/handoff save` 维护，hook 只做纯 bash cat 注入（SessionStart + PreCompact 双保险），不再 spawn `claude -p`。
- harness 结构文件全部入库；`.claude/handoff/snapshots/` 不入库。
- docs 治理保留（`docs/AGENTS.md` + 分层 index + project.md）；运行态一律放 `.claude/`（gtd/handoff），不进 `docs/`。
- `frontend-notes.md` §N 编号是外部锚点，永不删除/重排——该文件保留根目录原位。

## 进度

- ✅ constitution + rules（8 文件）+ hooks（3 个 bash）+ settings.json
- ✅ GTD 目录 + handoff/current.md 初始化
- ✅ 5 个 skills（handoff/gtd/evolve/onboard/check-deps）+ 4 个 reviewer agents
- ✅ `.workflow/`、13 个 workflow 技能、`scripts/claude-handoff-hook.ts`、`.claude/handsoff/` 已删除
- ⏳ 待验证：重启会话实测 SessionStart 注入；`/handoff save`、`/gtd inbox` 实测

## 易丢的关键上下文

- **旧 handsoff 目录名是拼错的历史产物**（handsoff ≠ handoff），已删除；新目录是 `.claude/handoff/`。
- `web/src/routes/claude-adapter.ts` 中的 `workflowName` 是 Claude CLI 协议字段（`workflow_name`），与已废除的 workflow 技能体系无关，不要动。
- docs 里 ~30 个文件末尾的历史 verify 证据指针指向已删除的 `.workflow/`，断链是有意决策（git 历史可找回），不要逐一"修复"。
