# 下一步行动（Next Actions）

> 按 context 分组的可执行动作。**每次开干前先看这里**，确保实现环节不走偏。完成则勾选，定期清理。

## @harness

- [x] **harness 改造收尾验证**（2026-09-19，完成）——三项实测全过：①重启会话，SessionStart 注入 KB 级 current.md（非旧版 589KB）；②`/handoff save` 实测通过（快照 20260919-0317 已归档）；③`/gtd inbox` 实测通过（追加捕获条目后自清理）。（hook 单测 + 四门禁已过，commit `db5b0fd`）
- [x] **memory 清理**（2026-09-19，完成）——13 条 workflow 体系记忆（workflow_intents_* / workflow_skill_* / describe_project_* / first_roadmap_* 等）归档至 `memory/archived-20260919/`（可恢复；移出 MEMORY.md 索引即不再被加载），同步清理 3 处交叉引用；跨项目工程铁律类记忆（single-pipeline / no-screenshot / commit 纪律等）全部保留。
