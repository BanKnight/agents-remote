---
name: handoff
description: 保存/恢复 agent 工作状态，防 compact 丢上下文。子命令 save（更新 current.md 并归档快照）、restore（读 current.md）、list（列历史快照）。在里程碑、收尾、感知将 compact 时用 save；恢复时用 restore。
---

# handoff — 上下文接力（Loop 命脉）

## /handoff save

1. 把当前 session 的关键状态整理写入 `.claude/handoff/current.md`，覆盖以下小节：
   - 一句话状态
   - 本 session 焦点
   - 关键决策（本阶段不可丢）
   - 进度（已完成 / 进行中 / 待办）
   - 阻塞 / 风险
   - 易丢的关键上下文
   - 末尾：最后更新时间 + 触发原因
2. 写入前，先把现有 current.md 复制归档到 `.claude/handoff/snapshots/<YYYYMMDD-HHMM>.md`。

## /handoff restore

- 读 `.claude/handoff/current.md`，向用户复述当前状态与下一步，确认衔接。
- SessionStart hook 会自动注入；本命令用于手动恢复。

## /handoff list

- 列出 `.claude/handoff/snapshots/` 下的历史快照（时间 + 一句话状态首行），供回溯。

## 何时 save

- 完成一个 next-action / 到达里程碑 / 阶段收尾 / 用户切换话题 / 感知 context 接近上限。
- 详见 `.claude/rules/agent-workflow.md`。
