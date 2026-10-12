# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-12（**反馈② 终端 ⚙ 面板 Apple 换代实现全绿待 commit；①③ 已 commit `527d1b9` 真机清单已交**）

## 一句话状态

真机反馈②（终端设置浮层不符 Apple 设计）重设计已实现收尾：用户拍板「完整换代 + 可用按键语义分组」——tab 条换 `.segc`（role=tablist + aria-selected + .on 白 thumb）、列表换 `.sect` + `.sgroup` inset 卡片 + `.setrow` 44px 行、「可用按键」24 预置键按 editing/nav/fn 三组卡片（行编辑/导航带 readline 语义副文本，F 键不配）、命令表单换 inset grouped 规范（settings-form-classes.ts 五类串单源，settings-dialog 同源复用）。行为零变化（拖拽/显隐/命令 CRUD/双发送/迁移全保留）。探针适配 4 处选择器漂移后 **44/0 ALL PASS**，全门禁 + CSS 闸 + tokens 全绿。**待 commit → 真机清单交用户**。

## 本 session 焦点

### 关键决策（不可丢）

- **零新增 CSS**：全部消费 v2-primitives 既有单源类（.segc :2262 / .sect :1605 / .sgroup :3993 / .setrow :4000 / .kfoot :2635）；toggle 44×26 沿 shell-primitives。
- **容器 margin 中和**：.msheet（padding 0 20px）与桌面 Dialog（p-5）自带内距，`.sect/.sgroup` 单源 16px margin 会双重边距 → 消费点 `[&_.sect]:mx-0 [&_.sgroup]:mx-0`（移动 body + 桌面内滚区两处）。
- **语义分组数据模型**：`PresetTerminalKey` 加 `group: "editing"|"nav"|"fn"` + `descKey?: TranslationKey`；tab+8 Ctrl 系 = editing 带 descKey、PgUp/PgDn/Home/End = nav 带 descKey、F1–F12 = fn 无（行为随宿主程序无通用语义）；i18n 15 键 ×2 语言；单测断言分组完整性。
- **表单原语单源**：`shell/settings-form-classes.ts` 五类串（input/primary/ghost/text/hint）从 settings-dialog 抽出，命令表单复用防漂移。
- **探针适配要点（选择器漂移教训）**：segc 按钮带 `role="tab"` 后 `getByRole("button")` 按 ARIA 角色树不命中（M16 曾挂）；DOM tag 选择器（`.msheet button`）不受影响故 M12 假绿——**改 DOM 角色属性后 getByRole 调用点全量过一遍**。M13 改数非主列表 `ul.sgroup` li（主列表 = `ul.sgroup.select-none`）+ 断言 3 张分组卡；M17/TM3 组标题收集加 `div.sect`。

### 进度

- ✅ console-model.ts（PresetKeyGroup + 24 项 group/descKey）+ 单测分组断言
- ✅ i18n zh/en 各 +15 键（presetGroup×3 + presetDesc×12）
- ✅ settings-form-classes.ts 新建 + settings-dialog.tsx 改 import
- ✅ quick-keys-editor.tsx 重写（segc/sect/sgroup/setrow/分组/switchRow helper；移动 body 与桌面 Dialog 容器不变）
- ✅ quick-commands-tab.tsx 改造（同语言；分组标题 div.sect + 行 setrow + 表单 inset grouped）
- ✅ 探针适配（M13/M14/M17/TM3 + 4 处 getByRole tab）→ 44/0
- ✅ 全门禁 + CSS 闸 + tokens 机检全绿；redesign-v2.md ② 段记档（:1829 起）；handoff save（快照 20261012-0906.md）
- ✅ code-reviewer 复核通过（无 P0；1 P1 + 3 P2 已修并探针 44/0 复绿 + 全门禁复绿）
- ⬜ **commit（下一动作）→ 真机清单交用户**

### 阻塞 / 风险

- 无阻塞。reviewer 若再 API 故障：本批改动面自查已覆盖（重写面行为零变化清单记档于 redesign-v2.md ② 段），照常 commit。

## 易丢的关键上下文

- **② 真机清单（commit 后交用户，同 redesign-v2.md 记档段）**：①⚙ 面板顶部「键盘/命令」白 thumb 分段控件；②键盘 tab「条上按键」inset 卡片 +「可用按键 · 行编辑/导航/功能键」三张分组卡（行带副文本），启用后上浮进主列表；③命令 tab 分组卡片 + 行右 mono 脚本预览 + ＋新建命令；④命令编辑表单内嵌分组卡（删除红字/取消/保存主钮）；⑤移动 sheet 与桌面 Dialog 两端形态一致。
- **①③ 真机清单（已交，等用户复验）**：光标落点击处（多端）/ 撤销重做可用性联动 / 放弃红完成蓝 / 会话边界清栈。
- **写入损坏防御纪律（本 session 实战）**：长中文文本 Edit 曾多次注入垃圾 → 短 ASCII 锚点、小步 surgical Edit、连续两次失败 `git checkout --` 恢复重做、每步 grep 特征词（`rg "Pentium|triplicated|removed-placeholder|partial line"` sweep 建 clean）。
- vite watch 漏 CSS：改 web 包后 touch web/src/main.tsx 重建 + `node scripts/ar-verify-css.mjs`（本轮已做）；探针用 bun 跑（勿 node）+ systemd-run 2G。
- 历史挂起真机清单：任务 A 5 条（sheet 手势分档，snapshots/20261011-2017.md）、设置二级 5 条、第二轮重写版 5 条。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-12 09:06 后；触发原因：反馈② 实现收尾记档 + handoff 滚动，commit 前检查点
