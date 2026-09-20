# 下一步行动（Next Actions）

> 按 context 分组的可执行动作。**每次开干前先看这里**，确保实现环节不走偏。完成则勾选，定期清理。

## @ui-v2（项目卡：projects/ui-redesign-v2.md；总纲：docs/design/redesign-v2.md）

- [x] **M0 设计基座**（2026-09-20 完成）：①v1→v2 token 映射表（总纲附录）②`scripts/ar-verify-tokens.mjs`（report 基线 HEX 15/色阶 0，全为已知 M1 项）③e2e 基线 29/29 绿（cgroup 2G）
- [x] **M1 组件化层**（2026-09-20 完成，commit `ba8ddca`）：v2 token 底座（:root dark 基准 + data-theme 双主题 + v1 桥接）+ `v2-primitives.css` 原语 1:1（`.grow`→`.growrow`）+ 29 图标重绘 + Geist 移除；探针 61/61、e2e 29/29、design-reviewer 复审通过（首轮 2 高 2 中 4 低全修）
- [x] **M2 IA 骨架**（2026-09-20 完成，commit `2a4d9e1`）：移动 4 Tab（D21）+ 桌面 Sidebar 换代（ActivityBar→`sidebar.tsx` 250px）+ L0 登录页对齐 06 原型 + D4「直达上次位置」跳板；深度模型判定现有路由树已满足；3 行骨架留 M3。**e2e 基线修复**（登录文案 + D21 IA 变更曾致 29/29 全红 → 适配后 29/29 绿）。探针 20/20 + 61/61；四门禁全绿
- [x] **M3 主页对齐**（2026-09-21 完成，未 commit）：M3-a 项目 Tab + M3-b 三行骨架 + M3-c 工作台逐状态 + M3-d 流内容（turn 终态四件套 + .tray）；design-reviewer「修复后通过」；探针 23+21+24 全绿；范围裁决见总纲 §6.1
- [x] **M4 工具与深度页**（2026-09-21 完成，未 commit）：三工具态（MobileGitTool/FilesTool/WikiTool，ticon .hl + gitchip/crumb/wsearch chip）+ 六个 L3 组件（file preview/git diff/history/commit/branches/wiki reader，双通道：显式子路由不写 layout + 保活层分流）+ D13 wiki 注入（stdin prompt + workbenchWikiRefsAtom + refnote/引用卡）+ 服务端 R7a/R7b commit 详情端点 + log 分页；探针 37/37；记档 8 条见总纲 §6.3
- [ ] M5 浮层与审批（sheet/popover 体系 + 服务端聚合审批中心，security-reviewer 必过）→ M6–M10（范围见总纲 §6，随进度逐个展开成动作）

## @harness

- [x] **harness 改造收尾验证**（2026-09-19，完成）——三项实测全过：①重启会话，SessionStart 注入 KB 级 current.md（非旧版 589KB）；②`/handoff save` 实测通过（快照 20260919-0317 已归档）；③`/gtd inbox` 实测通过（追加捕获条目后自清理）。（hook 单测 + 四门禁已过，commit `db5b0fd`）
- [x] **memory 清理**（2026-09-19，完成）——13 条 workflow 体系记忆（workflow_intents_* / workflow_skill_* / describe_project_* / first_roadmap_* 等）归档至 `memory/archived-20260919/`（可恢复；移出 MEMORY.md 索引即不再被加载），同步清理 3 处交叉引用；跨项目工程铁律类记忆（single-pipeline / no-screenshot / commit 纪律等）全部保留。
