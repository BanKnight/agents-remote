# 下一步行动（Next Actions）

> 按 context 分组的可执行动作。**每次开干前先看这里**，确保实现环节不走偏。完成则勾选，定期清理。

## @ui-v2（项目卡：projects/ui-redesign-v2.md；总纲：docs/design/redesign-v2.md）

- [x] **M0 设计基座**（2026-09-20 完成）：①v1→v2 token 映射表（总纲附录）②`scripts/ar-verify-tokens.mjs`（report 基线 HEX 15/色阶 0，全为已知 M1 项）③e2e 基线 29/29 绿（cgroup 2G）
- [x] **M1 组件化层**（2026-09-20 完成，commit `ba8ddca`）：v2 token 底座（:root dark 基准 + data-theme 双主题 + v1 桥接）+ `v2-primitives.css` 原语 1:1（`.grow`→`.growrow`）+ 29 图标重绘 + Geist 移除；探针 61/61、e2e 29/29、design-reviewer 复审通过（首轮 2 高 2 中 4 低全修）
- [x] **M2 IA 骨架**（2026-09-20 完成，commit `2a4d9e1`）：移动 4 Tab（D21）+ 桌面 Sidebar 换代（ActivityBar→`sidebar.tsx` 250px）+ L0 登录页对齐 06 原型 + D4「直达上次位置」跳板；深度模型判定现有路由树已满足；3 行骨架留 M3。**e2e 基线修复**（登录文案 + D21 IA 变更曾致 29/29 全红 → 适配后 29/29 绿）。探针 20/20 + 61/61；四门禁全绿
- [x] **M3 主页对齐**（2026-09-21 完成，未 commit）：M3-a 项目 Tab + M3-b 三行骨架 + M3-c 工作台逐状态 + M3-d 流内容（turn 终态四件套 + .tray）；design-reviewer「修复后通过」；探针 23+21+24 全绿；范围裁决见总纲 §6.1
- [x] **M4 工具与深度页**（2026-09-21 完成，未 commit）：三工具态（MobileGitTool/FilesTool/WikiTool，ticon .hl + gitchip/crumb/wsearch chip）+ 六个 L3 组件（file preview/git diff/history/commit/branches/wiki reader，双通道：显式子路由不写 layout + 保活层分流）+ D13 wiki 注入（stdin prompt + workbenchWikiRefsAtom + refnote/引用卡）+ 服务端 R7a/R7b commit 详情端点 + log 分页；探针 37/37；记档 8 条见总纲 §6.3
- [x] **v1.5 批 13–15**（2026-10-08 完成）：批 13 真机反馈 7 条 + 批 14 菜单统一样式（.menu-sep 全宽直线）+ **批 15 全局同构 review 修复批**（4 域审查 → A P1 五项收敛 / B 死代码七项 / C helper 八项，3 commit `cf8ea72`/`659e9c9`/`400a49e`）——修复 4 处行为漂移（重名校验/历史标题/resume trim/close 守卫）+ wiki 桌面 ⋯ 补齐 + spec §4.5 ⋯ 枚举补 wiki 菜单；细节见 redesign-v2.md §6.14 批 13–15 段
- [x] **v1.5 批 16**（2026-10-09 完成，commit `8d06e82`/`dd35ab8`/`7c499eb`/`f7f4c2a`/`6007d15` 已 push）：真机反馈三条——①aux 工具条三钮 Unicode 字符平台字形不一 → Lucide 单轨化（undo-2/redo-2）；②移动检视面板钮 panel-left→panel-right（右滑入形制）；③md 渲染支持 mermaid（CodeBlock 自动渲染：strict 沙箱 + 400ms 流式防抖 + 1500ms 失败宽限闸 + 失败降级 + precache 瘦身 + 断链机检）；双 reviewer 一轮 + 复审二轮消化 + e2e 27/27 补跑全绿 + 记档 §6.14；**真机再反馈（①二次）已修**：图标 14→16px stroke 保真 + `.aux` height `calc(40px + env(safe-area-inset-bottom))` 修 border-box 压缩贴条顶错位（`6007d15`）
- [ ] **批 16 真机复验再反馈项**：等用户 iPhone 复验 aux 条两项（图标清晰 Lucide 风格、居中于工具条交互区不贴顶）；其余 19 条清单已反馈「基本都没问题」
- [ ] M5 浮层与审批（sheet/popover 体系 + 服务端聚合审批中心，security-reviewer 必过）→ M6–M10（范围见总纲 §6，随进度逐个展开成动作）

## @harness

- [x] **harness 改造收尾验证**（2026-09-19，完成）——三项实测全过：①重启会话，SessionStart 注入 KB 级 current.md（非旧版 589KB）；②`/handoff save` 实测通过（快照 20260919-0317 已归档）；③`/gtd inbox` 实测通过（追加捕获条目后自清理）。（hook 单测 + 四门禁已过，commit `db5b0fd`）
- [x] **memory 清理**（2026-09-19，完成）——13 条 workflow 体系记忆（workflow_intents_* / workflow_skill_* / describe_project_* / first_roadmap_* 等）归档至 `memory/archived-20260919/`（可恢复；移出 MEMORY.md 索引即不再被加载），同步清理 3 处交叉引用；跨项目工程铁律类记忆（single-pipeline / no-screenshot / commit 纪律等）全部保留。
