# 下一步行动（Next Actions）

> 按 context 分组的可执行动作。**每次开干前先看这里**，确保实现环节不走偏。完成则勾选，定期清理。

## @ui-v2（项目卡：projects/ui-redesign-v2.md；总纲：docs/design/redesign-v2.md）

- [x] **M0 设计基座**（2026-09-20 完成）：①v1→v2 token 映射表（总纲附录）②`scripts/ar-verify-tokens.mjs`（report 基线 HEX 15/色阶 0，全为已知 M1 项）③e2e 基线 29/29 绿（cgroup 2G）
- [ ] M1 组件化层（token 换底 + components.css 原语 + 图标移植 + data-theme 双主题 + 移除 Geist）
- [ ] M2 IA 骨架（移动 4 Tab + 桌面 Sidebar + L0 登录 + 深度模型 + 工作台 3 行骨架）
- [ ] M3–M10（范围见总纲 §6，随进度逐个展开成动作）

## @harness

- [x] **harness 改造收尾验证**（2026-09-19，完成）——三项实测全过：①重启会话，SessionStart 注入 KB 级 current.md（非旧版 589KB）；②`/handoff save` 实测通过（快照 20260919-0317 已归档）；③`/gtd inbox` 实测通过（追加捕获条目后自清理）。（hook 单测 + 四门禁已过，commit `db5b0fd`）
- [x] **memory 清理**（2026-09-19，完成）——13 条 workflow 体系记忆（workflow_intents_* / workflow_skill_* / describe_project_* / first_roadmap_* 等）归档至 `memory/archived-20260919/`（可恢复；移出 MEMORY.md 索引即不再被加载），同步清理 3 处交叉引用；跨项目工程铁律类记忆（single-pipeline / no-screenshot / commit 纪律等）全部保留。
